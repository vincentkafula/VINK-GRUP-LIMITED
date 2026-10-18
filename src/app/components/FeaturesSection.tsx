import { memo, useState } from "react";
import { ArrowRight, ShieldCheck, Headphones, Sparkles, Flame, Crown, Gift, Globe, Smartphone, Banknote, ArrowLeftRight, Plane, BadgePercent, TrendingDown } from "lucide-react";
import vinkGoldFeatureCard from "../../imports/VinkGoldFeatureCard.webp";
import { Card3DViewer } from "./Card3DViewer";
import type { PremiumIcon } from "./PremiumIcon";
import { ZoomImage } from "./ZoomImage";
import { spot } from "./premiumFx";

interface Benefit { icon: React.ComponentProps<typeof PremiumIcon>["icon"]; title: string; desc: string; featured: boolean }

// Three benefits on each side of the card, so the card is the centre of the section.
const BENEFITS: Benefit[] = [
  { icon: Gift, title: "Rewards", desc: "Earn points on every spend and redeem for exciting rewards and offers.", featured: false },
  { icon: Banknote, title: "Cash Back", desc: "Get real cash back on your purchases and save more every day.", featured: true },
  { icon: ArrowLeftRight, title: "Balance Transfer", desc: "Transfer your balance easily and pay off debt faster.", featured: false },
  { icon: Plane, title: "Travel", desc: "Exclusive travel benefits, airport lounge access, and more.", featured: false },
  { icon: BadgePercent, title: "Zero Percent", desc: "Enjoy 0% interest on eligible purchases for a limited time.", featured: false },
  { icon: TrendingDown, title: "Low Interest", desc: "Competitive interest rates that help you save more.", featured: false },
];

const STATS = [
  { Icon: Crown, value: "5X", label: "Points on dining & entertainment" },
  { Icon: Gift, value: "100+", label: "Partner brands and offers" },
  { Icon: Globe, value: "0", label: "Foreign transaction fees" },
  { Icon: Smartphone, value: "24/7", label: "Dedicated customer support" },
];

function BenefitCard({ b, index }: { b: Benefit; index: number }) {
  const Icon = b.icon;
  return (
    <div {...spot} className={`group vkp-spot vkp-rise flex h-full flex-col p-3.5 ${b.featured ? "vkp-spot-hot" : ""}`} style={{ animationDelay: `${index * 80}ms` }}>
      <div className="mb-2 flex items-center gap-2.5">
        <span aria-hidden="true" className={`size-9 shrink-0 rounded-lg ${b.featured ? "vkp-tile-glass inline-flex items-center justify-center" : "vkp-tile"}`}>
          <Icon aria-hidden className="size-4 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.6} />
        </span>
        <p className="text-[15px] font-bold leading-tight text-white">{b.title}</p>
        <span aria-hidden="true" className="ml-auto self-start text-[11px] font-bold tracking-[0.2em] text-white/40" style={{ fontFamily: "var(--font-mono)" }}>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <p className={`mb-2.5 text-[12.5px] leading-snug ${b.featured ? "text-white/90" : "text-white/65"}`}>{b.desc}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span aria-hidden="true" className={`flex size-7 items-center justify-center rounded-full transition-all duration-300 group-hover:translate-x-0.5 ${b.featured ? "bg-white text-[color:var(--vkv-violet)]" : "bg-white/10 text-white group-hover:bg-white group-hover:text-[color:var(--vkv-violet)]"}`}>
          <ArrowRight className="size-3.5" />
        </span>
        {b.featured && (
          <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold" style={{ color: "var(--vkv-violet)" }}>
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
    <section className="vkp-ink vkp-violet vkp-grain relative overflow-hidden py-8 sm:py-10 lg:py-10">
      <div aria-hidden="true" className="vkp-dots" />
      <div aria-hidden="true" className="vkp-glow left-1/2 top-0 h-[26rem] w-[44rem] max-w-full -translate-x-1/2 opacity-30" style={{ background: "var(--vkv-violet)" }} />
      <div aria-hidden="true" className="vkp-glow -left-32 bottom-0 h-80 w-80 opacity-20" style={{ background: "#3b4cca" }} />
      <div className="relative z-[1] mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Heading: centred and large */}
        <div className="mx-auto max-w-4xl text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="inline-block rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--vkv-orchid-soft)]">More Than a Card</span>
            <p className="vkp-glass-dark inline-block rounded-full px-3 py-1 text-xs font-medium text-white/75">Planned benefits, available at our June 2027 launch.</p>
          </div>
          <h2 className="font-display mt-3 text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
            Designed for the way <span className="vkp-gradient-text">you</span> live
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
            Unlock a world of exclusive benefits that reward your everyday and elevate every moment.
          </p>
        </div>

        {/* The card on the left; the six benefits, small and close together, on the right */}
        <div className="mt-6 grid items-center gap-5 lg:mt-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
          {/* The card, on the left */}
          <div className="order-1">
            <div className="relative mx-auto max-w-sm py-4">
              <div aria-hidden="true" className="absolute inset-0 m-auto aspect-square w-[120%] rounded-full opacity-70" style={{ background: "radial-gradient(circle,rgba(93,30,251,0.55),transparent 62%)" }} />
              <div aria-hidden="true" className="absolute inset-0 m-auto aspect-square w-[108%] animate-[spin_70s_linear_infinite] rounded-full border border-dashed border-white/20 motion-reduce:animate-none" />
              <div aria-hidden="true" className="absolute inset-0 m-auto aspect-square w-[86%] animate-[spin_55s_linear_infinite_reverse] rounded-full border border-white/10 motion-reduce:animate-none" />
              <div aria-hidden="true" className="absolute -bottom-1 left-10 right-10 h-8 rounded-[50%] bg-black/70 blur-2xl" />
              <button type="button" onClick={() => setShowCardViewer(true)} aria-label="View the VINK Visa Signature card in 3D" className="vkp-float relative block w-full rounded-2xl">
                {/* Rolling the mouse over the card magnifies the part under it; a tap or a click opens it in 3D */}
                <span className="relative block rounded-[1.2rem] p-[2px]" style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.95),rgba(183,124,255,0.8) 40%,rgba(255,255,255,0.15))", boxShadow: "0 40px 70px -26px rgba(0,0,0,0.9), 0 0 60px -10px rgba(93,30,251,0.6)" }}>
                  <span className="relative block aspect-[640/404] w-full overflow-hidden rounded-2xl">
                    <ZoomImage src={vinkGoldFeatureCard} alt="VINK Visa Signature card" zoom={2.2} className="h-full w-full object-cover" />
                  </span>
                </span>
              </button>

              <div className="vkp-glass-dark absolute -top-1 right-0 flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg sm:-right-4">
                <span aria-hidden="true" className="vkp-tile size-7 rounded-lg"><Headphones className="size-3.5" /></span>
                <span className="text-xs font-bold leading-tight text-white">24/7<br />Support</span>
              </div>
              <div className="vkp-glass-dark absolute -left-1 bottom-14 flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg sm:-left-5">
                <span aria-hidden="true" className="vkp-tile size-7 rounded-lg"><ShieldCheck className="size-3.5" /></span>
                <span className="text-xs font-bold leading-tight text-white">Secure<br />Transactions</span>
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-2 shadow-lg">
                <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: "#101828" }}><Sparkles className="size-3 text-[color:var(--vkv-violet)]" aria-hidden="true" />Smart. Simple. Smarter.</span>
              </div>
            </div>
            <p className="mt-2 hidden text-center text-xs font-medium text-white/60 [@media(hover:hover)]:block">Roll over image to zoom in · click the card to open it</p>
            <p className="mt-2 text-center text-xs font-medium text-white/60 [@media(hover:hover)]:hidden">Tap the card to see it in 3D</p>
          </div>

          <div className="order-2 grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {BENEFITS.map((b, i) => <BenefitCard key={b.title} b={b} index={i} />)}
          </div>
        </div>

        {/* Figures */}
        <div className="mt-5 lg:mt-6">
          <div aria-hidden="true" className="vkp-hairline" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-3 lg:grid-cols-4 lg:gap-0">
            {STATS.map((s, i) => (
              <div key={s.label} className={`group flex flex-col items-center px-3 text-center lg:flex-row lg:justify-center lg:gap-3 lg:text-left ${i > 0 ? "lg:border-l lg:border-white/10" : ""}`}>
                <span aria-hidden="true" className="vkp-tile-glass mb-2 inline-flex size-9 shrink-0 items-center justify-center rounded-xl lg:mb-0"><s.Icon aria-hidden className="size-4 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.6} /></span>
                <div>
                  <p className="vkp-figure text-3xl leading-none sm:text-4xl">{s.value}</p>
                  <p className="mt-1.5 max-w-[12rem] text-sm leading-snug text-white/65">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="vkp-hairline" />
        </div>

        {onExploreAll && (
          <div className="mt-4 text-center">
            <button onClick={onExploreAll} className="cursor-pointer border-none bg-transparent text-sm font-semibold text-[color:var(--vkv-orchid-soft)] hover:underline">
              Explore All Features →
            </button>
          </div>
        )}
      </div>

      <Card3DViewer isOpen={showCardViewer} onClose={() => setShowCardViewer(false)} image={vinkGoldFeatureCard} name="VINK Visa Signature" />
    </section>
  );
});
