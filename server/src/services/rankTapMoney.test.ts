import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createRankSessions, type RankSessions } from "../portal/rankSessions.js";
import { createMoneyEngine, manshyaLedgerPort, walletLedgerAccount, type Engine, type LedgerPort } from "./moneyEngine.js";
import { createTokenService, type TokenService } from "./tokenService.js";
import { recordPoolCredit } from "./poolService.js";
import { DEFAULT_ZA } from "../config/countryConfig.js";
import { MockCardRail } from "../payments/providers/mockCardRail.js";
import { pinClock, unpinClock } from "../testClock.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Money on a SHARED RANK DEVICE, with the real token service, ledger and money engine. The device has no owner, driver or vehicle of its own, so whatever is credited can only have come from
 * the loading session: the driver who tapped their card to pair it (drivers change), and the vehicle the marshal put on it.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { owner: id(1), d1: id(2), d2: id(3), marshal: id(4), investor: id(5), assoc: id(6), pax: id(7), pax2: id(8) };
const RANK = id(100), RANK2 = id(101), ROUTE = id(102), DEVICE = id(103), VEH = id(104);
const CARD = { pax: "04A1B2C3", pax2: "04B2C3D4", d1: "04D1D1D1D1", d2: "04D2D2D2D2" };
const NOW = new Date("2026-10-07T10:00:00Z");
const FARE = 2500;                                                                  // R25.00 on the route
const FEE = 100;                                                                    // the platform's flat fee in the default country profile: R0.50 device side + R0.50 card side
const reader = { active: async () => ({ version: 1, config: DEFAULT_ZA }), invalidate() {} } as never;

type Mod = Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>;
let mod: Mod, db: Db, ledger: LedgerPort, engine: Engine, tokens: TokenService, rs: RankSessions, n = 0;
const tok = (u: string) => ledger.balance(walletLedgerAccount("ZAR", u));
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Record<string, any>[];
const topUp = async (user: string, cents: number) => {
  const w = await tokens.wallet(user, "ZAR");
  const r = await recordPoolCredit({ db, ledger, engine, reader }, { bankRef: `BANK-${++n}-${Date.now()}`, reference: w!.accountNumber!, amountCents: cents, currency: "ZAR", by: null });
  expect(r.status).toBe("credited");
};
const open = () => rs.open({ rankId: RANK, marshalId: U.marshal, actorName: "marshal", terminalId: DEVICE });
const pair = (uid: string) => rs.pair({ terminalId: DEVICE, serial: "RK-1", cardUid: uid });
const tapOn = (key: string, uid = CARD.pax) => rs.tap({ terminalId: DEVICE, serial: "RK-1", cardUid: uid, key }, (t) => tokens.tapToken(t));
const ok = (r: any) => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const queueUp = async () => { await db.query(`INSERT INTO rank_queue (rank_id, vehicle_id) VALUES ($1,$2)`, [RANK, VEH]); };
/** a loaded vehicle: a session opened and paired by the given driver card */
const loading = async (driverCard = CARD.d1) => { await queueUp(); const s = ok(await open()); ok(await pair(driverCard)); return s as { id: string }; };

beforeEach(async () => {
  pinClock("2026-10-07T10:00:00Z");
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb();
  const core = manshyaBankCore(mod as never);
  const people: [string, string, string][] = [[U.owner, "Oz", "vehicle_owner"], [U.d1, "Dee", "driver"], [U.d2, "Dan", "driver"], [U.marshal, "Mo", "marshal"], [U.investor, "Ina", "investor"], [U.assoc, "Assoc", "association"], [U.pax, "Pax", "personal"], [U.pax2, "Pam", "personal"]];
  for (const [u, name, role] of people) { await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u, name, `${name}@x.test`, role]); core.ensureMerchant(u, name); }
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa'), ($3,$2,'Bellville')`, [RANK, U.assoc, RANK2]);
  await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2)`, [RANK, U.marshal]);
  await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents, from_rank_id, to_rank_id) VALUES ($1,$2,'Langa to Bellville',$3,$4,$5)`, [ROUTE, U.assoc, FARE, RANK, RANK2]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, seats) VALUES ($1,$2,'CA 111-111',15)`, [VEH, U.owner]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner'), ($1,$3,'active','owner')`, [U.owner, U.d1, U.d2]);
  // the shared device: no owner, no driver, no vehicle of its own; an investor sponsored it and the association runs the route
  await db.query(`INSERT INTO terminals (id, serial, kind, rank_id, route_id, investor_id, association_id) VALUES ($1,'RK-1','rank',$2,$3,$4,$5)`, [DEVICE, RANK, ROUTE, U.investor, U.assoc]);
  ledger = manshyaLedgerPort(mod as never);
  tokens = createTokenService({ db, ledger, reader, rail: (() => { const m = new MockCardRail(); return { name: "mock", vault: m, payout: m }; })() });
  engine = createMoneyEngine({ db, ledger, reader, tokenParty: tokens.partyOf });
  tokens.bindEngine(engine);
  for (const [u, , role] of people) await tokens.openWallet(u, ({ vehicle_owner: "owner", personal: "passenger" } as Record<string, string>)[role] as never ?? (role as never), "ZAR");
  for (const [u, uid] of [[U.pax, CARD.pax], [U.pax2, CARD.pax2], [U.d1, CARD.d1], [U.d2, CARD.d2]] as const) ok(await tokens.linkCard(u, "ZAR", uid).then((r) => r));
  await topUp(U.pax, 100_000); await topUp(U.pax2, 100_000);
  rs = createRankSessions(db, () => NOW, undefined, { onClosed: (sid) => engine.closeSessionTrip(sid) });
});
afterEach(() => unpinClock());

describe("a passenger's fare goes to the driver who paired the session", () => {
  it("takes the fare from the passenger and credits the driver with it less the platform fee, and nothing to the owner", async () => {
    await loading(); const before = tok(U.pax);
    const r = ok(await tapOn("tap-0001")); expect(r).toMatchObject({ fareCents: FARE, replayed: false, session: { passengers: 1, totalCents: FARE, driverName: "Dee", registration: "CA 111-111" } });
    expect(tok(U.pax)).toBe(before - FARE); expect(tok(U.d1)).toBe(FARE - FEE); expect(tok(U.owner)).toBe(0); expect(tok(U.d2)).toBe(0);
    expect((await q(`SELECT status FROM tap_settlements`))[0].status).toBe("settled");
  });
  it("credits a substitute driver, not the vehicle's usual one, when the driver changes", async () => {
    await loading(CARD.d1); ok(await tapOn("tap-0001")); expect(tok(U.d1)).toBe(FARE - FEE);
    const first = await q(`SELECT id FROM loading_sessions`); ok(await rs.close({ sessionId: first[0].id, rankId: RANK, marshalId: U.marshal, actorName: "m", passengers: 1 }));
    await loading(CARD.d2); ok(await tapOn("tap-0002", CARD.pax2)); ok(await tapOn("tap-0003"));          // a second driver now has the same vehicle
    expect(tok(U.d2)).toBe(2 * (FARE - FEE)); expect(tok(U.d1)).toBe(FARE - FEE);                            // the first driver's money is untouched
  });
  it("pays the owner instead when the owner and that driver have a salary agreement (the owner pays the driver), and the driver on a cash basis keeps it", async () => {
    await db.query(`INSERT INTO driver_agreements (owner_id, driver_id, mode, amount_cents, pay_day, start_date, status) VALUES ($1,$2,'monthly_salary',300000,25,'2026-10-01','active')`, [U.owner, U.d1]);
    await loading(CARD.d1); ok(await tapOn("tap-0001")); expect(tok(U.owner)).toBe(FARE - FEE); expect(tok(U.d1)).toBe(0);
    await db.query(`UPDATE driver_agreements SET status = 'ended'`); await db.query(`INSERT INTO driver_agreements (owner_id, driver_id, mode, amount_cents, pay_day, start_date, status) VALUES ($1,$2,'cash_basis_weekly',150000,5,'2026-10-01','active')`, [U.owner, U.d2]);
    const s = (await q(`SELECT id FROM loading_sessions`))[0].id; ok(await rs.close({ sessionId: s, rankId: RANK, marshalId: U.marshal, actorName: "m" })); await loading(CARD.d2); ok(await tapOn("tap-0002")); expect(tok(U.d2)).toBe(FARE - FEE);
  });
  it("charges nothing when no driver has paired: before the driver's card, with no session, and after the vehicle has departed", async () => {
    const before = tok(U.pax);
    expect(await tapOn("tap-0001")).toMatchObject({ ok: false, code: "no_session" });                          // nothing loading
    await queueUp(); ok(await open()); expect(await tapOn("tap-0002")).toMatchObject({ ok: false, code: "not_paired" });
    ok(await pair(CARD.d1)); ok(await tapOn("tap-0003"));
    ok(await rs.close({ sessionId: (await q(`SELECT id FROM loading_sessions`))[0].id, rankId: RANK, marshalId: U.marshal, actorName: "m" }));
    expect(await tapOn("tap-0004")).toMatchObject({ ok: false, code: "no_session" });
    expect(tok(U.pax)).toBe(before - FARE); expect((await q(`SELECT id FROM terminal_taps`)).length).toBe(1);   // only the one tap while paired was ever recorded
  });
  it("answers a retry with the same reference as before and charges once, and refuses the same card again a moment later on a new reference", async () => {
    await loading(); ok(await tapOn("tap-0001")); const after = tok(U.pax);
    expect(ok(await tapOn("tap-0001"))).toMatchObject({ replayed: true, session: { passengers: 1 } }); expect(tok(U.pax)).toBe(after);
    expect(await tapOn("tap-0002")).toMatchObject({ ok: false, status: 409, code: "duplicate_tap" }); expect(tok(U.pax)).toBe(after);
    await db.query(`UPDATE terminal_taps SET received_at = $1`, [new Date(Date.now() - 11_000)]);                // ... but not forever: someone paying for a second seat can tap again
    expect(ok(await tapOn("tap-0003"))).toMatchObject({ session: { passengers: 2, totalCents: 2 * FARE } }); expect(tok(U.pax)).toBe(after - FARE);
    expect(((await q(`SELECT details FROM audit_log WHERE action = 'rank.tap_blocked'`))).length).toBe(1);
  });
  it("lets different cards tap together, and declines a card with too few tokens without moving anything or counting a passenger", async () => {
    await loading(); ok(await tapOn("tap-0001")); ok(await tapOn("tap-0002", CARD.pax2));
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,'poor','Poor','p@x.test','personal')`, [id(50)]); await tokens.openWallet(id(50), "passenger", "ZAR"); await tokens.linkCard(id(50), "ZAR", "04F0F0F0");
    const d1 = tok(U.d1); expect(await tapOn("tap-0003", "04F0F0F0")).toMatchObject({ ok: false, status: 402, code: "insufficient_tokens" });
    expect(tok(U.d1)).toBe(d1); expect((await q(`SELECT passengers, total_cents FROM loading_sessions`))[0]).toMatchObject({ passengers: 2, total_cents: 2 * FARE });
    expect((await q(`SELECT status, session_id FROM terminal_taps WHERE status = 'declined'`))[0].session_id).toBeTruthy();             // the decline is on the session's record
  });
});

describe("a departed session becomes one trip for its own vehicle, driver and marshal", () => {
  it("makes the trip with the session's driver, the vehicle's owner and the marshal, and puts the marshal fee and the device fee on that driver", async () => {
    const s = await loading(); ok(await tapOn("tap-0001")); ok(await tapOn("tap-0002", CARD.pax2));
    const closed = ok(await rs.close({ sessionId: s.id, rankId: RANK, marshalId: U.marshal, actorName: "marshal", passengers: 2 }));
    const trips = await q(`SELECT * FROM trips`); expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ terminal_id: DEVICE, vehicle_id: VEH, driver_id: U.d1, owner_id: U.owner, marshal_id: U.marshal, departure_id: closed.departureId, taps: 2, fare_cents: 2 * FARE });
    const items = await q(`SELECT kind, payer_id, payee_id FROM payment_items ORDER BY kind, payee_id`);
    expect(items.find((i) => i.kind === "marshal_fee")).toMatchObject({ payer_id: U.d1, payee_id: U.marshal });                      // the driver pays the marshal fee out of the fares
    expect(items.find((i) => i.kind === "per_trip_pay")).toMatchObject({ payer_id: U.d1, payee_id: U.investor });                    // and the sponsoring investor's device fee
    expect((await q(`SELECT trip_id FROM terminal_taps WHERE status = 'confirmed'`)).every((t) => t.trip_id === trips[0].id)).toBe(true);
  });
  it("makes it once, however often it is asked, and the ordinary trip run never makes a second one from the same taps", async () => {
    const s = await loading(); ok(await tapOn("tap-0001"));
    ok(await rs.close({ sessionId: s.id, rankId: RANK, marshalId: U.marshal, actorName: "m" }));
    expect(await engine.closeSessionTrip(s.id)).toEqual({ trip: null }); expect(await engine.closeTrips()).toEqual({ trips: 0 }); expect((await q(`SELECT id FROM trips`)).length).toBe(1);
    expect((await q(`SELECT kind FROM payment_items WHERE kind = 'marshal_fee'`)).length).toBe(1);
  });
  it("makes the trip on the next cycle if the hook at departure failed, so a departed session is never left without one", async () => {
    const failing = createRankSessions(db, () => NOW, undefined, { onClosed: async () => { throw new Error("down"); } });
    await queueUp(); ok(await failing.open({ rankId: RANK, marshalId: U.marshal, actorName: "m", terminalId: DEVICE })); ok(await failing.pair({ terminalId: DEVICE, serial: "RK-1", cardUid: CARD.d1 })); ok(await tapOn("tap-0001"));
    const sid = (await q(`SELECT id FROM loading_sessions`))[0].id; ok(await failing.close({ sessionId: sid, rankId: RANK, marshalId: U.marshal, actorName: "m" }));       // the departure stands even though the hook threw
    expect((await q(`SELECT id FROM trips`)).length).toBe(0); expect(await engine.closeTrips()).toEqual({ trips: 1 }); expect((await q(`SELECT driver_id FROM trips`))[0].driver_id).toBe(U.d1);
  });
  it("does not turn the taps of a vehicle that is still loading into a trip: the ordinary trip run leaves them to the session, and the one trip has all of them when it departs", async () => {
    const sess = await loading(); ok(await tapOn("tap-0001")); ok(await tapOn("tap-0002", CARD.pax2));
    expect(await engine.closeTrips()).toEqual({ trips: 0 }); expect((await q(`SELECT id FROM trips`)).length).toBe(0);                  // the money cycle ran mid-load and made nothing
    ok(await rs.close({ sessionId: sess.id, rankId: RANK, marshalId: U.marshal, actorName: "m" }));
    expect(await q(`SELECT taps, fare_cents FROM trips`)).toEqual([{ taps: 2, fare_cents: 2 * FARE }]);
  });
  it("makes no trip for a session that collected nothing", async () => {
    const s = await loading(); ok(await rs.close({ sessionId: s.id, rankId: RANK, marshalId: U.marshal, actorName: "m", passengers: 0 })); expect((await q(`SELECT id FROM trips`)).length).toBe(0);
  });
});
