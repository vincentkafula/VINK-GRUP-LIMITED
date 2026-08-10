const STATS = [
  { value: "4", label: "Initial Markets", sub: "South Africa, the US, Zambia, and China",
    icon: <svg viewBox="0 0 44 44" className="w-8 h-8" fill="none"><circle cx="22" cy="22" r="17" stroke="white" strokeWidth="2" opacity="0.7"/><path d="M5 22h34M22 5c5 5 8 11 8 17s-3 12-8 17c-5-5-8-11-8-17s3-12 8-17Z" stroke="white" strokeWidth="2" opacity="0.6"/></svg> },
  { value: "Local", label: "Rates, Always", sub: "No international fees, no hidden markups",
    icon: <svg viewBox="0 0 44 44" className="w-8 h-8" fill="none"><path d="M22 5 L26 17 L39 17 L29 24 L33 37 L22 29 L11 37 L15 24 L5 17 L18 17 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" opacity="0.8" fill="rgba(255,255,255,0.1)"/></svg> },
  { value: "256-bit", label: "Encryption", sub: "Bank-grade security on every payment",
    icon: <svg viewBox="0 0 44 44" className="w-8 h-8" fill="none"><path d="M22 5 L8 11 V24 C8 34 15 42 22 44 C29 42 36 34 36 24 V11 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" opacity="0.8" fill="rgba(255,255,255,0.1)"/><path d="M15 23 L19 27 L28 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
];

import { memo } from "react";

export const BusinessPowerSection = memo(function BusinessPowerSection() {
  return (
    <section className="py-10 sm:py-16 relative overflow-hidden" style={{ background: "#2E1065" }}>
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-5 pointer-events-none"
        style={{ background: "radial-gradient(circle,#7C3AED,transparent)", transform: "translate(30%,-20%)" }} />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-5 pointer-events-none"
        style={{ background: "radial-gradient(circle,#F5C842,transparent)", transform: "translate(-30%,30%)" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div className="text-center lg:text-left">
            <span className="inline-block text-xs font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full mb-5"
              style={{ background: "rgba(245,200,66,.15)", color: "#F5C842" }}>Global Payments</span>
            <h2 className="text-3xl sm:text-4xl leading-[1.15] text-white mb-5" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>
              Cross-border payments shouldn't cost a fortune.
            </h2>
            <div className="space-y-4 mb-8 max-w-md mx-auto lg:mx-0 text-left">
              <p className="text-white/60 text-sm leading-relaxed">
                People around the world pay a fortune to send money across borders — often 10% or more in fees just to support a loved one. Businesses fare no better, losing significant money to fees every time they purchase or import goods from abroad.
              </p>
              <p className="text-white/60 text-sm leading-relaxed">
                VINK is changing that. We've eliminated these fees in our initial markets — South Africa, the United States, Zambia, and China — with more countries coming soon.
              </p>
              <p className="text-white/60 text-sm leading-relaxed">
                Once you qualify for a VINK card, every transaction is charged at local rates — even cross-border transfers. No international fees, no hidden markups, just local pricing wherever you send or spend.
              </p>
              <p className="text-white/60 text-sm leading-relaxed">
                We're not a traditional bank. VINK is a cloud-based banking platform issuing Visa and Mastercard-powered cards built for how people and businesses actually move money today.
              </p>
            </div>
            <div className="flex flex-wrap justify-center lg:justify-start gap-3">
              <button className="px-8 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg,#4C1D95,#7C3AED)", boxShadow: "0 10px 28px -6px rgba(124,58,237,.5)", letterSpacing: "0.01em" }}>
                See How It Works
              </button>
              <button className="px-8 py-3.5 rounded-xl text-sm font-semibold transition-all hover:bg-white/10"
                style={{ border: "1px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.8)" }}>
                Learn More
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 lg:gap-6">
            {STATS.map((s, i) => (
              <div key={i} className="rounded-2xl p-5 text-center flex flex-col items-center gap-3 hover:scale-105 transition-transform duration-300"
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}>
                <div className="opacity-80">{s.icon}</div>
                <div>
                  <p className="text-2xl mb-0.5 text-white" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{s.value}</p>
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
