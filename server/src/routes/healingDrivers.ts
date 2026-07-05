import { Router, Request, Response } from "express";
import { haDb } from "../data/healingAppleStore.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/ha/drivers
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const { status, vehicleType } = req.query as Record<string, string>;
  let data = [...haDb.drivers];
  if (status)      data = data.filter(d => d.onlineStatus === status);
  if (vehicleType) data = data.filter(d => d.vehicleType  === vehicleType);
  res.json({ success: true, data, meta: { total: data.length, online: data.filter(d => d.onlineStatus !== "offline").length } });
});

// GET /api/ha/drivers/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const driver = haDb.drivers.find(d => d.id === req.params.id);
  if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  res.json({ success: true, data: driver });
});

// PATCH /api/ha/drivers/:id/status  — toggle online/offline
router.patch("/:id/status", requireAuth, (req: Request, res: Response): void => {
  const driver = haDb.drivers.find(d => d.id === req.params.id);
  if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  const { onlineStatus } = req.body;
  if (!["online","offline"].includes(onlineStatus)) {
    res.status(400).json({ success: false, error: "onlineStatus must be online or offline" }); return;
  }
  if (driver.onlineStatus === "on_trip") {
    res.status(409).json({ success: false, error: "Cannot go offline while on a trip" }); return;
  }
  driver.onlineStatus = onlineStatus;
  driver.lastActiveAt = new Date().toISOString();
  res.json({ success: true, data: driver });
});

// PATCH /api/ha/drivers/:id/location  — update GPS position
router.patch("/:id/location", requireAuth, (req: Request, res: Response): void => {
  const driver = haDb.drivers.find(d => d.id === req.params.id);
  if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  const { lat, lng, heading } = req.body;
  if (lat == null || lng == null) { res.status(400).json({ success: false, error: "lat and lng required" }); return; }
  driver.position = { lat, lng };
  if (heading != null) driver.heading = heading;
  driver.lastActiveAt = new Date().toISOString();
  res.json({ success: true, data: { position: driver.position, heading: driver.heading } });
});

// GET /api/ha/drivers/:id/earnings
router.get("/:id/earnings", requireAuth, (req: Request, res: Response): void => {
  const driver = haDb.drivers.find(d => d.id === req.params.id);
  if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  const records = haDb.earnings.filter(e => e.driverId === req.params.id);
  records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const summary = {
    today:        driver.earningsToday,
    thisWeek:     driver.earningsThisWeek,
    allTime:      driver.totalEarningsZAR,
    pending:      +records.filter(e => !e.paid).reduce((s, e) => s + e.amount, 0).toFixed(2),
    nextPayoutDate: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString().split("T")[0],
  };
  res.json({ success: true, data: { summary, records: records.slice(0, 30) } });
});

// GET /api/ha/drivers/:id/documents
router.get("/:id/documents", requireAuth, (req: Request, res: Response): void => {
  const docs = haDb.documents.filter(d => d.driverId === req.params.id);
  res.json({ success: true, data: docs });
});

// POST /api/ha/drivers/:id/documents  — upload (stub — returns accepted)
router.post("/:id/documents", requireAuth, (req: Request, res: Response): void => {
  const { type, filename } = req.body;
  if (!type || !filename) { res.status(400).json({ success: false, error: "type and filename required" }); return; }
  res.status(202).json({ success: true, message: "Document received and queued for review", data: { type, filename, status: "pending" } });
});

// GET /api/ha/drivers/:id/trips
router.get("/:id/trips", requireAuth, (req: Request, res: Response): void => {
  const trips = haDb.rides.filter(r => r.driverId === req.params.id);
  trips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data: trips.slice(0, 20) });
});

export default router;
