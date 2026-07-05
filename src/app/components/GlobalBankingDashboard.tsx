/**
 * Global Unified Banking & Card System Dashboard
 * Architecture: Unified Reference Account → 5-country Nostro layer →
 * Core Engine (FX + Compliance) → Card Issuance → All Payment Channels
 *
 * Live data from Supabase Edge Function at /api/global/*
 */
import { useState, useEffect } from "react";
import {
  X, Globe, CreditCard, ArrowUpRight, ArrowDownLeft, RefreshCw,
  Shield, TrendingUp, Zap, CheckCircle,
  BarChart3, Users, Eye, EyeOff, Lock,
  DollarSign, Activity, Layers,
} from "lucide-react";
import { globalBankingApi } from "../services/applicationsApi";

interface Props { isOpen: boolean; onClose: () => void; }

// Live data state
interface LiveData {
  kpi: Record<string, unknown> | null;
  nostro: Record<string, unknown>[];
  fxRates: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  loading: boolean;
  error: string | null;
}

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = {
  ZAR: { bg: "#007A4D", light: "#E8F5E9", label: "South Africa" },
  ZMW: { bg: "#006400", light: "#E8F5E9", label: "Zambia" },
  EUR: { bg: "#003EA3", light: "#E3F2FD", label: "Europe" },
  USD: { bg: "#1B4F72", light: "#EBF5FB", label: "USA" },
  CNY: { bg: "#C0392B", light: "#FDEDEC", label: "China" },
};

const CARD_GRADIENTS: Record<string, string> = {
  debit:        "linear-gradient(135deg,#5B2D8E,#9585EA)",
  virtual:      "linear-gradient(135deg,#0F4C81,#2196F3)",
  business:     "linear-gradient(135deg,#1A1A1A,#4A4A4A)",
  "sub-account":"linear-gradient(135deg,#1B5E20,#4CAF50)",
};

// ─── Formatting ───────────────────────────────────────────────────────────────
const symbols: Record<string,string> = { ZAR: "R", ZMW: "K", EUR: "€", USD: "$", CNY: "¥" };
const fmt = (n: number, cur = "ZAR") => `${symbols[cur] ?? ""}${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtM = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n);

// ─── Demo data ────────────────────────────────────────────────────────────────
const ACCOUNT = {
  referenceNumber: "VMS-GBL-2024-00001", customerName: "Vincent Kafula",
  baseCurrency: "ZAR", tier: "corporate", kycStatus: "approved", amlFlag: "clear",
  balances: { ZAR: 847_250.00, USD: 45_820.00, EUR: 38_450.00, ZMW: 124_800.00, CNY: 298_450.00 },
};

const NOSTRO = [
  { id: "na-za", country: "ZA", currency: "ZAR", bank: "Standard Bank SA", swift: "SBZAZAJJ", balance: 45_280_000, reserve: 5_000_000, rails: ["EFT", "PayShap", "RTGS"], centralBank: "SARB", flag: "🇿🇦", status: "active" },
  { id: "na-zm", country: "ZM", currency: "ZMW", bank: "Zanaco Zambia", swift: "ZNCOZMLU", balance: 12_540_000, reserve: 2_000_000, rails: ["EFT", "MTN/Airtel MM"], centralBank: "Bank of Zambia", flag: "🇿🇲", status: "active" },
  { id: "na-eu", country: "EU", currency: "EUR", bank: "Modulr Finance (LT)", swift: "MODRLT22", balance: 8_920_000, reserve: 1_500_000, rails: ["SEPA", "Target2"], centralBank: "ECB", flag: "🇪🇺", status: "active" },
  { id: "na-us", country: "US", currency: "USD", bank: "Column Bank N.A.", swift: "CLBKUS66", balance: 22_470_000, reserve: 3_000_000, rails: ["ACH", "FedNow", "Wire"], centralBank: "Federal Reserve", flag: "🇺🇸", status: "active" },
  { id: "na-cn", country: "CN", currency: "CNY", bank: "UnionPay Int. Partner", swift: "BKCHCNBJ", balance: 18_340_000, reserve: 2_500_000, rails: ["WeChat Pay", "Alipay"], centralBank: "PBOC", flag: "🇨🇳", status: "active" },
];

const FX_RATES = [
  { from: "ZAR", to: "USD", rate: 0.0545, customer: 0.0540, spread: 0.92 },
  { from: "ZAR", to: "EUR", rate: 0.0502, customer: 0.0497, spread: 1.00 },
  { from: "ZAR", to: "CNY", rate: 0.3950, customer: 0.3910, spread: 1.01 },
  { from: "ZAR", to: "ZMW", rate: 1.4820, customer: 1.4673, spread: 0.99 },
  { from: "USD", to: "ZAR", rate: 18.35,  customer: 18.17,  spread: 0.98 },
  { from: "EUR", to: "USD", rate: 1.086,  customer: 1.0751, spread: 1.00 },
  { from: "USD", to: "CNY", rate: 7.248,  customer: 7.1752, spread: 1.00 },
  { from: "CNY", to: "USD", rate: 0.138,  customer: 0.1366, spread: 1.01 },
];

const CARDS = [
  { id: "c1", type: "debit",        network: "visa",       pan: "•••• •••• •••• 4291", name: "VINCENT KAFULA",    country: "ZA", currency: "ZAR", status: "active",  dailyLimit: 50000, spent: 4820 },
  { id: "c2", type: "virtual",      network: "mastercard", pan: "•••• •••• •••• 7782", name: "VINCENT KAFULA",    country: "EU", currency: "EUR", status: "active",  dailyLimit: 10000, spent: 0 },
  { id: "c3", type: "business",     network: "visa",       pan: "•••• •••• •••• 1003", name: "VINK MULTI SERVICES",country: "US", currency: "USD", status: "active",  dailyLimit: 100000, spent: 15240 },
  { id: "c4", type: "sub-account",  network: "mastercard", pan: "•••• •••• •••• 5100", name: "SIPHO DLAMINI",     country: "ZA", currency: "ZAR", status: "active",  dailyLimit: 5000, spent: 840 },
];

const TRANSACTIONS = [
  { id: "t1",  dir: "debit",  desc: "Shoprite Claremont",     merchant: "Shoprite",     cat: "Grocery",     country: "ZA", local: "R 2,847.50",  billed: "R 2,847.50",  channel: "card_pos",    domestic: true,  time: "14:32" },
  { id: "t2",  dir: "debit",  desc: "Amazon DE Order",        merchant: "Amazon DE",    cat: "E-commerce",  country: "EU", local: "€ 89.99",     billed: "R 1,794.22",  channel: "card_online", domestic: true,  time: "12:18" },
  { id: "t3",  dir: "debit",  desc: "AWS Cloud Services",     merchant: "Amazon Web Services", cat: "Tech", country: "US", local: "$ 842.00",   billed: "$ 842.00",    channel: "card_pos",    domestic: true,  time: "09:44" },
  { id: "t4",  dir: "credit", desc: "P2P from Nomsa Zulu",    merchant: "Nomsa Zulu",   cat: "P2P",         country: "ZA", local: "R 5,000.00",  billed: "R 5,000.00",  channel: "p2p",         domestic: true,  time: "08:30" },
  { id: "t5",  dir: "credit", desc: "EFT Deposit — Salary",   merchant: "VMS Payroll",  cat: "Deposit",     country: "ZA", local: "R 85,000.00", billed: "R 85,000.00", channel: "deposit",     domestic: true,  time: "Yesterday" },
  { id: "t6",  dir: "debit",  desc: "ATM Standard Bank CPT",  merchant: "Standard Bank", cat: "ATM",        country: "ZA", local: "R 2,000.00",  billed: "R 2,000.00",  channel: "atm",         domestic: true,  time: "Yesterday" },
  { id: "t7",  dir: "debit",  desc: "Netflix Subscription",   merchant: "Netflix",      cat: "Entertainment",country: "US",local: "$ 15.49",     billed: "R 284.24",    channel: "card_online", domestic: false, time: "2 days ago" },
  { id: "t8",  dir: "credit", desc: "FX Conversion ZAR→USD",  merchant: "VMS FX Engine",cat: "FX",          country: "US", local: "R 50,000",    billed: "$ 2,724.25",  channel: "fx",          domestic: true,  time: "2 days ago" },
];

const KPI = {
  totalAccounts: 2847, activeCards: 5234, volumeUsd24h: 4_820_340,
  txnCount24h: 18_470, fxConversions24h: 342, domesticPct: 94,
  interchangeToday: 48_234, fxRevenueToday: 12_840, kycPending: 47, amlAlerts: 3,
};

type Screen = "overview" | "nostro" | "fx" | "cards" | "transactions" | "payments" | "compliance" | "analytics";

// ─── Sidebar nav ──────────────────────────────────────────────────────────────
const NAV = [
  { id: "overview",     label: "Overview",       icon: <Layers className="w-4 h-4" /> },
  { id: "nostro",       label: "Nostro Accounts",icon: <Globe className="w-4 h-4" /> },
  { id: "fx",           label: "FX Exchange",    icon: <RefreshCw className="w-4 h-4" /> },
  { id: "cards",        label: "Cards",          icon: <CreditCard className="w-4 h-4" /> },
  { id: "transactions", label: "Transactions",   icon: <Activity className="w-4 h-4" /> },
  { id: "payments",     label: "Payments",       icon: <Zap className="w-4 h-4" /> },
  { id: "compliance",   label: "Compliance",     icon: <Shield className="w-4 h-4" /> },
  { id: "analytics",    label: "Analytics",      icon: <BarChart3 className="w-4 h-4" /> },
];

// ─── Shared components ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-2xl p-5 flex items-center gap-4 bg-white border border-gray-100 hover:shadow-md transition-shadow">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-white shadow-sm"
        style={{ background: color }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
        <p className="text-xl font-black text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-black text-gray-800 mb-4 flex items-center gap-2">{children}</h2>;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function GlobalBankingDashboard({ isOpen, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>("overview");
  const [fxFrom, setFxFrom] = useState("ZAR");
  const [fxTo,   setFxTo]   = useState("USD");
  const [fxAmt,  setFxAmt]  = useState("10000");
  const [showBalances, setShowBalances] = useState(true);
  const [frozenCards, setFrozenCards] = useState<Set<string>>(new Set());
  const [p2pRef, setP2pRef] = useState("");
  const [p2pAmt, setP2pAmt] = useState("");
  const [p2pCur, setP2pCur] = useState("ZAR");
  const [p2pSent, setP2pSent] = useState(false);
  const [p2pLoading, setP2pLoading] = useState(false);
  const [liveData, setLiveData] = useState<LiveData>({ kpi: null, nostro: [], fxRates: [], accounts: [], cards: [], transactions: [], loading: true, error: null });
  const [liveConnected, setLiveConnected] = useState(false);
  const [fxQuoteResult, setFxQuoteResult] = useState<Record<string, unknown> | null>(null);
  const [fxConverting, setFxConverting] = useState(false);

  // ── Load live data from Supabase ──
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLiveData(d => ({ ...d, loading: true, error: null }));
      try {
        const [kpiR, nostroR, ratesR, acctsR, cardsR, txnsR] = await Promise.all([
          globalBankingApi.kpi(),
          globalBankingApi.nostro(),
          globalBankingApi.fxRates(),
          globalBankingApi.listAccounts(),
          globalBankingApi.listCards(),
          globalBankingApi.listTransactions("acct-001"),
        ]);
        setLiveData({
          kpi: kpiR.success ? (kpiR.data as Record<string, unknown>) : null,
          nostro: nostroR.success ? (nostroR.data as Record<string, unknown>[]) : NOSTRO,
          fxRates: ratesR.success ? (ratesR.data as Record<string, unknown>[]) : [],
          accounts: acctsR.success ? (acctsR.data as Record<string, unknown>[]) : [],
          cards: cardsR.success ? (cardsR.data as Record<string, unknown>[]) : CARDS.map(c => c as unknown as Record<string, unknown>),
          transactions: txnsR.success ? (txnsR.data as Record<string, unknown>[]) : [],
          loading: false, error: null,
        });
        setLiveConnected(kpiR.success ?? false);
      } catch {
        setLiveData(d => ({ ...d, loading: false, error: "Could not reach Supabase — showing demo data" }));
      }
    };
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [isOpen]);

  // ── FX quote (live) ──
  const getQuote = async () => {
    if (!fxAmt || isNaN(+fxAmt)) return;
    const r = await globalBankingApi.fxQuote(fxFrom, fxTo, +fxAmt);
    if (r.success) setFxQuoteResult(r.data as Record<string, unknown>);
  };

  // ── FX convert (live) ──
  const doConvert = async () => {
    setFxConverting(true);
    const r = await globalBankingApi.fxConvert("acct-001", fxFrom, fxTo, +fxAmt);
    setFxConverting(false);
    if (r.success) {
      setFxQuoteResult(null);
      // Refresh accounts
      const ar = await globalBankingApi.listAccounts();
      if (ar.success) setLiveData(d => ({ ...d, accounts: ar.data as Record<string, unknown>[] }));
    }
  };

  // ── P2P transfer (live) ──
  const doP2P = async () => {
    if (!p2pRef || !p2pAmt) return;
    setP2pLoading(true);
    const r = await globalBankingApi.p2pTransfer("acct-001", p2pRef, +p2pAmt, p2pCur);
    setP2pLoading(false);
    if (r.success) setP2pSent(true);
  };

  // ── Card freeze (live) ──
  const toggleCardFreeze = async (cardId: string) => {
    const r = await globalBankingApi.toggleFreeze(cardId);
    if (r.success) {
      const cr = await globalBankingApi.listCards();
      if (cr.success) setLiveData(d => ({ ...d, cards: cr.data as Record<string, unknown>[] }));
      setFrozenCards(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s; });
    }
  };

  // Derived: use live FX rates if available, else fallback to static
  const activeFxRates = liveData.fxRates.length > 0 ? liveData.fxRates : FX_RATES.map(r => r as unknown as Record<string, unknown>);
  const fxRate = activeFxRates.find((r) => r.from === fxFrom && r.to === fxTo) as (Record<string, number> & { from: string; to: string }) | undefined;
  const fxResult = fxQuoteResult ? String((fxQuoteResult as { toAmount?: number }).toAmount ?? "—") : fxRate ? (+(fxAmt) * fxRate.customer).toFixed(2) : "—";

  // Derived: primary account balances (live or static)
  const primaryAccount = (liveData.accounts[0] as Record<string, unknown> | undefined) ?? ACCOUNT as unknown as Record<string, unknown>;
  const balances = (primaryAccount.balances as Record<string, number>) ?? ACCOUNT.balances;

  if (!isOpen) return null;

  const P = "#5B2D8E";
  const totalUsdEquiv = Object.entries(balances).reduce((s, [cur, amt]) => {
    const rates: Record<string,number> = { ZAR: 1/18.35, ZMW: 1/27.20, EUR: 1.086, USD: 1, CNY: 1/7.248 };
    return s + amt * (rates[cur] ?? 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: P }}>
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-black text-gray-900 leading-none">Global Unified Banking & Card System</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Ref: {String(primaryAccount.referenceNumber ?? ACCOUNT.referenceNumber)} · {String(primaryAccount.tier ?? ACCOUNT.tier).toUpperCase()} · 5 Nostro Accounts</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`hidden md:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ${liveConnected ? "text-green-600 bg-green-50" : liveData.loading ? "text-amber-600 bg-amber-50" : "text-gray-500 bg-gray-50"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${liveConnected ? "bg-green-500 animate-pulse" : liveData.loading ? "bg-amber-500 animate-pulse" : "bg-gray-400"}`} />
            {liveConnected ? "Supabase Live" : liveData.loading ? "Connecting…" : "Demo mode"}
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── Sidebar ── */}
        <aside className="w-52 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col py-4 px-2 overflow-y-auto">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setScreen(item.id as Screen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left text-sm font-medium mb-0.5"
              style={{ background: screen === item.id ? P + "15" : "transparent", color: screen === item.id ? P : "#6B7280", fontWeight: screen === item.id ? 700 : 400 }}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          <div className="mt-auto px-3 py-3 rounded-xl border border-gray-100 mx-1 mb-1 space-y-1">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Compliance</p>
            {[{ label: "KYC", status: "Approved", color: "#10B981" }, { label: "AML", status: "Clear", color: "#10B981" }, { label: "POPIA", status: "Consented", color: "#10B981" }].map(c => (
              <div key={c.label} className="flex justify-between items-center">
                <span className="text-[11px] text-gray-600">{c.label}</span>
                <span className="text-[10px] font-bold" style={{ color: c.color }}>✓ {c.status}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto px-5 py-5">

          {/* ══ OVERVIEW ══════════════════════════════════════════════════ */}
          {screen === "overview" && (
            <div className="space-y-6 max-w-5xl">
              {/* Unified account card */}
              <div className="rounded-2xl overflow-hidden shadow-xl"
                style={{ background: `linear-gradient(135deg,${P} 0%,#3d1d63 40%,#7B4DB5 80%,#9585EA 100%)` }}>
                <div className="relative overflow-hidden px-6 py-5">
                  <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
                  <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-white/60 text-[10px] uppercase tracking-widest font-bold">Unified Reference Account</p>
                        <p className="text-white font-black text-lg mt-0.5">{ACCOUNT.customerName}</p>
                        <p className="text-white/70 text-sm font-mono">{ACCOUNT.referenceNumber}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-400/20 text-green-300">
                          ✓ KYC Approved
                        </span>
                        <button onClick={() => setShowBalances(v => !v)} className="text-white/50 hover:text-white transition-colors">
                          {showBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-3">
                      {Object.entries(balances).map(([cur, bal]) => (
                        <div key={cur} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,.12)" }}>
                          <p className="text-white/50 text-[10px] font-semibold">{cur}</p>
                          <p className="text-white font-black text-sm mt-0.5">
                            {showBalances ? fmt(bal, cur) : "••••"}
                          </p>
                          <p className="text-white/40 text-[9px] mt-0.5">{COLORS[cur as keyof typeof COLORS]?.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/15 flex items-center justify-between">
                      <div>
                        <p className="text-white/50 text-[10px]">Total (USD equivalent)</p>
                        <p className="text-white font-black text-xl">{showBalances ? `$ ${totalUsdEquiv.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "$ ••••••"}</p>
                      </div>
                      <div className="flex gap-2">
                        {["CORPORATE", "VISA + MC"].map(tag => (
                          <span key={tag} className="text-[9px] font-black px-2 py-1 rounded-full bg-white/15 text-white/80">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI row — live data */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(() => {
                  const kpi = liveData.kpi as Record<string, number> | null;
                  return (<>
                    <KpiCard label="24h Transactions" value={kpi ? String(kpi.txnCount24h ?? KPI.txnCount24h) : String(KPI.txnCount24h)} sub={liveConnected ? "Live — Supabase" : "Demo data"} icon={<Activity className="w-5 h-5" />} color="#5B2D8E" />
                    <KpiCard label="Domestic Routing" value={`${kpi ? (kpi.domesticRoutingPct ?? KPI.domesticPct) : KPI.domesticPct}%`} sub="No cross-border fees" icon={<Globe className="w-5 h-5" />} color="#10B981" />
                    <KpiCard label="Interchange Earned" value={`R${fmtM(kpi ? (kpi.interchangeEarnedToday ?? KPI.interchangeToday) : KPI.interchangeToday)}`} sub="Today's card income" icon={<TrendingUp className="w-5 h-5" />} color="#F5A623" />
                    <KpiCard label="Active Cards" value={String(kpi ? (kpi.activeCards ?? KPI.activeCards) : KPI.activeCards)} sub="Visa + Mastercard" icon={<DollarSign className="w-5 h-5" />} color="#3B82F6" />
                  </>);
                })()}
              </div>

              {/* Architecture flow */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <SectionTitle><Layers className="w-4 h-4" style={{ color: P }} />System Architecture</SectionTitle>
                <div className="overflow-x-auto">
                  <div className="flex flex-col items-center gap-2 min-w-[600px]">
                    {/* Layer 1 */}
                    <div className="w-full rounded-xl p-3 text-center text-white text-sm font-bold" style={{ background: P }}>
                      Unified Reference Account · One number · All currencies
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    {/* Layer 2 */}
                    <div className="grid grid-cols-5 gap-2 w-full">
                      {NOSTRO.map(n => (
                        <div key={n.id} className="rounded-xl p-2.5 text-center text-xs font-semibold text-white" style={{ background: COLORS[n.currency as keyof typeof COLORS]?.bg }}>
                          {n.flag} {n.country}<br />{n.currency} · {n.centralBank.split(" ")[0]}
                        </div>
                      ))}
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    {/* Layer 3 */}
                    <div className="grid grid-cols-3 gap-2 w-full">
                      {[
                        { label: "Reference Engine", sub: "Unique acc no. · Ledger", color: "#3B82F6" },
                        { label: "FX Conversion Layer", sub: "Real-time rates · Local fees", color: "#10B981" },
                        { label: "Compliance & KYC", sub: "AML · FATF · POPIA · GDPR", color: "#EF4444" },
                      ].map(e => (
                        <div key={e.label} className="rounded-xl p-3 text-center" style={{ background: e.color + "15", border: `1px solid ${e.color}30` }}>
                          <p className="text-xs font-bold" style={{ color: e.color }}>{e.label}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{e.sub}</p>
                        </div>
                      ))}
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    {/* Layer 4 */}
                    <div className="grid grid-cols-4 gap-2 w-full">
                      {["Debit Card · Balance", "Virtual · Online+eWallet", "Business · Spend Controls", "Sub-account · Child/Staff"].map((c, i) => (
                        <div key={i} className="rounded-xl p-2.5 text-center text-xs" style={{ background: Object.values(CARD_GRADIENTS)[i], color: "#fff" }}>
                          {c.split("·")[0]}<br /><span className="opacity-70 text-[9px]">{c.split("·")[1]}</span>
                        </div>
                      ))}
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    {/* Layer 5 */}
                    <div className="grid grid-cols-4 gap-2 w-full">
                      {["🏦 Bank Deposit\nEFT/RTGS", "📱 Mobile Money\nMTN/Airtel/M-Pesa", "💵 Cash Agent\nRetail network", "🌐 Online/App\nQR/eWallet"].map((c, i) => (
                        <div key={i} className="rounded-xl p-2.5 text-center text-xs bg-gray-50 border border-gray-200 whitespace-pre-line font-medium text-gray-700">{c}</div>
                      ))}
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    {/* Layer 6 */}
                    <div className="grid grid-cols-4 gap-2 w-full">
                      {["🏧 ATM\nAny Visa/MC ATM", "🛒 POS Purchase\nIn-store · Tap · Chip", "🛍️ Online Checkout\nE-commerce globally", "↔️ P2P Transfer\nRef. no. · Instant"].map((c, i) => (
                        <div key={i} className="rounded-xl p-2.5 text-center text-xs bg-purple-50 border border-purple-100 whitespace-pre-line font-medium text-purple-800">{c}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent transactions — live or static */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <SectionTitle><Activity className="w-4 h-4" style={{ color: P }} />Recent Transactions</SectionTitle>
                  {liveConnected && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">● Live</span>}
                </div>
                <div className="space-y-2">
                  {(liveData.transactions.length > 0 ? liveData.transactions : TRANSACTIONS.map(t => ({ id: t.id, direction: t.dir, description: t.desc, merchantCategory: t.cat, billedCurrency: "ZAR", billedAmount: parseFloat(t.billed.replace(/[^0-9.]/g, "")), domesticRouting: t.domestic, createdAt: t.time }))).slice(0, 6).map((t: Record<string, unknown>, i: number) => {
                    const dir = String(t.direction ?? t.dir ?? "debit");
                    const desc = String(t.description ?? t.desc ?? "Transaction");
                    const cat = String(t.merchantCategory ?? t.cat ?? "");
                    const domestic = Boolean(t.domesticRouting ?? t.domestic);
                    const billed = t.billedAmount ? `${String(t.billedCurrency ?? "R")} ${Number(t.billedAmount).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}` : String(t.billed ?? "");
                    return (
                      <div key={String(t.id ?? i)} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
                          style={{ background: dir === "credit" ? "#10B981" : "#5B2D8E" }}>
                          {dir === "credit" ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{desc}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {cat && <span className="text-[10px] text-gray-400">{cat}</span>}
                            {domestic && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 rounded">Domestic ✓</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-black ${dir === "credit" ? "text-green-600" : "text-gray-800"}`}>
                            {dir === "credit" ? "+" : "-"}{billed}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══ NOSTRO ACCOUNTS ══════════════════════════════════════════ */}
          {screen === "nostro" && (
            <div className="space-y-5 max-w-5xl">
              <SectionTitle><Globe className="w-4 h-4" style={{ color: P }} />Nostro (Mirror) Accounts — 5 Countries</SectionTitle>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-800 leading-relaxed">
                <strong>How it works:</strong> VMS holds a registered bank account in each country. When a customer's card is used at a merchant, the transaction is routed domestically against the local nostro account — eliminating international cross-border fees entirely. The customer's master balance is debited simultaneously via the internal FX engine.
              </div>
              <div className="space-y-4">
                {NOSTRO.map(n => {
                  const reservePct = Math.round((n.reserve / n.balance) * 100);
                  return (
                    <div key={n.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                          style={{ background: COLORS[n.currency as keyof typeof COLORS]?.light }}>
                          {n.flag}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="font-black text-gray-900">{n.bank}</p>
                              <p className="text-xs text-gray-500 mt-0.5">SWIFT: {n.swift} · {n.centralBank}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-black" style={{ color: COLORS[n.currency as keyof typeof COLORS]?.bg }}>
                                {symbols[n.currency]}{fmtM(n.balance)}
                              </p>
                              <p className="text-[10px] text-gray-400">Balance in {n.currency}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Payment Rails</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {n.rails.map(r => (
                                  <span key={r} className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                    style={{ background: COLORS[n.currency as keyof typeof COLORS]?.light, color: COLORS[n.currency as keyof typeof COLORS]?.bg }}>
                                    {r}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Reserve Required</p>
                              <p className="text-sm font-bold text-gray-800 mt-0.5">{symbols[n.currency]}{fmtM(n.reserve)}</p>
                              <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${reservePct}%`, background: COLORS[n.currency as keyof typeof COLORS]?.bg }} />
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Status</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="text-sm font-semibold text-green-700">Active · Reconciled</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-3">Total Nostro Position (USD equivalent)</p>
                <div className="grid grid-cols-5 gap-3">
                  {NOSTRO.map(n => {
                    const rates: Record<string,number> = { ZAR: 1/18.35, ZMW: 1/27.20, EUR: 1.086, USD: 1, CNY: 1/7.248 };
                    const usd = n.balance * (rates[n.currency] ?? 0);
                    return (
                      <div key={n.id} className="rounded-xl p-3 text-center" style={{ background: COLORS[n.currency as keyof typeof COLORS]?.light }}>
                        <p className="text-xl">{n.flag}</p>
                        <p className="text-xs font-bold text-gray-700 mt-1">{n.currency}</p>
                        <p className="text-sm font-black mt-0.5" style={{ color: COLORS[n.currency as keyof typeof COLORS]?.bg }}>
                          ${fmtM(usd)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══ FX EXCHANGE ══════════════════════════════════════════════ */}
          {screen === "fx" && (
            <div className="space-y-5 max-w-3xl">
              <SectionTitle><RefreshCw className="w-4 h-4" style={{ color: P }} />FX Conversion Engine</SectionTitle>
              <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">From currency</label>
                    <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-purple-400" value={fxFrom} onChange={e => setFxFrom(e.target.value)}>
                      {["ZAR","ZMW","EUR","USD","CNY"].map(c => <option key={c}>{c} — {COLORS[c as keyof typeof COLORS]?.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">To currency</label>
                    <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-purple-400" value={fxTo} onChange={e => setFxTo(e.target.value)}>
                      {["ZAR","ZMW","EUR","USD","CNY"].filter(c => c !== fxFrom).map(c => <option key={c}>{c} — {COLORS[c as keyof typeof COLORS]?.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Amount ({fxFrom})</label>
                  <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-black outline-none focus:border-purple-400" value={fxAmt} onChange={e => setFxAmt(e.target.value)} />
                </div>
                {fxRate && (
                  <div className="rounded-xl p-4" style={{ background: "#F3F0FB" }}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">You get</p>
                        <p className="text-2xl font-black mt-0.5" style={{ color: P }}>{symbols[fxTo]}{Number(fxResult).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500">{fxTo}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Interbank rate</p>
                        <p className="text-lg font-black text-gray-900 mt-0.5">{fxRate.rate}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Your rate</p>
                        <p className="text-lg font-black text-gray-900 mt-0.5">{fxRate.customer}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Spread</p>
                        <p className="text-lg font-black mt-0.5" style={{ color: "#F5A623" }}>{fxRate.spread}%</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 text-center mt-3">Rate valid for 30 seconds · Settled against your local nostro account — no international wire required</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={getQuote}
                    className="flex-1 py-4 rounded-2xl text-base font-black text-white transition-all hover:opacity-90 shadow-md"
                    style={{ background: "#10B981" }}>
                    Get Live Quote
                  </button>
                  <button onClick={doConvert} disabled={fxConverting}
                    className="flex-1 py-4 rounded-2xl text-base font-black text-white transition-all hover:opacity-90 shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                    {fxConverting ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Converting…</> : `Convert ${fxFrom} → ${fxTo}`}
                  </button>
                </div>
              </div>

              {/* Live rate table */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Live Exchange Rates</p>
                <div className="space-y-2">
                  {FX_RATES.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-gray-900">{r.from} → {r.to}</span>
                        <span className="text-[10px] text-gray-400">{COLORS[r.from as keyof typeof COLORS]?.label} → {COLORS[r.to as keyof typeof COLORS]?.label}</span>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[10px] text-gray-400">Interbank</p>
                          <p className="text-xs font-semibold text-gray-600">{r.rate}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Customer</p>
                          <p className="text-sm font-black text-gray-900">{r.customer}</p>
                        </div>
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{r.spread}% spread</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ CARDS ═════════════════════════════════════════════════════ */}
          {screen === "cards" && (
            <div className="space-y-5 max-w-4xl">
              <SectionTitle><CreditCard className="w-4 h-4" style={{ color: P }} />Card Issuance — All Card Types</SectionTitle>
              <div className="grid sm:grid-cols-2 gap-5">
                {CARDS.map(card => {
                  const frozen = frozenCards.has(card.id);
                  return (
                    <div key={card.id} className="rounded-2xl overflow-hidden border border-gray-100 shadow-md">
                      {/* Card visual */}
                      <div className="relative p-5 text-white" style={{ background: CARD_GRADIENTS[card.type] }}>
                        {frozen && <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"><Lock className="w-10 h-10 text-white/80" /><p className="text-white font-bold ml-2">FROZEN</p></div>}
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <p className="text-white/60 text-[9px] uppercase tracking-widest">VINK</p>
                            <p className="text-xs font-bold mt-0.5 capitalize">{card.type} Card</p>
                          </div>
                          <div className="w-8 h-6 rounded bg-yellow-400/60 border border-yellow-300/40" />
                        </div>
                        <p className="font-mono text-sm tracking-widest mb-4">{card.pan}</p>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[8px] opacity-50 uppercase">Cardholder</p>
                            <p className="text-xs font-semibold">{card.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] opacity-50">{card.country} · {card.currency}</p>
                            <p className="text-sm font-black uppercase">{card.network}</p>
                          </div>
                        </div>
                      </div>
                      {/* Card controls */}
                      <div className="bg-white p-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Daily Limit", value: `${symbols[card.currency]}${fmtM(card.dailyLimit)}` },
                            { label: "Spent Today", value: `${symbols[card.currency]}${fmtM(card.spent)}` },
                            { label: "Available", value: `${symbols[card.currency]}${fmtM(card.dailyLimit - card.spent)}` },
                          ].map(s => (
                            <div key={s.label} className="text-center p-2 rounded-xl bg-gray-50">
                              <p className="text-[10px] text-gray-400">{s.label}</p>
                              <p className="text-sm font-black text-gray-800 mt-0.5">{s.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(card.spent / card.dailyLimit * 100)}%`, background: card.spent / card.dailyLimit > 0.8 ? "#EF4444" : P }} />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setFrozenCards(prev => { const s = new Set(prev); s.has(card.id) ? s.delete(card.id) : s.add(card.id); return s; })}
                            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                            style={{ background: frozen ? "#10B98120" : "#EF444420", color: frozen ? "#10B981" : "#EF4444", border: `1px solid ${frozen ? "#10B98140" : "#EF444440"}` }}>
                            {frozen ? "Unfreeze" : "Freeze"}
                          </button>
                          <button className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                            style={{ background: P }}>Manage Limits</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                <strong>Local-fee innovation:</strong> Each card's BIN is registered in its assigned country (ZA, EU, US, etc.). POS terminals recognise it as domestic, eliminating international cross-border surcharges. VMS's internal FX engine handles multi-currency conversion before it ever touches the card network.
              </div>
            </div>
          )}

          {/* ══ TRANSACTIONS ══════════════════════════════════════════════ */}
          {screen === "transactions" && (
            <div className="space-y-4 max-w-4xl">
              <SectionTitle><Activity className="w-4 h-4" style={{ color: P }} />Transaction Ledger</SectionTitle>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs text-gray-500 font-semibold">Showing {TRANSACTIONS.length} recent transactions across all currencies</p>
                  <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">{TRANSACTIONS.filter(t => t.domestic).length}/{TRANSACTIONS.length} domestic routed</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {TRANSACTIONS.map(t => (
                    <div key={t.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
                        style={{ background: t.dir === "credit" ? "#10B981" : P }}>
                        {t.dir === "credit" ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{t.desc}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-gray-400 capitalize">{t.channel.replace("_"," ")}</span>
                          <span className="text-[10px] text-gray-400">· {t.cat}</span>
                          {t.domestic
                            ? <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1 rounded">🏠 Domestic</span>
                            : <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded">🌐 Cross-border</span>
                          }
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-black ${t.dir === "credit" ? "text-green-600" : "text-gray-900"}`}>
                          {t.dir === "credit" ? "+" : "-"}{t.billed}
                        </p>
                        {t.local !== t.billed && <p className="text-[10px] text-gray-400">{t.local} local</p>}
                        <p className="text-[10px] text-gray-400">{t.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ PAYMENTS ══════════════════════════════════════════════════ */}
          {screen === "payments" && (
            <div className="space-y-5 max-w-4xl">
              <SectionTitle><Zap className="w-4 h-4" style={{ color: P }} />Deposit & Payment Channels</SectionTitle>

              {/* P2P Transfer */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <p className="text-sm font-black text-gray-800">P2P Transfer — by Reference Number</p>
                {p2pSent ? (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500" />
                    <p className="font-bold text-green-700">Transfer Sent Successfully</p>
                    <button onClick={() => setP2pSent(false)} className="text-sm underline text-gray-500">Send another</button>
                  </div>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Recipient reference number</label>
                        <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="VMS-GBL-2024-XXXXX" value={p2pRef} onChange={e => setP2pRef(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Currency</label>
                        <select className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" value={p2pCur} onChange={e => setP2pCur(e.target.value)}>
                          {["ZAR","ZMW","EUR","USD","CNY"].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Amount</label>
                      <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-xl font-black outline-none focus:border-purple-400" placeholder="0.00" value={p2pAmt} onChange={e => setP2pAmt(e.target.value)} />
                    </div>
                    <button onClick={doP2P} disabled={!p2pRef || !p2pAmt || p2pLoading}
                      className="w-full py-3 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 shadow-md disabled:opacity-40 flex items-center justify-center gap-2"
                      style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                      {p2pLoading ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Sending…</> : "Send Instantly"}
                    </button>
                  </>
                )}
              </div>

              {/* Deposit channels grid */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Deposit Channels — All Currencies</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Bank Deposit", sub: "EFT · Wire · RTGS · SEPA · ACH", icon: "🏦", countries: "ZA · EU · US · ZM" },
                    { label: "Mobile Money", sub: "MTN · Airtel · M-Pesa", icon: "📱", countries: "ZA · ZM" },
                    { label: "Cash Agent", sub: "Retail agent network", icon: "💵", countries: "ZA · ZM" },
                    { label: "Online / App", sub: "QR · eWallet · Instant EFT", icon: "🌐", countries: "ZA · EU · US · CN" },
                    { label: "WeChat Pay", sub: "CNY top-up via WeChat", icon: "💬", countries: "CN" },
                    { label: "Alipay", sub: "CNY top-up via Alipay", icon: "🅰️", countries: "CN" },
                    { label: "UnionPay", sub: "CNY card-to-card", icon: "🇨🇳", countries: "CN" },
                    { label: "PayShap", sub: "Instant EFT South Africa", icon: "⚡", countries: "ZA" },
                  ].map((ch, i) => (
                    <div key={i} className="rounded-xl p-4 border border-gray-100 hover:border-purple-200 hover:bg-purple-50 transition-all cursor-pointer">
                      <span className="text-2xl block mb-2">{ch.icon}</span>
                      <p className="text-sm font-bold text-gray-800">{ch.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{ch.sub}</p>
                      <p className="text-[9px] text-purple-600 font-bold mt-1.5">{ch.countries}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Touchpoints */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Customer & Merchant Touchpoints</p>
                <div className="grid sm:grid-cols-4 gap-3">
                  {[
                    { label: "ATM Withdrawal", sub: "Any Visa / MC ATM worldwide", icon: "🏧", note: "R15 fee" },
                    { label: "POS Purchase", sub: "In-store · Tap · Chip", icon: "🛒", note: "Free — domestic" },
                    { label: "Online Checkout", sub: "E-commerce globally", icon: "🛍️", note: "Free — BIN routed" },
                    { label: "P2P Transfer", sub: "Ref. no. · Instant", icon: "↔️", note: "Free" },
                  ].map((t, i) => (
                    <div key={i} className="rounded-xl p-4 text-center" style={{ background: "#F3F0FB" }}>
                      <span className="text-3xl block mb-2">{t.icon}</span>
                      <p className="text-sm font-bold text-gray-800">{t.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{t.sub}</p>
                      <p className="text-[10px] font-bold mt-1.5" style={{ color: P }}>{t.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ COMPLIANCE ════════════════════════════════════════════════ */}
          {screen === "compliance" && (
            <div className="space-y-5 max-w-4xl">
              <SectionTitle><Shield className="w-4 h-4" style={{ color: P }} />Compliance & KYC Engine</SectionTitle>

              {/* KYC status */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">KYC Records ({ACCOUNT.customerName})</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { label: "Document Verified", value: "SA Passport A12345678", status: "approved", icon: "📄" },
                    { label: "Selfie Match", value: "Score: 97.4% — Passed", status: "approved", icon: "🤳" },
                    { label: "Address Verified", value: "8 Rose Street, Cape Town", status: "approved", icon: "🏠" },
                    { label: "PEP Screening", value: "No PEP matches found", status: "approved", icon: "🔍" },
                    { label: "Sanctions Screen", value: "OFAC · UN · EU — Clear", status: "approved", icon: "🛡️" },
                    { label: "FATF Checked", value: "Risk: Low (Score 2/100)", status: "approved", icon: "✅" },
                  ].map((k, i) => (
                    <div key={i} className="rounded-xl p-4 flex items-start gap-3 border border-green-100 bg-green-50">
                      <span className="text-xl">{k.icon}</span>
                      <div>
                        <p className="text-xs font-bold text-gray-700">{k.label}</p>
                        <p className="text-[11px] text-gray-600 mt-0.5">{k.value}</p>
                        <p className="text-[10px] font-bold text-green-600 mt-1">✓ {k.status.charAt(0).toUpperCase() + k.status.slice(1)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Regulatory framework */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Regulatory Framework — 5 Jurisdictions</p>
                <div className="space-y-3">
                  {[
                    { country: "🇿🇦 South Africa", regs: ["SARB Banking/PSP Licence", "FSCA FSP Registration", "POPIA Data Protection", "FICA AML Compliance"], status: "licensed" },
                    { country: "🇿🇲 Zambia", regs: ["Bank of Zambia Payment System Operator Licence", "National Payment Systems Act Compliance"], status: "licensed" },
                    { country: "🇪🇺 Europe", regs: ["EMI Licence (Lithuania — EU Passport)", "PSD2 Compliance", "GDPR Data Protection"], status: "licensed" },
                    { country: "🇺🇸 USA", regs: ["FinCEN MSB Registration", "State Money Transmitter Licences", "BaaS via Column Bank N.A."], status: "licensed" },
                    { country: "🇨🇳 China", regs: ["UnionPay International Partner Agreement", "PBOC via Alipay International"], status: "partner" },
                  ].map((r, i) => (
                    <div key={i} className="rounded-xl p-4 border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-black text-gray-800">{r.country}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: r.status === "licensed" ? "#D1FAE5" : "#FEF3C7", color: r.status === "licensed" ? "#059669" : "#D97706" }}>
                          {r.status === "licensed" ? "✓ Licensed" : "⚡ Partner"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {r.regs.map(reg => <span key={reg} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{reg}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AML alerts */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-2">AML Monitoring</p>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <p className="text-sm font-semibold text-green-700">All accounts clear · No active AML alerts · FATF risk score: Low</p>
                </div>
              </div>
            </div>
          )}

          {/* ══ ANALYTICS ════════════════════════════════════════════════ */}
          {screen === "analytics" && (
            <div className="space-y-5 max-w-5xl">
              <SectionTitle><BarChart3 className="w-4 h-4" style={{ color: P }} />Platform Analytics & Revenue</SectionTitle>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Total Accounts" value={KPI.totalAccounts.toLocaleString()} sub="Across 5 countries" icon={<Users className="w-5 h-5" />} color="#5B2D8E" />
                <KpiCard label="Active Cards" value={KPI.activeCards.toLocaleString()} sub="Visa + Mastercard" icon={<CreditCard className="w-5 h-5" />} color="#3B82F6" />
                <KpiCard label="FX Conversions" value={KPI.fxConversions24h.toString()} sub="Last 24 hours" icon={<RefreshCw className="w-5 h-5" />} color="#10B981" />
                <KpiCard label="Domestic Routing" value={`${KPI.domesticPct}%`} sub="No cross-border fees" icon={<Globe className="w-5 h-5" />} color="#F5A623" />
              </div>

              {/* Revenue breakdown */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Revenue Streams — Today</p>
                <div className="space-y-3">
                  {[
                    { stream: "Interchange Income", amount: KPI.interchangeToday, note: "0.5–1.8% per card transaction", pct: 62, color: P },
                    { stream: "FX Spread Revenue", amount: KPI.fxRevenueToday, note: "0.5–1% above interbank on conversions", pct: 26, color: "#10B981" },
                    { stream: "Account & Card Fees", amount: 4820, note: "Monthly/annual premium account fees", pct: 10, color: "#3B82F6" },
                    { stream: "ATM Withdrawal Fees", amount: 1240, note: "R15 per ATM withdrawal", pct: 2, color: "#F59E0B" },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <p className="text-sm font-semibold text-gray-800">{r.stream}</p>
                          <p className="text-sm font-black" style={{ color: r.color }}>R{fmtM(r.amount)}</p>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${r.pct}%`, background: r.color }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">{r.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transaction volume per country */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Transaction Volume by Country (Last 7 Days)</p>
                <div className="space-y-3">
                  {[
                    { country: "🇿🇦 South Africa", volume: 28_400_000, txns: 12_847, pct: 58 },
                    { country: "🇺🇸 USA",           volume: 11_200_000, txns: 3_421,  pct: 23 },
                    { country: "🇪🇺 Europe",         volume: 6_800_000,  txns: 1_892,  pct: 14 },
                    { country: "🇨🇳 China",          volume: 2_100_000,  txns: 847,    pct: 4 },
                    { country: "🇿🇲 Zambia",         volume: 490_000,    txns: 234,    pct: 1 },
                  ].map((r, i) => (
                    <div key={i}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-800">{r.country}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-gray-400">{r.txns.toLocaleString()} txns</span>
                          <span className="text-sm font-black text-gray-900">R{fmtM(r.volume)}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: P }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Competitive positioning */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-3">Competitive Positioning</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-100">
                      {["Feature", "VMS Global", "Revolut", "Wise", "Traditional Bank"].map(h => (
                        <th key={h} className="text-left py-2 px-3 font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {[
                        ["Local-fee card everywhere", "✅", "Partial", "❌", "❌"],
                        ["African mobile money", "✅", "❌", "Partial", "❌"],
                        ["Unbanked cash deposits", "✅", "❌", "❌", "❌"],
                        ["5-country nostro layer", "✅", "EU only", "EU only", "❌"],
                        ["Unified reference number", "✅", "❌", "❌", "❌"],
                        ["ZAR/ZMW native", "✅", "Partial", "Partial", "ZA only"],
                      ].map((row, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {row.map((cell, j) => (
                            <td key={j} className={`py-2.5 px-3 ${j === 0 ? "font-semibold text-gray-700" : j === 1 ? "font-black text-green-600" : "text-gray-500"}`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
