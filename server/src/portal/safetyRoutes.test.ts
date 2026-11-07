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
 * The safety and route-control APIs through the real routers, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
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
const SF = (m: string, p: string, b?: unknown) => call(m, `/association/safety${p}`, U.A, "association", b), SB = (m: string, p: string, b?: unknown) => call(m, `/association/safety${p}`, U.B, "association", b), RC = (m: string, p: string, b?: unknown) => call(m, `/association/route-control${p}`, U.A, "association", b), RCB = (m: string, p: string, b?: unknown) => call(m, `/association/route-control${p}`, U.B, "association", b);
async function raw(path: string, who: string) { const r = await fetch(url + path, { headers: { "x-test-user": `${who}:association` } }); return { status: r.status, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", buf: Buffer.from(await r.arrayBuffer()) }; }
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const R = (rand: number) => Math.round(rand * 100);

const V = { v1: id(20), v2: id(21), v9: id(29) }, ROUTE = id(40);
beforeEach(async () => {
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'ZZ 999-999','Toyota',15)`, [V.v1, U.O1, V.v2, V.v9, U.O3]);
  await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Langa to Bellville',2500)`, [ROUTE, U.A]);
});
const session = (vehicle: string, days: number) => db.query(`INSERT INTO loading_sessions (terminal_id, vehicle_id, route_id, status, started_at) VALUES ($1,$2,$3,'closed',$4)`, [id(60), vehicle, ROUTE, new Date(Date.parse(`${plus(days)}T08:00:00Z`))]);

describe("safety events, through the routes", () => {
  it("records an event, validated, linking only the association's own vehicle, and lists them with filters, scoped to the association", async () => {
    for (const bad of [{ kind: "brawl" }, { occurredOn: plus(1) }, { title: "" }, { vehicleId: V.v9 }]) expect((await SF("POST", "/events", { kind: "accident", occurredOn: plus(-3), title: "Collision", ...bad })).status, JSON.stringify(bad)).toBe(400);
    const a = await SF("POST", "/events", { kind: "accident", occurredOn: plus(-3), title: "Collision at the exit", vehicleId: V.v1, routeLabel: "Langa to Bellville", injuries: 2 }); expect(a.status).toBe(201); await SF("POST", "/events", { kind: "passenger_complaint", occurredOn: plus(-2), title: "Rude driver" });
    expect((await SF("GET", "/events")).body.events.map((e: any) => [e.title, e.vehicle])).toEqual([["Rude driver", null], ["Collision at the exit", "CA 111-111"]]); expect((await SF("GET", "/events?kind=accident")).body.events).toHaveLength(1); expect((await SF("GET", "/events?status=resolved")).body.events).toEqual([]); expect((await SB("GET", "/events")).body.events).toEqual([]);
    expect((await q(`SELECT action FROM audit_log WHERE action = 'safety.event.add'`)).length).toBe(2);
  });
  it("takes a dispute with another association through escalation to resolution, refusing each step out of order, and keeps another association out", async () => {
    const d = (await SF("POST", "/events", { kind: "inter_association_dispute", occurredOn: plus(-40), title: "Route border", otherAssociation: "Bellville TA" })).body, acc = (await SF("POST", "/events", { kind: "accident", occurredOn: plus(-3), title: "Collision" })).body;
    expect((await SF("POST", `/events/${acc.id}/escalate`, { to: "santaco", on: TODAY })).status).toBe(409); expect((await SF("POST", `/events/${d.id}/escalate`, { to: "the mayor", on: TODAY })).status).toBe(400); expect((await SB("POST", `/events/${d.id}/escalate`, { to: "santaco", on: TODAY })).status).toBe(404);
    expect((await SF("POST", `/events/${d.id}/escalate`, { to: "santaco", on: plus(-10), mediator: "SANTACO regional chair" })).status).toBe(200); expect((await SF("PUT", `/events/${d.id}`, { policeCaseNumber: "CAS 5/2026" })).status).toBe(200); expect((await SF("PUT", `/events/${d.id}`, {})).status).toBe(400);
    expect((await SF("POST", `/events/${d.id}/resolve`, { resolvedOn: TODAY, resolution: "" })).status).toBe(400); expect((await SF("POST", `/events/${d.id}/resolve`, { resolvedOn: TODAY, resolution: "Agreed a border" })).status).toBe(200); expect((await SF("POST", `/events/${d.id}/resolve`, { resolvedOn: TODAY, resolution: "again" })).status).toBe(409); expect((await SF("PUT", `/events/${d.id}`, { mediator: "x" })).status).toBe(409);
    expect((await SF("GET", "/events?kind=inter_association_dispute")).body.events[0]).toMatchObject({ status: "resolved", escalatedTo: "santaco", mediator: "SANTACO regional chair", policeCaseNumber: "CAS 5/2026", daysOpen: 40 }); expect((await SF("PUT", "/events/nope", {})).status).toBe(400);
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'safety.event.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["safety.event.add", "safety.event.add", "safety.event.escalate", "safety.event.update", "safety.event.resolve"]);
  });
  it("reports the year's figures and what stands out: repeat incidents on a vehicle and a notice in force", async () => {
    for (let i = 0; i < 3; i++) await SF("POST", "/events", { kind: "accident", occurredOn: plus(-5 - i), title: `Collision ${i}`, vehicleId: V.v1, injuries: 1 }); await SF("POST", "/events", { kind: "regulator_notice", occurredOn: plus(-2), title: "Route closure order", routeLabel: "Langa to Bellville", noticeUntil: plus(10) });
    const s = (await SF("GET", "/summary")).body; expect(s.measures).toMatchObject({ accidents: 3, injuries: 3, regulatorNotices: 1, noticesInForce: 1, open: 4 }); expect(s.flags.map((f: any) => [f.id.split(":").slice(0, 2).join(":"), f.severity])).toEqual([["safety:notice", "high"], ["safety:repeat", "medium"]]); expect((await SB("GET", "/summary")).body.measures.accidents).toBe(0); expect((await SF("GET", `/summary?on=${plus(30)}`)).body.flags.some((f: any) => f.id.startsWith("safety:notice"))).toBe(false);
  });
});

describe("route control, through the routes", () => {
  it("reports each route's saturation, vehicles running it without a valid licence, and non-member operators", async () => {
    await call("POST", `/association/compliance/vehicles/${V.v2}/licences`, U.A, "association", { licenceNumber: "OL-2", validFrom: plus(-100), validUntil: plus(300), route: "Langa to Bellville" }); await session(V.v1, -2); await session(V.v2, -3); await session(V.v9, -1);
    const r = (await RC("GET", "")).body; expect(r).toMatchObject({ success: true, today: TODAY, windowDays: 30 }); expect(r.routes).toEqual([expect.objectContaining({ name: "Langa to Bellville", licensedVehicles: 1, operatingVehicles: 3, saturationRatio: 3, band: "over", unlicensedOperating: [expect.objectContaining({ registration: "CA 111-111", trips: 1 })], nonMemberOperators: [expect.objectContaining({ registration: "ZZ 999-999", owner: "Otto Owner" })] })]);
    expect(r.flags.map((f: any) => f.id.split(":")[1]).sort()).toEqual(["over", "unlicensed"]); expect((await RCB("GET", "")).body.routes).toEqual([]); expect((await RC("GET", `/?on=${plus(40)}`)).body.routes[0].operatingVehicles).toBe(0);
  });
  it("shows the queue against departures and treats an approved exception as an exception, not a skip", async () => {
    const rank = id(50); await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa rank')`, [rank, U.A]); const at = (days: number, h: number) => new Date(Date.parse(`${plus(days)}T${String(h).padStart(2, "0")}:00:00Z`));
    for (let d = 0; d < 10; d++) { const day = -(d + 2); await db.query(`INSERT INTO rank_queue (rank_id, vehicle_id, joined_at, left_at) VALUES ($1,$2,$3,$4),($1,$5,$6,$7)`, [rank, V.v1, at(day, 6), at(day, 12), V.v2, at(day, 7), at(day, 8)]); await db.query(`INSERT INTO departures (rank_id, vehicle_id, marshal_id, departed_at, status) VALUES ($1,$2,$3,$4,$5),($1,$6,$3,$7,'completed')`, [rank, V.v2, U.O1, at(day, 8), d < 5 ? "approved_exception" : "completed", V.v1, at(day, 12)]); }
    const k = (await RC("GET", "")).body.ranks[0]; expect(k).toMatchObject({ name: "Langa rank", departures: 20, approvedExceptions: 5, checked: 15, skips: 5, skipPercent: 33.3, band: "high", skippers: [{ registration: "CA 222-222", skips: 5 }] });
  });
});

describe("the one overview", () => {
  it("shows safety and route flags in the compliance overview with the registers' flags, in order of seriousness", async () => {
    await SF("POST", "/events", { kind: "regulator_notice", occurredOn: plus(-2), title: "Route closure order", noticeUntil: plus(10) }); await session(V.v1, -2); const s = (await call("GET", "/association/compliance/summary", U.A, "association")).body; const ids = s.flags.map((f: any) => f.id);
    expect(ids.some((x: string) => x.startsWith("safety:notice"))).toBe(true); expect(ids).toContain(`routes:nolicensed:${ROUTE}`); expect(ids).toContain("reg:none"); const order = { high: 0, medium: 1, low: 2 } as any; expect(s.flags.map((f: any) => order[f.severity])).toEqual([...s.flags.map((f: any) => order[f.severity])].sort((a: number, b: number) => a - b));
  });
});
