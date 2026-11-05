import type { Db } from "../portal/common.js";
import { saDay, saDayStart } from "../portal/common.js";

/**
 * MARSHAL COMMISSION (docs/MARSHAL_COMMISSION.md).
 *
 * For every completed trip (a departure the marshal loaded and marked departed) the association's TRIP FEE (R20 by default) is charged to the driver and goes to the ASSOCIATION; the marshal earns a
 * percentage of that fee, the COMMISSION RATE:   commission = trip fee x commission rate.   It is paid through a payslip each pay period (services/payslips.ts).
 *
 * It is OFF for every association until it chooses otherwise:
 *   off         today's behaviour: the marshal fee goes to the marshal, and none of this runs
 *   shadow      the calculation is recorded beside today's payments without moving any money, so it can be compared before anything changes
 *   commission  live: the trip fee is charged to the driver for the association, and the marshal's share accrues for the payslip
 *
 * Money is whole cents; rates are basis points (4000 = 40%). Every calculation is one row that is never edited: a correction is a REVERSAL at the next sequence number. A departure is calculated once
 * (the unique keys on trip_fees and trip_commissions make a retry, an offline resend or a second path to the same departure harmless).
 */
export const ENGINE_VERSION = "commission-1";
export const DEFAULT_TRIP_FEE_CENTS = 2000;
export type Mode = "off" | "shadow" | "commission";
export type PayableOn = "recorded" | "paid";
export type PayPeriod = "weekly" | "fortnightly" | "monthly";

export interface Settings {
  mode: Mode; payableOn: PayableOn; payPeriod: PayPeriod; payPeriodAnchor: string; tiersEnabled: boolean; deductionCapBp: number; uifApplies: boolean; uifRateBp: number; legacyFeeCents: number | null;
}
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
export const commissionOf = (feeCents: number, rateBp: number): number => Math.floor((feeCents * rateBp + 5000) / 10000);       // to the nearest cent, half up

export interface Recorded { status: "recorded" | "exists" | "off" | "no_rate" | "not_found"; departureId?: string; feeCents?: number; rateBp?: number; commissionCents?: number; mode?: "shadow" | "live" }

export function createCommission(db: Db, now: () => Date = () => new Date(), defaults: { tripFeeCents: number } = { tripFeeCents: DEFAULT_TRIP_FEE_CENTS }) {
  /* ───────────────────────── settings ───────────────────────── */
  async function settings(associationId: string): Promise<Settings> {
    const r = (await db.query(`SELECT * FROM association_settings WHERE association_id = $1`, [associationId])).rows[0];
    return {
      mode: (r?.commission_mode ?? "off") as Mode, payableOn: (r?.commission_payable_on ?? "recorded") as PayableOn, payPeriod: (r?.pay_period ?? "weekly") as PayPeriod,
      payPeriodAnchor: r?.pay_period_anchor ? day(r.pay_period_anchor) : "2026-01-05", tiersEnabled: !!r?.tiers_enabled, deductionCapBp: Number(r?.deduction_cap_bp ?? 5000),
      uifApplies: !!r?.uif_applies, uifRateBp: Number(r?.uif_rate_bp ?? 100), legacyFeeCents: r?.marshal_fee_cents === null || r?.marshal_fee_cents === undefined ? null : Number(r.marshal_fee_cents),
    };
  }
  async function updateSettings(associationId: string, p: Partial<Pick<Settings, "mode" | "payableOn" | "payPeriod" | "payPeriodAnchor" | "tiersEnabled" | "deductionCapBp" | "uifApplies" | "uifRateBp">>): Promise<Res<Settings>> {
    if (p.mode !== undefined && !["off", "shadow", "commission"].includes(p.mode)) return bad(400, "The mode must be off, shadow or commission");
    if (p.payableOn !== undefined && !["recorded", "paid"].includes(p.payableOn)) return bad(400, "Commission is payable when the fee is recorded or when it is paid");
    if (p.payPeriod !== undefined && !["weekly", "fortnightly", "monthly"].includes(p.payPeriod)) return bad(400, "The pay period must be weekly, fortnightly or monthly");
    if (p.payPeriodAnchor !== undefined && (!DAY.test(p.payPeriodAnchor) || new Date(p.payPeriodAnchor + "T00:00:00Z").getUTCDay() !== 1)) return bad(400, "The pay period must start on a Monday");
    for (const [k, max] of [["deductionCapBp", 10000], ["uifRateBp", 10000]] as const) { const v = p[k]; if (v !== undefined && (!Number.isInteger(v) || v < 0 || v > max)) return bad(400, `${k === "deductionCapBp" ? "The deduction cap" : "The UIF rate"} must be between 0% and 100%`); }
    if (p.mode && p.mode !== "off") {
      // Switching on needs a rate to calculate with. The trip fee always has one (the association's own, or the country default).
      if (!(await db.query(`SELECT 1 AS x FROM commission_rules WHERE association_id = $1 AND scope = 'default'`, [associationId])).rows.length) return bad(409, "Set the commission rate first: there is nothing to calculate with");
    }
    const cur = await settings(associationId), n = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as Settings;
    await db.query(
      `INSERT INTO association_settings (association_id, commission_mode, commission_payable_on, pay_period, pay_period_anchor, tiers_enabled, deduction_cap_bp, uif_applies, uif_rate_bp, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (association_id) DO UPDATE SET commission_mode = EXCLUDED.commission_mode, commission_payable_on = EXCLUDED.commission_payable_on, pay_period = EXCLUDED.pay_period, pay_period_anchor = EXCLUDED.pay_period_anchor,
         tiers_enabled = EXCLUDED.tiers_enabled, deduction_cap_bp = EXCLUDED.deduction_cap_bp, uif_applies = EXCLUDED.uif_applies, uif_rate_bp = EXCLUDED.uif_rate_bp, updated_at = now()`,
      [associationId, n.mode, n.payableOn, n.payPeriod, n.payPeriodAnchor, n.tiersEnabled, n.deductionCapBp, n.uifApplies, n.uifRateBp]);
    return { ok: true, value: await settings(associationId) };
  }

  /* ───────────────────────── rules (never edited: a new row with a later date supersedes) ───────────────────────── */
  type Row = Record<string, unknown>;
  const latest = (rows: Row[]): Row | undefined => [...rows].sort((a, b) => day(b.effective_from).localeCompare(day(a.effective_from)) || String(b.created_at).localeCompare(String(a.created_at)))[0];

  /** The trip fee in force for a departure on a day: route rule, else rank rule, else association rule, else the association's old marshal-fee setting, else the country default. */
  async function feeFor(associationId: string, rankId: string, routeId: string | null, onDay: string): Promise<{ cents: number; ruleId: string | null }> {
    const rows = (await db.query(`SELECT * FROM trip_fee_rules WHERE association_id = $1 AND effective_from <= $2`, [associationId, onDay])).rows;
    for (const [scope, match] of [["route", (r: Record<string, unknown>) => !!routeId && String(r.route_id) === routeId], ["rank", (r: Record<string, unknown>) => String(r.rank_id) === rankId], ["association", () => true]] as const) {
      const hit = latest(rows.filter((r) => r.scope === scope && match(r)));
      if (hit) return { cents: Number(hit.amount_cents), ruleId: String(hit.id) };
    }
    const legacy = (await settings(associationId)).legacyFeeCents;
    return { cents: legacy ?? defaults.tripFeeCents, ruleId: null };
  }
  /** The commission rate in force: this marshal's own rate, else the rank's, else the association default. With tiers on, a tier replaces a rank or default rate once the marshal has done enough trips that week. */
  async function rateFor(associationId: string, rankId: string, marshalId: string, onDay: string, priorTripsThisWeek: number, tiersEnabled: boolean): Promise<{ rateBp: number; ruleId: string | null; tier: number | null } | null> {
    const rows = (await db.query(`SELECT * FROM commission_rules WHERE association_id = $1 AND effective_from <= $2`, [associationId, onDay])).rows;
    const mine = latest(rows.filter((r) => r.scope === "marshal" && String(r.marshal_id) === marshalId));
    const rank = latest(rows.filter((r) => r.scope === "rank" && String(r.rank_id) === rankId));
    const dflt = latest(rows.filter((r) => r.scope === "default"));
    const base = mine ?? rank ?? dflt;
    if (!base) return null;
    if (tiersEnabled && !mine) {
      const tiers = (await db.query(`SELECT * FROM commission_tiers WHERE association_id = $1 AND effective_from <= $2`, [associationId, onDay])).rows;
      const forRank = tiers.filter((t) => String(t.rank_id) === rankId), set = forRank.length ? forRank : tiers.filter((t) => !t.rank_id);
      const hit = set.filter((t) => Number(t.after_trips) <= priorTripsThisWeek).sort((a, b) => Number(b.after_trips) - Number(a.after_trips) || day(b.effective_from).localeCompare(day(a.effective_from)))[0];
      if (hit) return { rateBp: Number(hit.rate_bp), ruleId: base.id ? String(base.id) : null, tier: Number(hit.after_trips) };
    }
    return { rateBp: Number(base.rate_bp), ruleId: String(base.id), tier: null };
  }
  /** The Monday of the week a day falls in (South African time). */
  const weekStart = (onDay: string): string => { const d = new Date(onDay + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  /** How many of this marshal's trips (not reversed) came earlier in the same week. */
  async function priorTrips(marshalId: string, departedAt: Date, departureId: string): Promise<number> {
    const from = saDayStart(weekStart(saDay(departedAt)));
    const rows = (await db.query(`SELECT c.departure_id, c.departed_at FROM trip_commissions c WHERE c.marshal_id = $1 AND c.seq = 1 AND c.departed_at >= $2`, [marshalId, from])).rows;
    const reversed = new Set((await db.query(`SELECT departure_id FROM trip_commissions WHERE marshal_id = $1 AND reverses_id IS NOT NULL AND departed_at >= $2`, [marshalId, from])).rows.map((x) => String(x.departure_id)));
    return rows.filter((x) => !reversed.has(String(x.departure_id)) && (new Date(x.departed_at as string).getTime() < departedAt.getTime() || (new Date(x.departed_at as string).getTime() === departedAt.getTime() && String(x.departure_id) < departureId))).length;
  }

  async function addFeeRule(associationId: string, by: string, r: { scope?: unknown; rankId?: unknown; routeId?: unknown; amountCents?: unknown; effectiveFrom?: unknown; note?: unknown }): Promise<Res<{ id: string }>> {
    if (!["association", "rank", "route"].includes(String(r.scope))) return bad(400, "The fee applies to the association, a rank or a route");
    if (!Number.isInteger(r.amountCents) || (r.amountCents as number) < 0 || (r.amountCents as number) > 1_000_000) return bad(400, "The trip fee must be a whole number of cents, up to R10 000.00");
    if (typeof r.effectiveFrom !== "string" || !DAY.test(r.effectiveFrom)) return bad(400, "Say the date it takes effect (YYYY-MM-DD)");
    let rankId: string | null = null, routeId: string | null = null;
    if (r.scope === "rank") { if (!(await ownRank(associationId, r.rankId))) return bad(400, "Choose one of your ranks"); rankId = String(r.rankId); }
    if (r.scope === "route") { if (!(await ownRoute(associationId, r.routeId))) return bad(400, "Choose one of your routes"); routeId = String(r.routeId); }
    const row = (await db.query(`INSERT INTO trip_fee_rules (association_id, scope, rank_id, route_id, amount_cents, effective_from, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [associationId, r.scope, rankId, routeId, r.amountCents, r.effectiveFrom, typeof r.note === "string" ? r.note.trim().slice(0, 200) || null : null, by])).rows[0];
    return { ok: true, value: { id: String(row.id) } };
  }
  async function addRate(associationId: string, by: string, r: { scope?: unknown; rankId?: unknown; marshalId?: unknown; rateBp?: unknown; effectiveFrom?: unknown; note?: unknown }): Promise<Res<{ id: string }>> {
    if (!["default", "rank", "marshal"].includes(String(r.scope))) return bad(400, "The rate applies to everyone, a rank or one marshal");
    if (!Number.isInteger(r.rateBp) || (r.rateBp as number) < 0 || (r.rateBp as number) > 10000) return bad(400, "The rate must be between 0% and 100%");
    if (typeof r.effectiveFrom !== "string" || !DAY.test(r.effectiveFrom)) return bad(400, "Say the date it takes effect (YYYY-MM-DD)");
    let rankId: string | null = null, marshalId: string | null = null;
    if (r.scope === "rank") { if (!(await ownRank(associationId, r.rankId))) return bad(400, "Choose one of your ranks"); rankId = String(r.rankId); }
    if (r.scope === "marshal") { if (!(await ownMarshal(associationId, r.marshalId))) return bad(400, "Choose one of your marshals"); marshalId = String(r.marshalId); }
    const row = (await db.query(`INSERT INTO commission_rules (association_id, scope, rank_id, marshal_id, rate_bp, effective_from, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [associationId, r.scope, rankId, marshalId, r.rateBp, r.effectiveFrom, typeof r.note === "string" ? r.note.trim().slice(0, 200) || null : null, by])).rows[0];
    return { ok: true, value: { id: String(row.id) } };
  }
  async function addTier(associationId: string, by: string, r: { rankId?: unknown; afterTrips?: unknown; rateBp?: unknown; effectiveFrom?: unknown }): Promise<Res<{ id: string }>> {
    if (!Number.isInteger(r.afterTrips) || (r.afterTrips as number) < 1 || (r.afterTrips as number) > 10_000) return bad(400, "A tier starts after a whole number of trips in the week, from 1");
    if (!Number.isInteger(r.rateBp) || (r.rateBp as number) < 0 || (r.rateBp as number) > 10000) return bad(400, "The rate must be between 0% and 100%");
    if (typeof r.effectiveFrom !== "string" || !DAY.test(r.effectiveFrom)) return bad(400, "Say the date it takes effect (YYYY-MM-DD)");
    let rankId: string | null = null;
    if (r.rankId !== undefined && r.rankId !== null && r.rankId !== "") { if (!(await ownRank(associationId, r.rankId))) return bad(400, "Choose one of your ranks"); rankId = String(r.rankId); }
    const row = (await db.query(`INSERT INTO commission_tiers (association_id, rank_id, after_trips, rate_bp, effective_from, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [associationId, rankId, r.afterTrips, r.rateBp, r.effectiveFrom, by])).rows[0];
    return { ok: true, value: { id: String(row.id) } };
  }
  const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  const ownRank = async (assoc: string, id: unknown) => isId(id) && (await db.query(`SELECT 1 AS x FROM ranks WHERE id = $1 AND association_id = $2`, [id, assoc])).rows.length > 0;
  const ownRoute = async (assoc: string, id: unknown) => isId(id) && (await db.query(`SELECT 1 AS x FROM token_routes WHERE id = $1 AND association_id = $2`, [id, assoc])).rows.length > 0;
  const ownMarshal = async (assoc: string, id: unknown) => isId(id) && (await db.query(`SELECT 1 AS x FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE m.marshal_id = $1 AND r.association_id = $2`, [id, assoc])).rows.length > 0;

  async function reasonOk(code: unknown, kind: "queue" | "exception" | "fee"): Promise<boolean> {
    return typeof code === "string" && (await db.query(`SELECT 1 AS x FROM reason_codes WHERE code = $1 AND kind = $2 AND active = true`, [code, kind])).rows.length > 0;
  }

  /* ───────────────────────── the calculation ───────────────────────── */
  /**
   * Calculates one departure, once. Safe to call again for the same departure (it finishes whatever was left undone and changes nothing that exists). `exception` is for a trip an admin approved that did not
   * depart normally: the commission counts, the driver is not charged.
   */
  async function recordDeparture(departureId: string, exception?: { code: string; approvedBy: string; reason?: string | null }): Promise<Recorded> {
    const d = (await db.query(`SELECT d.id, d.rank_id, d.vehicle_id, d.driver_id, d.marshal_id, d.departed_at, r.association_id, v.owner_id FROM departures d JOIN ranks r ON r.id = d.rank_id JOIN vehicles v ON v.id = d.vehicle_id WHERE d.id = $1`, [departureId])).rows[0];
    if (!d) return { status: "not_found" };
    const assoc = String(d.association_id), st = await settings(assoc);
    if (st.mode === "off") return { status: "off", departureId };
    const mode = st.mode === "commission" ? "live" : "shadow", departedAt = new Date(d.departed_at as string), onDay = saDay(departedAt);
    const existing = (await db.query(`SELECT * FROM trip_fees WHERE departure_id = $1`, [departureId])).rows[0];
    const route = (await db.query(`SELECT route_id FROM loading_sessions WHERE departure_id = $1`, [departureId])).rows[0];
    const fee = existing ? { cents: Number(existing.amount_cents), ruleId: existing.fee_rule_id ? String(existing.fee_rule_id) : null } : await feeFor(assoc, String(d.rank_id), route?.route_id ? String(route.route_id) : null, onDay);
    const rate = await rateFor(assoc, String(d.rank_id), String(d.marshal_id), onDay, await priorTrips(String(d.marshal_id), departedAt, departureId), st.tiersEnabled);
    if (!rate) return { status: "no_rate", departureId };
    const payer = d.driver_id ?? d.owner_id ?? null;
    let created = false;
    if (!existing) {
      const ins = await db.query(
        `INSERT INTO trip_fees (departure_id, association_id, rank_id, vehicle_id, driver_id, payer_id, amount_cents, fee_rule_id, mode, waived_reason, waived_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (departure_id) DO NOTHING RETURNING id`,
        [departureId, assoc, d.rank_id, d.vehicle_id, d.driver_id ?? null, payer, fee.cents, fee.ruleId, mode, exception ? `exception:${exception.code}` : null, exception ? now() : null]);
      created = ins.rows.length > 0;
    }
    const tf = (await db.query(`SELECT * FROM trip_fees WHERE departure_id = $1`, [departureId])).rows[0];
    // The driver is charged for the association: a payment item the money engine collects (and retries) like any other. Not in shadow mode, not for an approved exception, not for a free trip.
    if (mode === "live" && !tf.payment_item_id && !tf.waived_at && payer && fee.cents > 0) {
      await db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, currency, ref, note, status) VALUES ('trip_fee',$1,$2,$3,$3,'ZAR',$4,'Trip fee','pending') ON CONFLICT (ref) DO NOTHING`, [payer, assoc, fee.cents, `tripfee:${departureId}`]);
      const item = (await db.query(`SELECT id FROM payment_items WHERE ref = $1`, [`tripfee:${departureId}`])).rows[0];
      if (item) await db.query(`UPDATE trip_fees SET payment_item_id = $2 WHERE id = $1 AND payment_item_id IS NULL`, [tf.id, item.id]);
    }
    const commission = commissionOf(fee.cents, rate.rateBp);
    await db.query(
      `INSERT INTO trip_commissions (departure_id, seq, marshal_id, association_id, rank_id, vehicle_id, driver_id, fee_cents, rate_bp, tier_after_trips, commission_cents, fee_rule_id, rate_rule_id, reason_code, reason, approved_by, engine_version, mode, departed_at)
       VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (departure_id, seq) DO NOTHING`,
      [departureId, d.marshal_id, assoc, d.rank_id, d.vehicle_id, d.driver_id ?? null, fee.cents, rate.rateBp, rate.tier, commission, fee.ruleId, rate.ruleId, exception?.code ?? null, exception?.reason ?? null, exception?.approvedBy ?? null, ENGINE_VERSION, mode, departedAt]);
    return { status: created ? "recorded" : "exists", departureId, feeCents: fee.cents, rateBp: rate.rateBp, commissionCents: commission, mode };
  }
  /** After a loading session on a rank device closes, its departure is calculated too. */
  async function recordForSession(sessionId: string): Promise<Recorded | null> {
    const s = (await db.query(`SELECT departure_id FROM loading_sessions WHERE id = $1`, [sessionId])).rows[0];
    return s?.departure_id ? recordDeparture(String(s.departure_id)) : null;
  }

  /** A departure's commission so far: the sum of its rows (the original, less any reversal). */
  async function netCommission(departureId: string): Promise<number> {
    return (await db.query(`SELECT commission_cents FROM trip_commissions WHERE departure_id = $1`, [departureId])).rows.reduce((a, r) => a + Number(r.commission_cents), 0);
  }
  /** Reverses what a departure earned (never an edit: a negative row at the next sequence number, which appears on the marshal's next payslip). */
  async function reverseCommission(departureId: string, by: string, reason: string, reasonCode: string | null = null): Promise<Res<{ reversedCents: number }>> {
    const rows = (await db.query(`SELECT * FROM trip_commissions WHERE departure_id = $1 ORDER BY seq`, [departureId])).rows;
    if (!rows.length) return bad(404, "No commission was calculated for that trip");
    const net = rows.reduce((a, r) => a + Number(r.commission_cents), 0);
    if (net <= 0) return bad(409, "That trip's commission has already been reversed");
    const o = rows[0], seq = Math.max(...rows.map((r) => Number(r.seq))) + 1;
    await db.query(
      `INSERT INTO trip_commissions (departure_id, seq, marshal_id, association_id, rank_id, vehicle_id, driver_id, fee_cents, rate_bp, commission_cents, reverses_id, reason_code, reason, approved_by, engine_version, mode, departed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [departureId, seq, o.marshal_id, o.association_id, o.rank_id, o.vehicle_id, o.driver_id ?? null, -net, o.id, reasonCode, reason.slice(0, 200), by, ENGINE_VERSION, o.mode, o.departed_at]);
    return { ok: true, value: { reversedCents: net } };
  }
  /**
   * Waives a trip fee (not charged, or no longer owed). By default the marshal's commission for that trip is reversed with it; with `absorb` the association takes the loss and the marshal keeps it. A fee the driver
   * has already paid is refunded, not waived, and that is not built here.
   */
  async function waiveFee(departureId: string, by: string, a: { reasonCode: unknown; reason: unknown; absorb?: boolean }): Promise<Res<{ reversedCents: number }>> {
    if (!(await reasonOk(a.reasonCode, "fee"))) return bad(400, "Choose a reason from the list");
    const reason = typeof a.reason === "string" ? a.reason.trim() : "";
    if (!reason || reason.length > 200) return bad(400, "Say why, in 200 characters or fewer");
    const tf = (await db.query(`SELECT * FROM trip_fees WHERE departure_id = $1`, [departureId])).rows[0];
    if (!tf) return bad(404, "No trip fee was recorded for that trip");
    if (tf.waived_at) return bad(409, "That fee is already waived");
    const item = tf.payment_item_id ? (await db.query(`SELECT id, status FROM payment_items WHERE id = $1`, [tf.payment_item_id])).rows[0] : null;
    if (item?.status === "paid") return bad(409, "The driver has already paid that fee: it needs a refund, not a waiver");
    if (item) await db.query(`UPDATE payment_items SET status = 'waived', note = $2 WHERE id = $1 AND status IN ('pending','waiting','arrears')`, [item.id, `Waived: ${reason}`.slice(0, 200)]);
    await db.query(`UPDATE trip_fees SET waived_reason = $2, waived_at = now() WHERE id = $1 AND waived_at IS NULL`, [tf.id, reason]);
    if (a.absorb) return { ok: true, value: { reversedCents: 0 } };
    const r = await reverseCommission(departureId, by, reason, String(a.reasonCode));
    return r.ok ? r : { ok: true, value: { reversedCents: 0 } };
  }
  /**
   * A trip that did not depart normally (returned, cancelled, aborted) counts only if an admin approves it with a reason code. The commission is calculated as for any trip; the driver is not charged.
   */
  async function approveException(associationId: string, by: string, a: { rankId?: unknown; vehicleId?: unknown; marshalId?: unknown; driverId?: unknown; departedAt?: unknown; reasonCode?: unknown; note?: unknown }): Promise<Res<Recorded>> {
    if (!(await reasonOk(a.reasonCode, "exception"))) return bad(400, "Choose a reason from the list");
    if (!(await ownRank(associationId, a.rankId))) return bad(400, "Choose one of your ranks");
    if (!isId(a.vehicleId) || !isId(a.marshalId)) return bad(400, "Choose the vehicle and the marshal");
    if (!(await db.query(`SELECT 1 AS x FROM rank_marshals WHERE rank_id = $1 AND marshal_id = $2`, [a.rankId, a.marshalId])).rows.length) return bad(400, "That marshal does not work at that rank");
    if (!(await db.query(`SELECT 1 AS x FROM vehicles WHERE id = $1`, [a.vehicleId])).rows.length) return bad(404, "Vehicle not found");
    const at = new Date(String(a.departedAt ?? ""));
    if (Number.isNaN(at.getTime()) || at.getTime() > now().getTime() + 60_000) return bad(400, "Say when it was (not in the future)");
    const note = typeof a.note === "string" ? a.note.trim().slice(0, 200) : "";
    if (!note) return bad(400, "Say what happened");
    const dep = (await db.query(`INSERT INTO departures (rank_id, vehicle_id, driver_id, marshal_id, note, departed_at, status, exception_code, approved_by) VALUES ($1,$2,$3,$4,$5,$6,'approved_exception',$7,$8) RETURNING id`,
      [a.rankId, a.vehicleId, isId(a.driverId) ? a.driverId : null, a.marshalId, note, at, a.reasonCode, by])).rows[0];
    const r = await recordDeparture(String(dep.id), { code: String(a.reasonCode), approvedBy: by, reason: note });
    return { ok: true, value: r };
  }
  /** Calculates every departure of the association's ranks that has no trip fee yet (history, or ones missed), oldest first. Used to run in shadow mode over past trips. */
  async function backfill(associationId: string, fromDay: string, limit = 2000): Promise<{ recorded: number; skipped: number }> {
    const have = new Set((await db.query(`SELECT departure_id FROM trip_fees WHERE association_id = $1`, [associationId])).rows.map((x) => String(x.departure_id)));
    const rows = (await db.query(`SELECT d.id FROM departures d JOIN ranks r ON r.id = d.rank_id WHERE r.association_id = $1 AND d.departed_at >= $2 AND d.status = 'completed' ORDER BY d.departed_at, d.id LIMIT 20000`, [associationId, saDayStart(fromDay)]))
      .rows.filter((x) => !have.has(String(x.id))).slice(0, Math.max(1, Math.min(5000, limit)));
    let recorded = 0, skipped = 0;
    for (const x of rows) { const r = await recordDeparture(String(x.id)); r.status === "recorded" ? recorded++ : skipped++; }
    return { recorded, skipped };
  }

  return { settings, updateSettings, feeFor, rateFor, addFeeRule, addRate, addTier, recordDeparture, recordForSession, reverseCommission, waiveFee, approveException, backfill, netCommission, reasonOk, weekStart };
}
export type Commission = ReturnType<typeof createCommission>;

/**
 * What runs when a loading session on a rank device closes: whatever the caller already does (the trip), then the departure's commission. Each is attempted whatever the other does, and a failure of the
 * commission is logged, never allowed to undo a departure that has happened (the departure can always be calculated later: backfill picks up what was missed).
 */
export const sessionClosedHook = (c: Commission, next?: (sessionId: string) => Promise<unknown>) => async (sessionId: string): Promise<void> => {
  let failure: unknown = null;
  try { await next?.(sessionId); } catch (e) { failure = e; }
  try { await c.recordForSession(sessionId); } catch (e) { console.error("[commission] a closed session's commission will be calculated by the next catch-up:", e instanceof Error ? e.message : e); }
  if (failure) throw failure;
};
