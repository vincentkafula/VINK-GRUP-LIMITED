import { useState } from "react";
import {
  X, ChevronRight, ChevronLeft, CreditCard, Gift, Phone, Radio, Tag,
  Headphones, ShieldCheck, Smartphone,
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

const SUB_NAV = [
  { label: "Accounts", item: "Account", hasMenu: false },
  { label: "Cards",    item: "Credit Card", hasMenu: true },
  { label: "Loans",    item: "Loan", hasMenu: true },
  { label: "Invest",   item: "Invest", hasMenu: true },
  { label: "Insure",   item: "Insure", hasMenu: true },
  { label: "Rewards",  item: "Rewards", hasMenu: false },
];

const FEATURES = [
  { icon: <ShieldCheck className="w-6 h-6" />, title: "Secure Transactions", desc: "Advanced security keeps your transactions safe every time." },
  { icon: <Gift className="w-6 h-6" />,        title: "Exclusive Rewards",   desc: "Earn points with every purchase and enjoy exciting rewards." },
  { icon: <Phone className="w-6 h-6" />,       title: "Mobile Control",      desc: "Manage your card, set limits, and track spending on the go." },
  { icon: <Radio className="w-6 h-6" />,       title: "Tap & Go",            desc: "Enjoy fast, contactless payments anywhere you go." },
  { icon: <Tag className="w-6 h-6" />,         title: "Special Offers",      desc: "Unlock member-only deals and discounts all year round." },
  { icon: <Headphones className="w-6 h-6" />,  title: "24/7 Support",        desc: "We're here for you anytime, anywhere." },
];

const SLIDES = [
  {
    heading: "All the benefits of Card,\non your phone",
    body: "Personalize your results in\nfew simple steps.",
    cta: "Learn more",
  },
  {
    heading: "Track every rand,\nin real time",
    body: "See spending the moment it\nhappens, right in the app.",
    cta: "See how it works",
  },
  {
    heading: "Freeze your card\nin one tap",
    body: "Lost it? Lock it instantly and\nkeep shopping with a digital card.",
    cta: "Explore card controls",
  },
];

function MiniCard({ grad, label }: { grad: string; label: string }) {
  return (
    <div
      className="rounded-lg w-16 h-11 sm:w-20 sm:h-14 shrink-0 relative overflow-hidden shadow-md"
      style={{ background: grad }}
    >
      <div className="absolute top-1.5 left-1.5 w-3 h-2 sm:w-4 sm:h-3 rounded-sm" style={{ background: "linear-gradient(135deg,#D4AF37,#F5E07A)" }} />
      <span className="absolute bottom-1 right-1.5 text-white text-[7px] sm:text-[8px] font-black italic">{label}</span>
    </div>
  );
}

export function PersonalLandingViewer({ isOpen, onClose, onNavigate, onApplyClick, onSecurityClick }: Props) {
  const [slide, setSlide] = useState(0);
  if (!isOpen) return null;

  const s = SLIDES[slide];
  const next = () => setSlide(i => (i + 1) % SLIDES.length);
  const prev = () => setSlide(i => (i - 1 + SLIDES.length) % SLIDES.length);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <img src={vinkLogo} alt="VINK" className="w-[110px] sm:w-[150px] h-auto object-contain" />
            <nav className="hidden md:flex items-center gap-1">
              <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#6B5ED7] bg-[#F3F0FF]">Personal</span>
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
        <div style={{ background: "#5B2D8E" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-11">
              <nav className="flex items-center gap-6 overflow-x-auto scrollbar-none">
                {SUB_NAV.map(tab => (
                  <button
                    key={tab.label}
                    onClick={() => onNavigate(tab.item)}
                    className={`whitespace-nowrap flex items-center gap-1 text-sm font-medium transition-colors ${
                      tab.label === "Accounts" ? "text-white font-semibold" : "text-white/75 hover:text-white"
                    }`}
                  >
                    {tab.label}
                    {tab.hasMenu && <ChevronRight className="w-3 h-3 rotate-90" />}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* ── Promo strip ── */}
      <div className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div>
            <p className="text-lg sm:text-xl font-bold text-[#1A0A3C]">Let us find the card that suits you best.</p>
            <p className="text-sm text-gray-500 mt-1">Personalize your results in a few simple steps.</p>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <button
              onClick={onApplyClick}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold shrink-0"
              style={{ background: "linear-gradient(135deg,#6B5ED7,#5B2D8E)" }}
            >
              <CreditCard className="w-4 h-4" /> Start Now
            </button>
            <div className="hidden sm:flex items-center -space-x-3">
              <MiniCard grad="linear-gradient(135deg,#8B0000,#5B0000)" label="VISA" />
              <MiniCard grad="linear-gradient(135deg,#1F1035,#0D0620)" label="VISA" />
              <MiniCard grad="linear-gradient(135deg,#D4A843,#B88A20)" label="VISA" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Hero carousel ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(120deg,#4C1D95 0%,#6B5ED7 55%,#5B2D8E 100%)" }}
      >
        <button
          onClick={prev}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 items-center justify-center transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={next}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 items-center justify-center transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="w-4 h-4 text-white" />
        </button>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 flex flex-col lg:flex-row items-center gap-10">
          <div className="flex-1 max-w-lg">
            <h2 className="text-white text-3xl sm:text-4xl font-black leading-tight whitespace-pre-line">{s.heading}</h2>
            <p className="text-white/70 text-base mt-4 whitespace-pre-line">{s.body}</p>
            <button
              onClick={onApplyClick}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
              style={{ background: "#1A0A3C" }}
            >
              <CreditCard className="w-4 h-4" /> {s.cta}
            </button>
          </div>

          {/* Original phone illustration — a stylised device frame with a stacked wallet/app scene */}
          <div className="flex-1 flex justify-center">
            <div className="relative" style={{ width: 300, height: 210 }}>
              <div
                className="absolute inset-0 rounded-2xl border-[8px] border-white/90 shadow-2xl"
                style={{ background: "linear-gradient(160deg,#EDE9FE,#F9F7FF)" }}
              />
              <Smartphone className="absolute -bottom-2 -right-4 w-16 h-16 text-white/25" />
              <div className="absolute top-8 left-8 w-16 h-20 rounded-xl rotate-[-8deg] shadow-lg" style={{ background: "linear-gradient(160deg,#F9C8DC,#F2A6C4)" }} />
              <div className="absolute top-10 left-24 w-14 h-16 rounded-lg rotate-[6deg] shadow-lg" style={{ background: "linear-gradient(160deg,#FCD34D,#F59E0B)" }} />
              <div className="absolute top-14 left-40 w-12 h-14 rounded-lg rotate-[-4deg] shadow-lg" style={{ background: "linear-gradient(160deg,#93C5FD,#3B82F6)" }} />
              <div className="absolute bottom-6 right-10 flex items-center justify-center w-14 h-9 rounded-lg text-[9px] font-black text-white shadow-lg rotate-6" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
                ATM
              </div>
              <ShieldCheck className="absolute top-3 right-6 w-6 h-6 text-white/60" />
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 pb-6">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className="h-1.5 rounded-full transition-all"
              style={{ width: slide === i ? 22 : 7, background: slide === i ? "#fff" : "rgba(255,255,255,0.35)" }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* ── Feature grid ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black" style={{ color: "#5B2D8E" }}>
            Card Features and <span className="border-b-4" style={{ borderColor: "#5B2D8E" }}>Benefits</span>
          </h2>
          <p className="text-gray-500 text-sm mt-3">Explore the features that make our cards the perfect choice for you.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {FEATURES.map(f => (
            <button
              key={f.title}
              onClick={onApplyClick}
              className="text-left bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-3 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "#EDE9FE", color: "#6B5ED7" }}>
                {f.icon}
              </span>
              <span>
                <span className="block text-sm font-bold text-[#1A0A3C]">{f.title}</span>
                <span className="block text-xs text-gray-500 mt-1 leading-relaxed">{f.desc}</span>
              </span>
              <ChevronRight className="w-4 h-4 mt-auto" style={{ color: "#6B5ED7" }} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Security banner ── */}
      <div
        className="mx-4 sm:mx-6 lg:mx-8 mb-10 rounded-2xl px-6 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ background: "linear-gradient(90deg,#5B2D8E,#9585EA)" }}
      >
        <div className="flex items-center gap-4">
          <span className="w-11 h-11 rounded-full flex items-center justify-center bg-white/15 shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </span>
          <div>
            <p className="text-white font-bold text-sm">Your security is our priority</p>
            <p className="text-white/75 text-xs mt-0.5">Bank with confidence. We use industry-leading security to protect your data and money.</p>
          </div>
        </div>
        <button
          onClick={onSecurityClick}
          className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-white text-sm font-semibold shrink-0"
          style={{ color: "#5B2D8E" }}
        >
          Learn about security <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
