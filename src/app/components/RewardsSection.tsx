import { memo } from "react";
import { Star, Gift, Tag } from "lucide-react";
import rewardsIcon from "../../imports/RewardsIconComposition.png";

const GOLD = "#F5C842";

const PILLS = [
  { icon: Star, title: "Earn Points", sub: "On every transaction" },
  { icon: Gift, title: "Exclusive Rewards", sub: "Redeem amazing gifts" },
  { icon: Tag,  title: "Special Offers", sub: "Enjoy member-only deals" },
];

/**
 * Uses the actual uploaded icon composition (coin, plant, gift, tag, coin
 * stack, sparkles, background) as a real image, cropped to exclude the
 * "Rewards" headline and copy in the source file — those are rebuilt below
 * as real HTML text with a gold gradient + emboss treatment, so the text
 * stays selectable, accessible, and consistent with the rest of the site's
 * typography system, rather than being baked as pixels into an image.
 */
export const RewardsSection = memo(function RewardsSection() {
  return (
    <section className="relative overflow-hidden py-14 sm:py-20"
      style={{ background: "radial-gradient(ellipse at 50% 20%,#2E1065 0%,#150A35 55%,#0D0620 100%)" }}>
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <img src={rewardsIcon} alt="" aria-hidden="true"
          className="w-full max-w-xl mx-auto -mb-2" draggable={false} />

        <h2 className="text-5xl sm:text-6xl mb-4"
          style={{
            fontFamily: "'Fraunces', serif", fontWeight: 700,
            backgroundImage: "linear-gradient(180deg,#FDE9A8 0%,#F5C842 35%,#C9861F 75%,#A66E15 100%)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.4)) drop-shadow(0 1px 0 rgba(255,239,180,0.4))",
          }}>
          Rewards
        </h2>
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="w-14 h-px" style={{ background: `linear-gradient(90deg,transparent,${GOLD})` }} />
          <span className="w-1.5 h-1.5 rotate-45" style={{ background: GOLD }} />
          <span className="w-14 h-px" style={{ background: `linear-gradient(90deg,${GOLD},transparent)` }} />
        </div>
        <p className="text-white/75 text-base sm:text-lg max-w-lg mx-auto leading-relaxed mb-10">
          Earn points on every spend and redeem for exciting rewards and offers.
        </p>

        {/* Feature pills */}
        <div className="inline-flex flex-col sm:flex-row items-stretch sm:items-center gap-0 rounded-2xl sm:rounded-full overflow-hidden"
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
