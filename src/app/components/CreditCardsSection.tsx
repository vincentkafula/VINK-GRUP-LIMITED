import { useState } from "react";
import vinkBronzeCard from "../../imports/VinkBronzeCard.png";
import vinkBlueVisaCard from "../../imports/VinkBlueVisaCard.png";
import vinkBlackVisaCard from "../../imports/VinkBlackVisaCard.png";

const CARDS = [
  {
    name: "VINK Commuter Card", sub: "Mastercard Standard",
    grad: "linear-gradient(135deg,#34A853,#5B21B6)", net: "mc", last4: "4521", expiry: "09/28",
    tier: "Standard", benefit: "Tap to ride. Earn on every journey.",
    image: vinkBronzeCard,
    features: [
      "R0 annual fee — always",
      "3-second tap-and-go fare payment on all taxi routes",
      "R0.50 cashback per taxi ride, redeemable after 30 days",
      "Free Wi-Fi access on VINK-enabled taxis",
      "Access to 2,100+ gym sessions at R20 per visit",
    ],
  },
  {
    name: "VINK Driver Card", sub: "Visa Premium",
    grad: "linear-gradient(135deg,#7C3AED,#065F46)", net: "visa", last4: "8834", expiry: "03/27",
    tier: "Premium", benefit: "Your earnings. Your card. Your control.",
    image: vinkBlueVisaCard,
    features: [
      "Linked to your AFC device — funds available instantly after each fare",
      "Withdraw at any Nedbank ATM fee-free",
      "Fuel discounts at Shell, Engen, BP, Total, Caltex, and Sasol",
      "Buy airtime, electricity, and pay bills from your wallet",
      "R20 gym access at Planet Fitness, Zones Fitness, and Virgin Active",
    ],
  },
  {
    name: "VINK Gold", sub: "Visa Infinite Elite",
    grad: "linear-gradient(135deg,#D4A843,#B88A20)", net: "visa", last4: "2291", expiry: "12/26",
    tier: "Elite", benefit: "Premium rewards for every rand you spend.",
    image: vinkBlackVisaCard,
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
  const image = "image" in card ? card.image : undefined;
  return (
    <div className="relative rounded-2xl text-white overflow-hidden flex-shrink-0 transition-all duration-500 ease-out cursor-pointer select-none"
      style={{
        width: "min(260px, 72vw)", height: 160, background: image ? "#1a1512" : card.grad,
        transform: active ? "translateY(-8px) scale(1.04)" : "scale(0.95)",
        opacity: active ? 1 : 0.72,
        boxShadow: active ? "0 20px 44px -10px rgba(91,33,182,0.45)" : "0 4px 14px -4px rgba(91,33,182,0.18)",
      }}>
      {image ? (
        <img src={image} alt={`${card.name} — physical card design`} className="w-full h-full object-cover" draggable={false} />
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}

export function CreditCardsSection() {
  const [active, setActive] = useState(0);

  return (
    <section className="py-10 sm:py-14" style={{ background: "#F6F5FF" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full mb-3"
            style={{ background: "#EDE9FE", color: "#5B21B6" }}>Compare Cards</span>
          <h2 className="text-2xl sm:text-3xl text-gray-900" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Choose Your Perfect VINK Card</h2>
        </div>

        <div className="flex justify-center gap-4 sm:gap-6 flex-wrap mb-6">
          {CARDS.map((c, i) => (
            <div key={i} onClick={() => setActive(i)} className="flex flex-col items-center gap-2">
              <CardVisual card={c} active={active === i} />
              <p className="text-[11px] text-gray-500 font-medium">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2">
          {CARDS.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} className="h-2 rounded-full transition-all duration-300"
              style={{ width: active === i ? 24 : 8, background: active === i ? "#5B21B6" : "#D1D5DB" }} />
          ))}
        </div>
      </div>
    </section>
  );
}
