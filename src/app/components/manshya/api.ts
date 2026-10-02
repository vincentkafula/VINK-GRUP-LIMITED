/* eslint-disable @typescript-eslint/no-explicit-any -- API responses are untyped JSON; callers read fields directly */
// Manshya API client. Same backend and same JWT as the rest of the app: the signed-in
// user's token is sent as a Bearer header, and the server decides who gets in
// (customers for the dashboard, staff for the back office).

import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/authSession";

export const MANSHYA_BASE = `${API_BASE}/api/manshya`;

export class ManshyaError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

async function fail(res: Response): Promise<never> {
  const json = await res.json().catch(() => ({}));
  const e = json?.error;
  // Manshya errors are { error: { code, message } }; the app's own are { error: "text" }.
  const message = typeof e === "string" ? e : e?.message ?? (res.status === 401 ? "Please sign in again." : "Request failed");
  throw new ManshyaError(message, res.status, typeof e === "object" ? e?.code : undefined);
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  /** Send an Idempotency-Key so a double click cannot move money twice. */
  idem?: boolean;
}

/** Call a customer dashboard endpoint, e.g. api("/balance"). `base` lets the back office reuse this. */
export async function api<T = any>(path: string, { method = "GET", body, idem }: ApiOptions = {}, base = MANSHYA_BASE): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idem) headers["Idempotency-Key"] = uid();
  // authFetch adds the token, renewing it first if it is about to expire, and retries once after a 401.
  const res = await authFetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) await fail(res);
  return (await res.json().catch(() => ({}))) as T;
}

/** Fetch a file (PDF, CSV) with the sign-in token and hand it to the browser as a download. */
export async function download(path: string, name: string, base = MANSHYA_BASE): Promise<void> {
  const res = await authFetch(base + path);
  if (!res.ok) throw new ManshyaError("Download failed", res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open a protected file (e.g. a KYC document) in a new tab. */
export async function openBlob(path: string, base = MANSHYA_BASE): Promise<void> {
  const res = await authFetch(base + path);
  if (!res.ok) throw new ManshyaError("Could not open the file", res.status);
  window.open(URL.createObjectURL(await res.blob()));
}

/** Public (signed-out) call, used by the hosted checkout page. */
export async function publicApi<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(MANSHYA_BASE + path, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) await fail(res);
  return (await res.json()) as T;
}
