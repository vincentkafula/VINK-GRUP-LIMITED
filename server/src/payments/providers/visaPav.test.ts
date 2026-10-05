import { describe, it, expect, vi } from "vitest";
import { VisaPavValidation, retrievalReference } from "./visaPav.js";
import { MockAccountValidation } from "./mockAccountValidation.js";
import { xPayAuthenticator, VisaApiError } from "./visaHttp.js";
import { getAccountValidationProvider } from "./registry.js";
import { resolvePaymentsConfig } from "../config.js";

const PAN = "4111111111111111";   // generic published test number

function fakeVisa(reply: { status?: number; body: unknown }) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  return { calls, impl: impl as unknown as typeof fetch };
}
const make = (f: ReturnType<typeof fakeVisa>) => new VisaPavValidation({
  baseUrl: "https://sandbox.api.visa.com", authenticate: xPayAuthenticator("KEY", "SECRET"), acquiringBin: "408999", acquirerCountryCode: "840",
  cardAcceptor: { name: "VINK", idCode: "111111", terminalId: "12345678" }, fetchImpl: f.impl,
});

describe("Visa PAV client (request matches the OpenAPI spec)", () => {
  it("POSTs /pav/v1/cardvalidation with the required acquirer fields and the card", async () => {
    const f = fakeVisa({ body: { actionCode: "00", responseCode: "5", transactionIdentifier: "123456789012345", cvv2ResultCode: "M", addressVerificationResults: "Y" } });
    const r = await make(f).validate({ primaryAccountNumber: PAN, expiry: "2040-10", cvv2: "022", postalCode: "94404", street: "801 Metro Center Blv" });
    expect(r).toEqual({ valid: true, actionCode: "00", reference: "123456789012345", cvv2Result: "M", addressResult: "Y" });
    const c = f.calls[0], body = JSON.parse(c.body);
    expect(c.method).toBe("POST");
    expect(c.url.startsWith("https://sandbox.api.visa.com/pav/v1/cardvalidation?apiKey=KEY")).toBe(true);
    expect(c.headers["x-pay-token"]).toMatch(/^xv2:\d+:[0-9a-f]{64}$/);
    expect(body).toMatchObject({ primaryAccountNumber: PAN, cardExpiryDate: "2040-10", cardCvv2Value: "022", acquiringBin: "408999", acquirerCountryCode: "840",
      cardAcceptor: { name: "VINK", idCode: "111111", terminalId: "12345678" }, addressVerificationResults: { postalCode: "94404", street: "801 Metro Center Blv" } });
    expect(body.retrievalReferenceNumber).toMatch(/^\d{12}$/);
    expect(Number.isInteger(body.systemsTraceAuditNumber)).toBe(true);
  });

  it("omits optional checks that were not asked for", async () => {
    const f = fakeVisa({ body: { actionCode: "00" } });
    await make(f).validate({ primaryAccountNumber: PAN, expiry: "2040-10" });
    const body = JSON.parse(f.calls[0].body);
    expect(body.cardCvv2Value).toBeUndefined();
    expect(body.addressVerificationResults).toBeUndefined();
  });

  it("reports a non-00 action code as not valid, with the raw code", async () => {
    const f = fakeVisa({ body: { actionCode: "14" } });
    expect(await make(f).validate({ primaryAccountNumber: PAN, expiry: "2040-10" })).toMatchObject({ valid: false, actionCode: "14" });
  });

  it("validates input before any request", async () => {
    const f = fakeVisa({ body: {} });
    const v = make(f);
    await expect(v.validate({ primaryAccountNumber: "123", expiry: "2040-10" })).rejects.toThrow(/13 to 19/);
    await expect(v.validate({ primaryAccountNumber: PAN, expiry: "10/40" })).rejects.toThrow(/YYYY-MM/);
    await expect(v.validate({ primaryAccountNumber: PAN, expiry: "2040-13" })).rejects.toThrow(/YYYY-MM/);
    await expect(v.validate({ primaryAccountNumber: PAN, expiry: "2040-10", cvv2: "12" })).rejects.toThrow(/cvv2/);
    expect(f.calls).toHaveLength(0);
  });

  it("errors never contain the card number", async () => {
    const f = fakeVisa({ status: 400, body: `invalid account ${PAN} cvv 022` });
    const err = await make(f).validate({ primaryAccountNumber: PAN, expiry: "2040-10", cvv2: "022" }).catch((e) => e);
    expect(err).toBeInstanceOf(VisaApiError);
    expect(err.message).not.toContain(PAN);
    expect(err.message).toContain("1111");
  });

  it("fails if Visa returns no action code", async () => {
    await expect(make(fakeVisa({ body: {} })).validate({ primaryAccountNumber: PAN, expiry: "2040-10" })).rejects.toThrow(/actionCode/);
  });

  it("refuses bad acquirer settings and http", () => {
    const base = { authenticate: xPayAuthenticator("k", "s"), cardAcceptor: { name: "M", idCode: "1", terminalId: "1" } };
    expect(() => new VisaPavValidation({ ...base, baseUrl: "https://x.test", acquiringBin: "123", acquirerCountryCode: "840" })).toThrow(/acquiringBin/);
    expect(() => new VisaPavValidation({ ...base, baseUrl: "https://x.test", acquiringBin: "408999", acquirerCountryCode: "ZA" })).toThrow(/3-digit/);
    expect(() => new VisaPavValidation({ ...base, baseUrl: "http://x.test", acquiringBin: "408999", acquirerCountryCode: "840" })).toThrow(/https/);
  });
});

describe("retrievalReference", () => {
  it("is ydddhhnnnnnn: year digit, day of year, hour, six digits", () => {
    // 2 Oct 2026 is day 275 of the year; 05:00 UTC; sequence 42 -> year digit 6, day 275, hour 05, 000042
    expect(retrievalReference(new Date(Date.UTC(2026, 9, 2, 5)), 42)).toBe("627505000042");
  });
});

describe("mock account validation", () => {
  const m = new MockAccountValidation();
  it("accepts a Luhn-valid, unexpired card", async () => expect(await m.validate({ primaryAccountNumber: PAN, expiry: "2040-10" })).toMatchObject({ valid: true, actionCode: "00" }));
  it("rejects a bad checksum, an expired card, and the failing CVV2", async () => {
    expect((await m.validate({ primaryAccountNumber: "4111111111111112", expiry: "2040-10" })).valid).toBe(false);
    expect((await m.validate({ primaryAccountNumber: PAN, expiry: "2020-01" })).actionCode).toBe("54");
    expect((await m.validate({ primaryAccountNumber: PAN, expiry: "2040-10", cvv2: "000" })).cvv2Result).toBe("N");
  });
});

describe("configuration", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  const pav = { ACCOUNT_VALIDATION_PROVIDER: "visa_pav", SANDBOX_VISA_API_KEY: "k", SANDBOX_VISA_SHARED_SECRET: "s", SANDBOX_VISA_ACQUIRING_BIN: "408999", SANDBOX_VISA_ACQUIRER_COUNTRY: "840", SANDBOX_VISA_ACCEPTOR_ID_CODE: "111111" };
  it("defaults to the mock", () => expect(getAccountValidationProvider(resolvePaymentsConfig(env({}))).name).toBe("mock"));
  it("builds Visa PAV from sandbox settings, with defaults for the acceptor name and terminal", () => {
    const cfg = resolvePaymentsConfig(env(pav));
    expect(cfg.visaPav).toMatchObject({ acquiringBin: "408999", acceptorName: "VINK", terminalId: "00000001", baseUrl: "https://sandbox.api.visa.com" });
    expect(getAccountValidationProvider(cfg).name).toBe("visa_pav");
  });
  it("never invents the acquirer BIN", () => {
    const { SANDBOX_VISA_ACQUIRING_BIN: _omit, ...noBin } = pav;
    expect(() => resolvePaymentsConfig(env(noBin))).toThrow(/SANDBOX_VISA_ACQUIRING_BIN/);
  });
  it("is rejected in live mode", () => {
    expect(() => resolvePaymentsConfig(env({ ...pav, PAYMENTS_MODE: "live", NODE_ENV: "production" }))).toThrow(/Visa PAV sandbox/);
  });
});
