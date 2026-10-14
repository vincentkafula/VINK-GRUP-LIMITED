// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Production-like environment: a failed request must show an error, never invented balances or a fake superadmin. */
async function load(allowed: boolean) {
  vi.resetModules();
  vi.stubEnv("DEV", allowed);
  vi.stubEnv("VITE_ALLOW_DEMO", "");
  return {
    api: await import("./apiClient"),
    bank: await import("./bankingApi"),
    demo: await import("./demoMode"),
  };
}
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); })); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("demo data is for development and deliberate demos only", () => {
  it("on the live site a network failure is an error, and demo mode stays off", async () => {
    const { api, demo } = await load(false);
    const r = await api.authApi.login("superadmin", "whatever");
    expect(r.success).toBe(false);
    expect(r.error).not.toMatch(/demo/i);
    expect(demo.isDemoMode()).toBe(false); expect(api.isDemoMode()).toBe(false);
    expect(localStorage.getItem("vink_demo")).toBeNull();
  });

  it("the bank API rethrows instead of returning made-up accounts, and bank sign-in does not invent a session", async () => {
    const { bank } = await load(false);
    await expect(bank.bankAccounts.list({ userId: "u1" })).rejects.toBeTruthy();
    await expect(bank.bankAuth.login("superadmin", "x")).rejects.toBeTruthy();
    expect(bank.getBankToken()).toBeNull();
  });

  it("a demo flag left in the browser by an older version is ignored and cleared", async () => {
    localStorage.setItem("vink_demo", "1");
    const { api, demo } = await load(false);
    expect(api.isDemoMode()).toBe(false); expect(demo.isDemoMode()).toBe(false);
    expect(localStorage.getItem("vink_demo")).toBeNull();
  });

  it("development builds still fall back to demo data so the screens can be tried without a server", async () => {
    const { api } = await load(true);
    const r = await api.authApi.login("superadmin", "whatever");
    expect(r.error).toMatch(/demo mode/i);
    expect(api.isDemoMode()).toBe(true);
  });
});
