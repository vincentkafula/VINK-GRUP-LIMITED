import { useEffect, useRef, useState } from "react";

/**
 * Two behaviours of writing an email: Undo send (a few seconds in which a click on Send can still be taken back) and Autosave (the draft is saved as you type).
 */
export const UNDO_KEY = "vink.mail.undoSeconds";
export const UNDO_CHOICES = [0, 5, 10, 30] as const;

export function getUndoSeconds(): number {
  try { const raw = localStorage.getItem(UNDO_KEY); const v = Number(raw); return raw !== null && (UNDO_CHOICES as readonly number[]).includes(v) ? v : 5; } catch { return 5; }
}

/** "Undo send: Off / 5 / 10 / 30 seconds", remembered on this computer. */
export function UndoSetting() {
  const [v, setV] = useState(getUndoSeconds());
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">Undo send
      <select aria-label="Undo send" value={v} onChange={(e) => { const n = Number(e.target.value); setV(n); try { localStorage.setItem(UNDO_KEY, String(n)); } catch { /* not remembered */ } }} className="rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-fg">
        {UNDO_CHOICES.map((n) => <option key={n} value={n}>{n === 0 ? "Off" : `${n} seconds`}</option>)}
      </select>
    </label>
  );
}

type Outcome = { error?: string; message?: string } | void;

/**
 * Send button with Undo. After a click it counts down (the person's Undo send setting, default 5 seconds) and only then sends; Undo cancels. If the person leaves
 * while it is counting down, the message is sent at once rather than lost. With the setting Off it sends immediately.
 */
export function SendButton({ label, color, onSend, onBeforeSend }: { label: string; color: string; onSend: () => Promise<Outcome>; onBeforeSend?: () => void }) {
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const latest = useRef(onSend); latest.current = onSend;
  const before = useRef(onBeforeSend); before.current = onBeforeSend;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counting = useRef(false);
  const alive = useRef(true);

  const send = async () => {
    counting.current = false; if (timer.current) clearTimeout(timer.current);
    if (alive.current) { setLeft(null); setBusy(true); setMsg(null); }
    before.current?.();
    const r = await latest.current();
    if (!alive.current) return;
    setBusy(false);
    if (r && r.error) setMsg({ ok: false, text: r.error }); else if (r && r.message) setMsg({ ok: true, text: r.message });
  };
  const tick = (n: number) => { setLeft(n); timer.current = setTimeout(() => { if (n <= 1) void send(); else tick(n - 1); }, 1000); };
  const click = () => { const secs = getUndoSeconds(); setMsg(null); if (secs === 0) { void send(); return; } counting.current = true; tick(secs); };
  const undo = () => { counting.current = false; if (timer.current) clearTimeout(timer.current); setLeft(null); setMsg({ ok: true, text: "Not sent. Your message is still here." }); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); if (counting.current) { counting.current = false; before.current?.(); void latest.current(); } }; }, []);

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      {left === null
        ? <button type="button" disabled={busy} onClick={click} className="px-4 py-2 text-sm rounded-lg font-bold disabled:opacity-60" style={{ background: color, color: "#101010" }}>{busy ? "Sending…" : label}</button>
        : <><span role="status" className="text-xs font-semibold text-fg">Sending in {left}…</span><button type="button" onClick={undo} className="px-3 py-1.5 text-xs rounded-lg font-bold border border-line text-fg hover:bg-surface-2">Undo</button></>}
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</span>}
    </span>
  );
}

/** Saves a draft a moment after the person stops typing. `snapshot` is anything that changes when the draft does; `stop()` cancels it for good (call it when the email is sent). */
export function useAutosave(snapshot: string, save: () => Promise<boolean>, delay = 1500) {
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const first = useRef(true), last = useRef(snapshot), timer = useRef<ReturnType<typeof setTimeout> | null>(null), stopped = useRef(false), dirty = useRef(false);
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    if (first.current) { first.current = false; last.current = snapshot; return; }
    if (snapshot === last.current || stopped.current) return;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      dirty.current = false; last.current = snapshot; setStatus("saving");
      const ok = await saveRef.current();
      setStatus(ok ? "saved" : "error");
    }, delay);
  }, [snapshot, delay]);
  // leaving with unsaved changes: save them now rather than lose them
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (dirty.current && !stopped.current) void saveRef.current(); }, []);
  const stop = () => { stopped.current = true; dirty.current = false; if (timer.current) clearTimeout(timer.current); };
  return { status, stop };
}
