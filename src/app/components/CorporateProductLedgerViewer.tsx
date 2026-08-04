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
  onOpenApp: () => void;
}

interface CardData {
  name: string; price: string; featured?: boolean; features: string[];
  tagline?: string; overview?: string; idealFor?: string[]; inheritsFrom?: string;
}
interface Section { label: string; cards: CardData[] }

const SUB_NAV: NavItem[] = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"];
const CATEGORY_FOR_NAV: Partial<Record<NavItem, CorpCategory>> = { "Account": "account", "Solutions & Credit Cards": "solutions", "Loan": "loan" };

// Real product data, unchanged — moved as-is out of the old
// CorporateAccountViewer.tsx / CorporateSolutionsViewer.tsx /
// CorporateLoanViewer.tsx into this shared ledger-style page.
const SECTIONS: Record<CorpCategory, Section[]> = {
  account: [
  {
    label: "Corporate Accounts",
    cards: [
      {
        name: "Foundation Corporate", price: "R0", featured: false,
        features: ["Corporate current account with multi-user access", "Secure domestic and international payments", "Bulk salary and supplier payments", "Cash flow dashboard"],
        tagline: "Built on Strength.",
        overview: "The Foundation Corporate Account is the ideal starting point for established organizations seeking secure, reliable, and efficient corporate banking. It provides the essential tools to manage day-to-day operations, streamline payments, and maintain complete visibility over corporate finances.",
        idealFor: ["Established companies", "Non-profit organizations", "Educational institutions", "Government agencies", "Medium to large enterprises"],
      },
      {
        name: "Apex Corporate", price: "R85", featured: false,
        features: ["Higher transaction limits", "Advanced payroll processing", "Treasury management tools", "Multi-currency accounts", "Dedicated relationship manager"],
        tagline: "Leading Business Forward.",
        overview: "The Apex Corporate Account is designed for organizations experiencing growth and increasing financial complexity. With enhanced payment capabilities, treasury tools, and higher transaction limits, Apex helps businesses operate more efficiently while supporting strategic expansion.",
        idealFor: ["National businesses", "Manufacturing companies", "Healthcare organizations", "Retail chains", "Regional corporations"],
        inheritsFrom: "Foundation",
      },
      {
        name: "Vertex Corporate", price: "R170", featured: false,
        features: ["Multi-company account management", "Branch and subsidiary dashboards", "Multi-level payment approvals", "AI-powered financial insights", "ERP integration"],
        tagline: "Where Strategy Meets Growth.",
        overview: "The Vertex Corporate Account empowers organizations managing multiple business units, subsidiaries, or regional operations. It offers centralized financial control, intelligent reporting, and advanced approval workflows that simplify complex business structures.",
        idealFor: ["Holding companies", "Franchise businesses", "Multi-branch organizations", "Logistics companies", "Corporate groups"],
        inheritsFrom: "Apex",
      },
      {
        name: "Nexus Corporate", price: "R265", featured: true,
        features: ["Global multi-currency accounts", "Competitive foreign exchange rates", "Cross-border payments and international payroll", "SWIFT payment management", "Trade finance support"],
        tagline: "Connecting Global Business.",
        overview: "The Nexus Corporate Account is built for businesses operating across borders. With seamless international banking, foreign exchange services, and global treasury management, Nexus keeps your worldwide operations connected through a single banking platform.",
        idealFor: ["Multinational corporations", "Exporters and importers", "International NGOs", "Global service providers", "International logistics companies"],
        inheritsFrom: "Vertex",
      },
      {
        name: "Dominion Corporate", price: "R415", featured: false,
        features: ["Enterprise treasury management", "Automated liquidity optimization", "Unlimited corporate cards", "Executive financial dashboards", "Custom approval workflows"],
        tagline: "Control Enterprise Finance.",
        overview: "The Dominion Corporate Account delivers enterprise-grade banking for organizations managing significant financial operations. Designed for complex corporate structures, it combines advanced treasury services, governance controls, and powerful financial analytics into one secure platform.",
        idealFor: ["Enterprise corporations", "Conglomerates", "Financial institutions", "National utility companies", "Large infrastructure organizations"],
        inheritsFrom: "Nexus",
      },
      {
        name: "Legacy Corporate", price: "R650", featured: false,
        features: ["Executive relationship management", "Institutional investment services", "Private treasury solutions", "Global custody services", "Mergers and acquisitions support", "24/7 executive support"],
        tagline: "Banking for Institutions That Shape the Future.",
        overview: "The Legacy Corporate Account is our most prestigious banking solution, created for multinational corporations, institutional investors, sovereign entities, and family offices. Every client receives a fully customized banking experience supported by a dedicated team of specialists delivering strategic financial solutions on a global scale.",
        idealFor: ["Multinational corporations", "Sovereign wealth entities", "Investment firms", "Private equity companies", "Family offices", "Global holding companies", "Institutional investors"],
        inheritsFrom: "Dominion",
      },
    ],
  },
],
  solutions: [
  {
    label: "Entry Credit Card Plans",
    cards: [
      { name: "VINK TitanCredit", price: "R0", featured: false, tagline: "Large-scale corporate credit facilities for established enterprises.", overview: "VINK TitanCredit provides large enterprises with substantial, flexible credit facilities designed to support major capital projects, expansion, and complex financing structures — backed by dedicated relationship management.", features: ["High-limit facilities structured for large corporate balance sheets", "Flexible drawdown and repayment structures", "Dedicated relationship and credit management team", "Facility structuring aligned to capital planning cycles"] },
      { name: "VINK ApexCapital", price: "R0", featured: false, tagline: "Strategic financing for corporations and multinational businesses.", overview: "VINK ApexCapital delivers strategic financing solutions for corporations operating across multiple markets, supporting cross-border growth, acquisitions, and large-scale capital deployment.", features: ["Financing structured for multinational and cross-border operations", "Support for mergers, acquisitions, and strategic transactions", "Multi-currency facility options", "Advisory support from dedicated corporate finance specialists"], inheritsFrom: "TitanCredit" },
      { name: "VINK EnterprisePrime", price: "R85", featured: false, tagline: "Premium revolving corporate credit solutions.", overview: "VINK EnterprisePrime offers premium revolving credit facilities that give corporations continuous access to capital for operational flexibility, without the need to renegotiate terms with every drawdown.", features: ["Revolving facility structure for ongoing capital access", "Competitive pricing for qualifying corporate clients", "Streamlined drawdown and repayment processes", "Facility limits that scale with corporate performance"], inheritsFrom: "ApexCapital" },
    ],
  },
  {
    label: "Premium Credit Card Plans",
    cards: [
      { name: "VINK QuantumCredit", price: "R170", featured: false, tagline: "Intelligent financing for innovation, expansion, and acquisitions.", overview: "VINK QuantumCredit is built for corporations pursuing innovation-led growth — offering intelligent, adaptable financing structures designed to support R&D, expansion, and acquisition strategies.", features: ["Financing structures tailored to innovation and growth strategies", "Support for acquisition and expansion-stage capital needs", "Data-driven credit structuring and portfolio insights", "Flexible terms aligned to strategic milestones"], inheritsFrom: "EnterprisePrime" },
      { name: "VINK NexusFinance", price: "R265", featured: true, tagline: "Integrated corporate funding and liquidity solutions.", overview: "VINK NexusFinance brings together funding and liquidity management into a single integrated solution, helping corporations optimise capital structure while maintaining operational agility.", features: ["Integrated funding and liquidity management solutions", "Structured facilities aligned to treasury and cash flow needs", "Support for complex, multi-entity corporate structures", "Real-time visibility into facility usage and liquidity position"], inheritsFrom: "QuantumCredit" },
      { name: "VINK SovereignLine", price: "R415", featured: false, tagline: "Executive-level credit facilities for major corporations and institutions.", overview: "VINK SovereignLine is our most exclusive corporate credit offering, providing executive-level facilities for major corporations, institutions, and sovereign-linked entities with the most demanding capital requirements.", features: ["Bespoke, executive-level facility structuring", "Designed for major corporations and institutional clients", "Highest available facility limits within the VINK portfolio", "Direct access to senior corporate banking leadership"], inheritsFrom: "NexusFinance" },
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

const PAGE_COPY: Record<CorpCategory, { heading: string; tag: string; detailsCta: string; heroEyebrow: string; heroTitle: string; heroSubtitle: string }> = {
  account:   { heading: "All corporate accounts",        tag: "Corporate Banking · Account",                 detailsCta: "See account details", heroEyebrow: "Corporate Banking", heroTitle: "Banking built for\norganizations that shape the future.", heroSubtitle: "From your first corporate account to institutional-grade treasury — one platform that grows with you." },
  solutions: { heading: "All corporate credit solutions", tag: "Corporate Banking · Solutions & Credit Cards", detailsCta: "See card details", heroEyebrow: "Corporate Credit Solutions", heroTitle: "Credit built for\nenterprise-scale spending.", heroSubtitle: "Card programs and credit facilities designed around how your organization actually operates." },
  loan:      { heading: "All corporate loans",            tag: "Corporate Banking · Loan",                    detailsCta: "See loan details", heroEyebrow: "Corporate Loans", heroTitle: "Capital that moves\nat enterprise speed.", heroSubtitle: "Structured financing and clear terms — access capital on the timeline your organization needs." },
};

function parsePrice(price: string): number | null {
  const m = price.trim().match(/^R([\d,]+)$/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10);
}

function ProductCard({
  card, folio, maxPrice, detailsCta, onApply, onDetails,
}: {
  card: CardData; folio: string; maxPrice: number | null; detailsCta: string;
  onApply: (name: string) => void; onDetails: (card: CardData, folio: string) => void;
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
        <button
          className="pav-btn pav-btn-secondary"
          onClick={() => card.tagline ? onDetails(card, folio) : onApply(card.name)}
        >
          {detailsCta}
        </button>
      </div>
    </div>
  );
}

function AccountDetailModal({ card, folio, onClose, onApply }: { card: CardData; folio: string; onClose: () => void; onApply: (name: string) => void }) {
  return (
    <div className="pav-detail-backdrop" onClick={onClose}>
      <div className="pav-detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="pav-detail-close" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        <div className="pav-detail-folio">Folio No.&nbsp;{folio}</div>
        <h3 className="pav-detail-name">{card.name}</h3>
        <p className="pav-detail-tagline">{card.tagline}</p>
        <p className="pav-detail-desc">{card.overview}</p>
        <div className="pav-detail-features-head">
          {card.inheritsFrom ? <>Everything in <strong>{card.inheritsFrom}</strong>, plus:</> : "Key Benefits"}
        </div>
        <ul className="pav-detail-features">
          {card.features.map((f) => <li key={f}>{f}</li>)}
        </ul>
        {card.idealFor && (
          <>
            <div className="pav-detail-features-head">Ideal For</div>
            <ul className="pav-detail-features" style={{ marginBottom: 28 }}>
              {card.idealFor.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </>
        )}
        <button className="pav-btn pav-btn-primary" onClick={() => onApply(card.name)}>Apply now</button>
      </div>
    </div>
  );
}

export function CorporateProductLedgerViewer({ isOpen, onClose, initialCategory, onNavigate, onOpenApp }: Props) {
  const [category, setCategory] = useState<CorpCategory>(initialCategory);
  const [applyProduct, setApplyProduct] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<{ card: CardData; folio: string } | null>(null);

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
          --pav-ink:        #FF7A1A;
          --pav-ink-soft:   #1F2937;
          --pav-paper:      #FAFCFB;
          --pav-paper-dim:  #F0F7F2;
          --pav-gold:       #0F8A4B;
          --pav-gold-dim:   #0B5C2E;
          --pav-plum:       #0F8A4B;
          --pav-text-on-ink: #EDE9FA;
          --pav-text-muted-on-ink: #A7E8BD;
          --pav-text-body:  #1F2937;
          --pav-text-muted: #6B7280;
          --pav-rule:       rgba(15,138,75,0.14);
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
        .pav-cta-group{ display:flex; flex-direction:column; gap:9px; margin-top:auto; }
        .pav-btn-secondary{ background:transparent; color:var(--pav-ink); border-color:var(--pav-rule); }
        .pav-btn-secondary:hover{ background:var(--pav-paper-dim); border-color:var(--pav-gold-dim); }

        /* ── Account detail modal ── */
        .pav-detail-backdrop{ position:fixed; inset:0; z-index:70; background:rgba(29,23,64,0.55); display:flex; align-items:center; justify-content:center; padding:20px; }
        .pav-detail-card{ position:relative; background:#fff; max-width:540px; width:100%; max-height:88vh; overflow-y:auto; border-radius:4px; padding:40px 36px 32px; box-shadow:0 30px 80px rgba(29,23,64,0.35); }
        .pav-detail-close{ position:absolute; top:16px; right:16px; width:32px; height:32px; border-radius:50%; background:var(--pav-paper); color:var(--pav-ink); border:1px solid var(--pav-rule); display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .pav-detail-close:hover{ background:var(--pav-paper-dim); }
        .pav-detail-folio{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:10px; }
        .pav-detail-name{ font-family:'Fraunces', serif; font-weight:500; font-size:26px; margin:0 0 8px; letter-spacing:-0.01em; color:var(--pav-ink); }
        .pav-detail-tagline{ font-family:'Fraunces', serif; font-style:italic; font-size:15px; color:var(--pav-plum); margin:0 0 20px; }
        .pav-detail-desc{ font-size:13.5px; line-height:1.7; color:var(--pav-ink-soft); margin:0 0 26px; padding-bottom:26px; border-bottom:1px solid var(--pav-rule); }
        .pav-detail-features-head{ font-size:13px; font-weight:600; color:var(--pav-ink); margin-bottom:12px; }
        .pav-detail-features-head strong{ color:var(--pav-plum); }
        .pav-detail-features{ list-style:none; margin:0 0 28px; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
        .pav-detail-features li{ font-size:12.8px; color:var(--pav-ink-soft); line-height:1.5; padding-left:16px; position:relative; }
        .pav-detail-features li::before{ content:"✓"; position:absolute; left:0; color:var(--pav-gold-dim); font-weight:600; }
        @media (max-width:480px){ .pav-detail-features{ grid-template-columns:1fr; } }

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

      <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg,#FAFCFB 0%,#F3F9F5 100%)" }}>
        <div className="absolute -left-24 top-0 bottom-0 w-64 rounded-full opacity-40" style={{ background: "linear-gradient(180deg,#0F8A4B,#FF7A1A)", filter: "blur(60px)" }} />
        <div className="absolute -right-24 top-0 bottom-0 w-64 rounded-full opacity-40" style={{ background: "linear-gradient(180deg,#FF7A1A,#0F8A4B)", filter: "blur(60px)" }} />
        <div className="relative max-w-6xl mx-auto px-8 py-14 sm:py-16">
          <span className="inline-block text-[11px] font-bold tracking-[0.14em] uppercase mb-3" style={{ color: "#FF7A1A" }}>{copy.heroEyebrow}</span>
          <h1 className="text-3xl sm:text-4xl font-black leading-[1.1] text-gray-900 whitespace-pre-line">{copy.heroTitle}</h1>
          <p className="text-gray-500 text-sm sm:text-base mt-4 max-w-lg">{copy.heroSubtitle}</p>
        </div>
      </div>

      <section className="pav-ledger-section">
        <div className="pav-wrap">
          <div className="pav-ledger-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2>{copy.heading}</h2>
              <p>{copy.tag}</p>
            </div>
            {category === "account" && (
              <button onClick={onOpenApp} className="pav-btn pav-btn-primary" style={{ width: "auto", padding: "10px 20px", marginBottom: "2px" }}>
                Try the Corporate App
              </button>
            )}
          </div>

          {sections.map((sec) => (
            <div key={sec.label}>
              <div className="pav-section-label">{sec.label}</div>
              <div className="pav-grid">
                {sec.cards.map((c) => {
                  folioCounter++;
                  const folio = String(folioCounter).padStart(2, "0");
                  return <ProductCard key={c.name} card={c} folio={folio} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} onDetails={(card, f) => setDetailCard({ card, folio: f })} />;
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

      {detailCard && (
        <AccountDetailModal
          card={detailCard.card}
          folio={detailCard.folio}
          onClose={() => setDetailCard(null)}
          onApply={(name) => { setDetailCard(null); handleApply(name); }}
        />
      )}
    </div>
  );
}
