import { X, TrendingUp } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#0B5C2E";
const GOLD = "#F5A623";

const INDICES = [
  { name: "JSE All Share Index", region: "South Africa", desc: "The broadest measure of the Johannesburg Stock Exchange, tracking the country's largest listed companies." },
  { name: "JSE Top 40", region: "South Africa", desc: "The 40 largest companies on the JSE by market value — the index most often used as a shorthand for 'the South African market'." },
  { name: "MSCI South Africa", region: "South Africa", desc: "An international benchmark for South African equities, widely used by global fund managers." },
  { name: "MSCI Emerging Markets", region: "Global", desc: "Tracks equity performance across emerging economies, a useful comparison point for South African and broader SADC investments." },
];

export function MarketIndicesViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
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

        <section className="rounded-2xl p-5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
            VINK is not yet in full operation. Live index data and investment tools are confirmed in full at our June 2027 launch — the figures below are for context only.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Indices We'll Track</h2>
          <div className="space-y-3">
            {INDICES.map((idx, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#EAF7EE", color: P }}>
                  <TrendingUp className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-gray-900">{idx.name}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: "#F3F4F6", color: "#6B7280" }}>{idx.region}</span>
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed">{idx.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h2 className="text-lg font-black mb-3" style={{ color: P }}>Part of Wealth &amp; Investment Management</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Market indices are one part of VINK's broader wealth and investment offering, built for customers who want to grow savings beyond a standard account. See Wealth and Investment Management for the full picture of what's planned.
          </p>
        </section>
      </div>
    </div>
  );
}
