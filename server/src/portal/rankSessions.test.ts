import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRankSessions, checkRankDevice, PAIR_WINDOW_MS } from "./rankSessions.js";
import { createMarshalRouter } from "./marshalRoutes.js";
import { createDriverRouter } from "./driverRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import { cardHash } from "../services/tokenService.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Loading sessions on a shared rank device, on a real (in-memory) Postgres: the marshal opens a session, the DRIVER pairs it with their own card, the vehicle departs and the next one loads.
 */
/** an audit entry's details: real JSON on a real PostgreSQL, text on the in-memory one */
const det = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as any;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { assoc: id(1), owner: id(2), owner2: id(3), driver: id(4), driver2: id(5), driver3: id(6), marshal: id(7), marshal2: id(8), pax: id(9) };
const CARD = { driver: "04A1B2C3D4", driver2: "04E5F6A7B8", driver3: "04C0FFEE01", pax: "04D00DFEED", stranger: "04DEADBEEF" };
let clock = new Date("2026-10-07T10:00:00Z");

async function world() {
  const db = allPortalsDb(); clock = new Date("2026-10-07T10:00:00Z");
  const names: [string, string, string, string][] = [[U.assoc, "assoc", "Association", "assoc@x.test"], [U.owner, "owner", "Owner One", "o1@x.test"], [U.owner2, "owner2", "Owner Two", "o2@x.test"], [U.driver, "driver", "Driver One", "d1@x.test"], [U.driver2, "driver2", "Driver Two", "d2@x.test"], [U.driver3, "driver3", "Driver Three", "d3@x.test"], [U.marshal, "marshal", "Marshal One", "m1@x.test"], [U.marshal2, "marshal2", "Marshal Two", "m2@x.test"], [U.pax, "pax", "Passenger", "p@x.test"]];
  const role: Record<string, string> = { [U.assoc]: "association", [U.owner]: "vehicle_owner", [U.owner2]: "vehicle_owner", [U.driver]: "driver", [U.driver2]: "driver", [U.driver3]: "driver", [U.marshal]: "marshal", [U.marshal2]: "marshal", [U.pax]: "personal" };
  for (const [i, u, n, e] of names) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, u, n, e, role[i]]);
  const rank = (await db.query(`INSERT INTO ranks (association_id, name, location) VALUES ($1,'Langa rank','Langa') RETURNING id`, [U.assoc])).rows[0].id as string;
  const rank2 = (await db.query(`INSERT INTO ranks (association_id, name, location) VALUES ($1,'Bellville rank','Bellville') RETURNING id`, [U.assoc])).rows[0].id as string;
  await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2)`, [rank, U.marshal]);
  const route = (await db.query(`INSERT INTO token_routes (association_id, name, fare_cents, from_rank_id, to_rank_id) VALUES ($1,'Langa to Bellville',2500,$2,$3) RETURNING id`, [U.assoc, rank, rank2])).rows[0].id as string;
  const veh = async (reg: string, owner: string, driver: string | null) => (await db.query(`INSERT INTO vehicles (owner_id, registration, seats, driver_id) VALUES ($1,$2,15,$3) RETURNING id`, [owner, reg, driver])).rows[0].id as string;
  const v1 = await veh("CA 111-111", U.owner, null), v2 = await veh("CA 222-222", U.owner, U.driver2), v3 = await veh("CA 333-333", U.owner2, null);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.owner, U.driver]);          // driver is one of owner's active drivers
  const queue = async (rk: string, v: string) => (await db.query(`INSERT INTO rank_queue (rank_id, vehicle_id, joined_at) VALUES ($1,$2,$3) RETURNING id`, [rk, v, new Date(clock.getTime() + (queue.n++) * 1000)])).rows[0].id as string; queue.n = 0;
  const device = async (serial: string, o: { kind?: string; rankId?: string | null; status?: string } = {}) => (await db.query(`INSERT INTO terminals (serial, kind, rank_id, route_id, status) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [serial, o.kind ?? "rank", o.rankId === undefined ? rank : o.rankId, route, o.status ?? "active"])).rows[0].id as string;
  const wallet = async (user: string, r: string) => (await db.query(`INSERT INTO token_wallets (user_id, currency, role) VALUES ($1,'ZAR',$2) RETURNING id`, [user, r])).rows[0].id as string;
  const card = async (w: string, uid: string, status = "active") => (await db.query(`INSERT INTO token_cards (wallet_id, card_hash, last4, status) VALUES ($1,$2,$3,$4) RETURNING id`, [w, cardHash(uid), uid.slice(-4), status])).rows[0].id as string;
  await card(await wallet(U.driver, "driver"), CARD.driver); await card(await wallet(U.driver2, "driver"), CARD.driver2); await card(await wallet(U.driver3, "driver"), CARD.driver3); await card(await wallet(U.pax, "passenger"), CARD.pax);
  const rs = createRankSessions(db as Db, () => clock);
  const audit = async (action?: string) => (await db.query(`SELECT action, target, actor_name, details FROM audit_log ${action ? "WHERE action = $1" : ""} ORDER BY created_at, id`, action ? [action] : [])).rows as any[];
  return { db: db as Db, rank, rank2, route, v1, v2, v3, queue, device, wallet, card, rs, audit };
}
type W = Awaited<ReturnType<typeof world>>;
const ok = <T,>(r: { ok: boolean } & any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value as T; };
const refused = (r: any, status: number, code: string) => { expect(r).toMatchObject({ ok: false, status, code }); };
/** open a session for the front vehicle on a fresh device, ready to pair */
async function opened(w: W, serial = "RK-1") { const d = await w.device(serial); const q = await w.queue(w.rank, w.v1); const s = ok<any>(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "marshal", terminalId: d })); return { d, q, s }; }

describe("opening a session", () => {
  it("starts a pending session for the vehicle at the front of the queue, on the rank's device, and the device now waits for the driver", async () => {
    const w = await world(); const d = await w.device("RK-1"); const q1 = await w.queue(w.rank, w.v1); await w.queue(w.rank, w.v2);
    const s = ok<any>(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "marshal", terminalId: d }));
    expect(s).toMatchObject({ status: "pending", terminalId: d, vehicleId: w.v1, registration: "CA 111-111", routeId: w.route, driverId: null, passengers: 0, totalCents: 0 });
    expect((await w.rs.board(w.rank)).queue.map((q) => [q.registration, q.status])).toEqual([["CA 111-111", "pairing"], ["CA 222-222", "waiting"]]); expect(q1).toBeTruthy();
  });
  it("opens the next vehicle, not the one already loading, when asked again on another device, and can open a named vehicle", async () => {
    const w = await world(); const d1 = await w.device("RK-1"), d2 = await w.device("RK-2"); await w.queue(w.rank, w.v1); const q2 = await w.queue(w.rank, w.v2); await w.queue(w.rank, w.v3);
    ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d1 }));
    expect(ok<any>(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d2 })).vehicleId).toBe(w.v2);
    const d3 = await w.device("RK-3"); expect(ok<any>(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d3, queueId: (await w.rs.board(w.rank)).queue[2].id })).vehicleId).toBe(w.v3); expect(q2).toBeTruthy();
  });
  it("refuses: a device that is not a shared device at this rank, an inactive one, one already loading, a vehicle already loading, and an empty queue", async () => {
    const w = await world(); await w.queue(w.rank, w.v1); const open = (terminalId: string, queueId?: string) => w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId, queueId });
    refused(await open(await w.device("V-1", { kind: "vehicle", rankId: null })), 404, "device");        // a device on a vehicle is not a rank device
    refused(await open(await w.device("R-2", { rankId: w.rank2 })), 404, "device");                      // a device at another rank
    refused(await open(await w.device("R-3", { status: "inactive" })), 409, "device_inactive");
    const d = await w.device("R-4"); ok(await open(d)); refused(await open(d), 409, "device_busy");
    const d5 = await w.device("R-5"); refused(await open(d5), 409, "queue");                              // the only vehicle is already loading, so nobody else is waiting
    const q = (await w.rs.board(w.rank)).queue[0].id; refused(await open(d5, q), 409, "vehicle_busy");
    const e = await world(); refused(await e.rs.open({ rankId: e.rank, marshalId: U.marshal, actorName: "m", terminalId: await e.device("E-1") }), 409, "queue");
  });
  it("lets only one of two simultaneous requests pair the same driver, on two devices (the database decides the race)", async () => {
    const w = await world(); const d1 = await w.device("RK-1"), d2 = await w.device("RK-2"); await w.queue(w.rank, w.v1); await w.queue(w.rank, w.v2); await w.db.query(`UPDATE vehicles SET driver_id = $1 WHERE id = $2`, [U.driver, w.v2]);
    ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d1 })); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d2 }));
    const [a, b] = await Promise.all([w.rs.pair({ terminalId: d1, serial: "RK-1", cardUid: CARD.driver }), w.rs.pair({ terminalId: d2, serial: "RK-2", cardUid: CARD.driver })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1); expect((await w.db.query(`SELECT COUNT(*) AS n FROM loading_sessions WHERE status = 'loading'`)).rows[0].n).toBe(1);
  });
  it.runIf(!!process.env.TEST_PG_URL)("lets only one of many simultaneous pairings of the same driver through, on different devices and vehicles (only the driver's own rule can stop them)", async () => {
    const w = await world(); const ds = await Promise.all([1, 2, 3].map((i) => w.device(`RK-${i}`))); for (const v of [w.v1, w.v2, w.v3]) { await w.queue(w.rank, v); await w.db.query(`UPDATE vehicles SET driver_id = $1 WHERE id = $2`, [U.driver, v]); }
    for (const t of ds) ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: t }));
    const r = await Promise.allSettled(ds.flatMap((t, i) => [1, 2].map(() => w.rs.pair({ terminalId: t, serial: `RK-${i + 1}`, cardUid: CARD.driver }))));
    expect(r.every((x) => x.status === "fulfilled")).toBe(true); expect((await w.db.query(`SELECT COUNT(*) AS n FROM loading_sessions WHERE status = 'loading'`)).rows[0].n).toBe(1);
  });
  it("refuses a device or a vehicle that is already loading, in plain words", async () => {
    const w = await world(); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1); await w.queue(w.rank, w.v2); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d }));
    refused(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d }), 409, "device_busy"); const d2 = await w.device("RK-2"); const first = (await w.rs.board(w.rank)).queue[0].id;
    refused(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d2, queueId: first }), 409, "vehicle_busy");
  });
  it("cancels a session nobody paired after the window, so a forgotten one can never block the device", async () => {
    const w = await world(); const { d } = await opened(w); clock = new Date(clock.getTime() + PAIR_WINDOW_MS + 1000);
    refused(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }), 409, "no_session");
    expect((await w.audit("rank.session_expired")).length).toBe(1); const again = await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d }); expect(again.ok).toBe(true);
  });
});

describe("pairing needs the driver's own card", () => {
  it("pairs when the owner's driver taps their card, and records who and what", async () => {
    const w = await world(); const { d, s } = await opened(w);
    const p = ok<any>(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver })); expect(p).toMatchObject({ id: s.id, status: "loading", driverId: U.driver, driverName: "Driver One", replayed: false }); expect(p.pairedAt).toBeTruthy();
    expect((await w.rs.board(w.rank)).queue[0]).toMatchObject({ status: "loading", driverName: "Driver One" });
    expect((await w.audit("rank.paired"))[0]).toMatchObject({ target: s.id, actor_name: "terminal:RK-1" });
  });
  it("pairs the driver the owner put on that vehicle, even without an owner link", async () => {
    const w = await world(); const d = await w.device("RK-1"); await w.queue(w.rank, w.v2); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d }));
    expect(ok<any>(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver2 })).driverId).toBe(U.driver2);
  });
  it("does not pair without a card: the session stays waiting and nobody is attached", async () => {
    const w = await world(); const { d, s } = await opened(w);
    refused(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: undefined }), 400, "bad_card"); refused(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: "" }), 400, "bad_card");
    expect((await w.rs.board(w.rank)).queue[0]).toMatchObject({ status: "pairing", driverName: null, sessionId: s.id });
  });
  it("refuses a card that is not registered, a blocked or lost card, a passenger's card, and a driver who is not on this vehicle, and says why each time", async () => {
    const w = await world(); const { d } = await opened(w); const tap = (cardUid: string) => w.rs.pair({ terminalId: d, serial: "RK-1", cardUid });
    refused(await tap(CARD.stranger), 404, "card_unknown");
    refused(await tap(CARD.pax), 403, "not_driver_card");
    refused(await tap(CARD.driver2), 403, "wrong_driver");                                     // driver two drives a different vehicle for the same owner, but is not one of this owner's drivers
    await w.db.query(`UPDATE token_cards SET status = 'lost' WHERE card_hash = $1`, [cardHash(CARD.driver)]); refused(await tap(CARD.driver), 403, "card_blocked");
    await w.db.query(`UPDATE token_cards SET status = 'active' WHERE card_hash = $1`, [cardHash(CARD.driver)]); await w.db.query(`UPDATE token_wallets SET status = 'frozen' WHERE user_id = $1`, [U.driver]); refused(await tap(CARD.driver), 403, "card_blocked");
    expect((await w.rs.board(w.rank)).queue[0].status).toBe("pairing");                          // none of those paired it
    const refusals = await w.audit("rank.pair_refused"); expect(refusals.map((r: any) => det(r.details).reason)).toEqual(["card_unknown", "not_driver_card", "wrong_driver", "card_blocked", "card_blocked"]);
    expect(JSON.stringify(refusals)).not.toContain(CARD.driver);                                   // only the last four characters of a card are ever logged
  });
  it("says so when the device has no vehicle waiting", async () => {
    const w = await world(); const d = await w.device("RK-1"); refused(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }), 409, "no_session");
  });
  it("answers the same driver tapping again as before (a retry), but refuses a different driver on a device that is already loading", async () => {
    const w = await world(); const { d } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    expect(ok<any>(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }))).toMatchObject({ status: "loading", driverId: U.driver, replayed: true });
    await w.db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.owner, U.driver3]);
    refused(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver3 }), 409, "device_busy");
    expect((await w.audit("rank.paired")).length).toBe(1);                                          // a retry is not paired twice
  });
  it("does not let one driver load two vehicles at once", async () => {
    const w = await world(); const { d } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    await w.db.query(`UPDATE vehicles SET owner_id = $1, driver_id = $2 WHERE id = $3`, [U.owner, U.driver, w.v2]);                  // the same driver is on a second vehicle too
    const d2 = await w.device("RK-2"); await w.queue(w.rank, w.v2); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d2 }));
    refused(await w.rs.pair({ terminalId: d2, serial: "RK-2", cardUid: CARD.driver }), 409, "driver_busy");
  });
});

describe("ending a session", () => {
  it("departs: closes the session, logs the departure with the driver and marshal, and the vehicle leaves the queue so the next one can load", async () => {
    const w = await world(); const { d, s } = await opened(w); await w.queue(w.rank, w.v2); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    const closed = ok<any>(await w.rs.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "marshal", passengers: 14, note: "full" }));
    expect(closed).toMatchObject({ status: "closed", passengers: 14 }); expect(closed.departureId).toBeTruthy(); expect(closed.endedAt).toBeTruthy();
    const dep = (await w.db.query(`SELECT * FROM departures WHERE id = $1`, [closed.departureId])).rows[0]; expect(dep).toMatchObject({ rank_id: w.rank, vehicle_id: w.v1, driver_id: U.driver, marshal_id: U.marshal, passengers: 14, note: "full" });
    expect((await w.rs.board(w.rank)).queue.map((q) => [q.registration, q.status])).toEqual([["CA 222-222", "waiting"]]);
    const next = ok<any>(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "marshal", terminalId: d })); expect(next.vehicleId).toBe(w.v2);   // the same device loads the next vehicle at once
    expect((await w.audit("rank.session_close"))[0]).toMatchObject({ target: s.id });
  });
  it("counts a repeated Depart once: one departure, whatever number of times it is pressed", async () => {
    const w = await world(); const { d, s } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    const a = ok<any>(await w.rs.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" })), b = ok<any>(await w.rs.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" }));
    expect(b.departureId).toBe(a.departureId); expect((await w.db.query(`SELECT COUNT(*) AS n FROM departures`)).rows[0].n).toBe(1);
  });
  it("lets only one of two simultaneous Departs go through", async () => {
    const w = await world(); const { d, s } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    await Promise.all([1, 2].map(() => w.rs.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" }))); expect(Number((await w.db.query(`SELECT COUNT(*) AS n FROM departures`)).rows[0].n)).toBe(1);
  });
  it("will not depart a vehicle that has not paired, but cancels it", async () => {
    const w = await world(); const { s } = await opened(w);
    refused(await w.rs.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" }), 409, "not_loading");
    expect(ok<any>(await w.rs.cancel({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m", reason: "wrong vehicle" })).status).toBe("cancelled");
    expect((await w.rs.board(w.rank)).queue[0].status).toBe("waiting");                           // it keeps its place in the queue
    expect((await w.audit("rank.session_cancel"))[0]).toMatchObject({ target: s.id }); expect((await w.db.query(`SELECT COUNT(*) AS n FROM departures`)).rows[0].n).toBe(0);
  });
  it("cancels a loading session with no payments, but refuses once passengers have paid, and a departed one", async () => {
    const w = await world(); const { d, s } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    await w.db.query(`UPDATE loading_sessions SET total_cents = 2500, passengers = 1 WHERE id = $1`, [s.id]);
    refused(await w.rs.cancel({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" }), 409, "has_payments");
    ok(await w.rs.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" })); refused(await w.rs.cancel({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" }), 409, "closed");
  });
  it("keeps one rank's sessions out of another's", async () => {
    const w = await world(); const { s } = await opened(w); refused(await w.rs.close({ sessionId: s.id, rankId: w.rank2, marshalId: U.marshal, actorName: "m" }), 404, "session"); refused(await w.rs.cancel({ sessionId: s.id, rankId: w.rank2, marshalId: U.marshal, actorName: "m" }), 404, "session");
  });
});

describe("the rank board", () => {
  it("shows each device, whether it is online and what it is loading", async () => {
    const w = await world(); const d1 = await w.device("RK-1"), d2 = await w.device("RK-2"); await w.device("ELSEWHERE", { rankId: w.rank2 }); await w.queue(w.rank, w.v1);
    await w.db.query(`UPDATE terminals SET last_seen_at = $2 WHERE id = $1`, [d1, new Date(clock.getTime() - 60_000)]); await w.db.query(`UPDATE terminals SET last_seen_at = $2 WHERE id = $1`, [d2, new Date(clock.getTime() - 20 * 60_000)]);
    const s = ok<any>(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d1 })); const b = await w.rs.board(w.rank);
    expect(b.devices.map((x) => [x.serial, x.online, x.sessionId])).toEqual([["RK-1", true, s.id], ["RK-2", false, null]]);
  });
});

describe("the marshal's routes", () => {
  let server: Server, url = "", w: W, as = U.marshal;
  beforeEach(async () => {
    w = await world(); as = U.marshal; const app = express(); app.use(express.json());
    app.use((req, _r, next) => { (req as any).user = { userId: as, username: "marshal", role: "marshal" }; next(); }); app.use("/marshal", createMarshalRouter(w.db, () => clock));
    app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
    await new Promise<void>((ok2) => { server = app.listen(0, "127.0.0.1", ok2); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok2) => server.close(() => ok2())));
  const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any }; };

  it("runs a whole load: open, driver pairs on the device, depart, and the departure shows in the rank's list", async () => {
    const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    expect((await call("GET", `/marshal/ranks/${w.rank}/loading`)).body.queue[0].status).toBe("waiting");
    const open = await call("POST", `/marshal/ranks/${w.rank}/sessions`, { terminalId: d }); expect(open).toMatchObject({ status: 201, body: { success: true, session: { status: "pending", registration: "CA 111-111" } } });
    ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));                    // the device reports the driver's card
    expect((await call("GET", `/marshal/ranks/${w.rank}/loading`)).body.queue[0]).toMatchObject({ status: "loading", driverName: "Driver One" });
    const close = await call("POST", `/marshal/ranks/${w.rank}/sessions/${open.body.session.id}/close`, { passengers: 15, note: "full" }); expect(close).toMatchObject({ status: 200, body: { session: { status: "closed", passengers: 15 } } });
    expect((await call("GET", `/marshal/ranks/${w.rank}/departures`)).body.departures[0]).toMatchObject({ registration: "CA 111-111", driver: "Driver One", passengers: 15 });
  });
  it("is only for a marshal assigned to the rank, and checks what it is given", async () => {
    const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    as = U.marshal2; for (const [m, p, b] of [["GET", `/marshal/ranks/${w.rank}/loading`, undefined], ["POST", `/marshal/ranks/${w.rank}/sessions`, { terminalId: d }]] as const) expect((await call(m, p, b)).status, p).toBe(404);
    as = U.marshal; expect((await call("POST", `/marshal/ranks/${w.rank}/sessions`, {})).status).toBe(400); expect((await call("POST", `/marshal/ranks/${w.rank}/sessions`, { terminalId: d, queueId: "nope" })).status).toBe(400);
    expect((await call("POST", `/marshal/ranks/${w.rank}/sessions/nope/close`, {})).status).toBe(400); expect((await call("POST", `/marshal/ranks/${w.rank}/sessions/${id(99)}/close`, {})).status).toBe(404);
    const open = await call("POST", `/marshal/ranks/${w.rank}/sessions`, { terminalId: d }); expect((await call("POST", `/marshal/ranks/${w.rank}/sessions/${open.body.session.id}/close`, { passengers: 999 })).status).toBe(400);
    expect((await call("POST", `/marshal/ranks/${w.rank}/sessions`, { terminalId: d })).body).toMatchObject({ success: false, code: "device_busy" });
  });
});

describe("setting a terminal up as a shared rank device", () => {
  async function plain(w: W, serial: string) { return (await w.db.query(`INSERT INTO terminals (serial) VALUES ($1) RETURNING id`, [serial])).rows[0].id as string; }
  it("accepts a rank and route that go together, and settings that do not touch any of it", async () => {
    const w = await world(); const t = await plain(w, "NEW-1");
    expect(await checkRankDevice(w.db, t, { kind: "rank", rankId: w.rank, routeId: w.route })).toMatchObject({ ok: true });
    expect(await checkRankDevice(w.db, t, { rankId: w.rank2, routeId: w.route })).toMatchObject({ ok: true });                // the other end of the same route
    expect(await checkRankDevice(w.db, t, {})).toMatchObject({ ok: true }); expect(await checkRankDevice(w.db, t, { kind: "vehicle" })).toMatchObject({ ok: true });
  });
  it("refuses an unknown kind, a rank device with no rank or no route, a missing rank or route, and a rank that is not on the route", async () => {
    const w = await world(); const t = await plain(w, "NEW-1"); const other = (await w.db.query(`INSERT INTO ranks (association_id, name) VALUES ($1,'Elsewhere') RETURNING id`, [U.assoc])).rows[0].id as string;
    refused(await checkRankDevice(w.db, t, { kind: "bus" }), 400, "kind"); refused(await checkRankDevice(w.db, t, { kind: "rank" }), 400, "rank_route"); refused(await checkRankDevice(w.db, t, { kind: "rank", rankId: w.rank }), 400, "rank_route");
    refused(await checkRankDevice(w.db, t, { kind: "rank", rankId: id(777), routeId: w.route }), 400, "rank"); refused(await checkRankDevice(w.db, t, { kind: "rank", rankId: w.rank, routeId: id(777) }), 400, "route");
    refused(await checkRankDevice(w.db, t, { kind: "rank", rankId: other, routeId: w.route }), 400, "not_on_route"); refused(await checkRankDevice(w.db, id(555), { kind: "rank", rankId: w.rank, routeId: w.route }), 404, "terminal");
  });
  it("allows one active device at each end of a route, and says which device already has it", async () => {
    const w = await world(); await w.device("RK-1"); const t = await plain(w, "NEW-2");
    const r = await checkRankDevice(w.db, t, { kind: "rank", rankId: w.rank, routeId: w.route }); refused(r, 409, "end_taken"); expect((r as any).message).toContain("RK-1");
    expect(await checkRankDevice(w.db, t, { kind: "rank", rankId: w.rank2, routeId: w.route })).toMatchObject({ ok: true });       // the other end is free
    await w.db.query(`UPDATE terminals SET status = 'revoked' WHERE serial = 'RK-1'`); expect(await checkRankDevice(w.db, t, { kind: "rank", rankId: w.rank, routeId: w.route })).toMatchObject({ ok: true });   // a retired device frees its end
  });
});

describe("the device routes stay wired to the service", () => {
  const src = readFileSync(join(__dirname, "../routes/terminalRouter.ts"), "utf8");
  it("pairs through the service after authenticating the device, and checks shared-device settings through it too", () => {
    expect(src).toMatch(/router\.post\("\/pair"[\s\S]*?authenticateTerminal\([\s\S]*?createRankSessions\(pool\)\.pair\(/);
    expect(src).toMatch(/router\.patch\("\/terminals\/:id"[\s\S]*?checkRankDevice\(pool, req\.params\.id, \{ kind, rankId, routeId \}\)/);
    expect(src).toMatch(/kind: \$\{?|kind = COALESCE\(\$8, kind\)/);
  });
});

/** A stand-in for the token service: records a confirmed tap on the session, as the real one does, so the rules around it can be tested on their own. */
const fakeCharge = (db: Db, o: { fail?: { status: number; code: string; message: string }; failFor?: string } = {}) => async (t: { terminalId: string; cardUid: unknown; routeId: string; key: string; sessionId: string; at?: Date | null }) => {
  if (o.fail && (!o.failFor || String(t.cardUid) === o.failFor)) return { ok: false as const, ...o.fail };
  const ref = `toktap:${t.terminalId}:${t.key}`, dup = (await db.query(`SELECT id FROM terminal_taps WHERE terminal_id = $1 AND idempotency_key = $2`, [t.terminalId, ref])).rows[0];
  if (dup) return { ok: true as const, tapId: String(dup.id), fareCents: 2500, balanceCents: 5000, route: "Langa to Bellville", replayed: true };
  const row = (await db.query(`INSERT INTO terminal_taps (terminal_id, masked_pan, scheme, amount, currency, cardholder_verification, status, idempotency_key, session_id, received_at) VALUES ($1,$2,'vink_token',25,'ZAR','token_card','confirmed',$3,$4,COALESCE($5, now())) RETURNING id`, [t.terminalId, `VINK ****${String(t.cardUid).slice(-4)}`, ref, t.sessionId, t.at ?? null])).rows[0];
  return { ok: true as const, tapId: String(row.id), fareCents: 2500, balanceCents: 5000, route: "Langa to Bellville", replayed: false };
};

describe("a passenger's tap on the device (the rules around the charge)", () => {
  const tap = (w: W, d: string, key: string, uid: unknown = CARD.pax, charge = fakeCharge(w.db)) => w.rs.tap({ terminalId: d, serial: "RK-1", cardUid: uid, key }, charge);
  it("needs a session that has been paired, a route for the fare and a readable card, and says which is missing", async () => {
    const w = await world(); const d = await w.device("RK-1"); refused(await tap(w, d, "tap-0001"), 409, "no_session");
    await w.queue(w.rank, w.v1); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); refused(await tap(w, d, "tap-0001"), 409, "not_paired");
    ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver })); refused(await tap(w, d, "tap-0001", ""), 400, "bad_card"); refused(await tap(w, d, "tap-0001", null), 400, "bad_card");
    await w.db.query(`UPDATE terminals SET route_id = NULL WHERE id = $1`, [d]); refused(await tap(w, d, "tap-0001"), 409, "no_route");
    expect((await w.db.query(`SELECT COUNT(*) AS n FROM terminal_taps`)).rows[0].n).toBe(0);                        // none of those charged anything
  });
  it("counts each accepted tap on the session, and passes a refusal from the token service through with its code", async () => {
    const w = await world(); const { d } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    expect(ok<any>(await tap(w, d, "tap-0001")).session).toMatchObject({ passengers: 1, totalCents: 2500, registration: "CA 111-111", driverName: "Driver One" });
    expect(ok<any>(await tap(w, d, "tap-0002", "04AAAA0002")).session).toMatchObject({ passengers: 2, totalCents: 5000 });
    refused(await tap(w, d, "tap-0003", "04BBBB0003", fakeCharge(w.db, { fail: { status: 402, code: "insufficient_tokens", message: "Not enough tokens" } })), 402, "insufficient_tokens");
    expect((await w.rs.board(w.rank)).queue[0]).toMatchObject({ status: "loading" });
  });
});

describe("the driver's loading dashboard", () => {
  let server: Server, url = "", w: W, as = U.driver, d = "";
  beforeEach(async () => {
    w = await world(); as = U.driver; const app = express(); app.use(express.json());
    app.use((req, _r, next) => { (req as any).user = { userId: as, username: "driver", role: "driver" }; next(); }); app.use("/driver", createDriverRouter(w.db, () => clock));
    await new Promise<void>((ok2) => { server = app.listen(0, "127.0.0.1", ok2); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    d = await w.device("RK-1"); await w.queue(w.rank, w.v1); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
  });
  afterEach(() => new Promise<void>((ok2) => server.close(() => ok2())));
  const get = async () => (await (await fetch(url + "/driver/loading")).json()) as any;

  it("shows the driver the vehicle they are loading, the running total and the latest taps, and only theirs", async () => {
    await tap2(w, d, "tap-0001", "04AAAA0001"); await tap2(w, d, "tap-0002", "04BBBB0002");
    const mine = await get(); expect(mine).toMatchObject({ success: true, current: { status: "loading", registration: "CA 111-111", driverName: "Driver One", passengers: 2, totalCents: 5000 }, period: { sessions: 0, passengers: 0, totalCents: 0 } });
    expect(mine.current.taps).toHaveLength(2); expect(mine.current.taps[0]).toMatchObject({ amountCents: 2500, status: "confirmed" }); expect(mine.current.taps[0].card).toMatch(/^VINK \*\*\*\*/);
    as = U.driver2; expect((await get()).current).toBeNull();                                    // another driver sees nothing of it
    as = U.owner; expect((await get()).current).toBeNull();
  });
  it("adds a departed session to the driver's day, and the driver who takes the vehicle over sees their own session, not the last one's", async () => {
    await tap2(w, d, "tap-0001", "04AAAA0001"); const sid = (await w.db.query(`SELECT id FROM loading_sessions`)).rows[0].id as string;
    ok(await w.rs.close({ sessionId: sid, rankId: w.rank, marshalId: U.marshal, actorName: "m" }));
    expect(await get()).toMatchObject({ current: null, period: { sessions: 1, passengers: 1, totalCents: 2500 } });
    await w.db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.owner, U.driver3]);
    await w.queue(w.rank, w.v1); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver3 }));
    as = U.driver3; expect((await get()).current).toMatchObject({ driverName: "Driver Three", passengers: 0 }); as = U.driver; expect((await get()).current).toBeNull();
  });
});
const tap2 = (w: W, d: string, key: string, uid: string) => w.rs.tap({ terminalId: d, serial: "RK-1", cardUid: uid, key }, fakeCharge(w.db));

describe("the departure hook and the wiring", () => {
  it("makes the session's trip when the marshal ends it, and a failing hook does not stop the departure", async () => {
    const seen: string[] = []; const w = await world(); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    const rsHook = createRankSessions(w.db, () => clock, undefined, { onClosed: async (sid) => { seen.push(sid); throw new Error("trip service down"); } });
    const s = ok<any>(await rsHook.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await rsHook.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    expect(ok<any>(await rsHook.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" })).status).toBe("closed"); expect(seen).toEqual([s.id]);
  });
  it("is wired end to end in the source: the device taps through the service, the marshal's router and the portal pass the hook on, and settlement reads the session's driver and owner", () => {
    const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
    expect(read("tokenRoutes.ts")).toMatch(/router\.post\("\/rank-tap"[\s\S]*?authed\(req\)[\s\S]*?createRankSessions\(d\.db\)\.tap\([\s\S]*?d\.tokens\.tapToken\(t\)/);
    expect(read("../routes/portal.ts")).toMatch(/createMarshalRouter\(d, undefined, money\.closeSessionTrip\)/); expect(read("../index.ts")).toMatch(/closeSessionTrip: moneyEngine \? \(id\) => moneyEngine\.closeSessionTrip\(id\) : undefined/);
    expect(read("marshalRoutes.ts")).toMatch(/createRankSessions\(db, now, undefined, \{ onClosed: onSessionClosed \}\)/);
    const money = read("../services/moneyEngine.ts");
    expect(money).toMatch(/COALESCE\(s\.driver_id, m\.driver_id\) AS driver_id, COALESCE\(sv\.owner_id, m\.owner_id\) AS owner_id/); expect(money).toMatch(/LEFT JOIN loading_sessions s ON s\.id = t\.session_id/);
    expect(money).toMatch(/t\.status = 'confirmed' AND t\.trip_id IS NULL AND t\.session_id IS NULL/);                 // the ordinary trip run leaves session taps to the session's own trip
  });
});

/** A service that records every live event it would send, so who receives what can be checked. */
function watched(w: W, o: { throws?: boolean } = {}) {
  const sent: { to: string[]; event: string; data: any }[] = [];
  const rsw = createRankSessions(w.db, () => clock, undefined, { notify: (to, event, data) => { if (o.throws) throw new Error("socket down"); sent.push({ to, event, data }); }, onClosed: async () => undefined });
  return { rsw, sent };
}

describe("live events go only to the session's driver and marshal", () => {
  it("tells the marshal when a session opens, and the driver as well once they pair, and nobody else", async () => {
    const w = await world(); const { rsw, sent } = watched(w); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    ok(await rsw.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); expect(sent).toEqual([{ to: [U.marshal], event: "rank.session", data: { session: expect.objectContaining({ status: "pending", driverId: null }) } }]);
    ok(await rsw.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver })); expect(sent[1]).toMatchObject({ event: "rank.session", data: { session: { status: "loading", driverId: U.driver, driverName: "Driver One" } } }); expect([...sent[1].to].sort()).toEqual([U.marshal, U.driver].sort());
    for (const e of sent) for (const other of [U.driver2, U.driver3, U.owner, U.pax, U.marshal2]) expect(e.to, `${e.event} must not reach ${other}`).not.toContain(other);
  });
  it("sends each accepted tap to the driver and marshal with the running total, and the card as its last four characters only", async () => {
    const w = await world(); const { rsw, sent } = watched(w); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    ok(await rsw.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await rsw.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver })); sent.length = 0;
    ok(await rsw.tap({ terminalId: d, serial: "RK-1", cardUid: CARD.pax, key: "tap-0001" }, fakeCharge(w.db)));
    expect(sent).toHaveLength(1); expect(sent[0]).toMatchObject({ event: "rank.tap", data: { passengers: 1, totalCents: 2500, tap: { amountCents: 2500, card: "VINK ****FEED", status: "confirmed" } } }); expect([...sent[0].to].sort()).toEqual([U.marshal, U.driver].sort());
    expect(JSON.stringify(sent)).not.toContain(CARD.pax);                                          // the full card number never leaves the server in an event
  });
  it("sends nothing for a retry, a refused double tap or a card that is declined", async () => {
    const w = await world(); const { rsw, sent } = watched(w); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    ok(await rsw.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await rsw.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    ok(await rsw.tap({ terminalId: d, serial: "RK-1", cardUid: CARD.pax, key: "tap-0001" }, fakeCharge(w.db))); sent.length = 0;
    ok(await rsw.tap({ terminalId: d, serial: "RK-1", cardUid: CARD.pax, key: "tap-0001" }, fakeCharge(w.db)));                       // a retry
    refused(await rsw.tap({ terminalId: d, serial: "RK-1", cardUid: CARD.pax, key: "tap-0002" }, fakeCharge(w.db)), 409, "duplicate_tap");
    refused(await rsw.tap({ terminalId: d, serial: "RK-1", cardUid: "04ZZZZ0009", key: "tap-0003" }, fakeCharge(w.db, { fail: { status: 402, code: "insufficient_tokens", message: "Not enough tokens" } })), 402, "insufficient_tokens");
    expect(sent).toEqual([]);
  });
  it("tells both of them when the vehicle departs and when a session is cancelled or expires", async () => {
    const w = await world(); const { rsw, sent } = watched(w); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    const s = ok<any>(await rsw.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await rsw.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver })); sent.length = 0;
    ok(await rsw.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" })); expect(sent.at(-1)).toMatchObject({ event: "rank.session", data: { session: { status: "closed" } } }); expect([...sent.at(-1)!.to].sort()).toEqual([U.marshal, U.driver].sort());
    await w.queue(w.rank, w.v2); const s2 = ok<any>(await rsw.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); sent.length = 0;
    ok(await rsw.cancel({ sessionId: s2.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" })); expect(sent[0]).toMatchObject({ to: [U.marshal], data: { session: { status: "cancelled" } } });
    await w.queue(w.rank, w.v3); ok(await rsw.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); sent.length = 0; clock = new Date(clock.getTime() + PAIR_WINDOW_MS + 1000); await rsw.expireStale();
    expect(sent[0]).toMatchObject({ to: [U.marshal], data: { session: { status: "cancelled", closeReason: "No driver card was tapped in time" } } });
  });
  it("never lets a failing live connection stop the pairing, the tap or the departure", async () => {
    const w = await world(); const { rsw } = watched(w, { throws: true }); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    const s = ok<any>(await rsw.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await rsw.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    ok(await rsw.tap({ terminalId: d, serial: "RK-1", cardUid: CARD.pax, key: "tap-0001" }, fakeCharge(w.db))); expect(ok<any>(await rsw.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" })).status).toBe("closed");
  });
});

describe("the driver departs their own vehicle", () => {
  it("ends the session they are loading, under the marshal who started it, with the driver as the person who pressed it, and makes the trip", async () => {
    const w = await world(); const closed: string[] = []; const rsd = createRankSessions(w.db, () => clock, undefined, { notify: () => {}, onClosed: async (id) => { closed.push(id); } });
    const d = await w.device("RK-1"); await w.queue(w.rank, w.v1); const s = ok<any>(await rsd.open({ rankId: w.rank, marshalId: U.marshal, actorName: "marshal", terminalId: d })); ok(await rsd.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    await rsd.tap({ terminalId: d, serial: "RK-1", cardUid: CARD.pax, key: "tap-0001" }, fakeCharge(w.db));
    const r = ok<any>(await rsd.departByDriver({ driverId: U.driver, actorName: "driver", note: "full" })); expect(r).toMatchObject({ id: s.id, status: "closed", passengers: 1, totalCents: 2500 }); expect(closed).toEqual([s.id]);
    expect((await w.db.query(`SELECT marshal_id, driver_id, passengers, note FROM departures WHERE id = $1`, [r.departureId])).rows[0]).toMatchObject({ marshal_id: U.marshal, driver_id: U.driver, passengers: 1, note: "full" });
    const log = (await w.audit("rank.session_close"))[0]; expect(log).toMatchObject({ target: s.id }); expect(det(log.details)).toMatchObject({ by: "driver" });
    expect((await w.rs.board(w.rank)).queue).toEqual([]);                                           // the vehicle has left the queue
    refused(await rsd.departByDriver({ driverId: U.driver, actorName: "driver" }), 409, "no_session");                // pressing it again, or when not loading, is refused
  });
  it("cannot be used to depart someone else's session: a driver who is not loading is told so", async () => {
    const w = await world(); const { d } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    refused(await w.rs.departByDriver({ driverId: U.driver2, actorName: "driver2" }), 409, "no_session"); refused(await w.rs.departByDriver({ driverId: U.marshal, actorName: "marshal" }), 409, "no_session");
    expect((await w.rs.board(w.rank)).queue[0].status).toBe("loading");
  });
  it("is a route that only ever acts for the signed-in driver", async () => {
    const w = await world(); const app = express(); app.use(express.json()); let as = U.driver;
    app.use((req, _r, next) => { (req as any).user = { userId: as, username: "driver", role: "driver" }; next(); }); app.use("/driver", createDriverRouter(w.db, () => clock));
    const srv: Server = await new Promise((ok2) => { const x = app.listen(0, "127.0.0.1", () => ok2(x)); }); const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const { d } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
      const post = async () => { const r = await fetch(`${base}/driver/loading/depart`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "x".repeat(300) }) }); return { status: r.status, body: (await r.json()) as any }; };
      as = U.driver2; expect(await post()).toMatchObject({ status: 409, body: { success: false, code: "no_session" } });
      as = U.driver; const done = await post(); expect(done).toMatchObject({ status: 200, body: { success: true, session: { status: "closed" } } });
      expect((await w.db.query(`SELECT note FROM departures`)).rows[0].note).toHaveLength(200);                   // the note is cut to 200 characters
    } finally { await new Promise<void>((ok2) => srv.close(() => ok2())); }
  });
});

describe("the old Depart and Remove buttons leave a loading vehicle to its session", () => {
  let server: Server, url = "", w: W;
  beforeEach(async () => {
    w = await world(); const app = express(); app.use(express.json());
    app.use((req, _r, next) => { (req as any).user = { userId: U.marshal, username: "marshal", role: "marshal" }; next(); }); app.use("/marshal", createMarshalRouter(w.db, () => clock));
    await new Promise<void>((ok2) => { server = app.listen(0, "127.0.0.1", ok2); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok2) => server.close(() => ok2())));
  const post = async (path: string, body: unknown = {}) => { const r = await fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any }; };

  it("refuses to depart or remove a vehicle that is loading on a device, so a session is never left open behind a vehicle that has gone", async () => {
    const d = await w.device("RK-1"); const q1 = await w.queue(w.rank, w.v1); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d }));
    expect(await post(`/marshal/ranks/${w.rank}/depart`, { queueId: q1 })).toMatchObject({ status: 409, body: { error: expect.stringContaining("loading on a device") } });
    expect(await post(`/marshal/ranks/${w.rank}/queue/${q1}/remove`)).toMatchObject({ status: 409, body: { error: expect.stringContaining("loading on a device") } });
    expect((await w.db.query(`SELECT COUNT(*) AS n FROM departures`)).rows[0].n).toBe(0); expect((await w.rs.board(w.rank)).queue).toHaveLength(1);
  });
  it("takes the next vehicle in line, not the loading one, when no vehicle is named; with nobody else waiting it says so", async () => {
    const d = await w.device("RK-1"); const q1 = await w.queue(w.rank, w.v1); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d }));
    expect(await post(`/marshal/ranks/${w.rank}/depart`)).toMatchObject({ status: 409, body: { error: "Nobody is waiting at this rank" } });
    const q2 = await w.queue(w.rank, w.v2); expect((await post(`/marshal/ranks/${w.rank}/depart`)).status).toBe(201);
    expect((await w.db.query(`SELECT vehicle_id FROM departures`)).rows[0].vehicle_id).toBe(w.v2); expect(q1).toBeTruthy(); expect(q2).toBeTruthy();                // the second vehicle left, the loading one stayed
  });
  it("works as before for any vehicle that is not loading, and again once its session is cancelled", async () => {
    const q1 = await w.queue(w.rank, w.v1); const q2 = await w.queue(w.rank, w.v2); expect((await post(`/marshal/ranks/${w.rank}/queue/${q2}/remove`)).status).toBe(200);
    const d = await w.device("RK-1"); const s = ok<any>(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); expect((await post(`/marshal/ranks/${w.rank}/depart`, { queueId: q1 })).status).toBe(409);
    ok(await w.rs.cancel({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" })); expect((await post(`/marshal/ranks/${w.rank}/depart`, { queueId: q1 })).status).toBe(201);
  });
});

/** a device an OWNER has fitted to their own vehicle: no rank, no marshal */
async function ownDevice(w: W, serial: string, o: { vehicle?: string | null; owner?: string | null; kind?: string; status?: string; association?: string | null } = {}) {
  return (await w.db.query(`INSERT INTO terminals (serial, kind, vehicle_id, route_id, owner_id, association_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [serial, o.kind ?? "vehicle", o.vehicle === undefined ? w.v1 : o.vehicle, w.route, o.owner === undefined ? U.owner : o.owner, o.association === undefined ? U.assoc : o.association, o.status ?? "active"])).rows[0].id as string;
}
const sessionRows = async (w: W) => (await w.db.query(`SELECT * FROM loading_sessions`)).rows as any[];

describe("a driver on an owner's own device", () => {
  it("opens and pairs a trip with one tap of their own driver card: no marshal, no rank, no queue", async () => {
    const w = await world(); const d = await ownDevice(w, "OWN-1"); const r = ok<any>(await w.rs.pair({ terminalId: d, serial: "OWN-1", cardUid: CARD.driver }));
    expect(r).toMatchObject({ status: "loading", driverId: U.driver, driverName: "Driver One", vehicleId: w.v1, registration: "CA 111-111", routeId: w.route, replayed: false });
    expect((await sessionRows(w))[0]).toMatchObject({ rank_id: null, marshal_id: null, queue_id: null, terminal_id: d, status: "loading" });
    expect((await w.audit("rank.paired"))[0]).toMatchObject({ target: r.id, actor_name: "terminal:OWN-1" });
  });
  it("is just as strict as at a rank: a passenger's card, an unknown card, a blocked card and a driver not on that vehicle all open nothing", async () => {
    const w = await world(); const d = await ownDevice(w, "OWN-1"); const tap = (cardUid: string) => w.rs.pair({ terminalId: d, serial: "OWN-1", cardUid });
    refused(await tap(CARD.pax), 403, "not_driver_card"); refused(await tap(CARD.stranger), 404, "card_unknown"); refused(await tap(CARD.driver2), 403, "wrong_driver");
    await w.db.query(`UPDATE token_cards SET status = 'blocked' WHERE card_hash = $1`, [cardHash(CARD.driver)]); refused(await tap(CARD.driver), 403, "card_blocked");
    expect(await sessionRows(w)).toEqual([]); expect((await w.audit("rank.pair_refused")).length).toBe(4);
  });
  it("never opens by itself on a shared rank device (the marshal decides who loads), on a device with no vehicle, or on one that is switched off", async () => {
    const w = await world(); const tap = (d: string, serial: string) => w.rs.pair({ terminalId: d, serial, cardUid: CARD.driver });
    const rk = await w.device("RK-1"); refused(await tap(rk, "RK-1"), 409, "no_session");                  // a rank device with nobody started on it
    await w.db.query(`UPDATE terminals SET vehicle_id = $1 WHERE id = $2`, [w.v1, rk]); refused(await tap(rk, "RK-1"), 409, "no_session");      // ... even if it was mistakenly given a vehicle: only the marshal starts a load at a rank
    refused(await tap(await ownDevice(w, "OWN-2", { vehicle: null }), "OWN-2"), 409, "no_session");
    refused(await tap(await ownDevice(w, "OWN-3", { status: "inactive" }), "OWN-3"), 409, "no_session");
    expect(await sessionRows(w)).toEqual([]);
  });
  it("answers the same driver tapping again as before, refuses a different driver while one is loading, and a driver or vehicle that is already loading elsewhere", async () => {
    const w = await world(); const d = await ownDevice(w, "OWN-1"); ok(await w.rs.pair({ terminalId: d, serial: "OWN-1", cardUid: CARD.driver }));
    expect(ok<any>(await w.rs.pair({ terminalId: d, serial: "OWN-1", cardUid: CARD.driver })).replayed).toBe(true); expect((await sessionRows(w)).length).toBe(1);
    await w.db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.owner, U.driver3]); refused(await w.rs.pair({ terminalId: d, serial: "OWN-1", cardUid: CARD.driver3 }), 409, "device_busy");
    const d2 = await ownDevice(w, "OWN-2", { vehicle: w.v2 }); await w.db.query(`UPDATE vehicles SET driver_id = $1 WHERE id = $2`, [U.driver, w.v2]); refused(await w.rs.pair({ terminalId: d2, serial: "OWN-2", cardUid: CARD.driver }), 409, "driver_busy");
    const e = await world(); const od = await ownDevice(e, "OWN-9"); const rk = await e.device("RK-1"); await e.queue(e.rank, e.v1); ok(await e.rs.open({ rankId: e.rank, marshalId: U.marshal, actorName: "m", terminalId: rk }));     // the vehicle is already loading at the rank
    refused(await e.rs.pair({ terminalId: od, serial: "OWN-9", cardUid: CARD.driver }), 409, "vehicle_busy");
  });
  it("takes passengers' fares like a rank device does, and the driver ends the trip: no departure is logged, and the next driver can start", async () => {
    const closed: string[] = []; const w = await world(); const rsd = createRankSessions(w.db, () => clock, undefined, { notify: () => {}, onClosed: async (id) => { closed.push(id); } });
    const d = await ownDevice(w, "OWN-1"); const s = ok<any>(await rsd.pair({ terminalId: d, serial: "OWN-1", cardUid: CARD.driver })); ok(await rsd.tap({ terminalId: d, serial: "OWN-1", cardUid: CARD.pax, key: "tap-0001" }, fakeCharge(w.db)));
    expect(ok<any>(await rsd.tap({ terminalId: d, serial: "OWN-1", cardUid: "04AAAA0002", key: "tap-0002" }, fakeCharge(w.db))).session).toMatchObject({ passengers: 2, totalCents: 5000 });
    const done = ok<any>(await rsd.departByDriver({ driverId: U.driver, actorName: "driver" })); expect(done).toMatchObject({ id: s.id, status: "closed", passengers: 2, departureId: null }); expect(closed).toEqual([s.id]);
    expect((await w.db.query(`SELECT COUNT(*) AS n FROM departures`)).rows[0].n).toBe(0); expect(det((await w.audit("rank.session_close"))[0].details)).toMatchObject({ by: "driver", departureId: null });
    await w.db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.owner, U.driver3]); expect(ok<any>(await rsd.pair({ terminalId: d, serial: "OWN-1", cardUid: CARD.driver3 })).driverId).toBe(U.driver3);
    expect(ok<any>(await rsd.tap({ terminalId: d, serial: "OWN-1", cardUid: CARD.pax, key: "tap-0003" }, fakeCharge(w.db))).session).toMatchObject({ passengers: 1, totalCents: 2500, driverName: "Driver Three" });      // a new trip, so the same card is a new fare, counted on the new driver
  });
  it("lets the owner, and only the owner of that vehicle, end a trip a driver forgot", async () => {
    const w = await world(); const d = await ownDevice(w, "OWN-1"); const s = ok<any>(await w.rs.pair({ terminalId: d, serial: "OWN-1", cardUid: CARD.driver }));
    refused(await w.rs.endByOwner({ ownerId: U.owner2, sessionId: s.id, actorName: "owner2" }), 404, "session"); refused(await w.rs.endByOwner({ ownerId: U.driver, sessionId: s.id, actorName: "driver" }), 404, "session");
    expect((await sessionRows(w))[0].status).toBe("loading"); expect(ok<any>(await w.rs.endByOwner({ ownerId: U.owner, sessionId: s.id, actorName: "owner" })).status).toBe("closed");
    expect(det((await w.audit("rank.session_close"))[0].details)).toMatchObject({ by: "owner" });
  });
});

describe("the owner's device routes", () => {
  let server: Server, url = "", w: W, as = U.owner; const closed: string[] = [];
  beforeEach(async () => {
    w = await world(); as = U.owner; closed.length = 0; const app = express(); app.use(express.json());
    app.use((req, _r, next) => { (req as any).user = { userId: as, username: "owner", role: "vehicle_owner" }; next(); }); app.use("/owner", createOwnerRouter(w.db, () => clock, async (id) => { closed.push(id); }));
    await new Promise<void>((ok2) => { server = app.listen(0, "127.0.0.1", ok2); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok2) => server.close(() => ok2())));
  const call = async (method: string, path: string, body?: unknown) => { const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any }; };
  const loose = async (serial: string, o: { owner?: string | null; kind?: string; association?: string | null } = {}) => (await w.db.query(`INSERT INTO terminals (serial, kind, owner_id, association_id) VALUES ($1,$2,$3,$4) RETURNING id`, [serial, o.kind ?? "vehicle", o.owner === undefined ? U.owner : o.owner, o.association === undefined ? U.assoc : o.association])).rows[0].id as string;

  it("lists only the owner's own devices, with the vehicle, route and fare they are fitted to and who is loading", async () => {
    const a = await ownDevice(w, "OWN-1"); await loose("LOOSE-1"); await loose("NOT-MINE", { owner: U.owner2 }); ok(await w.rs.pair({ terminalId: a, serial: "OWN-1", cardUid: CARD.driver }));
    const r = await call("GET", "/owner/devices"); expect(r.status).toBe(200); expect(r.body.devices.map((d: any) => d.serial)).toEqual(["LOOSE-1", "OWN-1"]);
    expect(r.body.devices.find((d: any) => d.serial === "OWN-1")).toMatchObject({ shared: false, registration: "CA 111-111", route: "Langa to Bellville", fareCents: 2500, session: { driver: "Driver One", passengers: 0 } }); expect(r.body.devices.find((d: any) => d.serial === "LOOSE-1")).toMatchObject({ vehicleId: null, session: null });
    as = U.owner2; expect((await call("GET", "/owner/devices")).body.devices.map((d: any) => d.serial)).toEqual(["NOT-MINE"]);
  });
  it("fits a device to one of the owner's own vehicles and a route, and can take it off again", async () => {
    const d = await loose("LOOSE-1"); expect((await call("PUT", `/owner/devices/${d}`, { vehicleId: w.v1, routeId: w.route })).status).toBe(200);
    expect((await w.db.query(`SELECT kind, vehicle_id, route_id FROM terminals WHERE id = $1`, [d])).rows[0]).toMatchObject({ kind: "vehicle", vehicle_id: w.v1, route_id: w.route }); expect((await w.audit("owner.device_attach")).length).toBe(1);
    ok(await w.rs.pair({ terminalId: d, serial: "LOOSE-1", cardUid: CARD.driver })); expect((await call("PUT", `/owner/devices/${d}`, { vehicleId: null })).status).toBe(409);            // not while a driver is loading
    expect((await call("PUT", `/owner/devices/${d}`, { vehicleId: w.v2, routeId: w.route })).status).toBe(409);
    expect((await w.db.query(`SELECT vehicle_id, route_id FROM terminals WHERE id = $1`, [d])).rows[0]).toMatchObject({ vehicle_id: w.v1, route_id: w.route });                  // and the refusal really changed nothing
    ok(await w.rs.endByOwner({ ownerId: U.owner, sessionId: (await sessionRows(w))[0].id, actorName: "o" })); expect((await call("PUT", `/owner/devices/${d}`, { vehicleId: null })).status).toBe(200);
    expect((await w.db.query(`SELECT vehicle_id, route_id FROM terminals WHERE id = $1`, [d])).rows[0]).toMatchObject({ vehicle_id: null, route_id: null });
  });
  it("refuses: someone else's device or vehicle, a missing route, a route of another association, a shared rank device, a vehicle that already has a device, and bad ids", async () => {
    const d = await loose("LOOSE-1"); const put = (b: unknown, id = d) => call("PUT", `/owner/devices/${id}`, b);
    expect((await put({ vehicleId: w.v3, routeId: w.route })).status).toBe(404);                         // another owner's vehicle
    expect((await put({ vehicleId: w.v1, routeId: id(777) })).status).toBe(404); expect((await put({ vehicleId: w.v1 })).status).toBe(400); expect((await put({ routeId: w.route })).status).toBe(400); expect((await put({ vehicleId: "x", routeId: w.route })).status).toBe(400);
    expect((await call("PUT", `/owner/devices/nope`, {})).status).toBe(400); expect((await put({ vehicleId: w.v1, routeId: w.route }, id(888))).status).toBe(404);
    expect((await put({ vehicleId: w.v1, routeId: w.route }, await loose("NOT-MINE", { owner: U.owner2 }))).status).toBe(404);
    expect((await put({ vehicleId: w.v1, routeId: w.route }, await loose("RANK-1", { kind: "rank" }))).status).toBe(409);
    const other = (await w.db.query(`INSERT INTO token_routes (association_id, name, fare_cents) VALUES ($1,'Elsewhere',1000) RETURNING id`, [U.owner2])).rows[0].id as string; expect((await put({ vehicleId: w.v1, routeId: other })).status).toBe(400);
    await ownDevice(w, "FITTED", { vehicle: w.v2 }); expect((await put({ vehicleId: w.v2, routeId: w.route })).status).toBe(409);
    expect((await w.db.query(`SELECT vehicle_id FROM terminals WHERE id = $1`, [d])).rows[0].vehicle_id).toBeNull();                      // none of those changed anything
  });
  it("lets the owner end a trip on their own vehicle (and makes its trip), and no one else's", async () => {
    const d = await ownDevice(w, "OWN-1"); const s = ok<any>(await w.rs.pair({ terminalId: d, serial: "OWN-1", cardUid: CARD.driver }));
    as = U.owner2; expect((await call("POST", `/owner/loading/${s.id}/end`)).status).toBe(404); expect((await call("POST", "/owner/loading/nope/end")).status).toBe(400);
    as = U.owner; expect(await call("POST", `/owner/loading/${s.id}/end`)).toMatchObject({ status: 200, body: { success: true, session: { status: "closed" } } }); expect(closed).toEqual([s.id]);
  });
});

describe("taps made without a signal", () => {
  const min = (m: number, sec = 0) => new Date(new Date("2026-10-07T10:00:00Z").getTime() + m * 60_000 + sec * 1000).toISOString();     // minutes after the 10:00 the sessions start at
  const item = (key: string, at: string, uid: unknown = "04AAAA0001") => ({ key, cardUid: uid, at });
  const sync = (w: W, d: string, taps: unknown, charge = fakeCharge(w.db), rsx = w.rs) => rsx.syncTaps({ terminalId: d, serial: "RK-1", taps }, charge);
  /** driver one loads from 10:00, departs at 10:30; driver two loads from 10:35 */
  async function twoLoads(w: W, hooks: { onClosed?: (id: string) => Promise<unknown>; notify?: (to: string[], e: string, d: unknown) => void } = {}) {
    const rsx = createRankSessions(w.db, () => clock, undefined, { notify: () => {}, ...hooks }); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1);
    const a = ok<any>(await rsx.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await rsx.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    clock = new Date(min(30)); ok(await rsx.close({ sessionId: a.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" }));
    clock = new Date(min(35)); await w.queue(w.rank, w.v2); const b = ok<any>(await rsx.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await rsx.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver2 }));
    clock = new Date(min(60)); return { rsx, d, a, b };
  }

  it("puts each tap in the session that was loading AT THAT TIME, so each driver is credited for their own load, and keeps the time it really happened", async () => {
    const w = await world(); const { rsx, d, a, b } = await twoLoads(w);
    const r = ok<any>(await sync(w, d, [item("off-0001", min(10), "04AAAA0001"), item("off-0002", min(20), "04BBBB0002"), item("off-0003", min(40), "04CCCC0003"), item("off-0004", min(50), "04DDDD0004")], fakeCharge(w.db), rsx));
    expect(r).toMatchObject({ accepted: 4, replayed: 0, declined: 0, rejected: 0 }); expect(r.results.map((x: any) => x.sessionId)).toEqual([a.id, a.id, b.id, b.id]);
    const rows = (await w.db.query(`SELECT id, passengers, total_cents FROM loading_sessions ORDER BY started_at`)).rows; expect(rows.map((x: any) => [x.id, x.passengers, x.total_cents])).toEqual([[a.id, 2, 5000], [b.id, 2, 5000]]);
    expect((await w.db.query(`SELECT received_at FROM terminal_taps ORDER BY received_at`)).rows.map((x: any) => new Date(x.received_at).toISOString())).toEqual([min(10), min(20), min(40), min(50)]);
  });
  it("refuses a tap made when no driver was paired: before the first load, between two loads, and while the session was cancelled, and charges nothing", async () => {
    const w = await world(); const { rsx, d } = await twoLoads(w); const charged: string[] = [];
    const charge = async (t: any) => { charged.push(t.key); return fakeCharge(w.db)(t); };
    const r = ok<any>(await sync(w, d, [item("off-0001", min(-5), "04AAAA0001"), item("off-0002", min(32), "04BBBB0002"), item("off-0003", min(35), "04CCCC0003")], charge, rsx));
    expect(r.results.map((x: any) => [x.status, x.code])).toEqual([["rejected", "no_session"], ["rejected", "no_session"], ["accepted", undefined]]); expect(charged).toEqual(["off-0003"]);      // the moment B paired counts as B's
    const e = await world(); const dev = await e.device("RK-1"); await e.queue(e.rank, e.v1); const s = ok<any>(await e.rs.open({ rankId: e.rank, marshalId: U.marshal, actorName: "m", terminalId: dev })); ok(await e.rs.pair({ terminalId: dev, serial: "RK-1", cardUid: CARD.driver }));
    ok(await e.rs.cancel({ sessionId: s.id, rankId: e.rank, marshalId: U.marshal, actorName: "m" })); clock = new Date(min(20)); expect(ok<any>(await sync(e, dev, [item("off-0009", min(5))])).results[0]).toMatchObject({ status: "rejected", code: "no_session" });
  });
  it("answers a batch that is sent again as before: each tap is counted once, whatever the number of resends", async () => {
    const w = await world(); const { rsx, d } = await twoLoads(w); const batch = [item("off-0001", min(10), "04AAAA0001"), item("off-0002", min(20), "04BBBB0002")];
    ok(await sync(w, d, batch, fakeCharge(w.db), rsx)); const again = ok<any>(await sync(w, d, batch, fakeCharge(w.db), rsx)); expect(again).toMatchObject({ accepted: 0, replayed: 2 }); ok(await sync(w, d, batch, fakeCharge(w.db), rsx));
    expect((await w.db.query(`SELECT COUNT(*) AS n FROM terminal_taps`)).rows[0].n).toBe(2); expect((await w.db.query(`SELECT passengers FROM loading_sessions ORDER BY started_at`)).rows[0].passengers).toBe(2);
  });
  it("applies the double-tap rule to the times the taps really happened, in whatever order they were sent", async () => {
    const w = await world(); const { rsx, d } = await twoLoads(w);
    const r = ok<any>(await sync(w, d, [item("off-0002", min(10, 5), "04AAAA0001"), item("off-0001", min(10), "04AAAA0001"), item("off-0003", min(10, 16), "04AAAA0001")], fakeCharge(w.db), rsx));
    expect(r.results.map((x: any) => [x.key, x.status, x.code])).toEqual([["off-0002", "rejected", "duplicate_tap"], ["off-0001", "accepted", undefined], ["off-0003", "accepted", undefined]]);     // 10:10:00 is taken, 10:10:05 is too close, 10:10:16 is fine
  });
  it("decides each tap on its own: a bad one, a declined card and a good one in the same batch", async () => {
    const w = await world(); const { rsx, d } = await twoLoads(w);
    const r = ok<any>(await sync(w, d, [item("x", min(10)), item("off-0002", min(10, 30), ""), item("off-0003", "not a time"), item("off-0004", min(120)), item("off-0005", min(-4400)), item("off-0006", min(11), "04PROBLEM1"), item("off-0007", min(12), "04GOODCARD")], fakeCharge(w.db, { fail: { status: 402, code: "insufficient_tokens", message: "Not enough tokens" }, failFor: "04PROBLEM1" }), rsx));
    expect(r.results.map((x: any) => [x.status, x.code])).toEqual([["rejected", "bad_key"], ["rejected", "bad_card"], ["rejected", "bad_time"], ["rejected", "bad_time"], ["rejected", "too_old"], ["declined", "insufficient_tokens"], ["accepted", undefined]]);
    expect(r).toMatchObject({ accepted: 1, declined: 1, rejected: 5 }); expect((await w.db.query(`SELECT passengers FROM loading_sessions ORDER BY started_at`)).rows[0].passengers).toBe(1);
  });
  it("takes between one and 200 taps, and needs the device to have a route", async () => {
    const w = await world(); const { rsx, d } = await twoLoads(w);
    refused(await sync(w, d, [], fakeCharge(w.db), rsx), 400, "empty"); refused(await sync(w, d, "nope", fakeCharge(w.db), rsx), 400, "empty"); refused(await sync(w, d, Array.from({ length: 201 }, (_, i) => item(`off-${String(i).padStart(4, "0")}`, min(10))), fakeCharge(w.db), rsx), 400, "too_many");
    expect(ok<any>(await sync(w, d, Array.from({ length: 200 }, (_, i) => item(`off-${String(i).padStart(4, "0")}`, min(10, i), `04${String(i).padStart(8, "0")}`)), fakeCharge(w.db), rsx)).accepted).toBe(200);
    await w.db.query(`UPDATE terminals SET route_id = NULL WHERE id = $1`, [d]); refused(await sync(w, d, [item("off-9999", min(10))], fakeCharge(w.db), rsx), 409, "no_route");
  });
  it("completes the trip of a vehicle that already left once its late taps arrive, and tells the session's people", async () => {
    const w = await world(); const done: string[] = [], sent: string[] = []; const { rsx, d, a } = await twoLoads(w, { onClosed: async (id) => { done.push(id); }, notify: (to, e) => { sent.push(`${e}:${to.length}`); } });
    done.length = 0; sent.length = 0; ok(await sync(w, d, [item("off-0001", min(10))], fakeCharge(w.db), rsx));
    expect(done).toEqual([a.id]); expect(sent).toEqual(["rank.session:2"]);                                // the closed session's trip is brought up to date, and its marshal and driver are told
    sent.length = 0; ok(await sync(w, d, [item("off-0002", min(-4400))], fakeCharge(w.db), rsx)); expect(sent).toEqual([]); expect(done).toEqual([a.id]);     // a batch with nothing accepted changes nothing and says nothing
  });
});

describe("the real schema keeps the guarantees the in-memory copy cannot", () => {
  it("has the unique indexes that allow one open session per device, per vehicle, and one loading vehicle per driver, and the index the offline lookup uses", () => {
    const sql = readFileSync(join(__dirname, "../db/schema.sql"), "utf8");
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_loading_one_open_per_terminal ON loading_sessions\(terminal_id\) WHERE status IN \('pending','loading'\)/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_loading_one_open_per_vehicle\s+ON loading_sessions\(vehicle_id\)\s+WHERE status IN \('pending','loading'\)/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_loading_one_loading_per_driver ON loading_sessions\(driver_id\)\s+WHERE status = 'loading'/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_loading_terminal ON loading_sessions\(terminal_id, paired_at\)/); expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_loading_vehicle ON loading_sessions\(vehicle_id, paired_at\)/); expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_loading_driver ON loading_sessions\(driver_id, paired_at\)/);
  });
});

describe("the device's batch route stays wired", () => {
  const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
  it("sends a batch through the service after authenticating the device, with a larger body limit only for that route", () => {
    const src = read("tokenRoutes.ts");
    expect(src).toMatch(/router\.post\("\/rank-tap\/batch", json\(\{ limit: "64kb" \}\)[\s\S]*?authed\(req\)[\s\S]*?createRankSessions\(d\.db\)\.syncTaps\([\s\S]*?d\.tokens\.tapToken\(t\)/);
    expect(src).toMatch(/req\.path === "\/rank-tap\/batch" \? next\(\) : small\(req, res, next\)/); expect(src).toMatch(/const small = json\(\{ limit: "4kb" \}\)/);
  });
});

/** Races between simultaneous requests, which the database's unique indexes decide. The in-memory database cannot run these (it has no true concurrency and no partial indexes), so they run only against a real PostgreSQL (TEST_PG_URL). */
describe.runIf(!!process.env.TEST_PG_URL)("simultaneous requests, on a real PostgreSQL", () => {
  const one = (rs: PromiseSettledResult<any>[]) => rs.filter((r) => r.status === "fulfilled" && r.value.ok).length;
  it("lets only one of many simultaneous requests open the same device, each for a different vehicle (so only the device's own rule can stop them)", async () => {
    const w = await world(); const d = await w.device("RK-1"); for (const v of [w.v1, w.v2, w.v3]) await w.queue(w.rank, v); const qs = (await w.rs.board(w.rank)).queue.map((x) => x.id);
    const r = await Promise.allSettled([...qs, ...qs].map((queueId) => w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d, queueId })));
    expect(one(r)).toBe(1); expect(r.every((x) => x.status === "fulfilled")).toBe(true);                         // none threw: the losers were told, not crashed
    expect((await w.db.query(`SELECT COUNT(*) AS n FROM loading_sessions`)).rows[0].n).toBe(1);
  });
  it("lets only one of many simultaneous requests start the same vehicle on different devices", async () => {
    const w = await world(); const ds = await Promise.all([1, 2, 3, 4].map((i) => w.device(`RK-${i}`))); await w.queue(w.rank, w.v1); const q = (await w.rs.board(w.rank)).queue[0].id;
    const r = await Promise.allSettled(ds.map((terminalId) => w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId, queueId: q })));
    expect(one(r)).toBe(1); expect((await w.db.query(`SELECT COUNT(*) AS n FROM loading_sessions WHERE status IN ('pending','loading')`)).rows[0].n).toBe(1);
  });
  it("lets only one of two drivers who tap the same owner's device at the same moment open the trip", async () => {
    const w = await world(); const d = await ownDevice(w, "OWN-1"); await w.db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.owner, U.driver3]);
    const r = await Promise.allSettled([CARD.driver, CARD.driver3].map((cardUid) => w.rs.pair({ terminalId: d, serial: "OWN-1", cardUid })));
    expect(one(r)).toBe(1); expect(r.every((x) => x.status === "fulfilled")).toBe(true); expect((await w.db.query(`SELECT COUNT(*) AS n FROM loading_sessions`)).rows[0].n).toBe(1);
  });
  it("lets only one of two simultaneous Departs go through, and logs one departure", async () => {
    const w = await world(); const { d, s } = await opened(w); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver }));
    const r = await Promise.allSettled([1, 2, 3].map(() => w.rs.close({ sessionId: s.id, rankId: w.rank, marshalId: U.marshal, actorName: "m" })));
    expect(r.every((x) => x.status === "fulfilled")).toBe(true); expect((await w.db.query(`SELECT COUNT(*) AS n FROM departures`)).rows[0].n).toBe(1);
  });
});

describe("which taps carry the offline guarantee", () => {
  // The device's clock is "now" (11:00) in these tests; a tap's age is how long before that it says it happened.
  const min = (m: number, sec = 0) => new Date(new Date("2026-10-07T10:00:00Z").getTime() + m * 60_000 + sec * 1000).toISOString();
  const spy = (db: Db) => { const seen: { key: string; guarantee: unknown }[] = []; const charge = async (t: any) => { seen.push({ key: t.key, guarantee: t.guarantee }); return fakeCharge(db)(t); }; return { seen, charge }; };
  async function loaded(w: W) { const d = await w.device("RK-1"); await w.queue(w.rank, w.v1); ok(await w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })); ok(await w.rs.pair({ terminalId: d, serial: "RK-1", cardUid: CARD.driver })); clock = new Date(min(60)); return d; }

  it("gives it only to a tap at least a minute old, and treats a fresher one in the same batch like a live tap", async () => {
    const w = await world(); const d = await loaded(w); const { seen, charge } = spy(w.db);
    ok(await w.rs.syncTaps({ terminalId: d, serial: "RK-1", taps: [{ key: "off-0001", cardUid: "04AAAA0001", at: min(10) }, { key: "off-0002", cardUid: "04AAAA0002", at: min(59, 1) }, { key: "off-0003", cardUid: "04AAAA0003", at: min(58, 59) }, { key: "off-0004", cardUid: "04AAAA0004", at: min(59, 30) }] }, charge));
    expect(Object.fromEntries(seen.map((x) => [x.key, x.guarantee]))).toEqual({ "off-0001": true, "off-0002": false, "off-0003": true, "off-0004": false });          // 59 s old: live; 61 s old: offline
  });
  it("never gives it to a live tap, whatever the card", async () => {
    const w = await world(); const d = await loaded(w); const { seen, charge } = spy(w.db); ok(await w.rs.tap({ terminalId: d, serial: "RK-1", cardUid: "04AAAA0001", key: "tap-0001" }, charge));
    expect(seen).toEqual([{ key: "tap-0001", guarantee: undefined }]);
  });
  it("passes a guaranteed fare on as accepted with its reason, and says what a blocked card owes", async () => {
    const w = await world(); const d = await loaded(w);
    const guaranteed = async (t: any) => ({ ...(await fakeCharge(w.db)(t)), guaranteed: true, owedCents: 2500 });
    const r = ok<any>(await w.rs.syncTaps({ terminalId: d, serial: "RK-1", taps: [{ key: "off-0001", cardUid: "04AAAA0001", at: min(10) }] }, guaranteed as any)); expect(r.results[0]).toMatchObject({ status: "accepted", code: "guaranteed" }); expect(r.results[0].message).toContain("blocked until it is topped up");
    const owes = async () => ({ ok: false as const, status: 402, code: "card_owes", message: "This card owes 25.00 from an earlier fare. Top it up to use it again.", owedCents: 2500 });
    expect(await w.rs.tap({ terminalId: d, serial: "RK-1", cardUid: "04AAAA0009", key: "tap-0002" }, owes as any)).toMatchObject({ ok: false, status: 402, code: "card_owes", owedCents: 2500 });
  });
});

