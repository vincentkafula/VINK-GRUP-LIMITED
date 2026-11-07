import { Router, json, type Request, type Response } from "express";
import { h, uid, fail, isUuid, audit, type Db } from "./common.js";
import { createSafety } from "../services/safety.js";
import { createRouteControl } from "../services/routeControl.js";

/**
 * The association's safety and conflict API (module 9) and route control API (module 6), mounted on the association router, so everything is scoped to the signed-in association by construction: no route takes an association id.
 * Safety events name identifiable people (a driver, a vehicle): until an association can have several named users they are visible to whoever holds its login, and the guide says so.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function mountAssociationSafety(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const safety = createSafety(db, now), control = createRouteControl(db, now), body = json({ limit: "20kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");
  const day = (req: Request) => (typeof req.query.on === "string" && DAY.test(req.query.on) ? req.query.on : undefined);

  router.get("/safety/summary", h(async (req, res) => { res.json({ success: true, ...(await safety.summary(uid(req), day(req))) }); }));
  router.get("/safety/events", h(async (req, res) => { res.json({ success: true, events: await safety.events(uid(req), { ...(typeof req.query.kind === "string" ? { kind: req.query.kind } : {}), ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }) }); }));
  router.post("/safety/events", body, h(async (req, res) => { const r = await safety.add(uid(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "safety.event.add", r.value.id, { kind: req.body?.kind }); reply(res, r, 201); }));
  router.put("/safety/events/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await safety.update(uid(req), uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "safety.event.update", id(req), { fields: Object.keys(req.body ?? {}) }); reply(res, r); }));
  router.post("/safety/events/:id/escalate", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await safety.escalate(uid(req), uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "safety.event.escalate", id(req), { to: req.body?.to }); reply(res, r); }));
  router.post("/safety/events/:id/resolve", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await safety.resolve(uid(req), uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "safety.event.resolve", id(req)); reply(res, r); }));

  router.get("/route-control", h(async (req, res) => { res.json({ success: true, ...(await control.report(uid(req), day(req))) }); }));
}
