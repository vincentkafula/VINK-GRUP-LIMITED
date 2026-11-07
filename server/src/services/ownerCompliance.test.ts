/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createOwnerCompliance, itemStatus, reminderBand, type OwnerCompliance } from "./ownerCompliance.js";
import { createLicenceRules, PROVINCES, yearsText, isProvince } from "./licenceRules.js";
import { createCompliance } from "./compliance.js";

/**
 * The owner's compliance centre and the province-aware licence rules.
 * Owner O1 has vehicles v1 (driver D1, an active driver of O1) and v2 (no driver); owner O2 has v3. Association A has O1 as a member.
 * The clock is Monday 2 Nov 2026. The reminder days are the default 90, 60, 30 and 7.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), O1: id(3), O2: id(4), D1: id(6), D2: id(7) }, V = { v1: id(20), v2: id(21), v3: id(22) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
let db: Db, oc: OwnerCompliance;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (d: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  db = allPortalsDb(); oc = createOwnerCompliance(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.D1, "Dan Driver", "driver"], [U.D2, "Dee Driver", "driver"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by, responded_at) VALUES ($1,$2,'vehicle_owner','active','member','2025-03-10T08:00:00Z')`, [U.A, U.O1]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.O1, U.D1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats, driver_id) VALUES ($1,$2,'CA 111-111','Toyota',15,$3),($4,$2,'CA 222-222','Toyota',15,NULL),($5,$6,'CA 333-333','Toyota',15,NULL)`, [V.v1, U.O1, U.D1, V.v2, V.v3, U.O2]);
});
const licence = (reg: string, from: string, until: string, o: any = {}) => db.query(`INSERT INTO operating_licences (vehicle_id, licence_number, valid_from, valid_until, condition_route, province) VALUES ((SELECT id FROM vehicles WHERE registration = $1),$2,$3,$4,$5,$6)`, [reg, o.number ?? `L-${reg}-${until}`, from, until, o.route ?? null, o.province ?? null]);
const comp = (vehicle: string, o: any) => db.query(`INSERT INTO vehicle_compliance (vehicle_id, roadworthy_expiry, roadworthy_ref, insurer, policy_number, insurance_expiry) VALUES ($1,$2,$3,$4,$5,$6)`, [vehicle, o.rw ?? null, o.rwRef ?? null, o.insurer ?? null, o.policy ?? null, o.ins ?? null]);
const disc = (vehicle: string, d: string | null) => db.query(`UPDATE vehicles SET disc_expiry = $2 WHERE id = $1`, [vehicle, d]);
const driver = (user: string, licenceExpiry: string | null, pdpExpiry: string | null) => db.query(`INSERT INTO driver_profiles (user_id, licence_number, licence_expiry, pdp_number, pdp_expiry) VALUES ($1,'SECRET-LICENCE-1','${licenceExpiry ?? ""}'::date,'SECRET-PDP-1',${pdpExpiry ? `'${pdpExpiry}'::date` : "NULL"})`.replace("''::date", "NULL"), [user]);
const vehicle = async (reg: string, on = TODAY, owner = U.O1) => (await oc.centre(owner, on)).vehicles.find((v) => v.registration === reg)!;
const item = (v: any, kind: string) => v.items.find((i: any) => i.kind === kind);

describe("the status of one expiry date", () => {
  it("is missing with no date, expired the day after, and due from the longest reminder down to the last day, otherwise valid", () => {
    const d = [90, 60, 30, 7]; expect(itemStatus(null, TODAY, d)).toEqual({ status: "missing", daysLeft: null }); expect(itemStatus(plus(-1), TODAY, d)).toEqual({ status: "expired", daysLeft: -1 }); expect(itemStatus(TODAY, TODAY, d)).toEqual({ status: "due", daysLeft: 0 }); expect(itemStatus(plus(90), TODAY, d)).toEqual({ status: "due", daysLeft: 90 }); expect(itemStatus(plus(91), TODAY, d)).toEqual({ status: "valid", daysLeft: 91 });
    expect(itemStatus(plus(20), TODAY, [14])).toEqual({ status: "valid", daysLeft: 20 }); expect(itemStatus(plus(14), TODAY, [14, 3])).toEqual({ status: "due", daysLeft: 14 });
  });
  it("puts a date in the smallest reminder band that still covers the days left, band 0 once expired, and none while it is further off than the longest", () => {
    const d = [90, 60, 30, 7]; expect([91, 90, 61, 60, 31, 30, 8, 7, 1, 0, -1, -400].map((n) => reminderBand(n, d))).toEqual([null, 90, 90, 60, 60, 30, 30, 7, 7, 7, 0, 0]); expect(reminderBand(null, d)).toBeNull(); expect(reminderBand(5, [14])).toBe(14);
  });
});

describe("the licence rules", () => {
  it("starts with the figures from the brief, every one marked not verified, with the default first", async () => {
    const r = await createLicenceRules(db).list(); expect(r.map((x) => [x.province, x.maxYears, x.verified])).toEqual([["*", 7, false], ["Gauteng", 5, false], ["Western Cape", 5, false]]); expect(r.every((x) => x.note?.includes("Not yet verified"))).toBe(true);
  });
  it("gives a province its own rule, and any other province, or none, the default", async () => {
    const lr = createLicenceRules(db); expect((await lr.forProvince("Gauteng")).maxYears).toBe(5); expect((await lr.forProvince("Western Cape")).maxYears).toBe(5); for (const p of ["Limpopo", "KwaZulu-Natal", null, undefined, "Nowhere"]) expect((await lr.forProvince(p as any)).maxYears, String(p)).toBe(7); await db.query(`DELETE FROM licence_rules WHERE province = '*'`); expect(await lr.forProvince("Limpopo")).toMatchObject({ maxYears: 7, verified: false });
  });
  it("changes a rule only for a real province or the default, within 1 to 20 whole years, and records that it was verified", async () => {
    const lr = createLicenceRules(db, () => NOW); for (const [p, y] of [["Atlantis", 5], ["Gauteng", 0], ["Gauteng", 21], ["Gauteng", 5.5], ["Gauteng", "5" as any]] as const) expect(await lr.set(p, y), `${p} ${y}`).toMatchObject({ ok: false });
    expect(await lr.set("Gauteng", 7, { verified: true, note: "Confirmed with the PRE on 2 Nov" })).toMatchObject({ ok: true, rule: { province: "Gauteng", maxYears: 7, verified: true, note: "Confirmed with the PRE on 2 Nov" } }); expect((await lr.forProvince("Gauteng")).maxYears).toBe(7); expect(await lr.set("*", 6)).toMatchObject({ ok: true, rule: { verified: false } }); expect((await lr.forProvince("Limpopo")).maxYears).toBe(6);
  });
  it("names the nine provinces and says years in words", () => { expect(PROVINCES).toHaveLength(9); expect(isProvince("Gauteng")).toBe(true); expect(isProvince("gauteng")).toBe(false); expect(isProvince(null)).toBe(false); expect([1, 5, 7, 12].map(yearsText)).toEqual(["one year", "five years", "seven years", "12 years"]); });
});

describe("the reminder days", () => {
  it("defaults to 90, 60, 30 and 7, and takes between one and six whole days from 1 to 365, sorted, without duplicates", async () => {
    expect(await oc.reminderDays(U.O1)).toEqual([90, 60, 30, 7]); for (const bad of [[], "30", [0], [366], [1.5], ["7"], [1, 2, 3, 4, 5, 6, 7], null, [-5]]) expect(await oc.setReminderDays(U.O1, bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(ok<any>(await oc.setReminderDays(U.O1, [7, 30, 14, 30]))).toEqual({ reminderDays: [30, 14, 7] }); expect(await oc.reminderDays(U.O1)).toEqual([30, 14, 7]); expect(await oc.reminderDays(U.O2)).toEqual([90, 60, 30, 7]); ok(await oc.setReminderDays(U.O1, [1])); ok(await oc.setReminderDays(U.O1, [365]));
  });
  it("changes what counts as due", async () => {
    await disc(V.v2, plus(20)); expect(item(await vehicle("CA 222-222"), "disc")).toMatchObject({ status: "due", daysLeft: 20 }); ok(await oc.setReminderDays(U.O1, [14])); expect(item(await vehicle("CA 222-222"), "disc")).toMatchObject({ status: "valid" });
  });
});

describe("the compliance centre", () => {
  it("shows a vehicle with everything valid as green at 100%, including the driver's licence and PrDP as the driver recorded them (dates only, never the numbers)", async () => {
    await licence("CA 111-111", "2025-01-01", plus(400), { number: "OL-9", province: "Gauteng", route: "Langa to Bellville" }); await comp(V.v1, { rw: plus(200), rwRef: "RWC-77", ins: plus(300), insurer: "Santam", policy: "POL-1" }); await disc(V.v1, plus(250)); await driver(U.D1, plus(500), plus(450));
    const v = await vehicle("CA 111-111"); expect(v).toMatchObject({ status: "green", scorePercent: 100, driver: "Dan Driver" }); expect(v.items.map((i: any) => [i.kind, i.status])).toEqual([["licence", "valid"], ["roadworthy", "valid"], ["disc", "valid"], ["insurance", "valid"], ["driver_licence", "valid"], ["prdp", "valid"]]);
    expect(item(v, "licence")).toMatchObject({ label: "Operating licence OL-9", detail: "Gauteng · Langa to Bellville", expiresOn: plus(400), daysLeft: 400 }); expect(item(v, "roadworthy").detail).toBe("RWC-77"); expect(item(v, "insurance").detail).toBe("Santam · POL-1"); expect(item(v, "prdp")).toMatchObject({ label: "PrDP of Dan Driver", detail: "As recorded by the driver" }); expect(JSON.stringify(await oc.centre(U.O1))).not.toContain("SECRET");
  });
  it("counts a missing document against the score, and turns a vehicle amber for missing or due and red for expired", async () => {
    await licence("CA 222-222", "2025-01-01", plus(400)); await comp(V.v2, { rw: plus(20), ins: plus(-3) }); let v = await vehicle("CA 222-222"); expect(v.items.map((i: any) => [i.kind, i.status])).toEqual([["licence", "valid"], ["roadworthy", "due"], ["disc", "missing"], ["insurance", "expired"]]); expect(v).toMatchObject({ status: "red", scorePercent: 25, driver: null }); expect(v.items.some((i: any) => i.kind === "prdp")).toBe(false);                  // no driver, so no driver documents are required
    await comp(V.v1, {}).catch(() => 0); await db.query(`UPDATE vehicle_compliance SET insurance_expiry = $2 WHERE vehicle_id = $1`, [V.v2, plus(120)]); await disc(V.v2, plus(150)); v = await vehicle("CA 222-222"); expect(v).toMatchObject({ status: "amber", scorePercent: 75 }); await db.query(`UPDATE vehicle_compliance SET roadworthy_expiry = $2 WHERE vehicle_id = $1`, [V.v2, plus(130)]); expect(await vehicle("CA 222-222")).toMatchObject({ status: "green", scorePercent: 100 });
  });
  it("treats a driver who is not one of the owner's active drivers as missing, with a plain reason, and never reads their dates", async () => {
    await db.query(`UPDATE vehicles SET driver_id = $2 WHERE id = $1`, [V.v2, U.D2]); await driver(U.D2, plus(500), plus(500)); const v = await vehicle("CA 222-222"); expect(item(v, "driver_licence")).toMatchObject({ status: "missing", expiresOn: null, detail: "This driver is not one of your active drivers" }); expect(item(v, "prdp").status).toBe("missing");
    await db.query(`UPDATE owner_drivers SET status = 'removed' WHERE driver_id = $1`, [U.D1]); await driver(U.D1, plus(500), plus(500)); expect(item(await vehicle("CA 111-111"), "driver_licence").status).toBe("missing");
  });
  it("chooses the licence in force now, else the next to start, else the latest, and shows every licence with its province's limit and whether that is verified", async () => {
    await licence("CA 111-111", "2018-01-01", "2022-12-31", { number: "OLD" }); await licence("CA 111-111", "2023-01-01", plus(100), { number: "CURRENT", province: "Gauteng" }); await licence("CA 111-111", plus(101), plus(900), { number: "NEXT", province: "Gauteng" }); const v = await vehicle("CA 111-111");
    expect(item(v, "licence")).toMatchObject({ label: "Operating licence CURRENT", expiresOn: plus(100) }); expect(v.licences.map((l: any) => [l.licenceNumber, l.maxYears, l.ruleVerified])).toEqual([["NEXT", 5, false], ["CURRENT", 5, false], ["OLD", 7, false]]);
    await db.query(`DELETE FROM operating_licences WHERE licence_number IN ('CURRENT','NEXT')`); expect(item(await vehicle("CA 111-111"), "licence")).toMatchObject({ label: "Operating licence OLD", status: "expired" });
  });
  it("flags a licence recorded as lasting longer than its province allows, naming the limit", async () => {
    await licence("CA 111-111", "2020-01-01", "2026-12-31", { number: "LONG", province: "Gauteng" }); await licence("CA 222-222", "2020-01-01", "2026-12-31", { number: "FINE" }); const f = (await oc.centre(U.O1)).flags.filter((x) => x.id.startsWith("cc:licspan"));
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ severity: "low", message: "CA 111-111: licence LONG is recorded as lasting more than five years (the limit set for Gauteng): check the dates" });                  // seven years is fine with no province
  });
  it("raises a flag for each expired, due and missing document, in order of seriousness, high from the last reminder", async () => {
    await comp(V.v2, { rw: plus(25), ins: plus(-3) }); await disc(V.v2, plus(6)); await licence("CA 222-222", "2025-01-01", plus(70)); const f = (await oc.centre(U.O1)).flags.filter((x) => x.subject === "CA 222-222");
    expect(f.map((x) => [x.severity, x.message])).toEqual([["high", `CA 222-222: Licence disc expires in 6 days (${plus(6)})`], ["high", `CA 222-222: Insurance expired on ${plus(-3)}`], ["medium", `CA 222-222: Operating licence L-CA 222-222-${plus(70)} expires in 70 days (${plus(70)})`], ["medium", `CA 222-222: Roadworthy certificate expires in 25 days (${plus(25)})`]]);
    expect((await oc.centre(U.O1)).flags.find((x) => x.id === `cc:missing:licence:${V.v1}`)).toMatchObject({ severity: "low", message: "CA 111-111: Operating licence has not been recorded" });
  });
  it("gives one reminder per band as a date comes closer, a separate one once expired, and none while it is further off than the longest", async () => {
    await disc(V.v2, plus(95)); const r = async (on: string) => (await oc.centre(U.O1, on)).reminders.filter((x) => x.itemKey === `disc:${V.v2}`).map((x) => [x.band, x.title]);
    expect(await r(TODAY)).toEqual([]); expect(await r(plus(5))).toEqual([[90, "CA 222-222: Licence disc expires in 90 days"]]); expect((await r(plus(40))).map((x) => x[0])).toEqual([60]); expect((await r(plus(70))).map((x) => x[0])).toEqual([30]); expect((await r(plus(90))).map((x) => x[0])).toEqual([7]); expect(await r(plus(96))).toEqual([[0, "CA 222-222: Licence disc has expired"]]);
    const keys = new Set<string>(); for (const n of [5, 40, 70, 90, 96]) for (const x of (await oc.centre(U.O1, plus(n))).reminders.filter((y) => y.itemKey === `disc:${V.v2}`)) keys.add(x.key); expect(keys.size).toBe(5);                  // a new key at each band, so each can be seen and read once; and a renewed date starts afresh
  });
  it("totals the fleet: how many vehicles are green, amber and red, the score over all documents, and how many are expired, due and missing", async () => {
    await licence("CA 111-111", "2025-01-01", plus(400)); await comp(V.v1, { rw: plus(200), ins: plus(300) }); await disc(V.v1, plus(250)); await driver(U.D1, plus(500), plus(450)); await comp(V.v2, { rw: plus(20), ins: plus(-3) });
    const f = (await oc.centre(U.O1)).fleet; expect(f).toEqual({ vehicles: 2, green: 1, amber: 0, red: 1, scorePercent: 60, expired: 1, dueSoon: 1, missing: 2 }); expect((await oc.centre(U.O2)).fleet).toMatchObject({ vehicles: 1, red: 0, amber: 1 }); expect((await oc.centre(id(99))).fleet).toMatchObject({ vehicles: 0, scorePercent: null });                  // 6 of 10 documents are valid: all six of the first vehicle's, none of the second's
  });
  it("shows only the owner's own vehicles, and the rules, reminder days and date", async () => {
    const c = await oc.centre(U.O1); expect(c.vehicles.map((v) => v.registration)).toEqual(["CA 111-111", "CA 222-222"]); expect(JSON.stringify(c)).not.toContain("CA 333-333"); expect(c).toMatchObject({ today: TODAY, reminderDays: [90, 60, 30, 7] }); expect(c.rules.map((r) => r.province)).toEqual(["*", "Gauteng", "Western Cape"]);
  });
});

describe("what the owner can change", () => {
  it("saves roadworthy, insurance and disc details, keeping what was not sent, and clearing a date with an empty value", async () => {
    ok(await oc.saveVehicle(U.O1, V.v2, { roadworthyExpiry: plus(200), roadworthyRef: "RWC-1", insurer: "Santam", policyNumber: "P-9", insuranceExpiry: plus(300), discExpiry: plus(250), vin: "AHTFR22G000123456" })); ok(await oc.saveVehicle(U.O1, V.v2, { insurer: "Hollard" }));
    let v = await vehicle("CA 222-222"); expect(item(v, "roadworthy")).toMatchObject({ expiresOn: plus(200), detail: "RWC-1" }); expect(item(v, "insurance")).toMatchObject({ expiresOn: plus(300), detail: "Hollard · P-9" }); expect(item(v, "disc").expiresOn).toBe(plus(250)); expect(v.vin).toBe("AHTFR22G000123456");
    ok(await oc.saveVehicle(U.O1, V.v2, { roadworthyExpiry: "", discExpiry: null })); v = await vehicle("CA 222-222"); expect(item(v, "roadworthy").status).toBe("missing"); expect(item(v, "disc").status).toBe("missing"); expect(item(v, "insurance").expiresOn).toBe(plus(300));
  });
  it("refuses a date that is not a date or is more than ten years from today, text that is too long, nothing to change, and someone else's vehicle", async () => {
    for (const [bad, st] of [[{ roadworthyExpiry: "soon" }, 400], [{ insuranceExpiry: plus(3651) }, 400], [{ discExpiry: plus(-3651) }, 400], [{ roadworthyRef: "x".repeat(50) }, 400], [{ insurer: "x".repeat(90) }, 400], [{ policyNumber: "x".repeat(50) }, 400], [{ vin: "x".repeat(18) }, 400], [{}, 400]] as const) expect(await oc.saveVehicle(U.O1, V.v2, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    expect(await oc.saveVehicle(U.O1, V.v3, { insurer: "x" })).toMatchObject({ ok: false, status: 404 }); expect(await oc.saveVehicle(U.O2, V.v2, { insurer: "x" })).toMatchObject({ ok: false, status: 404 }); expect(await oc.saveVehicle(U.O1, "nope", { insurer: "x" })).toMatchObject({ ok: false, status: 404 }); ok(await oc.saveVehicle(U.O1, V.v2, { roadworthyExpiry: plus(3650) }));
  });
  it("writes the same record the association sees for its member's vehicle", async () => {
    ok(await oc.saveVehicle(U.O1, V.v1, { roadworthyExpiry: plus(200), insurer: "Santam" })); const v = (await createCompliance(db, () => NOW).vehicles(U.A, TODAY)).find((x) => x.registration === "CA 111-111")!; expect(v.compliance).toMatchObject({ roadworthyExpiry: plus(200), insurer: "Santam" });
  });
  it("records a licence with its province, refusing one longer than the province allows (and saying the rule is unverified), but allowing exactly the limit", async () => {
    const add = (o: any = {}) => oc.addLicence(U.O1, V.v1, { licenceNumber: "OL-1", province: "Gauteng", validFrom: "2024-03-01", validUntil: "2029-03-01", route: "Langa to Bellville", authority: "GPRE", ...o });
    expect(await add({ validUntil: "2029-03-02" })).toMatchObject({ ok: false, status: 400, error: "A licence in Gauteng lasts at most five years under the limit set in this system (not yet verified with the Provincial Regulatory Entity): check the dates. If the limit is wrong, the administrator can correct it" }); ok(await add());
    expect(await oc.addLicence(U.O1, V.v1, { licenceNumber: "OL-2", province: "Limpopo", validFrom: "2024-03-01", validUntil: "2031-03-01" })).toMatchObject({ ok: true }); expect(await oc.addLicence(U.O1, V.v1, { licenceNumber: "OL-3", province: "Limpopo", validFrom: "2024-03-01", validUntil: "2031-03-02" })).toMatchObject({ ok: false, error: expect.stringContaining("A licence in Limpopo lasts at most seven years") });
    const v = await vehicle("CA 111-111"); expect(item(v, "licence")).toMatchObject({ label: "Operating licence OL-2", detail: "Limpopo" }); expect(v.licences.find((l: any) => l.licenceNumber === "OL-1")).toMatchObject({ province: "Gauteng", route: "Langa to Bellville", authority: "GPRE", maxYears: 5 });                  // of two licences in force the one that lasts longer is shown
  });
  it("handles a leap day: a licence from 29 February lasts to 28 February five years on", async () => {
    const add = (until: string) => oc.addLicence(U.O1, V.v1, { licenceNumber: `LD-${until}`, province: "Western Cape", validFrom: "2024-02-29", validUntil: until }); ok(await add("2029-02-28")); expect(await add("2029-03-01")).toMatchObject({ ok: false, status: 400 });
  });
  it("follows the rule once it has been verified and changed, and drops the 'not yet verified' words", async () => {
    await createLicenceRules(db, () => NOW).set("Gauteng", 6, { verified: true }); const add = (until: string) => oc.addLicence(U.O1, V.v1, { licenceNumber: `V-${until}`, province: "Gauteng", validFrom: "2024-03-01", validUntil: until }); ok(await add("2030-03-01")); const r = await add("2030-03-02") as any; expect(r.error).toContain("A licence in Gauteng lasts at most six years"); expect(r.error).not.toContain("not yet verified");
  });
  it("refuses a licence with no or an unknown province, no number, bad dates, long text or a repeated number, and someone else's vehicle", async () => {
    const base = { licenceNumber: "OL-1", province: "Gauteng", validFrom: "2024-03-01", validUntil: "2026-03-01" };
    for (const [bad, st] of [[{ province: undefined }, 400], [{ province: "Atlantis" }, 400], [{ licenceNumber: "" }, 400], [{ validFrom: "soon" }, 400], [{ validUntil: "2024-02-01" }, 400], [{ route: "x".repeat(300) }, 400], [{ authority: "x".repeat(200) }, 400]] as const) expect(await oc.addLicence(U.O1, V.v1, Object.assign({}, base, bad) as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    ok(await oc.addLicence(U.O1, V.v1, base)); expect(await oc.addLicence(U.O1, V.v1, base)).toMatchObject({ ok: false, status: 409 }); expect(await oc.addLicence(U.O1, V.v3, base)).toMatchObject({ ok: false, status: 404 }); expect(await oc.addLicence(U.O2, V.v1, base)).toMatchObject({ ok: false, status: 404 });
  });
  it("removes a licence entered by mistake, but only the owner's own", async () => {
    const l = ok<any>(await oc.addLicence(U.O1, V.v1, { licenceNumber: "OL-1", province: "Gauteng", validFrom: "2024-03-01", validUntil: "2026-03-01" })); expect(await oc.removeLicence(U.O2, l.id)).toMatchObject({ ok: false, status: 404 }); expect(await oc.removeLicence(U.O1, "nope")).toMatchObject({ ok: false, status: 404 }); ok(await oc.removeLicence(U.O1, l.id)); expect((await q(`SELECT COUNT(*) AS n FROM operating_licences`))[0].n).toBe(0);
  });
});

describe("the association's own rule follows the province too", () => {
  const add = (o: any = {}) => createCompliance(db, () => NOW).addLicence(U.A, U.A, V.v1, { licenceNumber: "AS-1", validFrom: "2024-03-01", validUntil: "2031-03-01", ...o });
  it("keeps the seven-year limit when no province is given, and applies the province's limit when one is", async () => {
    ok(await add()); expect(await add({ licenceNumber: "AS-2", validUntil: "2031-03-02" })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("at most seven years") });
    expect(await add({ licenceNumber: "AS-3", province: "Gauteng", validUntil: "2029-03-02" })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("at most five years in Gauteng") }); ok(await add({ licenceNumber: "AS-4", province: "Gauteng", validUntil: "2029-03-01" })); expect(await add({ licenceNumber: "AS-5", province: "Atlantis" })).toMatchObject({ ok: false, status: 400, error: "Choose one of the nine provinces" });
    expect((await q(`SELECT province FROM operating_licences WHERE licence_number = 'AS-4'`))[0].province).toBe("Gauteng");
  });
});
