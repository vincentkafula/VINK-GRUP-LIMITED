/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createDriverTargets, allocate, weekdayIndex, type DriverTargets } from "./driverTargets.js";

/**
 * Owner and driver money. Owner O1 has vehicles v1 (driver D1) and v2, and drivers D1 and D2; owner O2 has v3 and driver D3.
 * The clock is Wednesday 4 Nov 2026 (so Monday 2 Nov starts the week). A daily target of R200 runs Monday to Saturday.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2), D1: id(3), D2: id(4), D3: id(5) }, V = { v1: id(20), v2: id(21), v3: id(22) };
const NOW = new Date("2026-11-04T08:00:00Z"), TODAY = "2026-11-04", R = (rand: number) => Math.round(rand * 100);
let db: Db, t: DriverTargets;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  db = allPortalsDb(); t = createDriverTargets(db, () => NOW);
  for (const [i, nm, r] of [[U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.D1, "Dan Driver", "driver"], [U.D2, "Dee Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner'),($1,$3,'active','owner'),($4,$5,'active','owner')`, [U.O1, U.D1, U.D2, U.O2, U.D3]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats, driver_id) VALUES ($1,$2,'CA 111-111','Toyota',15,$3),($4,$2,'CA 222-222','Toyota',15,NULL),($5,$6,'CA 333-333','Toyota',15,$7)`, [V.v1, U.O1, U.D1, V.v2, V.v3, U.O2, U.D3]);
});
const target = (o: any = {}) => t.setTarget(U.O1, U.O1, { vehicleId: V.v1, period: "daily", amountCents: R(200), startDate: "2026-11-02", ...o });
const pay = (o: any = {}) => t.recordPayment(U.O1, U.O1, { vehicleId: V.v1, amountCents: R(100), paidOn: "2026-11-03", method: "cash", ...o });
const rec = async (on = TODAY, v = V.v1) => ok<any>(await t.reconcile(U.O1, v, on));
/** A payment as if it had been recorded on a later day (the service rightly refuses a date after today), to look at how later days reconcile. */
const payLater = async (cents: number, paidOn: string, vehicle = V.v1) => { await db.query(`INSERT INTO driver_payments (owner_id, vehicle_id, amount_cents, paid_on, method) VALUES ($1,$2,$3,$4,'cash')`, [U.O1, vehicle, cents, paidOn]); };

describe("splitting a payment into earmarks", () => {
  it("splits by basis points and always adds up to the exact amount, giving the leftover cents to the largest remainders", () => {
    expect(allocate(R(100), { ownerBp: 10000, associationBp: 0, financeBp: 0, maintenanceBp: 0 })).toEqual({ owner: 10000, association: 0, finance: 0, maintenance: 0 }); expect(allocate(R(100), { ownerBp: 7000, associationBp: 2000, financeBp: 1000, maintenanceBp: 0 })).toEqual({ owner: 7000, association: 2000, finance: 1000, maintenance: 0 });
    expect(allocate(100, { ownerBp: 3334, associationBp: 3333, financeBp: 3333, maintenanceBp: 0 })).toEqual({ owner: 34, association: 33, finance: 33, maintenance: 0 }); expect(allocate(1, { ownerBp: 2500, associationBp: 2500, financeBp: 2500, maintenanceBp: 2500 })).toEqual({ owner: 1, association: 0, finance: 0, maintenance: 0 });
    expect(allocate(0, { ownerBp: 5000, associationBp: 5000, financeBp: 0, maintenanceBp: 0 })).toEqual({ owner: 0, association: 0, finance: 0, maintenance: 0 }); expect(allocate(R(150), { ownerBp: 6000, associationBp: 0, financeBp: 0, maintenanceBp: 4000 })).toEqual({ owner: 9000, association: 0, finance: 0, maintenance: 6000 });
  });
  it("never loses or invents a cent, and never puts a cent in a bucket whose share is zero, for any amount and any split", () => {
    let seed = 7; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 4000; i++) { const cuts = [rnd(10001), rnd(10001), rnd(10001)].sort((a, b) => a - b), split = { ownerBp: cuts[0], associationBp: cuts[1] - cuts[0], financeBp: cuts[2] - cuts[1], maintenanceBp: 10000 - cuts[2] }, cents = rnd(2) ? rnd(50000) : rnd(10_000_001), a = allocate(cents, split);
      expect(a.owner + a.association + a.finance + a.maintenance, JSON.stringify([cents, split])).toBe(cents); for (const [k, bp] of [["owner", split.ownerBp], ["association", split.associationBp], ["finance", split.financeBp], ["maintenance", split.maintenanceBp]] as const) { expect(a[k]).toBeGreaterThanOrEqual(0); if (bp === 0) expect(a[k], `${k} ${JSON.stringify([cents, split])}`).toBe(0); expect(Math.abs(a[k] - (cents * bp) / 10000)).toBeLessThan(1); } }
  });
  it("numbers the days of the week from Monday", () => { expect(weekdayIndex("2026-11-02")).toBe(0); expect(weekdayIndex("2026-11-04")).toBe(2); expect(weekdayIndex("2026-11-07")).toBe(5); expect(weekdayIndex("2026-11-08")).toBe(6); });
});

describe("targets", () => {
  it("sets a daily or weekly target for one of the owner's vehicles, with the driver taken from the vehicle when none is named", async () => {
    ok(await target({ terms: "Pays before 20:00 each day" })); expect((await t.targets(U.O1))[0]).toMatchObject({ registration: "CA 111-111", period: "daily", amountCents: 20000, workingDays: 63, dueWeekday: 7, startDate: "2026-11-02", endDate: null, driverId: U.D1, terms: "Pays before 20:00 each day" });
    ok(await target({ vehicleId: V.v2, period: "weekly", amountCents: R(1400), driverId: U.D2, dueWeekday: 5 })); expect((await t.targets(U.O1)).find((x) => x.registration === "CA 222-222")).toMatchObject({ period: "weekly", dueWeekday: 5, driverId: U.D2 }); expect(await t.targets(U.O2)).toEqual([]);
  });
  it("refuses what is not valid: someone else's vehicle, a bad period or amount, no working days, a bad due day, a start too far ahead, someone else's driver or agreement", async () => {
    for (const [bad, st] of [[{ vehicleId: V.v3 }, 404], [{ vehicleId: "nope" }, 404], [{ period: "monthly" }, 400], [{ amountCents: 0 }, 400], [{ amountCents: 1.5 }, 400], [{ amountCents: 10_000_001 }, 400], [{ workingDays: 0 }, 400], [{ workingDays: 128 }, 400], [{ dueWeekday: 0 }, 400], [{ dueWeekday: 8 }, 400], [{ startDate: plus(32) }, 400], [{ startDate: "soon" }, 400], [{ terms: "x".repeat(1100) }, 400], [{ driverId: U.D3 }, 400], [{ agreementId: id(99) }, 400]] as const) expect(await target(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    ok(await target({ startDate: plus(31) }));
  });
  it("links a target to the owner's own agreement with the same driver, and refuses one with a different driver", async () => {
    await db.query(`INSERT INTO driver_agreements (id, owner_id, driver_id, mode, amount_cents, start_date, status) VALUES ($1,$2,$3,'cash_basis_weekly',120000,'2026-10-01','active'),($4,$2,$5,'cash_basis_weekly',120000,'2026-10-01','active'),($6,$7,$8,'cash_basis_weekly',120000,'2026-10-01','active')`, [id(50), U.O1, U.D1, id(51), U.D2, id(52), U.O2, U.D3]);
    expect(await target({ agreementId: id(51) })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("different driver") }); expect(await target({ agreementId: id(52) })).toMatchObject({ ok: false, status: 400 }); ok(await target({ agreementId: id(50) })); expect((await t.targets(U.O1))[0].agreementId).toBe(id(50));
  });
  it("closes the vehicle's current target the day before a new one starts, keeping the history, and refuses a start on or before the current one", async () => {
    ok(await target()); expect(await target({ startDate: "2026-11-02" })).toMatchObject({ ok: false, status: 409 }); expect(await target({ startDate: "2026-11-01" })).toMatchObject({ ok: false, status: 409 }); ok(await target({ period: "weekly", amountCents: R(1400), startDate: "2026-11-09" }));
    expect((await t.targets(U.O1, V.v1)).map((x) => [x.period, x.startDate, x.endDate])).toEqual([["weekly", "2026-11-09", null], ["daily", "2026-11-02", "2026-11-08"]]);
  });
  it("ends a target on a day after it started and not in the future, once, and only the owner's own", async () => {
    const a = ok<any>(await target()); for (const bad of ["2026-11-01", plus(1), "soon", undefined]) expect(await t.endTarget(U.O1, a.id, bad), String(bad)).toMatchObject({ ok: false, status: 400 }); expect(await t.endTarget(U.O2, a.id, TODAY)).toMatchObject({ ok: false, status: 404 }); ok(await t.endTarget(U.O1, a.id, "2026-11-03")); expect(await t.endTarget(U.O1, a.id, TODAY)).toMatchObject({ ok: false, status: 409 });
    expect((await t.targets(U.O1))[0].endDate).toBe("2026-11-03"); ok(await target({ startDate: "2026-11-05" }));
  });
});

describe("days off the road", () => {
  it("records a pause with a reason, refuses bad dates or someone else's vehicle, and cancels one that has not started, not one that has", async () => {
    for (const [bad, st] of [[{ vehicleId: V.v3 }, 404], [{ reason: "" }, 400], [{ fromDate: "soon" }, 400], [{ toDate: plus(-10) }, 400], [{ fromDate: plus(-500), toDate: plus(-499) }, 400], [{ toDate: plus(400) }, 400]] as const) expect(await t.addPause(U.O1, Object.assign({ vehicleId: V.v1, fromDate: plus(1), toDate: plus(3), reason: "Service" }, bad) as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    const future = ok<any>(await t.addPause(U.O1, { vehicleId: V.v1, fromDate: plus(1), toDate: plus(3), reason: "Service" })), now = ok<any>(await t.addPause(U.O1, { vehicleId: V.v1, fromDate: plus(-1), toDate: plus(1), reason: "Breakdown" }));
    expect(await t.cancelPause(U.O2, future.id)).toMatchObject({ ok: false, status: 404 }); expect(await t.cancelPause(U.O1, now.id)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already started") }); ok(await t.cancelPause(U.O1, future.id)); expect((await t.pauses(U.O1)).map((p) => p.reason)).toEqual(["Breakdown"]);
  });
});

describe("the split rule", () => {
  it("takes four shares that total 100%, from today on, replacing one set for the same day, and picks the latest rule that has started", async () => {
    for (const [bad, why] of [[{ ownerBp: 5000, associationBp: 5000, financeBp: 1, maintenanceBp: 0 }, /total 100.01%/], [{ ownerBp: 9000, associationBp: 0, financeBp: 0, maintenanceBp: 0 }, /total 90%/], [{ ownerBp: -1, associationBp: 10001, financeBp: 0, maintenanceBp: 0 }, /whole number/], [{ ownerBp: 5000.5, associationBp: 5000, financeBp: 0, maintenanceBp: 0 }, /whole number/], [{ ownerBp: "half", associationBp: 5000, financeBp: 0, maintenanceBp: 0 }, /whole number/]] as const) expect(await t.setSplit(U.O1, U.O1, V.v1, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    expect(await t.setSplit(U.O1, U.O1, V.v1, { ownerBp: 10000, associationBp: 0, financeBp: 0, maintenanceBp: 0, effectiveFrom: plus(-1) })).toMatchObject({ ok: false, status: 400 }); expect(await t.setSplit(U.O2, U.O2, V.v1, { ownerBp: 10000, associationBp: 0, financeBp: 0, maintenanceBp: 0 })).toMatchObject({ ok: false, status: 404 });
    ok(await t.setSplit(U.O1, U.O1, V.v1, { ownerBp: 7000, associationBp: 1500, financeBp: 1000, maintenanceBp: 500 })); ok(await t.setSplit(U.O1, U.O1, V.v1, { ownerBp: 6000, associationBp: 2000, financeBp: 1500, maintenanceBp: 500, effectiveFrom: plus(6) })); expect(await t.splitFor(V.v1, plus(-3))).toEqual({ ownerBp: 10000, associationBp: 0, financeBp: 0, maintenanceBp: 0 }); expect(await t.splitFor(V.v1, TODAY)).toMatchObject({ ownerBp: 7000 }); expect(await t.splitFor(V.v1, plus(5))).toMatchObject({ ownerBp: 7000 }); expect(await t.splitFor(V.v1, plus(6))).toMatchObject({ ownerBp: 6000 });
    ok(await t.setSplit(U.O1, U.O1, V.v1, { ownerBp: 5000, associationBp: 5000, financeBp: 0, maintenanceBp: 0 })); expect(await t.splitFor(V.v1, TODAY)).toMatchObject({ ownerBp: 5000, associationBp: 5000 }); expect((await q(`SELECT COUNT(*) AS n FROM vehicle_split_rules WHERE vehicle_id = $1`, [V.v1]))[0].n).toBe(2);
  });
});

describe("recording what the driver paid", () => {
  it("records a payment, earmarked by the split in force on the day it was paid, so a later rule never rewrites an earlier payment", async () => {
    const early = ok<any>(await pay({ amountCents: R(100), paidOn: "2026-11-03" })); expect(early.allocations).toEqual({ owner: 10000, association: 0, finance: 0, maintenance: 0 }); ok(await t.setSplit(U.O1, U.O1, V.v1, { ownerBp: 7000, associationBp: 2000, financeBp: 1000, maintenanceBp: 0 }));
    const late = ok<any>(await pay({ amountCents: R(100), paidOn: TODAY })); expect(late.allocations).toEqual({ owner: 7000, association: 2000, finance: 1000, maintenance: 0 }); const earlier = ok<any>(await pay({ amountCents: R(50), paidOn: "2026-11-02" })); expect(earlier.allocations).toEqual({ owner: 5000, association: 0, finance: 0, maintenance: 0 });
    const r = await rec(); expect(r.earmarks).toEqual({ owner: 22000, association: 2000, finance: 1000, maintenance: 0, totalCents: 25000 }); expect((await t.payments(U.O1)).find((p) => p.id === early.id)!.allocations.owner).toBe(10000);
  });
  it("validates the amount, the method, the date and the note, and refuses someone else's vehicle or driver", async () => {
    for (const [bad, st] of [[{ vehicleId: V.v3 }, 404], [{ amountCents: 0 }, 400], [{ amountCents: 2.5 }, 400], [{ amountCents: 10_000_001 }, 400], [{ method: "barter" }, 400], [{ paidOn: plus(1) }, 400], [{ paidOn: "soon" }, 400], [{ paidOn: plus(-401) }, 400], [{ note: "x".repeat(300) }, 400], [{ driverId: U.D3 }, 400], [{ clientRef: "x".repeat(80) }, 400]] as const) expect(await pay(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    ok(await pay({ paidOn: plus(-400), amountCents: 10_000_000 }));
  });
  it("is idempotent: a retry with the same client reference returns the first payment and records nothing more (the owner's own references only)", async () => {
    const a = ok<any>(await pay({ clientRef: "phone-1", amountCents: R(100) })), b = ok<any>(await pay({ clientRef: "phone-1", amountCents: R(100) })), c = ok<any>(await pay({ clientRef: "phone-1", amountCents: R(999), paidOn: "2026-11-02" })); expect([a.duplicate, b.duplicate, c.duplicate]).toEqual([false, true, true]); expect(b.id).toBe(a.id); expect(c.id).toBe(a.id);
    expect((await q(`SELECT COUNT(*) AS n FROM driver_payments`))[0].n).toBe(1); expect((await q(`SELECT COUNT(*) AS n FROM driver_payment_allocations`))[0].n).toBe(4); expect(b.allocations.owner).toBe(10000); const other = await t.recordPayment(U.O2, U.O2, { vehicleId: V.v3, amountCents: 5000, paidOn: "2026-11-03", method: "cash", clientRef: "phone-1" }); expect(ok<any>(other).duplicate).toBe(false);
  });
  it("names the driver from the target, else from the vehicle, else leaves it open, or takes the one the owner names", async () => {
    ok(await t.setTarget(U.O1, U.O1, { vehicleId: V.v2, period: "daily", amountCents: R(150), startDate: "2026-11-02", driverId: U.D2 })); const a = ok<any>(await t.recordPayment(U.O1, U.O1, { vehicleId: V.v2, amountCents: 100, paidOn: "2026-11-03", method: "cash" })), b = ok<any>(await t.recordPayment(U.O1, U.O1, { vehicleId: V.v2, amountCents: 100, paidOn: "2026-10-20", method: "cash" })), c = ok<any>(await pay()), d = ok<any>(await pay({ driverId: U.D2 }));
    const by = Object.fromEntries((await t.payments(U.O1)).map((p) => [p.id, p.driverId])); expect([by[a.id], by[b.id], by[c.id], by[d.id]]).toEqual([U.D2, null, U.D1, U.D2]);
  });
  it("voids a payment with a reason, once, keeping it on the record but out of the reconciliation, and lists history by vehicle, driver and date", async () => {
    ok(await target()); const a = ok<any>(await pay({ amountCents: R(100), paidOn: "2026-11-02" })), b = ok<any>(await pay({ amountCents: R(50), paidOn: "2026-11-03", driverId: U.D2 })); expect(await t.voidPayment(U.O1, a.id, "")).toMatchObject({ ok: false, status: 400 }); expect(await t.voidPayment(U.O2, a.id, "x")).toMatchObject({ ok: false, status: 404 });
    ok(await t.voidPayment(U.O1, a.id, "Entered twice")); expect(await t.voidPayment(U.O1, a.id, "again")).toMatchObject({ ok: false, status: 409 }); expect((await rec()).totals.receivedCents).toBe(5000); expect((await rec()).earmarks.totalCents).toBe(5000);
    const all = await t.payments(U.O1); expect(all.map((p) => [p.amountCents, p.voided, p.voidReason])).toEqual([[5000, false, null], [10000, true, "Entered twice"]]); expect((await t.payments(U.O1, { driverId: U.D2 })).map((p) => p.id)).toEqual([b.id]); expect((await t.payments(U.O1, { from: "2026-11-03" })).length).toBe(1); expect((await t.payments(U.O1, { vehicleId: V.v2 }))).toEqual([]); expect(await t.payments(U.O2)).toEqual([]);
  });
  it("records a waiver with a reason, validated, kept on the record", async () => {
    for (const [bad, st] of [[{ vehicleId: V.v3 }, 404], [{ amountCents: 0 }, 400], [{ waivedOn: plus(1) }, 400], [{ reason: "" }, 400]] as const) expect(await t.waive(U.O1, U.O1, Object.assign({ vehicleId: V.v1, amountCents: 5000, waivedOn: TODAY, reason: "Breakdown" }, bad) as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    ok(await t.waive(U.O1, U.O1, { vehicleId: V.v1, amountCents: 5000, waivedOn: TODAY, reason: "Funeral in the family" })); expect(await t.waivers(U.O1)).toEqual([expect.objectContaining({ amountCents: 5000, waivedOn: TODAY, reason: "Funeral in the family" })]); expect(await t.waivers(U.O2)).toEqual([]);
  });
});

describe("reconciling expected against received", () => {
  it("has nothing to reconcile without a target, and says so", async () => { const r = await rec(); expect(r).toMatchObject({ hasTarget: false, status: "none", totals: { expectedCents: 0, balanceCents: 0 }, weeks: [], flags: [] }); expect(await t.reconcile(U.O2, V.v1)).toMatchObject({ ok: false, status: 404 }); });
  it("accrues a daily target on the working days only, so Sunday adds nothing, and shows a shortfall as arrears (amber while under three days)", async () => {
    ok(await target()); ok(await pay({ amountCents: R(300), paidOn: "2026-11-03" })); let r = await rec(); expect(r.totals).toEqual({ expectedCents: 60000, receivedCents: 30000, waivedCents: 0, balanceCents: -30000, arrearsCents: 30000, surplusCents: 0 }); expect(r).toMatchObject({ status: "amber", dailyEquivalentCents: 20000, daysBehind: 1.5, lastPaymentOn: "2026-11-03", daysSinceLastPayment: 1 });
    expect(r.weeks).toEqual([{ weekStart: "2026-11-02", expectedCents: 60000, receivedCents: 30000, waivedCents: 0, balanceCents: -30000, shortfallCents: 30000, carriedForwardCents: 30000 }]); expect(r.flags).toEqual([{ id: `pay:arrears:${V.v1}`, severity: "low", message: "CA 111-111: R300.00 is owed by the driver (about 1.5 days of the target)", subject: "CA 111-111" }]);
    await payLater(R(900), "2026-11-06"); r = await rec("2026-11-08"); expect(r.totals).toMatchObject({ expectedCents: 120000, receivedCents: 120000, balanceCents: 0, arrearsCents: 0 }); expect(r.status).toBe("green"); expect(r.flags).toEqual([]);                  // Monday to Saturday is six days: Sunday adds nothing
  });
  it("carries arrears forward from week to week, and turns into a surplus when the driver pays ahead", async () => {
    ok(await target()); ok(await pay({ amountCents: R(1000), paidOn: "2026-11-03" })); await payLater(R(1500), "2026-11-10"); const r = await rec("2026-11-15");
    expect(r.weeks).toEqual([{ weekStart: "2026-11-02", expectedCents: 120000, receivedCents: 100000, waivedCents: 0, balanceCents: -20000, shortfallCents: 20000, carriedForwardCents: 20000 }, { weekStart: "2026-11-09", expectedCents: 120000, receivedCents: 150000, waivedCents: 0, balanceCents: 10000, shortfallCents: 0, carriedForwardCents: 0 }]);
    expect(r.totals).toMatchObject({ expectedCents: 240000, receivedCents: 250000, balanceCents: 10000, arrearsCents: 0, surplusCents: 10000 }); expect(r.status).toBe("green");
  });
  it("does not accrue the target on days the vehicle was off the road, and does again afterwards", async () => {
    ok(await target()); ok(await t.addPause(U.O1, { vehicleId: V.v1, fromDate: "2026-11-03", toDate: "2026-11-04", reason: "Gearbox repair" })); expect((await rec()).totals.expectedCents).toBe(20000); expect((await rec("2026-11-06")).totals.expectedCents).toBe(60000);
  });
  it("takes a weekly target on its due day, only once the day comes, and pro rata for days of the week not under the target or off the road", async () => {
    ok(await target({ vehicleId: V.v2, period: "weekly", amountCents: R(1400), startDate: "2026-11-02", driverId: U.D2 })); expect((await rec("2026-11-07", V.v2)).totals.expectedCents).toBe(0); expect((await rec("2026-11-08", V.v2)).totals.expectedCents).toBe(140000); expect((await rec("2026-11-15", V.v2)).totals.expectedCents).toBe(280000);
    await db.query(`DELETE FROM vehicle_targets`); ok(await target({ vehicleId: V.v2, period: "weekly", amountCents: R(1400), startDate: "2026-11-04", driverId: U.D2 })); expect((await rec("2026-11-08", V.v2)).totals.expectedCents).toBe(100000);                  // Wednesday to Sunday: 5 of 7 days
    ok(await t.addPause(U.O1, { vehicleId: V.v2, fromDate: "2026-11-06", toDate: "2026-11-06", reason: "Service" })); expect((await rec("2026-11-08", V.v2)).totals.expectedCents).toBe(80000);                  // and one of them off the road: 4 of 7
  });
  it("handles a change of target part-way: the daily target until the day before, then the weekly one", async () => {
    ok(await target()); ok(await target({ period: "weekly", amountCents: R(1400), startDate: "2026-11-09" })); const r = await rec("2026-11-15"); expect(r.totals.expectedCents).toBe(120000 + 140000); expect(r.targets.map((x: any) => x.period)).toEqual(["daily", "weekly"]); expect(r.target.period).toBe("weekly"); expect(r.dailyEquivalentCents).toBe(20000);
  });
  it("counts payments after a target has ended, ignores those from before it began, and a waiver reduces what is owed", async () => {
    const a = ok<any>(await target()); ok(await pay({ amountCents: R(500), paidOn: "2026-10-30" })); ok(await t.endTarget(U.O1, a.id, "2026-11-03")); ok(await pay({ amountCents: R(100), paidOn: TODAY })); let r = await rec(); expect(r.totals).toMatchObject({ expectedCents: 40000, receivedCents: 10000, balanceCents: -30000 }); expect(r.status).toBe("none"); expect(r.flags).toEqual([]);                  // no open target: nothing is chased
    await db.query(`DELETE FROM vehicle_targets`); ok(await target({ startDate: "2026-11-02" })); ok(await t.waive(U.O1, U.O1, { vehicleId: V.v1, amountCents: R(200), waivedOn: TODAY, reason: "Breakdown" })); r = await rec(); expect(r.totals).toMatchObject({ expectedCents: 60000, receivedCents: 10000, waivedCents: 20000, balanceCents: -30000 });
  });
  it("sets the traffic light and the flag at exactly three days (600) and seven days (1 400) of a R200 target, one cent either side", async () => {
    ok(await target()); const st = async (on: string, cents: number) => { await db.query(`DELETE FROM driver_payments`); await db.query(`DELETE FROM driver_payment_allocations`); if (cents) ok(await pay({ amountCents: cents, paidOn: "2026-11-02" })); const r = await rec(on); return [r.status, r.flags.find((f: any) => f.id === `pay:arrears:${V.v1}`)?.severity ?? null, r.totals.arrearsCents]; };
    expect(await st("2026-11-04", 1)).toEqual(["amber", "low", 59999]); expect(await st("2026-11-04", 0)).toEqual(["red", "medium", 60000]); expect(await st("2026-11-04", 60000)).toEqual(["green", null, 0]); expect(await st("2026-11-09", 1)).toEqual(["red", "medium", 139999]); expect(await st("2026-11-09", 0)).toEqual(["red", "high", 140000]);
  });
  it("flags a driver who has paid nothing for seven days while behind, and one who has paid nothing since the target started", async () => {
    ok(await target()); expect((await rec("2026-11-04")).flags.some((f: any) => f.id.startsWith("pay:none"))).toBe(false); expect((await rec("2026-11-05")).flags.find((f: any) => f.id === `pay:none:${V.v1}`)).toMatchObject({ severity: "medium", message: "CA 111-111: no payment has been recorded since the target started on 2026-11-02" });
    ok(await pay({ amountCents: 100, paidOn: "2026-11-02" })); expect((await rec("2026-11-08")).flags.some((f: any) => f.id.startsWith("pay:silent"))).toBe(false); expect((await rec("2026-11-09")).flags.find((f: any) => f.id === `pay:silent:${V.v1}`)).toMatchObject({ severity: "medium", message: "CA 111-111: nothing has been paid for 7 days" });
  });
});

describe("the fleet at a glance", () => {
  it("shows each vehicle's light, target and what is owed, totals for the fleet and what came in this week and month, with the flags in order, and none of another owner's", async () => {
    ok(await target()); ok(await pay({ amountCents: R(100), paidOn: "2026-11-03" })); ok(await target({ vehicleId: V.v2, period: "weekly", amountCents: R(1400), startDate: "2026-10-26", driverId: U.D2 })); ok(await t.recordPayment(U.O1, U.O1, { vehicleId: V.v2, amountCents: R(1400), paidOn: "2026-11-01", method: "eft" })); ok(await t.recordPayment(U.O2, U.O2, { vehicleId: V.v3, amountCents: 99999, paidOn: TODAY, method: "cash" }));
    const f = await t.fleet(U.O1, TODAY); expect(f.vehicles.map((v) => [v.registration, v.status, v.target?.period ?? null, v.arrearsCents, v.surplusCents])).toEqual([["CA 111-111", "amber", "daily", 50000, 0], ["CA 222-222", "green", "weekly", 0, 0]]);
    expect(f.measures).toMatchObject({ vehicles: 2, withTarget: 2, arrearsCents: 50000, surplusCents: 0, receivedThisWeekCents: 10000, receivedThisMonthCents: 150000, red: 0, amber: 1, green: 1 });
    expect(f.flags.map((x) => x.id)).toEqual([`pay:arrears:${V.v1}`]); expect((await t.fleet(U.O2, TODAY)).vehicles.map((v) => v.registration)).toEqual(["CA 333-333"]);
  });
  it("lists a vehicle with no target as having none, rather than as paying or not paying", async () => { const f = await t.fleet(U.O1, TODAY); expect(f.vehicles.map((v) => [v.status, v.hasTarget, v.target])).toEqual([["none", false, null], ["none", false, null]]); expect(f.measures).toMatchObject({ withTarget: 0, red: 0, amber: 0, green: 0, arrearsCents: 0 }); });
});
