import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, MapPin, Search, Clock, Star, ChevronRight, Phone,
  Shield, AlertCircle, CheckCircle, ArrowLeft, Navigation,
  CreditCard, Wallet, Banknote, Smartphone, Bell, User,
  Calendar, Plus, Minus, Heart, RotateCcw, ChevronLeft, Home,
  History, Settings, LogOut, Loader2,
} from "lucide-react";
import { haAuth, haRides, haPassengers, haSos, setHaToken, getHaToken } from "../services/eHailingAppleApi";
import { DemoModePill } from "./DemoModeBanner";
import { setDemoMode, DEMO_TOKEN } from "../services/demoMode";
import architectureSvg from "../../imports/ehailing_apple_architecture.svg";

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = "home" | "ride-type" | "medical-note" | "searching" | "driver-arriving" | "in-trip" | "rating" | "history" | "scheduled";
type VehicleType = "standard" | "wheelchair" | "stretcher";
type PaymentMethod = "card" | "mobile_money" | "wallet" | "cash";
interface RideData { [key: string]: unknown }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const timeAgo = (iso: string) => { const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s/60)}m ago`; return `${Math.floor(s/3600)}h ago`; };
const fmtR = (n: number) => `R${n.toFixed(2)}`;

// ─── SVG Map (Cape Town area simulation) ─────────────────────────────────────
function HealingMap({ mode, etaMin }: { mode: "home" | "tracking" | "live"; etaMin?: number }) {
  const [driverPos, setDriverPos] = useState({ x: 200, y: 180 });
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setPulse(p => (p + 1) % 60);
      if (mode === "tracking" || mode === "live") {
        setDriverPos(p => ({ x: p.x + (Math.random() * 4 - 2), y: p.y + (Math.random() * 4 - 2) }));
      }
    }, 800);
    return () => clearInterval(t);
  }, [mode]);

  const mapBg = "#E8F0E8";
  return (
    <svg viewBox="0 0 375 260" className="w-full" style={{ background: mapBg }}>
      {/* Road grid */}
      {[40,80,120,160,200,240].map(y => <line key={`h${y}`} x1="0" y1={y} x2="375" y2={y} stroke="#D4D0C4" strokeWidth="8" />)}
      {[50,100,150,200,250,300,350].map(x => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="260" stroke="#D4D0C4" strokeWidth="8" />)}
      {/* Green areas */}
      <rect x="110" y="45" width="80" height="70" rx="4" fill="#C8E6C9" opacity="0.7" />
      <rect x="260" y="130" width="70" height="50" rx="4" fill="#C8E6C9" opacity="0.7" />
      {/* Main roads */}
      <line x1="0" y1="120" x2="375" y2="120" stroke="#BFBDB0" strokeWidth="14" />
      <line x1="150" y1="0" x2="150" y2="260" stroke="#BFBDB0" strokeWidth="14" />
      {/* Road markings */}
      {[0,40,80,120,160,200,240,280,320].map((x,i) => <line key={i} x1={x+10} y1="120" x2={x+28} y2="120" stroke="white" strokeWidth="2" strokeDasharray="6,6" />)}
      {[0,40,80,120,160,200].map((y,i) => <line key={i} x1="150" y1={y+10} x2="150" y2={y+28} stroke="white" strokeWidth="2" strokeDasharray="6,6" />)}

      {/* Buildings */}
      {[[60,45,35,30],[200,50,40,25],[60,150,30,35],[210,155,45,30],[305,50,40,35],[310,155,35,25]].map(([x,y,w,h],i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill="#D0CECA" stroke="#B8B6B0" strokeWidth="0.5" />
      ))}

      {/* Hospital icon */}
      <rect x="280" y="42" width="30" height="28" rx="3" fill="white" stroke="#E53935" strokeWidth="1.5" />
      <text x="295" y="61" textAnchor="middle" fontSize="14" fill="#E53935" fontWeight="bold">+</text>

      {/* Route line when tracking */}
      {(mode === "tracking" || mode === "live") && (
        <path d={`M ${driverPos.x} ${driverPos.y} Q 200 120 230 200`} fill="none" stroke="#6B5ED7" strokeWidth="3" strokeDasharray="8,4" opacity="0.8" />
      )}

      {/* Destination pin */}
      <g transform="translate(220, 185)">
        <circle cx="0" cy="0" r="12" fill="#6B5ED7" opacity="0.2" />
        <circle cx="0" cy="0" r="7" fill="#6B5ED7" />
        <circle cx="0" cy="0" r="3" fill="white" />
      </g>
      <rect x="228" y="170" width="56" height="16" rx="3" fill="white" opacity="0.9" />
      <text x="256" y="181" textAnchor="middle" fontSize="7" fill="#333" fontWeight="600">Groote Schuur</text>

      {/* Pickup pin */}
      {mode === "home" && (
        <g transform="translate(150, 120)">
          <circle cx="0" cy="-20" r={8 + Math.sin(pulse * 0.2) * 2} fill="#6B5ED7" opacity="0.15" />
          <circle cx="0" cy="-20" r="8" fill="#6B5ED7" />
          <circle cx="0" cy="-20" r="3.5" fill="white" />
          <line x1="0" y1="-12" x2="0" y2="0" stroke="#6B5ED7" strokeWidth="1.5" />
        </g>
      )}

      {/* Driver car */}
      {(mode === "tracking" || mode === "live") && (
        <g transform={`translate(${driverPos.x}, ${driverPos.y})`}>
          <circle cx="0" cy="0" r={10 + Math.sin(pulse * 0.15) * 2} fill="#6B5ED7" opacity="0.15" />
          <circle cx="0" cy="0" r="14" fill="white" stroke="#6B5ED7" strokeWidth="2" />
          <text x="0" y="5" textAnchor="middle" fontSize="12">🚗</text>
        </g>
      )}

      {/* ETA badge */}
      {etaMin && (
        <g>
          <rect x={driverPos.x - 18} y={driverPos.y - 30} width="36" height="16" rx="8" fill="#6B5ED7" />
          <text x={driverPos.x} y={driverPos.y - 19} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">{etaMin} min</text>
        </g>
      )}

      {/* Nearby drivers (home mode) */}
      {mode === "home" && [[80,80],[280,100],[100,180],[320,180]].map(([x,y],i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          <circle cx="0" cy="0" r="10" fill="white" stroke="#9085E8" strokeWidth="1.5" opacity="0.8" />
          <text x="0" y="4" textAnchor="middle" fontSize="9">🚗</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Phone Frame ──────────────────────────────────────────────────────────────
function PhoneShell({ children, bg = "#F5F5F7" }: { children: React.ReactNode; bg?: string }) {
  return (
    <div className="flex items-center justify-center flex-1 overflow-hidden py-4">
      <div className="relative flex-shrink-0" style={{ width: 375, height: 780 }}>
        <div className="absolute inset-0 rounded-[44px]"
          style={{ background: "linear-gradient(145deg,#2a2a2e,#1a1a1e)", border: "2px solid #48484A", boxShadow: "0 40px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
          {/* Side buttons */}
          <div className="absolute left-0 top-[132px] w-[3px] h-8 rounded-l-sm" style={{ background: "#3a3a3c", marginLeft: "-3px" }} />
          <div className="absolute left-0 top-[182px] w-[3px] h-14 rounded-l-sm" style={{ background: "#3a3a3c", marginLeft: "-3px" }} />
          <div className="absolute left-0 top-[248px] w-[3px] h-14 rounded-l-sm" style={{ background: "#3a3a3c", marginLeft: "-3px" }} />
          <div className="absolute right-0 top-[182px] w-[3px] h-20 rounded-r-sm" style={{ background: "#3a3a3c", marginRight: "-3px" }} />
          {/* Screen */}
          <div className="absolute rounded-[38px] overflow-hidden" style={{ inset: 4, background: bg }}>
            {/* Dynamic Island */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30"
              style={{ width: 120, height: 32, background: "#000", borderRadius: 20 }}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ background: "#1a1a1a", border: "1px solid #333" }} />
            </div>
            {/* Status bar */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 h-12" style={{ paddingTop: 14 }}>
              <span className="text-xs font-semibold" style={{ color: "#111" }}>{new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
              <div className="flex items-center gap-1">
                <svg viewBox="0 0 18 12" className="w-4 h-3" fill="#111"><rect x="0" y="8" width="3" height="4" rx="0.5"/><rect x="4" y="5" width="3" height="7" rx="0.5"/><rect x="8" y="2" width="3" height="10" rx="0.5"/><rect x="12" y="0" width="3" height="12" rx="0.5"/></svg>
                <div className="flex items-center"><div className="rounded-sm flex items-center px-0.5" style={{ width:22, height:11, border:"1px solid rgba(0,0,0,0.35)" }}><div className="rounded-sm" style={{ width:"76%", height:7, background:"#34d399" }}/></div></div>
              </div>
            </div>
            {/* Content */}
            <div className="absolute overflow-y-auto overflow-x-hidden" style={{ inset: 0, top: 48, bottom: 0 }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────
function BottomNav({ active, onTab }: { active: string; onTab: (t: Screen) => void }) {
  const tabs = [
    { id: "home",         label: "Home",    icon: <Home className="w-5 h-5" /> },
    { id: "scheduled",    label: "Booked",  icon: <Calendar className="w-5 h-5" /> },
    { id: "history",      label: "History", icon: <History className="w-5 h-5" /> },
    { id: "architecture", label: "Arch",    icon: <Settings className="w-5 h-5" /> },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around py-2 border-t"
      style={{ background: "white", borderColor: "#E5E7EB", height: 60 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onTab(t.id as Screen)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all"
          style={{ color: active === t.id ? "#6B5ED7" : "#9CA3AF" }}>
          {t.icon}
          <span className="text-[10px] font-medium">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [phone, setPhone] = useState("+27827000000");
  const [otp, setOtp]     = useState("123456");
  const [step, setStep]   = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleContinue = async () => {
    if (step === "phone") { setStep("otp"); return; }
    setLoading(true); setError("");
    try {
      const res = await haAuth.login("noc1", "Noc@5678");
      setHaToken(res.token);
      onLogin(res.token);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      // Demo-mode fallback — works without backend
      if (msg.includes("fetch") || msg.includes("Failed") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED") || !msg) {
        setHaToken("demo-rider-" + Date.now());
        onLogin("demo-rider-" + Date.now());
      } else {
        setError(msg);
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "#6B5ED7" }}>
      {/* Top art */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-4">
        <div className="w-20 h-20 rounded-3xl bg-white/20 flex items-center justify-center mb-4">
          <span className="text-4xl">🚖</span>
        </div>
        <h1 className="text-white text-2xl font-bold">E-hailing Apple</h1>
        <p className="text-white/75 text-sm mt-1 text-center">Public ride-hailing · Healthcare & accessibility</p>
      </div>

      {/* Form card */}
      <div className="rounded-t-3xl p-6 space-y-4" style={{ background: "white" }}>
        <h2 className="text-lg font-bold text-gray-900">{step === "phone" ? "Enter your phone number" : "Verify OTP"}</h2>
        {step === "phone" ? (
          <div className="flex items-center gap-2 rounded-xl border px-4 py-3" style={{ borderColor: "#E5E7EB" }}>
            <span className="text-gray-500 text-sm">🇿🇦 +27</span>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="82 123 4567"
              className="flex-1 outline-none text-sm text-gray-800" style={{ background: "transparent" }} />
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">Code sent to <span className="font-semibold text-gray-800">{phone}</span></p>
            <div className="flex gap-3 justify-center">
              {otp.split("").map((d, i) => (
                <div key={i} className="w-11 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                  style={{ background: "#F3F0FF", color: "#6B5ED7", border: "2px solid #6B5ED7" }}>{d}</div>
              ))}
            </div>
          </>
        )}
        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={handleContinue} disabled={loading}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {step === "phone" ? "Send OTP" : "Verify & Enter"}
        </button>
        <button type="button"
          onClick={() => { setDemoMode(true); setHaToken(DEMO_TOKEN); onLogin(DEMO_TOKEN); }}
          className="w-full py-2.5 rounded-2xl text-xs font-semibold border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all mt-1">
          ⚡ Enter Demo Mode (no server needed)
        </button>
        <p className="text-center text-xs text-gray-400">or use OTP to sign in to live server</p>
      </div>
    </div>
  );
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
function HomeScreen({ passenger, onBook, onHistory, onScheduled }: {
  passenger: RideData | null;
  onBook: (pickup: string, dropoff: string) => void;
  onHistory: () => void;
  onScheduled: () => void;
}) {
  const [dest, setDest] = useState("");
  const [focused, setFocused] = useState(false);
  const suggestions = ["Groote Schuur Hospital", "Clicks Pharmacy", "Mediclinic Cape Gate", "Red Cross Children's Hospital", "Tygerberg Hospital"];

  const name = (passenger?.name as string) ?? "Rider";
  const wallet = (passenger?.walletBalance as number) ?? 0;

  return (
    <div className="flex flex-col" style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Good morning 👋</p>
          <p className="text-base font-bold text-gray-900">{name.split(" ")[0]}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "#F3F0FF" }}>
            <Wallet className="w-3.5 h-3.5" style={{ color: "#6B5ED7" }} />
            <span className="text-xs font-semibold" style={{ color: "#6B5ED7" }}>R{wallet.toFixed(0)}</span>
          </div>
          <button onClick={onHistory} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F3F4F6" }}>
            <Bell className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative" style={{ height: 200 }}>
        <HealingMap mode="home" />
        {/* Location badge */}
        <div className="absolute bottom-3 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", color: "#374151" }}>
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          Mowbray, Cape Town
        </div>
      </div>

      {/* Search */}
      <div className="mx-4 mt-3 rounded-2xl shadow-sm" style={{ background: "white", border: "1px solid #E5E7EB" }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="text-xs text-gray-500 flex-shrink-0">Your location</span>
          <span className="text-xs font-medium text-gray-800 truncate">Mowbray, Cape Town</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3" onClick={() => setFocused(true)}>
          <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: "#6B5ED7" }} />
          <input value={dest} onChange={e => setDest(e.target.value)} onFocus={() => setFocused(true)}
            placeholder="Where are you going?" className="flex-1 text-sm outline-none text-gray-800"
            style={{ background: "transparent" }} />
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </div>
      </div>

      {/* Suggestions or quick actions */}
      {(focused || dest) ? (
        <div className="mx-4 mt-1 rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid #E5E7EB" }}>
          {suggestions.filter(s => !dest || s.toLowerCase().includes(dest.toLowerCase())).map((s, i) => (
            <button key={i} onClick={() => { setDest(s); setFocused(false); onBook("Mowbray, Cape Town", s); }}
              className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-gray-50"
              style={{ borderColor: "#F3F4F6" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#F3F0FF" }}>
                {s.includes("Hospital") || s.includes("Clinic") ? <span className="text-sm">🏥</span> : <span className="text-sm">💊</span>}
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s}</p>
                <p className="text-xs text-gray-400">Medical facility</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Quick actions */}
          <div className="px-4 mt-4">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Quick book</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Hospital", icon: "🏥", dest: "Groote Schuur Hospital" },
                { label: "Pharmacy", icon: "💊", dest: "Clicks Pharmacy" },
                { label: "Therapy",  icon: "🧘", dest: "Physio & Rehab Centre" },
                { label: "Dialysis", icon: "🏨", dest: "Renal Care Centre" },
              ].map((q, i) => (
                <button key={i} onClick={() => onBook("Mowbray, Cape Town", q.dest)}
                  className="flex items-center gap-2.5 px-3 py-3 rounded-2xl"
                  style={{ background: "white", border: "1px solid #E5E7EB" }}>
                  <span className="text-xl">{q.icon}</span>
                  <span className="text-sm font-medium text-gray-800">{q.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scheduled ride banner */}
          <div className="mx-4 mt-4 p-3.5 rounded-2xl flex items-center gap-3"
            style={{ background: "linear-gradient(135deg,#EDE9FE,#F3F0FF)", border: "1px solid #DDD6FE" }}>
            <Calendar className="w-5 h-5 flex-shrink-0" style={{ color: "#6B5ED7" }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold" style={{ color: "#5B21B6" }}>Upcoming: Physiotherapy</p>
              <p className="text-xs" style={{ color: "#7C3AED" }}>Tomorrow 09:00 · Netcare Claremont</p>
            </div>
            <button onClick={onScheduled} className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ color: "#6B5ED7", background: "white" }}>View</button>
          </div>

          {/* Accessibility info */}
          <div className="mx-4 mt-3 px-4 py-3 rounded-2xl flex items-start gap-3"
            style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
            <Heart className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
            <p className="text-xs text-emerald-700">All E-hailing Apple drivers are health-transport certified. Accessible vehicles available.</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── RIDE TYPE SCREEN ─────────────────────────────────────────────────────────
function RideTypeScreen({ pickup, dropoff, onSelect, onBack }: {
  pickup: string; dropoff: string;
  onSelect: (type: VehicleType, fare: number, payment: PaymentMethod) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<VehicleType>("standard");
  const [payment, setPayment]   = useState<PaymentMethod>("card");

  const vehicles = [
    { type: "standard" as VehicleType, label: "Standard Sedan", icon: "🚗", desc: "Regular saloon car · up to 4 passengers", eta: "4–7 min", fare: 68, badge: null },
    { type: "wheelchair" as VehicleType, label: "Wheelchair Accessible", icon: "♿", desc: "WAV van with ramp · mobility aids welcome", eta: "8–12 min", fare: 115, badge: "ACCESSIBILITY" },
    { type: "stretcher" as VehicleType, label: "Stretcher / NEMT", icon: "🚑", desc: "Non-emergency medical transport · stretcher fitted", eta: "12–18 min", fare: 210, badge: "MEDICAL" },
  ];
  const payments = [
    { id: "card" as PaymentMethod, label: "Card", icon: <CreditCard className="w-4 h-4" /> },
    { id: "mobile_money" as PaymentMethod, label: "Mobile Money", icon: <Smartphone className="w-4 h-4" /> },
    { id: "wallet" as PaymentMethod, label: "Wallet", icon: <Wallet className="w-4 h-4" /> },
    { id: "cash" as PaymentMethod, label: "Cash", icon: <Banknote className="w-4 h-4" /> },
  ];
  const chosenFare = vehicles.find(v => v.type === selected)?.fare ?? 68;

  return (
    <div className="flex flex-col h-full" style={{ paddingBottom: 0 }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#E5E7EB" }}>
        <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F3F4F6" }}>
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 truncate">📍 {pickup}</p>
          <p className="text-xs font-semibold text-gray-900 truncate">🏥 {dropoff}</p>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 px-4 pt-3 space-y-3">
        <p className="text-sm font-bold text-gray-900">Choose vehicle type</p>
        {vehicles.map(v => (
          <button key={v.type} onClick={() => setSelected(v.type)}
            className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all text-left"
            style={{ background: selected === v.type ? "#F3F0FF" : "white", border: `2px solid ${selected === v.type ? "#6B5ED7" : "#E5E7EB"}` }}>
            <span className="text-3xl">{v.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-gray-900">{v.label}</p>
                {v.badge && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "#6B5ED7", color: "white" }}>{v.badge}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{v.desc}</p>
              <p className="text-xs text-gray-400 mt-0.5">⏱ {v.eta}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold" style={{ color: "#6B5ED7" }}>R{v.fare}</p>
              <p className="text-[10px] text-gray-400">est.</p>
            </div>
          </button>
        ))}

        <p className="text-sm font-bold text-gray-900 pt-1">Payment</p>
        <div className="grid grid-cols-4 gap-2">
          {payments.map(p => (
            <button key={p.id} onClick={() => setPayment(p.id)}
              className="flex flex-col items-center gap-1 p-2.5 rounded-xl"
              style={{ background: payment === p.id ? "#F3F0FF" : "#F9FAFB", border: `2px solid ${payment === p.id ? "#6B5ED7" : "#E5E7EB"}`, color: payment === p.id ? "#6B5ED7" : "#6B7280" }}>
              {p.icon}
              <span className="text-[10px] font-medium leading-tight text-center">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Confirm button */}
      <div className="px-4 py-4 border-t" style={{ borderColor: "#E5E7EB" }}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-gray-500">Estimated fare</span>
          <span className="text-base font-bold" style={{ color: "#6B5ED7" }}>R{chosenFare}.00</span>
        </div>
        <button onClick={() => onSelect(selected, chosenFare, payment)}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
          Next: Add Medical Note
        </button>
      </div>
    </div>
  );
}

// ─── MEDICAL NOTE SCREEN ──────────────────────────────────────────────────────
function MedicalNoteScreen({ vehicleType, fare, onConfirm, onBack }: {
  vehicleType: VehicleType; fare: number;
  onConfirm: (note: string) => void;
  onBack: () => void;
}) {
  const [note, setNote] = useState("");
  const presets = ["I use a walker", "Oxygen equipment in tow", "Post-surgery — extra boarding time", "Visually impaired", "Hearing impaired", "Anxiety — please drive calmly"];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#E5E7EB" }}>
        <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F3F4F6" }}><ArrowLeft className="w-4 h-4 text-gray-700" /></button>
        <div>
          <p className="text-sm font-bold text-gray-900">Medical Note</p>
          <p className="text-xs text-gray-500">Visible to driver before they accept</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4">
        {/* Info box */}
        <div className="flex items-start gap-3 p-3.5 rounded-2xl" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
          <Heart className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">This note helps your driver prepare — e.g. bringing a wheelchair ramp, allowing extra boarding time, or adjusting driving style.</p>
        </div>

        <p className="text-xs font-semibold text-gray-700">Quick add</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((p, i) => (
            <button key={i} onClick={() => setNote(n => n ? `${n}. ${p}` : p)}
              className="text-xs px-3 py-1.5 rounded-full border transition-all"
              style={{ borderColor: "#DDD6FE", color: "#6B5ED7", background: "#F5F3FF" }}>
              + {p}
            </button>
          ))}
        </div>

        <p className="text-xs font-semibold text-gray-700">Or write your own</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
          placeholder="Describe any accessibility needs, medical equipment, or special instructions for your driver…"
          className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none"
          style={{ background: "#F9FAFB", border: "1.5px solid #E5E7EB", color: "#111827" }} />
        <p className="text-xs text-gray-400">{note.length}/300 characters</p>

        {/* No note option */}
        <button onClick={() => setNote("")} className="text-xs text-gray-400 underline">Skip — no special requirements</button>
      </div>

      <div className="px-4 py-4 border-t" style={{ borderColor: "#E5E7EB" }}>
        <div className="flex justify-between items-center mb-3 text-xs text-gray-500">
          <span className="capitalize">🚗 {vehicleType} vehicle</span>
          <span className="font-bold" style={{ color: "#6B5ED7" }}>R{fare}.00 est.</span>
        </div>
        <button onClick={() => onConfirm(note)}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
          Confirm Booking
        </button>
      </div>
    </div>
  );
}

// ─── SEARCHING SCREEN ─────────────────────────────────────────────────────────
function SearchingScreen({ vehicleType, onCancel, onFound }: {
  vehicleType: VehicleType;
  onCancel: () => void;
  onFound: (ride: RideData) => void;
}) {
  const [dots, setDots] = useState(0);
  const [searchSec, setSearchSec] = useState(0);

  useEffect(() => {
    const t1 = setInterval(() => setDots(d => (d + 1) % 4), 500);
    const t2 = setInterval(() => setSearchSec(s => s + 1), 1000);
    // Simulate match after 4 sec
    const t3 = setTimeout(() => {
      onFound({
        id: "demo-ride-1",
        driverName: "Themba Dlamini",
        driverPlate: "CA 442 801",
        driverVehicle: "Toyota Corolla Quest",
        driverRating: 4.9,
        etaMinutes: 4,
        estimatedFareZAR: 68,
      });
    }, 4000);
    return () => { clearInterval(t1); clearInterval(t2); clearTimeout(t3); };
  }, [onFound]);

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center" style={{ background: "#F5F3FF" }}>
      {/* Pulse animation */}
      <div className="relative mb-8">
        {[0,1,2].map(i => (
          <div key={i} className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "#6B5ED7", opacity: 0.1 - i * 0.03, animationDelay: `${i * 0.4}s`, width: 120 + i * 40, height: 120 + i * 40, top: -(i * 20), left: -(i * 20) }} />
        ))}
        <div className="relative w-28 h-28 rounded-full flex items-center justify-center"
          style={{ background: "white", boxShadow: "0 8px 32px rgba(107,94,215,0.3)" }}>
          <span className="text-5xl">🚗</span>
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-2">Finding your driver{".".repeat(dots)}</h2>
      <p className="text-sm text-gray-500 mb-1">Looking for a {vehicleType === "wheelchair" ? "wheelchair-accessible" : vehicleType === "stretcher" ? "stretcher" : "standard"} vehicle</p>
      <p className="text-xs text-gray-400">{searchSec}s · Nearby drivers notified</p>

      <div className="mt-8 space-y-3 w-full">
        {["Themba — 0.4 km away","Sipho — 0.8 km away","Farai — 1.1 km away"].map((d, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: "white", border: "1px solid #E5E7EB", opacity: 1 - i * 0.2 }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "#EDE9FE", color: "#6B5ED7" }}>{d[0]}</div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-gray-900">{d.split(" — ")[0]}</p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span className="text-yellow-400">★</span><span>4.8</span><span>·</span><span>{d.split(" — ")[1]}</span>
              </div>
            </div>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#6B5ED7" }} />
          </div>
        ))}
      </div>

      <button onClick={onCancel} className="mt-6 text-sm text-gray-500 underline">Cancel search</button>
    </div>
  );
}

// ─── DRIVER ARRIVING SCREEN ───────────────────────────────────────────────────
function DriverArrivingScreen({ ride, onSos, onStart }: {
  ride: RideData;
  onSos: () => void;
  onStart: () => void;
}) {
  const [eta, setEta] = useState(Number(ride.etaMinutes) || 4);
  useEffect(() => {
    if (eta <= 0) return;
    const t = setInterval(() => setEta(e => Math.max(0, e - 1)), 30000);
    return () => clearInterval(t);
  }, [eta]);

  return (
    <div className="flex flex-col h-full">
      <div style={{ height: 200, position: "relative" }}>
        <HealingMap mode="tracking" etaMin={eta} />
        {/* SOS floating */}
        <button onClick={onSos} className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-full font-bold text-white text-xs shadow-lg"
          style={{ background: "#EF4444", boxShadow: "0 4px 12px rgba(239,68,68,0.5)" }}>
          <Shield className="w-3.5 h-3.5" />SOS
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4" style={{ paddingBottom: 80 }}>
        {/* ETA bar */}
        <div className="flex items-center justify-between p-4 rounded-2xl" style={{ background: "#F3F0FF" }}>
          <div>
            <p className="text-xs text-gray-500">Driver arriving in</p>
            <p className="text-3xl font-black" style={{ color: "#6B5ED7" }}>{eta} <span className="text-base font-semibold text-gray-500">min</span></p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Estimated fare</p>
            <p className="text-xl font-bold text-gray-900">{fmtR(ride.estimatedFareZAR as number)}</p>
          </div>
        </div>

        {/* Driver card */}
        <div className="p-4 rounded-2xl" style={{ background: "white", border: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold" style={{ background: "#EDE9FE", color: "#6B5ED7" }}>
              {(ride.driverName as string)?.split(" ").map((w: string) => w[0]).join("")}
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900">{ride.driverName as string}</p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span className="text-yellow-400">★</span>
                <span>{Number(ride.driverRating).toFixed(1)}</span>
                <span>· Health-transport certified</span>
              </div>
            </div>
            <button className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#F3F0FF" }}>
              <Phone className="w-4 h-4" style={{ color: "#6B5ED7" }} />
            </button>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "#F9FAFB" }}>
            <span className="text-xl">🚗</span>
            <div>
              <p className="text-sm font-semibold text-gray-800">{ride.driverVehicle as string}</p>
              <p className="text-xs text-gray-500">{ride.driverPlate as string}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl">
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>First aid certified · Accessibility trained · Background checked</span>
          </div>
        </div>

        {/* Safety tips */}
        <div className="flex items-start gap-3 p-3.5 rounded-2xl" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">Verify the plate <span className="font-bold">{ride.driverPlate as string}</span> and driver name before getting in.</p>
        </div>
      </div>

      {/* Demo advance button */}
      <div className="absolute bottom-4 left-4 right-4">
        <button onClick={onStart} className="w-full py-3.5 rounded-2xl text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}>
          ✓ Driver arrived — Start Trip
        </button>
      </div>
    </div>
  );
}

// ─── IN TRIP SCREEN ───────────────────────────────────────────────────────────
function InTripScreen({ ride, onSos, onComplete }: {
  ride: RideData;
  onSos: () => void;
  onComplete: () => void;
}) {
  const [tripSec, setTripSec] = useState(0);
  const [sosActive, setSosActive] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTripSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mins = Math.floor(tripSec / 60);
  const secs = tripSec % 60;

  const handleSos = () => {
    setSosActive(true);
    onSos();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Map */}
      <div style={{ height: 200, position: "relative" }}>
        <HealingMap mode="live" />
        {/* Trip timer */}
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: "rgba(0,0,0,0.7)", color: "white" }}>
          ⏱ {String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 space-y-3" style={{ paddingBottom: 16 }}>
        {/* Status */}
        <div className="flex items-center gap-3 p-3.5 rounded-2xl" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-sm font-bold text-emerald-700">Trip in progress</p>
          <p className="ml-auto text-xs text-emerald-600">{fmtR(ride.estimatedFareZAR as number)} est.</p>
        </div>

        {/* Route */}
        <div className="p-4 rounded-2xl space-y-2" style={{ background: "white", border: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <p className="text-xs text-gray-500">Mowbray, Cape Town</p>
          </div>
          <div className="w-px h-4 bg-gray-200 ml-1" />
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-gray-900">{String(ride.dropoffAddress ?? "Groote Schuur Hospital")}</p>
          </div>
        </div>

        {/* Caregiver share */}
        <div className="flex items-center gap-3 p-3.5 rounded-2xl" style={{ background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
          <Heart className="w-4 h-4 flex-shrink-0" style={{ color: "#6B5ED7" }} />
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: "#5B21B6" }}>Share live trip</p>
            <p className="text-xs text-gray-500">Caregiver can follow your journey</p>
          </div>
          <button className="text-xs font-bold px-3 py-1.5 rounded-xl text-white" style={{ background: "#6B5ED7" }}>Share</button>
        </div>

        {/* SOS — persistent */}
        {sosActive ? (
          <div className="p-4 rounded-2xl text-center" style={{ background: "#FEF2F2", border: "2px solid #EF4444" }}>
            <p className="text-sm font-bold text-red-600 mb-1">🚨 SOS ACTIVE</p>
            <p className="text-xs text-red-500">Emergency contacts notified · Emergency services alerted</p>
            <button onClick={() => setSosActive(false)} className="mt-2 text-xs text-red-600 underline">Cancel false alarm</button>
          </div>
        ) : (
          <button onClick={handleSos}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-white"
            style={{ background: "linear-gradient(135deg,#EF4444,#DC2626)", boxShadow: "0 4px 16px rgba(239,68,68,0.4)" }}>
            <Shield className="w-5 h-5" />
            <span>SOS — Emergency Help</span>
          </button>
        )}
      </div>

      {/* Demo: complete trip */}
      <div className="px-4 pb-4">
        <button onClick={onComplete} className="w-full py-3 rounded-2xl text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}>
          ✓ Arrived at destination
        </button>
      </div>
    </div>
  );
}

// ─── RATING SCREEN ────────────────────────────────────────────────────────────
function RatingScreen({ ride, onDone }: { ride: RideData; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const tips = ["Great driver!", "Very patient", "Safe driving", "Helped with bags", "Punctual"];

  if (submitted) return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6" style={{ background: "#F0FDF4" }}>
        <CheckCircle className="w-12 h-12 text-emerald-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h2>
      <p className="text-sm text-gray-500 mb-6">Your feedback helps us improve healthcare transport for everyone.</p>
      <p className="text-2xl font-black" style={{ color: "#6B5ED7" }}>R{Number(ride.estimatedFareZAR).toFixed(2)}</p>
      <p className="text-xs text-gray-500 mt-1">charged to your card</p>
      <button onClick={onDone} className="mt-8 w-full py-3.5 rounded-2xl text-white font-bold text-sm"
        style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
        Back to Home
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full px-4 pt-4" style={{ paddingBottom: 16 }}>
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl font-bold mb-3" style={{ background: "#EDE9FE", color: "#6B5ED7" }}>
          {(ride.driverName as string)?.split(" ").map((w: string) => w[0]).join("")}
        </div>
        <p className="font-bold text-gray-900">{ride.driverName as string}</p>
        <p className="text-xs text-gray-500">{ride.driverVehicle as string} · {ride.driverPlate as string}</p>
      </div>

      <p className="text-sm font-bold text-gray-900 text-center mb-3">How was your trip?</p>
      <div className="flex justify-center gap-3 mb-4">
        {[1,2,3,4,5].map(s => (
          <button key={s} onClick={() => setStars(s)}>
            <Star className={`w-9 h-9 ${s <= stars ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-center mb-4">
        {tips.map((t, i) => (
          <button key={i} onClick={() => setReview(r => r ? `${r}. ${t}` : t)}
            className="text-xs px-3 py-1.5 rounded-full border"
            style={{ borderColor: "#DDD6FE", color: "#6B5ED7", background: "#F5F3FF" }}>
            + {t}
          </button>
        ))}
      </div>

      <textarea value={review} onChange={e => setReview(e.target.value)} rows={3} placeholder="Leave a review (optional)…"
        className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none mb-4"
        style={{ background: "#F9FAFB", border: "1.5px solid #E5E7EB" }} />

      <button disabled={stars === 0} onClick={() => setSubmitted(true)}
        className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-40"
        style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
        Submit Rating
      </button>
    </div>
  );
}

// ─── HISTORY SCREEN ───────────────────────────────────────────────────────────
function HistoryScreen({ trips }: { trips: RideData[] }) {
  return (
    <div className="px-4 pt-4 pb-20">
      <p className="text-base font-bold text-gray-900 mb-4">Trip History</p>
      {trips.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No trips yet</p>
        </div>
      ) : trips.map((t, i) => (
        <div key={i} className="mb-3 p-4 rounded-2xl" style={{ background: "white", border: "1px solid #E5E7EB" }}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${(t.status as string) === "completed" ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50"}`}>
              {t.status as string}
            </span>
            <span className="text-xs text-gray-400">{timeAgo(t.createdAt as string)}</span>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500 truncate">📍 {(t.pickupAddress as { label: string })?.label}</p>
            <p className="text-xs font-medium text-gray-800 truncate">🏥 {(t.dropoffAddress as { label: string })?.label}</p>
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "#F3F4F6" }}>
            <span className="text-xs text-gray-500">{t.driverName as string ?? "—"}</span>
            <div className="flex items-center gap-2">
              {t.passengerRating && (
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map(s => <Star key={s} className={`w-3 h-3 ${s <= Number(t.passengerRating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />)}
                </div>
              )}
              <span className="text-sm font-bold" style={{ color: "#6B5ED7" }}>{fmtR(Number(t.estimatedFareZAR))}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ARCHITECTURE SCREEN (Rider) ─────────────────────────────────────────────
function RiderArchitectureScreen() {
  return (
    <div className="px-3 pt-4 pb-20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"#6B5ED7" }}>
          <span className="text-sm">🏗</span>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">System Architecture</p>
          <p className="text-[10px] text-gray-500">E-hailing Apple · Full stack</p>
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden border mb-4" style={{ borderColor:"#E5E7EB" }}>
        <img src={architectureSvg} alt="E-hailing Apple Architecture" className="w-full" />
      </div>
      {[
        { layer:"CLIENT",  items:["Rider App (iOS/Android)","Driver App","Caregiver App","Admin Panel"], color:"#0F6E56", bg:"#ECFDF5" },
        { layer:"GATEWAY", items:["API Gateway","JWT · OTP auth","Rate Limiting","WebSocket Hub"],        color:"#534AB7", bg:"#EEEDFE" },
        { layer:"CORE",    items:["Auth Svc","User Svc · KYC","Ride Svc","Matching Engine","Location Svc"], color:"#185FA5", bg:"#E6F1FB" },
        { layer:"SUPPORT", items:["Payment","Notifications","Pricing Engine","Rating","SOS Safety Svc"],  color:"#993C1D", bg:"#FAECE7" },
        { layer:"DATA",    items:["PostgreSQL","InfluxDB · GPS","Redis · geo cache","AWS S3 · docs"],     color:"#5F5E5A", bg:"#F1EFE8" },
        { layer:"EXTERNAL",items:["Stripe · Flutterwave · MoMo","Africa's Talking · Twilio","Google Maps · Mapbox","Firebase FCM"], color:"#7C3AED", bg:"#F5F3FF" },
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

// ─── SCHEDULED SCREEN ─────────────────────────────────────────────────────────
function ScheduledScreen({ onBack }: { onBack: () => void }) {
  const rides = [
    { label: "Physiotherapy", dest: "Netcare Claremont", time: "Tomorrow 09:00", recurrence: "Weekly · Tuesday", type: "standard" },
    { label: "Dialysis", dest: "Renal Care Cape Town", time: "Mon · Wed · Fri 07:30", recurrence: "3× per week", type: "standard" },
  ];
  return (
    <div className="px-4 pt-4 pb-20">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F3F4F6" }}><ArrowLeft className="w-4 h-4 text-gray-700" /></button>
        <p className="text-base font-bold text-gray-900">Scheduled Rides</p>
      </div>
      {rides.map((r, i) => (
        <div key={i} className="mb-3 p-4 rounded-2xl" style={{ background: "white", border: "1px solid #E5E7EB" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-gray-900">{r.label}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-50 text-purple-600">RECURRING</span>
          </div>
          <p className="text-xs text-gray-500 mb-0.5">🏥 {r.dest}</p>
          <p className="text-xs font-medium text-gray-700 mb-0.5">⏰ {r.time}</p>
          <p className="text-xs text-gray-400">{r.recurrence}</p>
          <div className="flex items-center gap-2 mt-3">
            <button className="flex-1 py-2 rounded-xl text-xs font-semibold text-center" style={{ background: "#F3F0FF", color: "#6B5ED7" }}>Edit</button>
            <button className="flex-1 py-2 rounded-xl text-xs font-semibold text-center" style={{ background: "#FEF2F2", color: "#EF4444" }}>Cancel</button>
          </div>
        </div>
      ))}
      <button className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 mt-2"
        style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
        <Plus className="w-4 h-4" /> Schedule New Ride
      </button>
    </div>
  );
}

// Demo data used when backend is offline
const DEMO_RIDER: RideData = {
  id:"demo-rider-1", name:"Margaret Botha", phone:"+27827000000",
  avatarInitials:"MB", walletBalance:285, currency:"ZAR",
  preferredVehicleType:"standard", totalTrips:34, avgRating:4.8,
};
const DEMO_TRIPS: RideData[] = [
  { id:"t1", passengerId:"demo-rider-1", passengerName:"Margaret Botha", vehicleType:"standard", pickupAddress:{ label:"Mowbray, Cape Town" }, dropoffAddress:{ label:"Groote Schuur Hospital" }, estimatedFareZAR:68, finalFareZAR:68, status:"completed", driverName:"Themba Dlamini", passengerRating:5, createdAt:new Date(Date.now()-7200000).toISOString() },
  { id:"t2", passengerId:"demo-rider-1", passengerName:"Margaret Botha", vehicleType:"wheelchair", pickupAddress:{ label:"Clicks Pharmacy" }, dropoffAddress:{ label:"Tygerberg Hospital" }, estimatedFareZAR:115, finalFareZAR:115, status:"completed", driverName:"Sipho Ndlovu", passengerRating:5, createdAt:new Date(Date.now()-86400000).toISOString() },
  { id:"t3", passengerId:"demo-rider-1", passengerName:"Margaret Botha", vehicleType:"standard", pickupAddress:{ label:"Home" }, dropoffAddress:{ label:"Mediclinic Cape Gate" }, estimatedFareZAR:95, finalFareZAR:null, status:"cancelled", driverName:null, passengerRating:null, createdAt:new Date(Date.now()-172800000).toISOString() },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
interface PassengerDashboardProps { isOpen: boolean; onClose: () => void }

export function PassengerDashboard({ isOpen, onClose }: PassengerDashboardProps) {
  const [authed, setAuthed]       = useState(!!getHaToken());
  const [demoMode, setDemoMode]   = useState(false);
  const [screen, setScreen]       = useState<Screen>("home");
  const [passenger, setPassenger] = useState<RideData | null>(null);
  const [trips, setTrips]         = useState<RideData[]>([]);
  const [pickupAddr, setPickupAddr] = useState("Mowbray, Cape Town");
  const [dropoffAddr, setDropoffAddr] = useState("");
  const [vType, setVType]         = useState<VehicleType>("standard");
  const [fare, setFare]           = useState(68);
  const [payment, setPayment]     = useState<PaymentMethod>("card");
  const [activeRide, setActiveRide] = useState<RideData | null>(null);

  const loadData = useCallback(async () => {
    if (!getHaToken()) return;
    let usedDemo = false;
    try {
      const [pRes, tRes] = await Promise.allSettled([
        haPassengers.get("demo-passenger"),
        haRides.list({ limit: "15" }),
      ]);
      if (pRes.status === "fulfilled") { setPassenger(pRes.value.data as RideData); }
      else { setPassenger(DEMO_RIDER); usedDemo = true; }
      if (tRes.status === "fulfilled" && Array.isArray(tRes.value.data) && tRes.value.data.length > 0) { setTrips(tRes.value.data as RideData[]); }
      else { setTrips(DEMO_TRIPS); usedDemo = true; }
      if (usedDemo) setDemoMode(true);
    } catch {
      setPassenger(DEMO_RIDER);
      setTrips(DEMO_TRIPS);
      setDemoMode(true);
    }
  }, []);

  useEffect(() => { if (isOpen && authed) loadData(); }, [isOpen, authed, loadData]);
  // Auto-login in demo mode when token is fake
  useEffect(() => {
    if (isOpen && !authed) {
      const token = getHaToken();
      if (token?.startsWith("demo-rider-")) { setAuthed(true); }
    }
  }, [isOpen, authed]);

  if (!isOpen) return null;

  const handleLogin = (_token: string) => { setAuthed(true); loadData(); };
  const handleBook  = (pickup: string, dropoff: string) => { setPickupAddr(pickup); setDropoffAddr(dropoff); setScreen("ride-type"); };
  const handleRideTypeSelect = (type: VehicleType, f: number, pm: PaymentMethod) => { setVType(type); setFare(f); setPayment(pm); setScreen("medical-note"); };
  const handleConfirmBooking = async (_note: string) => { setScreen("searching"); };
  const handleDriverFound    = (ride: RideData) => { setActiveRide(ride); setScreen("driver-arriving"); };
  const handleStartTrip      = () => setScreen("in-trip");
  const handleSos            = () => {};
  const handleComplete       = () => setScreen("rating");
  const handleRatingDone     = () => { setActiveRide(null); setScreen("home"); loadData(); };

  type ExtScreen = Screen | "architecture";

  const renderScreen = () => {
    switch (screen as ExtScreen) {
      case "home":           return <HomeScreen passenger={passenger} onBook={handleBook} onHistory={() => setScreen("history")} onScheduled={() => setScreen("scheduled")} />;
      case "ride-type":      return <RideTypeScreen pickup={pickupAddr} dropoff={dropoffAddr} onSelect={handleRideTypeSelect} onBack={() => setScreen("home")} />;
      case "medical-note":   return <MedicalNoteScreen vehicleType={vType} fare={fare} onConfirm={handleConfirmBooking} onBack={() => setScreen("ride-type")} />;
      case "searching":      return <SearchingScreen vehicleType={vType} onCancel={() => setScreen("home")} onFound={handleDriverFound} />;
      case "driver-arriving":return activeRide ? <DriverArrivingScreen ride={activeRide} onSos={handleSos} onStart={handleStartTrip} /> : null;
      case "in-trip":        return activeRide ? <InTripScreen ride={{ ...activeRide, dropoffAddress: dropoffAddr || "Destination" } as RideData} onSos={handleSos} onComplete={handleComplete} /> : null;
      case "rating":         return activeRide ? <RatingScreen ride={activeRide} onDone={handleRatingDone} /> : null;
      case "history":        return <HistoryScreen trips={trips} />;
      case "scheduled":      return <ScheduledScreen onBack={() => setScreen("home")} />;
      case "architecture":   return <RiderArchitectureScreen />;
      default:               return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: "#0D0B1E" }}>
      {/* Close button */}
      <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors">
        <X className="w-5 h-5" />
      </button>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center px-5 z-40"
        style={{ background: "#13103A", borderBottom: "1px solid #2D2A50" }}>
        <div className="flex items-center gap-3">
          <span className="text-xl">🚖</span>
          <div>
            <p className="text-white font-bold text-sm">E-hailing Apple</p>
            <p className="text-[10px]" style={{ color: "#8884AA" }}>Rider App</p>
          </div>
        </div>
        {demoMode && authed && (
          <span className="ml-auto text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background:"#F59E0B22", color:"#F59E0B", border:"1px solid #F59E0B44" }}>
            DEMO MODE
          </span>
        )}
      </div>

      {/* Demo banner */}
      {authed && demoMode && (
        <div className="absolute z-40 flex items-center gap-2 px-4 py-1.5 text-xs font-medium"
          style={{ top:56, left:0, right:0, background:"#F59E0B18", borderBottom:"1px solid #F59E0B44", color:"#D97706" }}>
          <span>⚡ Demo mode — start backend for live data:</span>
          <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">cd server && pnpm dev</code>
        </div>
      )}

      {/* Phone */}
      <div className="flex-1 flex items-start justify-center" style={{ paddingTop: authed && demoMode ? 88 : 56 }}>
        <PhoneShell bg={authed ? "#F5F5F7" : "#6B5ED7"}>
          {!authed ? (
            <LoginScreen onLogin={handleLogin} />
          ) : (
            <>
              {renderScreen()}
              {["home","history","scheduled","architecture"].includes(screen) && (
                <BottomNav active={screen} onTab={s => setScreen(s as Screen)} />
              )}
            </>
          )}
        </PhoneShell>
      </div>

      {/* Right info panel */}
      <div className="hidden xl:flex flex-col w-72 p-6 space-y-4 overflow-y-auto" style={{ borderLeft: "1px solid #2D2A50" }}>
        <h3 className="text-white font-bold text-sm">E-hailing Apple — Rider App</h3>
        <p className="text-xs" style={{ color: "#8884AA" }}>Healthcare transport for everyone — book accessible rides to clinics, hospitals & therapy.</p>
        <div className="space-y-2">
          {[
            { label: "Standard Sedan", color: "#6B5ED7", desc: "Regular trips" },
            { label: "Wheelchair Van", color: "#10B981", desc: "WAV with ramp" },
            { label: "Stretcher/NEMT", color: "#EF4444", desc: "Medical transport" },
          ].map((v, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: "#1A1738" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: v.color }} />
              <div><p className="text-xs font-semibold text-white">{v.label}</p><p className="text-[10px]" style={{ color: "#8884AA" }}>{v.desc}</p></div>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-3" style={{ background: "#1A1738", border: "1px solid #EF444433" }}>
          <p className="text-xs font-bold text-red-400 mb-1">🚨 SOS Feature</p>
          <p className="text-[10px]" style={{ color: "#8884AA" }}>One-tap emergency alert notifies contacts + emergency services with your live GPS.</p>
        </div>
      </div>
    </div>
  );
}
