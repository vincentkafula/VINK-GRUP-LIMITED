import { v4 as uuid } from "uuid";
import type {
  BankUser, BankAccount, BankCard, Wallet, BankTxn, Payment,
  KycRecord, AmlCheck, BankFraudAlert, TreasuryAccount,
  SettlementRecord, RevenueSplit, InvestorPortfolio,
  BankNotification, BankingKpi,
} from "../types/banking.js";

const rand  = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF = (min: number, max: number) => +(Math.random() * (max - min) + min).toFixed(2);
const ago   = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().split("T")[0];
const acctNo = (i: number) => `VNK${String(1000000 + i).padStart(8, "0")}`;
const iban   = (i: number) => `ZA${String(21).padStart(2,"0")} VINK ${acctNo(i)} 0001`;

// ─── USERS ────────────────────────────────────────────────────────────────────
const USERS_SEED: Partial<BankUser>[] = [
  { role: "passenger", firstName: "Margaret", lastName: "Botha",     email: "margaret@example.com",  phone: "+27821000001", nationalId: "8001015009087", kycStatus: "approved", amlStatus: "clear" },
  { role: "passenger", firstName: "Johannes",  lastName: "van Berg",  email: "johannes@example.com",  phone: "+27821000002", nationalId: "7505125009081", kycStatus: "approved", amlStatus: "clear" },
  { role: "driver",    firstName: "Themba",    lastName: "Dlamini",   email: "themba@example.com",    phone: "+27811000001", nationalId: "8503105009082", kycStatus: "approved", amlStatus: "clear" },
  { role: "driver",    firstName: "Sipho",     lastName: "Ndlovu",    email: "sipho@example.com",     phone: "+27811000002", nationalId: "9001015009083", kycStatus: "approved", amlStatus: "clear" },
  { role: "investor",  firstName: "Patricia",  lastName: "Osei",      email: "patricia@example.com",  phone: "+27831000001", nationalId: "7209145009084", kycStatus: "approved", amlStatus: "clear" },
  { role: "investor",  firstName: "David",     lastName: "Nkosi",     email: "david@example.com",     phone: "+27831000002", nationalId: "6805045009085", kycStatus: "in_review", amlStatus: "under_review" },
  { role: "owner",     firstName: "Vincent",   lastName: "Karimi",    email: "vincent@example.com",   phone: "+27841000001", nationalId: "7712035009086", kycStatus: "approved", amlStatus: "clear" },
  { role: "admin",     firstName: "Sarah",     lastName: "Williams",  email: "admin@vink.com",        phone: "+27851000001", nationalId: "8204125009087", kycStatus: "approved", amlStatus: "clear" },
  { role: "compliance",firstName: "Nadia",     lastName: "Petersen",  email: "compliance@vink.com",   phone: "+27851000002", nationalId: "8506035009088", kycStatus: "approved", amlStatus: "clear" },
  { role: "treasury",  firstName: "James",     lastName: "Molefe",    email: "treasury@vink.com",     phone: "+27851000003", nationalId: "7901155009089", kycStatus: "approved", amlStatus: "clear" },
  { role: "passenger", firstName: "Amahle",    lastName: "Ngcobo",    email: "amahle@example.com",    phone: "+27821000003", nationalId: "9203015009090", kycStatus: "pending",   amlStatus: "clear" },
  { role: "driver",    firstName: "Farai",     lastName: "Moyo",      email: "farai@example.com",     phone: "+27811000003", nationalId: "8811055009091", kycStatus: "approved", amlStatus: "clear" },
];

export const bankDb = {
  users: USERS_SEED.map((u, i) => ({
    id: uuid(), role: u.role!, firstName: u.firstName!, lastName: u.lastName!,
    email: u.email!, phone: u.phone!, nationalId: u.nationalId!,
    dateOfBirth: "1985-03-15", address: `${rand(1,999)} Main Road, Cape Town`,
    country: "ZA", kycStatus: u.kycStatus!, amlStatus: u.amlStatus!,
    mfaEnabled: i < 7, createdAt: ago(rand(4380, 43800)),
    lastLoginAt: ago(rand(0, 300)), profilePhoto: null, complianceFlags: [],
  })) as BankUser[],

  accounts: [] as BankAccount[],
  cards: [] as BankCard[],
  wallets: [] as Wallet[],
  txns: [] as BankTxn[],
  payments: [] as Payment[],
  kyc: [] as KycRecord[],
  aml: [] as AmlCheck[],
  fraudAlerts: [] as BankFraudAlert[],
  treasury: [] as TreasuryAccount[],
  settlements: [] as SettlementRecord[],
  revenueSplits: [] as RevenueSplit[],
  portfolios: [] as InvestorPortfolio[],
  notifications: [] as BankNotification[],
};

// ─── ACCOUNTS ─────────────────────────────────────────────────────────────────
function seedAccounts() {
  bankDb.users.forEach((user, i) => {
    const isBusiness = user.role === "owner";
    const isInvestor = user.role === "investor";
    const isDriver   = user.role === "driver";

    // Primary account
    bankDb.accounts.push({
      id: uuid(), userId: user.id,
      accountNumber: acctNo(i), iban: iban(i), sortCode: "30-00-01",
      type: isBusiness ? "business" : isDriver ? "wallet" : "current",
      currency: "ZAR",
      balance: isBusiness ? randF(500000, 2000000) : isInvestor ? randF(100000, 500000) : randF(1000, 50000),
      availableBalance: 0, pendingBalance: randF(0, 1000),
      status: user.kycStatus === "approved" ? "active" : "pending_kyc",
      interestRate: isInvestor ? 6.5 : 2.5, overdraftLimit: isBusiness ? 50000 : 5000,
      createdAt: user.createdAt, label: isBusiness ? "Business Account" : isDriver ? "Earnings Wallet" : "Primary Account",
    });

    // Savings account for passengers/investors
    if (user.role === "passenger" || user.role === "investor") {
      bankDb.accounts.push({
        id: uuid(), userId: user.id, accountNumber: acctNo(i + 100),
        iban: iban(i + 100), sortCode: "30-00-01", type: "savings", currency: "ZAR",
        balance: randF(5000, 100000), availableBalance: 0, pendingBalance: 0,
        status: "active", interestRate: 8.0, overdraftLimit: 0,
        createdAt: user.createdAt, label: "Savings Account",
      });
    }

    // Fix available balances
    bankDb.accounts.filter(a => a.userId === user.id).forEach(a => {
      a.availableBalance = a.balance - a.pendingBalance;
    });
  });
}

// ─── CARDS ────────────────────────────────────────────────────────────────────
function seedCards() {
  bankDb.users.filter(u => ["passenger","driver","investor","owner"].includes(u.role)).forEach((user, i) => {
    const acct = bankDb.accounts.find(a => a.userId === user.id)!;
    if (!acct) return;

    // Virtual card
    const network1 = i % 2 === 0 ? "visa" : "mastercard";
    bankDb.cards.push({
      id: uuid(), userId: user.id, accountId: acct.id,
      network: network1, type: "virtual",
      tier: user.role === "investor" ? "premium" : user.role === "owner" ? "corporate" : user.role === "driver" ? "standard" : "standard",
      pan: `${network1 === "visa" ? "4" : "5"}242 **** **** ${String(rand(1000,9999))}`,
      last4: String(rand(1000, 9999)),
      expiry: `${String(rand(1,12)).padStart(2,"0")}/${future(365 * 3).slice(2,4)}`,
      cvv: "***", nameOnCard: `${user.firstName} ${user.lastName}`.toUpperCase(),
      status: acct.status === "active" ? "active" : "pending",
      contactless: true, applePayEnrolled: i % 3 === 0, googlePayEnrolled: i % 2 === 0,
      dailyLimit: user.role === "owner" ? 100000 : user.role === "investor" ? 50000 : 10000,
      monthlyLimit: user.role === "owner" ? 500000 : user.role === "investor" ? 200000 : 50000,
      spentToday: randF(0, 1000), spentThisMonth: randF(0, 8000),
      atmWithdrawalLimit: 5000, onlineTxnEnabled: true, internationalEnabled: i % 3 !== 0,
      issuedAt: ago(rand(720, 8760)), lastUsedAt: ago(rand(0, 4320)), tokenized: true,
      binCode: network1 === "visa" ? "424242" : "520000",
    });

    // Physical card for qualifying users
    if (user.role !== "driver" || i < 2) {
      const network2 = network1 === "visa" ? "mastercard" : "visa";
      bankDb.cards.push({
        id: uuid(), userId: user.id, accountId: acct.id,
        network: network2, type: "physical",
        tier: user.role === "owner" ? "platinum" : user.role === "investor" ? "premium" : "standard",
        pan: `${network2 === "visa" ? "4" : "5"}111 **** **** ${String(rand(1000,9999))}`,
        last4: String(rand(1000, 9999)),
        expiry: `${String(rand(1,12)).padStart(2,"0")}/${future(365 * 4).slice(2,4)}`,
        cvv: "***", nameOnCard: `${user.firstName} ${user.lastName}`.toUpperCase(),
        status: "active", contactless: true, applePayEnrolled: false, googlePayEnrolled: false,
        dailyLimit: user.role === "owner" ? 150000 : 20000,
        monthlyLimit: user.role === "owner" ? 800000 : 80000,
        spentToday: randF(0, 500), spentThisMonth: randF(0, 5000),
        atmWithdrawalLimit: 10000, onlineTxnEnabled: true, internationalEnabled: true,
        issuedAt: ago(rand(1440, 17520)), lastUsedAt: ago(rand(0, 1440)), tokenized: true,
        binCode: network2 === "visa" ? "411111" : "511111",
      });
    }
  });
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
const MERCHANTS = ["Woolworths","Pick n Pay","Checkers","Shell","BP","Clicks","Dis-Chem","Takealot","Netflix","MTN"];
const CATEGORIES = ["Groceries","Fuel","Pharmacy","E-commerce","Entertainment","Mobile","Restaurant","Transport","Healthcare","Utilities"];

function seedTransactions() {
  bankDb.accounts.forEach(acct => {
    const user = bankDb.users.find(u => u.id === acct.userId)!;
    const txnCount = rand(8, 30);
    for (let i = 0; i < txnCount; i++) {
      const isCredit = i % 5 === 0 || (user.role === "driver" && i % 3 === 0);
      const midx = rand(0, MERCHANTS.length - 1);
      bankDb.txns.push({
        id: uuid(), accountId: acct.id, userId: acct.userId,
        type: isCredit ? "credit" : "debit",
        category: isCredit ? (user.role === "driver" ? "earnings" : "deposit") : "card_payment",
        amount: randF(isCredit ? 500 : 50, isCredit ? 10000 : 2000),
        currency: "ZAR", fxRate: null,
        description: isCredit ? (user.role === "driver" ? "Trip earnings" : "Account deposit") : `Payment at ${MERCHANTS[midx]}`,
        reference: `VNK${String(rand(1000000,9999999))}`,
        counterpartyName: isCredit ? "VINK PLATFORM" : MERCHANTS[midx],
        counterpartyAccount: null,
        rail: isCredit ? "internal" : "visa_direct",
        status: "completed", cardId: isCredit ? null : (bankDb.cards.find(c => c.accountId === acct.id)?.id ?? null),
        merchantName: isCredit ? null : MERCHANTS[midx],
        merchantCategory: isCredit ? null : CATEGORIES[midx],
        location: isCredit ? null : "Cape Town, ZA",
        fraudScore: rand(0, 15), flagged: false,
        createdAt: ago(rand(0, 10080)), settledAt: ago(rand(0, 9000)),
      });
    }
  });

  // Seed some fraud-flagged txns
  for (let i = 0; i < 5; i++) {
    const acct = bankDb.accounts[rand(0, 3)];
    bankDb.txns.push({
      id: uuid(), accountId: acct.id, userId: acct.userId, type: "debit",
      category: "card_payment", amount: randF(5000, 50000), currency: "ZAR", fxRate: null,
      description: "Suspicious international transaction", reference: `SUSP${rand(100000,999999)}`,
      counterpartyName: "UNKNOWN MERCHANT", counterpartyAccount: null, rail: "visa_direct",
      status: "pending", cardId: null, merchantName: "UNKNOWN", merchantCategory: "Other",
      location: "Moscow, RU", fraudScore: rand(75, 99), flagged: true,
      createdAt: ago(rand(0, 120)), settledAt: null,
    });
  }
}

// ─── KYC ─────────────────────────────────────────────────────────────────────
function seedKyc() {
  bankDb.users.forEach(u => {
    bankDb.kyc.push({
      id: uuid(), userId: u.id,
      status: u.kycStatus === "approved" ? "approved" : u.kycStatus === "pending" ? "pending" : "in_review",
      documentType: "national_id", documentNumber: u.nationalId,
      documentCountry: "ZA", documentExpiry: future(365 * 10),
      faceMatchScore: u.kycStatus === "approved" ? rand(88, 99) : null,
      addressVerified: u.kycStatus === "approved",
      submittedAt: ago(rand(720, 4320)),
      reviewedAt: u.kycStatus === "approved" ? ago(rand(60, 720)) : null,
      reviewedBy: u.kycStatus === "approved" ? "compliance@vink.com" : null,
      rejectionReason: null,
    });
  });
}

// ─── FRAUD ALERTS ──────────────────────────────────────────────────────────────
function seedFraud() {
  const rules = ["velocity_check","geo_anomaly","device_new","high_value_unusual","foreign_txn","card_not_present","multiple_declines","atm_cluster"];
  for (let i = 0; i < 12; i++) {
    const user = bankDb.users[rand(0, bankDb.users.length - 1)];
    const acct = bankDb.accounts.find(a => a.userId === user.id);
    if (!acct) continue;
    bankDb.fraudAlerts.push({
      id: uuid(), userId: user.id, accountId: acct.id, txnId: null,
      riskLevel: (["low","medium","high","critical"][rand(0,3)]) as BankFraudAlert["riskLevel"],
      ruleTriggered: rules[rand(0, rules.length - 1)],
      description: `Suspicious activity detected — ${rules[rand(0, rules.length - 1)].replace(/_/g," ")}`,
      blocked: rand(0,1) === 1, resolved: i < 4,
      createdAt: ago(rand(0, 2880)), resolvedAt: i < 4 ? ago(rand(0, 60)) : null,
    });
  }
}

// ─── TREASURY ─────────────────────────────────────────────────────────────────
function seedTreasury() {
  [
    { label: "Settlement Account",  purpose: "settlement" as const, balance: 12_500_000, reserve: 2_500_000 },
    { label: "Reserve Fund",        purpose: "reserve" as const,    balance: 45_000_000, reserve: 45_000_000 },
    { label: "Revenue Account",     purpose: "revenue" as const,    balance: 3_200_000,  reserve: 0 },
    { label: "Operational Account", purpose: "operational" as const, balance: 8_100_000, reserve: 500_000 },
    { label: "Suspense Account",    purpose: "suspense" as const,   balance: 145_000,    reserve: 0 },
  ].forEach(t => bankDb.treasury.push({ id: uuid(), label: t.label, currency: "ZAR", balance: t.balance, reserveBalance: t.reserve, purpose: t.purpose }));

  // Settlements
  for (let i = 0; i < 15; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    bankDb.settlements.push({
      id: uuid(), date: d.toISOString().split("T")[0],
      totalVolume: randF(800000, 3000000), netAmount: randF(780000, 2950000),
      currency: "ZAR", network: (["visa","mastercard","internal"][i % 3]) as SettlementRecord["network"],
      txnCount: rand(2000, 15000), status: i === 0 ? "in_progress" : "settled",
      settledAt: i === 0 ? null : ago((i - 1) * 1440),
    });
  }

  // Revenue splits
  for (let i = 0; i < 10; i++) {
    const total = randF(50000, 200000);
    bankDb.revenueSplits.push({
      id: uuid(), sourceType: "ride_fare", totalAmount: total, currency: "ZAR",
      splits: [
        { recipient: "passenger", percentage: 0,   amount: 0 },
        { recipient: "driver",    percentage: 75,  amount: +(total * 0.75).toFixed(2) },
        { recipient: "investor",  percentage: 10,  amount: +(total * 0.10).toFixed(2) },
        { recipient: "owner",     percentage: 15,  amount: +(total * 0.15).toFixed(2) },
      ],
      createdAt: ago(rand(0, 10080)),
    });
  }

  // Investor portfolios
  bankDb.users.filter(u => u.role === "investor").forEach(u => {
    const capital = randF(500000, 5000000);
    bankDb.portfolios.push({
      userId: u.id, capitalDeposited: capital,
      currentValue: +(capital * randF(1.05, 1.25)).toFixed(2),
      totalReturns: +(capital * randF(0.08, 0.22)).toFixed(2),
      returnPct: randF(8, 22), dividendsPaid: randF(20000, 150000),
      revenueSharePct: 10, nextDividendDate: future(rand(5, 45)),
      lastStatement: ago(rand(720, 2160)),
    });
  });
}

// ─── AML ─────────────────────────────────────────────────────────────────────
function seedAml() {
  bankDb.users.forEach(u => {
    bankDb.aml.push({
      id: uuid(), userId: u.id, checkType: "ofac",
      result: u.amlStatus === "flagged" ? "possible_match" : "clear",
      matchName: null, riskScore: u.amlStatus === "clear" ? rand(0, 15) : rand(60, 90),
      checkedAt: ago(rand(0, 4320)), reviewedAt: ago(rand(0, 1440)), sarFiled: false,
    });
  });
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
function seedNotifications() {
  bankDb.users.slice(0, 6).forEach(u => {
    bankDb.notifications.push(
      { id: uuid(), userId: u.id, title: "Transaction alert", body: `R${randF(50,500).toFixed(2)} debited from your account`, type: "transaction", read: false, createdAt: ago(rand(0,120)) },
      { id: uuid(), userId: u.id, title: "Card statement ready", body: "Your monthly statement is ready", type: "card", read: true, createdAt: ago(rand(120,720)) },
    );
  });
}

// ─── Run seeds ────────────────────────────────────────────────────────────────
seedAccounts();
seedCards();
seedTransactions();
seedKyc();
seedFraud();
seedTreasury();
seedAml();
seedNotifications();

// ─── Live KPIs ────────────────────────────────────────────────────────────────
export function getBankingKpi(): BankingKpi {
  return {
    timestamp: new Date().toISOString(),
    totalUsers: bankDb.users.length,
    activeCards: bankDb.cards.filter(c => c.status === "active").length,
    totalVolume24h: +bankDb.txns.filter(t => new Date(t.createdAt).getTime() > Date.now() - 86_400_000).reduce((s,t)=>s+t.amount,0).toFixed(2),
    txnCount24h: bankDb.txns.filter(t => new Date(t.createdAt).getTime() > Date.now() - 86_400_000).length,
    fraudAlertsActive: bankDb.fraudAlerts.filter(f => !f.resolved).length,
    kycPending: bankDb.kyc.filter(k => k.status === "pending" || k.status === "in_review").length,
    treasuryBalance: bankDb.treasury.reduce((s,t) => s + t.balance, 0),
    revenueToday: bankDb.revenueSplits.slice(-3).reduce((s,r) => s + r.splits.find(x=>x.recipient==="owner")!.amount, 0),
    avgFraudScore: +(bankDb.txns.reduce((s,t)=>s+t.fraudScore,0)/Math.max(bankDb.txns.length,1)).toFixed(1),
    settlementsPending: bankDb.settlements.filter(s=>s.status==="pending"||s.status==="in_progress").length,
  };
}
