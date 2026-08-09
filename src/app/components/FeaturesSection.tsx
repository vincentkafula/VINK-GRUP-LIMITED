import { memo } from "react";
import { ArrowRight, ShieldCheck, Headphones } from "lucide-react";

const PURPLE = "#5B21B6";
const DEEP_PURPLE = "#2E1065";
const GOLD = "#F5A623";

const BENEFITS = [
  { emoji: "🎁", title: "Rewards", desc: "Earn points on every spend and redeem for exciting rewards and offers.", featured: false },
  { emoji: "💵", title: "Cash Back", desc: "Get real cash back on your purchases and save more every day.", featured: true },
  { emoji: "🔄", title: "Balance Transfer", desc: "Transfer your balance easily and pay off debt faster.", featured: false },
  { emoji: "🧳", title: "Travel", desc: "Exclusive travel benefits, airport lounge access, and more.", featured: false },
  { emoji: "0️⃣", title: "Zero Percent", desc: "Enjoy 0% interest on eligible purchases for a limited time.", featured: false },
  { emoji: "🛡️", title: "Low Interest", desc: "Competitive interest rates that help you save more.", featured: false },
];

const STATS = [
  { emoji: "👑", value: "5X", label: "Points on dining & entertainment" },
  { emoji: "🎁", value: "100+", label: "Partner brands and offers" },
  { emoji: "🌍", value: "0", label: "Foreign transaction fees" },
  { emoji: "📱", value: "24/7", label: "Dedicated customer support" },
];

function BenefitCard({ b }: { b: (typeof BENEFITS)[number] }) {
  return (
    <div
      className={`rounded-2xl p-5 flex flex-col transition-all hover:-translate-y-1 hover:shadow-xl relative overflow-hidden ${b.featured ? "text-white shadow-xl" : "bg-white border border-gray-100 shadow-sm"}`}
      style={b.featured ? { background: `linear-gradient(160deg,${DEEP_PURPLE},${PURPLE})` } : undefined}
    >
      {b.featured && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: GOLD, color: "#fff" }}>
          🔥 Most Popular
        </span>
      )}
      <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl mb-4" style={{ background: b.featured ? "rgba(255,255,255,0.12)" : "#F3F4F6" }}>
        {b.emoji}
      </div>
      <p className={`text-base font-bold mb-1.5 ${b.featured ? "text-white" : "text-gray-900"}`}>{b.title}</p>
      <p className={`text-[13px] leading-relaxed mb-5 ${b.featured ? "text-white/80" : "text-gray-500"}`}>{b.desc}</p>
      <button
        className="mt-auto w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110"
        style={b.featured ? { background: GOLD } : { background: "#F1EBFB", color: PURPLE }}
      >
        <ArrowRight className={`w-4 h-4 ${b.featured ? "text-white" : ""}`} />
      </button>
    </div>
  );
}

export const FeaturesSection = memo(function FeaturesSection({ onExploreAll }: { onExploreAll?: () => void }) {
  return (
    <section className="py-10 sm:py-14" style={{ background: "linear-gradient(160deg,#F7F4FD 0%,#FFF8EF 100%)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          {/* Left: copy + card visual */}
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: PURPLE }}>More Than a Card</span>
            <div className="w-10 h-1 rounded-full mb-5" style={{ background: PURPLE }} />
            <h2 className="text-3xl sm:text-4xl font-black leading-[1.1] text-gray-900">
              Designed for the way <span style={{ color: PURPLE }}>you</span> live
            </h2>
            <p className="text-gray-500 text-base mt-5 max-w-md leading-relaxed">
              Unlock a world of exclusive benefits that reward your everyday and elevate every moment.
            </p>

            <div className="relative mt-8 max-w-sm">
              <div className="absolute -inset-6 rounded-full opacity-40" style={{ background: `radial-gradient(circle,${GOLD}33,transparent 70%)` }} />
              <div className="relative rounded-2xl p-5 shadow-2xl" style={{ background: `linear-gradient(140deg,${DEEP_PURPLE} 0%,${PURPLE} 60%,#175E38 100%)` }}>
                <div className="flex items-center justify-between mb-8">
                  <div className="w-9 h-7 rounded" style={{ background: "linear-gradient(135deg,#E8C27A,#C9A05A)" }} />
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/70" fill="none"><path d="M6 10a6 6 0 0112 0M9 13a3 3 0 016 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </div>
                <p className="text-white font-mono text-lg tracking-widest mb-4">5412&nbsp; 7512&nbsp; 3412&nbsp; 3456</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-white/50 text-[9px] uppercase">Valid Thru</p>
                    <p className="text-white text-xs font-mono">12/29</p>
                    <p className="text-white text-sm font-semibold mt-2 tracking-wide">JOHN DOE</p>
                  </div>
                  <span className="text-white text-xl font-black italic">VISA</span>
                </div>
              </div>

              <div className="absolute -top-4 right-2 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5" style={{ color: PURPLE }} />
                <span className="text-[10px] font-bold text-gray-700 leading-tight">24/7<br />Support</span>
              </div>
              <div className="absolute -left-4 bottom-16 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: PURPLE }} />
                <span className="text-[10px] font-bold text-gray-700 leading-tight">Secure<br />Transactions</span>
              </div>
              <div className="absolute -bottom-4 left-6 rounded-full px-4 py-2 shadow-lg flex items-center gap-1.5" style={{ background: DEEP_PURPLE }}>
                <span className="text-white text-[11px] font-bold">✨ Smart. Simple. Smarter.</span>
              </div>
            </div>
          </div>

          {/* Right: benefit cards */}
          <div className="grid sm:grid-cols-3 gap-4">
            {BENEFITS.map(b => <BenefitCard key={b.title} b={b} />)}
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0" style={{ background: "#F1EBFB" }}>{s.emoji}</span>
              <div>
                <p className="text-lg font-black text-gray-900 leading-tight">{s.value}</p>
                <p className="text-[11.5px] text-gray-500 leading-snug">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {onExploreAll && (
          <div className="text-center mt-7">
            <button onClick={onExploreAll} className="text-sm font-semibold hover:underline bg-transparent border-none cursor-pointer" style={{ color: PURPLE }}>
              Explore All Features →
            </button>
          </div>
        )}
      </div>
    </section>
  );
});
