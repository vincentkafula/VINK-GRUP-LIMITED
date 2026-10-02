import { describe, it, expect, vi } from "vitest";
import { VisaDpsServicing, xPayAuthenticator, redactPan, DPS_STATUS, VisaDpsError } from "./visaDps.js";
import { MockCardServicing } from "./mockCardServicing.js";
import { getCardServicingProvider } from "./registry.js";
import { resolvePaymentsConfig } from "../config.js";
import type { CardServicingProvider } from "./types.js";

const BASE = "https://sandbox.api.visa.com";
const TEST_PAN = "4111111111111111";

/** A fake Visa: records each request and replies from a queue. */
function fakeVisa(...replies: { status?: number; body: unknown }[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body as string | undefined });
    const r = replies.shift() ?? { body: {} };
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return { calls, impl: impl as unknown as typeof fetch };
}
const make = (f: ReturnType<typeof fakeVisa>, programType: "debit" | "prepaid" = "debit") =>
  new VisaDpsServicing({ baseUrl: BASE, programType, authenticate: xPayAuthenticator("KEY", "SECRET"), fetchImpl: f.impl });

describe("Visa DPS client (requests match the OpenAPI spec)", () => {
  it("registers a card: POST /dcas/cardservices/v2/cards with primaryAccountNumber, returns the card id", async () => {
    const f = fakeVisa({ body: { resource: { cardId: "7037a4e1-ec71-499f-ba1f-e8555a046195" } } });
    expect(await make(f).registerCard({ primaryAccountNumber: TEST_PAN })).toEqual({ cardId: "7037a4e1-ec71-499f-ba1f-e8555a046195" });
    const c = f.calls[0];
    expect(c.method).toBe("POST");
    expect(c.url.startsWith(`${BASE}/dcas/cardservices/v2/cards?apiKey=KEY`)).toBe(true);
    expect(JSON.parse(c.body!)).toEqual({ primaryAccountNumber: TEST_PAN });
    expect(c.headers["x-pay-token"]).toMatch(/^xv2:\d+:[0-9a-f]{64}$/);
  });

  it("rejects a malformed card number before any request is made", async () => {
    const f = fakeVisa();
    await expect(make(f).registerCard({ primaryAccountNumber: "1234" })).rejects.toThrow(/16 to 19 digits/);
    expect(f.calls).toHaveLength(0);
  });

  it("reads card status (debit v2, prepaid v1 path)", async () => {
    const d = fakeVisa({ body: { resource: { activationStatus: "ACTIVATED", status: "" } } });
    expect(await make(d).getCardStatus("card-1")).toEqual({ status: "", activationStatus: "ACTIVATED" });
    expect(d.calls[0].url).toContain("/dcas/cardservices/v2/cards/card-1/cardstatus");
    const p = fakeVisa({ body: { resource: { status: "STOLEN_CARD" } } });
    expect((await make(p, "prepaid").getCardStatus("card-1")).status).toBe("STOLEN_CARD");
    expect(p.calls[0].url).toContain("/dcas/cardservices/v1/cards/prepaid/card-1/cardstatus");
  });

  it("freezes and unfreezes with the spec's status codes (debit and prepaid)", async () => {
    const f = fakeVisa({ body: {} }, { body: {} });
    const dps = make(f);
    await dps.setCardStatus("card-1", "frozen");
    await dps.setCardStatus("card-1", "active");
    expect(f.calls.map((c) => [c.method, JSON.parse(c.body!).status])).toEqual([["PUT", "LK-LOCKED_BY_CARDHOLDER"], ["PUT", "__-UNLOCK_BY_CARDHOLDER"]]);
    const p = fakeVisa({ body: {} });
    await make(p, "prepaid").setCardStatus("card-1", "frozen");
    expect(JSON.parse(p.calls[0].body!).status).toBe("SUSPENDED");
    expect(DPS_STATUS.debit.blocked).toBe("ND-LOST/STOLEN_CARD_(NO_CARD_PICK_UP)");
  });

  it("returns card details with masked account numbers", async () => {
    const f = fakeVisa({ body: { resource: { cardId: "c1", last4PrimaryAccountNumber: "0217", accounts: [{ accountId: "a1", accountNumber: "3546789", accountTypeDescription: "Other" }] } } });
    expect(await make(f).getCardDetails("c1")).toEqual({ cardId: "c1", last4: "0217", accounts: [{ accountId: "a1", accountNumberMasked: "••••6789", type: "Other" }] });
    expect(f.calls[0].url).toContain("/dcas/cardservices/v2/cards/c1");
  });

  it("refuses a card id that could alter the path", async () => {
    const f = fakeVisa();
    await expect(make(f).getCardStatus("../../x")).rejects.toThrow(/invalid card id/);
    await expect(make(f).getCardDetails("a/b")).rejects.toThrow(/invalid card id/);
    expect(f.calls).toHaveLength(0);
  });

  it("turns provider errors into VisaDpsError with card numbers masked", async () => {
    const f = fakeVisa({ status: 400, body: `bad request for 4111 1111 1111 1111 and 5555555555554444` });
    const err = await make(f).registerCard({ primaryAccountNumber: TEST_PAN }).catch((e) => e);
    expect(err).toBeInstanceOf(VisaDpsError);
    expect(err.status).toBe(400);
    expect(err.message).not.toContain("4111111111111111");
    expect(err.message).not.toMatch(/\d{13,}/);
    expect(err.message).toContain("1111");
  });

  it("requires https", () => {
    expect(() => new VisaDpsServicing({ baseUrl: "http://x.test", programType: "debit", authenticate: () => ({ headers: {} }) })).toThrow(/https/);
  });
});

describe("redactPan", () => {
  it("masks long digit runs but leaves short numbers alone", () => {
    expect(redactPan("card 4111-1111-1111-1111 ok")).toBe("card ************1111 ok");
    expect(redactPan("code 12345 amount 100")).toBe("code 12345 amount 100");
  });
});

/** Behaviour every card-servicing provider must have; run for each adapter. */
function servicingContract(name: string, make: () => CardServicingProvider) {
  describe(`card servicing contract: ${name}`, () => {
    it("registers a card and exposes only the id and last4", async () => {
      const p = make();
      const { cardId } = await p.registerCard({ primaryAccountNumber: TEST_PAN });
      expect(cardId).toBeTruthy();
      const d = await p.getCardDetails(cardId);
      expect(JSON.stringify(d)).not.toContain(TEST_PAN);
    });
  });
}
servicingContract("mock", () => new MockCardServicing());

describe("mock card servicing", () => {
  it("freezes, unfreezes and blocks (a blocked card stays blocked)", async () => {
    const p = new MockCardServicing(), { cardId } = await p.registerCard({ primaryAccountNumber: TEST_PAN });
    await p.setCardStatus(cardId, "frozen");
    expect((await p.getCardStatus(cardId)).status).toBe("frozen");
    await p.setCardStatus(cardId, "blocked");
    await expect(p.setCardStatus(cardId, "active")).rejects.toThrow(/blocked/);
    expect((await p.getCardDetails(cardId)).last4).toBe("1111");
  });
});

describe("configuration", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  it("defaults to the mock", () => expect(getCardServicingProvider(resolvePaymentsConfig(env({}))).name).toBe("mock"));
  it("selects Visa DPS in sandbox when credentials are present, defaulting to Visa's sandbox host", () => {
    const cfg = resolvePaymentsConfig(env({ CARD_SERVICING_PROVIDER: "visa_dps", SANDBOX_VISA_API_KEY: "k", SANDBOX_VISA_SHARED_SECRET: "s" }));
    expect(cfg.visaDps?.baseUrl).toBe("https://sandbox.api.visa.com");
    expect(getCardServicingProvider(cfg).name).toBe("visa_dps");
  });
  it("needs both credentials", () => {
    expect(() => resolvePaymentsConfig(env({ CARD_SERVICING_PROVIDER: "visa_dps", SANDBOX_VISA_API_KEY: "k" }))).toThrow(/SANDBOX_VISA_API_KEY and SANDBOX_VISA_SHARED_SECRET/);
  });
  it("live mode never accepts the Visa sandbox provider", () => {
    expect(() => resolvePaymentsConfig(env({ PAYMENTS_MODE: "live", NODE_ENV: "production", CARD_SERVICING_PROVIDER: "visa_dps", SANDBOX_VISA_API_KEY: "k", SANDBOX_VISA_SHARED_SECRET: "s" }))).toThrow(/sandbox-only/);
  });
  it("rejects unknown providers and program types", () => {
    expect(() => resolvePaymentsConfig(env({ CARD_SERVICING_PROVIDER: "x" }))).toThrow(/CARD_SERVICING_PROVIDER/);
    expect(() => resolvePaymentsConfig(env({ SANDBOX_VISA_PROGRAM_TYPE: "credit" }))).toThrow(/PROGRAM_TYPE/);
  });
});
