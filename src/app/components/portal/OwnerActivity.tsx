import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, when, inputCls } from "./ui";
import { FileButton } from "./AssociationFinance";

/**
 * The owner's activity log (docs/OWNER_DASHBOARD.md, slice F): who did what and when, in plain words, for the owner and everyone on their team.
 * It is for looking. Nothing here can change or remove a record, and looking at it is not itself recorded.
 */
const COLOR = "#0F766E";
const call = portalClient("owner");
interface Entry { id: string; at: string; actor: string; actorRole: string; group: string; text: string }
interface Page { entries: Entry[]; next: string | null; people: { id: string; name: string; roleText: string }[]; groups: { key: string; label: string }[] }
const GROUP_COLOR: Record<string, string> = { money: "#0F766E", fleet: "#2563EB", documents: "#7C3AED", team: "#D97706", exports: "#6B7280" };

export function ActivityScreen() {
  const [f, setF] = useState({ group: "", actorId: "", from: "", to: "" }), qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const [load] = useLoad<Page>(() => call(`/audit${qs ? `?${qs}` : ""}`), [qs]);
  const [more, setMore] = useState<{ key: string; entries: Entry[]; next: string | null } | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const loadMore = async (next: string) => {
    setBusy(true); setErr(null); const r = await call<Page>(`/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), before: next }).toString()}`); setBusy(false);
    if ("error" in r) { setErr(r.error); return; } const d = r.data as unknown as Page; setMore((m) => ({ key: qs, entries: [...(m && m.key === qs ? m.entries : []), ...d.entries], next: d.next }));
  };
  return (
    <div className="space-y-4">
      <SectionPanel title="Activity log">
        <div className="p-4 space-y-4">
          <p className="text-sm text-fg">A record of what you and your team did, so you can see who did what and when. It is for looking: it cannot be changed. If something was done by mistake, it is put right with a new entry, which then shows here too.</p>
          <Status load={load}>{(p) => {
            const current = more !== null && more.key === qs ? more : null, extra = current ? current.entries : [], next = current ? current.next : p.next, all = [...p.entries, ...extra];                  // extra pages only count for the filters they were loaded with
            return (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block"><span className="text-xs text-fg-muted">What kind</span><select aria-label="Activity kind" className={inputCls + " mt-1 w-64 py-3"} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}><option value="">Everything</option>{p.groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select></label>
                  <label className="block"><span className="text-xs text-fg-muted">Who</span><select aria-label="Activity person" className={inputCls + " mt-1 w-56 py-3"} value={f.actorId} onChange={(e) => setF({ ...f, actorId: e.target.value })}><option value="">Everyone</option>{p.people.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.roleText})</option>)}</select></label>
                  <label className="block"><span className="text-xs text-fg-muted">From</span><input type="date" aria-label="Activity from" className={inputCls + " mt-1 w-44 py-3"} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
                  <label className="block"><span className="text-xs text-fg-muted">To</span><input type="date" aria-label="Activity to" className={inputCls + " mt-1 w-44 py-3"} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
                  <FileButton segment="owner" path={`/audit.csv${qs ? `?${qs}` : ""}`} filename="activity.csv" label="Download as a spreadsheet" />
                </div>
                {all.length === 0 ? <Empty>Nothing was done in this time.</Empty> : (
                  <ul className="space-y-2 text-sm text-fg">{all.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-start gap-2 border-b border-line/60 pb-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: GROUP_COLOR[e.group] ?? "#6B7280" }}>{p.groups.find((g) => g.key === e.group)?.label.split(":")[0] ?? e.group}</span>
                      <span className="flex-1 min-w-[14rem]">{e.text}<span className="block text-xs text-fg-muted">{e.actor}{e.actorRole ? ` (${e.actorRole})` : ""} · {when(e.at)}</span></span>
                    </li>))}</ul>)}
                {err && <p role="alert" className="text-sm text-bad">{err}</p>}
                {next && <button type="button" disabled={busy} onClick={() => loadMore(next)} className="px-6 py-3 rounded-lg text-base font-bold text-white disabled:opacity-60" style={{ background: COLOR }}>{busy ? "Loading…" : "Show older activity"}</button>}
              </>);
          }}</Status>
        </div>
      </SectionPanel>
    </div>
  );
}
