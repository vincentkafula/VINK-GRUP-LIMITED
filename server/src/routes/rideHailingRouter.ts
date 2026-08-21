import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { haversineDistanceM } from "../services/routeGeofenceService.js";
import { emit } from "../services/wsBroadcast.js";

const router: ReturnType<typeof Router> = Router();
const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer"] as const;

const VALID_STATUSES = ["requested", "assigned", "driver_enroute", "arrived", "in_progress", "completed", "cancelled"] as const;

const BASE_FARE = 25;
const PER_KM_RATE = 8.5;

router.post("/estimate", async (req: Request, res: Response): Promise<void> => {
  const { pickupLat, pickupLng, destinationLat, destinationLng } = req.body as {
    pickupLat?: number; pickupLng?: number; destinationLat?: number; destinationLng?: number;
  };
  if ([pickupLat, pickupLng, destinationLat, destinationLng].some(v => typeof v !== "number")) {
    res.status(400).json({ success: false, error: "pickupLat, pickupLng, destinationLat, destinationLng are all required numbers" });
    return;
  }
  const distanceM = haversineDistanceM({ lat: pickupLat!, lng: pickupLng! }, { lat: destinationLat!, lng: destinationLng! });
  const distanceKm = distanceM / 1000;
  const estimatedFare = +(BASE_FARE + distanceKm * PER_KM_RATE).toFixed(2);
  res.json({ success: true, data: { estimatedFare, distanceKm: +distanceKm.toFixed(2) } });
});

router.post("/promo/validate", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { code, fare } = req.body as { code?: string; fare?: number };
  if (!code) { res.status(400).json({ success: false, error: "code is required" }); return; }

  const { rows } = await pool.query(`SELECT * FROM ride_promo_codes WHERE code = $1 AND active = true`, [code.toUpperCase()]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Invalid or expired promo code" }); return; }
  const promo = rows[0];
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    res.status(400).json({ success: false, error: "This promo code has expired" });
    return;
  }

  const discount = promo.discount_pct
    ? +((fare ?? 0) * (Number(promo.discount_pct) / 100)).toFixed(2)
    : +Number(promo.discount_amount ?? 0).toFixed(2);
  res.json({ success: true, data: { code: promo.code, discount } });
});

router.post("/request", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const b = req.body as Record<string, unknown>;
  const required = ["passengerId", "pickupAddress", "pickupLat", "pickupLng", "destinationAddress", "destinationLat", "destinationLng"];
  const missing = required.filter(k => b[k] === undefined || b[k] === null);
  if (missing.length) {
    res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO ride_trips (passenger_id, passenger_name, passenger_phone, vehicle_type, pickup_address, pickup_lat, pickup_lng, destination_address, destination_lat, destination_lng, payment_method, promo_code, medical_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [b.passengerId, b.passengerName ?? null, b.passengerPhone ?? null, b.vehicleType ?? null, b.pickupAddress, b.pickupLat, b.pickupLng,
     b.destinationAddress, b.destinationLat, b.destinationLng, b.paymentMethod ?? null, b.promoCode ?? null, b.medicalNote ?? null]
  );
  const trip = rows[0];
  emit("ride.requested", { tripId: trip.id, vehicleType: trip.vehicle_type, pickupAddress: trip.pickup_address, destinationAddress: trip.destination_address });
  res.status(201).json({ success: true, data: toTripJson(trip) });
});

router.get("/trips/:id", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { rows } = await pool.query(`SELECT * FROM ride_trips WHERE id = $1`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Trip not found" }); return; }
  res.json({ success: true, data: toTripJson(rows[0]) });
});

router.get("/trips", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { passengerId, driverId, status, limit } = req.query as { passengerId?: string; driverId?: string; status?: string; limit?: string };
  const cappedLimit = Math.min(Number(limit) || 20, 100);

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (passengerId) { params.push(passengerId); conditions.push(`passenger_id = $${params.length}`); }
  if (driverId) { params.push(driverId); conditions.push(`driver_id = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(cappedLimit);

  const { rows } = await pool.query(`SELECT * FROM ride_trips ${whereClause} ORDER BY created_at DESC LIMIT $${params.length}`, params);
  res.json({ success: true, data: rows.map(toTripJson) });
});

router.patch("/trips/:id/status", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { status, cancelReason, driverId, driverName, driverPlate, driverLat, driverLng, finalFare } = req.body as {
    status?: string; cancelReason?: string; driverId?: string; driverName?: string; driverPlate?: string;
    driverLat?: number; driverLng?: number; finalFare?: number;
  };
  if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE ride_trips SET
       status = $1,
       cancel_reason = COALESCE($2, cancel_reason),
       driver_id = COALESCE($3, driver_id),
       driver_name = COALESCE($4, driver_name),
       driver_plate = COALESCE($5, driver_plate),
       driver_lat = COALESCE($6, driver_lat),
       driver_lng = COALESCE($7, driver_lng),
       final_fare = COALESCE($8, final_fare),
       updated_at = now()
     WHERE id = $9 RETURNING *`,
    [status, cancelReason ?? null, driverId ?? null, driverName ?? null, driverPlate ?? null, driverLat ?? null, driverLng ?? null, finalFare ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Trip not found" }); return; }

  const eventName = status === "cancelled" ? "ride.cancelled" : status === "completed" ? "ride.completed"
    : (status === "assigned" || status === "driver_enroute") && driverId ? "ride.driver_assigned" : "ride.status_changed";
  emit(eventName, { tripId: rows[0].id, status });

  res.json({ success: true, data: toTripJson(rows[0]) });
});

router.post("/trips/:id/rate", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { rating, review } = req.body as { rating?: number; review?: string };
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    res.status(400).json({ success: false, error: "rating must be a number between 1 and 5" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE ride_trips SET rating = $1, review = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [rating, review ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Trip not found" }); return; }
  res.json({ success: true, data: toTripJson(rows[0]) });
});

router.get("/messages/:tripId", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(`SELECT * FROM ride_messages WHERE trip_id = $1 ORDER BY created_at ASC`, [req.params.tripId]);
  res.json({ success: true, data: rows.map(toMessageJson) });
});

router.post("/messages/:tripId", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { senderId, senderRole, senderName, text } = req.body as { senderId?: string; senderRole?: string; senderName?: string; text?: string };
  if (!senderId || !senderRole || !text?.trim()) {
    res.status(400).json({ success: false, error: "senderId, senderRole, and a non-empty text are required" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO ride_messages (trip_id, sender_id, sender_role, sender_name, text) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.tripId, senderId, senderRole, senderName ?? null, text.trim()]
  );
  res.status(201).json({ success: true, data: toMessageJson(rows[0]) });
});

router.post("/calls/:tripId", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { callerId, callerRole, receiverId } = req.body as { callerId?: string; callerRole?: string; receiverId?: string };
  if (!callerId || !callerRole) {
    res.status(400).json({ success: false, error: "callerId and callerRole are required" });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO ride_calls (trip_id, caller_id, caller_role, receiver_id) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.tripId, callerId, callerRole, receiverId ?? null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

router.get("/drivers", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(`SELECT id, username, name, email FROM users WHERE role = 'driver' ORDER BY name ASC`);
  res.json({ success: true, data: rows });
});

router.get("/admin/stats", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: {} }); return; }
  const { rows } = await pool.query(`SELECT status, COUNT(*)::int as count FROM ride_trips GROUP BY status`);
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = r.count;
  const totalResult = await pool.query(`SELECT COUNT(*)::int as total FROM ride_trips`);
  res.json({ success: true, data: { totalTrips: totalResult.rows[0].total, byStatus } });
});

function toTripJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    passengerId: row.passenger_id, passengerName: row.passenger_name, passengerPhone: row.passenger_phone,
    driverId: row.driver_id, driverName: row.driver_name, driverPlate: row.driver_plate,
    driverLat: row.driver_lat, driverLng: row.driver_lng,
    vehicleType: row.vehicle_type,
    pickupAddress: row.pickup_address, pickupLat: row.pickup_lat, pickupLng: row.pickup_lng,
    destinationAddress: row.destination_address, destinationLat: row.destination_lat, destinationLng: row.destination_lng,
    paymentMethod: row.payment_method, promoCode: row.promo_code, medicalNote: row.medical_note,
    status: row.status, cancelReason: row.cancel_reason,
    estimatedFare: row.estimated_fare, finalFare: row.final_fare,
    rating: row.rating, review: row.review,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function toMessageJson(row: Record<string, unknown>) {
  return {
    id: row.id, tripId: row.trip_id,
    senderId: row.sender_id, senderRole: row.sender_role, senderName: row.sender_name,
    text: row.text, createdAt: row.created_at,
  };
}

export default router;
