import { Router, json, type Request } from "express";
import { h, uid, num, iso, isUuid, optText, fail, isUniqueViolation, audit, bucketDays, pageParams, rangeParams, saDay, sendCsv, type Db } from "./common.js";
import { saPeriods } from "./driverRoutes.js";

/**
 * The Marshal Dashboard API, mounted at /api/portal/marshal (marshals only). A marshal works only at the ranks the association
 * has assigned to them (rank_marshals); every rank route checks that first.
 *
 *   GET  /ranks                              my ranks, with how many vehicles are waiting
 *   GET  /ranks/:id/queue                    the waiting line, in order
 *   GET  /ranks/:id/vehicles                 the vehicles and drivers of the association's members (who can join this rank's queue)
 *   POST /ranks/:id/queue                    {vehicleId} a vehicle joins the back of the line
 *   POST /ranks/:id/depart                   {queueId?, passengers?, note?} the vehicle leaves and the departure is logged (default: first in line)
 *   POST /ranks/:id/queue/:queueId/remove    take a vehicle out of the line without logging a departure
 *   GET  /ranks/:id/departures               recent departures
 *   GET  /reports                            departures and passengers today / this week / this month, per rank
 */
export function createMarshalRouter(db: Db, now: () => Date = () => new Date()): Router {
  const router = Router();

  router.get("/", (req, res) => { res.json({ success: true, role: "marshal", user: { id: uid(req), username: req.user!.username } }); });

  /** The rank, if (and only if) the signed-in marshal is assigned to it. */
  async function myRank(rankId: unknown, marshalId: string) {
    if (!isUuid(rankId)) return null;
    return (await db.query(
      `SELECT r.id, r.name, r.location, r.association_id FROM ranks r JOIN rank_marshals m ON m.rank_id = r.id
        WHERE r.id = $1 AND m.marshal_id = $2 AND r.active = true`, [rankId, marshalId])).rows[0] ?? null;
  }

  router.get("/ranks", h(async (req, res) => {
    const ranks = (await db.query(
      `SELECT r.id, r.name, r.location, a.name AS association FROM ranks r JOIN rank_marshals m ON m.rank_id = r.id JOIN users a ON a.id = r.association_id
        WHERE m.marshal_id = $1 AND r.active = true ORDER BY r.name`, [uid(req)])).rows;
    const out = [];
    for (const r of ranks) {
      const waiting = num((await db.query(`SELECT COUNT(*) AS n FROM rank_queue WHERE rank_id = $1 AND left_at IS NULL`, [r.id])).rows[0]?.n);
      out.push({ id: r.id, name: r.name, location: r.location ?? null, association: r.association, waiting });
    }
    res.json({ success: true, ranks: out });
  }));

  router.get("/ranks/:id/queue", h(async (req, res) => {
    const rank = await myRank(req.params.id, uid(req));
    if (!rank) { fail(res, 404, "Rank not found"); return; }
    const q = (await db.query(
      `SELECT q.id, q.joined_at, v.id AS vehicle_id, v.registration, v.make, v.model, v.seats, d.name AS driver
         FROM rank_queue q JOIN vehicles v ON v.id = q.vehicle_id LEFT JOIN users d ON d.id = v.driver_id
        WHERE q.rank_id = $1 AND q.left_at IS NULL ORDER BY q.joined_at, q.id`, [rank.id])).rows;
    res.json({ success: true, rank: { id: rank.id, name: rank.name }, queue: q.map((x, i) => ({ id: x.id, position: i + 1, joinedAt: iso(x.joined_at), vehicleId: x.vehicle_id, registration: x.registration, make: x.make ?? null, model: x.model ?? null, seats: x.seats ?? null, driver: x.driver ?? null })) });
  }));

  router.get("/ranks/:id/vehicles", h(async (req, res) => {
    const rank = await myRank(req.params.id, uid(req));
    if (!rank) { fail(res, 404, "Rank not found"); return; }
    const v = (await db.query(
      `SELECT v.id, v.registration, v.make, v.model, v.seats, d.name AS driver, o.name AS owner
         FROM vehicles v
         JOIN memberships m ON m.member_id = v.owner_id AND m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner'
         JOIN users o ON o.id = v.owner_id LEFT JOIN users d ON d.id = v.driver_id
        ORDER BY v.registration`, [rank.association_id])).rows;
    const queued = new Set((await db.query(`SELECT vehicle_id FROM rank_queue WHERE left_at IS NULL`)).rows.map((x) => String(x.vehicle_id)));
    res.json({ success: true, vehicles: v.map((x) => ({ id: x.id, registration: x.registration, make: x.make ?? null, model: x.model ?? null, seats: x.seats ?? null, driver: x.driver ?? null, owner: x.owner, inQueue: queued.has(String(x.id)) })) });
  }));

  router.post("/ranks/:id/queue", json({ limit: "5kb" }), h(async (req, res) => {
    const rank = await myRank(req.params.id, uid(req)), vehicleId = req.body?.vehicleId;
    if (!rank) { fail(res, 404, "Rank not found"); return; }
    if (!isUuid(vehicleId)) { fail(res, 400, "Choose a vehicle"); return; }
    const eligible = (await db.query(
      `SELECT v.id FROM vehicles v JOIN memberships m ON m.member_id = v.owner_id AND m.association_id = $2 AND m.status = 'active' AND m.member_role = 'vehicle_owner'
        WHERE v.id = $1`, [vehicleId, rank.association_id])).rows.length;
    if (!eligible) { fail(res, 400, "That vehicle does not belong to a member of this association"); return; }
    if ((await db.query(`SELECT 1 AS x FROM rank_queue WHERE vehicle_id = $1 AND left_at IS NULL`, [vehicleId])).rows.length) { fail(res, 409, "That vehicle is already in a queue"); return; }
    try {
      const r = await db.query(`INSERT INTO rank_queue (rank_id, vehicle_id) VALUES ($1,$2) RETURNING id`, [rank.id, vehicleId]);
      res.status(201).json({ success: true, id: r.rows[0].id });
    } catch (e) { if (isUniqueViolation(e)) { fail(res, 409, "That vehicle is already in a queue"); return; } throw e; }
  }));

  router.post("/ranks/:id/depart", json({ limit: "5kb" }), h(async (req, res) => {
    const me = uid(req), rank = await myRank(req.params.id, me);
    if (!rank) { fail(res, 404, "Rank not found"); return; }
    const b = req.body ?? {};
    const note = optText(b.note, 200);
    if (note === undefined) { fail(res, 400, "The note is too long (200 characters at most)"); return; }
    let passengers: number | null = null;
    if (b.passengers !== undefined && b.passengers !== null && b.passengers !== "") {
      const n = Number(b.passengers);
      if (!Number.isInteger(n) || n < 0 || n > 200) { fail(res, 400, "Passengers must be a whole number from 0 to 200"); return; }
      passengers = n;
    }
    const named = b.queueId;
    if (named !== undefined && named !== null && !isUuid(named)) { fail(res, 400, "Invalid queue entry"); return; }
    // Taking the place in the line is the atomic step (an UPDATE that only succeeds while left_at is still empty), so two requests
    // can never log the same vehicle. A request for "the first in line" that loses the race simply takes the next one.
    let took: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 5 && !took; attempt++) {
      let target = named as string | null | undefined;
      if (target === undefined || target === null) {
        const first = (await db.query(`SELECT id FROM rank_queue WHERE rank_id = $1 AND left_at IS NULL ORDER BY joined_at, id LIMIT 1`, [rank.id])).rows[0];
        if (!first) { fail(res, 409, "Nobody is waiting at this rank"); return; }
        target = String(first.id);
      }
      took = (await db.query(`UPDATE rank_queue SET left_at = now() WHERE id = $1 AND rank_id = $2 AND left_at IS NULL RETURNING vehicle_id`, [target, rank.id])).rows[0];
      if (!took && named) break;                       // a specific vehicle was asked for and someone else got it first
    }
    if (!took) { fail(res, 409, named ? "That vehicle has already left the queue" : "Nobody is waiting at this rank"); return; }
    const veh = (await db.query(`SELECT driver_id FROM vehicles WHERE id = $1`, [took.vehicle_id])).rows[0];
    const r = await db.query(`INSERT INTO departures (rank_id, vehicle_id, driver_id, marshal_id, passengers, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [rank.id, took.vehicle_id, veh?.driver_id ?? null, me, passengers, note]);
    await audit(db, req, "marshal.depart", String(rank.id), { vehicleId: took.vehicle_id, passengers });
    res.status(201).json({ success: true, id: r.rows[0].id });
  }));

  router.post("/ranks/:id/queue/:queueId/remove", h(async (req, res) => {
    const rank = await myRank(req.params.id, uid(req));
    if (!rank) { fail(res, 404, "Rank not found"); return; }
    if (!isUuid(req.params.queueId)) { fail(res, 400, "Invalid queue entry"); return; }
    const r = await db.query(`UPDATE rank_queue SET left_at = now() WHERE id = $1 AND rank_id = $2 AND left_at IS NULL RETURNING id`, [req.params.queueId, rank.id]);
    if (!r.rows.length) { fail(res, 404, "Queue entry not found"); return; }
    res.json({ success: true });
  }));

  /** Departures from one of my ranks. ?from=&to=&limit=&offset= ; /departures.csv downloads the same selection. */
  async function departureQuery(req: Request, csv: boolean) {
    const rank = await myRank(req.params.id, uid(req));
    if (!rank) return { notFound: true as const };
    const range = rangeParams(req, now(), 30);
    if ("error" in range) return range;
    const total = num((await db.query(`SELECT COUNT(*) AS n FROM departures WHERE rank_id = $1 AND departed_at >= $2 AND departed_at < $3`, [rank.id, range.from, range.toExclusive])).rows[0]?.n);
    const { limit, offset } = csv ? { limit: 5000, offset: 0 } : pageParams(req, 25, 100);
    const rows = (await db.query(
      `SELECT d.id, d.departed_at, d.passengers, d.note, v.registration, u.name AS driver FROM departures d JOIN vehicles v ON v.id = d.vehicle_id LEFT JOIN users u ON u.id = d.driver_id
        WHERE d.rank_id = $1 AND d.departed_at >= $2 AND d.departed_at < $3 ORDER BY d.departed_at DESC LIMIT $4 OFFSET $5`, [rank.id, range.from, range.toExclusive, limit, offset])).rows;
    return { rank, rows, total, limit, offset };
  }
  router.get("/ranks/:id/departures", h(async (req, res) => {
    const r = await departureQuery(req, false);
    if ("notFound" in r) { fail(res, 404, "Rank not found"); return; }
    if ("error" in r) { fail(res, 400, r.error); return; }
    res.json({ success: true, total: r.total, limit: r.limit, offset: r.offset, departures: r.rows.map((x) => ({ id: x.id, at: iso(x.departed_at), registration: x.registration, driver: x.driver ?? null, passengers: x.passengers ?? null, note: x.note ?? null })) });
  }));
  router.get("/ranks/:id/departures.csv", h(async (req, res) => {
    const r = await departureQuery(req, true);
    if ("notFound" in r) { fail(res, 404, "Rank not found"); return; }
    if ("error" in r) { fail(res, 400, r.error); return; }
    await audit(db, req, "marshal.export.departures", String(r.rank.id), { rows: r.rows.length });
    sendCsv(res, `departures-${saDay(now())}.csv`, ["When (UTC)", "Vehicle", "Driver", "Passengers", "Note"], r.rows.map((x) => [iso(x.departed_at), x.registration, x.driver ?? "", x.passengers ?? "", x.note ?? ""]));
  }));

  /** Departures per day at one rank (default last 14 days), zero-filled, for the trend chart. */
  router.get("/ranks/:id/trend", h(async (req, res) => {
    const rank = await myRank(req.params.id, uid(req));
    if (!rank) { fail(res, 404, "Rank not found"); return; }
    const range = rangeParams(req, now(), 14);
    if ("error" in range) { fail(res, 400, range.error); return; }
    const rows = (await db.query(`SELECT departed_at, passengers FROM departures WHERE rank_id = $1 AND departed_at >= $2 AND departed_at < $3 LIMIT 50000`, [rank.id, range.from, range.toExclusive])).rows;
    const dep = bucketDays(rows.map((x) => ({ at: x.departed_at, value: 1 })), range.from, range.toExclusive);
    const pax = bucketDays(rows.map((x) => ({ at: x.departed_at, value: num(x.passengers) })), range.from, range.toExclusive);
    res.json({ success: true, days: dep.map((d, i) => ({ day: d.day, departures: d.count, passengers: pax[i].value })) });
  }));

  /** Today / this week / this month per rank (unchanged), and ?from=&to= for a custom period; /reports.csv downloads it. */
  async function report(req: Request) {
    const p = saPeriods(now());
    const ranks = (await db.query(`SELECT r.id, r.name FROM ranks r JOIN rank_marshals m ON m.rank_id = r.id WHERE m.marshal_id = $1 ORDER BY r.name`, [uid(req)])).rows;
    const custom = req.query.from !== undefined || req.query.to !== undefined ? rangeParams(req, now(), 30) : null;
    if (custom && "error" in custom) return custom;
    const out = [];
    for (const r of ranks) {
      const per = async (from: Date, to?: Date) => {
        const x = (await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(passengers), 0) AS pax FROM departures WHERE rank_id = $1 AND departed_at >= $2${to ? " AND departed_at < $3" : ""}`, to ? [r.id, from, to] : [r.id, from])).rows[0];
        return { departures: num(x?.n), passengers: num(x?.pax) };
      };
      out.push({ rankId: r.id, rank: r.name, today: await per(p.day), week: await per(p.week), month: await per(p.month), ...(custom ? { period: await per(custom.from, custom.toExclusive) } : {}) });
    }
    return { ranks: out, custom };
  }
  router.get("/reports", h(async (req, res) => {
    const r = await report(req);
    if ("error" in r) { fail(res, 400, r.error); return; }
    res.json({ success: true, ranks: r.ranks, ...(r.custom ? { from: r.custom.fromDay, to: r.custom.toDay } : {}) });
  }));
  router.get("/reports.csv", h(async (req, res) => {
    const r = await report(req);
    if ("error" in r) { fail(res, 400, r.error); return; }
    await audit(db, req, "marshal.export.report", null, {});
    sendCsv(res, `rank-report-${saDay(now())}.csv`, ["Rank", "Period", "Departures", "Passengers recorded"],
      r.ranks.flatMap((k: any) => [[k.rank, "Today", k.today.departures, k.today.passengers], [k.rank, "This week", k.week.departures, k.week.passengers], [k.rank, "This month", k.month.departures, k.month.passengers], ...(k.period ? [[k.rank, `${r.custom!.fromDay} to ${r.custom!.toDay}`, k.period.departures, k.period.passengers]] : [])]));
  }));

  return router;
}
