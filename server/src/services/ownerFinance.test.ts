/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createOwnerFinance, dueDateIn, nextDue, lastDue, periodRange, CATEGORIES, MAX_COST_CENTS, type OwnerFinance } from "./ownerFinance.js";

/**
 * The owner's finances. Owner O1 has vehicles v1 and v2 and an active driver D1; owner O2 has v3.
 * The clock is Wednesday 18 Nov 2026.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(3), O2: id(4), D1: id(6), D9: id(8) }, V = { v1: id(20), v2: id(21), v3: id(22) };
const NOW = new Date("2026-11-18T08:00:00Z"), TODAY = "2026-11-18";
const R = (rand: number) => Math.round(rand * 100);
let db: Db, f: OwnerFinance;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (d: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  db = allPortalsDb(); f = createOwnerFinance(db, () => NOW);
  for (const [i, nm, r] of [[U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.D1, "Dan Driver", "driver"], [U.D9, "Dee Driver", "driver"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.O1, U.D1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CA 333-333','Toyota',15)`, [V.v1, U.O1, V.v2, V.v3, U.O2]);
});
const cost = (o: any = {}, owner = U.O1) => f.addCost(owner, { vehicleId: V.v1, category: "fuel", amountCents: R(600), incurredOn: "2026-11-10", payee: "Engen", ...o });
const income = (vehicle: string, rand: number, on: string, voided = false, owner = U.O1) => db.query(`INSERT INTO driver_payments (owner_id, vehicle_id, amount_cents, paid_on, method, voided_at) VALUES ($1,$2,$3,$4,'cash',$5)`, [owner, vehicle, R(rand), on, voided ? NOW.toISOString() : null]);
const fin = (o: any = {}) => f.addFinance(U.O1, { vehicleId: V.v1, lender: "WesBank", reference: "AGR-77", originalCents: R(450000), balanceCents: R(300000), balanceOn: "2026-10-31", instalmentCents: R(9000), dueDay: 20, startDate: "2024-01-20", finalDueOn: "2029-01-20", ...o });

describe("instalment dates", () => {
  it("puts a due day in a month, clamped to the month's length, including a leap February", () => {
    expect([dueDateIn(2026, 2, 31), dueDateIn(2028, 2, 31), dueDateIn(2028, 2, 29), dueDateIn(2026, 4, 31), dueDateIn(2026, 1, 31), dueDateIn(2026, 11, 20)]).toEqual(["2026-02-28", "2028-02-29", "2028-02-29", "2026-04-30", "2026-01-31", "2026-11-20"]);
  });
  it("finds the next due date on or after a day, and the last on or before it, across months and years", () => {
    expect([nextDue("2026-11-18", 20), nextDue("2026-11-20", 20), nextDue("2026-11-21", 20), nextDue("2026-12-21", 5), nextDue("2026-01-30", 31), nextDue("2026-02-01", 31)]).toEqual(["2026-11-20", "2026-11-20", "2026-12-20", "2027-01-05", "2026-01-31", "2026-02-28"]);
    expect([lastDue("2026-11-18", 20), lastDue("2026-11-20", 20), lastDue("2026-11-21", 20), lastDue("2026-01-10", 20), lastDue("2026-03-15", 31), lastDue("2026-03-30", 31)]).toEqual(["2026-10-20", "2026-11-20", "2026-11-20", "2025-12-20", "2026-02-28", "2026-02-28"]);
  });
});

describe("reporting periods", () => {
  it("is the calendar month, quarter or year, with February's real length", () => {
    expect(periodRange("month", "2026-11-18")).toEqual({ from: "2026-11-01", to: "2026-11-30", label: "November 2026" }); expect(periodRange("month", "2028-02-10")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" }); expect(periodRange("quarter", "2026-11-18")).toEqual({ from: "2026-10-01", to: "2026-12-31", label: "Quarter 4 2026" }); expect(periodRange("quarter", "2026-03-31")).toMatchObject({ from: "2026-01-01", to: "2026-03-31", label: "Quarter 1 2026" }); expect(periodRange("year", "2026-11-18")).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
  });
  it("is the tax year, 1 March to the end of February, whichever side of March a day falls", () => {
    expect(periodRange("tax_year", "2026-11-18")).toEqual({ from: "2026-03-01", to: "2027-02-28", label: "Tax year 2026/2027 (1 March to end of February)" }); expect(periodRange("tax_year", "2027-02-10")).toMatchObject({ from: "2026-03-01", to: "2027-02-28" }); expect(periodRange("tax_year", "2027-03-01")).toMatchObject({ from: "2027-03-01", to: "2028-02-29" }); expect(periodRange("tax_year", "2028-02-29")).toMatchObject({ from: "2027-03-01", to: "2028-02-29" });
  });
  it("takes any two dates up to three years apart, and refuses anything else", () => {
    expect(periodRange("custom", TODAY, "2026-01-01", "2026-06-30")).toEqual({ from: "2026-01-01", to: "2026-06-30", label: "2026-01-01 to 2026-06-30" }); expect(periodRange("custom", TODAY, "2023-11-18", "2026-11-17")).not.toBeNull(); for (const [a, b] of [["2026-06-30", "2026-01-01"], ["2020-01-01", "2026-01-01"], ["soon", "2026-01-01"], [undefined, "2026-01-01"]] as const) expect(periodRange("custom", TODAY, a as any, b as any), String(a)).toBeNull();
  });
});

describe("running costs and fines", () => {
  it("records a cost for a vehicle or for the whole business, validated", async () => {
    ok(await cost()); ok(await cost({ vehicleId: undefined, category: "association", amountCents: R(100), payee: "Langa TA" })); expect((await f.costs(U.O1)).map((c) => [c.category, c.vehicle, c.amountCents, c.payee])).toEqual([["fuel", "CA 111-111", 60000, "Engen"], ["association", null, 10000, "Langa TA"]]);
    for (const [bad, st] of [[{ category: "holiday" }, 400], [{ amountCents: 0 }, 400], [{ amountCents: 1.5 }, 400], [{ amountCents: MAX_COST_CENTS + 1 }, 400], [{ incurredOn: plus(1) }, 400], [{ incurredOn: plus(-1101) }, 400], [{ incurredOn: "soon" }, 400], [{ vehicleId: V.v3 }, 404], [{ payee: "x".repeat(130) }, 400], [{ reference: "x".repeat(70) }, 400], [{ note: "x".repeat(210) }, 400], [{ driverId: U.D1 }, 400], [{ fineStatus: "paid" }, 400]] as const) expect(await cost(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st }); for (const c of CATEGORIES) ok(await cost({ category: c, amountCents: 100, clientRef: `c-${c}` })); ok(await cost({ amountCents: MAX_COST_CENTS, incurredOn: plus(-1100) }));
  });
  it("records a fine against a driver of the owner's, starting unpaid, with a status that must be known", async () => {
    ok(await cost({ category: "fine", amountCents: R(200), driverId: U.D1, reference: "NOTICE-9", payee: "City of Cape Town" })); expect((await f.costs(U.O1))[0]).toMatchObject({ category: "fine", fineStatus: "unpaid", driver: "Dan Driver", reference: "NOTICE-9" }); expect(await cost({ category: "fine", driverId: U.D9, clientRef: "x1" })).toMatchObject({ ok: false, status: 400, error: "Choose one of your drivers" }); expect(await cost({ category: "fine", fineStatus: "lost", clientRef: "x2" })).toMatchObject({ ok: false, status: 400 }); ok(await cost({ category: "fine", fineStatus: "paid", clientRef: "x3" }));
  });
  it("is safe to retry: the same client reference returns the first and records nothing more, per owner", async () => {
    const a = ok<any>(await cost({ clientRef: "ph-1" })), b = ok<any>(await cost({ clientRef: "ph-1", amountCents: R(999) })); expect([a.duplicate, b.duplicate, b.id]).toEqual([false, true, a.id]); expect((await q(`SELECT COUNT(*) AS n FROM vehicle_costs`))[0].n).toBe(1); expect(ok<any>(await cost({ clientRef: "ph-1", vehicleId: V.v3 }, U.O2)).duplicate).toBe(false);
  });
  it("voids a cost with a reason, once, and it stops counting but stays on the record", async () => {
    const c = ok<any>(await cost()); expect(await f.voidCost(U.O1, c.id, "")).toMatchObject({ ok: false, status: 400 }); expect(await f.voidCost(U.O2, c.id, "x")).toMatchObject({ ok: false, status: 404 }); expect(await f.voidCost(U.O1, "nope", "x")).toMatchObject({ ok: false, status: 404 }); ok(await f.voidCost(U.O1, c.id, "Entered twice")); expect(await f.voidCost(U.O1, c.id, "again")).toMatchObject({ ok: false, status: 409 });
    expect(await f.costs(U.O1)).toEqual([]); expect((await f.costs(U.O1, { includeVoided: true }))[0]).toMatchObject({ voided: true, voidReason: "Entered twice" });
  });
  it("lists by vehicle, category and dates, only the owner's own, newest first", async () => {
    ok(await cost({ incurredOn: "2026-11-01" })); ok(await cost({ vehicleId: V.v2, category: "insurance", incurredOn: "2026-11-05" })); ok(await cost({ category: "tracker", incurredOn: "2026-10-05" })); ok(await cost({ vehicleId: V.v3, incurredOn: "2026-11-02" }, U.O2));
    expect((await f.costs(U.O1)).map((c) => c.incurredOn)).toEqual(["2026-11-05", "2026-11-01", "2026-10-05"]); expect((await f.costs(U.O1, { vehicleId: V.v1 })).length).toBe(2); expect((await f.costs(U.O1, { category: "insurance" })).length).toBe(1); expect((await f.costs(U.O1, { from: "2026-11-01", to: "2026-11-04" })).map((c) => c.incurredOn)).toEqual(["2026-11-01"]); expect((await f.costs(U.O2)).length).toBe(1);
  });
  it("marks a fine paid or disputed, only a fine, only the owner's, not once voided", async () => {
    const fine = ok<any>(await cost({ category: "fine" })), fuel = ok<any>(await cost({ clientRef: "fuel" })); expect(await f.setFineStatus(U.O1, fine.id, "lost")).toMatchObject({ ok: false, status: 400 }); expect(await f.setFineStatus(U.O2, fine.id, "paid")).toMatchObject({ ok: false, status: 404 }); expect(await f.setFineStatus(U.O1, fuel.id, "paid")).toMatchObject({ ok: false, status: 404 }); ok(await f.setFineStatus(U.O1, fine.id, "disputed")); expect((await f.costs(U.O1, { category: "fine" }))[0].fineStatus).toBe("disputed");
    ok(await f.voidCost(U.O1, fine.id, "mistake")); expect(await f.setFineStatus(U.O1, fine.id, "paid")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("vehicle finance", () => {
  it("records an agreement on one of the owner's vehicles, validated, one active per vehicle", async () => {
    ok(await fin()); for (const [bad, st] of [[{ vehicleId: V.v3 }, 404], [{ lender: "" }, 400], [{ originalCents: 0 }, 400], [{ balanceCents: -1 }, 400], [{ balanceCents: 1.5 }, 400], [{ instalmentCents: 0 }, 400], [{ dueDay: 0 }, 400], [{ dueDay: 32 }, 400], [{ dueDay: 15.5 }, 400], [{ startDate: plus(32) }, 400], [{ balanceOn: plus(1) }, 400], [{ finalDueOn: "2020-01-01" }, 400], [{ reference: "x".repeat(70) }, 400], [{ vehicleId: V.v1 }, 409]] as const) expect(await fin(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    ok(await fin({ vehicleId: V.v2, balanceCents: 0 })); expect((await f.finances(U.O1, TODAY)).finances.map((x) => x.registration)).toEqual(["CA 111-111", "CA 222-222"]);
  });
  it("shows what is owed as the lender last said, the next instalment, what has been paid, and a rough count of instalments left", async () => {
    ok(await fin()); const a = ok<any>(await f.recordInstalment(U.O1, (await f.finances(U.O1)).finances[0].id, { amountCents: R(9000), paidOn: "2026-10-20" })); const v = ok<any>(await f.recordInstalment(U.O1, (await f.finances(U.O1)).finances[0].id, { amountCents: R(100), paidOn: "2026-09-20" })); ok(await f.voidInstalment(U.O1, v.id, "Wrong amount"));
    const r = (await f.finances(U.O1, TODAY)); expect(r.finances[0]).toMatchObject({ lender: "WesBank", registration: "CA 111-111", balanceCents: 30000000, balanceOn: "2026-10-31", instalmentCents: 900000, dueDay: 20, nextDueOn: "2026-11-20", lastPaidOn: "2026-10-20", paidCents: 900000, instalmentsLeft: 34, status: "active", missingInstalment: false }); expect(r.finances[0].payments.map((p: any) => [p.amountCents, p.voided])).toEqual([[900000, false], [10000, true]]); expect(r.measures).toEqual({ activeAgreements: 1, owedCents: 30000000, monthlyInstalmentsCents: 900000 }); expect(a.duplicate).toBe(false);
  });
  it("moves the balance only when the lender says so, never earlier than the last one, never in the future, and not once settled", async () => {
    const fid = ok<any>(await fin()).id; for (const [bad, st] of [[{ balanceCents: -5, balanceOn: TODAY }, 400], [{ balanceCents: 100, balanceOn: "2026-10-30" }, 400], [{ balanceCents: 100, balanceOn: plus(1) }, 400], [{ balanceCents: 100, balanceOn: "soon" }, 400]] as const) expect(await f.updateBalance(U.O1, fid, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st }); expect(await f.updateBalance(U.O2, fid, { balanceCents: 1, balanceOn: TODAY })).toMatchObject({ ok: false, status: 404 });
    ok(await f.updateBalance(U.O1, fid, { balanceCents: R(285000), balanceOn: "2026-11-15" })); expect((await f.finances(U.O1, TODAY)).finances[0]).toMatchObject({ balanceCents: 28500000, balanceOn: "2026-11-15" }); ok(await f.settle(U.O1, fid, TODAY)); expect(await f.updateBalance(U.O1, fid, { balanceCents: 1, balanceOn: TODAY })).toMatchObject({ ok: false, status: 409 });
  });
  it("settles an agreement once, zeroing what is owed, and then another can be started on the vehicle", async () => {
    const fid = ok<any>(await fin()).id; for (const bad of ["2020-01-01", plus(1), "soon", undefined]) expect(await f.settle(U.O1, fid, bad), String(bad)).toMatchObject({ ok: false, status: 400 }); expect(await f.settle(U.O2, fid, TODAY)).toMatchObject({ ok: false, status: 404 }); ok(await f.settle(U.O1, fid, "2026-11-10")); expect(await f.settle(U.O1, fid, TODAY)).toMatchObject({ ok: false, status: 409 });
    expect((await f.finances(U.O1, TODAY)).finances[0]).toMatchObject({ status: "settled", settledOn: "2026-11-10", balanceCents: 0, nextDueOn: null, instalmentsLeft: 0, missingInstalment: false }); expect((await f.finances(U.O1, TODAY)).measures).toMatchObject({ activeAgreements: 0, owedCents: 0 }); ok(await fin({ lender: "Absa", startDate: "2026-11-11" }));
  });
  it("records an instalment after the agreement began and not in the future, retries safely, and voids with a reason", async () => {
    const fid = ok<any>(await fin()).id; for (const [bad, st] of [[{ amountCents: 0 }, 400], [{ paidOn: "2023-12-31" }, 400], [{ paidOn: plus(1) }, 400], [{ paidOn: "soon" }, 400], [{ clientRef: "x".repeat(80) }, 400]] as const) expect(await f.recordInstalment(U.O1, fid, Object.assign({ amountCents: 100, paidOn: "2026-10-20" }, bad) as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st }); expect(await f.recordInstalment(U.O2, fid, { amountCents: 1, paidOn: "2026-10-20" })).toMatchObject({ ok: false, status: 404 });
    const a = ok<any>(await f.recordInstalment(U.O1, fid, { amountCents: 100, paidOn: "2026-10-20", clientRef: "i-1" })), b = ok<any>(await f.recordInstalment(U.O1, fid, { amountCents: 999, paidOn: "2026-10-21", clientRef: "i-1" })); expect([a.duplicate, b.duplicate, b.id]).toEqual([false, true, a.id]); expect(await f.voidInstalment(U.O1, a.id, "")).toMatchObject({ ok: false, status: 400 }); expect(await f.voidInstalment(U.O2, a.id, "x")).toMatchObject({ ok: false, status: 404 }); ok(await f.voidInstalment(U.O1, a.id, "Wrong")); expect(await f.voidInstalment(U.O1, a.id, "again")).toMatchObject({ ok: false, status: 409 });
  });
  it("flags an instalment that fell due and is not recorded, after five days' grace, looking back fifteen days for a payment", async () => {
    const fid = ok<any>(await fin()).id, missing = async (on: string) => (await f.finances(U.O1, on)).flags.some((x) => x.id === `fin:missing:${fid}`);
    expect(await missing("2026-10-24")).toBe(false); expect(await missing("2026-10-25")).toBe(true); expect(await missing(TODAY)).toBe(true); expect((await f.finances(U.O1, TODAY)).flags.find((x) => x.id === `fin:missing:${fid}`)).toMatchObject({ severity: "medium", message: "CA 111-111: the R9000.00 instalment to WesBank that fell due on 2026-10-20 has not been recorded" });
    ok(await f.recordInstalment(U.O1, fid, { amountCents: R(9000), paidOn: "2026-10-04" })); expect(await missing(TODAY)).toBe(true); ok(await f.recordInstalment(U.O1, fid, { amountCents: R(9000), paidOn: "2026-10-05" })); expect(await missing(TODAY)).toBe(false);
  });
  it("does not flag an agreement that had not begun when the last instalment fell due, or one that is settled, but flags one past its last due date still owing", async () => {
    const fid = ok<any>(await fin({ startDate: "2026-10-21" })).id; expect((await f.finances(U.O1, TODAY)).flags.some((x) => x.id.startsWith("fin:missing"))).toBe(false); ok(await f.settle(U.O1, fid, "2026-11-01")); ok(await fin({ vehicleId: V.v2, startDate: "2024-01-20", finalDueOn: "2026-06-20", balanceCents: R(5000) })); const fl = (await f.finances(U.O1, TODAY)).flags; expect(fl.find((x) => x.id.startsWith("fin:pastfinal"))).toMatchObject({ severity: "low", message: "CA 222-222: the finance with WesBank was due to end on 2026-06-20 but still shows R5000.00 owed" });
  });
});

describe("maintenance", () => {
  const m = (o: any = {}) => f.addMaintenance(U.O1, { vehicleId: V.v1, kind: "service", servicedOn: "2026-10-01", odometerKm: 100000, nextDueOn: "2027-04-01", nextDueKm: 115000, description: "Full service", ...o });
  it("records a service, and with a cost makes a running cost for the vehicle (tyres count as tyres), so the money is counted once", async () => {
    const a = ok<any>(await m({ costCents: R(2500), payee: "Toyota Langa" })), t = ok<any>(await m({ kind: "tyres", servicedOn: "2026-10-02", costCents: R(4000), nextDueOn: undefined, nextDueKm: undefined })), n = ok<any>(await m({ servicedOn: "2026-10-03", costCents: 0, odometerKm: 100050 }));
    expect([a.costId !== null, t.costId !== null, n.costId]).toEqual([true, true, null]); expect((await f.costs(U.O1)).map((c) => [c.category, c.amountCents, c.payee, c.fromMaintenance, c.incurredOn]).sort()).toEqual([["maintenance", 250000, "Toyota Langa", true, "2026-10-01"], ["tyres", 400000, null, true, "2026-10-02"]]); expect((await f.maintenance(U.O1))[0]).toMatchObject({ vehicle: "CA 111-111", costCents: 0 });
  });
  it("refuses what is not valid: a vehicle that is not the owner's, an unknown kind, dates, kilometres, a next service that is not later, a cost that is too big, or a reading with no odometer or a cost", async () => {
    for (const [bad, st] of [[{ vehicleId: V.v3 }, 404], [{ kind: "wash" }, 400], [{ servicedOn: plus(1) }, 400], [{ servicedOn: plus(-1101) }, 400], [{ odometerKm: -1 }, 400], [{ odometerKm: 1.5 }, 400], [{ odometerKm: 4_000_000 }, 400], [{ nextDueKm: 100000 }, 400], [{ nextDueKm: 99999 }, 400], [{ nextDueOn: "2026-10-01" }, 400], [{ nextDueOn: "soon" }, 400], [{ costCents: -5 }, 400], [{ costCents: MAX_COST_CENTS + 1 }, 400], [{ description: "x".repeat(210) }, 400], [{ kind: "reading", odometerKm: undefined, nextDueOn: undefined, nextDueKm: undefined }, 400], [{ kind: "reading", costCents: 100, nextDueOn: undefined, nextDueKm: undefined }, 400]] as const) expect(await m(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    expect((await q(`SELECT COUNT(*) AS n FROM maintenance_log`))[0].n).toBe(0); expect((await q(`SELECT COUNT(*) AS n FROM vehicle_costs`))[0].n).toBe(0);
  });
  it("voids an entry together with the cost it made, once, only the owner's", async () => {
    const a = ok<any>(await m({ costCents: R(2500) })); expect(await f.voidMaintenance(U.O1, a.id, "")).toMatchObject({ ok: false, status: 400 }); expect(await f.voidMaintenance(U.O2, a.id, "x")).toMatchObject({ ok: false, status: 404 }); expect(await f.voidCost(U.O1, a.costId, "x")).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("void the entry instead") }); ok(await f.voidMaintenance(U.O1, a.id, "Wrong vehicle")); expect(await f.voidMaintenance(U.O1, a.id, "again")).toMatchObject({ ok: false, status: 409 });
    expect(await f.maintenance(U.O1)).toEqual([]); expect(await f.costs(U.O1)).toEqual([]); expect((await f.costs(U.O1, { includeVoided: true }))[0]).toMatchObject({ voided: true, voidReason: "Wrong vehicle" });
  });
  it("reports where each vehicle is: none recorded, fine, due soon, overdue, or no next service set", async () => {
    const st = async (on = TODAY) => Object.fromEntries((await f.maintenanceStatus(U.O1, on)).vehicles.map((v) => [v.registration, v.status])); expect(await st()).toEqual({ "CA 111-111": "none", "CA 222-222": "none" });
    ok(await m({ servicedOn: "2026-11-01", nextDueOn: "2027-04-01", nextDueKm: 115000, odometerKm: 100000 })); ok(await m({ vehicleId: V.v2, servicedOn: "2026-11-01", nextDueOn: undefined, nextDueKm: undefined })); expect(await st()).toEqual({ "CA 111-111": "ok", "CA 222-222": "no_next" }); const v = (await f.maintenanceStatus(U.O1, TODAY)).vehicles[0]; expect(v).toMatchObject({ lastServiceOn: "2026-11-01", odometerKm: 100000, nextDueOn: "2027-04-01", nextDueKm: 115000, daysLeft: 134, kmLeft: 15000 });
  });
  it("is due soon from 30 days or 1 000 km before, and overdue from the day after or at the kilometres, with the right reason", async () => {
    ok(await m({ servicedOn: "2026-11-01", nextDueOn: "2026-12-18", nextDueKm: 115000, odometerKm: 100000 })); const one = async (on: string) => (await f.maintenanceStatus(U.O1, on)).vehicles[0].status;
    expect(await one("2026-11-17")).toBe("ok"); expect(await one("2026-11-18")).toBe("due_soon"); expect(await one("2026-12-18")).toBe("due_soon"); expect(await one("2026-12-19")).toBe("overdue");
    const km = async (odo: number) => { await db.query(`DELETE FROM maintenance_log`); ok(await m({ servicedOn: "2026-11-01", nextDueOn: "2027-06-01", nextDueKm: 115000, odometerKm: 100000 })); ok(await f.addMaintenance(U.O1, { vehicleId: V.v1, kind: "reading", servicedOn: "2026-11-10", odometerKm: odo })); return (await f.maintenanceStatus(U.O1, TODAY)).vehicles[0]; };
    expect((await km(113999)).status).toBe("ok"); expect(await km(114000)).toMatchObject({ status: "due_soon", kmLeft: 1000 }); expect(await km(114999)).toMatchObject({ status: "due_soon", kmLeft: 1 }); expect(await km(115000)).toMatchObject({ status: "overdue", kmLeft: 0 }); expect(await km(116000)).toMatchObject({ status: "overdue", kmLeft: -1000 });
  });
  it("takes the highest odometer reading, and the latest service that is not a reading, and says why in the flag", async () => {
    ok(await m({ servicedOn: "2026-06-01", nextDueOn: "2026-11-01", nextDueKm: undefined, odometerKm: 80000 })); ok(await m({ servicedOn: "2026-10-01", nextDueOn: "2027-05-01", nextDueKm: 120000, odometerKm: 100000 })); ok(await f.addMaintenance(U.O1, { vehicleId: V.v1, kind: "reading", servicedOn: "2026-11-12", odometerKm: 111000 })); ok(await f.addMaintenance(U.O1, { vehicleId: V.v1, kind: "reading", servicedOn: "2026-11-13", odometerKm: 109000 }));
    const v = (await f.maintenanceStatus(U.O1, TODAY)); expect(v.vehicles[0]).toMatchObject({ lastServiceOn: "2026-10-01", odometerKm: 111000, nextDueKm: 120000, kmLeft: 9000, status: "ok" }); await f.addMaintenance(U.O1, { vehicleId: V.v1, kind: "reading", servicedOn: "2026-11-14", odometerKm: 119500 }); expect((await f.maintenanceStatus(U.O1, TODAY)).flags.find((x) => x.id === `mnt:soon:${V.v1}`)).toMatchObject({ severity: "medium", message: "CA 111-111: the next service is due at 120000 km (500 km to go)" });
  });
  it("flags a vehicle with no service, one that is overdue and one that is due soon, naming the date or kilometres", async () => {
    ok(await m({ vehicleId: V.v2, servicedOn: "2026-05-01", nextDueOn: "2026-11-01", nextDueKm: undefined, odometerKm: 50000 })); const fl = (await f.maintenanceStatus(U.O1, TODAY)).flags; expect(fl.map((x) => [x.severity, x.message])).toEqual([["low", "CA 111-111: no service or repair has been recorded"], ["high", "CA 222-222: the service was due on 2026-11-01 and is overdue"]]);
    ok(await m({ servicedOn: "2026-11-10", nextDueOn: "2026-12-10", nextDueKm: undefined })); expect((await f.maintenanceStatus(U.O1, TODAY)).flags.find((x) => x.id === `mnt:soon:${V.v1}`)!.message).toBe("CA 111-111: the next service is due on 2026-12-10 (22 days)");
  });
});

describe("profit and loss", () => {
  /**
   * The worked example (all in rand). November 2026:
   *   CA 111-111  income 2000 + 1500 = 3500 (a voided 999 does not count)
   *               costs  fuel 600 + insurance 300 + an unpaid fine 200 = 1100 (a disputed fine of 500 and a voided cost of 777 do not count)
   *               profit before finance 3500 - 1100 = 2400; instalments paid 900 (a voided 400 does not count); CASH PROFIT 2400 - 900 = 1500
   *   CA 222-222  income 1000, no costs: profit 1000
   *   not tied to a vehicle: association 100
   *   FLEET       income 4500; costs 1100 + 100 = 1200; profit before finance 3300; instalments 900; cash profit 2400; margin 2400 / 4500 = 53.3%
   * October 2026 (the period before, 2 to 31 October): income 800, fuel 200, so cash profit 600; the change is 2400 - 600 = 1800.
   */
  beforeEach(async () => {
    await income(V.v1, 2000, "2026-11-03"); await income(V.v1, 1500, "2026-11-12"); await income(V.v1, 999, "2026-11-05", true); await income(V.v2, 1000, "2026-11-04"); await income(V.v1, 800, "2026-10-15"); await income(V.v3, 5555, "2026-11-04", false, U.O2);
    ok(await cost({ category: "fuel", amountCents: R(600), incurredOn: "2026-11-06" })); ok(await cost({ category: "insurance", amountCents: R(300), incurredOn: "2026-11-01", clientRef: "ins" })); ok(await cost({ category: "fine", amountCents: R(200), incurredOn: "2026-11-09", driverId: U.D1 })); ok(await cost({ category: "fine", amountCents: R(500), incurredOn: "2026-11-09", fineStatus: "disputed" })); const gone = ok<any>(await cost({ category: "fuel", amountCents: R(777), incurredOn: "2026-11-07", clientRef: "gone" })); ok(await f.voidCost(U.O1, gone.id, "mistake"));
    ok(await cost({ vehicleId: undefined, category: "association", amountCents: R(100), incurredOn: "2026-11-02", clientRef: "assoc" })); ok(await cost({ category: "fuel", amountCents: R(200), incurredOn: "2026-10-15", clientRef: "oct" })); ok(await cost({ vehicleId: V.v3, category: "fuel", amountCents: R(4444), incurredOn: "2026-11-05", clientRef: "theirs" }, U.O2));
    const fid = ok<any>(await fin({ startDate: "2026-01-20" })).id; ok(await f.recordInstalment(U.O1, fid, { amountCents: R(900), paidOn: "2026-11-02" })); const v = ok<any>(await f.recordInstalment(U.O1, fid, { amountCents: R(400), paidOn: "2026-11-03" })); ok(await f.voidInstalment(U.O1, v.id, "mistake"));
  });
  const pl = async (o: any = {}, owner = U.O1) => ok<any>(await f.profit(owner, { on: TODAY, ...o }));
  it("adds up a month: per vehicle, costs by category, what is not tied to a vehicle, and the fleet, before and after loan instalments", async () => {
    const p = await pl(); expect(p.period).toMatchObject({ kind: "month", from: "2026-11-01", to: "2026-11-30", label: "November 2026", previousFrom: "2026-10-02", previousTo: "2026-10-31" });
    const v1 = p.vehicles.find((v: any) => v.registration === "CA 111-111"); expect(v1).toMatchObject({ incomeCents: 350000, costCents: 110000, profitBeforeFinanceCents: 240000, instalmentCents: 90000, cashProfitCents: 150000 }); expect(v1.costs).toEqual([{ category: "fuel", label: "Fuel", cents: 60000 }, { category: "insurance", label: "Insurance", cents: 30000 }, { category: "fine", label: "Fines", cents: 20000 }]);
    expect(p.vehicles.find((v: any) => v.registration === "CA 222-222")).toMatchObject({ incomeCents: 100000, costCents: 0, cashProfitCents: 100000 }); expect(p.unallocated).toMatchObject({ vehicleId: null, incomeCents: 0, costCents: 10000, cashProfitCents: -10000 });
    expect(p.fleet).toMatchObject({ incomeCents: 450000, costCents: 120000, profitBeforeFinanceCents: 330000, instalmentCents: 90000, cashProfitCents: 240000, marginPercent: 53.3 }); expect(p.fleet.costs.map((c: any) => [c.category, c.cents])).toEqual([["fuel", 60000], ["insurance", 30000], ["fine", 20000], ["association", 10000]]);
  });
  it("compares with the period just before, and gives the last twelve months for the trend", async () => {
    const p = await pl(); expect(p.previous.fleet).toMatchObject({ incomeCents: 80000, costCents: 20000, cashProfitCents: 60000 }); expect(p.changeCents).toBe(180000); expect(p.months).toHaveLength(12); expect(p.months[0].month).toBe("2025-12"); expect(p.months[11]).toEqual({ month: "2026-11", incomeCents: 450000, costCents: 120000, instalmentCents: 90000, cashProfitCents: 240000 }); expect(p.months[10]).toEqual({ month: "2026-10", incomeCents: 80000, costCents: 20000, instalmentCents: 0, cashProfitCents: 60000 });
  });
  it("counts a disputed fine once it is no longer disputed, and stops counting a voided one", async () => {
    const fine = (await f.costs(U.O1, { category: "fine" })).find((c) => c.fineStatus === "disputed")!; ok(await f.setFineStatus(U.O1, fine.id, "paid")); expect((await pl()).fleet).toMatchObject({ costCents: 170000, cashProfitCents: 190000 });                  // 4 500 income - 1 700 costs (the 500 fine now counts) - 900 instalments = 1 900
  });
  it("reports a quarter, a year, the tax year and any dates, all on the same figures", async () => {
    const q4 = await pl({ period: "quarter" }); expect(q4.period).toMatchObject({ from: "2026-10-01", to: "2026-12-31" }); expect(q4.fleet).toMatchObject({ incomeCents: 530000, costCents: 140000, instalmentCents: 90000, cashProfitCents: 300000 }); expect((await pl({ period: "year" })).fleet.cashProfitCents).toBe(300000); expect((await pl({ period: "tax_year" })).fleet.cashProfitCents).toBe(300000); expect((await pl({ period: "custom", from: "2026-11-01", to: "2026-11-05" })).fleet).toMatchObject({ incomeCents: 300000, costCents: 40000 + 0, cashProfitCents: 300000 - 40000 - 90000 });
  });
  it("gives no margin when there was no income, and refuses a period that is not valid", async () => {
    expect((await pl({ period: "custom", from: "2026-09-01", to: "2026-09-30" })).fleet).toMatchObject({ incomeCents: 0, marginPercent: null, cashProfitCents: 0 }); for (const bad of [{ period: "decade" }, { period: "custom" }, { period: "custom", from: "2026-06-30", to: "2026-01-01" }, { on: "soon" }]) expect(await f.profit(U.O1, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
  });
  it("shows an owner only their own vehicles, income, costs and finance", async () => {
    const p = await pl({}, U.O2); expect(p.vehicles.map((v: any) => v.registration)).toEqual(["CA 333-333"]); expect(p.fleet).toMatchObject({ incomeCents: 555500, costCents: 444400, instalmentCents: 0, cashProfitCents: 111100 }); expect(JSON.stringify(p)).not.toContain("CA 111-111");
  });
});

describe("what needs the owner's attention", () => {
  it("gathers unpaid fines, a vehicle that lost money this month, a missing instalment and an overdue service, most serious first, with the month's figures", async () => {
    await income(V.v1, 100, "2026-11-03"); ok(await cost({ category: "fine", amountCents: R(200), incurredOn: "2026-11-09" })); ok(await cost({ category: "fine", amountCents: R(150), incurredOn: "2026-11-10", clientRef: "f2" })); ok(await cost({ category: "fuel", amountCents: R(300), incurredOn: "2026-11-06", clientRef: "fuel" })); ok(await fin()); ok(await f.addMaintenance(U.O1, { vehicleId: V.v2, kind: "service", servicedOn: "2026-05-01", nextDueOn: "2026-11-01", odometerKm: 1000 }));
    const o = await f.overview(U.O1, TODAY); expect(o.unpaidFines).toEqual({ count: 2, cents: 35000 }); expect(o.finance).toEqual({ activeAgreements: 1, owedCents: 30000000, monthlyInstalmentsCents: 900000 }); expect(o.month).toMatchObject({ incomeCents: 10000, costCents: 65000 }); expect(o.flags.map((x) => [x.severity, x.id.split(":").slice(0, 2).join(":")])).toEqual([["high", "mnt:overdue"], ["medium", "fin:missing"], ["medium", "fines:unpaid"], ["low", "mnt:none"], ["low", "pl:loss"]]);
    expect(o.flags.find((x) => x.id === "fines:unpaid")!.message).toBe("2 fines are unpaid, R350.00 in all"); expect(o.flags.find((x) => x.id.startsWith("pl:loss"))!.message).toBe("CA 111-111 cost more than it earned this month (R550.00 short)");                  // earned 100; costs 650 (fuel 300 and two fines, 350); no instalment recorded: 100 - 650 = -550
  });
  it("is quiet when nothing needs doing", async () => { const o = await f.overview(U.O2, TODAY); expect(o.flags.map((x) => x.id)).toEqual([`mnt:none:${V.v3}`]); expect(o.unpaidFines).toEqual({ count: 0, cents: 0 }); });
});
