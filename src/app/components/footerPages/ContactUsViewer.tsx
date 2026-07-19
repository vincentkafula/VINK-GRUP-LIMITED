import { useMemo, useState } from "react";
import {
  X, Phone, Mail, MapPin, Clock, MessageCircle, Loader2, CheckCircle,
  ChevronDown, Shield, Search, Building2, Smartphone, Upload, AlertTriangle, Plus,
} from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { publicApi } from "../../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";
const P_DARK = "#3E1E63";
const GOLD = "#F5A623";

type TabId = "connect" | "locate" | "feedback";
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "connect",  label: "Connect With Us", icon: <MessageCircle className="w-4 h-4" /> },
  { id: "locate",   label: "Locate Us",       icon: <MapPin className="w-4 h-4" /> },
  { id: "feedback", label: "Send Feedback",   icon: <Mail className="w-4 h-4" /> },
];

const OFFICES = [
  { flag: "🇿🇦", country: "South Africa", city: "Cape Town — HQ" },
  { flag: "🇿🇲", country: "Zambia",        city: "Lusaka" },
  { flag: "🇺🇸", country: "USA",           city: "New York" },
  { flag: "🇬🇧", country: "UK",            city: "London" },
  { flag: "🇨🇳", country: "China",         city: "Shanghai" },
];

// ── Shared data ──────────────────────────────────────────────────────────
const EMERGENCY_CONTACTS = [
  { service: "Lost or Stolen Cards",     contact: "+27 (0)21 007 0772", href: "tel:+27210070772",  hours: "24/7" },
  { service: "Fraud Hotline",            contact: "+27 (0)61 461 5035", href: "tel:+27614615035",  hours: "24/7" },
  { service: "Digital Banking Support",  contact: "support@vink.com",   href: "mailto:support@vink.com", hours: "Business hours" },
  { service: "General Customer Care",    contact: "info@vink.com",      href: "mailto:info@vink.com",    hours: "Mon–Fri 08:00–17:00" },
];

const DIRECTORY = [
  { title: "Report Fraud", icon: <AlertTriangle className="w-4 h-4" />, urgent: true, items: ["Fraud Hotline — +27 (0)61 461 5035", "Card blocking via VMS App", "Suspicious transactions"] },
  { title: "Lost or Stolen Cards", icon: <Shield className="w-4 h-4" />, urgent: true, items: ["Emergency card services", "+27 (0)21 007 0772", "Available 24 hours"] },
  { title: "Personal Banking", icon: <Building2 className="w-4 h-4" />, items: ["Savings & current accounts", "Debit & credit cards", "Internet & mobile banking"] },
  { title: "Business Banking", icon: <Building2 className="w-4 h-4" />, items: ["SME banking", "Corporate banking", "Merchant services", "Business loans"] },
  { title: "Loans & Credit", icon: <Building2 className="w-4 h-4" />, items: ["Home loans", "Vehicle finance", "Personal loans"] },
  { title: "Savings & Investments", icon: <Building2 className="w-4 h-4" />, items: ["Fixed deposits", "Investment accounts", "Wealth management"] },
  { title: "Insurance", icon: <Building2 className="w-4 h-4" />, items: ["Claims", "New policies", "Financial advice"] },
  { title: "International Banking", icon: <Building2 className="w-4 h-4" />, items: ["Forex", "International payments", "Travel cards"] },
  { title: "Media & General", icon: <Mail className="w-4 h-4" />, items: ["Media relations — media@vink.com", "General enquiries — info@vink.com"] },
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
  { title: "Sending Forex", items: ["South African ID", "Recipient Details", "Supporting Documentation"] },
];

const TOPICS = ["Complaint", "Compliment", "Suggestion", "Online Banking", "Mobile Banking", "Cards", "Loans", "Insurance", "Investments"];

const FAQS = [
  { q: "How do I block my card?", a: "Call the Fraud Hotline immediately, or block your card instantly from the VMS App under Card Settings." },
  { q: "How do I reset my Online or Mobile Banking password?", a: "Select \"Forgot Password\" on the login screen of the VMS App or web portal, and follow the verification steps." },
  { q: "Can I track my complaint?", a: "Yes — you'll get a reference number as soon as you submit the form, which you can quote in any follow-up." },
  { q: "How do I report fraud?", a: "Call the Fraud Hotline on +27 (0)61 461 5035 immediately — it's available 24/7." },
  { q: "How long until I get a response?", a: "General enquiries: within 1 business day. Feedback submitted here: within 1–2 business days." },
  { q: "Is my feedback confidential?", a: "Yes — feedback is only visible to the relevant VMS support team handling your enquiry." },
];

// ── Small building blocks ───────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: GOLD }}>{children}</p>;
}

function DirectoryGrid() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {DIRECTORY.map((it, i) => {
        const isOpen = open === i;
        return (
          <button key={i} onClick={() => setOpen(isOpen ? null : i)}
            className={`text-left rounded-2xl bg-white border transition-all overflow-hidden ${isOpen ? "shadow-md" : "hover:shadow-sm"}`}
            style={{ borderColor: isOpen ? (it.urgent ? "#FCA5A5" : "#C4B0E0") : "#E5E7EB", borderLeftWidth: 3, borderLeftColor: it.urgent ? "#EF4444" : P }}>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: it.urgent ? "#FEE2E2" : "#EDE9FE", color: it.urgent ? "#DC2626" : P }}>{it.icon}</span>
              <span className="font-bold text-gray-900 text-sm flex-1">{it.title}</span>
              {it.urgent && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">24/7</span>}
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
            </div>
            {isOpen && (
              <div className="px-4 pb-3.5 pl-[3.75rem] -mt-1">
                <ul className="space-y-1">
                  {it.items.map((line, j) => <li key={j} className="text-xs text-gray-600">{line}</li>)}
                </ul>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FaqGrid() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <button key={i} onClick={() => setOpen(isOpen ? null : i)}
            className={`text-left rounded-2xl bg-white border px-4 py-3.5 transition-all ${isOpen ? "shadow-md border-purple-200" : "border-gray-200 hover:shadow-sm"}`}>
            <span className="flex items-center justify-between gap-3">
              <span className="font-semibold text-gray-900 text-sm">{f.q}</span>
              <Plus className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? "rotate-45" : ""}`} style={{ color: P }} />
            </span>
            {isOpen && <p className="text-xs text-gray-600 mt-2 leading-relaxed">{f.a}</p>}
          </button>
        );
      })}
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/95 hover:bg-white transition-all text-sm font-bold shadow-lg shadow-black/10 hover:-translate-y-0.5"
      style={{ color: P_DARK }}>
      {icon}{label}
    </button>
  );
}

function Field({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500 block mb-1.5">{label}{required && <span style={{ color: P }}> *</span>}</label>
      {children}
    </div>
  );
}
const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all bg-white";

// ── Tab: Connect With Us ────────────────────────────────────────────────
function ConnectTab({ goTo }: { goTo: (t: TabId) => void }) {
  return (
    <div className="space-y-9">
      <section>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: <Phone className="w-5 h-5" />, title: "Customer Care", sub: "Speak to a consultant", cta: "Call now", href: "tel:+27210000000" },
            { icon: <MapPin className="w-5 h-5" />, title: "Branches & Agents", sub: "Head Office & national network", cta: "Search", onClick: () => goTo("locate") },
            { icon: <MessageCircle className="w-5 h-5" />, title: "Feedback", sub: "Compliments & complaints", cta: "Get started", onClick: () => goTo("feedback") },
            { icon: <AlertTriangle className="w-5 h-5" />, title: "Report Fraud", sub: "Lost cards, suspicious activity", cta: "Call hotline", href: "tel:+27614615035", urgent: true },
          ].map((c, i) => (
            <div key={i} className="group p-5 bg-white rounded-2xl border border-gray-200 hover:border-purple-200 hover:shadow-md transition-all flex flex-col">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: c.urgent ? "#FEE2E2" : "#EDE9FE", color: c.urgent ? "#DC2626" : P }}>{c.icon}</div>
              <p className="font-bold text-gray-900 text-sm">{c.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 flex-1">{c.sub}</p>
              {c.href
                ? <a href={c.href} className="mt-3 text-xs font-bold no-underline group-hover:underline" style={{ color: c.urgent ? "#DC2626" : P }}>{c.cta} →</a>
                : <button onClick={c.onClick} className="mt-3 text-xs font-bold text-left group-hover:underline" style={{ color: P }}>{c.cta} →</button>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div><Eyebrow>Directory</Eyebrow><h2 className="text-lg font-black text-gray-900">Who do you need?</h2></div>
        </div>
        <DirectoryGrid />
      </section>

      <section className="rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg,${P_DARK},${P})` }}>
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
        <h3 className="text-base font-black mb-4 flex items-center gap-2 relative"><Shield className="w-4 h-4" style={{ color: GOLD }} />Need Immediate Assistance?</h3>
        <div className="grid sm:grid-cols-2 gap-2 relative">
          {EMERGENCY_CONTACTS.map((e, i) => (
            <a key={i} href={e.href} className="flex items-center justify-between gap-3 bg-white/10 hover:bg-white/15 transition-colors rounded-xl px-4 py-3 no-underline">
              <span>
                <span className="text-sm font-semibold text-white block">{e.service}</span>
                <span className="text-xs text-white/70">{e.hours}</span>
              </span>
              <span className="text-xs font-bold whitespace-nowrap" style={{ color: GOLD }}>{e.contact}</span>
            </a>
          ))}
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
    <div className="space-y-9">
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} className="flex-1 text-sm outline-none text-gray-700" placeholder="Search by area, suburb or store..." />
        </div>
        <div className="flex gap-2">
          {[["all", "All"], ["office", "Head Office"], ["agent", "Agents"]].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id as typeof filter)}
              className="px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-none"
              style={{ background: filter === id ? P : "#F3F4F6", color: filter === id ? "#fff" : "#6B7280" }}>{label}</button>
          ))}
        </div>
      </div>

      <section>
        <p className="text-gray-400 text-xs mb-4">VMS is a digital-first bank — full services at our Head Office, everyday card services nationwide via our agent network.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {results.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 bg-white rounded-xl border hover:shadow-sm transition-shadow ${a.type === "office" ? "border-2" : "border-gray-200"}`}
              style={a.type === "office" ? { borderColor: P } : undefined}>
              <span className="text-2xl">{a.icon}</span>
              <div>
                <p className="font-bold text-gray-900 text-sm">{a.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{a.cover}</p>
                <p className="text-xs text-gray-600 mt-1">{a.services}</p>
                <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{a.hours}</p>
              </div>
            </div>
          ))}
          {results.length === 0 && <p className="text-sm text-gray-400 col-span-2 text-center py-8">No locations match your search.</p>}
        </div>
      </section>

      <section>
        <Eyebrow>Checklist</Eyebrow>
        <h2 className="text-lg font-black text-gray-900 mb-4">Before You Visit</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BEFORE_YOU_VISIT.map((c, i) => (
            <div key={i} className="p-4 bg-white rounded-xl border border-gray-200">
              <p className="font-bold text-gray-900 text-xs mb-2">{c.title}</p>
              <ul className="space-y-1">
                {c.items.map((it, j) => (
                  <li key={j} className="text-[11px] text-gray-600 flex items-start gap-1.5">
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
      <div className="bg-white border border-green-200 rounded-2xl p-10 text-center max-w-lg mx-auto shadow-sm">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-7 h-7 text-green-500" />
        </div>
        <h3 className="text-lg font-black text-gray-900 mb-1">Feedback sent</h3>
        <p className="text-gray-500 text-sm">Your reference number is</p>
        <p className="text-xl font-black tracking-wide my-2" style={{ color: P }}>{submitted}</p>
        <p className="text-gray-500 text-sm">We'll respond to <strong className="text-gray-700">{form.email}</strong> within 1–2 business days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-9">
      <section>
        <Eyebrow>Feedback</Eyebrow>
        <h2 className="text-lg font-black text-gray-900 mb-5">We'd love to hear from you</h2>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="You're giving feedback for">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {["Personal Banking", "Business Banking"].map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, bankingType: t }))}
                    className="flex-1 text-xs font-bold py-2 rounded-lg transition-all"
                    style={{ background: form.bankingType === t ? "white" : "transparent", color: form.bankingType === t ? P : "#9CA3AF", boxShadow: form.bankingType === t ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
                    {t.replace(" Banking", "")}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Topic">
              <select value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} className={inputCls}>
                {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Message" required>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={4}
              className={`${inputCls} resize-none`} placeholder="Tell us what you need help with..." />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <Field label="First Name" required><input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className={inputCls} /></Field>
            <Field label="Last Name" required><input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className={inputCls} /></Field>
            <Field label="Email Address" required><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></Field>
            <Field label="Phone Number"><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="+27 000 000 0000" /></Field>
            <Field label="Customer Number (optional)"><input value={form.customerNumber} onChange={e => setForm(f => ({ ...f, customerNumber: e.target.value }))} className={inputCls} /></Field>
            <Field label="Attachment (optional)">
              <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-3.5 py-2.5 text-xs text-gray-500 cursor-pointer hover:border-purple-300 transition-colors truncate">
                <Upload className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{attachment ? attachment.name : "PDF, PNG or JPEG, max 10MB"}</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => setAttachment(e.target.files?.[0] ?? null)} />
              </label>
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <Field label="Preferred Contact Method">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {["Phone", "Email"].map(m => (
                  <button key={m} onClick={() => setForm(f => ({ ...f, contactMethod: m }))} className="flex-1 text-xs font-bold py-2 rounded-lg transition-all"
                    style={{ background: form.contactMethod === m ? "white" : "transparent", color: form.contactMethod === m ? P : "#9CA3AF", boxShadow: form.contactMethod === m ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>{m}</button>
                ))}
              </div>
            </Field>
            <Field label="Preferred Contact Time">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {["Morning", "Afternoon", "Evening"].map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, contactTime: t }))} className="flex-1 text-xs font-bold py-2 rounded-lg transition-all"
                    style={{ background: form.contactTime === t ? "white" : "transparent", color: form.contactTime === t ? P : "#9CA3AF", boxShadow: form.contactTime === t ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>{t}</button>
                ))}
              </div>
            </Field>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-3 border-t border-gray-100">
            <Field label={`Quick check: ${captcha.a} + ${captcha.b} =`} className="w-full sm:w-40">
              <input value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} inputMode="numeric" className={inputCls} placeholder="Answer" />
            </Field>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Send Message"}
            </button>
          </div>
        </div>
      </section>

      <section>
        <Eyebrow>Process</Eyebrow>
        <h2 className="text-lg font-black text-gray-900 mb-4">What happens next</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { n: 1, t: "Your enquiry is received immediately." },
            { n: 2, t: "A support consultant reviews your request." },
            { n: 3, t: "You'll receive a response within 1–2 business days." },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white flex-shrink-0 text-xs" style={{ background: P }}>{s.n}</div>
              <p className="text-xs text-gray-600 pt-1">{s.t}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="text-lg font-black text-gray-900 mb-4">Frequently asked questions</h2>
        <FaqGrid />
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
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden text-white" style={{ background: `linear-gradient(135deg,${P_DARK},${P} 55%,#7B4DB5)` }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="absolute -right-16 -top-24 w-80 h-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(245,166,35,0.18), transparent 70%)" }} />
        <div className="max-w-5xl mx-auto px-5 pt-14 pb-20 relative grid lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: GOLD }}>Contact Centre</p>
            <h1 className="text-3xl sm:text-4xl font-black mb-3 leading-tight">We're here to help</h1>
            <p className="text-white/70 text-sm max-w-md mb-6">
              Banking assistance, branches, fraud reporting or feedback — one place for everything.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <QuickAction icon={<Phone className="w-4 h-4" />} label="Call Us" onClick={() => setTab("connect")} />
              <QuickAction icon={<MapPin className="w-4 h-4" />} label="Find a Branch" onClick={() => setTab("locate")} />
              <QuickAction icon={<Mail className="w-4 h-4" />} label="Send Feedback" onClick={() => setTab("feedback")} />
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/60 mb-3">Our global offices</p>
            <div className="space-y-2">
              {OFFICES.map((o, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-lg">{o.flag}</span>
                  <span className="text-sm font-semibold flex-1">{o.country}</span>
                  <span className="text-xs text-white/60">{o.city}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating tab switcher */}
      <div className="max-w-5xl mx-auto w-full px-5 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl shadow-lg shadow-black/10 border border-gray-100 p-1.5 flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all"
              style={{ background: tab === t.id ? P : "transparent", color: tab === t.id ? "#fff" : "#6B7280" }}>
              {t.icon}<span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-5 py-9">
        {tab === "connect"  && <ConnectTab goTo={setTab} />}
        {tab === "locate"   && <LocateTab />}
        {tab === "feedback" && <FeedbackTab />}

        {/* Persistent footer blocks */}
        <div className="mt-9 grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#EDE9FE", color: P }}><Building2 className="w-5 h-5" /></div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Head Office</p>
              <p className="font-black text-gray-900 text-sm">VMS Bank Limited</p>
              <p className="text-xs text-gray-500 mt-0.5">State House Building, 8 Rose Street, Cape Town, South Africa</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                <a href="mailto:info@vink.com" className="text-xs font-semibold no-underline" style={{ color: P }}>info@vink.com</a>
                <span className="text-xs text-gray-400">Mon–Fri 08:00–17:00</span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl p-5 text-white flex items-center justify-between gap-4" style={{ background: `linear-gradient(135deg,${P_DARK},${P})` }}>
            <div>
              <p className="font-black text-sm flex items-center gap-2 mb-1"><Smartphone className="w-4 h-4" style={{ color: GOLD }} /> Get the VMS App</p>
              <p className="text-xs text-white/70">Banking, payments & cards — all in one app.</p>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-bold bg-white/15 px-2.5 py-1 rounded-lg text-center">App Store</span>
              <span className="text-[10px] font-bold bg-white/15 px-2.5 py-1 rounded-lg text-center">Google Play</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
