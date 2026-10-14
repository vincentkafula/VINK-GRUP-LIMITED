import { BALANCE_MAX, CATEGORIES, type Category } from "@afc/shared";
import type { Db } from "../db";
import { isUniqueViolation } from "../db";
import { type Actor, audit } from "./audit";
import { badRequest, conflict, notFound } from "./errors";
import { cardAccount, cardBalance, postJournal } from "./ledger";
import { bumpVersion } from "./settings";

export const UID_PATTERN = /^[0-9a-f]{14}$/;
export const normaliseUid = (s: string) => s.replace(/[\s:-]/g, "").toLowerCase();

export interface RegisterCard {
  uid: string;
  type?: "DESFIRE" | "ULTRALIGHT_TICKET";
  holderName?: string;
  holderRef?: string;
  category?: Category;
  /** The balance the personalisation script wrote onto the card, in cents. It is recorded here so the books match the card from day one. */
  initialBalance?: number;
}

export async function registerCard(db: Db, actor: Actor, i: RegisterCard) {
  const uid = normaliseUid(i.uid);
  if (!UID_PATTERN.test(uid)) throw badRequest("bad_uid", "A card UID is 14 hex characters (7 bytes)");
  const category = i.category ?? "adult";
  if (!CATEGORIES.includes(category)) throw badRequest("bad_category", "Unknown passenger category");
  const initial = i.initialBalance ?? 0;
  if (!Number.isInteger(initial) || initial < 0 || initial > BALANCE_MAX) throw badRequest("bad_amount", "Initial balance is outside the allowed range");
  try {
    return await db.$transaction(async (tx) => {
      const card = await tx.card.create({ data: { uid, type: i.type ?? "DESFIRE", holderName: i.holderName, holderRef: i.holderRef, category, issuedBy: actor.id } });
      if (initial > 0) await postJournal(tx, { kind: "INITIAL", ref: uid, memo: "Balance written at personalisation", lines: [{ account: cardAccount(uid), amount: initial }, { account: "clearing:issuance", amount: -initial }] });
      if (category !== "adult") await bumpVersion(tx, "profilesVersion");
      await audit(tx, actor, "card.register", uid, { category, initial });
      return card;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("card_exists", "That card is already registered");
    throw e;
  }
}

export async function cardView(db: Db, uid: string) {
  const card = await db.card.findUnique({ where: { uid } });
  if (!card) throw notFound("Card");
  const balance = await cardBalance(db, uid);
  const pending = await db.topup.aggregate({ where: { cardUid: uid, status: "PENDING_LOAD" }, _sum: { amount: true } });
  return { ...card, balance, pendingLoad: pending._sum.amount ?? 0 };
}

export async function listCards(db: Db, q: { search?: string; status?: string; take: number; skip: number }) {
  const where: Record<string, unknown> = {};
  if (q.status) where.status = q.status;
  if (q.search) where.OR = [{ uid: { contains: normaliseUid(q.search) } }, { holderName: { contains: q.search, mode: "insensitive" } }, { holderRef: { contains: q.search, mode: "insensitive" } }];
  const [rows, total] = await Promise.all([db.card.findMany({ where, orderBy: { issuedAt: "desc" }, take: q.take, skip: q.skip }), db.card.count({ where })]);
  return { total, cards: rows };
}

export async function setCardStatus(db: Db, actor: Actor, uid: string, status: "ACTIVE" | "BLOCKED" | "LOST" | "EXPIRED", reason?: string) {
  return db.$transaction(async (tx) => {
    const card = await tx.card.findUnique({ where: { uid } });
    if (!card) throw notFound("Card");
    if (card.status === status) return card;
    const updated = await tx.card.update({ where: { uid }, data: { status, blockedReason: status === "ACTIVE" ? null : reason ?? null } });
    await bumpVersion(tx, "hotlistVersion");
    await audit(tx, actor, `card.${status.toLowerCase()}`, uid, { from: card.status, reason });
    return updated;
  });
}

export async function setCardCategory(db: Db, actor: Actor, uid: string, category: Category, holderName?: string) {
  if (!CATEGORIES.includes(category)) throw badRequest("bad_category", "Unknown passenger category");
  return db.$transaction(async (tx) => {
    const card = await tx.card.findUnique({ where: { uid } });
    if (!card) throw notFound("Card");
    const updated = await tx.card.update({ where: { uid }, data: { category, ...(holderName !== undefined ? { holderName } : {}) } });
    await bumpVersion(tx, "profilesVersion");
    await audit(tx, actor, "card.category", uid, { from: card.category, to: category });
    return updated;
  });
}

export async function cardHistory(db: Db, uid: string, take = 100) {
  const card = await db.card.findUnique({ where: { uid } });
  if (!card) throw notFound("Card");
  const [txns, topups, postings, anomalies] = await Promise.all([
    db.txn.findMany({ where: { cardUid: uid }, orderBy: { tappedAt: "desc" }, take }),
    db.topup.findMany({ where: { cardUid: uid }, orderBy: { createdAt: "desc" }, take }),
    db.posting.findMany({ where: { account: cardAccount(uid) }, orderBy: { id: "desc" }, take, include: { journal: { select: { kind: true, memo: true, ref: true } } } }),
    db.anomaly.findMany({ where: { cardUid: uid }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return {
    card: await cardView(db, uid),
    txns,
    topups,
    ledger: postings.map((p) => ({ id: p.id.toString(), at: p.createdAt, amount: p.amount, balanceAfter: p.balanceAfter, kind: p.journal.kind, memo: p.journal.memo, ref: p.journal.ref })),
    anomalies,
  };
}
