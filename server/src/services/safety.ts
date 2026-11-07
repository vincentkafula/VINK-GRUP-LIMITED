import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { isDay, daysBetween, flagSort, createCompliance, type Flag } from "./compliance.js";

/**
 * ASSOCIATION SAFETY AND CONFLICT (docs/ASSOCIATION_COMPLIANCE.md, module 9): accidents, passenger complaints, disputes with other associations, police matters and regulator notices, recorded per vehicle, driver and route.
 * The Gauteng commission found route saturation and unresolved disputes behind taxi violence, and a provincial MEC can close routes and associations that incite it (NLTA section 91): so the association needs a record of what happened, who was involved,
 * whether it was mediated and escalated (to SANTACO or the National Taxi Alliance), and what the regulator told it. These records name identifiable people: they are for named office bearers.
 * It records what the association says happened and flags patterns (a vehicle or driver with repeated incidents, a dispute left open, a spike on a route). It does not say anyone is at fault.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
export const KINDS = ["accident", "passenger_complaint", "inter_association_dispute", "police_matter", "regulator_notice"] as const;
export const KIND_TEXT: Record<string, string> = { accident: "Accident", passenger_complaint: "Passenger complaint", inter_association_dispute: "Dispute with another association", police_matter: "Police matter", regulator_notice: "Regulator notice" };
const ESCALATIONS = ["santaco", "national_taxi_alliance", "other"] as const;
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
const text = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** The limits behind the flags, in days (disputes) and counts (repeat incidents). */
export const LIMITS = { disputeDays: 30, disputeHighDays: 60, policeDays: 90, repeatMedium: 3, repeatHigh: 5, spikeMin: 3 } as const;

export function createSafety(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now()), comp = createCompliance(db, now);
  const log = async (assoc: string, entityId: string | null, summary: string, by: string | null) => { await db.query(`INSERT INTO register_changes (association_id, entity, entity_id, summary, changed_by) VALUES ($1,'safety',$2,$3,$4)`, [assoc, entityId, summary.slice(0, 300), by]); };
  const ownVehicle = async (assoc: string, id: unknown) => typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT v.id, v.registration FROM vehicles v JOIN memberships m ON m.member_id = v.owner_id AND m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner' WHERE v.id = $2`, [assoc, id])).rows[0] ?? null : null;
  const ownDriver = async (assoc: string, id: unknown) => typeof id === "string" && UUID.test(id) ? (await comp.drivers(assoc)).find((d) => d.id === id) ?? null : null;
  const eventOf = (e: Row, v: Map<string, string>, d: Map<string, string>, onDay: string) => ({ id: String(e.id), kind: String(e.kind), occurredOn: dayOf(e.occurred_on)!, title: String(e.title), description: (e.description as string | null) ?? null, vehicleId: (e.vehicle_id as string | null) ?? null, vehicle: e.vehicle_id ? v.get(String(e.vehicle_id)) ?? null : null, driverId: (e.driver_id as string | null) ?? null, driver: e.driver_id ? d.get(String(e.driver_id)) ?? null : null, routeLabel: (e.route_label as string | null) ?? null, injuries: Number(e.injuries), fatalities: Number(e.fatalities), policeCaseNumber: (e.police_case_number as string | null) ?? null, otherAssociation: (e.other_association as string | null) ?? null, mediator: (e.mediator as string | null) ?? null, escalatedTo: String(e.escalated_to), escalatedOn: dayOf(e.escalated_on), noticeUntil: dayOf(e.notice_until), status: String(e.status), resolvedOn: dayOf(e.resolved_on), resolution: (e.resolution as string | null) ?? null, daysOpen: daysBetween(dayOf(e.occurred_on)!, dayOf(e.resolved_on) ?? onDay) });
  async function names(assoc: string) { const v = new Map((await db.query(`SELECT v.id, v.registration FROM vehicles v JOIN memberships m ON m.member_id = v.owner_id AND m.association_id = $1 AND m.member_role = 'vehicle_owner'`, [assoc])).rows.map((r) => [String(r.id), String(r.registration)])), d = new Map((await db.query(`SELECT id, name FROM users WHERE role = 'driver'`)).rows.map((r) => [String(r.id), String(r.name)])); return { v, d }; }

  /** Records an event. Accidents may carry injuries and deaths; a dispute must name the other association; a regulator notice may say until when it applies. A vehicle or driver can only be linked if they are the association's own. */
  async function add(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    if (!KINDS.includes(b.kind as never)) return bad(400, "Choose accident, passenger complaint, dispute with another association, police matter or regulator notice");
    if (!isDay(b.occurredOn) || (b.occurredOn as string) > today()) return bad(400, "Give the date it happened (not in the future)");
    const title = text(b.title, 120), desc = text(b.description, 2000), route = text(b.routeLabel, 120), police = text(b.policeCaseNumber, 40), other = text(b.otherAssociation, 120), mediator = text(b.mediator, 100); if (!title) return bad(400, "Give it a short title"); if ([desc, route, police, other, mediator].some((x) => x === false)) return bad(400, "A field is too long");
    let vehicleId: string | null = null, driverId: string | null = null; if (b.vehicleId !== undefined && b.vehicleId !== null && b.vehicleId !== "") { if (!(await ownVehicle(assoc, b.vehicleId))) return bad(400, "Link only one of your members' vehicles"); vehicleId = String(b.vehicleId); } if (b.driverId !== undefined && b.driverId !== null && b.driverId !== "") { if (!(await ownDriver(assoc, b.driverId))) return bad(400, "Link only one of your drivers"); driverId = String(b.driverId); }
    const inj = b.injuries === undefined ? 0 : b.injuries, fat = b.fatalities === undefined ? 0 : b.fatalities; if (!Number.isInteger(inj) || !Number.isInteger(fat) || (inj as number) < 0 || (fat as number) < 0 || (inj as number) > 500 || (fat as number) > 500) return bad(400, "Injuries and deaths are whole numbers");
    if (b.kind !== "accident" && ((inj as number) > 0 || (fat as number) > 0)) return bad(400, "Injuries and deaths are recorded for accidents");
    if (b.kind === "inter_association_dispute" && !other) return bad(400, "Name the other association");
    let until: string | null = null; if (b.noticeUntil !== undefined && b.noticeUntil !== null && b.noticeUntil !== "") { if (b.kind !== "regulator_notice") return bad(400, "Only a regulator notice has an end date"); if (!isDay(b.noticeUntil) || (b.noticeUntil as string) < (b.occurredOn as string)) return bad(400, "The notice applies until a date on or after it was issued"); until = String(b.noticeUntil); }
    const r = (await db.query(`INSERT INTO safety_events (association_id, kind, occurred_on, title, description, vehicle_id, driver_id, route_label, injuries, fatalities, police_case_number, other_association, mediator, notice_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [assoc, b.kind, b.occurredOn, title, desc, vehicleId, driverId, route, inj, fat, police, other, mediator, until])).rows[0];
    await log(assoc, String(r.id), `${KIND_TEXT[String(b.kind)]} recorded: ${title}`, by); return { ok: true, value: { id: String(r.id) } };
  }
  const own = async (assoc: string, id: unknown) => (typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM safety_events WHERE id = $1 AND association_id = $2`, [id, assoc])).rows[0] ?? null : null);
  /** Adds detail to an event that is still open (a police case number, a mediator, the other side, the injuries). What kind it is and when it happened do not change; a resolved event is closed. */
  async function update(assoc: string, by: string, id: string, b: Record<string, unknown>): Promise<Res<{ id: string }>> {
    const e = await own(assoc, id); if (!e) return bad(404, "That event was not found"); if (e.status === "resolved") return bad(409, "That event is resolved and can no longer be changed");
    const sets: string[] = [], args: unknown[] = [id]; const set = (col: string, v: unknown) => { args.push(v); sets.push(`${col} = $${args.length}`); };
    for (const [k, col, max] of [["description", "description", 2000], ["routeLabel", "route_label", 120], ["policeCaseNumber", "police_case_number", 40], ["otherAssociation", "other_association", 120], ["mediator", "mediator", 100]] as [string, string, number][]) if (b[k] !== undefined) { const t = text(b[k], max); if (t === false) return bad(400, `${k} is too long`); if (k === "otherAssociation" && e.kind === "inter_association_dispute" && !t) return bad(400, "A dispute must name the other association"); set(col, t); }
    for (const [k, col] of [["injuries", "injuries"], ["fatalities", "fatalities"]] as [string, string][]) if (b[k] !== undefined) { if (e.kind !== "accident" && b[k] !== 0) return bad(400, "Injuries and deaths are recorded for accidents"); if (!Number.isInteger(b[k]) || (b[k] as number) < 0 || (b[k] as number) > 500) return bad(400, "Injuries and deaths are whole numbers"); set(col, b[k]); }
    if (b.noticeUntil !== undefined) { if (e.kind !== "regulator_notice") return bad(400, "Only a regulator notice has an end date"); if (b.noticeUntil !== null && b.noticeUntil !== "" && (!isDay(b.noticeUntil) || (b.noticeUntil as string) < dayOf(e.occurred_on)!)) return bad(400, "The notice applies until a date on or after it was issued"); set("notice_until", b.noticeUntil || null); }
    if (!sets.length) return bad(400, "Nothing to change"); await db.query(`UPDATE safety_events SET ${sets.join(", ")} WHERE id = $1`, args); await log(assoc, id, `"${e.title}" updated (${Object.keys(b).join(", ")})`, by); return { ok: true, value: { id } };
  }
  /** Records that a dispute with another association went to SANTACO, the National Taxi Alliance or another body for mediation. */
  async function escalate(assoc: string, by: string, id: string, b: { to?: unknown; on?: unknown; mediator?: unknown }): Promise<Res<{ id: string }>> {
    const e = await own(assoc, id); if (!e) return bad(404, "That event was not found"); if (e.kind !== "inter_association_dispute") return bad(409, "Only a dispute with another association is escalated"); if (e.status === "resolved") return bad(409, "That dispute is resolved");
    if (!ESCALATIONS.includes(b.to as never)) return bad(400, "Choose SANTACO, the National Taxi Alliance or another body"); if (!isDay(b.on) || (b.on as string) < dayOf(e.occurred_on)! || (b.on as string) > today()) return bad(400, "Give the date it was escalated (after the dispute began, not in the future)");
    const med = text(b.mediator, 100); if (med === false) return bad(400, "The mediator's name is too long"); await db.query(`UPDATE safety_events SET escalated_to = $2, escalated_on = $3, mediator = COALESCE($4, mediator) WHERE id = $1`, [id, b.to, b.on, med]); await log(assoc, id, `dispute "${e.title}" escalated to ${String(b.to).replace(/_/g, " ")} on ${b.on}`, by); return { ok: true, value: { id } };
  }
  async function resolve(assoc: string, by: string, id: string, b: { resolvedOn?: unknown; resolution?: unknown }): Promise<Res<{ id: string }>> {
    const e = await own(assoc, id); if (!e) return bad(404, "That event was not found"); if (e.status === "resolved") return bad(409, "That event is already resolved");
    if (!isDay(b.resolvedOn) || (b.resolvedOn as string) < dayOf(e.occurred_on)! || (b.resolvedOn as string) > today()) return bad(400, "Give the date it was resolved (on or after it happened, not in the future)"); const why = text(b.resolution, 500); if (!why) return bad(400, "Say how it was resolved");
    await db.query(`UPDATE safety_events SET status = 'resolved', resolved_on = $2, resolution = $3 WHERE id = $1`, [id, b.resolvedOn, why]); await log(assoc, id, `"${e.title}" resolved on ${b.resolvedOn}`, by); return { ok: true, value: { id } };
  }
  async function events(assoc: string, o: { kind?: string; status?: string } = {}, onDay = today()) {
    const { v, d } = await names(assoc); return (await db.query(`SELECT * FROM safety_events WHERE association_id = $1 ORDER BY occurred_on DESC, created_at DESC LIMIT 1000`, [assoc])).rows.filter((e) => (!o.kind || e.kind === o.kind) && (!o.status || e.status === o.status)).map((e) => eventOf(e, v, d, onDay));
  }
  /** What the record shows and what stands out: repeat incidents on a vehicle or driver, disputes left open, a notice in force, a spike on a route. */
  async function summary(assoc: string, onDay = today()) {
    const evs = await events(assoc, {}, onDay), flags: Flag[] = [], yearAgo = shift(onDay, -365), last12 = evs.filter((e) => e.occurredOn >= yearAgo && e.occurredOn <= onDay);
    for (const [key, label, pick] of [["vehicle", "vehicle", (e: (typeof evs)[number]) => e.vehicle], ["driver", "driver", (e: (typeof evs)[number]) => e.driver]] as const) {
      const counts = new Map<string, number>(); for (const e of last12.filter((x) => x.kind === "accident" || x.kind === "passenger_complaint")) { const k = pick(e); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
      for (const [k, n] of counts) if (n >= LIMITS.repeatMedium) flags.push({ id: `safety:repeat:${key}:${k}`, category: "safety", severity: n >= LIMITS.repeatHigh ? "high" : "medium", message: `${label === "vehicle" ? "Vehicle" : "Driver"} ${k} has ${n} accidents or passenger complaints in the last 12 months`, subject: k, dueOn: null });
    }
    for (const e of evs.filter((x) => x.kind === "inter_association_dispute" && x.status === "open")) if (e.daysOpen > LIMITS.disputeDays) flags.push({ id: `safety:dispute:${e.id}`, category: "safety", severity: e.daysOpen > LIMITS.disputeHighDays ? "high" : "medium", message: `The dispute with ${e.otherAssociation} ("${e.title}") has been open ${e.daysOpen} days${e.escalatedTo !== "none" ? `, escalated to ${e.escalatedTo.replace(/_/g, " ")}` : " and has not been escalated"}`, subject: e.otherAssociation ?? e.title, dueOn: null });
    for (const e of evs.filter((x) => x.kind === "police_matter" && x.status === "open")) if (e.daysOpen > LIMITS.policeDays) flags.push({ id: `safety:police:${e.id}`, category: "safety", severity: "low", message: `The police matter "${e.title}" has been open ${e.daysOpen} days${e.policeCaseNumber ? ` (case ${e.policeCaseNumber})` : ""}`, subject: e.title, dueOn: null });
    for (const e of evs.filter((x) => x.kind === "regulator_notice" && x.status === "open" && (!x.noticeUntil || x.noticeUntil >= onDay))) flags.push({ id: `safety:notice:${e.id}`, category: "safety", severity: "high", message: `A regulator notice is in force: "${e.title}"${e.routeLabel ? ` (${e.routeLabel})` : ""}${e.noticeUntil ? ` until ${e.noticeUntil}` : ""}`, subject: e.title, dueOn: e.noticeUntil });
    const recent = shift(onDay, -30), prev = shift(onDay, -60), byRoute = new Map<string, { label: string; recent: number; prev: number }>();
    for (const e of evs.filter((x) => x.routeLabel && x.kind !== "regulator_notice" && x.occurredOn >= prev && x.occurredOn <= onDay)) { const k = norm(e.routeLabel), r = byRoute.get(k) ?? { label: e.routeLabel!, recent: 0, prev: 0 }; if (e.occurredOn > recent) r.recent++; else r.prev++; byRoute.set(k, r); }
    for (const [k, r] of byRoute) if (r.recent >= LIMITS.spikeMin && r.recent > r.prev * 2) flags.push({ id: `safety:spike:${k}`, category: "safety", severity: "medium", message: `${r.recent} incidents on ${r.label} in the last 30 days, against ${r.prev} in the 30 days before`, subject: r.label, dueOn: null });
    const resolved = last12.filter((e) => e.status === "resolved"), avg = resolved.length ? Math.round(resolved.reduce((a, e) => a + e.daysOpen, 0) / resolved.length) : null;
    const by = (k: string) => last12.filter((e) => e.kind === k).length;
    return { today: onDay, measures: { accidents: by("accident"), injuries: last12.filter((e) => e.kind === "accident").reduce((a, e) => a + e.injuries, 0), fatalities: last12.filter((e) => e.kind === "accident").reduce((a, e) => a + e.fatalities, 0), passengerComplaints: by("passenger_complaint"), disputes: by("inter_association_dispute"), policeMatters: by("police_matter"), regulatorNotices: by("regulator_notice"), open: evs.filter((e) => e.status === "open").length, escalated: last12.filter((e) => e.escalatedTo !== "none").length, averageDaysToResolve: avg, noticesInForce: evs.filter((x) => x.kind === "regulator_notice" && x.status === "open" && (!x.noticeUntil || x.noticeUntil >= onDay)).length }, flags: flags.sort(flagSort) };
  }
  return { add, update, escalate, resolve, events, summary };
}
export type Safety = ReturnType<typeof createSafety>;
