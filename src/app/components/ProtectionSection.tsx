import { memo } from "react";
import protectionImage from "../../imports/image-1.webp";
import { Lock, Zap, ShieldCheck, ArrowRight } from "lucide-react";


const TRUST_ITEMS = [
  { Icon: Lock, label: "256-bit AES Encryption" },
  { Icon: Zap, label: "Real-time fraud alerts" },
  { Icon: ShieldCheck, label: "Zero-liability guarantee" },
];

export const ProtectionSection = memo(function ProtectionSection() {
  return (
    <section className="vkp-dark vkp-wine vkp-grain relative overflow-hidden py-8 sm:py-10 lg:py-12">
      <div aria-hidden="true" className="vkp-hairline absolute inset-x-0 top-0" />
      <div aria-hidden="true" className="vkp-dots" />
      <div aria-hidden="true" className="vkp-glow -left-20 top-1/4 h-96 w-96 opacity-40" style={{ background: "#c8102e" }} />
      <div aria-hidden="true" className="vkp-glow -right-24 bottom-0 h-80 w-80 opacity-20" style={{ background: "#ff6b81" }} />
      <div className="relative z-[1] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-20 items-center">
          <div className="relative flex justify-center order-2 md:order-1">
            {/* the glow and the slow ring that the shield sits in */}
            <div aria-hidden="true" className="absolute inset-0 m-auto aspect-square w-[88%] max-w-md rounded-full opacity-70" style={{ background: "radial-gradient(circle,rgba(200,16,46,0.55),transparent 66%)" }} />
            <div aria-hidden="true" className="absolute inset-0 m-auto aspect-square w-[78%] max-w-[26rem] animate-[spin_50s_linear_infinite] rounded-full border border-dashed border-white/25 motion-reduce:animate-none" />
            {[0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="vkp-ping absolute inset-0 m-auto aspect-square w-[70%] max-w-[22rem] rounded-full border border-[#ff6b81]/50" style={{ animationDelay: `${i * 1.2}s` }} />)}
            <div className="vkp-glass-dark absolute left-0 top-6 z-10 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 shadow-xl sm:-left-2">
              <span aria-hidden="true" className="vkp-blink size-2.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 12px 2px rgba(52,211,153,0.7)" }} />
              <span className="text-xs font-semibold text-white">Live monitoring · 24/7</span>
            </div>
            <div className="vkp-glass-dark absolute bottom-10 right-0 z-10 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 shadow-xl sm:-right-2">
              <span aria-hidden="true" className="vkp-tile size-8 rounded-lg"><Zap className="size-4" /></span>
              <span className="text-xs font-semibold leading-tight text-white">Instant alert<br /><span className="text-white/60">before we act</span></span>
            </div>
            <img src={protectionImage} alt="Your Money Always Protected — VINK security"
              className="vkp-float relative w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg object-contain drop-shadow-[0_30px_50px_rgba(0,0,0,0.55)]" draggable={false} loading="lazy" />
          </div>
          <div className="order-1 md:order-2 text-center md:text-left max-w-xl mx-auto md:mx-0">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-5">
              <span className="text-xs sm:text-[13px] font-bold uppercase tracking-[0.22em] text-[#ff6b81]">Zero Liability</span>
              <span aria-hidden="true" className="h-px w-12 sm:w-16" style={{ background: "linear-gradient(90deg,#ff6b81,transparent)" }} />
            </div>
            <h2 className="font-display font-semibold text-white text-[2.5rem] sm:text-5xl lg:text-[3.5rem] leading-[1.04] tracking-[-0.015em] mb-6">
              Your Money.<br /><span className="vkp-gradient-text">Always Protected.</span>
            </h2>
            <p className="text-white/90 text-lg sm:text-xl leading-[1.6] mb-5">
              VINK monitors every transaction in real time, 24 hours a day, seven days a week. Our fraud detection engine flags unusual activity the moment it occurs — and you&apos;ll receive an instant notification on your phone before we act. Your peace of mind is never more than a tap away.
            </p>
            <p className="text-white/70 text-base sm:text-lg leading-[1.7] mb-8 md:border-l-2 md:pl-5" style={{ borderColor: "#ff6b81" }}>
              Whether you&apos;re shopping online or tapping your VINK card on a taxi AFC device, our zero-liability guarantee means you will never be held responsible for unauthorised transactions. If something goes wrong, VINK makes it right — fast.
            </p>
            <ul className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 mb-9 list-none p-0">
              {TRUST_ITEMS.map((t, i) => (
                <li key={i} className="vkp-glass-dark flex min-[420px]:flex-col md:flex-row items-center min-[420px]:text-center md:text-left gap-3 p-3.5 rounded-2xl text-white text-[13px] font-semibold leading-snug transition-colors hover:bg-white/10">
                  <span aria-hidden="true" className="vkp-tile size-10 shrink-0 rounded-xl"><t.Icon className="size-[18px]" strokeWidth={1.8} /></span>
                  <span>{t.label}</span>
                </li>
              ))}
            </ul>
            <button className="group inline-flex items-center gap-2.5 px-9 py-4 rounded-xl text-base font-bold transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg,#e8405b,#c8102e 60%,#a50f27)", color: "#fff", boxShadow: "0 16px 36px -10px rgba(200,16,46,.75), inset 0 1px 0 rgba(255,255,255,0.3)", letterSpacing: "0.01em" }}>
              Learn How We Protect You <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});
