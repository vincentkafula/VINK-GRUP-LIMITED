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

const png = "data:image/png;base64,iVBORw0KGgo=";
describe("shifts, as the marshal and the association see them", () => {
  it("finds a marshal's shifts from their own activity when they look, lets them add and correct one, and shows the association the same with flags", async () => {
    await db.query(`INSERT INTO queue_events (rank_id, vehicle_id, marshal_id, action, created_at) VALUES ($1,$2,$3,'join',$4),($1,$2,$3,'join',$5)`, [R1, V1, U.M1, at("2026-10-28", 6), at("2026-10-28", 7)]);
    const g = await M("GET", "/shifts?from=2026-10-26&to=2026-11-01"); expect(g.body.shifts).toHaveLength(1); expect(g.body.shifts[0]).toMatchObject({ rank: "Langa", workedMinutes: 60, source: "auto", status: "proposed", flags: [] });
    const add = await M("POST", "/shifts", { rankId: R1, startedAt: at("2026-10-29", 6).toISOString(), endedAt: at("2026-10-29", 18).toISOString(), note: "Long day, no logging", clientRef: "shift-ref-0001" }); expect(add.status).toBe(201);
    expect((await M("POST", "/shifts", { rankId: R1, startedAt: at("2026-10-29", 6).toISOString(), endedAt: at("2026-10-29", 18).toISOString(), note: "Long day", clientRef: "shift-ref-0001" })).body).toMatchObject({ success: true, replayed: true });
    expect((await M("POST", "/shifts", { rankId: RB, startedAt: at("2026-10-30", 6).toISOString(), endedAt: at("2026-10-30", 8).toISOString(), note: "x" })).status).toBe(403);
    expect((await M("PUT", `/shifts/${add.body.id}`, { breakMinutes: 45 })).status).toBe(200); expect((await M("PUT", `/shifts/${add.body.id}`, { breakMinutes: 45 }, U.M2)).status).toBe(404); expect((await M("PUT", "/shifts/nope", {})).status).toBe(400);
    const a = await A("GET", "/shifts?from=2026-10-26&to=2026-11-01"); expect(a.body.shifts).toHaveLength(2); const long = a.body.shifts.find((s: any) => s.workedMinutes === 675); expect(long.flags).toEqual(["over_shift_limit"]); expect(a.body.weeks[0]).toMatchObject({ marshal: "Mo Marshal", minutes: 735 });
    expect((await call("GET", "/association/shifts?from=2026-10-26&to=2026-11-01", as(U.B, "association"))).body.shifts).toEqual([]);
    expect((await A("POST", `/shifts/${add.body.id}/decide`, { decision: "approved" })).body).toMatchObject({ success: true, status: "approved" }); expect((await A("POST", `/shifts/${add.body.id}/decide`, { decision: "approved" })).status).toBe(409);
    expect((await call("POST", `/association/shifts/${add.body.id}/decide`, as(U.B, "association"), { decision: "rejected" })).status).toBe(404); expect((await A("POST", "/shifts/detect", { from: "2026-11-05", to: "2026-11-01" })).status).toBe(400); expect((await A("POST", "/shifts/detect", { from: "2026-10-26", to: "2026-11-01" })).body).toEqual({ success: true, found: 0 });
  });
});

describe("safety reports, as the marshal sends them and the association reads them", () => {
  it("takes a report once, shows it to the association with who sent it and to the marshal without, serves the photo to its own association only, and tracks the answer", async () => {
    const r = await M("POST", "/incidents", { rankId: R1, type: "robbery", note: "Two men at the back of the rank", photo: png, occurredAt: "2026-11-02T05:00:00Z", clientRef: "inc-ref-00001" }); expect(r.status).toBe(201);
    expect((await M("POST", "/incidents", { rankId: R1, type: "robbery", clientRef: "inc-ref-00001" })).body).toMatchObject({ replayed: true }); expect((await M("POST", "/incidents", { rankId: R1, type: "riot" })).status).toBe(400); expect((await M("POST", "/incidents", { rankId: RB, type: "fight" })).status).toBe(403);
    const a = await A("GET", "/incidents"); expect(a.body).toMatchObject({ newCount: 1, incidents: [{ rank: "Langa", type: "robbery", reporter: "Mo Marshal", hasPhoto: true, status: "new" }] }); expect(JSON.stringify(a.body)).not.toContain("base64");
    expect((await M("GET", "/incidents")).body.incidents[0].reporter).toBeNull(); expect((await M("GET", "/incidents", undefined, U.M2)).body.incidents).toEqual([]); expect((await call("GET", "/association/incidents", as(U.B, "association"))).body.incidents).toEqual([]);
    expect((await A("GET", `/incidents/${r.body.id}/photo`)).body.photo).toBe(png); expect((await call("GET", `/association/incidents/${r.body.id}/photo`, as(U.B, "association"))).status).toBe(404);
    expect((await A("POST", `/incidents/${r.body.id}/ack`, { status: "acknowledged" })).body).toMatchObject({ success: true, status: "acknowledged" }); expect((await A("GET", "/incidents")).body.newCount).toBe(0); expect((await A("POST", `/incidents/${r.body.id}/ack`, { status: "reopen" })).status).toBe(400);
    const rm = await A("GET", "/risk-map?from=2026-10-26&to=2026-11-02"); expect(rm.body.ranks[0]).toMatchObject({ rank: "Langa", total: 1, score: 5, level: "medium", byPeriod: { morning: 1 } }); expect((await A("GET", "/risk-map?from=bad&to=worse")).body.ranks).toBeDefined();
  });
});

describe("complaints, benefits and the work record", () => {
  it("takes a complaint once, answers it to the marshal (as the association, not a name), and gives the association anonymous insight", async () => {
    const g = await M("POST", "/grievances", { category: "pay", message: "My advance was taken twice", clientRef: "grv-ref-00001" }); expect(g.status).toBe(201); expect((await M("POST", "/grievances", { category: "pay", message: "My advance was taken twice", clientRef: "grv-ref-00001" })).body.replayed).toBe(true);
    expect((await M("POST", "/grievances", { category: "gossip", message: "something" })).status).toBe(400); expect((await A("GET", "/grievances")).body.grievances).toEqual([expect.objectContaining({ marshal: "Mo Marshal", category: "pay", status: "open" })]);
    expect((await A("POST", `/grievances/${g.body.id}/respond`, { status: "resolved", response: "" })).status).toBe(400); expect((await A("POST", `/grievances/${g.body.id}/respond`, { status: "resolved", response: "Refunded" })).body.status).toBe("resolved");
    expect((await M("GET", "/grievances")).body.grievances[0]).toMatchObject({ status: "resolved", response: "Refunded", respondedBy: "Your association", marshal: null }); expect((await M("GET", "/grievances", undefined, U.M2)).body.grievances).toEqual([]);
    const w = await A("GET", "/welfare-insights?from=2026-10-26&to=2026-11-08"); expect(w.body.value ?? w.body).toMatchObject({ total: 1, byCategory: { pay: 1 } }); expect((await call("POST", `/association/grievances/${g.body.id}/respond`, as(U.B, "association"), { status: "closed", response: "x" })).status).toBe(404);
  });
  it("records cover, shows the marshal their own with what they contributed, and shows the association a marshal's work record only for its own marshals", async () => {
    expect((await A("PUT", "/benefits", { marshalId: U.M1, kind: "uif", status: "registered", reference: "UIF-77" })).status).toBe(200); expect((await A("PUT", "/benefits", { marshalId: U.MB, kind: "uif", status: "registered" })).status).toBe(400);
    const b = await M("GET", "/benefits"); expect(b.body.benefits[0]).toMatchObject({ kind: "uif", status: "registered", reference: "UIF-77" }); expect((await M("GET", "/benefits", undefined, U.M2)).body.benefits[0].status).toBe("not_registered");
    expect((await A("GET", "/benefits")).body.marshals.map((m: any) => m.name)).toEqual(["Mia Marshal", "Mo Marshal"]); await trips([["2026-10-27", 2]]);
    expect((await M("GET", "/work-record")).body.record).toMatchObject({ totalTrips: 2, verified: false, ranks: [{ rank: "Langa", trips: 2 }] }); expect((await A("GET", `/work-record/${U.M1}`)).body.record.totalTrips).toBe(2);
    expect((await A("GET", `/work-record/${U.MB}`)).status).toBe(404); expect((await call("GET", `/association/work-record/${U.M1}`, as(U.B, "association"))).status).toBe(404); expect((await A("GET", "/work-record/nope")).status).toBe(404);
  });
});

describe("the income letter", () => {
  it("needs consent first, makes a letter from issued payslips, serves it as JSON and PDF to the marshal only, and lets the association check it by number and code", async () => {
    await live(); await trips([["2026-10-27", 3]]); await A("POST", "/payruns", {}); const slip = (await A("GET", "/payruns")).body.payslips[0]; await A("POST", `/payslips/${slip.id}/issue`, { method: "bank" });
    expect((await M("POST", "/income-letters", { months: 3 })).status).toBe(403); expect((await M("PUT", "/consents/income_letter", { granted: true })).status).toBe(200); expect((await M("POST", "/income-letters", { months: 5 })).status).toBe(400);
    const l = await M("POST", "/income-letters", { months: 3 }); expect(l.status).toBe(201); expect(l.body.letter).toMatchObject({ number: expect.stringMatching(/^IL-20261102-M0001-1$/), intact: true, totals: { trips: 3, earnedCents: 2400, netCents: 2400 } });
    expect((await M("GET", "/income-letters")).body.letters).toHaveLength(1); expect((await M("GET", `/income-letters/${l.body.letter.id}`)).body.letter.verificationCode).toBe(l.body.letter.verificationCode);
    const pdf = await M("GET", `/income-letters/${l.body.letter.id}.pdf`); expect(pdf.type).toContain("application/pdf"); expect(pdf.disposition).toContain("income-letter-IL-20261102-M0001-1.pdf"); expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await M("GET", `/income-letters/${l.body.letter.id}`, undefined, U.M2)).status).toBe(404); expect((await M("GET", `/income-letters/${l.body.letter.id}.pdf`, undefined, U.M2)).status).toBe(404); expect((await M("GET", "/income-letters/nope")).status).toBe(400);
    expect((await A("POST", "/income-letters/verify", { number: l.body.letter.number, code: l.body.letter.verificationCode })).body).toMatchObject({ success: true, valid: true, marshal: "Mo Marshal", intact: true });
    expect((await A("POST", "/income-letters/verify", { number: l.body.letter.number, code: "000000000000" })).body).toEqual({ success: true, valid: false }); expect((await call("POST", "/association/income-letters/verify", as(U.B, "association"), { number: l.body.letter.number, code: l.body.letter.verificationCode })).body.valid).toBe(false);
  });
});

describe("the overview", () => {
  it("gives the association's overview as data, CSV and PDF, scoped to it, with filters, and its patterns", async () => {
    const k = await A("GET", "/kpis?from=2026-10-26&to=2026-11-01"); expect(k.body.kpis).toMatchObject({ trips: 0, marshals: 2, tapSharePercent: null }); expect((await A("GET", "/kpis?from=2026-11-05&to=2026-11-01")).status).toBe(400); expect((await call("GET", "/association/kpis?from=2026-10-26&to=2026-11-01", as(U.B, "association"))).body.kpis.marshals).toBe(1);
    const csv = await A("GET", "/kpis.csv?from=2026-10-26&to=2026-11-01"); expect(csv.type).toContain("text/csv"); expect(String(csv.body.toString("utf8"))).toContain("marshals,2"); expect(csv.disposition).toContain("marshal-overview-2026-10-26-to-2026-11-01.csv");
    const pdf = await A("GET", "/kpis.pdf?from=2026-10-26&to=2026-11-01"); expect(pdf.type).toContain("application/pdf"); expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-"); expect((await A("GET", "/patterns")).body).toEqual({ success: true, patterns: [] });
    expect((await A("GET", `/kpis?from=2026-10-26&to=2026-11-01&rankId=${R2}`)).body.kpis.trips).toBe(0);
  });
});

describe("drawing earned commission, refunds and revisions, through the routes", () => {
  it("lets a marshal see and draw what is safe once the association switches it on, and refuses it before", async () => {
    await live(); const ds = await trips([["2026-10-27", 4]]); for (const d of ds.slice(0, 3)) await db.query(`UPDATE payment_items SET status = 'paid' WHERE ref = $1`, [`tripfee:${d}`]);
    expect((await M("GET", "/cash-out")).body).toMatchObject({ enabled: false, maxCents: 1200 }); expect((await M("POST", "/cash-out", { amountCents: 1000 })).status).toBe(409);
    expect((await A("PUT", "/commission/settings", { cashoutEnabled: true, cashoutCapBp: 5000 })).status).toBe(200); expect((await M("GET", "/cash-out")).body).toMatchObject({ enabled: true, availableCents: 2400, maxCents: 1200 });
    expect((await M("POST", "/cash-out", { amountCents: 500 })).status).toBe(400); expect((await M("POST", "/cash-out", { amountCents: 1300 })).status).toBe(409); expect((await M("POST", "/cash-out", { amountCents: 1200 })).body).toMatchObject({ success: true, reference: "ACC-0001", maxCents: 0 });
    expect((await q(`SELECT kind, payer_id, payee_id, amount_cents FROM payment_items WHERE kind = 'marshal_commission'`))[0]).toMatchObject({ payer_id: U.A, payee_id: U.M1, amount_cents: 1200 }); expect((await M("POST", "/cash-out", { amountCents: 1000 }, U.MB)).status).toBe(409); expect((await M("POST", "/cash-out", { amountCents: 1000 }, U.D1)).status).toBe(403);       // B has not switched it on; a driver works for no association
  });
  it("lets the association refund a paid fee and revise an unpaid payslip, only for its own records, with reasons", async () => {
    await live(); const [d1] = await trips([["2026-10-27", 2]]); await db.query(`UPDATE payment_items SET status = 'paid' WHERE ref = $1`, [`tripfee:${d1}`]);
    expect((await A("POST", `/commission/trips/${d1}/refund`, { reasonCode: "error_corrected", reason: "Never left" })).body).toMatchObject({ success: true, refundCents: 2000, reversedCents: 800 }); expect((await A("POST", `/commission/trips/${d1}/refund`, { reasonCode: "error_corrected", reason: "again" })).status).toBe(409);
    expect((await call("POST", `/association/commission/trips/${d1}/refund`, as(U.B, "association"), { reasonCode: "goodwill", reason: "x" })).status).toBe(404); expect((await A("POST", "/commission/trips/nope/refund", {})).status).toBe(400);
    await A("POST", "/payruns", {}); const slip = (await A("GET", "/payruns")).body.payslips[0]; await A("POST", `/payslips/${slip.id}/issue`, { method: "bank" });
    expect((await A("POST", `/payslips/${slip.id}/revise`, { note: " " })).status).toBe(400); expect((await call("POST", `/association/payslips/${slip.id}/revise`, as(U.B, "association"), { note: "x" })).status).toBe(404);
    expect((await A("POST", `/payslips/${slip.id}/revise`, { note: "A trip was left out" })).body).toMatchObject({ success: true, number: "PS-20261101-M0001" }); expect((await A("POST", `/payslips/${slip.id}/revise`, { note: "again" })).status).toBe(409);
    expect((await M("GET", "/payslips")).body.payslips.map((p: any) => p.status)).toEqual(["revised"]); expect((await q(`SELECT action FROM audit_log WHERE action IN ('commission.refund','payslip.revise') ORDER BY created_at`)).map((r) => r.action)).toEqual(["commission.refund", "payslip.revise"]);
  });
});

describe("resending changes made offline, and the driver's trips", () => {
  it("treats a queue change that was already recorded as done (so a resend from a phone does nothing twice), but only for the same marshal", async () => {
    await q(`INSERT INTO queue_events (rank_id, vehicle_id, marshal_id, action, client_ref) VALUES ('${R1}','${V1}','${U.M1}','depart','dep-ref-00001')`);
    for (const path of [`/ranks/${R1}/queue`, `/ranks/${R1}/depart`, `/ranks/${R1}/queue/${id(7)}/remove`]) expect((await M("POST", path, { vehicleId: V1, clientRef: "dep-ref-00001" })).body, path).toEqual({ success: true, replayed: true });
    expect((await M("POST", `/ranks/${R1}/depart`, { clientRef: "dep-ref-00001" }, U.M2)).body.replayed).toBeUndefined();            // another marshal's reference is nothing to do with this one
  });
  it("makes a query sent twice one query, and gives a driver their own trips with the fee status, and nothing of anyone else's or of a marshal's pay", async () => {
    await live(); const [d1, d2] = await trips([["2026-10-27", 2]]); await trips([["2026-10-27", 1]], { vehicle: V2, driver: U.D2, marshal: U.M2 }); await db.query(`UPDATE payment_items SET status = 'paid' WHERE ref = $1`, [`tripfee:${d1}`]);
    const q1 = await D("POST", "/disputes", { targetId: d2, message: "I did not do this trip", clientRef: "dsp-ref-00001" }), q2 = await D("POST", "/disputes", { targetId: d2, message: "I did not do this trip", clientRef: "dsp-ref-00001" }); expect(q1.status).toBe(201); expect(q2.body.id).toBe(q1.body.id); expect((await q(`SELECT COUNT(*) AS n FROM disputes`))[0].n).toBe(1);
    const t = await D("GET", "/trip-fees?from=2026-10-26&to=2026-11-01"); expect(t.body.trips).toHaveLength(2); expect(t.body.trips.map((x: any) => x.feeStatus).sort()).toEqual(["owed", "paid"]); expect(JSON.stringify(t.body)).not.toMatch(/commission|marshal/i);
    expect((await D("GET", "/trip-fees?from=2026-10-26&to=2026-11-01", undefined, U.D2)).body.trips).toHaveLength(1);
  });
});
