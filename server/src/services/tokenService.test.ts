import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pinClock, unpinClock } from "../testClock.js";
beforeEach(() => pinClock("2026-10-05T06:00:00Z"));
afterEach(() => unpinClock());
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, bankLedgerAccount, walletLedgerAccount, SYS_FEES, SYS_CLEARING, type Engine, type LedgerPort } from "./moneyEngine.js";
import { createTokenService, cashoutHold, namesMatch, type TokenService } from "./tokenService.js";
import { recordPoolCredit } from "./poolService.js";
import { DEFAULT_ZA } from "../config/countryConfig.js";
import { MockCardRail } from "../payments/providers/mockCardRail.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { owner: id(3), driver: id(5), marshal: id(7), investor: id(8), assoc: id(1), pax: id(9), pax2: id(10), staff: id(11) };
const T = id(100), V = id(200), ROUTE = id(300);
let enforce = false;
const reader = { active: async () => ({ version: 1, config: enforce ? { ...DEFAULT_ZA, limits: { ...DEFAULT_ZA.limits, enforce: true } } : DEFAULT_ZA }), invalidate() {} } as never;

type Mod = Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>;
let mod: Mod, db: Db, ledger: LedgerPort, engine: Engine, tokens: TokenService, acct: Record<string, string>;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Record<string, any>[];   // eslint-disable-line @typescript-eslint/no-explicit-any
const tok = (u: string) => ledger.balance(walletLedgerAccount("ZAR", u));
let n = 0;
const topUp = async (user: string, cents: number) => {
  const w = await tokens.wallet(user, "ZAR");
  const r = await recordPoolCredit({ db, ledger, engine, reader }, { bankRef: `BANK-${++n}-${Date.now()}`, reference: w!.accountNumber!, amountCents: cents, currency: "ZAR", by: null });
  expect(r.status).toBe("credited");
};
const GOOD = "4111111111111111", EXPIRY = "12/34";
const addCard = (user: string, pan = GOOD, name?: string) => tokens.addPayoutCard(user, { primaryAccountNumber: pan, expiry: EXPIRY, cardholderName: name ?? (user === U.pax ? "Pax Pax" : "Pam Pam") });
const idOf = (r: unknown) => (r as { ok: true; value: { id: string } }).value.id;
const tap = (key: string, o: { uid?: string; route?: string } = {}) => tokens.tapToken({ terminalId: T, cardUid: o.uid ?? "04A1B2C3", routeId: o.route ?? ROUTE, key });

beforeEach(async () => {
  enforce = false;
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb();
  const core = manshyaBankCore(mod as never);
  acct = {};
  const people = [[U.owner, "Oz", "vehicle_owner"], [U.driver, "Dee", "driver"], [U.marshal, "Mo", "marshal"], [U.investor, "Ina", "investor"], [U.assoc, "Assoc", "association"], [U.pax, "Pax", "personal"], [U.pax2, "Pam", "personal"], [U.staff, "Staff", "superadmin"]] as const;
  for (const [u, name, role] of people) {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u, name, `${name}@x.test`, role]);
    core.ensureMerchant(u, name);
    acct[u] = core.accounts(u)[0].id;
  }
  await db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, status) VALUES ($1,$2,'personal','verified')`, [U.pax, acct[U.pax]]);
  await db.query(`INSERT INTO terminals (id, serial, driver_id, vehicle_id, owner_id, investor_id, association_id) VALUES ($1,'SN1',$2,$3,$4,$5,$6)`, [T, U.driver, V, U.owner, U.investor, U.assoc]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration) VALUES ($1,$2,'CA 123')`, [V, U.owner]);
  await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Langa – Cape Town',2000)`, [ROUTE, U.assoc]);
  ledger = manshyaLedgerPort(mod as never);
  tokens = createTokenService({ db, ledger, reader, rail: (() => { const m = new MockCardRail(); return { name: "mock", vault: m, payout: m }; })() });
  engine = createMoneyEngine({ db, ledger, reader, tokenParty: tokens.partyOf });
  tokens.bindEngine(engine);
  for (const [u, , role] of people) if (u !== U.staff) await tokens.openWallet(u, (({ vehicle_owner: "owner", personal: "passenger" }) as Record<string, string>)[role] as never ?? (role as never), "ZAR");
  await tokens.linkCard(U.pax, "ZAR", "04A1B2C3");
  expect((await addCard(U.pax)).ok).toBe(true);                                              // Pax has a verified debit card; Pam does not
});

describe("wallets and top-ups", () => {
  it("gives each holder one wallet and an account number to pay into, and opening again changes nothing", async () => {
    const a = await tokens.wallet(U.pax, "ZAR");
    expect(a).toMatchObject({ currency: "ZAR", role: "passenger", status: "active", balanceCents: 0 });
    expect(a!.accountNumber).toMatch(/^VKR\d{9}$/);
    const again = await tokens.openWallet(U.pax, "passenger", "ZAR");
    expect(again.ok && again.value.accountNumber).toBe(a!.accountNumber);
    expect((await q(`SELECT COUNT(*) AS n FROM token_wallets WHERE user_id = $1`, [U.pax]))[0].n).toBe(1);
  });

  it("issues tokens when the bank credit arrives with the holder's account number, once", async () => {
    await topUp(U.pax, 40_000);
    expect(tok(U.pax)).toBe(40_000);
    const w = await tokens.wallet(U.pax, "ZAR");
    const again = await recordPoolCredit({ db, ledger, engine, reader }, { bankRef: "SAME-1", reference: w!.accountNumber!, amountCents: 5000, currency: "ZAR", by: null });
    const twice = await recordPoolCredit({ db, ledger, engine, reader }, { bankRef: "SAME-1", reference: w!.accountNumber!, amountCents: 5000, currency: "ZAR", by: null });
    expect(again.status).toBe("credited"); expect(twice.status).toBe("duplicate");
    expect(tok(U.pax)).toBe(45_000);
  });
});

describe("tapping a card", () => {
  it("takes the route fare in tokens, with no bank movement, and credits the driver side", async () => {
    await topUp(U.pax, 10_000);
    const r = await tap("t-0001");
    expect(r).toMatchObject({ ok: true, fareCents: 2000, balanceCents: 8000, route: "Langa – Cape Town", replayed: false });
    expect(tok(U.pax)).toBe(8000);
    expect(ledger.balance(bankLedgerAccount(acct[U.pax]))).toBe(0);                          // the passenger's bank account was never touched
    expect(tok(U.owner)).toBe(1900);                                                          // fare less the platform fee: the owner side keeps the rest (no agreement)
    expect(ledger.balance(SYS_FEES)).toBe(100);
    expect(ledger.balance(SYS_CLEARING)).toBe(0);                                             // every token that came in was settled onward
  });

  it("charges a retried tap only once", async () => {
    await topUp(U.pax, 10_000);
    await tap("t-0002");
    const again = await tap("t-0002");
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(tok(U.pax)).toBe(8000);
    expect((await q(`SELECT COUNT(*) AS n FROM terminal_taps WHERE scheme = 'vink_token'`))[0].n).toBe(1);
  });

  it("declines when there are not enough tokens, charges nothing and keeps a record", async () => {
    await topUp(U.pax, 1500);
    const r = await tap("t-0003");
    expect(r).toMatchObject({ ok: false, status: 402, code: "insufficient_tokens" });
    expect(tok(U.pax)).toBe(1500);
    expect((await q(`SELECT status, error_message FROM terminal_taps`))[0]).toMatchObject({ status: "declined", error_message: "insufficient_tokens" });
  });

  it("refuses unknown, blocked and lost cards, and unknown routes", async () => {
    await topUp(U.pax, 10_000);
    expect(await tap("t-0004", { uid: "FFFFFFFF" })).toMatchObject({ ok: false, code: "card" });
    expect(await tap("t-0005", { route: id(999) })).toMatchObject({ ok: false, code: "route" });
    const c = (await tokens.cards(U.pax, "ZAR"))[0];
    expect((await tokens.blockCard(U.pax, c.id, "lost")).ok).toBe(true);
    expect(await tap("t-0006")).toMatchObject({ ok: false, code: "card" });
    expect(tok(U.pax)).toBe(10_000);
  });

  it("a card belongs to one wallet, and a holder cannot block someone else's card", async () => {
    expect((await tokens.linkCard(U.pax2, "ZAR", "04A1B2C3"))).toMatchObject({ ok: false, status: 409 });
    const c = (await tokens.cards(U.pax, "ZAR"))[0];
    expect((await tokens.blockCard(U.pax2, c.id)).ok).toBe(false);
    expect((await tokens.linkCard(U.pax2, "ZAR", "no"))).toMatchObject({ ok: false, status: 400 });
  });

  it("a route of another association is not served by this device", async () => {
    await topUp(U.pax, 10_000);
    await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Other route',1500)`, [id(301), U.pax2]);
    expect(await tap("t-0007", { route: id(301) })).toMatchObject({ ok: false, code: "route" });
  });
});

describe("a trip in tokens", () => {
  it("pays the driver, the association levy and the investor's device fee, and the books balance", async () => {
    await db.query(`INSERT INTO driver_agreements (owner_id, driver_id, mode, amount_cents, pay_day, start_date, status) VALUES ($1,$2,'cash_basis_weekly',100000,5,'2026-10-05','active')`, [U.owner, U.driver]);
    await topUp(U.pax, 40_000);
    for (let i = 0; i < 16; i++) expect((await tap(`trip-${i}`)).ok).toBe(true);
    expect(tok(U.pax)).toBe(40_000 - 16 * 2000);
    const run = await engine.runCycle(new Date("2026-10-05T12:00:00Z"));
    expect(run).toMatchObject({ trips: 1, paid: 2 });                                         // the levy and the device fee
    expect(tok(U.assoc)).toBe(2000);                                                          // R20 levy (no marshal was logged, so it is held for the association)
    expect(tok(U.investor)).toBe(100);                                                        // R1 device fee, and no per-tap share on top
    expect(tok(U.driver)).toBe(16 * 1900 - 2000 - 100);
    const all = [U.pax, U.owner, U.driver, U.assoc, U.investor, U.marshal].reduce((s, u) => s + tok(u), 0) + ledger.balance(SYS_FEES);
    expect(all).toBe(40_000);                                                                 // nothing was created or lost
  });

  it("the device fee is a setting, and zero turns it off", async () => {
    expect((await tokens.setDeviceFee(250, U.staff)).ok).toBe(true);
    expect(await tokens.settings()).toEqual({ deviceFeeCents: 250 });
    expect((await tokens.setDeviceFee(-1, U.staff)).ok).toBe(false);
    expect((await tokens.setDeviceFee(0, U.staff)).ok).toBe(true);
    await db.query(`INSERT INTO driver_agreements (owner_id, driver_id, mode, amount_cents, pay_day, start_date, status) VALUES ($1,$2,'cash_basis_weekly',100000,5,'2026-10-05','active')`, [U.owner, U.driver]);
    await topUp(U.pax, 40_000);
    for (let i = 0; i < 16; i++) await tap(`zero-${i}`);
    await engine.runCycle(new Date("2026-10-05T12:00:00Z"));
    expect(tok(U.investor)).toBe(0);
  });
});

describe("moving tokens out, and between holders", () => {
  it("sends tokens to another holder, by email or account number, once per request", async () => {
    await topUp(U.pax, 10_000);
    const r = await tokens.transfer(U.pax, { recipient: "Pam@x.test", currency: "ZAR", amountCents: 2500, key: "xfer-0001" });
    expect(r).toMatchObject({ ok: true, value: { balanceCents: 7500, recipientName: "Pam" } });
    await tokens.transfer(U.pax, { recipient: "Pam@x.test", currency: "ZAR", amountCents: 2500, key: "xfer-0001" });
    expect(tok(U.pax)).toBe(7500); expect(tok(U.pax2)).toBe(2500);
    const pam = await tokens.wallet(U.pax2, "ZAR");
    expect(await tokens.transfer(U.pax, { recipient: pam!.accountNumber!, currency: "ZAR", amountCents: 500, key: "xfer-0002" })).toMatchObject({ ok: true });
    expect(await tokens.transfer(U.pax, { recipient: "Pam@x.test", currency: "ZAR", amountCents: 99_999, key: "xfer-0003" })).toMatchObject({ ok: false, code: "insufficient_tokens" });
    expect(await tokens.transfer(U.pax, { recipient: "Pax@x.test", currency: "ZAR", amountCents: 100, key: "xfer-0004" })).toMatchObject({ ok: false, status: 400 });
    expect(await tokens.transfer(U.pax, { recipient: "nobody@x.test", currency: "ZAR", amountCents: 100, key: "xfer-0005" })).toMatchObject({ ok: false, status: 404 });
  });

  it("moves tokens into the holder's own verified VINK bank account, once, and never below zero", async () => {
    await topUp(U.pax, 10_000);
    const r = await tokens.redeemToBank(U.pax, { currency: "ZAR", amountCents: 4000, key: "red-0001" });
    expect(r).toMatchObject({ ok: true, value: { balanceCents: 6000 } });
    await tokens.redeemToBank(U.pax, { currency: "ZAR", amountCents: 4000, key: "red-0001" });
    expect(tok(U.pax)).toBe(6000); expect(ledger.balance(bankLedgerAccount(acct[U.pax]))).toBe(4000);
    expect(await tokens.redeemToBank(U.pax, { currency: "ZAR", amountCents: 50_000, key: "red-0002" })).toMatchObject({ ok: false, code: "insufficient_tokens" });
    expect(await tokens.redeemToBank(U.pax2, { currency: "ZAR", amountCents: 100, key: "red-0003" })).toMatchObject({ ok: false, status: 409 });   // no linked bank account
  });
});

describe("what the holder and staff see", () => {
  it("lists top-ups, fares and transfers on the statement, and summarises tokens in circulation", async () => {
    await topUp(U.pax, 10_000);
    await tap("act-001");
    await tokens.transfer(U.pax, { recipient: "Pam@x.test", currency: "ZAR", amountCents: 1000, key: "act-xfer-1" });
    const kinds = (await tokens.activity(U.pax, "ZAR")).map((l) => l.kind).sort();
    expect(kinds).toEqual(["fare", "top_up", "transfer_out"]);
    const s = await tokens.summary("ZAR");
    expect(s.circulationCents).toBe(10_000 - 100);                                            // everything except the platform's fee on the fare is still in tokens
    expect(s.byRole.passenger.cents).toBe(7000 + 1000);
    expect(s.wallets).toBe(7);
  });

  it("routes: an association sets a fare per route", async () => {
    expect((await tokens.upsertRoute(U.assoc, { name: "Langa – Sea Point", fareCents: 2000, effectiveFrom: "2025-10-01" })).ok).toBe(true);
    expect((await tokens.upsertRoute(U.assoc, { name: "Langa – Sea Point", fareCents: 2200 })).ok).toBe(true);        // same name: updated, not duplicated
    expect((await tokens.routes(U.assoc)).find((r) => r.name === "Langa – Sea Point")?.fareCents).toBe(2200);
    expect((await tokens.upsertRoute(U.assoc, { name: "x", fareCents: 2000 })).ok).toBe(false);
    expect((await tokens.upsertRoute(U.assoc, { name: "Bad fare", fareCents: 0 })).ok).toBe(false);
  });
});

describe("reconciliation", () => {
  it("is clean after tapping, a cash-out and a payout, and flags a token tap that has no posting", async () => {
    const { reconcile } = await import("./reconciliation.js");
    await topUp(U.pax, 10_000);
    await tap("rec-001");
    expect((await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 3000, by: U.pax })).ok).toBe(true);          // paid to the card at once
    await addCard(U.pax2, "4000000000000119");
    await topUp(U.pax2, 5000);
    await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 2000, by: U.pax2 });                                 // this card fails twice, so it waits
    expect((await reconcile(db, ledger, new Date("2026-10-05T12:00:00Z"))).issues.map((i) => i.code)).not.toContain("token_cashout_mismatch");
    const clean = await reconcile(db, ledger, new Date("2026-10-05T12:00:00Z"));
    expect(clean.issues.filter((i) => i.severity === "problem")).toEqual([]);
    await db.query(`INSERT INTO terminal_taps (terminal_id, amount, status, scheme, idempotency_key) VALUES ($1, 20, 'confirmed', 'vink_token', 'toktap:ghost')`, [T]);
    expect((await reconcile(db, ledger, new Date("2026-10-05T12:00:00Z"))).issues.map((i) => i.code)).toContain("token_tap_without_posting");
  });
});

describe("verification levels", () => {
  const credit = async (user: string, cents: number, bankRef: string) => {
    const w = await tokens.wallet(user, "ZAR");
    return recordPoolCredit({ db, ledger, engine, reader }, { bankRef, reference: w!.accountNumber!, amountCents: cents, currency: "ZAR", by: null });
  };

  it("a new wallet is basic, and a top-up over its limit waits for staff instead of being credited", async () => {
    enforce = true;
    expect((await tokens.wallet(U.pax, "ZAR"))!.kycTier).toBe("basic");
    const r = await credit(U.pax, 200_000, "LIM-0001");                                          // R2 000: over the basic limits of R1 500
    expect(r.status).toBe("unmatched");
    expect(tok(U.pax)).toBe(0);
    expect((await q(`SELECT reason FROM pool_credits WHERE bank_ref = 'LIM-0001'`))[0].reason).toMatch(/limit/);
    expect((await credit(U.pax, 100_000, "LIM-0002")).status).toBe("credited");                  // R1 000 is fine
  });

  it("staff raise the level after checking identity, and the higher limits apply at once", async () => {
    enforce = true;
    expect((await tokens.setTier(U.pax, "ZAR", "standard")).ok).toBe(true);
    expect((await credit(U.pax, 900_000, "LIM-0003")).status).toBe("credited");                  // R9 000 is within standard
    expect((await tokens.setTier(U.pax, "ZAR", "gold")).ok).toBe(false);
    expect((await tokens.setTier(U.staff, "ZAR", "full"))).toMatchObject({ ok: false, status: 404 });   // no wallet
  });

  it("limits what can leave a wallet in a day: transfers, moves to the bank and cash-outs together", async () => {
    enforce = true;
    await tokens.setTier(U.pax, "ZAR", "standard");                                              // R5 000 a day out
    await credit(U.pax, 900_000, "LIM-0004");
    const send = (cents: number, key: string) => tokens.transfer(U.pax, { recipient: "Pam@x.test", currency: "ZAR", amountCents: cents, key });
    expect(await send(500_100, "lim-send-1")).toMatchObject({ ok: false, status: 409, code: "daily_transfer_out_limit" });
    expect((await send(400_000, "lim-send-2")).ok).toBe(true);
    expect(await send(150_000, "lim-send-3")).toMatchObject({ ok: false, code: "daily_transfer_out_limit" });
    expect(await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 150_000, by: U.pax })).toMatchObject({ ok: false, code: "daily_transfer_out_limit" });
    expect(await tokens.redeemToBank(U.pax, { currency: "ZAR", amountCents: 150_000, key: "lim-red-1" })).toMatchObject({ ok: false, code: "daily_transfer_out_limit" });
    expect((await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 150_000, reason: "refund", by: U.staff, note: "Staff refund" })).ok).toBe(true);   // a refund by staff is not limited
    expect((await send(100_000, "lim-send-4")).ok).toBe(true);                                   // R4 000 + R1 000 = the R5 000 limit exactly
  });

  it("tapping a card is never limited by the daily outgoing limit", async () => {
    enforce = true;
    await credit(U.pax, 100_000, "LIM-0005");
    for (let i = 0; i < 6; i++) expect((await tap(`lim-tap-${i}`)).ok).toBe(true);              // R120 of fares
  });
});

describe("money only ever goes to the holder's own debit card, and the system pays it", () => {
  const status = async (id: string) => (await q(`SELECT status, attempts, provider_ref, last_error FROM token_cashouts WHERE id = $1`, [id]))[0];
  const later = (min: number) => new Date(Date.now() + min * 60_000);

  it("pays a cash-out to the card at once, with nobody touching it, and the books balance", async () => {
    await topUp(U.pax, 10_000);
    const r = await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 3000, by: U.pax });
    expect(r).toMatchObject({ ok: true, value: { balanceCents: 7000, status: "paid", message: "Paid to your debit card." } });
    expect(await status(idOf(r))).toMatchObject({ status: "paid", attempts: 1 });
    expect((await status(idOf(r))).provider_ref).toMatch(/^mock_po_/);
    expect(ledger.balance(cashoutHold("ZAR"))).toBe(0);
    expect((await tokens.activity(U.pax, "ZAR")).map((l) => l.kind)).toContain("payout_sent");
  });

  it("will not cash out or refund to anyone who has no verified debit card of their own", async () => {
    await topUp(U.pax2, 10_000);
    expect(await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 3000, by: U.pax2 })).toMatchObject({ ok: false, status: 409, code: "no_payout_card" });
    expect(await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 3000, reason: "refund", by: U.staff, note: "Duplicate" })).toMatchObject({ ok: false, code: "no_payout_card" });
    expect(await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 3000, by: U.pax, cardId: id(777) })).toMatchObject({ ok: false, code: "no_payout_card" });   // a card id that is not theirs
    expect(tok(U.pax2)).toBe(10_000);
    expect((await q(`SELECT COUNT(*) AS n FROM token_cashouts`))[0].n).toBe(0);
  });

  it("staff cannot mark a payout paid: the only way a payout is paid is the card service saying so", async () => {
    await topUp(U.pax, 10_000);
    const r = await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 3000, by: U.pax });
    expect(await tokens.decideCashOut(idOf(r), U.staff, "paid" as never)).toMatchObject({ ok: false, status: 400 });
    expect(await tokens.decideCashOut(idOf(r), U.staff, "rejected")).toMatchObject({ ok: false, status: 409 });            // already paid
    await db.query(`UPDATE token_cashouts SET status = 'requested' WHERE id = $1`, [idOf(r)]);
    expect((await tokens.decideCashOut(idOf(r), U.staff, "rejected")).ok).toBe(true);                                       // a waiting one can be refused: the tokens go back
  });

  it("a card the issuer declines returns the tokens at once", async () => {
    await addCard(U.pax2, "4000000000000002"); await topUp(U.pax2, 10_000);
    const r = await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 3000, by: U.pax2 });
    expect(r).toMatchObject({ ok: true, value: { status: "rejected", balanceCents: 10_000 } });
    expect((r as { ok: true; value: { message: string } }).value.message).toMatch(/tokens are back/);
    expect(ledger.balance(cashoutHold("ZAR"))).toBe(0);
    expect((await tokens.activity(U.pax2, "ZAR")).map((l) => l.kind)).toContain("payout_declined");
  });

  it("when the card service is down the tokens stay held and the payout is retried later, and pays once", async () => {
    await addCard(U.pax2, "4000000000000119"); await topUp(U.pax2, 10_000);
    const r = await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 3000, by: U.pax2 });
    const id2 = idOf(r);
    expect(r).toMatchObject({ ok: true, value: { status: "requested", balanceCents: 7000 } });
    expect(ledger.balance(cashoutHold("ZAR"))).toBe(3000);
    expect(await tokens.processPayouts(new Date())).toEqual({ paid: 0, rejected: 0, waiting: 0 });                          // not due yet
    expect(await tokens.processPayouts(later(2))).toEqual({ paid: 0, rejected: 0, waiting: 1 });                            // second failure
    expect((await tokens.summary("ZAR")).pendingCashouts).toEqual({ count: 1, cents: 3000 });
    expect(await tokens.processPayouts(later(20))).toEqual({ paid: 1, rejected: 0, waiting: 0 });                           // third try pays
    expect(await tokens.processPayouts(later(60))).toEqual({ paid: 0, rejected: 0, waiting: 0 });                           // and never again
    expect(await status(id2)).toMatchObject({ status: "paid", attempts: 3 });
    expect(ledger.balance(cashoutHold("ZAR"))).toBe(0); expect(tok(U.pax2)).toBe(7000);
  });

  it("a payout that was sent and never answered is asked again with the same reference, and is paid once", async () => {
    await topUp(U.pax, 10_000);
    const r = await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 3000, by: U.pax });
    await db.query(`UPDATE token_cashouts SET status = 'processing', attempted_at = $2 WHERE id = $1`, [idOf(r), new Date(Date.now() - 10 * 60_000)]);   // the answer was lost
    expect(await tokens.processPayouts(new Date())).toEqual({ paid: 1, rejected: 0, waiting: 0 });
    expect(await status(idOf(r))).toMatchObject({ status: "paid" });
    expect(ledger.balance(cashoutHold("ZAR"))).toBe(0); expect(tok(U.pax)).toBe(7000);                                      // the tokens left once
  });

  it("retries stop after six tries and wait for a person, who can retry or refuse", async () => {
    await addCard(U.pax2, "4000000000000119"); await topUp(U.pax2, 10_000);
    await db.query(`UPDATE token_cashouts SET attempts = 0`);
    const r = await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 3000, by: U.pax2 });
    await db.query(`UPDATE token_cashouts SET attempts = 6, status = 'requested' WHERE id = $1`, [idOf(r)]);
    expect(await tokens.processPayouts(later(2000))).toEqual({ paid: 0, rejected: 0, waiting: 0 });                         // exhausted: left alone
    expect((await tokens.retryCashOut(idOf(r))).ok).toBe(true);                                                              // staff ask the system to try again
    expect((await status(idOf(r))).attempts).toBe(1);
    expect((await tokens.decideCashOut(idOf(r), U.staff, "rejected", "Holder asked us to stop")).ok).toBe(true);
    expect(tok(U.pax2)).toBe(10_000); expect(ledger.balance(cashoutHold("ZAR"))).toBe(0);
    expect(await tokens.retryCashOut(idOf(r))).toMatchObject({ ok: false, status: 409 });
  });

  it("a refund by staff is paid by the system to the holder's own card, for any reason, and is not limited", async () => {
    await topUp(U.pax, 10_000);
    const r = await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 2500, reason: "refund", by: U.staff, note: "Duplicate top-up" });
    expect(r).toMatchObject({ ok: true, value: { status: "paid" } });
    expect((await q(`SELECT reason, note, requested_by FROM token_cashouts`))[0]).toMatchObject({ reason: "refund", note: "Duplicate top-up", requested_by: U.staff });
  });

  it("limits: R10 to R25 000, rand only, and never more than the wallet holds", async () => {
    await topUp(U.pax, 10_000);
    expect(await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 500, by: U.pax })).toMatchObject({ ok: false, status: 400 });
    expect(await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 2_500_001, by: U.pax })).toMatchObject({ ok: false, status: 400 });
    expect(await tokens.requestCashOut(U.pax, { currency: "ZMW", amountCents: 5000, by: U.pax })).toMatchObject({ ok: false, status: 409 });
    expect(await tokens.requestCashOut(U.pax, { currency: "ZAR", amountCents: 900_000, by: U.pax })).toMatchObject({ ok: false, code: "insufficient_tokens" });
    expect((await q(`SELECT COUNT(*) AS n FROM token_cashouts`))[0].n).toBe(0);                                            // a failed request leaves no trace
  });
});

describe("adding a debit card", () => {
  it("accepts only sandbox test cards, so a real card number is refused before anything is done with it", async () => {
    expect(await addCard(U.pax2, "4532015112830366")).toMatchObject({ ok: false, status: 403, code: "sandbox_only" });
    expect((await q(`SELECT COUNT(*) AS n FROM token_payout_cards WHERE user_id = $1`, [U.pax2]))[0].n).toBe(0);
    expect(await addCard(U.pax2, "1234")).toMatchObject({ ok: false, status: 400 });
  });
  it("only debit cards: a credit or a prepaid card is refused", async () => {
    expect(await addCard(U.pax2, "4242424242424242")).toMatchObject({ ok: false, code: "not_debit" });
    expect(await addCard(U.pax2, "5105105105105100")).toMatchObject({ ok: false, code: "not_debit" });
  });
  it("keeps the last four digits and never the number, and lists only what is safe to show", async () => {
    const list = await tokens.payoutCards(U.pax);
    expect(list).toEqual([{ id: expect.any(String), brand: "visa", last4: "1111", expiry: "12/34", status: "verified" }]);
    expect(JSON.stringify(await q(`SELECT * FROM token_payout_cards`))).not.toContain(GOOD);
  });
  it("a name that is not the account holder's waits for a person, and only an approved card can be paid", async () => {
    const r = await addCard(U.pax2, "5555555555554444", "Someone Else");
    expect(r).toMatchObject({ ok: true, value: { status: "needs_review" } });
    await topUp(U.pax2, 10_000);
    expect(await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 3000, by: U.pax2 })).toMatchObject({ ok: false, code: "no_payout_card" });
    expect((await tokens.cardsToReview()).map((c) => [c.accountName, c.cardholderName, c.last4])).toEqual([["Pam", "Someone Else", "4444"]]);
    expect((await tokens.reviewPayoutCard((r as { ok: true; value: { id: string } }).value.id, U.staff, "approve")).ok).toBe(true);
    expect(await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 3000, by: U.pax2 })).toMatchObject({ ok: true, value: { status: "paid" } });
    expect((await tokens.reviewPayoutCard((r as { ok: true; value: { id: string } }).value.id, U.staff, "reject")).ok).toBe(false);          // already decided
  });
  it("up to three cards, no duplicates, and a card cannot be removed while a payout to it is in progress", async () => {
    expect(await addCard(U.pax)).toMatchObject({ ok: false, status: 409 });                                                  // the same card again
    await addCard(U.pax, "5555555555554444"); await addCard(U.pax, "4000056655665556");
    expect(await addCard(U.pax, "5200828282828210")).toMatchObject({ ok: false, status: 409 });                              // a fourth
    const flaky = await addCard(U.pax2, "4000000000000119"); await topUp(U.pax2, 10_000);
    await tokens.requestCashOut(U.pax2, { currency: "ZAR", amountCents: 3000, by: U.pax2 });
    expect(await tokens.removePayoutCard(U.pax2, (flaky as { ok: true; value: { id: string } }).value.id)).toMatchObject({ ok: false, status: 409 });
    const mine = (await tokens.payoutCards(U.pax))[0];
    expect((await tokens.removePayoutCard(U.pax2, mine.id)).ok).toBe(false);                                                // not theirs
    expect((await tokens.removePayoutCard(U.pax, mine.id)).ok).toBe(true);
    expect((await tokens.payoutCards(U.pax)).map((c) => c.id)).not.toContain(mine.id);
  });
  it("compares the name on the card with the account holder's", () => {
    expect(namesMatch("Pam Mokoena", "PAM MOKOENA")).toBe(true);
    expect(namesMatch("Pam Mokoena", "P Mokoena")).toBe(true);
    expect(namesMatch("Pam Mokoena", "Mokoena Pam Thandi")).toBe(true);
    expect(namesMatch("Pam Mokoena", "Sipho Mokoena")).toBe(false);
    expect(namesMatch("Pam Mokoena", "Pam Dlamini")).toBe(false);
    expect(namesMatch("Zoë Müller", "Zoe Muller")).toBe(true);
    expect(namesMatch("", "x")).toBe(false);
  });
});
