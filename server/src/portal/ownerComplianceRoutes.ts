import { Router, json, type Request, type Response } from "express";
import { h, uid, fail, isUuid, audit, type Db } from "./common.js";
import { createOwnerCompliance } from "../services/ownerCompliance.js";

/**
 * The owner's licence and compliance centre (docs/OWNER_DASHBOARD.md, slice C1), mounted on the owner router, so everything is scoped to the signed-in owner by construction.
 *   GET    /compliance-centre                         every vehicle's documents, status, score and flags, the fleet's totals, the reminders due now, and the province rules
 *   PUT    /compliance-centre/vehicles/:id            roadworthy, insurance and disc details
 *   POST   /compliance-centre/vehicles/:id/licences   an operating licence (province required; its length follows that province's rule)
 *   DELETE /compliance-centre/licences/:id            a licence entered by mistake
 *   PUT    /compliance-centre/reminders               how many days before an expiry to be reminded
 * The rules themselves are changed by an administrator (npm run licence-rule), never here.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function mountOwnerCompliance(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const svc = createOwnerCompliance(db, now), body = json({ limit: "10kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");
  router.get("/compliance-centre", h(async (req, res) => { const on = typeof req.query.on === "string" && DAY.test(req.query.on) ? req.query.on : undefined; res.json({ success: true, ...(await svc.centre(uid(req), on)) }); }));
  router.put("/compliance-centre/vehicles/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.saveVehicle(uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.compliance.vehicle", id(req), { fields: Object.keys(req.body ?? {}) }); reply(res, r); }));
  router.post("/compliance-centre/vehicles/:id/licences", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.addLicence(uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.compliance.licence.add", r.value.id, { vehicleId: id(req), province: req.body?.province }); reply(res, r, 201); }));
  router.delete("/compliance-centre/licences/:id", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.removeLicence(uid(req), id(req)); if (r.ok) await audit(db, req, "owner.compliance.licence.remove", id(req)); reply(res, r); }));
  router.put("/compliance-centre/reminders", body, h(async (req, res) => { reply(res, await svc.setReminderDays(uid(req), req.body?.days)); }));
}
