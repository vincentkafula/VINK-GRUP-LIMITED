// ─── Demo Mode ────────────────────────────────────────────────────────────────
// When the backend at localhost:3001 is unreachable, all API services fall back
// to this module so every dashboard works without running the server.

export const DEMO_TOKEN = "demo." + btoa(JSON.stringify({ userId: "demo-001", username: "superadmin", role: "superadmin" })) + ".demo";

export const isDemoMode  = () => localStorage.getItem("vink_demo") === "1";
export const setDemoMode = (v: boolean) => { if (v) localStorage.setItem("vink_demo","1"); else localStorage.removeItem("vink_demo"); };

// ─── Fake login ───────────────────────────────────────────────────────────────
export const DEMO_USERS: Record<string, { token: string; user: { id: string; username: string; name: string; role: string } }> = {
  superadmin: { token: DEMO_TOKEN, user: { id: "demo-001", username: "superadmin", name: "Super Administrator", role: "superadmin" } },
  noc1:       { token: DEMO_TOKEN, user: { id: "demo-002", username: "noc1",       name: "NOC Engineer 1",      role: "noc_engineer" } },
  billing1:   { token: DEMO_TOKEN, user: { id: "demo-003", username: "billing1",   name: "Billing Admin",       role: "billing_admin" } },
};

export function demoLogin(username: string) {
  const u = DEMO_USERS[username] ?? DEMO_USERS["superadmin"];
  return { success: true, ...u };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rand  = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF = (min: number, max: number) => +(Math.random() * (max - min) + min).toFixed(2);
const ago   = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const uuid  = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ─── MVNO Mock Data ───────────────────────────────────────────────────────────
export const mvnoMock = {
  kpiCurrent: () => ({
    success: true, data: {
      timestamp: new Date().toISOString(),
      totalSubscribers: 2_401_840, activeSubscribers: 1_800_000,
      networkUptimePct: 99.97, activeDataSessions: 1_248_300,
      activeVoiceCalls: 48_290, smsQueueDepth: 240,
      revenueToday: 284_120, fraudAlertsActive: 12,
      avgNetworkLoadPct: 68, totalTowerCount: 120,
      towersOnline: 117, activeSims: 2_401_840,
      openTickets: 1_840, roamingUsers: 18_400, dataThroughputGbps: 9.8,
    },
  }),

  kpiHistory: () => ({
    success: true,
    data: Array.from({ length: 24 }, (_, i) => ({
      timestamp: ago((23 - i) * 60),
      activeDataSessions: 1_200_000 + rand(-30_000, 50_000),
      avgNetworkLoadPct:  68 + rand(-5, 8),
      revenueToday:       280_000 + rand(-5_000, 8_000),
      towersOnline: 117, totalTowerCount: 120,
    })),
  }),

  towers: () => ({
    success: true,
    data: Array.from({ length: 120 }, (_, i) => ({
      id: `TOWER-${String(i + 1).padStart(4, "0")}`,
      name: `Tower ${i + 1}`,
      status: i % 30 === 0 ? "offline" : i % 8 === 0 ? "warning" : "online",
      loadPercent: rand(20, 95), connectedSubscribers: rand(50, 800),
      technology: ["4G","4G","4G","5G","3G"][i % 5],
      region: ["Gauteng","Western Cape","KZN","Limpopo","Eastern Cape","Free State"][i % 6],
    })),
  }),

  callStats: () => ({ success: true, data: { total: 50, connected: 38, ringing: 5, held: 4, failed: 3, avgDuration: 185 } }),

  smsStats: () => ({ success: true, data: { total: 1_100, delivered: 1_067, queued: 24, failed: 9, deliveryRate: 97.0 } }),

  billingSummary: () => ({ success: true, data: { totalRevenue: 284_120, paidInvoices: 42, overdueInvoices: 3, pendingInvoices: 5, arOutstanding: 120_000, byType: [
    { type: "voice", count: 120, revenue: 84_000 }, { type: "data", count: 280, revenue: 140_000 },
    { type: "sms", count: 450, revenue: 18_000 },   { type: "roaming", count: 30, revenue: 42_120 },
  ]}}),

  fraudSummary: () => ({ success: true, data: { total: 20, active: 12, blocked: 8, avgRisk: 5.4, byType: [
    { type: "cloning", count: 3, blocked: 2 }, { type: "roaming_abuse", count: 4, blocked: 3 },
    { type: "premium_rate", count: 5, blocked: 3 }, { type: "sim_swap", count: 4, blocked: 0 },
    { type: "dos", count: 2, blocked: 0 }, { type: "bypass", count: 2, blocked: 0 },
  ]}}),

  fraudAlerts: () => ({
    success: true,
    data: [
      { id: uuid(), msisdn: "+27821000001", type: "cloning",       severity: "critical", description: "Duplicate IMSI on multiple cells", detectedAt: ago(2),   resolvedAt: null, blocked: true,  riskScore: 9.2 },
      { id: uuid(), msisdn: "+27821000002", type: "roaming_abuse", severity: "warning",  description: "Abnormal roaming data spike",     detectedAt: ago(8),   resolvedAt: null, blocked: false, riskScore: 7.4 },
      { id: uuid(), msisdn: "+27821000003", type: "premium_rate",  severity: "info",     description: "Premium-rate call pattern",        detectedAt: ago(14),  resolvedAt: null, blocked: true,  riskScore: 6.1 },
      { id: uuid(), msisdn: "+27821000004", type: "sim_swap",      severity: "warning",  description: "SIM swap without verification",    detectedAt: ago(22),  resolvedAt: ago(5), blocked: false, riskScore: 5.3 },
    ],
    meta: { total: 20, active: 12 },
  }),

  alerts: () => ({
    success: true,
    data: [
      { id: uuid(), component: "Packet Core",   title: "High Load",       message: "GGSN/PGW load at 81% — approaching threshold", severity: "warning",  createdAt: ago(2),  acknowledgedAt: null, resolvedAt: null },
      { id: uuid(), component: "Fraud Engine",  title: "New Fraud Cases", message: "3 new suspicious IMSIs flagged",                severity: "warning",  createdAt: ago(8),  acknowledgedAt: null, resolvedAt: null },
      { id: uuid(), component: "SMSC",          title: "Queue Spike",     message: "SMS delivery queue depth exceeded 200",         severity: "info",     createdAt: ago(14), acknowledgedAt: ago(12), resolvedAt: null },
      { id: uuid(), component: "Cell Tower",    title: "Tower Offline",   message: "TOWER-0031 has gone offline",                  severity: "critical", createdAt: ago(35), acknowledgedAt: ago(30), resolvedAt: null },
    ],
    meta: { total: 12, active: 12, critical: 1, warning: 2, info: 1 },
  }),

  alertSummary: () => ({ success: true, data: { total: 12, active: 12, critical: 1, warning: 2, info: 9 } }),

  simStats: () => ({ success: true, data: { total: 500, active: 200, unallocated: 250, esim: 100, physical: 400, suspended: 10 } }),

  sessions: () => ({ success: true, data: Array.from({ length: 20 }, (_, i) => ({
    id: uuid(), imsi: `65501${String(i).padStart(10,"0")}`, msisdn: `+2782${String(7000000+i).padStart(7,"0")}`,
    apn: ["internet","mms","iot.vink.net"][i%3], ipv4: `10.${rand(0,255)}.${rand(0,255)}.${rand(1,254)}`,
    uplinkKbps: rand(100,50000), downlinkKbps: rand(500,200000),
    startedAt: ago(rand(0,480)), rat: ["4G","4G","5G","3G"][i%4],
  })), meta: { total: 80, totalDlGbps: 9.8, totalUlGbps: 3.2 } }),

  support: () => ({ success: true, data: {
    total: 60, open: 24, inProgress: 16, resolved: 14, closed: 6, urgent: 3, avgCsat: 4.2,
    byCategory: ["billing","technical","porting","activation","roaming","fraud","general"].map(c => ({ category: c, count: rand(3,12), open: rand(1,5) })),
  }}),

  interSummary: () => ({ success: true, data: { activePartners: 7, totalRoamers: 18_400, roamingRevenue30d: 67_800, activeRoutes: 5, avgAsr: 70.8, activeIntercepts: 4 } }),
};

// ─── Banking Mock Data ────────────────────────────────────────────────────────
const BANK_USERS = [
  { id: "bu-001", role: "passenger", firstName: "Margaret",  lastName: "Botha",    email: "margaret@example.com",  phone: "+27821000001", kycStatus: "approved",  amlStatus: "clear",        accountCount: 2, cardCount: 2, totalBalance: 24_580.00, createdAt: ago(43800) },
  { id: "bu-002", role: "passenger", firstName: "Johannes",  lastName: "van Berg",  email: "johannes@example.com",  phone: "+27821000002", kycStatus: "approved",  amlStatus: "clear",        accountCount: 2, cardCount: 1, totalBalance: 8_200.00,  createdAt: ago(30000) },
  { id: "bu-003", role: "driver",    firstName: "Themba",    lastName: "Dlamini",  email: "themba@example.com",    phone: "+27811000001", kycStatus: "approved",  amlStatus: "clear",        accountCount: 1, cardCount: 1, totalBalance: 12_340.00, createdAt: ago(22000) },
  { id: "bu-004", role: "driver",    firstName: "Sipho",     lastName: "Ndlovu",   email: "sipho@example.com",     phone: "+27811000002", kycStatus: "approved",  amlStatus: "clear",        accountCount: 1, cardCount: 1, totalBalance: 9_870.00,  createdAt: ago(18000) },
  { id: "bu-005", role: "investor",  firstName: "Patricia",  lastName: "Osei",     email: "patricia@example.com",  phone: "+27831000001", kycStatus: "approved",  amlStatus: "clear",        accountCount: 2, cardCount: 2, totalBalance: 480_000.00,createdAt: ago(50000) },
  { id: "bu-006", role: "investor",  firstName: "David",     lastName: "Nkosi",    email: "david@example.com",     phone: "+27831000002", kycStatus: "in_review", amlStatus: "under_review", accountCount: 2, cardCount: 1, totalBalance: 220_000.00,createdAt: ago(40000) },
  { id: "bu-007", role: "owner",     firstName: "Vincent",   lastName: "Karimi",   email: "vincent@example.com",   phone: "+27841000001", kycStatus: "approved",  amlStatus: "clear",        accountCount: 3, cardCount: 3, totalBalance: 1_240_000, createdAt: ago(60000) },
  { id: "bu-008", role: "admin",     firstName: "Sarah",     lastName: "Williams", email: "admin@vink.co.za",         phone: "+27851000001", kycStatus: "approved",  amlStatus: "clear",        accountCount: 1, cardCount: 0, totalBalance: 0,          createdAt: ago(43800) },
  { id: "bu-009", role: "compliance",firstName: "Nadia",     lastName: "Petersen", email: "compliance@vink.co.za",   phone: "+27851000002", kycStatus: "approved",  amlStatus: "clear",        accountCount: 1, cardCount: 0, totalBalance: 0,          createdAt: ago(43800) },
  { id: "bu-010", role: "treasury",  firstName: "James",     lastName: "Molefe",   email: "treasury@vink.co.za",     phone: "+27851000003", kycStatus: "approved",  amlStatus: "clear",        accountCount: 1, cardCount: 0, totalBalance: 0,          createdAt: ago(43800) },
  { id: "bu-011", role: "passenger", firstName: "Amahle",    lastName: "Ngcobo",   email: "amahle@example.com",    phone: "+27821000003", kycStatus: "pending",   amlStatus: "clear",        accountCount: 1, cardCount: 0, totalBalance: 3_100.00,  createdAt: ago(5000) },
  { id: "bu-012", role: "driver",    firstName: "Farai",     lastName: "Moyo",     email: "farai@example.com",     phone: "+27811000003", kycStatus: "approved",  amlStatus: "clear",        accountCount: 1, cardCount: 1, totalBalance: 7_600.00,  createdAt: ago(15000) },
];

const BANK_ACCOUNTS = [
  { id: "acct-001", userId: "bu-001", accountNumber: "VNK10000000", iban: "ZA21 VINK 00000000 0001", sortCode: "30-00-01", type: "current",  currency: "ZAR", balance: 18_580.00, availableBalance: 17_980.00, pendingBalance: 600.00, status: "active",  interestRate: 2.5, overdraftLimit: 5000,  label: "Primary Account" },
  { id: "acct-002", userId: "bu-001", accountNumber: "VNK10000100", iban: "ZA21 VINK 00000100 0001", sortCode: "30-00-01", type: "savings",  currency: "ZAR", balance: 6_000.00,  availableBalance: 6_000.00,  pendingBalance: 0,      status: "active",  interestRate: 8.0, overdraftLimit: 0,     label: "Savings Account" },
  { id: "acct-003", userId: "bu-003", accountNumber: "VNK20000000", iban: "ZA21 VINK 20000000 0001", sortCode: "30-00-01", type: "wallet",   currency: "ZAR", balance: 12_340.00, availableBalance: 12_340.00, pendingBalance: 0,      status: "active",  interestRate: 2.5, overdraftLimit: 0,     label: "Earnings Wallet" },
  { id: "acct-004", userId: "bu-005", accountNumber: "VNK30000000", iban: "ZA21 VINK 30000000 0001", sortCode: "30-00-01", type: "current",  currency: "ZAR", balance: 280_000.00,availableBalance: 278_500.00,pendingBalance: 1500.00,status: "active",  interestRate: 2.5, overdraftLimit: 50000, label: "Primary Account" },
  { id: "acct-005", userId: "bu-005", accountNumber: "VNK30000100", iban: "ZA21 VINK 30000100 0001", sortCode: "30-00-01", type: "savings",  currency: "ZAR", balance: 200_000.00,availableBalance: 200_000.00,pendingBalance: 0,      status: "active",  interestRate: 8.0, overdraftLimit: 0,     label: "Investment Account" },
  { id: "acct-006", userId: "bu-007", accountNumber: "VNK40000000", iban: "ZA21 VINK 40000000 0001", sortCode: "30-00-01", type: "business", currency: "ZAR", balance: 1_240_000, availableBalance: 1_230_000, pendingBalance: 10000,  status: "active",  interestRate: 2.5, overdraftLimit: 100000,label: "Business Account" },
];

const BANK_CARDS = [
  { id: "card-001", userId: "bu-001", accountId: "acct-001", network: "visa",       type: "virtual",  tier: "standard",  pan: "4242 **** **** 4521", last4: "4521", expiry: "09/28", cvv: "***", nameOnCard: "MARGARET BOTHA",    status: "active",  contactless: true,  applePayEnrolled: true,  googlePayEnrolled: false, dailyLimit: 10000,  monthlyLimit: 50000,  spentToday: 342.50, spentThisMonth: 4_820, atmWithdrawalLimit: 5000, onlineTxnEnabled: true,  internationalEnabled: false, issuedAt: ago(4380), lastUsedAt: ago(2),   tokenized: true, binCode: "424242" },
  { id: "card-002", userId: "bu-001", accountId: "acct-001", network: "mastercard", type: "physical", tier: "standard",  pan: "5111 **** **** 8834", last4: "8834", expiry: "03/27", cvv: "***", nameOnCard: "MARGARET BOTHA",    status: "active",  contactless: true,  applePayEnrolled: false, googlePayEnrolled: true,  dailyLimit: 20000,  monthlyLimit: 80000,  spentToday: 0,      spentThisMonth: 2_100, atmWithdrawalLimit: 10000,onlineTxnEnabled: true,  internationalEnabled: true,  issuedAt: ago(8760), lastUsedAt: ago(240), tokenized: true, binCode: "511111" },
  { id: "card-003", userId: "bu-003", accountId: "acct-003", network: "mastercard", type: "virtual",  tier: "standard",  pan: "5200 **** **** 2291", last4: "2291", expiry: "12/26", cvv: "***", nameOnCard: "THEMBA DLAMINI",     status: "active",  contactless: true,  applePayEnrolled: false, googlePayEnrolled: true,  dailyLimit: 5000,   monthlyLimit: 20000,  spentToday: 120,    spentThisMonth: 680,   atmWithdrawalLimit: 2000, onlineTxnEnabled: true,  internationalEnabled: false, issuedAt: ago(2190), lastUsedAt: ago(60),  tokenized: true, binCode: "520000" },
  { id: "card-004", userId: "bu-005", accountId: "acct-004", network: "visa",       type: "physical", tier: "premium",   pan: "4111 **** **** 1111", last4: "1111", expiry: "06/29", cvv: "***", nameOnCard: "PATRICIA OSEI",      status: "active",  contactless: true,  applePayEnrolled: true,  googlePayEnrolled: true,  dailyLimit: 50000,  monthlyLimit: 200000, spentToday: 4_800,  spentThisMonth: 28_000,atmWithdrawalLimit: 25000,onlineTxnEnabled: true,  internationalEnabled: true,  issuedAt: ago(4380), lastUsedAt: ago(12),  tokenized: true, binCode: "411111" },
  { id: "card-005", userId: "bu-007", accountId: "acct-006", network: "mastercard", type: "physical", tier: "corporate", pan: "5555 **** **** 4444", last4: "4444", expiry: "11/28", cvv: "***", nameOnCard: "VINCENT KARIMI",     status: "active",  contactless: true,  applePayEnrolled: true,  googlePayEnrolled: true,  dailyLimit: 100000, monthlyLimit: 500000, spentToday: 12_400, spentThisMonth: 84_000,atmWithdrawalLimit: 50000,onlineTxnEnabled: true,  internationalEnabled: true,  issuedAt: ago(8760), lastUsedAt: ago(4),   tokenized: true, binCode: "555555" },
  { id: "card-006", userId: "bu-006", accountId: "acct-004", network: "visa",       type: "virtual",  tier: "premium",   pan: "4929 **** **** 7777", last4: "7777", expiry: "04/27", cvv: "***", nameOnCard: "DAVID NKOSI",        status: "frozen", contactless: true,  applePayEnrolled: false, googlePayEnrolled: false, dailyLimit: 30000,  monthlyLimit: 120000, spentToday: 0,      spentThisMonth: 0,     atmWithdrawalLimit: 15000,onlineTxnEnabled: true,  internationalEnabled: true,  issuedAt: ago(3650), lastUsedAt: ago(720), tokenized: true, binCode: "492900" },
];

const TXN_MERCHANTS = ["Woolworths","Pick n Pay","Shell","Netflix","MTN","Takealot","Dis-Chem","BP","Uber Eats","Checkers"];
const TXN_CATS = ["Groceries","Fuel","Entertainment","Mobile","E-commerce","Pharmacy","Transport","Fuel","Dining","Groceries"];

const BANK_TXNS_BASE = Array.from({ length: 25 }, (_, i) => ({
  id: `txn-${i}`, accountId: "acct-001", userId: "bu-001",
  type: i % 5 === 0 ? "credit" : "debit",
  category: i % 5 === 0 ? "deposit" : "card_payment",
  amount: randF(i % 5 === 0 ? 2000 : 50, i % 5 === 0 ? 10000 : 1800),
  currency: "ZAR", fxRate: null,
  description: i % 5 === 0 ? "Account deposit" : `Payment at ${TXN_MERCHANTS[i % 10]}`,
  reference: `VNK${rand(1000000, 9999999)}`,
  counterpartyName: i % 5 === 0 ? "VINK PLATFORM" : TXN_MERCHANTS[i % 10],
  counterpartyAccount: null,
  rail: i % 5 === 0 ? "internal" : "visa_direct",
  status: "completed", cardId: i % 5 === 0 ? null : "card-001",
  merchantName: i % 5 === 0 ? null : TXN_MERCHANTS[i % 10],
  merchantCategory: i % 5 === 0 ? null : TXN_CATS[i % 10],
  location: i % 5 === 0 ? null : "Cape Town, ZA",
  fraudScore: rand(0, 10), flagged: i === 23,
  createdAt: ago(rand(i * 20, i * 20 + 180)), settledAt: ago(rand(0, i * 20)),
}));

export const bankMock = {
  users: (params?: Record<string, string>) => {
    let users = BANK_USERS;
    if (params?.role) users = users.filter(u => u.role === params.role);
    if (params?.search) {
      const q = params.search.toLowerCase();
      users = users.filter(u => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q));
    }
    return { success: true, data: users, meta: { total: users.length } };
  },
  userById: (id: string) => {
    const user = BANK_USERS.find(u => u.id === id) ?? BANK_USERS[0];
    const accounts = BANK_ACCOUNTS.filter(a => a.userId === user.id);
    const cards    = BANK_CARDS.filter(c => c.userId === user.id);
    return { success: true, data: { user, accounts, cards, kyc: { status: user.kycStatus, faceMatchScore: 94, documentType: "national_id" }, aml: [], portfolio: null } };
  },
  userStats: () => ({
    success: true, data: {
      total: BANK_USERS.length,
      byRole: ["passenger","driver","investor","owner","admin","compliance","treasury"].map(r => ({
        role: r, count: BANK_USERS.filter(u => u.role === r).length,
        kycApproved: BANK_USERS.filter(u => u.role === r && u.kycStatus === "approved").length,
      })),
      kycPending: 2,
    },
  }),
  accounts: (params?: Record<string, string>) => {
    let data = BANK_ACCOUNTS;
    if (params?.userId) data = data.filter(a => a.userId === params.userId);
    if (params?.type)   data = data.filter(a => a.type === params.type);
    return { success: true, data, meta: { total: data.length } };
  },
  accountById: (id: string) => ({ success: true, data: BANK_ACCOUNTS.find(a => a.id === id) ?? BANK_ACCOUNTS[0] }),
  accountTxns: (id: string) => ({
    success: true,
    data: BANK_TXNS_BASE.map(t => ({ ...t, accountId: id })),
    meta: { page: 1, limit: 25, total: 25, pages: 1 },
  }),
  accountSummary: (id: string) => {
    const acct = BANK_ACCOUNTS.find(a => a.id === id) ?? BANK_ACCOUNTS[0];
    return { success: true, data: {
      balance: acct.balance, availableBalance: acct.availableBalance,
      totalIn: 48_000, totalOut: 23_420, txnCount: 25,
      byCategory: TXN_CATS.slice(0, 5).map((cat, i) => ({ category: cat, amount: randF(500, 4000), count: rand(2, 8) })),
    }};
  },
  cards: (params?: Record<string, string>) => {
    let data = BANK_CARDS;
    if (params?.userId) data = data.filter(c => c.userId === params.userId);
    if (params?.network) data = data.filter(c => c.network === params.network);
    if (params?.status)  data = data.filter(c => c.status === params.status);
    return { success: true, data, meta: { total: data.length, active: data.filter(c=>c.status==="active").length } };
  },
  cardById: (id: string) => ({ success: true, data: BANK_CARDS.find(c => c.id === id) ?? BANK_CARDS[0] }),
  cardTxns: (id: string) => ({ success: true, data: BANK_TXNS_BASE.filter(t => t.cardId === id).slice(0, 10) }),
  payments: () => ({ success: true, data: [] }),
  sendPayment: (body: Record<string, unknown>) => ({ success: true, data: { id: uuid(), ...body, status: "completed", executedAt: new Date().toISOString() } }),
  instantPayout: (amount: number) => ({ success: true, data: { amount, currency: "ZAR", status: "completed" }, message: `R${Number(amount).toFixed(2)} instant payout processed` }),
  treasury: () => ({ success: true, data: [
    { id: "tr-1", label: "Settlement Account",  purpose: "settlement",  currency: "ZAR", balance: 12_500_000, reserveBalance: 2_500_000 },
    { id: "tr-2", label: "Reserve Fund",        purpose: "reserve",     currency: "ZAR", balance: 45_000_000, reserveBalance: 45_000_000 },
    { id: "tr-3", label: "Revenue Account",     purpose: "revenue",     currency: "ZAR", balance: 3_200_000,  reserveBalance: 0 },
    { id: "tr-4", label: "Operational Account", purpose: "operational", currency: "ZAR", balance: 8_100_000,  reserveBalance: 500_000 },
    { id: "tr-5", label: "Suspense Account",    purpose: "suspense",    currency: "ZAR", balance: 145_000,    reserveBalance: 0 },
  ], meta: { total: 68_945_000, totalReserve: 48_000_000 } }),
  settlements: () => ({ success: true, data: Array.from({ length: 12 }, (_, i) => ({
    id: uuid(), date: new Date(Date.now() - i * 86_400_000).toISOString().split("T")[0],
    totalVolume: randF(800_000, 3_000_000), netAmount: randF(780_000, 2_950_000),
    currency: "ZAR", network: ["visa","mastercard","internal"][i % 3],
    txnCount: rand(2000, 15000), status: i === 0 ? "in_progress" : "settled",
    settledAt: i === 0 ? null : ago((i - 1) * 1440),
  })) }),
  revenueSplits: () => ({ success: true,
    data: Array.from({ length: 10 }, (_, i) => { const total = randF(50000, 200000); return {
      id: uuid(), sourceType: "ride_fare", totalAmount: total, currency: "ZAR",
      splits: [
        { recipient: "driver",   percentage: 75, amount: +(total*0.75).toFixed(2) },
        { recipient: "investor", percentage: 10, amount: +(total*0.10).toFixed(2) },
        { recipient: "owner",    percentage: 15, amount: +(total*0.15).toFixed(2) },
      ], createdAt: ago(rand(0, 10080)),
    }; }),
    meta: { totalRevenue: 1_240_000, driverShare: 930_000, investorShare: 124_000, ownerShare: 186_000 },
  }),
  portfolios: () => ({ success: true, data: [
    { userId: "bu-005", capitalDeposited: 500_000, currentValue: 560_000, totalReturns: 60_000, returnPct: 12, dividendsPaid: 24_000, revenueSharePct: 10, nextDividendDate: new Date(Date.now() + 15*86400000).toISOString().split("T")[0], userName: "Patricia Osei" },
    { userId: "bu-006", capitalDeposited: 220_000, currentValue: 242_000, totalReturns: 22_000, returnPct: 10, dividendsPaid: 8_800, revenueSharePct: 10, nextDividendDate: new Date(Date.now() + 15*86400000).toISOString().split("T")[0], userName: "David Nkosi" },
  ] }),
  bankingKpi: () => ({ success: true, data: {
    timestamp: new Date().toISOString(),
    totalUsers: 12, activeCards: 5, totalVolume24h: 284_120, txnCount24h: 8_420,
    fraudAlertsActive: 8, kycPending: 2, treasuryBalance: 68_945_000,
    revenueToday: 42_600, avgFraudScore: 4.2, settlementsPending: 1,
  }}),
  kyc: (params?: Record<string, string>) => {
    const recs = BANK_USERS.map(u => ({
      id: `kyc-${u.id}`, userId: u.id, status: u.kycStatus,
      documentType: "national_id", documentNumber: u.id.replace("bu-","ZA8") + "000",
      documentCountry: "ZA", documentExpiry: "2034-01-01",
      faceMatchScore: u.kycStatus === "approved" ? rand(88,99) : null,
      addressVerified: u.kycStatus === "approved",
      submittedAt: ago(rand(720,4320)), reviewedAt: u.kycStatus === "approved" ? ago(rand(60,720)) : null,
      reviewedBy: u.kycStatus === "approved" ? "compliance@vink.co.za" : null,
      rejectionReason: null, user: u,
    }));
    const filtered = params?.status ? recs.filter(r => r.status === params.status) : recs;
    return { success: true, data: filtered, meta: { total: filtered.length, pending: recs.filter(r=>r.status==="pending"||r.status==="in_review").length } };
  },
  approveKyc: (id: string) => ({ success: true, data: { id, status: "approved", reviewedAt: new Date().toISOString() } }),
  rejectKyc:  (id: string) => ({ success: true, data: { id, status: "rejected", reviewedAt: new Date().toISOString() } }),
  aml: () => ({ success: true, data: BANK_USERS.map(u => ({ id: uuid(), userId: u.id, checkType: "ofac", result: "clear", riskScore: rand(0,15), checkedAt: ago(rand(0,4320)), sarFiled: false, user: u })) }),
  fraudAlerts: (params?: Record<string, string>) => {
    const rules = ["velocity_check","geo_anomaly","device_new","high_value_unusual","foreign_txn"];
    const data = Array.from({ length: 8 }, (_, i) => ({
      id: `fa-${i}`, userId: BANK_USERS[i%BANK_USERS.length].id, accountId: BANK_ACCOUNTS[i%BANK_ACCOUNTS.length].id, txnId: null,
      riskLevel: ["low","medium","high","critical"][i%4], ruleTriggered: rules[i%5],
      description: `Suspicious activity — ${rules[i%5].replace(/_/g," ")}`,
      blocked: i%2===0, resolved: i<3, createdAt: ago(rand(0,2880)), resolvedAt: i<3 ? ago(rand(0,60)) : null,
      user: BANK_USERS[i%BANK_USERS.length],
    }));
    const filtered = params?.resolved === "false" ? data.filter(f=>!f.resolved) : params?.resolved === "true" ? data.filter(f=>f.resolved) : data;
    return { success: true, data: filtered, meta: { total: data.length, active: data.filter(f=>!f.resolved).length } };
  },
  resolveFraud: (id: string) => ({ success: true, data: { id, resolved: true, resolvedAt: new Date().toISOString() } }),
  complianceSummary: () => ({ success: true, data: {
    kyc: { total: 12, approved: 9, pending: 2, rejected: 1 },
    aml: { total: 12, clear: 11, flagged: 1 },
    fraud: { total: 8, active: 5, critical: 1 },
  }}),
};

// ─── Healing Apple Mock Data ──────────────────────────────────────────────────
export const haMock = {
  login: () => ({ success: true, token: DEMO_TOKEN, user: { id: "ha-driver-001", name: "Themba Dlamini", role: "driver" } }),
  drivers: {
    get: () => ({ success: true, data: {
      id: "ha-driver-001", name: "Themba Dlamini", phone: "+27811000001", email: "themba@healingapple.co.za",
      avatarInitials: "TD", licenceNo: "ZA12345678",
      vehicleType: "standard", vehicleMake: "Toyota", vehicleModel: "Corolla Quest", vehicleYear: 2021,
      vehiclePlate: "CA 442 801", vehicleColour: "White",
      onlineStatus: "online", position: { lat: -33.92, lng: 18.42 }, heading: 45,
      totalTrips: 284, totalEarningsZAR: 48_200, earningsToday: 840, earningsThisWeek: 4_200,
      avgRating: 4.9, acceptanceRate: 94, completionRate: 98,
      firstAidCertified: true, backgroundCheckStatus: "approved",
      vehicleInspectionStatus: "approved", accessibilityTrainingStatus: "approved",
      joinedAt: ago(43800), lastActiveAt: ago(5),
    }}),
    earnings: () => ({ success: true, data: {
      summary: { today: 840, thisWeek: 4200, allTime: 48200, pending: 1260, nextPayoutDate: new Date(Date.now()+7*86400000).toISOString().split("T")[0] },
      records: [
        { id: uuid(), rideId: uuid(), amount: 68*0.75, currency: "ZAR", type: "trip",  description: "Trip: Groote Schuur Hospital → Clicks Pharmacy", createdAt: ago(120), paid: true },
        { id: uuid(), rideId: uuid(), amount: 45*0.75, currency: "ZAR", type: "trip",  description: "Trip: Mediclinic Cape Gate → Red Cross Hospital", createdAt: ago(240), paid: true },
        { id: uuid(), rideId: uuid(), amount: 120,     currency: "ZAR", type: "bonus", description: "Weekly performance bonus",                        createdAt: ago(1440),paid: true },
        { id: uuid(), rideId: uuid(), amount: 95*0.75, currency: "ZAR", type: "trip",  description: "Trip: Tygerberg Hospital → City Park Pharmacy",   createdAt: ago(1460),paid: false },
      ],
    }}),
    documents: () => ({ success: true, data: [
      { id: uuid(), type: "licence",               status: "approved", expires: "2026-08-15", filename: "licence.pdf" },
      { id: uuid(), type: "id_document",           status: "approved", expires: null,         filename: "id.pdf" },
      { id: uuid(), type: "vehicle_registration",  status: "approved", expires: "2025-10-01", filename: "reg.pdf" },
      { id: uuid(), type: "insurance",             status: "approved", expires: "2025-12-31", filename: "insurance.pdf" },
      { id: uuid(), type: "first_aid_cert",        status: "approved", expires: "2025-06-30", filename: "first_aid.pdf" },
      { id: uuid(), type: "background_check",      status: "approved", expires: null,         filename: "bg_check.pdf" },
      { id: uuid(), type: "accessibility_training",status: "approved", expires: "2025-06-30", filename: "accessibility.pdf" },
    ]}),
    trips: () => ({ success: true, data: [
      { id: uuid(), passengerId: "p-001", passengerName: "Margaret Botha",  status: "completed", vehicleType: "standard",  estimatedFareZAR: 68,  distanceKm: 6.2, driverName: "Themba Dlamini", createdAt: ago(120)  },
      { id: uuid(), passengerId: "p-002", passengerName: "Amahle Ngcobo",   status: "completed", vehicleType: "wheelchair", estimatedFareZAR: 115, distanceKm: 9.4, driverName: "Themba Dlamini", createdAt: ago(240)  },
      { id: uuid(), passengerId: "p-003", passengerName: "Patrick Osei",    status: "completed", vehicleType: "standard",  estimatedFareZAR: 95,  distanceKm: 8.1, driverName: "Themba Dlamini", createdAt: ago(1440) },
    ]}),
  },
  rides: {
    incoming: () => ({ success: true, data: [{
      id: "ride-incoming-001",
      passengerId: "p-wheelchair-001", passengerName: "Amahle Ngcobo", passengerPhone: "+27821000003",
      vehicleType: "wheelchair",
      pickupAddress:  { label: "Tygerberg Hospital",  lat: -33.91, lng: 18.63 },
      dropoffAddress: { label: "City Park Pharmacy",  lat: -33.93, lng: 18.42 },
      medicalNote: "I use a rollator walker — please allow extra boarding time.",
      estimatedFareZAR: 120, distanceKm: 9.4,
      status: "searching", createdAt: ago(1),
    }] }),
    stats: () => ({ success: true, data: { activeRides: 2, onlineDrivers: 6, ridesCompletedToday: 28, totalPassengers: 8, totalDrivers: 8, activeSosEvents: 0, avgEtaMinutes: 7, revenueToday: 2_840, acceptanceRatePct: 92, cancellationRatePct: 4 } }),
    list: () => ({ success: true, data: [], meta: { total: 0 } }),
    accept:  () => ({ success: true, data: { status: "accepted", etaMinutes: 4 } }),
    decline: () => ({ success: true }),
    status:  () => ({ success: true, data: { status: "completed" } }),
    rate:    () => ({ success: true }),
  },
  passengers: {
    get: () => ({ success: true, data: {
      id: "p-001", name: "Margaret Botha", phone: "+27821000001", walletBalance: 245.50,
      currency: "ZAR", preferredVehicleType: "standard", medicalProfile: "I use a walker — allow extra boarding time.",
      emergencyContacts: [{ name: "Johan Botha", phone: "+27821000099", relationship: "Spouse" }],
      totalTrips: 42, avgRating: 4.8, linkedCaregiverId: null,
    }}),
    trips: () => ({ success: true, data: [
      { id: uuid(), driverName: "Themba Dlamini", pickupAddress: { label: "Groote Schuur Hospital" }, dropoffAddress: { label: "Clicks Pharmacy" }, status: "completed", estimatedFareZAR: 68,  passengerRating: 5, createdAt: ago(120) },
      { id: uuid(), driverName: "Sipho Ndlovu",   pickupAddress: { label: "Red Cross Hospital" },     dropoffAddress: { label: "Mowbray, Cape Town" }, status: "completed", estimatedFareZAR: 85,  passengerRating: 4, createdAt: ago(2880) },
      { id: uuid(), driverName: "Farai Moyo",     pickupAddress: { label: "Tygerberg Hospital" },     dropoffAddress: { label: "Somerset Hospital" }, status: "cancelled", estimatedFareZAR: 110, passengerRating: null, createdAt: ago(5760) },
    ]}),
    active: () => ({ success: true, data: null }),
    scheduled: () => ({ success: true, data: [
      { id: uuid(), vehicleType: "standard", pickupAddress: { label: "Netcare Claremont" }, dropoffAddress: { label: "Physio & Rehab Centre" }, scheduledTime: new Date(Date.now()+18*3600000).toISOString(), recurrence: "weekly", active: true },
    ]}),
  },
  sos: {
    trigger: () => ({ success: true, data: { id: uuid(), status: "active" }, message: "SOS active. Emergency contacts notified." }),
  },
};

// ─── Vehicle Tracking Mock Data ───────────────────────────────────────────────
const PLATE = (i: number) => `CA ${String(100000 + i).slice(1)} GP`;
const MAKES  = ["Toyota","Ford","Volkswagen","Isuzu","Mercedes","Hyundai","Nissan","BMW","Volvo","MAN"];
const MODELS = ["Hilux","Ranger","Crafter","D-Max","Sprinter","H1","NP300","X5","FH16","TGX"];
const GROUPS = ["Delivery","Executive","Field","Security","Maintenance","Logistics"];
const STATUSES = ["moving","moving","moving","idle","stopped","offline","maintenance"] as const;

const VEHICLE_POSITIONS = Array.from({ length: 50 }, (_, i) => ({
  id: `veh-${String(i + 1).padStart(3, "0")}`,
  plateNumber: PLATE(i),
  make: MAKES[i % MAKES.length],
  model: MODELS[i % MODELS.length],
  fleetGroup: GROUPS[i % GROUPS.length],
  colour: ["White","Silver","Black","Grey","Blue"][i % 5],
  year: 2018 + (i % 6),
  status: STATUSES[i % STATUSES.length],
  commChannel: ["cellular_4g","cellular_4g","cellular_3g","satellite","offline"][i % 5],
  position: {
    lat: -26.20 + (Math.sin(i * 1.3) * 4.5),
    lng: 28.05 + (Math.cos(i * 1.1) * 5.5),
    altitude: 1400 + rand(0, 200),
    accuracy: rand(3, 15),
    heading: rand(0, 359),
    timestamp: ago(rand(0, 3)),
  },
  sensors: {
    speedKph:    STATUSES[i % STATUSES.length] === "moving" ? rand(40, 120) : 0,
    fuelPercent: rand(15, 100),
    engineTempC: rand(75, 95),
    engineOn:    STATUSES[i % STATUSES.length] !== "offline",
    odometreKm:  rand(15000, 180000),
    rpm:         STATUSES[i % STATUSES.length] === "moving" ? rand(1200, 3200) : 0,
    batteryV:    randF(12.1, 14.4),
    doorOpen:    false,
    ignitionOn:  STATUSES[i % STATUSES.length] !== "offline",
  },
  speedKph:    STATUSES[i % STATUSES.length] === "moving" ? rand(40, 120) : 0,
  fuelPercent: rand(15, 100),
  lastSeen: ago(rand(0, 5)),
  driverId: i < 30 ? `drv-${String(i + 1).padStart(3, "0")}` : null,
  deviceId: `GPS-${String(10000 + i)}`,
  simIccid:  `8927${String(i).padStart(15, "0")}`,
  vin: `WDB${String(i).padStart(14, "0")}`,
  registeredAt: ago(rand(8760, 43800)),
  insuranceExpiry: new Date(Date.now() + rand(30, 365) * 86400000).toISOString().split("T")[0],
  licenceExpiry:   new Date(Date.now() + rand(30, 365) * 86400000).toISOString().split("T")[0],
  nextServiceKm: rand(1000, 8000),
}));

const FLEET_DRIVERS = Array.from({ length: 30 }, (_, i) => ({
  id: `drv-${String(i + 1).padStart(3, "0")}`,
  name: ["Themba Dlamini","Sipho Ndlovu","Farai Moyo","Abebe Bekele","Kagiso Sithole",
         "Lwazi Mokoena","Nomsa Khumalo","Patrick Osei","Samuel Petersen","Fatima Ismail",
         "David Nkosi","Grace Mthembu","Johannes van Berg","Amahle Ngcobo","Vincent Karimi",
         "Sarah Williams","James Molefe","Nadia Petersen","Themba Zulu","Sipho Khumalo",
         "Farai Sithole","Abebe Dlamini","Kagiso Ndlovu","Lwazi Bekele","Nomsa Moyo",
         "Patrick van Berg","Samuel Ngcobo","Fatima Karimi","David Petersen","Grace Molefe"][i],
  licenceNo: `ZA${rand(10000000, 99999999)}`,
  phone: `+2781${String(rand(1000000, 9999999))}`,
  email: `driver${i + 1}@fleet.co.za`,
  status: (["active","active","active","inactive","suspended"][i % 5]) as string,
  assignedVehicleId: i < 25 ? `veh-${String(i + 1).padStart(3, "0")}` : null,
  totalTrips: rand(50, 800),
  totalKm: rand(8000, 120000),
  safetyScore: rand(55, 99),
  joinedAt: ago(rand(4380, 43800)),
  avatarInitials: ["TD","SN","FM","AB","KS","LM","NK","PO","SP","FI","DN","GM","JvB","AN","VK","SW","JM","NP","TZ","SK","FS","AD","KN","LB","NM","PvB","SN","FK","DP","GM"][i],
}));

const FLEET_ALERTS = Array.from({ length: 18 }, (_, i) => {
  const types = ["speeding","low_fuel","harsh_braking","geofence_breach","engine_off","sos","tampering","accident"] as const;
  const type = types[i % types.length];
  return {
    id: `alert-${String(i + 1).padStart(3, "0")}`,
    vehicleId: `veh-${String((i % 50) + 1).padStart(3, "0")}`,
    plateNumber: PLATE(i % 50),
    driverId: i < 15 ? `drv-${String((i % 30) + 1).padStart(3, "0")}` : null,
    type,
    severity: (["critical","warning","warning","info","critical"][i % 5]) as string,
    message: {
      speeding: `Speed limit exceeded — ${rand(90, 140)} km/h in 80 zone`,
      low_fuel: `Fuel level critical — ${rand(5, 18)}% remaining`,
      harsh_braking: "Harsh braking event detected — safety score deducted",
      geofence_breach: "Vehicle exited designated operating zone",
      engine_off: "Engine switched off in unauthorised location",
      sos: "Driver triggered SOS emergency alert",
      tampering: "Potential GPS device tampering detected",
      accident: "Possible collision — airbag sensor triggered",
    }[type],
    position: { lat: -26.20 + rand(-4, 4), lng: 28.05 + rand(-5, 5) },
    detectedAt: ago(rand(0, 480)),
    resolvedAt: i < 5 ? ago(rand(0, 60)) : null,
    acknowledged: i < 8,
    value: type === "speeding" ? rand(90, 140) : null,
  };
});

const GEOFENCES = [
  { id: "gf-001", name: "Johannesburg CBD",    description: "Central business district operating zone", shape: "circle", centerLat: -26.2041, centerLng: 28.0473, radiusM: 8000,  active: true,  triggerOn: "exit",  alertVehicleGroups: ["Delivery","Executive"], createdAt: ago(43800), breachCount: 12 },
  { id: "gf-002", name: "Cape Town Metro",      description: "Cape Town metropolitan area",              shape: "circle", centerLat: -33.9249, centerLng: 18.4241, radiusM: 15000, active: true,  triggerOn: "both",  alertVehicleGroups: ["Logistics"],            createdAt: ago(30000), breachCount: 7  },
  { id: "gf-003", name: "Durban Port Zone",     description: "Port operations area",                    shape: "circle", centerLat: -29.8587, centerLng: 31.0218, radiusM: 5000,  active: true,  triggerOn: "enter", alertVehicleGroups: ["Field"],                createdAt: ago(20000), breachCount: 3  },
  { id: "gf-004", name: "Pretoria HQ",          description: "Company headquarters zone",               shape: "circle", centerLat: -25.7479, centerLng: 28.2293, radiusM: 3000,  active: true,  triggerOn: "exit",  alertVehicleGroups: ["Security","Maintenance"],createdAt: ago(43800), breachCount: 1  },
  { id: "gf-005", name: "Restricted Night Zone", description: "Vehicles must return by 22:00",          shape: "circle", centerLat: -26.1052, centerLng: 28.0560, radiusM: 20000, active: false, triggerOn: "both",  alertVehicleGroups: ["Delivery"],             createdAt: ago(8760),  breachCount: 0  },
];

export const vehicleMock = {
  positions: () => ({
    success: true,
    data: VEHICLE_POSITIONS.map(v => ({
      id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model,
      fleetGroup: v.fleetGroup, status: v.status,
      position: v.position, speedKph: v.speedKph, fuelPercent: v.fuelPercent, lastSeen: v.lastSeen,
    })),
  }),

  list: (params?: Record<string, string>) => {
    let data = VEHICLE_POSITIONS as typeof VEHICLE_POSITIONS;
    if (params?.status && params.status !== "all") data = data.filter(v => v.status === params.status);
    if (params?.fleetGroup) data = data.filter(v => v.fleetGroup === params.fleetGroup);
    return { success: true, data, meta: { total: data.length } };
  },

  snapshot: () => ({
    success: true, data: {
      timestamp: new Date().toISOString(),
      totalVehicles:   50,
      movingNow:       VEHICLE_POSITIONS.filter(v => v.status === "moving").length,
      idleNow:         VEHICLE_POSITIONS.filter(v => v.status === "idle").length,
      stoppedNow:      VEHICLE_POSITIONS.filter(v => v.status === "stopped").length,
      offlineNow:      VEHICLE_POSITIONS.filter(v => v.status === "offline").length,
      maintenanceNow:  VEHICLE_POSITIONS.filter(v => v.status === "maintenance").length,
      activeAlerts:    FLEET_ALERTS.filter(a => !a.resolvedAt).length,
      avgSpeedKph:     Math.round(VEHICLE_POSITIONS.filter(v=>v.speedKph>0).reduce((s,v)=>s+v.speedKph,0) / Math.max(1, VEHICLE_POSITIONS.filter(v=>v.speedKph>0).length)),
      avgFuelPercent:  Math.round(VEHICLE_POSITIONS.reduce((s,v)=>s+v.fuelPercent,0) / VEHICLE_POSITIONS.length),
      totalKmToday:    randF(1800, 4200),
      activeDrivers:   25,
      geofenceBreaches: 3,
    },
  }),

  getVehicle: (id: string) => {
    const v = VEHICLE_POSITIONS.find(v => v.id === id) ?? VEHICLE_POSITIONS[0];
    return { success: true, data: v };
  },

  update: () => ({ success: true, data: {} }),

  history: (id: string) => ({
    success: true,
    data: Array.from({ length: 20 }, (_, i) => ({
      lat: -26.20 + Math.sin(i * 0.3) * 0.05,
      lng: 28.05 + Math.cos(i * 0.3) * 0.05,
      speedKph: rand(30, 110), timestamp: ago(20 - i),
    })),
  }),

  drivers: (params?: Record<string, string>) => {
    let data = FLEET_DRIVERS;
    if (params?.status) data = data.filter(d => d.status === params.status);
    return { success: true, data, meta: { total: data.length } };
  },

  driver: (id: string) => {
    const d = FLEET_DRIVERS.find(d => d.id === id) ?? FLEET_DRIVERS[0];
    return { success: true, data: d };
  },

  assignDriver: () => ({ success: true, data: {} }),

  alerts: (params?: Record<string, string>) => {
    let data = FLEET_ALERTS;
    if (params?.resolved === "false") data = data.filter(a => !a.resolvedAt);
    if (params?.resolved === "true")  data = data.filter(a => !!a.resolvedAt);
    if (params?.severity) data = data.filter(a => a.severity === params.severity);
    data.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    return { success: true, data, meta: { total: FLEET_ALERTS.length, active: FLEET_ALERTS.filter(a => !a.resolvedAt).length } };
  },

  acknowledgeAlert: (id: string) => ({ success: true, data: { id, acknowledged: true } }),
  resolveAlert:     (id: string) => ({ success: true, data: { id, resolvedAt: new Date().toISOString() } }),

  geofences: () => ({ success: true, data: GEOFENCES }),
  createGeofence: (body: unknown) => ({ success: true, data: { id: uuid(), ...(body as object), createdAt: new Date().toISOString(), breachCount: 0 } }),
  updateGeofence: (id: string, body: unknown) => ({ success: true, data: { id, ...(body as object) } }),
  deleteGeofence: (id: string) => ({ success: true, message: `Geofence ${id} deleted` }),

  trips: () => ({
    success: true,
    data: Array.from({ length: 15 }, (_, i) => ({
      id: uuid(), vehicleId: `veh-${String((i % 50) + 1).padStart(3, "0")}`,
      driverId: `drv-${String((i % 30) + 1).padStart(3, "0")}`,
      startTime: ago(rand(60, 480)), endTime: ago(rand(0, 59)),
      distanceKm: randF(5, 120), avgSpeedKph: rand(40, 90), maxSpeedKph: rand(90, 130),
      fuelUsedL: randF(3, 15), ongoing: i === 0,
      startPos: { lat: -26.20, lng: 28.05 }, endPos: { lat: -26.25, lng: 28.10 },
    })),
  }),

  analytics: () => ({
    success: true,
    data: {
      byFleet: GROUPS.map(g => ({
        fleet: g, count: Math.floor(50 / GROUPS.length) + rand(0, 3),
        moving: rand(2, 6), avgFuel: rand(50, 80), avgSpeed: rand(40, 70),
      })),
      byStatus: (["moving","idle","stopped","offline","maintenance"] as const).map(s => ({
        status: s, count: VEHICLE_POSITIONS.filter(v => v.status === s).length,
        pct: Math.round((VEHICLE_POSITIONS.filter(v => v.status === s).length / 50) * 100),
      })),
      alertsByType: (["speeding","low_fuel","harsh_braking","geofence_breach","engine_off","sos","tampering","accident"] as const).map(t => ({
        type: t, count: FLEET_ALERTS.filter(a => a.type === t).length,
        active: FLEET_ALERTS.filter(a => a.type === t && !a.resolvedAt).length,
      })),
      topDrivers: FLEET_DRIVERS.slice(0, 5).map(d => ({ ...d, trips: rand(10, 40) })),
      totalKmToday: randF(3000, 8000), avgFuelConsumption: randF(9, 14),
    },
  }),
};

