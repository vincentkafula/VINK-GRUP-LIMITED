import vinkLogoDark from "../../imports/LOGO_FINAL.png";

const BG       = "#0B2E1C";
const DARK_BAR = "#1A0F4A";
const CARD_BG  = "#5B21B6";
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
      "Job Application",
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
  // Footer now renders on every informational/application page, not just
  // the homepage (see App.tsx's global "vink:footer-link" listener). Most
  // of those pages have no reason to know about App.tsx's navigation
  // internals, so rather than prop-drill onLinkClick through 50+ page
  // components, Footer falls back to dispatching a global CustomEvent when
  // no explicit handler is passed -- the same window-event pattern already
  // used elsewhere in this app (see the vite:preloadError/session-expired
  // handling), rather than introducing a new cross-component pattern.
  const handleLinkClick = onLinkClick ?? ((label: string) => {
    window.dispatchEvent(new CustomEvent("vink:footer-link", { detail: { label } }));
  });
  return (
    <footer style={{ background: BG, fontFamily: "'Inter','Roboto',sans-serif" }}>

      {/* ── SECTION 1: Main columns ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 40px 56px" }}>

        {/* Top strip: logo + social */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 48, paddingBottom: 32, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          {/* Dark logo on dark footer — 140px wide (brand guide: footer 120-160px) */}
          <img src={vinkLogoDark} alt="VINK" style={{ width: 140, height: "auto", objectFit: "contain" }} />

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
          <LinkColumn title="Useful Tools" links={COLS[0].links} onLinkClick={handleLinkClick} />
          <LinkColumn title="Who We Are"   links={COLS[1].links} onLinkClick={handleLinkClick} />

          {/* Our Sites + Legal stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            <LinkColumn title="Our Sites" links={COLS[2].links} onLinkClick={handleLinkClick} />
            <LinkColumn title="Legal"     links={COLS[3].links} onLinkClick={handleLinkClick} />
          </div>

          {/* Support + Lost cards stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            <LinkColumn title="Support" links={COLS[4].links} onLinkClick={handleLinkClick} />

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

          {/* ── Download apps ────────────────────────── */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {/* App Store */}
            <a href="#" style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "linear-gradient(180deg,#1a1a1a,#000)", borderRadius: 10,
              padding: "11px 18px", textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.15)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
              transition: "transform 0.25s ease, box-shadow 0.25s ease",
            }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLAnchorElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 8px 22px rgba(0,0,0,0.45)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLAnchorElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "0 4px 14px rgba(0,0,0,0.35)"; }}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                <path d="M17.05 12.5c-.03-2.4 1.96-3.56 2.05-3.61-1.12-1.63-2.86-1.86-3.48-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.9-.85-3.13-.83-1.6.02-3.09.94-3.92 2.38-1.68 2.9-.43 7.19 1.2 9.55.8 1.15 1.75 2.45 3 2.4 1.21-.05 1.66-.78 3.12-.78 1.46 0 1.87.78 3.15.75 1.3-.02 2.13-1.17 2.92-2.32.92-1.33 1.3-2.62 1.32-2.69-.03-.01-2.53-.97-2.56-3.84h-.03z"/>
                <path d="M14.7 5.42c.66-.8 1.11-1.92 .99-3.03-.95.04-2.11.63-2.8 1.43-.61.7-1.15 1.86-1 2.94 1.06.08 2.15-.53 2.81-1.34z"/>
              </svg>
              <div>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 9.5, lineHeight: 1, margin: 0, letterSpacing: "0.06em" }}>Available on the</p>
                <p style={{ color: "#fff", fontSize: 15, fontWeight: 600, lineHeight: "20px", margin: "3px 0 0", letterSpacing: "-0.01em" }}>App Store</p>
              </div>
            </a>

            {/* Google Play */}
            <a href="#" style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "linear-gradient(180deg,#1a1a1a,#000)", borderRadius: 10,
              padding: "11px 18px", textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.15)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
              transition: "transform 0.25s ease, box-shadow 0.25s ease",
            }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLAnchorElement; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 8px 22px rgba(0,0,0,0.45)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLAnchorElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "0 4px 14px rgba(0,0,0,0.35)"; }}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                <path d="M3 3L13.5 12 3 21V3Z"           fill="#EA4335" />
                <path d="M3 3L13.5 12 21 7.5 7.5 1 3 3Z" fill="#FBBC04" />
                <path d="M3 21L13.5 12 21 16.5 7.5 23 3 21Z" fill="#34A853" />
                <path d="M13.5 12L21 7.5V16.5L13.5 12Z"  fill="#4285F4" />
              </svg>
              <div>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 9.5, lineHeight: 1, margin: 0, letterSpacing: "0.06em" }}>GET IT ON</p>
                <p style={{ color: "#fff", fontSize: 15, fontWeight: 600, lineHeight: "20px", margin: "3px 0 0", letterSpacing: "-0.01em" }}>Google Play</p>
              </div>
            </a>

            {/* App ecosystem entry point */}
            <button
              onClick={() => handleLinkClick("Browse Apps")}
              style={{
                width: "100%", padding: "13px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)", color: "#fff",
                fontSize: 13.5, fontWeight: 700, cursor: "pointer", letterSpacing: ".01em",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "transform 0.25s ease, background 0.25s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              Browse All 6 Apps →
            </button>
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
                <a href="#" onClick={(e) => { e.preventDefault(); handleLinkClick(item); }} style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, textDecoration: "none", padding: "0 12px", whiteSpace: "nowrap" }}
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
            <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, margin: "0 0 6px" }}>
              © Copyright. VINK-GRUP-LIMITED. All Rights Reserved.
            </p>
            <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, margin: 0, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 10px" }}>
              <span>United States – EIN: 37-2148609</span>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
              <span>South Africa – Registration No: 2018/079316/07</span>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
              <span>Zambia – Registration No: 120210020196</span>
            </p>
          </div>
        </div>
      </div>

    </footer>
  );
}
