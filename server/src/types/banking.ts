// ─── Enums ────────────────────────────────────────────────────────────────────

export type BankAccountType   = "current" | "savings" | "business" | "wallet" | "treasury";
export type BankAccountStatus = "active" | "frozen" | "closed" | "pending_kyc";
export type CardType          = "virtual" | "physical";
export type CardNetwork       = "visa" | "mastercard";
export type CardStatus        = "active" | "frozen" | "blocked" | "expired" | "pending";
export type CardTier          = "standard" | "premium" | "platinum" | "corporate" | "fuel";
export type UserRole          = "passenger" | "driver" | "investor" | "owner" | "admin" | "compliance" | "treasury";
export type KycStatus         = "not_started" | "pending" | "in_review" | "approved" | "rejected" | "expired";
export type AmlStatus         = "clear" | "flagged" | "blocked" | "under_review";
export type TxnType           = "credit" | "debit";
export type TxnCategory       = "transfer" | "card_payment" | "atm" | "deposit" | "withdrawal" | "fee" | "interest" | "dividend" | "earnings" | "payout" | "refund" | "fx";
export type TxnStatus         = "pending" | "completed" | "failed" | "reversed";
export type PaymentRail       = "internal" | "ach" | "sepa" | "swift" | "faster_payments" | "rtp" | "visa_direct" | "mastercard_send";
export type FraudRisk         = "low" | "medium" | "high" | "critical";
export type ComplianceFlag    = "pep" | "ofac" | "sanctions" | "sar" | "high_risk_country";
export type Currency          = "ZAR" | "USD" | "EUR" | "GBP" | "NGN" | "KES";

// ─── Bank User ────────────────────────────────────────────────────────────────

export interface BankUser {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalId: string;
  dateOfBirth: string;
  address: string;
  country: string;
  kycStatus: KycStatus;
  amlStatus: AmlStatus;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  profilePhoto: string | null;
  complianceFlags: ComplianceFlag[];
}

// ─── Bank Account ─────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  userId: string;
  accountNumber: string;
  iban: string;
  sortCode: string;
  type: BankAccountType;
  currency: Currency;
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  status: BankAccountStatus;
  interestRate: number;
  overdraftLimit: number;
  createdAt: string;
  label: string;
}

// ─── Bank Card ────────────────────────────────────────────────────────────────

export interface BankCard {
  id: string;
  userId: string;
  accountId: string;
  network: CardNetwork;
  type: CardType;
  tier: CardTier;
  pan: string;           // masked e.g. 4242 **** **** 1234
  last4: string;
  expiry: string;        // MM/YY
  cvv: string;           // masked ***
  nameOnCard: string;
  status: CardStatus;
  contactless: boolean;
  applePayEnrolled: boolean;
  googlePayEnrolled: boolean;
  dailyLimit: number;
  monthlyLimit: number;
  spentToday: number;
  spentThisMonth: number;
  atmWithdrawalLimit: number;
  onlineTxnEnabled: boolean;
  internationalEnabled: boolean;
  issuedAt: string;
  lastUsedAt: string | null;
  tokenized: boolean;
  binCode: string;
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export interface Wallet {
  id: string;
  userId: string;
  currency: Currency;
  balance: number;
  label: string;
  createdAt: string;
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export interface BankTxn {
  id: string;
  accountId: string;
  userId: string;
  type: TxnType;
  category: TxnCategory;
  amount: number;
  currency: Currency;
  fxRate: number | null;
  description: string;
  reference: string;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  rail: PaymentRail;
  status: TxnStatus;
  cardId: string | null;
  merchantName: string | null;
  merchantCategory: string | null;
  location: string | null;
  fraudScore: number;
  flagged: boolean;
  createdAt: string;
  settledAt: string | null;
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  fromUserId: string;
  fromAccountId: string;
  toUserId: string | null;
  toAccountId: string | null;
  toIban: string | null;
  amount: number;
  currency: Currency;
  rail: PaymentRail;
  reference: string;
  description: string;
  status: TxnStatus;
  feeAmount: number;
  createdAt: string;
  executedAt: string | null;
}

// ─── KYC Record ───────────────────────────────────────────────────────────────

export interface KycRecord {
  id: string;
  userId: string;
  status: KycStatus;
  documentType: "passport" | "national_id" | "drivers_licence";
  documentNumber: string;
  documentCountry: string;
  documentExpiry: string;
  faceMatchScore: number | null;   // 0-100
  addressVerified: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}

// ─── AML / Compliance ─────────────────────────────────────────────────────────

export interface AmlCheck {
  id: string;
  userId: string;
  checkType: "ofac" | "pep" | "sanctions" | "adverse_media";
  result: "clear" | "match" | "possible_match";
  matchName: string | null;
  riskScore: number;
  checkedAt: string;
  reviewedAt: string | null;
  sarFiled: boolean;
}

// ─── Fraud Alert ──────────────────────────────────────────────────────────────

export interface BankFraudAlert {
  id: string;
  userId: string;
  accountId: string;
  txnId: string | null;
  riskLevel: FraudRisk;
  ruleTriggered: string;
  description: string;
  blocked: boolean;
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

// ─── Treasury ─────────────────────────────────────────────────────────────────

export interface TreasuryAccount {
  id: string;
  label: string;
  currency: Currency;
  balance: number;
  reserveBalance: number;
  purpose: "settlement" | "reserve" | "revenue" | "operational" | "suspense";
}

export interface SettlementRecord {
  id: string;
  date: string;
  totalVolume: number;
  netAmount: number;
  currency: Currency;
  network: CardNetwork | "internal";
  txnCount: number;
  status: "pending" | "in_progress" | "settled" | "failed";
  settledAt: string | null;
}

// ─── Revenue Split ────────────────────────────────────────────────────────────

export interface RevenueSplit {
  id: string;
  sourceType: "ride_fare" | "card_fee" | "fx_margin" | "interest";
  totalAmount: number;
  currency: Currency;
  splits: { recipient: UserRole; percentage: number; amount: number }[];
  createdAt: string;
}

// ─── Investor Portfolio ───────────────────────────────────────────────────────

export interface InvestorPortfolio {
  userId: string;
  capitalDeposited: number;
  currentValue: number;
  totalReturns: number;
  returnPct: number;
  dividendsPaid: number;
  revenueSharePct: number;
  nextDividendDate: string;
  lastStatement: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface BankNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: "transaction" | "card" | "kyc" | "fraud" | "payment" | "system";
  read: boolean;
  createdAt: string;
}

// ─── Platform KPIs ────────────────────────────────────────────────────────────

export interface BankingKpi {
  timestamp: string;
  totalUsers: number;
  activeCards: number;
  totalVolume24h: number;
  txnCount24h: number;
  fraudAlertsActive: number;
  kycPending: number;
  treasuryBalance: number;
  revenueToday: number;
  avgFraudScore: number;
  settlementsPending: number;
}
