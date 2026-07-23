import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ApplyModal } from "./ApplyModal";

type CorpCategory = "account" | "solutions" | "loan";
type NavItem = "Account" | "Solutions & Credit Cards" | "Loan" | "API" | "Events" | "Social Responsibility";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialCategory: CorpCategory;
  onNavigate: (item: NavItem) => void;
}

interface CardData { name: string; price: string; featured?: boolean; features: string[] }
interface Section { label: string; cards: CardData[] }

const SUB_NAV: NavItem[] = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"];
const CATEGORY_FOR_NAV: Partial<Record<NavItem, CorpCategory>> = { "Account": "account", "Solutions & Credit Cards": "solutions", "Loan": "loan" };

// Real product data, unchanged — moved as-is out of the old
// CorporateAccountViewer.tsx / CorporateSolutionsViewer.tsx /
// CorporateLoanViewer.tsx into this shared ledger-style page.
const SECTIONS: Record<CorpCategory, Section[]> = {
  account: [
  {
    label: "Transport & Infrastructure",
    cards: [
      { name: "Buses Operator Account",  price: "R0",   featured: false, features: ["RTGS same-day settlements for intercity routes", "Multiple vehicle registration tracking", "Automated route revenue reporting", "Up to 50 driver wallet cards per account"] },
      { name: "Rail Operator Account",   price: "R0",   featured: false, features: ["Rolling stock and infrastructure financing integration", "Bulk payment processing for season pass revenue", "SAP and Oracle banking system integration", "Dedicated rail industry relationship manager"] },
      { name: "Construction Account",    price: "R85",  featured: false, features: ["Milestone-based payment releases", "Retention account management", "CIDB-compliant procurement payments", "Multi-project sub-account structure"] },
    ],
  },
  {
    label: "Agriculture & Industry",
    cards: [
      { name: "Commercial Farming Account", price: "R170", featured: false, features: ["Seasonal payment terms aligned to harvest cycles", "Crop-linked overdraft facility", "Agri-input supplier payment integration", "SARS agricultural tax category compliance"] },
      { name: "Mining Account",             price: "R265", featured: true,  features: ["Multi-site payment management for mine operations", "Royalty disbursement processing", "Mining charter compliance reporting", "FOREX for cross-border mineral sales", "Dedicated mining sector desk"] },
      { name: "Manufacturers Account",      price: "R415", featured: false, features: ["Supply chain financing and debtor management", "Purchase order finance", "Excon-compliant export payment processing", "EFT batch upload for 1,000+ supplier payments"] },
    ],
  },
  {
    label: "Logistics & Utilities",
    cards: [
      { name: "Shipping Account", price: "R170", featured: false, features: ["FOREX and Bill of Lading financing", "Port fee payment integration", "Multi-currency settlement", "Marine Cargo Insurance facilitation"] },
      { name: "Plane Account",    price: "R265", featured: false, features: ["Aviation finance and aircraft leasing account management", "Maintenance reserve tracking", "IATA BSP payment settlement", "Multi-currency fuel purchasing"] },
      { name: "Water Account",    price: "R415", featured: false, features: ["Utility billing infrastructure banking", "Bulk municipal payment processing", "Infrastructure project milestone payments", "Ring-fenced maintenance reserve accounts"] },
    ],
  },
],
  solutions: [
  {
    label: "Entry Credit Card Plans",
    cards: [
      { name: "Advice",   price: "R0",  featured: false, features: ["Annual turnover: R0 to R1,5 million"] },
      { name: "Platinum", price: "R0",  featured: false, features: ["Annual turnover: R0 to R5 million"] },
      { name: "Black",    price: "R85", featured: false, features: ["Annual turnover: R0 to R500 million"] },
    ],
  },
  {
    label: "Premium Credit Card Plans",
    cards: [
      { name: "Petrol",      price: "R170", featured: false, features: ["Annual turnover: R0 to R500 million","Free Vink Online Banking and NotifyMes","Suitable for all business segments and sectors","Shariah-compliant option available","Free Online Banking and NotifyMes","Suitable for all business segments and sectors","Shariah-compliant option available"] },
      { name: "Finance",     price: "R265", featured: true,  features: ["Annual turnover: R0 to R500 million","35 electronic transactions","10 cash deposits/withdrawals at any Vink ATM (capped at R50,000 per month)","Suitable for all business segments and sectors","Free Online Banking and NotifyMes","Limited to Sole Proprietors","Shariah-compliant option available"] },
      { name: "Manage Cash", price: "R415", featured: false, features: ["Annual turnover: R0 to R500 million","60 electronic transactions","15 cash deposits/withdrawals at any Vink ATM (capped at R100,000 per month)","Suitable for all business segments and sectors","Free Online Banking and NotifyMes","Suitable for all business segments and sectors","Shariah-compliant option available"] },
    ],
  },
],
  loan: [
  {
    label: "Infrastructure Construction Loans",
    cards: [
      {
        name: "Road Construction",
        price: "R0",
        features: ["Annual turnover: R0 to R1,5 million"],
      },
      {
        name: "School / University Construction",
        price: "R0",
        features: ["Annual turnover: R0 to R5 million"],
      },
      {
        name: "Shopping Malls Construction",
        price: "R85",
        features: ["Annual turnover: R0 to R500 million"],
      },
    ],
  },
  {
    label: "Development & Energy Loans",
    cards: [
      {
        name: "Hospital Construction",
        price: "R170",
        features: [
          "Annual turnover: R0 to R500 million",
          "Free Vink Online Banking and NotifyMes",
          "Suitable for all business segments and sectors",
          "Shariah-compliant option available",
          "Free Online Banking and NotifyMes",
          "Suitable for all business segments and sectors",
          "Shariah-compliant option available",
        ],
      },
      {
        name: "Hotels Construction",
        price: "R265",
        featured: true,
        features: [
          "Annual turnover: R0 to R500 million",
          "35 electronic transactions",
          "10 cash deposits/withdrawals at any Vink ATM (capped at R50,000 per month)",
          "Suitable for all business segments and sectors",
          "Free Online Banking and NotifyMes",
          "Limited to Sole Proprietors",
          "Shariah-compliant option available",
        ],
      },
      {
        name: "Solar Plant",
        price: "R415",
        features: [
          "Annual turnover: R0 to R500 million",
          "60 electronic transactions",
          "15 cash deposits/withdrawals at any Vink ATM (capped at R100,000 per month)",
          "Suitable for all business segments and sectors",
          "Free Online Banking and NotifyMes",
          "Suitable for all business segments and sectors",
          "Shariah-compliant option available",
        ],
      },
    ],
  },
  {
    label: "Industry & Resources Loans",
    cards: [
      {
        name: "Water Purification",
        price: "R170",
        features: [
          "Annual turnover: R0 to R500 million",
          "Free Vink Online Banking and NotifyMes",
          "Suitable for all business segments and sectors",
          "Shariah-compliant option available",
        ],
      },
      {
        name: "Mineral & Mining",
        price: "R265",
        features: [
          "Annual turnover: R0 to R500 million",
          "35 electronic transactions",
          "10 cash deposits/withdrawals at any Vink ATM (capped at R50,000 per month)",
          "Suitable for all business segments and sectors",
        ],
      },
      {
        name: "Manufacturing",
        price: "R415",
        features: [
          "Annual turnover: R0 to R500 million",
          "60 electronic transactions",
          "15 cash deposits/withdrawals at any Vink ATM (capped at R100,000 per month)",
          "Suitable for all business segments and sectors",
        ],
      },
    ],
  },
],
};

const PAGE_COPY: Record<CorpCategory, { heading: string; tag: string; detailsCta: string }> = {
  account:   { heading: "All corporate accounts",        tag: "Corporate Banking · Account",                 detailsCta: "See account details" },
  solutions: { heading: "All corporate credit solutions", tag: "Corporate Banking · Solutions & Credit Cards", detailsCta: "See card details" },
  loan:      { heading: "All corporate loans",            tag: "Corporate Banking · Loan",                    detailsCta: "See loan details" },
};

function parsePrice(price: string): number | null {
  const m = price.trim().match(/^R([\d,]+)$/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10);
}

function ProductCard({
  card, folio, maxPrice, detailsCta, onApply,
}: {
  card: CardData; folio: string; maxPrice: number | null; detailsCta: string;
  onApply: (name: string) => void;
}) {
  const numericPrice = parsePrice(card.price);
  const showGauge = numericPrice !== null && maxPrice !== null && maxPrice > 0;
  const pct = showGauge ? Math.max(4, (numericPrice! / maxPrice!) * 100) : 0;

  return (
    <div className="pav-card">
      <div className="pav-folio">Folio No.&nbsp;{folio}</div>
      {card.featured && <div className="pav-badge">Featured</div>}
      <h3 className="pav-acct-name">{card.name}</h3>
      <ul className="pav-features">
        {card.features.map((f) => <li key={f}>{f}</li>)}
      </ul>

      {showGauge && (
        <div className="pav-gauge-block">
          <div className="pav-gauge-label"><span>Fee</span><span className="pav-ceiling-val">{card.price} / month</span></div>
          <div className="pav-gauge" aria-label={`${card.price} per month`}>
            <div className="pav-gauge-fill" style={{ width: `${pct}%` }} />
            <div className="pav-gauge-marker" style={{ left: `${pct}%` }} />
          </div>
          <div className="pav-gauge-ticks"><span>R0</span><span>R{maxPrice}</span></div>
        </div>
      )}

      <div className="pav-price-block">
        <div className="pav-price"><span className="pav-cur">R</span>{card.price.replace("R", "")}</div>
        <div className="pav-price-sub">/ month</div>
      </div>
      <div className="pav-cta-group">
        <button className="pav-btn pav-btn-primary" onClick={() => onApply(card.name)}>Apply now</button>
        <button className="pav-btn pav-btn-primary" onClick={() => onApply(card.name)}>{detailsCta}</button>
      </div>
    </div>
  );
}

export function CorporateProductLedgerViewer({ isOpen, onClose, initialCategory, onNavigate }: Props) {
  const [category, setCategory] = useState<CorpCategory>(initialCategory);
  const [applyProduct, setApplyProduct] = useState<string | null>(null);

  useEffect(() => { if (isOpen) setCategory(initialCategory); }, [isOpen, initialCategory]);

  if (!isOpen) return null;

  const sections = SECTIONS[category];
  const copy = PAGE_COPY[category];
  const allCards = sections.flatMap(s => s.cards);
  const parsed = allCards.map(c => parsePrice(c.price)).filter((n): n is number => n !== null);
  const maxPrice = parsed.length ? Math.max(...parsed) : null;
  const handleApply = (name: string) => setApplyProduct(name);
  const activeLabel: NavItem = category === "account" ? "Account" : category === "solutions" ? "Solutions & Credit Cards" : "Loan";
  let folioCounter = 0;

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

        .pav-ledger-head{ padding:32px 0 8px; }
        .pav-ledger-head h2{ font-family:'Fraunces', serif; font-weight:500; font-size:22px; margin:0; }
        .pav-ledger-head p{ font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--pav-text-muted); margin:6px 0 0; }

        .pav-section-label{ font-family:'IBM Plex Mono', monospace; font-size:11.5px; font-weight:600; color:var(--pav-gold-dim); text-transform:uppercase; letter-spacing:0.06em; margin:26px 0 14px; }

        .pav-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin-bottom:8px; }
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
        .pav-acct-name{ font-family:'Fraunces', serif; font-weight:500; font-size:20px; margin:0 0 14px; letter-spacing:-0.01em; padding-right:70px; }
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

        .pav-foot{ background:var(--pav-ink); color:var(--pav-text-muted-on-ink); padding:34px 0; font-size:12px; line-height:1.7; font-family:'IBM Plex Mono', monospace; margin-top:24px; }
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
            <h2>{copy.heading}</h2>
            <p>{copy.tag}</p>
          </div>

          {sections.map((sec) => (
            <div key={sec.label}>
              <div className="pav-section-label">{sec.label}</div>
              <div className="pav-grid">
                {sec.cards.map((c) => {
                  folioCounter++;
                  return <ProductCard key={c.name} card={c} folio={String(folioCounter).padStart(2, "0")} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} />;
                })}
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
        <ApplyModal isOpen={!!applyProduct} onClose={() => setApplyProduct(null)} product={applyProduct} />
      )}
    </div>
  );
}
