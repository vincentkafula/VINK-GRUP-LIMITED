import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createCommission, commissionOf, type Commission } from "./commission.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The commission engine on hand-checkable numbers: a R20 trip fee at 40% is R8.00 a trip.
 * Association A has rank R1 (marshals M1, M2) and rank R2 (marshal M2); vehicle V1 (driver D1), V2 (no driver, owner O1).
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), M1: id(3), M2: id(4), D1: id(5), O1: id(6), boss: id(7) };
const R1 = id(100), R2 = id(101), RB = id(102), V1 = id(110), V2 = id(111), RT = id(120);
let db: Db, c: Commission, clock: Date;
const at = (dayStr: string, h = 10, m = 0) => new Date(`${dayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`);       // South African time

beforeEach(async () => {
  db = allPortalsDb(); clock = new Date("2026-11-02T08:00:00Z"); c = createCommission(db, () => clock);
  for (const [i, n, r] of [[U.A, "Association A", "association"], [U.B, "Association B", "association"], [U.M1, "Mo Marshal", "marshal"], [U.M2, "Mia Marshal", "marshal"], [U.D1, "Dee Driver", "driver"], [U.O1, "Olu Owner", "vehicle_owner"], [U.boss, "Boss", "superadmin"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, n.replace(/ /g, "").toLowerCase(), n, `${i}@x.test`, r]);
  await db.query(`INSERT INTO terminals (id, serial) VALUES ($1,'T-900'),($2,'T-901')`, [id(900), id(901)]);                          // a loading session needs a real device
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa rank'),($3,$2,'Bellville rank'),($4,$5,'Elsewhere rank')`, [R1, U.A, R2, RB, U.B]);
  await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2),($1,$3),($4,$3)`, [R1, U.M1, U.M2, R2]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, driver_id) VALUES ($1,$2,'CA 111-111',$3),($4,$2,'CA 222-222',NULL)`, [V1, U.O1, U.D1, V2]);
  await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Langa to Bellville',2500)`, [RT, U.A]);
});
const rate = async (bp = 4000, from = "2026-01-01", o: Record<string, unknown> = { scope: "default" }) => { const r = await c.addRate(U.A, U.boss, { rateBp: bp, effectiveFrom: from, ...o }); expect(r.ok, JSON.stringify(r)).toBe(true); };
const mode = async (m: "off" | "shadow" | "commission") => { const r = await c.updateSettings(U.A, { mode: m }); expect(r.ok, JSON.stringify(r)).toBe(true); };
let n = 500;
const dep = async (o: { when?: Date; marshal?: string; rank?: string; vehicle?: string; driver?: string | null; status?: string } = {}) => {
  const vehicle = o.vehicle ?? V1; const driver = o.driver === undefined ? (vehicle === V1 ? U.D1 : null) : o.driver;
  const r = await db.query(`INSERT INTO departures (id, rank_id, vehicle_id, driver_id, marshal_id, departed_at, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [id(n++), o.rank ?? R1, vehicle, driver, o.marshal ?? U.M1, o.when ?? at("2026-11-02"), o.status ?? "completed"]);
  return String(r.rows[0].id);
};
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

describe("the commission rule", () => {
  it("is the trip fee times the rate, to the nearest cent, half up: R20 at 40% is R8.00", () => {
    expect(commissionOf(2000, 4000)).toBe(800); expect(commissionOf(1999, 4000)).toBe(800); expect(commissionOf(2005, 4000)).toBe(802); expect(commissionOf(1, 5000)).toBe(1); expect(commissionOf(1, 4999)).toBe(0);
    expect(commissionOf(0, 4000)).toBe(0); expect(commissionOf(2000, 0)).toBe(0); expect(commissionOf(2000, 10000)).toBe(2000);
  });
});

describe("switching it on", () => {
  it("is off by default for every association, and a departure then calculates nothing", async () => {
    expect(await c.settings(U.A)).toMatchObject({ mode: "off", payableOn: "recorded", payPeriod: "weekly", tiersEnabled: false, deductionCapBp: 5000, uifApplies: false });
    expect(await c.recordDeparture(await dep())).toMatchObject({ status: "off" }); expect(await q(`SELECT * FROM trip_fees`)).toEqual([]); expect(await q(`SELECT * FROM trip_commissions`)).toEqual([]);
  });
  it("needs a commission rate to be set first, and refuses nonsense settings", async () => {
    expect(await c.updateSettings(U.A, { mode: "shadow" })).toMatchObject({ ok: false, status: 409 }); await rate(); expect((await c.updateSettings(U.A, { mode: "shadow" })).ok).toBe(true);
    for (const bad of [{ mode: "live" }, { payableOn: "never" }, { payPeriod: "daily" }, { payPeriodAnchor: "2026-01-06" }, { payPeriodAnchor: "soon" }, { deductionCapBp: 10001 }, { deductionCapBp: -1 }, { deductionCapBp: 50.5 }, { uifRateBp: 20000 }]) expect(await c.updateSettings(U.A, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await c.updateSettings(U.A, { payPeriod: "monthly", payPeriodAnchor: "2026-01-05", deductionCapBp: 4000, uifApplies: true, uifRateBp: 100, tiersEnabled: true, payableOn: "paid" })).toMatchObject({ ok: true, value: { payPeriod: "monthly", deductionCapBp: 4000, uifApplies: true, tiersEnabled: true, payableOn: "paid", mode: "shadow" } });
    expect((await c.updateSettings(U.A, { mode: "off" })).ok).toBe(true);                                                                                    // switching off needs no rate
  });
});

describe("calculating a trip", () => {
  it("in shadow mode records the fee and the commission and moves no money", async () => {
    await rate(); await mode("shadow"); const d = await dep(); expect(await c.recordDeparture(d)).toMatchObject({ status: "recorded", feeCents: 2000, rateBp: 4000, commissionCents: 800, mode: "shadow" });
    expect(await q(`SELECT amount_cents, mode, payer_id, payment_item_id FROM trip_fees`)).toEqual([{ amount_cents: 2000, mode: "shadow", payer_id: U.D1, payment_item_id: null }]);
    expect(await q(`SELECT seq, marshal_id, association_id, rank_id, vehicle_id, driver_id, fee_cents, rate_bp, commission_cents, mode, engine_version FROM trip_commissions`)).toEqual([{ seq: 1, marshal_id: U.M1, association_id: U.A, rank_id: R1, vehicle_id: V1, driver_id: U.D1, fee_cents: 2000, rate_bp: 4000, commission_cents: 800, mode: "shadow", engine_version: "commission-1" }]);
    expect(await q(`SELECT * FROM payment_items`)).toEqual([]);
  });
  it("live charges the driver the trip fee, for the association, as an item the money engine collects", async () => {
    await rate(); await mode("commission"); const d = await dep(); expect(await c.recordDeparture(d)).toMatchObject({ status: "recorded", mode: "live" });
    expect(await q(`SELECT kind, payer_id, payee_id, amount_cents, remaining_cents, status, ref FROM payment_items`)).toEqual([{ kind: "trip_fee", payer_id: U.D1, payee_id: U.A, amount_cents: 2000, remaining_cents: 2000, status: "pending", ref: `tripfee:${d}` }]);
    expect((await q(`SELECT payment_item_id FROM trip_fees`))[0].payment_item_id).toBeTruthy();
  });
  it("charges the vehicle's owner when the departure has no driver", async () => {
    await rate(); await mode("commission"); await c.recordDeparture(await dep({ vehicle: V2, driver: null })); expect((await q(`SELECT payer_id FROM payment_items`))[0].payer_id).toBe(U.O1);
  });
  it("calculates a departure once, however often it is asked, and finishes anything a crash left undone", async () => {
    await rate(); await mode("commission"); const d = await dep(); await c.recordDeparture(d); expect(await c.recordDeparture(d)).toMatchObject({ status: "exists" }); await Promise.all([c.recordDeparture(d), c.recordDeparture(d)]);
    expect((await q(`SELECT * FROM trip_fees`)).length).toBe(1); expect((await q(`SELECT * FROM trip_commissions`)).length).toBe(1); expect((await q(`SELECT * FROM payment_items`)).length).toBe(1);
    await db.query(`DELETE FROM trip_commissions`); await db.query(`UPDATE trip_fees SET payment_item_id = NULL`); await db.query(`DELETE FROM payment_items`);                      // a crash between the steps
    expect(await c.recordDeparture(d)).toMatchObject({ status: "exists", commissionCents: 800 }); expect((await q(`SELECT commission_cents FROM trip_commissions`)).length).toBe(1); expect((await q(`SELECT * FROM payment_items`)).length).toBe(1);
  });
  it("does nothing for a departure that does not exist, and records nothing when there is no rate for that day", async () => {
    await rate(4000, "2026-12-01"); await mode("shadow"); expect(await c.recordDeparture(id(999))).toMatchObject({ status: "not_found" });
    expect(await c.recordDeparture(await dep({ when: at("2026-11-02") }))).toMatchObject({ status: "no_rate" }); expect(await q(`SELECT * FROM trip_fees`)).toEqual([]);
  });
});

describe("which fee and which rate apply", () => {
  it("uses the fee in force on the day of the trip: the old fee before a change, the new one after", async () => {
    await rate(); await mode("shadow");
    expect((await c.addFeeRule(U.A, U.boss, { scope: "association", amountCents: 2000, effectiveFrom: "2026-01-01" })).ok).toBe(true); expect((await c.addFeeRule(U.A, U.boss, { scope: "association", amountCents: 2500, effectiveFrom: "2026-11-03" })).ok).toBe(true);
    expect(await c.recordDeparture(await dep({ when: at("2026-11-02", 23, 59) }))).toMatchObject({ feeCents: 2000, commissionCents: 800 }); expect(await c.recordDeparture(await dep({ when: at("2026-11-03", 0, 1) }))).toMatchObject({ feeCents: 2500, commissionCents: 1000 });
  });
  it("prefers the most specific fee (route, then rank, then association), and falls back to the old marshal fee setting and then R20", async () => {
    await rate(); await mode("shadow"); const d1 = await dep();
    expect(await c.feeFor(U.A, R1, RT, "2026-11-02")).toEqual({ cents: 2000, ruleId: null });                                                                                     // nothing set: the country default
    await db.query(`UPDATE association_settings SET marshal_fee_cents = 1800 WHERE association_id = $1`, [U.A]); expect((await c.feeFor(U.A, R1, null, "2026-11-02")).cents).toBe(1800);
    await c.addFeeRule(U.A, U.boss, { scope: "association", amountCents: 2000, effectiveFrom: "2026-01-01" }); await c.addFeeRule(U.A, U.boss, { scope: "rank", rankId: R1, amountCents: 2200, effectiveFrom: "2026-01-01" }); await c.addFeeRule(U.A, U.boss, { scope: "route", routeId: RT, amountCents: 3000, effectiveFrom: "2026-01-01" });
    expect((await c.feeFor(U.A, R1, RT, "2026-11-02")).cents).toBe(3000); expect((await c.feeFor(U.A, R1, null, "2026-11-02")).cents).toBe(2200); expect((await c.feeFor(U.A, R2, null, "2026-11-02")).cents).toBe(2000); expect(d1).toBeTruthy();
  });
  it("uses a loading session's route for the fee of that departure", async () => {
    await rate(); await mode("shadow"); await c.addFeeRule(U.A, U.boss, { scope: "route", routeId: RT, amountCents: 3000, effectiveFrom: "2026-01-01" }); const d = await dep();
    await db.query(`INSERT INTO loading_sessions (terminal_id, rank_id, vehicle_id, route_id, marshal_id, status, departure_id) VALUES ($1,$2,$3,$4,$5,'closed',$6)`, [id(900), R1, V1, RT, U.M1, d]); expect(await c.recordDeparture(d)).toMatchObject({ feeCents: 3000, commissionCents: 1200 });
  });
  it("prefers a marshal's own rate, then the rank's, then the default, each from its own date, and never rewrites a trip already calculated", async () => {
    await rate(4000); await rate(4500, "2026-01-01", { scope: "rank", rankId: R1 }); await rate(5000, "2026-01-01", { scope: "marshal", marshalId: U.M2 }); await mode("shadow");
    expect(await c.recordDeparture(await dep({ marshal: U.M1, rank: R1 }))).toMatchObject({ rateBp: 4500 });                                                                       // the rank's
    expect(await c.recordDeparture(await dep({ marshal: U.M2, rank: R1 }))).toMatchObject({ rateBp: 5000 });                                                                       // the marshal's own beats the rank's
    expect(await c.recordDeparture(await dep({ marshal: U.M1, rank: R2 }))).toMatchObject({ rateBp: 4000 });                                                                       // the default
    const first = await dep({ when: at("2026-11-04") }); await c.recordDeparture(first); await rate(6000, "2026-11-05", { scope: "default" }); await rate(5500, "2026-11-05", { scope: "rank", rankId: R1 });
    expect(await c.recordDeparture(await dep({ when: at("2026-11-06"), rank: R1 }))).toMatchObject({ rateBp: 5500 }); expect(await c.recordDeparture(first)).toMatchObject({ status: "exists", rateBp: 4500 });
    expect((await q(`SELECT rate_bp FROM trip_commissions WHERE departure_id = $1`, [first]))[0].rate_bp).toBe(4500);
  });
  it("validates what an admin may set, and only for the association's own ranks, routes and marshals", async () => {
    const bad = async (p: Promise<any>) => expect(await p).toMatchObject({ ok: false, status: 400 });
    await bad(c.addFeeRule(U.A, U.boss, { scope: "everywhere", amountCents: 2000, effectiveFrom: "2026-01-01" })); await bad(c.addFeeRule(U.A, U.boss, { scope: "association", amountCents: -1, effectiveFrom: "2026-01-01" })); await bad(c.addFeeRule(U.A, U.boss, { scope: "association", amountCents: 20.5, effectiveFrom: "2026-01-01" }));
    await bad(c.addFeeRule(U.A, U.boss, { scope: "association", amountCents: 2000, effectiveFrom: "tomorrow" })); await bad(c.addFeeRule(U.A, U.boss, { scope: "rank", rankId: RB, amountCents: 2000, effectiveFrom: "2026-01-01" })); await bad(c.addFeeRule(U.A, U.boss, { scope: "route", routeId: id(999), amountCents: 2000, effectiveFrom: "2026-01-01" }));
    await bad(c.addRate(U.A, U.boss, { scope: "default", rateBp: 10001, effectiveFrom: "2026-01-01" })); await bad(c.addRate(U.A, U.boss, { scope: "default", rateBp: -1, effectiveFrom: "2026-01-01" })); await bad(c.addRate(U.A, U.boss, { scope: "marshal", marshalId: U.D1, rateBp: 4000, effectiveFrom: "2026-01-01" }));
    await bad(c.addRate(U.A, U.boss, { scope: "rank", rankId: RB, rateBp: 4000, effectiveFrom: "2026-01-01" })); await bad(c.addTier(U.A, U.boss, { afterTrips: 0, rateBp: 5000, effectiveFrom: "2026-01-01" })); await bad(c.addTier(U.A, U.boss, { afterTrips: 5, rateBp: 5000, rankId: RB, effectiveFrom: "2026-01-01" }));
    expect(await q(`SELECT * FROM trip_fee_rules`)).toEqual([]); expect(await q(`SELECT * FROM commission_rules`)).toEqual([]);
  });
});

describe("tiers (optional)", () => {
  // 40% base; after the marshal's 3rd trip of the week, 50% for the 4th trip on. Monday 2 Nov 2026 starts a week.
  const tiered = async () => { await rate(4000); expect((await c.addTier(U.A, U.boss, { afterTrips: 3, rateBp: 5000, effectiveFrom: "2026-01-01" })).ok).toBe(true); await c.updateSettings(U.A, { mode: "shadow", tiersEnabled: true }); };
  it("raises the rate from the trip after the threshold, never backdated, and starts again each Monday", async () => {
    await tiered(); const rates: number[] = [];
    for (let i = 0; i < 5; i++) rates.push(((await c.recordDeparture(await dep({ when: at("2026-11-02", 6 + i) }))) as any).rateBp);
    expect(rates).toEqual([4000, 4000, 4000, 5000, 5000]); expect((await q(`SELECT tier_after_trips FROM trip_commissions ORDER BY departed_at`)).map((r) => r.tier_after_trips)).toEqual([null, null, null, 3, 3]);
    expect(((await c.recordDeparture(await dep({ when: at("2026-11-09", 6) }))) as any).rateBp).toBe(4000);                                                                 // the next Monday
  });
  it("counts each marshal's own trips, ignores them when tiers are off, and does not override a marshal's own rate", async () => {
    await tiered(); for (let i = 0; i < 4; i++) await c.recordDeparture(await dep({ when: at("2026-11-02", 6 + i), marshal: U.M1 }));
    expect(((await c.recordDeparture(await dep({ when: at("2026-11-03", 6), marshal: U.M2 }))) as any).rateBp).toBe(4000);
    await c.updateSettings(U.A, { tiersEnabled: false }); expect(((await c.recordDeparture(await dep({ when: at("2026-11-04", 6), marshal: U.M1 }))) as any).rateBp).toBe(4000);
    await c.updateSettings(U.A, { tiersEnabled: true }); await rate(3000, "2026-01-01", { scope: "marshal", marshalId: U.M1 }); expect(((await c.recordDeparture(await dep({ when: at("2026-11-05", 6), marshal: U.M1 }))) as any).rateBp).toBe(3000);
  });
  it("does not count a reversed trip towards the threshold", async () => {
    await tiered(); const ds: string[] = []; for (let i = 0; i < 3; i++) { ds.push(await dep({ when: at("2026-11-02", 6 + i) })); await c.recordDeparture(ds[i]); }
    ok(await c.reverseCommission(ds[0], U.boss, "recorded in error")); expect(((await c.recordDeparture(await dep({ when: at("2026-11-02", 12) }))) as any).rateBp).toBe(4000);       // only two stand: this is the third
  });
});
const ok = <T,>(r: { ok: boolean } & T): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r; };

describe("corrections are reversals, never edits", () => {
  it("reverses a trip's commission with a negative row at the next sequence number, once", async () => {
    await rate(); await mode("shadow"); const d = await dep(); await c.recordDeparture(d);
    expect(await c.reverseCommission(d, U.boss, "Recorded in error", "error_corrected")).toEqual({ ok: true, value: { reversedCents: 800 } });
    const rows = await q(`SELECT seq, commission_cents, reverses_id, reason_code, reason, approved_by FROM trip_commissions ORDER BY seq`);
    expect(rows).toHaveLength(2); expect(rows[0]).toMatchObject({ seq: 1, commission_cents: 800, reverses_id: null }); expect(rows[1]).toMatchObject({ seq: 2, commission_cents: -800, reason_code: "error_corrected", reason: "Recorded in error", approved_by: U.boss }); expect(rows[1].reverses_id).toBeTruthy();
    expect(await c.netCommission(d)).toBe(0); expect(await c.reverseCommission(d, U.boss, "again")).toMatchObject({ ok: false, status: 409 }); expect(await c.reverseCommission(id(999), U.boss, "x")).toMatchObject({ ok: false, status: 404 });
  });
  it("waives an unpaid fee and reverses the commission with it, unless the association absorbs the loss", async () => {
    await rate(); await mode("commission"); const d1 = await dep(), d2 = await dep({ when: at("2026-11-02", 11) }); await c.recordDeparture(d1); await c.recordDeparture(d2);
    expect(await c.waiveFee(d1, U.boss, { reasonCode: "goodwill", reason: "Breakdown, no fare taken" })).toEqual({ ok: true, value: { reversedCents: 800 } });
    expect(await q(`SELECT status FROM payment_items WHERE ref = $1`, [`tripfee:${d1}`])).toEqual([{ status: "waived" }]); expect((await q(`SELECT waived_reason FROM trip_fees WHERE departure_id = $1`, [d1]))[0].waived_reason).toBe("Breakdown, no fare taken"); expect(await c.netCommission(d1)).toBe(0);
    expect(await c.waiveFee(d2, U.boss, { reasonCode: "association_absorbs", reason: "Association covers it", absorb: true })).toEqual({ ok: true, value: { reversedCents: 0 } }); expect(await c.netCommission(d2)).toBe(800);
    expect(await q(`SELECT status FROM payment_items WHERE ref = $1`, [`tripfee:${d2}`])).toEqual([{ status: "waived" }]);
  });
  it("refuses to waive a fee the driver has paid, a second time, without a reason, or with a reason from the wrong list", async () => {
    await rate(); await mode("commission"); const d = await dep(); await c.recordDeparture(d);
    expect(await c.waiveFee(d, U.boss, { reasonCode: "breakdown", reason: "x" })).toMatchObject({ ok: false, status: 400 }); expect(await c.waiveFee(d, U.boss, { reasonCode: "goodwill", reason: "  " })).toMatchObject({ ok: false, status: 400 }); expect(await c.waiveFee(d, U.boss, { reasonCode: "goodwill", reason: "x".repeat(201) })).toMatchObject({ ok: false, status: 400 });
    expect(await c.waiveFee(id(999), U.boss, { reasonCode: "goodwill", reason: "x" })).toMatchObject({ ok: false, status: 404 });
    await db.query(`UPDATE payment_items SET status = 'paid' WHERE ref = $1`, [`tripfee:${d}`]); expect(await c.waiveFee(d, U.boss, { reasonCode: "goodwill", reason: "x" })).toMatchObject({ ok: false, status: 409 });
    await db.query(`UPDATE payment_items SET status = 'pending' WHERE ref = $1`, [`tripfee:${d}`]); ok(await c.waiveFee(d, U.boss, { reasonCode: "goodwill", reason: "x" })); expect(await c.waiveFee(d, U.boss, { reasonCode: "goodwill", reason: "x" })).toMatchObject({ ok: false, status: 409 });
  });
});

describe("a trip that did not depart normally", () => {
  const exc = (o: Record<string, unknown> = {}) => c.approveException(U.A, U.boss, { rankId: R1, vehicleId: V1, marshalId: U.M1, driverId: U.D1, departedAt: "2026-11-02T08:00:00Z", reasonCode: "returned_approved", note: "Returned with a flat tyre", ...o });
  it("counts only when an admin approves it with a reason code: the commission is earned, the driver is not charged", async () => {
    await rate(); await mode("commission"); const r: any = ok(await exc()); expect(r.value).toMatchObject({ status: "recorded", commissionCents: 800 });
    expect(await q(`SELECT status, exception_code, approved_by, note FROM departures`)).toEqual([{ status: "approved_exception", exception_code: "returned_approved", approved_by: U.boss, note: "Returned with a flat tyre" }]);
    expect(await q(`SELECT waived_reason FROM trip_fees`)).toEqual([{ waived_reason: "exception:returned_approved" }]); expect(await q(`SELECT * FROM payment_items`)).toEqual([]);
    expect(await q(`SELECT reason_code, approved_by, reason FROM trip_commissions`)).toEqual([{ reason_code: "returned_approved", approved_by: U.boss, reason: "Returned with a flat tyre" }]);
  });
  it("needs a reason from the exception list, the association's own rank, a marshal who works there, a real time and a note", async () => {
    await rate(); await mode("commission");
    for (const bad of [{ reasonCode: "goodwill" }, { reasonCode: "nope" }, { rankId: RB }, { marshalId: U.D1 }, { marshalId: U.M1, rankId: R2, vehicleId: id(999) }, { departedAt: "someday" }, { departedAt: "2030-01-01T00:00:00Z" }, { note: "  " }, { vehicleId: "x" }]) expect(await exc(bad), JSON.stringify(bad)).toMatchObject({ ok: false });
    expect(await q(`SELECT * FROM departures`)).toEqual([]);
  });
  it("is not picked up by backfill as an ordinary departure, and a trip loaded but never departed does not exist to be counted", async () => {
    await rate(); await mode("shadow"); await dep({ status: "approved_exception" }); const ok1 = await dep(); await db.query(`INSERT INTO rank_queue (rank_id, vehicle_id) VALUES ($1,$2)`, [R1, V2]);       // V2 is loaded in the queue and has not left
    expect(await c.backfill(U.A, "2026-11-01")).toEqual({ recorded: 1, skipped: 0 }); expect((await q(`SELECT departure_id FROM trip_commissions`)).map((r) => r.departure_id)).toEqual([ok1]);
  });
});

describe("history and rank devices", () => {
  it("calculates past departures oldest first, once each, only those after the date, only the association's own", async () => {
    await rate(); await mode("shadow"); const d1 = await dep({ when: at("2026-10-30") }), d2 = await dep({ when: at("2026-11-01") }), d3 = await dep({ when: at("2026-10-01") }); await db.query(`INSERT INTO vehicles (id, owner_id, registration) VALUES ($1,$2,'CB 1')`, [id(990), U.O1]);
    await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2)`, [RB, U.M1]); await db.query(`INSERT INTO departures (rank_id, vehicle_id, marshal_id, departed_at) VALUES ($1,$2,$3,$4)`, [RB, id(990), U.M1, at("2026-11-01")]);
    expect(await c.backfill(U.A, "2026-10-15")).toEqual({ recorded: 2, skipped: 0 }); expect((await q(`SELECT departure_id FROM trip_commissions ORDER BY departed_at`)).map((r) => r.departure_id)).toEqual([d1, d2]); expect(d3).toBeTruthy();
    expect(await c.backfill(U.A, "2026-10-15")).toEqual({ recorded: 0, skipped: 0 });
  });
  it("calculates the departure a rank device's session made when it closes, and nothing for a session that made none", async () => {
    await rate(); await mode("shadow"); const d = await dep(); await db.query(`INSERT INTO loading_sessions (id, terminal_id, rank_id, vehicle_id, marshal_id, status, departure_id) VALUES ($1,$2,$3,$4,$5,'closed',$6)`, [id(800), id(900), R1, V1, U.M1, d]);
    await db.query(`INSERT INTO loading_sessions (id, terminal_id, vehicle_id, status) VALUES ($1,$2,$3,'closed')`, [id(801), id(901), V2]); expect(await c.recordForSession(id(800))).toMatchObject({ status: "recorded" }); expect(await c.recordForSession(id(801))).toBeNull(); expect(await c.recordForSession(id(802))).toBeNull();
  });
});
