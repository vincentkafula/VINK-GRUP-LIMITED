import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import {
  unifiedAccounts, nostroAccounts, fxRates, globalCards,
  globalTransactions, depositRecords, p2pTransfers,
  kycRecords, amlChecks, fxConversions, getGlobalBankingKpi,
} from "../data/globalBankingStore.js";
import type { SupportedCurrency, GlobalCard, DepositRecord, P2PTransfer, FxConversion } from "../types/globalBanking.js";

const router: ReturnType<typeof Router> = Router();

// ─── Unified Accounts ────────────────────────────────────────────────────────

router.get("/accounts", (_req: Request, res: Response): void => {
  res.json({ success: true, data: unifiedAccounts, meta: { total: unifiedAccounts.length } });
});

router.get("/accounts/:id", (req: Request, res: Response): void => {
  const acct = unifiedAccounts.find(a => a.id === req.params.id || a.referenceNumber === req.params.id);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  res.json({ success: true, data: acct });
});

router.post("/accounts/lookup", (req: Request, res: Response): void => {
  const { referenceNumber } = req.body;
  const acct = unifiedAccounts.find(a => a.referenceNumber === referenceNumber);
  if (!acct) { res.status(404).json({ success: false, error: "No account found for that reference number" }); return; }
  res.json({ success: true, data: { id: acct.id, name: acct.customerName, referenceNumber: acct.referenceNumber, baseCurrency: acct.baseCurrency } });
});

// ─── Nostro Accounts ─────────────────────────────────────────────────────────

router.get("/nostro", (_req: Request, res: Response): void => {
  const total = nostroAccounts.reduce((s, n) => {
    const usdEquiv: Record<string,number> = { ZAR: 1/18.35, ZMW: 1/27.20, EUR: 1.086, USD: 1, CNY: 1/7.248 };
    return s + n.balance * (usdEquiv[n.currency] ?? 1);
  }, 0);
  res.json({ success: true, data: nostroAccounts, meta: { totalUsdEquivalent: +total.toFixed(2) } });
});

router.get("/nostro/:id", (req: Request, res: Response): void => {
  const n = nostroAccounts.find(n => n.id === req.params.id);
  if (!n) { res.status(404).json({ success: false, error: "Nostro account not found" }); return; }
  res.json({ success: true, data: n });
});

// ─── FX Engine ───────────────────────────────────────────────────────────────

router.get("/fx/rates", (_req: Request, res: Response): void => {
  res.json({ success: true, data: fxRates, updatedAt: new Date().toISOString() });
});

router.post("/fx/quote", (req: Request, res: Response): void => {
  const { fromCurrency, toCurrency, amount } = req.body;
  const rate = fxRates.find(r => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency);
  if (!rate) { res.status(400).json({ success: false, error: `No rate available for ${fromCurrency} → ${toCurrency}` }); return; }
  const convertedAmount = +(amount * rate.customerRate).toFixed(2);
  const fee = +(amount * (rate.spread / 100)).toFixed(2);
  res.json({ success: true, data: { fromCurrency, toCurrency, fromAmount: amount, toAmount: convertedAmount, rate: rate.customerRate, interbankRate: rate.interbankRate, fee, feeCurrency: fromCurrency, spread: rate.spread, validUntilSeconds: 30 } });
});

router.post("/fx/convert", (req: Request, res: Response): void => {
  const { accountId, fromCurrency, toCurrency, fromAmount } = req.body;
  const acct = unifiedAccounts.find(a => a.id === accountId);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  const rate = fxRates.find(r => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency);
  if (!rate) { res.status(400).json({ success: false, error: "FX rate not available" }); return; }
  if ((acct.balances[fromCurrency as SupportedCurrency] ?? 0) < fromAmount) {
    res.status(400).json({ success: false, error: "Insufficient balance" }); return;
  }
  const toAmount = +(fromAmount * rate.customerRate).toFixed(2);
  const feeAmount = +(fromAmount * (rate.spread / 100)).toFixed(2);
  acct.balances[fromCurrency as SupportedCurrency] -= fromAmount;
  acct.balances[toCurrency as SupportedCurrency] = (acct.balances[toCurrency as SupportedCurrency] ?? 0) + toAmount;
  const conv: FxConversion = { id: uuid(), accountId, fromCurrency: fromCurrency as SupportedCurrency, toCurrency: toCurrency as SupportedCurrency, fromAmount, toAmount, rate: rate.customerRate, feeAmount, feeCurrency: fromCurrency as SupportedCurrency, status: "completed", createdAt: new Date().toISOString() };
  fxConversions.push(conv);
  res.json({ success: true, data: conv });
});

// ─── Cards ───────────────────────────────────────────────────────────────────

router.get("/cards", (req: Request, res: Response): void => {
  const { accountId, status, type } = req.query as Record<string,string>;
  let data = [...globalCards];
  if (accountId) data = data.filter(c => c.accountId === accountId);
  if (status)    data = data.filter(c => c.status === status);
  if (type)      data = data.filter(c => c.type === type);
  res.json({ success: true, data, meta: { total: data.length } });
});

router.get("/cards/:id", (req: Request, res: Response): void => {
  const card = globalCards.find(c => c.id === req.params.id);
  if (!card) { res.status(404).json({ success: false, error: "Card not found" }); return; }
  res.json({ success: true, data: card });
});

router.patch("/cards/:id/freeze", (req: Request, res: Response): void => {
  const card = globalCards.find(c => c.id === req.params.id);
  if (!card) { res.status(404).json({ success: false, error: "Card not found" }); return; }
  card.status = card.status === "frozen" ? "active" : "frozen";
  res.json({ success: true, data: card, message: `Card ${card.status === "frozen" ? "frozen" : "unfrozen"} successfully` });
});

router.patch("/cards/:id/limits", (req: Request, res: Response): void => {
  const card = globalCards.find(c => c.id === req.params.id);
  if (!card) { res.status(404).json({ success: false, error: "Card not found" }); return; }
  const { dailyLimit, monthlyLimit, atmEnabled, onlineEnabled, internationalEnabled } = req.body;
  if (dailyLimit !== undefined) card.dailyLimit = dailyLimit;
  if (monthlyLimit !== undefined) card.monthlyLimit = monthlyLimit;
  if (atmEnabled !== undefined) card.atmEnabled = atmEnabled;
  if (onlineEnabled !== undefined) card.onlineEnabled = onlineEnabled;
  if (internationalEnabled !== undefined) card.internationalEnabled = internationalEnabled;
  res.json({ success: true, data: card });
});

router.post("/cards", (req: Request, res: Response): void => {
  const { accountId, type, network, nameOnCard, binCountry, currency } = req.body;
  const acct = unifiedAccounts.find(a => a.id === accountId);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  const last4 = String(Math.floor(Math.random() * 9000 + 1000));
  const card: GlobalCard = { id: uuid(), accountId, customerId: acct.customerId, type, network, pan: `${network === "visa" ? "4" : "5"}••• •••• •••• ${last4}`, last4, expiry: "12/27", cvv: "***", nameOnCard: nameOnCard.toUpperCase(), status: type === "virtual" ? "active" : "pending", binCountry, currency, dailyLimit: 10000, monthlyLimit: 50000, spentToday: 0, spentThisMonth: 0, atmEnabled: type !== "virtual", onlineEnabled: true, internationalEnabled: false, contactlessEnabled: type !== "virtual", issuedAt: new Date().toISOString(), lastUsedAt: null };
  globalCards.push(card);
  acct.cardIds.push(card.id);
  res.status(201).json({ success: true, data: card });
});

// ─── Transactions ─────────────────────────────────────────────────────────────

router.get("/transactions", (req: Request, res: Response): void => {
  const { accountId, channel, currency, page = "1", limit = "20" } = req.query as Record<string,string>;
  let data = [...globalTransactions].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (accountId) data = data.filter(t => t.accountId === accountId);
  if (channel)   data = data.filter(t => t.channel === channel);
  if (currency)  data = data.filter(t => t.billedCurrency === currency);
  const pg = Math.max(1, +page), lm = Math.min(100, +limit);
  res.json({ success: true, data: data.slice((pg-1)*lm, pg*lm), meta: { page: pg, limit: lm, total: data.length } });
});

// ─── Deposits ─────────────────────────────────────────────────────────────────

router.get("/deposits", (req: Request, res: Response): void => {
  const { accountId } = req.query as Record<string,string>;
  let data = [...depositRecords];
  if (accountId) data = data.filter(d => d.accountId === accountId);
  res.json({ success: true, data, meta: { total: data.length } });
});

router.post("/deposits/initiate", (req: Request, res: Response): void => {
  const { accountId, channel, expectedCurrency, expectedAmount } = req.body;
  const acct = unifiedAccounts.find(a => a.id === accountId);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  const nostroMap: Record<string,string> = { ZAR: "na-za", ZMW: "na-zm", EUR: "na-eu", USD: "na-us", CNY: "na-cn" };
  const deposit: DepositRecord = { id: uuid(), accountId, channel, amount: expectedAmount, currency: expectedCurrency, reference: acct.referenceNumber, senderName: null, senderAccount: null, nostroAccountId: nostroMap[expectedCurrency] ?? "na-za", status: "processing", creditedAmount: null, creditedCurrency: null, fxRate: null, createdAt: new Date().toISOString(), creditedAt: null };
  depositRecords.push(deposit);
  res.status(201).json({ success: true, data: deposit, depositInstructions: { referenceNumber: acct.referenceNumber, nostroAccount: nostroAccounts.find(n => n.id === deposit.nostroAccountId), message: `Use reference ${acct.referenceNumber} when making your payment` } });
});

// ─── P2P Transfers ─────────────────────────────────────────────────────────────

router.post("/p2p", (req: Request, res: Response): void => {
  const { senderAccountId, recipientReferenceNumber, amount, currency, note } = req.body;
  const sender = unifiedAccounts.find(a => a.id === senderAccountId);
  const recipient = unifiedAccounts.find(a => a.referenceNumber === recipientReferenceNumber);
  if (!sender) { res.status(404).json({ success: false, error: "Sender account not found" }); return; }
  if (!recipient) { res.status(404).json({ success: false, error: "Recipient reference number not found" }); return; }
  if ((sender.balances[currency as SupportedCurrency] ?? 0) < amount) {
    res.status(400).json({ success: false, error: "Insufficient balance" }); return;
  }
  sender.balances[currency as SupportedCurrency] -= amount;
  recipient.balances[currency as SupportedCurrency] = (recipient.balances[currency as SupportedCurrency] ?? 0) + amount;
  const transfer: P2PTransfer = { id: uuid(), senderAccountId, recipientReferenceNumber, recipientName: recipient.customerName, amount, currency, note: note ?? "", status: "completed", createdAt: new Date().toISOString(), completedAt: new Date().toISOString() };
  p2pTransfers.push(transfer);
  res.status(201).json({ success: true, data: transfer });
});

router.get("/p2p", (req: Request, res: Response): void => {
  const { accountId } = req.query as Record<string,string>;
  let data = [...p2pTransfers];
  if (accountId) data = data.filter(t => t.senderAccountId === accountId);
  res.json({ success: true, data, meta: { total: data.length } });
});

// ─── KYC ─────────────────────────────────────────────────────────────────────

router.get("/kyc", (req: Request, res: Response): void => {
  const { accountId, status } = req.query as Record<string,string>;
  let data = [...kycRecords];
  if (accountId) data = data.filter(k => k.accountId === accountId);
  if (status)    data = data.filter(k => k.status === status);
  res.json({ success: true, data, meta: { total: data.length } });
});

// ─── AML ─────────────────────────────────────────────────────────────────────

router.get("/aml", (req: Request, res: Response): void => {
  const { accountId } = req.query as Record<string,string>;
  let data = [...amlChecks];
  if (accountId) data = data.filter(a => a.accountId === accountId);
  res.json({ success: true, data, meta: { total: data.length } });
});

// ─── KPI dashboard ───────────────────────────────────────────────────────────

router.get("/kpi", (_req: Request, res: Response): void => {
  res.json({ success: true, data: getGlobalBankingKpi() });
});

// ─── FX Conversions history ──────────────────────────────────────────────────

router.get("/fx/conversions", (req: Request, res: Response): void => {
  const { accountId } = req.query as Record<string,string>;
  let data = [...fxConversions];
  if (accountId) data = data.filter(c => c.accountId === accountId);
  res.json({ success: true, data: data.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), meta: { total: data.length } });
});

export default router;
