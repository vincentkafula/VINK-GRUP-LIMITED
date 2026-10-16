import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";

/**
 * The animated, accessible accordion used by the Contact and Careers pages (styled by contact.css).
 * Closed panels are inert, so their contents cannot be tabbed to or read while hidden.
 */
export interface Row { icon: React.ReactNode; label: string; value: string; href?: string }
export interface AccItem { id: string; title: string; tag?: string; intro?: string; rows?: Row[]; bullets?: string[]; link?: { label: string; onClick: () => void } }

/** Closed panels are inert, so their contents cannot be tabbed to or read while hidden, and they animate open and shut. */
const inertWhen = (closed: boolean) => (closed ? ({ inert: "" } as Record<string, string>) : {});

export function Accordion({ items, label }: { items: AccItem[]; label: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="vc-acc" role="list" aria-label={label}>
      {items.map((it) => {
        const isOpen = open.has(it.id);
        return (
          <div key={it.id} role="listitem" className={`vc-acc__item${isOpen ? " is-open" : ""}`}>
            <h3 className="vc-acc__head">
              <button className="vc-acc__btn" type="button" id={`acc-btn-${it.id}`} aria-expanded={isOpen} aria-controls={`acc-panel-${it.id}`} onClick={() => toggle(it.id)}>
                <span>{it.title}{it.tag && <span className="vc-acc__tag">{it.tag}</span>}</span>
                <ChevronDown className="vc-icon vc-acc__chev" aria-hidden="true" />
              </button>
            </h3>
            <div className="vc-acc__panel" id={`acc-panel-${it.id}`} role="region" aria-labelledby={`acc-btn-${it.id}`} data-open={isOpen} {...inertWhen(!isOpen)}>
              <div className="vc-acc__clip"><div className="vc-acc__inner">
                {it.intro && <p className="vc-acc__intro">{it.intro}</p>}
                {it.rows && (
                  <ul className="vc-acc-rows">
                    {it.rows.map((r) => (
                      <li key={r.label + r.value} className="vc-acc-row">
                        <span className="vc-acc-row__icon" aria-hidden="true">{r.icon}</span>
                        <span className="vc-acc-row__text">
                          <span className="vc-acc-row__label">{r.label}</span>
                          <span className="vc-acc-row__value">{r.href ? <a href={r.href}>{r.value}</a> : r.value}</span>
                        </span>
                      </li>))}
                  </ul>)}
                {it.bullets && <ul className="vc-acc__bullets">{it.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
                {it.link && <p className="vc-acc__link"><button type="button" onClick={it.link.onClick}>{it.link.label} <ArrowRight className="vc-icon" aria-hidden="true" /></button></p>}
              </div></div>
            </div>
          </div>);
      })}
    </div>
  );
}
