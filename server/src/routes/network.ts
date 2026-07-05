import { Router, Request, Response } from "express";
import { db } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// ─── Towers ──────────────────────────────────────────────────────────────────

// GET /api/network/towers
router.get("/towers", requireAuth, (req: Request, res: Response): void => {
  const { status, region, tech } = req.query as Record<string, string>;
  let data = [...db.towers];
  if (status) data = data.filter(t => t.status === status);
  if (region) data = data.filter(t => t.region.toLowerCase() === region.toLowerCase());
  if (tech) data = data.filter(t => t.technology === tech);
  res.json({ success: true, data, meta: { total: data.length } });
});

// GET /api/network/towers/:id
router.get("/towers/:id", requireAuth, (req: Request, res: Response): void => {
  const tower = db.towers.find(t => t.id === req.params.id);
  if (!tower) { res.status(404).json({ success: false, error: "Tower not found" }); return; }
  res.json({ success: true, data: tower });
});

// PATCH /api/network/towers/:id
router.patch("/towers/:id", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const tower = db.towers.find(t => t.id === req.params.id);
  if (!tower) { res.status(404).json({ success: false, error: "Tower not found" }); return; }
  if (req.body.status) tower.status = req.body.status;
  res.json({ success: true, data: tower });
});

// ─── Active Calls / MSC ──────────────────────────────────────────────────────

// GET /api/network/calls
router.get("/calls", requireAuth, (req: Request, res: Response): void => {
  const { status } = req.query as Record<string, string>;
  let data = [...db.calls];
  if (status) data = data.filter(c => c.status === status);
  res.json({ success: true, data, meta: { total: data.length } });
});

// GET /api/network/calls/stats
router.get("/calls/stats", requireAuth, (_req: Request, res: Response): void => {
  const total = db.calls.length;
  const connected = db.calls.filter(c => c.status === "connected").length;
  const ringing = db.calls.filter(c => c.status === "ringing").length;
  const held = db.calls.filter(c => c.status === "held").length;
  const failed = db.calls.filter(c => c.status === "failed").length;
  const avgDuration = total > 0 ? Math.round(db.calls.reduce((s, c) => s + c.durationSec, 0) / total) : 0;
  res.json({ success: true, data: { total, connected, ringing, held, failed, avgDuration } });
});

// ─── Data Sessions / Packet Core ─────────────────────────────────────────────

// GET /api/network/sessions
router.get("/sessions", requireAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { rat, apn } = req.query as Record<string, string>;
  let data = [...db.dataSessions];
  if (rat) data = data.filter(s => s.rat === rat);
  if (apn) data = data.filter(s => s.apn === apn);
  const total = data.length;
  const items = data.slice((page - 1) * limit, page * limit);
  const totalDlGbps = +(data.reduce((s, d) => s + d.downlinkKbps, 0) / 1_000_000).toFixed(3);
  const totalUlGbps = +(data.reduce((s, d) => s + d.uplinkKbps, 0) / 1_000_000).toFixed(3);
  res.json({ success: true, data: items, meta: { page, limit, total, pages: Math.ceil(total / limit), totalDlGbps, totalUlGbps } });
});

// ─── SMS / SMSC ───────────────────────────────────────────────────────────────

// GET /api/network/sms
router.get("/sms", requireAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { status } = req.query as Record<string, string>;
  let data = [...db.smsMessages];
  if (status) data = data.filter(s => s.status === status);
  const total = data.length;
  const items = data.slice((page - 1) * limit, page * limit);
  res.json({ success: true, data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/network/sms/stats
router.get("/sms/stats", requireAuth, (_req: Request, res: Response): void => {
  const total = db.smsMessages.length;
  const delivered = db.smsMessages.filter(s => s.status === "delivered").length;
  const queued = db.smsMessages.filter(s => s.status === "queued").length;
  const failed = db.smsMessages.filter(s => s.status === "failed").length;
  const deliveryRate = total > 0 ? +((delivered / total) * 100).toFixed(2) : 0;
  res.json({ success: true, data: { total, delivered, queued, failed, deliveryRate } });
});

export default router;
