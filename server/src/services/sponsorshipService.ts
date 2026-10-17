import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import type { EmailSender } from "../auth/email.js";
import { departmentByKey, notifyTargets, type Department } from "../config/departments.js";
import { createScanner, type FileScanner } from "./fileScan.js";
import { clean, oneLine, esc, newRef, round2, money, labelOf, asJson, toRand, checkUploads, storeDocuments, type UploadedFile } from "./sponsorshipUtil.js";
import { saDay } from "../portal/common.js";
import {
  ORG_TYPES, CATEGORIES, BENEFITS, LIMITS_ZAR, DEFAULT_COUNTRY, STATUS_LABELS, documentSlots, checkAnswers, type Answers, type Errors, type StatusId,
} from "../config/sponsorship.js";
export type { Errors } from "../config/sponsorship.js";
export type { UploadedFile } from "./sponsorshipUtil.js";

/**
 * The online sponsorship application.
 *
 * An application is stored first, so it is never lost if email is down, and then emailed to the sponsorship team (the applicant's address is the Reply-To, and the
 * uploaded documents are attached) and acknowledged to the applicant with a reference. A send that fails is tried again by retryUnsent(), exactly as for contact
 * messages. The applicant can follow their application with the reference and their email address; staff move it through its statuses, and every change needs
 * a reason that is kept in the history.
 *
 * Every rule lives here, on the server: the form checks the same things only so people find out before they press Submit.
 */
const MAX_TRIES = 12;
const ATTACH_LIMIT_BYTES = 25 * 1024 * 1024;     // a mailbox rejects much more; bigger applications are emailed without the files (they stay stored)
const DEPARTMENT_KEY = "sponsorships";

/** Where an application may go next. A declined application can be reconsidered, with a reason that stays in the history. */
export const TRANSITIONS: Record<StatusId, StatusId[]> = {
  submitted: ["under_review", "declined"],
  under_review: ["more_information_required", "approved", "declined"],
  more_information_required: ["under_review", "declined"],
  approved: ["agreement_pending", "declined"],
  agreement_pending: ["declined"],
  declined: ["under_review"],
};

export interface ScreeningNote { level: "info" | "review"; note: string }
export type SubmitResult =
  | { ok: true; ref: string; respondWithin: string; duplicate?: boolean }
  | { ok: false; status: number; error: string; fields?: Errors };


export function createSponsorshipService(deps: { db: Db; mail: EmailSender; scanner?: FileScanner; env?: NodeJS.ProcessEnv; now?: () => Date; attachLimitBytes?: number }) {
  const { db, mail } = deps;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const scanner = deps.scanner ?? createScanner(env);
  const attachLimit = deps.attachLimitBytes ?? ATTACH_LIMIT_BYTES;
  const dept = (): Department => departmentByKey(DEPARTMENT_KEY)!;

  /** Every file is checked once, against the documents this organisation type and category ask for. */
  const checkFiles = (files: UploadedFile[], orgType: string, category: string) => {
    const slots = documentSlots(orgType, category);
    return checkUploads(files, { allowed: new Set(slots.map((x) => x.id)), required: slots.filter((x) => x.required), scanner });
  };

  /** Notes for the sponsorship team only: where this application sits against the published criteria. The applicant is never shown these. */
  function screen(d: Answers, zar: { zar: number } | null, scanned: { status: string }[]): ScreeningNote[] {
    const n: ScreeningNote[] = [];
    if (d.orgType === "company" || d.orgType === "individual") n.push({ level: "review", note: `Applicant is ${d.orgType === "company" ? "a registered company" : "an individual"}. The published criteria cover non-profit organisations, community sport teams, school programmes and community events: confirm the community benefit.` });
    if (d.country !== DEFAULT_COUNTRY) n.push({ level: "review", note: `Outside South Africa (${d.country}). The published criteria give priority to the Western Cape; national applications are considered.` });
    else if (d.province !== "Western Cape") n.push({ level: "info", note: `Outside the Western Cape (${d.province}). Western Cape applicants have priority; national applications are considered.` });
    if (!zar) n.push({ level: "review", note: `The amount could not be converted to rand (no stored ${d.currency} rate): check it against the R${LIMITS_ZAR.min.toLocaleString("en-ZA")} to R${LIMITS_ZAR.max.toLocaleString("en-ZA")} limits.` });
    const gap = round2(d.totalBudget - d.amountRequested - d.ownContribution - d.otherSponsorsAmount);
    if (gap > 0.009) n.push({ level: "info", note: `Funding gap of ${money(gap, d.currency)}: the requested amount, own contribution and other sponsors do not cover the total budget.` });
    if (scanned.some((s) => s.status !== "clean")) n.push({ level: "info", note: "Some documents were not checked by an antivirus engine (none is configured, or it could not be reached). Open them with care." });
    return n;
  }

  // ── email ───────────────────────────────────────────────────────────────
  async function loadDocs(id: string) {
    return (await db.query(`SELECT id, kind, filename, mime, size_bytes, scan_status, data_b64 FROM sponsorship_documents WHERE application_id = $1 ORDER BY created_at, filename`, [id])).rows;
  }

  async function notifyTeam(row: Record<string, unknown>): Promise<void> {
    const d = asJson<Answers>(row.details); const dp = dept();
    const docs = await loadDocs(String(row.id));
    const total = docs.reduce((s, x) => s + Number(x.size_bytes), 0);
    const attach = total <= attachLimit;
    const screening = asJson<ScreeningNote[]>(row.screening) ?? [];
    const zarNote = row.amount_zar !== null && row.amount_zar !== undefined && row.currency !== "ZAR" ? ` (about ${money(Number(row.amount_zar), "ZAR")})` : "";
    const lines = [
      `New sponsorship application for ${dp.name}`, `Reference: ${row.ref}`, "",
      `Project: ${d.projectTitle}`, `Category: ${labelOf(CATEGORIES, d.category)}`, `Amount requested: ${money(Number(row.amount_requested), String(row.currency))}${zarNote}`, `Total project budget: ${money(d.totalBudget, d.currency)}`,
      `Dates: ${d.startDate} to ${d.endDate}`, `Where: ${d.city}, ${d.province}, ${d.country}`, `Expected beneficiaries: ${d.beneficiaries.toLocaleString("en-ZA")}`, "",
      `Applicant: ${row.applicant_name} (${labelOf(ORG_TYPES, d.orgType)})`, `Organisation: ${row.organisation}${d.registrationNumber ? ` (reg. ${d.registrationNumber})` : ""}`,
      `Contact: ${d.contactPerson} <${row.email}> ${row.phone}`, "",
      `Offered to VINK: ${d.benefits.map((b) => labelOf(BENEFITS, b)).join(", ")}`, "",
      `Summary: ${d.executiveSummary}`, "",
      screening.length ? "For review:" : "", ...screening.map((s) => ` - [${s.level}] ${s.note}`), screening.length ? "" : "",
      `Documents (${docs.length}): ${docs.map((x) => `${x.kind}: ${x.filename}${x.scan_status === "clean" ? "" : " (not scanned)"}`).join("; ") || "none"}`,
      attach ? "The documents are attached." : `The documents (${(total / 1024 / 1024).toFixed(1)} MB) are too large to attach. They are stored with the application.`,
      "", "Reply to this email to write to the applicant.",
    ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
    const text = lines.join("\n");
    const html = `<p><b>New sponsorship application for ${esc(dp.name)}</b><br>Reference: <b>${esc(String(row.ref))}</b></p>`
      + `<p><b>${esc(d.projectTitle)}</b><br>${esc(labelOf(CATEGORIES, d.category))}<br>Amount requested: ${esc(money(Number(row.amount_requested), String(row.currency)))}${esc(zarNote)}<br>Dates: ${esc(d.startDate)} to ${esc(d.endDate)}<br>Where: ${esc(`${d.city}, ${d.province}, ${d.country}`)}</p>`
      + `<p>Applicant: ${esc(String(row.applicant_name))} (${esc(labelOf(ORG_TYPES, d.orgType))})<br>Organisation: ${esc(String(row.organisation))}<br>Contact: ${esc(d.contactPerson)} &lt;${esc(String(row.email))}&gt; ${esc(String(row.phone))}</p>`
      + `<p>Offered to VINK: ${esc(d.benefits.map((b) => labelOf(BENEFITS, b)).join(", "))}</p><p>${esc(d.executiveSummary).replace(/\n/g, "<br>")}</p>`
      + (screening.length ? `<p><b>For review</b></p><ul>${screening.map((s) => `<li>[${esc(s.level)}] ${esc(s.note)}</li>`).join("")}</ul>` : "")
      + `<p>Documents (${docs.length}): ${esc(docs.map((x) => `${x.kind}: ${x.filename}`).join("; ") || "none")}<br>${attach ? "The documents are attached." : "The documents are too large to attach. They are stored with the application."}</p><p>Reply to this email to write to the applicant.</p>`;
    const attachments = attach ? docs.map((x) => ({ filename: String(x.filename), content: Buffer.from(String(x.data_b64), "base64"), contentType: String(x.mime) })) : undefined;
    for (const to of notifyTargets(dp, env)) await mail.send({ to, subject: `[${row.ref}] New sponsorship application: ${d.projectTitle} (${row.organisation})`.replace(/[\r\n]+/g, " ").slice(0, 200), text, html, from: `VINK ${dp.name} <${dp.address}>`, replyTo: `${String(row.applicant_name).replace(/[<>",\r\n]/g, "")} <${row.email}>`, attachments });
  }

  async function acknowledge(row: Record<string, unknown>): Promise<void> {
    const dp = dept(); const d = asJson<Answers>(row.details);
    const text = `Hello ${row.applicant_name},\n\nWe have received your sponsorship application.\n\nReference: ${row.ref}\nProject: ${d.projectTitle}\nAmount requested: ${money(Number(row.amount_requested), String(row.currency))}\n\nVINK reviews applications on a quarterly basis. Successful applicants will be contacted within 6 weeks of the review date.\n\nYou can follow your application on the Sponsorship page of our website with your reference and this email address. If you write to ${dp.address}, you can expect a reply within ${dp.respondWithin}.\n\nFor your safety, never send us a password, PIN or card number by email.`;
    const html = `<p>Hello ${esc(String(row.applicant_name))},</p><p>We have received your sponsorship application.</p><p>Reference: <b>${esc(String(row.ref))}</b><br>Project: ${esc(d.projectTitle)}<br>Amount requested: ${esc(money(Number(row.amount_requested), String(row.currency)))}</p><p>VINK reviews applications on a <b>quarterly basis</b>. Successful applicants will be contacted within 6 weeks of the review date.</p><p>You can follow your application on the Sponsorship page of our website with your reference and this email address. If you write to ${esc(dp.address)}, you can expect a reply within ${esc(dp.respondWithin)}.</p><p>For your safety, never send us a password, PIN or card number by email.</p>`;
    await mail.send({ to: String(row.email), subject: `We received your sponsorship application (${row.ref})`, text, html, from: `VINK ${dp.name} <${dp.address}>`, replyTo: dp.address });
  }

  async function deliver(id: string): Promise<boolean> {
    const row = (await db.query(`SELECT * FROM sponsorship_applications WHERE id = $1`, [id])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return false;
    let ok = !!row.notified_at, err: string | null = null;
    if (!row.notified_at) {
      try { await notifyTeam(row); ok = true; await db.query(`UPDATE sponsorship_applications SET notified_at = $2, last_error = NULL WHERE id = $1`, [id, now()]); }
      catch (e) { err = e instanceof Error ? e.message.slice(0, 200) : "send failed"; await db.query(`UPDATE sponsorship_applications SET tries = tries + 1, last_error = $2 WHERE id = $1`, [id, err]); }
    }
    if (!row.ack_sent_at) {
      try { await acknowledge(row); await db.query(`UPDATE sponsorship_applications SET ack_sent_at = $2 WHERE id = $1`, [id, now()]); }
      catch (e) { if (!err) await db.query(`UPDATE sponsorship_applications SET last_error = $2 WHERE id = $1`, [id, e instanceof Error ? e.message.slice(0, 200) : "acknowledgement failed"]); }
    }
    return ok;
  }

  // ── applicants ──────────────────────────────────────────────────────────
  async function submit(input: Record<string, unknown>, files: UploadedFile[] = []): Promise<SubmitResult> {
    const dp = dept();
    if (typeof input.faxNumber === "string" && input.faxNumber.trim() !== "") return { ok: true, ref: newRef(), respondWithin: dp.respondWithin };   // the hidden trap field: a person never fills it. Pretend it worked, store nothing.
    const { data: d, errors } = checkAnswers(input, saDay(now()));                                // the same checks the form ran, run again here: the server never trusts the form
    const fileCheck = !errors.orgType && !errors.category ? await checkFiles(files, d.orgType, d.category) : null;   // each file is scanned once
    if (fileCheck) Object.assign(errors, fileCheck.errors);
    let zar: { zar: number; rate: number | null } | null = null;
    if (!errors.amountRequested && !errors.currency && d.amountRequested > 0) {
      zar = await toRand(db, d.amountRequested, d.currency);
      if (zar && (zar.zar < LIMITS_ZAR.min || zar.zar > LIMITS_ZAR.max)) errors.amountRequested = `Requests must be between R${LIMITS_ZAR.min.toLocaleString("en-ZA")} and R${LIMITS_ZAR.max.toLocaleString("en-ZA")} per application${d.currency === "ZAR" ? "" : `. Your request is about ${money(zar.zar, "ZAR")}`}`;
    }
    if (Object.keys(errors).length) return { ok: false, status: 400, error: errors.documents ?? "Please correct the highlighted answers", fields: errors };

    const checked = fileCheck!.ok;
    const dup = (await db.query(`SELECT ref FROM sponsorship_applications WHERE email = $1 AND lower(project_title) = $2 AND created_at >= $3 LIMIT 1`, [d.email, d.projectTitle.toLowerCase(), new Date(now().getTime() - 10 * 60_000)])).rows[0];
    if (dup) return { ok: true, ref: String(dup.ref), respondWithin: dp.respondWithin, duplicate: true };

    const id = crypto.randomUUID(); let ref = newRef();
    const screening = screen(d, zar, checked.map((f) => f.scan));
    for (let i = 0; ; i++) {
      try {
        await db.query(`INSERT INTO sponsorship_applications (id, ref, applicant_name, organisation, org_type, email, phone, category, project_title, country, province, currency, amount_requested, amount_zar, fx_rate, details, screening, consent_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,$18)`,
          [id, ref, d.applicantName, d.organisation, d.orgType, d.email, d.phone, d.category, d.projectTitle, d.country, d.province || null, d.currency, d.amountRequested, zar ? zar.zar : null, zar?.rate ?? null, JSON.stringify(d), JSON.stringify(screening), now()]);
        break;
      } catch (e) { if (i >= 3 || !/unique|duplicate/i.test(String((e as Error).message))) throw e; ref = newRef(); }
    }
    try {
      await storeDocuments(db, id, checked);
      await db.query(`INSERT INTO sponsorship_status_history (id, application_id, from_status, to_status, reason, applicant_message, changed_by, created_at) VALUES ($1,$2,NULL,'submitted','Application submitted',NULL,NULL,$3)`, [crypto.randomUUID(), id, now()]);
    } catch (e) {
      await db.query(`DELETE FROM sponsorship_applications WHERE id = $1`, [id]).catch(() => undefined);   // never leave an application whose documents did not all save
      throw e;
    }
    await deliver(id).catch(() => false);                                                            // email trouble never loses the application: it is stored and retried
    return { ok: true, ref, respondWithin: dp.respondWithin };
  }

  /** What an applicant may see of their own application, with the reference and the email address they used. */
  async function track(ref: unknown, email: unknown) {
    const r = oneLine(ref, 20).toUpperCase(), e = oneLine(email, 254).toLowerCase();
    if (!/^SP-[A-Z2-9]{6}$/.test(r) || !e) return null;
    const row = (await db.query(`SELECT id, ref, status, status_message, organisation, project_title, created_at, updated_at FROM sponsorship_applications WHERE ref = $1 AND email = $2`, [r, e])).rows[0];
    if (!row) return null;
    const hist = (await db.query(`SELECT to_status, applicant_message, created_at FROM sponsorship_status_history WHERE application_id = $1 ORDER BY created_at, id`, [row.id])).rows;
    return {
      ref: String(row.ref), status: String(row.status), statusLabel: STATUS_LABELS[row.status as StatusId] ?? String(row.status), project: String(row.project_title), organisation: String(row.organisation),
      submittedAt: new Date(row.created_at as string).toISOString(), updatedAt: new Date(row.updated_at as string).toISOString(),
      timeline: hist.map((h) => ({ status: String(h.to_status), label: STATUS_LABELS[h.to_status as StatusId] ?? String(h.to_status), at: new Date(h.created_at as string).toISOString(), message: h.applicant_message ? String(h.applicant_message) : null })),
    };
  }

  /** The applicant's own application, found by the reference and email they were given: the key to everything an applicant may do. */
  async function forApplicant(ref: unknown, email: unknown) {
    const r = oneLine(ref, 20).toUpperCase(), e = oneLine(email, 254).toLowerCase();
    if (!/^SP-[A-Z2-9]{6}$/.test(r) || !e) return null;
    const row = (await db.query(`SELECT id, ref, status, applicant_name, organisation, project_title, email, details FROM sponsorship_applications WHERE ref = $1 AND email = $2`, [r, e])).rows[0];
    if (!row) return null;
    const d = asJson<{ benefits?: string[] }>(row.details);
    return { id: String(row.id), ref: String(row.ref), status: String(row.status) as StatusId, applicantName: String(row.applicant_name), organisation: String(row.organisation), project: String(row.project_title), email: String(row.email), benefits: Array.isArray(d.benefits) ? d.benefits : [] };
  }

  // ── staff ───────────────────────────────────────────────────────────────
  const listView = (r: Record<string, unknown>) => ({
    ref: String(r.ref), status: String(r.status), statusLabel: STATUS_LABELS[r.status as StatusId] ?? String(r.status), applicantName: String(r.applicant_name), organisation: String(r.organisation), orgType: String(r.org_type), email: String(r.email),
    category: String(r.category), projectTitle: String(r.project_title), country: String(r.country), province: r.province ? String(r.province) : null, currency: String(r.currency), amountRequested: Number(r.amount_requested),
    amountZar: r.amount_zar === null || r.amount_zar === undefined ? null : Number(r.amount_zar), assignedTo: r.assigned_to ? String(r.assigned_to) : null, assignedName: r.assigned_name ? String(r.assigned_name) : null, replied: r.replied === true || r.replied === "t" || r.replied === 1, delivered: !!r.notified_at, createdAt: new Date(r.created_at as string).toISOString(), updatedAt: new Date(r.updated_at as string).toISOString(),
  });

  /** Newest first. "assigned" is a person's id, or "none" for applications nobody has taken on. */
  async function list(f: { status?: string; q?: string; assigned?: string; limit?: number; offset?: number } = {}) {
    const where: string[] = [], p: unknown[] = [];
    if (f.status && STATUS_LABELS[f.status as StatusId]) { p.push(f.status); where.push(`a.status = $${p.length}`); }
    if (f.assigned === "none") where.push(`a.assigned_to IS NULL`);
    else if (f.assigned && /^[0-9a-f-]{36}$/i.test(f.assigned)) { p.push(f.assigned); where.push(`a.assigned_to = $${p.length}`); }
    const q = oneLine(f.q, 80).toLowerCase();
    if (q) { p.push(`%${q}%`); where.push(`(lower(a.ref) LIKE $${p.length} OR lower(a.organisation) LIKE $${p.length} OR lower(a.project_title) LIKE $${p.length} OR a.email LIKE $${p.length})`); }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = Number((await db.query(`SELECT COUNT(*) AS n FROM sponsorship_applications a ${whereSql}`, p)).rows[0]?.n ?? 0);
    p.push(Math.min(Math.max(f.limit ?? 50, 1), 200), Math.max(f.offset ?? 0, 0));
    const rows = (await db.query(`SELECT a.id, a.ref, a.status, a.applicant_name, a.organisation, a.org_type, a.email, a.category, a.project_title, a.country, a.province, a.currency, a.amount_requested, a.amount_zar, a.assigned_to, u.name AS assigned_name, a.notified_at, a.created_at, a.updated_at,
      (a.status = 'more_information_required' AND rp.last_reply IS NOT NULL AND rp.last_reply > COALESCE(hs.last_change, a.created_at)) AS replied
      FROM sponsorship_applications a LEFT JOIN users u ON u.id = a.assigned_to
      LEFT JOIN (SELECT application_id, MAX(created_at) AS last_reply FROM sponsorship_replies GROUP BY application_id) rp ON rp.application_id = a.id
      LEFT JOIN (SELECT application_id, MAX(created_at) AS last_change FROM sponsorship_status_history GROUP BY application_id) hs ON hs.application_id = a.id ${whereSql} ORDER BY a.created_at DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
    return { total, applications: rows.map(listView) };
  }

  async function get(ref: string) {
    const row = (await db.query(`SELECT * FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0];
    if (!row) return null;
    const docs = (await db.query(`SELECT id, kind, filename, mime, size_bytes, sha256, scan_status, scan_detail, source_id, created_at FROM sponsorship_documents WHERE application_id = $1 ORDER BY created_at, filename`, [row.id])).rows;
    const hist = (await db.query(`SELECT h.from_status, h.to_status, h.reason, h.applicant_message, h.changed_by, h.created_at FROM sponsorship_status_history h WHERE h.application_id = $1 ORDER BY h.created_at, h.id`, [row.id])).rows;
    return {
      ...listView(row), id: String(row.id), details: asJson<Record<string, unknown>>(row.details), screening: asJson<ScreeningNote[]>(row.screening), fxRate: row.fx_rate === null ? null : Number(row.fx_rate), consentAt: new Date(row.consent_at as string).toISOString(), lastError: row.last_error ? String(row.last_error) : null, statusMessage: row.status_message ? String(row.status_message) : null,
      documents: docs.map((d) => ({ id: String(d.id), kind: String(d.kind), filename: String(d.filename), mime: String(d.mime), sizeBytes: Number(d.size_bytes), sha256: String(d.sha256), scanStatus: String(d.scan_status), scanDetail: d.scan_detail ? String(d.scan_detail) : null, sourceId: d.source_id ? String(d.source_id) : null })),
      history: hist.map((h) => ({ fromStatus: h.from_status ? String(h.from_status) : null, toStatus: String(h.to_status), reason: String(h.reason), applicantMessage: h.applicant_message ? String(h.applicant_message) : null, changedBy: h.changed_by ? String(h.changed_by) : null, at: new Date(h.created_at as string).toISOString() })),
      nextStatuses: TRANSITIONS[row.status as StatusId] ?? [],
    };
  }

  async function document(ref: string, docId: string) {
    const r = (await db.query(`SELECT d.filename, d.mime, d.data_b64 FROM sponsorship_documents d JOIN sponsorship_applications a ON a.id = d.application_id WHERE a.ref = $1 AND d.id = $2`, [ref, docId])).rows[0];
    return r ? { filename: String(r.filename), mime: String(r.mime), data: Buffer.from(String(r.data_b64), "base64") } : null;
  }

  /** Moves an application on. The reviewer's reason is kept for the audit trail; the applicant message (optional, required when more information is needed) is what the applicant sees and is emailed. */
  async function setStatus(ref: string, i: { status: unknown; reason: unknown; applicantMessage?: unknown; by: string }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const to = String(i.status) as StatusId; const reason = oneLine(i.reason, 500), msg = clean(i.applicantMessage, 1000);
    if (!STATUS_LABELS[to]) return { ok: false, status: 400, error: `Status must be one of: ${Object.keys(STATUS_LABELS).join(", ")}` };
    if (reason.length < 3) return { ok: false, status: 400, error: "A reason is required for every status change" };
    if (to === "more_information_required" && msg.length < 10) return { ok: false, status: 400, error: "Tell the applicant what information is needed (at least 10 characters)" };
    const row = (await db.query(`SELECT id, ref, status, applicant_name, email, project_title FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0];
    if (!row) return { ok: false, status: 404, error: "Application not found" };
    const from = String(row.status) as StatusId;
    if (!TRANSITIONS[from].includes(to)) return { ok: false, status: 409, error: `Cannot move from "${from}" to "${to}". Valid next steps: ${TRANSITIONS[from].join(", ") || "none"}.` };
    const upd = await db.query(`UPDATE sponsorship_applications SET status = $2, status_message = $3, updated_at = $4 WHERE id = $1 AND status = $5 RETURNING id`, [row.id, to, msg || null, now(), from]);
    if (!upd.rows.length) return { ok: false, status: 409, error: "Someone else changed this application at the same moment. Reload it and try again." };
    await db.query(`INSERT INTO sponsorship_status_history (id, application_id, from_status, to_status, reason, applicant_message, changed_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [crypto.randomUUID(), row.id, from, to, reason, msg || null, i.by, now()]);
    const dp = dept();
    mail.send({ to: String(row.email), subject: `Your sponsorship application ${row.ref}: ${STATUS_LABELS[to]}`, from: `VINK ${dp.name} <${dp.address}>`, replyTo: dp.address,
      text: `Hello ${row.applicant_name},\n\nThe status of your sponsorship application ${row.ref} (${row.project_title}) is now: ${STATUS_LABELS[to]}.\n${msg ? `\n${msg}\n` : ""}\nYou can follow your application on the Sponsorship page of our website with your reference and this email address.`,
      html: `<p>Hello ${esc(String(row.applicant_name))},</p><p>The status of your sponsorship application <b>${esc(String(row.ref))}</b> (${esc(String(row.project_title))}) is now: <b>${esc(STATUS_LABELS[to])}</b>.</p>${msg ? `<p>${esc(msg).replace(/\n/g, "<br>")}</p>` : ""}<p>You can follow your application on the Sponsorship page of our website with your reference and this email address.</p>` })
      .catch((e) => console.error("[sponsorship] status email failed:", e instanceof Error ? e.message : e));   // the change stands; the applicant can always see it by tracking
    return { ok: true };
  }

  /** Tries again for applications whose team email did not go (or whose receipt did not). */
  async function retryUnsent(): Promise<number> {
    const rows = (await db.query(`SELECT id FROM sponsorship_applications WHERE (notified_at IS NULL OR ack_sent_at IS NULL) AND tries < $1 AND created_at >= $2 ORDER BY created_at LIMIT 25`, [MAX_TRIES, new Date(now().getTime() - 7 * 86400_000)])).rows;
    let sent = 0;
    for (const r of rows) if (await deliver(String(r.id)).catch(() => false)) sent++;
    return sent;
  }
  async function undeliveredCount(): Promise<number> {
    return Number((await db.query(`SELECT COUNT(*) AS n FROM sponsorship_applications WHERE notified_at IS NULL AND created_at < $1`, [new Date(now().getTime() - 15 * 60_000)])).rows[0]?.n ?? 0);
  }

  return { submit, track, forApplicant, list, get, document, setStatus, retryUnsent, undeliveredCount };
}
export type SponsorshipService = ReturnType<typeof createSponsorshipService>;
