import { describe, it, expect } from "vitest";
import { resolvePaymentsConfig, LIVE_ENABLE_PHRASE, coreMode } from "./config.js";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const liveOk = {
  NODE_ENV: "production", PAYMENTS_MODE: "live", PAYMENTS_LIVE_ENABLED: LIVE_ENABLE_PHRASE, PAYMENTS_LIVE_APPROVED_BY: "A. Person",
  ISSUING_PROVIDER: "paymentology", ACQUIRING_PROVIDER: "mock",
  LIVE_PAYMENTOLOGY_BASE_URL: "https://api.example.com", LIVE_PAYMENTOLOGY_API_KEY: "k", LIVE_PAYMENTOLOGY_WEBHOOK_SECRET: "s",
};

describe("resolvePaymentsConfig", () => {
  it("defaults to sandbox with mock providers", () => {
    expect(resolvePaymentsConfig(env({}))).toMatchObject({ mode: "sandbox", issuingProvider: "mock", acquiringProvider: "mock", paymentology: null });
    expect(coreMode("sandbox")).toBe("test");
    expect(coreMode("live")).toBe("live");
  });
  it("rejects unknown modes and providers", () => {
    expect(() => resolvePaymentsConfig(env({ PAYMENTS_MODE: "prod" }))).toThrow(/sandbox" or "live/);
    expect(() => resolvePaymentsConfig(env({ ISSUING_PROVIDER: "nope" }))).toThrow(/ISSUING_PROVIDER/);
  });
  it("refuses live mode and lists everything that is missing", () => {
    expect(() => resolvePaymentsConfig(env({ PAYMENTS_MODE: "live" }))).toThrow(/NODE_ENV=production[\s\S]*PAYMENTS_LIVE_ENABLED[\s\S]*APPROVED_BY[\s\S]*ISSUING_PROVIDER=mock[\s\S]*ACQUIRING_PROVIDER=mock/);
  });
  it("refuses live mode without the explicit extra flag even if everything else is set", () => {
    expect(() => resolvePaymentsConfig(env({ ...liveOk, PAYMENTS_LIVE_ENABLED: "true" }))).toThrow(/PAYMENTS_LIVE_ENABLED/);
  });
  it("refuses live mode while no real acquiring provider exists", () => {
    expect(() => resolvePaymentsConfig(env(liveOk))).toThrow(/ACQUIRING_PROVIDER=mock/);
  });
  it("refuses an http live URL", () => {
    expect(() => resolvePaymentsConfig(env({ ...liveOk, LIVE_PAYMENTOLOGY_BASE_URL: "http://x.test" }))).toThrow(/https/);
  });
  it("never picks sandbox credentials for live, or live for sandbox", () => {
    const sandboxOnly = { ISSUING_PROVIDER: "paymentology", SANDBOX_PAYMENTOLOGY_BASE_URL: "https://sbx.test", SANDBOX_PAYMENTOLOGY_API_KEY: "k", SANDBOX_PAYMENTOLOGY_WEBHOOK_SECRET: "s" };
    expect(resolvePaymentsConfig(env(sandboxOnly)).paymentology?.baseUrl).toBe("https://sbx.test");
    const sandboxCredsInLive = { ...sandboxOnly, NODE_ENV: "production", PAYMENTS_MODE: "live" };
    expect(() => resolvePaymentsConfig(env(sandboxCredsInLive))).toThrow(/LIVE_PAYMENTOLOGY_BASE_URL/);
    const liveOnly = { ISSUING_PROVIDER: "paymentology", LIVE_PAYMENTOLOGY_BASE_URL: "https://live.test", LIVE_PAYMENTOLOGY_API_KEY: "k", LIVE_PAYMENTOLOGY_WEBHOOK_SECRET: "s" };
    expect(() => resolvePaymentsConfig(env(liveOnly))).toThrow(/SANDBOX_PAYMENTOLOGY/);
  });
  it("a real provider in sandbox needs its sandbox credentials", () => {
    expect(() => resolvePaymentsConfig(env({ ISSUING_PROVIDER: "paymentology" }))).toThrow(/SANDBOX_PAYMENTOLOGY_BASE_URL/);
  });
});
