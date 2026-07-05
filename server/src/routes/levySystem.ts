import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import {
  levyAccounts, afcDevices, afcTaps, afcTrips, agreements,
  levyTransactions, rentalBillings, FEES,
  processAFCTap, processEndTrip, processMonthlyRental, getRevenueSnapshot,
} from "../data/levyStore.js";

const router: ReturnType<typeof Router> = Router();

// ─── Snapshot / Dashboard ─────────────────────────────────────────────────────

router.get("/snapshot", (_req: Request, res: Response): void => {
  res.json({ success: true, data: getRevenueSnapshot() });
});

router.get("/fees", (_req: Request, res: Response): void => {
  res.json({ success: true, data: FEES });
});

// ─── Accounts ─────────────────────────────────────────────────────────────────

router.get("/accounts", (req: Request, res: Response): void => {
  const { type, ownerId } = req.query as Record<string, string>;
  let data = [...levyAccounts];
  if (type)    data = data.filter(a => a.type === type);
  if (ownerId) data = data.filter(a => a.ownerId === ownerId);
  res.json({ success: true, data, meta: { total: data.length } });
});

router.get("/accounts/:id", (req: Request, res: Response): void => {
  const acct = levyAccounts.find(a => a.id === req.params.id || a.ownerId === req.params.id);
  if (!acct) { res.status(404).json({ success: false, error: "Account not found" }); return; }
  // Get recent transactions for this account
  const txns = levyTransactions
    .filter(t => t.fromAccountId === acct.id || t.toAccountId === acct.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50);
  res.json({ success: true, data: { ...acct, recentTransactions: txns } });
});

// ─── AFC Devices ──────────────────────────────────────────────────────────────

router.get("/devices", (req: Request, res: Response): void => {
  const { investorId, status } = req.query as Record<string, string>;
  let data = afcDevices.map(d => ({
    ...d,
    investor: levyAccounts.find(a => a.ownerId === d.investorId),
    driver:   levyAccounts.find(a => a.ownerId === d.driverId),
  }));
  if (investorId) data = data.filter(d => d.investorId === investorId);
  if (status)     data = data.filter(d => d.status === status);
  res.json({ success: true, data, meta: { total: data.length } });
});

router.get("/devices/:id", (req: Request, res: Response): void => {
  const dev = afcDevices.find(d => d.id === req.params.id || d.serialNumber === req.params.id);
  if (!dev) { res.status(404).json({ success: false, error: "Device not found" }); return; }
  const taps = afcTaps.filter(t => t.deviceId === dev.id).slice(-20);
  res.json({ success: true, data: { ...dev, recentTaps: taps } });
});

router.patch("/devices/:id/rental", (req: Request, res: Response): void => {
  const dev = afcDevices.find(d => d.id === req.params.id);
  if (!dev) { res.status(404).json({ success: false, error: "Device not found" }); return; }
  const { monthlyRental } = req.body;
  if (monthlyRental !== undefined) dev.monthlyRental = monthlyRental;
  res.json({ success: true, data: dev, message: "Rental amount updated" });
});

// ─── Process AFC Tap ──────────────────────────────────────────────────────────

router.post("/tap", (req: Request, res: Response): void => {
  try {
    const { deviceId, passengerId, fareAmount, routeName, paymentPath, processingMs } = req.body;
    if (!deviceId || !passengerId || !fareAmount) {
      res.status(400).json({ success: false, error: "deviceId, passengerId, fareAmount required" }); return;
    }
    const result = processAFCTap({ deviceId, passengerId, fareAmount, routeName: routeName ?? "Unknown Route", paymentPath: paymentPath ?? "online_fast", processingMs: processingMs ?? 500 });
    res.status(201).json({ success: true, data: result });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// ─── Process Trip End (levy distribution) ────────────────────────────────────

router.post("/trip/end", (req: Request, res: Response): void => {
  try {
    const { deviceId, tripId } = req.body;
    if (!deviceId || !tripId) {
      res.status(400).json({ success: false, error: "deviceId and tripId required" }); return;
    }
    const result = processEndTrip({ deviceId, tripId });
    res.status(201).json({ success: true, data: result });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

router.post("/trip/start", (req: Request, res: Response): void => {
  const { deviceId } = req.body;
  const dev = afcDevices.find(d => d.id === deviceId);
  if (!dev) { res.status(404).json({ success: false, error: "Device not found" }); return; }
  const tripId = uuid();
  dev.currentTripId = tripId;
  const trip = { id: tripId, deviceId, driverId: dev.driverId, status: "active", startedAt: new Date().toISOString() };
  res.status(201).json({ success: true, data: trip });
});

// ─── Trips ────────────────────────────────────────────────────────────────────

router.get("/trips", (req: Request, res: Response): void => {
  const { driverId, deviceId, status } = req.query as Record<string, string>;
  let data = [...afcTrips];
  if (driverId)  data = data.filter(t => t.driverId === driverId);
  if (deviceId)  data = data.filter(t => t.deviceId === deviceId);
  if (status)    data = data.filter(t => t.status === status);
  res.json({ success: true, data: data.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()), meta: { total: data.length } });
});

// ─── Taps ─────────────────────────────────────────────────────────────────────

router.get("/taps", (req: Request, res: Response): void => {
  const { deviceId, driverId, passengerId, page = "1", limit = "20" } = req.query as Record<string, string>;
  let data = [...afcTaps].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  if (deviceId)   data = data.filter(t => t.deviceId === deviceId);
  if (driverId)   data = data.filter(t => t.driverId === driverId);
  if (passengerId) data = data.filter(t => t.passengerId === passengerId);
  const pg = Math.max(1, +page), lm = Math.min(100, +limit);
  res.json({ success: true, data: data.slice((pg-1)*lm, pg*lm), meta: { page: pg, limit: lm, total: data.length } });
});

// ─── Agreements ───────────────────────────────────────────────────────────────

router.get("/agreements", (req: Request, res: Response): void => {
  const { associationId } = req.query as Record<string, string>;
  let data = [...agreements];
  if (associationId) data = data.filter(a => a.associationId === associationId);
  res.json({ success: true, data });
});

router.post("/agreements", (req: Request, res: Response): void => {
  const { associationId, marshallId, marshallPercentage, approvedBy, notes } = req.body;
  if (!associationId || !marshallId || marshallPercentage === undefined) {
    res.status(400).json({ success: false, error: "associationId, marshallId, marshallPercentage required" }); return;
  }
  if (marshallPercentage < 0 || marshallPercentage > 50) {
    res.status(400).json({ success: false, error: "Marshall percentage must be 0–50%" }); return;
  }
  // Deactivate old agreement for this association-marshall pair
  agreements.filter(a => a.associationId === associationId && a.marshallId === marshallId).forEach(a => { a.status = "terminated"; });
  const assoc   = levyAccounts.find(a => a.ownerId === associationId);
  const marshall = levyAccounts.find(a => a.ownerId === marshallId);
  const newAgr = {
    id: uuid(), associationId, associationName: assoc?.ownerName ?? associationId,
    marshallId, marshallName: marshall?.ownerName ?? marshallId,
    marshallPercentage, effectiveFrom: new Date().toISOString().slice(0, 10),
    approvedBy: approvedBy ?? "System", status: "active" as const,
    notes: notes ?? "",
  };
  agreements.push(newAgr);
  res.status(201).json({ success: true, data: newAgr });
});

// ─── Monthly Rentals ──────────────────────────────────────────────────────────

router.get("/rentals", (req: Request, res: Response): void => {
  const { investorId, status } = req.query as Record<string, string>;
  let data = [...rentalBillings];
  if (investorId) {
    const invDevices = afcDevices.filter(d => d.investorId === investorId).map(d => d.id);
    data = data.filter(r => invDevices.includes(r.deviceId));
  }
  if (status) data = data.filter(r => r.status === status);
  res.json({ success: true, data });
});

router.post("/rentals/process", (req: Request, res: Response): void => {
  const { deviceId } = req.body;
  const txn = processMonthlyRental(deviceId);
  if (!txn) { res.status(400).json({ success: false, error: "Could not process rental" }); return; }
  res.status(201).json({ success: true, data: txn, message: "Monthly rental processed" });
});

// ─── Transactions audit ───────────────────────────────────────────────────────

router.get("/transactions", (req: Request, res: Response): void => {
  const { accountId, type, page = "1", limit = "20" } = req.query as Record<string, string>;
  let data = [...levyTransactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  if (accountId) data = data.filter(t => t.fromAccountId === accountId || t.toAccountId === accountId);
  if (type)      data = data.filter(t => t.type === type);
  const pg = Math.max(1, +page), lm = Math.min(100, +limit);
  res.json({ success: true, data: data.slice((pg-1)*lm, pg*lm), meta: { page: pg, limit: lm, total: data.length } });
});

export default router;
