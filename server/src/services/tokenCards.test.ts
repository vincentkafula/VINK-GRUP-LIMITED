import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, walletLedgerAccount, SYS_FEES, type Engine, type LedgerPort } from "./moneyEngine.js";
import { createTokenService, cardSettlement, type TokenService } from "./tokenService.js";
import { recordPoolCredit } from "./poolService.js";
import { DEFAULT_ZA } from "../config/countryConfig.js";
import { MockIssuer, MOCK_WEBHOOK_SECRET } from "../payments/providers/mockIssuer.js";
import { createIssuerRouter } from "../payments/issuerRoutes.js";
import { resolvePaymentsConfig } from "../payments/config.js";
import { signWebhook } from "../payments/providers/webhook.js";
import { pinClock, unpinClock } from "../testClock.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { pax: id(9), pam: id(10) };
let enforce = false;
const reader = { active: async () => ({ version: 1, config: enforce ? { ...DEFAULT_ZA, limits: { ...DEFAULT_ZA.limits, enforce: true } } : DEFAULT_ZA }), invalidate() {} } as never;

type Mod = Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>;
let mod: Mod, db: Db, ledger: LedgerPort, engine: Engine, tokens: TokenService, n = 0;
const tok = (u: string) => ledger.balance(walletLedgerAccount("ZAR", u));
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Record<string, any>[];   // eslint-disable-line @typescript-eslint/no-explicit-any
const topUp = async (user: string, cents: number) => {
  const w = await tokens.wallet(user, "ZAR");
  const r = await recordPoolCredit({ db, ledger, engine, reader }, { bankRef: `BANK-${++n}-${Date.now()}`, reference: w!.accountNumber!, amountCents: cents, currency: "ZAR", by: null });
  expect(r.status).toBe("credited");
};
const pay = (card: { provider: string; providerCardId: string }, o: { id?: string; amount?: number; channel?: string; merchant?: string; currency?: string } = {}) =>
  tokens.authoriseCardSpend({ provider: card.provider, providerCardId: card.providerCardId, authorisationId: o.id ?? `auth-${++n}`, amountCents: o.amount ?? 10_000, currency: o.currency ?? "ZAR", channel: o.channel ?? "chip", merchant: o.merchant ?? "Spar" });
const rawCard = async (u = U.pax) => { const r = (await q(`SELECT provider, provider_card_id FROM token_issued_cards WHERE user_id = $1 ORDER BY created_at DESC`, [u]))[0]; return { provider: String(r.provider), providerCardId: String(r.provider_card_id) }; };

beforeEach(async () => {
  enforce = false;
  pinClock("2026-10-05T06:00:00Z");
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb();
  const core = manshyaBankCore(mod as never);
  for (const [u, name] of [[U.pax, "Pax"], [U.pam, "Pam"]] as const) {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,'personal')`, [u, name, `${name}@x.test`]);
    core.ensureMerchant(u, name);
  }
  ledger = manshyaLedgerPort(mod as never);
  tokens = createTokenService({ db, ledger, reader, issuer: new MockIssuer() });
  engine = createMoneyEngine({ db, ledger, reader, tokenParty: tokens.partyOf });
  tokens.bindEngine(engine);
  for (const u of [U.pax, U.pam]) { await tokens.openWallet(u, "passenger", "ZAR"); await tokens.setTier(u, "ZAR", "standard"); }
});
afterEach(() => unpinClock());

describe("issuing the VINK debit card", () => {
  it("needs a wallet and an identity check, gives one live card at a time, and shows only brand, last four and expiry", async () => {
    await tokens.setTier(U.pax, "ZAR", "basic");
    expect(await tokens.issueCard(U.pax, "ZAR", { brand: "visa" })).toMatchObject({ ok: false, status: 409, code: "needs_verification" });
    await tokens.setTier(U.pax, "ZAR", "standard");
    expect(await tokens.issueCard(id(404), "ZAR", { brand: "visa" })).toMatchObject({ ok: false, status: 409 });                          // no wallet
    const a = await tokens.issueCard(U.pax, "ZAR", { brand: "visa" });
    expect(a).toMatchObject({ ok: true, value: { status: "active", currency: "ZAR" } });
    const v = (a as { ok: true; value: { brand: string; last4: string; expiry: string } }).value;
    expect(["visa", "mastercard"]).toContain(v.brand); expect(v.last4).toMatch(/^\d{4}$/); expect(v.expiry).toMatch(/^\d\d\/\d\d$/);
    expect(await tokens.issueCard(U.pax, "ZAR", { brand: "visa" })).toMatchObject({ ok: false, status: 409 });                           // already has one
    expect((await tokens.issuedCards(U.pax)).map((c) => c.id)).toEqual([(a as { ok: true; value: { id: string } }).value.id]);
    expect(await tokens.issueCard(U.pax, "XXX", { brand: "visa" })).toMatchObject({ ok: false });
  });

  it("a card is frozen, unfrozen or blocked by its holder only, a block is permanent, and a new card can follow a blocked one", async () => {
    const c = (await tokens.issueCard(U.pax, "ZAR", { brand: "visa" })) as { ok: true; value: { id: string } };
    expect((await tokens.setIssuedCardStatus(U.pam, c.value.id, "frozen")).ok).toBe(false);                           // not Pam's card
    expect(await tokens.setIssuedCardStatus(U.pax, c.value.id, "paused")).toMatchObject({ ok: false, status: 400 });
    expect((await tokens.setIssuedCardStatus(U.pax, c.value.id, "frozen")).ok).toBe(true);
    expect((await tokens.setIssuedCardStatus(U.pax, c.value.id, "active")).ok).toBe(true);
    expect((await tokens.setIssuedCardStatus(U.pax, c.value.id, "blocked")).ok).toBe(true);
    expect(await tokens.setIssuedCardStatus(U.pax, c.value.id, "active")).toMatchObject({ ok: false, status: 409 });
    expect((await tokens.issueCard(U.pax, "ZAR", { brand: "visa" })).ok).toBe(true);
  });

  it("is not available without an issuing provider", async () => {
    const bare = createTokenService({ db, ledger, reader });
    expect(await bare.issueCard(U.pax, "ZAR", { brand: "visa" })).toMatchObject({ ok: false, status: 503 });
  });
});

const ADDRESS = { nameOnCard: "t nkosi", addressLine1: "12 Long Street", city: "Cape Town", postalCode: "8001", country: "ZA", phone: "082 000 0000" };
const STAFF = id(77);

describe("choosing Visa or Mastercard, virtual or physical", () => {
  it("makes the holder choose a brand, honours the choice, and allows one live virtual and one live physical card", async () => {
    expect(await tokens.issueCard(U.pax, "ZAR")).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("Choose Visa or Mastercard") });
    expect(await tokens.issueCard(U.pax, "ZAR", { brand: "amex" })).toMatchObject({ ok: false, status: 400 });
    expect(await tokens.issueCard(U.pax, "ZAR", { form: "plastic", brand: "visa" })).toMatchObject({ ok: false, status: 400 });
    const v = await tokens.issueCard(U.pax, "ZAR", { brand: "mastercard" });
    expect(v).toMatchObject({ ok: true, value: { brand: "mastercard", form: "virtual", activated: true } });
    const p = await tokens.issueCard(U.pax, "ZAR", { brand: "visa", form: "physical", delivery: ADDRESS });
    expect(p).toMatchObject({ ok: true, value: { brand: "visa", form: "physical", activated: false, delivery: "ordered" } });
    expect(await tokens.issueCard(U.pax, "ZAR", { brand: "visa", form: "physical", delivery: ADDRESS })).toMatchObject({ ok: false, status: 409 });   // one of each kind
    expect(await tokens.issueCard(U.pax, "ZAR", { brand: "visa" })).toMatchObject({ ok: false, status: 409 });
    expect((await tokens.issuedCards(U.pax)).map((c) => c.form).sort()).toEqual(["physical", "virtual"]);
    expect(tokens.cardOptions()).toMatchObject({ brands: ["visa", "mastercard"], forms: ["virtual", "physical"] });
  });

  it("checks the delivery address of a physical card, and a bad address orders nothing", async () => {
    const bad = (d: Record<string, unknown>) => tokens.issueCard(U.pax, "ZAR", { brand: "visa", form: "physical", delivery: { ...ADDRESS, ...d } });
    expect(await tokens.issueCard(U.pax, "ZAR", { brand: "visa", form: "physical" })).toMatchObject({ ok: false, status: 400 });
    for (const d of [{ nameOnCard: "A" }, { nameOnCard: "Th4ndi" }, { nameOnCard: "A".repeat(27) }, { addressLine1: "x" }, { city: "" }, { postalCode: "!!" }, { country: "NG" }, { phone: "abc" }]) expect(await bad(d)).toMatchObject({ ok: false, status: 400 });
    expect(await tokens.issuedCards(U.pax)).toEqual([]);
    expect((await db.query(`SELECT COUNT(*) AS n FROM token_card_orders`)).rows[0].n).toBe(0);
    expect((await bad({ country: "zm" })).ok).toBe(true);
  });

  it("a physical card declines until it is activated, then works at shops and cash machines", async () => {
    await topUp(U.pax, 100_000);
    const p = (await tokens.issueCard(U.pax, "ZAR", { brand: "visa", form: "physical", delivery: ADDRESS })) as { ok: true; value: { id: string; last4: string } };
    const c = await rawCard();
    expect(await pay(c)).toMatchObject({ approved: false, reason: "card_not_activated" });
    expect(await tokens.cardIsActive(c.provider, c.providerCardId)).toBe(false);
    const [order] = await tokens.cardOrders();
    expect(order).toMatchObject({ holder: "Pax", nameOnCard: "T NKOSI", status: "ordered", brand: "visa", address: "12 Long Street, Cape Town, 8001, ZA" });
    expect(await tokens.activateCard(U.pax, p.value.id, p.value.last4)).toMatchObject({ ok: false, status: 409 });                  // not sent yet
    expect(await tokens.shipCardOrder(order.id, STAFF, "Courier ref 123")).toEqual({ ok: true, value: { status: "shipped" } });
    expect(await tokens.shipCardOrder(order.id, STAFF)).toMatchObject({ ok: false, status: 409 });                                  // once
    expect((await tokens.issuedCards(U.pax))[0].delivery).toBe("shipped");
    expect(await tokens.activateCard(U.pam, p.value.id, p.value.last4)).toMatchObject({ ok: false, status: 404 });                  // someone else's card
    const wrong = p.value.last4 === "0000" ? "1111" : "0000";
    expect(await tokens.activateCard(U.pax, p.value.id, wrong)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("4 tries left") });
    expect(await pay(c)).toMatchObject({ approved: false, reason: "card_not_activated" });
    expect(await tokens.activateCard(U.pax, p.value.id, p.value.last4)).toMatchObject({ ok: true, value: { activated: true, delivery: "activated" } });
    expect(await pay(c, { amount: 10_000, channel: "atm", merchant: "ATM" })).toMatchObject({ approved: true });                    // cash out at a machine
    expect(tok(U.pax)).toBe(100_000 - 10_000 - 1000);
    expect(await tokens.cardIsActive(c.provider, c.providerCardId)).toBe(true);
    expect(await tokens.activateCard(U.pax, p.value.id, p.value.last4)).toMatchObject({ ok: false, status: 409 });                  // already active
    expect(await tokens.cardOrders()).toEqual([]);
  });

  it("locks activation after five wrong tries until staff unlock it", async () => {
    const p = (await tokens.issueCard(U.pax, "ZAR", { brand: "mastercard", form: "physical", delivery: ADDRESS })) as { ok: true; value: { id: string; last4: string } };
    const [order] = await tokens.cardOrders(); await tokens.shipCardOrder(order.id, STAFF);
    const wrong = p.value.last4 === "0000" ? "1111" : "0000";
    for (let i = 0; i < 4; i++) await tokens.activateCard(U.pax, p.value.id, wrong);
    expect(await tokens.activateCard(U.pax, p.value.id, wrong)).toMatchObject({ ok: false, code: "activation_locked" });
    expect(await tokens.activateCard(U.pax, p.value.id, p.value.last4)).toMatchObject({ ok: false, status: 429 });                 // even the right digits, until unlocked
    expect(await tokens.resetActivation(order.id)).toEqual({ ok: true, value: { status: "unlocked" } });
    expect(await tokens.activateCard(U.pax, p.value.id, p.value.last4)).toMatchObject({ ok: true });
    expect(await tokens.resetActivation(order.id)).toMatchObject({ ok: false, status: 409 });
  });

  it("a virtual card works at once and has no activation; a blocked physical card leaves the dispatch list", async () => {
    const v = (await tokens.issueCard(U.pax, "ZAR", { brand: "visa" })) as { ok: true; value: { id: string } };
    expect(await tokens.activateCard(U.pax, v.value.id, "1234")).toMatchObject({ ok: false, status: 409 });
    const p = (await tokens.issueCard(U.pax, "ZAR", { brand: "visa", form: "physical", delivery: ADDRESS })) as { ok: true; value: { id: string } };
    expect(await tokens.cardOrders()).toHaveLength(1);
    await tokens.setIssuedCardStatus(U.pax, p.value.id, "blocked");
    expect(await tokens.cardOrders()).toEqual([]);
    expect(await tokens.cardOrders("shipped")).toEqual([]);
  });
});

describe("spending on the card: the processor asks, the tokens decide", () => {
  it("answers null for a card that is not one of ours", async () => {
    expect(await pay({ provider: "mock", providerCardId: "someone_elses_card" })).toBeNull();
  });

  it("approves a purchase the wallet can cover, takes the tokens at once, and holds the amount for the sponsor bank", async () => {
    await tokens.issueCard(U.pax, "ZAR", { brand: "visa" }); await topUp(U.pax, 100_000);
    const c = await rawCard();
    expect(await pay(c, { amount: 25_000, merchant: "Pick n Pay" })).toEqual({ approved: true, replayed: false });
    expect(tok(U.pax)).toBe(75_000);
    expect(ledger.balance(cardSettlement("ZAR"))).toBe(25_000);
    expect((await tokens.activity(U.pax, "ZAR")).find((l) => l.kind === "card_spend")).toMatchObject({ amountCents: -25_000, label: "Pick n Pay" });
  });

  it("a retried authorisation returns the same answer and never spends twice", async () => {
    await tokens.issueCard(U.pax, "ZAR", { brand: "visa" }); await topUp(U.pax, 100_000);
    const c = await rawCard();
    const first = await pay(c, { id: "same-auth", amount: 10_000 }), again = await pay(c, { id: "same-auth", amount: 10_000 });
    expect(first).toMatchObject({ approved: true, replayed: false }); expect(again).toMatchObject({ approved: true, replayed: true });
    expect(tok(U.pax)).toBe(90_000);
    const no = await pay(c, { id: "same-no", amount: 900_000 }), noAgain = await pay(c, { id: "same-no", amount: 900_000 });
    expect(no).toMatchObject({ approved: false, reason: "insufficient_funds" }); expect(noAgain).toMatchObject({ approved: false, reason: "insufficient_funds", replayed: true });
  });

  it("declines with the reason, and moves nothing, when the card or wallet cannot pay", async () => {
    const issued = (await tokens.issueCard(U.pax, "ZAR", { brand: "visa" })) as { ok: true; value: { id: string } };
    await topUp(U.pax, 50_000);
    const c = await rawCard();
    expect(await pay(c, { amount: 80_000 })).toMatchObject({ approved: false, reason: "insufficient_funds" });
    expect(await pay(c, { amount: 0 })).toMatchObject({ approved: false, reason: "bad_amount" });
    expect(await pay(c, { currency: "USD" })).toMatchObject({ approved: false, reason: "currency_not_supported" });
    await tokens.setIssuedCardStatus(U.pax, issued.value.id, "frozen");
    expect(await pay(c)).toMatchObject({ approved: false, reason: "card_frozen" });
    await tokens.setIssuedCardStatus(U.pax, issued.value.id, "blocked");
    expect(await pay(c)).toMatchObject({ approved: false, reason: "card_not_active" });
    await db.query(`UPDATE token_issued_cards SET status = 'active'`); await db.query(`UPDATE token_wallets SET status = 'frozen' WHERE user_id = $1`, [U.pax]);
    expect(await pay(c)).toMatchObject({ approved: false, reason: "wallet_inactive" });
    expect(tok(U.pax)).toBe(50_000); expect(ledger.balance(cardSettlement("ZAR"))).toBe(0);
  });

  it("charges the bank's fee on a cash-machine withdrawal, not on a shop purchase", async () => {
    await tokens.issueCard(U.pax, "ZAR", { brand: "visa" }); await topUp(U.pax, 100_000);
    const c = await rawCard();
    await pay(c, { amount: 10_000, channel: "atm", merchant: "ATM" });
    expect(tok(U.pax)).toBe(100_000 - 10_000 - 1000);                                                                  // the R10 ATM fee in the country profile
    expect(ledger.balance(SYS_FEES)).toBe(1000); expect(ledger.balance(cardSettlement("ZAR"))).toBe(10_000);
    await pay(c, { amount: 10_000, channel: "online" });
    expect(tok(U.pax)).toBe(100_000 - 11_000 - 10_000);
    expect(await pay(c, { amount: 90_000 - 1000 + 1, channel: "atm" })).toMatchObject({ approved: false, reason: "insufficient_funds" });   // the fee has to be covered too
  });

  it("holds each channel to the holder's daily limits when the country profile enforces them", async () => {
    enforce = true;
    await tokens.issueCard(U.pax, "ZAR", { brand: "visa" }); await topUp(U.pax, 900_000);
    const c = await rawCard();
    expect(await pay(c, { amount: 300_100, channel: "atm" })).toMatchObject({ approved: false, reason: "limit_exceeded" });   // standard: R3 000 a day at ATMs
    expect(await pay(c, { amount: 200_000, channel: "atm" })).toMatchObject({ approved: true });
    expect(await pay(c, { amount: 100_100, channel: "atm" })).toMatchObject({ approved: false, reason: "limit_exceeded" });   // R2 000 + R1 001 is over
    expect(await pay(c, { amount: 500_000, channel: "online" })).toMatchObject({ approved: true });                    // online: R5 000
    expect(await pay(c, { amount: 100, channel: "online" })).toMatchObject({ approved: false, reason: "limit_exceeded" });
    expect(await pay(c, { amount: 100_000, channel: "tap" })).toMatchObject({ approved: true });                       // shops have their own limit
  });

  it("a partial refund returns just that amount, each message counts once, and the rest can be returned later", async () => {
    await tokens.issueCard(U.pax, "ZAR", { brand: "visa" }); await topUp(U.pax, 100_000);
    const c = await rawCard();
    await pay(c, { id: "T7:R1", amount: 20_000 });
    expect(await tokens.reverseCardSpend({ provider: c.provider, threadId: "T7", amountCents: 5_000, reversalId: "R2" })).toEqual({ reversed: true, refundedCents: 5_000 });
    expect(await tokens.reverseCardSpend({ provider: c.provider, threadId: "T7", amountCents: 5_000, reversalId: "R2" })).toEqual({ reversed: true, refundedCents: 0 });   // redelivered
    expect(tok(U.pax)).toBe(100_000 - 15_000); expect(ledger.balance(cardSettlement("ZAR"))).toBe(15_000);
    expect(await tokens.reverseCardSpend({ provider: c.provider, threadId: "T7", amountCents: 99_000, reversalId: "R3" })).toEqual({ reversed: true, refundedCents: 15_000 });   // capped at what is left
    expect(tok(U.pax)).toBe(100_000); expect(ledger.balance(cardSettlement("ZAR"))).toBe(0);
    expect(await tokens.reverseCardSpend({ provider: c.provider, threadId: "nope" })).toBeNull();
    expect(await tokens.cardIsActive(c.provider, c.providerCardId)).toBe(true); expect(await tokens.cardIsActive(c.provider, "other")).toBeNull();
  });

  it("a refund or reversal returns the tokens and the fee once, and every token is accounted for", async () => {
    await tokens.issueCard(U.pax, "ZAR", { brand: "visa" }); await topUp(U.pax, 100_000);
    const c = await rawCard();
    await pay(c, { id: "buy-1", amount: 20_000 }); await pay(c, { id: "atm-1", amount: 10_000, channel: "atm" });
    expect(tok(U.pax) + ledger.balance(cardSettlement("ZAR")) + ledger.balance(SYS_FEES)).toBe(100_000);                // nothing created or lost
    expect(await tokens.reverseCardSpend({ provider: c.provider, authorisationId: "atm-1" })).toEqual({ reversed: true, refundedCents: 10_000 + 1_000 });
    expect(await tokens.reverseCardSpend({ provider: c.provider, authorisationId: "atm-1" })).toEqual({ reversed: true, refundedCents: 0 });   // once
    expect(tok(U.pax)).toBe(100_000 - 20_000);
    expect(ledger.balance(SYS_FEES)).toBe(0); expect(ledger.balance(cardSettlement("ZAR"))).toBe(20_000);
    expect(await tokens.reverseCardSpend({ provider: c.provider, authorisationId: "nope" })).toBeNull();
    await pay(c, { id: "no-1", amount: 900_000 });
    expect(await tokens.reverseCardSpend({ provider: c.provider, authorisationId: "no-1" })).toEqual({ reversed: false, refundedCents: 0 });   // a declined purchase has nothing to reverse
    expect((await tokens.activity(U.pax, "ZAR")).map((l) => l.kind)).toContain("card_refund");
  });
});

describe("the issuer's authorisation endpoint", () => {
  let server: Server, base = "";
  const coreStub = { cards: { authoriseFromProvider: () => ({ id: "x", approved: true, reason: null, replayed: false }) } } as never;
  beforeEach(async () => {
    const app = express();
    app.use("/", createIssuerRouter(resolvePaymentsConfig({} as NodeJS.ProcessEnv), coreStub, { authorise: (a) => tokens.authoriseCardSpend(a), reverse: (a) => tokens.reverseCardSpend(a) }));
    server = await new Promise<Server>((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const send = async (body: object) => {
    const raw = JSON.stringify(body), { signature, timestamp } = signWebhook(MOCK_WEBHOOK_SECRET, raw);
    const r = await fetch(base + "/authorisation", { method: "POST", body: raw, headers: { "content-type": "application/json", "x-signature": signature, "x-timestamp": String(timestamp) } });
    return { status: r.status, json: await r.json() as Record<string, unknown> };
  };
  const evt = (providerCardId: string, amount: number, id: string, over: Record<string, unknown> = {}) => ({ id, type: "card.authorisation", data: { providerCardId, amount: { amount, currency: "ZAR" }, channel: "chip", merchantName: "Spar", ...over } });

  it("approves and declines a VINK token card against the wallet, and answers a retry the same way", async () => {
    await tokens.issueCard(U.pax, "ZAR", { brand: "visa" }); await topUp(U.pax, 30_000);
    const c = await rawCard();
    expect(await send(evt(c.providerCardId, 10_000, "e-1"))).toMatchObject({ status: 200, json: { approved: true, replayed: false } });
    expect(await send(evt(c.providerCardId, 10_000, "e-1"))).toMatchObject({ json: { approved: true, replayed: true } });
    expect(tok(U.pax)).toBe(20_000);
    expect(await send(evt(c.providerCardId, 90_000, "e-2"))).toMatchObject({ json: { approved: false, reason: "insufficient_funds" } });
  });

  it("hands a card that is not a token card to the older card engine", async () => {
    expect(await send(evt("some_other_card", 5000, "e-3"))).toMatchObject({ status: 200, json: { approved: true } });
  });

  it("a reversal event returns the tokens, and a bad signature is refused", async () => {
    await tokens.issueCard(U.pax, "ZAR", { brand: "visa" }); await topUp(U.pax, 30_000);
    const c = await rawCard();
    await send(evt(c.providerCardId, 10_000, "e-4"));
    expect(await send({ id: "r-4", type: "card.reversal", data: { authorisationId: "e-4" } })).toMatchObject({ status: 200, json: { reversed: true } });
    expect(tok(U.pax)).toBe(30_000);
    const raw = JSON.stringify(evt(c.providerCardId, 100, "e-5"));
    const bad = await fetch(base + "/authorisation", { method: "POST", body: raw, headers: { "content-type": "application/json", "x-signature": "0".repeat(64), "x-timestamp": String(Math.floor(Date.now() / 1000)) } });
    expect(bad.status).toBe(401);
  });
});
