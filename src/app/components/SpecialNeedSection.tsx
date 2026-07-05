const AUDIENCES = [
  { icon: "🎓", label: "Students",         desc: "Build your credit history from day one, with zero fees and a low starting limit" },
  { icon: "🏗️", label: "Credit Builders",  desc: "Secured Vink cards with a clear upgrade pathway as your score improves" },
  { icon: "🚌", label: "Taxi Operators",   desc: "Manage fleet payments, fuel spend, and team wallets from one business account" },
  { icon: "🌍", label: "Newcomers to SA",  desc: "Simple FICA-compliant accounts with no prior banking history required" },
];

import { memo } from "react";

export const SpecialNeedSection = memo(function SpecialNeedSection() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
          <div className="grid grid-cols-2 gap-3 h-72 sm:h-80">
            <div className="row-span-2 rounded-2xl overflow-hidden shadow-lg">
              <div className="w-full h-full bg-gradient-to-br from-purple-500 to-purple-800 flex items-center justify-center text-8xl">🤝</div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-5xl">🎓</div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-5xl">🚌</div>
            </div>
          </div>
          <div className="text-center md:text-left">
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
              style={{ background: "#EDE9FE", color: "#6B5ED7" }}>Tailored for You</span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 leading-snug mb-3">
              Have a Special Need?<br />
              <span style={{ color: "#6B5ED7" }}>We Can Help.</span>
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-md mx-auto md:mx-0">
              Not every customer is at the same place in life — and not every bank card fits every situation. VMS offers targeted solutions for specific life stages, from students building credit for the first time to new South African residents setting up their financial lives. Whatever your circumstance, there&apos;s a Vink product designed for you.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-8 max-w-md mx-auto md:mx-0">
              {AUDIENCES.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50 transition-all cursor-pointer text-left">
                  <span className="text-2xl flex-shrink-0">{a.icon}</span>
                  <div>
                    <p className="text-xs font-bold text-gray-800">{a.label}</p>
                    <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <button className="px-7 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg"
                style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)", boxShadow: "0 6px 20px rgba(107,94,215,.35)" }}>
                Find My Card
              </button>
              <button className="px-7 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-purple-50"
                style={{ border: "1.5px solid #6B5ED7", color: "#6B5ED7" }}>
                Talk to an Expert
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
