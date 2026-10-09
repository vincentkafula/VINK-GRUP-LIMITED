import { memo } from "react";
import protectionImage from "../../imports/image-1.webp";
import { Lock, Zap, ShieldCheck, ArrowRight } from "lucide-react";
import { PremiumIcon } from "./PremiumIcon";


const TRUST_ITEMS = [
  { Icon: Lock, label: "256-bit AES Encryption" },
  { Icon: Zap, label: "Real-time fraud alerts" },
  { Icon: ShieldCheck, label: "Zero-liability guarantee" },
];

export const ProtectionSection = memo(function ProtectionSection() {
  return (
    <section className="bg-bg py-14 sm:py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-20 items-center">
          <div className="flex justify-center order-2 md:order-1">
            <img src={protectionImage} alt="Your Money Always Protected — VINK security"
              className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg object-contain drop-shadow-[0_24px_40px_rgba(0,0,0,0.18)]" draggable={false} loading="lazy" />
          </div>
          <div className="order-1 md:order-2 text-center md:text-left max-w-xl mx-auto md:mx-0">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-5">
              <span className="text-xs sm:text-[13px] font-bold uppercase tracking-[0.22em] text-gold-text">Zero Liability</span>
              <span aria-hidden="true" className="h-px w-12 sm:w-16" style={{ background: "linear-gradient(90deg,var(--vk-gold),transparent)" }} />
            </div>
            <h2 className="font-display font-semibold text-fg text-[2.5rem] sm:text-5xl lg:text-[3.5rem] leading-[1.04] tracking-[-0.015em] mb-6">
              Your Money.<br /><span className="text-gold-text">Always Protected.</span>
            </h2>
            <p className="text-fg text-lg sm:text-xl leading-[1.6] mb-5">
              VINK monitors every transaction in real time, 24 hours a day, seven days a week. Our fraud detection engine flags unusual activity the moment it occurs — and you&apos;ll receive an instant notification on your phone before we act. Your peace of mind is never more than a tap away.
            </p>
            <p className="text-fg-muted text-base sm:text-lg leading-[1.7] mb-8 md:border-l-2 md:pl-5" style={{ borderColor: "var(--vk-gold)" }}>
              Whether you&apos;re shopping online or tapping your VINK card on a taxi AFC device, our zero-liability guarantee means you will never be held responsible for unauthorised transactions. If something goes wrong, VINK makes it right — fast.
            </p>
            <ul className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 mb-9 list-none p-0">
              {TRUST_ITEMS.map((t, i) => (
                <li key={i} className="flex min-[420px]:flex-col md:flex-row items-center min-[420px]:text-center md:text-left gap-3 p-3 rounded-2xl border bg-surface text-fg text-[13px] font-semibold leading-snug shadow-card" style={{ borderColor: "color-mix(in srgb, var(--vk-gold) 40%, var(--vk-line))" }}>
                  <PremiumIcon icon={t.Icon} accent="#D4AF5A" dark="#1A0D10" size={40} />
                  <span>{t.label}</span>
                </li>
              ))}
            </ul>
            <button className="group inline-flex items-center gap-2.5 px-9 py-4 rounded-xl text-base font-bold transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5"
              style={{ background: "var(--vk-brand)", color: "var(--vk-brand-fg)", boxShadow: "0 14px 32px -8px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,0.18)", letterSpacing: "0.01em" }}>
              Learn How We Protect You <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});
