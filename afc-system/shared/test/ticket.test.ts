import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DevKeyProvider, SimulatedUltralight, UL21, UltralightError, decodeTicket, encodeTicket, generateTicketKeyPair, markTicketUsed, privateKeyFromBase64, privateKeyFromSeed,
  publicKeyFromHex, publicKeyHexOf, readTicket, signTicket, ticketPassword, verifyTicket, writeTicket, TICKET,
} from "../src";

const keys = () => new DevKeyProvider({ TICKET: randomBytes(16) });
const uidA = Buffer.from("04a0b1c2d3e4f5", "hex"), uidB = Buffer.from("04a0b1c2d3e4f6", "hex");
const T = { keyId: 1, routeId: 2, ticketId: 4242, validFrom: 1_760_000_000, validUntil: 1_760_086_400 };

function signed(uid = uidA, t = T) {
  const kp = generateTicketKeyPair(), priv = privateKeyFromBase64(kp.privateKeyBase64);
  const data = encodeTicket(t);
  return { kp, data, sig: signTicket(priv, data, uid), pub: publicKeyFromHex(kp.publicKeyHex) };
}

describe("ticket data and signature", () => {
  it("round-trips the 16 data bytes", () => expect(decodeTicket(encodeTicket(T))).toEqual(T));
  it("rejects data of the wrong size or version", () => { expect(decodeTicket(Buffer.alloc(15))).toBeNull(); const b = encodeTicket(T); b[0] = 9; expect(decodeTicket(b)).toBeNull(); });
  it("verifies with the matching public key only, and the signature is bound to the card's UID", () => {
    const s = signed();
    expect(verifyTicket(s.pub, s.data, s.sig, uidA)).toBe(true);
    expect(verifyTicket(s.pub, s.data, s.sig, uidB)).toBe(false);                               // copied onto another card
    expect(verifyTicket(publicKeyFromHex(generateTicketKeyPair().publicKeyHex), s.data, s.sig, uidA)).toBe(false);
    const changed = Buffer.from(s.data); changed[12] ^= 1;                                       // a later "valid until"
    expect(verifyTicket(s.pub, changed, s.sig, uidA)).toBe(false);
    const badSig = Buffer.from(s.sig); badSig[5] ^= 1;
    expect(verifyTicket(s.pub, s.data, badSig, uidA)).toBe(false);
    expect(verifyTicket(s.pub, s.data, s.sig.subarray(0, 63), uidA)).toBe(false);
  });
  it("a development key derived from a seed is stable and gives the same public key each time", () => {
    const seed = randomBytes(32);
    expect(publicKeyHexOf(privateKeyFromSeed(seed))).toBe(publicKeyHexOf(privateKeyFromSeed(seed)));
    expect(publicKeyHexOf(privateKeyFromSeed(seed))).not.toBe(publicKeyHexOf(privateKeyFromSeed(randomBytes(32))));
  });
});

describe("the card password", () => {
  it("is different for every card, never the factory value, and 2 bytes of acknowledge come with it", async () => {
    const k = keys();
    const a = await ticketPassword(k, uidA), b = await ticketPassword(k, uidB);
    expect(a.pwd.equals(b.pwd)).toBe(false); expect(a.pwd.equals(Buffer.alloc(4, 0xff))).toBe(false);
    expect(a.pack).toHaveLength(2);
  });
});

describe("writing a ticket to a simulated Ultralight", () => {
  it("writes, protects from page 4, locks the configuration, and reads back what was written", async () => {
    const k = keys(), s = signed(), card = new SimulatedUltralight(uidA);
    await writeTicket(card, k, s.data, s.sig);
    expect(card.protectedFrom).toBe(TICKET.DATA); expect(card.configLocked).toBe(true);
    card.removeFromField();
    const r = await readTicket(card);
    expect(r.ticket).toEqual(T); expect(r.used).toBeNull(); expect(r.blank).toBe(false);
    expect(verifyTicket(s.pub, r.data, r.signature, r.uid)).toBe(true);
  });
  it("after that, nobody without the password can change the ticket or the 'used' record, or reset the lock", async () => {
    const k = keys(), s = signed(), card = new SimulatedUltralight(uidA);
    await writeTicket(card, k, s.data, s.sig); card.removeFromField();
    await expect(card.write(TICKET.USED, Buffer.alloc(4))).rejects.toThrow(/authenticate/);
    await expect(card.write(TICKET.DATA, Buffer.alloc(4))).rejects.toThrow(/authenticate/);
    await expect(card.write(UL21.CFG0, Buffer.from([0, 0, 0, 0xff]))).rejects.toThrow(/authenticate/);
    await expect(card.write(UL21.PWD, Buffer.alloc(4))).rejects.toThrow(/authenticate/);
  });
  it("the password cannot be read out of the card", async () => {
    const k = keys(), s = signed(), card = new SimulatedUltralight(uidA);
    await writeTicket(card, k, s.data, s.sig);
    expect((await card.read(UL21.PWD)).subarray(0, 8).equals(Buffer.alloc(8))).toBe(true);        // PWD and PACK read as zeros
  });
  it("guessing the password locks the card after five wrong tries, even for the right password afterwards", async () => {
    const k = keys(), s = signed(), card = new SimulatedUltralight(uidA);
    await writeTicket(card, k, s.data, s.sig); card.removeFromField();
    for (let i = 0; i < 5; i++) await expect(card.pwdAuth(Buffer.from([1, 2, 3, i]))).rejects.toThrow(/wrong password/);
    const right = (await ticketPassword(k, uidA)).pwd;
    await expect(card.pwdAuth(right)).rejects.toMatchObject({ kind: "locked" });
  });
  it("marks a ticket used, and the record survives the card leaving the field", async () => {
    const k = keys(), s = signed(), card = new SimulatedUltralight(uidA);
    await writeTicket(card, k, s.data, s.sig); card.removeFromField();
    await markTicketUsed(card, k, 1_760_000_500, 0x1234);
    card.removeFromField();
    const r = await readTicket(card);
    expect(r.used).toEqual({ usedAt: 1_760_000_500, deviceTag: 0x1234 });
    expect(r.ticket).toEqual(T);
  });
  it("a card torn while being marked is either fully used or not used at all, never half", async () => {
    const k = keys(), s = signed(), card = new SimulatedUltralight(uidA);
    await writeTicket(card, k, s.data, s.sig); card.removeFromField();
    card.tearAfterWrites = 1;                                  // the time page lands, the flag page does not
    await expect(markTicketUsed(card, k, 1_760_000_500, 7)).rejects.toThrow();
    card.removeFromField();
    expect((await readTicket(card)).used).toBeNull();
    await markTicketUsed(card, k, 1_760_000_600, 7);          // trying again works
    expect((await readTicket(card)).used).toMatchObject({ usedAt: 1_760_000_600 });
  });
  it("a used card can be re-issued by a station that knows the password; a card from another system cannot", async () => {
    const k = keys(), s = signed(), card = new SimulatedUltralight(uidA);
    await writeTicket(card, k, s.data, s.sig); card.removeFromField();
    await markTicketUsed(card, k, 1_760_000_500, 1); card.removeFromField();
    const next = signed(uidA, { ...T, ticketId: 4243 });
    await writeTicket(card, k, next.data, next.sig); card.removeFromField();
    const r = await readTicket(card);
    expect(r.ticket?.ticketId).toBe(4243); expect(r.used).toBeNull();
    card.removeFromField();
    await expect(writeTicket(card, keys(), next.data, next.sig)).rejects.toThrow(/somewhere else|not ours/);   // other master key
  });
  it("refuses data of the wrong size and reports a blank card as blank", async () => {
    const card = new SimulatedUltralight(uidA);
    expect((await readTicket(card)).blank).toBe(true);
    await expect(writeTicket(card, keys(), Buffer.alloc(15), Buffer.alloc(64))).rejects.toThrow(/wrong size/);
    await expect(card.write(3, Buffer.alloc(4))).rejects.toThrow(UltralightError);                      // pages 0-3 are never writable
  });
});
