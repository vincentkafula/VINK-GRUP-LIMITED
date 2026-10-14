import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeTicket, publicKeyFromHex, verifyTicket, type SyncTransaction } from "@afc/shared";
import { startHarness, resetSeq, type Harness } from "./harness";
import { buildApp } from "../src/http/app";

let h: Harness, agent: string, admin: string, viewer: string;
let seq = 5000;
beforeAll(async () => { h = await startHarness(); resetSeq(0); [agent, admin, viewer] = await Promise.all(["agent", "admin", "viewer"].map((r) => h.login(`${r}@afc.local`))); });
afterAll(async () => { await h.stop(); });

let n = 0;
const uidOf = () => "04b7" + (++n).toString(16).padStart(10, "0");
const sale = (over: Record<string, unknown> = {}) => ({ cardUid: uidOf(), routeId: 2, priceCents: 1500, validForMinutes: 120, method: "CASH", reference: "RC-" + randomUUID().slice(0, 8), ...over });

const use = (ticketId: number, uid: string, over: Partial<SyncTransaction> = {}): SyncTransaction => ({
  id: randomUUID(), deviceId: "VAL-0001", deviceSeq: ++seq, cardUid: uid, result: "ok", kind: "ticket", ticketId, routeId: 2, stopId: 201, fare: 0, penalty: 0,
  balanceBefore: 0, balanceAfter: 0, cardCounter: 0, category: "adult", tappedAt: new Date().toISOString(), fareTableVersion: 1, offline: false, ...over,
});

describe("selling a ticket", () => {
  it("returns the 16 data bytes and signature the station writes; they verify with the published public key and only for that card's UID", async () => {
    const body = sale();
    const r = await h.api(agent, "POST", "/api/tickets", body);
    expect(r.status).toBe(201);
    const data = Buffer.from(r.body.dataHex, "hex"), sig = Buffer.from(r.body.signatureHex, "hex");
    expect(data).toHaveLength(16); expect(sig).toHaveLength(64);
    expect(decodeTicket(data)).toMatchObject({ routeId: 2, ticketId: r.body.ticket.id, keyId: 1 });
    const keys = (await h.api(viewer, "GET", "/api/tickets-public-keys")).body;
    const pub = publicKeyFromHex(keys.keys[0].publicKey);
    expect(verifyTicket(pub, data, sig, Buffer.from(body.cardUid, "hex"))).toBe(true);
    expect(verifyTicket(pub, data, sig, Buffer.from(uidOf(), "hex"))).toBe(false);
    const d = decodeTicket(data)!; expect(d.validUntil - d.validFrom).toBe(7200);
  });

  it("books the sale: money received into clearing, income earned, and the books still balance", async () => {
    const b = sale({ priceCents: 2300, reference: "RC-LEDGER" });
    const r = await h.api(agent, "POST", "/api/tickets", b);
    const rows = await h.db.posting.findMany({ where: { journal: { kind: "TICKET_SALE", ref: String(r.body.ticket.id) } } });
    expect(rows.map((p) => [p.account, p.amount]).sort()).toEqual([["clearing:cash", -2300], ["revenue:tickets", 2300]]);
    const [{ s }] = await h.db.$queryRaw<{ s: bigint }[]>`SELECT COALESCE(SUM(amount),0) AS s FROM "Posting"`;
    expect(Number(s)).toBe(0);
  });

  it("selling the same receipt again returns the same ticket and takes no second payment", async () => {
    const b = sale({ reference: "RC-ONCE" });
    const a = await h.api(agent, "POST", "/api/tickets", b), again = await h.api(agent, "POST", "/api/tickets", b);
    expect(a.status).toBe(201); expect(again.status).toBe(200); expect(again.body.replay).toBe(true);
    expect(again.body.ticket.id).toBe(a.body.ticket.id); expect(again.body.signatureHex).toBe(a.body.signatureHex);
    expect(await h.db.journal.count({ where: { kind: "TICKET_SALE", ref: String(a.body.ticket.id) } })).toBe(1);
    expect((await h.api(agent, "POST", "/api/tickets", { ...b, priceCents: 9900 })).status).toBe(409);            // same receipt, different ticket
    const raced = await Promise.all([1, 2, 3].map(() => h.api(agent, "POST", "/api/tickets", sale({ cardUid: "04b7aaaaaaaa01", reference: "RC-RACE" }))));
    expect(new Set(raced.map((x) => x.body.ticket?.id)).size).toBe(1);
  });

  it("checks the sale: price, life, route, a fare-card UID, an unused ticket still on the card, a blocked card", async () => {
    expect((await h.api(agent, "POST", "/api/tickets", sale({ priceCents: 50 }))).status).toBe(400);
    expect((await h.api(agent, "POST", "/api/tickets", sale({ priceCents: 60000 }))).status).toBe(400);
    expect((await h.api(agent, "POST", "/api/tickets", sale({ validForMinutes: 5 }))).status).toBe(400);
    expect((await h.api(agent, "POST", "/api/tickets", sale({ routeId: 999 }))).status).toBe(400);
    expect((await h.api(agent, "POST", "/api/tickets", sale({ cardUid: "04a1b2c3d4e5f6" }))).body.error.code).toBe("not_a_ticket_card");
    const uid = uidOf();
    expect((await h.api(agent, "POST", "/api/tickets", sale({ cardUid: uid }))).status).toBe(201);
    expect((await h.api(agent, "POST", "/api/tickets", sale({ cardUid: uid }))).body.error.code).toBe("active_ticket");
    const blocked = uidOf(); await h.api(agent, "POST", "/api/tickets", sale({ cardUid: blocked }));
    await h.db.card.update({ where: { uid: blocked }, data: { status: "BLOCKED" } }); await h.db.ticket.updateMany({ where: { cardUid: blocked }, data: { status: "USED" } });
    expect((await h.api(agent, "POST", "/api/tickets", sale({ cardUid: blocked }))).body.error.code).toBe("card_not_active");
  });

  it("a used card can be sold a new ticket", async () => {
    const uid = uidOf(); const a = await h.api(agent, "POST", "/api/tickets", sale({ cardUid: uid }));
    await h.sync([use(a.body.ticket.id, uid)]);
    const next = await h.api(agent, "POST", "/api/tickets", sale({ cardUid: uid }));
    expect(next.status).toBe(201); expect(next.body.ticket.id).toBeGreaterThan(a.body.ticket.id);
  });

  it("only agents and operators can sell, viewers can read, and tickets are off when no signing key is configured", async () => {
    expect((await h.api(viewer, "POST", "/api/tickets", sale())).status).toBe(403);
    expect((await h.api(null, "POST", "/api/tickets", sale())).status).toBe(401);
    expect((await h.api(viewer, "GET", "/api/tickets")).status).toBe(200);
    const off = await buildApp({ config: { ...h.config, ticketSigner: undefined }, db: h.db }); await off.ready();
    const r = await off.inject({ method: "POST", url: "/api/tickets", payload: sale(), headers: { authorization: `Bearer ${agent}` } });
    expect(r.statusCode).toBe(503); expect(JSON.parse(r.body).error.code).toBe("tickets_not_configured");
    await off.close();
  });
});

describe("using a ticket", () => {
  const issue = async () => { const uid = uidOf(); const r = await h.api(agent, "POST", "/api/tickets", sale({ cardUid: uid })); return { uid, id: r.body.ticket.id as number }; };

  it("the first use marks it used; reports are idempotent", async () => {
    const { uid, id } = await issue(); const t = use(id, uid);
    expect((await h.sync([t])).body.accepted).toEqual([t.id]);
    expect((await h.sync([t])).body.duplicates).toEqual([t.id]);
    const row = await h.db.ticket.findUnique({ where: { id } });
    expect(row).toMatchObject({ status: "USED", usedDevice: "VAL-0001" }); expect(row!.usedAt).not.toBeNull();
    expect(await h.db.anomaly.count({ where: { cardUid: uid } })).toBe(0);
  });

  it("a second use of the same ticket number (a copied ticket, a replayed record) is flagged HIGH", async () => {
    const { uid, id } = await issue();
    await h.sync([use(id, uid)]);
    await h.sync([use(id, uid, { deviceSeq: ++seq })]);
    const a = await h.db.anomaly.findMany({ where: { cardUid: uid, kind: "DUPLICATE_TICKET" } });
    expect(a).toHaveLength(1); expect(a[0].severity).toBe("HIGH"); expect(a[0].detail).toContain("already used on VAL-0001");
    expect(await h.db.txn.count({ where: { cardUid: uid } })).toBe(2);              // both kept for investigation
  });

  it("a ticket that was never sold, or one used on another card, is flagged", async () => {
    const { uid, id } = await issue();
    await h.sync([use(999_999, uid)]);
    const other = uidOf(); await h.db.card.create({ data: { uid: other, type: "ULTRALIGHT_TICKET" } });
    await h.sync([use(id, other)]);
    expect((await h.db.anomaly.findMany({ where: { cardUid: uid } })).map((x) => x.kind)).toContain("UNKNOWN_TICKET");
    expect((await h.db.anomaly.findMany({ where: { cardUid: other } })).map((x) => x.kind)).toContain("TICKET_UID_MISMATCH");
    expect((await h.db.ticket.findUnique({ where: { id } }))!.status).toBe("ISSUED");        // the wrong card did not use it up
  });

  it("refused tickets are stored with their reason, and forged ones raise an alert", async () => {
    const uid = uidOf(); await h.db.card.create({ data: { uid, type: "ULTRALIGHT_TICKET" } });
    await h.sync([use(1, uid, { result: "denied", denyReason: "INVALID_TICKET", kind: undefined, ticketId: undefined }), use(2, uid, { result: "denied", denyReason: "TICKET_EXPIRED", kind: undefined })]);
    expect((await h.db.txn.findMany({ where: { cardUid: uid } })).map((t) => t.denyReason).sort()).toEqual(["INVALID_TICKET", "TICKET_EXPIRED"]);
    expect((await h.db.anomaly.findMany({ where: { cardUid: uid } })).map((x) => x.kind)).toContain("TICKET_INVALID_PRESENTED");
    const rep = await h.api(admin, "GET", "/api/reports/failed-taps");
    expect(rep.body.rows.map((r: { reason: string }) => r.reason)).toEqual(expect.arrayContaining(["INVALID_TICKET", "TICKET_EXPIRED"]));
  });

  it("three serious ticket problems on one card block it", async () => {
    const { uid, id } = await issue();
    await h.sync([use(id, uid)]);
    for (let i = 0; i < 3; i++) await h.sync([use(id, uid, { deviceSeq: ++seq })]);
    expect((await h.db.card.findUnique({ where: { uid } }))!.status).toBe("BLOCKED");
  });
});

describe("ticket keys reach devices, and tickets show up in reports", () => {
  it("sends the public keys when the device's version differs, and nothing when it matches", async () => {
    const first = await h.sync([], { versions: { ticketKeysVersion: 0 } as never });
    expect(first.body.ticketKeys!.keys).toHaveLength(1); expect(first.body.ticketKeys!.keys[0].publicKey).toMatch(/^[0-9a-f]{64}$/);
    const again = await h.sync([], { versions: { ticketKeysVersion: first.body.ticketKeys!.version } as never });
    expect(again.body.ticketKeys).toBeUndefined();
  });
  it("the ticket report counts what was sold and used, exports CSV, and feeds the summary", async () => {
    const rep = (await h.api(admin, "GET", "/api/reports/tickets")).body;
    expect(rep.totals.sold).toBeGreaterThanOrEqual(5); expect(rep.totals.amount).toBeGreaterThan(0); expect(rep.totals.used).toBeGreaterThanOrEqual(2);
    const csv = await h.app.inject({ method: "GET", url: "/api/reports/tickets?format=csv", headers: { authorization: `Bearer ${admin}` } });
    expect(csv.body.split("\r\n")[0]).toBe("day,sold,used,amount_rand");
    const s = (await h.api(viewer, "GET", "/api/reports/summary")).body.last24h;
    expect(s.ticketSales).toBeGreaterThan(0); expect(s.ticketsSold).toBeGreaterThan(0);
  });
});

describe("cancelling a ticket", () => {
  const sold = async (over: Record<string, unknown> = {}) => { const b = sale(over); const r = await h.api(agent, "POST", "/api/tickets", b); return { uid: b.cardUid, id: r.body.ticket.id as number, price: b.priceCents as number }; };

  it("reverses the sale in the books, marks the ticket void, and keeps the books balanced", async () => {
    const t = await sold({ priceCents: 3100 });
    const r = await h.api(admin, "POST", `/api/tickets/${t.id}/void`, { reason: "Passenger changed their mind" });
    expect(r.status).toBe(200); expect(r.body.ticket.status).toBe("VOID"); expect(r.body.replay).toBe(false);
    const rows = await h.db.posting.findMany({ where: { journal: { kind: "TICKET_VOID", ref: String(t.id) } } });
    expect(rows.map((p) => [p.account, p.amount]).sort()).toEqual([["clearing:cash", 3100], ["revenue:tickets", -3100]]);
    const net = await h.db.posting.aggregate({ _sum: { amount: true } }); expect(net._sum.amount).toBe(0);
  });
  it("is safe to repeat: no second reversal", async () => {
    const t = await sold();
    await h.api(admin, "POST", `/api/tickets/${t.id}/void`, { reason: "x" });
    const again = await h.api(admin, "POST", `/api/tickets/${t.id}/void`, { reason: "x" });
    expect(again.status).toBe(200); expect(again.body.replay).toBe(true);
    expect(await h.db.journal.count({ where: { kind: "TICKET_VOID", ref: String(t.id) } })).toBe(1);
  });
  it("refuses a ticket that was already used, and agents may not cancel", async () => {
    const t = await sold(); await h.sync([use(t.id, t.uid)]);
    const used = await h.api(admin, "POST", `/api/tickets/${t.id}/void`, { reason: "x" });
    expect(used.status).toBe(409); expect(used.body.error.code).toBe("ticket_used");
    const t2 = await sold();
    expect((await h.api(agent, "POST", `/api/tickets/${t2.id}/void`, { reason: "x" })).status).toBe(403);
    expect((await h.api(admin, "POST", `/api/tickets/${t2.id}/void`, {})).status).toBe(400);
    expect((await h.api(admin, "POST", `/api/tickets/999999/void`, { reason: "x" })).status).toBe(404);
  });
  it("tells devices: the voided list changes version and holds the ticket until the device has it", async () => {
    const before = await h.sync([], { versions: { voidedVersion: 0 } as never });
    const t = await sold(); await h.api(admin, "POST", `/api/tickets/${t.id}/void`, { reason: "refund" });
    const after = await h.sync([], { versions: { voidedVersion: before.body.voidedTickets?.version ?? 0 } as never });
    expect(after.body.voidedTickets!.ids).toContain(t.id);
    const same = await h.sync([], { versions: { voidedVersion: after.body.voidedTickets!.version } as never });
    expect(same.body.voidedTickets).toBeUndefined();
  });
});
