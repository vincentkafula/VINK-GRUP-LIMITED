import { Router, json, type Request, type Response } from "express";
import { h, uid, actor, fail, isUuid, audit, type Db } from "./common.js";
import { createDriverTargets } from "../services/driverTargets.js";

/**
 * Owner and driver money (docs/OWNER_DASHBOARD.md, slice A), mounted on the owner router, so everything is scoped to the signed-in owner by construction: no route takes an owner id.
 * It records and earmarks; it moves no money. A payment carries an optional clientRef, so a retry (an offline sync, a double tap) changes nothing.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function mountOwnerDriverPay(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const svc = createDriverTargets(db, now), body = json({ limit: "10kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");
  const day = (req: Request, k = "on") => (typeof req.query[k] === "string" && DAY.test(String(req.query[k])) ? String(req.query[k]) : undefined);

  router.get("/driver-pay/fleet", h(async (req, res) => { res.json({ success: true, ...(await svc.fleet(uid(req), day(req))) }); }));
  router.get("/driver-pay/vehicles/:id", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await svc.reconcile(uid(req), id(req), day(req))); }));

  router.get("/driver-pay/targets", h(async (req, res) => { res.json({ success: true, targets: await svc.targets(uid(req)) }); }));
  router.post("/driver-pay/targets", body, h(async (req, res) => { const r = await svc.setTarget(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.target.set", r.value.id, { vehicleId: req.body?.vehicleId, period: req.body?.period, amountCents: req.body?.amountCents }); reply(res, r, 201); }));
  router.post("/driver-pay/targets/:id/end", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.endTarget(uid(req), id(req), req.body?.endDate); if (r.ok) await audit(db, req, "owner.target.end", id(req), { endDate: req.body?.endDate }); reply(res, r); }));
  router.put("/driver-pay/vehicles/:id/split", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.setSplit(uid(req), actor(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.split.set", id(req), { split: req.body }); reply(res, r); }));

  router.get("/driver-pay/pauses", h(async (req, res) => { res.json({ success: true, pauses: await svc.pauses(uid(req)) }); }));
  router.post("/driver-pay/pauses", body, h(async (req, res) => { const r = await svc.addPause(uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.pause.add", r.value.id, { vehicleId: req.body?.vehicleId }); reply(res, r, 201); }));
  router.delete("/driver-pay/pauses/:id", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await svc.cancelPause(uid(req), id(req))); }));

  router.get("/driver-pay/payments", h(async (req, res) => { const v = typeof req.query.vehicleId === "string" && isUuid(req.query.vehicleId) ? req.query.vehicleId : undefined, d = typeof req.query.driverId === "string" && isUuid(req.query.driverId) ? req.query.driverId : undefined, from = day(req, "from"), to = day(req, "to"); res.json({ success: true, payments: await svc.payments(uid(req), { ...(v ? { vehicleId: v } : {}), ...(d ? { driverId: d } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }) }); }));
  router.post("/driver-pay/payments", body, h(async (req, res) => { const r = await svc.recordPayment(uid(req), actor(req), req.body ?? {}); if (r.ok && !r.value.duplicate) await audit(db, req, "owner.payment.record", r.value.id, { vehicleId: req.body?.vehicleId, amountCents: req.body?.amountCents, method: req.body?.method }); reply(res, r, r.ok && r.value.duplicate ? 200 : 201); }));
  router.post("/driver-pay/payments/:id/void", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.voidPayment(uid(req), id(req), req.body?.reason); if (r.ok) await audit(db, req, "owner.payment.void", id(req), { reason: req.body?.reason }); reply(res, r); }));

  router.get("/driver-pay/waivers", h(async (req, res) => { res.json({ success: true, waivers: await svc.waivers(uid(req)) }); }));
  router.post("/driver-pay/waivers", body, h(async (req, res) => { const r = await svc.waive(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.waiver.add", r.value.id, { vehicleId: req.body?.vehicleId, amountCents: req.body?.amountCents }); reply(res, r, 201); }));
}
