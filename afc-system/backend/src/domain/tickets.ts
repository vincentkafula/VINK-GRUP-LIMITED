import { encodeTicket } from "@afc/shared";
import { signTicket } from "@afc/shared/node";
import type { Config } from "../config";
import type { Db } from "../db";
import { isUniqueViolation } from "../db";
import { type Actor, audit } from "./audit";
import { UID_PATTERN, normaliseUid } from "./cards";
import { badRequest, conflict, notFound } from "./errors";
import { postJournal } from "./ledger";

export const TICKET_MIN_PRICE = 100;        // R1.00
export const TICKET_MAX_PRICE = 50_000;     // R500.00
export const TICKET_MIN_LIFE = 10 * 60;     // 10 minutes
export const TICKET_MAX_LIFE = 31 * 86400;  // 31 days
type Method = "CASH" | "MOBILE_MONEY";
export type Signer = NonNullable<Config["ticketSigner"]>;
const clearing = (m: Method) => (m === "CASH" ? "clearing:cash" : "clearing:mobile_money");

export interface IssueTicket { cardUid: string; routeId: number; priceCents: number; validForSeconds: number; validFrom?: Date; method: Method; reference: string }

/** What the encoding station writes on the card: the 16 ticket bytes and their signature (hex), plus the key that signed them. */
export interface TicketPackage { ticket: Awaited<ReturnType<Db["ticket"]["findUniqueOrThrow"]>>; dataHex: string; signatureHex: string; keyId: number }

const pack = (signer: Signer, t: TicketPackage["ticket"]): TicketPackage => {
  const data = encodeTicket({ keyId: t.keyId, routeId: t.routeId, ticketId: t.id, validFrom: Math.floor(t.validFrom.getTime() / 1000), validUntil: Math.floor(t.validUntil.getTime() / 1000) });
  const uid = Buffer.from(t.cardUid, "hex");
  return { ticket: t, dataHex: data.toString("hex"), signatureHex: signTicket(signer.privateKey, data, uid).toString("hex"), keyId: t.keyId };
};

/**
 * Sells a ticket: records it, books the money (cash or mobile money received, income earned), and signs it for the card's UID.
 * Idempotent on (method, reference): sending the same sale again returns the same ticket, never a second charge.
 */
export async function issueTicket(db: Db, actor: Actor, signer: Signer, i: IssueTicket): Promise<TicketPackage & { replay: boolean }> {
  const uid = normaliseUid(i.cardUid);
  if (!UID_PATTERN.test(uid)) throw badRequest("bad_uid", "A card UID is 14 hex characters");
  if (!Number.isInteger(i.priceCents) || i.priceCents < TICKET_MIN_PRICE || i.priceCents > TICKET_MAX_PRICE) throw badRequest("bad_price", `A ticket costs between R${TICKET_MIN_PRICE / 100} and R${TICKET_MAX_PRICE / 100}`);
  if (!Number.isInteger(i.validForSeconds) || i.validForSeconds < TICKET_MIN_LIFE || i.validForSeconds > TICKET_MAX_LIFE) throw badRequest("bad_validity", "A ticket lasts between 10 minutes and 31 days");
  if (!i.reference || i.reference.length > 80) throw badRequest("bad_reference", "A receipt number is required");
  if (!Number.isInteger(i.routeId) || i.routeId < 0 || i.routeId > 65535) throw badRequest("bad_route", "Route must be a number (0 = any route)");

  const existing = await db.ticket.findUnique({ where: { method_reference: { method: i.method, reference: i.reference } } });
  if (existing) {
    if (existing.cardUid !== uid || existing.price !== i.priceCents || existing.routeId !== i.routeId) throw conflict("reference_reused", "That receipt number was already used for a different ticket");
    return { ...pack(signer, existing), replay: true };
  }
  if (i.routeId !== 0 && !(await db.route.findFirst({ where: { id: i.routeId, active: true } }))) throw badRequest("no_route", "That route does not exist");

  const from = i.validFrom ?? new Date();
  try {
    const result = await db.$transaction(async (tx) => {
      // requests with the same receipt are handled one at a time, so a concurrent repeat always sees the first one's ticket
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"ticket:" + i.method + ":" + i.reference}, 0))`;
      const dup = await tx.ticket.findUnique({ where: { method_reference: { method: i.method, reference: i.reference } } });
      if (dup) return { ticket: dup, replay: true };
      const card = await tx.card.findUnique({ where: { uid } });
      if (card && card.type !== "ULTRALIGHT_TICKET") throw conflict("not_a_ticket_card", "That UID belongs to a fare card, not a ticket card");
      if (card && card.status !== "ACTIVE") throw conflict("card_not_active", `This card is ${card.status.toLowerCase()}`);
      if (!card) await tx.card.create({ data: { uid, type: "ULTRALIGHT_TICKET", issuedBy: actor.id, holderName: null } });
      const open = await tx.ticket.findFirst({ where: { cardUid: uid, status: "ISSUED", validUntil: { gt: new Date() } } });
      if (open) throw conflict("active_ticket", `This card already holds an unused ticket (number ${open.id}) that has not expired`);

      const t = await tx.ticket.create({ data: { cardUid: uid, routeId: i.routeId, price: i.priceCents, keyId: signer.keyId, validFrom: from, validUntil: new Date(from.getTime() + i.validForSeconds * 1000), method: i.method, reference: i.reference, issuedBy: actor.id } });
      const journalId = await postJournal(tx, { kind: "TICKET_SALE", ref: String(t.id), memo: `Ticket ${t.id} route ${i.routeId || "any"} (${i.method} ${i.reference})`, lines: [{ account: clearing(i.method), amount: -i.priceCents }, { account: "revenue:tickets", amount: i.priceCents }] });
      await audit(tx, actor, "ticket.issue", String(t.id), { cardUid: uid, price: i.priceCents, routeId: i.routeId });
      return { ticket: await tx.ticket.update({ where: { id: t.id }, data: { journalId } }), replay: false };
    });
    if (result.replay && (result.ticket.cardUid !== uid || result.ticket.price !== i.priceCents || result.ticket.routeId !== i.routeId)) throw conflict("reference_reused", "That receipt number was already used for a different ticket");
    return { ...pack(signer, result.ticket), replay: result.replay };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await db.ticket.findUnique({ where: { method_reference: { method: i.method, reference: i.reference } } });
      if (again && again.cardUid === uid) return { ...pack(signer, again), replay: true };
    }
    throw e;
  }
}

export async function getTicket(db: Db, id: number) {
  const t = await db.ticket.findUnique({ where: { id } });
  if (!t) throw notFound("Ticket");
  return t;
}

export const listTickets = (db: Db, q: { status?: "ISSUED" | "USED" | "VOID"; take: number }) =>
  db.ticket.findMany({ where: q.status ? { status: q.status } : {}, orderBy: { id: "desc" }, take: q.take });

/** The public keys a validator needs to check tickets: the current one and any retired ones still in circulation. */
export const ticketKeyList = (signer: Signer) => ({ version: signer.keyId * 1000 + signer.retired.length, keys: [{ id: signer.keyId, publicKey: signer.publicKey }, ...signer.retired.map((r) => ({ id: r.id, publicKey: r.publicKey }))] });

/**
 * Cancels a sold ticket that has not been used and gives the money back: the sale is reversed in the ledger (the clearing account is credited back, the ticket income reduced).
 * The card still holds a genuine signature, so devices are told of the cancellation on their next sync and refuse it. A used ticket cannot be cancelled.
 * Idempotent: cancelling a cancelled ticket returns it unchanged.
 */
export async function voidTicket(db: Db, actor: Actor, id: number, reason: string) {
  if (!reason.trim() || reason.length > 200) throw badRequest("bad_reason", "Say why the ticket is cancelled (up to 200 characters)");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"ticket-void:" + id}, 0))`;
    const t = await tx.ticket.findUnique({ where: { id } });
    if (!t) throw notFound("Ticket");
    if (t.status === "VOID") return { ticket: t, replay: true };
    if (t.status === "USED") throw conflict("ticket_used", "This ticket has already been used and cannot be cancelled");
    const journalId = await postJournal(tx, { kind: "TICKET_VOID", ref: String(t.id), memo: `Ticket ${t.id} cancelled: ${reason}`, lines: [{ account: clearing(t.method as Method), amount: t.price }, { account: "revenue:tickets", amount: -t.price }] });
    const ticket = await tx.ticket.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidedBy: actor.id, voidReason: reason, voidJournalId: journalId } });
    await audit(tx, actor, "ticket.void", String(t.id), { price: t.price, reason });
    return { ticket, replay: false };
  });
}

/** Cancelled tickets that could still be presented (not yet expired, with a day's slack), and a version that changes whenever the list does. */
export async function voidedTicketList(db: Db) {
  const rows = await db.ticket.findMany({ where: { status: "VOID", validUntil: { gt: new Date(Date.now() - 86400_000) } }, select: { id: true, voidedAt: true }, orderBy: { id: "asc" } });
  const all = await db.ticket.aggregate({ where: { status: "VOID" }, _max: { voidedAt: true }, _count: true });
  const version = all._count === 0 ? 0 : Math.floor((all._max.voidedAt?.getTime() ?? 0) / 1000) * 1000 + (all._count % 1000);
  return { version, ids: rows.map((r) => r.id) };
}
