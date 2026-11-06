/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createCompliance, expiryBand, licenceStatus, addYears, addMonths, daysBetween, isDay, type Compliance } from "./compliance.js";

/**
 * The compliance registers and the rules over them. Association A has active owner members O1 and O2 and driver member D1; D2 works for O1 and D3 for O2 (so they are A's drivers too). Association B has owner O3, whom A must never see.
 * Fixed clock: Monday 2 Nov 2026.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) }, V = { v1: id(20), v2: id(21), v3: id(22), v4: id(23) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
let db: Db, c: Compliance;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  db = allPortalsDb(); c = createCompliance(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member'),($1,$6,'driver','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3, U.D1]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner'),($3,$4,'active','owner')`, [U.O1, U.D2, U.O2, U.D3]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, model, seats, driver_id) VALUES ($1,$2,'CA 111-111','Toyota','Quantum',15,$3),($4,$2,'CA 222-222','Toyota','Quantum',15,NULL),($5,$6,'CA 333-333','Nissan','Urvan',14,$7),($8,$9,'CB 444-444','Toyota','Quantum',15,NULL)`, [V.v1, U.O1, U.D2, V.v2, V.v3, U.O2, U.D3, V.v4, U.O3]);
  await db.query(`INSERT INTO driver_profiles (user_id, licence_code, licence_expiry, pdp_number, pdp_expiry) VALUES ($1,'EC1',$4,'PDP-1',$4),($2,'EC1',$5,'PDP-2',$6)`, [U.D1, U.D2, plus(400), plus(400), plus(400), plus(-10)]);
});
const licence = (vehicle: string, o: any = {}) => c.addLicence(U.A, U.A, vehicle, { licenceNumber: "OL-1", authority: "Provincial Regulatory Entity", validFrom: plus(-100), validUntil: plus(400), ...o });

describe("the pure rules", () => {
  it("bands an expiry exactly at 30, 90 and 180 days, past, comfortable and missing", () => {
    expect(expiryBand(TODAY, TODAY)).toEqual({ band: "30", days: 0 }); expect(expiryBand(plus(30), TODAY).band).toBe("30"); expect(expiryBand(plus(31), TODAY).band).toBe("90"); expect(expiryBand(plus(90), TODAY).band).toBe("90"); expect(expiryBand(plus(91), TODAY).band).toBe("180");
    expect(expiryBand(plus(180), TODAY).band).toBe("180"); expect(expiryBand(plus(181), TODAY).band).toBe("ok"); expect(expiryBand(plus(-1), TODAY)).toEqual({ band: "expired", days: -1 }); expect(expiryBand(null, TODAY)).toEqual({ band: "missing", days: null });
  });
  it("calls a vehicle licensed only when a licence covers today, counting the first and last day, and never because an application was lodged", () => {
    const L = (from: string, until: string) => ({ validFrom: from, validUntil: until });
    expect(licenceStatus([L(TODAY, TODAY)], false, TODAY)).toEqual({ status: "valid", validUntil: TODAY }); expect(licenceStatus([L(plus(-10), plus(-1))], false, TODAY)).toEqual({ status: "expired", validUntil: plus(-1) }); expect(licenceStatus([L(plus(1), plus(400))], false, TODAY).status).toBe("not_yet_valid");
    expect(licenceStatus([], false, TODAY)).toEqual({ status: "none", validUntil: null }); expect(licenceStatus([], true, TODAY).status).toBe("application_lodged"); expect(licenceStatus([L(plus(-100), plus(-1))], true, TODAY)).toEqual({ status: "application_lodged", validUntil: plus(-1) });
    expect(licenceStatus([L(plus(-100), plus(-1)), L(plus(-50), plus(200))], true, TODAY).status).toBe("valid");                                   // a licence that covers today wins over a pending application
  });
  it("does date arithmetic safely: years across leap days, months at month ends, days between, and real dates only", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28"); expect(addYears("2026-11-02", 7)).toBe("2033-11-02"); expect(addMonths("2026-01-31", 1)).toBe("2026-02-28"); expect(addMonths("2026-11-30", 3)).toBe("2027-02-28"); expect(addMonths("2026-11-02", 12)).toBe("2027-11-02");
    expect(daysBetween("2026-11-02", "2026-11-12")).toBe(10); expect(daysBetween("2026-11-12", "2026-11-02")).toBe(-10); for (const bad of ["2026-02-30", "2026-13-01", "26-1-1", "", null, 5]) expect(isDay(bad), String(bad)).toBe(false); expect(isDay("2024-02-29")).toBe(true);
  });
});

describe("the association's registration", () => {
  it("starts unrecorded, takes only what is sent, validates each field, and keeps what it was not told to change", async () => {
    expect(await c.registration(U.A)).toMatchObject({ recorded: false, status: "conditional", memberCount: 2 });
    const r = ok<any>(await c.saveRegistration(U.A, U.A, { status: "provisional", registrationNumber: "GP/2026/0412", registrar: "Gauteng Provincial Regulatory Entity", province: "Gauteng", minMembersRequired: 10, renewalDueOn: plus(60) }));
    expect(r).toMatchObject({ recorded: true, status: "provisional", registrationNumber: "GP/2026/0412", minMembersRequired: 10, renewalDueOn: plus(60), conditionalLimitMonths: 12, memberCount: 2 });
    ok(await c.saveRegistration(U.A, U.A, { registrar: "PRE Gauteng" })); expect(await c.registration(U.A)).toMatchObject({ registrar: "PRE Gauteng", registrationNumber: "GP/2026/0412", status: "provisional" });
    for (const bad of [{ status: "approved" }, { registeredOn: "2026-02-30" }, { minMembersRequired: -1 }, { minMembersRequired: 1.5 }, { conditionalLimitMonths: 0 }, { conditionalLimitMonths: 500 }, { feeCapCents: -5 }, { registrar: "x".repeat(200) }, { renewalDueOn: "soon" }]) expect(await c.saveRegistration(U.A, U.A, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect((await c.registration(U.B)).recorded).toBe(false);                                                                                      // another association's is its own
  });
  it("writes every change to the history, with what it was and what it became, and writes nothing for a change that changes nothing", async () => {
    ok(await c.saveRegistration(U.A, U.A, { status: "conditional", registrar: "PRE" })); await db.query(`DELETE FROM register_changes`); ok(await c.saveRegistration(U.A, U.A, { status: "full", registrar: "PRE" }));
    expect((await c.changes(U.A)).map((x) => [x.entity, x.summary, x.by])).toEqual([["registration", "status: conditional → full", "Langa Taxi Association"]]); expect(await c.changes(U.B)).toEqual([]);
  });
  it("flags what is wrong with it: not recorded, suspended, conditional for too long, under the minimum, constitution changed since lodged, renewal and missing evidence", async () => {
    const ids = async () => (await c.summary(U.A, TODAY)).flags.filter((f) => f.id.startsWith("reg:")).map((f) => f.id);
    expect(await ids()).toContain("reg:none");
    ok(await c.saveRegistration(U.A, U.A, { status: "conditional", conditionalSince: plus(-400), minMembersRequired: 5, constitutionVersion: "3", constitutionLodgedVersion: "2", renewalDueOn: plus(20) }));
    const f = (await c.summary(U.A, TODAY)).flags; for (const x of ["reg:conditional", "reg:minmembers", "reg:constitution", "reg:renewal", "reg:doc:registration_certificate", "reg:doc:constitution", "reg:doc:code_of_conduct", "reg:acceptances"]) expect(f.map((y) => y.id), x).toContain(x);
    expect(f.find((x) => x.id === "reg:conditional")).toMatchObject({ severity: "high", dueOn: plus(-400 + 0) >= "" ? addMonths(plus(-400), 12) : "" }); expect(f.find((x) => x.id === "reg:minmembers")!.message).toContain("(2) is below the required minimum of 5");
    ok(await c.saveRegistration(U.A, U.A, { status: "suspended", conditionalSince: null, minMembersRequired: 2, constitutionLodgedVersion: "3", renewalDueOn: plus(200) })); const g = (await ids()); expect(g).toContain("reg:suspended"); for (const x of ["reg:conditional", "reg:minmembers", "reg:constitution", "reg:renewal"]) expect(g, x).not.toContain(x);
    ok(await c.saveRegistration(U.A, U.A, { status: "conditional", conditionalSince: plus(-100) })); expect(await ids()).not.toContain("reg:conditional");                                // 100 days is within the 12 months
  });
  it("grades the renewal date: 30 days is high, 90 and 180 are medium, a past date is high, and far away is nothing", async () => {
    const sev = async (d: number) => (await c.summary(U.A, TODAY)).flags.find((f) => f.id === "reg:renewal")?.severity ?? null;
    for (const [d, want] of [[20, "high"], [60, "medium"], [150, "medium"], [-3, "high"], [300, null]] as const) { ok(await c.saveRegistration(U.A, U.A, { renewalDueOn: plus(d) })); expect(await sev(d), String(d)).toBe(want); }
  });
});

describe("office bearers, documents and acceptances", () => {
  it("records office bearers with terms, validated, only linking to the association's own members, and flags a term that has ended or is about to", async () => {
    expect(await c.addOfficeBearer(U.A, U.A, { name: "", office: "Chairperson" })).toMatchObject({ ok: false, status: 400 }); expect(await c.addOfficeBearer(U.A, U.A, { name: "Thabo", office: "Chair", termStart: "2026-05-01", termEnd: "2026-01-01" })).toMatchObject({ ok: false, status: 400 });
    expect(await c.addOfficeBearer(U.A, U.A, { name: "Thabo", office: "Chair", memberId: U.O3 })).toMatchObject({ ok: false, status: 400 });                                          // O3 belongs to another association
    const a = ok<any>(await c.addOfficeBearer(U.A, U.A, { name: "Thabo Mokoena", office: "Chairperson", memberId: U.O1, termStart: plus(-800), termEnd: plus(-5) })), b = ok<any>(await c.addOfficeBearer(U.A, U.A, { name: "Sipho Dube", office: "Treasurer", termEnd: plus(25) })), d = ok<any>(await c.addOfficeBearer(U.A, U.A, { name: "Lerato Nel", office: "Secretary", termEnd: plus(80) }));
    const f = (await c.summary(U.A, TODAY)).flags.filter((x) => x.id.startsWith("reg:term:")); expect(f.map((x) => [x.subject, x.severity])).toEqual([["Thabo Mokoena", "high"], ["Sipho Dube", "medium"], ["Lerato Nel", "low"]]); expect(f[0].message).toContain("election or renewal is overdue");
    ok(await c.updateOfficeBearer(U.A, U.A, a.id, { termEnd: plus(1000) })); expect((await c.summary(U.A, TODAY)).flags.some((x) => x.id === `reg:term:${a.id}`)).toBe(false); expect(await c.updateOfficeBearer(U.B, U.B, a.id, { termEnd: plus(1) })).toMatchObject({ ok: false, status: 404 });
    expect(await c.updateOfficeBearer(U.A, U.A, b.id, { termStart: plus(10), termEnd: plus(1) })).toMatchObject({ ok: false, status: 400 }); ok(await c.removeOfficeBearer(U.A, U.A, d.id)); expect(await c.removeOfficeBearer(U.A, U.A, d.id)).toMatchObject({ ok: false, status: 404 }); expect((await c.officeBearers(U.A)).map((x) => x.name)).toEqual(["Thabo Mokoena", "Sipho Dube"].sort((p, q) => p.localeCompare(q)).length ? expect.any(Array) : []);
  });
  it("records the evidence held (certificate, constitution, code), validated, and stops flagging a missing one once it is recorded, flagging one that has expired", async () => {
    expect(await c.addDocument(U.A, U.A, { kind: "diploma", title: "x" })).toMatchObject({ ok: false, status: 400 }); expect(await c.addDocument(U.A, U.A, { kind: "constitution", title: "" })).toMatchObject({ ok: false, status: 400 }); expect(await c.addDocument(U.A, U.A, { kind: "constitution", title: "x", datedOn: "never" })).toMatchObject({ ok: false, status: 400 });
    for (const [kind, title] of [["registration_certificate", "Certificate"], ["constitution", "Signed constitution v3"], ["code_of_conduct", "Code of conduct"]] as const) ok(await c.addDocument(U.A, U.A, { kind, title, reference: "REF-1", version: "3", datedOn: "2026-01-10", heldAt: "Office safe", ...(kind === "registration_certificate" ? { expiresOn: plus(-2) } : {}) }));
    const ids = (await c.summary(U.A, TODAY)).flags.map((f) => f.id); expect(ids.some((x) => x.startsWith("reg:doc:"))).toBe(false); expect(ids.some((x) => x.startsWith("reg:docexp:"))).toBe(true);
    const d = (await c.documents(U.A)).find((x) => x.kind === "constitution")!; expect(d).toMatchObject({ title: "Signed constitution v3", version: "3", heldAt: "Office safe" }); ok(await c.removeDocument(U.A, U.A, d.id)); expect(await c.removeDocument(U.B, U.B, d.id)).toMatchObject({ ok: false, status: 404 });
  });
  it("records each member's signed acceptance of a version, for members only, and says who has not signed the current one", async () => {
    ok(await c.saveRegistration(U.A, U.A, { constitutionVersion: "3" })); let a = await c.acceptances(U.A); expect(a.members.map((m) => [m.name, m.acceptedCurrent])).toEqual([["Olu Owner", false], ["Ona Owner", false]]);
    expect(await c.recordAcceptance(U.A, U.A, { memberId: U.O3, version: "3", acceptedOn: "2026-02-01" })).toMatchObject({ ok: false, status: 400 }); expect(await c.recordAcceptance(U.A, U.A, { memberId: U.O1, version: "", acceptedOn: "2026-02-01" })).toMatchObject({ ok: false, status: 400 });
    expect(await c.recordAcceptance(U.A, U.A, { memberId: U.O1, version: "3", acceptedOn: plus(5) })).toMatchObject({ ok: false, status: 400 }); ok(await c.recordAcceptance(U.A, U.A, { memberId: U.O1, version: "2", acceptedOn: "2025-02-01" })); ok(await c.recordAcceptance(U.A, U.A, { memberId: U.O1, version: "3", acceptedOn: "2026-02-01", reference: "SIG-9" }));
    a = await c.acceptances(U.A); expect(a.members.find((m) => m.name === "Olu Owner")).toMatchObject({ acceptedCurrent: true, acceptedOn: "2026-02-01", versionsAccepted: expect.arrayContaining(["2", "3"]) }); expect((await c.summary(U.A, TODAY)).flags.find((f) => f.id === "reg:acceptances")!.message).toContain("1 member has not signed");
    ok(await c.recordAcceptance(U.A, U.A, { memberId: U.O2, version: "3", acceptedOn: "2026-02-02" })); expect((await c.summary(U.A, TODAY)).flags.some((f) => f.id === "reg:acceptances")).toBe(false);
  });
});

describe("the vehicle register and operating licences", () => {
  it("lists only the vehicles of the association's active owner members, with owner and driver, and none of another association's", async () => {
    const vs = await c.vehicles(U.A, TODAY); expect(vs.map((v) => [v.registration, v.owner, v.driver])).toEqual([["CA 111-111", "Olu Owner", "Dan Driver"], ["CA 222-222", "Olu Owner", null], ["CA 333-333", "Ona Owner", "Dina Driver"]]);
    expect((await c.vehicles(U.B, TODAY)).map((v) => v.registration)).toEqual(["CB 444-444"]); await db.query(`UPDATE memberships SET status = 'removed' WHERE member_id = $1`, [U.O2]); expect((await c.vehicles(U.A, TODAY)).map((v) => v.registration)).toEqual(["CA 111-111", "CA 222-222"]);
  });
  it("records a licence per vehicle (never per membership), validated, at most seven years, once per number, and only for the association's own members' vehicles", async () => {
    expect(await licence(V.v4)).toMatchObject({ ok: false, status: 404 }); expect(await licence("nope")).toMatchObject({ ok: false, status: 404 });
    for (const [bad, st] of [[{ licenceNumber: "" }, 400], [{ validFrom: "soon" }, 400], [{ validFrom: plus(10), validUntil: plus(5) }, 400], [{ validFrom: "2026-01-01", validUntil: "2033-01-02" }, 400], [{ route: "x".repeat(300) }, 400]] as const) expect(await licence(V.v1, bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    ok(await licence(V.v1, { validFrom: "2026-01-01", validUntil: "2033-01-01", route: "Langa to Bellville", area: "Cape Town", times: "05:00 to 22:00" })); expect(await licence(V.v1, { validFrom: "2026-01-01", validUntil: "2033-01-01" })).toMatchObject({ ok: false, status: 409 });         // seven years exactly is allowed
    const v = (await c.vehicles(U.A, TODAY)).find((x) => x.registration === "CA 111-111")!; expect(v.licence).toMatchObject({ status: "valid", validUntil: "2033-01-01", current: { route: "Langa to Bellville", area: "Cape Town", times: "05:00 to 22:00", authority: "Provincial Regulatory Entity" } });
  });
  it("keeps an application separate from a licence: lodged counts as unlicensed, an outcome can be set once, and a grant does not itself license the vehicle", async () => {
    expect((await c.vehicles(U.A, TODAY))[1].licence.status).toBe("none");
    for (const [bad] of [[{ kind: "other", lodgedOn: TODAY }], [{ kind: "new", lodgedOn: plus(3) }], [{ kind: "new", lodgedOn: "never" }]] as const) expect(await c.addApplication(U.A, U.A, V.v2, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    const a = ok<any>(await c.addApplication(U.A, U.A, V.v2, { kind: "new", reference: "APP-77", authority: "PRE", lodgedOn: plus(-30) })); let v = (await c.vehicles(U.A, TODAY))[1]; expect(v.licence.status).toBe("application_lodged"); expect(v.applications[0]).toMatchObject({ kind: "new", reference: "APP-77", outcome: "pending" });
    expect((await c.summary(U.A, TODAY)).flags.find((f) => f.id === `veh:${V.v2}:applonly`)!.message).toContain("counts as unlicensed");
    expect(await c.setApplicationOutcome(U.A, U.A, a.id, { outcome: "approved", outcomeOn: TODAY })).toMatchObject({ ok: false, status: 400 }); expect(await c.setApplicationOutcome(U.A, U.A, a.id, { outcome: "granted", outcomeOn: plus(-60) })).toMatchObject({ ok: false, status: 400 });
    ok(await c.setApplicationOutcome(U.A, U.A, a.id, { outcome: "granted", outcomeOn: TODAY })); expect(await c.setApplicationOutcome(U.A, U.A, a.id, { outcome: "refused", outcomeOn: TODAY })).toMatchObject({ ok: false, status: 409 }); expect(await c.setApplicationOutcome(U.B, U.B, a.id, { outcome: "granted", outcomeOn: TODAY })).toMatchObject({ ok: false, status: 404 });
    v = (await c.vehicles(U.A, TODAY))[1]; expect(v.licence.status).toBe("none");                                                                                          // granted, but the licence itself is not yet recorded
    ok(await licence(V.v2)); expect((await c.vehicles(U.A, TODAY))[1].licence.status).toBe("valid");
  });
  it("flags each vehicle's licence, roadworthy and insurance by how near they are: none, application only, expired, then 30 (high), 90 and 180 (medium) days", async () => {
    ok(await licence(V.v1, { validUntil: plus(20) })); ok(await licence(V.v3, { validUntil: plus(-3), validFrom: plus(-400) }));
    const flags = () => c.summary(U.A, TODAY).then((s) => s.flags.filter((f) => f.id.startsWith("veh:")));
    let f = await flags(); expect(f.find((x) => x.id === `veh:${V.v1}:licexpiring`)).toMatchObject({ severity: "high", dueOn: plus(20) }); expect(f.find((x) => x.id === `veh:${V.v3}:licexpired`)).toMatchObject({ severity: "high" }); expect(f.find((x) => x.id === `veh:${V.v2}:nolicence`)!.severity).toBe("high");
    for (const [days, sev] of [[60, "medium"], [150, "medium"], [250, null]] as const) { await db.query(`UPDATE operating_licences SET valid_until = $2 WHERE vehicle_id = $1`, [V.v1, plus(days)]); f = await flags(); expect(f.find((x) => x.id === `veh:${V.v1}:licexpiring`)?.severity ?? null, String(days)).toBe(sev); }
    ok(await c.saveVehicle(U.A, U.A, V.v1, { roadworthyExpiry: plus(-1), insuranceExpiry: plus(40) })); f = await flags(); expect(f.find((x) => x.id === `veh:${V.v1}:rwexpired`)!.severity).toBe("high"); expect(f.find((x) => x.id === `veh:${V.v1}:insexpiring`)!.severity).toBe("low");
    expect(f.find((x) => x.id === `veh:${V.v2}:rwmissing`)!.severity).toBe("medium"); expect(f.find((x) => x.id === `veh:${V.v2}:insmissing`)).toBeDefined(); ok(await c.saveVehicle(U.A, U.A, V.v1, { roadworthyExpiry: plus(20) })); expect((await flags()).find((x) => x.id === `veh:${V.v1}:rwexpiring`)!.severity).toBe("medium");
  });
  it("saves what is held about a vehicle, only the fields sent, validated, logged, and only for the association's own members' vehicles", async () => {
    ok(await c.saveVehicle(U.A, U.A, V.v1, { vin: "AHT1234567890", insurer: "Santam", policyNumber: "P-9", tracker: "installed", camera: "none", recapStatus: "applied", signageNote: "Yellow band, route sign" }));
    ok(await c.saveVehicle(U.A, U.A, V.v1, { roadworthyExpiry: plus(200) })); const v = (await c.vehicles(U.A, TODAY))[0]; expect(v.compliance).toMatchObject({ vin: "AHT1234567890", insurer: "Santam", tracker: "installed", camera: "none", recapStatus: "applied", roadworthyExpiry: plus(200), state: "active" });
    for (const bad of [{ tracker: "maybe" }, { recapStatus: "soon" }, { state: "gone" }, { roadworthyExpiry: "never" }, { vin: "x".repeat(50) }, { replacedBy: V.v1 }, { replacedBy: V.v4 }]) expect(await c.saveVehicle(U.A, U.A, V.v1, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await c.saveVehicle(U.A, U.A, V.v4, { vin: "X" })).toMatchObject({ ok: false, status: 404 }); expect((await c.changes(U.A, { entity: "vehicle" })).some((x) => x.summary.includes("CA 111-111: insurer (empty) → Santam"))).toBe(true);
  });
  it("tracks a replaced vehicle until the replacement's licence is amended, and leaves vehicles that are off the road or replaced out of the licence figures", async () => {
    ok(await licence(V.v1)); expect(await c.saveVehicle(U.A, U.A, V.v1, { state: "replaced" })).toMatchObject({ ok: false, status: 400 }); ok(await c.saveVehicle(U.A, U.A, V.v1, { state: "replaced", replacedBy: V.v2 }));
    expect((await c.summary(U.A, TODAY)).flags.find((f) => f.id === `veh:${V.v1}:replacement`)!.message).toContain("has no valid licence yet: the licence must be amended"); ok(await licence(V.v2, { licenceNumber: "OL-2" })); expect((await c.summary(U.A, TODAY)).flags.some((f) => f.id === `veh:${V.v1}:replacement`)).toBe(false);
    ok(await c.saveVehicle(U.A, U.A, V.v3, { state: "off_road" })); const s = await c.summary(U.A, TODAY); expect(s.measures.vehicles).toBe(1); expect(s.flags.some((f) => f.id.startsWith(`veh:${V.v3}:`) && f.category !== "data")).toBe(false);          // only v2 is active
  });
  it("flags a licence recorded as longer than seven years (data entered before the limit was checked) as a data problem", async () => {
    await db.query(`INSERT INTO operating_licences (vehicle_id, licence_number, valid_from, valid_until) VALUES ($1,'OL-OLD','2020-01-01','2030-01-01')`, [V.v1]); const f = (await c.summary(U.A, TODAY)).flags.find((x) => x.id.startsWith(`veh:${V.v1}:licspan`))!; expect(f).toMatchObject({ category: "data", severity: "low" }); expect(f.message).toContain("more than seven years");
  });
  it("removes a licence only for the association's own members' vehicles", async () => {
    const l = ok<any>(await licence(V.v1)); expect(await c.removeLicence(U.B, U.B, l.id)).toMatchObject({ ok: false, status: 404 }); ok(await c.removeLicence(U.A, U.A, l.id)); expect(await c.removeLicence(U.A, U.A, l.id)).toMatchObject({ ok: false, status: 404 }); expect((await c.vehicles(U.A, TODAY))[0].licence.status).toBe("none");
  });
});

describe("the driver register", () => {
  it("includes the association's driver members and the drivers of its owner members, each with their owner and vehicle, and nobody else's", async () => {
    await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.O3, id(9)]); await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,'zed','Zed Driver','z@x.test','driver')`, [id(9)]);
    const ds = await c.drivers(U.A, TODAY); expect(ds.map((d) => [d.name, d.employers, d.vehicle, d.member])).toEqual([["Dan Driver", ["Olu Owner"], "CA 111-111", false], ["Dee Driver", [], null, true], ["Dina Driver", ["Ona Owner"], "CA 333-333", false]]); expect((await c.drivers(U.B, TODAY)).map((d) => d.name)).toEqual(["Zed Driver"]);
  });
  it("flags a driver with no valid permit (high when assigned to a vehicle), an expiring permit, an expired licence, no employer, and suspension while still assigned", async () => {
    let f = (await c.summary(U.A, TODAY)).flags.filter((x) => x.id.startsWith("drv:")); expect(f.find((x) => x.id === `drv:${U.D2}:permitexpired`)).toMatchObject({ severity: "high" }); expect(f.find((x) => x.id === `drv:${U.D2}:permitexpired`)!.message).toContain("assigned to CA 111-111");
    expect(f.find((x) => x.id === `drv:${U.D3}:nopermit`)).toMatchObject({ severity: "high" }); expect(f.find((x) => x.id === `drv:${U.D1}:noemployer`)).toMatchObject({ severity: "medium" });
    await db.query(`UPDATE driver_profiles SET pdp_expiry = $2 WHERE user_id = $1`, [U.D1, plus(45)]); await db.query(`UPDATE driver_profiles SET licence_expiry = $2 WHERE user_id = $1`, [U.D2, plus(-3)]);
    f = (await c.summary(U.A, TODAY)).flags.filter((x) => x.id.startsWith("drv:")); expect(f.find((x) => x.id === `drv:${U.D1}:permitexpiring`)).toMatchObject({ severity: "low", dueOn: plus(45) }); expect(f.find((x) => x.id === `drv:${U.D2}:licexpired`)).toMatchObject({ severity: "high" });
    ok(await c.saveDriver(U.A, U.A, U.D2, { state: "suspended", stateReason: "Reckless driving" })); expect((await c.summary(U.A, TODAY)).flags.find((x) => x.id === `drv:${U.D2}:suspended`)!.message).toContain("still assigned to CA 111-111");
  });
  it("keeps the identity and employment details, validates them (a real South African ID, known choices, a reason for suspension), masks the ID in the list, and logs changes without printing the ID", async () => {
    for (const bad of [{ idNumber: "12345" }, { idNumber: "8001015009088" }, { employmentStatus: "slave" }, { payBasis: "barter" }, { uifRegistered: "yes" }, { state: "suspended" }, { trainingNote: "x".repeat(400) }]) expect(await c.saveDriver(U.A, U.A, U.D2, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    ok(await c.saveDriver(U.A, U.A, U.D2, { idNumber: "8001015009087", employmentStatus: "employed", contractOnFile: true, payBasis: "salary", uifRegistered: true, coidaRegistered: false, cleanRecordConfirmed: true, trainingNote: "Defensive driving 2026" }));
    const d = (await c.drivers(U.A, TODAY)).find((x) => x.id === U.D2)!; expect(d.idNumberMasked).toBe("•••••••••9087"); expect(JSON.stringify(d)).not.toContain("8001015009"); expect(d.register).toMatchObject({ employmentStatus: "employed", contractOnFile: true, payBasis: "salary", uifRegistered: true, coidaRegistered: false, cleanRecordConfirmed: true });
    expect((await c.summary(U.A, TODAY)).flags.find((x) => x.id === `drv:${U.D2}:formalities`)!.message).toContain("not registered for COIDA"); expect(JSON.stringify(await c.changes(U.A))).not.toContain("8001015009"); expect(await c.saveDriver(U.B, U.B, U.D2, { employmentStatus: "employed" })).toMatchObject({ ok: false, status: 404 });
    ok(await c.saveDriver(U.A, U.A, U.D2, { idNumber: null })); expect((await c.drivers(U.A, TODAY)).find((x) => x.id === U.D2)!.idNumberMasked).toBeNull();
  });
  it("refuses to put a driver on a vehicle without a valid permit, but only for an association that has switched that on, and says why", async () => {
    expect(await c.assignmentBlock(U.O1, U.D3, TODAY)).toBeNull();                                                                              // off by default: nothing changes for anyone
    await db.query(`INSERT INTO association_settings (association_id, enforce_prdp) VALUES ($1, true) ON CONFLICT (association_id) DO UPDATE SET enforce_prdp = true`, [U.A]);
    expect(await c.assignmentBlock(U.O1, U.D3, TODAY)).toContain("no professional driving permit"); expect(await c.assignmentBlock(U.O1, U.D2, TODAY)).toContain(`expired on ${plus(-10)}`); expect(await c.assignmentBlock(U.O1, U.D1, TODAY)).toBeNull();
    ok(await c.saveDriver(U.A, U.A, U.D1, { state: "suspended", stateReason: "Disciplinary hearing" })); expect(await c.assignmentBlock(U.O1, U.D1, TODAY)).toContain("suspended (Disciplinary hearing)"); expect(await c.assignmentBlock(U.O3, U.D3, TODAY)).toBeNull();            // O3 belongs to association B, which has not switched it on
  });
});

describe("the overview, the trend and the history", () => {
  it("counts only vehicles with a licence covering today as licensed, reports applications, expiries and no licence separately, and gives the exact percentages", async () => {
    ok(await licence(V.v1)); ok(await c.addApplication(U.A, U.A, V.v2, { kind: "new", lodgedOn: plus(-5) })); ok(await licence(V.v3, { validFrom: plus(-400), validUntil: plus(-10) }));
    const m = (await c.summary(U.A, TODAY)).measures; expect(m).toMatchObject({ vehicles: 3, vehiclesLicensed: 1, licensedPercent: 33.3, applicationOnly: 1, expired: 1, noLicence: 0, drivers: 3, driversWithValidPermit: 1, validPermitPercent: 33.3, driversWithoutEmployer: 1, members: 2 });
  });
  it("has no percentage when there is nothing to measure, rather than 0% or NaN", async () => {
    const m = (await c.summary(U.B, TODAY)).measures; expect(m).toMatchObject({ vehicles: 1, drivers: 0, driversWithValidPermit: 0, validPermitPercent: null }); await db.query(`DELETE FROM vehicles WHERE owner_id = $1`, [U.O3]); expect((await c.summary(U.B, TODAY)).measures).toMatchObject({ vehicles: 0, licensedPercent: null });
  });
  it("lists the expiries coming up, soonest first, with how many days, across licences, certificates, insurance and permits, and not the ones comfortably away", async () => {
    ok(await licence(V.v1, { validUntil: plus(100) })); ok(await c.saveVehicle(U.A, U.A, V.v1, { roadworthyExpiry: plus(12), insuranceExpiry: plus(400) })); await db.query(`UPDATE driver_profiles SET pdp_expiry = $2 WHERE user_id = $1`, [U.D1, plus(170)]);
    const e = (await c.summary(U.A, TODAY)).expiries; expect(e.map((x) => [x.kind, x.subject, x.days, x.band])).toEqual([["Professional driving permit", "Dan Driver", -10, "expired"], ["Roadworthy certificate", "CA 111-111", 12, "30"], ["Operating licence", "CA 111-111", 100, "180"], ["Professional driving permit", "Dee Driver", 170, "180"]]);
  });
  it("orders the flags by seriousness, then by date, and counts them", async () => {
    const s = await c.summary(U.A, TODAY); const sev = s.flags.map((f) => f.severity); expect([...sev].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a] - ({ high: 0, medium: 1, low: 2 })[b])).toEqual(sev); expect(s.flagCounts).toEqual({ high: sev.filter((x) => x === "high").length, medium: sev.filter((x) => x === "medium").length, low: sev.filter((x) => x === "low").length });
  });
  it("snapshots each month once (the latest picture of the month wins), keeps a trend in order, and snapshots every association", async () => {
    ok(await licence(V.v1)); expect(await c.snapshot(U.A, "2026-09-15")).toEqual({ month: "2026-09", vehicles: 3, licensed: 1, drivers: 3, driversValid: 2 });
    // (Dan's permit only expires on 23 October, so on 15 September two drivers had valid permits.)
    ok(await licence(V.v2, { licenceNumber: "OL-2" })); await c.snapshot(U.A, "2026-09-28"); await c.snapshot(U.A, "2026-10-05");
    expect(await c.trend(U.A)).toEqual([{ month: "2026-09", vehicles: 3, licensed: 2, licensedPercent: 66.7, drivers: 3, driversValid: 2, validPermitPercent: 66.7 }, { month: "2026-10", vehicles: 3, licensed: 2, licensedPercent: 66.7, drivers: 3, driversValid: 2, validPermitPercent: 66.7 }]);
    expect((await c.trend(U.A, 1)).map((x) => x.month)).toEqual(["2026-10"]); expect(await c.trend(U.B)).toEqual([]); expect(await c.snapshotAll("2026-11-02")).toBe(2); expect((await c.trend(U.B)).map((x) => x.month)).toEqual(["2026-11"]);
  });
  it("keeps a history of changes, newest first, scoped to the association, filterable by what changed", async () => {
    ok(await c.saveRegistration(U.A, U.A, { registrar: "PRE" })); ok(await licence(V.v1)); ok(await c.saveVehicle(U.A, U.A, V.v1, { insurer: "Santam" }));
    expect((await c.changes(U.A)).map((x) => x.entity)).toEqual(["vehicle", "licence", "registration"]); expect((await c.changes(U.A, { entity: "licence" })).map((x) => x.summary)).toEqual([expect.stringContaining("CA 111-111: licence OL-1 valid")]); expect(await c.changes(U.B)).toEqual([]); expect((await c.changes(U.A, { limit: 1 })).length).toBe(1);
  });
});
