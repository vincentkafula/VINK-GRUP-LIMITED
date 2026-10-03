import { Router, json } from "express";
import { h, uid, isUuid, iso, fail, findUserByEmail, isUniqueViolation, type Db } from "./common.js";

/**
 * Two-sided links between people, shared by the owner, driver and marshal dashboards:
 *   association <-> owner / driver / marshal   (table memberships)
 *   owner       <-> driver                      (table owner_drivers)
 * Either side can ask; nothing is linked until the OTHER side accepts. Every query is keyed on the signed-in user, so nobody can
 * answer, see or end a link that is not theirs.
 *
 *   GET  /requests                       requests waiting for MY answer, plus the links I already have
 *   POST /requests/:kind/:id/respond     {accept: boolean}   kind = membership | owner-driver
 *   POST /requests/:kind/:id/leave       end a link I am part of
 *   POST /associations/request           {email}  (owner, driver, marshal) ask an association to take me in
 *   POST /owners/request                 {email}  (driver) ask an owner to take me on
 */
type MemberRole = "vehicle_owner" | "driver" | "marshal";

/**
 * Starts a link (or restarts one that was declined or removed). Returns false when a link or a pending request already exists.
 * Plain select-then-write rather than a conditional upsert; the UNIQUE (a, b) constraint still stops two simultaneous requests.
 */
export async function requestLink(db: Db, table: "memberships" | "owner_drivers", cols: { a: string; b: string; requested: string }, a: string, b: string, memberRole?: string): Promise<boolean> {
  const found = (await db.query(`SELECT id, status FROM ${table} WHERE ${cols.a} = $1 AND ${cols.b} = $2`, [a, b])).rows[0];
  if (found) {
    if (found.status !== "declined" && found.status !== "removed") return false;
    await db.query(`UPDATE ${table} SET status = 'pending', requested_by = $2, responded_at = NULL${memberRole ? ", member_role = $3" : ""} WHERE id = $1`, memberRole ? [found.id, cols.requested, memberRole] : [found.id, cols.requested]);
    return true;
  }
  try {
    await db.query(memberRole
      ? `INSERT INTO ${table} (${cols.a}, ${cols.b}, requested_by, status, member_role) VALUES ($1,$2,$3,'pending',$4)`
      : `INSERT INTO ${table} (${cols.a}, ${cols.b}, requested_by, status) VALUES ($1,$2,$3,'pending')`, memberRole ? [a, b, cols.requested, memberRole] : [a, b, cols.requested]);
    return true;
  } catch (e) { if (isUniqueViolation(e)) return false; throw e; }
}

export function createLinkRouter(db: Db, myRole: MemberRole): Router {
  const router = Router();

  router.get("/requests", h(async (req, res) => {
    const me = uid(req);
    const incoming: { kind: string; id: string; from: string; fromEmail: string; role: string; at: string | null }[] = [];

    for (const r of (await db.query(
      `SELECT m.id, m.created_at, u.name, u.email FROM memberships m JOIN users u ON u.id = m.association_id
        WHERE m.member_id = $1 AND m.status = 'pending' AND m.requested_by = 'association' ORDER BY m.created_at DESC`, [me])).rows)
      incoming.push({ kind: "membership", id: String(r.id), from: String(r.name), fromEmail: String(r.email), role: "association", at: iso(r.created_at) });

    if (myRole === "driver") {
      for (const r of (await db.query(
        `SELECT o.id, o.created_at, u.name, u.email FROM owner_drivers o JOIN users u ON u.id = o.owner_id
          WHERE o.driver_id = $1 AND o.status = 'pending' AND o.requested_by = 'owner' ORDER BY o.created_at DESC`, [me])).rows)
        incoming.push({ kind: "owner-driver", id: String(r.id), from: String(r.name), fromEmail: String(r.email), role: "vehicle_owner", at: iso(r.created_at) });
    }
    if (myRole === "vehicle_owner") {
      for (const r of (await db.query(
        `SELECT o.id, o.created_at, u.name, u.email FROM owner_drivers o JOIN users u ON u.id = o.driver_id
          WHERE o.owner_id = $1 AND o.status = 'pending' AND o.requested_by = 'driver' ORDER BY o.created_at DESC`, [me])).rows)
        incoming.push({ kind: "owner-driver", id: String(r.id), from: String(r.name), fromEmail: String(r.email), role: "driver", at: iso(r.created_at) });
    }

    const links: { kind: string; id: string; with: string; withEmail: string; role: string; status: string }[] = [];
    for (const r of (await db.query(
      `SELECT m.id, m.status, u.name, u.email FROM memberships m JOIN users u ON u.id = m.association_id
        WHERE m.member_id = $1 AND m.status IN ('active','pending') AND NOT (m.status = 'pending' AND m.requested_by = 'association') ORDER BY m.created_at DESC`, [me])).rows)
      links.push({ kind: "membership", id: String(r.id), with: String(r.name), withEmail: String(r.email), role: "association", status: String(r.status) });
    if (myRole === "driver") {
      for (const r of (await db.query(
        `SELECT o.id, o.status, u.name, u.email FROM owner_drivers o JOIN users u ON u.id = o.owner_id
          WHERE o.driver_id = $1 AND (o.status = 'active' OR (o.status = 'pending' AND o.requested_by = 'driver')) ORDER BY o.created_at DESC`, [me])).rows)
        links.push({ kind: "owner-driver", id: String(r.id), with: String(r.name), withEmail: String(r.email), role: "vehicle_owner", status: String(r.status) });
    }
    res.json({ success: true, incoming, links });
  }));

  router.post("/requests/:kind/:id/respond", json({ limit: "5kb" }), h(async (req, res) => {
    const me = uid(req), { kind, id } = req.params;
    if (!isUuid(id) || typeof req.body?.accept !== "boolean") { fail(res, 400, "A request id and accept (true or false) are required"); return; }
    const to = req.body.accept ? "active" : "declined";
    let n = 0;
    if (kind === "membership")
      n = (await db.query(`UPDATE memberships SET status = $3, responded_at = now() WHERE id = $1 AND member_id = $2 AND status = 'pending' AND requested_by = 'association' RETURNING id`, [id, me, to])).rows.length;
    else if (kind === "owner-driver" && myRole === "driver")
      n = (await db.query(`UPDATE owner_drivers SET status = $3, responded_at = now() WHERE id = $1 AND driver_id = $2 AND status = 'pending' AND requested_by = 'owner' RETURNING id`, [id, me, to])).rows.length;
    else if (kind === "owner-driver" && myRole === "vehicle_owner")
      n = (await db.query(`UPDATE owner_drivers SET status = $3, responded_at = now() WHERE id = $1 AND owner_id = $2 AND status = 'pending' AND requested_by = 'driver' RETURNING id`, [id, me, to])).rows.length;
    else { fail(res, 404, "Request not found"); return; }
    if (!n) { fail(res, 404, "Request not found or already answered"); return; }
    res.json({ success: true, status: to });
  }));

  router.post("/requests/:kind/:id/leave", h(async (req, res) => {
    const me = uid(req), { kind, id } = req.params;
    if (!isUuid(id)) { fail(res, 400, "Invalid id"); return; }
    let n = 0;
    if (kind === "membership") n = (await db.query(`UPDATE memberships SET status = 'removed', responded_at = now() WHERE id = $1 AND member_id = $2 AND status IN ('active','pending') RETURNING id`, [id, me])).rows.length;
    else if (kind === "owner-driver" && myRole === "driver") n = (await db.query(`UPDATE owner_drivers SET status = 'removed', responded_at = now() WHERE id = $1 AND driver_id = $2 AND status IN ('active','pending') RETURNING id`, [id, me])).rows.length;
    if (!n) { fail(res, 404, "Link not found"); return; }
    res.json({ success: true });
  }));

  router.post("/associations/request", json({ limit: "5kb" }), h(async (req, res) => {
    const me = uid(req);
    const target = await findUserByEmail(db, req.body?.email);
    if (!target || target.role !== "association") { fail(res, 404, "No association account was found with that email"); return; }
    const ok = await requestLink(db, "memberships", { a: "association_id", b: "member_id", requested: "member" }, target.id, me, myRole);
    if (!ok) { fail(res, 409, "You already have a link or a pending request with this association"); return; }
    res.json({ success: true, message: `Request sent to ${target.name}. They will approve it.` });
  }));

  if (myRole === "driver") {
    router.post("/owners/request", json({ limit: "5kb" }), h(async (req, res) => {
      const me = uid(req);
      const target = await findUserByEmail(db, req.body?.email);
      if (!target || target.role !== "vehicle_owner") { fail(res, 404, "No vehicle owner account was found with that email"); return; }
      const ok = await requestLink(db, "owner_drivers", { a: "owner_id", b: "driver_id", requested: "driver" }, target.id, me);
      if (!ok) { fail(res, 409, "You already have a link or a pending request with this owner"); return; }
      res.json({ success: true, message: `Request sent to ${target.name}. They will approve it.` });
    }));
  }

  return router;
}
