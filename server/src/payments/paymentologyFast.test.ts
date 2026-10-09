import { describe, it, expect, vi } from "vitest";
import express from "express";
import http from "http";
import type { AddressInfo } from "net";
import { createPaymentologyFastRouter } from "./paymentologyFast.js";
import { PaymentologyIssuer } from "./providers/paymentologyIssuer.js";
import { NotConfiguredError } from "./providers/types.js";

async function withServer<T>(tokens: Parameters<typeof createPaymentologyFastRouter>[0]["tokens"], secret: string | null, fn: (post: (body: unknown, key?: string | null) => Promise<{ status: number; json: any }>) => Promise<T>): Promise<T> {
  const app = express(); app.use("/api/payments/issuer", createPaymentologyFastRouter({ tokens, secret }));
  const srv = http.createServer(app); await new Promise<void>((r) => srv.listen(0, r));
  const port = (srv.address() as AddressInfo).port;
  const post = async (body: unknown, key: string | null = "s3cret") => {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/issuer/fast`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) }, body: JSON.stringify(body) });
    const t = await res.text(); return { status: res.status, json: t ? JSON.parse(t) : null };
  };
  try { return await fn(post); } finally { srv.close(); }
}

const fake = () => ({ authorise: vi.fn(async (a: any) => (a.providerCardId === "999" ? null : a.amountCents > 5000 ? { approved: false, reason: "insufficient_funds", replayed: false } : { approved: true, replayed: false })), reverse: vi.fn(async () => ({ reversed: true, refundedCents: 100 })), isActive: vi.fn(async (_p: string, c: string) => (c === "999" ? null : c === "111")) });
const auth = (o: Record<string, unknown> = {}) => ({ Message_Type: "0100", TID: "T1", RID: "R1", Billing_Amount: 12.5, Spend_Type: "POS", ISO_MSG: { DE2: "111" }, ...o });

describe("Paymentology FAST endpoint", () => {
  it("refuses everything until a secret is configured, and rejects a wrong key", async () => {
    await withServer(fake(), null, async (post) => { expect((await post(auth())).status).toBe(501); });
    await withServer(fake(), "s3cret", async (post) => { expect((await post(auth(), "wrong")).status).toBe(401); expect((await post(auth(), null)).status).toBe(401); });
  });

  it("approves 0100 with the TID and RID echoed, and passes the amount in cents with an id made of both", async () => {
    const t = fake();
    await withServer(t, "s3cret", async (post) => {
      const r = await post(auth());
      expect(r.json).toEqual({ Message_Type: "0110", TID: "T1", RID: "R1", DE39: "00" });
      expect(t.authorise).toHaveBeenCalledWith(expect.objectContaining({ providerCardId: "111", authorisationId: "T1:R1", amountCents: 1250, channel: "pos" }));
      expect((await post(auth({ Message_Type: "0200", Spend_Type: "ATM Withdrawal" }))).json.Message_Type).toBe("0210");
      expect(t.authorise).toHaveBeenLastCalledWith(expect.objectContaining({ channel: "atm" }));
    });
  });

  it("declines with the right code: no funds (51), not our card (14), unreadable (30), failure (96)", async () => {
    const t = fake();
    await withServer(t, "s3cret", async (post) => {
      expect((await post(auth({ Billing_Amount: 60 }))).json.DE39).toBe("51");
      expect((await post(auth({ ISO_MSG: { DE2: "999" } }))).json.DE39).toBe("14");
      expect((await post(auth({ ISO_MSG: {} }))).json.DE39).toBe("30");
      expect((await post(auth({ Billing_Amount: "abc" }))).json.DE39).toBe("30");
      expect((await post(auth({ TID: undefined }))).json.DE39).toBe("30");
      t.authorise.mockRejectedValueOnce(new Error("db down"));
      expect((await post(auth())).json.DE39).toBe("96");
    });
  });

  it("answers a zero-amount card check from the card's state", async () => {
    await withServer(fake(), "s3cret", async (post) => {
      expect((await post(auth({ Billing_Amount: 0 }))).json.DE39).toBe("00");
      expect((await post(auth({ Billing_Amount: 0, ISO_MSG: { DE2: "222" } }))).json.DE39).toBe("62");
      expect((await post(auth({ Billing_Amount: 0, ISO_MSG: { DE2: "999" } }))).json.DE39).toBe("14");
    });
  });

  it("reverses by thread (0400 and 0420), acknowledges advice and clearing, and rejects unknown types", async () => {
    const t = fake();
    await withServer(t, "s3cret", async (post) => {
      const r = await post({ Message_Type: "0400", TID: "T1", RID: "R2", Billing_Amount: 5 });
      expect(r.json).toEqual({ Message_Type: "0410", TID: "T1", RID: "R2", DE39: "00" });
      expect(t.reverse).toHaveBeenCalledWith({ provider: "paymentology", threadId: "T1", amountCents: 500, reversalId: "R2" });
      expect((await post({ Message_Type: "0420", TID: "T1", RID: "R3" })).json.Message_Type).toBe("0430");
      expect(t.reverse).toHaveBeenLastCalledWith(expect.objectContaining({ amountCents: undefined }));
      expect((await post({ Message_Type: "0120", TID: "T9", RID: "R9" })).json).toEqual({ Message_Type: "0130", TID: "T9", RID: "R9", DE39: "00" });
      const c = await post({ Message_Type: "1240", TID: "T9", RID: "R9" }); expect(c.status).toBe(200); expect(c.json).toBeNull();
      expect((await post({ Message_Type: "0800", TID: "x", RID: "y" })).status).toBe(400);
      expect((await post({})).status).toBe(400);
    });
  });
});

describe("PaymentologyIssuer", () => {
  const creds = { baseUrl: "https://uat.banking.live:55555/ppws/api", apiKey: "KEY", webhookSecret: "w" } as any;
  const programme = { clientId: 7, cardProductId: 11, imageName: "vink", parentAccountId: 55, currencyNumeric: "710", cardBrand: "visa" as const };
  const holder = { firstName: "Thandi", lastName: "Nkosi", mobile: "27820000000", email: "t@example.com" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const ok = (body: Record<string, unknown>) => reply({ header: { error_id: 0 }, body });

  it("creates a customer then a virtual card, with the key header, no card number requested, and maps the answer", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ customer_id: 42 })).mockResolvedValueOnce(ok({ token: 123456789, last_four_digit: "4321", expiry: "09/29" }));
    const card = await new PaymentologyIssuer(creds, programme, { fetchImpl: f as any }).createCard({ customerRef: "u-1", kind: "virtual", requestId: "req-1", holder });
    expect(card).toEqual({ providerCardId: "123456789", last4: "4321", brand: "visa", expiry: "09/29", status: "active" });
    const [u1, i1] = f.mock.calls[0], [u2, i2] = f.mock.calls[1];
    expect(u1).toBe("https://uat.banking.live:55555/ppws/api/pws/v2/pws_create_customer"); expect(u2).toContain("/pws/v2/pws_create_card/");
    expect(i1.headers["X-API-Key"]).toBe("KEY");
    const b2 = JSON.parse(i2.body); expect(b2).toMatchObject({ card_type: 2, cu_id: 42, crd_prdct_id: 11, image_delivery: 3, image_fields: "00000", xml_fields: "00000", ac_parent_id: 55 });
    expect(JSON.parse(i1.body).api_call_unique_identifier).toBe("vkcreq1");
  });

  it("issues Visa and Mastercard from separate card products, and a physical card is created switched off with the name to print", async () => {
    const both = { visa: programme, mastercard: { ...programme, cardProductId: 22, cardBrand: "mastercard" as const } };
    const f = vi.fn().mockImplementation(async (url: string) => (String(url).includes("create_customer") ? ok({ customer_id: 42 }) : ok({ token: 777, last_four_digit: "4321", expiry: "09/29" })));
    const p = new PaymentologyIssuer(creds, both, { fetchImpl: f as any });
    expect(p.brands().sort()).toEqual(["mastercard", "visa"]);
    const mc = await p.createCard({ customerRef: "u-1", kind: "physical", requestId: "r2", holder, brand: "mastercard", embossName: "T NKOSI" });
    expect(mc).toMatchObject({ brand: "mastercard", status: "inactive" });
    const body = JSON.parse(f.mock.calls[1][1].body);
    expect(body).toMatchObject({ card_type: 1, crd_prdct_id: 22, status_nwk: 1005, emboss_name: "T NKOSI" });
    await p.createCard({ customerRef: "u-1", kind: "virtual", requestId: "r3", holder, brand: "visa" });
    expect(JSON.parse(f.mock.calls[3][1].body)).toMatchObject({ card_type: 2, crd_prdct_id: 11, status_nwk: 1000 });
    expect(JSON.parse(f.mock.calls[3][1].body)).not.toHaveProperty("emboss_name");
    await expect(p.createCard({ customerRef: "u-1", kind: "virtual", holder })).rejects.toThrow(/Choose Visa or Mastercard/);        // two products: the brand must be chosen
    await expect(p.createCard({ customerRef: "u-1", kind: "physical", holder, brand: "visa" })).rejects.toThrow(/name to print/);
    await expect(new PaymentologyIssuer(creds, { visa: programme }, { fetchImpl: f as any }).createCard({ customerRef: "u", kind: "virtual", holder, brand: "mastercard" })).rejects.toBeInstanceOf(NotConfiguredError);
  });

  it("maps failures: an error id, a retryable 1066, a 404, a 500, a missing mobile and an incomplete card answer", async () => {
    const mk = (f: any) => new PaymentologyIssuer(creds, programme, { fetchImpl: f });
    const input = { customerRef: "u-1", kind: "virtual" as const, holder };
    await expect(mk(vi.fn().mockResolvedValue(reply({ header: { error_id: 1066, error_desc: "busy" } }))).createCard(input)).rejects.toMatchObject({ errorId: 1066, retry: true });
    await expect(mk(vi.fn().mockResolvedValue(reply({ header: { error_id: 5, error_desc: "bad" } }))).createCard(input)).rejects.toMatchObject({ errorId: 5, retry: false });
    await expect(mk(vi.fn().mockResolvedValue(reply({}, 404))).createCard(input)).rejects.toThrow(/does not exist/);
    await expect(mk(vi.fn().mockResolvedValue(reply({}, 500))).createCard(input)).rejects.toMatchObject({ retry: true });
    await expect(mk(vi.fn()).createCard({ ...input, holder: { ...holder, mobile: "" } })).rejects.toThrow(/mobile/);
    const f = vi.fn().mockResolvedValueOnce(ok({ customer_id: 42 })).mockResolvedValueOnce(ok({ token: 1, last_four_digit: "12" }));
    await expect(mk(f).createCard(input)).rejects.toThrow(/last four/);
  });

  it("sets the card status with the network codes and is not configured without programme settings", async () => {
    const f = vi.fn().mockImplementation(async () => ok({}));
    const p = new PaymentologyIssuer(creds, programme, { fetchImpl: f as any });
    await p.setCardStatus("123", "frozen"); await p.setCardStatus("123", "blocked");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ status_nwk: "1005", token: 123 }); expect(JSON.parse(f.mock.calls[1][1].body).status_nwk).toBe("1009");
    await expect(p.setCardStatus("12ab", "active")).rejects.toThrow(/token/);
    await expect(new PaymentologyIssuer(creds, null).createCard({ customerRef: "x", kind: "virtual", holder })).rejects.toBeInstanceOf(NotConfiguredError);
    expect(() => p.verifyWebhook()).toThrow(NotConfiguredError);
  });
});
