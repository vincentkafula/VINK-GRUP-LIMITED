import { Router, json, type Request, type Response } from "express";
import { h, uid, actor, fail, isUuid, audit, type Db } from "./common.js";
import { createGovernance } from "../services/governance.js";

/**
 * The association's governance and discipline API (docs/ASSOCIATION_COMPLIANCE.md, module 8), mounted on the association router, so everything is scoped to the signed-in association by construction: no route takes an association id.
 * Disciplinary cases hold allegations about identifiable people. Until an association can have several named users, they are visible to whoever holds its login: the guide says so.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function mountAssociationGovernance(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const gov = createGovernance(db, now), body = json({ limit: "60kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");

  router.get("/governance/summary", h(async (req, res) => { const on = typeof req.query.on === "string" && DAY.test(req.query.on) ? req.query.on : undefined; res.json({ success: true, ...(await gov.summary(uid(req), on)) }); }));

  router.get("/governance/meetings", h(async (req, res) => { const y = Number(req.query.year); res.json({ success: true, meetings: await gov.meetings(uid(req), Number.isInteger(y) && y > 1999 ? { year: y } : {}) }); }));
  router.post("/governance/meetings", body, h(async (req, res) => { reply(res, await gov.addMeeting(uid(req), actor(req), req.body ?? {}), 201); }));
  router.put("/governance/meetings/:id/minutes", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await gov.saveMinutes(uid(req), actor(req), id(req), req.body ?? {})); }));
  router.put("/governance/meetings/:id/attendance", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await gov.setAttendance(uid(req), actor(req), id(req), req.body?.attendance)); }));

  router.get("/governance/resolutions", h(async (req, res) => { res.json({ success: true, resolutions: await gov.resolutions(uid(req)) }); }));
  router.post("/governance/resolutions", body, h(async (req, res) => { reply(res, await gov.addResolution(uid(req), actor(req), req.body ?? {}), 201); }));
  router.post("/governance/resolutions/:id/status", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await gov.setResolutionStatus(uid(req), actor(req), id(req), req.body?.status)); }));

  router.get("/governance/elections", h(async (req, res) => { res.json({ success: true, elections: await gov.elections(uid(req)) }); }));
  router.post("/governance/elections", body, h(async (req, res) => { const r = await gov.recordElection(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "governance.election", r.value.id, { heldOn: req.body?.heldOn }); reply(res, r, 201); }));
  router.get("/governance/declarations", h(async (req, res) => { res.json({ success: true, declarations: await gov.declarations(uid(req)) }); }));
  router.post("/governance/declarations", body, h(async (req, res) => { reply(res, await gov.declare(uid(req), actor(req), req.body ?? {}), 201); }));

  router.get("/governance/cases", h(async (req, res) => { res.json({ success: true, cases: await gov.cases(uid(req)) }); }));
  router.post("/governance/cases", body, h(async (req, res) => { const r = await gov.openCase(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "governance.case.open", r.value.id, { subjectKind: req.body?.subjectKind }); reply(res, r, 201); }));
  router.put("/governance/cases/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await gov.updateCase(uid(req), actor(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "governance.case.update", id(req), { fields: Object.keys(req.body ?? {}) }); reply(res, r); }));
}
