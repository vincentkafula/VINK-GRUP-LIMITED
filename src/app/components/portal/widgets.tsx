import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, TriangleAlert } from "lucide-react";
import { authFetch } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { inputCls } from "./ui";

/* ───────────── dates (South African days, UTC+2 with no daylight saving) ───────────── */
export const saToday = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
export const saShift = (day: string, days: number) => new Date(Date.parse(day + "T00:00:00Z") + days * 86400_000).toISOString().slice(0, 10);
export const monthStart = () => saToday().slice(0, 8) + "01";

export interface Range { from: string; to: string }

/** From / to pickers with quick presets. `onChange` fires with valid, ordered dates only. */
export function RangeBar({ value, onChange, color }: { value: Range; onChange: (r: Range) => void; color: string }) {
  const today = saToday();
  const presets: [string, Range][] = [["Last 7 days", { from: saShift(today, -6), to: today }], ["This month", { from: monthStart(), to: today }], ["Last 30 days", { from: saShift(today, -29), to: today }]];
  const set = (k: keyof Range, v: string) => { const next = { ...value, [k]: v }; if (next.from && next.to && next.from <= next.to) onChange(next); };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block"><span className="text-[11px] text-fg-muted">From</span><input type="date" className={inputCls + " mt-1 !w-auto"} value={value.from} max={value.to} onChange={(e) => set("from", e.target.value)} /></label>
      <label className="block"><span className="text-[11px] text-fg-muted">To</span><input type="date" className={inputCls + " mt-1 !w-auto"} value={value.to} min={value.from} max={today} onChange={(e) => set("to", e.target.value)} /></label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick ranges">
        {presets.map(([label, r]) => (
          <button key={label} type="button" onClick={() => onChange(r)} className="px-2.5 py-1.5 rounded-lg text-xs"
            style={{ background: value.from === r.from && value.to === r.to ? color : "var(--vk-surface)", color: value.from === r.from && value.to === r.to ? "#101010" : "#cbd5e1", border: "1px solid var(--vk-line)" }}>{label}</button>))}
      </div>
    </div>
  );
}
export const rangeQuery = (r: Range, extra: Record<string, string | number | undefined> = {}) => {
  const q = new URLSearchParams({ from: r.from, to: r.to });
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") q.set(k, String(v));
  return q.toString();
};

/* ───────────── paging ───────────── */
export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1, pages = Math.ceil(total / limit);
  const btn = "p-1.5 rounded-lg border border-[var(--vk-line)] disabled:opacity-30 text-white/80";
  return (
    <nav className="flex items-center justify-end gap-2 text-xs text-fg-muted" aria-label="Pagination">
      <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <button className={btn} aria-label="Previous page" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}><ChevronLeft className="w-4 h-4" /></button>
      <span>Page {page} of {pages}</span>
      <button className={btn} aria-label="Next page" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}><ChevronRight className="w-4 h-4" /></button>
    </nav>
  );
}

/* ───────────── CSV download (the file is fetched with the session token, then saved) ───────────── */
export function CsvButton({ segment, path, label = "Download CSV", color }: { segment: string; path: string; label?: string; color: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await authFetch(`${API_BASE}/api/portal/${segment}${path}`);
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? `Download failed (${res.status})`); return; }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "export.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { setErr("We could not reach the server."); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} onClick={run} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-60" style={{ background: color, color: "#101010" }}>
        <Download className="w-3.5 h-3.5" />{busy ? "Preparing…" : label}
      </button>
      {err && <span role="alert" className="text-xs text-bad">{err}</span>}
    </span>
  );
}

/* ───────────── charts and maps (plain SVG: no extra libraries, nothing loaded from other sites) ───────────── */
export function TrendChart({ days, color, label, money = true }: { days: { day: string; value: number }[]; color: string; label: string; money?: boolean }) {
  const max = Math.max(...days.map((d) => d.value), 0);
  const total = Math.round(days.reduce((a, d) => a + d.value, 0) * 100) / 100;
  const fmt = (n: number) => (money ? "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(n));
  const W = 560, H = 96, gap = 3, bw = days.length ? (W - gap * (days.length - 1)) / days.length : 0;
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <div className="flex items-baseline justify-between mb-2"><h3 className="text-sm font-bold text-fg">{label}</h3><span className="text-xs text-fg-muted">{days.length} days · total {fmt(total)}</span></div>
      {max === 0 ? <p className="text-sm text-fg-subtle py-6 text-center">Nothing recorded in this period.</p> : (
        <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`${label}: total ${fmt(total)} over ${days.length} days, highest day ${fmt(max)}`} className="w-full h-auto">
          {days.map((d, i) => {
            const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * H);
            return <rect key={d.day} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={2} fill={color} opacity={i === days.length - 1 ? 1 : 0.6}><title>{`${d.day}: ${fmt(d.value)}`}</title></rect>;
          })}
          <text x={0} y={H + 13} fontSize="10" fill="var(--vk-fg-muted)">{days[0]?.day.slice(5)}</text>
          <text x={W} y={H + 13} fontSize="10" fill="var(--vk-fg-muted)" textAnchor="end">{days.at(-1)?.day.slice(5)}</text>
        </svg>)}
    </div>
  );
}

export interface MapRoute { id: string; name: string; active: boolean; registration: string | null; terminalSerial: string; points: { lat: number; lng: number }[] }
export interface MapPosition { terminalSerial: string; registration: string | null; lat: number; lng: number; at: string | null }
const ROUTE_COLORS = ["#60A5FA", "#F59E0B", "#34D399", "#F472B6", "#C9A84C", "#F87171"];

/** Routes as lines and the last reported position of each vehicle as a dot, drawn to scale. There are no street tiles. */
export function RouteMap({ routes, positions, color }: { routes: MapRoute[]; positions: MapPosition[]; color: string }) {
  const pts = [...routes.flatMap((r) => r.points), ...positions];
  if (pts.length === 0) return <div className="rounded-xl p-6 text-sm text-fg-muted text-center" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>No routes or vehicle positions have been recorded yet.</div>;
  const W = 600, H = 340, pad = 28;
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);                 // keep shapes undistorted away from the equator
  const spanX = Math.max((maxLng - minLng) * kx, 1e-4), spanY = Math.max(maxLat - minLat, 1e-4);
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const ox = (W - spanX * scale) / 2, oy = (H - spanY * scale) / 2;
  const X = (lng: number) => ox + (lng - minLng) * kx * scale, Y = (lat: number) => H - oy - (lat - minLat) * scale;
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${routes.length} routes and ${positions.length} vehicle positions`} className="w-full h-auto rounded-lg" style={{ background: "var(--vk-bg)" }}>
        {routes.map((r, i) => {
          const c = ROUTE_COLORS[i % ROUTE_COLORS.length];
          return (
            <g key={r.id} opacity={r.active ? 1 : 0.4}>
              <polyline points={r.points.map((p) => `${X(p.lng)},${Y(p.lat)}`).join(" ")} fill="none" stroke={c} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={r.active ? undefined : "6 6"}><title>{r.name}</title></polyline>
              {r.points.length > 0 && <circle cx={X(r.points[0].lng)} cy={Y(r.points[0].lat)} r={4} fill={c} />}
              {r.points.length > 1 && <rect x={X(r.points.at(-1)!.lng) - 4} y={Y(r.points.at(-1)!.lat) - 4} width={8} height={8} fill={c} />}
            </g>);
        })}
        {positions.map((p) => (
          <g key={p.terminalSerial}><circle cx={X(p.lng)} cy={Y(p.lat)} r={7} fill={color} stroke="#fff" strokeWidth={2}><title>{`${p.registration ?? p.terminalSerial} · ${p.at ? new Date(p.at).toLocaleString("en-ZA") : ""}`}</title></circle></g>))}
      </svg>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 text-xs text-fg">
        {routes.map((r, i) => <li key={r.id} className="flex items-center gap-2"><span className="inline-block w-3 h-1 rounded" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />{r.name}{r.registration ? ` · ${r.registration}` : ""}{r.active ? "" : " (inactive)"}</li>)}
        {positions.map((p) => <li key={p.terminalSerial} className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />{p.registration ?? p.terminalSerial}{p.at ? ` · last seen ${new Date(p.at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</li>)}
      </ul>
      <p className="mt-2 text-[11px] text-fg-subtle">Drawn to scale from recorded points. It shows routes and last reported positions, not street maps.</p>
    </div>
  );
}

/* ───────────── resilience ───────────── */
/** A crash inside one screen shows a message and a way back instead of blanking the whole dashboard. */
export class ScreenBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  componentDidCatch(e: unknown) { console.error("[portal] screen crashed", e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="rounded-xl p-5 text-sm text-red-200 flex items-start gap-3" style={{ background: "#2a1220", border: "1px solid #5b2140" }}>
        <TriangleAlert className="w-5 h-5 shrink-0" /><div><p className="font-semibold">Something went wrong on this screen.</p><p className="text-red-200/70">Try another screen, or reload the page. Your data is safe.</p>
          <button className="mt-2 underline" onClick={() => this.setState({ failed: false })}>Try again</button></div>
      </div>
    );
  }
}

/** Runs `fn` every `ms` while the tab is visible (and once when it becomes visible again). */
export function useAutoRefresh(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => { if (document.visibilityState === "visible") ref.current(); };
    const t = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [ms, enabled]);
}
