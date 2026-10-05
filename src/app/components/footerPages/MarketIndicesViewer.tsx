import { X, TrendingUp } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { Footer } from "../Footer";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5C0A10";
const GOLD = "#C9A84C";

const INDICES = [
  { name: "JSE All Share Index", region: "South Africa", desc: "The broadest measure of the Johannesburg Stock Exchange, tracking the country's largest listed companies." },
  { name: "JSE Top 40", region: "South Africa", desc: "The 40 largest companies on the JSE by market value — the index most often used as a shorthand for 'the South African market'." },
  { name: "MSCI South Africa", region: "South Africa", desc: "An international benchmark for South African equities, widely used by global fund managers." },
  { name: "MSCI Emerging Markets", region: "Global", desc: "Tracks equity performance across emerging economies, a useful comparison point for South African and broader SADC investments." },
];

export function MarketIndicesViewer({ isOpen, onClose }: Props) {
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
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Investing</span>
          <h1 className="text-4xl font-black mb-3">Market Indices</h1>
          <p className="text-white/75 text-lg max-w-2xl leading-relaxed">
            The benchmarks VINK's investment tools will track once wealth and investment features launch.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="rounded-2xl p-5" style={{ background: "var(--vk-warn-bg)", border: "1px solid color-mix(in srgb, #FDE68A var(--vk-wash), var(--vk-surface))" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--vk-warn)" }}>
            VINK is not yet in full operation. Live index data and investment tools are confirmed in full at our June 2027 launch — the figures below are for context only.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: "var(--vk-crimson-text)" }}>Indices We'll Track</h2>
          <div className="space-y-3">
            {INDICES.map((idx, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-surface rounded-xl border border-line">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--vk-ok-bg)", color: "var(--vk-crimson-text)" }}>
                  <TrendingUp className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-fg">{idx.name}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: "var(--vk-surface-2)", color: "var(--vk-fg-muted)" }}>{idx.region}</span>
                  </div>
                  <p className="text-fg-muted text-sm leading-relaxed">{idx.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-2 rounded-2xl p-6 border border-line">
          <h2 className="text-lg font-black mb-3" style={{ color: "var(--vk-crimson-text)" }}>Part of Wealth &amp; Investment Management</h2>
          <p className="text-fg-muted text-sm leading-relaxed">
            Market indices are one part of VINK's broader wealth and investment offering, built for customers who want to grow savings beyond a standard account. See Wealth and Investment Management for the full picture of what's planned.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
}
