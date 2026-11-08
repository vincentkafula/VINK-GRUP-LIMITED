import type { Router, Request } from "express";
import { h, uid, fail, sendCsv, type Db } from "./common.js";
import { createOwnerAudit } from "../services/ownerAudit.js";

/**
 * The owner's activity log (docs/OWNER_DASHBOARD.md, slice F), mounted on the owner router. Read only: nothing here can change or remove a record.
 *   GET /audit?group=&actorId=&from=&to=&before=&limit=     who did what, newest first, 50 at a time by default (before = the `next` of the last page)
 *   GET /audit.csv?group=&actorId=&from=&to=                the same, for a spreadsheet (up to 5 000 lines)
 */
export function mountOwnerAudit(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const svc = createOwnerAudit(db, now), q = (req: Request, k: string) => (typeof req.query[k] === "string" && String(req.query[k]) ? String(req.query[k]) : undefined);
  const opts = (req: Request) => ({ group: q(req, "group"), actorId: q(req, "actorId"), from: q(req, "from"), to: q(req, "to") });
  router.get("/audit", h(async (req, res) => { const lim = Number(q(req, "limit")), r = await svc.trail(uid(req), { ...opts(req), before: q(req, "before"), ...(Number.isFinite(lim) && lim > 0 ? { limit: lim } : {}) }); if (!r.ok) { fail(res, r.status, r.error); return; } res.json({ success: true, ...r.value }); }));
  router.get("/audit.csv", h(async (req, res) => { const r = await svc.csv(uid(req), opts(req)); if (!r.ok) { fail(res, r.status, r.error); return; } sendCsv(res, r.value.filename, r.value.columns, r.value.rows); }));
}
