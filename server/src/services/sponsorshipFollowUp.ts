import crypto from "crypto";
import { isUniqueViolation } from "../portal/common.js";
import type { Db } from "../portal/driverRoutes.js";
import type { EmailSender } from "../auth/email.js";
import { departmentByKey, notifyTargets } from "../config/departments.js";
import { BENEFITS, REPORT_STATUS_LABELS, type ReportStatus } from "../config/sponsorship.js";
import { clean, oneLine, esc, round2, money, labelOf, iso, asJson, checkUploads, storeDocuments, type UploadedFile } from "./sponsorshipUtil.js";
import type { FileScanner } from "./fileScan.js";

/**
 * What an applicant can do after they have applied, with their reference and email address:
 *
 *  - Reply: when staff have asked for more information, send a message and files. Nothing moves until a person reads it and moves the application on.
 *  - Final report: once the agreement is signed, report on what was done: people reached, what was delivered of each thing promised, what was achieved, what was
 *    spent, with evidence. Staff accept it (which completes the award) or return it with a note and the applicant sends it again.
 */
type Bad = { ok: false; status: number; error: string };
const bad = (status: number, error: string): Bad => ({ ok: false, status, error });
const NOT_FOUND = "We could not find an application with that reference and email address. Check both and try again.";
const ATTACH_LIMIT_BYTES = 25 * 1024 * 1024;
const DEPARTMENT_KEY = "sponsorships";

export interface Applicant { id: string; ref: string; status: string; applicantName: string; organisation: string; project: string; email: string; benefits: string[] }
export interface Deps {
  db: Db; mail: EmailSender; scanner: FileScanner; env?: NodeJS.ProcessEnv; now?: () => Date; attachLimitBytes?: number;
  forApplicant: (ref: unknown, email: unknown) => Promise<Applicant | null>;
  /** The award's id, stage and whether the agreement is signed (see sponsorshipAwards.stageOf), and the call that completes it. */
  stageOf: (applicationId: string) => Promise<{ id: string; stage: string; signed: boolean } | null>;
  markCompleted: (applicationId: string) => Promise<void>;
}

export function createSponsorshipFollowUp(deps: Deps) {
  const { db, mail, scanner } = deps;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const attachLimit = deps.attachLimitBytes ?? ATTACH_LIMIT_BYTES;
  const dept = () => departmentByKey(DEPARTMENT_KEY)!;

  async function tellTeam(subject: string, lines: string[], app: Applicant, sourceId: string) {
    const dp = dept();
    const docs = (await db.query(`SELECT filename, mime, size_bytes, data_b64 FROM sponsorship_documents WHERE source_id = $1 ORDER BY created_at`, [sourceId])).rows;
    const total = docs.reduce((t, d) => t + Number(d.size_bytes), 0); const attach = total <= attachLimit && docs.length > 0;
    const text = [...lines, "", docs.length ? (attach ? `${docs.length} file(s) attached.` : `${docs.length} file(s) are too large to attach. They are stored with the application.`) : "No files.", "", "Open the application in the management panel to read it and to move it on."].join("\n");
    const html = lines.map((l) => `<p>${esc(l).replace(/\n/g, "<br>")}</p>`).join("") + `<p>${docs.length ? (attach ? `${docs.length} file(s) attached.` : `${docs.length} file(s) are too large to attach. They are stored with the application.`) : "No files."}</p><p>Open the application in the management panel to read it and to move it on.</p>`;
    const attachments = attach ? docs.map((d) => ({ filename: String(d.filename), content: Buffer.from(String(d.data_b64), "base64"), contentType: String(d.mime) })) : undefined;
    for (const to of notifyTargets(dp, env)) await mail.send({ to, subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200), text, html, from: `VINK ${dp.name} <${dp.address}>`, replyTo: `${app.applicantName.replace(/[<>",\r\n]/g, "")} <${app.email}>`, attachments });
  }
  async function tellApplicant(app: Applicant, subject: string, body: string) {
    const dp = dept();
    await mail.send({ to: app.email, subject, from: `VINK ${dp.name} <${dp.address}>`, replyTo: dp.address, text: `Hello ${app.applicantName},\n\n${body}\n\nYou can follow your application on the Sponsorship page of our website with your reference and this email address.`,
      html: `<p>Hello ${esc(app.applicantName)},</p><p>${esc(body).replace(/\n/g, "<br>")}</p><p>You can follow your application on the Sponsorship page of our website with your reference and this email address.</p>` });
  }

  // ── replying to a question ──────────────────────────────────────────────
  async function reply(ref: unknown, email: unknown, input: { message?: unknown }, files: UploadedFile[]): Promise<{ ok: true } | Bad> {
    const app = await deps.forApplicant(ref, email); if (!app) return bad(404, NOT_FOUND);
    if (app.status !== "more_information_required") return bad(409, "We are not waiting for more information on this application.");
    const message = clean(input.message, 2000);
    if (message.length < 5) return { ok: false, status: 400, error: "Write your reply (at least 5 characters)" };
    const up = await checkUploads(files.map((f) => ({ ...f, kind: "additional" })), { allowed: new Set(["additional"]), scanner });
    if (up.errors.documents) return bad(400, up.errors.documents);
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO sponsorship_replies (id, application_id, message, created_at) VALUES ($1,$2,$3,$4)`, [id, app.id, message, now()]);
    await db.query(`UPDATE sponsorship_applications SET updated_at = $2 WHERE id = $1`, [app.id, now()]);
    try { await storeDocuments(db, app.id, up.ok, id); } catch (e) { await db.query(`DELETE FROM sponsorship_replies WHERE id = $1`, [id]).catch(() => undefined); throw e; }
    await tellTeam(`[${app.ref}] More information from ${app.organisation}`, [`${app.applicantName} (${app.organisation}) replied about "${app.project}" (${app.ref}).`, "", message], app, id).catch((e) => console.error("[sponsorship] reply email failed:", e instanceof Error ? e.message : e));   // the reply is stored and shown to staff either way
    return { ok: true };
  }
  async function repliesFor(applicationId: string) {
    return (await db.query(`SELECT id, message, created_at FROM sponsorship_replies WHERE application_id = $1 ORDER BY created_at`, [applicationId])).rows.map((r) => ({ id: String(r.id), message: String(r.message), at: iso(r.created_at) }));
  }

  // ── the final report ────────────────────────────────────────────────────
  const view = (r: Record<string, unknown>) => ({
    id: String(r.id), beneficiaries: Number(r.beneficiaries), summary: String(r.summary), outcomes: String(r.outcomes), benefitsDelivered: asJson<Record<string, string>>(r.benefits_delivered), spent: Number(r.spent),
    expenditureNotes: r.expenditure_notes ? String(r.expenditure_notes) : null, challenges: r.challenges ? String(r.challenges) : null, status: String(r.status) as ReportStatus, statusLabel: REPORT_STATUS_LABELS[String(r.status) as ReportStatus],
    reviewNote: r.review_note ? String(r.review_note) : null, reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null, reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null, createdAt: iso(r.created_at),
  });
  async function reportsFor(applicationId: string) {
    return (await db.query(`SELECT * FROM sponsorship_reports WHERE application_id = $1 ORDER BY created_at`, [applicationId])).rows.map(view);
  }

  async function submitReport(ref: unknown, email: unknown, input: Record<string, unknown>, files: UploadedFile[]): Promise<{ ok: true } | (Bad & { fields?: Record<string, string> })> {
    const app = await deps.forApplicant(ref, email); if (!app) return bad(404, NOT_FOUND);
    const aw = await deps.stageOf(app.id);
    if (!aw || !aw.signed) return bad(409, "You can send the final report once the sponsorship agreement is signed.");
    const prior = await reportsFor(app.id);
    if (prior.some((r) => r.status === "accepted")) return bad(409, "Your final report has already been accepted. Thank you.");
    if (prior.some((r) => r.status === "submitted")) return bad(409, "Your final report is with us and is being read. We will write to you if we need anything changed.");
    const errors: Record<string, string> = {};
    const text = (k: string, label: string, min: number, max: number) => { const v = clean(input[k], max + 1); if (v.length < min) errors[k] = `Write ${label} (at least ${min} characters)`; else if (v.length > max) errors[k] = `${label[0].toUpperCase()}${label.slice(1)} is too long (at most ${max} characters)`; return v.slice(0, max); };
    const beneficiaries = typeof input.beneficiaries === "number" ? input.beneficiaries : Number(input.beneficiaries);
    if (!Number.isInteger(beneficiaries) || beneficiaries < 0 || beneficiaries > 10_000_000) errors.beneficiaries = "Enter how many people took part or benefited (a whole number)";
    const summary = text("summary", "what was delivered", 30, 3000), outcomes = text("outcomes", "what was achieved", 30, 3000), expenditureNotes = text("expenditureNotes", "how the money was spent", 20, 2000);
    const spent = typeof input.spent === "number" ? round2(input.spent) : NaN;
    if (!Number.isFinite(spent) || spent < 0 || spent > 1e12) errors.spent = "Enter the total amount spent";
    const raw = (input.benefitsDelivered ?? {}) as Record<string, unknown>; const delivered: Record<string, string> = {};
    for (const b of app.benefits) { const v = clean(raw[b], 500); if (v.length < 3) errors[`benefitsDelivered.${b}`] = `Say what you delivered for "${labelOf(BENEFITS, b)}" (or why it was not delivered)`; else delivered[b] = v; }
    const challenges = clean(input.challenges, 2000);
    const up = await checkUploads(files.map((f) => ({ ...f, kind: "evidence" })), { allowed: new Set(["evidence"]), required: [{ id: "evidence", label: "Evidence of what was delivered and how the money was spent" }], scanner, notAsked: "was attached to a document that this report does not ask for" });
    if (up.errors.documents) errors.documents = up.errors.documents;
    if (Object.keys(errors).length) return { ok: false, status: 400, error: Object.values(errors)[0], fields: errors };
    const id = crypto.randomUUID();
    try {
      await db.query(`INSERT INTO sponsorship_reports (id, application_id, beneficiaries, summary, outcomes, benefits_delivered, spent, expenditure_notes, challenges, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, app.id, beneficiaries, summary, outcomes, JSON.stringify(delivered), spent, expenditureNotes, challenges || null, now()]);
    } catch (e) { if (isUniqueViolation(e)) return bad(409, "Your final report is with us and is being read. We will write to you if we need anything changed."); throw e; }   // the database allows one open report at a time
    await db.query(`UPDATE sponsorship_applications SET updated_at = $2 WHERE id = $1`, [app.id, now()]);
    try { await storeDocuments(db, app.id, up.ok, id); } catch (e) { await db.query(`DELETE FROM sponsorship_reports WHERE id = $1`, [id]).catch(() => undefined); throw e; }
    await tellTeam(`[${app.ref}] Final report from ${app.organisation}`, [`${app.applicantName} (${app.organisation}) sent the final report for "${app.project}" (${app.ref}).`, "", `People reached: ${beneficiaries.toLocaleString("en-ZA")}`, `Spent: ${money(spent, "")}`.trim(), "", `Delivered: ${summary}`, "", `Achieved: ${outcomes}`], app, id).catch((e) => console.error("[sponsorship] report email failed:", e instanceof Error ? e.message : e));
    return { ok: true };
  }

  /** Staff read the report and accept it (the award is then complete) or return it with a note that the applicant sees. */
  async function reviewReport(ref: string, reportId: string, input: { decision?: unknown; note?: unknown }, by: string): Promise<{ ok: true } | Bad> {
    const app = (await db.query(`SELECT id, ref, applicant_name, organisation, project_title, email FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0]; if (!app) return bad(404, "Application not found");
    const rep = (await db.query(`SELECT id, status FROM sponsorship_reports WHERE id = $1 AND application_id = $2`, [reportId, app.id])).rows[0]; if (!rep) return bad(404, "Report not found");
    if (rep.status !== "submitted") return bad(409, "This report has already been reviewed");
    const decision = input.decision; if (decision !== "accepted" && decision !== "returned") return bad(400, "Choose accept or return");
    const note = clean(input.note, 1000);
    if (decision === "returned" && note.length < 10) return bad(400, "Tell the applicant what to change (at least 10 characters)");
    const upd = await db.query(`UPDATE sponsorship_reports SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = $5 WHERE id = $1 AND status = 'submitted' RETURNING id`, [rep.id, decision, note || null, by, now()]);
    if (!upd.rows.length) return bad(409, "This report has already been reviewed");
    if (decision === "accepted") await deps.markCompleted(String(app.id));
    const a: Applicant = { id: String(app.id), ref: String(app.ref), status: "", applicantName: String(app.applicant_name), organisation: String(app.organisation), project: String(app.project_title), email: String(app.email), benefits: [] };
    await tellApplicant(a, decision === "accepted" ? `Your final report was accepted (${a.ref})` : `Your final report needs changes (${a.ref})`,
      decision === "accepted" ? `Thank you. We have accepted the final report for "${a.project}".${note ? `\n\n${note}` : ""}` : `We have read the final report for "${a.project}" and need some changes:\n\n${note}\n\nPlease send the report again.`)
      .catch((e) => console.error("[sponsorship] report review email failed:", e instanceof Error ? e.message : e));
    return { ok: true };
  }

  // ── what the tracker shows ──────────────────────────────────────────────
  /** What this applicant may do now, and what they have already sent. Staff's own notes are never included. */
  async function applicantExtras(app: Applicant) {
    const aw = await deps.stageOf(app.id);
    const replies = (await repliesFor(app.id)).map((r) => ({ at: r.at, message: r.message }));
    const reports = (await reportsFor(app.id)).map((r) => ({ at: r.createdAt, status: r.status, statusLabel: r.statusLabel, note: r.status === "submitted" ? null : r.reviewNote }));
    const canReport = !!aw && aw.signed && !reports.some((r) => r.status === "accepted" || r.status === "submitted");
    return { replies, reports, canReply: app.status === "more_information_required", canReport, benefits: canReport ? app.benefits.map((id) => ({ id, label: labelOf(BENEFITS, id) })) : [] };
  }

  return { reply, repliesFor, submitReport, reviewReport, reportsFor, applicantExtras };
}
export type SponsorshipFollowUp = ReturnType<typeof createSponsorshipFollowUp>;
