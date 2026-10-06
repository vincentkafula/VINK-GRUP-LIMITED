import { useState } from "react";
import vinkBronzeCard from "../../imports/VinkBronzeCard.webp";
import vinkBlueVisaCard from "../../imports/VinkBlueVisaCard.webp";
import vinkBlackVisaCard from "../../imports/VinkBlackVisaCard.webp";
import vinkBlueMastercard from "../../imports/VinkBlueMastercard.webp";
import { Card3DViewer } from "./Card3DViewer";

const CARDS = [
  {
    name: "VINK Commuter Card", sub: "Mastercard Standard",
    grad: "linear-gradient(135deg,#C9A84C,#8B0000)", net: "mc", last4: "4521", expiry: "09/28",
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
    grad: "linear-gradient(135deg,#9B1C1C,#065F46)", net: "visa", last4: "8834", expiry: "03/27",
    tier: "Premium", benefit: "Your earnings. Your card. Your control.",
    image: vinkBlueVisaCard,
    features: [
      "Linked to your AFC device — funds available instantly after each fare",
      "Cash withdrawals at partner ATMs (network to be announced)",
      "Fuel rewards with partner fuel brands (to be announced)",
      "Buy airtime, electricity, and pay bills from your wallet",
      "Gym access with partner gyms (to be announced)",
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
  {
    name: "VINK Business Card", sub: "Mastercard World",
    grad: "linear-gradient(135deg,#1E3A8A,#0F2A4A)", net: "mc", last4: "6178", expiry: "05/28",
    tier: "Business", benefit: "Built for the way your business moves.",
    image: vinkBlueMastercard,
    features: [
      "Issue up to 50 employee cards from one account",
      "Real-time spend tracking and receipt capture per cardholder",
      "R0 monthly fee for the first 12 months",
      "Fuel and fleet discounts at partner filling stations nationwide",
      "Dedicated business support line, 7am–8pm every day",
    ],
  },
];

function CardVisual({ card, active }: { card: typeof CARDS[0]; active: boolean }) {
  const image = "image" in card ? card.image : undefined;
  return (
    <div className="relative rounded-2xl text-white overflow-hidden flex-shrink-0 transition-all duration-500 ease-out select-none"
      style={{
        width: "min(260px, 72vw)", height: 160, background: image ? "#1a1512" : card.grad,
        transform: active ? "translateY(-8px) scale(1.04)" : "scale(0.95)",
        opacity: active ? 1 : 0.72,
        boxShadow: active ? "0 20px 44px -10px rgba(0,0,0,0.45)" : "0 4px 14px -4px rgba(0,0,0,0.2)",
      }}>
      {image ? (
        <img loading="lazy" decoding="async" src={image} alt={`${card.name} — physical card design`} className="w-full h-full object-cover" draggable={false} />
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

export function CreditCardsSection({ onApply }: { onApply?: () => void }) {
  const [active, setActive] = useState(0);
  const [viewerCard, setViewerCard] = useState<typeof CARDS[0] | null>(null);

  return (
    <section className="py-10 sm:py-14 bg-surface-2">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full mb-3 bg-gold/15 text-gold-text">Compare Cards</span>
          <h2 className="font-display text-2xl sm:text-3xl text-fg font-semibold">Choose Your Perfect VINK Card</h2>
        </div>

        <div className="flex justify-center gap-4 sm:gap-6 flex-wrap mb-6">
          {CARDS.map((c, i) => (
            <button type="button" key={i} onClick={() => { setActive(i); setViewerCard(c); }} aria-label={`View the ${c.name}`} aria-pressed={active === i} className="flex flex-col items-center gap-2 rounded-2xl">
              <CardVisual card={c} active={active === i} />
              <span className="text-xs text-fg-muted font-medium">{c.sub}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-center gap-2">
          {CARDS.map((_, i) => (
            <button key={i} type="button" onClick={() => setActive(i)} aria-label={`Select card ${i + 1} of ${CARDS.length}`} aria-pressed={active === i} className="flex h-8 items-center px-1">
              <span className="block h-2 rounded-full transition-all duration-300" style={{ width: active === i ? 24 : 8, background: active === i ? "var(--vk-brand)" : "var(--vk-line-strong)" }} />
            </button>
          ))}
        </div>
      </div>

      {viewerCard && "image" in viewerCard && (
        <Card3DViewer isOpen onClose={() => setViewerCard(null)} image={viewerCard.image} name={viewerCard.name} onApply={onApply} />
      )}
    </section>
  );
}
