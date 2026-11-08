import type { Request, Response, NextFunction } from "express";
import type { Db } from "../portal/common.js";

/**
 * KEEPS AN ASSOCIATION'S LOGIN TO ITS OWN ROUTES AND LEDGER (/api/routes).
 * These routes were built for platform staff and also let the "association" role in, but they took the association from the request (the body or the address) instead of from who was asking. So any association login could read another association's fine ledger and create or change routes for it, and a
 * named office-bearer login (which holds the same role) could use them without ever passing the association portal's role gate.
 *   A named office-bearer login never uses these: they are for the association's own login.
 *   The association's own login may create and list ITS routes, change and read the violations of ITS routes, and read ITS ledger. Anything about another association is refused, and a route that is not its own is "not found".
 *   Driver ledgers stay with platform staff.
 * Every other role (platform staff) passes through untouched.
 */
const UUID = /^[0-9a-f-]{36}$/i;
export function createRouteScope(db: Db | null) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const u = req.user; if (!u || u.role !== "association") { next(); return; }
      const deny = (status: number, error: string) => { res.status(status).json({ success: false, error }); };
      if (!db) { next(); return; }
      if ((await db.query(`SELECT 1 AS x FROM association_delegates WHERE user_id = $1`, [u.userId])).rows.length) { deny(403, "That is for the association's own login only"); return; }
      const parts = req.path.split("/").filter(Boolean), mine = u.userId;
      if (parts[0] === "drivers") { deny(403, "Driver ledgers are for platform staff"); return; }
      if (parts[0] === "associations") { if (parts[1] !== mine) { deny(403, "You can only see your own association's ledger"); return; } next(); return; }
      if (parts.length === 0 && req.method === "POST") { const b = (req.body ?? {}) as Record<string, unknown>; if (b.associationId !== undefined && b.associationId !== null && b.associationId !== "" && b.associationId !== mine) { deny(403, "You can only create routes for your own association"); return; } req.body = { ...b, associationId: mine }; next(); return; }
      if (parts.length === 0) { res.locals.associationScope = mine; next(); return; }
      if (!UUID.test(parts[0])) { deny(404, "Route not found"); return; }
      const r = (await db.query(`SELECT association_id FROM vehicle_routes WHERE id = $1`, [parts[0]])).rows[0]; if (!r || String(r.association_id) !== mine) { deny(404, "Route not found"); return; }
      next();
    } catch (e) { next(e); }
  };
}
