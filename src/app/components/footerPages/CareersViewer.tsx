import { useMemo, useState } from "react";
import {
  Briefcase, MapPin, Clock, Search, SearchX, ListChecks, GraduationCap, Mail, ArrowRight, Rocket, Globe2, CalendarDays,
  Wallet, House, BookOpen, Dumbbell, Palmtree, Target, Users,
} from "lucide-react";
import { Footer } from "../Footer";
import { Accordion, type AccItem } from "./Accordion";
import { departmentByKey } from "../../data/departments";
import "./contact.css";
import "./careers.css";

interface Props { isOpen: boolean; onClose: () => void; /** Opens the job application form. The form is reached from here, not from the footer. */ onApply?: () => void; }

type TabId = "roles" | "grads" | "why" | "hire";

const BENEFITS = [
  { icon: Wallet,   title: "Competitive Salaries", desc: "Market-rate salaries with annual performance reviews" },
  { icon: House,    title: "Hybrid Working",       desc: "Flexible hybrid arrangements for Cape Town-based roles" },
  { icon: BookOpen, title: "Learning Budget",      desc: "Annual development budget per employee" },
  { icon: Dumbbell, title: "Gym Access",           desc: "Partner gyms (to be announced)" },
  { icon: Palmtree, title: "21 Days Leave",        desc: "Annual leave plus all South African public holidays" },
  { icon: Target,   title: "Mission-Driven",       desc: "Work that genuinely changes lives — not just another bank" },
];

const ROLES = [
  { title: "Senior Software Engineer",           dept: "Backend / API",         location: "Cape Town",    type: "Permanent" },
  { title: "AFC Device Installation Technician", dept: "Operations",            location: "Western Cape", type: "Contract" },
  { title: "Business Development Manager",       dept: "Sales",                 location: "Cape Town",    type: "Permanent" },
  { title: "Compliance Officer",                 dept: "Legal & Compliance",    location: "Cape Town",    type: "Permanent" },
  { title: "UX/UI Designer",                     dept: "Product",               location: "Cape Town",    type: "Permanent" },
  { title: "Customer Support Agent",             dept: "Client Services",       location: "Cape Town",    type: "Permanent" },
  { title: "Data Analyst",                       dept: "Finance",               location: "Cape Town",    type: "Permanent" },
  { title: "Taxi Industry Relations Manager",    dept: "Business Development",  location: "Cape Town",    type: "Permanent" },
  { title: "Payroll & HR Administrator",         dept: "Human Resources",       location: "Cape Town",    type: "Permanent" },
  { title: "Marketing Coordinator",              dept: "Marketing",             location: "Cape Town",    type: "Permanent" },
];

const STEPS = [
  "Browse open roles below and find your fit",
  "Submit your CV and a brief motivation letter via the online form",
  "Shortlisted candidates contacted within 5 business days",
  "Interview process: one screening call + one in-person or video panel",
];

const TABS: { id: TabId; label: string }[] = [
  { id: "roles", label: "Open roles" },
  { id: "grads", label: "Graduates & interns" },
  { id: "why",   label: "Why VINK" },
  { id: "hire",  label: "How we hire" },
];

const CAREERS = departmentByKey("careers");
const CAREERS_EMAIL = CAREERS?.address ?? "careers@vink.co.za";
const CAREERS_REPLY = CAREERS?.respondWithin ?? "1–2 business days";
const TEAMS = [...new Set(ROLES.map((r) => r.dept))].sort();
const TYPES = [...new Set(ROLES.map((r) => r.type))];
const LOCATIONS = [...new Set(ROLES.map((r) => r.location))];
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ── Open roles ─────────────────────────────────────────────────────────────
function RolesTab({ onApply }: { onApply?: () => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("all");
  const [team, setTeam] = useState<string>("all");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ROLES.filter((r) =>
      (type === "all" || r.type === type) &&
      (team === "all" || r.dept === team) &&
      (q === "" || [r.title, r.dept, r.location, r.type].some((v) => v.toLowerCase().includes(q))));
  }, [query, type, team]);
  const filtered = query.trim() !== "" || type !== "all" || team !== "all";
  const clear = () => { setQuery(""); setType("all"); setTeam("all"); };

  return (
    <div className="vc-panel">
      <p className="vc-section-eyebrow">Open roles</p>
      <h2 className="vc-section-title">Find your fit</h2>
      <p className="vc-section-lead">Search by role or team, or filter by contract type. Every role applies through the same online form.</p>

      <div className="vk-cr-controls">
        <div className="vc-search">
          <Search className="vc-icon" aria-hidden="true" />
          <label className="sr-only" htmlFor="careers-search">Search roles</label>
          <input className="vc-input" id="careers-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by role, team or location" autoComplete="off" />
        </div>
        <div>
          <label className="sr-only" htmlFor="careers-team">Filter by team</label>
          <select className="vc-select" id="careers-team" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All teams</option>
            {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="vk-cr-filterbar">
        <div className="vc-chips" role="group" aria-label="Filter by contract type">
          {[["all", "All"], ...TYPES.map((t) => [t, t])].map(([id, label]) => (
            <button key={id} className="vc-chip" type="button" aria-pressed={type === id} onClick={() => setType(id)}>{label}</button>))}
        </div>
        <p className="vk-cr-results" aria-live="polite">Showing {results.length} of {ROLES.length} {plural(ROLES.length, "role", "roles")}</p>
      </div>

      {results.length > 0 ? (
        <ul className="vk-cr-grid" aria-label="Open roles">
          {results.map((r) => (
            <li key={r.title}>
              <article className="vk-cr-role">
                <div className="vk-cr-role__top">
                  <span className="vk-cr-role__dept"><Briefcase className="vc-icon" aria-hidden="true" />{r.dept}</span>
                  <span className="vk-cr-role__type"><Clock className="vc-icon" aria-hidden="true" />{r.type}</span>
                </div>
                <h3>{r.title}</h3>
                <p className="vk-cr-role__meta"><MapPin className="vc-icon" aria-hidden="true" />{r.location}</p>
                <button type="button" className="vc-btn vc-btn--primary vc-btn--sm" onClick={onApply} aria-label={`Apply now for ${r.title}`}>Apply now<ArrowRight className="vc-icon" aria-hidden="true" /></button>
              </article>
            </li>))}
        </ul>
      ) : (
        <div className="vk-cr-empty" role="status">
          <SearchX className="vc-icon" aria-hidden="true" />
          <h3>No roles match your search</h3>
          <p>Try a different word, or clear the filters to see every open role.</p>
          {filtered && <button type="button" className="vc-btn vc-btn--outline vc-btn--sm" onClick={clear}>Clear filters</button>}
        </div>
      )}

      <aside className="vc-assist vk-cr-assist" aria-label="Can't see the right role?">
        <div>
          <span className="vc-assist__badge" aria-hidden="true"><Briefcase className="vc-icon" /></span>
          <span>
            <h3>Don&apos;t see the right role?</h3>
            <p>Start an application and choose the department and position closest to your skills.</p>
          </span>
        </div>
        <div>
          <span className="vc-assist__badge vc-assist__badge--sm" aria-hidden="true"><Mail className="vc-icon" /></span>
          <span>
            <h3>Write to our careers team</h3>
            <a className="vc-phone" href={`mailto:${CAREERS_EMAIL}`}>{CAREERS_EMAIL}</a>
            <span className="vc-avail">Replies within {CAREERS_REPLY}</span>
          </span>
        </div>
        <div>
          <button type="button" className="vc-btn vc-btn--outline" onClick={onApply}>Start an application</button>
        </div>
      </aside>
    </div>
  );
}

// ── Graduates & interns ────────────────────────────────────────────────────
function GradsTab() {
  const facts = [
    { icon: <CalendarDays className="vc-icon" />, label: "Duration",     value: "12 months, paid" },
    { icon: <Users className="vc-icon" />,        label: "Open to",      value: "Recent graduates" },
    { icon: <GraduationCap className="vc-icon" />, label: "Fields",      value: "Computer Science, Finance, Marketing and Business Management" },
    { icon: <Clock className="vc-icon" />,        label: "Applications", value: "Open annually in January" },
  ];
  return (
    <div className="vc-panel">
      <div className="vc-panel-grid">
        <div className="vc-side-card">
          <div>
            <p className="vc-section-eyebrow">Early careers</p>
            <h2 className="vc-section-title">Graduate &amp; Internship Programme</h2>
            <p className="vc-section-lead">VINK offers a 12-month paid internship programme for recent graduates in Computer Science, Finance, Marketing, and Business Management. Applications open annually in January.</p>
          </div>
          <div>
            <a className="vc-btn vc-btn--primary" href="mailto:intern@vink.co.za"><Mail className="vc-icon" aria-hidden="true" />Email intern@vink.co.za</a>
          </div>
        </div>
        <div className="vc-card">
          <h2 className="vc-card__title">The programme at a glance</h2>
          <p className="vc-card__lead">Four facts, before you write to us.</p>
          <ul className="vc-acc-rows">
            {facts.map((f) => (
              <li key={f.label} className="vc-acc-row">
                <span className="vc-acc-row__icon" aria-hidden="true">{f.icon}</span>
                <span className="vc-acc-row__text"><span className="vc-acc-row__label">{f.label}</span><span className="vc-acc-row__value">{f.value}</span></span>
              </li>))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Why VINK ───────────────────────────────────────────────────────────────
function WhyTab({ goTo }: { goTo: (t: TabId) => void }) {
  return (
    <div className="vc-panel">
      <p className="vc-section-eyebrow">Why work at VINK</p>
      <h2 className="vc-section-title">Why Work at VINK?</h2>
      <p className="vc-section-lead">You&apos;re helping build the financial infrastructure for the 15 million South Africans who take a taxi every day.</p>
      <ul className="vk-cr-benefits">
        {BENEFITS.map(({ icon: Icon, title, desc }) => (
          <li key={title} className="vk-cr-benefit">
            <span className="vk-cr-benefit__icon" aria-hidden="true"><Icon className="vc-icon" /></span>
            <h3>{title}</h3>
            <p>{desc}</p>
          </li>))}
      </ul>
      <div className="vk-cr-cta">
        <button type="button" className="vc-btn vc-btn--primary" onClick={() => goTo("roles")}>See open roles<ArrowRight className="vc-icon" aria-hidden="true" /></button>
        <p>{ROLES.length} {plural(ROLES.length, "role", "roles")} open in {LOCATIONS.join(" and ")}.</p>
      </div>
    </div>
  );
}

// ── How we hire ────────────────────────────────────────────────────────────
function HireTab({ goTo, onApply }: { goTo: (t: TabId) => void; onApply?: () => void }) {
  const start = onApply ?? (() => {});
  const faqs: AccItem[] = [
    { id: "faq-apply", title: "How do I apply?", intro: "Press Apply now on any open role. You submit your CV and a brief motivation letter through the online form." },
    { id: "faq-next", title: "What happens after I apply?", intro: "Shortlisted candidates are contacted within 5 business days." },
    { id: "faq-interview", title: "What is the interview process?", intro: "One screening call, then one in-person or video panel." },
    { id: "faq-where", title: "Where are the roles based?", intro: `Roles are based in ${LOCATIONS.join(" and ")}. Cape Town-based roles have flexible hybrid arrangements.` },
    { id: "faq-nofit", title: "I can't see a role that fits me", intro: `You can still start an application: choose the department and position closest to your skills in the form. Or write to ${CAREERS_EMAIL}; we reply within ${CAREERS_REPLY}.`, link: { label: "Start an application", onClick: start } },
    { id: "faq-grads", title: "Do you take graduates and interns?", intro: "Yes: a 12-month paid internship for recent graduates. Applications open annually in January.", link: { label: "See the programme", onClick: () => goTo("grads") } },
  ];
  return (
    <div className="vc-panel">
      <div className="vc-panel-grid">
        <div className="vc-side-card">
          <div>
            <p className="vc-section-eyebrow">How we hire</p>
            <h2 className="vc-section-title">Four steps, from browsing to interview</h2>
            <p className="vc-section-lead">Here is what to expect when you apply to VINK.</p>
          </div>
          <div className="vc-tip">
            <span className="vc-tip__icon" aria-hidden="true"><ListChecks className="vc-icon" /></span>
            <div>
              <h3>Have these ready</h3>
              <p>Your CV and a brief motivation letter. You submit both through the online form.</p>
            </div>
          </div>
          <div className="vc-tip">
            <span className="vc-tip__icon" aria-hidden="true"><Mail className="vc-icon" /></span>
            <div>
              <h3>Questions?</h3>
              <p>Write to <a href={`mailto:${CAREERS_EMAIL}`}>{CAREERS_EMAIL}</a>. We reply within {CAREERS_REPLY}.</p>
            </div>
          </div>
        </div>
        <div className="vc-card">
          <h2 className="vc-card__title">What happens next</h2>
          <p className="vc-card__lead">From your first click to your interview.</p>
          <ol className="vk-cr-steps">
            {STEPS.map((step, i) => (
              <li key={step} className="vk-cr-step"><span className="vk-cr-step__n" aria-hidden="true">{i + 1}</span><p>{step}</p></li>))}
          </ol>
        </div>
      </div>

      <h2 className="vc-section-title vc-faq-title">Frequently asked questions</h2>
      <div className="vc-acc-wrap" style={{ marginInline: 0, maxWidth: "none" }}><Accordion items={faqs} label="Careers frequently asked questions" /></div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function CareersViewer({ isOpen, onClose, onApply }: Props) {
  const [tab, setTab] = useState<TabId>("roles");
  if (!isOpen) return null;

  const go = (t: TabId) => { setTab(t); document.getElementById("careers-tabs")?.scrollIntoView?.({ behavior: "smooth", block: "start" }); };
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const last = TABS.length - 1;
    const to = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + last) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to].id); document.getElementById(`careers-tab-${TABS[to].id}`)?.focus();
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div data-theme-aware className="vc fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg">
      {/* Hero: the brand red, copy on the left, the three places most people go, and the numbers on the right */}
      <section className="vc-hero" aria-labelledby="careers-hero-title">
        <div className="vc-container vc-hero__inner">
          <div className="vc-hero__copy">
            <p className="vc-eyebrow">Careers at VINK</p>
            <h1 id="careers-hero-title" className="vk-cr-h1">Build the Future of African Payments.</h1>
            <p>At VINK, you&apos;re not just building software — you&apos;re helping build the financial infrastructure for the 15 million South Africans who take a taxi every day. We launch in June 2027.</p>
            <div className="vc-hero__links">
              <button type="button" onClick={() => go("roles")}><Briefcase className="vc-icon" aria-hidden="true" />Browse open roles</button>
              <button type="button" onClick={() => go("grads")}><GraduationCap className="vc-icon" aria-hidden="true" />Graduate programme</button>
              <button type="button" onClick={() => go("hire")}><ListChecks className="vc-icon" aria-hidden="true" />How we hire</button>
            </div>
          </div>
          <div className="vk-cr-media">
            <ul className="vk-cr-stats" aria-label="VINK careers at a glance">
              <li><Rocket className="vc-icon" aria-hidden="true" /><strong>{ROLES.length}</strong><span>Open {plural(ROLES.length, "role", "roles")}</span></li>
              <li><MapPin className="vc-icon" aria-hidden="true" /><strong>Cape Town</strong><span>South Africa</span></li>
              <li><Globe2 className="vc-icon" aria-hidden="true" /><strong>100%</strong><span>Black-Owned</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Tabs: they stay at the top while the page scrolls */}
      <div className="vc-tabs-bar" id="careers-tabs">
        <div className="vc-container">
          <div className="vc-tabs" role="tablist" aria-label="Careers sections">
            {TABS.map((t, i) => (
              <button key={t.id} className="vc-tab" id={`careers-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`careers-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>
                {t.label}{t.id === "roles" && <span className="vk-cr-count" aria-label={`${ROLES.length} ${plural(ROLES.length, "role", "roles")}`}>{ROLES.length}</span>}
              </button>))}
          </div>
        </div>
      </div>

      <div className="vc-container">
        <nav className="vc-crumbs" aria-label="Breadcrumb">
          <button type="button" onClick={onClose}>Home</button>
          <span aria-hidden="true">/</span><span aria-current="page">Careers{tab !== "roles" ? ` · ${current.label}` : ""}</span>
        </nav>
        <div id={`careers-panel-${tab}`} role="tabpanel" aria-labelledby={`careers-tab-${tab}`}>
          {tab === "roles" && <RolesTab onApply={onApply} />}
          {tab === "grads" && <GradsTab />}
          {tab === "why"   && <WhyTab goTo={go} />}
          {tab === "hire"  && <HireTab goTo={go} onApply={onApply} />}
        </div>
      </div>

      <Footer />
    </div>
  );
}
