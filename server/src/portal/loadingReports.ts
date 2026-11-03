import { Router, type Request } from "express";
import { h, uid, iso, fail, rangeParams, sendCsv, type Db } from "./common.js";

/**
 * What loads on the shared rank devices (and owners' own devices) collected: per SESSION (one load of one vehicle by one driver), per DRIVER, per VEHICLE or per ROUTE, for a period.
 *
 * Who sees what is decided here, once, by the role the report is mounted for:
 *   owner        the loads of the owner's own vehicles
 *   association  the loads at the association's ranks and on its devices
 *   driver       the driver's own loads (whoever tapped their card)
 *   marshal      the loads the marshal started
 * Only loads that were paired are counted (a session nobody paired or that was cancelled collected nothing). A load still in progress is included and marked as such.
 *
 * "Collected" is the fares passengers paid, "fee" is VINK's flat fee on them, and "net" is what is left for the driver (or the owner, under a salary agreement): the same arithmetic the money
 * engine settles, so the report and the wallet agree.
 */
export type ReportBy = "session" | "driver" | "vehicle" | "route";
export type ReportRole = "owner" | "association" | "driver" | "marshal";
export const REPORT_BY: readonly ReportBy[] = ["session", "driver", "vehicle", "route"];
export const MAX_REPORT_SESSIONS = 5000;

export interface SessionLine { id: string; pairedAt: string; endedAt: string | null; inProgress: boolean; vehicleId: string; registration: string; driverId: string | null; driver: string | null; routeId: string | null; route: string | null; place: string; passengers: number; collectedCents: number; feeCents: number; netCents: number }
export interface GroupLine { key: string; name: string; trips: number; passengers: number; collectedCents: number; feeCents: number; netCents: number }
export interface LoadingReport { by: ReportBy; from: string; to: string; truncated: boolean; totals: Omit<GroupLine, "key" | "name">; rows: SessionLine[] | GroupLine[] }

export function createLoadingReports(db: Db) {
  async function lines(role: ReportRole, userId: string, from: Date, to: Date): Promise<{ rows: SessionLine[]; truncated: boolean }> {
    const scope = { owner: "v.owner_id = $3", association: "(r.association_id = $3 OR t.association_id = $3)", driver: "s.driver_id = $3", marshal: "s.marshal_id = $3" }[role];
    const r = await db.query(
      `SELECT s.id, s.paired_at, s.ended_at, s.status, s.vehicle_id, v.registration, s.driver_id, du.name AS driver_name, s.route_id, tr.name AS route_name, r.name AS rank_name, s.passengers, s.total_cents
         FROM loading_sessions s JOIN vehicles v ON v.id = s.vehicle_id JOIN terminals t ON t.id = s.terminal_id LEFT JOIN ranks r ON r.id = s.rank_id
         LEFT JOIN users du ON du.id = s.driver_id LEFT JOIN token_routes tr ON tr.id = s.route_id
        WHERE s.paired_at >= $1 AND s.paired_at < $2 AND s.status IN ('loading','closed') AND ${scope} ORDER BY s.paired_at DESC LIMIT ${MAX_REPORT_SESSIONS + 1}`, [from, to, userId]);
    const rows = r.rows.slice(0, MAX_REPORT_SESSIONS);
    const fees = new Map<string, number>();
    if (rows.length) {
      const f = await db.query(`SELECT session_id, COALESCE(SUM(vink_fee_device + vink_fee_card), 0) AS fee FROM terminal_taps WHERE session_id = ANY($1) AND status = 'confirmed' GROUP BY session_id`, [rows.map((x) => String(x.id))]);
      for (const x of f.rows) fees.set(String(x.session_id), Math.round(Number(x.fee) * 100));
    }
    return { truncated: r.rows.length > MAX_REPORT_SESSIONS, rows: rows.map((x) => {
      const collected = Number(x.total_cents ?? 0), fee = Math.min(fees.get(String(x.id)) ?? 0, collected);
      return { id: String(x.id), pairedAt: iso(x.paired_at)!, endedAt: iso(x.ended_at), inProgress: x.status === "loading", vehicleId: String(x.vehicle_id), registration: String(x.registration), driverId: x.driver_id ? String(x.driver_id) : null, driver: x.driver_name ? String(x.driver_name) : null,
        routeId: x.route_id ? String(x.route_id) : null, route: x.route_name ? String(x.route_name) : null, place: x.rank_name ? String(x.rank_name) : "Own device", passengers: Number(x.passengers ?? 0), collectedCents: collected, feeCents: fee, netCents: collected - fee };
    }) };
  }

  const add = (g: { trips: number; passengers: number; collectedCents: number; feeCents: number; netCents: number }, x: SessionLine) => { g.trips++; g.passengers += x.passengers; g.collectedCents += x.collectedCents; g.feeCents += x.feeCents; g.netCents += x.netCents; };

  async function report(role: ReportRole, userId: string, by: ReportBy, range: { from: Date; toExclusive: Date; fromDay: string; toDay: string }): Promise<LoadingReport> {
    const { rows, truncated } = await lines(role, userId, range.from, range.toExclusive);
    const totals = { trips: 0, passengers: 0, collectedCents: 0, feeCents: 0, netCents: 0 }; for (const x of rows) add(totals, x);
    if (by === "session") return { by, from: range.fromDay, to: range.toDay, truncated, totals, rows };
    const groups = new Map<string, GroupLine>();
    for (const x of rows) {
      const [key, name] = by === "driver" ? [x.driverId ?? "none", x.driver ?? "No driver"] : by === "vehicle" ? [x.vehicleId, x.registration] : [x.routeId ?? "none", x.route ?? "No route"];
      const g = groups.get(key) ?? { key, name, trips: 0, passengers: 0, collectedCents: 0, feeCents: 0, netCents: 0 }; add(g, x); groups.set(key, g);
    }
    return { by, from: range.fromDay, to: range.toDay, truncated, totals, rows: [...groups.values()].sort((a, b) => b.collectedCents - a.collectedCents || a.name.localeCompare(b.name)) };
  }

  /** GET /loading/report?by=session|driver|vehicle|route&from=&to= and the same as /loading/report.csv, for the signed-in user as this role. */
  function mount(router: Router, role: ReportRole, now: () => Date): void {
    const parse = (req: Request) => {
      const by = String(req.query.by ?? "driver") as ReportBy;
      if (!REPORT_BY.includes(by)) return { error: "Choose session, driver, vehicle or route" };
      const range = rangeParams(req, now(), 30); if ("error" in range) return range;
      return { by, range };
    };
    router.get("/loading/report", h(async (req, res) => { const p = parse(req); if ("error" in p) { fail(res, 400, p.error); return; } res.json({ success: true, ...(await report(role, uid(req), p.by, p.range)) }); }));
    router.get("/loading/report.csv", h(async (req, res) => {
      const p = parse(req); if ("error" in p) { fail(res, 400, p.error); return; }
      const r = await report(role, uid(req), p.by, p.range), rand = (c: number) => (c / 100).toFixed(2);
      if (r.by === "session") sendCsv(res, `loads_${r.from}_${r.to}.csv`, ["Paired", "Ended", "Vehicle", "Driver", "Route", "Place", "Passengers", "Collected (R)", "Fee (R)", "Net (R)", "In progress"],
        (r.rows as SessionLine[]).map((x) => [x.pairedAt, x.endedAt ?? "", x.registration, x.driver ?? "", x.route ?? "", x.place, x.passengers, rand(x.collectedCents), rand(x.feeCents), rand(x.netCents), x.inProgress ? "yes" : ""]));
      else sendCsv(res, `loads_by_${r.by}_${r.from}_${r.to}.csv`, [r.by[0].toUpperCase() + r.by.slice(1), "Trips", "Passengers", "Collected (R)", "Fee (R)", "Net (R)"], (r.rows as GroupLine[]).map((x) => [x.name, x.trips, x.passengers, rand(x.collectedCents), rand(x.feeCents), rand(x.netCents)]));
    }));
  }
  return { report, mount };
}
