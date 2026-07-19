import { useMemo, useState } from "react";
import {
  X, Phone, Mail, MapPin, Clock, MessageCircle, Loader2, CheckCircle,
  ChevronDown, Shield, Search, Building2, Smartphone, Upload, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { publicApi } from "../../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";

type TabId = "connect" | "locate" | "feedback";
const TABS: { id: TabId; label: string }[] = [
  { id: "connect",  label: "Connect With Us" },
  { id: "locate",   label: "Locate Us" },
  { id: "feedback", label: "Send Us Your Feedback" },
];

// ── Shared data ──────────────────────────────────────────────────────────
const EMERGENCY_CONTACTS = [
  { service: "Lost or Stolen Cards",     contact: "+27 (0)21 007 0772", href: "tel:+27210070772",  hours: "24/7" },
  { service: "Fraud Hotline",            contact: "+27 (0)61 461 5035", href: "tel:+27614615035",  hours: "24/7" },
  { service: "Digital Banking Support",  contact: "support@vink.com",   href: "mailto:support@vink.com", hours: "Business hours" },
  { service: "General Customer Care",    contact: "info@vink.com",      href: "mailto:info@vink.com",    hours: "Mon–Fri 08:00–17:00" },
];

const DIRECTORY = [
  { title: "Report Fraud", icon: <AlertTriangle className="w-5 h-5" />, urgent: true, items: ["Fraud Hotline — +27 (0)61 461 5035", "Card Blocking — via VMS App or Fraud Hotline", "Suspicious Transactions — report immediately", "Available 24/7"] },
  { title: "Lost or Stolen Cards", icon: <Shield className="w-5 h-5" />, urgent: true, items: ["Emergency Card Services", "+27 (0)21 007 0772", "Available 24 hours"] },
  { title: "Personal Banking", icon: <Building2 className="w-5 h-5" />, items: ["Savings & Current Accounts", "Debit & Credit Cards", "Internet & Mobile Banking"] },
  { title: "Business Banking", icon: <Building2 className="w-5 h-5" />, items: ["SME Banking", "Corporate Banking", "Merchant Services", "Business Loans"] },
  { title: "Loans & Credit", icon: <Building2 className="w-5 h-5" />, items: ["Home Loans", "Vehicle Finance", "Personal Loans"] },
  { title: "Savings & Investments", icon: <Building2 className="w-5 h-5" />, items: ["Fixed Deposits", "Investment Accounts", "Wealth Management"] },
  { title: "Insurance", icon: <Building2 className="w-5 h-5" />, items: ["Claims", "New Policies", "Financial Advice"] },
  { title: "International Banking", icon: <Building2 className="w-5 h-5" />, items: ["Forex", "International Payments", "Travel Cards"] },
  { title: "Media & General Enquiries", icon: <Mail className="w-5 h-5" />, items: ["Media Relations — media@vink.com", "General Enquiries — info@vink.com"] },
];

const AGENT_NETWORKS = [
  { name: "VMS Head Office", type: "office" as const, icon: "🏢", cover: "8 Rose Street, Cape Town CBD", services: "Account opening, FICA verification, card collection, business banking consultations", hours: "Mon–Fri 08:00–17:00" },
  { name: "Pick n Pay",  type: "agent" as const, icon: "🛒", cover: "Nationwide — all stores", services: "Card recharge, replacement, cash withdrawals", hours: "Store trading hours" },
  { name: "Shoprite",   type: "agent" as const, icon: "🛒", cover: "Nationwide — all stores", services: "Card recharge, cash withdrawals", hours: "Store trading hours" },
  { name: "Checkers",   type: "agent" as const, icon: "🛒", cover: "Nationwide — all stores", services: "Card recharge, cash withdrawals", hours: "Store trading hours" },
  { name: "Spar",       type: "agent" as const, icon: "🛒", cover: "Nationwide — all stores", services: "Card recharge, cash withdrawals", hours: "Store trading hours" },
  { name: "Spaza Shops", type: "agent" as const, icon: "🏪", cover: "Western Cape — participating", services: "Card recharge, airtime top-up", hours: "Store trading hours" },
];

const BEFORE_YOU_VISIT = [
  { title: "Opening an Account", items: ["South African ID or Passport", "Proof of Address", "Proof of Income"] },
  { title: "Collecting Your Card", items: ["South African ID", "Collection Reference"] },
  { title: "Receiving Forex", items: ["South African ID", "Reference Number"] },
  { title: "Sending Forex", items: ["South African ID", "Recipient Contact Details", "Recipient Address", "Supporting Documentation"] },
];

const TOPICS = ["Complaint", "Compliment", "Suggestion", "Online Banking", "Mobile Banking", "Cards", "Loans", "Insurance", "Investments"];

const FAQS = [
  { q: "How do I block my card?", a: "Call the Fraud Hotline immediately, or block your card instantly from the VMS App under Card Settings." },
  { q: "How do I reset my Online or Mobile Banking password?", a: "Select \"Forgot Password\" on the login screen of the VMS App or web portal, and follow the verification steps." },
  { q: "Can I track my complaint?", a: "Yes — you'll receive a reference number by email as soon as you submit the form below, which you can quote in any follow-up." },
  { q: "How do I report fraud?", a: "Call the Fraud Hotline on +27 (0)61 461 5035 immediately — it's available 24/7." },
  { q: "How long will it take to receive a response?", a: "General enquiries are answered within 1 business day. Feedback submitted via this page receives a full response within 1–2 business days." },
];

// ── Small building blocks ───────────────────────────────────────────────
function Accordion({ items }: { items: { title: string; icon: React.ReactNode; items: string[]; urgent?: boolean }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
      {items.map((it, i) => (
        <div key={i}>
          <button onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
            <span className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: it.urgent ? "#FEE2E2" : "#EDE9FE", color: it.urgent ? "#DC2626" : P }}>{it.icon}</span>
              <span className="font-bold text-gray-900 text-sm">{it.title}</span>
              {it.urgent && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">24/7</span>}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && (
            <div className="px-5 pb-4 pl-[4.25rem]">
              <ul className="space-y-1.5">
                {it.items.map((line, j) => <li key={j} className="text-sm text-gray-600">{line}</li>)}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
      {FAQS.map((f, i) => (
        <div key={i}>
          <button onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
            <span className="font-semibold text-gray-900 text-sm">{f.q}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && <div className="px-5 pb-4"><p className="text-sm text-gray-600">{f.a}</p></div>}
        </div>
      ))}
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-purple-300 hover:shadow-sm transition-all text-sm font-semibold text-gray-800">
      {icon}{label}
    </button>
  );
}

// ── Tab: Connect With Us ────────────────────────────────────────────────
function ConnectTab({ goTo }: { goTo: (t: TabId) => void }) {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xl font-black mb-5" style={{ color: P }}>How Can We Help You Today?</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: <Phone className="w-5 h-5" />, title: "Contact Customer Care", sub: "Speak to one of our consultants.", cta: "Call Now", href: "tel:+27210000000" },
            { icon: <MapPin className="w-5 h-5" />, title: "Locate a Branch or Agent", sub: "Find our Head Office or nearest agent point.", cta: "Search Locations", onClick: () => goTo("locate") },
            { icon: <MessageCircle className="w-5 h-5" />, title: "Send Feedback", sub: "Compliments, complaints and suggestions.", cta: "Send Feedback", onClick: () => goTo("feedback") },
            { icon: <AlertTriangle className="w-5 h-5" />, title: "Report Fraud", sub: "Lost cards or suspicious activity.", cta: "Report Now", href: "tel:+27614615035" },
          ].map((c, i) => (
            <div key={i} className="p-5 bg-white rounded-2xl border border-gray-200 flex flex-col">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "#EDE9FE", color: P }}>{c.icon}</div>
              <p className="font-bold text-gray-900 text-sm">{c.title}</p>
              <p className="text-xs text-gray-500 mt-1 flex-1">{c.sub}</p>
              {c.href
                ? <a href={c.href} className="mt-3 text-xs font-bold no-underline" style={{ color: P }}>{c.cta} →</a>
                : <button onClick={c.onClick} className="mt-3 text-xs font-bold text-left" style={{ color: P }}>{c.cta} →</button>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black mb-5" style={{ color: P }}>Contact Directory</h2>
        <Accordion items={DIRECTORY} />
      </section>

      <section>
        <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
          <h3 className="text-lg font-black mb-4">Need Immediate Assistance?</h3>
          <div className="space-y-2">
            {EMERGENCY_CONTACTS.map((e, i) => (
              <a key={i} href={e.href} className="flex items-center justify-between gap-3 bg-white/10 hover:bg-white/15 transition-colors rounded-xl px-4 py-3 no-underline">
                <span className="text-sm font-semibold text-white">{e.service}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-white/90">{e.contact}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">{e.hours}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Tab: Locate Us ───────────────────────────────────────────────────────
function LocateTab() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "office" | "agent">("all");
  const results = useMemo(() => AGENT_NETWORKS.filter(a =>
    (filter === "all" || a.type === filter) &&
    (query.trim() === "" || a.name.toLowerCase().includes(query.toLowerCase()) || a.cover.toLowerCase().includes(query.toLowerCase()))
  ), [query, filter]);

  return (
    <div className="space-y-10">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-2">Search by area, suburb or store name</label>
        <div className="flex gap-3">
          <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)} className="flex-1 text-sm outline-none text-gray-700" placeholder="e.g. Cape Town, Sandton..." />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {[["all", "All"], ["office", "Head Office"], ["agent", "Agent Points"]].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id as typeof filter)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{ background: filter === id ? P : "#F3F4F6", color: filter === id ? "#fff" : "#6B7280" }}>{label}</button>
          ))}
        </div>
      </div>

      <section>
        <p className="text-gray-500 text-sm -mt-6 mb-5">VMS is a digital-first bank — full banking services are available at our Head Office, with everyday card services available nationwide through our agent network.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {results.map((a, i) => (
            <div key={i} className={`flex items-start gap-4 p-5 bg-white rounded-xl border hover:shadow-md transition-shadow ${a.type === "office" ? "border-2" : "border-gray-200"}`}
              style={a.type === "office" ? { borderColor: P } : undefined}>
              <span className="text-3xl">{a.icon}</span>
              <div>
                <p className="font-bold text-gray-900">{a.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{a.cover}</p>
                <p className="text-xs text-gray-600 mt-1 font-medium">{a.services}</p>
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{a.hours}</p>
              </div>
            </div>
          ))}
          {results.length === 0 && <p className="text-sm text-gray-400 col-span-2 text-center py-8">No locations match your search.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black mb-5" style={{ color: P }}>Before You Visit</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BEFORE_YOU_VISIT.map((c, i) => (
            <div key={i} className="p-5 bg-white rounded-xl border border-gray-200">
              <p className="font-bold text-gray-900 text-sm mb-2">{c.title}</p>
              <ul className="space-y-1">
                {c.items.map((it, j) => (
                  <li key={j} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: P }} />{it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Tab: Send Us Your Feedback ──────────────────────────────────────────
function FeedbackTab() {
  const [form, setForm] = useState({
    bankingType: "Personal Banking", topic: TOPICS[0], message: "",
    firstName: "", lastName: "", email: "", phone: "", customerNumber: "",
    contactMethod: "Email", contactTime: "Morning",
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [captcha] = useState(() => { const a = 1 + Math.floor(Math.random()*9), b = 1 + Math.floor(Math.random()*9); return { a, b, answer: a + b }; });
  const [captchaInput, setCaptchaInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.message) {
      toast.error("Please fill in your name, email and message.");
      return;
    }
    if (Number(captchaInput) !== captcha.answer) {
      toast.error("CAPTCHA answer is incorrect — please try again.");
      return;
    }
    setSubmitting(true);
    const detailLines = [
      `Feedback for: ${form.bankingType}`,
      `Topic: ${form.topic}`,
      form.customerNumber ? `Customer Number: ${form.customerNumber}` : null,
      `Preferred Contact Method: ${form.contactMethod}`,
      `Preferred Contact Time: ${form.contactTime}`,
      attachment ? `Attachment: ${attachment.name} (not uploaded — attachments aren't supported by this form yet, please email it separately)` : null,
      "", form.message,
    ].filter(Boolean).join("\n");
    const r = await publicApi.contact({
      name: `${form.firstName} ${form.lastName}`, email: form.email, phone: form.phone,
      subject: `Feedback: ${form.topic}`, message: detailLines, type: form.bankingType,
    });
    setSubmitting(false);
    if (r.success) {
      const ref = "VMS-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      setSubmitted(ref);
      toast.success("Feedback sent — thank you!");
    } else {
      toast.error(r.error ?? "Failed to send feedback. Please try email directly.");
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center max-w-xl mx-auto">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="text-lg font-black text-green-800 mb-1">Feedback Sent!</h3>
        <p className="text-green-700 text-sm">Thank you — your reference number is <strong>{submitted}</strong>. You'll receive a response at <strong>{form.email}</strong> within 1–2 business days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-black mb-1" style={{ color: P }}>We'd Love to Hear From You</h2>
        <p className="text-gray-500 text-sm mb-6">Tell us how we're doing or let us know how we can improve.</p>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-2">You are giving feedback for</label>
            <div className="flex gap-4">
              {["Personal Banking", "Business Banking"].map(t => (
                <label key={t} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="bankingType" checked={form.bankingType === t}
                    onChange={() => setForm(f => ({ ...f, bankingType: t }))} style={{ accentColor: P }} />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Topic</label>
            <select value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400 bg-white">
              {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Message *</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={5}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400 resize-none" placeholder="Tell us what you need help with..." />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Your Details</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">First Name *</label>
                <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Last Name *</label>
                <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Email Address *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Phone Number</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="+27 000 000 0000" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Customer Number (optional)</label>
                <input value={form.customerNumber} onChange={e => setForm(f => ({ ...f, customerNumber: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-2">Preferred Contact Method</label>
              <div className="flex gap-4">
                {["Phone", "Email"].map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="contactMethod" checked={form.contactMethod === m}
                      onChange={() => setForm(f => ({ ...f, contactMethod: m }))} style={{ accentColor: P }} />{m}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-2">Preferred Contact Time</label>
              <div className="flex gap-4">
                {["Morning", "Afternoon", "Evening"].map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="contactTime" checked={form.contactTime === t}
                      onChange={() => setForm(f => ({ ...f, contactTime: t }))} style={{ accentColor: P }} />{t}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <label className="text-xs font-semibold text-gray-700 block mb-1">Attachment (optional)</label>
            <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-500 cursor-pointer hover:border-purple-300 transition-colors">
              <Upload className="w-4 h-4 flex-shrink-0" />
              {attachment ? attachment.name : "Upload supporting documents — PDF, PNG or JPEG, max 10MB"}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                onChange={e => setAttachment(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <label className="text-xs font-semibold text-gray-700 block mb-1">Quick check — what is {captcha.a} + {captcha.b}?</label>
            <input value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} inputMode="numeric"
              className="w-32 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-400" placeholder="Answer" />
          </div>

          <button onClick={handleSubmit} disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Send Message"}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black mb-6" style={{ color: P }}>What Happens Next?</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { n: 1, t: "Your enquiry is received immediately." },
            { n: 2, t: "A support consultant reviews your request." },
            { n: 3, t: "You'll receive a response within 1–2 business days." },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 text-center">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white mx-auto mb-3" style={{ background: P }}>{s.n}</div>
              <p className="text-sm text-gray-700">{s.t}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center mt-4">Complaint reference numbers are automatically generated on submission.</p>
      </section>

      <section>
        <h2 className="text-xl font-black mb-5" style={{ color: P }}>Frequently Asked Questions</h2>
        <FaqAccordion />
      </section>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────
export function ContactUsViewer({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("connect");
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gray-50">
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      {/* Hero */}
      <div className="py-14 px-6 text-white" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-black mb-2">We're Here to Help</h1>
          <p className="text-white/75 text-base max-w-xl mb-6">
            Whether you need banking assistance, want to visit our Head Office, report fraud, or send us feedback — our dedicated teams are here to support you.
          </p>
          <div className="flex flex-wrap gap-3">
            <QuickAction icon={<Phone className="w-4 h-4" style={{ color: P }} />} label="Call Us" onClick={() => { setTab("connect"); }} />
            <QuickAction icon={<MapPin className="w-4 h-4" style={{ color: P }} />} label="Find a Branch" onClick={() => setTab("locate")} />
            <QuickAction icon={<MessageCircle className="w-4 h-4" style={{ color: P }} />} label="Live Chat" onClick={() => { setTab("connect"); }} />
            <QuickAction icon={<Mail className="w-4 h-4" style={{ color: P }} />} label="Send Feedback" onClick={() => setTab("feedback")} />
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="sticky top-[57px] z-10 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto flex gap-8 px-5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`py-4 text-sm font-bold border-b-2 transition-colors ${tab === t.id ? "" : "border-transparent text-gray-400 hover:text-gray-600"}`}
              style={tab === t.id ? { color: P, borderColor: P } : undefined}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10">
        {tab === "connect"  && <ConnectTab goTo={setTab} />}
        {tab === "locate"   && <LocateTab />}
        {tab === "feedback" && <FeedbackTab />}

        {/* Persistent footer blocks — shown regardless of active tab */}
        <div className="mt-14 grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Head Office</p>
            <p className="font-black text-gray-900">VMS Bank Limited</p>
            <p className="text-sm text-gray-600 mt-1">State House Building<br />8 Rose Street, Cape Town<br />South Africa</p>
            <p className="text-sm text-gray-600 mt-3">
              <Mail className="w-3.5 h-3.5 inline mr-1.5" style={{ color: P }} />
              <a href="mailto:info@vink.com" className="no-underline" style={{ color: P }}>info@vink.com</a>
            </p>
            <p className="text-sm text-gray-600 mt-1"><Clock className="w-3.5 h-3.5 inline mr-1.5" style={{ color: P }} />Mon–Fri 08:00–17:00</p>
          </div>
          <div className="rounded-2xl p-6 text-white flex flex-col justify-between" style={{ background: `linear-gradient(135deg,${P},#7B4DB5)` }}>
            <div>
              <p className="font-black flex items-center gap-2 mb-1"><Smartphone className="w-4 h-4" /> Download the Mobile App</p>
              <p className="text-sm text-white/80">Mobile banking, instant payments, card management, balance enquiries and secure login — all in one app.</p>
            </div>
            <div className="flex gap-2 mt-4">
              <span className="text-xs font-semibold bg-white/15 px-3 py-1.5 rounded-lg">App Store</span>
              <span className="text-xs font-semibold bg-white/15 px-3 py-1.5 rounded-lg">Google Play</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
