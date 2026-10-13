import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Footer } from "./Footer";
import siteHeroBg from "../../imports/assets/site-hero-bg.webp";

export interface DetailGroup { head: string; items: string[]; ordered?: boolean }

/** Everything the full-page "see details" view of a product shows. Each product page maps its own data onto this. */
export interface ProductDetail {
  eyebrow: string;
  name: string;
  tagline?: string;
  overview?: string;
  folio?: string;
  featured?: boolean;
  /** the fee, shown large in the top band */
  price?: { value: string; label: string };
  /** a figure that stands in for the fee: an indicative term, a timeline */
  stat?: { label: string; value: string };
  featuresHead?: string;
  features?: string[];
  idealHead?: string;
  idealFor?: string[];
  groups?: DetailGroup[];
  note?: string;
  /** a line under the overview that is not a list, such as a price in the viewer's currency */
  extra?: string;
  backLabel: string;
  applyLabel?: string;
}

interface Props { detail: ProductDetail; onBack: () => void; onApply: () => void }

function Check({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-sm leading-relaxed text-fg">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-crimson-text" aria-hidden="true" /><span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The full page a visitor gets from "See details" or "Tell me more": it fills the screen under the site header, the same as every other page,
 * instead of a small box over the list. The way back is the button at the top, the one at the bottom, and the Escape key.
 */
export function ProductDetailPage({ detail: d, onBack, onApply }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onBack]);

  return (
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={d.name} data-product-detail data-theme-aware
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-bg text-fg outline-none [&>*]:shrink-0">
      {/* Top band */}
      <header className="relative overflow-hidden px-6 py-14 text-center text-white md:py-20" style={{ background: "#C8102E" }}>
        <img loading="lazy" decoding="async" src={siteHeroBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.14] mix-blend-luminosity" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center">
          <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10">
            <ArrowLeft className="size-4" aria-hidden="true" /> {d.backLabel}
          </button>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white">{d.eyebrow}{d.folio ? ` · Folio No. ${d.folio}` : ""}</p>
          <h1 className="mt-3 text-3xl font-black leading-[1.1] sm:text-5xl">{d.name}</h1>
          {d.featured && <span className="mt-3 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "#C8102E" }}>Featured</span>}
          {d.tagline && <p className="mt-4 text-base italic text-white/90 sm:text-lg">{d.tagline}</p>}
          {(d.price || d.stat) && (
            <p className="mt-6 flex flex-col items-center gap-1">
              <span className="text-3xl font-black sm:text-4xl">{d.price ? d.price.value : d.stat!.value}</span>
              <span className="text-sm text-white/85">{d.price ? d.price.label : d.stat!.label}</span>
            </p>
          )}
          <button type="button" onClick={onApply} className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-sm font-bold" style={{ color: "#C8102E" }}>
            {d.applyLabel ?? "Apply now"} <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-12">
        {d.overview && (
          <section aria-label="Overview" className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold text-crimson-text md:text-3xl">About this product</h2>
            <span aria-hidden="true" className="mx-auto mt-3 block h-1 w-14 rounded-full" style={{ background: "#C8102E" }} />
            <p className="mt-5 text-base leading-relaxed text-fg-muted">{d.overview}</p>
            {d.extra && <p className="mt-3 text-sm text-fg-muted">{d.extra}</p>}
          </section>
        )}

        {d.stat && d.price && (
          <p className="mx-auto flex max-w-xl flex-col items-center gap-1 rounded-2xl border border-line bg-surface-2 p-5 text-center">
            <span className="text-sm text-fg-muted">{d.stat.label}</span><strong className="text-lg text-crimson-text">{d.stat.value}</strong>
          </p>
        )}

        {d.features && d.features.length > 0 && (
          <section className="rounded-3xl border border-line bg-surface p-7 shadow-card">
            <h3 className="mb-5 text-center text-lg font-bold text-crimson-text">{d.featuresHead ?? "Key benefits"}</h3>
            <Check items={d.features} />
          </section>
        )}

        {d.idealFor && d.idealFor.length > 0 && (
          <section className="rounded-3xl border border-line bg-surface p-7 shadow-card">
            <h3 className="mb-5 text-center text-lg font-bold text-crimson-text">{d.idealHead ?? "Ideal for"}</h3>
            <Check items={d.idealFor} />
          </section>
        )}

        {d.groups && d.groups.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {d.groups.map((g) => (
              <section key={g.head} className="rounded-3xl border border-line bg-surface p-7 shadow-card">
                <h3 className="mb-4 text-center text-lg font-bold text-crimson-text">{g.head}</h3>
                {g.ordered
                  ? <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-fg marker:font-semibold marker:text-crimson-text">{g.items.map((i) => <li key={i}>{i}</li>)}</ol>
                  : <ul className="space-y-2.5 text-sm leading-relaxed text-fg">{g.items.map((i) => <li key={i} className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-crimson-text" aria-hidden="true" /><span>{i}</span></li>)}</ul>}
              </section>
            ))}
          </div>
        )}

        {d.note && <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-fg-muted">{d.note}</p>}

        <section className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-3xl p-8 text-center text-white md:p-10" style={{ background: "linear-gradient(135deg,#101828,#C8102E)" }}>
          <h3 className="text-2xl font-bold">Ready to get started?</h3>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={onApply} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-sm font-bold" style={{ color: "#C8102E" }}>{d.applyLabel ?? "Apply now"} <ArrowRight className="size-4" aria-hidden="true" /></button>
            <button type="button" onClick={onBack} className="inline-flex h-12 items-center gap-2 rounded-full border border-white/50 px-8 text-sm font-semibold text-white hover:bg-white/10"><ArrowLeft className="size-4" aria-hidden="true" /> {d.backLabel}</button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
