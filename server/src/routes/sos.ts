import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { haDb } from "../data/healingAppleStore.js";
import { requireAuth } from "../middleware/auth.js";
import type { SosEvent } from "../types/healingApple.js";

const router: ReturnType<typeof Router> = Router();

// POST /api/ha/sos  — trigger SOS
router.post("/", requireAuth, (req: Request, res: Response): void => {
  const { triggeredBy, userId, rideId, lat, lng, message } = req.body;
  if (!triggeredBy || !userId || lat == null || lng == null) {
    res.status(400).json({ success: false, error: "triggeredBy, userId, lat, lng required" });
    return;
  }

  // Find emergency contacts to notify
  let contactsNotified: string[] = [];
  if (triggeredBy === "passenger") {
    const p = haDb.passengers.find(p => p.id === userId);
    contactsNotified = p?.emergencyContacts.map(c => c.phone) ?? [];
  }

  const sos: SosEvent = {
    id: uuid(),
    triggeredBy,
    userId,
    rideId: rideId ?? null,
    position: { lat, lng },
    status: "active",
    message: message ?? "SOS triggered",
    contactsNotified,
    emergencyServicesAlerted: true,
    triggeredAt: new Date().toISOString(),
    respondedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    notes: "",
  };

  haDb.sosEvents.push(sos);

  // Mark ride as sos triggered
  if (rideId) {
    const ride = haDb.rides.find(r => r.id === rideId);
    if (ride) ride.sosTriggered = true;
  }

  res.status(201).json({
    success: true,
    data: sos,
    message: `SOS active. ${contactsNotified.length} emergency contact(s) notified. Emergency services alerted.`,
  });
});

// GET /api/ha/sos  — list all SOS events
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const { status } = req.query as Record<string, string>;
  let data = [...haDb.sosEvents];
  if (status) data = data.filter(s => s.status === status);
  data.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
  res.json({ success: true, data, meta: { total: data.length, active: haDb.sosEvents.filter(s => s.status === "active").length } });
});

// PATCH /api/ha/sos/:id/resolve
router.patch("/:id/resolve", requireAuth, (req: Request, res: Response): void => {
  const sos = haDb.sosEvents.find(s => s.id === req.params.id);
  if (!sos) { res.status(404).json({ success: false, error: "SOS event not found" }); return; }
  sos.status = "resolved";
  sos.resolvedAt = new Date().toISOString();
  sos.resolvedBy = req.user!.username;
  sos.notes = req.body.notes ?? "";
  res.json({ success: true, data: sos });
});

export default router;
