/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { passwordProblem } from "../auth/password.js";
import { createOwnerTeam, teamModuleFor, teamAllowed, teamCanRead, teamCanWrite, TEAM_MATRIX, TEAM_ROLES, TEAM_MODULES, MAX_TEAM, type OwnerTeam, type TeamRole } from "./ownerTeam.js";

/** An owner's team. Owner O1 and owner O2 each have one login to hand out. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(1), O2: id(2) };
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };

describe("which module a path belongs to", () => {
  it("maps each owner path to its module, and anything not listed to the owner's own login alone", () => {
    const m: [string, string | null][] = [["/", "overview"], ["/map", "overview"], ["/notifications", "notifications"], ["/notifications/read", "notifications"], ["/earnings", "earnings"], ["/trend", "earnings"], ["/statements", "earnings"], ["/statements.csv", "earnings"], ["/reports", "earnings"],
      ["/vehicles", "fleet"], ["/vehicles/1/driver", "fleet"], ["/drivers", "fleet"], ["/drivers/1/remove", "fleet"], ["/devices", "fleet"], ["/loading/1/end", "fleet"], ["/driver-pay/fleet", "driverpay"], ["/driver-pay/payments", "driverpay"],
      ["/compliance-centre", "compliance"], ["/compliance-centre/vehicles/1", "compliance"], ["/documents", "compliance"], ["/files", "files"], ["/files/1", "files"], ["/my-association", "association"], ["/my-association/1/statement", "association"],
      ["/finance/costs", "costs"], ["/finance/costs/1/void", "costs"], ["/finance/maintenance", "costs"], ["/finance/maintenance/status", "costs"], ["/finance/overview", "finance"], ["/finance/profit", "finance"], ["/finance/loans", "finance"], ["/finance/export/profit.pdf", "finance"], ["/finance/instalments/1/void", "finance"],
      ["/audit", "audit"], ["/audit.csv", "audit"], ["/audit/anything", "audit"], ["/access", "open"], ["/team", null], ["/team/1/role", null], ["/bank/accounts", "bank"], ["/bank", "bank"], ["/bank/transactions", "bank"], ["/money/summary", "bank"], ["/money/payments", "bank"], ["/money/agreements/1/accept", "bank"], ["/tokens/balance", "bank"], ["/tokens/cash-out", "bank"], ["/payments", null], ["/links", null], ["/requests", null], ["/agreements", null], ["/sms", null], ["/sms/phone", null], ["/sms/verify", null], ["/anything-new", null], ["", null]];
    for (const [p, want] of m) expect(teamModuleFor(p), p).toBe(want);
  });
  it("does not let a longer name borrow a shorter one's module", () => { for (const p of ["/vehiclesx", "/files-old", "/finances", "/finance-old/costs", "/driver-payments", "/teams", "/accessx", "/auditx", "/audit.csvx", "/audits", "/my-associations", "/compliance-centres", "//finance/costs", "/Finance/costs", "/finance/costsx"]) expect(teamModuleFor(p), p).toBe(p === "/finance/costsx" ? "finance" : null); });
});

describe("what each role may do", () => {
  it("is exactly the stated matrix: nothing more for any role", () => {
    expect(TEAM_MATRIX).toEqual({
      co_owner: { overview: "rw", notifications: "rw", fleet: "rw", driverpay: "rw", compliance: "rw", files: "rw", association: "rw", costs: "rw", finance: "rw", earnings: "rw", audit: "r", bank: "r" },
      fleet_manager: { overview: "r", notifications: "rw", fleet: "rw", driverpay: "rw", compliance: "rw", files: "rw", costs: "rw" },
      accountant: { overview: "r", notifications: "rw", driverpay: "r", association: "r", costs: "r", finance: "r", earnings: "r", audit: "r" } });
    expect(TEAM_ROLES).toEqual(["co_owner", "fleet_manager", "accountant"]); expect(TEAM_MODULES).toHaveLength(12);
  });
  it("keeps profit, loans, takings and the association from the fleet manager, and the vehicles, drivers and documents from the accountant", () => {
    for (const m of ["finance", "earnings", "association"] as const) expect(teamCanRead("fleet_manager", m), m).toBe(false); for (const m of ["fleet", "compliance", "files"] as const) expect(teamCanRead("accountant", m), m).toBe(false);
    expect(TEAM_ROLES.filter((r) => teamCanWrite(r, "finance"))).toEqual(["co_owner"]); expect(TEAM_ROLES.filter((r) => teamCanWrite(r, "costs"))).toEqual(["co_owner", "fleet_manager"]); expect(TEAM_ROLES.filter((r) => teamCanWrite(r, "fleet"))).toEqual(["co_owner", "fleet_manager"]); expect(TEAM_ROLES.filter((r) => teamCanRead(r, "finance"))).toEqual(["co_owner", "accountant"]);
    expect(teamCanRead(null, "finance")).toBe(true); expect(teamCanWrite(null, "finance")).toBe(true);
  });
  it("lets a read through only for a role that can read, and a change only for a role that can change, with a message that says which", () => {
    const rows: [TeamRole, string, string, boolean][] = [["accountant", "GET", "/finance/profit", true], ["accountant", "GET", "/finance/export/profit.csv", true], ["accountant", "HEAD", "/finance/loans", true], ["accountant", "POST", "/finance/costs", false], ["accountant", "POST", "/finance/loans", false], ["accountant", "DELETE", "/finance/anything", false], ["accountant", "POST", "/driver-pay/payments", false], ["accountant", "GET", "/vehicles", false], ["accountant", "GET", "/files", false], ["accountant", "GET", "/my-association/1/statement", true], ["accountant", "POST", "/my-association/claims", false], ["accountant", "POST", "/notifications/read", true],
      ["fleet_manager", "POST", "/finance/costs", true], ["fleet_manager", "POST", "/finance/maintenance", true], ["fleet_manager", "GET", "/finance/profit", false], ["fleet_manager", "GET", "/finance/loans", false], ["fleet_manager", "GET", "/finance/overview", false], ["fleet_manager", "GET", "/earnings", false], ["fleet_manager", "GET", "/statements.csv", false], ["fleet_manager", "GET", "/my-association", false], ["fleet_manager", "POST", "/vehicles", true], ["fleet_manager", "POST", "/driver-pay/payments", true], ["fleet_manager", "POST", "/files?kind=other", true], ["fleet_manager", "GET", "/", true], ["fleet_manager", "POST", "/", false],
      ["co_owner", "POST", "/finance/loans", true], ["co_owner", "GET", "/earnings", true], ["co_owner", "POST", "/my-association/claims", true], ["co_owner", "GET", "/team", false], ["co_owner", "POST", "/team", false], ["co_owner", "GET", "/bank/accounts", true], ["co_owner", "GET", "/bank/transactions", true], ["co_owner", "GET", "/money/payments", true], ["co_owner", "GET", "/tokens/wallet", true], ["co_owner", "POST", "/money/pay", false], ["co_owner", "PUT", "/bank/link", false], ["co_owner", "DELETE", "/bank/link", false], ["co_owner", "POST", "/tokens/transfer", false], ["co_owner", "POST", "/tokens/cash-out", false], ["co_owner", "POST", "/money/agreements/1/accept", false], ["co_owner", "POST", "/money/cross-border/1/confirm", false], ["fleet_manager", "GET", "/bank/accounts", false], ["accountant", "GET", "/money/payments", false], ["accountant", "GET", "/tokens/wallet", false], ["co_owner", "GET", "/payments", false], ["co_owner", "GET", "/requests", false], ["co_owner", "GET", "/sms", false], ["co_owner", "GET", "/tokens", true], ["co_owner", "GET", "/never-heard-of-it", false],
      ["co_owner", "GET", "/audit", true], ["co_owner", "GET", "/audit.csv", true], ["co_owner", "POST", "/audit", false], ["accountant", "GET", "/audit", true], ["accountant", "GET", "/audit.csv", true], ["accountant", "DELETE", "/audit", false], ["fleet_manager", "GET", "/audit", false], ["fleet_manager", "GET", "/audit.csv", false],
      ["co_owner", "GET", "/access", true], ["fleet_manager", "GET", "/access", true], ["accountant", "POST", "/access", true]];
    for (const [r, m, p, want] of rows) expect(teamAllowed(r, m, p.split("?")[0]).ok, `${r} ${m} ${p}`).toBe(want);
    expect(teamAllowed("accountant", "POST", "/finance/costs")).toEqual({ ok: false, error: "The accountant role can look at that but not change it" }); expect(teamAllowed("fleet_manager", "GET", "/finance/profit")).toEqual({ ok: false, error: "The fleet manager role does not have access to that" }); expect(teamAllowed("co_owner", "GET", "/bank/accounts")).toEqual({ ok: true, module: "bank" }); expect(teamAllowed("co_owner", "PUT", "/bank/link")).toEqual({ ok: false, error: "The co-owner role can look at that but not change it" }); expect(teamAllowed("co_owner", "GET", "/payments")).toEqual({ ok: false, error: "That is for the owner's own login only" });
  });
  it("is case-insensitive about the method, and refuses an unknown path whatever the role", () => { expect(teamAllowed("accountant", "get", "/finance/profit").ok).toBe(true); expect(teamAllowed("accountant", "post", "/finance/profit").ok).toBe(false); for (const r of TEAM_ROLES) expect(teamAllowed(r, "GET", "/never-heard-of-it").ok, r).toBe(false); });
});

describe("the logins", () => {
  let db: Db, t: OwnerTeam; const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
  beforeEach(async () => { db = allPortalsDb(); t = createOwnerTeam(db, () => new Date("2026-11-02T08:00:00Z")); for (const [i, nm] of [[U.O1, "Olu Owner"], [U.O2, "Ona Owner"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,'vehicle_owner')`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`]); });
  const make = (o: any = {}, owner = U.O1) => t.create(owner, { name: "Thabo Mokoena", email: "Thabo@Langa.test", username: "Thabo", role: "fleet_manager", ...o });
  it("makes a login with a password that meets the policy, differs each time and is stored only as a hash, as an ordinary owner account that is also on the team", async () => {
    const r = ok<any>(await make()); expect(r.username).toBe("thabo"); expect(passwordProblem(r.temporaryPassword, { username: "thabo", email: "thabo@langa.test" })).toBeNull(); expect(r.temporaryPassword.length).toBeGreaterThanOrEqual(15); const u = (await q(`SELECT username, email, role, password_hash FROM users WHERE id = $1`, [r.id]))[0]; expect(u).toMatchObject({ username: "thabo", email: "thabo@langa.test", role: "vehicle_owner" }); expect(u.password_hash).not.toContain(r.temporaryPassword); expect(await bcrypt.compare(r.temporaryPassword, u.password_hash)).toBe(true);
    expect(await t.resolve(r.id)).toMatchObject({ userId: r.id, ownerId: U.O1, role: "fleet_manager", name: "Thabo Mokoena", username: "thabo", disabled: false }); expect(await t.resolve(U.O1)).toBeNull(); expect(await t.resolve(id(99))).toBeNull(); expect(ok<any>(await make({ username: "second", email: "s@x.test" })).temporaryPassword).not.toBe(r.temporaryPassword);
  });
  it("refuses what is not valid, a taken username (whatever the capitals), and more than ten logins", async () => {
    for (const [bad, why] of [[{ name: "" }, /name/], [{ name: "x".repeat(150) }, /name/], [{ email: "nope" }, /email/], [{ username: "ab" }, /username/], [{ username: "has space" }, /username/], [{ role: "chairperson" }, /co-owner/], [{ role: undefined }, /co-owner/]] as const) expect(await make(bad), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(why) });
    ok(await make()); expect(await make({ username: "THABO", email: "other@x.test" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("taken") }); expect(await make({ username: "olu-owner-name" }, U.O2)).toMatchObject({ ok: true });
    for (let i = 0; i < MAX_TEAM - 1; i++) ok(await make({ username: `more${i}`, email: `m${i}@x.test` })); expect(await make({ username: "onemore", email: "one@x.test" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("most logins") });
  }, 120_000);
  it("lists the owner's own team with what each role can do, and none of another owner's", async () => {
    ok(await make()); ok(await make({ username: "acc", email: "a@x.test", name: "Anele Accountant", role: "accountant" })); ok(await make({ username: "theirs", email: "t@x.test" }, U.O2)); const l = await t.list(U.O1); expect(l.map((x) => [x.name, x.role, x.roleText, x.disabled])).toEqual([["Anele Accountant", "accountant", "Accountant (looks only)", false], ["Thabo Mokoena", "fleet_manager", "Fleet manager", false]]); expect(l[1].modules.map((m) => `${m.module}:${m.level}`)).toEqual(["overview:r", "notifications:rw", "fleet:rw", "driverpay:rw", "compliance:rw", "files:rw", "costs:rw"]); expect((await t.list(U.O2)).map((x) => x.username)).toEqual(["theirs"]);
  });
  it("changes a role, switches a login off and on, and resets a password, only for the owner's own team", async () => {
    const r = ok<any>(await make()); expect(await t.setRole(U.O1, r.id, "king")).toMatchObject({ ok: false, status: 400 }); expect(await t.setRole(U.O2, r.id, "accountant")).toMatchObject({ ok: false, status: 404 }); expect(await t.setRole(U.O1, "nope", "accountant")).toMatchObject({ ok: false, status: 404 }); ok(await t.setRole(U.O1, r.id, "accountant")); expect((await t.resolve(r.id))!.role).toBe("accountant");
    ok(await t.setActive(U.O1, r.id, false)); expect((await t.resolve(r.id))!.disabled).toBe(true); ok(await t.setActive(U.O1, r.id, true)); expect((await t.resolve(r.id))!.disabled).toBe(false); expect(await t.setActive(U.O2, r.id, false)).toMatchObject({ ok: false, status: 404 });
    const before = (await q(`SELECT password_hash FROM users WHERE id = $1`, [r.id]))[0].password_hash, p = ok<any>(await t.resetPassword(U.O1, r.id)); expect(p.temporaryPassword).not.toBe(r.temporaryPassword); const after = (await q(`SELECT password_hash FROM users WHERE id = $1`, [r.id]))[0].password_hash; expect(after).not.toBe(before); expect(await bcrypt.compare(p.temporaryPassword, after)).toBe(true); expect(await bcrypt.compare(r.temporaryPassword, after)).toBe(false); expect(await t.resetPassword(U.O2, r.id)).toMatchObject({ ok: false, status: 404 });
  });
  it("describes what the signed-in person may do: everything for the owner, the role's modules for a team member", async () => {
    expect(t.access(null)).toMatchObject({ kind: "owner", name: null, role: null, roleText: "The owner", modules: { finance: "rw", earnings: "rw", fleet: "rw" } }); const r = ok<any>(await make({ role: "accountant" })); const a = t.access((await t.resolve(r.id))!); expect(a).toMatchObject({ kind: "team", name: "Thabo Mokoena", role: "accountant", roleText: "Accountant (looks only)", modules: { finance: "r", costs: "r", audit: "r", fleet: null, files: null, compliance: null } }); expect(Object.keys(a.modules)).toEqual([...TEAM_MODULES]);
  });
});
