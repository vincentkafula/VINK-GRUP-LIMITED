import { Router, Request, Response } from "express";
import { bankDb } from "../data/bankingStore.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/bank/compliance/kyc?status
router.get("/kyc", requireAuth, (req: Request, res: Response): void => {
  const { status } = req.query as Record<string, string>;
  let data = bankDb.kyc.map(k => ({
    ...k, user: bankDb.users.find(u => u.id === k.userId),
  }));
  if (status) data = data.filter(k => k.status === status);
  data.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  res.json({ success: true, data, meta: { total: data.length, pending: data.filter(k => k.status === "pending" || k.status === "in_review").length } });
});

// PATCH /api/bank/compliance/kyc/:id/approve
router.patch("/kyc/:id/approve", requireAuth, (req: Request, res: Response): void => {
  const rec = bankDb.kyc.find(k => k.id === req.params.id);
  if (!rec) { res.status(404).json({ success: false, error: "KYC record not found" }); return; }
  rec.status = "approved";
  rec.reviewedAt = new Date().toISOString();
  rec.reviewedBy = req.user!.username;
  rec.faceMatchScore = rec.faceMatchScore ?? 94;
  rec.addressVerified = true;
  const user = bankDb.users.find(u => u.id === rec.userId);
  if (user) { user.kycStatus = "approved"; }
  res.json({ success: true, data: rec });
});

// PATCH /api/bank/compliance/kyc/:id/reject
router.patch("/kyc/:id/reject", requireAuth, (req: Request, res: Response): void => {
  const rec = bankDb.kyc.find(k => k.id === req.params.id);
  if (!rec) { res.status(404).json({ success: false, error: "KYC record not found" }); return; }
  rec.status = "rejected";
  rec.reviewedAt = new Date().toISOString();
  rec.reviewedBy = req.user!.username;
  rec.rejectionReason = req.body.reason ?? "Documents not accepted";
  const user = bankDb.users.find(u => u.id === rec.userId);
  if (user) user.kycStatus = "rejected";
  res.json({ success: true, data: rec });
});

// GET /api/bank/compliance/aml
router.get("/aml", requireAuth, (req: Request, res: Response): void => {
  const { result } = req.query as Record<string, string>;
  let data = bankDb.aml.map(a => ({ ...a, user: bankDb.users.find(u => u.id === a.userId) }));
  if (result) data = data.filter(a => a.result === result);
  res.json({ success: true, data, meta: { total: data.length, flagged: data.filter(a => a.result !== "clear").length } });
});

// GET /api/bank/compliance/fraud-alerts?resolved
router.get("/fraud-alerts", requireAuth, (req: Request, res: Response): void => {
  const { resolved, riskLevel } = req.query as Record<string, string>;
  let data = bankDb.fraudAlerts.map(f => ({ ...f, user: bankDb.users.find(u => u.id === f.userId) }));
  if (resolved === "false") data = data.filter(f => !f.resolved);
  if (resolved === "true")  data = data.filter(f => f.resolved);
  if (riskLevel) data = data.filter(f => f.riskLevel === riskLevel);
  data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data, meta: { total: data.length, active: data.filter(f => !f.resolved).length } });
});

// PATCH /api/bank/compliance/fraud-alerts/:id/resolve
router.patch("/fraud-alerts/:id/resolve", requireAuth, (req: Request, res: Response): void => {
  const alert = bankDb.fraudAlerts.find(f => f.id === req.params.id);
  if (!alert) { res.status(404).json({ success: false, error: "Alert not found" }); return; }
  alert.resolved = true;
  alert.resolvedAt = new Date().toISOString();
  res.json({ success: true, data: alert });
});

// GET /api/bank/compliance/summary
router.get("/summary", requireAuth, (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      kyc: { total: bankDb.kyc.length, approved: bankDb.kyc.filter(k=>k.status==="approved").length, pending: bankDb.kyc.filter(k=>k.status==="pending"||k.status==="in_review").length, rejected: bankDb.kyc.filter(k=>k.status==="rejected").length },
      aml: { total: bankDb.aml.length, clear: bankDb.aml.filter(a=>a.result==="clear").length, flagged: bankDb.aml.filter(a=>a.result!=="clear").length },
      fraud: { total: bankDb.fraudAlerts.length, active: bankDb.fraudAlerts.filter(f=>!f.resolved).length, critical: bankDb.fraudAlerts.filter(f=>f.riskLevel==="critical"&&!f.resolved).length },
    },
  });
});

export default router;
