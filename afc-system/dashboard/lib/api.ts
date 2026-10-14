/** Talks to the AFC API. The sign-in token lives in sessionStorage (cleared when the tab closes) and is sent as a Bearer header. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const KEY = "afc_token";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const getToken = (): string | null => (typeof window === "undefined" ? null : window.sessionStorage.getItem(KEY));
export const setToken = (t: string | null) => { if (t) window.sessionStorage.setItem(KEY, t); else window.sessionStorage.removeItem(KEY); };

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  if (res.status === 401 && token && !path.startsWith("/api/auth/login")) { setToken(null); if (typeof window !== "undefined") window.location.href = "/login"; }
  return res;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  let res: Response;
  try { res = await request(path, { method: opts.method ?? "GET", body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }); }
  catch { throw new ApiError(0, "network", "Cannot reach the server. Check the connection and try again."); }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? "error", json?.error?.message ?? `Request failed (${res.status})`);
  return json as T;
}

/** Downloads a file (CSV) that needs the sign-in token, so it cannot be a plain link. */
export async function download(path: string, filename: string): Promise<void> {
  const res = await request(path);
  if (!res.ok) throw new ApiError(res.status, "download", "The export could not be created");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const feedUrl = (): string => `${API_URL.replace(/^http/, "ws")}/api/ws/feed?token=${encodeURIComponent(getToken() ?? "")}`;

export const rand = (cents: number): string => `${cents < 0 ? "-" : ""}R${Math.floor(Math.abs(cents) / 100).toLocaleString("en-ZA")}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
export const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const toCents = (s: string): number => { const n = Math.round(parseFloat(s.replace(",", ".")) * 100); if (!Number.isFinite(n)) throw new Error("Enter an amount like 25 or 25.50"); return n; };
