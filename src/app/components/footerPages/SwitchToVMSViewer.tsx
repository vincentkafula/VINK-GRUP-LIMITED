import { X, CheckCircle } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";
const GOLD = "#F5A623";

const REASONS = [
  { icon: "💳", title: "Lowest taxi fare fee in SA", desc: "Just R0.50 per transaction — no bank charges more in the taxi industry" },
  { icon: "⭐", title: "Earn VinkPoints on everything", desc: "Rides, fuel, groceries, gym, and online shopping — every rand earns" },
  { icon: "📶", title: "Free Wi-Fi on VMS taxis",     desc: "Stay connected on your commute — no data needed" },
  { icon: "🚫", title: "No hidden fees. Ever.",       desc: "What you see is what you pay — always transparent" },
  { icon: "🏘️", title: "5% back to your community",   desc: "Every taxi transaction funds neighbourhood watch in your area" },
];

const STEPS = [
  { n: "1", title: "Open your VMS account", desc: "Online or at our Head Office in Cape Town — takes under 10 minutes." },
  { n: "2", title: "VMS handles your debit orders", desc: "We contact your listed providers on your behalf to redirect all debit orders." },
  { n: "3", title: "Redirect your salary", desc: "One letter to your employer's payroll department — VMS generates the template for you." },
  { n: "4", title: "Old account closes automatically", desc: "Once all debit orders are transferred, your old account closes with no effort from you." },
];

const FICA = [
  "South African green barcoded ID or Smart ID card",
  "Proof of residence (not older than 3 months)",
  "Most recent 3 months' bank statements",
  "For business accounts: company registration documents and FICA documents for all directors",
];

export function SwitchToVMSViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      {/* Hero */}
      <div className="py-20 px-6 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
        <div className="max-w-4xl mx-auto">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4"
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Switch in 7–10 days</span>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-4">Make the Switch to VMS.</h1>
          <p className="text-white/80 text-lg max-w-xl leading-relaxed">
            It&apos;s easier than you think — and we do the heavy lifting. Most customers are fully switched within 7–10 business days.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-12">

        {/* 5 reasons */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Why Switch to VMS?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {REASONS.map((r, i) => (
              <div key={i} className="p-5 rounded-xl border border-gray-200 bg-white hover:shadow-md transition-shadow">
                <span className="text-3xl block mb-3">{r.icon}</span>
                <p className="font-bold text-gray-900 text-sm mb-1">{r.title}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What VMS makes easy */}
        <section className="rounded-2xl p-6" style={{ background: "#F3F0FB" }}>
          <h2 className="text-xl font-black mb-4" style={{ color: P }}>What VMS Makes Easy</h2>
          <div className="space-y-3">
            {[
              { t: "Account number portability",  d: "Keep your FICA details — just switch your account." },
              { t: "Debit order switching",        d: "VMS contacts your existing providers on your behalf." },
              { t: "Salary redirect",              d: "One letter to your employer's payroll — VMS provides the template." },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-white rounded-xl p-4 border border-white/50">
                <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#10B981" }} />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{item.t}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{item.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>How It Works — 4 Simple Steps</h2>
          <div className="grid sm:grid-cols-2 gap-5">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                  style={{ background: P }}>{s.n}</div>
                <div>
                  <p className="font-bold text-gray-900 text-sm mb-1">{s.title}</p>
                  <p className="text-gray-500 text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What you need */}
        <section>
          <h2 className="text-2xl font-black mb-4" style={{ color: P }}>What You Need to Bring</h2>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            {FICA.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: P }} />
                <p className="text-sm text-gray-700">{item}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
          <h3 className="text-2xl font-black mb-2">Ready to Switch?</h3>
          <p className="text-white/75 text-sm mb-6">Open your account online in under 10 minutes. No branch visit required.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button className="px-7 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
              style={{ background: GOLD, color: "#222" }}>Open Account Online</button>
            <button className="px-7 py-3 rounded-xl text-sm font-bold text-white border border-white/30 hover:bg-white/10 transition-all">
              Visit Our Head Office
            </button>
          </div>
          <p className="text-white/50 text-xs mt-4">8 Rose Street, Cape Town CBD · Mon–Fri 08:00–17:00</p>
        </section>
      </div>
    </div>
  );
}
