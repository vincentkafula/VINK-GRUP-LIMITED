import { Router, Request, Response } from "express";
import { bankDb } from "../data/bankingStore.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/bank/accounts?userId&type&status
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const { userId, type, status } = req.query as Record<string, string>;
  let data = [...bankDb.accounts];
  if (userId) data = data.filter(a => a.userId === userId);
  if (type)   data = data.filter(a => a.type === type);
  if (status) data = data.filter(a => a.status === status);
  res.json({ success: true, data, meta: { total: data.length } });
});

// GET /api/bank/accounts/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const acct = bankDb.accounts.find(a => a.id === req.params.id || a.accountNumber === req.params.id);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  res.json({ success: true, data: acct });
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
router.get("/:id/summary", requireAuth, (req: Request, res: Response): void => {
  const acct = bankDb.accounts.find(a => a.id === req.params.id);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
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
