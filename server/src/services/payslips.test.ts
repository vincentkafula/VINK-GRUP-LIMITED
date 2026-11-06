import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createCommission, type Commission } from "./commission.js";
import { createPayslips, periodFor, rand, type Payslips } from "./payslips.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Payslips, on the worked example: a marshal completed 120 trips in the week Mon 26 Oct to Sun 1 Nov 2026; the trip fee is R20 and the rate 40%, so R2,400 of fees and R960 gross commission; an advance repayment
 * of R100 and an association fee of R50 come off, so net pay is R810. The days: 18, 17, 19, 18, 24, 16 and 8 trips.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), M1: id(3), M2: id(4), D1: id(5), O1: id(6), boss: id(7) };
const R1 = id(100), R2 = id(101), V1 = id(110);
const START = "2026-10-26", END = "2026-11-01";
const DAYS: [string, number][] = [["2026-10-26", 18], ["2026-10-27", 17], ["2026-10-28", 19], ["2026-10-29", 18], ["2026-10-30", 24], ["2026-10-31", 16], ["2026-11-01", 8]];
let db: Db, c: Commission, p: Payslips, clock: Date, n = 1000;
const at = (day: string, h: number, m: number) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`);
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[];
const ok = <T,>(r: { ok: boolean } & T): any => { expect(r.ok, JSON.stringify(r)).toBe(true); return r; };

beforeEach(async () => {
  db = allPortalsDb(); clock = new Date("2026-11-02T08:00:00Z"); c = createCommission(db, () => clock); p = createPayslips(db, c, () => clock);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.M1, "Mo Marshal", "marshal"], [U.M2, "Mia Marshal", "marshal"], [U.D1, "Dee Driver", "driver"], [U.O1, "Olu Owner", "vehicle_owner"], [U.boss, "Boss", "superadmin"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa'),($3,$2,'Bellville')`, [R1, U.A, R2]); await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2),($1,$3),($4,$2)`, [R1, U.M1, U.M2, R2]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, driver_id) VALUES ($1,$2,'CA 111-111',$3)`, [V1, U.O1, U.D1]);
  ok(await c.addRate(U.A, U.boss, { scope: "default", rateBp: 4000, effectiveFrom: "2026-01-01" })); ok(await c.updateSettings(U.A, { mode: "commission" }));
});
/** Departures for a marshal, calculated live as the marshal's own departures are. Returns their ids in order. */
async function trips(list: [string, number][], o: { marshal?: string; rank?: string; mode?: boolean } = {}): Promise<string[]> {
  const out: string[] = [];
  for (const [day, count] of list) for (let i = 0; i < count; i++) {
    const d = String((await db.query(`INSERT INTO departures (id, rank_id, vehicle_id, driver_id, marshal_id, departed_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [id(n++), o.rank ?? R1, V1, U.D1, o.marshal ?? U.M1, at(day, 5 + Math.floor(i / 12), (i * 5) % 60)])).rows[0].id);
    if (o.mode !== false) await c.recordDeparture(d); out.push(d);
  }
  return out;
}
const payFees = async (except = 0) => { const items = await q(`SELECT id FROM payment_items WHERE kind = 'trip_fee' ORDER BY created_at, id`); for (const it of items.slice(0, items.length - except)) await db.query(`UPDATE payment_items SET status = 'paid', paid_at = now() WHERE id = $1`, [it.id]); };
const adj = async (a: Record<string, unknown>) => { const r = ok(await p.addAdjustment(U.A, U.boss, { marshalId: U.M1, ...a } as any)); await new Promise((done) => setTimeout(done, 5)); return r; };          // (real requests are never in the same millisecond)

describe("the pay period", () => {
  it("is the week, fortnight or month the day falls in, counted from the association's Monday", () => {
    const w = { payPeriod: "weekly" as const, payPeriodAnchor: "2026-01-05" };
    expect(periodFor(w, "2026-10-28")).toEqual({ start: "2026-10-26", end: "2026-11-01" }); expect(periodFor(w, "2026-10-26")).toEqual({ start: "2026-10-26", end: "2026-11-01" }); expect(periodFor(w, "2026-11-01")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(periodFor(w, "2026-01-05")).toEqual({ start: "2026-01-05", end: "2026-01-11" }); expect(periodFor(w, "2026-01-04")).toEqual({ start: "2025-12-29", end: "2026-01-04" });
    expect(periodFor({ payPeriod: "fortnightly", payPeriodAnchor: "2026-01-05" }, "2026-10-28")).toEqual({ start: "2026-10-26", end: "2026-11-08" });      // 21 fortnights from the anchor
    expect(periodFor({ payPeriod: "fortnightly", payPeriodAnchor: "2026-01-05" }, "2026-10-25")).toEqual({ start: "2026-10-12", end: "2026-10-25" });
    expect(periodFor({ payPeriod: "monthly", payPeriodAnchor: "2026-01-05" }, "2026-02-14")).toEqual({ start: "2026-02-01", end: "2026-02-28" }); expect(periodFor({ payPeriod: "monthly", payPeriodAnchor: "2026-01-05" }, "2028-02-14").end).toBe("2028-02-29");
  });
  it("writes rand the way the payslip shows it", () => { expect([rand(0), rand(5), rand(96000), rand(240000), rand(123456789), rand(-800)]).toEqual(["R0.00", "R0.05", "R960.00", "R2,400.00", "R1,234,567.89", "-R8.00"]); });
});

describe("the worked example", () => {
  async function example() {
    await trips(DAYS); await payFees(8);                                                                              // 112 fees paid, 8 still owed
    (await adj({ kind: "advance", reason: "Advance taken 14 Oct", reference: "ADV-0007", totalCents: 30000, perPeriodCents: 10000 })); (await adj({ kind: "association_fee", reason: "Weekly fee", reference: "FEE-W44", totalCents: 5000 }));
    return ok(await p.draft(U.A, U.M1, START, END, U.boss));
  }
  it("120 trips at a R20 fee and 40%: R2,400 of fees, R960 gross, R150 of deductions, R810 net", async () => {
    const d = await example(); expect(d.value).toMatchObject({ number: "PS-20261101-M0001", empty: false });
    const v = ok(await p.view(d.value.id, { associationId: U.A })).value;
    expect(v).toMatchObject({ number: "PS-20261101-M0001", status: "draft", association: "Langa Taxi Association", marshal: "Mo Marshal", marshalNumber: "M-0001", ranks: "Langa", periodStart: START, periodEnd: END, trips: 120, tripFeeTotalCents: 240000, grossCommissionCents: 96000, otherEarningsCents: 0, deductionsCents: 15000, netCents: 81000 });
    expect(v.lines.filter((l: any) => l.side === "earning").map((l: any) => [l.kind, l.label, l.quantity, l.unitCents, l.rateBp, l.amountCents])).toEqual([["commission", "Commission: 120 trips at R20.00 fee, 40%", 120, 2000, 4000, 96000]]);
    expect(v.lines.filter((l: any) => l.side === "deduction").map((l: any) => [l.kind, l.reference, l.amountCents])).toEqual([["advance", "ADV-0007", 10000], ["association_fee", "FEE-W44", 5000]]);
    expect(v.lines.find((l: any) => l.kind === "advance").reason).toContain("R200.00 still to repay after this");
    expect(v).toMatchObject({ feesOwedTrips: 8, feesOwedCents: 16000, withheldCents: 0, commissionPayableOn: "recorded" });                      // the drivers' late payment does not touch the marshal's pay
    expect(v.note).toContain("Generated from system trip records"); expect(v.note).toContain("not a tax document");
  });
  it("breaks the week into days that add up to the payslip, and each day to its trips", async () => {
    const d = await example(); const v = ok(await p.view(d.value.id, { associationId: U.A })).value;
    expect(v.daily.map((x: any) => [x.date, x.rank, x.trips, x.feesCents, x.commissionCents])).toEqual([["2026-10-26", "Langa", 18, 36000, 14400], ["2026-10-27", "Langa", 17, 34000, 13600], ["2026-10-28", "Langa", 19, 38000, 15200], ["2026-10-29", "Langa", 18, 36000, 14400], ["2026-10-30", "Langa", 24, 48000, 19200], ["2026-10-31", "Langa", 16, 32000, 12800], ["2026-11-01", "Langa", 8, 16000, 6400]]);
    expect(v.daily.reduce((a: number, x: any) => a + x.trips, 0)).toBe(120); expect(v.daily.reduce((a: number, x: any) => a + x.commissionCents, 0)).toBe(v.grossCommissionCents);
  });
  it("recomputes the same draft rather than making a second, and refuses a period that has not finished", async () => {
    await example(); const again = ok(await p.draft(U.A, U.M1, START, END, U.boss)); expect((await q(`SELECT * FROM payslips`)).length).toBe(1); expect(again.value.number).toBe("PS-20261101-M0001");
    expect(await p.draft(U.A, U.M1, "2026-11-02", "2026-11-08", U.boss)).toMatchObject({ ok: false, status: 409 }); expect(await p.draft(U.A, U.M1, "bad", END, U.boss)).toMatchObject({ ok: false, status: 400 }); expect(await p.draft(U.A, U.M1, END, START, U.boss)).toMatchObject({ ok: false, status: 400 });
    expect(await p.draft(U.A, U.D1, START, END, U.boss)).toMatchObject({ ok: false, status: 400 });                                                       // not one of the association's marshals
    expect((await q(`SELECT COUNT(*) AS n FROM payslip_lines`))[0].n).toBe(3);                                                                              // the lines were replaced, not added to
  });
  it("makes no payslip for a marshal with nothing in the period", async () => {
    await trips(DAYS); expect(await p.draft(U.A, U.M2, START, END, U.boss)).toEqual({ ok: true, value: { id: "", number: "", empty: true } }); expect((await q(`SELECT * FROM payslips`)).length).toBe(0);
    expect(ok(await p.runPeriod(U.A, START, END, U.boss)).value).toEqual({ drafted: 1, empty: 1 });
  });
});

describe("issuing", () => {
  it("locks the trips and the adjustments to the payslip, and arranges the payment from the association to the marshal", async () => {
    await trips(DAYS); (await adj({ kind: "advance", reason: "Advance", reference: "ADV-0007", totalCents: 30000, perPeriodCents: 10000 })); (await adj({ kind: "association_fee", reason: "Weekly fee", totalCents: 5000 }));
    const d = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; const r = ok(await p.issue(U.A, d.id, U.boss, "wallet")); expect(r.value).toEqual({ number: "PS-20261101-M0001", status: "issued", netCents: 81000 });
    expect((await q(`SELECT COUNT(*) AS n FROM trip_commissions WHERE payslip_id = $1`, [d.id]))[0].n).toBe(120); expect((await q(`SELECT COUNT(*) AS n FROM trip_commissions WHERE payslip_id IS NULL`))[0].n).toBe(0);
    expect((await q(`SELECT kind, remaining_cents, active FROM pay_adjustments ORDER BY created_at, id`))).toEqual([{ kind: "advance", remaining_cents: 20000, active: true }, { kind: "association_fee", remaining_cents: 0, active: false }]);
    expect(await q(`SELECT kind, payer_id, payee_id, amount_cents, ref, status FROM payment_items WHERE kind = 'marshal_commission'`)).toEqual([{ kind: "marshal_commission", payer_id: U.A, payee_id: U.M1, amount_cents: 81000, ref: `payslip:${d.id}`, status: "pending" }]);
    expect((await q(`SELECT status, issued_at, payment_method FROM payslips`))[0]).toMatchObject({ status: "issued", payment_method: "wallet" });
  });
  it("can be issued once: a second issue, a payslip of another association and a stale draft are refused", async () => {
    await trips(DAYS.slice(0, 2)); const d = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; ok(await p.issue(U.A, d.id, U.boss, "cash")); expect(await p.issue(U.A, d.id, U.boss, "cash")).toMatchObject({ ok: false, status: 409 });
    expect(await p.issue(id(99), d.id, U.boss, "cash")).toMatchObject({ ok: false, status: 404 }); expect(await p.issue(U.A, id(98), U.boss, "cash")).toMatchObject({ ok: false, status: 404 }); expect(await p.issue(U.A, d.id, U.boss, "barter" as any)).toMatchObject({ ok: false, status: 400 });
    expect(await p.draft(U.A, U.M1, START, END, U.boss)).toMatchObject({ ok: false, status: 409 });                                                           // an issued payslip is never redrafted
    expect(ok(await p.draft(U.A, U.M2, START, END, U.boss)).value.empty).toBe(true);                                                                           // a marshal with nothing to show has no payslip
  });
  it("refuses a draft whose figures have changed since it was reviewed, and leaves everything as it was", async () => {
    await trips(DAYS.slice(0, 1)); const d = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; await trips([["2026-10-27", 1]]);                  // a trip is recorded after the draft was made
    expect(await p.issue(U.A, d.id, U.boss, "wallet")).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("figures have changed") });
    expect((await q(`SELECT status FROM payslips`))[0].status).toBe("draft"); expect((await q(`SELECT COUNT(*) AS n FROM trip_commissions WHERE payslip_id IS NOT NULL`))[0].n).toBe(0); expect(await q(`SELECT * FROM payment_items WHERE kind = 'marshal_commission'`)).toEqual([]);
    ok(await p.draft(U.A, U.M1, START, END, U.boss)); expect(ok(await p.issue(U.A, d.id, U.boss, "wallet")).value.netCents).toBe(15200);                                         // redrafted, now it matches (R144 + R8)
  });
  it("never pays a trip twice: the next payslip has only what is new, a late-recorded trip, and a reversal of a trip already paid", async () => {
    const first = await trips([["2026-10-26", 3]]); const d1 = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; ok(await p.issue(U.A, d1.id, U.boss, "bank"));
    const lateTrip = await trips([["2026-10-28", 1]]);                                                                                            // happened last week, only recorded now
    await trips([["2026-11-03", 2]]); ok(await c.reverseCommission(first[0], U.boss, "Fee refunded to the driver", "goodwill"));
    clock = new Date("2026-11-10T08:00:00Z"); const d2 = ok(await p.draft(U.A, U.M1, "2026-11-02", "2026-11-08", U.boss)).value; const v = ok(await p.view(d2.id, { associationId: U.A })).value;
    expect(v.lines.filter((l: any) => l.side === "earning").map((l: any) => [l.kind, l.amountCents])).toEqual([["commission", 1600], ["late_trip", 800], ["reversal", 800]]);
    expect(v).toMatchObject({ trips: 2, grossCommissionCents: 1600, netCents: 1600 }); expect(v.lines.find((l: any) => l.kind === "reversal")).toMatchObject({ reason: "Fee refunded to the driver" }); expect(lateTrip).toHaveLength(1);
    expect(v.daily.find((x: any) => x.date === "2026-10-28")).toMatchObject({ late: true, trips: 1, commissionCents: 800 });
  });
  it("carries a reversal that is bigger than the period's commission forward as a deduction, instead of paying a negative amount", async () => {
    const first = await trips([["2026-10-26", 2]]); ok(await p.issue(U.A, ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, U.boss, "bank"));
    ok(await c.reverseCommission(first[0], U.boss, "x", "goodwill")); ok(await c.reverseCommission(first[1], U.boss, "y", "goodwill")); await trips([["2026-11-03", 1]]); clock = new Date("2026-11-10T08:00:00Z");
    const d2 = ok(await p.draft(U.A, U.M1, "2026-11-02", "2026-11-08", U.boss)).value; expect(ok(await p.view(d2.id, { associationId: U.A })).value).toMatchObject({ grossCommissionCents: 0, netCents: 0 });
    ok(await p.issue(U.A, d2.id, U.boss, "bank")); expect((await q(`SELECT kind, remaining_cents, reference FROM pay_adjustments`))).toEqual([{ kind: "other_deduction", remaining_cents: 800, reference: "REV-PS-20261108-M0001" }]);
    await trips([["2026-11-10", 5]]); clock = new Date("2026-11-17T08:00:00Z"); expect(ok(await p.view(ok(await p.draft(U.A, U.M1, "2026-11-09", "2026-11-15", U.boss)).value.id, { associationId: U.A })).value).toMatchObject({ grossCommissionCents: 4000, deductionsCents: 800, netCents: 3200 });
  });
});

describe("deductions", () => {
  it("never take more of a payslip than the cap, in the order they were made, and what the cap leaves out carries to the next payslip and says so", async () => {
    await trips(DAYS); (await adj({ kind: "advance", reason: "Advance", totalCents: 40000, perPeriodCents: 40000 })); (await adj({ kind: "penalty", reason: "Till shortfall 3 Oct", totalCents: 30000 }));
    const v = ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value;                       // 50% of R960 = R480 room
    expect(v.lines.filter((l: any) => l.side === "deduction").map((l: any) => [l.kind, l.amountCents])).toEqual([["advance", 40000], ["penalty", 8000]]); expect(v).toMatchObject({ deductionsCents: 48000, netCents: 48000 });
    expect(v.lines.find((l: any) => l.kind === "penalty").reason).toContain("R220.00 carried to the next payslip");
    ok(await p.issue(U.A, v.id, U.boss, "bank")); expect((await q(`SELECT kind, remaining_cents, active FROM pay_adjustments ORDER BY created_at, id`))).toEqual([{ kind: "advance", remaining_cents: 0, active: false }, { kind: "penalty", remaining_cents: 22000, active: true }]);
  });
  it("can be switched down to nothing, and only what the cap allows is ever taken when it is 100%", async () => {
    await trips(DAYS); (await adj({ kind: "stokvel", reason: "Monthly", totalCents: 100000 })); ok(await c.updateSettings(U.A, { deductionCapBp: 0 }));
    expect(ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value).toMatchObject({ deductionsCents: 0, netCents: 96000 });
    ok(await c.updateSettings(U.A, { deductionCapBp: 10000 })); expect(ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value).toMatchObject({ deductionsCents: 96000, netCents: 0 });
  });
  it("includes UIF, outside the cap, only for an employee at an association that has switched it on", async () => {
    await trips(DAYS); (await adj({ kind: "stokvel", reason: "Monthly", totalCents: 100000 })); ok(await c.updateSettings(U.A, { uifApplies: true, uifRateBp: 100 }));
    expect(ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value.lines.some((l: any) => l.kind === "uif")).toBe(false);                    // independent: no UIF
    ok(await p.updateProfile(U.M1, { class: "employee", uifApplies: true })); const v = ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value;
    expect(v.lines.find((l: any) => l.kind === "uif")).toMatchObject({ amountCents: 960, rateBp: 100 }); expect(v).toMatchObject({ deductionsCents: 960 + 48000, netCents: 96000 - 960 - 48000 });
    ok(await c.updateSettings(U.A, { uifApplies: false })); expect(ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value.lines.some((l: any) => l.kind === "uif")).toBe(false);
  });
  it("adds earnings beyond commission: a bonus, an incentive, an allowance", async () => {
    await trips(DAYS.slice(0, 1)); (await adj({ kind: "bonus", label: "Festive bonus", totalCents: 5000 })); (await adj({ kind: "allowance", label: "Airtime", totalCents: 3000, perPeriodCents: 1000 }));
    const v = ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value; expect(v).toMatchObject({ grossCommissionCents: 14400, otherEarningsCents: 6000, netCents: 20400 });
    expect(v.lines.filter((l: any) => l.side === "earning").map((l: any) => [l.kind, l.amountCents])).toEqual([["commission", 14400], ["bonus", 5000], ["allowance", 1000]]);
  });
  it("is validated: a kind from the list, a marshal of the association, a reason for a deduction, sensible amounts, a reference made if none is given, and cancellable", async () => {
    const bad = async (a: Record<string, unknown>) => expect(await p.addAdjustment(U.A, U.boss, { marshalId: U.M1, kind: "advance", reason: "x", totalCents: 1000, ...a } as any), JSON.stringify(a)).toMatchObject({ ok: false, status: 400 });
    await bad({ kind: "tip" }); await bad({ marshalId: U.D1 }); await bad({ reason: "  " }); await bad({ totalCents: 0 }); await bad({ totalCents: 10.5 }); await bad({ totalCents: 10_000_001 }); await bad({ perPeriodCents: 2000 }); await bad({ perPeriodCents: 0 });
    expect((await adj({ kind: "advance", reason: "x", totalCents: 1000 })).value.reference).toBe("ADV-0001"); expect((await adj({ kind: "penalty", reason: "x", totalCents: 1000 })).value.reference).toBe("PEN-0002");
    const a = (await adj({ kind: "bonus", totalCents: 1000 })).value; expect(await p.cancelAdjustment(U.A, a.id)).toEqual({ ok: true, value: { remainingCents: 1000 } }); expect(await p.cancelAdjustment(U.A, a.id)).toMatchObject({ ok: false, status: 409 }); expect(await p.cancelAdjustment(id(99), a.id)).toMatchObject({ ok: false, status: 404 });
    expect((await p.adjustments(U.A, U.M1)).length).toBe(3);
  });
});

describe("the rule for when commission is payable", () => {
  it("under 'recorded' (the default), a driver's late payment does not hold back the marshal's pay", async () => {
    await trips(DAYS.slice(0, 1)); expect(ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value).toMatchObject({ grossCommissionCents: 14400, withheldCents: 0, feesOwedTrips: 18 });
  });
  it("under 'paid', commission waits for the fee to be paid, is shown as withheld, and arrives on the next payslip once it is", async () => {
    ok(await c.updateSettings(U.A, { payableOn: "paid" })); await trips([["2026-10-26", 4]]); const items = await q(`SELECT id FROM payment_items ORDER BY created_at, id`); await db.query(`UPDATE payment_items SET status = 'paid' WHERE id = $1`, [items[0].id]); await db.query(`UPDATE payment_items SET status = 'paid' WHERE id = $1`, [items[1].id]);
    const v = ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value; expect(v).toMatchObject({ trips: 2, grossCommissionCents: 1600, withheldCents: 1600, feesOwedTrips: 2, feesOwedCents: 4000, commissionPayableOn: "paid" });
    ok(await p.issue(U.A, v.id, U.boss, "bank")); await db.query(`UPDATE payment_items SET status = 'paid' WHERE kind = 'trip_fee'`); clock = new Date("2026-11-10T08:00:00Z");
    expect(ok(await p.view(ok(await p.draft(U.A, U.M1, "2026-11-02", "2026-11-08", U.boss)).value.id, { associationId: U.A })).value.lines.filter((l: any) => l.side === "earning").map((l: any) => [l.kind, l.amountCents])).toEqual([["late_trip", 1600]]);
  });
  it("counts a waived fee that the association absorbed as payable, and a reversed one not at all", async () => {
    ok(await c.updateSettings(U.A, { payableOn: "paid" })); const ds = await trips([["2026-10-26", 2]]); ok(await c.waiveFee(ds[0], U.boss, { reasonCode: "association_absorbs", reason: "Covered", absorb: true })); ok(await c.waiveFee(ds[1], U.boss, { reasonCode: "goodwill", reason: "Breakdown" }));
    expect(ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value).toMatchObject({ trips: 1, grossCommissionCents: 800 });
  });
});

describe("paying a payslip", () => {
  it("through the wallet becomes paid once the money engine has paid the item; bank or cash is recorded by the admin with a reference", async () => {
    await trips(DAYS.slice(0, 1)); const a = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; ok(await p.issue(U.A, a.id, U.boss, "wallet"));
    expect(ok(await p.view(a.id, { associationId: U.A })).value).toMatchObject({ status: "issued", payment: { method: "wallet", paidAt: null, waiting: "Waiting to be paid" } });
    await db.query(`UPDATE payment_items SET status = 'paid', paid_at = now() WHERE kind = 'marshal_commission'`); const v = ok(await p.view(a.id, { associationId: U.A })).value; expect(v).toMatchObject({ status: "paid", payment: { method: "wallet", waiting: null } }); expect(v.payment.paidAt).toBeTruthy();
    await trips([["2026-11-03", 1]]); clock = new Date("2026-11-10T08:00:00Z"); const b = ok(await p.draft(U.A, U.M1, "2026-11-02", "2026-11-08", U.boss)).value; ok(await p.issue(U.A, b.id, U.boss, "bank"));
    for (const bad of [{ method: "wallet", reference: "x" }, { method: "bank", reference: "  " }, { method: "bank", reference: "R", paidAt: "2030-01-01" }]) expect(await p.recordPayment(U.A, b.id, U.boss, bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await p.recordPayment(U.A, b.id, U.boss, { method: "bank", reference: "EFT-4411", paidAt: "2026-11-09" })).toEqual({ ok: true, value: { status: "paid" } }); expect(ok(await p.view(b.id, { associationId: U.A })).value.payment).toMatchObject({ method: "bank", reference: "EFT-4411" });
    expect(await p.recordPayment(U.A, b.id, U.boss, { method: "bank", reference: "EFT-4412" })).toMatchObject({ ok: false, status: 409 }); expect(await p.recordPayment(U.A, a.id, U.boss, { method: "cash", reference: "x" })).toMatchObject({ ok: false, status: 409 });         // the wallet one is the engine's
  });
  it("is paid at once, with nothing to pay, when the deductions take it to zero", async () => {
    await trips(DAYS.slice(0, 1)); (await adj({ kind: "stokvel", reason: "All", totalCents: 99999 })); ok(await c.updateSettings(U.A, { deductionCapBp: 10000 }));
    const d = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; expect(ok(await p.issue(U.A, d.id, U.boss, "wallet")).value).toMatchObject({ status: "paid", netCents: 0 }); expect(await q(`SELECT * FROM payment_items WHERE kind = 'marshal_commission'`)).toEqual([]);
  });
});

describe("year to date, and who can see what", () => {
  it("adds the issued payslips of the year so far, not later or unissued ones", async () => {
    await trips([["2026-10-19", 2]]); ok(await p.issue(U.A, ok(await p.draft(U.A, U.M1, "2026-10-19", "2026-10-25", U.boss)).value.id, U.boss, "bank"));
    await trips([["2026-10-26", 5]]); (await adj({ kind: "association_fee", reason: "Fee", totalCents: 500 })); const b = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; ok(await p.issue(U.A, b.id, U.boss, "bank"));
    expect(ok(await p.view(b.id, { associationId: U.A })).value.ytd).toEqual({ from: "2026-01-01", grossCents: 1600 + 4000, deductionsCents: 500, netCents: 1600 + 3500 });
    ok(await p.updateProfile(U.M1, { startedOn: "2026-10-26" })); expect(ok(await p.view(b.id, { associationId: U.A })).value.ytd).toEqual({ from: "2026-10-26", grossCents: 4000, deductionsCents: 500, netCents: 3500 });          // a later start date leaves the earlier payslip out
  });
  it("lets a marshal see their own issued payslips only: never a draft, never another marshal's, never another association's", async () => {
    await trips(DAYS.slice(0, 1)); const d = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value;
    expect(await p.view(d.id, { marshalId: U.M1 })).toMatchObject({ ok: false, status: 404 }); expect(await p.list({ associationId: U.A, marshalId: U.M1 })).toEqual([]);
    ok(await p.issue(U.A, d.id, U.boss, "bank")); expect(ok(await p.view(d.id, { marshalId: U.M1 })).value.number).toBe("PS-20261101-M0001"); expect((await p.list({ associationId: U.A, marshalId: U.M1 })).map((x: any) => x.number)).toEqual(["PS-20261101-M0001"]);
    expect(await p.view(d.id, { marshalId: U.M2 })).toMatchObject({ ok: false, status: 404 }); expect(await p.view(d.id, { associationId: id(99) })).toMatchObject({ ok: false, status: 404 }); expect(await p.view(id(98), { associationId: U.A })).toMatchObject({ ok: false, status: 404 });
    expect((await p.list({ associationId: U.A })).length).toBe(1);
  });
  it("gives each marshal a payslip number once, and lets them choose their language and the admin set their class", async () => {
    expect((await p.ensureProfile(U.M1)).marshal_number).toBe("M-0001"); expect((await p.ensureProfile(U.M2)).marshal_number).toBe("M-0002"); expect((await p.ensureProfile(U.M1)).marshal_number).toBe("M-0001");
    expect((ok(await p.updateProfile(U.M1, { language: "zu", class: "employee", uifApplies: true, startedOn: "2026-09-01" })).value as any)).toMatchObject({ language: "zu", class: "employee", uif_applies: true });
    for (const bad of [{ language: "fr" }, { class: "boss" }, { uifApplies: "yes" }, { startedOn: "soon" }]) expect(await p.updateProfile(U.M1, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect((await p.marshals(U.A)).map((m: any) => [m.name, m.marshalNumber, m.class])).toEqual([["Mia Marshal", "M-0002", "independent"], ["Mo Marshal", "M-0001", "employee"]]);
  });
  it("records consent per purpose, with withdrawal, and who looked at a marshal's records", async () => {
    expect(await p.setConsent(U.M1, "payroll_records", true)).toEqual({ ok: true, value: { purpose: "payroll_records", granted: true } }); await p.setConsent(U.M1, "income_letter", true); await p.setConsent(U.M1, "income_letter", false);
    expect((await p.consents(U.M1)).map((x) => [x.purpose, x.granted])).toEqual([["income_letter", false], ["payroll_records", true]]); expect(await p.setConsent(U.M1, "NOT OK", true)).toMatchObject({ ok: false, status: 400 }); await p.setConsent(U.M1, "income_letter", true); expect((await p.consents(U.M1))[0].granted).toBe(true);
    await p.logAccess(U.boss, U.M1, "payslip", "abc"); await p.logAccess(U.M1, U.M1, "payslip", "abc"); expect((await p.accessLog(U.M1)).map((x) => [x.actor, x.what, x.recordId]).sort()).toEqual([["Boss", "payslip", "abc"], ["Mo Marshal", "payslip", "abc"]]); expect(await p.accessLog(U.M2)).toEqual([]);
  });
});

describe("the PDF", () => {
  it("is a real, small PDF of the payslip that carries its number and net pay", async () => {
    await trips(DAYS); await payFees(8); (await adj({ kind: "advance", reason: "Advance", reference: "ADV-0007", totalCents: 30000, perPeriodCents: 10000 })); (await adj({ kind: "association_fee", reason: "Weekly fee", reference: "FEE-W44", totalCents: 5000 }));
    const d = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; const v = ok(await p.view(d.id, { associationId: U.A })).value; const buf = await p.pdf(v);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-"); expect(buf.subarray(-6).toString()).toContain("%%EOF"); expect(buf.length).toBeGreaterThan(1500); expect(buf.length).toBeLessThan(60_000);                      // a payslip must be light enough for a basic phone
    // The PDF library writes text as hex runs, split where it adjusts spacing: decode every run and join them to read what the page says.
    const text = [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1")).join("");
    for (const needle of ["PS-20261101-M0001", "NET PAY: R810.00", "R2,400.00", "R960.00", "ADV-0007", "Mo Marshal", "M-0001", "Langa Taxi Association", "Generated from system trip records"]) expect(text, needle).toContain(needle);
  });
});

describe("refunding a fee the driver has already paid", () => {
  it("pays it back to the driver through the money engine, marks the trip refunded and reverses the marshal's commission, or leaves the commission when the association absorbs it", async () => {
    const [d1, d2] = await trips([["2026-10-26", 2]]); await payFees();
    const r = await c.refundFee(d1, U.boss, { reasonCode: "error_corrected", reason: "Charged for a trip that never left" }); expect(r).toEqual({ ok: true, value: { refundCents: 2000, reversedCents: 800 } });
    expect(await q(`SELECT kind, payer_id, payee_id, amount_cents, remaining_cents, status, ref FROM payment_items WHERE kind = 'trip_fee_refund'`)).toEqual([{ kind: "trip_fee_refund", payer_id: U.A, payee_id: U.D1, amount_cents: 2000, remaining_cents: 2000, status: "pending", ref: `tripfee-refund:${d1}` }]);
    expect((await q(`SELECT waived_reason FROM trip_fees WHERE departure_id = $1`, [d1]))[0].waived_reason).toBe("refunded: Charged for a trip that never left"); expect(await c.netCommission(d1)).toBe(0);
    expect(await c.refundFee(d2, U.boss, { reasonCode: "association_absorbs", reason: "We cover it", absorb: true })).toEqual({ ok: true, value: { refundCents: 2000, reversedCents: 0 } }); expect(await c.netCommission(d2)).toBe(800);
  });
  it("refuses a fee that is not paid (waive it), one already refunded, a missing reason, and a trip with no fee", async () => {
    const [d1, d2] = await trips([["2026-10-26", 2]]); await db.query(`UPDATE payment_items SET status = 'paid' WHERE ref = $1`, [`tripfee:${d1}`]);
    expect(await c.refundFee(d2, U.boss, { reasonCode: "goodwill", reason: "x" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("waive it instead") });
    expect(await c.refundFee(d1, U.boss, { reasonCode: "breakdown", reason: "x" })).toMatchObject({ ok: false, status: 400 }); expect(await c.refundFee(d1, U.boss, { reasonCode: "goodwill", reason: " " })).toMatchObject({ ok: false, status: 400 });
    ok(await c.refundFee(d1, U.boss, { reasonCode: "goodwill", reason: "Refund" })); expect(await c.refundFee(d1, U.boss, { reasonCode: "goodwill", reason: "again" })).toMatchObject({ ok: false, status: 409 }); expect(await c.refundFee(id(999), U.boss, { reasonCode: "goodwill", reason: "x" })).toMatchObject({ ok: false, status: 404 });
    expect((await q(`SELECT * FROM payment_items WHERE kind = 'trip_fee_refund'`)).length).toBe(1);
  });
});

describe("revising a payslip that has not been paid", () => {
  it("releases its trips and adjustments, cancels its payment, keeps the old one on record as revised, and the corrected payslip is a new version", async () => {
    await trips([["2026-10-26", 4]]); await adj({ kind: "advance", reason: "Advance", reference: "ADV-0001", totalCents: 1000, perPeriodCents: 1000 });
    const a = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; ok(await p.issue(U.A, a.id, U.boss, "wallet")); expect((await q(`SELECT remaining_cents, active FROM pay_adjustments`))[0]).toMatchObject({ remaining_cents: 0, active: false });
    expect(await p.revise(U.A, a.id, U.boss, "  ")).toMatchObject({ ok: false, status: 400 }); expect(await p.revise(id(99), a.id, U.boss, "wrong")).toMatchObject({ ok: false, status: 404 });
    expect(await p.revise(U.A, a.id, U.boss, "A trip was left out")).toEqual({ ok: true, value: { number: "PS-20261101-M0001" } });
    expect((await q(`SELECT status, note FROM payslips`))[0]).toEqual({ status: "revised", note: "A trip was left out" }); expect((await q(`SELECT COUNT(*) AS n FROM trip_commissions WHERE payslip_id IS NOT NULL`))[0].n).toBe(0); expect((await q(`SELECT remaining_cents, active FROM pay_adjustments`))[0]).toMatchObject({ remaining_cents: 1000, active: true });
    expect((await q(`SELECT status, last_error FROM payment_items WHERE kind = 'marshal_commission'`))[0]).toEqual({ status: "failed", last_error: "The payslip was revised" });
    await trips([["2026-10-27", 1]]);                                                                                                                       // the trip that was left out
    const b = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; expect(b.number).toBe("PS-20261101-M0001-R1"); const v = ok(await p.view(b.id, { associationId: U.A })).value; expect(v).toMatchObject({ version: 2, trips: 5, grossCommissionCents: 4000, deductionsCents: 1000, netCents: 3000 });
    ok(await p.issue(U.A, b.id, U.boss, "bank")); expect((await q(`SELECT number, version, status, supersedes_id FROM payslips ORDER BY version`)).map((r) => [r.number, r.version, r.status, !!r.supersedes_id])).toEqual([["PS-20261101-M0001", 1, "revised", false], ["PS-20261101-M0001-R1", 2, "issued", true]]);
    expect((await p.listForMarshal(U.M1)).map((x: any) => [x.number, x.status])).toEqual([["PS-20261101-M0001-R1", "issued"], ["PS-20261101-M0001", "revised"]]);
  });
  it("is refused for a draft, a payslip already paid, or one whose wallet payment has gone through; and a carry made when it was issued is released", async () => {
    await trips([["2026-10-26", 2]]); const a = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; expect(await p.revise(U.A, a.id, U.boss, "x")).toMatchObject({ ok: false, status: 409 });                         // a draft
    ok(await p.issue(U.A, a.id, U.boss, "wallet")); await db.query(`UPDATE payment_items SET status = 'paid' WHERE kind = 'marshal_commission'`); expect(await p.revise(U.A, a.id, U.boss, "x")).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already been paid") });
    const b = await q(`SELECT id FROM payslips`); await db.query(`UPDATE payment_items SET status = 'pending'`); await db.query(`UPDATE payslips SET status = 'paid' WHERE id = $1`, [b[0].id]); expect(await p.revise(U.A, b[0].id, U.boss, "x")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("drawing commission that is already earned", () => {
  const MAX = async () => (await p.cashOutStatus(U.A, U.M1));
  async function earned() { await trips([["2026-10-26", 10]]); await payFees(5); }                                    // 10 trips, 5 fees paid: R40 is safely earned
  it("is off until the association switches it on, and allows nothing for fees the drivers have not paid", async () => {
    await earned(); expect(await MAX()).toMatchObject({ enabled: false }); expect(await p.cashOut(U.A, U.M1, 1000, U.M1)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("not switched on") });
    ok(await c.updateSettings(U.A, { cashoutEnabled: true, cashoutCapBp: 5000 })); expect(await MAX()).toEqual({ enabled: true, availableCents: 4000, outstandingCents: 0, maxCents: 2000, capBp: 5000 });
  });
  it("pays what is asked at once (a payment from the association), within the share allowed, and refuses more", async () => {
    await earned(); ok(await c.updateSettings(U.A, { cashoutEnabled: true, cashoutCapBp: 5000 }));
    for (const [amt, status] of [[500, 400], [10.5, 400], [2500, 409], ["lots", 400]] as const) expect(await p.cashOut(U.A, U.M1, amt, U.M1), String(amt)).toMatchObject({ ok: false, status });
    expect(await p.cashOut(id(99), U.M1, 1500, U.M1)).toMatchObject({ ok: false });
    expect(await p.cashOut(U.A, U.M1, 1500, U.M1)).toEqual({ ok: true, value: { reference: "ACC-0001", amountCents: 1500, maxCents: 500 } });
    const adjRow = (await q(`SELECT id, kind, side, reference, remaining_cents FROM pay_adjustments`))[0]; expect(adjRow).toMatchObject({ kind: "advance", side: "deduction", reference: "ACC-0001", remaining_cents: 1500 });
    expect(await q(`SELECT kind, payer_id, payee_id, amount_cents, ref FROM payment_items WHERE kind = 'marshal_commission'`)).toEqual([{ kind: "marshal_commission", payer_id: U.A, payee_id: U.M1, amount_cents: 1500, ref: `cashout:${adjRow.id}` }]);
    expect(await MAX()).toMatchObject({ outstandingCents: 1500, maxCents: 500 }); expect(await p.cashOut(U.A, U.M1, 1000, U.M1)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("up to R5.00") });
  });
  it("comes back off the next payslip, outside the deduction cap, and is shown as such", async () => {
    await earned(); ok(await c.updateSettings(U.A, { cashoutEnabled: true, deductionCapBp: 0 })); ok(await p.cashOut(U.A, U.M1, 1500, U.M1));
    const v = ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value; expect(v).toMatchObject({ grossCommissionCents: 8000, deductionsCents: 1500, netCents: 6500 });        // the cap of 0% did not stop it
    expect(v.lines.find((l: any) => l.reference === "ACC-0001")).toMatchObject({ kind: "advance", label: "Cash-out of accrued commission", amountCents: 1500 });
    ok(await p.issue(U.A, v.id, U.boss, "bank")); expect((await q(`SELECT remaining_cents, active FROM pay_adjustments`))[0]).toEqual({ remaining_cents: 0, active: false });
  });
  it("carries what a small payslip cannot cover to the next one", async () => {
    await trips([["2026-10-26", 1]]); await payFees(); ok(await c.updateSettings(U.A, { cashoutEnabled: true, cashoutCapBp: 10000 })); await db.query(`INSERT INTO pay_adjustments (association_id, marshal_id, kind, side, label, reason, reference, total_cents, remaining_cents) VALUES ($1,$2,'advance','deduction','Cash-out of accrued commission','x','ACC-0009',2000,2000)`, [U.A, U.M1]);
    const v = ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value; expect(v).toMatchObject({ grossCommissionCents: 800, deductionsCents: 800, netCents: 0 }); expect(v.lines.find((l: any) => l.reference === "ACC-0009").reason).toContain("R12.00 carried to the next payslip");
    ok(await p.issue(U.A, v.id, U.boss, "wallet")); expect((await q(`SELECT remaining_cents, active FROM pay_adjustments`))[0]).toEqual({ remaining_cents: 1200, active: true });
  });
  it("is validated in the settings, and a marshal who does not work for the association cannot draw", async () => {
    for (const bad of [{ cashoutCapBp: 10001 }, { cashoutCapBp: -1 }, { cashoutEnabled: "yes" }, { shiftLimitMinutes: 30 }, { weekLimitMinutes: 20000 }, { shiftGapMinutes: 5 }]) expect(await c.updateSettings(U.A, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await c.updateSettings(U.A, { cashoutEnabled: true })); expect(await p.cashOut(U.A, U.D1, 1000, U.D1)).toMatchObject({ ok: false, status: 403 });
  });
});

describe("PAYE and the UIF ceiling on the payslip", () => {
  const employee = async () => { ok(await p.updateProfile(U.M1, { class: "employee", uifApplies: true })); ok(await c.updateSettings(U.A, { uifApplies: true, payeEnabled: true })); };
  const slip = async (cents: number) => ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value as any;
  it("takes UIF and an estimate of PAYE from an employee's weekly pay, by the SARS tables, and says what it is", async () => {
    await employee(); await adj({ kind: "bonus", label: "Festive", totalCents: 200000 }); const v = await slip(200000);
    expect(v.lines.filter((l: any) => l.side === "deduction").map((l: any) => [l.kind, l.amountCents])).toEqual([["uif", 2000], ["paye", 1371]]);                                  // R20.00 UIF; R1 980 x 52 = R102 960, tax R18 532.80 less R17 820, over 52
    expect(v).toMatchObject({ deductionsCents: 3371, netCents: 196629 }); expect(v.lines.find((l: any) => l.kind === "paye")).toMatchObject({ label: "PAYE (estimate)", reference: "PAYE", reason: expect.stringContaining("SARS 2026/27 tables") });
    expect(v.note).toContain("PAYE is an estimate from the SARS tables"); expect(v.note).toContain("not a tax certificate");
  });
  it("takes PAYE outside the deduction cap, as the law says, even when the association allows no other deductions", async () => {
    await employee(); ok(await c.updateSettings(U.A, { deductionCapBp: 0 })); await adj({ kind: "bonus", label: "Festive", totalCents: 200000 }); await adj({ kind: "advance", reason: "Advance", reference: "ADV-1", totalCents: 50000, perPeriodCents: 50000 });
    const v = await slip(200000); expect(v.lines.filter((l: any) => l.side === "deduction").map((l: any) => l.kind)).toEqual(["uif", "paye"]); expect((await q(`SELECT remaining_cents FROM pay_adjustments WHERE reference = 'ADV-1'`))[0].remaining_cents).toBe(50000);   // the advance waits; the tax does not
  });
  it("caps UIF at the ceiling and works PAYE on what is left after it (R1 999.20 on R10 000 a week, worked by hand from the brackets)", async () => {
    await employee(); await adj({ kind: "bonus", label: "Big week", totalCents: 1_000_000 }); const v = await slip(1_000_000);
    expect(v.lines.find((l: any) => l.kind === "uif").amountCents).toBe(4087);                                                                                                  // R40.87 (the weekly ceiling R4 087.38 at 1%), not R100
    expect(v.lines.find((l: any) => l.kind === "paye").amountCents).toBe(199_920);
  });
  it("calculates none for an independent marshal, none when the association has not switched PAYE on, and says no PAYE is due below the threshold", async () => {
    ok(await c.updateSettings(U.A, { payeEnabled: true })); await adj({ kind: "bonus", label: "Festive", totalCents: 200000 }); let v = await slip(200000); expect(v.lines.some((l: any) => l.kind === "paye")).toBe(false); expect(v.note).toContain("no PAYE has been calculated");        // independent
    await db.query(`DELETE FROM payslip_lines`); await db.query(`DELETE FROM payslips`); ok(await p.updateProfile(U.M1, { class: "employee" })); ok(await c.updateSettings(U.A, { payeEnabled: false })); v = await slip(200000); expect(v.lines.some((l: any) => l.kind === "paye")).toBe(false);
    await db.query(`DELETE FROM payslip_lines`); await db.query(`DELETE FROM payslips`); ok(await c.updateSettings(U.A, { payeEnabled: true })); await db.query(`UPDATE pay_adjustments SET total_cents = 100000, remaining_cents = 100000`); v = await slip(100000);          // R1 000 a week is R52 000 a year
    expect(v.lines.some((l: any) => l.kind === "paye")).toBe(false); expect(v.note).toContain("No PAYE is due on this pay: it is below the tax threshold");
  });
  it("calculates no PAYE when no tax table covers the period, and says so rather than using the wrong year's", async () => {
    await employee(); await adj({ kind: "bonus", label: "Festive", totalCents: 200000 }); await db.query(`DELETE FROM tax_tables`); const v = await slip(200000);
    expect(v.lines.some((l: any) => l.kind === "paye")).toBe(false); expect(v.note).toContain("PAYE was not calculated: no tax table covers this period"); expect(v.lines.find((l: any) => l.kind === "uif").amountCents).toBe(2000);     // UIF still works, without a ceiling
  });
  it("never takes more PAYE than there is pay, and issuing keeps the PAYE line on the payslip", async () => {
    await employee(); await adj({ kind: "bonus", label: "Festive", totalCents: 200000 }); const a = ok(await p.draft(U.A, U.M1, START, END, U.boss)).value; ok(await p.issue(U.A, a.id, U.boss, "bank"));
    expect((await q(`SELECT kind, amount_cents FROM payslip_lines WHERE kind = 'paye'`))).toEqual([{ kind: "paye", amount_cents: 1371 }]); expect((await q(`SELECT net_cents FROM payslips`))[0].net_cents).toBe(196629);
  });
  it("validates and stores the PAYE switch and the alert email and phone, tidying the phone number", async () => {
    expect(await c.updateSettings(U.A, { payeEnabled: "yes" } as any)).toMatchObject({ ok: false, status: 400 }); expect(await c.updateSettings(U.A, { alertEmail: "not an email" })).toMatchObject({ ok: false, status: 400 }); expect(await c.updateSettings(U.A, { alertPhone: "0821234567" })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("country code") });
    expect(ok(await c.updateSettings(U.A, { payeEnabled: true, alertEmail: "ops@langa.example", alertPhone: "+27 82 123 4567" })).value).toMatchObject({ payeEnabled: true, alertEmail: "ops@langa.example", alertPhone: "+27821234567" });
    expect(ok(await c.updateSettings(U.A, { alertEmail: "", alertPhone: "" })).value).toMatchObject({ alertEmail: null, alertPhone: null });
  });
});

describe("automatic daily cash-out", () => {
  const EVENING = new Date("2026-11-02T15:30:00Z"), MORNING = new Date("2026-11-02T08:00:00Z");                  // 17:30 and 10:00 in South Africa
  async function earned() { await trips([["2026-10-26", 10]]); await payFees(5); }                           // R40 safely earned: up to R20 may be drawn at 50%
  const optIn = async (min = 1000) => { ok(await c.updateSettings(U.A, { cashoutEnabled: true, cashoutCapBp: 5000 })); ok(await p.setAutoCashOut(U.M1, { enabled: true, minCents: min })); };
  it("is chosen by the marshal, with a minimum of R10 to R10 000, and is off until then", async () => {
    expect(await p.autoCashOutStatus(U.M1)).toEqual({ enabled: false, minCents: 5000 }); expect(await p.setAutoCashOut(U.M1, { enabled: "yes" } as any)).toMatchObject({ ok: false, status: 400 }); for (const bad of [500, 1_000_001, 12.5, "lots"]) expect(await p.setAutoCashOut(U.M1, { enabled: true, minCents: bad } as any), String(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await p.setAutoCashOut(U.M1, { enabled: true, minCents: 2000 })).toEqual({ ok: true, value: { enabled: true, minCents: 2000 } }); expect(await p.setAutoCashOut(U.M1, { enabled: false })).toEqual({ ok: true, value: { enabled: false, minCents: 2000 } });
  });
  it("waits until 17:00 South African time, then pays what is safely available to opted-in marshals only", async () => {
    await earned(); await optIn(); expect(await p.runAutoCashOuts(MORNING)).toEqual({ paid: 0, skipped: 0, early: true }); expect((await q(`SELECT COUNT(*) AS n FROM payment_items WHERE kind = 'marshal_commission'`))[0].n).toBe(0);
    expect(await p.runAutoCashOuts(EVENING)).toEqual({ paid: 1, skipped: 0, early: false }); expect(await q(`SELECT payer_id, payee_id, amount_cents FROM payment_items WHERE kind = 'marshal_commission'`)).toEqual([{ payer_id: U.A, payee_id: U.M1, amount_cents: 2000 }]);
    expect((await q(`SELECT amount_cents FROM auto_cashouts`))[0].amount_cents).toBe(2000); expect((await q(`SELECT reference, remaining_cents FROM pay_adjustments`))[0]).toMatchObject({ reference: "ACC-0001", remaining_cents: 2000 });
  });
  it("pays a marshal at most once a day however often it runs, and again the next day only for what has newly become available", async () => {
    await earned(); await optIn(); await p.runAutoCashOuts(EVENING); expect(await p.runAutoCashOuts(EVENING)).toMatchObject({ paid: 0 }); expect(await p.runAutoCashOuts(new Date("2026-11-02T20:00:00Z"))).toMatchObject({ paid: 0 }); expect((await q(`SELECT COUNT(*) AS n FROM payment_items WHERE kind = 'marshal_commission'`))[0].n).toBe(1);
    await trips([["2026-10-27", 10]]); await db.query(`UPDATE payment_items SET status = 'paid' WHERE kind = 'trip_fee'`);                      // five more trips' fees now paid too
    expect(await p.runAutoCashOuts(new Date("2026-11-03T15:30:00Z"))).toMatchObject({ paid: 1 }); expect((await q(`SELECT amount_cents FROM payment_items WHERE kind = 'marshal_commission' ORDER BY created_at DESC`)).length).toBe(2);
  });
  it("skips a marshal whose available amount is under their minimum, who has not opted in, or whose association has not switched cash-out on", async () => {
    await earned(); await optIn(5000); expect(await p.runAutoCashOuts(EVENING)).toEqual({ paid: 0, skipped: 1, early: false });                                  // R20 available, R50 minimum
    ok(await p.setAutoCashOut(U.M1, { enabled: false })); expect(await p.runAutoCashOuts(EVENING)).toEqual({ paid: 0, skipped: 0, early: false });
    ok(await p.setAutoCashOut(U.M1, { enabled: true, minCents: 1000 })); ok(await c.updateSettings(U.A, { cashoutEnabled: false })); expect(await p.runAutoCashOuts(EVENING)).toEqual({ paid: 0, skipped: 1, early: false }); expect((await q(`SELECT COUNT(*) AS n FROM auto_cashouts`))[0].n).toBe(0);
  });
  it("comes back off the next payslip, like any cash-out", async () => {
    await earned(); await optIn(); await p.runAutoCashOuts(EVENING); const v = ok(await p.view(ok(await p.draft(U.A, U.M1, START, END, U.boss)).value.id, { associationId: U.A })).value as any;
    expect(v.lines.find((l: any) => l.reference === "ACC-0001")).toMatchObject({ kind: "advance", amountCents: 2000 }); expect(v.netCents).toBe(8000 - 2000);
  });
});

