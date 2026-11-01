import crypto from "crypto";
import { isUniqueViolation } from "../../portal/common.js";
import type { Db } from "../../portal/driverRoutes.js";
import { sumsubReady, levelFor, isRequired, type SumsubConfig, type Profile } from "./config.js";
import type { SumsubClient } from "./client.js";
import { identityStatusFor, EVENT_REVIEW_STATUS, type IdentityStatus, type SumsubReviewResult } from "./status.js";

/**
 * Confirming that a real person is applying, by Sumsub, for every kind of application that needs it.
 *
 * The applicant verifies themselves in Sumsub's own widget: their ID document and selfie go from their device to Sumsub and never touch our server or
 * database. We keep only where the check stands and its outcome (the identity_checks table). Sumsub tells us when a check changes by webhook, and staff can
 * ask Sumsub for the latest ("refresh") if an event was missed.
 *
 * Each kind of application plugs in as a SUBJECT (it says how to find an application for a person who can prove it is theirs, and which statuses are closed):
 * "sponsorship" and "application" (the applications table: accounts, credit cards, loans, SIM, services). A new kind (insurance, say) is one more subject.
 *
 *  - startSession   the applicant (proved by reference + email, or by being signed in as its owner) agrees, and gets a short-lived token for the widget
 *  - statusFor      what the applicant may see: the stage and what to do, never Sumsub's reasons
 *  - staffView      what staff see: the stage, Sumsub's answer and reasons, whether it is required, and any override
 *  - gate           may staff approve? A required kind needs a confirmed identity (only while checks are switched on), unless a Super Administrator overrode it
 *  - override       a Super Administrator approves without a confirmed identity, with a stated reason
 *  - refresh        staff: fetch the latest from Sumsub
 *  - applyEvent     a webhook event: applied once, and an older event arriving late is ignored
 */
export type Kind = "sponsorship" | "application";
export const KINDS: Kind[] = ["sponsorship", "application"];
type Fail = { ok: false; status: number; error: string };
export interface SubjectApp { id: string; status: string; email: string | null; phone: string | null; profile: Profile }
export interface IdentitySubject {
  kind: Kind;
  /** The application for a person who can prove it is theirs: its reference, with the email address on it or (when signed in) their own account. */
  forApplicant(ref: unknown, email: unknown, userId?: string | null): Promise<SubjectApp | null>;
  /** The same from the reference alone, for staff. */
  byRef(ref: string): Promise<SubjectApp | null>;
  /** The statuses in which a check is pointless because the application is already decided. */
  closed: ReadonlySet<string>;
}

export interface IdentityApplicantView { enabled: boolean; status: IdentityStatus; canStart: boolean; consentRequired: boolean; required: boolean; message: string; attempts: number }
export interface IdentityStaffView {
  enabled: boolean; status: IdentityStatus; requirement: "required" | "recommended" | "off"; confirmed: boolean; reviewStatus: string | null; reviewAnswer: string | null; rejectType: string | null; rejectLabels: string[];
  moderationComment: string | null; clientComment: string | null; consentAt: string | null; attempts: number; reviewedAt: string | null; applicantId: string | null; levelName: string | null; caseUrl: string | null;
  override: { reason: string; by: string; at: string } | null;
}

interface Row {
  kind: Kind; subject_id: string; profile: Profile; applicant_id: string | null; external_user_id: string; level_name: string; status: IdentityStatus; review_status: string | null; review_answer: string | null;
  reject_type: string | null; reject_labels: unknown; moderation_comment: string | null; client_comment: string | null; consent_at: Date | string | null; attempts: number; reviewed_at: Date | string | null;
  last_event_at: Date | string | null; override_reason: string | null; overridden_by: string | null; overridden_at: Date | string | null;
}

const STARTABLE = new Set<IdentityStatus>(["not_started", "in_progress", "retry"]);
const PREFIX: Record<Kind, string> = { sponsorship: "sp", application: "ap" };
const asObj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const text = (v: unknown, max: number): string | null => { const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""; return s ? s.slice(0, max) : null; };
const labelsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x).slice(0, 20).map((x) => x.slice(0, 60)) : []);
const parseLabels = (v: unknown): string[] => { try { return labelsOf(typeof v === "string" ? JSON.parse(v) : v); } catch { return []; } };

/** Sumsub stamps events "2024-05-01 13:23:19.321" (UTC) or with a number of milliseconds. */
function eventTime(v: unknown, fallback: Date): Date {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  if (typeof v === "string" && v) { const t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v.replace(" ", "T") + "Z"); if (!Number.isNaN(t.getTime())) return t; }
  return fallback;
}

const WHAT_NEXT: Record<IdentityStatus, string> = {
  not_started: "Confirm who you are. It takes about five minutes: you will need your ID document and a phone or computer with a camera.",
  in_progress: "You started confirming your identity but have not finished. You can carry on where you left off.",
  pending: "Thank you. We have your documents and they are being checked. This usually takes a few minutes, and sometimes longer.",
  on_hold: "Your check needs a little more time. We will contact you if we need anything else from you.",
  approved: "Your identity has been confirmed. Thank you.",
  retry: "We could not confirm your identity from what was sent. You can try again with clearer photos of your document.",
  rejected: "We could not confirm your identity. Please contact us and we will help you.",
};
const NOT_FOUND = "We could not find an application with that reference and email address. Check both and try again.";

export function createIdentity(d: { db: Db; config: SumsubConfig; client: SumsubClient; subjects: IdentitySubject[]; now?: () => Date }) {
  const { db, config, client } = d;
  const now = d.now ?? (() => new Date());
  const subjects = new Map(d.subjects.map((s) => [s.kind, s] as const));
  const enabled = () => sumsubReady(config);
  const subject = (kind: unknown) => (typeof kind === "string" ? subjects.get(kind as Kind) : undefined);

  const rowFor = async (kind: Kind, id: string): Promise<Row | null> => ((await db.query(`SELECT * FROM identity_checks WHERE kind = $1 AND subject_id = $2`, [kind, id])).rows[0] as unknown as Row | undefined) ?? null;
  async function ensureRow(kind: Kind, app: { id: string; profile: Profile }): Promise<Row> {
    const existing = await rowFor(kind, app.id); if (existing) return existing;
    try {
      await db.query(`INSERT INTO identity_checks (kind, subject_id, profile, external_user_id, level_name, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
        [kind, app.id, app.profile, `${PREFIX[kind]}-${app.id}`, levelFor(config, app.profile), now()]);
    } catch (e) { if (!isUniqueViolation(e)) throw e; }                    // two requests arriving together: one wins, both read the row
    return (await rowFor(kind, app.id))!;
  }

  // ── what people see ──────────────────────────────────────────────────────
  async function applicantView(kind: Kind, app: { id: string; status: string; profile: Profile }): Promise<IdentityApplicantView> {
    const row = enabled() ? await rowFor(kind, app.id) : null;
    const status = row?.status ?? "not_started";
    const base = WHAT_NEXT[status];
    const message = status === "retry" && row?.client_comment ? `${base} Note from the checker: ${row.client_comment}` : base;      // only the comment Sumsub marks as fit for the applicant
    const closed = !!subject(kind)?.closed.has(app.status);
    return { enabled: enabled(), status, canStart: enabled() && !closed && STARTABLE.has(status), consentRequired: !row?.consent_at, required: isRequired(config, app.profile), message, attempts: row?.attempts ?? 0 };
  }

  /** What an applicant sees for an application they can prove is theirs (the reference with its email address, or being signed in as its owner). */
  async function statusFor(kind: unknown, ref: unknown, email: unknown, userId?: string | null): Promise<{ ok: true; view: IdentityApplicantView } | Fail> {
    const s = subject(kind); if (!s) return { ok: false, status: 400, error: "Unknown kind of application" };
    const app = await s.forApplicant(ref, email, userId); if (!app) return { ok: false, status: 404, error: NOT_FOUND };
    return { ok: true, view: await applicantView(s.kind, app) };
  }

  async function staffView(kind: Kind, app: { id: string; profile: Profile }): Promise<IdentityStaffView> {
    const row = await rowFor(kind, app.id);
    return {
      enabled: enabled(), status: row?.status ?? "not_started", requirement: !enabled() ? "off" : isRequired(config, app.profile) ? "required" : "recommended", confirmed: row?.status === "approved",
      reviewStatus: row?.review_status ?? null, reviewAnswer: row?.review_answer ?? null, rejectType: row?.reject_type ?? null, rejectLabels: row ? parseLabels(row.reject_labels) : [],
      moderationComment: row?.moderation_comment ?? null, clientComment: row?.client_comment ?? null, consentAt: iso(row?.consent_at), attempts: row?.attempts ?? 0, reviewedAt: iso(row?.reviewed_at),
      applicantId: row?.applicant_id ?? null, levelName: row?.level_name ?? null,
      caseUrl: row?.applicant_id ? `https://cockpit.sumsub.com/checkus#/applicant/${encodeURIComponent(row.applicant_id)}` : null,
      override: row?.override_reason && row.overridden_at ? { reason: row.override_reason, by: row.overridden_by ?? "unknown", at: iso(row.overridden_at)! } : null,
    };
  }

  // ── the applicant starts (or carries on) ─────────────────────────────────
  async function startSession(kind: unknown, ref: unknown, email: unknown, consent: unknown, userId?: string | null): Promise<({ ok: true; token: string; expiresInSecs: number; status: IdentityStatus }) | Fail> {
    if (!enabled()) return { ok: false, status: 503, error: "Identity checks are not switched on yet. Please check back soon, or contact us." };
    const s = subject(kind); if (!s) return { ok: false, status: 400, error: "Unknown kind of application" };
    const app = await s.forApplicant(ref, email, userId); if (!app) return { ok: false, status: 404, error: NOT_FOUND };
    if (s.closed.has(app.status)) return { ok: false, status: 409, error: "This application is closed, so there is nothing to confirm." };
    const row = await ensureRow(s.kind, app);
    if (!STARTABLE.has(row.status)) return { ok: false, status: 409, error: WHAT_NEXT[row.status] };
    if (!row.consent_at) {
      if (consent !== true) return { ok: false, status: 400, error: "Please agree to your documents being sent to Sumsub, our identity-verification provider, before you start." };
      await db.query(`UPDATE identity_checks SET consent_at = $3, updated_at = $3 WHERE kind = $1 AND subject_id = $2 AND consent_at IS NULL`, [s.kind, app.id, now()]);
    }
    let applicantId = row.applicant_id;
    if (!applicantId) {
      const made = await client.createApplicant({ externalUserId: row.external_user_id, email: app.email ?? undefined, phone: app.phone ?? undefined, levelName: row.level_name });
      if (!made.ok) { console.error(`[sumsub] could not create the applicant for ${s.kind} ${app.id}: ${made.error}${made.detail ? ` (${made.detail})` : ""}`); return { ok: false, status: 502, error: "We could not start the check just now. Please try again in a few minutes." }; }
      applicantId = made.applicantId;
      await db.query(`UPDATE identity_checks SET applicant_id = $3, updated_at = $4 WHERE kind = $1 AND subject_id = $2 AND applicant_id IS NULL`, [s.kind, app.id, applicantId, now()]);
    }
    const t = await client.accessToken({ externalUserId: row.external_user_id, levelName: row.level_name });
    if (!t.ok) { console.error(`[sumsub] could not issue a token for ${s.kind} ${app.id}: ${t.error}${t.detail ? ` (${t.detail})` : ""}`); return { ok: false, status: 502, error: "We could not start the check just now. Please try again in a few minutes." }; }
    if (row.status === "not_started") await db.query(`UPDATE identity_checks SET status = 'in_progress', updated_at = $3 WHERE kind = $1 AND subject_id = $2 AND status = 'not_started'`, [s.kind, app.id, now()]);
    return { ok: true, token: t.token, expiresInSecs: t.expiresInSecs, status: row.status === "not_started" ? "in_progress" : row.status };
  }

  // ── may staff approve? ───────────────────────────────────────────────────
  /** A kind that must have a confirmed identity cannot be approved without one, unless a Super Administrator overrode it. Nothing is ever blocked while checks are switched off. */
  async function gate(kind: Kind, app: { id: string; profile: Profile }): Promise<{ ok: true } | (Fail & { code: "identity_required" })> {
    if (!isRequired(config, app.profile)) return { ok: true };
    const row = await rowFor(kind, app.id);
    if (row?.status === "approved" || row?.overridden_at) return { ok: true };
    const where: Record<IdentityStatus, string> = {
      not_started: "The applicant has not started confirming their identity.", in_progress: "The applicant started confirming their identity but has not finished.", pending: "The applicant's identity check is still being reviewed.",
      on_hold: "The applicant's identity check is on hold at Sumsub.", approved: "", retry: "Sumsub could not confirm the applicant's identity. They may try again.", rejected: "Sumsub could not confirm the applicant's identity.",
    };
    return { ok: false, status: 409, code: "identity_required", error: `This application cannot be approved until the applicant's identity is confirmed. ${where[row?.status ?? "not_started"]} A Super Administrator can approve it anyway, with a reason.` };
  }

  /** A Super Administrator approves without a confirmed identity. The reason is kept with who and when (and the caller audits it). */
  async function override(kind: Kind, ref: string, reason: unknown, by: string): Promise<{ ok: true; view: IdentityStaffView } | Fail> {
    const s = subject(kind); if (!s) return { ok: false, status: 400, error: "Unknown kind of application" };
    const why = text(reason, 500); if (!why || why.length < 10) return { ok: false, status: 400, error: "Say why in a sentence (at least 10 characters). It is kept with your name." };
    if (!enabled()) return { ok: false, status: 409, error: "Identity checks are not switched on, so there is nothing to override" };
    const app = await s.byRef(ref); if (!app) return { ok: false, status: 404, error: "Application not found" };
    await ensureRow(s.kind, app);
    await db.query(`UPDATE identity_checks SET override_reason = $3, overridden_by = $4, overridden_at = $5, updated_at = $5 WHERE kind = $1 AND subject_id = $2`, [s.kind, app.id, why, by, now()]);
    return { ok: true, view: await staffView(s.kind, app) };
  }

  // ── applying what Sumsub says ────────────────────────────────────────────
  /** Writes a Sumsub state onto the row. An event older than the newest one already applied is ignored. */
  async function apply(row: Row, s: { reviewStatus: string | null; result: SumsubReviewResult | null; at: Date; submitted?: boolean; attempts?: number | null; applicantId?: string | null }): Promise<{ applied: boolean; reason?: string }> {
    const next = identityStatusFor(s.reviewStatus, s.result);
    if (!next) return { applied: false, reason: "not a review state" };
    if (row.last_event_at && s.at.getTime() < new Date(row.last_event_at).getTime()) return { applied: false, reason: "older than what we already have" };
    const done = next === "approved" || next === "retry" || next === "rejected";
    const result = s.result ?? {};
    const attempts = typeof s.attempts === "number" ? Math.max(row.attempts, s.attempts) : row.attempts + (s.submitted ? 1 : 0);
    await db.query(
      `UPDATE identity_checks SET status = $3, review_status = $4, review_answer = $5, reject_type = $6, reject_labels = $7, moderation_comment = $8, client_comment = $9, attempts = $10,
         reviewed_at = $11, last_event_at = $12, applicant_id = COALESCE(applicant_id, $13), updated_at = $14 WHERE kind = $1 AND subject_id = $2`,
      [row.kind, row.subject_id, next, s.reviewStatus, done ? text(result.reviewAnswer, 10)?.toUpperCase() ?? null : null, done ? text(result.reviewRejectType, 10)?.toUpperCase() ?? null : null,
        JSON.stringify(done ? labelsOf(result.rejectLabels) : []), done ? text(result.moderationComment, 2000) : null, done ? text(result.clientComment, 1000) : null, attempts,
        done ? s.at : null, s.at, s.applicantId ?? null, now()]);
    return { applied: true };
  }

  async function applyEvent(payload: unknown): Promise<{ ok: true; applied?: boolean; ignored?: string } | Fail> {
    const p = asObj(payload); const type = str(p?.type); const applicantId = str(p?.applicantId); const external = str(p?.externalUserId);
    if (!p || !type || (!applicantId && !external)) return { ok: false, status: 400, error: "Not a Sumsub event" };
    const found = (await db.query(`SELECT * FROM identity_checks WHERE applicant_id = $1 OR external_user_id = $2 ORDER BY (applicant_id = $1) DESC LIMIT 1`, [applicantId ?? "", external ?? ""])).rows[0] as unknown as Row | undefined;
    if (!found) return { ok: true, ignored: "unknown applicant" };                            // not one of ours (another environment sharing the account): answer success so Sumsub stops retrying
    if (found.applicant_id && applicantId && found.applicant_id !== applicantId) return { ok: true, ignored: "applicant does not match" };
    const id = `${applicantId ?? external}:${type}:${str(p.correlationId) ?? crypto.createHash("sha256").update(JSON.stringify(p)).digest("hex")}`;
    try { await db.query(`INSERT INTO identity_events (id, kind, subject_id, type, received_at) VALUES ($1,$2,$3,$4,$5)`, [id, found.kind, found.subject_id, type.slice(0, 80), now()]); }
    catch (e) { if (isUniqueViolation(e)) return { ok: true, ignored: "duplicate" }; throw e; }
    const reviewStatus = str(p.reviewStatus) ?? EVENT_REVIEW_STATUS[type] ?? null;
    const r = await apply(found, { reviewStatus, result: asObj(p.reviewResult) as SumsubReviewResult | null, at: eventTime(p.createdAtMs ?? p.createdAt, now()), submitted: type === "applicantPending", applicantId });
    return r.applied ? { ok: true, applied: true } : { ok: true, ignored: r.reason };
  }

  /** Staff: ask Sumsub where the check stands now (for an event that never arrived). */
  async function refresh(kind: Kind, ref: string): Promise<{ ok: true; view: IdentityStaffView } | Fail> {
    if (!enabled()) return { ok: false, status: 503, error: "Identity checks are not switched on" };
    const s = subject(kind); if (!s) return { ok: false, status: 400, error: "Unknown kind of application" };
    const app = await s.byRef(ref); if (!app) return { ok: false, status: 404, error: "Application not found" };
    const row = await rowFor(s.kind, app.id);
    if (!row?.applicant_id) return { ok: false, status: 409, error: "The applicant has not started the identity check yet" };
    const st = await client.status(row.applicant_id);
    if (!st.ok) { console.error(`[sumsub] refresh failed for ${s.kind} ${ref}: ${st.error}${st.detail ? ` (${st.detail})` : ""}`); return { ok: false, status: 502, error: "Sumsub could not be reached. Try again in a moment." }; }
    await apply(row, { reviewStatus: st.reviewStatus, result: st.result, at: now(), attempts: st.attempts });
    return { ok: true, view: await staffView(s.kind, app) };
  }

  return { enabled, applicantView, statusFor, staffView, startSession, gate, override, refresh, applyEvent, subject };
}
export type Identity = ReturnType<typeof createIdentity>;
