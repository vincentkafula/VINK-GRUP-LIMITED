import type { Request, Response, NextFunction } from "express";
import type { Db } from "./common.js";
import { createDelegates, allowed } from "../services/delegates.js";

/**
 * The gate every association request passes through, FIRST, before the bank, money, token and association routers.
 *   - The association's own login passes untouched.
 *   - A delegate (a named office bearer with their own login) is checked: their login must be switched on, and the path must be one their role allows (fail closed: anything not mapped to a module belongs to the main login alone, which keeps the bank, money, tokens, payroll and delegate management out of reach).
 *   - Then the request is made as the association it acts for (so every route keeps working unchanged), while the real person is kept on the request, so what they change is recorded in their own name.
 */
export function delegateGate(db: Db) {
  const delegates = createDelegates(db);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) { next(); return; }
      const d = await delegates.resolve(req.user.userId); if (!d) { next(); return; }
      if (d.disabled) { res.status(403).json({ success: false, error: "This login has been switched off by the association" }); return; }
      const decision = allowed(d.role, req.method, req.path); if (!decision.ok) { res.status(403).json({ success: false, error: decision.error }); return; }
      req.actorId = d.userId; req.actorName = d.username; req.delegateRole = d.role; req.delegateBearerId = d.officeBearerId; req.delegateName = d.name;
      req.user = { ...req.user, userId: d.associationId }; next();
    } catch (e) { next(e); }
  };
}
