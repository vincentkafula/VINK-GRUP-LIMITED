import { isDemoMode, setDemoMode, demoLogin, DEMO_TOKEN, mvnoMock } from "./demoMode";

const BASE   = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const WS_URL = import.meta.env.VITE_WS_URL  ?? "ws://localhost:3001/ws";

// ─── Token ────────────────────────────────────────────────────────────────────
let _token: string | null = localStorage.getItem("mvno_token");
export function setToken(t: string | null) { _token = t; if (t) localStorage.setItem("mvno_token", t); else localStorage.removeItem("mvno_token"); }
export const getToken = () => _token;

// ─── Fetch with demo fallback ────────────────────────────────────────────────
async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (isDemoMode()) return demoResponse(path, opts) as T;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers as Record<string, string> ?? {}) } });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  } catch (err) {
    if (err instanceof TypeError || (err instanceof Error && err.message.includes("fetch"))) {
      setDemoMode(true);
      return demoResponse(path, opts) as T;
    }
    throw err;
  }
}

// ─── Demo responses ───────────────────────────────────────────────────────────
function demoResponse(path: string, opts: RequestInit = {}): unknown {
  const method = (opts.method ?? "GET").toUpperCase();
  if (path.includes("/api/auth/login"))                     return { success: true, token: DEMO_TOKEN, user: { id: "demo-001", username: "noc1", name: "NOC Engineer 1", role: "noc_engineer" } };
  if (path.includes("/api/auth/me"))                        return { success: true, data: { id: "demo-001", username: "noc1", name: "NOC Engineer 1", role: "noc_engineer" } };
  if (path.includes("/api/kpis/current"))                   return mvnoMock.kpiCurrent();
  if (path.includes("/api/kpis/history"))                   return mvnoMock.kpiHistory();
  if (path.includes("/api/network/towers") && !path.includes("/"))  return mvnoMock.towers();
  if (path.includes("/api/network/towers"))                 return mvnoMock.towers();
  if (path.includes("/api/network/calls/stats"))            return mvnoMock.callStats();
  if (path.includes("/api/network/calls"))                  return { success: true, data: [], meta: { total: 50 } };
  if (path.includes("/api/network/sessions"))               return mvnoMock.sessions();
  if (path.includes("/api/network/sms/stats"))              return mvnoMock.smsStats();
  if (path.includes("/api/network/sms"))                    return { success: true, data: [], meta: { total: 100 } };
  if (path.includes("/api/billing/summary"))                return mvnoMock.billingSummary();
  if (path.includes("/api/billing/cdrs"))                   return { success: true, data: [], meta: { total: 300, totalRevenue: 284120 } };
  if (path.includes("/api/billing/invoices"))               return { success: true, data: [] };
  if (path.includes("/api/fraud/summary"))                  return mvnoMock.fraudSummary();
  if (path.includes("/api/fraud/alerts") && method === "GET") return mvnoMock.fraudAlerts();
  if (path.includes("/api/fraud/alerts") && method === "PATCH") return { success: true, data: {} };
  if (path.includes("/api/fraud/intercepts"))               return { success: true, data: [], meta: { total: 4, active: 4 } };
  if (path.includes("/api/provisioning/sims/stats"))        return mvnoMock.simStats();
  if (path.includes("/api/provisioning/sims"))              return { success: true, data: [], meta: { total: 500 } };
  if (path.includes("/api/provisioning/porting"))           return { success: true, data: [], meta: { total: 15 } };
  if (path.includes("/api/support/stats"))                  return mvnoMock.support();
  if (path.includes("/api/support/tickets") && method === "GET") return { success: true, data: [], meta: { total: 60 } };
  if (path.includes("/api/interconnects/summary"))          return mvnoMock.interSummary();
  if (path.includes("/api/interconnects/roaming"))          return { success: true, data: [], meta: { total: 8, totalRoamers: 18400 } };
  if (path.includes("/api/interconnects/routes"))           return { success: true, data: [] };
  if (path.includes("/api/alerts/summary"))                 return mvnoMock.alertSummary();
  if (path.includes("/api/alerts") && method === "GET")     return mvnoMock.alerts();
  if (path.includes("/api/alerts") && method === "PATCH")   return { success: true, data: {} };
  if (path.includes("/api/subscribers"))                    return { success: true, data: [], meta: { total: 200 } };
  return { success: true, data: {} };
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth = {
  login: async (username: string, password: string) => {
    try {
      return await apiFetch<{ success: boolean; token: string; user: { id: string; username: string; name: string; role: string } }>(
        "/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }
      );
    } catch {
      setDemoMode(true);
      const res = demoLogin(username);
      setToken(res.token);
      return res;
    }
  },
  me:     () => apiFetch<{ success: boolean; data: Record<string, string> }>("/api/auth/me"),
  logout: () => apiFetch("/api/auth/logout", { method: "POST" }),
};

// ─── KPIs ────────────────────────────────────────────────────────────────────
export const kpis = {
  current: () => apiFetch<{ success: boolean; data: Record<string, number | string> }>("/api/kpis/current"),
  history: (hours = 24) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/kpis/history?hours=${hours}`),
};

// ─── Network ─────────────────────────────────────────────────────────────────
export const network = {
  towers:    (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/network/towers${p ? "?" + new URLSearchParams(p) : ""}`),
  tower:     (id: string) => apiFetch<{ success: boolean; data: unknown }>(`/api/network/towers/${id}`),
  updateTower: (id: string, body: unknown) => apiFetch(`/api/network/towers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  calls:     (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/network/calls${p ? "?" + new URLSearchParams(p) : ""}`),
  callStats: () => apiFetch<{ success: boolean; data: Record<string, number> }>("/api/network/calls/stats"),
  sessions:  (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/network/sessions${p ? "?" + new URLSearchParams(p) : ""}`),
  smsStats:  () => apiFetch<{ success: boolean; data: Record<string, number> }>("/api/network/sms/stats"),
};

// ─── Billing ─────────────────────────────────────────────────────────────────
export const billing = {
  cdrs:       (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/billing/cdrs${p ? "?" + new URLSearchParams(p) : ""}`),
  invoices:   (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/billing/invoices${p ? "?" + new URLSearchParams(p) : ""}`),
  markPaid:   (id: string) => apiFetch(`/api/billing/invoices/${id}/mark-paid`, { method: "PATCH" }),
  summary:    () => apiFetch<{ success: boolean; data: Record<string, unknown> }>("/api/billing/summary"),
};

// ─── Fraud ───────────────────────────────────────────────────────────────────
export const fraud = {
  alerts:    (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/fraud/alerts${p ? "?" + new URLSearchParams(p) : ""}`),
  resolve:   (id: string) => apiFetch(`/api/fraud/alerts/${id}/resolve`, { method: "PATCH" }),
  block:     (id: string) => apiFetch(`/api/fraud/alerts/${id}/block`, { method: "PATCH" }),
  intercepts: () => apiFetch<{ success: boolean; data: unknown[] }>("/api/fraud/intercepts"),
  summary:   () => apiFetch<{ success: boolean; data: Record<string, unknown> }>("/api/fraud/summary"),
};

// ─── Provisioning ────────────────────────────────────────────────────────────
export const provisioning = {
  simStats:  () => apiFetch<{ success: boolean; data: Record<string, number> }>("/api/provisioning/sims/stats"),
  sims:      (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/provisioning/sims${p ? "?" + new URLSearchParams(p) : ""}`),
  activate:  (body: unknown) => apiFetch("/api/provisioning/sims/activate", { method: "POST", body: JSON.stringify(body) }),
  suspend:   (iccid: string) => apiFetch(`/api/provisioning/sims/${iccid}/suspend`, { method: "PATCH" }),
  batch:     (quantity: number, type: string) => apiFetch("/api/provisioning/sims/batch", { method: "POST", body: JSON.stringify({ quantity, type }) }),
  porting:   (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/provisioning/porting${p ? "?" + new URLSearchParams(p) : ""}`),
  requestPort: (body: unknown) => apiFetch("/api/provisioning/porting", { method: "POST", body: JSON.stringify(body) }),
};

// ─── Support ─────────────────────────────────────────────────────────────────
export const support = {
  tickets:      (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/support/tickets${p ? "?" + new URLSearchParams(p) : ""}`),
  createTicket: (body: unknown) => apiFetch("/api/support/tickets", { method: "POST", body: JSON.stringify(body) }),
  updateTicket: (id: string, body: unknown) => apiFetch(`/api/support/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  assignTicket: (id: string, agent: string) => apiFetch(`/api/support/tickets/${id}/assign`, { method: "PATCH", body: JSON.stringify({ agent }) }),
  stats:        () => apiFetch<{ success: boolean; data: Record<string, unknown> }>("/api/support/stats"),
};

// ─── Interconnects ───────────────────────────────────────────────────────────
export const interconnects = {
  roaming:        (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/interconnects/roaming${p ? "?" + new URLSearchParams(p) : ""}`),
  updateRoaming:  (id: string, body: unknown) => apiFetch(`/api/interconnects/roaming/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  routes:         () => apiFetch<{ success: boolean; data: unknown[] }>("/api/interconnects/routes"),
  summary:        () => apiFetch<{ success: boolean; data: Record<string, number> }>("/api/interconnects/summary"),
};

// ─── Alerts ──────────────────────────────────────────────────────────────────
export const alertsApi = {
  list:        (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/alerts${p ? "?" + new URLSearchParams(p) : ""}`),
  summary:     () => apiFetch<{ success: boolean; data: Record<string, number> }>("/api/alerts/summary"),
  acknowledge: (id: string) => apiFetch(`/api/alerts/${id}/acknowledge`, { method: "PATCH" }),
  resolve:     (id: string) => apiFetch(`/api/alerts/${id}/resolve`,     { method: "PATCH" }),
};

// ─── WebSocket (no-op in demo mode) ─────────────────────────────────────────
export type WsHandler = (event: string, data: unknown) => void;

export function connectLiveFeed(onEvent: WsHandler, onStatusChange?: (connected: boolean) => void): () => void {
  if (isDemoMode()) {
    onStatusChange?.(false);
    // Simulate periodic KPI updates in demo mode
    const t = setInterval(() => {
      const kpi = mvnoMock.kpiCurrent().data;
      onEvent("kpi_update", kpi);
    }, 5000);
    return () => clearInterval(t);
  }
  let ws: WebSocket | null = null;
  let dead = false;
  let ping: ReturnType<typeof setInterval>;
  function connect() {
    if (dead) return;
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => { onStatusChange?.(true); ping = setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ type: "ping" })), 25_000); };
    ws.onmessage = e => { try { const m = JSON.parse(e.data as string); if (m.event) onEvent(m.event, m.data); } catch { /* ignore */ } };
    ws.onclose = () => { clearInterval(ping); onStatusChange?.(false); if (!dead) setTimeout(connect, 3000); };
    ws.onerror = () => { /* handled by onclose */ };
  }
  connect();
  return () => { dead = true; clearInterval(ping); ws?.close(); };
}

export const API_BASE = BASE;
