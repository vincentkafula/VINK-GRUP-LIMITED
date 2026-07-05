import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void }

const PURPLE      = "#5B2D8E";
const PURPLE_DARK = "#3d1d63";
const GOLD        = "#F5A623";
const TOP_NAV     = ["Menu", "Personal", "Business", "Corporate", "Marketplace"];
const CORP_SUBNAV = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"];

const SECTIONS = [
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
      { name: "Petrol",      price: "R170", featured: false, features: ["Annual turnover: R0 to R500 million","Free Vms Online Banking and NotifyMes","Suitable for all business segments and sectors","Shariah-compliant option available","Free Online Banking and NotifyMes","Suitable for all business segments and sectors","Shariah-compliant option available"] },
      { name: "Finance",     price: "R265", featured: true,  features: ["Annual turnover: R0 to R500 million","35 electronic transactions","10 cash deposits/withdrawals at any Vms ATM (capped at R50,000 per month)","Suitable for all business segments and sectors","Free Online Banking and NotifyMes","Limited to Sole Proprietors","Shariah-compliant option available"] },
      { name: "Manage Cash", price: "R415", featured: false, features: ["Annual turnover: R0 to R500 million","60 electronic transactions","15 cash deposits/withdrawals at any Vms ATM (capped at R100,000 per month)","Suitable for all business segments and sectors","Free Online Banking and NotifyMes","Suitable for all business segments and sectors","Shariah-compliant option available"] },
    ],
  },
];

function Card({ card }: { card: { name: string; price: string; featured?: boolean; features: string[] } }) {
  return (
    <div
      style={{ background: card.featured ? PURPLE : "#fff", border: `1px solid ${card.featured ? PURPLE : "#ddd"}`, borderRadius: 10, padding: "28px 24px 20px", display: "flex", flexDirection: "column", transition: "box-shadow .2s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 24px rgba(91,45,142,.13)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      <p style={{ fontSize: "1.05rem", fontWeight: 700, color: card.featured ? "#fff" : PURPLE, marginBottom: 10 }}>{card.name}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 14 }}>
        <span style={{ fontSize: "2.2rem", fontWeight: 800, color: card.featured ? "#fff" : PURPLE_DARK, lineHeight: 1 }}>{card.price}</span>
        <span style={{ fontSize: "1rem", fontWeight: 400, color: card.featured ? "rgba(255,255,255,.75)" : "#666", marginLeft: 4 }}>/ Month</span>
      </div>
      <p style={{ fontSize: ".82rem", fontWeight: 600, color: card.featured ? "rgba(255,255,255,.85)" : PURPLE, marginBottom: 8 }}>What you Get</p>
      <ul style={{ listStyle: "none", flex: 1, marginBottom: 20 }}>
        {card.features.map((f, i) => (
          <li key={i} style={{ fontSize: ".83rem", color: card.featured ? "rgba(255,255,255,.9)" : "#666", padding: "4px 0", display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.4 }}>
            <span style={{ color: card.featured ? "#a5f3b4" : PURPLE, fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <button style={{ background: card.featured ? "#fff" : PURPLE, color: card.featured ? PURPLE : "#fff", border: "none", borderRadius: 24, padding: "9px 22px", fontSize: ".85rem", fontWeight: 600, cursor: "pointer", flex: 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}>Apply Now</button>
        <button style={{ border: `1.5px solid ${card.featured ? "rgba(255,255,255,.5)" : "#ddd"}`, background: "none", color: card.featured ? "#fff" : "#222", borderRadius: 24, padding: "9px 18px", fontSize: ".85rem", cursor: "pointer", flex: 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = PURPLE; (e.currentTarget as HTMLButtonElement).style.color = PURPLE; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = card.featured ? "rgba(255,255,255,.5)" : "#ddd"; (e.currentTarget as HTMLButtonElement).style.color = card.featured ? "#fff" : "#222"; }}>Tell me more</button>
      </div>
    </div>
  );
}

export function CorporateSolutionsViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 15 }}>

      {/* Top nav */}
      <header style={{ background: "#fff", borderBottom: "1px solid #ddd", display: "flex", alignItems: "center", padding: "0 24px", height: 52, gap: 32, position: "sticky", top: 0, zIndex: 100 }}>
        <img src={vinkLogo} alt="VMS" style={{ height: 34, width: "auto", objectFit: "contain" }} />
        <nav className="hidden md:flex" style={{ display: "flex", gap: 0, flex: 1 }}>
          {TOP_NAV.map((item, i) => (
            <a key={item} href="#" style={{ padding: "0 18px", height: 52, display: "flex", alignItems: "center", textDecoration: "none", fontSize: ".92rem", color: i === 3 ? PURPLE : "#222", borderBottom: `3px solid ${i === 3 ? PURPLE : "transparent"}`, fontWeight: i === 3 ? 600 : 400 }}>{item}</a>
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <button style={{ background: PURPLE, color: "#fff", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: ".88rem", cursor: "pointer" }}>🔒 Login</button>
          <button onClick={onClose} style={{ background: "transparent", border: "1.5px solid #ddd", borderRadius: 8, padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", color: "#666" }} title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Corporate sub-nav — "Solutions & Credit Cards" active */}
      <nav style={{ background: PURPLE, display: "flex", padding: "0 24px", overflowX: "auto" }}>
        {CORP_SUBNAV.map((item, i) => (
          <a key={item} href="#" style={{ textDecoration: "none", color: i === 1 ? "#fff" : "rgba(255,255,255,.75)", fontSize: 13, padding: "13px 16px", whiteSpace: "nowrap", borderBottom: `3px solid ${i === 1 ? "#fff" : "transparent"}`, fontWeight: i === 1 ? 700 : 500 }}>{item}</a>
        ))}
        <a href="#" style={{ textDecoration: "none", color: "rgba(255,255,255,.9)", fontSize: 13, padding: "13px 16px", marginLeft: "auto", whiteSpace: "nowrap" }}>Get Help</a>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "48px 24px 20px", background: "#f5f5f7" }}>
        <h1 style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 800, color: PURPLE, letterSpacing: -1, marginBottom: 6 }}>Plans that help you grow</h1>
        <p style={{ color: "#666", fontSize: 15, fontWeight: 500 }}>Transparent Pricing for You</p>
      </section>

      {/* Sectioned card groups */}
      {SECTIONS.map((section, si) => (
        <div key={si}>
          <div style={{ fontSize: ".9rem", fontWeight: 700, color: GOLD, padding: "4px 24px 0", maxWidth: 1100, margin: si === 0 ? "16px auto 6px" : "24px auto 6px", letterSpacing: ".5px", textTransform: "uppercase" }}>
            {section.label}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, maxWidth: 1100, margin: "0 auto", padding: "16px 24px 32px" }}>
            {section.cards.map((card, ci) => <Card key={ci} card={card} />)}
          </div>
        </div>
      ))}

      <Footer />
    </div>
  );
}
