import { Router, type Request, type Response, type RequestHandler } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { DASHBOARD_PATH, isAccountRole, type AccountRole } from "../auth/roles.js";
import { createDriverRouter, type Db } from "../portal/driverRoutes.js";
import { createOwnerRouter } from "../portal/ownerRoutes.js";
import { createMarshalRouter } from "../portal/marshalRoutes.js";
import { createAssociationRouter } from "../portal/associationRoutes.js";
import { createInvestorRouter } from "../portal/investorRoutes.js";
import { createPersonalRouter } from "../portal/personalRoutes.js";
import { createLinkRouter } from "../portal/linkRoutes.js";
import { createBankRouter, type Deps as BankDeps } from "../portal/bankLinks.js";
import type { BankRole } from "../portal/bankRules.js";
import { createMoneyRouter, type MoneyRole } from "../portal/moneyRoutes.js";

/**
 * Role portals. Every account type has its own prefix and ONLY that role may call it, checked on the server from the signed
 * token (hiding a link in the UI is never the protection).
 *
 *   GET /api/portal/me            any account type: who am I, and where is my dashboard
 *   /api/portal/personal          personal (passenger) accounts only
 *   /api/portal/driver            drivers only
 *   /api/portal/marshal           marshals only
 *   /api/portal/owner             vehicle owners only
 *   /api/portal/association       associations only
 *   /api/portal/investor          investors only
 */
const PREFIX: Record<AccountRole, string> = {
  personal: "personal", driver: "driver", marshal: "marshal", vehicle_owner: "owner", association: "association", investor: "investor",
};

/** Without a database (local development with no DATABASE_URL) the data endpoints cannot work. */
const unavailable: RequestHandler = (_req, res) => { res.status(503).json({ success: false, error: "The database is not configured" }); };

/** `bank` is the Banking-module connection; without it the /bank endpoints answer 503 (the rest of each dashboard still works). */
export function createPortalRouter(db: Db | null = pool, bank: Omit<BankDeps, "db"> | null = null): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/me", (req: Request, res: Response) => {
    const role = req.user?.role;
    if (!isAccountRole(role)) { res.status(403).json({ success: false, error: "This account has no portal" }); return; }
    res.json({ success: true, user: { id: req.user!.userId, username: req.user!.username, role }, dashboard: DASHBOARD_PATH[role] });
  });

  // Each portal: the role guard first, then its data endpoints (or 503 when there is no database).
  const mount = (role: AccountRole, make: (d: Db) => Router, links?: (d: Db) => Router) => {
    const sub = Router();
    if (!db) sub.use(unavailable);
    else {
      if (links) sub.use(links(db));
      if (role !== "personal") sub.use("/bank", bank ? createBankRouter({ ...bank, db }, role as BankRole) : unavailable);   // the five business roles; passengers use the Manshya dashboard directly
      if (role === "driver" || role === "vehicle_owner" || role === "marshal" || role === "association") sub.use("/money", createMoneyRouter(db, role as MoneyRole));
      sub.use(make(db));
    }
    router.use(`/${PREFIX[role]}`, requireRole(role as never), sub);
  };
  mount("driver", createDriverRouter, (d) => createLinkRouter(d, "driver"));
  mount("vehicle_owner", createOwnerRouter, (d) => createLinkRouter(d, "vehicle_owner"));
  mount("marshal", createMarshalRouter, (d) => createLinkRouter(d, "marshal"));
  mount("association", createAssociationRouter);
  mount("investor", createInvestorRouter);
  mount("personal", createPersonalRouter);

  return router;
}
