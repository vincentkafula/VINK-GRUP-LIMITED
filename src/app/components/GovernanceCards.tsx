import { useEffect, useState } from "react";
import "./governance.css";

export interface Person { name: string; role: string; tag?: string; note?: string; photo?: string }

/** The silhouette shown until a photo is added: add `photo` to a person and it is used instead. */
const Silhouette = () => <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="40" r="22" /><path d="M12 120c0-30 22-48 48-48s48 18 48 48z" /></svg>;

/**
 * The people of a board or a management team as cards: a portrait frame (the person's photo, or a silhouette), a tag for the chair or the founder, the name and the role.
 * The cards fade in one after another each time the group changes. A count chip says how many people there are.
 */
export function PersonGrid({ people, noun, groupKey }: { people: Person[]; noun: string; groupKey: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const timers = people.map((_, i) => window.setTimeout(() => setShown((n) => Math.max(n, i + 1)), 60 * i));
    return () => timers.forEach(window.clearTimeout);
  }, [groupKey, people.length]);          // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="vg">
      <p className="vg-stat"><b>{people.length}</b><span>{noun}</span></p>
      <ul className="vg-grid" aria-label={noun}>
        {people.map((p, i) => (
          <li key={p.name} className={`vg-card${shown > i ? " in" : ""}`}>
            <div className="vg-ph">
              {p.photo ? <img src={p.photo} alt={p.name} loading="lazy" decoding="async" /> : <Silhouette />}
              {p.tag && <span className="vg-tag">{p.tag}</span>}
            </div>
            <div className="vg-meta">
              <h3>{p.name}</h3>
              <p className="vg-role">{p.role}</p>
              {p.note && <p className="vg-note">{p.note}</p>}
            </div>
          </li>))}
      </ul>
    </div>
  );
}
