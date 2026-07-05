import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { SupportTicket } from "../types/mvno.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/support/tickets  ?status&priority&category&page&limit
router.get("/tickets", requireAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const { status, priority, category, msisdn } = req.query as Record<string, string>;
  let data = [...db.tickets];
  if (status) data = data.filter(t => t.status === status);
  if (priority) data = data.filter(t => t.priority === priority);
  if (category) data = data.filter(t => t.category === category);
  if (msisdn) data = data.filter(t => t.msisdn === msisdn);
  data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = data.length;
  res.json({ success: true, data: data.slice((page - 1) * limit, page * limit), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/support/tickets/:id
router.get("/tickets/:id", requireAuth, (req: Request, res: Response): void => {
  const ticket = db.tickets.find(t => t.id === req.params.id);
  if (!ticket) { res.status(404).json({ success: false, error: "Ticket not found" }); return; }
  res.json({ success: true, data: ticket });
});

// POST /api/support/tickets
router.post("/tickets", requireAuth, (req: Request, res: Response): void => {
  const { msisdn, subscriberId, category, subject, description, priority } = req.body;
  if (!msisdn || !category || !subject || !description) {
    res.status(400).json({ success: false, error: "msisdn, category, subject and description are required" });
    return;
  }
  const ticket: SupportTicket = {
    id: uuid(),
    subscriberId: subscriberId ?? uuid(),
    msisdn, category, subject, description,
    status: "open",
    priority: priority ?? "medium",
    assignedAgent: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    csatScore: null,
  };
  db.tickets.push(ticket);
  res.status(201).json({ success: true, data: ticket });
});

// PATCH /api/support/tickets/:id
router.patch("/tickets/:id", requireAuth, (req: Request, res: Response): void => {
  const ticket = db.tickets.find(t => t.id === req.params.id);
  if (!ticket) { res.status(404).json({ success: false, error: "Ticket not found" }); return; }
  const allowed: (keyof SupportTicket)[] = ["status", "priority", "assignedAgent", "csatScore"];
  allowed.forEach(k => { if (req.body[k] !== undefined) (ticket as unknown as Record<string, unknown>)[k] = req.body[k]; });
  ticket.updatedAt = new Date().toISOString();
  if (req.body.status === "resolved" || req.body.status === "closed") {
    ticket.resolvedAt = new Date().toISOString();
  }
  res.json({ success: true, data: ticket });
});

// GET /api/support/stats
router.get("/stats", requireAuth, (_req: Request, res: Response): void => {
  const total = db.tickets.length;
  const open = db.tickets.filter(t => t.status === "open").length;
  const inProgress = db.tickets.filter(t => t.status === "in-progress").length;
  const resolved = db.tickets.filter(t => t.status === "resolved").length;
  const closed = db.tickets.filter(t => t.status === "closed").length;
  const urgent = db.tickets.filter(t => t.priority === "urgent" && t.status !== "closed").length;
  const scored = db.tickets.filter(t => t.csatScore !== null);
  const avgCsat = scored.length > 0
    ? +(scored.reduce((s, t) => s + (t.csatScore ?? 0), 0) / scored.length).toFixed(2)
    : 0;
  const byCategory = ["billing", "technical", "porting", "activation", "roaming", "fraud", "general"].map(c => ({
    category: c,
    count: db.tickets.filter(t => t.category === c).length,
    open: db.tickets.filter(t => t.category === c && t.status === "open").length,
  }));
  res.json({ success: true, data: { total, open, inProgress, resolved, closed, urgent, avgCsat, byCategory } });
});

// PATCH /api/support/tickets/:id/assign
router.patch("/tickets/:id/assign", requireAuth, requireRole("superadmin", "noc_engineer"), (req: Request, res: Response): void => {
  const ticket = db.tickets.find(t => t.id === req.params.id);
  if (!ticket) { res.status(404).json({ success: false, error: "Ticket not found" }); return; }
  ticket.assignedAgent = req.body.agent;
  ticket.status = "in-progress";
  ticket.updatedAt = new Date().toISOString();
  res.json({ success: true, data: ticket });
});

export default router;
