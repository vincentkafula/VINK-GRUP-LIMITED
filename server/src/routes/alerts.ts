import { Router, Request, Response } from "express";
import { db } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/alerts  ?severity&component&resolved&page&limit
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { severity, component, resolved } = req.query as Record<string, string>;
  let data = [...db.alerts];
  if (severity) data = data.filter(a => a.severity === severity);
  if (component) data = data.filter(a => a.component.toLowerCase().includes(component.toLowerCase()));
  if (resolved === "true")  data = data.filter(a => !!a.resolvedAt);
  if (resolved === "false") data = data.filter(a => !a.resolvedAt);
  data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = data.length;
  res.json({ success: true, data: data.slice((page - 1) * limit, page * limit), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/alerts/summary
router.get("/summary", requireAuth, (_req: Request, res: Response): void => {
  const total    = db.alerts.length;
  const active   = db.alerts.filter(a => !a.resolvedAt).length;
  const critical = db.alerts.filter(a => a.severity === "critical" && !a.resolvedAt).length;
  const warning  = db.alerts.filter(a => a.severity === "warning"  && !a.resolvedAt).length;
  const info     = db.alerts.filter(a => a.severity === "info"     && !a.resolvedAt).length;
  res.json({ success: true, data: { total, active, critical, warning, info } });
});

// GET /api/alerts/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const alert = db.alerts.find(a => a.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  res.json({ success: true, data: alert });
});

// PATCH /api/alerts/:id/acknowledge
router.patch("/:id/acknowledge", requireAuth, (req: Request, res: Response): void => {
  const alert = db.alerts.find(a => a.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  alert.acknowledgedAt  = new Date().toISOString();
  alert.acknowledgedBy  = req.user!.username;
  res.json({ success: true, data: alert });
});

// PATCH /api/alerts/:id/resolve
router.patch("/:id/resolve", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const alert = db.alerts.find(a => a.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  alert.resolvedAt     = new Date().toISOString();
  alert.severity       = "resolved";
  if (!alert.acknowledgedAt) {
    alert.acknowledgedAt = alert.resolvedAt;
    alert.acknowledgedBy = req.user!.username;
  }
  res.json({ success: true, data: alert });
});

export default router;
