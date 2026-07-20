import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void }

const BRAND      = "#4B2D9E";
const BRAND_DARK = "#3a2180";
const TOP_NAV    = ["Personal", "Business", "Corporate", "Marketplace"];
const BIZ_SUBNAV = ["Start my business", "Accounts", "Credit cards", "Loans", "Invest", "Insure", "Manage my Business", "International", "Studio", "news", "Get Help"];
const ACTIVE_IDX = 7;

const FEATURES = [
  {
    title: "Affordable Fund Transfer",
    desc: "Send money to 60+ countries at real exchange rates with no hidden markups. Transfers settle in 1–2 business days directly into recipient bank accounts.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="10" height="14" rx="1"/>
        <path d="M12 10h8m-3-3 3 3-3 3"/>
        <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/>
      </svg>
    ),
  },
  {
    title: "Cheap International Call",
    desc: "Make crystal-clear VoIP calls to 180+ countries at a fraction of standard rates. Billed per second with no connection fees or monthly commitments.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
  },
  {
    title: "Election Management PVT",
    desc: "End-to-end private election management for boards, cooperatives and corporates. Secure digital ballot system with real-time audit trail and tamper-proof result certification.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
  },
  {
    title: "International Vehicle Tracking",
    desc: "Monitor your fleet across borders in real time. Live GPS, geofencing, driver behaviour scoring, and automated border-crossing alerts — all in one dashboard.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 10V7l2-4h6l2 4v3"/>
        <rect x="2" y="10" width="20" height="8" rx="1"/>
        <circle cx="6" cy="21" r="2"/>
        <circle cx="18" cy="21" r="2"/>
        <path d="M6 19v-1M18 19v-1"/>
      </svg>
    ),
  },
  {
    title: "Free VOI International Call",
    desc: "Unlimited Voice-over-IP calls to VINK business clients worldwide — included at no extra charge with any Business International account. Ideal for cross-border teams.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.89a16 16 0 0 0 6.1 6.1l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
        <path d="M14.5 6.5a5 5 0 0 1 3 3"/>
      </svg>
    ),
  },
  {
    title: "Free International CCTV",
    desc: "Cloud-hosted CCTV access from anywhere in the world. Secure remote viewing, 30-day cloud recording, and AI-powered motion alerts — at no additional monthly cost.",
    icon: (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#4B2D9E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 7l-7 5 7 5V7z"/>
        <rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
    ),
  },
];

function FeatureCard({ feature }: { feature: typeof FEATURES[0] }) {
  return (
    <div
      style={{ background: "#fff", border: "1.5px solid #e8e8f0", borderRadius: 12, padding: "36px 28px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", transition: "box-shadow .2s, border-color .2s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 24px rgba(75,45,158,.10)"; (e.currentTarget as HTMLDivElement).style.borderColor = "#6B4FBE"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.borderColor = "#e8e8f0"; }}
    >
      {/* Icon circle */}
      <div style={{ width: 72, height: 72, background: "#f3f0fb", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        {feature.icon}
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: BRAND, marginBottom: 12 }}>{feature.title}</p>
      <p style={{ fontSize: 13, color: "#5a5a72", lineHeight: 1.6 }}>{feature.desc}</p>
    </div>
  );
}

export function BusinessInternationalViewer({ isOpen, onClose }: Props) {
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

      {/* Feature cards */}
      <div style={{ padding: "48px 32px 32px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginBottom: 24 }}>
          {FEATURES.slice(0, 3).map((f, i) => <FeatureCard key={i} feature={f} />)}
        </div>
        {/* Row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          {FEATURES.slice(3).map((f, i) => <FeatureCard key={i} feature={f} />)}
        </div>
      </div>

      {/* T&C Banner */}
      <div style={{ textAlign: "center", background: "#f7f7f9", padding: "32px 24px", marginTop: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: BRAND, marginBottom: 6 }}>Terms and Conditions Apply</h3>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>*These four Business Platinum Checkings meet different needs — choose what&apos;s right for you.</p>
        <p style={{ fontSize: 13, color: "#5a5a72", marginBottom: 4 }}>Note: Shari&apos;ah-compliant investment options are available on request.</p>
        <button style={{ marginTop: 16, background: BRAND, color: "#fff", border: "none", borderRadius: 20, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND_DARK; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BRAND; }}>Continue an Application</button>
      </div>

      <Footer />
    </div>
  );
}
