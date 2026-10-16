import vinkLogoDark from "../../imports/LOGO_FINAL.png";
import { PremiumIcon } from "./PremiumIcon";

const BG       = "#C8102E";   // brand red: the middle of the footer, with the link columns
const TOP_BG   = "#FFFFFF";   // the top band (logo and social buttons) is white
const DARK_BAR = "#0B0B0C";   // the legal and business-information bar at the bottom: black
const CARD_BG  = "#A50F27";   // social button hover (the footer itself is already #C8102E)
const LINK_HL  = "#FFFFFF";   // accents on the red footer are white (pink on red would be ~1.9:1)
const GOLD_SOFT = "#FFFFFF";  // column headings and hovers

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
      "About us",
      "Investor Relations",
      "Social Responsibility",
      "News",
      "Sponsorship",
      "Careers",
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
      "Security Centre",
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
    href: "https://www.facebook.com/vinkwaste/",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="white">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: "X",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="white">
        <path d="M17.8 3h3L14.2 10.5 22 21h-6.1l-4.8-6.3L5.6 21h-3l7.1-8.1L2.2 3h6.2l4.3 5.8zm-1 16.2h1.7L7.5 4.7H5.7z" />
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
              /* Inline, not a class: the product pages wrap this footer in an unlayered `a { color: inherit }` rule that beats any Tailwind utility. */
              style={{ color: "rgba(255,255,255,0.92)" }}
              className="block py-0.5 text-[15px] leading-[22px] no-underline transition-all duration-200 hover:translate-x-1 hover:underline focus-visible:outline-none focus-visible:underline"
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
    <footer style={{ position: "relative" }}>
      {/* ── SECTION 1: White top band: logo and social buttons ─────────────── */}
      <div style={{ background: TOP_BG, borderBottom: "1px solid #ECECF0" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          {/* The crest on the white top band (brand guide: footer 120-160px) */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src={vinkLogoDark} alt="VINK" loading="lazy" decoding="async" style={{ width: 124, height: "auto", objectFit: "contain", filter: "none" }} />
            <p style={{ color: "#6B7280", fontSize: 13.5, lineHeight: 1.5, margin: 0, maxWidth: 220, borderLeft: "1px solid #E8E8EC", paddingLeft: 16 }}>A transport-native digital bank, built for the people who ride, drive and own the taxis.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <p style={{ color: "#202124", fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", margin: 0 }}>
              Follow Us
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={"href" in s ? s.href : "#"}
                  {...("href" in s ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  title={s.label}
                  aria-label={s.label}
                  style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "linear-gradient(145deg,#e8405b," + BG + " 60%,#970f27)",
                    border: "1px solid transparent", boxShadow: "0 10px 18px -10px rgba(200,16,46,0.8), inset 0 1px 0 rgba(255,255,255,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.2s, border-color 0.2s, transform 0.2s",
                  }}
                  onMouseEnter={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.background = CARD_BG; a.style.borderColor = "transparent"; a.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.background = "linear-gradient(145deg,#e8405b," + BG + " 60%,#970f27)"; a.style.borderColor = "transparent"; a.style.transform = "none"; }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Red middle: the link columns ──────────────────────────── */}
      <div className="vkp-grain vkp-edge-top" style={{ background: BG, position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(55% 70% at 10% 0%, rgba(255,255,255,0.14), transparent 62%), radial-gradient(60% 80% at 100% 100%, rgba(90,4,20,0.5), transparent 62%)" }} />
        <div aria-hidden="true" className="vkp-dots-on-red" />
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "64px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: "44px 36px" }}>
          {/* Useful Tools (merged with Column 1 label) */}
          <LinkColumn title="Useful Tools" links={COLS[0].links} onLinkClick={handleLinkClick} />
          <LinkColumn title="Who We Are"   links={COLS[1].links} onLinkClick={handleLinkClick} />

          <LinkColumn title="Our Sites" links={COLS[2].links} onLinkClick={handleLinkClick} />

          <LinkColumn title="Support" links={COLS[4].links} onLinkClick={handleLinkClick} />

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
              border: "1px solid rgba(255,255,255,0.30)",
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
              border: "1px solid rgba(255,255,255,0.30)",
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
      </div>

      {/* ── SECTION 3: Black bottom bar: legal links and the business registration details ── */}
      <div style={{ background: DARK_BAR }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 40px 30px" }}>
          {/* The copyright. The legal links (terms, regulations, privacy, security) are in the Legal column above, once. */}
          <p style={{ color: "rgba(255,255,255,0.92)", fontSize: 13, margin: 0, textAlign: "center" }}>© {new Date().getFullYear()} VINK. All rights reserved.</p>
          {/* The business information: what VINK is, and where it is registered */}
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.14)", textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 12.5, lineHeight: 1.7, margin: "0 auto", maxWidth: 900, textAlign: "center" }}>
              VINK is a trading name of Vink Group (Pty) Ltd. VINK is not yet operational and is not yet authorised or registered to provide financial services; licensing and registrations will be completed before launch. Vink Group Reg. No. 2018/079316/07.
            </p>
            <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 12.5, margin: "10px 0 0", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px" }}>
              <span>United States – EIN: 37-2148609</span>
              <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.3)" }}>|</span>
              <span>South Africa – Registration No: 2018/079316/07</span>
              <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.3)" }}>|</span>
              <span>Zambia – Registration No: 120210020196</span>
            </p>
          </div>
        </div>
      </div>

    </footer>
  );
}
