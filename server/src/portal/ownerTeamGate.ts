import type { Request, Response, NextFunction } from "express";
import type { Db } from "./common.js";
import { createOwnerTeam, teamAllowed } from "../services/ownerTeam.js";

/**
 * The gate every owner request passes through, FIRST, before the bank, money, token and owner routers.
 *   - The owner's own login passes untouched.
 *   - A member of an owner's team is checked: their login must be switched on, and the path must be one their role allows (fail closed: anything not mapped to a module belongs to the owner's own login, which keeps the bank, VINK tokens, payments and the team itself out of reach).
 *   - Then the request is made as the owner they act for (so every route keeps working unchanged), while the real person is kept on the request, so what they change is recorded in their own name.
 */
export function ownerTeamGate(db: Db) {
  const team = createOwnerTeam(db);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) { next(); return; }
      const m = await team.resolve(req.user.userId); if (!m) { next(); return; }
      if (m.disabled) { res.status(403).json({ success: false, error: "This login has been switched off by the owner" }); return; }
      const d = teamAllowed(m.role, req.method, req.path); if (!d.ok) { res.status(403).json({ success: false, error: d.error }); return; }
      req.actorId = m.userId; req.actorName = m.username; req.ownerRole = m.role; req.delegateName = m.name; req.user = { ...req.user, userId: m.ownerId }; next();
    } catch (e) { next(e); }
  };
}
