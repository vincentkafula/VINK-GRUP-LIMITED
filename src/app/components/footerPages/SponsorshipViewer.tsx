import { useEffect, useState } from "react";
import {
  Bus, GraduationCap, ShieldCheck, Trophy, HeartHandshake, Users, FileText, Wallet, CalendarDays, MapPin, Mail, ArrowRight, Check, Target,
} from "lucide-react";
import { Footer } from "../Footer";
import { Accordion, type AccItem } from "./Accordion";
import { SponsorshipTracker } from "./SponsorshipTracker";
import { departmentByKey } from "../../data/departments";
import "./contact.css";
import "./page-kit.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the online application form. */
  onApply?: () => void;
  /** After an application is sent: open the tracker with its reference and email filled in. */
  trackPrefill?: { ref: string; email: string } | null;
}

type TabId = "focus" | "eligibility" | "apply" | "track";

const FOCUS_AREAS = [
  { icon: Bus,            title: "Transport Safety",       desc: "Taxi industry road safety campaigns, CCTV deployment, and community crime prevention initiatives." },
  { icon: GraduationCap,  title: "Youth Entrepreneurship", desc: "Business skills workshops for young people in Western Cape townships — equipping the next generation of Southern African entrepreneurs." },
  { icon: ShieldCheck,    title: "Community Safety",       desc: "Neighbourhood watch and CCID community safety initiatives. 5% of every VINK taxi transaction goes directly to neighbourhood watch in the area served." },
  { icon: Trophy,         title: "Grassroots Sport",       desc: "Football leagues, athletics, and martial arts at community level — supporting healthy, active communities." },
];

const ELIGIBILITY = [
  { icon: Users,          label: "Who can apply",     value: "Non-profit organisations, community sport teams, school programmes, or community events" },
  { icon: MapPin,         label: "Where",             value: "Priority given to Western Cape applicants; national applications considered" },
  { icon: HeartHandshake, label: "Community benefit", value: "Clear community benefit aligned with VINK values required" },
  { icon: Wallet,         label: "Request size",      value: "Minimum request: R5,000 · Maximum: R500,000 per application" },
];

const PROPOSAL = [
  "Organisation background and mission",
  "Event or programme details and dates",
  "Requested amount",
  "Expected community reach and impact",
  "Proof of NPO or community organisation registration",
];

const TABS: { id: TabId; label: string }[] = [
  { id: "focus",       label: "Focus areas" },
  { id: "eligibility", label: "Who can apply" },
  { id: "apply",       label: "How to apply" },
  { id: "track",       label: "Track an application" },
];

const DEPT = departmentByKey("sponsorships");
const EMAIL = DEPT?.address ?? "sponsorships@vink.co.za";
const REPLY = DEPT?.respondWithin ?? "1–2 business days";

// ── Focus areas ────────────────────────────────────────────────────────────
function FocusTab({ onApply }: { onApply?: () => void }) {
  return (
    <div className="vc-panel">
      <p className="vc-section-eyebrow">Our focus areas</p>
      <h2 className="vc-section-title">Where we invest</h2>
      <p className="vc-section-lead">VINK sponsors programmes that uplift the communities our customers live and work in.</p>
      <ul className="vx-cards vx-cards--2">
        {FOCUS_AREAS.map(({ icon: Icon, title, desc }) => (
          <li key={title} className="vx-card">
            <span className="vx-card__icon" aria-hidden="true"><Icon className="vc-icon" /></span>
            <h3>{title}</h3>
            <p>{desc}</p>
          </li>))}
      </ul>
      <div className="vx-cta">
        <button type="button" className="vc-btn vc-btn--primary" onClick={onApply}>Apply online<ArrowRight className="vc-icon" aria-hidden="true" /></button>
        <p>Or email your proposal to <a href={`mailto:${EMAIL}`} style={{ color: "var(--vk-crimson-text)", fontWeight: 600 }}>{EMAIL}</a>.</p>
      </div>
    </div>
  );
}

// ── Who can apply ──────────────────────────────────────────────────────────
function EligibilityTab({ onApply }: { onApply?: () => void }) {
  return (
    <div className="vc-panel">
      <div className="vc-panel-grid">
        <div className="vc-side-card">
          <div>
            <p className="vc-section-eyebrow">Eligibility</p>
            <h2 className="vc-section-title">Who can apply</h2>
            <p className="vc-section-lead">The criteria below apply to every application.</p>
          </div>
          <div>
            <button type="button" className="vc-btn vc-btn--primary" onClick={onApply}>Apply online<ArrowRight className="vc-icon" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="vc-card">
          <h2 className="vc-card__title">Eligibility criteria</h2>
          <p className="vc-card__lead">Check these before you write your proposal.</p>
          <ul className="vc-acc-rows">
            {ELIGIBILITY.map((e) => (
              <li key={e.label} className="vc-acc-row">
                <span className="vc-acc-row__icon" aria-hidden="true"><e.icon className="vc-icon" /></span>
                <span className="vc-acc-row__text"><span className="vc-acc-row__label">{e.label}</span><span className="vc-acc-row__value">{e.value}</span></span>
              </li>))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── How to apply ───────────────────────────────────────────────────────────
function ApplyTab({ goTo, onApply }: { goTo: (t: TabId) => void; onApply?: () => void }) {
  const faqs: AccItem[] = [
    { id: "faq-amount", title: "How much can I ask for?", intro: "Minimum request: R5,000 · Maximum: R500,000 per application." },
    { id: "faq-region", title: "Do you only support the Western Cape?", intro: "Priority is given to Western Cape applicants; national applications are considered." },
    { id: "faq-who", title: "Who can apply?", intro: "Non-profit organisations, community sport teams, school programmes, or community events.", link: { label: "See every criterion", onClick: () => goTo("eligibility") } },
    { id: "faq-review", title: "How often are applications reviewed?", intro: "VINK reviews applications on a quarterly basis." },
    { id: "faq-hear", title: "When will I hear back?", intro: "Successful applicants will be contacted within 6 weeks of the review date." },
    { id: "faq-email", title: "Can I apply by email instead?", intro: `Yes. You can send your proposal to ${EMAIL}.` },
    { id: "faq-track", title: "How do I follow my application?", intro: "Use the reference number from your confirmation email, with the email address you applied with.", link: { label: "Track an application", onClick: () => goTo("track") } },
  ];
  const steps = [
    "Complete the online application and attach your documents. You receive a reference number and a confirmation email",
    "VINK reviews applications on a quarterly basis",
    "Successful applicants will be contacted within 6 weeks of the review date",
  ];
  return (
    <div className="vc-panel">
      <div className="vc-panel-grid">
        <div className="vc-side-card">
          <div>
            <p className="vc-section-eyebrow">How to apply</p>
            <h2 className="vc-section-title">Apply online</h2>
            <p className="vc-section-lead">Complete the online application, attach your documents and send it. You get a reference number to follow its progress.</p>
          </div>
          <div>
            <button type="button" className="vc-btn vc-btn--primary" onClick={onApply}>Apply online<ArrowRight className="vc-icon" aria-hidden="true" /></button>
            <p className="vc-form-note" style={{ marginTop: 14 }}>Prefer email? Send your proposal to <a href={`mailto:${EMAIL}`} style={{ color: "var(--vk-crimson-text)", fontWeight: 600 }}>{EMAIL}</a>.</p>
          </div>
        </div>
        <div className="vc-card">
          <h2 className="vc-card__title">Include in your proposal</h2>
          <p className="vc-card__lead">Five things every proposal needs.</p>
          <ul className="vc-acc-rows">
            {PROPOSAL.map((item) => (
              <li key={item} className="vc-acc-row">
                <span className="vc-acc-row__icon" aria-hidden="true"><Check className="vc-icon" /></span>
                <span className="vc-acc-row__text"><span className="vc-acc-row__value">{item}</span></span>
              </li>))}
          </ul>
        </div>
      </div>

      <div className="vc-card vx-below">
        <h2 className="vc-card__title">What happens next</h2>
        <p className="vc-card__lead">From sending your proposal to hearing from us.</p>
        <ol className="vx-steps">
          {steps.map((step, i) => (
            <li key={i} className="vx-step"><span className="vx-step__n" aria-hidden="true">{i + 1}</span><p>{step}</p></li>))}
        </ol>
      </div>

      <h2 className="vc-section-title vc-faq-title">Frequently asked questions</h2>
      <div className="vc-acc-wrap" style={{ marginInline: 0, maxWidth: "none" }}><Accordion items={faqs} label="Sponsorship frequently asked questions" /></div>

      <aside className="vc-assist vx-assist" aria-label="Ready to apply?">
        <div>
          <span className="vc-assist__badge" aria-hidden="true"><HeartHandshake className="vc-icon" /></span>
          <span>
            <h3>Ready to apply?</h3>
            <p>Apply online, or send your proposal to our sponsorship team.</p>
          </span>
        </div>
        <div>
          <span className="vc-assist__badge vc-assist__badge--sm" aria-hidden="true"><Mail className="vc-icon" /></span>
          <span>
            <h3>{DEPT?.name ?? "Sponsorships and Partnerships"}</h3>
            <a className="vc-phone" href={`mailto:${EMAIL}`}>{EMAIL}</a>
            <span className="vc-avail">Replies within {REPLY}</span>
          </span>
        </div>
        <div>
          <button type="button" className="vc-btn vc-btn--outline" onClick={onApply}>Apply online</button>
        </div>
      </aside>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function SponsorshipViewer({ isOpen, onClose, onApply, trackPrefill }: Props) {
  const [tab, setTab] = useState<TabId>(trackPrefill ? "track" : "focus");
  useEffect(() => { if (trackPrefill) setTab("track"); }, [trackPrefill?.ref, trackPrefill?.email]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!isOpen) return null;

  const go = (t: TabId) => { setTab(t); document.getElementById("sponsorship-tabs")?.scrollIntoView?.({ behavior: "smooth", block: "start" }); };
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const last = TABS.length - 1;
    const to = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + last) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to].id); document.getElementById(`sponsorship-tab-${TABS[to].id}`)?.focus();
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div data-theme-aware className="vc fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg">
      {/* Hero: the brand red, copy on the left, the three places most people go, and the numbers on the right */}
      <section className="vc-hero" aria-labelledby="sponsorship-hero-title">
        <div className="vc-container vc-hero__inner">
          <div className="vc-hero__copy">
            <p className="vc-eyebrow">Community Investment</p>
            <h1 id="sponsorship-hero-title" className="vx-h1--wide">Sponsorship &amp; Community Investment</h1>
            <p>VINK sponsors programmes that uplift the communities our customers live and work in — with a focus on transport safety, youth education, township economic development, and sport.</p>
            <div className="vc-hero__links">
              <button type="button" onClick={() => go("focus")}><HeartHandshake className="vc-icon" aria-hidden="true" />Our focus areas</button>
              <button type="button" onClick={() => go("eligibility")}><Users className="vc-icon" aria-hidden="true" />Who can apply</button>
              <button type="button" onClick={onApply}><FileText className="vc-icon" aria-hidden="true" />Apply online</button>
            </div>
          </div>
          <div className="vx-media">
            <ul className="vx-stats" aria-label="Sponsorship at a glance">
              <li><Target className="vc-icon" aria-hidden="true" /><strong>{FOCUS_AREAS.length}</strong><span>Focus areas</span></li>
              <li><Wallet className="vc-icon" aria-hidden="true" /><strong>R500,000</strong><span>Maximum request</span></li>
              <li><CalendarDays className="vc-icon" aria-hidden="true" /><strong>Quarterly</strong><span>Review cycle</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* Tabs: they stay at the top while the page scrolls */}
      <div className="vc-tabs-bar" id="sponsorship-tabs">
        <div className="vc-container">
          <div className="vc-tabs" role="tablist" aria-label="Sponsorship sections">
            {TABS.map((t, i) => (
              <button key={t.id} className="vc-tab" id={`sponsorship-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`sponsorship-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>{t.label}</button>))}
          </div>
        </div>
      </div>

      <div className="vc-container">
        <nav className="vc-crumbs" aria-label="Breadcrumb">
          <button type="button" onClick={onClose}>Home</button>
          <span aria-hidden="true">/</span><span aria-current="page">Sponsorship{tab !== "focus" ? ` · ${current.label}` : ""}</span>
        </nav>
        <div id={`sponsorship-panel-${tab}`} role="tabpanel" aria-labelledby={`sponsorship-tab-${tab}`}>
          {tab === "focus"       && <FocusTab onApply={onApply} />}
          {tab === "eligibility" && <EligibilityTab onApply={onApply} />}
          {tab === "apply"       && <ApplyTab goTo={go} onApply={onApply} />}
          {tab === "track"       && <SponsorshipTracker prefill={trackPrefill} email={EMAIL} />}
        </div>
      </div>

      <Footer />
    </div>
  );
}
