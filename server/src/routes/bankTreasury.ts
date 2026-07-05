import { Router, Request, Response } from "express";
import { bankDb, getBankingKpi } from "../data/bankingStore.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/bank/treasury/accounts
router.get("/accounts", requireAuth, (_req: Request, res: Response): void => {
  const total = bankDb.treasury.reduce((s,t) => s + t.balance, 0);
  const totalReserve = bankDb.treasury.reduce((s,t) => s + t.reserveBalance, 0);
  res.json({ success: true, data: bankDb.treasury, meta: { total, totalReserve } });
});

// GET /api/bank/treasury/settlements
router.get("/settlements", requireAuth, (req: Request, res: Response): void => {
  const { status, network } = req.query as Record<string, string>;
  let data = [...bankDb.settlements];
  if (status)  data = data.filter(s => s.status === status);
  if (network) data = data.filter(s => s.network === network);
  data.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json({ success: true, data, meta: { total: data.length, pending: data.filter(s=>s.status!=="settled").length } });
});

// GET /api/bank/treasury/revenue-splits
router.get("/revenue-splits", requireAuth, (_req: Request, res: Response): void => {
  const data = [...bankDb.revenueSplits].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalRevenue = data.reduce((s,r) => s + r.totalAmount, 0);
  const driverShare   = data.reduce((s,r) => s + (r.splits.find(x=>x.recipient==="driver")?.amount ?? 0), 0);
  const investorShare = data.reduce((s,r) => s + (r.splits.find(x=>x.recipient==="investor")?.amount ?? 0), 0);
  const ownerShare    = data.reduce((s,r) => s + (r.splits.find(x=>x.recipient==="owner")?.amount ?? 0), 0);
  res.json({ success: true, data, meta: { totalRevenue: +totalRevenue.toFixed(2), driverShare: +driverShare.toFixed(2), investorShare: +investorShare.toFixed(2), ownerShare: +ownerShare.toFixed(2) } });
});

// GET /api/bank/treasury/kpis
router.get("/kpis", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, data: getBankingKpi() });
});

// GET /api/bank/treasury/portfolios
router.get("/portfolios", requireAuth, (_req: Request, res: Response): void => {
  const data = bankDb.portfolios.map(p => {
    const user = bankDb.users.find(u => u.id === p.userId);
    return { ...p, userName: user ? `${user.firstName} ${user.lastName}` : "Unknown" };
  });
  res.json({ success: true, data });
});

export default router;
