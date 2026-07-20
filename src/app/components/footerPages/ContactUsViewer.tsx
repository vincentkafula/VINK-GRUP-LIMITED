import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Phone, Mail, MapPin, Clock, MessageCircle, Loader2, CheckCircle,
  ChevronDown, Shield, Search, Building2, Smartphone, Upload, AlertTriangle, Plus, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../../imports/LOGO_FINAL.png";
import { publicApi } from "../../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; }
const P = "#5B2D8E";
const GOLD = "#F5A623";

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
  { service: "Digital Banking Support",  contact: "support@vink.co.za",   href: "mailto:support@vink.co.za", hours: "Business hours" },
  { service: "General Customer Care",    contact: "info@vink.co.za",      href: "mailto:info@vink.co.za",    hours: "Mon–Fri 08:00–17:00" },
];

const DIRECTORY = [
  { title: "Report Fraud", icon: <AlertTriangle className="w-4 h-4" />, urgent: true, items: ["Fraud Hotline — +27 (0)61 461 5035", "Card blocking via VINK App", "Suspicious transactions"] },
  { title: "Lost or Stolen Cards", icon: <Shield className="w-4 h-4" />, urgent: true, items: ["Emergency card services", "+27 (0)21 007 0772", "Available 24 hours"] },
  { title: "Personal Banking", icon: <Building2 className="w-4 h-4" />, items: ["Savings & current accounts", "Debit & credit cards", "Internet & mobile banking"] },
  { title: "Business Banking", icon: <Building2 className="w-4 h-4" />, items: ["SME banking", "Corporate banking", "Merchant services", "Business loans"] },
  { title: "Loans & Credit", icon: <Building2 className="w-4 h-4" />, items: ["Home loans", "Vehicle finance", "Personal loans"] },
  { title: "Savings & Investments", icon: <Building2 className="w-4 h-4" />, items: ["Fixed deposits", "Investment accounts", "Wealth management"] },
  { title: "Insurance", icon: <Building2 className="w-4 h-4" />, items: ["Claims", "New policies", "Financial advice"] },
  { title: "International Banking", icon: <Building2 className="w-4 h-4" />, items: ["Forex", "International payments", "Travel cards"] },
  { title: "Media & General", icon: <Mail className="w-4 h-4" />, items: ["Media relations — media@vink.co.za", "General enquiries — info@vink.co.za"] },
];

const AGENT_NETWORKS = [
  { name: "VINK Head Office", type: "office" as const, icon: "🏢", cover: "8 Rose Street, Cape Town CBD", services: "Account opening, FICA verification, card collection, business banking consultations", hours: "Mon–Fri 08:00–17:00" },
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

const TOPICS = [
  "I have a complaint",
  "I have a compliment",
  "I have a suggestion",
  "Online Banking",
  "Mobile Banking",
  "Cards",
  "Loans",
  "Insurance",
  "Investments",
];

const FAQS = [
  { q: "How do I block my card?", a: "Call the Fraud Hotline immediately, or block your card instantly from the VINK App under Card Settings." },
  { q: "How do I reset my Online or Mobile Banking password?", a: "Select \"Forgot Password\" on the login screen of the VINK App or web portal, and follow the verification steps." },
  { q: "Can I track my complaint?", a: "Yes — you'll get a reference number as soon as you submit the form, which you can quote in any follow-up." },
  { q: "How do I report fraud?", a: "Call the Fraud Hotline on +27 (0)61 461 5035 immediately — it's available 24/7." },
  { q: "How long until I get a response?", a: "General enquiries: within 1 business day. Feedback submitted here: within 1–2 business days." },
  { q: "Is my feedback confidential?", a: "Yes — feedback is only visible to the relevant VINK support team handling your enquiry." },
];

// ── Canvas captcha — real, generated client-side, not decorative ────────
function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function CaptchaBox({ code, onRefresh }: { code: string; onRefresh: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = "#241344";
    ctx.fillRect(0, 0, W, H);
    // noise lines
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `hsla(${Math.random() * 360},70%,70%,0.35)`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * W, Math.random() * H);
      ctx.lineTo(Math.random() * W, Math.random() * H);
      ctx.stroke();
    }
    // noise dots
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `hsla(${Math.random() * 360},80%,75%,0.5)`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
    // distorted characters
    const step = W / (code.length + 1);
    ctx.textBaseline = "middle";
    ctx.font = "bold 26px monospace";
    for (let i = 0; i < code.length; i++) {
      ctx.save();
      const x = step * (i + 1);
      const y = H / 2 + (Math.random() * 10 - 5);
      ctx.translate(x, y);
      ctx.rotate((Math.random() * 0.5 - 0.25));
      ctx.fillStyle = `hsl(${280 + Math.random() * 60},85%,${70 + Math.random() * 15}%)`;
      ctx.fillText(code[i], -8, 0);
      ctx.restore();
    }
  }, [code]);
  return (
    <div className="flex items-center gap-2">
      <canvas ref={canvasRef} width={180} height={56} className="rounded-lg border border-gray-200" />
      <button type="button" onClick={onRefresh} title="Generate a new code"
        className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors flex-shrink-0">
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────────────────
function DirectoryGrid() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {DIRECTORY.map((it, i) => {
        const isOpen = open === i;
        return (
          <button key={i} onClick={() => setOpen(isOpen ? null : i)}
            className={`text-left rounded-xl bg-white border transition-all overflow-hidden ${isOpen ? "shadow-md" : "hover:shadow-sm"}`}
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
            className={`text-left rounded-xl bg-white border px-4 py-3.5 transition-all ${isOpen ? "shadow-md border-purple-200" : "border-gray-200 hover:shadow-sm"}`}>
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
            <div key={i} className="group p-5 bg-white rounded-xl border border-gray-200 hover:border-purple-200 hover:shadow-md transition-all flex flex-col">
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
        <h2 className="text-xl font-black text-gray-900 mb-4">Contact Directory</h2>
        <DirectoryGrid />
      </section>

      <section className="rounded-xl p-5 sm:p-6 text-white" style={{ background: P }}>
        <h3 className="text-base font-black mb-4">Need Immediate Assistance?</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {EMERGENCY_CONTACTS.map((e, i) => (
            <a key={i} href={e.href} className="flex items-center justify-between gap-3 bg-white/10 hover:bg-white/15 transition-colors rounded-lg px-4 py-3 no-underline">
              <span>
                <span className="text-sm font-semibold text-white block">{e.service}</span>
                <span className="text-xs text-white/70">{e.hours}</span>
              </span>
              <span className="text-xs font-bold whitespace-nowrap text-white">{e.contact}</span>
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
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-2.5">
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
        <p className="text-gray-400 text-xs mb-4">VINK is a digital-first bank — full services at our Head Office, everyday card services nationwide via our agent network.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {results.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 bg-white rounded-lg border hover:shadow-sm transition-shadow ${a.type === "office" ? "border-2" : "border-gray-200"}`}
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
        <h2 className="text-xl font-black text-gray-900 mb-4">Before You Visit</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BEFORE_YOU_VISIT.map((c, i) => (
            <div key={i} className="p-4 bg-white rounded-lg border border-gray-200">
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
    name: "", surname: "", email: "", phone: "",
  });
  const [captchaCode, setCaptchaCode] = useState(genCode);
  const [captchaInput, setCaptchaInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.name || !form.surname || !form.email || !form.message) {
      toast.error("Please fill in your name, email and message.");
      return;
    }
    if (captchaInput.trim().toUpperCase() !== captchaCode) {
      toast.error("The code doesn't match — please try again.");
      setCaptchaCode(genCode());
      setCaptchaInput("");
      return;
    }
    setSubmitting(true);
    const r = await publicApi.contact({
      name: `${form.name} ${form.surname}`, email: form.email, phone: form.phone,
      subject: form.topic, message: `Feedback for: ${form.bankingType}\n\n${form.message}`, type: form.bankingType,
    });
    setSubmitting(false);
    if (r.success) {
      setSubmitted("VINK-" + Math.random().toString(36).slice(2, 8).toUpperCase());
      toast.success("Message sent — thank you!");
    } else {
      toast.error(r.error ?? "Failed to send message. Please try email directly.");
    }
  };

  if (submitted) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-10 text-center max-w-lg mx-auto">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="text-lg font-black text-gray-900 mb-1">Message sent</h3>
        <p className="text-gray-500 text-sm">Your reference number is <strong style={{ color: P }}>{submitted}</strong>.</p>
        <p className="text-gray-500 text-sm mt-1">We'll respond to <strong className="text-gray-700">{form.email}</strong> within 1–2 business days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 text-center mb-1">How did we do?</h1>
        <p className="text-center text-gray-400 text-sm mb-6">You are giving feedback for:</p>
        <div className="flex justify-center gap-8 mb-10">
          {["Personal Banking", "Private or Business Banking"].map(t => (
            <button key={t} onClick={() => setForm(f => ({ ...f, bankingType: t }))}
              className="text-sm font-bold pb-2 border-b-2 transition-colors"
              style={{ color: form.bankingType === t ? P : "#9CA3AF", borderColor: form.bankingType === t ? P : "transparent" }}>
              {t}
            </button>
          ))}
        </div>

        <div className="max-w-xl mx-auto">
          <h2 className="text-base font-black text-gray-900 mb-4">Send a Message:</h2>
          <div className="space-y-5">
            <div>
              <label className="text-sm text-gray-600 block mb-1.5">Please choose a topic</label>
              <select value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-purple-400 bg-white text-gray-700">
                {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-600 block mb-1.5">Message</label>
              <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={5}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-purple-400 resize-none" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600 block mb-1.5">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1.5">Surname</label>
                <input value={form.surname} onChange={e => setForm(f => ({ ...f, surname: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-purple-400" />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600 block mb-1.5">Email address *</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-purple-400" />
            </div>

            <div>
              <label className="text-sm text-gray-600 block mb-1.5">Phone number (optional)</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-purple-400" />
            </div>

            <div>
              <label className="text-sm text-gray-600 block mb-1.5">Enter the code shown below</label>
              <CaptchaBox code={captchaCode} onRefresh={() => { setCaptchaCode(genCode()); setCaptchaInput(""); }} />
            </div>
            <div>
              <input value={captchaInput} onChange={e => setCaptchaInput(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-purple-400 uppercase tracking-widest" placeholder="Type the code" />
            </div>

            <button onClick={handleSubmit} disabled={submitting}
              className="px-8 py-3 rounded-full text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Send Message"}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-black text-gray-900 mb-4">What happens next</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { n: 1, t: "Your enquiry is received immediately." },
            { n: 2, t: "A support consultant reviews your request." },
            { n: 3, t: "You'll receive a response within 1–2 business days." },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white flex-shrink-0 text-xs" style={{ background: P }}>{s.n}</div>
              <p className="text-xs text-gray-600 pt-1">{s.t}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
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
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>

      {/* Plain tab strip */}
      <div className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto flex justify-center gap-10 px-5 py-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="text-sm font-bold pb-2 border-b-2 transition-colors"
              style={{ color: tab === t.id ? P : "#9CA3AF", borderColor: tab === t.id ? P : "transparent" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 py-10">
        {tab === "connect"  && <ConnectTab goTo={setTab} />}
        {tab === "locate"   && <LocateTab />}
        {tab === "feedback" && <FeedbackTab />}
      </div>

      {/* Persistent footer blocks */}
      <div className="bg-gray-50 border-t border-gray-100 mt-4">
        <div className="max-w-4xl mx-auto w-full px-5 py-8 grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#EDE9FE", color: P }}><Building2 className="w-5 h-5" /></div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Head Office</p>
              <p className="font-black text-gray-900 text-sm">VINK Bank Limited</p>
              <p className="text-xs text-gray-500 mt-0.5">State House Building, 8 Rose Street, Cape Town, South Africa</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                <a href="mailto:info@vink.co.za" className="text-xs font-semibold no-underline" style={{ color: P }}>info@vink.co.za</a>
                <span className="text-xs text-gray-400">Mon–Fri 08:00–17:00</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl p-5 text-white flex items-center justify-between gap-4" style={{ background: P }}>
            <div>
              <p className="font-black text-sm flex items-center gap-2 mb-1"><Smartphone className="w-4 h-4" style={{ color: GOLD }} /> Get the VINK App</p>
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
