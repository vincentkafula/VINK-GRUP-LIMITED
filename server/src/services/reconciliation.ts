import type { Db } from "../portal/driverRoutes.js";
import { SYS_FEES, type LedgerPort } from "./moneyEngine.js";

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

  const settled = (await db.query(`SELECT tap_id FROM tap_settlements WHERE status = 'settled' ORDER BY settled_at DESC LIMIT $1`, [sample])).rows;
  // The platform fee line exists on every settled tap's journal (even when the investor part is zero it carries the rest of the fee), except a fare of zero.
  const missing = settled.filter((r) => ledger.moved(`tap:${r.tap_id}`, SYS_FEES) === null).length;
  if (missing) issues.push({ severity: "problem", code: "settled_without_posting", message: "Some taps are marked settled but have no ledger posting. Do not re-run anything: ask an engineer to look.", count: missing });

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
    platformFeesCents: ledger.balance(SYS_FEES),
  };
  return { ok: !issues.some((i) => i.severity === "problem"), checkedAt: now.toISOString(), figures, issues };
}
