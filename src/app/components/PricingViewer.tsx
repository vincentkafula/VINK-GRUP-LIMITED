import { useState } from "react";
import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { ApplyModal } from "./ApplyModal";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PricingCard {
  name: string;
  price: string;
  features: string[];
  featured?: boolean;
}

export interface PricingViewerProps {
  isOpen: boolean;
  onClose: () => void;
  activeSubNav: string;       // e.g. "Account" | "Credit Card"
  heroTitle: string;
  heroSub: string;
  row1: PricingCard[];
  row2: PricingCard[];
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const BRAND     = "#5B3FC8";
const BRAND_DARK = "#3B2490";
const FEAT_BG   = "#4F35B8";
const FOOTER_BG = "#1A1235";

const TOOLS = [
  "Latest Offers", "Find the Branch", "Safety and Security", "Market Indices",
  "Guide to help you bank", "App, Online and other banking", "Exchange rates", "Banking rates and fees",
];
const SOCIAL = ["f", "𝕏", "in", "▶"];
const SUB_NAV_ITEMS = ["Account", "Credit Card", "Loan", "Invest", "Insure", "Rewards"];
const FOOTER_COLS = [
  { title: "Who We Are",  links: ["About VMS", "Investor Relations", "Social Responsibility", "News", "Sponsorship", "Careers", "VMS at the World Economic Forum"] },
  { title: "Our Sites",   links: ["Personal Banking", "Business Banking", "Wealth and Investment Management", "Corporate and Investment Banking", "VMS blog"] },
  { title: "Support",     links: ["Contact Us", "Switch to VMS", "Business debit order switching", "Send your feedback"] },
  { title: "Legal",       links: ["Legal and Compliance", "Terms of use", "Banking regulations", "Privacy Statement"] },
];

// ─── Card component ───────────────────────────────────────────────────────────
function Card({ card, onApply }: { card: PricingCard; onApply: (name: string, price: string) => void }) {
  return (
    <div
      style={{
        background: card.featured ? FEAT_BG : "#fff",
        border: `1.5px solid ${card.featured ? FEAT_BG : "#E4DFFE"}`,
        borderRadius: 16, padding: "28px 26px",
        display: "flex", flexDirection: "column",
        transition: "box-shadow .25s, transform .25s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 36px rgba(91,63,200,.15)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      <p style={{ fontSize: 17, fontWeight: 700, color: card.featured ? "#fff" : BRAND, marginBottom: 12 }}>
        {card.name}
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 20 }}>
        <span style={{ fontSize: 44, fontWeight: 800, color: card.featured ? "#fff" : BRAND, letterSpacing: -2, lineHeight: 1 }}>
          {card.price}
        </span>
        <span style={{ fontSize: 14, color: card.featured ? "rgba(255,255,255,.75)" : "#8A82A6", fontWeight: 500 }}>
          / Month
        </span>
      </div>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: card.featured ? "rgba(255,255,255,.8)" : "#7B5FE0", marginBottom: 12 }}>
        What you get
      </p>
      <ul style={{ listStyle: "none", flex: 1, display: "flex", flexDirection: "column", gap: 9, marginBottom: 24 }}>
        {card.features.map((f, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13.5, color: card.featured ? "rgba(255,255,255,.9)" : "#4B4567", lineHeight: 1.45 }}>
            <span style={{ color: card.featured ? "#B9A8FF" : BRAND, fontSize: 15, flexShrink: 0, marginTop: 1 }}>✔</span>
            {f}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <button
          onClick={() => onApply(card.name, card.price)}
          style={{ flex: 1, background: card.featured ? "#fff" : BRAND, color: card.featured ? BRAND : "#fff", border: "none", padding: "11px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
        >
          Apply Now
        </button>
        <button
          style={{ flex: 1, background: "transparent", color: card.featured ? "#fff" : BRAND, border: `1.5px solid ${card.featured ? "rgba(255,255,255,.5)" : "#E4DFFE"}`, padding: "11px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = card.featured ? "rgba(255,255,255,.12)" : "#F5F3FF"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          Tell me more
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function AppDownloadCard() {
  const [open, setOpen] = useState(false);
  const BRAND = "#5B2D8E";
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,.15)" }}>
      {/* Trigger */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: BRAND, border: "none", cursor: "pointer" }}>
        <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>📲 Download the Vink Apps</span>
        <span style={{ color: "rgba(255,255,255,.7)", fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,.3)" }}>
          {open ? "Hide ▲" : "iOS & Android ▼"}
        </span>
      </button>
      {open && (
        <div style={{ background: BRAND, padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ height: 1, background: "rgba(255,255,255,.15)" }} />
          <h4 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>Download the App Now!</h4>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", lineHeight: 1.6, margin: 0 }}>
            Your credit score is a tool to help you meet your goals. Want to get better rates on loans and credit cards? Your credit score could make it happen.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[{ label: "App Store", icon: "🍎", sub: "Available on the" }, { label: "Google Play", icon: "▶", sub: "GET IT ON" }].map(b => (
              <a key={b.label} href="#" onClick={e => e.preventDefault()} style={{ display: "flex", alignItems: "center", gap: 10, background: "#000", borderRadius: 9, padding: "9px 14px", textDecoration: "none", border: "1px solid rgba(255,255,255,.2)", minWidth: 130 }}>
                <span style={{ fontSize: 18 }}>{b.icon}</span>
                <div>
                  <p style={{ color: "rgba(255,255,255,.55)", fontSize: 9, margin: 0, letterSpacing: ".04em" }}>{b.sub}</p>
                  <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, margin: "2px 0 0" }}>{b.label}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PricingViewer({ isOpen, onClose, activeSubNav, heroTitle, heroSub, row1, row2 }: PricingViewerProps) {
  const [applyProduct, setApplyProduct] = useState<{ name: string; price: string } | null>(null);
  if (!isOpen) return null;
  const openApply = (name: string, price: string) => setApplyProduct({ name, price });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#F8F7FC", fontFamily: "'Inter', sans-serif" }}>

      {/* Sticky nav */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #E4DFFE", position: "sticky", top: 0, zIndex: 100 }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", height: 64, maxWidth: 1280, margin: "0 auto" }}>
          <img src={vinkLogo} alt="VMS" style={{ height: 44, width: "auto", objectFit: "contain" }} />

          <ul style={{ display: "flex", gap: 28, listStyle: "none", margin: 0, padding: 0 }} className="hidden md:flex">
            {["Personal", "Business", "Corporate", "Marketplace"].map((item, i) => (
              <li key={item}>
                <a href="#" style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? BRAND : "#4B4567", textDecoration: "none" }}>{item}</a>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={{ background: BRAND, color: "#fff", border: "none", padding: "9px 22px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              🔒 Login
            </button>
            <button onClick={onClose}
              style={{ background: "transparent", border: "1.5px solid #E4DFFE", borderRadius: 8, padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", color: "#4B4567" }}
              title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-nav */}
        <div style={{ background: BRAND, borderTop: "1px solid rgba(255,255,255,.15)" }}>
          <div style={{ display: "flex", gap: 2, padding: "0 48px", maxWidth: 1280, margin: "0 auto", alignItems: "center", overflowX: "auto" }}>
            {SUB_NAV_ITEMS.map((item) => (
              <a key={item} href="#" style={{
                color: item === activeSubNav ? "#fff" : "rgba(255,255,255,.75)",
                fontSize: 13, fontWeight: item === activeSubNav ? 700 : 500,
                padding: "10px 16px", textDecoration: "none",
                background: item === activeSubNav ? "rgba(255,255,255,.18)" : "transparent",
                borderRadius: 4, whiteSpace: "nowrap",
              }}>
                {item}
              </a>
            ))}
            <a href="#" style={{ marginLeft: "auto", color: "rgba(255,255,255,.9)", fontSize: 13, fontWeight: 500, padding: "10px 16px", textDecoration: "none", whiteSpace: "nowrap" }}>
              Get Help
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "72px 24px 56px" }}>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, color: BRAND, letterSpacing: -1.5, lineHeight: 1.1, margin: 0 }}>
          {heroTitle}
        </h1>
        <p style={{ marginTop: 10, fontSize: 16, color: "#8A82A6", fontWeight: 500 }}>{heroSub}</p>
      </div>

      {/* Pricing */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px" }}>
        {/* Row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
          {row1.map((card, i) => <Card key={i} card={card} onApply={openApply} />)}
        </div>
        {/* Row 2 — featured centre */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr 1fr", gap: 20 }} className="pricing-row-2">
          {row2.map((card, i) => <Card key={i} card={card} onApply={openApply} />)}
        </div>
        <style>{`@media(max-width:900px){.pricing-row-2{grid-template-columns:1fr!important}}`}</style>
      </div>

      {/* Footer */}
      <footer style={{ background: FOOTER_BG, color: "rgba(255,255,255,.65)", padding: "56px 48px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 40, paddingBottom: 40, borderBottom: "1px solid rgba(255,255,255,.1)" }}>

          {/* Social + Useful Tools */}
          <div>
            <h4 style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>Social</h4>
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
              {SOCIAL.map((s, i) => (
                <div key={i} style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(255,255,255,.1)", display: "grid", placeItems: "center", color: "rgba(255,255,255,.7)", fontSize: 13, cursor: "pointer" }}>{s}</div>
              ))}
            </div>
            <h4 style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>Useful Tools</h4>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
              {TOOLS.map((t, i) => <li key={i}><a href="#" style={{ color: "rgba(255,255,255,.6)", fontSize: 13, textDecoration: "none" }}>{t}</a></li>)}
            </ul>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h4 style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>{col.title}</h4>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                {col.links.map((l, i) => <li key={i}><a href="#" style={{ color: "rgba(255,255,255,.6)", fontSize: 13, textDecoration: "none" }}>{l}</a></li>)}
              </ul>
              {col.title === "Support" && (
                <>
                  <br />
                  <h4 style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, marginTop: 8 }}>Lost or Stolen Cards</h4>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                    {["+27(0) 21 007 0772", "+27(0) 61 461 5035"].map((n, i) => (
                      <li key={i}><a href={`tel:${n.replace(/[^+\d]/g, "")}`} style={{ color: "rgba(255,255,255,.6)", fontSize: 13, textDecoration: "none" }}>{n}</a></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}

          {/* App card — click to reveal */}
          <AppDownloadCard />
        </div>

        {/* Bottom bar */}
        <div style={{ maxWidth: 1200, margin: "24px auto 0", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: "rgba(255,255,255,.4)" }}>
          <div>VMS Head Office: State House Building, 8 Rose Street, Cape Town, South Africa</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {["Terms Of Use", "Banking Regulations", "Privacy Statement", "Security Centre"].map((l, i) => (
              <a key={i} href="#" style={{ color: "rgba(255,255,255,.5)", textDecoration: "none", fontSize: 11.5 }}>{l}</a>
            ))}
          </div>
          <div>© Copyright VMS Bank Limited. All Rights Reserved | Registration number 2018/079316/07</div>
        </div>
      </footer>

      {/* Apply modal — triggered by any Apply Now button */}
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
