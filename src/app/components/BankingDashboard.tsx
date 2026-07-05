import { useState, useEffect, useCallback } from "react";
import {
  X, CreditCard, Wallet, TrendingUp, Users, Shield, AlertTriangle,
  CheckCircle, XCircle, ChevronRight, ArrowUpRight, ArrowDownLeft,
  Settings, Bell, Search, Download, RefreshCw, Eye, EyeOff,
  Lock, Unlock, Plus, Filter, BarChart3, PieChart, Activity,
  Building2, FileText, Globe, Loader2, LogOut, Menu, DollarSign,
  Briefcase, Star, AlertCircle, Clock, Home, Key,
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DemoModeBanner } from "./DemoModeBanner";
import { isDemoMode, setDemoMode, DEMO_TOKEN } from "../services/demoMode";
import {
  bankAuth, bankAccounts, bankCards, bankPayments,
  bankTreasury, bankCompliance, bankUsers,
  setBankToken, getBankToken,
} from "../services/bankingApi";

// ─── Types ─────────────────────────────────────────────────────────────────────
type BankRole = "passenger" | "driver" | "investor" | "owner" | "admin" | "compliance" | "treasury";
type NavSection = "overview" | "accounts" | "cards" | "transactions" | "payments" | "earnings" | "portfolio" | "treasury" | "users" | "kyc" | "fraud" | "settlements" | "reports";
type R = Record<string, unknown>;

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtZAR = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("en").format(Math.floor(n));
const ago    = (iso: string) => { const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; return `${Math.floor(s / 3600)}h`; };
const cap    = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ROLE_COLOR: Record<BankRole, string> = {
  passenger: "#6B5ED7", driver: "#3B82F6", investor: "#F59E0B",
  owner: "#10B981", admin: "#EF4444", compliance: "#8B5CF6", treasury: "#06B6D4",
};
const ROLE_NAV: Record<BankRole, NavSection[]> = {
  passenger: ["overview","accounts","cards","transactions","payments"],
  driver:    ["overview","accounts","cards","transactions","earnings"],
  investor:  ["overview","accounts","cards","transactions","portfolio"],
  owner:     ["overview","accounts","cards","transactions","treasury","settlements"],
  admin:     ["overview","users","cards","accounts","kyc","fraud","reports"],
  compliance:["overview","kyc","fraud","reports"],
  treasury:  ["overview","treasury","settlements","reports"],
};
const NAV_ICONS: Partial<Record<NavSection, React.ReactNode>> = {
  overview: <Home className="w-4 h-4"/>, accounts: <Building2 className="w-4 h-4"/>,
  cards: <CreditCard className="w-4 h-4"/>, transactions: <Activity className="w-4 h-4"/>,
  payments: <ArrowUpRight className="w-4 h-4"/>, earnings: <DollarSign className="w-4 h-4"/>,
  portfolio: <TrendingUp className="w-4 h-4"/>, treasury: <Wallet className="w-4 h-4"/>,
  users: <Users className="w-4 h-4"/>, kyc: <Shield className="w-4 h-4"/>,
  fraud: <AlertTriangle className="w-4 h-4"/>, settlements: <Globe className="w-4 h-4"/>,
  reports: <FileText className="w-4 h-4"/>,
};

// ─── Visual Credit Card ────────────────────────────────────────────────────────
function VisualCard({ card, compact = false }: { card: R; compact?: boolean }) {
  const [show, setShow] = useState(false);
  const isVisa = card.network === "visa";
  const gradients: Record<string, string> = {
    standard:  "from-[#4D7AE0] to-[#2952B8]",
    premium:   "from-[#C4922A] to-[#8B6914]",
    platinum:  "from-[#1a1a2e] to-[#374151]",
    corporate: "from-[#065F46] to-[#064E3B]",
    fuel:      "from-[#92400E] to-[#78350F]",
  };
  const grad = gradients[card.tier as string] ?? gradients.standard;
  const statusColor = card.status === "active" ? "#34d399" : card.status === "frozen" ? "#60A5FA" : "#F87171";

  return (
    <div className={`relative rounded-2xl text-white overflow-hidden select-none bg-gradient-to-br ${grad} ${compact ? "h-32" : "h-44"}`}
      style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.25)" }}>
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -mr-16 -mt-16"/>
      <div className="absolute bottom-0 right-0 w-28 h-28 rounded-full bg-white/8 -mr-10 -mb-10"/>
      <div className={`relative z-10 ${compact ? "p-3" : "p-5"} h-full flex flex-col justify-between`}>
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[9px] tracking-widest opacity-60 uppercase">VINK BANK</p>
            <p className={`font-bold mt-0.5 ${compact ? "text-xs" : "text-sm"}`}>{cap(card.tier as string)} {cap(card.type as string)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="w-8 h-6 rounded border border-white/20"
              style={{ background: "linear-gradient(135deg,#D4AF37 80%,#F5E07A)" }}/>
            <div className={`w-2 h-2 rounded-full`} style={{ background: statusColor, boxShadow: `0 0 5px ${statusColor}` }}/>
          </div>
        </div>
        {!compact && (
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-mono tracking-wider opacity-90">
                {show ? String(card.pan) : "•••• •••• •••• " + String(card.last4)}
              </p>
              <button onClick={() => setShow(!show)} className="opacity-60 hover:opacity-100 transition-opacity">
                {show ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
              </button>
            </div>
            <div className="flex justify-between items-end mt-2">
              <div>
                <p className="text-[9px] opacity-50 uppercase">Expires</p>
                <p className="text-xs font-medium">{String(card.expiry)}</p>
              </div>
              <div className="flex items-center gap-0.5">
                {String(card.nameOnCard).split(" ").slice(0,2).join(" ")}
              </div>
              {isVisa ? (
                <p className="text-xl font-black italic tracking-tight">VISA</p>
              ) : (
                <div className="flex">
                  <div className="w-7 h-7 rounded-full bg-red-500 opacity-90"/>
                  <div className="w-7 h-7 rounded-full bg-yellow-400 opacity-85 -ml-3"/>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
      style={{ background: color + "20", color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color, loading }: { label: string; value: string; sub?: string; icon: React.ReactNode; color: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl p-5 bg-white border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl" style={{ background: color + "15" }}>
          <div style={{ color }}>{icon}</div>
        </div>
        {sub && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{sub}</span>}
      </div>
      {loading ? <div className="h-6 w-28 bg-gray-100 rounded animate-pulse mb-1"/> : <p className="text-2xl font-black text-gray-900">{value}</p>}
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Transaction Row ───────────────────────────────────────────────────────────
function TxnRow({ t }: { t: R }) {
  const isCredit = t.type === "credit";
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0`}
        style={{ background: isCredit ? "#ECFDF5" : "#FEF3F2" }}>
        {isCredit
          ? <ArrowDownLeft className="w-4 h-4 text-emerald-600"/>
          : <ArrowUpRight className="w-4 h-4 text-red-500"/>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{String(t.description)}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[11px] text-gray-400 truncate">{String(t.counterpartyName ?? t.merchantName ?? "")}</p>
          <span className="text-[10px] text-gray-300">·</span>
          <p className="text-[11px] text-gray-400">{ago(t.createdAt as string)} ago</p>
          {t.flagged && <Badge label="⚠ flagged" color="#EF4444"/>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${isCredit ? "text-emerald-600" : "text-gray-900"}`}>
          {isCredit ? "+" : "-"}{fmtZAR(t.amount as number)}
        </p>
        <Badge label={String(t.status)} color={t.status === "completed" ? "#10B981" : t.status === "pending" ? "#F59E0B" : "#EF4444"}/>
      </div>
    </div>
  );
}

// ─── KYC Row ───────────────────────────────────────────────────────────────────
function KycRow({ k, onApprove, onReject }: { k: R; onApprove: () => void; onReject: () => void }) {
  const statusColor = k.status === "approved" ? "#10B981" : k.status === "pending" || k.status === "in_review" ? "#F59E0B" : "#EF4444";
  const u = k.user as R | undefined;
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: "#EDE9FE", color: "#6B5ED7" }}>
            {u ? `${String(u.firstName)[0]}${String(u.lastName)[0]}` : "?"}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{u ? `${u.firstName} ${u.lastName}` : "Unknown"}</p>
            <p className="text-[11px] text-gray-400">{u ? String(u.email) : ""}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><Badge label={cap(String(u?.role ?? ""))} color="#6B5ED7"/></td>
      <td className="px-4 py-3 text-xs text-gray-600">{cap(String(k.documentType)).replace("_"," ")}</td>
      <td className="px-4 py-3">
        {k.faceMatchScore ? <span className="text-xs font-semibold text-gray-700">{String(k.faceMatchScore)}%</span> : <span className="text-xs text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3"><Badge label={cap(String(k.status))} color={statusColor}/></td>
      <td className="px-4 py-3">
        {(k.status === "pending" || k.status === "in_review") && (
          <div className="flex gap-2">
            <button onClick={onApprove} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors">Approve</button>
            <button onClick={onReject}  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors">Reject</button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (t: string, u: R) => void }) {
  const [username, setUsername] = useState("superadmin");
  const [password, setPassword] = useState("Admin@1234");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await bankAuth.login(username, password);
      setBankToken(res.token);
      onLogin(res.token, res.user as R);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0F1629 0%,#1E1B4B 60%,#2D2060 100%)" }}>
      <div className="w-full max-w-sm mx-6">
        {/* Bank logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)" }}>
            <Building2 className="w-10 h-10 text-white"/>
          </div>
          <h1 className="text-2xl font-black text-white">VINK BANK</h1>
          <p className="text-white/50 text-sm mt-1">Multi-Role Banking Platform</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
          {[{ label: "Username", val: username, set: setUsername, type: "text" },
            { label: "Password", val: password, set: setPassword, type: "password" }].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-semibold text-white/50 mb-1.5">{f.label}</label>
              <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} required
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-purple-500"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}/>
            </div>
          ))}
          {error && <p className="text-xs text-red-400 bg-red-900/30 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Key className="w-4 h-4"/>}
            Sign In to Banking Portal
          </button>
          {/* One-click demo mode */}
          <button type="button" onClick={() => { setDemoMode(true); setBankToken(DEMO_TOKEN); onLogin(DEMO_TOKEN, { id:"demo-001", username:"superadmin", name:"Demo User", role:"superadmin" } as Record<string,unknown>); }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2">
            ⚡ Enter Demo Mode (no server needed)
          </button>
          <div className="pt-1 border-t border-white/10">
            <p className="text-center text-[10px] text-white/30 mb-2">Live credentials (server required)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[["superadmin","Admin@1234","Admin"],["noc1","Noc@5678","Operator"],["billing1","Bill@9012","Billing"]].map(([u,p,label]) => (
                <button key={u} type="button" onClick={() => { setUsername(u); setPassword(p); }}
                  className="text-[10px] px-2 py-1.5 rounded-lg text-white/50 hover:text-white/80 transition-colors text-left"
                  style={{ background: "rgba(255,255,255,0.06)" }}>
                  <span className="font-semibold text-white/70">{label}</span>: {u}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── OVERVIEW PANEL ────────────────────────────────────────────────────────────
function OverviewPanel({ role, kpis, accounts, cards, txns, loading }: {
  role: BankRole; kpis: R | null; accounts: R[]; cards: R[]; txns: R[]; loading: boolean;
}) {
  const color = ROLE_COLOR[role];
  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const primaryAcct  = accounts[0];

  // Build sparkline data from txns
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000);
    const label = d.toLocaleDateString("en", { weekday: "short" });
    const dayTxns = txns.filter(t => {
      const td = new Date(t.createdAt as string);
      return td.getDate() === d.getDate() && td.getMonth() === d.getMonth();
    });
    const spent   = dayTxns.filter(t => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
    const received = dayTxns.filter(t => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
    return { label, spent: +spent.toFixed(0), received: +received.toFixed(0) };
  });

  // Spending by category
  const categories: Record<string, number> = {};
  txns.filter(t => t.type === "debit" && t.merchantCategory).forEach(t => {
    const cat = String(t.merchantCategory);
    categories[cat] = (categories[cat] ?? 0) + Number(t.amount);
  });
  const pieData = Object.entries(categories).slice(0, 5).map(([name, value]) => ({ name, value: +value.toFixed(0) }));
  const PIE_COLORS = ["#6B5ED7", "#10B981", "#F59E0B", "#EF4444", "#3B82F6"];

  const roleStats = {
    passenger: [
      { label: "Total Balance", value: fmtZAR(totalBalance), sub: "+2.4%", icon: <Wallet className="w-5 h-5"/>, color: "#6B5ED7" },
      { label: "Cards Active", value: String(cards.filter(c=>c.status==="active").length), icon: <CreditCard className="w-5 h-5"/>, color: "#10B981" },
      { label: "This Month Spent", value: fmtZAR(txns.filter(t=>t.type==="debit").reduce((s,t)=>s+Number(t.amount),0)), icon: <ArrowUpRight className="w-5 h-5"/>, color: "#F59E0B" },
      { label: "Transactions", value: String(txns.length), icon: <Activity className="w-5 h-5"/>, color: "#3B82F6" },
    ],
    driver: [
      { label: "Earnings Wallet", value: fmtZAR(totalBalance), sub: "+R" + (Math.floor(Math.random()*500+200)), icon: <Wallet className="w-5 h-5"/>, color: "#3B82F6" },
      { label: "Total Earned", value: fmtZAR(txns.filter(t=>t.type==="credit").reduce((s,t)=>s+Number(t.amount),0)), icon: <DollarSign className="w-5 h-5"/>, color: "#10B981" },
      { label: "This Week Trips", value: String(Math.floor(txns.filter(t=>t.category==="earnings").length * 0.3 + 5)), icon: <Activity className="w-5 h-5"/>, color: "#6B5ED7" },
      { label: "Driver Card", value: cards.length > 0 ? "Active" : "Not issued", icon: <CreditCard className="w-5 h-5"/>, color: "#F59E0B" },
    ],
    investor: [
      { label: "Portfolio Value", value: fmtZAR(totalBalance * 1.12), sub: "+12%", icon: <TrendingUp className="w-5 h-5"/>, color: "#F59E0B" },
      { label: "Capital Deposited", value: fmtZAR(totalBalance), icon: <DollarSign className="w-5 h-5"/>, color: "#6B5ED7" },
      { label: "Total Returns", value: fmtZAR(totalBalance * 0.12), sub: "+14.5%", icon: <BarChart3 className="w-5 h-5"/>, color: "#10B981" },
      { label: "Dividends Paid", value: fmtZAR(totalBalance * 0.04), icon: <Star className="w-5 h-5"/>, color: "#3B82F6" },
    ],
    owner: [
      { label: "Business Balance", value: fmtZAR(totalBalance), icon: <Building2 className="w-5 h-5"/>, color: "#10B981" },
      { label: "Revenue Today", value: fmtZAR(kpis ? Number(kpis.revenueToday) : 0), sub: "+8%", icon: <TrendingUp className="w-5 h-5"/>, color: "#6B5ED7" },
      { label: "Active Employees", value: "24", icon: <Users className="w-5 h-5"/>, color: "#F59E0B" },
      { label: "Pending Settlements", value: String(kpis ? Number(kpis.settlementsPending) : 0), icon: <Globe className="w-5 h-5"/>, color: "#3B82F6" },
    ],
    admin: [
      { label: "Total Users", value: String(kpis ? Number(kpis.totalUsers) : 0), icon: <Users className="w-5 h-5"/>, color: "#6B5ED7" },
      { label: "Active Cards", value: String(kpis ? Number(kpis.activeCards) : 0), icon: <CreditCard className="w-5 h-5"/>, color: "#10B981" },
      { label: "Fraud Alerts", value: String(kpis ? Number(kpis.fraudAlertsActive) : 0), icon: <AlertTriangle className="w-5 h-5"/>, color: "#EF4444" },
      { label: "KYC Pending", value: String(kpis ? Number(kpis.kycPending) : 0), icon: <Shield className="w-5 h-5"/>, color: "#F59E0B" },
    ],
    compliance: [
      { label: "KYC Pending", value: String(kpis ? Number(kpis.kycPending) : 0), icon: <Shield className="w-5 h-5"/>, color: "#8B5CF6" },
      { label: "Active Fraud Alerts", value: String(kpis ? Number(kpis.fraudAlertsActive) : 0), icon: <AlertTriangle className="w-5 h-5"/>, color: "#EF4444" },
      { label: "AML Reviews", value: "3", icon: <Eye className="w-5 h-5"/>, color: "#F59E0B" },
      { label: "SARs Filed", value: "0", icon: <FileText className="w-5 h-5"/>, color: "#6B5ED7" },
    ],
    treasury: [
      { label: "Treasury Balance", value: fmtZAR(kpis ? Number(kpis.treasuryBalance) : 0), icon: <Wallet className="w-5 h-5"/>, color: "#06B6D4" },
      { label: "Volume 24h", value: fmtZAR(kpis ? Number(kpis.totalVolume24h) : 0), sub: "+12%", icon: <Activity className="w-5 h-5"/>, color: "#10B981" },
      { label: "Settlements Pending", value: String(kpis ? Number(kpis.settlementsPending) : 0), icon: <Globe className="w-5 h-5"/>, color: "#F59E0B" },
      { label: "Txns Today", value: fmtNum(kpis ? Number(kpis.txnCount24h) : 0), icon: <BarChart3 className="w-5 h-5"/>, color: "#6B5ED7" },
    ],
  };

  const stats = roleStats[role] ?? roleStats.admin;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s, i) => <StatCard key={i} {...s} loading={loading}/>)}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Activity chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900">Activity — Last 7 Days</h3>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }}/> Spent</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block bg-emerald-400"/> Received</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={last7}>
              <defs>
                <linearGradient id={`gSpent-${role}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id={`gReceived-${role}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={v => `R${v >= 1000 ? (v/1000).toFixed(0)+"K" : v}`}/>
              <Tooltip formatter={(v: number) => fmtZAR(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
              <Area type="monotone" dataKey="spent" stroke={color} strokeWidth={2.5} fill={`url(#gSpent-${role})`}/>
              <Area type="monotone" dataKey="received" stroke="#10B981" strokeWidth={2.5} fill={`url(#gReceived-${role})`}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Spending breakdown */}
        {pieData.length > 0 ? (
          <div className="bg-white rounded-2xl p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Spending Breakdown</h3>
            <ResponsiveContainer width="100%" height={130}>
              <RechartsPie>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtZAR(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }}/>
              </RechartsPie>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {pieData.slice(0, 4).map((d, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}/>
                    <span className="text-gray-600 truncate max-w-[100px]">{d.name}</span>
                  </div>
                  <span className="font-semibold text-gray-800">{fmtZAR(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 flex items-center justify-center">
            <div className="text-center text-gray-300">
              <PieChart className="w-10 h-10 mx-auto mb-2 opacity-30"/>
              <p className="text-xs">No spending data yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      {txns.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-900">Recent Transactions</h3>
            <span className="text-xs text-gray-400">{txns.length} total</span>
          </div>
          <div className="px-5 divide-y divide-gray-50">
            {txns.slice(0, 6).map((t, i) => <TxnRow key={i} t={t}/>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CARDS PANEL ───────────────────────────────────────────────────────────────
function CardsPanel({ userId, cards, onRefresh }: { userId: string; cards: R[]; onRefresh: () => void }) {
  const [action, setAction] = useState<{ cardId: string; type: string } | null>(null);
  const userCards = cards.filter(c => c.userId === userId);

  const handleAction = async (cardId: string, type: string) => {
    setAction({ cardId, type });
    try {
      if (type === "freeze")   await bankCards.freeze(cardId);
      if (type === "unfreeze") await bankCards.unfreeze(cardId);
      if (type === "block")    await bankCards.block(cardId);
      onRefresh();
    } finally { setAction(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">My Cards ({userCards.length})</h2>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: "#6B5ED7" }}>
          <Plus className="w-3.5 h-3.5"/> Request New Card
        </button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {userCards.map((card, i) => (
          <div key={i} className="space-y-3">
            <VisualCard card={card}/>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { label: "Daily Limit", value: fmtZAR(card.dailyLimit as number) },
                  { label: "Spent Today", value: fmtZAR(card.spentToday as number) },
                  { label: "Monthly Limit", value: fmtZAR(card.monthlyLimit as number) },
                  { label: "Spent Month", value: fmtZAR(card.spentThisMonth as number) },
                ].map((s, j) => (
                  <div key={j} className="p-2 rounded-xl" style={{ background: "#F9FAFB" }}>
                    <p className="text-gray-400">{s.label}</p>
                    <p className="font-bold text-gray-800 mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {card.applePayEnrolled && <Badge label="Apple Pay" color="#374151"/>}
                {card.googlePayEnrolled && <Badge label="Google Pay" color="#4285F4"/>}
                {card.contactless && <Badge label="Contactless" color="#10B981"/>}
                {card.internationalEnabled && <Badge label="International" color="#6B5ED7"/>}
              </div>
              <div className="flex gap-2">
                {card.status === "active"
                  ? <button onClick={() => handleAction(String(card.id), "freeze")} disabled={!!action}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                      style={{ background: "#EFF6FF", color: "#3B82F6" }}>
                      {action?.cardId === card.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Lock className="w-3 h-3"/>} Freeze
                    </button>
                  : <button onClick={() => handleAction(String(card.id), "unfreeze")} disabled={!!action}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                      style={{ background: "#ECFDF5", color: "#10B981" }}>
                      <Unlock className="w-3 h-3"/> Unfreeze
                    </button>}
                <button onClick={() => handleAction(String(card.id), "block")} disabled={!!action}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ background: "#FEF2F2", color: "#EF4444" }}>
                  <XCircle className="w-3 h-3"/> Block
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TRANSACTIONS PANEL ────────────────────────────────────────────────────────
function TransactionsPanel({ txns }: { txns: R[] }) {
  const [filter, setFilter] = useState<"all" | "credit" | "debit">("all");
  const [search, setSearch] = useState("");
  const filtered = txns.filter(t => {
    const matchType = filter === "all" || t.type === filter;
    const matchSearch = !search || String(t.description).toLowerCase().includes(search.toLowerCase()) || String(t.counterpartyName ?? "").toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });
  const totalIn  = txns.filter(t=>t.type==="credit").reduce((s,t)=>s+Number(t.amount),0);
  const totalOut = txns.filter(t=>t.type==="debit").reduce((s,t)=>s+Number(t.amount),0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total In", value: fmtZAR(totalIn), color: "#10B981" },
          { label: "Total Out", value: fmtZAR(totalOut), color: "#EF4444" },
          { label: "Net", value: fmtZAR(totalIn - totalOut), color: "#6B5ED7" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-gray-100">
          {(["all","credit","debit"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
              style={{ background: filter === f ? "white" : "transparent", color: filter === f ? "#6B5ED7" : "#9CA3AF", boxShadow: filter === f ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions…"
            className="flex-1 text-sm outline-none text-gray-700 bg-transparent"/>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
          <Download className="w-3.5 h-3.5"/> Export
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">All Transactions</h3>
          <span className="text-xs text-gray-400">{filtered.length} records</span>
        </div>
        <div className="px-5 max-h-96 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0
            ? <p className="text-center text-sm text-gray-400 py-8">No transactions found</p>
            : filtered.map((t, i) => <TxnRow key={i} t={t}/>)}
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENTS PANEL ────────────────────────────────────────────────────────────
function PaymentsPanel({ userId, accounts }: { userId: string; accounts: R[] }) {
  const [tab, setTab] = useState<"send" | "history">("send");
  const [toIban, setToIban]       = useState("");
  const [amount, setAmount]       = useState("");
  const [description, setDesc]    = useState("");
  const [rail, setRail]           = useState("internal");
  const [sending, setSending]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const fromAcct = accounts[0] as R | undefined;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault(); if (!fromAcct) return;
    setSending(true);
    try {
      await bankPayments.send({ fromUserId: userId, fromAccountId: fromAcct.id, toIban, amount: Number(amount), currency: "ZAR", rail, description });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setToIban(""); setAmount(""); setDesc("");
    } catch {} finally { setSending(false); }
  };

  const rails = [
    { id: "internal", label: "Vink Internal", fee: "Free", eta: "Instant" },
    { id: "faster_payments", label: "Faster Payments", fee: "Free", eta: "Same day" },
    { id: "sepa", label: "SEPA", fee: "R0.50", eta: "1 business day" },
    { id: "swift", label: "SWIFT", fee: "0.5%", eta: "2-5 days" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-1 bg-gray-100 rounded-xl w-fit">
        {(["send","history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
            style={{ background: tab === t ? "white" : "transparent", color: tab === t ? "#6B5ED7" : "#9CA3AF" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "send" ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <form onSubmit={handleSend} className="bg-white rounded-2xl p-6 border border-gray-100 space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Send Money</h3>
            {fromAcct && (
              <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: "#F3F0FF" }}>
                <Wallet className="w-4 h-4" style={{ color: "#6B5ED7" }}/>
                <div>
                  <p className="text-xs text-gray-500">From</p>
                  <p className="text-sm font-semibold text-gray-800">{String(fromAcct.label)} · {fmtZAR(fromAcct.balance as number)}</p>
                </div>
              </div>
            )}
            {[
              { label: "Recipient IBAN / Account", val: toIban, set: setToIban, placeholder: "ZA21 VINK 00000000 0001" },
              { label: "Amount (ZAR)", val: amount, set: setAmount, placeholder: "0.00", type: "number" },
              { label: "Description", val: description, set: setDesc, placeholder: "Payment reference" },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{f.label}</label>
                <input type={f.type ?? "text"} value={f.val} onChange={e => f.set(e.target.value)} required placeholder={f.placeholder}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"/>
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Payment Rail</label>
              <div className="grid grid-cols-2 gap-2">
                {rails.map(r => (
                  <button type="button" key={r.id} onClick={() => setRail(r.id)}
                    className="p-2.5 rounded-xl text-left transition-all"
                    style={{ background: rail === r.id ? "#F3F0FF" : "#F9FAFB", border: `1.5px solid ${rail === r.id ? "#6B5ED7" : "#E5E7EB"}` }}>
                    <p className="text-xs font-semibold" style={{ color: rail === r.id ? "#6B5ED7" : "#374151" }}>{r.label}</p>
                    <p className="text-[10px] text-gray-400">{r.fee} · {r.eta}</p>
                  </button>
                ))}
              </div>
            </div>
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs">
                <CheckCircle className="w-4 h-4"/> Payment sent successfully!
              </div>
            )}
            <button type="submit" disabled={sending || !toIban || !amount}
              className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowUpRight className="w-4 h-4"/>}
              Send Payment
            </button>
          </form>

          {/* Quick pay options */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Quick Transfers</h3>
              {[
                { label: "Passenger → Driver", desc: "Trip payment distribution", icon: "🚗" },
                { label: "Driver → Own Account", desc: "Move earnings to main account", icon: "💳" },
                { label: "Owner → Payroll", desc: "Bulk salary disbursement", icon: "💼" },
                { label: "Investor Dividend", desc: "Revenue share distribution", icon: "📈" },
              ].map((q, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors mb-1">
                  <span className="text-xl">{q.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{q.label}</p>
                    <p className="text-xs text-gray-400">{q.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300"/>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 mb-3">QR Payment</h3>
              <div className="bg-gray-50 rounded-xl p-8 flex flex-col items-center justify-center gap-3">
                <div className="grid grid-cols-5 gap-0.5 opacity-60">
                  {Array.from({length: 25}).map((_,i) => (
                    <div key={i} className={`w-5 h-5 rounded-sm ${Math.random()>0.5?"bg-gray-800":"bg-transparent"}`}/>
                  ))}
                </div>
                <p className="text-xs text-gray-500">Scan to receive payment</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <p className="text-sm text-gray-400 text-center py-8">Payment history loaded from accounts</p>
        </div>
      )}
    </div>
  );
}

// ─── TREASURY PANEL ────────────────────────────────────────────────────────────
function TreasuryPanel() {
  const [data, setData] = useState<{ accounts: R[]; splits: R[]; settlements: R[]; kpis: R | null }>({ accounts: [], splits: [], settlements: [], kpis: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [accts, splits, settlements, kpiRes] = await Promise.allSettled([
        bankTreasury.accounts(), bankTreasury.revenueSplits(), bankTreasury.settlements(), bankTreasury.kpis(),
      ]);
      setData({
        accounts: accts.status === "fulfilled" ? (accts.value.data as R[]) : [],
        splits:   splits.status === "fulfilled" ? (splits.value.data as R[]) : [],
        settlements: settlements.status === "fulfilled" ? (settlements.value.data as R[]) : [],
        kpis: kpiRes.status === "fulfilled" ? (kpiRes.value.data as R) : null,
      });
      setLoading(false);
    })();
  }, []);

  const totalTreasury = data.accounts.reduce((s, a) => s + Number(a.balance), 0);
  const recentSplits  = data.splits.slice(0, 5);
  const barData = data.settlements.slice(0, 7).map(s => ({
    date: String(s.date).slice(5), volume: Number(s.totalVolume) / 1000, net: Number(s.netAmount) / 1000,
  }));

  return (
    <div className="space-y-5">
      {/* Treasury accounts */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.accounts.map((a, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">{String(a.purpose)}</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{String(a.label)}</p>
              </div>
              <Badge label={String(a.purpose)} color="#06B6D4"/>
            </div>
            <p className="text-2xl font-black text-gray-900">{fmtZAR(a.balance as number)}</p>
            {Number(a.reserveBalance) > 0 && (
              <p className="text-xs text-gray-400 mt-1">Reserve: {fmtZAR(a.reserveBalance as number)}</p>
            )}
          </div>
        ))}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 flex flex-col justify-center items-center text-center">
          <p className="text-xs text-gray-400 mb-1">Total Treasury</p>
          <p className="text-3xl font-black" style={{ color: "#06B6D4" }}>{fmtZAR(totalTreasury)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Settlement chart */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Settlement Volume (ZAR 000s)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
              <Bar dataKey="volume" fill="#06B6D4" radius={[4,4,0,0]} name="Volume"/>
              <Bar dataKey="net" fill="#6B5ED7" radius={[4,4,0,0]} name="Net"/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue splits */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Revenue Distribution</h3>
          <div className="space-y-3">
            {recentSplits.map((s, i) => (
              <div key={i} className="p-3 rounded-xl" style={{ background: "#F9FAFB" }}>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-semibold text-gray-700">{fmtZAR(s.totalAmount as number)} split</p>
                  <span className="text-[10px] text-gray-400">{ago(s.createdAt as string)} ago</span>
                </div>
                <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-l" style={{ width: "75%" }} title="Driver 75%"/>
                  <div className="h-full bg-amber-400" style={{ width: "10%" }} title="Investor 10%"/>
                  <div className="h-full bg-emerald-500 rounded-r" style={{ width: "15%" }} title="Owner 15%"/>
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                  <span>Driver 75%</span><span>Investor 10%</span><span>Owner 15%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KYC PANEL ────────────────────────────────────────────────────────────────
function KycPanel() {
  const [records, setRecords] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bankCompliance.kyc({ status: filter !== "all" ? filter : "" });
      setRecords(res.data as R[]);
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-gray-900">KYC Review Queue</h2>
        <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl">
          {["all","pending","in_review","approved","rejected"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all"
              style={{ background: filter === f ? "white" : "transparent", color: filter === f ? "#6B5ED7" : "#9CA3AF" }}>
              {f.replace("_"," ")}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-500"/></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  {["Applicant","Role","Document","Face Match","Status","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.length === 0
                  ? <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-8">No records found</td></tr>
                  : records.map((k, i) => (
                    <KycRow key={i} k={k}
                      onApprove={async () => { await bankCompliance.approveKyc(String(k.id)); load(); }}
                      onReject={async () => { await bankCompliance.rejectKyc(String(k.id), "Documents not accepted"); load(); }}/>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FRAUD PANEL ──────────────────────────────────────────────────────────────
function FraudPanel() {
  const [alerts, setAlerts]   = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("false");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bankCompliance.fraudAlerts({ resolved: filter });
      setAlerts(res.data as R[]);
    } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const riskColor = (r: string) => ({ low: "#10B981", medium: "#F59E0B", high: "#F97316", critical: "#EF4444" }[r] ?? "#9CA3AF");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-gray-900">Fraud & Security Alerts</h2>
        <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl">
          {[["false","Active"],["true","Resolved"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: filter === v ? "white" : "transparent", color: filter === v ? "#6B5ED7" : "#9CA3AF" }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-500"/></div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 border border-gray-100 flex flex-col items-center gap-2">
            <CheckCircle className="w-10 h-10 text-emerald-400"/>
            <p className="text-sm text-gray-400">No {filter === "false" ? "active" : "resolved"} fraud alerts</p>
          </div>
        ) : alerts.map((a, i) => {
          const u = a.user as R | undefined;
          return (
            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 flex items-start gap-4">
              <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: riskColor(String(a.riskLevel)) + "15" }}>
                <AlertTriangle className="w-5 h-5" style={{ color: riskColor(String(a.riskLevel)) }}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-bold text-gray-900">{String(a.description)}</p>
                  <Badge label={String(a.riskLevel)} color={riskColor(String(a.riskLevel))}/>
                  {a.blocked && <Badge label="Blocked" color="#EF4444"/>}
                </div>
                <p className="text-xs text-gray-500">Rule: <span className="font-semibold text-gray-700">{String(a.ruleTriggered).replace(/_/g," ")}</span></p>
                {u && <p className="text-xs text-gray-400 mt-0.5">User: {u.firstName} {u.lastName} · {u.email}</p>}
                <p className="text-[11px] text-gray-300 mt-0.5">{ago(a.createdAt as string)} ago</p>
              </div>
              {!a.resolved && (
                <button onClick={async () => { await bankCompliance.resolveFraud(String(a.id)); load(); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors flex-shrink-0">
                  Resolve
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── USERS ADMIN PANEL ────────────────────────────────────────────────────────
function UsersPanel() {
  const [users, setUsers]   = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bankUsers.list(roleFilter !== "all" ? { role: roleFilter } : undefined);
      setUsers(res.data as R[]);
    } finally { setLoading(false); }
  }, [roleFilter]);
  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => !search || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase()));
  const kycColor = (s: string) => ({ approved: "#10B981", pending: "#F59E0B", in_review: "#F97316", rejected: "#EF4444", not_started: "#9CA3AF" }[s] ?? "#9CA3AF");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-gray-900">User Management</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
              className="text-sm outline-none bg-transparent w-48"/>
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-purple-500 bg-white">
            <option value="all">All Roles</option>
            {["passenger","driver","investor","owner","admin","compliance","treasury"].map(r => (
              <option key={r} value={r}>{cap(r)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-500"/></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["User","Role","KYC","AML","Balance","Cards","Joined","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u, i) => (
                  <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: ROLE_COLOR[u.role as BankRole] + "20", color: ROLE_COLOR[u.role as BankRole] }}>
                          {String(u.firstName)[0]}{String(u.lastName)[0]}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{String(u.firstName)} {String(u.lastName)}</p>
                          <p className="text-[11px] text-gray-400 truncate max-w-[160px]">{String(u.email)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge label={String(u.role)} color={ROLE_COLOR[u.role as BankRole] ?? "#6B7280"}/></td>
                    <td className="px-4 py-3"><Badge label={String(u.kycStatus).replace("_"," ")} color={kycColor(String(u.kycStatus))}/></td>
                    <td className="px-4 py-3"><Badge label={String(u.amlStatus).replace("_"," ")} color={u.amlStatus === "clear" ? "#10B981" : "#EF4444"}/></td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">{fmtZAR(u.totalBalance as number)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{String(u.cardCount)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{ago(u.createdAt as string)} ago</td>
                    <td className="px-4 py-3">
                      <button className="text-xs font-semibold text-purple-600 hover:underline">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ACCOUNTS PANEL ────────────────────────────────────────────────────────────
function AccountsPanel({ accounts }: { accounts: R[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-900">My Accounts</h2>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map((a, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">{String(a.type)}</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{String(a.label)}</p>
              </div>
              <Badge label={String(a.status)} color={a.status === "active" ? "#10B981" : a.status === "frozen" ? "#3B82F6" : "#9CA3AF"}/>
            </div>
            <p className="text-2xl font-black text-gray-900 mb-1">{fmtZAR(a.balance as number)}</p>
            <p className="text-xs text-gray-400 mb-3">Available: {fmtZAR(a.availableBalance as number)}</p>
            <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-400">Account No.</span>
                <span className="font-mono font-semibold text-gray-700">{String(a.accountNumber)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-400">IBAN</span>
                <span className="font-mono text-gray-600 truncate max-w-[140px]">{String(a.iban)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-400">Interest Rate</span>
                <span className="font-semibold text-emerald-600">{String(a.interestRate)}% p.a.</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ────────────────────────────────────────────────────────────
interface BankingDashboardProps { isOpen: boolean; onClose: () => void }

export function BankingDashboard({ isOpen, onClose }: BankingDashboardProps) {
  const [authed, setAuthed]   = useState(!!getBankToken());
  const [authUser, setAuthUser] = useState<R | null>(null);
  const [role, setRole]       = useState<BankRole>("passenger");
  const [section, setSection] = useState<NavSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [accounts, setAccounts] = useState<R[]>([]);
  const [cards, setCards]       = useState<R[]>([]);
  const [txns, setTxns]         = useState<R[]>([]);
  const [kpis, setKpis]         = useState<R | null>(null);
  const [loading, setLoading]   = useState(false);
  const [userId, setUserId]     = useState("");

  const loadRoleData = useCallback(async (r: BankRole, uid: string) => {
    if (!getBankToken() || !uid) return;
    setLoading(true);
    try {
      const [acctRes, cardRes, kpiRes] = await Promise.allSettled([
        bankAccounts.list({ userId: uid }),
        bankCards.list({ userId: uid }),
        bankTreasury.kpis(),
      ]);
      const accts = acctRes.status === "fulfilled" ? (acctRes.value.data as R[]) : [];
      setAccounts(accts);
      if (cardRes.status === "fulfilled") setCards(cardRes.value.data as R[]);
      if (kpiRes.status === "fulfilled")  setKpis(kpiRes.value.data as R);

      // Load txns from first account
      if (accts.length > 0) {
        const txnRes = await bankAccounts.txns(String(accts[0].id), { limit: "50" }).catch(() => ({ data: [] }));
        setTxns(txnRes.data as R[]);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (isOpen && authed && userId) loadRoleData(role, userId);
  }, [isOpen, authed, role, userId, loadRoleData]);

  const handleLogin = (_t: string, u: R) => {
    setAuthUser(u);
    const userRole: BankRole = "admin"; // logged-in user sees admin view by default; can switch
    setRole(userRole);
    // For demo, use first user matching selected role
    setAuthed(true);
    // Preload — use a demo user id
    bankUsers.list({ role: "passenger" }).then(res => {
      const users = res.data as R[];
      if (users.length > 0) setUserId(String(users[0].id));
    }).catch(() => {});
  };

  const handleRoleChange = async (newRole: BankRole) => {
    setRole(newRole);
    setSection("overview");
    // Switch demo user for this role
    try {
      const res = await bankUsers.list({ role: newRole });
      const users = res.data as R[];
      if (users.length > 0) setUserId(String(users[0].id));
    } catch {}
  };

  if (!isOpen) return null;

  const navItems = ROLE_NAV[role];
  const accentColor = ROLE_COLOR[role];

  const renderContent = () => {
    switch (section) {
      case "overview":     return <OverviewPanel role={role} kpis={kpis} accounts={accounts} cards={cards} txns={txns} loading={loading}/>;
      case "accounts":     return <AccountsPanel accounts={accounts}/>;
      case "cards":        return <CardsPanel userId={userId} cards={cards} onRefresh={() => loadRoleData(role, userId)}/>;
      case "transactions": return <TransactionsPanel txns={txns}/>;
      case "payments":     return <PaymentsPanel userId={userId} accounts={accounts}/>;
      case "treasury":     return <TreasuryPanel/>;
      case "kyc":          return <KycPanel/>;
      case "fraud":        return <FraudPanel/>;
      case "users":        return <UsersPanel/>;
      case "earnings":     return <TransactionsPanel txns={txns.filter(t => t.category === "earnings" || t.type === "credit")}/>;
      case "portfolio":    return (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-gray-900">Investment Portfolio</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { label:"Capital Deposited",  val: fmtZAR(accounts.reduce((s,a)=>s+Number(a.balance),0)), color:"#6B5ED7" },
              { label:"Current Value",      val: fmtZAR(accounts.reduce((s,a)=>s+Number(a.balance),0)*1.12), color:"#10B981" },
              { label:"Total Returns",      val: fmtZAR(accounts.reduce((s,a)=>s+Number(a.balance),0)*0.12), color:"#F59E0B" },
              { label:"Revenue Share",      val: "10% of platform revenue", color:"#3B82F6" },
            ].map((c,i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100">
                <p className="text-xs text-gray-400">{c.label}</p>
                <p className="text-2xl font-black mt-1" style={{ color: c.color }}>{c.val}</p>
              </div>
            ))}
          </div>
        </div>
      );
      case "settlements":  return <TreasuryPanel/>;
      case "reports":
        return (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300"/>
            <p className="text-sm font-semibold text-gray-600 mb-1">Report Generation</p>
            <p className="text-xs text-gray-400 mb-4">Generate PDF, Excel or CSV reports for transactions, revenue, KYC, and fraud.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              {["Transaction Report","Revenue Report","KYC Report","Fraud Report","Settlement Report"].map((r,i) => (
                <button key={i} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 hover:border-purple-300 hover:text-purple-600 transition-colors">
                  {r}
                </button>
              ))}
            </div>
          </div>
        );
      default: return <p className="text-gray-400 text-sm">Section coming soon…</p>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: "#F3F4F6" }}>
      {!authed ? (
        <>
          <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5"/>
          </button>
          <LoginScreen onLogin={handleLogin}/>
        </>
      ) : (
        <>
          {/* ── SIDEBAR ── */}
          <aside className="flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden"
            style={{ width: sidebarOpen ? 240 : 64, background: "#0F1629", borderRight: "1px solid #1E2843" }}>
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: "#1E2843" }}>
              {sidebarOpen && (
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Building2 className="w-5 h-5" style={{ color: accentColor }}/>
                    <span className="text-white font-black text-base">VINK BANK</span>
                  </div>
                  <p className="text-[10px]" style={{ color: "#8884AA" }}>Multi-Role Banking Platform</p>
                </div>
              )}
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="ml-auto p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white flex-shrink-0">
                <Menu className="w-4 h-4"/>
              </button>
            </div>

            {/* Role selector */}
            {sidebarOpen && (
              <div className="px-3 py-3 border-b" style={{ borderColor: "#1E2843" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#8884AA" }}>Account Type</p>
                <div className="grid grid-cols-2 gap-1">
                  {(["passenger","driver","investor","owner","admin","compliance","treasury"] as BankRole[]).map(r => (
                    <button key={r} onClick={() => handleRoleChange(r)}
                      className="px-2 py-1.5 rounded-lg text-[10px] font-semibold capitalize transition-all"
                      style={{ background: role === r ? ROLE_COLOR[r] + "22" : "transparent", color: role === r ? ROLE_COLOR[r] : "#8884AA", border: `1px solid ${role === r ? ROLE_COLOR[r] + "44" : "transparent"}` }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              {navItems.map(item => (
                <button key={item} onClick={() => setSection(item)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                  style={{ background: section === item ? accentColor + "22" : "transparent", color: section === item ? accentColor : "#8884AA" }}>
                  <span className="flex-shrink-0">{NAV_ICONS[item]}</span>
                  {sidebarOpen && <span className="text-xs font-medium capitalize">{item.replace("_"," ")}</span>}
                </button>
              ))}
            </nav>

            {/* User footer */}
            {sidebarOpen && authUser && (
              <div className="px-3 py-3 border-t" style={{ borderColor: "#1E2843" }}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: accentColor + "30", color: accentColor }}>
                    {String(authUser.name ?? "A")[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{String(authUser.name ?? "Administrator")}</p>
                    <p className="text-[10px] truncate" style={{ color: "#8884AA" }}>{String(authUser.username)}</p>
                  </div>
                </div>
              </div>
            )}
            <button onClick={() => { setBankToken(null); setAuthed(false); onClose(); }}
              className="w-full flex items-center gap-3 px-5 py-3 text-red-400 hover:bg-red-500/10 transition-colors border-t" style={{ borderColor: "#1E2843" }}>
              <LogOut className="w-4 h-4 flex-shrink-0"/>
              {sidebarOpen && <span className="text-xs font-medium">Sign Out</span>}
            </button>
          </aside>

          {/* ── MAIN ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Demo mode banner */}
            <DemoModeBanner />
            {/* Top bar */}
            <header className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white border-b border-gray-200">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="capitalize font-semibold" style={{ color: accentColor }}>{role}</span>
                  <ChevronRight className="w-3 h-3"/>
                  <span className="text-gray-700 font-medium capitalize">{section.replace("_"," ")}</span>
                </div>
                <p className="text-base font-black text-gray-900 mt-0.5 capitalize">{section.replace("_"," ")} Dashboard</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => loadRoleData(role, userId)} disabled={loading}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 disabled:opacity-40">
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}/>
                </button>
                <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                  <Bell className="w-3.5 h-3.5"/>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5"/>
                </button>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900">
                  <X className="w-4 h-4"/>
                </button>
              </div>
            </header>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6">
              {renderContent()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
