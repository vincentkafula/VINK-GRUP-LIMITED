import { useState, useEffect } from "react";
import { Pause, Play } from "lucide-react";
import heroCardPhone from "../../imports/HeroCardPhone.webp";
import heroGlobalSim from "../../imports/HeroGlobalSim.webp";
import heroValidator from "../../imports/HeroValidator.webp";
import { BRAND } from "../brand";
import { startApplication } from "../services/startApplication";

type Side = "left" | "right" | "bottom";
const FADE_DIR: Record<Side, string> = { left: "to right", right: "to left", bottom: "to top" };
/** Fade only the sides where the artwork is cut off by its own frame, so the cut dissolves into the hero. The rest of the picture stays whole and sharp. */
const edgeMask = (sides: Side[]) => (sides.length ? sides.map((d) => `linear-gradient(${FADE_DIR[d]}, transparent 0%, #000 14%)`).join(", ") : undefined);

// ─── Per-slide content ────────────────────────────────────────────────────────
const RAW_SLIDES = [
  {
    image:   heroCardPhone,
    cropped: [] as Side[],     // sides where the artwork itself runs off its frame
    eyebrow: "VINK Card — Now in Your Pocket",
    headline: <>All the benefits of Card,<br /><span className="relative inline-block"><span className="relative z-10">on your phone.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#ffffff" }} /></span></>,
    body: "Manage, track and enjoy exclusive benefits anytime, anywhere.",
    ctas: [
      { label: "Start Now",  style: { background: BRAND.crimsonHover, boxShadow: "0 6px 20px rgba(200,16,46,.4)" } },
      { label: "Learn more", style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "24/7",  label: "Card access, anytime" },
      { value: "0",     label: "Hidden fees" },
      { value: "1-Tap", label: "Track every benefit" },
    ],
  },
  {
    image:   heroGlobalSim,
    cropped: [] as Side[],
    eyebrow: "VINK SIM — planned, launching June 2027",
    headline: <>All the benefits of SIM,<br /><span className="relative inline-block"><span className="relative z-10">on your phone.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#ffffff" }} /></span></>,
    body: "Stay connected anywhere in the world with reliable data, clear calls and seamless connectivity.",
    ctas: [
      { label: "Get Your SIM", style: { background: "#B91C1C", boxShadow: "0 6px 20px rgba(185,28,28,.4)" } },
      { label: "Learn More",    style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "Global",   label: "Coverage planned" },
      { value: "4G/5G",   label: "Data (planned)" },
      { value: "Jun 2027", label: "Planned launch" },
    ],
  },
  {
    image:   heroValidator,
    cropped: [] as Side[],
    wide: true,                                   // a wide, complete cut-out (validator + the five channels): shown whole, in a larger frame
    eyebrow: "VINK AFC — Today's Market Multi-ticketing Validator",
    headline: <>Multi-ticketing<br /><span className="relative inline-block"><span className="relative z-10">validator.</span><span className="absolute bottom-1 left-0 w-full h-3 opacity-30 rounded" style={{ background: "#ffffff" }} /></span></>,
    body: "Smarter, faster and cashless payments for a seamless travel experience — multi-channel, integrated in one system.",
    ctas: [
      { label: "Experience Smart Travel →", style: { background: "#ffffff", color: "#C8102E", boxShadow: "0 6px 20px rgba(0,0,0,.20)" } },
      { label: "See How It Works",          style: { background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.25)" } },
    ],
    trust: [
      { value: "NFC",  label: "Card, QR & mobile payments" },
      { value: "R/T",  label: "Balance & GPS, in real time" },
      { value: "1",    label: "Card. Endless journeys." },
    ],
  },
];

// The ticketing validator (the tap-to-pay story that sits at the heart of the platform) leads; the card and SIM slides follow.
const SLIDES = [RAW_SLIDES[2], RAW_SLIDES[0], RAW_SLIDES[1]];

export function HeroSection({ onApplyClick }: { onApplyClick?: () => void }) {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);          // hovering or keyboard focus inside the hero: stand still
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const playing = !paused && !hold && !reduced;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent(c => (c + 1) % SLIDES.length);
        setFading(false);
      }, 400);
    }, 4500);
    return () => clearInterval(timer);
  }, [playing]);

  const goTo = (i: number) => {
    if (i === current) return;
    setFading(true);
    setTimeout(() => { setCurrent(i); setFading(false); }, 400);
  };

  const slide = SLIDES[current];

  return (
    <section className="vkp-grain text-white overflow-hidden relative -mt-[var(--vk-header-h,65px)] pt-[var(--vk-header-h,65px)]" aria-roledescription="carousel" aria-label="Featured" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocusCapture={() => setHold(true)} onBlurCapture={() => setHold(false)}
      style={{ background: "#C8102E" }}>
      {/* Signature motif — concentric "tap" rings, evoking the NFC contactless
          gesture that's central to how VINK actually works. Deliberately
          restrained: one quiet element per section rather than scattered
          decoration, positioned so it reads as ambient texture, not a focal
          point competing with the headline or product image. */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(60% 80% at 12% 0%, rgba(255,255,255,0.2), transparent 62%), radial-gradient(70% 95% at 100% 100%, rgba(112,6,26,0.6), transparent 62%)" }} />
      <div aria-hidden="true" className="vkp-dots-on-red" />
      <div className="absolute -right-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] pointer-events-none hidden md:block" aria-hidden="true">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="absolute inset-0 rounded-full"
            style={{
              border: "1px solid rgba(255,255,255,0.22)",
              transform: `scale(${1 - i * 0.19})`,
            }} />
        ))}
      </div>
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle,#fff 0%,transparent 70%)", transform: "translate(30%,-30%)" }} />
      <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle,#8F1027 0%,transparent 70%)", transform: "translate(-40%,40%)" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10 md:pt-8 md:pb-12 lg:pt-10 lg:pb-14 relative z-10">
        <div className={"grid grid-cols-1 gap-8 items-center transition-[grid-template-columns] duration-500 " + (slide.wide ? "md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "md:grid-cols-2")}>

          {/* ── Text side — fades with the slide ── */}
          <div
            className="text-center md:text-left transition-all duration-400"
            style={{ opacity: fading ? 0 : 1, transform: fading ? "translateY(8px)" : "translateY(0)" }}
          >
            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl leading-[1.05] mb-3"
              style={{ fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "-0.01em", textShadow: "0 2px 24px rgba(80,0,16,0.35)" }}>
              {slide.headline}
            </h1>

            {/* Body */}
            <p className="text-white/90 text-sm sm:text-base mb-4 leading-relaxed max-w-md mx-auto md:mx-0">
              {slide.body}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-5">
              {slide.ctas.map((cta, i) => (
                <button key={i}
                  onClick={cta.label === "Start Now" ? startApplication : onApplyClick}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5 active:scale-95 shadow-lg"
                  style={{ letterSpacing: "0.01em", ...(i === 0 ? { background: "linear-gradient(180deg,#ffffff,#f3f3f6)", color: "#C8102E", boxShadow: "0 14px 30px -10px rgba(60,0,12,.55), inset 0 1px 0 #fff" } : { background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.3)", color: "#ffffff", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }) }}>
                  {cta.label}
                </button>
              ))}
            </div>

            {/* Trust stats */}
            <div className="vkp-glass-dark inline-flex max-w-full justify-center md:justify-start rounded-2xl px-2 py-2 sm:px-3">
              {slide.trust.map((t, i) => (
                <div key={i} className={"text-center md:text-left px-4 sm:px-5 " + (i > 0 ? "border-l border-white/20" : "")}>
                  <p className="text-xl" style={{ color: "#ffffff", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{t.value}</p>
                  <p className="text-white/90 text-xs font-medium mt-0.5">{t.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Image side ── */}
          <div className="relative flex flex-col items-center md:items-end">
            <div className="absolute inset-0 rounded-full opacity-30 blur-3xl pointer-events-none"
              style={{ background: "radial-gradient(circle,#ffffff,transparent 70%)" }} />
            <div aria-hidden="true" className="absolute bottom-8 left-[12%] right-[12%] h-8 rounded-[50%] bg-black/40 blur-2xl pointer-events-none" />
            <img
              key={current}
              src={slide.image}
              alt={slide.wide ? "The VINK multi-ticketing validator reading a tapped card, with its five channels: NFC card payment, QR-code, balance inquiry, segmented charge and GPS location." : slide.eyebrow}
              className={"relative z-10 w-full object-contain drop-shadow-[0_28px_40px_rgba(70,0,14,0.45)] " + (slide.wide ? "max-w-3xl max-h-[400px]" : "max-w-xs sm:max-w-sm md:max-w-md max-h-[340px] md:max-h-[400px]")}
              draggable={false}
              style={{
                transition: "opacity 0.4s ease", opacity: fading ? 0 : 1,
                maskImage: edgeMask(slide.cropped),
                WebkitMaskImage: edgeMask(slide.cropped),
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
            />

            {/* Dot indicators */}
            {/* Below the image, not over it, so the picture is never covered */}
            <div className="relative z-20 mt-2 flex items-center gap-1 self-center">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Show slide ${i + 1} of ${SLIDES.length}`}
                  aria-current={current === i ? "true" : undefined}
                  className="flex h-8 items-center justify-center px-1.5"
                >
                  <span className="block h-1.5 rounded-full transition-all duration-300" style={{ width: current === i ? 22 : 8, background: current === i ? "#ffffff" : "rgba(255,255,255,0.5)" }} />
                </button>
              ))}
              {!reduced && (
                <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play the slideshow" : "Pause the slideshow"}
                  className="ml-1 flex size-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
                  {paused ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

    </section>
  );
}
