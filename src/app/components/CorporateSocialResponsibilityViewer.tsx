import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  X, Info, MapPin, Building2, ShieldCheck, Sparkles, HeartHandshake, Megaphone, Handshake,
  Check, ChevronLeft, ChevronRight, ArrowRight, Clock, Landmark,
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { Footer } from "./Footer";
import { TABS, type Block, type Tab } from "./socialResponsibilityContent";
import { usePageTitle } from "./ds";
import { BRAND } from "../brand";

interface Props { isOpen: boolean; onClose: () => void; onNavigate: (item: string) => void; }

const P = BRAND.crimsonDeep;
const CORPORATE_SUB_NAV = ["Account", "Solutions & Credit Cards", "Loan", "Social Responsibility"];

/** Icon and one-line summary for each tab, keyed by the tab label. */
const META: Record<string, { icon: ReactNode; blurb: string }> = {
  "About": { icon: <Info />, blurb: "Cleaner, safer and more inclusive cities across South Africa and Zambia." },
  "Cities We Serve": { icon: <MapPin />, blurb: "Seven cities, two countries, one model delivered with local partners." },
  "Office of the CEO": { icon: <Building2 />, blurb: "The strategy, governance and people behind every city programme." },
  "Safety & Security Department": { icon: <ShieldCheck />, blurb: "Visible, accountable safety support alongside the police." },
  "Urban Management": { icon: <Sparkles />, blurb: "Clean, well-maintained precincts, around the clock." },
  "Social Development": { icon: <HeartHandshake />, blurb: "Connecting the most vulnerable to shelter, care, skills and work." },
  "Communications": { icon: <Megaphone />, blurb: "Telling the story of our cities and building trust." },
  "Get Involved": { icon: <Handshake />, blurb: "Safer, cleaner cities are built by many hands." },
};

const STATS = [
  { v: "7", l: "cities" },
  { v: "2", l: "countries" },
  { v: "5", l: "teams" },
  { v: "Profit-funded", l: "programmes" },
];

const contact = (cta: string) => window.dispatchEvent(new CustomEvent("vink:footer-link", { detail: { label: "Contact Us", cta } }));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface Section { title: string; blocks: Block[] }

/** Group a tab's blocks into sections that each start at a heading, so every section can be a card with its own anchor. */
function toSections(blocks: Block[]): { intro: Block[]; sections: Section[] } {
  const intro: Block[] = [];
  const sections: Section[] = [];
  for (const b of blocks) {
    if (b.t === "h") sections.push({ title: b.text, blocks: [] });
    else if (sections.length) sections[sections.length - 1].blocks.push(b);
    else intro.push(b);
  }
  return { intro, sections };
}

function BlockView({ b, onClose }: { b: Block; onClose: () => void }) {
  switch (b.t) {
    case "lead":
    case "h":
      return null;
    case "p": return <p className="leading-relaxed text-[15px] text-fg">{b.text}</p>;
    case "note":
      return (
        <p className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg-muted">
          <Clock className="mt-0.5 size-4 flex-shrink-0 text-gold-text" aria-hidden="true" />
          <span>{b.text}</span>
        </p>
      );
    case "list":
      return (
        <ul className={"grid gap-x-8 gap-y-3 " + (b.items.length > 4 ? "md:grid-cols-2" : "")}>
          {b.items.map((it) => (
            <li key={it} className="flex gap-3 text-[15px] leading-relaxed text-fg">
              <span className="mt-0.5 flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg" aria-hidden="true">
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );
    case "pairs": {
      const cities = b.items.every((x) => x.value === "Coming soon");
      if (cities) {
        return (
          <ul className="grid gap-3 sm:grid-cols-2">
            {b.items.map((it) => {
              const m = it.label.match(/^(.*?) \((.*)\)$/);
              return (
                <li key={it.label} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
                  <span className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2 text-crimson-text"><MapPin className="size-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{m ? m[1] : it.label}</span>
                    {m && <span className="block text-xs text-fg-muted">{m[2]}</span>}
                  </span>
                  <span className="flex-shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold-text">Coming soon</span>
                </li>
              );
            })}
          </ul>
        );
      }
      return (
        <ul className="grid gap-3 sm:grid-cols-2">
          {b.items.map((it, i) => (
            <li key={it.label} className="rounded-xl border border-line bg-surface p-4">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gold-text" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className="block text-base font-bold text-crimson-text">{it.label}</span>
              <span className="mt-1 block text-sm leading-relaxed text-fg-muted">{it.value.charAt(0).toUpperCase() + it.value.slice(1)}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead style={{ background: P, color: "#fff" }}>
              <tr>{b.head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r[0]} className="border-t border-line text-fg odd:bg-surface even:bg-surface-2">
                  {r.map((c, j) => (j === 0
                    ? <th key={j} scope="row" className="px-4 py-3 font-semibold">{c}</th>
                    : <td key={j} className="px-4 py-3">{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cta":
      return (
        <div className="flex flex-wrap gap-3 pt-1">
          {b.actions.map((a, j) => (
            <button key={a} type="button" onClick={() => { onClose(); contact(a); }}
              className={"inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold transition-opacity hover:opacity-90 " + (j === 0 ? "bg-brand text-brand-fg" : "border-2 border-brand text-crimson-text")}>
              {a}{j === 0 && <ArrowRight className="size-4" aria-hidden="true" />}
            </button>
          ))}
        </div>
      );
  }
}

export function CorporateSocialResponsibilityViewer({ isOpen, onClose, onNavigate }: Props) {
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const tab: Tab = TABS[active];
  const { intro, sections } = useMemo(() => toSections(tab.blocks), [tab]);
  usePageTitle(isOpen ? `${tab.title} | Social Responsibility | VINK` : "");

  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [active]);
  if (!isOpen) return null;

  const meta = META[tab.label];
  const prev = TABS[active - 1];
  const next = TABS[active + 1];
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div ref={scroller} data-theme-aware className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg text-fg [&>*]:shrink-0">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 shadow-sm">
        <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
          <X className="size-5" />
        </button>
      </div>

      {/* Main nav */}
      <div className="flex gap-6 overflow-x-auto border-b border-line bg-surface px-6 text-sm">
        {["Personal", "Business", "Corporate"].map((item) => (
          <span key={item} className="flex-shrink-0 py-3 font-medium"
            style={{ color: item === "Corporate" ? "var(--vk-crimson-text)" : "var(--vk-fg-muted)", borderBottom: item === "Corporate" ? "2px solid var(--vk-crimson-text)" : "2px solid transparent" }}>
            {item}
          </span>
        ))}
      </div>

      {/* Corporate sub nav */}
      <div className="flex items-center overflow-x-auto px-6" style={{ background: P }}>
        <div className="flex flex-1">
          {CORPORATE_SUB_NAV.map((item) => {
            const on = item === "Social Responsibility";
            return (
              <button key={item} type="button" onClick={() => onNavigate(item)} aria-current={on ? "page" : undefined}
                className="flex-shrink-0 cursor-pointer border-none bg-transparent px-3 py-3 text-xs transition-colors"
                style={{ color: on ? "#fff" : "rgba(255,255,255,.75)", borderBottom: on ? "3px solid #fff" : "3px solid transparent", fontWeight: on ? 600 : 400 }}>
                {item}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => { onClose(); contact("Get Help"); }} className="flex-shrink-0 rounded px-3 py-1.5 text-xs font-medium" style={{ color: "rgba(255,255,255,.85)" }}>Get Help</button>
      </div>

      {/* Hero */}
      <header className="relative overflow-hidden text-white" style={{ background: "linear-gradient(135deg,#2E0B10 0%,#5C0A10 55%,#7a1018 100%)" }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle,#C9A84C 0%,transparent 70%)" }} />
        <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1 text-xs font-semibold uppercase tracking-widest" style={{ color: "#E8D9B0" }}>
            <Landmark className="size-3.5" aria-hidden="true" /> Social Responsibility
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight md:text-5xl">Social Development</h1>
          <p className="mt-3 max-w-2xl text-base text-white/85 md:text-lg">
            Cleaner, safer and more inclusive cities across South Africa and Zambia, funded by a dedicated portion of VINK’s profits.
          </p>
          <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.l} className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
                <dd className="text-lg font-bold leading-tight" style={{ color: "#E8D9B0" }}>{s.v}</dd>
                <dt className="text-xs uppercase tracking-wider text-white/75">{s.l}</dt>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* Tab bar */}
      <nav aria-label="Social Development sections" className="sticky top-[57px] z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
          {TABS.map((t, i) => {
            const on = i === active;
            return (
              <button key={t.label} type="button" aria-current={on ? "page" : undefined} onClick={() => setActive(i)}
                className={"inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors " + (on ? "bg-brand text-brand-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
                <span className="[&>svg]:size-4" aria-hidden="true">{META[t.label].icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Body */}
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Outline */}
        <aside className="hidden lg:block">
          <div className="sticky top-32">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-fg-muted">On this page</p>
            <ul className="space-y-1 border-l border-line">
              {sections.map((s) => (
                <li key={s.title}>
                  <button type="button" onClick={() => jump(slug(s.title))} className="-ml-px block w-full border-l-2 border-transparent py-1.5 pl-4 text-left text-sm text-fg-muted transition-colors hover:border-brand hover:text-fg">
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="min-w-0 space-y-6" id="sr-content">
          <div>
            <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand text-brand-fg [&>svg]:size-6" aria-hidden="true">{meta.icon}</span>
            <h2 className="text-2xl font-bold text-crimson-text md:text-3xl">{tab.title}</h2>
            <p className="mt-1 text-fg-muted">{meta.blurb}</p>
          </div>

          {intro.length > 0 && (
            <div className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
              {intro.map((b, i) => <BlockView key={i} b={b} onClose={onClose} />)}
            </div>
          )}

          {sections.map((s) => (
            <section key={s.title} id={slug(s.title)} aria-labelledby={slug(s.title) + "-h"} className="scroll-mt-32 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
              <h3 id={slug(s.title) + "-h"} className="flex items-center gap-3 text-lg font-bold text-fg">
                <span aria-hidden="true" className="h-5 w-1 rounded-full" style={{ background: BRAND.gold }} />
                {s.title}
              </h3>
              {s.blocks.map((b, i) => <BlockView key={i} b={b} onClose={onClose} />)}
            </section>
          ))}

          {/* Previous / next */}
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            {prev ? (
              <button type="button" onClick={() => setActive(active - 1)} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-brand">
                <ChevronLeft className="size-5 flex-shrink-0 text-fg-muted group-hover:text-fg" aria-hidden="true" />
                <span><span className="block text-xs uppercase tracking-wider text-fg-muted">Previous</span><span className="font-semibold text-fg">{prev.label}</span></span>
              </button>
            ) : <span />}
            {next && (
              <button type="button" onClick={() => setActive(active + 1)} className="group flex items-center justify-end gap-3 rounded-2xl border border-line bg-surface p-4 text-right transition-colors hover:border-brand">
                <span><span className="block text-xs uppercase tracking-wider text-fg-muted">Next</span><span className="font-semibold text-fg">{next.label}</span></span>
                <ChevronRight className="size-5 flex-shrink-0 text-fg-muted group-hover:text-fg" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Closing call to action */}
          <div className="rounded-2xl p-6 text-white md:flex md:items-center md:justify-between md:gap-6" style={{ background: "linear-gradient(135deg,#2E0B10,#5C0A10)" }}>
            <div>
              <h3 className="text-lg font-bold">Be part of the launch</h3>
              <p className="mt-1 text-sm text-white/80">Businesses, property owners, NGOs and community organisations: get in touch and work with us from day one.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 md:mt-0 md:flex-shrink-0">
              <button type="button" onClick={() => { onClose(); contact("Register your interest"); }} className="inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold" style={{ background: BRAND.gold, color: "#14161d" }}>Register your interest</button>
              <button type="button" onClick={() => { onClose(); contact("Become a partner"); }} className="inline-flex h-11 items-center rounded-full border-2 border-white/60 px-6 text-sm font-semibold">Become a partner</button>
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
