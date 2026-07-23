import { useEffect, useState } from "react";
import { X } from "lucide-react";

type BizCategory = "creditCard" | "loan" | "insure";
type NavItem = "Start My Business" | "Accounts" | "Credit Cards" | "Loans" | "Invest" | "Insure" | "Manage My Business" | "International" | "Studio" | "News";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialCategory: BizCategory;
  onNavigate: (item: NavItem) => void;
  onApply: (category: BizCategory) => void;
}

const SUB_NAV: NavItem[] = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Insure", "Manage My Business", "International", "Studio", "News"];
const CATEGORY_FOR_NAV: Partial<Record<NavItem, BizCategory>> = { "Credit Cards": "creditCard", "Loans": "loan", "Insure": "insure" };

interface BizProduct { name: string; price: string; features: string[]; featured?: boolean }

// Real product data, unchanged — moved as-is out of the old
// BusinessCreditCardViewer.tsx / BusinessLoansViewer.tsx into this shared
// ledger-style page.
const PRODUCTS: Record<BizCategory, BizProduct[]> = {
  creditCard: [
    { name: "Advice Business Card",   price: "R0",  features: ["R50,000 credit limit", "1% cashback on all business spend", "Expense tracking dashboard", "Monthly PDF statements for accounting", "Up to 3 supplementary cards"] },
    { name: "Platinum Business Card", price: "R0",  features: ["R150,000 credit limit", "1.5% cashback", "Virtual card for online procurement", "Fraud alerts via SMS", "55-day interest-free period"] },
    { name: "Black Business Card",    price: "R85", features: ["R300,000 credit limit", "2% cashback on travel and fuel", "Employee card controls", "Integration with Xero and Sage accounting", "Roadside assist included"] },
    { name: "Petrol Business Card", price: "R170", features: ["Dedicated fuel management card", "Fleet fuel spend tracking", "Rebate of 8c/litre at partner stations", "Monthly fleet fuel usage reports"] },
    { name: "Finance Business Card", price: "R265", featured: true, features: ["R500,000 credit limit", "3% cashback on travel, 2% on telecoms", "Virtual cards per employee department", "CFO-ready expense dashboard", "Multi-currency capability", "Same-day credit limit reviews"] },
    { name: "Manage Cash Business Card", price: "R415", features: ["R1,000,000 credit limit", "Integrated sweep facility", "Cash flow forecasting tools", "Dedicated CFO hotline", "International wire transfer included", "0% on supplier invoices for 30 days"] },
  ],
  loan: [
    { name: "Commercial Property Loan", price: "R0", features: ["Up to 80% LTV on commercial property", "Office, retail, warehouse, and mixed-use eligible", "10–20 year terms", "Linked to prime rate"] },
    { name: "Business Start-Up Loan", price: "R0", features: ["R50,000–R2,000,000 loan amount", "No collateral required for amounts under R500K with valid business plan", "12–60 month repayment", "Approved within 5 business days"] },
    { name: "Business Time Accounts", price: "R85", features: ["Fixed-term deposit for businesses", "Lock in 3, 6, 12, or 24 months", "Rates up to 9.2% p.a.", "Early exit penalty of 1.5%"] },
    { name: "Business Vehicle Finance", price: "R170", features: ["Finance new or used fleet vehicles", "Up to 100% financed", "12–72 month terms", "Group fleet discounts for 5+ vehicles", "Balloon payment option"] },
    { name: "Business Vehicle Leasing", price: "R265", featured: true, features: ["Full operating lease with maintenance, tyres, and licensing included", "Fixed monthly cost for easy budgeting", "Fuel management optional add-on", "Residual value guaranteed", "Cancel at end of term with no penalty"] },
    { name: "Business Bridge Loan", price: "R415", features: ["Short-term capital for urgent cash flow needs", "R100,000–R5,000,000", "1–12 month terms", "Draw down as needed", "Interest only on amount drawn"] },
  ],
  insure: [
    { name: "Surety Bonds", price: "R0", features: ["Annual turnover: R0 to R1.5 million", "Free VINK Online Banking and NotifyMes", "Suitable for all business segments and sectors", "Shari'ah-compliant option available"] },
    { name: "Business Owners Policy", price: "R0", features: ["Annual turnover: R0 to R5 million", "Free VINK Online Banking and NotifyMes", "Limited to sole proprietors", "Shari'ah-compliant option available"] },
    { name: "Commercial Property Insurance", price: "R85", features: ["Annual turnover: R0 to R500 million", "Free VINK Online Banking and NotifyMes", "Suitable for all business segments and sectors", "Shari'ah-compliant option available"] },
    { name: "General Liability Insurance", price: "R170", features: ["Annual turnover: R0 to R500 million", "Free VINK Online Banking and NotifyMes", "Suitable for all business segments and sectors", "Shari'ah-compliant option available"] },
    { name: "Commercial Auto Insurance", price: "R265", featured: true, features: ["Annual turnover: R0 to R500 million", "35 electronic transactions", "10 cash deposits/withdrawals at any VINK ATM, capped at R50,000/month", "Suitable for all business segments and sectors"] },
    { name: "Worker's Compensation", price: "R415", features: ["Annual turnover: R0 to R500 million", "60 electronic transactions", "15 cash deposits/withdrawals at any VINK ATM, capped at R100,000/month", "Suitable for all business segments and sectors"] },
  ],
};

const PAGE_COPY: Record<BizCategory, { heading: string; tag: string; scaleNote: string; detailsCta: string }> = {
  creditCard: { heading: "All business credit cards", tag: "Business Banking · Credit Cards", scaleNote: "Monthly card fee shown on a shared scale, R0 → R415", detailsCta: "See card details" },
  loan:       { heading: "All business loans",         tag: "Business Banking · Loans",        scaleNote: "Admin / monthly fee shown on a shared scale, R0 → R415", detailsCta: "See loan details" },
  insure:     { heading: "All business insurance",     tag: "Business Banking · Insure",       scaleNote: "Monthly premium / admin fee shown on a shared scale, R0 → R415", detailsCta: "See cover details" },
};

function parsePrice(price: string): number | null {
  const m = price.trim().match(/^R([\d,]+)$/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10);
}

function ProductCard({
  product, folio, maxPrice, detailsCta, onApply,
}: {
  product: BizProduct; folio: string; maxPrice: number | null; detailsCta: string;
  onApply: () => void;
}) {
  const numericPrice = parsePrice(product.price);
  const showGauge = numericPrice !== null && maxPrice !== null && maxPrice > 0;
  const pct = showGauge ? Math.max(4, (numericPrice! / maxPrice!) * 100) : 0;

  return (
    <div className="pav-card">
      <div className="pav-folio">Folio No.&nbsp;{folio}</div>
      {product.featured && <div className="pav-badge">Featured</div>}
      <h3 className="pav-acct-name">{product.name}</h3>
      <ul className="pav-features">
        {product.features.map((f) => <li key={f}>{f}</li>)}
      </ul>

      {showGauge && (
        <div className="pav-gauge-block">
          <div className="pav-gauge-label"><span>Fee</span><span className="pav-ceiling-val">{product.price} / month</span></div>
          <div className="pav-gauge" aria-label={`${product.price} per month`}>
            <div className="pav-gauge-fill" style={{ width: `${pct}%` }} />
            <div className="pav-gauge-marker" style={{ left: `${pct}%` }} />
          </div>
          <div className="pav-gauge-ticks"><span>R0</span><span>R{maxPrice}</span></div>
        </div>
      )}

      <div className="pav-price-block">
        <div className="pav-price"><span className="pav-cur">R</span>{product.price.replace("R", "")}</div>
        <div className="pav-price-sub">/ month</div>
      </div>
      <div className="pav-cta-group">
        <button className="pav-btn pav-btn-primary" onClick={onApply}>Apply now</button>
        <button className="pav-btn pav-btn-primary" onClick={onApply}>{detailsCta}</button>
      </div>
    </div>
  );
}

export function BusinessProductLedgerViewer({ isOpen, onClose, initialCategory, onNavigate, onApply }: Props) {
  const [category, setCategory] = useState<BizCategory>(initialCategory);

  useEffect(() => { if (isOpen) setCategory(initialCategory); }, [isOpen, initialCategory]);

  if (!isOpen) return null;

  const products = PRODUCTS[category];
  const copy = PAGE_COPY[category];
  const parsed = products.map(p => parsePrice(p.price)).filter((n): n is number => n !== null);
  const maxPrice = parsed.length ? Math.max(...parsed) : null;
  const handleApply = () => { onClose(); onApply(category); };
  const activeLabel: NavItem = category === "creditCard" ? "Credit Cards" : category === "loan" ? "Loans" : "Insure";

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
        .pav-acct-name{ font-family:'Fraunces', serif; font-weight:500; font-size:21px; margin:0 0 14px; letter-spacing:-0.01em; padding-right:70px; }
        .pav-features{ list-style:none; margin:0 0 16px; padding:0; display:flex; flex-direction:column; gap:6px; }
        .pav-features li{ font-size:12.3px; color:var(--pav-ink-soft); line-height:1.5; padding-left:15px; position:relative; }
        .pav-features li::before{ content:"—"; position:absolute; left:0; color:var(--pav-gold-dim); }

        .pav-gauge-block{ margin-bottom:18px; }
        .pav-gauge-label{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-text-muted); display:flex; justify-content:space-between; margin-bottom:8px; gap:8px; }
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
          {SUB_NAV.map((item) => {
            const cat = CATEGORY_FOR_NAV[item];
            return (
              <button
                key={item}
                className={`pav-subnav-item${item === activeLabel ? " active" : ""}`}
                onClick={() => cat ? setCategory(cat) : onNavigate(item)}
              >
                {item}
              </button>
            );
          })}
        </div>
      </nav>

      <section className="pav-ledger-section">
        <div className="pav-wrap">
          <div className="pav-ledger-head">
            <div>
              <h2>{copy.heading}</h2>
              <p style={{ font: "12px 'IBM Plex Mono',monospace", color: "var(--pav-text-muted)", margin: "6px 0 0" }}>{copy.tag}</p>
            </div>
            <div className="pav-scale-note">{copy.scaleNote}</div>
          </div>

          <div className="pav-grid">
            {products.slice(0, 3).map((p, i) => (
              <ProductCard key={p.name} product={p} folio={String(i + 1).padStart(2, "0")} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} />
            ))}
          </div>
          <div className="pav-grid">
            {products.slice(3, 6).map((p, i) => (
              <ProductCard key={p.name} product={p} folio={String(i + 4).padStart(2, "0")} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} />
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
