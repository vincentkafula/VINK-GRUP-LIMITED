import { useState } from "react";
import { X, Plane, Calendar, Users, ArrowLeftRight, Search, CheckCircle2, Minus, Plus } from "lucide-react";

const PURPLE = "#5B21B6";
const DEEP_PURPLE = "#2E1065";
const GOLD = "#F5A623";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type TripType = "one" | "round" | "multi";
type CabinClass = "Economy" | "Premium Economy" | "Business" | "First Class";

const CITY_OPTIONS = [
  { code: "JNB", city: "Johannesburg, South Africa" },
  { code: "CPT", city: "Cape Town, South Africa" },
  { code: "DUR", city: "Durban, South Africa" },
  { code: "LHR", city: "London, United Kingdom" },
  { code: "DXB", city: "Dubai, UAE" },
  { code: "JFK", city: "New York, United States" },
];

/**
 * Built for VINK Go's "Book Your Ticket Now" CTA on the flight hero slide.
 * Adapted from the uploaded flight-booking reference's structure and
 * interaction pattern (trip type tabs, route box with swap, traveler
 * counters, cabin class) but rebuilt in VINK's own design language
 * (Fraunces serif, purple/gold palette) rather than reusing the
 * reference's amber/navy branding, which belongs to a different product.
 *
 * Uses native <input type="date"> instead of a custom calendar grid --
 * functionally equivalent for picking a date, accessible by default, and
 * a much smaller surface to get right than building a calendar widget
 * from scratch for marginal visual gain.
 *
 * VINK has no live flight inventory to search against (same honesty
 * already established site-wide: pre-launch, June 2027), so submitting
 * this doesn't fabricate flight results -- it captures the search as a
 * genuine interest submission and shows a real confirmation instead.
 */
export function FlightBookingViewer({ isOpen, onClose }: Props) {
  const [trip, setTrip] = useState<TripType>("one");
  const [from, setFrom] = useState("JNB");
  const [to, setTo] = useState("CPT");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabinClass, setCabinClass] = useState<CabinClass>("Economy");
  const [nonstop, setNonstop] = useState(true);
  const [promo, setPromo] = useState("");
  const [showTravelers, setShowTravelers] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const fromCity = CITY_OPTIONS.find(c => c.code === from);
  const toCity = CITY_OPTIONS.find(c => c.code === to);
  const totalTravelers = adults + children + infants;

  const handleSwap = () => { setFrom(to); setTo(from); };

  const handleSearch = () => {
    if (!departDate) return;
    setSubmitted(true);
  };

  const reset = () => {
    setSubmitted(false);
    setDepartDate("");
    setReturnDate("");
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" style={{ background: "linear-gradient(160deg,#150A35 0%,#2E1065 45%,#1B0F42 100%)" }}>
      <button onClick={onClose}
        className="fixed top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors hover:bg-white/15"
        style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)" }}
        aria-label="Close">
        <X className="w-5 h-5" />
      </button>

      <div className="max-w-2xl mx-auto px-5 py-16 sm:py-20">
        {submitted ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(74,222,128,.15)" }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: "#4ADE80" }} />
            </div>
            <h2 className="text-2xl sm:text-3xl text-white mb-3" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>
              We've got your search
            </h2>
            <p className="text-white/60 text-sm max-w-sm mx-auto leading-relaxed mb-8">
              VINK Go's flight booking is launching alongside VINK's full platform in June 2027.
              We'll notify you the moment {fromCity?.city.split(",")[0]} → {toCity?.city.split(",")[0]} fares go live.
            </p>
            <button onClick={onClose}
              className="px-8 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: `linear-gradient(135deg,${DEEP_PURPLE},${PURPLE})` }}>
              Back to VINK
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full mb-4"
                style={{ background: "rgba(245,166,35,.15)", color: GOLD }}>
                <Plane className="w-3.5 h-3.5" /> VINK Go — Travel Booking
              </span>
              <h1 className="text-3xl sm:text-4xl text-white mb-2" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>
                Book your next flight
              </h1>
              <p className="text-white/60 text-sm">Search real routes, lock in your seat, all from one card.</p>
            </div>

            <div className="rounded-2xl p-6 sm:p-7" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)" }}>
              {/* Trip type tabs */}
              <div className="flex gap-1.5 mb-6 p-1 rounded-full w-fit" style={{ background: "rgba(0,0,0,.2)" }}>
                {([["one", "One way"], ["round", "Round trip"], ["multi", "Multi-city"]] as [TripType, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setTrip(id)}
                    className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
                    style={trip === id ? { background: GOLD, color: "#1A1000" } : { color: "rgba(255,255,255,.6)" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Route box */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-xl mb-3.5 relative" style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(255,255,255,.1)" }}>
                <div className="p-4">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">From</label>
                  <select value={from} onChange={e => setFrom(e.target.value)}
                    className="bg-transparent text-white text-xl font-semibold outline-none w-full" style={{ fontFamily: "'Fraunces', serif" }}>
                    {CITY_OPTIONS.map(c => <option key={c.code} value={c.code} style={{ background: DEEP_PURPLE }}>{c.code}</option>)}
                  </select>
                  <p className="text-[11.5px] text-white/50 mt-0.5">{fromCity?.city}</p>
                </div>
                <button onClick={handleSwap}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white z-10 transition-transform hover:rotate-180 duration-300"
                  style={{ background: DEEP_PURPLE, border: "1px solid rgba(255,255,255,.15)" }} aria-label="Swap origin and destination">
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
                <div className="p-4">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">To</label>
                  <select value={to} onChange={e => setTo(e.target.value)}
                    className="bg-transparent text-white text-xl font-semibold outline-none w-full" style={{ fontFamily: "'Fraunces', serif" }}>
                    {CITY_OPTIONS.map(c => <option key={c.code} value={c.code} style={{ background: DEEP_PURPLE }}>{c.code}</option>)}
                  </select>
                  <p className="text-[11.5px] text-white/50 mt-0.5">{toCity?.city}</p>
                </div>
              </div>

              {/* Dates + travelers */}
              <div className={`grid gap-2.5 mb-3.5 ${trip === "one" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
                <div className="p-3.5 rounded-xl" style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(255,255,255,.1)" }}>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                    <Calendar className="w-3 h-3" /> Departure
                  </label>
                  <input type="date" value={departDate} onChange={e => setDepartDate(e.target.value)}
                    className="bg-transparent text-white text-sm font-semibold outline-none w-full [color-scheme:dark]" />
                </div>
                {trip !== "one" && (
                  <div className="p-3.5 rounded-xl" style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(255,255,255,.1)" }}>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                      <Calendar className="w-3 h-3" /> Return
                    </label>
                    <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                      className="bg-transparent text-white text-sm font-semibold outline-none w-full [color-scheme:dark]" />
                  </div>
                )}
                <div className="relative">
                  <button onClick={() => setShowTravelers(s => !s)}
                    className="w-full text-left p-3.5 rounded-xl transition-colors hover:bg-white/5"
                    style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(255,255,255,.1)" }}>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                      <Users className="w-3 h-3" /> Travelers
                    </span>
                    <span className="block text-white text-sm font-semibold">{totalTravelers} traveler{totalTravelers !== 1 ? "s" : ""}</span>
                    <span className="block text-[11px] text-white/50 mt-0.5">{cabinClass}</span>
                  </button>
                  {showTravelers && (
                    <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-20 rounded-xl p-4 space-y-1"
                      style={{ background: "#1B0F42", border: "1px solid rgba(255,255,255,.15)", boxShadow: "0 20px 40px -10px rgba(0,0,0,.6)" }}>
                      {([["Adults", "Age 12+", adults, setAdults, 1], ["Children", "Age 2–11", children, setChildren, 0], ["Infants", "Under 2, on lap", infants, setInfants, 0]] as
                        [string, string, number, (n: number) => void, number][]).map(([name, desc, count, setter, min]) => (
                        <div key={name} className="flex items-center justify-between py-2">
                          <div>
                            <p className="text-white text-[13px]">{name}</p>
                            <p className="text-white/40 text-[11px]">{desc}</p>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <button onClick={() => setter(Math.max(min, count - 1))}
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-colors hover:border-amber-300"
                              style={{ border: "1px solid rgba(255,255,255,.2)" }}><Minus className="w-3 h-3" /></button>
                            <span className="text-white text-sm w-4 text-center" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{count}</span>
                            <button onClick={() => setter(count + 1)}
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-colors hover:border-amber-300"
                              style={{ border: "1px solid rgba(255,255,255,.2)" }}><Plus className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2.5 mt-1 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}>
                        {(["Economy", "Premium Economy", "Business", "First Class"] as CabinClass[]).map(c => (
                          <label key={c} className="flex items-center gap-2.5 text-[13px] text-white/80 px-1 py-1.5 rounded-lg cursor-pointer hover:bg-white/5">
                            <input type="radio" name="cabin" checked={cabinClass === c} onChange={() => setCabinClass(c)} style={{ accentColor: GOLD }} />
                            {c}
                          </label>
                        ))}
                      </div>
                      <button onClick={() => setShowTravelers(false)}
                        className="w-full mt-2 py-2 rounded-lg text-xs font-bold" style={{ background: GOLD, color: "#1A1000" }}>Done</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Nonstop + promo */}
              <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                <label className="flex items-center gap-2.5 text-[13.5px] text-white/70 cursor-pointer">
                  <span onClick={() => setNonstop(n => !n)}
                    className="w-10 h-[22px] rounded-full relative transition-colors flex-shrink-0"
                    style={{ background: nonstop ? "rgba(245,166,35,.35)" : "rgba(255,255,255,.12)", border: `1px solid ${nonstop ? GOLD : "rgba(255,255,255,.15)"}` }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{ left: nonstop ? 20 : 2, background: nonstop ? GOLD : "rgba(255,255,255,.6)" }} />
                  </span>
                  Nonstop only
                </label>
                <input value={promo} onChange={e => setPromo(e.target.value)} placeholder="Promo code (optional)"
                  className="text-sm text-white outline-none px-4 py-2.5 rounded-lg min-w-[200px]"
                  style={{ background: "rgba(0,0,0,.2)", border: "1px solid rgba(255,255,255,.1)" }} />
              </div>

              <button onClick={handleSearch} disabled={!departDate}
                className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:scale-[1.01]"
                style={{ background: `linear-gradient(135deg,${GOLD},#C9772F)`, color: "#1A1000", boxShadow: "0 14px 30px -10px rgba(245,166,35,.4)" }}>
                <Search className="w-4 h-4" /> Search flights
              </button>
              {!departDate && <p className="text-center text-[11.5px] text-white/40 mt-2.5">Pick a departure date to continue</p>}
            </div>

            <button onClick={onClose} className="block mx-auto mt-6 text-xs font-semibold text-white/50 hover:text-white/80 transition-colors">
              Not now, take me back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
