import { Router, Request, Response } from "express";
import { db } from "../data/store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/billing/cdrs  ?page&limit&type&msisdn
router.get("/cdrs", requireAuth, (req: Request, res: Response): void => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const { type, msisdn } = req.query as Record<string, string>;
  let data = [...db.cdrs];
  if (type) data = data.filter(c => c.type === type);
  if (msisdn) data = data.filter(c => c.msisdn === msisdn);
  const total = data.length;
  const items = data.slice((page - 1) * limit, page * limit);
  const revenue = +data.reduce((s, c) => s + c.chargeAmount, 0).toFixed(2);
  res.json({ success: true, data: items, meta: { page, limit, total, pages: Math.ceil(total / limit), totalRevenue: revenue } });
});

// GET /api/billing/invoices  ?status&msisdn
router.get("/invoices", requireAuth, (req: Request, res: Response): void => {
  const { status, msisdn } = req.query as Record<string, string>;
  let data = [...db.invoices];
  if (status) data = data.filter(i => i.status === status);
  if (msisdn) data = data.filter(i => i.msisdn === msisdn);
  res.json({ success: true, data, meta: { total: data.length } });
});

// GET /api/billing/invoices/:id
router.get("/invoices/:id", requireAuth, (req: Request, res: Response): void => {
  const inv = db.invoices.find(i => i.id === req.params.id);
  if (!inv) { res.status(404).json({ success: false, error: "Invoice not found" }); return; }
  res.json({ success: true, data: inv });
});

// PATCH /api/billing/invoices/:id/mark-paid
router.patch("/invoices/:id/mark-paid", requireAuth, requireRole("superadmin", "billing_admin"), (req: Request, res: Response): void => {
  const inv = db.invoices.find(i => i.id === req.params.id);
  if (!inv) { res.status(404).json({ success: false, error: "Invoice not found" }); return; }
  inv.status = "paid";
  inv.paidAt = new Date().toISOString();
  res.json({ success: true, data: inv });
});

// GET /api/billing/summary
router.get("/summary", requireAuth, (_req: Request, res: Response): void => {
  const totalRevenue = +db.cdrs.reduce((s, c) => s + c.chargeAmount, 0).toFixed(2);
  const paidInvoices = db.invoices.filter(i => i.status === "paid").length;
  const overdueInvoices = db.invoices.filter(i => i.status === "overdue").length;
  const pendingInvoices = db.invoices.filter(i => i.status === "pending").length;
  const arOutstanding = +db.invoices
    .filter(i => i.status !== "paid")
    .reduce((s, i) => s + i.totalAmount, 0).toFixed(2);
  const byType = ["voice", "data", "sms", "roaming", "international"].map(t => ({
    type: t,
    count: db.cdrs.filter(c => c.type === t).length,
    revenue: +db.cdrs.filter(c => c.type === t).reduce((s, c) => s + c.chargeAmount, 0).toFixed(2),
  }));
  res.json({ success: true, data: { totalRevenue, paidInvoices, overdueInvoices, pendingInvoices, arOutstanding, byType } });
});

export default router;
