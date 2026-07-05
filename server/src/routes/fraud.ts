import { Router, Request, Response } from "express";
import { db } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/fraud/alerts  ?severity&type&resolved
router.get("/alerts", requireAuth, (req: Request, res: Response): void => {
  const { severity, type, resolved } = req.query as Record<string, string>;
  let data = [...db.fraudAlerts];
  if (severity) data = data.filter(f => f.severity === severity);
  if (type) data = data.filter(f => f.type === type);
  if (resolved === "true") data = data.filter(f => !!f.resolvedAt);
  if (resolved === "false") data = data.filter(f => !f.resolvedAt);
  data.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  res.json({ success: true, data, meta: { total: data.length, active: data.filter(f => !f.resolvedAt).length } });
});

// GET /api/fraud/alerts/:id
router.get("/alerts/:id", requireAuth, (req: Request, res: Response): void => {
  const alert = db.fraudAlerts.find(f => f.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  res.json({ success: true, data: alert });
});

// PATCH /api/fraud/alerts/:id/resolve
router.patch("/alerts/:id/resolve", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const alert = db.fraudAlerts.find(f => f.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  alert.resolvedAt = new Date().toISOString();
  res.json({ success: true, data: alert });
});

// PATCH /api/fraud/alerts/:id/block
router.patch("/alerts/:id/block", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const alert = db.fraudAlerts.find(f => f.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  alert.blocked = true;
  res.json({ success: true, data: alert });
});

// GET /api/fraud/intercepts
router.get("/intercepts", requireAuth, requireRole("superadmin"), (req: Request, res: Response): void => {
  res.json({ success: true, data: db.interceptRecords, meta: { total: db.interceptRecords.length, active: db.interceptRecords.filter(i => i.active).length } });
});

// GET /api/fraud/summary
router.get("/summary", requireAuth, (_req: Request, res: Response): void => {
  const total = db.fraudAlerts.length;
  const active = db.fraudAlerts.filter(f => !f.resolvedAt).length;
  const blocked = db.fraudAlerts.filter(f => f.blocked).length;
  const byType = ["cloning", "roaming_abuse", "premium_rate", "sim_swap", "dos", "bypass"].map(t => ({
    type: t,
    count: db.fraudAlerts.filter(f => f.type === t).length,
    blocked: db.fraudAlerts.filter(f => f.type === t && f.blocked).length,
  }));
  const avgRisk = total > 0 ? +(db.fraudAlerts.reduce((s, f) => s + f.riskScore, 0) / total).toFixed(2) : 0;
  res.json({ success: true, data: { total, active, blocked, avgRisk, byType } });
});

export default router;
