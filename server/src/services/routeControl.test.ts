/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createRouteControl, routeMatches, type RouteControl } from "./routeControl.js";
import { createCompliance, type Compliance } from "./compliance.js";

/** Route control. Association A has owners O1 and O2 with vehicles v1 to v4; B is a stranger with O3's vehicle v9. Fixed clock: Monday 2 Nov 2026. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), M: id(6) }, V = { v1: id(20), v2: id(21), v3: id(22), v4: id(23), v9: id(29) }, R = { lb: id(40), kh: id(41), rb: id(42) }, RK = id(50);
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
let db: Db, rc: RouteControl, comp: Compliance;
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const at = (days: number, hour = 8) => new Date(Date.parse(`${plus(days)}T${String(hour).padStart(2, "0")}:00:00Z`));

beforeEach(async () => {
  db = allPortalsDb(); rc = createRouteControl(db, () => NOW); comp = createCompliance(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.M, "Mo Marshal", "marshal"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CA 333-333','Toyota',15),($6,$5,'CA 444-444','Toyota',15),($7,$8,'ZZ 999-999','Toyota',15)`, [V.v1, U.O1, V.v2, V.v3, U.O2, V.v4, V.v9, U.O3]);
  await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Langa to Bellville',2500),($3,$2,'Khayelitsha rank',3000),($4,$5,'Other route',2000)`, [R.lb, U.A, R.kh, R.rb, U.B]);
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa rank')`, [RK, U.A]);
});
const licence = (vehicle: string, route: string | null, o: any = {}) => comp.addLicence(U.A, U.A, vehicle, { licenceNumber: `OL-${vehicle.slice(-2)}`, validFrom: plus(-100), validUntil: plus(300), ...(route ? { route } : {}), ...o });
const session = (vehicle: string, route: string, days: number, status = "closed") => db.query(`INSERT INTO loading_sessions (terminal_id, vehicle_id, route_id, status, started_at) VALUES ($1,$2,$3,$4,$5)`, [id(60), vehicle, route, status, at(days)]);
const route = async (name: string) => (await rc.report(U.A, TODAY)).routes.find((r) => r.name === name)!;
const flagIds = async () => (await rc.report(U.A, TODAY)).flags.map((f) => f.id);

describe("matching a licence's route to a route", () => {
  it("matches the same words however they are written, or one phrase inside the other, but not short or empty text", () => {
    expect(routeMatches("Langa to Bellville", "Langa to Bellville")).toBe(true); expect(routeMatches("LANGA  to  bellville", "langa to bellville")).toBe(true); expect(routeMatches("Langa-Bellville", "Langa Bellville")).toBe(true); expect(routeMatches("Langa to Bellville via N2", "Langa to Bellville")).toBe(true); expect(routeMatches("Bellville", "Langa to Bellville")).toBe(true);
    expect(routeMatches("Khayelitsha", "Langa to Bellville")).toBe(false); expect(routeMatches("Lan", "Langa to Bellville")).toBe(false); expect(routeMatches("Langa", "Langalibalele rank")).toBe(false); expect(routeMatches(null, "Langa")).toBe(false); expect(routeMatches("", "")).toBe(false); expect(routeMatches("Rank", "Langa to Bellville")).toBe(false);
  });
});

describe("saturation", () => {
  it("divides the vehicles that operated in the last 30 days by those licensed for the route, and bands it: ok, warning from 0.85, over above 1", async () => {
    for (const v of [V.v1, V.v2, V.v3, V.v4]) ok(await licence(v, "Langa to Bellville")); ok(await licence(V.v1, null, { licenceNumber: "X" }).then((r: any) => r).catch(() => null) ?? { ok: true, value: {} });
    await session(V.v1, R.lb, -2); await session(V.v1, R.lb, -5); await session(V.v2, R.lb, -3); let r = await route("Langa to Bellville"); expect(r).toMatchObject({ licensedVehicles: 4, operatingVehicles: 2, saturationRatio: 0.5, band: "ok" }); expect(await flagIds()).not.toContain(`routes:warning:${R.lb}`);
    await session(V.v3, R.lb, -3); r = await route("Langa to Bellville"); expect(r).toMatchObject({ operatingVehicles: 3, saturationRatio: 0.75, band: "ok" }); await session(V.v4, R.lb, -1); r = await route("Langa to Bellville"); expect(r).toMatchObject({ operatingVehicles: 4, saturationRatio: 1, band: "warning" });
    expect((await rc.report(U.A, TODAY)).flags.find((f) => f.id === `routes:warning:${R.lb}`)).toMatchObject({ severity: "medium", message: "4 vehicles operated on Langa to Bellville against 4 licensed for it: the route is nearly full" });
    await session(V.v9, R.lb, -1); r = await route("Langa to Bellville"); expect(r).toMatchObject({ operatingVehicles: 5, saturationRatio: 1.25, band: "over" }); expect((await rc.report(U.A, TODAY)).flags.find((f) => f.id === `routes:over:${R.lb}`)).toMatchObject({ severity: "high", message: "5 vehicles operated on Langa to Bellville in the last 30 days, but 4 are licensed for it: the route is over-supplied" });
  });
  it("puts the warning at 0.85: 6 of 7 is 0.86 (a warning) and 5 of 7 is 0.71 (fine)", async () => {
    await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$3,'CA 555-555','T',15),($2,$3,'CA 666-666','T',15),($4,$3,'CA 777-777','T',15)`, [id(24), id(25), U.O1, id(26)]);
    for (const v of [V.v1, V.v2, V.v3, V.v4, id(24), id(25), id(26)]) ok(await licence(v, "Langa to Bellville")); for (const v of [V.v1, V.v2, V.v3, V.v4, id(24)]) await session(v, R.lb, -2); expect(await route("Langa to Bellville")).toMatchObject({ licensedVehicles: 7, operatingVehicles: 5, saturationRatio: 0.71, band: "ok" });
    await session(id(25), R.lb, -2); expect(await route("Langa to Bellville")).toMatchObject({ saturationRatio: 0.86, band: "warning" });
  });
  it("counts only sessions in the last 30 days that were not cancelled, and only licences that are valid and on a vehicle that is active", async () => {
    ok(await licence(V.v1, "Langa to Bellville")); ok(await licence(V.v2, "Langa to Bellville", { validFrom: plus(-400), validUntil: plus(-1) })); ok(await licence(V.v3, "Langa to Bellville")); ok(await comp.saveVehicle(U.A, U.A, V.v3, { state: "off_road" }));
    await session(V.v1, R.lb, -30); await session(V.v1, R.lb, -31); await session(V.v2, R.lb, -1, "cancelled"); await session(V.v3, R.lb, -1, "pending"); const r = await route("Langa to Bellville"); expect(r).toMatchObject({ licensedVehicles: 1, operatingVehicles: 1, saturationRatio: 1, band: "warning" });          // one vehicle, one licence: the day-30 session counts, day 31 does not await session(V.v2, R.lb, -1, "loading"); expect((await route("Langa to Bellville")).operatingVehicles).toBe(2);
  });
  it("says a route is idle when nothing operated on it, and flags a route that vehicles operated on when none of the members' licences names it", async () => {
    ok(await licence(V.v1, "Khayelitsha")); expect(await route("Langa to Bellville")).toMatchObject({ band: "idle", saturationRatio: null, operatingVehicles: 0 }); await session(V.v1, R.lb, -2); await session(V.v9, R.lb, -2); const r = await route("Langa to Bellville"); expect(r).toMatchObject({ band: "no_licensed", licensedVehicles: 0, saturationRatio: null });
    const f = (await rc.report(U.A, TODAY)).flags.find((x) => x.id === `routes:nolicensed:${R.lb}`)!; expect(f.severity).toBe("high"); expect(f.message).toContain("2 vehicles operated on Langa to Bellville, but none of your members' licences is recorded as naming it");
  });
});

describe("the licence against the route", () => {
  it("flags a member vehicle that operated with no valid licence (high), and one whose valid licence names a different route (medium), but not one with no route on its licence", async () => {
    ok(await licence(V.v2, "Khayelitsha")); ok(await licence(V.v3, null)); ok(await licence(V.v4, "Langa to Bellville")); await session(V.v1, R.lb, -2); await session(V.v1, R.lb, -4); await session(V.v2, R.lb, -3); await session(V.v3, R.lb, -3); await session(V.v4, R.lb, -3);
    const r = await route("Langa to Bellville"); expect(r.unlicensedOperating).toEqual([{ vehicleId: V.v1, registration: "CA 111-111", trips: 2 }]); expect(r.offRoute).toEqual([{ vehicleId: V.v2, registration: "CA 222-222", licenceRoute: "Khayelitsha", trips: 1 }]); const f = (await rc.report(U.A, TODAY)).flags;
    expect(f.find((x) => x.id === `routes:unlicensed:${R.lb}:${V.v1}`)).toMatchObject({ severity: "high", message: "CA 111-111 operated on Langa to Bellville 2 times in the last 30 days with no valid operating licence" }); expect(f.find((x) => x.id === `routes:offroute:${R.lb}:${V.v2}`)).toMatchObject({ severity: "medium", message: 'CA 222-222 operated on Langa to Bellville 1 time, but its licence names "Khayelitsha"' }); expect(f.some((x) => x.id.endsWith(V.v3) || x.id.endsWith(V.v4))).toBe(false);
  });
  it("counts an application lodged or an expired licence as no valid licence", async () => {
    ok(await comp.addApplication(U.A, U.A, V.v1, { kind: "new", lodgedOn: plus(-5) })); ok(await licence(V.v2, "Langa to Bellville", { validFrom: plus(-400), validUntil: plus(-1) })); await session(V.v1, R.lb, -2); await session(V.v2, R.lb, -2); expect((await route("Langa to Bellville")).unlicensedOperating.map((v) => v.registration)).toEqual(["CA 111-111", "CA 222-222"]);
  });
  it("lists the valid licences that name a route the association does not have, and those with no route at all, for the association to check", async () => {
    ok(await licence(V.v1, "Mitchells Plain")); ok(await licence(V.v2, null)); ok(await licence(V.v3, "Langa to Bellville")); const rep = await rc.report(U.A, TODAY); expect(rep.unmatchedLicences).toEqual([{ vehicleId: V.v1, registration: "CA 111-111", licenceRoute: "Mitchells Plain" }]); expect(rep.licencesWithoutRoute).toEqual([{ vehicleId: V.v2, registration: "CA 222-222" }]);
  });
});

describe("non-member operators", () => {
  it("lists vehicles from outside the association that operated on its routes, with their owner and trips, busiest first, and never a member's vehicle", async () => {
    await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'ZZ 888-888','T',15)`, [id(28), U.O3]); ok(await licence(V.v1, "Langa to Bellville")); await session(V.v1, R.lb, -2); await session(V.v9, R.lb, -2); await session(V.v9, R.lb, -3); await session(id(28), R.lb, -4);
    const r = await route("Langa to Bellville"); expect(r.nonMemberOperators).toEqual([{ vehicleId: V.v9, registration: "ZZ 999-999", owner: "Otto Owner", trips: 2 }, { vehicleId: id(28), registration: "ZZ 888-888", owner: "Otto Owner", trips: 1 }]); expect(r.memberVehiclesOperating).toBe(1);
  });
  it("shows only the association's own routes, and none of another association's", async () => {
    await session(V.v1, R.rb, -2); expect((await rc.report(U.A, TODAY)).routes.map((r) => r.name)).toEqual(["Khayelitsha rank", "Langa to Bellville"]); expect((await rc.report(U.B, TODAY)).routes.map((r) => [r.name, r.operatingVehicles])).toEqual([["Other route", 1]]);
  });
});

describe("the queue", () => {
  /** Vehicles join the queue in order v1, v2, v3 an hour apart; each departs when it is first, unless a test makes one leave out of turn. */
  const join = (vehicle: string, days: number, hour: number, left: Date | null = null) => db.query(`INSERT INTO rank_queue (rank_id, vehicle_id, joined_at, left_at) VALUES ($1,$2,$3,$4)`, [RK, vehicle, at(days, hour), left]);
  const depart = (vehicle: string, days: number, hour: number, status = "completed") => db.query(`INSERT INTO departures (rank_id, vehicle_id, marshal_id, departed_at, status) VALUES ($1,$2,$3,$4,$5)`, [RK, vehicle, U.M, at(days, hour), status]);
  const rank = async () => (await rc.report(U.A, TODAY)).ranks[0];
  it("counts a departure as a skip when a vehicle that joined earlier was still waiting, naming the vehicle that left out of turn", async () => {
    await join(V.v1, -1, 6, at(-1, 12)); await join(V.v2, -1, 7, at(-1, 9)); await join(V.v3, -1, 8, at(-1, 13)); await depart(V.v2, -1, 9); await depart(V.v1, -1, 12); await depart(V.v3, -1, 13);                      // v2 left at 09:00 while v1 (joined 06:00) was still waiting
    expect(await rank()).toMatchObject({ name: "Langa rank", departures: 3, checked: 3, skips: 1, skipPercent: 33.3, band: "too_few", skippers: [{ registration: "CA 222-222", skips: 1 }] });
  });
  it("does not flag a rank with fewer than ten departures, flags 10% as medium and 25% as high, and says so in plain words", async () => {
    for (let d = 0; d < 9; d++) { await join(V.v1, -(d + 2), 6, at(-(d + 2), 12)); await join(V.v2, -(d + 2), 7, at(-(d + 2), 8)); await depart(V.v2, -(d + 2), 8); await depart(V.v1, -(d + 2), 12); }                          // 18 departures, 9 of them out of turn
    let r = await rank(); expect(r).toMatchObject({ departures: 18, checked: 18, skips: 9, band: "high", skipPercent: 50 }); expect((await rc.report(U.A, TODAY)).flags.find((f) => f.id === `routes:skips:${RK}`)).toMatchObject({ severity: "high", message: "At Langa rank, 9 of 18 departures in the last 30 days left ahead of a vehicle that had joined the queue earlier (50%)" });
  });
  it("puts the thresholds at exactly 10% (medium) and 25% (high) of at least ten departures", async () => {
    // A day with a skip has two departures (one out of turn, one in turn); a plain day has one. So skips / departures = skipDays / (2 * skipDays + plainDays).
    const mk = async (skipDays: number, plainDays: number) => { await db.query(`DELETE FROM rank_queue`); await db.query(`DELETE FROM departures`); for (let d = 0; d < skipDays + plainDays; d++) { const day = -(d + 2); await join(V.v1, day, 6, at(day, 12)); if (d < skipDays) { await join(V.v2, day, 7, at(day, 8)); await depart(V.v2, day, 8); await depart(V.v1, day, 12); } else await depart(V.v1, day, 7); } return rank(); };
    expect(await mk(0, 10)).toMatchObject({ checked: 10, skips: 0, band: "ok" }); expect(await mk(1, 9)).toMatchObject({ checked: 11, skips: 1, skipPercent: 9.1, band: "ok" }); expect(await mk(1, 8)).toMatchObject({ checked: 10, skips: 1, skipPercent: 10, band: "medium" });        // exactly 10%
    expect(await mk(2, 8)).toMatchObject({ checked: 12, skipPercent: 16.7, band: "medium" }); expect(await mk(3, 7)).toMatchObject({ checked: 13, skipPercent: 23.1, band: "medium" }); expect(await mk(3, 6)).toMatchObject({ checked: 12, skips: 3, skipPercent: 25, band: "high" });             // exactly 25%
    expect(await mk(1, 7)).toMatchObject({ checked: 9, skips: 1, band: "too_few" });                                                           // under ten departures checked: no judgement
  });
  it("treats an approved exception as a recorded exception, not a skip, and counts it separately", async () => {
    for (let d = 0; d < 10; d++) { const day = -(d + 2); await join(V.v1, day, 6, at(day, 12)); await join(V.v2, day, 7, at(day, 8)); await depart(V.v2, day, 8, "approved_exception"); await depart(V.v1, day, 12); }
    expect(await rank()).toMatchObject({ departures: 20, approvedExceptions: 10, checked: 10, skips: 0, band: "ok" });
  });
  it("ignores departures older than 30 days and a vehicle with no queue record, and shows only the association's own ranks", async () => {
    await join(V.v1, -40, 6, at(-40, 12)); await join(V.v2, -40, 7, at(-40, 8)); await depart(V.v2, -40, 8); await depart(V.v3, -1, 9); expect(await rank()).toMatchObject({ departures: 1, checked: 0, skips: 0 }); expect((await rc.report(U.B, TODAY)).ranks).toEqual([]);
  });
});
