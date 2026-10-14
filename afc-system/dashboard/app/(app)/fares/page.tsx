"use client";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Table, messageOf, useLoad } from "@/components/ui";
import { api, rand, toCents, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Stop { id: number; name: string; zone: number; seq: number }
type Fare = { mode: "flat"; flatAmount: number } | { mode: "zone"; minFare: number; maxFare: number; zoneFares: { from: number; to: number; amount: number }[] };
interface Route { id: number; code: string; name: string; operatorId: number; stops: Stop[]; fare: Fare; apbSeconds: number; tapOutTimeoutSeconds: number }
interface TimeRule { id?: number; name: string; days: number[]; startMinute: number; endMinute: number; multiplierBp: number }
interface Table { version: number; publishedAt: string; routes: Route[]; timeRules: TimeRule[]; discounts: { category: string; discountBp: number }[] }

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutes = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
// the database stores the published copy as JSON with its keys in a different order, so compare with sorted keys
const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));
const rulesOf = (t: Table) => canon([t.routes, t.timeRules.map(({ id: _i, ...r }) => r), [...t.discounts].sort((x, y) => x.category.localeCompare(y.category))]);
const sameRules = (a: Table, b: Table) => rulesOf(a) === rulesOf(b);

export default function Fares() {
  const { can } = useAuth();
  const draft = useLoad(() => api<{ table: Table }>("/api/fares/draft"));
  const pub = useLoad(() => api<{ table: Table | null }>("/api/fares/published"));
  const [editing, setEditing] = useState<Route | "new" | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const reloadAll = async () => { await Promise.all([draft.reload(), pub.reload()]); };
  const unpublished = draft.data && pub.data && (!pub.data.table || !sameRules(draft.data.table, pub.data.table));

  const publish = async () => {
    if (!window.confirm("Publish these fares? Every validator picks them up on its next sync.")) return;
    try { const r = await api<{ table: Table }>("/api/fares/publish", { method: "POST" }); setNote({ ok: true, text: `Version ${r.table.version} published.` }); await reloadAll(); } catch (e) { setNote({ ok: false, text: messageOf(e) }); }
  };

  return (
    <>
      <PageHeader title="Fares & routes" sub={pub.data?.table ? `Devices are using version ${pub.data.table.version}, published ${when(pub.data.table.publishedAt)}` : "Nothing published yet"}
        actions={can("OPERATOR") && (<><Button variant="ghost" onClick={() => setEditing("new")}>Add a route</Button><Button onClick={publish} disabled={!unpublished}>Publish changes</Button></>)} />
      {unpublished && <div role="status" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">You have changes that validators cannot see yet. Publish them when you are ready.</div>}
      {note && <div role={note.ok ? "status" : "alert"} className={`mb-4 rounded-md p-3 text-sm ${note.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{note.text}</div>}
      {draft.error && <ErrorNote error={draft.error} retry={reloadAll} />}
      {draft.loading && !draft.data ? <Loading /> : draft.data && (
        <div className="space-y-5">
          <Card title="Routes">
            <Table rowKey={(r) => String(r.id)} rows={draft.data.table.routes} empty="No routes yet." cols={[
              { h: "Code", f: (r) => <span className="font-mono">{r.code}</span> }, { h: "Name", f: (r) => r.name },
              { h: "Fare", f: (r) => (r.fare.mode === "flat" ? `Flat ${rand(r.fare.flatAmount)}` : `Zones ${rand(r.fare.minFare)}–${rand(r.fare.maxFare)}`) },
              { h: "Stops", right: true, f: (r) => r.stops.length }, { h: "Re-tap block", right: true, f: (r) => `${r.apbSeconds}s` },
              { h: "", f: (r) => (can("OPERATOR") ? <button className="underline" onClick={() => setEditing(r)}>Edit</button> : null) },
            ]} />
          </Card>
          <TimeRules rules={draft.data.table.timeRules} canEdit={can()} onSaved={reloadAll} />
          <Discounts rows={draft.data.table.discounts} canEdit={can()} onSaved={reloadAll} />
        </div>
      )}
      {editing && <RouteEditor route={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reloadAll(); }} />}
    </>
  );
}

function TimeRules({ rules, canEdit, onSaved }: { rules: TimeRule[]; canEdit: boolean; onSaved(): Promise<void> }) {
  const [rows, setRows] = useState<TimeRule[]>(rules); const [err, setErr] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const set = (i: number, patch: Partial<TimeRule>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => {
    setErr(null); setSaved(false);
    try { await api("/api/fares/time-rules", { method: "PUT", body: rows.map(({ id: _i, ...r }) => r) }); setSaved(true); await onSaved(); } catch (e) { setErr(messageOf(e)); }
  };
  return (
    <Card title="Time of day" actions={canEdit && <><Button variant="ghost" onClick={() => setRows([...rows, { name: "New rule", days: [1, 2, 3, 4, 5], startMinute: 360, endMinute: 540, multiplierBp: 12000 }])}>Add</Button><Button onClick={save}>Save</Button></>}>
      <p className="mb-3 text-sm text-slate-500">Changes the base fare during part of the day. 120% is a peak surcharge, 80% an off-peak discount. The first matching rule applies.</p>
      {err && <ErrorNote error={err} />}{saved && <p role="status" className="mb-2 text-sm text-emerald-700">Saved. Publish to send it to validators.</p>}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 p-3">
            <div className="min-w-[10rem] flex-1"><Field label="Name"><Input disabled={!canEdit} value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></Field></div>
            <fieldset className="text-sm"><legend className="mb-1 font-medium">Days</legend><div className="flex gap-1">{DAYS.map((d, n) => <label key={d} className="flex items-center gap-0.5 text-xs"><input type="checkbox" disabled={!canEdit} checked={r.days.includes(n)} onChange={(e) => set(i, { days: e.target.checked ? [...r.days, n].sort() : r.days.filter((x) => x !== n) })} />{d}</label>)}</div></fieldset>
            <Field label="From"><Input type="time" disabled={!canEdit} value={hhmm(r.startMinute)} onChange={(e) => set(i, { startMinute: minutes(e.target.value) })} /></Field>
            <Field label="To"><Input type="time" disabled={!canEdit} value={hhmm(r.endMinute === 1440 ? 1439 : r.endMinute)} onChange={(e) => set(i, { endMinute: minutes(e.target.value) })} /></Field>
            <div className="flex items-end gap-2"><Field label="Fare %"><Input type="number" min={0} max={300} className="w-24" disabled={!canEdit} value={r.multiplierBp / 100} onChange={(e) => set(i, { multiplierBp: Math.round(Number(e.target.value) * 100) })} /></Field>{canEdit && <button className="pb-2 text-red-700 underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>}</div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">No time-of-day rules: the base fare applies all day.</p>}
      </div>
    </Card>
  );
}

function Discounts({ rows: initial, canEdit, onSaved }: { rows: { category: string; discountBp: number }[]; canEdit: boolean; onSaved(): Promise<void> }) {
  const [rows, setRows] = useState(initial); const [err, setErr] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const save = async () => { setErr(null); setSaved(false); try { await api("/api/fares/discounts", { method: "PUT", body: rows }); setSaved(true); await onSaved(); } catch (e) { setErr(messageOf(e)); } };
  return (
    <Card title="Passenger discounts" actions={canEdit && <Button onClick={save}>Save</Button>}>
      {err && <ErrorNote error={err} />}{saved && <p role="status" className="mb-2 text-sm text-emerald-700">Saved. Publish to send it to validators.</p>}
      <div className="grid gap-3 sm:grid-cols-5">
        {rows.map((r, i) => <Field key={r.category} label={`${r.category} (% off)`}><Input type="number" min={0} max={100} disabled={!canEdit} value={r.discountBp / 100} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, discountBp: Math.round(Number(e.target.value) * 100) } : x)))} /></Field>)}
      </div>
    </Card>
  );
}

function RouteEditor({ route, onClose, onSaved }: { route: Route | null; onClose(): void; onSaved(): Promise<void> }) {
  const ops = useLoad(() => api<{ operators: { id: number; name: string }[] }>("/api/operators"));
  const [r, setR] = useState<Route>(route ?? { id: 0, code: "", name: "", operatorId: 1, apbSeconds: 120, tapOutTimeoutSeconds: 14400, stops: [{ id: 0, name: "", zone: 1, seq: 1 }], fare: { mode: "flat", flatAmount: 1200 } });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const f = r.fare;
  const setStop = (i: number, p: Partial<Stop>) => setR({ ...r, stops: r.stops.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const setZone = (i: number, p: Partial<{ from: number; to: number; amount: number }>) => f.mode === "zone" && setR({ ...r, fare: { ...f, zoneFares: f.zoneFares.map((z, j) => (j === i ? { ...z, ...p } : z)) } });

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (route) await api(`/api/fares/routes/${r.id}`, { method: "PUT", body: r }); else await api("/api/fares/routes", { method: "POST", body: r });
      await onSaved();
    } catch (x) { setErr(messageOf(x)); } finally { setBusy(false); }
  };
  const deactivate = async () => { if (!route || !window.confirm(`Remove route ${route.code} from the fare table?`)) return; try { await api(`/api/fares/routes/${route.id}`, { method: "DELETE" }); await onSaved(); } catch (x) { setErr(messageOf(x)); } };

  return (
    <Modal title={route ? `Edit route ${route.code}` : "Add a route"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {err && <ErrorNote error={err} />}
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Route number"><Input type="number" required disabled={!!route} value={r.id || ""} onChange={(e) => setR({ ...r, id: Number(e.target.value) })} /></Field>
          <Field label="Code"><Input required value={r.code} onChange={(e) => setR({ ...r, code: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Name"><Input required value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field></div>
          <Field label="Operator"><Select value={r.operatorId} onChange={(e) => setR({ ...r, operatorId: Number(e.target.value) })}>{(ops.data?.operators ?? [{ id: r.operatorId, name: `Operator ${r.operatorId}` }]).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <Field label="Block re-taps for (seconds)"><Input type="number" min={0} value={r.apbSeconds} onChange={(e) => setR({ ...r, apbSeconds: Number(e.target.value) })} /></Field>
          <Field label="Charge the maximum if not tapped out after (seconds)"><Input type="number" min={300} value={r.tapOutTimeoutSeconds} onChange={(e) => setR({ ...r, tapOutTimeoutSeconds: Number(e.target.value) })} /></Field>
          <Field label="Fare type"><Select value={f.mode} onChange={(e) => setR({ ...r, fare: e.target.value === "flat" ? { mode: "flat", flatAmount: 1200 } : { mode: "zone", minFare: 800, maxFare: 2800, zoneFares: [{ from: 1, to: 1, amount: 800 }] } })}><option value="flat">Flat fare (one tap)</option><option value="zone">By zone (tap in, tap out)</option></Select></Field>
        </div>
        {f.mode === "flat" ? (
          <Field label="Fare (rand)"><Input inputMode="decimal" className="max-w-[10rem]" defaultValue={(f.flatAmount / 100).toFixed(2)} onChange={(e) => { try { setR({ ...r, fare: { mode: "flat", flatAmount: toCents(e.target.value) } }); } catch { /* ignore until valid */ } }} /></Field>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Minimum fare (rand)"><Input inputMode="decimal" defaultValue={(f.minFare / 100).toFixed(2)} onChange={(e) => { try { setR({ ...r, fare: { ...f, minFare: toCents(e.target.value) } }); } catch { /* wait */ } }} /></Field>
              <Field label="Maximum fare (rand)" hint="Also the balance needed to tap in"><Input inputMode="decimal" defaultValue={(f.maxFare / 100).toFixed(2)} onChange={(e) => { try { setR({ ...r, fare: { ...f, maxFare: toCents(e.target.value) } }); } catch { /* wait */ } }} /></Field>
            </div>
            <div><div className="mb-1 flex items-center justify-between text-sm font-medium">Zone-to-zone fares <button type="button" className="underline" onClick={() => setR({ ...r, fare: { ...f, zoneFares: [...f.zoneFares, { from: 1, to: 1, amount: f.minFare }] } })}>Add pair</button></div>
              <div className="space-y-1">{f.zoneFares.map((z, i) => (
                <div key={i} className="flex items-center gap-2 text-sm"><Input aria-label="From zone" type="number" min={1} className="w-20" value={z.from} onChange={(e) => setZone(i, { from: Number(e.target.value) })} />→<Input aria-label="To zone" type="number" min={1} className="w-20" value={z.to} onChange={(e) => setZone(i, { to: Number(e.target.value) })} />
                  <Input aria-label="Fare in rand" inputMode="decimal" className="w-28" defaultValue={(z.amount / 100).toFixed(2)} onChange={(e) => { try { setZone(i, { amount: toCents(e.target.value) }); } catch { /* wait */ } }} />
                  <button type="button" className="text-red-700 underline" onClick={() => setR({ ...r, fare: { ...f, zoneFares: f.zoneFares.filter((_, j) => j !== i) } })}>Remove</button></div>))}</div>
              <p className="mt-1 text-xs text-slate-500">Either direction. A pair left out is charged the maximum fare.</p></div>
          </div>
        )}
        <div><div className="mb-1 flex items-center justify-between text-sm font-medium">Stops <button type="button" className="underline" onClick={() => setR({ ...r, stops: [...r.stops, { id: 0, name: "", zone: 1, seq: r.stops.length + 1 }] })}>Add stop</button></div>
          <div className="space-y-1">{r.stops.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm"><Input aria-label="Stop number" type="number" required className="w-24" value={s.id || ""} onChange={(e) => setStop(i, { id: Number(e.target.value) })} placeholder="No." /><Input aria-label="Stop name" required className="flex-1" value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} placeholder="Name" />
              <Input aria-label="Zone" type="number" min={1} className="w-20" value={s.zone} onChange={(e) => setStop(i, { zone: Number(e.target.value) })} /><Input aria-label="Order" type="number" min={1} className="w-20" value={s.seq} onChange={(e) => setStop(i, { seq: Number(e.target.value) })} />
              <button type="button" disabled={r.stops.length === 1} className="text-red-700 underline disabled:opacity-40" onClick={() => setR({ ...r, stops: r.stops.filter((_, j) => j !== i) })}>Remove</button></div>))}</div>
          <p className="mt-1 text-xs text-slate-500">Stop number is what the vehicle reports when it arrives; zone drives zone fares; order is the position on the route.</p></div>
        <div className="flex items-center justify-between">{route ? <Button type="button" variant="danger" onClick={deactivate}>Remove route</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save route"}</Button></div></div>
      </form>
    </Modal>
  );
}

