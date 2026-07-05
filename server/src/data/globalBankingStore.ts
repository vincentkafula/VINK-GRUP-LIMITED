import { v4 as uuid } from "uuid";
import type {
  UnifiedAccount, NostroAccount, FxRate, GlobalCard,
  GlobalTransaction, DepositRecord, P2PTransfer, KycRecord, AmlCheck,
  GlobalBankingKpi, FxConversion, SupportedCurrency,
} from "../types/globalBanking.js";

// ─── FX Rates (refreshed every 30s by simulator) ──────────────────────────────
export const fxRates: FxRate[] = [
  { fromCurrency: "ZAR", toCurrency: "USD", interbankRate: 0.0545, customerRate: 0.0540, spread: 0.92, updatedAt: new Date().toISOString() },
  { fromCurrency: "ZAR", toCurrency: "EUR", interbankRate: 0.0502, customerRate: 0.0497, spread: 1.00, updatedAt: new Date().toISOString() },
  { fromCurrency: "ZAR", toCurrency: "CNY", interbankRate: 0.3950, customerRate: 0.3910, spread: 1.01, updatedAt: new Date().toISOString() },
  { fromCurrency: "ZAR", toCurrency: "ZMW", interbankRate: 1.4820, customerRate: 1.4673, spread: 0.99, updatedAt: new Date().toISOString() },
  { fromCurrency: "USD", toCurrency: "ZAR", interbankRate: 18.35, customerRate: 18.17, spread: 0.98, updatedAt: new Date().toISOString() },
  { fromCurrency: "USD", toCurrency: "EUR", interbankRate: 0.9210, customerRate: 0.9118, spread: 1.00, updatedAt: new Date().toISOString() },
  { fromCurrency: "USD", toCurrency: "CNY", interbankRate: 7.2480, customerRate: 7.1752, spread: 1.00, updatedAt: new Date().toISOString() },
  { fromCurrency: "USD", toCurrency: "ZMW", interbankRate: 27.20, customerRate: 26.93, spread: 0.99, updatedAt: new Date().toISOString() },
  { fromCurrency: "EUR", toCurrency: "USD", interbankRate: 1.0860, customerRate: 1.0751, spread: 1.00, updatedAt: new Date().toISOString() },
  { fromCurrency: "EUR", toCurrency: "ZAR", interbankRate: 19.93, customerRate: 19.73, spread: 1.00, updatedAt: new Date().toISOString() },
  { fromCurrency: "CNY", toCurrency: "ZAR", interbankRate: 2.5320, customerRate: 2.5066, spread: 1.00, updatedAt: new Date().toISOString() },
  { fromCurrency: "CNY", toCurrency: "USD", interbankRate: 0.1380, customerRate: 0.1366, spread: 1.01, updatedAt: new Date().toISOString() },
];

// ─── Nostro Accounts ──────────────────────────────────────────────────────────
export const nostroAccounts: NostroAccount[] = [
  { id: "na-za", country: "ZA", currency: "ZAR", bankName: "Standard Bank South Africa", accountNumber: "000123456789", swiftBic: "SBZAZAJJ", balance: 45_280_000, minReserveRequired: 5_000_000, lastReconciledAt: new Date().toISOString(), status: "active", centralBank: "SARB / NPCS", paymentRails: ["EFT", "PayShap", "RTGS", "Cash Agent"] },
  { id: "na-zm", country: "ZM", currency: "ZMW", bankName: "Zanaco Zambia", accountNumber: "ZM0041200007", swiftBic: "ZNCOZMLU", balance: 12_540_000, minReserveRequired: 2_000_000, lastReconciledAt: new Date().toISOString(), status: "active", centralBank: "Bank of Zambia", paymentRails: ["EFT", "Mobile Money (MTN/Airtel)", "Cash"] },
  { id: "na-eu", country: "EU", currency: "EUR", bankName: "Modulr Finance (Lithuania)", accountNumber: "LT647300010148381578", swiftBic: "MODRLT22", balance: 8_920_000, minReserveRequired: 1_500_000, lastReconciledAt: new Date().toISOString(), status: "active", centralBank: "ECB / SEPA", paymentRails: ["SEPA Credit Transfer", "SEPA Instant", "Target2"] },
  { id: "na-us", country: "US", currency: "USD", bankName: "Column Bank N.A. (BaaS)", accountNumber: "US28021300018003210", swiftBic: "CLBKUS66", balance: 22_470_000, minReserveRequired: 3_000_000, lastReconciledAt: new Date().toISOString(), status: "active", centralBank: "Federal Reserve / ACH", paymentRails: ["ACH", "Wire Transfer", "FedNow", "RTP"] },
  { id: "na-cn", country: "CN", currency: "CNY", bankName: "UnionPay International Partner", accountNumber: "6228481001009890121", swiftBic: "BKCHCNBJ", balance: 18_340_000, minReserveRequired: 2_500_000, lastReconciledAt: new Date().toISOString(), status: "active", centralBank: "PBOC / UnionPay", paymentRails: ["WeChat Pay", "Alipay", "UnionPay Cloud"] },
];

// ─── Demo Unified Accounts ────────────────────────────────────────────────────
export const unifiedAccounts: UnifiedAccount[] = [
  {
    id: "acct-001", referenceNumber: "VMS-GBL-2024-00001",
    customerId: "cust-001", customerName: "Vincent Kafula", email: "vincent@vink.com", phone: "+27 21 007 0772",
    baseCurrency: "ZAR", kycStatus: "approved", amlFlag: "clear", tier: "corporate",
    createdAt: "2024-01-15T08:00:00Z", lastActivityAt: new Date().toISOString(),
    balances: { ZAR: 847_250.00, USD: 45_820.00, EUR: 38_450.00, ZMW: 124_800.00, CNY: 298_450.00 },
    cardIds: ["card-001", "card-002", "card-003", "card-004"],
    subAccountIds: [], popiaConcent: true, gdprConsent: true, fatfChecked: true,
  },
  {
    id: "acct-002", referenceNumber: "VMS-GBL-2024-00247",
    customerId: "cust-002", customerName: "Nomsa Zulu", email: "nomsa@vink.com", phone: "+27 82 334 7821",
    baseCurrency: "ZAR", kycStatus: "approved", amlFlag: "clear", tier: "premium",
    createdAt: "2024-03-22T10:30:00Z", lastActivityAt: new Date().toISOString(),
    balances: { ZAR: 124_890.00, USD: 8_240.00, EUR: 0, ZMW: 0, CNY: 45_200.00 },
    cardIds: ["card-005", "card-006"],
    subAccountIds: [], popiaConcent: true, gdprConsent: false, fatfChecked: true,
  },
  {
    id: "acct-003", referenceNumber: "VMS-GBL-2024-00891",
    customerId: "cust-003", customerName: "Thabo Dlamini", email: "thabo@vink.com", phone: "+260 977 881 234",
    baseCurrency: "ZMW", kycStatus: "pending", amlFlag: "clear", tier: "standard",
    createdAt: "2024-05-10T14:00:00Z", lastActivityAt: new Date().toISOString(),
    balances: { ZAR: 0, USD: 2_150.00, EUR: 0, ZMW: 48_920.00, CNY: 0 },
    cardIds: ["card-007"],
    subAccountIds: [], popiaConcent: true, gdprConsent: false, fatfChecked: false,
  },
];

// ─── Cards ────────────────────────────────────────────────────────────────────
export const globalCards: GlobalCard[] = [
  { id: "card-001", accountId: "acct-001", customerId: "cust-001", type: "debit", network: "visa", pan: "4539 •••• •••• 4291", last4: "4291", expiry: "12/27", cvv: "***", nameOnCard: "VINCENT KAFULA", status: "active", binCountry: "ZA", currency: "ZAR", dailyLimit: 50000, monthlyLimit: 500000, spentToday: 4820, spentThisMonth: 87340, atmEnabled: true, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: true, issuedAt: "2024-01-15T08:00:00Z", lastUsedAt: new Date(Date.now() - 3600000).toISOString() },
  { id: "card-002", accountId: "acct-001", customerId: "cust-001", type: "virtual", network: "mastercard", pan: "5411 •••• •••• 7782", last4: "7782", expiry: "06/26", cvv: "***", nameOnCard: "VINCENT KAFULA", status: "active", binCountry: "EU", currency: "EUR", dailyLimit: 10000, monthlyLimit: 50000, spentToday: 0, spentThisMonth: 2840, atmEnabled: false, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: false, virtualCardToken: "vt_4f8a2b9c1d", issuedAt: "2024-01-15T08:00:00Z", lastUsedAt: new Date(Date.now() - 86400000).toISOString() },
  { id: "card-003", accountId: "acct-001", customerId: "cust-001", type: "business", network: "visa", pan: "4111 •••• •••• 1003", last4: "1003", expiry: "09/28", cvv: "***", nameOnCard: "VINK MULTI SERVICES", status: "active", binCountry: "US", currency: "USD", dailyLimit: 100000, monthlyLimit: 1000000, spentToday: 15240, spentThisMonth: 248900, atmEnabled: true, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: true, issuedAt: "2024-01-15T08:00:00Z", lastUsedAt: new Date(Date.now() - 7200000).toISOString() },
  { id: "card-004", accountId: "acct-001", customerId: "cust-001", type: "sub-account", network: "mastercard", pan: "5105 •••• •••• 5100", last4: "5100", expiry: "03/27", cvv: "***", nameOnCard: "SIPHO DLAMINI", status: "active", binCountry: "ZA", currency: "ZAR", dailyLimit: 5000, monthlyLimit: 25000, spentToday: 840, spentThisMonth: 8420, atmEnabled: true, onlineEnabled: true, internationalEnabled: false, contactlessEnabled: true, parentCardId: "card-001", subAccountLimit: 25000, issuedAt: "2024-02-01T08:00:00Z", lastUsedAt: new Date(Date.now() - 14400000).toISOString() },
  { id: "card-005", accountId: "acct-002", customerId: "cust-002", type: "debit", network: "mastercard", pan: "5412 •••• •••• 8834", last4: "8834", expiry: "11/26", cvv: "***", nameOnCard: "NOMSA ZULU", status: "active", binCountry: "ZA", currency: "ZAR", dailyLimit: 20000, monthlyLimit: 100000, spentToday: 1240, spentThisMonth: 18420, atmEnabled: true, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: true, issuedAt: "2024-03-22T10:30:00Z", lastUsedAt: new Date(Date.now() - 3600000).toISOString() },
  { id: "card-006", accountId: "acct-002", customerId: "cust-002", type: "virtual", network: "visa", pan: "4024 •••• •••• 2291", last4: "2291", expiry: "06/27", cvv: "***", nameOnCard: "NOMSA ZULU", status: "frozen", binCountry: "CN", currency: "CNY", dailyLimit: 5000, monthlyLimit: 20000, spentToday: 0, spentThisMonth: 3420, atmEnabled: false, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: false, issuedAt: "2024-04-01T08:00:00Z", lastUsedAt: null },
  { id: "card-007", accountId: "acct-003", customerId: "cust-003", type: "debit", network: "visa", pan: "4916 •••• •••• 3317", last4: "3317", expiry: "08/26", cvv: "***", nameOnCard: "THABO DLAMINI", status: "pending", binCountry: "ZM", currency: "ZMW", dailyLimit: 10000, monthlyLimit: 50000, spentToday: 0, spentThisMonth: 0, atmEnabled: true, onlineEnabled: false, internationalEnabled: false, contactlessEnabled: true, issuedAt: "2024-05-10T14:00:00Z", lastUsedAt: null },
];

// ─── Transactions ─────────────────────────────────────────────────────────────
const mkTxn = (overrides: Partial<GlobalTransaction>): GlobalTransaction => ({
  id: uuid(), accountId: "acct-001", cardId: "card-001",
  direction: "debit", channel: "card_pos",
  localAmount: 0, localCurrency: "ZAR", billedAmount: 0, billedCurrency: "ZAR",
  fxRate: null, fxFee: 0, description: "", merchantName: null,
  merchantCategory: null, merchantCountry: null, nostroAccountId: "na-za",
  status: "completed", authCode: "AUTH" + Math.floor(Math.random() * 900000 + 100000),
  createdAt: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
  settledAt: new Date(Date.now() - Math.random() * 6 * 86400000).toISOString(),
  interchangeEarned: 0, domesticRouting: true,
  ...overrides,
});

export const globalTransactions: GlobalTransaction[] = [
  mkTxn({ description: "Shoprite Claremont", merchantName: "Shoprite", merchantCategory: "Grocery", merchantCountry: "ZA", localAmount: 2847.50, billedAmount: 2847.50, interchangeEarned: 28.47 }),
  mkTxn({ description: "Shell Garage N2", merchantName: "Shell", merchantCategory: "Fuel", merchantCountry: "ZA", localAmount: 1245.00, billedAmount: 1245.00, interchangeEarned: 12.45 }),
  mkTxn({ cardId: "card-002", description: "Amazon DE Order", merchantName: "Amazon", merchantCategory: "E-commerce", merchantCountry: "EU", localAmount: 89.99, localCurrency: "EUR", billedAmount: 1794.22, billedCurrency: "ZAR", fxRate: 19.93, fxFee: 44.86, interchangeEarned: 9.90, domesticRouting: true }),
  mkTxn({ cardId: "card-003", description: "AWS Cloud Services", merchantName: "Amazon Web Services", merchantCategory: "Technology", merchantCountry: "US", localAmount: 842.00, localCurrency: "USD", billedAmount: 842.00, billedCurrency: "USD", interchangeEarned: 15.16, domesticRouting: true }),
  mkTxn({ channel: "p2p", direction: "credit", description: "P2P from VMS-GBL-2024-00247", localAmount: 5000, billedAmount: 5000, merchantName: "Nomsa Zulu", interchangeEarned: 0 }),
  mkTxn({ channel: "deposit", direction: "credit", description: "EFT Deposit - Salary", localAmount: 85000, billedAmount: 85000, merchantName: "Vink Group (Pty) Ltd", interchangeEarned: 0 }),
  mkTxn({ channel: "atm", description: "ATM Withdrawal Standard Bank CPT", merchantName: "Standard Bank ATM", merchantCountry: "ZA", localAmount: 2000, billedAmount: 2000, interchangeEarned: 2.00 }),
  mkTxn({ cardId: "card-002", description: "Revolut Top-up EUR", merchantName: "Revolut", merchantCategory: "Finance", merchantCountry: "EU", localAmount: 500, localCurrency: "EUR", billedAmount: 9965, billedCurrency: "ZAR", fxRate: 19.93, fxFee: 249.13, interchangeEarned: 7.00, domesticRouting: true }),
  mkTxn({ channel: "card_online", description: "Netflix Subscription", merchantName: "Netflix", merchantCategory: "Entertainment", merchantCountry: "US", localAmount: 15.49, localCurrency: "USD", billedAmount: 284.24, billedCurrency: "ZAR", fxRate: 18.35, fxFee: 14.21, interchangeEarned: 2.17, domesticRouting: false }),
  mkTxn({ description: "Pick n Pay Sea Point", merchantName: "Pick n Pay", merchantCategory: "Grocery", merchantCountry: "ZA", localAmount: 1893.40, billedAmount: 1893.40, interchangeEarned: 18.93 }),
  mkTxn({ cardId: "card-003", channel: "card_online", description: "WeWork Office Cape Town", merchantName: "WeWork", merchantCategory: "Office", merchantCountry: "US", localAmount: 1200, localCurrency: "USD", billedAmount: 1200, billedCurrency: "USD", interchangeEarned: 21.60, domesticRouting: true }),
  mkTxn({ channel: "fx_conversion", description: "FX: ZAR → USD", localAmount: 50000, billedAmount: 2724.25, billedCurrency: "USD", fxRate: 18.35, fxFee: 250, interchangeEarned: 250, direction: "credit" }),
];

// ─── FX Conversions ───────────────────────────────────────────────────────────
export const fxConversions: FxConversion[] = [
  { id: uuid(), accountId: "acct-001", fromCurrency: "ZAR", toCurrency: "USD", fromAmount: 50000, toAmount: 2724.25, rate: 18.35, feeAmount: 250, feeCurrency: "ZAR", status: "completed", createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: uuid(), accountId: "acct-001", fromCurrency: "USD", toCurrency: "EUR", fromAmount: 1000, toAmount: 911.80, rate: 0.9118, feeAmount: 5, feeCurrency: "USD", status: "completed", createdAt: new Date(Date.now() - 172800000).toISOString() },
  { id: uuid(), accountId: "acct-001", fromCurrency: "ZAR", toCurrency: "CNY", fromAmount: 100000, toAmount: 39100, rate: 0.3910, feeAmount: 500, feeCurrency: "ZAR", status: "completed", createdAt: new Date(Date.now() - 259200000).toISOString() },
];

// ─── Deposits ────────────────────────────────────────────────────────────────
export const depositRecords: DepositRecord[] = [
  { id: uuid(), accountId: "acct-001", channel: "eft", amount: 85000, currency: "ZAR", reference: "VMS-GBL-2024-00001", senderName: "Vink Group", senderAccount: "000987654321", nostroAccountId: "na-za", status: "credited", creditedAmount: 85000, creditedCurrency: "ZAR", fxRate: null, createdAt: new Date(Date.now() - 7200000).toISOString(), creditedAt: new Date(Date.now() - 7180000).toISOString() },
  { id: uuid(), accountId: "acct-001", channel: "sepa", amount: 2500, currency: "EUR", reference: "VMS-GBL-2024-00001", senderName: "EU Partner GmbH", senderAccount: "DE89370400440532013000", nostroAccountId: "na-eu", status: "credited", creditedAmount: 2500, creditedCurrency: "EUR", fxRate: null, createdAt: new Date(Date.now() - 86400000).toISOString(), creditedAt: new Date(Date.now() - 86300000).toISOString() },
  { id: uuid(), accountId: "acct-003", channel: "mobile_money", amount: 5000, currency: "ZMW", reference: "VMS-GBL-2024-00891", senderName: "MTN Mobile Money", senderAccount: "+260977881234", nostroAccountId: "na-zm", status: "credited", creditedAmount: 5000, creditedCurrency: "ZMW", fxRate: null, createdAt: new Date(Date.now() - 3600000).toISOString(), creditedAt: new Date(Date.now() - 3590000).toISOString() },
];

// ─── KYC Records ─────────────────────────────────────────────────────────────
export const kycRecords: KycRecord[] = [
  { id: uuid(), accountId: "acct-001", status: "approved", tier: "full", documentType: "passport", documentNumber: "A12345678", documentCountry: "ZA", documentExpiry: "2029-04-15", selfieVerified: true, addressVerified: true, pepScreened: true, sanctionsScreened: true, faceMatchScore: 97.4, submittedAt: "2024-01-15T08:00:00Z", reviewedAt: "2024-01-16T10:30:00Z", reviewedBy: "compliance@vink.com", expiresAt: "2027-01-15T08:00:00Z", rejectionReason: null },
  { id: uuid(), accountId: "acct-002", status: "approved", tier: "enhanced", documentType: "national_id", documentNumber: "8912245082082", documentCountry: "ZA", documentExpiry: "2031-01-01", selfieVerified: true, addressVerified: true, pepScreened: true, sanctionsScreened: true, faceMatchScore: 94.2, submittedAt: "2024-03-22T10:30:00Z", reviewedAt: "2024-03-23T09:00:00Z", reviewedBy: "compliance@vink.com", expiresAt: "2027-03-22T10:30:00Z", rejectionReason: null },
  { id: uuid(), accountId: "acct-003", status: "pending", tier: "basic", documentType: "national_id", documentNumber: "NRC/234567/89/1", documentCountry: "ZM", documentExpiry: "2028-06-30", selfieVerified: true, addressVerified: false, pepScreened: false, sanctionsScreened: false, faceMatchScore: 88.1, submittedAt: "2024-05-10T14:00:00Z", reviewedAt: null, reviewedBy: null, expiresAt: null, rejectionReason: null },
];

// ─── AML Checks ──────────────────────────────────────────────────────────────
export const amlChecks: AmlCheck[] = [
  { id: uuid(), accountId: "acct-001", checkType: "ofac", result: "clear", riskScore: 2, matchName: null, checkedAt: "2024-01-16T10:00:00Z", reviewedAt: null, sarFiled: false, notes: "No matches found" },
  { id: uuid(), accountId: "acct-001", checkType: "pep", result: "clear", riskScore: 5, matchName: null, checkedAt: "2024-01-16T10:00:00Z", reviewedAt: null, sarFiled: false, notes: "No PEP matches" },
  { id: uuid(), accountId: "acct-002", checkType: "sanctions", result: "clear", riskScore: 3, matchName: null, checkedAt: "2024-03-23T09:00:00Z", reviewedAt: null, sarFiled: false, notes: "OFAC, UN, EU sanctions — clear" },
];

// ─── P2P Transfers ────────────────────────────────────────────────────────────
export const p2pTransfers: P2PTransfer[] = [
  { id: uuid(), senderAccountId: "acct-002", recipientReferenceNumber: "VMS-GBL-2024-00001", recipientName: "Vincent Kafula", amount: 5000, currency: "ZAR", note: "Reimbursement", status: "completed", createdAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 86390000).toISOString() },
];

// ─── KPI snapshot ─────────────────────────────────────────────────────────────
export function getGlobalBankingKpi(): GlobalBankingKpi {
  const vol = globalTransactions.filter(t => t.status === "completed").reduce((s, t) => s + t.billedAmount * (t.billedCurrency === "ZAR" ? 1 : t.billedCurrency === "USD" ? 18.35 : t.billedCurrency === "EUR" ? 19.93 : t.billedCurrency === "CNY" ? 2.53 : 0.067), 0);
  return {
    timestamp: new Date().toISOString(),
    totalAccounts: unifiedAccounts.length,
    activeCards: globalCards.filter(c => c.status === "active").length,
    totalVolumeUsd24h: vol / 18.35,
    txnCount24h: globalTransactions.length,
    fxConversions24h: fxConversions.length,
    totalNostroBalance: { ZAR: nostroAccounts.find(n => n.currency === "ZAR")!.balance, ZMW: nostroAccounts.find(n => n.currency === "ZMW")!.balance, EUR: nostroAccounts.find(n => n.currency === "EUR")!.balance, USD: nostroAccounts.find(n => n.currency === "USD")!.balance, CNY: nostroAccounts.find(n => n.currency === "CNY")!.balance },
    interchangeEarnedToday: globalTransactions.reduce((s, t) => s + t.interchangeEarned, 0),
    fxRevenueToday: fxConversions.reduce((s, c) => s + c.feeAmount, 0),
    kycPendingCount: kycRecords.filter(k => k.status === "pending").length,
    amlAlerts: amlChecks.filter(a => a.result !== "clear").length,
    domesticRoutingPct: Math.round((globalTransactions.filter(t => t.domesticRouting).length / globalTransactions.length) * 100),
  };
}
