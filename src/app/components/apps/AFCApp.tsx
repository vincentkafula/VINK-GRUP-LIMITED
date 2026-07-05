/**
 * AFC (Automatic Fare Collection) App — T-T20 Terminal
 * Hardware: Telpo T-T20 · Android 12 · 7" 720×1280 · Quad-Core 2.0 GHz
 *
 * Card reading:
 * • ISO 14443 Type A/B contactless (NFC)
 * • Mifare Classic / Mifare DESFire
 * • EMV Contactless L1 · Visa Paywave · Mastercard Paypass
 * • 1D/2D barcode hard decoding (QR validation)
 * • 4 × SAM slots for secure key storage
 *
 * Speed guarantee:
 * • OFFLINE path (fares < R500): 280–520ms — no network needed
 * • ONLINE fast path (VMS internal): 600–900ms
 * • ONLINE Visa/MC path: 1.2–2.8s (fallback only)
 *
 * Connectivity: LTE / WCDMA / GPRS · WiFi · Bluetooth · GPS built-in
 * Power: DC 9–40V · RS485 · RS232 · Ethernet · CAN (FMS)
 * Environment: IP65 · IK08 · CE · RoHS · -20°C to 60°C
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { Wifi, BatteryCharging, CheckCircle, X, TrendingUp, MapPin, Settings, Clock, Zap, WifiOff, Activity, Cpu, QrCode, Shield, Bluetooth, Navigation, Search, Users, ChevronDown, ChevronUp, FileText, User, Car, AlertTriangle, Edit3, Lock } from "lucide-react";
import { ROUTES, ZONES, ZONE_COLORS, type Route } from "../../data/routeData";
import { TAXI_ASSOCIATIONS, PROVINCES, LEVEL_COLORS, PROVINCE_EMOJIS, type AssociationLevel } from "../../data/taxiAssociations";
import {
  type VehicleProfile, EMPTY_PROFILE, ASSOCIATION_ROUTE_ORIGINS,
  docStatus, DOC_STATUS_COLORS,
} from "../../data/vehicleProfile";

interface Props { isOpen: boolean; onClose: () => void; }

// ─── T-T20 Hardware Specification ────────────────────────────────────────────
const T_T20_SPEC = {
  model: "T-T20",
  name: "Ticket Validator — T Line",
  certifications: ["CE", "RoHS", "IK08", "IP65"],
  processor: {
    os: "Android 12",
    cpu: "Quad-Core 2.0 GHz",
    ram: "2 GB DDR (4 GB opt.)",
    storage: "16 GB eMMC (64 GB opt.)",
    expansion: "Ext. TF card slot",
  },
  display: {
    size: "7-inch · 720×1280",
    keys: "2 functional keys",
    barcode: "1D/2D hard decoding",
    camera: "Dual-lens RGB+IR · 2MP+1.3MP · Face recognition",
  },
  connectivity: {
    mobile: "LTE / WCDMA / GPRS",
    local: "WiFi + Bluetooth",
    gps: "Built-in",
    sim: "1 SIM slot",
  },
  cardReading: {
    contactless: "ISO 14443 Type A/B · Mifare",
    emv: "Contactless L1 · Paywave · Paypass",
    sam: "4 SAMs (8 SAMs opt.)",
    led: "Green / Red / Blue status",
  },
  ports: {
    usb: "1× Micro USB + 1× USB",
    dc: "1× DC charger",
    gpio: "4 GPIO (2× In, 2× Out)",
    serial: "RS485 + RS232",
    network: "1× Ethernet + 1× FMS (CAN)",
    relay: "1 relay",
    poe: "Standard + 12V/24V non-std.",
    power: "DC 9–40V",
  },
  environment: {
    opTemp: "-20°C to 60°C",
    storage: "-40°C to 85°C",
    audio: "Digital audio speaker",
    bracket: "Supported",
    security: "Security locker",
  },
  applications: ["Concerts", "Festivals", "Stadiums", "Venues", "Transit"],
};

// Offline processing stages — on T-T20 device (ISO 14443 Type A/B NFC, 4× SAM)
const OFFLINE_STAGES = [
  { label: "ISO 14443 A/B read",    ms: 55,  desc: "T-T20 NFC field reads card chip data" },
  { label: "SAM key lookup",        ms: 30,  desc: "SAM slot 1: issuer public key retrieved" },
  { label: "ARQC verify",           ms: 80,  desc: "Offline cryptogram validated on-device" },
  { label: "Floor limit check",     ms: 15,  desc: "Fare < R500 floor limit → offline approved" },
  { label: "Balance token check",   ms: 40,  desc: "Stored balance token validated in eMMC" },
  { label: "APPROVED",              ms: 10,  desc: "Fare deducted · LED green · Audio beep" },
];

// Online fast path — T-T20 LTE / WCDMA / WiFi
const ONLINE_STAGES = [
  { label: "ISO 14443 A/B read",    ms: 55,  desc: "T-T20 NFC field reads card chip data" },
  { label: "SAM ARQC generate",     ms: 80,  desc: "SAM slot 1: online cryptogram generated" },
  { label: "LTE auth request",      ms: 45,  desc: "ISO 8583 → VMS via LTE (persistent WS)" },
  { label: "Balance check",         ms: 120, desc: "Real-time balance verified at VMS server" },
  { label: "ARPC response",         ms: 30,  desc: "Auth code extracted, ARPC verified" },
  { label: "APPROVED",              ms: 15,  desc: "Fare deducted · LED green · SMS receipt" },
];

type TapResult = { ms: number; path: "offline" | "online_fast" | "online_network"; authCode: string; } | null;
type TapEntry = { time: string; card: string; amount: number; ms: number; path: string; status: "approved" | "declined"; };

type AFCScreen = "home" | "tap" | "earnings" | "route" | "performance" | "settings" | "device" | "associations" | "profile" | "setup";

// Default route: Khayelitsha → Cape Town (route ID 452)
const DEFAULT_ROUTE = ROUTES.find(r => r.id === 452) ?? ROUTES[0];

// ─── Route selector component ─────────────────────────────────────────────────
function RouteSelector({ selectedRoute, routeSearch, setRouteSearch, routeZoneFilter, setRouteZoneFilter, onSelect, P, GOLD, routes }: {
  selectedRoute: Route; routeSearch: string; setRouteSearch: (s: string) => void;
  routeZoneFilter: string; setRouteZoneFilter: (z: string) => void;
  onSelect: (r: Route) => void; P: string; GOLD: string; routes: Route[];
}) {
  const filtered = useMemo(() => {
    const q = routeSearch.toLowerCase();
    return routes.filter(r => {
      const matchesZone = routeZoneFilter === "all" || r.zone === routeZoneFilter;
      const matchesSearch = !q ||
        r.origin.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q);
      return matchesZone && matchesSearch;
    });
  }, [routes, routeSearch, routeZoneFilter]);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <p className="text-white font-black text-sm">Select Route</p>
        <span className="text-white/30 text-[10px] font-mono">{filtered.length} of {routes.length}</span>
      </div>

      {/* Search */}
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
        <input
          value={routeSearch}
          onChange={e => setRouteSearch(e.target.value)}
          placeholder="Search origin or destination…"
          className="w-full pl-8 pr-3 py-2 rounded-xl text-xs text-white placeholder-white/30 outline-none"
          style={{ background: "#1A1A2E", border: "1px solid #2D2A50" }}
        />
      </div>

      {/* Zone filter pills */}
      <div className="flex gap-1 flex-shrink-0 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
        <button onClick={() => setRouteZoneFilter("all")}
          className="flex-shrink-0 px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
          style={{ background: routeZoneFilter === "all" ? "#fff" : "#1A1A2E", color: routeZoneFilter === "all" ? "#0A0A14" : "rgba(255,255,255,.5)" }}>
          All
        </button>
        {ZONES.map(z => (
          <button key={z} onClick={() => setRouteZoneFilter(z === routeZoneFilter ? "all" : z)}
            className="flex-shrink-0 px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
            style={{ background: routeZoneFilter === z ? ZONE_COLORS[z] : "#1A1A2E", color: routeZoneFilter === z ? "#fff" : "rgba(255,255,255,.5)" }}>
            {z} · R{z === "Zone 1" ? 8 : z === "Zone 2" ? 12 : z === "Zone 3" ? 18 : z === "Zone 4" ? 25 : 35}
          </button>
        ))}
      </div>

      {/* Route list — virtualized feel with max-height scroll */}
      <div className="flex-1 overflow-y-auto space-y-1" style={{ scrollbarWidth: "none" }}>
        {filtered.length === 0 && (
          <p className="text-white/30 text-xs text-center py-6">No routes match "{routeSearch}"</p>
        )}
        {filtered.map(route => {
          const isSelected = route.id === selectedRoute.id;
          const zColor = ZONE_COLORS[route.zone] ?? "#888";
          return (
            <button key={route.id} onClick={() => onSelect(route)}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all text-left"
              style={{ background: isSelected ? P + "30" : "#1A1A2E", border: `1px solid ${isSelected ? P : "transparent"}` }}>
              {/* Zone dot */}
              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: zColor }} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-[11px] font-semibold leading-tight truncate">
                  {route.origin}
                </p>
                <p className="text-white/40 text-[10px] leading-tight truncate">
                  → {route.destination}
                </p>
              </div>
              <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                <span className="font-black text-sm" style={{ color: GOLD }}>R{route.baseFare.toFixed(0)}</span>
                <span className="text-[8px] font-mono" style={{ color: zColor }}>{route.distanceKm.toFixed(1)}km</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Load/save vehicle profile from device localStorage
const PROFILE_KEY = "vms_afc_vehicle_profile";
function loadProfile(): VehicleProfile | null {
  try { const s = localStorage.getItem(PROFILE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveProfile(p: VehicleProfile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* device storage full */ }
}

export function AFCApp({ isOpen, onClose }: Props) {
  const [screen, setScreen]             = useState<AFCScreen>("home");
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfile | null>(() => loadProfile());
  const [selectedRoute, setSelectedRoute] = useState<Route>(DEFAULT_ROUTE);
  const [routeSearch, setRouteSearch] = useState("");
  const [routeZoneFilter, setRouteZoneFilter] = useState<string>("all");
  const [todayEarnings, setTodayEarnings] = useState(392.50);

  // Routes visible to this device — filtered by enrolled association
  const allowedRoutes = useMemo(() => {
    if (!vehicleProfile?.associationName) return ROUTES;
    const keywords = ASSOCIATION_ROUTE_ORIGINS[vehicleProfile.associationName];
    if (!keywords || keywords.length === 0) return ROUTES; // national/provincial = all
    return ROUTES.filter(r =>
      keywords.some(kw => r.origin.toUpperCase().includes(kw))
    );
  }, [vehicleProfile]);
  const [passengerCount, setPassengerCount] = useState(28);
  const [pendingBatch, setPendingBatch]   = useState(7); // offline txns awaiting batch upload
  const [networkOnline, setNetworkOnline] = useState(true);
  const [offlineMode, setOfflineMode]     = useState(false);

  // Processing state
  const [processing, setProcessing]       = useState(false);
  const [stage, setStage]                 = useState<number>(-1);
  const [result, setResult]               = useState<TapResult>(null);
  const [tapHistory, setTapHistory]       = useState<TapEntry[]>([
    { time: "14:32", card: "•••• 8842", amount: 14.00, ms: 310,  path: "offline",      status: "approved" },
    { time: "14:28", card: "•••• 3317", amount: 14.00, ms: 285,  path: "offline",      status: "approved" },
    { time: "14:19", card: "•••• 7751", amount: 14.00, ms: 720,  path: "online_fast",  status: "approved" },
    { time: "14:05", card: "•••• 2294", amount: 14.00, ms: 495,  path: "offline",      status: "declined" },
    { time: "13:58", card: "•••• 5523", amount: 14.00, ms: 340,  path: "offline",      status: "approved" },
    { time: "13:45", card: "•••• 9981", amount: 14.00, ms: 280,  path: "offline",      status: "approved" },
  ]);
  const [avgMs, setAvgMs] = useState(405);
  const [time, setTime] = useState(new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }));
  const stageTimerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setTime(new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })), 10000);
    return () => clearInterval(t);
  }, [isOpen]);

  const simulateTap = () => {
    if (processing) return;
    setProcessing(true);
    setStage(0);
    setResult(null);

    // Decide path: offline (fast) 85% of the time for low-fare routes
    const useFare = selectedRoute.baseFare;
    const useOffline = useFare < 500 && networkOnline ? Math.random() > 0.15 : false;
    const stages = useOffline ? OFFLINE_STAGES : ONLINE_STAGES;
    const success = Math.random() > 0.04; // 96% approval rate

    let currentStage = 0;
    let totalMs = 0;

    const advance = () => {
      const s = stages[currentStage];
      totalMs += s.ms + Math.floor(Math.random() * 30 - 10);
      currentStage++;
      setStage(currentStage - 1);

      if (currentStage < stages.length) {
        stageTimerRef.current = setTimeout(advance, s.ms + Math.floor(Math.random() * 30));
      } else {
        // Done
        const path: TapResult["path"] = useOffline ? "offline" : "online_fast";
        const finalMs = Math.max(200, totalMs);
        const authCode = success ? Math.floor(100000 + Math.random() * 900000).toString() : "";
        setResult(success ? { ms: finalMs, path, authCode } : null);
        setProcessing(false);
        setStage(-1);

        if (success) {
          setTodayEarnings(e => +(e + useFare).toFixed(2));
          setPassengerCount(c => c + 1);
          if (useOffline) setPendingBatch(b => b + 1);
          const newEntry: TapEntry = {
            time: new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }),
            card: `•••• ${Math.floor(1000 + Math.random() * 9000)}`,
            amount: useFare,
            ms: finalMs,
            path,
            status: "approved",
          };
          setTapHistory(prev => [newEntry, ...prev].slice(0, 20));
          setAvgMs(prev => Math.round((prev * 0.9 + finalMs * 0.1)));
        }

        // Auto-clear result after 2.5s
        stageTimerRef.current = setTimeout(() => {
          setResult(null);
          // Only stay on tap screen if we didn't get an error
          if (success && screen === "tap") {
            // Ready for next tap
          }
        }, 2500);
      }
    };

    stageTimerRef.current = setTimeout(advance, stages[0].ms + Math.floor(Math.random() * 20));
  };

  useEffect(() => () => clearTimeout(stageTimerRef.current), []);

  if (!isOpen) return null;

  const P = "#5B2D8E";
  const GOLD = "#F5A623";
  const stages = selectedRoute.baseFare < 500 && networkOnline ? OFFLINE_STAGES : ONLINE_STAGES;
  const isOfflinePath = selectedRoute.baseFare < 500 && networkOnline;

  const pathColor = (path: string) =>
    path === "offline" ? "#10B981" : path === "online_fast" ? "#3B82F6" : "#F59E0B";
  const pathLabel = (path: string) =>
    path === "offline" ? "OFFLINE" : path === "online_fast" ? "ONLINE-FAST" : "ONLINE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.85)" }}>
      <div className="relative w-full max-w-2xl h-full max-h-[560px] rounded-2xl overflow-hidden shadow-2xl border-4 border-gray-800 flex flex-col"
        style={{ background: "#0F0F1A" }}>

        {/* Status bar */}
        <div className="flex items-center justify-between px-5 py-2 text-white/70 text-xs flex-shrink-0" style={{ background: "#0A0A14" }}>
          <div className="flex items-center gap-3">
            <span className="font-bold text-white">{time}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: networkOnline ? "#10B981" + "30" : "#EF444430", color: networkOnline ? "#10B981" : "#EF4444" }}>
              {networkOnline ? "● ONLINE" : "● OFFLINE MODE"}
            </span>
            {pendingBatch > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-yellow-500/20 text-yellow-400">
                {pendingBatch} pending sync
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Navigation className="w-3 h-3 text-blue-400" title="GPS active" />
            <Bluetooth className="w-3 h-3 text-blue-400" />
            {networkOnline ? <Wifi className="w-3.5 h-3.5 text-green-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
            <span className="text-[9px] font-bold" style={{ color: networkOnline ? "#10B981" : "#9CA3AF" }}>LTE</span>
            <BatteryCharging className="w-3.5 h-3.5 text-green-400" />
            <span className="text-[10px]">87%</span>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-16 flex flex-col items-center py-3 gap-4 border-r border-white/5 flex-shrink-0" style={{ background: "#0A0A14" }}>
            {[
              { id: "home",        icon: <Zap className="w-4 h-4" />,        label: "Home" },
              { id: "tap",         icon: <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-current" /></div>, label: "Tap" },
              { id: "performance", icon: <Activity className="w-4 h-4" />,   label: "Speed" },
              { id: "earnings",    icon: <TrendingUp className="w-4 h-4" />, label: "Earn" },
              { id: "route",       icon: <MapPin className="w-4 h-4" />,     label: "Route" },
              { id: "associations", icon: <Users className="w-4 h-4" />,      label: "Assoc" },
              { id: "profile",     icon: <FileText className="w-4 h-4" />,   label: "Profile" },
              { id: "setup",       icon: <Edit3 className="w-4 h-4" />,      label: vehicleProfile ? "Edit" : "Setup" },
              { id: "device",      icon: <Cpu className="w-4 h-4" />,        label: "Specs" },
              { id: "settings",    icon: <Settings className="w-4 h-4" />,   label: "More" },
            ].map(item => (
              <button key={item.id} onClick={() => setScreen(item.id as AFCScreen)}
                className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl w-full transition-all"
                style={{ background: screen === item.id ? P + "40" : "transparent", color: screen === item.id ? GOLD : "rgba(255,255,255,.45)" }}>
                {item.icon}
                <span className="text-[8px] font-medium">{item.label}</span>
              </button>
            ))}
            <div className="mt-auto mb-1">
              <button onClick={onClose} className="flex flex-col items-center gap-0.5 p-1.5 text-white/20 hover:text-white/60 transition-colors">
                <X className="w-4 h-4" /><span className="text-[8px]">Exit</span>
              </button>
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 overflow-y-auto p-4" style={{ background: "#111120" }}>

            {/* HOME */}
            {screen === "home" && (
              <div className="h-full flex flex-col gap-3">
                {/* Device badge */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black tracking-widest" style={{ color: GOLD }}>TELPO T-T20</span>
                    <span className="text-[8px] text-white/30">·</span>
                    <span className="text-[9px] text-white/40">Android 12 · Quad-Core 2.0 GHz</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {["CE","IK08","IP65"].map(c => (
                      <span key={c} className="text-[7px] font-bold px-1 py-0.5 rounded" style={{ background: "#2D2A50", color: "#9CA3AF" }}>{c}</span>
                    ))}
                  </div>
                </div>

                {/* Route + fare */}
                <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: P }}>
                  <MapPin className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white/60 text-[9px] uppercase tracking-wide">Current Route</p>
                    <p className="text-white font-bold text-sm truncate">{`${selectedRoute.origin} → ${selectedRoute.destination}`}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white/60 text-[9px]">Fare</p>
                    <p className="text-yellow-400 font-black text-xl">R{selectedRoute.baseFare.toFixed(2)}</p>
                  </div>
                </div>

                {/* Speed stats */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Avg speed",    value: `${avgMs}ms`, color: avgMs < 500 ? "#10B981" : avgMs < 1000 ? "#3B82F6" : "#F59E0B" },
                    { label: "Today",        value: `R${todayEarnings.toFixed(0)}`, color: GOLD },
                    { label: "Passengers",   value: passengerCount.toString(), color: "#3B82F6" },
                    { label: "Batch queue",  value: pendingBatch.toString(), color: pendingBatch > 20 ? "#F59E0B" : "#10B981" },
                  ].map((stat, i) => (
                    <div key={i} className="rounded-xl p-2 text-center" style={{ background: "#1A1A2E" }}>
                      <p className="font-black text-lg leading-none" style={{ color: stat.color }}>{stat.value}</p>
                      <p className="text-white/40 text-[9px] mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* Big TAP button */}
                <button onClick={() => setScreen("tap")}
                  className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl"
                  style={{ background: `linear-gradient(135deg,${P},#9585EA)`, boxShadow: `0 8px 32px ${P}50` }}>
                  <span className="text-2xl">📱</span>
                  TAP TO COLLECT FARE
                </button>

                {/* Speed indicator */}
                <div className="rounded-xl p-3" style={{ background: "#1A1A2E" }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide">Processing Speed Guarantee</p>
                    <span className="text-[10px] font-black text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">✓ Sub-3s</span>
                  </div>
                  <div className="flex gap-3">
                    {[
                      { label: "Offline (typical)", target: "<500ms", color: "#10B981" },
                      { label: "Online-fast",        target: "<900ms", color: "#3B82F6" },
                      { label: "Network auth",       target: "<3s",    color: "#F59E0B" },
                    ].map((s, i) => (
                      <div key={i} className="flex-1 rounded-lg p-2 text-center" style={{ background: s.color + "12" }}>
                        <p className="text-[8px] text-white/50 leading-tight">{s.label}</p>
                        <p className="text-[11px] font-black mt-0.5" style={{ color: s.color }}>{s.target}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent taps */}
                <div className="flex-1 overflow-y-auto space-y-1">
                  {tapHistory.slice(0, 5).map((t, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "#1A1A2E" }}>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-white/30" />
                        <span className="text-white/50 text-[10px]">{t.time}</span>
                        <span className="text-white/30 text-[10px]">{t.card}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: pathColor(t.path) + "20", color: pathColor(t.path) }}>
                          {pathLabel(t.path)}
                        </span>
                        <span className="text-[10px] font-bold" style={{ color: t.ms < 500 ? "#10B981" : t.ms < 1000 ? "#3B82F6" : "#F59E0B" }}>{t.ms}ms</span>
                        <span className="text-white font-semibold text-sm">R{t.amount.toFixed(2)}</span>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.status === "approved" ? "#10B981" : "#EF4444" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAP SCREEN */}
            {screen === "tap" && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                {/* Route info */}
                <div className="text-center">
                  <p className="text-white/50 text-xs">{`${selectedRoute.origin} → ${selectedRoute.destination}`}</p>
                  <p className="text-yellow-400 font-black text-3xl mt-0.5">R{selectedRoute.baseFare.toFixed(2)}</p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: isOfflinePath ? "#10B98120" : "#3B82F620", color: isOfflinePath ? "#10B981" : "#3B82F6" }}>
                      {isOfflinePath ? "⚡ OFFLINE PATH — no network needed" : "🌐 ONLINE FAST PATH"}
                    </span>
                  </div>
                </div>

                {/* NFC ring */}
                <div onClick={!processing ? simulateTap : undefined}
                  className="relative w-44 h-44 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all active:scale-95 select-none"
                  style={{
                    background: processing ? P + "20" : result ? (result.ms ? "#10B98120" : "#EF444420") : "#1A1A2E",
                    border: `3px solid ${processing ? P : result?.ms ? "#10B981" : result === null && !processing ? "#333" : "#EF4444"}`,
                    boxShadow: processing ? `0 0 40px ${P}40` : result?.ms ? "0 0 30px #10B98130" : "none",
                  }}>
                  {processing ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <p className="text-white/70 text-xs font-bold">{stages[stage]?.label ?? "Processing…"}</p>
                      <p className="text-white/30 text-[9px] text-center px-3">{stages[stage]?.desc ?? ""}</p>
                    </div>
                  ) : result?.ms ? (
                    <div className="flex flex-col items-center gap-1">
                      <CheckCircle className="w-10 h-10 text-green-400" />
                      <p className="text-green-400 font-black text-sm">APPROVED</p>
                      <p className="text-white/70 text-xs font-bold">{result.ms}ms</p>
                      <p className="text-[9px] font-bold px-2 py-0.5 rounded-full mt-0.5" style={{ background: pathColor(result.path) + "20", color: pathColor(result.path) }}>
                        {pathLabel(result.path)}
                      </p>
                    </div>
                  ) : result === undefined || (!processing && !result) ? (
                    <>
                      <span className="text-4xl mb-1">📡</span>
                      <span className="text-white font-black text-sm tracking-wide">TAP / SCAN</span>
                      <span className="text-white/40 text-[9px] text-center px-2">ISO 14443 A/B · Mifare · Paywave · Paypass · QR</span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <X className="w-10 h-10 text-red-400" />
                      <p className="text-red-400 font-black text-sm">DECLINED</p>
                      <p className="text-white/40 text-[9px]">Insufficient balance</p>
                    </div>
                  )}

                  {/* Pulse rings when idle */}
                  {!processing && !result && (
                    <>
                      <div className="absolute inset-0 rounded-full border border-white/5 animate-ping" />
                      <div className="absolute -inset-4 rounded-full border border-white/5" style={{ animation: "ping 2s cubic-bezier(0,0,.2,1) infinite", animationDelay: "0.5s" }} />
                    </>
                  )}
                </div>

                {/* Progress stages */}
                {(processing || result) && (
                  <div className="w-full space-y-1">
                    {stages.map((s, i) => {
                      const done  = result ? true : stage > i;
                      const active = !result && stage === i;
                      const pending = !result && stage < i;
                      return (
                        <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                          style={{ background: active ? P + "20" : done ? "#10B98110" : "transparent" }}>
                          <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: done ? "#10B981" : active ? P : "#374151" }}>
                            {done ? <CheckCircle className="w-2.5 h-2.5 text-white" />
                                  : <span className="text-[8px] text-white font-bold">{i + 1}</span>}
                          </div>
                          <span className="text-xs text-white/70 flex-1">{s.label}</span>
                          <span className="text-[9px] text-white/30">{s.ms}ms</span>
                          {active && <div className="w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!processing && !result && (
                  <p className="text-white/30 text-[10px] text-center">
                    {isOfflinePath ? "Offline auth — no network needed · Auto-syncs every 30 min" : "Online fast path · Direct VMS connection"}
                  </p>
                )}
              </div>
            )}

            {/* PERFORMANCE */}
            {screen === "performance" && (
              <div className="space-y-3">
                <p className="text-white font-black text-base">Speed Performance</p>

                {/* Avg speed gauge */}
                <div className="rounded-xl p-4 text-center" style={{ background: "#1A1A2E" }}>
                  <p className="text-white/50 text-[10px] uppercase tracking-wide mb-1">Average processing time</p>
                  <p className="font-black text-4xl" style={{ color: avgMs < 500 ? "#10B981" : avgMs < 1000 ? "#3B82F6" : "#F59E0B" }}>{avgMs}ms</p>
                  <p className="text-white/40 text-[10px] mt-1">3-second guarantee: {avgMs < 3000 ? "✓ MET" : "⚠ EXCEEDED"}</p>
                  <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (avgMs / 3000) * 100)}%`, background: avgMs < 500 ? "#10B981" : avgMs < 1000 ? "#3B82F6" : "#F59E0B" }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-white/30 mt-1">
                    <span>0ms</span><span>500ms</span><span>1s</span><span>3s max</span>
                  </div>
                </div>

                {/* Path breakdown */}
                <div className="rounded-xl p-4" style={{ background: "#1A1A2E" }}>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide mb-3">Authorization paths today</p>
                  {[
                    { path: "OFFLINE",       pct: 82, ms: "280–520ms", desc: "EMV offline crypto · No network · Batch sync", color: "#10B981" },
                    { path: "ONLINE FAST",   pct: 15, ms: "600–900ms", desc: "VMS WebSocket · Internal auth", color: "#3B82F6" },
                    { path: "VISA/MC NET",   pct: 3,  ms: "1.2–2.8s",  desc: "Full network auth · Fallback path", color: "#F59E0B" },
                  ].map((p, i) => (
                    <div key={i} className="mb-3">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-bold" style={{ color: p.color }}>{p.path}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-white/40">{p.ms}</span>
                          <span className="text-xs font-black text-white">{p.pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-0.5">
                        <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: p.color }} />
                      </div>
                      <p className="text-[9px] text-white/30">{p.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Tap history with timing */}
                <div className="rounded-xl overflow-hidden" style={{ background: "#1A1A2E" }}>
                  <div className="px-3 py-2 border-b border-white/5">
                    <p className="text-white/60 text-[10px] font-bold uppercase">Recent taps</p>
                  </div>
                  {tapHistory.slice(0, 8).map((t, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white/40 text-[9px]">{t.time}</span>
                        <span className="text-white/30 text-[9px]">{t.card}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold px-1.5 rounded" style={{ background: pathColor(t.path) + "20", color: pathColor(t.path) }}>
                          {pathLabel(t.path)}
                        </span>
                        <span className="text-[11px] font-black" style={{ color: t.ms < 500 ? "#10B981" : t.ms < 1000 ? "#3B82F6" : "#F59E0B" }}>{t.ms}ms</span>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.status === "approved" ? "#10B981" : "#EF4444" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EARNINGS */}
            {screen === "earnings" && (
              <div className="space-y-3">
                <p className="text-white font-black text-base">Today&apos;s Earnings</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Gross", value: `R${todayEarnings.toFixed(2)}`, color: "#10B981" },
                    { label: "Your 85%", value: `R${(todayEarnings * 0.85).toFixed(2)}`, color: GOLD },
                    { label: "Association 5%", value: `R${(todayEarnings * 0.05).toFixed(2)}`, color: "#3B82F6" },
                    { label: "Community 5%", value: `R${(todayEarnings * 0.05).toFixed(2)}`, color: "#8B5CF6" },
                  ].map((s, i) => (
                    <div key={i} className="rounded-xl p-3" style={{ background: "#1A1A2E" }}>
                      <p className="text-white/40 text-[9px]">{s.label}</p>
                      <p className="font-black text-lg mt-0.5" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl p-3" style={{ background: "#1A1A2E" }}>
                  <p className="text-white/50 text-[10px] mb-2">Pending batch sync ({pendingBatch} txns)</p>
                  <button onClick={() => { setPendingBatch(0); }}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white transition-all" style={{ background: P }}>
                    Sync now to VMS servers
                  </button>
                </div>
              </div>
            )}

            {/* ROUTE — 1,122 Cape Town routes from CSV */}
            {screen === "route" && (
              <RouteSelector
                selectedRoute={selectedRoute}
                routeSearch={routeSearch}
                setRouteSearch={setRouteSearch}
                routeZoneFilter={routeZoneFilter}
                setRouteZoneFilter={setRouteZoneFilter}
                onSelect={r => { setSelectedRoute(r); setScreen("home"); }}
                P={P} GOLD={GOLD}
                routes={allowedRoutes}
              />
            )}

            {/* SETTINGS */}
            {screen === "settings" && (
              <div className="space-y-3">
                <p className="text-white font-black text-base">Device Settings</p>
                {[
                  { label: "Offline mode",       sub: "Auth transactions without network (< R500 floor)",  toggle: offlineMode,    set: setOfflineMode },
                  { label: "4G LTE connection",  sub: networkOnline ? "Cell C LTE · Signal: strong" : "Disconnected — WiFi fallback active", toggle: networkOnline, set: setNetworkOnline },
                ].map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 p-3 rounded-xl" style={{ background: "#1A1A2E" }}>
                    <div>
                      <p className="text-white text-sm font-semibold">{s.label}</p>
                      <p className="text-white/40 text-[10px] mt-0.5">{s.sub}</p>
                    </div>
                    <button onClick={() => s.set(!s.toggle)}
                      className={`flex-shrink-0 w-10 h-6 rounded-full transition-all flex items-center ${s.toggle ? "bg-green-500" : "bg-gray-600"}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-all mx-0.5 ${s.toggle ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                ))}
                {[
                  { label: "Device ID",        value: "T-T20 · AFC-CPT-00847" },
                  { label: "Hardware model",   value: "Telpo T-T20 Ticket Validator" },
                  { label: "OS",               value: "Android 12" },
                  { label: "CPU",              value: "Quad-Core 2.0 GHz" },
                  { label: "Floor limit",      value: "R500.00" },
                  { label: "Batch interval",   value: "30 minutes" },
                  { label: "App version",      value: "Vink AFC v3.2.1" },
                  { label: "EMV kernel",       value: "Contactless L1 · Paywave · Paypass" },
                  { label: "SAM slots",        value: "4 × SAM active" },
                  { label: "PCI DSS",          value: "Compliant" },
                  { label: "Certifications",   value: "CE · RoHS · IK08 · IP65" },
                  { label: "GPS",              value: "Built-in · Active" },
                ].map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "#1A1A2E" }}>
                    <p className="text-white/50 text-[10px]">{s.label}</p>
                    <p className="text-white text-xs font-semibold">{s.value}</p>
                  </div>
                ))}
                <button onClick={() => setScreen("device")}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white mt-1"
                  style={{ background: P }}>
                  View Full Device Specification →
                </button>
              </div>
            )}

            {/* DEVICE SPEC — T-T20 full hardware sheet */}
            {screen === "device" && (
              <div className="space-y-4">
                {/* Header */}
                <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg,#1A1A2E,#0D1A4A)" }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-bold tracking-widest" style={{ color: GOLD }}>VINK AFC TERMINAL</p>
                      <p className="text-white font-black text-lg mt-0.5">{T_T20_SPEC.model}</p>
                      <p className="text-white/50 text-[10px]">{T_T20_SPEC.name}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {T_T20_SPEC.certifications.map(c => (
                        <span key={c} className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                          style={{ background: GOLD + "25", color: GOLD }}>{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {T_T20_SPEC.applications.map(a => (
                      <span key={a} className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                        style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>{a}</span>
                    ))}
                  </div>
                </div>

                {/* Spec groups */}
                {[
                  {
                    title: "Processor & Memory", icon: <Cpu className="w-3.5 h-3.5" />, color: "#6B5ED7",
                    rows: [
                      ["OS",        T_T20_SPEC.processor.os],
                      ["CPU",       T_T20_SPEC.processor.cpu],
                      ["RAM",       T_T20_SPEC.processor.ram],
                      ["Storage",   T_T20_SPEC.processor.storage],
                      ["Expansion", T_T20_SPEC.processor.expansion],
                    ],
                  },
                  {
                    title: "Display & Input", icon: <QrCode className="w-3.5 h-3.5" />, color: "#3B82F6",
                    rows: [
                      ["Screen",   T_T20_SPEC.display.size],
                      ["Keys",     T_T20_SPEC.display.keys],
                      ["Barcode",  T_T20_SPEC.display.barcode],
                      ["Camera",   T_T20_SPEC.display.camera],
                    ],
                  },
                  {
                    title: "Card Reading & Security", icon: <Shield className="w-3.5 h-3.5" />, color: GOLD,
                    rows: [
                      ["Contactless", T_T20_SPEC.cardReading.contactless],
                      ["EMV",         T_T20_SPEC.cardReading.emv],
                      ["SAM slots",   T_T20_SPEC.cardReading.sam],
                      ["LED",         T_T20_SPEC.cardReading.led],
                    ],
                  },
                  {
                    title: "Connectivity", icon: <Wifi className="w-3.5 h-3.5" />, color: "#10B981",
                    rows: [
                      ["Mobile",  T_T20_SPEC.connectivity.mobile],
                      ["Local",   T_T20_SPEC.connectivity.local],
                      ["GPS",     T_T20_SPEC.connectivity.gps],
                      ["SIM",     T_T20_SPEC.connectivity.sim],
                    ],
                  },
                  {
                    title: "Ports & Power", icon: <BatteryCharging className="w-3.5 h-3.5" />, color: "#EF4444",
                    rows: [
                      ["USB",     T_T20_SPEC.ports.usb],
                      ["Serial",  T_T20_SPEC.ports.serial],
                      ["Network", T_T20_SPEC.ports.network],
                      ["GPIO",    T_T20_SPEC.ports.gpio],
                      ["Relay",   T_T20_SPEC.ports.relay],
                      ["POE",     T_T20_SPEC.ports.poe],
                      ["Power",   T_T20_SPEC.ports.power],
                    ],
                  },
                  {
                    title: "Environment & Build", icon: <Navigation className="w-3.5 h-3.5" />, color: "#14B8A6",
                    rows: [
                      ["Op. Temp",  T_T20_SPEC.environment.opTemp],
                      ["Storage",   T_T20_SPEC.environment.storage],
                      ["Audio",     T_T20_SPEC.environment.audio],
                      ["Bracket",   T_T20_SPEC.environment.bracket],
                      ["Security",  T_T20_SPEC.environment.security],
                    ],
                  },
                ].map(group => (
                  <div key={group.title} className="rounded-xl overflow-hidden" style={{ background: "#1A1A2E" }}>
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "#2D2A50" }}>
                      <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: group.color + "25", color: group.color }}>{group.icon}</div>
                      <p className="text-white text-[11px] font-bold">{group.title}</p>
                    </div>
                    <div className="divide-y" style={{ borderColor: "#2D2A5033" }}>
                      {group.rows.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between px-3 py-2">
                          <p className="text-white/40 text-[10px]">{k}</p>
                          <p className="text-white text-[10px] font-semibold text-right max-w-[180px]">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <button onClick={() => setScreen("settings")} className="w-full py-2.5 rounded-xl text-xs font-semibold text-white/60 border" style={{ borderColor: "#2D2A50" }}>
                  ← Back to Settings
                </button>
              </div>
            )}

            {/* ASSOCIATIONS */}
            {screen === "associations" && (
              <AssociationsScreen P={P} GOLD={GOLD} />
            )}

            {/* VEHICLE PROFILE */}
            {screen === "profile" && (
              <ProfileScreen profile={vehicleProfile} allowedRoutes={allowedRoutes} onSetup={() => setScreen("setup")} P={P} GOLD={GOLD} />
            )}

            {/* DEVICE SETUP / REGISTRATION */}
            {screen === "setup" && (
              <SetupScreen
                initial={vehicleProfile ?? EMPTY_PROFILE}
                onSave={p => { saveProfile(p); setVehicleProfile(p); setScreen("profile"); }}
                onCancel={() => setScreen(vehicleProfile ? "profile" : "home")}
                P={P} GOLD={GOLD}
              />
            )}

          </div>
        </div>
      </div>

      {/* Unregistered overlay — prompts setup if no profile */}
      {!vehicleProfile && screen !== "setup" && screen !== "associations" && screen !== "device" && screen !== "settings" && (
        <div className="absolute inset-0 flex items-end z-20 pointer-events-none">
          <div className="w-full mx-3 mb-20 rounded-2xl p-4 pointer-events-auto"
            style={{ background: "#F5A62320", border: "1px solid #F5A62360", backdropFilter: "blur(8px)" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Device not configured</p>
                <p className="text-white/60 text-[11px] mt-0.5 leading-relaxed">Register this vehicle and association to unlock route restrictions and enable fare collection.</p>
              </div>
            </div>
            <button onClick={() => setScreen("setup")}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: "#F5A623", color: "#0A0A14" }}>
              Register Device Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Associations screen (inline, device-only) ──────────────────────────── */
function AssociationsScreen({ P, GOLD }: { P: string; GOLD: string }) {
  const [search,   setSearch]   = useState("");
  const [province, setProvince] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return TAXI_ASSOCIATIONS.filter(a =>
      (province === "all" || a.province === province) &&
      (!q || a.name.toLowerCase().includes(q) || a.province.toLowerCase().includes(q))
    );
  }, [search, province]);

  const byProvince = useMemo(() => {
    const map: Record<string, typeof TAXI_ASSOCIATIONS> = {};
    filtered.forEach(a => { if (!map[a.province]) map[a.province] = []; map[a.province].push(a); });
    return map;
  }, [filtered]);

  const provincesShown = PROVINCES.filter(p => byProvince[p]);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <p className="text-white font-black text-sm">Taxi Associations</p>
        <span className="text-white/30 text-[9px] font-mono">{filtered.length} / {TAXI_ASSOCIATIONS.length}</span>
      </div>

      {/* Search */}
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search association…"
          className="w-full pl-7 pr-3 py-1.5 rounded-lg text-[11px] text-white placeholder-white/30 outline-none"
          style={{ background: "#1A1A2E", border: "1px solid #2D2A50" }}
        />
      </div>

      {/* Province pills */}
      <div className="flex gap-1 flex-shrink-0 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
        <button onClick={() => setProvince("all")}
          className="flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold transition-all"
          style={{ background: province === "all" ? "#fff" : "#1A1A2E", color: province === "all" ? "#0A0A14" : "rgba(255,255,255,.5)" }}>
          All
        </button>
        {PROVINCES.map(p => (
          <button key={p} onClick={() => setProvince(province === p ? "all" : p)}
            className="flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold transition-all"
            style={{ background: province === p ? P : "#1A1A2E", color: province === p ? "#fff" : "rgba(255,255,255,.5)" }}>
            {PROVINCE_EMOJIS[p] ?? "📍"} {p.length > 9 ? p.split(" ")[0] : p}
          </button>
        ))}
      </div>

      {/* Accordion list */}
      <div className="flex-1 overflow-y-auto space-y-1" style={{ scrollbarWidth: "none" }}>
        {provincesShown.length === 0 && (
          <p className="text-white/30 text-[11px] text-center py-6">No results</p>
        )}
        {provincesShown.map(prov => {
          const list = byProvince[prov];
          const isOpen = expanded === prov || province === prov;
          return (
            <div key={prov} className="rounded-xl overflow-hidden" style={{ background: "#1A1A2E", border: "1px solid #2D2A50" }}>
              {/* Province row */}
              <button onClick={() => setExpanded(isOpen && expanded === prov ? null : prov)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left">
                <span className="text-base flex-shrink-0">{PROVINCE_EMOJIS[prov] ?? "📍"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[11px] font-bold truncate">{prov}</p>
                  <p className="text-white/30 text-[9px]">{list.length} association{list.length !== 1 ? "s" : ""}</p>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                  style={{ background: P + "80" }}>{list.length}</span>
                {isOpen
                  ? <ChevronUp className="w-3 h-3 text-white/40 flex-shrink-0" />
                  : <ChevronDown className="w-3 h-3 text-white/40 flex-shrink-0" />}
              </button>
              {/* Association rows */}
              {isOpen && (
                <div className="border-t divide-y" style={{ borderColor: "#2D2A5040", divideColor: "#2D2A5040" }}>
                  {list.map((a, i) => {
                    const lc = LEVEL_COLORS[a.level as AssociationLevel];
                    return (
                      <div key={i} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-[11px] font-semibold leading-snug">{a.name}</p>
                            <p className="text-white/40 text-[9px] mt-0.5 leading-snug">{a.notes}</p>
                          </div>
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-bold mt-0.5"
                            style={{ background: lc.bg, color: lc.text }}>
                            {a.level}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Profile screen ─────────────────────────────────────────────────────────── */
function ProfileScreen({ profile, allowedRoutes, onSetup, P, GOLD }: {
  profile: VehicleProfile | null; allowedRoutes: Route[];
  onSetup: () => void; P: string; GOLD: string;
}) {
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
        <Lock className="w-12 h-12 text-white/20" />
        <p className="text-white font-black text-sm">No vehicle registered</p>
        <p className="text-white/40 text-[11px] leading-relaxed">Register this device to a vehicle and association before collecting fares.</p>
        <button onClick={onSetup} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: P }}>
          Register Now
        </button>
      </div>
    );
  }

  const docs = [
    { label: "Registration Certificate", number: profile.registrationCertNumber,   expiry: profile.registrationCertExpiry },
    { label: "Operating Licence",        number: profile.operatingLicenceNumber,    expiry: profile.operatingLicenceExpiry },
    { label: "Insurance Policy",         number: profile.insurancePolicyNumber,     expiry: profile.insuranceExpiry },
    { label: "Roadworthy Certificate",   number: profile.roadworthyCertNumber,      expiry: profile.roadworthyExpiry },
    { label: "Driver's Licence",         number: profile.driverLicenceNumber,       expiry: profile.driverLicenceExpiry },
    { label: "PDP",                      number: profile.pdpNumber,                 expiry: profile.pdpExpiry },
  ];

  const alertDocs = docs.filter(d => docStatus(d.expiry) !== "valid");

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      {/* Document alerts */}
      {alertDocs.length > 0 && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "#EF444420", border: "1px solid #EF444440" }}>
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-bold text-[11px]">{alertDocs.length} document{alertDocs.length > 1 ? "s" : ""} need attention</p>
            {alertDocs.map((d,i) => (
              <p key={i} className="text-red-400/70 text-[10px] mt-0.5">{d.label} — {DOC_STATUS_COLORS[docStatus(d.expiry)].label}</p>
            ))}
          </div>
        </div>
      )}

      {/* Association */}
      <div className="rounded-xl p-3" style={{ background: "#1A1A2E" }}>
        <p className="text-white/40 text-[9px] font-bold uppercase tracking-wide mb-2">Association</p>
        <p className="text-white font-bold text-sm leading-snug">{profile.associationName}</p>
        <p className="text-white/40 text-[10px] mt-0.5">{profile.associationProvince} · {profile.associationLevel}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <p className="text-green-400 text-[10px] font-semibold">{allowedRoutes.length} routes authorised</p>
        </div>
      </div>

      {/* Vehicle */}
      <div className="rounded-xl p-3" style={{ background: "#1A1A2E" }}>
        <p className="text-white/40 text-[9px] font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5"><Car className="w-3 h-3" />Vehicle</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            ["Reg. Number",   profile.registrationNumber],
            ["Make / Model",  `${profile.make} ${profile.model}`],
            ["Year",          profile.year],
            ["Colour",        profile.colour],
            ["Type",          profile.vehicleType],
            ["Seats",         profile.seatingCapacity],
          ].map(([k,v]) => v ? (
            <div key={k}>
              <p className="text-white/30 text-[9px]">{k}</p>
              <p className="text-white text-[11px] font-semibold">{v}</p>
            </div>
          ) : null)}
        </div>
      </div>

      {/* Documents */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#1A1A2E" }}>
        <p className="text-white/40 text-[9px] font-bold uppercase tracking-wide px-3 pt-3 pb-2 flex items-center gap-1.5"><FileText className="w-3 h-3" />Documents</p>
        <div className="divide-y" style={{ borderColor: "#2D2A5040" }}>
          {docs.map((d,i) => {
            const st = docStatus(d.expiry);
            const sc = DOC_STATUS_COLORS[st];
            return (
              <div key={i} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-white text-[11px] font-semibold">{d.label}</p>
                  {d.number && <p className="text-white/30 text-[9px] font-mono">{d.number}</p>}
                  {d.expiry && <p className="text-white/30 text-[9px]">Exp: {d.expiry}</p>}
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
                  style={{ background: sc.bg }}>{sc.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Owner */}
      <div className="rounded-xl p-3" style={{ background: "#1A1A2E" }}>
        <p className="text-white/40 text-[9px] font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5"><User className="w-3 h-3" />Owner / Driver</p>
        <div className="space-y-1.5">
          {[
            ["Owner",         profile.ownerFullName],
            ["Owner ID",      profile.ownerIdNumber],
            ["Phone",         profile.ownerPhone],
            ["Driver",        profile.driverName || profile.ownerFullName],
            ["Driver ID",     profile.driverIdNumber],
          ].map(([k,v]) => v ? (
            <div key={k} className="flex justify-between">
              <p className="text-white/30 text-[9px]">{k}</p>
              <p className="text-white text-[10px] font-semibold text-right max-w-[140px]">{v}</p>
            </div>
          ) : null)}
        </div>
      </div>

      <button onClick={onSetup} className="w-full py-2.5 rounded-xl text-xs font-bold text-white border" style={{ borderColor: "#2D2A50", color: "rgba(255,255,255,0.6)" }}>
        Edit Registration →
      </button>
    </div>
  );
}

/* ─── Setup / Registration wizard ────────────────────────────────────────────── */
function SetupScreen({ initial, onSave, onCancel, P, GOLD }: {
  initial: VehicleProfile; onSave: (p: VehicleProfile) => void;
  onCancel: () => void; P: string; GOLD: string;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<VehicleProfile>({ ...initial });
  const [assocProvince, setAssocProvince] = useState(initial.associationProvince || "");

  const set = (k: keyof VehicleProfile, v: string) => setForm(f => ({ ...f, [k]: v }));

  const provinceAssociations = useMemo(() =>
    TAXI_ASSOCIATIONS.filter(a => a.province === assocProvince),
    [assocProvince]
  );

  const steps = [
    { n: 1, label: "Association" },
    { n: 2, label: "Vehicle" },
    { n: 3, label: "Documents" },
    { n: 4, label: "Roadworthy" },
    { n: 5, label: "Owner ID" },
  ];

  const F = ({ label, k, placeholder, type = "text" }: { label: string; k: keyof VehicleProfile; placeholder?: string; type?: string }) => (
    <div>
      <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide mb-1">{label}</p>
      <input
        type={type} value={form[k] as string}
        onChange={e => set(k, e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none"
        style={{ background: "#252245", border: "1px solid #3D3A6A" }}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Step indicators */}
      <div className="flex gap-1 flex-shrink-0">
        {steps.map(s => (
          <div key={s.n} className="flex-1 text-center">
            <div className="h-1 rounded-full mb-1" style={{ background: step >= s.n ? GOLD : "#2D2A50" }} />
            <p className="text-[8px] font-bold" style={{ color: step === s.n ? GOLD : step > s.n ? "#10B981" : "rgba(255,255,255,.3)" }}>
              {step > s.n ? "✓" : s.n} {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto space-y-3" style={{ scrollbarWidth: "none" }}>

        {/* STEP 1 — Association */}
        {step === 1 && (
          <>
            <p className="text-white font-black text-sm">Select Association</p>
            <div>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide mb-1">Province</p>
              <select value={assocProvince} onChange={e => { setAssocProvince(e.target.value); set("associationProvince", e.target.value); set("associationName",""); }}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: "#252245", border: "1px solid #3D3A6A" }}>
                <option value="">Choose province…</option>
                {PROVINCES.map(p => <option key={p} value={p}>{PROVINCE_EMOJIS[p] ?? ""} {p}</option>)}
              </select>
            </div>
            {assocProvince && (
              <div>
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide mb-1">Association</p>
                <div className="space-y-1.5">
                  {provinceAssociations.map(a => {
                    const lc = LEVEL_COLORS[a.level as AssociationLevel];
                    return (
                      <button key={a.name} onClick={() => { set("associationName", a.name); set("associationLevel", a.level); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                        style={{ background: form.associationName === a.name ? P + "40" : "#1A1A2E", border: `1px solid ${form.associationName === a.name ? P : "transparent"}` }}>
                        <span className="text-lg">{PROVINCE_EMOJIS[a.province] ?? "📍"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[11px] font-semibold leading-snug truncate">{a.name}</p>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold mt-0.5"
                            style={{ background: lc.bg, color: lc.text }}>{a.level}</span>
                        </div>
                        {form.associationName === a.name && <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: GOLD }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {form.associationName && (
              <div className="rounded-xl p-3" style={{ background: "#10B98115", border: "1px solid #10B98130" }}>
                <p className="text-green-400 font-bold text-[11px]">✓ Association selected</p>
                <p className="text-green-400/60 text-[10px] mt-0.5">
                  {(ASSOCIATION_ROUTE_ORIGINS[form.associationName]?.length ?? 0) === 0
                    ? "All routes will be available on this device"
                    : `${ROUTES.filter(r => (ASSOCIATION_ROUTE_ORIGINS[form.associationName] ?? []).some(k => r.origin.toUpperCase().includes(k))).length} routes will be available for this association`}
                </p>
              </div>
            )}
          </>
        )}

        {/* STEP 2 — Vehicle Details */}
        {step === 2 && (
          <>
            <p className="text-white font-black text-sm">Vehicle Details</p>
            <F label="Registration Number" k="registrationNumber" placeholder="e.g. CA 123-456" />
            <div className="grid grid-cols-2 gap-2">
              <F label="Make" k="make" placeholder="e.g. Toyota" />
              <F label="Model" k="model" placeholder="e.g. HiAce" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <F label="Year" k="year" placeholder="e.g. 2022" />
              <F label="Colour" k="colour" placeholder="e.g. White" />
            </div>
            <div>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide mb-1">Vehicle Type</p>
              <div className="grid grid-cols-3 gap-1">
                {(["minibus","bus","sedan","suv","other"] as const).map(t => (
                  <button key={t} onClick={() => set("vehicleType", t)}
                    className="py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all"
                    style={{ background: form.vehicleType === t ? P : "#1A1A2E", color: form.vehicleType === t ? "#fff" : "rgba(255,255,255,.5)" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <F label="Seating Capacity" k="seatingCapacity" placeholder="e.g. 14" />
          </>
        )}

        {/* STEP 3 — Vehicle Documents */}
        {step === 3 && (
          <>
            <p className="text-white font-black text-sm">Vehicle Documents</p>
            <div className="rounded-xl p-3 flex items-start gap-2 mb-1" style={{ background: "#1E3A5F" }}>
              <Shield className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-300 text-[10px] leading-relaxed">Upload photos of each document using the T-T20's dual-lens camera. Numbers are recorded for VMS compliance.</p>
            </div>
            <F label="Registration Certificate Number" k="registrationCertNumber" placeholder="e.g. ZA/REG/2022/001234" />
            <F label="Reg. Cert. Expiry Date" k="registrationCertExpiry" type="date" placeholder="" />
            <F label="Operating Licence Number" k="operatingLicenceNumber" placeholder="e.g. OL/WC/2022/005678" />
            <F label="Operating Licence Expiry" k="operatingLicenceExpiry" type="date" placeholder="" />
            <F label="Insurance Policy Number" k="insurancePolicyNumber" placeholder="e.g. POL-2022-98765" />
            <F label="Insurance Expiry Date" k="insuranceExpiry" type="date" placeholder="" />
          </>
        )}

        {/* STEP 4 — Roadworthy */}
        {step === 4 && (
          <>
            <p className="text-white font-black text-sm">Roadworthy Certificate</p>
            <F label="Roadworthy Certificate Number" k="roadworthyCertNumber" placeholder="e.g. RWC/2024/0012345" />
            <F label="Roadworthy Expiry Date" k="roadworthyExpiry" type="date" placeholder="" />
            <F label="Testing Station Name" k="roadworthyStation" placeholder="e.g. Metro Testing Bellville" />
            <F label="Last Inspection Date" k="lastInspectionDate" type="date" placeholder="" />
            <div className="rounded-xl p-3" style={{ background: "#F59E0B15", border: "1px solid #F59E0B30" }}>
              <p className="text-yellow-400 font-bold text-[11px]">⚠ Roadworthy Reminder</p>
              <p className="text-yellow-400/60 text-[10px] mt-0.5 leading-relaxed">VMS will alert this device 30 days before roadworthy expiry. Operating with an expired certificate will lock fare collection.</p>
            </div>
          </>
        )}

        {/* STEP 5 — Owner ID */}
        {step === 5 && (
          <>
            <p className="text-white font-black text-sm">Owner Identification</p>
            <F label="Owner Full Name" k="ownerFullName" placeholder="e.g. Thabo Dlamini" />
            <F label="Owner SA ID Number" k="ownerIdNumber" placeholder="13-digit SA ID" />
            <F label="Owner Phone Number" k="ownerPhone" placeholder="+27 82 000 0000" />
            <F label="Owner Email (optional)" k="ownerEmail" placeholder="owner@email.com" />
            <F label="Owner Address" k="ownerAddress" placeholder="Street, City, Province" />
            <div className="h-px my-2" style={{ background: "#2D2A50" }} />
            <p className="text-white/40 text-[10px] uppercase tracking-wide font-bold">Driver (if different from owner)</p>
            <F label="Driver Full Name" k="driverName" placeholder="Leave blank if same as owner" />
            <F label="Driver SA ID Number" k="driverIdNumber" placeholder="13-digit SA ID" />
            <F label="Driver's Licence Number" k="driverLicenceNumber" placeholder="e.g. DL/2020/12345" />
            <F label="Licence Expiry Date" k="driverLicenceExpiry" type="date" placeholder="" />
            <F label="PDP Number" k="pdpNumber" placeholder="Professional Driving Permit" />
            <F label="PDP Expiry Date" k="pdpExpiry" type="date" placeholder="" />
          </>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={step === 1 ? onCancel : () => setStep(s => s - 1)}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold border"
          style={{ borderColor: "#2D2A50", color: "rgba(255,255,255,0.6)" }}>
          {step === 1 ? "Cancel" : "← Back"}
        </button>
        {step < 5 ? (
          <button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !form.associationName}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
            style={{ background: P }}>
            Next →
          </button>
        ) : (
          <button onClick={() => onSave(form)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ background: "#10B981" }}>
            ✓ Save Registration
          </button>
        )}
      </div>
    </div>
  );
}
