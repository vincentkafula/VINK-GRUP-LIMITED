import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./driverRoutes.js";
import { manshyaBankCore } from "./bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, type Engine, type LedgerPort } from "../services/moneyEngine.js";
import { createTokenService, type TokenService } from "../services/tokenService.js";
import { recordPoolCredit } from "../services/poolService.js";
import { createTokenRouter, createTokenTerminalRouter, createTokenAdminRouter } from "./tokenRoutes.js";
import { DEFAULT_ZA } from "../config/countryConfig.js";
import { MockCardRail } from "../payments/providers/mockCardRail.js";
import { MockIssuer } from "../payments/providers/mockIssuer.js";
import { reconcile } from "../services/reconciliation.js";
import { pinClock, unpinClock } from "../testClock.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { owner: id(3), driver: id(5), investor: id(8), assoc: id(1), pax: id(9), staff: id(11) };
const T = id(100), ROUTE = id(300);
const reader = { active: async () => ({ version: 1, config: DEFAULT_ZA }), invalidate() {} } as never;
const ROLE: Record<string, string> = { [U.pax]: "personal", [U.assoc]: "association", [U.driver]: "driver", [U.investor]: "investor", [U.staff]: "superadmin" };

type Mod = Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>;
let mod: Mod, db: Db, ledger: LedgerPort, engine: Engine, tokens: TokenService, server: Server, url = "", as = U.pax;

beforeEach(async () => {
  pinClock("2026-10-05T06:00:00Z");
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb();
  const core = manshyaBankCore(mod as never);
  for (const [u, name, role] of [[U.owner, "Oz", "vehicle_owner"], [U.driver, "Dee", "driver"], [U.investor, "Ina", "investor"], [U.assoc, "Assoc", "association"], [U.pax, "Pax", "personal"], [U.staff, "Staff", "superadmin"]] as const) {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u, name, `${name}@x.test`, role]);
    core.ensureMerchant(u, name);
  }
  await db.query(`INSERT INTO terminals (id, serial, driver_id, owner_id, investor_id, association_id) VALUES ($1,'SN1',$2,$3,$4,$5)`, [T, U.driver, U.owner, U.investor, U.assoc]);
  ledger = manshyaLedgerPort(mod as never);
  tokens = createTokenService({ db, ledger, reader, rail: (() => { const m = new MockCardRail(); return { name: "mock", vault: m, payout: m }; })(), issuer: new MockIssuer() });
  engine = createMoneyEngine({ db, ledger, reader, tokenParty: tokens.partyOf });
  tokens.bindEngine(engine);
  await tokens.openWallet(U.owner, "owner", "ZAR"); await tokens.openWallet(U.driver, "driver", "ZAR"); await tokens.openWallet(U.investor, "investor", "ZAR");
  const app = express();
  app.use("/api/terminal/token", createTokenTerminalRouter({ db, tokens, authenticate: async (serial, key) => (serial === "SN1" && key === "good" ? { authenticated: true, terminalId: T } : { authenticated: false, error: "Terminal authentication failed" }) }));
  app.use((req, _r, next) => { req.user = { userId: as, username: "u", role: ROLE[as] }; next(); });
  app.use("/me", createTokenRouter(db, tokens, { channels: () => ({ in_person: { accountNumber: "1234567890", holder: "Vink Pool", bank: "Test Bank", type: "Business" as const } }) }));
  app.use("/admin", createTokenAdminRouter({ db, tokens, sandbox: true }));
  app.use("/admin-live", createTokenAdminRouter({ db, tokens, sandbox: false }));
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  as = U.pax;
});
afterEach(() => new Promise<void>((ok) => { unpinClock(); server.close(() => ok()); }));

const call = async (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, any> };   // eslint-disable-line @typescript-eslint/no-explicit-any
};
const device = (path: string, body?: unknown, key = "tap-000001", auth = "good") => call(`/api/terminal/token${path}`, body ? "POST" : "GET", body, { "x-terminal-serial": "SN1", "x-terminal-api-key": auth, "idempotency-key": key });
const buy = async (cents: number) => {
  const w = await tokens.wallet(as, "ZAR");
  await recordPoolCredit({ db, ledger, engine, reader }, { bankRef: `BANK-${Math.random().toString(36).slice(2)}`, reference: w!.accountNumber!, amountCents: cents, currency: "ZAR", by: null });
};

describe("the holder's tokens", () => {
  it("opens a wallet, shows where to pay and the account number, and registers a card", async () => {
    expect((await call("/me/wallet", "POST", { currency: "ZAR" })).status).toBe(201);
    await buy(20_000);
    expect((await call("/me/cards", "POST", { currency: "ZAR", cardNumber: "04 A1 B2 C3" })).body.last4).toBe("B2C3");
    const me = (await call("/me")).body;
    expect(me.role).toBe("passenger");
    expect(me.wallets[0]).toMatchObject({ currency: "ZAR", balanceCents: 20_000, payInto: { bank: "Test Bank", accountNumber: "1234567890" } });
    expect(me.wallets[0].accountNumber).toMatch(/^VKR/);
    expect(me.wallets[0].cards[0]).toMatchObject({ last4: "B2C3", status: "active" });
    expect(me.wallets[0].activity[0]).toMatchObject({ kind: "top_up", amountCents: 20_000 });
  });

  it("transfers, redeems and cash-outs reject bad input and never take more than the wallet holds", async () => {
    await call("/me/wallet", "POST", {}); await buy(10_000);
    expect((await call("/me/transfer", "POST", { recipient: "Ina@x.test", amountCents: 100.5, key: "xfer-bad-1" })).status).toBe(400);
    expect((await call("/me/transfer", "POST", { recipient: "Ina@x.test", amountCents: 99_000, key: "xfer-bad-2" })).status).toBe(409);
    expect((await call("/me/transfer", "POST", { recipient: "Ina@x.test", amountCents: 1000, key: "xfer-ok-01" })).body.balanceCents).toBe(9000);
    expect((await call("/me/redeem", "POST", { amountCents: 1000, key: "redeem-001" })).status).toBe(409);              // no verified bank account
    expect((await call("/me/cash-out", "POST", { amountCents: 500 })).status).toBe(400);
    expect((await call("/me/cash-out", "POST", { amountCents: 3000 })).body.error).toMatch(/own debit card/);          // no card yet: nothing is paid anywhere else
    expect((await call("/me")).body.wallets[0].balanceCents).toBe(9000);
  });

  it("adds a debit card, then a cash-out is paid to it by the system and shows on the list", async () => {
    await call("/me/wallet", "POST", {}); await buy(10_000);
    const card = { primaryAccountNumber: "4111 1111 1111 1111", expiry: "12/34", cardholderName: "Pax Pax" };
    expect((await call("/me/payout-cards", "POST", { ...card, primaryAccountNumber: "4532015112830366" })).status).toBe(403);   // a real number: refused
    const added = await call("/me/payout-cards", "POST", card);
    expect(added).toMatchObject({ status: 201, body: { last4: "1111", brand: "visa", status: "verified" } });
    expect(JSON.stringify(added.body)).not.toContain("4111");
    expect((await call("/me/payout-cards")).body.cards).toEqual([{ id: expect.any(String), brand: "visa", last4: "1111", expiry: "12/34", status: "verified" }]);
    const out = await call("/me/cash-out", "POST", { amountCents: 3000 });
    expect(out).toMatchObject({ status: 201, body: { status: "paid", balanceCents: 7000, message: "Paid to your debit card." } });
    expect((await call("/me/cash-outs")).body.cashOuts[0]).toMatchObject({ amountCents: 3000, status: "paid", card: "visa ****1111", problem: null });
    expect((await call("/me")).body.payoutCards).toHaveLength(1);
    const audit = (await db.query(`SELECT details FROM audit_log WHERE action = 'token.payout_card.add'`)).rows[0];
    expect(String(audit.details)).not.toMatch(/4111|1111 1111/);                                                         // the card number is never written to the audit log
    const cardId = added.body.id as string;
    expect((await call(`/me/payout-cards/${cardId}`, "DELETE")).status).toBe(200);
    expect((await call("/me/cash-out", "POST", { amountCents: 3000 })).status).toBe(409);                                // no card again
  });

  it("a holder cannot set fares; an association sets them and only its own", async () => {
    expect((await call("/me/routes")).status).toBe(403);
    as = U.assoc;
    expect((await call("/me/routes", "PUT", { name: "Langa – Cape Town", fareCents: 2000, effectiveFrom: "2025-10-01" })).status).toBe(200);
    expect((await call("/me/routes", "PUT", { name: "Langa – Khayelitsha", fareCents: 2000 })).status).toBe(200);
    expect((await call("/me/routes")).body.routes.map((r: { name: string }) => r.name)).toEqual(["Langa – Cape Town", "Langa – Khayelitsha"]);
    expect((await call("/me/routes", "PUT", { name: "x", fareCents: 2000 })).status).toBe(400);
  });
});

describe("the device", () => {
  const ready = async () => {
    await call("/me/wallet", "POST", {}); await buy(10_000); await call("/me/cards", "POST", { cardNumber: "04A1B2C3" });
    await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Langa – Cape Town',2000)`, [ROUTE, U.assoc]);
  };

  it("rejects a device that cannot prove who it is, and lists the routes for one that can", async () => {
    await ready();
    expect((await device("/routes", undefined, "k-000001", "wrong")).status).toBe(401);
    expect((await device("/tap", { cardNumber: "04A1B2C3", routeId: ROUTE }, "tap-000002", "wrong")).status).toBe(401);
    expect((await device("/routes")).body.routes).toEqual([{ id: ROUTE, name: "Langa – Cape Town", fareCents: 2000, currency: "ZAR" }]);
  });

  it("takes the fare in tokens, answers a retry the same way, and declines when the card is empty", async () => {
    await ready();
    const a = await device("/tap", { cardNumber: "04A1B2C3", routeId: ROUTE }, "tap-100001");
    expect(a).toMatchObject({ status: 201, body: { success: true, data: { fareCents: 2000, balanceCents: 8000, route: "Langa – Cape Town", replayed: false } } });
    const again = await device("/tap", { cardNumber: "04A1B2C3", routeId: ROUTE }, "tap-100001");
    expect(again).toMatchObject({ status: 200, body: { data: { replayed: true, balanceCents: 8000 } } });
    for (let i = 0; i < 4; i++) await device("/tap", { cardNumber: "04A1B2C3", routeId: ROUTE }, `tap-20000${i}`);
    const empty = await device("/tap", { cardNumber: "04A1B2C3", routeId: ROUTE }, "tap-300001");
    expect(empty).toMatchObject({ status: 402, body: { success: false, code: "insufficient_tokens" } });
  });

  it("refuses a tap with no route, no key or an unknown card", async () => {
    await ready();
    expect((await device("/tap", { cardNumber: "04A1B2C3" }, "tap-400001")).status).toBe(400);
    expect((await device("/tap", { cardNumber: "04A1B2C3", routeId: ROUTE }, "x")).status).toBe(400);
    expect((await device("/tap", { cardNumber: "BADBAD00", routeId: ROUTE }, "tap-400002")).status).toBe(402);
  });
});

describe("staff", () => {
  const holderWithCard = async (pan = "4111111111111111") => {
    await call("/me/wallet", "POST", {}); await buy(10_000);
    await call("/me/payout-cards", "POST", { primaryAccountNumber: pan, expiry: "12/34", cardholderName: "Pax Pax" });
  };

  it("sees the tokens in circulation and the payouts, but cannot pay one: there is no way to mark a payout paid", async () => {
    await holderWithCard("4000000000000119");                                                                            // a card whose payout fails twice, so it waits
    const co = (await call("/me/cash-out", "POST", { amountCents: 4000 })).body;
    expect(co).toMatchObject({ status: "requested" });
    as = U.staff;
    expect((await call("/admin/summary")).body.summary).toMatchObject({ circulationCents: 6000, pendingCashouts: { count: 1, cents: 4000 }, holdingCents: 4000 });
    expect((await call("/admin/cash-outs?status=open")).body.cashOuts[0]).toMatchObject({ id: co.id, name: "Pax", amountCents: 4000 });
    expect((await call(`/admin/cash-outs/${co.id}/paid`, "POST", {})).status).toBe(404);                              // the route does not exist
    expect((await call(`/admin/cash-outs/${co.id}/retry`, "POST", {})).body).toMatchObject({ success: true, status: "requested" });   // the second failure
    expect((await call(`/admin/cash-outs/${co.id}/retry`, "POST", {})).body.status).toBe("paid");                      // the third try is the one the card service accepts
    expect((await call("/admin/summary")).body.summary).toMatchObject({ pendingCashouts: { count: 0 }, holdingCents: 0 });
    expect((await call(`/admin/cash-outs/${co.id}/reject`, "POST", {})).status).toBe(409);                            // already paid
  });

  it("refuses a waiting payout and the tokens go back, makes refunds with a reason to the holder's own card, and sets the device fee and level", async () => {
    await holderWithCard("4000000000000119");
    const co = (await call("/me/cash-out", "POST", { amountCents: 4000 })).body;
    as = U.staff;
    expect((await call(`/admin/cash-outs/${co.id}/reject`, "POST", { note: "Holder asked us to stop" })).status).toBe(200);
    expect((await call("/admin/summary")).body.summary).toMatchObject({ circulationCents: 10_000, holdingCents: 0 });
    expect((await call("/admin/refund", "POST", { userId: U.pax, amountCents: 2000 })).status).toBe(400);               // a reason is required
    expect((await call("/admin/refund", "POST", { userId: U.pax, amountCents: 2000, note: "Duplicate top-up" })).status).toBe(201);
    expect((await call("/admin/refund", "POST", { userId: U.assoc, amountCents: 2000, note: "No card" })).status).toBe(409);   // a holder with no verified debit card cannot be refunded
    expect((await call("/admin/settings", "PUT", { deviceFeeCents: 150 })).body.deviceFeeCents).toBe(150);
    expect((await call("/admin/settings", "PUT", { deviceFeeCents: -5 })).status).toBe(400);
    expect((await call("/admin/wallets/tier", "PUT", { userId: U.pax, tier: "standard" })).body.kycTier).toBe("standard");
  });

  it("reviews a debit card whose name does not match the account holder's", async () => {
    await call("/me/wallet", "POST", {});
    const r = await call("/me/payout-cards", "POST", { primaryAccountNumber: "5555555555554444", expiry: "12/34", cardholderName: "Someone Else" });
    expect(r).toMatchObject({ status: 201, body: { status: "needs_review" } });
    as = U.staff;
    expect((await call("/admin/payout-cards")).body.cards[0]).toMatchObject({ id: r.body.id, accountName: "Pax", cardholderName: "Someone Else", last4: "4444" });
    expect((await call(`/admin/payout-cards/${r.body.id}/approve`, "POST", {})).body.status).toBe("verified");
    expect((await call(`/admin/payout-cards/${r.body.id}/reject`, "POST", {})).status).toBe(404);                      // decided already
    expect((await call("/admin/payout-cards")).body.cards).toEqual([]);
  });
});

describe("the VINK debit card", () => {
  it("is issued after staff verify the holder, spends tokens, and can be frozen by its holder", async () => {
    await call("/me/wallet", "POST", {}); await buy(100_000);
    expect((await call("/me/card", "POST", {})).body.error).toMatch(/identity/);                                       // basic level: not yet
    as = U.staff;
    await call("/admin/wallets/tier", "PUT", { userId: U.pax, tier: "standard" });
    as = U.pax;
    const issued = await call("/me/card", "POST", {});
    expect(issued).toMatchObject({ status: 201, body: { card: { status: "active", currency: "ZAR" } } });
    expect(JSON.stringify(issued.body)).not.toMatch(/d{12,}/);                                                       // no card number anywhere
    expect((await call("/me")).body.issuedCards).toHaveLength(1);
    const cardId = issued.body.card.id as string;

    as = U.staff;
    const buyIt = (amountCents: number, extra: Record<string, unknown> = {}) => call("/admin/sandbox/card-purchase", "POST", { cardId, amountCents, merchant: "Pick n Pay", ...extra });
    const ok = await buyIt(25_000);
    expect(ok.body).toMatchObject({ success: true, decision: { approved: true, replayed: false } });
    expect((await buyIt(25_000, { authorisationId: ok.body.authorisationId })).body.decision).toMatchObject({ approved: true, replayed: true });
    expect((await call("/admin/summary")).body.summary).toMatchObject({ circulationCents: 75_000, cardSettlementCents: 25_000 });
    expect((await reconcile(db, ledger, new Date("2026-10-05T12:00:00Z"))).issues.filter((i) => i.severity === "problem")).toEqual([]);
    expect((await call("/admin/sandbox/card-refund", "POST", { provider: "mock", authorisationId: ok.body.authorisationId })).body).toMatchObject({ reversed: true });
    expect((await call("/admin/summary")).body.summary).toMatchObject({ circulationCents: 100_000, cardSettlementCents: 0 });

    as = U.pax;
    expect((await call(`/me/card/${cardId}/status`, "POST", { status: "frozen" })).body.card.status).toBe("frozen");
    as = U.staff;
    expect((await buyIt(1000)).body.decision).toMatchObject({ approved: false, reason: "card_frozen" });
    as = U.pax;
    expect((await call(`/me/card/${cardId}/status`, "POST", { status: "paused" })).status).toBe(400);
    expect((await call("/me/card", "POST", {})).status).toBe(409);                                                    // one live card at a time
  });

  it("staff sandbox tools do not exist outside the sandbox", async () => {
    as = U.staff;
    expect((await call("/admin-live/sandbox/card-purchase", "POST", { cardId: id(1), amountCents: 100 })).status).toBe(404);
    expect((await call("/admin-live/sandbox/card-refund", "POST", { provider: "mock", authorisationId: "x" })).status).toBe(404);
  });
});
