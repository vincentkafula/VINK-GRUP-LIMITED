import { useState } from "react";

const CARDS = [
  {
    name: "Vink Commuter Card", sub: "Mastercard Standard",
    grad: "linear-gradient(135deg,#3D6FD4,#2952B8)", net: "mc", last4: "4521", expiry: "09/28",
    tier: "Standard", benefit: "Tap to ride. Earn on every journey.",
    features: [
      "R0 annual fee — always",
      "3-second tap-and-go fare payment on all taxi routes",
      "R0.50 cashback per taxi ride, redeemable after 30 days",
      "Free Wi-Fi access on VMS-enabled taxis",
      "Access to 2,100+ gym sessions at R20 per visit",
    ],
  },
  {
    name: "Vink Driver Card", sub: "Visa Premium",
    grad: "linear-gradient(135deg,#10B981,#065F46)", net: "visa", last4: "8834", expiry: "03/27",
    tier: "Premium", benefit: "Your earnings. Your card. Your control.",
    features: [
      "Linked to your AFC device — funds available instantly after each fare",
      "Withdraw at any Nedbank ATM fee-free",
      "Fuel discounts at Shell, Engen, BP, Total, Caltex, and Sasol",
      "Buy airtime, electricity, and pay bills from your wallet",
      "R20 gym access at Planet Fitness, Zones Fitness, and Virgin Active",
    ],
  },
  {
    name: "Vink Gold", sub: "Visa Infinite Elite",
    grad: "linear-gradient(135deg,#D4A843,#B88A20)", net: "visa", last4: "2291", expiry: "12/26",
    tier: "Elite", benefit: "Premium rewards for every rand you spend.",
    features: [
      "2% cashback on all spend",
      "Dedicated relationship manager",
      "Travel insurance on all flights booked with the card",
      "Access to 1,000+ airport lounges worldwide",
      "Priority customer support — average response under 2 minutes",
      "Credit limit up to R500,000",
    ],
  },
];

function CardVisual({ card, active }: { card: typeof CARDS[0]; active: boolean }) {
  return (
    <div className="relative rounded-2xl text-white overflow-hidden flex-shrink-0 transition-all duration-300 cursor-pointer select-none"
      style={{
        width: "min(260px, 72vw)", height: 160, background: card.grad,
        transform: active ? "translateY(-8px) scale(1.04)" : "scale(0.95)",
        opacity: active ? 1 : 0.72,
        boxShadow: active ? "0 16px 40px rgba(0,0,0,0.28)" : "0 4px 12px rgba(0,0,0,0.15)",
      }}>
      <div className="absolute top-0 right-0 w-36 h-36 rounded-full bg-white/10 -mr-14 -mt-14" />
      <div className="relative z-10 p-5 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[9px] tracking-widest opacity-60 uppercase">VINK</p>
            <p className="text-sm font-semibold mt-0.5">{card.name}</p>
          </div>
          <div className="w-9 h-7 rounded-md border border-white/20"
            style={{ background: "linear-gradient(135deg,#D4AF37 0%,#F5E07A 50%,#C49A00 100%)" }}>
            <div className="w-full h-full grid grid-cols-2 gap-px p-px opacity-60">
              <div className="bg-yellow-900/40 rounded-sm" /><div className="bg-yellow-900/40 rounded-sm" />
              <div className="bg-yellow-900/40 rounded-sm" /><div className="bg-yellow-900/40 rounded-sm" />
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm font-mono tracking-[0.22em] opacity-90 mb-2">•••• •••• •••• {card.last4}</p>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[8px] opacity-55 uppercase">Expires</p>
              <p className="text-xs font-medium">{card.expiry}</p>
            </div>
            {card.net === "visa"
              ? <p className="text-lg font-black italic tracking-tight">VISA</p>
              : <div className="flex"><div className="w-7 h-7 rounded-full" style={{ background: "#EB001B", opacity: 0.9 }} /><div className="w-7 h-7 rounded-full -ml-3.5" style={{ background: "#F79E1B", opacity: 0.85 }} /></div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreditCardsSection() {
  const [active, setActive] = useState(0);
  const card = CARDS[active];

  return (
    <section className="py-14 sm:py-20" style={{ background: "#F6F5FF" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ background: "#EDE9FE", color: "#6B5ED7" }}>Compare Cards</span>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900">Choose Your Perfect Vink Card</h2>
        </div>

        <div className="flex justify-center gap-4 sm:gap-6 flex-wrap mb-6">
          {CARDS.map((c, i) => (
            <div key={i} onClick={() => setActive(i)} className="flex flex-col items-center gap-2">
              <CardVisual card={c} active={active === i} />
              <p className="text-[11px] text-gray-500 font-medium">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2 mb-8">
          {CARDS.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} className="h-2 rounded-full transition-all duration-300"
              style={{ width: active === i ? 24 : 8, background: active === i ? "#6B5ED7" : "#D1D5DB" }} />
          ))}
        </div>

        {/* Active card details */}
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-8">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{ background: "#EDE9FE", color: "#6B5ED7" }}>{card.tier}</span>
              <h3 className="text-base font-black text-gray-900 mt-2">{card.name}</h3>
              <p className="text-sm font-medium mt-0.5" style={{ color: "#6B5ED7" }}>{card.benefit}</p>
            </div>
            <button className="flex-shrink-0 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)" }}>
              Apply Now
            </button>
          </div>
          <ul className="space-y-2">
            {card.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-0.5 flex-shrink-0" style={{ color: "#10B981" }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center">
          <button className="text-sm font-bold hover:underline" style={{ color: "#6B5ED7" }}>
            Compare All Cards →
          </button>
        </div>
      </div>
    </section>
  );
}
