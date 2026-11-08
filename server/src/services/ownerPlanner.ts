import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { createOwnerFinance } from "./ownerFinance.js";

/**
 * THE FLEET EXPANSION PLANNER (docs/OWNER_DASHBOARD.md, slice F): "can I afford another vehicle, and what would it do to my profit?"
 * It is a calculator on the owner's OWN recorded figures. It records nothing, moves no money, and is not financial or credit advice.
 *   the loan      the monthly instalment of a standard fixed-rate loan, rounded UP to the cent. The interest rate is ALWAYS what the owner types in from a real quote: this never assumes a rate, a bank's rules, or what a lender will approve
 *   the income    what the owner expects a driver to pay each month, or, if they leave it out, the average each vehicle brought in over the months before this one, taken from what they recorded in slice A
 *   the costs     likewise: what they expect it to cost to run each month, or the average per vehicle from their own recorded costs
 *   the answer    what is left each month after the instalment, how many months to earn back the cash put in, the income needed just to break even, and what happens if income is 10% or 20% lower
 * The colour is a rule of thumb that is shown with its numbers: green when the vehicle earns at least 1.5 times its instalment after running costs, amber from 1.0 to 1.5, red below 1.0 or when it loses money each month. It is not a lender's test.
 * All money is whole cents. A driver's pay is a private agreement, so any figure here is a plan, not a promise.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
export const MAX_PLANS = 20;
export const MAX_PRICE_CENTS = 2_000_000_000, MAX_MONTHLY_CENTS = 1_000_000_000, MAX_TERM = 120, MAX_RATE_PERCENT = 60, GREEN_COVER = 1.5, AMBER_COVER = 1.0, LOOKBACKS = [3, 6, 12] as const;
const rand = (c: number) => { const [i, d] = Math.abs(c / 100).toFixed(2).split("."); return `${c < 0 ? "-" : ""}R${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${d}`; };

/** The monthly instalment of a fixed-rate loan, in cents, rounded UP to the cent. A rate of 0 divides the loan evenly. `rateBp` is the yearly rate in hundredths of a percent (12% = 1200). */
export function loanPayment(principalCents: number, rateBp: number, months: number): number {
  if (principalCents <= 0) return 0; if (months < 1) throw new Error("months must be at least 1");
  if (rateBp === 0) return Math.ceil(principalCents / months - 1e-9);
  const r = rateBp / 10000 / 12; return Math.ceil((principalCents * r) / (1 - Math.pow(1 + r, -months)) - 1e-9);
}
const whole = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
export interface PlanInput { priceCents: unknown; depositCents?: unknown; ratePercent?: unknown; termMonths?: unknown; expectedIncomeCents?: unknown; expectedCostsCents?: unknown; upfrontCostsCents?: unknown; lookbackMonths?: unknown }

export function createOwnerPlanner(db: Db, now: () => Date = () => new Date()) {
  const fin = createOwnerFinance(db, now);
  /** The average month over the months before this one, per vehicle, from what the owner recorded. */
  async function history(owner: string, lookback: number) {
    const [y, m] = saDay(now()).split("-").map(Number), last = new Date(Date.UTC(y, m - 2, 15)).toISOString().slice(0, 10);                  // a day in the month before this one, so the twelve months it reports all end with the last FULL month
    const p = await fin.profit(owner, { period: "month", on: last }); if (!p.ok) return p; const v = p.value as any, months = (v.months as { month: string; incomeCents: number; costCents: number; instalmentCents: number; cashProfitCents: number }[]).slice(-lookback);
    const vehicles = Number((await db.query(`SELECT COUNT(*) AS n FROM vehicles WHERE owner_id = $1`, [owner])).rows[0].n), sum = (k: "incomeCents" | "costCents" | "instalmentCents" | "cashProfitCents") => months.reduce((a, m) => a + m[k], 0), n = months.length;
    const avg = (k: "incomeCents" | "costCents" | "instalmentCents" | "cashProfitCents") => Math.round(sum(k) / n);
    return { ok: true as const, value: { months: n, monthsWithIncome: months.filter((m) => m.incomeCents > 0).length, from: months[0]?.month ?? null, to: months[n - 1]?.month ?? null, vehicles, fleetIncomeCents: avg("incomeCents"), fleetCostCents: avg("costCents"), fleetInstalmentCents: avg("instalmentCents"), fleetCashProfitCents: avg("cashProfitCents"), perVehicleIncomeCents: vehicles ? Math.round(avg("incomeCents") / vehicles) : 0, perVehicleCostCents: vehicles ? Math.round(avg("costCents") / vehicles) : 0 } };
  }
  /** Works out what one more vehicle would do, from the figures given and the owner's own history. */
  async function plan(owner: string, i: PlanInput): Promise<Res<Record<string, unknown>>> {
    const price = whole(i.priceCents, 1, MAX_PRICE_CENTS); if (price === null) return bad(400, "Give the price of the vehicle in whole cents");
    const deposit = i.depositCents === undefined || i.depositCents === null || i.depositCents === "" ? 0 : whole(i.depositCents, 0, price); if (deposit === null) return bad(400, "The deposit is a whole number of cents, no more than the price");
    const loanAmount = price - deposit; let rateBp = 0, term = 0;
    if (loanAmount > 0) { const rate = typeof i.ratePercent === "number" ? i.ratePercent : NaN; if (!Number.isFinite(rate) || rate < 0 || rate > MAX_RATE_PERCENT) return bad(400, `Give the yearly interest rate from your quote, from 0 to ${MAX_RATE_PERCENT}`); rateBp = Math.round(rate * 100); const t = whole(i.termMonths, 1, MAX_TERM); if (t === null) return bad(400, `Give the number of months of the loan, from 1 to ${MAX_TERM}`); term = t; }
    const upfront = i.upfrontCostsCents === undefined || i.upfrontCostsCents === null || i.upfrontCostsCents === "" ? 0 : whole(i.upfrontCostsCents, 0, MAX_PRICE_CENTS); if (upfront === null) return bad(400, "The costs to get it on the road are a whole number of cents");
    const lb = i.lookbackMonths === undefined || i.lookbackMonths === null || i.lookbackMonths === "" ? 6 : Number(i.lookbackMonths); if (!LOOKBACKS.includes(lb as never)) return bad(400, "Look back 3, 6 or 12 months");
    const h = await history(owner, lb); if (!h.ok) return h; const hist = h.value, given = (v: unknown) => v !== undefined && v !== null && v !== "";
    let income: number, costs: number, incomeFrom: "you" | "history", costsFrom: "you" | "history";
    if (given(i.expectedIncomeCents)) { const v = whole(i.expectedIncomeCents, 0, MAX_MONTHLY_CENTS); if (v === null) return bad(400, "The monthly income you expect is a whole number of cents"); income = v; incomeFrom = "you"; }
    else { if (hist.vehicles === 0 || hist.perVehicleIncomeCents <= 0) return bad(400, "Give what you expect a driver to pay each month: there is not enough recorded history to work it out"); income = hist.perVehicleIncomeCents; incomeFrom = "history"; }
    if (given(i.expectedCostsCents)) { const v = whole(i.expectedCostsCents, 0, MAX_MONTHLY_CENTS); if (v === null) return bad(400, "The monthly running cost you expect is a whole number of cents"); costs = v; costsFrom = "you"; } else { costs = hist.perVehicleCostCents; costsFrom = "history"; }
    const instalment = loanAmount > 0 ? loanPayment(loanAmount, rateBp, term) : 0, totalRepayable = instalment * term, cashIn = deposit + upfront, net = income - costs - instalment, beforeFinance = income - costs;
    const cover = instalment > 0 ? Math.round((beforeFinance / instalment) * 100) / 100 : null;
    /* the colour uses the exact ratio, not the rounded one shown: 1.499 is not 1.5 */
    const colour = net < 0 ? "red" : instalment === 0 ? (net > 0 ? "green" : "amber") : beforeFinance >= GREEN_COVER * instalment ? "green" : beforeFinance >= AMBER_COVER * instalment ? "amber" : "red";
    const lower = (pct: number) => { const inc = Math.round(income * (100 - pct) / 100); return { percent: pct, incomeCents: inc, netCents: inc - costs - instalment }; };
    const breakEven = costs + instalment, notes: string[] = [];
    if (hist.monthsWithIncome < 3 && (incomeFrom === "history" || costsFrom === "history")) notes.push(`Only ${hist.monthsWithIncome} month${hist.monthsWithIncome === 1 ? "" : "s"} with income were recorded, so an average taken from your history is a weak guide: type your own expected figures.`);
    if (hist.vehicles > 0 && (incomeFrom === "history" || costsFrom === "history")) notes.push(`The history figures are an average per vehicle over the ${hist.months} full months before this one, divided by the ${hist.vehicles} vehicle${hist.vehicles === 1 ? "" : "s"} you have now. If you added a vehicle during that time, the average per vehicle is lower than it should be.`);
    if (net < 0) notes.push(`At these figures the vehicle would lose ${rand(-net)} every month.`); if (loanAmount === 0) notes.push("There is no loan in this plan: it is paid for in cash.");
    notes.push("This is a plan from your own records, not financial advice and not what a lender would approve. A driver's pay is a private agreement, so the income is not guaranteed.");
    return { ok: true, value: {
      inputs: { priceCents: price, depositCents: deposit, upfrontCostsCents: upfront, ratePercent: rateBp / 100, termMonths: term, lookbackMonths: lb },
      history: hist, loan: { amountCents: loanAmount, instalmentCents: instalment, totalRepayableCents: totalRepayable, totalInterestCents: Math.max(0, totalRepayable - loanAmount) },
      monthly: { incomeCents: income, incomeFrom, costsCents: costs, costsFrom, beforeFinanceCents: beforeFinance, instalmentCents: instalment, netCents: net, coverage: cover },
      cashNeededNowCents: cashIn, paybackMonths: net > 0 && cashIn > 0 ? Math.ceil(cashIn / net) : null, breakEvenIncomeCents: breakEven, breakEvenWeeklyCents: Math.ceil((breakEven * 12) / 52),
      stress: [lower(10), lower(20)], businessAfter: { monthlyCashProfitNowCents: hist.fleetCashProfitCents, monthlyCashProfitWithItCents: hist.fleetCashProfitCents + net },
      verdict: { colour, text: colour === "green" ? "It pays for itself comfortably at these figures." : colour === "amber" ? "It pays for itself, but with little room if income falls." : "It would lose money each month at these figures." },
      notes } };
  }

  /* ───────────────────────── saved plans ───────────────────────── */
  const UUIDRE = /^[0-9a-f-]{36}$/i, FIELDS = ["priceCents", "depositCents", "upfrontCostsCents", "ratePercent", "termMonths", "expectedIncomeCents", "expectedCostsCents", "lookbackMonths"] as const;
  const asObj = (v: unknown): Record<string, unknown> => { if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>; if (typeof v === "string") { try { const p = JSON.parse(v); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; } } return {}; };
  /** Keeps a plan's figures (and only those): the answer is not saved, it is worked out again from the owner's records every time it is shown. A plan is refused unless it works out. */
  async function savePlan(owner: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const name = typeof b.name === "string" ? b.name.trim() : ""; if (!name || name.length > 60) return bad(400, "Give the plan a name (up to 60 characters)");
    const inputs: Record<string, unknown> = {}; for (const k of FIELDS) if (b[k] !== undefined && b[k] !== null && b[k] !== "") inputs[k] = b[k];
    const r = await plan(owner, inputs as unknown as PlanInput); if (!r.ok) return r;
    if ((await db.query(`SELECT 1 AS x FROM owner_plans WHERE owner_id = $1 AND lower(name) = $2`, [owner, name.toLowerCase()])).rows.length) return bad(409, "You already have a plan with that name");
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM owner_plans WHERE owner_id = $1`, [owner])).rows[0].n) >= MAX_PLANS) return bad(409, `You can keep ${MAX_PLANS} plans: delete one you no longer need`);
    const row = (await db.query(`INSERT INTO owner_plans (owner_id, name, inputs, created_by, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [owner, name, JSON.stringify(inputs), by, now().toISOString()])).rows[0]; return { ok: true, value: { id: String(row.id) } };
  }
  /** The saved plans, oldest first, each with what it works out to NOW (or why it no longer works out). */
  async function plans(owner: string) {
    const rows = (await db.query(`SELECT * FROM owner_plans WHERE owner_id = $1 ORDER BY created_at, name`, [owner])).rows, out = [];
    for (const r of rows) { const inputs = asObj(r.inputs), res = await plan(owner, inputs as unknown as PlanInput); const v = res.ok ? (res.value as any) : null; out.push({ id: String(r.id), name: String(r.name), savedOn: saDay(new Date(r.created_at as string)), inputs, result: v ? { verdict: v.verdict, instalmentCents: v.loan.instalmentCents, netCents: v.monthly.netCents, coverage: v.monthly.coverage, cashNeededNowCents: v.cashNeededNowCents, paybackMonths: v.paybackMonths, breakEvenIncomeCents: v.breakEvenIncomeCents, incomeCents: v.monthly.incomeCents, costsCents: v.monthly.costsCents, businessAfterCents: v.businessAfter.monthlyCashProfitWithItCents } : null, problem: res.ok ? null : res.error }); }
    return out;
  }
  async function removePlan(owner: string, id: string): Promise<Res<{ id: string }>> { const r = typeof id === "string" && UUIDRE.test(id) ? (await db.query(`SELECT id FROM owner_plans WHERE id = $1 AND owner_id = $2`, [id, owner])).rows[0] : null; if (!r) return bad(404, "That plan was not found"); await db.query(`DELETE FROM owner_plans WHERE id = $1`, [id]); return { ok: true, value: { id } }; }
  return { plan, history, savePlan, plans, removePlan };
}
export type OwnerPlanner = ReturnType<typeof createOwnerPlanner>;
