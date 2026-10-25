import { memo } from "react";
import { Globe, BadgePercent, ShieldCheck, ArrowRight } from "lucide-react";
import { spot } from "./premiumFx";
import { useReveal } from "./useReveal";
const ACCENT = "var(--vk-crimson-text)";   // brand red as text: #C8102E on the light theme, the lighter tint on the dark one

const STATS = [
  { value: "4", label: "Initial Markets", sub: "South Africa, the US, Zambia, and China", icon: Globe },
  { value: "Local", label: "Rates, Always", sub: "No international fees, no hidden markups", icon: BadgePercent },
  { value: "256-bit", label: "Encryption", sub: "Bank-grade security on every payment", icon: ShieldCheck },
];

const MARKETS = ["🇿🇦 South Africa", "🇺🇸 United States", "🇿🇲 Zambia", "🇨🇳 China"];

/** The four markets as glowing points, joined by moving routes: a picture of money moving at local rates. Decoration only. */
function RouteMap() {
  const nodes = [
    { id: "us", x: 70, y: 70, label: "US" }, { id: "cn", x: 330, y: 62, label: "CN" },
    { id: "zm", x: 205, y: 168, label: "ZM" }, { id: "za", x: 182, y: 238, label: "ZA" },
  ];
  const routes = ["M70 70 Q 140 20 205 168", "M330 62 Q 300 130 205 168", "M205 168 Q 215 205 182 238", "M70 70 Q 90 190 182 238", "M330 62 Q 330 190 182 238"];
  return (
    <div aria-hidden="true" className="vkp-glass-dark relative col-span-full overflow-hidden rounded-2xl sm:col-span-3 lg:col-span-1 lg:mx-auto lg:w-3/5">
      <svg viewBox="0 38 400 226" className="block h-auto w-full" role="presentation">
        <defs>
          <radialGradient id="vkp-node" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#e8405b" /><stop offset="1" stopColor="#c8102e" stopOpacity="0" /></radialGradient>
          <linearGradient id="vkp-route" x1="0" x2="1"><stop offset="0" stopColor="#c8102e" stopOpacity="0.1" /><stop offset="0.5" stopColor="#c8102e" /><stop offset="1" stopColor="#c8102e" stopOpacity="0.1" /></linearGradient>
        </defs>
        {Array.from({ length: 12 }).map((_, r) => Array.from({ length: 18 }).map((__, c) => <circle key={r + "-" + c} cx={14 + c * 22} cy={14 + r * 24} r="1.2" fill="currentColor" opacity="0.14" />))}
        {routes.map((d, i) => <path key={i} d={d} fill="none" stroke="url(#vkp-route)" strokeWidth="1.6" className="vkp-dash" style={{ animationDelay: `${i * 0.5}s` }} />)}
        {nodes.map((n, i) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r="26" fill="url(#vkp-node)" className="vkp-blink" style={{ animationDelay: `${i * 0.4}s` }} />
            <circle cx={n.x} cy={n.y} r="5" fill="#c8102e" stroke="#fff" strokeWidth="2" />
            <text x={n.x} y={n.y - 14} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" letterSpacing="1.5">{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export const BusinessPowerSection = memo(function BusinessPowerSection({ onSubNavClick }: { onSubNavClick?: (item: string) => void }) {
  const rText = useReveal(), rSide = useReveal(120);
  return (
    <section className="vkp-ivory vkp-ivory-alt py-5 sm:py-6 lg:py-6 relative overflow-hidden">
      {/* a dotted "map" fading in from the right, and two soft glows */}
      <div aria-hidden="true" className="vkp-hairline absolute inset-x-0 top-0" />
      <div aria-hidden="true" className="vkp-dots" style={{ WebkitMaskImage: "radial-gradient(ellipse 60% 80% at 85% 45%, #000 20%, transparent 75%)", maskImage: "radial-gradient(ellipse 60% 80% at 85% 45%, #000 20%, transparent 75%)" }} />
      <div aria-hidden="true" className="vkp-glow -right-28 top-1/4 h-96 w-96 opacity-10" style={{ background: "#c8102e" }} />
      <div aria-hidden="true" className="vkp-glow -left-24 bottom-10 h-72 w-72" style={{ background: "var(--vk-glow-rose)" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-6 lg:gap-8 xl:gap-10 items-center">
          <div ref={rText.ref} style={rText.style} className={"text-center lg:text-left " + rText.className}>
            <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
              <span className="text-xs sm:text-[13px] font-bold uppercase tracking-[0.22em]" style={{ color: ACCENT }}>Global Payments</span>
              <span aria-hidden="true" className="h-px w-12 sm:w-16" style={{ background: `linear-gradient(90deg,${ACCENT},transparent)` }} />
            </div>

            <h2 className="text-[1.6rem] sm:text-[1.75rem] xl:text-[1.875rem] leading-[1.1] text-ink mb-2.5 tracking-[-0.015em]" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
              Cross-border payments{" "}
              <span className="vkp-gradient-text">shouldn&apos;t cost a fortune.</span>
            </h2>

            <p className="text-ink-2 text-sm leading-relaxed mb-2.5 max-w-3xl mx-auto lg:mx-0">
              People around the world pay a fortune to send money across borders — often 10% or more in fees just to support a loved one. Businesses fare no better, losing significant money every time they purchase or import goods from abroad.
            </p>

            {/* Pull quote: the core value proposition gets its own visual weight */}
            <div className="relative max-w-3xl mx-auto lg:mx-0 mb-2.5 vkp-glass-dark rounded-xl p-3 text-left lg:pl-6">
                <span aria-hidden="true" className="absolute inset-y-4 left-0 hidden w-1 rounded-full lg:block" style={{ background: "linear-gradient(180deg,#e8405b,#c8102e 55%,#101828)" }} />
              <p className="text-ink-2 text-sm leading-snug mb-1.5 text-center lg:text-left">
                Once you qualify for a VINK card, every transaction — even cross-border transfers — is charged at local rates.
              </p>
              <p className="text-ink text-base sm:text-lg leading-[1.25] text-center lg:text-left" style={{ fontFamily: "var(--font-display)", fontWeight: 500, letterSpacing: "-0.005em" }}>
                No international fees. No hidden markups.{" "}
                <span className="vkp-gradient-text">Just local pricing</span>, wherever you send or spend.
              </p>
            </div>

            <p className="text-ink-2 text-sm leading-snug mb-1.5 max-w-3xl mx-auto lg:mx-0">
              VINK has eliminated these fees in its initial markets, with more countries coming soon:
            </p>

            {/* Country badges: makes "4 markets" concrete rather than an abstract stat */}
            <ul className="flex flex-wrap justify-center lg:justify-start gap-2 mb-2.5 list-none p-0">
              {MARKETS.map((country) => (
                <li key={country} className="vkp-glass-dark text-xs sm:text-[13px] font-semibold px-2.5 py-0.5 rounded-full text-ink transition-all duration-300 hover:-translate-y-0.5 hover:bg-white">
                  {country}
                </li>
              ))}
            </ul>

            <p className="text-ink-2 text-sm leading-snug mb-3 max-w-3xl mx-auto lg:mx-0 pt-2.5 border-t border-hair">
              We&apos;re not a traditional bank — VINK is a cloud-based banking platform issuing Visa and Mastercard-powered cards, built for how people and businesses actually move money today.
            </p>

            <div className="flex flex-wrap justify-center lg:justify-start gap-3">
              <button onClick={() => onSubNavClick?.("Start My Business")} className="vkp-cta group inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg,#e8405b,#c8102e 60%,#a50f27)", color: "#fff", boxShadow: "0 16px 32px -12px rgba(200,16,46,.7), inset 0 1px 0 rgba(255,255,255,0.3)", letterSpacing: "0.01em" }}>
                See How It Works <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </button>
              <button onClick={() => onSubNavClick?.("BusinessHome")} className="px-5 py-2 rounded-lg text-sm font-semibold transition-all hover:bg-white"
                style={{ border: "1px solid var(--vk-hair)", color: "var(--vk-ink)", background: "var(--vk-surface)" }}>
                Learn More
              </button>
            </div>
          </div>

          <div ref={rSide.ref} style={rSide.style} className={"grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5 " + rSide.className}>
            <RouteMap />
            {STATS.map((s) => (
              <div key={s.label} {...spot} className="group vkp-spot p-2 flex flex-col lg:flex-row items-center text-center lg:text-left gap-2 lg:gap-3.5">
                <span aria-hidden="true" className="vkp-tile size-8 shrink-0 rounded-lg"><s.icon aria-hidden="true" className="size-5 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.7} /></span>
                <div>
                  <p className="text-lg leading-none mb-0.5 text-ink" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{s.value}</p>
                  <p className="text-[13px] font-semibold leading-tight text-ink">{s.label}</p>
                  <p className="text-[11.5px] text-ink-2 mt-0 leading-snug">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
