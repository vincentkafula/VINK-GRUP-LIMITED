import { useState } from "react";
import { CheckCircle, CreditCard, TrendingUp, Clock, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { publicApi } from "../services/apiClient";

const STEPS = [
  { icon: <TrendingUp className="w-4 h-4"/>, label: "Answer 3 quick questions" },
  { icon: <CheckCircle className="w-4 h-4"/>, label: "See your personalised matches" },
  { icon: <CreditCard className="w-4 h-4"/>, label: "Apply with one tap" },
];

const P = "#6B5ED7";

interface CreditResult {
  score: number;
  rating: string;
  eligible: { product: string; approved: boolean; reason: string }[];
  tips: string[];
}

export function PreApprovalSection() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ idNumber: "", firstName: "", lastName: "", income: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreditResult | null>(null);

  const handleCreditCheck = async () => {
    if (!form.idNumber || form.idNumber.length < 6) {
      toast.error("Please enter a valid ID number.");
      return;
    }
    setLoading(true);
    const r = await publicApi.creditCheck(form);
    setLoading(false);
    if (r.success && r.data) {
      setResult(r.data as CreditResult);
      toast.success(`Credit check complete — score: ${(r.data as CreditResult).score}`);
    } else {
      toast.error(r.error ?? "Credit check failed. Please try again.");
    }
  };

  const scoreColor = (s: number) => s >= 750 ? "#10B981" : s >= 650 ? "#3B82F6" : s >= 550 ? "#F59E0B" : "#EF4444";

  return (
    <section className="py-16 sm:py-20" style={{ background: "#F8F7FF" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ background: "#EDE9FE", color: P }}>No Hard Inquiry</span>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">
            Know exactly where you stand before you apply for any Vink card.
          </h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            It&apos;s completely free, takes under 60 seconds, and won&apos;t touch your credit score.
          </p>
        </div>

        {/* Credit check result */}
        {result && (
          <div className="max-w-3xl mx-auto mb-8 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs text-gray-500 font-medium">Your Credit Score</p>
                <div className="flex items-end gap-2 mt-1">
                  <span className="text-5xl font-black" style={{ color: scoreColor(result.score) }}>{result.score}</span>
                  <span className="text-lg font-semibold text-gray-600 mb-1">/ 850</span>
                  <span className="mb-1 px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: scoreColor(result.score) }}>{result.rating}</span>
                </div>
              </div>
              <button onClick={() => setResult(null)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Pre-Qualification Results</p>
              <div className="space-y-2">
                {result.eligible.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border"
                    style={{ borderColor: e.approved ? "#D1FAE5" : "#FEE2E2", background: e.approved ? "#F0FDF4" : "#FFF5F5" }}>
                    <span style={{ color: e.approved ? "#10B981" : "#EF4444" }} className="text-base">{e.approved ? "✓" : "✗"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">{e.product}</p>
                      <p className="text-[10px] text-gray-500">{e.reason}</p>
                    </div>
                    {e.approved && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#059669" }}>Eligible</span>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Tips to Improve Your Score</p>
              <ul className="space-y-1">
                {result.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <span style={{ color: P }}>•</span>{tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Card 1 — Credit Score */}
          <div className="bg-white rounded-2xl border border-gray-200 p-7 hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-5 pointer-events-none"
              style={{ background: `radial-gradient(circle,${P},transparent)`, transform: "translate(30%,-30%)" }}/>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"
              style={{ background: "linear-gradient(135deg,#EDE9FE,#DDD6FE)" }}>
              <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
                <circle cx="20" cy="14" r="6" stroke={P} strokeWidth="2.2"/>
                <path d="M8 36 C8 28 13 24 20 24 C27 24 32 28 32 36" stroke={P} strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M26 20 L28 22 L33 17" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3"
              style={{ background: "#DCFCE7", color: "#16A34A" }}>Free — Always</span>
            <h3 className="font-bold text-gray-900 text-base mb-2">See Your Credit Score Instantly</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-5">
              View your full credit profile at no cost. We show which Vink cards you&apos;re likely to qualify for and personalised tips to improve your score.
            </p>

            {showForm ? (
              <div className="space-y-3">
                <input value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" placeholder="ID Number *" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" placeholder="First name" />
                  <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" placeholder="Last name" />
                </div>
                <input value={form.income} onChange={e => setForm(f => ({ ...f, income: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" placeholder="Monthly income (optional)" />
                <button onClick={handleCreditCheck} disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                  {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</> : "Check My Score"}
                </button>
              </div>
            ) : (
              <button onClick={() => setShowForm(true)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                Check My Score
              </button>
            )}
          </div>

          {/* Card 2 — Pre-qualify */}
          <div className="bg-white rounded-2xl border border-gray-200 p-7 hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"
              style={{ background: "linear-gradient(135deg,#DBEAFE,#BFDBFE)" }}>
              <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
                <rect x="7" y="10" width="26" height="20" rx="3" stroke="#3B82F6" strokeWidth="2.2"/>
                <line x1="7" y1="17" x2="33" y2="17" stroke="#3B82F6" strokeWidth="2"/>
                <rect x="10" y="21" width="7" height="5" rx="1.5" fill="#3B82F6"/>
                <rect x="21" y="21" width="10" height="5" rx="1.5" fill="#3B82F6" opacity="0.35"/>
              </svg>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-3"
              style={{ background: "#DBEAFE", color: "#1D4ED8" }}>
              <Clock className="w-2.5 h-2.5"/> 60 Seconds
            </span>
            <h3 className="font-bold text-gray-900 text-base mb-2">Pre-Qualify With No Impact</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-5">
              Answer three quick questions and see personalised card offers matched to your profile — no hard credit inquiry, no risk.
            </p>
            <button onClick={() => { setShowForm(true); toast.info("Enter your ID number to pre-qualify."); }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#3B82F6,#60A5FA)" }}>
              Pre-Qualify Now
            </button>
          </div>

          {/* Card 3 — How it works */}
          <div className="rounded-2xl p-7 text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#5B4EC7,#8B6FE8)" }}>
            <h3 className="font-bold text-white text-base mb-1">Three Steps to Your Card</h3>
            <p className="text-white/70 text-sm mb-6">Getting started with VMS is simple, fast, and completely transparent.</p>
            <div className="space-y-4">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,.2)" }}>{step.icon}</div>
                  <p className="text-sm text-white/85 font-medium">{step.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-white/20 text-center">
              <p className="text-white/60 text-xs">Trusted by over 2 million South Africans on the move.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
