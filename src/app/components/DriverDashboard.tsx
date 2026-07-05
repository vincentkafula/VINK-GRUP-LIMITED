import { useState, useEffect, useCallback } from "react";
import {
  X, MapPin, Star, ChevronRight, Phone, Shield, CheckCircle,
  ArrowLeft, Navigation, Wallet, Bell, User, Calendar,
  ToggleLeft, ToggleRight, TrendingUp, Clock, FileText,
  AlertCircle, Package, Loader2, Home, BarChart3, Briefcase,
  Camera, CheckSquare, XCircle, Heart, LogOut, Activity,
} from "lucide-react";
import { haAuth, haRides, haDrivers, setHaToken, getHaToken } from "../services/eHailingAppleApi";
import { DemoModePill } from "./DemoModeBanner";
import { setDemoMode, DEMO_TOKEN } from "../services/demoMode";
import architectureSvg from "../../imports/ehailing_apple_architecture.svg";

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = "home" | "incoming" | "navigating" | "pickup" | "in-trip" | "dropoff" | "earnings" | "documents" | "profile" | "architecture";
interface DriverData { [key: string]: unknown }
interface RideData   { [key: string]: unknown }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtR   = (n: number) => `R${n.toFixed(2)}`;
const fmtMin = (sec: number) => { const m = Math.floor(sec/60); const s = sec%60; return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; };
const timeAgo = (iso: string) => { const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s/60)}m ago`; return `${Math.floor(s/3600)}h ago`; };

// Vehicle type labels
const vtLabel = (t: string) => ({ standard: "Standard Sedan", wheelchair: "Wheelchair Accessible", stretcher: "Stretcher / NEMT" }[t] ?? t);
const vtIcon  = (t: string) => ({ standard: "🚗", wheelchair: "♿", stretcher: "🚑" }[t] ?? "🚗");
const vtColor = (t: string) => ({ standard: "#6B5ED7", wheelchair: "#10B981", stretcher: "#EF4444" }[t] ?? "#6B5ED7");

// ─── SVG Driver Map ───────────────────────────────────────────────────────────
function DriverMap({ mode, step }: { mode: "idle" | "to-pickup" | "to-dropoff"; step?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => { const t = setInterval(() => setFrame(f => f + 1), 600); return () => clearInterval(t); }, []);

  const driverX = mode === "idle" ? 150 : mode === "to-pickup" ? 150 + (frame % 30) * 2 : 210 + (frame % 20) * 2;
  const driverY = mode === "idle" ? 120 : mode === "to-pickup" ? 120 - (frame % 20)     : 120 + (frame % 15);

  return (
    <svg viewBox="0 0 375 220" className="w-full" style={{ background: "#E8F0E8" }}>
      {/* Roads */}
      {[40,80,120,160,200].map(y => <line key={`h${y}`} x1="0" y1={y} x2="375" y2={y} stroke="#D4D0C4" strokeWidth="8"/>)}
      {[50,100,150,200,250,300,350].map(x => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="220" stroke="#D4D0C4" strokeWidth="8"/>)}
      <line x1="0" y1="120" x2="375" y2="120" stroke="#BFBDB0" strokeWidth="14"/>
      <line x1="150" y1="0" x2="150" y2="220" stroke="#BFBDB0" strokeWidth="14"/>
      {/* Buildings */}
      {[[60,45,35,30],[200,50,40,25],[60,150,30,35],[215,155,45,28],[305,50,40,35]].map(([x,y,w,h],i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill="#D0CECA" stroke="#B8B6B0" strokeWidth="0.5"/>
      ))}
      {/* Hospital */}
      <rect x="280" y="42" width="30" height="28" rx="3" fill="white" stroke="#E53935" strokeWidth="1.5"/>
      <text x="295" y="61" textAnchor="middle" fontSize="14" fill="#E53935" fontWeight="bold">+</text>

      {/* Route line */}
      {mode !== "idle" && (
        <path d={mode === "to-pickup"
          ? `M ${driverX} ${driverY} Q 200 100 240 120`
          : `M ${driverX} ${driverY} Q 260 100 295 56`}
          fill="none" stroke="#6B5ED7" strokeWidth="3" strokeDasharray="8,4" opacity="0.7"/>
      )}

      {/* Pickup pin */}
      {mode === "to-pickup" && (
        <g transform="translate(240,120)">
          <circle cx="0" cy="-16" r="10" fill="#10B981"/>
          <circle cx="0" cy="-16" r="4" fill="white"/>
          <line x1="0" y1="-6" x2="0" y2="0" stroke="#10B981" strokeWidth="2"/>
          <rect x="-22" y="-32" width="44" height="13" rx="6" fill="white" opacity="0.9"/>
          <text x="0" y="-22" textAnchor="middle" fontSize="7" fill="#10B981" fontWeight="bold">PICKUP</text>
        </g>
      )}

      {/* Destination pin */}
      {mode === "to-dropoff" && (
        <g transform="translate(295,56)">
          <circle cx="0" cy="-16" r="10" fill="#EF4444"/>
          <circle cx="0" cy="-16" r="4" fill="white"/>
          <line x1="0" y1="-6" x2="0" y2="0" stroke="#EF4444" strokeWidth="2"/>
          <rect x="-28" y="-32" width="56" height="13" rx="6" fill="white" opacity="0.9"/>
          <text x="0" y="-22" textAnchor="middle" fontSize="6.5" fill="#EF4444" fontWeight="bold">GROOTE SCHUUR</text>
        </g>
      )}

      {/* Driver car */}
      <g transform={`translate(${Math.min(350, Math.max(20, driverX))},${Math.min(200, Math.max(20, driverY))})`}>
        <circle cx="0" cy="0" r="16" fill="white" stroke="#6B5ED7" strokeWidth="2.5"/>
        <text x="0" y="5" textAnchor="middle" fontSize="14">🚗</text>
      </g>

      {/* Heading arrow */}
      {mode !== "idle" && (
        <g transform={`translate(${Math.min(350,Math.max(20,driverX))},${Math.min(200,Math.max(20,driverY))})`}>
          <polygon points="0,-22 4,-30 -4,-30" fill="#6B5ED7" opacity="0.7"/>
        </g>
      )}
    </svg>
  );
}

// ─── Phone Shell ──────────────────────────────────────────────────────────────
function PhoneShell({ children, bg = "#F5F5F7" }: { children: React.ReactNode; bg?: string }) {
  return (
    <div className="flex items-center justify-center flex-1 overflow-hidden py-4">
      <div className="relative flex-shrink-0" style={{ width: 375, height: 780 }}>
        <div className="absolute inset-0 rounded-[44px]"
          style={{ background: "linear-gradient(145deg,#2a2a2e,#1a1a1e)", border: "2px solid #48484A", boxShadow: "0 40px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
          <div className="absolute left-0 top-[132px] w-[3px] h-8 rounded-l-sm" style={{ background:"#3a3a3c", marginLeft:"-3px" }}/>
          <div className="absolute left-0 top-[182px] w-[3px] h-14 rounded-l-sm" style={{ background:"#3a3a3c", marginLeft:"-3px" }}/>
          <div className="absolute left-0 top-[248px] w-[3px] h-14 rounded-l-sm" style={{ background:"#3a3a3c", marginLeft:"-3px" }}/>
          <div className="absolute right-0 top-[182px] w-[3px] h-20 rounded-r-sm" style={{ background:"#3a3a3c", marginRight:"-3px" }}/>
          <div className="absolute rounded-[38px] overflow-hidden" style={{ inset: 4, background: bg }}>
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30" style={{ width:120, height:32, background:"#000", borderRadius:20 }}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ background:"#1a1a1a", border:"1px solid #333" }}/>
            </div>
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 h-12" style={{ paddingTop:14 }}>
              <span className="text-xs font-semibold" style={{ color: bg === "#F5F5F7" ? "#111" : "white" }}>{new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
              <div className="flex items-center gap-1">
                <svg viewBox="0 0 18 12" className="w-4 h-3" fill={bg === "#F5F5F7" ? "#111" : "white"}><rect x="0" y="8" width="3" height="4" rx="0.5"/><rect x="4" y="5" width="3" height="7" rx="0.5"/><rect x="8" y="2" width="3" height="10" rx="0.5"/><rect x="12" y="0" width="3" height="12" rx="0.5"/></svg>
                <div className="flex items-center"><div className="rounded-sm flex items-center px-0.5" style={{ width:22, height:11, border:`1px solid ${bg==="F5F5F7"?"rgba(0,0,0,0.35)":"rgba(255,255,255,0.5)"}` }}><div className="rounded-sm" style={{ width:"76%", height:7, background:"#34d399" }}/></div></div>
              </div>
            </div>
            <div className="absolute overflow-y-auto overflow-x-hidden" style={{ inset:0, top:48, bottom:0 }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────
function DriverBottomNav({ active, onTab }: { active: string; onTab: (s: Screen) => void }) {
  const tabs = [
    { id:"home",         label:"Home",     icon:<Home className="w-5 h-5"/> },
    { id:"earnings",     label:"Earnings", icon:<Wallet className="w-5 h-5"/> },
    { id:"documents",    label:"Docs",     icon:<FileText className="w-5 h-5"/> },
    { id:"architecture", label:"Arch",     icon:<BarChart3 className="w-5 h-5"/> },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around py-2 border-t"
      style={{ background:"white", borderColor:"#E5E7EB", height:60 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onTab(t.id as Screen)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl"
          style={{ color: active === t.id ? "#6B5ED7" : "#9CA3AF" }}>
          {t.icon}
          <span className="text-[10px] font-medium">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function DriverLogin({ onLogin }: { onLogin: (t: string) => void }) {
  const [username, setUsername] = useState("noc1");
  const [password, setPassword] = useState("Noc@5678");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await haAuth.login(username, password);
      setHaToken(res.token); onLogin(res.token);
    } catch (err: unknown) {
      // Demo-mode fallback — works without backend
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("fetch") || msg.includes("Failed") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
        const demoToken = "demo-driver-" + Date.now();
        setHaToken(demoToken);
        onLogin(demoToken);
      } else {
        setError(msg || "Login failed");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center flex-1 px-6 pt-6 pb-4"
        style={{ background: "linear-gradient(160deg,#1B1837 0%,#2D2060 100%)" }}>
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4"
          style={{ background: "rgba(255,255,255,0.12)" }}>
          <span className="text-4xl">🚗</span>
        </div>
        <h1 className="text-white text-2xl font-bold">Driver Portal</h1>
        <p className="text-white/70 text-sm mt-1 text-center">E-hailing Apple · Health Transport</p>
        <div className="flex gap-3 mt-6">
          {[{ label:"Certified", icon:"✅" },{ label:"Vetted", icon:"🛡️" },{ label:"First Aid", icon:"❤️‍🩹" }].map((b,i) => (
            <div key={i} className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl" style={{ background:"rgba(255,255,255,0.1)" }}>
              <span className="text-lg">{b.icon}</span>
              <span className="text-[10px] text-white/70 font-medium">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="rounded-t-3xl px-6 py-5 space-y-3" style={{ background:"white" }}>
        <h2 className="text-base font-bold text-gray-900">Sign in to your driver account</h2>
        <form onSubmit={submit} className="space-y-3">
          {[
            { label:"Username",  val:username, set:setUsername, type:"text" },
            { label:"Password",  val:password, set:setPassword, type:"password" },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">{f.label}</label>
              <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} required
                className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                style={{ borderColor:"#E5E7EB" }}/>
            </div>
          ))}
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background:"linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
            Sign In
          </button>
          <button type="button"
            onClick={() => { setDemoMode(true); setHaToken(DEMO_TOKEN); onLogin(DEMO_TOKEN); }}
            className="w-full py-2.5 rounded-2xl text-xs font-semibold border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-all">
            ⚡ Enter Demo Mode (no server needed)
          </button>
        </form>
        <p className="text-center text-[10px] text-gray-400">Live: noc1 / Noc@5678</p>
      </div>
    </div>
  );
}

// ─── HOME / AVAILABILITY ──────────────────────────────────────────────────────
function DriverHome({ driver, incomingRide, onGoOnline, onGoOffline, onAccept, onDecline }: {
  driver: DriverData | null;
  incomingRide: RideData | null;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const isOnline = driver?.onlineStatus === "online" || driver?.onlineStatus === "on_trip";
  const name = (driver?.name as string) ?? "Driver";

  return (
    <div className="flex flex-col" style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">Welcome back</p>
            <p className="text-base font-bold text-gray-900">{name.split(" ")[0]}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: isOnline ? "#F0FDF4" : "#F3F4F6" }}>
              <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`}/>
              <span className="text-xs font-semibold" style={{ color: isOnline ? "#059669" : "#6B7280" }}>
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
            <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background:"#F3F4F6" }}>
              <Bell className="w-4 h-4 text-gray-600"/>
            </button>
          </div>
        </div>

        {/* Availability toggle */}
        <div className="p-4 rounded-2xl flex items-center gap-4"
          style={{ background: isOnline ? "linear-gradient(135deg,#ECFDF5,#D1FAE5)" : "#F9FAFB", border: `1.5px solid ${isOnline ? "#6EE7B7" : "#E5E7EB"}` }}>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: isOnline ? "#065F46" : "#374151" }}>
              {isOnline ? "You're available for rides" : "You're offline"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: isOnline ? "#059669" : "#9CA3AF" }}>
              {isOnline ? "Accepting health-transport requests" : "Toggle to start receiving requests"}
            </p>
          </div>
          <button onClick={isOnline ? onGoOffline : onGoOnline}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all"
            style={{ background: isOnline ? "#EF4444" : "#6B5ED7", color:"white" }}>
            {isOnline ? <ToggleRight className="w-4 h-4"/> : <ToggleLeft className="w-4 h-4"/>}
            {isOnline ? "Go Offline" : "Go Online"}
          </button>
        </div>
      </div>

      {/* Map */}
      <div style={{ height:180 }}>
        <DriverMap mode={isOnline ? "idle" : "idle"}/>
      </div>

      {/* Today's stats */}
      <div className="px-4 mt-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label:"Earnings", value:`R${Number(driver?.earningsToday ?? 0).toFixed(0)}`, icon:"💰", color:"#6B5ED7" },
            { label:"Trips", value:String(Math.floor(Number(driver?.earningsToday ?? 0) / 120)), icon:"🚗", color:"#10B981" },
            { label:"Rating", value:Number(driver?.avgRating ?? 4.8).toFixed(1), icon:"⭐", color:"#F59E0B" },
          ].map((s, i) => (
            <div key={i} className="p-3 rounded-2xl text-center" style={{ background:"white", border:"1px solid #E5E7EB" }}>
              <span className="text-xl">{s.icon}</span>
              <p className="text-base font-black mt-1" style={{ color:s.color }}>{s.value}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Incoming ride request */}
      {incomingRide && isOnline && (
        <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ border:"2px solid #6B5ED7", boxShadow:"0 4px 20px rgba(107,94,215,0.3)" }}>
          {/* Banner */}
          <div className="px-4 py-2.5 flex items-center gap-2"
            style={{ background:"linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
            <Bell className="w-4 h-4 text-white animate-bounce"/>
            <p className="text-white font-bold text-sm">New ride request!</p>
            <span className="ml-auto text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded-full">
              {vtLabel(incomingRide.vehicleType as string)}
            </span>
          </div>

          {/* Request details */}
          <div className="p-4 space-y-3" style={{ background:"white" }}>
            {/* Passenger */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm"
                style={{ background:"#EDE9FE", color:"#6B5ED7" }}>
                {(incomingRide.passengerName as string)?.split(" ").map((w:string)=>w[0]).join("")}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{incomingRide.passengerName as string}</p>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="text-yellow-400">★</span><span>4.8</span>
                  <span>·</span><span className="capitalize">{vtLabel(incomingRide.vehicleType as string)}</span>
                </div>
              </div>
              <span className="text-lg">{vtIcon(incomingRide.vehicleType as string)}</span>
            </div>

            {/* Route */}
            <div className="p-3 rounded-xl space-y-2" style={{ background:"#F9FAFB" }}>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1 flex-shrink-0"/>
                <p className="text-xs text-gray-700">{(incomingRide.pickupAddress as {label:string})?.label}</p>
              </div>
              <div className="w-px h-3 bg-gray-300 ml-1"/>
              <div className="flex items-start gap-2">
                <MapPin className="w-3 h-3 text-purple-600 mt-0.5 flex-shrink-0"/>
                <p className="text-xs font-semibold text-gray-900">{(incomingRide.dropoffAddress as {label:string})?.label}</p>
              </div>
            </div>

            {/* Medical note */}
            {incomingRide.medicalNote && (
              <div className="flex items-start gap-2 p-3 rounded-xl"
                style={{ background:"#EFF6FF", border:"1px solid #BFDBFE" }}>
                <Heart className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0"/>
                <p className="text-xs text-blue-700 italic">"{incomingRide.medicalNote as string}"</p>
              </div>
            )}

            {/* Fare + distance */}
            <div className="flex items-center justify-between">
              <div className="text-center">
                <p className="text-lg font-black" style={{ color:"#6B5ED7" }}>R{Number(incomingRide.estimatedFareZAR).toFixed(0)}</p>
                <p className="text-[10px] text-gray-400">estimated fare</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-gray-800">{Number(incomingRide.distanceKm).toFixed(1)} km</p>
                <p className="text-[10px] text-gray-400">distance</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-gray-800">~{Math.ceil(Number(incomingRide.distanceKm) * 2.5)} min</p>
                <p className="text-[10px] text-gray-400">est. time</p>
              </div>
            </div>

            {/* Accept / Decline */}
            <div className="flex gap-2 pt-1">
              <button onClick={onDecline}
                className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5"
                style={{ background:"#FEF2F2", color:"#EF4444", border:"1.5px solid #FECACA" }}>
                <XCircle className="w-4 h-4"/> Decline
              </button>
              <button onClick={onAccept}
                className="flex-2 flex-grow py-3 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-1.5"
                style={{ background:"linear-gradient(135deg,#6B5ED7,#8B7EE7)", flexGrow:2 }}>
                <CheckCircle className="w-4 h-4"/> Accept Ride
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent trips */}
      <div className="px-4 mt-4">
        <p className="text-xs font-bold text-gray-700 mb-2">Recent trips</p>
        {[
          { name:"Margaret B.", dest:"Groote Schuur Hospital", fare:68, rating:5, type:"standard", ago:"2h ago" },
          { name:"Amahle N.", dest:"Clicks Pharmacy", fare:45, rating:5, type:"wheelchair", ago:"4h ago" },
          { name:"Patrick O.", dest:"Tygerberg Hospital", fare:95, rating:4, type:"standard", ago:"Yesterday" },
        ].map((t,i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 border-b last:border-0"
            style={{ borderColor:"#F3F4F6" }}>
            <span className="text-xl">{vtIcon(t.type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{t.name} → {t.dest}</p>
              <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                <span>{t.ago}</span>
                <span>·</span>
                {[1,2,3,4,5].map(s => <Star key={s} className={`w-2.5 h-2.5 ${s<=t.rating?"fill-yellow-400 text-yellow-400":"text-gray-200"}`}/>)}
              </div>
            </div>
            <span className="text-sm font-bold" style={{ color:"#6B5ED7" }}>R{t.fare}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NAVIGATION SCREEN ────────────────────────────────────────────────────────
function NavigatingScreen({ ride, mode, onArrive, onBack }: {
  ride: RideData; mode: "to-pickup" | "to-dropoff";
  onArrive: () => void; onBack: () => void;
}) {
  const [eta, setEta] = useState(mode === "to-pickup" ? 4 : 12);
  const [dist, setDist] = useState(mode === "to-pickup" ? 1.2 : 6.4);

  useEffect(() => {
    const t = setInterval(() => {
      setEta(e => Math.max(0, e - 1));
      setDist(d => Math.max(0, +(d - 0.15).toFixed(1)));
    }, 8000);
    return () => clearInterval(t);
  }, []);

  const dest = mode === "to-pickup"
    ? (ride.pickupAddress as { label: string })?.label
    : (ride.dropoffAddress as { label: string })?.label;

  return (
    <div className="flex flex-col h-full">
      {/* Map takes upper half */}
      <div className="relative" style={{ height: 260 }}>
        <DriverMap mode={mode}/>
        {/* Back button */}
        <button onClick={onBack} className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center shadow"
          style={{ background:"white" }}>
          <ArrowLeft className="w-4 h-4 text-gray-700"/>
        </button>
        {/* SOS driver button */}
        <button className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-xs font-bold"
          style={{ background:"#EF4444" }}>
          <Shield className="w-3 h-3"/>SOS
        </button>
      </div>

      {/* Nav card */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 space-y-3" style={{ paddingBottom:16 }}>
        {/* ETA / distance */}
        <div className="flex items-center gap-4 p-4 rounded-2xl"
          style={{ background: mode === "to-pickup" ? "#F0FDF4" : "#F3F0FF" }}>
          <Navigation className="w-6 h-6 flex-shrink-0" style={{ color: mode==="to-pickup"?"#059669":"#6B5ED7" }}/>
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: mode==="to-pickup"?"#065F46":"#5B21B6" }}>
              {mode === "to-pickup" ? "Heading to pickup" : "Heading to destination"}
            </p>
            <p className="text-sm font-medium text-gray-700 truncate">{dest}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-black" style={{ color: mode==="to-pickup"?"#059669":"#6B5ED7" }}>{eta}<span className="text-xs font-normal text-gray-500"> min</span></p>
            <p className="text-xs text-gray-500">{dist} km</p>
          </div>
        </div>

        {/* Turn-by-turn */}
        <div className="p-4 rounded-2xl" style={{ background:"white", border:"1px solid #E5E7EB" }}>
          <p className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wider">Turn-by-turn</p>
          {[
            { icon:"↑", step:"Continue on Main Road", dist:"400m" },
            { icon:"→", step:`Turn right onto ${mode==="to-pickup"?"Settler's Way":"De Waal Drive"}`, dist:"1.1km" },
            { icon:"⭡", step:mode==="to-pickup"?"Arrive at pickup location":"Arrive at Groote Schuur Hospital", dist:"Destination", highlight:true },
          ].map((s,i) => (
            <div key={i} className={`flex items-center gap-3 py-2 ${i<2?"border-b":""} ${s.highlight?"":""}` }
              style={{ borderColor:"#F3F4F6" }}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0`}
                style={{ background: s.highlight ? "#6B5ED7" : "#F3F4F6", color: s.highlight ? "white" : "#374151" }}>
                {s.icon}
              </div>
              <div className="flex-1">
                <p className={`text-xs ${s.highlight ? "font-bold text-gray-900":"text-gray-700"}`}>{s.step}</p>
              </div>
              <span className="text-xs text-gray-400">{s.dist}</span>
            </div>
          ))}
        </div>

        {/* Passenger info */}
        <div className="p-4 rounded-2xl" style={{ background:"white", border:"1px solid #E5E7EB" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
              style={{ background:"#EDE9FE", color:"#6B5ED7" }}>
              {(ride.passengerName as string)?.split(" ").map((w:string)=>w[0]).join("")}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">{ride.passengerName as string}</p>
              <p className="text-xs text-gray-500">{(ride.vehicleType as string) === "wheelchair" ? "♿ Wheelchair user" : "Standard passenger"}</p>
            </div>
            <button className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background:"#F3F0FF" }}>
              <Phone className="w-4 h-4" style={{ color:"#6B5ED7" }}/>
            </button>
          </div>
          {ride.medicalNote && (
            <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl" style={{ background:"#EFF6FF" }}>
              <Heart className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0"/>
              <p className="text-xs text-blue-600 italic">{ride.medicalNote as string}</p>
            </div>
          )}
        </div>

        {/* Arrive button */}
        <button onClick={onArrive}
          className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2"
          style={{ background: mode==="to-pickup" ? "linear-gradient(135deg,#10B981,#059669)" : "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
          {mode === "to-pickup" ? <><CheckCircle className="w-5 h-5"/> I've arrived at pickup</> : <><MapPin className="w-5 h-5"/> Arrived at destination</>}
        </button>
      </div>
    </div>
  );
}

// ─── PICKUP CONFIRMATION ──────────────────────────────────────────────────────
function PickupConfirmScreen({ ride, onConfirm }: { ride: RideData; onConfirm: () => void }) {
  const [boardingDone, setBoardingDone] = useState(false);
  const [medAck, setMedAck]           = useState(false);
  const canStart = boardingDone && (!(ride.medicalNote) || medAck);

  return (
    <div className="px-4 pt-4 pb-4 flex flex-col gap-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3 text-3xl"
          style={{ background:"#F0FDF4" }}>✅</div>
        <p className="text-lg font-bold text-gray-900">You've arrived!</p>
        <p className="text-xs text-gray-500 mt-0.5">Complete passenger boarding before starting trip</p>
      </div>

      {/* Passenger */}
      <div className="p-4 rounded-2xl flex items-center gap-3" style={{ background:"white", border:"1px solid #E5E7EB" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold"
          style={{ background:"#EDE9FE", color:"#6B5ED7", fontSize:16 }}>
          {(ride.passengerName as string)?.split(" ").map((w:string)=>w[0]).join("")}
        </div>
        <div>
          <p className="font-bold text-gray-900">{ride.passengerName as string}</p>
          <p className="text-xs text-gray-500">{vtLabel(ride.vehicleType as string)}</p>
        </div>
        <button className="ml-auto w-10 h-10 rounded-full flex items-center justify-center" style={{ background:"#F3F0FF" }}>
          <Phone className="w-4 h-4" style={{ color:"#6B5ED7" }}/>
        </button>
      </div>

      {/* Extended boarding time notice */}
      {(ride.vehicleType === "wheelchair" || ride.vehicleType === "stretcher") && (
        <div className="flex items-start gap-3 p-3.5 rounded-2xl" style={{ background:"#FEF3C7", border:"1px solid #FDE68A" }}>
          <Clock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0"/>
          <p className="text-xs text-amber-700"><span className="font-bold">Extended boarding window active.</span> You will not be penalised for wait time — this trip type accounts for longer boarding.</p>
        </div>
      )}

      {/* Medical note ack */}
      {ride.medicalNote && (
        <button onClick={() => setMedAck(!medAck)}
          className={`flex items-start gap-3 p-4 rounded-2xl text-left transition-all ${medAck?"":"border-dashed"}`}
          style={{ background: medAck ? "#EFF6FF" : "#F0F9FF", border: `2px solid ${medAck?"#3B82F6":"#BFDBFE"}` }}>
          <div className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center mt-0.5 ${medAck?"bg-blue-500":"border-2 border-gray-300 bg-white"}`}>
            {medAck && <svg viewBox="0 0 12 10" className="w-3 h-3 fill-white"><path d="M1 5l3.5 3.5L11 1"/></svg>}
          </div>
          <div>
            <p className="text-xs font-bold text-blue-700 mb-0.5">I've read the passenger's medical note</p>
            <p className="text-xs text-blue-600 italic">"{ride.medicalNote as string}"</p>
          </div>
        </button>
      )}

      {/* Boarding checklist */}
      <button onClick={() => setBoardingDone(!boardingDone)}
        className="flex items-center gap-3 p-4 rounded-2xl transition-all"
        style={{ background: boardingDone ? "#F0FDF4" : "#F9FAFB", border: `2px solid ${boardingDone ? "#6EE7B7" : "#E5E7EB"}` }}>
        <div className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center ${boardingDone ? "bg-emerald-500" : "border-2 border-gray-300 bg-white"}`}>
          {boardingDone && <svg viewBox="0 0 12 10" className="w-3 h-3 fill-white"><path d="M1 5l3.5 3.5L11 1"/></svg>}
        </div>
        <p className="text-sm font-medium text-gray-800">Passenger is safely boarded and seated</p>
      </button>

      <button disabled={!canStart} onClick={onConfirm}
        className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background:"linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
        <Navigation className="w-4 h-4"/> Start Trip to Destination
      </button>
    </div>
  );
}

// ─── DROP-OFF + PROOF ─────────────────────────────────────────────────────────
function DropoffScreen({ ride, onComplete }: { ride: RideData; onComplete: () => void }) {
  const [photoTaken, setPhotoTaken]   = useState(false);
  const [signObtained, setSignObtained] = useState(false);
  const [completing, setCompleting]   = useState(false);

  const handleComplete = async () => {
    setCompleting(true);
    setTimeout(() => { setCompleting(false); onComplete(); }, 1500);
  };

  return (
    <div className="px-4 pt-4 pb-4 flex flex-col gap-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3 text-3xl"
          style={{ background:"#F3F0FF" }}>🏁</div>
        <p className="text-lg font-bold text-gray-900">Drop-off Confirmation</p>
        <p className="text-xs text-gray-500 mt-0.5">{(ride.dropoffAddress as { label: string })?.label}</p>
      </div>

      {/* Capture proof */}
      <div className="p-4 rounded-2xl" style={{ background:"white", border:"1px solid #E5E7EB" }}>
        <p className="text-xs font-bold text-gray-700 mb-3">Proof of drop-off required</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setPhotoTaken(!photoTaken)}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all"
            style={{ background: photoTaken ? "#F0FDF4" : "#F9FAFB", border: `2px solid ${photoTaken ? "#6EE7B7" : "#E5E7EB"}` }}>
            {photoTaken
              ? <CheckCircle className="w-7 h-7 text-emerald-500"/>
              : <Camera className="w-7 h-7 text-gray-400"/>}
            <span className="text-xs font-semibold text-gray-700">{photoTaken ? "Photo taken ✓" : "Take photo"}</span>
          </button>
          <button onClick={() => setSignObtained(!signObtained)}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all"
            style={{ background: signObtained ? "#F0FDF4" : "#F9FAFB", border: `2px solid ${signObtained ? "#6EE7B7" : "#E5E7EB"}` }}>
            {signObtained
              ? <CheckCircle className="w-7 h-7 text-emerald-500"/>
              : <CheckSquare className="w-7 h-7 text-gray-400"/>}
            <span className="text-xs font-semibold text-gray-700">{signObtained ? "Signed ✓" : "Get signature"}</span>
          </button>
        </div>
      </div>

      {/* Fare */}
      <div className="flex items-center justify-between p-4 rounded-2xl"
        style={{ background:"linear-gradient(135deg,#F3F0FF,#EDE9FE)" }}>
        <div>
          <p className="text-xs text-gray-500">Trip fare</p>
          <p className="text-2xl font-black" style={{ color:"#6B5ED7" }}>R{Number(ride.estimatedFareZAR).toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Your earnings</p>
          <p className="text-2xl font-black text-gray-800">R{(Number(ride.estimatedFareZAR) * 0.75).toFixed(2)}</p>
        </div>
      </div>

      <button disabled={(!photoTaken && !signObtained) || completing} onClick={handleComplete}
        className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background:"linear-gradient(135deg,#10B981,#059669)" }}>
        {completing ? <><Loader2 className="w-4 h-4 animate-spin"/> Completing…</> : <><CheckCircle className="w-4 h-4"/> Complete Trip</>}
      </button>
    </div>
  );
}

// ─── TRIP COMPLETED SPLASH ────────────────────────────────────────────────────
function TripCompletedScreen({ ride, onDone }: { ride: RideData; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-5" style={{ background:"#F0FDF4" }}>
        <CheckCircle className="w-14 h-14 text-emerald-500"/>
      </div>
      <h2 className="text-2xl font-black text-gray-900 mb-2">Trip Complete!</h2>
      <p className="text-sm text-gray-500 mb-6">You've delivered {(ride.passengerName as string)?.split(" ")[0]} safely.</p>
      <div className="w-full p-4 rounded-2xl mb-6" style={{ background:"linear-gradient(135deg,#F3F0FF,#EDE9FE)" }}>
        <p className="text-xs text-gray-500 mb-1">You earned</p>
        <p className="text-4xl font-black" style={{ color:"#6B5ED7" }}>R{(Number(ride.estimatedFareZAR) * 0.75).toFixed(2)}</p>
        <p className="text-xs text-gray-400 mt-1">Added to your weekly earnings</p>
      </div>
      <div className="flex gap-4 text-center">
        <div><p className="text-lg font-black text-gray-800">{Number(ride.distanceKm).toFixed(1)} km</p><p className="text-xs text-gray-400">Distance</p></div>
        <div className="w-px bg-gray-200"/>
        <div><p className="text-lg font-black text-gray-800">~{Math.ceil(Number(ride.distanceKm)*2.5)} min</p><p className="text-xs text-gray-400">Duration</p></div>
      </div>
      <button onClick={onDone} className="mt-8 w-full py-3.5 rounded-2xl text-white font-bold text-sm"
        style={{ background:"linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
        Back to Home
      </button>
    </div>
  );
}

// ─── EARNINGS SCREEN ──────────────────────────────────────────────────────────
function EarningsScreen({ driver }: { driver: DriverData | null }) {
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const amounts = { today: Number(driver?.earningsToday ?? 840), week: Number(driver?.earningsThisWeek ?? 4200), month: Number(driver?.earningsThisWeek ?? 4200) * 4 };

  const txns = [
    { label:"Trip: Groote Schuur Hospital", amount:68*0.75, type:"trip", ago:"2h ago" },
    { label:"Trip: Clicks Pharmacy",         amount:45*0.75, type:"trip", ago:"4h ago" },
    { label:"Weekly Bonus",                  amount:120, type:"bonus", ago:"Yesterday" },
    { label:"Trip: Tygerberg Hospital",      amount:95*0.75, type:"trip", ago:"Yesterday" },
    { label:"Tip from passenger",            amount:20, type:"tip", ago:"2 days ago" },
  ];

  return (
    <div className="px-4 pt-4" style={{ paddingBottom:70 }}>
      {/* Period selector */}
      <div className="flex gap-2 mb-4 p-1 rounded-2xl" style={{ background:"#F3F4F6" }}>
        {(["today","week","month"] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className="flex-1 py-1.5 rounded-xl text-xs font-bold capitalize transition-all"
            style={{ background: period===p ? "white" : "transparent", color: period===p ? "#6B5ED7" : "#9CA3AF",
              boxShadow: period===p ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
            {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
          </button>
        ))}
      </div>

      {/* Big amount */}
      <div className="p-5 rounded-2xl mb-4 text-center"
        style={{ background:"linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
        <p className="text-white/70 text-xs mb-1">Earnings {period === "today" ? "today" : period === "week" ? "this week" : "this month"}</p>
        <p className="text-white text-4xl font-black">R{amounts[period].toFixed(2)}</p>
        <div className="flex items-center justify-center gap-1 mt-2">
          <TrendingUp className="w-3.5 h-3.5 text-white/70"/>
          <p className="text-white/70 text-xs">+12% vs last {period}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label:"Trips", value:String(Math.floor(amounts.today / 90)) },
          { label:"Acceptance", value:`${driver?.acceptanceRate ?? 94}%` },
          { label:"Rating", value:Number(driver?.avgRating ?? 4.9).toFixed(1) },
        ].map((s,i) => (
          <div key={i} className="p-3 rounded-2xl text-center" style={{ background:"white", border:"1px solid #E5E7EB" }}>
            <p className="text-base font-black" style={{ color:"#6B5ED7" }}>{s.value}</p>
            <p className="text-[10px] text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Transaction history */}
      <p className="text-xs font-bold text-gray-700 mb-2">Transactions</p>
      <div className="rounded-2xl overflow-hidden" style={{ background:"white", border:"1px solid #E5E7EB" }}>
        {txns.map((t,i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i<txns.length-1?"border-b":""}`}
            style={{ borderColor:"#F3F4F6" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: t.type==="bonus"?"#FEF3C7":t.type==="tip"?"#FEE2E2":"#F3F0FF" }}>
              <span className="text-base">{t.type==="bonus"?"⭐":t.type==="tip"?"💝":"🚗"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{t.label}</p>
              <p className="text-[10px] text-gray-400">{t.ago}</p>
            </div>
            <p className="text-sm font-bold text-emerald-600">+R{t.amount.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Payout */}
      <div className="mt-3 p-4 rounded-2xl flex items-center gap-3"
        style={{ background:"#F0FDF4", border:"1px solid #BBF7D0" }}>
        <Wallet className="w-5 h-5 text-emerald-600 flex-shrink-0"/>
        <div className="flex-1">
          <p className="text-xs font-bold text-emerald-700">Next payout</p>
          <p className="text-xs text-emerald-600">R{amounts.week.toFixed(2)} · Friday</p>
        </div>
        <button className="text-xs font-bold px-3 py-1.5 rounded-xl text-white" style={{ background:"#10B981" }}>
          Request Early
        </button>
      </div>
    </div>
  );
}

// ─── ARCHITECTURE SCREEN ──────────────────────────────────────────────────────
function ArchitectureScreen() {
  return (
    <div className="px-3 pt-4 pb-20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"#6B5ED7" }}>
          <BarChart3 className="w-4 h-4 text-white"/>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">System Architecture</p>
          <p className="text-[10px] text-gray-500">E-hailing Apple · Full stack</p>
        </div>
      </div>

      {/* Architecture SVG */}
      <div className="rounded-2xl overflow-hidden border mb-4" style={{ borderColor:"#E5E7EB" }}>
        <img src={architectureSvg} alt="E-hailing Apple Architecture" className="w-full" />
      </div>

      {/* Layer legend */}
      {[
        { layer:"CLIENT",   items:["Rider App (iOS/Android)","Driver App","Caregiver App","Admin Panel"],  color:"#0F6E56", bg:"#ECFDF5" },
        { layer:"GATEWAY",  items:["API Gateway","JWT Auth","Rate Limiting","WebSocket Hub"],               color:"#534AB7", bg:"#EEEDFE" },
        { layer:"CORE",     items:["Auth Svc · OTP/JWT","User Svc · KYC","Ride Svc","Matching Engine","Location Svc"], color:"#185FA5", bg:"#E6F1FB" },
        { layer:"SUPPORT",  items:["Payment Svc","Notification Svc","Pricing Engine","Rating & Review","SOS Safety Svc"], color:"#993C1D", bg:"#FAECE7" },
        { layer:"INFRA",    items:["Scheduling · recurring","Accessibility Svc","Driver Compliance","Analytics"], color:"#3B6D11", bg:"#EAF3DE" },
        { layer:"DATA",     items:["PostgreSQL · encrypted","InfluxDB · GPS history","Redis · geo/sessions","S3 · docs/photos"], color:"#5F5E5A", bg:"#F1EFE8" },
        { layer:"EXTERNAL", items:["Stripe · Flutterwave · MoMo","Africa's Talking · Twilio","Google Maps · Mapbox","Firebase FCM"], color:"#7C3AED", bg:"#F5F3FF" },
      ].map((l,i) => (
        <div key={i} className="mb-2 p-3 rounded-xl" style={{ background:l.bg, border:`1px solid ${l.color}30` }}>
          <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color:l.color }}>{l.layer}</p>
          <div className="flex flex-wrap gap-1">
            {l.items.map((item,j) => (
              <span key={j} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background:l.color+"18", color:l.color }}>{item}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DOCUMENTS SCREEN ─────────────────────────────────────────────────────────
function DocumentsScreen({ driver }: { driver: DriverData | null }) {
  const docs = [
    { label:"Driver's Licence",       status:"approved", expires:"2026-08-15", icon:"🪪" },
    { label:"Identity Document",      status:"approved", expires:null,         icon:"🆔" },
    { label:"Vehicle Registration",   status:"approved", expires:"2025-10-01", icon:"🚗" },
    { label:"Insurance Certificate",  status:"approved", expires:"2025-12-31", icon:"🛡️" },
    { label:"Roadworthiness Certificate", status:"approved", expires:"2025-09-20", icon:"✅" },
    { label:"First Aid Certificate",  status:driver?.firstAidCertified ? "approved" : "expired", expires:"2024-03-01", icon:"❤️‍🩹" },
    { label:"Background Check",       status:(driver?.backgroundCheckStatus as string) ?? "approved", expires:null, icon:"🔍" },
    { label:"Accessibility Training", status:(driver?.accessibilityTrainingStatus as string) ?? "approved", expires:"2025-06-30", icon:"♿" },
  ];

  const statusStyle = (s: string) => s === "approved"
    ? { color:"#059669", bg:"#F0FDF4", border:"#BBF7D0" }
    : s === "pending"
    ? { color:"#D97706", bg:"#FFFBEB", border:"#FDE68A" }
    : { color:"#EF4444", bg:"#FEF2F2", border:"#FECACA" };

  return (
    <div className="px-4 pt-4" style={{ paddingBottom:70 }}>
      <p className="text-base font-bold text-gray-900 mb-1">Compliance Documents</p>
      <p className="text-xs text-gray-500 mb-4">Keep documents up to date to remain eligible for trips</p>

      <div className="space-y-2">
        {docs.map((d,i) => {
          const ss = statusStyle(d.status);
          return (
            <div key={i} className="flex items-center gap-3 p-3.5 rounded-2xl" style={{ background:"white", border:"1px solid #E5E7EB" }}>
              <span className="text-2xl">{d.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{d.label}</p>
                {d.expires && <p className="text-[10px] text-gray-400">Expires {d.expires}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                  style={{ background:ss.bg, color:ss.color, border:`1px solid ${ss.border}` }}>
                  {d.status}
                </span>
                {d.status !== "approved" && (
                  <button className="text-[10px] font-bold px-2 py-0.5 rounded-lg text-white" style={{ background:"#6B5ED7" }}>
                    Upload
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-4 rounded-2xl flex items-start gap-3" style={{ background:"#EFF6FF", border:"1px solid #BFDBFE" }}>
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
        <p className="text-xs text-blue-700">Health-transport drivers must maintain all documents active. Expired documents suspend your ability to accept trips.</p>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
interface DriverDashboardProps { isOpen: boolean; onClose: () => void }

// Demo driver data used when backend is offline
const DEMO_DRIVER: DriverData = {
  id: "demo-driver-1", name: "Themba Dlamini", phone: "+27818000001",
  avatarInitials: "TD", licenceNo: "ZA12345678",
  vehicleType: "standard", vehicleMake: "Toyota", vehicleModel: "Corolla Quest",
  vehicleYear: 2022, vehiclePlate: "CA 442 801", vehicleColour: "White",
  onlineStatus: "online", totalTrips: 284, totalEarningsZAR: 48200,
  earningsToday: 840, earningsThisWeek: 4200, avgRating: 4.9,
  acceptanceRate: 94, completionRate: 97, firstAidCertified: true,
  backgroundCheckStatus: "approved", vehicleInspectionStatus: "approved",
  accessibilityTrainingStatus: "approved",
};
const DEMO_INCOMING: RideData = {
  id: "demo-ride-x1", passengerId: "p1", passengerName: "Margaret Botha",
  passengerPhone: "+27827000000", vehicleType: "wheelchair",
  pickupAddress: { label: "Tygerberg Hospital" }, dropoffAddress: { label: "Clicks Pharmacy Cavendish" },
  medicalNote: "I use a rollator walker — please allow extra boarding time.",
  estimatedFareZAR: 115, distanceKm: 9.4, status: "searching",
};

export function DriverDashboard({ isOpen, onClose }: DriverDashboardProps) {
  const [authed, setAuthed]       = useState(!!getHaToken());
  const [demoMode, setDemoMode]   = useState(false);
  const [screen, setScreen]       = useState<Screen>("home");
  const [driver, setDriver]       = useState<DriverData | null>(null);
  const [incomingRide, setIncomingRide] = useState<RideData | null>(null);
  const [activeRide, setActiveRide]    = useState<RideData | null>(null);
  const [navMode, setNavMode]          = useState<"to-pickup" | "to-dropoff">("to-pickup");
  const [tripDone, setTripDone]        = useState(false);

  const loadData = useCallback(async () => {
    if (!getHaToken()) return;
    try {
      const [drRes, incRes] = await Promise.allSettled([
        haDrivers.get("demo-driver"),
        haRides.incoming(),
      ]);
      let usedDemo = false;
      if (drRes.status === "fulfilled") {
        setDriver(drRes.value.data as DriverData);
      } else {
        setDriver(DEMO_DRIVER);
        usedDemo = true;
      }
      if (incRes.status === "fulfilled" && Array.isArray(incRes.value.data) && incRes.value.data.length > 0) {
        setIncomingRide(incRes.value.data[0] as RideData);
      } else {
        setIncomingRide(DEMO_INCOMING);
        usedDemo = true;
      }
      if (usedDemo) setDemoMode(true);
    } catch {
      setDriver(DEMO_DRIVER);
      setIncomingRide(DEMO_INCOMING);
      setDemoMode(true);
    }
  }, []);

  useEffect(() => { if (isOpen && authed) loadData(); }, [isOpen, authed, loadData]);

  if (!isOpen) return null;

  const handleLogin = (t: string) => { setAuthed(true); loadData(); };
  const handleToggleOnline = async () => {
    if (!driver) return;
    const newStatus = (driver.onlineStatus === "online" || driver.onlineStatus === "on_trip") ? "offline" : "online";
    try { await haDrivers.setStatus("demo-driver", newStatus); setDriver(d => d ? { ...d, onlineStatus: newStatus } : d); } catch {}
  };
  const handleAccept = () => {
    if (!incomingRide) return;
    setActiveRide({ ...incomingRide });
    setNavMode("to-pickup");
    setIncomingRide(null);
    setScreen("navigating");
  };
  const handleDecline = () => setIncomingRide(null);
  const handleArrivePickup = () => setScreen("pickup");
  const handleStartTrip   = () => { setNavMode("to-dropoff"); setScreen("navigating"); };
  const handleArriveDropoff = () => setScreen("dropoff");
  const handleTripComplete = () => { setTripDone(true); setScreen("home"); };

  const renderContent = () => {
    if (tripDone && screen === "home" && activeRide) {
      return <TripCompletedScreen ride={activeRide} onDone={() => { setTripDone(false); setActiveRide(null); setDriver(d => d ? { ...d, earningsToday: Number(d.earningsToday) + Number(activeRide.estimatedFareZAR) * 0.75 } : d); }}/>;
    }
    switch (screen) {
      case "home":
        return <DriverHome driver={driver} incomingRide={incomingRide} onGoOnline={() => handleToggleOnline()} onGoOffline={() => handleToggleOnline()} onAccept={handleAccept} onDecline={handleDecline}/>;
      case "navigating":
        return activeRide ? <NavigatingScreen ride={activeRide} mode={navMode} onArrive={navMode==="to-pickup" ? handleArrivePickup : handleArriveDropoff} onBack={() => setScreen("home")}/> : null;
      case "pickup":
        return activeRide ? <PickupConfirmScreen ride={activeRide} onConfirm={handleStartTrip}/> : null;
      case "dropoff":
        return activeRide ? <DropoffScreen ride={activeRide} onComplete={handleTripComplete}/> : null;
      case "earnings":
        return <EarningsScreen driver={driver}/>;
      case "documents":
        return <DocumentsScreen driver={driver}/>;
      case "architecture":
        return <ArchitectureScreen />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background:"#0D0B1E" }}>
      {/* Close */}
      <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors">
        <X className="w-5 h-5"/>
      </button>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center px-5 z-40"
        style={{ background:"#13103A", borderBottom:"1px solid #2D2A50" }}>
        <div className="flex items-center gap-3">
          <span className="text-xl">🚗</span>
          <div>
            <p className="text-white font-bold text-sm">E-hailing Apple</p>
            <p className="text-[10px]" style={{ color:"#8884AA" }}>Driver App</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {demoMode && (
            <span className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background:"#F59E0B22", color:"#F59E0B", border:"1px solid #F59E0B44" }}>
              DEMO MODE
            </span>
          )}
          {driver && (
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${driver.onlineStatus === "online" ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`}/>
              <span className="text-xs font-medium" style={{ color:"#8884AA" }}>{driver.onlineStatus as string}</span>
            </div>
          )}
        </div>
      </div>

      {/* Demo banner */}
      {authed && demoMode && (
        <div className="absolute z-40 flex items-center gap-2 px-4 py-1.5 text-xs font-medium"
          style={{ top:56, left:0, right:0, background:"#F59E0B18", borderBottom:"1px solid #F59E0B44", color:"#D97706" }}>
          <span>⚡ Demo mode — start the backend for live data:</span>
          <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">cd server && pnpm dev</code>
        </div>
      )}

      {/* Phone */}
      <div className="flex-1 flex items-start justify-center" style={{ paddingTop: authed && demoMode ? 88 : 56 }}>
        <PhoneShell bg={authed ? "#F5F5F7" : "#F5F5F7"}>
          {!authed ? (
            <DriverLogin onLogin={handleLogin}/>
          ) : (
            <>
              {renderContent()}
              {["home","earnings","documents","architecture"].includes(screen) && !tripDone && (
                <DriverBottomNav active={screen} onTab={setScreen}/>
              )}
            </>
          )}
        </PhoneShell>
      </div>

      {/* Info panel */}
      <div className="hidden xl:flex flex-col w-72 p-6 space-y-4 overflow-y-auto" style={{ borderLeft:"1px solid #2D2A50" }}>
        <h3 className="text-white font-bold text-sm">E-hailing Apple — Driver</h3>
        <p className="text-xs" style={{ color:"#8884AA" }}>Health-transport driver portal with full trip management, earnings tracking, and compliance documents.</p>
        <div className="space-y-2">
          {[
            { label:"Online/Offline toggle", color:"#10B981" },
            { label:"Incoming request with medical note", color:"#6B5ED7" },
            { label:"Turn-by-turn navigation", color:"#3B82F6" },
            { label:"Extended boarding for WAV/NEMT", color:"#F59E0B" },
            { label:"Drop-off proof (photo/signature)", color:"#EF4444" },
            { label:"Earnings & payout dashboard", color:"#6B5ED7" },
            { label:"Document compliance portal", color:"#10B981" },
          ].map((f,i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background:"#1A1738" }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:f.color }}/>
              <p className="text-xs text-white">{f.label}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-3" style={{ background:"#1A1738", border:"1px solid #10B98133" }}>
          <p className="text-xs font-bold text-emerald-400 mb-1">Health-Transport Certified</p>
          <p className="text-[10px]" style={{ color:"#8884AA" }}>First aid trained · Accessibility vetted · Background checked · Vehicle inspected.</p>
        </div>
      </div>
    </div>
  );
}
