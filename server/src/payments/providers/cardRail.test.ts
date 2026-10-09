import { describe, it, expect } from "vitest";
import { MockCardRail, MOCK_CARD_SCENARIOS, luhnValid, brandOf, expiryOf } from "./mockCardRail.js";
import { SandboxPanVault, VisaDirectPayout } from "./visaDirect.js";
import { xPayAuthenticator } from "./visaHttp.js";
import { resolvePaymentsConfig } from "../config.js";
import { getCardRail } from "./registry.js";

const EXPIRY = `${new Date().getUTCFullYear() + 3}-06`;
const holder = { cardholderName: "Pam Mokoena" };

describe("card number helpers", () => {
  it("every published test card is a valid number of the brand it is listed as", () => {
    for (const c of MOCK_CARD_SCENARIOS) { expect(luhnValid(c.pan), c.pan).toBe(true); expect(brandOf(c.pan), c.pan).toBe(c.brand); }
  });
  it("reads expiry as month/year and refuses past or malformed dates", () => {
    expect(expiryOf("2030-06", new Date("2026-10-08"))).toBe("06/30");
    expect(expiryOf("2026-09", new Date("2026-10-08"))).toBeNull();
    expect(expiryOf("2026-10", new Date("2026-10-08"))).toBe("10/26");
    expect(expiryOf("2030-13")).toBeNull(); expect(expiryOf("30-06")).toBeNull();
  });
});

describe("the bundled sandbox card rail", () => {
  const rail = () => new MockCardRail();
  const tok = (r: MockCardRail, pan: string) => r.tokenise({ primaryAccountNumber: pan, expiry: EXPIRY, ...holder });
  const send = (r: MockCardRail, token: string, reference: string) => r.push({ reference, card: { token, brand: "visa" }, amount: { amount: 5000, currency: "ZAR" }, recipientName: "Pam Mokoena", narrative: "x" });

  it("tokenises a test card without keeping or returning the number", async () => {
    const c = await tok(rail(), "4111111111111111");
    expect(c).toMatchObject({ last4: "1111", brand: "visa", funding: "debit" });
    expect(c.expiry).toMatch(/^06\/\d\d$/);
    expect(JSON.stringify(c)).not.toContain("4111111111111111");
  });
  it("tells debit from credit and prepaid, and refuses bad or expired cards", async () => {
    expect((await tok(rail(), "4242424242424242")).funding).toBe("credit");
    expect((await tok(rail(), "5105105105105100")).funding).toBe("prepaid");
    await expect(tok(rail(), "4111111111111112")).rejects.toThrow(/valid/);
    await expect(rail().tokenise({ primaryAccountNumber: "4111111111111111", expiry: "2020-01", ...holder })).rejects.toThrow(/expired/);
  });
  it("pays a card once per reference, however many times it is asked", async () => {
    const r = rail(), t = (await tok(r, "4111111111111111")).token;
    const a = await send(r, t, "cashout:aaa"), b = await send(r, t, "cashout:aaa");
    expect(a).toMatchObject({ status: "sent" }); expect(b).toEqual(a);
    expect((await send(r, t, "cashout:bbb")).providerRef).not.toBe(a.providerRef);
  });
  it("declines a card the issuer refuses, and fails twice then succeeds when the provider is flaky", async () => {
    const r = rail();
    expect(await send(r, (await tok(r, "4000000000000002")).token, "c1")).toMatchObject({ status: "declined" });
    const flaky = (await tok(r, "4000000000000119")).token;
    expect((await send(r, flaky, "c2")).status).toBe("error"); expect((await send(r, flaky, "c2")).status).toBe("error");
    expect((await send(r, flaky, "c2")).status).toBe("sent");
  });
  it("does not pay a token it did not make", async () => {
    expect(await send(rail(), "vault1:x:y:z", "c3")).toMatchObject({ status: "declined" });
  });
});

describe("the sandbox vault", () => {
  const vault = new SandboxPanVault("a-long-enough-vault-secret", ["4000000000000010"]);
  it("takes only published test cards, and seals the number in the token", async () => {
    const c = await vault.tokenise({ primaryAccountNumber: "4111111111111111", expiry: EXPIRY, ...holder });
    expect(c.token.startsWith("vault1:")).toBe(true);
    expect(c.token).not.toContain("4111111111111111");
    expect(vault.reveal(c.token)).toBe("4111111111111111");
    await expect(vault.tokenise({ primaryAccountNumber: "4532015112830366", expiry: EXPIRY, ...holder })).rejects.toThrow(/Only sandbox test cards/);   // a valid number that is not a test card
    expect((await vault.tokenise({ primaryAccountNumber: "4000000000000010", expiry: EXPIRY, ...holder })).last4).toBe("0010");   // an extra test number named in the settings is accepted
  });
  it("detects a tampered token and needs a long secret", async () => {
    const c = await vault.tokenise({ primaryAccountNumber: "5555555555554444", expiry: EXPIRY, ...holder });
    const parts = c.token.split(":"); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(() => vault.reveal(parts.join(":"))).toThrow();
    expect(() => new SandboxPanVault("short")).toThrow(/16/);
  });
});

describe("Visa Direct (sandbox)", () => {
  const vault = new SandboxPanVault("a-long-enough-vault-secret");
  const calls: { url: string; init: RequestInit }[] = [];
  const build = (respond: (url: string) => Response | Promise<Response>) => {
    calls.length = 0;
    const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return respond(String(url)); }) as unknown as typeof fetch;
    return new VisaDirectPayout({
      baseUrl: "https://sandbox.api.visa.com", authenticate: xPayAuthenticator("KEY", "SECRET"), fetchImpl, vault, acquiringBin: "408999", acquirerCountryCode: "710",
      sender: { accountNumber: "1234567890", name: "VINK", countryCode: "ZAF", city: "Cape Town" },
      cardAcceptor: { name: "VINK", idCode: "CA-IDCode-77", terminalId: "00000001", city: "Cape Town", country: "ZAF" }, now: () => new Date("2026-10-08T10:20:30Z"),
    });
  };
  const ok = (code: string, extra = {}) => new Response(JSON.stringify({ actionCode: code, transactionIdentifier: 381228649430015, ...extra }), { status: 200 });
  const input = async (reference = "cashout:one", brand: "visa" | "mastercard" = "visa", pan = "4111111111111111") =>
    ({ reference, card: { token: (await vault.tokenise({ primaryAccountNumber: pan, expiry: EXPIRY, ...holder })).token, brand }, amount: { amount: 2050, currency: "ZAR" }, recipientName: "Pam Mokoena", narrative: "Cash-out" });

  it("sends the push-funds request with the amount, the references and the sender, and reads action code 00 as paid", async () => {
    const r = await build(() => ok("00")).push(await input());
    expect(r).toEqual({ status: "sent", providerRef: "381228649430015" });
    expect(calls[0].url).toContain("/visadirect/fundstransfer/v1/pushfundstransactions?apiKey=KEY");
    expect((calls[0].init.headers as Record<string, string>)["x-pay-token"]).toBeTruthy();
    const b = JSON.parse(String(calls[0].init.body));
    expect(b).toMatchObject({ amount: 20.5, transactionCurrencyCode: "ZAR", businessApplicationId: "FD", acquiringBin: 408999, acquirerCountryCode: 710, recipientName: "Pam Mokoena", recipientPrimaryAccountNumber: "4111111111111111", senderAccountNumber: "1234567890", senderCountryCode: "ZAF", merchantCategoryCode: 6012, localTransactionDateTime: "2026-10-08T10:20:30" });
    expect(b.retrievalReferenceNumber).toMatch(/^\d{12}$/); expect(Number.isInteger(b.systemsTraceAuditNumber) && b.systemsTraceAuditNumber > 0).toBe(true); expect(b).not.toHaveProperty("transactionIdentifier");   // that field is the AFT's id, which a payout without an AFT does not have
    expect(b.cardAcceptor).toMatchObject({ name: "VINK", terminalId: "00000001", address: { city: "Cape Town", country: "ZAF" } });
  });
  it("sends the SAME transaction numbers for the same reference, so a retry cannot pay twice", async () => {
    const p = build(() => ok("00"));
    await p.push(await input("cashout:same")); await p.push(await input("cashout:same")); await p.push(await input("cashout:other"));
    const [a, b, c] = calls.map((x) => JSON.parse(String(x.init.body)));
    expect(a.retrievalReferenceNumber).toBe(b.retrievalReferenceNumber); expect(a.systemsTraceAuditNumber).toBe(b.systemsTraceAuditNumber);
    expect(a.retrievalReferenceNumber).not.toBe(c.retrievalReferenceNumber);
  });
  it("tells a refusal (declined) from an unknown outcome (error, retried)", async () => {
    expect((await build(() => ok("05")).push(await input()))).toMatchObject({ status: "declined" });
    expect((await build(() => ok("91")).push(await input()))).toMatchObject({ status: "error" });
    expect((await build(() => new Response("down", { status: 503 })).push(await input()))).toMatchObject({ status: "error" });
    expect((await build(() => { throw new TypeError("network"); }).push(await input()))).toMatchObject({ status: "error" });
    expect((await build(() => new Response("bad request", { status: 400 })).push(await input()))).toMatchObject({ status: "declined" });
  });
  it("when Visa answers a timeout with a status identifier, it asks Visa for the final result", async () => {
    const p = build((url) => (url.includes("pushfundstransactions/ST-1") ? ok("00") : new Response(JSON.stringify({ statusIdentifier: "ST-1" }), { status: 200 })));
    expect(await p.push(await input())).toMatchObject({ status: "sent" });
    expect(calls).toHaveLength(2); expect(calls[1].url).toContain("/visadirect/fundstransfer/v1/pushfundstransactions/ST-1"); expect(calls[1].init.method).toBe("GET");
    const still = build((url) => (url.includes("ST-1") ? new Response("busy", { status: 503 }) : new Response(JSON.stringify({ statusIdentifier: "ST-1" }), { status: 200 })));
    expect(await still.push(await input())).toMatchObject({ status: "error" });          // not final: tried again, never treated as paid
  });
  it("does not pay Mastercard cards (Mastercard Send is not built) or a token it did not make, and never leaks the card number", async () => {
    expect(await build(() => ok("00")).push(await input("c9", "mastercard", "5555555555554444"))).toMatchObject({ status: "declined", reason: expect.stringMatching(/Mastercard Send/) });
    expect(calls).toHaveLength(0);
    const p = build(() => ok("00"));
    expect(await p.push({ ...(await input()), card: { token: "mock:ok:abc", brand: "visa" } })).toMatchObject({ status: "declined" });
    const e = await build(() => new Response("card 4111111111111111 invalid", { status: 400 })).push(await input());
    expect(JSON.stringify(e)).not.toContain("4111111111111111");
  });
});

describe("configuration", () => {
  const base = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
  it("uses the bundled rail by default and gives the same instance for the vault and the payout", () => {
    const cfg = resolvePaymentsConfig(base);
    expect(cfg.cardPayoutProvider).toBe("mock");
    const rail = getCardRail(cfg);
    expect(rail.vault).toBe(rail.payout);
  });
  it("needs every Visa Direct setting, and says so", () => {
    expect(() => resolvePaymentsConfig({ ...base, CARD_PAYOUT_PROVIDER: "visa_direct" })).toThrow(/SANDBOX_VISA_DIRECT_ACQUIRING_BIN/);
    const ok = resolvePaymentsConfig({ ...base, CARD_PAYOUT_PROVIDER: "visa_direct", SANDBOX_VISA_API_KEY: "k", SANDBOX_VISA_SHARED_SECRET: "s", SANDBOX_VISA_DIRECT_ACQUIRING_BIN: "408999", SANDBOX_VISA_DIRECT_ACQUIRER_COUNTRY: "710", SANDBOX_VISA_DIRECT_SENDER_ACCOUNT: "123", SANDBOX_VISA_DIRECT_ACCEPTOR_ID_CODE: "id", SANDBOX_CARD_VAULT_KEY: "a-long-enough-vault-secret" });
    expect(ok.visaDirect).toMatchObject({ acquiringBin: "408999", sender: { name: "VINK", countryCode: "ZAF" } });
    expect(getCardRail(ok).name).toBe("visa_direct");
  });
  it("refuses Mastercard Send (not built), unknown providers, and any payout provider in live mode", () => {
    expect(() => resolvePaymentsConfig({ ...base, CARD_PAYOUT_PROVIDER: "mastercard_send" })).toThrow(/not built/);
    expect(() => resolvePaymentsConfig({ ...base, CARD_PAYOUT_PROVIDER: "other" })).toThrow(/mock or visa_direct/);
    // live mode: outside-card payouts are off by default (money leaves with the VINK card), so no payout provider is asked for; switched on, one is needed and none exists
    expect(() => resolvePaymentsConfig({ ...base, PAYMENTS_MODE: "live", NODE_ENV: "production" })).not.toThrow(/card payout provider/);
    expect(() => resolvePaymentsConfig({ ...base, PAYMENTS_MODE: "live", NODE_ENV: "production", TOKEN_EXTERNAL_PAYOUTS: "on" })).toThrow(/no card payout provider/);
  });
});
