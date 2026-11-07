import { Router, json, type Request, type Response } from "express";
import { h, uid, fail, isUuid, audit, type Db } from "./common.js";
import { createMembers } from "../services/memberRegister.js";

/**
 * The member register (module 2) and owner formalisation (module 10) API, mounted on the association router, so everything is scoped to the signed-in association by construction: no route takes an association id.
 *   /member-register            each member's identity, card and standing (ID numbers are returned masked)
 *   /member-register/non-members   operators on the association's routes who are not members
 *   /formalisation              each owner's business and employer registrations beside the drivers they employ. It tracks and reports; it is not tax advice.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function mountAssociationMembers(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const mem = createMembers(db, now), body = json({ limit: "10kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");
  const day = (req: Request) => (typeof req.query.on === "string" && DAY.test(req.query.on) ? req.query.on : undefined);

  router.get("/member-register", h(async (req, res) => { res.json({ success: true, ...(await mem.register(uid(req), day(req))) }); }));
  router.put("/member-register/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await mem.saveMember(uid(req), uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "members.register.save", id(req), { fields: Object.keys(req.body ?? {}).filter((k) => k !== "idNumber" && k !== "phone") }); reply(res, r); }));
  router.get("/member-register/non-members", h(async (req, res) => { res.json({ success: true, nonMembers: await mem.nonMembers(uid(req)) }); }));
  router.post("/member-register/non-members", body, h(async (req, res) => { const r = await mem.addNonMember(uid(req), uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "members.nonmember.add", r.value.id); reply(res, r, 201); }));
  router.post("/member-register/non-members/:id/end", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } reply(res, await mem.endNonMember(uid(req), uid(req), id(req), req.body?.endedOn)); }));

  router.get("/formalisation", h(async (req, res) => { res.json({ success: true, ...(await mem.formalisation(uid(req), day(req))) }); }));
  router.put("/formalisation/:id", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await mem.saveBusiness(uid(req), uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "members.formalisation.save", id(req), { fields: Object.keys(req.body ?? {}).filter((k) => k !== "taxNumber") }); reply(res, r); }));
}
