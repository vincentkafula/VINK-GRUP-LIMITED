// ─── VMS Central API Client ───────────────────────────────────────────────────
// Single source of truth for all backend calls. Falls back to demo mode when
// the server is unreachable.

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "vms_jwt";
const DEMO_KEY  = "vms_demo";

// ─── Auth token management ────────────────────────────────────────────────────
export function getToken(): string | null  { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t: string)        { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken()               { localStorage.removeItem(TOKEN_KEY); }
export function isDemoMode(): boolean      { return localStorage.getItem(DEMO_KEY) === "1"; }
export function setDemoMode(on: boolean)   { on ? localStorage.setItem(DEMO_KEY, "1") : localStorage.removeItem(DEMO_KEY); }

// ─── Logged-in user (stored after login) ─────────────────────────────────────
const SESSION_KEY = "vms_session";
export function getSession(): { id: string; username: string; name: string; email: string; role: string } | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null"); } catch { return null; }
}
export function setSession(user: object) { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
export function clearSession()           { localStorage.removeItem(SESSION_KEY); clearToken(); }

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
interface ApiResponse<T = unknown> { success: boolean; data?: T; error?: string; meta?: object }

// Maps HTTP status codes to user-friendly messages
function httpErrorMessage(status: number): string {
  if (status === 400) return "Invalid request. Please check your inputs and try again.";
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return "The requested resource was not found.";
  if (status === 409) return "A conflict occurred. This record may already exist.";
  if (status === 422) return "Validation failed. Please check your inputs.";
  if (status === 429) return "Too many requests. Please wait a moment before trying again.";
  if (status >= 500)  return "The server encountered an error. Please try again shortly.";
  return `Request failed (${status}).`;
}

async function request<T>(
  method: string,
  path: string,
  body?: object,
  auth = false,
  timeoutMs = 10000,
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) {
      const tok = getToken();
      if (tok) headers["Authorization"] = `Bearer ${tok}`;
    }
    const res = await fetch(`${BASE}${path}`, {
      method, headers, signal: controller.signal,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Try to parse JSON regardless of status
    let json: ApiResponse<T>;
    try {
      json = await res.json() as ApiResponse<T>;
    } catch {
      json = { success: false, error: httpErrorMessage(res.status) };
    }

    // Attach status-specific message if backend didn't provide one
    if (!res.ok && !json.error) {
      json = { ...json, success: false, error: httpErrorMessage(res.status) };
    }

    // Auto-clear token on 401
    if (res.status === 401 && auth) clearToken();

    return json;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "Request timed out. Please check your connection." };
    }
    if (err instanceof TypeError && err.message.includes("fetch")) {
      setDemoMode(true);
      return { success: false, error: "Server unreachable — running in demo mode." };
    }
    return { success: false, error: "An unexpected error occurred." };
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  get:    <T>(p: string, auth = false) => request<T>("GET",    p, undefined, auth),
  post:   <T>(p: string, b: object, auth = false) => request<T>("POST",   p, b, auth),
  patch:  <T>(p: string, b: object, auth = false) => request<T>("PATCH",  p, b, auth),
  delete: <T>(p: string, auth = false) => request<T>("DELETE", p, undefined, auth),
};

// ─── Health check ─────────────────────────────────────────────────────────────
export async function checkHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    if (j.status === "ok") { setDemoMode(false); return true; }
    return false;
  } catch {
    setDemoMode(true);
    return false;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: async (username: string, password: string) => {
    const r = await api.post<{ token: string; user: object }>("/api/auth/login", { username, password });
    if (r.success && r.data) {
      setToken((r.data as { token: string }).token);
      setSession((r.data as { user: object }).user);
      setDemoMode(false);
    }
    return r;
  },
  me: () => api.get("/api/auth/me", true),
  logout: async () => {
    await api.post("/api/auth/logout", {}, true);
    clearSession();
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────
export const publicApi = {
  contact: (data: {
    name: string; email: string; phone?: string;
    subject?: string; message: string; type?: string;
  }) => api.post("/api/public/contact", data),

  newsletter: (email: string) =>
    api.post("/api/public/newsletter", { email }),

  apply: (data: {
    product: string; tier?: string; name: string;
    email: string; phone: string; idNumber?: string;
    income?: string; employmentStatus?: string; message?: string;
  }) => api.post("/api/public/apply", data),

  register: (data: {
    firstName: string; lastName: string; email: string;
    phone: string; idNumber: string; dateOfBirth?: string; accountType?: string;
  }) => api.post("/api/public/register", data),

  creditCheck: (data: { idNumber: string; firstName?: string; lastName?: string; income?: string }) =>
    api.post<{ score: number; rating: string; eligible: { product: string; approved: boolean; reason: string }[]; tips: string[] }>("/api/public/credit-check", data),

  branches: () => api.get("/api/public/branches"),

  stats: () => api.get<{
    afcDevices: number; dailyCommuters: number; appRating: number;
    partnerMerchants: number; countriesCovered: number; merchantLocations: number; sadcNations: number;
  }>("/api/public/stats"),
};

// ─── Demo mode fallbacks (used when server is down) ──────────────────────────
export const demoLogin = (dashboardId: string) => {
  setDemoMode(true);
  setSession({ id: "demo-001", username: "demo", name: "Demo User", email: "demo@vink.com", role: "customer", dashboard: dashboardId });
};

// ─── Notify helpers (used with Sonner toast) ──────────────────────────────────
export type NotifyFn = (msg: string, type?: "success" | "error" | "info") => void;
