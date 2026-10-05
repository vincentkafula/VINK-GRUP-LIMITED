import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5C0A10";
const GOLD = "#C9A84C";

const OFFERS = [
  { badge: "Best Value", name: "VINK Everyday Cashback", detail: "3% cashback at supermarkets and spaza shops, 1.5% at fuel stations, 0.5% everywhere else." },
  { badge: "Top Pick", name: "VINK Rewards Gold", detail: "Earn 2 ManshyaPoints per R10 on all spend — redeemable for taxi fares, gym sessions, or airtime." },
  { badge: "No Limits", name: "VINK Commuter Unlimited", detail: "Unlimited tap-and-go rides on any VINK-enabled taxi, with free card replacement and no minimum balance." },
  { badge: "Launch Offer", name: "Business Account Bonus", detail: "Up to 80,000 bonus points or R3,000 cash back for businesses that open a VINK Business Account in the first month after launch." },
];

export function LatestOffersViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-surface border-b border-line shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-16 px-6 text-white" style={{ background: `linear-gradient(135deg,#0F172A,${P})` }}>
        <div className="max-w-4xl mx-auto">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Offers</span>
          <h1 className="text-4xl font-black mb-3">Latest Offers</h1>
          <p className="text-white/75 text-lg max-w-2xl leading-relaxed">
            A preview of the card offers and launch promotions VINK is preparing for June 2027.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="rounded-2xl p-5" style={{ background: "var(--vk-warn-bg)", border: "1px solid color-mix(in srgb, #FDE68A var(--vk-wash), var(--vk-surface))" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--vk-warn)" }}>
            VINK is not yet in full operation. None of the offers below can be applied for or redeemed today — they go live when we launch in June 2027.
          </p>
        </section>

        <section>
          <div className="grid sm:grid-cols-2 gap-4">
            {OFFERS.map((o, i) => (
              <div key={i} className="p-5 bg-surface rounded-xl border border-line">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3" style={{ background: "var(--vk-ok-bg)", color: "var(--vk-crimson-text)" }}>{o.badge}</span>
                <p className="font-bold text-fg mb-1">{o.name}</p>
                <p className="text-fg-muted text-sm leading-relaxed">{o.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-2 rounded-2xl p-6 border border-line">
          <h2 className="text-lg font-black mb-3" style={{ color: "var(--vk-crimson-text)" }}>Want to Know First?</h2>
          <p className="text-fg-muted text-sm leading-relaxed">
            Full terms, eligibility, and any additional launch offers will be published here and across the app closer to June 2027. Check back, or reach out through Contact Us if you'd like to be notified.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
