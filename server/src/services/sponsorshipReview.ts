import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import {
  REVIEW_CRITERIA, SCORE_MAX, DEFAULT_WEIGHTS, MAX_WEIGHT, CATEGORIES, STATUS_LABELS, weightedScore, type CriterionId, type StatusId,
} from "../config/sponsorship.js";
import { clean, labelOf, round2, iso, asJson } from "./sponsorshipUtil.js";

/**
 * How applications are judged, and who is looking at them.
 *
 *  - Weights: how much each review criterion counts. Until a Super Administrator sets them every criterion counts the same.
 *  - Scores: each reviewer gives 0 to 5 on every criterion; scoring again replaces their own scores. A score is shown beside the application to help people decide.
 *    Nothing here moves an application: only a person, with a reason, does that (the status route).
 *  - Approval limit: an optional amount in rand above which only a Super Administrator may approve.
 *  - Assignment: who is looking after an application.
 *  - Reports: totals by status, category, place and month, and a spreadsheet of every application.
 */
export type Weights = Record<CriterionId, number>;
export interface Settings { weights: Weights; approvalLimitZar: number | null }
type Bad = { ok: false; status: number; error: string };
const bad = (status: number, error: string): Bad => ({ ok: false, status, error });

export function createSponsorshipReview(deps: { db: Db; now?: () => Date; sectionName: string }) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  // ── settings ────────────────────────────────────────────────────────────
  async function settings(): Promise<Settings> {
    const rows = (await db.query(`SELECT key, value FROM sponsorship_settings`)).rows;
    const get = (k: string) => { const r = rows.find((x) => x.key === k); return r ? asJson<unknown>(r.value) : undefined; };
    const w = (get("weights") ?? {}) as Record<string, unknown>;
    const weights = { ...DEFAULT_WEIGHTS };
    for (const c of REVIEW_CRITERIA) if (typeof w[c.id] === "number" && Number.isFinite(w[c.id] as number)) weights[c.id] = w[c.id] as number;
    const lim = get("approval_limit_zar");
    return { weights, approvalLimitZar: typeof lim === "number" && lim > 0 ? lim : null };
  }

  async function setSettings(by: string, input: { weights?: unknown; approvalLimitZar?: unknown }): Promise<{ ok: true; settings: Settings } | Bad> {
    const put = (key: string, value: unknown) => db.query(
      `INSERT INTO sponsorship_settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = $4`,
      [key, JSON.stringify(value), by, now()]);
    if (input.weights !== undefined) {
      const w = (input.weights ?? {}) as Record<string, unknown>; const out: Record<string, number> = {};
      for (const c of REVIEW_CRITERIA) {
        const v = w[c.id];
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_WEIGHT) return bad(400, `The weight for "${c.label}" must be a number from 0 to ${MAX_WEIGHT}`);
        out[c.id] = round2(v);
      }
      if (Object.values(out).every((v) => v === 0)) return bad(400, "At least one criterion must count for something");
      await put("weights", out);
    }
    if (input.approvalLimitZar !== undefined) {
      const l = input.approvalLimitZar;
      if (l === null || l === "") await db.query(`DELETE FROM sponsorship_settings WHERE key = 'approval_limit_zar'`);
      else if (typeof l === "number" && Number.isFinite(l) && l > 0 && l <= 1e9) await put("approval_limit_zar", round2(l));
      else return bad(400, "The approval limit must be an amount in rand above 0, or empty for no limit");
    }
    return { ok: true, settings: await settings() };
  }

  /** May this person approve this application? Above the limit only a Super Administrator may. An amount that could not be converted to rand is treated as above it. */
  async function mayApprove(ref: string, isSuper: boolean): Promise<{ ok: true } | Bad> {
    const lim = (await settings()).approvalLimitZar;
    if (lim === null || isSuper) return { ok: true };
    const a = (await db.query(`SELECT amount_zar FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0];
    if (!a) return bad(404, "Application not found");
    const zar = a.amount_zar === null || a.amount_zar === undefined ? null : Number(a.amount_zar);
    if (zar === null || zar > lim) return bad(403, `Approvals above R${lim.toLocaleString("en-ZA")} need a Super Administrator${zar === null ? " (this amount could not be converted to rand)" : ""}`);
    return { ok: true };
  }

  // ── scores ──────────────────────────────────────────────────────────────
  async function saveScore(ref: string, reviewer: { id: string; name: string }, input: { scores?: unknown; comment?: unknown }): Promise<{ ok: true; total: number | null } | Bad> {
    const app = (await db.query(`SELECT id FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0];
    if (!app) return bad(404, "Application not found");
    const raw = (input.scores ?? {}) as Record<string, unknown>; const scores: Record<string, number> = {};
    for (const c of REVIEW_CRITERIA) {
      const v = raw[c.id];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > SCORE_MAX) return bad(400, `Score "${c.label}" from 0 to ${SCORE_MAX}`);
      scores[c.id] = v;
    }
    const comment = clean(input.comment, 1000);
    await db.query(
      `INSERT INTO sponsorship_scores (id, application_id, reviewer_id, reviewer_name, scores, comment, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       ON CONFLICT (application_id, reviewer_id) DO UPDATE SET scores = $5, comment = $6, reviewer_name = $4, updated_at = $7`,
      [crypto.randomUUID(), app.id, reviewer.id, reviewer.name, JSON.stringify(scores), comment || null, now()]);
    return { ok: true, total: weightedScore(scores, (await settings()).weights) };
  }

  async function scoresFor(applicationId: string) {
    const weights = (await settings()).weights;
    const rows = (await db.query(`SELECT reviewer_id, reviewer_name, scores, comment, updated_at FROM sponsorship_scores WHERE application_id = $1 ORDER BY updated_at, reviewer_name`, [applicationId])).rows;
    const reviewers = rows.map((r) => { const scores = asJson<Record<string, number>>(r.scores); return { reviewerId: String(r.reviewer_id), reviewerName: String(r.reviewer_name), scores, comment: r.comment ? String(r.comment) : null, total: weightedScore(scores, weights), updatedAt: iso(r.updated_at) }; });
    const totals = reviewers.map((r) => r.total).filter((t): t is number => t !== null);
    return { weights, reviewers, average: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null };
  }

  // ── assignment ──────────────────────────────────────────────────────────
  /** The people an application can be handed to: Super Administrators and people approved for the sponsorship section. */
  async function staff() {
    const rows = (await db.query(
      `SELECT DISTINCT u.id, u.name, u.role FROM users u LEFT JOIN section_permissions p ON p.user_id = u.id AND p.section = $1
       WHERE u.role IN ('owner','superadmin') OR p.user_id IS NOT NULL ORDER BY u.name`, [deps.sectionName])).rows;
    return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "Staff"), role: String(r.role) }));
  }
  async function assign(ref: string, userId: unknown): Promise<{ ok: true; assignedTo: string | null; assignedName: string | null } | Bad> {
    const app = (await db.query(`SELECT id FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0];
    if (!app) return bad(404, "Application not found");
    if (userId === null || userId === "") { await db.query(`UPDATE sponsorship_applications SET assigned_to = NULL, updated_at = $2 WHERE id = $1`, [app.id, now()]); return { ok: true, assignedTo: null, assignedName: null }; }
    const person = (await staff()).find((p) => p.id === userId);
    if (!person) return bad(400, "Choose someone who works on sponsorships");
    await db.query(`UPDATE sponsorship_applications SET assigned_to = $2, updated_at = $3 WHERE id = $1`, [app.id, person.id, now()]);
    return { ok: true, assignedTo: person.id, assignedName: person.name };
  }
  async function assignmentOf(applicationId: string) {
    const r = (await db.query(`SELECT a.assigned_to, u.name FROM sponsorship_applications a LEFT JOIN users u ON u.id = a.assigned_to WHERE a.id = $1`, [applicationId])).rows[0];
    return { assignedTo: r?.assigned_to ? String(r.assigned_to) : null, assignedName: r?.name ? String(r.name) : null };
  }

  // ── reports ─────────────────────────────────────────────────────────────
  type Range = { from?: string; to?: string };
  const inRange = (r: Range) => {
    const where: string[] = [], p: unknown[] = [];
    if (r.from && /^\d{4}-\d{2}-\d{2}$/.test(r.from)) { p.push(new Date(r.from + "T00:00:00Z")); where.push(`a.created_at >= $${p.length}`); }
    if (r.to && /^\d{4}-\d{2}-\d{2}$/.test(r.to)) { p.push(new Date(new Date(r.to + "T00:00:00Z").getTime() + 86400_000)); where.push(`a.created_at < $${p.length}`); }
    return { sql: where.length ? "WHERE " + where.join(" AND ") : "", p };
  };

  /** Every application in the range with what it was awarded and paid, in rand where it could be worked out. */
  async function rowsFor(r: Range) {
    const w = inRange(r);
    const apps = (await db.query(`SELECT a.id, a.ref, a.status, a.created_at, a.organisation, a.applicant_name, a.email, a.org_type, a.category, a.province, a.country, a.currency, a.amount_requested, a.amount_zar, a.project_title
      FROM sponsorship_applications a ${w.sql} ORDER BY a.created_at`, w.p)).rows;
    const awards = (await db.query(`SELECT application_id, id, amount, currency, amount_zar, stage FROM sponsorship_awards`)).rows;
    const pays = (await db.query(`SELECT award_id, amount FROM sponsorship_payments`)).rows;
    const scores = (await db.query(`SELECT application_id, scores FROM sponsorship_scores`)).rows;
    const weights = (await settings()).weights;
    const awardOf = new Map(awards.map((x) => [String(x.application_id), x]));
    const paidOf = new Map<string, number>(); for (const x of pays) paidOf.set(String(x.award_id), (paidOf.get(String(x.award_id)) ?? 0) + Number(x.amount));
    const totalsOf = new Map<string, number[]>();
    for (const x of scores) { const t = weightedScore(asJson<Record<string, number>>(x.scores), weights); if (t !== null) totalsOf.set(String(x.application_id), [...(totalsOf.get(String(x.application_id)) ?? []), t]); }
    return apps.map((a) => {
      const aw = awardOf.get(String(a.id)); const paid = aw ? paidOf.get(String(aw.id)) ?? 0 : 0;
      const ratio = aw && aw.amount_zar !== null && aw.amount_zar !== undefined && Number(aw.amount) > 0 ? Number(aw.amount_zar) / Number(aw.amount) : null;
      const t = totalsOf.get(String(a.id)) ?? [];
      return {
        ref: String(a.ref), status: String(a.status), createdAt: iso(a.created_at), organisation: String(a.organisation), applicant: String(a.applicant_name), email: String(a.email), orgType: String(a.org_type),
        category: String(a.category), province: a.province ? String(a.province) : "", country: String(a.country), currency: String(a.currency), requested: Number(a.amount_requested),
        requestedZar: a.amount_zar === null || a.amount_zar === undefined ? null : Number(a.amount_zar), project: String(a.project_title),
        awarded: aw ? Number(aw.amount) : null, awardedZar: aw && aw.amount_zar !== null && aw.amount_zar !== undefined ? Number(aw.amount_zar) : null, awardStage: aw ? String(aw.stage) : null,
        disbursed: aw ? paid : null, disbursedZar: ratio === null || !aw ? null : round2(paid * ratio), score: t.length ? Math.round((t.reduce((x, y) => x + y, 0) / t.length) * 10) / 10 : null,
      };
    });
  }

  async function summary(r: Range) {
    const rows = await rowsFor(r);
    const sum = (xs: (number | null)[]) => round2(xs.reduce<number>((a, b) => a + (b ?? 0), 0));
    const group = (key: (x: (typeof rows)[number]) => string, label: (k: string) => string) => {
      const m = new Map<string, typeof rows>(); for (const x of rows) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
      return [...m.entries()].map(([k, v]) => ({ id: k, label: label(k), count: v.length, requestedZar: sum(v.map((x) => x.requestedZar)), awardedZar: sum(v.map((x) => x.awardedZar)) })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    };
    const byStatus = Object.keys(STATUS_LABELS).map((s) => ({ id: s, label: STATUS_LABELS[s as StatusId], count: rows.filter((x) => x.status === s).length }));
    const scored = rows.map((x) => x.score).filter((x): x is number => x !== null);
    return {
      total: rows.length, byStatus,
      byCategory: group((x) => x.category, (k) => labelOf(CATEGORIES, k)),
      byLocation: group((x) => (x.country === "South Africa" ? x.province || "South Africa" : x.country), (k) => k),
      byMonth: group((x) => x.createdAt.slice(0, 7), (k) => k).sort((a, b) => a.id.localeCompare(b.id)),
      totals: { requestedZar: sum(rows.map((x) => x.requestedZar)), awardedZar: sum(rows.map((x) => x.awardedZar)), disbursedZar: sum(rows.map((x) => x.disbursedZar)), notConverted: rows.filter((x) => x.requestedZar === null).length },
      scores: { reviewed: scored.length, average: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null },
    };
  }

  /** Every application as spreadsheet rows. */
  async function exportRows(r: Range) {
    const rows = await rowsFor(r);
    const columns = ["Reference", "Received", "Status", "Organisation", "Applicant", "Email", "Organisation type", "Category", "Province or region", "Country", "Project", "Currency", "Requested", "Requested (ZAR)", "Awarded", "Awarded (ZAR)", "Paid out", "Paid out (ZAR)", "Average score (%)"];
    return { columns, rows: rows.map((x) => [x.ref, x.createdAt.slice(0, 10), STATUS_LABELS[x.status as StatusId] ?? x.status, x.organisation, x.applicant, x.email, x.orgType, labelOf(CATEGORIES, x.category), x.province, x.country, x.project, x.currency, x.requested, x.requestedZar ?? "", x.awarded ?? "", x.awardedZar ?? "", x.disbursed ?? "", x.disbursedZar ?? "", x.score ?? ""]) };
  }

  return { settings, setSettings, mayApprove, saveScore, scoresFor, staff, assign, assignmentOf, summary, exportRows };
}
export type SponsorshipReview = ReturnType<typeof createSponsorshipReview>;
