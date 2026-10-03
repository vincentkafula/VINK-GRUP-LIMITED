import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import { csvCell, bucketDays, pageParams, rangeParams, saDay } from "./common.js";
import type { Db } from "./driverRoutes.js";
import { createDriverRouter } from "./driverRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import { createMarshalRouter } from "./marshalRoutes.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createInvestorRouter } from "./investorRoutes.js";
import type { Request } from "express";

const NOW = new Date("2026-10-07T10:00:00Z");     // Wednesday, 12:00 in South Africa
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { assoc: id(1), assoc2: id(2), owner: id(3), owner2: id(4), driver: id(5), driver2: id(6), marshal: id(7), investor: id(8), investor2: id(9) };
const T1 = id(100), T2 = id(101), V1 = id(110), V2 = id(111);

const fakeReq = (query: Record<string, string>) => ({ query }) as unknown as Request;

describe("shared helpers", () => {
  it("csvCell neutralises spreadsheet formulas in text, quotes awkward text, and leaves numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1")).toBe("'+1"); expect(csvCell("-1")).toBe("'-1"); expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(-50)).toBe("-50");                              // a negative NUMBER is data, not a formula
    expect(csvCell("a, b")).toBe("\"a, b\""); expect(csvCell("line\nbreak")).toBe("\"line\nbreak\"");
    expect(csvCell(null)).toBe("");
  });

  it("pageParams keeps limit and offset in bounds", () => {
    expect(pageParams(fakeReq({}), 25, 100)).toEqual({ limit: 25, offset: 0 });
    expect(pageParams(fakeReq({ limit: "9999", offset: "-5" }), 25, 100)).toEqual({ limit: 100, offset: 0 });
    expect(pageParams(fakeReq({ limit: "abc", offset: "x" }), 25, 100)).toEqual({ limit: 25, offset: 0 });
  });

  it("rangeParams: defaults, South African day edges, and rejects bad, reversed or over-long ranges", () => {
    const r = rangeParams(fakeReq({}), NOW, 14);
    expect(r).toMatchObject({ fromDay: "2026-09-24", toDay: "2026-10-07" });
    expect((r as any).from.toISOString()).toBe("2026-09-23T22:00:00.000Z");        // 00:00 on 24 Sep in UTC+2
    expect((r as any).toExclusive.toISOString()).toBe("2026-10-07T22:00:00.000Z");
    expect(rangeParams(fakeReq({ from: "2026-13-01" }), NOW)).toHaveProperty("error");
    expect(rangeParams(fakeReq({ from: "2026-10-05", to: "2026-10-01" }), NOW)).toHaveProperty("error");
    expect(rangeParams(fakeReq({ from: "2024-01-01", to: "2026-10-01" }), NOW)).toHaveProperty("error");
    expect(saDay(new Date("2026-10-07T22:30:00Z"))).toBe("2026-10-08");            // already tomorrow in South Africa
  });

  it("bucketDays zero-fills and groups by South African day", () => {
    const from = new Date("2026-10-05T22:00:00Z"), to = new Date("2026-10-08T22:00:00Z");       // 6, 7, 8 Oct
    const d = bucketDays([{ at: "2026-10-06T10:00:00Z", value: 10 }, { at: "2026-10-06T21:59:00Z", value: 5 }, { at: "2026-10-06T22:01:00Z", value: 7 }, { at: "2026-09-01T00:00:00Z", value: 99 }], from, to);
    expect(d).toEqual([{ day: "2026-10-06", value: 15, count: 2 }, { day: "2026-10-07", value: 7, count: 1 }, { day: "2026-10-08", value: 0, count: 0 }]);
  });
});

describe("advanced dashboard features (real queries on in-memory Postgres)", () => {
  let server: Server, url = "", db: Db, as = U.driver, role = "driver";

  beforeEach(async () => {
    db = allPortalsDb(); as = U.driver; role = "driver";
    const people: [string, string, string, string][] = [
      [U.assoc, "Assoc One", "assoc1@x.test", "association"], [U.assoc2, "Assoc Two", "assoc2@x.test", "association"], [U.owner, "Owner One", "owner1@x.test", "vehicle_owner"],
      [U.owner2, "Owner Two", "owner2@x.test", "vehicle_owner"], [U.driver, "Driver One", "driver1@x.test", "driver"], [U.driver2, "Driver Two", "driver2@x.test", "driver"],
      [U.marshal, "Marshal One", "marshal1@x.test", "marshal"], [U.investor, "Investor One", "inv1@x.test", "investor"], [U.investor2, "Investor Two", "inv2@x.test", "investor"],
    ];
    for (const [i, n, e, r] of people) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [i, n, e, r]);
    // owner's vehicle V1 (driver One) with terminal T1 (investor One); owner2's vehicle V2 (driver Two) with terminal T2 (investor Two)
    await db.query(`INSERT INTO vehicles (id, owner_id, registration, driver_id, seats) VALUES ($1,$2,'V ONE',$3,15), ($4,$5,'V TWO',$6,15)`, [V1, U.owner, U.driver, V2, U.owner2, U.driver2]);
    await db.query(`INSERT INTO terminals (id, serial, vehicle_id, driver_id, owner_id, investor_id) VALUES ($1,'TERM-1',$2,$3,$4,$5), ($6,'TERM-2',$7,$8,$9,$10)`, [T1, V1, U.driver, U.owner, U.investor, T2, V2, U.driver2, U.owner2, U.investor2]);
    const tap = (term: string, amt: number, owner: number, inv: number, st: string, at: string) =>
      db.query(`INSERT INTO terminal_taps (terminal_id, amount, owner_settlement, investor_share, vink_fee_device, vink_fee_card, status, scheme, masked_pan, received_at) VALUES ($1,$2,$3,$4,0.5,0.5,$5,'visa','**** 4242',$6)`, [term, amt, owner, inv, st, at]);
    await tap(T1, 20, 19, 0.1, "confirmed", "2026-10-07T08:00:00Z"); await tap(T1, 30, 29, 0.1, "confirmed", "2026-10-06T08:00:00Z");
    await tap(T1, 40, 39, 0.1, "confirmed", "2026-10-02T08:00:00Z"); await tap(T1, 99, 98, 0.1, "declined", "2026-10-07T07:00:00Z"); await tap(T2, 500, 499, 0.1, "confirmed", "2026-10-07T08:00:00Z");
    for (const m of [[U.owner, "vehicle_owner"], [U.driver, "driver"], [U.marshal, "marshal"]]) await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,$3,'active','association')`, [U.assoc, m[0], m[1]]);

    const app = express(); app.use(express.json());
    app.use((req, _r, next) => { req.user = { userId: as, username: "u", role }; next(); });
    app.use("/driver", createDriverRouter(db, () => NOW)); app.use("/owner", createOwnerRouter(db, () => NOW));
    app.use("/marshal", createMarshalRouter(db, () => NOW)); app.use("/association", createAssociationRouter(db, () => NOW)); app.use("/investor", createInvestorRouter(db, () => NOW));
    app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

  const who = (u: string, r: string) => { as = u; role = r; };
  const get = async (p: string) => { const r = await fetch(url + p); return { status: r.status, body: await r.json() as any }; };
  const send = async (m: string, p: string, b?: unknown) => { const r = await fetch(url + p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b ?? {}) }); return { status: r.status, body: await r.json() as any }; };
  const csv = async (p: string) => { const r = await fetch(url + p); return { status: r.status, type: r.headers.get("content-type"), disp: r.headers.get("content-disposition"), text: await r.text() }; };
  const auditActions = async () => (await db.query(`SELECT action FROM audit_log ORDER BY created_at`)).rows.map((x) => String(x.action));

  /* ───────────── driver ───────────── */
  describe("driver", () => {
    it("trips: filtered by status and date, paged with a total, and never carry card data", async () => {
      const all = await get("/driver/trips?from=2026-10-01&to=2026-10-07");
      expect(all.body.total).toBe(4);
      expect(JSON.stringify(all.body)).not.toMatch(/4242|pan/i);
      expect((await get("/driver/trips?from=2026-10-01&to=2026-10-07&status=declined")).body.trips.map((t: any) => t.amount)).toEqual([99]);
      expect((await get("/driver/trips?from=2026-10-06&to=2026-10-07")).body.total).toBe(3);
      const p1 = await get("/driver/trips?from=2026-10-01&to=2026-10-07&limit=2&offset=0"), p2 = await get("/driver/trips?from=2026-10-01&to=2026-10-07&limit=2&offset=2");
      expect([...p1.body.trips, ...p2.body.trips].map((t: any) => t.amount)).toEqual([20, 99, 30, 40]);
      expect((await get("/driver/trips?from=bad")).status).toBe(400);
      who(U.driver2, "driver");
      expect((await get("/driver/trips?from=2026-10-01&to=2026-10-07")).body.trips.map((t: any) => t.amount)).toEqual([500]);   // only their own
    });

    it("trips.csv: right file, only confirmed-and-other rows of mine, and the export is audited", async () => {
      const c = await csv("/driver/trips.csv?from=2026-10-01&to=2026-10-07");
      expect(c.status).toBe(200); expect(c.type).toMatch(/text\/csv/); expect(c.disp).toMatch(/attachment; filename="fares-2026-/);
      const lines = c.text.replace("﻿", "").trim().split("\r\n");
      expect(lines[0]).toBe("When (UTC),Amount,Currency,Card scheme,Status,Terminal"); expect(lines).toHaveLength(5);
      expect(c.text).not.toContain("500");
      expect(await auditActions()).toContain("driver.export.trips");
    });

    it("trend and statements add up confirmed fares per day and list fines", async () => {
      await db.query(`INSERT INTO driver_ledger (driver_id, amount, balance_after, description, created_at) VALUES ($1,-50,-50,'Off-route fine','2026-10-05T10:00:00Z')`, [U.driver]);
      const t = (await get("/driver/trend")).body.days;
      expect(t).toHaveLength(14); expect(t.at(-1)).toMatchObject({ day: "2026-10-07", value: 20, count: 1 });
      const s = (await get("/driver/statements")).body;                            // default: this month so far
      expect(s).toMatchObject({ from: "2026-10-01", to: "2026-10-07", fares: { count: 3, total: 90 }, finesTotal: -50 });
      expect(s.days.map((d: any) => d.day)).toEqual(["2026-10-02", "2026-10-06", "2026-10-07"]);
      const c = await csv("/driver/statements.csv");
      expect(c.text).toContain("Fares collected"); expect(c.text).toMatch(/Fine,Off-route fine,-50/);
    });

    it("power switch: turns my own terminal off and on, is audited, refuses revoked and other people's terminals", async () => {
      expect((await send("POST", "/driver/terminal/power", { terminalId: T1, on: false })).body.status).toBe("inactive");
      expect((await db.query(`SELECT status FROM terminals WHERE id = $1`, [T1])).rows[0].status).toBe("inactive");
      expect((await get("/driver/vehicle")).body.vehicles[0].terminalStatus).toBe("inactive");
      expect((await send("POST", "/driver/terminal/power", { terminalId: T1, on: true })).body.status).toBe("active");
      expect((await send("POST", "/driver/terminal/power", { terminalId: T2, on: false })).status).toBe(404);         // not mine
      expect((await send("POST", "/driver/terminal/power", { terminalId: "x", on: false })).status).toBe(400);
      expect((await send("POST", "/driver/terminal/power", { terminalId: T1, on: "yes" })).status).toBe(400);
      await db.query(`UPDATE terminals SET status = 'revoked' WHERE id = $1`, [T1]);
      const revoked = await send("POST", "/driver/terminal/power", { terminalId: T1, on: true });
      expect(revoked.status).toBe(403);
      expect((await db.query(`SELECT status FROM terminals WHERE id = $1`, [T1])).rows[0].status).toBe("revoked");   // the driver cannot undo a staff revoke
      expect(await auditActions()).toEqual(expect.arrayContaining(["driver.terminal.off", "driver.terminal.on"]));
    });
  });

  /* ───────────── owner ───────────── */
  describe("owner", () => {
    beforeEach(() => who(U.owner, "vehicle_owner"));

    it("summary adds up fares, owner share, platform fees, investor share, fines and levies; CSV matches", async () => {
      await db.query(`INSERT INTO vehicle_positions (id, terminal_id, lat, lng) VALUES ($1,$2,-26.1,28.0)`, [id(300), T1]);
      await db.query(`INSERT INTO vehicle_routes (id, terminal_id, name) VALUES ($1,$2,'R1')`, [id(301), T1]);
      await db.query(`INSERT INTO route_violations (terminal_id, route_id, position_id, distance_from_route_m, fine_amount, created_at) VALUES ($1,$2,$3,500,50,'2026-10-04T10:00:00Z')`, [T1, id(301), id(300)]);
      await db.query(`INSERT INTO levies (association_id, member_id, title, amount, paid_at, created_at) VALUES ($1,$2,'Monthly',150,'2026-10-05T10:00:00Z','2026-10-03T10:00:00Z'), ($1,$2,'Sticker',40,NULL,'2026-10-03T11:00:00Z')`, [U.assoc, U.owner]);
      const s = (await get("/owner/statements")).body;
      expect(s.totals).toEqual({ fares: 3, collected: 90, ownerShare: 87, platformFees: 3, investorShare: 0.3, fines: { count: 1, total: 50 }, levies: { charged: 190, paid: 150 } });
      expect(s.days.map((d: any) => [d.day, d.fares, d.collected, d.ownerShare])).toEqual([["2026-10-02", 1, 40, 39], ["2026-10-06", 1, 30, 29], ["2026-10-07", 1, 20, 19]]);
      const c = await csv("/owner/statements.csv?from=2026-10-01&to=2026-10-07");
      expect(c.text).toContain("TOTAL,3,90,87"); expect(c.text).toContain("Levies charged,,,190");
      who(U.owner2, "vehicle_owner");
      expect((await get("/owner/statements")).body.totals).toMatchObject({ fares: 1, collected: 500, fines: { count: 0 }, levies: { charged: 0 } });   // nothing of owner one's
      const m = (await get("/owner/map")).body;
      who(U.owner, "vehicle_owner");
      const mine = (await get("/owner/map")).body;
      expect(mine.routes.map((r: any) => r.name)).toEqual(["R1"]); expect(mine.positions).toEqual([{ terminalSerial: "TERM-1", registration: "V ONE", lat: -26.1, lng: 28, at: expect.any(String) }]);
      expect(m.routes).toEqual([]); expect(m.positions).toEqual([]);
    });

    it("trend returns 14 zero-filled days with fares and the owner share", async () => {
      const t = (await get("/owner/trend")).body;
      expect(t.days).toHaveLength(14); expect(t.share).toHaveLength(14);
      expect(t.days.at(-1).value).toBe(20); expect(t.share.at(-1)).toBe(19);
    });
  });

  /* ───────────── association ───────────── */
  describe("association", () => {
    beforeEach(() => who(U.assoc, "association"));

    it("members: filter by role, search by name or email, page; other associations see none", async () => {
      expect((await get("/association/members")).body.total).toBe(3);
      expect((await get("/association/members?role=driver")).body.members.map((m: any) => m.name)).toEqual(["Driver One"]);
      expect((await get("/association/members?q=OWNER")).body.members.map((m: any) => m.name)).toEqual(["Owner One"]);
      expect((await get("/association/members?q=%25")).body.total).toBe(0);                 // a literal % is searched for, not treated as a wildcard
      expect((await get("/association/members?limit=2&offset=2")).body.members).toHaveLength(1);
      who(U.assoc2, "association");
      expect((await get("/association/members")).body.total).toBe(0);
    });

    it("vehicles of member owners only, searchable", async () => {
      expect((await get("/association/vehicles")).body.vehicles).toMatchObject([{ registration: "V ONE", owner: "Owner One", driver: "Driver One" }]);
      expect((await get("/association/vehicles?q=two")).body.total).toBe(0);
      expect((await get("/association/terminals")).body.terminals.map((t: any) => t.serial)).toEqual(["TERM-1"]);
    });

    it("routes: created only on a member's terminal with a valid path, editable, with violations, only for the owner association", async () => {
      const good = { terminalId: T1, name: "Soweto - CBD", toleranceMeters: 150, waypoints: [{ lat: -26.27, lng: 27.86 }, { lat: -26.20, lng: 28.05 }] };
      expect((await send("POST", "/association/routes", { ...good, terminalId: T2 })).status).toBe(400);                  // a non-member's terminal
      expect((await send("POST", "/association/routes", { ...good, name: "" })).status).toBe(400);
      expect((await send("POST", "/association/routes", { ...good, waypoints: [{ lat: 1, lng: 1 }] })).status).toBe(400);
      expect((await send("POST", "/association/routes", { ...good, waypoints: [{ lat: 95, lng: 1 }, { lat: 1, lng: 1 }] })).status).toBe(400);
      expect((await send("POST", "/association/routes", { ...good, toleranceMeters: 2 })).status).toBe(400);
      const made = await send("POST", "/association/routes", good);
      expect(made.status).toBe(201);
      const list = (await get("/association/routes")).body.routes;
      expect(list).toMatchObject([{ name: "Soweto - CBD", waypoints: 2, toleranceMeters: 150, terminalSerial: "TERM-1", registration: "V ONE" }]);
      expect((await send("PUT", `/association/routes/${made.body.id}`, { name: "Renamed", active: false, toleranceMeters: 300 })).status).toBe(200);
      expect((await get("/association/routes")).body.routes[0]).toMatchObject({ name: "Renamed", active: false, toleranceMeters: 300 });
      await db.query(`INSERT INTO vehicle_positions (id, terminal_id, lat, lng) VALUES ($1,$2,-26.3,27.9)`, [id(310), T1]);
      await db.query(`INSERT INTO route_violations (terminal_id, route_id, position_id, distance_from_route_m, fine_amount) VALUES ($1,$2,$3,640,50)`, [T1, made.body.id, id(310)]);
      expect((await get(`/association/routes/${made.body.id}/violations`)).body.violations).toMatchObject([{ distanceMeters: 640, fine: 50, registration: "V ONE" }]);
      const m = (await get("/association/map")).body;
      expect(m.routes[0].points).toEqual([{ lat: -26.27, lng: 27.86 }, { lat: -26.2, lng: 28.05 }]);
      who(U.assoc2, "association");
      expect((await send("PUT", `/association/routes/${made.body.id}`, { name: "Hijack", active: true, toleranceMeters: 100 })).status).toBe(404);
      expect((await get(`/association/routes/${made.body.id}/violations`)).status).toBe(404);
      expect((await get("/association/routes")).body.routes).toEqual([]);
      expect(await auditActions()).toEqual(expect.arrayContaining(["association.route.create", "association.route.update"]));
    });

    it("fines ledger, departures trend and the statement with CSV", async () => {
      await db.query(`INSERT INTO association_ledger (association_id, amount, balance_after, description, created_at) VALUES ($1,50,50,'Off-route fine','2026-10-04T10:00:00Z'), ($1,50,100,'Off-route fine','2026-10-05T10:00:00Z')`, [U.assoc]);
      const l = (await get("/association/ledger")).body;
      expect(l).toMatchObject({ total: 2, balance: 100 }); expect(l.entries).toHaveLength(2);
      await db.query(`INSERT INTO levies (association_id, member_id, title, amount, paid_at, created_at) VALUES ($1,$2,'Monthly',150,'2026-10-05T10:00:00Z','2026-10-03T10:00:00Z'), ($1,$3,'Sticker',40,NULL,'2026-10-03T11:00:00Z')`, [U.assoc, U.owner, U.driver]);
      await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'R1')`, [id(320), U.assoc]);
      await db.query(`INSERT INTO departures (rank_id, vehicle_id, marshal_id, passengers, departed_at) VALUES ($1,$2,$3,14,'2026-10-07T07:00:00Z'), ($1,$2,$3,10,'2026-10-06T07:00:00Z')`, [id(320), V1, U.marshal]);
      const t = (await get("/association/trend")).body.days;
      expect(t).toHaveLength(14); expect(t.at(-1)).toEqual({ day: "2026-10-07", departures: 1 });
      const s = (await get("/association/statements")).body;
      expect(s.totals).toEqual({ leviesCharged: 190, leviesCollected: 150, finesCredited: 100, departures: 2, passengers: 24 });
      const c = await csv("/association/statements.csv");
      expect(c.text).toContain("TOTAL,Levies charged,,190,"); expect(c.text).toContain("Fine credited");
      who(U.assoc2, "association");
      expect((await get("/association/ledger")).body.total).toBe(0);
      expect((await get("/association/statements")).body.totals).toMatchObject({ leviesCharged: 0, finesCredited: 0 });
    });

    it("audits approvals, removals and levies", async () => {
      const ranks = await send("POST", "/association/ranks", { name: "R9" }); expect(ranks.status).toBe(201);
      const lv = await send("POST", "/association/levies", { memberId: U.owner, title: "T", amount: 10 });
      await send("POST", `/association/levies/${lv.body.id}/paid`);
      const m = (await get("/association/members?role=marshal")).body.members[0];
      await send("POST", `/association/members/${m.id}/remove`);
      expect(await auditActions()).toEqual(expect.arrayContaining(["association.levy.create", "association.levy.paid", "association.member.remove"]));
    });
  });

  /* ───────────── investor ───────────── */
  describe("investor", () => {
    beforeEach(() => who(U.investor, "investor"));

    it("taps: only mine, filterable, paged, with my income on each; CSV; no card data", async () => {
      const t = (await get("/investor/taps?from=2026-10-01&to=2026-10-07")).body;
      expect(t.total).toBe(4); expect(t.taps[0]).toMatchObject({ terminal: "TERM-1", fare: 20, income: 0.1, status: "confirmed" });
      expect(JSON.stringify(t)).not.toMatch(/4242|pan/i); expect(JSON.stringify(t)).not.toContain("500");
      expect((await get("/investor/taps?from=2026-10-01&to=2026-10-07&status=declined")).body.total).toBe(1);
      expect((await get("/investor/taps?from=2026-10-07&to=2026-10-01")).status).toBe(400);
      const c = await csv("/investor/taps.csv?from=2026-10-01&to=2026-10-07");
      expect(c.text.replace("﻿", "").split("\r\n")[0]).toBe("When (UTC),Terminal,Fare (ZAR),Your income (ZAR),Status");
      expect(await auditActions()).toContain("investor.export.taps");
    });

    it("statement, trend and device health", async () => {
      await db.query(`INSERT INTO device_faults (terminal_id, fault_code, resolved) VALUES ($1,'PRINTER',false), ($1,'GPS',true)`, [T1]);
      expect((await get("/investor/terminals")).body.terminals).toMatchObject([{ serial: "TERM-1", vehicle: "V ONE", openFaults: 1 }]);
      const s = (await get("/investor/statements")).body;
      expect(s.totals).toEqual({ fares: 3, income: 0.3 }); expect(s.perTerminal).toEqual([{ serial: "TERM-1", fares: 3, income: 0.3 }]);
      expect((await csv("/investor/statements.csv")).text).toContain("Terminal TERM-1,3,0.3");
      const t = (await get("/investor/trend")).body.days; expect(t).toHaveLength(14); expect(t.at(-1).value).toBe(0.1);
      who(U.investor2, "investor");
      expect((await get("/investor/statements")).body.totals).toEqual({ fares: 1, income: 0.1 });
    });
  });

  /* ───────────── marshal ───────────── */
  describe("marshal", () => {
    beforeEach(async () => {
      who(U.marshal, "marshal");
      await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Main')`, [id(330), U.assoc]);
      await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2)`, [id(330), U.marshal]);
      for (const [d, p] of [["2026-10-07T07:00:00Z", 14], ["2026-10-06T07:00:00Z", 10], ["2026-09-20T07:00:00Z", 12]] as const)
        await db.query(`INSERT INTO departures (rank_id, vehicle_id, marshal_id, passengers, note, departed_at) VALUES ($1,$2,$3,$4,'=cmd|calc',$5)`, [id(330), V1, U.marshal, p, d]);
    });

    it("departures: date range and paging; the CSV neutralises formula text in notes", async () => {
      expect((await get(`/marshal/ranks/${id(330)}/departures?from=2026-10-01&to=2026-10-07`)).body.total).toBe(2);
      expect((await get(`/marshal/ranks/${id(330)}/departures?from=2026-09-01&to=2026-10-07&limit=2`)).body.departures).toHaveLength(2);
      expect((await get(`/marshal/ranks/${id(330)}/departures?from=oops`)).status).toBe(400);
      const c = await csv(`/marshal/ranks/${id(330)}/departures.csv?from=2026-10-01&to=2026-10-07`);
      expect(c.text).toContain("'=cmd|calc"); expect(c.text).not.toMatch(/,=cmd/);
      expect(await auditActions()).toContain("marshal.export.departures");
      who(U.driver, "marshal");                                        // not assigned to this rank
      expect((await get(`/marshal/ranks/${id(330)}/departures`)).status).toBe(404);
      expect((await csv(`/marshal/ranks/${id(330)}/departures.csv`)).status).toBe(404);
    });

    it("trend and reports (with a custom period and CSV)", async () => {
      const t = (await get(`/marshal/ranks/${id(330)}/trend`)).body.days;
      expect(t.at(-1)).toEqual({ day: "2026-10-07", departures: 1, passengers: 14 });
      const r = (await get("/marshal/reports?from=2026-09-01&to=2026-10-07")).body;
      expect(r.ranks[0].period).toEqual({ departures: 3, passengers: 36 }); expect(r.from).toBe("2026-09-01");
      expect((await get("/marshal/reports")).body.ranks[0].period).toBeUndefined();
      const c = await csv("/marshal/reports.csv?from=2026-09-01&to=2026-10-07");
      expect(c.text).toContain("Main,2026-09-01 to 2026-10-07,3,36");
    });
  });
});
