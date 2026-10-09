import { describe, it, expect } from "vitest";
import { resolvePaymentsConfig, LIVE_ENABLE_PHRASE, coreMode } from "./config.js";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const liveOk = {
  NODE_ENV: "production", PAYMENTS_MODE: "live", PAYMENTS_LIVE_ENABLED: LIVE_ENABLE_PHRASE, PAYMENTS_LIVE_APPROVED_BY: "A. Person",
  ISSUING_PROVIDER: "paymentology", ACQUIRING_PROVIDER: "mock",
  LIVE_PAYMENTOLOGY_BASE_URL: "https://api.example.com", LIVE_PAYMENTOLOGY_API_KEY: "k", LIVE_PAYMENTOLOGY_WEBHOOK_SECRET: "s",
};

describe("payouts to outside cards", () => {
  it("are on in the sandbox, off in live mode, and live mode needs no payout provider when they are off", () => {
    expect(resolvePaymentsConfig(env({})).externalPayouts).toBe(true);
    expect(resolvePaymentsConfig(env({ TOKEN_EXTERNAL_PAYOUTS: "off" })).externalPayouts).toBe(false);
    expect(() => resolvePaymentsConfig(env({ TOKEN_EXTERNAL_PAYOUTS: "maybe" }))).toThrow(/TOKEN_EXTERNAL_PAYOUTS/);
    const msgOf = (e: Record<string, string>) => { try { resolvePaymentsConfig(env(e)); return ""; } catch (x) { return (x as Error).message; } };
    const byDefault = msgOf(liveOk);
    expect(byDefault).not.toMatch(/card payout provider/); expect(byDefault).not.toMatch(/card-servicing/); expect(byDefault).toMatch(/ACQUIRING_PROVIDER=mock/);
    expect(msgOf({ ...liveOk, TOKEN_EXTERNAL_PAYOUTS: "on" })).toMatch(/card payout provider/);
    expect(msgOf({ ...liveOk, CARD_SERVICING_PROVIDER: "visa_dps" })).toMatch(/visa_dps/);
  });
});

describe("Paymentology card products", () => {
  const base = { ISSUING_PROVIDER: "paymentology", SANDBOX_PAYMENTOLOGY_BASE_URL: "https://sbx.test", SANDBOX_PAYMENTOLOGY_API_KEY: "k", SANDBOX_PAYMENTOLOGY_WEBHOOK_SECRET: "s", SANDBOX_PAYMENTOLOGY_CLIENT_ID: "7" };
  it("reads one card product per brand, and the older single set for one brand", () => {
    const both = resolvePaymentsConfig(env({ ...base, SANDBOX_PAYMENTOLOGY_VISA_CARD_PRODUCT_ID: "11", SANDBOX_PAYMENTOLOGY_VISA_IMAGE_NAME: "vv", SANDBOX_PAYMENTOLOGY_VISA_PARENT_ACCOUNT_ID: "5",
      SANDBOX_PAYMENTOLOGY_MASTERCARD_CARD_PRODUCT_ID: "22", SANDBOX_PAYMENTOLOGY_MASTERCARD_IMAGE_NAME: "mm", SANDBOX_PAYMENTOLOGY_MASTERCARD_PARENT_ACCOUNT_ID: "6" })).paymentologyProgrammes;
    expect(both.visa).toMatchObject({ clientId: 7, cardProductId: 11, imageName: "vv", parentAccountId: 5, cardBrand: "visa", currencyNumeric: "710" });
    expect(both.mastercard).toMatchObject({ cardProductId: 22, parentAccountId: 6, cardBrand: "mastercard" });
    const one = resolvePaymentsConfig(env({ ...base, SANDBOX_PAYMENTOLOGY_CARD_PRODUCT_ID: "9", SANDBOX_PAYMENTOLOGY_IMAGE_NAME: "x", SANDBOX_PAYMENTOLOGY_PARENT_ACCOUNT_ID: "4", SANDBOX_PAYMENTOLOGY_CARD_BRAND: "Mastercard" })).paymentologyProgrammes;
    expect(Object.keys(one)).toEqual(["mastercard"]); expect(one.mastercard).toMatchObject({ cardProductId: 9 });
    expect(resolvePaymentsConfig(env(base)).paymentologyProgrammes).toEqual({});                                          // nothing set: no guessing
    expect(resolvePaymentsConfig(env({ ...base, SANDBOX_PAYMENTOLOGY_VISA_CARD_PRODUCT_ID: "11" })).paymentologyProgrammes).toEqual({});   // incomplete product: not used
  });
});

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
