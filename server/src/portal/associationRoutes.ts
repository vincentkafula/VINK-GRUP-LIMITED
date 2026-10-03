import { Router, json } from "express";
import { h, uid, num, iso, dateOnly, isUuid, text, optText, validDate, fail, findUserByEmail, isUniqueViolation, type Db } from "./common.js";
import { saPeriods } from "./driverRoutes.js";
import { requestLink } from "./linkRoutes.js";

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
  router.get("/members", h(async (req, res) => {
    const r = (await db.query(
      `SELECT m.id, m.member_role, m.status, m.requested_by, m.created_at, u.id AS user_id, u.name, u.email
         FROM memberships m JOIN users u ON u.id = m.member_id
        WHERE m.association_id = $1 AND (m.status = 'active' OR (m.status = 'pending' AND m.requested_by = 'association')) ORDER BY m.member_role, u.name`, [uid(req)])).rows;
    res.json({ success: true, members: r.map((x) => ({ id: x.id, userId: x.user_id, name: x.name, email: x.email, role: x.member_role, status: x.status, since: iso(x.created_at) })) });
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
    res.json({ success: true, status: to });
  }));

  router.post("/members/:id/remove", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`UPDATE memberships SET status = 'removed', responded_at = now() WHERE id = $1 AND association_id = $2 AND status IN ('active','pending') RETURNING member_id`, [req.params.id, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Member not found"); return; }
    // A marshal who leaves is taken off every rank of this association.
    await db.query(`DELETE FROM rank_marshals WHERE marshal_id = $2 AND rank_id IN (SELECT id FROM ranks WHERE association_id = $1)`, [uid(req), r.rows[0].member_id]);
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

  /* ───── routes (recorded elsewhere; read only here) ───── */
  router.get("/routes", h(async (req, res) => {
    const r = (await db.query(
      `SELECT r.id, r.name, r.active, r.tolerance_meters, COUNT(w.id) AS waypoints
         FROM vehicle_routes r LEFT JOIN route_waypoints w ON w.route_id = r.id WHERE r.association_id = $1
        GROUP BY r.id, r.name, r.active, r.tolerance_meters, r.created_at ORDER BY r.created_at DESC`, [uid(req)])).rows;
    res.json({ success: true, routes: r.map((x) => ({ id: x.id, name: x.name, active: x.active, toleranceMeters: num(x.tolerance_meters), waypoints: num(x.waypoints) })) });
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
    res.status(201).json({ success: true, id: r.rows[0].id });
  }));

  router.post("/levies/:id/paid", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`UPDATE levies SET paid_at = now() WHERE id = $1 AND association_id = $2 AND paid_at IS NULL RETURNING id`, [req.params.id, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Levy not found or already paid"); return; }
    res.json({ success: true });
  }));

  router.post("/levies/:id/delete", h(async (req, res) => {
    if (!isUuid(req.params.id)) { fail(res, 400, "Invalid id"); return; }
    const r = await db.query(`DELETE FROM levies WHERE id = $1 AND association_id = $2 AND paid_at IS NULL RETURNING id`, [req.params.id, uid(req)]);
    if (!r.rows.length) { fail(res, 404, "Levy not found, or it is already paid (paid levies are kept)"); return; }
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
