import { useState } from "react";
import vinkBronzeCard from "../../imports/VinkBronzeCard.webp";
import vinkBlueVisaCard from "../../imports/VinkBlueVisaCard.webp";
import vinkBlackVisaCard from "../../imports/VinkBlackVisaCard.webp";
import vinkBlueMastercard from "../../imports/VinkBlueMastercard.webp";
import { Card3DViewer } from "./Card3DViewer";
import { ZoomImage } from "./ZoomImage";
import { useReveal } from "./useReveal";

const CARDS = [
  {
    name: "VINK Commuter Card", sub: "Mastercard Standard",
    grad: "linear-gradient(135deg,#C8102E,#8F1027)", net: "mc", last4: "4521", expiry: "09/28",
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
    grad: "linear-gradient(135deg,#A50F27,#101828)", net: "visa", last4: "8834", expiry: "03/27",
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
        width: "min(276px, 72vw)", height: 174, background: image ? "#101828" : card.grad,
        transform: active ? "translateY(-12px) scale(1.05)" : "scale(0.94)",
        opacity: active ? 1 : 0.7,
        boxShadow: active ? "0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px rgba(200,16,46,0.55), 0 30px 54px -14px rgba(16,24,40,0.6)" : "0 6px 16px -6px rgba(16,24,40,0.3)",
      }}>
      {image ? (
        <ZoomImage src={image} alt={`${card.name} — physical card design`} className="w-full h-full object-cover" />
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
  const rHead = useReveal(), rStage = useReveal(120);
  const [viewerCard, setViewerCard] = useState<typeof CARDS[0] | null>(null);

  return (
    <section className="relative overflow-hidden py-8 sm:py-10" style={{ background: "linear-gradient(180deg,var(--vk-ivory) 0%,var(--vk-ivory-2) 100%)" }}>
      <div aria-hidden="true" className="vkp-dots" />
      <div aria-hidden="true" className="vkp-glow left-1/2 top-24 h-72 w-[34rem] max-w-full -translate-x-1/2 opacity-[0.14]" style={{ background: "#c8102e" }} />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={rHead.ref} style={rHead.style} className={"text-center mb-12 " + rHead.className}>
          <span className="inline-block text-xs font-bold uppercase tracking-[0.14em] px-3.5 py-1.5 rounded-full mb-4 text-white" style={{ background: "linear-gradient(135deg,#e8405b,#c8102e 60%,#a50f27)", boxShadow: "0 10px 20px -10px rgba(200,16,46,0.8)" }}>Compare Cards</span>
          <h2 className="font-display text-3xl sm:text-5xl tracking-[-0.028em] text-ink font-semibold">Choose Your Perfect <span className="vkp-gradient-text">VINK Card</span></h2>
          <p className="vkp-chip mx-auto mt-4 inline-block rounded-full px-3.5 py-1.5 text-xs font-medium text-ink-2">Planned cards and benefits, available at our June 2027 launch.</p>
        </div>

        <p className="hidden [@media(hover:hover)]:block text-center text-xs font-medium text-ink-2 mb-5">Roll over image to zoom in · click a card to open it</p>
        <p className="text-center text-xs font-medium text-ink-2 mb-5 [@media(hover:hover)]:hidden">Tap a card to see it up close</p>

        {/* The stage: the cards fan out in perspective around the chosen one */}
        <div ref={rStage.ref} style={rStage.style} className={"vkp-stage relative mb-10 pt-6 pb-8 " + rStage.className}>
          <div aria-hidden="true" className="absolute inset-x-[8%] bottom-0 h-24 rounded-[50%] opacity-80 blur-2xl" style={{ background: "radial-gradient(ellipse,rgba(16,24,40,0.35),transparent 70%)" }} />
          <div className="flex flex-wrap justify-center gap-5 sm:gap-8 md:flex-nowrap md:gap-0">
            {CARDS.map((c, i) => {
              const off = i - active;
              return (
                <button type="button" key={i} onClick={() => { setActive(i); setViewerCard(c); }} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}
                  aria-label={`View the ${c.name}`} aria-pressed={active === i}
                  className="group flex flex-col items-center gap-3 rounded-2xl transition-transform duration-500 ease-out md:-mx-1 md:[transform:rotateY(var(--rot))]"
                  style={{ ["--rot" as string]: `${Math.max(-1, Math.min(1, off)) * -16}deg`, zIndex: active === i ? 10 : 5 - Math.abs(off) } as React.CSSProperties}>
                  <span className="relative block">
                    <CardVisual card={c} active={active === i} />
                    <span aria-hidden="true" className="absolute -bottom-3 left-6 right-6 h-4 rounded-[50%] blur-lg transition-opacity duration-500" style={{ background: "rgba(16,24,40,0.55)", opacity: active === i ? 0.7 : 0.25 }} />
                  </span>
                  <span className={`mt-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-300 ${active === i ? "bg-brand text-brand-fg shadow-card" : "text-ink-2 group-hover:text-fg"}`}>{c.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The chosen card, in words */}
        <div key={active} className="vkp-rise mx-auto mb-8 flex max-w-2xl flex-col items-center gap-3 rounded-3xl border border-line bg-surface px-6 py-6 text-center shadow-card" style={{ boxShadow: "0 30px 60px -34px rgba(200,16,46,0.4)" }}>
          <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: "linear-gradient(135deg,#e8405b,#c8102e 60%,#a50f27)" }}>{CARDS[active].tier}</span>
          <p className="font-display text-2xl font-semibold text-fg">{CARDS[active].name}</p>
          <p className="text-ink-2">{CARDS[active].benefit}</p>
          <button type="button" onClick={() => setViewerCard(CARDS[active])} className="mt-1 inline-flex h-11 items-center rounded-full border-2 border-brand px-6 text-sm font-semibold text-crimson-text transition-colors hover:bg-brand hover:text-brand-fg">View it up close</button>
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
