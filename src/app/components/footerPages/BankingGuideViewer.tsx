import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#0B5C2E";
const GOLD = "#F5A623";

const STEPS = [
  { n: "1", title: "Open your account", desc: "Apply online in minutes — a personal, business, or commuter card account. FICA verification happens digitally, no branch visit required." },
  { n: "2", title: "Get your card", desc: "Your Vink card is issued digitally the moment your account is approved, so you can start using it in the app immediately while your physical card is on its way." },
  { n: "3", title: "Tap, pay, and track", desc: "Tap your card at any Vink-enabled taxi, retailer, or partner merchant. Every transaction shows up in the app in real time — no waiting for statements." },
  { n: "4", title: "Manage it all in one app", desc: "Check your balance, freeze your card, add money, set spending limits, and reach support — all from the same app you used to apply." },
];

const TOPICS = [
  { icon: "💳", title: "Understanding your card", desc: "How your Vink card works, what tap-and-go actually does, and how to read a transaction on your statement." },
  { icon: "📱", title: "Using the Vink app", desc: "Navigating your dashboard, setting up notifications, and finding your virtual card details for online purchases." },
  { icon: "🔒", title: "Keeping your account secure", desc: "PINs, one-time passwords, and what to do immediately if your card is lost or you spot something unfamiliar." },
  { icon: "💰", title: "Fees and how to avoid them", desc: "Which everyday transactions are free, and which have a cost — see our full Banking Rates & Fees page for the complete list." },
];

export function BankingGuideViewer({ isOpen, onClose }: Props) {
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
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Getting Started</span>
          <h1 className="text-4xl font-black mb-3">A Guide to Help You Bank</h1>
          <p className="text-white/75 text-lg max-w-2xl leading-relaxed">
            Everything you need to know to get comfortable with VINK, from opening your account to using your card every day.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="rounded-2xl p-5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
            VINK is not yet in full operation. This guide describes how VINK will work once we launch in June 2027 — you're welcome to read through it now, but accounts and cards aren't active yet.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Getting Started, Step by Step</h2>
          <div className="space-y-4">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0" style={{ background: P }}>{s.n}</span>
                <div>
                  <p className="font-bold text-gray-900 mb-1">{s.title}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Popular Topics</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {TOPICS.map((t, i) => (
              <div key={i} className="p-5 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-2xl mb-2 block">{t.icon}</span>
                <p className="font-bold text-gray-900 mb-1">{t.title}</p>
                <p className="text-gray-600 text-sm leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h2 className="text-lg font-black mb-3" style={{ color: P }}>Still Have Questions?</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Our support team is happy to help, even before launch. Reach out through Contact Us and we'll get back to you within one business day.
          </p>
        </section>
      </div>
    </div>
  );
}
