import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createCommission, type Commission } from "./commission.js";
import { createMarshalCare, type MarshalCare } from "./marshalCare.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Marshal care: shifts, safety, voice, benefits, the work record, the income letter, the overview and patterns. Association A has ranks R1 and R2 (marshals M1 on both, M2 on R1); association B is a stranger with RB and MB.
 * Fixed clock: Monday 2 Nov 2026, 10:00 in South Africa.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), M1: id(3), M2: id(4), MB: id(5), D1: id(6), O1: id(7) };
const R1 = id(100), R2 = id(101), RB = id(102), V1 = id(110), T1 = id(120), T2 = id(121);
const NOW = new Date("2026-11-02T08:00:00Z");
let db: Db, c: Commission, m: MarshalCare, n = 7000;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: { ok: boolean } & any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
/** The PDF library writes text as hex runs: decode them all and join, to read what the page says. */
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
const sa = (day: string, h: number, min = 0) => new Date(`${day}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+02:00`);

beforeEach(async () => {
  db = allPortalsDb(); c = createCommission(db, () => NOW); m = createMarshalCare(db, c, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.M1, "Mo Marshal", "marshal"], [U.M2, "Mia Marshal", "marshal"], [U.MB, "Bea Marshal", "marshal"], [U.D1, "Dee Driver", "driver"], [U.O1, "Olu Owner", "vehicle_owner"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa'),($3,$2,'Bellville'),($4,$5,'Elsewhere')`, [R1, U.A, R2, RB, U.B]);
  await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2),($3,$2),($1,$4),($5,$6)`, [R1, U.M1, R2, U.M2, RB, U.MB]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, driver_id) VALUES ($1,$2,'CA 111-111',$3)`, [V1, U.O1, U.D1]); await db.query(`INSERT INTO terminals (id, serial) VALUES ($1,'T-1'),($2,'T-2')`, [T1, T2]);
});
const event = (marshal: string, rank: string, at: Date) => db.query(`INSERT INTO queue_events (rank_id, vehicle_id, marshal_id, action, created_at) VALUES ($1,$2,$3,'join',$4)`, [rank, V1, marshal, at]);
const departure = async (marshal: string, rank: string, at: Date, pax: number | null = null) => String((await db.query(`INSERT INTO departures (id, rank_id, vehicle_id, driver_id, marshal_id, passengers, departed_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [id(n++), rank, V1, U.D1, marshal, pax, at])).rows[0].id);

describe("shifts and hours", () => {
  it("finds shifts from a marshal's own activity, splits them where there is a long gap, and finds nothing new the second time", async () => {
    for (const [h, mi] of [[6, 0], [6, 40], [7, 30], [8, 30]] as const) await event(U.M1, R1, sa("2026-10-26", h, mi));
    await departure(U.M1, R1, sa("2026-10-26", 15, 0)); await departure(U.M1, R1, sa("2026-10-26", 16, 0)); await event(U.M1, R2, sa("2026-10-26", 9, 0));
    expect(await m.detectShifts({ associationId: U.A }, "2026-10-26", "2026-10-26")).toBe(3);
    const s = (await m.shifts({ associationId: U.A }, "2026-10-26", "2026-10-26")).shifts.map((x: any) => [x.rank, x.startedAt, x.endedAt, x.workedMinutes, x.source, x.status]).sort();
    expect(s).toEqual([["Bellville", sa("2026-10-26", 9).toISOString(), sa("2026-10-26", 9).toISOString(), 0, "auto", "proposed"], ["Langa", sa("2026-10-26", 6).toISOString(), sa("2026-10-26", 8, 30).toISOString(), 150, "auto", "proposed"], ["Langa", sa("2026-10-26", 15).toISOString(), sa("2026-10-26", 16).toISOString(), 60, "auto", "proposed"]]);
    expect(await m.detectShifts({ associationId: U.A }, "2026-10-26", "2026-10-26")).toBe(0);
  });
  it("uses the association's own gap, only its own marshals, and does not double a shift the marshal already recorded", async () => {
    await event(U.M1, R1, sa("2026-10-26", 6)); await event(U.M1, R1, sa("2026-10-26", 7)); await event(U.MB, RB, sa("2026-10-26", 6));
    ok(await c.updateSettings(U.A, { shiftGapMinutes: 30 })); expect(await m.detectShifts({ associationId: U.A }, "2026-10-26", "2026-10-26")).toBe(2);     // an hour apart is now two shifts
    expect((await m.shifts({ associationId: U.B }, "2026-10-26", "2026-10-26")).shifts).toEqual([]); expect(await m.detectShifts({ marshalId: U.MB }, "2026-10-26", "2026-10-26")).toBe(1);
    await db.query(`DELETE FROM shifts WHERE marshal_id = $1`, [U.M1]); ok(await m.addShift(U.M1, { rankId: R1, startedAt: sa("2026-10-26", 5).toISOString(), endedAt: sa("2026-10-26", 8).toISOString(), note: "Worked the morning" })); expect(await m.detectShifts({ associationId: U.A }, "2026-10-26", "2026-10-26")).toBe(0);
  });
  it("flags a shift over the agreed length, a long shift with no break noted, and a week over the agreed week, without blaming anyone", async () => {
    ok(await c.updateSettings(U.A, { shiftLimitMinutes: 600, weekLimitMinutes: 1500 }));
    for (const d of ["2026-10-26", "2026-10-27"]) ok(await m.addShift(U.M1, { rankId: R1, startedAt: sa(d, 5).toISOString(), endedAt: sa(d, 17).toISOString(), note: "Long day" }));
    ok(await m.addShift(U.M2, { rankId: R1, startedAt: sa("2026-10-26", 8).toISOString(), endedAt: sa("2026-10-26", 12).toISOString(), breakMinutes: 0, note: "Short" }));
    const r = await m.shifts({ associationId: U.A }, "2026-10-26", "2026-11-01"); const long = r.shifts.filter((x: any) => x.marshalId === U.M1); expect(long.map((x: any) => x.flags)).toEqual([["over_shift_limit", "no_break_noted"], ["over_shift_limit", "no_break_noted"]]);
    expect(r.shifts.find((x: any) => x.marshalId === U.M2)!.flags).toEqual([]); expect(r.weeks).toEqual([expect.objectContaining({ marshal: "Mia Marshal", week: "2026-10-26", minutes: 240, over: false }), expect.objectContaining({ marshal: "Mo Marshal", week: "2026-10-26", minutes: 1440, limit: 1500, over: false })]);
    ok(await m.correctShift(U.M1, (long[0] as any).id, { breakMinutes: 60 })); const r2 = await m.shifts({ associationId: U.A }, "2026-10-26", "2026-11-01"); expect(r2.weeks.find((w: any) => w.marshal === "Mo Marshal")).toMatchObject({ minutes: 1380 });
    ok(await c.updateSettings(U.A, { weekLimitMinutes: 1000 })); expect((await m.shifts({ associationId: U.A }, "2026-10-26", "2026-11-01")).weeks.find((w: any) => w.marshal === "Mo Marshal")).toMatchObject({ over: true });
  });
  it("lets a marshal correct their own shift (with a reason for changed times), which goes back for approval, and refuses nonsense and other people's shifts", async () => {
    const s = ok<any>(await m.addShift(U.M1, { rankId: R1, startedAt: sa("2026-10-26", 6).toISOString(), endedAt: sa("2026-10-26", 12).toISOString(), note: "Morning" }));
    await db.query(`UPDATE shifts SET status = 'approved' WHERE id = $1`, [s.id]);
    expect(await m.correctShift(U.M1, s.id, { endedAt: sa("2026-10-26", 13).toISOString() })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("why") });
    ok(await m.correctShift(U.M1, s.id, { endedAt: sa("2026-10-26", 13).toISOString(), note: "Stayed on for the afternoon rush" })); expect((await q(`SELECT status, corrected, note, approved_by FROM shifts WHERE id = $1`, [s.id]))[0]).toMatchObject({ status: "proposed", corrected: true, note: "Stayed on for the afternoon rush", approved_by: null });
    for (const bad of [{ endedAt: sa("2026-10-26", 5).toISOString(), note: "x" }, { endedAt: sa("2026-10-28", 6).toISOString(), note: "x" }, { endedAt: "soon", note: "x" }, { endedAt: sa("2026-11-09", 6).toISOString(), note: "x" }, { breakMinutes: 600 }, { breakMinutes: -5 }, { breakMinutes: 1.5 }]) expect(await m.correctShift(U.M1, s.id, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await m.correctShift(U.M2, s.id, { breakMinutes: 5 })).toMatchObject({ ok: false, status: 404 });
  });
  it("lets a marshal add a shift that was not found, once (a resend changes nothing), at their own rank, without overlapping, and with a note", async () => {
    const a = { rankId: R1, startedAt: sa("2026-10-26", 6).toISOString(), endedAt: sa("2026-10-26", 9).toISOString(), note: "No activity logged", clientRef: "shift-abc-123" };
    expect(ok<any>(await m.addShift(U.M1, a)).replayed).toBe(false); expect(ok<any>(await m.addShift(U.M1, a)).replayed).toBe(true); expect((await q(`SELECT COUNT(*) AS n FROM shifts`))[0].n).toBe(1);
    expect(await m.addShift(U.M1, { ...a, clientRef: undefined, startedAt: sa("2026-10-26", 8).toISOString(), endedAt: sa("2026-10-26", 10).toISOString() })).toMatchObject({ ok: false, status: 409 });
    expect(await m.addShift(U.M1, { ...a, clientRef: undefined, rankId: RB })).toMatchObject({ ok: false, status: 403 }); expect(await m.addShift(U.M1, { ...a, clientRef: undefined, note: "" })).toMatchObject({ ok: false, status: 400 });
    for (const bad of [{ endedAt: sa("2026-10-26", 5).toISOString() }, { startedAt: "x" }, { endedAt: sa("2026-12-26", 5).toISOString() }, { breakMinutes: 999 }, { clientRef: "no" }]) expect(await m.addShift(U.M1, { ...a, clientRef: undefined, startedAt: sa("2026-10-27", 6).toISOString(), endedAt: sa("2026-10-27", 9).toISOString(), ...bad } as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
  });
  it("lets only the association approve or reject a shift that is waiting, once, and only its own", async () => {
    const s = ok<any>(await m.addShift(U.M1, { rankId: R1, startedAt: sa("2026-10-26", 6).toISOString(), endedAt: sa("2026-10-26", 9).toISOString(), note: "Morning" }));
    expect(await m.decideShift(U.A, s.id, U.A, "maybe")).toMatchObject({ ok: false, status: 400 }); expect(await m.decideShift(U.B, s.id, U.B, "approved")).toMatchObject({ ok: false, status: 404 });
    expect(await m.decideShift(U.A, s.id, U.A, "approved")).toEqual({ ok: true, value: { status: "approved" } }); expect(await m.decideShift(U.A, s.id, U.A, "rejected")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("safety reports and the risk picture", () => {
  const report = (o: any = {}) => m.reportIncident(U.M1, { rankId: R1, type: "threat", ...o });
  it("takes a one-tap report from a rank the marshal works at, with the time, a note and a small photo, once even if it is sent twice", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo="; const a = ok<any>(await report({ note: "Two men demanded money", photo: png, occurredAt: "2026-11-02T05:00:00Z", clientRef: "inc-abc-12345" })); expect(a.replayed).toBe(false);
    expect(ok<any>(await report({ clientRef: "inc-abc-12345" })).replayed).toBe(true); expect((await q(`SELECT COUNT(*) AS n FROM incidents`))[0].n).toBe(1);
    expect((await q(`SELECT type, note, status, occurred_at, photo FROM incidents`))[0]).toMatchObject({ type: "threat", note: "Two men demanded money", status: "new", photo: png });
    expect(await report({ rankId: RB })).toMatchObject({ ok: false, status: 403 }); expect(await report({ type: "riot" })).toMatchObject({ ok: false, status: 400 });
    for (const bad of [{ occurredAt: "2026-10-01T00:00:00Z" }, { occurredAt: "2026-12-01T00:00:00Z" }, { occurredAt: "never" }, { photo: "data:text/html;base64,AAAA" }, { photo: "http://x/y.png" }, { photo: "data:image/png;base64," + "A".repeat(160_000) }, { clientRef: "x" }]) expect(await report(bad), JSON.stringify(bad).slice(0, 60)).toMatchObject({ ok: false, status: 400 });
  });
  it("tells the association (with who reported), shows the marshal only their own, counts what is new, and never shows another association's reports", async () => {
    await report(); await report({ type: "robbery" }); await m.reportIncident(U.MB, { rankId: RB, type: "fight" });
    const a = await m.incidents({ associationId: U.A }); expect(a.newCount).toBe(2); expect(a.incidents.map((i: any) => [i.rank, i.type, i.reporter, i.status])).toEqual(expect.arrayContaining([["Langa", "threat", "Mo Marshal", "new"], ["Langa", "robbery", "Mo Marshal", "new"]]));
    expect((await m.incidents({ marshalId: U.M1 })).incidents.every((i: any) => i.reporter === null)).toBe(true); expect((await m.incidents({ marshalId: U.M2 })).incidents).toEqual([]); expect((await m.incidents({ associationId: U.B })).incidents).toHaveLength(1);
    expect((await m.incidents({ associationId: U.A }, { status: "closed" })).incidents).toEqual([]);
  });
  it("lets the association acknowledge and close a report, once, and only its own, and fetch its photo", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo="; const a = ok<any>(await report({ photo: png })); expect(await m.incidentPhoto(U.A, a.id)).toBe(png); expect(await m.incidentPhoto(U.B, a.id)).toBeNull();
    expect(await m.acknowledgeIncident(U.A, a.id, U.A, "reopen")).toMatchObject({ ok: false, status: 400 }); expect(await m.acknowledgeIncident(U.B, a.id, U.B, "closed")).toMatchObject({ ok: false, status: 404 });
    expect(await m.acknowledgeIncident(U.A, a.id, U.A, "acknowledged")).toEqual({ ok: true, value: { status: "acknowledged" } }); expect((await m.incidents({ associationId: U.A })).newCount).toBe(0);
    ok(await m.acknowledgeIncident(U.A, a.id, U.A, "closed")); expect(await m.acknowledgeIncident(U.A, a.id, U.A, "acknowledged")).toMatchObject({ ok: false, status: 409 });
  });
  it("puts each report in the right part of the day, exactly at the edges (South African time: 05:00, 12:00, 17:00 and 21:00)", async () => {
    // South African time is two hours ahead of UTC. 04:59 and 21:00 are night; 05:00 and 11:59 morning; 12:00 and 16:59 afternoon; 17:00 and 20:59 evening.
    for (const utc of ["02:59", "03:00", "09:59", "10:00", "14:59", "15:00", "18:59", "19:00"]) await report({ type: "other", occurredAt: `2026-10-31T${utc}:00Z` });
    expect(ok<any>(await m.riskMap(U.A, "2026-10-26", "2026-11-02")).ranks.find((x: any) => x.rank === "Langa").byPeriod).toEqual({ night: 2, morning: 2, afternoon: 2, evening: 2 });
  });
  it("builds the risk picture per rank: counts by kind and by time of day, a score weighted by seriousness, and a level", async () => {
    await report({ type: "robbery", occurredAt: "2026-10-30T21:30:00Z" });                       // 23:30 in South Africa: night
    await report({ type: "threat", occurredAt: "2026-10-31T06:00:00Z" }); await report({ type: "fight", occurredAt: "2026-10-31T14:00:00Z" });            // morning 08:00, evening 16:00 is afternoon
    await m.reportIncident(U.M1, { rankId: R2, type: "overcrowding", occurredAt: "2026-11-01T10:00:00Z" }); await m.reportIncident(U.MB, { rankId: RB, type: "robbery", occurredAt: "2026-11-01T10:00:00Z" });
    const r = ok<any>(await m.riskMap(U.A, "2026-10-26", "2026-11-01")).ranks; expect(r.map((x: any) => x.rank)).toEqual(["Langa", "Bellville"]);                                      // the other association's rank is not in it
    expect(r[0]).toMatchObject({ rank: "Langa", total: 3, score: 11, level: "high", byType: { robbery: 1, threat: 1, fight: 1 }, byPeriod: { night: 1, morning: 1, afternoon: 1, evening: 0 } }); expect(r[1]).toMatchObject({ rank: "Bellville", total: 1, score: 1, level: "low" });
    expect(ok<any>(await m.riskMap(U.A, "2026-11-02", "2026-11-02")).ranks.every((x: any) => x.total === 0)).toBe(true); expect(await m.riskMap(U.A, "soon", "2026-11-02")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("grievances", () => {
  const raise = (o: any = {}) => m.submitGrievance(U.M1, { category: "pay", message: "My advance was taken twice", ...o });
  it("takes a complaint once (a resend changes nothing), validated, to the marshal's association", async () => {
    expect(ok<any>(await raise({ clientRef: "grv-abc-12345" })).replayed).toBe(false); expect(ok<any>(await raise({ clientRef: "grv-abc-12345" })).replayed).toBe(true); expect((await q(`SELECT association_id, category FROM grievances`))).toEqual([{ association_id: U.A, category: "pay" }]);
    for (const bad of [{ category: "gossip" }, { message: "no" }, { message: "x".repeat(501) }, { clientRef: "x" }]) expect(await raise(bad), JSON.stringify(bad).slice(0, 40)).toMatchObject({ ok: false, status: 400 });
    expect(await m.submitGrievance(U.D1, { category: "pay", message: "I am not a marshal" })).toMatchObject({ ok: false, status: 403 });
  });
  it("shows the association who raised what, shows a marshal only their own with 'your association' as the answerer, and answers once", async () => {
    const g = ok<any>(await raise()); await m.submitGrievance(U.MB, { category: "hours", message: "Too many hours at this rank" });
    expect((await m.grievances({ associationId: U.A })).map((x: any) => [x.marshal, x.category])).toEqual([["Mo Marshal", "pay"]]); expect((await m.grievances({ marshalId: U.M2 }))).toEqual([]);
    expect(await m.respondGrievance(U.A, g.id, U.A, { status: "resolved", response: "" })).toMatchObject({ ok: false, status: 400 }); expect(await m.respondGrievance(U.A, g.id, U.A, { status: "gone" })).toMatchObject({ ok: false, status: 400 });
    expect(await m.respondGrievance(U.B, g.id, U.B, { status: "resolved", response: "x" })).toMatchObject({ ok: false, status: 404 }); ok(await m.respondGrievance(U.A, g.id, U.A, { status: "under_review" }));
    ok(await m.respondGrievance(U.A, g.id, U.A, { status: "resolved", response: "Refunded the second deduction" })); expect(await m.respondGrievance(U.A, g.id, U.A, { status: "closed", response: "again" })).toMatchObject({ ok: false, status: 409 });
    expect((await m.grievances({ marshalId: U.M1 }))[0]).toMatchObject({ status: "resolved", response: "Refunded the second deduction", respondedBy: "Your association", marshal: null });
  });
  it("summarises what marshals are raising without naming anyone, and how long answers take", async () => {
    const a = ok<any>(await raise()); await raise({ category: "safety", message: "No lighting at the rank" }); await m.submitGrievance(U.M2, { category: "pay", message: "Pay was late again" });
    await db.query(`UPDATE grievances SET created_at = $2 WHERE id = $1`, [a.id, new Date("2026-11-01T08:00:00Z")]); await db.query(`UPDATE grievances SET status = 'resolved', responded_at = $2, responded_by = $3, response = 'ok' WHERE id = $1`, [a.id, new Date("2026-11-01T14:00:00Z"), U.A]);
    const r = ok<any>(await m.welfareInsights(U.A, "2026-10-01", "2026-11-30")); expect(r).toMatchObject({ total: 3, open: 2, byCategory: { pay: 2, safety: 1 }, byStatus: { resolved: 1, open: 2 }, averageHoursToAnswer: 6 }); expect(JSON.stringify(r)).not.toMatch(/Mo Marshal|Mia/);
    expect(ok<any>(await m.welfareInsights(U.B, "2026-10-01", "2026-11-30")).total).toBe(0); expect(await m.welfareInsights(U.A, "x", "y")).toMatchObject({ ok: false, status: 400 });
  });
});

async function slip(marshal: string, assoc: string, end: string, o: { net?: number; gross?: number; ded?: number; trips?: number; status?: string; lines?: [string, number][] } = {}) {
  const gross = o.gross ?? 10000, ded = o.ded ?? 1000, p = String((await db.query(`INSERT INTO payslips (association_id, marshal_id, number, period_start, period_end, status, trips, gross_commission_cents, other_earnings_cents, deductions_cents, net_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10) RETURNING id`, [assoc, marshal, `PS-${end}-${marshal.slice(-2)}-${n++}`, end, end, o.status ?? "issued", o.trips ?? 20, gross, ded, o.net ?? gross - ded])).rows[0].id);
  for (const [i, [kind, amt]] of (o.lines ?? []).entries()) await db.query(`INSERT INTO payslip_lines (payslip_id, sort, side, kind, label, amount_cents) VALUES ($1,$2,'deduction',$3,$3,$4)`, [p, i, kind, amt]);
  return p;
}
describe("benefits and the work record", () => {
  it("records a marshal's cover and shows it with what they have contributed, read from issued payslips (not drafts)", async () => {
    await slip(U.M1, U.A, "2026-10-04", { lines: [["uif", 100], ["stokvel", 500], ["association_fee", 200]] }); await slip(U.M1, U.A, "2026-10-11", { lines: [["uif", 100], ["stokvel", 500]], status: "paid" }); await slip(U.M1, U.A, "2026-10-18", { lines: [["uif", 9999]], status: "draft" });
    ok(await m.setBenefit(U.A, U.A, { marshalId: U.M1, kind: "uif", status: "registered", reference: "UIF-77", since: "2026-01-01" })); ok(await m.setBenefit(U.A, U.A, { marshalId: U.M1, kind: "savings", status: "pending" })); ok(await m.setBenefit(U.A, U.A, { marshalId: U.M1, kind: "savings", status: "registered" }));
    const b = await m.benefits(U.M1); expect(b.contributions).toEqual({ uifCents: 200, stokvelCents: 1000, associationFeeCents: 200 });
    expect(b.benefits).toEqual([{ kind: "uif", status: "registered", reference: "UIF-77", since: "2026-01-01", contributedCents: 200 }, { kind: "injury_cover", status: "not_registered", reference: null, since: null, contributedCents: null }, { kind: "savings", status: "registered", reference: null, since: null, contributedCents: 1000 }, { kind: "funeral", status: "not_registered", reference: null, since: null, contributedCents: 1000 }]);
    expect((await m.benefits(U.M2)).contributions).toEqual({ uifCents: 0, stokvelCents: 0, associationFeeCents: 0 });
  });
  it("is validated, and only the association's own marshals can be enrolled", async () => {
    for (const bad of [{ marshalId: U.MB }, { marshalId: "x" }, { kind: "yacht" }, { status: "maybe" }, { since: "last year" }]) expect(await m.setBenefit(U.A, U.A, { marshalId: U.M1, kind: "uif", status: "registered", ...bad } as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
  });
  it("shows tenure, ranks worked and trips handled, earnings by month, and what is missing for the profile to count as verified", async () => {
    await departure(U.M1, R1, sa("2026-09-01", 6)); await departure(U.M1, R1, sa("2026-10-05", 6)); await departure(U.M1, R2, sa("2026-10-06", 6)); await slip(U.M1, U.A, "2026-10-04"); await slip(U.M1, U.A, "2026-10-11", { gross: 20000, ded: 0 });
    let w = await m.workRecord(U.M1); expect(w).toMatchObject({ startDate: "2026-09-01", tenureDays: 62, totalTrips: 3, verified: false, missing: ["a start date", "consent to keep payroll records"] });
    expect(w.ranks).toEqual([{ rank: "Langa", trips: 2, first: "2026-09-01", last: "2026-10-05" }, { rank: "Bellville", trips: 1, first: "2026-10-06", last: "2026-10-06" }]); expect(w.earningsByMonth).toEqual([{ month: "2026-10", earnedCents: 30000, deductionsCents: 1000, netCents: 29000, trips: 40 }]);
    await db.query(`INSERT INTO marshal_profiles (marshal_id, marshal_number, started_on) VALUES ($1,'M-0001','2026-08-15')`, [U.M1]); await db.query(`INSERT INTO consents (user_id, purpose) VALUES ($1,'payroll_records')`, [U.M1]);
    w = await m.workRecord(U.M1); expect(w).toMatchObject({ startDate: "2026-08-15", marshalNumber: "M-0001", verified: true, missing: [] }); await db.query(`UPDATE consents SET withdrawn_at = now()`); expect((await m.workRecord(U.M1)).missing).toEqual(["consent to keep payroll records"]);
    expect((await m.workRecord(U.M1, U.B)).totalTrips).toBe(0);
  });
});

describe("the income letter", () => {
  const consent = (purpose = "income_letter") => db.query(`INSERT INTO consents (user_id, purpose) VALUES ($1,$2) ON CONFLICT (user_id, purpose) DO UPDATE SET withdrawn_at = NULL`, [U.M1, purpose]);
  beforeEach(async () => { await db.query(`INSERT INTO marshal_profiles (marshal_id, marshal_number) VALUES ($1,'M-0001')`, [U.M1]); });
  it("needs the marshal's consent, a period of 3 or 6 months, and at least one issued payslip in it", async () => {
    await slip(U.M1, U.A, "2026-10-25"); expect(await m.makeLetter(U.M1, 3)).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("consent") }); await consent();
    expect(await m.makeLetter(U.M1, 4)).toMatchObject({ ok: false, status: 400 }); expect(await m.makeLetter(U.M2, 3)).toMatchObject({ ok: false, status: 403 }); await db.query(`INSERT INTO consents (user_id, purpose) VALUES ($1,'income_letter')`, [U.M2]); expect(await m.makeLetter(U.M2, 3)).toMatchObject({ ok: false, status: 409 });
    await db.query(`UPDATE consents SET withdrawn_at = now() WHERE user_id = $1`, [U.M1]); expect(await m.makeLetter(U.M1, 3)).toMatchObject({ ok: false, status: 403 });
  });
  it("summarises issued and paid payslips by month, never drafts or revised ones, with totals and what the system recorded", async () => {
    await consent(); await slip(U.M1, U.A, "2026-10-04", { gross: 40000, ded: 5000, trips: 100 }); await slip(U.M1, U.A, "2026-10-25", { gross: 30000, ded: 0, trips: 75, status: "paid" }); await slip(U.M1, U.A, "2026-09-20", { gross: 10000, ded: 1000, trips: 25 });
    await slip(U.M1, U.A, "2026-10-18", { gross: 99999, status: "draft" }); await slip(U.M1, U.A, "2026-10-19", { gross: 88888, status: "revised" }); await slip(U.M1, U.A, "2025-01-01", { gross: 77777 });
    const l = ok<any>(await m.makeLetter(U.M1, 3)); expect(l).toMatchObject({ number: "IL-20261102-M0001-1", monthsCovered: 3, from: "2026-08-02", to: "2026-11-02", intact: true, associations: ["Langa Taxi Association"], totals: { earnedCents: 80000, deductionsCents: 6000, netCents: 74000, trips: 200 } });
    expect(l.months).toEqual([{ month: "2026-09", payslips: 1, trips: 25, earnedCents: 10000, deductionsCents: 1000, netCents: 9000 }, { month: "2026-10", payslips: 2, trips: 175, earnedCents: 70000, deductionsCents: 5000, netCents: 65000 }]);
    expect(l.note).toContain("not a certificate of employment"); expect(l.verificationCode).toMatch(/^[0-9A-F]{12}$/); expect(ok<any>(await m.makeLetter(U.M1, 6)).number).toBe("IL-20261102-M0001-2"); expect((await m.letters(U.M1)).map((x: any) => x.months).sort()).toEqual([3, 6]);
  });
  it("can be checked by the association with its number and code, reveals no figures, and says so when the payslips behind it have since changed", async () => {
    await consent(); const p = await slip(U.M1, U.A, "2026-10-04"); const l = ok<any>(await m.makeLetter(U.M1, 3));
    expect(ok<any>(await m.verifyLetter(U.A, l.number, l.verificationCode))).toEqual({ valid: true, marshal: "Mo Marshal", number: l.number, issuedAt: l.issuedAt, from: l.from, to: l.to, intact: true });
    for (const [a, num, code] of [[U.A, l.number, "000000000000"], [U.A, "IL-nope", l.verificationCode], [U.B, l.number, l.verificationCode]] as const) expect(ok<any>(await m.verifyLetter(a, num, code))).toEqual({ valid: false });
    expect(await m.verifyLetter(U.A, 5, "x")).toMatchObject({ ok: false, status: 400 }); await db.query(`UPDATE payslips SET net_cents = 99999 WHERE id = $1`, [p]); expect(ok<any>(await m.verifyLetter(U.A, l.number, l.verificationCode.toLowerCase())).intact).toBe(false);
  });
  it("is a small PDF that carries the number, the code, the months and the totals", async () => {
    await consent(); await slip(U.M1, U.A, "2026-10-04", { gross: 40000, ded: 5000 }); const l = ok<any>(await m.makeLetter(U.M1, 3)); const pdf = await m.letterPdf(l); expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.length).toBeLessThan(40_000);
    const text = pdfText(pdf); for (const t of [l.number, l.verificationCode, "2026-10", "Proof of income", "Total over 3 months"]) expect(text).toContain(t); expect(await m.renderLetter(U.M2, l.id)).toBeNull();
  });
});

describe("the overview and patterns", () => {
  async function session(rank: string, marshal: string, at: Date, tapPax: number, depPax: number | null, cents = tapPax * 1500) {
    const dep = await departure(marshal, rank, at, depPax); await db.query(`INSERT INTO loading_sessions (terminal_id, rank_id, vehicle_id, marshal_id, status, passengers, total_cents, paired_at, departure_id) VALUES ($1,$2,$3,$4,'closed',$5,$6,$7,$8)`, [T1, rank, V1, marshal, tapPax, cents, at, dep]);
  }
  it("estimates the cash share from what a departure counted against what was tapped, over enough passengers to mean something, and labels it an estimate", async () => {
    await session(R1, U.M1, sa("2026-10-27", 7), 10, 15); await session(R1, U.M1, sa("2026-10-27", 9), 12, 15); await session(R1, U.M1, sa("2026-10-27", 11), 14, null);                // no count: left out
    const r = await m.cashShare(U.A, sa("2026-10-26", 0), sa("2026-11-02", 0)); expect(r).toEqual([{ rankId: R1, rank: "Langa", tapPassengers: 22, cashEstimate: 8, sample: 30 }]);
    expect(await m.cashShare(U.B, sa("2026-10-26", 0), sa("2026-11-02", 0))).toEqual([]);
  });
  it("flags a rank whose cash share this week is well above its own four-week average, with the figures, and not a thin or flat one", async () => {
    for (let i = 0; i < 6; i++) await session(R1, U.M1, sa(`2026-10-${10 + i}`, 7), 9, 10);                                    // the base: about 10% cash over 60 passengers
    for (let i = 0; i < 4; i++) await session(R1, U.M1, sa(`2026-10-${28 + (i % 3)}`, 7 + i), 6, 10);                          // this week: 40% cash over 40
    expect(await m.patterns(U.A, "2026-11-02")).toEqual([{ rank: "Langa", kind: "cash_share_up", message: "Cash share at Langa is 30 points above its 4-week average", nowPercent: 40, basePercent: 10, passengers: 40 }]);
    expect(await m.patterns(U.B, "2026-11-02")).toEqual([]); expect(await m.patterns(U.A, "2026-10-20")).toEqual([]);                                                            // the base is empty then
  });
  it("flags a rise of exactly 12 points but not 11, so the line is where it says it is", async () => {
    const base = async () => { for (let i = 0; i < 6; i++) await session(R1, U.M1, sa(`2026-10-${10 + i}`, 7), 9, 10); };                                       // 10% cash over 60 passengers
    await base(); for (let i = 0; i < 5; i++) await session(R1, U.M1, sa(`2026-10-${27 + i}`, 7), i < 4 ? 8 : 7, 10);                                           // 11 cash over 50 = 22%: 12 points up
    expect((await m.patterns(U.A, "2026-11-02")).map((p) => [p.nowPercent, p.basePercent])).toEqual([[22, 10]]);
    await db.query(`DELETE FROM loading_sessions WHERE paired_at >= $1`, [sa("2026-10-26", 0)]); await db.query(`DELETE FROM departures WHERE departed_at >= $1`, [sa("2026-10-26", 0)]);
    for (let i = 0; i < 10; i++) await session(R1, U.M1, sa(`2026-10-${27 + (i % 5)}`, 7 + (i % 3)), i < 9 ? 8 : 7, 10);                                        // 21 cash over 100 = 21%: 11 points up
    expect(await m.patterns(U.A, "2026-11-02")).toEqual([]);
  });
  it("never counts a negative amount of cash when more were tapped than were counted at departure", async () => {
    await session(R1, U.M1, sa("2026-10-27", 7), 12, 10); await session(R1, U.M1, sa("2026-10-27", 9), 5, 10);
    expect(await m.cashShare(U.A, sa("2026-10-26", 0), sa("2026-11-02", 0))).toEqual([{ rankId: R1, rank: "Langa", tapPassengers: 17, cashEstimate: 5, sample: 22 }]);                // 0 for the first (not -2), 5 for the second
  });
  it("does not flag a rank with too few passengers or a small change", async () => {
    for (let i = 0; i < 6; i++) await session(R1, U.M1, sa(`2026-10-${10 + i}`, 7), 9, 10); for (let i = 0; i < 4; i++) await session(R1, U.M1, sa(`2026-10-${28 + (i % 3)}`, 7 + i), 9, 10);
    expect(await m.patterns(U.A, "2026-11-02")).toEqual([]); await db.query(`DELETE FROM loading_sessions WHERE paired_at >= $1`, [sa("2026-10-26", 0)]); await session(R1, U.M1, sa("2026-10-29", 7), 1, 10); expect(await m.patterns(U.A, "2026-11-02")).toEqual([]);                   // 10 passengers: too few
  });
  it("gives the association's overview: fares, trips, tap share, commission, queries, incidents, average shift and verified profiles, filtered by rank or marshal", async () => {
    await session(R1, U.M1, sa("2026-10-27", 7), 10, 12, 15000); await session(R2, U.M1, sa("2026-10-27", 9), 5, 5, 7500); await session(R1, U.M2, sa("2026-10-28", 9), 6, 8, 9000); await session(RB, U.MB, sa("2026-10-28", 9), 6, 8, 99999);
    await slip(U.M1, U.A, "2026-10-30", { gross: 8000, status: "paid" }); await slip(U.M1, U.A, "2026-10-31", { gross: 4000 }); await slip(U.M2, U.A, "2026-10-31", { gross: 2000, status: "draft" });
    await db.query(`INSERT INTO disputes (association_id, raised_by, raised_role, target_type, target_id, message, status) VALUES ($1,$2,'marshal','trip',$3,'x','open'),($1,$2,'marshal','trip',$3,'y','upheld')`, [U.A, U.M1, id(900)]).catch(() => undefined);
    await m.reportIncident(U.M1, { rankId: R1, type: "threat", occurredAt: "2026-10-29T06:00:00Z" }); ok(await m.addShift(U.M1, { rankId: R1, startedAt: sa("2026-10-27", 6).toISOString(), endedAt: sa("2026-10-27", 12).toISOString(), breakMinutes: 30, note: "Morning" }));
    const k = ok<any>(await m.kpis(U.A, "2026-10-26", "2026-11-01")); expect(k).toMatchObject({ totalFaresCents: 31500, trips: 3, tapPassengers: 21, cashPassengersEstimate: 4, tapSharePercent: 84, commissionPaidCents: 8000, commissionIssuedCents: 12000, payslipsIssued: 2, incidents: 1, averageShiftMinutes: 330, marshals: 2, verifiedProfiles: 0 });
    expect(ok<any>(await m.kpis(U.A, "2026-10-26", "2026-11-01", { rankId: R2 }))).toMatchObject({ totalFaresCents: 7500, trips: 1, tapSharePercent: 100, incidents: 0 }); expect(ok<any>(await m.kpis(U.A, "2026-10-26", "2026-11-01", { marshalId: U.M2 }))).toMatchObject({ totalFaresCents: 9000, trips: 1, commissionIssuedCents: 0 });
    expect(ok<any>(await m.kpis(U.B, "2026-10-26", "2026-11-01")).totalFaresCents).toBe(99999); expect(await m.kpis(U.A, "2026-11-02", "2026-10-26")).toMatchObject({ ok: false, status: 400 });
  });
  it("says there is no tap share when no passengers were counted, and exports the overview as a small PDF", async () => {
    const k = ok<any>(await m.kpis(U.A, "2026-10-26", "2026-11-01")); expect(k).toMatchObject({ totalFaresCents: 0, tapSharePercent: null, averageShiftMinutes: null }); const pdf = await m.kpisPdf(U.A, k); expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.length).toBeLessThan(30_000);
    expect(pdfText(pdf)).toContain("Langa Taxi Association: marshal overview"); expect(pdfText(pdf)).toContain("not enough passenger counts");
  });
});
