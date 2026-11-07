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
 * The member register and formalisation APIs through the real routers, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let db: Db, server: Server, url = "";
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  db = allPortalsDb();
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
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
const C = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.A, "association", b), B = (m: string, p: string, b?: unknown) => call(m, `/association/compliance${p}`, U.B, "association", b);
const MR = (m: string, p: string, b?: unknown) => call(m, `/association/member-register${p}`, U.A, "association", b), MB = (m: string, p: string, b?: unknown) => call(m, `/association/member-register${p}`, U.B, "association", b), FM = (m: string, p: string, b?: unknown) => call(m, `/association/formalisation${p}`, U.A, "association", b), FB = (m: string, p: string, b?: unknown) => call(m, `/association/formalisation${p}`, U.B, "association", b);
async function raw(path: string, who: string) { const r = await fetch(url + path, { headers: { "x-test-user": `${who}:association` } }); return { status: r.status, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", buf: Buffer.from(await r.arrayBuffer()) }; }
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const R = (rand: number) => Math.round(rand * 100);

const V = { v1: id(20), v2: id(21), v9: id(29) }, ROUTE = id(40);
beforeEach(async () => {
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'ZZ 999-999','Toyota',15)`, [V.v1, U.O1, V.v2, V.v9, U.O3]);
  await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Langa to Bellville',2500)`, [ROUTE, U.A]);
  await db.query(`INSERT INTO terminals (id, serial, api_key_hash) VALUES ($1,'T-SAFETY','x')`, [id(60)]);
});
const session = (vehicle: string, days: number) => db.query(`INSERT INTO loading_sessions (terminal_id, vehicle_id, route_id, status, started_at) VALUES ($1,$2,$3,'closed',$4)`, [id(60), vehicle, ROUTE, new Date(Date.parse(`${plus(days)}T08:00:00Z`))]);

function saId(yymmdd: string, seq = "5009"): string { const d = `${yymmdd}${seq}08`; let sum = 0; for (let i = 0; i < 12; i++) { let n = Number(d[11 - i]); if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; } sum += n; } return d + String((10 - (sum % 10)) % 10); }
const ID1 = saId("800101"), ID2 = saId("750315", "1234");

describe("the member register, through the routes", () => {
  it("lists the association's members with the ID masked, and none of another association's", async () => {
    const r = (await MR("GET", "")).body; expect(r).toMatchObject({ success: true, today: TODAY }); expect(r.members.map((m: any) => [m.name, m.standing, m.idNumberMasked])).toEqual([["Olu Owner", "active", null], ["Ona Owner", "active", null]]); expect((await MB("GET", "")).body.members.map((m: any) => m.name)).toEqual(["Otto Owner"]);
  });
  it("saves a member's details, validated, with the ID never returned or recorded in full, and refuses another association's member", async () => {
    expect((await MR("PUT", `/${U.O1}`, { idNumber: "12345" })).status).toBe(400); expect((await MR("PUT", `/${U.O1}`, { standing: "suspended" })).status).toBe(400); expect((await MR("PUT", `/${U.O1}`, {})).status).toBe(400); expect((await MR("PUT", "/nope", { notes: "x" })).status).toBe(400); expect((await MR("PUT", `/${U.O3}`, { notes: "x" })).status).toBe(404); expect((await MB("PUT", `/${U.O1}`, { notes: "x" })).status).toBe(404);
    expect((await MR("PUT", `/${U.O1}`, { idNumber: ID1, phone: "+27821234567", cardNumber: "MC-0001", legalName: "Olu Owner" })).status).toBe(200); expect((await MR("PUT", `/${U.O2}`, { cardNumber: "mc-0001" })).status).toBe(409);
    const shown = JSON.stringify((await MR("GET", "")).body), records = JSON.stringify(await q(`SELECT details FROM audit_log WHERE action = 'members.register.save'`)) + JSON.stringify(await q(`SELECT summary FROM register_changes`));
    expect(shown).not.toContain(ID1); expect(records).not.toContain(ID1); expect(records).not.toContain("+27821234567");                  // the ID is masked on screen, and neither the ID nor the phone is written to the audit or change records
    expect((await MR("GET", "")).body.members[0]).toMatchObject({ idNumberMasked: `${"•".repeat(9)}${ID1.slice(-4)}`, cardNumber: "MC-0001", legalName: "Olu Owner", phone: "+27821234567" });
  });
  it("suspends a member with a reason, and flags it while their vehicles are still running trips", async () => {
    await session(V.v1, -2); expect((await MR("PUT", `/${U.O1}`, { standing: "suspended", standingReason: "Unpaid levies" })).status).toBe(200); const r = (await MR("GET", "")).body; expect(r.members[0]).toMatchObject({ standing: "suspended", standingReason: "Unpaid levies", standingChangedOn: TODAY, recentTrips: 1 }); expect(r.flags.find((f: any) => f.id === `members:standing:${U.O1}`)).toMatchObject({ severity: "high" });
    expect((await q(`SELECT action FROM audit_log WHERE action = 'members.register.save'`)).length).toBe(1);
  });
  it("records operators who are not members, refuses a member's vehicle, ends an entry, and lists the unregistered ones seen on the routes", async () => {
    await session(V.v9, -2); expect((await MR("GET", "")).body.unregisteredOperators).toEqual([expect.objectContaining({ registration: "ZZ 999-999", owner: "Otto Owner", trips: 1 })]);
    expect((await MR("POST", "/non-members", { name: "Vusi", vehicleRegistration: "CA 111-111", notedOn: TODAY })).status).toBe(409); expect((await MR("POST", "/non-members", { name: "", vehicleRegistration: "ZZ 999-999", notedOn: TODAY })).status).toBe(400); const n = await MR("POST", "/non-members", { name: "Visiting Vusi", vehicleRegistration: "zz 999-999", notedOn: plus(-2), phone: "082 111 2222" }); expect(n.status).toBe(201);
    expect((await MR("GET", "")).body.unregisteredOperators).toEqual([]); expect((await MR("GET", "/non-members")).body.nonMembers).toEqual([expect.objectContaining({ name: "Visiting Vusi", vehicleRegistration: "ZZ 999-999", endedOn: null })]); expect((await MB("GET", "/non-members")).body.nonMembers).toEqual([]);
    expect((await MB("POST", `/non-members/${n.body.id}/end`, { endedOn: TODAY })).status).toBe(404); expect((await MR("POST", `/non-members/${n.body.id}/end`, { endedOn: plus(-3) })).status).toBe(400); expect((await MR("POST", `/non-members/${n.body.id}/end`, { endedOn: TODAY })).status).toBe(200); expect((await MR("POST", `/non-members/${n.body.id}/end`, { endedOn: TODAY })).status).toBe(409); expect((await MR("POST", "/non-members/nope/end", {})).status).toBe(400);
  });
});

describe("owner formalisation, through the routes", () => {
  it("saves an owner's business and registrations, the tax number masked everywhere, and flags an owner with drivers who is not recorded as an employer", async () => {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,'driver1','Dan Driver','d@x.test','driver')`, [id(70)]); await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.O1, id(70)]);
    expect((await FM("PUT", `/${U.O1}`, { taxNumber: "12345" })).status).toBe(400); expect((await FM("PUT", `/${U.O1}`, { businessType: "company", taxNumber: "0123456789", taxRegistered: true, filingStatus: "overdue" })).status).toBe(200); expect((await FM("PUT", `/${U.O3}`, { businessType: "company" })).status).toBe(404); expect((await FB("PUT", `/${U.O1}`, { businessType: "company" })).status).toBe(404); expect((await FM("PUT", "/nope", {})).status).toBe(400);
    const r = (await FM("GET", "")).body; expect(r.owners[0]).toMatchObject({ name: "Olu Owner", businessType: "company", taxNumberMasked: "•••••••789", taxRegistered: true, filingStatus: "overdue", drivers: 1 }); expect(r.flags.map((f: any) => f.id.split(":").slice(0, 2).join(":"))).toEqual(expect.arrayContaining(["formal:uif", "formal:coida", "formal:filing"]));
    expect(JSON.stringify(r) + JSON.stringify(await q(`SELECT details FROM audit_log WHERE action = 'members.formalisation.save'`)) + JSON.stringify(await q(`SELECT summary FROM register_changes`))).not.toContain("0123456789"); expect((await FB("GET", "")).body.owners.map((o: any) => o.name)).toEqual(["Otto Owner"]);
  });
  it("shows member, non-member and formalisation flags in the compliance overview with the registers' flags", async () => {
    await session(V.v9, -1); const s = (await call("GET", "/association/compliance/summary", U.A, "association")).body, ids = s.flags.map((f: any) => f.id); expect(ids).toContain("members:nonmember:unregistered"); expect(ids).toContain(`members:identity:${U.O1}`); expect(ids).toContain(`formal:type:${U.O1}`);
    const order = { high: 0, medium: 1, low: 2 } as any; expect(s.flags.map((f: any) => order[f.severity])).toEqual([...s.flags.map((f: any) => order[f.severity])].sort((a: number, b: number) => a - b));
  });
});
