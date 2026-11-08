/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createOwnerAudit, describe as say, groupOf, AUDIT_GROUPS, MAX_LIMIT, type OwnerAudit } from "./ownerAudit.js";

/**
 * The owner's activity log. Owner O1 has a fleet manager (FM) and an accountant (AC); owner O2 has their own people. Clock: Wednesday 18 Nov 2026.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2), FM: id(10), AC: id(11), O2T: id(12), ASSOC: id(13), D1: id(6) }, V = { v1: id(20), v2: id(21) };
const NOW = new Date("2026-11-18T08:00:00Z");
let db: Db, a: OwnerAudit, n = 0;
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
/** Writes an audit record as the audit helper does, at a chosen time. */
const log = (actor: string, action: string, target: string | null, details: Record<string, unknown>, at: string, name = "x") => db.query(`INSERT INTO audit_log (id, actor_id, actor_name, action, target, details, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [`a${String(++n).padStart(4, "0")}`, actor, name, action, target, JSON.stringify(details), at]);
const ctx = () => ({ vehicles: new Map([[V.v1, "CA 111-111"]]), drivers: new Map([[U.D1, "Dan Driver"]]), people: new Map([[U.FM, "Thabo Mokoena"]]) });

beforeEach(async () => {
  n = 0; db = allPortalsDb(); a = createOwnerAudit(db, () => NOW);
  for (const [i, nm, r] of [[U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.FM, "Thabo Mokoena", "vehicle_owner"], [U.AC, "Anele Nkosi", "vehicle_owner"], [U.O2T, "Their Person", "vehicle_owner"], [U.ASSOC, "Langa Association", "association"], [U.D1, "Dan Driver", "driver"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, i, nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO owner_team (user_id, owner_id, role) VALUES ($1,$2,'fleet_manager'),($3,$2,'accountant'),($4,$5,'co_owner')`, [U.FM, U.O1, U.AC, U.O2T, U.O2]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$4,'CA 222-222','Toyota',15)`, [V.v1, U.O1, V.v2, U.O2]);
});

describe("which group an action belongs to", () => {
  it("puts each owner action in its group, and anything else in none", () => {
    const m: [string, string | null][] = [["owner.payment.record", "money"], ["owner.payment.void", "money"], ["owner.target.set", "money"], ["owner.split.set", "money"], ["owner.waiver.add", "money"], ["owner.pause.add", "money"], ["owner.cost.add", "money"], ["owner.fine.status", "money"], ["owner.loan.settle", "money"], ["owner.instalment.add", "money"], ["owner.dues.claim", "money"],
      ["owner.vehicle.driver", "fleet"], ["owner.driver.remove", "fleet"], ["owner.device_attach", "fleet"], ["owner.device_detach", "fleet"], ["owner.maintenance.add", "fleet"], ["owner.file.upload", "documents"], ["owner.file.download", "documents"], ["owner.compliance.vehicle", "documents"], ["owner.compliance.licence.add", "documents"],
      ["team.create", "team"], ["team.role", "team"], ["team.active", "team"], ["team.reset-password", "team"], ["owner.export", "exports"], ["owner.export.statement", "exports"],
      ["auth.login", null], ["admin.money.reverse", null], ["association.claim.confirm", null], ["bank.link", null], ["owners.payment", null], ["", null]];
    for (const [act, g] of m) expect(groupOf(act), act).toBe(g); expect(AUDIT_GROUPS).toEqual(["money", "fleet", "documents", "team", "exports"]);
  });
});

describe("saying what happened in plain words", () => {
  it("describes each action from the fields it knows", () => {
    const c = ctx(), t: [string, string | null, any, string][] = [
      ["owner.payment.record", "p1", { vehicleId: V.v1, amountCents: 30000, method: "cash" }, "Recorded a R300.00 payment from a driver for CA 111-111 (cash)"], ["owner.payment.void", "p1", { reason: "Entered twice" }, 'Cancelled a driver payment: "Entered twice"'],
      ["owner.target.set", "t1", { vehicleId: V.v1, period: "weekly", amountCents: 150000 }, "Set a weekly target of R1 500.00 for CA 111-111"], ["owner.target.set", "t1", { period: "daily", amountCents: 20000 }, "Set a daily target of R200.00"], ["owner.target.end", "t1", { endDate: "2026-11-30" }, "Ended a driver target on 2026-11-30"],
      ["owner.waiver.add", "w1", { vehicleId: V.v1, amountCents: 5000 }, "Waived R50.00 owed by a driver for CA 111-111"], ["owner.pause.add", "p", { vehicleId: V.v1 }, "Paused a driver's target for CA 111-111"], ["owner.split.set", "s1", { split: { a: 1 } }, "Changed how a vehicle's income is set aside"],
      ["owner.cost.add", "c1", { category: "fuel", amountCents: 60050 }, "Wrote down a fuel cost of R600.50"], ["owner.cost.add", "c1", { category: "licensing", amountCents: 100 }, "Wrote down a licence cost of R1.00"], ["owner.cost.void", "c1", { reason: "Wrong vehicle" }, 'Cancelled a cost: "Wrong vehicle"'], ["owner.fine.status", "c1", { status: "disputed" }, "Marked a fine as disputed"],
      ["owner.loan.add", "l1", { vehicleId: V.v1, lender: "WesBank" }, "Added a loan with WesBank for CA 111-111"], ["owner.loan.balance", "l1", { balanceCents: 28500000, balanceOn: "2026-11-15" }, "Updated what the lender says is owed to R285 000.00 as at 2026-11-15"], ["owner.loan.settle", "l1", { settledOn: "2026-11-10" }, "Marked a loan as paid off on 2026-11-10"], ["owner.instalment.add", "i1", { amountCents: 900000 }, "Wrote down a loan instalment of R9 000.00"], ["owner.instalment.void", "i1", { reason: "Wrong amount" }, 'Cancelled a loan instalment: "Wrong amount"'],
      ["owner.dues.claim", "d1", { associationId: "x", amountCents: 25000 }, "Said R250.00 of association dues was paid"], ["owner.dues.withdraw", "d1", {}, "Withdrew a dues payment that was waiting to be confirmed"],
      ["owner.maintenance.add", "m1", { vehicleId: V.v1, kind: "tyres" }, "Wrote down a tyres for CA 111-111"], ["owner.maintenance.add", "m1", { vehicleId: V.v1, kind: "service" }, "Wrote down a service for CA 111-111"], ["owner.maintenance.void", "m1", { reason: "Mistake" }, 'Cancelled a servicing entry: "Mistake"'],
      ["owner.vehicle.driver", V.v1, { driverId: U.D1 }, "Put a driver on a vehicle: Dan Driver (CA 111-111)"], ["owner.driver.remove", U.D1, {}, "Removed a driver: Dan Driver"], ["owner.device_attach", "dev", { vehicleId: V.v1, routeId: "r" }, "Fitted a device to a vehicle for CA 111-111"], ["owner.device_detach", "dev", {}, "Took a device off a vehicle"],
      ["owner.compliance.vehicle", V.v1, { fields: ["roadworthyExpiry"] }, "Changed a vehicle's compliance dates"], ["owner.compliance.licence.add", "lic", { vehicleId: V.v1, province: "Gauteng" }, "Added an operating licence for CA 111-111"], ["owner.compliance.licence.remove", "lic", {}, "Removed an operating licence"],
      ["owner.file.upload", "f1", { kind: "letter_of_recommendation", scan: "clean" }, "Stored a letter of recommendation (checked by an antivirus)"], ["owner.file.upload", "f1", { kind: "roadworthy", scan: "unscanned" }, "Stored a roadworthy certificate"], ["owner.file.download", "f1", {}, "Opened a stored document"], ["owner.file.delete", "f1", {}, "Deleted a stored document and erased it"],
      ["team.create", U.FM, { role: "fleet_manager", username: "thabo" }, "Gave a new login to thabo as fleet manager"], ["team.role", U.FM, { role: "accountant" }, "Changed Thabo Mokoena's role to accountant"], ["team.active", U.FM, { active: false }, "Switched off the login of Thabo Mokoena"], ["team.active", U.FM, { active: true }, "Switched on the login of Thabo Mokoena"], ["team.reset-password", U.FM, {}, "Reset the password of Thabo Mokoena"],
      ["owner.export", "profit.csv", {}, "Downloaded profit.csv"], ["owner.export.statement", null, { from: "a", to: "b" }, "Downloaded a statement"]];
    for (const [act, target, d, want] of t) expect(say(act, target, d, c), `${act} ${JSON.stringify(d)}`).toBe(want);
  });
  it("never prints stored detail it does not know, and falls back to plain words when a field is missing, the wrong type or names something that is not the owner's", () => {
    const c = ctx(); expect(say("owner.cost.add", "c", { category: "fuel", amountCents: 100, secret: "TOPSECRET", password: "hunter2" }, c)).toBe("Wrote down a fuel cost of R1.00"); expect(say("owner.cost.add", "c", { category: "fuel", amountCents: "600" }, c)).toBe("Wrote down a fuel cost of an amount"); expect(say("owner.cost.add", "c", { category: "<script>", amountCents: 1.5 }, c)).toBe("Wrote down a running cost of an amount"); expect(say("owner.cost.add", "c", {}, c)).toBe("Wrote down a running cost of an amount");
    expect(say("owner.payment.record", "p", { vehicleId: V.v2, amountCents: 100 }, c)).toBe("Recorded a R1.00 payment from a driver"); expect(say("owner.payment.record", "p", { vehicleId: V.v1, amountCents: 100, method: "x".repeat(60) }, c)).toBe(`Recorded a R1.00 payment from a driver for CA 111-111 (${"x".repeat(20)})`); expect(say("owner.payment.void", "p", { reason: "r".repeat(400) }, c)).toBe(`Cancelled a driver payment: "${"r".repeat(160)}"`); expect(say("owner.payment.void", "p", { reason: 5 }, c)).toBe("Cancelled a driver payment"); expect(say("owner.fine.status", "c", { status: "<b>" }, c)).toBe("Marked a fine as changed");
    expect(say("owner.driver.remove", id(99), {}, c)).toBe("Removed a driver"); expect(say("team.role", id(99), { role: "king" }, c)).toBe("Changed a team member's role"); expect(say("team.create", null, {}, c)).toBe("Gave a new login to a team member"); expect(say("owner.something.new", null, { a: 1 }, c)).toBe("Did something in the owner dashboard"); expect(say("owner.export.weird", "x".repeat(80), {}, c)).toBe(`Downloaded ${"x".repeat(40)}`);
  });
});

describe("whose activity it is, and what", () => {
  const T = (iso: string) => iso;
  beforeEach(async () => {
    await log(U.O1, "owner.cost.add", "c1", { category: "fuel", amountCents: 60000 }, T("2026-11-10T08:00:00Z"), "olu"); await log(U.FM, "owner.payment.record", "p1", { vehicleId: V.v1, amountCents: 30000, method: "cash" }, T("2026-11-11T08:00:00Z"), "thabo"); await log(U.AC, "owner.export", "profit.csv", {}, T("2026-11-12T08:00:00Z"), "anele");
    await log(U.O2, "owner.cost.add", "c9", { category: "fuel", amountCents: 999900 }, T("2026-11-10T09:00:00Z"), "ona"); await log(U.O2T, "owner.file.download", "f9", {}, T("2026-11-11T09:00:00Z"), "theirs"); await log(U.ASSOC, "owner.dues.claim", "d1", { amountCents: 1 }, T("2026-11-12T09:00:00Z"), "assoc");
    await log(U.O1, "auth.login", null, {}, T("2026-11-13T08:00:00Z"), "olu"); await log(U.O1, "admin.money.reverse", "x", {}, T("2026-11-13T09:00:00Z"), "olu"); await log(U.FM, "bank.link", "b", {}, T("2026-11-13T10:00:00Z"), "thabo");
  });
  it("shows what the owner and their own team did, newest first, in words, with who did it and in what role, and nothing else", async () => {
    const r = ok<any>(await a.trail(U.O1)); expect(r.entries.map((e: any) => [e.actor, e.actorRole, e.group, e.text])).toEqual([["Anele Nkosi", "Accountant (looks only)", "exports", "Downloaded profit.csv"], ["Thabo Mokoena", "Fleet manager", "money", "Recorded a R300.00 payment from a driver for CA 111-111 (cash)"], ["Olu Owner", "The owner", "money", "Wrote down a fuel cost of R600.00"]]); expect(r.next).toBeNull();
    expect(JSON.stringify(r)).not.toContain("999900"); expect(JSON.stringify(r)).not.toContain("assoc"); expect(JSON.stringify(r)).not.toContain("auth.login");
  });
  it("shows another owner only their own, and an association's or anyone else's actions never", async () => { const r = ok<any>(await a.trail(U.O2)); expect(r.entries.map((e: any) => e.actor)).toEqual(["Their Person", "Ona Owner"]); expect(r.entries.map((e: any) => e.text)).toEqual(["Opened a stored document", "Wrote down a fuel cost of R9 999.00"]); });
  it("lists the owner first and then their team, as the people it can be filtered by, with the kinds of activity", async () => { const r = ok<any>(await a.trail(U.O1)); expect(r.people.map((p: any) => [p.name, p.roleText])).toEqual([["Olu Owner", "The owner"], ["Thabo Mokoena", "Fleet manager"], ["Anele Nkosi", "Accountant (looks only)"]]); expect(r.groups.map((g: any) => g.key)).toEqual(["money", "fleet", "documents", "team", "exports"]); expect(ok<any>(await a.trail(id(99))).people.map((p: any) => p.id)).toEqual([id(99)]);                  // someone with no team: just themselves });
  it("does not show a record whose person has since been removed", async () => { await db.query(`UPDATE audit_log SET actor_id = NULL WHERE actor_name = 'thabo'`); expect(ok<any>(await a.trail(U.O1)).entries.map((e: any) => e.actor)).toEqual(["Anele Nkosi", "Olu Owner"]); });

  it("filters by kind of activity and by person, and refuses a kind or person it does not know, including another owner's", async () => {
    expect(ok<any>(await a.trail(U.O1, { group: "money" })).entries).toHaveLength(2); expect(ok<any>(await a.trail(U.O1, { group: "exports" })).entries.map((e: any) => e.actor)).toEqual(["Anele Nkosi"]); expect(ok<any>(await a.trail(U.O1, { group: "team" })).entries).toEqual([]);
    expect(ok<any>(await a.trail(U.O1, { actorId: U.FM })).entries.map((e: any) => e.actor)).toEqual(["Thabo Mokoena"]); expect(await a.trail(U.O1, { actorId: U.O2T })).toMatchObject({ ok: false, status: 404 }); expect(await a.trail(U.O1, { actorId: U.O2 })).toMatchObject({ ok: false, status: 404 }); expect(await a.trail(U.O1, { actorId: "nope" })).toMatchObject({ ok: false, status: 400 }); expect(await a.trail(U.O1, { group: "everything" })).toMatchObject({ ok: false, status: 400 });
  });
  it("filters by dates in South African time, whole days both ends, and refuses dates that make no sense", async () => {
    await log(U.O1, "owner.cost.add", "c2", { category: "fuel", amountCents: 100 }, "2026-11-14T22:30:00Z", "olu");                  // 00:30 on 15 Nov, South African time
    await log(U.O1, "owner.cost.add", "c3", { category: "fuel", amountCents: 200 }, "2026-11-15T21:59:00Z", "olu");                  // 23:59 on 15 Nov
    await log(U.O1, "owner.cost.add", "c4", { category: "fuel", amountCents: 300 }, "2026-11-15T22:00:00Z", "olu");                  // 00:00 on 16 Nov
    const day = async (from: string, to: string) => ok<any>(await a.trail(U.O1, { from, to })).entries.map((e: any) => e.text); expect(await day("2026-11-15", "2026-11-15")).toEqual(["Wrote down a fuel cost of R2.00", "Wrote down a fuel cost of R1.00"]); expect(await day("2026-11-16", "2026-11-16")).toEqual(["Wrote down a fuel cost of R3.00"]);
    expect((await day("2026-11-11", "2026-11-12")).length).toBe(2); expect(ok<any>(await a.trail(U.O1, { from: "2026-11-16" })).entries).toHaveLength(1); expect(ok<any>(await a.trail(U.O1, { to: "2026-11-10" })).entries).toHaveLength(1);
    for (const bad of [{ from: "soon" }, { to: "2026-13-45" }, { from: "2026-11-12", to: "2026-11-01" }]) expect(await a.trail(U.O1, bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("paging", () => {
  beforeEach(async () => { for (let i = 0; i < 7; i++) await log(U.O1, "owner.cost.add", `c${i}`, { category: "fuel", amountCents: (i + 1) * 100 }, i < 4 ? "2026-11-10T08:00:00Z" : `2026-11-1${i}T08:00:00Z`, "olu"); });                  // four of them share one moment
  it("pages through every line once, newest first, even when several share a moment, and ends with no marker", async () => {
    const seen: string[] = []; let before: string | undefined, pages = 0; do { const r = ok<any>(await a.trail(U.O1, { limit: 3, before })); seen.push(...r.entries.map((e: any) => e.id)); before = r.next ?? undefined; pages++; } while (before && pages < 10);
    expect(pages).toBe(3); expect(seen).toHaveLength(7); expect(new Set(seen).size).toBe(7); const all = ok<any>(await a.trail(U.O1, { limit: 50 })).entries.map((e: any) => e.id); expect(seen).toEqual(all);
  });
  it("clamps the page size, and refuses a page marker that is not one of its own", async () => {
    expect(ok<any>(await a.trail(U.O1, { limit: 0 })).entries).toHaveLength(1); expect(ok<any>(await a.trail(U.O1, { limit: -5 })).entries).toHaveLength(1); expect(ok<any>(await a.trail(U.O1, { limit: 99999 })).entries).toHaveLength(7); expect(MAX_LIMIT).toBe(200); expect(ok<any>(await a.trail(U.O1, { limit: 2.9 })).entries).toHaveLength(2);
    for (const b of ["nonsense", "|x", "2026-11-10T08:00:00Z|", "not-a-date|a0001"]) expect(await a.trail(U.O1, { before: b }), b).toMatchObject({ ok: false, status: 400 });
  });
});

describe("the spreadsheet", () => {
  it("has the date and time in South African time, who, their role, the kind and what they did, with the same scoping and filters", async () => {
    await log(U.O1, "owner.cost.add", "c1", { category: "fuel", amountCents: 60000 }, "2026-11-10T08:30:00Z", "olu"); await log(U.FM, "owner.payment.record", "p1", { vehicleId: V.v1, amountCents: 30000, method: "cash" }, "2026-11-11T22:15:00Z", "thabo"); await log(U.O2, "owner.cost.add", "c9", { category: "fuel", amountCents: 1 }, "2026-11-11T08:00:00Z", "ona");
    const t = ok<any>(await a.csv(U.O1, { from: "2026-11-01", to: "2026-11-30" })); expect(t.filename).toBe("activity-2026-11-01-to-2026-11-30.csv"); expect(t.columns).toEqual(["When (South African time)", "Who", "Their role", "Kind", "What they did"]);
    expect(t.rows).toEqual([["2026-11-12 00:15", "Thabo Mokoena", "Fleet manager", "Money", "Recorded a R300.00 payment from a driver for CA 111-111 (cash)"], ["2026-11-10 10:30", "Olu Owner", "The owner", "Money", "Wrote down a fuel cost of R600.00"]]);
    expect(ok<any>(await a.csv(U.O1)).filename).toBe("activity-start-to-2026-11-18.csv"); expect(ok<any>(await a.csv(U.O1, { actorId: U.FM })).rows).toHaveLength(1); expect(await a.csv(U.O1, { from: "x" })).toMatchObject({ ok: false, status: 400 }); expect(JSON.stringify(ok<any>(await a.csv(U.O1)))).not.toContain("ona");
  });
});
