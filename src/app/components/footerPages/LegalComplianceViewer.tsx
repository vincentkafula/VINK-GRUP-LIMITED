import { useState, useEffect, useMemo, type ReactNode } from "react";
import { Footer } from "../Footer";
import "./legal.css";

interface Props { isOpen: boolean; onClose: () => void; initialTab?: string; }

/** The icon paths of the design, one per document. */
const ICONS: Record<string, string> = {
  scale: "M12 3v18M5 21h14M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z", shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7", mon: "M3 4h18v12H3zM8 20h8M12 16v4", cookie: "M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-5-5zM8 11h.01M12 16h.01M15 13h.01",
  badge: "M12 2l3 2 4 .5.5 4 2 3-2 3-.5 4-4 .5-3 2-3-2-4-.5-.5-4-2-3 2-3 .5-4 4-.5zM8.5 12l2.5 2.5 4.5-5", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  brief: "M3 8h18v12H3zM9 8V5h6v3M3 13h18", id: "M3 5h18v14H3zM7 10h4M7 14h4M15 10h2M15 14h2", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  doc: "M6 2h8l5 5v15H6zM14 2v5h5M9 13h7M9 17h5", over: "M9 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M15 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0",
};
const Svg = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;

const MAIL = "compliance@vink.co.za";
const Mail = ({ to = MAIL }: { to?: string }) => <a href={`mailto:${to}`}>{to}</a>;

/** The documents VINK has published today. The others are listed, and say plainly that they are not published yet. */
const PUBLISHED: Record<string, { body: ReactNode }> = {
  privacy: { body: (<>
    <h3>POPIA Privacy Notice</h3>
    <p>VINK collects personal information including your name, ID number, contact details, and transaction history for the purposes of providing financial services, fraud prevention, and regulatory compliance.</p>
    <p>Your data is stored securely, <strong>never sold to third parties</strong>, and retained only for as long as required by law (generally 5 years from the end of the customer relationship).</p>
    <h3>Your right to access personal information</h3>
    <p>You have the right to access, correct, or request deletion of your personal information. Contact our Information Officer at <Mail to="privacy@vink.co.za" />.</p>
    <p>VINK complies fully with the <strong>Protection of Personal Information Act (POPIA), Act 4 of 2013</strong>.</p></>) },
  terms: { body: (<>
    <p>The VINK website and mobile application are provided for <strong>lawful personal and business use only</strong>.</p>
    <p>Unauthorised access, scraping, reverse engineering, or use of VINK intellectual property without written permission is prohibited.</p>
    <p>VINK reserves the right to suspend access to any user who breaches these terms. Full terms available at <strong>vink.co.za/terms</strong>.</p>
    <p>By using this platform you agree to comply with all applicable South African laws, including but not limited to the Electronic Communications and Transactions Act (ECTA) and the Financial Intelligence Centre Act (FICA).</p></>) },
  regulatory: { body: (<>
    <h3>Banking regulations</h3>
    <p>VINK operates in accordance with:</p>
    <ul>
      <li><strong>Financial Sector Regulation Act (FSRA), 2017</strong></li>
      <li><strong>National Credit Act (NCA), 2005</strong></li>
      <li><strong>Financial Intelligence Centre Act (FICA), 2001</strong></li>
      <li><strong>Protection of Personal Information Act (POPIA), 2013</strong></li>
      <li><strong>Electronic Communications and Transactions Act (ECTA), 2002</strong></li>
    </ul>
    <p>Vink Group (Pty) Ltd. is registered with the <strong>Companies and Intellectual Property Commission (CIPC)</strong> under registration number <strong>2018/079316/07</strong>.</p>
    <p>FSP and NCRCP registration numbers will be published upon completion of the licensing process. Regulatory enquiries: <Mail />.</p>
    <h3>Company details</h3>
    <dl>
      <dt>Company name</dt><dd>Vink Group (Pty) Ltd.</dd>
      <dt>Trading as</dt><dd>VINK</dd>
      <dt>Registration number</dt><dd>2018/079316/07</dd>
      <dt>VINK tax number</dt><dd>9475452232</dd>
      <dt>VINK reference number</dt><dd>9465919196</dd>
      <dt>Registered address</dt><dd>8 Rose Street, Cape Town CBD, State House Building, Cape Town, 8001</dd>
      <dt>BBBEE status</dt><dd>100% Black-Owned Enterprise</dd>
    </dl></>) },
  fica: { body: (<>
    <h3>Anti-money laundering</h3>
    <p>VINK applies a zero-tolerance policy to money laundering and terrorist financing. All suspicious transactions are reported to the Financial Intelligence Centre (FIC) as required by FICA.</p>
    <h3>Customer due diligence</h3>
    <p>VINK conducts FICA-compliant Know Your Customer (KYC) verification for all account holders, including identity verification, address verification, and ongoing transaction monitoring.</p>
    <p>For compliance enquiries: <Mail />.</p></>) },
};

interface Doc { title: string; icon: string; key: string; published?: keyof typeof PUBLISHED }
const DOCS: Doc[] = [
  { title: "Banking Code of Conduct", icon: "scale", key: "code" },
  { title: "FAIS Disclosure", icon: "shield", key: "fais" },
  { title: "Terms of use", icon: "doc", key: "terms", published: "terms" },
  { title: "Privacy statement", icon: "lock", key: "privacy", published: "privacy" },
  { title: "Conflict of Interest", icon: "over", key: "conflict" },
  { title: "Email disclaimer", icon: "mail", key: "email" },
  { title: "Browser requirements", icon: "mon", key: "browser" },
  { title: "Cookies policy", icon: "cookie", key: "cookies" },
  { title: "Regulatory declaration", icon: "badge", key: "regulatory", published: "regulatory" },
  { title: "Personal client agreement", icon: "user", key: "personal" },
  { title: "Business client agreement", icon: "brief", key: "business" },
  { title: "FICA information", icon: "id", key: "fica", published: "fica" },
  { title: "Your right to access personal information", icon: "eye", key: "access", published: "privacy" },
];
const HOME_TITLE = "Legal and compliance";
const TABS = [{ key: "home", label: HOME_TITLE }, { key: "code", label: "Banking Code of Conduct" }, { key: "fais", label: "FAIS Disclosure" }];

/** The footer opens this page with a key: the old names still work. "compliance" is the list; the others open that document. */
const openingView = (tab?: string): string => (!tab || tab === "compliance" ? "home" : tab);

const goto = (label: string) => window.dispatchEvent(new CustomEvent("vink:footer-link", { detail: { label } }));

function HeroArt() {
  return (
    <div className="art"><svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="vl-pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#e7ebf4" /></linearGradient>
        <linearGradient id="vl-pen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#05091a" /><stop offset=".5" stopColor="#2b3556" /><stop offset="1" stopColor="#05091a" /></linearGradient>
        <linearGradient id="vl-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c8102e" /><stop offset=".55" stopColor="#c8102e" stopOpacity="0" /></linearGradient>
        <filter id="vl-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#2a0008" floodOpacity=".45" /></filter>
      </defs>
      <circle cx="470" cy="150" r="170" fill="#ffffff" opacity=".07" /><circle cx="470" cy="150" r="115" fill="#ffffff" opacity=".07" />
      <g filter="url(#vl-sh)">
        <rect x="250" y="120" width="300" height="190" rx="10" fill="url(#vl-pg)" transform="rotate(-9 400 215)" opacity=".9" />
        <rect x="290" y="108" width="300" height="200" rx="10" fill="url(#vl-pg)" transform="rotate(4 440 208)" />
      </g>
      <g stroke="#c3cadc" strokeWidth="4" strokeLinecap="round"><path d="M330 160h190M330 182h150M330 204h170M330 226h120" /></g>
      <rect x="330" y="248" width="86" height="10" rx="5" fill="#c8102e" opacity=".85" />
      <g transform="translate(500 60)"><circle r="34" fill="#c8102e" /><circle r="26" fill="none" stroke="#fff" strokeWidth="2" opacity=".7" /><path d="M-11 -2l8 9 15-17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></g>
      <g filter="url(#vl-sh)"><path d="M392 46l56 52-9 9-62-46z" fill="url(#vl-pen)" transform="rotate(8 420 76)" /><path d="M356 112l20-10 8 8-18 16z" fill="#aeb6cc" transform="rotate(8 420 76)" /></g>
      <rect width="640" height="320" fill="url(#vl-fade)" />
    </svg></div>
  );
}

export function LegalComplianceViewer({ isOpen, onClose, initialTab }: Props) {
  const [view, setView] = useState(openingView(initialTab));
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(0);                      // how many cards have faded in
  useEffect(() => { if (isOpen) setView(openingView(initialTab)); }, [isOpen, initialTab]);
  useEffect(() => {
    if (!isOpen || view !== "home") return;
    setShown(0);
    const timers = DOCS.map((_, i) => window.setTimeout(() => setShown((n) => Math.max(n, i + 1)), 40 * i));
    return () => timers.forEach(window.clearTimeout);
  }, [isOpen, view]);
  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => DOCS.filter((d) => d.title.toLowerCase().includes(needle)), [needle]);
  if (!isOpen) return null;

  const doc = DOCS.find((d) => d.key === view);
  const tabOn = view === "code" || view === "fais" ? view : "home";
  const published = doc?.published ? PUBLISHED[doc.published] : null;
  const open = (key: string) => { setView(key); document.getElementById("vl-top")?.scrollTo?.({ top: 0 }); };

  return (
    <div id="vl-top" data-theme-aware className="vl fixed inset-0 z-50 flex flex-col overflow-y-auto">
      <section className="hero">
        <HeroArt />
        <div className="wrap">
          <span className="eyebrow"><i />Legal and compliance</span>
          <h1>Building trust through responsible banking</h1>
          <p>We are committed to the highest standards of ethics, integrity and compliance in everything we do.</p>
        </div>
      </section>

      <div className="tabs"><div className="wrap" role="tablist" aria-label="Legal and compliance">
        {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tabOn === t.key} className={tabOn === t.key ? "on" : ""} onClick={() => open(t.key)}>{t.label}</button>)}
      </div></div>

      <div className="wrap">
        <nav className="crumb" aria-label="Breadcrumb">
          <button type="button" onClick={onClose}>Home</button><span>/</span>
          {view === "home" ? HOME_TITLE : <><button type="button" onClick={() => open("home")}>{HOME_TITLE}</button><span>/</span>{doc?.title ?? HOME_TITLE}</>}
        </nav>
        <div className="main">
          <section>
            {view === "home" ? (<>
              <h2 className="h">Legal and compliance</h2>
              <p className="lead">Access our key legal and compliance documents. These resources help you understand our policies, your rights and our commitment to responsible banking.</p>
              <div className="bar">
                <label className="find"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                  <input type="search" placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                <span className="count" aria-live="polite">{matches.length}{matches.length === 1 ? " document" : " documents"}</span>
              </div>
              <div className="grid">
                {matches.map((d) => (
                  <button key={d.key} type="button" className={`card${shown > DOCS.indexOf(d) ? " in" : ""}`} onClick={() => open(d.key)}>
                    <span className="ic"><Svg d={ICONS[d.icon]} /></span><span>{d.title}</span><span className="arr"><i /></span>
                  </button>))}
              </div>
              {matches.length === 0 && <div className="empty">No documents match your search.</div>}
            </>) : (<>
              <button type="button" className="back" onClick={() => open("home")}>← All legal and compliance documents</button>
              <h2 className="h">{doc?.title ?? HOME_TITLE}</h2>
              {published ? (<><p className="lead" style={{ marginBottom: 20 }}>VINK — a division of Vink Group (Pty) Ltd. · Reg: 2018/079316/07</p><div className="doc">{published.body}</div></>) : (<>
                <p className="lead" style={{ marginBottom: 20 }}>This document is not published yet.</p>
                <div className="doc soon">
                  <span className="ic"><Svg d={ICONS[doc?.icon ?? "doc"]} /></span>
                  <div>
                    <p><strong>{doc?.title}</strong> will be published here before VINK launches. VINK is not yet in full operation, and its licensing and registrations are still being completed.</p>
                    <p style={{ marginBottom: 0 }}>To ask for a copy or ask a question, email <Mail />.</p>
                  </div>
                </div></>)}
            </>)}
          </section>

          <aside className="help" aria-label="Need more help?">
            <div className="big"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H4zM17 14h3v5h-3zM20 19c0 2-3 3-6 3" /></svg></div>
            <h3>Need more help?</h3>
            <p>If you have any questions about our legal and compliance documents, we're here to assist you.</p>
            <a className="row" href="tel:+27210095100"><span className="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg></span><div><b>Call us</b><span className="m">+27 (0)21 009 5100</span></div></a>
            <a className="row" href={`mailto:${MAIL}`}><span className="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg></span><div><b>Email us</b><span className="m">{MAIL}</span></div></a>
            <button type="button" className="row" onClick={() => goto("Find the Branch")}><span className="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg></span><div><b>Visit a branch</b><span className="m">Find a branch near you</span></div></button>
            <button type="button" className="btn r" onClick={() => goto("Contact Us")}>Get in touch <span aria-hidden="true">→</span></button>
          </aside>
        </div>

        <div className="note"><span className="i" aria-hidden="true">i</span><div><b>Please note:</b>
          <p>To provide our products and services, we collaborate with other companies, some of which may use our branding. Our Privacy Policy does not apply to these companies' websites. For their privacy policies, please refer to the respective service provider's site.</p>
          <p>This content is for information only and is not legal advice. VINK is not yet in full operation, and its legal documents are reviewed by a qualified South African attorney before they are published.</p></div></div>
      </div>

      <Footer />
    </div>
  );
}
