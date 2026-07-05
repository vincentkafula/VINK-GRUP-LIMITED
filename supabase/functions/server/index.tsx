import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/make-server-3f39932e/health", (c) => c.json({ status: "ok", service: "VMS Bank API v2.0" }));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const refNo = (prefix: string) =>
  `${prefix}-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`;

const now = () => new Date().toISOString();

type AppStatus = "pending" | "under_review" | "approved" | "declined" | "more_info_required";

interface Application {
  id: string;
  referenceNumber: string;
  type: string;
  subType: string;
  status: AppStatus;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  formData: Record<string, unknown>;
  submittedAt: string;
  updatedAt: string;
  reviewNotes?: string;
  assignedTo?: string;
}

// ─── SEED: Global Banking demo data ──────────────────────────────────────────

async function seedGlobalBankingData() {
  const seeded = await kv.get("gb:seeded");
  if (seeded) return;

  // Nostro accounts
  await kv.set("gb:nostro", [
    { id: "na-za", country: "ZA", currency: "ZAR", bank: "Standard Bank SA", swift: "SBZAZAJJ", balance: 45280000, reserve: 5000000, rails: ["EFT","PayShap","RTGS","Cash Agent"], centralBank: "SARB / NPCS", flag: "🇿🇦", status: "active", lastReconciled: now() },
    { id: "na-zm", country: "ZM", currency: "ZMW", bank: "Zanaco Zambia", swift: "ZNCOZMLU", balance: 12540000, reserve: 2000000, rails: ["EFT","Mobile Money (MTN/Airtel)","Cash"], centralBank: "Bank of Zambia", flag: "🇿🇲", status: "active", lastReconciled: now() },
    { id: "na-eu", country: "EU", currency: "EUR", bank: "Modulr Finance (Lithuania)", swift: "MODRLT22", balance: 8920000, reserve: 1500000, rails: ["SEPA","Target2","SEPA Instant"], centralBank: "ECB", flag: "🇪🇺", status: "active", lastReconciled: now() },
    { id: "na-us", country: "US", currency: "USD", bank: "Column Bank N.A. (BaaS)", swift: "CLBKUS66", balance: 22470000, reserve: 3000000, rails: ["ACH","FedNow","Wire Transfer","RTP"], centralBank: "Federal Reserve", flag: "🇺🇸", status: "active", lastReconciled: now() },
    { id: "na-cn", country: "CN", currency: "CNY", bank: "UnionPay International", swift: "BKCHCNBJ", balance: 18340000, reserve: 2500000, rails: ["WeChat Pay","Alipay","UnionPay Cloud"], centralBank: "PBOC", flag: "🇨🇳", status: "active", lastReconciled: now() },
  ]);

  // FX rates
  await kv.set("gb:fx:rates", [
    { from: "ZAR", to: "USD", interbank: 0.0545, customer: 0.0540, spread: 0.92 },
    { from: "ZAR", to: "EUR", interbank: 0.0502, customer: 0.0497, spread: 1.00 },
    { from: "ZAR", to: "CNY", interbank: 0.3950, customer: 0.3910, spread: 1.01 },
    { from: "ZAR", to: "ZMW", interbank: 1.4820, customer: 1.4673, spread: 0.99 },
    { from: "USD", to: "ZAR", interbank: 18.35,  customer: 18.17,  spread: 0.98 },
    { from: "USD", to: "EUR", interbank: 0.9210, customer: 0.9118, spread: 1.00 },
    { from: "USD", to: "CNY", interbank: 7.2480, customer: 7.1752, spread: 1.00 },
    { from: "USD", to: "ZMW", interbank: 27.20,  customer: 26.93,  spread: 0.99 },
    { from: "EUR", to: "USD", interbank: 1.0860, customer: 1.0751, spread: 1.00 },
    { from: "EUR", to: "ZAR", interbank: 19.93,  customer: 19.73,  spread: 1.00 },
    { from: "CNY", to: "ZAR", interbank: 2.5320, customer: 2.5066, spread: 1.00 },
    { from: "CNY", to: "USD", interbank: 0.1380, customer: 0.1366, spread: 1.01 },
  ]);

  // Unified accounts
  const acct1: Record<string, unknown> = {
    id: "acct-001", referenceNumber: "VMS-GBL-2024-00001",
    customerName: "Vincent Kafula", email: "vincent@vink.com", phone: "+27 21 007 0772",
    baseCurrency: "ZAR", kycStatus: "approved", amlFlag: "clear", tier: "corporate",
    balances: { ZAR: 847250, USD: 45820, EUR: 38450, ZMW: 124800, CNY: 298450 },
    cardIds: ["card-001","card-002","card-003","card-004"],
    createdAt: "2024-01-15T08:00:00Z", lastActivityAt: now(),
    popiaConcent: true, gdprConsent: true, fatfChecked: true,
  };
  const acct2: Record<string, unknown> = {
    id: "acct-002", referenceNumber: "VMS-GBL-2024-00247",
    customerName: "Nomsa Zulu", email: "nomsa@vink.com", phone: "+27 82 334 7821",
    baseCurrency: "ZAR", kycStatus: "approved", amlFlag: "clear", tier: "premium",
    balances: { ZAR: 124890, USD: 8240, EUR: 0, ZMW: 0, CNY: 45200 },
    cardIds: ["card-005","card-006"],
    createdAt: "2024-03-22T10:30:00Z", lastActivityAt: now(),
    popiaConcent: true, gdprConsent: false, fatfChecked: true,
  };
  await kv.set("gb:acct:acct-001", acct1);
  await kv.set("gb:acct:VMS-GBL-2024-00001", acct1); // by ref
  await kv.set("gb:acct:acct-002", acct2);
  await kv.set("gb:acct:VMS-GBL-2024-00247", acct2);
  await kv.set("gb:accounts:index", ["acct-001","acct-002"]);

  // Cards
  await kv.set("gb:cards", [
    { id: "card-001", accountId: "acct-001", type: "debit", network: "visa", pan: "4539 •••• •••• 4291", last4: "4291", expiry: "12/27", nameOnCard: "VINCENT KAFULA", status: "active", binCountry: "ZA", currency: "ZAR", dailyLimit: 50000, monthlyLimit: 500000, spentToday: 4820, spentThisMonth: 87340, atmEnabled: true, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: true },
    { id: "card-002", accountId: "acct-001", type: "virtual", network: "mastercard", pan: "5411 •••• •••• 7782", last4: "7782", expiry: "06/26", nameOnCard: "VINCENT KAFULA", status: "active", binCountry: "EU", currency: "EUR", dailyLimit: 10000, monthlyLimit: 50000, spentToday: 0, spentThisMonth: 2840, atmEnabled: false, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: false },
    { id: "card-003", accountId: "acct-001", type: "business", network: "visa", pan: "4111 •••• •••• 1003", last4: "1003", expiry: "09/28", nameOnCard: "VINK MULTI SERVICES", status: "active", binCountry: "US", currency: "USD", dailyLimit: 100000, monthlyLimit: 1000000, spentToday: 15240, spentThisMonth: 248900, atmEnabled: true, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: true },
    { id: "card-004", accountId: "acct-001", type: "sub-account", network: "mastercard", pan: "5105 •••• •••• 5100", last4: "5100", expiry: "03/27", nameOnCard: "SIPHO DLAMINI", status: "active", binCountry: "ZA", currency: "ZAR", dailyLimit: 5000, monthlyLimit: 25000, spentToday: 840, spentThisMonth: 8420, atmEnabled: true, onlineEnabled: true, internationalEnabled: false, contactlessEnabled: true, parentCardId: "card-001" },
    { id: "card-005", accountId: "acct-002", type: "debit", network: "mastercard", pan: "5412 •••• •••• 8834", last4: "8834", expiry: "11/26", nameOnCard: "NOMSA ZULU", status: "active", binCountry: "ZA", currency: "ZAR", dailyLimit: 20000, monthlyLimit: 100000, spentToday: 1240, spentThisMonth: 18420, atmEnabled: true, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: true },
    { id: "card-006", accountId: "acct-002", type: "virtual", network: "visa", pan: "4024 •••• •••• 2291", last4: "2291", expiry: "06/27", nameOnCard: "NOMSA ZULU", status: "frozen", binCountry: "CN", currency: "CNY", dailyLimit: 5000, monthlyLimit: 20000, spentToday: 0, spentThisMonth: 3420, atmEnabled: false, onlineEnabled: true, internationalEnabled: true, contactlessEnabled: false },
  ]);

  // Transactions
  await kv.set("gb:transactions", [
    { id: "t1", accountId: "acct-001", direction: "debit", channel: "card_pos", localAmount: 2847.50, localCurrency: "ZAR", billedAmount: 2847.50, billedCurrency: "ZAR", description: "Shoprite Claremont", merchantName: "Shoprite", merchantCategory: "Grocery", merchantCountry: "ZA", status: "completed", domesticRouting: true, interchangeEarned: 28.47, fxFee: 0, createdAt: new Date(Date.now()-3600000).toISOString() },
    { id: "t2", accountId: "acct-001", direction: "debit", channel: "card_online", localAmount: 89.99, localCurrency: "EUR", billedAmount: 1794.22, billedCurrency: "ZAR", description: "Amazon DE Order", merchantName: "Amazon DE", merchantCategory: "E-commerce", merchantCountry: "EU", fxRate: 19.93, fxFee: 44.86, status: "completed", domesticRouting: true, interchangeEarned: 9.90, createdAt: new Date(Date.now()-7200000).toISOString() },
    { id: "t3", accountId: "acct-001", direction: "debit", channel: "card_pos", localAmount: 842, localCurrency: "USD", billedAmount: 842, billedCurrency: "USD", description: "AWS Cloud Services", merchantName: "AWS", merchantCategory: "Technology", merchantCountry: "US", status: "completed", domesticRouting: true, interchangeEarned: 15.16, fxFee: 0, createdAt: new Date(Date.now()-14400000).toISOString() },
    { id: "t4", accountId: "acct-001", direction: "credit", channel: "p2p", localAmount: 5000, localCurrency: "ZAR", billedAmount: 5000, billedCurrency: "ZAR", description: "P2P from Nomsa Zulu", merchantName: "Nomsa Zulu", status: "completed", domesticRouting: true, interchangeEarned: 0, fxFee: 0, createdAt: new Date(Date.now()-28800000).toISOString() },
    { id: "t5", accountId: "acct-001", direction: "credit", channel: "deposit", localAmount: 85000, localCurrency: "ZAR", billedAmount: 85000, billedCurrency: "ZAR", description: "EFT Deposit — Salary", merchantName: "VMS Payroll", status: "completed", domesticRouting: true, interchangeEarned: 0, fxFee: 0, createdAt: new Date(Date.now()-86400000).toISOString() },
    { id: "t6", accountId: "acct-001", direction: "debit", channel: "atm", localAmount: 2000, localCurrency: "ZAR", billedAmount: 2000, billedCurrency: "ZAR", description: "ATM Standard Bank CPT", merchantName: "Standard Bank ATM", merchantCountry: "ZA", status: "completed", domesticRouting: true, interchangeEarned: 2, fxFee: 0, createdAt: new Date(Date.now()-172800000).toISOString() },
  ]);

  // P2P transfers
  await kv.set("gb:p2p", [
    { id: "p2p-001", senderAccountId: "acct-002", recipientReferenceNumber: "VMS-GBL-2024-00001", recipientName: "Vincent Kafula", amount: 5000, currency: "ZAR", note: "Reimbursement", status: "completed", createdAt: new Date(Date.now()-86400000).toISOString(), completedAt: new Date(Date.now()-86390000).toISOString() },
  ]);

  // FX conversions history
  await kv.set("gb:fx:history", [
    { id: "fx-001", accountId: "acct-001", fromCurrency: "ZAR", toCurrency: "USD", fromAmount: 50000, toAmount: 2724.25, rate: 18.35, feeAmount: 250, feeCurrency: "ZAR", status: "completed", createdAt: new Date(Date.now()-86400000).toISOString() },
    { id: "fx-002", accountId: "acct-001", fromCurrency: "USD", toCurrency: "EUR", fromAmount: 1000, toAmount: 911.80, rate: 0.9118, feeAmount: 5, feeCurrency: "USD", status: "completed", createdAt: new Date(Date.now()-172800000).toISOString() },
  ]);

  await kv.set("gb:seeded", true);
}

// Run seed on startup
await seedGlobalBankingData();

// ─── APPLICATIONS ─────────────────────────────────────────────────────────────

app.post("/make-server-3f39932e/applications", async (c) => {
  try {
    const body = await c.req.json();
    const { type, subType, applicantName, applicantEmail, applicantPhone, formData = {} } = body;
    if (!type || !applicantName) {
      return c.json({ success: false, error: "type and applicantName are required" }, 400);
    }
    const prefixMap: Record<string, string> = {
      account: "VMS-ACC", creditCard: "VMS-CC", loan: "VMS-LN",
      invest: "VMS-INV", insure: "VMS-INS", rewards: "VMS-RWD",
      sim: "VMS-SIM", businessLoan: "VMS-BL", corporateLoan: "VMS-CL",
    };
    const ref = refNo(prefixMap[type] ?? "VMS-APP");
    const application: Application = {
      id: crypto.randomUUID(), referenceNumber: ref, type, subType: subType ?? "",
      status: "pending", applicantName, applicantEmail: applicantEmail ?? "",
      applicantPhone: applicantPhone ?? "", formData, submittedAt: now(), updatedAt: now(),
    };
    await kv.set(`app:${ref}`, application);
    const listKey = `apps:index:${type}`;
    const existing: string[] = (await kv.get(listKey)) ?? [];
    if (!existing.includes(ref)) await kv.set(listKey, [ref, ...existing].slice(0, 500));
    const globalKey = "apps:index:all";
    const globalList: string[] = (await kv.get(globalKey)) ?? [];
    if (!globalList.includes(ref)) await kv.set(globalKey, [ref, ...globalList].slice(0, 2000));
    return c.json({ success: true, data: { referenceNumber: ref, id: application.id, status: "pending" } }, 201);
  } catch (err) {
    return c.json({ success: false, error: "Failed to submit application" }, 500);
  }
});

app.get("/make-server-3f39932e/applications", async (c) => {
  try {
    const type = c.req.query("type") ?? "all";
    const status = c.req.query("status");
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(50, Number(c.req.query("limit") ?? 20));
    const listKey = type === "all" ? "apps:index:all" : `apps:index:${type}`;
    const refs: string[] = (await kv.get(listKey)) ?? [];
    const start = (page - 1) * limit;
    const pageRefs = refs.slice(start, start + limit);
    const apps = await Promise.all(pageRefs.map(ref => kv.get(`app:${ref}`)));
    let filtered = apps.filter(Boolean) as Application[];
    if (status) filtered = filtered.filter(a => a.status === status);
    return c.json({ success: true, data: filtered, meta: { total: refs.length, page, limit, pages: Math.ceil(refs.length / limit) } });
  } catch (err) {
    return c.json({ success: false, error: "Failed to list applications" }, 500);
  }
});

app.get("/make-server-3f39932e/applications/:ref", async (c) => {
  try {
    const app_ = await kv.get(`app:${c.req.param("ref")}`);
    if (!app_) return c.json({ success: false, error: "Application not found" }, 404);
    return c.json({ success: true, data: app_ });
  } catch {
    return c.json({ success: false, error: "Failed to fetch application" }, 500);
  }
});

app.patch("/make-server-3f39932e/applications/:ref/status", async (c) => {
  try {
    const ref = c.req.param("ref");
    const { status, reviewNotes, assignedTo } = await c.req.json();
    const app_ = await kv.get(`app:${ref}`) as Application | null;
    if (!app_) return c.json({ success: false, error: "Application not found" }, 404);
    const validStatuses: AppStatus[] = ["pending","under_review","approved","declined","more_info_required"];
    if (!validStatuses.includes(status)) return c.json({ success: false, error: "Invalid status" }, 400);
    const updated: Application = { ...app_, status, reviewNotes: reviewNotes ?? app_.reviewNotes, assignedTo: assignedTo ?? app_.assignedTo, updatedAt: now() };
    await kv.set(`app:${ref}`, updated);
    return c.json({ success: true, data: updated });
  } catch {
    return c.json({ success: false, error: "Failed to update status" }, 500);
  }
});

app.delete("/make-server-3f39932e/applications/:ref", async (c) => {
  try {
    await kv.del(`app:${c.req.param("ref")}`);
    return c.json({ success: true, message: "Application deleted" });
  } catch {
    return c.json({ success: false, error: "Failed to delete" }, 500);
  }
});

// ─── OTP ──────────────────────────────────────────────────────────────────────

app.post("/make-server-3f39932e/otp/send", async (c) => {
  try {
    const { destination, channel } = await c.req.json();
    if (!destination) return c.json({ success: false, error: "destination required" }, 400);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await kv.set(`otp:${destination}`, { code, expiresAt: Date.now() + 5 * 60 * 1000, channel, attempts: 0 });
    return c.json({ success: true, message: `OTP sent to ${destination}`, demoCode: code });
  } catch {
    return c.json({ success: false, error: "Failed to send OTP" }, 500);
  }
});

app.post("/make-server-3f39932e/otp/verify", async (c) => {
  try {
    const { destination, code } = await c.req.json();
    const record = await kv.get(`otp:${destination}`);
    if (!record) return c.json({ success: false, error: "OTP expired or not found" }, 400);
    if (Date.now() > record.expiresAt) { await kv.del(`otp:${destination}`); return c.json({ success: false, error: "OTP has expired" }, 400); }
    if (record.attempts >= 3) return c.json({ success: false, error: "Too many attempts" }, 429);
    if (record.code !== String(code)) {
      await kv.set(`otp:${destination}`, { ...record, attempts: record.attempts + 1 });
      return c.json({ success: false, error: "Invalid OTP" }, 400);
    }
    await kv.del(`otp:${destination}`);
    return c.json({ success: true, message: "OTP verified" });
  } catch {
    return c.json({ success: false, error: "OTP verification failed" }, 500);
  }
});

// ─── CONTACT & NEWSLETTER ─────────────────────────────────────────────────────

app.post("/make-server-3f39932e/contact", async (c) => {
  try {
    const { name, email, phone, subject, message, type } = await c.req.json();
    if (!name || !email || !message) return c.json({ success: false, error: "name, email, and message are required" }, 400);
    const id = `contact:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
    await kv.set(id, { id, name, email, phone, subject, message, type, createdAt: now(), read: false });
    const idx: string[] = (await kv.get("contacts:index")) ?? [];
    await kv.set("contacts:index", [id, ...idx].slice(0, 500));
    return c.json({ success: true, message: "Message received. We will respond within 2 business hours." }, 201);
  } catch {
    return c.json({ success: false, error: "Failed to submit message" }, 500);
  }
});

app.post("/make-server-3f39932e/newsletter", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email || !email.includes("@")) return c.json({ success: false, error: "Valid email required" }, 400);
    const existing = await kv.get(`newsletter:${email}`);
    if (existing) return c.json({ success: true, message: "Already subscribed" });
    await kv.set(`newsletter:${email}`, { email, subscribedAt: now() });
    const idx: string[] = (await kv.get("newsletter:index")) ?? [];
    if (!idx.includes(email)) await kv.set("newsletter:index", [email, ...idx].slice(0, 5000));
    return c.json({ success: true, message: "Subscribed successfully! Welcome to VMS updates." }, 201);
  } catch {
    return c.json({ success: false, error: "Subscription failed" }, 500);
  }
});

// ─── ADMIN STATS ──────────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/admin/stats", async (c) => {
  try {
    const globalList: string[] = (await kv.get("apps:index:all")) ?? [];
    const types = ["account","creditCard","loan","invest","insure","rewards","sim","businessLoan","corporateLoan"];
    const typeCounts: Record<string, number> = {};
    await Promise.all(types.map(async (t) => {
      const idx: string[] = (await kv.get(`apps:index:${t}`)) ?? [];
      typeCounts[t] = idx.length;
    }));
    const recentRefs = globalList.slice(0, 100);
    const recent = await Promise.all(recentRefs.map(r => kv.get(`app:${r}`)));
    const validApps = recent.filter(Boolean) as Application[];
    const statusCounts = validApps.reduce((acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    const contactIdx: string[] = (await kv.get("contacts:index")) ?? [];
    const newsletterIdx: string[] = (await kv.get("newsletter:index")) ?? [];
    return c.json({ success: true, data: { totalApplications: globalList.length, byType: typeCounts, byStatus: statusCounts, pendingReview: statusCounts["pending"] ?? 0, totalContacts: contactIdx.length, newsletterSubscribers: newsletterIdx.length, lastUpdated: now() } });
  } catch {
    return c.json({ success: false, error: "Failed to fetch stats" }, 500);
  }
});

// ─── CREDIT CHECK ─────────────────────────────────────────────────────────────

app.post("/make-server-3f39932e/credit-check", async (c) => {
  try {
    const { idNumber } = await c.req.json();
    if (!idNumber) return c.json({ success: false, error: "ID number required" }, 400);
    const hash = idNumber.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    const score = 500 + (hash % 350);
    const rating = score >= 750 ? "Excellent" : score >= 650 ? "Good" : score >= 550 ? "Fair" : "Poor";
    const eligible = [
      { product: "Vink Standard Card (R0/month)", approved: score >= 500, reason: score >= 500 ? "Score meets minimum threshold" : "Score below minimum of 500" },
      { product: "Vink Gold Card (R85/month)", approved: score >= 620, reason: score >= 620 ? "Score qualifies for Gold tier" : "Score below Gold threshold (620)" },
      { product: "Vink Platinum Card (R265/month)", approved: score >= 720, reason: score >= 720 ? "Score qualifies for Platinum" : "Score below Platinum threshold (720)" },
      { product: "Personal Loan up to R250,000", approved: score >= 580, reason: score >= 580 ? "Eligible for personal loan" : "Minimum score of 580 required" },
      { product: "Home Loan (100% LTV)", approved: score >= 650, reason: score >= 650 ? "Eligible for home loan" : "Minimum score of 650 required" },
    ];
    const tips = ["Pay all accounts on time — payment history is 35% of your score.", "Keep credit card balances below 30% of available credit.", "Avoid applying for multiple credit accounts at once.", "Check your credit report annually for errors."].slice(0, score < 700 ? 4 : 2);
    return c.json({ success: true, data: { score, rating, eligible, tips } });
  } catch {
    return c.json({ success: false, error: "Credit check failed" }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── GLOBAL BANKING SYSTEM ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /global/kpi — platform KPI snapshot
app.get("/make-server-3f39932e/global/kpi", async (c) => {
  try {
    const acctIds: string[] = (await kv.get("gb:accounts:index")) ?? [];
    const cards: Record<string,unknown>[] = (await kv.get("gb:cards")) ?? [];
    const txns: Record<string,unknown>[] = (await kv.get("gb:transactions")) ?? [];
    const fxH: Record<string,unknown>[] = (await kv.get("gb:fx:history")) ?? [];
    return c.json({ success: true, data: {
      timestamp: now(),
      totalAccounts: acctIds.length,
      activeCards: cards.filter((c: Record<string,unknown>) => c.status === "active").length,
      txnCount24h: txns.length,
      fxConversions24h: fxH.length,
      interchangeEarnedToday: txns.reduce((s, t: Record<string,unknown>) => s + (Number(t.interchangeEarned) || 0), 0),
      domesticRoutingPct: txns.length > 0 ? Math.round((txns.filter((t: Record<string,unknown>) => t.domesticRouting).length / txns.length) * 100) : 0,
      kycPending: 1,
      amlAlerts: 0,
    }});
  } catch {
    return c.json({ success: false, error: "Failed to fetch KPI" }, 500);
  }
});

// GET /global/nostro — list nostro accounts
app.get("/make-server-3f39932e/global/nostro", async (c) => {
  try {
    const nostro = await kv.get("gb:nostro") ?? [];
    return c.json({ success: true, data: nostro, meta: { total: nostro.length } });
  } catch {
    return c.json({ success: false, error: "Failed to fetch nostro accounts" }, 500);
  }
});

// GET /global/fx/rates — live FX rates
app.get("/make-server-3f39932e/global/fx/rates", async (c) => {
  try {
    const rates = await kv.get("gb:fx:rates") ?? [];
    return c.json({ success: true, data: rates, updatedAt: now() });
  } catch {
    return c.json({ success: false, error: "Failed to fetch rates" }, 500);
  }
});

// POST /global/fx/quote — get conversion quote
app.post("/make-server-3f39932e/global/fx/quote", async (c) => {
  try {
    const { fromCurrency, toCurrency, amount } = await c.req.json();
    const rates: Record<string,unknown>[] = (await kv.get("gb:fx:rates")) ?? [];
    const rate = rates.find((r: Record<string,unknown>) => r.from === fromCurrency && r.to === toCurrency) as Record<string,number> | undefined;
    if (!rate) return c.json({ success: false, error: `No rate for ${fromCurrency} → ${toCurrency}` }, 400);
    const toAmount = +(amount * rate.customer).toFixed(2);
    const fee = +(amount * (rate.spread / 100)).toFixed(2);
    return c.json({ success: true, data: { fromCurrency, toCurrency, fromAmount: amount, toAmount, rate: rate.customer, interbankRate: rate.interbank, fee, spread: rate.spread, validSeconds: 30 } });
  } catch {
    return c.json({ success: false, error: "Failed to get quote" }, 500);
  }
});

// POST /global/fx/convert — execute FX conversion
app.post("/make-server-3f39932e/global/fx/convert", async (c) => {
  try {
    const { accountId, fromCurrency, toCurrency, fromAmount } = await c.req.json();
    const acct = await kv.get(`gb:acct:${accountId}`) as Record<string,unknown> | null;
    if (!acct) return c.json({ success: false, error: "Account not found" }, 404);
    const rates: Record<string,unknown>[] = (await kv.get("gb:fx:rates")) ?? [];
    const rate = rates.find((r: Record<string,unknown>) => r.from === fromCurrency && r.to === toCurrency) as Record<string,number> | undefined;
    if (!rate) return c.json({ success: false, error: "Rate not available" }, 400);
    const balances = acct.balances as Record<string,number>;
    if ((balances[fromCurrency] ?? 0) < fromAmount) return c.json({ success: false, error: "Insufficient balance" }, 400);
    const toAmount = +(fromAmount * rate.customer).toFixed(2);
    const feeAmount = +(fromAmount * (rate.spread / 100)).toFixed(2);
    balances[fromCurrency] -= fromAmount;
    balances[toCurrency] = (balances[toCurrency] ?? 0) + toAmount;
    acct.balances = balances;
    acct.lastActivityAt = now();
    await kv.set(`gb:acct:${accountId}`, acct);
    const conv = { id: crypto.randomUUID(), accountId, fromCurrency, toCurrency, fromAmount, toAmount, rate: rate.customer, feeAmount, feeCurrency: fromCurrency, status: "completed", createdAt: now() };
    const fxH: Record<string,unknown>[] = (await kv.get("gb:fx:history")) ?? [];
    await kv.set("gb:fx:history", [conv, ...fxH].slice(0, 200));
    return c.json({ success: true, data: conv });
  } catch {
    return c.json({ success: false, error: "FX conversion failed" }, 500);
  }
});

// GET /global/fx/history — conversion history
app.get("/make-server-3f39932e/global/fx/history", async (c) => {
  try {
    const data = await kv.get("gb:fx:history") ?? [];
    return c.json({ success: true, data });
  } catch {
    return c.json({ success: false, error: "Failed to fetch history" }, 500);
  }
});

// GET /global/accounts — list accounts
app.get("/make-server-3f39932e/global/accounts", async (c) => {
  try {
    const ids: string[] = (await kv.get("gb:accounts:index")) ?? [];
    const accts = await Promise.all(ids.map(id => kv.get(`gb:acct:${id}`)));
    return c.json({ success: true, data: accts.filter(Boolean), meta: { total: ids.length } });
  } catch {
    return c.json({ success: false, error: "Failed to list accounts" }, 500);
  }
});

// GET /global/accounts/:id — single account
app.get("/make-server-3f39932e/global/accounts/:id", async (c) => {
  try {
    const acct = await kv.get(`gb:acct:${c.req.param("id")}`);
    if (!acct) return c.json({ success: false, error: "Account not found" }, 404);
    return c.json({ success: true, data: acct });
  } catch {
    return c.json({ success: false, error: "Failed to fetch account" }, 500);
  }
});

// POST /global/accounts/lookup — lookup by reference number
app.post("/make-server-3f39932e/global/accounts/lookup", async (c) => {
  try {
    const { referenceNumber } = await c.req.json();
    const acct = await kv.get(`gb:acct:${referenceNumber}`) as Record<string,unknown> | null;
    if (!acct) return c.json({ success: false, error: "No account found for that reference number" }, 404);
    return c.json({ success: true, data: { id: acct.id, name: acct.customerName, referenceNumber: acct.referenceNumber, baseCurrency: acct.baseCurrency } });
  } catch {
    return c.json({ success: false, error: "Lookup failed" }, 500);
  }
});

// GET /global/cards — list cards
app.get("/make-server-3f39932e/global/cards", async (c) => {
  try {
    let cards: Record<string,unknown>[] = (await kv.get("gb:cards")) ?? [];
    const accountId = c.req.query("accountId");
    if (accountId) cards = cards.filter(card => card.accountId === accountId);
    return c.json({ success: true, data: cards, meta: { total: cards.length } });
  } catch {
    return c.json({ success: false, error: "Failed to list cards" }, 500);
  }
});

// PATCH /global/cards/:id/freeze — freeze / unfreeze
app.patch("/make-server-3f39932e/global/cards/:id/freeze", async (c) => {
  try {
    const cards: Record<string,unknown>[] = (await kv.get("gb:cards")) ?? [];
    const card = cards.find(card => card.id === c.req.param("id"));
    if (!card) return c.json({ success: false, error: "Card not found" }, 404);
    card.status = card.status === "frozen" ? "active" : "frozen";
    await kv.set("gb:cards", cards);
    return c.json({ success: true, data: card, message: `Card ${card.status === "frozen" ? "frozen" : "unfrozen"} successfully` });
  } catch {
    return c.json({ success: false, error: "Failed to update card" }, 500);
  }
});

// PATCH /global/cards/:id/limits — update card limits
app.patch("/make-server-3f39932e/global/cards/:id/limits", async (c) => {
  try {
    const cards: Record<string,unknown>[] = (await kv.get("gb:cards")) ?? [];
    const card = cards.find(card => card.id === c.req.param("id")) as Record<string,unknown> | undefined;
    if (!card) return c.json({ success: false, error: "Card not found" }, 404);
    const { dailyLimit, monthlyLimit, atmEnabled, onlineEnabled, internationalEnabled } = await c.req.json();
    if (dailyLimit !== undefined) card.dailyLimit = dailyLimit;
    if (monthlyLimit !== undefined) card.monthlyLimit = monthlyLimit;
    if (atmEnabled !== undefined) card.atmEnabled = atmEnabled;
    if (onlineEnabled !== undefined) card.onlineEnabled = onlineEnabled;
    if (internationalEnabled !== undefined) card.internationalEnabled = internationalEnabled;
    await kv.set("gb:cards", cards);
    return c.json({ success: true, data: card });
  } catch {
    return c.json({ success: false, error: "Failed to update limits" }, 500);
  }
});

// GET /global/transactions — list transactions
app.get("/make-server-3f39932e/global/transactions", async (c) => {
  try {
    let txns: Record<string,unknown>[] = (await kv.get("gb:transactions")) ?? [];
    const accountId = c.req.query("accountId");
    if (accountId) txns = txns.filter(t => t.accountId === accountId);
    txns.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
    return c.json({ success: true, data: txns, meta: { total: txns.length } });
  } catch {
    return c.json({ success: false, error: "Failed to list transactions" }, 500);
  }
});

// POST /global/p2p — P2P transfer
app.post("/make-server-3f39932e/global/p2p", async (c) => {
  try {
    const { senderAccountId, recipientReferenceNumber, amount, currency, note } = await c.req.json();
    const sender = await kv.get(`gb:acct:${senderAccountId}`) as Record<string,unknown> | null;
    const recipient = await kv.get(`gb:acct:${recipientReferenceNumber}`) as Record<string,unknown> | null;
    if (!sender) return c.json({ success: false, error: "Sender account not found" }, 404);
    if (!recipient) return c.json({ success: false, error: "Recipient not found" }, 404);
    const sBal = sender.balances as Record<string,number>;
    if ((sBal[currency] ?? 0) < amount) return c.json({ success: false, error: "Insufficient balance" }, 400);
    sBal[currency] -= amount;
    sender.balances = sBal;
    sender.lastActivityAt = now();
    await kv.set(`gb:acct:${senderAccountId}`, sender);
    const rBal = recipient.balances as Record<string,number>;
    rBal[currency] = (rBal[currency] ?? 0) + amount;
    recipient.balances = rBal;
    recipient.lastActivityAt = now();
    await kv.set(`gb:acct:${recipientReferenceNumber}`, recipient);
    const transfer = { id: crypto.randomUUID(), senderAccountId, recipientReferenceNumber, recipientName: recipient.customerName, amount, currency, note: note ?? "", status: "completed", createdAt: now(), completedAt: now() };
    const p2pList: Record<string,unknown>[] = (await kv.get("gb:p2p")) ?? [];
    await kv.set("gb:p2p", [transfer, ...p2pList].slice(0, 500));
    // Add to transaction ledger
    const txns: Record<string,unknown>[] = (await kv.get("gb:transactions")) ?? [];
    txns.unshift({ id: crypto.randomUUID(), accountId: senderAccountId, direction: "debit", channel: "p2p", localAmount: amount, localCurrency: currency, billedAmount: amount, billedCurrency: currency, description: `P2P to ${recipient.customerName}`, merchantName: recipient.customerName, status: "completed", domesticRouting: true, interchangeEarned: 0, fxFee: 0, createdAt: now() });
    await kv.set("gb:transactions", txns.slice(0, 500));
    return c.json({ success: true, data: transfer }, 201);
  } catch (err) {
    console.error("P2P error:", err);
    return c.json({ success: false, error: "Transfer failed" }, 500);
  }
});

// GET /global/p2p — list transfers
app.get("/make-server-3f39932e/global/p2p", async (c) => {
  try {
    const data = await kv.get("gb:p2p") ?? [];
    return c.json({ success: true, data });
  } catch {
    return c.json({ success: false, error: "Failed to list transfers" }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── ADMIN DASHBOARD ROUTES ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /admin/dashboard — full stats for admin home
app.get("/make-server-3f39932e/admin/dashboard", async (c) => {
  try {
    const globalList: string[] = (await kv.get("apps:index:all")) ?? [];
    const types = ["account","creditCard","loan","invest","insure","rewards","sim","businessLoan","corporateLoan"];
    const typeCounts: Record<string, number> = {};
    await Promise.all(types.map(async (t) => {
      const idx: string[] = (await kv.get(`apps:index:${t}`)) ?? [];
      typeCounts[t] = idx.length;
    }));

    // Fetch recent 200 for status breakdown
    const recentRefs = globalList.slice(0, 200);
    const recentRaw = await Promise.all(recentRefs.map(r => kv.get(`app:${r}`)));
    const apps = recentRaw.filter(Boolean) as Application[];
    const statusCounts: Record<string, number> = {};
    apps.forEach(a => { statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1; });

    const contactIdx: string[] = (await kv.get("contacts:index")) ?? [];
    const newsletterIdx: string[] = (await kv.get("newsletter:index")) ?? [];

    // Pending queue (most urgent)
    const pending = apps.filter(a => a.status === "pending").slice(0, 10);
    const underReview = apps.filter(a => a.status === "under_review").slice(0, 10);

    return c.json({
      success: true,
      data: {
        totalApplications: globalList.length,
        byType: typeCounts,
        byStatus: statusCounts,
        pendingCount: statusCounts["pending"] ?? 0,
        underReviewCount: statusCounts["under_review"] ?? 0,
        approvedCount: statusCounts["approved"] ?? 0,
        declinedCount: statusCounts["declined"] ?? 0,
        moreInfoCount: statusCounts["more_info_required"] ?? 0,
        totalContacts: contactIdx.length,
        newsletterSubscribers: newsletterIdx.length,
        pendingQueue: pending,
        underReviewQueue: underReview,
        lastUpdated: now(),
      }
    });
  } catch (err) {
    console.error(err);
    return c.json({ success: false, error: "Failed to fetch dashboard" }, 500);
  }
});

// GET /admin/applications — paginated list with filters
app.get("/make-server-3f39932e/admin/applications", async (c) => {
  try {
    const type   = c.req.query("type") ?? "all";
    const status = c.req.query("status");
    const search = (c.req.query("search") ?? "").toLowerCase();
    const page   = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit  = Math.min(50, Number(c.req.query("limit") ?? 20));

    const listKey = type === "all" ? "apps:index:all" : `apps:index:${type}`;
    const refs: string[] = (await kv.get(listKey)) ?? [];

    // Fetch all (up to 500 for admin)
    const allRaw = await Promise.all(refs.slice(0, 500).map(r => kv.get(`app:${r}`)));
    let apps = allRaw.filter(Boolean) as Application[];

    if (status) apps = apps.filter(a => a.status === status);
    if (search) apps = apps.filter(a =>
      a.applicantName.toLowerCase().includes(search) ||
      a.referenceNumber.toLowerCase().includes(search) ||
      a.applicantEmail.toLowerCase().includes(search) ||
      a.type.toLowerCase().includes(search)
    );

    apps.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    const total = apps.length;
    const start = (page - 1) * limit;
    const paged = apps.slice(start, start + limit);

    return c.json({ success: true, data: paged, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) {
    return c.json({ success: false, error: "Failed to list applications" }, 500);
  }
});

// GET /admin/applications/:ref — full detail
app.get("/make-server-3f39932e/admin/applications/:ref", async (c) => {
  try {
    const app_ = await kv.get(`app:${c.req.param("ref")}`);
    if (!app_) return c.json({ success: false, error: "Application not found" }, 404);
    return c.json({ success: true, data: app_ });
  } catch {
    return c.json({ success: false, error: "Failed to fetch application" }, 500);
  }
});

// POST /admin/applications/:ref/approve — approve with optional message
app.post("/make-server-3f39932e/admin/applications/:ref/approve", async (c) => {
  try {
    const ref = c.req.param("ref");
    const { reviewNotes, assignedTo } = await c.req.json().catch(() => ({}));
    const app_ = await kv.get(`app:${ref}`) as Application | null;
    if (!app_) return c.json({ success: false, error: "Application not found" }, 404);
    const updated: Application = {
      ...app_, status: "approved",
      reviewNotes: reviewNotes ?? "Application approved.",
      assignedTo: assignedTo ?? "Admin",
      updatedAt: now(),
    };
    await kv.set(`app:${ref}`, updated);

    // Store approval event
    const events: unknown[] = (await kv.get(`app:${ref}:events`)) ?? [];
    events.push({ action: "approved", by: assignedTo ?? "Admin", note: reviewNotes ?? "", at: now() });
    await kv.set(`app:${ref}:events`, events);

    return c.json({ success: true, data: updated, message: `Application ${ref} approved.` });
  } catch {
    return c.json({ success: false, error: "Failed to approve application" }, 500);
  }
});

// POST /admin/applications/:ref/decline — decline with required reason
app.post("/make-server-3f39932e/admin/applications/:ref/decline", async (c) => {
  try {
    const ref = c.req.param("ref");
    const { reason, assignedTo } = await c.req.json().catch(() => ({}));
    if (!reason) return c.json({ success: false, error: "Decline reason is required" }, 400);
    const app_ = await kv.get(`app:${ref}`) as Application | null;
    if (!app_) return c.json({ success: false, error: "Application not found" }, 404);
    const updated: Application = {
      ...app_, status: "declined",
      reviewNotes: reason,
      assignedTo: assignedTo ?? "Admin",
      updatedAt: now(),
    };
    await kv.set(`app:${ref}`, updated);

    const events: unknown[] = (await kv.get(`app:${ref}:events`)) ?? [];
    events.push({ action: "declined", by: assignedTo ?? "Admin", note: reason, at: now() });
    await kv.set(`app:${ref}:events`, events);

    return c.json({ success: true, data: updated, message: `Application ${ref} declined.` });
  } catch {
    return c.json({ success: false, error: "Failed to decline application" }, 500);
  }
});

// POST /admin/applications/:ref/request-info — request additional documents
app.post("/make-server-3f39932e/admin/applications/:ref/request-info", async (c) => {
  try {
    const ref = c.req.param("ref");
    const { note, assignedTo } = await c.req.json().catch(() => ({}));
    if (!note) return c.json({ success: false, error: "Note describing required information is required" }, 400);
    const app_ = await kv.get(`app:${ref}`) as Application | null;
    if (!app_) return c.json({ success: false, error: "Application not found" }, 404);
    const updated: Application = {
      ...app_, status: "more_info_required",
      reviewNotes: note,
      assignedTo: assignedTo ?? "Admin",
      updatedAt: now(),
    };
    await kv.set(`app:${ref}`, updated);

    const events: unknown[] = (await kv.get(`app:${ref}:events`)) ?? [];
    events.push({ action: "more_info_required", by: assignedTo ?? "Admin", note, at: now() });
    await kv.set(`app:${ref}:events`, events);

    return c.json({ success: true, data: updated, message: "Applicant notified to provide additional information." });
  } catch {
    return c.json({ success: false, error: "Failed to update application" }, 500);
  }
});

// POST /admin/applications/:ref/assign — assign to reviewer
app.post("/make-server-3f39932e/admin/applications/:ref/assign", async (c) => {
  try {
    const ref = c.req.param("ref");
    const { assignedTo } = await c.req.json();
    if (!assignedTo) return c.json({ success: false, error: "assignedTo required" }, 400);
    const app_ = await kv.get(`app:${ref}`) as Application | null;
    if (!app_) return c.json({ success: false, error: "Application not found" }, 404);
    const updated: Application = { ...app_, status: "under_review", assignedTo, updatedAt: now() };
    await kv.set(`app:${ref}`, updated);
    return c.json({ success: true, data: updated });
  } catch {
    return c.json({ success: false, error: "Failed to assign application" }, 500);
  }
});

// GET /admin/applications/:ref/events — audit trail
app.get("/make-server-3f39932e/admin/applications/:ref/events", async (c) => {
  try {
    const events = await kv.get(`app:${c.req.param("ref")}:events`) ?? [];
    return c.json({ success: true, data: events });
  } catch {
    return c.json({ success: false, error: "Failed to fetch events" }, 500);
  }
});

// GET /admin/contacts — list all contact form submissions
app.get("/make-server-3f39932e/admin/contacts", async (c) => {
  try {
    const idx: string[] = (await kv.get("contacts:index")) ?? [];
    const contacts = await Promise.all(idx.slice(0, 100).map(id => kv.get(id)));
    return c.json({ success: true, data: contacts.filter(Boolean), meta: { total: idx.length } });
  } catch {
    return c.json({ success: false, error: "Failed to fetch contacts" }, 500);
  }
});

// GET /admin/newsletter — list newsletter subscribers
app.get("/make-server-3f39932e/admin/newsletter", async (c) => {
  try {
    const idx: string[] = (await kv.get("newsletter:index")) ?? [];
    return c.json({ success: true, data: idx, meta: { total: idx.length } });
  } catch {
    return c.json({ success: false, error: "Failed to fetch subscribers" }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── AFC REVENUE DISTRIBUTION SYSTEM ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const AFC_FEES = {
  PASSENGER_TAP_FEE: 0.50,
  DRIVER_TAP_FEE:    0.50,
  VMS_FEE_TOTAL:     1.00,
  INVESTOR_SHARE_PCT: 10,
  TRIP_LEVY:         20.00,
  DEVICE_MONTHLY_RENTAL: 250.00,
};

async function seedLevyData() {
  const seeded = await kv.get("levy:seeded");
  if (seeded) return;
  await kv.set("levy:accounts", [
    { id: "la-vms",     type: "vms_platform",  ownerId: "vms",       ownerName: "VMS Platform Account",             balance: 284750,  totalIn: 284750,  totalOut: 0,     status: "active" },
    { id: "la-inv001",  type: "investor",       ownerId: "inv-001",   ownerName: "Themba Nkosi (Investor)",          balance: 42850,   totalIn: 42850,   totalOut: 0,     status: "active" },
    { id: "la-inv002",  type: "investor",       ownerId: "inv-002",   ownerName: "Priya Investments CC",             balance: 28400,   totalIn: 28400,   totalOut: 0,     status: "active" },
    { id: "la-assoc001",type: "association",    ownerId: "assoc-001", ownerName: "Cape Flats Taxi Association",      balance: 187240,  totalIn: 187240,  totalOut: 0,     status: "active" },
    { id: "la-assoc002",type: "association",    ownerId: "assoc-002", ownerName: "Bellville Metro Operators",        balance: 94820,   totalIn: 94820,   totalOut: 0,     status: "active" },
    { id: "la-marsh001",type: "marshall",       ownerId: "marsh-001", ownerName: "Moses Davids (Marshall)",          balance: 18420,   totalIn: 18420,   totalOut: 0,     status: "active" },
    { id: "la-marsh002",type: "marshall",       ownerId: "marsh-002", ownerName: "Sipho Mthembu (Marshall)",         balance: 9840,    totalIn: 9840,    totalOut: 0,     status: "active" },
    { id: "la-drv001",  type: "driver",         ownerId: "drv-001",   ownerName: "Sipho Dlamini",                    balance: 3842,    totalIn: 58720,   totalOut: 54878, status: "active" },
    { id: "la-drv002",  type: "driver",         ownerId: "drv-002",   ownerName: "Thabo Nkosi",                      balance: 5120,    totalIn: 72400,   totalOut: 67280, status: "active" },
    { id: "la-pax001",  type: "passenger",      ownerId: "pax-001",   ownerName: "Aisha Petersen",                   balance: 247.50,  totalIn: 500,     totalOut: 252.50,status: "active" },
    { id: "la-own001",  type: "taxi_owner",     ownerId: "own-001",   ownerName: "Cape Metro Taxis (Pty) Ltd",       balance: 0,       totalIn: 0,       totalOut: 750,   status: "active" },
  ]);
  await kv.set("levy:devices", [
    { id: "dev-001", serialNumber: "AFC-CPT-00847", investorId: "inv-001", taxiOwnerId: "own-001", driverId: "drv-001", associationId: "assoc-001", marshallId: "marsh-001", routeId: "r1", monthlyRental: 250, status: "active", tapCount: 4284 },
    { id: "dev-002", serialNumber: "AFC-CPT-00923", investorId: "inv-001", taxiOwnerId: "own-001", driverId: "drv-002", associationId: "assoc-001", marshallId: "marsh-001", routeId: "r2", monthlyRental: 250, status: "active", tapCount: 3102 },
    { id: "dev-003", serialNumber: "AFC-CPT-01145", investorId: "inv-002", taxiOwnerId: "own-001", driverId: "drv-003", associationId: "assoc-002", marshallId: "marsh-002", routeId: "r3", monthlyRental: 250, status: "active", tapCount: 2847 },
  ]);
  await kv.set("levy:agreements", [
    { id: "agr-001", associationId: "assoc-001", associationName: "Cape Flats Taxi Association", marshallId: "marsh-001", marshallName: "Moses Davids", marshallPercentage: 15, effectiveFrom: "2024-01-01", status: "active" },
    { id: "agr-002", associationId: "assoc-002", associationName: "Bellville Metro Operators", marshallId: "marsh-002", marshallName: "Sipho Mthembu", marshallPercentage: 12, effectiveFrom: "2024-03-01", status: "active" },
  ]);
  await kv.set("levy:taps", []);
  await kv.set("levy:transactions", []);
  await kv.set("levy:seeded", true);
}

await seedLevyData();

// GET /levy/fees
app.get("/make-server-3f39932e/levy/fees", (c) => c.json({ success: true, data: AFC_FEES }));

// GET /levy/snapshot
app.get("/make-server-3f39932e/levy/snapshot", async (c) => {
  const accounts: Record<string, unknown>[] = (await kv.get("levy:accounts")) ?? [];
  const devices:  Record<string, unknown>[] = (await kv.get("levy:devices"))  ?? [];
  const taps:     Record<string, unknown>[] = (await kv.get("levy:taps"))     ?? [];
  const txns:     Record<string, unknown>[] = (await kv.get("levy:transactions")) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todayTaps = taps.filter((t: Record<string,unknown>) => String(t.timestamp ?? "").startsWith(today));
  return c.json({ success: true, data: {
    timestamp: new Date().toISOString(),
    totalTapsToday: todayTaps.length,
    totalFareToday: +todayTaps.reduce((s, t: Record<string,unknown>) => s + Number(t.fareAmount ?? 0), 0).toFixed(2),
    totalVmsEarningsToday: +todayTaps.reduce((s, t: Record<string,unknown>) => s + Number(t.vmsPlatformShare ?? 0), 0).toFixed(2),
    totalInvestorEarningsToday: +todayTaps.reduce((s, t: Record<string,unknown>) => s + Number(t.investorShare ?? 0), 0).toFixed(2),
    totalLeviesCollectedToday: 0,
    totalMarshallPaymentsToday: 0,
    totalRentalsThisMonth: 750,
    activeDevices: devices.filter((d: Record<string,unknown>) => d.status === "active").length,
    activeDrivers: accounts.filter((a: Record<string,unknown>) => a.type === "driver").length,
    activePassengers: accounts.filter((a: Record<string,unknown>) => a.type === "passenger").length,
    totalLifetimeTaps: devices.reduce((s, d: Record<string,unknown>) => s + Number(d.tapCount ?? 0), 0),
    vmsTotalBalance: (accounts.find((a: Record<string,unknown>) => a.type === "vms_platform") as Record<string,unknown> | undefined)?.balance ?? 0,
  }});
});

// GET /levy/accounts
app.get("/make-server-3f39932e/levy/accounts", async (c) => {
  const data = await kv.get("levy:accounts") ?? [];
  return c.json({ success: true, data });
});

// GET /levy/devices
app.get("/make-server-3f39932e/levy/devices", async (c) => {
  const data = await kv.get("levy:devices") ?? [];
  return c.json({ success: true, data });
});

// GET /levy/agreements
app.get("/make-server-3f39932e/levy/agreements", async (c) => {
  const data = await kv.get("levy:agreements") ?? [];
  return c.json({ success: true, data });
});

// POST /levy/agreements
app.post("/make-server-3f39932e/levy/agreements", async (c) => {
  const { associationId, marshallId, marshallPercentage, approvedBy, notes } = await c.req.json();
  if (!associationId || !marshallId || marshallPercentage === undefined) {
    return c.json({ success: false, error: "associationId, marshallId, marshallPercentage required" }, 400);
  }
  const agrs: Record<string,unknown>[] = (await kv.get("levy:agreements")) ?? [];
  agrs.filter((a: Record<string,unknown>) => a.associationId === associationId && a.marshallId === marshallId).forEach(a => { a.status = "terminated"; });
  const newAgr = { id: crypto.randomUUID(), associationId, marshallId, marshallPercentage, approvedBy: approvedBy ?? "Dashboard", effectiveFrom: new Date().toISOString().slice(0, 10), status: "active", notes: notes ?? "" };
  agrs.push(newAgr);
  await kv.set("levy:agreements", agrs);
  return c.json({ success: true, data: newAgr }, 201);
});

// GET /levy/transactions
app.get("/make-server-3f39932e/levy/transactions", async (c) => {
  const data: Record<string,unknown>[] = (await kv.get("levy:transactions")) ?? [];
  return c.json({ success: true, data: data.slice(-100).reverse() });
});

// POST /levy/tap — process a tap and distribute revenue
app.post("/make-server-3f39932e/levy/tap", async (c) => {
  try {
    const { deviceId, passengerId, fareAmount, routeName, paymentPath, processingMs } = await c.req.json();
    if (!deviceId || !passengerId || !fareAmount) {
      return c.json({ success: false, error: "deviceId, passengerId, fareAmount required" }, 400);
    }
    const devices:  Record<string,unknown>[] = (await kv.get("levy:devices"))  ?? [];
    const accounts: Record<string,unknown>[] = (await kv.get("levy:accounts")) ?? [];
    const agrs:     Record<string,unknown>[] = (await kv.get("levy:agreements")) ?? [];
    const taps:     Record<string,unknown>[] = (await kv.get("levy:taps"))     ?? [];
    const txns:     Record<string,unknown>[] = (await kv.get("levy:transactions")) ?? [];

    const dev = devices.find((d: Record<string,unknown>) => d.id === deviceId) as Record<string,unknown> | undefined;
    if (!dev) return c.json({ success: false, error: "Device not found" }, 404);

    const passFee = AFC_FEES.PASSENGER_TAP_FEE;
    const drvFee  = AFC_FEES.DRIVER_TAP_FEE;
    const invShare = +(AFC_FEES.VMS_FEE_TOTAL * AFC_FEES.INVESTOR_SHARE_PCT / 100).toFixed(2);
    const vmsKeeps = +(AFC_FEES.VMS_FEE_TOTAL - invShare).toFixed(2);

    const updateBal = (ownerId: string, delta: number) => {
      const acct = accounts.find((a: Record<string,unknown>) => a.ownerId === ownerId) as Record<string,unknown> | undefined;
      if (acct) {
        acct.balance = +((Number(acct.balance) + delta)).toFixed(2);
        if (delta > 0) acct.totalIn = +(Number(acct.totalIn) + delta).toFixed(2);
        else acct.totalOut = +(Number(acct.totalOut) - delta).toFixed(2);
        acct.lastTransactionAt = new Date().toISOString();
      }
    };

    const tapId = crypto.randomUUID();
    const ts = new Date().toISOString();
    updateBal(passengerId, -(fareAmount + passFee));
    updateBal(String(dev.driverId), fareAmount - drvFee);
    updateBal(String(dev.investorId), invShare);
    updateBal("vms", vmsKeeps);
    (dev as Record<string,number>).tapCount = (Number(dev.tapCount) || 0) + 1;

    const tap = { id: tapId, deviceId, passengerId, driverId: dev.driverId, investorId: dev.investorId, fareAmount, passengerTapFee: passFee, driverTapFee: drvFee, vmsFee: AFC_FEES.VMS_FEE_TOTAL, investorShare: invShare, vmsPlatformShare: vmsKeeps, routeName: routeName ?? "", paymentPath: paymentPath ?? "online_fast", processingMs: processingMs ?? 500, timestamp: ts, settled: true };
    const newTxns = [
      { id: crypto.randomUUID(), type: "tap_fare",          amount: fareAmount, description: `Fare — ${routeName ?? "route"}`, timestamp: ts },
      { id: crypto.randomUUID(), type: "tap_fee_passenger", amount: passFee,   description: "VMS tap fee (passenger)", timestamp: ts },
      { id: crypto.randomUUID(), type: "investor_tap",      amount: invShare,   description: `Investor share (${AFC_FEES.INVESTOR_SHARE_PCT}% of R${AFC_FEES.VMS_FEE_TOTAL})`, timestamp: ts },
    ];

    taps.push(tap);
    txns.push(...newTxns);
    await kv.set("levy:devices", devices);
    await kv.set("levy:accounts", accounts);
    await kv.set("levy:taps", taps.slice(-1000));
    await kv.set("levy:transactions", txns.slice(-2000));

    return c.json({ success: true, data: { tap, transactions: newTxns } }, 201);
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// PATCH /levy/devices/:id/rental
app.patch("/make-server-3f39932e/levy/devices/:id/rental", async (c) => {
  const devices: Record<string,unknown>[] = (await kv.get("levy:devices")) ?? [];
  const dev = devices.find((d: Record<string,unknown>) => d.id === c.req.param("id")) as Record<string,unknown> | undefined;
  if (!dev) return c.json({ success: false, error: "Device not found" }, 404);
  const { monthlyRental } = await c.req.json();
  if (monthlyRental !== undefined) dev.monthlyRental = monthlyRental;
  await kv.set("levy:devices", devices);
  return c.json({ success: true, data: dev });
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── FINANCIAL REPORTS SYSTEM ─────────────────────────────────────────────────
// Payslips · Bank Statements · Income Statement · Balance Sheet · Cash Flow
// ══════════════════════════════════════════════════════════════════════════════

// ── Seed financial demo data ──────────────────────────────────────────────────
async function seedFinancialData() {
  const seeded = await kv.get("fin:seeded");
  if (seeded) return;

  // Driver pay configs
  await kv.set("fin:driver-configs", [
    {
      driverId: "drv-001", driverName: "Sipho Dlamini", idNumber: "8707125482085",
      vehicleReg: "CA 847-891", ownerName: "Vincent Kafula", ownerPhone: "+27 21 007 0772",
      associationName: "Khayelitsha Taxi Association",
      paymentModel: "target", monthlyGross: 0,
      dailyTarget: 350, weeklyTarget: 2450, monthlyTarget: 9800,
      vehicleRentalMonthly: 3500, associationLevyMonthly: 450, insuranceMonthly: 680,
      fuelAllowanceMonthly: 0, uniformDeduction: 0, otherDeductions: 0,
      bankAccountNumber: "1234567890", bankName: "Standard Bank", taxNumber: "9312345678",
    },
    {
      driverId: "drv-002", driverName: "Thabo Nkosi", idNumber: "9203075482082",
      vehicleReg: "CA 312-554", ownerName: "Vincent Kafula", ownerPhone: "+27 21 007 0772",
      associationName: "Khayelitsha Taxi Association",
      paymentModel: "salary", monthlyGross: 8500,
      dailyTarget: 0, weeklyTarget: 0, monthlyTarget: 0,
      vehicleRentalMonthly: 0, associationLevyMonthly: 450, insuranceMonthly: 0,
      fuelAllowanceMonthly: 1200, uniformDeduction: 150, otherDeductions: 0,
      bankAccountNumber: "9876543210", bankName: "Nedbank", taxNumber: "9312345679",
    },
  ]);

  // Demo trips
  const baseTime = Date.now();
  await kv.set("fin:trips", [
    { id: crypto.randomUUID(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "Nomsa Zulu", passengerCard: "**** 8842", fareAmount: 14, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(baseTime-3600000).toISOString(), settledAt: new Date(baseTime-3590000).toISOString(), authCode: "AUTH847219", notes: "" },
    { id: crypto.randomUUID(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "Sipho Khumalo", passengerCard: "**** 3317", fareAmount: 14, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(baseTime-7200000).toISOString(), settledAt: new Date(baseTime-7190000).toISOString(), authCode: "AUTH338821", notes: "" },
    { id: crypto.randomUUID(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: null, passengerCard: null, fareAmount: 14, currency: "ZAR", paymentMethod: "cash", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(baseTime-9000000).toISOString(), settledAt: new Date(baseTime-9000000).toISOString(), authCode: null, notes: "Cash fare" },
    { id: crypto.randomUUID(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "Priya Naidoo", passengerCard: "**** 7751", fareAmount: 14, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(baseTime-10800000).toISOString(), settledAt: new Date(baseTime-10790000).toISOString(), authCode: "AUTH992147", notes: "" },
    { id: crypto.randomUUID(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "James van Berg", passengerCard: "**** 5523", fareAmount: 14, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(baseTime-12000000).toISOString(), settledAt: new Date(baseTime-11990000).toISOString(), authCode: "AUTH004411", notes: "" },
    { id: crypto.randomUUID(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: null, passengerCard: null, fareAmount: 14, currency: "ZAR", paymentMethod: "cash", routeName: "Mitchell's Plain → Bellville", tapTimestamp: new Date(baseTime-14400000).toISOString(), settledAt: new Date(baseTime-14400000).toISOString(), authCode: null, notes: "" },
  ]);

  // Journal entries
  await kv.set("fin:journal:biz-001", [
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date().toISOString().split("T")[0], account: "Fare Revenue (Card)", description: "AFC card fares — today", debit: 0, credit: 56, category: "fare_card", entryType: "income", source: "auto", createdAt: now() },
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date().toISOString().split("T")[0], account: "Fare Revenue (Cash)", description: "Cash fares — today", debit: 0, credit: 28, category: "fare_cash", entryType: "income", source: "auto", createdAt: now() },
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date(baseTime-86400000).toISOString().split("T")[0], account: "Fuel Cost", description: "BP garage N2 fill-up", debit: 1245, credit: 0, category: "fuel", entryType: "expense", source: "manual", createdAt: now() },
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date(baseTime-172800000).toISOString().split("T")[0], account: "Vehicle Maintenance", description: "Tyre replacement front left", debit: 890, credit: 0, category: "vehicle_maintenance", entryType: "expense", source: "manual", createdAt: now() },
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date(baseTime-259200000).toISOString().split("T")[0], account: "Driver Wages", description: "Sipho Dlamini — week 1 target payout", debit: 2850, credit: 0, category: "driver_wages", entryType: "expense", source: "manual", createdAt: now() },
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date(baseTime-345600000).toISOString().split("T")[0], account: "Association Levy", description: "KTA monthly levy", debit: 450, credit: 0, category: "association_levy", entryType: "expense", source: "manual", createdAt: now() },
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date(baseTime-432000000).toISOString().split("T")[0], account: "Insurance", description: "Santam commercial vehicle insurance", debit: 1680, credit: 0, category: "insurance", entryType: "expense", source: "manual", createdAt: now() },
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date(baseTime-604800000).toISOString().split("T")[0], account: "Fare Revenue (Card)", description: "AFC card fares — last week", debit: 0, credit: 4842, category: "fare_card", entryType: "income", source: "auto", createdAt: now() },
    { id: crypto.randomUUID(), businessId: "biz-001", date: new Date(baseTime-604800000).toISOString().split("T")[0], account: "Fare Revenue (Cash)", description: "Cash fares — last week", debit: 0, credit: 1260, category: "fare_cash", entryType: "income", source: "auto", createdAt: now() },
  ]);

  // Bank statement entries
  let bal = 8420;
  const mkBE = (date: string, desc: string, ref: string, debit: number|null, credit: number|null, cat: string) => {
    bal = credit ? bal + credit : bal - (debit ?? 0);
    return { id: crypto.randomUUID(), accountId: "drv-001", date, description: desc, reference: ref, debit, credit, balance: +bal.toFixed(2), category: cat, source: debit || credit ? "manual" : "auto" };
  };
  const d = (n: number) => new Date(baseTime - n*86400000).toISOString().split("T")[0];
  await kv.set("fin:bank:drv-001", [
    mkBE(d(30),"Opening balance","OB-30",null,0,"other_income"),
    mkBE(d(29),"AFC Card fares settled","AFC-01",null,420,"fare_card"),
    mkBE(d(28),"BP Garage — fuel","FUE-001",650,null,"fuel"),
    mkBE(d(27),"AFC Card fares settled","AFC-02",null,392,"fare_card"),
    mkBE(d(25),"Cash fares deposited","CSH-01",null,280,"fare_cash"),
    mkBE(d(24),"Tyre replacement","MNT-001",890,null,"maintenance"),
    mkBE(d(21),"KTA Association levy","LEVY-1",450,null,"levy"),
    mkBE(d(20),"AFC Card fares settled","AFC-03",null,2841,"fare_card"),
    mkBE(d(19),"Cash fares deposited","CSH-02",null,840,"fare_cash"),
    mkBE(d(18),"FNB Vehicle loan instalment","LOAN-1",4680,null,"loan_repayment"),
    mkBE(d(14),"AFC Card fares settled","AFC-04",null,1980,"fare_card"),
    mkBE(d(13),"Santam insurance premium","INS-1",680,null,"insurance"),
    mkBE(d(7),"AFC Card fares settled","AFC-05",null,2240,"fare_card"),
    mkBE(d(6),"Cash fares deposited","CSH-03",null,560,"fare_cash"),
    mkBE(d(5),"BP Garage — fuel","FUE-002",595,null,"fuel"),
    mkBE(d(1),"AFC Card fares settled","AFC-06",null,490,"fare_card"),
    mkBE(d(0),"Cash fares deposited","CSH-04",null,84,"fare_cash"),
  ]);

  await kv.set("fin:seeded", true);
}
await seedFinancialData();

// ── Trips ─────────────────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/financial/trips", async (c) => {
  const { driverId, limit = "50" } = c.req.query();
  let trips: Record<string,unknown>[] = (await kv.get("fin:trips")) ?? [];
  if (driverId) trips = trips.filter((t: Record<string,unknown>) => t.driverId === driverId);
  trips.sort((a, b) => new Date(b.tapTimestamp as string).getTime() - new Date(a.tapTimestamp as string).getTime());
  return c.json({ success: true, data: trips.slice(0, +limit), meta: { total: trips.length } });
});

app.post("/make-server-3f39932e/financial/trips", async (c) => {
  try {
    const { driverId, vehicleReg, passengerName, passengerCard, fareAmount, paymentMethod, routeName, notes } = await c.req.json();
    if (!driverId || !fareAmount || !paymentMethod) return c.json({ success: false, error: "driverId, fareAmount, paymentMethod required" }, 400);
    const trip = {
      id: crypto.randomUUID(), driverId, vehicleReg: vehicleReg ?? "",
      passengerName: passengerName ?? null, passengerCard: passengerCard ?? null,
      fareAmount: +fareAmount, currency: "ZAR", paymentMethod, routeName: routeName ?? "",
      tapTimestamp: now(), settledAt: paymentMethod === "cash" ? now() : null,
      authCode: paymentMethod === "card" ? `AUTH${Math.floor(100000 + Math.random() * 900000)}` : null,
      notes: notes ?? "",
    };
    const trips: Record<string,unknown>[] = (await kv.get("fin:trips")) ?? [];
    trips.unshift(trip);
    await kv.set("fin:trips", trips.slice(0, 500));
    return c.json({ success: true, data: trip }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

app.get("/make-server-3f39932e/financial/trips/summary", async (c) => {
  const { driverId } = c.req.query();
  let trips: Record<string,unknown>[] = (await kv.get("fin:trips")) ?? [];
  if (driverId) trips = trips.filter((t: Record<string,unknown>) => t.driverId === driverId);
  const cardTotal = +trips.filter(t => t.paymentMethod === "card").reduce((s, t) => s + Number(t.fareAmount), 0).toFixed(2);
  const cashTotal = +trips.filter(t => t.paymentMethod === "cash").reduce((s, t) => s + Number(t.fareAmount), 0).toFixed(2);
  const configs: Record<string,unknown>[] = (await kv.get("fin:driver-configs")) ?? [];
  const cfg = configs.find((c: Record<string,unknown>) => c.driverId === driverId) as Record<string,unknown> | undefined;
  const targetAmount = cfg?.paymentModel === "target" ? cfg.monthlyTarget : null;
  return c.json({ success: true, data: {
    tripCount: trips.length, cardTotal, cashTotal, totalFares: +(cardTotal + cashTotal).toFixed(2),
    targetAmount, targetAchieved: targetAmount ? (cardTotal + cashTotal) >= Number(targetAmount) : null,
    passengerList: trips.map(t => ({ name: t.passengerName, card: t.passengerCard, method: t.paymentMethod, amount: t.fareAmount, time: t.tapTimestamp }))
  }});
});

// ── Driver pay config ─────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/financial/driver-config/:driverId", async (c) => {
  const configs: Record<string,unknown>[] = (await kv.get("fin:driver-configs")) ?? [];
  const cfg = configs.find((c: Record<string,unknown>) => c.driverId === c.req?.param("driverId"));
  // Hono context param
  const driverId = c.req.param("driverId");
  const found = configs.find(c => c.driverId === driverId);
  if (!found) return c.json({ success: false, error: "Driver configuration not found" }, 404);
  return c.json({ success: true, data: found });
});

app.patch("/make-server-3f39932e/financial/driver-config/:driverId", async (c) => {
  try {
    const driverId = c.req.param("driverId");
    const configs: Record<string,unknown>[] = (await kv.get("fin:driver-configs")) ?? [];
    const idx = configs.findIndex(c => c.driverId === driverId);
    if (idx < 0) return c.json({ success: false, error: "Driver not found" }, 404);
    const updates = await c.req.json();
    configs[idx] = { ...configs[idx], ...updates };
    await kv.set("fin:driver-configs", configs);
    return c.json({ success: true, data: configs[idx] });
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ── Payslip ───────────────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/financial/payslip/:driverId", async (c) => {
  try {
    const driverId = c.req.param("driverId");
    const configs: Record<string,unknown>[] = (await kv.get("fin:driver-configs")) ?? [];
    const cfg = configs.find(c => c.driverId === driverId) as Record<string,number&string> | undefined;
    if (!cfg) return c.json({ success: false, error: "Driver not found" }, 404);
    const trips: Record<string,unknown>[] = (await kv.get("fin:trips")) ?? [];
    const driverTrips = trips.filter(t => t.driverId === driverId);
    const faresTotalCard = +driverTrips.filter(t => t.paymentMethod === "card").reduce((s,t) => s + Number(t.fareAmount), 0).toFixed(2);
    const faresTotalCash = +driverTrips.filter(t => t.paymentMethod === "cash").reduce((s,t) => s + Number(t.fareAmount), 0).toFixed(2);
    const totalGross = cfg.paymentModel === "salary" ? Number(cfg.monthlyGross) : faresTotalCard + faresTotalCash;
    const vehicleRental = Number(cfg.vehicleRentalMonthly ?? 3500);
    const associationLevy = Number(cfg.associationLevyMonthly ?? 450);
    const insurance = Number(cfg.insuranceMonthly ?? 680);
    const paye = +(Math.max(0, totalGross - vehicleRental - associationLevy - insurance) > 7275 ? (totalGross - vehicleRental - associationLevy - insurance) * 0.18 : 0).toFixed(2);
    const uif = +(Math.min(totalGross * 0.01, 177.12)).toFixed(2);
    const otherDeductions = Number(cfg.otherDeductions ?? 0) + Number(cfg.uniformDeduction ?? 0);
    const totalDeductions = +(vehicleRental + associationLevy + insurance + paye + uif + otherDeductions).toFixed(2);
    const netPay = +(totalGross - totalDeductions).toFixed(2);
    const today = new Date().toISOString().split("T")[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    return c.json({ success: true, data: {
      id: crypto.randomUUID(), driverId,
      periodStart: firstDay, periodEnd: today, issueDate: today,
      employerName: String(cfg.associationName ?? "Khayelitsha Taxi Association"),
      employerReg: "2018/079316/07",
      employerAddress: "8 Rose Street, Cape Town CBD, 8001",
      employeeName: String(cfg.driverName), employeeId: String(cfg.idNumber),
      employeeTaxNo: String(cfg.taxNumber), bankAccount: String(cfg.bankAccountNumber),
      bankName: String(cfg.bankName), vehicleReg: String(cfg.vehicleReg),
      faresTotalCard, faresTotalCash, bonusAmount: 0, totalGross,
      vehicleRental, associationLevy, insurance, paye, uif, otherDeductions,
      totalDeductions, netPay, tripsCount: driverTrips.length,
      periodType: "monthly", paymentModel: String(cfg.paymentModel),
      targetAmount: cfg.paymentModel === "target" ? Number(cfg.monthlyTarget) : null,
      targetAchieved: cfg.paymentModel === "target" ? (faresTotalCard + faresTotalCash) >= Number(cfg.monthlyTarget) : null,
    }});
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ── Bank statement ────────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/financial/bank-statement/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const { from, to } = c.req.query();
  let entries: Record<string,unknown>[] = (await kv.get(`fin:bank:${accountId}`)) ?? [];
  if (from) entries = entries.filter(e => String(e.date) >= from);
  if (to)   entries = entries.filter(e => String(e.date) <= to);
  entries.sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const totalCredits = +entries.reduce((s, e) => s + Number(e.credit ?? 0), 0).toFixed(2);
  const totalDebits  = +entries.reduce((s, e) => s + Number(e.debit  ?? 0), 0).toFixed(2);
  const openingBalance = Number(entries[0]?.balance ?? 0);
  const closingBalance = Number(entries[entries.length-1]?.balance ?? 0);
  return c.json({ success: true, data: entries, meta: { total: entries.length, openingBalance, closingBalance, totalCredits, totalDebits } });
});

app.post("/make-server-3f39932e/financial/bank-statement/entry", async (c) => {
  try {
    const { accountId, date, description, reference, debit, credit, category } = await c.req.json();
    if (!accountId || !date || !description) return c.json({ success: false, error: "accountId, date, description required" }, 400);
    const key = `fin:bank:${accountId}`;
    const entries: Record<string,unknown>[] = (await kv.get(key)) ?? [];
    const sorted = [...entries].sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const prevBal = Number(sorted[0]?.balance ?? 0);
    const newBal = +(prevBal + Number(credit ?? 0) - Number(debit ?? 0)).toFixed(2);
    const entry = { id: crypto.randomUUID(), accountId, date, description, reference: reference ?? `MAN-${Date.now()}`, debit: debit ?? null, credit: credit ?? null, balance: newBal, category: category ?? "other_income", source: "manual" };
    entries.push(entry);
    await kv.set(key, entries.slice(0, 500));
    return c.json({ success: true, data: entry }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ── Journal entries ───────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/financial/journal/:businessId", async (c) => {
  const { from, to, entryType } = c.req.query();
  let entries: Record<string,unknown>[] = (await kv.get(`fin:journal:${c.req.param("businessId")}`)) ?? [];
  if (from) entries = entries.filter(e => String(e.date) >= from);
  if (to)   entries = entries.filter(e => String(e.date) <= to);
  if (entryType) entries = entries.filter(e => e.entryType === entryType);
  entries.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  return c.json({ success: true, data: entries, meta: { total: entries.length } });
});

app.post("/make-server-3f39932e/financial/journal", async (c) => {
  try {
    const { businessId, date, account, description, debit, credit, category, entryType } = await c.req.json();
    if (!businessId || !date || !account || !description) return c.json({ success: false, error: "businessId, date, account, description required" }, 400);
    const entry = { id: crypto.randomUUID(), businessId, date, account, description, debit: +debit||0, credit: +credit||0, category, entryType, source: "manual", createdAt: now() };
    const key = `fin:journal:${businessId}`;
    const entries: Record<string,unknown>[] = (await kv.get(key)) ?? [];
    entries.unshift(entry);
    await kv.set(key, entries.slice(0, 500));
    return c.json({ success: true, data: entry }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ── Income statement ──────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/financial/statements/income", async (c) => {
  try {
    const { businessId = "biz-001", from, to } = c.req.query();
    let entries: Record<string,unknown>[] = (await kv.get(`fin:journal:${businessId}`)) ?? [];
    if (from) entries = entries.filter(e => String(e.date) >= from);
    if (to)   entries = entries.filter(e => String(e.date) <= to);
    const income  = (cat: string) => +entries.filter(e => e.category === cat).reduce((s, e) => s + Number(e.credit), 0).toFixed(2);
    const expense = (cat: string) => +entries.filter(e => e.category === cat).reduce((s, e) => s + Number(e.debit), 0).toFixed(2);
    const fareRevenueCard = income("fare_card");
    const fareRevenueCash = income("fare_cash");
    const otherIncome     = income("other_income") + income("levy_income");
    const totalRevenue    = +(fareRevenueCard + fareRevenueCash + otherIncome).toFixed(2);
    const driverWages     = expense("driver_wages");
    const associationLevy = expense("association_levy");
    const afcDeviceRental = expense("afc_rental");
    const totalCostOfSales = +(driverWages + associationLevy + afcDeviceRental).toFixed(2);
    const grossProfit = +(totalRevenue - totalCostOfSales).toFixed(2);
    const fuelCosts = expense("fuel");
    const vehicleMaintenance = expense("vehicle_maintenance");
    const insurance  = expense("insurance");
    const depreciation = expense("depreciation");
    const adminExpenses = expense("admin");
    const otherExpenses = expense("other_expense");
    const totalOpExpenses = +(fuelCosts + vehicleMaintenance + insurance + depreciation + adminExpenses + otherExpenses).toFixed(2);
    const operatingProfit = +(grossProfit - totalOpExpenses).toFixed(2);
    const loanInterest    = expense("loan_interest");
    const bankCharges     = 0;
    const totalFinanceCosts = +(loanInterest + bankCharges).toFixed(2);
    const profitBeforeTax = +(operatingProfit - totalFinanceCosts).toFixed(2);
    const taxExpense = +(Math.max(0, profitBeforeTax * 0.27)).toFixed(2);
    const netProfit  = +(profitBeforeTax - taxExpense).toFixed(2);
    return c.json({ success: true, data: {
      businessId, periodStart: from ?? "2024-01-01", periodEnd: to ?? now().split("T")[0],
      fareRevenueCard, fareRevenueCash, otherIncome, totalRevenue,
      driverWages, associationLevy, afcDeviceRental, totalCostOfSales, grossProfit,
      grossProfitMargin: totalRevenue > 0 ? +((grossProfit/totalRevenue)*100).toFixed(1) : 0,
      fuelCosts, vehicleMaintenance, insurance, depreciation, adminExpenses, otherExpenses,
      totalOpExpenses, operatingProfit, loanInterest, bankCharges, totalFinanceCosts,
      profitBeforeTax, taxExpense, netProfit,
      netProfitMargin: totalRevenue > 0 ? +((netProfit/totalRevenue)*100).toFixed(1) : 0,
    }});
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ── Balance sheet ─────────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/financial/statements/balance-sheet", async (c) => {
  try {
    const { businessId = "biz-001" } = c.req.query();
    const bankEntries: Record<string,unknown>[] = (await kv.get(`fin:bank:${businessId}`)) ?? [];
    const bankBal = bankEntries.length > 0 ? Number(bankEntries.sort((a,b) => String(b.date).localeCompare(String(a.date)))[0].balance) : 12847.50;
    const ca = { cashInHand: 2840, bankBalance: +bankBal.toFixed(2), debtors: 1200, otherCurrent: 0, total: 0 };
    const nca = { vehicles: 285000, accumulatedDepreciation: -42750, afcDevices: 18500, otherFixed: 0, total: 0 };
    const cl  = { tradeCreditors: 3200, taxPayable: 1840, uifPayable: 320, otherCurrent: 0, total: 0 };
    const ncl = { vehicleLoan: 198400, otherLongTerm: 0, total: 0 };
    const eq  = { openingCapital: 50000, retainedEarnings: 18420, currentYearProfit: 0, drawings: -12000, total: 0 };
    ca.total  = +(ca.cashInHand + ca.bankBalance + ca.debtors).toFixed(2);
    nca.total = +(nca.vehicles + nca.accumulatedDepreciation + nca.afcDevices).toFixed(2);
    const totalAssets = +(ca.total + nca.total).toFixed(2);
    cl.total  = +(cl.tradeCreditors + cl.taxPayable + cl.uifPayable).toFixed(2);
    ncl.total = +ncl.vehicleLoan.toFixed(2);
    const totalLiabilities = +(cl.total + ncl.total).toFixed(2);
    eq.currentYearProfit = +(totalAssets - totalLiabilities - eq.openingCapital - eq.retainedEarnings - eq.drawings).toFixed(2);
    eq.total = +(eq.openingCapital + eq.retainedEarnings + eq.currentYearProfit + eq.drawings).toFixed(2);
    const liabilitiesAndEquity = +(totalLiabilities + eq.total).toFixed(2);
    return c.json({ success: true, data: {
      businessId, asAt: now().split("T")[0],
      currentAssets: ca, nonCurrentAssets: nca, totalAssets,
      currentLiabilities: cl, nonCurrentLiabilities: ncl, totalLiabilities,
      equity: eq, liabilitiesAndEquity, balanced: Math.abs(totalAssets - liabilitiesAndEquity) < 1,
    }});
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ── Cash flow statement ───────────────────────────────────────────────────────

app.get("/make-server-3f39932e/financial/statements/cash-flow", async (c) => {
  try {
    const { businessId = "biz-001", from, to } = c.req.query();
    let entries: Record<string,unknown>[] = (await kv.get(`fin:bank:${businessId}`)) ?? [];
    if (!entries.length) entries = (await kv.get("fin:bank:drv-001")) ?? [];
    if (from) entries = entries.filter(e => String(e.date) >= from);
    if (to)   entries = entries.filter(e => String(e.date) <= to);
    const credits = (cat: string) => +entries.filter(e => e.category === cat).reduce((s,e) => s + Number(e.credit ?? 0), 0).toFixed(2);
    const debits  = (cat: string) => +entries.filter(e => e.category === cat).reduce((s,e) => s + Number(e.debit  ?? 0), 0).toFixed(2);
    const sorted = [...entries].sort((a,b) => String(a.date).localeCompare(String(b.date)));
    const closingBalance = Number(sorted[sorted.length-1]?.balance ?? 0);
    const cashFromFaresCard = credits("fare_card");
    const cashFromFaresCash = credits("fare_cash");
    const cashPaidDrivers = debits("salary");
    const cashPaidFuel = debits("fuel");
    const cashPaidMaintenance = debits("maintenance");
    const cashPaidLevy = debits("levy");
    const cashPaidInsurance = debits("insurance");
    const loanRepayments = debits("loan_repayment");
    const netOperatingCashFlow = +(cashFromFaresCard + cashFromFaresCash - cashPaidDrivers - cashPaidFuel - cashPaidMaintenance - cashPaidLevy - cashPaidInsurance).toFixed(2);
    const netInvestingCashFlow = 0;
    const netFinancingCashFlow = +(-loanRepayments).toFixed(2);
    const netChangeInCash = +(netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow).toFixed(2);
    return c.json({ success: true, data: {
      businessId, periodStart: from ?? "2024-01-01", periodEnd: to ?? now().split("T")[0],
      openingCashBalance: +(closingBalance - netChangeInCash).toFixed(2),
      cashFromFaresCard, cashFromFaresCash, cashPaidDrivers, cashPaidFuel,
      cashPaidMaintenance, cashPaidLevy, cashPaidInsurance, cashPaidAdmin: 0,
      netOperatingCashFlow, vehiclePurchases: 0, vehicleProceeds: 0, afcDevicePurchases: 0,
      netInvestingCashFlow, loanDrawdowns: 0, loanRepayments, ownerDrawings: 0,
      ownerCapitalInjections: 0, netFinancingCashFlow, netChangeInCash, closingCashBalance: +closingBalance.toFixed(2),
    }});
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ─── CLUB BOOKING SYSTEM ──────────────────────────────────────────────────────
// Group travel — passengers join club routes, VMS pays provider when full
// ══════════════════════════════════════════════════════════════════════════════

async function seedClubBookingData() {
  if (await kv.get("club:seeded")) return;

  await kv.set("club:routes", [
    // ── Flights ──────────────────────────────────────────────────────────────
    {
      id: "cr-001", type: "flight",
      origin: "Cape Town (CPT)", destination: "New York (JFK)",
      departureDate: "2026-07-15", returnDate: "2026-09-15",
      departureTime: "20:30", returnTime: "18:00",
      operator: "South African Airways / United Airlines",
      operatorLogo: "✈️",
      pricePerSeat: 18500, originalPrice: 27000,
      totalSeats: 40, seatsBooked: 28,
      status: "open",
      description: "VMS Club Flight: Cape Town to New York. Join 40 travellers on this club-priced route. Seats are released to Comair/SAA once the group is full.",
      includes: ["Return economy class", "1 × 23kg checked bag", "In-flight meals", "Airport transfers CPT & JFK"],
      route: "CPT → JNB → ATL → JFK",
      duration: "22h 40min",
      visaRequired: true,
      visaCountry: "USA",
      currency: "ZAR",
    },
    {
      id: "cr-002", type: "flight",
      origin: "Cape Town (CPT)", destination: "London (LHR)",
      departureDate: "2026-07-20", returnDate: "2026-08-30",
      departureTime: "21:00", returnTime: "14:30",
      operator: "British Airways / South African Airways",
      operatorLogo: "✈️",
      pricePerSeat: 14800, originalPrice: 22500,
      totalSeats: 35, seatsBooked: 19,
      status: "open",
      description: "VMS Club Flight: Cape Town to London Heathrow. Business and leisure combined — cheapest group rate to the UK.",
      includes: ["Return economy class", "1 × 23kg checked bag", "In-flight meals"],
      route: "CPT → JNB → LHR",
      duration: "14h 20min",
      visaRequired: true,
      visaCountry: "United Kingdom",
      currency: "ZAR",
    },
    {
      id: "cr-003", type: "flight",
      origin: "Cape Town (CPT)", destination: "Dubai (DXB)",
      departureDate: "2026-08-01", returnDate: "2026-08-21",
      departureTime: "22:15", returnTime: "09:45",
      operator: "Emirates",
      operatorLogo: "✈️",
      pricePerSeat: 9200, originalPrice: 15400,
      totalSeats: 50, seatsBooked: 41,
      status: "open",
      description: "VMS Club Flight: Cape Town to Dubai. 20-day package with bulk group pricing via Emirates.",
      includes: ["Return economy class", "2 × 23kg checked bags", "In-flight meals", "Layover lounge access"],
      route: "CPT → DXB",
      duration: "9h 55min",
      visaRequired: false,
      visaCountry: null,
      currency: "ZAR",
    },
    // ── Buses ────────────────────────────────────────────────────────────────
    {
      id: "cr-004", type: "bus",
      origin: "Cape Town", destination: "Pretoria",
      departureDate: "2026-07-15", returnDate: "2026-09-15",
      departureTime: "06:00", returnTime: "07:00",
      operator: "Intercape / Greyhound",
      operatorLogo: "🚌",
      pricePerSeat: 890, originalPrice: 1350,
      totalSeats: 55, seatsBooked: 32,
      status: "open",
      description: "VMS Club Bus: Cape Town to Pretoria. Luxury coach with club-negotiated rates. Departs Cape Town Terminus at 06:00.",
      includes: ["Luxury recliner seat", "Onboard Wi-Fi", "USB charging", "Light refreshments", "Air conditioning"],
      route: "Cape Town → Beaufort West → Three Sisters → Johannesburg → Pretoria",
      duration: "18h 30min",
      visaRequired: false,
      visaCountry: null,
      currency: "ZAR",
    },
    {
      id: "cr-005", type: "bus",
      origin: "Cape Town", destination: "Johannesburg",
      departureDate: "2026-07-15", returnDate: "2026-09-15",
      departureTime: "07:30", returnTime: "08:00",
      operator: "FlixBus / Intercape",
      operatorLogo: "🚌",
      pricePerSeat: 750, originalPrice: 1100,
      totalSeats: 60, seatsBooked: 45,
      status: "open",
      description: "VMS Club Bus: Cape Town to Johannesburg. Non-stop luxury coach service at group rates.",
      includes: ["Luxury recliner seat", "Onboard entertainment", "USB charging", "Air conditioning"],
      route: "Cape Town → Hex River → Matjiesfontein → Three Sisters → Johannesburg Park Station",
      duration: "17h 00min",
      visaRequired: false,
      visaCountry: null,
      currency: "ZAR",
    },
    {
      id: "cr-006", type: "bus",
      origin: "Cape Town", destination: "Durban",
      departureDate: "2026-07-20", returnDate: "2026-09-01",
      departureTime: "05:30", returnTime: "06:00",
      operator: "SA Roadlink",
      operatorLogo: "🚌",
      pricePerSeat: 1050, originalPrice: 1600,
      totalSeats: 50, seatsBooked: 22,
      status: "open",
      description: "VMS Club Bus: Cape Town to Durban. Long-distance luxury service along the Garden Route.",
      includes: ["Luxury recliner seat", "Onboard Wi-Fi", "USB charging", "Air conditioning", "Blanket & pillow"],
      route: "Cape Town → George → Port Elizabeth → East London → Durban",
      duration: "24h 00min",
      visaRequired: false,
      visaCountry: null,
      currency: "ZAR",
    },
  ]);

  await kv.set("club:bookings", []);
  await kv.set("club:visa-applications", []);
  await kv.set("club:seeded", true);
}
await seedClubBookingData();

// ── Club routes ───────────────────────────────────────────────────────────────

app.get("/make-server-3f39932e/club/routes", async (c) => {
  const { type, status } = c.req.query();
  let routes: Record<string,unknown>[] = (await kv.get("club:routes")) ?? [];
  if (type)   routes = routes.filter(r => r.type === type);
  if (status) routes = routes.filter(r => r.status === status);
  // Add seats remaining
  const bookings: Record<string,unknown>[] = (await kv.get("club:bookings")) ?? [];
  routes = routes.map(r => {
    const routeBookings = bookings.filter(b => b.routeId === r.id && b.status !== "cancelled");
    const seatsBooked = routeBookings.reduce((s, b) => s + Number(b.seatCount ?? 1), 0);
    const seatsRemaining = Number(r.totalSeats) - seatsBooked;
    const fillPct = Math.round((seatsBooked / Number(r.totalSeats)) * 100);
    return { ...r, seatsBooked, seatsRemaining, fillPct, full: seatsRemaining <= 0 };
  });
  return c.json({ success: true, data: routes, meta: { total: routes.length } });
});

app.get("/make-server-3f39932e/club/routes/:id", async (c) => {
  const routes: Record<string,unknown>[] = (await kv.get("club:routes")) ?? [];
  const route = routes.find(r => r.id === c.req.param("id"));
  if (!route) return c.json({ success: false, error: "Route not found" }, 404);
  const bookings: Record<string,unknown>[] = (await kv.get("club:bookings")) ?? [];
  const routeBookings = bookings.filter(b => b.routeId === route.id && b.status !== "cancelled");
  const seatsBooked = routeBookings.reduce((s, b) => s + Number(b.seatCount ?? 1), 0);
  return c.json({ success: true, data: { ...route, seatsBooked, seatsRemaining: Number(route.totalSeats) - seatsBooked, passengers: routeBookings.length } });
});

// ── Club bookings ─────────────────────────────────────────────────────────────

app.post("/make-server-3f39932e/club/bookings", async (c) => {
  try {
    const { routeId, passengerName, phone, email, idNumber, seatCount = 1, paymentMethod, specialRequests } = await c.req.json();
    if (!routeId || !passengerName || !phone || !email) return c.json({ success: false, error: "routeId, passengerName, phone, email required" }, 400);
    const routes: Record<string,unknown>[] = (await kv.get("club:routes")) ?? [];
    const route = routes.find(r => r.id === routeId) as Record<string,unknown> | undefined;
    if (!route) return c.json({ success: false, error: "Route not found" }, 404);
    const bookings: Record<string,unknown>[] = (await kv.get("club:bookings")) ?? [];
    const existingSeats = bookings.filter(b => b.routeId === routeId && b.status !== "cancelled").reduce((s,b) => s + Number(b.seatCount ?? 1), 0);
    if (existingSeats + seatCount > Number(route.totalSeats)) return c.json({ success: false, error: `Only ${Number(route.totalSeats) - existingSeats} seats remaining on this route` }, 400);
    const totalAmount = Number(route.pricePerSeat) * seatCount;
    const booking = {
      id: crypto.randomUUID(),
      referenceNumber: `VMS-CB-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`,
      routeId, passengerName, phone, email, idNumber: idNumber ?? null,
      seatCount, totalAmount, paymentMethod: paymentMethod ?? "vink_wallet",
      status: "confirmed", specialRequests: specialRequests ?? "",
      bookedAt: now(),
      // When full, VMS will pay provider — track this
      providerPaid: false, providerPaymentDate: null,
      route: { origin: route.origin, destination: route.destination, departureDate: route.departureDate, returnDate: route.returnDate, type: route.type, operator: route.operator },
    };
    bookings.push(booking);
    await kv.set("club:bookings", bookings);
    // Check if route is now full → trigger provider payment flag
    const newTotal = bookings.filter(b => b.routeId === routeId && b.status !== "cancelled").reduce((s,b) => s + Number(b.seatCount ?? 1), 0);
    if (newTotal >= Number(route.totalSeats)) {
      const updatedRoutes = routes.map(r => r.id === routeId ? { ...r, status: "full", fullAt: now() } : r);
      await kv.set("club:routes", updatedRoutes);
    }
    return c.json({ success: true, data: booking }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

app.get("/make-server-3f39932e/club/bookings", async (c) => {
  const { email, routeId } = c.req.query();
  let bookings: Record<string,unknown>[] = (await kv.get("club:bookings")) ?? [];
  if (email)   bookings = bookings.filter(b => b.email === email);
  if (routeId) bookings = bookings.filter(b => b.routeId === routeId);
  bookings.sort((a,b) => new Date(b.bookedAt as string).getTime() - new Date(a.bookedAt as string).getTime());
  return c.json({ success: true, data: bookings, meta: { total: bookings.length } });
});

app.delete("/make-server-3f39932e/club/bookings/:id", async (c) => {
  const bookings: Record<string,unknown>[] = (await kv.get("club:bookings")) ?? [];
  const idx = bookings.findIndex(b => b.id === c.req.param("id"));
  if (idx < 0) return c.json({ success: false, error: "Booking not found" }, 404);
  bookings[idx] = { ...bookings[idx], status: "cancelled", cancelledAt: now() };
  await kv.set("club:bookings", bookings);
  return c.json({ success: true, message: "Booking cancelled" });
});

// ── Visa applications ─────────────────────────────────────────────────────────

app.post("/make-server-3f39932e/club/visa", async (c) => {
  try {
    const body = await c.req.json();
    const { applicantName, email, phone, passportNumber, passportExpiry, destinationCountry, travelDate, returnDate, purposeOfVisit, accommodation, sponsorDetails, employmentStatus } = body;
    if (!applicantName || !email || !passportNumber || !destinationCountry) return c.json({ success: false, error: "applicantName, email, passportNumber, destinationCountry required" }, 400);
    const visa = {
      id: crypto.randomUUID(),
      referenceNumber: `VMS-VISA-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`,
      applicantName, email, phone, passportNumber, passportExpiry, destinationCountry,
      travelDate, returnDate, purposeOfVisit, accommodation, sponsorDetails, employmentStatus,
      status: "pending_documents",
      submittedAt: now(), updatedAt: now(),
      documentsReceived: [], documentsRequired: [
        "Certified copy of passport (all pages)",
        "Proof of accommodation (hotel booking / invitation letter)",
        "Bank statements (last 3 months)",
        "Proof of employment / business registration",
        "Return flight booking confirmation",
        "Travel insurance certificate",
        "Passport-size photographs (white background)",
      ],
      notes: "Your application has been received. Please submit all required documents to proceed.",
      processingFee: destinationCountry === "USA" ? 4850 : destinationCountry === "United Kingdom" ? 3200 : destinationCountry === "Schengen" ? 2800 : 2000,
      currency: "ZAR",
    };
    const apps: Record<string,unknown>[] = (await kv.get("club:visa-applications")) ?? [];
    apps.push(visa);
    await kv.set("club:visa-applications", apps);
    return c.json({ success: true, data: visa }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

app.get("/make-server-3f39932e/club/visa", async (c) => {
  const { email } = c.req.query();
  let apps: Record<string,unknown>[] = (await kv.get("club:visa-applications")) ?? [];
  if (email) apps = apps.filter(a => a.email === email);
  return c.json({ success: true, data: apps, meta: { total: apps.length } });
});

app.get("/make-server-3f39932e/club/visa/:id", async (c) => {
  const apps: Record<string,unknown>[] = (await kv.get("club:visa-applications")) ?? [];
  const visa = apps.find(a => a.id === c.req.param("id") || a.referenceNumber === c.req.param("id"));
  if (!visa) return c.json({ success: false, error: "Visa application not found" }, 404);
  return c.json({ success: true, data: visa });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS API
// ═══════════════════════════════════════════════════════════════════════════════

async function seedNotifications() {
  const seeded = await kv.get("notif:seeded");
  if (seeded) return;
  const demos = [
    { id: "n1", type: "transaction", title: "Money Received", body: "R12,500.00 credited from Employer Payroll", icon: "💸", is_read: false, created_at: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: "n2", type: "security", title: "New Device Login", body: "Sign-in from Chrome on MacBook Pro detected", icon: "🔒", is_read: false, created_at: new Date(Date.now() - 32 * 60000).toISOString() },
    { id: "n3", type: "travel", title: "Club Booking Confirmed", body: "Cape Town → New York (15 Jul 2026) — Ref: VMS-CB-2026-48291", icon: "✈️", is_read: false, created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: "n4", type: "kyc", title: "KYC Verification Approved", body: "Your identity has been verified. Full access unlocked.", icon: "✅", is_read: true, created_at: new Date(Date.now() - 6 * 3600000).toISOString() },
    { id: "n5", type: "promotion", title: "Double VinkPoints This Weekend", body: "Earn 2x VinkPoints on all card purchases Fri–Sun", icon: "⭐", is_read: true, created_at: new Date(Date.now() - 24 * 3600000).toISOString() },
    { id: "n6", type: "loan", title: "Loan Application Update", body: "Personal Loan VMS-PL-2026-33847 is under review. Decision within 24h.", icon: "📋", is_read: true, created_at: new Date(Date.now() - 48 * 3600000).toISOString() },
  ];
  await kv.set("notif:demo", demos);
  await kv.set("notif:seeded", true);
}
seedNotifications();

app.get("/make-server-3f39932e/notifications", async (c) => {
  const { profile_id, unread_only } = c.req.query();
  let notifs: Record<string,unknown>[] = (await kv.get("notif:demo")) ?? [];
  if (unread_only === "true") notifs = notifs.filter(n => !n.is_read);
  return c.json({ success: true, data: notifs, meta: { total: notifs.length, unread: notifs.filter(n => !n.is_read).length } });
});

app.patch("/make-server-3f39932e/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  const notifs: Record<string,unknown>[] = (await kv.get("notif:demo")) ?? [];
  const updated = notifs.map(n => n.id === id ? { ...n, is_read: true, read_at: now() } : n);
  await kv.set("notif:demo", updated);
  return c.json({ success: true });
});

app.post("/make-server-3f39932e/notifications/mark-all-read", async (c) => {
  const notifs: Record<string,unknown>[] = (await kv.get("notif:demo")) ?? [];
  const updated = notifs.map(n => ({ ...n, is_read: true, read_at: now() }));
  await kv.set("notif:demo", updated);
  return c.json({ success: true, updated: updated.length });
});

app.post("/make-server-3f39932e/notifications", async (c) => {
  try {
    const body = await c.req.json();
    const notif = {
      id: crypto.randomUUID(),
      ...body,
      is_read: false,
      created_at: now(),
    };
    const notifs: Record<string,unknown>[] = (await kv.get("notif:demo")) ?? [];
    notifs.unshift(notif);
    await kv.set("notif:demo", notifs.slice(0, 100));
    return c.json({ success: true, data: notif }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPORT TICKETS API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/support/tickets", async (c) => {
  const { email } = c.req.query();
  let tickets: Record<string,unknown>[] = (await kv.get("support:tickets")) ?? [];
  if (email) tickets = tickets.filter(t => t.email === email);
  return c.json({ success: true, data: tickets, meta: { total: tickets.length } });
});

app.post("/make-server-3f39932e/support/tickets", async (c) => {
  try {
    const body = await c.req.json();
    const ticket = {
      id: crypto.randomUUID(),
      ticketNumber: `TKT-${Math.floor(1000000 + Math.random() * 9000000)}`,
      status: "open",
      priority: body.priority ?? "normal",
      createdAt: now(),
      updatedAt: now(),
      ...body,
    };
    const tickets: Record<string,unknown>[] = (await kv.get("support:tickets")) ?? [];
    tickets.unshift(ticket);
    await kv.set("support:tickets", tickets);
    return c.json({ success: true, data: ticket }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

app.post("/make-server-3f39932e/support/tickets/:id/messages", async (c) => {
  try {
    const body = await c.req.json();
    const msg = { id: crypto.randomUUID(), ticketId: c.req.param("id"), ...body, createdAt: now() };
    const msgs: Record<string,unknown>[] = (await kv.get("support:messages")) ?? [];
    msgs.push(msg);
    await kv.set("support:messages", msgs);
    return c.json({ success: true, data: msg }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER PROFILE API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/profile/:id", async (c) => {
  const profile = await kv.get(`profile:${c.req.param("id")}`);
  if (!profile) return c.json({ success: false, error: "Profile not found" }, 404);
  return c.json({ success: true, data: profile });
});

app.put("/make-server-3f39932e/profile/:id", async (c) => {
  try {
    const body = await c.req.json();
    const existing: Record<string,unknown> = (await kv.get(`profile:${c.req.param("id")}`)) ?? {};
    const updated = { ...existing, ...body, updatedAt: now() };
    await kv.set(`profile:${c.req.param("id")}`, updated);
    return c.json({ success: true, data: updated });
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VINKPOINTS API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/vinkpoints/:profileId", async (c) => {
  const pts = await kv.get(`vinkpoints:${c.req.param("profileId")}`);
  const data = pts ?? {
    profileId: c.req.param("profileId"),
    balance: 14820,
    lifetimeTotal: 28450,
    tier: "gold",
    tierProgress: 68,
    nextTier: "platinum",
    pointsToNextTier: 5180,
    expiringPoints: 500,
    expiryDate: "2026-12-31",
  };
  return c.json({ success: true, data });
});

app.post("/make-server-3f39932e/vinkpoints/:profileId/earn", async (c) => {
  try {
    const body = await c.req.json();
    const current: Record<string,unknown> = (await kv.get(`vinkpoints:${c.req.param("profileId")}`)) ?? { balance: 14820, lifetimeTotal: 28450 };
    const newBalance = (current.balance as number) + (body.points as number);
    const updated = { ...current, balance: newBalance, lifetimeTotal: (current.lifetimeTotal as number) + (body.points as number), updatedAt: now() };
    await kv.set(`vinkpoints:${c.req.param("profileId")}`, updated);
    return c.json({ success: true, data: updated });
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

app.post("/make-server-3f39932e/vinkpoints/:profileId/redeem", async (c) => {
  try {
    const body = await c.req.json();
    const current: Record<string,unknown> = (await kv.get(`vinkpoints:${c.req.param("profileId")}`)) ?? { balance: 14820 };
    if ((current.balance as number) < (body.points as number)) {
      return c.json({ success: false, error: "Insufficient VinkPoints" }, 400);
    }
    const updated = { ...current, balance: (current.balance as number) - (body.points as number), updatedAt: now() };
    await kv.set(`vinkpoints:${c.req.param("profileId")}`, updated);
    return c.json({ success: true, data: updated, cashValue: ((body.points as number) / 100).toFixed(2) });
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// KYC API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/kyc/:profileId", async (c) => {
  const kyc = await kv.get(`kyc:${c.req.param("profileId")}`);
  const data = kyc ?? {
    profileId: c.req.param("profileId"),
    status: "partial",
    tier: "basic",
    steps: {
      email: { done: true, doneAt: "2024-03-12T09:00:00Z" },
      phone: { done: true, doneAt: "2024-03-12T09:05:00Z" },
      id: { done: true, doneAt: "2024-03-12T09:10:00Z" },
      selfie: { done: true, doneAt: "2024-03-12T09:12:00Z" },
      address: { done: false },
      enhanced: { done: false },
    },
    completionPct: 67,
    riskLevel: "low",
    pepScreened: true,
    sanctionsScreened: true,
    updatedAt: now(),
  };
  return c.json({ success: true, data });
});

app.post("/make-server-3f39932e/kyc/:profileId/submit", async (c) => {
  try {
    const body = await c.req.json();
    const existing: Record<string,unknown> = (await kv.get(`kyc:${c.req.param("profileId")}`)) ?? {};
    const updated = { ...existing, ...body, submittedAt: now(), status: "pending" };
    await kv.set(`kyc:${c.req.param("profileId")}`, updated);
    return c.json({ success: true, data: updated, referenceNumber: `VMS-KYC-${Math.floor(100000 + Math.random() * 900000)}` });
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FX RATES API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/fx/rates", async (c) => {
  return c.json({
    success: true,
    data: [
      { from: "ZAR", to: "USD", interbank: 0.0545, customer: 0.0540, spread: 0.92, flag: "🇺🇸" },
      { from: "ZAR", to: "EUR", interbank: 0.0502, customer: 0.0497, spread: 1.00, flag: "🇪🇺" },
      { from: "ZAR", to: "GBP", interbank: 0.0431, customer: 0.0426, spread: 1.16, flag: "🇬🇧" },
      { from: "ZAR", to: "CNY", interbank: 0.3950, customer: 0.3910, spread: 1.01, flag: "🇨🇳" },
      { from: "ZAR", to: "ZMW", interbank: 1.4820, customer: 1.4673, spread: 0.99, flag: "🇿🇲" },
      { from: "ZAR", to: "AED", interbank: 0.2001, customer: 0.1981, spread: 1.00, flag: "🇦🇪" },
      { from: "USD", to: "ZAR", interbank: 18.35, customer: 18.17, spread: 0.98, flag: "🇿🇦" },
      { from: "EUR", to: "ZAR", interbank: 19.93, customer: 19.73, spread: 1.00, flag: "🇿🇦" },
      { from: "GBP", to: "ZAR", interbank: 23.20, customer: 22.97, spread: 1.00, flag: "🇿🇦" },
    ],
    updatedAt: now(),
    source: "VMS Treasury · Interbank mid-rate",
  });
});

app.post("/make-server-3f39932e/fx/convert", async (c) => {
  try {
    const { from, to, amount } = await c.req.json();
    const rates: Record<string, number> = {
      "ZAR-USD": 0.0540, "ZAR-EUR": 0.0497, "ZAR-GBP": 0.0426, "ZAR-CNY": 0.391,
      "ZAR-ZMW": 1.467, "USD-ZAR": 18.17, "EUR-ZAR": 19.73, "GBP-ZAR": 22.97,
    };
    const key = `${from}-${to}`;
    const rate = rates[key];
    if (!rate) return c.json({ success: false, error: `Rate for ${from}→${to} not available` }, 400);
    const converted = parseFloat(amount) * rate;
    const fee = converted * 0.005;
    return c.json({
      success: true,
      from, to, amount: parseFloat(amount),
      rate, converted: parseFloat(converted.toFixed(4)),
      fee: parseFloat(fee.toFixed(4)),
      netConverted: parseFloat((converted - fee).toFixed(4)),
      reference: refNo("VMS-FX"),
      timestamp: now(),
    });
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BRANCH LOCATOR API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/branches", (c) => {
  return c.json({
    success: true,
    data: [
      { id: "b1", name: "VMS Cape Town CBD",       address: "24 Buitenkant Street, Cape Town CBD, 8001",   lat: -33.9249, lng: 18.4241, phone: "+27 21 007 0001", hours: "Mon–Fri 08:00–17:00, Sat 09:00–13:00", services: ["Full Banking","KYC","Loans","Cards","ATM"], atm: true, status: "open" },
      { id: "b2", name: "VMS Johannesburg Sandton", address: "Sandton City, 83 Rivonia Rd, Sandton, 2196",  lat: -26.1076, lng: 28.0567, phone: "+27 11 007 0001", hours: "Mon–Fri 08:00–17:00, Sat 09:00–13:00", services: ["Full Banking","KYC","Loans","Corporate","ATM"], atm: true, status: "open" },
      { id: "b3", name: "VMS Durban Umhlanga",      address: "La Lucia Mall, La Lucia Ridge, Durban, 4051", lat: -29.7374, lng: 31.0783, phone: "+27 31 007 0001", hours: "Mon–Fri 08:00–17:00, Sat 09:00–13:00", services: ["Full Banking","KYC","Loans","Cards","ATM"], atm: true, status: "open" },
      { id: "b4", name: "VMS Pretoria Hatfield",    address: "Hatfield Plaza, Burnett Street, Pretoria, 0083", lat: -25.7461, lng: 28.2393, phone: "+27 12 007 0001", hours: "Mon–Fri 08:00–17:00, Sat 09:00–13:00", services: ["Full Banking","KYC","Loans","ATM"], atm: true, status: "open" },
      { id: "b5", name: "VMS Cape Town Bellville",  address: "Voortrekker Road, Bellville, 7530",          lat: -33.9290, lng: 18.6324, phone: "+27 21 007 0002", hours: "Mon–Fri 08:00–17:00, Sat 09:00–13:00", services: ["Full Banking","AFC Support","ATM"], atm: true, status: "open" },
      { id: "b6", name: "VMS Lusaka Zambia",        address: "Cairo Road, Lusaka, Zambia",                  lat: -15.4167, lng: 28.2833, phone: "+260 211 007 001", hours: "Mon–Fri 08:00–16:30", services: ["Full Banking","KYC","ATM","Mobile Money"], atm: true, status: "open" },
    ],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AFC MANAGEMENT — EXTENDED API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/afc/fleet", async (c) => {
  return c.json({
    success: true,
    data: {
      totalDevices: 847,
      activeDevices: 821,
      offlineDevices: 26,
      totalTapsToday: 12847,
      totalRevenueToday: 180128.00,
      avgProcessingMs: 342,
      approvalRate: 96.4,
      pendingBatches: 143,
      routes: [
        { id: "r1", name: "Khayelitsha → Cape Town CBD", activeVehicles: 38, tapsToday: 1247, revenue: 17458 },
        { id: "r2", name: "Mitchell's Plain → Bellville", activeVehicles: 29, tapsToday: 987, revenue: 11354 },
        { id: "r3", name: "Gugulethu → Claremont", activeVehicles: 24, tapsToday: 823, revenue: 10699 },
        { id: "r4", name: "Langa → Observatory", activeVehicles: 19, tapsToday: 654, revenue: 6540 },
        { id: "r5", name: "Nyanga → Wynberg", activeVehicles: 22, tapsToday: 741, revenue: 9263 },
      ],
    },
  });
});

app.post("/make-server-3f39932e/afc/tap", async (c) => {
  try {
    const body = await c.req.json();
    const fare = body.fare ?? 14.00;
    const processingMs = Math.floor(280 + Math.random() * 300);
    const approved = Math.random() > 0.04;
    const tap = {
      id: crypto.randomUUID(),
      deviceId: body.deviceId ?? "SN-88291",
      driverId: body.driverId ?? "DRV-001",
      vehicleReg: body.vehicleReg ?? "CA 123-456",
      passengerCard: `•••• ${Math.floor(1000 + Math.random() * 9000)}`,
      fare,
      processingMs,
      path: processingMs < 500 ? "offline" : "online_fast",
      status: approved ? "approved" : "declined",
      authCode: approved ? Math.floor(100000 + Math.random() * 900000).toString() : null,
      // Revenue split
      splits: {
        passenger: 0.50,
        driver: 0.50,
        vms: 1.00,
        investor: 0.10,
      },
      timestamp: now(),
    };
    const taps: Record<string,unknown>[] = (await kv.get("afc:taps:today")) ?? [];
    taps.unshift(tap);
    await kv.set("afc:taps:today", taps.slice(0, 500));
    return c.json({ success: true, data: tap }, 201);
  } catch (err) { return c.json({ success: false, error: String(err) }, 500); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INVESTOR PORTFOLIO API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/investor/:profileId/portfolio", async (c) => {
  return c.json({
    success: true,
    data: {
      profileId: c.req.param("profileId"),
      deviceCount: 12,
      totalInvested: 36000.00,
      totalEarned: 18420.00,
      monthlyRentalIncome: 3000.00,
      perTapIncome30d: 1482.00,
      totalTaps30d: 14820,
      portfolioValue: 54420.00,
      roiPct: 51.2,
      devices: [
        { serial: "SN-88291", vehicle: "CA 482-932", route: "Khayelitsha → CBD", tapsToday: 47, earnedToday: 4.70, status: "active" },
        { serial: "SN-88292", vehicle: "CA 283-841", route: "Mitchell's Plain → Bellville", tapsToday: 38, earnedToday: 3.80, status: "active" },
        { serial: "SN-88293", vehicle: "CA 921-483", route: "Gugulethu → Claremont", tapsToday: 52, earnedToday: 5.20, status: "active" },
      ],
      monthlyBreakdown: [
        { month: "Jan 2026", rental: 3000, taps: 1240, total: 4240 },
        { month: "Feb 2026", rental: 3000, taps: 1180, total: 4180 },
        { month: "Mar 2026", rental: 3000, taps: 1320, total: 4320 },
        { month: "Apr 2026", rental: 3000, taps: 1190, total: 4190 },
        { month: "May 2026", rental: 3000, taps: 1280, total: 4280 },
        { month: "Jun 2026", rental: 3000, taps: 482, total: 3482 },
      ],
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RIDE-HAILING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

type RideStatus = "requested"|"assigned"|"driver_enroute"|"arrived"|"in_progress"|"completed"|"cancelled";
interface RidePassenger { id:string; name:string; phone:string; rating:number; totalTrips:number; }
interface RideDriver { id:string; name:string; phone:string; vehicleType:string; vehicleMake:string; vehicleModel:string; vehiclePlate:string; rating:number; totalTrips:number; status:"online"|"offline"|"on_trip"; lat:number; lng:number; }
interface RideTrip { id:string; passengerId:string; passengerName:string; driverId?:string; driverName?:string; driverPlate?:string; vehicleType:string; pickupAddress:string; pickupLat:number; pickupLng:number; destinationAddress:string; destinationLat:number; destinationLng:number; status:RideStatus; estimatedFare:number; finalFare?:number; distanceKm:number; durationMin:number; paymentMethod:string; promoCode?:string; medicalNote?:string; requestedAt:string; completedAt?:string; passengerRating?:number; driverRating?:number; surgeMultiplier:number; }
interface RideMessage { id:string; tripId:string; senderId:string; senderRole:string; senderName:string; text:string; timestamp:string; }

const rideKV = {
  passengers: new Map<string,RidePassenger>(),
  drivers:    new Map<string,RideDriver>(),
  trips:      new Map<string,RideTrip>(),
  messages:   new Map<string,RideMessage[]>(),
};

function seedRideData() {
  if (rideKV.passengers.size > 0) return;
  rideKV.passengers.set("pax-001", { id:"pax-001", name:"Nomsa Zulu",    phone:"+27 82 334 7821", rating:4.8, totalTrips:47 });
  rideKV.passengers.set("pax-002", { id:"pax-002", name:"Thabo Dlamini", phone:"+27 73 901 2345", rating:4.6, totalTrips:23 });
  rideKV.drivers.set("drv-101", { id:"drv-101", name:"Sipho Dlamini",    phone:"+27 82 111 2233", vehicleType:"standard", vehicleMake:"Toyota", vehicleModel:"Corolla Quest", vehiclePlate:"CA 847-891", rating:4.9, totalTrips:1847, status:"online",  lat:-33.932, lng:18.423 });
  rideKV.drivers.set("drv-102", { id:"drv-102", name:"Priya Naidoo",     phone:"+27 83 445 6677", vehicleType:"premium",  vehicleMake:"VW",     vehicleModel:"Passat",        vehiclePlate:"CA 221-445", rating:4.8, totalTrips:924,  status:"online",  lat:-33.918, lng:18.428 });
  rideKV.drivers.set("drv-103", { id:"drv-103", name:"James van Berg",   phone:"+27 84 889 9001", vehicleType:"xl",       vehicleMake:"Toyota", vehicleModel:"HiAce",         vehiclePlate:"CA 334-567", rating:4.7, totalTrips:2103, status:"offline", lat:-33.951, lng:18.466 });
}
seedRideData();

function calcFare(distKm: number, vehicleType: string, surge = 1): number {
  const rates: Record<string,{base:number;perKm:number}> = { standard:{base:7,perKm:3.5}, premium:{base:12,perKm:6}, xl:{base:15,perKm:7}, accessible:{base:10,perKm:4.5} };
  const r = rates[vehicleType] ?? rates.standard;
  return Math.round((r.base + r.perKm * distKm) * surge * 100) / 100;
}
function haversine(lat1:number,lng1:number,lat2:number,lng2:number): number {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*10)/10;
}

app.get("/make-server-3f39932e/ride/passengers", (c) => c.json({ success:true, data:[...rideKV.passengers.values()] }));
app.get("/make-server-3f39932e/ride/passengers/:id", (c) => { const p=rideKV.passengers.get(c.req.param("id")); return p ? c.json({success:true,data:p}) : c.json({success:false,error:"Not found"},404); });

app.get("/make-server-3f39932e/ride/drivers", (c) => {
  const status = c.req.query("status");
  let drivers = [...rideKV.drivers.values()];
  if (status) drivers = drivers.filter(d => d.status === status);
  return c.json({ success:true, data:drivers });
});
app.patch("/make-server-3f39932e/ride/drivers/:id/status", async (c) => {
  const drv = rideKV.drivers.get(c.req.param("id"));
  if (!drv) return c.json({success:false,error:"Not found"},404);
  const { status } = await c.req.json().catch(() => ({}));
  const updated = { ...drv, status: status ?? drv.status };
  rideKV.drivers.set(drv.id, updated as RideDriver);
  return c.json({ success:true, data:updated });
});

app.post("/make-server-3f39932e/ride/estimate", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const { pickupLat=0, pickupLng=0, destinationLat=0, destinationLng=0 } = b;
  const dist = haversine(pickupLat, pickupLng, destinationLat, destinationLng);
  const types = ["standard","premium","xl","accessible"];
  const estimates = types.map(t => ({ vehicleType:t, estimatedFare:calcFare(dist,t), distanceKm:dist, etaMinutes:Math.round(3+Math.random()*8), surgeMultiplier:1 }));
  return c.json({ success:true, data:estimates });
});

app.post("/make-server-3f39932e/ride/request", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const { passengerId="pax-001", passengerName="Guest", passengerPhone="", vehicleType="standard", pickupAddress="", pickupLat=0, pickupLng=0, destinationAddress="", destinationLat=0, destinationLng=0, paymentMethod="card", promoCode, medicalNote } = b;
  const driver = [...rideKV.drivers.values()].find(d => d.status === "online" && d.vehicleType === vehicleType) ?? [...rideKV.drivers.values()].find(d => d.status === "online");
  const dist = haversine(pickupLat, pickupLng, destinationLat, destinationLng) || 8.4;
  const fare = calcFare(dist, vehicleType);
  const id = "trip-" + Date.now();
  const trip: RideTrip = { id, passengerId, passengerName, passengerPhone, driverId:driver?.id, driverName:driver?.name, driverPlate:driver?.vehiclePlate, vehicleType, pickupAddress, pickupLat, pickupLng, destinationAddress, destinationLat, destinationLng, status: driver ? "assigned" : "requested", estimatedFare:fare, distanceKm:dist, durationMin:Math.round(dist*2.5), paymentMethod, promoCode, medicalNote, requestedAt:new Date().toISOString(), surgeMultiplier:1 };
  rideKV.trips.set(id, trip);
  if (driver) { rideKV.drivers.set(driver.id, { ...driver, status:"on_trip" } as RideDriver); }
  return c.json({ success:true, data:trip });
});

app.get("/make-server-3f39932e/ride/trips", (c) => {
  const { passengerId, driverId, status, limit="20" } = c.req.query();
  let trips = [...rideKV.trips.values()].sort((a,b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  if (passengerId) trips = trips.filter(t => t.passengerId === passengerId);
  if (driverId)    trips = trips.filter(t => t.driverId   === driverId);
  if (status)      trips = trips.filter(t => t.status     === status);
  return c.json({ success:true, data:trips.slice(0, Number(limit)) });
});
app.get("/make-server-3f39932e/ride/trips/:id", (c) => { const t=rideKV.trips.get(c.req.param("id")); return t ? c.json({success:true,data:t}) : c.json({success:false,error:"Not found"},404); });

app.patch("/make-server-3f39932e/ride/trips/:id/status", async (c) => {
  const trip = rideKV.trips.get(c.req.param("id"));
  if (!trip) return c.json({success:false,error:"Not found"},404);
  const { status, cancelReason } = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const updates: Partial<RideTrip> = { status };
  if (status === "completed") { updates.completedAt = now; updates.finalFare = trip.estimatedFare; if (trip.driverId) { const drv=rideKV.drivers.get(trip.driverId); if(drv) rideKV.drivers.set(drv.id,{...drv,status:"online"} as RideDriver); } }
  if (status === "cancelled") { if (trip.driverId) { const drv=rideKV.drivers.get(trip.driverId); if(drv) rideKV.drivers.set(drv.id,{...drv,status:"online"} as RideDriver); } }
  const updated = { ...trip, ...updates };
  rideKV.trips.set(trip.id, updated as RideTrip);
  return c.json({ success:true, data:updated });
});

app.post("/make-server-3f39932e/ride/trips/:id/rate", async (c) => {
  const trip = rideKV.trips.get(c.req.param("id"));
  if (!trip) return c.json({success:false,error:"Not found"},404);
  const { raterRole, rating, review } = await c.req.json().catch(() => ({}));
  const updates = raterRole === "passenger" ? { passengerRating: rating } : { driverRating: rating };
  const updated = { ...trip, ...updates };
  rideKV.trips.set(trip.id, updated as RideTrip);
  return c.json({ success:true, data:updated });
});

app.get("/make-server-3f39932e/ride/messages/:tripId", (c) => {
  const msgs = rideKV.messages.get(c.req.param("tripId")) ?? [];
  return c.json({ success:true, data:msgs });
});
app.post("/make-server-3f39932e/ride/messages/:tripId", async (c) => {
  const { senderId="", senderRole="passenger", senderName="User", text="" } = await c.req.json().catch(() => ({}));
  const msg: RideMessage = { id:"msg-"+Date.now(), tripId:c.req.param("tripId"), senderId, senderRole, senderName, text, timestamp:new Date().toISOString() };
  const existing = rideKV.messages.get(msg.tripId) ?? [];
  rideKV.messages.set(msg.tripId, [...existing, msg]);
  return c.json({ success:true, data:msg });
});

app.post("/make-server-3f39932e/ride/calls/:tripId", async (c) => {
  const { callerId="", callerRole="passenger" } = await c.req.json().catch(() => ({}));
  return c.json({ success:true, data:{ callId:"call-"+Date.now(), tripId:c.req.param("tripId"), callerId, callerRole, startedAt:new Date().toISOString(), masked:true } });
});

app.post("/make-server-3f39932e/ride/promo/validate", async (c) => {
  const { code="", fare=100 } = await c.req.json().catch(() => ({}));
  const promos: Record<string,{type:"pct"|"fixed";value:number;min:number}> = { "VINK10":{type:"pct",value:10,min:50}, "FIRST50":{type:"fixed",value:50,min:60}, "SAFE20":{type:"fixed",value:20,min:80} };
  const promo = promos[code.toUpperCase()];
  if (!promo) return c.json({success:false,error:"Invalid promo code"});
  if (fare < promo.min) return c.json({success:false,error:`Minimum fare R${promo.min} required`});
  const discount = promo.type === "pct" ? Math.round(fare * promo.value/100 * 100)/100 : promo.value;
  return c.json({ success:true, data:{ code:code.toUpperCase(), discountAmount:discount, newFare:Math.max(0,fare-discount), type:promo.type } });
});

app.get("/make-server-3f39932e/ride/admin/stats", (c) => {
  const trips = [...rideKV.trips.values()];
  return c.json({ success:true, data:{ totalTrips:trips.length, activeTrips:trips.filter(t=>["assigned","driver_enroute","arrived","in_progress"].includes(t.status)).length, onlineDrivers:[...rideKV.drivers.values()].filter(d=>d.status!=="offline").length, totalRevenue:trips.filter(t=>t.status==="completed").reduce((s,t)=>s+(t.finalFare??t.estimatedFare),0) } });
});

app.get("/make-server-3f39932e/ride/surge", (c) => c.json({ success:true, data:{ multiplier:1.0, reason:"Normal demand", activeAt:new Date().toISOString() } }));

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH API (unified search across all entities)
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/make-server-3f39932e/search", async (c) => {
  const { q } = c.req.query();
  if (!q || q.length < 2) return c.json({ success: true, data: [] });
  const query = q.toLowerCase();
  const results: Record<string,unknown>[] = [];

  // Search products
  const products = [
    { type: "product", category: "Personal", title: "Everyday Account", desc: "Zero-fee transactional account", url: "account" },
    { type: "product", category: "Personal", title: "Credit Card", desc: "Up to R200,000 credit limit", url: "creditCard" },
    { type: "product", category: "Personal", title: "Personal Loan", desc: "Up to R500,000 at competitive rates", url: "loan" },
    { type: "product", category: "Business", title: "Business Account", desc: "Transactional account for your business", url: "bizAccount" },
    { type: "product", category: "Corporate", title: "Corporate Loan", desc: "R1M–R5B project and structured finance", url: "corpLoan" },
    { type: "travel", category: "Club Travel", title: "Cape Town → New York", desc: "15 Jul 2026 · R18,500 · 26 seats left", url: "clubTravel" },
    { type: "travel", category: "Club Travel", title: "Cape Town → London", desc: "20 Jul 2026 · R14,800 · 27 seats left", url: "clubTravel" },
    { type: "support", category: "Help", title: "How to freeze my card", desc: "Learn how to temporarily freeze your card", url: "support" },
    { type: "support", category: "Help", title: "International transfers", desc: "Send money abroad in 5 currencies", url: "globalBanking" },
    { type: "app", category: "App", title: "Vink Go (Passenger App)", desc: "Download on iOS & Android", url: "passengerApp" },
    { type: "app", category: "App", title: "Vink Driver App", desc: "For taxi and e-hailing drivers", url: "driverApp" },
  ];
  const matched = products.filter(p =>
    p.title.toLowerCase().includes(query) ||
    p.desc.toLowerCase().includes(query) ||
    p.category.toLowerCase().includes(query)
  );
  results.push(...matched.slice(0, 8));
  return c.json({ success: true, data: results, query: q, total: results.length });
});

// ─── SA MUNICIPALITIES ────────────────────────────────────────────────────────
// 256 municipalities across 9 provinces (Emalahleni appears in both Eastern Cape & Mpumalanga) — Metropolitan, District, Local
// Source: Municipal Demarcation Board / CoGTA 2024

const MUNICIPALITIES_DATA: Record<string, Array<{ name: string; type: "Metropolitan" | "District" | "Local" }>> = {
  "Eastern Cape": [
    { name: "Buffalo City Metropolitan Municipality",          type: "Metropolitan" },
    { name: "Nelson Mandela Bay Metropolitan Municipality",    type: "Metropolitan" },
    { name: "Alfred Nzo District Municipality",                type: "District" },
    { name: "Amathole District Municipality",                  type: "District" },
    { name: "Chris Hani District Municipality",                type: "District" },
    { name: "Joe Gqabi District Municipality",                 type: "District" },
    { name: "OR Tambo District Municipality",                  type: "District" },
    { name: "Sarah Baartman District Municipality",            type: "District" },
    { name: "Amahlathi Local Municipality",                    type: "Local" },
    { name: "Blue Crane Route Local Municipality",             type: "Local" },
    { name: "Dr AB Xuma Local Municipality",                   type: "Local" },
    { name: "Dr Beyers Naudé Local Municipality",              type: "Local" },
    { name: "Elundini Local Municipality",                     type: "Local" },
    { name: "Emalahleni Local Municipality",                   type: "Local" },
    { name: "Enoch Mgijima Local Municipality",                type: "Local" },
    { name: "Great Kei Local Municipality",                    type: "Local" },
    { name: "Ingquza Hill Local Municipality",                 type: "Local" },
    { name: "Intsika Yethu Local Municipality",                type: "Local" },
    { name: "Inxuba Yethemba Local Municipality",              type: "Local" },
    { name: "King Sabata Dalindyebo Local Municipality",       type: "Local" },
    { name: "KouKamma Local Municipality",                     type: "Local" },
    { name: "Kouga Local Municipality",                        type: "Local" },
    { name: "Makana Local Municipality",                       type: "Local" },
    { name: "Matatiele Local Municipality",                    type: "Local" },
    { name: "Mbhashe Local Municipality",                      type: "Local" },
    { name: "Mhlontlo Local Municipality",                     type: "Local" },
    { name: "Mnquma Local Municipality",                       type: "Local" },
    { name: "Ndlambe Local Municipality",                      type: "Local" },
    { name: "Ngqushwa Local Municipality",                     type: "Local" },
    { name: "Ntabankulu Local Municipality",                   type: "Local" },
    { name: "Nyandeni Local Municipality",                     type: "Local" },
    { name: "Port St Johns Local Municipality",                type: "Local" },
    { name: "Raymond Mhlaba Local Municipality",               type: "Local" },
    { name: "Sakhisizwe Local Municipality",                   type: "Local" },
    { name: "Senqu Local Municipality",                        type: "Local" },
    { name: "Sunday's River Valley Local Municipality",        type: "Local" },
    { name: "Umzimvubu Local Municipality",                    type: "Local" },
    { name: "Walter Sisulu Local Municipality",                type: "Local" },
    { name: "Winnie Madikizela-Mandela Local Municipality",    type: "Local" },
  ],
  "Free State": [
    { name: "Mangaung Metropolitan Municipality",              type: "Metropolitan" },
    { name: "Fezile Dabi District Municipality",               type: "District" },
    { name: "Lejweleputswa District Municipality",             type: "District" },
    { name: "Thabo Mofutsanyana District Municipality",        type: "District" },
    { name: "Xhariep District Municipality",                   type: "District" },
    { name: "Dihlabeng Local Municipality",                    type: "Local" },
    { name: "Kopanong Local Municipality",                     type: "Local" },
    { name: "Letsemeng Local Municipality",                    type: "Local" },
    { name: "Mafube Local Municipality",                       type: "Local" },
    { name: "Maluti-a-Phofung Local Municipality",             type: "Local" },
    { name: "Mantsopa Local Municipality",                     type: "Local" },
    { name: "Masilonyana Local Municipality",                  type: "Local" },
    { name: "Matjhabeng Local Municipality",                   type: "Local" },
    { name: "Metsimaholo Local Municipality",                  type: "Local" },
    { name: "Mohokare Local Municipality",                     type: "Local" },
    { name: "Moqhaka Local Municipality",                      type: "Local" },
    { name: "Nala Local Municipality",                         type: "Local" },
    { name: "Ngwathe Local Municipality",                      type: "Local" },
    { name: "Nketoana Local Municipality",                     type: "Local" },
    { name: "Phumelela Local Municipality",                    type: "Local" },
    { name: "Setsoto Local Municipality",                      type: "Local" },
    { name: "Tokologo Local Municipality",                     type: "Local" },
    { name: "Tswelopele Local Municipality",                   type: "Local" },
  ],
  "Gauteng": [
    { name: "City of Johannesburg Metropolitan Municipality",  type: "Metropolitan" },
    { name: "City of Tshwane Metropolitan Municipality",       type: "Metropolitan" },
    { name: "Sedibeng District Municipality",                  type: "District" },
    { name: "West Rand District Municipality",                 type: "District" },
    { name: "City of Ekurhuleni",                              type: "Local" },
    { name: "Emfuleni Local Municipality",                     type: "Local" },
    { name: "Lesedi Local Municipality",                       type: "Local" },
    { name: "Merafong Local Municipality",                     type: "Local" },
    { name: "Midvaal Local Municipality",                      type: "Local" },
    { name: "Mogale City Local Municipality",                  type: "Local" },
    { name: "Rand West City Local Municipality",               type: "Local" },
  ],
  "KwaZulu-Natal": [
    { name: "eThekwini Metropolitan Municipality",             type: "Metropolitan" },
    { name: "Amajuba District Municipality",                   type: "District" },
    { name: "Harry Gwala District Municipality",               type: "District" },
    { name: "King Cetshwayo District Municipality",            type: "District" },
    { name: "Ugu District Municipality",                       type: "District" },
    { name: "Zululand District Municipality",                  type: "District" },
    { name: "iLembe District Municipality",                    type: "District" },
    { name: "uMgungundlovu District Municipality",             type: "District" },
    { name: "uMkhanyakude District Municipality",              type: "District" },
    { name: "uMzinyathi District Municipality",                type: "District" },
    { name: "uThukela District Municipality",                  type: "District" },
    { name: "AbaQulusi Local Municipality",                    type: "Local" },
    { name: "Alfred Duma Local Municipality",                  type: "Local" },
    { name: "Big 5 Hlabisa Local Municipality",                type: "Local" },
    { name: "City of uMhlathuze Local Municipality",           type: "Local" },
    { name: "Dannhauser Local Municipality",                   type: "Local" },
    { name: "Dr Nkosazana Dlamini Zuma Local Municipality",    type: "Local" },
    { name: "Emadlangeni Local Municipality",                  type: "Local" },
    { name: "Endumeni Local Municipality",                     type: "Local" },
    { name: "Greater Kokstad Local Municipality",              type: "Local" },
    { name: "Impendle Local Municipality",                     type: "Local" },
    { name: "Inkosi Langalibalele Local Municipality",         type: "Local" },
    { name: "Inkosi Mtubatuba Local Municipality",             type: "Local" },
    { name: "Johannes Phumani Phungula Local Municipality",    type: "Local" },
    { name: "Jozini Local Municipality",                       type: "Local" },
    { name: "KwaDukuza Local Municipality",                    type: "Local" },
    { name: "Mandeni Local Municipality",                      type: "Local" },
    { name: "Maphumulo Local Municipality",                    type: "Local" },
    { name: "Mkhambathini Local Municipality",                 type: "Local" },
    { name: "Mpofana Local Municipality",                      type: "Local" },
    { name: "Msunduzi Local Municipality",                     type: "Local" },
    { name: "Mthonjaneni Local Municipality",                  type: "Local" },
    { name: "Ndwedwe Local Municipality",                      type: "Local" },
    { name: "Newcastle Local Municipality",                    type: "Local" },
    { name: "Nkandla Local Municipality",                      type: "Local" },
    { name: "Nongoma Local Municipality",                      type: "Local" },
    { name: "Nquthu Local Municipality",                       type: "Local" },
    { name: "Okhahlamba Local Municipality",                   type: "Local" },
    { name: "Ray Nkonyeni Local Municipality",                 type: "Local" },
    { name: "Richmond Local Municipality",                     type: "Local" },
    { name: "Ulundi Local Municipality",                       type: "Local" },
    { name: "Umdoni Local Municipality",                       type: "Local" },
    { name: "Umhlabuyalingana Local Municipality",             type: "Local" },
    { name: "Umuziwabantu Local Municipality",                 type: "Local" },
    { name: "Umvoti Local Municipality",                       type: "Local" },
    { name: "Umzimkhulu Local Municipality",                   type: "Local" },
    { name: "Umzumbe Local Municipality",                      type: "Local" },
    { name: "eDumbe Local Municipality",                       type: "Local" },
    { name: "uMfolozi Local Municipality",                     type: "Local" },
    { name: "uMlalazi Local Municipality",                     type: "Local" },
    { name: "uMngeni Local Municipality",                      type: "Local" },
    { name: "uMshwathi Local Municipality",                    type: "Local" },
    { name: "uMsinga Local Municipality",                      type: "Local" },
    { name: "uPhongolo Local Municipality",                    type: "Local" },
  ],
  "Limpopo": [
    { name: "Capricorn District Municipality",                 type: "District" },
    { name: "Mopani District Municipality",                    type: "District" },
    { name: "Sekhukhune District Municipality",                type: "District" },
    { name: "Vhembe District Municipality",                    type: "District" },
    { name: "Waterberg District Municipality",                 type: "District" },
    { name: "Ba-Phalaborwa Local Municipality",                type: "Local" },
    { name: "Bela-Bela Local Municipality",                    type: "Local" },
    { name: "Blouberg Local Municipality",                     type: "Local" },
    { name: "Elias Motswaledi Local Municipality",             type: "Local" },
    { name: "Ephraim Mogale Local Municipality",               type: "Local" },
    { name: "Fetakgomo Tubatse Local Municipality",            type: "Local" },
    { name: "Greater Giyani Local Municipality",               type: "Local" },
    { name: "Greater Letaba Local Municipality",               type: "Local" },
    { name: "Greater Tzaneen Local Municipality",              type: "Local" },
    { name: "Lepelle-Nkumpi Local Municipality",               type: "Local" },
    { name: "Lephalale Local Municipality",                    type: "Local" },
    { name: "Makhado Local Municipality",                      type: "Local" },
    { name: "Makhudutamaga Local Municipality",                type: "Local" },
    { name: "Maruleng Local Municipality",                     type: "Local" },
    { name: "Modimolle-Mookgophong Local Municipality",        type: "Local" },
    { name: "Mogalakwena Local Municipality",                  type: "Local" },
    { name: "Molemole Local Municipality",                     type: "Local" },
    { name: "Musina Local Municipality",                       type: "Local" },
    { name: "Polokwane Local Municipality",                    type: "Local" },
    { name: "Thabazimbi Local Municipality",                   type: "Local" },
    { name: "Thulamela Local Municipality",                    type: "Local" },
  ],
  "Mpumalanga": [
    { name: "Ehlanzeni District Municipality",                 type: "District" },
    { name: "Gert Sibande District Municipality",              type: "District" },
    { name: "Nkangala District Municipality",                  type: "District" },
    { name: "Bushbuckridge Local Municipality",                type: "Local" },
    { name: "Chief Albert Luthuli Local Municipality",         type: "Local" },
    { name: "City of Mbombela Local Municipality",             type: "Local" },
    { name: "Dipaleseng Local Municipality",                   type: "Local" },
    { name: "Dr JS Moroka Local Municipality",                 type: "Local" },
    { name: "Emakhazeni Local Municipality",                   type: "Local" },
    { name: "Emalahleni Local Municipality",                   type: "Local" },
    { name: "Govan Mbeki Local Municipality",                  type: "Local" },
    { name: "Lekwa Local Municipality",                        type: "Local" },
    { name: "Mkhondo Local Municipality",                      type: "Local" },
    { name: "Msukaligwa Local Municipality",                   type: "Local" },
    { name: "Nkomazi Local Municipality",                      type: "Local" },
    { name: "Pixley Ka Seme Local Municipality",               type: "Local" },
    { name: "Steve Tshwete Local Municipality",                type: "Local" },
    { name: "Thaba Chweu Local Municipality",                  type: "Local" },
    { name: "Thembisile Hani Local Municipality",              type: "Local" },
    { name: "Victor Khanye Local Municipality",                type: "Local" },
  ],
  "North West": [
    { name: "Bojanala Platinum District Municipality",         type: "District" },
    { name: "Dr Kenneth Kaunda District Municipality",         type: "District" },
    { name: "Dr Ruth Segomotsi Mompati District Municipality", type: "District" },
    { name: "Ngaka Modiri Molema District Municipality",       type: "District" },
    { name: "City of Matlosana Local Municipality",            type: "Local" },
    { name: "Ditsobotla Local Municipality",                   type: "Local" },
    { name: "Greater Taung Local Municipality",                type: "Local" },
    { name: "Kagisano-Molopo Local Municipality",              type: "Local" },
    { name: "Kgetlengrivier Local Municipality",               type: "Local" },
    { name: "Lekwa-Teemane Local Municipality",                type: "Local" },
    { name: "Madibeng Local Municipality",                     type: "Local" },
    { name: "Mahikeng Local Municipality",                     type: "Local" },
    { name: "Mamusa Local Municipality",                       type: "Local" },
    { name: "Maquassi Hills Local Municipality",               type: "Local" },
    { name: "Moretele Local Municipality",                     type: "Local" },
    { name: "Moses Kotane Local Municipality",                 type: "Local" },
    { name: "Naledi Local Municipality",                       type: "Local" },
    { name: "Ramotshere Moiloa Local Municipality",            type: "Local" },
    { name: "Ratlou Local Municipality",                       type: "Local" },
    { name: "Rustenburg Local Municipality",                   type: "Local" },
    { name: "Tswaing Local Municipality",                      type: "Local" },
  ],
  "Northern Cape": [
    { name: "Frances Baard District Municipality",             type: "District" },
    { name: "John Taolo Gaetsewe District Municipality",       type: "District" },
    { name: "Namakwa District Municipality",                   type: "District" },
    { name: "Pixley Ka Seme District Municipality",            type: "District" },
    { name: "ZF Mgcawu District Municipality",                 type: "District" },
    { name: "!Kheis Local Municipality",                       type: "Local" },
    { name: "Dawid Kruiper Local Municipality",                type: "Local" },
    { name: "Dikgatlong Local Municipality",                   type: "Local" },
    { name: "Emthanjeni Local Municipality",                   type: "Local" },
    { name: "Ga-segonyana Local Municipality",                 type: "Local" },
    { name: "Gamagara Local Municipality",                     type: "Local" },
    { name: "Hantam Local Municipality",                       type: "Local" },
    { name: "Joe Morolong Local Municipality",                 type: "Local" },
    { name: "Kai !Garib Local Municipality",                   type: "Local" },
    { name: "Kamiesberg Local Municipality",                   type: "Local" },
    { name: "Kareeberg Local Municipality",                    type: "Local" },
    { name: "Karoo Hoogland Local Municipality",               type: "Local" },
    { name: "Kgatelopele Local Municipality",                  type: "Local" },
    { name: "Khâi-ma Local Municipality",                      type: "Local" },
    { name: "Magareng Local Municipality",                     type: "Local" },
    { name: "Nama Khoi Local Municipality",                    type: "Local" },
    { name: "Phokwane Local Municipality",                     type: "Local" },
    { name: "Renosterberg Local Municipality",                 type: "Local" },
    { name: "Richtersveld Local Municipality",                 type: "Local" },
    { name: "Siyancuma Local Municipality",                    type: "Local" },
    { name: "Siyathemba Local Municipality",                   type: "Local" },
    { name: "Sol Plaatje Local Municipality",                  type: "Local" },
    { name: "Thembelihle Local Municipality",                  type: "Local" },
    { name: "Tsantsabane Local Municipality",                  type: "Local" },
    { name: "Ubuntu Local Municipality",                       type: "Local" },
    { name: "Umsobomvu Local Municipality",                    type: "Local" },
  ],
  "Western Cape": [
    { name: "City of Cape Town Metropolitan Municipality",     type: "Metropolitan" },
    { name: "Cape Winelands District Municipality",            type: "District" },
    { name: "Central Karoo District Municipality",             type: "District" },
    { name: "Garden Route District Municipality",              type: "District" },
    { name: "Overberg District Municipality",                  type: "District" },
    { name: "West Coast District Municipality",                type: "District" },
    { name: "Beaufort West Local Municipality",                type: "Local" },
    { name: "Bergrivier Local Municipality",                   type: "Local" },
    { name: "Bitou Local Municipality",                        type: "Local" },
    { name: "Breede Valley Local Municipality",                type: "Local" },
    { name: "Cape Agulhas Local Municipality",                 type: "Local" },
    { name: "Cederberg Local Municipality",                    type: "Local" },
    { name: "Drakenstein Local Municipality",                  type: "Local" },
    { name: "George Local Municipality",                       type: "Local" },
    { name: "Hessequa Local Municipality",                     type: "Local" },
    { name: "Kannaland Local Municipality",                    type: "Local" },
    { name: "Knysna Local Municipality",                       type: "Local" },
    { name: "Laingsburg Local Municipality",                   type: "Local" },
    { name: "Langeberg Local Municipality",                    type: "Local" },
    { name: "Matzikama Local Municipality",                    type: "Local" },
    { name: "Mossel Bay Local Municipality",                   type: "Local" },
    { name: "Oudtshoorn Local Municipality",                   type: "Local" },
    { name: "Overstrand Local Municipality",                   type: "Local" },
    { name: "Prince Albert Local Municipality",                type: "Local" },
    { name: "Saldanha Bay Local Municipality",                 type: "Local" },
    { name: "Stellenbosch Local Municipality",                 type: "Local" },
    { name: "Swartland Local Municipality",                    type: "Local" },
    { name: "Swellendam Local Municipality",                   type: "Local" },
    { name: "Theewaterskloof Local Municipality",              type: "Local" },
    { name: "Witzenberg Local Municipality",                   type: "Local" },
  ],
};

// Flatten into a searchable list with province + id
let _muniList: Array<{ id: string; province: string; name: string; type: string }> = [];
let _muniIdx = 0;
for (const [province, munis] of Object.entries(MUNICIPALITIES_DATA)) {
  for (const m of munis) {
    _muniIdx++;
    _muniList.push({ id: `muni-${String(_muniIdx).padStart(4,"0")}`, province, name: m.name, type: m.type });
  }
}
const MUNI_LIST = _muniList;

// GET /municipalities — all, with optional province/type/q filters
app.get("/make-server-3f39932e/municipalities", (c) => {
  const province = c.req.query("province");
  const type     = c.req.query("type");
  const q        = c.req.query("q")?.toLowerCase();

  let results = MUNI_LIST;
  if (province) results = results.filter(m => m.province === province);
  if (type)     results = results.filter(m => m.type === type);
  if (q)        results = results.filter(m => m.name.toLowerCase().includes(q) || m.province.toLowerCase().includes(q));

  const provinces = [...new Set(results.map(m => m.province))];
  const stats = {
    total:        results.length,
    metropolitan: results.filter(m => m.type === "Metropolitan").length,
    district:     results.filter(m => m.type === "District").length,
    local:        results.filter(m => m.type === "Local").length,
    provinces:    provinces.length,
  };

  return c.json({ success: true, data: results, stats, filters: { province, type, q } });
});

// GET /municipalities/provinces — summary grouped by province
app.get("/make-server-3f39932e/municipalities/provinces", (c) => {
  const summary = Object.entries(MUNICIPALITIES_DATA).map(([province, munis]) => ({
    province,
    total:        munis.length,
    metropolitan: munis.filter(m => m.type === "Metropolitan").length,
    district:     munis.filter(m => m.type === "District").length,
    local:        munis.filter(m => m.type === "Local").length,
    municipalities: munis,
  }));
  return c.json({
    success: true,
    data: summary,
    totals: {
      provinces:    summary.length,
      total:        MUNI_LIST.length,
      metropolitan: MUNI_LIST.filter(m => m.type === "Metropolitan").length,
      district:     MUNI_LIST.filter(m => m.type === "District").length,
      local:        MUNI_LIST.filter(m => m.type === "Local").length,
    },
  });
});

// GET /municipalities/:id — single municipality by id
app.get("/make-server-3f39932e/municipalities/:id", (c) => {
  const { id } = c.req.param();
  const muni = MUNI_LIST.find(m => m.id === id);
  if (!muni) return c.json({ success: false, error: "Municipality not found" }, 404);
  return c.json({ success: true, data: muni });
});

// GET /municipalities/province/:province — all municipalities in one province
app.get("/make-server-3f39932e/municipalities/province/:province", (c) => {
  const province = decodeURIComponent(c.req.param("province"));
  const munis = MUNI_LIST.filter(m => m.province === province);
  if (!munis.length) return c.json({ success: false, error: "Province not found" }, 404);
  return c.json({
    success: true,
    province,
    data: munis,
    stats: {
      total:        munis.length,
      metropolitan: munis.filter(m => m.type === "Metropolitan").length,
      district:     munis.filter(m => m.type === "District").length,
      local:        munis.filter(m => m.type === "Local").length,
    },
  });
});

// POST /municipalities/search — advanced search with body params
app.post("/make-server-3f39932e/municipalities/search", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { q, province, type, limit = 50 } = body;
  let results = MUNI_LIST;
  if (province) results = results.filter(m => m.province === province);
  if (type)     results = results.filter(m => m.type === type);
  if (q)        results = results.filter(m =>
    m.name.toLowerCase().includes(q.toLowerCase()) ||
    m.province.toLowerCase().includes(q.toLowerCase())
  );
  return c.json({ success: true, data: results.slice(0, limit), total: results.length });
});

// ─── End municipalities ───────────────────────────────────────────────────────

Deno.serve(app.fetch);

