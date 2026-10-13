import { memo, useState } from "react";
import { ArrowRight, ShieldCheck, Headphones, Sparkles, Flame, Crown, Gift, Globe, Smartphone, Banknote, ArrowLeftRight, Plane, BadgePercent, TrendingDown } from "lucide-react";
import vinkGoldFeatureCard from "../../imports/VinkGoldFeatureCard.webp";
import { Card3DViewer } from "./Card3DViewer";
import type { PremiumIcon } from "./PremiumIcon";
import { ZoomImage } from "./ZoomImage";
import { BRAND } from "../brand";

const PURPLE = "var(--vk-brand)";           // brand red
const DEEP_PURPLE = "#101828";                // ink: the chip always carries white text
const GOLD = BRAND.crimson;
// The cards use the website's own background and text colours (so they follow the light and dark themes); only the icon medallions carry colour: brand red on navy.
const GOLD_METAL = "#FF6B81";      // the medallions (brand red, on-dark tint)
const INK = "#101828";             // the navy each medallion is built on

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

function BenefitCard({ b, index }: { b: Benefit; index: number }) {
  const Icon = b.icon;
  return (
    <div className={`group vkp-card vkp-rise p-5 flex flex-col ${b.featured ? "vkp-card-hot" : ""}`} style={{ animationDelay: `${index * 70}ms` }}>
      <span aria-hidden="true" className={`absolute right-4 top-3 text-[11px] font-bold tracking-widest ${b.featured ? "text-white/70" : "text-fg-subtle"}`} style={{ fontFamily: "var(--font-mono)" }}>{String(index + 1).padStart(2, "0")}</span>
      <span aria-hidden="true" className={`mb-4 size-14 rounded-2xl ${b.featured ? "vkp-tile-glass inline-flex items-center justify-center" : "vkp-tile"}`}>
        <Icon aria-hidden className="size-6 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.7} />
      </span>
      <p className={`text-base font-bold mb-1.5 ${b.featured ? "text-white" : "text-fg"}`}>{b.title}</p>
      <p className={`text-[13px] leading-relaxed mb-4 ${b.featured ? "text-white/85" : "text-fg-muted"}`}>{b.desc}</p>
      <div className="mt-auto flex items-center justify-between gap-2 flex-wrap">
        <span aria-hidden="true" className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${b.featured ? "bg-white text-[#c8102e]" : "bg-surface-2 text-crimson-text group-hover:bg-brand group-hover:text-brand-fg"}`}>
          <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
        {b.featured && (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white" style={{ color: "#c8102e" }}>
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
    <section className="relative overflow-hidden py-14 sm:py-20" style={{ background: "linear-gradient(180deg,var(--vk-bg),var(--vk-warm))" }}>
      <div aria-hidden="true" className="vkp-dots" />
      <div aria-hidden="true" className="vkp-glow -right-24 top-10 h-80 w-80 opacity-[0.16]" style={{ background: "#c8102e" }} />
      <div aria-hidden="true" className="vkp-glow -left-24 bottom-0 h-72 w-72 opacity-[0.1]" style={{ background: "#101828" }} />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          {/* Left: copy + card visual */}
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-[0.14em] mb-2 text-gold-text">More Than a Card</span>
            <div className="w-10 h-1 rounded-full mb-5" style={{ background: `linear-gradient(90deg,${PURPLE},${GOLD})` }} />
            <h2 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-[-0.015em] text-fg font-semibold">
              Designed for the way <span className="vkp-gradient-text">you</span> live
            </h2>
            <p className="text-fg-muted text-lg mt-5 max-w-md leading-relaxed">
              Unlock a world of exclusive benefits that reward your everyday and elevate every moment.
            </p>
            <p className="mt-3 inline-block rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted">Planned benefits, available at our June 2027 launch.</p>

            <div className="relative mt-10 max-w-sm">
              {/* the spotlight and the floor the card stands on */}
              <div aria-hidden="true" className="absolute -inset-10 rounded-full opacity-60" style={{ background: "radial-gradient(circle,rgba(200,16,46,0.28),transparent 68%)" }} />
              <div aria-hidden="true" className="absolute -bottom-7 left-6 right-6 h-6 rounded-[50%] opacity-60 blur-xl" style={{ background: "rgba(16,24,40,0.55)" }} />
              <button type="button" onClick={() => setShowCardViewer(true)} aria-label="View the VINK Visa Signature card in 3D" className="vkp-float relative block w-full rounded-2xl">
                {/* Rolling the mouse over the card magnifies the part under it; a tap or a click opens it in 3D */}
                <span className="relative block rounded-[1.15rem] p-[2px]" style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.9),rgba(200,16,46,0.55) 45%,rgba(16,24,40,0.5))", boxShadow: "0 30px 60px -24px rgba(16,24,40,0.6)" }}>
                  <span className="relative block aspect-[640/404] w-full overflow-hidden rounded-2xl">
                    <ZoomImage src={vinkGoldFeatureCard} alt="VINK Visa Signature card" zoom={2.2} className="h-full w-full object-cover" />
                  </span>
                </span>
              </button>

              <div className="absolute -top-4 right-2 vkp-chip rounded-xl px-3 py-2 flex items-center gap-2">
                <span aria-hidden="true" className="vkp-tile size-7 rounded-lg"><Headphones className="size-3.5" /></span>
                <span className="text-xs font-bold text-fg leading-tight">24/7<br />Support</span>
              </div>
              <div className="absolute -left-4 bottom-16 vkp-chip rounded-xl px-3 py-2 flex items-center gap-2">
                <span aria-hidden="true" className="vkp-tile size-7 rounded-lg"><ShieldCheck className="size-3.5" /></span>
                <span className="text-xs font-bold text-fg leading-tight">Secure<br />Transactions</span>
              </div>
              <div className="absolute -bottom-4 left-6 rounded-full px-4 py-2 shadow-lg flex items-center gap-1.5" style={{ background: DEEP_PURPLE }}>
                <span className="text-white text-xs font-bold inline-flex items-center gap-1"><Sparkles className="size-3 text-[#FF6B81]" aria-hidden="true" />Smart. Simple. Smarter.</span>
              </div>
            </div>
            <p className="mt-9 hidden max-w-sm text-center text-xs font-medium text-fg-muted [@media(hover:hover)]:block">Roll over image to zoom in · click the card to open it</p>
            <p className="mt-9 max-w-sm text-center text-xs font-medium text-fg-muted [@media(hover:hover)]:hidden">Tap the card to see it in 3D</p>
          </div>

          {/* Right: benefit cards */}
          <div className="grid sm:grid-cols-3 gap-4">
            {BENEFITS.map((b, i) => <BenefitCard key={b.title} b={b} index={i} />)}
          </div>
        </div>

        {/* Stats strip */}
        <div className="vkp-dark vkp-grain relative mt-12 overflow-hidden rounded-3xl px-6 py-7 shadow-overlay sm:px-10">
          <div aria-hidden="true" className="vkp-dots opacity-60" />
          <div aria-hidden="true" className="vkp-glow -right-10 -top-16 h-52 w-52 opacity-40" style={{ background: "#c8102e" }} />
          <div className="relative z-[1] grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4 lg:gap-0">
            {STATS.map((s, i) => (
              <div key={s.label} className={`group flex items-center gap-3.5 lg:px-6 ${i > 0 ? "lg:border-l lg:border-white/15" : "lg:pl-0"}`}>
                <span aria-hidden="true" className="vkp-tile-glass inline-flex size-12 shrink-0 items-center justify-center rounded-2xl"><s.Icon aria-hidden className="size-5 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.7} /></span>
                <div>
                  <p className="text-2xl leading-tight text-white" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{s.value}</p>
                  <p className="text-xs text-white/70 leading-snug">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
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
