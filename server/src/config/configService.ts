import { Router, json } from "express";
import { h, uid, num, iso, isUuid, fail, pageParams, audit, type Db } from "../portal/common.js";
import { computeFee, splitAfcFare } from "./feeEngine.js";
import type { Readiness } from "./readiness.js";
import { COUNTRIES, DEFAULT_ZA, DEFAULT_ZM, diffConfig, validateConfig, type CountryCode, type CountryConfig } from "./countryConfig.js";

/**
 * Country profiles: reading the ACTIVE profile (for the rest of the platform) and the staff-only lifecycle that changes it:
 *
 *   draft --submit--> pending_approval --(N different approvers, never the creator)--> approved --activate--> active   (previous active -> retired)
 *                          \--any rejection--> rejected
 *
 * Mounted at /api/admin/config for owner and superadmin staff accounts. Every step is audited (with the list of changed settings).
 */
export type ProfileStatus = "draft" | "pending_approval" | "approved" | "active" | "retired" | "rejected";
export interface ProfileRow { id: string; country: CountryCode; version: number; status: ProfileStatus; config: CountryConfig; note: string | null; createdBy: string | null; createdAt: string | null; submittedAt: string | null; activatedAt: string | null }

const parseConfig = (v: unknown): CountryConfig => (typeof v === "string" ? JSON.parse(v) : (v as CountryConfig));
const toRow = (r: Record<string, unknown>): ProfileRow => ({
  id: String(r.id), country: r.country_code as CountryCode, version: num(r.version), status: r.status as ProfileStatus, config: parseConfig(r.config),
  note: (r.note as string) ?? null, createdBy: (r.created_by as string) ?? null, createdAt: iso(r.created_at), submittedAt: iso(r.submitted_at), activatedAt: iso(r.activated_at),
});

/** The built-in baseline, used only when the database has no profile yet (and in local runs without a database). */
export const baselineFor = (c: CountryCode): CountryConfig => (c === "ZM" ? DEFAULT_ZM : DEFAULT_ZA);

/** Creates version 1 of each country if it does not exist: South Africa active (it describes today's behaviour), Zambia as a draft. Idempotent. */
export async function ensureBaselineProfiles(db: Db): Promise<void> {
  for (const c of COUNTRIES) {
    const have = (await db.query(`SELECT 1 AS x FROM country_profiles WHERE country_code = $1 LIMIT 1`, [c])).rows.length;
    if (have) continue;
    await db.query(`INSERT INTO country_profiles (country_code, version, status, config, note, activated_at) VALUES ($1, 1, $2, $3, $4, $5)`,
      [c, c === "ZA" ? "active" : "draft", JSON.stringify(baselineFor(c)), c === "ZA" ? "Baseline: the platform's behaviour before configuration existed" : "First Zambia draft (illustrative values)", c === "ZA" ? new Date() : null]);
  }
}

/** Reads the active profile of a country, with a short cache so hot paths (taps) do not query every time. Falls back to the baseline on any failure. */
export function createConfigReader(db: Db | null, ttlMs = 15_000, now: () => number = Date.now) {
  const cache = new Map<CountryCode, { at: number; row: { id: string; version: number; config: CountryConfig } }>();
  return {
    async active(country: CountryCode): Promise<{ id: string | null; version: number; config: CountryConfig; fromBaseline: boolean }> {
      const hit = cache.get(country);
      if (hit && now() - hit.at < ttlMs) return { ...hit.row, fromBaseline: false };
      if (db) {
        try {
          const r = (await db.query(`SELECT id, version, config FROM country_profiles WHERE country_code = $1 AND status = 'active' LIMIT 1`, [country])).rows[0];
          if (r) { const row = { id: String(r.id), version: num(r.version), config: parseConfig(r.config) }; cache.set(country, { at: now(), row }); return { ...row, fromBaseline: false }; }
        } catch (e) { console.error("[config] could not read the active profile; using the baseline:", e instanceof Error ? e.message : e); }
      }
      return { id: null, version: 0, config: baselineFor(country), fromBaseline: true };
    },
    invalidate() { cache.clear(); },
  };
}
export type ConfigReader = ReturnType<typeof createConfigReader>;

/* ───────────────────────── staff API ───────────────────────── */
export interface AdminDeps { db: Db; reader?: ConfigReader; approvalsRequired?: number; readiness?: (cfg: CountryConfig) => Promise<Readiness>; onActivate?: (country: CountryCode, config: CountryConfig) => void }

export function createConfigAdminRouter(d: AdminDeps): Router {
  const router = Router();
  const body = json({ limit: "200kb" });
  const required = Math.max(1, d.approvalsRequired ?? Number(process.env.CONFIG_APPROVALS_REQUIRED ?? 2));
  const get = async (id: string) => { const r = (await d.db.query(`SELECT * FROM country_profiles WHERE id = $1`, [id])).rows[0]; return r ? toRow(r) : null; };
  const activeOf = async (c: CountryCode) => { const r = (await d.db.query(`SELECT * FROM country_profiles WHERE country_code = $1 AND status = 'active'`, [c])).rows[0]; return r ? toRow(r) : null; };
  /** A draft with no owner (the baseline Zambia draft) is adopted by the first staff member who edits or submits it; after that only they may. */
  const claim = async (p: ProfileRow, me: string) => {
    if (p.createdBy === null) { await d.db.query(`UPDATE country_profiles SET created_by = $2 WHERE id = $1 AND created_by IS NULL`, [p.id, me]); p.createdBy = me; }
    return p.createdBy === me;
  };
  const country = (v: unknown): CountryCode | null => (typeof v === "string" && (COUNTRIES as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as CountryCode) : null);

  /** Overview: for each country the active version and any version in progress. */
  router.get("/", h(async (_req, res) => {
    const out = [];
    for (const c of COUNTRIES) {
      const rows = (await d.db.query(`SELECT * FROM country_profiles WHERE country_code = $1 ORDER BY version DESC`, [c])).rows.map(toRow);
      const brief = (p?: ProfileRow) => (p ? { id: p.id, version: p.version, status: p.status, mode: p.config.mode, currency: p.config.currency.code, partner: p.config.partner.bank, activatedAt: p.activatedAt } : null);
      out.push({ country: c, active: brief(rows.find((r) => r.status === "active")), inProgress: brief(rows.find((r) => ["draft", "pending_approval", "approved"].includes(r.status))), versions: rows.length });
    }
    res.json({ success: true, approvalsRequired: required, countries: out });
  }));

  router.get("/:country/versions", h(async (req, res) => {
    const c = country(req.params.country);
    if (!c) { fail(res, 404, "Unknown country"); return; }
    const rows = (await d.db.query(`SELECT * FROM country_profiles WHERE country_code = $1 ORDER BY version DESC LIMIT 50`, [c])).rows.map(toRow);
    res.json({ success: true, versions: rows.map((p) => ({ id: p.id, version: p.version, status: p.status, note: p.note, createdAt: p.createdAt, submittedAt: p.submittedAt, activatedAt: p.activatedAt })) });
  }));

  router.get("/profiles/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const p = await get(req.params.id);
    if (!p) { fail(res, 404, "Profile not found"); return; }
    const approvals = (await d.db.query(`SELECT a.decision, a.note, a.created_at, u.name FROM config_approvals a JOIN users u ON u.id = a.approver_id WHERE a.profile_id = $1 ORDER BY a.created_at`, [p.id])).rows
      .map((a) => ({ approver: a.name, decision: a.decision, note: a.note ?? null, at: iso(a.created_at) }));
    const act = p.status === "active" ? null : await activeOf(p.country);
    res.json({ success: true, profile: p, approvals, approvalsRequired: required, changesFromActive: act ? diffConfig(act.config, p.config) : [] });
  }));

  /** The go-live checklist for a version: what is filled in and what still blocks it. */
  router.get("/profiles/:id/readiness", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const p = await get(req.params.id);
    if (!p) { fail(res, 404, "Profile not found"); return; }
    if (!d.readiness) { fail(res, 503, "The checklist is not available"); return; }
    res.json({ success: true, readiness: await d.readiness(p.config) });
  }));

  /** Validate without saving (used by the editor while typing). */
  router.post("/validate", body, h(async (req, res) => { res.json({ success: true, errors: validateConfig(req.body?.config, country(req.body?.country) ?? undefined) }); }));

  /** Start a new draft: a copy of the active profile (or of a given config). */
  router.post("/:country/drafts", body, h(async (req, res) => {
    const c = country(req.params.country);
    if (!c) { fail(res, 404, "Unknown country"); return; }
    if ((await d.db.query(`SELECT 1 AS x FROM country_profiles WHERE country_code = $1 AND status IN ('draft','pending_approval','approved')`, [c])).rows.length) { fail(res, 409, "There is already a version in progress for this country. Finish or reject it first."); return; }
    const base = req.body?.config ?? (await activeOf(c))?.config ?? baselineFor(c);
    const problems = validateConfig(base, c);
    if (problems.length) { res.status(400).json({ success: false, error: "The configuration is not valid.", problems }); return; }
    const next = num((await d.db.query(`SELECT COALESCE(MAX(version), 0) AS v FROM country_profiles WHERE country_code = $1`, [c])).rows[0]?.v) + 1;
    const r = await d.db.query(`INSERT INTO country_profiles (country_code, version, status, config, created_by, note) VALUES ($1,$2,'draft',$3,$4,$5) RETURNING id`, [c, next, JSON.stringify(base), uid(req), typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : null]);
    await audit(d.db, req, "config.draft.create", String(r.rows[0].id), { country: c, version: next });
    res.status(201).json({ success: true, id: r.rows[0].id, version: next });
  }));

  /** Edit a draft. Only its creator may, and only while it is a draft (once submitted it is frozen so what is approved is what is activated). */
  router.put("/profiles/:id", body, h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const p = await get(req.params.id);
    if (!p) { fail(res, 404, "Profile not found"); return; }
    if (p.status !== "draft") { fail(res, 409, "Only a draft can be edited."); return; }
    if (!(await claim(p, uid(req)))) { fail(res, 403, "Only the person who created this draft can edit it."); return; }
    const problems = validateConfig(req.body?.config, p.country);
    if (problems.length) { res.status(400).json({ success: false, error: "The configuration is not valid.", problems }); return; }
    await d.db.query(`UPDATE country_profiles SET config = $2, note = COALESCE($3, note) WHERE id = $1 AND status = 'draft'`, [p.id, JSON.stringify(req.body.config), typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : null]);
    await audit(d.db, req, "config.draft.update", p.id, { country: p.country, version: p.version, changed: diffConfig(p.config, req.body.config).map((x) => x.path).slice(0, 60) });
    res.json({ success: true });
  }));

  router.post("/profiles/:id/submit", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const p = await get(req.params.id);
    if (!p) { fail(res, 404, "Profile not found"); return; }
    if (p.status !== "draft") { fail(res, 409, "Only a draft can be submitted."); return; }
    if (!(await claim(p, uid(req)))) { fail(res, 403, "Only the person who created this draft can submit it."); return; }
    const problems = validateConfig(p.config, p.country);
    if (problems.length) { res.status(400).json({ success: false, error: "Fix these problems first.", problems }); return; }
    await d.db.query(`UPDATE country_profiles SET status = 'pending_approval', submitted_at = now() WHERE id = $1 AND status = 'draft'`, [p.id]);
    await audit(d.db, req, "config.submit", p.id, { country: p.country, version: p.version, approvalsRequired: required });
    res.json({ success: true, status: "pending_approval", approvalsRequired: required });
  }));

  /** One approval or rejection per approver. The creator can never decide on their own change (maker-checker). */
  router.post("/profiles/:id/decision", body, h(async (req, res) => {
    if (!isUuid(req.params.id) || typeof req.body?.approve !== "boolean") { fail(res, 400, "A profile id and approve (true or false) are required"); return; }
    const p = await get(req.params.id);
    if (!p) { fail(res, 404, "Profile not found"); return; }
    if (p.status !== "pending_approval") { fail(res, 409, "This version is not waiting for approval."); return; }
    if (p.createdBy === uid(req)) { fail(res, 403, "You created this change, so someone else has to approve it."); return; }
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) : null;
    if (!req.body.approve && !note) { fail(res, 400, "Please give a reason when rejecting."); return; }
    if ((await d.db.query(`SELECT 1 AS x FROM config_approvals WHERE profile_id = $1 AND approver_id = $2`, [p.id, uid(req)])).rows.length) { fail(res, 409, "You have already decided on this version."); return; }
    await d.db.query(`INSERT INTO config_approvals (profile_id, approver_id, decision, note) VALUES ($1,$2,$3,$4)`, [p.id, uid(req), req.body.approve ? "approve" : "reject", note]);
    let status: ProfileStatus = "pending_approval";
    if (!req.body.approve) status = "rejected";
    else if (num((await d.db.query(`SELECT COUNT(*) AS n FROM config_approvals WHERE profile_id = $1 AND decision = 'approve'`, [p.id])).rows[0]?.n) >= required) status = "approved";
    if (status !== "pending_approval") await d.db.query(`UPDATE country_profiles SET status = $2 WHERE id = $1 AND status = 'pending_approval'`, [p.id, status]);
    await audit(d.db, req, req.body.approve ? "config.approve" : "config.reject", p.id, { country: p.country, version: p.version, resulting: status, note });
    res.json({ success: true, status });
  }));

  /** Make an approved version the active one. A live profile needs the extra confirmation phrase. */
  router.post("/profiles/:id/activate", body, h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const p = await get(req.params.id);
    if (!p) { fail(res, 404, "Profile not found"); return; }
    if (p.status !== "approved") { fail(res, 409, "Only an approved version can be activated."); return; }
    if (p.config.mode === "live" && req.body?.confirm !== "I_UNDERSTAND_THIS_MOVES_REAL_MONEY") { fail(res, 400, "Going live needs the confirmation phrase I_UNDERSTAND_THIS_MOVES_REAL_MONEY."); return; }
    if (p.config.mode === "live" && d.readiness) {
      const r = await d.readiness(p.config);
      if (!r.ready) { res.status(409).json({ success: false, error: `This country is not ready to go live: ${r.items.filter((i) => i.blocking && !i.ok).map((i) => i.label).join("; ")}.`, readiness: r }); return; }
    }
    const before = await activeOf(p.country);
    await d.db.query(`UPDATE country_profiles SET status = 'retired' WHERE country_code = $1 AND status = 'active'`, [p.country]);
    try { await d.db.query(`UPDATE country_profiles SET status = 'active', activated_at = now(), activated_by = $2 WHERE id = $1 AND status = 'approved'`, [p.id, uid(req)]); }
    catch (e) { if (before) await d.db.query(`UPDATE country_profiles SET status = 'active' WHERE id = $1`, [before.id]); throw e; }   // never leave a country without an active profile
    d.reader?.invalidate();
    try { d.onActivate?.(p.country, p.config); } catch (e) { console.error("[config] onActivate failed:", e instanceof Error ? e.message : e); }
    await audit(d.db, req, "config.activate", p.id, { country: p.country, version: p.version, replaced: before?.version ?? null, changed: before ? diffConfig(before.config, p.config).map((x) => x.path).slice(0, 80) : [] });
    res.json({ success: true, status: "active" });
  }));

  /** What would this fee rule set charge? Used by the admin screen before a draft is submitted. Nothing is stored. */
  router.post("/simulate", body, h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const cfg = b.config ?? (country(b.country) ? (await activeOf(country(b.country)!))?.config : null);
    if (!cfg) { fail(res, 400, "Give a country or a config"); return; }
    const problems = validateConfig(cfg);
    if (problems.length) { res.status(400).json({ success: false, error: "The config is not valid", errors: problems }); return; }
    const amountCents = Number(b.amountCents);
    if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > 100_000_000_000) { fail(res, 400, "amountCents must be a whole number of cents"); return; }
    const out: Record<string, unknown> = { fee: computeFee(cfg.fees.rules, { txn: String(b.txn ?? ""), amountCents, payerType: b.payerType, payeeType: b.payeeType, rail: b.rail, tier: b.tier }) };
    if (b.txn === "afc_tap") out.afcSplit = splitAfcFare(cfg.afc, amountCents);
    res.json({ success: true, ...out });
  }));

  router.get("/audit", h(async (req, res) => {
    const { limit, offset } = pageParams(req, 25, 100);
    const rows = (await d.db.query(`SELECT actor_name, action, target, details, created_at FROM audit_log WHERE action LIKE 'config.%' ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset])).rows;
    res.json({ success: true, entries: rows.map((r) => ({ actor: r.actor_name, action: r.action, target: r.target, details: typeof r.details === "string" ? JSON.parse(r.details) : r.details, at: iso(r.created_at) })) });
  }));

  return router;
}
