import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Map, Truck, Users, AlertTriangle, Shield, BarChart3,
  Settings, LogOut, Menu, ChevronRight, Navigation, Fuel,
  Zap, Clock, TrendingUp, CheckCircle, Radio, Satellite,
  Database, Server, Monitor, Smartphone, Layers, RefreshCw,
  MapPin, Activity, Bell, Eye, Key, Loader2, Play, Square,
} from "lucide-react";
import { vehicleApi, connectLiveFeed } from "../services/vehicleApi";
import { auth, setToken, getToken } from "../services/mvnoApi";
import { DemoModeBanner } from "./DemoModeBanner";
import { setDemoMode, DEMO_TOKEN } from "../services/demoMode";

// ─── Types ────────────────────────────────────────────────────────────────────
interface VehiclePos {
  id: string; plateNumber: string; make: string; model: string;
  fleetGroup: string; status: string;
  position: { lat: number; lng: number; heading: number };
  speedKph: number; fuelPercent: number; lastSeen: string;
}
interface AlertItem {
  id: string; plateNumber: string; type: string; severity: string;
  message: string; detectedAt: string; resolvedAt: string | null; acknowledged: boolean;
}
interface SnapData { [key: string]: number | string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  moving: "#10B981", idle: "#F59E0B", stopped: "#6B7280",
  offline: "#EF4444", maintenance: "#8B5CF6",
};
const ALERT_COLOR: Record<string, string> = {
  critical: "#EF4444", warning: "#F59E0B", info: "#3B82F6",
};
const ALERT_ICON: Record<string, string> = {
  speeding: "⚡", geofence_breach: "📍", low_fuel: "⛽",
  harsh_braking: "🛑", engine_off: "🔑", sos: "🆘", tampering: "⚠️", accident: "💥",
};
const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};
const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

// ─── SA Map (SVG) ─────────────────────────────────────────────────────────────
// Simplified South Africa outline + city dots
const SA_W = 480, SA_H = 360;
const latToY = (lat: number) => ((lat - (-22.0)) / (-34.5 - -22.0)) * SA_H;
const lngToX = (lng: number) => ((lng - 16.0) / (33.5 - 16.0)) * SA_W;

const CITY_DOTS = [
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473 },
  { name: "Cape Town",    lat: -33.9249, lng: 18.4241 },
  { name: "Durban",       lat: -29.8587, lng: 31.0218 },
  { name: "Pretoria",     lat: -25.7479, lng: 28.2293 },
  { name: "Bloemfontein", lat: -29.0852, lng: 26.1596 },
  { name: "Port Elizabeth", lat: -33.9608, lng: 25.6022 },
];

function SaMap({ vehicles, selected, onSelect }: {
  vehicles: VehiclePos[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <svg viewBox={`0 0 ${SA_W} ${SA_H}`} className="w-full h-full" style={{ background: "#1A1738" }}>
      {/* Grid lines */}
      {[0.2, 0.4, 0.6, 0.8].map(f => (
        <g key={f}>
          <line x1={SA_W * f} y1={0} x2={SA_W * f} y2={SA_H} stroke="#2D2A50" strokeWidth="0.5" />
          <line x1={0} y1={SA_H * f} x2={SA_W} y2={SA_H * f} stroke="#2D2A50" strokeWidth="0.5" />
        </g>
      ))}

      {/* Approximate SA coastline (rough polygon) */}
      <polygon
        points="100,20 200,10 310,15 380,40 430,80 445,130 440,180 420,230 390,270 360,300 320,330 280,345 240,350 200,340 160,320 120,295 85,265 60,230 45,195 40,155 50,110 70,65 100,20"
        fill="#252245" stroke="#3D3A6A" strokeWidth="1.5"
      />

      {/* City dots */}
      {CITY_DOTS.map(c => (
        <g key={c.name}>
          <circle cx={lngToX(c.lng)} cy={latToY(c.lat)} r="3" fill="#534AB7" opacity="0.7" />
          <text x={lngToX(c.lng) + 5} y={latToY(c.lat) + 3} fontSize="7" fill="#8884AA">{c.name}</text>
        </g>
      ))}

      {/* Vehicle markers */}
      {vehicles.map(v => {
        const x = lngToX(v.position.lng);
        const y = latToY(v.position.lat);
        const color = STATUS_COLOR[v.status] ?? "#6B7280";
        const isSel = selected === v.id;
        const headingRad = (v.position.heading * Math.PI) / 180;

        return (
          <g key={v.id} onClick={() => onSelect(v.id)} className="cursor-pointer">
            {/* Pulse ring for selected */}
            {isSel && <circle cx={x} cy={y} r="14" fill="none" stroke={color} strokeWidth="2" opacity="0.4" />}
            {/* Direction arrow */}
            {v.status === "moving" && (
              <line
                x1={x} y1={y}
                x2={x + Math.sin(headingRad) * 10}
                y2={y - Math.cos(headingRad) * 10}
                stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.8"
              />
            )}
            {/* Vehicle dot */}
            <circle cx={x} cy={y} r={isSel ? 7 : 5} fill={color} stroke="#0D0B1E" strokeWidth="1.5" />
            {/* Alert indicator */}
            {v.status === "offline" && (
              <circle cx={x + 5} cy={y - 5} r="3" fill="#EF4444" stroke="#0D0B1E" strokeWidth="1" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Architecture Layer Card ──────────────────────────────────────────────────
function ArchLayer({ title, subtitle, color, bg, border, children, arrow }: {
  title: string; subtitle: string; color: string; bg: string; border: string;
  children: React.ReactNode; arrow?: boolean;
}) {
  return (
    <div>
      <div className="rounded-xl p-4" style={{ background: bg, border: `1px solid ${border}` }}>
        <p className="text-xs font-bold mb-0.5" style={{ color }}>{title}</p>
        <p className="text-[10px] mb-3" style={{ color: border }}>{subtitle}</p>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
      {arrow && (
        <div className="flex justify-center my-1">
          <div className="flex flex-col items-center">
            <div className="w-px h-3" style={{ background: "#5F5E5A" }} />
            <div className="w-0 h-0" style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid #5F5E5A" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ArchNode({ label, sub, color, icon }: { label: string; sub: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[120px] rounded-lg px-3 py-2 border"
      style={{ background: color + "18", borderColor: color + "55" }}>
      <div className="flex items-center gap-1.5 mb-0.5" style={{ color }}>
        {icon}
        <span className="text-[11px] font-semibold">{label}</span>
      </div>
      <p className="text-[10px]" style={{ color: color + "aa" }}>{sub}</p>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("noc1");
  const [password, setPassword] = useState("Noc@5678");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await auth.login(username, password);
      setToken(res.token);
      onLogin();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg.includes("fetch") ? "Cannot reach backend — run: cd server && pnpm dev" : msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: "#0D0B1E" }}>
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#EF4444,#F59E0B)" }}>
            <Navigation className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Fleet Tracker</h1>
          <p className="text-sm mt-1" style={{ color: "#8884AA" }}>Vehicle Tracking Operations</p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-2xl p-6 space-y-4"
          style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#8884AA" }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required
              className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#EF4444]"
              style={{ background: "#252245", border: "1px solid #3D3A6A" }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#8884AA" }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#EF4444]"
              style={{ background: "#252245", border: "1px solid #3D3A6A" }} />
          </div>
          {error && (
            <div className="rounded-lg p-3 text-xs" style={{ background: "#EF444422", border: "1px solid #EF444444", color: "#FCA5A5" }}>{error}</div>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#EF4444,#F59E0B)" }}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in…</> : <><Key className="w-4 h-4" />Sign In</>}
          </button>
          <button type="button"
            onClick={() => { setDemoMode(true); setToken(DEMO_TOKEN); onLogin(); }}
            className="w-full py-2.5 rounded-lg font-semibold text-sm border transition-all flex items-center justify-center gap-2"
            style={{ background: "transparent", borderColor: "#EF444433", color: "#F87171" }}>
            ⚡ Enter Demo Mode (no server needed)
          </button>
          <p className="text-center text-[10px]" style={{ color: "#5A5880" }}>Live: noc1 / Noc@5678 · superadmin / Admin@1234</p>
        </form>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const NAV = [
  { icon: <Map className="w-4 h-4" />,        label: "Live Map"    },
  { icon: <Truck className="w-4 h-4" />,       label: "Fleet"       },
  { icon: <Layers className="w-4 h-4" />,      label: "Architecture"},
  { icon: <Users className="w-4 h-4" />,       label: "Drivers"     },
  { icon: <AlertTriangle className="w-4 h-4" />,label: "Alerts"     },
  { icon: <Shield className="w-4 h-4" />,      label: "Geofences"   },
  { icon: <BarChart3 className="w-4 h-4" />,   label: "Analytics"   },
  { icon: <Settings className="w-4 h-4" />,    label: "Settings"    },
];

export function VehicleTrackingDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [authed, setAuthed]         = useState(!!getToken());
  const [nav, setNav]               = useState("Live Map");
  const [sidebar, setSidebar]       = useState(true);
  const [liveConn, setLiveConn]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [vehicles, setVehicles]     = useState<VehiclePos[]>([]);
  const [selected, setSelected]     = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Record<string, unknown> | null>(null);
  const [snapshot, setSnapshot]     = useState<SnapData | null>(null);
  const [alerts, setAlerts]         = useState<AlertItem[]>([]);
  const [alertMeta, setAlertMeta]   = useState<Record<string, number>>({});
  const [drivers, setDrivers]       = useState<unknown[]>([]);
  const [geofences, setGeofences]   = useState<unknown[]>([]);
  const [analytics, setAnalytics]   = useState<Record<string, unknown> | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const stopWs = useRef<(() => void) | null>(null);

  const loadAll = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true);
    try {
      const [posRes, snapRes, alertRes, drvRes, gfRes, anRes] = await Promise.allSettled([
        vehicleApi.positions(),
        vehicleApi.snapshot(),
        vehicleApi.alerts({ limit: "30", resolved: "false" }),
        vehicleApi.drivers(),
        vehicleApi.geofences(),
        vehicleApi.analytics(),
      ]);
      if (posRes.status   === "fulfilled") setVehicles(posRes.value.data   as VehiclePos[]);
      if (snapRes.status  === "fulfilled") setSnapshot(snapRes.value.data  as SnapData);
      if (alertRes.status === "fulfilled") {
        setAlerts((alertRes.value.data as AlertItem[]).slice(0, 15));
        setAlertMeta(alertRes.value.meta as Record<string, number>);
      }
      if (drvRes.status   === "fulfilled") setDrivers(drvRes.value.data as unknown[]);
      if (gfRes.status    === "fulfilled") setGeofences(gfRes.value.data as unknown[]);
      if (anRes.status    === "fulfilled") setAnalytics(anRes.value.data as Record<string, unknown>);
    } finally { setLoading(false); }
  }, []);

  // WS live feed
  useEffect(() => {
    if (!isOpen || !authed) return;
    loadAll();
    stopWs.current = connectLiveFeed((event, data) => {
      if (event === "vehicle_position") {
        const d = data as { vehicleId: string; position: VehiclePos["position"]; sensors: { speedKph: number; fuelPercent: number }; status: string };
        setVehicles(prev => prev.map(v => v.id === d.vehicleId
          ? { ...v, position: d.position, speedKph: d.sensors.speedKph, fuelPercent: d.sensors.fuelPercent, status: d.status }
          : v
        ));
      }
      if (event === "vehicle_alert") {
        const a = data as AlertItem;
        setAlerts(prev => [a, ...prev].slice(0, 15));
      }
      if (event === "fleet_snapshot") {
        setSnapshot(data as SnapData);
      }
    }, setLiveConn);
    return () => stopWs.current?.();
  }, [isOpen, authed, loadAll]);

  useEffect(() => { if (!isOpen) { stopWs.current?.(); setLiveConn(false); } }, [isOpen]);

  useEffect(() => {
    if (selected && authed) {
      vehicleApi.get(selected)
        .then(r => setSelectedVehicle(r.data as Record<string, unknown>))
        .catch(() => setSelectedVehicle(null));
    } else { setSelectedVehicle(null); }
  }, [selected, authed]);

  if (!isOpen) return null;

  const filteredVehicles = statusFilter === "all"
    ? vehicles
    : vehicles.filter(v => v.status === statusFilter);

  const kpiCards = [
    { label: "Total Vehicles",   value: snapshot ? String(snapshot.totalVehicles)           : "—", color: "#6B5ED7", icon: <Truck className="w-4 h-4" /> },
    { label: "Moving Now",       value: snapshot ? String(snapshot.movingNow)               : "—", color: "#10B981", icon: <Navigation className="w-4 h-4" /> },
    { label: "Idle",             value: snapshot ? String(snapshot.idleNow)                 : "—", color: "#F59E0B", icon: <Clock className="w-4 h-4" /> },
    { label: "Offline",          value: snapshot ? String(snapshot.offlineNow)              : "—", color: "#EF4444", icon: <Activity className="w-4 h-4" /> },
    { label: "Active Alerts",    value: String(alertMeta.active ?? alerts.filter(a => !a.resolvedAt).length), color: "#F97316", icon: <Bell className="w-4 h-4" /> },
    { label: "Avg Speed",        value: snapshot ? `${Number(snapshot.avgSpeedKph).toFixed(0)} km/h`  : "—", color: "#3B82F6", icon: <Zap className="w-4 h-4" /> },
    { label: "Avg Fuel",         value: snapshot ? `${Number(snapshot.avgFuelPercent).toFixed(0)}%`   : "—", color: "#8B5CF6", icon: <Fuel className="w-4 h-4" /> },
    { label: "Km Today",         value: snapshot ? `${Number(snapshot.totalKmToday).toFixed(0)} km`   : "—", color: "#0EA5E9", icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0D0B1E" }}>
      {!authed ? (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
            style={{ background: "#13103A", borderBottom: "1px solid #2D2A50" }}>
            <p className="text-white font-bold text-sm">Vehicle Tracking System</p>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <LoginScreen onLogin={() => setAuthed(true)} />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* ── SIDEBAR ── */}
          <aside className="flex flex-col flex-shrink-0 transition-all duration-300"
            style={{ width: sidebar ? 210 : 56, background: "#13103A", borderRight: "1px solid #2D2A50" }}>
            <div className="flex items-center gap-3 px-3 py-4 border-b" style={{ borderColor: "#2D2A50" }}>
              {sidebar && (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg,#EF4444,#F59E0B)" }}>
                    <Truck className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-xs font-bold leading-none truncate">Fleet Tracker</p>
                    <p className="text-[9px] mt-0.5 truncate" style={{ color: "#8884AA" }}>Vehicle Tracking</p>
                  </div>
                </div>
              )}
              <button onClick={() => setSidebar(!sidebar)}
                className="ml-auto p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors flex-shrink-0">
                <Menu className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
              {NAV.map(item => (
                <button key={item.label} onClick={() => setNav(item.label)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left"
                  style={{ background: nav === item.label ? "#EF444422" : "transparent", color: nav === item.label ? "#F87171" : "#8884AA" }}>
                  <span className="flex-shrink-0">{item.icon}</span>
                  {sidebar && (
                    <span className="text-xs font-medium flex-1 truncate flex items-center justify-between">
                      {item.label}
                      {item.label === "Alerts" && alertMeta.active > 0 && (
                        <span className="text-[9px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                          {alertMeta.active}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            <div className="px-2 pb-4 pt-3 border-t space-y-1" style={{ borderColor: "#2D2A50" }}>
              <button onClick={() => { setToken(null); setAuthed(false); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {sidebar && <span className="text-xs font-medium">Sign Out</span>}
              </button>
            </div>
          </aside>

          {/* ── MAIN ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ background: "#13103A", borderBottom: "1px solid #2D2A50" }}>
              <div>
                <div className="flex items-center gap-2 text-xs" style={{ color: "#8884AA" }}>
                  <span>Vehicle Tracking</span><ChevronRight className="w-3 h-3" /><span className="text-white font-medium">{nav}</span>
                </div>
                <h1 className="text-white font-bold text-sm mt-0.5">Fleet Management System</h1>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${liveConn ? "" : "opacity-50"}`}
                  style={{ background: liveConn ? "#10B98122" : "#6B728022", color: liveConn ? "#10B981" : "#9CA3AF", border: `1px solid ${liveConn ? "#10B98144" : "#4B556344"}` }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${liveConn ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
                  {liveConn ? "LIVE" : "OFFLINE"}
                </div>
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: "#1E1B3A", color: "#8884AA", border: "1px solid #2D2A50" }}>
                  {fmt(vehicles.filter(v => v.status === "moving").length)} moving
                </span>
                <button onClick={loadAll} disabled={loading}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-40 transition-colors">
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Demo mode banner */}
            <DemoModeBanner dark />
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* ── KPI STRIP ── */}
              <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
                {kpiCards.map((k, i) => (
                  <div key={i} className="rounded-xl p-3 text-center" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                    <div className="flex justify-center mb-1.5" style={{ color: k.color }}>{k.icon}</div>
                    <p className="text-sm font-black text-white leading-none">{k.value}</p>
                    <p className="text-[9px] mt-1 leading-tight" style={{ color: "#8884AA" }}>{k.label}</p>
                  </div>
                ))}
              </div>

              {/* ── LIVE MAP ── */}
              {nav === "Live Map" && (
                <div className="grid xl:grid-cols-3 gap-4">
                  {/* Map */}
                  <div className="xl:col-span-2 rounded-2xl overflow-hidden" style={{ border: "1px solid #2D2A50" }}>
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#1E1B3A", borderBottom: "1px solid #2D2A50" }}>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" style={{ color: "#EF4444" }} />
                        <span className="text-xs font-bold text-white">Live Map — South Africa</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: "#8884AA" }}>
                        {Object.entries(STATUS_COLOR).map(([s, c]) => (
                          <span key={s} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ background: c }} />{s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ height: 380 }}>
                      <SaMap vehicles={filteredVehicles} selected={selected} onSelect={id => setSelected(id === selected ? null : id)} />
                    </div>
                    {/* Status filter pills */}
                    <div className="flex gap-2 px-4 py-2" style={{ background: "#1A1738", borderTop: "1px solid #2D2A50" }}>
                      {["all", "moving", "idle", "stopped", "offline"].map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                          className="px-3 py-1 rounded-full text-[10px] font-semibold transition-all capitalize"
                          style={{
                            background: statusFilter === s ? (STATUS_COLOR[s] ?? "#6B5ED7") + "33" : "#252245",
                            color: statusFilter === s ? (STATUS_COLOR[s] ?? "#9585EA") : "#8884AA",
                            border: `1px solid ${statusFilter === s ? (STATUS_COLOR[s] ?? "#6B5ED7") + "66" : "#3D3A6A"}`,
                          }}>
                          {s} {s !== "all" && `(${vehicles.filter(v => v.status === s).length})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right: Selected vehicle + alerts */}
                  <div className="space-y-3">
                    {selectedVehicle ? (
                      <div className="rounded-2xl p-4" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-white font-bold text-sm">{selectedVehicle.plateNumber as string}</p>
                            <p className="text-xs" style={{ color: "#8884AA" }}>{selectedVehicle.make as string} {selectedVehicle.model as string} · {selectedVehicle.year as number}</p>
                          </div>
                          <div className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                            style={{ background: STATUS_COLOR[(selectedVehicle.status as string)] + "22", color: STATUS_COLOR[(selectedVehicle.status as string)] }}>
                            {selectedVehicle.status as string}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {[
                            { label: "Speed",    value: `${Math.round((selectedVehicle.sensors as Record<string, number>)?.speedKph ?? 0)} km/h`,     color: "#10B981" },
                            { label: "Fuel",     value: `${Math.round((selectedVehicle.sensors as Record<string, number>)?.fuelPercent ?? 0)}%`,       color: "#F59E0B" },
                            { label: "Engine °C",value: `${Math.round((selectedVehicle.sensors as Record<string, number>)?.engineTempC ?? 0)}°C`,      color: "#EF4444" },
                            { label: "Battery",  value: `${((selectedVehicle.sensors as Record<string, number>)?.batteryV ?? 12).toFixed(1)}V`,        color: "#3B82F6" },
                          ].map((s, i) => (
                            <div key={i} className="rounded-lg p-2 text-center" style={{ background: s.color + "11", border: `1px solid ${s.color}33` }}>
                              <p className="text-xs font-bold" style={{ color: s.color }}>{s.value}</p>
                              <p className="text-[9px]" style={{ color: "#8884AA" }}>{s.label}</p>
                            </div>
                          ))}
                        </div>
                        {/* Fleet + driver */}
                        <div className="text-xs space-y-1.5 border-t pt-2" style={{ borderColor: "#2D2A50" }}>
                          <div className="flex justify-between">
                            <span style={{ color: "#8884AA" }}>Fleet Group</span>
                            <span className="text-white">{selectedVehicle.fleetGroup as string}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "#8884AA" }}>Comm</span>
                            <span className="text-white capitalize">{(selectedVehicle.commChannel as string)?.replace("_", " ")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "#8884AA" }}>Odometer</span>
                            <span className="text-white">{fmt((selectedVehicle.sensors as Record<string, number>)?.odometreKm ?? 0)} km</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "#8884AA" }}>Last Seen</span>
                            <span className="text-white">{timeAgo(selectedVehicle.lastSeen as string)}</span>
                          </div>
                        </div>
                        <button onClick={() => setSelected(null)}
                          className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
                          style={{ color: "#8884AA", border: "1px solid #2D2A50" }}>
                          Clear Selection
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl p-4" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                        <p className="text-xs font-bold text-white mb-3">Fleet Status</p>
                        {["moving","idle","stopped","offline","maintenance"].map(s => {
                          const count = vehicles.filter(v => v.status === s).length;
                          const pct   = vehicles.length > 0 ? (count / vehicles.length) * 100 : 0;
                          return (
                            <div key={s} className="mb-2">
                              <div className="flex justify-between text-[10px] mb-1">
                                <span className="capitalize" style={{ color: "#9896B8" }}>{s}</span>
                                <span className="font-bold" style={{ color: STATUS_COLOR[s] }}>{count}</span>
                              </div>
                              <div className="h-1.5 rounded-full" style={{ background: "#2D2A50" }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: STATUS_COLOR[s] }} />
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-[10px] mt-3 text-center" style={{ color: "#5A5880" }}>Click a dot on the map to select a vehicle</p>
                      </div>
                    )}

                    {/* Alert feed */}
                    <div className="rounded-2xl p-4" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-white">Live Alerts</p>
                        {alertMeta.active > 0 && <span className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">{alertMeta.active} active</span>}
                      </div>
                      {alerts.length === 0 ? (
                        <div className="flex items-center gap-2 text-emerald-400 text-xs py-2">
                          <CheckCircle className="w-4 h-4" /><span>No active alerts</span>
                        </div>
                      ) : alerts.slice(0, 6).map((a, i) => (
                        <div key={a.id ?? i} className="flex items-start gap-2 py-2 border-b last:border-0" style={{ borderColor: "#2D2A50" }}>
                          <span className="text-base flex-shrink-0">{ALERT_ICON[a.type] ?? "⚠️"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-white truncate">{a.plateNumber} — {a.message}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px]" style={{ color: "#8884AA" }}>{timeAgo(a.detectedAt)}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase"
                                style={{ background: ALERT_COLOR[a.severity] + "22", color: ALERT_COLOR[a.severity] }}>
                                {a.severity}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── FLEET VIEW ── */}
              {nav === "Fleet" && (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #2D2A50" }}>
                  <div className="flex items-center justify-between px-5 py-3" style={{ background: "#1E1B3A", borderBottom: "1px solid #2D2A50" }}>
                    <p className="text-sm font-bold text-white">Fleet Registry — {vehicles.length} vehicles</p>
                    <div className="flex gap-2">
                      {["all","moving","idle","offline"].map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize transition-all"
                          style={{ background: statusFilter === s ? "#EF444422" : "#252245", color: statusFilter === s ? "#F87171" : "#8884AA", border: "1px solid " + (statusFilter === s ? "#EF444444" : "#3D3A6A") }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "#252245", color: "#8884AA" }}>
                          {["Plate","Make/Model","Fleet","Status","Speed","Fuel","Battery","Last Seen","Actions"].map(h => (
                            <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVehicles.slice(0, 20).map((v, i) => (
                          <tr key={v.id} className="border-b cursor-pointer hover:bg-white/3 transition-colors"
                            style={{ borderColor: "#2D2A50", background: i % 2 === 0 ? "#1A1738" : "#1E1B3A" }}
                            onClick={() => { setSelected(v.id); setNav("Live Map"); }}>
                            <td className="px-4 py-3 font-mono font-bold text-white">{v.plateNumber}</td>
                            <td className="px-4 py-3 text-white">{v.make} {v.model}</td>
                            <td className="px-4 py-3" style={{ color: "#8884AA" }}>{v.fleetGroup}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full capitalize font-semibold"
                                style={{ background: STATUS_COLOR[v.status] + "22", color: STATUS_COLOR[v.status] }}>
                                {v.status === "moving" && <Play className="w-2.5 h-2.5 inline mr-0.5" />}
                                {v.status === "stopped" && <Square className="w-2.5 h-2.5 inline mr-0.5" />}
                                {v.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white">{Math.round(v.speedKph)} km/h</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 rounded-full" style={{ background: "#2D2A50" }}>
                                  <div className="h-full rounded-full" style={{ width: `${v.fuelPercent}%`, background: v.fuelPercent < 20 ? "#EF4444" : "#10B981" }} />
                                </div>
                                <span style={{ color: v.fuelPercent < 20 ? "#EF4444" : "#10B981" }}>{Math.round(v.fuelPercent)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3" style={{ color: "#8884AA" }}>12.6V</td>
                            <td className="px-4 py-3" style={{ color: "#8884AA" }}>{timeAgo(v.lastSeen)}</td>
                            <td className="px-4 py-3">
                              <button className="px-2 py-1 rounded text-[10px]" style={{ background: "#6B5ED722", color: "#9585EA" }}>Track</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── ARCHITECTURE ── */}
              {nav === "Architecture" && (
                <div className="grid xl:grid-cols-2 gap-4">
                  {/* Interactive architecture */}
                  <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                    <h2 className="text-sm font-bold text-white mb-5">Four-Layer Architecture</h2>
                    <div className="space-y-1">
                      <ArchLayer title="Layer 1 — Vehicle / Data Acquisition" subtitle="Captures and packages vehicle data"
                        color="#993C1D" bg="#FAECE712" border="#993C1D55" arrow>
                        <ArchNode label="GPS / GNSS" sub="Captures location" color="#D85A30" icon={<Navigation className="w-3.5 h-3.5" />} />
                        <ArchNode label="Sensors" sub="Speed, fuel, temp" color="#D85A30" icon={<Activity className="w-3.5 h-3.5" />} />
                        <ArchNode label="GSM + SIM" sub="Transmits data" color="#D85A30" icon={<Radio className="w-3.5 h-3.5" />} />
                      </ArchLayer>
                      <ArchLayer title="Layer 2 — Communication" subtitle="Sends data to server"
                        color="#185FA5" bg="#E6F1FB12" border="#185FA555" arrow>
                        <ArchNode label="Cellular Network" sub="3G / 4G / 5G / LTE" color="#3B82F6" icon={<Zap className="w-3.5 h-3.5" />} />
                        <ArchNode label="Satellite Link" sub="Backup in remote areas" color="#3B82F6" icon={<Satellite className="w-3.5 h-3.5" />} />
                      </ArchLayer>
                      <ArchLayer title="Layer 3 — Server / Backend" subtitle="Processes and stores vehicle data"
                        color="#534AB7" bg="#EEEDFE10" border="#534AB755" arrow>
                        <ArchNode label="App Server" sub="Business logic" color="#7C6FE8" icon={<Server className="w-3.5 h-3.5" />} />
                        <ArchNode label="Database" sub="Stores location data" color="#7C6FE8" icon={<Database className="w-3.5 h-3.5" />} />
                        <ArchNode label="Alerts Engine" sub="Triggers alerts" color="#7C6FE8" icon={<Bell className="w-3.5 h-3.5" />} />
                      </ArchLayer>
                      <ArchLayer title="Layer 4 — Client / Presentation" subtitle="Displays live vehicle data"
                        color="#0F6E56" bg="#E1F5EE10" border="#0F6E5655">
                        <ArchNode label="Web Dashboard" sub="Fleet manager view" color="#10B981" icon={<Monitor className="w-3.5 h-3.5" />} />
                        <ArchNode label="Mobile App" sub="Driver & owner view" color="#10B981" icon={<Smartphone className="w-3.5 h-3.5" />} />
                      </ArchLayer>
                    </div>
                  </div>

                  {/* System health per layer */}
                  <div className="space-y-4">
                    <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                      <h3 className="text-sm font-bold text-white mb-4">Layer Health Status</h3>
                      {[
                        { label: "Vehicle Data Acquisition", pct: 96, nodes: 3, online: 3, color: "#D85A30", status: "online" },
                        { label: "Communication Layer",      pct: 98, nodes: 2, online: 2, color: "#3B82F6", status: "online" },
                        { label: "Server / Backend",         pct: 99, nodes: 3, online: 3, color: "#7C6FE8", status: "online" },
                        { label: "Client / Presentation",    pct: 100, nodes: 2, online: 2, color: "#10B981", status: "online" },
                      ].map((layer, i) => (
                        <div key={i} className="mb-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs" style={{ color: "#9896B8" }}>{layer.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px]" style={{ color: "#8884AA" }}>{layer.online}/{layer.nodes} nodes</span>
                              <span className="text-xs font-bold" style={{ color: layer.color }}>{layer.pct}%</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full" style={{ background: "#2D2A50" }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${layer.pct}%`, background: layer.color }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Live data flow stats */}
                    <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                      <h3 className="text-sm font-bold text-white mb-4">Data Flow (Live)</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "GPS pings/min",    value: fmt(vehicles.filter(v => v.status === "moving").length * 20), color: "#D85A30" },
                          { label: "Data packets/min", value: fmt(vehicles.length * 4),  color: "#3B82F6" },
                          { label: "DB writes/min",    value: fmt(vehicles.length * 12), color: "#7C6FE8" },
                          { label: "Alert checks/min", value: fmt(vehicles.length * 8),  color: "#10B981" },
                        ].map((s, i) => (
                          <div key={i} className="rounded-xl p-3 text-center" style={{ background: s.color + "11", border: `1px solid ${s.color}33` }}>
                            <p className="text-base font-black" style={{ color: s.color }}>{s.value}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: "#8884AA" }}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Communication channel breakdown */}
                    <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                      <h3 className="text-sm font-bold text-white mb-3">Communication Channels</h3>
                      {[
                        { label: "4G LTE",     pct: 72, color: "#3B82F6" },
                        { label: "3G",         pct: 18, color: "#F59E0B" },
                        { label: "Satellite",  pct: 6,  color: "#8B5CF6" },
                        { label: "Offline",    pct: 4,  color: "#EF4444" },
                      ].map((c, i) => (
                        <div key={i} className="flex items-center gap-3 mb-2">
                          <span className="text-[10px] w-16 text-right" style={{ color: "#9896B8" }}>{c.label}</span>
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: "#2D2A50" }}>
                            <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                          </div>
                          <span className="text-[10px] w-8 font-bold" style={{ color: c.color }}>{c.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── DRIVERS ── */}
              {nav === "Drivers" && (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #2D2A50" }}>
                  <div className="px-5 py-3" style={{ background: "#1E1B3A", borderBottom: "1px solid #2D2A50" }}>
                    <p className="text-sm font-bold text-white">Driver Register — {drivers.length} drivers</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "#252245", color: "#8884AA" }}>
                          {["Driver","Licence","Phone","Status","Safety Score","Total Trips","Total km","Assigned Vehicle"].map(h => (
                            <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(drivers as Record<string, unknown>[]).slice(0, 20).map((d, i) => {
                          const score = Number(d.safetyScore);
                          const scoreColor = score >= 85 ? "#10B981" : score >= 65 ? "#F59E0B" : "#EF4444";
                          return (
                            <tr key={d.id as string} className="border-b" style={{ borderColor: "#2D2A50", background: i % 2 === 0 ? "#1A1738" : "#1E1B3A" }}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                    style={{ background: "#6B5ED7" }}>{d.avatarInitials as string}</div>
                                  <span className="text-white font-medium">{d.name as string}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono" style={{ color: "#8884AA" }}>{d.licenceNo as string}</td>
                              <td className="px-4 py-3" style={{ color: "#8884AA" }}>{d.phone as string}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded-full capitalize font-semibold text-[10px]"
                                  style={{ background: d.status === "active" ? "#10B98122" : "#EF444422", color: d.status === "active" ? "#10B981" : "#EF4444" }}>
                                  {d.status as string}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-14 h-1.5 rounded-full" style={{ background: "#2D2A50" }}>
                                    <div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor }} />
                                  </div>
                                  <span style={{ color: scoreColor }}>{score}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-white">{fmt(Number(d.totalTrips))}</td>
                              <td className="px-4 py-3 text-white">{fmt(Number(d.totalKm))} km</td>
                              <td className="px-4 py-3" style={{ color: "#8884AA" }}>{d.assignedVehicleId ? "Assigned" : "Unassigned"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── ALERTS ── */}
              {nav === "Alerts" && (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #2D2A50" }}>
                  <div className="flex items-center justify-between px-5 py-3" style={{ background: "#1E1B3A", borderBottom: "1px solid #2D2A50" }}>
                    <p className="text-sm font-bold text-white">Vehicle Alerts</p>
                    {alertMeta.active > 0 && <span className="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full font-bold">{alertMeta.active} unresolved</span>}
                  </div>
                  <div>
                    {alerts.map((a, i) => (
                      <div key={a.id ?? i} className="flex items-start gap-4 px-5 py-4 border-b hover:bg-white/3 transition-colors"
                        style={{ borderColor: "#2D2A50", background: i % 2 === 0 ? "#1A1738" : "#1E1B3A" }}>
                        <div className="text-2xl flex-shrink-0">{ALERT_ICON[a.type] ?? "⚠️"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-semibold text-sm">{a.plateNumber}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold capitalize"
                              style={{ background: ALERT_COLOR[a.severity] + "22", color: ALERT_COLOR[a.severity] }}>
                              {a.severity}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full capitalize"
                              style={{ background: "#252245", color: "#8884AA" }}>{a.type.replace("_", " ")}</span>
                            {a.resolvedAt && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#10B98122", color: "#10B981" }}>Resolved</span>}
                          </div>
                          <p className="text-xs text-white">{a.message}</p>
                          <p className="text-[10px] mt-1" style={{ color: "#8884AA" }}>{timeAgo(a.detectedAt)}</p>
                        </div>
                        {!a.resolvedAt && (
                          <button
                            onClick={() => vehicleApi.resolveAlert(a.id).then(loadAll)}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold flex-shrink-0 transition-colors hover:bg-emerald-500/20"
                            style={{ background: "#10B98122", color: "#10B981", border: "1px solid #10B98144" }}>
                            Resolve
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── GEOFENCES ── */}
              {nav === "Geofences" && (
                <div className="grid xl:grid-cols-2 gap-4">
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #2D2A50" }}>
                    <div className="px-5 py-3" style={{ background: "#1E1B3A", borderBottom: "1px solid #2D2A50" }}>
                      <p className="text-sm font-bold text-white">Active Geofences</p>
                    </div>
                    <div>
                      {(geofences as Record<string, unknown>[]).map((gf, i) => (
                        <div key={gf.id as string} className="px-5 py-4 border-b flex items-start gap-4"
                          style={{ borderColor: "#2D2A50", background: i % 2 === 0 ? "#1A1738" : "#1E1B3A" }}>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: gf.active ? "#10B98122" : "#EF444422" }}>
                            <MapPin className="w-5 h-5" style={{ color: gf.active ? "#10B981" : "#EF4444" }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-white font-semibold text-sm">{gf.name as string}</p>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${gf.active ? "text-emerald-400 bg-emerald-400/10" : "text-gray-400 bg-gray-400/10"}`}>
                                {gf.active ? "Active" : "Inactive"}
                              </span>
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: "#8884AA" }}>{gf.description as string}</p>
                            <div className="flex gap-3 mt-2 text-[10px]" style={{ color: "#8884AA" }}>
                              <span>Radius: {Number(gf.radiusM).toLocaleString()}m</span>
                              <span>Trigger: {gf.triggerOn as string}</span>
                              <span className="text-amber-400">Breaches: {gf.breachCount as number}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                    <h3 className="text-sm font-bold text-white mb-4">Geofences on Map</h3>
                    <svg viewBox={`0 0 ${SA_W} ${SA_H}`} className="w-full rounded-xl" style={{ background: "#13103A" }}>
                      <polygon
                        points="100,20 200,10 310,15 380,40 430,80 445,130 440,180 420,230 390,270 360,300 320,330 280,345 240,350 200,340 160,320 120,295 85,265 60,230 45,195 40,155 50,110 70,65 100,20"
                        fill="#252245" stroke="#3D3A6A" strokeWidth="1" />
                      {(geofences as Record<string, unknown>[]).map((gf, i) => {
                        const cx = lngToX(Number(gf.centerLng));
                        const cy = latToY(Number(gf.centerLat));
                        const r  = Math.max(8, Number(gf.radiusM) / 60);
                        const color = gf.active ? "#10B981" : "#6B7280";
                        return (
                          <g key={gf.id as string}>
                            <circle cx={cx} cy={cy} r={r} fill={color + "22"} stroke={color} strokeWidth="1.5" strokeDasharray="4,2" />
                            <circle cx={cx} cy={cy} r="4" fill={color} />
                            <text x={cx + 6} y={cy + 3} fontSize="7" fill={color}>{gf.name as string}</text>
                          </g>
                        );
                      })}
                      {vehicles.filter(v => v.status === "moving").slice(0, 15).map(v => (
                        <circle key={v.id} cx={lngToX(v.position.lng)} cy={latToY(v.position.lat)}
                          r="3" fill={STATUS_COLOR[v.status]} opacity="0.8" />
                      ))}
                    </svg>
                  </div>
                </div>
              )}

              {/* ── ANALYTICS ── */}
              {nav === "Analytics" && analytics && (
                <div className="grid xl:grid-cols-2 gap-4">
                  {/* By Fleet */}
                  <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                    <h3 className="text-sm font-bold text-white mb-4">Fleet Group Breakdown</h3>
                    {((analytics.byFleet as Record<string, unknown>[]) ?? []).map((f, i) => (
                      <div key={i} className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white font-medium">{f.fleet as string}</span>
                          <span style={{ color: "#8884AA" }}>{f.count as number} vehicles · {f.moving as number} moving</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: "#2D2A50" }}>
                          <div className="h-full rounded-full" style={{
                            width: `${((f.count as number) / 50) * 100}%`,
                            background: ["#6B5ED7","#10B981","#F59E0B","#EF4444","#8B5CF6"][i % 5],
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* By Status */}
                  <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                    <h3 className="text-sm font-bold text-white mb-4">Status Distribution</h3>
                    {((analytics.byStatus as Record<string, unknown>[]) ?? []).map((s, i) => (
                      <div key={i} className="flex items-center gap-3 mb-3">
                        <span className="text-xs w-20 capitalize" style={{ color: STATUS_COLOR[s.status as string] ?? "#8884AA" }}>{s.status as string}</span>
                        <div className="flex-1 h-2 rounded-full" style={{ background: "#2D2A50" }}>
                          <div className="h-full rounded-full" style={{ width: `${((s.count as number) / 50) * 100}%`, background: STATUS_COLOR[s.status as string] ?? "#6B5ED7" }} />
                        </div>
                        <span className="text-xs font-bold text-white w-6 text-right">{s.count as number}</span>
                      </div>
                    ))}
                  </div>

                  {/* Alert types */}
                  <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                    <h3 className="text-sm font-bold text-white mb-4">Alerts by Type</h3>
                    {((analytics.alertsByType as Record<string, unknown>[]) ?? []).filter(a => (a.count as number) > 0).map((a, i) => (
                      <div key={i} className="flex items-center gap-3 mb-2">
                        <span className="text-base">{ALERT_ICON[a.type as string] ?? "⚠️"}</span>
                        <span className="text-xs flex-1 capitalize" style={{ color: "#9896B8" }}>{(a.type as string).replace("_", " ")}</span>
                        <span className="text-xs font-bold text-white">{a.count as number} total</span>
                        {(a.active as number) > 0 && (
                          <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{a.active as number} active</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Snapshot */}
                  <div className="rounded-2xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                    <h3 className="text-sm font-bold text-white mb-4">Current Snapshot</h3>
                    <div className="space-y-2">
                      {snapshot && Object.entries(snapshot).filter(([k]) => k !== "timestamp").slice(0, 10).map(([k, v], i) => (
                        <div key={i} className="flex justify-between border-b py-2 text-xs" style={{ borderColor: "#2D2A50" }}>
                          <span className="capitalize" style={{ color: "#9896B8" }}>{k.replace(/([A-Z])/g, " $1").trim()}</span>
                          <span className="font-bold text-white">{typeof v === "number" ? v.toLocaleString() : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── SETTINGS placeholder ── */}
              {nav === "Settings" && (
                <div className="rounded-2xl p-8 text-center" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
                  <Settings className="w-12 h-12 mx-auto mb-3" style={{ color: "#534AB7" }} />
                  <p className="text-white font-bold mb-1">System Settings</p>
                  <p className="text-sm" style={{ color: "#8884AA" }}>Configuration panel — coming in next update.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
