import { Router, Request, Response } from "express";
import { haDb } from "../data/healingAppleStore.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/ha/passengers/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const p = haDb.passengers.find(p => p.id === req.params.id);
  if (!p) { res.status(404).json({ success: false, error: "Passenger not found" }); return; }
  res.json({ success: true, data: p });
});

// PATCH /api/ha/passengers/:id  — update profile
router.patch("/:id", requireAuth, (req: Request, res: Response): void => {
  const p = haDb.passengers.find(p => p.id === req.params.id);
  if (!p) { res.status(404).json({ success: false, error: "Passenger not found" }); return; }
  const { name, medicalProfile, preferredVehicleType, emergencyContacts } = req.body;
  if (name) p.name = name;
  if (medicalProfile !== undefined) p.medicalProfile = medicalProfile;
  if (preferredVehicleType) p.preferredVehicleType = preferredVehicleType;
  if (emergencyContacts) p.emergencyContacts = emergencyContacts;
  res.json({ success: true, data: p });
});

// GET /api/ha/passengers/:id/trips
router.get("/:id/trips", requireAuth, (req: Request, res: Response): void => {
  const trips = haDb.rides.filter(r => r.passengerId === req.params.id);
  trips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data: trips });
});

// GET /api/ha/passengers/:id/active
router.get("/:id/active", requireAuth, (req: Request, res: Response): void => {
  const active = haDb.rides.find(r =>
    r.passengerId === req.params.id &&
    ["searching","accepted","driver_arriving","in_progress"].includes(r.status)
  );
  res.json({ success: true, data: active ?? null });
});

// GET /api/ha/passengers/:id/scheduled
router.get("/:id/scheduled", requireAuth, (req: Request, res: Response): void => {
  const rides = haDb.scheduledRides.filter(s => s.passengerId === req.params.id && s.active);
  res.json({ success: true, data: rides });
});

// GET /api/ha/passengers/:id/notifications
router.get("/:id/notifications", requireAuth, (req: Request, res: Response): void => {
  const notifs = haDb.notifications.filter(n => n.userId === req.params.id);
  notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data: notifs, meta: { unread: notifs.filter(n => !n.read).length } });
});

export default router;
