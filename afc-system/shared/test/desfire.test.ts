import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import {
  AFC_AID, DesfireSession, DesfireError, DevKeyProvider, FILE, KEY, SimulatedDesfireCard, STATUS, CardRemovedError, chargeFare, decodeState, encodeState, openCardForFare,
  personalizeCard, topUpCard, readBalanceWithCreditKey, BALANCE_MAX, EMPTY_STATE, crc32Desfire,
} from "../src";

const uid = Buffer.from("04a1b2c3d4e5f6", "hex");
const keys = () => new DevKeyProvider({ PICC: randomBytes(16), ADMIN: randomBytes(16), DEBIT: randomBytes(16), CREDIT: randomBytes(16) });
const AID_HEX = AFC_AID.toString("hex");

async function fresh(initial = 5000) {
  const card = new SimulatedDesfireCard({ uid });
  const k = keys();
  await personalizeCard(new DesfireSession(card), uid, k, { initialBalance: initial });
  card.removeFromField();
  return { card, k, session: new DesfireSession(card) };
}

describe("authentication", () => {
  it("a card and reader that share a key authenticate, and a wrong key is refused", async () => {
    const card = new SimulatedDesfireCard({ uid });
    const s = new DesfireSession(card);
    await s.selectApplication(Buffer.alloc(3));
    await s.authenticate(0, Buffer.alloc(16));
    expect(s.authenticated).toBe(true);
    const s2 = new DesfireSession(card);
    await s2.selectApplication(Buffer.alloc(3));
    await expect(s2.authenticate(0, Buffer.alloc(16, 1))).rejects.toThrow();
    expect(s2.authenticated).toBe(false);
  });
  it("selecting an application that does not exist fails cleanly", async () => {
    const s = new DesfireSession(new SimulatedDesfireCard({ uid }));
    await expect(s.selectApplication(AFC_AID)).rejects.toMatchObject({ status: STATUS.APPLICATION_NOT_FOUND });
  });
});

describe("personalisation", () => {
  it("creates the application with per-card keys, the starting balance, and an empty tap record", async () => {
    const { card, k, session } = await fresh(7500);
    expect(card.appIds()).toEqual([AID_HEX]);
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(7500);
    expect(card.appKey(AID_HEX, KEY.DEBIT)!.equals(await k.cardKey(uid, "DEBIT"))).toBe(true);
    expect(card.appKey(AID_HEX, KEY.CREDIT)!.equals(await k.cardKey(uid, "CREDIT"))).toBe(true);
    expect(card.appKey(AID_HEX, KEY.ADMIN)!.equals(await k.cardKey(uid, "ADMIN"))).toBe(true);
    expect(card.piccMasterKey().equals(await k.cardKey(uid, "PICC"))).toBe(true);
    const open = await openCardForFare(session, uid, k);
    expect(open).toEqual({ balance: 7500, state: EMPTY_STATE });
  });
  it("every key on the card differs, and differs from another card's", async () => {
    const k = keys(), other = Buffer.from("04ffffffffffff", "hex");
    const ks = await Promise.all((["PICC", "ADMIN", "DEBIT", "CREDIT"] as const).map((r) => k.cardKey(uid, r)));
    expect(new Set(ks.map((b) => b.toString("hex"))).size).toBe(4);
    expect((await k.cardKey(other, "DEBIT")).equals(ks[2])).toBe(false);
  });
  it("a card with a diversified master key no longer accepts the factory key", async () => {
    const { card } = await fresh();
    const s = new DesfireSession(card);
    await s.selectApplication(Buffer.alloc(3));
    await expect(s.authenticate(0, Buffer.alloc(16))).rejects.toThrow();
  });
  it("refuses a starting balance outside the limits", async () => {
    const card = new SimulatedDesfireCard({ uid });
    await expect(personalizeCard(new DesfireSession(card), uid, keys(), { initialBalance: BALANCE_MAX + 1 })).rejects.toThrow(/range/);
    await expect(personalizeCard(new DesfireSession(card), uid, keys(), { initialBalance: -1 })).rejects.toThrow(/range/);
  });
  it("personalising an already-personalised card fails instead of overwriting it", async () => {
    const { card, k } = await fresh(100);
    await expect(personalizeCard(new DesfireSession(card), uid, k, { currentPiccKey: await k.cardKey(uid, "PICC") })).rejects.toMatchObject({ status: STATUS.DUPLICATE_ERROR });
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(100);
  });
});

describe("taking a fare", () => {
  let card: SimulatedDesfireCard, k: DevKeyProvider, session: DesfireSession;
  beforeEach(async () => { ({ card, k, session } = await fresh(5000)); });

  it("takes the fare and records the tap in one step", async () => {
    const open = await openCardForFare(session, uid, k);
    await chargeFare(session, 1200, { ...open.state, inTrip: true, tapInEpoch: 1_760_000_000, routeId: 7, boardStopId: 3, counter: 1, deviceTag: 9 });
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(3800);
    expect(decodeState(card.data(AID_HEX, FILE.STATE)!)).toMatchObject({ inTrip: true, routeId: 7, boardStopId: 3, counter: 1, tapInEpoch: 1_760_000_000 });
  });

  it("cannot take more than the balance, and nothing at all is written when it fails", async () => {
    const before = card.data(AID_HEX, FILE.STATE)!.toString("hex");
    await openCardForFare(session, uid, k);
    await expect(chargeFare(session, 5001, { ...EMPTY_STATE, counter: 1 })).rejects.toMatchObject({ status: STATUS.BOUNDARY_ERROR });
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(5000);
    expect(card.data(AID_HEX, FILE.STATE)!.toString("hex")).toBe(before);
  });

  it("a card pulled away before the commit keeps its old balance AND its old tap record (no half write)", async () => {
    await openCardForFare(session, uid, k);
    card.tearAfterCommands = 2;                 // debit and write arrive, the commit never does
    await expect(chargeFare(session, 1000, { ...EMPTY_STATE, inTrip: true, counter: 1 })).rejects.toBeInstanceOf(CardRemovedError);
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(5000);
    expect(card.data(AID_HEX, FILE.STATE)!.equals(Buffer.alloc(16))).toBe(true);
  });

  it("when the commit lands but the reply is lost, the card has charged exactly once and the next read shows it", async () => {
    await openCardForFare(session, uid, k);
    card.dropReplyToCommit = true;
    await expect(chargeFare(session, 1000, { ...EMPTY_STATE, inTrip: true, counter: 1 })).rejects.toBeInstanceOf(CardRemovedError);
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(4000);
    const again = await openCardForFare(new DesfireSession(card), uid, k);
    expect(again.balance).toBe(4000); expect(again.state.counter).toBe(1);
  });

  it("an interrupted fare never charges twice when the passenger taps again", async () => {
    await openCardForFare(session, uid, k);
    card.tearAfterCommands = 1;
    await expect(chargeFare(session, 1000, { ...EMPTY_STATE, counter: 1 })).rejects.toThrow();
    const s2 = new DesfireSession(card);
    const o = await openCardForFare(s2, uid, k);
    await chargeFare(s2, 1000, { ...o.state, counter: o.state.counter + 1 });
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(4000);
  });
});

describe("keys are limited to their jobs", () => {
  it("the validator (DEBIT) key cannot add money", async () => {
    const { card, k, session } = await fresh(1000);
    await openCardForFare(session, uid, k);
    await expect(session.credit(FILE.BALANCE, 99999)).rejects.toMatchObject({ status: STATUS.PERMISSION_DENIED });
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(1000);
  });
  it("the top-up (CREDIT) key can add money and read the balance but cannot write the tap record", async () => {
    const { card, k, session } = await fresh(1000);
    expect(await topUpCard(session, uid, k, 2500)).toBe(3500);
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(3500);
    const s = new DesfireSession(card);
    expect(await readBalanceWithCreditKey(s, uid, k)).toBe(3500);
    await expect(s.writeData(FILE.STATE, 0, encodeState({ ...EMPTY_STATE, counter: 5 }))).rejects.toMatchObject({ status: STATUS.PERMISSION_DENIED });
  });
  it("a top-up cannot push the card over its limit", async () => {
    const { card, k, session } = await fresh(BALANCE_MAX - 10);
    await expect(topUpCard(session, uid, k, 11)).rejects.toMatchObject({ status: STATUS.BOUNDARY_ERROR });
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(BALANCE_MAX - 10);
  });
  it("a key for another card does not work on this one (no cross-card keys)", async () => {
    const { card, k } = await fresh(1000);
    const wrong = await k.cardKey(Buffer.from("04ffffffffffff", "hex"), "DEBIT");
    const s = new DesfireSession(card);
    await s.selectApplication(AFC_AID);
    await expect(s.authenticate(KEY.DEBIT, wrong)).rejects.toThrow();
  });
  it("without authenticating, nothing can be read or changed", async () => {
    const { card } = await fresh(1000);
    const s = new DesfireSession(card);
    await s.selectApplication(AFC_AID);
    await expect(s.getValue(FILE.BALANCE)).rejects.toBeInstanceOf(DesfireError);
  });
});

describe("secure messaging", () => {
  it("a reply altered on the way is detected", async () => {
    const { card, k } = await fresh(1000);
    const tamper = { transmit: async (apdu: Buffer) => { const r = await card.transmit(apdu); if (apdu[1] === 0x6c) r[0] ^= 0x01; return r; } };
    const s = new DesfireSession(tamper);
    await s.selectApplication(AFC_AID);
    await s.authenticate(KEY.DEBIT, await k.cardKey(uid, "DEBIT"));
    await expect(s.getValue(FILE.BALANCE)).rejects.toMatchObject({ status: STATUS.INTEGRITY_ERROR });
    expect(s.authenticated).toBe(false);
  });
  it("a debit command altered on the way is refused by the card and changes nothing", async () => {
    const { card, k } = await fresh(1000);
    const tamper = { transmit: async (apdu: Buffer) => { const a = Buffer.from(apdu); if (a[1] === 0xdc) a[6] = 0x01; return card.transmit(a); } };
    const s = new DesfireSession(tamper);
    await s.selectApplication(AFC_AID);
    await s.authenticate(KEY.DEBIT, await k.cardKey(uid, "DEBIT"));
    await expect(s.debit(FILE.BALANCE, 5)).rejects.toMatchObject({ status: STATUS.INTEGRITY_ERROR });
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(1000);
  });
  it("replaying a recorded debit does nothing: the chain has moved on", async () => {
    const { card, k } = await fresh(1000);
    const seen: Buffer[] = [];
    const spy = { transmit: async (apdu: Buffer) => { if (apdu[1] === 0xdc) seen.push(Buffer.from(apdu)); return card.transmit(apdu); } };
    const s = new DesfireSession(spy);
    await s.selectApplication(AFC_AID);
    await s.authenticate(KEY.DEBIT, await k.cardKey(uid, "DEBIT"));
    await s.debit(FILE.BALANCE, 100); await s.commit();
    const r = await card.transmit(seen[0]);
    expect(r[r.length - 1]).not.toBe(STATUS.OK);
    expect(card.value(AID_HEX, FILE.BALANCE)).toBe(900);
  });
});

describe("tap record and CRC", () => {
  it("round-trips every field", () => {
    const s = { version: 1, inTrip: true, tapInEpoch: 1_760_123_456, routeId: 65535, boardStopId: 12, counter: 4_000_000_000, deviceTag: 513 };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it("the card CRC is zlib's crc32 without the final complement", () => {
    // zlib crc32("123456789") = cbf43926; without the final complement it is its bitwise inverse 340bc6d9
    expect(crc32Desfire(Buffer.from("123456789")).readUInt32LE(0).toString(16)).toBe("340bc6d9");
  });
});
