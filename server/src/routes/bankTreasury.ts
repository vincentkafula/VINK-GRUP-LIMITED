import { Router, Request, Response } from "express";
import { bankDb, getBankingKpi } from "../data/bankingStore.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { backfillLedgerFromInMemoryStore, reconcileBalances } from "../services/ledgerShadowWrite.js";

const LEDGER_ADMIN_ROLES = ["owner", "superadmin", "treasury"] as const;

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

// POST /api/bank/treasury/ledger/backfill
// One-time (idempotent, safe to re-run) seed of the ledger from the
// current in-memory banking store -- Stage 2 of
// plans/architecture/03-migration-plan.md. Gated to the roles who'd
// actually run this in a real rollout, not requireAuth alone, since
// this writes real rows and shouldn't be a button any staff member can
// press by accident.
router.post("/ledger/backfill", requireAuth, requireRole(...LEDGER_ADMIN_ROLES), async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await backfillLedgerFromInMemoryStore();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("[bankTreasury] Ledger backfill failed:", err);
    res.status(500).json({ success: false, error: "Backfill failed — check server logs" });
  }
});

// GET /api/bank/treasury/ledger/reconcile
// Compares the in-memory balance (still authoritative through Stage 3)
// against the ledger's own recomputed balance for every account that's
// been shadow-written to. A non-empty mismatches array means the
// shadow-write logic has a bug and cutover (Stage 3) must not proceed
// until it's fixed -- this is the safety net the migration plan calls
// for, made pressable rather than theoretical.
router.get("/ledger/reconcile", requireAuth, requireRole(...LEDGER_ADMIN_ROLES), async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await reconcileBalances();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("[bankTreasury] Reconciliation check failed:", err);
    res.status(500).json({ success: false, error: "Reconciliation check failed — check server logs" });
  }
});

export default router;
