import { Router, json } from "express";
import { h, fail, audit, uid, isUuid, type Db } from "../portal/common.js";
import type { LedgerPort } from "../services/moneyEngine.js";
import { reconcile } from "../services/reconciliation.js";
import type { OpsMonitor } from "../services/opsMonitor.js";
import type { SchemeSettlement } from "../services/schemeSettlement.js";
import { evaluateGoLive, confirmItem, withdrawItem, type GateContext } from "../payments/goLive.js";

/**
 * Staff-only operations tools, mounted at /api/admin/ops (owner and superadmin).
 *   GET  /health                          what the monitor has told people, plus a fresh reconciliation
 *   POST /check                           run the monitor now
 *   GET  /go-live                         the go-live gate: every item, whether it is satisfied, and who confirmed it
 *   POST /go-live/:key/confirm            a named person confirms a manual item, with a note saying where the evidence is
 *   DELETE /go-live/:key                  withdraw a confirmation
 *   GET  /settlement/files                imported sponsor-bank settlement files
 *   GET  /settlement/exceptions           settlement lines that need a person
 *   POST /settlement/import               { provider, filename, csv }
 *   POST /settlement/exceptions/:id/resolve   { note }
 */
export interface OpsAdminDeps { db: Db; ledger: LedgerPort; monitor: OpsMonitor; settlement: SchemeSettlement; gateContext: () => Omit<GateContext, "reconcileClean"> }

export function createOpsAdminRouter(d: OpsAdminDeps): Router {
  const router = Router();

  router.get("/health", h(async (_req, res) => {
    const rec = await reconcile(d.db, d.ledger);
    res.json({ success: true, ok: rec.ok, checkedAt: rec.checkedAt, issues: rec.issues, alerts: await d.monitor.state(), destinations: d.monitor.sinkNames() });
  }));
  router.post("/check", h(async (req, res) => { const r = await d.monitor.check(); await audit(d.db, req, "ops.check", null, { issues: r.issues.length, sent: r.sent }); res.json({ success: true, ...r }); }));

  router.get("/go-live", h(async (_req, res) => {
    const rec = await reconcile(d.db, d.ledger);
    res.json({ success: true, ...(await evaluateGoLive(d.db, { ...d.gateContext(), reconcileClean: rec.ok })) });
  }));
  router.post("/go-live/:key/confirm", json({ limit: "4kb" }), h(async (req, res) => {
    const by = { id: uid(req), name: req.user?.username ?? "unknown" };
    const r = await confirmItem(d.db, String(req.params.key), by, typeof req.body?.note === "string" ? req.body.note : "");
    if (!r.ok) return fail(res, 400, r.error);
    await audit(d.db, req, "golive.confirm", String(req.params.key), {});
    res.json({ success: true });
  }));
  router.delete("/go-live/:key", h(async (req, res) => {
    const done = await withdrawItem(d.db, String(req.params.key));
    if (!done) return fail(res, 404, "That item was not confirmed");
    await audit(d.db, req, "golive.withdraw", String(req.params.key), {});
    res.json({ success: true });
  }));

  router.get("/settlement/files", h(async (_req, res) => { res.json({ success: true, files: await d.settlement.files() }); }));
  router.get("/settlement/exceptions", h(async (_req, res) => { res.json({ success: true, exceptions: await d.settlement.exceptions() }); }));
  router.post("/settlement/import", json({ limit: "8mb" }), h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.csv !== "string" || typeof b.provider !== "string" || typeof b.filename !== "string") return fail(res, 400, "Send provider, filename and csv");
    const r = await d.settlement.importFile({ provider: b.provider, filename: b.filename, csv: b.csv, by: uid(req) });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "settlement.import", r.summary.fileId, { lines: r.summary.lines, exceptions: r.summary.exceptions });
    res.status(201).json({ success: true, ...r.summary });
  }));
  router.post("/settlement/exceptions/:id/resolve", json({ limit: "4kb" }), h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Bad id");
    const ok = await d.settlement.resolveException(req.params.id, uid(req), typeof req.body?.note === "string" ? req.body.note : "");
    if (!ok) return fail(res, 400, "Give a note of at least 10 characters for a line that is still open");
    await audit(d.db, req, "settlement.resolve", req.params.id, {});
    res.json({ success: true });
  }));

  return router;
}
