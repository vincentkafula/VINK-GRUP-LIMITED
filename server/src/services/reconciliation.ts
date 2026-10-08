import type { Db } from "../portal/driverRoutes.js";
import { SYS_FEES, systemAccounts, type LedgerPort } from "./moneyEngine.js";

/**
 * Checks that the platform's records and the Banking ledger agree, and lists what needs a person. Read-only: it never moves money or "fixes" anything.
 *
 *   - every settled tap has its ledger posting (a settled tap with no posting means a lost or failed write),
 *   - confirmed taps that are still waiting to settle, and why (usually a recipient with no verified account),
 *   - payments that have been waiting or in arrears for a long time,
 *   - trips flagged for review (for example, no marshal logged).
 */
export interface Issue { severity: "problem" | "attention"; code: string; message: string; count: number }
export interface Reconciliation { ok: boolean; checkedAt: string; figures: Record<string, number>; issues: Issue[] }

const n = (v: unknown) => Number(v ?? 0);

export async function reconcile(db: Db, ledger: LedgerPort, now: Date = new Date(), sample = 500): Promise<Reconciliation> {
  const issues: Issue[] = [];
  const one = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;

  const settled = (await db.query(`SELECT s.tap_id, t.currency FROM tap_settlements s JOIN terminal_taps t ON t.id = s.tap_id WHERE s.status = 'settled' ORDER BY s.settled_at DESC LIMIT $1`, [sample])).rows;
  // The platform fee line exists on every settled tap's journal (even when the investor part is zero it carries the rest of the fee), except a fare of zero.
  const missing = settled.filter((r) => ledger.moved(`tap:${r.tap_id}`, systemAccounts(String(r.currency ?? "ZAR")).fees) === null).length;
  if (missing) issues.push({ severity: "problem", code: "settled_without_posting", message: "Some taps are marked settled but have no ledger posting. Do not re-run anything: ask an engineer to look.", count: missing });

  // every credited bank line has its ledger posting, and lines nobody could be credited for wait for a person
  const credited = (await db.query(`SELECT bank_ref, currency FROM pool_credits WHERE status = 'credited' ORDER BY credited_at DESC LIMIT $1`, [sample])).rows;
  const lost = credited.filter((r) => ledger.moved(`pool:${r.bank_ref}`, systemAccounts(String(r.currency)).externalIn) === null).length;
  if (lost) issues.push({ severity: "problem", code: "credit_without_posting", message: "Some bank credits are marked credited but have no ledger posting. Ask an engineer to look.", count: lost });
  const unmatched = n((await one(`SELECT COUNT(*) AS c FROM pool_credits WHERE status = 'unmatched'`)).c);
  if (unmatched) issues.push({ severity: "attention", code: "bank_credits_unmatched", message: "Bank credits could not be matched to an account. Match them on the money page.", count: unmatched });

  // VINK tokens: every confirmed token tap has the journal that took the tokens from the card's wallet, and the cash-out holding account holds exactly what is waiting to be paid out
  const tokenTaps = (await db.query(`SELECT idempotency_key AS ref, currency FROM terminal_taps WHERE scheme = 'vink_token' AND status = 'confirmed' ORDER BY received_at DESC LIMIT $1`, [sample])).rows;
  const tokenLost = tokenTaps.filter((r) => ledger.moved(String(r.ref), systemAccounts(String(r.currency ?? "ZAR")).clearing) === null).length;
  if (tokenLost) issues.push({ severity: "problem", code: "token_tap_without_posting", message: "Some token taps are confirmed but the tokens were never taken from the card's wallet. Ask an engineer to look.", count: tokenLost });
  for (const cur of ["ZAR", "ZMW"]) {
    const owed = n((await one(`SELECT COALESCE(SUM(amount_cents),0) AS s FROM token_cashouts WHERE status = 'requested' AND currency = $1`, [cur])).s);
    const hold = ledger.balance(cur === "ZAR" ? "sys:token_cashout" : `sys:${cur.toLowerCase()}:token_cashout`);
    if (hold !== owed) issues.push({ severity: "problem", code: "token_cashout_mismatch", message: `The ${cur} cash-out holding account does not match the requests waiting to be paid. Ask an engineer to look.`, count: 1 });
  }
  const oldCashouts = n((await one(`SELECT COUNT(*) AS c FROM token_cashouts WHERE status = 'requested' AND requested_at < $1`, [new Date(now.getTime() - 24 * 3600_000)])).c);
  if (oldCashouts) issues.push({ severity: "attention", code: "token_cashouts_waiting", message: "Token cash-outs have waited more than a day to be paid.", count: oldCashouts });

  const stuckXb = n((await one(`SELECT COUNT(*) AS c FROM cross_border_transfers WHERE status = 'posting' AND created_at < $1`, [new Date(now.getTime() - 5 * 60_000)])).c);
  if (stuckXb) issues.push({ severity: "problem", code: "cross_border_half_posted", message: "Cross-border transfers are stuck half-posted. Ask the sender to confirm again, or an engineer to finish them.", count: stuckXb });

  const unsettled = n((await one(`SELECT COUNT(*) AS c FROM terminal_taps WHERE status = 'confirmed' AND settled_at IS NULL`)).c);
  const blocked = (await db.query(`SELECT reason, COUNT(*) AS c FROM tap_settlements WHERE status = 'blocked' GROUP BY reason`)).rows;
  for (const b of blocked) issues.push({ severity: "attention", code: "tap_blocked", message: `Taps are waiting because ${b.reason}.`, count: n(b.c) });

  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const stuck = n((await one(`SELECT COUNT(*) AS c FROM payment_items WHERE status IN ('waiting','arrears') AND due_at < $1`, [dayAgo])).c);
  if (stuck) issues.push({ severity: "attention", code: "payments_overdue", message: "Payments have been waiting for more than a day (the payer's account is short, or an account is not linked).", count: stuck });

  const review = n((await one(`SELECT COUNT(*) AS c FROM trips WHERE needs_review IS NOT NULL`)).c);
  if (review) issues.push({ severity: "attention", code: "trips_need_review", message: "Trips were flagged for review (for example, no marshal logged).", count: review });

  const sum = async (status: string) => n((await one(`SELECT COALESCE(SUM(remaining_cents), 0) AS s FROM payment_items WHERE status = $1`, [status])).s);
  const figures = {
    settledTaps: n((await one(`SELECT COUNT(*) AS c FROM tap_settlements WHERE status = 'settled'`)).c), unsettledConfirmedTaps: unsettled,
    trips: n((await one(`SELECT COUNT(*) AS c FROM trips`)).c), paidItems: n((await one(`SELECT COUNT(*) AS c FROM payment_items WHERE status = 'paid'`)).c),
    waitingCents: await sum("waiting"), arrearsCents: await sum("arrears"), pendingCents: await sum("pending"),
    platformFeesCents: ledger.balance(SYS_FEES), bankCreditsCredited: credited.length, bankCreditsUnmatched: unmatched,
  };
  return { ok: !issues.some((i) => i.severity === "problem"), checkedAt: now.toISOString(), figures, issues };
}
