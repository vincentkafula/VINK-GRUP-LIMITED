import { CheckCircle, CreditCard, TrendingUp, Clock } from "lucide-react";

const STEPS = [
  { icon: <TrendingUp className="w-4 h-4"/>, label: "Answer 3 quick questions" },
  { icon: <CheckCircle className="w-4 h-4"/>, label: "See your personalised matches" },
  { icon: <CreditCard className="w-4 h-4"/>, label: "Apply with one tap" },
];

const P = "#5B21B6";

export function PreApprovalSection() {
  return (
    <section className="py-10 sm:py-14" style={{ background: "#F8F7FF" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ background: "#EDE9FE", color: P }}>No Hard Inquiry</span>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">
            Know exactly where you stand before you apply for any Vink card.
          </h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            It&apos;s completely free, takes under 60 seconds, and won&apos;t touch your credit score.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Card 1 — Credit Score */}
          <div className="bg-white rounded-2xl border border-gray-200 p-7 hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-5 pointer-events-none"
              style={{ background: `radial-gradient(circle,${P},transparent)`, transform: "translate(30%,-30%)" }}/>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"
              style={{ background: "linear-gradient(135deg,#EDE9FE,#DDD6FE)" }}>
              <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
                <circle cx="20" cy="14" r="6" stroke={P} strokeWidth="2.2"/>
                <path d="M8 36 C8 28 13 24 20 24 C27 24 32 28 32 36" stroke={P} strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M26 20 L28 22 L33 17" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3"
              style={{ background: "#DCFCE7", color: "#16A34A" }}>Free — Always</span>
            <h3 className="font-bold text-gray-900 text-base mb-2">See Your Credit Score Instantly</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-5">
              View your full credit profile at no cost. We show which Vink cards you&apos;re likely to qualify for and personalised tips to improve your score.
            </p>

            <button disabled title="Not available yet — VINK launches June 2027"
              className="w-full py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed"
              style={{ background: "#F1EFF9", color: "#9B93B0", border: "1px solid #E4E0EF" }}>
              🔒 Available June 2027
            </button>
          </div>

          {/* Card 2 — Pre-qualify */}
          <div className="bg-white rounded-2xl border border-gray-200 p-7 hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"
              style={{ background: "linear-gradient(135deg,#DBEAFE,#BFDBFE)" }}>
              <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
                <rect x="7" y="10" width="26" height="20" rx="3" stroke="#3B82F6" strokeWidth="2.2"/>
                <line x1="7" y1="17" x2="33" y2="17" stroke="#3B82F6" strokeWidth="2"/>
                <rect x="10" y="21" width="7" height="5" rx="1.5" fill="#3B82F6"/>
                <rect x="21" y="21" width="10" height="5" rx="1.5" fill="#3B82F6" opacity="0.35"/>
              </svg>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3"
              style={{ background: "#DBEAFE", color: "#1D4ED8" }}>
              <Clock className="w-2.5 h-2.5"/> 60 Seconds
            </span>
            <h3 className="font-bold text-gray-900 text-base mb-2">Pre-Qualify With No Impact</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-5">
              Answer three quick questions and see personalised card offers matched to your profile — no hard credit inquiry, no risk.
            </p>
            <button disabled title="Not available yet — VINK launches June 2027"
              className="w-full py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed"
              style={{ background: "#F1EFF9", color: "#9B93B0", border: "1px solid #E4E0EF" }}>
              🔒 Available June 2027
            </button>
          </div>

          {/* Card 3 — How it works */}
          <div className="rounded-2xl p-7 text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#4C1D95,#7C3AED)" }}>
            <h3 className="font-bold text-white text-base mb-1">Three Steps to Your Card</h3>
            <p className="text-white/70 text-sm mb-6">Getting started with VINK is simple, fast, and completely transparent.</p>
            <div className="space-y-4">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,.2)" }}>{step.icon}</div>
                  <p className="text-sm text-white/85 font-medium">{step.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-white/20 text-center">
              <p className="text-white/60 text-xs">Built for the 15 million South Africans on the move every day.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
