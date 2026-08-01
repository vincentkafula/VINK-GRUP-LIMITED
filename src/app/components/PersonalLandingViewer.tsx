import { useEffect, useState } from "react";
import {
  X, ChevronRight, ChevronLeft, ArrowRight, Gift, Smartphone, Radio, Tag,
  Headphones, ShieldCheck, Wifi, Lock,
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Fires with the exact sub-nav label ("Account" | "Credit Card" | "Loan" | "Invest" | "Insure" | "Rewards") */
  onNavigate: (item: string) => void;
  onApplyClick: () => void;
  onSecurityClick: () => void;
}

// ─── Design tokens ──────────────────────────────────────────────────────────
const INK   = "#150A33";
const PLUM  = "#5B2D8E";
const VIOLET = "#6B5ED7";
const GOLD  = "#C9A84C";

const SUB_NAV = [
  { label: "Accounts", item: "Account" },
  { label: "Cards",    item: "Credit Card" },
  { label: "Loans",    item: "Loan" },
  { label: "Invest",   item: "Invest" },
  { label: "Insure",   item: "Insure" },
  { label: "Rewards",  item: "Rewards" },
];

const FEATURES = [
  { folio: "01", icon: <ShieldCheck className="w-[18px] h-[18px]" />, title: "Secure Transactions", desc: "Advanced security keeps your transactions safe every time." },
  { folio: "02", icon: <Gift className="w-[18px] h-[18px]" />,        title: "Exclusive Rewards",   desc: "Earn points with every purchase and enjoy exciting rewards." },
  { folio: "03", icon: <Smartphone className="w-[18px] h-[18px]" />,  title: "Mobile Control",      desc: "Manage your card, set limits, and track spending on the go." },
  { folio: "04", icon: <Radio className="w-[18px] h-[18px]" />,       title: "Tap & Go",            desc: "Enjoy fast, contactless payments anywhere you go." },
  { folio: "05", icon: <Tag className="w-[18px] h-[18px]" />,         title: "Special Offers",      desc: "Unlock member-only deals and discounts all year round." },
  { folio: "06", icon: <Headphones className="w-[18px] h-[18px]" />,  title: "24/7 Support",        desc: "We're here for you anytime, anywhere." },
];

const SLIDES = [
  { eyebrow: "Vink Card, everywhere",  heading: "All the benefits of Card,\non your phone", body: "Personalise your results in a few simple steps and carry every card in one place.", cta: "Learn more" },
  { eyebrow: "Real-time visibility",   heading: "Track every rand,\nin real time",           body: "See spending the moment it happens, right in the app — no surprises at month end.", cta: "See how it works" },
  { eyebrow: "One tap, total control", heading: "Freeze your card\nin one tap",               body: "Lost it? Lock it instantly and keep shopping with a digital card while it's away.", cta: "Explore card controls" },
];

// ─── A believable, original premium-card graphic (no imitation of any real card) ──
function CardGraphic() {
  return (
    <div className="relative select-none" style={{ width: 300, height: 240 }}>
      {/* ambient glow */}
      <div className="absolute inset-0 rounded-[32px]" style={{ background: "radial-gradient(circle at 60% 40%, rgba(201,168,76,0.18), transparent 65%)" }} />

      {/* back card */}
      <div
        className="absolute rounded-2xl shadow-2xl"
        style={{
          width: 244, height: 154, top: 66, left: 6, rotate: "-9deg",
          background: "linear-gradient(150deg,#241154 0%,#150A33 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />

      {/* front card */}
      <div
        className="absolute rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: 258, height: 164, top: 30, left: 24, rotate: "6deg",
          background: "linear-gradient(155deg,#6B5ED7 0%,#4C1D95 55%,#2A1160 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="relative h-full flex flex-col justify-between p-5">
          <div className="flex items-start justify-between">
            <div
              className="w-8 h-6 rounded-[4px]"
              style={{ background: "linear-gradient(150deg,#F5E2A8,#C9A84C 55%,#9C7F35)" }}
            />
            <Wifi className="w-4 h-4 text-white/70 rotate-90" />
          </div>
          <div>
            <p className="text-white/85 text-[13px] font-mono tracking-[0.18em]">•••• •••• •••• 4521</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-white/55 text-[9px] tracking-wide uppercase">Vink Personal</p>
              <p className="text-white text-[13px] font-black italic tracking-tight">VISA</p>
            </div>
          </div>
        </div>
      </div>

      {/* floating lock badge */}
      <div
        className="absolute flex items-center justify-center rounded-full shadow-lg"
        style={{ width: 46, height: 46, top: 6, right: 2, background: "#fff" }}
      >
        <Lock className="w-4 h-4" style={{ color: PLUM }} />
      </div>

      {/* floating contactless badge */}
      <div
        className="absolute flex items-center justify-center rounded-full shadow-lg"
        style={{ width: 40, height: 40, bottom: 4, left: 0, background: GOLD }}
      >
        <Wifi className="w-4 h-4 text-white rotate-90" />
      </div>
    </div>
  );
}

export function PersonalLandingViewer({ isOpen, onClose, onNavigate, onApplyClick, onSecurityClick }: Props) {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setSlide(i => (i + 1) % SLIDES.length), 6000);
    return () => clearInterval(id);
  }, [isOpen]);

  if (!isOpen) return null;

  const s = SLIDES[slide];
  const next = () => setSlide(i => (i + 1) % SLIDES.length);
  const prev = () => setSlide(i => (i - 1 + SLIDES.length) % SLIDES.length);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-black/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <img src={vinkLogo} alt="VINK" className="w-[110px] sm:w-[150px] h-auto object-contain" />
            <nav className="hidden md:flex items-center gap-1">
              <span className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ color: VIOLET, background: "#F3F0FF" }}>Personal</span>
            </nav>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Sub-nav */}
        <div style={{ background: INK }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-7 h-11 overflow-x-auto scrollbar-none">
              {SUB_NAV.map((tab, i) => (
                <button
                  key={tab.label}
                  onClick={() => onNavigate(tab.item)}
                  className="relative whitespace-nowrap text-[13px] font-medium h-full flex items-center transition-colors"
                  style={{ color: i === 0 ? "#fff" : "rgba(255,255,255,0.62)" }}
                >
                  {tab.label}
                  {i === 0 && (
                    <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full" style={{ background: GOLD }} />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* ── Promo strip ── */}
      <div className="border-b border-black/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-8 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div>
            <p className="text-lg sm:text-[21px] font-semibold tracking-tight" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>
              Let us find the card that suits you best.
            </p>
            <p className="text-[13px] text-gray-500 mt-1.5">Personalise your results in a few simple steps.</p>
          </div>
          <button
            onClick={onApplyClick}
            className="flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-semibold shrink-0 shadow-[0_10px_24px_-8px_rgba(91,45,142,0.55)] hover:brightness-105 transition-all"
            style={{ background: `linear-gradient(135deg,${VIOLET},${PLUM})` }}
          >
            Start Now <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Hero carousel ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(120deg, #3D1B7A 0%, ${VIOLET} 58%, ${PLUM} 100%)` }}
      >
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />

        <button
          onClick={prev}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 items-center justify-center transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={next}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 items-center justify-center transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="w-4 h-4 text-white" />
        </button>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-10 flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1 max-w-lg">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase mb-4" style={{ color: "#F0E4C4" }}>
              <span className="w-5 h-px" style={{ background: GOLD }} /> {s.eyebrow}
            </span>
            <h2
              className="text-white text-[32px] sm:text-[42px] font-medium leading-[1.08] whitespace-pre-line"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              {s.heading}
            </h2>
            <p className="text-white/70 text-[15px] leading-relaxed mt-5 max-w-sm">{s.body}</p>
            <button
              onClick={onApplyClick}
              className="mt-7 flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-lg hover:brightness-110 transition-all"
              style={{ background: INK, border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {s.cta} <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex justify-center pb-4">
            <CardGraphic />
          </div>
        </div>

        <div className="relative flex justify-center gap-2 pb-7">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className="h-1.5 rounded-full transition-all"
              style={{ width: slide === i ? 24 : 7, background: slide === i ? GOLD : "rgba(255,255,255,0.3)" }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* ── Feature grid ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center mb-12">
          <span className="inline-block text-[11px] font-semibold tracking-[0.16em] uppercase mb-3" style={{ color: GOLD }}>
            Why choose Vink
          </span>
          <h2 className="text-[26px] sm:text-[32px] font-medium tracking-tight" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>
            Card Features and Benefits
          </h2>
          <p className="text-gray-500 text-sm mt-3 max-w-md mx-auto">Explore the features that make our cards the perfect choice for you.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {FEATURES.map(f => (
            <button
              key={f.title}
              onClick={onApplyClick}
              className="group text-left bg-white rounded-2xl border border-black/[0.06] p-5 flex flex-col gap-4 hover:shadow-[0_16px_32px_-16px_rgba(21,10,51,0.25)] hover:border-transparent hover:-translate-y-1 transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "#F3F0FF", color: VIOLET }}
                >
                  {f.icon}
                </span>
                <span className="text-[10px] font-mono tracking-wide" style={{ color: GOLD }}>{f.folio}</span>
              </div>
              <span>
                <span className="block text-[13.5px] font-bold" style={{ color: INK }}>{f.title}</span>
                <span className="block text-[12px] text-gray-500 mt-1.5 leading-relaxed">{f.desc}</span>
              </span>
              <ChevronRight className="w-4 h-4 mt-auto transition-transform group-hover:translate-x-0.5" style={{ color: VIOLET }} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Security banner ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20">
        <div
          className="relative overflow-hidden rounded-2xl px-6 sm:px-9 py-7 flex flex-col sm:flex-row items-center justify-between gap-5"
          style={{ background: `linear-gradient(100deg, ${INK} 0%, ${PLUM} 65%, ${VIOLET} 130%)` }}
        >
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="relative flex items-center gap-4">
            <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
              <ShieldCheck className="w-5 h-5" style={{ color: GOLD }} />
            </span>
            <div>
              <p className="text-white font-semibold text-[15px]" style={{ fontFamily: "'Fraunces', serif" }}>Your security is our priority</p>
              <p className="text-white/70 text-[13px] mt-1 max-w-sm">Bank with confidence. We use industry-leading security to protect your data and money.</p>
            </div>
          </div>
          <button
            onClick={onSecurityClick}
            className="relative flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-[13.5px] font-semibold shrink-0 hover:bg-white/90 transition-colors"
            style={{ color: PLUM }}
          >
            Learn about security <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
