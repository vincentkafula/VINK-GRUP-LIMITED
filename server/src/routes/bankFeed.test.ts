import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, bankLedgerAccount, type LedgerPort } from "../services/moneyEngine.js";
import { ensureVirtualAccount, fundReserve } from "../services/poolService.js";
import { createBankFeedRouter, signFeed } from "./bankFeed.js";
import { DEFAULT_ZA, DEFAULT_ZM } from "../config/countryConfig.js";

const USER = "00000000-0000-0000-0000-000000000005", SECRET = "feed-secret-for-tests";
const za = { ...DEFAULT_ZA, instantCredit: { ...DEFAULT_ZA.instantCredit } };
const reader = { active: async (c: string) => ({ version: 1, config: c === "ZM" ? DEFAULT_ZM : za }), invalidate() {} } as never;

describe("bank feed webhook", () => {
  let server: Server, url = "", db: Db, ledger: LedgerPort, acct = "", ref = "", clock = 1_790_000_000_000;
  const build = (secret: string | undefined) => {
    const engine = createMoneyEngine({ db, ledger, reader });
    const app = express(); app.use("/feed", createBankFeedRouter({ deps: { db, ledger, engine, reader }, secret, now: () => clock }));
    return new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", () => { url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed`; ok(); }); });
  };
  beforeEach(async () => {
    process.env.MANSHYA_DB_PATH = ":memory:";
    const mod = (await import("../manshya/mount.js")).createManshyaModule();
    db = allPortalsDb(); const core = manshyaBankCore(mod as never);
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,'Dee','Dee','d@x.test','driver')`, [USER]);
    core.ensureMerchant(USER, "Dee"); acct = core.accounts(USER)[0].id;
    await db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, status) VALUES ($1,$2,'personal','verified')`, [USER, acct]);
    ledger = manshyaLedgerPort(mod as never);
    ref = (await ensureVirtualAccount(db, USER, "ZAR", "in_person")).reference;
    za.instantCredit = { ...DEFAULT_ZA.instantCredit };
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const post = async (payload: unknown, o: { sig?: string; ts?: string; secret?: string; raw?: string } = {}) => {
    const body = o.raw ?? JSON.stringify(payload), ts = o.ts ?? String(Math.floor(clock / 1000));
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-timestamp": ts, "x-signature": o.sig ?? signFeed(o.secret ?? SECRET, ts, body) }, body });
    return { status: r.status, body: await r.json() as Record<string, any> };   // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const line = (over: Record<string, unknown> = {}) => ({ bankRef: "FEED-0001", reference: ref, amountCents: 20_000, currency: "ZAR", ...over });

  it("is switched off without a secret", async () => { await build(undefined); expect((await post(line())).status).toBe(503); });

  it("refuses unsigned, wrongly signed and stale messages, and credits nothing", async () => {
    await build(SECRET);
    expect((await post(line(), { sig: "sha256=00" })).status).toBe(401);
    expect((await post(line(), { secret: "other-secret" })).status).toBe(401);
    expect((await post(line(), { ts: String(Math.floor(clock / 1000) - 600) })).status).toBe(401);
    expect((await post(line(), { ts: "abc" })).status).toBe(401);
    expect(ledger.balance(bankLedgerAccount(acct))).toBe(0);
  });

  it("credits a received payment once, however often the bank retries", async () => {
    await build(SECRET);
    expect((await post(line())).body).toMatchObject({ success: true, status: "credited" });
    expect((await post(line())).body).toMatchObject({ status: "duplicate" });
    expect(ledger.balance(bankLedgerAccount(acct))).toBe(20_000);
  });

  it("holds a payment with a wrong reference, and rejects malformed lines and bad JSON", async () => {
    await build(SECRET);
    expect((await post(line({ bankRef: "FEED-0002", reference: "VKR000000000" }))).body.status).toBe("unmatched");
    expect((await post(line({ bankRef: "FEED-0003", amountCents: 1.5 }))).status).toBe(400);
    expect((await post(null, { raw: "{nope" })).status).toBe(400);
    expect((await post(line({ event: "exploded" }))).status).toBe(400);
  });

  it("pending, cleared and returned follow the instant-credit rules", async () => {
    za.instantCredit = { ...DEFAULT_ZA.instantCredit, enabled: true, reserveCents: 10_000 };
    await fundReserve({ ledger }, { ref: "RES-F1", currency: "ZAR", amountCents: 500_000 });
    await build(SECRET);
    expect((await post(line({ event: "pending" }))).body.status).toBe("credited");
    expect(ledger.balance(bankLedgerAccount(acct))).toBe(20_000);
    expect((await post({ bankRef: "FEED-0001", event: "cleared" })).status).toBe(200);
    expect((await post(line({ bankRef: "FEED-0009", event: "pending", amountCents: 5_000 }))).body.status).toBe("credited");
    expect((await post({ bankRef: "FEED-0009", event: "returned" })).body.status).toBe("reversed");
    expect(ledger.balance(bankLedgerAccount(acct))).toBe(20_000);
    expect((await post({ bankRef: "NO-SUCH", event: "cleared" })).status).toBe(404);
  });
});
