import { useState } from "react";
import {
  X, Menu, Search, Bell, Moon, Settings, ChevronDown, Home, Car, Bus, Plane, Hotel,
  Accessibility, History, CreditCard, MapPin, Users, Star, ArrowRight,
  Clock, Minus, Plus,
} from "lucide-react";

const NAVY = "#0B1330";
const PURPLE = "#5B21B6";
const GOLD = "#F5A623";
const GREEN = "#059669";
const BLUE = "#2563EB";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  passengerName?: string;
  onOpenRideHailing?: () => void;
  onOpenFlightBooking?: () => void;
  onOpenAccessibleTransport?: () => void;
}

type View = "overview" | "bus" | "hotels" | "history" | "payments";

const SIDEBAR_ITEMS: { id: View | "ride" | "flight" | "accessible"; label: string; icon: any; external?: boolean }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "ride", label: "Taxi & E-Hailing", icon: Car, external: true },
  { id: "bus", label: "Bus Booking", icon: Bus },
  { id: "flight", label: "Flights", icon: Plane, external: true },
  { id: "hotels", label: "Hotels", icon: Hotel },
  { id: "accessible", label: "Accessible & Medical", icon: Accessibility, external: true },
  { id: "history", label: "Trip History", icon: History },
  { id: "payments", label: "Payments", icon: CreditCard },
];

const BUS_ROUTES = [
  { from: "Cape Town", to: "Johannesburg", operator: "Intercape", duration: "18h 30m", price: 650, seats: 12 },
  { from: "Cape Town", to: "Durban", operator: "Greyhound", duration: "21h 00m", price: 720, seats: 8 },
  { from: "Cape Town", to: "Port Elizabeth", operator: "Translux", duration: "10h 15m", price: 420, seats: 20 },
  { from: "Johannesburg", to: "Durban", operator: "Intercape", duration: "8h 00m", price: 380, seats: 15 },
  { from: "Johannesburg", to: "Pretoria", operator: "City to City", duration: "1h 00m", price: 95, seats: 30 },
  { from: "Cape Town", to: "Bloemfontein", operator: "Translux", duration: "11h 45m", price: 480, seats: 18 },
];

const HOTELS = [
  { name: "Table Bay Hotel", city: "Cape Town", stars: 5, price: 3200, rating: 4.8, img: "🏨" },
  { name: "Sandton Sun", city: "Johannesburg", stars: 4, price: 2100, rating: 4.6, img: "🏙️" },
  { name: "Oyster Box", city: "Durban", stars: 5, price: 2800, rating: 4.9, img: "🌊" },
  { name: "Southern Sun Waterfront", city: "Cape Town", stars: 4, price: 1850, rating: 4.5, img: "🌅" },
  { name: "Premier Hotel Regent", city: "Port Elizabeth", stars: 3, price: 950, rating: 4.2, img: "🏖️" },
  { name: "Garden Court Umhlanga", city: "Durban", stars: 4, price: 1650, rating: 4.4, img: "🌴" },
];

const TRIP_HISTORY = [
  { type: "Taxi", icon: Car, color: BLUE, from: "Sandton City Mall", to: "OR Tambo Airport", date: "Today, 14:20", amount: 148, status: "Completed" },
  { type: "Flight", icon: Plane, color: PURPLE, from: "Cape Town", to: "Johannesburg", date: "3 days ago", amount: 1450, status: "Completed" },
  { type: "Hotel", icon: Hotel, color: GOLD, from: "Table Bay Hotel", to: "2 nights", date: "1 week ago", amount: 6400, status: "Completed" },
  { type: "Bus", icon: Bus, color: GREEN, from: "Cape Town", to: "Port Elizabeth", date: "2 weeks ago", amount: 420, status: "Completed" },
  { type: "Taxi", icon: Car, color: BLUE, from: "Home", to: "Rosebank Office Park", date: "2 weeks ago", amount: 62, status: "Completed" },
];

const PAYMENT_METHODS = [
  { type: "VINK Wallet", detail: "Balance: R2,450.00", icon: "💠", primary: true },
  { type: "Visa •••• 4821", detail: "Expires 08/27", icon: "💳", primary: false },
  { type: "Cash", detail: "Pay driver directly", icon: "💵", primary: false },
];

export function VinkGoDashboardViewer({ isOpen, onClose, passengerName = "Passenger", onOpenRideHailing, onOpenFlightBooking, onOpenAccessibleTransport }: Props) {
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Bus booking state
  const [busFrom, setBusFrom] = useState("Cape Town");
  const [busTo, setBusTo] = useState("Johannesburg");
  const [busDate, setBusDate] = useState("");
  const [busResults, setBusResults] = useState(false);

  // Hotel booking state
  const [hotelCity, setHotelCity] = useState("Cape Town");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);

  if (!isOpen) return null;

  const handleSidebarClick = (id: string) => {
    if (id === "ride") { onClose(); onOpenRideHailing?.(); return; }
    if (id === "flight") { onClose(); onOpenFlightBooking?.(); return; }
    if (id === "accessible") { onClose(); onOpenAccessibleTransport?.(); return; }
    setView(id as View);
  };

  const filteredBuses = BUS_ROUTES.filter(r => r.from === busFrom && r.to === busTo);
  const filteredHotels = HOTELS.filter(h => h.city === hotelCity);

  return (
    <div className="fixed inset-0 z-[110] flex bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-0 overflow-hidden"} shrink-0 flex flex-col transition-all duration-200`} style={{ background: NAVY }}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white" style={{ background: `linear-gradient(135deg,${PURPLE},${BLUE})` }}>V</span>
          <div><p className="text-white font-black text-base leading-tight">VINK Go</p><p className="text-[10px] text-white/40">Passenger</p></div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {SIDEBAR_ITEMS.map(item => (
            <button key={item.id} onClick={() => handleSidebarClick(item.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
              style={view === item.id && !item.external ? { background: PURPLE, color: "#fff" } : { color: "rgba(255,255,255,0.65)" }}>
              <item.icon className="w-4 h-4" /> {item.label}
              {item.external && <ArrowRight className="w-3 h-3 ml-auto opacity-40" />}
            </button>
          ))}
        </nav>

        <div className="p-3">
          <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,.05)" }}>
            <p className="text-[12.5px] font-bold text-white">💠 {passengerName}</p>
            <p className="text-[11px] text-white/50 mt-0.5">One app for every trip — taxi, bus, flight, or stay.</p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-gray-100">
          <button onClick={() => setSidebarOpen(s => !s)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"><Menu className="w-4 h-4" /></button>
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search trips, bookings..." className="w-full pl-9 pr-14 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-purple-600" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">⌘K</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button className="relative p-2 rounded-lg hover:bg-gray-50">
              <Bell className="w-4.5 h-4.5 text-gray-500" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: GOLD }}>3</span>
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Toggle dark mode"><Moon className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Settings"><Settings className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="flex items-center gap-2 pl-2 ml-1 border-l border-gray-100">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: PURPLE }}>{passengerName.slice(0, 2).toUpperCase()}</span>
              <span className="text-left hidden sm:block"><span className="block text-[13px] font-bold text-gray-900 leading-tight">{passengerName}</span><span className="block text-[11px] text-gray-400 leading-tight">Passenger</span></span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={onClose} className="ml-1 p-2 rounded-lg hover:bg-gray-50 text-gray-500" aria-label="Close"><X className="w-4.5 h-4.5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Overview ── */}
          {view === "overview" && (
            <>
              <div className="mb-7"><h1 className="text-2xl font-black text-gray-900">Welcome back, {passengerName.split(" ")[0]} 👋</h1><p className="text-gray-500 text-sm mt-1">Book a taxi, charter a bus, catch a flight, or reserve a hotel — all from one app.</p></div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                {[
                  { label: "Total Trips", value: "47", icon: Car, bg: "#E6F0FF", color: BLUE },
                  { label: "Total Spent", value: "R12,840", icon: CreditCard, bg: "#F3E8FF", color: PURPLE },
                  { label: "Saved Places", value: "6", icon: MapPin, bg: "#FFF7E6", color: GOLD },
                  { label: "Loyalty Points", value: "2,340", icon: Star, bg: "#E9F7EF", color: GREEN },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <span className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: s.bg, color: s.color }}><s.icon className="w-5 h-5" /></span>
                    <p className="text-xs text-gray-400">{s.label}</p>
                    <p className="text-xl font-black text-gray-900 mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
                <p className="text-[15px] font-black text-gray-900 mb-4">Where to?</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  {[
                    { label: "Book a Ride", sub: "Taxi & e-hailing", icon: Car, bg: "#E6F0FF", c: BLUE, action: () => handleSidebarClick("ride") },
                    { label: "Bus Booking", sub: "Intercity travel", icon: Bus, bg: "#E9F7EF", c: GREEN, action: () => setView("bus") },
                    { label: "Flights", sub: "Domestic routes", icon: Plane, bg: "#F3E8FF", c: PURPLE, action: () => handleSidebarClick("flight") },
                    { label: "Hotels", sub: "Find a stay", icon: Hotel, bg: "#FFF7E6", c: GOLD, action: () => setView("hotels") },
                  ].map(qa => (
                    <button key={qa.label} onClick={qa.action} className="flex flex-col items-start gap-2.5 border border-gray-100 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
                      <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: qa.bg, color: qa.c }}><qa.icon className="w-5 h-5" /></span>
                      <span className="text-[13px] font-bold text-gray-900">{qa.label}</span>
                      <span className="text-[11px] text-gray-400">{qa.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border-2 p-5 mb-6" style={{ borderColor: "#DDD6FE", background: "linear-gradient(135deg,#F5F3FF,#FFFFFF)" }}>
                <div className="flex items-start gap-4">
                  <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#EDE9FE", color: PURPLE }}><Accessibility className="w-6 h-6" /></span>
                  <div className="flex-1">
                    <p className="text-[15px] font-black text-gray-900">Accessible &amp; Medical Transport</p>
                    <p className="text-[12.5px] text-gray-500 mt-1 leading-relaxed">Wheelchair-accessible vehicles and stretcher transport for medical appointments, with the same real-time tracking as every other ride.</p>
                    <button onClick={() => handleSidebarClick("accessible")} className="mt-3 flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: PURPLE }}>Book accessible transport <ArrowRight className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4"><p className="text-[15px] font-black text-gray-900">Recent Trips</p><button onClick={() => setView("history")} className="text-xs font-bold" style={{ color: PURPLE }}>View all</button></div>
                <div className="space-y-3.5">
                  {TRIP_HISTORY.slice(0, 3).map((t, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.color + "1A", color: t.color }}><t.icon className="w-4 h-4" /></span>
                      <div className="flex-1 min-w-0"><p className="text-[13px] font-bold text-gray-900 truncate">{t.from} → {t.to}</p><p className="text-[11.5px] text-gray-400">{t.type} · {t.date}</p></div>
                      <span className="text-[13px] font-bold text-gray-900 shrink-0">R{t.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Bus Booking ── */}
          {view === "bus" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Bus Booking</h1>
              <p className="text-gray-500 text-sm mb-5">Charter intercity coaches across South Africa's major routes.</p>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
                <div className="grid sm:grid-cols-3 gap-3.5 mb-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">From</label>
                    <select value={busFrom} onChange={e => { setBusFrom(e.target.value); setBusResults(false); }} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none">
                      {[...new Set(BUS_ROUTES.map(r => r.from))].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">To</label>
                    <select value={busTo} onChange={e => { setBusTo(e.target.value); setBusResults(false); }} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none">
                      {[...new Set(BUS_ROUTES.map(r => r.to))].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Travel date</label>
                    <input type="date" value={busDate} onChange={e => setBusDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
                  </div>
                </div>
                <button onClick={() => setBusResults(true)} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.01]" style={{ background: `linear-gradient(135deg,${GREEN},#0D9488)` }}>Search buses</button>
              </div>

              {busResults && (
                filteredBuses.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">No direct routes found between {busFrom} and {busTo} — try a different pair of cities.</div>
                ) : (
                  <div className="space-y-3">
                    {filteredBuses.map((r, i) => (
                      <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 flex-wrap">
                        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#E9F7EF", color: GREEN }}><Bus className="w-5 h-5" /></span>
                        <div className="flex-1 min-w-[180px]">
                          <p className="text-[14px] font-bold text-gray-900">{r.operator}</p>
                          <p className="text-[12px] text-gray-500 flex items-center gap-1.5 mt-0.5"><Clock className="w-3 h-3" /> {r.duration} · {r.seats} seats left</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-gray-900">R{r.price}</p>
                          <button className="mt-1 px-4 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: GREEN }}>Book</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* ── Hotels ── */}
          {view === "hotels" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Hotels</h1>
              <p className="text-gray-500 text-sm mb-5">Find and reserve accommodation across South Africa.</p>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
                <div className="grid sm:grid-cols-4 gap-3.5 mb-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">City</label>
                    <select value={hotelCity} onChange={e => setHotelCity(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none">
                      {[...new Set(HOTELS.map(h => h.city))].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Check-in</label>
                    <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Check-out</label>
                    <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Guests</label>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200">
                      <button onClick={() => setGuests(g => Math.max(1, g - 1))} className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-gray-50"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="flex-1 text-center text-sm font-semibold flex items-center justify-center gap-1"><Users className="w-3.5 h-3.5 text-gray-400" />{guests}</span>
                      <button onClick={() => setGuests(g => g + 1)} className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-gray-50"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredHotels.map((h, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="h-28 flex items-center justify-center text-5xl" style={{ background: "linear-gradient(135deg,#FFF7E6,#FFEDD5)" }}>{h.img}</div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[14px] font-bold text-gray-900">{h.name}</p>
                        <span className="text-[11px] font-bold flex items-center gap-0.5" style={{ color: GOLD }}><Star className="w-3 h-3 fill-current" />{h.rating}</span>
                      </div>
                      <p className="text-[11.5px] text-gray-400 mb-3">{h.city} · {"★".repeat(h.stars)}</p>
                      <div className="flex items-center justify-between">
                        <div><p className="text-base font-black text-gray-900">R{h.price}<span className="text-[11px] font-normal text-gray-400">/night</span></p></div>
                        <button className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: GOLD }}>Reserve</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Trip History ── */}
          {view === "history" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Trip History</h1>
              <p className="text-gray-500 text-sm mb-5">Every booking across taxi, bus, flight, and hotel in one place.</p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-semibold">Type</th><th className="px-5 py-3 font-semibold">Details</th><th className="px-5 py-3 font-semibold">Date</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {TRIP_HISTORY.map((t, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3"><span className="flex items-center gap-2 font-bold" style={{ color: t.color }}><t.icon className="w-4 h-4" />{t.type}</span></td>
                        <td className="px-5 py-3 text-gray-700">{t.from} → {t.to}</td>
                        <td className="px-5 py-3 text-gray-500">{t.date}</td>
                        <td className="px-5 py-3"><span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: "#E9F7EF", color: GREEN }}>{t.status}</span></td>
                        <td className="px-5 py-3 text-right font-bold text-gray-900">R{t.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Payments ── */}
          {view === "payments" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Payments</h1>
              <p className="text-gray-500 text-sm mb-5">Manage how you pay across every VINK Go service.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PAYMENT_METHODS.map((p, i) => (
                  <div key={i} className="bg-white rounded-2xl border p-5 relative" style={{ borderColor: p.primary ? PURPLE : "#F3F4F6" }}>
                    {p.primary && <span className="absolute top-4 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#F3E8FF", color: PURPLE }}>Default</span>}
                    <p className="text-3xl mb-3">{p.icon}</p>
                    <p className="text-[14px] font-bold text-gray-900">{p.type}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">{p.detail}</p>
                  </div>
                ))}
                <button className="rounded-2xl border-2 border-dashed border-gray-200 p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors">
                  <Plus className="w-6 h-6" />
                  <span className="text-[12.5px] font-bold">Add payment method</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
