import { useState } from "react";
import { X } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";
import { TABS, type Block } from "./socialResponsibilityContent";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (item: string) => void; }

const P = "#5C0A10";
const PD = "#2E0B10";

const CORPORATE_SUB_NAV = ["Account", "Solutions & Credit Cards", "Loan", "Social Responsibility"];

const contact = (label: string) => window.dispatchEvent(new CustomEvent("vink:footer-link", { detail: { label: "Contact Us" , cta: label } }));

function renderBlock(b: Block, i: number, onClose: () => void) {
  const fg = { color: "var(--vk-fg)" };
  switch (b.t) {
    case "lead": return <p key={i} className="text-lg font-semibold" style={{ color: "var(--vk-crimson-text)" }}>{b.text}</p>;
    case "p": return <p key={i} className="leading-relaxed text-[15px]" style={fg}>{b.text}</p>;
    case "note": return <p key={i} className="text-sm italic rounded-lg px-4 py-2.5 bg-surface-2" style={{ color: "var(--vk-fg-muted)" }}>{b.text}</p>;
    case "h": return <h3 key={i} className="text-lg font-bold pt-3" style={fg}>{b.text}</h3>;
    case "list": return (
      <ul key={i} className="space-y-2 pl-1">
        {b.items.map((it) => (
          <li key={it} className="flex gap-3 leading-relaxed text-[15px]" style={fg}>
            <span aria-hidden className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: P }} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    );
    case "pairs": return (
      <ul key={i} className="space-y-2">
        {b.items.map((it) => (
          <li key={it.label} className="leading-relaxed text-[15px]" style={fg}>
            <span className="font-semibold">{it.label}:</span> {it.value}
          </li>
        ))}
      </ul>
    );
    case "table": return (
      <div key={i} className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--vk-line)" }}>
        <table className="w-full text-sm text-left">
          <thead style={{ background: P, color: "#fff" }}>
            <tr>{b.head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {b.rows.map((r) => (
              <tr key={r[0]} className="border-t" style={{ borderColor: "var(--vk-line)", color: "var(--vk-fg)" }}>
                {r.map((c, j) => <td key={j} className={"px-4 py-2.5 " + (j === 0 ? "font-semibold" : "")}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    case "cta": return (
      <div key={i} className="flex flex-wrap gap-3 pt-1">
        {b.actions.map((a, j) => (
          <button key={a} type="button" onClick={() => { onClose(); contact(a); }}
            className="rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={j === 0 ? { background: P, color: "#fff" } : { border: `2px solid ${P}`, color: "var(--vk-crimson-text)" }}>
            {a}
          </button>
        ))}
      </div>
    );
  }
}

export function CorporateSocialResponsibilityViewer({ isOpen, onClose, onNavigate }: Props) {
  const [activePill, setActivePill] = useState(0);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-surface border-b shadow-sm" style={{ borderColor: "#e8e8f0" }}>
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted hover:text-fg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Main nav ── */}
      <div className="bg-surface border-b px-6 flex gap-6 overflow-x-auto text-sm" style={{ borderColor: "#e8e8f0" }}>
        {["Personal", "Business", "Corporate"].map((item) => (
          <span key={item} className="py-3 flex-shrink-0 font-medium"
            style={{ color: item === "Corporate" ? P : "var(--vk-fg-muted)", borderBottom: item === "Corporate" ? `2px solid ${P}` : "2px solid transparent" }}>
            {item}
          </span>
        ))}
      </div>

      {/* ── Corporate sub nav ── */}
      <div className="flex items-center overflow-x-auto px-6" style={{ background: P }}>
        <div className="flex flex-1">
          {CORPORATE_SUB_NAV.map((item) => (
            <button key={item} onClick={() => onNavigate(item)} className="text-xs py-3 px-3 flex-shrink-0 cursor-pointer transition-colors bg-transparent border-none"
              style={{
                color: item === "Social Responsibility" ? "#fff" : "rgba(255,255,255,.75)",
                borderBottom: item === "Social Responsibility" ? "3px solid #fff" : "3px solid transparent",
                fontWeight: item === "Social Responsibility" ? 600 : 400,
              }}>
              {item}
            </button>
          ))}
        </div>
        <span className="text-xs px-3 py-1.5 rounded cursor-pointer flex-shrink-0 font-medium" style={{ color: "rgba(255,255,255,.85)" }}>
          Get Help
        </span>
      </div>

      {/* ── Pill category nav ── */}
      <div className="flex flex-wrap gap-3 justify-center px-6 py-6">
        {TABS.map(({ label }, i) => (
          <button key={i} onClick={() => setActivePill(i)}
            className="rounded-full px-6 py-2 text-sm font-medium transition-all border-2"
            style={{
              borderColor: P,
              background: activePill === i ? P : "color-mix(in srgb, #fff var(--vk-wash), var(--vk-surface))",
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
      <div className="max-w-3xl mx-auto w-full px-6 pb-14 space-y-5" style={{ color: "var(--vk-fg)" }}>
        <h2 className="text-2xl font-bold" style={{ color: "var(--vk-crimson-text)" }}>{TABS[activePill].title}</h2>
        {TABS[activePill].blocks.map((b, i) => renderBlock(b, i, onClose))}
      </div>

      <Footer />

    </div>
  );
}
