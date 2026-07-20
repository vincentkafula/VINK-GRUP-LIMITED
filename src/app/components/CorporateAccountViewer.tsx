import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void }

const PURPLE      = "#5B2D8E";
const PURPLE_DARK = "#3d1f60";
const GOLD        = "#F5A623";
const TOP_NAV    = ["Menu", "Personal", "Business", "Corporate", "Marketplace"];
const CORP_SUBNAV = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"];

const SECTIONS = [
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
];

function Card({ card }: { card: { name: string; price: string; featured?: boolean; features: string[] } }) {
  return (
    <div
      style={{ background: card.featured ? PURPLE : "#fff", border: `1px solid ${card.featured ? PURPLE : "#e0d8f0"}`, borderRadius: 12, padding: "28px 24px 20px", display: "flex", flexDirection: "column", transition: "box-shadow .2s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 24px rgba(91,45,142,.13)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      <p style={{ fontSize: "1.05rem", fontWeight: 700, color: card.featured ? "#fff" : PURPLE, marginBottom: 10 }}>{card.name}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 14 }}>
        <span style={{ fontSize: "2.2rem", fontWeight: 800, color: card.featured ? "#fff" : PURPLE_DARK, lineHeight: 1 }}>{card.price}</span>
        <span style={{ fontSize: "1rem", fontWeight: 400, color: card.featured ? "rgba(255,255,255,.75)" : "#5a5575", marginLeft: 4 }}>/ Month</span>
      </div>
      <p style={{ fontSize: ".82rem", fontWeight: 600, color: card.featured ? "rgba(255,255,255,.85)" : PURPLE, marginBottom: 8 }}>What you Get</p>
      <ul style={{ listStyle: "none", flex: 1, marginBottom: 20 }}>
        {card.features.map((f, i) => (
          <li key={i} style={{ fontSize: ".83rem", color: card.featured ? "rgba(255,255,255,.9)" : "#5a5575", padding: "4px 0", display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.4 }}>
            <span style={{ color: card.featured ? "#a5f3b4" : PURPLE, fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <button
          style={{ background: card.featured ? "#fff" : PURPLE, color: card.featured ? PURPLE : "#fff", border: "none", borderRadius: 24, padding: "9px 22px", fontSize: ".85rem", fontWeight: 600, cursor: "pointer", flex: 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
        >Apply Now</button>
        <button
          style={{ border: `1.5px solid ${card.featured ? "rgba(255,255,255,.5)" : "#e0d8f0"}`, background: "none", color: card.featured ? "#fff" : "#1a1030", borderRadius: 24, padding: "9px 18px", fontSize: ".85rem", cursor: "pointer", flex: 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = PURPLE; (e.currentTarget as HTMLButtonElement).style.color = PURPLE; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = card.featured ? "rgba(255,255,255,.5)" : "#e0d8f0"; (e.currentTarget as HTMLButtonElement).style.color = card.featured ? "#fff" : "#1a1030"; }}
        >Tell me more</button>
      </div>
    </div>
  );
}

export function CorporateAccountViewer({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#f4f0fa", fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 15 }}>

      {/* Top nav */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e0d8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* Logo with gold+purple brand mark */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={vinkLogo} alt="VINK" style={{ height: 36, width: "auto", objectFit: "contain" }} />
          </div>
          <nav className="hidden md:flex" style={{ display: "flex", gap: 4 }}>
            {TOP_NAV.map((item, i) => (
              <a key={item} href="#" style={{ textDecoration: "none", color: i === 3 ? PURPLE : "#5a5575", fontSize: 14, fontWeight: i === 3 ? 700 : 500, padding: "8px 12px", borderRadius: 4, display: "block" }}>{item}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ background: PURPLE, color: "#fff", border: "none", borderRadius: 20, padding: "8px 20px", fontSize: 14, cursor: "pointer" }}>🔒 Login</button>
          <button onClick={onClose} style={{ background: "transparent", border: "1.5px solid #e0d8f0", borderRadius: 8, padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", color: "#5a5575" }} title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Corporate sub-nav */}
      <nav style={{ background: PURPLE, display: "flex", padding: "0 32px", overflowX: "auto" }}>
        {CORP_SUBNAV.map((item, i) => (
          <a key={item} href="#" style={{ textDecoration: "none", color: i === 0 ? "#fff" : "rgba(255,255,255,0.75)", fontSize: 13, padding: "13px 16px", whiteSpace: "nowrap", borderBottom: `3px solid ${i === 0 ? "#fff" : "transparent"}`, fontWeight: i === 0 ? 700 : 500 }}>{item}</a>
        ))}
        <a href="#" style={{ textDecoration: "none", color: "rgba(255,255,255,.9)", fontSize: 13, padding: "13px 16px", marginLeft: "auto", whiteSpace: "nowrap" }}>Get Help</a>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "48px 24px 20px", background: "#f4f0fa" }}>
        <h1 style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 800, color: PURPLE, letterSpacing: -1, marginBottom: 6 }}>Plans that help you grow</h1>
        <p style={{ color: "#5a5575", fontSize: 15, fontWeight: 500 }}>Transparent Pricing for You</p>
      </section>

      {/* Sectioned card groups */}
      {SECTIONS.map((section, si) => (
        <div key={si}>
          {/* Section label */}
          <div style={{ fontSize: ".9rem", fontWeight: 700, color: GOLD, padding: "4px 24px 0", maxWidth: 1100, margin: si === 0 ? "16px auto 6px" : "24px auto 6px", letterSpacing: ".5px", textTransform: "uppercase" }}>
            {section.label}
          </div>
          {/* Cards grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, maxWidth: 1100, margin: "0 auto", padding: "16px 24px 32px" }}>
            {section.cards.map((card, ci) => <Card key={ci} card={card} />)}
          </div>
        </div>
      ))}

      <Footer />
    </div>
  );
}
