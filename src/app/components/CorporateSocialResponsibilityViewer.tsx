import { useState } from "react";
import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";

interface Props { isOpen: boolean; onClose: () => void; }

const P = "#4B2D9E";
const PD = "#3a2180";

const CORPORATE_SUB_NAV = ["Account", "Solutions & Credit Cards", "Loan", "API", "Events", "Social Responsibility"];

const PILLS = ["Urban Management", "Urban Management", "Social Development", "Communications"];

export function CorporateSocialResponsibilityViewer({ isOpen, onClose }: Props) {
  const [activePill, setActivePill] = useState(0);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white border-b shadow-sm" style={{ borderColor: "#e8e8f0" }}>
        <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Main nav ── */}
      <div className="bg-white border-b px-6 flex gap-6 overflow-x-auto text-sm" style={{ borderColor: "#e8e8f0" }}>
        {["Personal", "Business", "Corporate", "Marketplace"].map((item) => (
          <span key={item} className="py-3 flex-shrink-0 font-medium"
            style={{ color: item === "Corporate" ? P : "#5a5a72", borderBottom: item === "Corporate" ? `2px solid ${P}` : "2px solid transparent" }}>
            {item}
          </span>
        ))}
      </div>

      {/* ── Corporate sub nav ── */}
      <div className="flex items-center overflow-x-auto px-6" style={{ background: P }}>
        <div className="flex flex-1">
          {CORPORATE_SUB_NAV.map((item) => (
            <span key={item} className="text-xs py-3 px-3 flex-shrink-0 cursor-pointer transition-colors"
              style={{
                color: item === "Social Responsibility" ? "#fff" : "rgba(255,255,255,.75)",
                borderBottom: item === "Social Responsibility" ? "3px solid #fff" : "3px solid transparent",
                fontWeight: item === "Social Responsibility" ? 600 : 400,
              }}>
              {item}
            </span>
          ))}
        </div>
        <span className="text-xs px-3 py-1.5 rounded cursor-pointer flex-shrink-0 font-medium" style={{ color: "rgba(255,255,255,.85)" }}>
          Get Help
        </span>
      </div>

      {/* ── Pill category nav ── */}
      <div className="flex flex-wrap gap-3 justify-center px-6 py-6">
        {PILLS.map((label, i) => (
          <button key={i} onClick={() => setActivePill(i)}
            className="rounded-full px-6 py-2 text-sm font-medium transition-all border-2"
            style={{
              borderColor: P,
              background: activePill === i ? P : "#fff",
              color: activePill === i ? "#fff" : P,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Hero image strip ── */}
      <div className="mx-6 mb-8 rounded-xl overflow-hidden grid gap-0.5 h-64" style={{ gridTemplateColumns: "1.6fr 1fr 0.8fr" }}>
        {/* Panel A — blue city skyline */}
        <div className="relative overflow-hidden flex items-end justify-center"
          style={{ background: "linear-gradient(160deg,#7ab8d8 0%,#3a7a9c 40%,#1a4a6a 100%)" }}>
          <svg className="w-11/12 opacity-35 mb-0" viewBox="0 0 400 160" xmlns="http://www.w3.org/2000/svg" fill="white">
            <rect x="10" y="60" width="30" height="100"/><rect x="15" y="40" width="20" height="20"/>
            <rect x="50" y="30" width="40" height="130"/><rect x="58" y="10" width="24" height="20"/>
            <rect x="100" y="50" width="25" height="110"/>
            <rect x="135" y="20" width="50" height="140"/><rect x="148" y="0" width="24" height="20"/>
            <rect x="195" y="45" width="35" height="115"/>
            <rect x="240" y="35" width="45" height="125"/><rect x="252" y="15" width="21" height="20"/>
            <rect x="295" y="55" width="28" height="105"/>
            <rect x="333" y="25" width="40" height="135"/><rect x="346" y="5" width="14" height="20"/>
            <rect x="0" y="155" width="400" height="10"/>
          </svg>
        </div>
        {/* Panel B — warm amber */}
        <div style={{ background: "linear-gradient(160deg,#c8a060 0%,#8b6010 50%,#5a3a00 100%)" }} />
        {/* Panel C — green with globe motif */}
        <div className="flex items-center justify-center"
          style={{ background: "linear-gradient(160deg,#6ab870 0%,#2a7830 50%,#0a4010 100%)" }}>
          <svg viewBox="0 0 100 100" width="60" height="60" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="3"/>
            <path d="M30 70 Q50 20 70 70" fill="rgba(255,255,255,.3)"/>
          </svg>
        </div>
      </div>

      {/* ── Article content ── */}
      <div className="max-w-3xl mx-auto px-6 pb-14 space-y-5" style={{ color: "#1e1e2e" }}>
        <p className="leading-relaxed text-[15px]" style={{ color: "#1e1e2e" }}>
          The office of the chief executive officer drives the strategy behind the work of the VMS SOCIAL DEVELOPMENT, and also oversees the day-to-day operations of the four VMS SOCIAL RESPONSIBILITY departments. This office also drives the VMS SOCIAL DEVELOPMENT's special projects and programmes, as well as research, and constantly seeks to develop and deliver new products and services to all stakeholders.
        </p>
        <p className="leading-relaxed text-[15px]" style={{ color: "#1e1e2e" }}>
          The current occupant of the CEO post, Siyasanga Mahlulo, has been with the VMS SOCIAL RESPONSIBILITY since its inception in 2018 and has led the organisation since 2021. She is aided in her daily duties by a personal assistant.
        </p>
        <p className="leading-relaxed text-[15px]" style={{ color: "#1e1e2e" }}>
          Financial administration and human resources (HR) also fall under the CEO's office and are driven by a finance &amp; HR manager and a finance &amp; HR assistant.
        </p>
        <p className="text-[15px]">
          Meet the team in the{" "}
          <a href="#" className="font-semibold hover:underline" style={{ color: P }}>
            Office of the CEO
          </a>
        </p>
      </div>

      <Footer />

    </div>
  );
}
