import { useEffect, useMemo, useRef, useState } from "react";
import {
  Phone, Mail, MapPin, Clock, MessageCircle, Loader2, CheckCircle, ArrowRight, Headphones, Star, Heart, Lightbulb,
  Shield, Search, Building2, Smartphone, AlertTriangle, RefreshCw, Store,
} from "lucide-react";
import { toast } from "sonner";
import { publicApi } from "../../services/apiClient";
import { Footer } from "../Footer";
import { Accordion, type AccItem } from "./Accordion";
import { WhatsAppCard, useWhatsAppInfo } from "../WhatsAppChat";
import { DEPARTMENTS, type Department } from "../../data/departments";
import { API_BASE } from "../../services/config";
import { BRAND } from "../../brand";
import "./contact.css";

interface Props { isOpen: boolean; onClose: () => void; initialTab?: TabId; }
const P = BRAND.crimson;

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
  { title: "Sales", icon: <Mail className="w-4 h-4" />, items: ["Sales enquiries — sales@vink.co.za", "Products and services for individuals, owners and businesses"] },
  { title: "Media & General", icon: <Mail className="w-4 h-4" />, items: ["Media relations — media@vink.co.za", "General enquiries — info@vink.co.za"] },
];

const AGENT_NETWORKS = [
  { name: "VINK Head Office", type: "office" as const, icon: "🏢", cover: "8 Rose Street, Cape Town CBD", services: "Account opening, FICA verification, card collection, business banking consultations", hours: "Mon–Fri 08:00–17:00" },
  { name: "Retail and spaza-shop agents (planned)", type: "agent" as const, icon: "🏪", cover: "Western Cape first; locations announced before launch", services: "Card recharge and cash services, once we are live", hours: "To be announced" },
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
    ctx.fillStyle = "#F7F7F8";
    ctx.fillRect(0, 0, W, H);
    // noise lines
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `hsla(${Math.random() * 360},45%,45%,0.35)`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * W, Math.random() * H);
      ctx.lineTo(Math.random() * W, Math.random() * H);
      ctx.stroke();
    }
    // noise dots
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `hsla(${Math.random() * 360},45%,45%,0.5)`;
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
      ctx.fillStyle = `hsl(${345 + Math.random() * 20},75%,${32 + Math.random() * 10}%)`;
      ctx.fillText(code[i], -8, 0);
      ctx.restore();
    }
  }, [code]);
  return (
    <div className="flex items-center gap-2">
      <canvas ref={canvasRef} width={180} height={56} className="rounded-lg border border-line" />
      <button type="button" onClick={onRefresh} title="Generate a new code"
        className="w-9 h-9 rounded-lg border border-line flex items-center justify-center text-fg-muted hover:text-fg hover:border-line-strong transition-colors flex-shrink-0">
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────────────────
const CARE_PHONE = { label: "+27 (0)21 009 5100", href: "tel:+27210095100" };
const CARE_HOURS = "Mon–Fri 08:00–17:00";
const HEAD_OFFICE_ADDRESS = "State House Building, 8 Rose Street, Cape Town, South Africa";
const mapSrc = (q: string) => `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
const directionsHref = (q: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function FaqGrid() {
  return <Accordion items={FAQS.map((f, i) => ({ id: `faq-${i}`, title: f.q, intro: f.a }))} label="Frequently asked questions" />;
}

/** The departments the Contact page offers: the built-in ones at once, then the list the server has (it includes the public departments a Super Administrator has made). */
function useDepartments(): Department[] {
  const [departments, setDepartments] = useState<Department[]>(DEPARTMENTS);
  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/api/contact/departments`).then((r) => (r.ok ? r.json() : null)).then((b: { departments?: Department[] } | null) => { if (live && b?.departments?.length) setDepartments(b.departments); }).catch(() => { /* the built-in list stays */ });
    return () => { live = false; };
  }, []);
  return departments;
}

// ── Tab: Connect With Us ────────────────────────────────────────────────
function ConnectTab({ goTo, departments }: { goTo: (t: TabId) => void; departments: Department[] }) {
  const wa = useWhatsAppInfo();
  const ic = (I: typeof Phone) => <I className="vc-icon" aria-hidden="true" />;
  const services: AccItem[] = [
    { id: "cards", title: "Lost and stolen cards", tag: "24/7", intro: "Call straight away to block your card and stop anyone else using it. You can also block it in the VINK app under Card Settings.",
      rows: [{ icon: ic(Phone), label: "Emergency card services (24/7)", value: "+27 (0)21 007 0772", href: "tel:+27210070772" }] },
    { id: "fraud", title: "Report fraud", tag: "24/7", intro: "Think someone has accessed your account or you have been scammed? Contact the fraud team immediately. VINK will never ask for your PIN, password or OTP.",
      rows: [{ icon: ic(AlertTriangle), label: "Fraud hotline (24/7)", value: "+27 (0)61 461 5035", href: "tel:+27614615035" }] },
    { id: "digital", title: "Digital banking support", intro: "Help with the VINK app and online banking.",
      rows: [{ icon: ic(Mail), label: "Email", value: "support@vink.co.za", href: "mailto:support@vink.co.za" }, { icon: ic(Clock), label: "Hours", value: "Business hours" }] },
    { id: "care", title: "General customer care", intro: "Questions about accounts, cards or anything else.",
      rows: [{ icon: ic(Phone), label: "Call us", value: CARE_PHONE.label, href: CARE_PHONE.href }, { icon: ic(Mail), label: "Email", value: "info@vink.co.za", href: "mailto:info@vink.co.za" }, { icon: ic(Clock), label: "Hours", value: CARE_HOURS }] },
    { id: "message", title: "Send us a message", intro: "Use the form and we will get back to you as soon as possible. You get a reference number straight away.", link: { label: "Send us your feedback online", onClick: () => goTo("feedback") } },
  ];
  const mailboxes: AccItem[] = departments.map((d) => ({ id: `dept-${d.key}`, title: d.name, intro: d.purpose,
    rows: [{ icon: ic(Mail), label: "Email", value: d.address, href: `mailto:${d.address}` }, { icon: ic(Clock), label: "We reply within", value: d.respondWithin }] }));
  const areas: AccItem[] = DIRECTORY.filter((d) => !d.urgent).map((d) => ({ id: `area-${slug(d.title)}`, title: d.title, bullets: d.items }));

  return (
    <div className="vc-panel" id="panel-connect-body">
      <div className="vc-acc-wrap">
        <p className="vc-section-eyebrow">Contact details</p>
        <h2 className="vc-section-title">Get in touch with us</h2>
        <p className="vc-section-lead">Choose the service you need and open it to see how to reach the right team.</p>
        <Accordion items={services} label="Contact us by service" />

        <h2 className="vc-section-title vc-acc__group-title">Write to a department</h2>
        <p className="vc-section-lead">Each department has its own mailbox. Your message goes straight to the people who can answer it.</p>
        <Accordion items={mailboxes} label="Departments" />

        <h2 className="vc-section-title vc-acc__group-title">Contact us by banking area</h2>
        <Accordion items={areas} label="Banking areas" />
      </div>

      <aside className="vc-assist" aria-label="Immediate assistance">
        <div>
          <span className="vc-assist__badge" aria-hidden="true"><Headphones className="vc-icon" /></span>
          <span>
            <h3>Need immediate assistance?</h3>
            <p>Speak to one of our support agents for help with your account, transactions or any other banking needs.</p>
          </span>
        </div>
        <div>
          <span className="vc-assist__badge vc-assist__badge--sm" aria-hidden="true"><Phone className="vc-icon" /></span>
          <span>
            <h3>Call our support team</h3>
            <a className="vc-phone" href={CARE_PHONE.href}>{CARE_PHONE.label}</a>
            <span className="vc-avail">{CARE_HOURS}. Lost cards and fraud: 24/7</span>
          </span>
        </div>
        <div>
          {wa?.enabled && wa.link
            ? <a className="vc-btn vc-btn--outline" href={wa.link} target="_blank" rel="noopener noreferrer"><MessageCircle className="vc-icon" aria-hidden="true" />Chat with us</a>
            : <button className="vc-btn vc-btn--outline" type="button" onClick={() => goTo("feedback")}><MessageCircle className="vc-icon" aria-hidden="true" />Message us</button>}
        </div>
      </aside>
    </div>
  );
}

// ── Tab: Locate Us ───────────────────────────────────────────────────────
function LocateTab() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "office" | "agent">("all");
  const [selected, setSelected] = useState(0);
  const results = useMemo(() => AGENT_NETWORKS.filter(a =>
    (filter === "all" || a.type === filter) &&
    (query.trim() === "" || a.name.toLowerCase().includes(query.toLowerCase()) || a.cover.toLowerCase().includes(query.toLowerCase()))
  ), [query, filter]);
  const current = results[Math.min(selected, Math.max(results.length - 1, 0))];
  const hasMap = current?.type === "office";

  return (
    <div className="vc-panel">
      <p className="vc-section-eyebrow">Find us</p>
      <h2 className="vc-section-title">Locate a branch or agent</h2>
      <p className="vc-section-lead">VINK is a digital-first bank: full services at our Head Office, and everyday card services nationwide through our agent network.</p>

      <div className="vc-locator">
        <div>
          <div className="vc-search">
            <Search className="vc-icon" aria-hidden="true" />
            <label className="sr-only" htmlFor="loc-search">Search locations</label>
            <input className="vc-input" id="loc-search" type="search" value={query} onChange={e => { setQuery(e.target.value); setSelected(0); }} placeholder="Search by city, suburb or name" autoComplete="off" />
          </div>
          <div className="vc-chips" role="group" aria-label="Filter by type">
            {[["all", "All"], ["office", "Head Office"], ["agent", "Agents"]].map(([id, label]) => (
              <button key={id} className="vc-chip" type="button" aria-pressed={filter === id} onClick={() => { setFilter(id as typeof filter); setSelected(0); }}>{label}</button>))}
          </div>
          <ul className="vc-loc-list" aria-live="polite">
            {results.map((a, i) => (
              <li key={a.name}>
                <button type="button" className="vc-loc" aria-current={current === a} onClick={() => setSelected(i)}>
                  <span className="vc-loc__icon" aria-hidden="true">{a.type === "office" ? <Building2 className="vc-icon" /> : <Store className="vc-icon" />}</span>
                  <span>
                    <h3>{a.name}</h3>
                    <p>{a.cover}</p>
                    <p>{a.services}</p>
                    <span className="vc-meta"><Clock className="vc-icon" aria-hidden="true" style={{ width: 13, height: 13 }} />{a.hours}</span>
                  </span>
                </button>
              </li>))}
            {results.length === 0 && <li className="vc-loc-empty">No locations match your search.</li>}
          </ul>
        </div>

        <div className="vc-map">
          {hasMap ? (<>
            <iframe key={HEAD_OFFICE_ADDRESS} title="Map of the VINK Head Office" src={mapSrc(HEAD_OFFICE_ADDRESS)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            <div className="vc-map__bar">
              <div><strong>VINK Head Office</strong><span>{HEAD_OFFICE_ADDRESS}</span></div>
              <a className="vc-btn vc-btn--primary vc-btn--sm" href={directionsHref(HEAD_OFFICE_ADDRESS)} target="_blank" rel="noopener noreferrer">Get directions <ArrowRight className="vc-icon" aria-hidden="true" /></a>
            </div>
          </>) : (
            <div className="vc-map__empty">
              <MapPin className="vc-icon" aria-hidden="true" style={{ width: 32, height: 32, color: "var(--vk-crimson-text)" }} />
              <strong>Agent locations are announced before launch</strong>
              <span style={{ fontSize: 13, color: "var(--vk-fg-muted)", maxWidth: 320 }}>We start in the Western Cape. Choose the Head Office to see it on the map.</span>
            </div>)}
        </div>
      </div>

      <p className="vc-section-eyebrow">Before you visit</p>
      <h2 className="vc-section-title">What to bring</h2>
      <div className="vc-bring" style={{ marginTop: 18 }}>
        {BEFORE_YOU_VISIT.map((c) => (
          <div key={c.title}>
            <h3>{c.title}</h3>
            <ul>{c.items.map((it) => <li key={it}><CheckCircle className="vc-icon" aria-hidden="true" />{it}</li>)}</ul>
          </div>))}
      </div>
    </div>
  );
}

// ── Tab: Send Us Your Feedback ──────────────────────────────────────────
const FEEDBACK_KINDS = [
  { id: "Compliment", icon: <Heart className="vc-icon" aria-hidden="true" />, hint: "Something went well" },
  { id: "Suggestion", icon: <Lightbulb className="vc-icon" aria-hidden="true" />, hint: "An idea to improve" },
  { id: "Complaint", icon: <AlertTriangle className="vc-icon" aria-hidden="true" />, hint: "Something went wrong" },
] as const;
const CHANNELS = ["Branch or agent", "VINK app", "Online banking", "Call centre", "Card or terminal", "Other"];
const SUBJECTS = TOPICS.slice(3);        // the product areas; the type of feedback is chosen separately

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="vc-rating" role="radiogroup" aria-label="Overall experience">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} className={n <= value ? "on" : ""} onClick={() => onChange(value === n ? 0 : n)}>
          <Star className="vc-icon" aria-hidden="true" />
        </button>))}
    </div>
  );
}

function FeedbackTab({ departments }: { departments: Department[] }) {
  const [form, setForm] = useState({
    department: "support", bankingType: "Personal Banking", kind: "Compliment" as (typeof FEEDBACK_KINDS)[number]["id"], topic: SUBJECTS[0], channel: "", rating: 0, message: "", website: "",
    name: "", surname: "", email: "", phone: "",
  });
  const deptByKey = (key: string) => departments.find((d) => d.key === key);
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
    const dept = deptByKey(form.department);
    const details = [`Type: ${form.kind}`, `About: ${form.topic}`, `Feedback for: ${form.bankingType}`, form.channel ? `Where: ${form.channel}` : "", form.rating ? `Rating: ${form.rating} out of 5` : ""].filter(Boolean).join("\n");
    const r = await publicApi.contact({
      department: form.department, name: `${form.name} ${form.surname}`.trim(), email: form.email, phone: form.phone || undefined,
      subject: `${form.kind}: ${form.topic}`, message: `${details}\n\n${form.message}`, website: form.website,
    });
    setSubmitting(false);
    if (r.success && r.data) {
      setSubmitted(r.data.ref);
      toast.success("Message sent — thank you!");
    } else {
      toast.error(r.error ?? `We could not send your message. Please email ${dept?.address ?? "info@vink.co.za"} directly.`);
    }
  };

  if (submitted) {
    return (
      <div className="vc-panel">
        <div className="vc-card vc-done">
          <CheckCircle className="vc-icon" aria-hidden="true" style={{ width: 48, height: 48, color: "var(--vk-ok)" }} />
          <h2 className="vc-card__title" style={{ marginTop: 12 }}>Message sent</h2>
          <p className="vc-card__lead" style={{ marginBottom: 6 }}>Your reference number is <strong style={{ color: "var(--vk-crimson-text)" }}>{submitted}</strong>.</p>
          <p className="vc-card__lead" style={{ margin: 0 }}>We sent a receipt to <strong style={{ color: "var(--vc-ink-text, var(--vk-fg))" }}>{form.email}</strong>. {deptByKey(form.department)?.name ?? "VINK"} will reply within {deptByKey(form.department)?.respondWithin ?? "1–2 business days"}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vc-panel">
      <div className="vc-panel-grid">
        <div className="vc-side-card">
          <div>
            <p className="vc-section-eyebrow">Your voice matters</p>
            <h2 className="vc-section-title">Send us your feedback</h2>
            <p className="vc-section-lead" style={{ marginBottom: 0 }}>Tell us what we are doing well and where we can do better. Every message is read by a real person.</p>
          </div>
          <div className="vc-tip">
            <span className="vc-tip__icon" aria-hidden="true"><AlertTriangle className="vc-icon" /></span>
            <div><h3>Need urgent help?</h3><p>For lost or stolen cards call <a href="tel:+27210070772">+27 (0)21 007 0772</a>, available 24/7. To report fraud call <a href="tel:+27614615035">+27 (0)61 461 5035</a>.</p></div>
          </div>
          <div className="vc-tip">
            <span className="vc-tip__icon" aria-hidden="true"><CheckCircle className="vc-icon" /></span>
            <div><h3>What happens next?</h3><ol><li>Your enquiry is received at once and you get a reference number.</li><li>A support consultant reviews your request.</li><li>You receive a response within 1–2 business days.</li></ol></div>
          </div>
        </div>

        <form className="vc-card" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} noValidate>
          <h2 className="vc-card__title">Share your experience</h2>
          <p className="vc-card__lead">It only takes a minute.</p>
          <div className="vc-form-grid">
            <fieldset className="vc-field vc-field--full vc-fb-types">
              <legend>Type of feedback <span className="vc-req" aria-hidden="true">*</span></legend>
              {FEEDBACK_KINDS.map((k) => (
                <label key={k.id} className="vc-fb-type">
                  <input type="radio" name="kind" value={k.id} checked={form.kind === k.id} onChange={() => setForm(f => ({ ...f, kind: k.id }))} />
                  <span>{k.icon}{k.id}<small>{k.hint}</small></span>
                </label>))}
            </fieldset>

            <div className="vc-field vc-field--full"><span id="rating-label" style={{ fontSize: 13, fontWeight: 500 }}>Overall experience</span><StarRating value={form.rating} onChange={(n) => setForm(f => ({ ...f, rating: n }))} /></div>

            <div className="vc-field vc-field--full">
              <label htmlFor="contact-for">You are giving feedback for</label>
              <select className="vc-select" id="contact-for" value={form.bankingType} onChange={e => setForm(f => ({ ...f, bankingType: e.target.value }))}>
                {["Personal Banking", "Private or Business Banking"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="vc-field vc-field--full">
              <label htmlFor="contact-department">Who is your message for?</label>
              <select className="vc-select" id="contact-department" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                {departments.map(d => <option key={d.key} value={d.key}>{d.name} — {d.purpose}</option>)}
              </select>
              <span className="vc-form-note">Goes to <a href={`mailto:${deptByKey(form.department)?.address}`} style={{ color: "var(--vk-crimson-text)", fontWeight: 600 }}>{deptByKey(form.department)?.address}</a>. You can also write to that address yourself.</span>
            </div>

            <div className="vc-field">
              <label htmlFor="contact-topic">What is it about?</label>
              <select className="vc-select" id="contact-topic" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}>{SUBJECTS.map(t => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            <div className="vc-field">
              <label htmlFor="contact-channel">Where did this happen?</label>
              <select className="vc-select" id="contact-channel" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}><option value="">Select an option</option>{CHANNELS.map(t => <option key={t} value={t}>{t}</option>)}</select>
            </div>

            <div className="vc-field vc-field--full">
              <label htmlFor="contact-message">Your message <span className="vc-req" aria-hidden="true">*</span></label>
              <textarea className="vc-textarea" id="contact-message" rows={5} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Tell us what happened…" />
              <span className="vc-form-note">Please don't include card numbers or passwords.</span>
            </div>

            <div className="vc-field"><label htmlFor="contact-name">Name <span className="vc-req" aria-hidden="true">*</span></label><input className="vc-input" id="contact-name" autoComplete="given-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Enter your name" /></div>
            <div className="vc-field"><label htmlFor="contact-surname">Surname <span className="vc-req" aria-hidden="true">*</span></label><input className="vc-input" id="contact-surname" autoComplete="family-name" value={form.surname} onChange={e => setForm(f => ({ ...f, surname: e.target.value }))} placeholder="Enter your surname" /></div>
            <div className="vc-field"><label htmlFor="contact-email">Email address <span className="vc-req" aria-hidden="true">*</span></label><input className="vc-input" id="contact-email" type="email" autoComplete="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Enter your email address" /></div>
            <div className="vc-field"><label htmlFor="contact-phone">Phone number (optional)</label><input className="vc-input" id="contact-phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Enter your phone number" /></div>

            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} /></label>
            </div>

            <div className="vc-field vc-field--full">
              <label htmlFor="contact-captcha">Enter the code shown below</label>
              <CaptchaBox code={captchaCode} onRefresh={() => { setCaptchaCode(genCode()); setCaptchaInput(""); }} />
              <input className="vc-input" id="contact-captcha" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} style={{ textTransform: "uppercase", letterSpacing: ".18em" }} placeholder="Type the code" autoComplete="off" />
            </div>
          </div>
          <div className="vc-form-foot">
            <button className="vc-btn vc-btn--primary" type="submit" disabled={submitting}>
              {submitting ? <><Loader2 className="vc-icon animate-spin" aria-hidden="true" /> Sending…</> : <>Send message <ArrowRight className="vc-icon" aria-hidden="true" /></>}
            </button>
            <p className="vc-form-note">Never share your PIN, password or OTP with us.</p>
          </div>
        </form>
      </div>

      <h2 className="vc-section-title vc-faq-title">Frequently asked questions</h2>
      <div className="vc-acc-wrap" style={{ marginInline: 0, maxWidth: "none" }}><FaqGrid /></div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────
export function ContactUsViewer({ isOpen, onClose, initialTab }: Props) {
  const [tab, setTab] = useState<TabId>(initialTab ?? "connect");
  const departments = useDepartments();
  useEffect(() => { if (isOpen && initialTab) setTab(initialTab); }, [isOpen, initialTab]);
  if (!isOpen) return null;

  const go = (t: TabId) => { setTab(t); document.getElementById("contact-tabs")?.scrollIntoView?.({ behavior: "smooth", block: "start" }); };
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next); document.getElementById(`tab-${next}`)?.focus();
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div data-theme-aware className="vc fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg">
      {/* Hero: the brand red, copy on the left, the three things most people come for */}
      <section className="vc-hero" aria-labelledby="contact-hero-title">
        <div className="vc-container vc-hero__inner">
          <div className="vc-hero__copy">
            <p className="vc-eyebrow">Contact us</p>
            <h1 id="contact-hero-title">Get the contact information you need</h1>
            <p>We're here to help. Whether you have a question, need support or want to give feedback, our team is ready to assist you.</p>
            <div className="vc-hero__links">
              <a href={CARE_PHONE.href}><Phone className="vc-icon" aria-hidden="true" />Call us</a>
              <button type="button" onClick={() => go("locate")}><MapPin className="vc-icon" aria-hidden="true" />Locate us</button>
              <button type="button" onClick={() => go("feedback")}><MessageCircle className="vc-icon" aria-hidden="true" />Send us your feedback</button>
            </div>
          </div>
          <div className="vc-hero__media" aria-hidden="true" />
        </div>
      </section>

      {/* Tabs: they stay at the top while the page scrolls */}
      <div className="vc-tabs-bar" id="contact-tabs">
        <div className="vc-container">
          <div className="vc-tabs" role="tablist" aria-label="Contact options">
            {TABS.map((t, i) => (
              <button key={t.id} className="vc-tab" id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>))}
          </div>
        </div>
      </div>

      <div className="vc-container">
        <nav className="vc-crumbs" aria-label="Breadcrumb">
          <button type="button" onClick={onClose}>Home</button>
          <span aria-hidden="true">/</span><span aria-current="page">Contact VINK Support{tab !== "connect" ? ` · ${current.label}` : ""}</span>
        </nav>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "connect"  && <ConnectTab goTo={go} departments={departments} />}
          {tab === "locate"   && <LocateTab />}
          {tab === "feedback" && <FeedbackTab departments={departments} />}
        </div>
      </div>

      {/* Head office, and the app */}
      <div className="vc-after">
        <div className="vc-container vc-after__grid">
          <div className="vc-after__card">
            <span className="vc-after__icon" aria-hidden="true"><Building2 className="vc-icon" /></span>
            <div>
              <h3>VINK Finance Limited</h3>
              <p>Head Office · {HEAD_OFFICE_ADDRESS}</p>
              <p><a href="mailto:info@vink.co.za" style={{ color: "var(--vk-crimson-text)", fontWeight: 600 }}>info@vink.co.za</a> · {CARE_HOURS}</p>
            </div>
          </div>
          <div className="vc-after__card">
            <span className="vc-after__icon" aria-hidden="true"><Smartphone className="vc-icon" /></span>
            <div><h3>Get the VINK App</h3><p>Banking, payments and cards, all in one app. Coming soon.</p></div>
            <div className="vc-after__badges"><span>App Store</span><span>Google Play</span></div>
          </div>
        </div>
      </div>

      <WhatsAppCard />
      <Footer />
    </div>
  );
}
