import { useState } from "react";
import { Home, MapPin, Navigation, Bus, Hotel, Phone, MessageCircle, AlertOctagon, Search, ChevronRight, Clock, Star } from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";

type Screen = "home" | "booking" | "tracking" | "bus" | "hotels";

const PURPLE = "#5B2D8E";
const LIGHT_BG = "#F8F7FF";

const RECENT_DESTINATIONS = [
  { emoji: "🏥", name: "Groote Schuur Hospital",      addr: "Observatory, Cape Town" },
  { emoji: "🛒", name: "Pick n Pay Claremont",         addr: "Main Rd, Claremont" },
  { emoji: "✈️", name: "Cape Town International Airport", addr: "Matroosfontein" },
];

const BUS_ROUTES = [
  { op: "Intercape",  from: "Cape Town", to: "Johannesburg",   dep: "18:00", dur: "18h",  price: "R420", seats: 8 },
  { op: "Greyhound",  from: "Cape Town", to: "Durban",         dep: "16:30", dur: "22h",  price: "R550", seats: 3 },
  { op: "Translux",   from: "Cape Town", to: "Port Elizabeth",  dep: "07:00", dur: "8h",   price: "R280", seats: 12 },
  { op: "SA Roadlink",from: "Cape Town", to: "Bloemfontein",   dep: "20:00", dur: "12h",  price: "R310", seats: 6 },
];

const HOTELS = [
  { name: "Cape Town CBD Hotel",      stars: 4, price: "R1,200", dist: "0.2km", grad: "linear-gradient(135deg,#1E293B,#374151)" },
  { name: "Observatory Guesthouse",   stars: 3, price: "R680",   dist: "3.1km", grad: "linear-gradient(135deg,#134E4A,#0F766E)" },
  { name: "V&A Waterfront Suites",    stars: 5, price: "R2,800", dist: "1.4km", grad: "linear-gradient(135deg,#1E1B4B,#4C1D95)" },
  { name: "Sea Point Lodge",          stars: 3, price: "R450",   dist: "2.8km", grad: "linear-gradient(135deg,#7C2D12,#C2410C)" },
];

function HomeScreen({ setScreen }: { setScreen: (s: Screen) => void }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: LIGHT_BG }}>
      {/* Header */}
      <div className="px-4 pb-6 pt-3 flex-shrink-0" style={{ background: PURPLE, borderRadius: "0 0 24px 24px" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-bold tracking-widest" style={{ color: "#F5A623" }}>VINK</p>
            <p className="text-white/70 text-[10px]">Where to today, Nomsa?</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
            <span className="text-white text-xs font-bold">NZ</span>
          </div>
        </div>
        {/* Search bar */}
        <button
          onClick={() => setScreen("booking")}
          className="w-full flex items-center gap-2 bg-white rounded-2xl px-4 py-3 shadow-lg"
        >
          <Search className="w-4 h-4" style={{ color: PURPLE }} />
          <span className="text-gray-400 text-sm">Where to?</span>
        </button>
      </div>

      <div className="px-3 pt-4 pb-2 space-y-4">
        {/* Service pills */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Services</p>
          <div className="flex gap-2">
            {[["🚌","Taxi"],["🚍","Bus"],["✈️","Flight"],["🏨","Hotel"]].map(([emoji, label]) => (
              <button
                key={label}
                onClick={() => {
                  if (label === "Bus") setScreen("bus");
                  else if (label === "Hotel") setScreen("hotels");
                  else setScreen("booking");
                }}
                className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl bg-white shadow-sm border transition-all active:scale-95"
                style={{ borderColor: `${PURPLE}22` }}
              >
                <span className="text-xl">{emoji}</span>
                <span className="text-gray-600 text-[10px] font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active booking banner */}
        <button
          onClick={() => setScreen("tracking")}
          className="w-full rounded-2xl p-3 flex items-center gap-3 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, #7C3AED)` }}
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-white font-bold text-xs">Your driver is 3 min away</p>
            <p className="text-white/60 text-[10px]">Sipho Dlamini · CA 847-891 · Tap to track</p>
          </div>
          <ChevronRight className="w-4 h-4 text-white/60" />
        </button>

        {/* Recent destinations */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Recent</p>
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            {RECENT_DESTINATIONS.map((d, i) => (
              <button
                key={i}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${i > 0 ? "border-t border-gray-100" : ""}`}
                onClick={() => setScreen("booking")}
              >
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                  {d.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 text-xs font-medium truncate">{d.name}</p>
                  <p className="text-gray-400 text-[10px]">{d.addr}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Promo */}
        <div
          className="rounded-2xl p-3 flex items-center gap-3"
          style={{ background: `${PURPLE}11`, border: `1px solid ${PURPLE}33` }}
        >
          <span className="text-2xl">📶</span>
          <div>
            <p className="text-xs font-bold" style={{ color: PURPLE }}>Free Wi-Fi on all VMS taxis!</p>
            <p className="text-gray-500 text-[10px]">Connect automatically when you board</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingScreen({ onBookRide }: { onBookRide?: () => void }) {
  const [vehicleType, setVehicleType] = useState<"Standard"|"Wheelchair"|"Stretcher">("Standard");
  const [schedule, setSchedule] = useState<"Now"|"Later">("Now");
  const [recurring, setRecurring] = useState<"Never"|"Daily"|"Weekly">("Never");
  const [payment, setPayment] = useState<"Vink"|"Card"|"Cash">("Vink");
  const [note, setNote] = useState("");

  const vehicleTypes = [
    { id: "Standard",   icon: "🚖", price: "R45–65",   desc: "Standard taxi" },
    { id: "Wheelchair", icon: "♿", price: "R55–75",   desc: "Accessible vehicle" },
    { id: "Stretcher",  icon: "🏥", price: "R120–180", desc: "Medical transport" },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: LIGHT_BG }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">Book a Ride</p>
        <p className="text-white/60 text-xs">Select your ride options</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Pickup/dropoff */}
        <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-100">
            <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: PURPLE }} />
            <input className="flex-1 text-sm outline-none bg-transparent" defaultValue="Current Location" style={{ color: PURPLE }} />
          </div>
          <div className="flex items-center gap-3 px-3 py-3">
            <div className="w-3 h-3 rounded-full" style={{ background: PURPLE }} />
            <input className="flex-1 text-sm outline-none bg-transparent text-gray-400" placeholder="Where to?" />
          </div>
        </div>

        {/* Vehicle type */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Vehicle Type</p>
          <div className="space-y-2">
            {vehicleTypes.map((v) => (
              <button
                key={v.id}
                onClick={() => setVehicleType(v.id as typeof vehicleType)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-white shadow-sm border transition-colors"
                style={{ borderColor: vehicleType === v.id ? PURPLE : "transparent", borderWidth: vehicleType === v.id ? 2 : 1 }}
              >
                <span className="text-xl w-8 text-center">{v.icon}</span>
                <div className="flex-1 text-left">
                  <p className="text-gray-800 text-xs font-semibold">{v.id}</p>
                  <p className="text-gray-400 text-[10px]">{v.desc}</p>
                </div>
                <span className="font-bold text-xs" style={{ color: PURPLE }}>{v.price}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Schedule</p>
          <div className="flex gap-1 p-1 rounded-xl bg-white border" style={{ borderColor: `${PURPLE}22` }}>
            {(["Now","Later"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSchedule(s)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: schedule === s ? PURPLE : "transparent", color: schedule === s ? "#fff" : PURPLE }}
              >
                {s === "Now" ? "⚡ Now" : "🕐 Later"}
              </button>
            ))}
          </div>
          {schedule === "Later" && (
            <input type="datetime-local" className="mt-2 w-full px-3 py-2 rounded-xl bg-white border text-sm text-gray-600 outline-none" style={{ borderColor: `${PURPLE}33` }} />
          )}
        </div>

        {/* Recurring */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Recurring</p>
          <div className="flex gap-1 p-1 rounded-xl bg-white border" style={{ borderColor: `${PURPLE}22` }}>
            {(["Never","Daily","Weekly"] as const).map(r => (
              <button
                key={r}
                onClick={() => setRecurring(r)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: recurring === r ? PURPLE : "transparent", color: recurring === r ? "#fff" : PURPLE }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Medical note */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Medical / Access Note</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Wheelchair user, oxygen equipment..."
            className="w-full px-3 py-2.5 rounded-xl bg-white border text-sm text-gray-600 outline-none resize-none"
            style={{ borderColor: `${PURPLE}22` }}
            rows={2}
          />
        </div>

        {/* Payment */}
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Payment</p>
          <div className="flex gap-1 p-1 rounded-xl bg-white border" style={{ borderColor: `${PURPLE}22` }}>
            {(["Vink","Card","Cash"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPayment(p)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: payment === p ? PURPLE : "transparent", color: payment === p ? "#fff" : PURPLE }}
              >
                {p === "Vink" ? "💜 Vink" : p === "Card" ? "💳 Card" : "💵 Cash"}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onBookRide}
          className="w-full py-3.5 rounded-2xl font-bold text-sm text-white shadow-lg mb-2 active:scale-95 transition-transform"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, #7C3AED)` }}
        >
          🚕 Find a Driver →
        </button>
      </div>
    </div>
  );
}

function TrackingScreen() {
  return (
    <div className="flex flex-col h-full" style={{ background: "#111827" }}>
      <div className="px-4 py-3 flex-shrink-0 flex items-center justify-between" style={{ background: "#1F2937" }}>
        <div>
          <p className="text-white font-bold text-sm">Driver is on the way</p>
          <p className="text-gray-400 text-[10px]">ETA updating in real time</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold" style={{ color: PURPLE }}>3</p>
          <p className="text-gray-400 text-[9px]">min away</p>
        </div>
      </div>

      {/* Map placeholder */}
      <div className="relative flex-1 overflow-hidden" style={{ background: "#1A2840" }}>
        <svg className="w-full h-full opacity-20" preserveAspectRatio="none">
          <defs>
            <pattern id="pgrid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke={PURPLE} strokeWidth="0.4"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#pgrid)"/>
          <line x1="0" y1="50%" x2="100%" y2="45%" stroke="#2A2A5F" strokeWidth="6"/>
          <line x1="40%" y1="0" x2="50%" y2="100%" stroke="#2A2A5F" strokeWidth="5"/>
        </svg>
        {/* Route and pins */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 250" preserveAspectRatio="none">
          <polyline points="50,200 70,160 100,130 130,110 155,80" fill="none" stroke={PURPLE} strokeWidth="3" strokeDasharray="6 3" opacity="0.8"/>
          {/* Driver pin */}
          <circle cx="50" cy="200" r="6" fill={PURPLE} />
          <text x="60" y="205" fill="white" fontSize="8">Driver</text>
          {/* Passenger pin */}
          <circle cx="155" cy="80" r="6" fill="#F5A623" />
          <text x="163" y="85" fill="white" fontSize="8">You</text>
        </svg>
      </div>

      {/* Bottom card */}
      <div className="px-3 py-3 space-y-3" style={{ background: LIGHT_BG }}>
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-white"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #7C3AED)` }}
          >
            SD
          </div>
          <div className="flex-1">
            <p className="text-gray-800 font-bold text-sm">Sipho Dlamini</p>
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map(s => (
                <svg key={s} viewBox="0 0 10 10" className="w-3 h-3" fill={s <= 4 ? "#F59E0B" : "#D1D5DB"}>
                  <polygon points="5,1 6.2,3.8 9,4.2 7,6.2 7.6,9 5,7.5 2.4,9 3,6.2 1,4.2 3.8,3.8"/>
                </svg>
              ))}
              <span className="text-gray-400 text-[10px]">4.8</span>
            </div>
            <p className="text-gray-400 text-[10px]">Toyota HiAce · CA 847-891</p>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-[10px]">Est. fare</p>
            <p className="font-bold text-sm" style={{ color: PURPLE }}>R68.00</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
            style={{ background: `${PURPLE}11`, color: PURPLE }}
          >
            <Phone className="w-3.5 h-3.5" /> Call
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
            style={{ background: `${PURPLE}11`, color: PURPLE }}
          >
            <MessageCircle className="w-3.5 h-3.5" /> Message
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50">
            <AlertOctagon className="w-3.5 h-3.5" /> SOS
          </button>
        </div>

        <button className="w-full text-center text-xs text-gray-400 underline">Cancel trip</button>
      </div>
    </div>
  );
}

function BusScreen() {
  const [from, setFrom] = useState("Cape Town");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");

  return (
    <div className="flex flex-col h-full" style={{ background: LIGHT_BG }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">Book a Bus Ticket</p>
        <p className="text-white/60 text-xs">Intercity routes from Cape Town</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Search */}
        <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
            <span className="text-sm">🏠</span>
            <input
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="flex-1 text-sm outline-none text-gray-700"
              placeholder="From"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
            <span className="text-sm">📍</span>
            <input
              value={to}
              onChange={e => setTo(e.target.value)}
              className="flex-1 text-sm outline-none text-gray-400"
              placeholder="To (e.g. Johannesburg)"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-sm">📅</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="flex-1 text-sm outline-none text-gray-400"
            />
          </div>
        </div>

        {/* Available buses */}
        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Available Buses</p>
        <div className="space-y-2">
          {BUS_ROUTES.map((b, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-sm p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-gray-800 font-bold text-xs">{b.from} → {b.to}</p>
                  <p className="text-gray-400 text-[10px]">{b.op}</p>
                </div>
                <span className="font-bold text-sm" style={{ color: PURPLE }}>{b.price}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-3">
                  <div className="text-center">
                    <p className="text-gray-600 text-xs font-semibold">{b.dep}</p>
                    <p className="text-gray-400 text-[9px]">Departs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-600 text-xs font-semibold">{b.dur}</p>
                    <p className="text-gray-400 text-[9px]">Duration</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-600 text-xs font-semibold">{b.seats}</p>
                    <p className="text-gray-400 text-[9px]">Seats left</p>
                  </div>
                </div>
                <button
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${PURPLE}, #7C3AED)` }}
                >
                  Book
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HotelsScreen() {
  const [city, setCity] = useState("Cape Town");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("2");

  return (
    <div className="flex flex-col h-full" style={{ background: LIGHT_BG }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: PURPLE }}>
        <p className="text-white font-bold text-base">Find Hotels</p>
        <p className="text-white/60 text-xs">Book nearby accommodation</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Search */}
        <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
            <span className="text-sm">🌍</span>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              className="flex-1 text-sm outline-none text-gray-700"
              placeholder="City"
            />
          </div>
          <div className="flex border-b border-gray-100">
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 border-r border-gray-100">
              <span className="text-sm">📅</span>
              <input
                type="date"
                value={checkIn}
                onChange={e => setCheckIn(e.target.value)}
                className="flex-1 text-xs outline-none text-gray-400 w-0"
                placeholder="Check-in"
              />
            </div>
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5">
              <span className="text-sm">📅</span>
              <input
                type="date"
                value={checkOut}
                onChange={e => setCheckOut(e.target.value)}
                className="flex-1 text-xs outline-none text-gray-400 w-0"
                placeholder="Check-out"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-sm">👥</span>
            <select
              value={guests}
              onChange={e => setGuests(e.target.value)}
              className="flex-1 text-sm outline-none text-gray-500 bg-transparent"
            >
              {["1","2","3","4","5+"].map(n => <option key={n}>{n} Guest{n !== "1" ? "s" : ""}</option>)}
            </select>
          </div>
        </div>

        {/* Hotel cards */}
        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Available Hotels</p>
        <div className="space-y-3">
          {HOTELS.map((h, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-sm overflow-hidden">
              {/* Thumbnail */}
              <div className="h-20 rounded-t-2xl" style={{ background: h.grad }}>
                <div className="h-full flex items-center justify-center">
                  <span className="text-3xl">🏨</span>
                </div>
              </div>
              {/* Details */}
              <div className="p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-800 font-bold text-xs">{h.name}</p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <svg key={j} viewBox="0 0 10 10" className="w-2.5 h-2.5" fill={j < h.stars ? "#F59E0B" : "#E5E7EB"}>
                          <polygon points="5,1 6.2,3.8 9,4.2 7,6.2 7.6,9 5,7.5 2.4,9 3,6.2 1,4.2 3.8,3.8"/>
                        </svg>
                      ))}
                      <span className="text-gray-400 text-[9px] ml-1">{h.dist} from city</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm" style={{ color: PURPLE }}>{h.price}</p>
                    <p className="text-gray-400 text-[9px]">per night</p>
                  </div>
                </div>
                <button
                  className="w-full mt-2 py-1.5 rounded-xl text-xs font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${PURPLE}, #7C3AED)` }}
                >
                  Book Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VinkPassengerApp({ isOpen, onClose, onOpenClubBooking, onBookRide }: { isOpen: boolean; onClose: () => void; onOpenClubBooking?: () => void; onBookRide?: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");

  if (!isOpen) return null;

  const TABS: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "home",     label: "Home",    icon: <Home className="w-5 h-5" /> },
    { id: "booking",  label: "Book",    icon: <MapPin className="w-5 h-5" /> },
    { id: "tracking", label: "Track",   icon: <Navigation className="w-5 h-5" /> },
    { id: "bus",      label: "Club",    icon: <Bus className="w-5 h-5" /> },
    { id: "hotels",   label: "Hotels",  icon: <Hotel className="w-5 h-5" /> },
  ];

  return (
    <MobileAppOverlay onClose={onClose} appName="Vink Passenger" bgColor={LIGHT_BG}>
      <PhoneFrame statusBarColor={PURPLE} statusBarTextLight>
        <div className="flex-1 overflow-hidden flex flex-col">
          {screen === "home"     && <HomeScreen setScreen={setScreen} />}
          {screen === "booking"  && <BookingScreen onBookRide={onBookRide} />}
          {screen === "tracking" && <TrackingScreen />}
          {screen === "bus"      && (
            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 text-center gap-5"
              style={{ background: "#F8F7FF" }}>
              <div className="text-5xl">✈️🚌</div>
              <div>
                <p className="text-lg font-black text-gray-900">Club Travel</p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  Join group bookings on flights and buses — get bulk prices and travel together. VMS pays the operator when the group is full.
                </p>
              </div>
              <div className="space-y-3 w-full max-w-xs">
                {[
                  { emoji: "✈️", label: "Cape Town → New York", sub: "Departs 15 Jul 2026", color: "#1A237E" },
                  { emoji: "✈️", label: "Cape Town → London", sub: "Departs 20 Jul 2026", color: "#1B5E20" },
                  { emoji: "🚌", label: "Cape Town → Pretoria", sub: "Departs 15 Jul 2026", color: "#5B2D8E" },
                ].map((r, i) => (
                  <div key={i} onClick={() => { if (onOpenClubBooking) { onOpenClubBooking(); } }}
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 text-white"
                    style={{ background: r.color }}>
                    <span className="text-2xl">{r.emoji}</span>
                    <div className="text-left">
                      <p className="text-sm font-bold">{r.label}</p>
                      <p className="text-[11px] opacity-70">{r.sub}</p>
                    </div>
                    <span className="ml-auto text-[10px] font-bold opacity-70">→</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { if (onOpenClubBooking) onOpenClubBooking(); }}
                className="w-full max-w-xs py-3 rounded-2xl text-sm font-black text-white shadow-lg"
                style={{ background: "linear-gradient(135deg,#5B2D8E,#9585EA)" }}>
                Browse All Club Routes
              </button>
            </div>
          )}
          {screen === "hotels"   && <HotelsScreen />}
        </div>
        {/* Bottom tab bar */}
        <div
          className="flex-shrink-0 flex items-center border-t bg-white"
          style={{ borderColor: `${PURPLE}22` }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScreen(tab.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 relative transition-colors"
              style={{ color: screen === tab.id ? PURPLE : "#9CA3AF" }}
            >
              {tab.icon}
              <span className="text-[9px] font-semibold">{tab.label}</span>
              {screen === tab.id && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                  style={{ background: PURPLE }}
                />
              )}
            </button>
          ))}
        </div>
      </PhoneFrame>
    </MobileAppOverlay>
  );
}
