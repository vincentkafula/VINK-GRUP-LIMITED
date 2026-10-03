// Browser side of the session: where the access token lives, how it is renewed, and how requests carry it.
//
// Two server modes (the login response says which, in `mode`):
//  - "legacy": one long-lived access token, kept in localStorage as before.
//  - "cookie": a short-lived access token kept only in MEMORY (an XSS bug cannot lift a long-term credential from storage), renewed
//    silently with a rotating refresh token that lives in an httpOnly cookie JavaScript can never read. The CSRF token that
//    accompanies it is stored in localStorage so a page reload can restore the session; on its own it is useless without the cookie.
//
// Pitfalls this file avoids on purpose:
//  - Refresh races: ONE refresh runs at a time per tab (callers share the same promise); the server tolerates a second tab racing
//    (409 "in_progress"), and we simply retry with the cookie the winner already received.
//  - Expired-token surprises: the token is renewed a minute BEFORE it expires, again when a hidden tab comes back, and a 401 triggers
//    exactly one refresh-and-retry.

import { API_BASE } from "./config";

const TOKEN_KEY = "vink_jwt";
const CSRF_KEY = "vink_csrf";
const SESSION_KEY = "vink_session";

export type AuthMode = "cookie" | "legacy";
export interface AuthGrant { token: string; expiresIn?: number; csrfToken?: string; mode?: AuthMode }

let memToken: string | null = null;
let expiresAt = 0;                     // ms since epoch; 0 = unknown (legacy tokens are not tracked)
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<boolean> | null = null;
let listening = false;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: memory only */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True when this browser holds a cookie-mode session (we hold a CSRF token for it). */
export const isCookieSession = (): boolean => !!store.get(CSRF_KEY);

export function getToken(): string | null {
  return memToken ?? (isCookieSession() ? null : store.get(TOKEN_KEY));
}

export function setAuth({ token, expiresIn, csrfToken, mode }: AuthGrant): void {
  memToken = token;
  if (mode === "cookie" && csrfToken) {
    store.set(CSRF_KEY, csrfToken);
    store.del(TOKEN_KEY);                                  // never keep the token in storage in cookie mode
    expiresAt = Date.now() + (expiresIn ?? 900) * 1000;
    scheduleRefresh(expiresIn ?? 900);
    listenForVisibility();
  } else {
    store.set(TOKEN_KEY, token);
    store.del(CSRF_KEY);
    expiresAt = 0;
    clearTimeout(timer);
  }
}

export function clearAuth(): void {
  memToken = null; expiresAt = 0;
  clearTimeout(timer);
  store.del(TOKEN_KEY); store.del(CSRF_KEY);
}

function scheduleRefresh(expiresInSeconds: number) {
  clearTimeout(timer);
  timer = setTimeout(() => { void refreshSession(); }, Math.max(5, expiresInSeconds - 60) * 1000);
}

function listenForVisibility() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  // Timers are throttled in background tabs; renew as soon as the tab is looked at again if the token is (nearly) gone.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isCookieSession() && expiresAt - Date.now() < 30_000) void refreshSession();
  });
}

/**
 * Renew the access token with the refresh cookie. Resolves true on success. A rejected or missing session signs the browser out
 * locally; a network failure leaves the session alone (we may just be offline) and resolves false.
 */
export function refreshSession(): Promise<boolean> {
  if (!inflight) inflight = doRefresh().finally(() => { inflight = null; });
  return inflight;
}

async function doRefresh(): Promise<boolean> {
  if (!isCookieSession()) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": store.get(CSRF_KEY) ?? "" },
      });
    } catch { return false; }
    if (res.status === 409) { await sleep(250 * (attempt + 1)); continue; }     // another tab is rotating; its cookie arrives shortly
    if (!res.ok) {
      const had = !!memToken;
      clearAuth(); store.del(SESSION_KEY);
      if (had && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("vink:session-expired", { detail: { path: "/api/auth/refresh", hadToken: true, backendError: null } }));
      return false;
    }
    const j = await res.json().catch(() => null) as { token?: string; expiresIn?: number; csrfToken?: string; user?: object } | null;
    if (!j?.token) return false;
    setAuth({ token: j.token, expiresIn: j.expiresIn, csrfToken: j.csrfToken, mode: "cookie" });
    if (j.user) store.set(SESSION_KEY, JSON.stringify(j.user));
    return true;
  }
  return false;
}

/** A token that is good for at least the next few seconds, renewing first if needed. Null when signed out. */
export async function getValidToken(): Promise<string | null> {
  if (isCookieSession()) {
    if (!memToken || expiresAt - Date.now() < 20_000) await refreshSession();
    return memToken;
  }
  return getToken();
}

/** fetch() with the Authorization header, and one automatic refresh-and-retry if the server says the token has expired. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const send = async () => {
    const token = await getValidToken();
    return fetch(input, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };
  const res = await send();
  if (res.status === 401 && isCookieSession() && (await refreshSession())) return send();
  return res;
}

/** Called once when the app starts: restore a cookie-mode session after a reload (silent when there is none). */
export async function bootstrapSession(): Promise<void> {
  if (isCookieSession() && !memToken) await refreshSession();
}

/** Sign out on the server (revokes the refresh chain), then forget everything locally. Never throws. */
export async function endSession(): Promise<void> {
  const csrf = store.get(CSRF_KEY);
  const wasCookie = !!csrf;
  clearAuth();                                   // the browser forgets immediately; the server call below cannot keep it signed in
  store.del(SESSION_KEY);
  if (!wasCookie) return;                         // legacy mode has no server-side session to revoke
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf! } });
  } catch { /* offline: the refresh cookie expires on its own; local sign-out already happened */ }
}

/* ───────── live WebSocket feed ───────── */

/** The first thing a socket must send. The token is a message (not in the URL) so it never reaches logs or history. */
export function sendSocketAuth(ws: WebSocket): boolean {
  const t = getToken();
  if (!t) return false;
  ws.send(JSON.stringify({ type: "auth", token: t }));
  return true;
}

/** Server closes a socket with 4401 when its token is missing, invalid or expired: renew first, then reconnect. */
export const SOCKET_AUTH_CLOSE = 4401;
