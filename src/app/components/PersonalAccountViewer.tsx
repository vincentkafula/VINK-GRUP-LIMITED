import { useState } from "react";
import { X } from "lucide-react";
import { ApplyModal } from "./ApplyModal";

interface Props { isOpen: boolean; onClose: () => void }

interface Account {
  folio: string;
  name: string;
  desc: string;
  features?: string[];
  ceilingLabel: string;
  ceilingPct: number;
  price: string;
  priceSub: string;
}

const ACCOUNTS: Account[] = [
  {
    folio: "01",
    name: "Clear Access Account",
    desc: "Straightforward day-to-day banking, no monthly fee attached.",
    ceilingLabel: "R1.5m ceiling",
    ceilingPct: 49.6,
    price: "R0",
    priceSub: "/ month · turnover to R1.5m",
  },
  {
    folio: "02",
    name: "Everyday Checking Account",
    desc: "More room to move each month, still free to hold.",
    ceilingLabel: "R5m ceiling",
    ceilingPct: 59.2,
    price: "R0",
    priceSub: "/ month · turnover to R5m",
  },
  {
    folio: "03",
    name: "Prime Checking Account",
    desc: "Built for accounts that carry serious monthly volume.",
    ceilingLabel: "R500m ceiling",
    ceilingPct: 96.3,
    price: "R85",
    priceSub: "/ month · turnover to R500m",
  },
  {
    folio: "04",
    name: "Premier Checking Account",
    desc: "A tighter turnover band, geared to lower-volume activity.",
    features: [
      "Free online banking and NotifyMe alerts",
      "Suitable for all business segments and sectors",
      "Shariah-compliant option available",
    ],
    ceilingLabel: "R5,000 ceiling",
    ceilingPct: 3.7,
    price: "R170",
    priceSub: "/ month · turnover to R5,000",
  },
  {
    folio: "05",
    name: "Grain Account",
    desc: "Built for sole proprietors who need room to grow.",
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
  },
  {
    folio: "06",
    name: "Animal Account",
    desc: "The highest-capacity personal account, for all business segments and sectors.",
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
  },
];

export function PersonalAccountViewer({ isOpen, onClose }: Props) {
  const [applyProduct, setApplyProduct] = useState<{ name: string; price: string } | null>(null);
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

        .pav-hero{
          background:var(--pav-ink); color:var(--pav-text-on-ink);
          padding:88px 0 96px; position:relative; overflow:hidden;
        }
        .pav-hero::before{
          content:""; position:absolute; inset:0;
          background-image: repeating-linear-gradient(180deg, transparent, transparent 43px, var(--pav-rule-on-ink) 43px, var(--pav-rule-on-ink) 44px);
          opacity:0.5; pointer-events:none;
        }
        .pav-hero-inner{ position:relative; }
        .pav-eyebrow{
          font-family:'IBM Plex Mono', monospace; font-size:12.5px; letter-spacing:0.14em;
          text-transform:uppercase; color:var(--pav-gold);
          display:flex; align-items:center; gap:12px; margin-bottom:28px;
        }
        .pav-eyebrow::before{ content:""; width:26px; height:1px; background:var(--pav-gold-dim); display:inline-block; }
        .pav-h1{
          font-family:'Fraunces', serif; font-weight:500;
          font-size:clamp(32px, 5vw, 54px); line-height:1.08; letter-spacing:-0.01em;
          margin:0 0 26px; max-width:17ch;
        }
        .pav-h1 em{ font-style:italic; font-weight:500; color:var(--pav-gold); }
        .pav-lede{ font-size:17px; line-height:1.65; color:var(--pav-text-muted-on-ink); max-width:48ch; margin:0; }

        .pav-ledger-head{
          display:flex; justify-content:space-between; align-items:flex-end;
          padding:56px 0 22px; border-bottom:1px solid var(--pav-rule);
        }
        .pav-ledger-head h2{ font-family:'Fraunces', serif; font-weight:500; font-size:22px; margin:0; }
        .pav-scale-note{ font-family:'IBM Plex Mono', monospace; font-size:11.5px; color:var(--pav-text-muted); text-align:right; line-height:1.5; }

        .pav-row{
          display:grid; grid-template-columns: 64px 1.25fr 1.3fr 0.95fr; gap:32px;
          align-items:start; padding:38px 0; border-bottom:1px solid var(--pav-rule);
          transition:background-color 0.2s ease;
        }
        .pav-row:hover{ background:var(--pav-paper-dim); }
        .pav-folio{ font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--pav-gold-dim); letter-spacing:0.04em; padding-top:6px; }
        .pav-acct-name{ font-family:'Fraunces', serif; font-weight:500; font-size:23px; margin:0 0 8px; letter-spacing:-0.01em; }
        .pav-acct-desc{ font-size:14.5px; color:var(--pav-text-muted); line-height:1.55; margin:0 0 14px; max-width:32ch; }
        .pav-features{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
        .pav-features li{ font-size:12.8px; color:var(--pav-ink-soft); line-height:1.5; padding-left:15px; position:relative; max-width:34ch; }
        .pav-features li::before{ content:"—"; position:absolute; left:0; color:var(--pav-gold-dim); }

        .pav-gauge-label{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-text-muted); display:flex; justify-content:space-between; margin-bottom:8px; }
        .pav-gauge-label .pav-ceiling-val{ color:var(--pav-ink); font-weight:600; }
        .pav-gauge{ position:relative; height:6px; background:var(--pav-paper-dim); border-radius:3px; overflow:visible; }
        .pav-gauge-fill{ position:absolute; top:0; left:0; height:100%; background:linear-gradient(90deg, var(--pav-plum), var(--pav-gold)); border-radius:3px; }
        .pav-gauge-marker{ position:absolute; top:50%; width:11px; height:11px; border-radius:50%; background:var(--pav-ink); border:2px solid var(--pav-gold); transform:translate(-50%,-50%); }
        .pav-gauge-ticks{ display:flex; justify-content:space-between; margin-top:7px; font-family:'IBM Plex Mono', monospace; font-size:10px; color:var(--pav-text-muted); }

        .pav-price-block{ text-align:right; }
        .pav-price{ font-family:'IBM Plex Mono', monospace; font-weight:600; font-size:30px; color:var(--pav-ink); line-height:1; }
        .pav-price .pav-cur{ font-size:17px; vertical-align:top; margin-right:1px; }
        .pav-price-sub{ font-size:11.5px; color:var(--pav-text-muted); margin:6px 0 20px; font-family:'IBM Plex Mono', monospace; letter-spacing:0.02em; }
        .pav-cta-group{ display:flex; flex-direction:column; gap:9px; align-items:flex-end; }
        .pav-btn{
          display:inline-block; font-family:'IBM Plex Sans', sans-serif; font-size:13.5px; font-weight:600;
          text-decoration:none; padding:10px 20px; border-radius:2px; cursor:pointer;
          border:1px solid transparent; text-align:center; width:100%; transition:all 0.15s ease;
        }
        .pav-btn-primary{ background:var(--pav-ink); color:var(--pav-text-on-ink); }
        .pav-btn-primary:hover{ background:var(--pav-plum); }
        .pav-btn-ghost{ background:transparent; border-color:var(--pav-rule); color:var(--pav-ink); }
        .pav-btn-ghost:hover{ border-color:var(--pav-ink); }

        .pav-foot{ background:var(--pav-ink); color:var(--pav-text-muted-on-ink); padding:34px 0; font-size:12px; line-height:1.7; font-family:'IBM Plex Mono', monospace; }
        .pav-foot .pav-wrap{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .pav-foot strong{ color:var(--pav-gold); font-weight:600; }

        @media (max-width:900px){
          .pav-row{ grid-template-columns:1fr; gap:16px; padding:30px 0; }
          .pav-folio{ padding-top:0; }
          .pav-price-block{ text-align:left; }
          .pav-cta-group{ align-items:stretch; flex-direction:row; max-width:340px; }
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

      <section className="pav-hero">
        <div className="pav-wrap pav-hero-inner">
          <div className="pav-eyebrow">VINK Bank &nbsp;·&nbsp; Personal Banking</div>
          <h1 className="pav-h1">Six accounts, one ledger.<br />Find the <em>ceiling</em> that fits how money moves through your life.</h1>
          <p className="pav-lede">Every account below is measured the same way: what it costs you each month, and how much can move through it. Compare the two, and the right one is usually obvious.</p>
        </div>
      </section>

      <section className="pav-ledger-section">
        <div className="pav-wrap">
          <div className="pav-ledger-head">
            <h2>All personal accounts</h2>
            <div className="pav-scale-note">Monthly turnover ceiling<br />shown on a shared scale, R5k → R500m</div>
          </div>

          {ACCOUNTS.map((acct) => (
            <div className="pav-row" key={acct.folio}>
              <div className="pav-folio">Folio<br />No.&nbsp;{acct.folio}</div>
              <div>
                <h3 className="pav-acct-name">{acct.name}</h3>
                <p className="pav-acct-desc">{acct.desc}</p>
                {acct.features && (
                  <ul className="pav-features">
                    {acct.features.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
              </div>
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
                <div className="pav-cta-group">
                  <button className="pav-btn pav-btn-primary" onClick={() => setApplyProduct({ name: acct.name, price: acct.price })}>
                    Apply now
                  </button>
                  <button className="pav-btn pav-btn-ghost" onClick={() => setApplyProduct({ name: acct.name, price: acct.price })}>
                    See account details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="pav-foot">
        <div className="pav-wrap">
          <div><strong>VINK Bank</strong> — an Authorised Financial Services Provider and registered credit provider (NCRCP)</div>
          <div>State House Building, 8 Rose Street, Cape Town</div>
        </div>
      </footer>

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
