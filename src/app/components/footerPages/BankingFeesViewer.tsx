import { X } from "lucide-react";
import vinkLogo from "../../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#0B5C2E";
const GOLD = "#F5A623";

const ACCOUNT_FEES = [
  { product: "VINK Commuter Card", monthly: "R0", note: "No monthly fee, ever." },
  { product: "Personal Account", monthly: "R0 for the first 12 months, standard fee applies after", note: "Exact ongoing fee confirmed at launch." },
  { product: "Business Account", monthly: "R0 for the first 12 months, standard fee applies after", note: "Exact ongoing fee confirmed at launch." },
  { product: "VINK Gold (Visa Infinite Elite)", monthly: "Premium annual fee applies", note: "Full fee schedule published at launch." },
];

const TRANSACTION_FEES = [
  { item: "Taxi fare tap (VINK Commuter Card)", fee: "R0.50 per transaction" },
  { item: "Card purchases in South Africa", fee: "No fee" },
  { item: "ATM withdrawal at partner banks", fee: "Fee-free at listed partner ATMs; standard fee elsewhere" },
  { item: "Foreign transaction (SADC network)", fee: "Confirmed at launch — see Exchange Rates" },
];

export function BankingFeesViewer({ isOpen, onClose }: Props) {
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
            style={{ background: "rgba(245,166,35,.2)", color: GOLD }}>Pricing</span>
          <h1 className="text-4xl font-black mb-3">Banking Rates &amp; Fees</h1>
          <p className="text-white/75 text-lg max-w-2xl leading-relaxed">
            A clear, upfront look at what VINK products cost — and what stays free.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">

        <section className="rounded-2xl p-5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
          <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
            VINK is not yet in full operation. The figures below reflect our published product design and are confirmed in full when we launch in June 2027 — nothing on this page can be paid or activated today.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Account &amp; Card Fees</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {ACCOUNT_FEES.map((f, i) => (
              <div key={i} className={`p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                <div>
                  <p className="font-bold text-gray-900">{f.product}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.note}</p>
                </div>
                <span className="text-sm font-bold shrink-0" style={{ color: P }}>{f.monthly}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Transaction Fees</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {TRANSACTION_FEES.map((f, i) => (
              <div key={i} className={`p-5 flex items-center justify-between gap-4 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                <p className="text-gray-700 text-sm">{f.item}</p>
                <span className="text-sm font-bold shrink-0 text-right" style={{ color: P }}>{f.fee}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h2 className="text-lg font-black mb-3" style={{ color: P }}>Our Fee Philosophy</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            VINK was built for people who currently pay too much to move money — taxi commuters, drivers, and small operators. Wherever possible, our pricing is designed to undercut traditional banking fees on the transactions that matter most to the people we serve, starting with the daily taxi fare tap.
          </p>
        </section>
      </div>
    </div>
  );
}
