import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { SkeletonList } from "../ds";
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
export function useLoad<T>(fetcher: () => Promise<{ data: T } | { error: string }>, deps: unknown[] = []): [Load<T>, () => void] {
  const [v, setV] = useState<Load<T>>({ state: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    // Stale-while-revalidate: keep showing the previous result while a filter change or refresh is loading, so lists do not flash.
    fetcher().then((r) => { if (live) setV("data" in r ? { state: "ready", data: r.data } : { state: "error", error: r.error }); });
    return () => { live = false; };
  }, [n, ...deps]);          // eslint-disable-line react-hooks/exhaustive-deps
  return [v, () => setN((x) => x + 1)];
}

export function Status<T>({ load, children }: { load: Load<T>; children: (d: T) => React.ReactNode }) {
  if (load.state === "loading") return <SkeletonList rows={2} />;
  if (load.state === "error") return <p role="alert" className="flex items-center gap-2 text-sm text-bad"><TriangleAlert className="w-4 h-4" />{load.error}</p>;
  return <>{children(load.data)}</>;
}

export const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-fg-muted">{children}</p>;
export const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><p className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</p><p className="text-sm text-fg">{value || <span className="text-fg-subtle">Not set</span>}</p></div>
);
export const inputCls = "w-full rounded-lg px-3 py-2 text-sm bg-bg border border-line text-fg placeholder:text-fg-subtle";

export const rand = (n: number) => "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const when = (iso: string) => new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric" }) : "–");

/** Text colour that is readable on a button of this colour: white on dark colours, near-black on light ones. */
export function inkOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return "#101010";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25 ? "#ffffff" : "#101010";
}

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
      <button type="button" disabled={busy} onClick={run} className={`${small ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-bold disabled:opacity-60 ${className ?? ""}`} style={{ background: color, color: inkOn(color) }}>
        {busy ? (busyLabel ?? "Working…") : label}
      </button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</span>}
    </span>
  );
}

/** Reads the server's answer to a write call into the shape ActionButton wants. */
export function outcome(r: { data: { message?: string } } | { error: string }): { error?: string; message?: string } {
  return "error" in r ? { error: r.error } : { message: r.data.message ?? "Done." };
}
