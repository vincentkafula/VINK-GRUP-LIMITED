import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./driverRoutes.js";
import { createDriverRouter } from "./driverRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import { createMarshalRouter } from "./marshalRoutes.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createInvestorRouter } from "./investorRoutes.js";
import { createPersonalRouter } from "./personalRoutes.js";
import { createLinkRouter } from "./linkRoutes.js";
import { seedDriverDemo } from "./driverDemoSeed.js";
import { seedLinkedDemo } from "./linkedDemoSeed.js";

const NOW = new Date("2026-10-07T10:00:00Z");     // Wednesday, 12:00 in South Africa
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { assoc: id(1), assoc2: id(2), owner: id(3), owner2: id(4), driver: id(5), driver2: id(6), marshal: id(7), investor: id(8), pax: id(9) };

async function users(db: Db) {
  const rows: [string, string, string, string][] = [
    [U.assoc, "assoc", "Assoc One", "assoc1@x.test"], [U.assoc2, "assoc2", "Assoc Two", "assoc2@x.test"],
    [U.owner, "owner", "Owner One", "owner1@x.test"], [U.owner2, "owner2", "Owner Two", "owner2@x.test"],
    [U.driver, "driver", "Driver One", "driver1@x.test"], [U.driver2, "driver2", "Driver Two", "driver2@x.test"],
    [U.marshal, "marshal", "Marshal One", "marshal1@x.test"], [U.investor, "investor", "Investor One", "investor1@x.test"], [U.pax, "pax", "Pax One", "pax1@x.test"],
  ];
  const role: Record<string, string> = { [U.assoc]: "association", [U.assoc2]: "association", [U.owner]: "vehicle_owner", [U.owner2]: "vehicle_owner", [U.driver]: "driver", [U.driver2]: "driver", [U.marshal]: "marshal", [U.investor]: "investor", [U.pax]: "personal" };
  for (const [i, u, n, e] of rows) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, u, n, e, role[i]]);
}

describe("transport portals (real queries on in-memory Postgres)", () => {
  let server: Server, url = "", db: Db, as = U.owner, role = "vehicle_owner";

  beforeEach(async () => {
    db = allPortalsDb(); await users(db); as = U.owner; role = "vehicle_owner";
    const app = express(); app.use(express.json());
    app.use((req, _r, next) => { req.user = { userId: as, username: "u", role }; next(); });
    app.use("/driver", createLinkRouter(db, "driver"), createDriverRouter(db, () => NOW));
    app.use("/owner", createLinkRouter(db, "vehicle_owner"), createOwnerRouter(db, () => NOW));
    app.use("/marshal", createLinkRouter(db, "marshal"), createMarshalRouter(db, () => NOW));
    app.use("/association", createAssociationRouter(db, () => NOW));
    app.use("/investor", createInvestorRouter(db, () => NOW));
    app.use("/personal", createPersonalRouter(db));
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

  const who = (uidv: string, r: string) => { as = uidv; role = r; };
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() as any };
  };
  const get = (p: string) => call("GET", p), post = (p: string, b?: unknown) => call("POST", p, b ?? {}), put = (p: string, b: unknown) => call("PUT", p, b);

  /** association <- owner, driver, marshal all active members; owner has driver; returns nothing. */
  async function connect() {
    for (const [m, r] of [[U.owner, "vehicle_owner"], [U.driver, "driver"], [U.marshal, "marshal"]] as const)
      await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,$3,'active','association')`, [U.assoc, m, r]);
    await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.owner, U.driver]);
  }

  /* ───────────── links ───────────── */
  describe("links need both sides", () => {
    it("an owner asks to join; only that association can approve; then they are members", async () => {
      who(U.owner, "vehicle_owner");
      expect((await post("/owner/associations/request", { email: "assoc1@x.test" })).status).toBe(200);
      expect((await post("/owner/associations/request", { email: "assoc1@x.test" })).status).toBe(409);        // already pending
      expect((await post("/owner/associations/request", { email: "driver1@x.test" })).status).toBe(404);       // not an association
      who(U.assoc2, "association");
      expect((await get("/association/requests")).body.requests).toEqual([]);                                  // another association sees nothing
      who(U.assoc, "association");
      const r = (await get("/association/requests")).body.requests;
      expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ name: "Owner One", role: "vehicle_owner" });
      who(U.assoc2, "association");
      expect((await post(`/association/members/${r[0].id}/respond`, { accept: true })).status).toBe(404);       // not theirs to answer
      who(U.assoc, "association");
      expect((await post(`/association/members/${r[0].id}/respond`, { accept: true })).status).toBe(200);
      expect((await get("/association/members")).body.members).toMatchObject([{ name: "Owner One", role: "vehicle_owner", status: "active" }]);
      expect((await post(`/association/members/${r[0].id}/respond`, { accept: true })).status).toBe(404);       // already answered
    });

    it("an association invites a driver; the driver accepts; nobody else can answer", async () => {
      who(U.assoc, "association");
      expect((await post("/association/members", { email: "driver1@x.test" })).status).toBe(201);
      expect((await post("/association/members", { email: "driver1@x.test" })).status).toBe(409);
      expect((await post("/association/members", { email: "pax1@x.test" })).status).toBe(404);                  // passengers cannot be members
      who(U.driver2, "driver");
      expect((await get("/driver/requests")).body.incoming).toEqual([]);
      who(U.driver, "driver");
      const inc = (await get("/driver/requests")).body.incoming;
      expect(inc).toHaveLength(1); expect(inc[0]).toMatchObject({ kind: "membership", from: "Assoc One" });
      who(U.driver2, "driver");
      expect((await post(`/driver/requests/membership/${inc[0].id}/respond`, { accept: true })).status).toBe(404);
      who(U.driver, "driver");
      expect((await post(`/driver/requests/membership/${inc[0].id}/respond`, { accept: true })).status).toBe(200);
      expect((await get("/driver/requests")).body.links).toMatchObject([{ kind: "membership", with: "Assoc One", status: "active" }]);
    });

    it("declined or removed links can be asked for again; a pending invitation answered by asking back becomes active", async () => {
      who(U.assoc, "association"); await post("/association/members", { email: "driver1@x.test" });
      who(U.driver, "driver"); const inc = (await get("/driver/requests")).body.incoming;
      await post(`/driver/requests/membership/${inc[0].id}/respond`, { accept: false });
      who(U.assoc, "association"); expect((await post("/association/members", { email: "driver1@x.test" })).status).toBe(201);   // asked again after a decline
      who(U.owner, "vehicle_owner"); await post("/owner/associations/request", { email: "assoc1@x.test" });
      who(U.assoc, "association"); expect((await post("/association/members", { email: "owner1@x.test" })).body.message).toMatch(/now a member/);   // they had asked: inviting approves
    });

    it("an owner invites a driver; the driver accepts; the owner can then put them on a vehicle, and the driver sees it", async () => {
      who(U.owner, "vehicle_owner");
      const v = await post("/owner/vehicles", { registration: "ab 12 cd gp", make: "Toyota", seats: 15, disc_expiry: "2026-11-01" });
      expect(v.status).toBe(201);
      expect((await put(`/owner/vehicles/${v.body.id}/driver`, { driverId: U.driver })).status).toBe(400);      // not linked yet
      expect((await post("/owner/drivers", { email: "driver1@x.test" })).status).toBe(201);
      who(U.driver, "driver");
      const inc = (await get("/driver/requests")).body.incoming;
      expect(inc[0]).toMatchObject({ kind: "owner-driver", from: "Owner One" });
      await post(`/driver/requests/owner-driver/${inc[0].id}/respond`, { accept: true });
      who(U.owner, "vehicle_owner");
      expect((await put(`/owner/vehicles/${v.body.id}/driver`, { driverId: U.driver })).status).toBe(200);
      expect((await get("/owner/vehicles")).body.vehicles[0]).toMatchObject({ registration: "AB 12 CD GP", driverName: "Driver One" });
      who(U.driver, "driver");
      expect((await get("/driver/vehicle")).body.vehicles[0]).toMatchObject({ registration: "AB 12 CD GP", terminalSerial: null });
      who(U.owner, "vehicle_owner");
      const link = (await get("/owner/drivers")).body.drivers[0];
      await post(`/owner/drivers/${link.linkId}/remove`);
      expect((await get("/owner/vehicles")).body.vehicles[0].driverId).toBeNull();                              // a removed driver comes off the vehicle
    });

    it("a driver can ask an owner and an association; the owner can answer", async () => {
      who(U.driver, "driver");
      expect((await post("/driver/owners/request", { email: "owner1@x.test" })).status).toBe(200);
      expect((await post("/driver/associations/request", { email: "assoc1@x.test" })).status).toBe(200);
      who(U.owner, "vehicle_owner");
      const inc = (await get("/owner/requests")).body.incoming;
      expect(inc[0]).toMatchObject({ kind: "owner-driver", from: "Driver One", role: "driver" });
      expect((await post(`/owner/requests/owner-driver/${inc[0].id}/respond`, { accept: true })).status).toBe(200);
      who(U.driver, "driver");
      const links = (await get("/driver/requests")).body.links;
      expect(links.map((l: any) => l.kind).sort()).toEqual(["membership", "owner-driver"]);
      const m = links.find((l: any) => l.kind === "membership");
      expect((await post(`/driver/requests/membership/${m.id}/leave`)).status).toBe(200);
    });
  });

  /* ───────────── owner ───────────── */
  describe("owner", () => {
    it("validates vehicles, keeps registrations unique, and one owner cannot touch another's vehicle", async () => {
      who(U.owner, "vehicle_owner");
      expect((await post("/owner/vehicles", { registration: "<b>" })).status).toBe(400);
      expect((await post("/owner/vehicles", { registration: "AB 1", seats: 500 })).status).toBe(400);
      expect((await post("/owner/vehicles", { registration: "AB 1", disc_expiry: "soon" })).status).toBe(400);
      const v = await post("/owner/vehicles", { registration: "AB 1 GP", year: 2020 });
      expect(v.status).toBe(201);
      expect((await post("/owner/vehicles", { registration: "ab 1 gp" })).status).toBe(409);
      who(U.owner2, "vehicle_owner");
      expect((await put(`/owner/vehicles/${v.body.id}`, { registration: "HIJACK" })).status).toBe(404);
      expect((await get("/owner/vehicles")).body.vehicles).toEqual([]);
      who(U.owner, "vehicle_owner");
      expect((await put(`/owner/vehicles/${v.body.id}`, { registration: "AB 1 GP", colour: "Blue" })).status).toBe(200);
      expect((await put(`/owner/vehicles/not-a-uuid`, { registration: "X" })).status).toBe(400);
    });

    it("earnings and reports count only confirmed fares on this owner's vehicles", async () => {
      who(U.owner, "vehicle_owner");
      const v = (await post("/owner/vehicles", { registration: "OWN 1" })).body.id;
      const mine = id(100), theirs = id(101);
      await db.query(`INSERT INTO terminals (id, serial, vehicle_id) VALUES ($1,'T-A',$2)`, [mine, v]);
      await db.query(`INSERT INTO terminals (id, serial) VALUES ($1,'T-B')`, [theirs]);
      const tap = (t: string, amt: number, owner: number, st: string, at: string) => db.query(`INSERT INTO terminal_taps (terminal_id, amount, owner_settlement, status, received_at) VALUES ($1,$2,$3,$4,$5)`, [t, amt, owner, st, at]);
      await tap(mine, 20, 19, "confirmed", "2026-10-07T08:00:00Z"); await tap(mine, 30, 29, "confirmed", "2026-10-02T08:00:00Z");
      await tap(mine, 99, 98, "declined", "2026-10-07T08:00:00Z"); await tap(theirs, 500, 499, "confirmed", "2026-10-07T08:00:00Z");
      const e = (await get("/owner/earnings")).body;
      expect(e.today).toEqual({ count: 1, fares: 20, ownerShare: 19 });
      expect(e.month).toEqual({ count: 2, fares: 50, ownerShare: 48 });
      const r = (await get("/owner/reports")).body.month;
      expect(r.vehicles).toEqual([{ registration: "OWN 1", fares: 50, ownerShare: 48, count: 2 }]);
      who(U.owner2, "vehicle_owner");
      expect((await get("/owner/earnings")).body.month).toEqual({ count: 0, fares: 0, ownerShare: 0 });
    });

    it("compliance documents: validated, scoped to the owner, and they create expiry reminders", async () => {
      who(U.owner, "vehicle_owner");
      expect((await post("/owner/documents", { kind: "" })).status).toBe(400);
      expect((await post("/owner/documents", { kind: "Operating licence", expires_on: "31-12-2026" })).status).toBe(400);
      expect((await post("/owner/documents", { kind: "Operating licence", vehicle_id: id(555) })).status).toBe(400);      // not my vehicle
      const d = await post("/owner/documents", { kind: "Operating licence", reference: "OL-1", expires_on: "2026-10-20" });
      expect(d.status).toBe(201);
      expect((await get("/owner/documents")).body.documents).toMatchObject([{ kind: "Operating licence", expiresOn: "2026-10-20" }]);
      const n = (await get("/owner/notifications")).body;
      expect(n.notifications[0].title).toMatch(/expires in 13 days/); expect(n.unread).toBe(1);
      await post("/owner/notifications/read", { keys: [n.notifications[0].key] });
      expect((await get("/owner/notifications")).body.unread).toBe(0);
      who(U.owner2, "vehicle_owner");
      expect((await get("/owner/documents")).body.documents).toEqual([]);
      expect((await post(`/owner/documents/${d.body.id}/delete`)).status).toBe(404);
      who(U.owner, "vehicle_owner");
      expect((await post(`/owner/documents/${d.body.id}/delete`)).status).toBe(200);
    });
  });

  /* ───────────── association ───────────── */
  describe("association", () => {
    it("ranks: unique names, only active marshal members can be assigned, and other associations cannot touch them", async () => {
      await connect();
      who(U.assoc, "association");
      expect((await post("/association/ranks", { name: "" })).status).toBe(400);
      const r = await post("/association/ranks", { name: "Noord Rank", location: "CBD" });
      expect(r.status).toBe(201);
      expect((await post("/association/ranks", { name: "Noord Rank" })).status).toBe(409);
      expect((await post(`/association/ranks/${r.body.id}/marshals`, { marshalId: U.driver })).status).toBe(400);   // a driver is not a marshal
      expect((await post(`/association/ranks/${r.body.id}/marshals`, { marshalId: U.marshal })).status).toBe(201);
      expect((await post(`/association/ranks/${r.body.id}/marshals`, { marshalId: U.marshal })).status).toBe(409);
      expect((await get("/association/ranks")).body.ranks[0]).toMatchObject({ name: "Noord Rank", marshals: [{ name: "Marshal One" }], waiting: 0 });
      who(U.assoc2, "association");
      expect((await put(`/association/ranks/${r.body.id}`, { name: "Mine now", location: "", active: true })).status).toBe(404);
      expect((await post(`/association/ranks/${r.body.id}/marshals`, { marshalId: U.marshal })).status).toBe(404);
      expect((await get("/association/ranks")).body.ranks).toEqual([]);
    });

    it("levies: amounts are typed in, only members can be charged, paid levies are kept, reports add them up", async () => {
      await connect();
      who(U.assoc, "association");
      expect((await post("/association/levies", { memberId: U.owner, title: "Monthly", amount: 0 })).status).toBe(400);
      expect((await post("/association/levies", { memberId: U.owner, title: "Monthly", amount: -5 })).status).toBe(400);
      expect((await post("/association/levies", { memberId: U.owner, title: "Monthly", amount: 100, dueDate: "x" })).status).toBe(400);
      expect((await post("/association/levies", { memberId: U.owner2, title: "Monthly", amount: 100 })).status).toBe(400);   // not a member
      const a = await post("/association/levies", { memberId: U.owner, title: "Monthly", amount: 150.5, dueDate: "2026-10-31" });
      const b = await post("/association/levies", { memberId: U.driver, title: "Sticker", amount: 40 });
      expect(a.status).toBe(201);
      await post(`/association/levies/${b.body.id}/paid`);
      expect((await post(`/association/levies/${b.body.id}/paid`)).status).toBe(404);                                       // already paid
      expect((await post(`/association/levies/${b.body.id}/delete`)).status).toBe(404);                                     // paid levies stay
      const rep = (await get("/association/reports")).body;
      expect(rep.levies).toEqual({ outstanding: 150.5, paid: 40, open: 1 });
      expect(rep.members).toMatchObject({ owners: 1, drivers: 1, marshals: 1 });
      who(U.assoc2, "association");
      expect((await get("/association/levies")).body.levies).toEqual([]);
      expect((await post(`/association/levies/${a.body.id}/delete`)).status).toBe(404);
      who(U.assoc, "association");
      expect((await post(`/association/levies/${a.body.id}/delete`)).status).toBe(200);
    });

    it("removing a marshal member takes them off the ranks", async () => {
      await connect(); who(U.assoc, "association");
      const rank = (await post("/association/ranks", { name: "R1" })).body.id;
      await post(`/association/ranks/${rank}/marshals`, { marshalId: U.marshal });
      const m = (await get("/association/members")).body.members.find((x: any) => x.role === "marshal");
      await post(`/association/members/${m.id}/remove`);
      expect((await get("/association/ranks")).body.ranks[0].marshals).toEqual([]);
    });
  });

  /* ───────────── marshal ───────────── */
  describe("marshal", () => {
    async function setup() {
      await connect();
      who(U.assoc, "association");
      const rank = (await post("/association/ranks", { name: "Main Rank" })).body.id as string;
      await post(`/association/ranks/${rank}/marshals`, { marshalId: U.marshal });
      const veh = async (reg: string, owner: string, driver: string | null) => (await db.query(`INSERT INTO vehicles (owner_id, registration, driver_id) VALUES ($1,$2,$3) RETURNING id`, [owner, reg, driver])).rows[0].id as string;
      const v1 = await veh("Q 1", U.owner, U.driver), v2 = await veh("Q 2", U.owner, null), outsider = await veh("OUT 1", U.owner2, null);
      who(U.marshal, "marshal");
      return { rank, v1, v2, outsider };
    }

    it("only works at assigned ranks, only queues vehicles of the association's members, one queue per vehicle", async () => {
      const { rank, v1, v2, outsider } = await setup();
      expect((await get("/marshal/ranks")).body.ranks).toMatchObject([{ name: "Main Rank", association: "Assoc One", waiting: 0 }]);
      expect((await post(`/marshal/ranks/${rank}/queue`, { vehicleId: outsider })).status).toBe(400);
      expect((await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v1 })).status).toBe(201);
      expect((await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v1 })).status).toBe(409);
      expect((await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v2 })).status).toBe(201);
      const q = (await get(`/marshal/ranks/${rank}/queue`)).body.queue;
      expect(q.map((x: any) => [x.position, x.registration, x.driver])).toEqual([[1, "Q 1", "Driver One"], [2, "Q 2", null]]);
      const list = (await get(`/marshal/ranks/${rank}/vehicles`)).body.vehicles;
      expect(list.map((x: any) => x.registration)).toEqual(["Q 1", "Q 2"]);               // the outsider's vehicle is not listed
      expect(list.every((x: any) => x.inQueue)).toBe(true);
      who(U.assoc, "association");
      expect((await get(`/marshal/ranks`)).status).toBe(200);                                // (route exists but is the marshal's; the real guard is the role, tested elsewhere)
      who(U.driver2, "marshal");                                                             // a marshal with no rank assignment
      expect((await get(`/marshal/ranks/${rank}/queue`)).status).toBe(404);
      expect((await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v2 })).status).toBe(404);
      expect((await get("/marshal/ranks")).body.ranks).toEqual([]);
    });

    it("departing logs the departure with the vehicle's driver; first in line by default; a double click logs once", async () => {
      const { rank, v1, v2 } = await setup();
      await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v1 }); await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v2 });
      expect((await post(`/marshal/ranks/${rank}/depart`, { passengers: 999 })).status).toBe(400);
      expect((await post(`/marshal/ranks/${rank}/depart`, { note: "x".repeat(201) })).status).toBe(400);
      const [a, b] = await Promise.all([post(`/marshal/ranks/${rank}/depart`, { passengers: 14, note: "Full" }), post(`/marshal/ranks/${rank}/depart`, { passengers: 14 })]);
      expect([a.status, b.status].sort()).toEqual([201, 201]);                                // two requests = two vehicles leave (first, then second)
      expect((await post(`/marshal/ranks/${rank}/depart`)).status).toBe(409);                  // nobody left in line
      const deps = (await get(`/marshal/ranks/${rank}/departures`)).body.departures;
      expect(deps).toHaveLength(2);
      expect(deps.map((d: any) => d.registration).sort()).toEqual(["Q 1", "Q 2"]);
      expect(deps.find((d: any) => d.registration === "Q 1").driver).toBe("Driver One");
      await db.query(`UPDATE departures SET departed_at = $1`, [new Date(NOW.getTime() - 3600_000)]);        // stamp with the test clock (the database default is the real clock)
      const rep = (await get("/marshal/reports")).body.ranks[0];
      expect(rep).toMatchObject({ rank: "Main Rank", today: { departures: 2, passengers: 28 } });
      // the same queue entry cannot depart twice
      await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v1 });
      const entry = (await get(`/marshal/ranks/${rank}/queue`)).body.queue[0].id;
      expect((await post(`/marshal/ranks/${rank}/depart`, { queueId: entry })).status).toBe(201);
      expect((await post(`/marshal/ranks/${rank}/depart`, { queueId: entry })).status).toBe(409);
    });

    it("a vehicle can be taken out of the line without a departure", async () => {
      const { rank, v1 } = await setup();
      await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v1 });
      const entry = (await get(`/marshal/ranks/${rank}/queue`)).body.queue[0].id;
      expect((await post(`/marshal/ranks/${rank}/queue/${entry}/remove`)).status).toBe(200);
      expect((await post(`/marshal/ranks/${rank}/queue/${entry}/remove`)).status).toBe(404);
      expect((await get(`/marshal/ranks/${rank}/departures`)).body.departures).toEqual([]);
      expect((await post(`/marshal/ranks/${rank}/queue`, { vehicleId: v1 })).status).toBe(201);   // free to queue again
    });
  });

  /* ───────────── investor and personal ───────────── */
  describe("investor", () => {
    it("sees only their terminals and the income stored on each confirmed fare", async () => {
      await db.query(`INSERT INTO terminals (id, serial, investor_id) VALUES ($1,'INV-1',$2), ($3,'INV-2',$4)`, [id(200), U.investor, id(201), id(999)]);
      const tap = (t: string, share: number, st: string, at: string) => db.query(`INSERT INTO terminal_taps (terminal_id, amount, investor_share, status, received_at) VALUES ($1,20,$2,$3,$4)`, [t, share, st, at]);
      await tap(id(200), 0.1, "confirmed", "2026-10-07T08:00:00Z"); await tap(id(200), 0.1, "confirmed", "2026-10-06T08:00:00Z"); await tap(id(200), 0.1, "declined", "2026-10-07T08:00:00Z"); await tap(id(201), 0.1, "confirmed", "2026-10-07T08:00:00Z");
      who(U.investor, "investor");
      expect((await get("/investor/terminals")).body.terminals.map((t: any) => t.serial)).toEqual(["INV-1"]);
      const inc = (await get("/investor/income")).body;
      expect(inc.today).toEqual({ fares: 1, income: 0.1 }); expect(inc.week.fares).toBe(2); expect(inc.perTerminal).toEqual([{ serial: "INV-1", fares: 2, income: 0.2 }]);
      expect(inc.recent).toHaveLength(2);
      who(id(998), "investor");
      expect((await get("/investor/income")).body.month).toEqual({ fares: 0, income: 0 });
    });
  });

  describe("personal", () => {
    it("saves profile details with validation, and keeps them private", async () => {
      who(U.pax, "personal");
      expect((await get("/personal/profile")).body.user.name).toBe("Pax One");
      expect((await put("/personal/profile", { phone: "abc" })).status).toBe(400);
      expect((await put("/personal/profile", { home_area: "x".repeat(200) })).status).toBe(400);
      expect((await put("/personal/profile", { phone: "082 123 4567", home_area: "Soweto", emergency_contact_name: "Mum", emergency_contact_phone: "+27 11 555 0100" })).status).toBe(200);
      expect((await get("/personal/profile")).body.profile).toMatchObject({ phone: "082 123 4567", homeArea: "Soweto", emergencyContactName: "Mum" });
      who(id(997), "personal");
      expect((await get("/personal/profile")).body.profile.phone).toBeNull();
    });

    it("support requests: validated, listed for the sender only, and capped at 10 open", async () => {
      who(U.pax, "personal");
      expect((await post("/personal/support", { subject: "", message: "x" })).status).toBe(400);
      expect((await post("/personal/support", { subject: "Refund", message: "x".repeat(2001) })).status).toBe(400);
      expect((await post("/personal/support", { subject: "Lost item", message: "I left a bag." })).status).toBe(201);
      expect((await get("/personal/support")).body.requests).toMatchObject([{ subject: "Lost item", status: "open" }]);
      who(id(997), "personal");
      expect((await get("/personal/support")).body.requests).toEqual([]);
      who(U.pax, "personal");
      for (let i = 0; i < 9; i++) await post("/personal/support", { subject: `S${i}`, message: "m" });
      expect((await post("/personal/support", { subject: "one too many", message: "m" })).status).toBe(429);
    });
  });
});

describe("linked demo data", () => {
  const ENV = {
    SEED_ENABLED: "true", SEED_DRIVER_EMAIL: "driver1@x.test", SEED_OWNER_EMAIL: "owner1@x.test", SEED_MARSHAL_EMAIL: "marshal1@x.test",
    SEED_ASSOCIATION_EMAIL: "assoc1@x.test", SEED_INVESTOR_EMAIL: "investor1@x.test",
  } as unknown as NodeJS.ProcessEnv;

  it("connects every test account through the demo vehicle and rank, and is idempotent", async () => {
    const db = allPortalsDb(); await users(db);
    for (let i = 0; i < 2; i++) { await seedDriverDemo(db, ENV, () => {}, NOW); await seedLinkedDemo(db, ENV, () => {}, NOW); }
    const n = async (t: string, w = "true") => Number((await db.query(`SELECT COUNT(*) AS n FROM ${t} WHERE ${w}`)).rows[0].n);
    expect(await n("memberships", "status = 'active'")).toBe(3);
    expect(await n("owner_drivers")).toBe(1); expect(await n("ranks")).toBe(1); expect(await n("rank_marshals")).toBe(1);
    expect(await n("departures")).toBe(3); expect(await n("rank_queue", "left_at IS NULL")).toBe(1);
    expect(await n("levies")).toBe(1); expect(await n("compliance_documents")).toBe(1);
    const veh = (await db.query(`SELECT owner_id, driver_id FROM vehicles WHERE registration = 'DEMO 001 GP'`)).rows[0];
    expect(veh).toEqual({ owner_id: U.owner, driver_id: U.driver });
    expect(await n("terminals", `investor_id = '${U.investor}' AND owner_id = '${U.owner}'`)).toBe(1);
    expect(await n("terminal_taps", "investor_share = 0.10")).toBe(12);
  });

  it("does nothing outside the seed switch", async () => {
    const db = allPortalsDb(); await users(db);
    await seedDriverDemo(db, ENV, () => {}, NOW);
    await seedLinkedDemo(db, { ...ENV, SEED_ENABLED: "", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv, () => {}, NOW);
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM memberships`)).rows[0].n)).toBe(0);
  });
});
