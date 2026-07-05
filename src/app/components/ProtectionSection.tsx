import { memo } from "react";
import protectionImage from "../../imports/image-1.png";

const TRUST_ITEMS = [
  { icon: "🔒", label: "256-bit AES Encryption" },
  { icon: "⚡", label: "Real-time fraud alerts" },
  { icon: "✅", label: "Zero-liability guarantee" },
];

export const ProtectionSection = memo(function ProtectionSection() {
  return (
    <section className="bg-white py-14 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="flex justify-center order-2 md:order-1">
            <img src={protectionImage} alt="Your Money Always Protected — VMS security"
              className="w-full max-w-xs sm:max-w-sm object-contain" draggable={false} loading="lazy" />
          </div>
          <div className="order-1 md:order-2 text-center md:text-left">
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
              style={{ background: "#EDE9FE", color: "#6B5ED7" }}>Zero Liability</span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-4 leading-snug">
              Your Money.<br />Always Protected.
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              VMS monitors every transaction in real time, 24 hours a day, seven days a week. Our fraud detection engine flags unusual activity the moment it occurs — and you&apos;ll receive an instant notification on your phone before we act. Your peace of mind is never more than a tap away.
            </p>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              Whether you&apos;re shopping online or tapping your Vink card on a taxi AFC device, our zero-liability guarantee means you will never be held responsible for unauthorised transactions. If something goes wrong, VMS makes it right — fast.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-8">
              {TRUST_ITEMS.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border"
                  style={{ borderColor: "#DDD6FE", color: "#5B4EC7", background: "#FAFAFE" }}>
                  {t.icon} {t.label}
                </span>
              ))}
            </div>
            <button className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 shadow-lg"
              style={{ background: "linear-gradient(135deg,#6B5ED7,#9585EA)", boxShadow: "0 6px 20px rgba(107,94,215,.35)" }}>
              Learn How We Protect You
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});
