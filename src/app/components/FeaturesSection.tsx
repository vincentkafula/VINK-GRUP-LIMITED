const FEATURES = [
  { label: "No Annual Fee",      sub: "Keep every rand working for you",         gradient: "linear-gradient(135deg,#6B5ED7,#9585EA)" },
  { label: "Rewards Program",    sub: "Earn on rides, fuel, and groceries",       gradient: "linear-gradient(135deg,#F59E0B,#FBBF24)" },
  { label: "Secure Payments",    sub: "Zero-liability, 256-bit encryption",       gradient: "linear-gradient(135deg,#10B981,#34D399)" },
  { label: "Mobile Banking",     sub: "Transact from any device, anytime",        gradient: "linear-gradient(135deg,#3B82F6,#60A5FA)" },
  { label: "Global Acceptance",  sub: "Accepted in 175+ countries worldwide",     gradient: "linear-gradient(135deg,#8B5CF6,#A78BFA)" },
  { label: "24/7 Support",       sub: "Real help, day or night",                  gradient: "linear-gradient(135deg,#EF4444,#F87171)" },
];

const ICONS = [
  <svg key={0} viewBox="0 0 36 36" className="w-7 h-7" fill="none"><rect x="4" y="9" width="28" height="18" rx="3" stroke="white" strokeWidth="2.2"/><line x1="4" y1="15" x2="32" y2="15" stroke="white" strokeWidth="2.2"/><rect x="7" y="19" width="8" height="4" rx="1" fill="white" opacity="0.8"/></svg>,
  <svg key={1} viewBox="0 0 36 36" className="w-7 h-7" fill="none"><path d="M18 4 L21.5 13 L31 13 L24 19 L27 28 L18 22 L9 28 L12 19 L5 13 L14.5 13 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.2)"/></svg>,
  <svg key={2} viewBox="0 0 36 36" className="w-7 h-7" fill="none"><path d="M18 4 L7 9 V18 C7 25 12 31 18 33 C24 31 29 25 29 18 V9 Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="rgba(255,255,255,0.15)"/><path d="M13 18 L17 22 L23 15" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  <svg key={3} viewBox="0 0 36 36" className="w-7 h-7" fill="none"><rect x="11" y="4" width="14" height="28" rx="3" stroke="white" strokeWidth="2.2"/><rect x="14" y="7" width="8" height="14" rx="1" stroke="white" strokeWidth="1.5" opacity="0.7"/><circle cx="18" cy="26" r="1.5" fill="white"/></svg>,
  <svg key={4} viewBox="0 0 36 36" className="w-7 h-7" fill="none"><circle cx="18" cy="18" r="13" stroke="white" strokeWidth="2.2"/><ellipse cx="18" cy="18" rx="6" ry="13" stroke="white" strokeWidth="1.6"/><line x1="5" y1="18" x2="31" y2="18" stroke="white" strokeWidth="1.6"/><path d="M7 11 Q18 14 29 11" stroke="white" strokeWidth="1.4" fill="none"/><path d="M7 25 Q18 22 29 25" stroke="white" strokeWidth="1.4" fill="none"/></svg>,
  <svg key={5} viewBox="0 0 36 36" className="w-7 h-7" fill="none"><path d="M10 14 C10 8 26 8 26 14 C26 17.5 23 19 23 21.5" stroke="white" strokeWidth="2.2" strokeLinecap="round"/><circle cx="23" cy="25.5" r="1.8" fill="white"/><circle cx="18" cy="18" r="14" stroke="white" strokeWidth="1.5" opacity="0.3"/></svg>,
];

import { memo } from "react";

export const FeaturesSection = memo(function FeaturesSection() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ background: "#EDE9FE", color: "#6B5ED7" }}>Why Choose VMS</span>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">Smarter Benefits, Every Day</h2>
          <p className="text-gray-500 text-sm max-w-lg mx-auto">
            One card that pays your taxi fare, fills your fuel tank, and earns rewards at the gym — built for real South African life.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
          {FEATURES.map((f, i) => (
            <div key={i} className="flex flex-col items-center gap-3 p-4 rounded-2xl border border-transparent hover:border-purple-100 hover:shadow-lg hover:-translate-y-1 transition-all group cursor-pointer"
              style={{ background: "#FAFAFA" }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform"
                style={{ background: f.gradient }}>
                {ICONS[i]}
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-gray-800 leading-tight">{f.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{f.sub}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <a href="#" className="text-sm font-semibold hover:underline" style={{ color: "#6B5ED7" }}>
            Explore All Features →
          </a>
        </div>
      </div>
    </section>
  );
});
