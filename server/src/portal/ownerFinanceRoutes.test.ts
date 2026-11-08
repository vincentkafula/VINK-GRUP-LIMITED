/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import { delegateGate } from "./delegateGate.js";
import { createDelegates } from "../services/delegates.js";

/**
 * The owner's finances (costs, loans, maintenance, profit) through the real owner router, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) }, V = { v1: id(20), v2: id(21), v3: id(22), v4: id(23) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02", L = { a: id(30), b: id(31), c: id(32), d: id(33) };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let db: Db, server: Server, url = "";
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  db = allPortalsDb();
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner'),($1,$3,'active','owner'),($4,$5,'active','owner')`, [U.O1, U.D2, U.D3, U.O3, U.D1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CB 444-444','Toyota',15)`, [V.v1, U.O1, V.v2, V.v4, U.O3]);
  await db.query(`INSERT INTO driver_profiles (user_id, licence_code, licence_expiry, pdp_number, pdp_expiry) VALUES ($1,'EC1',$3,'PDP-2',$3),($2,'EC1',$3,'PDP-3',$4)`, [U.D2, U.D3, plus(400), plus(-10)]);
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { const [u, role] = String(req.header("x-test-user")).split(":"); (req as any).user = { userId: u, username: role, role }; next(); });
  app.use("/association", delegateGate(db), createAssociationRouter(db, () => NOW)); app.use("/owner", createOwnerRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}




const FN = (who: string, m: string, p: string, b?: unknown) => call(m, `/owner/finance${p}`, who, "vehicle_owner", b);
const F1 = (m: string, p: string, b?: unknown) => FN(U.O1, m, p, b), F3 = (m: string, p: string, b?: unknown) => FN(U.O3, m, p, b);
const payment = (vehicle: string, cents: number, on: string, owner = U.O1) => db.query(`INSERT INTO driver_payments (owner_id, vehicle_id, amount_cents, paid_on, method) VALUES ($1,$2,$3,$4,'cash')`, [owner, vehicle, cents, on]);

describe("costs and fines, through the owner routes", () => {
  it("records a cost, lists it, voids it with a reason, and keeps one owner's costs from another", async () => {
    for (const [bad, st] of [[{ category: "holiday" }, 400], [{ amountCents: 0 }, 400], [{ vehicleId: V.v4 }, 404], [{ incurredOn: "2027-01-01" }, 400]] as const) expect((await F1("POST", "/costs", Object.assign({ vehicleId: V.v1, category: "fuel", amountCents: 60000, incurredOn: "2026-10-20", payee: "Engen" }, bad))).status, JSON.stringify(bad)).toBe(st);
    const a = await F1("POST", "/costs", { vehicleId: V.v1, category: "fuel", amountCents: 60000, incurredOn: "2026-10-20", payee: "Engen", clientRef: "p-1" }); expect(a.status).toBe(201); const b = await F1("POST", "/costs", { vehicleId: V.v1, category: "fuel", amountCents: 1, incurredOn: "2026-10-20", clientRef: "p-1" }); expect([b.status, b.body.duplicate, b.body.id]).toEqual([200, true, a.body.id]);
    expect((await F1("GET", "/costs")).body.costs).toEqual([expect.objectContaining({ category: "fuel", amountCents: 60000, vehicle: "CA 111-111", payee: "Engen" })]); expect((await F3("GET", "/costs")).body.costs).toEqual([]); expect((await F3("POST", `/costs/${a.body.id}/void`, { reason: "x" })).status).toBe(404); expect((await F1("POST", `/costs/${a.body.id}/void`, { reason: "" })).status).toBe(400); expect((await F1("POST", `/costs/${a.body.id}/void`, { reason: "Entered twice" })).status).toBe(200); expect((await F1("POST", `/costs/${a.body.id}/void`, { reason: "again" })).status).toBe(409); expect((await F1("POST", "/costs/nope/void", {})).status).toBe(400);
    expect((await F1("GET", "/costs")).body.costs).toEqual([]); expect((await F1("GET", "/costs?voided=1")).body.costs[0]).toMatchObject({ voided: true, voidReason: "Entered twice" }); expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'owner.cost.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["owner.cost.add", "owner.cost.void"]);
  });
  it("records a fine against one of the owner's drivers and marks it disputed or paid", async () => {
    await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner') ON CONFLICT DO NOTHING`, [U.O1, U.D2]); const r = await F1("POST", "/costs", { vehicleId: V.v1, category: "fine", amountCents: 20000, incurredOn: "2026-10-30", driverId: U.D2, reference: "N-9" }); expect(r.status).toBe(201);
    expect((await F1("GET", "/costs?category=fine")).body.costs[0]).toMatchObject({ fineStatus: "unpaid", driverId: U.D2 }); expect((await F1("PUT", `/costs/${r.body.id}/fine-status`, { status: "lost" })).status).toBe(400); expect((await F3("PUT", `/costs/${r.body.id}/fine-status`, { status: "paid" })).status).toBe(404); expect((await F1("PUT", `/costs/${r.body.id}/fine-status`, { status: "disputed" })).status).toBe(200); expect((await F1("GET", "/costs?category=fine")).body.costs[0].fineStatus).toBe("disputed"); expect((await F1("PUT", "/costs/nope/fine-status", {})).status).toBe(400);
  });
});

describe("vehicle finance, through the owner routes", () => {
  const loan = (o: any = {}) => F1("POST", "/loans", { vehicleId: V.v1, lender: "WesBank", originalCents: 45000000, balanceCents: 30000000, balanceOn: "2026-10-31", instalmentCents: 900000, dueDay: 20, startDate: "2024-01-20", ...o });
  it("records a loan, validated, shows it with the next instalment and what is owed, and keeps it from another owner", async () => {
    for (const [bad, st] of [[{ vehicleId: V.v4 }, 404], [{ lender: "" }, 400], [{ dueDay: 40 }, 400], [{ instalmentCents: 0 }, 400]] as const) expect((await loan(bad)).status, JSON.stringify(bad)).toBe(st); expect((await loan()).status).toBe(201); expect((await loan()).status).toBe(409);
    const l = (await F1("GET", "/loans")).body; expect(l.finances[0]).toMatchObject({ lender: "WesBank", registration: "CA 111-111", balanceCents: 30000000, nextDueOn: "2026-11-20", instalmentsLeft: 34 }); expect(l.measures).toEqual({ activeAgreements: 1, owedCents: 30000000, monthlyInstalmentsCents: 900000 }); expect((await F3("GET", "/loans")).body.finances).toEqual([]);
  });
  it("records instalments safely, updates the balance only as the lender says, settles once, and voids a payment", async () => {
    const id1 = (await loan()).body.id; const a = await F1("POST", `/loans/${id1}/instalments`, { amountCents: 900000, paidOn: "2026-10-20", clientRef: "i-1" }); expect(a.status).toBe(201); const b = await F1("POST", `/loans/${id1}/instalments`, { amountCents: 1, paidOn: "2026-10-20", clientRef: "i-1" }); expect([b.status, b.body.duplicate]).toEqual([200, true]);
    expect((await F1("POST", `/loans/${id1}/instalments`, { amountCents: 0, paidOn: "2026-10-20" })).status).toBe(400); expect((await F3("POST", `/loans/${id1}/instalments`, { amountCents: 100, paidOn: "2026-10-20" })).status).toBe(404); expect((await F1("PUT", `/loans/${id1}/balance`, { balanceCents: 29000000, balanceOn: "2026-10-30" })).status).toBe(400); expect((await F1("PUT", `/loans/${id1}/balance`, { balanceCents: 29000000, balanceOn: "2026-11-01" })).status).toBe(200);
    expect((await F1("POST", `/instalments/${a.body.id}/void`, { reason: "" })).status).toBe(400); expect((await F1("POST", `/instalments/${a.body.id}/void`, { reason: "Wrong" })).status).toBe(200); expect((await F1("POST", `/loans/${id1}/settle`, { settledOn: "2026-11-02" })).status).toBe(200); expect((await F1("POST", `/loans/${id1}/settle`, { settledOn: "2026-11-02" })).status).toBe(409); expect((await F1("POST", "/loans/nope/settle", {})).status).toBe(400); expect((await F1("GET", "/loans")).body.finances[0]).toMatchObject({ status: "settled", balanceCents: 0 });
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'owner.loan.%' OR action LIKE 'owner.instalment.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["owner.loan.add", "owner.instalment.add", "owner.loan.balance", "owner.instalment.void", "owner.loan.settle"]);
  });
});

describe("maintenance, through the owner routes", () => {
  it("records a service with its cost (which becomes a running cost), shows where each vehicle is, and voids both together", async () => {
    const r = await F1("POST", "/maintenance", { vehicleId: V.v1, kind: "service", servicedOn: "2026-10-01", odometerKm: 100000, nextDueOn: "2026-11-20", nextDueKm: 115000, costCents: 250000, description: "Full service" }); expect(r.status).toBe(201); expect(r.body.costId).not.toBeNull();
    expect((await F1("GET", "/costs")).body.costs[0]).toMatchObject({ category: "maintenance", amountCents: 250000, fromMaintenance: true }); expect((await F1("GET", "/maintenance")).body.entries[0]).toMatchObject({ vehicle: "CA 111-111", kind: "service", costCents: 250000 });
    const s = (await F1("GET", "/maintenance/status")).body; expect(s.vehicles.map((v: any) => [v.registration, v.status])).toEqual([["CA 111-111", "due_soon"], ["CA 222-222", "none"]]); expect(s.flags.map((f: any) => f.severity)).toEqual(["medium", "low"]);
    expect((await F1("POST", "/maintenance", { vehicleId: V.v4, kind: "service", servicedOn: "2026-10-01" })).status).toBe(404); expect((await F1("POST", "/maintenance", { vehicleId: V.v1, kind: "wash", servicedOn: "2026-10-01" })).status).toBe(400); expect((await F3("POST", `/maintenance/${r.body.id}/void`, { reason: "x" })).status).toBe(404); expect((await F1("POST", `/costs/${r.body.costId}/void`, { reason: "x" })).status).toBe(409); expect((await F1("POST", `/maintenance/${r.body.id}/void`, { reason: "Wrong vehicle" })).status).toBe(200); expect((await F1("GET", "/costs")).body.costs).toEqual([]); expect((await F1("GET", "/maintenance")).body.entries).toEqual([]);
  });
});

describe("profit and the overview, through the owner routes", () => {
  it("adds up a month from the driver payments and costs recorded, and refuses a period that is not valid", async () => {
    await payment(V.v1, 350000, "2026-10-12"); await payment(V.v2, 100000, "2026-10-14"); await payment(V.v4, 999999, "2026-10-14", U.O3); await F1("POST", "/costs", { vehicleId: V.v1, category: "fuel", amountCents: 60000, incurredOn: "2026-10-15" }); await F1("POST", "/costs", { category: "association", amountCents: 10000, incurredOn: "2026-10-16" });
    const p = (await F1("GET", "/profit?on=2026-10-20")).body; expect(p).toMatchObject({ success: true, period: { kind: "month", from: "2026-10-01", to: "2026-10-31", label: "October 2026" }, fleet: { incomeCents: 450000, costCents: 70000, profitBeforeFinanceCents: 380000, cashProfitCents: 380000, marginPercent: 84.4 } }); expect(p.months).toHaveLength(12); expect(JSON.stringify(p)).not.toContain("CB 444-444");
    expect((await F1("GET", "/profit?period=custom&from=2026-10-12&to=2026-10-12")).body.fleet).toMatchObject({ incomeCents: 350000, costCents: 0 }); expect((await F1("GET", "/profit?period=decade")).status).toBe(400); expect((await F1("GET", "/profit?period=custom")).status).toBe(400); expect((await F3("GET", "/profit?on=2026-10-20")).body.fleet).toMatchObject({ incomeCents: 999999, costCents: 0 });
  });
  it("gathers what needs attention across fines, loans and maintenance", async () => {
    await F1("POST", "/costs", { vehicleId: V.v1, category: "fine", amountCents: 20000, incurredOn: "2026-10-30" }); await F1("POST", "/loans", { vehicleId: V.v1, lender: "WesBank", originalCents: 45000000, balanceCents: 30000000, balanceOn: "2026-10-31", instalmentCents: 900000, dueDay: 20, startDate: "2024-01-20" });
    const o = (await F1("GET", "/overview")).body; expect(o).toMatchObject({ success: true, unpaidFines: { count: 1, cents: 20000 }, finance: { activeAgreements: 1 } }); expect(o.flags.map((f: any) => f.id.split(":").slice(0, 2).join(":"))).toEqual(expect.arrayContaining(["fin:missing", "fines:unpaid", "mnt:none"])); expect((await F3("GET", "/overview")).body.unpaidFines).toEqual({ count: 0, cents: 0 });
  });
});
