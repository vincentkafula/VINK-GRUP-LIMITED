import bcrypt from "bcryptjs";
import type { Db } from "../portal/common.js";
import { BCRYPT_ROUNDS } from "../config/secrets.js";
import { temporaryPassword, EMAIL } from "./delegates.js";

/**
 * AN OWNER'S TEAM (docs/OWNER_DASHBOARD.md, slice E). An owner can give the people who help run the business their own login with a role, so each sees only what they need and what each does is recorded in their own name.
 *   co-owner        a partner: everything about the business, except the bank, VINK tokens, payments and the team itself
 *   fleet manager   runs the vehicles day to day: vehicles, drivers, what drivers pay, compliance and documents, costs and servicing. NOT profit, loans, takings, or the association
 *   accountant      looks, never changes: takings, profit and loss, loans, costs, what drivers pay, and the association's statements, with the exports. NOT the vehicles, drivers or documents
 * The owner's own login keeps everything and is the only one that manages the team. FAIL CLOSED: a team member can use only a path that is mapped to a module their role allows. The bank, VINK tokens, payments, requests and links, the older driver agreements, and the team itself belong to the owner's login alone, and so does anything not listed here.
 * (A driver, an association's office bearers and a marshal already have their own logins and dashboards: they are not part of an owner's team.)
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
export const TEAM_ROLES = ["co_owner", "fleet_manager", "accountant"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export const TEAM_MODULES = ["overview", "notifications", "fleet", "driverpay", "compliance", "files", "association", "costs", "finance", "earnings", "audit"] as const;
export type TeamModule = (typeof TEAM_MODULES)[number];
export const TEAM_ROLE_TEXT: Record<TeamRole, string> = { co_owner: "Co-owner", fleet_manager: "Fleet manager", accountant: "Accountant (looks only)" };
export const MAX_TEAM = 10;
/** What each role may do in each module: read only ("r"), or read and change ("rw"). A module not listed is closed to that role. */
export const TEAM_MATRIX: Record<TeamRole, Partial<Record<TeamModule, "r" | "rw">>> = {
  co_owner: { overview: "rw", notifications: "rw", fleet: "rw", driverpay: "rw", compliance: "rw", files: "rw", association: "rw", costs: "rw", finance: "rw", earnings: "rw", audit: "r" },
  fleet_manager: { overview: "r", notifications: "rw", fleet: "rw", driverpay: "rw", compliance: "rw", files: "rw", costs: "rw" },
  accountant: { overview: "r", notifications: "rw", driverpay: "r", association: "r", costs: "r", finance: "r", earnings: "r", audit: "r" },
};
/** Which module a path (relative to the owner portal) belongs to. The first match wins. A path that is not listed belongs to the owner's login alone (null). */
const PATHS: [RegExp, TeamModule | "open" | null][] = [
  [/^\/access(\/|$)/, "open"], [/^\/team(\/|$)/, null],
  [/^\/notifications(\/|$)/, "notifications"], [/^\/$/, "overview"], [/^\/map(\/|$)/, "overview"],
  [/^\/(earnings|trend|statements|statements\.csv|reports)(\/|$)/, "earnings"],
  [/^\/(vehicles|drivers|devices|loading)(\/|$)/, "fleet"], [/^\/driver-pay(\/|$)/, "driverpay"],
  [/^\/(compliance-centre|documents)(\/|$)/, "compliance"], [/^\/files(\/|$)/, "files"], [/^\/my-association(\/|$)/, "association"],
  [/^\/finance\/(costs|maintenance)(\/|$)/, "costs"], [/^\/finance(\/|$)/, "finance"], [/^\/audit(\.csv)?(\/|$)/, "audit"],
];
export function teamModuleFor(path: string): TeamModule | "open" | null { for (const [re, m] of PATHS) if (re.test(path)) return m; return null; }
export const teamCanRead = (role: TeamRole | null, m: TeamModule) => role === null || !!TEAM_MATRIX[role][m];
export const teamCanWrite = (role: TeamRole | null, m: TeamModule) => role === null || TEAM_MATRIX[role][m] === "rw";
/** May a team member with this role make this request? Reading needs read access; anything else needs write access. A path that is not mapped is refused. */
export function teamAllowed(role: TeamRole, method: string, path: string): { ok: true; module: TeamModule | "open" } | { ok: false; error: string } {
  const m = teamModuleFor(path), name = TEAM_ROLE_TEXT[role].replace(/ \(.*\)$/, "").toLowerCase(); if (m === null) return { ok: false, error: "That is for the owner's own login only" }; if (m === "open") return { ok: true, module: m };
  const level = TEAM_MATRIX[role][m]; if (!level) return { ok: false, error: `The ${name} role does not have access to that` };
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && level !== "rw") return { ok: false, error: `The ${name} role can look at that but not change it` }; return { ok: true, module: m };
}
export interface Member { userId: string; ownerId: string; role: TeamRole; name: string; username: string; disabled: boolean }
const UUID = /^[0-9a-f-]{36}$/i;

export function createOwnerTeam(db: Db, now: () => Date = () => new Date()) {
  async function resolve(userId: string): Promise<Member | null> {
    const r = (await db.query(`SELECT t.*, u.name, u.username FROM owner_team t JOIN users u ON u.id = t.user_id WHERE t.user_id = $1`, [userId])).rows[0]; if (!r) return null;
    return { userId: String(r.user_id), ownerId: String(r.owner_id), role: String(r.role) as TeamRole, name: String(r.name), username: String(r.username), disabled: !!r.disabled_at };
  }
  const own = async (owner: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM owner_team WHERE user_id = $1 AND owner_id = $2`, [id, owner])).rows[0] ?? null : null);
  async function list(owner: string) {
    return (await db.query(`SELECT t.*, u.name, u.username, u.email, u.last_login FROM owner_team t JOIN users u ON u.id = t.user_id WHERE t.owner_id = $1 ORDER BY u.name`, [owner])).rows.map((d) => ({ id: String(d.user_id), name: String(d.name), username: String(d.username), email: String(d.email), role: String(d.role) as TeamRole, roleText: TEAM_ROLE_TEXT[String(d.role) as TeamRole], disabled: !!d.disabled_at, lastLogin: d.last_login ? new Date(d.last_login as string).toISOString() : null, modules: Object.entries(TEAM_MATRIX[String(d.role) as TeamRole]).map(([module, level]) => ({ module, level })) }));
  }
  /** Gives a team member their own login. The password is made here, shown ONCE to the owner and never stored in the clear: the person should change it when they first sign in. */
  async function create(owner: string, b: Record<string, unknown>): Promise<Res<{ id: string; username: string; temporaryPassword: string }>> {
    const name = typeof b.name === "string" ? b.name.trim() : "", email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "", username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
    if (!name || name.length > 100) return bad(400, "Give their name"); if (!EMAIL.test(email) || email.length > 200) return bad(400, "Give a valid email address"); if (!/^[a-z0-9._-]{3,40}$/.test(username)) return bad(400, "A username is 3 to 40 letters, digits, dots, dashes or underscores (saved in lower case)"); if (!TEAM_ROLES.includes(b.role as never)) return bad(400, "Choose co-owner, fleet manager or accountant");
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM owner_team WHERE owner_id = $1`, [owner])).rows[0].n) >= MAX_TEAM) return bad(409, "That is the most logins an owner can give"); if ((await db.query(`SELECT 1 AS x FROM users WHERE lower(username) = $1`, [username])).rows.length) return bad(409, "That username is taken");
    const password = temporaryPassword({ username, email }), hash = await bcrypt.hash(password, BCRYPT_ROUNDS), u = (await db.query(`INSERT INTO users (username, password_hash, role, name, email) VALUES ($1,$2,'vehicle_owner',$3,$4) RETURNING id`, [username, hash, name, email])).rows[0];
    await db.query(`INSERT INTO owner_team (user_id, owner_id, role, created_by) VALUES ($1,$2,$3,$4)`, [u.id, owner, b.role, owner]); return { ok: true, value: { id: String(u.id), username, temporaryPassword: password } };
  }
  async function setRole(owner: string, id: string, role: unknown): Promise<Res<{ id: string }>> { if (!(await own(owner, id))) return bad(404, "That login was not found"); if (!TEAM_ROLES.includes(role as never)) return bad(400, "Choose co-owner, fleet manager or accountant"); await db.query(`UPDATE owner_team SET role = $2 WHERE user_id = $1`, [id, role]); return { ok: true, value: { id } }; }
  /** Switches a login off (they can no longer do anything, even with a token they already hold) or back on. */
  async function setActive(owner: string, id: string, active: boolean): Promise<Res<{ id: string }>> { if (!(await own(owner, id))) return bad(404, "That login was not found"); await db.query(`UPDATE owner_team SET disabled_at = $2 WHERE user_id = $1`, [id, active ? null : now().toISOString()]); return { ok: true, value: { id } }; }
  async function resetPassword(owner: string, id: string): Promise<Res<{ id: string; username: string; temporaryPassword: string }>> {
    if (!(await own(owner, id))) return bad(404, "That login was not found"); const u = (await db.query(`SELECT username, email FROM users WHERE id = $1`, [id])).rows[0], password = temporaryPassword({ username: String(u.username), email: String(u.email) });
    await db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, await bcrypt.hash(password, BCRYPT_ROUNDS)]); return { ok: true, value: { id, username: String(u.username), temporaryPassword: password } };
  }
  /** Whether this login is one of the owner's. */
  async function isMine(owner: string, id: string): Promise<boolean> { return !!(await own(owner, id)); }
  /** Takes back a login that was only just made and never used (for example when its invitation could not be emailed), so the owner can try again with the same username. A person who has signed in is never removed. */
  async function discard(owner: string, id: string): Promise<Res<{ id: string }>> {
    if (!(await own(owner, id))) return bad(404, "That login was not found"); const u = (await db.query(`SELECT last_login FROM users WHERE id = $1`, [id])).rows[0]; if (u?.last_login) return bad(409, "That person has already signed in");
    await db.query(`DELETE FROM owner_team WHERE user_id = $1`, [id]); await db.query(`DELETE FROM users WHERE id = $1`, [id]); return { ok: true, value: { id } };
  }
  /** What the signed-in person may do, for the screens to show only what they can use. */
  function access(m: Member | null) { const role: TeamRole | null = m?.role ?? null; return { kind: m ? "team" : "owner", name: m?.name ?? null, role, roleText: role ? TEAM_ROLE_TEXT[role] : "The owner", modules: Object.fromEntries(TEAM_MODULES.map((x) => [x, role === null ? "rw" : TEAM_MATRIX[role][x] ?? null])) as Record<TeamModule, "r" | "rw" | null> }; }
  return { resolve, list, create, setRole, setActive, resetPassword, access, isMine, discard };
}
export type OwnerTeam = ReturnType<typeof createOwnerTeam>;
