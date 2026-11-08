import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay } from "./compliance.js";
import { TEAM_ROLE_TEXT, type TeamRole } from "./ownerTeam.js";

/**
 * THE OWNER'S ACTIVITY LOG (docs/OWNER_DASHBOARD.md, slice F): who did what, when, in plain words. It reads the audit records the owner dashboard already writes, so it adds nothing to record and nothing that was not already recorded.
 *   whose        what the OWNER did, and what anyone on their team did. Nobody else's actions and no other owner's
 *   what         only the owner dashboard's own actions (payments, targets, costs, fines, loans, servicing, vehicles and drivers, documents, dues, the team, exports), never anything else in the audit log
 *   how          each line says specifically what happened (an amount, a vehicle, a reason) from fields it knows and checks: stored detail is never printed raw, and a password is never recorded in the first place
 * It is for looking: a change can only be corrected by a new entry, never by editing the trail.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
export const AUDIT_GROUPS = ["money", "fleet", "documents", "team", "exports"] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number];
export const GROUP_TEXT: Record<AuditGroup, string> = { money: "Money: payments, targets, costs, fines, loans, dues", fleet: "Vehicles, drivers, devices and servicing", documents: "Documents and compliance", team: "The team", exports: "Downloads" };
/** The action prefixes that make up each group. */
const GROUP_LIKE: Record<AuditGroup, string[]> = {
  money: ["owner.payment.%", "owner.target.%", "owner.split.%", "owner.waiver.%", "owner.pause.%", "owner.cost.%", "owner.fine.%", "owner.loan.%", "owner.instalment.%", "owner.dues.%", "owner.plan.%"],
  fleet: ["owner.vehicle.%", "owner.driver.%", "owner.device_%", "owner.maintenance.%"], documents: ["owner.file.%", "owner.compliance.%", "owner.business.%"], team: ["team.%"], exports: ["owner.export%"],
};
export const groupOf = (action: string): AuditGroup | null => { for (const g of AUDIT_GROUPS) for (const p of GROUP_LIKE[g]) { const stem = p.replace(/%$/, ""); if (p.endsWith("%") ? action.startsWith(stem) : action === p) return g; } return null; };
export const MAX_LIMIT = 200, MAX_EXPORT = 5000;
const UUID = /^[0-9a-f-]{36}$/i;
const rand = (c: number) => { const [i, d] = Math.abs(c / 100).toFixed(2).split("."); return `${c < 0 ? "-" : ""}R${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${d}`; };
/** "a fuel cost", "an insurance cost". */
const an = (w: string) => `${/^[aeiou]/i.test(w) ? "an" : "a"} ${w}`;
const str = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const cents = (v: unknown): string | null => (typeof v === "number" && Number.isInteger(v) ? rand(v) : null);
const KIND: Record<string, string> = { letter_of_recommendation: "letter of recommendation", membership_certificate: "membership certificate", membership_card: "membership card", roadworthy: "roadworthy certificate", insurance: "insurance document", operating_licence: "operating licence", licence_disc: "licence disc", driver_agreement: "driver agreement", other: "document", service: "service", repair: "repair", tyres: "tyres", brakes: "brakes", reading: "odometer reading" };
const MAINT: Record<string, string> = { service: "a service", repair: "a repair", tyres: "new tyres", brakes: "brake work", reading: "an odometer reading" };
const CAT: Record<string, string> = { fuel: "fuel", maintenance: "maintenance", insurance: "insurance", tracker: "tracker", fine: "fine", association: "association", licensing: "licence", tyres: "tyre", wages: "wages", other: "miscellaneous" };
const FIELD: Record<string, string> = { kind: "how you trade", tradingName: "the trading name", registeredName: "the registered name", registrationNumber: "the registration number", vatNumber: "the VAT number", phone: "the phone number", email: "the email address", address: "the address" };
const ROLE_WORD: Record<string, string> = { co_owner: "co-owner", fleet_manager: "fleet manager", accountant: "accountant" };
interface Ctx { vehicles: Map<string, string>; drivers: Map<string, string>; people: Map<string, string> }

/** One line of plain words for an action. Only fields it knows, of the type it expects, are used: anything else is ignored, and an action it does not know is shown as a plain "did something" rather than as raw data. */
export function describe(action: string, target: string | null, d: Record<string, unknown>, c: Ctx): string {
  const car = (v: unknown) => (typeof v === "string" && c.vehicles.get(v)) || null, on = (v: unknown) => { const r = car(v); return r ? ` for ${r}` : ""; }, why = (v: unknown) => { const r = str(v, 160); return r ? `: "${r}"` : ""; };
  switch (action) {
    case "owner.payment.record": return `Recorded a ${cents(d.amountCents) ?? "payment"} payment from a driver${on(d.vehicleId)}${str(d.method, 20) ? ` (${str(d.method, 20)})` : ""}`;
    case "owner.payment.void": return `Cancelled a driver payment${why(d.reason)}`;
    case "owner.target.set": return `Set a ${str(d.period, 10) === "weekly" ? "weekly" : "daily"} target of ${cents(d.amountCents) ?? "an amount"}${on(d.vehicleId)}`;
    case "owner.target.end": return `Ended a driver target${str(d.endDate, 10) ? ` on ${str(d.endDate, 10)}` : ""}`;
    case "owner.split.set": return "Changed how a vehicle's income is set aside";
    case "owner.waiver.add": return `Waived ${cents(d.amountCents) ?? "an amount"} owed by a driver${on(d.vehicleId)}`;
    case "owner.pause.add": return `Paused a driver's target${on(d.vehicleId)}`;
    case "owner.cost.add": return `Wrote down ${an(`${CAT[String(d.category)] ?? "running"} cost`)} of ${cents(d.amountCents) ?? "an amount"}`;
    case "owner.cost.void": return `Cancelled a cost${why(d.reason)}`;
    case "owner.fine.status": return `Marked a fine as ${["unpaid", "paid", "disputed"].includes(String(d.status)) ? String(d.status) : "changed"}`;
    case "owner.loan.add": return `Added a loan${str(d.lender, 60) ? ` with ${str(d.lender, 60)}` : ""}${on(d.vehicleId)}`;
    case "owner.loan.balance": return `Updated what the lender says is owed to ${cents(d.balanceCents) ?? "a new amount"}${str(d.balanceOn, 10) ? ` as at ${str(d.balanceOn, 10)}` : ""}`;
    case "owner.loan.settle": return `Marked a loan as paid off${str(d.settledOn, 10) ? ` on ${str(d.settledOn, 10)}` : ""}`;
    case "owner.instalment.add": return `Wrote down a loan instalment of ${cents(d.amountCents) ?? "an amount"}`;
    case "owner.instalment.void": return `Cancelled a loan instalment${why(d.reason)}`;
    case "owner.dues.claim": return `Said ${cents(d.amountCents) ?? "an amount"} of association dues was paid`;
    case "owner.dues.withdraw": return "Withdrew a dues payment that was waiting to be confirmed";
    case "owner.maintenance.add": return `Wrote down ${MAINT[String(d.kind)] ?? "servicing"}${on(d.vehicleId)}`;
    case "owner.maintenance.void": return `Cancelled a servicing entry${why(d.reason)}`;
    case "owner.vehicle.driver": return `Put a driver on a vehicle${typeof d.driverId === "string" && c.drivers.get(d.driverId) ? `: ${c.drivers.get(d.driverId)}` : ""}${typeof target === "string" && c.vehicles.get(target) ? ` (${c.vehicles.get(target)})` : ""}`;
    case "owner.driver.remove": return `Removed a driver${typeof target === "string" && c.drivers.get(target) ? `: ${c.drivers.get(target)}` : ""}`;
    case "owner.device_attach": return `Fitted a device to a vehicle${on(d.vehicleId)}`;
    case "owner.device_detach": return "Took a device off a vehicle";
    case "owner.compliance.vehicle": return "Changed a vehicle's compliance dates";
    case "owner.compliance.licence.add": return `Added an operating licence${on(d.vehicleId)}`;
    case "owner.compliance.licence.remove": return "Removed an operating licence";
    case "owner.file.upload": return `Stored ${an(KIND[String(d.kind)] ?? "document")}${d.scan === "clean" ? " (checked by an antivirus)" : ""}`;
    case "owner.file.download": return "Opened a stored document";
    case "owner.file.delete": return "Deleted a stored document and erased it";
    case "owner.plan.save": return `Saved the vehicle plan${str(d.name, 60) ? ` "${str(d.name, 60)}"` : ""}`;
    case "owner.plan.delete": return "Deleted a vehicle plan";
    case "owner.business.save": { const w = (Array.isArray(d.changed) ? d.changed : []).map((k) => FIELD[String(k)]).filter(Boolean); return `Saved the business details${w.length ? `: changed ${w.join(", ")}` : ""}`; }
    case "owner.business.remove": return "Deleted the business details";
    case "team.create": return `Gave a new login to ${str(d.username, 40) ?? "a team member"}${ROLE_WORD[String(d.role)] ? ` as ${ROLE_WORD[String(d.role)]}` : ""}`;
    case "team.role": return `Changed ${typeof target === "string" && c.people.get(target) ? c.people.get(target) : "a team member"}'s role${ROLE_WORD[String(d.role)] ? ` to ${ROLE_WORD[String(d.role)]}` : ""}`;
    case "team.active": return `${d.active === false ? "Switched off" : "Switched on"} the login of ${typeof target === "string" && c.people.get(target) ? c.people.get(target) : "a team member"}`;
    case "team.reset-password": return `Reset the password of ${typeof target === "string" && c.people.get(target) ? c.people.get(target) : "a team member"}`;
    default: if (action.startsWith("owner.export")) return `Downloaded ${action === "owner.export.statement" ? "a statement" : str(target, 40) ? `${str(target, 40)}` : "a report"}`; return "Did something in the owner dashboard";
  }
}

export interface Entry { id: string; at: string; actorId: string | null; actor: string; actorRole: string; group: AuditGroup; action: string; text: string }
export function createOwnerAudit(db: Db, now: () => Date = () => new Date()) {
  /** The owner and each member of their team: who counts as "theirs". */
  async function people(owner: string) {
    const o = (await db.query(`SELECT id, name FROM users WHERE id = $1`, [owner])).rows[0], t = (await db.query(`SELECT t.user_id, t.role, u.name FROM owner_team t JOIN users u ON u.id = t.user_id WHERE t.owner_id = $1`, [owner])).rows;
    return [{ id: owner, name: o ? String(o.name) : "The owner", role: "owner", roleText: "The owner" }, ...t.map((x) => ({ id: String(x.user_id), name: String(x.name), role: String(x.role), roleText: TEAM_ROLE_TEXT[String(x.role) as TeamRole] ?? String(x.role) }))];
  }
  const dayStart = (d: string) => new Date(`${d}T00:00:00+02:00`).toISOString();
  const dayAfter = (d: string) => new Date(new Date(`${d}T00:00:00+02:00`).getTime() + 86_400_000).toISOString();
  /** The activity, newest first. Filter by group, person and dates; `before` (from the last page's `next`) gives the next page. */
  async function trail(owner: string, o: { group?: string; actorId?: string; from?: string; to?: string; before?: string; limit?: number } = {}): Promise<Res<{ entries: Entry[]; next: string | null; people: { id: string; name: string; role: string; roleText: string }[]; groups: { key: AuditGroup; label: string }[] }>> {
    if (o.group && !AUDIT_GROUPS.includes(o.group as never)) return bad(400, "That is not a kind of activity I know");
    if ((o.from && !isDay(o.from)) || (o.to && !isDay(o.to)) || (o.from && o.to && o.to < o.from)) return bad(400, "Give the dates as YYYY-MM-DD, with the first before the last");
    if (o.actorId && !UUID.test(o.actorId)) return bad(400, "That is not one of your people");
    const who = await people(owner); if (o.actorId && !who.some((p) => p.id === o.actorId)) return bad(404, "That is not one of your people");
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(o.limit ?? 50))), ids = o.actorId ? [o.actorId] : who.map((p) => p.id), args: unknown[] = [], ph = (v: unknown) => { args.push(v); return `$${args.length}`; };
    const likes = (o.group ? GROUP_LIKE[o.group as AuditGroup] : [...new Set(Object.values(GROUP_LIKE).flat())]).map((p) => `action LIKE ${ph(p)}`).join(" OR ");
    const where = [`actor_id IN (${ids.map((i) => ph(i)).join(",")})`, `(${likes})`];
    if (o.from) where.push(`created_at >= ${ph(dayStart(o.from))}`); if (o.to) where.push(`created_at < ${ph(dayAfter(o.to))}`);
    if (o.before) { const [t, i] = o.before.split("|"); if (!t || !i || Number.isNaN(Date.parse(t))) return bad(400, "That page marker is not valid"); where.push(`(created_at < ${ph(t)} OR (created_at = ${ph(t)} AND id < ${ph(i)}))`); }
    const rows = (await db.query(`SELECT * FROM audit_log WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`, args)).rows;
    const vehicles = new Map((await db.query(`SELECT id, registration FROM vehicles WHERE owner_id = $1`, [owner])).rows.map((v) => [String(v.id), String(v.registration)])), drivers = new Map((await db.query(`SELECT id, name FROM users WHERE role = 'driver'`)).rows.map((u) => [String(u.id), String(u.name)])), names = new Map(who.map((p) => [p.id, p.name])), ctx: Ctx = { vehicles, drivers, people: names };
    const page = rows.slice(0, limit), roleOf = new Map(who.map((p) => [p.id, p.roleText]));
    const entries = page.map((r): Entry => { const d = (typeof r.details === "string" ? safeJson(r.details) : (r.details as Record<string, unknown>)) ?? {}, aid = r.actor_id ? String(r.actor_id) : null; return { id: String(r.id), at: new Date(r.created_at as string).toISOString(), actorId: aid, actor: (aid && names.get(aid)) || String(r.actor_name), actorRole: (aid && roleOf.get(aid)) || "", group: groupOf(String(r.action)) ?? "money", action: String(r.action), text: describe(String(r.action), (r.target as string | null) ?? null, d, ctx) }; });
    const last = page[page.length - 1]; return { ok: true, value: { entries, next: rows.length > limit && last ? `${new Date(last.created_at as string).toISOString()}|${last.id}` : null, people: who, groups: AUDIT_GROUPS.map((k) => ({ key: k, label: GROUP_TEXT[k] })) } };
  }
  /** The same activity for a spreadsheet: up to 5 000 lines, with the date, the person, their role, the kind and what they did. */
  async function csv(owner: string, o: { group?: string; actorId?: string; from?: string; to?: string } = {}): Promise<Res<{ filename: string; columns: string[]; rows: unknown[][] }>> {
    const r = await trail(owner, { ...o, limit: MAX_EXPORT }); if (!r.ok) return r; const label = (g: AuditGroup) => GROUP_TEXT[g].split(":")[0];
    return { ok: true, value: { filename: `activity-${o.from ?? "start"}-to-${o.to ?? saDay(now())}.csv`, columns: ["When (South African time)", "Who", "Their role", "Kind", "What they did"], rows: r.value.entries.map((e) => [new Date(new Date(e.at).getTime() + 2 * 3_600_000).toISOString().replace("T", " ").slice(0, 16), e.actor, e.actorRole, label(e.group), e.text]) } };
  }
  return { trail, csv, people };
}
const safeJson = (s: string): Record<string, unknown> | null => { try { const v = JSON.parse(s); return v && typeof v === "object" ? (v as Record<string, unknown>) : null; } catch { return null; } };
export type OwnerAudit = ReturnType<typeof createOwnerAudit>;
