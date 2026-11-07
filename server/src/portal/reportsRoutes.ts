import { Router, json, type Request, type Response } from "express";
import { h, uid, fail, isUuid, audit, sendCsv, type Db } from "./common.js";
import type { EmailSender } from "../auth/email.js";
import { createReports, PACKS, CSV_KINDS } from "../services/reports.js";

/**
 * The association's reports API (docs/ASSOCIATION_COMPLIANCE.md, module 12), mounted on the association router, so everything is scoped to the signed-in association by construction: no route takes an association id.
 *   GET /reports/packs                      the reports on offer
 *   GET /reports/pack/:pack.pdf?period=     a pack as a PDF (a finance pack takes a month, 2026-10, or a year)
 *   GET /reports/csv/:kind.csv              the member, vehicle or driver list for an auditor
 *   /reports/schedules                      who gets which report, how often; send one now; switch it off
 *   GET /reports/runs                       what was sent, to whom, and what failed
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};

export function mountAssociationReports(router: Router, db: Db, now: () => Date = () => new Date(), mail: EmailSender | null = null): void {
  const rep = createReports(db, mail, now), body = json({ limit: "10kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");

  router.get("/reports/packs", h(async (_req, res) => { res.json({ success: true, packs: PACKS, csv: CSV_KINDS }); }));
  router.get("/reports/pack/:pack.pdf", h(async (req, res) => {
    const r = await rep.build(uid(req), String(req.params.pack), { ...(typeof req.query.period === "string" ? { period: req.query.period } : {}) }); if (!r.ok) { fail(res, r.status, r.error); return; }
    await audit(db, req, "reports.download", String(req.params.pack), { period: r.value.period });
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="${r.value.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`); res.send(r.value.buffer);
  }));
  router.get("/reports/csv/:kind.csv", h(async (req, res) => { const r = await rep.csv(uid(req), String(req.params.kind)); if (!r.ok) { fail(res, r.status, r.error); return; } await audit(db, req, "reports.export", String(req.params.kind)); sendCsv(res, r.value.filename, r.value.columns, r.value.rows); }));

  router.get("/reports/schedules", h(async (req, res) => { res.json({ success: true, schedules: await rep.schedules(uid(req)), emailConfigured: mail !== null && mail.name !== "unconfigured" }); }));
  router.post("/reports/schedules", body, h(async (req, res) => { const r = await rep.addSchedule(uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "reports.schedule.add", r.value.id, { pack: req.body?.pack, frequency: req.body?.frequency }); reply(res, r, 201); }));
  router.post("/reports/schedules/:id/active", body, h(async (req, res) => { if (!isUuid(id(req)) || typeof req.body?.active !== "boolean") { bad(res); return; } reply(res, await rep.setScheduleActive(uid(req), id(req), req.body.active)); }));
  router.delete("/reports/schedules/:id", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await rep.removeSchedule(uid(req), id(req)); if (r.ok) await audit(db, req, "reports.schedule.remove", id(req)); reply(res, r); }));
  router.post("/reports/schedules/:id/send", h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await rep.sendNow(uid(req), id(req)); if (r.ok) await audit(db, req, "reports.send", id(req)); reply(res, r); }));
  router.get("/reports/runs", h(async (req, res) => { res.json({ success: true, runs: await rep.runs(uid(req)) }); }));
}
