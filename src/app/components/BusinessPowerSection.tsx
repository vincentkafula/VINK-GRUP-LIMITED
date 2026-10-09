import { memo } from "react";
import { Globe, BadgePercent, ShieldCheck, ArrowRight } from "lucide-react";
import { PremiumIcon } from "./PremiumIcon";

const GOLD = "#e0c068";

const STATS = [
  { value: "4", label: "Initial Markets", sub: "South Africa, the US, Zambia, and China", icon: Globe },
  { value: "Local", label: "Rates, Always", sub: "No international fees, no hidden markups", icon: BadgePercent },
  { value: "256-bit", label: "Encryption", sub: "Bank-grade security on every payment", icon: ShieldCheck },
];

const MARKETS = ["🇿🇦 South Africa", "🇺🇸 United States", "🇿🇲 Zambia", "🇨🇳 China"];

export const BusinessPowerSection = memo(function BusinessPowerSection({ onSubNavClick }: { onSubNavClick?: (item: string) => void }) {
  return (
    <section className="py-14 sm:py-20 lg:py-24 relative overflow-hidden" style={{ background: "linear-gradient(160deg,#0c0e14 0%,#1a0d12 55%,#2e0b10 100%)" }}>
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-5 pointer-events-none"
        style={{ background: "radial-gradient(circle,#8b0000,transparent)", transform: "translate(30%,-20%)" }} />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-5 pointer-events-none"
        style={{ background: "radial-gradient(circle,#e0c068,transparent)", transform: "translate(-30%,30%)" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-12 lg:gap-16 xl:gap-20 items-center">
          <div className="text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-3 mb-6">
              <span className="text-xs sm:text-[13px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>Global Payments</span>
              <span aria-hidden="true" className="h-px w-12 sm:w-16" style={{ background: `linear-gradient(90deg,${GOLD},transparent)` }} />
            </div>

            <h2 className="text-[2.5rem] sm:text-5xl xl:text-[3.5rem] leading-[1.05] text-white mb-7 tracking-[-0.015em]" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>
              Cross-border payments{" "}
              <span style={{ backgroundImage: "linear-gradient(180deg,#F6E3A6 0%,#E0C068 45%,#B88A20 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>shouldn&apos;t cost a fortune.</span>
            </h2>

            <p className="text-white/80 text-lg sm:text-xl leading-[1.65] mb-8 max-w-2xl mx-auto lg:mx-0">
              People around the world pay a fortune to send money across borders — often 10% or more in fees just to support a loved one. Businesses fare no better, losing significant money every time they purchase or import goods from abroad.
            </p>

            {/* Pull quote: the core value proposition gets its own visual weight */}
            <div className="max-w-2xl mx-auto lg:mx-0 mb-8 lg:pl-6 lg:border-l-2 text-left" style={{ borderColor: GOLD }}>
              <p className="text-white/75 text-base sm:text-[17px] leading-relaxed mb-3 text-center lg:text-left">
                Once you qualify for a VINK card, every transaction — even cross-border transfers — is charged at local rates.
              </p>
              <p className="text-white text-[1.65rem] sm:text-[2rem] leading-[1.25] text-center lg:text-left" style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, letterSpacing: "-0.005em" }}>
                No international fees. No hidden markups.{" "}
                <span style={{ color: GOLD }}>Just local pricing</span>, wherever you send or spend.
              </p>
            </div>

            <p className="text-white/80 text-base sm:text-lg leading-relaxed mb-4 max-w-2xl mx-auto lg:mx-0">
              VINK has eliminated these fees in its initial markets, with more countries coming soon:
            </p>

            {/* Country badges: makes "4 markets" concrete rather than an abstract stat */}
            <ul className="flex flex-wrap justify-center lg:justify-start gap-2.5 mb-9 list-none p-0">
              {MARKETS.map((country) => (
                <li key={country} className="text-sm sm:text-[15px] font-semibold px-4 py-2 rounded-full"
                  style={{ background: "linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04))", border: "1px solid rgba(224,192,104,.35)", color: "rgba(255,255,255,.92)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.12)" }}>
                  {country}
                </li>
              ))}
            </ul>

            <p className="text-white/65 text-[15px] sm:text-base leading-relaxed mb-10 max-w-2xl mx-auto lg:mx-0 pt-6 border-t border-white/10">
              We&apos;re not a traditional bank — VINK is a cloud-based banking platform issuing Visa and Mastercard-powered cards, built for how people and businesses actually move money today.
            </p>

            <div className="flex flex-wrap justify-center lg:justify-start gap-3.5">
              <button onClick={() => onSubNavClick?.("Start My Business")} className="group inline-flex items-center gap-2.5 px-9 py-4 rounded-xl text-base font-bold transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5"
                style={{ background: "var(--vk-brand)", color: "var(--vk-brand-fg)", boxShadow: "0 14px 32px -8px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,0.18)", letterSpacing: "0.01em" }}>
                See How It Works <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </button>
              <button onClick={() => onSubNavClick?.("BusinessHome")} className="px-9 py-4 rounded-xl text-base font-semibold transition-all hover:bg-white/10"
                style={{ border: "1px solid rgba(224,192,104,.45)", color: "rgba(255,255,255,.9)" }}>
                Learn More
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4 lg:gap-5">
            {STATS.map((s) => (
              <div key={s.label} className="group rounded-2xl p-6 flex flex-col lg:flex-row items-center text-center lg:text-left gap-5 hover:-translate-y-1 transition-all duration-300"
                style={{ background: "linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03))", border: "1px solid rgba(224,192,104,.22)", boxShadow: "0 18px 36px -18px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.10)" }}>
                <PremiumIcon icon={s.icon} accent="#D4AF5A" dark="#1A0D10" size={64} />
                <div>
                  <p className="text-3xl leading-none mb-2 text-white" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{s.value}</p>
                  <p className="text-base font-semibold leading-tight" style={{ color: "#EBD592" }}>{s.label}</p>
                  <p className="text-sm text-white/70 mt-1.5 leading-snug">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
