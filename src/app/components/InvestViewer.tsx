import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void }

const BRAND      = "#4B2D9E";
const BRAND_DARK = "#3a2180";
const FEAT_BG    = "#4B2D9E";
const TOP_NAV    = ["Personal", "Business", "Corporate", "Marketplace"];
const BIZ_SUBNAV = ["Start my business", "Accounts", "Credit cards", "Loans", "Invest", "Insure", "Manage my Business", "International", "Studio", "news", "Get Help"];
const ACTIVE_IDX = 4;

const ROW1 = [
  { name: "Tax-Free Savings Account", price: "R0",   features: ["Zero tax on interest, dividends, and capital gains", "R36,000 annual contribution limit", "Access your funds any time", "Linked to VINK money market fund"] },
  { name: "Fixed Deposit",            price: "R0",   features: ["Lock in for 3, 6, 12, or 24 months", "Interest rate up to 9.5% p.a.", "No monthly fees", "Early exit penalty of 1% applies"] },
  { name: "Unit Trust",               price: "R85",  features: ["Choose from 5 VINK-managed funds", "Minimum investment R500/month", "Managed by qualified portfolio team", "Funds include: money market, balanced, equity, bond, global"] },
];

const ROW2 = [
  { name: "Retirement Annuity", price: "R170", featured: false, features: ["Tax-deductible contributions up to 27.5% of taxable income", "Lump-sum or monthly contributions", "Choice of underlying fund", "Portable between employers"] },
  { name: "Endowment Policy",   price: "R265", featured: true,  features: ["Ideal for savings goals of 5+ years", "Tax-efficient for taxpayers in 30%+ bracket", "Beneficiary nomination included", "Lump sum or regular contributions"] },
  { name: "Money Market Account", price: "R415", featured: false, features: ["Instant access", "Daily interest accrual", "Current rate linked to repo rate", "No minimum balance", "Ideal for emergency savings"] },
];

function Card({ card }: { card: { name: string; price: string; featured?: boolean; features: string[] } }) {
  return (
    <div style={{ background: card.featured ? FEAT_BG : "#fff", border: `1.5px solid ${card.featured ? FEAT_BG : "#e8e8f0"}`, borderRadius: 12, padding: "28px 24px", display: "flex", flexDirection: "column", transition: "box-shadow .2s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 24px rgba(75,45,158,.12)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: card.featured ? "#fff" : BRAND, marginBottom: 10 }}>{card.name}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: card.featured ? "#fff" : "#1e1e2e", lineHeight: 1 }}>{card.price}</span>
        <span style={{ fontSize: 15, fontWeight: 400, color: card.featured ? "rgba(255,255,255,.75)" : "#5a5a72", marginLeft: 4 }}>/ Month</span>
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: card.featured ? "rgba(255,255,255,.85)" : BRAND, margin: "18px 0 10px", textTransform: "uppercase", letterSpacing: ".5px" }}>What you Get</p>
      <ul style={{ listStyle: "none", flex: 1, marginBottom: 22 }}>
        {card.features.map((f, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: card.featured ? "rgba(255,255,255,.88)" : "#5a5a72", marginBottom: 8, lineHeight: 1.4 }}>
            <span style={{ color: card.featured ? "rgba(255,255,255,.9)" : BRAND, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>{f}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <button style={{ flex: 1, background: card.featured ? "#fff" : BRAND, color: card.featured ? BRAND : "#fff", border: "none", borderRadius: 20, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}>Apply Now</button>
        <button style={{ flex: 1, background: "transparent", color: card.featured ? "#fff" : BRAND, border: `1.5px solid ${card.featured ? "#fff" : BRAND}`, borderRadius: 20, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = card.featured ? "rgba(255,255,255,.1)" : "#f3f0fb"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>Tell me more</button>
      </div>
    </div>
  );
}

export function InvestViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#fff", fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 15 }}>

      {/* Top nav */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #e8e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <img src={vinkLogo} alt="VINK" style={{ height: 38, width: "auto", objectFit: "contain" }} />
          <ul style={{ display: "flex", gap: 4, listStyle: "none", margin: 0, padding: 0 }} className="hidden md:flex">
            {TOP_NAV.map((item, i) => (
              <li key={item}><a href="#" style={{ textDecoration: "none", color: i === 1 ? BRAND : "#5a5a72", fontSize: 14, fontWeight: i === 1 ? 600 : 400, padding: "8px 12px", borderRadius: 4, display: "block" }}>{item}</a></li>
            ))}
          </ul>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: "8px 20px", fontSize: 14, cursor: "pointer" }}>🔒 Login</button>
          <button onClick={onClose} style={{ background: "transparent", border: "1.5px solid #e8e8f0", borderRadius: 8, padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", color: "#5a5a72" }} title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Business sub-nav */}
      <nav style={{ background: BRAND, display: "flex", padding: "0 32px", overflowX: "auto" }}>
        {BIZ_SUBNAV.map((item, i) => (
          <a key={item} href="#" style={{ textDecoration: "none", color: i === ACTIVE_IDX ? "#fff" : "rgba(255,255,255,0.75)", fontSize: 13, padding: "13px 16px", whiteSpace: "nowrap", borderBottom: `3px solid ${i === ACTIVE_IDX ? "#fff" : "transparent"}`, fontWeight: i === ACTIVE_IDX ? 600 : 400 }}>{item}</a>
        ))}
      </nav>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "52px 24px 36px", background: "#f7f7f9" }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "#1e1e2e", marginBottom: 6 }}>Grow Your Money with VINK</h1>
        <p style={{ color: "#5a5a72", fontSize: 15, marginBottom: 22 }}>Transparent Pricing for You</p>
        <button style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 24, padding: "12px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>Help me Decide</button>
      </section>

      {/* Pricing */}
      <div style={{ padding: "40px 32px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 20 }}>
          {ROW1.map((card, i) => <Card key={i} card={card} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }} className="biz-invest-row2">
          {ROW2.map((card, i) => <Card key={i} card={card} />)}
        </div>
        <style>{`@media(max-width:900px){.biz-invest-row2{grid-template-columns:1fr 1fr!important}}@media(max-width:600px){.biz-invest-row2{grid-template-columns:1fr!important}}`}</style>
      </div>

      {/* T&C Banner */}
      <div style={{ textAlign: "center", background: "#f7f7f9", padding: "28px 24px", margin: "16px 0 0" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: BRAND, marginBottom: 6 }}>Terms and Conditions Apply</h3>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>*These four Business Platinum Checkings meet different needs — choose what&apos;s right for you.</p>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>Note: Shari&apos;ah-compliant investment options are available on request.</p>
        <button style={{ marginTop: 14, background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>Continue an Application</button>
      </div>

      <Footer />
    </div>
  );
}
