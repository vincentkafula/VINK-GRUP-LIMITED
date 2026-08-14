import { useEffect, useMemo, useRef, useState } from "react";
import {
  Power, Eye, FileText, Wallet, Users, Percent, Calculator, FileSignature,
  Bell, Moon, Settings, Search, ChevronDown, ChevronRight, TrendingUp, TrendingDown,
  CreditCard, Banknote, Download, Check, Clock, MapPin, Target, Calendar,
  Shield, Headphones, Menu, Wifi, WifiOff, Battery, RadioTower,
  CircleCheck, CircleAlert, CalendarClock, Landmark, ReceiptText, Signature,
  Radio, ScanLine, X,
} from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

/**
 * Driver Dashboard -- built from the uploaded reference, a full 9-page
 * interactive app (Dashboard, Turn on/off, live Preview, Statements,
 * Payslip, UIF, Tax, Association fee, Contract), not the static overview
 * the earlier version had. Adapted into TypeScript and this codebase's
 * props pattern (isOpen/onClose, wired through App.tsx) rather than a
 * standalone default-export app component.
 *
 * The UIF/PAYE tax math is presented as illustrative -- same framing the
 * reference itself uses -- verified against real numbers before building
 * any UI on it (progressive tax scales correctly, UIF caps at the
 * statutory ceiling), but these are simplified for demonstration, not a
 * substitute for a real payroll or SARS calculation.
 */

interface Props { isOpen: boolean; onClose: () => void; driverName?: string }

const NAVY = "#0B1330";
const NAVY_SOFT = "#121B3E";
const BLUE = "#2F5BFF";

const ACCENTS: Record<string, { bg: string; ic: string; line: string }> = {
  power:   { bg: "bg-blue-50",    ic: "bg-blue-100 text-blue-600",       line: "#3B82F6" },
  preview: { bg: "bg-emerald-50", ic: "bg-emerald-100 text-emerald-600", line: "#10B981" },
  stmt:    { bg: "bg-violet-50",  ic: "bg-violet-100 text-violet-600",   line: "#8B5CF6" },
  pay:     { bg: "bg-orange-50",  ic: "bg-orange-100 text-orange-600",   line: "#F97316" },
  uif:     { bg: "bg-sky-50",     ic: "bg-sky-100 text-sky-600",         line: "#0EA5E9" },
  tax:     { bg: "bg-amber-50",   ic: "bg-amber-100 text-amber-600",     line: "#F59E0B" },
  assoc:   { bg: "bg-rose-50",    ic: "bg-rose-100 text-rose-600",       line: "#F43F5E" },
  contract:{ bg: "bg-indigo-50",  ic: "bg-indigo-100 text-indigo-600",   line: "#6366F1" },
};

const R = (n: number) => "R " + Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function GlobalStyles() {
  return (
    <style>{`
      @keyframes tapPulse { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.45); } 70% { box-shadow: 0 0 0 18px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
      @keyframes rowIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes flashBg { 0% { background-color: #ECFDF5; } 100% { background-color: transparent; } }
      @keyframes dotBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      @keyframes cardTap { 0% { transform: translateX(-26px) rotate(-6deg); opacity: 0; } 55% { transform: translateX(0) rotate(0deg); opacity: 1; } 100% { transform: translateX(0) rotate(0deg); opacity: 1; } }
      @keyframes ringExpand { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(1.9); opacity: 0; } }
    `}</style>
  );
}

// ─── Mock trip data, stable for the session ────────────────────────────────
type Trip = { id: number; day: string; time: string; amount: number; type: "card" | "cash"; location: string; status: "approved" | "declined"; last4: string | null; _seenAt?: number };

function buildTrips(): Trip[] {
  const days = ["Mon 05 May", "Tue 06 May", "Wed 07 May", "Thu 08 May", "Fri 09 May", "Sat 10 May", "Sun 11 May"];
  const locations = ["Sandton City", "Rosebank Mall", "OR Tambo Airport", "Melville", "Fourways", "Midrand", "Soweto", "Randburg CBD"];
  const base: [number, "card" | "cash"][] = [
    [420, "card"], [180, "cash"], [95, "card"], [260, "card"], [140, "cash"],
    [310, "card"], [75, "cash"], [455, "card"], [120, "card"], [200, "cash"],
    [340, "card"], [90, "card"], [175, "cash"], [510, "card"], [130, "card"],
    [220, "cash"], [65, "card"], [385, "card"], [150, "cash"], [275, "card"],
    [110, "card"], [190, "cash"], [430, "card"], [85, "card"], [240, "cash"],
    [300, "card"], [160, "card"], [70, "cash"], [395, "card"], [125, "card"],
  ];
  let id = 1000;
  return base.map((b, i) => {
    const day = days[i % days.length];
    const hour = 6 + ((i * 37) % 15);
    const minute = (i * 11) % 60;
    return {
      id: id++, day,
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      amount: b[0], type: b[1], location: locations[i % locations.length],
      status: i % 13 === 0 ? "declined" : "approved",
      last4: b[1] === "card" ? String(1000 + ((i * 91) % 8999)).slice(-4) : null,
    };
  });
}

// ─── Illustrative South African-style statutory calculations ──────────────
function calcUIF(grossMonthly: number) {
  const CEILING = 17712;
  const base = Math.min(grossMonthly, CEILING);
  const employee = base * 0.01;
  const employer = base * 0.01;
  return { employee, employer, total: employee + employer, base, ceiling: CEILING };
}

function calcPAYE(grossMonthly: number) {
  const annual = grossMonthly * 12;
  const brackets = [
    { upTo: 237100, rate: 0.18, base: 0 },
    { upTo: 370500, rate: 0.26, base: 42678 },
    { upTo: 512800, rate: 0.31, base: 77362 },
    { upTo: 673000, rate: 0.36, base: 121475 },
    { upTo: Infinity, rate: 0.39, base: 179147 },
  ];
  const primaryRebate = 17235;
  let bracket = brackets[0];
  for (const b of brackets) { if (annual <= b.upTo) { bracket = b; break; } }
  const idx = brackets.indexOf(bracket);
  const lower = idx === 0 ? 0 : brackets[idx - 1].upTo;
  const annualTax = Math.max(0, bracket.base + (annual - lower) * bracket.rate - primaryRebate);
  return { annual, annualTax, monthlyTax: annualTax / 12, rate: bracket.rate };
}

const ASSOCIATION_FEE = 450;

// ─── Small shared UI pieces ─────────────────────────────────────────────
function Sparkline({ color = "#3B82F6", seed = 1 }: { color?: string; seed?: number }) {
  const points = useMemo(() => {
    let v = 20 + (seed * 7) % 15;
    const pts: number[] = [];
    for (let i = 0; i < 18; i++) {
      v += ((i * seed) % 5) - 2 + (i % 3 === 0 ? 3 : -1);
      v = Math.max(6, Math.min(34, v));
      pts.push(v);
    }
    return pts;
  }, [seed]);
  const w = 120, h = 40;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - p}`).join(" ");
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const gradId = `grad-${seed}`;
  return (
    <svg width="100%" height="40" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({ icon: Icon, accent, label, value, delta, seed }: { icon: any; accent: string; label: string; value: string | number; delta: number; seed: number }) {
  const a = ACCENTS[accent];
  const up = delta >= 0;
  return (
    <div className={`rounded-2xl p-5 ${a.bg} border border-black/5`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl grid place-items-center ${a.ic}`}><Icon size={18} /></div>
        <div className="text-sm font-medium text-slate-600">{label}</div>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      <div className={`mt-1 text-xs font-semibold flex items-center gap-1 ${up ? "text-emerald-600" : "text-rose-600"}`}>
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {Math.abs(delta)}% <span className="text-slate-400 font-normal">from last month</span>
      </div>
      <div className="mt-2 -mx-1"><Sparkline color={a.line} seed={seed} /></div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-3 group" aria-pressed={checked}>
      <span className={`w-11 h-6 rounded-full relative transition-colors duration-200 ${checked ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? "translate-x-5" : ""}`} />
      </span>
      {label && <span className="text-sm text-slate-600">{label}</span>}
    </button>
  );
}

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" }) {
  const tones = { slate: "bg-slate-100 text-slate-600", green: "bg-emerald-100 text-emerald-700", red: "bg-rose-100 text-rose-700", amber: "bg-amber-100 text-amber-700", blue: "bg-blue-100 text-blue-700" };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function SectionHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
      <div>
        {eyebrow && <div className="text-xs font-semibold tracking-wide uppercase text-blue-600 mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────
type View = "dashboard" | "power" | "preview" | "statements" | "payslip" | "uif" | "tax" | "assoc" | "contract";

const NAV: { id: View; label: string; icon: any }[] = [
  { id: "power", label: "Turn on or off", icon: Power },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "statements", label: "Statements", icon: FileText },
  { id: "payslip", label: "Payslip", icon: Wallet },
  { id: "uif", label: "Uif", icon: Users },
  { id: "tax", label: "Tax", icon: Percent },
  { id: "assoc", label: "Tax association fee", icon: Calculator },
  { id: "contract", label: "Contract", icon: FileSignature },
];

function Sidebar({ view, setView, mobileOpen, setMobileOpen, deviceOn, onClose }: { view: View; setView: (v: View) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void; deviceOn: boolean; onClose: () => void }) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed lg:static z-40 top-0 left-0 h-full w-64 flex flex-col transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`} style={{ background: NAVY }}>
        <div className="flex items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg grid place-items-center font-black text-white" style={{ background: BLUE }}>D</div>
            <span className="text-white font-bold text-lg tracking-tight">DRIVE</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white"><X size={18} /></button>
        </div>

        <button onClick={() => setView("dashboard")}
          className={`mx-4 mb-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${view === "dashboard" ? "text-white" : "text-slate-300 hover:bg-white/5"}`}
          style={view === "dashboard" ? { background: BLUE } : {}}>
          <FileText size={18} /> Dashboard
        </button>

        <div className="px-6 text-[11px] tracking-wider font-semibold text-slate-500 mb-2">DRIVE MODULES</div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV.map(n => {
            const Icon = n.icon;
            const active = view === n.id;
            return (
              <button key={n.id} onClick={() => { setView(n.id); setMobileOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-colors ${active ? "text-white bg-white/10" : "text-slate-300 hover:bg-white/5"}`}>
                <span className="flex items-center gap-3">
                  <Icon size={17} /> {n.label}
                  {n.id === "preview" && deviceOn && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "dotBlink 1.4s ease-in-out infinite" }} />}
                </span>
                <ChevronRight size={14} className="opacity-40" />
              </button>
            );
          })}
        </nav>

        <div className="p-4 space-y-3">
          <div className="rounded-xl p-4 border border-white/10" style={{ background: NAVY_SOFT }}>
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold mb-1"><Shield size={16} /> Secure &amp; Trusted</div>
            <p className="text-xs text-slate-400 leading-relaxed">Your earnings data is encrypted and protected.</p>
          </div>
          <div className="rounded-xl p-4 border border-white/10 flex items-center gap-3" style={{ background: NAVY_SOFT }}>
            <Headphones size={18} className="text-slate-300" />
            <div><div className="text-sm text-white font-medium">Need help?</div><div className="text-xs text-slate-400">Contact support</div></div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Topbar ─────────────────────────────────────────────────────────────
const NOTIFICATIONS = [
  { icon: CreditCard, tone: "text-blue-600 bg-blue-100", title: "Card tap approved — R 260.00", time: "Just now" },
  { icon: Calculator, tone: "text-rose-600 bg-rose-100", title: "Association fee due in 3 days", time: "2h ago" },
  { icon: Users, tone: "text-sky-600 bg-sky-100", title: "UIF contribution submitted", time: "1d ago" },
];

function Topbar({ setMobileOpen, driverName, deviceOn, onClose }: { setMobileOpen: (v: boolean) => void; driverName: string; deviceOn: boolean; onClose: () => void }) {
  const [notifOpen, setNotifOpen] = useState(false);
  return (
    <div className="flex items-center justify-between px-4 lg:px-8 py-4 border-b border-slate-200 bg-white sticky top-0 z-20">
      <div className="flex items-center gap-3 flex-1">
        <button className="lg:hidden text-slate-600" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
        <div className="hidden sm:flex items-center gap-2 bg-slate-100 rounded-xl px-4 py-2.5 w-full max-w-sm">
          <Search size={16} className="text-slate-400" />
          <input placeholder="Search trips, statements..." className="bg-transparent text-sm outline-none w-full placeholder:text-slate-400" />
          <span className="text-[10px] text-slate-400 border border-slate-300 rounded px-1.5 py-0.5">⌘K</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className={`hidden md:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${deviceOn ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${deviceOn ? "bg-emerald-500" : "bg-slate-400"}`} />
          Card machine {deviceOn ? "online" : "offline"}
        </span>
        <div className="relative">
          <button className="relative text-slate-500 hover:text-slate-800" onClick={() => setNotifOpen(v => !v)}>
            <Bell size={19} />
            <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] w-4 h-4 rounded-full grid place-items-center">{NOTIFICATIONS.length}</span>
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Notifications</div>
                {NOTIFICATIONS.map((n, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${n.tone}`}><n.icon size={14} /></div>
                    <div className="flex-1"><div className="text-sm text-slate-700 leading-snug">{n.title}</div><div className="text-xs text-slate-400 mt-0.5">{n.time}</div></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <button className="text-slate-500 hover:text-slate-800"><Moon size={19} /></button>
        <button className="text-slate-500 hover:text-slate-800"><Settings size={19} /></button>
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-9 h-9 rounded-full bg-slate-800 text-white grid place-items-center text-sm font-semibold">{driverName.split(" ").map(s => s[0]).join("").slice(0, 2)}</div>
          <div className="hidden sm:block leading-tight"><div className="text-sm font-semibold text-slate-800">{driverName}</div><div className="text-xs text-slate-400">Driver</div></div>
          <ChevronDown size={14} className="text-slate-400" />
        </div>
        <button onClick={onClose} className="hidden lg:flex text-slate-400 hover:text-slate-700 pl-1" aria-label="Close"><X size={19} /></button>
      </div>
    </div>
  );
}

// ─── Dashboard page ─────────────────────────────────────────────────────
function DashboardView({ trips, gross, uif, paye, netPay, driverName }: { trips: Trip[]; gross: number; uif: ReturnType<typeof calcUIF>; paye: ReturnType<typeof calcPAYE>; netPay: number; driverName: string }) {
  const cardTotal = trips.filter(t => t.type === "card").reduce((s, t) => s + t.amount, 0);
  const cashTotal = trips.filter(t => t.type === "cash").reduce((s, t) => s + t.amount, 0);

  const byDay = useMemo(() => {
    const order: string[] = []; const map: Record<string, number> = {};
    trips.forEach(t => { const key = t.day.split(" ")[0]; if (!map[key]) { map[key] = 0; order.push(key); } map[key] += t.amount; });
    return order.map(d => ({ day: d, total: Math.round(map[d]) }));
  }, [trips]);

  const pieData = [{ name: "Card", value: cardTotal, color: "#3B82F6" }, { name: "Cash", value: cashTotal, color: "#F59E0B" }];
  const stats = [
    { icon: Power, accent: "power", label: "Turned On", value: "6d 14h", delta: 12.5, seed: 3 },
    { icon: Eye, accent: "preview", label: "Trips (Previews)", value: trips.length, delta: 8.3, seed: 7 },
    { icon: FileText, accent: "stmt", label: "Statements", value: R(gross), delta: 15.7, seed: 11 },
    { icon: Wallet, accent: "pay", label: "Payslip (Net)", value: R(netPay), delta: 10.2, seed: 5 },
    { icon: Users, accent: "uif", label: "UIF", value: R(uif.total), delta: 6.8, seed: 9 },
    { icon: Percent, accent: "tax", label: "Tax (PAYE)", value: R(paye.monthlyTax), delta: 9.1, seed: 13 },
    { icon: Calculator, accent: "assoc", label: "Association Fee", value: R(ASSOCIATION_FEE), delta: 0, seed: 2 },
    { icon: FileSignature, accent: "contract", label: "Contract Status", value: "Active", delta: 7.2, seed: 4 },
  ];
  return (
    <div>
      <SectionHeader title={`Welcome back, ${driverName.split(" ")[0]} 👋`} subtitle="Here's what's happening on your drive account today."
        right={<div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-600 shadow-sm"><Calendar size={16} /> 05 May 2025 – 11 May 2025 <ChevronDown size={14} /></div>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Earnings by day</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={byDay} barCategoryGap={22}>
                <CartesianGrid vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v: number) => R(v)} cursor={{ fill: "#F8FAFC" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" fill="#2F5BFF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Card vs cash</h3>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {pieData.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => R(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-5 text-xs mt-1">
            {pieData.map(p => <span key={p.name} className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: p.color }} /> {p.name}</span>)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {trips.slice(0, 3).map(t => (
              <div key={t.id} className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg grid place-items-center ${t.type === "card" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}>
                  {t.type === "card" ? <CreditCard size={16} /> : <Banknote size={16} />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">Trip payment received — {R(t.amount)}</div>
                  <div className="text-xs text-slate-400">{t.location} · {t.type === "card" ? "Card" : "Cash (offline)"}</div>
                </div>
                <div className="text-xs text-slate-400 whitespace-nowrap">{t.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-slate-800">Upcoming Deadlines</h3><span className="text-xs font-semibold text-blue-600 cursor-pointer">View all</span></div>
          <div className="space-y-4">
            {[
              { icon: ReceiptText, label: "Tax Submission (PAYE)", date: "25 May 2025", tone: "red" as const },
              { icon: Users, label: "UIF Declaration", date: "31 May 2025", tone: "amber" as const },
              { icon: Calculator, label: "Association Fee due", date: "07 Jun 2025", tone: "blue" as const },
            ].map(d => (
              <div key={d.label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 grid place-items-center text-slate-500"><d.icon size={16} /></div>
                <div className="flex-1 text-sm font-medium text-slate-700">{d.label}</div>
                <Pill tone={d.tone}>{d.date}</Pill>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">System Overview</h3>
          <div className="flex items-center gap-5">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#E2E8F0" strokeWidth="4" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#10B981" strokeWidth="4" strokeDasharray="100" strokeDashoffset="16" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 grid place-items-center"><div className="text-lg font-bold text-slate-800 leading-none">98.4%</div></div>
            </div>
            <div className="flex-1 space-y-2.5 text-sm">
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><CircleCheck size={14} className="text-emerald-500" /> Device Status</span><span className="font-medium text-slate-700">Operational</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><Battery size={14} className="text-emerald-500" /> Battery</span><span className="font-medium text-slate-700">86%</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><Clock size={14} className="text-slate-400" /> Last Sync</span><span className="font-medium text-slate-700">2 min ago</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><Users size={14} className="text-slate-400" /> Trips today</span><span className="font-medium text-slate-700">7</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-1">Payment split</h3>
          <p className="text-xs text-slate-400 mb-4">Card (via machine) vs offline cash trips this period</p>
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1"><span className="text-slate-500">Card</span><span className="font-semibold text-slate-800">{R(cardTotal)}</span></div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${(cardTotal / (cardTotal + cashTotal)) * 100}%` }} /></div>
            <div className="flex justify-between text-sm mt-3 mb-1"><span className="text-slate-500">Cash (offline)</span><span className="font-semibold text-slate-800">{R(cashTotal)}</span></div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(cashTotal / (cardTotal + cashTotal)) * 100}%` }} /></div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-1">This week's net pay</h3>
          <p className="text-xs text-slate-400 mb-4">Gross minus tax, UIF and association fee</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Gross earnings</span><span className="font-medium text-slate-800">{R(gross)}</span></div>
            <div className="flex justify-between text-rose-500"><span>– PAYE tax</span><span>{R(paye.monthlyTax / 4.33)}</span></div>
            <div className="flex justify-between text-rose-500"><span>– UIF (employee)</span><span>{R(uif.employee)}</span></div>
            <div className="flex justify-between text-rose-500"><span>– Association fee</span><span>{R(ASSOCIATION_FEE / 4.33)}</span></div>
            <div className="border-t border-dashed border-slate-200 my-2" />
            <div className="flex justify-between text-base font-bold text-slate-900"><span>Net payout</span><span>{R(netPay)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Power page ─────────────────────────────────────────────────────────
function PowerView({ deviceOn, setDeviceOn }: { deviceOn: boolean; setDeviceOn: (v: boolean) => void }) {
  const [log] = useState([
    { action: "Turned on", by: "Driver", time: "Today, 06:02 AM" },
    { action: "Turned off", by: "Driver", time: "Yesterday, 09:47 PM" },
    { action: "Turned on", by: "Driver", time: "Yesterday, 05:58 AM" },
    { action: "Turned off (auto — low battery)", by: "System", time: "2 days ago, 11:12 PM" },
  ]);
  return (
    <div>
      <SectionHeader eyebrow="Drive module" title="Turn on or off" subtitle="Control the card-tap machine mounted in your vehicle." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center text-center">
          <div className={`w-20 h-20 rounded-full grid place-items-center mb-4 ${deviceOn ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}><Power size={32} /></div>
          <div className="text-lg font-bold text-slate-800">{deviceOn ? "Machine is On" : "Machine is Off"}</div>
          <p className="text-sm text-slate-400 mt-1 mb-5">{deviceOn ? "Accepting card taps and processing trips." : "No trips will be recorded until turned on."}</p>
          <ToggleSwitch checked={deviceOn} onChange={setDeviceOn} label={deviceOn ? "Tap to turn off" : "Tap to turn on"} />
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Device information</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><div className="text-slate-400 text-xs mb-1">Serial number</div><div className="font-medium text-slate-800">DRV-CM-88213</div></div>
            <div><div className="text-slate-400 text-xs mb-1">Model</div><div className="font-medium text-slate-800">TapPay P200</div></div>
            <div><div className="text-slate-400 text-xs mb-1">Vehicle</div><div className="font-medium text-slate-800">CA 123-456</div></div>
            <div>
              <div className="text-slate-400 text-xs mb-1">Connectivity</div>
              <div className="font-medium text-slate-800 flex items-center gap-1.5">
                {deviceOn ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-slate-400" />}
                {deviceOn ? "Connected" : "Offline"}
              </div>
            </div>
            <div><div className="text-slate-400 text-xs mb-1">Battery</div><div className="font-medium text-slate-800 flex items-center gap-1.5"><Battery size={14} className="text-emerald-500" /> 86%</div></div>
            <div><div className="text-slate-400 text-xs mb-1">Signal</div><div className="font-medium text-slate-800 flex items-center gap-1.5"><RadioTower size={14} className="text-emerald-500" /> Strong</div></div>
          </div>

          <h3 className="font-semibold text-slate-800 mt-6 mb-3">Activity log</h3>
          <div className="space-y-3">
            {log.map((l, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                <span className="flex items-center gap-2 text-slate-700 font-medium"><Power size={14} className="text-slate-400" /> {l.action}</span>
                <span className="text-slate-400">{l.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Preview page (live simulated tap feed) ────────────────────────────
const LOCS = ["Sandton City", "Rosebank Mall", "OR Tambo Airport", "Melville", "Fourways", "Midrand", "Soweto", "Randburg CBD"];
function timeNow() { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`; }

function PreviewView({ trips, deviceOn }: { trips: Trip[]; deviceOn: boolean }) {
  const [filter, setFilter] = useState<"all" | "card" | "cash">("all");
  const nextId = useRef(9000);
  const [feed, setFeed] = useState<Trip[]>(() => trips.slice(0, 9).map((t, i) => ({ ...t, id: 9000 + i, day: "Today", time: timeNow(), _seenAt: Date.now() - i * 60000 })));
  const [flashId, setFlashId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!deviceOn) return;
    const interval = setInterval(() => {
      setScanning(true);
      setTimeout(() => {
        const type: "card" | "cash" = Math.random() < 0.7 ? "card" : "cash";
        const amount = Math.round(60 + Math.random() * 420);
        const newTrip: Trip = {
          id: (nextId.current += 1), day: "Today", time: timeNow(), amount, type,
          location: LOCS[Math.floor(Math.random() * LOCS.length)],
          status: Math.random() < 0.94 ? "approved" : "declined",
          last4: type === "card" ? String(Math.floor(1000 + Math.random() * 8999)) : null,
          _seenAt: Date.now(),
        };
        setFeed(f => [newTrip, ...f].slice(0, 40));
        setFlashId(newTrip.id);
        setScanning(false);
        setTimeout(() => setFlashId(null), 1600);
      }, 900);
    }, 5500);
    return () => clearInterval(interval);
  }, [deviceOn]);

  const filtered = feed.filter(t => filter === "all" || t.type === filter);
  const latest = feed[0];
  const todayTotal = feed.reduce((s, t) => (t.status === "approved" ? s + t.amount : s), 0);
  const todayApproved = feed.filter(t => t.status === "approved").length;
  const todayDeclined = feed.filter(t => t.status === "declined").length;

  const chartData = useMemo(() => {
    const asc = [...feed].reverse();
    let cum = 0;
    return asc.map((t, i) => { if (t.status === "approved") cum += t.amount; return { i: i + 1, time: t.time, total: cum }; });
  }, [feed]);

  return (
    <div>
      <SectionHeader eyebrow="Drive module" title="Preview" subtitle="A visible, real-time view of every tap on the card machine as it happens."
        right={
          <div className={`flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-full ${deviceOn ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
            <span className={`w-2 h-2 rounded-full ${deviceOn ? "bg-emerald-500" : "bg-slate-400"}`} style={deviceOn ? { animation: "dotBlink 1.4s ease-in-out infinite" } : {}} />
            {deviceOn ? "Machine listening for taps" : "Machine offline"}
          </div>
        } />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="relative w-24 h-24 grid place-items-center mb-4">
            {deviceOn && <span className="absolute inset-0 rounded-full border-2 border-emerald-400" style={{ animation: "ringExpand 2.2s ease-out infinite" }} />}
            <div className={`w-16 h-16 rounded-full grid place-items-center ${deviceOn ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"}`} style={deviceOn ? { animation: "tapPulse 2.2s infinite" } : {}}>
              <ScanLine size={26} />
            </div>
          </div>
          <div className="text-sm font-semibold text-slate-800">{scanning ? "Reading card…" : deviceOn ? "Ready for next tap" : "Machine is off"}</div>
          <p className="text-xs text-slate-400 mt-1">{deviceOn ? "New taps appear below the moment they happen." : "Turn the machine on to start receiving taps."}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="text-xs font-semibold text-slate-400 uppercase mb-3">Last tap</div>
          {latest ? (
            <div className="flex items-center gap-4" style={{ animation: flashId === latest.id ? "cardTap 0.5s ease-out" : "none" }}>
              <div className={`w-14 h-10 rounded-lg grid place-items-center text-white shrink-0 ${latest.type === "card" ? "bg-blue-600" : "bg-amber-500"}`}>
                {latest.type === "card" ? <CreditCard size={20} /> : <Banknote size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xl font-bold text-slate-900">{R(latest.amount)}</div>
                <div className="text-xs text-slate-400 truncate">{latest.type === "card" ? `Card •••• ${latest.last4}` : "Cash (offline)"} · {latest.location}</div>
              </div>
              <Pill tone={latest.status === "approved" ? "green" : "red"}>{latest.status}</Pill>
            </div>
          ) : <div className="text-sm text-slate-400">No taps yet.</div>}
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
            <div><div className="text-slate-400">Approved today</div><div className="text-sm font-semibold text-emerald-600">{todayApproved}</div></div>
            <div><div className="text-slate-400">Declined today</div><div className="text-sm font-semibold text-rose-500">{todayDeclined}</div></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Running total — today</div>
          <div className="text-2xl font-bold text-slate-900 mb-3">{R(todayTotal)}</div>
          <div style={{ width: "100%", height: 70 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs><linearGradient id="previewArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10B981" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="total" stroke="#10B981" strokeWidth={2} fill="url(#previewArea)" isAnimationActive />
                <Tooltip formatter={(v: number) => R(v)} labelFormatter={() => ""} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2">
          {([["all", "All"], ["card", "Card taps"], ["cash", "Cash (offline)"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-4 py-2 rounded-xl text-sm font-medium border ${filter === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400"><Radio size={13} className={deviceOn ? "text-emerald-500" : ""} /> Auto-updating live</div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-6 gap-2 px-5 py-3 text-xs font-semibold text-slate-400 uppercase border-b border-slate-100">
          <span className="col-span-2">Trip</span><span>Amount</span><span>Method</span><span>Location</span><span>Status</span>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {filtered.map(t => (
            <div key={t.id} className="grid grid-cols-6 gap-2 px-5 py-3.5 text-sm items-center border-b border-slate-50 hover:bg-slate-50"
              style={flashId === t.id ? { animation: "rowIn 0.4s ease-out, flashBg 1.6s ease-out" } : {}}>
              <div className="col-span-2">
                <div className="font-medium text-slate-800 flex items-center gap-1.5">
                  #{t.id}
                  {flashId === t.id && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">NEW</span>}
                </div>
                <div className="text-xs text-slate-400">{t.day} · {t.time}</div>
              </div>
              <div className="font-semibold text-slate-800">{R(t.amount)}</div>
              <div className="flex items-center gap-1.5 text-slate-600">
                {t.type === "card" ? <CreditCard size={14} className="text-blue-500" /> : <Banknote size={14} className="text-amber-500" />}
                {t.type === "card" ? `•••• ${t.last4}` : "Cash"}
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs"><MapPin size={12} /> {t.location}</div>
              <Pill tone={t.status === "approved" ? "green" : "red"}>{t.status === "approved" ? "Approved" : "Declined"}</Pill>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Statements page ────────────────────────────────────────────────────
function downloadCSV(rows: Trip[], filename: string) {
  const header = ["Trip ID", "Day", "Time", "Location", "Method", "Status", "Amount (ZAR)"];
  const lines = rows.map(t => [t.id, t.day, t.time, t.location, t.type, t.status, t.amount.toFixed(2)].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function StatementsView({ trips, gross }: { trips: Trip[]; gross: number }) {
  const [methodFilter, setMethodFilter] = useState<"all" | "card" | "cash">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "declined">("all");

  const filtered = trips.filter(t => (methodFilter === "all" || t.type === methodFilter) && (statusFilter === "all" || t.status === statusFilter));
  const filteredTotal = filtered.reduce((s, t) => s + t.amount, 0);
  const cardTotal = trips.filter(t => t.type === "card").reduce((s, t) => s + t.amount, 0);
  const cashTotal = trips.filter(t => t.type === "cash").reduce((s, t) => s + t.amount, 0);

  const trend = useMemo(() => {
    const order: string[] = []; const map: Record<string, number> = {};
    trips.forEach(t => { const key = t.day.split(" ")[0]; if (!map[key]) { map[key] = 0; order.push(key); } map[key] += t.amount; });
    return order.map(d => ({ day: d, total: Math.round(map[d]) }));
  }, [trips]);

  return (
    <div>
      <SectionHeader eyebrow="Drive module" title="Statements" subtitle="Every trip and the money it earned, for the selected period."
        right={
          <button onClick={() => downloadCSV(filtered, `statement-${methodFilter}-${Date.now()}.csv`)}
            className="flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-slate-800">
            <Download size={15} /> Export statement (CSV)
          </button>
        } />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-xs text-slate-400 mb-1">Total trips</div><div className="text-2xl font-bold text-slate-900">{trips.length}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-xs text-slate-400 mb-1">Gross earned</div><div className="text-2xl font-bold text-slate-900">{R(gross)}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="text-xs text-slate-400 mb-1">Card / Cash split</div><div className="text-xl font-bold text-slate-900">{R(cardTotal)} <span className="text-slate-300">/</span> {R(cashTotal)}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 col-span-1">
          <div className="text-xs text-slate-400 mb-1">Trend this period</div>
          <div style={{ width: "100%", height: 44 }}>
            <ResponsiveContainer><LineChart data={trend}><Line type="monotone" dataKey="total" stroke="#8B5CF6" strokeWidth={2} dot={false} /><Tooltip formatter={(v: number) => R(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} /></LineChart></ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 self-center mr-1">Method</span>
          {([["all", "All"], ["card", "Card"], ["cash", "Cash"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMethodFilter(k)} className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border ${methodFilter === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{l}</button>
          ))}
          <span className="text-xs font-semibold text-slate-400 self-center ml-3 mr-1">Status</span>
          {([["all", "All"], ["approved", "Approved"], ["declined", "Declined"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setStatusFilter(k)} className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border ${statusFilter === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{l}</button>
          ))}
        </div>
        <div className="text-xs text-slate-400">{filtered.length} trips · {R(filteredTotal)}</div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-left text-xs font-semibold text-slate-400 uppercase border-b border-slate-100">
            <th className="px-5 py-3">Trip ID</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Location</th>
            <th className="px-5 py-3">Method</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Amount</th>
          </tr></thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">#{t.id}</td>
                <td className="px-5 py-3 text-slate-500">{t.day}, {t.time}</td>
                <td className="px-5 py-3 text-slate-500">{t.location}</td>
                <td className="px-5 py-3 text-slate-500">{t.type === "card" ? "Card" : "Cash (offline)"}</td>
                <td className="px-5 py-3"><Pill tone={t.status === "approved" ? "green" : "red"}>{t.status}</Pill></td>
                <td className="px-5 py-3 text-right font-semibold text-slate-800">{R(t.amount)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">No trips match these filters.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-slate-500">Total (filtered)</td><td className="px-5 py-3 text-right text-base font-bold text-slate-900">{R(filteredTotal)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Payslip page ───────────────────────────────────────────────────────
function PayslipView({ gross, uif, paye, driverName }: { gross: number; uif: ReturnType<typeof calcUIF>; paye: ReturnType<typeof calcPAYE>; driverName: string }) {
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const periodGross = period === "weekly" ? gross : gross * 4.33;
  const periodUifEmp = period === "weekly" ? uif.employee : uif.employee * 4.33;
  const periodTax = period === "weekly" ? paye.monthlyTax / 4.33 : paye.monthlyTax;
  const periodAssoc = period === "weekly" ? ASSOCIATION_FEE / 4.33 : ASSOCIATION_FEE;
  const net = periodGross - periodUifEmp - periodTax - periodAssoc;

  const donut = [
    { name: "Net pay", value: net, color: "#10B981" },
    { name: "PAYE tax", value: periodTax, color: "#F59E0B" },
    { name: "UIF", value: periodUifEmp, color: "#0EA5E9" },
    { name: "Association fee", value: periodAssoc, color: "#F43F5E" },
  ];

  const handleDownload = () => {
    const el = document.getElementById("payslip-printable");
    if (!el) return;
    const w = window.open("", "_blank", "width=480,height=700");
    if (!w) return;
    w.document.write(`<html><head><title>Payslip</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
      .row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px}
      .neg{color:#e11d48}.total{font-weight:700;border-top:1px solid #e2e8f0;margin-top:8px;padding-top:10px}
      h2{margin:0 0 4px}
    </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div>
      <SectionHeader eyebrow="Drive module" title="Payslip" subtitle="Gross earnings and deductions for the pay period."
        right={
          <div className="flex bg-slate-100 rounded-xl p-1 text-sm font-medium">
            {(["weekly", "monthly"] as const).map(p => <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 rounded-lg capitalize ${period === p ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>{p}</button>)}
          </div>
        } />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden lg:col-span-2">
          <div className="p-6 border-b border-dashed border-slate-200 flex items-center justify-between" style={{ background: "linear-gradient(135deg,#0B1330,#1c2a5e)" }}>
            <div><div className="text-white font-bold text-lg">Drive Payslip</div><div className="text-slate-300 text-xs mt-1">{period === "weekly" ? "Week of 05 – 11 May 2025" : "May 2025"}</div></div>
            <div className="text-right"><div className="text-white text-sm font-medium">{driverName}</div><div className="text-slate-300 text-xs">Driver ID: DRV-10024</div></div>
          </div>

          <div id="payslip-printable" className="p-6 space-y-1 text-sm">
            <h2>Drive Payslip — {period === "weekly" ? "Week of 05–11 May 2025" : "May 2025"}</h2>
            <div className="text-xs text-slate-400 mb-3">{driverName} · Driver ID DRV-10024</div>
            <div className="row flex justify-between py-2"><span className="text-slate-500">Gross earnings ({period})</span><span className="font-semibold text-slate-800">{R(periodGross)}</span></div>
            <div className="row neg flex justify-between py-2 text-rose-500"><span>PAYE tax</span><span>– {R(periodTax)}</span></div>
            <div className="row neg flex justify-between py-2 text-rose-500"><span>UIF contribution (employee)</span><span>– {R(periodUifEmp)}</span></div>
            <div className="row neg flex justify-between py-2 text-rose-500"><span>Association fee</span><span>– {R(periodAssoc)}</span></div>
            <div className="border-t border-slate-200 my-2" />
            <div className="row total flex justify-between py-2 text-base font-bold text-slate-900"><span>Net pay</span><span>{R(net)}</span></div>
          </div>

          <div className="px-6 pb-6">
            <button onClick={handleDownload} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-medium py-3 rounded-xl hover:bg-slate-800">
              <Download size={16} /> Download payslip (PDF)
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-3">Where the money goes</h3>
          <div style={{ width: "100%", height: 190 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={3}>
                  {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => R(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {donut.map(d => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: d.color }} /> {d.name}</span>
                <span className="font-medium text-slate-700">{R(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800 flex gap-3">
        <CircleAlert size={18} className="shrink-0 mt-0.5" />
        Deductions are calculated automatically from your logged trips — tax uses simplified PAYE brackets and UIF is capped at the statutory remuneration ceiling. Illustrative, not a substitute for a real payroll or SARS calculation.
      </div>
    </div>
  );
}

// ─── UIF page ───────────────────────────────────────────────────────────
function UifView({ uif, gross }: { uif: ReturnType<typeof calcUIF>; gross: number }) {
  const history = useMemo(() => ["Jan", "Feb", "Mar", "Apr", "May"].map((m, i) => ({ m, total: Math.round(uif.total * (0.9 + ((i * 37) % 20) / 100)) })), [uif.total]);
  return (
    <div>
      <SectionHeader eyebrow="Drive module" title="UIF" subtitle="Unemployment Insurance Fund contribution, calculated automatically each month." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:col-span-2">
          <h3 className="font-semibold text-slate-800 mb-4">This month's contribution</h3>
          <div className="grid grid-cols-2 gap-y-4 text-sm">
            <div className="text-slate-500">Gross monthly remuneration</div><div className="text-right font-medium text-slate-800">{R(gross)}</div>
            <div className="text-slate-500">Contribution ceiling</div><div className="text-right font-medium text-slate-800">{R(uif.ceiling)}</div>
            <div className="text-slate-500">Contribution base</div><div className="text-right font-medium text-slate-800">{R(uif.base)}</div>
            <div className="text-slate-500">Employee contribution (1%)</div><div className="text-right font-medium text-slate-800">{R(uif.employee)}</div>
            <div className="text-slate-500">Employer/owner contribution (1%)</div><div className="text-right font-medium text-slate-800">{R(uif.employer)}</div>
            <div className="border-t border-dashed border-slate-200 col-span-2 my-1" />
            <div className="font-semibold text-slate-900">Total paid to UIF</div><div className="text-right font-bold text-slate-900">{R(uif.total)}</div>
          </div>
          <div className="mt-5 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${Math.min(100, (uif.base / uif.ceiling) * 100)}%` }} /></div>
          <div className="text-xs text-slate-400 mt-1">{((uif.base / uif.ceiling) * 100).toFixed(1)}% of the monthly ceiling used</div>

          <h4 className="text-sm font-semibold text-slate-700 mt-6 mb-2">Contribution trend</h4>
          <div style={{ width: "100%", height: 140 }}>
            <ResponsiveContainer>
              <BarChart data={history} barCategoryGap={26}>
                <CartesianGrid vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(v: number) => R(v)} cursor={{ fill: "#F8FAFC" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-3">Contribution history</h3>
          <div className="space-y-3">
            {["Apr 2025", "Mar 2025", "Feb 2025"].map((m, i) => (
              <div key={m} className="flex items-center justify-between text-sm"><span className="text-slate-500">{m}</span><Pill tone="green">Paid — {R(uif.total * (1 - i * 0.03))}</Pill></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tax page ───────────────────────────────────────────────────────────
function TaxView({ paye, gross }: { paye: ReturnType<typeof calcPAYE>; gross: number }) {
  const history = useMemo(() => ["Jan", "Feb", "Mar", "Apr", "May"].map((m, i) => ({ m, total: Math.round(paye.monthlyTax * (0.85 + ((i * 41) % 25) / 100)) })), [paye.monthlyTax]);
  return (
    <div>
      <SectionHeader eyebrow="Drive module" title="Tax" subtitle="PAYE income tax, calculated automatically from your logged earnings." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:col-span-2">
          <h3 className="font-semibold text-slate-800 mb-4">Monthly PAYE breakdown</h3>
          <div className="grid grid-cols-2 gap-y-4 text-sm">
            <div className="text-slate-500">Gross monthly earnings</div><div className="text-right font-medium text-slate-800">{R(gross)}</div>
            <div className="text-slate-500">Annualised earnings</div><div className="text-right font-medium text-slate-800">{R(paye.annual)}</div>
            <div className="text-slate-500">Marginal tax bracket</div><div className="text-right font-medium text-slate-800">{(paye.rate * 100).toFixed(0)}%</div>
            <div className="text-slate-500">Estimated annual tax</div><div className="text-right font-medium text-slate-800">{R(paye.annualTax)}</div>
            <div className="border-t border-dashed border-slate-200 col-span-2 my-1" />
            <div className="font-semibold text-slate-900">Tax deducted this month</div><div className="text-right font-bold text-slate-900">{R(paye.monthlyTax)}</div>
          </div>

          <h4 className="text-sm font-semibold text-slate-700 mt-6 mb-2">Tax deducted — last 5 months</h4>
          <div style={{ width: "100%", height: 140 }}>
            <ResponsiveContainer>
              <LineChart data={history}>
                <CartesianGrid vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(v: number) => R(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="total" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <button className="mt-5 flex items-center gap-2 text-sm font-medium text-blue-600"><Download size={15} /> Download IRP5 / tax certificate</button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-3">Tax brackets (2025)</h3>
          <div className="space-y-2 text-xs">
            {[["Up to R237,100", "18%"], ["R237,101 – R370,500", "26%"], ["R370,501 – R512,800", "31%"], ["R512,801 – R673,000", "36%"], ["Above R673,000", "39%"]].map(([r, p]) => (
              <div key={r} className="flex justify-between border-b border-slate-50 pb-2 last:border-0"><span className="text-slate-500">{r}</span><span className="font-medium text-slate-700">{p}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Association fee page ───────────────────────────────────────────────
function AssocView() {
  const history = [
    { m: "May 2025", status: "pending" as const, due: "07 Jun 2025" },
    { m: "Apr 2025", status: "paid" as const, due: "07 May 2025" },
    { m: "Mar 2025", status: "paid" as const, due: "07 Apr 2025" },
    { m: "Feb 2025", status: "paid" as const, due: "07 Mar 2025" },
  ];
  return (
    <div>
      <SectionHeader eyebrow="Drive module" title="Tax association fee" subtitle="Monthly fee paid to your taxi / driver association." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 grid place-items-center"><Landmark size={18} /></div>
            <div><div className="font-semibold text-slate-800">Greater Joburg Drivers Association</div><div className="text-xs text-slate-400">Member since Jan 2023</div></div>
          </div>
          <div className="text-3xl font-bold text-slate-900">{R(ASSOCIATION_FEE)}<span className="text-sm text-slate-400 font-normal">/month</span></div>
          <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-xl px-3 py-2"><CalendarClock size={16} /> Next payment due 07 Jun 2025</div>
          <button className="mt-4 w-full bg-slate-900 text-white text-sm font-medium py-2.5 rounded-xl">Pay now</button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:col-span-2">
          <h3 className="font-semibold text-slate-800 mb-4">Payment history</h3>
          <div className="space-y-3">
            {history.map(h => (
              <div key={h.m} className="flex items-center justify-between text-sm border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                <div><div className="font-medium text-slate-800">{h.m}</div><div className="text-xs text-slate-400">Due {h.due}</div></div>
                <div className="flex items-center gap-3"><span className="font-semibold text-slate-700">{R(ASSOCIATION_FEE)}</span><Pill tone={h.status === "paid" ? "green" : "amber"}>{h.status === "paid" ? "Paid" : "Pending"}</Pill></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Contract page ──────────────────────────────────────────────────────
function ContractView({ driverName }: { driverName: string }) {
  const [payType, setPayType] = useState<"monthly" | "target">("monthly");
  const [offlineAllowed, setOfflineAllowed] = useState(true);
  return (
    <div>
      <SectionHeader eyebrow="Drive module" title="Contract" subtitle="The agreement between you and the vehicle owner." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 grid place-items-center"><Signature size={18} /></div>
              <div><div className="font-semibold text-slate-800">Driver–Owner Agreement</div><div className="text-xs text-slate-400">Contract #CT-2025-0142</div></div>
            </div>
            <Pill tone="green">Active</Pill>
          </div>

          <div className="grid grid-cols-2 gap-y-4 text-sm mb-6">
            <div className="text-slate-500">Driver</div><div className="text-right font-medium text-slate-800">{driverName}</div>
            <div className="text-slate-500">Vehicle owner</div><div className="text-right font-medium text-slate-800">Sipho Dlamini</div>
            <div className="text-slate-500">Vehicle</div><div className="text-right font-medium text-slate-800">Toyota Corolla Quest · CA 123-456</div>
            <div className="text-slate-500">Start date</div><div className="text-right font-medium text-slate-800">01 Jan 2025</div>
            <div className="text-slate-500">Contract term</div><div className="text-right font-medium text-slate-800">12 months</div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5"><span>Contract progress</span><span>4 of 12 months elapsed</span></div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: "33%" }} /></div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <div className="text-sm font-semibold text-slate-700 mb-3">Payment structure</div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setPayType("monthly")} className={`flex-1 text-left p-4 rounded-xl border ${payType === "monthly" ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
                <div className="text-sm font-semibold text-slate-800">Fixed monthly</div>
                <div className="text-xs text-slate-500 mt-1">Owner receives a set amount each month regardless of trips.</div>
              </button>
              <button onClick={() => setPayType("target")} className={`flex-1 text-left p-4 rounded-xl border ${payType === "target" ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
                <div className="text-sm font-semibold text-slate-800">Target-based</div>
                <div className="text-xs text-slate-500 mt-1">Owner receives earnings up to a daily/weekly target; driver keeps the rest.</div>
              </button>
            </div>

            {payType === "monthly" ? (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 text-sm"><span className="text-slate-500">Fixed amount due to owner</span><span className="font-semibold text-slate-800">{R(4500)}/month</span></div>
            ) : (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 text-sm"><span className="text-slate-500 flex items-center gap-2"><Target size={14} /> Daily target for owner</span><span className="font-semibold text-slate-800">{R(350)}/day</span></div>
            )}

            <div className="flex items-center justify-between mt-5">
              <div><div className="text-sm font-medium text-slate-700">Allow offline (cash) payments</div><div className="text-xs text-slate-400">Cash trips still count toward the target / are logged in statements.</div></div>
              <ToggleSwitch checked={offlineAllowed} onChange={setOfflineAllowed} />
            </div>
          </div>

          <button className="mt-6 w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-medium py-3 rounded-xl"><Download size={16} /> Download signed contract (PDF)</button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Signature status</h3>
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3"><Check size={16} className="text-emerald-500" /> <div><div className="font-medium text-slate-800">Driver signed</div><div className="text-xs text-slate-400">01 Jan 2025</div></div></div>
            <div className="flex items-center gap-3"><Check size={16} className="text-emerald-500" /> <div><div className="font-medium text-slate-800">Owner signed</div><div className="text-xs text-slate-400">02 Jan 2025</div></div></div>
          </div>
          <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-400 leading-relaxed">
            Changing the payment structure or offline-payment permission updates this record only — it does not re-sign the contract. Both parties must re-sign for changes to take legal effect.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ───────────────────────────────────────────────────────────────
export function DriveDashboardViewer({ isOpen, onClose, driverName = "Driver" }: Props) {
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deviceOn, setDeviceOn] = useState(true);

  const trips = useMemo(() => buildTrips(), []);
  const gross = useMemo(() => trips.reduce((s, t) => s + t.amount, 0) * 4.33, [trips]);
  const uif = useMemo(() => calcUIF(gross), [gross]);
  const paye = useMemo(() => calcPAYE(gross), [gross]);
  const netPay = gross - uif.employee - paye.monthlyTax - ASSOCIATION_FEE;

  if (!isOpen) return null;

  const pages: Record<View, React.ReactNode> = {
    dashboard: <DashboardView trips={trips} gross={gross / 4.33} uif={uif} paye={paye} netPay={netPay / 4.33} driverName={driverName} />,
    power: <PowerView deviceOn={deviceOn} setDeviceOn={setDeviceOn} />,
    preview: <PreviewView trips={trips} deviceOn={deviceOn} />,
    statements: <StatementsView trips={trips} gross={trips.reduce((s, t) => s + t.amount, 0)} />,
    payslip: <PayslipView gross={gross / 4.33} uif={uif} paye={paye} driverName={driverName} />,
    uif: <UifView uif={uif} gross={gross} />,
    tax: <TaxView paye={paye} gross={gross} />,
    assoc: <AssocView />,
    contract: <ContractView driverName={driverName} />,
  };

  return (
    <div className="fixed inset-0 z-[110] min-h-screen bg-[#F4F6FB] flex" style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      <GlobalStyles />
      <Sidebar view={view} setView={setView} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} deviceOn={deviceOn} onClose={onClose} />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <Topbar setMobileOpen={setMobileOpen} driverName={driverName} deviceOn={deviceOn} onClose={onClose} />
        <main className="p-4 lg:p-8">{pages[view]}</main>
      </div>
    </div>
  );
}
