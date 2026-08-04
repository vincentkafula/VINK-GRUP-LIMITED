import { useEffect, useState } from "react";
import { X } from "lucide-react";

type BizCategory = "creditCard" | "loan" | "insure" | "invest";
type NavItem = "Start My Business" | "Accounts" | "Credit Cards" | "Loans" | "Invest" | "Insure" | "Manage My Business" | "International" | "Studio" | "News";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialCategory: BizCategory;
  onNavigate: (item: NavItem) => void;
  onApply: (category: BizCategory) => void;
}

const SUB_NAV: NavItem[] = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Insure", "Manage My Business", "International", "Studio", "News"];
const CATEGORY_FOR_NAV: Partial<Record<NavItem, BizCategory>> = { "Credit Cards": "creditCard", "Loans": "loan", "Insure": "insure", "Invest": "invest" };

interface BizProduct { name: string; price: string; features: string[]; featured?: boolean; tagline?: string; description?: string }

// Real product data, unchanged — moved as-is out of the old
// BusinessCreditCardViewer.tsx / BusinessLoansViewer.tsx into this shared
// ledger-style page.
const PRODUCTS: Record<BizCategory, BizProduct[]> = {
  creditCard: [
    { name: "VentureLine",   price: "R0",  tagline: "A flexible line of credit designed to give growing businesses fast, on-demand access to working capital, without the friction of reapplying every time you need funds.", features: ["R50,000 credit limit", "1% cashback on all business spend", "Expense tracking dashboard", "Monthly PDF statements for accounting", "Up to 3 supplementary cards"] },
    { name: "GrowthBridge", price: "R0",  tagline: "Short-to-medium term financing built to bridge funding gaps during periods of expansion, seasonal demand, or transition.", features: ["R150,000 credit limit", "1.5% cashback", "Virtual card for online procurement", "Fraud alerts via SMS", "55-day interest-free period"] },
    { name: "CapitalFlow",    price: "R85", tagline: "Revolving credit designed to keep cash flow steady, giving businesses the breathing room to manage day-to-day operations with confidence.", features: ["R300,000 credit limit", "2% cashback on travel and fuel", "Employee card controls", "Integration with Xero and Sage accounting", "Roadside assist included"] },
    { name: "EnterpriseLift", price: "R170", tagline: "Structured credit facilities built to support larger-scale business investment, expansion projects, and operational scaling.", features: ["Dedicated fuel management card", "Fleet fuel spend tracking", "Rebate of 8c/litre at partner stations", "Monthly fleet fuel usage reports"] },
    { name: "CommerceFlex", price: "R265", featured: true, tagline: "Adaptable credit designed for businesses with fluctuating capital needs, offering flexible drawdown and repayment terms.", features: ["R500,000 credit limit", "3% cashback on travel, 2% on telecoms", "Virtual cards per employee department", "CFO-ready expense dashboard", "Multi-currency capability", "Same-day credit limit reviews"] },
    { name: "PrimeLedger", price: "R415", tagline: "Premium business credit for established companies with strong financials, offering competitive rates and higher facility limits.", features: ["R1,000,000 credit limit", "Integrated sweep facility", "Cash flow forecasting tools", "Dedicated CFO hotline", "International wire transfer included", "0% on supplier invoices for 30 days"] },
  ],
  loan: [
    { name: "VentureLoan", price: "R0", tagline: "Financing designed for new and early-stage businesses looking to fund launch or initial growth.", features: ["Up to 80% LTV on commercial property", "Office, retail, warehouse, and mixed-use eligible", "10–20 year terms", "Linked to prime rate"] },
    { name: "GrowthCapital", price: "R0", tagline: "Loan solutions built to fund expansion projects, new locations, or scaling operations.", features: ["R50,000–R2,000,000 loan amount", "No collateral required for amounts under R500K with valid business plan", "12–60 month repayment", "Approved within 5 business days"] },
    { name: "CommerceAdvance", price: "R85", tagline: "Fast, accessible business financing designed to cover short-term operational or working capital needs.", features: ["Fixed-term deposit for businesses", "Lock in 3, 6, 12, or 24 months", "Rates up to 9.2% p.a.", "Early exit penalty of 1.5%"] },
    { name: "EnterpriseBoost", price: "R170", tagline: "Structured loans designed to support larger businesses investing in equipment, infrastructure, or capacity.", features: ["Finance new or used fleet vehicles", "Up to 100% financed", "12–72 month terms", "Group fleet discounts for 5+ vehicles", "Balloon payment option"] },
    { name: "MomentumFund", price: "R265", featured: true, tagline: "Financing designed to help businesses capitalise quickly on time-sensitive growth opportunities.", features: ["Full operating lease with maintenance, tyres, and licensing included", "Fixed monthly cost for easy budgeting", "Fuel management optional add-on", "Residual value guaranteed", "Cancel at end of term with no penalty"] },
    { name: "ApexBusiness Loan", price: "R415", tagline: "Our premium business loan offering, providing larger facilities and tailored terms for established, high-performing companies.", features: ["Short-term capital for urgent cash flow needs", "R100,000–R5,000,000", "1–12 month terms", "Draw down as needed", "Interest only on amount drawn"] },
  ],
  insure: [
    { name: "VINK NexusCover", price: "R0", tagline: "All-in-one protection for the risks that matter to your business.", description: "VINK NexusCover is a modular, multi-risk business insurance solution that consolidates property, liability, business interruption, and operational risk cover into a single, streamlined policy — built around how your business actually operates.", features: ["Modular cover spanning property, liability, and interruption risk", "Tailored risk assessment to match your industry and operations", "Single consolidated policy with simplified administration", "Scalable limits as your business grows", "Dedicated account management and claims support"] },
    { name: "VINK CommerceProtect", price: "R0", tagline: "Right-sized protection built for small and medium enterprises.", description: "VINK CommerceProtect is designed specifically for SMEs that need robust cover without enterprise-level complexity or cost. It bundles the protections small businesses need most into an affordable, easy-to-set-up package.", features: ["Bundled cover for property, stock, liability, and equipment", "Fast, simplified application process built for SMEs", "Affordable premiums structured around business size and turnover", "Business interruption cover to protect cash flow", "Easy policy adjustments as your business evolves"] },
    { name: "VINK CapitalShield", price: "R85", tagline: "Protecting the physical assets your business depends on.", description: "VINK CapitalShield safeguards your commercial property, equipment, machinery, and physical assets against loss or damage, ensuring a single incident never becomes an existential threat to your operations.", features: ["Comprehensive cover for buildings, equipment, and machinery", "Protection against fire, weather, theft, and accidental damage", "Replacement-value and agreed-value cover options", "Cover for assets in transit and at multiple sites", "Rapid claims assessment to minimise operational downtime"] },
    { name: "VINK FleetFusion", price: "R170", tagline: "Comprehensive cover for your commercial fleet.", description: "VINK FleetFusion protects businesses that rely on vehicles to operate — from single company cars to large logistics fleets — with cover designed around commercial use, driver risk, and operational uptime.", features: ["Cover for single vehicles through to large commercial fleets", "Third-party, fire and theft, and comprehensive cover tiers", "Fleet risk management and driver safety support tools", "Replacement vehicle and downtime cover options", "Centralised fleet policy management and reporting"] },
    { name: "VINK RiskSphere", price: "R265", featured: true, tagline: "Defending your business against liability and legal exposure.", description: "VINK RiskSphere protects businesses against the financial impact of legal claims, professional liability, and regulatory exposure — covering legal costs, settlements, and the reputational risks that come with them.", features: ["Public liability and professional indemnity cover", "Directors' and officers' liability protection", "Legal defence cost cover for claims and disputes", "Employment practices liability options", "Access to legal advisory support as part of your policy"] },
    { name: "VINK RecoveryGuard", price: "R415", tagline: "Keeping your business running when the unexpected happens.", description: "VINK RecoveryGuard is built to protect operational continuity after a disruptive event — from natural disasters to system failures — helping businesses recover faster and reduce the financial impact of downtime.", features: ["Business interruption and loss-of-income cover", "Cover for additional costs incurred during recovery", "Disaster recovery and crisis-response support services", "Supply chain and third-party disruption cover options", "Priority claims handling to accelerate recovery timelines"] },
  ],
  // NOTE: unlike creditCard/loan/insure above, no genuine business
  // investment product data exists anywhere in this codebase (the one
  // reference file found — vms-bank-business-invest.html — is a
  // mislabeled copy of unrelated account-tier content, not real
  // investment products, so it wasn't used). These are standard,
  // generic business treasury account types rather than fabricated
  // rates or specific investment terms, to avoid presenting invented
  // numbers as real financial product details.
  invest: [
    { name: "VentureFund",          price: "R0",   tagline: "Investment solutions designed for early-stage and growth-phase businesses seeking capital to fuel expansion.", features: ["Same-day access to funds", "No minimum balance", "Tiered interest on the full balance", "No fixed term"] },
    { name: "CapitalForge",  price: "R0",   tagline: "Structured investment products built to help businesses build long-term capital reserves and financial resilience.", features: ["32 days' notice required for withdrawal", "Higher tiered interest than a call account", "No minimum balance"] },
    { name: "EnterpriseYield",  price: "R85",  tagline: "Yield-focused investment solutions designed to generate steady returns on surplus business capital.", features: ["3–6 month fixed terms", "Interest rate locked for the term", "Early withdrawal penalty applies"] },
    { name: "ProsperEdge",   price: "R170", tagline: "Diversified investment strategies designed to give businesses a competitive edge in capital growth.", features: ["12–24 month fixed terms", "Interest rate locked for the term", "Early withdrawal penalty applies"] },
    { name: "WealthAxis",  price: "R265", featured: true, tagline: "Balanced investment portfolios built around stability and long-term business wealth accumulation.", features: ["Same-day liquidity for larger balances", "Tiered interest scaling with balance size", "Ideal for surplus operating cash"] },
    { name: "FutureReserve",     price: "R415", tagline: "Long-horizon investment solutions designed to help businesses build reserves for future obligations and opportunities.", features: ["For larger corporate balances", "Terms structured with a relationship manager", "Custom notice/fixed-term blend available"] },
  ],
};

const PAGE_COPY: Record<BizCategory, { heading: string; tag: string; scaleNote: string; detailsCta: string; heroEyebrow: string; heroTitle: string; heroSubtitle: string }> = {
  creditCard: { heading: "All business credit cards", tag: "Business Banking · Credit Cards", scaleNote: "Monthly card fee shown on a shared scale, R0 → R415", detailsCta: "See card details", heroEyebrow: "Business Credit Cards", heroTitle: "Credit cards built for\nhow your business spends.", heroSubtitle: "From day-to-day expenses to team spending — find the card that fits your business." },
  loan:       { heading: "All business loans",         tag: "Business Banking · Loans",        scaleNote: "Admin / monthly fee shown on a shared scale, R0 → R415", detailsCta: "See loan details", heroEyebrow: "Business Loans", heroTitle: "Funding that moves\nas fast as your business.", heroSubtitle: "Quick approvals and clear terms — access capital on your timeline." },
  insure:     { heading: "All business insurance",     tag: "Business Banking · Insure",       scaleNote: "Monthly premium / admin fee shown on a shared scale, R0 → R415", detailsCta: "See cover details", heroEyebrow: "Business Insurance", heroTitle: "Protection built around\nyour operations.", heroSubtitle: "Cover that's easy to understand and even easier to claim on, when you need it." },
  invest:     { heading: "All business investment accounts", tag: "Business Banking · Invest", scaleNote: "Admin fee shown on a shared scale, R0 → R415", detailsCta: "See account details", heroEyebrow: "Business Investment", heroTitle: "Put surplus cash\nto work.", heroSubtitle: "Investment and treasury accounts built for businesses of every size." },
};

function parsePrice(price: string): number | null {
  const m = price.trim().match(/^R([\d,]+)$/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ""), 10);
}

function ProductCard({
  product, folio, maxPrice, detailsCta, onApply, onDetails,
}: {
  product: BizProduct; folio: string; maxPrice: number | null; detailsCta: string;
  onApply: () => void; onDetails: () => void;
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
        <button className="pav-btn pav-btn-secondary" onClick={() => product.tagline ? onDetails() : onApply()}>{detailsCta}</button>
      </div>
    </div>
  );
}

function ProductDetailModal({ product, folio, onClose, onApply }: { product: BizProduct; folio: string; onClose: () => void; onApply: () => void }) {
  return (
    <div className="pav-detail-backdrop" onClick={onClose}>
      <div className="pav-detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="pav-detail-close" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        <div className="pav-detail-folio">Folio No.&nbsp;{folio}</div>
        <h3 className="pav-detail-name">{product.name}</h3>
        {product.tagline && <p className="pav-detail-tagline">{product.tagline}</p>}
        {product.description && <p className="pav-detail-desc">{product.description}</p>}
        <div className="pav-detail-features-head">Key Features</div>
        <ul className="pav-detail-features">
          {product.features.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <button className="pav-btn pav-btn-primary" onClick={onApply}>Apply now</button>
      </div>
    </div>
  );
}

export function BusinessProductLedgerViewer({ isOpen, onClose, initialCategory, onNavigate, onApply }: Props) {
  const [category, setCategory] = useState<BizCategory>(initialCategory);
  const [detailProduct, setDetailProduct] = useState<{ product: BizProduct; folio: string } | null>(null);

  useEffect(() => { if (isOpen) setCategory(initialCategory); }, [isOpen, initialCategory]);

  if (!isOpen) return null;

  const products = PRODUCTS[category];
  const copy = PAGE_COPY[category];
  const parsed = products.map(p => parsePrice(p.price)).filter((n): n is number => n !== null);
  const maxPrice = parsed.length ? Math.max(...parsed) : null;
  const handleApply = () => { onClose(); onApply(category); };
  const activeLabel: NavItem = category === "creditCard" ? "Credit Cards" : category === "loan" ? "Loans" : category === "insure" ? "Insure" : "Invest";

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
        .pav-cta-group{ display:flex; flex-direction:column; gap:9px; margin-top:auto; }
        .pav-btn-secondary{ background:transparent; color:var(--pav-ink); border-color:var(--pav-rule); }
        .pav-btn-secondary:hover{ background:var(--pav-paper-dim); border-color:var(--pav-gold-dim); }

        /* ── Product detail modal ── */
        .pav-detail-backdrop{ position:fixed; inset:0; z-index:70; background:rgba(29,23,64,0.55); display:flex; align-items:center; justify-content:center; padding:20px; }
        .pav-detail-card{ position:relative; background:#fff; max-width:540px; width:100%; max-height:88vh; overflow-y:auto; border-radius:4px; padding:40px 36px 32px; box-shadow:0 30px 80px rgba(29,23,64,0.35); }
        .pav-detail-close{ position:absolute; top:16px; right:16px; width:32px; height:32px; border-radius:50%; background:var(--pav-paper); color:var(--pav-ink); border:1px solid var(--pav-rule); display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .pav-detail-close:hover{ background:var(--pav-paper-dim); }
        .pav-detail-folio{ font-family:'IBM Plex Mono', monospace; font-size:11px; color:var(--pav-gold-dim); letter-spacing:0.04em; margin-bottom:10px; }
        .pav-detail-name{ font-family:'Fraunces', serif; font-weight:500; font-size:26px; margin:0 0 8px; letter-spacing:-0.01em; color:var(--pav-ink); }
        .pav-detail-tagline{ font-family:'Fraunces', serif; font-style:italic; font-size:15px; color:var(--pav-plum); margin:0 0 20px; }
        .pav-detail-desc{ font-size:13.5px; line-height:1.7; color:var(--pav-ink-soft); margin:0 0 26px; padding-bottom:26px; border-bottom:1px solid var(--pav-rule); }
        .pav-detail-features-head{ font-size:13px; font-weight:600; color:var(--pav-ink); margin-bottom:12px; }
        .pav-detail-features{ list-style:none; margin:0 0 28px; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
        .pav-detail-features li{ font-size:12.8px; color:var(--pav-ink-soft); line-height:1.5; padding-left:16px; position:relative; }
        .pav-detail-features li::before{ content:"✓"; position:absolute; left:0; color:var(--pav-gold-dim); font-weight:600; }
        @media (max-width:480px){ .pav-detail-features{ grid-template-columns:1fr; } }

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
          <div className="pav-ledger-head">
            <div>
              <h2>{copy.heading}</h2>
              <p style={{ font: "12px 'IBM Plex Mono',monospace", color: "var(--pav-text-muted)", margin: "6px 0 0" }}>{copy.tag}</p>
            </div>
            <div className="pav-scale-note">{copy.scaleNote}</div>
          </div>

          <div className="pav-grid">
            {products.slice(0, 3).map((p, i) => (
              <ProductCard key={p.name} product={p} folio={String(i + 1).padStart(2, "0")} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} onDetails={() => setDetailProduct({ product: p, folio: String(i + 1).padStart(2, "0") })} />
            ))}
          </div>
          <div className="pav-grid">
            {products.slice(3, 6).map((p, i) => (
              <ProductCard key={p.name} product={p} folio={String(i + 4).padStart(2, "0")} maxPrice={maxPrice} detailsCta={copy.detailsCta} onApply={handleApply} onDetails={() => setDetailProduct({ product: p, folio: String(i + 4).padStart(2, "0") })} />
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

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct.product}
          folio={detailProduct.folio}
          onClose={() => setDetailProduct(null)}
          onApply={() => { setDetailProduct(null); handleApply(); }}
        />
      )}
    </div>
  );
}
