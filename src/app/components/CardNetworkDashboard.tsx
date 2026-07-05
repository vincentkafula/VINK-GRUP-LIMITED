/**
 * Vink Card Network Integration Dashboard
 * Visa + Mastercard principal membership, BIN management,
 * AFC device payment processing, authorization, settlement & clearing.
 */
import { useState, useEffect, useRef } from "react";
import {
  X, CreditCard, CheckCircle, XCircle, RefreshCw, Zap,
  Shield, TrendingUp, BarChart3, Activity, Globe, AlertTriangle,
  Settings, Clock, DollarSign, Layers, ChevronRight,
} from "lucide-react";

interface Props { isOpen: boolean; onClose: () => void; }

const P = "#5B2D8E";
const VISA_BLUE = "#1A1F71";
const MC_RED = "#EB001B";
const MC_ORANGE = "#F79E1B";

// ─── BIN configuration ────────────────────────────────────────────────────────

const BIN_RANGES = [
  { id: "bin-za-visa",    network: "visa",        bin: "453999", country: "ZA", currency: "ZAR", cardType: "Debit",    tier: "Standard",  dailyLimit: 50000,  status: "active",   domesticRouting: true,  interchange: 0.85 },
  { id: "bin-za-mc",      network: "mastercard",  bin: "512345", country: "ZA", currency: "ZAR", cardType: "Debit",    tier: "Standard",  dailyLimit: 50000,  status: "active",   domesticRouting: true,  interchange: 0.80 },
  { id: "bin-eu-visa",    network: "visa",        bin: "477777", country: "EU", currency: "EUR", cardType: "Virtual",  tier: "Premium",   dailyLimit: 10000,  status: "active",   domesticRouting: true,  interchange: 0.30 },
  { id: "bin-us-visa",    network: "visa",        bin: "411111", country: "US", currency: "USD", cardType: "Business", tier: "Platinum",  dailyLimit: 100000, status: "active",   domesticRouting: true,  interchange: 1.50 },
  { id: "bin-us-mc",      network: "mastercard",  bin: "540000", country: "US", currency: "USD", cardType: "Business", tier: "Corporate", dailyLimit: 250000, status: "active",   domesticRouting: true,  interchange: 1.65 },
  { id: "bin-afc-visa",   network: "visa",        bin: "439999", country: "ZA", currency: "ZAR", cardType: "AFC Debit", tier: "Standard", dailyLimit: 5000,   status: "active",   domesticRouting: true,  interchange: 0.50 },
  { id: "bin-afc-mc",     network: "mastercard",  bin: "519999", country: "ZA", currency: "ZAR", cardType: "AFC Debit", tier: "Standard", dailyLimit: 5000,   status: "active",   domesticRouting: true,  interchange: 0.50 },
];

// ─── Recent authorizations ────────────────────────────────────────────────────

const genAuth = (overrides?: Partial<Record<string,unknown>>) => ({
  id: Math.random().toString(36).slice(2, 10).toUpperCase(),
  timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
  pan: `•••• •••• •••• ${Math.floor(1000 + Math.random() * 9000)}`,
  network: Math.random() > 0.5 ? "visa" : "mastercard",
  amount: +(Math.random() * 500 + 5).toFixed(2),
  currency: "ZAR",
  merchantName: ["Shoprite", "Shell Garage", "Pick n Pay", "Taxi AFC Route 1", "Planet Fitness", "Amazon ZA"][Math.floor(Math.random() * 6)],
  mcc: ["5411","5541","5411","7511","7997","5961"][Math.floor(Math.random() * 6)],
  authCode: Math.random() > 0.05 ? Math.floor(100000 + Math.random() * 900000).toString() : null,
  responseCode: Math.random() > 0.05 ? "00" : "05",
  status: Math.random() > 0.05 ? "approved" : "declined",
  channel: Math.random() > 0.3 ? "contactless" : Math.random() > 0.5 ? "chip" : "online",
  processingTime: Math.floor(200 + Math.random() * 2800),
  interchangeEarned: +(Math.random() * 8).toFixed(2),
  domesticRouted: Math.random() > 0.08,
  ...overrides,
});

const INITIAL_AUTHS = Array.from({ length: 18 }, () => genAuth());

// ─── Settlement batches ───────────────────────────────────────────────────────

const SETTLEMENTS = [
  { id: "STL-20240621-01", network: "visa",       date: "2024-06-21", txnCount: 4847, volume: 1284720.50, netAmount: 1273874.25, interchange: 10846.25, status: "settled",    settledAt: "2024-06-21T22:00:00Z" },
  { id: "STL-20240621-02", network: "mastercard", date: "2024-06-21", txnCount: 3219, volume: 892340.00,  netAmount: 884618.20, interchange: 7721.80,  status: "settled",    settledAt: "2024-06-21T22:30:00Z" },
  { id: "STL-20240620-01", network: "visa",       date: "2024-06-20", txnCount: 5124, volume: 1387220.00, netAmount: 1375440.12, interchange: 11779.88, status: "settled",   settledAt: "2024-06-20T22:00:00Z" },
  { id: "STL-20240620-02", network: "mastercard", date: "2024-06-20", txnCount: 3481, volume: 940880.00,  netAmount: 932594.72, interchange: 8285.28,  status: "settled",    settledAt: "2024-06-20T22:30:00Z" },
  { id: "STL-20240622-01", network: "visa",       date: "2024-06-22", txnCount: 1247, volume: 384500.00,  netAmount: null,      interchange: null,     status: "pending",    settledAt: null },
  { id: "STL-20240622-02", network: "mastercard", date: "2024-06-22", txnCount: 894,  volume: 248300.00,  netAmount: null,      interchange: null,     status: "in_progress", settledAt: null },
];

// ─── AFC EMV processing — 3 paths ─────────────────────────────────────────────

type EMVPath = "offline" | "online_fast" | "online_network";

const EMV_PATHS: Record<EMVPath, { label: string; color: string; totalMs: string; steps: { id: number; name: string; desc: string; icon: string; duration: number }[] }> = {
  offline: {
    label: "OFFLINE (EMV Offline Auth)", color: "#10B981", totalMs: "280–520ms",
    steps: [
      { id: 1, name: "NFC/Chip read",       desc: "ISO 14443 contactless — PAN, expiry, service code", icon: "📱", duration: 55 },
      { id: 2, name: "ARQC verify",         desc: "Offline cryptogram validated using issuer public key (on-device)", icon: "🔐", duration: 80 },
      { id: 3, name: "Floor limit check",   desc: "R14 < R500 floor limit → offline authorization permitted", icon: "⚡", duration: 15 },
      { id: 4, name: "Balance token check", desc: "Stored balance token confirms sufficient funds", icon: "💰", duration: 40 },
      { id: 5, name: "APPROVED",            desc: "Fare deducted · Queued for batch sync in 30 min", icon: "✅", duration: 10 },
    ],
  },
  online_fast: {
    label: "ONLINE FAST (VMS Internal)", color: "#3B82F6", totalMs: "600–900ms",
    steps: [
      { id: 1, name: "NFC/Chip read",         desc: "ISO 14443 contactless read", icon: "📱", duration: 55 },
      { id: 2, name: "Online ARQC generate",  desc: "Card demands online authorization", icon: "🔐", duration: 80 },
      { id: 3, name: "VMS auth request",      desc: "ISO 8583 → VMS via persistent WebSocket (no DNS, no TLS handshake)", icon: "⚡", duration: 45 },
      { id: 4, name: "Real-time balance",     desc: "VMS ledger balance check — sub-millisecond in-memory lookup", icon: "🏦", duration: 120 },
      { id: 5, name: "Auth response",         desc: "00 Approved + ARPC returned to terminal", icon: "📡", duration: 30 },
      { id: 6, name: "APPROVED",              desc: "R14.00 deducted · Real-time settlement · SMS queued", icon: "✅", duration: 15 },
    ],
  },
  online_network: {
    label: "NETWORK (Visa/MC Full Auth)", color: "#F59E0B", totalMs: "1.2–2.8s",
    steps: [
      { id: 1, name: "NFC/Chip read",         desc: "ISO 14443 contactless read", icon: "📱", duration: 55 },
      { id: 2, name: "Online ARQC generate",  desc: "Card demands full network authorization", icon: "🔐", duration: 80 },
      { id: 3, name: "VMS → VisaNet/Banknet", desc: "ISO 8583 auth request to Visa/MC network via leased line", icon: "📡", duration: 200 },
      { id: 4, name: "Network routing",       desc: "BIN lookup → issuer routing → host connection", icon: "🌐", duration: 350 },
      { id: 5, name: "Issuer decision",       desc: "Balance, fraud score, velocity checks at issuer host", icon: "🏦", duration: 400 },
      { id: 6, name: "Response → terminal",   desc: "Auth response decoded, ARPC verified, transaction complete", icon: "📡", duration: 180 },
      { id: 7, name: "APPROVED",              desc: "Fare deducted · Settlement file updated", icon: "✅", duration: 30 },
    ],
  },
};

// Keep legacy reference for type compatibility
const EMV_STEPS = EMV_PATHS.offline.steps;

type Screen = "overview" | "bins" | "authorizations" | "afc" | "settlement" | "interchange" | "fraud";

const NAV = [
  { id: "overview",       label: "Overview",          icon: <Layers className="w-4 h-4" /> },
  { id: "bins",           label: "BIN Management",    icon: <CreditCard className="w-4 h-4" /> },
  { id: "authorizations", label: "Authorizations",    icon: <Activity className="w-4 h-4" /> },
  { id: "afc",            label: "AFC Processing",    icon: <Zap className="w-4 h-4" /> },
  { id: "settlement",     label: "Settlement",        icon: <DollarSign className="w-4 h-4" /> },
  { id: "interchange",    label: "Interchange",       icon: <TrendingUp className="w-4 h-4" /> },
  { id: "fraud",          label: "Fraud & Risk",      icon: <Shield className="w-4 h-4" /> },
];

function NetworkBadge({ network }: { network: string }) {
  return network === "visa" ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded"
      style={{ background: VISA_BLUE, color: "#fff" }}>VISA</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded" style={{ background: "#F3F4F6" }}>
      <span style={{ color: MC_RED }}>●</span><span style={{ color: MC_ORANGE }}>●</span>
      <span className="text-gray-700">MC</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string }> = {
    approved: { color: "#10B981", bg: "#D1FAE5" },
    declined: { color: "#EF4444", bg: "#FEE2E2" },
    settled:  { color: "#10B981", bg: "#D1FAE5" },
    pending:  { color: "#F59E0B", bg: "#FEF3C7" },
    in_progress: { color: "#3B82F6", bg: "#DBEAFE" },
    active:   { color: "#10B981", bg: "#D1FAE5" },
    inactive: { color: "#9CA3AF", bg: "#F3F4F6" },
  };
  const c = cfg[status] ?? cfg.pending;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.color }}>{status.replace("_"," ")}</span>;
}

// ─── AFC Simulator ────────────────────────────────────────────────────────────

function AFCSimulator() {
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<"approved" | "declined" | null>(null);
  const [totalMs, setTotalMs] = useState(0);
  const [selectedPath, setSelectedPath] = useState<EMVPath>("offline");
  const timerRef = useRef<NodeJS.Timeout>();

  const runSimulation = () => {
    const pathConfig = EMV_PATHS[selectedPath];
    const steps = pathConfig.steps;
    setRunning(true);
    setCurrentStep(0);
    setResult(null);
    setTotalMs(0);
    let step = 0;
    let elapsed = 0;

    const advance = () => {
      step++;
      const dur = steps[step - 1]?.duration ?? 100;
      elapsed += dur + Math.floor(Math.random() * 20 - 10);
      setCurrentStep(step);
      setTotalMs(elapsed);
      if (step < steps.length) {
        timerRef.current = setTimeout(advance, steps[step]?.duration ?? 100);
      } else {
        setRunning(false);
        setResult(Math.random() > 0.05 ? "approved" : "declined");
      }
    };
    timerRef.current = setTimeout(advance, steps[0].duration);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const pathConfig = EMV_PATHS[selectedPath];
  const steps = pathConfig.steps;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-black text-gray-800">AFC Payment Simulator — 3-Second Guarantee</p>
        {totalMs > 0 && (
          <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: result === "approved" ? "#D1FAE5" : result === "declined" ? "#FEE2E2" : "#EDE9FE", color: result === "approved" ? "#059669" : result === "declined" ? "#DC2626" : P }}>
            {totalMs}ms {totalMs < 500 ? "⚡" : totalMs < 1000 ? "✓" : totalMs < 3000 ? "⚠" : "❌"}
          </span>
        )}
      </div>

      {/* Path selector */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(EMV_PATHS) as EMVPath[]).map(path => (
          <button key={path} onClick={() => !running && setSelectedPath(path)}
            className="rounded-xl p-2.5 text-center transition-all border-2"
            style={{ borderColor: selectedPath === path ? EMV_PATHS[path].color : "transparent", background: selectedPath === path ? EMV_PATHS[path].color + "12" : "#F8F7FF" }}>
            <p className="text-[10px] font-black" style={{ color: EMV_PATHS[path].color }}>{EMV_PATHS[path].label.split(" ")[0]}</p>
            <p className="text-[9px] text-gray-500 mt-0.5">{EMV_PATHS[path].totalMs}</p>
          </button>
        ))}
      </div>

      {/* Terminal visual */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#111120" }}>
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
          <div>
            <p className="text-white text-xs font-bold">AFC Terminal · Khayelitsha → CBD Route</p>
            <p className="text-white/40 text-[10px]">Device ID: AFC-CPT-00847 · Vink AFC v3.2.1</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-green-400 font-bold">● ONLINE</span>
            <NetworkBadge network="visa" />
            <NetworkBadge network="mastercard" />
          </div>
        </div>
        <div className="p-5 flex flex-col items-center gap-4">
          {/* Card visual */}
          <div className="relative w-48 h-28 rounded-xl flex items-end p-3"
            style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
            <div className="absolute top-3 left-3 w-7 h-5 rounded bg-yellow-400/70" />
            <div className="absolute top-3 right-3">
              {currentStep >= 2 ? <NetworkBadge network="visa" /> : <span className="text-white/40 text-xs">VINK</span>}
            </div>
            <div className="w-full">
              <p className="text-white/60 text-[9px] font-mono">•••• •••• •••• 4291</p>
              <div className="flex justify-between mt-0.5">
                <p className="text-white/60 text-[9px]">THABO NKOSI</p>
                <p className="text-white/60 text-[9px]">12/27</p>
              </div>
            </div>
            {running && currentStep >= 1 && currentStep <= 2 && (
              <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,0,0,.3)" }}>
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-green-400/40 border-t-green-400 rounded-full animate-spin mx-auto mb-1" />
                  <p className="text-green-400 text-[10px] font-bold">Reading…</p>
                </div>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="w-full space-y-1.5">
            {steps.map((step, i) => {
              const done = currentStep > i;
              const active = currentStep === i + 1 && running;
              return (
                <div key={step.id} className="flex items-center gap-3 rounded-lg px-3 py-2 transition-all"
                  style={{ background: active ? pathConfig.color + "20" : done ? "#10B98110" : "transparent" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm transition-all"
                    style={{ background: done ? "#10B981" : active ? pathConfig.color : "#374151" }}>
                    {done ? <CheckCircle className="w-3 h-3 text-white" /> : <span className="text-[10px] text-white font-bold">{step.id}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{step.name}</p>
                    {active && <p className="text-[10px] text-white/60 truncate">{step.desc}</p>}
                  </div>
                  <span className="text-[10px] text-white/40 flex-shrink-0">{step.duration}ms</span>
                  {active && <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />}
                </div>
              );
            })}
          </div>

          {/* Result */}
          {result && (
            <div className="w-full rounded-xl p-4 text-center" style={{ background: result === "approved" ? "#10B98120" : "#EF444420" }}>
              {result === "approved" ? (
                <>
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
                  <p className="text-green-400 font-black text-lg">FARE APPROVED</p>
                  <p className="text-white/70 text-sm mt-1">R14.00 deducted · Auth: {Math.floor(100000 + Math.random() * 900000)}</p>
                  <p className="text-white/40 text-[10px] mt-1">Total processing: {totalMs}ms · Visa/MC VisaNet · Domestic routing ✓</p>
                </>
              ) : (
                <>
                  <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
                  <p className="text-red-400 font-black text-lg">CARD DECLINED</p>
                  <p className="text-white/70 text-sm mt-1">Response: 05 — Do Not Honour</p>
                  <p className="text-white/40 text-[10px] mt-1">Insufficient balance or risk rule triggered</p>
                </>
              )}
            </div>
          )}

          <button onClick={runSimulation} disabled={running}
            className="w-full py-3 rounded-xl font-black text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: running ? "#374151" : `linear-gradient(135deg,${pathConfig.color},${pathConfig.color}CC)` }}>
            {running ? <><RefreshCw className="w-4 h-4 animate-spin" />Processing {pathConfig.totalMs}…</> : `▶ Simulate ${pathConfig.label.split("(")[0].trim()}`}
          </button>
        </div>
      </div>

      {/* EMV Standards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "EMV Chip", sub: "ISO/IEC 7816", color: VISA_BLUE },
          { label: "NFC/Tap", sub: "ISO/IEC 14443", color: P },
          { label: "ISO 8583", sub: "Auth messages", color: "#10B981" },
        ].map((s, i) => (
          <div key={i} className="rounded-xl p-3 text-center border border-gray-100 bg-white">
            <p className="text-xs font-black" style={{ color: s.color }}>{s.label}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Live authorizations feed ─────────────────────────────────────────────────

function AuthFeed() {
  const [auths, setAuths] = useState(INITIAL_AUTHS);

  useEffect(() => {
    const interval = setInterval(() => {
      setAuths(prev => [genAuth(), ...prev].slice(0, 25));
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <p className="text-sm font-black text-gray-800">Live Authorization Feed</p>
        <span className="flex items-center gap-1.5 text-xs text-green-600 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Live
        </span>
      </div>
      <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
        {auths.map((auth, i) => (
          <div key={auth.id} className={`flex items-center gap-3 px-4 py-2.5 transition-all ${i === 0 ? "bg-purple-50" : ""}`}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: auth.status === "approved" ? "#D1FAE5" : "#FEE2E2" }}>
              {auth.status === "approved"
                ? <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                : <XCircle className="w-3.5 h-3.5 text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-gray-800 truncate">{String(auth.merchantName)}</p>
                <NetworkBadge network={String(auth.network)} />
              </div>
              <p className="text-[10px] text-gray-400">{String(auth.pan)} · {String(auth.channel)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-black text-gray-900">R{Number(auth.amount).toFixed(2)}</p>
              <p className="text-[9px] text-gray-400">{Number(auth.processingTime)}ms · {String(auth.authCode ?? "DECLINED")}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function CardNetworkDashboard({ isOpen, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>("overview");
  const [interchangeAmt, setInterchangeAmt] = useState("1000");
  const [interchangeType, setInterchangeType] = useState("debit_domestic");

  if (!isOpen) return null;

  const IC_RATES: Record<string, { visa: number; mc: number; label: string }> = {
    debit_domestic:     { visa: 0.85, mc: 0.80, label: "Debit — Domestic" },
    debit_international:{ visa: 1.50, mc: 1.40, label: "Debit — International" },
    credit_standard:    { visa: 1.20, mc: 1.15, label: "Credit — Standard" },
    credit_premium:     { visa: 1.65, mc: 1.60, label: "Credit — Premium/Rewards" },
    business:           { visa: 1.80, mc: 1.75, label: "Business / Corporate" },
    afc_contactless:    { visa: 0.50, mc: 0.50, label: "AFC Contactless (Transport)" },
  };
  const icRate = IC_RATES[interchangeType];
  const visaIC  = (Number(interchangeAmt) * icRate.visa  / 100).toFixed(2);
  const mcIC    = (Number(interchangeAmt) * icRate.mc    / 100).toFixed(2);

  const totalSettledVol  = SETTLEMENTS.filter(s => s.status === "settled").reduce((s, t) => s + t.volume, 0);
  const totalInterchange = SETTLEMENTS.filter(s => s.status === "settled").reduce((s, t) => s + (t.interchange ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-8 h-5 rounded flex items-center justify-center text-white text-[9px] font-black" style={{ background: VISA_BLUE }}>VISA</div>
            <div className="w-8 h-5 rounded flex items-center justify-center" style={{ background: "#F3F4F6" }}>
              <span style={{ color: MC_RED, fontSize: 8, fontWeight: 900 }}>●</span>
              <span style={{ color: MC_ORANGE, fontSize: 8, fontWeight: 900, marginLeft: -2 }}>●</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-black text-gray-900 leading-none">Card Network Integration</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Visa + Mastercard · BIN Management · AFC Processing · Settlement</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
          <X className="w-5 h-5" />
        </button>
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
          <div className="mt-auto mx-1 mb-1 p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Network Status</p>
            {[
              { label: "VisaNet",    color: "#10B981" },
              { label: "Banknet",   color: "#10B981" },
              { label: "BIN Server",color: "#10B981" },
              { label: "HSM/Keys",  color: "#10B981" },
            ].map(s => (
              <div key={s.label} className="flex justify-between items-center">
                <span className="text-[11px] text-gray-600">{s.label}</span>
                <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: s.color }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: s.color }} />Online
                </span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-5 py-5">

          {/* ══ OVERVIEW ══ */}
          {screen === "overview" && (
            <div className="space-y-5 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">Card Network Overview</h1>

              {/* Network membership cards */}
              <div className="grid sm:grid-cols-2 gap-5">
                {/* Visa */}
                <div className="rounded-2xl overflow-hidden text-white shadow-lg" style={{ background: `linear-gradient(135deg,${VISA_BLUE},#2E3B8A)` }}>
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="bg-white rounded px-3 py-1 text-[14px] font-black italic" style={{ color: VISA_BLUE }}>VISA</div>
                      <span className="text-xs font-bold bg-green-500 px-2 py-0.5 rounded-full">Principal Member</span>
                    </div>
                    <p className="text-2xl font-black mb-1">Visa Principal Membership</p>
                    <p className="text-white/70 text-sm mb-4">Direct BIN sponsorship · VisaNet access · Global acceptance</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "BIN Ranges", value: `${BIN_RANGES.filter(b => b.network === "visa").length} active` },
                        { label: "Countries", value: "5" },
                        { label: "Card Types", value: "4" },
                      ].map((s, i) => (
                        <div key={i} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,.12)" }}>
                          <p className="text-lg font-black">{s.value}</p>
                          <p className="text-white/60 text-[10px] mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-1.5">
                      {["Visa Direct (push payments)", "Visa Secure (3DS2)", "Contactless / NFC", "Virtual card tokenisation", "VisaNet clearing & settlement"].map(f => (
                        <div key={f} className="flex items-center gap-2 text-xs text-white/80">
                          <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />{f}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mastercard */}
                <div className="rounded-2xl overflow-hidden text-white shadow-lg" style={{ background: "linear-gradient(135deg,#1A1A1A,#3A3A3A)" }}>
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full" style={{ background: MC_RED, marginRight: -10 }} />
                        <div className="w-8 h-8 rounded-full opacity-80" style={{ background: MC_ORANGE }} />
                      </div>
                      <span className="text-xs font-bold bg-green-500 px-2 py-0.5 rounded-full">Principal Member</span>
                    </div>
                    <p className="text-2xl font-black mb-1">Mastercard Membership</p>
                    <p className="text-white/70 text-sm mb-4">Direct BIN issuance · Banknet access · Global acceptance</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "BIN Ranges", value: `${BIN_RANGES.filter(b => b.network === "mastercard").length} active` },
                        { label: "Countries", value: "3" },
                        { label: "Card Types", value: "3" },
                      ].map((s, i) => (
                        <div key={i} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,.1)" }}>
                          <p className="text-lg font-black">{s.value}</p>
                          <p className="text-white/60 text-[10px] mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-1.5">
                      {["Mastercard Send (push payments)", "Mastercard Identity Check (3DS2)", "Contactless / NFC", "MDES token provisioning", "Banknet clearing & settlement"].map(f => (
                        <div key={f} className="flex items-center gap-2 text-xs text-white/80">
                          <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />{f}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total BINs Active",    value: BIN_RANGES.filter(b => b.status === "active").length.toString(), color: P },
                  { label: "24h Auth Volume",      value: "R4.8M",    color: VISA_BLUE },
                  { label: "Approval Rate",        value: "98.4%",    color: "#10B981" },
                  { label: "Avg Auth Time",        value: "840ms",    color: MC_RED },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Live feed */}
              <AuthFeed />
            </div>
          )}

          {/* ══ BIN MANAGEMENT ══ */}
          {screen === "bins" && (
            <div className="space-y-4 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">BIN (Bank Identification Number) Management</h1>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-800 leading-relaxed">
                <strong>How BINs work:</strong> Each Vink card type is assigned a BIN registered in its target country. When a payment is processed, the card network identifies the BIN and routes the transaction domestically — the acquiring bank sees it as a local card, eliminating cross-border fees. VMS holds Visa and Mastercard principal membership, allowing direct BIN assignment without a third-party BIN sponsor.
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100" style={{ background: "#F8F7FF" }}>
                        {["Network","BIN","Country","Currency","Card Type","Tier","Daily Limit","Routing","Interchange","Status"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wide text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {BIN_RANGES.map((bin, i) => (
                        <tr key={bin.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3"><NetworkBadge network={bin.network} /></td>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{bin.bin}xxxx</td>
                          <td className="px-4 py-3 text-xs">{bin.country}</td>
                          <td className="px-4 py-3 text-xs font-semibold">{bin.currency}</td>
                          <td className="px-4 py-3 text-xs">{bin.cardType}</td>
                          <td className="px-4 py-3 text-xs">{bin.tier}</td>
                          <td className="px-4 py-3 text-xs font-semibold">{bin.dailyLimit.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                              {bin.domesticRouting ? "🏠 Local" : "🌐 Intl"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-bold" style={{ color: P }}>{bin.interchange}%</td>
                          <td className="px-4 py-3"><StatusBadge status={bin.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══ AUTHORIZATIONS ══ */}
          {screen === "authorizations" && (
            <div className="space-y-4 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">Real-time Authorization Feed</h1>
              <AuthFeed />

              {/* ISO 8583 message example */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-3">ISO 8583 Authorization Request (Field Map)</p>
                <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs space-y-1 overflow-x-auto">
                  {[
                    ["F001", "MTI",           "0100 — Authorization Request"],
                    ["F002", "PAN",           "4539990012345678 (encrypted)"],
                    ["F003", "Processing Code","000000 — Purchase"],
                    ["F004", "Amount (Txn)",  "000000001400 — R14.00"],
                    ["F007", "Date/Time",     "0621143215"],
                    ["F011", "STAN",          "000847"],
                    ["F022", "POS Entry Mode","07 — EMV chip + PIN"],
                    ["F025", "POS Condition", "00 — Normal"],
                    ["F037", "Retrieval Ref", "622114321500"],
                    ["F041", "Terminal ID",   "AFC00847"],
                    ["F042", "Merchant ID",   "VMSAFC0012347"],
                    ["F043", "Merchant Name", "VMS AFC ROUTE ZA"],
                    ["F049", "Currency Code", "710 — ZAR"],
                    ["F055", "EMV Data",      "5F2A... (ARQC cryptogram)"],
                  ].map(([field, label, val]) => (
                    <div key={field} className="flex gap-4">
                      <span className="text-yellow-400 w-10 flex-shrink-0">{field}</span>
                      <span className="text-green-400 w-36 flex-shrink-0">{label}</span>
                      <span className="text-white/80">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ AFC PROCESSING ══ */}
          {screen === "afc" && (
            <div className="space-y-5 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">AFC Device — Visa/MC Payment Processing</h1>
              <AFCSimulator />
            </div>
          )}

          {/* ══ SETTLEMENT ══ */}
          {screen === "settlement" && (
            <div className="space-y-5 max-w-5xl">
              <h1 className="text-xl font-black text-gray-900">Settlement & Clearing</h1>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { label: "Total Settled (48h)", value: `R${(totalSettledVol/1000000).toFixed(1)}M`, color: "#10B981" },
                  { label: "Interchange Earned",  value: `R${(totalInterchange/1000).toFixed(0)}K`, color: P },
                  { label: "Pending Settlement",  value: `R${((384500+248300)/1000).toFixed(0)}K`, color: "#F59E0B" },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-3xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-black text-gray-800">Settlement Batches</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {["Batch ID","Network","Date","Txns","Volume","Interchange","Net Amount","Status"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SETTLEMENTS.map((s, i) => (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono font-bold text-gray-700">{s.id}</td>
                          <td className="px-4 py-3"><NetworkBadge network={s.network} /></td>
                          <td className="px-4 py-3 text-xs">{s.date}</td>
                          <td className="px-4 py-3 text-xs font-semibold">{s.txnCount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs font-bold text-gray-800">R{(s.volume/1000).toFixed(0)}K</td>
                          <td className="px-4 py-3 text-xs font-bold" style={{ color: P }}>
                            {s.interchange ? `R${(s.interchange/1000).toFixed(1)}K` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold text-gray-800">
                            {s.netAmount ? `R${(s.netAmount/1000).toFixed(0)}K` : "Pending"}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Settlement timeline */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Settlement Cycle — T+1 (Standard)</p>
                <div className="relative flex items-center gap-2 overflow-x-auto pb-2">
                  {[
                    { time: "00:00", label: "Batch closes", desc: "Day's transactions compiled", color: P },
                    { time: "01:00", label: "Net position", desc: "Interchange calculated", color: "#3B82F6" },
                    { time: "04:00", label: "VisaNet/Banknet", desc: "Clearing files exchanged", color: VISA_BLUE },
                    { time: "08:00", label: "RTGS payment", desc: "Funds transferred SA Reserve Bank", color: "#10B981" },
                    { time: "T+1",   label: "Funds available", desc: "Credited to VMS nostro account", color: "#10B981" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center">
                      <div className="flex flex-col items-center min-w-[100px]">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black"
                          style={{ background: step.color }}>{i + 1}</div>
                        <p className="text-xs font-bold mt-1 text-gray-800">{step.time}</p>
                        <p className="text-[10px] text-gray-600 text-center">{step.label}</p>
                        <p className="text-[9px] text-gray-400 text-center leading-tight mt-0.5">{step.desc}</p>
                      </div>
                      {i < 4 && <div className="w-8 h-0.5 flex-shrink-0" style={{ background: step.color + "60" }} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ INTERCHANGE ══ */}
          {screen === "interchange" && (
            <div className="space-y-5 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">Interchange Income Calculator</h1>

              <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
                <p className="text-sm text-gray-600 leading-relaxed">
                  <strong>Interchange</strong> is the fee paid by the merchant's bank (acquirer) to the card issuer (VMS) on every transaction. As a Visa/MC principal member, VMS earns interchange directly on every card transaction processed globally.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Transaction Amount (ZAR)</label>
                    <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-black outline-none focus:border-purple-400"
                      value={interchangeAmt} onChange={e => setInterchangeAmt(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Transaction Type</label>
                    <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-400"
                      value={interchangeType} onChange={e => setInterchangeType(e.target.value)}>
                      {Object.entries(IC_RATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl p-5 text-center" style={{ background: VISA_BLUE + "10", border: `2px solid ${VISA_BLUE}30` }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: VISA_BLUE }}>Visa Interchange ({icRate.visa}%)</p>
                    <p className="text-4xl font-black" style={{ color: VISA_BLUE }}>R{visaIC}</p>
                    <p className="text-xs text-gray-500 mt-1">per transaction</p>
                  </div>
                  <div className="rounded-2xl p-5 text-center border-2" style={{ borderColor: MC_RED + "30", background: MC_RED + "08" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MC_RED }}>Mastercard Interchange ({icRate.mc}%)</p>
                    <p className="text-4xl font-black" style={{ color: MC_RED }}>R{mcIC}</p>
                    <p className="text-xs text-gray-500 mt-1">per transaction</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">All Interchange Rates</p>
                <div className="space-y-2">
                  {Object.entries(IC_RATES).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <p className="text-sm text-gray-700 font-medium">{v.label}</p>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-black" style={{ color: VISA_BLUE }}>Visa {v.visa}%</span>
                        <span className="text-xs font-black" style={{ color: MC_RED }}>MC {v.mc}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ FRAUD & RISK ══ */}
          {screen === "fraud" && (
            <div className="space-y-5 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">Fraud Detection & Risk Rules</h1>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { label: "Transactions Checked", value: "18,470", color: P },
                  { label: "Fraud Alerts (24h)", value: "23", color: "#F59E0B" },
                  { label: "Blocked (24h)", value: "7", color: "#EF4444" },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-3xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Fraud rules */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-sm font-black text-gray-800 mb-4">Active Fraud Rules</p>
                <div className="space-y-3">
                  {[
                    { rule: "Velocity Check — Cards",     desc: ">5 txns in 60 seconds on same card",            action: "Block",   trigger: "High", network: "both" },
                    { rule: "Geo-impossible Travel",       desc: "Two txns >500km apart within 30 minutes",       action: "Alert",   trigger: "Critical", network: "both" },
                    { rule: "Large Amount Spike",          desc: "Txn >5× cardholder's 30-day average",          action: "3DS Challenge", trigger: "Medium", network: "visa" },
                    { rule: "Card Not Present Limit",     desc: "Online txn >R2,000 without 3DS",               action: "Decline", trigger: "High", network: "both" },
                    { rule: "BIN Attack Detection",       desc: ">20 different cards from same terminal in 1min",action: "Block + Alert", trigger: "Critical", network: "mc" },
                    { rule: "Counterfeit Mag Stripe",     desc: "Mag stripe txn on EMV-capable card at EMV term",action: "Decline", trigger: "Critical", network: "both" },
                    { rule: "AFC Fare Anomaly",           desc: "AFC fare >R200 (normal max R50)",               action: "Hold",    trigger: "Medium", network: "both" },
                    { rule: "After-Hours Large Withdraw", desc: "ATM withdrawal >R5,000 between 22:00–05:00",    action: "SMS Alert", trigger: "Low", network: "both" },
                  ].map((r, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:border-purple-100 hover:bg-purple-50 transition-all">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5"
                        style={{ color: r.trigger === "Critical" ? "#EF4444" : r.trigger === "High" ? "#F59E0B" : r.trigger === "Medium" ? "#3B82F6" : "#10B981" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-800">{r.rule}</p>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: r.trigger === "Critical" ? "#FEE2E2" : r.trigger === "High" ? "#FEF3C7" : r.trigger === "Medium" ? "#DBEAFE" : "#D1FAE5", color: r.trigger === "Critical" ? "#DC2626" : r.trigger === "High" ? "#D97706" : r.trigger === "Medium" ? "#1D4ED8" : "#059669" }}>
                            {r.trigger}
                          </span>
                          {r.network !== "both" && <NetworkBadge network={r.network} />}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{r.desc}</p>
                      </div>
                      <span className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded" style={{ background: "#EDE9FE", color: P }}>{r.action}</span>
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
