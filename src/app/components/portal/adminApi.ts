import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";

/** A small client for the staff APIs under /api/admin/...: returns { data } on success or { error } with the server's reason. */
export function adminClient(path: string) {
  const base = `${API_BASE}${path}`;
  return async function call<T = Record<string, never>>(sub: string, init?: { method?: string; body?: unknown }): Promise<{ data: T } | { error: string }> {
    try {
      const res = await authFetch(base + sub, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) return { error: body.error ?? `Request failed (${res.status})` };
      return { data: body as T };
    } catch { return { error: "We could not reach the server. Please try again." }; }
  };
}
