import { describe, it, expect, beforeEach } from "vitest";
import { normalizeAuthResponse, getToken, getSession, clearSession, authApi } from "./apiClient";

const user = { id: "u1", username: "customer1", name: "Demo Customer", email: "c@x.co", role: "customer" };

describe("normalizeAuthResponse", () => {
  it("lifts a top-level token/user (what the server sends) into data", () => {
    const r = normalizeAuthResponse({ success: true, token: "t", user } as never);
    expect(r.data).toEqual({ token: "t", user });
  });
  it("keeps the data shape as is", () => {
    const r = normalizeAuthResponse({ success: true, data: { token: "t", user } });
    expect(r.data).toEqual({ token: "t", user });
  });
  it("passes failures through untouched", () => {
    const r = normalizeAuthResponse({ success: false, error: "Invalid credentials" });
    expect(r).toEqual({ success: false, error: "Invalid credentials" });
  });
});

describe("authApi.login", () => {
  beforeEach(() => { clearSession(); localStorage.clear(); });

  it("stores the token and the signed-in user's role from the server's real response shape", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, token: "jwt-123", user }), { status: 200 })) as typeof fetch;
    try {
      const r = await authApi.login("customer1", "pw");
      expect(r.success).toBe(true);
      expect(getToken()).toBe("jwt-123");
      expect(getSession()?.role).toBe("customer");
      expect((r.data as { user: { role: string } }).user.role).toBe("customer");
    } finally { globalThis.fetch = orig; }
  });
});
