import { memo } from "react";

interface Props { onOpenApps: () => void; }

const APPS = [
  { emoji: "🚌", name: "Vink AFC Terminal",  sub: "T-T20 · Fare collection",         gradient: "linear-gradient(135deg,#5B2D8E,#9585EA)", platform: "iOS · Android" },
  { emoji: "📍", name: "Vink Fleet Tracker", sub: "Vehicle tracking",         gradient: "linear-gradient(135deg,#065F46,#10B981)", platform: "iOS · Android" },
  { emoji: "💳", name: "Vink Banking",        sub: "Personal & business",      gradient: "linear-gradient(135deg,#3B2D8E,#7B6FE8)", platform: "iOS · Android" },
  { emoji: "🚗", name: "Vink Driver",         sub: "Earn · Drive · Get paid",  gradient: "linear-gradient(135deg,#0F172A,#14B8A6)", platform: "iOS · Android" },
  { emoji: "🚕", name: "Vink Ride",           sub: "Book rides · Earn as driver", gradient: "linear-gradient(135deg,#BE185D,#EC4899)", platform: "iOS · Android" },
  { emoji: "🍽️", name: "VMS Food",           sub: "Order food · Track delivery", gradient: "linear-gradient(135deg,#FF5722,#FF8A50)", platform: "iOS · Android" },
];

export const AppShowcaseSection = memo(function AppShowcaseSection({ onOpenApps }: Props) {
  const P = "#5B2D8E";

  return (
    <section className="py-16 sm:py-20" style={{ background: "#0A0A14" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-10">
          <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.15)", color: "#F5A623" }}>
            VMS Super App Ecosystem
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
            5 Apps. One System.<br className="sm:hidden" /> Built for Southern Africa.
          </h2>
          <p className="text-white/50 text-sm max-w-lg mx-auto leading-relaxed">
            Each app operates independently, downloads separately, and connects to the same VMS backend — powering taxis, drivers, passengers, businesses, and fleet operators.
          </p>
        </div>

        {/* App icon row */}
        <div className="flex justify-center flex-wrap gap-4 mb-10">
          {APPS.map((app, i) => (
            <button
              key={i}
              onClick={onOpenApps}
              className="flex flex-col items-center gap-2 group cursor-pointer hover:-translate-y-1 transition-all duration-200"
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg group-hover:shadow-xl transition-shadow"
                style={{ background: app.gradient }}>
                {app.emoji}
              </div>
              <div className="text-center">
                <p className="text-white text-[11px] font-bold leading-tight">{app.name}</p>
                <p className="text-white/40 text-[10px]">{app.platform}</p>
              </div>
            </button>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onOpenApps}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-white font-black text-base transition-all hover:scale-105 active:scale-95 shadow-xl"
            style={{ background: `linear-gradient(135deg,${P},#9585EA)`, boxShadow: `0 8px 32px ${P}50` }}
          >
            <span className="text-2xl">📲</span>
            Browse All Apps
          </button>
          <div className="flex items-center gap-3">
            {/* App Store badge */}
            <a href="#" onClick={e => { e.preventDefault(); onOpenApps(); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white flex-shrink-0">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div>
                <p className="text-white/50 text-[8px] leading-none">Download on the</p>
                <p className="text-white text-xs font-bold leading-tight">App Store</p>
              </div>
            </a>
            {/* Google Play badge */}
            <a href="#" onClick={e => { e.preventDefault(); onOpenApps(); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all">
              <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0">
                <path fill="#34A853" d="m1.22 0 .65.65 11.65 11.65-11.65 11.65-.65.65C.46 23.62 0 22.64 0 21.56V2.44C0 1.36.46.38 1.22 0z"/>
                <path fill="#FBBC04" d="m17.8 12-2.35 2.35L3.73 6.56 7.07 3.22z"/>
                <path fill="#EA4335" d="m17.8 12-10.73 5.44L3.73 17.44l11.72-7.79z"/>
                <path fill="#4285F4" d="m1.22 24 .65-.65L17.8 12l3.68 3.68-17.48 8.86C3.17 25.03 2.02 24.88 1.22 24z"/>
              </svg>
              <div>
                <p className="text-white/50 text-[8px] leading-none">Get it on</p>
                <p className="text-white text-xs font-bold leading-tight">Google Play</p>
              </div>
            </a>
          </div>
        </div>

        {/* Connection note */}
        <p className="text-center text-white/30 text-[11px] mt-6 max-w-md mx-auto">
          All 5 apps share a single backend system. Download each separately for your role — operator, driver, passenger, or fleet manager.
        </p>
      </div>
    </section>
  );
});
