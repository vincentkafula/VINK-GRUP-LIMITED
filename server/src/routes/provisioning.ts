import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { SimCard, PortingRequest } from "../types/mvno.js";

const router: ReturnType<typeof Router> = Router();

// ─── SIM Cards ───────────────────────────────────────────────────────────────

// GET /api/provisioning/sims  ?status&type&page&limit
router.get("/sims", requireAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { status, type } = req.query as Record<string, string>;
  let data = [...db.simCards];
  if (status) data = data.filter(s => s.status === status);
  if (type) data = data.filter(s => s.type === type);
  const total = data.length;
  res.json({ success: true, data: data.slice((page - 1) * limit, page * limit), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/provisioning/sims/stats
router.get("/sims/stats", requireAuth, (_req: Request, res: Response): void => {
  const total = db.simCards.length;
  const active = db.simCards.filter(s => s.status === "active").length;
  const unallocated = db.simCards.filter(s => s.status === "unallocated").length;
  const esim = db.simCards.filter(s => s.type === "esim").length;
  const physical = db.simCards.filter(s => s.type === "physical").length;
  const suspended = db.simCards.filter(s => s.status === "suspended").length;
  res.json({ success: true, data: { total, active, unallocated, suspended, esim, physical } });
});

// GET /api/provisioning/sims/:iccid
router.get("/sims/:iccid", requireAuth, (req: Request, res: Response): void => {
  const sim = db.simCards.find(s => s.iccid === req.params.iccid || s.id === req.params.iccid);
  if (!sim) { res.status(404).json({ success: false, error: "SIM not found" }); return; }
  res.json({ success: true, data: sim });
});

// POST /api/provisioning/sims/activate
router.post("/sims/activate", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const { iccid, msisdn, subscriberId } = req.body;
  if (!iccid || !msisdn || !subscriberId) {
    res.status(400).json({ success: false, error: "iccid, msisdn and subscriberId are required" });
    return;
  }
  const sim = db.simCards.find(s => s.iccid === iccid);
  if (!sim) { res.status(404).json({ success: false, error: "SIM not found" }); return; }
  if (sim.status === "active") { res.status(409).json({ success: false, error: "SIM already active" }); return; }
  sim.status = "active";
  sim.msisdn = msisdn;
  sim.subscriberId = subscriberId;
  sim.activatedAt = new Date().toISOString();
  res.json({ success: true, data: sim });
});

// PATCH /api/provisioning/sims/:iccid/suspend
router.patch("/sims/:iccid/suspend", requireAuth, requireRole("superadmin", "noc_engineer", "billing_admin"), (req: Request, res: Response): void => {
  const sim = db.simCards.find(s => s.iccid === req.params.iccid);
  if (!sim) { res.status(404).json({ success: false, error: "SIM not found" }); return; }
  sim.status = "suspended";
  res.json({ success: true, data: sim });
});

// POST /api/provisioning/sims/batch
router.post("/sims/batch", requireAuth, requireRole("superadmin"), (req: Request, res: Response): void => {
  const { quantity, type } = req.body;
  if (!quantity || quantity < 1 || quantity > 1000) {
    res.status(400).json({ success: false, error: "quantity must be 1-1000" });
    return;
  }
  const batchId = `BATCH-${new Date().getFullYear()}-${String(db.simCards.length).padStart(3, "0")}`;
  const newSims: SimCard[] = Array.from({ length: quantity }, (_, i) => ({
    id: uuid(),
    iccid: `8927${String(db.simCards.length + i).padStart(15, "0")}`,
    imsi: `65501${String(db.simCards.length + i).padStart(10, "0")}`,
    msisdn: null,
    type: type ?? "physical",
    status: "unallocated",
    subscriberId: null,
    activatedAt: null,
    batchId,
    createdAt: new Date().toISOString(),
  }));
  db.simCards.push(...newSims);
  res.status(201).json({ success: true, data: { batchId, quantity: newSims.length, message: `${newSims.length} SIMs created in batch ${batchId}` } });
});

// ─── Porting ──────────────────────────────────────────────────────────────────

// GET /api/provisioning/porting
router.get("/porting", requireAuth, (req: Request, res: Response): void => {
  const { status } = req.query as Record<string, string>;
  let data = [...db.portingRequests];
  if (status) data = data.filter(p => p.status === status);
  res.json({ success: true, data, meta: { total: data.length } });
});

// POST /api/provisioning/porting
router.post("/porting", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const { msisdn, donorNetwork } = req.body;
  if (!msisdn || !donorNetwork) {
    res.status(400).json({ success: false, error: "msisdn and donorNetwork are required" });
    return;
  }
  const existing = db.portingRequests.find(p => p.msisdn === msisdn && p.status === "pending");
  if (existing) { res.status(409).json({ success: false, error: "Active porting request already exists for this number" }); return; }
  const req2: PortingRequest = {
    id: uuid(), msisdn, donorNetwork,
    recipientNetwork: "ZA-VINK",
    status: "pending",
    requestedAt: new Date().toISOString(),
    completedAt: null,
    rejectionReason: null,
  };
  db.portingRequests.push(req2);
  res.status(201).json({ success: true, data: req2 });
});

// PATCH /api/provisioning/porting/:id
router.patch("/porting/:id", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const port = db.portingRequests.find(p => p.id === req.params.id);
  if (!port) { res.status(404).json({ success: false, error: "Porting request not found" }); return; }
  const { status, rejectionReason } = req.body;
  if (status) port.status = status;
  if (rejectionReason) port.rejectionReason = rejectionReason;
  if (status === "completed") port.completedAt = new Date().toISOString();
  res.json({ success: true, data: port });
});

export default router;
