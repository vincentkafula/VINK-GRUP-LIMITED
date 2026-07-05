// ─── Global Unified Banking & Card System — Types ─────────────────────────────

export type SupportedCurrency = "ZAR" | "ZMW" | "EUR" | "USD" | "CNY";
export type SupportedCountry  = "ZA" | "ZM" | "EU" | "US" | "CN";
export type CardType    = "debit" | "virtual" | "business" | "sub-account";
export type CardStatus  = "active" | "frozen" | "blocked" | "pending";
export type CardNetwork = "visa" | "mastercard";
export type DepositChannel = "eft" | "swift" | "rtgs" | "sepa" | "ach" | "mobile_money" | "cash_agent" | "online_qr" | "instant_eft" | "wechat" | "alipay";
export type TxnDirection = "credit" | "debit";
export type TxnChannel   = "card_pos" | "card_online" | "atm" | "p2p" | "deposit" | "fx_conversion" | "fee";
export type KycStatus    = "not_started" | "pending" | "approved" | "rejected" | "expired";
export type AmlFlag      = "clear" | "flagged" | "blocked" | "review";
export type NostroCountry = "ZA" | "ZM" | "EU" | "US" | "CN";

// ─── Unified Reference Account ────────────────────────────────────────────────

export interface UnifiedAccount {
  id: string;
  referenceNumber: string;   // e.g. VMS-GBL-2024-00001
  customerId: string;
  customerName: string;
  email: string;
  phone: string;
  baseCurrency: SupportedCurrency;
  kycStatus: KycStatus;
  amlFlag: AmlFlag;
  createdAt: string;
  lastActivityAt: string;
  tier: "standard" | "premium" | "business" | "corporate";
  // Multi-currency balances (live)
  balances: Record<SupportedCurrency, number>;
  // Linked cards
  cardIds: string[];
  // Sub-accounts
  subAccountIds: string[];
  // Compliance flags
  popiaConcent: boolean;
  gdprConsent: boolean;
  fatfChecked: boolean;
}

// ─── Nostro (Mirror) Accounts ─────────────────────────────────────────────────

export interface NostroAccount {
  id: string;
  country: NostroCountry;
  currency: SupportedCurrency;
  bankName: string;           // e.g. "Standard Bank ZA", "Zanaco Zambia"
  accountNumber: string;
  swiftBic: string;
  balance: number;            // VMS's own funds in that country
  minReserveRequired: number;
  lastReconciledAt: string;
  status: "active" | "inactive" | "reconciling";
  centralBank: string;        // SARB, BoZ, ECB, FedReserve, PBOC
  paymentRails: string[];     // EFT, SEPA, ACH, etc.
}

// ─── FX Engine ────────────────────────────────────────────────────────────────

export interface FxRate {
  fromCurrency: SupportedCurrency;
  toCurrency: SupportedCurrency;
  interbankRate: number;
  customerRate: number;       // interbank + spread (0.5–1%)
  spread: number;             // percentage
  updatedAt: string;
}

export interface FxConversion {
  id: string;
  accountId: string;
  fromCurrency: SupportedCurrency;
  toCurrency: SupportedCurrency;
  fromAmount: number;
  toAmount: number;
  rate: number;
  feeAmount: number;
  feeCurrency: SupportedCurrency;
  status: "completed" | "pending" | "failed";
  createdAt: string;
}

// ─── Card Issuance ────────────────────────────────────────────────────────────

export interface GlobalCard {
  id: string;
  accountId: string;
  customerId: string;
  type: CardType;
  network: CardNetwork;
  pan: string;                // masked: •••• •••• •••• 4291
  last4: string;
  expiry: string;             // MM/YY
  cvv: string;                // masked ***
  nameOnCard: string;
  status: CardStatus;
  binCountry: SupportedCountry;  // which country's BIN
  currency: SupportedCurrency;
  dailyLimit: number;
  monthlyLimit: number;
  spentToday: number;
  spentThisMonth: number;
  atmEnabled: boolean;
  onlineEnabled: boolean;
  internationalEnabled: boolean;
  contactlessEnabled: boolean;
  virtualCardToken?: string;
  parentCardId?: string;      // for sub-account cards
  subAccountLimit?: number;
  issuedAt: string;
  lastUsedAt: string | null;
}

// ─── Global Transactions ──────────────────────────────────────────────────────

export interface GlobalTransaction {
  id: string;
  accountId: string;
  cardId: string | null;
  direction: TxnDirection;
  channel: TxnChannel;
  localAmount: number;
  localCurrency: SupportedCurrency;
  billedAmount: number;
  billedCurrency: SupportedCurrency;
  fxRate: number | null;
  fxFee: number;
  description: string;
  merchantName: string | null;
  merchantCategory: string | null;
  merchantCountry: SupportedCountry | null;
  nostroAccountId: string | null;  // which nostro settled this
  status: "completed" | "pending" | "declined" | "reversed";
  authCode: string | null;
  createdAt: string;
  settledAt: string | null;
  interchangeEarned: number;   // VMS income on this txn
  domesticRouting: boolean;    // true = no international fee
}

// ─── Deposit Channels ──────────────────────────────────────────────────────────

export interface DepositRecord {
  id: string;
  accountId: string;
  channel: DepositChannel;
  amount: number;
  currency: SupportedCurrency;
  reference: string;
  senderName: string | null;
  senderAccount: string | null;
  nostroAccountId: string;     // which nostro received the funds
  status: "received" | "processing" | "credited" | "failed";
  creditedAmount: number | null;
  creditedCurrency: SupportedCurrency | null;
  fxRate: number | null;
  createdAt: string;
  creditedAt: string | null;
}

// ─── P2P Transfer ─────────────────────────────────────────────────────────────

export interface P2PTransfer {
  id: string;
  senderAccountId: string;
  recipientReferenceNumber: string;
  recipientName: string;
  amount: number;
  currency: SupportedCurrency;
  note: string;
  status: "completed" | "pending" | "failed";
  createdAt: string;
  completedAt: string | null;
}

// ─── KYC / Compliance ──────────────────────────────────────────────────────────

export interface KycRecord {
  id: string;
  accountId: string;
  status: KycStatus;
  tier: "basic" | "enhanced" | "full";
  documentType: "passport" | "national_id" | "drivers_licence";
  documentNumber: string;
  documentCountry: SupportedCountry;
  documentExpiry: string;
  selfieVerified: boolean;
  addressVerified: boolean;
  pepScreened: boolean;
  sanctionsScreened: boolean;
  faceMatchScore: number | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
}

export interface AmlCheck {
  id: string;
  accountId: string;
  checkType: "ofac" | "pep" | "sanctions" | "adverse_media" | "fatf";
  result: "clear" | "match" | "possible_match";
  riskScore: number;          // 0–100
  matchName: string | null;
  checkedAt: string;
  reviewedAt: string | null;
  sarFiled: boolean;
  notes: string;
}

// ─── Platform Analytics ────────────────────────────────────────────────────────

export interface GlobalBankingKpi {
  timestamp: string;
  totalAccounts: number;
  activeCards: number;
  totalVolumeUsd24h: number;
  txnCount24h: number;
  fxConversions24h: number;
  totalNostroBalance: Record<SupportedCurrency, number>;
  interchangeEarnedToday: number;
  fxRevenueToday: number;
  kycPendingCount: number;
  amlAlerts: number;
  domesticRoutingPct: number;  // % of txns routed domestically (no cross-border fee)
}
