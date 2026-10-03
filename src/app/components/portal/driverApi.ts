import { authFetch } from "../../services/apiClient";
import { API_BASE } from "../../services/config";

export interface DriverProfile { phone: string | null; licenceNumber: string | null; licenceCode: string | null; licenceExpiry: string | null; pdpNumber: string | null; pdpExpiry: string | null }
export interface DriverVehicle { terminalId: string | null; terminalSerial: string | null; terminalStatus: string | null; lastSeenAt: string | null; registration: string | null; make: string | null; model: string | null; year: number | null; colour: string | null; seats: number | null; discExpiry: string | null }
export interface DriverRoute { id: string; name: string; active: boolean; toleranceMeters: number; terminalSerial: string; waypoints: number }
export interface DriverTrip { id: string; at: string; amount: number; currency: string; scheme: string | null; status: string; terminalSerial: string }
export interface Period { count: number; total: number }
export interface DriverFine { id: string; amount: number; balanceAfter: number; description: string | null; at: string; distanceFromRouteMeters: number | null; route: string | null }
export interface DriverEarnings { currency: string; faresCollected: { today: Period; week: Period; month: Period }; fineBalance: number; fines: DriverFine[] }
export interface DriverNotification { key: string; kind: string; title: string; body: string; at: string; read: boolean }

const base = `${API_BASE}/api/portal/driver`;

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await authFetch(base + path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) return { ok: false, error: body.error ?? `Request failed (${res.status})` };
    return { ok: true, data: body as T };
  } catch { return { ok: false, error: "We could not reach the server. Please try again." }; }
}

export const driverApi = {
  profile: () => call<{ user: { name: string; email: string; username: string }; profile: DriverProfile }>("/profile"),
  saveProfile: (p: { phone: string; licence_number: string; licence_code: string; licence_expiry: string; pdp_number: string; pdp_expiry: string }) => call<object>("/profile", { method: "PUT", body: JSON.stringify(p) }),
  vehicles: () => call<{ vehicles: DriverVehicle[] }>("/vehicle"),
  routes: () => call<{ routes: DriverRoute[] }>("/routes"),
  trips: () => call<{ trips: DriverTrip[] }>("/trips"),
  earnings: () => call<DriverEarnings>("/earnings"),
  notifications: () => call<{ notifications: DriverNotification[]; unread: number }>("/notifications"),
  markRead: (keys: string[]) => call<object>("/notifications/read", { method: "POST", body: JSON.stringify({ keys }) }),
};

export const rand = (n: number) => "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const when = (iso: string) => new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
