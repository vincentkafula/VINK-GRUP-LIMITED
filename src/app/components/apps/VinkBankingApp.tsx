import { useState, useEffect } from "react";
import { Home, Send, CreditCard, Clock, Star, Bell, ChevronRight, ArrowUpRight, ArrowDownLeft, Zap, Smartphone, ShoppingCart, Gift, CheckCircle, AlertTriangle, Loader2, Sparkles, Anchor as AnchorIcon, TrendingUp, Mountain, Crown, Landmark, Target, Wallet, PiggyBank, Award, Eye, EyeOff, ShieldCheck, Menu, QrCode, Banknote, User, MoreHorizontal, RefreshCw, CircleDollarSign } from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";
import { globalBankingApi } from "../../services/applicationsApi";
import { mktAuth, type MktAuthUser } from "../../services/marketplaceApi";

type Screen = "onboarding" | "home" | "send" | "cards" | "history" | "rewards";
type Tier = "Spark" | "Anchor" | "Momentum" | "Horizon" | "Summit" | "Legacy";

const PURPLE = "#0B5C2E";
const GOLD = "#F5A623";

const TIER_INFO: Record<Tier, { order: number; icon: React.ReactNode; tagline: string; unlocks: string; balanceLabel: string; cardGradient: string }> = {
  Spark:    { order: 1, icon: <Sparkles className="w-5 h-5" />,     tagline: "Simple, clean entry banking — no clutter, no fees.",         unlocks: "Digital onboarding, payments, virtual card, bill pay",              balanceLabel: "Available Balance", cardGradient: `linear-gradient(135deg, ${PURPLE}, #175E38)` },
  Anchor:   { order: 2, icon: <AnchorIcon className="w-5 h-5" />,   tagline: "Everyday banking with budgets and money management.",       unlocks: "+ Smart budgets, subscription detection, scheduled payments",       balanceLabel: "Available Balance", cardGradient: `linear-gradient(135deg, ${PURPLE}, #175E38)` },
  Momentum: { order: 3, icon: <TrendingUp className="w-5 h-5" />,   tagline: "Every payment earns you something back.",                    unlocks: "+ Cashback, loyalty points, merchant offers, challenges",           balanceLabel: "Available Balance", cardGradient: `linear-gradient(135deg, #FF9900, ${PURPLE})` },
  Horizon:  { order: 4, icon: <Mountain className="w-5 h-5" />,     tagline: "Built around reaching your savings goals faster.",          unlocks: "+ Goal-based savings, auto-save rules, AI coaching",                balanceLabel: "Available Balance", cardGradient: `linear-gradient(135deg, #0369A1, ${PURPLE})` },
  Summit:   { order: 5, icon: <Crown className="w-5 h-5" />,        tagline: "Premium banking with concierge-level service.",              unlocks: "+ Relationship manager, lounge access, multi-currency wallet",      balanceLabel: "Available Balance", cardGradient: `linear-gradient(135deg, #B45309, ${PURPLE})` },
  Legacy:   { order: 6, icon: <Landmark className="w-5 h-5" />,     tagline: "Private banking and wealth management, for generations.",   unlocks: "+ Investments, net worth dashboard, estate planning",               balanceLabel: "Net Worth",         cardGradient: `linear-gradient(135deg, #1E1B4B, #0F3D24)` },
};
const TIER_ORDER: Tier[] = ["Spark", "Anchor", "Momentum", "Horizon", "Summit", "Legacy"];

const TRANSACTIONS = [
  { emoji: "🛒", name: "Shoprite Claremont",       amount: -284.50,  date: "Today",    cat: "Grocery" },
  { emoji: "💰", name: "Salary — VINK Corp",         amount: 18500.00, date: "Today",    cat: "Income" },
  { emoji: "⛽", name: "Shell Garage Observatory",  amount: -650.00,  date: "Yesterday",cat: "Fuel" },
  { emoji: "🏋️", name: "Planet Fitness",            amount: -299.00,  date: "18 Jun",   cat: "Health" },
  { emoji: "📺", name: "Netflix",                   amount: -199.00,  date: "17 Jun",   cat: "Entertainment" },
  { emoji: "🏥", name: "Netcare Life Healthcare",   amount: -1200.00, date: "16 Jun",   cat: "Medical" },
  { emoji: "🍕", name: "Steers",                    amount: -89.00,   date: "15 Jun",   cat: "Food" },
  { emoji: "💳", name: "Refund — Takealot",         amount: 340.00,   date: "14 Jun",   cat: "Refund" },
  { emoji: "📱", name: "MTN Airtime",               amount: -50.00,   date: "14 Jun",   cat: "Airtime" },
  { emoji: "🚕", name: "Vink Taxi Fare",            amount: -68.00,   date: "13 Jun",   cat: "Transport" },
  { emoji: "🏢", name: "City of Cape Town — Rates", amount: -1440.00, date: "12 Jun",   cat: "Municipal" },
  { emoji: "☕", name: "Truth Coffee Roasting",     amount: -42.00,   date: "11 Jun",   cat: "Food" },
];

const REWARDS_HISTORY = [
  { event: "Taxi Fare — Vink Ride",       pts: "+68",  date: "Today" },
  { event: "Shoprite Purchase",            pts: "+28",  date: "Today" },
  { event: "Monthly Salary Deposit",       pts: "+185", date: "Yesterday" },
  { event: "Shell Fuel Purchase",          pts: "+65",  date: "18 Jun" },
  { event: "Airtime Purchase",             pts: "+5",   date: "14 Jun" },
];

// ─── Login ────────────────────────────────────────────────────────────────
function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: MktAuthUser) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!username || !password || (mode === "register" && (!name || !email))) { setError("Fill in all fields."); return; }
    setLoading(true);
    const r = mode === "signin"
      ? await mktAuth.login(username, password)
      : await mktAuth.registerCustomer({ username, password, name, email });
    setLoading(false);
    if (r.success && r.token) onAuthenticated(r.user);
    else setError((r as { error?: string }).error ?? "Something went wrong. Please try again.");
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F8F7FF" }}>
      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="text-center mb-8">
          <p className="text-2xl font-black"><span style={{ color: PURPLE }}>VINK</span> <span style={{ color: GOLD }}>Bank</span></p>
          <p className="text-gray-400 text-xs mt-1">Banking that moves with you.</p>
        </div>

        {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium">{error}</div>}

        {mode === "register" && (
          <>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
              className="w-full mb-2.5 px-3.5 py-3 rounded-xl border border-gray-200 text-sm outline-none" style={{ borderColor: "#E5E7EB" }} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
              className="w-full mb-2.5 px-3.5 py-3 rounded-xl border border-gray-200 text-sm outline-none" />
          </>
        )}
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username"
          className="w-full mb-2.5 px-3.5 py-3 rounded-xl border border-gray-200 text-sm outline-none" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password"
          className="w-full mb-4 px-3.5 py-3 rounded-xl border border-gray-200 text-sm outline-none" />

        <button onClick={submit} disabled={loading} className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: PURPLE }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        <button onClick={() => { setMode(m => m === "signin" ? "register" : "signin"); setError(null); }} className="text-center text-xs font-semibold mt-4" style={{ color: PURPLE }}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
      <p className="text-center text-[10px] text-gray-300 pb-6">Same account works on vink.co.za and the Vink app.</p>
    </div>
  );
}

function OnboardingScreen({ onSelect }: { onSelect: (tier: Tier) => void }) {
  const [picked, setPicked] = useState<Tier | null>(null);

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F8F7FF" }}>
      <div className="px-5 pt-8 pb-5 text-center" style={{ background: PURPLE }}>
        <p className="text-xs font-bold tracking-widest" style={{ color: GOLD }}>VINK BANK</p>
        <p className="text-white text-lg font-bold mt-2">Which account do you want?</p>
        <p className="text-white/60 text-[11px] mt-1">Every tier keeps everything from the one before it.</p>
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
              style={{ background: active ? `${PURPLE}0D` : "#fff", border: `1.5px solid ${active ? PURPLE : "#EEE"}`, boxShadow: active ? `0 4px 14px ${PURPLE}22` : "none" }}
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: active ? PURPLE : "#F3F4F6", color: active ? "#fff" : "#6B7280" }}>
                  {info.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-gray-900">{t}</p>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>TIER {info.order}</span>
                  </div>
                  <p className="text-gray-500 text-[10.5px] mt-0.5 leading-snug">{info.tagline}</p>
                </div>
                {active && <CheckCircle className="w-4 h-4 shrink-0" style={{ color: PURPLE }} />}
              </div>
              {active && (
                <p className="text-[10px] mt-2.5 pt-2.5 border-t leading-relaxed" style={{ borderColor: `${PURPLE}22`, color: PURPLE }}>
                  <strong>Unlocks:</strong> {info.unlocks}
                </p>
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
          style={{ background: PURPLE }}
        >
          {picked ? `Continue with ${picked}` : "Choose an account to continue"}
        </button>
      </div>
    </div>
  );
}

function VerifyingScreen({ tier, onDone }: { tier: Tier; onDone: () => void }) {
  useState(() => { const id = setTimeout(onDone, 1400); return () => clearTimeout(id); });
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "#F8F7FF" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: PURPLE }} />
      <div className="text-center px-8">
        <p className="text-sm font-bold text-gray-900">Setting up your {tier} Account</p>
        <p className="text-gray-400 text-[11px] mt-1">Verifying identity and activating your features...</p>
      </div>
    </div>
  );
}
function HomeScreen({ tier, onSwitchTier, user }: { tier: Tier; onSwitchTier: () => void; user: MktAuthUser }) {
  const info = TIER_INFO[tier];
  const unlockedFrom = (min: number) => info.order >= min;
  const [hideBalance, setHideBalance] = useState(false);
  const balance = tier === "Legacy" ? "R 4,218,600.00" : "R 20,700.00";

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#F8F7FF" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <div>
          <p className="text-white/60 text-[10px]">Hello,</p>
          <p className="text-white text-sm font-bold">{user.name}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 text-white/80 text-[9px] font-semibold">
            <ShieldCheck className="w-3 h-3" /> Secure
          </span>
          <button className="relative">
            <Bell className="w-5 h-5 text-white/80" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-400" />
          </button>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
            <span className="text-white text-xs font-bold">{user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Total balance */}
      <div className="px-4 pt-4 pb-1">
        <div className="flex items-center gap-1.5">
          <p className="text-gray-400 text-[10px] font-medium">Total Balance</p>
          <button onClick={() => setHideBalance(h => !h)}>{hideBalance ? <EyeOff className="w-3 h-3 text-gray-400" /> : <Eye className="w-3 h-3 text-gray-400" />}</button>
        </div>
        <p className="text-2xl font-black text-gray-900 mt-0.5">{hideBalance ? "••••••" : balance}</p>
      </div>

      {/* Balance card */}
      <div className="mx-3 mt-2 rounded-2xl p-5 shadow-xl" style={{ background: info.cardGradient }}>
        <button onClick={onSwitchTier} className="flex items-center gap-1 text-white/60 text-xs hover:text-white/90 transition-colors">
          Vink {tier} Account <ChevronRight className="w-3 h-3" />
        </button>
        {tier === "Legacy" ? (
          <>
            <p className="text-white/50 text-[9px] mt-2 uppercase tracking-wider">Net Worth</p>
            <p className="text-white text-[28px] font-bold tracking-tight mt-0.5">R 4,218,600.00</p>
            <div className="flex items-center gap-4 mt-2">
              <div><p className="text-white/50 text-[8px]">Investments</p><p className="text-white text-[11px] font-bold">R 3.1m</p></div>
              <div><p className="text-white/50 text-[8px]">Cash</p><p className="text-white text-[11px] font-bold">R 640k</p></div>
              <div><p className="text-white/50 text-[8px]">Property</p><p className="text-white text-[11px] font-bold">R 478k</p></div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mt-1">
              <p className="text-white text-[15px] font-bold tracking-tight">VINK</p>
              <ShieldCheck className="w-4 h-4 text-white/70" />
            </div>
            <p className="text-white/50 text-xs mt-3 font-mono">**** **** **** 8061</p>
            <p className="text-white/70 text-[11px] mt-1">{user.name}</p>
          </>
        )}
        {unlockedFrom(3) && tier !== "Legacy" && (
          <div className="flex items-center justify-between mt-4">
            <div>
              <p className="text-white/50 text-[9px]">VINKPOINTS</p>
              <p className="font-bold text-xs" style={{ color: GOLD }}>4,230 pts · R42.30</p>
            </div>
            <div className="px-3 py-1 rounded-full text-[10px] font-bold" style={{ background: GOLD, color: PURPLE }}>
              GOLD
            </div>
          </div>
        )}
      </div>

      {/* Summit+ concierge banner */}
      {unlockedFrom(5) && (
        <div className="mx-3 mt-3 rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "#1E1B4B" }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: GOLD }}><Crown className="w-4 h-4" style={{ color: "#1E1B4B" }} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold">Priority Banker · Available now</p>
            <p className="text-white/50 text-[10px]">Live video banker · Airport lounge access · No queue support</p>
          </div>
          <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
        </div>
      )}

      {/* Quick actions */}
      <div className="px-3 pt-4">
        <div className="grid grid-cols-4 gap-y-3">
          {[
            ["Make\nPayment", <Send className="w-4 h-4" key="s" />],
            ["Transfer\nFunds", <RefreshCw className="w-4 h-4" key="t" />],
            ["Scan to\nPay", <QrCode className="w-4 h-4" key="q" />],
            ["Buy\nAirtime", <Smartphone className="w-4 h-4" key="a" />],
            ["Cardless Cash\nWithdrawal", <Banknote className="w-4 h-4" key="c" />],
            ["Me", <User className="w-4 h-4" key="m" />],
            ["Cards", <CreditCard className="w-4 h-4" key="cc" />],
            ["More", <MoreHorizontal className="w-4 h-4" key="mo" />],
          ].map(([label, icon]) => (
            <div key={label as string} className="flex flex-col items-center gap-1.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: `${PURPLE}11`, border: `1.5px solid ${PURPLE}33`, color: PURPLE }}>
                {icon}
              </div>
              <span className="text-gray-500 text-[8.5px] font-medium text-center leading-tight whitespace-pre-line">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Promo carousel */}
      <div className="px-3 pt-4 flex gap-2.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div className="w-56 shrink-0 rounded-2xl p-3.5" style={{ background: PURPLE }}>
          <div className="flex items-start justify-between">
            <p className="text-white text-[12.5px] font-bold leading-snug w-32">Earn more with Vink Rewards</p>
            <Gift className="w-6 h-6" style={{ color: GOLD }} />
          </div>
          <p className="text-white/60 text-[9.5px] mt-1.5">Spend, earn and redeem VinkPoints on every transaction.</p>
          <button className="mt-2.5 text-[10px] font-bold px-3 py-1.5 rounded-lg" style={{ background: GOLD, color: PURPLE }}>Learn More</button>
        </div>
        <div className="w-56 shrink-0 rounded-2xl p-3.5" style={{ background: "#FFF1E6" }}>
          <div className="flex items-start justify-between">
            <p className="text-[#7A3E00] text-[12.5px] font-bold leading-snug w-32">Pay taxi fares with one tap</p>
            <Smartphone className="w-6 h-6" style={{ color: "#FF7A1A" }} />
          </div>
          <p className="text-[#7A3E00]/70 text-[9.5px] mt-1.5">Fast. Secure. Convenient.</p>
          <button className="mt-2.5 text-[10px] font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: "#FF7A1A" }}>Learn More</button>
        </div>
      </div>

      {/* Anchor+ budget snapshot */}
      {unlockedFrom(2) && (
        <div className="px-3 pt-4">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">This Month's Budget</p>
          <div className="rounded-2xl bg-white shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-800 text-xs font-semibold">R2,340 of R4,000 spent</span>
              <span className="text-[10px] font-bold" style={{ color: PURPLE }}>58%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: "58%", background: PURPLE }} /></div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
              <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-[10px] text-gray-500">3 subscriptions detected: Netflix, Spotify, Amazon Prime — R458/mo</p>
            </div>
          </div>
        </div>
      )}

      {/* Momentum+ rewards & gamification */}
      {unlockedFrom(3) && (
        <div className="px-3 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Rewards</p>
            <button className="text-[10px] font-semibold" style={{ color: PURPLE }}>Points marketplace</button>
          </div>
          <div className="rounded-2xl p-3.5" style={{ background: `linear-gradient(135deg,${GOLD}22,${GOLD}0D)`, border: `1px solid ${GOLD}44` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5"><Award className="w-4 h-4" style={{ color: GOLD }} /><span className="text-xs font-bold text-gray-800">Gold Tier</span></div>
              <span className="text-[10px] text-gray-500">720 pts to Platinum</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[["🍕","Restaurant","10% off"],["⛽","Fuel","R0.50/L back"],["✈️","Travel","2× points"]].map(([e,l,v]) => (
                <div key={l} className="bg-white rounded-xl p-2 text-center">
                  <p className="text-base">{e}</p>
                  <p className="text-[9px] font-semibold text-gray-700 mt-0.5">{l}</p>
                  <p className="text-[8px] text-gray-400">{v}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2.5 text-[10px] text-gray-600"><Zap className="w-3 h-3" style={{ color: GOLD }} /> Weekly challenge: Save R100 more → +150 pts</div>
          </div>
        </div>
      )}

      {/* Horizon+ savings goals */}
      {unlockedFrom(4) && (
        <div className="px-3 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Savings Goals</p>
            <button className="text-[10px] font-semibold" style={{ color: PURPLE }}>+ New goal</button>
          </div>
          <div className="space-y-2">
            {[
              { emoji: "🏖️", name: "Cape Town Getaway", saved: 8400, target: 15000 },
              { emoji: "🚗", name: "New Car Deposit", saved: 32000, target: 60000 },
            ].map(g => (
              <div key={g.name} className="rounded-2xl bg-white shadow-sm p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{g.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">{g.name}</p>
                    <p className="text-[9px] text-gray-400">R{g.saved.toLocaleString()} of R{g.target.toLocaleString()}</p>
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: PURPLE }}>{Math.round(g.saved / g.target * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${g.saved / g.target * 100}%`, background: PURPLE }} /></div>
              </div>
            ))}
            <div className="rounded-2xl p-2.5 flex items-center gap-2" style={{ background: `${PURPLE}0D` }}>
              <Target className="w-3.5 h-3.5 shrink-0" style={{ color: PURPLE }} />
              <p className="text-[10px]" style={{ color: PURPLE }}>Save R25 more weekly to reach your getaway goal 8 months earlier.</p>
            </div>
          </div>
        </div>
      )}

      {/* Legacy investments */}
      {unlockedFrom(6) && (
        <div className="px-3 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Portfolio</p>
            <button className="text-[10px] font-semibold" style={{ color: PURPLE }}>Full report</button>
          </div>
          <div className="rounded-2xl bg-white shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-800">Portfolio performance</span>
              <span className="text-xs font-bold text-green-600">+8.4% YTD</span>
            </div>
            {[["Stocks & ETFs","45%","#0B5C2E"],["Bonds & Treasury","25%","#B45309"],["Property","19%","#FF9900"],["Private Equity","11%","#0369A1"]].map(([label,pct,color]) => (
              <div key={label} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <span className="w-16 text-[9px] text-gray-500 shrink-0">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct as string, background: color as string }} /></div>
                <span className="w-8 text-[9px] font-semibold text-gray-700 text-right">{pct}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className="px-3 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Recent</p>
          <button className="text-[10px] font-semibold" style={{ color: PURPLE }}>See all</button>
        </div>
        <div className="rounded-2xl overflow-hidden bg-white shadow-sm">
          {TRANSACTIONS.slice(0, 5).map((t, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                {t.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 text-xs font-medium truncate">{t.name}</p>
                <p className="text-gray-400 text-[10px]">{t.date}</p>
              </div>
              <span className={`text-xs font-bold flex-shrink-0 ${t.amount > 0 ? "text-green-600" : "text-gray-700"}`}>
                {t.amount > 0 ? "+" : ""}R{Math.abs(t.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Promo */}
      <div className="mx-3 mt-3 mb-4 rounded-2xl p-3 flex items-center gap-3" style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}55` }}>
        <span className="text-2xl">🎁</span>
        <div>
          <p className="text-xs font-bold" style={{ color: PURPLE }}>Free Wi-Fi on VINK taxis!</p>
          <p className="text-gray-500 text-[10px]">Earn 2× VinkPoints on taxi rides this week</p>
        </div>
      </div>
    </div>
  );
}

const RECENT_RECIPIENTS = [
  { initials: "SD", name: "Sipho D.",    ref: "VINK-GBL-2024-00002" },
  { initials: "LM", name: "Lindiwe M.", ref: "VINK-GBL-2024-00003" },
  { initials: "BZ", name: "Busisiwe Z.", ref: "VINK-GBL-2024-00004" },
];

function SendScreen() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [rail, setRail] = useState<"Instant"|"Standard"|"International">("Instant");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ ref: string; amount: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!recipient.trim() || !amount || Number(amount) <= 0) {
      setError("Please enter a recipient and amount."); return;
    }
    if (Number(amount) > 12847.50) {
      setError("Amount exceeds available balance of R12,847.50."); return;
    }
    setError(null); setLoading(true);
    const r = await globalBankingApi.p2pTransfer("acc-001", recipient.trim(), Number(amount), "ZAR", note || undefined);
    setLoading(false);
    if (r.success) {
      setSuccess({ ref: r.data?.id ?? "TXN-" + Date.now(), amount });
    } else {
      setError(r.error ?? "Transfer failed. Please try again.");
    }
  };

  if (success) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-5 px-6" style={{ background: "#F8F7FF" }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "#10B98122" }}>
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: PURPLE }}>R{Number(success.amount).toFixed(2)}</p>
          <p className="text-sm font-semibold text-gray-700 mt-1">Sent successfully!</p>
          <p className="text-xs text-gray-400 mt-1 font-mono">{success.ref}</p>
        </div>
        <button onClick={() => { setSuccess(null); setAmount(""); setRecipient(""); setNote(""); }}
          className="w-full max-w-xs py-3.5 rounded-2xl font-bold text-sm text-white"
          style={{ background: `linear-gradient(135deg,${PURPLE},#FF9900)` }}>
          Send Another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F7FF" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">Send Money</p>
        <p className="text-white/60 text-xs">Transfer to any Vink account</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Recipient */}
        <div>
          <label className="text-gray-500 text-xs font-semibold">To (Vink Reference or Phone)</label>
          <input type="text" value={recipient} onChange={e => setRecipient(e.target.value)}
            placeholder="VINK-GBL-2024-XXXXX or 082 555 1234"
            className="w-full mt-1.5 px-3 py-2.5 rounded-xl text-sm bg-white border text-gray-800 outline-none"
            style={{ borderColor: `${PURPLE}33` }} />
        </div>
        {/* Amount */}
        <div className="text-center py-4">
          <p className="text-gray-400 text-xs mb-1">Amount (ZAR)</p>
          <div className="flex items-center justify-center gap-1">
            <span className="text-2xl font-bold" style={{ color: PURPLE }}>R</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
              className="text-4xl font-bold text-center bg-transparent outline-none w-36" style={{ color: PURPLE }} />
          </div>
          <p className="text-gray-400 text-[10px] mt-1">Available: R12,847.50</p>
        </div>
        {/* Note */}
        <div>
          <label className="text-gray-500 text-xs font-semibold">Reference (optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Rent, Loan repayment"
            className="w-full mt-1.5 px-3 py-2.5 rounded-xl text-sm bg-white border text-gray-800 outline-none"
            style={{ borderColor: `${PURPLE}33` }} />
        </div>
        {/* Rail selector */}
        <div>
          <label className="text-gray-500 text-xs font-semibold">Transfer Type</label>
          <div className="flex gap-1 mt-1.5 p-1 rounded-xl bg-white border" style={{ borderColor: `${PURPLE}22` }}>
            {(["Instant","Standard","International"] as const).map(r => (
              <button key={r} onClick={() => setRail(r)}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
                style={{ background: rail === r ? PURPLE : "transparent", color: rail === r ? "#fff" : PURPLE }}>
                {r}
              </button>
            ))}
          </div>
          <p className="text-gray-400 text-[10px] mt-1 text-center">
            {rail === "Instant" ? "Arrives within seconds · Fee: R2.50" : rail === "Standard" ? "Arrives same day · Free" : "3–5 business days · Fee: R45"}
          </p>
        </div>
        {/* Quick recipients */}
        <div>
          <p className="text-gray-500 text-xs font-semibold mb-2">Recent Recipients</p>
          <div className="flex gap-4">
            {RECENT_RECIPIENTS.map(({ initials, name, ref }) => (
              <button key={initials} onClick={() => setRecipient(ref)} className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ background: `linear-gradient(135deg,${PURPLE},${GOLD})` }}>{initials}</div>
                <span className="text-gray-500 text-[10px]">{name}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700 font-medium">{error}</p>
          </div>
        )}
        {/* Send button */}
        <button onClick={handleSend} disabled={loading}
          className="w-full py-3.5 rounded-2xl font-bold text-sm text-white mt-2 shadow-lg transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg,${PURPLE},#FF9900)` }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? "Sending…" : "Send Now →"}
        </button>
      </div>
    </div>
  );
}

function CardsScreen() {
  const [frozen, setFrozen] = useState(false);
  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F7FF" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">My Cards</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {/* Physical card */}
        <div className="rounded-2xl p-5 shadow-xl" style={{ background: `linear-gradient(135deg, ${PURPLE}, #1E0A3C)` }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold tracking-widest" style={{ color: GOLD }}>VINK</p>
              <p className="text-white/60 text-[9px] mt-0.5">Summit Account</p>
            </div>
            <div className="text-right">
              <p className="text-white/40 text-[9px]">VISA</p>
              <div className="flex gap-0.5 mt-0.5">
                <div className="w-4 h-4 rounded-full bg-red-400 opacity-80" />
                <div className="w-4 h-4 rounded-full bg-amber-400 opacity-80 -ml-1.5" />
              </div>
            </div>
          </div>
          <p className="text-white text-sm font-mono tracking-widest mt-4">4520  ****  ****  3421</p>
          <div className="flex gap-6 mt-2">
            <div>
              <p className="text-white/40 text-[9px]">EXPIRES</p>
              <p className="text-white text-xs">08/28</p>
            </div>
            <div>
              <p className="text-white/40 text-[9px]">CARDHOLDER</p>
              <p className="text-white text-xs">THABO NKOSI</p>
            </div>
          </div>
          {frozen && (
            <div className="absolute inset-0 rounded-2xl flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
              <div className="text-center">
                <span className="text-3xl">🔒</span>
                <p className="text-white font-bold text-sm mt-1">Card Frozen</p>
              </div>
            </div>
          )}
        </div>

        {/* Virtual card */}
        <div className="rounded-2xl p-5 shadow-lg" style={{ background: `linear-gradient(135deg, #F5A623, #E8830A)` }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-white/80">VINK VIRTUAL</p>
              <p className="text-white/60 text-[9px] mt-0.5">Online Purchases</p>
            </div>
            <span className="text-white text-[10px] font-bold border border-white/40 px-1.5 py-0.5 rounded-full">VIRTUAL</span>
          </div>
          <p className="text-white text-sm font-mono tracking-widest mt-4">8834  ****  ****  9012</p>
          <div className="flex gap-6 mt-2">
            <div>
              <p className="text-white/60 text-[9px]">EXPIRES</p>
              <p className="text-white text-xs">12/26</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-4 gap-2">
          {[
            ["🔒", frozen ? "Unfreeze" : "Freeze", () => setFrozen(!frozen)],
            ["📊", "Limits",   () => {}],
            ["🚫", "Report",   () => {}],
            ["💳", "New Virtual",() => {}],
          ].map(([icon, label, fn]) => (
            <button
              key={label as string}
              onClick={fn as () => void}
              className="flex flex-col items-center gap-1 py-3 rounded-xl bg-white shadow-sm active:scale-95 transition-transform"
            >
              <span className="text-base">{icon as string}</span>
              <span className="text-[9px] text-gray-500 font-medium text-center leading-tight">{label as string}</span>
            </button>
          ))}
        </div>

        {/* Spend bar */}
        <div className="rounded-2xl p-4 bg-white shadow-sm">
          <div className="flex justify-between mb-1">
            <p className="text-gray-700 text-xs font-semibold">Monthly Spend</p>
            <p className="text-xs font-bold" style={{ color: PURPLE }}>R3,847 / R15,000</p>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: "25.6%", background: `linear-gradient(90deg, ${PURPLE}, ${GOLD})` }} />
          </div>
          <p className="text-gray-400 text-[10px] mt-1">R11,153 remaining this month</p>
        </div>
      </div>
    </div>
  );
}

function HistoryScreen() {
  const [filter, setFilter] = useState<"All"|"Debits"|"Credits"|"Pending">("All");
  const filtered = filter === "All" ? TRANSACTIONS
    : filter === "Credits" ? TRANSACTIONS.filter(t => t.amount > 0)
    : filter === "Debits" ? TRANSACTIONS.filter(t => t.amount < 0)
    : [];

  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F7FF" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">Transaction History</p>
      </div>
      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-2 flex-shrink-0 bg-white shadow-sm">
        {(["All","Debits","Credits","Pending"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
            style={{ background: filter === f ? PURPLE : `${PURPLE}11`, color: filter === f ? "#fff" : PURPLE }}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="rounded-2xl overflow-hidden bg-white shadow-sm">
          {(filtered.length === 0 ? [{ emoji: "⏳", name: "No pending transactions", amount: 0, date: "—", cat: "—" }] : filtered).map((t, i) => (
            <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                {t.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 text-xs font-medium truncate">{t.name}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-gray-400 text-[10px]">{t.date}</p>
                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: `${PURPLE}11`, color: PURPLE }}>
                    {t.cat}
                  </span>
                </div>
              </div>
              {t.amount !== 0 && (
                <span className={`text-xs font-bold flex-shrink-0 ${t.amount > 0 ? "text-green-600" : "text-gray-700"}`}>
                  {t.amount > 0 ? "+" : ""}R{Math.abs(t.amount).toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RewardsScreen() {
  const REDEEM = [
    ["🚕", "Taxi Fare",  "500 pts"],
    ["📱", "Airtime",    "100 pts"],
    ["🛒", "Grocery",   "300 pts"],
    ["💵", "Cash",      "1000 pts"],
    ["⛽", "Fuel",      "400 pts"],
  ];
  const progress = (4230 / 7500) * 100;

  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F7FF" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">VinkPoints</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {/* Balance */}
        <div
          className="rounded-2xl p-5 text-center shadow-xl"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, #0F3D24)` }}
        >
          <p className="text-white/60 text-xs">Your Balance</p>
          <p className="text-5xl font-bold mt-1" style={{ color: GOLD }}>4,230</p>
          <p className="text-white/60 text-xs">pts = R42.30 value</p>

          <div className="mt-4">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-white/60">Gold Member</span>
              <span style={{ color: GOLD }}>4,230 / 7,500 → Platinum</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/20">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${GOLD}, #FFD700)` }} />
            </div>
          </div>
        </div>

        {/* Redeem */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Redeem Points</p>
          <div className="grid grid-cols-3 gap-2">
            {REDEEM.map(([icon, label, pts]) => (
              <button
                key={label}
                className="flex flex-col items-center gap-1 py-3 rounded-xl bg-white shadow-sm active:scale-95 transition-transform"
              >
                <span className="text-xl">{icon}</span>
                <span className="text-gray-700 text-[10px] font-semibold">{label}</span>
                <span className="text-[9px] font-bold" style={{ color: GOLD }}>{pts}</span>
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Points Earned</p>
          <div className="rounded-2xl overflow-hidden bg-white shadow-sm">
            {REWARDS_HISTORY.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}22` }}>
                  <Star className="w-3.5 h-3.5" style={{ color: GOLD }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 text-xs font-medium truncate">{r.event}</p>
                  <p className="text-gray-400 text-[10px]">{r.date}</p>
                </div>
                <span className="text-xs font-bold text-green-600">{r.pts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VinkBankingApp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [tier, setTier] = useState<Tier>("Spark");
  const [verifying, setVerifying] = useState(false);
  const [pendingTier, setPendingTier] = useState<Tier>("Spark");
  const [authUser, setAuthUser] = useState<MktAuthUser | null>(null);
  const [checkedSession, setCheckedSession] = useState(false);

  useEffect(() => {
    const restored = mktAuth.restoreSession();
    if (restored) setAuthUser(restored.user);
    setCheckedSession(true);
  }, []);

  if (!isOpen) return null;

  const handleTierSelected = (t: Tier) => {
    setPendingTier(t);
    setVerifying(true);
  };
  const handleVerified = () => {
    setTier(pendingTier);
    setVerifying(false);
    setScreen("home");
  };
  const handleAuthenticated = (user: MktAuthUser) => {
    setAuthUser(user);
    setScreen("onboarding"); // straight into account-tier selection after login/register
  };

  const TABS: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "home",    label: "Home",    icon: <Home className="w-5 h-5" /> },
    { id: "send",    label: "Send",    icon: <Send className="w-5 h-5" /> },
    { id: "cards",   label: "Cards",   icon: <CreditCard className="w-5 h-5" /> },
    { id: "history", label: "History", icon: <Clock className="w-5 h-5" /> },
    { id: "rewards", label: "Rewards", icon: <Star className="w-5 h-5" /> },
  ];
  const showTabs = authUser !== null && screen !== "onboarding" && !verifying;

  return (
    <MobileAppOverlay onClose={onClose} appName="Vink Bank" bgColor="#F8F7FF">
      <PhoneFrame statusBarColor={PURPLE} statusBarTextLight>
        <div className="flex-1 overflow-hidden flex flex-col">
          {!checkedSession ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: PURPLE }} /></div>
          ) : !authUser ? (
            <LoginScreen onAuthenticated={handleAuthenticated} />
          ) : verifying ? (
            <VerifyingScreen tier={pendingTier} onDone={handleVerified} />
          ) : (
            <>
              {screen === "onboarding" && <OnboardingScreen onSelect={handleTierSelected} />}
              {screen === "home"    && <HomeScreen tier={tier} onSwitchTier={() => setScreen("onboarding")} user={authUser} />}
              {screen === "send"    && <SendScreen />}
              {screen === "cards"   && <CardsScreen />}
              {screen === "history" && <HistoryScreen />}
              {screen === "rewards" && <RewardsScreen />}
            </>
          )}
        </div>
        {/* Bottom tab bar */}
        {showTabs && (
          <div className="flex-shrink-0 flex items-center border-t bg-white" style={{ borderColor: `${PURPLE}22` }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setScreen(tab.id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 relative transition-colors"
                style={{ color: screen === tab.id ? PURPLE : "#9CA3AF" }}
              >
                {tab.icon}
                <span className="text-[9px] font-semibold">{tab.label}</span>
                {screen === tab.id && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ background: PURPLE }} />
                )}
              </button>
            ))}
          </div>
        )}
      </PhoneFrame>
    </MobileAppOverlay>
  );
}
