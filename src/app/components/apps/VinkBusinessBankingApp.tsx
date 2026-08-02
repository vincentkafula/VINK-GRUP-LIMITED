import { useState } from "react";
import {
  Home, CreditCard, FileText, BarChart3, MoreHorizontal, Bell, ChevronRight,
  Send, Users, Briefcase, Sparkles, Hammer, Zap, Mountain, Crown, Landmark,
  CheckCircle, Loader2, TrendingUp, Wallet, ShieldCheck, Building2, ArrowUpRight,
  Receipt, QrCode, Banknote, Lock, Gift,
} from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";

type Screen = "onboarding" | "dashboard" | "payments" | "invoices" | "cards" | "more";
type Tier = "Launch" | "Forge" | "Catalyst" | "Pinnacle" | "Empire" | "Sovereign";

const INK = "#0B2E1C";
const GREEN = "#0B5C2E";
const GOLD = "#F5A623";

const TIER_INFO: Record<Tier, {
  order: number; icon: React.ReactNode; tagline: string; bestFor: string[]; unlocks: string; gradient: string;
}> = {
  Launch:   { order: 1, icon: <Sparkles className="w-5 h-5" />,  tagline: "Where Great Businesses Begin.",                      bestFor: ["Startups", "Freelancers", "Consultants", "Small shops", "Online sellers"], unlocks: "Business account, virtual card, payments, digital receipts", gradient: `linear-gradient(135deg,${GREEN},#175E38)` },
  Forge:    { order: 2, icon: <Hammer className="w-5 h-5" />,    tagline: "Build with Confidence.",                             bestFor: ["Growing SMEs", "Restaurants", "Retail stores", "Service businesses"],       unlocks: "+ Team management, payroll, expense tracking",              gradient: `linear-gradient(135deg,${GREEN},#175E38)` },
  Catalyst: { order: 3, icon: <Zap className="w-5 h-5" />,       tagline: "Accelerate Every Opportunity.",                      bestFor: ["Fast-growing companies", "E-commerce", "Logistics", "Agencies"],           unlocks: "+ Invoicing, AI cash flow, rewards, financing",              gradient: `linear-gradient(135deg,#6B21A8,${GREEN})` },
  Pinnacle: { order: 4, icon: <Mountain className="w-5 h-5" />,  tagline: "Business at Its Highest Level.",                     bestFor: ["Established businesses", "Manufacturers", "Construction", "Import & export"], unlocks: "+ Treasury, multi-currency, business intelligence",       gradient: `linear-gradient(135deg,#0369A1,${GREEN})` },
  Empire:   { order: 5, icon: <Crown className="w-5 h-5" />,     tagline: "Powering Businesses Without Limits.",                bestFor: ["Large enterprises", "National companies", "Corporate groups"],             unlocks: "+ Branch management, corporate cards, approval workflows",  gradient: `linear-gradient(135deg,#B45309,${GREEN})` },
  Sovereign:{ order: 6, icon: <Landmark className="w-5 h-5" />,  tagline: "Private Corporate Banking for Industry Leaders.",    bestFor: ["Multinationals", "Investment companies", "Family offices", "Holding companies"], unlocks: "+ Wealth, private banking, global treasury, family office", gradient: `linear-gradient(135deg,#1E1B4B,#3B1A6E)` },
};
const TIER_ORDER: Tier[] = ["Launch", "Forge", "Catalyst", "Pinnacle", "Empire", "Sovereign"];

const FEATURE_ROWS: { label: string; values: Record<Tier, string> }[] = [
  { label: "Business account",      values: { Launch: "✓", Forge: "✓", Catalyst: "✓", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Virtual cards",         values: { Launch: "✓", Forge: "✓", Catalyst: "✓", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Payroll",               values: { Launch: "—", Forge: "✓", Catalyst: "✓", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Multi-user access",     values: { Launch: "—", Forge: "✓", Catalyst: "✓", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Invoicing",             values: { Launch: "Basic", Forge: "Advanced", Catalyst: "Smart", Pinnacle: "Smart", Empire: "Enterprise", Sovereign: "Enterprise" } },
  { label: "AI cash flow",          values: { Launch: "—", Forge: "—", Catalyst: "✓", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Business rewards",      values: { Launch: "—", Forge: "—", Catalyst: "✓", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Multi-currency",        values: { Launch: "—", Forge: "—", Catalyst: "—", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Treasury tools",        values: { Launch: "—", Forge: "—", Catalyst: "—", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Department management", values: { Launch: "—", Forge: "—", Catalyst: "—", Pinnacle: "—", Empire: "✓", Sovereign: "✓" } },
  { label: "Approval workflows",    values: { Launch: "—", Forge: "—", Catalyst: "—", Pinnacle: "Limited", Empire: "✓", Sovereign: "✓" } },
  { label: "Investment dashboard",  values: { Launch: "—", Forge: "—", Catalyst: "—", Pinnacle: "Limited", Empire: "Limited", Sovereign: "✓" } },
  { label: "Dedicated banker",      values: { Launch: "—", Forge: "—", Catalyst: "—", Pinnacle: "✓", Empire: "✓", Sovereign: "✓" } },
  { label: "Family office services",values: { Launch: "—", Forge: "—", Catalyst: "—", Pinnacle: "—", Empire: "—", Sovereign: "✓" } },
];

const TRANSACTIONS = [
  { emoji: "🧾", name: "Invoice #1042 — Paid",    amount: 24500,   date: "Today" },
  { emoji: "💸", name: "Supplier — Metro Foods",  amount: -8200,   date: "Today" },
  { emoji: "👥", name: "Payroll — 12 employees",  amount: -84200,  date: "Yesterday" },
  { emoji: "🏦", name: "Loan repayment",           amount: -5400,   date: "18 Jun" },
  { emoji: "💳", name: "Card — Office Supplies",   amount: -1120,   date: "17 Jun" },
];

// ─── Onboarding ───────────────────────────────────────────────────────────
function OnboardingScreen({ onSelect }: { onSelect: (tier: Tier) => void }) {
  const [picked, setPicked] = useState<Tier | null>(null);
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F7F9F8" }}>
      <div className="px-5 pt-8 pb-5 text-center" style={{ background: INK }}>
        <p className="text-xs font-bold tracking-widest" style={{ color: GOLD }}>VINK BUSINESS</p>
        <p className="text-white text-lg font-bold mt-2">One app that grows with your business</p>
        <p className="text-white/60 text-[11px] mt-1">Unlock more powerful tools as you upgrade — never switch apps.</p>
      </div>

      <div className="flex-1 px-3 pt-4 pb-3 space-y-2.5">
        {TIER_ORDER.map(t => {
          const info = TIER_INFO[t];
          const active = picked === t;
          return (
            <button
              key={t}
              onClick={() => setPicked(t)}
              className="w-full text-left rounded-2xl p-3.5 transition-all"
              style={{ background: active ? `${GREEN}0D` : "#fff", border: `1.5px solid ${active ? GREEN : "#EEE"}`, boxShadow: active ? `0 4px 14px ${GREEN}22` : "none" }}
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: active ? GREEN : "#F3F4F6", color: active ? "#fff" : "#6B7280" }}>{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-gray-900">{t} Business</p>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>TIER {info.order}</span>
                  </div>
                  <p className="text-gray-500 text-[10.5px] mt-0.5 italic">{info.tagline}</p>
                </div>
                {active && <CheckCircle className="w-4 h-4 shrink-0" style={{ color: GREEN }} />}
              </div>
              {active && (
                <div className="mt-2.5 pt-2.5 border-t" style={{ borderColor: `${GREEN}22` }}>
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Best for</p>
                  <p className="text-[10.5px] text-gray-600 mb-2">{info.bestFor.join(" · ")}</p>
                  <p className="text-[10px]" style={{ color: GREEN }}><strong>Unlocks:</strong> {info.unlocks}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="px-3 pb-4 flex-shrink-0">
        <button
          disabled={!picked}
          onClick={() => picked && onSelect(picked)}
          className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40 transition-opacity"
          style={{ background: INK }}
        >
          {picked ? `Continue with ${picked}` : "Choose an account to continue"}
        </button>
      </div>
    </div>
  );
}

function VerifyingScreen({ tier, onDone }: { tier: Tier; onDone: () => void }) {
  useState(() => { const id = setTimeout(onDone, 1300); return () => clearTimeout(id); });
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "#F7F9F8" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: GREEN }} />
      <div className="text-center px-8">
        <p className="text-sm font-bold text-gray-900">Setting up {tier} Business</p>
        <p className="text-gray-400 text-[11px] mt-1">Activating your business banking tools...</p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────
function DashboardScreen({ tier }: { tier: Tier }) {
  const info = TIER_INFO[tier];
  const unlockedFrom = (min: number) => info.order >= min;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F7F9F8" }}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: INK }}>
        <div>
          <p className="text-xs font-bold tracking-widest" style={{ color: GOLD }}>VINK BUSINESS</p>
          <p className="text-white/70 text-[10px]">{tier} Business Account</p>
        </div>
        <button className="relative">
          <Bell className="w-5 h-5 text-white/80" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-400" />
        </button>
      </div>

      {/* Balance card */}
      <div className="mx-3 -mt-1 rounded-2xl p-5 shadow-xl" style={{ background: info.gradient }}>
        {tier === "Sovereign" ? (
          <>
            <p className="text-white/50 text-[9px] uppercase tracking-wider">Corporate Net Worth</p>
            <p className="text-white text-[26px] font-bold tracking-tight mt-0.5">R 48.2m</p>
            <div className="flex items-center gap-4 mt-2">
              <div><p className="text-white/50 text-[8px]">Assets</p><p className="text-white text-[11px] font-bold">R 61.4m</p></div>
              <div><p className="text-white/50 text-[8px]">Liabilities</p><p className="text-white text-[11px] font-bold">R 13.2m</p></div>
              <div><p className="text-white/50 text-[8px]">Global exposure</p><p className="text-white text-[11px] font-bold">6 markets</p></div>
            </div>
          </>
        ) : (
          <>
            <p className="text-white/60 text-xs">Available Balance</p>
            <p className="text-white text-[26px] font-bold tracking-tight mt-1">R 284,650.00</p>
            <div className="flex items-center gap-4 mt-3">
              <div><p className="text-white/50 text-[8px]">Today's revenue</p><p className="text-white text-[11px] font-bold">+R 24,500</p></div>
              <div><p className="text-white/50 text-[8px]">Pending</p><p className="text-white text-[11px] font-bold">R 8,900</p></div>
              <div><p className="text-white/50 text-[8px]">Credit score</p><p className="text-white text-[11px] font-bold">742</p></div>
            </div>
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="px-3 pt-4">
        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="flex justify-between">
          {[["Receive","📥"],["Send","💸"],["Suppliers","📦"],["Payroll","👥"],["Invoice","🧾"]].map(([label, emoji]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg shadow-sm" style={{ background: `${GREEN}11`, border: `1.5px solid ${GREEN}33` }}>{emoji}</div>
              <span className="text-gray-500 text-[9px] font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Forge+ team & payroll */}
      {unlockedFrom(2) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Team & Payroll</p>
          <div className="rounded-2xl bg-white shadow-sm p-3.5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${GREEN}11`, color: GREEN }}><Users className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800">12 employees on payroll</p>
              <p className="text-[10px] text-gray-400">Next payroll run: 25 Aug · R84,200</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
        </div>
      )}

      {/* Catalyst+ cash flow + rewards */}
      {unlockedFrom(3) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Cash Flow Forecast</p>
          <div className="rounded-2xl p-3.5" style={{ background: `${GREEN}0D`, border: `1px solid ${GREEN}22` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-800 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" style={{ color: GREEN }} /> AI Forecast</span>
              <span className="text-[10px] font-bold text-green-600">+12% next month</span>
            </div>
            <p className="text-[10.5px] text-gray-600">Based on current invoices, expect R312,000 inflow and R198,000 outflow over the next 30 days.</p>
            <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t" style={{ borderColor: `${GREEN}22` }}>
              <Gift className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
              <p className="text-[10px] text-gray-600">R1,240 business cashback earned this month</p>
            </div>
          </div>
        </div>
      )}

      {/* Pinnacle+ treasury & multi-currency */}
      {unlockedFrom(4) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Treasury & FX</p>
          <div className="grid grid-cols-3 gap-2">
            {[["USD","R 214,300"],["EUR","R 88,150"],["GBP","R 41,900"]].map(([cur, val]) => (
              <div key={cur} className="rounded-xl bg-white shadow-sm p-2.5 text-center">
                <p className="text-[9px] text-gray-400">{cur} Wallet</p>
                <p className="text-[11px] font-bold text-gray-800 mt-0.5">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empire+ corporate governance */}
      {unlockedFrom(5) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Approval Workflow</p>
          <div className="rounded-2xl bg-white shadow-sm p-3.5">
            <div className="flex items-center justify-between text-[9px] text-gray-500">
              {["Employee","Manager","Finance Dir.","CEO"].map((step, i) => (
                <div key={step} className="flex items-center gap-1">
                  <span className="px-2 py-1 rounded-full whitespace-nowrap" style={{ background: i === 0 ? `${GREEN}11` : "#F3F4F6", color: i === 0 ? GREEN : "#9CA3AF", fontWeight: i === 0 ? 700 : 500 }}>{step}</span>
                  {i < 3 && <ChevronRight className="w-2.5 h-2.5 text-gray-300" />}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-2.5">2 payments pending approval — R145,000 total</p>
          </div>
        </div>
      )}

      {/* Sovereign wealth & family office */}
      {unlockedFrom(6) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Wealth & Family Office</p>
          <div className="rounded-2xl bg-white shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-800">Investment portfolio</span>
              <span className="text-xs font-bold text-green-600">+9.1% YTD</span>
            </div>
            {[["Money market funds","38%","#0B5C2E"],["Government securities","27%","#B45309"],["Bonds","20%","#6B21A8"],["Private equity","15%","#0369A1"]].map(([label,pct,color]) => (
              <div key={label} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <span className="w-24 text-[9px] text-gray-500 shrink-0">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct as string, background: color as string }} /></div>
                <span className="w-8 text-[9px] font-semibold text-gray-700 text-right">{pct}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-50">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: GREEN }} />
              <p className="text-[10px] text-gray-500">Dedicated banker · Trust management · Succession planning</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className="px-3 pt-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Recent Transactions</p>
        </div>
        <div className="rounded-2xl overflow-hidden bg-white shadow-sm">
          {TRANSACTIONS.map((t, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">{t.emoji}</div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 text-xs font-medium truncate">{t.name}</p>
                <p className="text-gray-400 text-[10px]">{t.date}</p>
              </div>
              <span className={`text-xs font-bold flex-shrink-0 ${t.amount > 0 ? "text-green-600" : "text-gray-700"}`}>
                {t.amount > 0 ? "+" : ""}R{Math.abs(t.amount).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Payments ─────────────────────────────────────────────────────────────
function PaymentsScreen() {
  const [tab, setTab] = useState<"send" | "receive">("send");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F7F9F8" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: INK }}>
        <p className="text-white text-sm font-bold">Payments</p>
      </div>
      <div className="flex px-3 pt-3 gap-2">
        {(["send", "receive"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSent(false); }}
            className="flex-1 py-2 rounded-xl text-xs font-bold capitalize"
            style={{ background: tab === t ? GREEN : "#fff", color: tab === t ? "#fff" : "#6B7280", border: `1px solid ${tab === t ? GREEN : "#EEE"}` }}>
            {t} money
          </button>
        ))}
      </div>

      {tab === "send" ? (
        sent ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <CheckCircle className="w-10 h-10" style={{ color: GREEN }} />
            <p className="text-sm font-bold text-gray-900">R{amount || "0"} sent to {recipient || "recipient"}</p>
            <button onClick={() => { setSent(false); setAmount(""); setRecipient(""); }} className="text-xs font-semibold" style={{ color: GREEN }}>Send another</button>
          </div>
        ) : (
          <div className="px-3 pt-4 space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Pay to</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Supplier or recipient name"
                className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-green-600" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Amount (ZAR)</label>
              <input value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="0.00" inputMode="numeric"
                className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-green-600" />
            </div>
            <div className="flex gap-2">
              {[["QR", <QrCode className="w-4 h-4" key="q" />], ["Bank transfer", <Banknote className="w-4 h-4" key="b" />]].map(([label, icon]) => (
                <div key={label as string} className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-100 text-[10px] text-gray-500">{icon}{label}</div>
              ))}
            </div>
            <button
              disabled={!amount || !recipient}
              onClick={() => setSent(true)}
              className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40"
              style={{ background: INK }}
            >
              Send R{amount || "0"}
            </button>
          </div>
        )
      ) : (
        <div className="px-3 pt-4 flex flex-col items-center gap-3">
          <div className="w-40 h-40 rounded-2xl bg-white shadow-sm flex items-center justify-center">
            <QrCode className="w-24 h-24 text-gray-800" />
          </div>
          <p className="text-xs text-gray-500 text-center">Show this QR code to receive an instant business payment</p>
          <button className="text-xs font-semibold px-4 py-2 rounded-full" style={{ background: `${GREEN}11`, color: GREEN }}>Share payment link</button>
        </div>
      )}
    </div>
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────
const INVOICES = [
  { num: "#1042", client: "Metro Retail Group", amount: 24500, status: "Paid" },
  { num: "#1041", client: "Sunrise Logistics",  amount: 18200, status: "Paid" },
  { num: "#1040", client: "Coastal Traders",    amount: 9600,  status: "Overdue" },
  { num: "#1039", client: "Delta Wholesalers",  amount: 32100, status: "Pending" },
];

function InvoicesScreen() {
  const statusColor: Record<string, string> = { Paid: "#10B981", Overdue: "#EF4444", Pending: "#F59E0B" };
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F7F9F8" }}>
      <div className="px-4 py-3 flex-shrink-0 flex items-center justify-between" style={{ background: INK }}>
        <p className="text-white text-sm font-bold">Invoices</p>
        <button className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: GOLD, color: INK }}>+ New</button>
      </div>
      <div className="px-3 pt-4 space-y-2">
        {INVOICES.map(inv => (
          <div key={inv.num} className="rounded-2xl bg-white shadow-sm p-3.5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${GREEN}11`, color: GREEN }}><Receipt className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800">{inv.num} — {inv.client}</p>
              <p className="text-[10px] text-gray-400">R{inv.amount.toLocaleString()}</p>
            </div>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${statusColor[inv.status]}18`, color: statusColor[inv.status] }}>{inv.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────
function CardsScreen() {
  const [frozen, setFrozen] = useState(false);
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F7F9F8" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: INK }}>
        <p className="text-white text-sm font-bold">Business Cards</p>
      </div>
      <div className="mx-3 mt-4 rounded-2xl p-5 shadow-xl relative" style={{ background: `linear-gradient(135deg,${GREEN},#175E38)`, opacity: frozen ? 0.5 : 1 }}>
        {frozen && <div className="absolute inset-0 flex items-center justify-center"><Lock className="w-8 h-8 text-white" /></div>}
        <p className="text-white/60 text-xs">Virtual Business Card</p>
        <p className="text-white text-base font-mono mt-3 tracking-wider">4521 •••• •••• 8890</p>
        <div className="flex items-center justify-between mt-4">
          <span className="text-white/60 text-[10px]">VINK BUSINESS</span>
          <span className="text-white text-xs font-bold italic">VISA</span>
        </div>
      </div>
      <div className="px-3 pt-4 flex gap-2">
        <button onClick={() => setFrozen(f => !f)} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: frozen ? "#FEE2E2" : "#F3F4F6", color: frozen ? "#DC2626" : "#374151" }}>
          {frozen ? "Unfreeze card" : "Freeze card"}
        </button>
        <button className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: `${GREEN}11`, color: GREEN }}>Set limits</button>
      </div>
    </div>
  );
}

// ─── More (menu + feature comparison) ──────────────────────────────────────
function MoreScreen({ tier }: { tier: Tier }) {
  const info = TIER_INFO[tier];
  const unlockedFrom = (min: number) => info.order >= min;
  const [showCompare, setShowCompare] = useState(false);

  const MENU = [
    { label: "Team", icon: <Users className="w-4 h-4" />, min: 2 },
    { label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, min: 3 },
    { label: "Finance", icon: <Briefcase className="w-4 h-4" />, min: 4 },
    { label: "Corporate Management", icon: <Building2 className="w-4 h-4" />, min: 5 },
    { label: "Wealth & Family Office", icon: <Wallet className="w-4 h-4" />, min: 6 },
  ];

  if (showCompare) {
    return (
      <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F7F9F8" }}>
        <div className="px-4 py-3 flex-shrink-0 flex items-center gap-2" style={{ background: INK }}>
          <button onClick={() => setShowCompare(false)} className="text-white/70 text-xs">←</button>
          <p className="text-white text-sm font-bold">Compare accounts</p>
        </div>
        <div className="overflow-x-auto px-2 pt-3 pb-4">
          <table className="text-[9px] border-collapse">
            <thead>
              <tr>
                <th className="text-left px-2 py-1.5 text-gray-400 font-medium sticky left-0 bg-[#F7F9F8]"></th>
                {TIER_ORDER.map(t => <th key={t} className="px-2 py-1.5 font-bold text-gray-700 whitespace-nowrap">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map(row => (
                <tr key={row.label} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap sticky left-0 bg-[#F7F9F8]">{row.label}</td>
                  {TIER_ORDER.map(t => (
                    <td key={t} className="px-2 py-1.5 text-center font-semibold" style={{ color: row.values[t] === "✓" ? GREEN : row.values[t] === "—" ? "#D1D5DB" : "#F59E0B" }}>
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
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F7F9F8" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: INK }}>
        <p className="text-white text-sm font-bold">More</p>
        <p className="text-white/50 text-[10px] mt-0.5">{tier} Business Account</p>
      </div>
      <div className="px-3 pt-4 space-y-2">
        {MENU.map(m => {
          const unlocked = unlockedFrom(m.min);
          return (
            <div key={m.label} className="rounded-2xl bg-white shadow-sm p-3.5 flex items-center gap-3" style={{ opacity: unlocked ? 1 : 0.5 }}>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: unlocked ? `${GREEN}11` : "#F3F4F6", color: unlocked ? GREEN : "#9CA3AF" }}>{m.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800">{m.label}</p>
                {!unlocked && <p className="text-[9px] text-gray-400">Unlocks at {TIER_ORDER[m.min - 1]} tier</p>}
              </div>
              {unlocked ? <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" /> : <Lock className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
            </div>
          );
        })}
        <button onClick={() => setShowCompare(true)} className="w-full rounded-2xl p-3.5 flex items-center gap-3 mt-2" style={{ background: `${GREEN}0D`, border: `1px solid ${GREEN}22` }}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: GREEN, color: "#fff" }}><ArrowUpRight className="w-4 h-4" /></span>
          <div className="flex-1 text-left">
            <p className="text-xs font-semibold" style={{ color: GREEN }}>Compare all accounts</p>
            <p className="text-[9px] text-gray-500">See what each tier unlocks</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────
export function VinkBusinessBankingApp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [tier, setTier] = useState<Tier>("Launch");
  const [verifying, setVerifying] = useState(false);
  const [pendingTier, setPendingTier] = useState<Tier>("Launch");

  if (!isOpen) return null;

  const handleTierSelected = (t: Tier) => { setPendingTier(t); setVerifying(true); };
  const handleVerified = () => { setTier(pendingTier); setVerifying(false); setScreen("dashboard"); };

  const TABS: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <Home className="w-5 h-5" /> },
    { id: "payments",  label: "Payments",  icon: <Send className="w-5 h-5" /> },
    { id: "invoices",  label: "Invoices",  icon: <FileText className="w-5 h-5" /> },
    { id: "cards",     label: "Cards",     icon: <CreditCard className="w-5 h-5" /> },
    { id: "more",      label: "More",      icon: <MoreHorizontal className="w-5 h-5" /> },
  ];
  const showTabs = screen !== "onboarding" && !verifying;

  return (
    <MobileAppOverlay onClose={onClose} appName="Vink Business" bgColor="#F7F9F8">
      <PhoneFrame statusBarColor={INK} statusBarTextLight>
        <div className="flex-1 overflow-hidden flex flex-col">
          {verifying ? (
            <VerifyingScreen tier={pendingTier} onDone={handleVerified} />
          ) : (
            <>
              {screen === "onboarding" && <OnboardingScreen onSelect={handleTierSelected} />}
              {screen === "dashboard" && <DashboardScreen tier={tier} />}
              {screen === "payments"  && <PaymentsScreen />}
              {screen === "invoices"  && <InvoicesScreen />}
              {screen === "cards"     && <CardsScreen />}
              {screen === "more"      && <MoreScreen tier={tier} />}
            </>
          )}
        </div>
        {showTabs && (
          <div className="flex-shrink-0 flex items-center border-t bg-white" style={{ borderColor: `${GREEN}22` }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setScreen(tab.id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 relative transition-colors"
                style={{ color: screen === tab.id ? GREEN : "#9CA3AF" }}
              >
                {tab.icon}
                <span className="text-[9px] font-semibold">{tab.label}</span>
                {screen === tab.id && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ background: GREEN }} />}
              </button>
            ))}
          </div>
        )}
      </PhoneFrame>
    </MobileAppOverlay>
  );
}
