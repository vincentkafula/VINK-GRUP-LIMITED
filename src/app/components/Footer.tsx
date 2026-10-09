import { Phone } from "lucide-react";
import vinkLogoDark from "../../imports/LOGO_FINAL.png";
import { PremiumIcon } from "./PremiumIcon";

const BG       = "#0c0e14";   // ink
const DARK_BAR = "#07080c";
const CARD_BG  = "#8b0000";   // crimson
const LINK_HL  = "#c9a84c";   // gold
const GOLD_SOFT = "#EBD592";  // headings and hovers

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
      <div style={{ marginBottom: 20 }}>
        <p style={{ color: GOLD_SOFT, fontSize: 12.5, fontWeight: 700, lineHeight: "18px", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
          {title}
        </p>
        <div style={{ width: 32, height: 2, background: `linear-gradient(90deg,${LINK_HL},transparent)`, borderRadius: 2, marginTop: 9 }} />
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 11 }}>
        {links.map((l) => (
          <li key={l}>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); onLinkClick?.(l); }}
              className="block py-0.5 text-[15px] leading-[22px] text-white/75 no-underline transition-all duration-200 hover:translate-x-1 hover:text-[#EBD592] focus-visible:text-[#EBD592] focus-visible:outline-none focus-visible:underline"
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
    <footer style={{ background: `radial-gradient(900px 340px at 10% 0%, rgba(139,0,0,0.20), transparent 62%), radial-gradient(700px 300px at 95% 100%, rgba(201,168,76,0.07), transparent 60%), ${BG}`, position: "relative" }}>
      {/* a thin gold light along the top edge */}
      <div aria-hidden="true" style={{ height: 1, background: "linear-gradient(90deg,transparent,rgba(201,168,76,0.75) 50%,transparent)" }} />

      {/* ── SECTION 1: Main columns ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "76px 40px 64px" }}>

        {/* Top strip: logo + social */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 56, paddingBottom: 36, borderBottom: "1px solid transparent", borderImage: "linear-gradient(90deg,rgba(201,168,76,0.45),rgba(255,255,255,0.10) 40%,rgba(255,255,255,0.04)) 1" }}>
          {/* Dark logo on dark footer — 140px wide (brand guide: footer 120-160px) */}
          <img src={vinkLogoDark} alt="VINK" loading="lazy" decoding="async" style={{ width: 124, height: "auto", objectFit: "contain", filter: "drop-shadow(0 6px 18px rgba(139,0,0,0.45))" }} />

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <p style={{ color: GOLD_SOFT, fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", margin: 0 }}>
              Follow Us
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  title={s.label}
                  aria-label={s.label}
                  style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))",
                    border: "1px solid rgba(201,168,76,0.35)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.2s, border-color 0.2s, transform 0.2s",
                  }}
                  onMouseEnter={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.background = CARD_BG; a.style.borderColor = LINK_HL; a.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.background = "linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))"; a.style.borderColor = "rgba(201,168,76,0.35)"; a.style.transform = "none"; }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Five link columns + download card */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: "44px 36px" }}>
          {/* Useful Tools (merged with Column 1 label) */}
          <LinkColumn title="Useful Tools" links={COLS[0].links} onLinkClick={handleLinkClick} />
          <LinkColumn title="Who We Are"   links={COLS[1].links} onLinkClick={handleLinkClick} />

          <LinkColumn title="Our Sites" links={COLS[2].links} onLinkClick={handleLinkClick} />

          {/* Support + Lost cards stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            <LinkColumn title="Support" links={COLS[4].links} onLinkClick={handleLinkClick} />

            {/* Lost / stolen cards */}
            <div style={{ padding: "16px 12px 14px", borderRadius: 16, border: "1px solid rgba(239,68,68,0.28)", background: "linear-gradient(160deg,rgba(239,68,68,0.10),rgba(239,68,68,0.02))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
              <div style={{ marginBottom: 14 }}>
                <p style={{ color: "#fff", fontSize: 12.5, fontWeight: 700, lineHeight: "18px", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                  Lost or stolen cards
                </p>
                <div style={{ width: 32, height: 2, background: "linear-gradient(90deg,#EF4444,transparent)", borderRadius: 2, marginTop: 9 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["+27(0) 21 007 0772", "+27(0) 61 461 5035"].map((num) => (
                  <a key={num} href={`tel:${num.replace(/\(0\)/, "").replace(/[^+\d]/g, "")}`}
                    style={{ color: "#fff", fontSize: 14, fontWeight: 600, lineHeight: "20px", textDecoration: "none", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                    <PremiumIcon icon={Phone} accent="#E5484D" dark="#2A0A0C" size={26} />
                    {num}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ── Download apps, with Legal underneath ───── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <div style={{
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {/* App Store -- Coming Soon: not yet published */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "linear-gradient(180deg,#1a1a1a,#000)", borderRadius: 10,
              padding: "11px 18px",
              border: "1px solid rgba(201,168,76,0.30)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 24px -14px rgba(0,0,0,0.8)",
              opacity: 0.7,
            }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                <path d="M17.05 12.5c-.03-2.4 1.96-3.56 2.05-3.61-1.12-1.63-2.86-1.86-3.48-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.9-.85-3.13-.83-1.6.02-3.09.94-3.92 2.38-1.68 2.9-.43 7.19 1.2 9.55.8 1.15 1.75 2.45 3 2.4 1.21-.05 1.66-.78 3.12-.78 1.46 0 1.87.78 3.15.75 1.3-.02 2.13-1.17 2.92-2.32.92-1.33 1.3-2.62 1.32-2.69-.03-.01-2.53-.97-2.56-3.84h-.03z"/>
                <path d="M14.7 5.42c.66-.8 1.11-1.92 .99-3.03-.95.04-2.11.63-2.8 1.43-.61.7-1.15 1.86-1 2.94 1.06.08 2.15-.53 2.81-1.34z"/>
              </svg>
              <div>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, lineHeight: 1, margin: 0, letterSpacing: "0.06em" }}>App Store</p>
                <p style={{ color: "#fff", fontSize: 15, fontWeight: 600, lineHeight: "20px", margin: "3px 0 0", letterSpacing: "-0.01em" }}>Coming Soon</p>
              </div>
            </div>

            {/* Google Play -- Coming Soon: not yet published */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "linear-gradient(180deg,#1a1a1a,#000)", borderRadius: 10,
              padding: "11px 18px",
              border: "1px solid rgba(201,168,76,0.30)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 24px -14px rgba(0,0,0,0.8)",
              opacity: 0.7,
            }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                <path d="M3 3L13.5 12 3 21V3Z"           fill="#EA4335" />
                <path d="M3 3L13.5 12 21 7.5 7.5 1 3 3Z" fill="#FBBC04" />
                <path d="M3 21L13.5 12 21 16.5 7.5 23 3 21Z" fill="#34A853" />
                <path d="M13.5 12L21 7.5V16.5L13.5 12Z"  fill="#4285F4" />
              </svg>
              <div>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, lineHeight: 1, margin: 0, letterSpacing: "0.06em" }}>Google Play</p>
                <p style={{ color: "#fff", fontSize: 15, fontWeight: 600, lineHeight: "20px", margin: "3px 0 0", letterSpacing: "-0.01em" }}>Coming Soon</p>
              </div>
            </div>
          </div>
            <LinkColumn title="Legal" links={COLS[3].links} onLinkClick={handleLinkClick} />
          </div>
        </div>
      </div>


      {/* ── SECTION 3: Dark bottom bar ──────────────────────────────────────── */}
      <div style={{ background: DARK_BAR, borderTop: "1px solid rgba(201,168,76,0.18)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 40px 0" }}>
          {/* Legal links row */}
          <div style={{ minHeight: 56, padding: "14px 0 6px", display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: "6px 0" }}>
            {["Terms Of Use", "Banking Regulations", "Privacy Statement", "Security Centre"].map((item, i, arr) => (
              <span key={item} style={{ display: "flex", alignItems: "center" }}>
                <a href="#" onClick={(e) => { e.preventDefault(); handleLinkClick(item); }} style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", textDecoration: "none", padding: "0 14px", whiteSpace: "nowrap", transition: "color .2s" }}
                  onMouseEnter={(e) => { (e.target as HTMLAnchorElement).style.color = GOLD_SOFT; }}
                  onMouseLeave={(e) => { (e.target as HTMLAnchorElement).style.color = "rgba(255,255,255,0.75)"; }}
                >
                  {item}
                </a>
                {i < arr.length - 1 && (
                  <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>|</span>
                )}
              </span>
            ))}
            <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12.5, lineHeight: 1.65, padding: "10px 4px 0", textAlign: "center", flexBasis: "100%", maxWidth: 860 }}>
              VINK is a trading name of Vink Group (Pty) Ltd. VINK is not yet operational and is not yet authorised or registered to provide financial services; licensing and registrations will be completed before launch. Enterprise No. 2026/719501/07. Vink Group Reg. No. 2018/079316/07.
            </span>
          </div>
          {/* Copyright */}
          <div style={{ padding: "6px 0 24px", textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12.5, margin: 0, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px" }}>
              <span>United States – EIN: 37-2148609</span>
              <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.25)" }}>|</span>
              <span>South Africa – Registration No: 2018/079316/07</span>
              <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.25)" }}>|</span>
              <span>Zambia – Registration No: 120210020196</span>
            </p>
          </div>
        </div>
      </div>

    </footer>
  );
}
