import { useState } from "react";
import vinkLogoDark from "../../imports/LOGO_FINAL.png";

const BG       = "#2D1B69";
const DARK_BAR = "#1A0F4A";
const CARD_BG  = "#4A2FBF";
const LINK_HL  = "#00BFFF";

const COLS = [
  {
    title: "Useful Tools",
    links: [
      "Latest Offers",
      "Find the Branch",
      "Safety and Security",
      "Market Indices",
      "Guide to help you bank",
      "App, Online and other banking",
      "Exchange rates",
      "Banking rates and fees",
    ],
  },
  {
    title: "Who We Are",
    links: [
      "About VINK",
      "Investor Relations",
      "Social Responsibility",
      "News",
      "Sponsorship",
      "Careers",
      "VINK at the World Economic Forum",
      "500 Global Application",
    ],
  },
  {
    title: "Our Sites",
    links: [
      "Personal Banking",
      "Business Banking",
      "Wealth and Investment Management",
      "Corporate and Investment Banking",
      "VINK blog",
    ],
  },
  {
    title: "Legal",
    links: [
      "Legal and Compliance",
      "Terms of use",
      "Banking regulations",
      "Privacy Statement",
    ],
  },
  {
    title: "Support",
    links: [
      "Contact Us",
      "Switch to VINK",
      "Business debit order switching",
      "Send your feedback",
      "Applications Dashboard",
      "Management Hub",
    ],
  },
];

const SOCIALS = [
  {
    label: "Facebook",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="white">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: "Twitter",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="white">
        <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="white">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    label: "Blog",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="white">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
];

function LinkColumn({ title, links, onLinkClick }: { title: string; links: string[]; onLinkClick?: (label: string) => void }) {
  return (
    <div>
      {/* Column heading with accent underline */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, lineHeight: "22px", letterSpacing: "0.01em" }}>
          {title}
        </p>
        <div style={{ width: 28, height: 2, background: LINK_HL, borderRadius: 2, marginTop: 6 }} />
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((l) => (
          <li key={l}>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); onLinkClick?.(l); }}
              style={{ color: "rgba(255,255,255,0.68)", fontSize: 14, lineHeight: "20px", textDecoration: "none", display: "block" }}
              onMouseEnter={(e) => { (e.target as HTMLAnchorElement).style.color = "#fff"; (e.target as HTMLAnchorElement).style.paddingLeft = "4px"; }}
              onMouseLeave={(e) => { (e.target as HTMLAnchorElement).style.color = "rgba(255,255,255,0.68)"; (e.target as HTMLAnchorElement).style.paddingLeft = "0"; }}
            >
              {l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer({ onLinkClick }: { onLinkClick?: (label: string) => void }) {
  const [showDownload, setShowDownload] = useState(false);
  return (
    <footer style={{ background: BG, fontFamily: "'Inter','Roboto',sans-serif" }}>

      {/* ── SECTION 1: Main columns ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 40px 56px" }}>

        {/* Top strip: logo + social */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 48, paddingBottom: 32, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          {/* Dark logo on dark footer — 140px wide (brand guide: footer 120-160px) */}
          <img src={vinkLogoDark} alt="Vink Group" style={{ width: 140, height: "auto", objectFit: "contain" }} />

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>
              Follow Us
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  title={s.label}
                  style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = CARD_BG; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.12)"; }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Five link columns + download card */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "40px 32px" }}>
          {/* Useful Tools (merged with Column 1 label) */}
          <LinkColumn title="Useful Tools" links={COLS[0].links} onLinkClick={onLinkClick} />
          <LinkColumn title="Who We Are"   links={COLS[1].links} onLinkClick={onLinkClick} />

          {/* Our Sites + Legal stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            <LinkColumn title="Our Sites" links={COLS[2].links} onLinkClick={onLinkClick} />
            <LinkColumn title="Legal"     links={COLS[3].links} onLinkClick={onLinkClick} />
          </div>

          {/* Support + Lost cards stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            <LinkColumn title="Support" links={COLS[4].links} onLinkClick={onLinkClick} />

            {/* Lost / stolen cards */}
            <div>
              <div style={{ marginBottom: 14 }}>
                <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, lineHeight: "22px", letterSpacing: "0.01em", margin: 0 }}>
                  Lost or stolen cards
                </p>
                <div style={{ width: 28, height: 2, background: "#EF4444", borderRadius: 2, marginTop: 6 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["+27(0) 21 007 0772", "+27(0) 61 461 5035"].map((num) => (
                  <a key={num} href={`tel:${num.replace(/[^+\d]/g, "")}`}
                    style={{ color: "#fff", fontSize: 14, lineHeight: "20px", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, background: "#EF4444", borderRadius: "50%", flexShrink: 0 }}>
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.63 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 5.93 5.93l.98-.89a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </span>
                    {num}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ── Download card ────────────────────────── */}
          <div style={{
            background: CARD_BG,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.15)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
          }}>
            {/* Trigger link — always visible */}
            <button
              onClick={() => setShowDownload(s => !s)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "20px 24px", background: "transparent", border: "none", cursor: "pointer",
                textAlign: "left",
              }}>
              <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>
                📲 Download the Vink Apps
              </p>
              <span style={{
                color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600,
                padding: "3px 10px", borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.25)",
                transition: "all 0.2s",
              }}>
                {showDownload ? "Hide ▲" : "View ▼"}
              </span>
            </button>

            {/* Collapsible content */}
            {showDownload && (
              <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Heading */}
                <div>
                  <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: "26px", margin: "0 0 8px" }}>
                    Download the App Now!
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 13, lineHeight: "20px", margin: 0 }}>
                    Your credit score is a tool to help you meet your goals. Want better rates on loans and credit cards?
                    Your credit score could make it happen.
                  </p>
                </div>

                {/* Platform labels */}
                <div style={{ display: "flex", gap: 8 }}>
                  {["🍎 iOS", "🤖 Android"].map(p => (
                    <span key={p} style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.2)" }}>{p}</span>
                  ))}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: "rgba(255,255,255,0.15)" }} />

            {/* Badges */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* App Store */}
              <a href="#" style={{
                display: "flex", alignItems: "center", gap: 12,
                background: "#000", borderRadius: 9,
                padding: "10px 16px", textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.2)",
                transition: "opacity 0.2s",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.82"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 9, lineHeight: 1, margin: 0, letterSpacing: "0.04em" }}>Available on the</p>
                  <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, lineHeight: "18px", margin: "3px 0 0" }}>App Store</p>
                </div>
              </a>

              {/* Google Play */}
              <a href="#" style={{
                display: "flex", alignItems: "center", gap: 12,
                background: "#000", borderRadius: 9,
                padding: "10px 16px", textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.2)",
                transition: "opacity 0.2s",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.82"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                  <path d="M3 3L13.5 12 3 21V3Z"           fill="#EA4335" />
                  <path d="M3 3L13.5 12 21 7.5 7.5 1 3 3Z" fill="#FBBC04" />
                  <path d="M3 21L13.5 12 21 16.5 7.5 23 3 21Z" fill="#34A853" />
                  <path d="M13.5 12L21 7.5V16.5L13.5 12Z"  fill="#4285F4" />
                </svg>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 9, lineHeight: 1, margin: 0, letterSpacing: "0.04em" }}>GET IT ON</p>
                  <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, lineHeight: "18px", margin: "3px 0 0" }}>Google Play</p>
                </div>
              </a>
            </div>

                {/* App ecosystem entry point */}
                <button
                  onClick={() => onLinkClick?.("Browse Apps")}
                  style={{
                    width: "100%", padding: "11px 16px", borderRadius: 9, border: "none",
                    background: "rgba(255,255,255,0.15)", color: "#fff",
                    fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: ".02em",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.22)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
                >
                  📲 Browse All 6 Apps
                </button>
            </div>
            )}
          </div>
        </div>
      </div>


      {/* ── SECTION 3: Dark bottom bar ──────────────────────────────────────── */}
      <div style={{ background: DARK_BAR }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 40px" }}>
          {/* Legal links row */}
          <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: "6px 0" }}>
            {["Terms Of Use", "Banking Regulations", "Privacy Statement", "Security Centre"].map((item, i, arr) => (
              <span key={item} style={{ display: "flex", alignItems: "center" }}>
                <a href="#" style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, textDecoration: "none", padding: "0 12px", whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => { (e.target as HTMLAnchorElement).style.color = "#fff"; }}
                  onMouseLeave={(e) => { (e.target as HTMLAnchorElement).style.color = "rgba(255,255,255,0.55)"; }}
                >
                  {item}
                </a>
                {i < arr.length - 1 && (
                  <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>|</span>
                )}
              </span>
            ))}
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, padding: "0 12px" }}>|</span>
            <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, whiteSpace: "nowrap", padding: "0 4px" }}>
              Authorised Financial Services Provider and a registered credit provider (NCRCP)
            </span>
          </div>
          {/* Copyright */}
          <div style={{ paddingBottom: 16, textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, margin: 0 }}>
              © Copyright. VINK Bank Limited. All Rights Reserved | Registration number 2018/079316/07
            </p>
          </div>
        </div>
      </div>

    </footer>
  );
}
