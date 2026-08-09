import { useState, useEffect } from "react";
import heroCardPhone from "../../imports/HeroCardPhone.png";
import heroTraveler from "../../imports/HeroTraveler.png";
import heroGlobalSim from "../../imports/HeroGlobalSim.png";
import heroBus from "../../imports/HeroBus.png";
import heroPlane from "../../imports/HeroPlane.png";
import heroValidator from "../../imports/HeroValidator.png";

// ─── Per-slide content ────────────────────────────────────────────────────────
const SLIDES = [
  {
    image:   heroCardPhone,
    eyebrow: "VINK Card — Now in Your Pocket",
    headline: <>All the benefits of Card,<br /><span className="relative inline-block"><span className="relative z-10">on your phone.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#A78BFA" }} /></span></>,
    body: "Manage, track and enjoy exclusive benefits anytime, anywhere.",
    ctas: [
      { label: "💳 Start Now",  style: { background: "#7C3AED", boxShadow: "0 6px 20px rgba(124,58,237,.4)" } },
      { label: "▶ Learn more", style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "24/7",  label: "Card access, anytime" },
      { value: "0",     label: "Hidden fees" },
      { value: "1-Tap", label: "Track every benefit" },
    ],
  },
  {
    image:   heroTraveler,
    eyebrow: "Vink Go — Vacation Booking",
    headline: <>Your vacation<br /><span className="relative inline-block"><span className="relative z-10">awaits!</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Discover breathtaking destinations, amazing experiences and memories that last a lifetime.",
    ctas: [
      { label: "🧳 Plan Your Getaway →", style: { background: "#EA6A0E", boxShadow: "0 6px 20px rgba(234,106,14,.4)" } },
      { label: "See How It Works",       style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "1000s", label: "Destinations worldwide" },
      { value: "24/7",  label: "Support, anytime" },
      { value: "Best",  label: "Deals on flights and stays" },
    ],
  },
  {
    image:   heroGlobalSim,
    eyebrow: "VINK MVNO — Global Connectivity",
    headline: <>All the benefits of SIM,<br /><span className="relative inline-block"><span className="relative z-10">on your phone.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Stay connected anywhere in the world with reliable data, clear calls and seamless connectivity.",
    ctas: [
      { label: "💳 Get Your SIM", style: { background: "#B91C1C", boxShadow: "0 6px 20px rgba(185,28,28,.4)" } },
      { label: "▶ Learn More",    style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "200+",    label: "Countries covered" },
      { value: "4G/5G",   label: "High-speed data" },
      { value: "24/7",    label: "Customer support" },
    ],
  },
  {
    image:   heroBus,
    eyebrow: "VINK Go — Bus Travel",
    headline: <>Driven by<br /><span className="relative inline-block"><span className="relative z-10">excellence.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Safe. Reliable. Comfortable. Your journey, our priority.",
    ctas: [
      { label: "🎫 Book Your Ticket Now", style: { background: "#7A1420", boxShadow: "0 6px 20px rgba(122,20,32,.5)" } },
      { label: "Learn More",              style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "Safe",  label: "Your safety is our promise" },
      { value: "24/7",  label: "Support, anytime, anywhere" },
      { value: "Wide",  label: "Coverage, nationwide" },
    ],
  },
  {
    image:   heroPlane,
    eyebrow: "Vink Go — Travel Booking",
    headline: <>Your journey<br /><span className="relative inline-block"><span className="relative z-10">takes flight.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Book your next adventure with ease. Best deals. Trusted service. Unforgettable journeys.",
    ctas: [
      { label: "✈ Book Your Ticket Now", style: { background: "#0B1F4D", boxShadow: "0 6px 20px rgba(11,31,77,.5)" } },
      { label: "See Our Network",        style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "30%",  label: "Off on selected flights" },
      { value: "Best", label: "Fares, worldwide" },
      { value: "24/7", label: "Support, always on" },
    ],
  },
  {
    image:   heroValidator,
    eyebrow: "VINK AFC — Today's Market Multi-ticketing Validator",
    headline: <>Multi-ticketing<br /><span className="relative inline-block"><span className="relative z-10">validator.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Smarter, faster and cashless payments for a seamless travel experience — multi-channel, integrated in one system.",
    ctas: [
      { label: "Experience Smart Travel →", style: { background: "#C9861F", boxShadow: "0 6px 20px rgba(201,134,31,.4)" } },
      { label: "See How It Works",          style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "NFC",  label: "Card, QR & mobile payments" },
      { value: "R/T",  label: "Balance & GPS, in real time" },
      { value: "1",    label: "Card. Endless journeys." },
    ],
  },
];

export function HeroSection() {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent(c => (c + 1) % SLIDES.length);
        setFading(false);
      }, 400);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const goTo = (i: number) => {
    if (i === current) return;
    setFading(true);
    setTimeout(() => { setCurrent(i); setFading(false); }, 400);
  };

  const slide = SLIDES[current];

  return (
    <section className="text-white overflow-hidden relative"
      style={{ background: "linear-gradient(160deg,#150A35 0%,#2E1065 45%,#4C2A85 75%,#6B3FA0 100%)" }}>
      {/* Decorative orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle,#fff 0%,transparent 70%)", transform: "translate(30%,-30%)" }} />
      <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle,#A78BFA 0%,transparent 70%)", transform: "translate(-40%,40%)" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 lg:py-14 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">

          {/* ── Text side — fades with the slide ── */}
          <div
            className="text-center md:text-left transition-all duration-400"
            style={{ opacity: fading ? 0 : 1, transform: fading ? "translateY(8px)" : "translateY(0)" }}
          >
            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.1] mb-5 tracking-tight">
              {slide.headline}
            </h1>

            {/* Body */}
            <p className="text-white/75 text-base sm:text-lg mb-5 leading-relaxed max-w-md mx-auto md:mx-0">
              {slide.body}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-7">
              {slide.ctas.map((cta, i) => (
                <button key={i}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg"
                  style={cta.style as React.CSSProperties}>
                  {cta.label}
                </button>
              ))}
            </div>

            {/* Trust stats */}
            <div className="flex justify-center md:justify-start gap-8">
              {slide.trust.map((t, i) => (
                <div key={i} className="text-center md:text-left">
                  <p className="text-xl font-black" style={{ color: "#F5C842" }}>{t.value}</p>
                  <p className="text-white/60 text-[11px] font-medium mt-0.5">{t.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Image side ── */}
          <div className="flex justify-center md:justify-end relative">
            <div className="absolute inset-0 rounded-full opacity-20 blur-3xl pointer-events-none"
              style={{ background: "radial-gradient(circle,#A78BFA,transparent)" }} />
            <img
              key={current}
              src={slide.image}
              alt={slide.eyebrow}
              className="relative z-10 w-full max-w-sm sm:max-w-md md:max-w-lg object-contain drop-shadow-2xl"
              draggable={false}
              style={{
                transition: "opacity 0.4s ease", opacity: fading ? 0 : 1,
                maskImage: "radial-gradient(ellipse 68% 68% at 50% 50%, black 45%, transparent 92%)",
                WebkitMaskImage: "radial-gradient(ellipse 68% 68% at 50% 50%, black 45%, transparent 92%)",
              }}
            />

            {/* Dot indicators */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-2 pb-1 z-20">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{ width: current === i ? 20 : 6, background: current === i ? "#F5A623" : "rgba(255,255,255,0.4)" }}
                />
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
