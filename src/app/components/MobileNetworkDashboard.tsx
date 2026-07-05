import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Activity, Users, Wifi, AlertTriangle, CheckCircle,
  Clock, TrendingUp, TrendingDown, Signal, Database, Shield,
  Phone, MessageSquare, CreditCard, Headphones, Globe, Radio,
  ChevronRight, Bell, Settings, BarChart3, Home, LogOut, Menu,
  RefreshCw, Zap, Key, Loader2, Smartphone, Monitor,
} from "lucide-react";
import {
  auth, kpis, network, alertsApi, fraud, provisioning,
  billing, support, interconnects, connectLiveFeed, setToken, getToken,
} from "../services/mvnoApi";
import { DemoModeBanner } from "./DemoModeBanner";
import { isDemoMode, setDemoMode, DEMO_TOKEN } from "../services/demoMode";

// ─── Types ───────────────────────────────────────────────────────────────────
interface KpiData { [key: string]: number | string }
interface AlertItem {
  id: string; component: string; title: string;
  message: string; severity: string; createdAt: string;
  resolvedAt: string | null; acknowledgedAt: string | null;
}

type PreviewMode = "web" | "mobile";
type MobileTab   = "home" | "network" | "alerts" | "billing" | "settings";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt    = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const ago    = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

// ─── Shared atoms ────────────────────────────────────────────────────────────
function Dot({ status }: { status: string }) {
  const c = status === "online" ? "#34d399" : status === "warning" ? "#fbbf24" : "#f87171";
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: c, boxShadow: `0 0 5px ${c}` }} />;
}
function SevBadge({ s }: { s: string }) {
  const m: Record<string, string> = { critical: "#EF4444", warning: "#F59E0B", info: "#3B82F6", resolved: "#10B981" };
  const c = m[s] ?? "#6B7280";
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase" style={{ background: c + "22", color: c, border: `1px solid ${c}44` }}>{s}</span>;
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, onClose, mode }: {
  onLogin: (t: string, u: { name: string; role: string }) => void;
  onClose: () => void;
  mode: PreviewMode;
}) {
  const [username, setUsername] = useState("noc1");
  const [password, setPassword] = useState("Noc@5678");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await auth.login(username, password);
      setToken(res.token);
      onLogin(res.token, res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg.includes("fetch") ? "Cannot reach backend — run: cd server && pnpm dev" : msg);
    } finally { setLoading(false); }
  };

  const compact = mode === "mobile";

  return (
    <div className={`flex-1 flex items-center justify-center ${compact ? "px-3 py-4" : "px-6"}`} style={{ background: "#0D0B1E" }}>
      <div className={`w-full ${compact ? "max-w-[320px]" : "max-w-sm"}`}>
        <div className={`text-center ${compact ? "mb-5" : "mb-8"}`}>
          <div className={`${compact ? "w-12 h-12" : "w-16 h-16"} rounded-2xl mx-auto flex items-center justify-center mb-3`}
            style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)" }}>
            <Radio className={compact ? "w-6 h-6 text-white" : "w-8 h-8 text-white"} />
          </div>
          <h1 className={`font-bold text-white ${compact ? "text-lg" : "text-2xl"}`}>MVNO Control</h1>
          <p className={`mt-0.5 ${compact ? "text-[11px]" : "text-sm"}`} style={{ color: "#8884AA" }}>Vink Network Operations</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl p-5 space-y-3"
          style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
          {[
            { label: "Username", value: username, set: setUsername, type: "text" },
            { label: "Password", value: password, set: setPassword, type: "password" },
          ].map(f => (
            <div key={f.label}>
              <label className={`block font-semibold mb-1 ${compact ? "text-[10px]" : "text-xs"}`} style={{ color: "#8884AA" }}>{f.label}</label>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} required
                className={`w-full rounded-lg px-3 text-white outline-none focus:ring-2 focus:ring-[#6B5ED7] ${compact ? "py-2 text-xs" : "py-2.5 text-sm"}`}
                style={{ background: "#252245", border: "1px solid #3D3A6A" }} />
            </div>
          ))}
          {error && (
            <div className="rounded-lg p-2.5 text-[11px]" style={{ background: "#EF444422", border: "1px solid #EF444444", color: "#FCA5A5" }}>{error}</div>
          )}
          <button type="submit" disabled={loading}
            className={`w-full rounded-lg font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 ${compact ? "py-2 text-xs" : "py-2.5 text-sm"}`}
            style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Signing in…</> : <><Key className="w-3.5 h-3.5" />Sign In</>}
          </button>
          <button type="button" onClick={() => { setDemoMode(true); setToken(DEMO_TOKEN); onLogin(DEMO_TOKEN, { name: "Demo Operator", role: "noc_engineer" }); }}
            className={`w-full rounded-lg font-semibold border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2 ${compact ? "py-1.5 text-[10px]" : "py-2.5 text-xs"}`}
            style={{ background: "transparent" }}>
            ⚡ Enter Demo Mode (no server needed)
          </button>
          <p className="text-center text-[10px]" style={{ color: "#5A5880" }}>noc1 / Noc@5678 · superadmin / Admin@1234</p>
        </form>
      </div>
    </div>
  );
}

// ─── PHONE FRAME ─────────────────────────────────────────────────────────────
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center flex-1 overflow-hidden py-6">
      {/* Outer device shell */}
      <div className="relative flex-shrink-0" style={{ width: 375, height: 780 }}>
        {/* Phone body */}
        <div className="absolute inset-0 rounded-[44px] shadow-2xl"
          style={{ background: "linear-gradient(145deg,#2a2a2e,#1a1a1e)", border: "2px solid #48484A", boxShadow: "0 40px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)" }}>

          {/* Side buttons left */}
          <div className="absolute left-0 top-[132px] w-[3px] h-8 rounded-l-sm" style={{ background: "#3a3a3c", marginLeft: "-3px" }} />
          <div className="absolute left-0 top-[182px] w-[3px] h-14 rounded-l-sm" style={{ background: "#3a3a3c", marginLeft: "-3px" }} />
          <div className="absolute left-0 top-[248px] w-[3px] h-14 rounded-l-sm" style={{ background: "#3a3a3c", marginLeft: "-3px" }} />
          {/* Side button right */}
          <div className="absolute right-0 top-[182px] w-[3px] h-20 rounded-r-sm" style={{ background: "#3a3a3c", marginRight: "-3px" }} />

          {/* Screen area */}
          <div className="absolute rounded-[38px] overflow-hidden"
            style={{ inset: 4, background: "#0D0B1E" }}>

            {/* Dynamic Island */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center"
              style={{ width: 120, height: 32, background: "#000", borderRadius: 20 }}>
              <div className="w-3 h-3 rounded-full" style={{ background: "#1a1a1a", border: "1px solid #333" }} />
            </div>

            {/* Status bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 pt-2 pb-0"
              style={{ height: 50 }}>
              <span className="text-white text-[11px] font-semibold" style={{ marginTop: 14 }}>
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <div className="flex items-center gap-1.5" style={{ marginTop: 14 }}>
                {/* Signal bars */}
                <svg viewBox="0 0 18 12" className="w-4 h-3 fill-white">
                  <rect x="0" y="8" width="3" height="4" rx="0.5" />
                  <rect x="4" y="5" width="3" height="7" rx="0.5" />
                  <rect x="8" y="2" width="3" height="10" rx="0.5" />
                  <rect x="12" y="0" width="3" height="12" rx="0.5" />
                </svg>
                {/* WiFi */}
                <svg viewBox="0 0 16 12" className="w-3.5 h-3 fill-white">
                  <path d="M8 9.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
                  <path d="M3.5 6.5a6.5 6.5 0 019 0l-1.5 1.5a4.5 4.5 0 00-6 0L3.5 6.5z" />
                  <path d="M0.5 3.5a10.5 10.5 0 0115 0l-1.5 1.5a8.5 8.5 0 00-12 0L0.5 3.5z" />
                </svg>
                {/* Battery */}
                <div className="flex items-center">
                  <div className="rounded-sm flex items-center px-0.5" style={{ width: 24, height: 12, border: "1px solid rgba(255,255,255,0.5)" }}>
                    <div className="rounded-sm" style={{ width: "76%", height: 8, background: "#34d399" }} />
                  </div>
                  <div className="rounded-r-sm ml-px" style={{ width: 2, height: 5, background: "rgba(255,255,255,0.4)" }} />
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="absolute overflow-y-auto overflow-x-hidden" style={{ inset: 0, paddingTop: 50, paddingBottom: 68 }}>
              {children}
            </div>

            {/* Home indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full" style={{ width: 120, height: 4, background: "rgba(255,255,255,0.35)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MOBILE DASHBOARD CONTENT ─────────────────────────────────────────────────
function MobileDashboardContent({
  kpiData, alerts, towerStats, callStats, fraudSum, provStats,
  supportStats, billingSum, liveConnected, loading, activeTab, setActiveTab,
  onLogout,
}: {
  kpiData: KpiData | null; alerts: AlertItem[];
  towerStats: { online: number; total: number; warning: number } | null;
  callStats: Record<string, number> | null;
  fraudSum: Record<string, unknown> | null;
  provStats: Record<string, number> | null;
  supportStats: Record<string, unknown> | null;
  billingSum: Record<string, unknown> | null;
  liveConnected: boolean; loading: boolean;
  activeTab: MobileTab; setActiveTab: (t: MobileTab) => void;
  onLogout: () => void;
}) {
  const kpiCards = [
    { label: "Subscribers", value: kpiData ? fmt(Number(kpiData.totalSubscribers)) : "…", color: "#6B5ED7", icon: <Users className="w-4 h-4" /> },
    { label: "Uptime",      value: kpiData ? `${Number(kpiData.networkUptimePct).toFixed(2)}%` : "…", color: "#10B981", icon: <Activity className="w-4 h-4" /> },
    { label: "Data Sessions", value: kpiData ? fmt(Number(kpiData.activeDataSessions)) : "…", color: "#3B82F6", icon: <Wifi className="w-4 h-4" /> },
    { label: "Revenue",     value: billingSum ? fmtUSD(Number(billingSum.totalRevenue)) : "…", color: "#F59E0B", icon: <TrendingUp className="w-4 h-4" /> },
    { label: "Alerts",      value: String(alerts.length), color: "#EF4444", icon: <AlertTriangle className="w-4 h-4" /> },
    { label: "Net Load",    value: kpiData ? `${kpiData.avgNetworkLoadPct}%` : "…", color: "#8B5CF6", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const nodes = [
    { id: "cell-towers",    label: "Cell Towers",          metric: towerStats ? `${towerStats.online}/${towerStats.total}` : "—", status: towerStats?.warning ? "warning" : "online",  color: "#D85A30", icon: <Radio className="w-4 h-4" /> },
    { id: "ran-gateway",    label: "RAN Gateway",          metric: kpiData ? `${Number(kpiData.dataThroughputGbps).toFixed(1)} Gbps` : "—", status: "online",  color: "#D85A30", icon: <Wifi className="w-4 h-4" /> },
    { id: "hlr-hss",        label: "HLR / HSS",            metric: kpiData ? fmt(Number(kpiData.totalSubscribers)) : "—",  status: "online",  color: "#534AB7", icon: <Database className="w-4 h-4" /> },
    { id: "msc",            label: "MSC / Switching",      metric: kpiData ? fmt(Number(kpiData.activeVoiceCalls)) : "—",  status: "online",  color: "#534AB7", icon: <Phone className="w-4 h-4" /> },
    { id: "packet-core",    label: "Packet Core",          metric: kpiData ? `${Number(kpiData.dataThroughputGbps).toFixed(1)} Gbps` : "—", status: Number(kpiData?.avgNetworkLoadPct) > 75 ? "warning" : "online", color: "#534AB7", icon: <Globe className="w-4 h-4" /> },
    { id: "smsc",           label: "SMSC",                 metric: "—",                status: "online",  color: "#534AB7", icon: <MessageSquare className="w-4 h-4" /> },
    { id: "billing",        label: "Billing / OSS-BSS",    metric: billingSum ? fmtUSD(Number(billingSum.totalRevenue)) : "—", status: "online", color: "#534AB7", icon: <CreditCard className="w-4 h-4" /> },
    { id: "fraud",          label: "Fraud / Security",     metric: fraudSum ? `${fraudSum.active} active` : "—", status: Number(fraudSum?.active) > 10 ? "warning" : "online", color: "#534AB7", icon: <Shield className="w-4 h-4" /> },
    { id: "sim-prov",       label: "SIM Provisioning",     metric: provStats ? fmt(provStats.active) : "—", status: "online", color: "#534AB7", icon: <Signal className="w-4 h-4" /> },
    { id: "cx",             label: "Customer Service",     metric: supportStats ? `${supportStats.open} open` : "—", status: "online", color: "#534AB7", icon: <Headphones className="w-4 h-4" /> },
    { id: "roaming",        label: "Roaming Partners",     metric: "82 partners",      status: "online",  color: "#0F6E56", icon: <Globe className="w-4 h-4" /> },
    { id: "carrier",        label: "Carrier Interconnect", metric: "99.96% avail",     status: "online",  color: "#0F6E56", icon: <Phone className="w-4 h-4" /> },
    { id: "regulator",      label: "Regulator / LI",       metric: "100% compliant",   status: "online",  color: "#0F6E56", icon: <Shield className="w-4 h-4" /> },
  ];

  const tabs: { id: MobileTab; icon: React.ReactNode; label: string }[] = [
    { id: "home",     icon: <Home className="w-5 h-5" />,     label: "Overview" },
    { id: "network",  icon: <Radio className="w-5 h-5" />,    label: "Network"  },
    { id: "alerts",   icon: <Bell className="w-5 h-5" />,     label: "Alerts"   },
    { id: "billing",  icon: <CreditCard className="w-5 h-5" />, label: "Billing" },
    { id: "settings", icon: <Settings className="w-5 h-5" />, label: "Settings" },
  ];

  return (
    <div className="flex flex-col min-h-full" style={{ background: "#0D0B1E", color: "white" }}>

      {/* App header */}
      <div className="px-4 pt-2 pb-3" style={{ background: "#13103A", borderBottom: "1px solid #2D2A50" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-medium" style={{ color: "#8884AA" }}>Vink MVNO</p>
            <p className="text-sm font-bold text-white">Network Operations</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${liveConnected ? "bg-emerald-400" : "bg-gray-500"}`}
              style={liveConnected ? { boxShadow: "0 0 6px #34d399" } : {}} />
            <span className="text-[10px]" style={{ color: "#8884AA" }}>{liveConnected ? "LIVE" : "OFFLINE"}</span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-3 py-3 space-y-3 pb-2">

        {/* HOME TAB */}
        {activeTab === "home" && (
          <>
            {/* KPI 2-col grid */}
            <div className="grid grid-cols-2 gap-2">
              {kpiCards.map((k, i) => (
                <div key={i} className="rounded-xl p-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-1.5 rounded-lg" style={{ background: k.color + "22", color: k.color }}>{k.icon}</div>
                  </div>
                  {loading && !kpiData ? (
                    <div className="h-5 w-16 rounded animate-pulse" style={{ background: "#2D2A50" }} />
                  ) : (
                    <p className="text-lg font-black text-white leading-none">{k.value}</p>
                  )}
                  <p className="text-[10px] mt-1" style={{ color: "#8884AA" }}>{k.label}</p>
                </div>
              ))}
            </div>

            {/* Recent alerts */}
            <div className="rounded-xl p-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <p className="text-xs font-bold text-white mb-2">Recent Alerts</p>
              {alerts.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 text-xs py-2">
                  <CheckCircle className="w-3.5 h-3.5" /><span>All clear</span>
                </div>
              ) : alerts.slice(0, 3).map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b last:border-0" style={{ borderColor: "#2D2A50" }}>
                  <div className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.severity === "critical" ? "bg-red-500" : a.severity === "warning" ? "bg-amber-400" : "bg-blue-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white leading-tight truncate">{a.message}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "#8884AA" }}>{a.component} · {ago(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Mini sparkline */}
            <div className="rounded-xl p-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <p className="text-xs font-bold text-white mb-2">Traffic (24h)</p>
              <div className="flex items-end gap-0.5 h-10">
                {Array.from({ length: 24 }, (_, i) => 30 + Math.sin(i / 3) * 25 + Math.random() * 15).map((h, i) => (
                  <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(5, h)}%`, background: i === 23 ? "#9585EA" : "#534AB755" }} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* NETWORK TAB */}
        {activeTab === "network" && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: "#534AB7" }}>Host MNO</p>
            {nodes.slice(0, 2).map(n => <NodeRow key={n.id} n={n} />)}
            <p className="text-[10px] font-bold uppercase tracking-wider px-1 pt-1" style={{ color: "#534AB7" }}>Core Network</p>
            {nodes.slice(2, 10).map(n => <NodeRow key={n.id} n={n} />)}
            <p className="text-[10px] font-bold uppercase tracking-wider px-1 pt-1" style={{ color: "#0F6E56" }}>External</p>
            {nodes.slice(10).map(n => <NodeRow key={n.id} n={n} />)}
          </div>
        )}

        {/* ALERTS TAB */}
        {activeTab === "alerts" && (
          <div className="space-y-2">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2" style={{ color: "#8884AA" }}>
                <CheckCircle className="w-8 h-8 text-emerald-400" />
                <p className="text-xs">No active alerts</p>
              </div>
            ) : alerts.map((a, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-white truncate flex-1 mr-2">{a.title || a.component}</p>
                  <SevBadge s={a.severity} />
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: "#9896B8" }}>{a.message}</p>
                <p className="text-[9px] mt-1" style={{ color: "#5A5880" }}>{a.component} · {ago(a.createdAt)}</p>
              </div>
            ))}
          </div>
        )}

        {/* BILLING TAB */}
        {activeTab === "billing" && (
          <div className="space-y-2">
            {[
              { label: "Total Revenue", value: billingSum ? fmtUSD(Number(billingSum.totalRevenue)) : "—", color: "#F59E0B" },
              { label: "Paid Invoices", value: billingSum ? String(billingSum.paidInvoices) : "—", color: "#10B981" },
              { label: "Overdue", value: billingSum ? String(billingSum.overdueInvoices) : "—", color: "#EF4444" },
              { label: "AR Outstanding", value: billingSum ? fmtUSD(Number(billingSum.arOutstanding)) : "—", color: "#8B5CF6" },
            ].map((s, i) => (
              <div key={i} className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                <p className="text-xs" style={{ color: "#8884AA" }}>{s.label}</p>
                <p className="text-sm font-black" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="space-y-2">
            {[
              { label: "Account", sub: "noc1 · NOC Engineer" },
              { label: "API Endpoint", sub: "http://localhost:3001" },
              { label: "WebSocket", sub: liveConnected ? "Connected" : "Disconnected" },
              { label: "Build", sub: "v1.1.0 · MVNO Backend" },
            ].map((s, i) => (
              <div key={i} className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                <div>
                  <p className="text-xs font-semibold text-white">{s.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#8884AA" }}>{s.sub}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5" style={{ color: "#534AB7" }} />
              </div>
            ))}
            <button onClick={onLogout}
              className="w-full rounded-xl p-3 flex items-center justify-center gap-2 text-xs font-semibold text-red-400"
              style={{ background: "#EF444411", border: "1px solid #EF444433" }}>
              <LogOut className="w-4 h-4" />Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div className="flex-shrink-0 flex items-center justify-around px-2 pt-2 pb-1"
        style={{ background: "#13103A", borderTop: "1px solid #2D2A50" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors"
            style={{ color: activeTab === t.id ? "#9585EA" : "#5A5880" }}>
            {t.icon}
            <span className="text-[9px] font-medium">{t.label}</span>
            {t.id === "alerts" && alerts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function NodeRow({ n }: { n: { label: string; metric: string; status: string; color: string; icon: React.ReactNode } }) {
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-center gap-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <div className="p-1.5 rounded-lg flex-shrink-0" style={{ background: n.color + "22", color: n.color }}>{n.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white truncate">{n.label}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <p className="text-[11px] font-bold" style={{ color: n.color }}>{n.metric}</p>
        <Dot status={n.status} />
      </div>
    </div>
  );
}

// ─── WEB DASHBOARD CONTENT ────────────────────────────────────────────────────
const WEB_NAV = [
  { icon: <Home className="w-4 h-4" />,       label: "Overview"        },
  { icon: <Radio className="w-4 h-4" />,      label: "Radio Access"    },
  { icon: <Database className="w-4 h-4" />,   label: "Core Network"    },
  { icon: <Globe className="w-4 h-4" />,      label: "Interconnects"   },
  { icon: <Users className="w-4 h-4" />,      label: "Subscribers"     },
  { icon: <CreditCard className="w-4 h-4" />, label: "Billing & OSS"   },
  { icon: <Shield className="w-4 h-4" />,     label: "Fraud & Security" },
  { icon: <BarChart3 className="w-4 h-4" />,  label: "Analytics"       },
  { icon: <Bell className="w-4 h-4" />,       label: "Alerts"          },
  { icon: <Settings className="w-4 h-4" />,   label: "Settings"        },
];

function WebDashboard({
  kpiData, alerts, alertSummary, towerStats, fraudSum, provStats,
  supportStats, billingSum, interSum, liveConnected, loading, kpiHistory,
  onLogout, onRefresh,
}: {
  kpiData: KpiData | null; alerts: AlertItem[]; alertSummary: Record<string, number>;
  towerStats: { online: number; total: number; warning: number } | null;
  fraudSum: Record<string, unknown> | null;
  provStats: Record<string, number> | null;
  supportStats: Record<string, unknown> | null;
  billingSum: Record<string, unknown> | null;
  interSum: Record<string, number> | null;
  liveConnected: boolean; loading: boolean; kpiHistory: KpiData[];
  onLogout: () => void; onRefresh: () => void;
}) {
  const [activeNav, setActiveNav] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const kpiCards = [
    { label: "Total Subscribers", value: kpiData ? fmt(Number(kpiData.totalSubscribers)) : "…", color: "#6B5ED7", up: true,  icon: <Users className="w-5 h-5" /> },
    { label: "Network Uptime",    value: kpiData ? `${Number(kpiData.networkUptimePct).toFixed(2)}%` : "…", color: "#10B981", up: true, icon: <Activity className="w-5 h-5" /> },
    { label: "Data Sessions",     value: kpiData ? fmt(Number(kpiData.activeDataSessions)) : "…", color: "#3B82F6", up: true, icon: <Wifi className="w-5 h-5" /> },
    { label: "Revenue Today",     value: billingSum ? fmtUSD(Number(billingSum.totalRevenue)) : "…", color: "#F59E0B", up: true, icon: <TrendingUp className="w-5 h-5" /> },
    { label: "Active Alerts",     value: alertSummary.active != null ? String(alertSummary.active) : "…", color: "#EF4444", up: false, icon: <AlertTriangle className="w-5 h-5" /> },
    { label: "Avg Network Load",  value: kpiData ? `${kpiData.avgNetworkLoadPct}%` : "…", color: "#8B5CF6", up: false, icon: <BarChart3 className="w-5 h-5" /> },
  ];

  const nodes = [
    { id: "cell-towers",    label: "Cell Towers",          sublabel: "Radio spectrum, antennas",     status: towerStats?.warning ? "warning" : "online",                          metric: towerStats ? `${towerStats.online}` : "—",                    color: "#D85A30", layer: "mno",  icon: <Radio className="w-4 h-4" /> },
    { id: "ran-gw",         label: "RAN Gateway",          sublabel: "Hands traffic to core",        status: "online" as const,                                                    metric: kpiData ? `${Number(kpiData.dataThroughputGbps).toFixed(1)}G` : "—", color: "#D85A30", layer: "mno",  icon: <Wifi className="w-4 h-4" /> },
    { id: "hlr-hss",        label: "HLR / HSS",            sublabel: "Subscriber identity",          status: "online" as const,                                                    metric: kpiData ? fmt(Number(kpiData.totalSubscribers)) : "—",        color: "#534AB7", layer: "core", icon: <Database className="w-4 h-4" /> },
    { id: "msc",            label: "MSC / Switching",      sublabel: "Call routing",                 status: "online" as const,                                                    metric: kpiData ? fmt(Number(kpiData.activeVoiceCalls)) : "—",        color: "#534AB7", layer: "core", icon: <Phone className="w-4 h-4" /> },
    { id: "pkt-core",       label: "Packet Core",          sublabel: "Data sessions",                status: Number(kpiData?.avgNetworkLoadPct) > 75 ? "warning" : "online" as const, metric: kpiData ? `${Number(kpiData.dataThroughputGbps).toFixed(1)} Gbps` : "—", color: "#534AB7", layer: "core", icon: <Globe className="w-4 h-4" /> },
    { id: "smsc",           label: "SMSC",                 sublabel: "SMS routing",                  status: "online" as const,                                                    metric: "—",                                                          color: "#534AB7", layer: "core", icon: <MessageSquare className="w-4 h-4" /> },
    { id: "billing",        label: "Billing / OSS-BSS",    sublabel: "Rating, invoicing",            status: "online" as const,                                                    metric: billingSum ? fmtUSD(Number(billingSum.totalRevenue)) : "—",   color: "#534AB7", layer: "core", icon: <CreditCard className="w-4 h-4" /> },
    { id: "fraud",          label: "Fraud / Security",     sublabel: "Monitoring, LI",               status: Number(fraudSum?.active) > 10 ? "warning" : "online" as const,       metric: fraudSum ? `${fraudSum.active} active` : "—",                 color: "#534AB7", layer: "core", icon: <Shield className="w-4 h-4" /> },
    { id: "sim-prov",       label: "SIM Provisioning",     sublabel: "Activation, mgmt",             status: "online" as const,                                                    metric: provStats ? fmt(provStats.active) : "—",                      color: "#534AB7", layer: "core", icon: <Signal className="w-4 h-4" /> },
    { id: "cx",             label: "Customer Service",     sublabel: "Support platform",             status: "online" as const,                                                    metric: supportStats ? `${supportStats.avgCsat}/5` : "—",            color: "#534AB7", layer: "core", icon: <Headphones className="w-4 h-4" /> },
    { id: "roaming",        label: "Roaming Partners",     sublabel: "International",                status: "online" as const,                                                    metric: interSum ? `${interSum.activePartners}` : "—",                color: "#0F6E56", layer: "ext",  icon: <Globe className="w-4 h-4" /> },
    { id: "carrier",        label: "Carrier Interconnect", sublabel: "Off-net calls",                status: "online" as const,                                                    metric: interSum ? `${interSum.activeRoutes} routes` : "—",           color: "#0F6E56", layer: "ext",  icon: <Phone className="w-4 h-4" /> },
    { id: "regulator",      label: "Regulator / LI",       sublabel: "Compliance",                   status: "online" as const,                                                    metric: "100%",                                                       color: "#0F6E56", layer: "ext",  icon: <Shield className="w-4 h-4" /> },
  ];

  const sparkVals = kpiHistory.length > 0
    ? kpiHistory.map(h => Number(h.activeDataSessions) / 1_400_000 * 100)
    : Array.from({ length: 24 }, (_, i) => 40 + Math.sin(i / 3) * 20 + Math.random() * 10);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <aside className="flex flex-col flex-shrink-0 transition-all duration-300"
        style={{ width: sidebarOpen ? 220 : 60, background: "#13103A", borderRight: "1px solid #2D2A50" }}>
        <div className="flex items-center gap-3 px-4 py-4 border-b flex-shrink-0" style={{ borderColor: "#2D2A50" }}>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-white text-sm font-bold leading-none truncate">MVNO Control</p>
              <p className="text-[10px] mt-0.5 truncate" style={{ color: "#8884AA" }}>Web Dashboard</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white flex-shrink-0">
            <Menu className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
          {WEB_NAV.map(item => (
            <button key={item.label} onClick={() => setActiveNav(item.label)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left"
              style={{ background: activeNav === item.label ? "#6B5ED722" : "transparent", color: activeNav === item.label ? "#9585EA" : "#8884AA" }}>
              <span className="flex-shrink-0">{item.icon}</span>
              {sidebarOpen && (
                <span className="text-xs font-medium flex-1 truncate flex items-center justify-between">
                  {item.label}
                  {item.label === "Alerts" && alertSummary.active > 0 && (
                    <span className="text-[9px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold flex-shrink-0">
                      {alertSummary.active}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-2 pb-4 border-t pt-3" style={{ borderColor: "#2D2A50" }}>
          <button onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span className="text-xs font-medium">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
          style={{ background: "#13103A", borderBottom: "1px solid #2D2A50" }}>
          <div>
            <div className="flex items-center gap-2 text-xs" style={{ color: "#8884AA" }}>
              <span>Mobile Network</span><ChevronRight className="w-3 h-3" /><span className="text-white font-medium">{activeNav}</span>
            </div>
            <h1 className="text-white font-bold text-base mt-0.5">MVNO Network Architecture</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${liveConnected ? "" : "opacity-50"}`}
              style={{ background: liveConnected ? "#10B98122" : "#6B728022", color: liveConnected ? "#10B981" : "#9CA3AF", border: `1px solid ${liveConnected ? "#10B98144" : "#4B556344"}` }}>
              <span className={`w-1.5 h-1.5 rounded-full ${liveConnected ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
              {liveConnected ? "LIVE" : "OFFLINE"}
            </div>
            <button onClick={onRefresh} disabled={loading}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
              style={{ background: "#1E1B3A", color: "#8884AA", border: "1px solid #2D2A50" }}>
              <Clock className="w-3.5 h-3.5" /><span>{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Demo banner */}
        <DemoModeBanner dark />
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-white">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpiCards.map((k, i) => (
              <div key={i} className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg" style={{ background: k.color + "20", color: k.color }}>{k.icon}</div>
                  <div className={`flex items-center gap-1 text-[10px] font-semibold ${k.up ? "text-emerald-400" : "text-red-400"}`}>
                    {k.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  </div>
                </div>
                {loading && !kpiData ? (
                  <div className="h-6 w-20 rounded animate-pulse" style={{ background: "#2D2A50" }} />
                ) : (
                  <p className="text-xl font-bold text-white leading-none">{k.value}</p>
                )}
                <p className="text-[10px] leading-tight" style={{ color: "#8884AA" }}>{k.label}</p>
              </div>
            ))}
          </div>

          {/* Topology + right panel */}
          <div className="grid xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 rounded-2xl p-5 space-y-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-white">Live Network Topology</h2>
                <div className="flex items-center gap-3 text-[10px]" style={{ color: "#8884AA" }}>
                  {[["online","#34d399"],["warning","#fbbf24"],["offline","#f87171"]].map(([s,c]) => (
                    <span key={s} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: c }} />{s}</span>
                  ))}
                </div>
              </div>

              {/* Subscriber */}
              <div className="flex justify-center">
                <div className="flex items-center gap-3 px-5 py-2.5 rounded-xl border" style={{ background: "#252245", borderColor: "#3D3A6A" }}>
                  <Signal className="w-4 h-4" style={{ color: "#9585EA" }} />
                  <p className="text-xs font-bold text-white">SIM / Handset</p>
                  <Dot status="online" />
                </div>
              </div>
              <LayerArrow />

              {["mno","core","ext"].map(layer => {
                const layerNodes = nodes.filter(n => n.layer === layer);
                const colors = { mno: "#D85A30", core: "#534AB7", ext: "#0F6E56" };
                const labels = { mno: "Host MNO (Leased)", core: "MVNO Core Network", ext: "External Interconnects" };
                const online = layerNodes.filter(n => n.status === "online").length;
                const c = colors[layer as keyof typeof colors];
                return (
                  <div key={layer}>
                    <div className="rounded-xl p-3 border" style={{ background: c + "08", borderColor: c + "44" }}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1" style={{ background: c + "40" }} />
                        <span className="text-[11px] font-semibold px-3 py-1 rounded-full border" style={{ color: c, background: c + "12", borderColor: c + "60" }}>
                          {labels[layer as keyof typeof labels]} · {online}/{layerNodes.length}
                        </span>
                        <div className="h-px flex-1" style={{ background: c + "40" }} />
                      </div>
                      <div className={`grid gap-3 ${layer === "ext" || layer === "mno" ? "grid-cols-3" : "grid-cols-3 md:grid-cols-3"}`}>
                        {layer === "core" ? (
                          <div className="col-span-3 space-y-3">
                            <div className="grid grid-cols-3 gap-3">{layerNodes.slice(0,3).map(n => <WNodeCard key={n.id} n={n} />)}</div>
                            <div className="grid grid-cols-3 gap-3">{layerNodes.slice(3,6).map(n => <WNodeCard key={n.id} n={n} />)}</div>
                            <div className="grid grid-cols-2 gap-3">{layerNodes.slice(6).map(n => <WNodeCard key={n.id} n={n} />)}</div>
                          </div>
                        ) : layerNodes.map(n => <WNodeCard key={n.id} n={n} />)}
                      </div>
                    </div>
                    {layer !== "ext" && <LayerArrow />}
                  </div>
                );
              })}
            </div>

            {/* Right side panels */}
            <div className="space-y-4">
              {/* Health bars */}
              <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                <h3 className="text-sm font-bold text-white mb-4">System Health</h3>
                {[
                  { label: "Radio Access", pct: towerStats ? Math.round(towerStats.online / towerStats.total * 100) : 98, color: "#D85A30" },
                  { label: "Core Network", pct: kpiData ? Math.max(0, 100 - Math.max(0, Number(kpiData.avgNetworkLoadPct) - 70)) : 94, color: "#534AB7" },
                  { label: "External Links", pct: 100, color: "#0F6E56" },
                ].map((l, i) => (
                  <div key={i} className="mb-3">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span style={{ color: "#9896B8" }}>{l.label}</span>
                      <span className="font-bold" style={{ color: l.color }}>{l.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "#2D2A50" }}>
                      <div className="h-full rounded-full" style={{ width: `${l.pct}%`, background: l.color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Alerts */}
              <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">Live Alerts</h3>
                  {alertSummary.active > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">{alertSummary.active}</span>
                  )}
                </div>
                {loading && alerts.length === 0
                  ? [1,2,3].map(i => <div key={i} className="h-10 rounded mb-2 animate-pulse" style={{ background: "#2D2A50" }} />)
                  : alerts.length === 0
                    ? <div className="flex items-center gap-2 text-emerald-400 text-xs py-3"><CheckCircle className="w-4 h-4" />All clear</div>
                    : alerts.map((a, i) => (
                      <div key={i} className="flex items-start gap-2.5 py-2 border-b last:border-0" style={{ borderColor: "#2D2A50" }}>
                        <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${a.severity === "critical" ? "bg-red-500" : a.severity === "warning" ? "bg-amber-400" : "bg-blue-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-white leading-tight truncate">{a.message}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[9px]" style={{ color: "#8884AA" }}>{a.component} · {ago(a.createdAt)}</p>
                            <SevBadge s={a.severity} />
                          </div>
                        </div>
                      </div>
                    ))
                }
              </div>

              {/* Sparkline */}
              <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">Data Sessions (24h)</h3>
                  <Zap className="w-4 h-4" style={{ color: "#9585EA" }} />
                </div>
                <div className="flex items-end gap-0.5 h-14">
                  {sparkVals.map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(5, Math.min(100, h))}%`, background: i === sparkVals.length - 1 ? "#9585EA" : "#534AB755" }} />
                  ))}
                </div>
                <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                  <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Now</span>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Active SIMs",  value: provStats ? fmt(provStats.active) : "—",               color: "#6B5ED7" },
                  { label: "Open Tickets", value: supportStats ? String(supportStats.open) : "—",         color: "#F59E0B" },
                  { label: "Roaming",      value: interSum ? fmt(interSum.totalRoamers) : "—",             color: "#10B981" },
                  { label: "Fraud Blocked",value: fraudSum ? String(fraudSum.blocked) : "—",              color: "#EF4444" },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl p-3 text-center" style={{ background: "#252245", border: "1px solid #2D2A50" }}>
                    <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#8884AA" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WNodeCard({ n }: { n: { label: string; sublabel: string; metric: string; status: string; color: string; icon: React.ReactNode } }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl p-2.5 border" style={{ background: "#1E1B3A", borderColor: "#2D2A50" }}>
      <div className="flex items-center justify-between">
        <div className="p-1.5 rounded-lg" style={{ background: n.color + "22", color: n.color }}>{n.icon}</div>
        <Dot status={n.status} />
      </div>
      <p className="text-[11px] font-semibold text-white leading-tight">{n.label}</p>
      <p className="text-[9px]" style={{ color: "#8884AA" }}>{n.sublabel}</p>
      <p className="text-[11px] font-bold" style={{ color: n.color }}>{n.metric}</p>
    </div>
  );
}

function LayerArrow() {
  return (
    <div className="flex justify-center">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-4" style={{ background: "#5F5E5A" }} />
        <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid #5F5E5A" }} />
      </div>
    </div>
  );
}

// ─── PREVIEW TOGGLE BAR ───────────────────────────────────────────────────────
function PreviewToggle({ mode, onChange }: { mode: PreviewMode; onChange: (m: PreviewMode) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "#252245", border: "1px solid #3D3A6A" }}>
      {(["mobile", "web"] as PreviewMode[]).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: mode === m ? "#6B5ED7" : "transparent",
            color: mode === m ? "white" : "#8884AA",
          }}>
          {m === "mobile" ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
          {m === "mobile" ? "Mobile App" : "Web"}
        </button>
      ))}
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
interface Props { isOpen: boolean; onClose: () => void }

export function MobileNetworkDashboard({ isOpen, onClose }: Props) {
  const [authed, setAuthed]         = useState(!!getToken());
  const [user, setUser]             = useState<{ name: string; role: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("web");
  const [mobileTab, setMobileTab]   = useState<MobileTab>("home");

  // Data
  const [kpiData, setKpiData]           = useState<KpiData | null>(null);
  const [kpiHistory, setKpiHistory]     = useState<KpiData[]>([]);
  const [alerts, setAlerts]             = useState<AlertItem[]>([]);
  const [alertSummary, setAlertSummary] = useState<Record<string, number>>({});
  const [towerStats, setTowerStats]     = useState<{ online: number; total: number; warning: number } | null>(null);
  const [callStats, setCallStats]       = useState<Record<string, number> | null>(null);
  const [billingSum, setBillingSum]     = useState<Record<string, unknown> | null>(null);
  const [fraudSum, setFraudSum]         = useState<Record<string, unknown> | null>(null);
  const [provStats, setProvStats]       = useState<Record<string, number> | null>(null);
  const [supportStats, setSupportStats] = useState<Record<string, unknown> | null>(null);
  const [interSum, setInterSum]         = useState<Record<string, number> | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [loading, setLoading]           = useState(false);
  const stopWs = useRef<(() => void) | null>(null);

  const loadAll = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        kpis.current(), kpis.history(24),
        alertsApi.list({ limit: "20", resolved: "false" }), alertsApi.summary(),
        network.towers(), network.callStats(),
        billing.summary(), fraud.summary(), provisioning.simStats(),
        support.stats(), interconnects.summary(),
      ]);
      const [kpiR,histR,alertR,alertSumR,towR,callR,billR,fraudR,provR,supR,interR] = results;
      if (kpiR.status      === "fulfilled") setKpiData(kpiR.value.data as KpiData);
      if (histR.status     === "fulfilled") setKpiHistory(histR.value.data as KpiData[]);
      if (alertR.status    === "fulfilled") setAlerts((alertR.value.data as AlertItem[]).slice(0, 6));
      if (alertSumR.status === "fulfilled") setAlertSummary(alertSumR.value.data as Record<string, number>);
      if (towR.status      === "fulfilled") {
        const tw = towR.value.data as { status: string }[];
        setTowerStats({ total: tw.length, online: tw.filter(t => t.status === "online").length, warning: tw.filter(t => t.status === "warning").length });
      }
      if (callR.status  === "fulfilled") setCallStats(callR.value.data as Record<string, number>);
      if (billR.status  === "fulfilled") setBillingSum(billR.value.data as Record<string, unknown>);
      if (fraudR.status === "fulfilled") setFraudSum(fraudR.value.data as Record<string, unknown>);
      if (provR.status  === "fulfilled") setProvStats(provR.value.data as Record<string, number>);
      if (supR.status   === "fulfilled") setSupportStats(supR.value.data as Record<string, unknown>);
      if (interR.status === "fulfilled") setInterSum(interR.value.data as Record<string, number>);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isOpen || !authed) return;
    loadAll();
    stopWs.current = connectLiveFeed(
      (event, data) => {
        if (event === "kpi_update") setKpiData(data as KpiData);
        if (event === "new_alert")  setAlerts(prev => [data as AlertItem, ...prev].slice(0, 6));
        if (event === "alert_resolved") setAlerts(prev => prev.map(a => a.id === (data as AlertItem).id ? data as AlertItem : a));
      },
      setLiveConnected,
    );
    return () => { stopWs.current?.(); };
  }, [isOpen, authed, loadAll]);

  useEffect(() => { if (!isOpen) { stopWs.current?.(); setLiveConnected(false); } }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = (_t: string, u: { name: string; role: string }) => { setUser(u); setAuthed(true); };
  const handleLogout = () => { setToken(null); setAuthed(false); setUser(null); onClose(); };

  const sharedProps = {
    kpiData, alerts, towerStats, callStats, fraudSum, provStats,
    supportStats, billingSum, liveConnected, loading,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0D0B1E" }}>

      {/* ── OUTER TOOLBAR (always visible) ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5"
        style={{ background: "#13103A", borderBottom: "1px solid #2D2A50" }}>
        {/* Left: brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)" }}>
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-none">MVNO Control Centre</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#8884AA" }}>
              {authed ? (user?.name ?? "Operator") + " · " + (user?.role ?? "") : "Not signed in"}
            </p>
          </div>
        </div>

        {/* Centre: preview toggle (only when authed) */}
        {authed && <PreviewToggle mode={previewMode} onChange={setPreviewMode} />}

        {/* Right: close */}
        <button onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── CONTENT AREA ── */}
      {!authed ? (
        <LoginScreen onLogin={handleLogin} onClose={onClose} mode={previewMode} />
      ) : previewMode === "mobile" ? (
        // Mobile: phone frame centred on dark canvas
        <div className="flex-1 overflow-hidden" style={{ background: "radial-gradient(ellipse at center, #1a1738 0%, #0D0B1E 70%)" }}>
          <PhoneFrame>
            <MobileDashboardContent
              {...sharedProps}
              interSum={interSum}
              activeTab={mobileTab}
              setActiveTab={setMobileTab}
              onLogout={handleLogout}
            />
          </PhoneFrame>
        </div>
      ) : (
        // Web: full-width dashboard
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <WebDashboard
            {...sharedProps}
            alertSummary={alertSummary}
            interSum={interSum}
            kpiHistory={kpiHistory}
            onLogout={handleLogout}
            onRefresh={loadAll}
          />
        </div>
      )}
    </div>
  );
}
