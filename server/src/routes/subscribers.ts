import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { Subscriber } from "../types/mvno.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/subscribers  ?page=1&limit=20&status=active&search=
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { status, search, plan } = req.query as Record<string, string>;

  let data = [...db.subscribers];
  if (status) data = data.filter(s => s.status === status);
  if (plan) data = data.filter(s => s.plan === plan);
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(s => s.msisdn.includes(q) || s.imsi.includes(q));
  }

  const total = data.length;
  const items = data.slice((page - 1) * limit, page * limit);
  res.json({ success: true, data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/subscribers/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const sub = db.subscribers.find(s => s.id === req.params.id || s.msisdn === req.params.id);
  if (!sub) { res.status(404).json({ success: false, error: "Subscriber not found" }); return; }
  res.json({ success: true, data: sub });
});

// POST /api/subscribers
router.post("/", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const { msisdn, imsi, plan } = req.body;
  if (!msisdn || !imsi || !plan) {
    res.status(400).json({ success: false, error: "msisdn, imsi and plan are required" });
    return;
  }
  if (db.subscribers.find(s => s.msisdn === msisdn || s.imsi === imsi)) {
    res.status(409).json({ success: false, error: "MSISDN or IMSI already exists" });
    return;
  }
  const sub: Subscriber = {
    id: uuid(), msisdn, imsi,
    imei: req.body.imei ?? null,
    status: "active",
    plan,
    dataBalanceMB: req.body.dataBalanceMB ?? 5120,
    smsBalance: req.body.smsBalance ?? 100,
    voiceBalanceMin: req.body.voiceBalanceMin ?? 200,
    homeNetwork: "ZA-VINK",
    currentCell: null,
    roaming: false,
    roamingNetwork: null,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
  db.subscribers.push(sub);
  res.status(201).json({ success: true, data: sub });
});

// PATCH /api/subscribers/:id
router.patch("/:id", requireAuth, requireRole("superadmin", "noc_engineer", "billing_admin"), (req: Request, res: Response): void => {
  const sub = db.subscribers.find(s => s.id === req.params.id);
  if (!sub) { res.status(404).json({ success: false, error: "Subscriber not found" }); return; }
  const allowed: (keyof Subscriber)[] = ["status", "plan", "dataBalanceMB", "smsBalance", "voiceBalanceMin", "roaming", "roamingNetwork"];
  allowed.forEach(k => { if (req.body[k] !== undefined) (sub as unknown as Record<string, unknown>)[k] = req.body[k]; });
  res.json({ success: true, data: sub });
});

// DELETE /api/subscribers/:id  (terminate)
router.delete("/:id", requireAuth, requireRole("superadmin"), (req: Request, res: Response): void => {
  const sub = db.subscribers.find(s => s.id === req.params.id);
  if (!sub) { res.status(404).json({ success: false, error: "Subscriber not found" }); return; }
  sub.status = "terminated";
  res.json({ success: true, message: "Subscriber terminated" });
});

// GET /api/subscribers/:id/cdrs
router.get("/:id/cdrs", requireAuth, (req: Request, res: Response): void => {
  const sub = db.subscribers.find(s => s.id === req.params.id);
  if (!sub) { res.status(404).json({ success: false, error: "Subscriber not found" }); return; }
  const cdrs = db.cdrs.filter(c => c.msisdn === sub.msisdn).slice(0, 50);
  res.json({ success: true, data: cdrs });
});

// GET /api/subscribers/:id/tickets
router.get("/:id/tickets", requireAuth, (req: Request, res: Response): void => {
  const sub = db.subscribers.find(s => s.id === req.params.id);
  if (!sub) { res.status(404).json({ success: false, error: "Subscriber not found" }); return; }
  const tickets = db.tickets.filter(t => t.msisdn === sub.msisdn);
  res.json({ success: true, data: tickets });
});

export default router;
