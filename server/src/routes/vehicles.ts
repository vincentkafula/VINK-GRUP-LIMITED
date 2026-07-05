import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { vehicleDb, getFleetSnapshot } from "../data/vehicleStore.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { Vehicle, VehicleAlert, Geofence } from "../types/vehicles.js";

const router: ReturnType<typeof Router> = Router();

// ─── Fleet / Vehicles ─────────────────────────────────────────────────────────

// GET /api/vehicles  ?status&fleet&page&limit&search
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { status, fleet, search } = req.query as Record<string, string>;

  let data = [...vehicleDb.vehicles];
  if (status) data = data.filter(v => v.status === status);
  if (fleet)  data = data.filter(v => v.fleetGroup.toLowerCase() === fleet.toLowerCase());
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(v =>
      v.plateNumber.toLowerCase().includes(q) ||
      v.make.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q)
    );
  }
  const total = data.length;
  res.json({ success: true, data: data.slice((page - 1) * limit, page * limit), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/vehicles/snapshot
router.get("/snapshot", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, data: getFleetSnapshot() });
});

// GET /api/vehicles/positions  — all live positions
router.get("/positions", requireAuth, (_req: Request, res: Response): void => {
  const positions = vehicleDb.vehicles.map(v => ({
    id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model,
    fleetGroup: v.fleetGroup, driverId: v.driverId,
    status: v.status, position: v.position,
    speedKph: v.sensors.speedKph, fuelPercent: v.sensors.fuelPercent,
    lastSeen: v.lastSeen,
  }));
  res.json({ success: true, data: positions });
});

// GET /api/vehicles/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const v = vehicleDb.vehicles.find(v => v.id === req.params.id || v.plateNumber === req.params.id);
  if (!v) { res.status(404).json({ success: false, error: "Vehicle not found" }); return; }
  const driver = vehicleDb.drivers.find(d => d.id === v.driverId) ?? null;
  const activeAlerts = vehicleDb.alerts.filter(a => a.vehicleId === v.id && !a.resolvedAt);
  const recentTrips  = vehicleDb.trips.filter(t => t.vehicleId === v.id).slice(0, 5);
  res.json({ success: true, data: { ...v, driver, activeAlerts, recentTrips } });
});

// POST /api/vehicles
router.post("/", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const { plateNumber, make, model, year, colour, vin, fleetGroup, simIccid, deviceId } = req.body;
  if (!plateNumber || !make || !model || !vin) {
    res.status(400).json({ success: false, error: "plateNumber, make, model and vin are required" });
    return;
  }
  if (vehicleDb.vehicles.find(v => v.plateNumber === plateNumber || v.vin === vin)) {
    res.status(409).json({ success: false, error: "Plate number or VIN already registered" });
    return;
  }
  const vehicle: Vehicle = {
    id: uuid(), plateNumber, make, model,
    year: year ?? new Date().getFullYear(),
    colour: colour ?? "White", vin,
    fleetGroup: fleetGroup ?? "General",
    driverId: null, status: "stopped",
    commChannel: "cellular_4g",
    position: { lat: -26.2041, lng: 28.0473, altitude: 1753, accuracy: 5, heading: 0, timestamp: new Date().toISOString() },
    sensors: { speedKph: 0, fuelPercent: 100, engineTempC: 20, engineOn: false, odometreKm: 0, rpm: 0, batteryV: 12.6, doorOpen: false, ignitionOn: false },
    lastSeen: new Date().toISOString(),
    registeredAt: new Date().toISOString(),
    simIccid: simIccid ?? "",
    deviceId: deviceId ?? uuid(),
    insuranceExpiry: req.body.insuranceExpiry ?? new Date(Date.now() + 365 * 86400000).toISOString(),
    licenceExpiry:   req.body.licenceExpiry   ?? new Date(Date.now() + 365 * 86400000).toISOString(),
    nextServiceKm: req.body.nextServiceKm ?? 10000,
  };
  vehicleDb.vehicles.push(vehicle);
  res.status(201).json({ success: true, data: vehicle });
});

// PATCH /api/vehicles/:id
router.patch("/:id", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const v = vehicleDb.vehicles.find(x => x.id === req.params.id);
  if (!v) { res.status(404).json({ success: false, error: "Vehicle not found" }); return; }
  const allowed: (keyof Vehicle)[] = ["status", "driverId", "fleetGroup", "insuranceExpiry", "licenceExpiry", "nextServiceKm", "commChannel"];
  allowed.forEach(k => { if (req.body[k] !== undefined) (v as unknown as Record<string, unknown>)[k] = req.body[k]; });
  res.json({ success: true, data: v });
});

// DELETE /api/vehicles/:id  (decommission)
router.delete("/:id", requireAuth, requireRole("superadmin"), (req: Request, res: Response): void => {
  const v = vehicleDb.vehicles.find(x => x.id === req.params.id);
  if (!v) { res.status(404).json({ success: false, error: "Vehicle not found" }); return; }
  v.status = "offline";
  v.driverId = null;
  res.json({ success: true, message: "Vehicle decommissioned" });
});

// GET /api/vehicles/:id/history  ?limit=50
router.get("/:id/history", requireAuth, (req: Request, res: Response): void => {
  const v = vehicleDb.vehicles.find(x => x.id === req.params.id);
  if (!v) { res.status(404).json({ success: false, error: "Vehicle not found" }); return; }
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const trips = vehicleDb.trips.filter(t => t.vehicleId === v.id).slice(0, limit);
  res.json({ success: true, data: trips });
});

// ─── Drivers ─────────────────────────────────────────────────────────────────

// GET /api/vehicles/drivers/all
router.get("/drivers/all", requireAuth, (req: Request, res: Response): void => {
  const { status } = req.query as Record<string, string>;
  let data = [...vehicleDb.drivers];
  if (status) data = data.filter(d => d.status === status);
  res.json({ success: true, data, meta: { total: data.length } });
});

// GET /api/vehicles/drivers/:id
router.get("/drivers/:id", requireAuth, (req: Request, res: Response): void => {
  const d = vehicleDb.drivers.find(x => x.id === req.params.id);
  if (!d) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  const vehicle = vehicleDb.vehicles.find(v => v.driverId === d.id) ?? null;
  const trips   = vehicleDb.trips.filter(t => t.driverId === d.id).slice(0, 10);
  res.json({ success: true, data: { ...d, vehicle, recentTrips: trips } });
});

// PATCH /api/vehicles/drivers/:id/assign
router.patch("/drivers/:id/assign", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const d = vehicleDb.drivers.find(x => x.id === req.params.id);
  if (!d) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  const v = vehicleDb.vehicles.find(x => x.id === req.body.vehicleId);
  if (!v) { res.status(404).json({ success: false, error: "Vehicle not found" }); return; }
  // Unassign from previous vehicle
  vehicleDb.vehicles.filter(x => x.driverId === d.id).forEach(x => { x.driverId = null; });
  v.driverId = d.id;
  res.json({ success: true, data: { driver: d, vehicle: v } });
});

// ─── Alerts ──────────────────────────────────────────────────────────────────

// GET /api/vehicles/alerts/all  ?type&severity&resolved&vehicleId&page&limit
router.get("/alerts/all", requireAuth, (req: Request, res: Response): void => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { type, severity, resolved, vehicleId } = req.query as Record<string, string>;

  let data = [...vehicleDb.alerts];
  if (type)      data = data.filter(a => a.type === type);
  if (severity)  data = data.filter(a => a.severity === severity);
  if (vehicleId) data = data.filter(a => a.vehicleId === vehicleId);
  if (resolved === "true")  data = data.filter(a => !!a.resolvedAt);
  if (resolved === "false") data = data.filter(a => !a.resolvedAt);

  data.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  const total = data.length;
  res.json({
    success: true,
    data: data.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total, pages: Math.ceil(total / limit), active: vehicleDb.alerts.filter(a => !a.resolvedAt).length },
  });
});

// PATCH /api/vehicles/alerts/:id/acknowledge
router.patch("/alerts/:id/acknowledge", requireAuth, (req: Request, res: Response): void => {
  const alert = vehicleDb.alerts.find(a => a.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  alert.acknowledged = true;
  res.json({ success: true, data: alert });
});

// PATCH /api/vehicles/alerts/:id/resolve
router.patch("/alerts/:id/resolve", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const alert = vehicleDb.alerts.find(a => a.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  alert.resolvedAt   = new Date().toISOString();
  alert.acknowledged = true;
  res.json({ success: true, data: alert });
});

// ─── Geofences ───────────────────────────────────────────────────────────────

// GET /api/vehicles/geofences/all
router.get("/geofences/all", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, data: vehicleDb.geofences, meta: { total: vehicleDb.geofences.length } });
});

// POST /api/vehicles/geofences
router.post("/geofences", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const { name, description, centerLat, centerLng, radiusM, triggerOn, alertVehicleGroups } = req.body;
  if (!name || !centerLat || !centerLng || !radiusM) {
    res.status(400).json({ success: false, error: "name, centerLat, centerLng and radiusM are required" });
    return;
  }
  const gf: Geofence = {
    id: uuid(), name, description: description ?? "",
    shape: "circle",
    centerLat: Number(centerLat), centerLng: Number(centerLng), radiusM: Number(radiusM),
    active: true,
    triggerOn: triggerOn ?? "both",
    alertVehicleGroups: alertVehicleGroups ?? [],
    createdAt: new Date().toISOString(),
    breachCount: 0,
  };
  vehicleDb.geofences.push(gf);
  res.status(201).json({ success: true, data: gf });
});

// PATCH /api/vehicles/geofences/:id
router.patch("/geofences/:id", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const gf = vehicleDb.geofences.find(g => g.id === req.params.id);
  if (!gf) { res.status(404).json({ success: false, error: "Geofence not found" }); return; }
  (["name","description","radiusM","active","triggerOn"] as const).forEach(k => {
    if (req.body[k] !== undefined) (gf as unknown as Record<string, unknown>)[k] = req.body[k];
  });
  res.json({ success: true, data: gf });
});

// DELETE /api/vehicles/geofences/:id
router.delete("/geofences/:id", requireAuth, requireRole("superadmin"), (req: Request, res: Response): void => {
  const idx = vehicleDb.geofences.findIndex(g => g.id === req.params.id);
  if (idx === -1) { res.status(404).json({ success: false, error: "Geofence not found" }); return; }
  vehicleDb.geofences.splice(idx, 1);
  res.json({ success: true, message: "Geofence deleted" });
});

// ─── Trips ────────────────────────────────────────────────────────────────────

// GET /api/vehicles/trips/all  ?vehicleId&driverId&ongoing&page&limit
router.get("/trips/all", requireAuth, (req: Request, res: Response): void => {
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const { vehicleId, driverId, ongoing } = req.query as Record<string, string>;

  let data = [...vehicleDb.trips];
  if (vehicleId) data = data.filter(t => t.vehicleId === vehicleId);
  if (driverId)  data = data.filter(t => t.driverId  === driverId);
  if (ongoing === "true")  data = data.filter(t => t.ongoing);
  if (ongoing === "false") data = data.filter(t => !t.ongoing);

  data.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  const total = data.length;
  res.json({ success: true, data: data.slice((page - 1) * limit, page * limit), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// ─── Analytics ───────────────────────────────────────────────────────────────

// GET /api/vehicles/analytics/summary
router.get("/analytics/summary", requireAuth, (_req: Request, res: Response): void => {
  const vv = vehicleDb.vehicles;
  const byFleet = ["Delivery","Executive","Field Ops","Security","Maintenance"].map(f => ({
    fleet: f,
    count:   vv.filter(v => v.fleetGroup === f).length,
    moving:  vv.filter(v => v.fleetGroup === f && v.status === "moving").length,
    offline: vv.filter(v => v.fleetGroup === f && v.status === "offline").length,
  }));
  const byStatus = ["moving","idle","stopped","offline","maintenance"].map(s => ({
    status: s,
    count: vv.filter(v => v.status === s).length,
  }));
  const alertsByType = ["speeding","geofence_breach","low_fuel","harsh_braking","engine_off","sos","tampering","accident"].map(t => ({
    type: t,
    count: vehicleDb.alerts.filter(a => a.type === t).length,
    active: vehicleDb.alerts.filter(a => a.type === t && !a.resolvedAt).length,
  }));
  const snapshot = getFleetSnapshot();
  res.json({ success: true, data: { snapshot, byFleet, byStatus, alertsByType, history: vehicleDb.fleetHistory.slice(-24) } });
});

export default router;
