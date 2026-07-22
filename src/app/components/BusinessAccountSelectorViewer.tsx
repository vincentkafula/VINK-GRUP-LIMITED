import { X } from "lucide-react";

type NavItem = "Start My Business" | "Accounts" | "Credit Cards" | "Loans" | "Invest" | "Insure" | "Manage My Business" | "International" | "Studio" | "News";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (item: NavItem) => void;
  onApply: (accountType: string) => void;
}

const SUB_NAV: NavItem[] = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Insure", "Manage My Business", "International", "Studio", "News"];

// These are the exact 6 account types already defined inside
// BusinessAccountApplicationViewer's own Step 7 — surfaced here as a
// browsable catalog instead of jumping straight into the application form.
// No pricing/feature data exists for these anywhere in the codebase, so
// descriptions are kept to honest, generic summaries rather than inventing
// numbers.
const ACCOUNTS: { name: string; desc: string }[] = [
  { name: "Business Current Account",  desc: "Everyday transactional banking for day-to-day business expenses, payments and payroll." },
  { name: "Business Savings Account",  desc: "Grow your business reserves in an interest-bearing account while keeping funds accessible." },
  { name: "Business Premium Account",  desc: "Enhanced day-to-day banking with additional features built for growing businesses." },
  { name: "Business Platinum Account", desc: "VINK's top-tier business account, for businesses that need the fullest feature set." },
  { name: "Foreign Currency Account",  desc: "Hold and transact in USD, EUR, GBP or ZMW alongside your primary ZAR account." },
  { name: "Corporate Treasury Account",desc: "A structured account built for corporate cash management and treasury operations." },
];

export function BusinessAccountSelectorViewer({ isOpen, onClose, onNavigate, onApply }: Props) {
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
          background:var(--pav-ink); color:var(--pav-text-on-ink); margin-top:auto;
        }
        .pav-btn:hover{ background:var(--pav-plum); }

        .pav-foot{ background:var(--pav-ink); color:var(--pav-text-muted-on-ink); padding:34px 0; font-size:12px; line-height:1.7; font-family:'IBM Plex Mono', monospace; }
        .pav-foot .pav-wrap{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .pav-foot strong{ color:var(--pav-gold); font-weight:600; }

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
          <div className="pav-ledger-head">
            <h2>All business accounts</h2>
            <p>Business Banking · Accounts</p>
          </div>

          <div className="pav-grid">
            {ACCOUNTS.map((a, i) => (
              <div key={a.name} className="pav-card">
                <div className="pav-folio">Folio No.&nbsp;{String(i + 1).padStart(2, "0")}</div>
                <h3 className="pav-acct-name">{a.name}</h3>
                <p className="pav-acct-desc">{a.desc}</p>
                <button className="pav-btn" onClick={() => onApply(a.name)}>Apply now</button>
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
    </div>
  );
}
