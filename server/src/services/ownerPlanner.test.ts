/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createOwnerPlanner, loanPayment, MAX_PRICE_CENTS, MAX_TERM, MAX_RATE_PERCENT, type OwnerPlanner } from "./ownerPlanner.js";

/**
 * The fleet expansion planner. Every loan figure below was worked out separately with exact decimal arithmetic, not copied from the code.
 * Owner O1 has two vehicles and, for May to October 2026, recorded: income R12 000 + R8 000 = R20 000 a month, running costs R6 000 a month, and a R4 000 loan instalment a month. Clock: 18 Nov 2026.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2) }, V = { v1: id(20), v2: id(21), v3: id(22) };
const NOW = new Date("2026-11-18T08:00:00Z"), R = (rand: number) => Math.round(rand * 100);
let db: Db, p: OwnerPlanner;
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const pay = (vehicle: string, rand: number, on: string) => db.query(`INSERT INTO driver_payments (owner_id, vehicle_id, amount_cents, paid_on, method) VALUES ($1,$2,$3,$4,'cash')`, [U.O1, vehicle, R(rand), on]);
const cost = (vehicle: string, rand: number, on: string) => db.query(`INSERT INTO vehicle_costs (owner_id, vehicle_id, category, amount_cents, incurred_on) VALUES ($1,$2,'fuel',$3,$4)`, [U.O1, vehicle, R(rand), on]);
const BASE = { priceCents: R(300000), depositCents: R(50000), upfrontCostsCents: R(10000), ratePercent: 12, termMonths: 60 };

beforeEach(async () => {
  db = allPortalsDb(); p = createOwnerPlanner(db, () => NOW);
  for (const [i, nm] of [[U.O1, "Olu Owner"], [U.O2, "Ona Owner"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,'vehicle_owner')`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CA 333-333','Toyota',15)`, [V.v1, U.O1, V.v2, V.v3, U.O2]);
  const fid = String((await db.query(`INSERT INTO vehicle_finance (owner_id, vehicle_id, lender, original_cents, balance_cents, balance_on, instalment_cents, due_day, start_date) VALUES ($1,$2,'WesBank',$3,$4,'2026-10-31',$5,20,'2026-01-20') RETURNING id`, [U.O1, V.v1, R(100000), R(50000), R(4000)])).rows[0].id);
  for (const m of ["05", "06", "07", "08", "09", "10"]) { await pay(V.v1, 12000, `2026-${m}-10`); await pay(V.v2, 8000, `2026-${m}-12`); await cost(V.v1, 4000, `2026-${m}-05`); await cost(V.v2, 2000, `2026-${m}-06`); await db.query(`INSERT INTO finance_instalments (finance_id, owner_id, amount_cents, paid_on) VALUES ($1,$2,$3,$4)`, [fid, U.O1, R(4000), `2026-${m}-20`]); }
  await pay(V.v1, 99999, "2026-11-03");                  // this month is not a full month, so it must not count
  await pay(V.v1, 99999, "2026-04-10");                  // and neither does a month before the six
});

describe("the loan instalment", () => {
  it("matches the exact figures worked out separately, rounded up to the cent", () => {
    for (const [principal, bp, n, want] of [[30000000, 1200, 60, 667334], [30000000, 0, 60, 500000], [25000000, 1375, 72, 511803], [10000000, 2400, 12, 945596], [1, 1000, 12, 1], [45000000, 0, 48, 937500], [15000000, 950, 36, 480495], [25000000, 1200, 60, 556112]] as const) expect(loanPayment(principal, bp, n), `${principal} at ${bp / 100}% for ${n}`).toBe(want);
  });
  it("is nothing for nothing owed, refuses no months, never less than the loan over the term, and rises with the rate and falls with the term", () => {
    expect(loanPayment(0, 1200, 60)).toBe(0); expect(loanPayment(-5, 1200, 60)).toBe(0); expect(() => loanPayment(100, 1200, 0)).toThrow(); for (const [pr, bp, n] of [[12345678, 1099, 37], [99999999, 5999, 120], [100, 1, 1], [7, 0, 3]] as const) expect(loanPayment(pr, bp, n) * n).toBeGreaterThanOrEqual(pr);
    expect(loanPayment(30000000, 1500, 60)).toBeGreaterThan(loanPayment(30000000, 1200, 60)); expect(loanPayment(30000000, 1200, 48)).toBeGreaterThan(loanPayment(30000000, 1200, 60)); expect(loanPayment(1000, 0, 3)).toBe(334);                  // 333.33 rounds up
  });
});

describe("what one more vehicle would do", () => {
  it("works out the loan, the monthly picture, the break-even and the stress cases from the owner's own history", async () => {
    const r = ok<any>(await p.plan(U.O1, BASE));
    expect(r.history).toMatchObject({ months: 6, from: "2026-05", to: "2026-10", monthsWithIncome: 6, vehicles: 2, fleetIncomeCents: 2000000, fleetCostCents: 600000, fleetInstalmentCents: 400000, fleetCashProfitCents: 1000000, perVehicleIncomeCents: 1000000, perVehicleCostCents: 300000 });
    expect(r.loan).toEqual({ amountCents: 25000000, instalmentCents: 556112, totalRepayableCents: 33366720, totalInterestCents: 8366720 });
    expect(r.monthly).toEqual({ incomeCents: 1000000, incomeFrom: "history", costsCents: 300000, costsFrom: "history", beforeFinanceCents: 700000, instalmentCents: 556112, netCents: 143888, coverage: 1.26 });
    expect([r.cashNeededNowCents, r.paybackMonths, r.breakEvenIncomeCents, r.breakEvenWeeklyCents]).toEqual([6000000, 42, 856112, 197565]); expect(r.stress).toEqual([{ percent: 10, incomeCents: 900000, netCents: 43888 }, { percent: 20, incomeCents: 800000, netCents: -56112 }]);
    expect(r.businessAfter).toEqual({ monthlyCashProfitNowCents: 1000000, monthlyCashProfitWithItCents: 1143888 }); expect(r.verdict).toEqual({ colour: "amber", text: "It pays for itself, but with little room if income falls." }); expect(r.inputs).toEqual({ priceCents: 30000000, depositCents: 5000000, upfrontCostsCents: 1000000, ratePercent: 12, termMonths: 60, lookbackMonths: 6 });
  });
  it("uses the figures the owner types instead of the history, and says where each came from", async () => {
    const r = ok<any>(await p.plan(U.O1, { ...BASE, expectedIncomeCents: R(15000), expectedCostsCents: R(2500) })); expect(r.monthly).toMatchObject({ incomeCents: 1500000, incomeFrom: "you", costsCents: 250000, costsFrom: "you", beforeFinanceCents: 1250000, netCents: 693888, coverage: 2.25 }); expect(r.verdict.colour).toBe("green"); expect(r.paybackMonths).toBe(Math.ceil(6000000 / 693888));
    expect(ok<any>(await p.plan(U.O1, { ...BASE, expectedIncomeCents: R(15000) })).monthly).toMatchObject({ incomeFrom: "you", costsFrom: "history", costsCents: 300000 }); expect(ok<any>(await p.plan(U.O1, { ...BASE, expectedCostsCents: R(2500) })).monthly).toMatchObject({ incomeFrom: "history", costsFrom: "you" });
  });
  it("looks back 3, 6 or 12 months, and counts only full months before this one", async () => {
    expect(ok<any>(await p.plan(U.O1, { ...BASE, lookbackMonths: 3 })).history).toMatchObject({ months: 3, from: "2026-08", to: "2026-10", fleetIncomeCents: 2000000 }); const twelve = ok<any>(await p.plan(U.O1, { ...BASE, lookbackMonths: 12 })).history; expect(twelve).toMatchObject({ months: 12, from: "2025-11", to: "2026-10", monthsWithIncome: 7 }); expect(twelve.fleetIncomeCents).toBe(Math.round((6 * 2000000 + 9999900) / 12));
  });
  it("is a cash purchase when the deposit is the whole price: no loan, no rate or term needed, nothing owed", async () => {
    const r = ok<any>(await p.plan(U.O1, { priceCents: R(200000), depositCents: R(200000) })); expect(r.loan).toEqual({ amountCents: 0, instalmentCents: 0, totalRepayableCents: 0, totalInterestCents: 0 }); expect(r.monthly).toMatchObject({ instalmentCents: 0, netCents: 700000, coverage: null }); expect(r.verdict.colour).toBe("green"); expect(r.paybackMonths).toBe(Math.ceil(R(200000) / 700000)); expect(r.notes).toContain("There is no loan in this plan: it is paid for in cash.");
    expect(ok<any>(await p.plan(U.O1, { priceCents: R(200000), depositCents: R(200000), expectedIncomeCents: R(3000), expectedCostsCents: R(3000) })).verdict.colour).toBe("amber");                  // breaks even exactly
    expect(ok<any>(await p.plan(U.O1, { priceCents: R(200000), depositCents: R(200000), expectedIncomeCents: R(2000), expectedCostsCents: R(3000) })).verdict.colour).toBe("red");
  });
  it("has no payback when it does not earn, and none when nothing was put in", async () => {
    expect(ok<any>(await p.plan(U.O1, { ...BASE, expectedIncomeCents: R(5000) })).paybackMonths).toBeNull(); expect(ok<any>(await p.plan(U.O1, { priceCents: R(200000), depositCents: 0, ratePercent: 0, termMonths: 100, expectedIncomeCents: R(5000), expectedCostsCents: 0 })).paybackMonths).toBeNull();
  });
  it("colours on the exact ratio: at least 1.5 is green, from 1.0 up to 1.5 amber, below 1.0 red, and 1.499 is not 1.5", async () => {
    const at = async (beforeFinance: number) => ok<any>(await p.plan(U.O1, { priceCents: R(12000), depositCents: 0, ratePercent: 0, termMonths: 12, expectedIncomeCents: beforeFinance, expectedCostsCents: 0 })).verdict.colour;                  // the instalment is R1 000
    expect(await at(150000)).toBe("green"); expect(await at(149999)).toBe("amber"); expect(await at(100000)).toBe("amber"); expect(await at(99999)).toBe("red"); expect(await at(0)).toBe("red"); expect(ok<any>(await p.plan(U.O1, { priceCents: R(12000), depositCents: 0, ratePercent: 0, termMonths: 12, expectedIncomeCents: 149999, expectedCostsCents: 0 })).monthly.coverage).toBe(1.5);
  });
  it("says a vehicle that loses money loses it, and gives the break-even in a week", async () => {
    const r = ok<any>(await p.plan(U.O1, { ...BASE, expectedIncomeCents: R(4000), expectedCostsCents: R(3000) })); expect(r.verdict).toEqual({ colour: "red", text: "It would lose money each month at these figures." }); expect(r.notes.join(" ")).toContain("lose R4 561.12 every month"); expect(r.monthly.netCents).toBe(100000 - 556112); expect(r.breakEvenWeeklyCents).toBe(Math.ceil((300000 + 556112) * 12 / 52));
  });
  it("warns when there is little history, and that an average per vehicle is thin if vehicles were added", async () => {
    const r = ok<any>(await p.plan(U.O1, BASE)); expect(r.notes.some((n: string) => n.includes("not financial advice and not what a lender would approve"))).toBe(true); expect(r.notes.some((n: string) => n.includes("divided by the 2 vehicles you have now"))).toBe(true); expect(r.notes.some((n: string) => n.startsWith("Only "))).toBe(false);
    await db.query(`DELETE FROM driver_payments WHERE paid_on < '2026-09-01'`); const t = ok<any>(await p.plan(U.O1, BASE)); expect(t.history.monthsWithIncome).toBe(2); expect(t.notes.some((n: string) => n.startsWith("Only 2 months with income were recorded"))).toBe(true);
    expect(ok<any>(await p.plan(U.O1, { ...BASE, expectedIncomeCents: R(9000), expectedCostsCents: R(2000) })).notes.some((n: string) => n.startsWith("Only "))).toBe(false);                  // no guess from history, so no warning about it
  });
  it("needs the owner to say what to expect when there is no history or no vehicle, and works when they do", async () => {
    expect(await p.plan(U.O2, BASE)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("there is not enough recorded history") }); const r = ok<any>(await p.plan(U.O2, { ...BASE, expectedIncomeCents: R(9000), expectedCostsCents: R(2000) })); expect(r.history).toMatchObject({ vehicles: 1, fleetIncomeCents: 0, perVehicleIncomeCents: 0 }); expect(r.monthly).toMatchObject({ incomeCents: 900000, netCents: 900000 - 200000 - 556112 });
    await db.query(`DELETE FROM vehicles WHERE owner_id = $1`, [U.O2]); expect(await p.plan(U.O2, BASE)).toMatchObject({ ok: false, status: 400 }); expect(ok<any>(await p.plan(U.O2, { ...BASE, expectedIncomeCents: R(9000) })).history.vehicles).toBe(0);
  });
  it("uses only the owner's own history, never another owner's", async () => { const r = ok<any>(await p.plan(U.O1, BASE)); expect(JSON.stringify(r)).not.toContain("CA 333-333"); expect(r.history.vehicles).toBe(2); expect(ok<any>(await p.plan(U.O2, { ...BASE, expectedIncomeCents: R(9000) })).history.fleetIncomeCents).toBe(0); });
});

describe("what it refuses", () => {
  it("refuses a price, deposit, upfront cost, rate, term, lookback or expected figure that is not valid, with a message that says which", async () => {
    const cases: [any, RegExp][] = [[{ priceCents: undefined }, /price of the vehicle/], [{ priceCents: 0 }, /price of the vehicle/], [{ priceCents: -1 }, /price of the vehicle/], [{ priceCents: 1.5 }, /price of the vehicle/], [{ priceCents: MAX_PRICE_CENTS + 1 }, /price of the vehicle/], [{ priceCents: NaN }, /price of the vehicle/],
      [{ depositCents: -1 }, /deposit/], [{ depositCents: BASE.priceCents + 1 }, /deposit/], [{ depositCents: 1.5 }, /deposit/], [{ upfrontCostsCents: -1 }, /on the road/], [{ upfrontCostsCents: 1.5 }, /on the road/],
      [{ ratePercent: undefined }, /interest rate from your quote/], [{ ratePercent: -1 }, /interest rate/], [{ ratePercent: MAX_RATE_PERCENT + 0.01 }, /interest rate/], [{ ratePercent: NaN }, /interest rate/], [{ termMonths: undefined }, /number of months/], [{ termMonths: 0 }, /number of months/], [{ termMonths: MAX_TERM + 1 }, /number of months/], [{ termMonths: 12.5 }, /number of months/],
      [{ lookbackMonths: 5 }, /3, 6 or 12/], [{ lookbackMonths: 24 }, /3, 6 or 12/], [{ expectedIncomeCents: -1 }, /income you expect/], [{ expectedIncomeCents: 1.5 }, /income you expect/], [{ expectedCostsCents: -1 }, /running cost you expect/], [{ expectedCostsCents: 1.5 }, /running cost you expect/]];
    for (const [bad, why] of cases) expect(await p.plan(U.O1, { ...BASE, ...bad }), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
  });
  it("never assumes a rate: with a loan, no rate is an error, and with no loan, none is needed", async () => { expect(await p.plan(U.O1, { priceCents: R(100000), depositCents: R(10000), termMonths: 24 })).toMatchObject({ ok: false, error: expect.stringContaining("interest rate from your quote") }); expect(ok<any>(await p.plan(U.O1, { priceCents: R(100000), depositCents: R(100000) })).loan.instalmentCents).toBe(0); expect(ok<any>(await p.plan(U.O1, { ...BASE, ratePercent: 0 })).loan.instalmentCents).toBe(416667); });                  // R250 000 over 60 months at 0%
  it("accepts a rate to two decimal places, and the limits themselves", async () => {
    expect(ok<any>(await p.plan(U.O1, { ...BASE, ratePercent: 13.75, priceCents: R(300000), depositCents: R(50000), termMonths: 72 })).loan.instalmentCents).toBe(loanPayment(25000000, 1375, 72)); expect(ok<any>(await p.plan(U.O1, { ...BASE, ratePercent: MAX_RATE_PERCENT, termMonths: MAX_TERM })).loan.instalmentCents).toBe(loanPayment(25000000, 6000, 120)); expect(ok<any>(await p.plan(U.O1, { ...BASE, termMonths: 1 })).loan.instalmentCents).toBe(loanPayment(25000000, 1200, 1)); expect(ok<any>(await p.plan(U.O1, { ...BASE, priceCents: MAX_PRICE_CENTS, depositCents: 0 })).loan.amountCents).toBe(MAX_PRICE_CENTS);
  });
  it("records nothing: it is only a calculation", async () => { const before = JSON.stringify([(await db.query(`SELECT COUNT(*) AS n FROM audit_log`)).rows, (await db.query(`SELECT COUNT(*) AS n FROM vehicle_costs`)).rows, (await db.query(`SELECT COUNT(*) AS n FROM vehicle_finance`)).rows]); await p.plan(U.O1, BASE); await p.plan(U.O1, { ...BASE, priceCents: -1 }); expect(JSON.stringify([(await db.query(`SELECT COUNT(*) AS n FROM audit_log`)).rows, (await db.query(`SELECT COUNT(*) AS n FROM vehicle_costs`)).rows, (await db.query(`SELECT COUNT(*) AS n FROM vehicle_finance`)).rows])).toBe(before); });
});
