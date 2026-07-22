import { useState } from "react";
import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";
import { ApplyModal } from "./ApplyModal";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (item: string) => void }

const BRAND      = "#5B3FC8";
const BRAND_DARK = "#3B2490";
const FEAT_BG    = "#4F35B8";
const TOP_NAV    = ["Personal", "Business", "Corporate", "Marketplace"];
const BIZ_SUBNAV = ["Start My Business", "Accounts", "Credit Cards", "Loans", "Invest", "Insure", "Manage My Business", "International", "Studio", "News"];

const ROW1 = [
  {
    name: "South Africa", price: "R1,500",
    features: [
      "Register with CIPC; obtain tax clearance",
      "3–5 business days",
      "CIPC registration support, BEE affidavit, business account opening",
    ],
  },
  {
    name: "Zambia", price: "R3,500",
    features: [
      "Register with PACRA; obtain TPIN",
      "7–14 days",
      "Document preparation, PACRA liaison, cross-border banking setup",
    ],
  },
  {
    name: "United States", price: "R7,500",
    features: [
      "Incorporate LLC in Delaware or Wyoming; obtain EIN from IRS",
      "5–10 days",
      "Registered agent, EIN application, US virtual address",
    ],
  },
];

const ROW2 = [
  {
    name: "United Kingdom", price: "R5,500", featured: false,
    features: [
      "Register at Companies House; obtain UTR from HMRC",
      "1–3 business days",
      "UK registered office, Companies House filing, VAT registration guidance",
    ],
  },
  {
    name: "Germany", price: "R12,000", featured: true,
    features: [
      "Register GmbH with Handelsregister; notarised articles required",
      "2–4 weeks",
      "Notarisation guidance, trade register filing, IBAN-linked account",
    ],
  },
  {
    name: "Canada", price: "R6,500", featured: false,
    features: [
      "Register federally or provincially; obtain BN from CRA",
      "5–10 days",
      "Federal incorporation documents, BN application, CAD account",
    ],
  },
];

function Card({ card, onApply }: { card: { name: string; price: string; featured?: boolean; features: string[] }; onApply: (country: string) => void }) {
  return (
    <div
      style={{ background: card.featured ? FEAT_BG : "#fff", border: `1.5px solid ${card.featured ? FEAT_BG : "#E4DFFE"}`, borderRadius: 16, padding: "28px 26px", display: "flex", flexDirection: "column", transition: "box-shadow .25s, transform .25s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 36px rgba(91,63,200,.15)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
    >
      <p style={{ fontSize: 17, fontWeight: 700, color: card.featured ? "#fff" : BRAND, marginBottom: 12 }}>{card.name}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 20 }}>
        <span style={{ fontSize: 44, fontWeight: 800, color: card.featured ? "#fff" : BRAND, letterSpacing: -2, lineHeight: 1 }}>{card.price}</span>
        <span style={{ fontSize: 14, color: card.featured ? "rgba(255,255,255,.75)" : "#8A82A6", fontWeight: 500 }}>/ Month</span>
      </div>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: card.featured ? "rgba(255,255,255,.8)" : "#7B5FE0", marginBottom: 12 }}>What you get</p>
      <ul style={{ listStyle: "none", flex: 1, display: "flex", flexDirection: "column", gap: 9, marginBottom: 24 }}>
        {card.features.map((f, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13.5, color: card.featured ? "rgba(255,255,255,.9)" : "#4B4567", lineHeight: 1.45 }}>
            <span style={{ color: card.featured ? "#B9A8FF" : BRAND, fontSize: 15, flexShrink: 0, marginTop: 1 }}>✔</span>
            {f}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <button style={{ flex: 1, background: card.featured ? "#fff" : BRAND, color: card.featured ? BRAND : "#fff", border: "none", padding: "11px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }} onClick={() => onApply(card.name)} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}>Apply Now</button>
        <button style={{ flex: 1, background: "transparent", color: card.featured ? "#fff" : BRAND, border: `1.5px solid ${card.featured ? "rgba(255,255,255,.5)" : "#E4DFFE"}`, padding: "11px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }} onClick={() => onApply(card.name)} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = card.featured ? "rgba(255,255,255,.12)" : "#F5F3FF"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>Tell me more</button>
      </div>
    </div>
  );
}

export function StartMyBusinessViewer({ isOpen, onClose, onNavigate }: Props) {
  const [applyCountry, setApplyCountry] = useState<string | null>(null);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#F8F7FC", fontFamily: "'Inter', sans-serif" }}>

      {/* ── Sticky nav ── */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #E4DFFE", position: "sticky", top: 0, zIndex: 100 }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", height: 64, maxWidth: 1280, margin: "0 auto" }}>
          <img src={vinkLogo} alt="VINK" style={{ height: 44, width: "auto", objectFit: "contain" }} />
          <ul style={{ display: "flex", gap: 28, listStyle: "none", margin: 0, padding: 0 }} className="hidden md:flex">
            {TOP_NAV.map((item, i) => (
              <li key={item}>
                <a href="#" style={{ fontSize: 14, fontWeight: i === 1 ? 700 : 500, color: i === 1 ? BRAND : "#4B4567", textDecoration: "none" }}>{item}</a>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ background: BRAND, color: "#fff", border: "none", padding: "9px 22px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>🔒 Login</button>
            <button onClick={onClose} style={{ background: "transparent", border: "1.5px solid #E4DFFE", borderRadius: 8, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", color: "#4B4567" }} title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Business sub-nav */}
        <div style={{ background: BRAND, borderTop: "1px solid rgba(255,255,255,.15)" }}>
          <div style={{ display: "flex", gap: 0, padding: "0 24px", maxWidth: 1280, margin: "0 auto", alignItems: "center", overflowX: "auto" }}>
            {BIZ_SUBNAV.map((item, i) => (
              <button key={item} onClick={() => onNavigate(item)} style={{ color: i === 0 ? "#fff" : "rgba(255,255,255,.75)", fontSize: 12.5, fontWeight: i === 0 ? 700 : 500, fontFamily: "inherit", padding: "10px 13px", textDecoration: "none", background: i === 0 ? "rgba(255,255,255,.18)" : "transparent", borderRadius: 4, whiteSpace: "nowrap", border: "none", cursor: "pointer" }}>
                {item}
              </button>
            ))}
            <a href="#" style={{ marginLeft: "auto", color: "rgba(255,255,255,.9)", fontSize: 12.5, fontWeight: 500, padding: "10px 13px", textDecoration: "none", whiteSpace: "nowrap" }}>Get Help</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{ textAlign: "center", padding: "64px 24px 16px" }}>
        <h1 style={{ fontSize: "clamp(28px, 4.5vw, 48px)", fontWeight: 800, color: BRAND, letterSpacing: -1.5, lineHeight: 1.1, margin: 0 }}>
          Your Business Journey Starts Here
        </h1>
        <p style={{ marginTop: 8, fontSize: 16, color: "#8A82A6", fontWeight: 500 }}>VINK helps South African entrepreneurs register, fund, and operate businesses — locally and across six key global markets.</p>
        <div style={{ marginTop: 24 }}>
          <button style={{ background: BRAND, color: "#fff", border: "none", padding: "12px 32px", borderRadius: 50, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            onClick={() => setApplyCountry("South Africa")}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>
            Help me Decide
          </button>
        </div>
      </div>

      {/* ── Pricing ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 40px" }}>
        {/* Row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
          {ROW1.map((card, i) => <Card key={i} card={card} onApply={setApplyCountry} />)}
        </div>
        {/* Row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr 1fr", gap: 20 }} className="biz-row-2">
          {ROW2.map((card, i) => <Card key={i} card={card} onApply={setApplyCountry} />)}
        </div>
        <style>{`@media(max-width:1024px){.biz-row-2{grid-template-columns:1fr!important}}`}</style>
      </div>

      {/* ── T&C Banner ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto 64px", padding: "0 24px", textAlign: "center" }}>
        <div style={{ background: "#fff", border: "1.5px solid #E4DFFE", borderRadius: 16, padding: "32px 40px" }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: BRAND, marginBottom: 10 }}>Terms and Conditions Apply</h3>
          <p style={{ fontSize: 13.5, color: "#4B4567", lineHeight: 1.6, marginBottom: 20 }}>
            *These four Business Platinum Checkings meet different needs — choose what&apos;s right for you.<br />
            Note: Shari&apos;ah-compliant investment options are available on request.
          </p>
          <button style={{ background: BRAND, color: "#fff", border: "none", padding: "12px 36px", borderRadius: 50, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            onClick={() => setApplyCountry("South Africa")}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>
            Continue an Application
          </button>
        </div>
      </div>

      <Footer />

      {applyCountry && (
        <ApplyModal
          isOpen={!!applyCountry}
          onClose={() => setApplyCountry(null)}
          product={`Start My Business — ${applyCountry}`}
        />
      )}
    </div>
  );
}
