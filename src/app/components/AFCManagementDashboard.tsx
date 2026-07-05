/**
 * AFC (Automatic Fare Collection) Management Dashboard
 *
 * Core concept: When a passenger taps their Vink card on the AFC device,
 * they deposit the fare directly to the driver's wallet.
 * Each device has a unique reference number and is registered to one driver.
 *
 * Revenue split per tap:
 *   Driver        85%
 *   Association    5%
 *   Neighbourhood Watch  5%
 *   Community Bank Fund  5%
 *   VMS fee        R0.50 (lowest in industry)
 */
import { useState, useEffect, useCallback } from "react";
import {
  X, Wifi, BatteryCharging, Battery, MapPin, CheckCircle,
  TrendingUp, Users, Activity, AlertTriangle, Settings,
  RefreshCw, Zap, Shield, Radio, ChevronRight, BarChart3,
} from "lucide-react";

interface Props { isOpen: boolean; onClose: () => void; }

// ─── Color + formatting ───────────────────────────────────────────────────────
const P   = "#5B2D8E";
const GOLD = "#F5A623";
const GREEN = "#10B981";
const fmt = (n: number) => `R ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtM = (n: number) => n >= 1000 ? `R${(n/1000).toFixed(1)}K` : `R${n}`;

// ─── Static demo data ─────────────────────────────────────────────────────────
const DEVICES = [
  { id: "dev-001", ref: "AFC-CPT-00847", driver: "Sipho Dlamini",   driverRef: "VMS-DRV-2024-00001", plate: "CA 847-891", route: "Khayelitsha → Cape Town CBD",  fare: 14.00, status: "online",  battery: 92, signal: 4, wifi: true,  todayTaps: 28, todayRevenue: 392.00, passengers: 11, assoc: "CATA", lat: -33.9249, lng: 18.4241, make: "Toyota HiAce" },
  { id: "dev-002", ref: "AFC-CPT-00312", driver: "Thabo Nkosi",     driverRef: "VMS-DRV-2024-00002", plate: "CA 312-554", route: "Mitchell's Plain → Bellville", fare: 11.50, status: "online",  battery: 78, signal: 3, wifi: true,  todayTaps: 18, todayRevenue: 207.00, passengers: 8,  assoc: "CATA", lat: -33.9898, lng: 18.5672, make: "Toyota HiAce" },
  { id: "dev-003", ref: "AFC-CPT-00991", driver: "Priya Naidoo",    driverRef: "VMS-DRV-2024-00003", plate: "CA 991-223", route: "Gugulethu → Claremont",       fare: 13.00, status: "online",  battery: 65, signal: 4, wifi: true,  todayTaps: 22, todayRevenue: 286.00, passengers: 13, assoc: "CATA", lat: -33.9748, lng: 18.5234, make: "Quantum 15-seater" },
  { id: "dev-004", ref: "AFC-CPT-00445", driver: "James van Berg",  driverRef: "VMS-DRV-2024-00004", plate: "CA 445-881", route: "Langa → Observatory",         fare: 10.00, status: "offline", battery: 23, signal: 0, wifi: false, todayTaps: 0,  todayRevenue: 0,      passengers: 0,  assoc: "CATA", lat: -33.9283, lng: 18.4742, make: "Toyota HiAce" },
  { id: "dev-005", ref: "AFC-CPT-00772", driver: "Lindiwe Mokoena", driverRef: "VMS-DRV-2024-00005", plate: "CA 772-339", route: "Nyanga → Wynberg",            fare: 12.50, status: "online",  battery: 88, signal: 4, wifi: true,  todayTaps: 35, todayRevenue: 437.50, passengers: 14, assoc: "CATA", lat: -34.0123, lng: 18.4932, make: "Quantum 15-seater" },
  { id: "dev-006", ref: "AFC-JHB-01284", driver: "Bongani Zulu",    driverRef: "VMS-DRV-2024-00006", plate: "GP 284-11",  route: "Soweto → Johannesburg CBD",   fare: 16.00, status: "online",  battery: 95, signal: 3, wifi: true,  todayTaps: 31, todayRevenue: 496.00, passengers: 12, assoc: "JMTC", lat: -26.2041, lng: 28.0473, make: "Toyota HiAce" },
];

const WALLETS = [
  { driver: "Sipho Dlamini",   ref: "VMS-DRV-2024-00001", balance: 4284.50, today: 847.50,  week: 4284.50,  taps: 2847, bank: "Standard Bank ****4291", payout: true },
  { driver: "Thabo Nkosi",     ref: "VMS-DRV-2024-00002", balance: 2142.00, today: 482.00,  week: 2142.00,  taps: 1423, bank: "Nedbank ****8834",        payout: false },
  { driver: "Priya Naidoo",    ref: "VMS-DRV-2024-00003", balance: 3890.00, today: 624.00,  week: 3890.00,  taps: 2241, bank: "FNB ****3317",            payout: true },
  { driver: "James van Berg",  ref: "VMS-DRV-2024-00004", balance: 1247.50, today: 0,        week: 1247.50,  taps: 892,  bank: "Not linked",             payout: false },
  { driver: "Lindiwe Mokoena", ref: "VMS-DRV-2024-00005", balance: 5124.00, today: 988.00,  week: 5124.00,  taps: 3421, bank: "Absa ****7751",           payout: true },
];

type Screen = "overview" | "devices" | "terminal" | "wallets" | "routes" | "analytics";

// ─── Live tap feed ────────────────────────────────────────────────────────────
interface LiveTap {
  id: string; device: string; card: string; fare: number;
  result: "approved" | "declined"; ms: number; wifi: boolean; time: string;
}

// ─── Signal + battery icons ───────────────────────────────────────────────────
function SignalBars({ bars }: { bars: number }) {
  return (
    <div className="flex items-end gap-0.5">
      {[1,2,3,4].map(b => (
        <div key={b} className="w-1 rounded-sm transition-all"
          style={{ height: `${b * 3 + 2}px`, background: b <= bars ? "#10B981" : "#E5E7EB" }} />
      ))}
    </div>
  );
}

function BatteryIcon({ pct }: { pct: number }) {
  const color = pct > 50 ? "#10B981" : pct > 20 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-center gap-1">
      <div className="relative w-6 h-3.5 rounded-sm border-2" style={{ borderColor: color }}>
        <div className="absolute inset-0 rounded-sm" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-bold" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ─── AFC Terminal Simulator ───────────────────────────────────────────────────
function AFCTerminal({ device, onTap }: { device: typeof DEVICES[0]; onTap: (tap: LiveTap) => void }) {
  const [tapState, setTapState] = useState<"idle" | "processing" | "approved" | "declined">("idle");
  const [lastTap, setLastTap] = useState<LiveTap | null>(null);
  const [tapCount, setTapCount] = useState(device.todayTaps);
  const [revenue, setRevenue] = useState(device.todayRevenue);
  const [pulseRing, setPulseRing] = useState(false);

  useEffect(() => {
    const pulse = setInterval(() => setPulseRing(p => !p), 1200);
    return () => clearInterval(pulse);
  }, []);

  const simulateTap = () => {
    if (tapState !== "idle") return;
    setTapState("processing");
    const start = Date.now();
    const approved = Math.random() > 0.12;
    setTimeout(() => {
      const ms = Date.now() - start + Math.floor(Math.random() * 800 + 300);
      const card = String(Math.floor(Math.random() * 9000 + 1000));
      const tap: LiveTap = {
        id: crypto.randomUUID?.() ?? String(Math.random()),
        device: device.ref, card,
        fare: device.fare, result: approved ? "approved" : "declined",
        ms, wifi: approved && device.wifi,
        time: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
      setTapState(approved ? "approved" : "declined");
      setLastTap(tap);
      if (approved) { setTapCount(c => c + 1); setRevenue(r => +(r + device.fare).toFixed(2)); }
      onTap(tap);
      setTimeout(() => setTapState("idle"), 2500);
    }, 900 + Math.random() * 600);
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#0F0F1A", border: "1px solid #2D2A4A" }}>
      {/* Device header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: device.status === "online" ? GREEN : "#EF4444" }} />
          <span className="text-white text-xs font-bold">{device.ref}</span>
        </div>
        <div className="flex items-center gap-3">
          {device.wifi && <Wifi className="w-3.5 h-3.5 text-blue-400" />}
          <SignalBars bars={device.signal} />
          <BatteryIcon pct={device.battery} />
        </div>
      </div>

      {/* Route banner */}
      <div className="px-4 py-2 text-center" style={{ background: P + "30" }}>
        <p className="text-white/60 text-[9px] uppercase tracking-widest">Current Route</p>
        <p className="text-white font-bold text-xs mt-0.5 truncate">{device.route}</p>
        <p className="text-yellow-400 font-black text-lg">{fmt(device.fare)}</p>
      </div>

      {/* Tap zone */}
      <div className="flex flex-col items-center justify-center px-4 py-6 gap-4">
        <div
          onClick={simulateTap}
          className="relative w-36 h-36 rounded-full flex flex-col items-center justify-center cursor-pointer select-none transition-all"
          style={{
            background: tapState === "approved" ? GREEN : tapState === "declined" ? "#EF4444" : tapState === "processing" ? P : P + "20",
            border: `3px solid ${tapState === "idle" ? P : tapState === "approved" ? GREEN : tapState === "declined" ? "#EF4444" : "#9585EA"}`,
            boxShadow: tapState === "idle" && pulseRing
              ? `0 0 0 12px ${P}20, 0 0 0 24px ${P}10`
              : tapState === "processing" ? `0 0 30px ${P}60` : "none",
            transform: tapState === "processing" ? "scale(0.95)" : "scale(1)",
          }}
        >
          {tapState === "processing" && (
            <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {tapState === "approved" && <CheckCircle className="w-10 h-10 text-white" />}
          {tapState === "declined"  && <X className="w-10 h-10 text-white" />}
          {tapState === "idle" && (
            <>
              <span className="text-3xl">📱</span>
              <span className="text-white font-black text-[10px] mt-1 tracking-wide">TAP CARD</span>
            </>
          )}
        </div>

        {tapState === "idle" && <p className="text-white/40 text-[10px] text-center">Passenger taps Vink card to pay fare</p>}
        {tapState === "processing" && <p className="text-purple-300 text-xs animate-pulse">Processing payment…</p>}
        {tapState === "approved" && lastTap && (
          <div className="text-center space-y-1">
            <p className="text-green-400 font-black">✓ FARE PAID</p>
            <p className="text-white font-bold text-lg">{fmt(lastTap.fare)}</p>
            <p className="text-white/50 text-[10px]">Processed in {lastTap.ms}ms</p>
            {lastTap.wifi && <p className="text-blue-400 text-[10px]">📶 WiFi session granted</p>}
          </div>
        )}
        {tapState === "declined" && (
          <div className="text-center">
            <p className="text-red-400 font-black">PAYMENT DECLINED</p>
            <p className="text-white/50 text-[10px] mt-1">Ask passenger to top up Vink card</p>
          </div>
        )}
      </div>

      {/* Revenue split breakdown */}
      {tapState === "approved" && lastTap && (
        <div className="px-4 pb-4 space-y-1.5 border-t border-white/5 pt-3">
          <p className="text-white/40 text-[9px] uppercase tracking-widest mb-2">Revenue Split</p>
          {[
            { label: "Driver (85%)",       amount: +(lastTap.fare * 0.85).toFixed(2), color: GREEN },
            { label: "Association (5%)",   amount: +(lastTap.fare * 0.05).toFixed(2), color: "#3B82F6" },
            { label: "Neighbourhood (5%)", amount: +(lastTap.fare * 0.05).toFixed(2), color: "#F59E0B" },
            { label: "Community Bank (5%)",amount: +(lastTap.fare * 0.05).toFixed(2), color: "#8B5CF6" },
          ].map(s => (
            <div key={s.label} className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-white/60 text-[10px]">{s.label}</span>
              </div>
              <span className="font-black text-[11px]" style={{ color: s.color }}>+{fmt(s.amount)}</span>
            </div>
          ))}
          <div className="border-t border-white/10 pt-1.5 flex justify-between">
            <span className="text-white/40 text-[9px]">VMS fee</span>
            <span className="text-white/40 text-[9px]">R0.50</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-0 border-t border-white/5">
        {[
          { label: "Taps Today",   value: tapCount.toString() },
          { label: "Revenue",      value: `R${revenue.toFixed(0)}` },
          { label: "Passengers",   value: device.passengers.toString() },
        ].map(s => (
          <div key={s.label} className="text-center py-3 border-r border-white/5 last:border-0">
            <p className="text-white font-black text-base">{s.value}</p>
            <p className="text-white/40 text-[9px]">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function AFCManagementDashboard({ isOpen, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>("overview");
  const [selectedDevice, setSelectedDevice] = useState(DEVICES[0]);
  const [liveFeed, setLiveFeed] = useState<LiveTap[]>([]);
  const [frozenDevices, setFrozenDevices] = useState<Set<string>>(new Set());

  const handleTap = useCallback((tap: LiveTap) => {
    setLiveFeed(prev => [tap, ...prev].slice(0, 50));
  }, []);

  const totalOnline = DEVICES.filter(d => d.status === "online").length;
  const totalTodayTaps = DEVICES.reduce((s, d) => s + d.todayTaps, 0) + liveFeed.filter(t => t.result === "approved").length;
  const totalTodayRev  = DEVICES.reduce((s, d) => s + d.todayRevenue, 0) + liveFeed.filter(t => t.result === "approved").reduce((s, t) => s + t.fare, 0);
  const approvalRate   = liveFeed.length > 0 ? Math.round((liveFeed.filter(t => t.result === "approved").length / liveFeed.length) * 100) : 94;

  if (!isOpen) return null;

  const NAV: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "overview",  label: "Overview",       icon: <Activity className="w-4 h-4" /> },
    { id: "devices",   label: "Devices",        icon: <Radio className="w-4 h-4" /> },
    { id: "terminal",  label: "Live Terminal",  icon: <Zap className="w-4 h-4" /> },
    { id: "wallets",   label: "Driver Wallets", icon: <TrendingUp className="w-4 h-4" /> },
    { id: "routes",    label: "Routes & Fares", icon: <MapPin className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics",      icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0A0A14" }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: "#0F0F1A" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: P }}>
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-black text-white leading-none">AFC Device Management</p>
            <p className="text-[10px] text-white/40 mt-0.5">Automated Fare Collection · {totalOnline}/{DEVICES.length} devices online · VMS fee R0.50/tap</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-xs text-green-400 font-semibold bg-green-400/10 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {totalOnline} devices online
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ── */}
        <aside className="w-48 flex-shrink-0 border-r border-white/5 flex flex-col py-3 px-2 overflow-y-auto"
          style={{ background: "#0A0A14" }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setScreen(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left text-sm font-medium mb-0.5"
              style={{ background: screen === item.id ? P + "30" : "transparent", color: screen === item.id ? GOLD : "rgba(255,255,255,.5)", fontWeight: screen === item.id ? 700 : 400 }}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}

          {/* Live feed mini */}
          <div className="mt-auto mx-1 mb-1 space-y-1.5">
            <p className="text-[9px] text-white/30 uppercase tracking-widest px-1">Live Taps</p>
            {liveFeed.slice(0, 5).map((tap, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: tap.result === "approved" ? GREEN + "15" : "#EF444415" }}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tap.result === "approved" ? GREEN : "#EF4444" }} />
                <div className="min-w-0">
                  <p className="text-white/70 text-[9px] truncate">{tap.device}</p>
                  <p className="text-[9px] font-bold" style={{ color: tap.result === "approved" ? GREEN : "#EF4444" }}>
                    {tap.result === "approved" ? `+${fmt(tap.fare)}` : "Declined"}
                  </p>
                </div>
              </div>
            ))}
            {liveFeed.length === 0 && <p className="text-white/20 text-[10px] px-1">No taps yet — use Terminal to simulate</p>}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 overflow-y-auto p-5" style={{ background: "#0A0A14" }}>

          {/* ══ OVERVIEW ══════════════════════════════════════════════════ */}
          {screen === "overview" && (
            <div className="space-y-5 max-w-5xl">
              {/* Hero concept card */}
              <div className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg,${P} 0%,#3d1d63 50%,#7B4DB5 100%)` }}>
                <div className="p-5 relative overflow-hidden">
                  <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
                  <p className="text-white/60 text-[9px] uppercase tracking-widest mb-2">How It Works</p>
                  <h2 className="text-white font-black text-xl mb-3">Passenger Taps → Driver Gets Paid Instantly</h2>
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    {["📱 Passenger taps Vink card", "→", "🔑 Device ref number routes payment", "→", "💰 Driver wallet credited instantly", "→", "📶 WiFi session granted"].map((s, i) => (
                      <span key={i} className={s === "→" ? "text-white/30" : "text-white/80 bg-white/10 px-2 py-0.5 rounded-full text-[11px]"}>{s}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {[
                      { pct: "85%", label: "Driver", color: GREEN },
                      { pct: "5%",  label: "Association", color: "#3B82F6" },
                      { pct: "5%",  label: "Neighbourhood Watch", color: GOLD },
                      { pct: "5%",  label: "Community Bank Fund", color: "#8B5CF6" },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,.1)" }}>
                        <p className="font-black text-xl" style={{ color: s.color }}>{s.pct}</p>
                        <p className="text-white/60 text-[9px] leading-tight mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Online Devices",    value: `${totalOnline}/${DEVICES.length}`,       sub: "All routes active",   color: GREEN,    icon: <Radio className="w-5 h-5" /> },
                  { label: "Taps Today",        value: totalTodayTaps.toString(),                sub: "Passenger payments",  color: P,        icon: <Zap className="w-5 h-5" /> },
                  { label: "Revenue Today",     value: fmtM(totalTodayRev),                      sub: "Across all devices",  color: GOLD,     icon: <TrendingUp className="w-5 h-5" /> },
                  { label: "Approval Rate",     value: `${approvalRate}%`,                       sub: "Tap success rate",    color: "#10B981", icon: <CheckCircle className="w-5 h-5" /> },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "#1A1A2E" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: k.color + "30" }}>
                      <span style={{ color: k.color }}>{k.icon}</span>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40">{k.label}</p>
                      <p className="text-xl font-black text-white">{k.value}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{k.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Device grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {DEVICES.map(d => (
                  <div key={d.id} className="rounded-2xl p-4 cursor-pointer hover:border-purple-600 transition-all"
                    style={{ background: "#1A1A2E", border: `1px solid ${d.status === "online" ? "#2D2A4A" : "#4A1010"}` }}
                    onClick={() => { setSelectedDevice(d); setScreen("terminal"); }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: d.status === "online" ? GREEN : "#EF4444" }} />
                          <p className="text-white font-black text-sm">{d.ref}</p>
                        </div>
                        <p className="text-white/50 text-xs">{d.driver}</p>
                        <p className="text-white/30 text-[10px]">{d.plate} · {d.make}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-yellow-400 font-black text-lg">{fmt(d.fare)}</p>
                        <p className="text-white/30 text-[9px]">per tap</p>
                      </div>
                    </div>
                    <p className="text-white/40 text-[10px] truncate mb-3">{d.route}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {d.wifi && <Wifi className="w-3.5 h-3.5 text-blue-400" />}
                        <SignalBars bars={d.signal} />
                        <BatteryIcon pct={d.battery} />
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-bold text-sm">{d.todayTaps} taps</p>
                        <p className="text-white/40 text-[10px]">{fmt(d.todayRevenue)} today</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ DEVICES ══════════════════════════════════════════════════ */}
          {screen === "devices" && (
            <div className="space-y-4 max-w-5xl">
              <p className="text-white font-black text-lg">Registered AFC Devices</p>
              <div className="space-y-3">
                {DEVICES.map(d => (
                  <div key={d.id} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "#1A1A2E", border: "1px solid #2D2A4A" }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl"
                      style={{ background: d.status === "online" ? GREEN + "20" : "#EF444420" }}>
                      🚌
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-white font-black">{d.ref}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: d.status === "online" ? GREEN + "20" : "#EF444420", color: d.status === "online" ? GREEN : "#EF4444" }}>
                          {d.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-white/50 text-xs">{d.driver} · {d.plate}</p>
                      <p className="text-white/30 text-[10px]">{d.route} · {d.assoc}</p>
                    </div>
                    <div className="text-center hidden md:block">
                      <p className="text-white/40 text-[9px]">Fare</p>
                      <p className="text-yellow-400 font-black">{fmt(d.fare)}</p>
                    </div>
                    <div className="text-center hidden md:block">
                      <p className="text-white/40 text-[9px]">Today Taps</p>
                      <p className="text-green-400 font-black">{d.todayTaps}</p>
                    </div>
                    <div className="text-center hidden md:block">
                      <p className="text-white/40 text-[9px]">Revenue</p>
                      <p className="text-white font-black text-sm">{fmt(d.todayRevenue)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <SignalBars bars={d.signal} />
                      <BatteryIcon pct={d.battery} />
                    </div>
                    <button onClick={() => { setSelectedDevice(d); setScreen("terminal"); }}
                      className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                      style={{ background: P }}>
                      Open Terminal
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ TERMINAL ══════════════════════════════════════════════════ */}
          {screen === "terminal" && (
            <div className="max-w-5xl space-y-4">
              <div className="flex items-center gap-3">
                <p className="text-white font-black text-lg">Live AFC Terminal</p>
                <span className="text-[10px] text-white/40">Select a device below and click TAP to simulate a passenger payment</span>
              </div>
              {/* Device selector */}
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {DEVICES.filter(d => d.status === "online").map(d => (
                  <button key={d.id} onClick={() => setSelectedDevice(d)}
                    className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={{ background: selectedDevice.id === d.id ? P : "#1A1A2E", color: selectedDevice.id === d.id ? "#fff" : "rgba(255,255,255,.5)", border: `1px solid ${selectedDevice.id === d.id ? P : "transparent"}` }}>
                    {d.ref} · {d.driver.split(" ")[0]}
                  </button>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                {/* Terminal */}
                <AFCTerminal device={selectedDevice} onTap={handleTap} />
                {/* Live feed */}
                <div className="rounded-2xl overflow-hidden" style={{ background: "#1A1A2E", border: "1px solid #2D2A4A" }}>
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <p className="text-white font-bold text-sm">Live Transaction Feed</p>
                    <Activity className="w-4 h-4 text-white/30 animate-pulse" />
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
                    {liveFeed.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <Zap className="w-10 h-10 text-white/20 mb-3" />
                        <p className="text-white/30 text-sm">Tap the terminal to simulate a passenger payment</p>
                      </div>
                    )}
                    {liveFeed.map((tap, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: tap.result === "approved" ? GREEN + "30" : "#EF444430" }}>
                          {tap.result === "approved" ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <X className="w-3.5 h-3.5 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white/80 text-xs font-semibold">Card •••• {tap.card}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-white/40 text-[9px]">{tap.device}</span>
                            <span className="text-white/20 text-[9px]">·</span>
                            <span className="text-white/40 text-[9px]">{tap.ms}ms</span>
                            {tap.wifi && <span className="text-blue-400 text-[9px]">📶 WiFi</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-sm" style={{ color: tap.result === "approved" ? GREEN : "#EF4444" }}>
                            {tap.result === "approved" ? fmt(tap.fare) : "DECLINED"}
                          </p>
                          <p className="text-white/30 text-[9px]">{tap.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {liveFeed.length > 0 && (
                    <div className="px-4 py-3 border-t border-white/5 grid grid-cols-3 gap-3">
                      {[
                        { label: "Total Taps",  value: liveFeed.length.toString(), color: "white" },
                        { label: "Approved",    value: liveFeed.filter(t => t.result === "approved").length.toString(), color: GREEN },
                        { label: "Revenue",     value: fmtM(liveFeed.filter(t => t.result === "approved").reduce((s, t) => s + t.fare, 0)), color: GOLD },
                      ].map(s => (
                        <div key={s.label} className="text-center">
                          <p className="font-black" style={{ color: s.color }}>{s.value}</p>
                          <p className="text-white/40 text-[9px]">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ WALLETS ═══════════════════════════════════════════════════ */}
          {screen === "wallets" && (
            <div className="space-y-4 max-w-4xl">
              <p className="text-white font-black text-lg">Driver Wallets</p>
              <div className="rounded-2xl p-4" style={{ background: "#1A1A2E" }}>
                <p className="text-white/50 text-xs leading-relaxed">
                  Each driver has a Vink Driver Wallet linked to their AFC device via the device's reference number. When a passenger taps, 85% of the fare is credited instantly. Drivers can withdraw to any SA bank account or use the balance directly for fuel, groceries, and bill payments.
                </p>
              </div>
              <div className="space-y-3">
                {WALLETS.map((w, i) => (
                  <div key={i} className="rounded-2xl p-5 flex items-center gap-4" style={{ background: "#1A1A2E", border: "1px solid #2D2A4A" }}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                      style={{ background: `hsl(${i * 60}, 60%, 45%)` }}>
                      {w.driver.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-black">{w.driver}</p>
                      <p className="text-white/40 text-xs">{w.ref}</p>
                      <p className="text-white/30 text-[10px] mt-0.5">{w.bank}</p>
                    </div>
                    <div className="text-center hidden sm:block">
                      <p className="text-white/40 text-[9px]">Today</p>
                      <p className="text-green-400 font-black text-sm">{fmt(w.today)}</p>
                    </div>
                    <div className="text-center hidden md:block">
                      <p className="text-white/40 text-[9px]">This Week</p>
                      <p className="text-white font-bold text-sm">{fmt(w.week)}</p>
                    </div>
                    <div className="text-center hidden md:block">
                      <p className="text-white/40 text-[9px]">Total Taps</p>
                      <p className="text-purple-400 font-bold text-sm">{w.taps.toLocaleString()}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white/40 text-[9px]">Balance</p>
                      <p className="text-yellow-400 font-black text-xl">{fmt(w.balance)}</p>
                      {w.payout && <p className="text-green-400 text-[9px] mt-0.5">Auto-payout ON</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ ROUTES ════════════════════════════════════════════════════ */}
          {screen === "routes" && (
            <div className="space-y-4 max-w-4xl">
              <p className="text-white font-black text-lg">Routes &amp; Fare Schedule</p>
              <div className="space-y-3">
                {[
                  { name: "Khayelitsha → Cape Town CBD",   fare: 14.00, peak: 16.00, devices: 1, km: 28, mins: 45 },
                  { name: "Mitchell's Plain → Bellville",  fare: 11.50, peak: 13.00, devices: 1, km: 18, mins: 35 },
                  { name: "Gugulethu → Claremont",         fare: 13.00, peak: 15.00, devices: 1, km: 14, mins: 30 },
                  { name: "Langa → Observatory",           fare: 10.00, peak: 12.00, devices: 1, km: 12, mins: 25 },
                  { name: "Nyanga → Wynberg",              fare: 12.50, peak: 14.00, devices: 1, km: 10, mins: 22 },
                  { name: "Soweto → Johannesburg CBD",     fare: 16.00, peak: 18.00, devices: 1, km: 22, mins: 40 },
                  { name: "Cape Town → Stellenbosch",      fare: 45.00, peak: 50.00, devices: 0, km: 52, mins: 60 },
                  { name: "Lusaka → Kitwe (Zambia)",       fare: 95.00, peak: 110.00,devices: 0, km: 320, mins: 240 },
                ].map((r, i) => (
                  <div key={i} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "#1A1A2E", border: "1px solid #2D2A4A" }}>
                    <MapPin className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold">{r.name}</p>
                      <p className="text-white/40 text-xs mt-0.5">{r.km}km · ~{r.mins} min · {r.devices} active device{r.devices !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-center flex-shrink-0">
                      <p className="text-white/40 text-[9px]">Standard</p>
                      <p className="text-yellow-400 font-black text-lg">{fmt(r.fare)}</p>
                    </div>
                    <div className="text-center flex-shrink-0">
                      <p className="text-white/40 text-[9px]">Peak</p>
                      <p className="text-orange-400 font-bold">{fmt(r.peak)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ ANALYTICS ═════════════════════════════════════════════════ */}
          {screen === "analytics" && (
            <div className="space-y-5 max-w-4xl">
              <p className="text-white font-black text-lg">Platform Analytics</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Devices", value: DEVICES.length.toString(), color: P },
                  { label: "VMS Fee Today", value: `R${(totalTodayTaps * 0.50).toFixed(2)}`, color: GOLD, note: "R0.50 × taps" },
                  { label: "Driver Payouts", value: fmtM(totalTodayRev * 0.85), color: GREEN },
                  { label: "Community Fund", value: fmtM(totalTodayRev * 0.10), color: "#8B5CF6" },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl p-4 text-center" style={{ background: "#1A1A2E" }}>
                    <p className="text-white/40 text-[10px]">{k.label}</p>
                    <p className="font-black text-2xl mt-1" style={{ color: k.color }}>{k.value}</p>
                    {k.note && <p className="text-white/30 text-[9px] mt-0.5">{k.note}</p>}
                  </div>
                ))}
              </div>

              {/* Revenue model */}
              <div className="rounded-2xl p-5" style={{ background: "#1A1A2E" }}>
                <p className="text-white font-black mb-4">VMS Revenue Model — AFC</p>
                <div className="space-y-3">
                  {[
                    { stream: "Transaction fee (R0.50/tap)",     daily: totalTodayTaps * 0.50,           note: "Lowest in industry — charged per tap" },
                    { stream: "WiFi session revenue",            daily: liveFeed.filter(t => t.wifi).length * 0.25, note: "Optional premium WiFi partnerships" },
                    { stream: "Interchange (0.5% of fare)",      daily: totalTodayRev * 0.005,            note: "Card network interchange income" },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div>
                        <p className="text-white/80 text-sm font-semibold">{r.stream}</p>
                        <p className="text-white/30 text-[10px]">{r.note}</p>
                      </div>
                      <p className="text-yellow-400 font-black">{fmt(r.daily)}/day</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-tap breakdown */}
              <div className="rounded-2xl p-5" style={{ background: "#1A1A2E" }}>
                <p className="text-white font-black mb-4">Per-Tap Revenue Split (R14 example fare)</p>
                <div className="space-y-2">
                  {[
                    { label: "Driver wallet",            amount: 11.90, pct: 85, color: GREEN },
                    { label: "Taxi Association",         amount: 0.70,  pct: 5,  color: "#3B82F6" },
                    { label: "Neighbourhood Watch",      amount: 0.70,  pct: 5,  color: GOLD },
                    { label: "Community Bank Fund",      amount: 0.70,  pct: 5,  color: "#8B5CF6" },
                    { label: "VMS transaction fee",      amount: 0.50,  pct: 3.5, color: P, note: "Fixed R0.50 — not from fare" },
                  ].map(r => (
                    <div key={r.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-white/70 text-xs">{r.label}</span>
                        <span className="font-black text-xs" style={{ color: r.color }}>{fmt(r.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(r.pct / 0.85, 100)}%`, background: r.color }} />
                      </div>
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
