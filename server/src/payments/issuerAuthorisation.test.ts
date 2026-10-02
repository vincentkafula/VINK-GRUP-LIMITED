import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createManshya } = require("../manshya/core");
import { createIssuerRouter } from "./issuerRoutes.js";
import { resolvePaymentsConfig } from "./config.js";
import { signWebhook } from "./providers/webhook.js";
import { MOCK_WEBHOOK_SECRET } from "./providers/mockIssuer.js";

/* End to end: signed authorisation request -> issuer router -> Manshya card engine -> ledger. */

let mn: any, server: Server, base = "", merchant: any, account: any, cardId = "";
let n = 0;

const balance = () => mn.services.listAccounts(merchant).find((a: any) => a.id === account.id).balance as number;

async function send(body: object, opts: { secret?: string; badSig?: boolean; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const { signature, timestamp } = signWebhook(opts.secret ?? MOCK_WEBHOOK_SECRET, raw);
  const res = await fetch(base + "/authorisation", {
    method: "POST", body: raw,
    headers: { "content-type": "application/json", "x-signature": opts.badSig ? signature.replace(/.$/, signature.endsWith("0") ? "1" : "0") : signature, "x-timestamp": String(timestamp) },
  });
  return { status: res.status, json: (await res.json()) as { approved: boolean; reason?: string; replayed?: boolean } };
}
const auth = (over: Record<string, unknown> = {}, id = `auth_${++n}`) => ({
  id, type: "card.authorisation", data: { providerCardId: "prov_card_1", amount: { amount: 10000, currency: "ZAR" }, channel: "chip", merchantName: "Test Shop", ...over },
});

beforeAll(async () => {
  mn = createManshya({ paymentsMode: "sandbox" });
  merchant = mn.services.createMerchant("Issuer Co");
  account = mn.services.listAccounts(merchant)[0];
  // fund the account: take card payments, then pay the balance out to the bank account
  for (let i = 0; i < 3; i++) await mn.services.createPayment(merchant, { amount: 500000, method: "card", channel: "online", paymentToken: "tok_visa", reference: "F" + i, customer: { name: "B", email: "b@x.co" } });
  await mn.services.requestPayout(merchant, { destination: { type: "bank_account", accountId: account.id } });
  const card = mn.cards.order(merchant, { accountId: account.id, limit: 1000000, dailyLimit: 800000 });
  mn.cards.activate(merchant, card.id);
  cardId = card.id;
  mn.cards.linkProviderCard(merchant, card.id, "mock", "prov_card_1");

  const app = express();
  app.use("/", createIssuerRouter(resolvePaymentsConfig({} as NodeJS.ProcessEnv), { cards: mn.cards }));
  server = await new Promise<Server>((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); mn.close(); });

describe("issuer real-time authorisation", () => {
  it("approves a purchase and moves the money out of the linked account", async () => {
    const before = balance();
    const r = await send(auth());
    expect(r).toMatchObject({ status: 200, json: { approved: true, replayed: false } });
    expect(balance()).toBe(before - 10000);
  });

  it("a retried request returns the same answer and does NOT spend twice", async () => {
    const evt = auth({}, "auth_retry");
    const before = balance();
    const first = await send(evt), second = await send(evt), third = await send(evt);
    expect(first.json).toMatchObject({ approved: true, replayed: false });
    expect(second.json).toMatchObject({ approved: true, replayed: true });
    expect(third.json).toMatchObject({ approved: true, replayed: true });
    expect(balance()).toBe(before - 10000);
  });

  it("many simultaneous copies of one request spend exactly once", async () => {
    const evt = auth({}, "auth_race"), before = balance();
    const results = await Promise.all(Array.from({ length: 12 }, () => send(evt)));
    expect(results.every((r) => r.status === 200 && r.json.approved)).toBe(true);
    expect(results.filter((r) => !r.json.replayed)).toHaveLength(1);
    expect(balance()).toBe(before - 10000);
  });

  it("declines, with a reason and without spending: unknown card, bad amount, wrong currency", async () => {
    const before = balance();
    expect((await send(auth({ providerCardId: "nope" }))).json).toMatchObject({ approved: false, reason: "unknown_card" });
    expect((await send(auth({ amount: { amount: 0, currency: "ZAR" } }))).json).toMatchObject({ approved: false, reason: "invalid_amount" });
    expect((await send(auth({ amount: { amount: 1.5, currency: "ZAR" } }))).json).toMatchObject({ approved: false, reason: "invalid_amount" });
    expect((await send(auth({ amount: { amount: 100, currency: "USD" } }))).json).toMatchObject({ approved: false, reason: "currency_not_supported" });
    expect((await send(auth({ channel: "carrier-pigeon" }))).json).toMatchObject({ approved: false, reason: "channel_not_supported" });
    expect(balance()).toBe(before);
  });

  it("enforces the card's own rules: channel switches, limits, funds", async () => {
    mn.cards.update(merchant, cardId, { tap: false });
    expect((await send(auth({ channel: "tap" }))).json).toMatchObject({ approved: false, reason: "tap_disabled" });
    mn.cards.update(merchant, cardId, { tap: true });
    expect((await send(auth({ amount: { amount: 900000, currency: "ZAR" } }))).json).toMatchObject({ approved: false, reason: "daily_limit" });
    mn.cards.update(merchant, cardId, { dailyLimit: 1e9, limit: 1e9 });
    expect((await send(auth({ amount: { amount: 9_000_000_00, currency: "ZAR" } }))).json).toMatchObject({ approved: false, reason: "insufficient_funds" });
    mn.cards.update(merchant, cardId, { dailyLimit: 800000, limit: 1000000 });
  });

  it("declines everything on a frozen card, and approves again once unfrozen", async () => {
    mn.cards.update(merchant, cardId, { status: "frozen" });
    expect((await send(auth())).json).toMatchObject({ approved: false, reason: "card_frozen" });
    mn.cards.update(merchant, cardId, { status: "active" });
    expect((await send(auth())).json.approved).toBe(true);
  });

  it("records every decision once, tagged with the mode", () => {
    const rows = mn.db.prepare("SELECT provider, mode FROM authorisations").all() as { provider: string; mode: string }[];
    expect(rows.length).toBeGreaterThan(5);
    expect(new Set(rows.map((r) => r.mode))).toEqual(new Set(["sandbox"]));
    expect(mn.db.prepare("SELECT COUNT(*) n FROM authorisations WHERE authorisation_id='auth_race'").get().n).toBe(1);
  });

  it("rejects bad signatures, a wrong secret, tampered bodies, and malformed requests", async () => {
    const before = balance();
    expect((await send(auth(), { badSig: true })).status).toBe(401);
    expect((await send(auth(), { secret: "not-the-secret" })).status).toBe(401);
    const raw = JSON.stringify(auth({}, "auth_tamper")), { signature, timestamp } = signWebhook(MOCK_WEBHOOK_SECRET, raw);
    const tampered = await fetch(base + "/authorisation", { method: "POST", body: raw.replace("10000", "1"), headers: { "x-signature": signature, "x-timestamp": String(timestamp) } });
    expect(tampered.status).toBe(401);
    expect((await send({ id: "x", type: "card.something_else", data: {} })).status).toBe(400);
    expect((await send({ id: "y", type: "card.authorisation", data: {} })).status).toBe(400);
    expect(balance()).toBe(before);
  });

  it("a card linked to another account's provider id cannot be reused (unique link)", () => {
    const other = mn.services.createMerchant("Other Co"), acct = mn.services.listAccounts(other)[0];
    const c = mn.cards.order(other, { accountId: acct.id });
    expect(() => mn.cards.linkProviderCard(other, c.id, "mock", "prov_card_1")).toThrow(/already linked/);
  });
});

describe("issuer endpoint when no secret is configured in production", () => {
  it("answers 501 instead of trusting a publicly known default secret", async () => {
    const saved = { env: process.env.NODE_ENV, secret: process.env.SANDBOX_ISSUER_WEBHOOK_SECRET };
    process.env.NODE_ENV = "production"; delete process.env.SANDBOX_ISSUER_WEBHOOK_SECRET;
    try {
      const app = express();
      app.use("/", createIssuerRouter(resolvePaymentsConfig({} as NodeJS.ProcessEnv), { cards: mn.cards }));
      const s = await new Promise<Server>((ok) => { const x = app.listen(0, "127.0.0.1", () => ok(x)); });
      const raw = JSON.stringify(auth()), { signature, timestamp } = signWebhook(MOCK_WEBHOOK_SECRET, raw);
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/authorisation`, { method: "POST", body: raw, headers: { "x-signature": signature, "x-timestamp": String(timestamp) } });
      expect(res.status).toBe(501);
      s.close();
    } finally {
      process.env.NODE_ENV = saved.env;
      if (saved.secret !== undefined) process.env.SANDBOX_ISSUER_WEBHOOK_SECRET = saved.secret;
    }
  });
});
