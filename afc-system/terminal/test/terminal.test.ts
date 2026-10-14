import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { DesfireSession, DevKeyProvider, FILE, AFC_AID, JournalStore, MemoryJournalIo, SimulatedDesfireCard, SimulatedUltralightC, aesCmac, encodeTicket, personalizeCard, readTicket, sampleFareTable, writeTicket } from "@afc/shared";
import { generateTicketKeyPair, privateKeyFromBase64, signTicket } from "@afc/shared/node";
import { AfcTerminal, type AfcDevicePlugin, type KeyRole } from "../src";

/** Stands in for the native plugin: the same contract, with software cards and an in-memory file. The Keystore side does what AfcKeyStore.java does: AES-CMAC under a master key. */
class FakeP18Q implements AfcDevicePlugin {
  io = new MemoryJournalIo();
  desfire: SimulatedDesfireCard | null = null;
  ultralight: SimulatedUltralightC | null = null;
  beeps = 0;
  constructor(private readonly masters: Record<string, Buffer>) {}
  async open() { return { open: true }; }
  async close() {}
  async poll() {
    if (this.desfire) return { present: true, uid: this.desfire.uid.toString("hex"), iso4: true };
    if (this.ultralight) return { present: true, uid: this.ultralight.serial.toString("hex"), iso4: false };
    return { present: false };
  }
  async apdu(o: { hex: string }) { return { hex: (await this.desfire!.transmit(Buffer.from(o.hex, "hex"))).toString("hex") }; }
  async ulRead(o: { page: number }) { return { hex: (await this.ultralight!.read(o.page)).toString("hex") }; }
  async ulWrite(o: { page: number; hex: string }) { await this.ultralight!.write(o.page, Buffer.from(o.hex, "hex")); }
  async ulcAuth(o: { keyHex: string }) { await this.ultralight!.ulcAuth(Buffer.from(o.keyHex, "hex")); }
  async ulcSetKey(o: { keyHex: string }) { await this.ultralight!.ulcSetKey(Buffer.from(o.keyHex, "hex")); }
  async beep() { this.beeps++; }
  async journalLoad() { return { lines: await this.io.load() }; }
  async journalAppend(o: { lines: string[] }) { await this.io.append(o.lines); }
  async journalReplace(o: { line: string }) { await this.io.replace(o.line); }
  async keyImport() {}
  async keyStatus() { return { roles: {} as never }; }
  async keyDiversify(o: { role: KeyRole; inputHex: string }) { return { keyHex: aesCmac(this.masters[o.role], Buffer.from(o.inputHex, "hex")).toString("hex") }; }
}

const WED = Math.floor(Date.parse("2026-10-14T09:30:00+02:00") / 1000);
const masters = { PICC: randomBytes(16), ADMIN: randomBytes(16), DEBIT: randomBytes(16), CREDIT: randomBytes(16), TICKET: randomBytes(16) };
const dev = new DevKeyProvider(masters);
const kp = generateTicketKeyPair();
let p: FakeP18Q, t: AfcTerminal, shown: string[], clock: number;

const boot = async () => {
  shown = [];
  t = await AfcTerminal.create({ plugin: p, deviceId: "P18Q-0001", place: () => ({ routeId: 2, stopId: 201 }), show: (k, m) => shown.push(`${k}:${m}`), now: () => clock });
};
beforeEach(async () => {
  p = new FakeP18Q(masters); clock = WED; await boot();
  t.store.setFareTable(sampleFareTable());
  t.store.setTicketKeys(1001, [{ id: 1, publicKey: kp.publicKeyHex }]);
  await t.store.durable();
});

const fareCard = async (balance = 5000) => {
  const uid = randomBytes(7); uid[0] = 0x04;
  const c = new SimulatedDesfireCard({ uid }); await personalizeCard(new DesfireSession(c), uid, dev, { initialBalance: balance }); c.removeFromField(); return c;
};
const ticketCard = async () => {
  const uid = randomBytes(7); uid[0] = 0x04;
  const c = new SimulatedUltralightC(uid);
  const data = encodeTicket({ keyId: 1, routeId: 2, ticketId: 4242, validFrom: WED - 600, validUntil: WED + 7200 });
  await writeTicket(c, dev, data, signTicket(privateKeyFromBase64(kp.privateKeyBase64), data, uid)); c.removeFromField(); return c;
};

describe("the P18Q terminal", () => {
  it("charges a DESFire fare card using keys that only exist as AES-CMAC under the master keys (the Keystore path)", async () => {
    p.desfire = await fareCard(5000);
    const out = await t.tickOnce();
    expect(out?.status).toBe("charged");
    expect(p.desfire.value(AFC_AID.toString("hex"), FILE.BALANCE)).toBe(3800);
    expect(shown.at(-1)).toBe("ok:Paid R12.00 · Bal R38.00"); expect(p.beeps).toBe(1);
  });
  it("accepts an Ultralight C ticket through the reader SDK calls and marks the card used", async () => {
    p.ultralight = await ticketCard();
    const out = await t.tickOnce();
    expect(out?.status).toBe("charged");
    expect((await readTicket(p.ultralight)).used).not.toBeNull();
    expect(t.store.pending()[0]).toMatchObject({ kind: "ticket", ticketId: 4242 });
  });
  it("handles a card once per visit: lying on the reader is not a second tap, removing and tapping again is", async () => {
    p.desfire = await fareCard(5000);
    expect((await t.tickOnce())?.status).toBe("charged");
    expect(await t.tickOnce()).toBeNull();
    expect(p.desfire.value(AFC_AID.toString("hex"), FILE.BALANCE)).toBe(3800);
    const c = p.desfire; p.desfire = null; expect(await t.tickOnce()).toBeNull();
    clock += 1; p.desfire = c; const again = await t.tickOnce();
    expect(again?.status).toBeDefined(); expect(again?.status).not.toBe("retry");
  });
  it("refuses a card with a 4-byte (random) UID rather than guessing", async () => {
    p.ultralight = new SimulatedUltralightC(); (p.ultralight as unknown as { serial: Buffer }).serial = Buffer.from("08aabbcc", "hex");
    expect((await t.tickOnce())?.status).toBe("denied"); expect(shown.at(-1)).toBe("no:Card not supported");
  });
  it("loses nothing across a power cut: taps made durable are back after a restart, and the sequence continues", async () => {
    p.desfire = await fareCard(5000); await t.tickOnce();
    const seqBefore = t.store.getMeta("seq");
    await boot();                                           // same journal file, new process
    expect(t.store.pending()).toHaveLength(1);
    expect(t.store.getMeta("seq")).toBe(seqBefore);
    expect(t.store.fareTable()?.version).toBeGreaterThan(0);
  });
  it("a journal write that fails stops the fare before the card is touched", async () => {
    p.desfire = await fareCard(5000); p.io.appendFailures = 1;
    await expect(t.tickOnce()).rejects.toThrow();
    expect(p.desfire.value(AFC_AID.toString("hex"), FILE.BALANCE)).toBe(5000);
  });
});
