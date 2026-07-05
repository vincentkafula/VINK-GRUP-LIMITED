const STATS = [
  { value: "2,100+", label: "Partner Merchants", sub: "Fuel, gyms, restaurants, and retailers",
    icon: <svg viewBox="0 0 44 44" className="w-8 h-8" fill="none"><rect x="5" y="14" width="34" height="22" rx="3" stroke="white" strokeWidth="2" opacity="0.7"/><line x1="5" y1="22" x2="39" y2="22" stroke="white" strokeWidth="2"/><rect x="9" y="27" width="9" height="5" rx="1.5" fill="white" opacity="0.6"/><rect x="21" y="27" width="13" height="5" rx="1.5" fill="white" opacity="0.3"/></svg> },
  { value: "R0.50", label: "Per Transaction", sub: "Lowest taxi fare processing fee in SA",
    icon: <svg viewBox="0 0 44 44" className="w-8 h-8" fill="none"><path d="M22 5 L26 17 L39 17 L29 24 L33 37 L22 29 L11 37 L15 24 L5 17 L18 17 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" opacity="0.8" fill="rgba(255,255,255,0.1)"/></svg> },
  { value: "256-bit", label: "Encryption", sub: "Bank-grade security on every payment",
    icon: <svg viewBox="0 0 44 44" className="w-8 h-8" fill="none"><path d="M22 5 L8 11 V24 C8 34 15 42 22 44 C29 42 36 34 36 24 V11 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" opacity="0.8" fill="rgba(255,255,255,0.1)"/><path d="M15 23 L19 27 L28 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
];

const PERKS = [
  "Zero monthly account fee for the first 12 months",
  "Same-day transfers to any South African bank account",
  "Multi-card setup — issue up to 50 employee cards from one account",
  "Dedicated business relationship manager available 8am–8pm",
];

import { memo } from "react";

export const BusinessPowerSection = memo(function BusinessPowerSection() {
  return (
    <section className="py-16 sm:py-24 relative overflow-hidden" style={{ background: "#1B1837" }}>
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-5 pointer-events-none"
        style={{ background: "radial-gradient(circle,#9585EA,transparent)", transform: "translate(30%,-20%)" }} />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-5 pointer-events-none"
        style={{ background: "radial-gradient(circle,#F5C842,transparent)", transform: "translate(-30%,30%)" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div className="text-center lg:text-left">
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-5"
              style={{ background: "rgba(245,200,66,.15)", color: "#F5C842" }}>Business Banking</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-4">
              Power your business and earn{" "}
              <span style={{ color: "#F5C842" }}>80,000 bonus points</span>{" "}
              or{" "}
              <span style={{ color: "#F5C842" }}>R3,000 cash back</span>{" "}
              when you open a Vink Business Account this month.
            </h2>
            <p className="text-white/60 text-sm leading-relaxed mb-7 max-w-md mx-auto lg:mx-0">
              VMS Business Banking is designed for the operators who keep South Africa moving — taxi associations, fleet owners, fuel stations, gym franchises, and independent retailers. Get instant settlements, no hidden fees, and a payment infrastructure that scales with you.
            </p>
            <ul className="space-y-2.5 mb-8 text-left max-w-md mx-auto lg:mx-0">
              {PERKS.map((perk, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-white/70">
                  <span className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: "rgba(245,200,66,.2)" }}>
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#F5C842" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  {perk}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-center lg:justify-start gap-3">
              <button className="px-8 py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg"
                style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)", boxShadow: "0 6px 20px rgba(107,94,215,.4)" }}>
                Open a Business Account
              </button>
              <button className="px-8 py-3.5 rounded-xl text-sm font-semibold transition-all hover:bg-white/10"
                style={{ border: "1px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.8)" }}>
                Learn More
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 lg:gap-6">
            {STATS.map((s, i) => (
              <div key={i} className="rounded-2xl p-5 text-center flex flex-col items-center gap-3 hover:scale-105 transition-transform"
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}>
                <div className="opacity-80">{s.icon}</div>
                <div>
                  <p className="text-2xl font-black text-white mb-0.5">{s.value}</p>
                  <p className="text-xs font-semibold text-white/70">{s.label}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
