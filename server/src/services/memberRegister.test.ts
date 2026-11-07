/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createMembers, type Members } from "./memberRegister.js";
import { validateSaId } from "./saIdValidator.js";

/** The member register and owner formalisation. Association A has owners O1 (vehicles v1, v2; drivers D1 to D3) and O2 (vehicle v3); B is a stranger with O3 (vehicle v9). Fixed clock: Monday 2 Nov 2026. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) }, V = { v1: id(20), v2: id(21), v3: id(22), v9: id(29) }, ROUTE = id(40), TERMINAL = id(60);
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02";
let db: Db, m: Members;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** A South African ID number with a correct check digit: birth date, a four-digit sequence, citizen (0), 8, and the Luhn digit. */
function saId(yymmdd: string, seq = "5009"): string { const d = `${yymmdd}${seq}08`; let sum = 0; for (let i = 0; i < 12; i++) { let n = Number(d[11 - i]); if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; } sum += n; } return d + String((10 - (sum % 10)) % 10); }
const ID1 = saId("800101"), ID2 = saId("750315", "1234");

beforeEach(async () => {
  db = allPortalsDb(); m = createMembers(db, () => NOW);
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dan Driver", "driver"], [U.D2, "Dee Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${nm.split(" ")[0].toLowerCase()}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by, responded_at) VALUES ($1,$2,'vehicle_owner','active','member','2025-03-10T08:00:00Z'),($1,$3,'vehicle_owner','active','member','2026-01-05T08:00:00Z'),($4,$5,'vehicle_owner','active','member','2026-01-05T08:00:00Z')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner'),($1,$3,'active','owner'),($1,$4,'active','owner')`, [U.O1, U.D1, U.D2, U.D3]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CA 333-333','Toyota',15),($6,$7,'ZZ 999-999','Toyota',15)`, [V.v1, U.O1, V.v2, V.v3, U.O2, V.v9, U.O3]);
  await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Langa to Bellville',2500)`, [ROUTE, U.A]); await db.query(`INSERT INTO terminals (id, serial, api_key_hash) VALUES ($1,'T-MEMBERS','x')`, [TERMINAL]);
});
const trip = (vehicle: string, days: number) => db.query(`INSERT INTO loading_sessions (terminal_id, vehicle_id, route_id, status, started_at) VALUES ($1,$2,$3,'closed',$4)`, [TERMINAL, vehicle, ROUTE, new Date(Date.parse(`${plus(days)}T08:00:00Z`))]);
const reg = async (assoc = U.A) => m.register(assoc, TODAY);
const row = async (member: string) => (await reg()).members.find((x) => x.memberId === member)!;
const flagIds = async () => (await reg()).flags.map((f) => f.id);

describe("the test's own ID numbers", () => { it("are valid South African ID numbers", () => { expect(validateSaId(ID1)?.valid).toBe(true); expect(validateSaId(ID2)?.valid).toBe(true); expect(validateSaId(ID1.slice(0, 12) + String((Number(ID1[12]) + 1) % 10))?.valid).toBe(false); }); });

describe("the member register", () => {
  it("lists the association's active owner members with when they joined, their vehicles and defaults, and none of another association's", async () => {
    const r = await reg(); expect(r.members.map((x) => [x.name, x.joinedOn, x.membershipClass, x.entityType, x.standing, x.idNumberMasked, x.vehicles.map((v) => v.registration)])).toEqual([["Olu Owner", "2025-03-10", "member", "individual", "active", null, ["CA 111-111", "CA 222-222"]], ["Ona Owner", "2026-01-05", "member", "individual", "active", null, ["CA 333-333"]]]);
    expect((await reg(U.B)).members.map((x) => x.name)).toEqual(["Otto Owner"]); await db.query(`UPDATE memberships SET status = 'removed' WHERE member_id = $1`, [U.O2]); expect((await reg()).members.map((x) => x.name)).toEqual(["Olu Owner"]);
  });
  it("shows what each member owes and how long it is overdue, and how many disciplinary cases they have, without describing them", async () => {
    await db.query(`INSERT INTO levies (association_id, member_id, title, amount, due_date) VALUES ($1,$2,'Annual','600.00',$3)`, [U.A, U.O1, plus(-120)]); await db.query(`INSERT INTO disciplinary_cases (association_id, subject_kind, subject_id, subject_name, complaint, opened_on, closed_on) VALUES ($1,'member',$2,'Olu Owner','Secret complaint',$3,NULL),($1,'member',$2,'Olu Owner','Another',$3,$4)`, [U.A, U.O1, plus(-50), plus(-10)]);
    const r = await row(U.O1); expect(r).toMatchObject({ owedCents: 60000, overdueCents: 60000, daysOverdue: 120, disciplinaryCases: { open: 1, closed: 1 } }); expect(JSON.stringify(r)).not.toContain("Secret"); expect(await row(U.O2)).toMatchObject({ owedCents: 0, disciplinaryCases: { open: 0, closed: 0 } });
  });
  it("flags a member with no ID or company number on record (low), and stops once one is recorded", async () => {
    expect((await reg()).flags.filter((f) => f.id.startsWith("members:identity")).map((f) => [f.subject, f.severity])).toEqual([["Olu Owner", "low"], ["Ona Owner", "low"]]); ok(await m.saveMember(U.A, U.A, U.O1, { idNumber: ID1 })); expect(await flagIds()).not.toContain(`members:identity:${U.O1}`); expect(await flagIds()).toContain(`members:identity:${U.O2}`);
  });
  it("flags a member who also belongs to another association unless consent is recorded, and forgets consent when the other membership is cleared", async () => {
    ok(await m.saveMember(U.A, U.A, U.O1, { dualMemberOf: "Bellville Taxi Association" })); const f = (await reg()).flags.find((x) => x.id === `members:dual:${U.O1}`)!; expect(f).toMatchObject({ severity: "medium", message: "Olu Owner is also a member of Bellville Taxi Association, and no consent is recorded" });
    ok(await m.saveMember(U.A, U.A, U.O1, { dualConsent: true })); expect(await flagIds()).not.toContain(`members:dual:${U.O1}`); expect(await row(U.O1)).toMatchObject({ dualMemberOf: "Bellville Taxi Association", dualConsent: true }); ok(await m.saveMember(U.A, U.A, U.O1, { dualMemberOf: null })); expect(await row(U.O1)).toMatchObject({ dualMemberOf: null, dualConsent: false });
    ok(await m.saveMember(U.A, U.A, U.O1, { dualMemberOf: "Another TA" })); expect(await flagIds()).toContain(`members:dual:${U.O1}`);                  // the earlier consent was for the earlier association
  });
  it("flags a suspended or terminated member whose vehicles still ran trips in the last 30 days, and not an active one or one that was quiet", async () => {
    await trip(V.v1, -2); await trip(V.v2, -3); await trip(V.v3, -1); await trip(V.v3, -45); ok(await m.saveMember(U.A, U.A, U.O1, { standing: "suspended", standingReason: "Fee dispute" })); let f = (await reg()).flags.filter((x) => x.id.startsWith("members:standing"));
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ id: `members:standing:${U.O1}`, severity: "high", message: "Olu Owner is suspended, but their vehicles ran 2 trips on your routes in the last 30 days" }); ok(await m.saveMember(U.A, U.A, U.O2, { standing: "terminated", standingReason: "Left the association" })); f = (await reg()).flags.filter((x) => x.id.startsWith("members:standing")); expect(f.map((x) => x.id).sort()).toEqual([`members:standing:${U.O1}`, `members:standing:${U.O2}`].sort());
    ok(await m.saveMember(U.A, U.A, U.O1, { standing: "active" })); expect((await reg()).flags.some((x) => x.id === `members:standing:${U.O1}`)).toBe(false);
  });
  it("reports the figures: members, suspended and terminated, how many have an identity on record, dual members and active non-member operators", async () => {
    ok(await m.saveMember(U.A, U.A, U.O1, { idNumber: ID1, dualMemberOf: "X TA", standing: "suspended", standingReason: "Fees" })); ok(await m.addNonMember(U.A, U.A, { name: "Visitor", vehicleRegistration: "ZZ 111-222", notedOn: TODAY }));
    expect((await reg()).measures).toEqual({ members: 2, suspended: 1, terminated: 0, identityRecordedPercent: 50, dualMembers: 1, activeNonMembers: 1 }); expect((await reg(U.B)).measures).toMatchObject({ members: 1, identityRecordedPercent: 0, activeNonMembers: 0 });
  });
});

describe("saving a member", () => {
  it("takes a legal name, entity type, ID, phone, card and notes, and returns the ID masked, never in full", async () => {
    ok(await m.saveMember(U.A, U.A, U.O1, { legalName: "Olu Owner Transport (Pty) Ltd", entityType: "company", idNumber: "2015/123456/07", phone: "+27 82 123 4567", cardNumber: "MC-0001", notes: "Paid joining fee in cash" }));
    expect(await row(U.O1)).toMatchObject({ legalName: "Olu Owner Transport (Pty) Ltd", entityType: "company", idNumberMasked: `${"•".repeat(10)}6/07`, phone: "+27821234567", cardNumber: "MC-0001", notes: "Paid joining fee in cash" });
    ok(await m.saveMember(U.A, U.A, U.O2, { idNumber: ID2 })); const r = await row(U.O2); expect(r.idNumberMasked).toBe(`${"•".repeat(9)}${ID2.slice(-4)}`); expect(JSON.stringify(await reg())).not.toContain(ID2); expect(JSON.stringify(await reg())).not.toContain("2015/123456");
  });
  it("checks the ID against the entity type: a real South African ID for an individual, a registration number for anything else", async () => {
    for (const bad of ["12345", ID1.slice(0, 12) + String((Number(ID1[12]) + 1) % 10), "not an id"]) expect(await m.saveMember(U.A, U.A, U.O1, { idNumber: bad }), bad).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("South African ID") });
    ok(await m.saveMember(U.A, U.A, U.O1, { entityType: "company", idNumber: "2015/123456/07" })); expect(await m.saveMember(U.A, U.A, U.O1, { idNumber: "!!" })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("company or registration number") });
    expect(await m.saveMember(U.A, U.A, U.O1, { entityType: "individual" })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("not a South African ID") }); ok(await m.saveMember(U.A, U.A, U.O1, { entityType: "individual", idNumber: ID1 })); ok(await m.saveMember(U.A, U.A, U.O1, { idNumber: null })); expect((await row(U.O1)).idNumberMasked).toBeNull();
  });
  it("validates the other fields and refuses what it should", async () => {
    for (const [bad, why] of [[{ entityType: "club" }, /individual, company/], [{ legalName: "x".repeat(130) }, /too long/], [{ phone: "12" }, /phone number/], [{ phone: "abc" }, /phone number/], [{ cardNumber: "x".repeat(50) }, /too long/], [{ standing: "banned" }, /active, suspended or terminated/], [{ dualConsent: "yes" }, /yes or no/], [{ notes: "x".repeat(400) }, /too long/], [{}, /Nothing to change/]] as const) expect(await m.saveMember(U.A, U.A, U.O1, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    expect(await m.saveMember(U.A, U.A, U.O3, { notes: "x" })).toMatchObject({ ok: false, status: 404 }); expect(await m.saveMember(U.B, U.B, U.O1, { notes: "x" })).toMatchObject({ ok: false, status: 404 }); expect(await m.saveMember(U.A, U.A, "nope", { notes: "x" })).toMatchObject({ ok: false, status: 404 });
  });
  it("gives a card number to one member only (whatever the capitals), lets a member keep or change their own, and lets it be freed", async () => {
    ok(await m.saveMember(U.A, U.A, U.O1, { cardNumber: "MC-0001" })); expect(await m.saveMember(U.A, U.A, U.O2, { cardNumber: "mc-0001" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("belongs to another member") }); ok(await m.saveMember(U.A, U.A, U.O1, { cardNumber: "MC-0001", notes: "same card" })); ok(await m.saveMember(U.A, U.A, U.O1, { cardNumber: "MC-0009" })); ok(await m.saveMember(U.A, U.A, U.O2, { cardNumber: "MC-0001" }));
    ok(await m.saveMember(U.A, U.A, U.O2, { cardNumber: null })); ok(await m.saveMember(U.A, U.A, U.O1, { cardNumber: "MC-0001" }));
  });
  it("needs a reason to suspend or terminate, records the day it changed, and clears the reason when the member is active again", async () => {
    expect(await m.saveMember(U.A, U.A, U.O1, { standing: "suspended" })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("Say why the member is suspended") }); expect(await m.saveMember(U.A, U.A, U.O1, { standing: "terminated", standingReason: "x".repeat(300) })).toMatchObject({ ok: false, status: 400 });
    ok(await m.saveMember(U.A, U.A, U.O1, { standing: "suspended", standingReason: "Unpaid levies" })); expect(await row(U.O1)).toMatchObject({ standing: "suspended", standingReason: "Unpaid levies", standingChangedOn: TODAY }); ok(await m.saveMember(U.A, U.A, U.O1, { standingReason: "Unpaid levies for 6 months" })); expect((await row(U.O1)).standingReason).toBe("Unpaid levies for 6 months");
    ok(await m.saveMember(U.A, U.A, U.O1, { standing: "terminated" })); expect(await row(U.O1)).toMatchObject({ standing: "terminated", standingReason: "Unpaid levies for 6 months" }); ok(await m.saveMember(U.A, U.A, U.O1, { standing: "active" })); expect(await row(U.O1)).toMatchObject({ standing: "active", standingReason: null });
  });
  it("logs each change in the history without the ID number or the phone number", async () => {
    ok(await m.saveMember(U.A, U.A, U.O1, { idNumber: ID1, phone: "+27821234567", cardNumber: "MC-0001", standing: "suspended", standingReason: "Fees" })); const log = JSON.stringify(await q(`SELECT summary FROM register_changes WHERE entity = 'member'`)); expect(log).toContain("Olu Owner: ID or company number changed"); expect(log).toContain("phone changed"); expect(log).toContain("card_number (empty) → MC-0001"); expect(log).not.toContain(ID1); expect(log).not.toContain("0821234567");
    expect((await q(`SELECT summary FROM register_changes WHERE entity = 'member'`)).some((r) => r.summary.includes("standing active → suspended"))).toBe(true); ok(await m.saveMember(U.A, U.A, U.O1, { cardNumber: "MC-0001" })); expect((await q(`SELECT COUNT(*) AS n FROM register_changes WHERE entity = 'member'`))[0].n).toBe(5);                  // saving what is already there logs nothing
  });
});

describe("operators who are not members", () => {
  const add = (o: any = {}) => m.addNonMember(U.A, U.A, { name: "Visiting Vusi", phone: "082 111 2222", vehicleRegistration: "zz  111-222", routeLabel: "Langa to Bellville", notedOn: plus(-3), notes: "Seen at the rank daily", ...o });
  it("records an operator and their vehicle (the registration tidied), validated, and refuses a member's vehicle or one that is already listed", async () => {
    for (const [bad, st] of [[{ name: "" }, 400], [{ vehicleRegistration: "" }, 400], [{ phone: "x" }, 400], [{ notedOn: plus(1) }, 400], [{ notedOn: "soon" }, 400], [{ routeLabel: "x".repeat(200) }, 400], [{ vehicleRegistration: "ca 111-111" }, 409]] as const) expect(await add(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: st });
    expect((await add({ vehicleRegistration: "ca 111-111" }) as any).error).toContain("belongs to your member Olu Owner"); ok(await add()); expect((await m.nonMembers(U.A))[0]).toMatchObject({ name: "Visiting Vusi", vehicleRegistration: "ZZ 111-222", phone: "0821112222", endedOn: null }); expect(await add({ vehicleRegistration: "ZZ 111-222" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already in your register") });
    expect(await m.nonMembers(U.B)).toEqual([]); ok(await m.addNonMember(U.B, U.B, { name: "Someone", vehicleRegistration: "ZZ 111-222", notedOn: TODAY }));                  // another association may list the same vehicle
  });
  it("ends an entry once, after it was noted and not in the future, and then the vehicle can be listed again", async () => {
    const n = ok<any>(await add()); for (const bad of [plus(-4), plus(1), "soon", undefined]) expect(await m.endNonMember(U.A, U.A, n.id, bad), String(bad)).toMatchObject({ ok: false, status: 400 }); expect(await m.endNonMember(U.B, U.B, n.id, TODAY)).toMatchObject({ ok: false, status: 404 });
    ok(await m.endNonMember(U.A, U.A, n.id, TODAY)); expect(await m.endNonMember(U.A, U.A, n.id, TODAY)).toMatchObject({ ok: false, status: 409 }); expect((await m.nonMembers(U.A))[0].endedOn).toBe(TODAY); ok(await add({ notedOn: TODAY })); expect((await m.nonMembers(U.A)).map((x) => !!x.endedOn)).toEqual([false, true]);
  });
  it("lists the outside vehicles seen on the routes in the last 30 days that are not in the register, once each, and stops when they are added", async () => {
    await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'ZZ 111-222','T',15)`, [id(28), U.O3]); await trip(V.v9, -2); await trip(V.v9, -3); await trip(id(28), -1); await trip(V.v9, -40);
    let r = await reg(); expect(r.unregisteredOperators.map((o) => [o.registration, o.owner, o.trips])).toEqual([["ZZ 999-999", "Otto Owner", 2], ["ZZ 111-222", "Otto Owner", 1]]); expect(r.flags.find((f) => f.id === "members:nonmember:unregistered")).toMatchObject({ severity: "low", message: "2 vehicles from outside the association operated on your routes in the last 30 days and are not in your register of non-member operators" });
    ok(await add({ vehicleRegistration: "ZZ 999-999" })); r = await reg(); expect(r.unregisteredOperators.map((o) => o.registration)).toEqual(["ZZ 111-222"]); expect(r.flags.find((f) => f.id === "members:nonmember:unregistered")!.message).toContain("1 vehicle from outside the association operated"); ok(await add({ vehicleRegistration: "zz 111-222" })); expect((await reg()).flags.some((f) => f.id === "members:nonmember:unregistered")).toBe(false);
  });
});

describe("owner formalisation", () => {
  const driver = (d: string, o: any) => db.query(`INSERT INTO driver_register (driver_id, employment_status, contract_on_file, pay_basis, uif_registered, coida_registered) VALUES ($1,$2,$3,$4,$5,$6)`, [d, o.employment ?? "unknown", !!o.contract, o.pay ?? "unknown", !!o.uif, !!o.coida]);
  const own = async (o: string) => (await m.formalisation(U.A, TODAY)).owners.find((x) => x.ownerId === o)!;
  const fids = async () => (await m.formalisation(U.A, TODAY)).flags.map((f) => f.id);
  it("saves an owner's business and registrations, validated: a SARS tax reference is ten digits, the choices are known, and the date is not in the future", async () => {
    ok(await m.saveBusiness(U.A, U.A, U.O1, { businessType: "company", registrationNo: "2015/123456/07", taxNumber: "0123 456 789", taxRegistered: true, filingStatus: "up_to_date", uifEmployer: true, coidaEmployer: true, sdlRegistered: false, checkedOn: plus(-5), notes: "Documents seen" }));
    expect(await own(U.O1)).toMatchObject({ businessType: "company", registrationNo: "2015/123456/07", taxNumberMasked: "•••••••789", taxRegistered: true, filingStatus: "up_to_date", uifEmployer: true, coidaEmployer: true, sdlRegistered: false, checkedOn: plus(-5), notes: "Documents seen" });
    for (const [bad, why] of [[{ businessType: "empire" }, /sole proprietor/], [{ filingStatus: "late" }, /up to date/], [{ taxNumber: "12345" }, /ten digits/], [{ taxNumber: "01234567890" }, /ten digits/], [{ taxRegistered: "yes" }, /yes or no/], [{ uifEmployer: 1 }, /yes or no/], [{ checkedOn: plus(1) }, /not in the future/], [{ registrationNo: "x".repeat(50) }, /too long/], [{ notes: "x".repeat(400) }, /too long/], [{}, /Nothing to change/]] as const) expect(await m.saveBusiness(U.A, U.A, U.O1, bad as any), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    expect(await m.saveBusiness(U.A, U.A, U.O3, { businessType: "company" })).toMatchObject({ ok: false, status: 404 }); expect(await m.saveBusiness(U.B, U.B, U.O1, { businessType: "company" })).toMatchObject({ ok: false, status: 404 }); ok(await m.saveBusiness(U.A, U.A, U.O1, { taxNumber: null })); expect((await own(U.O1)).taxNumberMasked).toBeNull();
  });
  it("never returns or logs the full tax number, and logs the other changes", async () => {
    ok(await m.saveBusiness(U.A, U.A, U.O1, { taxNumber: "0123456789", businessType: "sole_proprietor" })); expect(JSON.stringify(await m.formalisation(U.A, TODAY))).not.toContain("0123456789"); const log = JSON.stringify(await q(`SELECT summary FROM register_changes WHERE entity = 'owner_business'`)); expect(log).toContain("Olu Owner: tax number changed"); expect(log).toContain("business_type unknown → sole_proprietor"); expect(log).not.toContain("0123456789");
  });
  it("flags an owner whose business has not been recorded (low), and one who has drivers on record but is not recorded as an employer with UIF, COIDA and SDL", async () => {
    let f = await fids(); expect(f).toContain(`formal:type:${U.O1}`); expect(f).toContain(`formal:type:${U.O2}`); expect(f).toContain(`formal:uif:${U.O1}`); expect(f).toContain(`formal:coida:${U.O1}`); expect(f).toContain(`formal:sdl:${U.O1}`); expect(f).not.toContain(`formal:uif:${U.O2}`);                  // O2 has no drivers on record
    const fl = (await m.formalisation(U.A, TODAY)).flags; expect(fl.find((x) => x.id === `formal:uif:${U.O1}`)).toMatchObject({ severity: "medium", message: "Olu Owner has 3 drivers on record but is not recorded as registered with UIF as an employer" }); expect(fl.find((x) => x.id === `formal:sdl:${U.O1}`)).toMatchObject({ severity: "low" }); expect(fl.find((x) => x.id === `formal:sdl:${U.O1}`)!.message).toContain("applies only to employers above a payroll threshold");
    ok(await m.saveBusiness(U.A, U.A, U.O1, { businessType: "company", uifEmployer: true, coidaEmployer: true, sdlRegistered: true })); f = await fids(); for (const x of ["type", "uif", "coida", "sdl"]) expect(f, x).not.toContain(`formal:${x}:${U.O1}`);
  });
  it("flags tax filing reported as overdue, and drivers paid in cash with no contract", async () => {
    ok(await m.saveBusiness(U.A, U.A, U.O2, { filingStatus: "overdue" })); expect((await m.formalisation(U.A, TODAY)).flags.find((x) => x.id === `formal:filing:${U.O2}`)).toMatchObject({ severity: "medium", message: "Ona Owner has reported that their tax filing is overdue" }); ok(await m.saveBusiness(U.A, U.A, U.O2, { filingStatus: "up_to_date" })); expect(await fids()).not.toContain(`formal:filing:${U.O2}`);
    await driver(U.D1, { employment: "employed", contract: true, pay: "salary", uif: true, coida: true }); await driver(U.D2, { employment: "contractor", pay: "cash" }); expect((await m.formalisation(U.A, TODAY)).flags.find((x) => x.id === `formal:cash:${U.O1}`)).toMatchObject({ severity: "low", message: "1 of Olu Owner's 3 drivers is paid in cash with no contract on file" });
    await db.query(`UPDATE driver_register SET contract_on_file = true WHERE driver_id = $1`, [U.D2]); expect(await fids()).not.toContain(`formal:cash:${U.O1}`);
  });
  it("reports progress: businesses recorded, tax registered, employers registered, and drivers formally employed (employed, contract, UIF and COIDA), each as an exact share", async () => {
    await driver(U.D1, { employment: "employed", contract: true, pay: "salary", uif: true, coida: true }); await driver(U.D2, { employment: "employed", contract: true, pay: "salary", uif: true, coida: false }); ok(await m.saveBusiness(U.A, U.A, U.O1, { businessType: "company", taxRegistered: true, uifEmployer: true, coidaEmployer: true }));
    const r = await m.formalisation(U.A, TODAY); expect(r.owners.find((o) => o.ownerId === U.O1)).toMatchObject({ drivers: 3, driversFormal: 1, driversPaidCashNoContract: 0 }); expect(r.measures).toEqual({ owners: 2, businessRecordedPercent: 50, taxRegisteredPercent: 50, employersRegisteredPercent: 100, drivers: 3, driversFormal: 1, driversFormalPercent: 33.3 });
    expect((await m.formalisation(U.B, TODAY)).measures).toMatchObject({ owners: 1, drivers: 0, driversFormalPercent: null, employersRegisteredPercent: null });                  // nothing to measure: no percentage, not 0% or NaN
  });
});
