import { useEffect, useMemo, useRef, useState } from "react";
import {
  Phone, Mail, MapPin, Clock, MessageCircle, Loader2, CheckCircle, ArrowRight, Headphones, Star, Heart, Lightbulb,
  ChevronDown, Shield, Search, Building2, Smartphone, AlertTriangle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { publicApi } from "../../services/apiClient";
import { Footer } from "../Footer";
import { WhatsAppCard, useWhatsAppInfo } from "../WhatsAppChat";
import { DEPARTMENTS, type Department } from "../../data/departments";
import { API_BASE } from "../../services/config";
import { BRAND } from "../../brand";

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

interface Row { icon: React.ReactNode; label: string; value: string; href?: string }
interface AccItem { id: string; title: string; intro?: string; rows?: Row[]; bullets?: string[]; body?: React.ReactNode; urgent?: boolean }

/** One list of expandable items, each opened and closed on its own; the open ones are announced to screen readers through aria-expanded. */
function Accordion({ items, label }: { items: AccItem[]; label: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div role="list" aria-label={label} className="overflow-hidden rounded-2xl border border-line bg-surface">
      {items.map((it, i) => {
        const isOpen = open.has(it.id);
        return (
          <div key={it.id} role="listitem" className={i > 0 ? "border-t border-line" : ""}>
            <h3>
              <button type="button" id={`acc-btn-${it.id}`} aria-expanded={isOpen} aria-controls={`acc-panel-${it.id}`} onClick={() => toggle(it.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px]" style={{ outlineColor: P }}>
                <span className="flex items-center gap-3 text-[15px] font-semibold text-fg">
                  {it.title}
                  {it.urgent && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--vk-brand-soft)", color: "var(--vk-crimson-text)" }}>24/7</span>}
                </span>
                <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </button>
            </h3>
            <div id={`acc-panel-${it.id}`} role="region" aria-labelledby={`acc-btn-${it.id}`} hidden={!isOpen} className="px-5 pb-5">
              {it.intro && <p className="mb-3 max-w-2xl text-sm leading-relaxed text-fg-muted">{it.intro}</p>}
              {it.rows && (
                <ul className="space-y-2">
                  {it.rows.map((r) => (
                    <li key={r.label + r.value} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--vk-brand-soft)", color: "var(--vk-crimson-text)" }}>{r.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-xs text-fg-muted">{r.label}</span>
                        {r.href ? <a href={r.href} className="break-words text-sm font-semibold no-underline hover:underline" style={{ color: "var(--vk-crimson-text)" }}>{r.value}</a> : <span className="text-sm font-semibold text-fg">{r.value}</span>}
                      </span>
                    </li>))}
                </ul>)}
              {it.bullets && <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted marker:text-fg-subtle">{it.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
              {it.body}
            </div>
          </div>);
      })}
    </div>
  );
}

function FaqGrid() {
  const items: AccItem[] = FAQS.map((f, i) => ({ id: `faq-${i}`, title: f.q, intro: f.a }));
  return <Accordion items={items} label="Frequently asked questions" />;
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

function SectionHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--vk-crimson-text)" }}>{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold text-fg">{title}</h2>
      {lead && <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">{lead}</p>}
    </div>
  );
}

// ── Tab: Connect With Us ────────────────────────────────────────────────
function ConnectTab({ goTo, departments }: { goTo: (t: TabId) => void; departments: Department[] }) {
  const wa = useWhatsAppInfo();
  const services: AccItem[] = [
    { id: "cards", title: "Lost or stolen cards", urgent: true, intro: "Call straight away to block your card and stop anyone else using it. You can also block it in the VINK app under Card Settings.",
      rows: [{ icon: <Phone className="h-4 w-4" />, label: "Emergency card services (24/7)", value: "+27 (0)21 007 0772", href: "tel:+27210070772" }] },
    { id: "fraud", title: "Report fraud", urgent: true, intro: "Think someone has accessed your account or you have been scammed? Contact the fraud team immediately. VINK will never ask for your PIN, password or OTP.",
      rows: [{ icon: <AlertTriangle className="h-4 w-4" />, label: "Fraud hotline (24/7)", value: "+27 (0)61 461 5035", href: "tel:+27614615035" }] },
    { id: "digital", title: "Digital banking support", intro: "Help with the VINK app and online banking.",
      rows: [{ icon: <Mail className="h-4 w-4" />, label: "Email", value: "support@vink.co.za", href: "mailto:support@vink.co.za" }, { icon: <Clock className="h-4 w-4" />, label: "Hours", value: "Business hours" }] },
    { id: "care", title: "General customer care", intro: "Questions about accounts, cards or anything else.",
      rows: [{ icon: <Phone className="h-4 w-4" />, label: "Call us", value: CARE_PHONE.label, href: CARE_PHONE.href }, { icon: <Mail className="h-4 w-4" />, label: "Email", value: "info@vink.co.za", href: "mailto:info@vink.co.za" }, { icon: <Clock className="h-4 w-4" />, label: "Hours", value: CARE_HOURS }] },
    { id: "message", title: "Send us a message", intro: "Use the form and we will get back to you as soon as possible. You will get a reference number straight away.",
      body: <button type="button" onClick={() => goTo("feedback")} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white" style={{ background: P }}>Open the message form <ArrowRight className="h-4 w-4" aria-hidden="true" /></button> },
  ];
  const areas: AccItem[] = DIRECTORY.filter((d) => !d.urgent).map((d) => ({ id: `area-${d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, title: d.title, bullets: d.items }));
  const mailboxes: AccItem[] = departments.map((d) => ({ id: `dept-${d.key}`, title: d.name, intro: d.purpose,
    rows: [{ icon: <Mail className="h-4 w-4" />, label: "Email", value: d.address, href: `mailto:${d.address}` }, { icon: <Clock className="h-4 w-4" />, label: "We reply within", value: d.respondWithin }] }));

  return (
    <div className="space-y-12">
      <section aria-labelledby="by-service">
        <SectionHead eyebrow="Contact details" title="Get in touch with us" lead="Choose the service you need and open it to see how to reach the right team." />
        <span id="by-service" className="sr-only">Contact us by service</span>
        <Accordion items={services} label="Contact us by service" />
      </section>

      <section aria-labelledby="by-dept">
        <SectionHead eyebrow="Departments" title="Write to a department" lead="Each department has its own mailbox. Your message goes straight to the people who can answer it." />
        <span id="by-dept" className="sr-only">Write to a department</span>
        <Accordion items={mailboxes} label="Departments" />
      </section>

      <section aria-labelledby="by-area">
        <SectionHead eyebrow="Banking areas" title="Contact us by banking area" />
        <span id="by-area" className="sr-only">Contact us by banking area</span>
        <Accordion items={areas} label="Banking areas" />
      </section>

      <aside aria-label="Immediate assistance" className="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: P }}><Headphones className="h-6 w-6" /></span>
          <div>
            <h3 className="text-base font-bold text-fg">Need immediate assistance?</h3>
            <p className="mt-1 text-sm text-fg-muted">Speak to one of our support agents about your account, cards or payments.</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Call our support team</p>
          <a href={CARE_PHONE.href} className="mt-0.5 block text-xl font-bold no-underline" style={{ color: "var(--vk-crimson-text)" }}>{CARE_PHONE.label}</a>
          <p className="text-xs text-fg-muted">{CARE_HOURS}. Lost cards and fraud: 24/7.</p>
        </div>
        {wa?.enabled && wa.link
          ? <a href={wa.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg no-underline hover:bg-surface-2"><MessageCircle className="h-4 w-4" aria-hidden="true" />Chat with us</a>
          : <button type="button" onClick={() => goTo("feedback")} className="inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-fg hover:bg-surface-2"><MessageCircle className="h-4 w-4" aria-hidden="true" />Message us</button>}
        <ul className="grid gap-2 sm:grid-cols-2 lg:col-span-3">
          {EMERGENCY_CONTACTS.map((e) => (
            <li key={e.service}>
              <a href={e.href} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 no-underline transition-colors hover:bg-brand-soft">
                <span><span className="block text-sm font-semibold text-fg">{e.service}</span><span className="text-xs text-fg-muted">{e.hours}</span></span>
                <span className="text-xs font-bold" style={{ color: "var(--vk-crimson-text)" }}>{e.contact}</span>
              </a>
            </li>))}
        </ul>
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
    <div className="space-y-12">
      <section>
        <SectionHead eyebrow="Find us" title="Locate a branch or agent" lead="VINK is a digital-first bank: full services at our Head Office, and everyday card services nationwide through our agent network." />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 focus-within:border-[color:var(--vk-brand)]">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
              <label className="sr-only" htmlFor="loc-search">Search locations</label>
              <input id="loc-search" type="search" value={query} onChange={e => { setQuery(e.target.value); setSelected(0); }} className="flex-1 bg-transparent text-sm text-fg outline-none" placeholder="Search by city, suburb or name" autoComplete="off" />
            </div>
            <div role="group" aria-label="Filter by type" className="mt-3 flex flex-wrap gap-2">
              {[["all", "All"], ["office", "Head Office"], ["agent", "Agents"]].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id as typeof filter); setSelected(0); }}
                  className="rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors"
                  style={filter === id ? { background: P, borderColor: P, color: "#fff" } : { background: "var(--vk-surface)", borderColor: "var(--vk-line)", color: "var(--vk-fg-muted)" }}>{label}</button>
              ))}
            </div>
            <ul aria-live="polite" className="mt-4 space-y-3">
              {results.map((a, i) => (
                <li key={a.name}>
                  <button type="button" onClick={() => setSelected(i)} aria-current={current === a}
                    className="flex w-full items-start gap-3 rounded-2xl border bg-surface p-4 text-left transition-shadow hover:shadow-sm"
                    style={{ borderColor: current === a ? P : "var(--vk-line)" }}>
                    <span aria-hidden="true" className="text-2xl">{a.icon}</span>
                    <span>
                      <span className="block text-sm font-bold text-fg">{a.name}</span>
                      <span className="mt-0.5 block text-xs text-fg-muted">{a.cover}</span>
                      <span className="mt-1 block text-xs text-fg-muted">{a.services}</span>
                      <span className="mt-1.5 flex items-center gap-1 text-[11px] text-fg-muted"><Clock aria-hidden="true" className="h-3 w-3" />{a.hours}</span>
                    </span>
                  </button>
                </li>))}
              {results.length === 0 && <li className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-fg-muted">No locations match your search.</li>}
            </ul>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {hasMap ? (<>
              <iframe key={HEAD_OFFICE_ADDRESS} title="Map of the VINK Head Office" src={mapSrc(HEAD_OFFICE_ADDRESS)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-[320px] w-full border-0 lg:h-[380px]" />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
                <div className="min-w-0"><p className="text-sm font-bold text-fg">VINK Head Office</p><p className="text-xs text-fg-muted">{HEAD_OFFICE_ADDRESS}</p></div>
                <a href={directionsHref(HEAD_OFFICE_ADDRESS)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white no-underline" style={{ background: P }}>Get directions <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
              </div>
            </>) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-8 text-center">
                <MapPin aria-hidden="true" className="h-8 w-8" style={{ color: "var(--vk-crimson-text)" }} />
                <p className="text-sm font-bold text-fg">Agent locations are announced before launch</p>
                <p className="max-w-sm text-xs text-fg-muted">We start in the Western Cape. Choose the Head Office to see it on the map.</p>
              </div>)}
          </div>
        </div>
      </section>

      <section>
        <SectionHead eyebrow="Before you visit" title="What to bring" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BEFORE_YOU_VISIT.map((c) => (
            <div key={c.title} className="rounded-2xl border border-line bg-surface p-4">
              <p className="mb-2 text-sm font-bold text-fg">{c.title}</p>
              <ul className="space-y-1.5">
                {c.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-xs text-fg-muted">
                    <CheckCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--vk-crimson-text)" }} />{it}
                  </li>))}
              </ul>
            </div>))}
        </div>
      </section>
    </div>
  );
}

// ── Tab: Send Us Your Feedback ──────────────────────────────────────────
const FEEDBACK_KINDS = [
  { id: "Compliment", icon: <Heart className="h-5 w-5" />, hint: "Something went well" },
  { id: "Suggestion", icon: <Lightbulb className="h-5 w-5" />, hint: "An idea to improve" },
  { id: "Complaint", icon: <AlertTriangle className="h-5 w-5" />, hint: "Something went wrong" },
] as const;
const CHANNELS = ["Branch or agent", "VINK app", "Online banking", "Call centre", "Card or terminal", "Other"];
const SUBJECTS = TOPICS.slice(3);        // the product areas; the type of feedback is chosen separately

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Overall experience" className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => onChange(value === n ? 0 : n)}
          className="rounded p-0.5 focus-visible:outline-2" style={{ outlineColor: P }}>
          <Star aria-hidden="true" className="h-6 w-6" style={{ color: n <= value ? P : "var(--vk-line-strong)", fill: n <= value ? P : "none" }} />
        </button>))}
    </div>
  );
}

const field = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-[color:var(--vk-brand)]";

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
      <div className="mx-auto max-w-lg rounded-2xl border border-line bg-surface p-10 text-center">
        <CheckCircle aria-hidden="true" className="mx-auto mb-3 h-12 w-12" style={{ color: "var(--vk-ok)" }} />
        <h2 className="mb-1 text-lg font-bold text-fg">Message sent</h2>
        <p className="text-sm text-fg-muted">Your reference number is <strong style={{ color: "var(--vk-crimson-text)" }}>{submitted}</strong>.</p>
        <p className="mt-1 text-sm text-fg-muted">We sent a receipt to <strong className="text-fg">{form.email}</strong>. {deptByKey(form.department)?.name ?? "VINK"} will reply within {deptByKey(form.department)?.respondWithin ?? "1–2 business days"}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <SectionHead eyebrow="Your voice matters" title="Send us your feedback" lead="Tell us what we are doing well and where we can do better. Every message is read by a real person." />
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--vk-brand-soft)", color: "var(--vk-crimson-text)" }}><AlertTriangle className="h-5 w-5" /></span>
            <div><h3 className="text-sm font-bold text-fg">Need urgent help?</h3><p className="mt-1 text-xs text-fg-muted">For lost or stolen cards call <a href="tel:+27210070772" className="font-semibold no-underline" style={{ color: "var(--vk-crimson-text)" }}>+27 (0)21 007 0772</a>, available 24/7. To report fraud call <a href="tel:+27614615035" className="font-semibold no-underline" style={{ color: "var(--vk-crimson-text)" }}>+27 (0)61 461 5035</a>.</p></div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--vk-brand-soft)", color: "var(--vk-crimson-text)" }}><CheckCircle className="h-5 w-5" /></span>
            <div><h3 className="text-sm font-bold text-fg">What happens next?</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-fg-muted"><li>Your enquiry is received immediately and you get a reference number.</li><li>A support consultant reviews your request.</li><li>You receive a response within 1–2 business days.</li></ol></div>
          </div>
        </div>

        <form className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-7" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} noValidate>
          <h2 className="text-lg font-bold text-fg">Share your experience</h2>
          <p className="mb-5 text-sm text-fg-muted">It only takes a minute.</p>
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-fg">Type of feedback</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {FEEDBACK_KINDS.map((k) => (
                  <label key={k.id} className="cursor-pointer">
                    <input type="radio" name="kind" value={k.id} checked={form.kind === k.id} onChange={() => setForm(f => ({ ...f, kind: k.id }))} className="peer sr-only" />
                    <span className="flex h-full flex-col items-start gap-1 rounded-xl border border-line bg-surface p-3 text-sm font-semibold text-fg transition-colors peer-checked:border-[color:var(--vk-brand)] peer-checked:bg-[color:var(--vk-brand-soft)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2" style={{ color: "var(--vk-fg)" }}>
                      <span style={{ color: "var(--vk-crimson-text)" }}>{k.icon}</span>{k.id}<small className="text-xs font-normal text-fg-muted">{k.hint}</small>
                    </span>
                  </label>))}
              </div>
            </fieldset>

            <div><span className="mb-1.5 block text-sm font-semibold text-fg">Overall experience</span><StarRating value={form.rating} onChange={(n) => setForm(f => ({ ...f, rating: n }))} /></div>

            <div>
              <span className="mb-1.5 block text-sm font-semibold text-fg">You are giving feedback for</span>
              <div role="group" aria-label="Feedback for" className="flex flex-wrap gap-2">
                {["Personal Banking", "Private or Business Banking"].map(t => (
                  <button key={t} type="button" aria-pressed={form.bankingType === t} onClick={() => setForm(f => ({ ...f, bankingType: t }))}
                    className="rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors"
                    style={form.bankingType === t ? { background: P, borderColor: P, color: "#fff" } : { background: "var(--vk-surface)", borderColor: "var(--vk-line)", color: "var(--vk-fg-muted)" }}>{t}</button>))}
              </div>
            </div>

            <div>
              <label htmlFor="contact-department" className="mb-1.5 block text-sm font-semibold text-fg">Who is your message for?</label>
              <select id="contact-department" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className={field}>
                {departments.map(d => <option key={d.key} value={d.key}>{d.name} — {d.purpose}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-fg-muted">Goes to <a href={`mailto:${deptByKey(form.department)?.address}`} className="font-semibold" style={{ color: "var(--vk-crimson-text)" }}>{deptByKey(form.department)?.address}</a>. You can also write to that address yourself.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-topic" className="mb-1.5 block text-sm font-semibold text-fg">What is it about?</label>
                <select id="contact-topic" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} className={field}>{SUBJECTS.map(t => <option key={t} value={t}>{t}</option>)}</select>
              </div>
              <div>
                <label htmlFor="contact-channel" className="mb-1.5 block text-sm font-semibold text-fg">Where did this happen?</label>
                <select id="contact-channel" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} className={field}><option value="">Select an option</option>{CHANNELS.map(t => <option key={t} value={t}>{t}</option>)}</select>
              </div>
            </div>

            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-sm font-semibold text-fg">Your message <span aria-hidden="true" style={{ color: P }}>*</span></label>
              <textarea id="contact-message" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={5} placeholder="Tell us what happened…" className={`${field} resize-y`} />
              <p className="mt-1 text-xs text-fg-muted">Please don't include card numbers or passwords.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="contact-name" className="mb-1.5 block text-sm font-semibold text-fg">Name <span aria-hidden="true" style={{ color: P }}>*</span></label><input id="contact-name" autoComplete="given-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={field} /></div>
              <div><label htmlFor="contact-surname" className="mb-1.5 block text-sm font-semibold text-fg">Surname <span aria-hidden="true" style={{ color: P }}>*</span></label><input id="contact-surname" autoComplete="family-name" value={form.surname} onChange={e => setForm(f => ({ ...f, surname: e.target.value }))} className={field} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="contact-email" className="mb-1.5 block text-sm font-semibold text-fg">Email address <span aria-hidden="true" style={{ color: P }}>*</span></label><input id="contact-email" type="email" autoComplete="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={field} /></div>
              <div><label htmlFor="contact-phone" className="mb-1.5 block text-sm font-semibold text-fg">Phone number (optional)</label><input id="contact-phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={field} /></div>
            </div>

            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} /></label>
            </div>

            <div>
              <label htmlFor="contact-captcha" className="mb-1.5 block text-sm font-semibold text-fg">Enter the code shown below</label>
              <CaptchaBox code={captchaCode} onRefresh={() => { setCaptchaCode(genCode()); setCaptchaInput(""); }} />
              <input id="contact-captcha" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} className={`${field} mt-2 uppercase tracking-widest`} placeholder="Type the code" autoComplete="off" />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--vk-brand-hover)] disabled:opacity-60" style={{ background: P }}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending…</> : <>Send message <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
              </button>
              <p className="text-xs text-fg-muted">Never share your PIN, password or OTP with us.</p>
            </div>
          </div>
        </form>
      </section>

      <section>
        <SectionHead eyebrow="Help" title="Frequently asked questions" />
        <FaqGrid />
      </section>
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
    <div data-theme-aware className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg">
      {/* Hero: the brand red, with the three things most people come for */}
      <section aria-labelledby="contact-hero-title" className="text-white" style={{ background: P }}>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:py-16 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/90">Contact us</p>
            <h1 id="contact-hero-title" className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">Get the contact information you need</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">We're here to help. Whether you have a question, need support or want to give feedback, our team is ready to assist you.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={CARE_PHONE.href} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold no-underline" style={{ color: P }}><Phone className="h-4 w-4" aria-hidden="true" />Call us</a>
              <button type="button" onClick={() => go("locate")} className="inline-flex items-center gap-2 rounded-full border border-white/70 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"><MapPin className="h-4 w-4" aria-hidden="true" />Locate us</button>
              <button type="button" onClick={() => go("feedback")} className="inline-flex items-center gap-2 rounded-full border border-white/70 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"><MessageCircle className="h-4 w-4" aria-hidden="true" />Send us your feedback</button>
            </div>
          </div>
          <div className="rounded-3xl border border-white/25 bg-white/10 p-6 backdrop-blur-sm">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white" style={{ color: P }}><Headphones className="h-7 w-7" /></span>
            <p className="mt-4 text-lg font-bold text-white">We're here for you</p>
            <ul className="mt-3 space-y-2 text-sm text-white/95">
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" /><span><a href={CARE_PHONE.href} className="font-semibold text-white no-underline">{CARE_PHONE.label}</a> · {CARE_HOURS}</span></li>
              <li className="flex items-center gap-2"><Shield className="h-4 w-4 shrink-0" aria-hidden="true" /><span>Lost cards and fraud: 24/7</span></li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" /><a href="mailto:info@vink.co.za" className="font-semibold text-white no-underline">info@vink.co.za</a></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Tabs: they stay at the top while the page scrolls */}
      <div id="contact-tabs" className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5">
          <div role="tablist" aria-label="Contact options" className="flex gap-1 overflow-x-auto">
            {TABS.map((t, i) => (
              <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}
                className="shrink-0 whitespace-nowrap border-b-2 px-4 py-4 text-sm font-semibold transition-colors"
                style={{ color: tab === t.id ? P : "var(--vk-fg-muted)", borderColor: tab === t.id ? P : "transparent" }}>
                {t.label}
              </button>))}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6">
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-fg-muted">
          <button type="button" onClick={onClose} className="font-semibold underline-offset-2 hover:underline" style={{ color: "var(--vk-crimson-text)" }}>Home</button>
          <span aria-hidden="true">/</span><span aria-current="page">Contact VINK Support{tab !== "connect" ? ` · ${current.label}` : ""}</span>
        </nav>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "connect"  && <ConnectTab goTo={go} departments={departments} />}
          {tab === "locate"   && <LocateTab />}
          {tab === "feedback" && <FeedbackTab departments={departments} />}
        </div>
      </div>

      {/* Head office, and the app */}
      <div className="border-t border-line bg-surface-2">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-8 sm:grid-cols-2">
          <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--vk-brand-soft)", color: "var(--vk-crimson-text)" }}><Building2 aria-hidden="true" className="h-5 w-5" /></div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fg-muted">Head Office</p>
              <p className="text-sm font-bold text-fg">VINK Finance Limited</p>
              <p className="mt-0.5 text-xs text-fg-muted">{HEAD_OFFICE_ADDRESS}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <a href="mailto:info@vink.co.za" className="text-xs font-semibold no-underline" style={{ color: "var(--vk-crimson-text)" }}>info@vink.co.za</a>
                <span className="text-xs text-fg-muted">{CARE_HOURS}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
            <div>
              <p className="mb-1 flex items-center gap-2 text-sm font-bold text-fg"><Smartphone aria-hidden="true" className="h-4 w-4" style={{ color: "var(--vk-crimson-text)" }} /> Get the VINK App</p>
              <p className="text-xs text-fg-muted">Banking, payments and cards, all in one app. Coming soon.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <span className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-center text-[10px] font-bold text-fg-muted">App Store</span>
              <span className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-center text-[10px] font-bold text-fg-muted">Google Play</span>
            </div>
          </div>
        </div>
      </div>

      <WhatsAppCard />
      <Footer />
    </div>
  );
}
