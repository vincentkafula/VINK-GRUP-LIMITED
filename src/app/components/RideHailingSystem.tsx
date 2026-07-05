/**
 * VMS Ride-Hailing System — Complete Uber-like Platform
 * Passenger · Driver · Admin · Messaging · Calling · Payments · Ratings
 */
import { useState, useEffect, useRef } from "react";
import {
  X, MapPin, Navigation, Star, Phone, MessageCircle, CreditCard,
  Clock, CheckCircle, AlertTriangle, ChevronRight, Search,
  User, Car, Shield, TrendingUp, Users, BarChart3,
  Send, Mic, MicOff, PhoneCall, PhoneOff, Volume2, RefreshCw,
} from "lucide-react";
import { projectId } from "../../../utils/supabase/info";

interface Props { isOpen: boolean; onClose: () => void; }

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-3f39932e/ride`;
const P = "#5B2D8E";
const TEAL = "#14B8A6";
const GOLD = "#F5A623";
const GREEN = "#10B981";

const fmt = (n: number) => `R${n.toFixed(2)}`;

type AppRole = "choose" | "passenger" | "driver" | "admin";
type PassengerScreen = "home" | "booking" | "matching" | "tracking" | "chat" | "call" | "rate" | "history";
type DriverScreen = "status" | "request" | "navigate" | "chat" | "call" | "earnings" | "history";
type AdminScreen = "overview" | "trips" | "drivers" | "passengers" | "pricing";

const VEHICLE_TYPES = [
  { id: "standard",   label: "Standard",   sub: "Everyday sedan/taxi",   emoji: "🚗", color: "#6B5ED7" },
  { id: "premium",    label: "Premium",     sub: "Air-con sedan",         emoji: "🚙", color: "#F59E0B" },
  { id: "xl",         label: "XL / Taxi",   sub: "HiAce / Quantum",       emoji: "🚐", color: "#3B82F6" },
  { id: "accessible", label: "Accessible",  sub: "Wheelchair friendly",   emoji: "♿", color: "#10B981" },
];

const CAPE_TOWNS = [
  { label: "Cape Town CBD — Civic Centre", lat: -33.930, lng: 18.420 },
  { label: "V&A Waterfront", lat: -33.905, lng: 18.420 },
  { label: "Khayelitsha", lat: -34.040, lng: 18.680 },
  { label: "Bellville", lat: -33.900, lng: 18.630 },
  { label: "Sea Point", lat: -33.920, lng: 18.390 },
  { label: "Claremont", lat: -34.022, lng: 18.468 },
  { label: "Cape Town Airport", lat: -33.970, lng: 18.600 },
  { label: "Mitchell's Plain", lat: -34.030, lng: 18.622 },
  { label: "Observatory", lat: -33.937, lng: 18.474 },
  { label: "Groote Schuur Hospital", lat: -33.940, lng: 18.465 },
];

const STATUS_COLORS: Record<string, string> = {
  requested: "#F59E0B", assigned: "#3B82F6", driver_enroute: "#8B5CF6",
  arrived: "#14B8A6", in_progress: "#10B981", completed: "#6B7280",
  cancelled: "#EF4444",
};

const STATUS_LABELS: Record<string, string> = {
  requested: "Searching for driver…", assigned: "Driver assigned",
  driver_enroute: "Driver on the way", arrived: "Driver has arrived",
  in_progress: "Trip in progress", completed: "Trip completed", cancelled: "Cancelled",
};

// ─── API helpers ──────────────────────────────────────────────────────────────
async function api(path: string, method = "GET", body?: object) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method, headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await r.json();
  } catch { return { success: false, error: "Network error" }; }
}

// ─── Map placeholder ──────────────────────────────────────────────────────────
function MapView({ pickup, dest, driverLat, driverLng, stage }: { pickup?: string; dest?: string; driverLat?: number; driverLng?: number; stage?: string }) {
  return (
    <div className="relative flex-1 min-h-0" style={{ background: "#1a1a2e" }}>
      {/* Grid lines */}
      <svg className="absolute inset-0 w-full h-full opacity-20">
        <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#4444AA" strokeWidth="0.5"/></pattern></defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {/* Roads suggestion */}
      <svg className="absolute inset-0 w-full h-full opacity-30">
        <line x1="0" y1="40%" x2="100%" y2="40%" stroke="#5566CC" strokeWidth="2" />
        <line x1="0" y1="65%" x2="100%" y2="65%" stroke="#5566CC" strokeWidth="1.5" />
        <line x1="30%" y1="0" x2="30%" y2="100%" stroke="#5566CC" strokeWidth="2" />
        <line x1="70%" y1="0" x2="70%" y2="100%" stroke="#5566CC" strokeWidth="1.5" />
        <line x1="10%" y1="20%" x2="90%" y2="80%" stroke="#3344AA" strokeWidth="1" />
        <line x1="90%" y1="20%" x2="10%" y2="80%" stroke="#3344AA" strokeWidth="1" />
      </svg>
      {/* Route line */}
      {pickup && dest && (
        <svg className="absolute inset-0 w-full h-full">
          <line x1="30%" y1="70%" x2="70%" y2="30%" stroke="#7B6FE8" strokeWidth="3" strokeDasharray="8 4" />
        </svg>
      )}
      {/* Destination pin */}
      {dest && (
        <div className="absolute text-2xl" style={{ top: "25%", left: "67%", transform: "translate(-50%,-100%)" }}>📍</div>
      )}
      {/* Pickup pin */}
      {pickup && (
        <div className="absolute text-2xl" style={{ top: "67%", left: "28%", transform: "translate(-50%,-100%)" }}>🟢</div>
      )}
      {/* Driver pin */}
      {driverLat !== undefined && (
        <div className="absolute text-xl transition-all duration-1000" style={{ top: "45%", left: "45%", transform: "translate(-50%,-50%)" }}>🚗</div>
      )}
      {/* Stage label */}
      {stage && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-bold text-white"
          style={{ background: STATUS_COLORS[stage] ?? P }}>
          {STATUS_LABELS[stage] ?? stage}
        </div>
      )}
      <div className="absolute top-2 left-2 text-[10px] text-white/30 font-mono">Cape Town, ZA · Live Map</div>
    </div>
  );
}

// ─── Chat window ──────────────────────────────────────────────────────────────
function ChatWindow({ tripId, myId, myRole, myName, onClose }: { tripId: string; myId: string; myRole: "passenger"|"driver"; myName: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Record<string,unknown>[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const r = await api(`/messages/${tripId}`);
      if (r.success) setMessages(r.data ?? []);
    };
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [tripId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    setSending(true);
    const r = await api(`/messages/${tripId}`, "POST", { senderId: myId, senderRole: myRole, senderName: myName, text: input.trim() });
    if (r.success) { setMessages(prev => [...prev, r.data]); setInput(""); }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-60 flex flex-col" style={{ background: "#0F172A" }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        <MessageCircle className="w-5 h-5" style={{ color: TEAL }} />
        <span className="text-white font-bold flex-1">Trip Chat</span>
        <span className="text-[10px] text-white/40 bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">● LIVE</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && <p className="text-center text-white/30 text-sm mt-8">No messages yet. Say hello!</p>}
        {messages.map((m: Record<string,unknown>, i) => {
          const isMine = m.senderId === myId;
          return (
            <div key={i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[75%]">
                {!isMine && <p className="text-[10px] text-white/40 mb-0.5 font-semibold">{String(m.senderName)}</p>}
                <div className="px-3 py-2 rounded-2xl text-sm"
                  style={{ background: isMine ? P : "#1E293B", color: "#fff", borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px" }}>
                  {String(m.text)}
                </div>
                <p className="text-[9px] text-white/30 mt-0.5 text-right">
                  {new Date(String(m.timestamp)).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="px-4 py-3 flex gap-2 border-t border-white/10">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm text-white outline-none"
          style={{ background: "#1E293B", border: "1px solid rgba(255,255,255,.1)" }}
          placeholder="Type a message…" />
        <button onClick={send} disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40"
          style={{ background: P }}>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── In-app call UI ───────────────────────────────────────────────────────────
function CallView({ tripId, callerName, receiverName, myId, myRole, onEnd }: { tripId: string; callerName: string; receiverName: string; myId: string; myRole: "passenger"|"driver"; onEnd: () => void }) {
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);

  useEffect(() => {
    api(`/calls/${tripId}`, "POST", { callerId: myId, callerRole: myRole, receiverId: "other" });
    const iv = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const mins = Math.floor(secs / 60);
  const ss   = secs % 60;

  return (
    <div className="fixed inset-0 z-60 flex flex-col items-center justify-center text-white"
      style={{ background: "linear-gradient(135deg,#0F172A,#1E293B)" }}>
      <div className="flex flex-col items-center gap-6 w-full max-w-sm px-6">
        <div className="w-24 h-24 rounded-full flex items-center justify-center text-5xl"
          style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
          {myRole === "passenger" ? "🚗" : "👤"}
        </div>
        <div className="text-center">
          <p className="text-white/50 text-sm mb-1">Connected to</p>
          <p className="text-2xl font-black">{receiverName}</p>
          <p className="text-white/50 text-sm mt-1 font-mono">
            {String(mins).padStart(2,"0")}:{String(ss).padStart(2,"0")}
          </p>
        </div>
        <p className="text-[10px] text-white/30 text-center">🔒 Call masked via VMS secure relay · Number not shared</p>
        <div className="flex items-center gap-6 mt-4">
          <button onClick={() => setMuted(m => !m)} className="flex flex-col items-center gap-1.5">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? "bg-red-500" : "bg-white/15"}`}>
              {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </div>
            <span className="text-[10px] text-white/50">{muted ? "Unmute" : "Mute"}</span>
          </button>
          <button onClick={onEnd}
            className="flex flex-col items-center gap-1.5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500 shadow-xl">
              <PhoneOff className="w-7 h-7" />
            </div>
            <span className="text-[10px] text-white/50">End call</span>
          </button>
          <button onClick={() => setSpeaker(s => !s)} className="flex flex-col items-center gap-1.5">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${speaker ? "bg-white/15" : "bg-yellow-500/30"}`}>
              <Volume2 className="w-6 h-6" />
            </div>
            <span className="text-[10px] text-white/50">Speaker</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Star rating component ────────────────────────────────────────────────────
function StarRating({ value, onChange, size = 32 }: { value: number; onChange: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(s => (
        <button key={s} onClick={() => onChange(s)} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}>
          <Star style={{ width: size, height: size }} fill={(hover || value) >= s ? "#F5A623" : "transparent"} stroke="#F5A623" />
        </button>
      ))}
    </div>
  );
}

// ─── PASSENGER APP ────────────────────────────────────────────────────────────
function PassengerApp({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<PassengerScreen>("home");
  const [pickup, setPickup] = useState(CAPE_TOWNS[0]);
  const [dest, setDest] = useState<typeof CAPE_TOWNS[0] | null>(null);
  const [vehicleType, setVehicleType] = useState("standard");
  const [estimates, setEstimates] = useState<Record<string,unknown>[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [promoResult, setPromoResult] = useState<Record<string,unknown> | null>(null);
  const [currentTrip, setCurrentTrip] = useState<Record<string,unknown> | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [history, setHistory] = useState<Record<string,unknown>[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [medicalNote, setMedicalNote] = useState("");

  useEffect(() => {
    if (dest && screen === "booking") {
      api(`/estimate`, "POST", { pickupLat: pickup.lat, pickupLng: pickup.lng, destinationLat: dest.lat, destinationLng: dest.lng })
        .then(r => { if (r.success) setEstimates(r.data ?? []); });
    }
  }, [dest, pickup]);

  // Poll trip status
  useEffect(() => {
    if (!currentTrip || (currentTrip.status === "completed" || currentTrip.status === "cancelled")) return;
    const iv = setInterval(async () => {
      const r = await api(`/trips/${currentTrip.id}`);
      if (r.success) setCurrentTrip(r.data);
    }, 4000);
    return () => clearInterval(iv);
  }, [currentTrip?.id, currentTrip?.status]);

  const requestRide = async () => {
    if (!dest) return;
    setLoading(true);
    const r = await api("/request", "POST", {
      passengerId: "pax-001", passengerName: "Nomsa Zulu", passengerPhone: "+27 82 334 7821",
      vehicleType, pickupAddress: pickup.label, pickupLat: pickup.lat, pickupLng: pickup.lng,
      destinationAddress: dest.label, destinationLat: dest.lat, destinationLng: dest.lng,
      paymentMethod, promoCode: promoCode || undefined, medicalNote,
    });
    setLoading(false);
    if (r.success) { setCurrentTrip(r.data); setScreen("matching"); }
  };

  const cancelTrip = async () => {
    if (!currentTrip) return;
    await api(`/trips/${currentTrip.id}/status`, "PATCH", { status: "cancelled", cancelReason: "Passenger cancelled" });
    setCurrentTrip(null); setScreen("home");
  };

  const submitRating = async () => {
    if (!currentTrip || !rating) return;
    await api(`/trips/${currentTrip.id}/rate`, "POST", { raterRole: "passenger", rating, review });
    setCurrentTrip(null); setScreen("home"); setRating(0); setReview("");
  };

  const loadHistory = async () => {
    const r = await api("/trips?passengerId=pax-001&limit=20");
    if (r.success) setHistory(r.data ?? []);
    setScreen("history");
  };

  const tripStatus = currentTrip?.status as string | undefined;
  const selectedEst = estimates.find((e: Record<string,unknown>) => e.vehicleType === vehicleType) as Record<string,number> | undefined;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black" style={{ background: P }}>N</div>
          <div>
            <p className="text-xs font-black text-gray-900">Nomsa Zulu</p>
            <div className="flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-yellow-400 stroke-yellow-400" /><span className="text-[9px] text-gray-500">4.8</span></div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadHistory} className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: P + "15", color: P }}>History</button>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* HOME */}
      {screen === "home" && (
        <div className="flex-1 flex flex-col">
          <MapView pickup={pickup.label} />
          <div className="p-4 space-y-3 flex-shrink-0">
            <button onClick={() => setScreen("booking")} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-dashed text-left" style={{ borderColor: P + "40", background: P + "08" }}>
              <Search className="w-5 h-5 flex-shrink-0" style={{ color: P }} />
              <div>
                <p className="text-xs text-gray-500">Where to?</p>
                <p className="text-sm font-bold text-gray-800">Enter destination</p>
              </div>
            </button>
            <div className="grid grid-cols-2 gap-2">
              {["Home", "Work", "Airport", "Hospital"].map(p => (
                <button key={p} onClick={() => { setDest(CAPE_TOWNS.find(c => c.label.includes(p === "Airport" ? "Airport" : p === "Hospital" ? "Hospital" : p)) || CAPE_TOWNS[5]); setScreen("booking"); }}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:border-purple-300 hover:bg-purple-50 transition-all">
                  <span>{p === "Home" ? "🏠" : p === "Work" ? "💼" : p === "Airport" ? "✈️" : "🏥"}</span>{p}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BOOKING */}
      {screen === "booking" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            <h2 className="text-base font-black text-gray-900">Book a Ride</h2>
            {/* Pickup */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Pickup</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400"
                value={pickup.label} onChange={e => setPickup(CAPE_TOWNS.find(c => c.label === e.target.value) ?? pickup)}>
                {CAPE_TOWNS.map(c => <option key={c.label}>{c.label}</option>)}
              </select>
            </div>
            {/* Destination */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Destination *</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400"
                value={dest?.label ?? ""} onChange={e => setDest(CAPE_TOWNS.find(c => c.label === e.target.value) ?? null)}>
                <option value="">Choose destination…</option>
                {CAPE_TOWNS.map(c => <option key={c.label}>{c.label}</option>)}
              </select>
            </div>
            {/* Vehicle type */}
            {dest && (
              <>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-2">Select vehicle type</label>
                  <div className="space-y-2">
                    {VEHICLE_TYPES.map(v => {
                      const est = estimates.find(e => e.vehicleType === v.id) as Record<string,number> | undefined;
                      return (
                        <button key={v.id} onClick={() => setVehicleType(v.id)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left"
                          style={{ borderColor: vehicleType === v.id ? P : "#E5E7EB", background: vehicleType === v.id ? P + "08" : "#fff" }}>
                          <span className="text-2xl">{v.emoji}</span>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900">{v.label}</p>
                            <p className="text-[10px] text-gray-500">{v.sub}{est ? ` · ${est.etaMinutes} min away` : ""}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-gray-900">{est ? fmt(est.estimatedFare) : "…"}</p>
                            <p className="text-[10px] text-gray-400">{est ? `${est.distanceKm}km` : ""}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Medical note */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Medical / accessibility note (optional)</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" placeholder="e.g. Wheelchair user, oxygen tank" value={medicalNote} onChange={e => setMedicalNote(e.target.value)} />
                </div>
                {/* Payment */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Payment method</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[{id:"card",label:"Card",icon:"💳"},{id:"cash",label:"Cash",icon:"💵"},{id:"wallet",label:"Wallet",icon:"👛"},{id:"mobile_money",label:"Mobile",icon:"📱"}].map(pm => (
                      <button key={pm.id} onClick={() => setPaymentMethod(pm.id)}
                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all text-xs"
                        style={{ borderColor: paymentMethod === pm.id ? P : "#E5E7EB", background: paymentMethod === pm.id ? P + "08" : "#fff" }}>
                        <span className="text-xl">{pm.icon}</span>{pm.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Promo */}
                <div className="flex gap-2">
                  <input className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" placeholder="Promo code (e.g. VINK10)" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} />
                  <button onClick={async () => { const r = await api("/promo/validate", "POST", { code: promoCode, fare: selectedEst?.estimatedFare ?? 100 }); if (r.success) setPromoResult(r.data); }} className="px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ background: P }}>Apply</button>
                </div>
                {promoResult && <div className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl">✓ Promo applied! Save {fmt(Number((promoResult as Record<string,number>).discountAmount))} → New fare: {fmt(Number((promoResult as Record<string,number>).newFare))}</div>}
                <button onClick={requestRide} disabled={loading || !dest}
                  className="w-full py-4 rounded-2xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                  {loading ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Requesting…</> : "Request Ride"}
                </button>
              </>
            )}
            <button onClick={() => setScreen("home")} className="w-full py-2 text-sm font-semibold text-gray-500 hover:text-gray-800">← Back</button>
          </div>
        </div>
      )}

      {/* MATCHING / TRACKING */}
      {(screen === "matching" || screen === "tracking") && currentTrip && (
        <div className="flex-1 flex flex-col">
          <MapView pickup={String(currentTrip.pickupAddress)} dest={String(currentTrip.destinationAddress)} driverLat={Number(currentTrip.driverLat ?? -33.93)} stage={tripStatus} />
          <div className="p-4 space-y-3 flex-shrink-0">
            {tripStatus === "assigned" || tripStatus === "driver_enroute" || tripStatus === "arrived" ? (
              <>
                <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: P + "12" }}>
                  <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center font-black text-purple-800">
                    {String(currentTrip.driverName ?? "D")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{String(currentTrip.driverName)}</p>
                    <p className="text-xs text-gray-500">{String(currentTrip.driverPlate)} · ⭐ 4.9</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowChat(true)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: TEAL }}><MessageCircle className="w-4 h-4 text-white" /></button>
                    <button onClick={() => setShowCall(true)} className="w-9 h-9 rounded-full flex items-center justify-center bg-green-500"><PhoneCall className="w-4 h-4 text-white" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600 px-1">
                  <span>{STATUS_LABELS[tripStatus]}</span>
                  <span className="font-bold" style={{ color: P }}>{fmt(Number(currentTrip.estimatedFare))}</span>
                </div>
                <button onClick={cancelTrip} className="w-full py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-all">Cancel Ride</button>
              </>
            ) : tripStatus === "in_progress" ? (
              <>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-800">🚗 Trip in progress</p>
                  <p className="text-xs text-gray-500 mt-0.5">Sit back and relax</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowChat(true)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5" style={{ background: TEAL }}>
                    <MessageCircle className="w-4 h-4" />Chat
                  </button>
                  <button onClick={() => setShowCall(true)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 bg-green-500">
                    <Phone className="w-4 h-4" />Call Driver
                  </button>
                </div>
              </>
            ) : tripStatus === "completed" ? (
              <>
                <p className="text-center font-black text-gray-900">Trip Complete! ✓</p>
                <p className="text-center text-2xl font-black" style={{ color: P }}>{fmt(Number(currentTrip.finalFare ?? currentTrip.estimatedFare))}</p>
                <button onClick={() => setScreen("rate")} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: P }}>Rate your driver</button>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-10 h-10 border-2 border-purple-200 border-t-purple-700 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-800">Finding your driver…</p>
                <p className="text-xs text-gray-400 mt-1">Usually under 5 seconds</p>
                <button onClick={cancelTrip} className="mt-3 text-xs text-gray-400 hover:text-gray-700 underline">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RATE */}
      {screen === "rate" && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
          <div className="text-4xl">⭐</div>
          <h2 className="text-xl font-black text-gray-900 text-center">How was your trip?</h2>
          <p className="text-sm text-gray-500 text-center">Rate your driver {String(currentTrip?.driverName ?? "")}</p>
          <StarRating value={rating} onChange={setRating} size={40} />
          <textarea className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-400 resize-none" rows={3} placeholder="Leave a review (optional)" value={review} onChange={e => setReview(e.target.value)} />
          <button onClick={submitRating} disabled={!rating} className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: P }}>Submit Rating</button>
          <button onClick={() => { setCurrentTrip(null); setScreen("home"); }} className="text-xs text-gray-400 underline">Skip</button>
        </div>
      )}

      {/* HISTORY */}
      {screen === "history" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setScreen("home")} className="text-gray-400 hover:text-gray-700"><ChevronRight className="w-5 h-5 rotate-180" /></button>
              <h2 className="text-base font-black text-gray-900">Trip History</h2>
            </div>
            <div className="space-y-3">
              {history.map((t: Record<string,unknown>, i) => (
                <div key={i} className="p-4 rounded-2xl border border-gray-100 bg-white hover:shadow-sm transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs text-gray-500">{new Date(String(t.requestedAt)).toLocaleDateString("en-ZA")}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate max-w-[200px]">{String(t.destinationAddress)}</p>
                    </div>
                    <span className="text-sm font-black" style={{ color: P }}>{fmt(Number(t.finalFare ?? t.estimatedFare))}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span style={{ color: STATUS_COLORS[String(t.status)] ?? "#888", fontWeight: 600 }}>{String(t.status).replace("_"," ")}</span>
                    <span>·</span><span>{String(t.vehicleType)}</span>
                    {t.passengerRating && <span>· ⭐ {String(t.passengerRating)}</span>}
                  </div>
                </div>
              ))}
              {history.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No trips yet</p>}
            </div>
          </div>
        </div>
      )}

      {showChat && currentTrip && <ChatWindow tripId={String(currentTrip.id)} myId="pax-001" myRole="passenger" myName="Nomsa" onClose={() => setShowChat(false)} />}
      {showCall && currentTrip && <CallView tripId={String(currentTrip.id)} callerName="Nomsa Zulu" receiverName={String(currentTrip.driverName ?? "Driver")} myId="pax-001" myRole="passenger" onEnd={() => setShowCall(false)} />}
    </div>
  );
}

// ─── DRIVER APP ───────────────────────────────────────────────────────────────
function DriverApp({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<DriverScreen>("status");
  const [online, setOnline] = useState(true);
  const [currentTrip, setCurrentTrip] = useState<Record<string,unknown> | null>(null);
  const [countdown, setCountdown] = useState(15);
  const [showChat, setShowChat] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [history, setHistory] = useState<Record<string,unknown>[]>([]);
  const [driverStats, setDriverStats] = useState<Record<string,unknown>>({ today: 847.50, week: 4238, month: 16890, totalTrips: 1847, rating: 4.9 });

  // Simulate incoming request
  useEffect(() => {
    if (!online || currentTrip || screen !== "status") return;
    const iv = setInterval(async () => {
      const r = await api("/trips?status=assigned&limit=5");
      if (r.success && (r.data as Record<string,unknown>[]).length > 0) {
        setCurrentTrip(r.data[0]);
        setScreen("request");
        setCountdown(15);
      }
    }, 8000);
    return () => clearInterval(iv);
  }, [online, currentTrip, screen]);

  useEffect(() => {
    if (screen !== "request") return;
    if (countdown <= 0) { setCurrentTrip(null); setScreen("status"); return; }
    const iv = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(iv);
  }, [screen, countdown]);

  const acceptTrip = async () => {
    if (!currentTrip) return;
    await api(`/trips/${currentTrip.id}/status`, "PATCH", { status: "driver_enroute" });
    setScreen("navigate");
  };

  const declineTrip = () => { setCurrentTrip(null); setScreen("status"); };

  const updateStatus = async (status: string) => {
    if (!currentTrip) return;
    await api(`/trips/${currentTrip.id}/status`, "PATCH", { status });
    const r = await api(`/trips/${currentTrip.id}`);
    if (r.success) setCurrentTrip(r.data);
    if (status === "completed") { setScreen("status"); setCurrentTrip(null); }
  };

  const loadHistory = async () => {
    const r = await api("/trips?driverId=drv-101&limit=20");
    if (r.success) setHistory(r.data ?? []);
    setScreen("history");
  };

  const tripStatus = currentTrip?.status as string | undefined;

  return (
    <div className="flex flex-col h-full" style={{ background: "#0F172A" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black" style={{ background: TEAL }}>S</div>
          <div>
            <p className="text-xs font-black text-white">Sipho Dlamini</p>
            <div className="flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-yellow-400 stroke-yellow-400" /><span className="text-[9px] text-white/50">4.9 · CA 847-891</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOnline(o => !o)} className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${online ? "bg-green-500 text-white" : "bg-white/10 text-white/60"}`}>
            {online ? "● ONLINE" : "○ OFFLINE"}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-white/40"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* STATUS */}
      {screen === "status" && (
        <div className="flex-1 flex flex-col">
          <MapView stage={undefined} />
          <div className="p-4 space-y-3 flex-shrink-0">
            {online ? (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: GREEN + "15" }}>
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-sm font-semibold text-green-400">Online — waiting for ride requests…</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-white/50 text-sm">You are offline</p>
                <button onClick={() => setOnline(true)} className="mt-3 px-6 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: TEAL }}>Go Online</button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[["Today", `R${Number(driverStats.today).toFixed(0)}`], ["This week", `R${Number(driverStats.week).toLocaleString()}`], ["Trips", String(driverStats.totalTrips)]].map(([l,v]) => (
                <div key={l} className="p-3 rounded-xl text-center" style={{ background: "#1E293B" }}>
                  <p className="text-[10px] text-white/40">{l}</p>
                  <p className="text-base font-black text-white mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            <button onClick={loadHistory} className="w-full py-2.5 text-sm font-semibold rounded-xl" style={{ background: "#1E293B", color: "rgba(255,255,255,0.7)" }}>View Trip History</button>
          </div>
        </div>
      )}

      {/* INCOMING REQUEST */}
      {screen === "request" && currentTrip && (
        <div className="flex-1 flex flex-col p-4 gap-4">
          <div className="relative w-full h-16 rounded-2xl overflow-hidden" style={{ background: "#1E293B" }}>
            <div className="absolute inset-y-0 left-0 transition-all duration-1000 rounded-2xl" style={{ width: `${(countdown/15)*100}%`, background: countdown > 8 ? GREEN : "#F59E0B", opacity: 0.4 }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white font-black text-2xl">{countdown}s</p>
            </div>
          </div>
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "#1E293B" }}>
            <p className="text-white font-black">New Ride Request</p>
            <div className="space-y-2">
              <div className="flex items-start gap-2"><div className="w-3 h-3 rounded-full bg-green-400 mt-1 flex-shrink-0" /><div><p className="text-white/60 text-[10px]">PICKUP</p><p className="text-white text-sm font-semibold">{String(currentTrip.pickupAddress)}</p></div></div>
              <div className="flex items-start gap-2"><div className="w-3 h-3 rounded-full bg-red-400 mt-1 flex-shrink-0" /><div><p className="text-white/60 text-[10px]">DESTINATION</p><p className="text-white text-sm font-semibold">{String(currentTrip.destinationAddress)}</p></div></div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">{Number(currentTrip.distanceKm).toFixed(1)} km · ~{currentTrip.durationMin} min</span>
              <span className="font-black" style={{ color: GOLD }}>{fmt(Number(currentTrip.estimatedFare))}</span>
            </div>
            {currentTrip.medicalNote && <div className="text-xs font-semibold text-amber-400 bg-amber-400/10 px-3 py-2 rounded-lg">⚠ {String(currentTrip.medicalNote)}</div>}
          </div>
          <div className="flex gap-3">
            <button onClick={declineTrip} className="flex-1 py-3.5 rounded-2xl text-sm font-bold border border-white/20 text-white/70 hover:bg-white/5">Decline</button>
            <button onClick={acceptTrip} className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background: TEAL }}>Accept</button>
          </div>
        </div>
      )}

      {/* NAVIGATE */}
      {screen === "navigate" && currentTrip && (
        <div className="flex-1 flex flex-col">
          <MapView pickup={String(currentTrip.pickupAddress)} dest={String(currentTrip.destinationAddress)} stage={tripStatus} />
          <div className="p-4 space-y-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white" style={{ background: P }}>
                {String(currentTrip.passengerName ?? "P")[0]}
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">{String(currentTrip.passengerName)}</p>
                <p className="text-white/40 text-xs">{STATUS_LABELS[tripStatus ?? "assigned"]}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowChat(true)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: TEAL }}><MessageCircle className="w-4 h-4 text-white" /></button>
                <button onClick={() => setShowCall(true)} className="w-9 h-9 rounded-full flex items-center justify-center bg-green-500"><PhoneCall className="w-4 h-4 text-white" /></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { status: "arrived", label: "I've arrived", color: TEAL },
                { status: "in_progress", label: "Start trip", color: P },
                { status: "completed", label: "Complete trip", color: GREEN },
              ].map(btn => (
                <button key={btn.status} onClick={() => updateStatus(btn.status)}
                  disabled={tripStatus === "completed" || (btn.status === "arrived" && tripStatus === "arrived") || (btn.status === "in_progress" && (tripStatus === "in_progress" || tripStatus === "completed")) || (btn.status === "completed" && tripStatus !== "in_progress")}
                  className="py-2.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-30"
                  style={{ background: btn.color }}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {screen === "history" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setScreen("status")} className="text-white/40 hover:text-white"><ChevronRight className="w-5 h-5 rotate-180" /></button>
              <h2 className="text-base font-black text-white">Trip History</h2>
            </div>
            <div className="space-y-2">
              {history.map((t, i) => (
                <div key={i} className="p-3 rounded-xl" style={{ background: "#1E293B" }}>
                  <div className="flex justify-between">
                    <div>
                      <p className="text-xs text-white/40">{new Date(String(t.requestedAt)).toLocaleDateString("en-ZA")}</p>
                      <p className="text-sm text-white truncate max-w-[180px]">{String(t.destinationAddress)}</p>
                    </div>
                    <p className="text-sm font-black" style={{ color: GOLD }}>{fmt(Number(t.finalFare ?? t.estimatedFare))}</p>
                  </div>
                </div>
              ))}
              {history.length === 0 && <p className="text-white/30 text-sm text-center py-8">No trips found</p>}
            </div>
          </div>
        </div>
      )}

      {showChat && currentTrip && <ChatWindow tripId={String(currentTrip.id)} myId="drv-101" myRole="driver" myName="Sipho" onClose={() => setShowChat(false)} />}
      {showCall && currentTrip && <CallView tripId={String(currentTrip.id)} callerName="Sipho Dlamini" receiverName={String(currentTrip.passengerName ?? "Passenger")} myId="drv-101" myRole="driver" onEnd={() => setShowCall(false)} />}
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<AdminScreen>("overview");
  const [stats, setStats] = useState<Record<string,unknown>>({});
  const [trips, setTrips] = useState<Record<string,unknown>[]>([]);
  const [drivers, setDrivers] = useState<Record<string,unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [statsR, tripsR, driversR] = await Promise.all([api("/admin/stats"), api("/trips?limit=20"), api("/drivers")]);
      if (statsR.success) setStats(statsR.data);
      if (tripsR.success) setTrips(tripsR.data ?? []);
      if (driversR.success) setDrivers(driversR.data ?? []);
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" style={{ color: P }} />
          <p className="text-sm font-black text-gray-900">Ride Admin Dashboard</p>
          {loading && <div className="w-3 h-3 border border-gray-300 border-t-purple-700 rounded-full animate-spin" />}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
      </div>
      {/* Nav */}
      <div className="flex bg-white border-b border-gray-100 px-3 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
        {[{id:"overview",icon:<BarChart3 className="w-3.5 h-3.5"/>},{id:"trips",icon:<Car className="w-3.5 h-3.5"/>},{id:"drivers",icon:<Users className="w-3.5 h-3.5"/>},{id:"pricing",icon:<TrendingUp className="w-3.5 h-3.5"/>}].map(n => (
          <button key={n.id} onClick={() => setScreen(n.id as AdminScreen)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold flex-shrink-0 transition-all capitalize"
            style={{ borderBottom: screen === n.id ? `2px solid ${P}` : "2px solid transparent", color: screen === n.id ? P : "#6B7280" }}>
            {n.icon}{n.id}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* OVERVIEW */}
        {screen === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Trips",    value: String(stats.totalTrips ?? 0),    color: P },
                { label: "Active Now",     value: String(stats.activeTrips ?? 0),   color: TEAL },
                { label: "Online Drivers", value: String(stats.onlineDrivers ?? 0), color: GREEN },
                { label: "Revenue Today",  value: `R${Number(stats.totalRevenue ?? 0).toFixed(0)}`, color: GOLD },
              ].map((k, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
                  <p className="text-2xl font-black" style={{ color: k.color }}>{k.value}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{k.label}</p>
                </div>
              ))}
            </div>
            {/* Recent trips */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-black text-gray-900">Recent Trips</p>
                <button onClick={() => setScreen("trips")} className="text-xs font-semibold" style={{ color: P }}>View all →</button>
              </div>
              <div className="divide-y divide-gray-50">
                {trips.slice(0,5).map((t, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: STATUS_COLORS[String(t.status)] ?? "#888" }}>
                      {String(t.vehicleType ?? "")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{String(t.destinationAddress)}</p>
                      <p className="text-xs text-gray-400">{String(t.passengerName)} · {String(t.status).replace("_"," ")}</p>
                    </div>
                    <p className="text-sm font-black flex-shrink-0" style={{ color: P }}>{fmt(Number(t.finalFare ?? t.estimatedFare))}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TRIPS */}
        {screen === "trips" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-black text-gray-900">All Trips ({trips.length})</p>
            </div>
            <div className="divide-y divide-gray-50">
              {trips.map((t, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: STATUS_COLORS[String(t.status)] ?? "#888" }}>{String(t.status).replace("_"," ")}</span>
                        <span className="text-xs text-gray-400">{String(t.vehicleType)}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 mt-1 truncate">{String(t.pickupAddress)} → {String(t.destinationAddress)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{String(t.passengerName)} · {String(t.driverName ?? "Unassigned")}</p>
                    </div>
                    <p className="text-sm font-black flex-shrink-0" style={{ color: P }}>{fmt(Number(t.finalFare ?? t.estimatedFare))}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DRIVERS */}
        {screen === "drivers" && (
          <div className="space-y-3">
            {drivers.map((d, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black" style={{ background: TEAL }}>
                    {String(d.name ?? "D")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-gray-900">{String(d.name)}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.status === "online" ? "bg-green-50 text-green-700" : d.status === "on_trip" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                        {String(d.status).replace("_"," ")}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{String(d.vehicleMake)} {String(d.vehicleModel)} · {String(d.vehiclePlate)}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                      <span>⭐ {String(d.rating)}</span>
                      <span>· {String(d.totalTrips)} trips</span>
                      <span>· {String(d.vehicleType)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PRICING */}
        {screen === "pricing" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-black text-gray-900 mb-4">Fare Structure</p>
              <div className="space-y-3">
                {VEHICLE_TYPES.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2"><span className="text-lg">{v.emoji}</span><p className="text-sm font-semibold text-gray-800">{v.label}</p></div>
                    <p className="text-xs text-gray-500">Base R{v.id === "standard" ? "7" : v.id === "premium" ? "12" : v.id === "xl" ? "15" : "10"} + R{v.id === "standard" ? "3.50" : v.id === "premium" ? "6.00" : v.id === "xl" ? "7.00" : "4.50"}/km</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-black text-gray-900 mb-3">Active Promo Codes</p>
              {[{code:"VINK10",disc:"10% off",min:"R50"},{code:"FIRST50",disc:"R50 off",min:"R60"},{code:"SAFE20",disc:"R20 off",min:"R80"}].map(p => (
                <div key={p.code} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-bold text-gray-900 font-mono">{p.code}</p>
                    <p className="text-xs text-gray-400">Min fare {p.min}</p>
                  </div>
                  <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{p.disc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function RideHailingSystem({ isOpen, onClose }: Props) {
  const [role, setRole] = useState<AppRole>("choose");

  if (!isOpen) return null;

  if (role === "choose") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "linear-gradient(135deg,#0F172A,#1E293B)" }}>
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-white font-black text-lg">Vink Ride</p>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <div className="text-center mb-4">
            <span className="text-6xl">🚗</span>
            <h1 className="text-3xl font-black text-white mt-3">Vink Ride</h1>
            <p className="text-white/50 text-sm mt-2 max-w-xs">Safe, reliable transport across South Africa. Request a ride, earn as a driver, or manage your fleet.</p>
          </div>
          <div className="w-full max-w-sm space-y-3">
            {[
              { id: "passenger", emoji: "👤", title: "I'm a Passenger", sub: "Book rides, track driver, chat & pay", color: P },
              { id: "driver",    emoji: "🚗", title: "I'm a Driver",    sub: "Accept rides, earn & manage trips", color: TEAL },
              { id: "admin",     emoji: "🛡️", title: "Admin / Operator", sub: "Manage fleet, drivers & analytics", color: "#F59E0B" },
            ].map(r => (
              <button key={r.id} onClick={() => setRole(r.id as AppRole)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all text-left">
                <span className="text-3xl">{r.emoji}</span>
                <div>
                  <p className="text-white font-bold">{r.title}</p>
                  <p className="text-white/40 text-xs mt-0.5">{r.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 ml-auto" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {role === "passenger" && <PassengerApp onClose={() => setRole("choose")} />}
      {role === "driver"    && <DriverApp    onClose={() => setRole("choose")} />}
      {role === "admin"     && <AdminDashboard onClose={() => setRole("choose")} />}
    </div>
  );
}
