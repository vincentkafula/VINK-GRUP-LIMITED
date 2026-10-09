import { describe, it, expect } from "vitest";
import { VisaPayouts, stateOfStatus, clientReferenceOf, type SendInput } from "./visaPayouts.js";
import { xPayAuthenticator } from "./visaHttp.js";

const calls: { url: string; init: RequestInit }[] = [];
const build = (respond: (url: string) => Response | Promise<Response>) => {
  calls.length = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return respond(String(url)); }) as unknown as typeof fetch;
  return new VisaPayouts({ baseUrl: "https://sandbox.api.visa.com", authenticate: xPayAuthenticator("KEY", "SECRET"), fetchImpl, initiatingPartyId: 1002, sender: { name: "VINK", country: "ZAF", city: "Cape Town", addressLine1: "1 Long St", accountNumber: "1234567890" } });
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const bank: SendInput = { reference: "payout:1", amount: { amount: 15_050, currency: "ZAR" }, narrative: "VINK cash-out", recipient: { firstName: "Thandi", lastName: "Nkosi", country: "ZAF", city: "Cape Town" },
  target: { kind: "bank", accountName: "T Nkosi", accountNumber: "6970093", accountNumberType: "DEFAULT", countryCode: "ZAF", currencyCode: "ZAR", bankCode: "632005", bankCodeType: "DEFAULT" } };
const wallet: SendInput = { reference: "payout:2", amount: { amount: 2_000, currency: "ZMW" }, recipient: { firstName: "John", lastName: "Do", country: "ZMB" },
  target: { kind: "wallet", operatorName: "AIRTEL_MONEY", accountIdentifier: "+260970000000", accountIdentifierType: "PHONENUMBER", countryCode: "ZMB", currencyCode: "ZMW" } };

describe("Visa Direct Account and Wallet payouts (sandbox)", () => {
  it("sends a bank payout with the reference's stable client id, the amount in units, and reads PAYMENT_RECEIVED as received, not delivered", async () => {
    const p = build(() => json({ transactionDetail: { status: "PAYMENT_RECEIVED", payoutId: "5de5-1" } }));
    expect(await p.send(bank)).toEqual({ state: "received", payoutId: "5de5-1", status: "PAYMENT_RECEIVED" });
    expect(calls[0].url).toContain("/visapayouts/v3/payouts?apiKey=KEY"); expect(calls[0].init.method).toBe("POST");
    const b = JSON.parse(String(calls[0].init.body));
    expect(b.payoutMethod).toBe("B");
    expect(b.transactionDetail).toMatchObject({ initiatingPartyId: 1002, businessApplicationId: "FD", transactionAmount: 150.5, transactionCurrencyCode: "ZAR", senderSourceOfFunds: "01", statementNarrative: "VINK cash-out", clientReferenceId: clientReferenceOf("payout:1") });
    expect(b.recipientDetail).toMatchObject({ type: "I", firstName: "Thandi", lastName: "Nkosi", bank: { accountNumber: "6970093", accountNumberType: "DEFAULT", countryCode: "ZAF", currencyCode: "ZAR" } });
    expect(b.recipientDetail.bank).not.toHaveProperty("kind");
    expect(b.senderDetail).toMatchObject({ type: "C", name: "VINK", senderAccountNumber: "1234567890" });
    expect(clientReferenceOf("payout:1")).toMatch(/^[A-Za-z0-9]{1,35}$/); expect(clientReferenceOf("payout:1")).toBe(clientReferenceOf("payout:1")); expect(clientReferenceOf("payout:1")).not.toBe(clientReferenceOf("payout:2"));
  });

  it("sends a wallet payout with the wallet details and an end-to-end id, and reads 202 PENDING as received", async () => {
    const p = build(() => json({ transactionDetail: { status: "PENDING" } }, 202));
    expect(await p.send(wallet)).toMatchObject({ state: "received", status: "PENDING" });
    const b = JSON.parse(String(calls[0].init.body));
    expect(b.payoutMethod).toBe("W"); expect(b.recipientDetail.wallet).toEqual({ operatorName: "AIRTEL_MONEY", accountIdentifier: "+260970000000", accountIdentifierType: "PHONENUMBER", countryCode: "ZMB", currencyCode: "ZMW" });
    expect(b.recipientDetail).not.toHaveProperty("bank"); expect(b.transactionDetail.endToEndId).toBe(b.transactionDetail.clientReferenceId);
    expect(b.senderDetail).not.toHaveProperty("senderAccountNumber");
  });

  it("maps Visa's statuses: only the delivered ones are final success, the failed ones are final failure, anything unrecognised is unknown", () => {
    for (const s of ["PAYMENT_DELIVERED", "DELIVERED_TO_RECIPIENT_BANK"]) expect(stateOfStatus(s)).toBe("delivered");
    for (const s of ["RETURNED", "REJECTED", "DECLINED", "FAILED", "CANCELLED", "ERROR", "VALIDATION_FAILED"]) expect(stateOfStatus(s)).toBe("failed");
    for (const s of ["PAYMENT_SENT", "IN_PROGRESS", "DELIVERED_TO_SCHEME", "AWAITING_INFORMATION"]) expect(stateOfStatus(s)).toBe("in_flight");
    for (const s of ["PAYMENT_RECEIVED", "PENDING"]) expect(stateOfStatus(s)).toBe("received");
    for (const s of [undefined, "", "SOMETHING_NEW"]) expect(stateOfStatus(s)).toBe("unknown");
  });

  it("tells a rejected request (failed) from no answer (unknown: ask before sending again), and never leaks a card-like number", async () => {
    expect(await build(() => json({ error: "bad" }, 400)).send(bank)).toMatchObject({ state: "failed" });
    expect(await build(() => new Response("down", { status: 503 })).send(bank)).toMatchObject({ state: "unknown" });
    expect(await build(() => { throw new TypeError("network"); }).send(bank)).toMatchObject({ state: "unknown" });
    expect(await build(() => json({ transactionDetail: { status: "WHO_KNOWS" } })).send(bank)).toMatchObject({ state: "unknown" });
    const e = await build(() => new Response("number 4111111111111111 invalid", { status: 400 })).send(bank);
    expect(JSON.stringify(e)).not.toContain("4111111111111111");
    expect(await build(() => json({})).send({ ...bank, amount: { amount: 0, currency: "ZAR" } })).toMatchObject({ state: "failed" });
    expect(calls).toHaveLength(0);
  });

  it("asks Visa for a payout by VINK's reference, and treats a missing or silent answer as unknown, never as delivered", async () => {
    const p = build(() => json({ transactionDetail: { status: "PAYMENT_DELIVERED", payoutId: "P9" } }));
    expect(await p.query("payout:1")).toEqual({ state: "delivered", payoutId: "P9", status: "PAYMENT_DELIVERED" });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toContain(`id=${clientReferenceOf("payout:1")}&idType=CLIENT_REFERENCE_ID&initiatingPartyId=1002`);
    expect(await build(() => json({}, 404)).query("payout:1")).toMatchObject({ state: "unknown" });
    expect(await build(() => new Response("x", { status: 500 })).query("payout:1")).toMatchObject({ state: "unknown" });
  });

  it("verifies a recipient and reports whether Visa completed the check", async () => {
    const p = build(() => json({ verificationStatus: "COMPLETED", verificationId: "V1", walletVerificationDetail: { nameMatch: "FULL" } }));
    expect(await p.verifyRecipient({ reference: "u1", target: wallet.target, firstName: "John", lastName: "Do" })).toEqual({ completed: true, detail: { nameMatch: "FULL" } });
    expect(calls[0].url).toContain("/visapayouts/v1/extensions/verifyRecipient");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ payoutMethod: "W", initiatingPartyId: 1002, recipientDetail: { wallet: { operatorName: "AIRTEL_MONEY" } } });
    expect(await build(() => json({ verificationStatus: "NOT_COMPLETED", verificationId: "V2" })).verifyRecipient({ reference: "u1", target: wallet.target, firstName: "J", lastName: "D" })).toMatchObject({ completed: false });
  });

  it("refuses bad configuration: a non-https address, a missing party id", () => {
    const f = (async () => json({})) as unknown as typeof fetch;
    expect(() => new VisaPayouts({ baseUrl: "http://x.test", authenticate: xPayAuthenticator("K", "S"), fetchImpl: f, initiatingPartyId: 1, sender: { name: "V", country: "ZAF", city: "C", addressLine1: "A" } })).toThrow(/https/);
    expect(() => new VisaPayouts({ baseUrl: "https://x.test", authenticate: xPayAuthenticator("K", "S"), fetchImpl: f, initiatingPartyId: 0, sender: { name: "V", country: "ZAF", city: "C", addressLine1: "A" } })).toThrow(/initiatingPartyId/);
  });
});
