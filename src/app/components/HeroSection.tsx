import { useState, useEffect } from "react";
import heroImage1 from "../../imports/Picture1-1.png";
import heroImage2 from "../../imports/Picture1.png";
import heroImage3 from "../../imports/Picture2.png";
import heroImage4 from "../../imports/Picture6-2.png";
import heroImage5 from "../../imports/Picture7.png";

// ─── Per-slide content ────────────────────────────────────────────────────────
const SLIDES = [
  {
    image:   heroImage1,
    eyebrow: "South Africa's first transport-native digital bank",
    eyebrowDot: "bg-green-400",
    headline: <>Banking Built for the<br /><span className="relative inline-block"><span className="relative z-10">Way South Africa Moves.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Open your Vink account in minutes, earn rewards on every tap, and access money wherever your journey takes you.",
    ctas: [
      { label: "Get Your Vink Card", style: { background: "#F5A623", boxShadow: "0 6px 20px rgba(245,166,35,.4)" } },
      { label: "See How It Works",   style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "250,000+", label: "AFC Devices Deployed" },
      { value: "15M",      label: "Daily Commuters Served" },
      { value: "4.8 ★",   label: "App Store Rating" },
    ],
  },
  {
    image:   heroImage2,
    eyebrow: "VMS Personal Banking",
    eyebrowDot: "bg-blue-400",
    headline: <>Shop. Pay. Save.<br /><span className="relative inline-block"><span className="relative z-10">All on One Card.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Tap to buy groceries, pay your taxi fare, earn VinkPoints on every rand spent — and manage it all from the Vink app.",
    ctas: [
      { label: "Open an Account",  style: { background: "#F5A623", boxShadow: "0 6px 20px rgba(245,166,35,.4)" } },
      { label: "Explore Cards",    style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "R0",     label: "Annual fee — forever" },
      { value: "2,100+", label: "Partner merchants" },
      { value: "1% CB",  label: "Cashback on all spend" },
    ],
  },
  {
    image:   heroImage3,
    eyebrow: "VMS MVNO — Global Connectivity",
    eyebrowDot: "bg-orange-400",
    headline: <>🌍 One SIM.<br /><span className="relative inline-block"><span className="relative z-10">Every Country.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Stop paying a fortune every time you cross a border. With the Vink Global SIM, international calls sound — and cost — just like a local call, no matter where in the world you are.",
    bullets: [
      "Works in 190+ countries",
      "No roaming fees — ever",
      "Instant activation",
      "Keep your existing number",
    ],
    ctas: [
      { label: "📲 Get Your Global SIM Today", style: { background: "#F5A623", boxShadow: "0 6px 20px rgba(245,166,35,.4)" } },
      { label: "See Coverage Map",              style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "190+",   label: "Countries covered" },
      { value: "R0",     label: "Roaming fees" },
      { value: "Instant", label: "SIM activation" },
    ],
  },
  {
    image:   heroImage4,
    eyebrow: "VMS Corporate & Transport Banking",
    eyebrowDot: "bg-teal-400",
    headline: <>The Bank Built<br /><span className="relative inline-block"><span className="relative z-10">for Fleet Operators.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Taxi associations, bus operators, and logistics companies — manage every driver wallet, fuel spend, and route payment from one business account with R0.50 per transaction.",
    ctas: [
      { label: "Open a Business Account", style: { background: "#F5A623", boxShadow: "0 6px 20px rgba(245,166,35,.4)" } },
      { label: "Learn More",              style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "R0.50",  label: "Per taxi transaction" },
      { value: "50",     label: "Staff cards per account" },
      { value: "R0",     label: "Monthly fee — first 12m" },
    ],
  },
  {
    image:   heroImage5,
    eyebrow: "Vink Go — Travel Booking",
    eyebrowDot: "bg-pink-400",
    headline: <>Travel Smarter.<br /><span className="relative inline-block"><span className="relative z-10">Spend Less Everywhere.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#F5A623" }} /></span></>,
    body: "Book your taxi, bus, flight, or hotel from one app — and pay with your Vink card at local rates in 175+ countries. No cross-border fees. No surprises.",
    ctas: [
      { label: "Download Vink Go",  style: { background: "#F5A623", boxShadow: "0 6px 20px rgba(245,166,35,.4)" } },
      { label: "See Our Network",   style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "175+",  label: "Countries, no fees" },
      { value: "55M+",  label: "Merchant locations" },
      { value: "24/7",  label: "Support, always on" },
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
      style={{ background: "linear-gradient(135deg,#3B2D9E 0%,#5B4EC7 40%,#7B6FE8 75%,#9B8BF0 100%)" }}>
      {/* Decorative orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle,#fff 0%,transparent 70%)", transform: "translate(30%,-30%)" }} />
      <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle,#B8A9F5 0%,transparent 70%)", transform: "translate(-40%,40%)" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20 lg:py-24 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">

          {/* ── Text side — fades with the slide ── */}
          <div
            className="text-center md:text-left transition-all duration-400"
            style={{ opacity: fading ? 0 : 1, transform: fading ? "translateY(8px)" : "translateY(0)" }}
          >
            {/* Eyebrow */}
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-5"
              style={{ background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)" }}>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${slide.eyebrowDot}`} />
              {slide.eyebrow}
            </span>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.1] mb-5 tracking-tight">
              {slide.headline}
            </h1>

            {/* Body */}
            <p className="text-white/75 text-base sm:text-lg mb-5 leading-relaxed max-w-md mx-auto md:mx-0">
              {slide.body}
            </p>

            {/* Optional bullet list (SIM slide) */}
            {slide.bullets && (
              <ul className="mb-6 space-y-1.5 max-w-xs mx-auto md:mx-0 text-left">
                {slide.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-white/85 font-medium">
                    <span className="text-green-400 font-black text-base">✅</span>
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {/* CTAs */}
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-10">
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
              style={{ background: "radial-gradient(circle,#B8A9F5,transparent)" }} />
            <img
              key={current}
              src={slide.image}
              alt={slide.eyebrow}
              className="relative z-10 w-full max-w-xs sm:max-w-sm md:max-w-md object-contain drop-shadow-2xl"
              draggable={false}
              style={{ transition: "opacity 0.4s ease", opacity: fading ? 0 : 1 }}
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
