import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createMarshalRouter } from "./marshalRoutes.js";
import { createDriverRouter } from "./driverRoutes.js";
import { createCommission, type Commission } from "../services/commission.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The commission and payslip API through the real routers, as each role: the association runs the rules and the pay run, a marshal sees only their own earnings and payslips, a driver only their own fees and
 * place in line. Association A has rank R1 (marshals M1, M2) and rank R2; association B is a stranger. Fixed clock: Monday 2 Nov 2026, so the last finished week is 26 Oct to 1 Nov.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), M1: id(3), M2: id(4), D1: id(5), D2: id(6), O1: id(7), MB: id(8) };
const R1 = id(100), R2 = id(101), RB = id(102), V1 = id(110), V2 = id(111), VB = id(112);
const NOW = new Date("2026-11-02T08:00:00Z");
let db: Db, c: Commission, server: Server, url = "", n = 5000;
const at = (day: string, h: number, m = 0) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`);
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  db = allPortalsDb(); c = createCommission(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.M1, "Mo Marshal", "marshal"], [U.M2, "Mia Marshal", "marshal"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.O1, "Olu Owner", "vehicle_owner"], [U.MB, "Bea Marshal", "marshal"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO terminals (id, serial) VALUES ($1,'T-900')`, [id(900)]);
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa'),($3,$2,'Bellville'),($4,$5,'Elsewhere')`, [R1, U.A, R2, RB, U.B]);
  await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2),($1,$3),($4,$5)`, [R1, U.M1, U.M2, RB, U.MB]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, driver_id) VALUES ($1,$2,'CA 111-111',$3),($4,$2,'CA 222-222',$5),($6,$2,'CB 999-999',NULL)`, [V1, U.O1, U.D1, V2, U.D2, VB]);
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { const [u, role] = String(req.header("x-test-user")).split(":"); (req as any).user = { userId: u, username: role, role }; next(); });
  app.use("/association", createAssociationRouter(db, () => NOW)); app.use("/marshal", createMarshalRouter(db, () => NOW)); app.use("/driver", createDriverRouter(db, () => NOW));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
const as = (who: string, role: string) => ({ "x-test-user": `${who}:${role}`, "Content-Type": "application/json" });
const A = (m: string, path: string, body?: unknown) => call(m, `/association${path}`, as(U.A, "association"), body);
const M = (m: string, path: string, body?: unknown, who = U.M1) => call(m, `/marshal${path}`, as(who, "marshal"), body);
const D = (m: string, path: string, body?: unknown, who = U.D1) => call(m, `/driver${path}`, as(who, "driver"), body);
async function call(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const r = await fetch(url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); const type = r.headers.get("content-type") ?? "";
  return { status: r.status, type, disposition: r.headers.get("content-disposition") ?? "", body: type.includes("json") ? ((await r.json()) as any) : Buffer.from(await r.arrayBuffer()) };
}
/** commission on at 40%, then departures for a marshal (calculated as the marshal's own are) */
async function live() { expect((await A("POST", "/commission/rates", { scope: "default", rateBp: 4000, effectiveFrom: "2026-01-01" })).status).toBe(201); expect((await A("PUT", "/commission/settings", { mode: "commission" })).status).toBe(200); }
async function trips(list: [string, number][], o: { marshal?: string; rank?: string; vehicle?: string; driver?: string } = {}): Promise<string[]> {
  const out: string[] = [];
  for (const [day, count] of list) for (let i = 0; i < count; i++) {
    const d = String((await db.query(`INSERT INTO departures (id, rank_id, vehicle_id, driver_id, marshal_id, departed_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [id(n++), o.rank ?? R1, o.vehicle ?? V1, o.driver ?? U.D1, o.marshal ?? U.M1, at(day, 5 + Math.floor(i / 12), (i % 12) * 5)])).rows[0].id);
    await c.recordDeparture(d); out.push(d);
  }
  return out;
}

describe("the association's commission settings and rules", () => {
  it("shows the settings, the periods and the reason lists, and changes them only with a rate in place, validated and audited", async () => {
    const g = await A("GET", "/commission/settings"); expect(g.body).toMatchObject({ success: true, settings: { mode: "off", payPeriod: "weekly", payableOn: "recorded" }, currentPeriod: { start: "2026-11-02", end: "2026-11-08" }, lastFinishedPeriod: { start: "2026-10-26", end: "2026-11-01" } });
    expect(g.body.reasons.map((r: any) => r.kind)).toEqual(expect.arrayContaining(["queue", "exception", "fee"]));
    expect((await A("PUT", "/commission/settings", { mode: "shadow" })).status).toBe(409);                                                   // nothing to calculate with yet
    await A("POST", "/commission/rates", { scope: "default", rateBp: 4000, effectiveFrom: "2026-01-01" }); expect((await A("PUT", "/commission/settings", { mode: "shadow", payPeriod: "fortnightly" })).body).toMatchObject({ success: true, settings: { mode: "shadow", payPeriod: "fortnightly" } });
    for (const bad of [{ mode: "live" }, { deductionCapBp: 20000 }, { payPeriodAnchor: "2026-01-06" }]) expect((await A("PUT", "/commission/settings", bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'commission.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["commission.rate", "commission.settings"]);
  });
  it("lists the fee rules, rates and tiers with the names of their ranks and marshals, and accepts only the association's own", async () => {
    expect((await A("POST", "/commission/fee-rules", { scope: "rank", rankId: R1, amountCents: 2200, effectiveFrom: "2026-02-01" })).status).toBe(201); expect((await A("POST", "/commission/rates", { scope: "marshal", marshalId: U.M1, rateBp: 5000, effectiveFrom: "2026-02-01" })).status).toBe(201);
    expect((await A("POST", "/commission/tiers", { rankId: R1, afterTrips: 60, rateBp: 4500, effectiveFrom: "2026-02-01" })).status).toBe(201);
    const r = await A("GET", "/commission/rules"); expect(r.body.feeRules).toEqual([{ id: expect.any(String), scope: "rank", rank: "Langa", route: null, amountCents: 2200, effectiveFrom: "2026-02-01", note: null }]); expect(r.body.rates[0]).toMatchObject({ scope: "marshal", marshal: "Mo Marshal", rateBp: 5000 }); expect(r.body.tiers[0]).toMatchObject({ rank: "Langa", afterTrips: 60, rateBp: 4500 });
    for (const [path, b] of [["/commission/fee-rules", { scope: "rank", rankId: RB, amountCents: 1, effectiveFrom: "2026-02-01" }], ["/commission/rates", { scope: "marshal", marshalId: U.MB, rateBp: 1, effectiveFrom: "2026-02-01" }], ["/commission/tiers", { rankId: RB, afterTrips: 5, rateBp: 1, effectiveFrom: "2026-02-01" }], ["/commission/rates", { scope: "default", rateBp: 99999, effectiveFrom: "2026-02-01" }]] as const) expect((await A("POST", path, b)).status, path).toBe(400);
    expect((await call("GET", "/association/commission/rules", as(U.B, "association"))).body.feeRules).toEqual([]);                          // another association sees none of it
  });
});

describe("what a marshal sees", () => {
  it("is their earnings by day and the trips behind a day, with the fee status and commission, and not another marshal's", async () => {
    await live(); const ds = await trips([["2026-10-26", 3], ["2026-10-27", 2]]); await trips([["2026-10-26", 4]], { marshal: U.M2, vehicle: V2, driver: U.D2 });
    await db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, ref, status) VALUES ('trip_fee',$1,$2,2000,0,'x','paid')`, [U.D1, U.A]); await db.query(`UPDATE payment_items SET status='paid' WHERE ref = 'tripfee:${ds[0]}'`);
    const e = await M("GET", "/earnings?from=2026-10-26&to=2026-11-01"); expect(e.body.days).toEqual([{ date: "2026-10-26", rank: "Langa", trips: 3, feesCents: 6000, commissionCents: 2400 }, { date: "2026-10-27", rank: "Langa", trips: 2, feesCents: 4000, commissionCents: 1600 }]);
    expect(e.body.totals).toEqual({ trips: 5, feesCents: 10000, commissionCents: 4000, onPayslipCents: 0, accruingCents: 4000 });
    const d = await M("GET", "/earnings/day/2026-10-26"); expect(d.body.trips).toHaveLength(3); expect(d.body.trips[0]).toMatchObject({ registration: "CA 111-111", driver: "Dee Driver", feeCents: 2000, feeStatus: "paid", rateBp: 4000, commissionCents: 800, payslip: null }); expect(d.body.trips[1].feeStatus).toBe("owed");
    expect((await M("GET", "/earnings/day/soon")).status).toBe(400); expect((await M("GET", "/earnings?from=2026-11-05&to=2026-11-01")).status).toBe(400); expect((await M("GET", "/earnings?from=2026-10-26&to=2026-11-01", undefined, U.MB)).body.totals.trips).toBe(0);
  });
  it("shows only issued payslips, their own, readable and as a PDF, and records who looked", async () => {
    await live(); await trips([["2026-10-27", 3]]); await A("POST", "/payruns", {}); const list = await A("GET", "/payruns"); const slip = list.body.payslips[0]; expect(slip).toMatchObject({ status: "draft", marshal: "Mo Marshal", trips: 3, netCents: 2400 });
    expect((await M("GET", "/payslips")).body.payslips).toEqual([]); expect((await M("GET", `/payslips/${slip.id}`)).status).toBe(404);                      // a marshal never sees a draft
    expect((await A("POST", `/payslips/${slip.id}/issue`, { method: "bank" })).status).toBe(200);
    const mine = await M("GET", "/payslips"); expect(mine.body.payslips).toEqual([expect.objectContaining({ number: "PS-20261101-M0001", association: "Langa Taxi Association", netCents: 2400, status: "issued" })]);
    const v = await M("GET", `/payslips/${slip.id}`); expect(v.body.payslip).toMatchObject({ number: "PS-20261101-M0001", trips: 3, grossCommissionCents: 2400, netCents: 2400, marshalNumber: "M-0001" }); expect(v.body.payslip.daily).toHaveLength(1);
    const pdf = await M("GET", `/payslips/${slip.id}.pdf`); expect(pdf.type).toContain("application/pdf"); expect(pdf.disposition).toContain("payslip-PS-20261101-M0001.pdf"); expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await M("GET", `/payslips/${slip.id}`, undefined, U.M2)).status).toBe(404); expect((await M("GET", `/payslips/${slip.id}.pdf`, undefined, U.M2)).status).toBe(404); expect((await M("GET", "/payslips/nope")).status).toBe(400);
    expect((await q(`SELECT what FROM access_log WHERE owner_id = $1 ORDER BY at`, [U.M1])).map((r) => r.what).sort()).toEqual(["payslip", "payslip_pdf"]);
    expect((await A("GET", `/access-log?marshalId=${U.M1}`)).body.entries.map((e: any) => e.actor)).toEqual(["Mo Marshal", "Mo Marshal"]); expect((await A("GET", `/access-log?marshalId=${U.MB}`)).status).toBe(404);
  });
  it("shows the money check for their own trips only, lets them choose a language and give or withdraw consent, and lists their own queue changes", async () => {
    await live(); await trips([["2026-10-26", 2]]); await trips([["2026-10-26", 3]], { marshal: U.M2, vehicle: V2, driver: U.D2 });
    expect((await M("GET", "/money-check?from=2026-10-26&to=2026-11-01")).body).toMatchObject({ trips: 2, feesDueCents: 4000, feesReceivedCents: 0, feesOutstandingCents: 4000, commissionEarnedCents: 1600, commissionPayableCents: 1600, commissionRule: "recorded" });
    expect((await M("PUT", "/profile", { language: "xh" })).body.profile).toMatchObject({ language: "xh", marshalNumber: "M-0001" }); expect((await M("PUT", "/profile", { language: "fr" })).status).toBe(400); expect((await M("PUT", "/profile", { class: "employee" })).body.profile.class).toBe("independent");     // the class is the association's to set
    expect((await M("PUT", "/consents/payroll_records", { granted: true })).status).toBe(200); expect((await M("PUT", "/consents/payroll_records", { granted: "yes" })).status).toBe(400); expect((await M("GET", "/profile")).body.consents).toEqual([expect.objectContaining({ purpose: "payroll_records", granted: true })]);
    await M("PUT", "/consents/payroll_records", { granted: false }); expect((await M("GET", "/profile")).body.consents[0].granted).toBe(false);
    await q(`INSERT INTO queue_events (rank_id, vehicle_id, marshal_id, action, reason_code, position_before) VALUES ('${R1}','${V1}','${U.M1}','override','breakdown',2)`); await q(`INSERT INTO queue_events (rank_id, vehicle_id, marshal_id, action) VALUES ('${R1}','${V2}','${U.M2}','join')`);
    expect((await M("GET", "/queue-events")).body.events).toEqual([expect.objectContaining({ action: "override", reason: "Breakdown", positionBefore: 2, registration: "CA 111-111", rank: "Langa" })]);
  });
});

describe("the pay run, as the association runs it", () => {
  it("drafts the last finished period for every marshal with something to show, lets the admin adjust and redraft, issues, and records a bank payment", async () => {
    await live(); await trips(DAYS_W); await A("POST", "/adjustments", { marshalId: U.M1, kind: "advance", reason: "Advance 14 Oct", reference: "ADV-0007", totalCents: 30000, perPeriodCents: 10000 }); await A("POST", "/adjustments", { marshalId: U.M1, kind: "association_fee", reason: "Weekly fee", reference: "FEE-W44", totalCents: 5000 });
    const run = await A("POST", "/payruns", {}); expect(run.body).toMatchObject({ success: true, period: { start: "2026-10-26", end: "2026-11-01" }, drafted: 1, empty: 1 });
    const list = await A("GET", "/payruns"); expect(list.body).toMatchObject({ period: { start: "2026-10-26", end: "2026-11-01" }, finished: true }); const slip = list.body.payslips[0];
    expect(slip).toMatchObject({ number: "PS-20261101-M0001", trips: 120, grossCents: 96000, deductionsCents: 15000, netCents: 81000, status: "draft" });
    const v = await A("GET", `/payslips/${slip.id}`); expect(v.body.payslip).toMatchObject({ netCents: 81000, feesOwedTrips: 120, note: expect.stringContaining("not a tax document") });
    expect((await A("POST", "/payslips/draft", { marshalId: U.M1, start: "2026-10-28" })).body).toMatchObject({ success: true, number: "PS-20261101-M0001" });                                    // any day in the period names it
    expect((await A("POST", `/payslips/${slip.id}/issue`, { method: "bank" })).body).toMatchObject({ success: true, status: "issued", netCents: 81000 }); expect((await A("POST", `/payslips/${slip.id}/issue`, { method: "bank" })).status).toBe(409);
    expect((await A("POST", `/payslips/${slip.id}/payment`, { method: "bank", reference: "EFT-4411", paidAt: "2026-11-02" })).body).toMatchObject({ success: true, status: "paid" }); expect((await A("GET", `/payslips/${slip.id}`)).body.payslip.payment).toMatchObject({ method: "bank", reference: "EFT-4411" });
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'payslip.%' OR action LIKE 'payrun.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["payrun.draft", "payslip.issue", "payslip.payment"]);
    const pdf = await A("GET", `/payslips/${slip.id}.pdf`); expect(pdf.type).toContain("application/pdf"); expect(pdf.body.length).toBeLessThan(60_000);
  });
  it("refuses what it should: another association's payslip, a period that has not finished, a bad id, an unknown marshal, and a payment before issue", async () => {
    await live(); await trips([["2026-10-27", 1]]); await A("POST", "/payruns", {}); const slip = (await A("GET", "/payruns")).body.payslips[0];
    const B = (m: string, p: string, b?: unknown) => call(m, `/association${p}`, as(U.B, "association"), b);
    expect((await B("GET", `/payslips/${slip.id}`)).status).toBe(404); expect((await B("POST", `/payslips/${slip.id}/issue`, { method: "bank" })).status).toBe(404); expect((await B("GET", `/payslips/${slip.id}.pdf`)).status).toBe(404);
    expect((await A("POST", "/payslips/draft", { marshalId: U.M1, start: "2026-11-03" })).status).toBe(409); expect((await A("POST", "/payslips/draft", { marshalId: U.MB, start: "2026-10-27" })).status).toBe(400); expect((await A("POST", "/payslips/draft", { marshalId: "x" })).status).toBe(400);
    expect((await A("GET", "/payslips/nope")).status).toBe(400); expect((await A("POST", `/payslips/${slip.id}/payment`, { method: "bank", reference: "R" })).status).toBe(409); expect((await A("POST", `/payslips/${slip.id}/issue`, { method: "barter" })).status).toBe(400);
    expect((await B("GET", "/payruns")).body.payslips).toEqual([]);
  });
  it("lists, validates and cancels adjustments, and lists the marshals with their payslip identity, where the admin sets class and UIF", async () => {
    expect((await A("POST", "/adjustments", { marshalId: U.M1, kind: "bonus", label: "Festive", totalCents: 5000 })).body).toMatchObject({ success: true, reference: "BON-0001" }); expect((await A("POST", "/adjustments", { marshalId: U.M1, kind: "advance", totalCents: 5000 })).status).toBe(400);
    expect((await A("POST", "/adjustments", { marshalId: U.MB, kind: "bonus", totalCents: 5000 })).status).toBe(400); const a = (await A("GET", `/adjustments?marshalId=${U.M1}`)).body.adjustments; expect(a).toHaveLength(1); expect(a[0]).toMatchObject({ marshal: "Mo Marshal", remainingCents: 5000, active: true });
    expect((await A("POST", `/adjustments/${a[0].id}/cancel`)).body).toMatchObject({ success: true, remainingCents: 5000 }); expect((await A("POST", `/adjustments/${a[0].id}/cancel`)).status).toBe(409); expect((await A("POST", "/adjustments/nope/cancel")).status).toBe(400);
    expect((await A("GET", "/commission/marshals")).body.marshals.map((m: any) => [m.name, m.marshalNumber, m.class])).toEqual([["Mia Marshal", "M-0001", "independent"], ["Mo Marshal", "M-0002", "independent"]]);      // numbered in the order first listed
    expect((await A("PUT", `/commission/marshals/${U.M1}`, { class: "employee", uifApplies: true, startedOn: "2026-09-01" })).status).toBe(200); expect((await A("PUT", `/commission/marshals/${U.M1}`, { class: "boss" })).status).toBe(400); expect((await A("PUT", `/commission/marshals/${U.MB}`, { class: "employee" })).status).toBe(404);
    expect((await A("GET", "/commission/marshals")).body.marshals.find((m: any) => m.name === "Mo Marshal")).toMatchObject({ class: "employee", uifApplies: true, startedOn: "2026-09-01" });
  });
});
const DAYS_W: [string, number][] = [["2026-10-26", 18], ["2026-10-27", 17], ["2026-10-28", 19], ["2026-10-29", 18], ["2026-10-30", 24], ["2026-10-31", 16], ["2026-11-01", 8]];

describe("the audit trail, waivers, exceptions, catch-up and the money check", () => {
  it("shows each trip with its fee, rate and commission, and the association's money check", async () => {
    await live(); const ds = await trips([["2026-10-27", 2]]); const t = await A("GET", "/commission/trips?from=2026-10-26&to=2026-11-01"); expect(t.body.trips).toHaveLength(2);
    expect(t.body.trips[0]).toMatchObject({ marshal: "Mo Marshal", rank: "Langa", registration: "CA 111-111", driver: "Dee Driver", feeCents: 2000, rateBp: 4000, commissionCents: 800, feeStatus: "owed", mode: "live", reversed: false, engineVersion: "commission-1" });
    expect((await A("GET", `/commission/trips?from=2026-10-26&to=2026-11-01&marshalId=${U.M2}`)).body.trips).toEqual([]); expect((await A("GET", "/commission/trips?from=bad")).body.trips).toBeDefined();
    expect((await A("GET", "/commission/reconciliation?from=2026-10-26&to=2026-11-01")).body).toMatchObject({ trips: 2, feesDueCents: 4000, feesOutstandingCents: 4000, outstanding: [{ driver: "Dee Driver", vehicle: "CA 111-111", trips: 2, cents: 4000 }], commissionEarnedCents: 1600 }); expect(ds).toHaveLength(2);
  });
  it("waives a fee (reversing the commission, or not if the association absorbs it), only for its own trips and with a reason", async () => {
    await live(); const [d1, d2] = await trips([["2026-10-27", 2]]); const w = (d: string, b: unknown) => A("POST", `/commission/trips/${d}/waive`, b);
    expect((await w(d1, { reasonCode: "goodwill", reason: "Breakdown" })).body).toMatchObject({ success: true, reversedCents: 800 }); expect((await w(d2, { reasonCode: "association_absorbs", reason: "Covered", absorb: true })).body).toMatchObject({ success: true, reversedCents: 0 });
    expect((await w(d1, { reasonCode: "goodwill", reason: "again" })).status).toBe(409); expect((await w(d2, { reasonCode: "breakdown", reason: "x" })).status).toBe(400); expect((await w("nope", {})).status).toBe(400); expect((await w(id(999), { reasonCode: "goodwill", reason: "x" })).status).toBe(404);
    expect((await call("POST", `/association/commission/trips/${d1}/waive`, as(U.B, "association"), { reasonCode: "goodwill", reason: "x" })).status).toBe(404);
  });
  it("records an approved exception, and catches up on departures that were missed", async () => {
    await live(); expect((await A("POST", "/commission/exceptions", { rankId: R1, vehicleId: V1, marshalId: U.M1, driverId: U.D1, departedAt: "2026-10-27T08:00:00Z", reasonCode: "returned_approved", note: "Flat tyre" })).body).toMatchObject({ success: true, result: { status: "recorded", commissionCents: 800 } });
    expect((await A("POST", "/commission/exceptions", { rankId: R1, vehicleId: V1, marshalId: U.M1, reasonCode: "goodwill", note: "x", departedAt: "2026-10-27T08:00:00Z" })).status).toBe(400);
    await db.query(`INSERT INTO departures (rank_id, vehicle_id, driver_id, marshal_id, departed_at) VALUES ($1,$2,$3,$4,$5)`, [R1, V1, U.D1, U.M1, at("2026-10-28", 7)]); expect((await A("POST", "/commission/backfill", { from: "2026-10-26" })).body).toEqual({ success: true, recorded: 1, skipped: 0 });
    expect((await A("POST", "/commission/backfill", { from: "soon" })).status).toBe(400); await A("PUT", "/commission/settings", { mode: "off" }); expect((await A("POST", "/commission/backfill", { from: "2026-10-26" })).status).toBe(409);
  });
});

describe("queries (disputes) and what upholding one does", () => {
  async function firstSlip() { await live(); const ds = await trips([["2026-10-27", 2]]); await A("POST", "/payruns", {}); const slip = (await A("GET", "/payruns")).body.payslips[0]; await A("POST", `/payslips/${slip.id}/issue`, { method: "bank" }); const lines = (await M("GET", `/payslips/${slip.id}`)).body.payslip.lines; return { ds, slip, line: lines[0] }; }
  it("lets a marshal query a line of their own payslip, once, and see the answer; and not another marshal's line or a draft", async () => {
    const { line, slip } = await firstSlip(); const r = await M("POST", "/disputes", { targetType: "payslip_line", targetId: line.id, message: "I counted 3 trips on Tuesday" }); expect(r.status).toBe(201);
    expect((await M("POST", "/disputes", { targetType: "payslip_line", targetId: line.id, message: "again please" })).status).toBe(409); expect((await M("POST", "/disputes", { targetType: "payslip_line", targetId: line.id, message: "mine!!" }, U.M2)).status).toBe(404);
    for (const bad of [{ message: "x" }, { message: "y".repeat(501) }, { targetType: "payslip_line", targetId: "nope", message: "valid message" }, { targetType: "invoice", targetId: line.id, message: "valid message" }]) expect((await M("POST", "/disputes", { targetType: "payslip_line", targetId: line.id, ...bad })).status, JSON.stringify(bad)).toBe(400);
    expect((await M("GET", "/disputes")).body.disputes).toEqual([expect.objectContaining({ status: "open", message: "I counted 3 trips on Tuesday", payslipId: slip.id, raisedBy: "Mo Marshal" })]); expect((await M("GET", "/disputes", undefined, U.M2)).body.disputes).toEqual([]);
    expect((await D("POST", "/disputes", { targetType: "payslip_line", targetId: line.id, message: "not mine to query" })).status).toBe(404);                                                       // a driver can only query a trip
  });
  it("upholds a marshal's query with a credit that arrives on the next payslip as its own line, and rejects another with a reason", async () => {
    const { line } = await firstSlip(); const id1 = (await M("POST", "/disputes", { targetType: "payslip_line", targetId: line.id, message: "I counted 3 trips on Tuesday" })).body.id;
    expect((await A("POST", `/disputes/${id1}/respond`, { decision: "upheld", response: "" })).status).toBe(400); expect((await A("POST", `/disputes/${id1}/respond`, { decision: "maybe", response: "x" })).status).toBe(400); expect((await A("POST", `/disputes/${id1}/respond`, { decision: "upheld", response: "Checked the log", creditCents: -1 })).status).toBe(400);
    expect((await A("POST", `/disputes/${id1}/respond`, { decision: "under_review", response: "Looking" })).body).toMatchObject({ success: true, status: "under_review" });
    expect((await A("POST", `/disputes/${id1}/respond`, { decision: "upheld", response: "Checked the log: a trip was missed", creditCents: 800 })).body).toMatchObject({ success: true, status: "upheld", effect: "credit_on_next_payslip" });
    expect((await A("POST", `/disputes/${id1}/respond`, { decision: "rejected", response: "no" })).status).toBe(409); expect((await M("GET", "/disputes")).body.disputes[0]).toMatchObject({ status: "upheld", response: "Checked the log: a trip was missed", respondedBy: "Langa Taxi Association", creditCents: 800 });
    await trips([["2026-11-03", 1]]); const next = await A("POST", "/payslips/draft", { marshalId: U.M1, start: "2026-11-09" }); expect(next.status).toBe(409);                                                    // not finished yet
    expect(((await q(`SELECT kind, side, total_cents, reference FROM pay_adjustments`))[0])).toMatchObject({ kind: "dispute_credit", side: "earning", total_cents: 800, reference: expect.stringMatching(/^DSP-/) });
    const id2 = (await M("POST", "/disputes", { targetType: "payslip_line", targetId: (await q(`SELECT id FROM payslip_lines LIMIT 1`))[0].id, message: "and another thing" })).body.id; expect((await A("POST", `/disputes/${id2}/respond`, { decision: "rejected", response: "The log shows 2 trips" })).body).toMatchObject({ success: true, status: "rejected", effect: "none" });
    expect((await A("GET", "/disputes?status=rejected")).body.disputes).toHaveLength(1); expect((await call("GET", "/association/disputes", as(U.B, "association"))).body.disputes).toEqual([]); expect((await call("POST", `/association/disputes/${id1}/respond`, as(U.B, "association"), { decision: "rejected", response: "x" })).status).toBe(404);
  });
  it("lets a driver query a trip they drove, and upholding it waives an unpaid fee and reverses the commission; a paid fee is flagged for refund instead", async () => {
    await live(); const [d1, d2, other] = [...(await trips([["2026-10-27", 2]])), ...(await trips([["2026-10-27", 1]], { vehicle: V2, driver: U.D2, marshal: U.M2 }))];
    const r1 = await D("POST", "/disputes", { targetId: d1, message: "I did not do this trip" }); expect(r1.status).toBe(201); expect((await D("POST", "/disputes", { targetId: other, message: "not my trip at all" })).status).toBe(404); expect((await D("POST", "/disputes", { targetId: d1, message: "twice over" })).status).toBe(409);
    expect((await M("POST", "/disputes", { targetType: "trip", targetId: other, message: "this is not mine" })).status).toBe(404);                                                                                       // a marshal can only query trips they handled
    expect((await A("POST", `/disputes/${r1.body.id}/respond`, { decision: "upheld", response: "Vehicle was at the workshop" })).body).toMatchObject({ success: true, effect: "fee_waived_commission_reversed" }); expect((await q(`SELECT status FROM payment_items WHERE ref = $1`, [`tripfee:${d1}`]))[0].status).toBe("waived");
    expect(Number((await q(`SELECT SUM(commission_cents) AS s FROM trip_commissions WHERE departure_id = $1`, [d1]))[0].s)).toBe(0);
    await db.query(`UPDATE payment_items SET status = 'paid' WHERE ref = $1`, [`tripfee:${d2}`]); const r2 = await D("POST", "/disputes", { targetId: d2, message: "I did not do this one either" });
    expect((await A("POST", `/disputes/${r2.body.id}/respond`, { decision: "upheld", response: "Duplicate" })).body).toMatchObject({ success: true, effect: "fee_refunded_commission_reversed" }); expect((await D("GET", "/disputes")).body.disputes).toHaveLength(2);
    expect((await A("POST", `/disputes/${r1.body.id}/respond`, { decision: "upheld", response: "x", creditCents: 100 })).status).toBe(409);
  });
});

describe("what a driver sees", () => {
  it("is their place in the queue at each rank, whether they are loading, and nobody else's", async () => {
    const q1 = String((await db.query(`INSERT INTO rank_queue (rank_id, vehicle_id, joined_at) VALUES ($1,$2,$3) RETURNING id`, [R1, V2, at("2026-11-02", 5)])).rows[0].id); await db.query(`INSERT INTO rank_queue (rank_id, vehicle_id, joined_at) VALUES ($1,$2,$3)`, [R1, VB, at("2026-11-02", 5, 10)]);
    const mine = String((await db.query(`INSERT INTO rank_queue (rank_id, vehicle_id, joined_at) VALUES ($1,$2,$3) RETURNING id`, [R1, V1, at("2026-11-02", 5, 20)])).rows[0].id);
    expect((await D("GET", "/queue-position")).body.positions).toEqual([{ rankId: R1, rank: "Langa", registration: "CA 111-111", position: 3, ahead: 2, waiting: 3, loading: false, since: expect.any(String) }]);
    expect((await D("GET", "/queue-position", undefined, U.D2)).body.positions[0]).toMatchObject({ registration: "CA 222-222", position: 1, ahead: 0 }); expect((await D("GET", "/queue-position", undefined, U.O1)).body.positions).toEqual([]);
    await db.query(`UPDATE rank_queue SET left_at = now() WHERE id = $1`, [q1]); await db.query(`INSERT INTO loading_sessions (terminal_id, rank_id, vehicle_id, queue_id, marshal_id, status) VALUES ($1,$2,$3,$4,$5,'loading')`, [id(900), R1, V1, mine, U.M1]);
    expect((await D("GET", "/queue-position")).body.positions[0]).toMatchObject({ position: 2, ahead: 1, waiting: 2, loading: true });
  });
  it("is the fees on their own trips, owed and paid, and never a marshal's commission", async () => {
    await live(); const [d1] = await trips([["2026-10-27", 3]]); await trips([["2026-10-27", 2]], { vehicle: V2, driver: U.D2 }); await db.query(`UPDATE payment_items SET status = 'paid' WHERE ref = $1`, [`tripfee:${d1}`]);
    const f = await D("GET", "/fees?from=2026-10-26&to=2026-11-01"); expect(f.body).toMatchObject({ trips: 3, feesDueCents: 6000, feesReceivedCents: 2000, feesOutstandingCents: 4000, tripsPaid: 1, tripsOwed: 2 }); expect(f.body.outstanding).toEqual([{ driver: "Dee Driver", vehicle: "CA 111-111", trips: 2, cents: 4000 }]);
    expect(JSON.stringify(f.body)).not.toMatch(/commission/i); expect((await D("GET", "/fees?from=2026-10-26&to=2026-11-01", undefined, U.D2)).body).toMatchObject({ trips: 2, feesOutstandingCents: 4000 });
  });
});
