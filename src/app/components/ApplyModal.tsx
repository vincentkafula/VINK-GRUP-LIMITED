import { useState } from "react";
import { X, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { publicApi } from "../services/apiClient";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  product: string;
  tier?: string;
  price?: string;
}

const P = "#5B2D8E";

const EMPLOYMENT_OPTIONS = ["Employed (Full-time)", "Employed (Part-time)", "Self-employed", "Business owner", "Pensioner", "Student", "Unemployed"];

export function ApplyModal({ isOpen, onClose, product, tier, price }: Props) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", idNumber: "", income: "", employmentStatus: "Employed (Full-time)", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [refNo, setRefNo] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.phone) {
      toast.error("Please fill in your name, email and phone number.");
      return;
    }
    if (!form.email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    const r = await publicApi.apply({ product, tier, name: form.name, email: form.email, phone: form.phone, idNumber: form.idNumber, income: form.income, employmentStatus: form.employmentStatus, message: form.message });
    setSubmitting(false);
    if (r.success && r.data) {
      const d = r.data as { referenceNumber: string };
      setRefNo(d.referenceNumber);
      toast.success(`Application submitted! Reference: ${d.referenceNumber}`);
    } else {
      toast.error(r.error ?? "Application failed. Please try again or contact us.");
    }
  };

  const reset = () => { setRefNo(null); setForm({ name: "", email: "", phone: "", idNumber: "", income: "", employmentStatus: "Employed (Full-time)", message: "" }); };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <p className="font-black text-gray-900 text-base">{refNo ? "Application Submitted" : "Apply Now"}</p>
            <p className="text-xs text-gray-500 mt-0.5">{product}{price ? ` — ${price}/month` : ""}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        {refNo ? (
          <div className="p-6 text-center">
            <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-black text-gray-900 mb-2">You&apos;re all set!</h3>
            <p className="text-gray-600 text-sm mb-4 leading-relaxed">
              Your application for <strong>{product}</strong> has been received. A VMS advisor will contact you at <strong>{form.email}</strong> within 1 business day.
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-gray-500 mb-1">Reference Number</p>
              <p className="text-2xl font-black" style={{ color: P }}>{refNo}</p>
              <p className="text-xs text-gray-400 mt-1">Keep this for your records</p>
            </div>
            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
                Apply for another
              </button>
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="rounded-xl p-3 text-sm" style={{ background: "#F3F0FB", color: P }}>
              <strong>{product}</strong>{tier ? ` · ${tier}` : ""}{price ? ` · ${price}/month` : ""}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Full Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="Your full name" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="your@email.com" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Phone *</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="+27 000 000 0000" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">ID Number</label>
                <input value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="SA ID number" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Monthly Income</label>
                <input value={form.income} onChange={e => setForm(f => ({ ...f, income: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="R 0,000" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Employment Status</label>
                <select value={form.employmentStatus} onChange={e => setForm(f => ({ ...f, employmentStatus: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 bg-white">
                  {EMPLOYMENT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Additional Notes (optional)</label>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 resize-none" placeholder="Any additional information..." />
              </div>
            </div>

            <p className="text-[10px] text-gray-400 leading-relaxed">
              By submitting this application you consent to VMS processing your personal information in accordance with POPIA. A soft credit inquiry may be performed.
            </p>

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : "Submit Application"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
