import { Router, json } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { h, fail, audit, uid, isUuid, sendCsv, type Db } from "../portal/common.js";
import type { EmailSender } from "../auth/email.js";
import { departmentByKey } from "../config/departments.js";
import { createScanner, type FileScanner } from "../services/fileScan.js";
import { createSponsorshipService, type SponsorshipService } from "../services/sponsorshipService.js";
import { createSponsorshipReview, type SponsorshipReview } from "../services/sponsorshipReview.js";
import { createSponsorshipAwards, type SponsorshipAwards } from "../services/sponsorshipAwards.js";
import { createSponsorshipFollowUp, type SponsorshipFollowUp } from "../services/sponsorshipFollowUp.js";
import type { UploadedFile } from "../services/sponsorshipUtil.js";
import { FILE_RULES, ALL_DOCUMENT_IDS } from "../config/sponsorship.js";

/**
 * Applicants (public):
 *   POST /api/sponsorship            the application, as multipart: its answers as JSON in "data", each document a file part "doc_<kind>"   (5 an hour per address)
 *   POST /api/sponsorship/track      { ref, email }  where it stands, what they may do now, the award once the agreement is sent
 *   POST /api/sponsorship/reply      multipart: "data" = { ref, email, message }, files in any parts: an answer to "more information required"  (10 an hour)
 *   POST /api/sponsorship/report     multipart: "data" = { ref, email, ...the report }, files in any parts: the final report  (5 an hour)
 *
 * Staff (mounted at /api/admin/sponsorship; every change is audited). Allowed: Super Administrators (owner, superadmin) and people approved for the section
 * "Sponsorships and Partnerships". Recording payments and the budget are for owner, superadmin and billing_admin; changing the settings is for owner and superadmin.
 *   GET  /me  /staff  /settings  /budget  /reports/summary  /reports/export.csv  /               what you may do; who can be assigned; weights and limit; money; reports; the list
 *   GET  /:ref  /:ref/documents/:id  /:ref/award/letter.pdf  /:ref/award/agreement.pdf          one application; a file; the award letter and the agreement
 *   POST /:ref/status  /:ref/assign  /:ref/award  /:ref/agreement  /:ref/milestones  /:ref/milestones/:id  /:ref/payments  /:ref/reports/:id/review
 *   PUT  /settings   /:ref/score          DELETE /:ref/milestones/:id          POST /retry
 */
const SUPER_ROLES = ["owner", "superadmin"];
const FINANCE_ROLES = [...SUPER_ROLES, "billing_admin"];
const REF = /^SP-[A-Z2-9]{6}$/;

export interface Sponsorship { svc: SponsorshipService; review: SponsorshipReview; awards: SponsorshipAwards; followUp: SponsorshipFollowUp; publicRouter: Router; adminRouter: Router; retryUnsent: () => Promise<number>; undeliveredCount: () => Promise<number> }

/** The whole sponsorship system from a database and a mailer: server start-up and the tests both build it here, so they cannot wire it differently. */
export function createSponsorship(d: { db: Db; mail: EmailSender; scanner?: FileScanner; env?: NodeJS.ProcessEnv; now?: () => Date; attachLimitBytes?: number; pdfCompress?: boolean }): Sponsorship {
  const scanner = d.scanner ?? createScanner(d.env ?? process.env);
  const svc = createSponsorshipService({ db: d.db, mail: d.mail, scanner, env: d.env, now: d.now, attachLimitBytes: d.attachLimitBytes });
  const review = createSponsorshipReview({ db: d.db, now: d.now, sectionName: departmentByKey("sponsorships")!.name });
  const awards = createSponsorshipAwards({ db: d.db, mail: d.mail, now: d.now, pdfCompress: d.pdfCompress, setStatus: (ref, i) => svc.setStatus(ref, i) });
  const followUp = createSponsorshipFollowUp({ db: d.db, mail: d.mail, scanner, env: d.env, now: d.now, attachLimitBytes: d.attachLimitBytes, forApplicant: (r, e) => svc.forApplicant(r, e), stageOf: (id) => awards.stageOf(id), markCompleted: (id) => awards.markCompleted(id) });
  return { svc, review, awards, followUp, publicRouter: createSponsorshipRouter({ svc, awards, followUp }), adminRouter: createSponsorshipAdminRouter({ db: d.db, svc, review, awards, followUp }), retryUnsent: () => svc.retryUnsent(), undeliveredCount: () => svc.undeliveredCount() };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_RULES.maxBytes, files: FILE_RULES.maxFiles, fields: 5, fieldSize: 512 * 1024, parts: FILE_RULES.maxFiles + 5 },
});
const parse = (req: Request, res: Response, next: NextFunction) => {
  upload.any()(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE" ? `A file is larger than ${FILE_RULES.maxBytes / 1024 / 1024} MB`
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_PART_COUNT" ? `Attach at most ${FILE_RULES.maxFiles} files`
        : "The request could not be read";
      return fail(res, 400, message);
    }
    if (err) return next(err);
    next();
  });
};
const readData = (req: Request): Record<string, unknown> | null => {
  try { const v = JSON.parse(String((req.body as { data?: string }).data ?? "")) as Record<string, unknown>; return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
};
const limiter = (max: number, error: string) => rateLimit({ windowMs: 3600_000, max, standardHeaders: true, legacyHeaders: false, message: { success: false, error } });
const filesOf = (req: Request, kindOf: (f: Express.Multer.File) => string): UploadedFile[] => ((req.files as Express.Multer.File[] | undefined) ?? []).map((f) => ({ kind: kindOf(f), filename: f.originalname, data: f.buffer }));

export function createSponsorshipRouter(d: { svc: SponsorshipService; awards: SponsorshipAwards; followUp: SponsorshipFollowUp }): Router {
  const { svc, awards, followUp } = d;
  const router = Router();

  router.post("/", limiter(5, "You have sent several applications already. Please try again later, or email us."), parse, h(async (req, res) => {
    const data = readData(req); if (!data) return fail(res, 400, "The application could not be read. Please try again.");
    const files: UploadedFile[] = [];
    for (const f of (req.files as Express.Multer.File[] | undefined) ?? []) {
      const kind = f.fieldname.replace(/^doc_/, "");
      if (!f.fieldname.startsWith("doc_") || !(ALL_DOCUMENT_IDS as readonly string[]).includes(kind)) return fail(res, 400, `"${f.originalname}" was attached to a document that this application does not ask for`);
      files.push({ kind, filename: f.originalname, data: f.buffer });
    }
    const r = await svc.submit(data, files);
    if (!r.ok) { res.status(r.status).json({ success: false, error: r.error, ...(r.fields ? { fields: r.fields } : {}) }); return; }
    res.status(201).json({ success: true, data: { ref: r.ref, message: `Thank you. Your reference is ${r.ref}. A confirmation is on its way to your email. VINK reviews applications on a quarterly basis.` } });
  }));

  router.post("/track", limiter(30, "Too many lookups. Please try again later."), json({ limit: "2kb" }), h(async (req, res) => {
    const t = await svc.track((req.body ?? {}).ref, (req.body ?? {}).email);
    const app = t ? await svc.forApplicant((req.body ?? {}).ref, (req.body ?? {}).email) : null;
    if (!t || !app) return fail(res, 404, "We could not find an application with that reference and email address. Check both and try again.");
    const x = await followUp.applicantExtras(app);
    const timeline = [
      ...t.timeline.map((e) => ({ kind: "status" as const, ...e })),
      ...x.replies.map((r) => ({ kind: "reply" as const, status: "reply", label: "You sent more information", at: r.at, message: r.message as string | null })),
      ...x.reports.map((r) => ({ kind: "report" as const, status: `report_${r.status}`, label: r.status === "submitted" ? "Final report sent" : r.status === "accepted" ? "Final report accepted" : "Final report returned for changes", at: r.at, message: r.note })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    res.json({ success: true, data: { ...t, timeline, canReply: x.canReply, canReport: x.canReport, benefits: x.benefits, award: await awards.applicantView(app.id) } });
  }));

  router.post("/reply", limiter(10, "Too many replies. Please try again later, or email us."), parse, h(async (req, res) => {
    const data = readData(req); if (!data) return fail(res, 400, "Your reply could not be read. Please try again.");
    const r = await followUp.reply(data.ref, data.email, { message: data.message }, filesOf(req, () => "additional"));
    if (!r.ok) return fail(res, r.status, r.error);
    res.status(201).json({ success: true, data: { message: "Thank you. We have your reply." } });
  }));

  router.post("/report", limiter(5, "Too many reports. Please try again later, or email us."), parse, h(async (req, res) => {
    const data = readData(req); if (!data) return fail(res, 400, "Your report could not be read. Please try again.");
    const r = await followUp.submitReport(data.ref, data.email, data, filesOf(req, () => "evidence"));
    if (!r.ok) { res.status(r.status).json({ success: false, error: r.error, ...("fields" in r && r.fields ? { fields: r.fields } : {}) }); return; }
    res.status(201).json({ success: true, data: { message: "Thank you. We have your final report and will read it." } });
  }));
  return router;
}

export function createSponsorshipAdminRouter(d: { db: Db; svc: SponsorshipService; review: SponsorshipReview; awards: SponsorshipAwards; followUp: SponsorshipFollowUp }): Router {
  const { db, svc, review, awards, followUp } = d;
  const router = Router();
  const sectionName = departmentByKey("sponsorships")!.name;
  const role = (req: Request) => req.user?.role ?? "";
  const isSuper = (req: Request) => SUPER_ROLES.includes(role(req));
  const isFinance = (req: Request) => FINANCE_ROLES.includes(role(req));
  const nameOf = async (req: Request) => String((await db.query(`SELECT name FROM users WHERE id = $1`, [uid(req)])).rows[0]?.name ?? req.user?.username ?? "Staff");
  /** Super Administrators and people approved for the sponsorship section may read and work applications. Finance staff reach only the budget and payments. */
  const canReview = async (req: Request) => isSuper(req) || (await db.query(`SELECT 1 AS x FROM section_permissions WHERE user_id = $1 AND section = $2`, [uid(req), sectionName])).rows.length > 0;

  const financePath = (req: Request) => req.path === "/me" || req.path === "/budget" || (req.method === "POST" && /^\/SP-[A-Z2-9]{6}\/payments$/.test(req.path));
  const staffGuard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return fail(res, 401, "Sign in first");
      if (isSuper(req)) return next();
      if (isFinance(req) && financePath(req)) return next();                       // finance staff reach the budget and payments without being reviewers, and nothing else
      const ok = (await db.query(`SELECT 1 AS x FROM section_permissions WHERE user_id = $1 AND section = $2`, [req.user.userId, sectionName])).rows.length > 0;
      if (!ok) return fail(res, 403, "You are not approved to work on sponsorships");
      next();
    } catch (e) { next(e); }
  };
  const need = (allowed: (req: Request) => boolean, message: string) => (req: Request, res: Response, next: NextFunction) => (allowed(req) ? next() : fail(res, 403, message));
  const superOnly = need(isSuper, "Only a Super Administrator can do this");
  const financeOnly = need(isFinance, "Only finance staff and Super Administrators can do this");
  router.use(staffGuard);

  const bad = (res: Response, r: { status: number; error: string }) => fail(res, r.status, r.error);
  const refOk = (req: Request, res: Response) => (REF.test(req.params.ref) ? true : (fail(res, 400, "Invalid reference"), false));
  const range = (req: Request) => ({ from: typeof req.query.from === "string" ? req.query.from : undefined, to: typeof req.query.to === "string" ? req.query.to : undefined });

  // ── about the person asking, the people, the settings, the money, the reports ──
  router.get("/me", h(async (req, res) => {
    res.json({ success: true, data: { userId: uid(req), name: await nameOf(req), role: role(req), isSuper: isSuper(req), isFinance: isFinance(req), canReview: await canReview(req), sectionName, settings: await review.settings() } });
  }));
  router.get("/staff", h(async (_req, res) => { res.json({ success: true, staff: await review.staff() }); }));
  router.get("/settings", h(async (_req, res) => { res.json({ success: true, data: await review.settings() }); }));
  router.put("/settings", superOnly, json({ limit: "4kb" }), h(async (req, res) => {
    const r = await review.setSettings(uid(req), req.body ?? {}); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.settings", null, { weights: (req.body ?? {}).weights, approvalLimitZar: (req.body ?? {}).approvalLimitZar });
    res.json({ success: true, data: r.settings });
  }));
  router.get("/budget", financeOnly, h(async (_req, res) => { res.json({ success: true, data: await awards.budget() }); }));
  router.get("/reports/summary", h(async (req, res) => { res.json({ success: true, data: await review.summary(range(req)) }); }));
  router.get("/reports/export.csv", h(async (req, res) => {
    const x = await review.exportRows(range(req));
    await audit(db, req, "sponsorship.export", null, { rows: x.rows.length });
    sendCsv(res, "sponsorship-applications.csv", x.columns, x.rows);
  }));
  router.post("/retry", h(async (req, res) => { const sent = await svc.retryUnsent(); await audit(db, req, "sponsorship.retry", null, { sent }); res.json({ success: true, sent }); }));

  // ── the list and one application ──────────────────────────────────────────
  router.get("/", h(async (req, res) => {
    const q = req.query;
    res.json({ success: true, ...(await svc.list({ status: typeof q.status === "string" ? q.status : undefined, q: typeof q.q === "string" ? q.q : undefined, assigned: typeof q.assigned === "string" ? (q.assigned === "me" ? uid(req) : q.assigned) : undefined, limit: Number(q.limit) || undefined, offset: Number(q.offset) || undefined })) });
  }));
  router.get("/:ref", h(async (req, res) => {
    if (!refOk(req, res)) return;
    const a = await svc.get(req.params.ref); if (!a) return fail(res, 404, "Application not found");
    res.json({ success: true, data: { ...a, ...(await review.assignmentOf(a.id)), review: await review.scoresFor(a.id), award: await awards.forApplication(a.id), replies: await followUp.repliesFor(a.id), reports: await followUp.reportsFor(a.id), mayApprove: (await review.mayApprove(req.params.ref, isSuper(req))).ok } });
  }));
  router.get("/:ref/documents/:id", h(async (req, res) => {
    if (!REF.test(req.params.ref) || !isUuid(req.params.id)) return fail(res, 400, "Invalid document");
    const doc = await svc.document(req.params.ref, req.params.id); if (!doc) return fail(res, 404, "Document not found");
    await audit(db, req, "sponsorship.document", req.params.ref, { document: req.params.id, filename: doc.filename });
    res.setHeader("Content-Type", doc.mime); res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename.replace(/["\r\n\\]/g, "_")}"`);
    res.send(doc.data);
  }));

  // ── deciding ──────────────────────────────────────────────────────────────
  router.post("/:ref/status", json({ limit: "8kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return;
    if ((req.body ?? {}).status === "approved") { const ok = await review.mayApprove(req.params.ref, isSuper(req)); if (!ok.ok) return bad(res, ok); }
    const r = await svc.setStatus(req.params.ref, { status: (req.body ?? {}).status, reason: (req.body ?? {}).reason, applicantMessage: (req.body ?? {}).applicantMessage, by: uid(req) });
    if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.status", req.params.ref, { status: req.body.status, reason: req.body.reason });
    res.json({ success: true });
  }));
  router.post("/:ref/assign", json({ limit: "1kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return;
    const r = await review.assign(req.params.ref, (req.body ?? {}).userId ?? null); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.assign", req.params.ref, { assignedTo: r.assignedTo });
    res.json({ success: true, data: r });
  }));
  router.put("/:ref/score", json({ limit: "4kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return;
    const r = await review.saveScore(req.params.ref, { id: uid(req), name: await nameOf(req) }, req.body ?? {}); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.score", req.params.ref, { total: r.total });
    res.json({ success: true, data: { total: r.total } });
  }));

  // ── the award, the agreement, milestones, payments ────────────────────────
  router.post("/:ref/award", json({ limit: "8kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return;
    const lim = (await review.settings()).approvalLimitZar;
    const r = await awards.award(req.params.ref, req.body ?? {}, uid(req), { limitZar: isSuper(req) ? null : lim }); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.award", req.params.ref, { amount: r.award.amount, currency: r.award.currency });
    res.json({ success: true, data: r.award });
  }));
  router.get("/:ref/award/:file", h(async (req, res) => {
    if (!refOk(req, res)) return;
    const which = req.params.file === "letter.pdf" ? "letter" : req.params.file === "agreement.pdf" ? "agreement" : null; if (!which) return fail(res, 404, "Not found");
    const r = await awards.document(req.params.ref, which); if (!r.ok) return bad(res, r);
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename="${r.filename}"`); res.send(r.data);
  }));
  router.post("/:ref/agreement", json({ limit: "4kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return;
    const r = await awards.agreement(req.params.ref, (req.body ?? {}).action, req.body ?? {}, uid(req)); if (!r.ok) return bad(res, r);
    await audit(db, req, `sponsorship.agreement.${String((req.body ?? {}).action)}`, req.params.ref, { note: (req.body ?? {}).note });
    res.json({ success: true, data: r.award });
  }));
  router.post("/:ref/milestones", json({ limit: "2kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return;
    const r = await awards.addMilestone(req.params.ref, req.body ?? {}); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.milestone.add", req.params.ref, { title: (req.body ?? {}).title }); res.json({ success: true, data: r.award });
  }));
  router.post("/:ref/milestones/:id", json({ limit: "2kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return; if (!isUuid(req.params.id)) return fail(res, 400, "Invalid milestone");
    const r = await awards.updateMilestone(req.params.ref, req.params.id, req.body ?? {}); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.milestone.update", req.params.ref, { milestone: req.params.id, status: (req.body ?? {}).status }); res.json({ success: true, data: r.award });
  }));
  router.delete("/:ref/milestones/:id", h(async (req, res) => {
    if (!refOk(req, res)) return; if (!isUuid(req.params.id)) return fail(res, 400, "Invalid milestone");
    const r = await awards.deleteMilestone(req.params.ref, req.params.id); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.milestone.delete", req.params.ref, { milestone: req.params.id }); res.json({ success: true, data: r.award });
  }));
  router.post("/:ref/payments", financeOnly, json({ limit: "2kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return;
    const r = await awards.addPayment(req.params.ref, req.body ?? {}, uid(req)); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.payment", req.params.ref, { kind: (req.body ?? {}).kind, amount: (req.body ?? {}).amount, reference: (req.body ?? {}).reference }); res.json({ success: true, data: r.award });
  }));
  router.post("/:ref/reports/:id/review", json({ limit: "4kb" }), h(async (req, res) => {
    if (!refOk(req, res)) return; if (!isUuid(req.params.id)) return fail(res, 400, "Invalid report");
    const r = await followUp.reviewReport(req.params.ref, req.params.id, req.body ?? {}, uid(req)); if (!r.ok) return bad(res, r);
    await audit(db, req, "sponsorship.report.review", req.params.ref, { report: req.params.id, decision: (req.body ?? {}).decision }); res.json({ success: true });
  }));
  return router;
}
