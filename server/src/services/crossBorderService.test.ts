import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pinClock, unpinClock } from "../testClock.js";
beforeEach(() => pinClock("2026-10-05T06:00:00Z"));
afterEach(() => unpinClock());
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, bankLedgerAccount, walletLedgerAccount, systemAccounts, type LedgerPort, type Line } from "./moneyEngine.js";
import { createCrossBorder, type CrossBorder } from "./crossBorderService.js";
import { reconcile } from "./reconciliation.js";
import { DEFAULT_ZA, DEFAULT_ZM, type CountryConfig } from "../config/countryConfig.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { sam: id(5), zee: id(6), nolink: id(7) };
const open = (c: CountryConfig): CountryConfig => ({ ...c, corridors: c.corridors.map((k) => ({ ...k, enabled: true })) });
let za: CountryConfig, zm: CountryConfig;
const reader = { active: async (c: string) => ({ version: 1, config: c === "ZM" ? zm : za }), invalidate() {} } as never;

let mod: Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>, db: Db, ledger: LedgerPort, xb: CrossBorder, acct: Record<string, string>, now: Date;
const bal = (u: string) => ledger.balance(bankLedgerAccount(acct[u])), wal = (u: string) => ledger.balance(walletLedgerAccount("ZMW", u));
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Record<string, any>[];   // eslint-disable-line @typescript-eslint/no-explicit-any
function fund(account: string, merchant: string, cents: number, kind = "bank", from = "sys:external_in") {
  const m = mod as unknown as { db: { transaction<T>(f: () => T): { immediate(): T } }; ledger: { post(k: string, l: unknown[], o: unknown): string } };
  m.db.transaction(() => m.ledger.post("test_fund", [{ account: from, kind: "system", amount: -cents }, { account, merchant, kind, amount: cents }], {})).immediate();
}
const build = (port: LedgerPort = ledger) => createCrossBorder({ db, ledger: port, engine: createMoneyEngine({ db, ledger: port, reader }), reader, now: () => now });

beforeEach(async () => {
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb(); now = new Date("2026-10-05T10:00:00Z");
  za = open(DEFAULT_ZA); zm = open(DEFAULT_ZM);
  const core = manshyaBankCore(mod as never);
  acct = {};
  for (const [u, name, link] of [[U.sam, "Sam", true], [U.zee, "Zee", true], [U.nolink, "Nobody", false]] as const) {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,'driver')`, [u, name, `${name.toLowerCase()}@x.test`]);
    core.ensureMerchant(u, name); acct[u] = core.accounts(u)[0].id;
    if (link) await db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, status) VALUES ($1,$2,'personal','verified')`, [u, acct[u]]);
  }
  fund(bankLedgerAccount(acct[U.sam]), U.sam, 1_000_000);                         // R10 000
  ledger = manshyaLedgerPort(mod as never);
  xb = build();
  await xb.setRate("ZAR", "ZMW", 1.5, null); await xb.setRate("ZMW", "ZAR", 0.6, null);
});
const ask = (over: Record<string, unknown> = {}) => xb.quote(U.sam, { recipientEmail: "zee@x.test", amountCents: 100_000, corridorId: "ZA-ZM", ...over } as never);

describe("quote", () => {
  it("prices the transfer: fee in the sending currency, margin off the rate, a short-lived quote, and nothing moves", async () => {
    const r = await ask(); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.value).toMatchObject({ sendCents: 100_000, sendCurrency: "ZAR", feeCents: 5_000, receiveCurrency: "ZMW", receiveCents: Math.floor(95_000 * 1.5 * 0.99), status: "quoted", recipient: "Zee", expiresAt: "2026-10-05T10:01:00.000Z" });
    expect(bal(U.sam)).toBe(1_000_000);
  });
  it("is refused when the route is closed, the rate is missing or stale, or the limits are exceeded", async () => {
    za = DEFAULT_ZA; expect(await ask()).toMatchObject({ ok: false, status: 409, error: "This route is not open." }); za = open(DEFAULT_ZA);
    await db.query(`UPDATE fx_rates SET set_at = $1`, [new Date(now.getTime() - 2 * 3600_000)]);
    expect(await ask()).toMatchObject({ ok: false, status: 503 });
    await xb.setRate("ZAR", "ZMW", 1.5, null);
    expect(await ask({ amountCents: 600_000 })).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/limit for one transfer/) });
    expect(await ask({ amountCents: 0 })).toMatchObject({ ok: false, status: 400 });
    expect(await ask({ corridorId: "XX-YY" })).toMatchObject({ ok: false, status: 400 });
  });
  it("needs a known recipient with a verified account, and a verified sender", async () => {
    expect(await ask({ recipientEmail: "ghost@x.test" })).toMatchObject({ ok: false, status: 404 });
    expect(await ask({ recipientEmail: "nobody@x.test" })).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/recipient has no verified account/) });
    expect(await ask({ recipientEmail: "sam@x.test" })).toMatchObject({ ok: false, status: 400 });
    expect(await xb.quote(U.nolink, { recipientEmail: "zee@x.test", amountCents: 1000, corridorId: "ZA-ZM" })).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/Link a bank account/) });
  });
  it("counts what the sender already sent today against the daily limit", async () => {
    for (let i = 0; i < 2; i++) { const r = await ask({ amountCents: 500_000 }); if (r.ok) expect((await xb.confirm(U.sam, r.value.id)).ok).toBe(true); }
    fund(bankLedgerAccount(acct[U.sam]), U.sam, 1_000_000);
    expect(await ask({ amountCents: 100_000 })).toMatchObject({ ok: false, error: expect.stringMatching(/daily limit/) });
  });
});

describe("confirm", () => {
  it("moves both currencies once: sender pays rand, recipient gets kwacha, the fee and the platform position are recorded, and records reconcile", async () => {
    const r = await ask(); if (!r.ok) throw new Error("quote");
    const c = await xb.confirm(U.sam, r.value.id); expect(c).toMatchObject({ ok: true, value: { status: "completed" } });
    expect(bal(U.sam)).toBe(900_000); expect(wal(U.zee)).toBe(r.value.receiveCents);
    expect(ledger.balance(systemAccounts("ZAR").fees)).toBe(5_000);
    expect(ledger.balance("sys:zar:cross_border")).toBe(95_000); expect(ledger.balance("sys:zmw:cross_border")).toBe(-r.value.receiveCents);
    const again = await xb.confirm(U.sam, r.value.id); expect(again.ok).toBe(true);                         // confirming twice changes nothing
    expect(bal(U.sam)).toBe(900_000); expect(wal(U.zee)).toBe(r.value.receiveCents);
    expect((await reconcile(db, ledger, now)).ok).toBe(true);
    expect((await xb.history(U.sam))[0]).toMatchObject({ direction: "sent", recipient: "Zee" }); expect((await xb.history(U.zee))[0]).toMatchObject({ direction: "received", recipient: "Sam" });
  });
  it("works the other way: kwacha from a wallet to a rand bank account", async () => {
    fund(walletLedgerAccount("ZMW", U.zee), U.zee, 50_000, "wallet", "sys:zmw:external_in");
    const r = await xb.quote(U.zee, { recipientEmail: "sam@x.test", amountCents: 20_000, corridorId: "ZM-ZA" }); if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.value).toMatchObject({ sendCurrency: "ZMW", receiveCurrency: "ZAR" });
    expect((await xb.confirm(U.zee, r.value.id)).ok).toBe(true);
    expect(wal(U.zee)).toBe(30_000); expect(bal(U.sam)).toBe(1_000_000 + r.value.receiveCents);
  });
  it("refuses an expired quote, someone else's quote, and a sender without the money", async () => {
    const r = await ask(); if (!r.ok) throw new Error("quote");
    expect(await xb.confirm(U.zee, r.value.id)).toMatchObject({ ok: false, status: 404 });
    now = new Date(now.getTime() + 61_000);
    expect(await xb.confirm(U.sam, r.value.id)).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/expired/) });
    now = new Date("2026-10-05T10:00:00Z"); await xb.setRate("ZAR", "ZMW", 1.5, null);
    const poor = await xb.quote(U.sam, { recipientEmail: "zee@x.test", amountCents: 100_000, corridorId: "ZA-ZM" }); if (!poor.ok) throw new Error("quote");
    fund("sys:external_out", "", 0);                                                                           // no-op: keep the helper exercised
    const m = mod as unknown as { db: { transaction<T>(f: () => T): { immediate(): T } }; ledger: { post(k: string, l: unknown[], o: unknown): string } };
    m.db.transaction(() => m.ledger.post("drain", [{ account: bankLedgerAccount(acct[U.sam]), merchant: U.sam, kind: "bank", amount: -950_000 }, { account: "sys:external_out", kind: "system", amount: 950_000 }], {})).immediate();
    expect(await xb.confirm(U.sam, poor.value.id)).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/enough money/) });
    expect((await q(`SELECT status FROM cross_border_transfers WHERE id = $1`, [poor.value.id]))[0].status).toBe("failed");
  });
  it("a failure between the two journals leaves it 'posting', reconciliation says so, and confirming again finishes it without paying twice", async () => {
    let failOnce = true;
    const flaky: LedgerPort = { ...ledger, balance: ledger.balance, moved: ledger.moved, post: (ref: string, kind: string, lines: Line[], memo: string) => { if (ref.endsWith(":in") && failOnce) { failOnce = false; throw new Error("disk full"); } return ledger.post(ref, kind, lines, memo); } };
    const x = build(flaky);
    const r = await x.quote(U.sam, { recipientEmail: "zee@x.test", amountCents: 100_000, corridorId: "ZA-ZM" }); if (!r.ok) throw new Error("quote");
    await expect(x.confirm(U.sam, r.value.id)).rejects.toThrow("disk full");
    expect((await q(`SELECT status FROM cross_border_transfers`))[0].status).toBe("posting"); expect(bal(U.sam)).toBe(900_000); expect(wal(U.zee)).toBe(0);
    const later = new Date(now.getTime() + 10 * 60_000);
    expect((await reconcile(db, ledger, later)).issues.map((i) => i.code)).toContain("cross_border_half_posted");
    expect((await x.confirm(U.sam, r.value.id)).ok).toBe(true);
    expect(bal(U.sam)).toBe(900_000); expect(wal(U.zee)).toBe(r.value.receiveCents);                         // debited once, credited once
    expect((await reconcile(db, ledger, later)).ok).toBe(true);
  });
});

describe("automatic rates", () => {
  const auto = (setAt: Date, sourceAt: Date) => db.query(`UPDATE fx_rates SET auto = true, source = 'exchangerate-api.com', set_at = $1, source_at = $2 WHERE pair = 'ZAR-ZMW'`, [setAt, sourceAt]);
  it("an automatic rate is used while it was fetched within 3 hours and its source is under 36 hours old, and the quote names the source", async () => {
    await auto(new Date(now.getTime() - 2.5 * 3600_000), new Date(now.getTime() - 20 * 3600_000));
    const r = await ask(); expect(r.ok).toBe(true); if (r.ok) expect(r.value.rateSource).toBe("exchangerate-api.com");
  });
  it("is refused when it was fetched too long ago, or the source's own data is too old", async () => {
    await auto(new Date(now.getTime() - 4 * 3600_000), new Date(now.getTime() - 5 * 3600_000));
    expect(await ask()).toMatchObject({ ok: false, status: 503 });
    await auto(new Date(now.getTime() - 3600_000), new Date(now.getTime() - 40 * 3600_000));
    expect(await ask()).toMatchObject({ ok: false, status: 503 });
  });
  it("a rate set by hand still has to be under an hour old", async () => {
    await db.query(`UPDATE fx_rates SET set_at = $1`, [new Date(now.getTime() - 90 * 60_000)]);
    expect(await ask()).toMatchObject({ ok: false, status: 503 });
  });
});

describe("rates", () => {
  it("rejects bad rates and unsupported pairs", async () => {
    expect(await xb.setRate("ZAR", "ZMW", 0, null)).toMatchObject({ ok: false }); expect(await xb.setRate("ZAR", "ZAR", 1, null)).toMatchObject({ ok: false }); expect(await xb.setRate("ZAR", "USD", 1, null)).toMatchObject({ ok: false });
  });
  it("lists only open corridors", async () => {
    expect((await xb.openCorridors()).map((c) => c.id).sort()).toEqual(["ZA-ZM", "ZM-ZA"]);
    za = DEFAULT_ZA; zm = DEFAULT_ZM; expect(await xb.openCorridors()).toEqual([]);
  });
});
