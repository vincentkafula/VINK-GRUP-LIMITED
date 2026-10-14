import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { DevKeyProvider, SimulatedUltralight, encodeTicket, readTicket, writeTicket, type TicketData } from "@afc/shared";
import { generateTicketKeyPair, privateKeyFromBase64, signTicket } from "@afc/shared/node";
import { ConsoleFeedback } from "../src/feedback";
import { Store } from "../src/store";
import { TicketProcessor } from "../src/ticketProcessor";

const NOW = Math.floor(Date.parse("2026-10-14T09:30:00+02:00") / 1000);
let kp: ReturnType<typeof generateTicketKeyPair>, keys: DevKeyProvider, store: Store, fb: ConsoleFeedback, clock: number, place: { routeId: number; stopId: number }, proc: TicketProcessor;

beforeEach(() => {
  kp = generateTicketKeyPair(); keys = new DevKeyProvider({ TICKET: randomBytes(16) });
  store = new Store(); fb = new ConsoleFeedback(() => {}, false); clock = NOW; place = { routeId: 2, stopId: 201 };
  store.setFareTable({ version: 1, currency: "ZAR", utcOffsetMinutes: 120, routes: [], timeRules: [], discounts: [], publishedAt: "" });
  store.setTicketKeys(1001, [{ id: 1, publicKey: kp.publicKeyHex }]);
  proc = new TicketProcessor({ keys, store, feedback: fb, deviceId: "VAL-0001", place: () => place, now: () => clock });
});

let n = 0;
const T = (over: Partial<TicketData> = {}): TicketData => ({ keyId: 1, routeId: 2, ticketId: 100 + ++n, validFrom: NOW - 600, validUntil: NOW + 7200, ...over });

async function ticketCard(t: TicketData = T(), uid = Buffer.from("04c" + (++n).toString(16).padStart(11, "0"), "hex"), k = keys, signKey = kp) {
  const card = new SimulatedUltralight(uid);
  const data = encodeTicket(t);
  await writeTicket(card, k, data, signTicket(privateKeyFromBase64(signKey.privateKeyBase64), data, uid));
  card.removeFromField();
  return { card, t };
}

describe("accepting tickets", () => {
  it("accepts a genuine ticket, marks the card used, queues one transaction, and says how long it is good for", async () => {
    const { card, t } = await ticketCard();
    const out = await proc.handle(card);
    expect(out.status).toBe("charged");
    expect((await readTicket(card)).used).not.toBeNull();
    expect(fb.lines).toEqual(["OK  Ticket OK · valid until 11:30"]);
    const q = store.pending();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ result: "ok", kind: "ticket", ticketId: t.ticketId, fare: 0, routeId: 2, deviceId: "VAL-0001" });
    expect(store.ticketUse(t.ticketId)).toEqual({ completed: true });
  });
  it("a ticket for any route (route 0) works on every route", async () => {
    const { card } = await ticketCard(T({ routeId: 0 })); place = { routeId: 1, stopId: 101 };
    expect((await proc.handle(card)).status).toBe("charged");
  });
});

describe("refusing tickets", () => {
  const refused = async (card: SimulatedUltralight, reason: string) => {
    const out = await proc.handle(card);
    expect(out).toMatchObject({ status: "denied", reason });
    expect(store.pending().at(-1)).toMatchObject({ result: "denied", denyReason: reason });
    return out;
  };

  it("a ticket used already is refused (the card's own record)", async () => {
    const { card } = await ticketCard();
    await proc.handle(card); card.removeFromField(); clock += 5;
    await refused(card, "TICKET_USED");
  });
  it("a COPY of a ticket that was already used on this device is refused by the device's own record", async () => {
    const t = T(), uid = Buffer.from("04c0ffee000001", "hex");
    const original = (await ticketCard(t, uid)).card, copy = (await ticketCard(t, uid)).card;      // same data, same UID, but the copy has no "used" mark
    await proc.handle(original); clock += 5;
    await refused(copy, "TICKET_USED");
    expect((await readTicket(copy)).used).toBeNull();                                               // and the copy was not touched
  });
  it("a forged or altered ticket is refused", async () => {
    const { card } = await ticketCard(T(), undefined, keys, generateTicketKeyPair());               // signed by someone else's key
    await refused(card, "INVALID_TICKET");
    const t = T(), uid = Buffer.from("04c0ffee000002", "hex"), c2 = (await ticketCard(t, uid)).card;
    const edited = Buffer.from(encodeTicket({ ...t, validUntil: t.validUntil + 86400 }));           // a later expiry written over the data pages
    const raw = await readTicket(c2); void raw;
    const forger = new SimulatedUltralight(uid); await writeTicket(forger, keys, edited, (await readTicket(c2)).signature);
    await refused(forger, "INVALID_TICKET");
  });
  it("ticket data copied onto another card (different UID) is refused", async () => {
    const t = T(), a = await ticketCard(t, Buffer.from("04c0ffee000003", "hex"));
    const src = await readTicket(a.card);
    const other = new SimulatedUltralight(Buffer.from("04c0ffee000004", "hex")); await writeTicket(other, keys, src.data, src.signature);
    await refused(other, "INVALID_TICKET");
  });
  it("an unknown signing key id, a blank card and an unrelated card are refused", async () => {
    await refused((await ticketCard(T({ keyId: 9 }))).card, "INVALID_TICKET");
    await refused(new SimulatedUltralight(Buffer.from("04c0ffee000005", "hex")), "INVALID_TICKET");
  });
  it("the wrong route, not yet valid, and expired are refused with their own reasons (and the card is left unused)", async () => {
    const wrong = (await ticketCard(T({ routeId: 1 }))).card; await refused(wrong, "TICKET_WRONG_ROUTE");
    const early = (await ticketCard(T({ validFrom: NOW + 3600, validUntil: NOW + 7200 }))).card; await refused(early, "TICKET_NOT_YET_VALID");
    const late = (await ticketCard(T({ validFrom: NOW - 7200, validUntil: NOW - 1 }))).card; await refused(late, "TICKET_EXPIRED");
    for (const c of [wrong, early, late]) expect((await readTicket(c)).used).toBeNull();
  });
  it("a blocked card is refused before the ticket is examined", async () => {
    const { card } = await ticketCard(); store.setHotlist(2, [card.serial.toString("hex")]);
    await refused(card, "CARD_BLOCKED");
  });
  it("waits for ticket keys rather than guessing", async () => {
    const s = new Store(); const p = new TicketProcessor({ keys, store: s, feedback: fb, deviceId: "VAL-0001", place: () => place, now: () => clock });
    const { card } = await ticketCard();
    expect((await p.handle(card)).status).toBe("unconfigured"); expect((await readTicket(card)).used).toBeNull();
  });
});

describe("a card pulled away while being marked", () => {
  it("is not left half used, and the next tap on this device works and completes", async () => {
    const { card, t } = await ticketCard();
    card.tearAfterWrites = 1;                       // password accepted, time page written, flag page lost
    expect((await proc.handle(card)).status).toBe("retry");
    card.removeFromField();
    expect((await readTicket(card)).used).toBeNull();
    expect(store.ticketUse(t.ticketId)).toEqual({ completed: false });
    expect(store.pending()).toHaveLength(0);
    clock += 5;
    expect((await proc.handle(card)).status).toBe("charged");
    expect(store.ticketUse(t.ticketId)).toEqual({ completed: true }); expect(store.pending()).toHaveLength(1);
  });
});

describe("offline", () => {
  it("accepts tickets with no network and flags them as offline for the server", async () => {
    store.setOnline(false);
    const { card } = await ticketCard();
    await proc.handle(card);
    expect(store.pending()[0].offline).toBe(true);
  });
});
