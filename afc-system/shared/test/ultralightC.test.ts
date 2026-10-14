import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DevKeyProvider, SimulatedUltralightC, encodeTicket, markTicketUsed, readTicket, ticketUlcKey, writeTicket } from "../src";
import { generateTicketKeyPair, privateKeyFromBase64, signTicket } from "../src/node";

const kp = generateTicketKeyPair();
const keys = new DevKeyProvider({ TICKET: randomBytes(16) });
const NOW = 1_800_000_000;
const make = async (uid = Buffer.from("04c0ffee112233", "hex")) => {
  const card = new SimulatedUltralightC(uid);
  const data = encodeTicket({ keyId: 1, routeId: 2, ticketId: 77, validFrom: NOW, validUntil: NOW + 3600 });
  const sig = signTicket(privateKeyFromBase64(kp.privateKeyBase64), data, uid);
  await writeTicket(card, keys, data, sig);
  card.removeFromField();
  return { card, data, sig };
};

describe("Ultralight C tickets", () => {
  it("writes a ticket, protects pages 4 and up, and reads it back freely", async () => {
    const { card, data, sig } = await make();
    expect(card.protectedFrom).toBe(4);
    const r = await readTicket(card);
    expect(r.data.equals(data)).toBe(true); expect(r.signature.equals(sig)).toBe(true); expect(r.used).toBeNull();
  });
  it("refuses writes without the key (a passenger cannot clear the used record), and reading the key pages gives nothing", async () => {
    const { card } = await make();
    await expect(card.write(24, Buffer.alloc(4))).rejects.toThrow(/authenticate/);
    await expect(card.write(44, Buffer.alloc(4))).rejects.toThrow(/authenticate/);
    expect((await card.read(44)).every((b) => b === 0)).toBe(true);
    await expect(card.ulcAuth(Buffer.alloc(16, 1))).rejects.toThrow(/wrong key/);
  });
  it("marks the ticket used with the derived key, and the mark sticks", async () => {
    const { card } = await make();
    await markTicketUsed(card, keys, NOW + 60, 0x1234);
    card.removeFromField();
    expect((await readTicket(card)).used).toEqual({ usedAt: NOW + 60, deviceTag: 0x1234 });
  });
  it("a card that already holds our ticket can be rewritten; a card with someone else's key cannot", async () => {
    const { card, data, sig } = await make();
    await writeTicket(card, keys, data, sig);
    const other = new DevKeyProvider({ TICKET: randomBytes(16) });
    await expect(writeTicket(card, other, data, sig)).rejects.toThrow(/somewhere else/);
  });
  it("each card gets its own key, and the two key halves are never equal", async () => {
    const a = await ticketUlcKey(keys, Buffer.from("04c0ffee000001", "hex")), b = await ticketUlcKey(keys, Buffer.from("04c0ffee000002", "hex"));
    expect(a.equals(b)).toBe(false);
    const weak = new DevKeyProvider({ TICKET: Buffer.alloc(16, 0x42) });
    const w = await ticketUlcKey(weak, Buffer.from("04c0ffee000003", "hex"));
    expect(w.subarray(0, 8).equals(w.subarray(8, 16))).toBe(false);
  });
});
