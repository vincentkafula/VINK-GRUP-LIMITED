import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { afcDevices, afcRoutes, fareTaps, driverWallets, taxiAssociations, getAfcKpi } from "../data/afcStore.js";
import type { FareTap } from "../types/afc.js";

const router: ReturnType<typeof Router> = Router();

// ─── Devices ─────────────────────────────────────────────────────────────────

router.get("/devices", (req: Request, res: Response): void => {
  const { status, routeId, associationId } = req.query as Record<string,string>;
  let data = [...afcDevices];
  if (status)        data = data.filter(d => d.status === status);
  if (routeId)       data = data.filter(d => d.routeId === routeId);
  if (associationId) data = data.filter(d => d.associationId === associationId);
  res.json({ success: true, data, meta: { total: data.length, online: data.filter(d => d.status === "online").length } });
});

router.get("/devices/:ref", (req: Request, res: Response): void => {
  const device = afcDevices.find(d => d.referenceNumber === req.params.ref || d.id === req.params.ref);
  if (!device) { res.status(404).json({ success: false, error: "Device not found" }); return; }
  res.json({ success: true, data: device });
});

router.patch("/devices/:ref/status", (req: Request, res: Response): void => {
  const device = afcDevices.find(d => d.referenceNumber === req.params.ref || d.id === req.params.ref);
  if (!device) { res.status(404).json({ success: false, error: "Device not found" }); return; }
  const { status } = req.body;
  if (!["online","offline","maintenance","suspended"].includes(status)) {
    res.status(400).json({ success: false, error: "Invalid status" }); return;
  }
  device.status = status;
  device.lastPingAt = new Date().toISOString();
  res.json({ success: true, data: device });
});

// ─── Tap (core payment endpoint) ─────────────────────────────────────────────

router.post("/tap", (req: Request, res: Response): void => {
  const { deviceRef, cardLast4, fareOverride } = req.body;

  const device = afcDevices.find(d => d.referenceNumber === deviceRef || d.id === deviceRef);
  if (!device) { res.status(404).json({ success: false, error: "Device not registered" }); return; }
  if (device.status !== "online") { res.status(400).json({ success: false, error: "Device offline or suspended" }); return; }

  const start = Date.now();

  // Simulate card check (90% approval rate)
  const approved = Math.random() > 0.10;
  const result = approved ? "approved" : (Math.random() > 0.5 ? "insufficient_funds" : "declined");

  const fare = fareOverride ?? device.fareAmount;
  const fee  = 0.50;
  const driverCut = +(fare * 0.85).toFixed(2);
  const assocCut  = +(fare * 0.05).toFixed(2);
  const commCut   = +(fare * 0.05).toFixed(2);
  const bankCut   = +(fare * 0.05).toFixed(2);

  const tap: FareTap = {
    id: uuid(), deviceId: device.id, deviceRef: device.referenceNumber,
    driverId: device.driverId, driverWalletRef: device.driverWalletRef,
    passengerCardLast4: cardLast4 ?? String(Math.floor(Math.random() * 9000 + 1000)),
    passengerName: null, routeId: device.routeId, routeName: device.routeName,
    fareAmount: fare, processingFee: fee,
    driverCredit: approved ? driverCut : 0,
    associationCredit: approved ? assocCut : 0,
    communityCredit:  approved ? commCut  : 0,
    communityBankCredit: approved ? bankCut : 0,
    result, processingMs: Date.now() - start + Math.floor(Math.random() * 800 + 200),
    wifiSessionGranted: approved && device.wifiEnabled,
    createdAt: new Date().toISOString(),
  };

  fareTaps.unshift(tap);

  if (approved) {
    device.todayTransactions += 1;
    device.todayRevenue     = +(device.todayRevenue + fare).toFixed(2);
    device.totalTransactionsAllTime += 1;
    device.totalRevenueAllTime = +(device.totalRevenueAllTime + fare).toFixed(2);
    device.lastPingAt = new Date().toISOString();

    const wallet = driverWallets.find(w => w.driverId === device.driverId);
    if (wallet) {
      wallet.balance       = +(wallet.balance + driverCut).toFixed(2);
      wallet.todayEarnings = +(wallet.todayEarnings + driverCut).toFixed(2);
      wallet.totalTaps     += 1;
      wallet.lastTapAt     = new Date().toISOString();
    }
  }

  res.json({
    success: true,
    data: tap,
    message: approved
      ? `Payment approved in ${tap.processingMs}ms. Driver credited R${driverCut}. ${device.wifiEnabled ? "WiFi session granted." : ""}`
      : `Payment ${result.replace("_"," ")}. Please ask passenger to top up their Vink card.`,
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/routes", (_req: Request, res: Response): void => {
  res.json({ success: true, data: afcRoutes, meta: { total: afcRoutes.length } });
});

// ─── Fare Taps ────────────────────────────────────────────────────────────────

router.get("/taps", (req: Request, res: Response): void => {
  const { deviceId, deviceRef, driverId, result, page = "1", limit = "20" } = req.query as Record<string,string>;
  let data = [...fareTaps];
  if (deviceId)  data = data.filter(t => t.deviceId === deviceId);
  if (deviceRef) data = data.filter(t => t.deviceRef === deviceRef);
  if (driverId)  data = data.filter(t => t.driverId === driverId);
  if (result)    data = data.filter(t => t.result === result);
  const pg = Math.max(1, +page), lm = Math.min(100, +limit);
  res.json({ success: true, data: data.slice((pg-1)*lm, pg*lm), meta: { page: pg, limit: lm, total: data.length, approvedCount: data.filter(t => t.result === "approved").length } });
});

// ─── Driver Wallets ───────────────────────────────────────────────────────────

router.get("/wallets", (_req: Request, res: Response): void => {
  res.json({ success: true, data: driverWallets, meta: { total: driverWallets.length } });
});

router.get("/wallets/:driverId", (req: Request, res: Response): void => {
  const wallet = driverWallets.find(w => w.driverId === req.params.driverId || w.referenceNumber === req.params.driverId);
  if (!wallet) { res.status(404).json({ success: false, error: "Wallet not found" }); return; }
  res.json({ success: true, data: wallet });
});

// ─── Associations ─────────────────────────────────────────────────────────────

router.get("/associations", (_req: Request, res: Response): void => {
  res.json({ success: true, data: taxiAssociations, meta: { total: taxiAssociations.length } });
});

// ─── KPI ─────────────────────────────────────────────────────────────────────

router.get("/kpi", (_req: Request, res: Response): void => {
  res.json({ success: true, data: getAfcKpi() });
});

export default router;
