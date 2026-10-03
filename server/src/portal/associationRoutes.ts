import { Router, json, type Request } from "express";
import { h, uid, num, iso, dateOnly, isUuid, text, optText, validDate, fail, findUserByEmail, isUniqueViolation, audit, bucketDays, pageParams, rangeParams, saDay, sendCsv, type Db } from "./common.js";
import { saPeriods } from "./driverRoutes.js";
import { requestLink } from "./linkRoutes.js";
import { loadMap } from "./mapData.js";

/**
 * The Association Dashboard API, mounted at /api/portal/association (associations only). An association sees and changes only its own
 * members, ranks and levies; every query is keyed on the signed-in user.
 *
 *   GET  /members                         active and invited members;   POST /members {email}  invite someone (they have to accept)
 *   GET  /requests                        people who asked to join (waiting for MY approval)
 *   POST /members/:id/respond {accept}    approve or decline a request;   POST /members/:id/remove  end a membership
 *   GET/POST /ranks, PUT /ranks/:id       ranks;   POST /ranks/:id/marshals {marshalId}, POST /ranks/:id/marshals/:marshalId/remove
 *   GET  /routes                          routes recorded for this association (read only)
 *   GET/POST /levies, POST /levies/:id/paid, POST /levies/:id/delete    levies the association sets (all amounts typed in by them)
 *   GET  /reports                         members, ranks, departures and levy totals
 */
export function createAssociationRouter(db: Db, now: () => Date = () => new Date()): Router {
  const router = Router();
  const body = json({ limit: "10kb" });

  router.get("/", (req, res) => { res.json({ success: true, role: "association", user: { id: uid(req), username: req.user!.username } }); });

  /* ───── members and approvals ───── */
  /** Members and invitations. ?role=vehicle_owner|driver|marshal &q=(name or email contains) &limit= &offset= */
  router.get("/members", h(async (req, res) => {
    const args: unknown[] = [uid(req)];
    let where = `m.association_id = $1 AND (m.status = 'active' OR (m.status = 'pending' AND m.requested_by = 'association'))`;
    if (typeof req.query.role === "string" && ["vehicle_owner", "driver", "marshal"].includes(req.query.role)) { args.push(req.query.role); where += ` AND m.member_role = $${args.length}`; }
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80).toLowerCase() : "";
    if (q) { args.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`); where += ` AND (lower(u.name) LIKE $${args.length} OR lower(u.email) LIKE $${args.length})`; }
    const total = num((await db.query(`SELECT COUNT(*) AS n FROM memberships m JOIN users u ON u.id = m.member_id WHERE ${where}`, args)).rows[0]?.n);
    const { limit, offset } = pageParams(req, 50, 200);
    const r = (await db.query(
      `SELECT m.id, m.member_role, m.status, m.requested_by, m.created_at, u.id AS user_id, u.name, u.email
         FROM memberships m JOIN users u ON u.id = m.member_id WHERE ${where} ORDER BY m.member_role, u.name LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset])).rows;
    res.json({ success: true, total, limit, offset, members: r.map((x) => ({ id: x.id, userId: x.user_id, name: x.name, email: x.email, role: x.member_role, status: x.status, since: iso(x.created_at) })) });
  }));

  /** Vehicles belonging to the association's active owner members, with owner and driver. ?q=(registration contains) */
  router.get("/vehicles", h(async (req, res) => {
    const args: unknown[] = [uid(req)];
    let where = `m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner'`;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40).toLowerCase() : "";
    if (q) { args.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`); where += ` AND lower(v.registration) LIKE $${args.length}`; }
    const total = num((await db.query(`SELECT COUNT(*) AS n FROM vehicles v JOIN memberships m ON m.member_id = v.owner_id WHERE ${where}`, args)).rows[0]?.n);
    const { limit, offset } = pageParams(req, 50, 200);
    const r = (await db.query(
      `SELECT v.id, v.registration, v.make, v.model, v.seats, v.disc_expiry, o.name AS owner, d.name AS driver
         FROM vehicles v JOIN memberships m ON m.member_id = v.owner_id JOIN users o ON o.id = v.owner_id LEFT JOIN users d ON d.id = v.driver_id
        WHERE ${where} ORDER BY v.registration LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset])).rows;
    res.json({ success: true, total, limit, offset, vehicles: r.map((x) => ({ id: x.id, registration: x.registration, make: x.make ?? null, model: x.model ?? null, seats: x.seats ?? null, discExpiry: dateOnly(x.disc_expiry), owner: x.owner, driver: x.driver ?? null })) });
  }));

  router.post("/members", body, h(async (req, res) => {
    const target = await findUserByEmail(db, req.body?.email);
    if (!target || !["vehicle_owner", "driver", "marshal"].includes(target.role)) { fail(res, 404, "No owner, driver or marshal account was found with that email"); return; }
    // If they already asked to join, inviting them is the same as approving.
    const asked = (await db.query(`SELECT id FROM memberships WHERE association_id = $1 AND member_id = $2 AND status = 'pending' AND requested_by = 'member'`, [uid(req), target.id])).rows[0];
    if (asked) { await db.query(`UPDATE memberships SET status = 'active', responded_at = now() WHERE id = $1`, [asked.id]); res.json({ success: true, message: `${target.name} is now a member.` }); return; }
    const ok = await requestLink(db, "memberships", { a: "association_id", b: "member_id", requested: "association" }, uid(req), target.id, target.role);
    if (!ok) { fail(res, 409, "That person is already a member or has a pending invitation"); return; }
    res.status(201).json({ success: true, message: `Invitation sent to ${target.name}. They have to accept it.` });
  }));

  router.get("/requests", h(async (req, res) => {
    const r = (await db.query(
      `SELECT m.id, m.member_role, m.created_at, u.name, u.email FROM memberships m JOIN users u ON u.id = m.member_id
        WHERE m.association_id = $1 AND m.status = 'pending' AND m.requested_by = 'member' ORDER BY m.created_at`, [uid(req)])).rows;
    res.json({ success: true, requests: r.map((x) => ({ id: x.id, name: x.name, email: x.email, role: x.member_role, at: iso(x.created_at) })) });
  }));

  router.post("/members/:id/respond", body, h(async (req, res) => {
    if (!isUuid(req.params.id) || typeof req.body?.accept !== "boolean") { fail(res, 400, "A request id and accept (true or false) are required"); return; }
    const to = req.body.accept ? "active" : "declined";
    const r = await db.query(`UPDATE memberships SET status = $3, responded_at = now() WHERE id = $1 AND association_id = $2 AND status = 'pending' AND requested_by = 'member' RETURNING id`, [req.params.id, uid(req), to]);
    if (!r.rows.length) { fail(res, 404, "Request not found or already answered"); return; }
    await audit(db, req, to === "active" ? "association.member.approve" : "association.member.decline", req.params.id);
    res.json({ success: true, status: to });
  }));

  router.post("/members/:id/remove", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`UPDATE memberships SET status = 'removed', responded_at = now() WHERE id = $1 AND association_id = $2 AND status IN ('active','pending') RETURNING member_id`, [req.params.id, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Member not found"); return; }
    // A marshal who leaves is taken off every rank of this association.
    await db.query(`DELETE FROM rank_marshals WHERE marshal_id = $2 AND rank_id IN (SELECT id FROM ranks WHERE association_id = $1)`, [uid(req), r.rows[0].member_id]);
    await audit(db, req, "association.member.remove", req.params.id);
    res.json({ success: true });
  }));

  /* ───── ranks ───── */
  router.get("/ranks", h(async (req, res) => {
    const ranks = (await db.query(`SELECT id, name, location, active FROM ranks WHERE association_id = $1 ORDER BY name`, [uid(req)])).rows;
    const out = [];
    for (const r of ranks) {
      const marshals = (await db.query(`SELECT u.id, u.name FROM rank_marshals m JOIN users u ON u.id = m.marshal_id WHERE m.rank_id = $1 ORDER BY u.name`, [r.id])).rows;
      const waiting = num((await db.query(`SELECT COUNT(*) AS n FROM rank_queue WHERE rank_id = $1 AND left_at IS NULL`, [r.id])).rows[0]?.n);
      out.push({ id: r.id, name: r.name, location: r.location ?? null, active: r.active, waiting, marshals: marshals.map((m) => ({ id: m.id, name: m.name })) });
    }
    res.json({ success: true, ranks: out });
  }));

  router.post("/ranks", body, h(async (req, res) => {
    const name = text(req.body?.name, 80), location = optText(req.body?.location, 120);
    if (!name) { fail(res, 400, "Give the rank a name"); return; }
    if (location === undefined) { fail(res, 400, "The location is too long"); return; }
    try {
      const r = await db.query(`INSERT INTO ranks (association_id, name, location) VALUES ($1,$2,$3) RETURNING id`, [uid(req), name, location]);
      res.status(201).json({ success: true, id: r.rows[0].id });
    } catch (e) { if (isUniqueViolation(e)) { fail(res, 409, "You already have a rank with that name"); return; } throw e; }
  }));

  router.put("/ranks/:id", body, h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const name = text(req.body?.name, 80), location = optText(req.body?.location, 120), active = req.body?.active;
    if (!name) { fail(res, 400, "Give the rank a name"); return; }
    if (location === undefined || typeof active !== "boolean") { fail(res, 400, "The location or active flag is not valid"); return; }
    try {
      const r = await db.query(`UPDATE ranks SET name = $3, location = $4, active = $5 WHERE id = $1 AND association_id = $2 RETURNING id`, [req.params.id, uid(req), name, location, active]);
      if (!r.rows.length) { fail(res, 404, "Rank not found"); return; }
      res.json({ success: true });
    } catch (e) { if (isUniqueViolation(e)) { fail(res, 409, "You already have a rank with that name"); return; } throw e; }
  }));

  router.post("/ranks/:id/marshals", body, h(async (req, res) => {
    const marshalId = req.body?.marshalId;
    if (!isUuid(req.params.id) || !isUuid(marshalId)) { fail(res, 400, "Invalid id"); return; }
    if (!(await db.query(`SELECT 1 AS x FROM ranks WHERE id = $1 AND association_id = $2`, [req.params.id, uid(req)])).rows.length) { fail(res, 404, "Rank not found"); return; }
    if (!(await db.query(`SELECT 1 AS x FROM memberships WHERE association_id = $1 AND member_id = $2 AND member_role = 'marshal' AND status = 'active'`, [uid(req), marshalId])).rows.length) { fail(res, 400, "That person is not one of your active marshals"); return; }
    try { await db.query(`INSERT INTO rank_marshals (rank_id, marshal_id) VALUES ($1,$2)`, [req.params.id, marshalId]); }
    catch (e) { if (isUniqueViolation(e)) { fail(res, 409, "That marshal is already at this rank"); return; } throw e; }
    res.status(201).json({ success: true });
  }));

  router.post("/ranks/:id/marshals/:marshalId/remove", h(async (req, res) => {
    if (!isUuid(req.params.id) || !isUuid(req.params.marshalId)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`DELETE FROM rank_marshals WHERE rank_id = $1 AND marshal_id = $2 AND rank_id IN (SELECT id FROM ranks WHERE association_id = $3) RETURNING rank_id`, [req.params.id, req.params.marshalId, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Not found"); return; }
    res.json({ success: true });
  }));

  /* ───── routes: recorded against a fare terminal fitted to a member's vehicle; the geofence checks use them ───── */
  const MEMBER_OWNERS = `v.owner_id IN (SELECT member_id FROM memberships WHERE association_id = $1 AND status = 'active' AND member_role = 'vehicle_owner')`;

  router.get("/routes", h(async (req, res) => {
    const r = (await db.query(
      `SELECT r.id, r.name, r.active, r.tolerance_meters, t.serial, v.registration, COUNT(w.id) AS waypoints
         FROM vehicle_routes r JOIN terminals t ON t.id = r.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN route_waypoints w ON w.route_id = r.id
        WHERE r.association_id = $1 GROUP BY r.id, r.name, r.active, r.tolerance_meters, r.created_at, t.serial, v.registration ORDER BY r.created_at DESC`, [uid(req)])).rows;
    res.json({ success: true, routes: r.map((x) => ({ id: x.id, name: x.name, active: x.active, toleranceMeters: num(x.tolerance_meters), waypoints: num(x.waypoints), terminalSerial: x.serial, registration: x.registration ?? null })) });
  }));

  /** The fare terminals a route can be recorded against: those fitted to my members' vehicles. */
  router.get("/terminals", h(async (req, res) => {
    const r = (await db.query(`SELECT t.id, t.serial, t.status, v.registration FROM terminals t JOIN vehicles v ON v.id = t.vehicle_id WHERE ${MEMBER_OWNERS} AND t.status <> 'revoked' ORDER BY t.serial`, [uid(req)])).rows;
    res.json({ success: true, terminals: r.map((x) => ({ id: x.id, serial: x.serial, status: x.status, registration: x.registration })) });
  }));

  const validPoint = (p: unknown): p is { lat: number; lng: number } =>
    typeof p === "object" && p !== null && typeof (p as { lat: unknown }).lat === "number" && typeof (p as { lng: unknown }).lng === "number"
    && Math.abs((p as { lat: number }).lat) <= 90 && Math.abs((p as { lng: number }).lng) <= 180;

  router.post("/routes", body, h(async (req, res) => {
    const b = req.body ?? {}, name = text(b.name, 80);
    if (!isUuid(b.terminalId)) { fail(res, 400, "Choose the vehicle's fare terminal"); return; }
    if (!name) { fail(res, 400, "Give the route a name"); return; }
    const tol = b.toleranceMeters === undefined || b.toleranceMeters === null || b.toleranceMeters === "" ? 200 : Number(b.toleranceMeters);
    if (!Number.isFinite(tol) || tol < 10 || tol > 5000) { fail(res, 400, "The allowed distance off the path must be between 10 and 5000 metres"); return; }
    if (!Array.isArray(b.waypoints) || b.waypoints.length < 2 || b.waypoints.length > 200 || !b.waypoints.every(validPoint)) { fail(res, 400, "A route needs 2 to 200 points, each with a valid latitude and longitude"); return; }
    if (!(await db.query(`SELECT 1 AS x FROM terminals t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = $2 AND ${MEMBER_OWNERS}`, [uid(req), b.terminalId])).rows.length) { fail(res, 400, "That terminal is not fitted to one of your members' vehicles"); return; }
    const route = (await db.query(`INSERT INTO vehicle_routes (terminal_id, association_id, name, tolerance_meters) VALUES ($1,$2,$3,$4) RETURNING id`, [b.terminalId, uid(req), name, tol])).rows[0];
    try {
      for (const [i, p] of (b.waypoints as { lat: number; lng: number }[]).entries()) await db.query(`INSERT INTO route_waypoints (route_id, sequence, lat, lng) VALUES ($1,$2,$3,$4)`, [route.id, i, p.lat, p.lng]);
    } catch (e) { await db.query(`DELETE FROM vehicle_routes WHERE id = $1`, [route.id]); throw e; }    // never leave a route without its path
    await audit(db, req, "association.route.create", String(route.id), { name, points: b.waypoints.length });
    res.status(201).json({ success: true, id: route.id });
  }));

  router.put("/routes/:id", body, h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const name = text(req.body?.name, 80), active = req.body?.active, tol = Number(req.body?.toleranceMeters);
    if (!name || typeof active !== "boolean" || !Number.isFinite(tol) || tol < 10 || tol > 5000) { fail(res, 400, "A name, an active flag and an allowed distance of 10 to 5000 metres are required"); return; }
    const r = await db.query(`UPDATE vehicle_routes SET name = $3, active = $4, tolerance_meters = $5 WHERE id = $1 AND association_id = $2 RETURNING id`, [req.params.id, uid(req), name, active, tol]);
    if (!r.rows.length) { fail(res, 404, "Route not found"); return; }
    await audit(db, req, "association.route.update", req.params.id, { name, active, tol });
    res.json({ success: true });
  }));

  router.get("/routes/:id/violations", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    if (!(await db.query(`SELECT 1 AS x FROM vehicle_routes WHERE id = $1 AND association_id = $2`, [req.params.id, uid(req)])).rows.length) { fail(res, 404, "Route not found"); return; }
    const { limit, offset } = pageParams(req, 25, 100);
    const r = (await db.query(
      `SELECT rv.id, rv.distance_from_route_m, rv.fine_amount, rv.created_at, v.registration FROM route_violations rv JOIN terminals t ON t.id = rv.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id
        WHERE rv.route_id = $1 ORDER BY rv.created_at DESC LIMIT $2 OFFSET $3`, [req.params.id, limit, offset])).rows;
    res.json({ success: true, violations: r.map((x) => ({ id: x.id, at: iso(x.created_at), distanceMeters: num(x.distance_from_route_m), fine: num(x.fine_amount), registration: x.registration ?? null })) });
  }));

  /** Routes of the association and where its members' vehicles last reported from. */
  router.get("/map", h(async (req, res) => {
    res.json({ success: true, ...(await loadMap(db, `r.association_id = $1 OR ${MEMBER_OWNERS}`, MEMBER_OWNERS, [uid(req)])) });
  }));

  /** Fines credited to the association (the destination of off-route fines), newest first. */
  router.get("/ledger", h(async (req, res) => {
    const { limit, offset } = pageParams(req, 25, 100);
    const total = num((await db.query(`SELECT COUNT(*) AS n FROM association_ledger WHERE association_id = $1`, [uid(req)])).rows[0]?.n);
    const r = (await db.query(`SELECT id, amount, balance_after, description, created_at FROM association_ledger WHERE association_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [uid(req), limit, offset])).rows;
    res.json({ success: true, currency: "ZAR", total, balance: r.length && offset === 0 ? num(r[0].balance_after) : undefined, entries: r.map((x) => ({ id: x.id, amount: num(x.amount), balanceAfter: num(x.balance_after), description: x.description ?? null, at: iso(x.created_at) })) });
  }));

  /** Departures per day across all ranks (default last 14 days), zero-filled, for the trend chart. */
  router.get("/trend", h(async (req, res) => {
    const range = rangeParams(req, now(), 14);
    if ("error" in range) { fail(res, 400, range.error); return; }
    const rows = (await db.query(
      `SELECT d.departed_at, d.passengers FROM departures d JOIN ranks r ON r.id = d.rank_id WHERE r.association_id = $1 AND d.departed_at >= $2 AND d.departed_at < $3 LIMIT 50000`, [uid(req), range.from, range.toExclusive])).rows;
    res.json({ success: true, days: bucketDays(rows.map((x) => ({ at: x.departed_at, value: 1 })), range.from, range.toExclusive).map((d) => ({ day: d.day, departures: d.count })) });
  }));

  /**
   * A summary of what was recorded for the association over a period (default: this month so far): levies charged and collected, fines
   * credited, and departures. Read from recorded transactions; not an audited financial statement and not tax advice.
   */
  async function statement(req: Request) {
    const range = rangeParams(req, now(), 31, saDay(now()).slice(0, 8) + "01");
    if ("error" in range) return range;
    const round = (n: number) => Math.round(n * 100) / 100;
    const levies = (await db.query(
      `SELECT l.title, l.amount, l.due_date, l.paid_at, l.created_at, u.name AS member FROM levies l JOIN users u ON u.id = l.member_id
        WHERE l.association_id = $1 AND l.created_at >= $2 AND l.created_at < $3 ORDER BY l.created_at LIMIT 5000`, [uid(req), range.from, range.toExclusive])).rows;
    const fines = (await db.query(`SELECT amount, description, created_at FROM association_ledger WHERE association_id = $1 AND created_at >= $2 AND created_at < $3 ORDER BY created_at LIMIT 5000`, [uid(req), range.from, range.toExclusive])).rows;
    const dep = (await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(d.passengers), 0) AS pax FROM departures d JOIN ranks r ON r.id = d.rank_id WHERE r.association_id = $1 AND d.departed_at >= $2 AND d.departed_at < $3`, [uid(req), range.from, range.toExclusive])).rows[0];
    return {
      range, levies, fines,
      totals: {
        leviesCharged: round(levies.reduce((a, l) => a + num(l.amount), 0)), leviesCollected: round(levies.reduce((a, l) => a + (l.paid_at ? num(l.amount) : 0), 0)),
        finesCredited: round(fines.reduce((a, f) => a + num(f.amount), 0)), departures: num(dep?.n), passengers: num(dep?.pax),
      },
    };
  }
  router.get("/statements", h(async (req, res) => {
    const st = await statement(req);
    if ("error" in st) { fail(res, 400, st.error); return; }
    res.json({ success: true, currency: "ZAR", from: st.range.fromDay, to: st.range.toDay, totals: st.totals,
      levies: st.levies.map((l) => ({ member: l.member, title: l.title, amount: num(l.amount), dueDate: dateOnly(l.due_date), paid: Boolean(l.paid_at) })),
      fines: st.fines.map((f) => ({ amount: num(f.amount), description: f.description ?? null, at: iso(f.created_at) })) });
  }));
  router.get("/statements.csv", h(async (req, res) => {
    const st = await statement(req);
    if ("error" in st) { fail(res, 400, st.error); return; }
    await audit(db, req, "association.export.statement", null, { from: st.range.fromDay, to: st.range.toDay });
    sendCsv(res, `association-summary-${st.range.fromDay}-to-${st.range.toDay}.csv`, ["Date", "Type", "Member / detail", "Amount (ZAR)", "Status"],
      [...st.levies.map((l) => [saDay(new Date(l.created_at as string)), "Levy", `${l.member}: ${l.title}`, num(l.amount), l.paid_at ? "paid" : "unpaid"]),
        ...st.fines.map((f) => [saDay(new Date(f.created_at as string)), "Fine credited", f.description ?? "Off-route fine", num(f.amount), "received"]),
        ["TOTAL", "Levies charged", "", st.totals.leviesCharged, ""], ["TOTAL", "Levies collected", "", st.totals.leviesCollected, ""], ["TOTAL", "Fines credited", "", st.totals.finesCredited, ""],
        ["TOTAL", "Departures", `${st.totals.passengers} passengers`, st.totals.departures, ""]]);
  }));

  /* ───── levies: set and tracked by the association; no amounts or schedules are built in ───── */
  router.get("/levies", h(async (req, res) => {
    const r = (await db.query(
      `SELECT l.id, l.title, l.amount, l.due_date, l.paid_at, u.name AS member FROM levies l JOIN users u ON u.id = l.member_id
        WHERE l.association_id = $1 ORDER BY l.paid_at IS NOT NULL, l.due_date, l.created_at DESC`, [uid(req)])).rows;
    res.json({ success: true, currency: "ZAR", levies: r.map((x) => ({ id: x.id, title: x.title, amount: num(x.amount), dueDate: dateOnly(x.due_date), paidAt: iso(x.paid_at), member: x.member })) });
  }));

  router.post("/levies", body, h(async (req, res) => {
    const b = req.body ?? {}, title = text(b.title, 120), amount = Number(b.amount);
    if (!isUuid(b.memberId)) { fail(res, 400, "Choose a member"); return; }
    if (!title) { fail(res, 400, "Give the levy a title"); return; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) { fail(res, 400, "The amount must be more than zero"); return; }
    const due = b.dueDate === undefined || b.dueDate === null || b.dueDate === "" ? null : b.dueDate;
    if (due !== null && !validDate(due)) { fail(res, 400, "The due date must look like 2027-03-31"); return; }
    if (!(await db.query(`SELECT 1 AS x FROM memberships WHERE association_id = $1 AND member_id = $2 AND status = 'active'`, [uid(req), b.memberId])).rows.length) { fail(res, 400, "That person is not an active member"); return; }
    const r = await db.query(`INSERT INTO levies (association_id, member_id, title, amount, due_date) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [uid(req), b.memberId, title, Math.round(amount * 100) / 100, due]);
    await audit(db, req, "association.levy.create", String(r.rows[0].id), { amount: Math.round(amount * 100) / 100 });
    res.status(201).json({ success: true, id: r.rows[0].id });
  }));

  router.post("/levies/:id/paid", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`UPDATE levies SET paid_at = now() WHERE id = $1 AND association_id = $2 AND paid_at IS NULL RETURNING id`, [req.params.id, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Levy not found or already paid"); return; }
    await audit(db, req, "association.levy.paid", req.params.id);
    res.json({ success: true });
  }));

  router.post("/levies/:id/delete", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`DELETE FROM levies WHERE id = $1 AND association_id = $2 AND paid_at IS NULL RETURNING id`, [req.params.id, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Levy not found, or it is already paid (paid levies are kept)"); return; }
    await audit(db, req, "association.levy.delete", req.params.id);
    res.json({ success: true });
  }));

  /* ───── reports ───── */
  router.get("/reports", h(async (req, res) => {
    const me = uid(req), p = saPeriods(now());
    const members = (await db.query(`SELECT member_role, COUNT(*) AS n FROM memberships WHERE association_id = $1 AND status = 'active' GROUP BY member_role`, [me])).rows;
    const count = (role: string) => num(members.find((m) => m.member_role === role)?.n);
    const vehicles = num((await db.query(
      `SELECT COUNT(*) AS n FROM vehicles v JOIN memberships m ON m.member_id = v.owner_id AND m.association_id = $1 AND m.status = 'active' AND m.member_role = 'vehicle_owner'`, [me])).rows[0]?.n);
    const ranks = (await db.query(`SELECT id, name FROM ranks WHERE association_id = $1 ORDER BY name`, [me])).rows;
    const rankStats = [];
    for (const r of ranks) {
      const per = async (from: Date) => { const x = (await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(passengers), 0) AS pax FROM departures WHERE rank_id = $1 AND departed_at >= $2`, [r.id, from])).rows[0]; return { departures: num(x?.n), passengers: num(x?.pax) }; };
      rankStats.push({ rank: r.name, today: await per(p.day), week: await per(p.week), month: await per(p.month) });
    }
    const lv = (await db.query(`SELECT COALESCE(SUM(CASE WHEN paid_at IS NULL THEN amount ELSE 0 END), 0) AS outstanding, COALESCE(SUM(CASE WHEN paid_at IS NULL THEN 0 ELSE amount END), 0) AS paid, COUNT(CASE WHEN paid_at IS NULL THEN 1 END) AS open FROM levies WHERE association_id = $1`, [me])).rows[0];
    const pending = num((await db.query(`SELECT COUNT(*) AS n FROM memberships WHERE association_id = $1 AND status = 'pending' AND requested_by = 'member'`, [me])).rows[0]?.n);
    res.json({ success: true, currency: "ZAR", members: { owners: count("vehicle_owner"), drivers: count("driver"), marshals: count("marshal"), vehicles }, pendingRequests: pending, ranks: rankStats, levies: { outstanding: num(lv?.outstanding), paid: num(lv?.paid), open: num(lv?.open) } });
  }));

  return router;
}
