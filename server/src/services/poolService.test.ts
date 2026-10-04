import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, bankLedgerAccount, walletLedgerAccount, type Engine, type LedgerPort } from "./moneyEngine.js";
import { DEFAULT_ZA, DEFAULT_ZM } from "../config/countryConfig.js";
import { ensureVirtualAccount, newReference, referenceLooksValid, recordPoolCredit, settleCredit, markCleared, markBounced, fundReserve, reserveAccount, type PoolDeps } from "./poolService.js";
import { reconcile } from "./reconciliation.js";
import { createLimitGuard } from "../config/limitGuard.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { driver: id(5), owner: id(3), other: id(6) };
const cfg = { ...DEFAULT_ZA, limits: { ...DEFAULT_ZA.limits } };
let reader = { active: async (c: string) => ({ version: 1, config: c === "ZM" ? DEFAULT_ZM : cfg }), invalidate() {} } as never;

let mod: Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>, db: Db, ledger: LedgerPort, engine: Engine, acct: Record<string, string>, deps: PoolDeps;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Record<string, any>[];   // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(async () => {
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb();
  const core = manshyaBankCore(mod as never);
  acct = {};
  for (const [u, name, role, link] of [[U.driver, "Dee", "driver", true], [U.owner, "Oz", "vehicle_owner", true], [U.other, "Una", "driver", false]] as const) {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u, name, `${name}@x.test`, role]);
    core.ensureMerchant(u, name); acct[u] = core.accounts(u)[0].id;
    if (link) await db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, status) VALUES ($1,$2,'personal','verified')`, [u, acct[u]]);
  }
  ledger = manshyaLedgerPort(mod as never);
  engine = createMoneyEngine({ db, ledger, reader });
  deps = { db, ledger, engine, reader };
  cfg.limits = { ...DEFAULT_ZA.limits, enforce: false };
});

describe("references", () => {
  it("have a check digit, so a mistyped one is caught", () => {
    const r = newReference("ZAR"); expect(r).toMatch(/^VKR\d{9}$/); expect(newReference("ZMW")).toMatch(/^VKK\d{9}$/);
    expect(referenceLooksValid(r)).toBe(true); expect(referenceLooksValid(r.toLowerCase().replace("vk", "vk "))).toBe(true);
    const bad = r.slice(0, -1) + String((Number(r.slice(-1)) + 1) % 10);
    expect(referenceLooksValid(bad)).toBe(false); expect(referenceLooksValid("hello")).toBe(false);
  });
  it("one reference per user, currency and pool, and it never changes", async () => {
    const a = await ensureVirtualAccount(db, U.driver, "ZAR", "in_person"), b = await ensureVirtualAccount(db, U.driver, "ZAR", "in_person");
    expect(b.reference).toBe(a.reference);
    expect((await ensureVirtualAccount(db, U.driver, "ZMW", "in_person")).reference).not.toBe(a.reference);
    expect((await ensureVirtualAccount(db, U.driver, "ZAR", "online")).reference).not.toBe(a.reference);
  });
});

describe("crediting a bank line from the pooled account", () => {
  it("credits the right user once, however many times the same bank line is recorded", async () => {
    const va = await ensureVirtualAccount(db, U.driver, "ZAR", "in_person");
    const line = { bankRef: "BANK-0001", reference: va.reference.toLowerCase(), amountCents: 25_000, currency: "ZAR", by: null };
    expect(await recordPoolCredit(deps, line)).toMatchObject({ status: "credited", userId: U.driver });
    expect(ledger.balance(bankLedgerAccount(acct[U.driver]))).toBe(25_000);
    expect(await recordPoolCredit(deps, line)).toMatchObject({ status: "duplicate" });
    expect(await recordPoolCredit(deps, { ...line, amountCents: 99 })).toMatchObject({ status: "duplicate" });         // same bank line, even with a different amount: still the same line
    expect(ledger.balance(bankLedgerAccount(acct[U.driver]))).toBe(25_000);
    expect((await reconcile(db, ledger)).ok).toBe(true);
  });
  it("kwacha goes to the kwacha wallet, and a rand credit on a kwacha reference is held, not converted", async () => {
    const k = await ensureVirtualAccount(db, U.driver, "ZMW", "online");
    expect(await recordPoolCredit(deps, { bankRef: "B-K1", reference: k.reference, amountCents: 5_000, currency: "ZMW", by: null })).toMatchObject({ status: "credited" });
    expect(ledger.balance(walletLedgerAccount("ZMW", U.driver))).toBe(5_000); expect(ledger.balance(bankLedgerAccount(acct[U.driver]))).toBe(0);
    const wrong = await recordPoolCredit(deps, { bankRef: "B-K2", reference: k.reference, amountCents: 5_000, currency: "ZAR", by: null });
    expect(wrong.status).toBe("unmatched"); expect(wrong.reason).toMatch(/ZMW account but the credit is in ZAR/);
  });
  it("keeps what it cannot match, never guesses, and a person can match it later", async () => {
    const r1 = await recordPoolCredit(deps, { bankRef: "B-U1", reference: "VKR123456780", amountCents: 1_000, currency: "ZAR", by: null });
    expect(r1.status).toBe("unmatched");
    const r2 = await recordPoolCredit(deps, { bankRef: "B-U2", reference: "nonsense", amountCents: 1_000, currency: "ZAR", by: null });
    expect(r2).toMatchObject({ status: "unmatched", reason: expect.stringMatching(/not a valid platform reference/) });
    expect((await reconcile(db, ledger)).issues.map((i) => i.code)).toContain("bank_credits_unmatched");
    const va = await ensureVirtualAccount(db, U.owner, "ZAR", "in_person");
    await db.query(`UPDATE pool_credits SET reference = $1 WHERE id = $2`, [va.reference, r1.creditId]);
    expect(await settleCredit(deps, r1.creditId, null)).toMatchObject({ status: "credited", userId: U.owner });
    expect(ledger.balance(bankLedgerAccount(acct[U.owner]))).toBe(1_000);
  });
  it("holds a credit for someone with no verified linked account until they have one", async () => {
    const va = await ensureVirtualAccount(db, U.other, "ZAR", "online");
    const r = await recordPoolCredit(deps, { bankRef: "B-N1", reference: va.reference, amountCents: 700, currency: "ZAR", by: null });
    expect(r).toMatchObject({ status: "unmatched", reason: expect.stringMatching(/no verified linked account/) });
    await db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, status) VALUES ($1,$2,'personal','verified')`, [U.other, acct[U.other]]);
    expect(await settleCredit(deps, r.creditId, null)).toMatchObject({ status: "credited" });
  });
  it("rejects malformed bank lines", async () => {
    await expect(recordPoolCredit(deps, { bankRef: "x", reference: "a", amountCents: 100, currency: "ZAR", by: null })).rejects.toThrow(/4 to 64/);
    await expect(recordPoolCredit(deps, { bankRef: "BANK-9", reference: "a", amountCents: 1.5, currency: "ZAR", by: null })).rejects.toThrow(/whole number/);
    await expect(recordPoolCredit(deps, { bankRef: "BANK-9", reference: "a", amountCents: 100, currency: "USD", by: null })).rejects.toThrow(/ZAR or ZMW/);
  });
  it("when the profile enforces limits, a credit above the daily-in limit is held", async () => {
    cfg.limits = { ...DEFAULT_ZA.limits, enforce: true };
    const va = await ensureVirtualAccount(db, U.driver, "ZAR", "in_person");
    const over = DEFAULT_ZA.limits.tiers.standard.dailyInCents + 1;
    expect(await recordPoolCredit(deps, { bankRef: "B-L1", reference: va.reference, amountCents: over, currency: "ZAR", by: null })).toMatchObject({ status: "unmatched", reason: expect.stringMatching(/daily limit/) });
  });
});

describe("limit guard for payments out of the Banking module", () => {
  const guard = (enforce: boolean) => createLimitGuard(() => ({ ...DEFAULT_ZA, limits: { ...DEFAULT_ZA.limits, enforce } }));
  it("does nothing unless the profile turns enforcement on", () => { expect(guard(false)({ merchantId: "m", verified: false, channel: "transfer_out", amount: 99_999_999, usedToday: 0 })).toBeNull(); });
  it("refuses over the daily limit for the customer's level, with a sentence the customer can read", () => {
    const g = guard(true);
    expect(g({ merchantId: "m", verified: false, channel: "transfer_out", amount: DEFAULT_ZA.limits.tiers.basic.dailyOutCents, usedToday: 0 })).toBeNull();
    expect(g({ merchantId: "m", verified: false, channel: "transfer_out", amount: 1, usedToday: DEFAULT_ZA.limits.tiers.basic.dailyOutCents })).toMatch(/daily limit.*R 1000\.00/);
    expect(g({ merchantId: "m", verified: true, channel: "transfer_out", amount: DEFAULT_ZA.limits.tiers.basic.dailyOutCents + 1, usedToday: 0 })).toBeNull();        // verified customers have the higher limit
  });
  it("is checked by the Banking module itself before a payment to another bank", async () => {
    const m = mod as unknown as { config: { limitGuard?: unknown }; services: { createMerchant(n: string, o: unknown): unknown; listAccounts(m: { id: string }): { id: string }[]; createBeneficiary(m: { id: string }, b: unknown): { id: string }; transfer(m: { id: string }, b: unknown): Promise<unknown> }; ledger: { post(k: string, l: unknown[], o: unknown): string }; db: { transaction<T>(f: () => T): { immediate(): T } } };
    const merchant = { id: U.driver };
    const from = m.services.listAccounts(merchant)[0].id;
    m.db.transaction(() => m.ledger.post("test", [{ account: "sys:external_in", kind: "system", amount: -5_000_000 }, { account: bankLedgerAccount(from), merchant: U.driver, kind: "bank", amount: 5_000_000 }], {})).immediate();
    const ben = m.services.createBeneficiary(merchant, { name: "Sam", bank: "Other Bank", accountNumber: "1234567890", branchCode: "123456" });
    const pay = (amount: number) => m.services.transfer(merchant, { type: "beneficiary", fromAccountId: from, beneficiaryId: ben.id, amount });
    await expect(pay(400_000)).resolves.toBeTruthy();                                          // no guard: today's behaviour
    m.config.limitGuard = guard(true);
    await expect(pay(600_000)).rejects.toMatchObject({ code: "limit_exceeded" });              // unverified level: R1000 a day, R4000 already sent
    await expect(pay(100_000)).rejects.toMatchObject({ code: "limit_exceeded" });
    m.config.limitGuard = guard(false);
    await expect(pay(100_000)).resolves.toBeTruthy();
  });
});

describe("instant credit from the reserve", () => {
  const on = (reserveCents = 100_000) => { cfg.instantCredit = { ...DEFAULT_ZA.instantCredit, enabled: true, reserveCents }; };
  const pend = async (n: string, amount: number, user = U.driver) => {
    const va = await ensureVirtualAccount(db, user, "ZAR", "in_person");
    return recordPoolCredit(deps, { bankRef: n, reference: va.reference, amountCents: amount, currency: "ZAR", by: null, pending: true });
  };
  beforeEach(() => { cfg.instantCredit = { ...DEFAULT_ZA.instantCredit }; });

  it("a payment the bank has not cleared waits when instant credit is off", async () => {
    const r = await pend("IC-1", 10_000);
    expect(r).toMatchObject({ status: "awaiting_clearing", reason: expect.stringMatching(/switched off/) });
    expect(ledger.balance(bankLedgerAccount(acct[U.driver]))).toBe(0);
    expect(await markCleared(deps, r.creditId, null)).toMatchObject({ status: "credited", userId: U.driver });          // credited the normal way once it clears
    expect(ledger.balance(bankLedgerAccount(acct[U.driver]))).toBe(10_000);
  });
  it("is credited at once from the reserve when allowed, and the reserve is repaid when the bank clears it", async () => {
    on(); await fundReserve(deps, { ref: "RES-1", currency: "ZAR", amountCents: 200_000 });
    const r = await pend("IC-2", 40_000);
    expect(r).toMatchObject({ status: "credited", instant: true });
    expect(ledger.balance(bankLedgerAccount(acct[U.driver]))).toBe(40_000); expect(ledger.balance(reserveAccount("ZAR"))).toBe(160_000);
    await markCleared(deps, r.creditId, null);
    expect(ledger.balance(reserveAccount("ZAR"))).toBe(200_000); expect(ledger.balance(bankLedgerAccount(acct[U.driver]))).toBe(40_000);
    expect(await markCleared(deps, r.creditId, null)).toMatchObject({ status: "duplicate" });                           // clearing twice changes nothing
    expect(ledger.balance(reserveAccount("ZAR"))).toBe(200_000);
    expect((await reconcile(db, ledger)).ok).toBe(true);
  });
  it("respects the reserve minimum, the per-deposit limit and the outstanding ratio, and never goes below the reserve it holds", async () => {
    on(100_000);
    expect(await pend("IC-3", 10_000)).toMatchObject({ status: "awaiting_clearing", reason: expect.stringMatching(/reserve is below its minimum/) });
    await fundReserve(deps, { ref: "RES-2", currency: "ZAR", amountCents: 100_000 });
    expect(await pend("IC-4", 400_000)).toMatchObject({ status: "awaiting_clearing", reason: expect.stringMatching(/above the instant-credit limit/) });     cfg.instantCredit = { ...DEFAULT_ZA.instantCredit, enabled: true, reserveCents: 50_000, reserveRatioMax: 0.3, perDepositCents: { basic: 1e9, standard: 1e9, full: 1e9 } };
    expect(await pend("IC-5", 20_000)).toMatchObject({ status: "credited" });
    expect(await pend("IC-6", 20_000)).toMatchObject({ status: "awaiting_clearing", reason: expect.stringMatching(/Too much instant credit/) });
  });
  it("when the bank returns it: taken back into the reserve if still there, flagged if the customer already spent it", async () => {
    on(); await fundReserve(deps, { ref: "RES-3", currency: "ZAR", amountCents: 500_000 });
    const a = await pend("IC-7", 30_000);
    expect(await markBounced(deps, a.creditId)).toMatchObject({ status: "reversed" });
    expect(ledger.balance(bankLedgerAccount(acct[U.driver]))).toBe(0); expect(ledger.balance(reserveAccount("ZAR"))).toBe(500_000);
    const b = await pend("IC-8", 30_000);
    const m = mod as unknown as { db: { transaction<T>(f: () => T): { immediate(): T } }; ledger: { post(k: string, l: unknown[], o: unknown): string } };
    m.db.transaction(() => m.ledger.post("spend", [{ account: bankLedgerAccount(acct[U.driver]), merchant: U.driver, kind: "bank", amount: -25_000 }, { account: "sys:external_out", kind: "system", amount: 25_000 }], {})).immediate();
    expect(await markBounced(deps, b.creditId)).toMatchObject({ status: "needs_review", reason: expect.stringMatching(/already spent/) });
    expect((await db.query(`SELECT clearing, status FROM pool_credits WHERE id = $1`, [b.creditId])).rows[0]).toMatchObject({ status: "credited", clearing: "pending" });      // still on the books for staff to resolve
    await expect(markBounced(deps, (await recordPoolCredit(deps, { bankRef: "IC-9", reference: (await ensureVirtualAccount(db, U.driver, "ZAR", "online")).reference, amountCents: 100, currency: "ZAR", by: null })).creditId)).rejects.toThrow(/already cleared/);
  });
  it("funding the reserve happens once per reference", async () => {
    expect(await fundReserve(deps, { ref: "RES-9", currency: "ZAR", amountCents: 1_000 })).toBe("funded");
    expect(await fundReserve(deps, { ref: "RES-9", currency: "ZAR", amountCents: 1_000 })).toBe("duplicate");
    expect(ledger.balance(reserveAccount("ZAR"))).toBe(1_000);
    await expect(fundReserve(deps, { ref: "RES-10", currency: "USD", amountCents: 1 })).rejects.toThrow();
  });
});
