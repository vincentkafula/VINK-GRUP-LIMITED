import { useCallback, useEffect, useRef, useState } from "react";
import { PAGES } from "./pages";
import { ViewRuntimeContext, note, setPageElement, type View, type PageCtx } from "./kit";
import { toast } from "./dialogs";

/** Filter values live here, per page, so they survive moving between pages in one visit. */
export type FilterStore = Record<string, string>;

const COMING_SOON: View = {
  title: "Coming soon",
  sub: "This page is planned for a later phase.",
  content: note("It needs a provider or workflow that has not been connected yet."),
};

export function PageHost({ id, filters, onAuthError }: { id: string; filters: React.MutableRefObject<FilterStore>; onAuthError: (e: Error & { status?: number; code?: string }) => void }) {
  const [view, setView] = useState<View | null>(null);
  const latest = useRef(0);

  const F = useCallback((name: string) => filters.current[id + name] ?? "", [filters, id]);
  const setF = useCallback((name: string, value: string) => { filters.current[id + name] = value; }, [filters, id]);

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    const page = PAGES[id];
    let next: View;
    if (!page) next = COMING_SOON;
    else {
      try {
        next = await page({ F, setF } as PageCtx);
      } catch (e) {
        const err = e as Error & { status?: number };
        if (err.status === 401 || err.status === 403) onAuthError(err);
        next = { title: "Something went wrong", content: note(err.message) };
      }
    }
    if (ticket === latest.current) setView(next);
  }, [id, F, setF, onAuthError]);

  useEffect(() => { setView(null); void load(); }, [load]);

  const run = useCallback(async (fn: () => Promise<void> | void) => {
    try { await fn(); } catch (e) { toast((e as Error).message); }
    await load();
  }, [load]);

  if (!view) return <div className="pad" role="status" aria-live="polite"><p className="empty">Loading…</p></div>;

  const commit = (name: string, el: HTMLInputElement | HTMLSelectElement) => {
    if (F(name) === el.value) return;
    setF(name, el.value);
    void load();
  };

  return (
    <ViewRuntimeContext.Provider value={{ run, on: view.on ?? {} }}>
      <div className="pad" id="pg" ref={setPageElement}>
        <div className="pghead">
          <div><h1>{view.title}</h1>{view.sub && <p>{view.sub}</p>}</div>
          <div className="pgact">
            {(view.actions ?? []).map((a, i) => <button key={i} className={`btn ${a.p ? "p" : "g"}`} onClick={() => run(a.fn)}>{a.label}</button>)}
          </div>
        </div>
        {(view.filters?.length ?? 0) > 0 && (
          <div className="fbar">
            {view.filters!.map((f) => f.type === "select" ? (
              <select key={f.name} aria-label={f.label} value={F(f.name)} onChange={(e) => commit(f.name, e.currentTarget)}>
                {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <input
                key={f.name} type={f.type || "search"} placeholder={f.label} aria-label={f.label} defaultValue={F(f.name)}
                onBlur={(e) => commit(f.name, e.currentTarget)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(f.name, e.currentTarget); }}
              />
            ))}
          </div>
        )}
        {view.content}
      </div>
    </ViewRuntimeContext.Provider>
  );
}
