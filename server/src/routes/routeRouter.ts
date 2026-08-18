import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin", "association"] as const;

interface WaypointInput { lat: number; lng: number }

function validWaypoints(value: unknown): value is WaypointInput[] {
  return Array.isArray(value) && value.length > 0 && value.every(
    w => typeof w === "object" && w !== null &&
      typeof (w as WaypointInput).lat === "number" && (w as WaypointInput).lat >= -90 && (w as WaypointInput).lat <= 90 &&
      typeof (w as WaypointInput).lng === "number" && (w as WaypointInput).lng >= -180 && (w as WaypointInput).lng <= 180
  );
}

/**
 * POST /api/routes
 * Admin/association-facing. Creates a route as an ordered list of
 * waypoints for a specific terminal (vehicle). tolerance_meters
 * defaults to 200 in the schema if not provided here.
 */
router.post("/", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { terminalId, associationId, name, toleranceMeters, waypoints } = req.body as {
    terminalId?: string; associationId?: string; name?: string; toleranceMeters?: number; waypoints?: unknown;
  };

  if (!terminalId || !name) {
    res.status(400).json({ success: false, error: "terminalId and name are required" });
    return;
  }
  if (!validWaypoints(waypoints)) {
    res.status(400).json({ success: false, error: "waypoints must be a non-empty array of { lat, lng } objects with valid coordinate ranges" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const routeResult = await client.query(
      `INSERT INTO vehicle_routes (terminal_id, association_id, name, tolerance_meters)
       VALUES ($1, $2, $3, COALESCE($4, 200)) RETURNING id, terminal_id, association_id, name, tolerance_meters, active, created_at`,
      [terminalId, associationId ?? null, name, toleranceMeters ?? null]
    );
    const route = routeResult.rows[0];

    for (let i = 0; i < waypoints.length; i++) {
      await client.query(
        `INSERT INTO route_waypoints (route_id, sequence, lat, lng) VALUES ($1, $2, $3, $4)`,
        [route.id, i, waypoints[i].lat, waypoints[i].lng]
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { ...route, waypoints } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[routes] Failed to create route:", err);
    res.status(500).json({ success: false, error: "Could not create route" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/routes
 * List routes, optionally filtered by terminalId. Includes waypoints
 * so the caller doesn't need a second request per route.
 */
router.get("/", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { terminalId } = req.query as { terminalId?: string };

  const routesResult = terminalId
    ? await pool.query(`SELECT * FROM vehicle_routes WHERE terminal_id = $1 ORDER BY created_at DESC`, [terminalId])
    : await pool.query(`SELECT * FROM vehicle_routes ORDER BY created_at DESC`);

  const routes = routesResult.rows;
  if (!routes.length) { res.json({ success: true, data: [] }); return; }

  const waypointsResult = await pool.query(
    `SELECT route_id, sequence, lat, lng FROM route_waypoints WHERE route_id = ANY($1::uuid[]) ORDER BY route_id, sequence ASC`,
    [routes.map((r: { id: string }) => r.id)]
  );
  const waypointsByRoute = new Map<string, { lat: number; lng: number }[]>();
  for (const w of waypointsResult.rows) {
    if (!waypointsByRoute.has(w.route_id)) waypointsByRoute.set(w.route_id, []);
    waypointsByRoute.get(w.route_id)!.push({ lat: Number(w.lat), lng: Number(w.lng) });
  }

  res.json({ success: true, data: routes.map((r: { id: string }) => ({ ...r, waypoints: waypointsByRoute.get(r.id) ?? [] })) });
});

/**
 * PATCH /api/routes/:id
 * Activate/deactivate a route, or adjust its tolerance. Deliberately
 * does not allow editing waypoints in place -- create a new route
 * instead, so a route's path is immutable once created and historical
 * violations always refer to the exact path that was active at the
 * time, not a since-edited one.
 */
router.patch("/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { active, toleranceMeters } = req.body as { active?: boolean; toleranceMeters?: number };
  const { rows } = await pool.query(
    `UPDATE vehicle_routes SET active = COALESCE($1, active), tolerance_meters = COALESCE($2, tolerance_meters) WHERE id = $3
     RETURNING id, terminal_id, association_id, name, tolerance_meters, active, created_at`,
    [active ?? null, toleranceMeters ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Route not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

/**
 * GET /api/routes/:id/violations
 * Every violation recorded against a specific route.
 */
router.get("/:id/violations", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool.query(
    `SELECT v.*, p.lat, p.lng FROM route_violations v JOIN vehicle_positions p ON p.id = v.position_id
     WHERE v.route_id = $1 ORDER BY v.created_at DESC`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /api/routes/drivers/:driverId/ledger
 * A driver's fine ledger -- their current balance (most recent row's
 * balance_after, or 0 if they have no entries) plus full history.
 * Deliberately scoped under /routes since this ledger exists solely
 * for route violation fines, not general driver accounting (see
 * driver_ledger's own schema comment).
 */
router.get("/drivers/:driverId/ledger", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: { balance: 0, entries: [] } }); return; }
  const { rows } = await pool.query(
    `SELECT * FROM driver_ledger WHERE driver_id = $1 ORDER BY created_at DESC`,
    [req.params.driverId]
  );
  const balance = rows.length ? Number(rows[0].balance_after) : 0;
  res.json({ success: true, data: { balance, entries: rows } });
});

/**
 * GET /api/routes/associations/:associationId/ledger
 * The other side of a fine transfer -- an association's credited fine
 * balance from route violations on its own routes.
 */
router.get("/associations/:associationId/ledger", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: { balance: 0, entries: [] } }); return; }
  const { rows } = await pool.query(
    `SELECT * FROM association_ledger WHERE association_id = $1 ORDER BY created_at DESC`,
    [req.params.associationId]
  );
  const balance = rows.length ? Number(rows[0].balance_after) : 0;
  res.json({ success: true, data: { balance, entries: rows } });
});

export default router;
