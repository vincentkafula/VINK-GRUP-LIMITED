/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createSafety, type Safety } from "./safety.js";

/** Safety and conflict. Association A has owners O1 and O2 (vehicles v1, v2; driver D1 works for O1); B is a stranger with O3 (vehicle v4, driver D2). Fixed clock: Monday 2 Nov 2026. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7) }, V = { v1: id(20), v2: id(21), v4: id(23) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
let db: Db, s: Safety;
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  db = allPortalsDb(); s = createSafety(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dan Driver", "driver"], [U.D2, "Dee Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner'),($3,$4,'active','owner')`, [U.O1, U.D1, U.O3, U.D2]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats, driver_id) VALUES ($1,$2,'CA 111-111','Toyota',15,$3),($4,$5,'CA 222-222','Toyota',15,NULL),($6,$7,'CB 444-444','Toyota',15,NULL)`, [V.v1, U.O1, U.D1, V.v2, U.O2, V.v4, U.O3]);
});
const ev = (o: any = {}) => s.add(U.A, U.A, { kind: "accident", occurredOn: plus(-3), title: "Collision at the rank exit", description: "Two vehicles, no injuries", vehicleId: V.v1, driverId: U.D1, routeLabel: "Langa to Bellville", ...o });
const flagIds = async () => (await s.summary(U.A, TODAY)).flags.map((f) => f.id);

describe("recording events", () => {
  it("records an event of a known kind with a real past date and a title, linking only the association's own vehicle and driver, and lists the newest first", async () => {
    for (const [bad, st] of [[{ kind: "brawl" }, 400], [{ occurredOn: plus(1) }, 400], [{ occurredOn: "soon" }, 400], [{ title: "" }, 400], [{ description: "x".repeat(2100) }, 400], [{ vehicleId: V.v4 }, 400], [{ driverId: U.D2 }, 400], [{ vehicleId: "nope" }, 400], [{ policeCaseNumber: "x".repeat(60) }, 400]] as const) expect(await ev(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    ok(await ev({ occurredOn: plus(-20), title: "Older" })); ok(await ev({ kind: "passenger_complaint", title: "Rude driver", vehicleId: null, driverId: null })); const l = await s.events(U.A, {}, TODAY);
    expect(l.map((e) => [e.title, e.vehicle, e.driver])).toEqual([["Rude driver", null, null], ["Older", "CA 111-111", "Dan Driver"]]);                  // newest first, each with the vehicle and driver it names
    expect(await s.events(U.B, {}, TODAY)).toEqual([]); expect((await s.events(U.A, { kind: "passenger_complaint" }, TODAY)).map((e) => e.title)).toEqual(["Rude driver"]); expect((await s.events(U.A, { status: "resolved" }, TODAY))).toEqual([]);
  });
  it("records injuries and deaths only for accidents, as whole numbers, and requires a dispute to name the other association", async () => {
    ok(await ev({ injuries: 3, fatalities: 1 })); for (const bad of [{ injuries: -1 }, { fatalities: 1.5 }, { injuries: 501 }, { injuries: "many" }]) expect(await ev(bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 }); expect(await ev({ kind: "passenger_complaint", injuries: 1 })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("accidents") });
    expect(await s.add(U.A, U.A, { kind: "inter_association_dispute", occurredOn: plus(-5), title: "Route border" })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("Name the other association") }); ok(await s.add(U.A, U.A, { kind: "inter_association_dispute", occurredOn: plus(-5), title: "Route border", otherAssociation: "Bellville Taxi Association", mediator: "Mr Dlamini" }));
  });
  it("gives only a regulator notice an end date, on or after it was issued", async () => {
    const n = (o: any = {}) => s.add(U.A, U.A, { kind: "regulator_notice", occurredOn: plus(-10), title: "Route closure", routeLabel: "Langa to Bellville", ...o });
    expect(await n({ noticeUntil: plus(-11) })).toMatchObject({ ok: false, status: 400 }); expect(await n({ noticeUntil: "soon" })).toMatchObject({ ok: false, status: 400 }); ok(await n({ noticeUntil: plus(5) })); expect(await ev({ noticeUntil: plus(5) })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("Only a regulator notice") });
  });
});

describe("updating, escalating and resolving", () => {
  it("adds detail to an open event, only the fields allowed, validated, and nothing once it is resolved or for another association", async () => {
    const e = ok<any>(await ev()); ok(await s.update(U.A, U.A, e.id, { policeCaseNumber: "CAS 123/10/2026", injuries: 2, description: "Two vehicles, two minor injuries" })); expect((await s.events(U.A, {}, TODAY))[0]).toMatchObject({ policeCaseNumber: "CAS 123/10/2026", injuries: 2, description: "Two vehicles, two minor injuries", kind: "accident", occurredOn: plus(-3) });
    for (const bad of [{ injuries: -1 }, { fatalities: 2.5 }, { description: "x".repeat(2100) }, { noticeUntil: plus(3) }, {}]) expect(await s.update(U.A, U.A, e.id, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await s.update(U.B, U.B, e.id, { mediator: "x" })).toMatchObject({ ok: false, status: 404 }); expect(await s.update(U.A, U.A, id(99), { mediator: "x" })).toMatchObject({ ok: false, status: 404 }); ok(await s.resolve(U.A, U.A, e.id, { resolvedOn: TODAY, resolution: "Insurance claim settled" })); expect(await s.update(U.A, U.A, e.id, { mediator: "x" })).toMatchObject({ ok: false, status: 409 });
    const c = ok<any>(await ev({ kind: "passenger_complaint", title: "Complaint" })); expect(await s.update(U.A, U.A, c.id, { injuries: 1 })).toMatchObject({ ok: false, status: 400 }); ok(await s.update(U.A, U.A, c.id, { injuries: 0 })); const d = ok<any>(await s.add(U.A, U.A, { kind: "inter_association_dispute", occurredOn: plus(-5), title: "Border", otherAssociation: "Other Assoc" })); expect(await s.update(U.A, U.A, d.id, { otherAssociation: "" })).toMatchObject({ ok: false, status: 400 });
  });
  it("escalates only a dispute with another association, to a known body, on a date after it began and not in the future, and may name the mediator", async () => {
    const d = ok<any>(await s.add(U.A, U.A, { kind: "inter_association_dispute", occurredOn: plus(-20), title: "Border", otherAssociation: "Bellville TA" })), a = ok<any>(await ev());
    expect(await s.escalate(U.A, U.A, a.id, { to: "santaco", on: TODAY })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Only a dispute") }); for (const bad of [{ to: "the mayor", on: TODAY }, { to: "santaco", on: plus(-21) }, { to: "santaco", on: plus(1) }, { to: "santaco", on: "soon" }, { to: "santaco", on: TODAY, mediator: "x".repeat(200) }]) expect(await s.escalate(U.A, U.A, d.id, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await s.escalate(U.A, U.A, d.id, { to: "santaco", on: plus(-10), mediator: "SANTACO regional chair" })); expect((await s.events(U.A, {}, TODAY)).find((e) => e.id === d.id)).toMatchObject({ escalatedTo: "santaco", escalatedOn: plus(-10), mediator: "SANTACO regional chair" }); ok(await s.escalate(U.A, U.A, d.id, { to: "national_taxi_alliance", on: plus(-2) })); expect((await s.events(U.A, {}, TODAY)).find((e) => e.id === d.id)).toMatchObject({ escalatedTo: "national_taxi_alliance", mediator: "SANTACO regional chair" });
    expect(await s.escalate(U.B, U.B, d.id, { to: "santaco", on: TODAY })).toMatchObject({ ok: false, status: 404 }); ok(await s.resolve(U.A, U.A, d.id, { resolvedOn: TODAY, resolution: "Agreed a border" })); expect(await s.escalate(U.A, U.A, d.id, { to: "santaco", on: TODAY })).toMatchObject({ ok: false, status: 409 });
  });
  it("resolves an event once, with the date and how, after it happened and not in the future, scoped to the association", async () => {
    const e = ok<any>(await ev({ occurredOn: plus(-10) })); for (const bad of [{ resolvedOn: plus(-11), resolution: "x" }, { resolvedOn: plus(1), resolution: "x" }, { resolvedOn: "soon", resolution: "x" }, { resolvedOn: TODAY, resolution: "" }, { resolvedOn: TODAY, resolution: "x".repeat(600) }]) expect(await s.resolve(U.A, U.A, e.id, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await s.resolve(U.B, U.B, e.id, { resolvedOn: TODAY, resolution: "x" })).toMatchObject({ ok: false, status: 404 }); ok(await s.resolve(U.A, U.A, e.id, { resolvedOn: plus(-4), resolution: "Claim paid" })); expect(await s.resolve(U.A, U.A, e.id, { resolvedOn: TODAY, resolution: "again" })).toMatchObject({ ok: false, status: 409 }); expect((await s.events(U.A, {}, TODAY))[0]).toMatchObject({ status: "resolved", resolvedOn: plus(-4), resolution: "Claim paid", daysOpen: 6 });
  });
});

describe("what stands out", () => {
  it("flags a vehicle or driver with three accidents or complaints in a year (medium) and five (high), counting neither other kinds nor events over a year old", async () => {
    for (let i = 0; i < 2; i++) ok(await ev({ occurredOn: plus(-10 - i) })); expect(await flagIds()).toEqual([]); ok(await ev({ kind: "passenger_complaint", occurredOn: plus(-30), title: "Complaint" }));
    let f = (await s.summary(U.A, TODAY)).flags; expect(f.map((x) => [x.id, x.severity])).toEqual([["safety:repeat:vehicle:CA 111-111", "medium"], ["safety:repeat:driver:Dan Driver", "medium"]]); expect(f[1].message).toBe("Driver Dan Driver has 3 accidents or passenger complaints in the last 12 months");                  // equal seriousness: by name
    ok(await ev({ kind: "police_matter", title: "Police matter" })); ok(await ev({ occurredOn: plus(-366), title: "Too old" })); expect((await s.summary(U.A, TODAY)).flags.every((x) => x.severity === "medium")).toBe(true); ok(await ev({ occurredOn: plus(-365), title: "Exactly a year" })); ok(await ev({ occurredOn: plus(-50), title: "Fifth" })); f = (await s.summary(U.A, TODAY)).flags; expect(f.map((x) => x.severity)).toEqual(["high", "high"]);
  });
  it("flags a dispute open more than 30 days (medium) and 60 (high), saying whether it has been escalated, and stops when it is resolved", async () => {
    const d = ok<any>(await s.add(U.A, U.A, { kind: "inter_association_dispute", occurredOn: plus(-30), title: "Border", otherAssociation: "Bellville TA" })); const f = async () => (await s.summary(U.A, TODAY)).flags.find((x) => x.id === `safety:dispute:${d.id}`);
    expect(await f()).toBeUndefined(); const move = async (days: number) => { await db.query(`UPDATE safety_events SET occurred_on = $2 WHERE id = $1`, [d.id, plus(-days)]); return f(); };
    expect((await move(31))!.severity).toBe("medium"); expect((await move(31))!.message).toBe('The dispute with Bellville TA ("Border") has been open 31 days and has not been escalated'); expect((await move(60))!.severity).toBe("medium"); expect((await move(61))!.severity).toBe("high");
    ok(await s.escalate(U.A, U.A, d.id, { to: "santaco", on: plus(-5) })); expect((await f())!.message).toContain("escalated to santaco"); ok(await s.resolve(U.A, U.A, d.id, { resolvedOn: TODAY, resolution: "Settled" })); expect(await f()).toBeUndefined();
  });
  it("flags a police matter open more than 90 days, and a regulator notice while it is in force (through its last day), until resolved", async () => {
    const p = ok<any>(await s.add(U.A, U.A, { kind: "police_matter", occurredOn: plus(-90), title: "Theft report", policeCaseNumber: "CAS 9" })); expect(await flagIds()).not.toContain(`safety:police:${p.id}`); await db.query(`UPDATE safety_events SET occurred_on = $2 WHERE id = $1`, [p.id, plus(-91)]); expect((await s.summary(U.A, TODAY)).flags.find((x) => x.id === `safety:police:${p.id}`)).toMatchObject({ severity: "low", message: 'The police matter "Theft report" has been open 91 days (case CAS 9)' });
    const n = ok<any>(await s.add(U.A, U.A, { kind: "regulator_notice", occurredOn: plus(-5), title: "Route closure", routeLabel: "Langa to Bellville", noticeUntil: TODAY })); expect((await s.summary(U.A, TODAY)).flags.find((x) => x.id === `safety:notice:${n.id}`)).toMatchObject({ severity: "high", dueOn: TODAY, message: `A regulator notice is in force: "Route closure" (Langa to Bellville) until ${TODAY}` });
    await db.query(`UPDATE safety_events SET notice_until = $2 WHERE id = $1`, [n.id, plus(-1)]); expect(await flagIds()).not.toContain(`safety:notice:${n.id}`); await db.query(`UPDATE safety_events SET notice_until = NULL WHERE id = $1`, [n.id]); expect(await flagIds()).toContain(`safety:notice:${n.id}`); ok(await s.resolve(U.A, U.A, n.id, { resolvedOn: TODAY, resolution: "Lifted" })); expect(await flagIds()).not.toContain(`safety:notice:${n.id}`);
  });
  it("flags a route with at least three incidents in 30 days that are more than double the 30 days before, whatever the capital letters or spacing of its name", async () => {
    const at = async (n: number, days: number, label: string) => { for (let i = 0; i < n; i++) ok(await ev({ occurredOn: plus(-days - i), title: `E ${label} ${days} ${i}`, routeLabel: label, vehicleId: null, driverId: null })); };
    await at(2, 5, "Langa to Bellville"); expect(await flagIds()).not.toContain("safety:spike:langa to bellville"); await at(1, 8, "LANGA  to bellville"); const f = (await s.summary(U.A, TODAY)).flags.find((x) => x.id === "safety:spike:langa to bellville")!; expect(f.message).toBe("3 incidents on Langa to Bellville in the last 30 days, against 0 in the 30 days before"); expect(f.severity).toBe("medium");
    await at(2, 40, "langa to bellville"); expect(await flagIds()).not.toContain("safety:spike:langa to bellville");                                                             // 3 against 2 is not more than double
    await at(3, 12, "Khayelitsha rank"); await at(1, 45, "Khayelitsha rank"); expect(await flagIds()).toContain("safety:spike:khayelitsha rank");
  });
  it("reports the year's figures: events by kind, injuries and deaths, how many are open and escalated, the notices in force, and the average days to resolve", async () => {
    ok(await ev({ injuries: 2, fatalities: 1 })); const a = ok<any>(await ev({ occurredOn: plus(-20), injuries: 1, title: "Second" })); ok(await ev({ kind: "passenger_complaint", title: "Complaint" })); const d = ok<any>(await s.add(U.A, U.A, { kind: "inter_association_dispute", occurredOn: plus(-40), title: "Border", otherAssociation: "X" })); ok(await s.escalate(U.A, U.A, d.id, { to: "santaco", on: plus(-10) }));
    ok(await s.add(U.A, U.A, { kind: "regulator_notice", occurredOn: plus(-2), title: "Warning" })); ok(await ev({ occurredOn: plus(-400), title: "Old", injuries: 9 })); ok(await s.resolve(U.A, U.A, a.id, { resolvedOn: plus(-10), resolution: "Settled" })); ok(await s.resolve(U.A, U.A, d.id, { resolvedOn: plus(-30), resolution: "Agreed" }));
    expect((await s.summary(U.A, TODAY)).measures).toEqual({ accidents: 2, injuries: 3, fatalities: 1, passengerComplaints: 1, disputes: 1, policeMatters: 0, regulatorNotices: 1, open: 4, escalated: 1, averageDaysToResolve: 10, noticesInForce: 1 }); expect((await s.summary(U.B, TODAY)).measures).toMatchObject({ accidents: 0, open: 0, averageDaysToResolve: null });
  });
});
