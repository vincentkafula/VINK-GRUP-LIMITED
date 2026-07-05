import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { bankDb } from "../data/bankingStore.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { BankCard } from "../types/banking.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/bank/cards?userId&network&type&status
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const { userId, network, type, status } = req.query as Record<string, string>;
  let data = [...bankDb.cards];
  if (userId)  data = data.filter(c => c.userId === userId);
  if (network) data = data.filter(c => c.network === network);
  if (type)    data = data.filter(c => c.type === type);
  if (status)  data = data.filter(c => c.status === status);
  res.json({ success: true, data, meta: { total: data.length, active: data.filter(c=>c.status==="active").length } });
});

// GET /api/bank/cards/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const card = bankDb.cards.find(c => c.id === req.params.id);
  if (!card) { res.status(404).json({ success: false, error: "Card not found" }); return; }
  res.json({ success: true, data: card });
});

// POST /api/bank/cards  — issue new card
router.post("/", requireAuth, requireRole("superadmin","noc_engineer"), (req: Request, res: Response): void => {
  const { userId, accountId, network, type, tier } = req.body;
  if (!userId || !accountId || !network || !type) {
    res.status(400).json({ success: false, error: "userId, accountId, network, type required" }); return;
  }
  const user = bankDb.users.find(u => u.id === userId);
  if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

  const last4 = String(Math.floor(Math.random() * 9000) + 1000);
  const card: BankCard = {
    id: uuid(), userId, accountId, network, type: type as BankCard["type"],
    tier: tier ?? "standard",
    pan: `${network === "visa" ? "4" : "5"}242 **** **** ${last4}`, last4,
    expiry: `${String(Math.floor(Math.random()*12)+1).padStart(2,"0")}/${new Date(Date.now()+4*365*86400000).toISOString().slice(2,4)}`,
    cvv: "***",
    nameOnCard: `${user.firstName} ${user.lastName}`.toUpperCase(),
    status: "active", contactless: true, applePayEnrolled: false, googlePayEnrolled: false,
    dailyLimit: 10000, monthlyLimit: 50000, spentToday: 0, spentThisMonth: 0,
    atmWithdrawalLimit: 5000, onlineTxnEnabled: true, internationalEnabled: false,
    issuedAt: new Date().toISOString(), lastUsedAt: null, tokenized: false,
    binCode: network === "visa" ? "424242" : "520000",
  };
  bankDb.cards.push(card);
  res.status(201).json({ success: true, data: card });
});

// PATCH /api/bank/cards/:id/freeze
router.patch("/:id/freeze", requireAuth, (req: Request, res: Response): void => {
  const card = bankDb.cards.find(c => c.id === req.params.id);
  if (!card) { res.status(404).json({ success: false, error: "Card not found" }); return; }
  card.status = "frozen";
  res.json({ success: true, data: card });
});

// PATCH /api/bank/cards/:id/unfreeze
router.patch("/:id/unfreeze", requireAuth, (req: Request, res: Response): void => {
  const card = bankDb.cards.find(c => c.id === req.params.id);
  if (!card) { res.status(404).json({ success: false, error: "Card not found" }); return; }
  card.status = "active";
  res.json({ success: true, data: card });
});

// PATCH /api/bank/cards/:id/block  — permanent
router.patch("/:id/block", requireAuth, (req: Request, res: Response): void => {
  const card = bankDb.cards.find(c => c.id === req.params.id);
  if (!card) { res.status(404).json({ success: false, error: "Card not found" }); return; }
  card.status = "blocked";
  res.json({ success: true, data: card });
});

// PATCH /api/bank/cards/:id/limits
router.patch("/:id/limits", requireAuth, (req: Request, res: Response): void => {
  const card = bankDb.cards.find(c => c.id === req.params.id);
  if (!card) { res.status(404).json({ success: false, error: "Card not found" }); return; }
  const { dailyLimit, monthlyLimit, atmWithdrawalLimit, onlineTxnEnabled, internationalEnabled } = req.body;
  if (dailyLimit !== undefined) card.dailyLimit = dailyLimit;
  if (monthlyLimit !== undefined) card.monthlyLimit = monthlyLimit;
  if (atmWithdrawalLimit !== undefined) card.atmWithdrawalLimit = atmWithdrawalLimit;
  if (onlineTxnEnabled !== undefined) card.onlineTxnEnabled = onlineTxnEnabled;
  if (internationalEnabled !== undefined) card.internationalEnabled = internationalEnabled;
  res.json({ success: true, data: card });
});

// GET /api/bank/cards/:id/transactions
router.get("/:id/transactions", requireAuth, (req: Request, res: Response): void => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const data  = bankDb.txns.filter(t => t.cardId === req.params.id)
    .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = data.length;
  res.json({ success: true, data: data.slice((page-1)*limit, page*limit), meta: { page, limit, total } });
});

export default router;
