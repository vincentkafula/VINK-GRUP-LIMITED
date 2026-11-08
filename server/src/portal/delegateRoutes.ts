import { Router, json, type Request, type Response } from "express";
import { h, uid, actor, fail, isUuid, audit, type Db } from "./common.js";
import { createDelegates, MODULES } from "../services/delegates.js";
import { createInvitations } from "../services/invitations.js";

/**
 * Named office-bearer users (module 13), mounted on the association router.
 *   GET  /access                         what the signed-in person may do (open to everyone who is signed in), so the screens show only what they can use
 *   /delegates ...                       the association's own login manages its office bearers' logins. A delegate cannot reach these: the gate refuses any path that is not mapped to a module for their role.
 * A login is given either with an EMAILED INVITATION (the person chooses their own password, so nobody is handed one: better, when email is set up) or with a one-time password shown once. A password is never stored in the clear or written to the audit record, and an invitation's link is never written anywhere.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};

export function mountAssociationDelegates(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const del = createDelegates(db, now), inv = createInvitations(db, now), body = json({ limit: "10kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");
  router.get("/access", h(async (req, res) => {
    const d = req.delegateRole ? { userId: actor(req), associationId: uid(req), role: req.delegateRole, officeBearerId: req.delegateBearerId ?? null, name: req.delegateName ?? "", username: req.actorName ?? "", disabled: false } : null;
    res.json({ success: true, ...del.access(d), moduleNames: MODULES });
  }));
  /** Who is inviting, and to what, in words for the email. */
  const whom = async (assoc: string) => { const n = String((await db.query(`SELECT name FROM users WHERE id = $1`, [assoc])).rows[0]?.name ?? "The association"); return { by: n, what: `help run ${n}` }; };
  router.get("/delegates", h(async (req, res) => { res.json({ success: true, delegates: await del.list(uid(req)), invitationsAvailable: inv.available().ok }); }));
  router.post("/delegates", body, h(async (req, res) => {
    const invite = req.body?.invite === true;
    if (invite) { const a = inv.available(); if (!a.ok) { reply(res, a); return; } }                  // never make a login whose invitation cannot be sent
    const r = await del.create(uid(req), actor(req), req.body ?? {}); if (!r.ok) { reply(res, r); return; }
    if (!invite) { await audit(db, req, "delegate.create", r.value.id, { role: req.body?.role, username: r.value.username }); reply(res, r, 201); return; }
    const s = await inv.send(r.value.id, await whom(uid(req))); if (!s.ok) { await del.discard(uid(req), actor(req), r.value.id); reply(res, s); return; }                  // the invitation failed: take the new login back, so they can try again
    await audit(db, req, "delegate.create", r.value.id, { role: req.body?.role, username: r.value.username, invited: true }); res.status(201).json({ success: true, id: r.value.id, username: r.value.username, invited: true });                  // no password: they choose their own
  }));
  router.post("/delegates/:id/invite", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } if (!(await del.isMine(uid(req), id(req)))) { res.status(404).json({ success: false, error: "That login was not found" }); return; } const s = await inv.send(id(req), await whom(uid(req))); if (s.ok) await audit(db, req, "delegate.invite", id(req)); reply(res, s); }));
  router.put("/delegates/:id/role", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await del.setRole(uid(req), actor(req), id(req), req.body?.role); if (r.ok) await audit(db, req, "delegate.role", id(req), { role: req.body?.role }); reply(res, r); }));
  router.post("/delegates/:id/active", body, h(async (req, res) => { if (!isUuid(id(req)) || typeof req.body?.active !== "boolean") { bad(res); return; } const r = await del.setActive(uid(req), actor(req), id(req), req.body.active); if (r.ok) await audit(db, req, "delegate.active", id(req), { active: req.body.active }); reply(res, r); }));
  router.post("/delegates/:id/reset-password", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await del.resetPassword(uid(req), actor(req), id(req)); if (r.ok) await audit(db, req, "delegate.reset-password", id(req)); reply(res, r); }));
}
