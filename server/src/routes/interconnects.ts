import { Router, Request, Response } from "express";
import { db } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/interconnects/roaming
router.get("/roaming", requireAuth, (req: Request, res: Response): void => {
  const { status } = req.query as Record<string, string>;
  let data = [...db.roamingPartners];
  if (status) data = data.filter(r => r.status === status);
  const totalRoamers = data.reduce((s, r) => s + r.activeRoamers, 0);
  const totalRevenue = +data.reduce((s, r) => s + r.revenue30dUSD, 0).toFixed(2);
  res.json({ success: true, data, meta: { total: data.length, totalRoamers, totalRevenue30dUSD: totalRevenue } });
});

// GET /api/interconnects/roaming/:id
router.get("/roaming/:id", requireAuth, (req: Request, res: Response): void => {
  const partner = db.roamingPartners.find(r => r.id === req.params.id);
  if (!partner) { res.status(404).json({ success: false, error: "Roaming partner not found" }); return; }
  res.json({ success: true, data: partner });
});

// PATCH /api/interconnects/roaming/:id
router.patch("/roaming/:id", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const partner = db.roamingPartners.find(r => r.id === req.params.id);
  if (!partner) { res.status(404).json({ success: false, error: "Roaming partner not found" }); return; }
  if (req.body.status) partner.status = req.body.status;
  res.json({ success: true, data: partner });
});

// GET /api/interconnects/routes
router.get("/routes", requireAuth, (req: Request, res: Response): void => {
  const { status, routeType } = req.query as Record<string, string>;
  let data = [...db.carrierRoutes];
  if (status) data = data.filter(r => r.status === status);
  if (routeType) data = data.filter(r => r.routeType === routeType);
  res.json({ success: true, data, meta: { total: data.length } });
});

// PATCH /api/interconnects/routes/:id
router.patch("/routes/:id", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const route = db.carrierRoutes.find(r => r.id === req.params.id);
  if (!route) { res.status(404).json({ success: false, error: "Route not found" }); return; }
  if (req.body.status) route.status = req.body.status;
  if (req.body.ratePerMin !== undefined) route.ratePerMin = req.body.ratePerMin;
  res.json({ success: true, data: route });
});

// GET /api/interconnects/summary
router.get("/summary", requireAuth, (_req: Request, res: Response): void => {
  const activePartners = db.roamingPartners.filter(r => r.status === "active").length;
  const totalRoamers = db.roamingPartners.reduce((s, r) => s + r.activeRoamers, 0);
  const roamingRevenue30d = +db.roamingPartners.reduce((s, r) => s + r.revenue30dUSD, 0).toFixed(2);
  const activeRoutes = db.carrierRoutes.filter(r => r.status === "online").length;
  const avgAsr = db.carrierRoutes.length > 0
    ? +(db.carrierRoutes.reduce((s, r) => s + r.asr, 0) / db.carrierRoutes.length).toFixed(2)
    : 0;
  const intercepts = db.interceptRecords.filter(i => i.active).length;
  res.json({ success: true, data: { activePartners, totalRoamers, roamingRevenue30d, activeRoutes, avgAsr, activeIntercepts: intercepts } });
});

export default router;
