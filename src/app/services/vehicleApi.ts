import { isDemoMode, setDemoMode, DEMO_TOKEN, vehicleMock } from "./demoMode";
import { getToken, connectLiveFeed } from "./mvnoApi";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (isDemoMode()) return vehicleDemoResponse(path, opts) as T;
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res  = await fetch(`${BASE}${path}`, { ...opts, headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  } catch (err) {
    if (err instanceof TypeError || (err instanceof Error && err.message.includes("fetch"))) {
      setDemoMode(true);
      return vehicleDemoResponse(path, opts) as T;
    }
    throw err;
  }
}

// ─── Demo response router ─────────────────────────────────────────────────────
function vehicleDemoResponse(path: string, opts: RequestInit = {}): unknown {
  const method = (opts.method ?? "GET").toUpperCase();
  const body   = opts.body ? JSON.parse(opts.body as string) : {};
  const params = Object.fromEntries(new URLSearchParams(path.includes("?") ? path.split("?")[1] : ""));

  if (path.includes("/api/auth/login"))                    return { success: true, token: DEMO_TOKEN, user: { id: "demo-001", username: body.username ?? "noc1", name: "Fleet Manager", role: "noc_engineer" } };
  if (path.includes("/api/vehicles/snapshot"))             return vehicleMock.snapshot();
  if (path.includes("/api/vehicles/positions"))            return vehicleMock.positions();
  if (path.includes("/api/vehicles/analytics"))            return vehicleMock.analytics();
  if (path.includes("/api/vehicles/drivers/all"))          return vehicleMock.drivers(params);
  if (path.match(/\/api\/vehicles\/drivers\/[^/]+\/assign/)) return vehicleMock.assignDriver();
  if (path.match(/\/api\/vehicles\/drivers\/[^/]+/))       return vehicleMock.driver(path.split("/").pop() ?? "");
  if (path.includes("/api/vehicles/alerts/all"))           return vehicleMock.alerts(params);
  if (path.match(/\/api\/vehicles\/alerts\/[^/]+\/acknowledge/)) return vehicleMock.acknowledgeAlert(path.split("/").at(-2) ?? "");
  if (path.match(/\/api\/vehicles\/alerts\/[^/]+\/resolve/)) return vehicleMock.resolveAlert(path.split("/").at(-2) ?? "");
  if (path.includes("/api/vehicles/geofences/all"))        return vehicleMock.geofences();
  if (path.includes("/api/vehicles/geofences") && method === "POST") return vehicleMock.createGeofence(body);
  if (path.includes("/api/vehicles/geofences") && method === "PATCH") return vehicleMock.updateGeofence(path.split("/").pop() ?? "", body);
  if (path.includes("/api/vehicles/geofences") && method === "DELETE") return vehicleMock.deleteGeofence(path.split("/").pop() ?? "");
  if (path.includes("/api/vehicles/trips"))                return vehicleMock.trips();
  if (path.match(/\/api\/vehicles\/[^/]+\/history/))       return vehicleMock.history(path.split("/")[3] ?? "");
  if (path.match(/\/api\/vehicles\/[^/]+$/) && method === "GET") return vehicleMock.getVehicle(path.split("/").pop() ?? "");
  if (path.match(/\/api\/vehicles\/[^/]+$/) && method === "PATCH") return vehicleMock.update();
  if (path.includes("/api/vehicles") && method === "GET")  return vehicleMock.list(params);
  if (path.includes("/api/vehicles") && method === "POST") return { success: true, data: { id: `veh-new`, ...body } };
  return { success: true, data: {} };
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const vehicleApi = {
  list:      (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/vehicles${qs}`);
  },
  snapshot:  () => apiFetch<{ success: boolean; data: Record<string, number | string> }>("/api/vehicles/snapshot"),
  positions: () => apiFetch<{ success: boolean; data: unknown[] }>("/api/vehicles/positions"),
  get:       (id: string) => apiFetch<{ success: boolean; data: Record<string, unknown> }>(`/api/vehicles/${id}`),
  create:    (body: unknown) => apiFetch("/api/vehicles", { method: "POST", body: JSON.stringify(body) }),
  update:    (id: string, body: unknown) => apiFetch(`/api/vehicles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  history:   (id: string, limit = 20) => apiFetch<{ success: boolean; data: unknown[] }>(`/api/vehicles/${id}/history?limit=${limit}`),
  drivers:       (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ success: boolean; data: unknown[] }>(`/api/vehicles/drivers/all${qs}`);
  },
  driver:        (id: string) => apiFetch<{ success: boolean; data: Record<string, unknown> }>(`/api/vehicles/drivers/${id}`),
  assignDriver:  (driverId: string, vehicleId: string) => apiFetch(`/api/vehicles/drivers/${driverId}/assign`, { method: "PATCH", body: JSON.stringify({ vehicleId }) }),
  alerts: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/vehicles/alerts/all${qs}`);
  },
  acknowledgeAlert: (id: string) => apiFetch(`/api/vehicles/alerts/${id}/acknowledge`, { method: "PATCH" }),
  resolveAlert:     (id: string) => apiFetch(`/api/vehicles/alerts/${id}/resolve`,     { method: "PATCH" }),
  geofences:      () => apiFetch<{ success: boolean; data: unknown[] }>("/api/vehicles/geofences/all"),
  createGeofence: (body: unknown) => apiFetch("/api/vehicles/geofences", { method: "POST", body: JSON.stringify(body) }),
  updateGeofence: (id: string, body: unknown) => apiFetch(`/api/vehicles/geofences/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteGeofence: (id: string) => apiFetch(`/api/vehicles/geofences/${id}`, { method: "DELETE" }),
  trips: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ success: boolean; data: unknown[] }>(`/api/vehicles/trips/all${qs}`);
  },
  analytics: () => apiFetch<{ success: boolean; data: Record<string, unknown> }>("/api/vehicles/analytics/summary"),
};

export type VehicleWsHandler = (event: string, data: unknown) => void;
export { connectLiveFeed };
