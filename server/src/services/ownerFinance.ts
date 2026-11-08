import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay, daysBetween } from "./compliance.js";

/**
 * THE OWNER'S FINANCES (docs/OWNER_DASHBOARD.md, slice D1): what a vehicle costs to run and to finance, what is owed to the lender, what has been spent on maintenance, which fines are unpaid, and what is left over.
 *   costs         fuel, maintenance, insurance, tracker fees, fines, association costs, licence fees, tyres, wages and other, for one vehicle or the whole business. A fine can name the driver and has its own status
 *   finance       a loan or instalment agreement: the lender, the instalment, the day it falls due, and what the lender LAST SAID was owed, as at a date (instalments include interest, so the balance is not worked out by subtracting them)
 *   maintenance   services and repairs, the odometer, and when the next one is due, by date and by kilometres
 *   profit        driver payments received, less running costs = PROFIT BEFORE FINANCE; less loan instalments paid = CASH PROFIT. An instalment includes repayment of capital, so an accountant treats only the interest as an expense: both lines are shown
 * It is the owner's own bookkeeping: it records and reports, it moves no money, and nothing here is tax advice. Nothing is deleted: a mistake is voided with a reason, and a retry with the same client reference records nothing twice.
 * Income here is what the owner recorded receiving from drivers (slice A). Payments the platform itself collected are not merged yet.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
export const CATEGORIES = ["fuel", "maintenance", "insurance", "tracker", "fine", "association", "licensing", "tyres", "wages", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_TEXT: Record<Category, string> = { fuel: "Fuel", maintenance: "Maintenance and repairs", insurance: "Insurance", tracker: "Tracker fees", fine: "Fines", association: "Association costs", licensing: "Licence fees", tyres: "Tyres", wages: "Wages", other: "Other" };
export const KINDS = ["service", "repair", "tyres", "brakes", "reading", "other"] as const;
export const MAX_COST_CENTS = 100_000_000, MAX_FINANCE_CENTS = 10_000_000_000, SERVICE_SOON_DAYS = 30, SERVICE_SOON_KM = 1000, GRACE_DAYS = 5;
const FINE_STATUS = ["unpaid", "paid", "disputed"] as const;
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
const rand = (c: number) => `R${(c / 100).toFixed(2)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
/** The day a monthly instalment falls due in a given month, clamped to that month's length (a due day of 31 is the 28th in February). */
export const dueDateIn = (year: number, month: number, dueDay: number) => `${year}-${pad(month)}-${pad(Math.min(dueDay, daysIn(year, month)))}`;
/** The first due date on or after a day, and the last on or before it. */
export function nextDue(on: string, dueDay: number): string { const [y, m] = on.split("-").map(Number), d = dueDateIn(y, m, dueDay); if (d >= on) return d; return m === 12 ? dueDateIn(y + 1, 1, dueDay) : dueDateIn(y, m + 1, dueDay); }
export function lastDue(on: string, dueDay: number): string { const [y, m] = on.split("-").map(Number), d = dueDateIn(y, m, dueDay); if (d <= on) return d; return m === 1 ? dueDateIn(y - 1, 12, dueDay) : dueDateIn(y, m - 1, dueDay); }

export type PeriodKind = "month" | "quarter" | "year" | "tax_year" | "custom";
/** A reporting period around a day: the calendar month, quarter or year, the individual's tax year (1 March to the end of February), or any dates up to three years apart. */
export function periodRange(kind: PeriodKind, on: string, from?: string, to?: string): { from: string; to: string; label: string } | null {
  const [y, m] = on.split("-").map(Number);
  if (kind === "month") return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(daysIn(y, m))}`, label: `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}` };
  if (kind === "quarter") { const q = Math.floor((m - 1) / 3), sm = q * 3 + 1, em = sm + 2; return { from: `${y}-${pad(sm)}-01`, to: `${y}-${pad(em)}-${pad(daysIn(y, em))}`, label: `Quarter ${q + 1} ${y}` }; }
  if (kind === "year") return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}` };
  if (kind === "tax_year") { const sy = m >= 3 ? y : y - 1; return { from: `${sy}-03-01`, to: `${sy + 1}-02-${pad(daysIn(sy + 1, 2))}`, label: `Tax year ${sy}/${sy + 1} (1 March to end of February)` }; }
  if (!from || !to || !isDay(from) || !isDay(to) || to < from || daysBetween(from, to) > 1100) return null; return { from, to, label: `${from} to ${to}` };
}

export function createOwnerFinance(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now());
  const ownVehicle = async (owner: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT id, registration FROM vehicles WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] ?? null : null);
  const ownDriver = async (owner: string, id: unknown) => typeof id === "string" && UUID.test(id) && (await db.query(`SELECT 1 AS x FROM owner_drivers WHERE owner_id = $1 AND driver_id = $2`, [owner, id])).rows.length > 0;
  const moneyOk = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;

  /* ───────────────────────── running costs and fines ───────────────────────── */
  const costOf = (c: Row, regs: Map<string, string>, names: Map<string, string>) => ({ id: String(c.id), vehicleId: (c.vehicle_id as string | null) ?? null, vehicle: c.vehicle_id ? regs.get(String(c.vehicle_id)) ?? null : null, driverId: (c.driver_id as string | null) ?? null, driver: c.driver_id ? names.get(String(c.driver_id)) ?? null : null, category: String(c.category), amountCents: Number(c.amount_cents), incurredOn: dayOf(c.incurred_on)!, payee: (c.payee as string | null) ?? null, reference: (c.reference as string | null) ?? null, note: (c.note as string | null) ?? null, fineStatus: (c.fine_status as string | null) ?? null, fromMaintenance: !!c.maintenance_id, voided: !!c.voided_at, voidReason: (c.void_reason as string | null) ?? null });
  /** Records a cost for a vehicle or for the whole business. A fine may name the driver and starts unpaid; any other cost has no fine status. A retry with the same client reference returns the first record. */
  async function addCost(owner: string, b: Record<string, unknown>, link: { maintenanceId?: string } = {}): Promise<Res<{ id: string; duplicate: boolean }>> {
    const ref = text(b.clientRef, 64); if (ref === false) return bad(400, "The reference is too long");
    if (ref) { const dup = (await db.query(`SELECT id FROM vehicle_costs WHERE owner_id = $1 AND client_ref = $2`, [owner, ref])).rows[0]; if (dup) return { ok: true, value: { id: String(dup.id), duplicate: true } }; }
    if (!CATEGORIES.includes(b.category as never)) return bad(400, "Say what the cost is for"); if (!moneyOk(b.amountCents, MAX_COST_CENTS)) return bad(400, `The amount is a whole number of cents, up to ${rand(MAX_COST_CENTS)}`);
    const day = today(); if (!isDay(b.incurredOn) || (b.incurredOn as string) > day || (b.incurredOn as string) < shift(day, -1100)) return bad(400, "Give the date it was paid (not in the future, and within the last three years)");
    let vehicle: string | null = null; if (b.vehicleId !== undefined && b.vehicleId !== null && b.vehicleId !== "") { const v = await ownVehicle(owner, b.vehicleId); if (!v) return bad(404, "That vehicle is not yours"); vehicle = String(v.id); }
    let driver: string | null = null; if (b.driverId !== undefined && b.driverId !== null && b.driverId !== "") { if (b.category !== "fine") return bad(400, "Only a fine is linked to a driver"); if (!(await ownDriver(owner, b.driverId))) return bad(400, "Choose one of your drivers"); driver = String(b.driverId); }
    const payee = text(b.payee, 120), reference = text(b.reference, 60), note = text(b.note, 200); if ([payee, reference, note].some((x) => x === false)) return bad(400, "A field is too long");
    let fine: string | null = null; if (b.category === "fine") { fine = b.fineStatus === undefined ? "unpaid" : String(b.fineStatus); if (!FINE_STATUS.includes(fine as never)) return bad(400, "A fine is unpaid, paid or disputed"); } else if (b.fineStatus !== undefined && b.fineStatus !== null) return bad(400, "Only a fine has a status");
    const r = (await db.query(`INSERT INTO vehicle_costs (owner_id, vehicle_id, driver_id, category, amount_cents, incurred_on, payee, reference, note, fine_status, maintenance_id, client_ref, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [owner, vehicle, driver, b.category, b.amountCents, b.incurredOn, payee, reference, note, fine, link.maintenanceId ?? null, ref, now().toISOString()])).rows[0]; return { ok: true, value: { id: String(r.id), duplicate: false } };
  }
  async function voidCost(owner: string, id: string, reason: unknown): Promise<Res<{ id: string }>> {
    const why = text(reason, 200); if (!why) return bad(400, "Say why the cost is being voided"); const c = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM vehicle_costs WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] : null; if (!c) return bad(404, "That cost was not found"); if (c.voided_at) return bad(409, "That cost is already voided"); if (c.maintenance_id) return bad(409, "That cost belongs to a maintenance entry: void the entry instead");
    await db.query(`UPDATE vehicle_costs SET voided_at = $2, void_reason = $3 WHERE id = $1`, [id, now().toISOString(), why]); return { ok: true, value: { id } };
  }
  /** Marks a fine unpaid, paid or disputed. A disputed fine is not counted as a cost until it is settled. */
  async function setFineStatus(owner: string, id: string, status: unknown): Promise<Res<{ id: string }>> {
    if (!FINE_STATUS.includes(status as never)) return bad(400, "A fine is unpaid, paid or disputed"); const c = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM vehicle_costs WHERE id = $1 AND owner_id = $2 AND category = 'fine'`, [id, owner])).rows[0] : null; if (!c) return bad(404, "That fine was not found"); if (c.voided_at) return bad(409, "That fine has been voided");
    await db.query(`UPDATE vehicle_costs SET fine_status = $2 WHERE id = $1`, [id, status]); return { ok: true, value: { id } };
  }
  async function costs(owner: string, o: { vehicleId?: string; category?: string; from?: string; to?: string; includeVoided?: boolean } = {}) {
    const regs = new Map((await db.query(`SELECT id, registration FROM vehicles WHERE owner_id = $1`, [owner])).rows.map((v) => [String(v.id), String(v.registration)])), names = new Map((await db.query(`SELECT id, name FROM users WHERE role = 'driver'`)).rows.map((u) => [String(u.id), String(u.name)]));
    return (await db.query(`SELECT * FROM vehicle_costs WHERE owner_id = $1 ORDER BY incurred_on DESC, created_at DESC LIMIT 2000`, [owner])).rows.filter((c) => (o.includeVoided || !c.voided_at) && (!o.vehicleId || String(c.vehicle_id) === o.vehicleId) && (!o.category || c.category === o.category) && (!o.from || dayOf(c.incurred_on)! >= o.from) && (!o.to || dayOf(c.incurred_on)! <= o.to)).map((c) => costOf(c, regs, names));
  }

  /* ───────────────────────── vehicle finance ───────────────────────── */
  /** Records a loan or instalment agreement on one of the owner's vehicles (one active at a time). */
  async function addFinance(owner: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const v = await ownVehicle(owner, b.vehicleId); if (!v) return bad(404, "That vehicle is not yours"); const lender = text(b.lender, 100); if (!lender) return bad(400, "Give the lender's name"); const reference = text(b.reference, 60), notes = text(b.notes, 300); if (reference === false || notes === false) return bad(400, "A field is too long");
    if (!moneyOk(b.originalCents, MAX_FINANCE_CENTS)) return bad(400, "Give the original amount in whole cents"); if (!Number.isInteger(b.balanceCents) || (b.balanceCents as number) < 0 || (b.balanceCents as number) > MAX_FINANCE_CENTS) return bad(400, "Give what is still owed in whole cents (nothing owed is 0)"); if (!moneyOk(b.instalmentCents, MAX_FINANCE_CENTS)) return bad(400, "Give the monthly instalment in whole cents");
    if (!Number.isInteger(b.dueDay) || (b.dueDay as number) < 1 || (b.dueDay as number) > 31) return bad(400, "The due day is a day of the month, 1 to 31"); const day = today();
    if (!isDay(b.startDate) || (b.startDate as string) > shift(day, 31)) return bad(400, "Give the date the agreement started"); if (!isDay(b.balanceOn) || (b.balanceOn as string) > day) return bad(400, "Give the date the balance is as at (not in the future)"); if (b.finalDueOn !== undefined && b.finalDueOn !== null && b.finalDueOn !== "" && (!isDay(b.finalDueOn) || (b.finalDueOn as string) < (b.startDate as string))) return bad(400, "The last instalment is on or after the start");
    if ((await db.query(`SELECT 1 AS x FROM vehicle_finance WHERE vehicle_id = $1 AND status = 'active'`, [v.id])).rows.length) return bad(409, "That vehicle already has finance: settle it first");
    const r = (await db.query(`INSERT INTO vehicle_finance (owner_id, vehicle_id, lender, reference, original_cents, balance_cents, balance_on, instalment_cents, due_day, start_date, final_due_on, notes, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [owner, v.id, lender, reference, b.originalCents, b.balanceCents, b.balanceOn, b.instalmentCents, b.dueDay, b.startDate, b.finalDueOn || null, notes, now().toISOString()])).rows[0]; return { ok: true, value: { id: String(r.id) } };
  }
  const ownFinance = async (owner: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM vehicle_finance WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] ?? null : null);
  /** Records what the lender says is still owed, as at a date. The balance only moves when the lender says so; it is never worked out from the instalments. */
  async function updateBalance(owner: string, id: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const f = await ownFinance(owner, id); if (!f) return bad(404, "That finance was not found"); if (f.status !== "active") return bad(409, "That finance is settled"); if (!Number.isInteger(b.balanceCents) || (b.balanceCents as number) < 0 || (b.balanceCents as number) > MAX_FINANCE_CENTS) return bad(400, "Give what is still owed in whole cents");
    if (!isDay(b.balanceOn) || (b.balanceOn as string) > today() || (b.balanceOn as string) < dayOf(f.balance_on)!) return bad(400, "Give the date the balance is as at (not in the future, and not earlier than the last one)"); await db.query(`UPDATE vehicle_finance SET balance_cents = $2, balance_on = $3 WHERE id = $1`, [id, b.balanceCents, b.balanceOn]); return { ok: true, value: { id } };
  }
  async function settle(owner: string, id: string, settledOn: unknown): Promise<Res<{ id: string }>> {
    const f = await ownFinance(owner, id); if (!f) return bad(404, "That finance was not found"); if (f.status !== "active") return bad(409, "That finance is already settled"); if (!isDay(settledOn) || (settledOn as string) > today() || (settledOn as string) < dayOf(f.start_date)!) return bad(400, "Give the date it was settled (after it started, not in the future)");
    await db.query(`UPDATE vehicle_finance SET status = 'settled', settled_on = $2, balance_cents = 0, balance_on = $2 WHERE id = $1`, [id, settledOn]); return { ok: true, value: { id } };
  }
  /** Records an instalment the owner paid the lender. A retry with the same client reference returns the first. */
  async function recordInstalment(owner: string, id: string, b: Record<string, unknown>): Promise<Res<{ id: string; duplicate: boolean }>> {
    const ref = text(b.clientRef, 64); if (ref === false) return bad(400, "The reference is too long"); if (ref) { const dup = (await db.query(`SELECT id FROM finance_instalments WHERE owner_id = $1 AND client_ref = $2`, [owner, ref])).rows[0]; if (dup) return { ok: true, value: { id: String(dup.id), duplicate: true } }; }
    const f = await ownFinance(owner, id); if (!f) return bad(404, "That finance was not found"); if (!moneyOk(b.amountCents, MAX_FINANCE_CENTS)) return bad(400, "The amount is a whole number of cents"); const day = today(); if (!isDay(b.paidOn) || (b.paidOn as string) > day || (b.paidOn as string) < dayOf(f.start_date)! || (b.paidOn as string) < shift(day, -1100)) return bad(400, "Give the date it was paid (after the agreement started, not in the future)");
    const r = (await db.query(`INSERT INTO finance_instalments (finance_id, owner_id, amount_cents, paid_on, client_ref, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [id, owner, b.amountCents, b.paidOn, ref, now().toISOString()])).rows[0]; return { ok: true, value: { id: String(r.id), duplicate: false } };
  }
  async function voidInstalment(owner: string, id: string, reason: unknown): Promise<Res<{ id: string }>> {
    const why = text(reason, 200); if (!why) return bad(400, "Say why the payment is being voided"); const r = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM finance_instalments WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] : null; if (!r) return bad(404, "That payment was not found"); if (r.voided_at) return bad(409, "That payment is already voided");
    await db.query(`UPDATE finance_instalments SET voided_at = $2, void_reason = $3 WHERE id = $1`, [id, now().toISOString(), why]); return { ok: true, value: { id } };
  }
  /** Every finance agreement with what is owed (as the lender last said), the next instalment, what has been paid, and what stands out. */
  async function finances(owner: string, onDay = today()) {
    const regs = new Map((await db.query(`SELECT id, registration FROM vehicles WHERE owner_id = $1`, [owner])).rows.map((v) => [String(v.id), String(v.registration)])), fs = (await db.query(`SELECT * FROM vehicle_finance WHERE owner_id = $1 ORDER BY status, created_at`, [owner])).rows, pays = (await db.query(`SELECT * FROM finance_instalments WHERE owner_id = $1 ORDER BY paid_on DESC, created_at DESC`, [owner])).rows;
    const flags: { id: string; severity: "high" | "medium" | "low"; message: string; subject: string }[] = [], out = fs.map((f) => {
      const mine = pays.filter((p) => String(p.finance_id) === String(f.id)), live = mine.filter((p) => !p.voided_at), active = f.status === "active", reg = regs.get(String(f.vehicle_id)) ?? "", due = Number(f.due_day), inst = Number(f.instalment_cents), bal = Number(f.balance_cents);
      const prev = active ? lastDue(onDay, due) : null, missing = !!prev && prev >= dayOf(f.start_date)! && daysBetween(prev, onDay) >= GRACE_DAYS && !live.some((p) => dayOf(p.paid_on)! >= shift(prev, -15));
      if (active && missing) flags.push({ id: `fin:missing:${f.id}`, severity: "medium", message: `${reg}: the ${rand(inst)} instalment to ${f.lender} that fell due on ${prev} has not been recorded`, subject: reg });
      if (active && f.final_due_on && dayOf(f.final_due_on)! < onDay && bal > 0) flags.push({ id: `fin:pastfinal:${f.id}`, severity: "low", message: `${reg}: the finance with ${f.lender} was due to end on ${dayOf(f.final_due_on)} but still shows ${rand(bal)} owed`, subject: reg });
      return { id: String(f.id), vehicleId: String(f.vehicle_id), registration: reg, lender: String(f.lender), reference: (f.reference as string | null) ?? null, originalCents: Number(f.original_cents), balanceCents: bal, balanceOn: dayOf(f.balance_on)!, instalmentCents: inst, dueDay: due, startDate: dayOf(f.start_date)!, finalDueOn: dayOf(f.final_due_on), status: String(f.status), settledOn: dayOf(f.settled_on), notes: (f.notes as string | null) ?? null, nextDueOn: active ? nextDue(onDay, due) : null, lastPaidOn: dayOf(live[0]?.paid_on), paidCents: live.reduce((a, p) => a + Number(p.amount_cents), 0), instalmentsLeft: active && bal > 0 ? Math.ceil(bal / inst) : 0, missingInstalment: active && missing, payments: mine.slice(0, 24).map((p) => ({ id: String(p.id), amountCents: Number(p.amount_cents), paidOn: dayOf(p.paid_on)!, voided: !!p.voided_at, voidReason: (p.void_reason as string | null) ?? null })) };
    });
    const act = out.filter((f) => f.status === "active"); return { today: onDay, finances: out, measures: { activeAgreements: act.length, owedCents: act.reduce((a, f) => a + f.balanceCents, 0), monthlyInstalmentsCents: act.reduce((a, f) => a + f.instalmentCents, 0) }, flags };
  }

  /* ───────────────────────── maintenance ───────────────────────── */
  const mOf = (m: Row, regs: Map<string, string>, costs: Map<string, Row>) => ({ id: String(m.id), vehicleId: String(m.vehicle_id), vehicle: regs.get(String(m.vehicle_id)) ?? "", servicedOn: dayOf(m.serviced_on)!, kind: String(m.kind), description: (m.description as string | null) ?? null, odometerKm: m.odometer_km === null || m.odometer_km === undefined ? null : Number(m.odometer_km), nextDueOn: dayOf(m.next_due_on), nextDueKm: m.next_due_km === null || m.next_due_km === undefined ? null : Number(m.next_due_km), costCents: m.cost_id ? Number(costs.get(String(m.cost_id))?.amount_cents ?? 0) : 0, voided: !!m.voided_at });
  /** Records a service, repair, tyres or odometer reading, with what it cost and when the next is due. A cost makes a running-cost entry for the vehicle, so the money is counted once. */
  async function addMaintenance(owner: string, b: Record<string, unknown>): Promise<Res<{ id: string; costId: string | null }>> {
    const v = await ownVehicle(owner, b.vehicleId); if (!v) return bad(404, "That vehicle is not yours"); if (!KINDS.includes(b.kind as never)) return bad(400, "Say what was done: a service, repair, tyres, brakes, other, or just an odometer reading"); const day = today();
    if (!isDay(b.servicedOn) || (b.servicedOn as string) > day || (b.servicedOn as string) < shift(day, -1100)) return bad(400, "Give the date (not in the future, and within the last three years)"); const description = text(b.description, 200); if (description === false) return bad(400, "The description is too long");
    const km = b.odometerKm === undefined || b.odometerKm === null || b.odometerKm === "" ? null : b.odometerKm, nextKm = b.nextDueKm === undefined || b.nextDueKm === null || b.nextDueKm === "" ? null : b.nextDueKm; if (km !== null && (!Number.isInteger(km) || (km as number) < 0 || (km as number) > 3_000_000)) return bad(400, "The odometer is a whole number of kilometres"); if (b.kind === "reading" && km === null) return bad(400, "A reading needs the odometer");
    if (nextKm !== null && (!Number.isInteger(nextKm) || (nextKm as number) < 0 || (km !== null && (nextKm as number) <= (km as number)))) return bad(400, "The next service is at a higher number of kilometres than now"); const nextOn = b.nextDueOn === undefined || b.nextDueOn === null || b.nextDueOn === "" ? null : b.nextDueOn; if (nextOn !== null && (!isDay(nextOn) || (nextOn as string) <= (b.servicedOn as string))) return bad(400, "The next service is after this one");
    const cost = b.costCents === undefined || b.costCents === null || b.costCents === "" || b.costCents === 0 ? 0 : b.costCents; if (cost !== 0 && !moneyOk(cost, MAX_COST_CENTS)) return bad(400, `The cost is a whole number of cents, up to ${rand(MAX_COST_CENTS)}`); if (b.kind === "reading" && cost !== 0) return bad(400, "A reading has no cost");
    const m = (await db.query(`INSERT INTO maintenance_log (owner_id, vehicle_id, serviced_on, kind, description, odometer_km, next_due_on, next_due_km, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [owner, v.id, b.servicedOn, b.kind, description, km, nextOn, nextKm, now().toISOString()])).rows[0]; let costId: string | null = null;
    if (cost !== 0) { const c = await addCost(owner, { vehicleId: v.id, category: b.kind === "tyres" ? "tyres" : "maintenance", amountCents: cost, incurredOn: b.servicedOn, payee: b.payee, note: description }, { maintenanceId: String(m.id) }); if (!c.ok) { await db.query(`DELETE FROM maintenance_log WHERE id = $1`, [m.id]); return c; } costId = c.value.id; await db.query(`UPDATE maintenance_log SET cost_id = $2 WHERE id = $1`, [m.id, costId]); }
    return { ok: true, value: { id: String(m.id), costId } };
  }
  /** Voids a maintenance entry and the cost it made. */
  async function voidMaintenance(owner: string, id: string, reason: unknown): Promise<Res<{ id: string }>> {
    const why = text(reason, 200); if (!why) return bad(400, "Say why the entry is being voided"); const m = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM maintenance_log WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] : null; if (!m) return bad(404, "That entry was not found"); if (m.voided_at) return bad(409, "That entry is already voided");
    const t = now().toISOString(); await db.query(`UPDATE maintenance_log SET voided_at = $2 WHERE id = $1`, [id, t]); if (m.cost_id) await db.query(`UPDATE vehicle_costs SET voided_at = $2, void_reason = $3 WHERE id = $1`, [m.cost_id, t, why]); return { ok: true, value: { id } };
  }
  async function maintenance(owner: string, vehicleId?: string) {
    const regs = new Map((await db.query(`SELECT id, registration FROM vehicles WHERE owner_id = $1`, [owner])).rows.map((v) => [String(v.id), String(v.registration)])), cs = new Map((await db.query(`SELECT id, amount_cents FROM vehicle_costs WHERE owner_id = $1`, [owner])).rows.map((c) => [String(c.id), c]));
    return (await db.query(`SELECT * FROM maintenance_log WHERE owner_id = $1 ORDER BY serviced_on DESC, created_at DESC LIMIT 1000`, [owner])).rows.filter((m) => !m.voided_at && (!vehicleId || String(m.vehicle_id) === vehicleId)).map((m) => mOf(m, regs, cs));
  }
  /** Per vehicle: the last service, the highest odometer reading, and whether the next service is due by date or by kilometres. */
  async function maintenanceStatus(owner: string, onDay = today()) {
    const vs = (await db.query(`SELECT id, registration FROM vehicles WHERE owner_id = $1 ORDER BY registration`, [owner])).rows, logs = (await db.query(`SELECT * FROM maintenance_log WHERE owner_id = $1`, [owner])).rows.filter((m) => !m.voided_at), flags: { id: string; severity: "high" | "medium" | "low"; message: string; subject: string }[] = [];
    const rows = vs.map((v) => {
      const id = String(v.id), reg = String(v.registration), mine = logs.filter((m) => String(m.vehicle_id) === id), serv = mine.filter((m) => m.kind !== "reading").sort((a, b) => dayOf(b.serviced_on)!.localeCompare(dayOf(a.serviced_on)!) || String(b.created_at).localeCompare(String(a.created_at))), last = serv[0] ?? null;
      const odo = mine.reduce<number | null>((a, m) => (m.odometer_km === null || m.odometer_km === undefined ? a : a === null ? Number(m.odometer_km) : Math.max(a, Number(m.odometer_km))), null), dueOn = dayOf(last?.next_due_on), dueKm = last?.next_due_km === null || last?.next_due_km === undefined ? null : Number(last.next_due_km);
      const dateLeft = dueOn ? daysBetween(onDay, dueOn) : null, kmLeft = dueKm !== null && odo !== null ? dueKm - odo : null;
      const status = !last ? "none" : (dateLeft !== null && dateLeft < 0) || (kmLeft !== null && kmLeft <= 0) ? "overdue" : (dateLeft !== null && dateLeft <= SERVICE_SOON_DAYS) || (kmLeft !== null && kmLeft <= SERVICE_SOON_KM) ? "due_soon" : dueOn || dueKm !== null ? "ok" : "no_next";
      if (status === "none") flags.push({ id: `mnt:none:${id}`, severity: "low", message: `${reg}: no service or repair has been recorded`, subject: reg });
      else if (status === "overdue") flags.push({ id: `mnt:overdue:${id}`, severity: "high", message: `${reg}: the service was due ${dateLeft !== null && dateLeft < 0 ? `on ${dueOn}` : `at ${dueKm} km`} and is overdue`, subject: reg });
      else if (status === "due_soon") flags.push({ id: `mnt:soon:${id}`, severity: "medium", message: `${reg}: the next service is due ${dateLeft !== null && dateLeft <= SERVICE_SOON_DAYS ? `on ${dueOn} (${dateLeft} day${dateLeft === 1 ? "" : "s"})` : `at ${dueKm} km (${kmLeft} km to go)`}`, subject: reg });
      return { vehicleId: id, registration: reg, status, lastServiceOn: dayOf(last?.serviced_on), lastKind: (last?.kind as string | null) ?? null, odometerKm: odo, nextDueOn: dueOn, nextDueKm: dueKm, daysLeft: dateLeft, kmLeft };
    });
    return { today: onDay, vehicles: rows, flags };
  }

  /* ───────────────────────── profit and loss ───────────────────────── */
  async function lines(owner: string, from: string, to: string) {
    const vs = (await db.query(`SELECT id, registration FROM vehicles WHERE owner_id = $1 ORDER BY registration`, [owner])).rows, inc = (await db.query(`SELECT vehicle_id, amount_cents, paid_on FROM driver_payments WHERE owner_id = $1 AND voided_at IS NULL`, [owner])).rows.filter((p) => dayOf(p.paid_on)! >= from && dayOf(p.paid_on)! <= to);
    const cs = (await db.query(`SELECT * FROM vehicle_costs WHERE owner_id = $1 AND voided_at IS NULL`, [owner])).rows.filter((c) => dayOf(c.incurred_on)! >= from && dayOf(c.incurred_on)! <= to && c.fine_status !== "disputed"), fins = new Map((await db.query(`SELECT id, vehicle_id FROM vehicle_finance WHERE owner_id = $1`, [owner])).rows.map((f) => [String(f.id), String(f.vehicle_id)])), ins = (await db.query(`SELECT finance_id, amount_cents, paid_on FROM finance_instalments WHERE owner_id = $1 AND voided_at IS NULL`, [owner])).rows.filter((p) => dayOf(p.paid_on)! >= from && dayOf(p.paid_on)! <= to);
    const sum = (rows: Row[]) => rows.reduce((a, r) => a + Number(r.amount_cents), 0), build = (vehicleId: string | null, reg: string | null) => { const mine = cs.filter((c) => (vehicleId === null ? !c.vehicle_id : String(c.vehicle_id) === vehicleId)); const byCat = CATEGORIES.map((k) => ({ category: k, label: CATEGORY_TEXT[k], cents: sum(mine.filter((c) => c.category === k)) })).filter((x) => x.cents > 0); const incomeCents = vehicleId === null ? 0 : sum(inc.filter((p) => String(p.vehicle_id) === vehicleId)), costCents = byCat.reduce((a, x) => a + x.cents, 0), instalmentCents = vehicleId === null ? 0 : sum(ins.filter((p) => fins.get(String(p.finance_id)) === vehicleId)); return { vehicleId, registration: reg, incomeCents, costs: byCat, costCents, profitBeforeFinanceCents: incomeCents - costCents, instalmentCents, cashProfitCents: incomeCents - costCents - instalmentCents }; };
    const vehicles = vs.map((v) => build(String(v.id), String(v.registration))), unallocated = build(null, null), all = [...vehicles, unallocated], byCat = CATEGORIES.map((k) => ({ category: k, label: CATEGORY_TEXT[k], cents: all.reduce((a, x) => a + (x.costs.find((c) => c.category === k)?.cents ?? 0), 0) })).filter((x) => x.cents > 0);
    const incomeCents = all.reduce((a, x) => a + x.incomeCents, 0), costCents = all.reduce((a, x) => a + x.costCents, 0), instalmentCents = all.reduce((a, x) => a + x.instalmentCents, 0);
    return { vehicles, unallocated, fleet: { incomeCents, costs: byCat, costCents, profitBeforeFinanceCents: incomeCents - costCents, instalmentCents, cashProfitCents: incomeCents - costCents - instalmentCents, marginPercent: incomeCents > 0 ? Math.round(((incomeCents - costCents - instalmentCents) / incomeCents) * 1000) / 10 : null } };
  }
  /** Profit and loss for a month, quarter, year, tax year or any dates: per vehicle and for the whole fleet, compared with the period just before, with the last twelve months for the trend. */
  async function profit(owner: string, o: { period?: PeriodKind; on?: string; from?: string; to?: string } = {}): Promise<Res<Record<string, unknown>>> {
    const on = o.on ?? today(), kind = o.period ?? "month"; if (!isDay(on)) return bad(400, "Give a date as YYYY-MM-DD"); const range = periodRange(kind, on, o.from, o.to); if (!range) return bad(400, kind === "custom" ? "Give the first and last day, no more than three years apart" : "That is not a period I know"); const span = daysBetween(range.from, range.to) + 1, prevTo = shift(range.from, -1), prevFrom = shift(prevTo, -(span - 1));
    const cur = await lines(owner, range.from, range.to), prev = await lines(owner, prevFrom, prevTo), months: { month: string; incomeCents: number; costCents: number; instalmentCents: number; cashProfitCents: number }[] = [];
    for (let i = 11; i >= 0; i--) { const [y, m] = on.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 - i, 1)), r = periodRange("month", d.toISOString().slice(0, 10))!, f = (await lines(owner, r.from, r.to)).fleet; months.push({ month: r.from.slice(0, 7), incomeCents: f.incomeCents, costCents: f.costCents, instalmentCents: f.instalmentCents, cashProfitCents: f.cashProfitCents }); }
    return { ok: true, value: { period: { kind, ...range, previousFrom: prevFrom, previousTo: prevTo }, ...cur, previous: { fleet: prev.fleet }, changeCents: cur.fleet.cashProfitCents - prev.fleet.cashProfitCents, months } };
  }
  /** Everything that needs the owner's attention across finance, maintenance and fines, and the headline figures for this month. */
  async function overview(owner: string, onDay = today()) {
    const fin = await finances(owner, onDay), mnt = await maintenanceStatus(owner, onDay), unpaid = (await db.query(`SELECT * FROM vehicle_costs WHERE owner_id = $1 AND category = 'fine' AND fine_status = 'unpaid' AND voided_at IS NULL`, [owner])).rows, flags = [...fin.flags, ...mnt.flags];
    const p = await profit(owner, { period: "month", on: onDay }); const month = p.ok ? (p.value as any).fleet : null;
    if (unpaid.length) flags.push({ id: "fines:unpaid", severity: "medium", message: `${unpaid.length} fine${unpaid.length === 1 ? " is" : "s are"} unpaid, ${rand(unpaid.reduce((a, c) => a + Number(c.amount_cents), 0))} in all`, subject: "Fines" });
    for (const v of p.ok ? ((p.value as any).vehicles as { registration: string | null; incomeCents: number; cashProfitCents: number }[]) : []) if (v.incomeCents > 0 && v.cashProfitCents < 0) flags.push({ id: `pl:loss:${v.registration}`, severity: "low", message: `${v.registration} cost more than it earned this month (${rand(-v.cashProfitCents)} short)`, subject: v.registration ?? "" });
    const order = { high: 0, medium: 1, low: 2 }; return { today: onDay, month, finance: fin.measures, unpaidFines: { count: unpaid.length, cents: unpaid.reduce((a, c) => a + Number(c.amount_cents), 0) }, flags: flags.sort((a, b) => order[a.severity] - order[b.severity] || a.subject.localeCompare(b.subject)) };
  }
  return { addCost, voidCost, setFineStatus, costs, addFinance, updateBalance, settle, recordInstalment, voidInstalment, finances, addMaintenance, voidMaintenance, maintenance, maintenanceStatus, profit, overview };
}
export type OwnerFinance = ReturnType<typeof createOwnerFinance>;
