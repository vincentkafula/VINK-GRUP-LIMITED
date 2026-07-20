import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";
const GOLD = "#F5A623";

const TOPICS = [
  { icon: "📱", title: "Digital Financial Inclusion",     desc: "How digital payment infrastructure can reach informal transport workers who are excluded from traditional banking — using AFC devices, mobile wallets, and cashless taxi fares as the entry point." },
  { icon: "🌍", title: "Cashless Payments in Africa",      desc: "VINK's perspective: the transition to cashless payments in Africa will not be led by traditional banks — it will be led by operators who understand the informal economy from the inside." },
  { icon: "📡", title: "MVNO and Fintech for the Unbanked", desc: "How MVNO agreements and fintech platforms can reach unbanked populations — starting with South Africa's 250,000-strong minibus taxi fleet as a distribution network." },
];

export function WEFViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-16 px-6 text-white" style={{ background: `linear-gradient(135deg,#0F172A,${P})` }}>
        <div className="max-w-4xl mx-auto">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Global Stage</span>
          <h1 className="text-4xl font-black mb-3">VINK at the World Economic Forum</h1>
          <p className="text-white/75 text-lg max-w-2xl leading-relaxed">
            Bringing South Africa&apos;s informal economy to the global conversation on financial inclusion and the future of payments.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <p className="text-gray-700 leading-relaxed mb-4">
            VINK participated in WEF engagements focused on <strong>financial inclusion</strong> and the future of payments in emerging markets — consistent with VINK&apos;s core mission of bringing digital payment infrastructure to informal and underserved transport economies.
          </p>
          <p className="text-gray-700 leading-relaxed">
            VINK&apos;s perspective at WEF: that the transition to cashless payments in Africa will not be led by traditional banks — it will be led by operators who understand the informal economy from the inside. <strong>South Africa&apos;s 250,000-strong taxi fleet is not a problem to be managed. It is an infrastructure to be digitised.</strong>
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Topics VINK Contributed To</h2>
          <div className="space-y-4">
            {TOPICS.map((t, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
                <span className="text-3xl flex-shrink-0">{t.icon}</span>
                <div>
                  <p className="font-bold text-gray-900 mb-1">{t.title}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl p-7 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
          <blockquote className="text-white/90 text-base italic leading-relaxed mb-4">
            &quot;South Africa&apos;s taxi industry — the backbone of our economy — deserved a payment system built specifically for it. We have built that system.&quot;
          </blockquote>
          <p className="text-white/60 text-sm font-semibold">— Vincent Kafula, Founder &amp; CEO, Vink Group (Pty) Ltd.</p>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-black mb-3" style={{ color: P }}>Media &amp; Speaking Enquiries</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-4">
            To request speaking notes, media documentation, or to enquire about VINK representation at future events:
          </p>
          <a href="mailto:media@vink.co.za" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: P }}>
            Contact media@vink.co.za
          </a>
        </section>
      </div>
    </div>
  );
}
