import { isDemoMode, setDemoMode, DEMO_TOKEN, haMock } from "./demoMode";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

let _token: string | null = localStorage.getItem("ha_token");
export const setHaToken = (t: string | null) => { _token = t; if (t) localStorage.setItem("ha_token", t); else localStorage.removeItem("ha_token"); };
export const getHaToken = () => _token;

// ─── Fetch with demo fallback ─────────────────────────────────────────────────
async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (isDemoMode()) return haDemoResponse(path, opts) as T;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    return j;
  } catch (err) {
    if (err instanceof TypeError || (err instanceof Error && err.message.includes("fetch"))) {
      setDemoMode(true);
      return haDemoResponse(path, opts) as T;
    }
    throw err;
  }
}

// ─── Demo responses ───────────────────────────────────────────────────────────
function haDemoResponse(path: string, opts: RequestInit = {}): unknown {
  const method = (opts.method ?? "GET").toUpperCase();
  if (path.includes("/api/auth/login"))               return { success: true, token: DEMO_TOKEN, user: { id: "ha-noc-001", username: "noc1", name: "NOC Engineer 1", role: "noc_engineer" } };
  if (path.includes("/api/ha/rides/incoming"))        return haMock.rides.incoming();
  if (path.includes("/api/ha/rides/stats"))           return haMock.rides.stats();
  if (path.includes("/api/ha/rides") && method === "GET")   return haMock.rides.list();
  if (path.includes("/api/ha/rides") && method === "POST")  return { success: true, data: { id: "ride-new-001", status: "searching", estimatedFareZAR: 68 } };
  if (path.includes("/accept"))                       return haMock.rides.accept();
  if (path.includes("/decline"))                      return haMock.rides.decline();
  if (path.includes("/status"))                       return haMock.rides.status();
  if (path.includes("/rate"))                         return haMock.rides.rate();
  if (path.includes("/api/ha/drivers") && path.includes("/earnings"))  return haMock.drivers.earnings();
  if (path.includes("/api/ha/drivers") && path.includes("/documents")) return haMock.drivers.documents();
  if (path.includes("/api/ha/drivers") && path.includes("/trips"))     return haMock.drivers.trips();
  if (path.includes("/api/ha/drivers") && method === "GET")  return haMock.drivers.get();
  if (path.includes("/api/ha/drivers") && method === "PATCH") return haMock.drivers.get();
  if (path.includes("/api/ha/passengers") && path.includes("/trips"))     return haMock.passengers.trips();
  if (path.includes("/api/ha/passengers") && path.includes("/active"))    return haMock.passengers.active();
  if (path.includes("/api/ha/passengers") && path.includes("/scheduled")) return haMock.passengers.scheduled();
  if (path.includes("/api/ha/passengers"))             return haMock.passengers.get();
  if (path.includes("/api/ha/sos") && method === "POST") return haMock.sos.trigger();
  if (path.includes("/api/ha/sos"))                    return { success: true, data: [], meta: { total: 0, active: 0 } };
  return { success: true, data: {} };
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const haAuth = {
  login: async (username: string, _password: string) => {
    try {
      const res = await apiFetch<{ success: boolean; token: string; user: { id: string; name: string; role: string } }>(
        "/api/auth/login", { method: "POST", body: JSON.stringify({ username, password: _password }) }
      );
      return res;
    } catch {
      setDemoMode(true);
      setHaToken(DEMO_TOKEN);
      return { success: true, token: DEMO_TOKEN, user: { id: "ha-noc-001", username, name: "Demo Operator", role: "noc_engineer" } };
    }
  },
};

// ─── Rides ────────────────────────────────────────────────────────────────────
export const haRides = {
  list:     (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/ha/rides?${new URLSearchParams(p)}`),
  get:      (id: string) => apiFetch<{ success: boolean; data: unknown }>(`/api/ha/rides/${id}`),
  stats:    () => apiFetch<{ success: boolean; data: unknown }>("/api/ha/rides/stats"),
  incoming: () => apiFetch<{ success: boolean; data: unknown[] }>("/api/ha/rides/incoming"),
  book:     (body: unknown) => apiFetch<{ success: boolean; data: unknown }>("/api/ha/rides", { method: "POST", body: JSON.stringify(body) }),
  accept:   (id: string, driverId: string) => apiFetch<{ success: boolean; data: unknown }>(`/api/ha/rides/${id}/accept`, { method: "PATCH", body: JSON.stringify({ driverId }) }),
  decline:  (id: string) => apiFetch(`/api/ha/rides/${id}/decline`, { method: "PATCH" }),
  status:   (id: string, status: string, extra?: Record<string, unknown>) =>
    apiFetch<{ success: boolean; data: unknown }>(`/api/ha/rides/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, ...extra }) }),
  rate:     (id: string, rating: number, review?: string) =>
    apiFetch(`/api/ha/rides/${id}/rate`, { method: "PATCH", body: JSON.stringify({ rating, review }) }),
};

// ─── Drivers ─────────────────────────────────────────────────────────────────
export const haDrivers = {
  list:      (p?: Record<string, string>) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/ha/drivers?${new URLSearchParams(p)}`),
  get:       (id: string) => apiFetch<{ success: boolean; data: unknown }>(`/api/ha/drivers/${id}`),
  setStatus: (id: string, onlineStatus: "online" | "offline") =>
    apiFetch<{ success: boolean; data: unknown }>(`/api/ha/drivers/${id}/status`, { method: "PATCH", body: JSON.stringify({ onlineStatus }) }),
  updateLoc: (id: string, lat: number, lng: number, heading?: number) =>
    apiFetch(`/api/ha/drivers/${id}/location`, { method: "PATCH", body: JSON.stringify({ lat, lng, heading }) }),
  earnings:  (id: string) => apiFetch<{ success: boolean; data: { summary: unknown; records: unknown[] } }>(`/api/ha/drivers/${id}/earnings`),
  documents: (id: string) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/ha/drivers/${id}/documents`),
  trips:     (id: string) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/ha/drivers/${id}/trips`),
};

// ─── Passengers ──────────────────────────────────────────────────────────────
export const haPassengers = {
  get:       (id: string) => apiFetch<{ success: boolean; data: unknown }>(`/api/ha/passengers/${id}`),
  trips:     (id: string) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/ha/passengers/${id}/trips`),
  active:    (id: string) => apiFetch<{ success: boolean; data: unknown | null }>(`/api/ha/passengers/${id}/active`),
  scheduled: (id: string) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/ha/passengers/${id}/scheduled`),
};

// ─── SOS ─────────────────────────────────────────────────────────────────────
export const haSos = {
  trigger: (userId: string, triggeredBy: "passenger" | "driver", lat: number, lng: number, rideId?: string) =>
    apiFetch<{ success: boolean; data: unknown; message: string }>("/api/ha/sos", {
      method: "POST", body: JSON.stringify({ triggeredBy, userId, rideId, lat, lng }),
    }),
  resolve: (id: string, notes?: string) =>
    apiFetch(`/api/ha/sos/${id}/resolve`, { method: "PATCH", body: JSON.stringify({ notes }) }),
};
