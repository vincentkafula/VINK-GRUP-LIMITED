import { Router, json, type Request, type Response } from "express";
import { h, uid, fail, isUuid, audit, type Db } from "./common.js";
import { createOwnerTeam, TEAM_MODULES, type Member } from "../services/ownerTeam.js";

/**
 * An owner's team (docs/OWNER_DASHBOARD.md, slice E), mounted on the owner router.
 *   GET  /access                        what the signed-in person may do (open to everyone who is signed in), so the screens show only what they can use
 *   /team ...                           the owner's own login manages the people who help run the business. A team member cannot reach these: the gate refuses any path that is not mapped to a module for their role.
 * A password is made when a login is created or reset, shown ONCE in the response, and never stored in the clear or written to the audit record.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};

export function mountOwnerTeam(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const team = createOwnerTeam(db, now), body = json({ limit: "10kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");
  router.get("/access", h(async (req, res) => {
    const m: Member | null = req.ownerRole ? { userId: req.actorId ?? "", ownerId: uid(req), role: req.ownerRole, name: req.delegateName ?? "", username: req.actorName ?? "", disabled: false } : null;
    res.json({ success: true, ...team.access(m), moduleNames: TEAM_MODULES });
  }));
  router.get("/team", h(async (req, res) => { res.json({ success: true, team: await team.list(uid(req)) }); }));
  router.post("/team", body, h(async (req, res) => { const r = await team.create(uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "team.create", r.value.id, { role: req.body?.role, username: r.value.username }); reply(res, r, 201); }));
  router.put("/team/:id/role", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await team.setRole(uid(req), id(req), req.body?.role); if (r.ok) await audit(db, req, "team.role", id(req), { role: req.body?.role }); reply(res, r); }));
  router.post("/team/:id/active", body, h(async (req, res) => { if (!isUuid(id(req)) || typeof req.body?.active !== "boolean") { bad(res); return; } const r = await team.setActive(uid(req), id(req), req.body.active); if (r.ok) await audit(db, req, "team.active", id(req), { active: req.body.active }); reply(res, r); }));
  router.post("/team/:id/reset-password", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await team.resetPassword(uid(req), id(req)); if (r.ok) await audit(db, req, "team.reset-password", id(req)); reply(res, r); }));
}
