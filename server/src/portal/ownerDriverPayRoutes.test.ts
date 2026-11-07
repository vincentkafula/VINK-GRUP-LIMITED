/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";

/**
 * The owner and driver money API through the real owner router, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) }, V = { v1: id(20), v2: id(21), v3: id(22), v4: id(23) };
const NOW = new Date("2026-11-04T08:00:00Z"), TODAY = "2026-11-04";
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
  app.use("/association", createAssociationRouter(db, () => NOW)); app.use("/owner", createOwnerRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}


const OW = (who: string, m: string, p: string, b?: unknown) => call(m, `/owner/driver-pay${p}`, who, "vehicle_owner", b);
const O1 = (m: string, p: string, b?: unknown) => OW(U.O1, m, p, b), O2 = (m: string, p: string, b?: unknown) => OW(U.O3, m, p, b);                  // the other owner (O3), who has the vehicle v4

describe("owner and driver money, through the owner routes", () => {
  it("sets a target for one's own vehicle, validated, lists it, and ends it, and another owner cannot see or touch it", async () => {
    for (const [bad, st] of [[{ period: "monthly" }, 400], [{ amountCents: 0 }, 400], [{ vehicleId: V.v4 }, 404], [{ startDate: "soon" }, 400]] as const) expect((await O1("POST", "/targets", Object.assign({ vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-11-02" }, bad))).status, JSON.stringify(bad)).toBe(st);
    const t = await O1("POST", "/targets", { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-11-02", terms: "Before 20:00" }); expect(t.status).toBe(201); expect((await O1("GET", "/targets")).body.targets).toEqual([expect.objectContaining({ registration: "CA 111-111", period: "daily", amountCents: 20000, terms: "Before 20:00" })]); expect((await O2("GET", "/targets")).body.targets).toEqual([]);
    expect((await O2("POST", `/targets/${t.body.id}/end`, { endDate: TODAY })).status).toBe(404); expect((await O1("POST", `/targets/${t.body.id}/end`, { endDate: "2026-11-01" })).status).toBe(400); expect((await O1("POST", `/targets/${t.body.id}/end`, { endDate: TODAY })).status).toBe(200); expect((await O1("POST", `/targets/${t.body.id}/end`, { endDate: TODAY })).status).toBe(409); expect((await O1("POST", "/targets/nope/end", {})).status).toBe(400);
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'owner.target.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["owner.target.set", "owner.target.end"]);
  });
  it("records a payment, earmarked by the split, retries it safely with the same reference, and reconciles it against the target", async () => {
    await O1("POST", "/targets", { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-11-02" }); expect((await O1("PUT", `/vehicles/${V.v1}/split`, { ownerBp: 7000, associationBp: 2000, financeBp: 1000, maintenanceBp: 0 })).status).toBe(200); expect((await O1("PUT", `/vehicles/${V.v1}/split`, { ownerBp: 5000, associationBp: 2000, financeBp: 1000, maintenanceBp: 0 })).status).toBe(400);
    const a = await O1("POST", "/payments", { vehicleId: V.v1, amountCents: 30000, paidOn: "2026-11-03", method: "cash", clientRef: "phone-1" }); expect(a.status).toBe(201); expect(a.body).toMatchObject({ duplicate: false, allocations: { owner: 30000 } }); const b = await O1("POST", "/payments", { vehicleId: V.v1, amountCents: 30000, paidOn: "2026-11-03", method: "cash", clientRef: "phone-1" }); expect(b.status).toBe(200); expect(b.body).toMatchObject({ duplicate: true, id: a.body.id });
    const c = await O1("POST", "/payments", { vehicleId: V.v1, amountCents: 10000, paidOn: TODAY, method: "eft" }); expect(c.body.allocations).toEqual({ owner: 7000, association: 2000, finance: 1000, maintenance: 0 });
    const r = (await O1("GET", `/vehicles/${V.v1}`)).body; expect(r).toMatchObject({ success: true, hasTarget: true, status: "amber", totals: { expectedCents: 60000, receivedCents: 40000, balanceCents: -20000, arrearsCents: 20000 }, earmarks: { owner: 37000, association: 2000, finance: 1000, totalCents: 40000 } }); expect((await q(`SELECT action FROM audit_log WHERE action = 'owner.payment.record'`)).length).toBe(2);                  // the retry is not audited again
  });
  it("refuses a payment that is not valid, for someone else's vehicle, in the future, or with a bad method, and lists history with filters", async () => {
    for (const [bad, st] of [[{ vehicleId: V.v4 }, 404], [{ amountCents: 0 }, 400], [{ method: "barter" }, 400], [{ paidOn: "2026-11-05" }, 400]] as const) expect((await O1("POST", "/payments", Object.assign({ vehicleId: V.v1, amountCents: 5000, paidOn: TODAY, method: "cash" }, bad))).status, JSON.stringify(bad)).toBe(st);
    await O1("POST", "/payments", { vehicleId: V.v1, amountCents: 5000, paidOn: "2026-11-03", method: "cash" }); await O1("POST", "/payments", { vehicleId: V.v2, amountCents: 7000, paidOn: TODAY, method: "cash" });
    expect((await O1("GET", "/payments")).body.payments.map((p: any) => [p.vehicle, p.amountCents])).toEqual([["CA 222-222", 7000], ["CA 111-111", 5000]]); expect((await O1("GET", `/payments?vehicleId=${V.v1}`)).body.payments).toHaveLength(1); expect((await O1("GET", `/payments?from=${TODAY}`)).body.payments).toHaveLength(1); expect((await O2("GET", "/payments")).body.payments).toEqual([]);
  });
  it("voids a payment with a reason, once, and it stops counting", async () => {
    await O1("POST", "/targets", { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-11-02" }); const p = (await O1("POST", "/payments", { vehicleId: V.v1, amountCents: 20000, paidOn: "2026-11-02", method: "cash" })).body.id;
    expect((await O1("POST", `/payments/${p}/void`, { reason: "" })).status).toBe(400); expect((await O2("POST", `/payments/${p}/void`, { reason: "x" })).status).toBe(404); expect((await O1("POST", `/payments/${p}/void`, { reason: "Entered twice" })).status).toBe(200); expect((await O1("POST", `/payments/${p}/void`, { reason: "again" })).status).toBe(409); expect((await O1("POST", "/payments/nope/void", {})).status).toBe(400);
    expect((await O1("GET", `/vehicles/${V.v1}`)).body.totals.receivedCents).toBe(0); expect((await O1("GET", "/payments")).body.payments[0]).toMatchObject({ voided: true, voidReason: "Entered twice" });
  });
  it("pauses a vehicle so the target stops accruing, refuses to cancel a pause that has started, and records a waiver with a reason", async () => {
    await O1("POST", "/targets", { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-11-02" }); const p = await O1("POST", "/pauses", { vehicleId: V.v1, fromDate: "2026-11-03", toDate: "2026-11-04", reason: "Gearbox" }); expect(p.status).toBe(201); expect((await O1("GET", `/vehicles/${V.v1}`)).body.totals.expectedCents).toBe(20000);
    expect((await O1("DELETE", `/pauses/${p.body.id}`)).status).toBe(409); expect((await O2("DELETE", `/pauses/${p.body.id}`)).status).toBe(404); expect((await O1("POST", "/pauses", { vehicleId: V.v1, fromDate: "2026-11-03", toDate: "2026-11-02", reason: "x" })).status).toBe(400); expect((await O1("GET", "/pauses")).body.pauses).toHaveLength(1);
    expect((await O1("POST", "/waivers", { vehicleId: V.v1, amountCents: 5000, waivedOn: TODAY, reason: "" })).status).toBe(400); expect((await O1("POST", "/waivers", { vehicleId: V.v1, amountCents: 5000, waivedOn: TODAY, reason: "Funeral" })).status).toBe(201); expect((await O1("GET", "/waivers")).body.waivers).toEqual([expect.objectContaining({ amountCents: 5000, reason: "Funeral" })]); expect((await O2("GET", "/waivers")).body.waivers).toEqual([]);
  });
  it("shows the fleet at a glance, scoped to the owner, and reconciles only the owner's own vehicles", async () => {
    await O1("POST", "/targets", { vehicleId: V.v1, period: "daily", amountCents: 20000, startDate: "2026-11-02" }); await O1("POST", "/payments", { vehicleId: V.v1, amountCents: 60000, paidOn: TODAY, method: "cash" });
    const f = (await O1("GET", "/fleet")).body; expect(f).toMatchObject({ success: true, today: TODAY, measures: { vehicles: 2, withTarget: 1, green: 1 } }); expect(f.vehicles.map((v: any) => [v.registration, v.status])).toEqual([["CA 111-111", "green"], ["CA 222-222", "none"]]); expect((await O2("GET", "/fleet")).body.vehicles.map((v: any) => v.registration)).toEqual(["CB 444-444"]);
    expect((await O2("GET", `/vehicles/${V.v1}`)).status).toBe(404); expect((await O1("GET", "/vehicles/nope")).status).toBe(400); expect((await O1("GET", `/fleet?on=2026-11-09`)).body.today).toBe("2026-11-09");
  });
});
