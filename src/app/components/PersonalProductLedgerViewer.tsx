import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CATEGORY_CONFIG, PRODUCTS, type Product, type ProductCategory } from "./ProductSelectorViewer";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialCategory: Exclude<ProductCategory, "account" | "sim">;
  onNavigateToAccount: () => void;
  onApply: (category: Exclude<ProductCategory, "account" | "sim">) => void;
}

// "Account" is handled by its own dedicated page (PersonalAccountViewer) with
// its own product data — this component covers the other five and hands off
// to that page via onNavigateToAccount so the subnav feels like one
// continuous experience rather than two disconnected data sources.
const SUB_NAV: { label: string; category: ProductCategory }[] = [
  { label: "Account",     category: "account" },
  { label: "Credit Card", category: "creditCard" },
  { label: "Loan",        category: "loan" },
  { label: "Invest",      category: "invest" },
  { label: "Insure",      category: "insure" },
  { label: "Rewards",     category: "rewards" },
];

const PAGE_COPY: Record<ProductCategory, { heading: string; scaleNote: string; detailsCta: string }> = {
  account:    { heading: "All personal accounts",   scaleNote: "Monthly turnover ceiling shown on a shared scale, R5k → R500m", detailsCta: "See account details" },
  creditCard: { heading: "All personal credit cards", scaleNote: "Monthly card fee shown on a shared scale, R0 → R415",          detailsCta: "See card details" },
  loan:       { heading: "All personal loans",       scaleNote: "Application / admin fee shown on a shared scale, R0 → R415",   detailsCta: "See loan details" },
  invest:     { heading: "All investment products",  scaleNote: "Entry cost or rate varies by product type",                    detailsCta: "See investment details" },
  insure:     { heading: "All insurance cover",      scaleNote: "Monthly premium or admin fee shown on a shared scale, R0 → R415", detailsCta: "See cover details" },
  rewards:    { heading: "All rewards cards",        scaleNote: "Monthly card fee shown on a shared scale, R0 → R415",          detailsCta: "See card details" },
  sim: { heading: "", scaleNote: "", detailsCta: "" },
};

function parsePrice(price: string): number | null {
  const m = price.trim().match(/^R([\d,]+)$/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10);
}

function ProductCard({
  product, folio, maxPrice, detailsCta, onApply,
}: {
  product: Product; folio: string; maxPrice: number | null; detailsCta: string;
  onApply: () => void;
}) {
  const numericPrice = parsePrice(product.price);
  const showGauge = numericPrice !== null && maxPrice !== null && maxPrice > 0;
  const pct = showGauge ? Math.max(4, (numericPrice! / maxPrice!) * 100) : 0;
  const isRand = product.price.trim().startsWith("R");

  return (
    <div className="pav-card">
      <div className="pav-folio">Folio No.&nbsp;{folio}</div>
      {product.badge && <div className="pav-badge">{product.badge}</div>}
      <h3 className="pav-acct-name">{product.name}</h3>
      <p className="pav-acct-desc">{product.tagline}</p>
      {product.features.length > 0 && (
        <ul className="pav-features">
          {product.features.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}

      {showGauge && (
        <div className="pav-gauge-block">
          <div className="pav-gauge-label"><span>Fee</span><span className="pav-ceiling-val">{product.price} {product.priceLabel}</span></div>
          <div className="pav-gauge" aria-label={`${product.price} ${product.priceLabel}`}>
            <div className="pav-gauge-fill" style={{ width: `${pct}%` }} />
            <div className="pav-gauge-marker" style={{ left: `${pct}%` }} />
          </div>
          <div className="pav-gauge-ticks"><span>R0</span><span>R{maxPrice}</span></div>
        </div>
      )}

      <div className="pav-price-block">
        <div className="pav-price">
          {isRand && <span className="pav-cur">R</span>}
          {isRand ? product.price.replace("R", "") : product.price}
        </div>
        <div className="pav-price-sub">{product.priceLabel}</div>
      </div>
      <div className="pav-cta-group">
        <button className="pav-btn pav-btn-primary" onClick={onApply}>
          Apply now
        </button>
        <button className="pav-btn pav-btn-primary" onClick={onApply}>
          {detailsCta}
        </button>
      </div>
    </div>
  );
}

export function PersonalProductLedgerViewer({ isOpen, onClose, initialCategory, onNavigateToAccount, onApply }: Props) {
  const [category, setCategory] = useState<ProductCategory>(initialCategory);

  // Jump straight to whichever category was clicked, each time the viewer opens.
  useEffect(() => { if (isOpen) setCategory(initialCategory); }, [isOpen, initialCategory]);

  if (!isOpen) return null;

  const products = PRODUCTS[category] ?? [];
  const copy = PAGE_COPY[category];
  const cfg = CATEGORY_CONFIG[category];
  const maxPrice = products.length
    ? (() => {
        const parsed = products.map(p => parsePrice(p.price)).filter((n): n is number => n !== null);
        return parsed.length ? Math.max(...parsed) : null;
      })()
    : null;
  const handleApply = () => { onClose(); onApply(category as Exclude<ProductCategory, "account" | "sim">); };

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
        .pav-scale-note{ font-family:'IBM Plex Mono', monospace; font-size:11.5px; color:var(--pav-text-muted); text-align:right; line-height:1.5; max-width:280px; }

        /* ── Two rows of three cards ── */
        .pav-grid{
          display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin-bottom:24px;
        }
        .pav-card{
          position:relative;
          background:#fff; border:1px solid var(--pav-rule); border-radius:2px;
          padding:28px 26px; display:flex; flex-direction:column;
          transition:box-shadow 0.2s ease, transform 0.2s ease;
        }
        .pav-card:hover{ box-shadow:0 12px 32px rgba(29,23,64,0.1); transform:translateY(-2px); }
        .pav-folio{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:14px; }
        .pav-badge{
          position:absolute; top:24px; right:26px;
          font-family:'IBM Plex Mono', monospace; font-size:10px; font-weight:600;
          color:var(--pav-ink); background:var(--pav-gold); padding:3px 9px; border-radius:2px;
        }
        .pav-acct-name{ font-family:'Fraunces', serif; font-weight:500; font-size:21px; margin:0 0 8px; letter-spacing:-0.01em; padding-right:70px; }
        .pav-acct-desc{ font-size:13.5px; color:var(--pav-text-muted); line-height:1.55; margin:0 0 14px; }
        .pav-features{ list-style:none; margin:0 0 16px; padding:0; display:flex; flex-direction:column; gap:6px; }
        .pav-features li{ font-size:12.3px; color:var(--pav-ink-soft); line-height:1.5; padding-left:15px; position:relative; }
        .pav-features li::before{ content:"—"; position:absolute; left:0; color:var(--pav-gold-dim); }

        .pav-gauge-block{ margin-bottom:18px; }
        .pav-gauge-label{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-text-muted); display:flex; justify-content:space-between; margin-bottom:8px; gap:8px; }
        .pav-gauge-label .pav-ceiling-val{ color:var(--pav-ink); font-weight:600; text-align:right; }
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

        .pav-foot{ background:var(--pav-ink); color:var(--pav-text-muted-on-ink); padding:34px 0; font-size:12px; line-height:1.7; font-family:'IBM Plex Mono', monospace; }
        .pav-foot .pav-wrap{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .pav-foot strong{ color:var(--pav-gold); font-weight:600; }

        @media (max-width:900px){
          .pav-grid{ grid-template-columns:1fr; }
          .pav-ledger-head{ flex-direction:column; align-items:flex-start; gap:10px; }
          .pav-scale-note{ text-align:left; max-width:none; }
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
              key={item.category}
              className={`pav-subnav-item${item.category === category ? " active" : ""}`}
              onClick={() => item.category === "account" ? onNavigateToAccount() : setCategory(item.category)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="pav-ledger-section">
        <div className="pav-wrap">
          <div className="pav-ledger-head">
            <div>
              <h2>{copy.heading}</h2>
              <p style={{ font: "12px 'IBM Plex Mono',monospace", color: "var(--pav-text-muted)", margin: "6px 0 0" }}>{cfg.tag}</p>
            </div>
            <div className="pav-scale-note">{copy.scaleNote}</div>
          </div>

          <div className="pav-grid">
            {products.slice(0, 3).map((p, i) => (
              <ProductCard key={p.id} product={p} folio={String(i + 1).padStart(2, "0")} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} />
            ))}
          </div>
          <div className="pav-grid">
            {products.slice(3, 6).map((p, i) => (
              <ProductCard key={p.id} product={p} folio={String(i + 4).padStart(2, "0")} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} />
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
