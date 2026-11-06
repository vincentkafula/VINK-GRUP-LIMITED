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
 * The compliance API through the real routers, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) }, V = { v1: id(20), v2: id(21), v4: id(23) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
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
const A = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.A, "association", b), B = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.B, "association", b), O = (m: string, p: string, who: string, b?: unknown) => call(m, `/owner${p}`, who, "vehicle_owner", b);

describe("registration, office bearers, documents and acceptances", () => {
  it("records and reads the association's registration, validated, with a change history and an audit record, and another association sees none of it", async () => {
    expect((await A("GET", "/registration")).body.registration).toMatchObject({ recorded: false, status: "conditional", memberCount: 2 });
    const r = await A("PUT", "/registration", { status: "full", registrationNumber: "GP/2026/0412", registrar: "Gauteng PRE", minMembersRequired: 10, constitutionVersion: "3" }); expect(r.status).toBe(200); expect(r.body.registration).toMatchObject({ recorded: true, status: "full", registrationNumber: "GP/2026/0412" });
    for (const bad of [{ status: "approved" }, { minMembersRequired: -1 }, { renewalDueOn: "soon" }]) expect((await A("PUT", "/registration", bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await A("GET", "/changes?entity=registration")).body.changes.map((c: any) => c.summary)).toContain("status: conditional → full"); expect((await q(`SELECT action FROM audit_log WHERE action = 'compliance.registration'`)).length).toBe(1);
    expect((await B("GET", "/registration")).body.registration.recorded).toBe(false); expect((await B("GET", "/changes")).body.changes).toEqual([]);
  });
  it("manages office bearers and documents through to deletion, with ids checked and other associations' records out of reach", async () => {
    const ob = (await A("POST", "/office-bearers", { name: "Thabo Mokoena", office: "Chairperson", termEnd: plus(-5) })); expect(ob.status).toBe(201); expect((await A("POST", "/office-bearers", { name: "", office: "x" })).status).toBe(400); expect((await A("GET", "/office-bearers")).body.officeBearers).toHaveLength(1);
    expect((await A("PUT", `/office-bearers/${ob.body.id}`, { termEnd: plus(900) })).status).toBe(200); expect((await B("PUT", `/office-bearers/${ob.body.id}`, { termEnd: plus(1) })).status).toBe(404); expect((await A("PUT", "/office-bearers/nope", {})).status).toBe(400); expect((await B("DELETE", `/office-bearers/${ob.body.id}`)).status).toBe(404); expect((await A("DELETE", `/office-bearers/${ob.body.id}`)).status).toBe(200);
    const d = await A("POST", "/documents", { kind: "constitution", title: "Signed constitution", version: "3", datedOn: "2026-01-10" }); expect(d.status).toBe(201); expect((await A("POST", "/documents", { kind: "nonsense", title: "x" })).status).toBe(400); expect((await A("GET", "/documents")).body.documents[0]).toMatchObject({ kind: "constitution", version: "3" });
    expect((await B("DELETE", `/documents/${d.body.id}`)).status).toBe(404); expect((await A("DELETE", `/documents/${d.body.id}`)).status).toBe(200);
  });
  it("records a member's signed acceptance for members only, and lists who has and has not signed", async () => {
    await A("PUT", "/registration", { constitutionVersion: "3" }); expect((await A("POST", "/acceptances", { memberId: U.O3, version: "3", acceptedOn: "2026-02-01" })).status).toBe(400); expect((await A("POST", "/acceptances", { memberId: U.O1, version: "3", acceptedOn: "2026-02-01", reference: "SIG-1" })).status).toBe(201);
    const a = (await A("GET", "/acceptances")).body; expect(a.constitutionVersion).toBe("3"); expect(a.members.map((m: any) => [m.name, m.acceptedCurrent])).toEqual([["Olu Owner", true], ["Ona Owner", false]]);
  });
});

describe("vehicles, operating licences and applications", () => {
  it("lists the association's own members' vehicles with their licence status, and none of another association's", async () => {
    expect((await A("GET", "/vehicles")).body.vehicles.map((v: any) => [v.registration, v.licence.status])).toEqual([["CA 111-111", "none"], ["CA 222-222", "none"]]); expect((await B("GET", "/vehicles")).body.vehicles.map((v: any) => v.registration)).toEqual(["CB 444-444"]);
  });
  it("adds and removes a licence (at most seven years, once per number), saves the vehicle's details, and refuses another association's vehicle", async () => {
    const l = await A("POST", `/vehicles/${V.v1}/licences`, { licenceNumber: "OL-1", validFrom: plus(-100), validUntil: plus(400), route: "Langa to Bellville" }); expect(l.status).toBe(201);
    expect((await A("POST", `/vehicles/${V.v1}/licences`, { licenceNumber: "OL-1", validFrom: plus(-100), validUntil: plus(400) })).status).toBe(409); expect((await A("POST", `/vehicles/${V.v1}/licences`, { licenceNumber: "OL-2", validFrom: "2026-01-01", validUntil: "2034-01-01" })).status).toBe(400);
    expect((await A("POST", `/vehicles/${V.v4}/licences`, { licenceNumber: "OL-9", validFrom: plus(-1), validUntil: plus(10) })).status).toBe(404); expect((await A("POST", "/vehicles/nope/licences", {})).status).toBe(400);
    expect((await A("PUT", `/vehicles/${V.v1}`, { insurer: "Santam", insuranceExpiry: plus(200), tracker: "installed" })).status).toBe(200); expect((await A("PUT", `/vehicles/${V.v1}`, { tracker: "maybe" })).status).toBe(400); expect((await B("PUT", `/vehicles/${V.v1}`, { insurer: "x" })).status).toBe(404);
    const v = (await A("GET", "/vehicles")).body.vehicles[0]; expect(v).toMatchObject({ licence: { status: "valid" }, compliance: { insurer: "Santam", tracker: "installed" } }); expect((await B("DELETE", `/licences/${l.body.id}`)).status).toBe(404); expect((await A("DELETE", `/licences/${l.body.id}`)).status).toBe(200); expect((await A("GET", "/vehicles")).body.vehicles[0].licence.status).toBe("none");
    expect((await q(`SELECT action FROM audit_log WHERE action = 'compliance.vehicle'`)).length).toBe(1);
  });
  it("keeps an application apart from a licence: lodged is unlicensed in the overview, and an outcome is set once", async () => {
    const a = await A("POST", `/vehicles/${V.v2}/applications`, { kind: "new", reference: "APP-1", lodgedOn: plus(-10) }); expect(a.status).toBe(201); expect((await A("GET", "/summary")).body.measures).toMatchObject({ vehicles: 2, vehiclesLicensed: 0, applicationOnly: 1, noLicence: 1 });
    expect((await A("PUT", `/applications/${a.body.id}`, { outcome: "granted", outcomeOn: plus(-11) })).status).toBe(400); expect((await A("PUT", `/applications/${a.body.id}`, { outcome: "granted", outcomeOn: TODAY })).status).toBe(200); expect((await A("PUT", `/applications/${a.body.id}`, { outcome: "refused", outcomeOn: TODAY })).status).toBe(409); expect((await B("PUT", `/applications/${a.body.id}`, { outcome: "granted", outcomeOn: TODAY })).status).toBe(404);
    expect((await A("POST", `/vehicles/${V.v2}/applications`, { kind: "new", lodgedOn: plus(5) })).status).toBe(400);
  });
});

describe("drivers, enforcement, the overview and the trend", () => {
  it("lists the association's drivers with their owner and vehicle, keeps the ID number out of every response and out of the audit record, and refuses other associations' drivers", async () => {
    const list = (await A("GET", "/drivers")).body.drivers; expect(list.map((d: any) => d.name)).toEqual(["Dan Driver", "Dina Driver"]);
    const r = await A("PUT", `/drivers/${U.D2}`, { idNumber: "8001015009087", employmentStatus: "employed", uifRegistered: true, coidaRegistered: true }); expect(r.status).toBe(200); expect((await A("PUT", `/drivers/${U.D2}`, { idNumber: "123" })).status).toBe(400);
    const d = (await A("GET", "/drivers")).body.drivers.find((x: any) => x.id === U.D2); expect(d.idNumberMasked).toBe("•••••••••9087"); expect(JSON.stringify(await A("GET", "/drivers"))).not.toContain("8001015009"); expect(JSON.stringify(await q(`SELECT details FROM audit_log WHERE action = 'compliance.driver'`))).not.toContain("8001015009"); expect(JSON.stringify((await A("GET", "/changes")).body)).not.toContain("8001015009");
    expect((await B("PUT", `/drivers/${U.D2}`, { employmentStatus: "employed" })).status).toBe(404);
  });
  it("refuses an owner who puts a driver without a valid permit on a vehicle, only once the association has switched that on, and says why", async () => {
    await A("PUT", "/settings", { enforcePrdp: false }); expect((await O("PUT", `/vehicles/${V.v1}/driver`, U.O1, { driverId: U.D3 })).status).toBe(200);                       // off: unchanged
    expect((await A("PUT", "/settings", { enforcePrdp: "yes" })).status).toBe(400); expect((await A("PUT", "/settings", { enforcePrdp: true })).body.enforcePrdp).toBe(true); expect((await A("GET", "/settings")).body.enforcePrdp).toBe(true);
    const blocked = await O("PUT", `/vehicles/${V.v1}/driver`, U.O1, { driverId: U.D3 }); expect(blocked.status).toBe(409); expect(blocked.body.error).toContain(`expired on ${plus(-10)}`);
    expect((await O("PUT", `/vehicles/${V.v1}/driver`, U.O1, { driverId: U.D2 })).status).toBe(200); expect((await O("PUT", `/vehicles/${V.v1}/driver`, U.O1, { driverId: null })).status).toBe(200);                    // a valid permit, or taking the driver off
    expect((await B("GET", "/settings")).body.enforcePrdp).toBe(false); await A("PUT", "/settings", { enforcePrdp: false }); expect((await O("PUT", `/vehicles/${V.v1}/driver`, U.O1, { driverId: U.D3 })).status).toBe(200); expect((await q(`SELECT summary FROM register_changes WHERE entity = 'settings'`)).length).toBe(3);
  });
  it("gives the overview as of today or as of a day asked for, and the monthly trend once a snapshot has been taken", async () => {
    await A("POST", `/vehicles/${V.v1}/licences`, { licenceNumber: "OL-1", validFrom: plus(-100), validUntil: plus(20) }); const s = (await A("GET", "/summary")).body; expect(s).toMatchObject({ today: TODAY, measures: { vehicles: 2, vehiclesLicensed: 1, licensedPercent: 50 }, flagCounts: expect.any(Object) }); expect(s.expiries.some((e: any) => e.kind === "Operating licence" && e.days === 20)).toBe(true);
    expect((await A("GET", `/summary?on=${plus(30)}`)).body.measures.vehiclesLicensed).toBe(0); expect((await A("GET", "/summary?on=garbage")).body.today).toBe(TODAY); expect((await A("GET", "/trend")).body.trend).toEqual([]);
    const { createCompliance } = await import("../services/compliance.js"); await createCompliance(db, () => NOW).snapshotAll(TODAY); expect((await A("GET", "/trend")).body.trend).toEqual([{ month: "2026-11", vehicles: 2, licensed: 1, licensedPercent: 50, drivers: 2, driversValid: 1, validPermitPercent: 50 }]); expect((await B("GET", "/summary")).body.measures.vehicles).toBe(1);
  });
});
