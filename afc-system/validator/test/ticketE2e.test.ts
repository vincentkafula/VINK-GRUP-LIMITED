import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DevKeyProvider, SimulatedUltralight, readTicket, writeTicket } from "@afc/shared";
import { startHarness, type Harness } from "../../backend/test/harness";
import { ConsoleFeedback } from "../src/feedback";
import { Store } from "../src/store";
import { SyncClient } from "../src/syncClient";
import { TicketProcessor } from "../src/ticketProcessor";

let h: Harness, base: string, keys: DevKeyProvider, agent: string;
beforeAll(async () => {
  h = await startHarness();
  await h.app.listen({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${(h.app.server.address() as { port: number }).port}`;
  keys = new DevKeyProvider({ TICKET: randomBytes(16) });
  agent = await h.login("agent@afc.local");
});
afterAll(async () => { await h.stop(); });

let n = 0, ref = 0;
const validator = (deviceId = "VAL-0001", secret = h.deviceSecret) => {
  const store = new Store(), fb = new ConsoleFeedback(() => {}, false);
  const proc = new TicketProcessor({ keys, store, feedback: fb, deviceId, place: () => ({ routeId: 2, stopId: 201 }) });
  const sync = new SyncClient({ serverUrl: base, deviceId, secret, store });
  return { store, fb, proc, sync };
};

/** The ticket counter: sell through the API, then write what comes back onto the card. */
async function sellAndWrite(card: SimulatedUltralight, over: Record<string, unknown> = {}) {
  const r = await h.api(agent, "POST", "/api/tickets", { cardUid: card.serial.toString("hex"), routeId: 2, priceCents: 1500, validForMinutes: 120, method: "CASH", reference: "E2E-" + ++ref, ...over });
  if (r.status !== 201) throw new Error("sale failed: " + JSON.stringify(r.body));
  await writeTicket(card, keys, Buffer.from(r.body.dataHex, "hex"), Buffer.from(r.body.signatureHex, "hex"));
  card.removeFromField();
  return r.body.ticket.id as number;
}
const newCard = () => new SimulatedUltralight(Buffer.from("04d1" + (++n).toString(16).padStart(10, "0"), "hex"));

describe("single-trip tickets, from the counter to the server", () => {
  it("sell, write, tap offline, sync: the validator learned the public key from the server and the ticket is used up once", async () => {
    const v = validator();
    expect((await v.proc.handle(newCard())).status).toBe("unconfigured");        // no keys yet
    const first = await v.sync.syncOnce();
    expect(first.updated).toContain("ticket keys");
    const card = newCard(), id = await sellAndWrite(card);
    v.store.setOnline(false);
    expect((await v.proc.handle(card)).status).toBe("charged");
    expect(v.store.pending()[0]).toMatchObject({ kind: "ticket", ticketId: id, offline: true });
    await v.sync.drain();
    const t = await h.db.ticket.findUnique({ where: { id } });
    expect(t).toMatchObject({ status: "USED", usedDevice: "VAL-0001" });
    expect(await h.db.anomaly.count({ where: { cardUid: card.serial.toString("hex") } })).toBe(0);
    expect(v.store.ticketKeysVersion).toBeGreaterThan(0);
    expect((await v.sync.syncOnce()).updated).toEqual([]);                        // keys are not re-sent
  });

  it("the same card is refused a second time, and can be sold a new ticket afterwards", async () => {
    const v = validator(); await v.sync.syncOnce();
    const card = newCard(); await sellAndWrite(card);
    await v.proc.handle(card); card.removeFromField();
    expect(await v.proc.handle(card)).toMatchObject({ status: "denied", reason: "TICKET_USED" });
    await v.sync.drain();
    const id2 = await sellAndWrite(card);                                          // the station re-authenticates with the card's own password and rewrites it
    expect((await readTicket(card)).used).toBeNull();
    expect((await v.proc.handle(card)).status).toBe("charged");
    await v.sync.drain();
    expect((await h.db.ticket.findUnique({ where: { id: id2 } }))!.status).toBe("USED");
  });

  it("a full copy of an unused ticket works once on each device that has not heard about the other, and the server flags the second use", async () => {
    const admin = await h.login("admin@afc.local");
    const second = await h.api(admin, "POST", "/api/devices", { id: "VAL-0002", name: "second bus" });
    const v1 = validator(), v2 = validator("VAL-0002", Buffer.from(second.body.secret, "hex"));
    await v1.sync.syncOnce(); await v2.sync.syncOnce();
    const original = newCard(), id = await sellAndWrite(original);
    const copy = new SimulatedUltralight(original.serial);                         // a copy with the same UID (needs a special card, but it is the worst case)
    const src = await readTicket(original); await writeTicket(copy, keys, src.data, src.signature); copy.removeFromField();
    v1.store.setOnline(false); v2.store.setOnline(false);
    expect((await v1.proc.handle(original)).status).toBe("charged");
    expect((await v1.proc.handle(copy)).status).toBe("denied");                    // same device: its own record catches the copy
    expect((await v2.proc.handle(copy)).status).toBe("charged");                   // another device that has not seen the first use
    await v1.sync.drain(); await v2.sync.drain();
    const a = await h.db.anomaly.findMany({ where: { kind: "DUPLICATE_TICKET", cardUid: original.serial.toString("hex") } });
    expect(a).toHaveLength(1); expect(a[0].severity).toBe("HIGH"); expect(a[0].detail).toContain(`Ticket ${id}`);
    expect((await h.db.ticket.findUnique({ where: { id } }))!.status).toBe("USED");
  });

  it("a forged ticket (signed with some other key) is refused on the bus and the attempt is reported", async () => {
    const v = validator(); await v.sync.syncOnce();
    const card = newCard();
    await sellAndWrite(card);
    const stolen = await readTicket(card);
    const forged = Buffer.from(stolen.data); forged.writeUInt32LE(forged.readUInt32LE(12) + 86400 * 30, 12);       // pretend it is good for a month longer
    const evil = new SimulatedUltralight(card.serial); await writeTicket(evil, keys, forged, stolen.signature); evil.removeFromField();
    expect(await v.proc.handle(evil)).toMatchObject({ status: "denied", reason: "INVALID_TICKET" });
    await v.sync.drain();
    expect((await h.db.anomaly.findMany({ where: { cardUid: card.serial.toString("hex") } })).map((x) => x.kind)).toContain("TICKET_INVALID_PRESENTED");
  });
});
