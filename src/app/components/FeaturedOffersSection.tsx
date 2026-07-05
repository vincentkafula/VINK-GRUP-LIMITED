const OFFERS = [
  {
    name: "Vink Everyday Cashback", issuer: "VMS Standard",
    grad: "linear-gradient(135deg,#1A3A6E 0%,#2952B8 60%,#4F79E0 100%)",
    badge: "Best Value", badgeColor: "#10B981",
    highlight: "3% cashback at supermarkets and spaza shops",
    detail: "1.5% at fuel stations · 0.5% everywhere else",
    net: "visa",
  },
  {
    name: "Vink Rewards Gold", issuer: "VMS Premier",
    grad: "linear-gradient(135deg,#7A5C2A 0%,#C4922A 60%,#E6B85A 100%)",
    badge: "Top Pick", badgeColor: "#F59E0B",
    highlight: "Earn 2 VinkPoints per R10 on all spend",
    detail: "Redeem points for taxi fares, gym sessions, or airtime",
    net: "amex",
  },
  {
    name: "Vink Commuter Unlimited", issuer: "VMS Commuter",
    grad: "linear-gradient(135deg,#1B4D1B 0%,#2E7D32 60%,#4CAF50 100%)",
    badge: "No Limits", badgeColor: "#3B82F6",
    highlight: "Unlimited tap-and-go rides on any VMS-enabled taxi",
    detail: "Free card replacement · No minimum balance required",
    net: "mc",
  },
];

import { memo } from "react";

export const FeaturedOffersSection = memo(function FeaturedOffersSection() {
  return (
    <section className="py-14 sm:py-20" style={{ background: "#F8F7FF" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-2"
              style={{ background: "#EDE9FE", color: "#6B5ED7" }}>Partner Offers</span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900">Featured Card Offers</h2>
          </div>
          <a href="#" className="text-sm font-semibold hover:underline flex-shrink-0" style={{ color: "#6B5ED7" }}>
            Compare all cards →
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {OFFERS.map((o, i) => (
            <div key={i} className="rounded-2xl overflow-hidden border border-gray-100 bg-white hover:shadow-2xl hover:-translate-y-1 transition-all group">
              <div className="relative h-48 overflow-hidden" style={{ background: o.grad }}>
                <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 pointer-events-none"/>
                <div className="absolute top-3 left-3 text-white text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: o.badgeColor }}>{o.badge}</div>
                <div className="relative z-10 p-5 flex flex-col justify-between h-full text-white">
                  <div className="flex justify-between items-start mt-5">
                    <div>
                      <p className="text-[9px] tracking-widest opacity-60 uppercase font-semibold">VINK BANK</p>
                      <p className="text-base font-bold mt-0.5">{o.name}</p>
                    </div>
                    <div className="w-9 h-6 rounded bg-yellow-400/60 border border-yellow-300/40"/>
                  </div>
                  <div className="flex justify-between items-end">
                    <p className="text-xs font-mono tracking-widest opacity-70">•••• •••• •••• 4291</p>
                    {o.net === "visa" ? <p className="text-lg font-black italic tracking-tight">VISA</p>
                      : o.net === "mc"
                        ? <div className="flex"><div className="w-6 h-6 rounded-full opacity-90" style={{ background: "#EB001B" }}/><div className="w-6 h-6 rounded-full -ml-3" style={{ background: "#F79E1B", opacity: 0.85 }}/></div>
                        : <div className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest border border-white/20">AMEX</div>
                    }
                  </div>
                </div>
              </div>
              <div className="p-5">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full block mb-2"
                  style={{ background: "#EDE9FE", color: "#6B5ED7" }}>{o.highlight}</span>
                <p className="text-gray-400 text-xs mb-1">{o.detail}</p>
                <p className="text-gray-400 text-[11px] mb-4">{o.issuer}</p>
                <button className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 group-hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)" }}>
                  Apply Today
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-6">
          Subject to credit approval and FICA verification. Terms and conditions apply. VMS is an authorised Financial Services Provider.
        </p>
      </div>
    </section>
  );
});
