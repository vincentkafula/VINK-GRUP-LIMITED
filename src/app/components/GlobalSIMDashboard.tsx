/**
 * Vink Global SIM Card System
 *
 * Architecture mirrors the Global Banking Card System:
 * One Vink SIM number → 5-country MVNO partner network → local call routing everywhere
 *
 * When a Vink SIM user calls any number in the world, the call is routed through
 * VMS's local MVNO partner in the destination country — billed as a LOCAL call.
 * Zero international tariffs. Same principle as the nostro banking accounts.
 */
import { useState, useEffect } from "react";
import {
  X, Wifi, Phone, MessageSquare, Globe, Signal, Zap,
  CheckCircle, RefreshCw, TrendingUp, AlertTriangle,
  Settings, BarChart3, Users, Activity, ChevronRight,
  Download, Upload, Star,
} from "lucide-react";

interface Props { isOpen: boolean; onClose: () => void; }

// ─── MVNO Partner Networks (mirrors nostro accounts) ──────────────────────────

const MVNO_PARTNERS = [
  {
    id: "za", country: "South Africa", flag: "🇿🇦", currency: "ZAR",
    partner: "Cell C (MVNO Host)", license: "ICASA Licensed",
    network: "Cell C 4G/LTE", technology: ["2G","3G","4G","VoLTE"],
    coverage: "98% population coverage",
    localCallRate: "R0.15/min", localDataRate: "R0.10/MB", localSMSRate: "R0.10",
    internationalTermination: "Local termination — no IDD fee",
    roamingRevenue: "R2.4M/month", activeSubscribers: 124_840,
    status: "active", color: "#C8102E",
    feature: "VMS AFC payment integration on all SA networks",
  },
  {
    id: "zm", country: "Zambia", flag: "🇿🇲", currency: "ZMW",
    partner: "Airtel Zambia (MVNO)", license: "ZICTA Licensed",
    network: "Airtel 4G", technology: ["2G","3G","4G"],
    coverage: "82% population coverage",
    localCallRate: "K0.45/min", localDataRate: "K0.20/MB", localSMSRate: "K0.15",
    internationalTermination: "Local termination via Airtel backbone",
    roamingRevenue: "ZMW 840K/month", activeSubscribers: 38_240,
    status: "active", color: "#FF0000",
    feature: "Mobile money integration: MTN & Airtel Money",
  },
  {
    id: "eu", country: "Europe (EU)", flag: "🇪🇺", currency: "EUR",
    partner: "Teliqo BV (Netherlands)", license: "OPTA / ACM Licensed",
    network: "Multi-operator EU MVNE", technology: ["3G","4G","5G","VoLTE","VoWiFi"],
    coverage: "EU-wide — 27 member states",
    localCallRate: "€0.02/min", localDataRate: "€0.005/MB", localSMSRate: "€0.04",
    internationalTermination: "EU domestic routing — SEPA billing",
    roamingRevenue: "€380K/month", activeSubscribers: 18_920,
    status: "active", color: "#003EA3",
    feature: "EU roaming regulation compliant — no surcharges within EU",
  },
  {
    id: "us", country: "USA", flag: "🇺🇸", currency: "USD",
    partner: "MVNE via T-Mobile USA", license: "FCC Licensed",
    network: "T-Mobile 5G/LTE", technology: ["4G","5G","VoLTE","VoWiFi"],
    coverage: "99% LTE coverage across 50 states",
    localCallRate: "$0.01/min", localDataRate: "$0.003/MB", localSMSRate: "$0.01",
    internationalTermination: "US domestic routing — ACH billing to VMS",
    roamingRevenue: "$220K/month", activeSubscribers: 12_480,
    status: "active", color: "#1B4F72",
    feature: "eSIM provisioning available — instant activation",
  },
  {
    id: "cn", country: "China", flag: "🇨🇳", currency: "CNY",
    partner: "China Unicom International", license: "MIIT Licensed",
    network: "China Unicom 4G/5G", technology: ["4G","5G","VoLTE"],
    coverage: "Major cities + 95% of urban population",
    localCallRate: "¥0.08/min", localDataRate: "¥0.05/MB", localSMSRate: "¥0.10",
    internationalTermination: "Local CU routing — UnionPay billing integration",
    roamingRevenue: "¥1.8M/month", activeSubscribers: 8_340,
    status: "active", color: "#C0392B",
    feature: "WeChat + Alipay billing integration for top-ups",
  },
];

// ─── SIM Plans ────────────────────────────────────────────────────────────────

const SIM_PLANS = [
  {
    id: "payg", name: "Pay-As-You-Go", price: "R0", priceLabel: "/month",
    data: "No bundle", calls: "R0.15/min SA", sms: "R0.10/SMS",
    globalCalls: "Local rates everywhere", badge: "No Contract",
    badgeColor: "#10B981", color: "linear-gradient(135deg,#374151,#6B7280)",
    features: ["Zero monthly fee", "Top up as needed", "Calls to 5 countries at local rates", "VMS app data free"],
  },
  {
    id: "starter", name: "Starter 1GB", price: "R49", priceLabel: "/month",
    data: "1GB data", calls: "50 free mins SA", sms: "50 free SMS",
    globalCalls: "20 free mins to any of 5 countries", badge: "Entry Level",
    badgeColor: "#3B82F6", color: "linear-gradient(135deg,#1565C0,#42A5F5)",
    features: ["1GB data", "50 mins SA calls", "50 SMS", "20 mins international (local rates)", "VMS app data free", "30-day data rollover"],
  },
  {
    id: "essential", name: "Essential 3GB", price: "R99", priceLabel: "/month",
    data: "3GB data", calls: "100 free mins", sms: "100 free SMS",
    globalCalls: "60 free mins to any of 5 countries", badge: "Popular",
    badgeColor: "#8B5CF6", color: "linear-gradient(135deg,#5B2D8E,#9585EA)",
    features: ["3GB data", "100 mins SA calls", "100 SMS", "60 mins international (local rates)", "VMS app + banking data free", "Wi-Fi calling (VoWiFi)"],
    featured: true,
  },
  {
    id: "plus", name: "Plus 10GB", price: "R199", priceLabel: "/month",
    data: "10GB data", calls: "200 free mins", sms: "200 free SMS",
    globalCalls: "120 free mins to any of 5 countries", badge: "Best Value",
    badgeColor: "#F5A623", color: "linear-gradient(135deg,#E65100,#F57C00)",
    features: ["10GB data", "200 mins SA calls", "200 SMS", "120 mins international (local rates)", "All VMS app data free", "Wi-Fi calling", "eSIM included"],
  },
  {
    id: "unlimited", name: "Unlimited Talk", price: "R299", priceLabel: "/month",
    data: "5GB data", calls: "Unlimited SA", sms: "300 free SMS",
    globalCalls: "300 free mins to any of 5 countries", badge: "Top Tier",
    badgeColor: "#EF4444", color: "linear-gradient(135deg,#1A237E,#3949AB)",
    features: ["5GB data", "UNLIMITED SA calls", "300 SMS", "300 mins international (local rates)", "All VMS app data free", "HD voice (VoLTE)", "eSIM + physical SIM"],
  },
];

// ─── Live SIM data ────────────────────────────────────────────────────────────

const MY_SIM = {
  msisdn: "+27 82 007 1234",
  iccid: "8927100012345678901",
  imsi: "65501000012345",
  plan: "Essential 3GB",
  status: "active",
  balance: 142.50,
  dataUsed: 1.24,
  dataTotal: 3,
  callsUsed: 42,
  callsTotal: 100,
  smsUsed: 18,
  smsTotal: 100,
  intlMinsUsed: 22,
  intlMinsTotal: 60,
  renewsOn: "2025-07-21",
  homeNetwork: "Cell C 4G",
  currentCountry: "ZA",
  roaming: false,
  esimEnabled: true,
  wifiCallingEnabled: true,
  vmsDataFree: true,
};

// ─── Call routing flow ────────────────────────────────────────────────────────

const CALL_SCENARIOS = [
  {
    from: "🇿🇦 Cape Town, SA",
    to: "🇬🇧 London, UK",
    traditional: "International IDD via SA carrier → UK termination\nCost: R8–12/min",
    vink: "SA Cell C → VMS EU routing → Teliqo UK local termination\nCost: R0.80/min (local EU rate)",
    saving: "90% cheaper",
    color: "#10B981",
  },
  {
    from: "🇿🇲 Lusaka, ZM",
    to: "🇺🇸 New York, USA",
    traditional: "International via Airtel ZM → USA termination\nCost: K8/min",
    vink: "Airtel ZM → VMS US routing → T-Mobile local termination\nCost: K0.60/min (local US rate)",
    saving: "92% cheaper",
    color: "#3B82F6",
  },
  {
    from: "🇪🇺 Amsterdam, EU",
    to: "🇨🇳 Shanghai, CN",
    traditional: "International IDD via EU carrier → CN termination\nCost: €0.35/min",
    vink: "Teliqo EU → VMS CN routing → China Unicom local termination\nCost: €0.03/min (local CN rate)",
    saving: "91% cheaper",
    color: "#F5A623",
  },
];

type Screen = "overview" | "partners" | "plans" | "mysim" | "routing" | "analytics";

const NAV = [
  { id: "overview",  label: "Overview",       icon: <Activity className="w-4 h-4" /> },
  { id: "partners",  label: "MVNO Partners",  icon: <Globe className="w-4 h-4" /> },
  { id: "plans",     label: "SIM Plans",      icon: <Zap className="w-4 h-4" /> },
  { id: "mysim",     label: "My SIM",         icon: <Signal className="w-4 h-4" /> },
  { id: "routing",   label: "Call Routing",   icon: <Phone className="w-4 h-4" /> },
  { id: "analytics", label: "Analytics",      icon: <BarChart3 className="w-4 h-4" /> },
];

const P = "#5B2D8E";
const GOLD = "#F5A623";

// ─── Usage ring ───────────────────────────────────────────────────────────────
function UsageRing({ used, total, label, color }: { used: number; total: number; label: string; color: string }) {
  const pct = Math.min(100, (used / total) * 100);
  const r = 28, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#F3F4F6" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-black text-gray-800">{used}</span>
          <span className="text-[8px] text-gray-400">/{total}</span>
        </div>
      </div>
      <p className="text-[10px] font-semibold text-gray-600">{label}</p>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function GlobalSIMDashboard({ isOpen, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>("overview");
  const [selectedPlan, setSelectedPlan] = useState("essential");
  const [callFrom, setCallFrom] = useState("za");
  const [callTo, setCallTo] = useState("eu");
  const [callDuration, setCallDuration] = useState(10);
  const [time, setTime] = useState(new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }));

  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setTime(new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })), 10000);
    return () => clearInterval(t);
  }, [isOpen]);

  if (!isOpen) return null;

  // Cost calculator
  const fromPartner = MVNO_PARTNERS.find(p => p.id === callFrom);
  const toPartner   = MVNO_PARTNERS.find(p => p.id === callTo);
  const vinkRatePerMin = 0.80; // internal routing rate (simplified)
  const tradRatePerMin = 8.50; // typical international IDD
  const vinkCost = (callDuration * vinkRatePerMin).toFixed(2);
  const tradCost = (callDuration * tradRatePerMin).toFixed(2);
  const saving = (((tradRatePerMin - vinkRatePerMin) / tradRatePerMin) * 100).toFixed(0);

  const totalSubscribers = MVNO_PARTNERS.reduce((s, p) => s + p.activeSubscribers, 0);
  const totalRevenue = ["R2.4M", "ZMW840K", "€380K", "$220K", "¥1.8M"];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm" style={{ background: P }}>
            📶
          </div>
          <div>
            <p className="text-sm font-black text-gray-900 leading-none">Vink Global SIM · MVNO System</p>
            <p className="text-[10px] text-gray-400 mt-0.5">One SIM · Local rates in 5 countries · {totalSubscribers.toLocaleString()} subscribers</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            All 5 networks active
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-52 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col py-4 px-2 overflow-y-auto">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setScreen(item.id as Screen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left text-sm font-medium mb-0.5"
              style={{ background: screen === item.id ? P + "15" : "transparent", color: screen === item.id ? P : "#6B7280", fontWeight: screen === item.id ? 700 : 400 }}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
          <div className="mt-auto px-2 py-3 rounded-xl bg-gray-50 border border-gray-100 mx-1 mb-1 space-y-1.5">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">My SIM Status</p>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[11px] text-gray-700 font-semibold">Active · Home SA</span>
            </div>
            <p className="text-[10px] text-gray-500">{MY_SIM.msisdn}</p>
            <p className="text-[10px] text-gray-500">{MY_SIM.plan}</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-5 py-5">

          {/* ══ OVERVIEW ══ */}
          {screen === "overview" && (
            <div className="space-y-6 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">Global SIM System Overview</h1>

              {/* Key concept */}
              <div className="rounded-2xl overflow-hidden shadow-lg"
                style={{ background: `linear-gradient(135deg,${P} 0%,#3d1d63 40%,#7B4DB5 80%,#9585EA 100%)` }}>
                <div className="p-6 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
                  <div className="relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-4 inline-block" style={{ background: "rgba(255,255,255,.15)" }}>
                      The Innovation
                    </span>
                    <h2 className="text-2xl font-black text-white mb-3 leading-tight">
                      One SIM. Local Call Rates.<br />Everywhere in the World.
                    </h2>
                    <p className="text-white/75 text-sm leading-relaxed max-w-2xl">
                      The Vink Global SIM uses the same architecture as our card system. Just as VMS holds a local bank account in each country so card transactions are routed domestically, we hold an MVNO agreement with a local network operator in each country — so every call you make is terminated locally. No international tariffs. Ever.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                      {[
                        { v: "5",               l: "Countries" },
                        { v: totalSubscribers.toLocaleString(), l: "Subscribers" },
                        { v: "90%+",            l: "Cost saving vs IDD" },
                        { v: "1 SIM",           l: "Physical or eSIM" },
                      ].map((s, i) => (
                        <div key={i} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,.12)" }}>
                          <p className="text-xl font-black text-white">{s.v}</p>
                          <p className="text-white/60 text-[10px] mt-0.5">{s.l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Architecture diagram */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-black text-gray-800 mb-5">System Architecture — Local Routing Model</h3>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-full rounded-xl p-3 text-center text-white text-sm font-bold" style={{ background: P }}>
                    Vink SIM (Single MSISDN · One account · All countries)
                  </div>
                  <div className="w-px h-4 bg-gray-300" />
                  <div className="grid grid-cols-5 gap-2 w-full">
                    {MVNO_PARTNERS.map(p => (
                      <div key={p.id} className="rounded-xl p-2.5 text-center text-white text-xs font-semibold" style={{ background: p.color }}>
                        {p.flag} {p.id.toUpperCase()}<br />{p.partner.split(" ")[0]}
                      </div>
                    ))}
                  </div>
                  <div className="w-px h-4 bg-gray-300" />
                  <div className="grid grid-cols-3 gap-2 w-full">
                    {[
                      { label: "Voice Routing", sub: "Local termination in destination country", color: "#3B82F6" },
                      { label: "Data Roaming", sub: "Local APN — no roaming surcharge", color: "#10B981" },
                      { label: "SMS Gateway", sub: "Local SMSC in each country", color: "#F5A623" },
                    ].map((e, i) => (
                      <div key={i} className="rounded-xl p-3 text-center" style={{ background: e.color + "15", border: `1px solid ${e.color}30` }}>
                        <p className="text-xs font-bold" style={{ color: e.color }}>{e.label}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{e.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="w-px h-4 bg-gray-300" />
                  <div className="grid grid-cols-4 gap-2 w-full">
                    {["📱 Voice Call", "📶 Mobile Data", "💬 SMS", "📳 eSIM OTA"].map((t, i) => (
                      <div key={i} className="rounded-xl p-2.5 text-center text-xs font-semibold text-gray-700 bg-purple-50 border border-purple-100">{t}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Partner summary */}
              <div className="grid sm:grid-cols-5 gap-3">
                {MVNO_PARTNERS.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setScreen("partners")}>
                    <div className="text-2xl mb-2">{p.flag}</div>
                    <p className="text-xs font-black text-gray-800">{p.country}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{p.partner.split(" ")[0]}</p>
                    <p className="text-lg font-black mt-2" style={{ color: p.color }}>{p.activeSubscribers.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">subscribers</p>
                    <div className="mt-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className="text-[10px] text-green-600 font-semibold">Active</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* How it compares */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-black text-gray-800 mb-4">Local Routing vs Traditional IDD — Example Calls</h3>
                <div className="space-y-4">
                  {CALL_SCENARIOS.map((s, i) => (
                    <div key={i} className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                        <span className="text-sm font-bold text-gray-800">{s.from} → {s.to}</span>
                        <span className="text-xs font-black px-3 py-1 rounded-full text-white" style={{ background: s.color }}>
                          {s.saving} cheaper with Vink
                        </span>
                      </div>
                      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                        <div className="px-4 py-3">
                          <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-1">❌ Traditional IDD</p>
                          <p className="text-xs text-gray-600 whitespace-pre-line">{s.traditional}</p>
                        </div>
                        <div className="px-4 py-3" style={{ background: s.color + "06" }}>
                          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: s.color }}>✓ Vink Local Routing</p>
                          <p className="text-xs text-gray-600 whitespace-pre-line">{s.vink}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ MVNO PARTNERS ══ */}
          {screen === "partners" && (
            <div className="space-y-5 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">MVNO Partner Networks</h1>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
                <strong>How it works:</strong> VMS holds an MVNO (Mobile Virtual Network Operator) agreement with a licensed host network in each country. When a Vink SIM user is in — or calls to — that country, their traffic is routed through the local operator's infrastructure. The call is billed at domestic rates. VMS pays the local partner a wholesale interconnect fee and charges the customer a transparent margin. No international fees pass through.
              </div>
              <div className="space-y-4">
                {MVNO_PARTNERS.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-5">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl flex-shrink-0 bg-gray-50">
                        {p.flag}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="font-black text-gray-900 text-base">{p.country}</p>
                            <p className="text-sm text-gray-600 mt-0.5">{p.partner}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{p.license}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black" style={{ color: p.color }}>{p.activeSubscribers.toLocaleString()}</p>
                            <p className="text-[10px] text-gray-400">active subscribers</p>
                            <p className="text-xs font-bold mt-1" style={{ color: p.color }}>{p.roamingRevenue}</p>
                            <p className="text-[10px] text-gray-400">monthly revenue</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                          {[
                            { label: "Network", value: p.network },
                            { label: "Coverage", value: p.coverage },
                            { label: "Local Call", value: p.localCallRate },
                            { label: "Local Data", value: p.localDataRate },
                          ].map((item, i) => (
                            <div key={i} className="rounded-xl p-3 bg-gray-50">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{item.label}</p>
                              <p className="text-xs font-bold text-gray-800 mt-0.5">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                          {p.technology.map(t => (
                            <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: p.color + "15", color: p.color }}>{t}</span>
                          ))}
                        </div>

                        <div className="mt-3 rounded-xl p-3 border-l-4" style={{ borderColor: p.color, background: p.color + "08" }}>
                          <p className="text-xs font-semibold text-gray-700">📡 {p.internationalTermination}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">⭐ {p.feature}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ PLANS ══ */}
          {screen === "plans" && (
            <div className="space-y-5 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">Global SIM Plans</h1>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {SIM_PLANS.map(plan => (
                  <div key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className="rounded-2xl overflow-hidden border-2 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl"
                    style={{ borderColor: selectedPlan === plan.id ? P : "transparent" }}>
                    <div className="relative h-24 flex items-center justify-center" style={{ background: plan.color }}>
                      {plan.featured && (
                        <div className="absolute top-2 right-2 text-[10px] font-black px-2 py-0.5 rounded-full text-white"
                          style={{ background: plan.badgeColor }}>
                          {plan.badge}
                        </div>
                      )}
                      {!plan.featured && (
                        <span className="absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">{plan.badge}</span>
                      )}
                      <div className="text-center">
                        <p className="text-3xl font-black text-white">{plan.price}</p>
                        <p className="text-white/70 text-xs">{plan.priceLabel}</p>
                      </div>
                    </div>
                    <div className="bg-white p-4">
                      <p className="font-black text-gray-900 mb-1">{plan.name}</p>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                          { icon: "📶", v: plan.data },
                          { icon: "📞", v: plan.calls },
                          { icon: "💬", v: plan.sms },
                        ].map((item, i) => (
                          <div key={i} className="text-center p-1.5 rounded-lg bg-gray-50">
                            <p className="text-base">{item.icon}</p>
                            <p className="text-[9px] font-semibold text-gray-700 mt-0.5 leading-tight">{item.v}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl p-2.5 mb-3" style={{ background: P + "10", border: `1px solid ${P}20` }}>
                        <p className="text-[10px] font-bold" style={{ color: P }}>🌍 {plan.globalCalls}</p>
                      </div>
                      <ul className="space-y-1.5">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                            <span className="text-green-500 flex-shrink-0">✓</span>{f}
                          </li>
                        ))}
                      </ul>
                      <button className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                        style={{ background: selectedPlan === plan.id ? `linear-gradient(135deg,${P},#9585EA)` : "#E5E7EB", color: selectedPlan === plan.id ? "#fff" : "#6B7280" }}>
                        {selectedPlan === plan.id ? "✓ Selected" : "Select Plan"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ MY SIM ══ */}
          {screen === "mysim" && (
            <div className="space-y-5 max-w-3xl">
              <h1 className="text-xl font-black text-gray-900">My Vink SIM</h1>

              {/* SIM card visual */}
              <div className="rounded-2xl overflow-hidden shadow-xl text-white relative"
                style={{ background: `linear-gradient(135deg,${P} 0%,#3d1d63 50%,#7B4DB5 100%)`, minHeight: 180 }}>
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />
                <div className="p-6 relative z-10">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] opacity-60 uppercase tracking-widest">VINK GLOBAL SIM</p>
                      <p className="text-2xl font-black mt-1 tracking-wider">{MY_SIM.msisdn}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {["4G Active", "eSIM", "VoLTE", "WiFi Call"].map(t => (
                          <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/15">{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] opacity-60">Current plan</p>
                      <p className="font-bold text-sm mt-0.5">{MY_SIM.plan}</p>
                      <p className="text-[10px] opacity-60 mt-1">Renews {MY_SIM.renewsOn}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/15 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] opacity-60">ICCID</p>
                      <p className="text-xs font-mono opacity-80">{MY_SIM.iccid}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] opacity-60">Balance</p>
                      <p className="text-xl font-black" style={{ color: GOLD }}>R{MY_SIM.balance.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Usage */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-5">This Month&apos;s Usage</p>
                <div className="flex justify-around">
                  <UsageRing used={MY_SIM.dataUsed} total={MY_SIM.dataTotal} label="Data (GB)" color="#3B82F6" />
                  <UsageRing used={MY_SIM.callsUsed} total={MY_SIM.callsTotal} label="SA Calls (min)" color={P} />
                  <UsageRing used={MY_SIM.smsUsed} total={MY_SIM.smsTotal} label="SMS" color="#10B981" />
                  <UsageRing used={MY_SIM.intlMinsUsed} total={MY_SIM.intlMinsTotal} label="Intl Calls (min)" color={GOLD} />
                </div>
              </div>

              {/* Settings */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
                <p className="text-sm font-black text-gray-800">SIM Settings</p>
                {[
                  { label: "International roaming",   enabled: true,  sub: "Currently active in SA — R0.80/min to any partner country" },
                  { label: "Wi-Fi Calling (VoWiFi)", enabled: MY_SIM.wifiCallingEnabled, sub: "Calls routed via Wi-Fi when available — no cellular needed" },
                  { label: "eSIM active",              enabled: MY_SIM.esimEnabled, sub: "Download to any eSIM-compatible device" },
                  { label: "VMS app data free",        enabled: MY_SIM.vmsDataFree, sub: "Banking, payments, tracking — zero data cost" },
                  { label: "Data roaming",             enabled: true,  sub: "Local APN in partner countries — no surcharge" },
                ].map((setting, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{setting.label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{setting.sub}</p>
                    </div>
                    <div className={`flex-shrink-0 w-10 h-6 rounded-full transition-all cursor-pointer flex items-center ${setting.enabled ? "bg-green-500" : "bg-gray-200"}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-all mx-0.5 ${setting.enabled ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ CALL ROUTING ══ */}
          {screen === "routing" && (
            <div className="space-y-5 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">Local Call Routing — How It Works</h1>

              {/* Interactive calculator */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                <p className="text-sm font-black text-gray-800">Call Cost Calculator</p>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Calling from</label>
                    <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-400"
                      value={callFrom} onChange={e => setCallFrom(e.target.value)}>
                      {MVNO_PARTNERS.map(p => <option key={p.id} value={p.id}>{p.flag} {p.country}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Calling to</label>
                    <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-400"
                      value={callTo} onChange={e => setCallTo(e.target.value)}>
                      {MVNO_PARTNERS.filter(p => p.id !== callFrom).map(p => <option key={p.id} value={p.id}>{p.flag} {p.country}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Duration (minutes)</label>
                    <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-400" min={1} max={120}
                      value={callDuration} onChange={e => setCallDuration(+e.target.value)} />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl p-5 border-2 border-red-200 bg-red-50">
                    <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2">❌ Traditional IDD Call</p>
                    <p className="text-3xl font-black text-red-700">R{tradCost}</p>
                    <p className="text-xs text-red-500 mt-1">At R{tradRatePerMin}/min international rate</p>
                    <p className="text-[10px] text-red-400 mt-2">International routing · cross-border fees · termination charges</p>
                  </div>
                  <div className="rounded-2xl p-5 border-2 border-green-200 bg-green-50">
                    <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2">✓ Vink Local Routing</p>
                    <p className="text-3xl font-black text-green-700">R{vinkCost}</p>
                    <p className="text-xs text-green-600 mt-1">At R{vinkRatePerMin}/min (local {toPartner?.country} rate)</p>
                    <p className="text-[10px] text-green-500 mt-2">Routed via VMS {toPartner?.partner} — local termination, no IDD fees</p>
                  </div>
                </div>

                <div className="rounded-xl p-4 text-center" style={{ background: P + "10", border: `1px solid ${P}20` }}>
                  <p className="text-2xl font-black" style={{ color: P }}>You save {saving}%</p>
                  <p className="text-sm text-gray-600 mt-1">R{(+tradCost - +vinkCost).toFixed(2)} saved on this {callDuration}-minute call</p>
                </div>
              </div>

              {/* Step-by-step routing explanation */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-5">How the Call Routes — Step by Step</p>
                <div className="relative pl-6 border-l-2" style={{ borderColor: P }}>
                  {[
                    { step: "1", title: "Call initiated", desc: `You dial a ${toPartner?.country} number from your Vink SIM in ${fromPartner?.country}.`, icon: "📱" },
                    { step: "2", title: "Authentication", desc: "Vink network validates your MSISDN and checks available balance/plan minutes.", icon: "🔐" },
                    { step: "3", title: "Routing decision", desc: `VMS routing engine identifies the destination country (${toPartner?.country}) and selects the local MVNO partner: ${toPartner?.partner}.`, icon: "🔀" },
                    { step: "4", title: "Local handoff", desc: `The call is handed to ${toPartner?.partner}'s local network in ${toPartner?.country}. From the terminating network's perspective, this is a domestic call.`, icon: "📡" },
                    { step: "5", title: "Local termination", desc: `Call terminates at the destination number as a local ${toPartner?.country} call. The recipient sees a local or recognised number.`, icon: "✅" },
                    { step: "6", title: "Billing", desc: `Your Vink balance is debited at the local ${toPartner?.country} rate (${toPartner?.localCallRate}). VMS pays the partner wholesale interconnect fee. No international tariff applied.`, icon: "💳" },
                  ].map((s, i) => (
                    <div key={i} className="mb-5 relative">
                      <div className="absolute -left-[34px] top-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black border-2 border-white"
                        style={{ background: P }}>{s.step}</div>
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">{s.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-gray-800">{s.title}</p>
                          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{s.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ ANALYTICS ══ */}
          {screen === "analytics" && (
            <div className="space-y-5 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">Network Analytics</h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Subscribers", value: totalSubscribers.toLocaleString(), color: P, icon: <Users className="w-5 h-5" /> },
                  { label: "Active Networks", value: "5",                    color: "#10B981", icon: <Globe className="w-5 h-5" /> },
                  { label: "Avg Call Saving", value: "91%",                  color: GOLD,      icon: <TrendingUp className="w-5 h-5" /> },
                  { label: "Monthly Revenue", value: "R4.2M+ equiv.",        color: "#3B82F6", icon: <BarChart3 className="w-5 h-5" /> },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3" style={{ background: kpi.color }}>{kpi.icon}</div>
                    <p className="text-2xl font-black text-gray-900">{kpi.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* By country */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Subscribers by Country</p>
                <div className="space-y-3">
                  {MVNO_PARTNERS.sort((a, b) => b.activeSubscribers - a.activeSubscribers).map(p => (
                    <div key={p.id}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-800">{p.flag} {p.country}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{p.partner.split(" ")[0]}</span>
                          <span className="text-sm font-black text-gray-900">{p.activeSubscribers.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(p.activeSubscribers / totalSubscribers) * 100}%`, background: p.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue streams */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Revenue Model</p>
                <div className="space-y-3">
                  {[
                    { stream: "Monthly plan subscriptions", pct: 45, amount: "R1.9M/month", note: "PAYG through Unlimited plans", color: P },
                    { stream: "International routing margin", pct: 32, amount: "R1.3M/month", note: "Spread between wholesale & customer rate", color: "#10B981" },
                    { stream: "Data top-up & add-ons", pct: 15, amount: "R630K/month", note: "Extra bundles, eSIM provisioning fees", color: "#3B82F6" },
                    { stream: "MVNO interconnect revenue", pct: 8, amount: "R336K/month", note: "Termination fees from partner networks", color: GOLD },
                  ].map((r, i) => (
                    <div key={i}>
                      <div className="flex justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-800">{r.stream}</p>
                        <p className="text-sm font-black" style={{ color: r.color }}>{r.amount}</p>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{r.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
