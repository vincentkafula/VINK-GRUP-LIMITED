import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { authFetch } from "../../services/apiClient";
import { API_BASE } from "../../services/config";

/** Result of a call to the portal API. Narrow with `"data" in r`. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** A small client for one role's portal (for example "owner" -> /api/portal/owner/...). Never throws. */
export function portalClient(segment: string) {
  const base = `${API_BASE}/api/portal/${segment}`;
  return async function call<T = Record<string, never>>(path: string, init?: { method?: string; body?: unknown }): Promise<{ data: T } | { error: string }> {
    try {
      const res = await authFetch(base + path, {
        method: init?.method ?? "GET",
        headers: { "Content-Type": "application/json" },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) return { error: body.error ?? `Request failed (${res.status})` };
      return { data: body as T };
    } catch { return { error: "We could not reach the server. Please try again." }; }
  };
}
export type Call = ReturnType<typeof portalClient>;

export type Load<T> = { state: "loading" } | { state: "error"; error: string } | { state: "ready"; data: T };

/** Loads one endpoint and exposes a reload. Each screen owns its data, so a failure in one never blanks the others. */
export function useLoad<T>(fetcher: () => Promise<{ data: T } | { error: string }>): [Load<T>, () => void] {
  const [v, setV] = useState<Load<T>>({ state: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    fetcher().then((r) => { if (live) setV("data" in r ? { state: "ready", data: r.data } : { state: "error", error: r.error }); });
    return () => { live = false; };
  }, [n]);          // eslint-disable-line react-hooks/exhaustive-deps
  return [v, () => setN((x) => x + 1)];
}

export function Status<T>({ load, children }: { load: Load<T>; children: (d: T) => React.ReactNode }) {
  if (load.state === "loading") return <p className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>;
  if (load.state === "error") return <p role="alert" className="flex items-center gap-2 text-sm text-red-300"><TriangleAlert className="w-4 h-4" />{load.error}</p>;
  return <>{children(load.data)}</>;
}

export const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-white/50">{children}</p>;
export const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p><p className="text-sm text-white">{value || <span className="text-white/30">Not set</span>}</p></div>
);
export const inputCls = "w-full rounded-lg px-3 py-2 text-sm bg-[#0D0B1E] border border-[#2D2A50] text-white placeholder-white/30";

export const rand = (n: number) => "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const when = (iso: string) => new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric" }) : "–");

/** A button that runs an async action, shows progress, and reports the server's message or error next to it. */
export function ActionButton({ label, busyLabel, color, onRun, small, className }: {
  label: string; busyLabel?: string; color: string; small?: boolean; className?: string;
  onRun: () => Promise<{ error?: string; message?: string } | void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true); setMsg(null);
    const r = await onRun();
    setBusy(false);
    if (r && r.error) setMsg({ ok: false, text: r.error });
    else if (r && r.message) setMsg({ ok: true, text: r.message });
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} onClick={run} className={`${small ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-bold disabled:opacity-60 ${className ?? ""}`} style={{ background: color, color: "#101010" }}>
        {busy ? (busyLabel ?? "Working…") : label}
      </button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>}
    </span>
  );
}

/** Reads the server's answer to a write call into the shape ActionButton wants. */
export function outcome(r: { data: { message?: string } } | { error: string }): { error?: string; message?: string } {
  return "error" in r ? { error: r.error } : { message: r.data.message ?? "Done." };
}
