import { Router, Request, Response } from "express";
import { bankDb } from "../data/bankingStore.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/bank/users?role&kycStatus&amlStatus
router.get("/", requireAuth, (req: Request, res: Response): void => {
  const { role, kycStatus, amlStatus, search } = req.query as Record<string, string>;
  let data = bankDb.users.map(u => ({
    ...u,
    accountCount: bankDb.accounts.filter(a => a.userId === u.id).length,
    cardCount: bankDb.cards.filter(c => c.userId === u.id).length,
    totalBalance: +bankDb.accounts.filter(a => a.userId === u.id).reduce((s,a)=>s+a.balance,0).toFixed(2),
  }));
  if (role)      data = data.filter(u => u.role === role);
  if (kycStatus) data = data.filter(u => u.kycStatus === kycStatus);
  if (amlStatus) data = data.filter(u => u.amlStatus === amlStatus);
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.phone.includes(q));
  }
  res.json({ success: true, data, meta: { total: data.length } });
});

// GET /api/bank/users/:id
router.get("/:id", requireAuth, (req: Request, res: Response): void => {
  const user = bankDb.users.find(u => u.id === req.params.id);
  if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }
  const accounts = bankDb.accounts.filter(a => a.userId === user.id);
  const cards    = bankDb.cards.filter(c => c.userId === user.id);
  const kyc      = bankDb.kyc.find(k => k.userId === user.id);
  const aml      = bankDb.aml.filter(a => a.userId === user.id);
  const portfolio = bankDb.portfolios.find(p => p.userId === user.id);
  res.json({ success: true, data: { user, accounts, cards, kyc, aml, portfolio } });
});

// GET /api/bank/users/stats/summary
router.get("/stats/summary", requireAuth, (_req: Request, res: Response): void => {
  const byRole = ["passenger","driver","investor","owner","admin","compliance","treasury"].map(r => ({
    role: r,
    count: bankDb.users.filter(u => u.role === r).length,
    kycApproved: bankDb.users.filter(u => u.role === r && u.kycStatus === "approved").length,
  }));
  res.json({ success: true, data: { total: bankDb.users.length, byRole, kycPending: bankDb.kyc.filter(k=>k.status==="pending"||k.status==="in_review").length } });
});

export default router;
