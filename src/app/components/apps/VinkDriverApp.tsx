import { useState, useEffect } from "react";
import { Navigation, DollarSign, User, Radio, Phone, MessageCircle, AlertOctagon, CheckCircle, ChevronRight, TrendingUp, Users, Plus, X } from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";
import { projectId as supabaseProjectId } from "../../../../utils/supabase/info";

type Screen = "status" | "request" | "navigation" | "earnings" | "passengers" | "profile";

const TEAL = "#14B8A6";
const DARK = "#0F172A";
const DARK2 = "#1E293B";

function StatusScreen({ online, setOnline }: { online: boolean; setOnline: (v: boolean) => void }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: DARK }}>
      {/* Header */}
      <div className="px-4 py-3 flex-shrink-0 flex items-center justify-between" style={{ background: DARK2 }}>
        <p className="text-white font-bold text-base">Driver Status</p>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${online ? "bg-teal-400 animate-pulse" : "bg-gray-500"}`} />
          <span className="text-xs font-semibold" style={{ color: online ? TEAL : "#6B7280" }}>
            {online ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Big toggle */}
        <div className="flex flex-col items-center py-6">
          <button
            onClick={() => setOnline(!online)}
            className="w-28 h-28 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-300 shadow-2xl"
            style={{
              background: online ? `radial-gradient(circle, ${TEAL}, #0D9488)` : "#1E293B",
              border: `3px solid ${online ? TEAL : "#374151"}`,
              boxShadow: online ? `0 0 30px ${TEAL}66` : "none",
            }}
          >
            <div className="text-center">
              <div className={`w-6 h-6 rounded-full mx-auto mb-1 ${online ? "bg-white" : "bg-gray-500"}`} />
              <span style={{ color: online ? "#fff" : "#6B7280", fontSize: 13 }}>
                {online ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
          </button>
          {online && (
            <div className="mt-3 text-center">
              <p className="text-sm font-medium animate-pulse" style={{ color: TEAL }}>Waiting for requests...</p>
              <div className="flex justify-center gap-1 mt-2">
                {[0,1,2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: TEAL,
                      animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Vehicle info */}
        <div className="rounded-2xl p-4" style={{ background: DARK2 }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${TEAL}22` }}>
              <span className="text-xl">🚐</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm">Toyota HiAce</p>
              <p className="text-gray-400 text-xs">CA 847-891 · White · 2019</p>
            </div>
            <div className="ml-auto">
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(s => (
                  <svg key={s} viewBox="0 0 10 10" className="w-3 h-3" fill={s <= 4 ? "#F59E0B" : "#374151"}>
                    <polygon points="5,1 6.2,3.8 9,4.2 7,6.2 7.6,9 5,7.5 2.4,9 3,6.2 1,4.2 3.8,3.8"/>
                  </svg>
                ))}
                <span className="text-gray-300 text-[10px] ml-0.5">4.8</span>
              </div>
            </div>
          </div>
        </div>

        {/* Today's stats */}
        <div>
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Today's Summary</p>
          <div className="grid grid-cols-3 gap-2">
            {[["12","Rides",TEAL],["R847","Earnings","#F59E0B"],["6.5h","Online","#3B82F6"]].map(([v,l,c]) => (
              <div key={l} className="rounded-xl p-3 text-center" style={{ background: DARK2 }}>
                <p className="font-bold text-sm" style={{ color: c }}>{v}</p>
                <p className="text-gray-500 text-[10px]">{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Map placeholder */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1A2840", height: 120 }}>
          <svg className="w-full h-full opacity-30" preserveAspectRatio="none">
            <defs>
              <pattern id="dgrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke={TEAL} strokeWidth="0.4"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dgrid)"/>
            <line x1="0" y1="50%" x2="100%" y2="45%" stroke="#2A4A6F" strokeWidth="5"/>
            <line x1="40%" y1="0" x2="45%" y2="100%" stroke="#2A4A6F" strokeWidth="4"/>
          </svg>
          {/* Current location pin */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ marginTop: -120 }}>
            <div className="relative">
              <div className="w-4 h-4 rounded-full border-2 border-white shadow-lg" style={{ background: TEAL }} />
              <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white" />
              <div
                className="absolute -inset-2 rounded-full animate-ping opacity-30"
                style={{ background: TEAL }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestScreen({ onAccept }: { onAccept: () => void }) {
  const [countdown, setCountdown] = useState(15);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const pct = (countdown / 15) * 100;
  const r = 22;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-col h-full" style={{ background: DARK }}>
      <div className="px-4 py-3 flex-shrink-0 flex items-center justify-between" style={{ background: DARK2 }}>
        <p className="text-white font-bold text-base">Incoming Request</p>
        {/* Countdown circle */}
        <div className="relative w-12 h-12">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r={r} fill="none" stroke="#374151" strokeWidth="3"/>
            <circle
              cx="26" cy="26" r={r} fill="none"
              stroke={countdown <= 5 ? "#EF4444" : TEAL}
              strokeWidth="3"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct / 100)}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center font-bold text-sm"
            style={{ color: countdown <= 5 ? "#EF4444" : TEAL }}
          >
            {countdown}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Passenger info */}
        <div className="rounded-2xl p-4" style={{ background: DARK2 }}>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base"
              style={{ background: `linear-gradient(135deg, ${TEAL}, #0D9488)`, color: "#fff" }}
            >
              NZ
            </div>
            <div>
              <p className="text-white font-bold text-sm">Nomsa Zulu</p>
              <div className="flex items-center gap-1 mt-0.5">
                {[1,2,3,4,5].map(s => (
                  <svg key={s} viewBox="0 0 10 10" className="w-3 h-3" fill={s <= 4 ? "#F59E0B" : "#374151"}>
                    <polygon points="5,1 6.2,3.8 9,4.2 7,6.2 7.6,9 5,7.5 2.4,9 3,6.2 1,4.2 3.8,3.8"/>
                  </svg>
                ))}
                <span className="text-gray-400 text-[10px]">4.9 · 23 trips</span>
              </div>
            </div>
            <div
              className="ml-auto px-2 py-1 rounded-full text-[9px] font-bold"
              style={{ background: `${TEAL}22`, color: TEAL }}
            >
              Standard
            </div>
          </div>
        </div>

        {/* Pickup/Dropoff */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: DARK2 }}>
          <div className="flex gap-3">
            <div className="flex flex-col items-center mt-1">
              <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: TEAL }} />
              <div className="w-0.5 h-8 bg-gray-600 my-0.5" />
              <div className="w-3 h-3 rounded-full" style={{ background: TEAL }} />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-gray-400 text-[10px]">PICKUP · 0.8km away</p>
                <p className="text-white text-xs font-medium">4 Buitenkant St, Cape Town CBD</p>
              </div>
              <div>
                <p className="text-gray-400 text-[10px]">DROP-OFF</p>
                <p className="text-white text-xs font-medium">Groote Schuur Hospital, Observatory</p>
              </div>
            </div>
          </div>
        </div>

        {/* Trip info */}
        <div className="grid grid-cols-3 gap-2">
          {[["4.2 km","Distance"],["R68.00","Est. Fare"],["3 min","ETA"]].map(([v,l]) => (
            <div key={l} className="rounded-xl p-3 text-center" style={{ background: DARK2 }}>
              <p className="text-white font-bold text-sm">{v}</p>
              <p className="text-gray-500 text-[10px]">{l}</p>
            </div>
          ))}
        </div>

        {/* Medical note */}
        <div
          className="rounded-xl p-3 flex gap-2"
          style={{ background: "#451A03", border: "1px solid #92400E" }}
        >
          <span className="text-lg">♿</span>
          <div>
            <p className="text-amber-400 text-[10px] font-bold">ACCESSIBILITY NOTE</p>
            <p className="text-amber-200 text-[11px]">Wheelchair user — accessible vehicle required</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pb-2">
          <button
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm border transition-colors"
            style={{ borderColor: "#374151", color: "#9CA3AF" }}
          >
            DECLINE
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${TEAL}, #0D9488)` }}
          >
            ACCEPT
          </button>
        </div>
      </div>
    </div>
  );
}

function NavigationScreen() {
  const [tripState, setTripState] = useState<"en_route"|"arrived"|"in_progress">("en_route");

  return (
    <div className="flex flex-col h-full" style={{ background: DARK }}>
      {/* Header */}
      <div className="px-4 py-3 flex-shrink-0" style={{ background: DARK2 }}>
        <p className="text-white font-bold text-sm">
          {tripState === "en_route" ? "En route to passenger" : tripState === "arrived" ? "Arrived at pickup" : "Drop-off in progress"}
        </p>
        <p className="text-xs mt-0.5" style={{ color: TEAL }}>
          {tripState === "en_route" ? "4 min · 2.1km remaining" : tripState === "arrived" ? "Waiting for Nomsa..." : "3.4km to destination"}
        </p>
      </div>

      {/* Map placeholder */}
      <div className="relative mx-3 mt-2 rounded-2xl overflow-hidden flex-1 max-h-52" style={{ background: "#1A2840" }}>
        <svg className="w-full h-full opacity-25" preserveAspectRatio="none">
          <defs>
            <pattern id="navgrid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke={TEAL} strokeWidth="0.4"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#navgrid)"/>
          <line x1="0" y1="55%" x2="100%" y2="45%" stroke="#2A4A6F" strokeWidth="5"/>
          <line x1="30%" y1="0" x2="40%" y2="100%" stroke="#2A4A6F" strokeWidth="4"/>
        </svg>
        {/* Route line */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 120" preserveAspectRatio="none">
          <polyline points="40,90 60,70 80,60 120,45 150,30" fill="none" stroke={TEAL} strokeWidth="3" strokeDasharray="6 3" opacity="0.8"/>
          {/* Driver pin */}
          <circle cx="40" cy="90" r="5" fill={TEAL} />
          {/* Passenger pin */}
          <circle cx="150" cy="30" r="5" fill="#F59E0B" />
        </svg>
      </div>

      {/* Passenger card */}
      <div className="mx-3 mt-2 rounded-2xl p-3" style={{ background: DARK2 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${TEAL}, #0D9488)` }}>
              NZ
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Nomsa Zulu</p>
              <p className="text-gray-400 text-[10px]">Toyota HiAce · CA 847-891</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${TEAL}22` }}>
              <Phone className="w-4 h-4" style={{ color: TEAL }} />
            </button>
            <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${TEAL}22` }}>
              <MessageCircle className="w-4 h-4" style={{ color: TEAL }} />
            </button>
            <button className="w-8 h-8 rounded-full flex items-center justify-center bg-red-900">
              <AlertOctagon className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "#334155" }}>
          <span className="text-gray-400 text-xs">Fare</span>
          <span className="font-bold text-sm text-white">R68.00</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-3 mt-2 mb-1 flex gap-2">
        {tripState === "en_route" && (
          <button
            onClick={() => setTripState("arrived")}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${TEAL}, #0D9488)` }}
          >
            Arrived at Pickup
          </button>
        )}
        {tripState === "arrived" && (
          <button
            onClick={() => setTripState("in_progress")}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${TEAL}, #0D9488)` }}
          >
            Start Trip
          </button>
        )}
        {tripState === "in_progress" && (
          <button
            onClick={() => setTripState("en_route")}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-green-600"
          >
            Complete Trip ✓
          </button>
        )}
        <button className="px-4 py-2.5 rounded-xl text-xs font-medium text-gray-400 border" style={{ borderColor: "#374151" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function EarningsScreen() {
  const bars = [45, 72, 38, 91, 62, 84, 55, 38];
  const hours = ["08","09","10","11","12","13","14","15"];

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: DARK }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: DARK2 }}>
        <p className="text-white font-bold text-base">Earnings</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {/* Hero */}
        <div className="rounded-2xl p-5 text-center shadow-xl" style={{ background: `linear-gradient(135deg, #0D2137, ${TEAL}99)` }}>
          <p className="text-gray-400 text-xs">Today's Earnings</p>
          <p className="text-4xl font-bold text-white mt-1">R847.50</p>
          <div className="flex justify-center gap-6 mt-4">
            <div className="text-center">
              <p className="text-white font-bold text-sm">R4,238</p>
              <p className="text-gray-400 text-[10px]">This Week</p>
            </div>
            <div className="w-px bg-white/20" />
            <div className="text-center">
              <p className="text-white font-bold text-sm">R16,890</p>
              <p className="text-gray-400 text-[10px]">This Month</p>
            </div>
          </div>
        </div>

        {/* Payout schedule */}
        <div className="rounded-2xl p-4" style={{ background: DARK2 }}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4" style={{ color: TEAL }} />
            <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Next Payout</p>
          </div>
          <p className="text-white font-bold text-sm">Friday · R4,238.00</p>
          <p className="text-gray-500 text-[10px] mt-0.5">Direct deposit to Vink account ****3421</p>
        </div>

        {/* Community contribution */}
        <div className="rounded-2xl p-4" style={{ background: "#052e16", border: "1px solid #166534" }}>
          <p className="text-green-400 text-[10px] font-bold uppercase tracking-wider">Community Contribution</p>
          <p className="text-green-200 text-xs mt-1">
            5% of your earnings (R211.93) goes to{" "}
            <span className="font-bold">Khayelitsha Neighbourhood Watch</span>
          </p>
        </div>

        {/* Hourly chart */}
        <div className="rounded-2xl p-4" style={{ background: DARK2 }}>
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-3">Hourly Activity</p>
          <div className="flex items-end gap-1.5 h-16">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: `${h}%`, background: `linear-gradient(to top, ${TEAL}, ${TEAL}66)` }}
                />
                <span className="text-gray-600 text-[8px]">{hours[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileScreen() {
  const docs = [
    ["Driver's License",       true],
    ["Vehicle Inspection",     true],
    ["First Aid Certificate",  true],
    ["Background Check",       true],
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: DARK }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: DARK2 }}>
        <p className="text-white font-bold text-base">Profile</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {/* Profile hero */}
        <div className="rounded-2xl p-5 text-center" style={{ background: `linear-gradient(135deg, ${DARK2}, #162032)` }}>
          <div
            className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-xl font-bold text-white border-2"
            style={{ background: `linear-gradient(135deg, ${TEAL}, #0D9488)`, borderColor: TEAL }}
          >
            SD
          </div>
          <p className="text-white font-bold text-base mt-2">Sipho Dlamini</p>
          <p className="text-gray-400 text-xs">License: WC-4821-B · Class C</p>
          <div className="flex items-center justify-center gap-1 mt-2">
            {[1,2,3,4,5].map(s => (
              <svg key={s} viewBox="0 0 10 10" className="w-3.5 h-3.5" fill={s <= 4 ? "#F59E0B" : "#374151"}>
                <polygon points="5,1 6.2,3.8 9,4.2 7,6.2 7.6,9 5,7.5 2.4,9 3,6.2 1,4.2 3.8,3.8"/>
              </svg>
            ))}
            <span className="text-gray-300 text-xs ml-1">4.8 / 5.0</span>
          </div>
        </div>

        {/* Documents */}
        <div className="rounded-2xl overflow-hidden" style={{ background: DARK2 }}>
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider px-4 pt-3 pb-1">Documents</p>
          {docs.map(([name, ok], i) => (
            <div key={name as string} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: "#334155" }}>
              <span className="text-gray-200 text-xs">{name as string}</span>
              <div className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-[10px] font-bold">Verified</span>
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          {[["🎧","Support"],["⚙️","Settings"],["🚪","Logout"]].map(([icon, label]) => (
            <button
              key={label as string}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: DARK2 }}
            >
              <span>{icon as string}</span>
              <span className="text-gray-200 text-sm flex-1 text-left">{label as string}</span>
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Passenger list + cash entry screen ──────────────────────────────────────
function PassengersScreen() {
  // Supabase edge function URL for financial data
  const pid = supabaseProjectId;
  const API = pid
    ? `https://${pid}.supabase.co/functions/v1/make-server-3f39932e/financial`
    : ((import.meta as { env: Record<string,string> }).env?.VITE_API_URL ?? "http://localhost:3001") + "/api/financial";
  const [trips, setTrips] = useState<Record<string,unknown>[]>([
    { passengerName: "Nomsa Zulu",      passengerCard: "**** 8842", fareAmount: 14.00, paymentMethod: "card",  tapTimestamp: new Date(Date.now()-3600000).toISOString() },
    { passengerName: "Sipho Khumalo",   passengerCard: "**** 3317", fareAmount: 14.00, paymentMethod: "card",  tapTimestamp: new Date(Date.now()-7200000).toISOString() },
    { passengerName: null,              passengerCard: null,         fareAmount: 14.00, paymentMethod: "cash",  tapTimestamp: new Date(Date.now()-9000000).toISOString() },
    { passengerName: "Priya Naidoo",    passengerCard: "**** 7751", fareAmount: 14.00, paymentMethod: "card",  tapTimestamp: new Date(Date.now()-10800000).toISOString() },
    { passengerName: "James van Berg",  passengerCard: "**** 5523", fareAmount: 14.00, paymentMethod: "card",  tapTimestamp: new Date(Date.now()-12000000).toISOString() },
    { passengerName: null,              passengerCard: null,         fareAmount: 14.00, paymentMethod: "cash",  tapTimestamp: new Date(Date.now()-14400000).toISOString() },
  ]);
  const [showCash, setShowCash] = useState(false);
  const [cashAmt, setCashAmt] = useState("14");
  const [cashName, setCashName] = useState("");
  const [cashAdded, setCashAdded] = useState(false);

  const cardTotal = trips.filter(t => t.paymentMethod === "card").reduce((s,t) => s + Number(t.fareAmount), 0);
  const cashTotal = trips.filter(t => t.paymentMethod === "cash").reduce((s,t) => s + Number(t.fareAmount), 0);

  const addCash = async () => {
    const trip = { passengerName: cashName || null, passengerCard: null, fareAmount: +cashAmt, paymentMethod: "cash", tapTimestamp: new Date().toISOString() };
    try { await fetch(`${API}/trips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverId: "drv-001", vehicleReg: "CA 847-891", routeName: "Current route", ...trip }) }); } catch {}
    setTrips(prev => [trip, ...prev]);
    setCashAdded(true); setCashAmt("14"); setCashName(""); setShowCash(false);
    setTimeout(() => setCashAdded(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#0F172A" }}>
      {/* Summary bar */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: "#1E293B" }}>
        <div className="flex-1 text-center">
          <p className="text-[10px] text-white/50 font-semibold">PASSENGERS</p>
          <p className="text-xl font-black text-white">{trips.length}</p>
        </div>
        <div className="w-px h-10 bg-white/10" />
        <div className="flex-1 text-center">
          <p className="text-[10px] text-white/50 font-semibold">CARD</p>
          <p className="text-base font-black" style={{ color: "#14B8A6" }}>R{cardTotal.toFixed(2)}</p>
        </div>
        <div className="w-px h-10 bg-white/10" />
        <div className="flex-1 text-center">
          <p className="text-[10px] text-white/50 font-semibold">CASH</p>
          <p className="text-base font-black" style={{ color: "#F5A623" }}>R{cashTotal.toFixed(2)}</p>
        </div>
        <button onClick={() => setShowCash(true)} className="ml-1 w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: "#14B8A6" }}>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Cash entry modal */}
      {showCash && (
        <div className="mx-4 mt-3 rounded-2xl p-4 space-y-3" style={{ background: "#1E293B" }}>
          <div className="flex items-center justify-between">
            <p className="text-white font-bold text-sm">Add Cash Fare</p>
            <button onClick={() => setShowCash(false)} className="text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <p className="text-[10px] text-white/50 font-semibold mb-1">Amount (ZAR)</p>
            <input type="number" className="w-full rounded-xl px-3 py-2 text-white text-lg font-black outline-none" style={{ background: "#0F172A", border: "1px solid #334155" }} value={cashAmt} onChange={e => setCashAmt(e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] text-white/50 font-semibold mb-1">Passenger name (optional)</p>
            <input className="w-full rounded-xl px-3 py-2 text-white text-sm outline-none" style={{ background: "#0F172A", border: "1px solid #334155" }} placeholder="e.g. Mr Dube" value={cashName} onChange={e => setCashName(e.target.value)} />
          </div>
          <button onClick={addCash} className="w-full py-2.5 rounded-xl text-sm font-black text-white" style={{ background: "#14B8A6" }}>
            Record Cash Fare
          </button>
        </div>
      )}

      {cashAdded && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold" style={{ background: "#14B8A620", color: "#14B8A6" }}>
          <CheckCircle className="w-4 h-4" />Cash fare recorded
        </div>
      )}

      {/* Passenger list */}
      <div className="px-4 py-3">
        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-3">Today&apos;s Passengers</p>
        <div className="space-y-2">
          {trips.map((t, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#1E293B" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                style={{ background: t.paymentMethod === "card" ? "#14B8A6" : "#F5A623" }}>
                {t.paymentMethod === "card" ? "💳" : "💵"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{String(t.passengerName ?? "Cash passenger")}</p>
                <p className="text-white/40 text-[10px]">{t.passengerCard ? String(t.passengerCard) : "Cash"} · {new Date(String(t.tapTimestamp)).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <p className="text-sm font-black flex-shrink-0" style={{ color: t.paymentMethod === "card" ? "#14B8A6" : "#F5A623" }}>
                R{Number(t.fareAmount).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VinkDriverApp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>("status");
  const [online, setOnline] = useState(false);

  if (!isOpen) return null;

  const TABS: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "status",     label: "Status",     icon: <Radio className="w-5 h-5" /> },
    { id: "request",    label: "Requests",   icon: <span className="text-base">📲</span> },
    { id: "navigation", label: "Navigate",   icon: <Navigation className="w-5 h-5" /> },
    { id: "passengers", label: "Passengers", icon: <Users className="w-5 h-5" /> },
    { id: "earnings",   label: "Earnings",   icon: <DollarSign className="w-5 h-5" /> },
  ];

  return (
    <MobileAppOverlay onClose={onClose} appName="Vink Driver" bgColor={DARK}>
      <PhoneFrame statusBarColor={DARK2} statusBarTextLight>
        <div className="flex-1 overflow-hidden flex flex-col">
          {screen === "status"     && <StatusScreen online={online} setOnline={setOnline} />}
          {screen === "request"    && <RequestScreen onAccept={() => setScreen("navigation")} />}
          {screen === "navigation" && <NavigationScreen />}
          {screen === "passengers" && <PassengersScreen />}
          {screen === "earnings"   && <EarningsScreen />}
          {screen === "profile"    && <ProfileScreen />}
        </div>
        {/* Bottom tab bar */}
        <div className="flex-shrink-0 flex items-center border-t" style={{ background: DARK2, borderColor: "#334155" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScreen(tab.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 relative transition-colors"
              style={{ color: screen === tab.id ? TEAL : "#4B5563" }}
            >
              {tab.icon}
              <span className="text-[9px] font-semibold">{tab.label}</span>
              {screen === tab.id && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ background: TEAL }} />
              )}
            </button>
          ))}
        </div>
      </PhoneFrame>
    </MobileAppOverlay>
  );
}
