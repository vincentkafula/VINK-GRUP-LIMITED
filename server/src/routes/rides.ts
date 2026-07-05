import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { haDb, getPlatformStats } from "../data/healingAppleStore.js";
import { requireAuth } from "../middleware/auth.js";
import type { RideRequest, VehicleType, PaymentMethod } from "../types/healingApple.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/ha/rides  ?passengerId&driverId&status&page&limit
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(50,  Number(req.query.limit) || 20);
  const { passengerId, driverId, status } = req.query as Record<string, string>;
  let data = [...haDb.rides];
  if (passengerId) data = data.filter(r => r.passengerId === passengerId);
  if (driverId)    data = data.filter(r => r.driverId    === driverId);
  if (status)      data = data.filter(r => r.status      === status);
  data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = data.length;
  res.json({ success: true, data: data.slice((page - 1) * limit, page * limit), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/ha/rides/stats
router.get("/stats", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, data: getPlatformStats() });
});

// GET /api/ha/rides/incoming  — pending requests for nearest available driver
router.get("/incoming", requireAuth, (_req: Request, res: Response): void => {
  const pending = haDb.rides.filter(r => r.status === "searching");
  res.json({ success: true, data: pending });
});

// GET /api/ha/rides/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const ride = haDb.rides.find(r => r.id === req.params.id);
  if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }
  res.json({ success: true, data: ride });
});

// POST /api/ha/rides  — passenger books a ride
router.post("/", requireAuth, (req: Request, res: Response): void => {
  const { passengerId, vehicleType, pickupAddress, dropoffAddress, medicalNote, scheduledFor, paymentMethod } = req.body;
  if (!passengerId || !vehicleType || !pickupAddress || !dropoffAddress) {
    res.status(400).json({ success: false, error: "passengerId, vehicleType, pickupAddress and dropoffAddress are required" });
    return;
  }
  const passenger = haDb.passengers.find(p => p.id === passengerId);
  if (!passenger) { res.status(404).json({ success: false, error: "Passenger not found" }); return; }

  // Simple fare estimate based on vehicle type
  const baseFare: Record<VehicleType, number> = { standard: 45, wheelchair: 85, stretcher: 160 };
  const distKm = 5 + Math.random() * 10;
  const fare   = +(baseFare[vehicleType as VehicleType] + distKm * 8).toFixed(2);

  const ride: RideRequest = {
    id: uuid(),
    passengerId,
    passengerName: passenger.name,
    passengerPhone: passenger.phone,
    vehicleType: vehicleType as VehicleType,
    pickupAddress,
    dropoffAddress,
    medicalNote: medicalNote ?? passenger.medicalProfile,
    scheduledFor: scheduledFor ?? null,
    recurrence: req.body.recurrence ?? "once",
    paymentMethod: (paymentMethod ?? "card") as PaymentMethod,
    status: "searching",
    driverId: null, driverName: null, driverPhone: null,
    driverPlate: null, driverVehicle: null, driverRating: null,
    estimatedFareZAR: fare,
    finalFareZAR: null,
    paymentStatus: "pending",
    etaMinutes: null, distanceKm: +distKm.toFixed(1),
    createdAt: new Date().toISOString(),
    acceptedAt: null, pickupAt: null, dropoffAt: null,
    dropoffProofUrl: null, passengerRating: null,
    driverRatingGiven: null, passengerReview: null,
    sosTriggered: false,
  };
  haDb.rides.push(ride);
  res.status(201).json({ success: true, data: ride });
});

// PATCH /api/ha/rides/:id/accept  — driver accepts
router.patch("/:id/accept", requireAuth, (req: Request, res: Response): void => {
  const ride   = haDb.rides.find(r => r.id === req.params.id);
  const driver = haDb.drivers.find(d => d.id === req.body.driverId);
  if (!ride)   { res.status(404).json({ success: false, error: "Ride not found" });   return; }
  if (!driver) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  if (ride.status !== "searching") { res.status(409).json({ success: false, error: "Ride no longer available" }); return; }
  ride.status      = "accepted";
  ride.driverId    = driver.id;
  ride.driverName  = driver.name;
  ride.driverPhone = driver.phone;
  ride.driverPlate = driver.vehiclePlate;
  ride.driverVehicle = `${driver.vehicleMake} ${driver.vehicleModel}`;
  ride.driverRating  = driver.avgRating;
  ride.acceptedAt    = new Date().toISOString();
  ride.etaMinutes    = Math.floor(2 + Math.random() * 10);
  driver.onlineStatus = "on_trip";
  res.json({ success: true, data: ride });
});

// PATCH /api/ha/rides/:id/decline  — driver declines
router.patch("/:id/decline", requireAuth, (req: Request, res: Response): void => {
  const ride = haDb.rides.find(r => r.id === req.params.id);
  if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }
  // Leave in "searching" — another driver can accept
  res.json({ success: true, message: "Ride declined — remains available" });
});

// PATCH /api/ha/rides/:id/status  — advance status
router.patch("/:id/status", requireAuth, (req: Request, res: Response): void => {
  const ride = haDb.rides.find(r => r.id === req.params.id);
  if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }
  const { status, dropoffProofUrl } = req.body;
  const valid: RideRequest["status"][] = ["driver_arriving","in_progress","completed","cancelled"];
  if (!valid.includes(status)) { res.status(400).json({ success: false, error: "Invalid status" }); return; }
  ride.status = status;
  if (status === "in_progress") ride.pickupAt  = new Date().toISOString();
  if (status === "completed") {
    ride.dropoffAt         = new Date().toISOString();
    ride.finalFareZAR      = ride.estimatedFareZAR;
    ride.paymentStatus     = "paid";
    ride.dropoffProofUrl   = dropoffProofUrl ?? "proof.jpg";
    // Update driver stats
    const driver = haDb.drivers.find(d => d.id === ride.driverId);
    if (driver) {
      driver.totalTrips++;
      driver.earningsToday     += +(ride.finalFareZAR * 0.75).toFixed(2);
      driver.earningsThisWeek  += +(ride.finalFareZAR * 0.75).toFixed(2);
      driver.totalEarningsZAR  += +(ride.finalFareZAR * 0.75).toFixed(2);
      driver.onlineStatus       = "online";
      haDb.earnings.push({
        id: uuid(), driverId: driver.id, rideId: ride.id,
        amount: +(ride.finalFareZAR * 0.75).toFixed(2),
        currency: "ZAR", type: "trip",
        description: `Trip: ${ride.pickupAddress.label} → ${ride.dropoffAddress.label}`,
        createdAt: new Date().toISOString(), paid: false, paidAt: null,
      });
    }
    const passenger = haDb.passengers.find(p => p.id === ride.passengerId);
    if (passenger) passenger.totalTrips++;
  }
  if (status === "cancelled") {
    const driver = haDb.drivers.find(d => d.id === ride.driverId);
    if (driver) driver.onlineStatus = "online";
  }
  res.json({ success: true, data: ride });
});

// PATCH /api/ha/rides/:id/rate  — passenger rates driver
router.patch("/:id/rate", requireAuth, (req: Request, res: Response): void => {
  const ride = haDb.rides.find(r => r.id === req.params.id);
  if (!ride) { res.status(404).json({ success: false, error: "Ride not found" }); return; }
  const { rating, review } = req.body;
  if (!rating || rating < 1 || rating > 5) { res.status(400).json({ success: false, error: "rating must be 1-5" }); return; }
  ride.passengerRating = rating;
  ride.passengerReview = review ?? null;
  res.json({ success: true, data: ride });
});

export default router;
