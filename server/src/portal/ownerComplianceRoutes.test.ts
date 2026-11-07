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
 * The owner's compliance centre through the real owner router, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
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



const CC = (who: string, m: string, p: string, b?: unknown) => call(m, `/owner/compliance-centre${p}`, who, "vehicle_owner", b);
const C1 = (m: string, p: string, b?: unknown) => CC(U.O1, m, p, b), C3 = (m: string, p: string, b?: unknown) => CC(U.O3, m, p, b);
const NOTE = (who: string, m: string, p: string, b?: unknown) => call(m, `/owner/notifications${p}`, who, "vehicle_owner", b);

describe("the compliance centre, through the owner routes", () => {
  it("shows the owner's vehicles with their documents, the fleet totals, the reminder days and the province rules, and no other owner's", async () => {
    const c = (await C1("GET", "")).body; expect(c).toMatchObject({ success: true, today: TODAY, reminderDays: [90, 60, 30, 7], fleet: { vehicles: 2, green: 0, amber: 2, red: 0 } }); expect(c.vehicles.map((v: any) => v.registration)).toEqual(["CA 111-111", "CA 222-222"]); expect(c.rules.map((r: any) => [r.province, r.maxYears, r.verified])).toEqual([["*", 7, false], ["Gauteng", 5, false], ["Western Cape", 5, false]]);
    expect(JSON.stringify(c)).not.toContain("CB 444-444"); expect((await C3("GET", "")).body.vehicles.map((v: any) => v.registration)).toEqual(["CB 444-444"]); expect((await C1("GET", "?on=2026-12-25")).body.today).toBe("2026-12-25"); expect((await C1("GET", "?on=soon")).body.today).toBe(TODAY);
  });
  it("saves roadworthy, insurance and disc details, validated, and refuses someone else's vehicle", async () => {
    for (const [bad, st] of [[{ roadworthyExpiry: "soon" }, 400], [{ insurer: "x".repeat(90) }, 400], [{}, 400]] as const) expect((await C1("PUT", `/vehicles/${V.v1}`, bad)).status, JSON.stringify(bad)).toBe(st);
    expect((await C1("PUT", `/vehicles/${V.v1}`, { roadworthyExpiry: plus(200), roadworthyRef: "RWC-1", insurer: "Santam", policyNumber: "P-9", insuranceExpiry: plus(300), discExpiry: plus(250) })).status).toBe(200); expect((await C3("PUT", `/vehicles/${V.v1}`, { insurer: "x" })).status).toBe(404); expect((await C1("PUT", "/vehicles/nope", { insurer: "x" })).status).toBe(400);
    const v = (await C1("GET", "")).body.vehicles[0]; expect(v.items.find((i: any) => i.kind === "roadworthy")).toMatchObject({ expiresOn: plus(200), status: "valid", detail: "RWC-1" }); expect((await q(`SELECT action FROM audit_log WHERE action = 'owner.compliance.vehicle'`)).length).toBe(1);
  });
  it("records an operating licence under its province's limit, and removes one entered by mistake, only the owner's own", async () => {
    const lic = (o: any = {}) => C1("POST", `/vehicles/${V.v1}/licences`, { licenceNumber: "OL-1", province: "Gauteng", validFrom: "2024-03-01", validUntil: "2029-03-01", route: "Langa to Bellville", ...o });
    expect((await lic({ province: undefined })).status).toBe(400); const long = await lic({ validUntil: "2029-03-02" }); expect(long.status).toBe(400); expect(long.body.error).toContain("at most five years"); expect(long.body.error).toContain("not yet verified"); const ok1 = await lic(); expect(ok1.status).toBe(201); expect((await lic()).status).toBe(409); expect((await C3("POST", `/vehicles/${V.v1}/licences`, { licenceNumber: "X", province: "Gauteng", validFrom: "2024-03-01", validUntil: "2025-03-01" })).status).toBe(404);
    expect((await C3("DELETE", `/licences/${ok1.body.id}`)).status).toBe(404); expect((await C1("DELETE", "/licences/nope")).status).toBe(400); expect((await C1("DELETE", `/licences/${ok1.body.id}`)).status).toBe(200); expect((await C1("DELETE", `/licences/${ok1.body.id}`)).status).toBe(404); expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'owner.compliance.licence.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["owner.compliance.licence.add", "owner.compliance.licence.remove"]);
  });
  it("changes the reminder days, validated, for this owner only", async () => {
    for (const bad of [{ days: [] }, { days: [0] }, { days: "30" }, {}, { days: [1, 2, 3, 4, 5, 6, 7] }]) expect((await C1("PUT", "/reminders", bad)).status, JSON.stringify(bad)).toBe(400); const r = await C1("PUT", "/reminders", { days: [7, 14, 30] }); expect(r.status).toBe(200); expect(r.body.reminderDays).toEqual([30, 14, 7]); expect((await C1("GET", "")).body.reminderDays).toEqual([30, 14, 7]); expect((await C3("GET", "")).body.reminderDays).toEqual([90, 60, 30, 7]);
  });
});

describe("the reminders in the owner's notifications", () => {
  it("adds a reminder for a document coming due, once per band, as an unread notification, and it stays read once read", async () => {
    await C1("PUT", `/vehicles/${V.v1}`, { roadworthyExpiry: plus(20) }); const n1 = (await NOTE(U.O1, "GET", "")).body, rw = n1.notifications.filter((n: any) => n.key.startsWith("cc:roadworthy:")); expect(rw).toHaveLength(1); expect(rw[0]).toMatchObject({ kind: "licence", title: "CA 111-111: Roadworthy certificate expires in 20 days", read: false, body: `Expiry date: ${plus(20)}.` }); expect(rw[0].key).toBe(`cc:roadworthy:${V.v1}:${plus(20)}:30`);
    expect((await NOTE(U.O1, "POST", "/read", { keys: [rw[0].key] })).body.marked).toBe(1); expect((await NOTE(U.O1, "GET", "")).body.notifications.find((n: any) => n.key === rw[0].key).read).toBe(true);
  });
  it("shows a document that has expired, a PrDP as its own kind, and the disc only once", async () => {
    await db.query(`UPDATE vehicles SET driver_id = $2, disc_expiry = $3 WHERE id = $1`, [V.v1, U.D2, plus(10)]); await db.query(`INSERT INTO driver_profiles (user_id, pdp_expiry, licence_expiry) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET pdp_expiry = EXCLUDED.pdp_expiry, licence_expiry = EXCLUDED.licence_expiry`, [U.D2, plus(-4), plus(400)]); await C1("PUT", `/vehicles/${V.v1}`, { insuranceExpiry: plus(-2) });
    const n = (await NOTE(U.O1, "GET", "")).body.notifications; expect(n.find((x: any) => x.key.startsWith("cc:prdp:"))).toMatchObject({ kind: "pdp", title: expect.stringContaining("PrDP of") }); expect(n.find((x: any) => x.key.startsWith("cc:insurance:"))).toMatchObject({ title: "CA 111-111: Insurance has expired", body: `It expired on ${plus(-2)}. Please renew it.` });
    expect(n.filter((x: any) => /disc/i.test(x.title) || x.key.startsWith("disc-") || x.key.startsWith("cc:disc:")).length).toBe(1);                  // the existing licence disc reminder only
  });
  it("shows an owner only their own reminders", async () => { await C1("PUT", `/vehicles/${V.v1}`, { roadworthyExpiry: plus(5) }); expect((await NOTE(U.O3, "GET", "")).body.notifications.filter((x: any) => x.key.startsWith("cc:roadworthy:"))).toEqual([]); });
});
