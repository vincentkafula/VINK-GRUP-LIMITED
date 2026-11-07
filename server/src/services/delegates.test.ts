/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { passwordProblem } from "../auth/password.js";
import { createDelegates, moduleFor, allowed, canRead, canWrite, flagVisible, changeVisible, MATRIX, ROLES, MODULES, type Delegates, type Role } from "./delegates.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2) };
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };

describe("which module a path belongs to", () => {
  it("maps each association path to its module, and anything not listed to the main login alone", () => {
    const m: [string, string | null][] = [["/compliance/summary", "overview"], ["/compliance/trend", "overview"], ["/compliance/changes", "overview"], ["/compliance/vehicles", "registers"], ["/compliance/registration", "registers"], ["/compliance/drivers/abc", "registers"], ["/compliance/settings", "registers"],
      ["/finance/summary", "finance"], ["/finance/receipts/x.pdf", "finance"], ["/ledger", "finance"], ["/statements", "finance"], ["/statements.csv", "finance"], ["/levies", "finance"], ["/levies/1/paid", "finance"],
      ["/governance/summary", "governance"], ["/governance/meetings", "governance"], ["/governance/cases", "discipline"], ["/governance/cases/1", "discipline"], ["/safety/events", "safety"], ["/route-control", "routes"], ["/member-register", "members"], ["/member-register/non-members", "members"], ["/formalisation/1", "members"],
      ["/reports/packs", "reports"], ["/reports/csv/members.csv", "reports"], ["/", "overview"], ["/members", "operations"], ["/members/1/respond", "operations"], ["/requests", "operations"], ["/vehicles", "operations"], ["/ranks", "operations"], ["/ranks/1/marshals", "operations"], ["/routes", "operations"], ["/map", "operations"], ["/trend", "operations"], ["/terminals", "operations"],
      ["/access", "open"], ["/delegates", null], ["/delegates/1/role", null], ["/bank/accounts", null], ["/money/summary", null], ["/tokens/balance", null], ["/commission/settings", null], ["/payruns", null], ["/payslips/1", null], ["/adjustments", null], ["/shifts", null], ["/anything-new", null], ["", null]];
    for (const [p, want] of m) expect(moduleFor(p), p).toBe(want);
  });
  it("does not let a longer name borrow a shorter one's module, or a lookalike prefix match", () => {
    for (const p of ["/finances", "/finance-old", "/governance-x", "/governancecases", "/safetyx", "/reportsx", "/compliance-x", "/member-registers", "/formalisations", "/accessx", "/delegatesx", "/route-controlx", "/members-x", "//finance", "/Finance", "/FINANCE/summary"]) expect(moduleFor(p), p).toBe(null);
    expect(moduleFor("/governance/cases-old")).toBe("governance");                                                                                      // the discipline rule needs the whole segment: this is an ordinary governance path
  });
});

describe("what each role may do", () => {
  it("never gives a role a module it was not meant to have: the matrix is exactly the stated one", () => {
    expect(MATRIX).toEqual({
      chairperson: { overview: "rw", registers: "rw", members: "rw", governance: "rw", discipline: "rw", finance: "rw", safety: "rw", routes: "rw", reports: "rw", operations: "rw" },
      secretary: { overview: "r", registers: "rw", members: "rw", governance: "rw", discipline: "rw", safety: "rw", routes: "r", reports: "r", operations: "rw" },
      treasurer: { overview: "r", registers: "r", finance: "rw", routes: "r", reports: "r" },
      viewer: { overview: "r", registers: "r", routes: "r", reports: "r" } });
    expect(ROLES).toEqual(["chairperson", "secretary", "treasurer", "viewer"]); expect(MODULES).toHaveLength(10);
  });
  it("lets only the roles that need them into the modules that name people", () => {
    for (const m of ["discipline", "safety", "members"] as const) expect(ROLES.filter((r) => canRead(r, m))).toEqual(["chairperson", "secretary"]); expect(ROLES.filter((r) => canRead(r, "finance"))).toEqual(["chairperson", "treasurer"]); expect(ROLES.filter((r) => canWrite(r, "finance"))).toEqual(["chairperson", "treasurer"]);
    expect(ROLES.filter((r) => canRead(r, "governance"))).toEqual(["chairperson", "secretary"]); expect(ROLES.every((r) => canRead(r, "overview") && canRead(r, "reports") && canRead(r, "registers") && canRead(r, "routes"))).toBe(true); expect(ROLES.filter((r) => canWrite(r, "reports"))).toEqual(["chairperson"]);
    expect(canRead(null, "discipline")).toBe(true); expect(canWrite(null, "finance")).toBe(true);                                                          // the main login
  });
  it("lets a read through only for a role that can read, and a change only for a role that can change, with a message that says which", () => {
    const rows: [Role, string, string, boolean][] = [["viewer", "GET", "/compliance/vehicles", true], ["viewer", "HEAD", "/compliance/vehicles", true], ["viewer", "OPTIONS", "/compliance/vehicles", true], ["viewer", "POST", "/compliance/vehicles/1/licences", false], ["viewer", "PUT", "/compliance/registration", false], ["viewer", "DELETE", "/compliance/licences/1", false], ["viewer", "GET", "/finance/summary", false], ["viewer", "PATCH", "/reports/schedules", false],
      ["treasurer", "GET", "/compliance/registration", true], ["treasurer", "PUT", "/compliance/registration", false], ["treasurer", "POST", "/finance/receipts", true], ["treasurer", "DELETE", "/finance/anything", true], ["treasurer", "GET", "/governance/cases", false], ["treasurer", "POST", "/reports/schedules", false],
      ["secretary", "POST", "/governance/cases", true], ["secretary", "GET", "/finance/summary", false], ["secretary", "POST", "/finance/receipts", false], ["secretary", "POST", "/reports/schedules", false], ["secretary", "GET", "/reports/pack/finance.pdf", true],
      ["chairperson", "POST", "/finance/receipts", true], ["chairperson", "POST", "/reports/schedules", true], ["chairperson", "GET", "/bank/accounts", false], ["chairperson", "GET", "/delegates", false], ["chairperson", "GET", "/access", true], ["viewer", "GET", "/access", true], ["viewer", "POST", "/access", true]];
    for (const [r, m, p, want] of rows) expect(allowed(r, m, p).ok, `${r} ${m} ${p}`).toBe(want);
    expect(allowed("viewer", "POST", "/compliance/registration")).toEqual({ ok: false, error: "The viewer role can look at that but not change it" }); expect(allowed("treasurer", "GET", "/governance/cases")).toEqual({ ok: false, error: "The treasurer role does not have access to that" }); expect(allowed("chairperson", "GET", "/bank/accounts")).toEqual({ ok: false, error: "That is for the association's main login only" });
  });
  it("is case-insensitive about the method, and refuses an unknown path whatever the role", () => { expect(allowed("viewer", "get", "/compliance/summary").ok).toBe(true); expect(allowed("viewer", "post", "/compliance/summary").ok).toBe(false); for (const r of ROLES) expect(allowed(r, "GET", "/never-heard-of-it").ok, r).toBe(false); });
});

describe("what each role may see in flags and history", () => {
  it("shows a flag only to a role that can read its module, with the main login seeing all, and an unknown kind treated as a register flag", () => {
    for (const c of ["registration", "licence", "vehicle", "driver", "data"]) { for (const r of ROLES) expect(flagVisible(r, c), `${r} ${c}`).toBe(true); }
    expect(ROLES.filter((r) => flagVisible(r, "discipline"))).toEqual(["chairperson", "secretary"]); expect(ROLES.filter((r) => flagVisible(r, "safety"))).toEqual(["chairperson", "secretary"]); expect(ROLES.filter((r) => flagVisible(r, "members"))).toEqual(["chairperson", "secretary"]); expect(ROLES.filter((r) => flagVisible(r, "formalisation"))).toEqual(["chairperson", "secretary"]);
    expect(ROLES.filter((r) => flagVisible(r, "finance"))).toEqual(["chairperson", "treasurer"]); expect(ROLES.filter((r) => flagVisible(r, "governance"))).toEqual(["chairperson", "secretary"]); expect(ROLES.every((r) => flagVisible(r, "routes"))).toBe(true); expect(flagVisible(null, "discipline")).toBe(true); expect(flagVisible("viewer", "something-new")).toBe(true);
  });
  it("shows a history entry only to a role that can read what it is about, and the logins only to the main login", () => {
    for (const e of ["discipline"]) expect(ROLES.filter((r) => changeVisible(r, e))).toEqual(["chairperson", "secretary"]); for (const e of ["safety", "member", "non_member", "owner_business"]) expect(ROLES.filter((r) => changeVisible(r, e)), e).toEqual(["chairperson", "secretary"]);
    for (const e of ["fee", "charge", "receipt", "expense", "deposit", "budget", "finance_settings"]) expect(ROLES.filter((r) => changeVisible(r, e)), e).toEqual(["chairperson", "treasurer"]); for (const e of ["meeting", "resolution", "election", "declaration"]) expect(ROLES.filter((r) => changeVisible(r, e)), e).toEqual(["chairperson", "secretary"]);
    for (const e of ["registration", "office_bearer", "document", "acceptance", "vehicle", "licence", "licence_application", "driver", "settings"]) expect(ROLES.every((r) => changeVisible(r, e)), e).toBe(true); expect(ROLES.some((r) => changeVisible(r, "delegate"))).toBe(false); expect(changeVisible(null, "delegate")).toBe(true); expect(changeVisible("viewer", "something-new")).toBe(true);
  });
});

describe("the logins", () => {
  let db: Db, d: Delegates; const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
  beforeEach(async () => { db = allPortalsDb(); d = createDelegates(db, () => new Date("2026-11-02T08:00:00Z")); for (const [i, nm] of [[U.A, "Langa Taxi Association"], [U.B, "Other Association"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,'association')`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`]); });
  const make = (o: any = {}) => d.create(U.A, U.A, { name: "Sipho Dube", email: "Sipho@Langa.test", username: "Sipho", role: "treasurer", ...o });
  it("makes a login with a password that meets the password policy, differs each time, and is stored only as a hash", async () => {
    const seen = new Set<string>(); for (let i = 0; i < 6; i++) { const r = ok<any>(await make({ username: `user${i}`, email: `u${i}@x.test` })); expect(passwordProblem(r.temporaryPassword, { username: `user${i}`, email: `u${i}@x.test` })).toBeNull(); expect(r.temporaryPassword.length).toBeGreaterThanOrEqual(15); seen.add(r.temporaryPassword); const row = (await q(`SELECT password_hash FROM users WHERE id = $1`, [r.id]))[0]; expect(row.password_hash).not.toContain(r.temporaryPassword); expect(await bcrypt.compare(r.temporaryPassword, row.password_hash)).toBe(true); }
    expect(seen.size).toBe(6);
  });
  it("tidies the username and email, makes the user an association account, and finds them again as a delegate (and nobody else)", async () => {
    const r = ok<any>(await make()); expect(r.username).toBe("sipho"); expect((await q(`SELECT username, email, role FROM users WHERE id = $1`, [r.id]))[0]).toEqual({ username: "sipho", email: "sipho@langa.test", role: "association" });
    expect(await d.resolve(r.id)).toMatchObject({ userId: r.id, associationId: U.A, role: "treasurer", name: "Sipho Dube", username: "sipho", disabled: false }); expect(await d.resolve(U.A)).toBeNull(); expect(await d.resolve(id(99))).toBeNull();
  });
  it("refuses what is not valid, a taken username (whatever the capitals), and more than twenty logins", async () => {
    for (const [bad, why] of [[{ name: "" }, /name/], [{ name: "x".repeat(150) }, /name/], [{ email: "nope" }, /email/], [{ username: "ab" }, /username/], [{ username: "has space" }, /username/], [{ username: "x".repeat(50) }, /username/], [{ role: "admin" }, /chairperson/]] as const) expect(await make(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    ok(await make()); expect(await make({ username: "SIPHO", email: "other@x.test" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("taken") }); expect(await d.create(U.B, U.B, { name: "X", email: "x@x.test", username: "sipho", role: "viewer" })).toMatchObject({ ok: false, status: 409 });
    for (let i = 0; i < 19; i++) ok(await make({ username: `more${i}`, email: `m${i}@x.test` })); expect(await make({ username: "onemore", email: "one@x.test" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("most logins") }); expect(ok<any>(await d.create(U.B, U.B, { name: "B's", email: "b@x.test", username: "bsperson", role: "viewer" })).username).toBe("bsperson");
  }, 120_000);                  // twenty real password hashes take a while
  it("links a login to one of the association's office bearers, once, and not to another association's", async () => {
    await db.query(`INSERT INTO office_bearers (id, association_id, name, office) VALUES ($1,$2,'Sipho Dube','Treasurer'),($3,$4,'B Person','Chair')`, [id(10), U.A, id(11), U.B]); expect(await make({ officeBearerId: id(11) })).toMatchObject({ ok: false, status: 400 }); expect(await make({ officeBearerId: "nope" })).toMatchObject({ ok: false, status: 400 });
    const r = ok<any>(await make({ officeBearerId: id(10) })); expect((await d.list(U.A))[0]).toMatchObject({ officeBearerId: id(10), officeBearer: "Sipho Dube (Treasurer)" }); expect(await make({ username: "second", email: "s@x.test", officeBearerId: id(10) })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already has a login") });
    ok(await d.setActive(U.A, U.A, r.id, false)); ok(await make({ username: "second", email: "s@x.test", officeBearerId: id(10) }));                                                           // once the first is switched off, the office bearer can be given another
  });
  it("lists the association's own logins with what each role can do, and none of another association's", async () => {
    ok(await make()); ok(await d.create(U.B, U.B, { name: "B's", email: "b@x.test", username: "bsperson", role: "viewer" })); const l = await d.list(U.A); expect(l).toHaveLength(1); expect(l[0]).toMatchObject({ name: "Sipho Dube", role: "treasurer", roleText: "Treasurer", disabled: false, lastLogin: null }); expect(l[0].modules).toEqual([{ module: "overview", level: "r" }, { module: "registers", level: "r" }, { module: "finance", level: "rw" }, { module: "routes", level: "r" }, { module: "reports", level: "r" }]); expect((await d.list(U.B)).map((x) => x.username)).toEqual(["bsperson"]);
  });
  it("changes a role (logging only a real change), switches a login off and on, and resets a password, only for the association's own logins", async () => {
    const r = ok<any>(await make()); expect(await d.setRole(U.A, U.A, r.id, "king")).toMatchObject({ ok: false, status: 400 }); expect(await d.setRole(U.B, U.B, r.id, "viewer")).toMatchObject({ ok: false, status: 404 }); expect(await d.setRole(U.A, U.A, "nope", "viewer")).toMatchObject({ ok: false, status: 404 });
    ok(await d.setRole(U.A, U.A, r.id, "treasurer")); ok(await d.setRole(U.A, U.A, r.id, "secretary")); expect((await d.resolve(r.id))!.role).toBe("secretary"); ok(await d.setActive(U.A, U.A, r.id, false)); expect((await d.resolve(r.id))!.disabled).toBe(true); ok(await d.setActive(U.A, U.A, r.id, true)); expect((await d.resolve(r.id))!.disabled).toBe(false); expect(await d.setActive(U.B, U.B, r.id, false)).toMatchObject({ ok: false, status: 404 });
    const before = (await q(`SELECT password_hash FROM users WHERE id = $1`, [r.id]))[0].password_hash, p = ok<any>(await d.resetPassword(U.A, U.A, r.id)); expect(p.temporaryPassword).not.toBe(r.temporaryPassword); expect((await q(`SELECT password_hash FROM users WHERE id = $1`, [r.id]))[0].password_hash).not.toBe(before); expect(await d.resetPassword(U.B, U.B, r.id)).toMatchObject({ ok: false, status: 404 });
    const log = (await q(`SELECT summary FROM register_changes WHERE entity = 'delegate' ORDER BY changed_at`)).map((x) => x.summary); expect(log).toHaveLength(5); expect(log[1]).toBe("Sipho Dube's role changed from treasurer to secretary"); expect(log[2]).toContain("switched off"); expect(log[3]).toContain("switched on"); expect(log[4]).toContain("password was reset"); expect(JSON.stringify(log)).not.toContain(p.temporaryPassword); expect(JSON.stringify(log)).not.toContain(r.temporaryPassword);
  });
  it("describes what the signed-in person may do: everything for the main login, the role's modules for a delegate", async () => {
    expect(d.access(null)).toMatchObject({ kind: "owner", name: null, role: null, roleText: "Main login", modules: { finance: "rw", discipline: "rw" } }); const r = ok<any>(await make({ name: "Sipho Dube" })); const a = d.access((await d.resolve(r.id))!); expect(a).toMatchObject({ kind: "delegate", name: "Sipho Dube", role: "treasurer", roleText: "Treasurer", modules: { overview: "r", finance: "rw", discipline: null, safety: null, members: null, governance: null } }); expect(Object.keys(a.modules)).toEqual([...MODULES]);
  });
});
