import { describe, it, expect } from "vitest";
import type { IssuingProvider } from "./types.js";
import { NotConfiguredError } from "./types.js";
import { MockIssuer, MOCK_WEBHOOK_SECRET } from "./mockIssuer.js";
import { PaymentologyIssuer } from "./paymentologyIssuer.js";
import { getIssuingProvider } from "./registry.js";
import { resolvePaymentsConfig } from "../config.js";
import { signWebhook } from "./webhook.js";

/** The behaviour every IssuingProvider must have. Run it against each adapter as it is built. */
function issuingContract(name: string, make: () => IssuingProvider) {
  describe(`issuing contract: ${name}`, () => {
    it("issues a card with only token, last4, brand and expiry (never a PAN or CVV)", async () => {
      const c = await make().createCard({ customerRef: "c1", kind: "virtual" });
      expect(Object.keys(c).sort()).toEqual(["brand", "expiry", "last4", "providerCardId", "status"]);
      expect(c.last4).toMatch(/^\d{4}$/);
      expect(c.expiry).toMatch(/^\d{2}\/\d{2}$/);
    });
    it("a blocked card cannot be reactivated", async () => {
      const p = make(), c = await p.createCard({ customerRef: "c1", kind: "virtual" });
      await p.setCardStatus(c.providerCardId, "blocked");
      await expect(p.setCardStatus(c.providerCardId, "active")).rejects.toThrow();
    });
    it("rejects an unsigned webhook", () => {
      expect(() => make().verifyWebhook(Buffer.from("{}"), {})).toThrow();
    });
  });
}

issuingContract("mock", () => new MockIssuer());

describe("mock issuer sandbox scenarios", () => {
  const authorise = async (setup: (i: MockIssuer, id: string) => Promise<void>, cents: number) => {
    const i = new MockIssuer(), c = await i.createCard({ customerRef: "x", kind: "virtual" });
    await setup(i, c.providerCardId);
    return i.authorise({ providerCardId: c.providerCardId, amount: { amount: cents, currency: "ZAR" }, channel: "tap", authorisationId: "a1" });
  };
  it("approves a normal purchase", async () => expect(await authorise(async () => {}, 10000)).toEqual({ approved: true }));
  it("declines the insufficient-funds and fraud amounts", async () => {
    expect((await authorise(async () => {}, 55500)).reason).toBe("insufficient_funds");
    expect((await authorise(async () => {}, 66600)).reason).toBe("suspected_fraud");
  });
  it("declines a frozen card", async () => expect((await authorise((i, id) => i.setCardStatus(id, "frozen"), 10000)).reason).toBe("card_frozen"));
  it("accepts a correctly signed webhook once, and rejects its replay", () => {
    const i = new MockIssuer(), raw = Buffer.from(JSON.stringify({ id: "e1", type: "card.created", data: {} }));
    const { signature, timestamp } = signWebhook(MOCK_WEBHOOK_SECRET, raw);
    const h = { "x-signature": signature, "x-timestamp": String(timestamp) };
    expect(i.verifyWebhook(raw, h).id).toBe("e1");
    expect(() => i.verifyWebhook(raw, h)).toThrow(/replayed/);
  });
});

describe("Paymentology adapter (not implemented yet)", () => {
  const p = new PaymentologyIssuer({ baseUrl: "https://sandbox.example", apiKey: "k", webhookSecret: "s" });
  it("fails loudly instead of pretending to work", async () => {
    await expect(p.createCard()).rejects.toBeInstanceOf(NotConfiguredError);
    await expect(p.setCardStatus()).rejects.toBeInstanceOf(NotConfiguredError);
    expect(() => p.verifyWebhook()).toThrow(NotConfiguredError);
  });
});

describe("registry", () => {
  it("returns the mock by default and Paymentology when configured", () => {
    expect(getIssuingProvider(resolvePaymentsConfig({} as NodeJS.ProcessEnv)).name).toBe("mock");
    const env = { ISSUING_PROVIDER: "paymentology", SANDBOX_PAYMENTOLOGY_BASE_URL: "https://s.test", SANDBOX_PAYMENTOLOGY_API_KEY: "k", SANDBOX_PAYMENTOLOGY_WEBHOOK_SECRET: "s" } as unknown as NodeJS.ProcessEnv;
    expect(getIssuingProvider(resolvePaymentsConfig(env)).name).toBe("paymentology");
  });
});
