import { Router, Request, Response } from "express";
import { db, getCurrentKpi } from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/kpis/current
router.get("/current", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, data: getCurrentKpi() });
});

// GET /api/kpis/history  ?hours=24
router.get("/history", requireAuth, (req: Request, res: Response): void => {
  const hours = Math.min(Number(req.query.hours) || 24, 168);
  res.json({ success: true, data: db.kpiHistory.slice(-hours) });
});

export default router;
