import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay, daysBetween } from "./compliance.js";

/**
 * OWNER AND DRIVER MONEY (docs/OWNER_DASHBOARD.md, slice A): what the owner expects from each vehicle's driver, what has actually been paid, and where it is earmarked.
 *   target          a daily amount on the working days, or a weekly amount on a chosen day, per vehicle (one open at a time; a new one closes the old, so the history stays)
 *   pause           days a vehicle is off the road: the target does not accrue on them
 *   payment         what the owner received from the driver, in cash or otherwise. Never deleted: a mistake is voided with a reason. A client reference makes a retry (an offline sync, a double tap) change nothing
 *   waiver          the owner's decision not to chase part of a shortfall, with who, when and why
 *   reconciliation  expected against received, with arrears CARRIED FORWARD until paid or waived, and a surplus carried forward as credit
 *   split           how a vehicle's payments are earmarked (owner, association, finance instalment, maintenance), in basis points that total 100%; fixed per payment when it is recorded
 * This is BOOKKEEPING. It records and earmarks; it moves no money, and it does not change the platform's agreement or collection. All money is integer cents. A driver's pay is whatever the owner and driver agreed: this never computes it.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
export const BUCKETS = ["owner", "association", "finance", "maintenance"] as const;
export type Bucket = (typeof BUCKETS)[number];
export interface Split { ownerBp: number; associationBp: number; financeBp: number; maintenanceBp: number }
export const DEFAULT_SPLIT: Split = { ownerBp: 10000, associationBp: 0, financeBp: 0, maintenanceBp: 0 };
export const MAX_CENTS = 10_000_000;                                                   // R100 000: no single target or payment is larger
const METHODS = ["cash", "eft", "vink", "other"] as const;
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** 0 Monday ... 6 Sunday. */
export const weekdayIndex = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
const rand = (c: number) => `R${(c / 100).toFixed(2)}`;

/** Splits an amount of cents by basis points so the parts ALWAYS add up to the amount exactly: each part is rounded down, and the cents left over go to the parts with the largest remainders (ties in the order owner, association, finance, maintenance). */
export function allocate(cents: number, split: Split): Record<Bucket, number> {
  const bps = [split.ownerBp, split.associationBp, split.financeBp, split.maintenanceBp], raw = bps.map((bp) => (cents * bp) / 10000), base = raw.map((x) => Math.floor(x));
  let left = cents - base.reduce((a, b) => a + b, 0); const order = raw.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  // What is left over is the sum of the fractional parts, so it is always smaller than the number of non-zero shares: a share of zero can never be given a cent.
  for (const o of order) { if (left <= 0) break; base[o.i]++; left--; }
  return { owner: base[0], association: base[1], finance: base[2], maintenance: base[3] };
}
const splitOf = (r: Row | undefined): Split => (r ? { ownerBp: Number(r.owner_bp), associationBp: Number(r.association_bp), financeBp: Number(r.finance_bp), maintenanceBp: Number(r.maintenance_bp) } : DEFAULT_SPLIT);

export interface Flag { id: string; severity: "high" | "medium" | "low"; message: string; subject: string }
export function createDriverTargets(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now());
  const ownVehicle = async (owner: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT id, registration, driver_id FROM vehicles WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] ?? null : null);
  const ownDriver = async (owner: string, id: unknown) => typeof id === "string" && UUID.test(id) && (await db.query(`SELECT 1 AS x FROM owner_drivers WHERE owner_id = $1 AND driver_id = $2 AND status = 'active'`, [owner, id])).rows.length > 0;

  /* ───────────────────────── targets and pauses ───────────────────────── */
  const targetOf = (t: Row) => ({ id: String(t.id), vehicleId: String(t.vehicle_id), driverId: (t.driver_id as string | null) ?? null, period: String(t.period), amountCents: Number(t.amount_cents), workingDays: Number(t.working_days), dueWeekday: Number(t.due_weekday), startDate: dayOf(t.start_date)!, endDate: dayOf(t.end_date), agreementId: (t.agreement_id as string | null) ?? null, terms: (t.terms as string | null) ?? null });
  /** Sets the payment expected from a vehicle's driver from a date. The vehicle's current target (if any) ends the day before, so the history is kept and nothing is rewritten. */
  async function setTarget(owner: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(owner, b.vehicleId); if (!v) return bad(404, "That vehicle is not yours");
    if (b.period !== "daily" && b.period !== "weekly") return bad(400, "A target is daily or weekly"); if (!Number.isInteger(b.amountCents) || (b.amountCents as number) < 1 || (b.amountCents as number) > MAX_CENTS) return bad(400, `The amount is a whole number of cents, up to ${rand(MAX_CENTS)}`);
    const wd = b.workingDays === undefined ? 63 : b.workingDays, dw = b.dueWeekday === undefined ? 7 : b.dueWeekday; if (!Number.isInteger(wd) || (wd as number) < 1 || (wd as number) > 127) return bad(400, "Choose at least one working day"); if (!Number.isInteger(dw) || (dw as number) < 1 || (dw as number) > 7) return bad(400, "The weekly due day is 1 (Monday) to 7 (Sunday)");
    if (!isDay(b.startDate) || (b.startDate as string) > shift(today(), 31)) return bad(400, "Give the date it starts (not more than a month ahead)"); const terms = text(b.terms, 1000); if (terms === false) return bad(400, "The terms are too long");
    let driver: string | null = null; if (b.driverId !== undefined && b.driverId !== null && b.driverId !== "") { if (!(await ownDriver(owner, b.driverId))) return bad(400, "Choose one of your drivers"); driver = String(b.driverId); } else if (v.driver_id) driver = String(v.driver_id);
    let agreement: string | null = null; if (b.agreementId !== undefined && b.agreementId !== null && b.agreementId !== "") { const a = typeof b.agreementId === "string" && UUID.test(b.agreementId) ? (await db.query(`SELECT id, driver_id FROM driver_agreements WHERE id = $1 AND owner_id = $2`, [b.agreementId, owner])).rows[0] : null; if (!a) return bad(400, "Choose one of your driver agreements"); if (driver && String(a.driver_id) !== driver) return bad(400, "That agreement is with a different driver"); agreement = String(a.id); }
    const open = (await db.query(`SELECT * FROM vehicle_targets WHERE vehicle_id = $1 AND end_date IS NULL`, [v.id])).rows[0];
    if (open) { if ((b.startDate as string) <= dayOf(open.start_date)!) return bad(409, `The new target must start after the current one started (${dayOf(open.start_date)})`); await db.query(`UPDATE vehicle_targets SET end_date = $2 WHERE id = $1`, [open.id, shift(b.startDate as string, -1)]); }
    const later = (await db.query(`SELECT 1 AS x FROM vehicle_targets WHERE vehicle_id = $1 AND start_date >= $2`, [v.id, b.startDate])).rows.length; if (later) return bad(409, "A target already starts on or after that date");
    const r = (await db.query(`INSERT INTO vehicle_targets (owner_id, vehicle_id, driver_id, period, amount_cents, working_days, due_weekday, start_date, agreement_id, terms, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [owner, v.id, driver, b.period, b.amountCents, wd, dw, b.startDate, agreement, terms, by])).rows[0]; return { ok: true, value: { id: String(r.id) } };
  }
  async function endTarget(owner: string, id: string, endDate: unknown): Promise<Res<{ id: string }>> {
    const t = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM vehicle_targets WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] : null; if (!t) return bad(404, "That target was not found"); if (t.end_date) return bad(409, "That target has already ended");
    if (!isDay(endDate) || (endDate as string) < dayOf(t.start_date)! || (endDate as string) > today()) return bad(400, "Give the last day it applies (after it started, not in the future)"); await db.query(`UPDATE vehicle_targets SET end_date = $2 WHERE id = $1`, [id, endDate]); return { ok: true, value: { id } };
  }
  async function targets(owner: string, vehicleId?: string) { return (await db.query(`SELECT t.*, v.registration FROM vehicle_targets t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.owner_id = $1 ORDER BY v.registration, t.start_date DESC`, [owner])).rows.filter((t) => !vehicleId || String(t.vehicle_id) === vehicleId).map((t) => ({ ...targetOf(t), registration: String(t.registration) })); }
  const pauseOf = (p: Row) => ({ id: String(p.id), vehicleId: String(p.vehicle_id), fromDate: dayOf(p.from_date)!, toDate: dayOf(p.to_date)!, reason: String(p.reason) });
  /** Marks days a vehicle was or will be off the road, so the target does not accrue on them. */
  async function addPause(owner: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(owner, b.vehicleId); if (!v) return bad(404, "That vehicle is not yours"); if (!isDay(b.fromDate) || !isDay(b.toDate) || (b.toDate as string) < (b.fromDate as string)) return bad(400, "Give the first and last day off the road"); if ((b.fromDate as string) < shift(today(), -400) || (b.toDate as string) > shift(today(), 366)) return bad(400, "Those dates are too far from today");
    const reason = text(b.reason, 120); if (!reason) return bad(400, "Say why it is off the road"); const r = (await db.query(`INSERT INTO target_pauses (owner_id, vehicle_id, from_date, to_date, reason) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [owner, v.id, b.fromDate, b.toDate, reason])).rows[0]; return { ok: true, value: { id: String(r.id) } };
  }
  /** A pause that has not started yet can be cancelled; one that has is part of the record. */
  async function cancelPause(owner: string, id: string): Promise<Res<{ id: string }>> {
    const p = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM target_pauses WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] : null; if (!p) return bad(404, "That pause was not found"); if (dayOf(p.from_date)! <= today()) return bad(409, "That pause has already started, so it stays on the record");
    await db.query(`DELETE FROM target_pauses WHERE id = $1`, [id]); return { ok: true, value: { id } };
  }
  async function pauses(owner: string, vehicleId?: string) { return (await db.query(`SELECT * FROM target_pauses WHERE owner_id = $1 ORDER BY from_date DESC`, [owner])).rows.filter((p) => !vehicleId || String(p.vehicle_id) === vehicleId).map(pauseOf); }

  /* ───────────────────────── the split ───────────────────────── */
  async function splitFor(vehicleId: string, onDay: string): Promise<Split> { return splitOf((await db.query(`SELECT * FROM vehicle_split_rules WHERE vehicle_id = $1`, [vehicleId])).rows.filter((r) => dayOf(r.effective_from)! <= onDay).sort((a, b) => dayOf(b.effective_from)!.localeCompare(dayOf(a.effective_from)!))[0]); }
  /** Sets how a vehicle's payments are earmarked from a date (today or later). The four shares are basis points and must total 10 000 (100%). Payments already recorded keep the earmarks they had. */
  async function setSplit(owner: string, by: string, vehicleId: string, b: Record<string, unknown>): Promise<Res<Split & { effectiveFrom: string }>> {
    const v = await ownVehicle(owner, vehicleId); if (!v) return bad(404, "That vehicle is not yours"); const parts = [b.ownerBp, b.associationBp, b.financeBp, b.maintenanceBp]; if (!parts.every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 10000)) return bad(400, "Each share is a whole number of basis points (100 = 1%)");
    const total = (parts as number[]).reduce((a, x) => a + x, 0); if (total !== 10000) return bad(400, `The shares must total 100% (10 000 basis points); these total ${total / 100}%`);
    const from = b.effectiveFrom === undefined ? today() : b.effectiveFrom; if (!isDay(from) || (from as string) < today() || (from as string) > shift(today(), 366)) return bad(400, "A new split starts today or later");
    await db.query(`DELETE FROM vehicle_split_rules WHERE vehicle_id = $1 AND effective_from = $2`, [v.id, from]); await db.query(`INSERT INTO vehicle_split_rules (owner_id, vehicle_id, owner_bp, association_bp, finance_bp, maintenance_bp, effective_from, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [owner, v.id, ...(parts as number[]), from, by]);
    return { ok: true, value: { ownerBp: parts[0] as number, associationBp: parts[1] as number, financeBp: parts[2] as number, maintenanceBp: parts[3] as number, effectiveFrom: from as string } };
  }

  /* ───────────────────────── payments and waivers ───────────────────────── */
  /** Records what the owner received from the driver. A retry with the same client reference returns the first record and changes nothing. The payment is earmarked by the vehicle's split rule on the day it was paid. */
  async function recordPayment(owner: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string; duplicate: boolean; allocations: Record<Bucket, number> }>> {
    const ref = text(b.clientRef, 64); if (ref === false) return bad(400, "The reference is too long");
    if (ref) { const dup = (await db.query(`SELECT id FROM driver_payments WHERE owner_id = $1 AND client_ref = $2`, [owner, ref])).rows[0]; if (dup) { const al = (await db.query(`SELECT bucket, cents FROM driver_payment_allocations WHERE payment_id = $1`, [dup.id])).rows; return { ok: true, value: { id: String(dup.id), duplicate: true, allocations: Object.fromEntries(BUCKETS.map((k) => [k, Number(al.find((a) => a.bucket === k)?.cents ?? 0)])) as Record<Bucket, number> } }; } }
    const v = await ownVehicle(owner, b.vehicleId); if (!v) return bad(404, "That vehicle is not yours"); if (!Number.isInteger(b.amountCents) || (b.amountCents as number) < 1 || (b.amountCents as number) > MAX_CENTS) return bad(400, `The amount is a whole number of cents, up to ${rand(MAX_CENTS)}`);
    if (!METHODS.includes(b.method as never)) return bad(400, "Say how it was paid: cash, EFT, VINK or other"); if (!isDay(b.paidOn) || (b.paidOn as string) > today() || (b.paidOn as string) < shift(today(), -400)) return bad(400, "Give the date it was paid (not in the future, and within the last 400 days)"); const note = text(b.note, 200); if (note === false) return bad(400, "The note is too long");
    let driver: string | null = null; if (b.driverId !== undefined && b.driverId !== null && b.driverId !== "") { if (!(await ownDriver(owner, b.driverId))) return bad(400, "Choose one of your drivers"); driver = String(b.driverId); } else { const t = (await db.query(`SELECT driver_id FROM vehicle_targets WHERE vehicle_id = $1 AND start_date <= $2 AND (end_date IS NULL OR end_date >= $2)`, [v.id, b.paidOn])).rows[0]; driver = (t?.driver_id as string | null) ?? (v.driver_id as string | null) ?? null; }
    const split = await splitFor(String(v.id), b.paidOn as string), parts = allocate(b.amountCents as number, split);
    const r = (await db.query(`INSERT INTO driver_payments (owner_id, vehicle_id, driver_id, amount_cents, paid_on, method, note, client_ref, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [owner, v.id, driver, b.amountCents, b.paidOn, b.method, note, ref, by])).rows[0];
    for (const k of BUCKETS) await db.query(`INSERT INTO driver_payment_allocations (payment_id, bucket, cents) VALUES ($1,$2,$3)`, [r.id, k, parts[k]]);
    return { ok: true, value: { id: String(r.id), duplicate: false, allocations: parts } };
  }
  async function voidPayment(owner: string, id: string, reason: unknown): Promise<Res<{ id: string }>> {
    const why = text(reason, 200); if (!why) return bad(400, "Say why the payment is being voided"); const p = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM driver_payments WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] : null; if (!p) return bad(404, "That payment was not found"); if (p.voided_at) return bad(409, "That payment is already voided");
    await db.query(`UPDATE driver_payments SET voided_at = $2, void_reason = $3 WHERE id = $1`, [id, now().toISOString(), why]); return { ok: true, value: { id } };
  }
  async function payments(owner: string, o: { vehicleId?: string; driverId?: string; from?: string; to?: string } = {}) {
    const vs = new Map((await db.query(`SELECT id, registration FROM vehicles WHERE owner_id = $1`, [owner])).rows.map((v) => [String(v.id), String(v.registration)])), ds = new Map((await db.query(`SELECT id, name FROM users WHERE role = 'driver'`)).rows.map((d) => [String(d.id), String(d.name)])), al = (await db.query(`SELECT a.payment_id, a.bucket, a.cents FROM driver_payment_allocations a JOIN driver_payments p ON p.id = a.payment_id WHERE p.owner_id = $1`, [owner])).rows;
    return (await db.query(`SELECT * FROM driver_payments WHERE owner_id = $1 ORDER BY paid_on DESC, created_at DESC LIMIT 1000`, [owner])).rows.filter((p) => (!o.vehicleId || String(p.vehicle_id) === o.vehicleId) && (!o.driverId || String(p.driver_id) === o.driverId) && (!o.from || dayOf(p.paid_on)! >= o.from) && (!o.to || dayOf(p.paid_on)! <= o.to)).map((p) => ({ id: String(p.id), vehicleId: String(p.vehicle_id), vehicle: vs.get(String(p.vehicle_id)) ?? "", driverId: (p.driver_id as string | null) ?? null, driver: p.driver_id ? ds.get(String(p.driver_id)) ?? null : null, amountCents: Number(p.amount_cents), paidOn: dayOf(p.paid_on)!, method: String(p.method), note: (p.note as string | null) ?? null, voided: !!p.voided_at, voidReason: (p.void_reason as string | null) ?? null, allocations: Object.fromEntries(BUCKETS.map((k) => [k, Number(al.find((a) => String(a.payment_id) === String(p.id) && a.bucket === k)?.cents ?? 0)])) as Record<Bucket, number> }));
  }
  /** The owner chooses not to chase part of a shortfall (a breakdown, a funeral, goodwill). It needs a reason and is kept on the record. */
  async function waive(owner: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(owner, b.vehicleId); if (!v) return bad(404, "That vehicle is not yours"); if (!Number.isInteger(b.amountCents) || (b.amountCents as number) < 1 || (b.amountCents as number) > MAX_CENTS) return bad(400, "The amount is a whole number of cents, more than nothing"); if (!isDay(b.waivedOn) || (b.waivedOn as string) > today() || (b.waivedOn as string) < shift(today(), -400)) return bad(400, "Give the date (not in the future)");
    const reason = text(b.reason, 200); if (!reason) return bad(400, "Say why the shortfall is being waived"); const r = (await db.query(`INSERT INTO target_waivers (owner_id, vehicle_id, amount_cents, waived_on, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [owner, v.id, b.amountCents, b.waivedOn, reason, by])).rows[0]; return { ok: true, value: { id: String(r.id) } };
  }
  async function waivers(owner: string, vehicleId?: string) { return (await db.query(`SELECT * FROM target_waivers WHERE owner_id = $1 ORDER BY waived_on DESC`, [owner])).rows.filter((w) => !vehicleId || String(w.vehicle_id) === vehicleId).map((w) => ({ id: String(w.id), vehicleId: String(w.vehicle_id), amountCents: Number(w.amount_cents), waivedOn: dayOf(w.waived_on)!, reason: String(w.reason) })); }

  /* ───────────────────────── reconciliation ───────────────────────── */
  /**
   * What was expected from a vehicle's driver, what was received, and where that leaves them, day by day, folded into weeks.
   *   daily target    due on each working day the vehicle was not paused
   *   weekly target   due on its due day, reduced pro rata for the days in the week (counting back from the due day, and only from the day the target started) that the vehicle was paused or not yet under the target
   *   balance         received + waived - expected, accumulated from the first target: NEGATIVE is arrears carried forward, POSITIVE is a surplus carried forward as credit
   * Payments after a target has ended still count. A voided payment does not.
   */
  async function reconcile(owner: string, vehicleId: string, onDay = today()) {
    const v = await ownVehicle(owner, vehicleId); if (!v) return bad(404, "That vehicle is not yours") as Fail;
    const ts = (await db.query(`SELECT * FROM vehicle_targets WHERE vehicle_id = $1 ORDER BY start_date`, [v.id])).rows.map(targetOf), pz = (await db.query(`SELECT * FROM target_pauses WHERE vehicle_id = $1`, [v.id])).rows.map(pauseOf), pays = (await db.query(`SELECT * FROM driver_payments WHERE vehicle_id = $1 AND voided_at IS NULL`, [v.id])).rows, wv = (await db.query(`SELECT * FROM target_waivers WHERE vehicle_id = $1`, [v.id])).rows;
    const al = (await db.query(`SELECT a.bucket, SUM(a.cents) AS c FROM driver_payment_allocations a JOIN driver_payments p ON p.id = a.payment_id WHERE p.vehicle_id = $1 AND p.voided_at IS NULL GROUP BY a.bucket`, [v.id])).rows, split = await splitFor(String(v.id), onDay);
    const earmarks = Object.fromEntries(BUCKETS.map((k) => [k, Number(al.find((a) => a.bucket === k)?.c ?? 0)])) as Record<Bucket, number>, open = ts.find((t) => !t.endDate) ?? null;
    const base = { vehicle: { id: String(v.id), registration: String(v.registration) }, today: onDay, targets: ts, target: open, pauses: pz, split, earmarks: { ...earmarks, totalCents: BUCKETS.reduce((a, k) => a + earmarks[k], 0) } };
    if (!ts.length) return { ok: true, value: { ...base, hasTarget: false, status: "none" as const, totals: { expectedCents: 0, receivedCents: 0, waivedCents: 0, balanceCents: 0, arrearsCents: 0, surplusCents: 0 }, dailyEquivalentCents: 0, daysBehind: 0, weeks: [], lastPaymentOn: dayOf(pays.map((p) => p.paid_on).sort().at(-1)), daysSinceLastPayment: null, flags: [] as Flag[] } } as Res<any>;
    const start = ts[0].startDate, paused = (d: string) => pz.some((p) => p.fromDate <= d && d <= p.toDate), tOn = (d: string) => ts.find((t) => t.startDate <= d && (!t.endDate || d <= t.endDate));
    const exp = new Map<string, number>(), rec = new Map<string, number>(), wai = new Map<string, number>(); const add = (m: Map<string, number>, d: string, c: number) => m.set(d, (m.get(d) ?? 0) + c);
    for (let d = start; d <= onDay; d = shift(d, 1)) {
      const t = tOn(d); if (!t) continue; const wd = weekdayIndex(d);
      if (t.period === "daily") { if (((t.workingDays >> wd) & 1) === 1 && !paused(d)) add(exp, d, t.amountCents); }
      else if (wd === t.dueWeekday - 1) { let n = 0; for (let k = Math.max(0, daysBetween(t.startDate, d) >= 6 ? 6 : daysBetween(t.startDate, d)); k >= 0; k--) { if (!paused(shift(d, -k))) n++; } add(exp, d, Math.round((t.amountCents * n) / 7)); }
    }
    for (const p of pays) { const d = dayOf(p.paid_on)!; if (d >= start && d <= onDay) add(rec, d, Number(p.amount_cents)); } for (const w of wv) { const d = dayOf(w.waived_on)!; if (d >= start && d <= onDay) add(wai, d, Number(w.amount_cents)); }
    const weeks = new Map<string, { weekStart: string; expectedCents: number; receivedCents: number; waivedCents: number; balanceCents: number }>(); let bal = 0, e = 0, r = 0, w = 0;
    for (let d = start; d <= onDay; d = shift(d, 1)) { const x = exp.get(d) ?? 0, y = rec.get(d) ?? 0, z = wai.get(d) ?? 0; e += x; r += y; w += z; bal += y + z - x; const ws = shift(d, -weekdayIndex(d)); const row = weeks.get(ws) ?? { weekStart: ws, expectedCents: 0, receivedCents: 0, waivedCents: 0, balanceCents: 0 }; row.expectedCents += x; row.receivedCents += y; row.waivedCents += z; row.balanceCents = bal; weeks.set(ws, row); }
    const all = [...weeks.values()], shown = all.slice(-26).map((x) => ({ ...x, shortfallCents: Math.max(0, x.expectedCents - x.receivedCents - x.waivedCents), carriedForwardCents: Math.max(0, -x.balanceCents) }));
    const cur = open ?? ts[ts.length - 1], dailyEq = cur.period === "daily" ? cur.amountCents : Math.round(cur.amountCents / 7), arrears = Math.max(0, -bal), behind = dailyEq ? Math.round((arrears / dailyEq) * 10) / 10 : 0;
    const last = dayOf(pays.map((p) => dayOf(p.paid_on)!).sort().at(-1)), flags: Flag[] = [], reg = String(v.registration);
    if (open && arrears > 0) { const sev = arrears >= 7 * dailyEq ? "high" : arrears >= 3 * dailyEq ? "medium" : "low"; flags.push({ id: `pay:arrears:${v.id}`, severity: sev, message: `${reg}: ${rand(arrears)} is owed by the driver (about ${behind} day${behind === 1 ? "" : "s"} of the target)`, subject: reg }); }
    if (open && last && daysBetween(last, onDay) >= 7 && arrears > 0) flags.push({ id: `pay:silent:${v.id}`, severity: "medium", message: `${reg}: nothing has been paid for ${daysBetween(last, onDay)} days`, subject: reg });
    if (open && !last && daysBetween(open.startDate, onDay) >= 3) flags.push({ id: `pay:none:${v.id}`, severity: "medium", message: `${reg}: no payment has been recorded since the target started on ${open.startDate}`, subject: reg });
    const status = !open ? "none" : bal >= 0 ? "green" : arrears >= 3 * dailyEq ? "red" : "amber";
    return { ok: true, value: { ...base, hasTarget: true, status, totals: { expectedCents: e, receivedCents: r, waivedCents: w, balanceCents: bal, arrearsCents: arrears, surplusCents: Math.max(0, bal) }, dailyEquivalentCents: dailyEq, daysBehind: behind, weeks: shown, lastPaymentOn: last, daysSinceLastPayment: last ? daysBetween(last, onDay) : null, flags } } as Res<any>;
  }
  /** Every vehicle at a glance: its target, whether it is paying on time (green, amber, red), what is owed, and the fleet's totals. */
  async function fleet(owner: string, onDay = today()) {
    const vs = (await db.query(`SELECT v.id, v.registration, v.driver_id, u.name AS driver FROM vehicles v LEFT JOIN users u ON u.id = v.driver_id WHERE v.owner_id = $1 ORDER BY v.registration`, [owner])).rows, rows = [], flags: Flag[] = [];
    for (const v of vs) { const r = await reconcile(owner, String(v.id), onDay); if (!r.ok) continue; const x = r.value as any; flags.push(...x.flags); rows.push({ vehicleId: String(v.id), registration: String(v.registration), driver: (v.driver as string | null) ?? null, hasTarget: x.hasTarget, status: x.status as string, target: x.target ? { period: x.target.period as string, amountCents: x.target.amountCents as number } : null, balanceCents: x.totals.balanceCents as number, arrearsCents: x.totals.arrearsCents as number, surplusCents: x.totals.surplusCents as number, lastPaymentOn: x.lastPaymentOn as string | null }); }
    const wk = shift(onDay, -weekdayIndex(onDay)), mo = `${onDay.slice(0, 7)}-01`, pays = (await db.query(`SELECT paid_on, amount_cents FROM driver_payments WHERE owner_id = $1 AND voided_at IS NULL`, [owner])).rows, sum = (from: string) => pays.filter((p) => dayOf(p.paid_on)! >= from && dayOf(p.paid_on)! <= onDay).reduce((a, p) => a + Number(p.amount_cents), 0);
    const order = { high: 0, medium: 1, low: 2 }; return { today: onDay, vehicles: rows, measures: { vehicles: rows.length, withTarget: rows.filter((x) => x.hasTarget).length, arrearsCents: rows.reduce((a, x) => a + x.arrearsCents, 0), surplusCents: rows.reduce((a, x) => a + x.surplusCents, 0), receivedThisWeekCents: sum(wk), receivedThisMonthCents: sum(mo), red: rows.filter((x) => x.status === "red").length, amber: rows.filter((x) => x.status === "amber").length, green: rows.filter((x) => x.status === "green").length }, flags: flags.sort((a, b) => order[a.severity] - order[b.severity] || a.subject.localeCompare(b.subject)) };
  }
  return { setTarget, endTarget, targets, addPause, cancelPause, pauses, setSplit, splitFor, recordPayment, voidPayment, payments, waive, waivers, reconcile, fleet };
}
export type DriverTargets = ReturnType<typeof createDriverTargets>;
