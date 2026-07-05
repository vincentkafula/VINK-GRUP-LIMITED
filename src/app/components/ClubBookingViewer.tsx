/**
 * VMS Club Booking System
 * Group travel — passengers join club routes at bulk prices.
 * VMS pays airline/bus operator when route is full.
 * Also includes Visa Application assistance.
 */
import { useState, useEffect } from "react";
import { X, Plane, Bus, Users, Calendar, Clock, CheckCircle, AlertTriangle, ChevronRight, RefreshCw, FileText, Globe, Shield, ArrowRight } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { projectId } from "../../../utils/supabase/info";

interface Props { isOpen: boolean; onClose: () => void; }

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-3f39932e/club`;

const P = "#5B2D8E";
const GOLD = "#F5A623";
const GREEN = "#10B981";
const TEAL = "#0EA5E9";

type Screen = "home" | "routes" | "detail" | "book" | "myBookings" | "visa" | "visaSuccess" | "bookSuccess";

interface Route { id: string; type: "flight"|"bus"; origin: string; destination: string; departureDate: string; returnDate: string; departureTime: string; returnTime: string; operator: string; operatorLogo: string; pricePerSeat: number; originalPrice: number; totalSeats: number; seatsBooked: number; seatsRemaining: number; fillPct: number; status: string; description: string; includes: string[]; route: string; duration: string; visaRequired: boolean; visaCountry: string|null; currency: string; full: boolean; }

const fmt = (n: number) => `R ${n.toLocaleString("en-ZA")}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

function RouteCard({ route, onClick }: { route: Route; onClick: () => void }) {
  const isFlying = route.type === "flight";
  const urgency = route.fillPct >= 90 ? "#EF4444" : route.fillPct >= 70 ? "#F59E0B" : GREEN;

  return (
    <div onClick={onClick} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden">
      {/* Header band */}
      <div className="px-5 py-4 text-white relative overflow-hidden"
        style={{ background: isFlying ? `linear-gradient(135deg,#1A237E,#3949AB)` : `linear-gradient(135deg,#1B5E20,#2E7D32)` }}>
        <div className="absolute -right-6 -top-6 text-6xl opacity-15 select-none">{route.operatorLogo}</div>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex items-center gap-1">
              {isFlying ? <Plane className="w-3 h-3" /> : <Bus className="w-3 h-3" />}
              {isFlying ? "Club Flight" : "Club Bus"} · {route.operator}
            </span>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-lg font-black leading-tight">{route.origin.split(" ")[0]}</span>
              <ArrowRight className="w-4 h-4 opacity-70" />
              <span className="text-lg font-black leading-tight">{route.destination.split(" ")[0]}</span>
            </div>
            <p className="text-white/70 text-xs mt-1">{route.duration} · {route.route}</p>
          </div>
          <div className="text-right">
            <p className="text-white/50 text-[10px] line-through">{fmt(route.originalPrice)}</p>
            <p className="text-yellow-300 text-xl font-black leading-tight">{fmt(route.pricePerSeat)}</p>
            <p className="text-white/60 text-[10px]">per seat</p>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-2.5">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Departs</p>
          <p className="text-sm font-bold text-gray-800">{fmtDate(route.departureDate)}</p>
          <p className="text-xs text-gray-500">{route.departureTime}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Returns</p>
          <p className="text-sm font-bold text-gray-800">{fmtDate(route.returnDate)}</p>
          <p className="text-xs text-gray-500">{route.returnTime}</p>
        </div>
      </div>

      {/* Seats */}
      <div className="px-5 py-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Users className="w-3.5 h-3.5" />
            <span>{route.seatsBooked} of {route.totalSeats} seats filled</span>
          </div>
          <span className="font-black text-xs" style={{ color: urgency }}>
            {route.full ? "FULL" : `${route.seatsRemaining} left`}
          </span>
        </div>
        <ProgressBar pct={route.fillPct} color={urgency} />
        <div className="flex items-center justify-between">
          {route.visaRequired && (
            <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: "#7C3AED" }}>
              <Globe className="w-3 h-3" />Visa required — we can help
            </span>
          )}
          <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: route.full ? "#6B7280" : P }}>
            {route.full ? "Join waitlist" : "Book my seat"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ClubBookingViewer({ isOpen, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>("home");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [filterType, setFilterType] = useState<"all"|"flight"|"bus">("all");
  const [loading, setLoading] = useState(false);
  const [myBookings, setMyBookings] = useState<Record<string,unknown>[]>([]);
  const [confirmedBooking, setConfirmedBooking] = useState<Record<string,unknown> | null>(null);
  const [confirmedVisa, setConfirmedVisa] = useState<Record<string,unknown> | null>(null);

  // Booking form
  const [bkForm, setBkForm] = useState({ name: "", phone: "+27 ", email: "", idNumber: "", seats: "1", method: "vink_wallet", requests: "" });
  const [bkLoading, setBkLoading] = useState(false);
  const [bkError, setBkError] = useState("");

  // Visa form
  const [visaForm, setVisaForm] = useState({ name: "", email: "", phone: "+27 ", passport: "", passportExpiry: "", country: "", travelDate: "", returnDate: "", purpose: "tourism", accommodation: "", sponsor: "", employment: "employed" });
  const [visaLoading, setVisaLoading] = useState(false);

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/routes`);
      const d = await r.json();
      if (d.success) setRoutes(d.data);
    } catch {}
    setLoading(false);
  };

  const loadMyBookings = async () => {
    if (!bkForm.email) return;
    try {
      const r = await fetch(`${BASE}/bookings?email=${encodeURIComponent(bkForm.email)}`);
      const d = await r.json();
      if (d.success) setMyBookings(d.data);
    } catch {}
  };

  useEffect(() => { if (isOpen) loadRoutes(); }, [isOpen]);

  const submitBooking = async () => {
    if (!bkForm.name || !bkForm.phone || !bkForm.email) { setBkError("Please fill in name, phone, and email."); return; }
    setBkLoading(true); setBkError("");
    try {
      const r = await fetch(`${BASE}/bookings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId: selectedRoute?.id, passengerName: bkForm.name, phone: bkForm.phone, email: bkForm.email, idNumber: bkForm.idNumber, seatCount: +bkForm.seats, paymentMethod: bkForm.method, specialRequests: bkForm.requests }),
      });
      const d = await r.json();
      if (d.success) { setConfirmedBooking(d.data); setScreen("bookSuccess"); loadRoutes(); }
      else setBkError(d.error ?? "Booking failed. Please try again.");
    } catch { setBkError("Network error — please try again."); }
    setBkLoading(false);
  };

  const submitVisa = async () => {
    if (!visaForm.name || !visaForm.email || !visaForm.passport || !visaForm.country) { return; }
    setVisaLoading(true);
    try {
      const r = await fetch(`${BASE}/visa`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantName: visaForm.name, email: visaForm.email, phone: visaForm.phone, passportNumber: visaForm.passport, passportExpiry: visaForm.passportExpiry, destinationCountry: visaForm.country, travelDate: visaForm.travelDate, returnDate: visaForm.returnDate, purposeOfVisit: visaForm.purpose, accommodation: visaForm.accommodation, sponsorDetails: visaForm.sponsor, employmentStatus: visaForm.employment }),
      });
      const d = await r.json();
      if (d.success) { setConfirmedVisa(d.data); setScreen("visaSuccess"); }
    } catch {}
    setVisaLoading(false);
  };

  const filteredRoutes = routes.filter(r => filterType === "all" || r.type === filterType);

  if (!isOpen) return null;

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all bg-white";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gray-50">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            {screen !== "home" && (
              <button onClick={() => setScreen(screen === "detail" || screen === "book" ? "routes" : screen === "visa" ? "home" : "home")}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <img src={vinkLogo} alt="Vink" className="h-8 w-auto object-contain" />
            <div className="hidden sm:block border-l border-gray-200 pl-3">
              <p className="text-sm font-black text-gray-900">Vink Club Travel</p>
              <p className="text-[10px] text-gray-400">Group bookings · Better rates · Visa assistance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setScreen("myBookings"); loadMyBookings(); }} className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              <FileText className="w-3.5 h-3.5" />My Bookings
            </button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-6">

        {/* ══ HOME ══════════════════════════════════════════════════════════════ */}
        {screen === "home" && (
          <>
            {/* Hero */}
            <div className="rounded-3xl overflow-hidden shadow-xl text-white relative"
              style={{ background: `linear-gradient(135deg,${P} 0%,#3d1d63 40%,#7B4DB5 100%)` }}>
              <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle,#fff,transparent)" }} />
              <div className="px-6 py-8 relative z-10">
                <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-4" style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>
                  ✈️ Club Travel — Better Together
                </span>
                <h1 className="text-2xl md:text-3xl font-black leading-tight mb-2">
                  Travel More.<br />Pay Less. Together.
                </h1>
                <p className="text-white/70 text-sm leading-relaxed mb-6 max-w-lg">
                  Join VMS Club Travel routes — we pre-negotiate bulk seats on flights and buses. When the group is full, we pay the airline or bus company and everyone gets their seat at a fraction of the retail price.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { icon: "✈️", label: "Club Flights", sub: "3 routes open" },
                    { icon: "🚌", label: "Club Buses", sub: "3 routes open" },
                    { icon: "🛂", label: "Visa Help", sub: "USA · UK · Schengen" },
                  ].map((s, i) => (
                    <div key={i} className="rounded-2xl p-3 text-center" style={{ background: "rgba(255,255,255,.12)" }}>
                      <p className="text-2xl mb-1">{s.icon}</p>
                      <p className="text-white font-bold text-xs">{s.label}</p>
                      <p className="text-white/50 text-[10px]">{s.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => { setScreen("routes"); setFilterType("all"); }}
                    className="px-6 py-3 rounded-xl font-black text-sm transition-all hover:scale-105"
                    style={{ background: GOLD, color: "#222" }}>
                    Browse Club Routes
                  </button>
                  <button onClick={() => setScreen("visa")}
                    className="px-6 py-3 rounded-xl font-bold text-sm text-white border border-white/25 hover:bg-white/10 transition-all">
                    <Globe className="w-4 h-4 inline mr-1.5" />Apply for Visa
                  </button>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-black text-gray-900 mb-4">How Club Booking Works</h2>
              <div className="grid sm:grid-cols-4 gap-4">
                {[
                  { n: "1", icon: "🎯", title: "Choose your route", desc: "Pick from available club flights or buses with fixed departure dates." },
                  { n: "2", icon: "🪑", title: "Reserve your seat", desc: "Pay the club price via your Vink wallet. Your seat is secured." },
                  { n: "3", icon: "👥", title: "Group fills up", desc: "Once all seats are booked, VMS pays the airline or bus company." },
                  { n: "4", icon: "✅", title: "Travel confirmed", desc: "You receive your ticket/boarding pass from the operator directly." },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm mx-auto mb-2" style={{ background: P }}>{s.n}</div>
                    <p className="text-2xl mb-1">{s.icon}</p>
                    <p className="text-sm font-bold text-gray-800 mb-1">{s.title}</p>
                    <p className="text-xs text-gray-500 leading-snug">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick route previews */}
            {routes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-black text-gray-900">Upcoming Club Routes</h2>
                  <button onClick={() => setScreen("routes")} className="text-xs font-semibold" style={{ color: P }}>View all →</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {routes.slice(0, 2).map(r => <RouteCard key={r.id} route={r} onClick={() => { setSelectedRoute(r); setScreen("detail"); }} />)}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ ROUTES ════════════════════════════════════════════════════════════ */}
        {screen === "routes" && (
          <>
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Club Travel Routes</h1>
              <p className="text-sm text-gray-500">Join a group — save up to 40% on flights and buses.</p>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2">
              {(["all","flight","bus"] as const).map(f => (
                <button key={f} onClick={() => setFilterType(f)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all"
                  style={{ background: filterType === f ? P : "#fff", color: filterType === f ? "#fff" : "#6B7280", border: `1px solid ${filterType === f ? P : "#E5E7EB"}` }}>
                  {f === "all" ? "All routes" : f === "flight" ? "✈️ Flights" : "🚌 Buses"}
                </button>
              ))}
              <button onClick={loadRoutes} className="ml-auto p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-purple-200 border-t-purple-700 rounded-full animate-spin" /></div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRoutes.map(r => <RouteCard key={r.id} route={r} onClick={() => { setSelectedRoute(r); setScreen("detail"); }} />)}
              </div>
            )}
          </>
        )}

        {/* ══ ROUTE DETAIL ══════════════════════════════════════════════════════ */}
        {screen === "detail" && selectedRoute && (
          <div className="space-y-5">
            {/* Hero */}
            <div className="rounded-2xl overflow-hidden shadow-lg text-white"
              style={{ background: selectedRoute.type === "flight" ? "linear-gradient(135deg,#1A237E,#3949AB)" : "linear-gradient(135deg,#1B5E20,#2E7D32)" }}>
              <div className="p-6">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex items-center gap-1">
                      {selectedRoute.type === "flight" ? <Plane className="w-3 h-3" /> : <Bus className="w-3 h-3" />}
                      {selectedRoute.operator}
                    </span>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-2xl font-black">{selectedRoute.origin}</span>
                      <ArrowRight className="w-5 h-5 opacity-70" />
                      <span className="text-2xl font-black">{selectedRoute.destination}</span>
                    </div>
                    <p className="text-white/60 text-sm mt-1">{selectedRoute.route} · {selectedRoute.duration}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/40 text-sm line-through">{fmt(selectedRoute.originalPrice)}</p>
                    <p className="text-3xl font-black" style={{ color: GOLD }}>{fmt(selectedRoute.pricePerSeat)}</p>
                    <p className="text-white/60 text-xs">per seat (return)</p>
                    <p className="text-white/50 text-xs mt-1">Save {fmt(selectedRoute.originalPrice - selectedRoute.pricePerSeat)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.12)" }}>
                    <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1"><Calendar className="w-3 h-3" />Departure</p>
                    <p className="text-white font-black">{fmtDate(selectedRoute.departureDate)}</p>
                    <p className="text-white/60 text-xs">{selectedRoute.departureTime}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.12)" }}>
                    <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1"><Calendar className="w-3 h-3" />Return</p>
                    <p className="text-white font-black">{fmtDate(selectedRoute.returnDate)}</p>
                    <p className="text-white/60 text-xs">{selectedRoute.returnTime}</p>
                  </div>
                </div>
                {/* Seats progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/60 flex items-center gap-1"><Users className="w-3 h-3" />{selectedRoute.seatsBooked}/{selectedRoute.totalSeats} passengers joined</span>
                    <span className="font-black" style={{ color: selectedRoute.fillPct >= 90 ? "#FCA5A5" : GOLD }}>{selectedRoute.seatsRemaining} seats left</span>
                  </div>
                  <ProgressBar pct={selectedRoute.fillPct} color={selectedRoute.fillPct >= 90 ? "#EF4444" : GOLD} />
                  <p className="text-white/40 text-[10px]">When all seats are filled, VMS pays {selectedRoute.operator} and tickets are issued to all passengers.</p>
                </div>
              </div>
            </div>

            {/* Description + includes */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
              <p className="text-sm text-gray-700 leading-relaxed">{selectedRoute.description}</p>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">What&apos;s included</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {selectedRoute.includes.map((inc, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: GREEN }} />{inc}
                    </div>
                  ))}
                </div>
              </div>
              {selectedRoute.visaRequired && (
                <div className="rounded-xl p-4" style={{ background: "#F3E8FF", border: "1px solid #DDD6FE" }}>
                  <p className="text-sm font-bold text-purple-800 flex items-center gap-2"><Globe className="w-4 h-4" />Visa required for {selectedRoute.visaCountry}</p>
                  <p className="text-xs text-purple-700 mt-1">VMS can assist with your visa application. We handle document preparation and submission guidance.</p>
                  <button onClick={() => { setVisaForm(f => ({ ...f, country: selectedRoute.visaCountry ?? "", travelDate: selectedRoute.departureDate, returnDate: selectedRoute.returnDate })); setScreen("visa"); }}
                    className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: P }}>
                    Start Visa Application →
                  </button>
                </div>
              )}
            </div>

            {/* CTA */}
            <button onClick={() => setScreen("book")} disabled={selectedRoute.full}
              className="w-full py-4 rounded-2xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-50 shadow-lg"
              style={{ background: selectedRoute.full ? "#6B7280" : `linear-gradient(135deg,${P},#9585EA)` }}>
              {selectedRoute.full ? "Route Full — Join Waitlist" : `Book My Seat — ${fmt(selectedRoute.pricePerSeat)}`}
            </button>
          </div>
        )}

        {/* ══ BOOKING FORM ══════════════════════════════════════════════════════ */}
        {screen === "book" && selectedRoute && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-black text-gray-900">Book Your Seat</h1>
              <p className="text-sm text-gray-500">{selectedRoute.origin} → {selectedRoute.destination} · {fmtDate(selectedRoute.departureDate)}</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Full name *</label>
                  <input className={inputCls} placeholder="As per ID/passport" value={bkForm.name} onChange={e => setBkForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Mobile number *</label>
                  <input className={inputCls} placeholder="+27 ..." value={bkForm.phone} onChange={e => setBkForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Email address *</label>
                  <input type="email" className={inputCls} placeholder="email@domain.com" value={bkForm.email} onChange={e => setBkForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">SA ID / Passport number</label>
                  <input className={inputCls} placeholder="ID or passport number" value={bkForm.idNumber} onChange={e => setBkForm(f => ({ ...f, idNumber: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Number of seats</label>
                  <select className={inputCls} value={bkForm.seats} onChange={e => setBkForm(f => ({ ...f, seats: e.target.value }))}>
                    {[1,2,3,4].map(n => <option key={n} value={n}>{n} seat{n > 1 ? "s" : ""} — {fmt(selectedRoute.pricePerSeat * n)}</option>)}
                  </select></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Payment method</label>
                  <select className={inputCls} value={bkForm.method} onChange={e => setBkForm(f => ({ ...f, method: e.target.value }))}>
                    <option value="vink_wallet">Vink Wallet</option>
                    <option value="card">Vink Card</option>
                    <option value="eft">EFT / Bank transfer</option>
                  </select></div>
              </div>
              <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Special requests (optional)</label>
                <textarea className={inputCls + " resize-none"} rows={2} placeholder="Dietary requirements, accessibility needs, etc." value={bkForm.requests} onChange={e => setBkForm(f => ({ ...f, requests: e.target.value }))} /></div>
            </div>

            {/* Price summary */}
            <div className="bg-purple-50 rounded-2xl border border-purple-200 p-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-700">{bkForm.seats} × seat @ {fmt(selectedRoute.pricePerSeat)}</span>
                <span className="font-bold text-gray-900">{fmt(selectedRoute.pricePerSeat * +bkForm.seats)}</span>
              </div>
              <div className="flex justify-between mb-2 text-xs text-gray-500">
                <span>You save vs retail</span>
                <span className="text-green-600 font-semibold">- {fmt((selectedRoute.originalPrice - selectedRoute.pricePerSeat) * +bkForm.seats)}</span>
              </div>
              <div className="border-t border-purple-200 pt-2 flex justify-between">
                <span className="font-black text-gray-900">Total to pay now</span>
                <span className="font-black text-xl" style={{ color: P }}>{fmt(selectedRoute.pricePerSeat * +bkForm.seats)}</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">Payment is held by VMS until the route group is full. If the route is cancelled, you receive a full refund to your Vink wallet.</p>
            </div>

            {bkError && <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold text-red-700 bg-red-50 border border-red-200"><AlertTriangle className="w-4 h-4" />{bkError}</div>}

            <button onClick={submitBooking} disabled={bkLoading}
              className="w-full py-4 rounded-2xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-60 shadow-lg flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
              {bkLoading ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Processing…</> : `Confirm Booking — ${fmt(selectedRoute.pricePerSeat * +bkForm.seats)}`}
            </button>
          </div>
        )}

        {/* ══ BOOKING SUCCESS ════════════════════════════════════════════════════ */}
        {screen === "bookSuccess" && confirmedBooking && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-green-200 p-8 text-center space-y-4 shadow-sm">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: "#D1FAE5" }}>
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900">Seat Reserved!</h2>
                <p className="text-gray-500 text-sm mt-1">Your club travel seat has been secured.</p>
              </div>
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "#F3F0FB" }}>
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Booking reference</p>
                <p className="font-black text-xl" style={{ color: P }}>{String(confirmedBooking.referenceNumber)}</p>
                <p className="text-xs text-gray-500">Confirmation sent to {String(confirmedBooking.email)}</p>
              </div>
              {selectedRoute && (
                <div className="text-left rounded-xl p-4 bg-gray-50 space-y-2 text-sm">
                  {[
                    ["Route", `${selectedRoute.origin} → ${selectedRoute.destination}`],
                    ["Departure", fmtDate(selectedRoute.departureDate)],
                    ["Return", fmtDate(selectedRoute.returnDate)],
                    ["Seats", String(confirmedBooking.seatCount)],
                    ["Total paid", fmt(Number(confirmedBooking.totalAmount))],
                    ["Status", "Confirmed — awaiting group completion"],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between">
                      <span className="text-gray-500">{l}</span>
                      <span className="font-semibold text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {selectedRoute?.visaRequired && (
                  <button onClick={() => setScreen("visa")} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: "#7C3AED" }}>
                    <Globe className="w-4 h-4 inline mr-1.5" />Apply for {selectedRoute.visaCountry} Visa Now
                  </button>
                )}
                <button onClick={() => { setScreen("home"); setConfirmedBooking(null); }}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: P }}>
                  Back to Club Travel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ VISA APPLICATION ══════════════════════════════════════════════════ */}
        {screen === "visa" && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-black text-gray-900">Visa Application Assistance</h1>
              <p className="text-sm text-gray-500">VMS helps you prepare and submit your visa application. We handle document guidance and follow-up.</p>
            </div>

            {/* Visa types */}
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { country: "USA", flag: "🇺🇸", fee: "R4,850", time: "4–8 weeks", type: "B-1/B-2 Tourist Visa" },
                { country: "United Kingdom", flag: "🇬🇧", fee: "R3,200", time: "3–5 weeks", type: "Standard Visitor Visa" },
                { country: "Schengen", flag: "🇪🇺", fee: "R2,800", time: "2–4 weeks", type: "Schengen Tourist Visa" },
                { country: "UAE (Dubai)", flag: "🇦🇪", fee: "R0", time: "On arrival", type: "Visa on Arrival (SA citizens)" },
                { country: "Australia", flag: "🇦🇺", fee: "R3,600", time: "4–8 weeks", type: "Tourist Visa (Subclass 600)" },
                { country: "Canada", flag: "🇨🇦", fee: "R3,800", time: "4–8 weeks", type: "Temporary Resident Visa" },
              ].map((v, i) => (
                <button key={i} onClick={() => setVisaForm(f => ({ ...f, country: v.country }))}
                  className="p-3 rounded-xl border-2 text-left transition-all hover:border-purple-300"
                  style={{ borderColor: visaForm.country === v.country ? P : "#E5E7EB", background: visaForm.country === v.country ? P+"08" : "#fff" }}>
                  <span className="text-2xl block mb-1">{v.flag}</span>
                  <p className="text-xs font-black text-gray-900">{v.country}</p>
                  <p className="text-[10px] text-gray-500">{v.type}</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: P }}>Fee: {v.fee} · {v.time}</p>
                </button>
              ))}
            </div>

            {/* Visa form */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-black text-gray-800">Applicant Details</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Full name (as per passport) *</label>
                  <input className={inputCls} placeholder="First Middle Surname" value={visaForm.name} onChange={e => setVisaForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Email address *</label>
                  <input type="email" className={inputCls} placeholder="email@domain.com" value={visaForm.email} onChange={e => setVisaForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Mobile number</label>
                  <input className={inputCls} placeholder="+27 ..." value={visaForm.phone} onChange={e => setVisaForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Passport number *</label>
                  <input className={inputCls} placeholder="A12345678" value={visaForm.passport} onChange={e => setVisaForm(f => ({ ...f, passport: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Passport expiry date</label>
                  <input type="date" className={inputCls} value={visaForm.passportExpiry} onChange={e => setVisaForm(f => ({ ...f, passportExpiry: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Destination country *</label>
                  <select className={inputCls} value={visaForm.country} onChange={e => setVisaForm(f => ({ ...f, country: e.target.value }))}>
                    <option value="">Select country…</option>
                    {["USA","United Kingdom","Schengen","UAE (Dubai)","Australia","Canada","China","Japan","India","Brazil"].map(c => <option key={c}>{c}</option>)}
                  </select></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Travel date</label>
                  <input type="date" className={inputCls} value={visaForm.travelDate} onChange={e => setVisaForm(f => ({ ...f, travelDate: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Return date</label>
                  <input type="date" className={inputCls} value={visaForm.returnDate} onChange={e => setVisaForm(f => ({ ...f, returnDate: e.target.value }))} /></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Purpose of visit</label>
                  <select className={inputCls} value={visaForm.purpose} onChange={e => setVisaForm(f => ({ ...f, purpose: e.target.value }))}>
                    <option value="tourism">Tourism / Holiday</option>
                    <option value="business">Business</option>
                    <option value="study">Study</option>
                    <option value="medical">Medical treatment</option>
                    <option value="family">Visiting family / friends</option>
                    <option value="transit">Transit</option>
                  </select></div>
                <div><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Employment status</label>
                  <select className={inputCls} value={visaForm.employment} onChange={e => setVisaForm(f => ({ ...f, employment: e.target.value }))}>
                    <option value="employed">Employed</option>
                    <option value="self_employed">Self-employed / Business owner</option>
                    <option value="student">Student</option>
                    <option value="retired">Retired</option>
                    <option value="unemployed">Unemployed</option>
                  </select></div>
                <div className="sm:col-span-2"><label className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">Accommodation in destination</label>
                  <input className={inputCls} placeholder="Hotel name / Airbnb / Host address / invitation letter reference" value={visaForm.accommodation} onChange={e => setVisaForm(f => ({ ...f, accommodation: e.target.value }))} /></div>
              </div>

              {/* Required documents */}
              <div className="rounded-xl p-4" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                <p className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-2"><Shield className="w-4 h-4" />Documents you will need to provide</p>
                <ul className="space-y-1.5">
                  {["Certified copy of passport (all pages)", "Proof of accommodation (hotel booking / invitation letter)", "Bank statements (last 3 months)", "Proof of employment / business registration", "Return flight booking confirmation", "Travel insurance certificate", "Passport-size photographs (white background)"].map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-orange-700">
                      <span className="mt-0.5 flex-shrink-0 font-bold text-orange-500">→</span>{d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <button onClick={submitVisa} disabled={visaLoading || !visaForm.name || !visaForm.email || !visaForm.passport || !visaForm.country}
              className="w-full py-4 rounded-2xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-50 shadow-lg flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg,#7C3AED,#9333EA)` }}>
              {visaLoading ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting…</> : "Submit Visa Application"}
            </button>
          </div>
        )}

        {/* ══ VISA SUCCESS ══════════════════════════════════════════════════════ */}
        {screen === "visaSuccess" && confirmedVisa && (
          <div className="bg-white rounded-2xl border border-purple-200 p-8 text-center space-y-4 shadow-sm">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto text-4xl" style={{ background: "#F3E8FF" }}>🛂</div>
            <div>
              <h2 className="text-2xl font-black text-gray-900">Visa Application Received!</h2>
              <p className="text-gray-500 text-sm mt-1">Our visa team will contact you within 1 business day.</p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "#F3F0FB" }}>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">Reference number</p>
              <p className="font-black text-xl" style={{ color: P }}>{String(confirmedVisa.referenceNumber)}</p>
              <p className="text-xs text-gray-500 mt-1">Destination: <strong>{String(confirmedVisa.destinationCountry)}</strong> · Processing fee: <strong>{fmt(Number(confirmedVisa.processingFee))}</strong></p>
            </div>
            <div className="text-left rounded-xl p-4 bg-orange-50 border border-orange-200">
              <p className="text-sm font-bold text-orange-800 mb-2">Next steps</p>
              <ol className="space-y-1">
                {["VMS will email you a document checklist within 24 hours", "Upload or drop off all required documents", "VMS prepares and submits your application", "Track status via your VMS app", "Receive your visa directly from the consulate"].map((s, i) => (
                  <li key={i} className="text-xs text-orange-700 flex items-start gap-2">
                    <span className="font-black text-orange-400 flex-shrink-0">{i + 1}.</span>{s}
                  </li>
                ))}
              </ol>
            </div>
            <button onClick={() => { setScreen("home"); setConfirmedVisa(null); }}
              className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: P }}>
              Back to Club Travel
            </button>
          </div>
        )}

        {/* ══ MY BOOKINGS ════════════════════════════════════════════════════════ */}
        {screen === "myBookings" && (
          <div className="space-y-4">
            <h1 className="text-xl font-black text-gray-900">My Bookings</h1>
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Enter your email to load bookings" value={bkForm.email} onChange={e => setBkForm(f => ({ ...f, email: e.target.value }))} />
              <button onClick={loadMyBookings} className="px-4 py-3 rounded-xl text-sm font-bold text-white flex-shrink-0" style={{ background: P }}>Search</button>
            </div>
            {myBookings.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No bookings found for that email.</p>
              </div>
            ) : myBookings.map((b: Record<string,unknown>, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-bold text-gray-500">{String((b.route as Record<string,unknown>)?.type ?? "").toUpperCase()} · {String(b.referenceNumber)}</p>
                    <p className="font-black text-gray-900">{String((b.route as Record<string,unknown>)?.origin ?? "")} → {String((b.route as Record<string,unknown>)?.destination ?? "")}</p>
                    <p className="text-sm text-gray-600">{fmtDate(String((b.route as Record<string,unknown>)?.departureDate ?? ""))} → {fmtDate(String((b.route as Record<string,unknown>)?.returnDate ?? ""))}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${String(b.status) === "confirmed" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {String(b.status)}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t border-gray-50 pt-3">
                  <span className="text-gray-500">{String(b.seatCount)} seat{Number(b.seatCount) > 1 ? "s" : ""} · {String(b.passengerName)}</span>
                  <span className="font-black" style={{ color: P }}>{fmt(Number(b.totalAmount))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
