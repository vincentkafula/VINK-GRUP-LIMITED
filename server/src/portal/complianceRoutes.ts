import { Router, json, type Request, type Response } from "express";
import { h, uid, fail, isUuid, audit, type Db } from "./common.js";
import { createCompliance, flagSort } from "../services/compliance.js";
import { createFinance } from "../services/finance.js";
import { createGovernance } from "../services/governance.js";
import { createSafety } from "../services/safety.js";
import { createRouteControl } from "../services/routeControl.js";

/**
 * The association's compliance API (docs/ASSOCIATION_COMPLIANCE.md), mounted on the association router, so everything is scoped to the signed-in association by construction: no route takes an association id.
 *   /compliance/summary, /trend, /changes     the overview, the monthly trend and the change history
 *   /compliance/registration, /office-bearers, /documents, /acceptances   the association's own registration and its evidence
 *   /compliance/vehicles, /licences, /applications   the vehicle register and per-vehicle operating licences
 *   /compliance/drivers                        the driver register
 *   /compliance/settings                       what the association enforces
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function mountAssociationCompliance(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const comp = createCompliance(db, now), fin = createFinance(db, now), gov = createGovernance(db, now), safety = createSafety(db, now), routeControl = createRouteControl(db, now), body = json({ limit: "20kb" }), id = (req: Request) => String(req.params.id);
  const bad = (res: Response) => fail(res, 400, "Invalid id");

  router.get("/compliance/summary", h(async (req, res) => { const day = typeof req.query.on === "string" && DAY.test(req.query.on) ? req.query.on : undefined; const s = await comp.summary(uid(req), day), flags = [...s.flags, ...(await fin.summary(uid(req), day)).flags, ...(await gov.summary(uid(req), day)).flags, ...(await safety.summary(uid(req), day)).flags, ...(await routeControl.report(uid(req), day)).flags].sort(flagSort);      // one list: registers, money, governance, safety and routes
    res.json({ success: true, ...s, flags, flagCounts: { high: flags.filter((f) => f.severity === "high").length, medium: flags.filter((f) => f.severity === "medium").length, low: flags.filter((f) => f.severity === "low").length } }); }));
  router.get("/compliance/trend", h(async (req, res) => { const n = Number(req.query.months); res.json({ success: true, trend: await comp.trend(uid(req), Number.isInteger(n) ? n : 12) }); }));
  router.get("/compliance/changes", h(async (req, res) => { const n = Number(req.query.limit); res.json({ success: true, changes: await comp.changes(uid(req), { ...(typeof req.query.entity === "string" ? { entity: req.query.entity } : {}), ...(Number.isInteger(n) ? { limit: n } : {}) }) }); }));

  router.get("/compliance/registration", h(async (req, res) => { res.json({ success: true, registration: await comp.registration(uid(req)) }); }));
  router.put("/compliance/registration", body, h(async (req, res) => { const r = await comp.saveRegistration(uid(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "compliance.registration", null, { fields: Object.keys(req.body ?? {}) }); if (!r.ok) { reply(res, r); return; } res.json({ success: true, registration: r.value }); }));
  router.get("/compliance/office-bearers", h(async (req, res) => { res.json({ success: true, officeBearers: await comp.officeBearers(uid(req)) }); }));
  router.post("/compliance/office-bearers", body, h(async (req, res) => { reply(res, await comp.addOfficeBearer(uid(req), uid(req), req.body ?? {}), 201); }));
  router.put("/compliance/office-bearers/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await comp.updateOfficeBearer(uid(req), uid(req), id(req), req.body ?? {})); }));
  router.delete("/compliance/office-bearers/:id", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await comp.removeOfficeBearer(uid(req), uid(req), id(req))); }));
  router.get("/compliance/documents", h(async (req, res) => { res.json({ success: true, documents: await comp.documents(uid(req)) }); }));
  router.post("/compliance/documents", body, h(async (req, res) => { reply(res, await comp.addDocument(uid(req), uid(req), req.body ?? {}), 201); }));
  router.delete("/compliance/documents/:id", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await comp.removeDocument(uid(req), uid(req), id(req))); }));
  router.get("/compliance/acceptances", h(async (req, res) => { res.json({ success: true, ...(await comp.acceptances(uid(req))) }); }));
  router.post("/compliance/acceptances", body, h(async (req, res) => { reply(res, await comp.recordAcceptance(uid(req), uid(req), req.body ?? {}), 201); }));

  router.get("/compliance/vehicles", h(async (req, res) => { res.json({ success: true, vehicles: await comp.vehicles(uid(req)) }); }));
  router.put("/compliance/vehicles/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await comp.saveVehicle(uid(req), uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "compliance.vehicle", id(req), { fields: Object.keys(req.body ?? {}) }); reply(res, r); }));
  router.post("/compliance/vehicles/:id/licences", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await comp.addLicence(uid(req), uid(req), id(req), req.body ?? {}), 201); }));
  router.delete("/compliance/licences/:id", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await comp.removeLicence(uid(req), uid(req), id(req))); }));
  router.post("/compliance/vehicles/:id/applications", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await comp.addApplication(uid(req), uid(req), id(req), req.body ?? {}), 201); }));
  router.put("/compliance/applications/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await comp.setApplicationOutcome(uid(req), uid(req), id(req), req.body ?? {})); }));

  router.get("/compliance/drivers", h(async (req, res) => { res.json({ success: true, drivers: await comp.drivers(uid(req)) }); }));
  router.put("/compliance/drivers/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await comp.saveDriver(uid(req), uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "compliance.driver", id(req), { fields: Object.keys(req.body ?? {}).filter((k) => k !== "idNumber") }); reply(res, r); }));

  router.get("/compliance/settings", h(async (req, res) => { res.json({ success: true, enforcePrdp: !!(await db.query(`SELECT enforce_prdp FROM association_settings WHERE association_id = $1`, [uid(req)])).rows[0]?.enforce_prdp }); }));
  router.put("/compliance/settings", body, h(async (req, res) => {
    if (typeof req.body?.enforcePrdp !== "boolean") { fail(res, 400, "Switch it on or off"); return; }
    await db.query(`INSERT INTO association_settings (association_id, enforce_prdp, updated_at) VALUES ($1,$2, now()) ON CONFLICT (association_id) DO UPDATE SET enforce_prdp = EXCLUDED.enforce_prdp, updated_at = now()`, [uid(req), req.body.enforcePrdp]);
    await comp.log(uid(req), "settings", null, `block drivers without a valid permit: ${req.body.enforcePrdp ? "on" : "off"}`, uid(req)); await audit(db, req, "compliance.settings", null, { enforcePrdp: req.body.enforcePrdp }); res.json({ success: true, enforcePrdp: req.body.enforcePrdp });
  }));
}
