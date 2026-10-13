import { memo } from "react";
import { Globe, BadgePercent, ShieldCheck, ArrowRight } from "lucide-react";
const ACCENT = "var(--vk-crimson-text)";   // brand red as text: #C8102E on the light theme, the lighter tint on the dark one

const STATS = [
  { value: "4", label: "Initial Markets", sub: "South Africa, the US, Zambia, and China", icon: Globe },
  { value: "Local", label: "Rates, Always", sub: "No international fees, no hidden markups", icon: BadgePercent },
  { value: "256-bit", label: "Encryption", sub: "Bank-grade security on every payment", icon: ShieldCheck },
];

const MARKETS = ["🇿🇦 South Africa", "🇺🇸 United States", "🇿🇲 Zambia", "🇨🇳 China"];

export const BusinessPowerSection = memo(function BusinessPowerSection({ onSubNavClick }: { onSubNavClick?: (item: string) => void }) {
  return (
    <section className="bg-bg py-16 sm:py-24 lg:py-28 relative overflow-hidden">
      {/* a dotted "map" fading in from the right, and two soft glows */}
      <div aria-hidden="true" className="vkp-dots" style={{ WebkitMaskImage: "radial-gradient(ellipse 60% 80% at 85% 45%, #000 20%, transparent 75%)", maskImage: "radial-gradient(ellipse 60% 80% at 85% 45%, #000 20%, transparent 75%)" }} />
      <div aria-hidden="true" className="vkp-glow -right-28 top-1/4 h-96 w-96 opacity-[0.14]" style={{ background: "#c8102e" }} />
      <div aria-hidden="true" className="vkp-glow -left-24 bottom-10 h-72 w-72 opacity-[0.08]" style={{ background: "#101828" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-12 lg:gap-16 xl:gap-20 items-center">
          <div className="text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-3 mb-6">
              <span className="text-xs sm:text-[13px] font-bold uppercase tracking-[0.22em]" style={{ color: ACCENT }}>Global Payments</span>
              <span aria-hidden="true" className="h-px w-12 sm:w-16" style={{ background: `linear-gradient(90deg,${ACCENT},transparent)` }} />
            </div>

            <h2 className="text-[2.5rem] sm:text-5xl xl:text-[3.5rem] leading-[1.05] text-fg mb-7 tracking-[-0.015em]" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
              Cross-border payments{" "}
              <span className="vkp-gradient-text">shouldn&apos;t cost a fortune.</span>
            </h2>

            <p className="text-fg-muted text-lg sm:text-xl leading-[1.65] mb-8 max-w-2xl mx-auto lg:mx-0">
              People around the world pay a fortune to send money across borders — often 10% or more in fees just to support a loved one. Businesses fare no better, losing significant money every time they purchase or import goods from abroad.
            </p>

            {/* Pull quote: the core value proposition gets its own visual weight */}
            <div className="relative max-w-2xl mx-auto lg:mx-0 mb-8 rounded-2xl border border-line bg-surface p-6 text-left shadow-card lg:pl-8">
                <span aria-hidden="true" className="absolute inset-y-4 left-0 hidden w-1 rounded-full lg:block" style={{ background: "linear-gradient(180deg,#e8405b,#c8102e 55%,#101828)" }} />
              <p className="text-fg-muted text-base sm:text-[17px] leading-relaxed mb-3 text-center lg:text-left">
                Once you qualify for a VINK card, every transaction — even cross-border transfers — is charged at local rates.
              </p>
              <p className="text-fg text-[1.65rem] sm:text-[2rem] leading-[1.25] text-center lg:text-left" style={{ fontFamily: "var(--font-display)", fontWeight: 500, letterSpacing: "-0.005em" }}>
                No international fees. No hidden markups.{" "}
                <span className="vkp-gradient-text">Just local pricing</span>, wherever you send or spend.
              </p>
            </div>

            <p className="text-fg-muted text-base sm:text-lg leading-relaxed mb-4 max-w-2xl mx-auto lg:mx-0">
              VINK has eliminated these fees in its initial markets, with more countries coming soon:
            </p>

            {/* Country badges: makes "4 markets" concrete rather than an abstract stat */}
            <ul className="flex flex-wrap justify-center lg:justify-start gap-2.5 mb-9 list-none p-0">
              {MARKETS.map((country) => (
                <li key={country} className="vkp-chip text-sm sm:text-[15px] font-semibold px-4 py-2 rounded-full text-fg transition-all duration-300 hover:-translate-y-0.5 hover:border-brand">
                  {country}
                </li>
              ))}
            </ul>

            <p className="text-fg-muted text-[15px] sm:text-base leading-relaxed mb-10 max-w-2xl mx-auto lg:mx-0 pt-6 border-t border-line">
              We&apos;re not a traditional bank — VINK is a cloud-based banking platform issuing Visa and Mastercard-powered cards, built for how people and businesses actually move money today.
            </p>

            <div className="flex flex-wrap justify-center lg:justify-start gap-3.5">
              <button onClick={() => onSubNavClick?.("Start My Business")} className="group inline-flex items-center gap-2.5 px-9 py-4 rounded-xl text-base font-bold transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg,#e8405b,#c8102e 60%,#a50f27)", color: "#fff", boxShadow: "0 16px 32px -12px rgba(200,16,46,.7), inset 0 1px 0 rgba(255,255,255,0.3)", letterSpacing: "0.01em" }}>
                See How It Works <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </button>
              <button onClick={() => onSubNavClick?.("BusinessHome")} className="px-9 py-4 rounded-xl text-base font-semibold transition-all hover:bg-surface-2"
                style={{ border: "1px solid var(--vk-line-strong)", color: "var(--vk-fg)" }}>
                Learn More
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4 lg:gap-5">
            {STATS.map((s) => (
              <div key={s.label} className="group vkp-card p-6 flex flex-col lg:flex-row items-center text-center lg:text-left gap-5">
                <span aria-hidden="true" className="vkp-tile size-16 shrink-0 rounded-2xl"><s.icon aria-hidden="true" className="size-7 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.7} /></span>
                <div>
                  <p className="text-3xl leading-none mb-2 text-fg" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{s.value}</p>
                  <p className="text-base font-semibold leading-tight text-fg">{s.label}</p>
                  <p className="text-sm text-fg-muted mt-1.5 leading-snug">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
