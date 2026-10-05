import { memo } from "react";
import protectionImage from "../../imports/image-1.png";
import { Lock, Zap, ShieldCheck } from "lucide-react";


const TRUST_ITEMS = [
  { Icon: Lock, label: "256-bit AES Encryption" },
  { Icon: Zap, label: "Real-time fraud alerts" },
  { Icon: ShieldCheck, label: "Zero-liability guarantee" },
];

export const ProtectionSection = memo(function ProtectionSection() {
  return (
    <section className="bg-bg py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="flex justify-center order-2 md:order-1">
            <img src={protectionImage} alt="Your Money Always Protected — VINK security"
              className="w-full max-w-xs sm:max-w-sm object-contain" draggable={false} loading="lazy" />
          </div>
          <div className="order-1 md:order-2 text-center md:text-left">
            <span className="inline-block text-xs font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full mb-4 bg-gold/15 text-gold-text">Zero Liability</span>
            <h2 className="font-display text-2xl sm:text-3xl mb-4 leading-[1.15] text-fg font-semibold">
              Your Money.<br />Always Protected.
            </h2>
            <p className="text-fg-muted text-sm leading-relaxed mb-4">
              VINK monitors every transaction in real time, 24 hours a day, seven days a week. Our fraud detection engine flags unusual activity the moment it occurs — and you&apos;ll receive an instant notification on your phone before we act. Your peace of mind is never more than a tap away.
            </p>
            <p className="text-fg-muted text-sm leading-relaxed mb-6">
              Whether you&apos;re shopping online or tapping your VINK card on a taxi AFC device, our zero-liability guarantee means you will never be held responsible for unauthorised transactions. If something goes wrong, VINK makes it right — fast.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-8">
              {TRUST_ITEMS.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-line bg-surface text-fg">
                  <t.Icon className="size-3.5 text-gold-text" aria-hidden="true" /> {t.label}
                </span>
              ))}
            </div>
            <button className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5"
              style={{ background: "var(--vk-brand)", color: "var(--vk-brand-fg)", boxShadow: "0 10px 28px -6px rgba(0,0,0,.28)", letterSpacing: "0.01em" }}>
              Learn How We Protect You
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});
