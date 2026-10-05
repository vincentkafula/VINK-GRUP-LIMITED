const AUDIENCES = [
  { icon: "🎓", label: "Students",         desc: "Build your credit history from day one, with zero fees and a low starting limit" },
  { icon: "🏗️", label: "Credit Builders",  desc: "Secured VINK cards with a clear upgrade pathway as your score improves" },
  { icon: "🚌", label: "Taxi Operators",   desc: "Manage fleet payments, fuel spend, and team wallets from one business account" },
  { icon: "🌍", label: "Newcomers to SA",  desc: "Simple FICA-compliant accounts with no prior banking history required" },
];

import { memo } from "react";

export const SpecialNeedSection = memo(function SpecialNeedSection() {
  return (
    <section className="bg-surface py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
          <div className="grid grid-cols-2 gap-3 h-72 sm:h-80">
            <div className="row-span-2 rounded-2xl overflow-hidden shadow-lg">
              <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center text-8xl">🤝</div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-5xl">🎓</div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-5xl">🚌</div>
            </div>
          </div>
          <div className="text-center md:text-left">
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
              style={{ background: "var(--vk-surface-2)", color: "var(--vk-crimson-text)" }}>Tailored for You</span>
            <h2 className="text-2xl sm:text-3xl font-black text-fg leading-snug mb-3">
              Have a Special Need?<br />
              <span style={{ color: "var(--vk-crimson-text)" }}>We Can Help.</span>
            </h2>
            <p className="text-fg-muted text-sm leading-relaxed mb-6 max-w-md mx-auto md:mx-0">
              Not every customer is at the same place in life — and not every bank card fits every situation. VINK offers targeted solutions for specific life stages, from students building credit for the first time to new South African residents setting up their financial lives. Whatever your circumstance, there&apos;s a VINK product designed for you.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-8 max-w-md mx-auto md:mx-0">
              {AUDIENCES.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-line hover:border-emerald-200 hover:bg-emerald-50 transition-all cursor-pointer text-left">
                  <span className="text-2xl flex-shrink-0">{a.icon}</span>
                  <div>
                    <p className="text-xs font-bold text-fg">{a.label}</p>
                    <p className="text-[10px] text-fg-muted leading-snug mt-0.5">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <button className="px-7 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg"
                style={{ background: "linear-gradient(135deg,#5C0A10,#9B1C1C)", boxShadow: "0 6px 20px rgba(139,0,0,.35)" }}>
                Find My Card
              </button>
              <button className="px-7 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-emerald-50"
                style={{ border: "1.5px solid #8B0000", color: "var(--vk-crimson-text)" }}>
                Talk to an Expert
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
