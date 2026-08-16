import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// Same reviewer roles as applicationsRouter.ts -- fraud flags are reviewed
// by the same people who review applications, not a separate role.
const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;

/**
 * GET /api/fraud-risk/flags ?status&type&severity
 * List flags for reviewers, filterable. Deliberately not public and not
 * accessible to the account that triggered a flag -- a person under
 * review should not see their own fraud flag before a reviewer has acted
 * on it.
 */
router.get("/flags", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [], meta: { total: 0, open: 0 } }); return; }
  const { status, type, severity } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`type = $${params.length}`); }
  if (severity) { params.push(severity); conditions.push(`severity = $${params.length}`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(`SELECT * FROM fraud_flags ${whereClause} ORDER BY detected_at DESC LIMIT 200`, params);
  const { rows: countRows } = await pool.query(`SELECT status, COUNT(*)::int AS n FROM fraud_flags GROUP BY status`);
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id, type: r.type, severity: r.severity, subjectType: r.subject_type, subjectId: r.subject_id,
      relatedIds: r.related_ids, description: r.description, status: r.status, resolutionNote: r.resolution_note,
      resolvedBy: r.resolved_by, resolvedAt: r.resolved_at, detectedAt: r.detected_at,
    })),
    meta: { total: rows.length, open: countRows.find((r) => r.status === "open")?.n ?? 0 },
  });
});

/**
 * PATCH /api/fraud-risk/flags/:id
 * Resolve a flag as confirmed (genuinely fraudulent/risky, acted on
 * separately by the reviewer through whatever tooling handles the actual
 * account/order action) or dismissed (a false positive -- the shared
 * family device case, for instance). A resolution note is required
 * either way, same discipline as application_status_history: an
 * unexplained status change is exactly what this table exists to
 * prevent.
 */
router.patch("/flags/:id", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { status, note } = req.body as { status?: string; note?: string };
  if (status !== "confirmed" && status !== "dismissed") {
    res.status(400).json({ success: false, error: "status must be 'confirmed' or 'dismissed'" });
    return;
  }
  if (!note || !note.trim()) {
    res.status(400).json({ success: false, error: "A resolution note is required" });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE fraud_flags SET status = $1, resolution_note = $2, resolved_by = $3, resolved_at = now()
     WHERE id = $4 AND status = 'open' RETURNING *`,
    [status, note.trim(), req.user!.username ?? req.user!.userId, req.params.id]
  );
  if (!rows.length) {
    res.status(404).json({ success: false, error: "Flag not found or already resolved" });
    return;
  }
  res.json({ success: true, data: rows[0] });
});

export default router;
