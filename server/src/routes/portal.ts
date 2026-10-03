import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ACCOUNT_ROLES, DASHBOARD_PATH, isAccountRole, type AccountRole } from "../auth/roles.js";

/**
 * Role portals. Every account type has its own prefix and ONLY that role may call it, checked on the server from the signed
 * token (hiding a link in the UI is never the protection). The data endpoints for each dashboard are added under these prefixes
 * as each dashboard is built.
 *
 *   GET /api/portal/me            any of the five account types: who am I, and where is my dashboard
 *   GET /api/portal/personal      personal accounts only
 *   GET /api/portal/driver        drivers only
 *   GET /api/portal/marshal       marshals only
 *   GET /api/portal/owner         vehicle owners only
 *   GET /api/portal/association   associations only
 */
const PREFIX: Record<AccountRole, string> = {
  personal: "personal", driver: "driver", marshal: "marshal", vehicle_owner: "owner", association: "association",
};

export function createPortalRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/me", (req: Request, res: Response) => {
    const role = req.user?.role;
    if (!isAccountRole(role)) { res.status(403).json({ success: false, error: "This account has no portal" }); return; }
    res.json({ success: true, user: { id: req.user!.userId, username: req.user!.username, role }, dashboard: DASHBOARD_PATH[role] });
  });

  for (const role of ACCOUNT_ROLES) {
    router.get(`/${PREFIX[role]}`, requireRole(role as never), (req: Request, res: Response) => {
      res.json({ success: true, role, user: { id: req.user!.userId, username: req.user!.username } });
    });
  }
  return router;
}
