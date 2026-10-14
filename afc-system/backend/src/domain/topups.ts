import { BALANCE_MAX } from "@afc/shared";
import type { Db, Tx } from "../db";
import { isUniqueViolation } from "../db";
import { type Actor, audit } from "./audit";
import { raiseAnomaly } from "./anomalies";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import type { FeedHub } from "./events";
import { cardAccount, cardBalance, postJournal } from "./ledger";

export const TOPUP_MIN = 500;       // R5.00
export const TOPUP_MAX = 200_000;   // R2 000.00 at one time
type Method = "CASH" | "MOBILE_MONEY" | "ADMIN";
const clearing = (m: Method) => (m === "CASH" ? "clearing:cash" : m === "MOBILE_MONEY" ? "clearing:mobile_money" : "adjustment");

export interface TopupInput { cardUid: string; amount: number; method: Method; reference: string; deviceId?: string }

async function checkCardAndLimits(tx: Tx, i: TopupInput) {
  if (!Number.isInteger(i.amount) || i.amount < TOPUP_MIN || i.amount > TOPUP_MAX) throw badRequest("bad_amount", `A top-up must be between R${TOPUP_MIN / 100} and R${TOPUP_MAX / 100}`);
  if (!i.reference || i.reference.length > 80) throw badRequest("bad_reference", "A reference is required (receipt or provider transaction number)");
  const card = await tx.card.findUnique({ where: { uid: i.cardUid } });
  if (!card) throw notFound("Card");
  if (card.status !== "ACTIVE") throw conflict("card_not_active", `This card is ${card.status.toLowerCase()} and cannot be topped up`);
  const pending = (await tx.topup.aggregate({ where: { cardUid: i.cardUid, status: "PENDING_LOAD" }, _sum: { amount: true } }))._sum.amount ?? 0;
  if ((await cardBalance(tx, i.cardUid)) + pending + i.amount > BALANCE_MAX) throw conflict("over_limit", `A card can hold at most R${BALANCE_MAX / 100}`);
}

/** A retried request (same method + reference) returns what was done the first time instead of crediting twice. */
async function replayOf(db: Db | Tx, i: TopupInput) {
  const t = await db.topup.findUnique({ where: { method_reference: { method: i.method, reference: i.reference } } });
  if (!t) return null;
  if (t.cardUid !== i.cardUid || t.amount !== i.amount) throw conflict("reference_reused", "That reference was already used for a different top-up");
  return t;
}

/** Money received, not yet on the card: the passenger can load it at any agent or validator station that holds the CREDIT key. */
export async function createTopupOrder(db: Db, actor: Actor, i: TopupInput, hub?: FeedHub) {
  const before = await replayOf(db, i);
  if (before) return { topup: before, replay: true };
  try {
    const topup = await db.$transaction(async (tx) => {
      await checkCardAndLimits(tx, i);
      const t = await tx.topup.create({ data: { cardUid: i.cardUid, amount: i.amount, method: i.method, reference: i.reference, deviceId: i.deviceId, createdBy: actor.id } });
      const j = await postJournal(tx, { kind: "TOPUP_PAID", ref: t.id, memo: `${i.method} ${i.reference}`, lines: [{ account: "prepaid:pending", amount: i.amount }, { account: clearing(i.method), amount: -i.amount }] });
      await audit(tx, actor, "topup.order", t.id, { cardUid: i.cardUid, amount: i.amount, method: i.method });
      return tx.topup.update({ where: { id: t.id }, data: { paidJournalId: j } });
    });
    return { topup, replay: false };
  } catch (e) {
    if (isUniqueViolation(e)) { const again = await replayOf(db, i); if (again) return { topup: again, replay: true }; }
    throw e;
  }
}

/** The card has been credited by a terminal: move the money from "paid, not loaded" onto the card's account. */
export async function confirmLoad(db: Db, actor: Actor, topupId: string, o: { deviceId?: string; cardBalanceAfter?: number } = {}, hub?: FeedHub) {
  const t = await db.$transaction(async (tx) => {
    const claimed = await tx.topup.updateMany({ where: { id: topupId, status: "PENDING_LOAD" }, data: { status: "LOADED", loadedAt: new Date(), deviceId: o.deviceId } });
    const topup = await tx.topup.findUnique({ where: { id: topupId } });
    if (!topup) throw notFound("Top-up");
    if (claimed.count === 0) {
      if (topup.status === "LOADED") return { topup, already: true };
      throw conflict("not_pending", `This top-up is ${topup.status.toLowerCase().replace("_", " ")}`);
    }
    const j = await postJournal(tx, { kind: "TOPUP_LOADED", ref: topup.id, memo: `Loaded onto card`, lines: [{ account: cardAccount(topup.cardUid), amount: topup.amount }, { account: "prepaid:pending", amount: -topup.amount }] });
    await tx.topup.update({ where: { id: topup.id }, data: { loadedJournalId: j } });
    await audit(tx, actor, "topup.loaded", topup.id, { deviceId: o.deviceId });
    if (o.cardBalanceAfter !== undefined) {
      const ledger = await cardBalance(tx, topup.cardUid);
      if (ledger !== o.cardBalanceAfter) {
        await raiseAnomaly(tx, hub, { kind: "LOAD_BALANCE_MISMATCH", severity: "MEDIUM", cardUid: topup.cardUid, deviceId: o.deviceId, detail: `After the load the terminal read ${o.cardBalanceAfter} cents on the card, the ledger says ${ledger}` });
      }
    }
    return { topup: { ...topup, status: "LOADED" as const }, already: false };
  });
  if (!t.already) hub?.publish({ type: "topup", at: new Date().toISOString(), cardUid: t.topup.cardUid, amount: t.topup.amount, method: t.topup.method });
  return t;
}

/** Order and load in one step, for an agent who takes cash and credits the card on the spot. Idempotent on (method, reference). */
export async function directLoad(db: Db, actor: Actor, i: TopupInput, o: { cardBalanceAfter?: number } = {}, hub?: FeedHub) {
  const first = await createTopupOrder(db, actor, i, hub);
  const loaded = await confirmLoad(db, actor, first.topup.id, { deviceId: i.deviceId, cardBalanceAfter: o.cardBalanceAfter }, hub);
  return { topup: loaded.topup, replay: first.replay && loaded.already };
}

export async function cancelTopup(db: Db, actor: Actor, topupId: string) {
  return db.$transaction(async (tx) => {
    const done = await tx.topup.updateMany({ where: { id: topupId, status: "PENDING_LOAD" }, data: { status: "CANCELLED" } });
    const t = await tx.topup.findUnique({ where: { id: topupId } });
    if (!t) throw notFound("Top-up");
    if (done.count === 0) throw conflict("not_pending", "Only a top-up that has not been loaded can be cancelled");
    await postJournal(tx, { kind: "TOPUP_CANCELLED", ref: t.id, memo: "Cancelled before loading", lines: [{ account: "prepaid:pending", amount: -t.amount }, { account: clearing(t.method), amount: t.amount }] });
    await audit(tx, actor, "topup.cancel", t.id, { amount: t.amount });
    return t;
  });
}

export async function pendingLoads(db: Db, cardUid: string) {
  return db.topup.findMany({ where: { cardUid, status: "PENDING_LOAD" }, orderBy: { createdAt: "asc" } });
}

/** Mobile-money provider callback body. Real providers each have their own format; this is the small, signed shape the placeholder accepts. */
export interface MobileMoneyEvent { reference: string; cardUid: string; amount: number; status: "SUCCESS" | "FAILED" }
export async function handleMobileMoneyEvent(db: Db, e: MobileMoneyEvent, hub?: FeedHub) {
  if (e.status !== "SUCCESS") return { ignored: true as const };
  const actor: Actor = { email: "mobile-money-webhook" };
  const r = await createTopupOrder(db, actor, { cardUid: e.cardUid, amount: e.amount, method: "MOBILE_MONEY", reference: e.reference }, hub);
  return { ignored: false as const, topupId: r.topup.id, replay: r.replay };
}

export function assertAgentMayLoad(role: string): void {
  if (role === "VIEWER") throw forbidden();
}
