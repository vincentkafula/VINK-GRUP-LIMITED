import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { manshyaBankCore } from "../portal/bankLinks.js";
import { createMoneyEngine, manshyaLedgerPort, bankLedgerAccount, SYS_FEES, SYS_CLEARING, type Engine, type LedgerPort } from "./moneyEngine.js";
import { DEFAULT_ZA } from "../config/countryConfig.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { owner: id(3), driver: id(5), marshal: id(7), investor: id(8), assoc: id(1) };
const T = id(100), V = id(200);
const reader = { active: async () => ({ version: 1, config: DEFAULT_ZA }), invalidate() {} } as never;

type Mod = Awaited<ReturnType<(typeof import("../manshya/mount.js"))["createManshyaModule"]>>;
let mod: Mod, db: Db, ledger: LedgerPort, engine: Engine, acct: Record<string, string>;
const bal = (u: string) => ledger.balance(bankLedgerAccount(acct[u]));
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Record<string, any>[];   // eslint-disable-line @typescript-eslint/no-explicit-any

/** Puts money into a user's Banking account (as if received from another bank). */
function fund(user: string, cents: number) {
  const m = mod as unknown as { db: { transaction<T>(f: () => T): { immediate(): T } }; ledger: { post(k: string, l: unknown[], o: unknown): string } };
  m.db.transaction(() => m.ledger.post("test_fund", [{ account: "sys:external_in", kind: "system", amount: -cents }, { account: bankLedgerAccount(acct[user]), merchant: user, kind: "bank", amount: cents }], { ref: randomUUID() })).immediate();
}
async function taps(n: number, o: { amount?: number; at?: Date; status?: string } = {}) {
  const base = (o.at ?? new Date("2026-10-05T08:00:00Z")).getTime();
  for (let i = 0; i < n; i++) await db.query(`INSERT INTO terminal_taps (terminal_id, amount, currency, status, vink_fee_device, vink_fee_card, investor_share, owner_settlement, received_at) VALUES ($1,$2,'ZAR',$3,0.5,0.5,0.1,$4,$5)`,
    [T, o.amount ?? 15, o.status ?? "confirmed", (o.amount ?? 15) - 1, new Date(base + i * 60_000)]);
}

beforeEach(async () => {
  process.env.MANSHYA_DB_PATH = ":memory:";
  mod = (await import("../manshya/mount.js")).createManshyaModule();
  db = allPortalsDb();
  const core = manshyaBankCore(mod as never);
  acct = {};
  for (const [u, name, role] of [[U.owner, "Oz", "vehicle_owner"], [U.driver, "Dee", "driver"], [U.marshal, "Mo", "marshal"], [U.investor, "Ina", "investor"], [U.assoc, "Assoc", "association"]] as const) {
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u, name, `${name}@x.test`, role]);
    core.ensureMerchant(u, name);
    acct[u] = core.accounts(u)[0].id;
    await db.query(`INSERT INTO bank_account_links (user_id, manshya_account_id, holder_type, status) VALUES ($1,$2,'personal','verified')`, [u, acct[u]]);
  }
  await db.query(`INSERT INTO terminals (id, serial, driver_id, vehicle_id, owner_id, investor_id, association_id) VALUES ($1,'SN1',$2,$3,$4,$5,$6)`, [T, U.driver, V, U.owner, U.investor, U.assoc]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration) VALUES ($1,$2,'CA 123')`, [V, U.owner]);
  ledger = manshyaLedgerPort(mod as never);
  engine = createMoneyEngine({ db, ledger, reader });
});

describe("tap settlement", () => {
  it("pays the platform fee, the investor's share of it, and the rest to the owner", async () => {
    await taps(4);
    expect(await engine.settleTaps()).toEqual({ settled: 4, blocked: 0 });
    expect(bal(U.owner)).toBe(4 * 1400);
    expect(bal(U.investor)).toBe(4 * 10);
    expect(ledger.balance(SYS_FEES)).toBe(4 * 90);
    expect(ledger.balance(SYS_CLEARING)).toBe(-4 * 1500);                       // every cent that came in is accounted for
  });

  it("settles each tap exactly once, even if the bookkeeping is lost and it runs again", async () => {
    await taps(2);
    await engine.settleTaps();
    await db.query(`UPDATE terminal_taps SET settled_at = NULL`); await db.query(`DELETE FROM tap_settlements`);
    await engine.settleTaps();
    expect(bal(U.owner)).toBe(2 * 1400); expect(bal(U.investor)).toBe(20);
  });

  it("does not settle taps that are not confirmed (live taps wait for the real authorisation)", async () => {
    await taps(3, { status: "received" }); await taps(1, { status: "declined" });
    expect(await engine.settleTaps()).toEqual({ settled: 0, blocked: 0 });
    expect(bal(U.owner)).toBe(0);
  });

  it("holds a tap whose recipient has no verified account, and settles it once they have one", async () => {
    await db.query(`UPDATE bank_account_links SET status = 'pending_review' WHERE user_id = $1`, [U.owner]);
    await taps(1);
    expect(await engine.settleTaps()).toEqual({ settled: 0, blocked: 1 });
    expect((await q(`SELECT reason FROM tap_settlements`))[0].reason).toMatch(/no verified linked account/);
    await db.query(`UPDATE bank_account_links SET status = 'verified' WHERE user_id = $1`, [U.owner]);
    expect(await engine.settleTaps()).toEqual({ settled: 1, blocked: 0 });
    expect(bal(U.owner)).toBe(1400);
  });

  it("the platform keeps the investor's part when the terminal has no investor", async () => {
    await db.query(`UPDATE terminals SET investor_id = NULL`);
    await taps(1); await engine.settleTaps();
    expect(ledger.balance(SYS_FEES)).toBe(100); expect(bal(U.investor)).toBe(0);
  });
});

describe("trips and the marshal fee", () => {
  it("16 confirmed taps are one trip; fewer carry over to the next", async () => {
    await taps(15);
    expect((await engine.closeTrips()).trips).toBe(0);
    await taps(1, { at: new Date("2026-10-05T09:00:00Z") });
    expect((await engine.closeTrips()).trips).toBe(1);
    await taps(20, { at: new Date("2026-10-05T10:00:00Z") });
    expect((await engine.closeTrips()).trips).toBe(1);                              // 20 = one more trip and 4 carried over
    const trips = await q(`SELECT trip_no, taps FROM trips ORDER BY trip_no`);
    expect(trips.map((t) => [Number(t.trip_no), Number(t.taps)])).toEqual([[1, 16], [2, 16]]);
    expect((await q(`SELECT COUNT(*) AS n FROM terminal_taps WHERE trip_id IS NULL`))[0].n).toBe(4);
  });

  it("the driver pays the marshal R20 who logged the departure, exactly once", async () => {
    await db.query(`INSERT INTO departures (rank_id, vehicle_id, driver_id, marshal_id, departed_at) VALUES ($1,$2,$3,$4,$5)`, [id(50), V, U.driver, U.marshal, new Date("2026-10-05T08:20:00Z")]);
    fund(U.driver, 10_000);
    await taps(16);
    const first = await engine.runCycle(new Date("2026-10-05T12:00:00Z"));
    expect(first).toMatchObject({ trips: 1, paid: 1 });
    expect(bal(U.marshal)).toBe(2000); expect(bal(U.driver)).toBe(8000);
    await engine.runCycle(new Date("2026-10-05T13:00:00Z"));
    expect(bal(U.marshal)).toBe(2000); expect(bal(U.driver)).toBe(8000);
  });

  it("with no marshal logged, the fee is held for the association and the trip is flagged", async () => {
    fund(U.driver, 5000); await taps(16);
    await engine.runCycle(new Date("2026-10-05T12:00:00Z"));
    expect(bal(U.assoc)).toBe(2000);
    expect((await q(`SELECT needs_review FROM trips`))[0].needs_review).toBe("no_marshal_logged");
  });

  it("an empty driver account never goes below zero: the fee waits and is paid when money arrives", async () => {
    await taps(16);
    const t1 = new Date("2026-10-05T12:00:00Z");
    expect(await engine.runCycle(t1)).toMatchObject({ paid: 0, waiting: 1 });
    expect(bal(U.driver)).toBe(0);
    fund(U.driver, 2500);
    expect(await engine.processItems(new Date(t1.getTime() + 30_000))).toMatchObject({ paid: 0 });         // still inside the back-off
    expect(await engine.processItems(new Date(t1.getTime() + 3 * 3600_000))).toMatchObject({ paid: 1 });
    expect(bal(U.driver)).toBe(500);
  });

  it("the association's own marshal fee overrides the country default", async () => {
    await db.query(`INSERT INTO association_settings (association_id, marshal_fee_cents) VALUES ($1, 3000)`, [U.assoc]);
    fund(U.driver, 5000); await taps(16);
    await engine.runCycle(new Date("2026-10-05T12:00:00Z"));
    expect(bal(U.assoc)).toBe(3000);
  });
});

describe("driver-owner agreements", () => {
  const agree = (mode: string, amount: number, extra = "", start = "2026-10-05") => db.query(
    `INSERT INTO driver_agreements (owner_id, driver_id, mode, amount_cents, pay_day, start_date, status ${extra ? ", end_date" : ""}) VALUES ($1,$2,$3,$4,$5,$6,'active' ${extra ? ",$7" : ""})`,
    [U.owner, U.driver, mode, amount, mode === "monthly_salary" ? 25 : 5, start, ...(extra ? [extra] : [])]);

  it("cash basis: the driver keeps the fares and pays the owner the agreed amount each week", async () => {
    await agree("cash_basis_weekly", 50_000);
    await taps(16);
    await engine.settleTaps();
    expect(bal(U.driver)).toBe(16 * 1400); expect(bal(U.owner)).toBe(0);            // the fares went to the driver
    const friday = new Date("2026-10-09T10:00:00Z");                                  // day 5 of the week
    await engine.runSchedules(friday);
    await engine.processItems(friday);
    expect(bal(U.owner)).toBe(22400);                                                // five days of the week are owed (R357.14); the driver only had R224
    expect((await q(`SELECT status, remaining_cents FROM payment_items WHERE kind = 'weekly_cash_payment' ORDER BY due_at DESC LIMIT 1`))[0]).toMatchObject({ status: "arrears" });
    expect(bal(U.driver)).toBe(0);
    fund(U.driver, 100_000);
    await engine.processItems(new Date("2026-10-10T10:00:00Z"));
    expect(await q(`SELECT 1 FROM payment_items WHERE kind = 'weekly_cash_payment' AND status <> 'paid'`)).toHaveLength(0);
    expect(bal(U.owner)).toBe(Math.round(50_000 * 5 / 7)); expect(bal(U.driver)).toBe(100_000 - (Math.round(50_000 * 5 / 7) - 22400));
  });

  it("the same week is never charged twice", async () => {
    await agree("cash_basis_weekly", 10_000);
    const friday = new Date("2026-10-09T10:00:00Z");
    const a = await engine.runSchedules(friday), b = await engine.runSchedules(new Date(friday.getTime() + 3600_000));
    expect(a.created).toBeGreaterThan(0); expect(b.created).toBe(0);
  });

  it("monthly salary: the owner pays the driver on the pay day, and the fares stay with the owner", async () => {
    await agree("monthly_salary", 300_000, "", "2026-10-01");
    await taps(2); await engine.settleTaps();
    expect(bal(U.owner)).toBe(2800); expect(bal(U.driver)).toBe(0);
    fund(U.owner, 400_000);
    const day = new Date("2026-10-25T10:00:00Z");
    await engine.runSchedules(day); await engine.processItems(day);
    expect(bal(U.driver)).toBe(300_000); expect(bal(U.owner)).toBe(2800 + 100_000);
  });

  it("a part month is paid pro-rata from the start date", async () => {
    await db.query(`INSERT INTO driver_agreements (owner_id, driver_id, mode, amount_cents, pay_day, start_date, status) VALUES ($1,$2,'monthly_salary',300000,25,'2026-10-16','active')`, [U.owner, U.driver]);
    await engine.runSchedules(new Date("2026-10-25T10:00:00Z"));
    expect(Number((await q(`SELECT amount_cents FROM payment_items WHERE kind = 'monthly_salary'`))[0].amount_cents)).toBe(Math.round(300000 * 16 / 31));
  });

  it("per-trip amount: each completed trip pays the driver from the owner; the owner keeps the fares", async () => {
    await agree("per_trip_amount", 15_000);
    fund(U.driver, 5000); fund(U.owner, 100_000);
    await taps(32);
    await engine.runCycle(new Date("2026-10-05T12:00:00Z"));
    expect(await q(`SELECT 1 FROM payment_items WHERE kind = 'per_trip_pay'`)).toHaveLength(2);
    expect(bal(U.driver)).toBe(5000 - 2 * 2000 + 2 * 15_000);
  });

  it("proposed or ended agreements do nothing", async () => {
    await db.query(`INSERT INTO driver_agreements (owner_id, driver_id, mode, amount_cents, pay_day, start_date, status) VALUES ($1,$2,'monthly_salary',300000,25,'2026-09-01','proposed')`, [U.owner, U.driver]);
    expect((await engine.runSchedules(new Date("2026-10-25T10:00:00Z"))).created).toBe(0);
  });
});
