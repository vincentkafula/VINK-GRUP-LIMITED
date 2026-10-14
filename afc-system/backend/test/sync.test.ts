import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deviceSecret, signRequest, verifySignature } from "@afc/shared";
import { startHarness, tap, resetSeq, type Harness } from "./harness";
import { registerCard } from "../src/domain/cards";
import { SYSTEM } from "../src/domain/audit";
import { cardBalance } from "../src/domain/ledger";

let h: Harness;
beforeAll(async () => { h = await startHarness(); resetSeq(0); });
afterAll(async () => { await h.stop(); });

let n = 0;
const newCard = async (balance = 10_000, category: "adult" | "student" = "adult") => {
  const uid = "04c0" + (++n).toString(16).padStart(10, "0");
  await registerCard(h.db, SYSTEM, { uid, initialBalance: balance, category });
  return uid;
};
const anomalies = (uid: string) => h.db.anomaly.findMany({ where: { cardUid: uid }, orderBy: { createdAt: "asc" } });

describe("device authentication", () => {
  it("accepts a correctly signed request", async () => {
    const r = await h.sync([]);
    expect(r.status).toBe(200); expect(r.body.accepted).toEqual([]);
  });
  it("refuses a bad signature, an unknown device, and a wrong secret with the same answer", async () => {
    const wrong = await h.sync([], { secret: Buffer.alloc(32, 9) });
    const unknown = await h.sync([], { deviceId: "NOPE-1", secret: deviceSecret(h.config.deviceKeyMaster, "NOPE-1", 1) });
    expect(wrong.status).toBe(401); expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });
  it("refuses a request that is too old or too far ahead", async () => {
    expect((await h.sync([], { ts: Math.floor(Date.now() / 1000) - 400 })).body.why).toMatch(/window/);
    expect((await h.sync([], { ts: Math.floor(Date.now() / 1000) + 400 })).status).toBe(401);
  });
  it("refuses a replayed request (same nonce), even if the signature is genuine", async () => {
    const nonce = randomUUID();
    expect((await h.sync([], { nonce })).status).toBe(200);
    const again = await h.sync([], { nonce });
    expect(again.status).toBe(401); expect(again.body.why).toMatch(/replay/);
  });
  it("a body altered after signing is refused", async () => {
    const uid = await newCard();
    const raw = JSON.stringify({ deviceId: "VAL-0001", batch: [tap({ cardUid: uid, balanceBefore: 10_000 })], hotlistVersion: 0, fareTableVersion: 1, profilesVersion: 0 });
    const ts = Math.floor(Date.now() / 1000), nonce = randomUUID();
    const sig = signRequest(h.deviceSecret, ts, nonce, raw);
    const r = await h.app.inject({ method: "POST", url: "/api/device/sync", payload: raw.replace('"fare":1200', '"fare":1'), headers: { "content-type": "application/json", "x-device-id": "VAL-0001", "x-timestamp": String(ts), "x-nonce": nonce, "x-signature": sig } });
    expect(r.statusCode).toBe(401);
  });
  it("a request signed for one device cannot be sent as another", async () => {
    await h.api(await h.login("admin@afc.local"), "POST", "/api/devices", { id: "VAL-0002", name: "second" });
    const r = await h.sync([], { deviceId: "VAL-0002" });                    // signed with VAL-0001's secret
    expect(r.status).toBe(401);
  });
  it("a revoked device is refused, and its old secret stays dead after rotation", async () => {
    const admin = await h.login("admin@afc.local");
    const created = await h.api(admin, "POST", "/api/devices", { id: "VAL-0003", name: "third" });
    const secret = Buffer.from(created.body.secret, "hex");
    expect((await h.sync([], { deviceId: "VAL-0003", secret })).status).toBe(200);
    const rotated = await h.api(admin, "POST", "/api/devices/VAL-0003/rotate");
    expect((await h.sync([], { deviceId: "VAL-0003", secret })).status).toBe(401);
    expect((await h.sync([], { deviceId: "VAL-0003", secret: Buffer.from(rotated.body.secret, "hex") })).status).toBe(200);
    await h.api(admin, "POST", "/api/devices/VAL-0003/revoke");
    expect((await h.sync([], { deviceId: "VAL-0003", secret: Buffer.from(rotated.body.secret, "hex") })).status).toBe(401);
  });
  it("signs its reply so a device can reject an injected hotlist", async () => {
    const r = await h.sync([]);
    const body = JSON.stringify(r.body);
    // the server signs the exact bytes it sent; recompute over those bytes via a fresh call to read the raw reply
    const nonce = randomUUID(), ts = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify({ deviceId: "VAL-0001", batch: [], hotlistVersion: -1, fareTableVersion: 0, profilesVersion: -1 });
    const res = await h.app.inject({ method: "POST", url: "/api/device/sync", payload: raw, headers: { "content-type": "application/json", "x-device-id": "VAL-0001", "x-timestamp": String(ts), "x-nonce": nonce, "x-signature": signRequest(h.deviceSecret, ts, nonce, raw) } });
    expect(verifySignature(h.deviceSecret, Number(res.headers["x-server-timestamp"]), nonce, res.body, String(res.headers["x-response-signature"]))).toBe(true);
    expect(verifySignature(h.deviceSecret, Number(res.headers["x-server-timestamp"]), nonce, res.body.replace("hotlist", "hotl1st"), String(res.headers["x-response-signature"]))).toBe(false);
    void body;
  });
});

describe("accepting taps", () => {
  it("posts a fare to the books: card down, route revenue up", async () => {
    const uid = await newCard(10_000);
    const t = tap({ cardUid: uid, balanceBefore: 10_000, fare: 1200, cardCounter: 1 });
    const r = await h.sync([t]);
    expect(r.body.accepted).toEqual([t.id]);
    expect(await cardBalance(h.db, uid)).toBe(8800);
    const [{ s }] = await h.db.$queryRaw<{ s: bigint }[]>`SELECT SUM(amount) AS s FROM "Posting" WHERE account = 'revenue:route:2'`;
    expect(Number(s)).toBeGreaterThanOrEqual(1200);
    expect((await anomalies(uid))).toEqual([]);
  });

  it("sending the same batch again (a retry after a lost reply) changes nothing", async () => {
    const uid = await newCard(10_000);
    const batch = [tap({ cardUid: uid, balanceBefore: 10_000, cardCounter: 1 }), tap({ cardUid: uid, balanceBefore: 8800, cardCounter: 2 })];
    const first = await h.sync(batch);
    const second = await h.sync(batch);
    const third = await h.sync(batch);
    expect(first.body.accepted).toHaveLength(2);
    expect(second.body.accepted).toEqual([]); expect(second.body.duplicates).toHaveLength(2); expect(third.body.duplicates).toHaveLength(2);
    expect(await cardBalance(h.db, uid)).toBe(7600);
    expect(await h.db.txn.count({ where: { cardUid: uid } })).toBe(2);
  });

  it("the same transaction sent at the same moment twice is stored once", async () => {
    const uid = await newCard(10_000);
    const t = tap({ cardUid: uid, balanceBefore: 10_000, cardCounter: 1 });
    const rs = await Promise.all([h.sync([t]), h.sync([t]), h.sync([t])]);
    expect(rs.flatMap((r) => r.body.accepted)).toHaveLength(1);
    expect(await cardBalance(h.db, uid)).toBe(8800);
  });

  it("good and bad transactions in one batch are handled independently", async () => {
    const uid = await newCard(10_000);
    const good = tap({ cardUid: uid, balanceBefore: 10_000, cardCounter: 1 });
    const bad = { ...tap({ cardUid: uid }), fare: -5 } as never;
    const foreign = tap({ cardUid: uid, deviceId: "VAL-0002" });
    const future = tap({ cardUid: uid, tappedAt: new Date(Date.now() + 3600_000).toISOString() });
    const r = await h.sync([good, bad, foreign, future]);
    expect(r.body.accepted).toEqual([good.id]);
    expect(r.body.rejected).toHaveLength(3);
    expect(r.body.rejected.map((x) => x.reason).join("|")).toMatch(/malformed.*another device.*future/);
  });

  it("taps from two devices arriving out of order are both posted", async () => {
    const uid = await newCard(10_000);
    const t1 = tap({ cardUid: uid, balanceBefore: 10_000, cardCounter: 1 });
    const t2 = tap({ cardUid: uid, balanceBefore: 8800, cardCounter: 2 });
    await h.sync([t2]);                                  // the later tap arrives first
    await h.sync([t1]);
    expect(await cardBalance(h.db, uid)).toBe(7600);
    expect((await h.db.card.findUnique({ where: { uid } }))!.lastCounter).toBe(2);
  });

  it("offline taps are stored with their flag and appear in the revenue report", async () => {
    const uid = await newCard(10_000);
    await h.sync([tap({ cardUid: uid, balanceBefore: 10_000, cardCounter: 1, offline: true })]);
    const admin = await h.login("admin@afc.local");
    const rep = await h.api(admin, "GET", "/api/reports/revenue?groupBy=route");
    expect(rep.body.rows.find((r: { key: string }) => r.key === "R2").offlineTaps).toBeGreaterThanOrEqual(1);
  });

  it("denied taps are kept for the failed-taps report and do not touch the books", async () => {
    const uid = await newCard(100);
    const before = await cardBalance(h.db, uid);
    await h.sync([tap({ cardUid: uid, result: "denied", denyReason: "INSUFFICIENT_FUNDS", fare: 0, balanceBefore: 100, balanceAfter: 100, kind: undefined })]);
    expect(await cardBalance(h.db, uid)).toBe(before);
    const rep = await h.api(await h.login("admin@afc.local"), "GET", "/api/reports/failed-taps");
    expect(rep.body.rows.some((r: { reason: string }) => r.reason === "INSUFFICIENT_FUNDS")).toBe(true);
  });
});

describe("spotting trouble", () => {
  it("a second tap that claims a card counter already used is a clone/replay: kept, flagged HIGH, NOT posted", async () => {
    const uid = await newCard(10_000);
    await h.sync([tap({ cardUid: uid, balanceBefore: 10_000, cardCounter: 1 })]);
    await h.sync([tap({ cardUid: uid, balanceBefore: 10_000, cardCounter: 1, deviceSeq: 9999 })]);
    expect(await cardBalance(h.db, uid)).toBe(8800);
    const a = await anomalies(uid);
    expect(a.find((x) => x.kind === "DUPLICATE_COUNTER")).toMatchObject({ severity: "HIGH" });
    expect(await h.db.txn.count({ where: { cardUid: uid } })).toBe(2);
  });

  it("a balance that does not follow from the books is flagged", async () => {
    const uid = await newCard(10_000);
    await h.sync([tap({ cardUid: uid, balanceBefore: 7000, balanceAfter: 5800, cardCounter: 1 })]);     // card claims R70 but the books say R100
    expect((await anomalies(uid)).map((x) => x.kind)).toContain("BALANCE_MISMATCH");
  });

  it("value appearing on a card with no money history at all is HIGH", async () => {
    const uid = await newCard(0);
    await h.sync([tap({ cardUid: uid, balanceBefore: 5000, balanceAfter: 3800, cardCounter: 1 })]);
    const a = await anomalies(uid);
    expect(a.find((x) => x.kind === "BALANCE_MISMATCH")).toMatchObject({ severity: "HIGH" });
    expect(a.map((x) => x.kind)).toContain("LEDGER_BEHIND_CARD");
    expect(await cardBalance(h.db, uid)).toBe(3800);                     // the books follow the physical card, and say so
  });

  it("a device that reports impossible arithmetic or a fare no route can charge is flagged HIGH", async () => {
    const uid = await newCard(10_000);
    await h.sync([tap({ cardUid: uid, balanceBefore: 10_000, balanceAfter: 9990, fare: 1200, cardCounter: 1 })]);
    await h.sync([tap({ cardUid: uid, balanceBefore: 8800, balanceAfter: 800, fare: 8000, cardCounter: 2 })]);
    const kinds = (await anomalies(uid)).map((x) => `${x.kind}:${x.severity}`);
    expect(kinds).toContain("TXN_ARITHMETIC:HIGH"); expect(kinds).toContain("FARE_OUT_OF_RANGE:HIGH");
  });

  it("three serious problems in a day block the card and put it on the hotlist", async () => {
    const uid = await newCard(10_000);
    for (let c = 1; c <= 3; c++) await h.sync([tap({ cardUid: uid, balanceBefore: 10_000, balanceAfter: 1, fare: 1200, cardCounter: c })]);    // arithmetic lie x3
    const card = await h.db.card.findUnique({ where: { uid } });
    expect(card!.status).toBe("BLOCKED"); expect(card!.blockedReason).toMatch(/automatically/);
    const r = await h.sync([], { versions: { hotlistVersion: 0 } });
    expect(r.body.hotlist!.uids).toContain(uid);
  });

  it("a gap in a device's sequence numbers and an unregistered card are noted", async () => {
    resetSeq(500);
    await h.sync([tap({ cardUid: "04ffffffffff01", balanceBefore: 1000, balanceAfter: 0, fare: 1000, cardCounter: 1, deviceSeq: 900 })]);
    expect((await h.db.anomaly.findMany({ where: { kind: "DEVICE_SEQ_GAP" } })).length).toBeGreaterThan(0);
    expect((await anomalies("04ffffffffff01")).map((x) => x.kind)).toContain("UNREGISTERED_CARD");
  });

  it("a card that fails the key check is recorded as a security event", async () => {
    const uid = await newCard();
    await h.sync([tap({ cardUid: uid, result: "denied", denyReason: "INVALID_CARD", fare: 0, kind: undefined })]);
    expect((await anomalies(uid)).map((x) => x.kind)).toContain("CARD_AUTH_FAILED");
  });
});

describe("keeping devices up to date", () => {
  it("sends the hotlist, card profiles and fare table when the device's versions are old, and nothing when current", async () => {
    const admin = await h.login("admin@afc.local");
    const uid = await newCard(5000, "student");
    await h.api(admin, "PATCH", `/api/cards/${uid}/category`, { category: "student" });
    const stale = await h.sync([], { versions: { hotlistVersion: -1, profilesVersion: -1, fareTableVersion: 0 } });
    expect(stale.body.fareTable?.routes.length).toBe(2);
    expect(stale.body.profiles!.cards.find((c) => c.uid === uid)).toMatchObject({ category: "student" });
    expect(stale.body.hotlist).toBeDefined();
    const v = { hotlistVersion: stale.body.hotlist!.version, profilesVersion: stale.body.profiles!.version, fareTableVersion: stale.body.fareTable!.version };
    const current = await h.sync([], { versions: v });
    expect(current.body.hotlist).toBeUndefined(); expect(current.body.profiles).toBeUndefined(); expect(current.body.fareTable).toBeUndefined();
  });

  it("blocking a card puts it on the hotlist the device receives next; unblocking takes it off", async () => {
    const admin = await h.login("admin@afc.local");
    const uid = await newCard();
    const base = (await h.sync([], { versions: { hotlistVersion: -1 } })).body.hotlist!;
    await h.api(admin, "PATCH", `/api/cards/${uid}/status`, { status: "LOST", reason: "reported stolen" });
    const after = (await h.sync([], { versions: { hotlistVersion: base.version } })).body.hotlist!;
    expect(after.version).toBeGreaterThan(base.version); expect(after.uids).toContain(uid);
    await h.api(admin, "PATCH", `/api/cards/${uid}/status`, { status: "ACTIVE" });
    expect((await h.sync([], { versions: { hotlistVersion: after.version } })).body.hotlist!.uids).not.toContain(uid);
  });

  it("publishing a new fare table reaches devices", async () => {
    const op = await h.login("operator@afc.local");
    const cur = (await h.api(op, "GET", "/api/fares/published")).body.table;
    const pub = await h.api(op, "POST", "/api/fares/publish");
    expect(pub.status).toBe(201); expect(pub.body.table.version).toBe(cur.version + 1);
    const r = await h.sync([], { versions: { fareTableVersion: cur.version } });
    expect(r.body.fareTable!.version).toBe(cur.version + 1);
  });
});
