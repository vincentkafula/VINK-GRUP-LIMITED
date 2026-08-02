import { useState } from "react";
import { X } from "lucide-react";
import { ApplyModal } from "./ApplyModal";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (category: "creditCard" | "loan" | "invest" | "insure" | "rewards") => void }

interface Account {
  folio: string;
  name: string;
  desc: string;
  features?: string[];
  ceilingLabel: string;
  ceilingPct: number;
  price: string;
  priceSub: string;
  marketingMessage: string;
  targetCustomer: string;
  inheritsFrom?: string;
  appFeatures: string[];
}

const SUB_NAV = ["Account", "Credit Card", "Loan", "Invest", "Insure", "Rewards"];

const ROW1: Account[] = [
  {
    folio: "01",
    name: "Spark Account",
    desc: "Entry-level account — straightforward day-to-day banking, no monthly fee attached.",
    ceilingLabel: "R1.5m ceiling",
    ceilingPct: 49.6,
    price: "R0",
    priceSub: "/ month · turnover to R1.5m",
    marketingMessage: "Every great financial journey starts with a spark. Open your account in minutes and experience banking built for your future.",
    targetCustomer: "Students, first-time earners, young adults",
    appFeatures: [
      "Instant digital account opening", "Virtual debit card", "QR payments", "Spending insights",
      "Smart notifications", "Mobile airtime & bill payments", "Biometric login", "Round-up savings",
    ],
  },
  {
    folio: "02",
    name: "Anchor Account",
    desc: "Standard everyday account — more room to move each month, still free to hold.",
    ceilingLabel: "R5m ceiling",
    ceilingPct: 59.2,
    price: "R0",
    priceSub: "/ month · turnover to R5m",
    marketingMessage: "The account you can rely on every day. Fast, secure and designed to keep your life moving.",
    targetCustomer: "Salaried professionals & everyday banking",
    inheritsFrom: "Spark",
    appFeatures: [
      "Salary deposits", "Scheduled transfers", "Standing orders", "Debit card controls (freeze/unfreeze)",
      "Subscription manager", "Budget categories", "Family payments", "Digital statements",
    ],
  },
  {
    folio: "03",
    name: "Momentum Account",
    desc: "Rewards account — built for accounts that carry serious monthly volume.",
    ceilingLabel: "R500m ceiling",
    ceilingPct: 96.3,
    price: "R85",
    priceSub: "/ month · turnover to R500m",
    marketingMessage: "Every payment should move you forward. Earn rewards, unlock exclusive offers and watch your banking pay you back.",
    targetCustomer: "Active spenders & loyal customers",
    inheritsFrom: "Anchor",
    appFeatures: [
      "Cashback rewards", "Merchant discounts", "Loyalty points marketplace", "Monthly reward challenges",
      "Travel rewards", "Referral bonuses", "Premium card designs", "Spending streak achievements",
    ],
  },
];

const ROW2: Account[] = [
  {
    folio: "04",
    name: "Horizon Account",
    desc: "Savings-focused account — a tighter turnover band, geared to lower-volume activity.",
    features: [
      "Free online banking and NotifyMe alerts",
      "Suitable for all business segments and sectors",
      "Shariah-compliant option available",
    ],
    ceilingLabel: "R5,000 ceiling",
    ceilingPct: 3.7,
    price: "R170",
    priceSub: "/ month · turnover to R5,000",
    marketingMessage: "Your future deserves more than a savings account. Build wealth automatically, one goal at a time.",
    targetCustomer: "Serious savers",
    inheritsFrom: "Momentum",
    appFeatures: [
      "Goal-based savings vaults", "Auto-save rules", "High-interest savings", "Savings progress tracker",
      "Emergency fund vault", "Lock savings until a chosen date", "AI savings recommendations", "Family savings goals",
    ],
  },
  {
    folio: "05",
    name: "Summit Account",
    desc: "Premium account — built for sole proprietors who need room to grow.",
    features: [
      "35 electronic transactions included",
      "10 cash deposits/withdrawals at any VINK ATM, capped at R50,000/month",
      "Limited to sole proprietors",
      "Free online banking and NotifyMe alerts",
      "Shariah-compliant option available",
    ],
    ceilingLabel: "R500m ceiling",
    ceilingPct: 96.3,
    price: "R265",
    priceSub: "/ month · turnover to R500m",
    marketingMessage: "Reach the top with banking that works as hard as you do. Premium benefits without compromise.",
    targetCustomer: "High-income professionals & business leaders",
    inheritsFrom: "Horizon",
    appFeatures: [
      "Dedicated relationship manager", "Priority customer support (24/7)", "Airport lounge access",
      "Travel insurance integration", "Higher transaction limits", "Premium metal card",
      "Multi-currency wallets", "Early salary access",
    ],
  },
  {
    folio: "06",
    name: "Legacy Account",
    desc: "Wealth management account — the highest-capacity personal account, for all business segments and sectors.",
    features: [
      "60 electronic transactions included",
      "15 cash deposits/withdrawals at any VINK ATM, capped at R100,000/month",
      "Suitable for all business segments and sectors",
      "Free online banking and NotifyMe alerts",
      "Shariah-compliant option available",
    ],
    ceilingLabel: "R500m ceiling",
    ceilingPct: 96.3,
    price: "R415",
    priceSub: "/ month · turnover to R500m",
    marketingMessage: "Because wealth is more than money—it's the future you create for generations.",
    targetCustomer: "High-net-worth individuals & investors",
    inheritsFrom: "Summit",
    appFeatures: [
      "Investment portfolio dashboard", "Stocks & ETFs", "Bonds & treasury products", "Estate planning tools",
      "Trust account management", "Family wealth dashboard", "Tax document center", "Private banker messaging",
      "Exclusive investment opportunities offering",
    ],
  },
];

function AccountCard({ acct, onApply, onDetails }: { acct: Account; onApply: (name: string, price: string) => void; onDetails: (acct: Account) => void }) {
  return (
    <div className="pav-card">
      <div className="pav-folio">Folio No.&nbsp;{acct.folio}</div>
      <h3 className="pav-acct-name">{acct.name}</h3>
      <p className="pav-acct-desc">{acct.desc}</p>
      {acct.features && (
        <ul className="pav-features">
          {acct.features.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      <div className="pav-gauge-block">
        <div className="pav-gauge-label"><span>R5k</span><span className="pav-ceiling-val">{acct.ceilingLabel}</span></div>
        <div className="pav-gauge" aria-label={`Monthly turnover ceiling: ${acct.ceilingLabel}`}>
          <div className="pav-gauge-fill" style={{ width: `${acct.ceilingPct}%` }} />
          <div className="pav-gauge-marker" style={{ left: `${acct.ceilingPct}%` }} />
        </div>
        <div className="pav-gauge-ticks"><span>R5k</span><span>R500m</span></div>
      </div>
      <div className="pav-price-block">
        <div className="pav-price"><span className="pav-cur">R</span>{acct.price.replace("R", "")}</div>
        <div className="pav-price-sub">{acct.priceSub}</div>
      </div>
      <div className="pav-cta-group">
        <button className="pav-btn pav-btn-primary" onClick={() => onApply(acct.name, acct.price)}>
          Apply now
        </button>
        <button className="pav-btn pav-btn-secondary" onClick={() => onDetails(acct)}>
          See account details
        </button>
      </div>
    </div>
  );
}

function AccountDetailModal({ acct, onClose, onApply }: { acct: Account; onClose: () => void; onApply: (name: string, price: string) => void }) {
  return (
    <div className="pav-detail-backdrop" onClick={onClose}>
      <div className="pav-detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="pav-detail-close" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>

        <div className="pav-detail-folio">Folio No.&nbsp;{acct.folio}</div>
        <h3 className="pav-detail-name">{acct.name}</h3>

        <blockquote className="pav-detail-quote">&ldquo;{acct.marketingMessage}&rdquo;</blockquote>

        <div className="pav-detail-audience">
          <span className="pav-detail-audience-label">Best for</span>
          <span className="pav-detail-audience-value">{acct.targetCustomer}</span>
        </div>

        <div className="pav-detail-features-head">
          {acct.inheritsFrom ? <>Everything in <strong>{acct.inheritsFrom}</strong>, plus:</> : "Exclusive mobile app features"}
        </div>
        <ul className="pav-detail-features">
          {acct.appFeatures.map((f) => <li key={f}>{f}</li>)}
        </ul>

        <div className="pav-detail-price-row">
          <div>
            <div className="pav-price"><span className="pav-cur">R</span>{acct.price.replace("R", "")}</div>
            <div className="pav-price-sub">{acct.priceSub}</div>
          </div>
          <button className="pav-btn pav-btn-primary" style={{ width: "auto", padding: "12px 28px" }} onClick={() => onApply(acct.name, acct.price)}>
            Apply now
          </button>
        </div>
      </div>
    </div>
  );
}

export function PersonalAccountViewer({ isOpen, onClose, onNavigate }: Props) {
  const [applyProduct, setApplyProduct] = useState<{ name: string; price: string } | null>(null);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  if (!isOpen) return null;
  const openApply = (name: string, price: string) => setApplyProduct({ name, price });

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
        .pav-root a{ color:inherit; }
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

        /* ── Sub-nav bar ── */
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

        .pav-ledger-head{
          display:flex; justify-content:space-between; align-items:flex-end;
          padding:32px 0 22px;
        }
        .pav-ledger-head h2{ font-family:'Fraunces', serif; font-weight:500; font-size:22px; margin:0; }
        .pav-scale-note{ font-family:'IBM Plex Mono', monospace; font-size:11.5px; color:var(--pav-text-muted); text-align:right; line-height:1.5; }

        /* ── Two rows of three cards ── */
        .pav-grid{
          display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin-bottom:24px;
        }
        .pav-card{
          background:#fff; border:1px solid var(--pav-rule); border-radius:2px;
          padding:28px 26px; display:flex; flex-direction:column;
          transition:box-shadow 0.2s ease, transform 0.2s ease;
        }
        .pav-card:hover{ box-shadow:0 12px 32px rgba(29,23,64,0.1); transform:translateY(-2px); }
        .pav-folio{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:14px; }
        .pav-acct-name{ font-family:'Fraunces', serif; font-weight:500; font-size:21px; margin:0 0 8px; letter-spacing:-0.01em; }
        .pav-acct-desc{ font-size:13.5px; color:var(--pav-text-muted); line-height:1.55; margin:0 0 14px; }
        .pav-features{ list-style:none; margin:0 0 16px; padding:0; display:flex; flex-direction:column; gap:6px; }
        .pav-features li{ font-size:12.3px; color:var(--pav-ink-soft); line-height:1.5; padding-left:15px; position:relative; }
        .pav-features li::before{ content:"—"; position:absolute; left:0; color:var(--pav-gold-dim); }

        .pav-gauge-block{ margin-bottom:18px; }
        .pav-gauge-label{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-text-muted); display:flex; justify-content:space-between; margin-bottom:8px; }
        .pav-gauge-label .pav-ceiling-val{ color:var(--pav-ink); font-weight:600; }
        .pav-gauge{ position:relative; height:6px; background:var(--pav-paper-dim); border-radius:3px; overflow:visible; }
        .pav-gauge-fill{ position:absolute; top:0; left:0; height:100%; background:linear-gradient(90deg, var(--pav-plum), var(--pav-gold)); border-radius:3px; }
        .pav-gauge-marker{ position:absolute; top:50%; width:11px; height:11px; border-radius:50%; background:var(--pav-ink); border:2px solid var(--pav-gold); transform:translate(-50%,-50%); }
        .pav-gauge-ticks{ display:flex; justify-content:space-between; margin-top:7px; font-family:'IBM Plex Mono', monospace; font-size:10px; color:var(--pav-text-muted); }

        .pav-price-block{ margin-top:auto; margin-bottom:16px; }
        .pav-price{ font-family:'IBM Plex Mono', monospace; font-weight:600; font-size:28px; color:var(--pav-ink); line-height:1; }
        .pav-price .pav-cur{ font-size:16px; vertical-align:top; margin-right:1px; }
        .pav-price-sub{ font-size:11px; color:var(--pav-text-muted); margin:6px 0 0; font-family:'IBM Plex Mono', monospace; letter-spacing:0.02em; }
        .pav-cta-group{ display:flex; flex-direction:row; gap:9px; }
        .pav-btn{
          display:inline-block; font-family:'IBM Plex Sans', sans-serif; font-size:13.5px; font-weight:600;
          text-decoration:none; padding:10px 20px; border-radius:2px; cursor:pointer;
          border:1px solid transparent; text-align:center; width:100%; transition:all 0.15s ease;
        }
        .pav-btn-primary{ background:var(--pav-ink); color:var(--pav-text-on-ink); }
        .pav-btn-primary:hover{ background:var(--pav-plum); }
        .pav-btn-secondary{ background:transparent; color:var(--pav-ink); border-color:var(--pav-rule); }
        .pav-btn-secondary:hover{ background:var(--pav-paper-dim); border-color:var(--pav-gold-dim); }

        /* ── Account detail modal ── */
        .pav-detail-backdrop{
          position:fixed; inset:0; z-index:70; background:rgba(29,23,64,0.55);
          display:flex; align-items:center; justify-content:center; padding:20px;
        }
        .pav-detail-card{
          position:relative; background:#fff; max-width:520px; width:100%; max-height:88vh; overflow-y:auto;
          border-radius:4px; padding:40px 36px 32px; box-shadow:0 30px 80px rgba(29,23,64,0.35);
        }
        .pav-detail-close{
          position:absolute; top:16px; right:16px; width:32px; height:32px; border-radius:50%;
          background:var(--pav-paper); color:var(--pav-ink); border:1px solid var(--pav-rule);
          display:flex; align-items:center; justify-content:center; cursor:pointer;
        }
        .pav-detail-close:hover{ background:var(--pav-paper-dim); }
        .pav-detail-folio{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:10px; }
        .pav-detail-name{ font-family:'Fraunces', serif; font-weight:500; font-size:26px; margin:0 0 18px; letter-spacing:-0.01em; }
        .pav-detail-quote{
          margin:0 0 20px; padding:16px 0 16px 18px; border-left:3px solid var(--pav-gold);
          font-family:'Fraunces', serif; font-style:italic; font-size:16px; line-height:1.55; color:var(--pav-ink-soft);
        }
        .pav-detail-audience{
          display:flex; align-items:baseline; gap:8px; margin-bottom:26px; padding-bottom:20px;
          border-bottom:1px solid var(--pav-rule);
        }
        .pav-detail-audience-label{ font-family:'IBM Plex Mono', monospace; font-size:10.5px; text-transform:uppercase; letter-spacing:0.06em; color:var(--pav-text-muted); }
        .pav-detail-audience-value{ font-size:13.5px; font-weight:600; color:var(--pav-ink); }
        .pav-detail-features-head{ font-size:13px; font-weight:600; color:var(--pav-ink); margin-bottom:12px; }
        .pav-detail-features-head strong{ color:var(--pav-plum); }
        .pav-detail-features{ list-style:none; margin:0 0 28px; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
        .pav-detail-features li{ font-size:12.8px; color:var(--pav-ink-soft); line-height:1.5; padding-left:16px; position:relative; }
        .pav-detail-features li::before{ content:"✓"; position:absolute; left:0; color:var(--pav-gold-dim); font-weight:600; }
        .pav-detail-price-row{ display:flex; align-items:center; justify-content:space-between; padding-top:22px; border-top:1px solid var(--pav-rule); }
        @media (max-width:480px){
          .pav-detail-features{ grid-template-columns:1fr; }
          .pav-detail-price-row{ flex-direction:column; align-items:flex-start; gap:16px; }
        }

        .pav-foot{ background:var(--pav-ink); color:var(--pav-text-muted-on-ink); padding:34px 0; font-size:12px; line-height:1.7; font-family:'IBM Plex Mono', monospace; }
        .pav-foot .pav-wrap{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .pav-foot strong{ color:var(--pav-gold); font-weight:600; }

        @media (max-width:900px){
          .pav-grid{ grid-template-columns:1fr; }
          .pav-ledger-head{ flex-direction:column; align-items:flex-start; gap:10px; }
          .pav-scale-note{ text-align:left; }
        }
        @media (prefers-reduced-motion:reduce){
          .pav-root *{ transition:none !important; }
        }
      `}</style>

      <button className="pav-close" onClick={onClose} aria-label="Close">
        <X className="w-4 h-4" />
      </button>

      <nav className="pav-subnav">
        <div className="pav-subnav-inner">
          {SUB_NAV.map((item) => (
            <button
              key={item}
              className={`pav-subnav-item${item === "Account" ? " active" : ""}`}
              onClick={() => {
                if (item === "Account") return;
                const map: Record<string, "creditCard" | "loan" | "invest" | "insure" | "rewards"> = {
                  "Credit Card": "creditCard", "Loan": "loan", "Invest": "invest", "Insure": "insure", "Rewards": "rewards",
                };
                onNavigate(map[item]);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>

      <section className="pav-ledger-section">
        <div className="pav-wrap">
          <div className="pav-ledger-head">
            <h2>All personal accounts</h2>
            <div className="pav-scale-note">Monthly turnover ceiling<br />shown on a shared scale, R5k → R500m</div>
          </div>

          <div className="pav-grid">
            {ROW1.map((acct) => <AccountCard key={acct.folio} acct={acct} onApply={openApply} onDetails={setDetailAccount} />)}
          </div>
          <div className="pav-grid">
            {ROW2.map((acct) => <AccountCard key={acct.folio} acct={acct} onApply={openApply} onDetails={setDetailAccount} />)}
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
          acct={detailAccount}
          onClose={() => setDetailAccount(null)}
          onApply={(name, price) => { setDetailAccount(null); openApply(name, price); }}
        />
      )}

      {applyProduct && (
        <ApplyModal
          isOpen={!!applyProduct}
          onClose={() => setApplyProduct(null)}
          product={applyProduct.name}
          price={applyProduct.price}
        />
      )}
    </div>
  );
}
