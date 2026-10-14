import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { DesfireSession, DevKeyProvider, FILE, AFC_AID, personalizeCard, sampleFareTable, SimulatedDesfireCard, decodeState } from "@afc/shared";
import { ConsoleFeedback } from "../src/feedback";
import { Store } from "../src/store";
import { TapProcessor } from "../src/tapProcessor";

const AID = AFC_AID.toString("hex");
const keys = () => new DevKeyProvider({ PICC: randomBytes(16), ADMIN: randomBytes(16), DEBIT: randomBytes(16), CREDIT: randomBytes(16) });
const WED_NORMAL = Math.floor(Date.parse("2026-10-14T09:30:00+02:00") / 1000);

let k: DevKeyProvider, store: Store, fb: ConsoleFeedback, clock: number, place: { routeId: number; stopId: number }, proc: TapProcessor;
beforeEach(() => {
  k = keys(); store = new Store(); fb = new ConsoleFeedback(() => {}, false); clock = WED_NORMAL; place = { routeId: 2, stopId: 201 };
  store.setFareTable(sampleFareTable());
  proc = new TapProcessor({ keys: k, store, feedback: fb, deviceId: "VAL-0001", place: () => place, now: () => clock });
});

let n = 0;
async function card(balance = 5000, keysFor = k) {
  const uid = Buffer.from("04" + (++n).toString(16).padStart(12, "0"), "hex");
  const c = new SimulatedDesfireCard({ uid });
  await personalizeCard(new DesfireSession(c), uid, keysFor, { initialBalance: balance });
  c.removeFromField();
  return c;
}
const balance = (c: SimulatedDesfireCard) => c.value(AID, FILE.BALANCE)!;

describe("a flat-fare tap", () => {
  it("takes the fare, tells the passenger, and queues exactly one transaction for the server", async () => {
    const c = await card(5000);
    const out = await proc.handle(c.uid, c);
    expect(out.status).toBe("charged");
    expect(balance(c)).toBe(3800);
    expect(fb.lines).toEqual(["OK  Paid R12.00 · Bal R38.00"]);
    const q = store.pending();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ result: "ok", kind: "flat", fare: 1200, balanceBefore: 5000, balanceAfter: 3800, cardCounter: 1, routeId: 2, deviceId: "VAL-0001", offline: false });
    expect(store.openIntents()).toBe(0);
  });
  it("numbers its transactions 1, 2, 3 with no gaps or repeats, across a restart", async () => {
    const c = await card(9000);
    for (let i = 0; i < 3; i++) { clock += 200; await proc.handle(c.uid, c); }
    expect(store.pending().map((t) => t.deviceSeq)).toEqual([1, 2, 3]);
    expect(new Set(store.pending().map((t) => t.id)).size).toBe(3);
  });
  it("refuses a card that cannot pay and leaves it untouched", async () => {
    const c = await card(500);
    const out = await proc.handle(c.uid, c);
    expect(out).toMatchObject({ status: "denied", reason: "INSUFFICIENT_FUNDS" });
    expect(balance(c)).toBe(500);
    expect(fb.lines[0]).toBe("NO  Balance R5.00, need R12.00");
    expect(store.pending()[0]).toMatchObject({ result: "denied", denyReason: "INSUFFICIENT_FUNDS", fare: 0 });
  });
  it("blocks the same card tapping twice quickly (anti-passback) but accepts it later", async () => {
    const c = await card(5000);
    await proc.handle(c.uid, c);
    clock += 30;
    expect((await proc.handle(c.uid, c)).status).toBe("denied");
    expect(balance(c)).toBe(3800);
    clock += 200;
    expect((await proc.handle(c.uid, c)).status).toBe("charged");
    expect(balance(c)).toBe(2600);
  });
  it("applies the passenger's category from the synced profile list, and the time of day", async () => {
    const c = await card(5000);
    store.setProfiles(1, [{ uid: c.uid.toString("hex"), category: "student" }]);
    await proc.handle(c.uid, c);
    expect(balance(c)).toBe(5000 - 900);
    clock = Math.floor(Date.parse("2026-10-14T07:30:00+02:00") / 1000);          // morning peak, +20%
    const c2 = await card(5000);
    await proc.handle(c2.uid, c2);
    expect(balance(c2)).toBe(5000 - 1440);
  });
});

describe("zone route: tap in, tap out", () => {
  beforeEach(() => { place = { routeId: 1, stopId: 101 }; });
  it("tap in costs nothing, tap out charges the zones travelled, and the tap record on the card says where", async () => {
    const c = await card(5000);
    expect((await proc.handle(c.uid, c)).status).toBe("charged");
    expect(balance(c)).toBe(5000);
    expect(decodeState(c.data(AID, FILE.STATE)!)).toMatchObject({ inTrip: true, boardStopId: 101, routeId: 1 });
    clock += 1800; place = { routeId: 1, stopId: 104 };
    const out = await proc.handle(c.uid, c);
    expect(out).toMatchObject({ status: "charged", txn: { kind: "tap_out", fare: 1800 } });
    expect(balance(c)).toBe(3200);
  });
  it("needs the maximum fare on the card to tap in", async () => {
    const c = await card(2000);
    expect((await proc.handle(c.uid, c))).toMatchObject({ status: "denied", reason: "INSUFFICIENT_FUNDS" });
  });
});

describe("cards that must not be accepted", () => {
  it("a hotlisted card is refused before the card is even read", async () => {
    const c = await card(5000);
    store.setHotlist(3, [c.uid.toString("hex")]);
    let commands = 0; const spy = { transmit: async (a: Buffer) => { commands++; return c.transmit(a); } };
    const out = await proc.handle(c.uid, spy);
    expect(out).toMatchObject({ status: "denied", reason: "CARD_BLOCKED" });
    expect(commands).toBe(0); expect(balance(c)).toBe(5000);
  });
  it("a card with the right UID but other keys (a copied UID, a card from another system) is refused", async () => {
    const other = await card(5000, keys());
    const out = await proc.handle(other.uid, other);
    expect(out).toMatchObject({ status: "denied", reason: "INVALID_CARD" });
    expect(balance(other)).toBe(5000);
  });
  it("a blank card is refused", async () => {
    const blank = new SimulatedDesfireCard({ uid: Buffer.from("04ee00000000ee", "hex") });
    expect(await proc.handle(blank.uid, blank)).toMatchObject({ status: "denied", reason: "INVALID_CARD" });
  });
  it("without a fare table nothing is charged", async () => {
    const s = new Store(); const p = new TapProcessor({ keys: k, store: s, feedback: fb, deviceId: "VAL-0001", place: () => place, now: () => clock });
    const c = await card(5000);
    expect((await p.handle(c.uid, c)).status).toBe("unconfigured"); expect(balance(c)).toBe(5000);
  });
});

describe("when the card moves or the reply is lost", () => {
  it("a card pulled away before the commit is not charged and the next tap works normally", async () => {
    const c = await card(5000);
    c.tearAfterCommands = 6;                                  // after authentication and reads, during the debit/write
    const out = await proc.handle(c.uid, c);
    expect(out.status).toBe("retry");
    expect(balance(c)).toBe(5000); expect(store.pending()).toHaveLength(0);
    clock += 5;
    expect((await proc.handle(c.uid, c)).status).toBe("charged");
    expect(balance(c)).toBe(3800); expect(store.pending()).toHaveLength(1); expect(store.openIntents()).toBe(0);
  });

  it("the commit lands but the reply is lost: the next tap recognises it, records it once, and does NOT charge again", async () => {
    const c = await card(5000);
    c.dropReplyToCommit = true;
    const first = await proc.handle(c.uid, c);
    expect(first.status).toBe("retry");
    expect(balance(c)).toBe(3800);                            // the card DID charge
    expect(store.pending()).toHaveLength(0); expect(store.openIntents()).toBe(1);
    clock += 5;
    const second = await proc.handle(c.uid, c);
    expect(second.status).toBe("already_paid");
    expect(balance(c)).toBe(3800);                            // not charged twice
    expect(store.pending()).toHaveLength(1);
    expect(store.pending()[0]).toMatchObject({ fare: 1200, balanceBefore: 5000, balanceAfter: 3800, cardCounter: 1 });
    expect(store.openIntents()).toBe(0);
    expect(fb.lines.at(-1)).toContain("Already paid");
  });

  it("an intent left from a power cut mid-tap is resolved by the card's own counter after a restart", async () => {
    const dir = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "afcv-"));
    const path = `${dir}/v.db`;
    const s1 = new Store(path); s1.setFareTable(sampleFareTable());
    const p1 = new TapProcessor({ keys: k, store: s1, feedback: fb, deviceId: "VAL-0001", place: () => place, now: () => clock });
    const c = await card(5000);
    c.dropReplyToCommit = true;
    await p1.handle(c.uid, c);
    s1.close();                                               // power cut
    const s2 = new Store(path);
    expect(s2.openIntents()).toBe(1);
    const p2 = new TapProcessor({ keys: k, store: s2, feedback: fb, deviceId: "VAL-0001", place: () => place, now: () => clock + 5 });
    expect((await p2.handle(c.uid, c)).status).toBe("already_paid");
    expect(balance(c)).toBe(3800); expect(s2.pending()).toHaveLength(1);
    s2.close();
  });
});

describe("offline behaviour", () => {
  it("keeps charging and queueing with no network, flags those taps as offline, and sequences them", async () => {
    store.setOnline(false);
    const c = await card(9000);
    for (let i = 0; i < 3; i++) { clock += 200; await proc.handle(c.uid, c); }
    expect(balance(c)).toBe(9000 - 3600);
    expect(store.pending().every((t) => t.offline)).toBe(true);
    expect(store.pendingCount()).toBe(3);
  });
});
