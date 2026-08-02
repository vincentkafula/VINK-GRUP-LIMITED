import { useState } from "react";
import { X } from "lucide-react";

type NavItem = "Start My Business" | "Accounts" | "Credit Cards" | "Loans" | "Invest" | "Insure" | "Manage My Business" | "International" | "Studio" | "News";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (item: NavItem) => void;
  onApply: (accountType: string) => void;
  onOpenApp: () => void;
}

const SUB_NAV: NavItem[] = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Insure", "Manage My Business", "International", "Studio", "News"];

// These are the exact 6 account types already defined inside
// BusinessAccountApplicationViewer's own Step 7 — surfaced here as a
// browsable catalog instead of jumping straight into the application form.
// No pricing/feature data exists for these anywhere in the codebase, so
// descriptions are kept to honest, generic summaries rather than inventing
// numbers.
const ACCOUNTS: { name: string; desc: string; tagline: string; description: string; perfectFor: string[] }[] = [
  {
    name: "Launch Business Account",
    desc: "For starting a new business — built for startups, freelancers and sole traders.",
    tagline: "Where Great Businesses Begin.",
    description: "The Launch Business Account is designed for entrepreneurs, startups, freelancers, and newly registered businesses taking their first steps. Open your account in minutes and access everything you need to manage payments, receive customer funds, pay suppliers, and build a strong financial foundation. As your business grows, your banking grows with you.",
    perfectFor: ["Startups", "Freelancers", "Sole proprietors", "Small home businesses"],
  },
  {
    name: "Forge Business Account",
    desc: "For building and growing operations — designed for small businesses.",
    tagline: "Build with Confidence.",
    description: "The Forge Business Account empowers growing businesses with smarter financial management tools. From payroll and supplier payments to expense tracking and multiple user access, Forge gives business owners complete control over daily operations while laying the groundwork for long-term success.",
    perfectFor: ["Small businesses", "Retail stores", "Restaurants", "Service providers", "Growing companies"],
  },
  {
    name: "Catalyst Business Account",
    desc: "For accelerating growth — designed for growing SMEs.",
    tagline: "Accelerate Every Opportunity.",
    description: "The Catalyst Business Account is built for ambitious businesses ready to scale. Unlock advanced payment solutions, business rewards, cash flow insights, invoicing, and higher transaction limits that help you expand faster while keeping your finances organized and efficient.",
    perfectFor: ["Growing SMEs", "E-commerce businesses", "Expanding service companies", "Multi-location businesses"],
  },
  {
    name: "Pinnacle Business Account",
    desc: "For established businesses — designed for medium-sized companies.",
    tagline: "Business at Its Highest Level.",
    description: "The Pinnacle Business Account is designed for established companies that require premium banking services and operational efficiency. Enjoy priority support, advanced treasury tools, higher payment limits, and dedicated business banking services that help your organization operate with confidence.",
    perfectFor: ["Medium-sized enterprises", "Manufacturing companies", "Logistics businesses", "Established corporations"],
  },
  {
    name: "Empire Business Account",
    desc: "For large enterprises — designed for corporates and multi-location businesses.",
    tagline: "Powering Businesses Without Limits.",
    description: "The Empire Business Account delivers enterprise-grade banking for large organizations managing complex financial operations. Handle high-value transactions, multiple branches, international payments, corporate expense management, and advanced cash flow solutions — all from one secure platform.",
    perfectFor: ["Large enterprises", "National corporations", "Multi-branch organizations", "International trading companies"],
  },
  {
    name: "Sovereign Business Account",
    desc: "Elite corporate and private business banking — for large corporations, family offices and multinational businesses.",
    tagline: "Private Corporate Banking for Industry Leaders.",
    description: "The Sovereign Business Account is our most exclusive banking solution, created for corporations, family offices, investment firms, and high-value organizations. Benefit from dedicated relationship managers, tailored financial solutions, investment services, treasury management, foreign exchange support, and personalized banking designed around your business strategy.",
    perfectFor: ["Multinational corporations", "Investment firms", "Family offices", "Conglomerates", "High-net-worth business owners"],
  },
];

type BizAccount = (typeof ACCOUNTS)[number];

function AccountDetailModal({ acct, folio, onClose, onApply }: { acct: BizAccount; folio: string; onClose: () => void; onApply: (name: string) => void }) {
  return (
    <div className="pav-detail-backdrop" onClick={onClose}>
      <div className="pav-detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="pav-detail-close" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        <div className="pav-detail-folio">Folio No.&nbsp;{folio}</div>
        <h3 className="pav-detail-name">{acct.name}</h3>
        <p className="pav-detail-tagline">{acct.tagline}</p>
        <p className="pav-detail-desc">{acct.description}</p>
        <div className="pav-detail-features-head">Perfect for:</div>
        <ul className="pav-detail-features">
          {acct.perfectFor.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <button className="pav-btn" onClick={() => onApply(acct.name)}>Apply now</button>
      </div>
    </div>
  );
}

export function BusinessAccountSelectorViewer({ isOpen, onClose, onNavigate, onApply, onOpenApp }: Props) {
  const [detailAccount, setDetailAccount] = useState<{ acct: BizAccount; folio: string } | null>(null);
  if (!isOpen) return null;

  return (
    <div className="pav-root fixed inset-0 z-50 overflow-y-auto">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .pav-root{
          --pav-ink:        #1D1740;
          --pav-ink-soft:   #2A2358;
          --pav-paper:      #F2EFF9;
          --pav-paper-dim:  #E7E2F3;
          --pav-gold:       #C6A15B;
          --pav-gold-dim:   #9C7F49;
          --pav-plum:       #6B4FA0;
          --pav-text-on-ink: #EDE9FA;
          --pav-text-muted-on-ink: #A79CD1;
          --pav-text-body:  #2A2140;
          --pav-text-muted: #6E6690;
          --pav-rule:       rgba(29,23,64,0.14);
          --pav-rule-on-ink: rgba(237,233,250,0.18);
          background: var(--pav-paper);
          color: var(--pav-text-body);
          font-family: 'IBM Plex Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .pav-root :focus-visible{ outline:2px solid var(--pav-gold); outline-offset:3px; }
        .pav-wrap{ max-width:1160px; margin:0 auto; padding:0 32px; }

        .pav-close{
          position:fixed; top:20px; right:20px; z-index:60;
          background:rgba(29,23,64,0.55); color:#EDE9FA;
          border:1px solid rgba(237,233,250,0.3); border-radius:999px;
          width:38px; height:38px; display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition:background 0.15s ease;
        }
        .pav-close:hover{ background:rgba(29,23,64,0.85); }

        .pav-subnav{ background:var(--pav-ink); border-bottom:1px solid var(--pav-rule-on-ink); }
        .pav-subnav-inner{
          display:flex; align-items:center; gap:4px; overflow-x:auto;
          padding:0 32px; max-width:1160px; margin:0 auto; height:46px;
        }
        .pav-subnav-item{
          font-family:'IBM Plex Mono', monospace; font-size:12.5px; white-space:nowrap;
          padding:8px 16px; border-radius:2px; text-decoration:none; cursor:pointer;
          color:var(--pav-text-muted-on-ink); background:transparent; border:none;
          transition:color 0.15s ease, background 0.15s ease;
        }
        .pav-subnav-item:hover{ color:var(--pav-text-on-ink); }
        .pav-subnav-item.active{ color:var(--pav-gold); background:rgba(198,161,91,0.12); font-weight:600; }

        .pav-ledger-head{ padding:32px 0 22px; }
        .pav-ledger-head h2{ font-family:'Fraunces', serif; font-weight:500; font-size:22px; margin:0; }
        .pav-ledger-head p{ font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--pav-text-muted); margin:6px 0 0; }

        .pav-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin-bottom:24px; }
        .pav-card{
          background:#fff; border:1px solid var(--pav-rule); border-radius:2px;
          padding:28px 26px; display:flex; flex-direction:column;
          transition:box-shadow 0.2s ease, transform 0.2s ease;
        }
        .pav-card:hover{ box-shadow:0 12px 32px rgba(29,23,64,0.1); transform:translateY(-2px); }
        .pav-folio{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:14px; }
        .pav-acct-name{ font-family:'Fraunces', serif; font-weight:500; font-size:20px; margin:0 0 10px; letter-spacing:-0.01em; }
        .pav-acct-desc{ font-size:13.5px; color:var(--pav-text-muted); line-height:1.6; margin:0 0 22px; flex:1; }
        .pav-btn{
          display:inline-block; font-family:'IBM Plex Sans', sans-serif; font-size:13.5px; font-weight:600;
          padding:10px 20px; border-radius:2px; cursor:pointer;
          border:1px solid transparent; text-align:center; width:100%; transition:all 0.15s ease;
          background:var(--pav-ink); color:var(--pav-text-on-ink);
        }
        .pav-btn:hover{ background:var(--pav-plum); }
        .pav-cta-group{ display:flex; flex-direction:column; gap:9px; margin-top:auto; }
        .pav-btn-secondary{ background:transparent; color:var(--pav-ink); border-color:var(--pav-rule); }
        .pav-btn-secondary:hover{ background:var(--pav-paper-dim); border-color:var(--pav-gold-dim); }

        .pav-foot{ background:var(--pav-ink); color:var(--pav-text-muted-on-ink); padding:34px 0; font-size:12px; line-height:1.7; font-family:'IBM Plex Mono', monospace; }
        .pav-foot .pav-wrap{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .pav-foot strong{ color:var(--pav-gold); font-weight:600; }

        /* ── Account detail modal ── */
        .pav-detail-backdrop{ position:fixed; inset:0; z-index:70; background:rgba(29,23,64,0.55); display:flex; align-items:center; justify-content:center; padding:20px; }
        .pav-detail-card{ position:relative; background:#fff; max-width:540px; width:100%; max-height:88vh; overflow-y:auto; border-radius:4px; padding:40px 36px 32px; box-shadow:0 30px 80px rgba(29,23,64,0.35); }
        .pav-detail-close{ position:absolute; top:16px; right:16px; width:32px; height:32px; border-radius:50%; background:var(--pav-paper); color:var(--pav-ink); border:1px solid var(--pav-rule); display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .pav-detail-close:hover{ background:var(--pav-paper-dim); }
        .pav-detail-folio{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:10px; }
        .pav-detail-name{ font-family:'Fraunces', serif; font-weight:500; font-size:26px; margin:0 0 8px; letter-spacing:-0.01em; }
        .pav-detail-tagline{ font-family:'Fraunces', serif; font-style:italic; font-size:15px; color:var(--pav-plum); margin:0 0 20px; }
        .pav-detail-desc{ font-size:13.5px; line-height:1.7; color:var(--pav-ink-soft); margin:0 0 26px; padding-bottom:26px; border-bottom:1px solid var(--pav-rule); }
        .pav-detail-features-head{ font-size:13px; font-weight:600; color:var(--pav-ink); margin-bottom:12px; }
        .pav-detail-features{ list-style:none; margin:0 0 28px; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
        .pav-detail-features li{ font-size:12.8px; color:var(--pav-ink-soft); line-height:1.5; padding-left:16px; position:relative; }
        .pav-detail-features li::before{ content:"✓"; position:absolute; left:0; color:var(--pav-gold-dim); font-weight:600; }
        @media (max-width:480px){ .pav-detail-features{ grid-template-columns:1fr; } }

        @media (max-width:900px){ .pav-grid{ grid-template-columns:1fr; } }
        @media (prefers-reduced-motion:reduce){ .pav-root *{ transition:none !important; } }
      `}</style>

      <button className="pav-close" onClick={onClose} aria-label="Close">
        <X className="w-4 h-4" />
      </button>

      <nav className="pav-subnav">
        <div className="pav-subnav-inner">
          {SUB_NAV.map((item) => (
            <button
              key={item}
              className={`pav-subnav-item${item === "Accounts" ? " active" : ""}`}
              onClick={() => item === "Accounts" ? undefined : onNavigate(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>

      <section className="pav-ledger-section">
        <div className="pav-wrap">
          <div className="pav-ledger-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2>All business accounts</h2>
              <p>Business Banking · Accounts</p>
            </div>
            <button onClick={onOpenApp} className="pav-btn" style={{ width: "auto", padding: "10px 20px", marginBottom: "2px" }}>
              Try the Business App
            </button>
          </div>

          <div className="pav-grid">
            {ACCOUNTS.map((a, i) => (
              <div key={a.name} className="pav-card">
                <div className="pav-folio">Folio No.&nbsp;{String(i + 1).padStart(2, "0")}</div>
                <h3 className="pav-acct-name">{a.name}</h3>
                <p className="pav-acct-desc">{a.desc}</p>
                <div className="pav-cta-group">
                  <button className="pav-btn" onClick={() => onApply(a.name)}>Apply now</button>
                  <button className="pav-btn pav-btn-secondary" onClick={() => setDetailAccount({ acct: a, folio: String(i + 1).padStart(2, "0") })}>See account details</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="pav-foot">
        <div className="pav-wrap">
          <div><strong>VINK Bank</strong> — an Authorised Financial Services Provider and registered credit provider (NCRCP)</div>
          <div>State House Building, 8 Rose Street, Cape Town</div>
        </div>
      </footer>

      {detailAccount && (
        <AccountDetailModal
          acct={detailAccount.acct}
          folio={detailAccount.folio}
          onClose={() => setDetailAccount(null)}
          onApply={(name) => { setDetailAccount(null); onApply(name); }}
        />
      )}
    </div>
  );
}
