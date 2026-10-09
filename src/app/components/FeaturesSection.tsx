import { memo, useState } from "react";
import { ArrowRight, ShieldCheck, Headphones, Sparkles, Flame, Crown, Gift, Globe, Smartphone, Banknote, ArrowLeftRight, Plane, BadgePercent, TrendingDown } from "lucide-react";
import vinkGoldFeatureCard from "../../imports/VinkGoldFeatureCard.webp";
import { Card3DViewer } from "./Card3DViewer";
import { PremiumIcon } from "./PremiumIcon";

const PURPLE = "var(--vk-brand)";           // crimson in light, gold in dark
const DEEP_PURPLE = "#0c0e14";                // ink: the chip always carries white text
const GOLD = "#c9a84c";
// One palette for the whole block, taken from the brand (crimson and gold on warm ink) instead of a different neon colour for each card.
const GOLD_METAL = "#D4AF5A";      // the medallions and arrows
const GOLD_SOFT = "#EBD592";       // card titles
const INK = "#1A0D10";             // the warm dark each medallion and card is built on
const CRIMSON_GLOW = "139,0,0";    // the brand crimson (#8b0000), as an rgb triple for the glows

interface Benefit { icon: React.ComponentProps<typeof PremiumIcon>["icon"]; title: string; desc: string; featured: boolean; color: string; colorDark: string }

const BENEFITS: Benefit[] = [
  { icon: Gift, title: "Rewards", desc: "Earn points on every spend and redeem for exciting rewards and offers.", featured: false, color: GOLD_METAL, colorDark: INK },
  { icon: Banknote, title: "Cash Back", desc: "Get real cash back on your purchases and save more every day.", featured: true, color: GOLD_METAL, colorDark: INK },
  { icon: ArrowLeftRight, title: "Balance Transfer", desc: "Transfer your balance easily and pay off debt faster.", featured: false, color: GOLD_METAL, colorDark: INK },
  { icon: Plane, title: "Travel", desc: "Exclusive travel benefits, airport lounge access, and more.", featured: false, color: GOLD_METAL, colorDark: INK },
  { icon: BadgePercent, title: "Zero Percent", desc: "Enjoy 0% interest on eligible purchases for a limited time.", featured: false, color: GOLD_METAL, colorDark: INK },
  { icon: TrendingDown, title: "Low Interest", desc: "Competitive interest rates that help you save more.", featured: false, color: GOLD_METAL, colorDark: INK },
];

const STATS = [
  { Icon: Crown, value: "5X", label: "Points on dining & entertainment", color: GOLD_METAL, text: "var(--vk-crimson-text)" },
  { Icon: Gift, value: "100+", label: "Partner brands and offers", color: GOLD_METAL, text: "var(--vk-crimson-text)" },
  { Icon: Globe, value: "0", label: "Foreign transaction fees", color: GOLD_METAL, text: "var(--vk-crimson-text)" },
  { Icon: Smartphone, value: "24/7", label: "Dedicated customer support", color: GOLD_METAL, text: "var(--vk-crimson-text)" },
];

function BenefitCard({ b }: { b: Benefit }) {
  return (
    <div
      className="group rounded-2xl p-4 flex flex-col transition-all duration-300 hover:-translate-y-1 relative overflow-hidden text-white"
      style={{
        background: `linear-gradient(160deg,#241216 0%,${b.colorDark} 45%,#0B0709 100%)`,
        border: `1px solid color-mix(in srgb, ${b.color} ${b.featured ? 55 : 24}%, transparent)`,
        boxShadow: `0 14px 32px -16px rgba(${CRIMSON_GLOW},0.7), 0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)${b.featured ? `, 0 0 0 1px color-mix(in srgb, ${b.color} 20%, transparent)` : ""}`,
      }}
    >
      {/* Ambient glow behind the icon, echoing the reference's per-icon lighting */}
      <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle,rgba(${CRIMSON_GLOW},0.5),transparent 70%)` }} />
      <div className="absolute -bottom-10 -left-8 w-32 h-32 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle,color-mix(in srgb, ${b.color} 14%, transparent),transparent 70%)` }} />

      <PremiumIcon icon={b.icon} accent={b.color} dark={b.colorDark} size={72} className="mb-3 mx-auto sm:mx-0" />
      <p className="text-base font-bold mb-1 text-center sm:text-left" style={{ color: GOLD_SOFT }}>{b.title}</p>
      <p className="text-[13px] leading-relaxed mb-3 text-white/75 text-center sm:text-left">{b.desc}</p>
      <div className="mt-auto flex items-center justify-center sm:justify-between gap-2 flex-wrap">
      <span aria-hidden="true" className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: `color-mix(in srgb, ${b.color} 15%, transparent)`, color: b.color, border: `1px solid color-mix(in srgb, ${b.color} 30%, transparent)` }}>
        <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      </span>
      {b.featured && (
        <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: GOLD, color: "#0c0e14", boxShadow: "0 2px 10px -2px rgba(201,168,76,0.6), inset 0 1px 0 rgba(255,255,255,0.45)" }}>
          <Flame className="size-3" aria-hidden="true" />Most Popular
        </span>
      )}
      </div>
    </div>
  );
}

export const FeaturesSection = memo(function FeaturesSection({ onExploreAll }: { onExploreAll?: () => void }) {
  const [showCardViewer, setShowCardViewer] = useState(false);
  return (
    <section className="py-10 sm:py-14" style={{ background: "var(--vk-bg)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          {/* Left: copy + card visual */}
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-[0.14em] mb-2 text-gold-text">More Than a Card</span>
            <div className="w-10 h-1 rounded-full mb-5" style={{ background: `linear-gradient(90deg,${PURPLE},${GOLD})` }} />
            <h2 className="font-display text-3xl sm:text-4xl leading-[1.08] text-fg font-semibold">
              Designed for the way <span className="text-gold-text">you</span> live
            </h2>
            <p className="text-fg-muted text-base mt-5 max-w-md leading-relaxed">
              Unlock a world of exclusive benefits that reward your everyday and elevate every moment.
            </p>
            <p className="mt-3 inline-block rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted">Planned benefits, available at our June 2027 launch.</p>

            <div className="relative mt-8 max-w-sm">
              <div className="absolute -inset-6 rounded-full opacity-40" style={{ background: `radial-gradient(circle,${GOLD}33,transparent 70%)` }} />
              <button type="button" onClick={() => setShowCardViewer(true)} aria-label="View the VINK Visa Signature card in 3D" className="relative block w-full rounded-2xl">
                <img src={vinkGoldFeatureCard} alt="VINK Visa Signature card" width={640} height={404} decoding="async" loading="lazy"
                  className="w-full rounded-2xl shadow-overlay transition-transform duration-300 hover:scale-[1.02]" draggable={false} />
              </button>

              <div className="absolute -top-4 right-2 bg-surface rounded-xl shadow-raised border border-line px-3 py-2 flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5 text-gold-text" />
                <span className="text-xs font-bold text-fg leading-tight">24/7<br />Support</span>
              </div>
              <div className="absolute -left-4 bottom-16 bg-surface rounded-xl shadow-raised border border-line px-3 py-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-gold-text" />
                <span className="text-xs font-bold text-fg leading-tight">Secure<br />Transactions</span>
              </div>
              <div className="absolute -bottom-4 left-6 rounded-full px-4 py-2 shadow-lg flex items-center gap-1.5" style={{ background: DEEP_PURPLE }}>
                <span className="text-white text-xs font-bold inline-flex items-center gap-1"><Sparkles className="size-3 text-[#e0c068]" aria-hidden="true" />Smart. Simple. Smarter.</span>
              </div>
            </div>
          </div>

          {/* Right: benefit cards */}
          <div className="grid sm:grid-cols-3 gap-4">
            {BENEFITS.map(b => <BenefitCard key={b.title} b={b} />)}
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-8 bg-surface rounded-2xl border border-line shadow-card px-6 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map(s => (
            <div key={s.label} className="group flex items-center gap-3">
              <PremiumIcon icon={s.Icon} accent={s.color} size={48} />
              <div>
                <p className="text-lg leading-tight" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: s.text }}>{s.value}</p>
                <p className="text-xs text-fg-muted leading-snug">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {onExploreAll && (
          <div className="text-center mt-7">
            <button onClick={onExploreAll} className="text-sm font-semibold text-brand hover:underline bg-transparent border-none cursor-pointer">
              Explore All Features →
            </button>
          </div>
        )}
      </div>

      <Card3DViewer isOpen={showCardViewer} onClose={() => setShowCardViewer(false)} image={vinkGoldFeatureCard} name="VINK Visa Signature" />
    </section>
  );
});
