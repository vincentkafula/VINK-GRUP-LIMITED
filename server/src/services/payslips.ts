import PDFDocument from "pdfkit";
import type { Db } from "../portal/common.js";
import { createTaxTables, periodsPerYear, payeForPeriod, uifForPeriod, ageOn } from "./tax.js";
import { saDay, saDayStart } from "../portal/common.js";
import type { Commission, Settings } from "./commission.js";

/**
 * MARSHAL PAYSLIPS (docs/MARSHAL_COMMISSION.md).
 *
 * A payslip is computed from the frozen per-trip commission records (services/commission.ts), never from anything typed in:
 *   gross commission = sum of the trips' commission (less any reversal)            other earnings = bonus, incentive, allowance, an upheld dispute's credit
 *   deductions       = UIF (employees only, if switched on), then advances, penalties, association and stokvel contributions, each with a reason and a reference
 *   net pay          = gross commission + other earnings - deductions
 * A trip is on exactly one payslip: issuing a payslip stamps its trips (trip_commissions.payslip_id), so a trip can never be paid twice, a trip recorded late lands on the next payslip as a "late trip", and a
 * reversal of a trip already paid lands on the next payslip as its own line. A payslip that has been issued is never edited. Money is whole cents.
 *
 * Deductions never take more than the association's cap of the payslip (50% by default); what the cap leaves out carries to the next payslip and says so. UIF is exempt from the cap.
 * Not a tax document: no PAYE is calculated.
 */
type Row = Record<string, unknown>;
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
export const addDays = (d: string, n: number): string => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const lastOfMonth = (d: string): string => { const x = new Date(d.slice(0, 8) + "01T00:00:00Z"); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0); return x.toISOString().slice(0, 10); };
/** R2,400.00 (thousands separated by commas, two decimals). */
export const rand = (c: number): string => { const a = Math.abs(c); return `${c < 0 ? "-" : ""}R${String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(a % 100).padStart(2, "0")}`; };

/** The pay period a day falls in: weekly or fortnightly counted from the association's Monday anchor, or the calendar month. */
export function periodFor(s: Pick<Settings, "payPeriod" | "payPeriodAnchor">, onDay: string): { start: string; end: string } {
  if (s.payPeriod === "monthly") return { start: onDay.slice(0, 8) + "01", end: lastOfMonth(onDay) };
  const len = s.payPeriod === "weekly" ? 7 : 14, a = Date.parse(s.payPeriodAnchor + "T00:00:00Z"), d = Date.parse(onDay + "T00:00:00Z");
  const start = addDays(s.payPeriodAnchor, Math.floor((d - a) / 86_400_000 / len) * len);
  return { start, end: addDays(start, len - 1) };
}

export const EARNING_KINDS = ["bonus", "incentive", "allowance", "dispute_credit"] as const;
export const DEDUCTION_KINDS = ["advance", "penalty", "association_fee", "stokvel", "other_deduction"] as const;
const PREFIX: Record<string, string> = { advance: "ADV", penalty: "PEN", association_fee: "FEE", stokvel: "STK", other_deduction: "DED", bonus: "BON", incentive: "INC", allowance: "ALW", dispute_credit: "DSP" };
const LABEL: Record<string, string> = { commission: "Commission", late_trip: "Late-recorded trips", reversal: "Reversed commission", bonus: "Bonus", incentive: "Incentive", allowance: "Allowance", dispute_credit: "Dispute credit", uif: "UIF contribution", advance: "Advance repayment", penalty: "Shortfall or penalty", association_fee: "Association fee", stokvel: "Stokvel contribution", other_deduction: "Deduction" };

export interface Line { side: "earning" | "deduction"; kind: string; label: string; quantity: number | null; unitCents: number | null; rateBp: number | null; amountCents: number; reason: string | null; reference: string | null; adjustmentId: string | null }
export interface Computed {
  payeNotice: string | null;
  lines: Line[]; trips: number; tripFeesCents: number; grossCents: number; otherEarningsCents: number; deductionsCents: number; netCents: number; withheldCents: number; feesOwedTrips: number; feesOwedCents: number;
  carryCents: number; rowIds: string[]; ranks: string[]; adjustmentUse: { id: string; amount: number }[]; payableRows: Row[];
}

export function createPayslips(db: Db, commission: Commission, now: () => Date = () => new Date()) {
  const tax = createTaxTables(db);
  /* ───────────────────────── a marshal's identity, consent and who looked ───────────────────────── */
  /** A marshal's payslip identity: a number (not an ID document: data minimisation), their language, and whether they are an employee. Made on first need. */
  async function ensureProfile(marshalId: string): Promise<Row> {
    const have = (await db.query(`SELECT * FROM marshal_profiles WHERE marshal_id = $1`, [marshalId])).rows[0];
    if (have) return have;
    for (let i = 0; i < 20; i++) {
      const next = Number((await db.query(`SELECT COUNT(*) AS n FROM marshal_profiles`)).rows[0].n) + 1 + i;
      try { await db.query(`INSERT INTO marshal_profiles (marshal_id, marshal_number) VALUES ($1,$2)`, [marshalId, `M-${String(next).padStart(4, "0")}`]); break; } catch { /* a number taken in the meantime: try the next */ }
    }
    return (await db.query(`SELECT * FROM marshal_profiles WHERE marshal_id = $1`, [marshalId])).rows[0];
  }
  async function updateProfile(marshalId: string, p: { language?: unknown; class?: unknown; uifApplies?: unknown; startedOn?: unknown; birthDate?: unknown }): Promise<Res<Row>> {
    if (p.language !== undefined && !["en", "xh", "zu", "af"].includes(String(p.language))) return bad(400, "Choose English, isiXhosa, isiZulu or Afrikaans");
    if (p.class !== undefined && !["independent", "employee"].includes(String(p.class))) return bad(400, "A marshal is independent or an employee");
    if (p.uifApplies !== undefined && typeof p.uifApplies !== "boolean") return bad(400, "UIF applies or it does not");
    if (p.startedOn !== undefined && (typeof p.startedOn !== "string" || !DAY.test(p.startedOn))) return bad(400, "Say the start date (YYYY-MM-DD)");
    // The date of birth decides which PAYE age rebate applies. It is the association's record: a real date, in the past, for someone between 14 and 110. null clears it.
    if (p.birthDate !== undefined && p.birthDate !== null) {
      const d = typeof p.birthDate === "string" && DAY.test(p.birthDate) ? new Date(`${p.birthDate}T00:00:00Z`) : null;
      if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== p.birthDate) return bad(400, "Give the date of birth as YYYY-MM-DD");
      const age = ageOn(p.birthDate as string, new Date(now().getTime() + 2 * 3600_000).toISOString().slice(0, 10)); if (age < 14 || age > 110) return bad(400, "That date of birth is not possible for a working marshal");
    }
    await ensureProfile(marshalId);
    if (p.birthDate !== undefined) await db.query(`UPDATE marshal_profiles SET birth_date = $2 WHERE marshal_id = $1`, [marshalId, p.birthDate]);
    await db.query(`UPDATE marshal_profiles SET language = COALESCE($2, language), class = COALESCE($3, class), uif_applies = COALESCE($4, uif_applies), started_on = COALESCE($5, started_on) WHERE marshal_id = $1`,
      [marshalId, p.language ?? null, p.class ?? null, p.uifApplies ?? null, p.startedOn ?? null]);
    return { ok: true, value: await ensureProfile(marshalId) };
  }
  /** POPIA: consent per purpose, with withdrawal. */
  async function setConsent(userId: string, purpose: string, granted: boolean): Promise<Res<{ purpose: string; granted: boolean }>> {
    if (!/^[a-z_]{3,40}$/.test(purpose)) return bad(400, "Unknown purpose");
    if (granted) await db.query(`INSERT INTO consents (user_id, purpose, granted_at, withdrawn_at) VALUES ($1,$2, now(), NULL) ON CONFLICT (user_id, purpose) DO UPDATE SET granted_at = now(), withdrawn_at = NULL`, [userId, purpose]);
    else await db.query(`UPDATE consents SET withdrawn_at = now() WHERE user_id = $1 AND purpose = $2 AND withdrawn_at IS NULL`, [userId, purpose]);
    return { ok: true, value: { purpose, granted } };
  }
  async function consents(userId: string): Promise<{ purpose: string; granted: boolean; at: string | null }[]> {
    return (await db.query(`SELECT purpose, granted_at, withdrawn_at FROM consents WHERE user_id = $1 ORDER BY purpose`, [userId])).rows.map((r) => ({ purpose: String(r.purpose), granted: !r.withdrawn_at, at: new Date((r.withdrawn_at ?? r.granted_at) as string).toISOString() }));
  }
  /** Who looked at a person's financial records, and what. Never allowed to fail the read it describes. */
  async function logAccess(actorId: string, ownerId: string, what: string, recordId: string | null = null): Promise<void> {
    try { await db.query(`INSERT INTO access_log (actor_id, owner_id, what, record_id) VALUES ($1,$2,$3,$4)`, [actorId, ownerId, what, recordId]); } catch (e) { console.error("[access-log]", e instanceof Error ? e.message : e); }
  }
  async function accessLog(ownerId: string, limit = 50): Promise<{ actor: string; what: string; recordId: string | null; at: string }[]> {
    return (await db.query(`SELECT a.what, a.record_id, a.at, u.name FROM access_log a JOIN users u ON u.id = a.actor_id WHERE a.owner_id = $1 ORDER BY a.at DESC LIMIT ${Math.max(1, Math.min(200, limit))}`, [ownerId]))
      .rows.map((r) => ({ actor: String(r.name ?? ""), what: String(r.what), recordId: r.record_id ? String(r.record_id) : null, at: new Date(r.at as string).toISOString() }));
  }
  const worksFor = async (assoc: string, marshalId: unknown) => typeof marshalId === "string" && (await db.query(`SELECT 1 AS x FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE m.marshal_id = $1 AND r.association_id = $2`, [marshalId, assoc])).rows.length > 0;

  /* ───────────────────────── adjustments: earnings beyond commission, and deductions ───────────────────────── */
  async function addAdjustment(assoc: string, by: string, a: { marshalId?: unknown; kind?: unknown; label?: unknown; reason?: unknown; reference?: unknown; totalCents?: unknown; perPeriodCents?: unknown }): Promise<Res<{ id: string; reference: string }>> {
    const kind = String(a.kind);
    if (![...EARNING_KINDS, ...DEDUCTION_KINDS].includes(kind as never)) return bad(400, "Choose bonus, incentive, allowance, advance, penalty, association fee, stokvel or another deduction");
    if (!(await worksFor(assoc, a.marshalId))) return bad(400, "Choose one of your marshals");
    if (!Number.isInteger(a.totalCents) || (a.totalCents as number) < 1 || (a.totalCents as number) > 10_000_000) return bad(400, "The amount must be a whole number of cents, up to R100 000.00");
    if (a.perPeriodCents !== undefined && a.perPeriodCents !== null && (!Number.isInteger(a.perPeriodCents) || (a.perPeriodCents as number) < 1 || (a.perPeriodCents as number) > (a.totalCents as number))) return bad(400, "The instalment must be a whole number of cents, no more than the total");
    const side = (EARNING_KINDS as readonly string[]).includes(kind) ? "earning" : "deduction";
    const reason = typeof a.reason === "string" ? a.reason.trim().slice(0, 200) : "";
    if (side === "deduction" && !reason) return bad(400, "A deduction needs a reason");
    const label = (typeof a.label === "string" && a.label.trim() ? a.label.trim() : LABEL[kind]).slice(0, 60);
    let reference = typeof a.reference === "string" ? a.reference.trim().slice(0, 40) : "";
    if (!reference) reference = `${PREFIX[kind]}-${String(Number((await db.query(`SELECT COUNT(*) AS n FROM pay_adjustments WHERE association_id = $1`, [assoc])).rows[0].n) + 1).padStart(4, "0")}`;
    const row = (await db.query(`INSERT INTO pay_adjustments (association_id, marshal_id, kind, side, label, reason, reference, total_cents, per_period_cents, remaining_cents, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,$10) RETURNING id`,
      [assoc, a.marshalId, kind, side, label, reason || null, reference, a.totalCents, a.perPeriodCents ?? null, by])).rows[0];
    return { ok: true, value: { id: String(row.id), reference } };
  }
  async function cancelAdjustment(assoc: string, id: string): Promise<Res<{ remainingCents: number }>> {
    const a = (await db.query(`SELECT id, remaining_cents, active FROM pay_adjustments WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0];
    if (!a) return bad(404, "No such adjustment");
    if (!a.active) return bad(409, "That adjustment is already finished or cancelled");
    await db.query(`UPDATE pay_adjustments SET active = false WHERE id = $1`, [id]);
    return { ok: true, value: { remainingCents: Number(a.remaining_cents) } };
  }
  async function adjustments(assoc: string, marshalId?: string): Promise<Row[]> {
    const rows = (await db.query(`SELECT a.*, u.name AS marshal_name FROM pay_adjustments a JOIN users u ON u.id = a.marshal_id WHERE a.association_id = $1 ORDER BY a.created_at DESC LIMIT 200`, [assoc])).rows.filter((r) => !marshalId || String(r.marshal_id) === marshalId);
    return rows.map((r) => ({ id: String(r.id), marshalId: String(r.marshal_id), marshal: String(r.marshal_name ?? ""), kind: String(r.kind), side: String(r.side), label: String(r.label), reason: r.reason ?? null, reference: String(r.reference), totalCents: Number(r.total_cents), perPeriodCents: r.per_period_cents === null ? null : Number(r.per_period_cents), remainingCents: Number(r.remaining_cents), active: !!r.active, createdAt: new Date(r.created_at as string).toISOString() }));
  }

  /* ───────────────────────── computing a payslip ───────────────────────── */
  const SELECT_ROWS = `SELECT c.id, c.departure_id, c.seq, c.fee_cents, c.rate_bp, c.tier_after_trips, c.commission_cents, c.reverses_id, c.reason, c.departed_at, c.rank_id, rk.name AS rank_name, f.waived_at, pi.status AS item_status
      FROM trip_commissions c JOIN ranks rk ON rk.id = c.rank_id LEFT JOIN trip_fees f ON f.departure_id = c.departure_id LEFT JOIN payment_items pi ON pi.id = f.payment_item_id`;

  async function compute(assoc: string, marshalId: string, start: string, end: string, st: Settings): Promise<Computed> {
    const endEx = saDayStart(addDays(end, 1)), startAt = saDayStart(start);
    const all = (await db.query(`${SELECT_ROWS} WHERE c.marshal_id = $1 AND c.association_id = $2 AND c.mode = 'live' AND c.payslip_id IS NULL AND c.departed_at < $3 ORDER BY c.departed_at, c.seq`, [marshalId, assoc, endEx])).rows;
    // Under the "paid" rule a trip's commission waits for its fee to be paid (or waived with the association absorbing it). A reversal of a trip already paid is never held back.
    const held = new Set<string>();
    if (st.payableOn === "paid") for (const r of all) if (Number(r.seq) === 1 && r.item_status !== "paid" && !r.waived_at) held.add(String(r.departure_id));
    const payable = all.filter((r) => !held.has(String(r.departure_id))), withheld = all.filter((r) => held.has(String(r.departure_id)) && Number(r.seq) === 1);
    const originals = payable.filter((r) => Number(r.seq) === 1 && !r.reverses_id), reversals = payable.filter((r) => r.reverses_id);
    const reversedHere = new Set(reversals.map((r) => String(r.departure_id)));
    const inPeriod = originals.filter((r) => new Date(r.departed_at as string).getTime() >= startAt.getTime()), late = originals.filter((r) => new Date(r.departed_at as string).getTime() < startAt.getTime());
    const lines: Line[] = [];
    const group = (rows: Row[], kind: "commission" | "late_trip") => {
      const g = new Map<string, { fee: number; rate: number; tier: number | null; n: number; sum: number }>();
      for (const r of rows) { const k = `${r.fee_cents}|${r.rate_bp}|${r.tier_after_trips ?? ""}`; const x = g.get(k) ?? { fee: Number(r.fee_cents), rate: Number(r.rate_bp), tier: r.tier_after_trips === null ? null : Number(r.tier_after_trips), n: 0, sum: 0 }; x.n++; x.sum += Number(r.commission_cents); g.set(k, x); }
      for (const x of [...g.values()].sort((a, b) => b.rate - a.rate || b.fee - a.fee)) {
        lines.push({ side: "earning", kind, label: `${kind === "late_trip" ? "Late-recorded trips" : "Commission"}: ${x.n} trip${x.n === 1 ? "" : "s"} at ${rand(x.fee)} fee, ${x.rate / 100}%${x.tier ? " (tier)" : ""}`, quantity: x.n, unitCents: x.fee, rateBp: x.rate, amountCents: x.sum, reason: null, reference: null, adjustmentId: null });
      }
    };
    group(inPeriod, "commission"); group(late, "late_trip");
    for (const r of reversals) lines.push({ side: "earning", kind: "reversal", label: `Reversed: trip on ${saDay(new Date(r.departed_at as string))}`, quantity: 1, unitCents: null, rateBp: null, amountCents: Math.abs(Number(r.commission_cents)), reason: (r.reason as string | null) ?? null, reference: null, adjustmentId: null });
    const positive = originals.reduce((a, r) => a + Number(r.commission_cents), 0), reversed = reversals.reduce((a, r) => a + Math.abs(Number(r.commission_cents)), 0);
    const grossCents = Math.max(0, positive - reversed), carryCents = Math.max(0, reversed - positive);
    const adj = (await db.query(`SELECT * FROM pay_adjustments WHERE association_id = $1 AND marshal_id = $2 AND active = true AND remaining_cents > 0 ORDER BY created_at, id`, [assoc, marshalId])).rows;
    const adjustmentUse: { id: string; amount: number }[] = [];
    let other = 0;
    for (const a of adj.filter((x) => x.side === "earning")) {
      const amt = Math.min(Number(a.remaining_cents), a.per_period_cents ? Number(a.per_period_cents) : Number(a.remaining_cents));
      lines.push({ side: "earning", kind: String(a.kind), label: String(a.label), quantity: null, unitCents: null, rateBp: null, amountCents: amt, reason: (a.reason as string | null) ?? null, reference: String(a.reference), adjustmentId: String(a.id) }); adjustmentUse.push({ id: String(a.id), amount: amt }); other += amt;
    }
    const earnings = grossCents + other;
    const prof = await ensureProfile(marshalId);
    let deductions = 0;
    const periods = periodsPerYear(st.payPeriod), table = await tax.forDay(end);
    let uifPaid = 0, payeNotice: string | null = null;
    if (st.uifApplies && prof.class === "employee" && prof.uif_applies) {
      const uif = uifForPeriod(earnings, st.uifRateBp, periods, table);
      if (uif > 0) { lines.push({ side: "deduction", kind: "uif", label: `UIF contribution at ${st.uifRateBp / 100}%`, quantity: null, unitCents: null, rateBp: st.uifRateBp, amountCents: uif, reason: table ? "UIF contribution (on earnings up to the UIF ceiling)" : "UIF contribution", reference: "UIF", adjustmentId: null }); deductions += uif; uifPaid = uif; }
    }
    // PAYE is only for employees, only when the association has switched it on, and only when a tax table covers this period: otherwise none is calculated and the payslip says why. It is an estimate, and statutory, so it sits outside the deduction cap.
    if (st.payeEnabled && prof.class === "employee") {
      if (!table) payeNotice = "PAYE was not calculated: no tax table covers this period. Add the current SARS table under Commission settings.";
      else {
        const age = prof.birth_date ? ageOn(dayOf(prof.birth_date), table.effectiveTo) : null, r = payeForPeriod(Math.max(0, earnings - uifPaid), periods, table, age), paye = Math.min(r.periodPayeCents, Math.max(0, earnings - deductions));
        if (paye > 0) { lines.push({ side: "deduction", kind: "paye", label: "PAYE (estimate)", quantity: null, unitCents: null, rateBp: null, amountCents: paye, reason: `Income tax estimate from the SARS ${table.taxYear} tables (annualised: ${rand(r.annualTaxableCents)} a year, less the ${age !== null && age >= 65 ? "primary and age rebates" : "primary rebate"})`, reference: "PAYE", adjustmentId: null }); deductions += paye; }
        else payeNotice = "No PAYE is due on this pay: it is below the tax threshold.";
      }
    }
    // A cash-out already paid to the marshal (ACC-) comes back off the payslip first, and is outside the cap: it is their own earned commission returning, not a deduction the association chose.
    const isAcc = (a: Row) => String(a.reference).startsWith("ACC-");
    for (const a of adj.filter((x) => x.side === "deduction" && isAcc(x))) {
      const wanted = Math.min(Number(a.remaining_cents), a.per_period_cents ? Number(a.per_period_cents) : Number(a.remaining_cents)), applied = Math.min(wanted, Math.max(0, earnings - deductions));
      if (applied <= 0) continue;
      deductions += applied; adjustmentUse.push({ id: String(a.id), amount: applied });
      lines.push({ side: "deduction", kind: String(a.kind), label: String(a.label), quantity: null, unitCents: null, rateBp: null, amountCents: applied, reason: `${a.reason ?? ""}${applied < wanted ? ` (${rand(wanted - applied)} carried to the next payslip)` : ""}`.trim() || null, reference: String(a.reference), adjustmentId: String(a.id) });
    }
    // The cap: what deductions may take of this payslip. UIF is outside it. Whatever it leaves out stays on the adjustment and carries to the next payslip.
    let room = Math.max(0, Math.min(Math.floor((earnings * st.deductionCapBp) / 10000), earnings - deductions));
    for (const a of adj.filter((x) => x.side === "deduction" && !isAcc(x))) {
      const wanted = Math.min(Number(a.remaining_cents), a.per_period_cents ? Number(a.per_period_cents) : Number(a.remaining_cents)), applied = Math.min(wanted, room);
      if (applied <= 0) continue;
      room -= applied; deductions += applied; adjustmentUse.push({ id: String(a.id), amount: applied });
      const left = Number(a.remaining_cents) - applied;
      lines.push({ side: "deduction", kind: String(a.kind), label: String(a.label), quantity: null, unitCents: null, rateBp: null, amountCents: applied, reason: `${a.reason ?? ""}${applied < wanted ? ` (R${((wanted - applied) / 100).toFixed(2)} carried to the next payslip: deductions are capped at ${st.deductionCapBp / 100}% of the payslip)` : left > 0 ? ` (${rand(left)} still to repay after this)` : ""}`.trim() || null, reference: String(a.reference), adjustmentId: String(a.id) });
    }
    const owed = (await db.query(`SELECT f.amount_cents, f.waived_at, pi.status FROM trip_fees f JOIN departures d ON d.id = f.departure_id LEFT JOIN payment_items pi ON pi.id = f.payment_item_id WHERE d.marshal_id = $1 AND f.association_id = $2 AND f.mode = 'live' AND d.departed_at >= $3 AND d.departed_at < $4`, [marshalId, assoc, startAt, endEx])).rows
      .filter((f) => !f.waived_at && f.status !== "paid" && f.status !== "waived");
    const ranks = [...new Set([...originals, ...reversals].map((r) => String(r.rank_name)))].sort();
    return {
      lines, trips: inPeriod.filter((r) => !reversedHere.has(String(r.departure_id))).length, tripFeesCents: inPeriod.filter((r) => !reversedHere.has(String(r.departure_id))).reduce((a, r) => a + Number(r.fee_cents), 0), grossCents, otherEarningsCents: other, deductionsCents: deductions, netCents: earnings - deductions,
      withheldCents: withheld.reduce((a, r) => a + Number(r.commission_cents), 0), feesOwedTrips: owed.length, feesOwedCents: owed.reduce((a, f) => a + Number(f.amount_cents), 0), carryCents,
      rowIds: payable.map((r) => String(r.id)), ranks, adjustmentUse, payableRows: payable, payeNotice,
    };
  }

  /* ───────────────────────── cash-out of commission already earned ───────────────────────── */
  /** What a marshal has earned that is not yet on a payslip and is safe to draw: trips whose fee has been paid (or waived with the association absorbing it), less any reversal. */
  async function accruedAvailable(assoc: string, marshalId: string): Promise<number> {
    const rows = (await db.query(`${SELECT_ROWS} WHERE c.marshal_id = $1 AND c.association_id = $2 AND c.mode = 'live' AND c.payslip_id IS NULL ORDER BY c.departed_at, c.seq`, [marshalId, assoc])).rows;
    const by = new Map<string, Row[]>(); for (const r of rows) by.set(String(r.departure_id), [...(by.get(String(r.departure_id)) ?? []), r]);
    let total = 0;
    for (const g of by.values()) { const orig = g.find((r) => Number(r.seq) === 1 && !r.reverses_id), net = g.reduce((a, r) => a + Number(r.commission_cents), 0); if (!orig || orig.item_status === "paid" || orig.waived_at) total += net; }
    return Math.max(0, total);
  }
  async function cashOutStatus(assoc: string, marshalId: string): Promise<{ enabled: boolean; availableCents: number; outstandingCents: number; maxCents: number; capBp: number }> {
    const st = await commission.settings(assoc), available = await accruedAvailable(assoc, marshalId);
    const out = (await db.query(`SELECT reference, remaining_cents FROM pay_adjustments WHERE association_id = $1 AND marshal_id = $2 AND active = true`, [assoc, marshalId])).rows.filter((a) => String(a.reference).startsWith("ACC-")).reduce((x, a) => x + Number(a.remaining_cents), 0);
    return { enabled: st.cashoutEnabled, availableCents: available, outstandingCents: out, maxCents: Math.max(0, Math.floor((available * st.cashoutCapBp) / 10000) - out), capBp: st.cashoutCapBp };
  }
  /**
   * A marshal draws part of the commission they have already earned before the payslip. It is paid at once (a payment item from the association, collected and retried by the money engine) and comes back off their
   * next payslip, outside the deduction cap. The most they can draw is the association's share of what has been safely earned, less anything already drawn. Off until the association switches it on.
   */
  async function cashOut(assoc: string, marshalId: string, amountCents: unknown, by: string): Promise<Res<{ reference: string; amountCents: number; maxCents: number }>> {
    const s0 = await cashOutStatus(assoc, marshalId);
    if (!s0.enabled) return bad(409, "Your association has not switched on cash-out");
    if (!(await worksFor(assoc, marshalId))) return bad(403, "You do not work for that association");
    if (!Number.isInteger(amountCents) || (amountCents as number) < 1000) return bad(400, "The least you can draw is R10.00");
    if ((amountCents as number) > s0.maxCents) return bad(409, `You can draw up to ${rand(s0.maxCents)} right now`);
    const reference = `ACC-${String(Number((await db.query(`SELECT COUNT(*) AS n FROM pay_adjustments WHERE association_id = $1`, [assoc])).rows[0].n) + 1).padStart(4, "0")}`;
    const adj = (await db.query(`INSERT INTO pay_adjustments (association_id, marshal_id, kind, side, label, reason, reference, total_cents, remaining_cents, created_by) VALUES ($1,$2,'advance','deduction','Cash-out of accrued commission','Paid before the payslip',$3,$4,$4,$5) RETURNING id`, [assoc, marshalId, reference, amountCents, by])).rows[0];
    // The deduction exists to take back money that has been paid, so if the payment cannot be arranged the deduction must not be left behind: undo it, then let the failure through.
    try { await db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, currency, ref, note, status) VALUES ('marshal_commission',$1,$2,$3,$3,'ZAR',$4,$5,'pending') ON CONFLICT (ref) DO NOTHING`, [assoc, marshalId, amountCents, `cashout:${adj.id}`, `Cash-out ${reference}`]); }
    catch (e) { await db.query(`DELETE FROM pay_adjustments WHERE id = $1`, [adj.id]); throw e; }
    return { ok: true, value: { reference, amountCents: amountCents as number, maxCents: s0.maxCents - (amountCents as number) } };
  }

  /* ───────────────────────── automatic daily cash-out ───────────────────────── */
  async function autoCashOutStatus(marshalId: string): Promise<{ enabled: boolean; minCents: number }> {
    const r = (await db.query(`SELECT auto_cashout, auto_cashout_min_cents FROM marshal_profiles WHERE marshal_id = $1`, [marshalId])).rows[0];
    return { enabled: !!r?.auto_cashout, minCents: Number(r?.auto_cashout_min_cents ?? 5000) };
  }
  /** A marshal chooses to be paid what is safely available each evening, once it reaches a minimum they set. It only runs while their association has cash-out switched on. */
  async function setAutoCashOut(marshalId: string, a: { enabled?: unknown; minCents?: unknown }): Promise<Res<{ enabled: boolean; minCents: number }>> {
    if (typeof a.enabled !== "boolean") return bad(400, "Choose on or off");
    const min = a.minCents === undefined ? (await autoCashOutStatus(marshalId)).minCents : a.minCents;
    if (!Number.isInteger(min) || (min as number) < 1000 || (min as number) > 1_000_000) return bad(400, "The least you can ask for is R10.00 and the most R10 000.00");
    await ensureProfile(marshalId);
    await db.query(`UPDATE marshal_profiles SET auto_cashout = $2, auto_cashout_min_cents = $3 WHERE marshal_id = $1`, [marshalId, a.enabled, min]);
    return { ok: true, value: { enabled: a.enabled, minCents: min as number } };
  }
  /**
   * The daily job: from 17:00 South African time, pays each opted-in marshal what is safely available (see cashOut), if it reaches their minimum. A marshal is paid at most once a day however often this runs: the day is
   * claimed first, and released again if the payment could not be arranged, so a later run can try again.
   */
  async function runAutoCashOuts(at: Date = now()): Promise<{ paid: number; skipped: number; early: boolean }> {
    const sa = new Date(at.getTime() + 2 * 3600_000); if (sa.getUTCHours() < 17) return { paid: 0, skipped: 0, early: true };
    const day = sa.toISOString().slice(0, 10); let paid = 0, skipped = 0;
    for (const prof of (await db.query(`SELECT marshal_id, auto_cashout_min_cents FROM marshal_profiles WHERE auto_cashout = true`)).rows) {
      const marshal = String(prof.marshal_id);
      const assocs = (await db.query(`SELECT DISTINCT r.association_id FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE m.marshal_id = $1`, [marshal])).rows.map((r) => String(r.association_id));
      let done = false;
      for (const a of assocs) {
        const st = await cashOutStatus(a, marshal); if (!st.enabled || st.maxCents < Number(prof.auto_cashout_min_cents)) continue;
        if ((await db.query(`SELECT 1 AS x FROM auto_cashouts WHERE marshal_id = $1 AND day = $2`, [marshal, day])).rows.length) { done = true; break; }                          // already paid today
        const claim = (await db.query(`INSERT INTO auto_cashouts (marshal_id, day) VALUES ($1,$2) ON CONFLICT (marshal_id, day) DO NOTHING RETURNING marshal_id`, [marshal, day])).rows;      // (and if another server claimed it a moment ago, this finds nothing)
        if (!claim.length) { done = true; break; }
        let r: Awaited<ReturnType<typeof cashOut>>;
        try { r = await cashOut(a, marshal, st.maxCents, marshal); }
        catch (e) { await db.query(`DELETE FROM auto_cashouts WHERE marshal_id = $1 AND day = $2`, [marshal, day]); console.error("[cash-out] could not pay a marshal, will try again:", e instanceof Error ? e.message : e); break; }      // one marshal's failure must not stop the others, and must not use up their day
        if (r.ok) { await db.query(`UPDATE auto_cashouts SET amount_cents = $3 WHERE marshal_id = $1 AND day = $2`, [marshal, day, st.maxCents]); paid++; done = true; break; }
        await db.query(`DELETE FROM auto_cashouts WHERE marshal_id = $1 AND day = $2`, [marshal, day]);   // could not be arranged: let a later run try again
      }
      if (!done) skipped++;
    }
    return { paid, skipped, early: false };
  }

  /* ───────────────────────── draft, issue, pay ───────────────────────── */
  async function numberFor(marshalId: string, end: string, assoc: string, suffix = ""): Promise<string> {
    const base = `PS-${end.replace(/-/g, "")}-${String((await ensureProfile(marshalId)).marshal_number).replace("-", "")}${suffix}`;
    let n = base, i = 1;
    while ((await db.query(`SELECT 1 AS x FROM payslips WHERE number = $1`, [n])).rows.length) n = `${base}-${++i}`;
    return n;
  }
  /** Computes a marshal's payslip for a period and saves it as a DRAFT the admin can review (and recompute); nothing is paid and no trip is locked until it is issued. */
  async function draft(assoc: string, marshalId: string, start: string, end: string, by: string): Promise<Res<{ id: string; number: string; empty: boolean }>> {
    if (!DAY.test(start) || !DAY.test(end) || start > end) return bad(400, "Say the period (start and end dates)");
    if (end >= saDay(now())) return bad(409, "That pay period has not finished yet");
    if (!(await worksFor(assoc, marshalId))) return bad(400, "Choose one of your marshals");
    const st = await commission.settings(assoc);
    const prior = (await db.query(`SELECT id, status, version FROM payslips WHERE association_id = $1 AND marshal_id = $2 AND period_start = $3 AND period_end = $4 ORDER BY version DESC LIMIT 1`, [assoc, marshalId, start, end])).rows[0];
    if (prior && prior.status !== "draft" && prior.status !== "revised") return bad(409, "That payslip has already been issued");
    const draftPrior = prior && prior.status === "draft" ? prior : null;                              // a revised one is replaced by a new version, never overwritten
    const c = await compute(assoc, marshalId, start, end, st);
    if (!c.lines.length && !c.withheldCents && !c.carryCents) { if (draftPrior) { await db.query(`DELETE FROM payslip_lines WHERE payslip_id = $1`, [draftPrior.id]); await db.query(`DELETE FROM payslips WHERE id = $1`, [draftPrior.id]); } return { ok: true, value: { id: "", number: "", empty: true } }; }
    let id: string, number: string;
    const fields = [c.ranks.join(", ") || null, c.trips, c.tripFeesCents, c.grossCents, c.otherEarningsCents, c.deductionsCents, c.netCents, c.withheldCents, c.feesOwedTrips, c.feesOwedCents];
    if (draftPrior) {
      id = String(prior.id); number = String((await db.query(`SELECT number FROM payslips WHERE id = $1`, [id])).rows[0].number);
      await db.query(`DELETE FROM payslip_lines WHERE payslip_id = $1`, [id]);
      await db.query(`UPDATE payslips SET ranks=$2, trips=$3, trip_fees_cents=$4, gross_commission_cents=$5, other_earnings_cents=$6, deductions_cents=$7, net_cents=$8, withheld_cents=$9, fees_owed_trips=$10, fees_owed_cents=$11, created_by=$12 WHERE id = $1`, [id, ...fields, by]);
    } else {
      const version = prior ? Number(prior.version) + 1 : 1;
      number = version > 1 ? await numberFor(marshalId, end, assoc, `-R${version - 1}`) : await numberFor(marshalId, end, assoc);
      id = String((await db.query(`INSERT INTO payslips (association_id, marshal_id, number, period_start, period_end, ranks, trips, trip_fees_cents, gross_commission_cents, other_earnings_cents, deductions_cents, net_cents, withheld_cents, fees_owed_trips, fees_owed_cents, created_by, version, supersedes_id)
                                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`, [assoc, marshalId, number, start, end, ...fields, by, version, prior ? prior.id : null])).rows[0].id);
    }
    let sort = 0;
    for (const l of c.lines) await db.query(`INSERT INTO payslip_lines (payslip_id, sort, side, kind, label, quantity, unit_cents, rate_bp, amount_cents, reason, reference, adjustment_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, sort++, l.side, l.kind, l.label, l.quantity, l.unitCents, l.rateBp, l.amountCents, l.reason, l.reference, l.adjustmentId]);
    return { ok: true, value: { id, number, empty: false } };
  }
  /** Drafts a payslip for every marshal of the association with anything to show in the period. */
  async function runPeriod(assoc: string, start: string, end: string, by: string): Promise<Res<{ drafted: number; empty: number }>> {
    const marshals = (await db.query(`SELECT DISTINCT m.marshal_id FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id WHERE r.association_id = $1`, [assoc])).rows.map((r) => String(r.marshal_id));
    let drafted = 0, empty = 0;
    for (const m of marshals) { const r = await draft(assoc, m, start, end, by); if (!r.ok) { if (r.status === 409 && /already been issued/.test(r.error)) continue; return r; } r.value.empty ? empty++ : drafted++; }
    return { ok: true, value: { drafted, empty } };
  }

  /**
   * Issues a draft: the figures are recomputed and must match what the admin reviewed, the trips and the adjustments are stamped as used (so nothing can be paid twice), and the money is arranged:
   * `wallet` creates a payment from the association to the marshal's linked VINK account, collected and retried by the money engine; `bank` or `cash` waits for the admin to record the payment.
   */
  async function issue(assoc: string, payslipId: string, by: string, method: "wallet" | "bank" | "cash"): Promise<Res<{ number: string; status: string; netCents: number }>> {
    if (!["wallet", "bank", "cash"].includes(method)) return bad(400, "Pay by wallet, bank or cash");
    const claimed = (await db.query(`UPDATE payslips SET status = 'issued', issued_at = now(), payment_method = $3 WHERE id = $1 AND association_id = $2 AND status = 'draft' RETURNING *`, [payslipId, assoc, method])).rows[0];
    if (!claimed) return bad((await db.query(`SELECT 1 AS x FROM payslips WHERE id = $1 AND association_id = $2`, [payslipId, assoc])).rows.length ? 409 : 404, "That payslip is not a draft");
    const undo = async () => { await db.query(`UPDATE trip_commissions SET payslip_id = NULL WHERE payslip_id = $1`, [payslipId]); await db.query(`UPDATE payslips SET status = 'draft', issued_at = NULL, payment_method = NULL WHERE id = $1`, [payslipId]); };
    const st = await commission.settings(assoc), start = dayOf(claimed.period_start), end = dayOf(claimed.period_end);
    const c = await compute(assoc, String(claimed.marshal_id), start, end, st);
    if (c.netCents !== Number(claimed.net_cents) || c.grossCents !== Number(claimed.gross_commission_cents) || c.deductionsCents !== Number(claimed.deductions_cents)) { await undo(); return bad(409, "The figures have changed since this draft was made: review it again"); }
    for (const rowId of c.rowIds) {
      const took = (await db.query(`UPDATE trip_commissions SET payslip_id = $1 WHERE id = $2 AND payslip_id IS NULL RETURNING id`, [payslipId, rowId])).rows;
      if (!took.length) { await undo(); return bad(409, "A trip on this payslip was paid on another payslip meanwhile: review it again"); }
    }
    // Each adjustment's balance is reduced only if it is still what the draft was computed from: a second payslip issued at the same moment cannot spend the same advance twice.
    const spent: { id: string; was: number; amount: number }[] = [];
    for (const u of c.adjustmentUse) {
      const was = Number((await db.query(`SELECT remaining_cents FROM pay_adjustments WHERE id = $1`, [u.id])).rows[0]?.remaining_cents ?? -1), left = was - u.amount;
      const took = left >= 0 ? (await db.query(`UPDATE pay_adjustments SET remaining_cents = $2, active = $3 WHERE id = $1 AND remaining_cents = $4 RETURNING id`, [u.id, left, left > 0, was])).rows : [];
      if (!took.length) {
        for (const x of spent) await db.query(`UPDATE pay_adjustments SET remaining_cents = $2, active = $3 WHERE id = $1`, [x.id, x.was, x.was > 0]);
        await undo(); return bad(409, "An advance or deduction on this payslip changed meanwhile: review it again");
      }
      spent.push({ id: u.id, was, amount: u.amount });
    }
    if (c.carryCents > 0) await addAdjustment(assoc, by, { marshalId: claimed.marshal_id, kind: "other_deduction", label: "Reversal carried forward", reason: `A reversal on ${claimed.number} was larger than that period's commission`, reference: `REV-${claimed.number}`.slice(0, 40), totalCents: c.carryCents });
    let item: string | null = null, status = "issued";
    if (c.netCents <= 0) status = "paid";
    else if (method === "wallet") {
      await db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, currency, ref, note, status) VALUES ('marshal_commission',$1,$2,$3,$3,'ZAR',$4,$5,'pending') ON CONFLICT (ref) DO NOTHING`, [assoc, claimed.marshal_id, c.netCents, `payslip:${payslipId}`, `Payslip ${claimed.number}`]);
      item = String((await db.query(`SELECT id FROM payment_items WHERE ref = $1`, [`payslip:${payslipId}`])).rows[0].id);
    }
    await db.query(`UPDATE payslips SET status = $2, payment_item_id = $3, paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE NULL END WHERE id = $1`, [payslipId, status, item]);
    return { ok: true, value: { number: String(claimed.number), status, netCents: c.netCents } };
  }
  /**
   * REVISES an issued payslip that has not been paid (an error found before the money moved): its payment is cancelled, its trips and adjustments are released, and the old payslip stays on record marked
   * "revised". The admin then prepares the period again, which makes a new version (number ending -R1, -R2 ...) that supersedes it. A payslip already paid is corrected by a reversal or credit on the next one instead.
   */
  async function revise(assoc: string, payslipId: string, by: string, note: unknown): Promise<Res<{ number: string }>> {
    const why = typeof note === "string" ? note.trim() : "";
    if (!why || why.length > 200) return bad(400, "Say why it is being revised, in 200 characters or fewer");
    const p = (await db.query(`SELECT * FROM payslips WHERE id = $1 AND association_id = $2`, [payslipId, assoc])).rows[0];
    if (!p) return bad(404, "Payslip not found");
    if (p.status !== "issued") return bad(409, "Only an issued payslip that has not been paid can be revised");
    const item = p.payment_item_id ? (await db.query(`SELECT id, status FROM payment_items WHERE id = $1`, [p.payment_item_id])).rows[0] : null;
    if (item?.status === "paid") return bad(409, "That payslip has already been paid: correct it on the next payslip");
    const claimed = (await db.query(`UPDATE payslips SET status = 'revised', note = $2 WHERE id = $1 AND status = 'issued' RETURNING id`, [payslipId, why])).rows;
    if (!claimed.length) return bad(409, "That payslip changed meanwhile");
    if (item) await db.query(`UPDATE payment_items SET status = 'failed', last_error = 'The payslip was revised' WHERE id = $1 AND status IN ('pending','waiting','arrears')`, [item.id]);
    await db.query(`UPDATE trip_commissions SET payslip_id = NULL WHERE payslip_id = $1`, [payslipId]);
    for (const l of (await db.query(`SELECT adjustment_id, amount_cents FROM payslip_lines WHERE payslip_id = $1 AND adjustment_id IS NOT NULL`, [payslipId])).rows) {
      const now0 = Number((await db.query(`SELECT remaining_cents FROM pay_adjustments WHERE id = $1`, [l.adjustment_id])).rows[0]?.remaining_cents ?? 0);
      await db.query(`UPDATE pay_adjustments SET remaining_cents = $2, active = true WHERE id = $1`, [l.adjustment_id, now0 + Number(l.amount_cents)]);
    }
    await db.query(`UPDATE pay_adjustments SET active = false, remaining_cents = 0 WHERE association_id = $1 AND reference = $2`, [assoc, `REV-${String(p.number)}`.slice(0, 40)]);   // a carry made when it was issued
    void by; return { ok: true, value: { number: String(p.number) } };
  }
  /** Records that an issued payslip was paid outside the system (bank or cash), with the date and a reference. */
  async function recordPayment(assoc: string, payslipId: string, by: string, a: { method?: unknown; reference?: unknown; paidAt?: unknown }): Promise<Res<{ status: string }>> {
    if (!["bank", "cash"].includes(String(a.method))) return bad(400, "Record a bank or cash payment");
    const reference = typeof a.reference === "string" ? a.reference.trim().slice(0, 60) : "";
    if (!reference) return bad(400, "Give a payment reference");
    const at = typeof a.paidAt === "string" && DAY.test(a.paidAt) ? new Date(a.paidAt + "T12:00:00+02:00") : now();
    if (at.getTime() > now().getTime() + 86_400_000) return bad(400, "The payment date cannot be in the future");
    const r = (await db.query(`UPDATE payslips SET status = 'paid', paid_at = $3, payment_method = $4, payment_reference = $5 WHERE id = $1 AND association_id = $2 AND status = 'issued' AND payment_item_id IS NULL RETURNING id`, [payslipId, assoc, at, a.method, reference])).rows;
    if (!r.length) return bad(409, "That payslip is not waiting for a bank or cash payment");
    void by; return { ok: true, value: { status: "paid" } };
  }
  /** A payslip paid through the wallet becomes paid once the money engine has paid its item. */
  async function syncPayment(payslipId: string): Promise<void> {
    const p = (await db.query(`SELECT p.id, p.status, i.status AS item_status, i.paid_at, i.ref FROM payslips p JOIN payment_items i ON i.id = p.payment_item_id WHERE p.id = $1`, [payslipId])).rows[0];
    if (p && p.status === "issued" && p.item_status === "paid") await db.query(`UPDATE payslips SET status = 'paid', paid_at = $2, payment_reference = COALESCE(payment_reference, $3) WHERE id = $1 AND status = 'issued'`, [payslipId, p.paid_at ?? now(), `PAY-${String(p.ref).slice(8, 16)}`]);
  }

  /* ───────────────────────── reading a payslip ───────────────────────── */
  async function dailyBreakdown(p: Row): Promise<{ date: string; rank: string; trips: number; feesCents: number; commissionCents: number; late: boolean }[]> {
    const rows = p.status === "draft" ? (await compute(String(p.association_id), String(p.marshal_id), dayOf(p.period_start), dayOf(p.period_end), await commission.settings(String(p.association_id)))).payableRows
      : (await db.query(`${SELECT_ROWS} WHERE c.payslip_id = $1 ORDER BY c.departed_at, c.seq`, [p.id])).rows;
    const start = dayOf(p.period_start), g = new Map<string, { date: string; rank: string; trips: number; feesCents: number; commissionCents: number; late: boolean }>();
    const reversedHere = new Set(rows.filter((r) => r.reverses_id).map((r) => String(r.departure_id)));
    for (const r of rows) {
      const date = saDay(new Date(r.departed_at as string)), key = `${date}|${r.rank_name}`;
      const x = g.get(key) ?? { date, rank: String(r.rank_name), trips: 0, feesCents: 0, commissionCents: 0, late: date < start };
      if (Number(r.seq) === 1 && !r.reverses_id && !reversedHere.has(String(r.departure_id))) { x.trips++; x.feesCents += Number(r.fee_cents); }
      x.commissionCents += Number(r.commission_cents); g.set(key, x);
    }
    return [...g.values()].sort((a, b) => a.date.localeCompare(b.date) || a.rank.localeCompare(b.rank));
  }
  /** Year to date: this and the earlier issued payslips since the later of the marshal's start date and 1 January. */
  async function yearToDate(p: Row): Promise<{ from: string; grossCents: number; deductionsCents: number; netCents: number }> {
    const end = dayOf(p.period_end), prof = await ensureProfile(String(p.marshal_id));
    const from = [`${end.slice(0, 4)}-01-01`, prof.started_on ? dayOf(prof.started_on) : ""].sort().at(-1)!;
    const rows = (await db.query(`SELECT id, status, period_end, gross_commission_cents, other_earnings_cents, deductions_cents, net_cents FROM payslips WHERE association_id = $1 AND marshal_id = $2`, [p.association_id, p.marshal_id])).rows
      .filter((r) => (r.status === "issued" || r.status === "paid" || String(r.id) === String(p.id)) && dayOf(r.period_end) <= end && dayOf(r.period_end) >= from);
    return { from, grossCents: rows.reduce((a, r) => a + Number(r.gross_commission_cents) + Number(r.other_earnings_cents), 0), deductionsCents: rows.reduce((a, r) => a + Number(r.deductions_cents), 0), netCents: rows.reduce((a, r) => a + Number(r.net_cents), 0) };
  }
  async function view(payslipId: string, scope: { associationId?: string; marshalId?: string }): Promise<Res<Record<string, unknown>>> {
    const p = (await db.query(`SELECT p.*, a.name AS association_name, m.name AS marshal_name FROM payslips p JOIN users a ON a.id = p.association_id JOIN users m ON m.id = p.marshal_id WHERE p.id = $1`, [payslipId])).rows[0];
    if (!p || (scope.associationId && String(p.association_id) !== scope.associationId) || (scope.marshalId && String(p.marshal_id) !== scope.marshalId)) return bad(404, "Payslip not found");
    if (scope.marshalId && p.status === "draft") return bad(404, "Payslip not found");                                    // a marshal never sees a draft
    await syncPayment(payslipId);
    const q = (await db.query(`SELECT p.status, p.paid_at, p.payment_reference, p.payment_method FROM payslips p WHERE p.id = $1`, [payslipId])).rows[0];
    const lines = (await db.query(`SELECT * FROM payslip_lines WHERE payslip_id = $1 ORDER BY sort`, [payslipId])).rows;
    const prof = await ensureProfile(String(p.marshal_id));
    const item = p.payment_item_id ? (await db.query(`SELECT status, last_error FROM payment_items WHERE id = $1`, [p.payment_item_id])).rows[0] : null;
    const owedRule = (await commission.settings(String(p.association_id))).payableOn;
    return { ok: true, value: {
      id: String(p.id), number: String(p.number), status: String(q.status), version: Number(p.version), association: String(p.association_name), marshal: String(p.marshal_name), marshalNumber: String(prof.marshal_number), ranks: p.ranks ? String(p.ranks) : "",
      periodStart: dayOf(p.period_start), periodEnd: dayOf(p.period_end), issuedAt: p.issued_at ? new Date(p.issued_at as string).toISOString() : null,
      trips: Number(p.trips), tripFeeTotalCents: Number(p.trip_fees_cents), grossCommissionCents: Number(p.gross_commission_cents), otherEarningsCents: Number(p.other_earnings_cents), deductionsCents: Number(p.deductions_cents), netCents: Number(p.net_cents),
      withheldCents: Number(p.withheld_cents), feesOwedTrips: Number(p.fees_owed_trips), feesOwedCents: Number(p.fees_owed_cents), commissionPayableOn: owedRule,
      lines: lines.map((l) => ({ id: String(l.id), side: String(l.side), kind: String(l.kind), label: String(l.label), quantity: l.quantity === null ? null : Number(l.quantity), unitCents: l.unit_cents === null ? null : Number(l.unit_cents), rateBp: l.rate_bp === null ? null : Number(l.rate_bp), amountCents: Number(l.amount_cents), reason: l.reason ?? null, reference: l.reference ?? null })),
      payment: { method: q.payment_method ?? null, reference: q.payment_reference ?? null, paidAt: q.paid_at ? new Date(q.paid_at as string).toISOString() : null, waiting: item && item.status !== "paid" ? String(item.last_error ?? "Waiting to be paid") : null },
      daily: await dailyBreakdown(p), ytd: await yearToDate(p),
      note: await footerNote(p, lines),
    } };
  }
  /** What the payslip's footer says about tax: what was calculated, how, and what it is not. */
  async function footerNote(p: Row, lines: Row[]): Promise<string> {
    const base = "Generated from system trip records.";
    if (lines.some((l) => l.kind === "paye")) return `${base} PAYE is an estimate from the SARS tables (annualised method, primary rebate only: no age rebate, medical credit or retirement deduction). It is not a tax certificate: the association reconciles PAYE in its own returns.`;
    if ((await commission.settings(String(p.association_id))).payeEnabled && (await ensureProfile(String(p.marshal_id))).class === "employee")
      return `${base} ${(await tax.forDay(dayOf(p.period_end))) ? "No PAYE is due on this pay: it is below the tax threshold." : "PAYE was not calculated: no tax table covers this period."} This is not a tax document.`;
    return `${base} This is not a tax document: no PAYE has been calculated.`;
  }
  async function list(scope: { associationId: string; marshalId?: string }, o: { start?: string; end?: string } = {}): Promise<Row[]> {
    const rows = (await db.query(`SELECT p.id, p.number, p.period_start, p.period_end, p.status, p.trips, p.gross_commission_cents, p.deductions_cents, p.net_cents, p.version, p.issued_at, p.paid_at, m.name AS marshal_name, m.id AS marshal_id FROM payslips p JOIN users m ON m.id = p.marshal_id WHERE p.association_id = $1 ORDER BY p.period_end DESC, m.name, p.version DESC LIMIT 300`, [scope.associationId])).rows
      .filter((r) => (!scope.marshalId || (String(r.marshal_id) === scope.marshalId && r.status !== "draft")) && (!o.start || dayOf(r.period_start) === o.start) && (!o.end || dayOf(r.period_end) === o.end));
    return rows.map((r) => ({ id: String(r.id), number: String(r.number), periodStart: dayOf(r.period_start), periodEnd: dayOf(r.period_end), status: String(r.status), trips: Number(r.trips), grossCents: Number(r.gross_commission_cents), deductionsCents: Number(r.deductions_cents), netCents: Number(r.net_cents), marshalId: String(r.marshal_id), marshal: String(r.marshal_name), issuedAt: r.issued_at ? new Date(r.issued_at as string).toISOString() : null, paidAt: r.paid_at ? new Date(r.paid_at as string).toISOString() : null }));
  }
  /** A marshal's own issued and paid payslips, across every association they have worked for (never a draft). */
  async function listForMarshal(marshalId: string): Promise<Row[]> {
    const rows = (await db.query(`SELECT p.id, p.number, p.period_start, p.period_end, p.status, p.trips, p.gross_commission_cents, p.deductions_cents, p.net_cents, a.name AS association_name FROM payslips p JOIN users a ON a.id = p.association_id WHERE p.marshal_id = $1 ORDER BY p.period_end DESC, p.version DESC LIMIT 200`, [marshalId])).rows.filter((r) => r.status !== "draft");
    return rows.map((r) => ({ id: String(r.id), number: String(r.number), association: String(r.association_name), periodStart: dayOf(r.period_start), periodEnd: dayOf(r.period_end), status: String(r.status), trips: Number(r.trips), grossCents: Number(r.gross_commission_cents), deductionsCents: Number(r.deductions_cents), netCents: Number(r.net_cents) }));
  }
  /** The marshals of an association with their payslip identity, for the admin. */
  async function marshals(assoc: string): Promise<Row[]> {
    const rows = (await db.query(`SELECT DISTINCT m.marshal_id, u.name, u.email FROM rank_marshals m JOIN ranks r ON r.id = m.rank_id JOIN users u ON u.id = m.marshal_id WHERE r.association_id = $1 ORDER BY u.name`, [assoc])).rows;
    const out: Row[] = [];
    for (const m of rows) { const p = await ensureProfile(String(m.marshal_id)); out.push({ id: String(m.marshal_id), name: String(m.name ?? ""), email: String(m.email ?? ""), marshalNumber: String(p.marshal_number), language: String(p.language), class: String(p.class), uifApplies: !!p.uif_applies, startedOn: p.started_on ? dayOf(p.started_on) : null, birthDate: p.birth_date ? dayOf(p.birth_date) : null }); }
    return out;
  }

  /* ───────────────────────── the PDF ───────────────────────── */
  function pdf(v: Record<string, any>): Promise<Buffer> {           // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40, compress: false, info: { Title: `Payslip ${v.number}`, Author: String(v.association) } });
      const parts: Buffer[] = [];
      doc.on("data", (c: Buffer) => parts.push(c)); doc.on("end", () => resolve(Buffer.concat(parts))); doc.on("error", reject);
      const W = doc.page.width - 80, L = 40, INK = "#111111", MUTED = "#555555", RED = "#C8102E";
      const row = (a: string, b: string, bold = false) => { const y = doc.y; doc.font(bold ? "Helvetica-Bold" : "Helvetica", 10).fillColor(INK).text(a, L, y, { width: W - 110 }); doc.font(bold ? "Helvetica-Bold" : "Helvetica", 10).text(b, L + W - 110, y, { width: 110, align: "right" }); doc.y = Math.max(doc.y, y + 14); };
      const h2 = (t: string) => { doc.moveDown(0.6).font("Helvetica-Bold", 11).fillColor(RED).text(t.toUpperCase(), L, doc.y); doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).strokeColor("#DDDDDD").lineWidth(0.5).stroke(); doc.moveDown(0.35); };
      doc.font("Helvetica-Bold", 16).fillColor(INK).text(String(v.association), L, 40); doc.font("Helvetica", 10).fillColor(MUTED).text(`PAYSLIP ${v.number}`, L, doc.y + 2);
      doc.moveDown(0.4).font("Helvetica", 10).fillColor(INK).text(`Marshal: ${v.marshal}      Marshal no.: ${v.marshalNumber}      Rank: ${v.ranks || "-"}`, L, doc.y);
      doc.text(`Period: ${v.periodStart} to ${v.periodEnd}      Issued: ${v.issuedAt ? String(v.issuedAt).slice(0, 10) : "draft"}`, L, doc.y);
      h2("Earnings");
      row("Trips completed", String(v.trips)); row("Total trip fees generated", rand(v.tripFeeTotalCents));
      for (const l of v.lines.filter((x: any) => x.side === "earning")) row(l.label + (l.reference ? ` (${l.reference})` : ""), `${l.kind === "reversal" ? "-" : ""}${rand(l.amountCents)}`);
      row("Total earnings", rand(v.grossCommissionCents + v.otherEarningsCents), true);
      h2("Deductions");
      const ded = v.lines.filter((x: any) => x.side === "deduction"); if (!ded.length) row("None", rand(0));
      for (const l of ded) { row(`${l.label}${l.reference ? ` (${l.reference})` : ""}`, rand(l.amountCents)); if (l.reason) { doc.font("Helvetica", 8).fillColor(MUTED).text(l.reason, L + 8, doc.y - 2, { width: W - 130 }); doc.moveDown(0.2); } }
      row("Total deductions", rand(v.deductionsCents), true);
      doc.moveDown(0.5).font("Helvetica-Bold", 14).fillColor(INK).text(`NET PAY: ${rand(v.netCents)}`, L, doc.y);
      h2("Payment"); row("Method", v.payment.method ? String(v.payment.method) : "not yet paid"); row("Paid", v.payment.paidAt ? String(v.payment.paidAt).slice(0, 10) : "-"); row("Reference", v.payment.reference ?? "-");
      h2(`Year to date (from ${v.ytd.from})`); row("Gross", rand(v.ytd.grossCents)); row("Deductions", rand(v.ytd.deductionsCents)); row("Net", rand(v.ytd.netCents), true);
      if (v.feesOwedTrips) { doc.moveDown(0.4).font("Helvetica", 9).fillColor(MUTED).text(`Trip fees still owed by drivers for this period: ${v.feesOwedTrips} trip${v.feesOwedTrips === 1 ? "" : "s"} (${rand(v.feesOwedCents)}).${v.commissionPayableOn === "paid" ? ` Commission on these trips (${rand(v.withheldCents)}) is held until the fee is paid.` : " Your commission is counted when the fee is recorded, so this does not change your pay."}`, L, doc.y, { width: W }); }
      h2("Daily breakdown"); doc.font("Helvetica-Bold", 9).fillColor(MUTED).text("Date", L, doc.y); const hy = doc.y - 11;
      doc.text("Rank", L + 80, hy); doc.text("Trips", L + 220, hy, { width: 40, align: "right" }); doc.text("Trip fees", L + 280, hy, { width: 100, align: "right" }); doc.text("Commission", L + W - 100, hy, { width: 100, align: "right" }); doc.y = hy + 14;
      for (const d of v.daily) { const y = doc.y; if (y > doc.page.height - 90) { doc.addPage(); doc.y = 40; } const yy = doc.y; doc.font("Helvetica", 9).fillColor(INK).text(`${d.date}${d.late ? " (late)" : ""}`, L, yy, { width: 78 }); doc.text(String(d.rank), L + 80, yy, { width: 135 }); doc.text(String(d.trips), L + 220, yy, { width: 40, align: "right" }); doc.text(rand(d.feesCents), L + 280, yy, { width: 100, align: "right" }); doc.text(rand(d.commissionCents), L + W - 100, yy, { width: 100, align: "right" }); doc.y = yy + 13; }
      doc.moveDown(0.8).font("Helvetica", 8).fillColor(MUTED).text(String(v.note), L, doc.y, { width: W });
      doc.end();
    });
  }

  return { periodFor, ensureProfile, updateProfile, setConsent, consents, logAccess, accessLog, addAdjustment, cancelAdjustment, adjustments, compute, draft, runPeriod, issue, recordPayment, revise, cashOut, cashOutStatus, autoCashOutStatus, setAutoCashOut, runAutoCashOuts, syncPayment, view, list, listForMarshal, marshals, pdf, dailyBreakdown };
}
export type Payslips = ReturnType<typeof createPayslips>;
