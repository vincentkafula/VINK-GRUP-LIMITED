import { Router, Request, Response } from "express";
import { bankDb } from "../data/bankingStore.js";
import { requireAuth } from "../middleware/auth.js";
import { findLedgerAccountId } from "../services/ledgerShadowWrite.js";
import { getBalance } from "../services/ledgerService.js";

const router: ReturnType<typeof Router> = Router();

/**
 * Stage 3 of plans/architecture/03-migration-plan.md: read cutover,
 * starting with the lowest-risk piece per the plan's own ordering --
 * account balances, read-only. Returns the account's balance/
 * availableBalance as read from the ledger (the new source of truth
 * for money figures) when the ledger has data for this account,
 * falling back to the in-memory value otherwise -- an account that's
 * never been shadow-written to or backfilled genuinely has no ledger
 * data yet, and falling back is correct there, not a bug being masked.
 *
 * Deliberately scoped to balance figures only: account metadata
 * (status, label, iban, overdraftLimit, interestRate) stays sourced
 * from bankDb as before -- those aren't part of the ledger schema
 * (01-ledger-design.md's accounts table doesn't carry them), and
 * migrating them is separate work from "the ledger is the source of
 * truth for money," which is the specific gap Phase 0 found.
 */
async function withLedgerBalance<T extends { accountNumber: string; balance: number; availableBalance: number }>(acct: T): Promise<T> {
  const ledgerAccountId = await findLedgerAccountId(acct.accountNumber);
  if (!ledgerAccountId) return acct; // no ledger data yet -- in-memory value stands
  const ledgerBalance = await getBalance(ledgerAccountId);
  if (!ledgerBalance) return acct;
  return {
    ...acct,
    balance: ledgerBalance.balanceCents / 100,
    availableBalance: ledgerBalance.availableCents / 100,
  };
}

// GET /api/bank/accounts?userId&type&status
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId, type, status } = req.query as Record<string, string>;
  let data = [...bankDb.accounts];
  if (userId) data = data.filter(a => a.userId === userId);
  if (type)   data = data.filter(a => a.type === type);
  if (status) data = data.filter(a => a.status === status);
  data = await Promise.all(data.map(withLedgerBalance));
  res.json({ success: true, data, meta: { total: data.length } });
});

// GET /api/bank/accounts/:id
router.get("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const acct = bankDb.accounts.find(a => a.id === req.params.id || a.accountNumber === req.params.id);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  res.json({ success: true, data: await withLedgerBalance(acct) });
});

// GET /api/bank/accounts/:id/transactions?page&limit&type&category
router.get("/:id/transactions", requireAuth, (req: Request, res: Response): void => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { type, category } = req.query as Record<string, string>;
  let data = bankDb.txns.filter(t => t.accountId === req.params.id);
  if (type)     data = data.filter(t => t.type === type);
  if (category) data = data.filter(t => t.category === category);
  data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = data.length;
  res.json({ success: true, data: data.slice((page-1)*limit, page*limit), meta: { page, limit, total, pages: Math.ceil(total/limit) } });
});

// GET /api/bank/accounts/:id/summary
router.get("/:id/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const found = bankDb.accounts.find(a => a.id === req.params.id);
  if (!found) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  const acct = await withLedgerBalance(found);
  const txns = bankDb.txns.filter(t => t.accountId === acct.id);
  const totalIn  = txns.filter(t => t.type === "credit").reduce((s,t) => s+t.amount, 0);
  const totalOut = txns.filter(t => t.type === "debit").reduce((s,t) => s+t.amount, 0);
  const byCategory = [...new Set(txns.map(t=>t.merchantCategory).filter(Boolean))].map(cat => ({
    category: cat, amount: +txns.filter(t=>t.merchantCategory===cat).reduce((s,t)=>s+t.amount,0).toFixed(2),
    count: txns.filter(t=>t.merchantCategory===cat).length,
  }));
  res.json({ success: true, data: { balance: acct.balance, availableBalance: acct.availableBalance, totalIn: +totalIn.toFixed(2), totalOut: +totalOut.toFixed(2), txnCount: txns.length, byCategory } });
});

// PATCH /api/bank/accounts/:id/freeze
router.patch("/:id/freeze", requireAuth, (req: Request, res: Response): void => {
  const acct = bankDb.accounts.find(a => a.id === req.params.id);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  acct.status = "frozen";
  res.json({ success: true, data: acct });
});

// PATCH /api/bank/accounts/:id/unfreeze
router.patch("/:id/unfreeze", requireAuth, (req: Request, res: Response): void => {
  const acct = bankDb.accounts.find(a => a.id === req.params.id);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  acct.status = "active";
  res.json({ success: true, data: acct });
});

export default router;
