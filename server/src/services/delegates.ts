import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { Db } from "../portal/common.js";
import { BCRYPT_ROUNDS } from "../config/secrets.js";
import { passwordProblem } from "../auth/password.js";

/**
 * NAMED OFFICE-BEARER USERS (docs/ASSOCIATION_COMPLIANCE.md, module 13).
 * An association had one login, so anyone who held it could see disciplinary cases, safety events, member identities and finance approvals. Now an association can give each office bearer their own login with a role, and the modules that name people are restricted to the roles that need them.
 *   chairperson   everything about the association except its bank and payroll
 *   secretary     registers, members, governance, discipline, safety, routes, reports
 *   treasurer     finance, and the registers and reports to read
 *   viewer        the overview, the registers, routes and reports, to read only
 * The association's own login keeps full access and manages the delegates. FAIL CLOSED: a delegate can use only paths that are mapped to a module their role allows; the bank, money, tokens, payroll and delegate management belong to the main login alone, and so does anything not listed here.
 * Everything a delegate changes is recorded in their own name, and an expense approval made by the office bearer signed in to their own account is an authenticated approval, not an attestation.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
export const ROLES = ["chairperson", "secretary", "treasurer", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const MODULES = ["overview", "registers", "members", "governance", "discipline", "finance", "safety", "routes", "reports", "operations"] as const;
export type Module = (typeof MODULES)[number];
export const ROLE_TEXT: Record<Role, string> = { chairperson: "Chairperson", secretary: "Secretary", treasurer: "Treasurer", viewer: "Viewer (read only)" };
/** What each role may do in each module: read only ("r"), or read and change ("rw"). A module not listed is closed to that role. */
export const MATRIX: Record<Role, Partial<Record<Module, "r" | "rw">>> = {
  chairperson: { overview: "rw", registers: "rw", members: "rw", governance: "rw", discipline: "rw", finance: "rw", safety: "rw", routes: "rw", reports: "rw", operations: "rw" },
  secretary: { overview: "r", registers: "rw", members: "rw", governance: "rw", discipline: "rw", safety: "rw", routes: "r", reports: "r", operations: "rw" },
  treasurer: { overview: "r", registers: "r", finance: "rw", routes: "r", reports: "r" },
  viewer: { overview: "r", registers: "r", routes: "r", reports: "r" },
};
/** Which module a path belongs to. The first match wins. A path that is not listed belongs to the main login alone (null). */
const PATHS: [RegExp, Module | "open" | null][] = [
  [/^\/access(\/|$)/, "open"], [/^\/delegates(\/|$)/, null],
  [/^\/compliance\/(summary|trend|changes)(\/|$)/, "overview"], [/^\/compliance(\/|$)/, "registers"],
  [/^\/finance(\/|$)/, "finance"], [/^\/governance\/cases(\/|$)/, "discipline"], [/^\/governance(\/|$)/, "governance"], [/^\/safety(\/|$)/, "safety"], [/^\/route-control(\/|$)/, "routes"],
  [/^\/member-register(\/|$)/, "members"], [/^\/formalisation(\/|$)/, "members"], [/^\/reports(\/|$)/, "reports"],
  [/^\/$/, "overview"], [/^\/(ledger|statements|statements\.csv|levies)(\/|$)/, "finance"], [/^\/(members|requests|vehicles|ranks|routes|terminals|map|trend)(\/|$)/, "operations"],
];
export function moduleFor(path: string): Module | "open" | null { for (const [re, m] of PATHS) if (re.test(path)) return m; return null; }
export function canRead(role: Role | null, m: Module): boolean { return role === null || !!MATRIX[role][m]; }
export function canWrite(role: Role | null, m: Module): boolean { return role === null || MATRIX[role][m] === "rw"; }
/** May a delegate with this role make this request? Reads need read access; anything else needs write access. A path that is not mapped is refused. */
export function allowed(role: Role, method: string, path: string): { ok: true; module: Module | "open" } | { ok: false; error: string } {
  const m = moduleFor(path); if (m === null) return { ok: false, error: "That is for the association's main login only" }; if (m === "open") return { ok: true, module: m };
  const level = MATRIX[role][m]; if (!level) return { ok: false, error: `The ${ROLE_TEXT[role].toLowerCase().replace(" (read only)", "")} role does not have access to that` };
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && level !== "rw") return { ok: false, error: `The ${ROLE_TEXT[role].toLowerCase().replace(" (read only)", "")} role can look at that but not change it` };
  return { ok: true, module: m };
}
/** The module each kind of flag and each kind of change-history entry belongs to, so a person sees only what their role allows. */
const FLAG_MODULE: Record<string, Module> = { registration: "registers", licence: "registers", vehicle: "registers", driver: "registers", data: "registers", formalisation: "members", members: "members", finance: "finance", governance: "governance", discipline: "discipline", safety: "safety", routes: "routes" };
const ENTITY_MODULE: Record<string, Module | null> = { registration: "registers", office_bearer: "registers", document: "registers", acceptance: "registers", vehicle: "registers", licence: "registers", licence_application: "registers", driver: "registers", settings: "registers", fee: "finance", charge: "finance", receipt: "finance", expense: "finance", deposit: "finance", budget: "finance", finance_settings: "finance", meeting: "governance", resolution: "governance", election: "governance", declaration: "governance", discipline: "discipline", safety: "safety", member: "members", non_member: "members", owner_business: "members", delegate: null };
export const flagVisible = (role: Role | null, category: string) => canRead(role, FLAG_MODULE[category] ?? "registers");
export const changeVisible = (role: Role | null, entity: string) => { const m = ENTITY_MODULE[entity]; return role === null ? true : m === null ? false : canRead(role, m ?? "registers"); };

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export function temporaryPassword(ctx: { username: string; email: string }): string { for (;;) { const p = `${Array.from({ length: 14 }, () => ALPHA[randomInt(ALPHA.length)]).join("")}-${randomInt(1000, 10000)}`; if (!passwordProblem(p, ctx)) return p; } }
export const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const UUID = /^[0-9a-f-]{36}$/i;

export interface Delegate { userId: string; associationId: string; role: Role; officeBearerId: string | null; name: string; username: string; disabled: boolean }
export function createDelegates(db: Db, now: () => Date = () => new Date()) {
  const log = async (assoc: string, id: string | null, summary: string, by: string | null) => { await db.query(`INSERT INTO register_changes (association_id, entity, entity_id, summary, changed_by) VALUES ($1,'delegate',$2,$3,$4)`, [assoc, id, summary.slice(0, 300), by]); };
  /** Is this user a delegate? Returns who they act for and with what role, or null for the association's own login. */
  async function resolve(userId: string): Promise<Delegate | null> {
    const r = (await db.query(`SELECT d.*, u.name, u.username FROM association_delegates d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1`, [userId])).rows[0]; if (!r) return null;
    return { userId: String(r.user_id), associationId: String(r.association_id), role: String(r.role) as Role, officeBearerId: (r.office_bearer_id as string | null) ?? null, name: String(r.name), username: String(r.username), disabled: !!r.disabled_at };
  }
  const own = async (assoc: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM association_delegates WHERE user_id = $1 AND association_id = $2`, [id, assoc])).rows[0] ?? null : null);
  async function list(assoc: string) {
    const ds = (await db.query(`SELECT d.*, u.name, u.username, u.email, u.last_login FROM association_delegates d JOIN users u ON u.id = d.user_id WHERE d.association_id = $1 ORDER BY u.name`, [assoc])).rows, ob = (await db.query(`SELECT id, name, office FROM office_bearers WHERE association_id = $1`, [assoc])).rows;
    return ds.map((d) => { const b = ob.find((o) => String(o.id) === String(d.office_bearer_id)); return { id: String(d.user_id), name: String(d.name), username: String(d.username), email: String(d.email), role: String(d.role) as Role, roleText: ROLE_TEXT[String(d.role) as Role], officeBearerId: (d.office_bearer_id as string | null) ?? null, officeBearer: b ? `${b.name} (${b.office})` : null, disabled: !!d.disabled_at, lastLogin: d.last_login ? new Date(d.last_login as string).toISOString() : null, modules: Object.entries(MATRIX[String(d.role) as Role]).map(([m, l]) => ({ module: m, level: l })) }; });
  }
  /** Gives an office bearer their own login. The password is made here, shown ONCE to the association and never stored in the clear: the person should change it when they first sign in. */
  async function create(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string; username: string; temporaryPassword: string }>> {
    const name = typeof b.name === "string" ? b.name.trim() : "", email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "", username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
    if (!name || name.length > 100) return bad(400, "Give their name"); if (!EMAIL.test(email) || email.length > 200) return bad(400, "Give a valid email address"); if (!/^[a-z0-9._-]{3,40}$/.test(username)) return bad(400, "A username is 3 to 40 letters, digits, dots, dashes or underscores"); if (!ROLES.includes(b.role as never)) return bad(400, "Choose chairperson, secretary, treasurer or viewer");
    let bearer: string | null = null; if (b.officeBearerId !== undefined && b.officeBearerId !== null && b.officeBearerId !== "") { const o = typeof b.officeBearerId === "string" && UUID.test(b.officeBearerId) ? (await db.query(`SELECT id FROM office_bearers WHERE id = $1 AND association_id = $2`, [b.officeBearerId, assoc])).rows[0] : null; if (!o) return bad(400, "Choose one of your office bearers"); if ((await db.query(`SELECT 1 AS x FROM association_delegates WHERE office_bearer_id = $1 AND disabled_at IS NULL`, [b.officeBearerId])).rows.length) return bad(409, "That office bearer already has a login"); bearer = String(b.officeBearerId); }
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM association_delegates WHERE association_id = $1`, [assoc])).rows[0].n) >= 20) return bad(409, "That is the most logins an association can give");
    if ((await db.query(`SELECT 1 AS x FROM users WHERE lower(username) = $1`, [username])).rows.length) return bad(409, "That username is taken");
    const password = temporaryPassword({ username, email }), hash = await bcrypt.hash(password, BCRYPT_ROUNDS), u = (await db.query(`INSERT INTO users (username, password_hash, role, name, email) VALUES ($1,$2,'association',$3,$4) RETURNING id`, [username, hash, name, email])).rows[0];
    await db.query(`INSERT INTO association_delegates (user_id, association_id, role, office_bearer_id, created_by) VALUES ($1,$2,$3,$4,$5)`, [u.id, assoc, b.role, bearer, by]); await log(assoc, String(u.id), `${name} was given their own login as ${ROLE_TEXT[b.role as Role].toLowerCase()}`, by);
    return { ok: true, value: { id: String(u.id), username, temporaryPassword: password } };
  }
  async function setRole(assoc: string, by: string, id: string, role: unknown): Promise<Res<{ id: string }>> {
    const d = await own(assoc, id); if (!d) return bad(404, "That login was not found"); if (!ROLES.includes(role as never)) return bad(400, "Choose chairperson, secretary, treasurer or viewer");
    await db.query(`UPDATE association_delegates SET role = $2 WHERE user_id = $1`, [id, role]); const name = String((await db.query(`SELECT name FROM users WHERE id = $1`, [id])).rows[0]?.name ?? ""); if (d.role !== role) await log(assoc, id, `${name}'s role changed from ${ROLE_TEXT[d.role as Role].toLowerCase()} to ${ROLE_TEXT[role as Role].toLowerCase()}`, by); return { ok: true, value: { id } };
  }
  /** Switches a login off (they can no longer do anything, even with a token they already hold) or back on. */
  async function setActive(assoc: string, by: string, id: string, active: boolean): Promise<Res<{ id: string }>> {
    const d = await own(assoc, id); if (!d) return bad(404, "That login was not found"); await db.query(`UPDATE association_delegates SET disabled_at = $2 WHERE user_id = $1`, [id, active ? null : now().toISOString()]);
    const name = String((await db.query(`SELECT name FROM users WHERE id = $1`, [id])).rows[0]?.name ?? ""); await log(assoc, id, `${name}'s login was switched ${active ? "on" : "off"}`, by); return { ok: true, value: { id } };
  }
  async function resetPassword(assoc: string, by: string, id: string): Promise<Res<{ id: string; username: string; temporaryPassword: string }>> {
    const d = await own(assoc, id); if (!d) return bad(404, "That login was not found"); const u = (await db.query(`SELECT username, email, name FROM users WHERE id = $1`, [id])).rows[0], password = temporaryPassword({ username: String(u.username), email: String(u.email) });
    await db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, await bcrypt.hash(password, BCRYPT_ROUNDS)]); await log(assoc, id, `${u.name}'s password was reset`, by); return { ok: true, value: { id, username: String(u.username), temporaryPassword: password } };
  }
  /** What the signed-in person may do, for the screens to show only what they can use. */
  function access(d: Delegate | null) { const role: Role | null = d?.role ?? null; return { kind: d ? "delegate" : "owner", name: d?.name ?? null, role, roleText: role ? ROLE_TEXT[role] : "Main login", officeBearerId: d?.officeBearerId ?? null, modules: Object.fromEntries(MODULES.map((m) => [m, role === null ? "rw" : MATRIX[role][m] ?? null])) as Record<Module, "r" | "rw" | null> }; }
  /** Whether this login is one of the association's. */
  async function isMine(assoc: string, id: string): Promise<boolean> { return !!(await own(assoc, id)); }
  /** Takes back a login that was only just made and never used (for example when its invitation could not be emailed). A person who has signed in is never removed. */
  async function discard(assoc: string, by: string, id: string): Promise<Res<{ id: string }>> {
    if (!(await own(assoc, id))) return bad(404, "That login was not found"); const u = (await db.query(`SELECT name, last_login FROM users WHERE id = $1`, [id])).rows[0]; if (u?.last_login) return bad(409, "That person has already signed in");
    await db.query(`DELETE FROM association_delegates WHERE user_id = $1`, [id]); await db.query(`DELETE FROM users WHERE id = $1`, [id]); await log(assoc, null, `${String(u?.name ?? "A")} login was taken back before it was used (its invitation could not be sent)`, by); return { ok: true, value: { id } };
  }
  return { resolve, list, create, setRole, setActive, resetPassword, access, isMine, discard };
}
export type Delegates = ReturnType<typeof createDelegates>;
