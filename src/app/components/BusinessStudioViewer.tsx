import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void }

const BRAND      = "#4B2D9E";
const BRAND_DARK = "#3a2180";
const TOP_NAV    = ["Personal", "Business", "Corporate", "Marketplace"];
const BIZ_SUBNAV = ["Start my business", "Accounts", "Credit cards", "Loans", "Invest", "Insure", "Manage my Business", "International", "Studio", "news", "Get Help"];
const ACTIVE_IDX = 8;

const STUDIOS = [
  {
    title: "Television Studio",
    desc: "Broadcast-grade TV studio rental with 4K cameras, LED lighting rigs, teleprompters, green screen, and a live-streaming setup. Ideal for corporate video, adverts, and news productions. Crew and post-production editing available on request.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="13" rx="2"/>
        <path d="M16 2l-4 5-4-5"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
  },
  {
    title: "Radio Studio",
    desc: "Fully soundproofed radio studio equipped with professional broadcast consoles, condenser microphones, and ISDN/IP codec for remote linking. Perfect for podcasts, live broadcasts, voice-overs, and corporate audio content.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="8" width="20" height="14" rx="2"/>
        <path d="M6 8l10-6"/>
        <circle cx="7" cy="15" r="2"/>
        <path d="M13 12h4M13 16h4"/>
      </svg>
    ),
  },
  {
    title: "Music Studio",
    desc: "Professional recording studio with acoustic treatment, a large live room, isolation booth, Pro Tools and Logic Pro workstations, and a full backline. From demo tracks to commercial releases — engineered and mastered in-house by our resident sound engineers.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    ),
  },
];

export function BusinessStudioViewer({ isOpen, onClose }: Props) {
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

      {/* Studio feature cards — single row of 3 */}
      <div style={{ padding: "48px 32px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          {STUDIOS.map((studio, i) => (
            <div key={i}
              style={{ background: "#fff", border: "1.5px solid #e8e8f0", borderRadius: 12, padding: "36px 28px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", transition: "box-shadow .2s, border-color .2s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 24px rgba(75,45,158,.10)"; (e.currentTarget as HTMLDivElement).style.borderColor = "#6B4FBE"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.borderColor = "#e8e8f0"; }}
            >
              <div style={{ width: 72, height: 72, background: "#f3f0fb", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                {studio.icon}
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: BRAND, marginBottom: 12 }}>{studio.title}</p>
              <p style={{ fontSize: 13, color: "#5a5a72", lineHeight: 1.6 }}>{studio.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* T&C Banner */}
      <div style={{ textAlign: "center", background: "#f7f7f9", padding: "32px 24px", marginTop: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: BRAND, marginBottom: 6 }}>Terms and Conditions Apply</h3>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>*These four Business Platinum Checkings meet different needs — choose what&apos;s right for you.</p>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}><strong>Note:</strong> Shari&apos;ah-compliant investment options are available on request.</p>
        <button style={{ marginTop: 16, background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>Continue an Application</button>
      </div>

      <Footer />
    </div>
  );
}
