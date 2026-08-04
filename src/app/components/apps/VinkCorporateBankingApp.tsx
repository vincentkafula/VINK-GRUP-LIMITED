import { useState } from "react";
import {
  Home, Send, TrendingUp, MoreHorizontal, Bell, ChevronRight,
  Sparkles, Landmark, Building2, Globe2, Users, Shield,
  CheckCircle, Loader2, Wallet, ClipboardCheck, BarChart3, Settings, Lock,
  ArrowUpRight, AlertTriangle, Briefcase,
} from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";

type Screen = "onboarding" | "dashboard" | "payments" | "treasury" | "approvals" | "more";
type Tier = "Foundation" | "Apex" | "Vertex" | "Nexus" | "Dominion" | "Legacy";
type Role = "CEO" | "CFO" | "Finance Manager";

const INK = "#1D1740";
const PLUM = "#128A43";
const GOLD = "#C6A15B";

const TIER_INFO: Record<Tier, { order: number; icon: React.ReactNode; purpose: string; unlocks: string; gradient: string }> = {
  Foundation: { order: 1, icon: <Sparkles className="w-5 h-5" />,  purpose: "Corporate banking essentials.",                          unlocks: "Accounts, payments, statements, corporate cards",         gradient: `linear-gradient(135deg,${PLUM},${INK})` },
  Apex:       { order: 2, icon: <Building2 className="w-5 h-5" />, purpose: "Better treasury control and team collaboration.",         unlocks: "+ Treasury dashboard, bulk payroll, department cards",    gradient: `linear-gradient(135deg,${PLUM},${INK})` },
  Vertex:     { order: 3, icon: <Users className="w-5 h-5" />,     purpose: "Manage multiple entities and automate governance.",        unlocks: "+ Multi-company management, approval workflows, ERP/API", gradient: `linear-gradient(135deg,#0369A1,${INK})` },
  Nexus:      { order: 4, icon: <Globe2 className="w-5 h-5" />,    purpose: "Expand globally with cross-border banking.",               unlocks: "+ Multi-currency, FX, SWIFT, trade finance",              gradient: `linear-gradient(135deg,#B45309,${INK})` },
  Dominion:   { order: 5, icon: <Shield className="w-5 h-5" />,    purpose: "Centralize enterprise treasury, risk and compliance.",     unlocks: "+ Enterprise treasury, fraud/AML center, unlimited cards", gradient: `linear-gradient(135deg,#065F46,${INK})` },
  Legacy:     { order: 6, icon: <Landmark className="w-5 h-5" />,  purpose: "Institutional-grade banking and strategic advisory.",      unlocks: "+ Wealth management, family office, executive banking",   gradient: `linear-gradient(135deg,#0F3D24,#1E1B4B)` },
};
const TIER_ORDER: Tier[] = ["Foundation", "Apex", "Vertex", "Nexus", "Dominion", "Legacy"];
const ROLES: Role[] = ["CEO", "CFO", "Finance Manager"];

const FEATURE_ROWS: { label: string; values: Record<Tier, string> }[] = [
  { label: "Corporate accounts",      values: { Foundation: "✓", Apex: "✓", Vertex: "✓", Nexus: "✓", Dominion: "✓", Legacy: "✓" } },
  { label: "Bulk payroll",            values: { Foundation: "✓", Apex: "✓", Vertex: "✓", Nexus: "✓", Dominion: "✓", Legacy: "✓" } },
  { label: "Multi-user roles",        values: { Foundation: "Basic", Apex: "Advanced", Vertex: "Advanced", Nexus: "Advanced", Dominion: "Enterprise", Legacy: "Enterprise" } },
  { label: "Treasury dashboard",      values: { Foundation: "Basic", Apex: "✓", Vertex: "✓", Nexus: "✓", Dominion: "✓", Legacy: "✓" } },
  { label: "ERP/API integration",     values: { Foundation: "—", Apex: "—", Vertex: "✓", Nexus: "✓", Dominion: "✓", Legacy: "✓" } },
  { label: "Multi-company management",values: { Foundation: "—", Apex: "—", Vertex: "✓", Nexus: "✓", Dominion: "✓", Legacy: "✓" } },
  { label: "Multi-currency banking",  values: { Foundation: "—", Apex: "—", Vertex: "—", Nexus: "✓", Dominion: "✓", Legacy: "✓" } },
  { label: "Trade finance",           values: { Foundation: "—", Apex: "—", Vertex: "—", Nexus: "✓", Dominion: "✓", Legacy: "✓" } },
  { label: "Enterprise treasury",     values: { Foundation: "—", Apex: "—", Vertex: "—", Nexus: "—", Dominion: "✓", Legacy: "✓" } },
  { label: "Compliance & risk center",values: { Foundation: "—", Apex: "Basic", Vertex: "✓", Nexus: "✓", Dominion: "✓", Legacy: "✓" } },
  { label: "Investment management",   values: { Foundation: "—", Apex: "—", Vertex: "—", Nexus: "Limited", Dominion: "Advanced", Legacy: "Full" } },
  { label: "Executive banking team",  values: { Foundation: "—", Apex: "Relationship Mgr", Vertex: "Senior RM", Nexus: "Treasury Specialist", Dominion: "Executive Team", Legacy: "Institutional Team" } },
];

// ─── Onboarding ───────────────────────────────────────────────────────────
function OnboardingScreen({ onSelect }: { onSelect: (tier: Tier) => void }) {
  const [picked, setPicked] = useState<Tier | null>(null);
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F5F3FA" }}>
      <div className="px-5 pt-8 pb-5 text-center" style={{ background: INK }}>
        <p className="text-xs font-bold tracking-widest" style={{ color: GOLD }}>VINK CORPORATE</p>
        <p className="text-white text-lg font-bold mt-2">One platform. Total financial control.</p>
        <p className="text-white/60 text-[11px] mt-1">Choose your corporate account tier to continue.</p>
      </div>
      <div className="flex-1 px-3 pt-4 pb-3 space-y-2.5">
        {TIER_ORDER.map(t => {
          const info = TIER_INFO[t];
          const active = picked === t;
          return (
            <button key={t} onClick={() => setPicked(t)}
              className="w-full text-left rounded-2xl p-3.5 transition-all"
              style={{ background: active ? `${PLUM}0D` : "#fff", border: `1.5px solid ${active ? PLUM : "#EEE"}`, boxShadow: active ? `0 4px 14px ${PLUM}22` : "none" }}>
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: active ? PLUM : "#F3F4F6", color: active ? "#fff" : "#6B7280" }}>{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-gray-900">{t} Corporate</p>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>TIER {info.order}</span>
                  </div>
                  <p className="text-gray-500 text-[10.5px] mt-0.5">{info.purpose}</p>
                </div>
                {active && <CheckCircle className="w-4 h-4 shrink-0" style={{ color: PLUM }} />}
              </div>
              {active && (
                <p className="text-[10px] mt-2.5 pt-2.5 border-t leading-relaxed" style={{ borderColor: `${PLUM}22`, color: PLUM }}>
                  <strong>Unlocks:</strong> {info.unlocks}
                </p>
              )}
            </button>
          );
        })}
      </div>
      <div className="px-3 pb-4 flex-shrink-0">
        <button disabled={!picked} onClick={() => picked && onSelect(picked)}
          className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40 transition-opacity" style={{ background: INK }}>
          {picked ? `Continue with ${picked}` : "Choose an account to continue"}
        </button>
      </div>
    </div>
  );
}

function VerifyingScreen({ tier, onDone }: { tier: Tier; onDone: () => void }) {
  useState(() => { const id = setTimeout(onDone, 1300); return () => clearTimeout(id); });
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "#F5F3FA" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: PLUM }} />
      <div className="text-center px-8">
        <p className="text-sm font-bold text-gray-900">Setting up {tier} Corporate</p>
        <p className="text-gray-400 text-[11px] mt-1">Provisioning your organization's banking workspace...</p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────
const ROLE_KPIS: Record<Role, { label: string; value: string }[]> = {
  CEO: [
    { label: "Total corporate assets", value: "R 412.6m" },
    { label: "Net cash position", value: "R 84.2m" },
    { label: "Total investments", value: "R 118.5m" },
    { label: "FX exposure", value: "6 currencies" },
  ],
  CFO: [
    { label: "Cash position", value: "R 84.2m" },
    { label: "Liquidity", value: "R 61.0m" },
    { label: "Receivables", value: "R 22.4m" },
    { label: "Payables", value: "R 14.8m" },
  ],
  "Finance Manager": [
    { label: "Pending approvals", value: "7" },
    { label: "Supplier payments", value: "R 3.2m" },
    { label: "Payroll queue", value: "R 1.9m" },
    { label: "Budget utilization", value: "68%" },
  ],
};

function DashboardScreen({ tier }: { tier: Tier }) {
  const info = TIER_INFO[tier];
  const unlockedFrom = (min: number) => info.order >= min;
  const [role, setRole] = useState<Role>("CFO");
  const kpis = ROLE_KPIS[role];

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F5F3FA" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: INK }}>
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <p className="text-xs font-bold tracking-widest" style={{ color: GOLD }}>VINK CORPORATE</p>
            <p className="text-white/60 text-[10px]">{tier} Corporate Account</p>
          </div>
          <Bell className="w-5 h-5 text-white/80" />
        </div>
        <div className="flex gap-1.5">
          {ROLES.map(r => (
            <button key={r} onClick={() => setRole(r)}
              className="px-2.5 py-1 rounded-full text-[9px] font-bold whitespace-nowrap"
              style={{ background: role === r ? GOLD : "rgba(255,255,255,0.1)", color: role === r ? INK : "rgba(255,255,255,0.7)" }}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Role-based KPI card */}
      <div className="mx-3 -mt-1 rounded-2xl p-5 shadow-xl" style={{ background: info.gradient }}>
        <p className="text-white/50 text-[9px] uppercase tracking-wider">{role} view</p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {kpis.map(k => (
            <div key={k.label}>
              <p className="text-white/50 text-[8px]">{k.label}</p>
              <p className="text-white text-sm font-bold mt-0.5">{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-3 pt-4">
        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="flex justify-between">
          {[["Approve","✅"],["Treasury","📈"],["Cards","💳"],["Transfer","💸"],["Reports","📊"]].map(([label, emoji]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg shadow-sm" style={{ background: `${PLUM}11`, border: `1.5px solid ${PLUM}33` }}>{emoji}</div>
              <span className="text-gray-500 text-[9px] font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Apex+ treasury & payroll */}
      {unlockedFrom(2) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Treasury Snapshot</p>
          <div className="rounded-2xl bg-white shadow-sm p-3.5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${PLUM}11`, color: PLUM }}><TrendingUp className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800">Daily liquidity: R61.0m</p>
              <p className="text-[10px] text-gray-400">Bulk payroll run scheduled: 25 Aug — R1.9m, 84 employees</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
        </div>
      )}

      {/* Vertex+ organization structure */}
      {unlockedFrom(3) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Organization</p>
          <div className="rounded-2xl bg-white shadow-sm p-3.5">
            <div className="flex flex-col gap-1.5">
              {["Holding Company", "Subsidiary A", "Subsidiary B", "Regional Office"].map((org, i) => (
                <div key={org} className="flex items-center gap-2" style={{ paddingLeft: i * 12 }}>
                  {i > 0 && <span className="text-gray-300 text-[10px]">↳</span>}
                  <span className="text-[10.5px] text-gray-700">{org}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2.5 pt-2.5 border-t border-gray-50">4 companies · 12 department budgets · ERP connected</p>
          </div>
        </div>
      )}

      {/* Nexus+ global banking */}
      {unlockedFrom(4) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Global Banking</p>
          <div className="grid grid-cols-4 gap-2">
            {[["USD","R38.2m"],["EUR","R19.4m"],["GBP","R8.7m"],["AED","R4.1m"]].map(([cur, val]) => (
              <div key={cur} className="rounded-xl bg-white shadow-sm p-2 text-center">
                <p className="text-[8px] text-gray-400">{cur}</p>
                <p className="text-[9.5px] font-bold text-gray-800 mt-0.5">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dominion+ risk & compliance */}
      {unlockedFrom(5) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Risk & Compliance</p>
          <div className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "#FEF3C7" }}>
            <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: "#B45309" }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "#92400E" }}>1 AML alert requires review</p>
              <p className="text-[10px] text-amber-700/80">Fraud centre · Risk dashboard · Audit trail all current</p>
            </div>
          </div>
        </div>
      )}

      {/* Legacy executive/wealth */}
      {unlockedFrom(6) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Executive & Wealth</p>
          <div className="rounded-2xl bg-white shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-800">Investment portfolio</span>
              <span className="text-xs font-bold text-green-600">+7.6% YTD</span>
            </div>
            {[["Equities & ETFs","34%","#1D1740"],["Money market funds","28%","#B45309"],["Bonds & treasury","23%","#0369A1"],["Alternative investments","15%","#065F46"]].map(([label,pct,color]) => (
              <div key={label} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <span className="w-24 text-[9px] text-gray-500 shrink-0">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct as string, background: color as string }} /></div>
                <span className="w-8 text-[9px] font-semibold text-gray-700 text-right">{pct}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-50">
              <Briefcase className="w-3.5 h-3.5 shrink-0" style={{ color: PLUM }} />
              <p className="text-[10px] text-gray-500">Dedicated executive banker · Family office · Succession planning</p>
            </div>
          </div>
        </div>
      )}

      <div className="pb-4" />
    </div>
  );
}

// ─── Payments ─────────────────────────────────────────────────────────────
function PaymentsScreen() {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F5F3FA" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: INK }}><p className="text-white text-sm font-bold">Payments</p></div>
      {sent ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <CheckCircle className="w-10 h-10" style={{ color: PLUM }} />
          <p className="text-sm font-bold text-gray-900">R{amount || "0"} sent to {recipient || "recipient"}</p>
          <p className="text-[10px] text-gray-400">Routed through payment approval chain</p>
          <button onClick={() => { setSent(false); setAmount(""); setRecipient(""); }} className="text-xs font-semibold" style={{ color: PLUM }}>Send another</button>
        </div>
      ) : (
        <div className="px-3 pt-4 space-y-3">
          {[["Supplier payment","📦"],["Payroll","👥"],["Tax payment","🏛️"],["International","🌍"]].map(([label, emoji]) => (
            <div key={label} className="flex items-center gap-3 bg-white rounded-2xl shadow-sm p-3">
              <span className="text-lg">{emoji}</span>
              <span className="text-xs font-semibold text-gray-800 flex-1">{label}</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          ))}
          <div className="pt-2">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Pay to</label>
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Supplier, employee or vendor"
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Amount (ZAR)</label>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="0.00" inputMode="numeric"
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-500" />
          </div>
          <button disabled={!amount || !recipient} onClick={() => setSent(true)}
            className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40" style={{ background: INK }}>
            Send R{amount || "0"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Treasury ─────────────────────────────────────────────────────────────
function TreasuryScreen() {
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F5F3FA" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: INK }}><p className="text-white text-sm font-bold">Treasury</p></div>
      <div className="px-3 pt-4 space-y-3">
        <div className="rounded-2xl bg-white shadow-sm p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Liquidity ratio</p>
          <p className="text-2xl font-bold text-gray-900">1.84×</p>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-2"><div className="h-full rounded-full" style={{ width: "72%", background: PLUM }} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[["Cash pool","R61.0m"],["Debt position","R22.4m"],["Investment portfolio","R118.5m"],["FX exposure","6 currencies"]].map(([label, val]) => (
            <div key={label} className="rounded-2xl bg-white shadow-sm p-3">
              <p className="text-[9px] text-gray-400">{label}</p>
              <p className="text-sm font-bold text-gray-800 mt-1">{val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Approvals ────────────────────────────────────────────────────────────
const APPROVALS = [
  { desc: "Supplier payment — Metro Foods", amount: 82400, from: "Finance Manager" },
  { desc: "Payroll run — 84 employees", amount: 1900000, from: "HR Payroll" },
  { desc: "Capex — New office equipment", amount: 145000, from: "Operations" },
];

function ApprovalsScreen() {
  const [approved, setApproved] = useState<number[]>([]);
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F5F3FA" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: INK }}><p className="text-white text-sm font-bold">Approvals</p></div>
      <div className="px-3 pt-4">
        <div className="flex items-center gap-1 text-[9px] text-gray-500 mb-4 flex-wrap">
          {["Employee","Manager","Finance","CFO","CEO"].map((step, i) => (
            <span key={step} className="flex items-center gap-1">
              <span className="px-2 py-1 rounded-full" style={{ background: i === 2 ? `${PLUM}22` : "#F3F4F6", color: i === 2 ? PLUM : "#9CA3AF", fontWeight: i === 2 ? 700 : 500 }}>{step}</span>
              {i < 4 && <ChevronRight className="w-2.5 h-2.5 text-gray-300" />}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          {APPROVALS.map((a, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-sm p-3.5">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${PLUM}11`, color: PLUM }}><ClipboardCheck className="w-4 h-4" /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{a.desc}</p>
                  <p className="text-[10px] text-gray-400">R{a.amount.toLocaleString()} · from {a.from}</p>
                </div>
              </div>
              {approved.includes(i) ? (
                <p className="text-[10px] font-semibold text-green-600 mt-2 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Approved</p>
              ) : (
                <button onClick={() => setApproved(p => [...p, i])} className="w-full mt-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold" style={{ background: INK }}>
                  Approve
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── More ─────────────────────────────────────────────────────────────────
function MoreScreen({ tier }: { tier: Tier }) {
  const info = TIER_INFO[tier];
  const unlockedFrom = (min: number) => info.order >= min;
  const [showCompare, setShowCompare] = useState(false);

  const MENU = [
    { label: "Accounts", icon: <Wallet className="w-4 h-4" />, min: 1 },
    { label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, min: 2 },
    { label: "Organization", icon: <Users className="w-4 h-4" />, min: 3 },
    { label: "Global Banking", icon: <Globe2 className="w-4 h-4" />, min: 4 },
    { label: "Settings", icon: <Settings className="w-4 h-4" />, min: 1 },
  ];

  if (showCompare) {
    return (
      <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F5F3FA" }}>
        <div className="px-4 py-3 flex-shrink-0 flex items-center gap-2" style={{ background: INK }}>
          <button onClick={() => setShowCompare(false)} className="text-white/70 text-xs">←</button>
          <p className="text-white text-sm font-bold">Feature progression</p>
        </div>
        <div className="overflow-x-auto px-2 pt-3 pb-4">
          <table className="text-[9px] border-collapse">
            <thead>
              <tr>
                <th className="text-left px-2 py-1.5 text-gray-400 font-medium sticky left-0 bg-[#F5F3FA]"></th>
                {TIER_ORDER.map(t => <th key={t} className="px-2 py-1.5 font-bold text-gray-700 whitespace-nowrap">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map(row => (
                <tr key={row.label} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap sticky left-0 bg-[#F5F3FA]">{row.label}</td>
                  {TIER_ORDER.map(t => (
                    <td key={t} className="px-2 py-1.5 text-center font-semibold whitespace-nowrap" style={{ color: row.values[t] === "✓" ? PLUM : row.values[t] === "—" ? "#D1D5DB" : "#B45309" }}>
                      {row.values[t]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F5F3FA" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: INK }}>
        <p className="text-white text-sm font-bold">More</p>
        <p className="text-white/50 text-[10px] mt-0.5">{tier} Corporate Account</p>
      </div>
      <div className="px-3 pt-4 space-y-2">
        {MENU.map(m => {
          const unlocked = unlockedFrom(m.min);
          return (
            <div key={m.label} className="rounded-2xl bg-white shadow-sm p-3.5 flex items-center gap-3" style={{ opacity: unlocked ? 1 : 0.5 }}>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: unlocked ? `${PLUM}11` : "#F3F4F6", color: unlocked ? PLUM : "#9CA3AF" }}>{m.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800">{m.label}</p>
                {!unlocked && <p className="text-[9px] text-gray-400">Unlocks at {TIER_ORDER[m.min - 1]} tier</p>}
              </div>
              {unlocked ? <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" /> : <Lock className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
            </div>
          );
        })}
        <button onClick={() => setShowCompare(true)} className="w-full rounded-2xl p-3.5 flex items-center gap-3 mt-2" style={{ background: `${PLUM}0D`, border: `1px solid ${PLUM}22` }}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: PLUM, color: "#fff" }}><ArrowUpRight className="w-4 h-4" /></span>
          <div className="flex-1 text-left">
            <p className="text-xs font-semibold" style={{ color: PLUM }}>Feature progression</p>
            <p className="text-[9px] text-gray-500">See what each tier unlocks</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────
export function VinkCorporateBankingApp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [tier, setTier] = useState<Tier>("Foundation");
  const [verifying, setVerifying] = useState(false);
  const [pendingTier, setPendingTier] = useState<Tier>("Foundation");

  if (!isOpen) return null;

  const handleTierSelected = (t: Tier) => { setPendingTier(t); setVerifying(true); };
  const handleVerified = () => { setTier(pendingTier); setVerifying(false); setScreen("dashboard"); };

  const TABS: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <Home className="w-5 h-5" /> },
    { id: "payments",  label: "Payments",  icon: <Send className="w-5 h-5" /> },
    { id: "treasury",  label: "Treasury",  icon: <TrendingUp className="w-5 h-5" /> },
    { id: "approvals", label: "Approvals", icon: <ClipboardCheck className="w-5 h-5" /> },
    { id: "more",      label: "More",      icon: <MoreHorizontal className="w-5 h-5" /> },
  ];
  const showTabs = screen !== "onboarding" && !verifying;

  return (
    <MobileAppOverlay onClose={onClose} appName="Vink Corporate" bgColor="#F5F3FA">
      <PhoneFrame statusBarColor={INK} statusBarTextLight>
        <div className="flex-1 overflow-hidden flex flex-col">
          {verifying ? (
            <VerifyingScreen tier={pendingTier} onDone={handleVerified} />
          ) : (
            <>
              {screen === "onboarding" && <OnboardingScreen onSelect={handleTierSelected} />}
              {screen === "dashboard" && <DashboardScreen tier={tier} />}
              {screen === "payments"  && <PaymentsScreen />}
              {screen === "treasury"  && <TreasuryScreen />}
              {screen === "approvals" && <ApprovalsScreen />}
              {screen === "more"      && <MoreScreen tier={tier} />}
            </>
          )}
        </div>
        {showTabs && (
          <div className="flex-shrink-0 flex items-center border-t bg-white" style={{ borderColor: `${PLUM}22` }}>
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setScreen(tab.id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 relative transition-colors"
                style={{ color: screen === tab.id ? PLUM : "#9CA3AF" }}>
                {tab.icon}
                <span className="text-[9px] font-semibold">{tab.label}</span>
                {screen === tab.id && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ background: PLUM }} />}
              </button>
            ))}
          </div>
        )}
      </PhoneFrame>
    </MobileAppOverlay>
  );
}
