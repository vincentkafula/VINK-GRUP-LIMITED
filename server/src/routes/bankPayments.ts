import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { bankDb } from "../data/bankingStore.js";
import { requireAuth } from "../middleware/auth.js";
import type { Payment, BankTxn } from "../types/banking.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/bank/payments?userId&status
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const { userId, status } = req.query as Record<string, string>;
  let data = [...bankDb.payments];
  if (userId) data = data.filter(p => p.fromUserId === userId);
  if (status) data = data.filter(p => p.status === status);
  data.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data, meta: { total: data.length } });
});

// POST /api/bank/payments  — initiate transfer
router.post("/", requireAuth, (req: Request, res: Response): void => {
  const { fromUserId, fromAccountId, toAccountId, toIban, amount, currency, rail, description, reference } = req.body;
  if (!fromUserId || !fromAccountId || !amount) {
    res.status(400).json({ success: false, error: "fromUserId, fromAccountId, amount required" }); return;
  }
  const fromAcct = bankDb.accounts.find(a => a.id === fromAccountId);
  if (!fromAcct) { res.status(404).json({ success: false, error: "Source account not found" }); return; }
  if (fromAcct.availableBalance < amount) { res.status(422).json({ success: false, error: "Insufficient balance" }); return; }

  const fee = rail === "swift" ? +(amount * 0.005).toFixed(2) : rail === "sepa" ? 0.5 : 0;
  const toAcct = toAccountId ? bankDb.accounts.find(a => a.id === toAccountId || a.iban === toIban) : null;

  const payment: Payment = {
    id: uuid(), fromUserId, fromAccountId,
    toUserId: toAcct?.userId ?? null, toAccountId: toAcct?.id ?? null,
    toIban: toIban ?? null,
    amount, currency: currency ?? "ZAR", rail: rail ?? "internal",
    reference: reference ?? `VNK${Date.now()}`, description: description ?? "Transfer",
    status: "completed", feeAmount: fee,
    createdAt: new Date().toISOString(), executedAt: new Date().toISOString(),
  };
  bankDb.payments.push(payment);

  // Update balances
  fromAcct.balance -= (amount + fee);
  fromAcct.availableBalance -= (amount + fee);
  if (toAcct) { toAcct.balance += amount; toAcct.availableBalance += amount; }

  // Create ledger transactions
  const debitTxn: BankTxn = {
    id: uuid(), accountId: fromAccountId, userId: fromUserId,
    type: "debit", category: "transfer", amount, currency: currency ?? "ZAR",
    fxRate: null, description, reference: payment.reference,
    counterpartyName: toAcct ? bankDb.users.find(u=>u.id===toAcct.userId)?.firstName ?? "Recipient" : toIban ?? "External",
    counterpartyAccount: toAcct?.accountNumber ?? toIban ?? null,
    rail: rail ?? "internal", status: "completed", cardId: null,
    merchantName: null, merchantCategory: null, location: null,
    fraudScore: 0, flagged: false, createdAt: new Date().toISOString(), settledAt: new Date().toISOString(),
  };
  bankDb.txns.push(debitTxn);

  if (toAcct) {
    bankDb.txns.push({
      ...debitTxn, id: uuid(), accountId: toAcct.id, userId: toAcct.userId,
      type: "credit", counterpartyName: bankDb.users.find(u=>u.id===fromUserId)?.firstName ?? "Sender",
    });
  }

  res.status(201).json({ success: true, data: payment });
});

// POST /api/bank/payments/instant-payout  — driver instant payout
router.post("/instant-payout", requireAuth, (req: Request, res: Response): void => {
  const { driverId, amount } = req.body;
  const driver = bankDb.users.find(u => u.id === driverId && u.role === "driver");
  if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  const acct = bankDb.accounts.find(a => a.userId === driverId);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  const payout = { id: uuid(), driverId, amount, currency: "ZAR", status: "completed", createdAt: new Date().toISOString() };
  acct.balance += amount;
  acct.availableBalance += amount;
  res.json({ success: true, data: payout, message: `R${amount.toFixed(2)} instant payout processed` });
});

export default router;
