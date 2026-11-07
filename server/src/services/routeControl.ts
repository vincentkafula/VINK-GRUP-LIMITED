import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import { flagSort, createCompliance, type Flag } from "./compliance.js";

/**
 * ROUTE CONTROL (docs/ASSOCIATION_COMPLIANCE.md, module 6): whether a route is overloaded, whether vehicles are running routes they are not licensed for, who operates on the association's routes without being a member, and whether the queue is being respected.
 *   saturation   vehicles that actually operated on a route in the last 30 days, divided by the vehicles the association's members hold a valid licence for on that route. Over 1 is over-supplied; from 0.85 is a warning.
 *   licence      the licence, not the association's own route list, is the legal authority to operate. This reconciles the two: a vehicle seen on a route its valid licence does not name, or with no valid licence at all, is flagged.
 *   non-members  vehicles from outside the association that operate on its routes are listed separately, because membership is voluntary and the association must be able to show who is and is not a member
 *   the queue    each departure is checked against the rank queue: was another vehicle that joined earlier still waiting? The skips are counted and the vehicles named
 * "Operated on a route" means a loading session on that route that was not cancelled. It states what the records show; matching a licence's route text to a route name is by words, so the unmatched are listed for the association to check.
 */
type Row = Record<string, unknown>;
export const LIMITS = { windowDays: 30, warningRatio: 0.85, skipMinDepartures: 10, skipMedium: 0.1, skipHigh: 0.25 } as const;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Does the route a licence names mean this route? Same words, or one contains the other as a whole phrase (and is long enough to mean something). */
export function routeMatches(licenceRoute: string | null | undefined, routeName: string): boolean {
  const a = norm(licenceRoute), b = norm(routeName); if (!a || !b) return false; if (a === b) return true; if (a.length < 4 || b.length < 4) return false;
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

export function createRouteControl(db: Db, now: () => Date = () => new Date()) {
  const today = () => saDay(now()), comp = createCompliance(db, now);
  async function report(assoc: string, onDay = today()) {
    const since = new Date(`${shift(onDay, -LIMITS.windowDays)}T00:00:00Z`).getTime(), flags: Flag[] = [];
    const routes = (await db.query(`SELECT id, name, active FROM token_routes WHERE association_id = $1 ORDER BY name`, [assoc])).rows, vehicles = await comp.vehicles(assoc, onDay), byVeh = new Map(vehicles.map((v) => [v.id, v]));
    const allVeh = new Map((await db.query(`SELECT v.id, v.registration, u.name AS owner FROM vehicles v JOIN users u ON u.id = v.owner_id`)).rows.map((v) => [String(v.id), { registration: String(v.registration), owner: String(v.owner) }]));
    const sessions = (await db.query(`SELECT ls.route_id, ls.vehicle_id, ls.started_at FROM loading_sessions ls JOIN token_routes r ON r.id = ls.route_id WHERE r.association_id = $1 AND ls.status IN ('loading','closed')`, [assoc])).rows.filter((s) => new Date(s.started_at as string).getTime() >= since);
    const licensedFor = (r: Row) => vehicles.filter((v) => v.compliance.state === "active" && v.licence.status === "valid" && routeMatches(v.licence.current?.route as string | null, String(r.name)));
    const out = routes.map((r) => {
      const rid = String(r.id), name = String(r.name), mine = sessions.filter((s) => String(s.route_id) === rid), trips = new Map<string, number>(); for (const s of mine) trips.set(String(s.vehicle_id), (trips.get(String(s.vehicle_id)) ?? 0) + 1);
      const licensed = licensedFor(r), operating = [...trips.keys()], members = operating.filter((id) => byVeh.has(id)), nonMembers = operating.filter((id) => !byVeh.has(id));
      const unlicensed = members.map((id) => byVeh.get(id)!).filter((v) => v.licence.status !== "valid"), offRoute = members.map((id) => byVeh.get(id)!).filter((v) => v.licence.status === "valid" && !!v.licence.current?.route && !routeMatches(v.licence.current.route as string, name));
      const ratio = licensed.length ? Math.round((operating.length / licensed.length) * 100) / 100 : null, band = !operating.length ? "idle" : !licensed.length ? "no_licensed" : ratio! > 1 ? "over" : ratio! >= LIMITS.warningRatio ? "warning" : "ok";
      if (band === "over") flags.push({ id: `routes:over:${rid}`, category: "routes", severity: "high", message: `${operating.length} vehicles operated on ${name} in the last ${LIMITS.windowDays} days, but ${licensed.length} ${licensed.length === 1 ? "is" : "are"} licensed for it: the route is over-supplied`, subject: name, dueOn: null });
      else if (band === "warning") flags.push({ id: `routes:warning:${rid}`, category: "routes", severity: "medium", message: `${operating.length} vehicles operated on ${name} against ${licensed.length} licensed for it: the route is nearly full`, subject: name, dueOn: null });
      else if (band === "no_licensed") flags.push({ id: `routes:nolicensed:${rid}`, category: "routes", severity: "high", message: `${operating.length} vehicle${operating.length === 1 ? "" : "s"} operated on ${name}, but none of your members' licences is recorded as naming it: record the route on each licence, or check the route name matches`, subject: name, dueOn: null });
      for (const v of unlicensed) flags.push({ id: `routes:unlicensed:${rid}:${v.id}`, category: "routes", severity: "high", message: `${v.registration} operated on ${name} ${trips.get(v.id)} time${trips.get(v.id) === 1 ? "" : "s"} in the last ${LIMITS.windowDays} days with no valid operating licence`, subject: v.registration, dueOn: null });
      for (const v of offRoute) flags.push({ id: `routes:offroute:${rid}:${v.id}`, category: "routes", severity: "medium", message: `${v.registration} operated on ${name} ${trips.get(v.id)} time${trips.get(v.id) === 1 ? "" : "s"}, but its licence names "${v.licence.current!.route}"`, subject: v.registration, dueOn: null });
      return { id: rid, name, active: !!r.active, licensedVehicles: licensed.length, operatingVehicles: operating.length, memberVehiclesOperating: members.length, saturationRatio: ratio, band, unlicensedOperating: unlicensed.map((v) => ({ vehicleId: v.id, registration: v.registration, trips: trips.get(v.id)! })), offRoute: offRoute.map((v) => ({ vehicleId: v.id, registration: v.registration, licenceRoute: String(v.licence.current!.route), trips: trips.get(v.id)! })), nonMemberOperators: nonMembers.map((id) => ({ vehicleId: id, registration: allVeh.get(id)?.registration ?? "Unknown", owner: allVeh.get(id)?.owner ?? "Unknown", trips: trips.get(id)! })).sort((a, b) => b.trips - a.trips || a.registration.localeCompare(b.registration)) };
    });
    const unmatched = vehicles.filter((v) => v.compliance.state === "active" && v.licence.status === "valid" && !!v.licence.current?.route && !routes.some((r) => routeMatches(v.licence.current!.route as string, String(r.name)))).map((v) => ({ vehicleId: v.id, registration: v.registration, licenceRoute: String(v.licence.current!.route) }));
    const noRoute = vehicles.filter((v) => v.compliance.state === "active" && v.licence.status === "valid" && !v.licence.current?.route).map((v) => ({ vehicleId: v.id, registration: v.registration }));

    /* the queue: was the vehicle that left the one that joined first? */
    const ranks = (await db.query(`SELECT id, name FROM ranks WHERE association_id = $1 ORDER BY name`, [assoc])).rows, queue = (await db.query(`SELECT q.* FROM rank_queue q JOIN ranks r ON r.id = q.rank_id WHERE r.association_id = $1`, [assoc])).rows, deps = (await db.query(`SELECT d.* FROM departures d JOIN ranks r ON r.id = d.rank_id WHERE r.association_id = $1`, [assoc])).rows.filter((d) => new Date(d.departed_at as string).getTime() >= since);
    const rankOut = ranks.map((rk) => {
      const rid = String(rk.id), q = queue.filter((e) => String(e.rank_id) === rid), ds = deps.filter((d) => String(d.rank_id) === rid), exceptions = ds.filter((d) => d.status === "approved_exception").length, skippers = new Map<string, number>(); let skips = 0, checked = 0;
      for (const d of ds.filter((x) => x.status !== "approved_exception")) {                // a departure out of order that was formally approved, with a reason, is a recorded exception, not a skip
        const t = new Date(d.departed_at as string).getTime(), mine = q.filter((e) => String(e.vehicle_id) === String(d.vehicle_id) && new Date(e.joined_at as string).getTime() <= t).sort((a, b) => new Date(b.joined_at as string).getTime() - new Date(a.joined_at as string).getTime())[0]; if (!mine) continue; checked++;
        const ahead = q.some((e) => e !== mine && String(e.vehicle_id) !== String(d.vehicle_id) && new Date(e.joined_at as string).getTime() < new Date(mine.joined_at as string).getTime() && (!e.left_at || new Date(e.left_at as string).getTime() > t));
        if (ahead) { skips++; const reg = allVeh.get(String(d.vehicle_id))?.registration ?? "Unknown"; skippers.set(reg, (skippers.get(reg) ?? 0) + 1); }
      }
      const rate = checked ? skips / checked : 0, band = checked < LIMITS.skipMinDepartures ? "too_few" : rate >= LIMITS.skipHigh ? "high" : rate >= LIMITS.skipMedium ? "medium" : "ok";
      if (band === "high" || band === "medium") flags.push({ id: `routes:skips:${rid}`, category: "routes", severity: band === "high" ? "high" : "medium", message: `At ${rk.name}, ${skips} of ${checked} departures in the last ${LIMITS.windowDays} days left ahead of a vehicle that had joined the queue earlier (${pct(skips, checked)}%)`, subject: String(rk.name), dueOn: null });
      return { id: rid, name: String(rk.name), departures: ds.length, approvedExceptions: exceptions, checked, skips, skipPercent: pct(skips, checked), band, skippers: [...skippers].map(([registration, n]) => ({ registration, skips: n })).sort((a, b) => b.skips - a.skips || a.registration.localeCompare(b.registration)) };
    });
    return { today: onDay, windowDays: LIMITS.windowDays, routes: out, ranks: rankOut, unmatchedLicences: unmatched, licencesWithoutRoute: noRoute, flags: flags.sort(flagSort) };
  }
  return { report };
}
export type RouteControl = ReturnType<typeof createRouteControl>;
