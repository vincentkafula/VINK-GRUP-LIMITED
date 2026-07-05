import { useState } from "react";
import { X, Phone, Mail, MapPin, Clock, MessageCircle, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { publicApi } from "../../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";
const GOLD = "#F5A623";

const CHANNELS = [
  { icon: <Phone className="w-6 h-6" />, label: "Fraud / Emergency", value: "+27 (0)21 007 0772", sub: "24 hours · 7 days a week", color: "#EF4444", href: "tel:+27210070772" },
  { icon: <Phone className="w-6 h-6" />, label: "Fraud / Emergency", value: "+27 (0)61 461 5035", sub: "24 hours · 7 days a week", color: "#EF4444", href: "tel:+27614615035" },
  { icon: <MessageCircle className="w-6 h-6" />, label: "Live Chat", value: "Chat on VMS App", sub: "Available 24/7", color: "#10B981", href: "#" },
  { icon: <Mail className="w-6 h-6" />, label: "Customer Support", value: "support@vink.com", sub: "Reply within 2 business hours", color: "#3B82F6", href: "mailto:support@vink.com" },
  { icon: <Mail className="w-6 h-6" />, label: "General Enquiries", value: "info@vink.com", sub: "Business days", color: P, href: "mailto:info@vink.com" },
  { icon: <MapPin className="w-6 h-6" />, label: "Head Office", value: "8 Rose Street, Cape Town CBD", sub: "By appointment · Mon–Fri 08:00–17:00", color: "#F59E0B", href: "#" },
];

const HOURS = [
  { channel: "Phone Support",   hours: "Mon–Fri 08:00–20:00 | Sat 09:00–14:00" },
  { channel: "Live Chat (App)", hours: "Available 24/7" },
  { channel: "Email Support",   hours: "Responses within 2 business hours (business days)" },
  { channel: "Head Office",     hours: "Mon–Fri 08:00–17:00" },
  { channel: "Fraud Line",      hours: "24 hours, 7 days a week" },
];

const CUSTOMER_TYPES = ["Personal", "Business", "Corporate"];

export function ContactUsViewer({ isOpen, onClose }: Props) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "", account: "", type: "Personal" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.message) {
      toast.error("Please fill in your name, email and message.");
      return;
    }
    setSubmitting(true);
    const r = await publicApi.contact({ name: form.name, email: form.email, phone: form.phone, subject: form.subject || "General Enquiry", message: form.message, type: form.type });
    setSubmitting(false);
    if (r.success) {
      setSubmitted(true);
      toast.success("Message sent! We will respond within 2 business hours.");
    } else {
      toast.error(r.error ?? "Failed to send message. Please try email directly.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gray-50">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      <div className="py-14 px-6 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-black mb-2">Get in Touch</h1>
          <p className="text-white/75 text-base max-w-xl">We&apos;re here to help — 24/7 for emergencies, or during business hours for everything else.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10 space-y-10">
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Contact Channels</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CHANNELS.map((c, i) => (
              <a key={i} href={c.href} className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow no-underline">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: c.color }}>{c.icon}</div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{c.label}</p>
                  <p className="font-bold text-gray-900 text-sm mt-0.5">{c.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-black mb-5" style={{ color: P }}>Operating Hours</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {HOURS.map((h, i) => (
              <div key={i} className={`flex items-center justify-between px-5 py-4 ${i < HOURS.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" style={{ color: P }} />
                  <span className="text-sm font-semibold text-gray-800">{h.channel}</span>
                </div>
                <span className="text-sm text-gray-600">{h.hours}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Contact form */}
        <section>
          <h2 className="text-2xl font-black mb-6" style={{ color: P }}>Send a Message</h2>

          {submitted ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="text-lg font-black text-green-800 mb-1">Message Sent!</h3>
              <p className="text-green-700 text-sm">Thank you for contacting us. We will respond to <strong>{form.email}</strong> within 2 business hours.</p>
              <button onClick={() => setSubmitted(false)} className="mt-4 text-sm font-semibold underline text-green-700">Send another message</button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Full Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="Your full name" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Email Address *</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="your@email.com" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Phone Number</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="+27 000 000 0000" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Account Number (optional)</label>
                  <input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="VMS account number" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">I am a</label>
                <div className="flex gap-2">
                  {CUSTOMER_TYPES.map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={{ background: form.type === t ? P : "#F3F4F6", color: form.type === t ? "#fff" : "#6B7280" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Subject</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="How can we help?" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Message *</label>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400 resize-none" placeholder="Tell us what you need help with..." />
              </div>
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Send Message"}
              </button>
            </div>
          )}
        </section>

        <section className="grid sm:grid-cols-2 gap-4">
          {[{ label: "Media & PR", email: "media@vink.com" }, { label: "Sponsorships", email: "sponsorships@vink.com" }, { label: "Careers", email: "careers@vink.com" }, { label: "Privacy / POPIA", email: "privacy@vink.com" }].map((e, i) => (
            <a key={i} href={`mailto:${e.email}`} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-purple-200 hover:bg-purple-50 transition-all no-underline">
              <Mail className="w-4 h-4 flex-shrink-0" style={{ color: P }} />
              <div>
                <p className="text-xs text-gray-500">{e.label}</p>
                <p className="text-sm font-semibold" style={{ color: P }}>{e.email}</p>
              </div>
            </a>
          ))}
        </section>
      </div>
    </div>
  );
}
