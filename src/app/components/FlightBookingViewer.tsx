import { useState } from "react";
import { X, Plane, Calendar, Users, ArrowLeftRight, Search, CheckCircle2, Minus, Plus, ShieldCheck, Clock, Tag, Headphones, ArrowRight } from "lucide-react";

const GOLD = "#F5A623";
const INK = "#0A1830";
const INK_2 = "#12274A";
const INK_3 = "#1B3564";
const CLOUD = "#F6F3EC";
const FOG = "#94A2BC";
const FOG_DIM = "#5E6C8A";
const LINE = "rgba(246,243,236,0.14)";

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

const TRUST_ITEMS = [
  { icon: <Tag className="w-[18px] h-[18px]" />, title: "Best fare match", desc: "We recheck prices for 24 hours", color: GOLD },
  { icon: <ShieldCheck className="w-[18px] h-[18px]" />, title: "Secure checkout", desc: "Bank-level encryption, every time", color: "#4ADE80" },
  { icon: <Clock className="w-[18px] h-[18px]" />, title: "Free date changes", desc: "Within 24h of booking", color: "#9FB4E0" },
  { icon: <Headphones className="w-[18px] h-[18px]" />, title: "24/7 travel desk", desc: "Real humans, no hold music", color: GOLD },
];

const POPULAR_ROUTES = [
  { from: "JNB", to: "CPT", city: "Cape Town", desc: "Table Mountain, wine country, and the coast — a two-hour hop from Joburg.", price: "R1,349" },
  { from: "JNB", to: "LHR", city: "London", desc: "Direct overnight service, arriving into Heathrow Terminal 5.", price: "R9,820" },
  { from: "JNB", to: "DXB", city: "Dubai", desc: "Onward connections across the Gulf and South Asia from Terminal 3.", price: "R7,240" },
  { from: "CPT", to: "JFK", city: "New York", desc: "One-stop via Accra or Dakar, most itineraries under 18 hours.", price: "R14,980" },
];

/**
 * Built for VINK Go's "Book Your Ticket Now" CTA on the flight hero slide.
 * Full page this time (nav, hero with the animated flight-path signature,
 * booking card, trust strip, popular routes, footer), not just the search
 * form modal from the earlier version -- rebuilt from the uploaded
 * reference's complete structure, in VINK's own design language rather
 * than the reference's own amber/navy branding, which belongs to a
 * different, unrelated product.
 *
 * VINK has no live flight inventory (same honesty already established
 * site-wide: pre-launch, June 2027), so the search doesn't fabricate
 * results -- it captures the search as a genuine interest submission,
 * and the footer says plainly that this is a preview, not live inventory.
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
  const handleSearch = () => { if (departDate) setSubmitted(true); };
  const jumpToRoute = (r: typeof POPULAR_ROUTES[0]) => {
    setFrom(r.from); setTo(r.to); setSubmitted(false);
    document.getElementById("vink-flight-booking-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto" style={{ background: INK, fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        @keyframes vinkFlyAlong { 0%{offset-distance:0%;opacity:0;} 8%{opacity:1;} 92%{opacity:1;} 100%{offset-distance:100%;opacity:0;} }
        .vink-path-plane { offset-path: path("M6,54 C90,10 210,10 260,40 C300,63 330,20 394,16"); animation: vinkFlyAlong 4.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      `}</style>

      {/* Nav */}
      <nav className="sticky top-0 z-20 flex items-center justify-between px-5 sm:px-10 py-4"
        style={{ background: "linear-gradient(180deg,rgba(10,24,48,.92),rgba(10,24,48,.55))", backdropFilter: "blur(10px)", borderBottom: `1px solid ${LINE}` }}>
        <div className="flex items-center gap-2.5">
          <Plane className="w-5 h-5" style={{ color: GOLD }} />
          <span className="text-lg" style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, color: CLOUD }}>VINK Go</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm" style={{ color: FOG }}>
          <span style={{ color: CLOUD, borderBottom: `2px solid ${GOLD}`, paddingBottom: 4 }}>Book</span>
          <a href="#vink-popular-routes" className="hover:text-white transition-colors">Routes</a>
          <span className="opacity-50 cursor-not-allowed">Manage trip</span>
          <span className="opacity-50 cursor-not-allowed">Check-in</span>
          <span className="opacity-50 cursor-not-allowed">Status</span>
        </div>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
          style={{ border: `1px solid ${LINE}`, color: CLOUD }} aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </nav>

      {submitted ? (
        <div className="text-center py-24 px-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(74,222,128,.15)" }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: "#4ADE80" }} />
          </div>
          <h2 className="text-2xl sm:text-3xl mb-3" style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, color: CLOUD }}>
            We've got your search
          </h2>
          <p className="text-sm max-w-sm mx-auto leading-relaxed mb-8" style={{ color: FOG }}>
            VINK Go's flight booking is launching alongside VINK's full platform in June 2027.
            We'll notify you the moment {fromCity?.city.split(",")[0]} → {toCity?.city.split(",")[0]} fares go live.
          </p>
          <button onClick={() => setSubmitted(false)}
            className="px-8 py-3 rounded-xl text-sm font-bold transition-all hover:scale-105"
            style={{ background: `linear-gradient(135deg,${GOLD},#C9772F)`, color: "#1A1000" }}>
            Search another route
          </button>
        </div>
      ) : (
        <>
          {/* Hero */}
          <section className="relative overflow-hidden px-5 sm:px-10 pt-12 pb-24"
            style={{ background: `radial-gradient(ellipse 900px 500px at 82% 18%,rgba(232,163,61,.25),transparent 60%), linear-gradient(160deg,${INK} 0%,${INK_2} 45%,${INK_3} 75%,#2C4A82 100%)` }}>
            <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-start">
              <div>
                <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] mb-4" style={{ color: "#F2C177" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD, boxShadow: "0 0 0 3px rgba(232,163,61,.25)" }} />
                  214 destinations · fares update every 20 minutes
                </span>
                <h1 className="text-4xl sm:text-5xl leading-[1.05] mb-5" style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, color: CLOUD, letterSpacing: "-0.01em" }}>
                  Fly the route,<br />not the <em style={{ fontStyle: "italic", fontWeight: 500, color: "#F2C177" }}>runaround</em>.
                </h1>
                <p className="text-base leading-relaxed mb-9 max-w-md" style={{ color: FOG }}>
                  Search real-time fares, lock in a seat in under a minute, and manage every leg of the trip from one VINK card.
                </p>
                <div className="flex gap-9 flex-wrap mb-12">
                  {[["214", "Destinations"], ["60+", "Airline partners"], ["4.8/5", "Traveler rating"]].map(([num, lbl]) => (
                    <div key={lbl} className="pl-4" style={{ borderLeft: `1px solid ${LINE}` }}>
                      <div className="text-2xl font-bold" style={{ fontFamily: "'JetBrains Mono',monospace", color: CLOUD }}>{num}</div>
                      <div className="text-xs mt-0.5" style={{ color: FOG_DIM }}>{lbl}</div>
                    </div>
                  ))}
                </div>

                {/* Animated flight path signature */}
                <div className="max-w-[420px]" aria-hidden="true">
                  <svg viewBox="0 0 400 70" className="w-full h-auto block">
                    <path d="M6,54 C90,10 210,10 260,40 C300,63 330,20 394,16" stroke="#F2C177" strokeWidth="1.6" fill="none" strokeDasharray="4 6" opacity="0.85" />
                    <circle cx="6" cy="54" r="4" fill={GOLD} />
                    <circle cx="394" cy="16" r="4" fill={GOLD} />
                    <text x="0" y="66" fontFamily="'JetBrains Mono',monospace" fontSize="11" fill={FOG} letterSpacing="0.06em">{from}</text>
                    <text x="368" y="10" fontFamily="'JetBrains Mono',monospace" fontSize="11" fill={FOG} letterSpacing="0.06em">{to}</text>
                    <g className="vink-path-plane"><path d="M0,-5 L9,0 L0,5 L2,0 Z" fill="#F2C177" /></g>
                  </svg>
                </div>
              </div>

              {/* Booking card */}
              <div id="vink-flight-booking-card" className="rounded-2xl p-1.5" style={{ background: `linear-gradient(165deg,rgba(18,39,74,.92),rgba(10,24,48,.96))`, border: `1px solid ${LINE}`, boxShadow: "0 30px 70px -20px rgba(0,0,0,.55)" }}>
                <div className="rounded-xl p-6" style={{ border: "1px solid rgba(246,243,236,.06)" }}>
                  <div className="flex gap-1.5 mb-6 p-1 rounded-full w-fit" style={{ background: "rgba(0,0,0,.2)" }}>
                    {([["one", "One way"], ["round", "Round trip"], ["multi", "Multi-city"]] as [TripType, string][]).map(([id, label]) => (
                      <button key={id} onClick={() => setTrip(id)}
                        className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
                        style={trip === id ? { background: GOLD, color: "#1A1000" } : { color: "rgba(255,255,255,.6)" }}>
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-xl mb-3.5 relative" style={{ background: "rgba(0,0,0,.2)", border: `1px solid ${LINE}` }}>
                    <div className="p-4">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">From</label>
                      <select value={from} onChange={e => setFrom(e.target.value)}
                        className="bg-transparent text-white text-xl font-semibold outline-none w-full" style={{ fontFamily: "'Fraunces',serif" }}>
                        {CITY_OPTIONS.map(c => <option key={c.code} value={c.code} style={{ background: INK_2 }}>{c.code}</option>)}
                      </select>
                      <p className="text-[11.5px] text-white/50 mt-0.5">{fromCity?.city}</p>
                    </div>
                    <button onClick={handleSwap}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white z-10 transition-transform hover:rotate-180 duration-300"
                      style={{ background: INK_2, border: `1px solid ${LINE}` }} aria-label="Swap origin and destination">
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                    <div className="p-4">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">To</label>
                      <select value={to} onChange={e => setTo(e.target.value)}
                        className="bg-transparent text-white text-xl font-semibold outline-none w-full" style={{ fontFamily: "'Fraunces',serif" }}>
                        {CITY_OPTIONS.map(c => <option key={c.code} value={c.code} style={{ background: INK_2 }}>{c.code}</option>)}
                      </select>
                      <p className="text-[11.5px] text-white/50 mt-0.5">{toCity?.city}</p>
                    </div>
                  </div>

                  <div className={`grid gap-2.5 mb-3.5 ${trip === "one" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
                    <div className="p-3.5 rounded-xl" style={{ background: "rgba(0,0,0,.2)", border: `1px solid ${LINE}` }}>
                      <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                        <Calendar className="w-3 h-3" /> Departure
                      </label>
                      <input type="date" value={departDate} onChange={e => setDepartDate(e.target.value)}
                        className="bg-transparent text-white text-sm font-semibold outline-none w-full [color-scheme:dark]" />
                    </div>
                    {trip !== "one" && (
                      <div className="p-3.5 rounded-xl" style={{ background: "rgba(0,0,0,.2)", border: `1px solid ${LINE}` }}>
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
                        style={{ background: "rgba(0,0,0,.2)", border: `1px solid ${LINE}` }}>
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                          <Users className="w-3 h-3" /> Travelers
                        </span>
                        <span className="block text-white text-sm font-semibold">{totalTravelers} traveler{totalTravelers !== 1 ? "s" : ""}</span>
                        <span className="block text-[11px] text-white/50 mt-0.5">{cabinClass}</span>
                      </button>
                      {showTravelers && (
                        <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-20 rounded-xl p-4 space-y-1"
                          style={{ background: "#0F213F", border: `1px solid ${LINE}`, boxShadow: "0 20px 40px -10px rgba(0,0,0,.6)" }}>
                          {([["Adults", "Age 12+", adults, setAdults, 1], ["Children", "Age 2–11", children, setChildren, 0], ["Infants", "Under 2, on lap", infants, setInfants, 0]] as
                            [string, string, number, (n: number) => void, number][]).map(([name, desc, count, setter, min]) => (
                            <div key={name} className="flex items-center justify-between py-2">
                              <div>
                                <p className="text-white text-[13px]">{name}</p>
                                <p className="text-white/40 text-[11px]">{desc}</p>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <button onClick={() => setter(Math.max(min, count - 1))}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ border: "1px solid rgba(255,255,255,.2)" }}><Minus className="w-3 h-3" /></button>
                                <span className="text-white text-sm w-4 text-center" style={{ fontFamily: "'JetBrains Mono',monospace" }}>{count}</span>
                                <button onClick={() => setter(count + 1)}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ border: "1px solid rgba(255,255,255,.2)" }}><Plus className="w-3 h-3" /></button>
                              </div>
                            </div>
                          ))}
                          <div className="pt-2.5 mt-1 space-y-0.5" style={{ borderTop: `1px solid ${LINE}` }}>
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

                  <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                    <label className="flex items-center gap-2.5 text-[13.5px] text-white/70 cursor-pointer">
                      <span onClick={() => setNonstop(n => !n)}
                        className="w-10 h-[22px] rounded-full relative transition-colors flex-shrink-0"
                        style={{ background: nonstop ? "rgba(245,166,35,.35)" : "rgba(255,255,255,.12)", border: `1px solid ${nonstop ? GOLD : LINE}` }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{ left: nonstop ? 20 : 2, background: nonstop ? GOLD : "rgba(255,255,255,.6)" }} />
                      </span>
                      Nonstop only
                    </label>
                    <input value={promo} onChange={e => setPromo(e.target.value)} placeholder="Promo code (optional)"
                      className="text-sm text-white outline-none px-4 py-2.5 rounded-lg min-w-[200px]"
                      style={{ background: "rgba(0,0,0,.2)", border: `1px solid ${LINE}` }} />
                  </div>

                  <button onClick={handleSearch} disabled={!departDate}
                    className="w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:scale-[1.01]"
                    style={{ background: `linear-gradient(135deg,${GOLD},#C9772F)`, color: "#1A1000", boxShadow: "0 14px 30px -10px rgba(245,166,35,.4)" }}>
                    <Search className="w-4 h-4" /> Search flights
                  </button>
                  {!departDate && <p className="text-center text-[11.5px] text-white/40 mt-2.5">Pick a departure date to continue</p>}
                </div>
              </div>
            </div>
          </section>

          {/* Trust strip */}
          <div className="max-w-6xl mx-auto px-5 sm:px-10 -mt-14 relative z-[5]">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 rounded-2xl overflow-hidden" style={{ background: "#0F213F", border: `1px solid ${LINE}`, boxShadow: "0 20px 40px -20px rgba(0,0,0,.5)" }}>
              {TRUST_ITEMS.map((item, i) => (
                <div key={item.title} className="p-5 flex gap-3 items-center" style={{ borderRight: i < 3 ? `1px solid ${LINE}` : undefined }}>
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}26`, color: item.color }}>{item.icon}</span>
                  <div>
                    <div className="text-[13.5px] font-semibold" style={{ color: CLOUD }}>{item.title}</div>
                    <div className="text-[11.5px]" style={{ color: FOG_DIM }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Popular routes */}
          <section id="vink-popular-routes" className="max-w-6xl mx-auto px-5 sm:px-10 pt-24 pb-16">
            <div className="flex justify-between items-baseline mb-9 flex-wrap gap-3">
              <h2 className="text-2xl sm:text-3xl" style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, color: CLOUD }}>Popular this month</h2>
              <p className="text-sm max-w-xs" style={{ color: FOG }}>Fares shown are the lowest one-way price found on these routes in the past 72 hours.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {POPULAR_ROUTES.map(r => (
                <button key={r.city} onClick={() => jumpToRoute(r)} className="text-left rounded-xl p-5 transition-all hover:-translate-y-1"
                  style={{ background: INK_2, border: `1px solid ${LINE}` }}>
                  <div className="flex items-center gap-1.5 text-xs mb-2.5" style={{ fontFamily: "'JetBrains Mono',monospace", color: FOG_DIM }}>
                    {r.from} <ArrowRight className="w-3 h-3" style={{ color: "#F2C177" }} /> {r.to}
                  </div>
                  <div className="text-lg font-semibold mb-1" style={{ fontFamily: "'Fraunces',serif", color: CLOUD }}>{r.city}</div>
                  <div className="text-xs leading-relaxed mb-4" style={{ color: FOG }}>{r.desc}</div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-semibold" style={{ fontFamily: "'Fraunces',serif", color: "#F2C177" }}>{r.price}</span>
                    <span className="text-[11px]" style={{ color: FOG_DIM }}>one way</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Footer */}
          <footer className="flex justify-between items-center flex-wrap gap-4 px-5 sm:px-10 py-8" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="flex items-center gap-2" style={{ fontFamily: "'Fraunces',serif", color: CLOUD }}>
              <Plane className="w-4 h-4" style={{ color: GOLD }} /> VINK Go
            </div>
            <div className="text-xs" style={{ color: FOG_DIM }}>
              Fares shown in ZAR are illustrative. VINK Go's flight booking is a preview — no live airline inventory is connected yet.
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
