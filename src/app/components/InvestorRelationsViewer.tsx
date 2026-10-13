import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldCheck, Compass, Users, ShieldAlert, Briefcase, Target, type LucideIcon } from "lucide-react";
import { Footer } from "./Footer";
import { PersonGrid } from "./GovernanceCards";
import { CARD_ART, CARD_ICON } from "./investorArt";
import { publicApi } from "../services/apiClient";
import "./investor.css";

interface Props { isOpen: boolean; onClose: () => void; }

const MAIL = "investor.relations@vink.co.za";
const PHONE = { label: "+27 (0)21 009 5100", href: "tel:+27210095100" };
const ADDRESS = "State House Building, 8 Rose Street, Cape Town, South Africa";

// ── The Board and the Executive Committee, and what each is responsible for ──

/** The Board of Directors: ten people. Add `photo: "https://…"` to a person and the card shows the photo instead of the silhouette. */
const BOARD_MEMBERS: { name: string; role: string; tag?: string; photo?: string }[] = [
  { name: "Professor Oliver Saasa", role: "Chairperson", tag: "Chair" },
  { name: "Regina Mulenga",         role: "Vice Chairperson" },
  { name: "Cecilia Zimba",          role: "Non-Executive Director" },
  { name: "David Musunga",          role: "Non-Executive Director" },
  { name: "Deepak Malik",           role: "Non-Executive Director" },
  { name: "Leslie Horne",           role: "Non-Executive Director" },
  { name: "Michael Mbulo",          role: "Non-Executive Director" },
  { name: "Musata Ndhlovu",         role: "Non-Executive Director" },
  { name: "Owen Silavwe",           role: "Non-Executive Director" },
  { name: "Robin Miller",           role: "Non-Executive Director" },
];

const MINI_CHART = [1.44,1.62,1.55,1.80,2.10,1.95,2.30,2.45,2.20,2.50,2.38,2.60];

// ─── Corporate Governance data ────────────────────────────────────────────────

/** The Executive Committee: fifteen people, led by the Chief Executive Officer. */
const EXECUTIVE_COMMITTEE: { name: string; role: string; tag?: string; note?: string; photo?: string }[] = [
  { name: "Mukwandi Chibesakunda",                 role: "Chief Executive Officer*", tag: "CEO", note: "*Non-Board Member" },
  { name: "Kalaluka Itwi",                         role: "Chief Financial Officer" },
  { name: "Chali Mwefyeni",                        role: "Chief Commercial Officer" },
  { name: "Vincent Chuunga",                       role: "Chief Operations Officer" },
  { name: "Kaluba Gloria Kaulung\u2019ombe-Inampasa", role: "Chief Legal Officer and Company Secretary" },
  { name: "Kalengo S. Simukoko",                   role: "Chief Credit Risk Officer" },
  { name: "Mutisunge Zulu",                        role: "Chief Credit Risk Officer" },
  { name: "Wisdom Shangenta",                      role: "Chief Information Officer" },
  { name: "Mwila Chibela",                         role: "Chief Digital Banking Officer" },
  { name: "Nawa Themba Joel Samatebele",           role: "Chief Information Security Officer" },
  { name: "Henry Kalubi",                          role: "Acting Chief Human Capital Officer" },
  { name: "Chanda Chime Katongo",                  role: "Executive Head Client Solutions" },
  { name: "Fredrick K. Mulenga",                   role: "Executive Head Treasury" },
  { name: "Temba Nonde",                           role: "Executive Head Compliance and Financial Crimes" },
  { name: "Eletina Phiri Bbuku",                   role: "Executive Head Internal Audit" },
];

/** What each group is responsible for, in the Board's own words. */
const BOARD_INTRO = "The Board of Directors retains full and effective control of the bank and monitors the Executive Management Team. The Board is also responsible for direction, policies and strategies and all investment and divestment decisions. It also ensures that the bank meets its responsibilities towards all its stakeholders and that the bank is prudently managed against the major risks inherent in business and banking.";
const EXEC_INTRO = "The Executive Committee, led by the Chief Executive Officer, is responsible for the day-to-day management of the bank and for executing the strategy and policies set by the Board of Directors.";

const RESPONSIBILITIES: { group: string; title: string; icon: LucideIcon; text: string }[] = [
  { group: "The Board", title: "Full and effective control", icon: ShieldCheck, text: "The Board retains full and effective control of the bank and monitors the Executive Management Team." },
  { group: "The Board", title: "Direction and strategy", icon: Compass, text: "The Board is responsible for direction, policies and strategies, and for all investment and divestment decisions." },
  { group: "The Board", title: "Stakeholders", icon: Users, text: "The Board ensures that the bank meets its responsibilities towards all its stakeholders." },
  { group: "The Board", title: "Prudent management of risk", icon: ShieldAlert, text: "The Board ensures that the bank is prudently managed against the major risks inherent in business and banking." },
  { group: "The Executive Committee", title: "Day-to-day management", icon: Briefcase, text: "The Executive Committee, led by the Chief Executive Officer, is responsible for the day-to-day management of the bank." },
  { group: "The Executive Committee", title: "Executing the strategy", icon: Target, text: "The Executive Committee executes the strategy and policies set by the Board of Directors." },
];

// ── The resources ───────────────────────────────────────────────────────

const Rows = ({ rows }: { rows: [string, string][] }) => <dl className="rows">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
const Mail = ({ subject, label = MAIL }: { subject?: string; label?: string }) => <a href={`mailto:${MAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`}>{label}</a>;

interface Resource { key: string; art: string; icon: string; cat: string; title: string; blurb: string; body: (go: (v: string) => void) => ReactNode }

const RESOURCES: Resource[] = [
  { key: "reports", art: "a", icon: "doc", cat: "Reports", title: "Annual reports", blurb: "View our latest annual reports and get a comprehensive look at our performance, strategy and governance.",
    body: () => (<>
      <h3>Annual reports</h3>
      <p>VINK is not yet in full operation, so there is no annual report to publish yet. Our first annual report will be published here after our June 2027 launch.</p>
      <h3>Corporate documents</h3>
      <div className="file"><span className="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={CARD_ICON.doc} /></svg></span><div><b>Memorandum of Incorporation</b><span>2018 · 1.1 MB</span></div><Mail subject="Memorandum of Incorporation" label="Request a copy" /></div></>) },
  { key: "results", art: "b", icon: "bars", cat: "Reports", title: "Financial results", blurb: "Access the business plan and projections, and our interim and annual financial results once VINK is trading.",
    body: () => (<>
      <h3>Business plan and projections</h3>
      <p>VINK is building Southern Africa's first transport-native digital bank, with a national rollout plan for 250,000+ AFC devices across the minibus taxi network.</p>
      <div className="stats">
        <div><b>R11B</b><span>Addressable market: estimated annual TAM across the national taxi network</span></div>
        <div><b>Per-Tap</b><span>Revenue model: R0.50–R1.00 per transaction, scaling with network volume</span></div>
        <div><b>7.5% p.a.</b><span>Target growth. Detailed year-by-year projections are available on request</span></div>
      </div>
      <h3>3 reasons to consider investing in VINK</h3>
      <div className="reasons">
        <div><h4>Leader</h4><p>VINK is positioned to become a category leader in diversified financial services across Southern Africa, targeting core return metrics and market penetration that outperform existing peers.</p></div>
        <div><h4>Disciplined</h4><p>VINK's business plan is built on disciplined capital allocation and a diversified revenue base (banking, insurance, telecommunications and e-mobility), designed to cushion cyclical headwinds once operational.</p></div>
        <div><h4>High growth potential</h4><p>VINK Finance targets rapid adoption from launch, driven by accelerated digital uptake among underbanked commuters, cost efficiency built into the platform from day one, and a clear roadmap for strategic partnerships.</p></div>
      </div>
      <h3>Financial results</h3>
      <p>Interim and annual results will be published here once VINK begins to trade. Detailed projections: <Mail subject="Investor projections" />.</p></>) },
  { key: "shareholders", art: "c", icon: "ppl", cat: "Information", title: "Shareholder and dividend information", blurb: "Find key information for our shareholders, including registration details and corporate status.",
    body: () => (<>
      <h3>Company information</h3>
      <Rows rows={[["Status", "Pre-launch: full operation June 2027"], ["US registration", "EIN 37-2148609"], ["SA registration", "2018/079316/07"], ["Zambia registration", "120210020196"]]} />
      <p>VINK is registered under CIPC number 2018/079316/07 as Vink Group (Pty) Ltd.</p>
      <h3>Dividends</h3>
      <p>VINK is not yet trading. Dividend information will be published here when it applies. For shareholder questions: <Mail subject="Shareholder enquiry" />.</p></>) },
  { key: "capital", art: "d", icon: "shield", cat: "Reports", title: "Capital and risk management", blurb: "Learn more about our approach to capital, risk and performance management.",
    body: (go) => (<>
      <h3>Disciplined capital allocation</h3>
      <p>VINK's business plan is built on disciplined capital allocation and a diversified revenue base (banking, insurance, telecommunications and e-mobility), designed to cushion cyclical headwinds once operational.</p>
      <h3>Managing risk</h3>
      <p>The Board ensures that the bank is prudently managed against the major risks inherent in business and banking, and monitors the Executive Management Team.</p>
      <p><a href="#governance" onClick={(e) => { e.preventDefault(); go("governance"); }}>Meet the Board of Directors and the Executive Committee →</a></p></>) },
  { key: "debt", art: "e", icon: "db", cat: "Investors", title: "Debt investors", blurb: "Access information for our debt investors, including the funding sought, its term and the market it serves.",
    body: () => (<>
      <h3>Funding</h3>
      <Rows rows={[["Funding sought", "R4.5 Billion"], ["Funding term", "60 months @ 7%"], ["Addressable market", "R11B / year (TAM)"], ["Target growth", "7.5% p.a."], ["Tax rate", "28%"]]} />
      <p>Presentations and key documents for debt investors are available on request: <Mail subject="Debt investor enquiry" />.</p></>) },
  { key: "announcements", art: "f", icon: "trend", cat: "Reports", title: "Announcements and news", blurb: "View our latest announcements and regulatory updates as they are published.",
    body: () => (<>
      <h3>Investor news</h3>
      <p>VINK is not yet in full operation. Investor news and quarterly updates will be published here as we approach our June 2027 launch.</p></>) },
];

// ── The page ────────────────────────────────────────────────────────────

const arrow = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

function HeroArt() {
  return (
    <div className="art"><svg viewBox="0 0 640 300" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="vi-sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6d7aa6" /><stop offset="1" stopColor="#e8b8a8" /></linearGradient>
        <linearGradient id="vi-fd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c8102e" /><stop offset=".5" stopColor="#c8102e" stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="200" width="440" height="300" fill="url(#vi-sk)" opacity=".85" />
      <g fill="#2a3556" opacity=".55"><rect x="330" y="120" width="46" height="180" /><rect x="384" y="70" width="58" height="230" /><rect x="452" y="140" width="40" height="160" /><rect x="500" y="40" width="64" height="260" /><rect x="574" y="110" width="50" height="190" /></g>
      <g fill="#fff" opacity=".25"><rect x="392" y="86" width="6" height="6" /><rect x="408" y="116" width="6" height="6" /><rect x="512" y="70" width="6" height="6" /><rect x="536" y="110" width="6" height="6" /><rect x="520" y="160" width="6" height="6" /></g>
      <polyline className="draw" points="250,250 320,230 380,238 450,170 520,184 600,96" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
      <circle cx="600" cy="96" r="9" fill="#fff" /><circle cx="600" cy="96" r="18" fill="#fff" opacity=".25" />
      <path d="M250 300L420 0h-60L180 300z" fill="#fff" opacity=".08" />
      <rect width="640" height="300" fill="url(#vi-fd)" />
    </svg></div>
  );
}

const GOV_TABS = [{ key: "board", label: "Board of Directors", n: BOARD_MEMBERS.length }, { key: "executive", label: "Executive Committee", n: EXECUTIVE_COMMITTEE.length }, { key: "responsibilities", label: "Responsibilities", n: 0 }] as const;

function Governance({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<(typeof GOV_TABS)[number]["key"]>("board");
  return (
    <>
      <button type="button" className="back" onClick={onBack}>← All investor resources</button>
      <span className="k">Corporate governance</span>
      <h2 className="t">{tab === "executive" ? "Our Executive Committee" : tab === "responsibilities" ? "Responsibilities" : "Our Board of Directors"}</h2>
      <p className="intro">{tab === "executive" ? EXEC_INTRO : tab === "responsibilities" ? "What the Board and the Executive Committee are each responsible for." : BOARD_INTRO}</p>
      <div className="tabs"><div role="tablist" aria-label="Corporate governance">
        {GOV_TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>{t.label}{t.n > 0 && <em>{t.n}</em>}</button>)}
      </div></div>
      {tab === "board" && <PersonGrid groupKey="board" noun="members of the Board" people={BOARD_MEMBERS} />}
      {tab === "executive" && <PersonGrid groupKey="executive" noun="members of the Executive Committee" people={EXECUTIVE_COMMITTEE} />}
      {tab === "responsibilities" && ["The Board", "The Executive Committee"].map((g) => (
        <div key={g}>
          <h3 className="grp">{g}</h3>
          <div className="resp">{RESPONSIBILITIES.filter((r) => r.group === g).map((r) => (
            <div key={r.title}><span className="ic"><r.icon size={20} aria-hidden="true" /></span><h4>{r.title}</h4><p>{r.text}</p></div>))}</div>
        </div>))}
    </>
  );
}

export function InvestorRelationsViewer({ isOpen, onClose }: Props) {
  const [view, setView] = useState("home");
  const [shown, setShown] = useState(0);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const page = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen || view !== "home") return;
    setShown(0);
    const timers = RESOURCES.map((_, i) => window.setTimeout(() => setShown((n) => Math.max(n, i + 1)), 90 * (i % 3) + 40 * i));
    return () => timers.forEach(window.clearTimeout);
  }, [isOpen, view]);
  if (!isOpen) return null;

  const onScroll = () => { const el = page.current, b = bar.current; if (!el || !b) return; const m = el.scrollHeight - el.clientHeight; b.style.width = `${m > 0 ? (el.scrollTop / m) * 100 : 0}%`; };
  const go = (v: string) => { setView(v); page.current?.scrollTo?.({ top: 0 }); };
  const toResources = () => document.getElementById("vi-cards")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  const res = RESOURCES.find((r) => r.key === view);

  async function subscribe() {
    const v = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(v)) { setMsg("Please enter a valid email address."); return; }
    setBusy(true); setMsg("");
    const r = await publicApi.contact({ department: "investors", name: "Investor alerts sign-up", email: v, subject: "Investor alerts sign-up", message: `Please add ${v} to VINK's investor alerts: results, announcements and reports.`, website: "" });
    setBusy(false);
    if (r.success && r.data) { setMsg(`Thank you. We have your request (reference ${r.data.ref}) and sent a confirmation to ${v}.`); setEmail(""); }
    else setMsg(r.error ?? `We could not send your request. Please email ${MAIL}.`);
  }

  return (
    <div ref={page} onScroll={onScroll} data-theme-aware className="vi fixed inset-0 z-50 flex flex-col overflow-y-auto">
      <i className="pg" ref={bar as React.RefObject<HTMLElement>} aria-hidden="true" />

      <section className="hero">
        <HeroArt />
        <div className="wrap">
          <span className="eyebrow"><i />Investor relations</span>
          <h1>Information for our stakeholders</h1>
          <p>VINK is building Southern Africa's first transport-native digital bank, with a national rollout plan for 250,000+ AFC devices across the minibus taxi network. Registered under CIPC number 2018/079316/07, VINK is building the financial infrastructure that 15 million daily commuters deserve.</p>
          <div className="cta">
            <button type="button" className="scroll" onClick={() => { go("home"); setTimeout(toResources, 50); }}><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg></i>Scroll for more</button>
            <span className="div" aria-hidden="true" />
            <button type="button" className="ar" onClick={() => go("reports")}>Annual reports {arrow}</button>
            <span className="div" aria-hidden="true" />
            <button type="button" className="ar" onClick={() => go("governance")}>Corporate governance {arrow}</button>
          </div>
        </div>
      </section>

      <main className="wrap sec" id="vi-cards">
        {view === "home" && (<>
          <div className="shead"><span className="k">Investor resources</span><h2>Everything you need to make informed decisions</h2><p>The business plan, shareholder information and announcements, all in one place. VINK is pre-launch, so these sections grow as we approach our June 2027 launch.</p></div>
          <div className="grid">
            {RESOURCES.map((r, i) => (
              <button key={r.key} type="button" className={`card${shown > i ? " in" : ""}`} onClick={() => go(r.key)}>
                <div className="im"><div className="art2"><svg viewBox="0 0 420 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CARD_ART[r.art] }} /></div>
                  <span className="bd"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={CARD_ICON[r.icon]} /></svg></span></div>
                <div className="tx"><span className="cat">{r.cat}</span><h3>{r.title}</h3><p>{r.blurb}</p><span className="more">See more {arrow}</span><span className="idx">{String(i + 1).padStart(2, "0")}</span></div>
              </button>))}
          </div>
        </>)}

        {res && (<>
          <button type="button" className="back" onClick={() => go("home")}>← All investor resources</button>
          <span className="k">{res.cat}</span>
          <h2 className="t">{res.title}</h2>
          <div className="doc">{res.body(go)}</div>
        </>)}

        {view === "governance" && <Governance onBack={() => go("home")} />}

        <div className="contact">
          <div className="ct"><span className="pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg></span>
            <div><h4>Contact us</h4><p>{ADDRESS}<br /><b>Telephone:</b> <a href={PHONE.href}>{PHONE.label}</a><br /><b>Hours:</b> Mon–Fri 08:00–17:00</p></div></div>
          <div className="ct soc"><span>Follow us on</span><div className="si">
            <a href="https://www.facebook.com/vinkwaste/" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8V6.5c0-.8.2-1.3 1.4-1.3H17V2.2C16.7 2.1 15.8 2 14.7 2 12.3 2 10.7 3.4 10.7 6v2H8v3.2h2.7V22H14V11.2h2.5L17 8z" /></svg></a>
          </div></div>
          <a className="ct enq" href={`mailto:${MAIL}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg><span className="ar2"><b>Investor enquiries</b><span>{MAIL}</span></span></a>
        </div>
      </main>

      <section className="sub"><div className="wrap in2">
        <div><span className="k">Investor alerts</span><h2>Stay informed</h2><p>Ask to receive results, announcements and reports by email as soon as they are published.</p></div>
        <form onSubmit={(e) => { e.preventDefault(); subscribe(); }} noValidate>
          <div className="fl"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" aria-label="Email address" autoComplete="email" /><button className="btn r" type="submit" disabled={busy}>{busy ? "Sending…" : "Subscribe"}</button></div>
          <p className="sm" role="status" aria-live="polite">{msg}</p>
        </form>
      </div></section>

      <button type="button" onClick={onClose} className="sr-only">Back to the home page</button>
      <Footer />
    </div>
  );
}
