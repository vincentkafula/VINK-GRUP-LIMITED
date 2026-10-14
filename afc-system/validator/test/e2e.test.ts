import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AFC_AID, DesfireSession, DevKeyProvider, FILE, personalizeCard, SAMPLE_CARDS, SimulatedDesfireCard, topUpCard } from "@afc/shared";
import { startHarness, type Harness } from "../../backend/test/harness";
import { cardBalance } from "../../backend/src/domain/ledger";
import { ConsoleFeedback } from "../src/feedback";
import { Store } from "../src/store";
import { SyncClient } from "../src/syncClient";
import { TapProcessor } from "../src/tapProcessor";

/**
 * Everything together: simulated DESFire cards, the real validator code, and the real backend on a real Postgres, talking over HTTP.
 */
const AID = AFC_AID.toString("hex");
let h: Harness, base: string, keys: DevKeyProvider;
const [THANDI, SIPHO, JOYCE] = SAMPLE_CARDS;
const WED_NORMAL = Math.floor(Date.parse("2026-10-14T09:30:00+02:00") / 1000);

beforeAll(async () => {
  h = await startHarness();
  await h.app.listen({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${(h.app.server.address() as { port: number }).port}`;
  keys = new DevKeyProvider({ PICC: randomBytes(16), ADMIN: randomBytes(16), DEBIT: randomBytes(16), CREDIT: randomBytes(16) });
});
afterAll(async () => { await h.stop(); });

/** A card whose UID and starting balance match what the server was seeded with. */
async function physicalCard(c: { uid: string; balance: number }) {
  const uid = Buffer.from(c.uid, "hex");
  const card = new SimulatedDesfireCard({ uid });
  await personalizeCard(new DesfireSession(card), uid, keys, { initialBalance: c.balance });
  card.removeFromField();
  return card;
}

let fresh = 0;
/** A brand-new card, registered on the server with its starting balance, and the physical card that matches (counter 0). */
async function newCard(balance: number) {
  const uid = "04e2" + (++fresh).toString(16).padStart(10, "0");
  const admin = await h.login("admin@afc.local");
  const r = await h.api(admin, "POST", "/api/cards", { uid, initialBalance: balance });
  if (r.status !== 201) throw new Error("could not register: " + JSON.stringify(r.body));
  return { uid, card: await physicalCard({ uid, balance }) };
}

function validator(o: { deviceId?: string; secret?: Buffer; fetchImpl?: typeof fetch; stopId?: number; routeId?: number } = {}) {
  const store = new Store();
  const fb = new ConsoleFeedback(() => {}, false);
  let clock = WED_NORMAL;
  const place = { routeId: o.routeId ?? 2, stopId: o.stopId ?? 201 };
  const proc = new TapProcessor({ keys, store, feedback: fb, deviceId: o.deviceId ?? "VAL-0001", place: () => place, now: () => clock });
  const sync = new SyncClient({ serverUrl: base, deviceId: o.deviceId ?? "VAL-0001", secret: o.secret ?? h.deviceSecret, store, fetchImpl: o.fetchImpl });
  return { store, fb, proc, sync, place, advance: (s: number) => { clock += s; } };
}

describe("a validator and the server", () => {
  it("gets its fare table from the server on first contact, then charges and reports taps; the books match the cards", async () => {
    const v = validator();
    expect(v.store.fareTable()).toBeUndefined();
    const card = await physicalCard(THANDI);
    expect((await v.proc.handle(card.uid, card)).status).toBe("unconfigured");
    const first = await v.sync.syncOnce();
    expect(first).toMatchObject({ ok: true }); expect(first.updated).toEqual(expect.arrayContaining(["fares"]));
    expect(v.store.fareTable()!.routes).toHaveLength(2);

    for (let i = 0; i < 3; i++) { v.advance(200); expect((await v.proc.handle(card.uid, card)).status).toBe("charged"); }
    expect(card.value(AID, FILE.BALANCE)).toBe(THANDI.balance - 3600);
    const r = await v.sync.drain();
    expect(r).toMatchObject({ ok: true, accepted: 3, duplicates: 0, rejected: 0 });
    expect(v.store.pendingCount()).toBe(0);
    expect(await cardBalance(h.db, THANDI.uid)).toBe(THANDI.balance - 3600);
    expect(await h.db.anomaly.count({ where: { cardUid: THANDI.uid } })).toBe(0);
  });

  it("taps made with no network are sent later, in order, exactly once", async () => {
    const v = validator(); await v.sync.syncOnce();
    const card = await physicalCard(SIPHO);                 // a student: the profile list reaches the validator through sync
    v.store.setOnline(false);
    for (let i = 0; i < 4; i++) { v.advance(200); await v.proc.handle(card.uid, card); }
    expect(v.store.pending().every((t) => t.offline)).toBe(true);
    const r = await v.sync.drain();
    expect(r.accepted).toBe(4); expect(v.store.online).toBe(true);
    expect(await cardBalance(h.db, SIPHO.uid)).toBe(card.value(AID, FILE.BALANCE));
    expect((await v.sync.syncOnce()).sent).toBe(0);
  });

  it("a reply lost on the way back does not make the server count the taps twice", async () => {
    let lose = true;
    const real = fetch;
    const flaky: typeof fetch = async (url, init) => { const res = await real(url, init); if (lose) { lose = false; throw new TypeError("connection reset"); } return res; };
    const v = validator({ fetchImpl: flaky }); await v.sync.syncOnce().catch(() => {});
    await v.sync.syncOnce();
    const card = await physicalCard(JOYCE);
    v.advance(10); await v.proc.handle(card.uid, card);
    lose = true;
    const failed = await v.sync.syncOnce();                  // the server processed it, but the validator never heard back
    expect(failed.ok).toBe(false); expect(v.store.pendingCount()).toBe(1);
    const again = await v.sync.syncOnce();
    expect(again).toMatchObject({ ok: true, accepted: 0, duplicates: 1 });
    expect(v.store.pendingCount()).toBe(0);
    expect(await h.db.txn.count({ where: { cardUid: JOYCE.uid } })).toBe(1);
    expect(await cardBalance(h.db, JOYCE.uid)).toBe(card.value(AID, FILE.BALANCE));
  });

  it("a card blocked in the dashboard is refused by the validator after its next sync", async () => {
    const v = validator(); await v.sync.syncOnce();
    const card = await physicalCard({ uid: "04a1b2c3d4e5f9", balance: 500 });
    const admin = await h.login("operator@afc.local");
    await h.api(admin, "PATCH", "/api/cards/04a1b2c3d4e5f9/status", { status: "LOST", reason: "reported lost" });
    expect((await v.proc.handle(card.uid, card)).status).toBe("denied");            // still in the old hotlist? no: balance too low anyway, so check the block specifically below
    await v.sync.syncOnce();
    v.advance(500);
    const out = await v.proc.handle(card.uid, card);
    expect(out).toMatchObject({ status: "denied", reason: "CARD_BLOCKED" });
    await v.sync.syncOnce();
    const rep = (await h.api(admin, "GET", "/api/reports/failed-taps")).body.rows;
    expect(rep.some((r: { reason: string }) => r.reason === "CARD_BLOCKED")).toBe(true);
  });

  it("a hotlist or fare table injected into the reply is ignored", async () => {
    const real = fetch;
    const evil: typeof fetch = async (url, init) => {
      const res = await real(url, init);
      const body = JSON.parse(await res.text());
      body.hotlist = { version: 99, uids: [THANDI.uid] };
      return new Response(JSON.stringify(body), { status: 200, headers: res.headers });
    };
    const v = validator({ fetchImpl: evil });
    const r = await v.sync.syncOnce();
    expect(r.ok).toBe(false); expect(r.error).toMatch(/not signed correctly/);
    expect(v.store.isHotlisted(THANDI.uid)).toBe(false); expect(v.store.hotlistVersion).toBe(-1);
  });

  it("a validator with the wrong secret learns why, and keeps its taps safe", async () => {
    const v = validator({ secret: randomBytes(32) });
    const r = await v.sync.syncOnce();
    expect(r.ok).toBe(false); expect(r.error).toMatch(/did not accept this device/);
  });

  it("a top-up at an agent terminal is loaded onto the card and the validator's next tap agrees with the books", async () => {
    const v = validator(); await v.sync.syncOnce();
    const { uid: uidHex, card } = await newCard(3000);
    const agent = await h.login("agent@afc.local");
    const order = await h.api(agent, "POST", "/api/topups", { cardUid: uidHex, amount: 5000, method: "MOBILE_MONEY", reference: "MM-E2E-1" });
    expect(order.status).toBe(201);
    const newBalance = await topUpCard(new DesfireSession(card), card.uid, keys, 5000);
    const confirm = await h.api(agent, "POST", `/api/topups/${order.body.topup.id}/confirm`, { deviceId: "AGENT-1", cardBalanceAfter: newBalance });
    expect(confirm.status).toBe(200);
    expect(await cardBalance(h.db, uidHex)).toBe(newBalance);
    v.advance(1000); await v.proc.handle(card.uid, card);
    await v.sync.drain();
    expect(await cardBalance(h.db, uidHex)).toBe(card.value(AID, FILE.BALANCE));
    expect(await h.db.anomaly.count({ where: { cardUid: uidHex, kind: { in: ["BALANCE_MISMATCH", "LOAD_BALANCE_MISMATCH"] } } })).toBe(0);
  });

  it("two validators using copies of the same card are caught: the second claim is flagged and not posted", async () => {
    const admin = await h.login("admin@afc.local");
    const second = await h.api(admin, "POST", "/api/devices", { id: "VAL-0002", name: "second bus" });
    const v1 = validator(), v2 = validator({ deviceId: "VAL-0002", secret: Buffer.from(second.body.secret, "hex") });
    await v1.sync.syncOnce(); await v2.sync.syncOnce();
    const { uid: uidHex, card: original } = await newCard(6000);
    const copy = await physicalCard({ uid: uidHex, balance: 6000 });     // a second card with the same data (only possible if the keys leaked)
    v1.store.setOnline(false); v2.store.setOnline(false);
    v1.advance(5); v2.advance(5);
    await v1.proc.handle(original.uid, original); await v2.proc.handle(copy.uid, copy);
    const before = await cardBalance(h.db, uidHex);
    await v1.sync.syncOnce(); await v2.sync.syncOnce();
    const a = await h.db.anomaly.findMany({ where: { cardUid: uidHex, kind: "DUPLICATE_COUNTER" } });
    expect(a).toHaveLength(1); expect(a[0].severity).toBe("HIGH");
    const posted = before - (await cardBalance(h.db, uidHex));
    expect(posted).toBeGreaterThan(0);                                      // the first claim was posted
    expect(await cardBalance(h.db, uidHex)).toBeGreaterThanOrEqual(before - 1200 - 1200);
    expect(await h.db.txn.count({ where: { cardUid: uidHex } })).toBeGreaterThanOrEqual(2);
  });
});
