import { Router, json, type Request, type Response } from "express";
import { h, uid, actor, fail, isUuid, audit, sendCsv, type Db } from "./common.js";
import { createOwnerFinance, type PeriodKind } from "../services/ownerFinance.js";
import { createOwnerFinanceExports } from "../services/ownerFinanceExports.js";
import { createOwnerPlanner } from "../services/ownerPlanner.js";
import { createOwnerBusiness } from "../services/ownerBusiness.js";

/**
 * The owner's finances (docs/OWNER_DASHBOARD.md, slice D1), mounted on the owner router, so everything is scoped to the signed-in owner by construction. The owner's own bookkeeping: it records and reports, it moves no money.
 *   GET  /finance/overview                                  what needs attention, and this month's figures
 *   GET  /finance/profit?period=month|quarter|year|tax_year|custom&on=&from=&to=     profit and loss, per vehicle and for the fleet
 *   GET/POST /finance/costs, POST /finance/costs/:id/void, PUT /finance/costs/:id/fine-status
 *   GET/POST /finance/loans, PUT /finance/loans/:id/balance, POST /finance/loans/:id/settle, POST /finance/loans/:id/instalments, POST /finance/instalments/:id/void
 *   GET/POST /finance/maintenance, GET /finance/maintenance/status, POST /finance/maintenance/:id/void
 *   GET|PUT|DELETE /finance/business     who the owner trades as (printed at the top of the profit and loss)
 *   GET  /finance/planner?priceCents=&depositCents=&ratePercent=&termMonths=&expectedIncomeCents=&expectedCostsCents=&upfrontCostsCents=&lookbackMonths=     what one more vehicle would do (a calculator: records nothing)
 *   GET  /finance/export/profit.csv, costs.csv, loans.csv, profit.pdf     for an accountant, a lender or SARS (same period parameters as /finance/profit)
 * A cost, an instalment or a loan carries an optional clientRef so a retry changes nothing.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/, PERIODS = ["month", "quarter", "year", "tax_year", "custom"];

export function mountOwnerFinance(router: Router, db: Db, now: () => Date = () => new Date()): void {
  const svc = createOwnerFinance(db, now), exp = createOwnerFinanceExports(db, now), planner = createOwnerPlanner(db, now), business = createOwnerBusiness(db, now), body = json({ limit: "10kb" }), id = (req: Request) => String(req.params.id), bad = (res: Response) => fail(res, 400, "Invalid id");
  const q = (req: Request, k: string) => (typeof req.query[k] === "string" ? String(req.query[k]) : undefined), day = (req: Request, k: string) => { const v = q(req, k); return v && DAY.test(v) ? v : undefined; };

  router.get("/finance/overview", h(async (req, res) => { res.json({ success: true, ...(await svc.overview(uid(req), day(req, "on"))) }); }));
  router.get("/finance/profit", h(async (req, res) => { const p = q(req, "period") ?? "month"; if (!PERIODS.includes(p)) { fail(res, 400, "That is not a period I know"); return; } reply(res, await svc.profit(uid(req), { period: p as PeriodKind, ...(day(req, "on") ? { on: day(req, "on")! } : {}), ...(day(req, "from") ? { from: day(req, "from")! } : {}), ...(day(req, "to") ? { to: day(req, "to")! } : {}) })); }));

  const opts = (req: Request) => ({ period: (PERIODS.includes(q(req, "period") ?? "month") ? (q(req, "period") ?? "month") : "month") as PeriodKind, ...(day(req, "on") ? { on: day(req, "on")! } : {}), ...(day(req, "from") ? { from: day(req, "from")! } : {}), ...(day(req, "to") ? { to: day(req, "to")! } : {}) });
  router.get("/finance/export/profit.csv", h(async (req, res) => { if (q(req, "period") && !PERIODS.includes(q(req, "period")!)) { fail(res, 400, "That is not a period I know"); return; } const r = await exp.profitCsv(uid(req), opts(req)); if (!r.ok) { fail(res, r.status, r.error); return; } await audit(db, req, "owner.export", "profit.csv"); sendCsv(res, r.value.filename, r.value.columns, r.value.rows); }));
  router.get("/finance/export/costs.csv", h(async (req, res) => { if (q(req, "period") && !PERIODS.includes(q(req, "period")!)) { fail(res, 400, "That is not a period I know"); return; } const r = await exp.costsCsv(uid(req), opts(req)); if (!r.ok) { fail(res, r.status, r.error); return; } await audit(db, req, "owner.export", "costs.csv"); sendCsv(res, r.value.filename, r.value.columns, r.value.rows); }));
  router.get("/finance/export/loans.csv", h(async (req, res) => { const r = await exp.loansCsv(uid(req), day(req, "on")); if (!r.ok) { fail(res, r.status, r.error); return; } await audit(db, req, "owner.export", "loans.csv"); sendCsv(res, r.value.filename, r.value.columns, r.value.rows); }));
  router.get("/finance/export/profit.pdf", h(async (req, res) => { if (q(req, "period") && !PERIODS.includes(q(req, "period")!)) { fail(res, 400, "That is not a period I know"); return; } const r = await exp.profitPdf(uid(req), opts(req)); if (!r.ok) { fail(res, r.status, r.error); return; } await audit(db, req, "owner.export", "profit.pdf"); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="${r.value.filename}"`); res.setHeader("Cache-Control", "no-store"); res.setHeader("Access-Control-Expose-Headers", "Content-Disposition"); res.send(r.value.pdf); }));

  const num = (req: Request, k: string): number | undefined => { const v = q(req, k); return v === undefined ? undefined : Number(v); };
  router.get("/finance/planner", h(async (req, res) => { reply(res, await planner.plan(uid(req), { priceCents: num(req, "priceCents"), depositCents: num(req, "depositCents"), ratePercent: num(req, "ratePercent"), termMonths: num(req, "termMonths"), expectedIncomeCents: num(req, "expectedIncomeCents"), expectedCostsCents: num(req, "expectedCostsCents"), upfrontCostsCents: num(req, "upfrontCostsCents"), lookbackMonths: num(req, "lookbackMonths") })); }));

  router.get("/finance/business", h(async (req, res) => { res.json({ success: true, business: await business.get(uid(req)) }); }));
  router.put("/finance/business", body, h(async (req, res) => { const r = await business.save(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.business.save", null, { changed: r.value.changed }); reply(res, r); }));
  router.delete("/finance/business", h(async (req, res) => { const r = await business.remove(uid(req)); if (r.ok) await audit(db, req, "owner.business.remove", null); reply(res, r); }));

  router.get("/finance/costs", h(async (req, res) => { const v = q(req, "vehicleId"); res.json({ success: true, costs: await svc.costs(uid(req), { ...(v && isUuid(v) ? { vehicleId: v } : {}), ...(q(req, "category") ? { category: q(req, "category")! } : {}), ...(day(req, "from") ? { from: day(req, "from")! } : {}), ...(day(req, "to") ? { to: day(req, "to")! } : {}), includeVoided: q(req, "voided") === "1" }) }); }));
  router.post("/finance/costs", body, h(async (req, res) => { const r = await svc.addCost(uid(req), req.body ?? {}); if (r.ok && !r.value.duplicate) await audit(db, req, "owner.cost.add", r.value.id, { category: req.body?.category, amountCents: req.body?.amountCents }); reply(res, r, r.ok && r.value.duplicate ? 200 : 201); }));
  router.post("/finance/costs/:id/void", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.voidCost(uid(req), id(req), req.body?.reason); if (r.ok) await audit(db, req, "owner.cost.void", id(req), { reason: req.body?.reason }); reply(res, r); }));
  router.put("/finance/costs/:id/fine-status", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.setFineStatus(uid(req), id(req), req.body?.status); if (r.ok) await audit(db, req, "owner.fine.status", id(req), { status: req.body?.status }); reply(res, r); }));

  router.get("/finance/loans", h(async (req, res) => { res.json({ success: true, ...(await svc.finances(uid(req), day(req, "on"))) }); }));
  router.post("/finance/loans", body, h(async (req, res) => { const r = await svc.addFinance(uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.loan.add", r.value.id, { vehicleId: req.body?.vehicleId, lender: req.body?.lender }); reply(res, r, 201); }));
  router.put("/finance/loans/:id/balance", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.updateBalance(uid(req), id(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.loan.balance", id(req), { balanceCents: req.body?.balanceCents, balanceOn: req.body?.balanceOn }); reply(res, r); }));
  router.post("/finance/loans/:id/settle", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.settle(uid(req), id(req), req.body?.settledOn); if (r.ok) await audit(db, req, "owner.loan.settle", id(req), { settledOn: req.body?.settledOn }); reply(res, r); }));
  router.post("/finance/loans/:id/instalments", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.recordInstalment(uid(req), id(req), req.body ?? {}); if (r.ok && !r.value.duplicate) await audit(db, req, "owner.instalment.add", r.value.id, { amountCents: req.body?.amountCents }); reply(res, r, r.ok && r.value.duplicate ? 200 : 201); }));
  router.post("/finance/instalments/:id/void", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.voidInstalment(uid(req), id(req), req.body?.reason); if (r.ok) await audit(db, req, "owner.instalment.void", id(req), { reason: req.body?.reason }); reply(res, r); }));

  router.get("/finance/maintenance", h(async (req, res) => { const v = q(req, "vehicleId"); res.json({ success: true, entries: await svc.maintenance(uid(req), v && isUuid(v) ? v : undefined) }); }));
  router.get("/finance/maintenance/status", h(async (req, res) => { res.json({ success: true, ...(await svc.maintenanceStatus(uid(req), day(req, "on"))) }); }));
  router.post("/finance/maintenance", body, h(async (req, res) => { const r = await svc.addMaintenance(uid(req), req.body ?? {}); if (r.ok) await audit(db, req, "owner.maintenance.add", r.value.id, { vehicleId: req.body?.vehicleId, kind: req.body?.kind }); reply(res, r, 201); }));
  router.post("/finance/maintenance/:id/void", body, h(async (req, res) => { if (!isUuid(id(req))) { bad(res); return; } const r = await svc.voidMaintenance(uid(req), id(req), req.body?.reason); if (r.ok) await audit(db, req, "owner.maintenance.void", id(req), { reason: req.body?.reason }); reply(res, r); }));
}
