import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { authApi } from "./apiClient";
import { mfaEnrolRequired } from "./mfaFlag";

const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const user = { id: "1", username: "amy", name: "Amy", email: "a@b.co", role: "superadmin", mfaEnabled: false };
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

describe("sign-in and the two-factor prompt", () => {
  it("remembers, for this tab, that the server asked the account to set up two-factor", async () => {
    globalThis.fetch = reply({ success: true, token: "t", expiresIn: 900, user, mfaEnrollRequired: true });
    expect(mfaEnrolRequired()).toBe(false);
    const r = await authApi.login("amy", "pw"); expect(r.success).toBe(true);
    expect(mfaEnrolRequired()).toBe(true);
  });
  it("forgets it at the next sign-in when the account does not need to (another person, or two-factor now on)", async () => {
    globalThis.fetch = reply({ success: true, token: "t", expiresIn: 900, user, mfaEnrollRequired: true }); await authApi.login("amy", "pw"); expect(mfaEnrolRequired()).toBe(true);
    globalThis.fetch = reply({ success: true, token: "t2", expiresIn: 900, user: { ...user, mfaEnabled: true } }); await authApi.login("amy", "pw", "123456");
    expect(mfaEnrolRequired()).toBe(false);
  });
  it("is not set by a sign-in that failed", async () => {
    globalThis.fetch = reply({ success: false, error: "Enter the 6-digit code from your authenticator app.", code: "mfa_required" });
    await authApi.login("amy", "pw"); expect(mfaEnrolRequired()).toBe(false);
  });
});
