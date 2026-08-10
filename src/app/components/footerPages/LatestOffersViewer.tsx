import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#0B5C2E";
const GOLD = "#F5A623";

const OFFERS = [
  { badge: "Best Value", name: "VINK Everyday Cashback", detail: "3% cashback at supermarkets and spaza shops, 1.5% at fuel stations, 0.5% everywhere else." },
  { badge: "Top Pick", name: "VINK Rewards Gold", detail: "Earn 2 VinkPoints per R10 on all spend — redeemable for taxi fares, gym sessions, or airtime." },
  { badge: "No Limits", name: "VINK Commuter Unlimited", detail: "Unlimited tap-and-go rides on any VINK-enabled taxi, with free card replacement and no minimum balance." },
  { badge: "Launch Offer", name: "Business Account Bonus", detail: "Up to 80,000 bonus points or R3,000 cash back for businesses that open a VINK Business Account in the first month after launch." },
];

export function LatestOffersViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
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

        <section className="rounded-2xl p-5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
            VINK is not yet in full operation. None of the offers below can be applied for or redeemed today — they go live when we launch in June 2027.
          </p>
        </section>

        <section>
          <div className="grid sm:grid-cols-2 gap-4">
            {OFFERS.map((o, i) => (
              <div key={i} className="p-5 bg-white rounded-xl border border-gray-200">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3" style={{ background: "#EAF7EE", color: P }}>{o.badge}</span>
                <p className="font-bold text-gray-900 mb-1">{o.name}</p>
                <p className="text-gray-600 text-sm leading-relaxed">{o.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h2 className="text-lg font-black mb-3" style={{ color: P }}>Want to Know First?</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Full terms, eligibility, and any additional launch offers will be published here and across the app closer to June 2027. Check back, or reach out through Contact Us if you'd like to be notified.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
