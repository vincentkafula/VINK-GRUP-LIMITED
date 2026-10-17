import { Router, json } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { h, fail, audit, uid, isUuid, type Db } from "../portal/common.js";
import type { SponsorshipService, UploadedFile } from "../services/sponsorshipService.js";
import { FILE_RULES, ALL_DOCUMENT_IDS } from "../config/sponsorship.js";

/**
 * POST /api/sponsorship          the application, as multipart: its answers as JSON in the field "data", and each document as a file part named
 *                                "doc_<kind>" (e.g. doc_proposal; several files may share a name) (public)
 * POST /api/sponsorship/track    { ref, email }  where an application stands, for the person who made it (public)
 *
 * Staff (mounted at /api/admin/sponsorship, owner and superadmin; every change is audited):
 *   GET  /                        applications, newest first (?status=&q=&limit=&offset=)
 *   GET  /:ref                    one application with its answers, documents, notes and history
 *   GET  /:ref/documents/:id      download one document
 *   POST /:ref/status             { status, reason, applicantMessage? }  move it on; the reason is kept, the message is what the applicant sees and is emailed
 *   POST /retry                   try again now for applications whose emails did not go
 *
 * The public submit route is limited to 5 applications an hour per address, and a hidden field catches simple bots. The application is stored before any email is sent.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_RULES.maxBytes, files: FILE_RULES.maxFiles, fields: 5, fieldSize: 512 * 1024, parts: FILE_RULES.maxFiles + 5 },
});
const REF = /^SP-[A-Z2-9]{6}$/;

export function createSponsorshipRouter(svc: SponsorshipService): Router {
  const router = Router();

  const parse = (req: Request, res: Response, next: NextFunction) => {
    upload.any()(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE" ? `A file is larger than ${FILE_RULES.maxBytes / 1024 / 1024} MB`
          : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_PART_COUNT" ? `Attach at most ${FILE_RULES.maxFiles} files`
          : "The application could not be read";
        return fail(res, 400, message);
      }
      if (err) return next(err);
      next();
    });
  };

  router.post("/",
    rateLimit({ windowMs: 3600_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, error: "You have sent several applications already. Please try again later, or email us." } }),
    parse,
    h(async (req, res) => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(String((req.body as { data?: string }).data ?? "")) as Record<string, unknown>; if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not an object"); }
      catch { return fail(res, 400, "The application could not be read. Please try again."); }
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

  router.post("/track",
    rateLimit({ windowMs: 3600_000, max: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, error: "Too many lookups. Please try again later." } }),
    json({ limit: "2kb" }),
    h(async (req, res) => {
      const t = await svc.track((req.body ?? {}).ref, (req.body ?? {}).email);
      if (!t) return fail(res, 404, "We could not find an application with that reference and email address. Check both and try again.");
      res.json({ success: true, data: t });
    }));
  return router;
}

export function createSponsorshipAdminRouter(d: { db: Db; svc: SponsorshipService }): Router {
  const router = Router();
  router.get("/", h(async (req, res) => {
    const q = req.query;
    res.json({ success: true, ...(await d.svc.list({ status: typeof q.status === "string" ? q.status : undefined, q: typeof q.q === "string" ? q.q : undefined, limit: Number(q.limit) || undefined, offset: Number(q.offset) || undefined })) });
  }));
  router.post("/retry", h(async (req, res) => { const sent = await d.svc.retryUnsent(); await audit(d.db, req, "sponsorship.retry", null, { sent }); res.json({ success: true, sent }); }));
  router.get("/:ref", h(async (req, res) => {
    if (!REF.test(req.params.ref)) return fail(res, 400, "Invalid reference");
    const a = await d.svc.get(req.params.ref);
    if (!a) return fail(res, 404, "Application not found");
    res.json({ success: true, data: a });
  }));
  router.get("/:ref/documents/:id", h(async (req, res) => {
    if (!REF.test(req.params.ref) || !isUuid(req.params.id)) return fail(res, 400, "Invalid document");
    const doc = await d.svc.document(req.params.ref, req.params.id);
    if (!doc) return fail(res, 404, "Document not found");
    await audit(d.db, req, "sponsorship.document", req.params.ref, { document: req.params.id, filename: doc.filename });
    res.setHeader("Content-Type", doc.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename.replace(/["\r\n\\]/g, "_")}"`);
    res.send(doc.data);
  }));
  router.post("/:ref/status", json({ limit: "8kb" }), h(async (req, res) => {
    if (!REF.test(req.params.ref)) return fail(res, 400, "Invalid reference");
    const r = await d.svc.setStatus(req.params.ref, { status: (req.body ?? {}).status, reason: (req.body ?? {}).reason, applicantMessage: (req.body ?? {}).applicantMessage, by: uid(req) });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "sponsorship.status", req.params.ref, { status: req.body.status, reason: req.body.reason });
    res.json({ success: true });
  }));
  return router;
}
