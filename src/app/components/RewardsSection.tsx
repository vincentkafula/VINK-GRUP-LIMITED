import { memo } from "react";
import { DollarSign, Gift, Tag, Star, Sparkles } from "lucide-react";

const GOLD = "#F5C842";
const PURPLE = "#7C3AED";

const PILLS = [
  { icon: Star, title: "Earn Points", sub: "On every transaction" },
  { icon: Gift, title: "Exclusive Rewards", sub: "Redeem amazing gifts" },
  { icon: Tag,  title: "Special Offers", sub: "Enjoy member-only deals" },
];

/**
 * A dedicated showcase for the Rewards benefit, pulled out of the small
 * benefit-card grid into its own section — the reference this was built
 * from is a full promotional composition, not a compact tile. Recreates
 * that composition's structure (dark radial background, a central icon
 * arrangement, gold display headline, three feature pills) using Lucide
 * icons with gradient/glow styling rather than photorealistic 3D renders,
 * which aren't something this environment can produce — the goal is the
 * same premium feel, built from what's actually achievable here.
 */
export const RewardsSection = memo(function RewardsSection() {
  return (
    <section className="relative overflow-hidden py-14 sm:py-20"
      style={{ background: "radial-gradient(ellipse at 50% 20%,#2E1065 0%,#150A35 55%,#0D0620 100%)" }}>
      {/* Ambient sparkle + orb accents, echoing the reference's scattered stars/dots */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[12%] left-[14%] w-2 h-2 rounded-full" style={{ background: GOLD, opacity: 0.7, boxShadow: `0 0 12px ${GOLD}` }} />
        <div className="absolute top-[22%] right-[18%] w-1.5 h-1.5 rounded-full" style={{ background: PURPLE, opacity: 0.6 }} />
        <div className="absolute bottom-[30%] left-[10%] w-1.5 h-1.5 rounded-full" style={{ background: GOLD, opacity: 0.5 }} />
        <Sparkles className="absolute top-[10%] left-[22%] w-5 h-5" style={{ color: GOLD, opacity: 0.55 }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full opacity-[0.14]"
          style={{ border: `1px solid ${GOLD}`, transform: "translate(-50%,-45%)" }} />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        {/* Central icon composition — coin, leaf/growth motif, gift, tag, coin stack */}
        <div className="relative flex items-end justify-center gap-3 mb-9" style={{ height: 120 }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center rotate-[-8deg] mb-1"
            style={{ background: "linear-gradient(160deg,#4C1D95,#2E1065)", boxShadow: "0 10px 24px -6px rgba(91,33,182,0.5)" }}>
            <Gift className="w-8 h-8" style={{ color: GOLD }} />
          </div>
          <div className="w-24 h-24 rounded-full flex items-center justify-center relative"
            style={{ background: `radial-gradient(circle,${GOLD} 0%,#C9861F 100%)`, boxShadow: `0 14px 34px -8px rgba(245,166,35,0.55)` }}>
            <DollarSign className="w-11 h-11" style={{ color: "#2E1065" }} strokeWidth={2.5} />
          </div>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center rotate-[8deg] mb-1"
            style={{ background: "linear-gradient(160deg,#4C1D95,#2E1065)", boxShadow: "0 10px 24px -6px rgba(91,33,182,0.5)" }}>
            <Tag className="w-8 h-8" style={{ color: GOLD }} />
          </div>
        </div>

        <h2 className="text-4xl sm:text-5xl mb-4" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: GOLD, textShadow: "0 2px 20px rgba(245,166,35,0.35)" }}>
          Rewards
        </h2>
        <div className="w-14 h-px mx-auto mb-5" style={{ background: `linear-gradient(90deg,transparent,${GOLD},transparent)` }} />
        <p className="text-white/75 text-base sm:text-lg max-w-lg mx-auto leading-relaxed mb-10">
          Earn points on every spend and redeem for exciting rewards and offers.
        </p>

        {/* Feature pills */}
        <div className="inline-flex flex-col sm:flex-row items-stretch sm:items-center gap-0 sm:gap-0 rounded-2xl sm:rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(245,166,35,.25)" }}>
          {PILLS.map((p, i) => (
            <div key={p.title}
              className={`flex items-center gap-3 px-6 py-4 ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-white/10" : ""}`}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(245,166,35,.15)" }}>
                <p.icon className="w-4 h-4" style={{ color: GOLD }} />
              </span>
              <div className="text-left">
                <p className="text-sm font-bold text-white leading-tight">{p.title}</p>
                <p className="text-[11.5px] text-white/55 leading-tight mt-0.5">{p.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});
