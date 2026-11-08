/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createDriverTargets, type DriverTargets } from "./driverTargets.js";

/**
 * Money the PLATFORM collected from a driver, counted with what the owner recorded. Owner O1 has vehicles v1 (driver D1) and v2, and drivers D1 and D2; owner O2 has v3 and driver D3.
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

let n = 0; beforeEach(() => { n = 0; });
/** A payment item as the money engine writes it: by default a weekly cash payment from D1 to O1, settled in full on Tuesday 3 Nov. */
const item = (o: any = {}) => db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, ref, status, due_at, paid_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [o.kind ?? "weekly_cash_payment", o.payer ?? U.D1, o.payee ?? U.O1, o.amount ?? R(300), o.remaining ?? (o.status && o.status !== "paid" ? (o.amount ?? R(300)) : 0), `plat-${++n}`, o.status ?? "paid", o.due ?? "2026-11-03T08:00:00Z", o.paidAt === undefined ? (o.status && o.status !== "paid" ? null : "2026-11-03T10:00:00Z") : o.paidAt]);
const itemId = async (ref: string) => String((await q(`SELECT id FROM payment_items WHERE ref = $1`, [ref]))[0].id);

describe("counting what the platform collected", () => {
  it("counts a payment settled in full, on the day it was settled, with its split, and says where it came from", async () => {
    ok(await target()); await item(); const r = await rec(); expect(r.totals).toMatchObject({ expectedCents: R(600), receivedCents: R(300), arrearsCents: R(300), balanceCents: -R(300) }); expect(r.platform).toEqual({ countedCents: R(300), payments: [{ id: expect.any(String), ref: "plat-1", paidOn: "2026-11-03", amountCents: R(300) }], unmatched: [], partlyPaid: [] });
    expect(r.lastPaymentOn).toBe("2026-11-03"); expect(r.daysSinceLastPayment).toBe(1); expect(r.earmarks).toMatchObject({ owner: R(300), association: 0, finance: 0, maintenance: 0, totalCents: R(300) }); expect(r.status).toBe("amber"); expect(r.flags.some((f: any) => f.id.startsWith("pay:twice") || f.id.startsWith("pay:platform"))).toBe(false);
  });
  it("adds to what the owner recorded, never replaces it", async () => { ok(await target()); ok(await pay({ amountCents: R(100), paidOn: "2026-11-03" })); await item({ amount: R(300), paidAt: "2026-11-04T07:00:00Z" }); const r = await rec(); expect(r.totals.receivedCents).toBe(R(400)); expect(r.totals.arrearsCents).toBe(R(200)); expect(r.platform.countedCents).toBe(R(300)); expect(r.earmarks.totalCents).toBe(R(400)); });
  it("uses South African days: a payment at 00:30 on the 4th is the 4th, not the 3rd", async () => { ok(await target()); await item({ paidAt: "2026-11-03T22:30:00Z" }); const r = await rec(); expect(r.platform.payments[0].paidOn).toBe("2026-11-04"); expect(r.lastPaymentOn).toBe("2026-11-04"); expect(r.daysSinceLastPayment).toBe(0); });
  it("pays the split rule the owner set, in each bucket, to the cent", async () => {
    ok(await target()); ok(await t.setSplit(U.O1, U.O1, V.v1, { ownerBp: 7000, associationBp: 0, financeBp: 0, maintenanceBp: 3000, effectiveFrom: TODAY })); await item({ amount: R(1000), paidAt: "2026-11-04T09:00:00Z" }); const r = await rec(); expect(r.earmarks).toMatchObject({ owner: R(700), maintenance: R(300), totalCents: R(1000) });
  });
});

describe("what it does not count", () => {
  it("anything not settled in full, whatever its status", async () => {
    ok(await target()); for (const status of ["pending", "waiting", "failed", "waived", "needs_review", "cancelled"]) await item({ status, amount: R(111) }); await item({ amount: R(222), paidAt: null }); const r = await rec(); expect(r.totals.receivedCents).toBe(0); expect(r.platform).toMatchObject({ countedCents: 0, payments: [], unmatched: [], partlyPaid: [] }); expect(r.lastPaymentOn).toBeNull();
  });
  it("something that is not a weekly cash payment to this owner from this vehicle's driver", async () => {
    ok(await target()); for (const kind of ["monthly_salary", "per_trip_pay", "marshal_fee"]) await item({ kind, amount: R(111) }); await item({ payee: U.O2, amount: R(222) }); await item({ payer: U.D2, amount: R(333) }); await item({ payer: U.D3, payee: U.O2, amount: R(444) }); expect((await rec()).totals.receivedCents).toBe(0);
  });
  it("a payment from before the target began, or from a day no target covered it", async () => {
    ok(await target({ startDate: "2026-11-03" })); await item({ amount: R(111), paidAt: "2026-11-02T10:00:00Z" }); expect((await rec()).platform.payments).toEqual([]); await item({ amount: R(222), paidAt: "2026-11-03T10:00:00Z" }); expect((await rec()).platform.countedCents).toBe(R(222));
  });
  it("a payment after a target has ended, and another target for a different driver", async () => {
    const first = ok<any>(await target()); ok(await t.endTarget(U.O1, first.id, "2026-11-03")); await item({ amount: R(111), paidAt: "2026-11-04T07:00:00Z" }); expect((await rec()).platform.payments).toEqual([]); ok(await target({ startDate: "2026-11-04", driverId: U.D2 })); await item({ amount: R(222), paidAt: "2026-11-04T08:00:00Z" }); expect((await rec()).platform.payments).toEqual([]); await item({ payer: U.D2, amount: R(333), paidAt: "2026-11-04T09:00:00Z" }); expect((await rec()).platform.payments.map((p: any) => p.amountCents)).toEqual([R(333)]);
  });
});

describe("what it cannot be sure of", () => {
  it("shows a part-paid payment with what has been paid and what is still owed, and does not count it", async () => {
    ok(await target()); await item({ status: "arrears", amount: R(300), remaining: R(120), paidAt: null, due: "2026-11-03T08:00:00Z" }); const r = await rec(); expect(r.platform.partlyPaid).toEqual([{ ref: "plat-1", dueOn: "2026-11-03", paidCents: R(180), owedCents: R(120) }]); expect(r.totals.receivedCents).toBe(0);
  });
  it("does not guess when two of the owner's vehicles could be meant: it counts nothing, says so, and flags both", async () => {
    ok(await target({ driverId: U.D1 })); ok(await target({ vehicleId: V.v2, driverId: U.D1 })); await item({ amount: R(300) });
    for (const [veh, reg] of [[V.v1, "CA 111-111"], [V.v2, "CA 222-222"]] as const) { const r = await rec(TODAY, veh), f = r.flags.find((x: any) => x.id === `pay:platform-unmatched:${veh}`); expect(r.totals.receivedCents, reg).toBe(0); expect(r.platform.unmatched).toEqual([{ ref: "plat-1", paidOn: "2026-11-03", amountCents: R(300) }]); expect(f).toMatchObject({ severity: "medium", subject: reg }); expect(f.message.startsWith(`${reg}: R`)).toBe(true); expect(f.message.endsWith("collected by the platform could not be matched to one vehicle, so it is not counted here")).toBe(true); }
  });
  it("a target with no driver named is pinned to the vehicle's driver when it was set, and a payment from anyone else is not matched until a target names them", async () => {
    ok(await target()); await item({ amount: R(100), paidAt: "2026-11-03T10:00:00Z" }); expect((await rec()).platform.countedCents).toBe(R(100));                  // v1's driver was D1 when the target was set
    await db.query(`UPDATE vehicles SET driver_id = $1 WHERE id = $2`, [U.D2, V.v1]); expect((await rec()).platform.countedCents).toBe(R(100));                  // still D1's target
    await item({ payer: U.D2, amount: R(50), paidAt: "2026-11-04T07:00:00Z" }); expect((await rec()).platform.countedCents).toBe(R(100));                  // D2 has no target yet: not counted
    ok(await target({ startDate: "2026-11-04", driverId: U.D2 })); expect((await rec()).platform.countedCents).toBe(R(150));
  });
});

describe("a payment written down twice", () => {
  const find = (r: any) => r.flags.find((f: any) => f.id.startsWith("pay:twice:"));
  it("warns when the owner also wrote down the same amount within a day, counts both, and tells the owner what to do", async () => {
    ok(await target()); ok(await pay({ amountCents: R(300), paidOn: "2026-11-02" })); await item({ amount: R(300), paidAt: "2026-11-03T10:00:00Z" }); const r = await rec(); expect(find(r)).toMatchObject({ severity: "medium", subject: "CA 111-111" }); expect(find(r).message).toContain("If it is the same payment, cancel yours so it is not counted twice"); expect(r.totals.receivedCents).toBe(R(600)); expect(find(r).id).toBe(`pay:twice:${await itemId("plat-1")}`);
  });
  it("says nothing when the amount differs or the dates are two or more days apart", async () => {
    ok(await target()); ok(await pay({ amountCents: R(299), paidOn: "2026-11-03" })); ok(await pay({ amountCents: R(300), paidOn: "2026-11-01", clientRef: "far" })); await item({ amount: R(300), paidAt: "2026-11-03T10:00:00Z" }); expect(find(await rec())).toBeUndefined();
  });
  it("is ignored once the owner has cancelled their own entry", async () => { ok(await target()); const p = ok<any>(await pay({ amountCents: R(300), paidOn: "2026-11-03" })); await item({ amount: R(300) }); expect(find(await rec())).toBeDefined(); ok(await t.voidPayment(U.O1, p.id, "Same payment")); const r = await rec(); expect(find(r)).toBeUndefined(); expect(r.totals.receivedCents).toBe(R(300)); });
  it("reaches the fleet view, where the owner already looks for what needs doing", async () => { ok(await target()); ok(await pay({ amountCents: R(300), paidOn: "2026-11-03" })); await item({ amount: R(300) }); const f = (await t.fleet(U.O1)) as any; expect(f.flags.some((x: any) => x.id.startsWith("pay:twice:"))).toBe(true); });
});

describe("each owner on their own", () => {
  it("never counts another owner's collections, and counts their own", async () => {
    ok(await t.setTarget(U.O2, U.O2, { vehicleId: V.v3, period: "daily", amountCents: R(100), startDate: "2026-11-02" })); await item({ payer: U.D3, payee: U.O2, amount: R(150) }); await item({ amount: R(999) }); const r3 = ok<any>(await t.reconcile(U.O2, V.v3, TODAY)); expect(r3.platform.countedCents).toBe(R(150)); expect(r3.totals.receivedCents).toBe(R(150)); expect(JSON.stringify(r3)).not.toContain("plat-2");
    ok(await target()); expect((await rec()).platform.countedCents).toBe(R(999));
  });
});
