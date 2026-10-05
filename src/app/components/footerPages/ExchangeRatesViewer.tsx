import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5C0A10";
const GOLD = "#C9A84C";

const SADC_CURRENCIES = [
  { country: "South Africa", currency: "South African Rand", code: "ZAR" },
  { country: "Botswana", currency: "Botswana Pula", code: "BWP" },
  { country: "Namibia", currency: "Namibian Dollar", code: "NAD" },
  { country: "Zambia", currency: "Zambian Kwacha", code: "ZMW" },
  { country: "Zimbabwe", currency: "Zimbabwean Dollar", code: "ZWL" },
  { country: "Mozambique", currency: "Mozambican Metical", code: "MZN" },
  { country: "Eswatini", currency: "Swazi Lilangeni", code: "SZL" },
  { country: "Lesotho", currency: "Lesotho Loti", code: "LSL" },
];

export function ExchangeRatesViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-surface border-b border-line shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-16 px-6 text-white" style={{ background: `linear-gradient(135deg,#0F172A,${P})` }}>
        <div className="max-w-4xl mx-auto">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Cross-Border</span>
          <h1 className="text-4xl font-black mb-3">Exchange Rates</h1>
          <p className="text-white/75 text-lg max-w-2xl leading-relaxed">
            VINK is built to work across the SADC region — here's where live rates will live once we launch.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="rounded-2xl p-5" style={{ background: "var(--vk-warn-bg)", border: "1px solid #FDE68A" }}>
          <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
            VINK is not yet in full operation. Live, real-time exchange rates will be published here and inside the app once we launch in June 2027 — no rates are active for transacting today.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: "var(--vk-crimson-text)" }}>SADC Currencies We'll Support</h2>
          <p className="text-fg-muted text-sm leading-relaxed mb-6">
            VINK's cross-border coverage is built around the Southern African Development Community — the region our commuters, drivers, and business customers actually move through.
          </p>
          <div className="bg-surface rounded-2xl border border-line overflow-hidden">
            {SADC_CURRENCIES.map((c, i) => (
              <div key={i} className={`p-4 flex items-center justify-between ${i > 0 ? "border-t border-line" : ""}`}>
                <div>
                  <p className="font-semibold text-fg text-sm">{c.country}</p>
                  <p className="text-xs text-fg-muted">{c.currency}</p>
                </div>
                <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: "var(--vk-ok-bg)", color: "var(--vk-crimson-text)" }}>{c.code}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-2 rounded-2xl p-6 border border-line">
          <h2 className="text-lg font-black mb-3" style={{ color: "var(--vk-crimson-text)" }}>Why This Matters</h2>
          <p className="text-fg-muted text-sm leading-relaxed">
            Traditional cross-border transfers in the region are slow and expensive, often eating a meaningful cut of the amount sent. VINK's ambition is to make moving money across these borders as simple as tapping your card at a taxi validator — transparent rates, no hidden margins, confirmed in full at launch.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
