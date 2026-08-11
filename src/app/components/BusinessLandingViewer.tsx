import { useEffect, useState } from "react";
import {
  X, ChevronRight, ChevronLeft, ArrowRight, Users, CreditCard, Globe2, Fuel,
  ShieldCheck, Headphones, Building2, TrendingUp,
} from "lucide-react";
import siteHeroBg from "../../imports/assets/site-hero-bg.png";
import { Footer } from "./Footer";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Fires with the exact sub-nav label BUSINESS_SUB_NAV/handleSubNavClick expect
   *  ("Start My Business" | "Accounts" | "Credit Cards" | "Loans" |
   *   "Business:Invest" | "Business:Insure" | "Manage My Business" |
   *   "International" | "Studio" | "News") */
  onNavigate: (item: string) => void;
  onApplyClick: () => void;
  onSecurityClick: () => void;
}

// ─── Design tokens — matching PersonalLandingViewer, the direct analog of
// this page type, rather than the newer purple palette used elsewhere on
// the homepage. Keeps this consistent with the page it sits next to in the
// nav, rather than introducing a third, mismatched style. ─────────────────
const INK   = "#0B2E1C";
const PLUM  = "#0B5C2E";
const VIOLET = "#128A43";
const GOLD  = "#C9A84C";

const SUB_NAV = [
  { label: "Start", item: "Start My Business" },
  { label: "Accounts", item: "Accounts" },
  { label: "Credit Cards", item: "Credit Cards" },
  { label: "Loans", item: "Loans" },
  { label: "Invest", item: "Business:Invest" },
  { label: "Insure", item: "Business:Insure" },
  { label: "Manage", item: "Manage My Business" },
  { label: "International", item: "International" },
  { label: "Studio", item: "Studio" },
  { label: "News", item: "News" },
];

const FEATURES = [
  { folio: "01", icon: <TrendingUp className="w-[18px] h-[18px]" />,  title: "Same-Day Settlements", desc: "Get paid the same day, every day — no waiting on your own cash flow." },
  { folio: "02", icon: <Users className="w-[18px] h-[18px]" />,       title: "Employee Cards",        desc: "Issue up to 50 cards from one account, each with its own spend controls." },
  { folio: "03", icon: <Globe2 className="w-[18px] h-[18px]" />,      title: "Local-Rate Transfers",  desc: "Cross-border payments charged at local rates — no international fees." },
  { folio: "04", icon: <Fuel className="w-[18px] h-[18px]" />,        title: "Fleet & Fuel Discounts",desc: "Partner discounts at filling stations nationwide for fleet accounts." },
  { folio: "05", icon: <Building2 className="w-[18px] h-[18px]" />,   title: "Zero Monthly Fees",     desc: "R0 monthly account fee for the first 12 months, no hidden charges." },
  { folio: "06", icon: <Headphones className="w-[18px] h-[18px]" />,  title: "Dedicated Support",     desc: "A real relationship manager, not a call centre queue." },
];

const SLIDES = [
  { eyebrow: "Built for the road",       heading: "Banking for the operators\nwho keep SA moving",  body: "Taxi associations, fleet owners, and fuel stations — a business account built around how you actually move money.", cta: "Start my business" },
  { eyebrow: "No international fees",    heading: "Send and spend\nat local rates, anywhere",       body: "Once you qualify for a VINK card, cross-border transfers are charged like any local payment. No markups.", cta: "See international banking" },
  { eyebrow: "One account, many cards",  heading: "Give your whole team\ntheir own card",           body: "Issue cards to employees, track every rand per cardholder, and stay in control from a single dashboard.", cta: "Explore business accounts" },
];

// ─── An original illustration of a business dashboard/multi-card panel,
// not a copy of any real product's UI. ─────────────────────────────────────
function BusinessGraphic() {
  return (
    <div className="relative w-[280px] sm:w-[320px]">
      <div className="rounded-2xl p-5" style={{ background: "linear-gradient(155deg,#0F3D24,#0B2E1C)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5)" }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-white/50 text-[10px] font-mono uppercase tracking-widest">Business Overview</span>
          <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(201,168,76,0.18)" }}>
            <Building2 className="w-3 h-3" style={{ color: GOLD }} />
          </span>
        </div>
        <p className="text-white text-2xl font-semibold mb-1" style={{ fontFamily: "'Fraunces',serif" }}>R284,650.00</p>
        <p className="text-white/40 text-[11px] mb-5">Available balance</p>
        <div className="space-y-2.5">
          {[["Fleet cards active", "12"], ["Pending settlements", "R18,400"], ["This month's spend", "R94,200"]].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
              <span className="text-white/60 text-[11.5px]">{label}</span>
              <span className="text-white text-[12.5px] font-semibold" style={{ fontFamily: "'JetBrains Mono',monospace" }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: GOLD, boxShadow: "0 14px 30px -10px rgba(201,168,76,0.5)" }}>
        <CreditCard className="w-6 h-6" style={{ color: INK }} />
      </div>
    </div>
  );
}

export function BusinessLandingViewer({ isOpen, onClose, onNavigate, onApplyClick, onSecurityClick }: Props) {
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center justify-end">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Sub-nav */}
        <div style={{ background: INK }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-7 h-11 overflow-x-auto scrollbar-none">
              {SUB_NAV.map((tab, i) => (
                <button key={tab.label} onClick={() => onNavigate(tab.item)}
                  className="relative whitespace-nowrap text-[13px] font-medium h-full flex items-center transition-colors"
                  style={{ color: i === 0 ? "#fff" : "rgba(255,255,255,0.62)" }}>
                  {tab.label}
                  {i === 0 && <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full" style={{ background: GOLD }} />}
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
              Let's find the business account that fits.
            </p>
            <p className="text-[13px] text-gray-500 mt-1.5">Taxi associations, fleets, fuel stations, retailers — built around how you work.</p>
          </div>
          <button onClick={onApplyClick}
            className="flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-semibold shrink-0 shadow-[0_10px_24px_-8px_rgba(11,92,46,0.55)] hover:brightness-105 transition-all"
            style={{ background: `linear-gradient(135deg,${VIOLET},${PLUM})` }}>
            Start Now <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Hero carousel ── */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(120deg, #14532D 0%, ${VIOLET} 58%, ${PLUM} 100%)` }}>
        <img src={siteHeroBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.14] mix-blend-luminosity" />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />

        <button onClick={prev} className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 items-center justify-center transition-colors" aria-label="Previous">
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <button onClick={next} className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 items-center justify-center transition-colors" aria-label="Next">
          <ChevronRight className="w-4 h-4 text-white" />
        </button>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-10 flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1 max-w-lg">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase mb-4" style={{ color: "#F0E4C4" }}>
              <span className="w-5 h-px" style={{ background: GOLD }} /> {s.eyebrow}
            </span>
            <h2 className="text-white text-[32px] sm:text-[42px] font-medium leading-[1.08] whitespace-pre-line" style={{ fontFamily: "'Fraunces', serif" }}>
              {s.heading}
            </h2>
            <p className="text-white/70 text-[15px] leading-relaxed mt-5 max-w-sm">{s.body}</p>
            <button onClick={onApplyClick}
              className="mt-7 flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-lg hover:brightness-110 transition-all"
              style={{ background: INK, border: "1px solid rgba(255,255,255,0.1)" }}>
              {s.cta} <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex justify-center pb-4">
            <BusinessGraphic />
          </div>
        </div>

        <div className="relative flex justify-center gap-2 pb-7">
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)}
              className="h-1.5 rounded-full transition-all"
              style={{ width: slide === i ? 24 : 7, background: slide === i ? GOLD : "rgba(255,255,255,0.3)" }}
              aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
      </div>

      {/* ── Feature grid ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center mb-12">
          <span className="inline-block text-[11px] font-semibold tracking-[0.16em] uppercase mb-3" style={{ color: GOLD }}>
            Why choose VINK Business
          </span>
          <h2 className="text-[26px] sm:text-[32px] font-medium tracking-tight" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>
            Built for How Your Business Moves
          </h2>
          <p className="text-gray-500 text-sm mt-3 max-w-md mx-auto">From single taxi operators to multi-branch fleets, everything scales with you.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {FEATURES.map(f => (
            <button key={f.title} onClick={onApplyClick}
              className="group text-left bg-white rounded-2xl border border-black/[0.06] p-5 flex flex-col gap-4 hover:shadow-[0_16px_32px_-16px_rgba(21,10,51,0.25)] hover:border-transparent hover:-translate-y-1 transition-all duration-200">
              <div className="flex items-start justify-between">
                <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#EAF7EE", color: VIOLET }}>
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
        <div className="relative overflow-hidden rounded-2xl px-6 sm:px-9 py-7 flex flex-col sm:flex-row items-center justify-between gap-5"
          style={{ background: `linear-gradient(100deg, ${INK} 0%, ${PLUM} 65%, ${VIOLET} 130%)` }}>
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="relative flex items-center gap-4">
            <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
              <ShieldCheck className="w-5 h-5" style={{ color: GOLD }} />
            </span>
            <div>
              <p className="text-white font-semibold text-[15px]" style={{ fontFamily: "'Fraunces', serif" }}>Your business is protected too</p>
              <p className="text-white/70 text-[13px] mt-1 max-w-sm">The same industry-leading security protecting personal accounts covers every business card and transfer.</p>
            </div>
          </div>
          <button onClick={onSecurityClick}
            className="relative flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-[13.5px] font-semibold shrink-0 hover:bg-white/90 transition-colors"
            style={{ color: PLUM }}>
            Learn about security <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
