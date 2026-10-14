import { Tx } from "../db";

/**
 * Double-entry ledger. A journal is a set of postings that add up to zero; accounts are plain strings:
 *
 *   card:<uid>           money on a fare card (a liability: it is the passenger's)
 *   revenue:route:<id>   fares earned on a route
 *   prepaid:pending      paid for but not yet loaded onto the card
 *   clearing:cash / clearing:mobile_money   money received from agents / the provider, waiting to be banked or settled
 *   adjustment           staff corrections and the system's own catch-up postings
 *
 * Journals and postings are never changed or deleted (database triggers refuse it) and a journal that does not balance cannot be committed.
 * A card account's balance can never be recorded below zero.
 */
export interface Line { account: string; amount: number }
export class LedgerError extends Error { constructor(public readonly code: "UNBALANCED" | "BAD_AMOUNT" | "NEGATIVE_BALANCE", msg: string) { super(msg); } }

export const cardAccount = (uid: string) => `card:${uid}`;
export const routeRevenue = (routeId: number) => `revenue:route:${routeId}`;

/** Takes a transaction-scoped lock so two postings to the same card cannot race each other's running balance. */
async function lock(tx: Tx, account: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${account}, 0))`;
}

export async function accountBalance(tx: Tx, account: string): Promise<number> {
  const last = await tx.posting.findFirst({ where: { account, balanceAfter: { not: null } }, orderBy: { id: "desc" }, select: { balanceAfter: true } });
  return last?.balanceAfter ?? 0;
}

export const cardBalance = (tx: Tx, uid: string) => accountBalance(tx, cardAccount(uid));

export async function postJournal(tx: Tx, j: { kind: string; ref?: string; memo?: string; lines: Line[] }): Promise<string> {
  if (j.lines.length < 2) throw new LedgerError("UNBALANCED", "A journal needs at least two postings");
  if (!j.lines.every((l) => Number.isSafeInteger(l.amount) && l.amount !== 0)) throw new LedgerError("BAD_AMOUNT", "Posting amounts must be non-zero whole cents");
  if (j.lines.reduce((s, l) => s + l.amount, 0) !== 0) throw new LedgerError("UNBALANCED", "Postings must add up to zero");

  const cards = [...new Set(j.lines.map((l) => l.account).filter((a) => a.startsWith("card:")))].sort();
  for (const a of cards) await lock(tx, a);
  const running = new Map<string, number>();
  for (const a of cards) running.set(a, await accountBalance(tx, a));

  const journal = await tx.journal.create({ data: { kind: j.kind, ref: j.ref, memo: j.memo } });
  for (const l of j.lines) {
    let balanceAfter: number | null = null;
    if (running.has(l.account)) {
      balanceAfter = running.get(l.account)! + l.amount;
      if (balanceAfter < 0) throw new LedgerError("NEGATIVE_BALANCE", `${l.account} would go below zero`);
      running.set(l.account, balanceAfter);
    }
    await tx.posting.create({ data: { journalId: journal.id, account: l.account, amount: l.amount, balanceAfter } });
  }
  return journal.id;
}
