import { useState, type ReactNode } from "react";
import { Tag, Plus, Check } from "lucide-react";
import { inputCls } from "./ui";
import { COLOR, localInput, quickTimes, whenLong, type Call, type Label } from "./mailShared";

/** A button that opens a small list of ready-made times and a box for any other time; used for Snooze and for Schedule send. */
export function TimeMenu({ label, icon, maxDays, title, onPick, buttonClass }: { label: string; icon: ReactNode; maxDays: number; title: string; onPick: (at: Date) => void | Promise<void>; buttonClass: string }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const now = new Date(), min = new Date(now.getTime() + 60_000), max = new Date(now.getTime() + maxDays * 86400_000);
  const times = quickTimes(now).filter((t) => t.at.getTime() >= min.getTime() && t.at.getTime() <= max.getTime());
  const pick = async (at: Date) => { setOpen(false); setCustom(""); await onPick(at); };
  return (
    <span className="relative inline-block">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)} className={buttonClass}>{icon} {label}</button>
      {open && (
        <div role="group" aria-label={title} className="absolute z-20 mt-1 w-64 rounded-lg border border-line bg-surface p-2 shadow-lg text-xs space-y-1">
          <p className="px-1 pb-1 font-bold text-fg">{title}</p>
          {times.map((t) => <button key={t.label} type="button" onClick={() => void pick(t.at)} className="flex w-full justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"><span className="text-fg">{t.label}</span><span className="text-fg-muted">{whenLong(t.at)}</span></button>)}
          <div className="border-t border-line pt-2 space-y-1.5">
            <label className="block text-fg-muted">Pick a date and time
              <input type="datetime-local" aria-label="Pick a date and time" value={custom} min={localInput(min)} max={localInput(max)} onChange={(e) => setCustom(e.target.value)} className={inputCls + " mt-1 !py-1"} /></label>
            <button type="button" disabled={!custom || Number.isNaN(new Date(custom).getTime())} onClick={() => void pick(new Date(custom))} className="w-full rounded-md px-2 py-1.5 font-bold text-white disabled:opacity-50" style={{ background: COLOR }}>{label} for that time</button>
          </div>
        </div>)}
    </span>
  );
}

/** Put labels on a message, take them off, or make a new one. Each choice is saved at once. */
export function LabelMenu({ call, department, kind, id, labels, applied, onChange, onLabelsChanged, buttonClass }: { call: Call; department: string; kind: string; id: string; labels: Label[]; applied: Label[]; onChange: (labels: Label[]) => void; onLabelsChanged: () => void; buttonClass: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const apply = async (labelId: string, on: boolean) => {
    setErr("");
    const r = await call<{ labels: Label[] }>(`/messages/${kind}/${id}/labels`, { method: "POST", body: { labelId, on } });
    if ("error" in r) setErr(r.error); else onChange(r.data.labels);
  };
  return (
    <span className="relative inline-block">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)} className={buttonClass}><Tag className="w-3.5 h-3.5" /> Labels</button>
      {open && (
        <div role="group" aria-label="Labels" className="absolute z-20 mt-1 w-60 rounded-lg border border-line bg-surface p-2 shadow-lg text-xs space-y-1">
          <p className="px-1 pb-1 font-bold text-fg">Labels</p>
          {labels.length === 0 && <p className="px-1 text-fg-muted">No labels yet. Make one below.</p>}
          {labels.map((l) => {
            const on = applied.some((a) => a.id === l.id);
            return (
              <button key={l.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => void apply(l.id, !on)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm" style={{ background: l.color }}>{on && <Check className="h-3 w-3 text-white" />}</span><span className="text-fg">{l.name}</span>
              </button>);
          })}
          <form className="flex gap-1 border-t border-line pt-2" onSubmit={async (e) => {
            e.preventDefault(); setErr("");
            if (!name.trim()) return;
            const r = await call<{ label: Label }>("/labels", { method: "POST", body: { department, name } });
            if ("error" in r) { setErr(r.error); return; }
            setName(""); onLabelsChanged(); await apply(r.data.label.id, true);
          }}>
            <input aria-label="New label" value={name} onChange={(e) => setName(e.target.value)} placeholder="New label" maxLength={40} className={inputCls + " !py-1"} />
            <button type="submit" aria-label="Add label" className="rounded-md px-2 font-bold text-white" style={{ background: COLOR }}><Plus className="h-3.5 w-3.5" /></button>
          </form>
          {err && <p role="alert" className="text-[11px] font-semibold" style={{ color: "#DC2626" }}>{err}</p>}
        </div>)}
    </span>
  );
}
