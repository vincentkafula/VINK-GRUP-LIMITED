import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

// Both 'owner' (the platform's designated top-authority role) and
// 'superadmin' (the original full-access role, retained on the 'admin'
// account from before this system existed) get Super Admin access here —
// kept in sync with the same reasoning in ManagementPanelViewer.tsx's
// isOwner check on the frontend. If that check ever changes, this needs
// to change with it or the UI and API will disagree about who has access.
const SUPER_ADMIN_ROLES = ["owner", "superadmin"] as const;

const router: ReturnType<typeof Router> = Router();

export const SECTIONS = [
  "Bank Management", "Payment Management", "Marketplace Management", "News Management",
  "Mobile Network Management", "Vehicle Management", "Radio & TV Station Management",
  "Event Management", "Company Registration Management", "Insurance Management",
  "Social Responsibility Management",
] as const;

function noDb(res: Response): boolean {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return true; }
  return false;
}

async function logAudit(actorId: string, actorName: string, action: string, target: string | null, details: object) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO audit_log (id, actor_id, actor_name, action, target, details) VALUES ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), actorId, actorName, action, target, JSON.stringify(details)]
  );
}

// GET /api/rbac/sections — the fixed list of manageable sections
router.get("/sections", (_req: Request, res: Response): void => {
  res.json({ success: true, data: SECTIONS });
});

// POST /api/rbac/apply — any authenticated user applies to manage a section
router.post("/apply", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { section, message } = req.body as { section?: string; message?: string };
  if (!section || !(SECTIONS as readonly string[]).includes(section)) {
    res.status(400).json({ success: false, error: "A valid section is required" });
    return;
  }
  const { rows: existing } = await pool!.query(
    `SELECT id FROM section_applications WHERE user_id = $1 AND section = $2 AND status = 'pending'`,
    [req.user!.userId, section]
  );
  if (existing.length) {
    res.status(409).json({ success: false, error: "You already have a pending application for this section" });
    return;
  }
  const { rows: already } = await pool!.query(
    `SELECT 1 FROM section_permissions WHERE user_id = $1 AND section = $2`,
    [req.user!.userId, section]
  );
  if (already.length) {
    res.status(409).json({ success: false, error: "You already manage this section" });
    return;
  }
  const id = randomUUID();
  await pool!.query(
    `INSERT INTO section_applications (id, user_id, section, message) VALUES ($1,$2,$3,$4)`,
    [id, req.user!.userId, section, message ?? null]
  );
  res.json({ success: true, data: { id, section, status: "pending" } });
});

// GET /api/rbac/my-applications — the current user's own applications
router.get("/my-applications", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { rows } = await pool!.query(
    `SELECT id, section, message, status, rejection_reason, created_at, reviewed_at FROM section_applications WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user!.userId]
  );
  res.json({ success: true, data: rows });
});

// GET /api/rbac/my-sections — the sections the current user is approved to manage
router.get("/my-sections", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { rows } = await pool!.query(`SELECT section FROM section_permissions WHERE user_id = $1`, [req.user!.userId]);
  res.json({ success: true, data: rows.map(r => r.section) });
});

// ─── Super Admin (role: owner) only, from here down ─────────────────────────

// GET /api/rbac/applications?status=pending
router.get("/applications", requireAuth, requireRole(...SUPER_ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const status = (req.query.status as string) || undefined;
  const { rows } = await pool!.query(
    `SELECT a.id, a.section, a.message, a.status, a.rejection_reason, a.created_at, a.reviewed_at,
            u.id AS user_id, u.username, u.name, u.email
     FROM section_applications a JOIN users u ON u.id = a.user_id
     ${status ? "WHERE a.status = $1" : ""}
     ORDER BY a.created_at DESC`,
    status ? [status] : []
  );
  res.json({ success: true, data: rows });
});

// PATCH /api/rbac/applications/:id/approve
router.patch("/applications/:id/approve", requireAuth, requireRole(...SUPER_ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { rows } = await pool!.query(`SELECT * FROM section_applications WHERE id = $1`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Application not found" }); return; }
  const app = rows[0];
  if (app.status !== "pending") { res.status(409).json({ success: false, error: "Application already reviewed" }); return; }

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE section_applications SET status='approved', reviewed_by=$1, reviewed_at=now() WHERE id=$2`,
      [req.user!.userId, app.id]
    );
    await client.query(
      `INSERT INTO section_permissions (user_id, section, granted_by) VALUES ($1,$2,$3) ON CONFLICT (user_id, section) DO NOTHING`,
      [app.user_id, app.section, req.user!.userId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ success: false, error: "Failed to approve application" });
    return;
  } finally {
    client.release();
  }

  await logAudit(req.user!.userId, req.user!.username, "application.approved", app.section, { applicationId: app.id, grantedTo: app.user_id });
  res.json({ success: true, data: { id: app.id, status: "approved" } });
});

// PATCH /api/rbac/applications/:id/reject
router.patch("/applications/:id/reject", requireAuth, requireRole(...SUPER_ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { reason } = req.body as { reason?: string };
  const { rows } = await pool!.query(`SELECT * FROM section_applications WHERE id = $1`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Application not found" }); return; }
  const app = rows[0];
  if (app.status !== "pending") { res.status(409).json({ success: false, error: "Application already reviewed" }); return; }

  await pool!.query(
    `UPDATE section_applications SET status='rejected', rejection_reason=$1, reviewed_by=$2, reviewed_at=now() WHERE id=$3`,
    [reason ?? null, req.user!.userId, app.id]
  );
  await logAudit(req.user!.userId, req.user!.username, "application.rejected", app.section, { applicationId: app.id, reason });
  res.json({ success: true, data: { id: app.id, status: "rejected" } });
});

// GET /api/rbac/managers — every user who holds at least one section permission
router.get("/managers", requireAuth, requireRole(...SUPER_ADMIN_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { rows } = await pool!.query(
    `SELECT u.id, u.username, u.name, u.email,
            COALESCE(json_agg(json_build_object('section', p.section, 'grantedAt', p.granted_at)) FILTER (WHERE p.section IS NOT NULL), '[]') AS sections
     FROM users u JOIN section_permissions p ON p.user_id = u.id
     GROUP BY u.id ORDER BY u.name`
  );
  res.json({ success: true, data: rows });
});

// POST /api/rbac/permissions — directly grant a section (bypassing the application flow)
router.post("/permissions", requireAuth, requireRole(...SUPER_ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { userId, section } = req.body as { userId?: string; section?: string };
  if (!userId || !section || !(SECTIONS as readonly string[]).includes(section)) {
    res.status(400).json({ success: false, error: "userId and a valid section are required" });
    return;
  }
  await pool!.query(
    `INSERT INTO section_permissions (user_id, section, granted_by) VALUES ($1,$2,$3) ON CONFLICT (user_id, section) DO NOTHING`,
    [userId, section, req.user!.userId]
  );
  await logAudit(req.user!.userId, req.user!.username, "permission.granted", section, { userId });
  res.json({ success: true });
});

// DELETE /api/rbac/permissions/:userId/:section — revoke
router.delete("/permissions/:userId/:section", requireAuth, requireRole(...SUPER_ADMIN_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { userId, section } = req.params;
  await pool!.query(`DELETE FROM section_permissions WHERE user_id = $1 AND section = $2`, [userId, decodeURIComponent(section)]);
  await logAudit(req.user!.userId, req.user!.username, "permission.revoked", decodeURIComponent(section), { userId });
  res.json({ success: true });
});

// GET /api/rbac/audit
router.get("/audit", requireAuth, requireRole(...SUPER_ADMIN_ROLES), async (_req: Request, res: Response): Promise<void> => {
  if (noDb(res)) return;
  const { rows } = await pool!.query(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`);
  res.json({ success: true, data: rows });
});

export default router;
