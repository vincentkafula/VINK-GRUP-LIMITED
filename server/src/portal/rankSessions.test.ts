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
import { cardHash } from "../services/tokenService.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Loading sessions on a shared rank device, on a real (in-memory) Postgres: the marshal opens a session, the DRIVER pairs it with their own card, the vehicle departs and the next one loads.
 */
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
  it("lets only one of two simultaneous requests open the same device", async () => {
    const w = await world(); const d = await w.device("RK-1"); await w.queue(w.rank, w.v1); await w.queue(w.rank, w.v2);
    const [a, b] = await Promise.all([1, 2].map(() => w.rs.open({ rankId: w.rank, marshalId: U.marshal, actorName: "m", terminalId: d })));
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
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
    const refusals = await w.audit("rank.pair_refused"); expect(refusals.map((r: any) => JSON.parse(r.details).reason)).toEqual(["card_unknown", "not_driver_card", "wrong_driver", "card_blocked", "card_blocked"]);
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

