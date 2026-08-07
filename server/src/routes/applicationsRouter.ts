import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;

const VALID_TIERS = ["personal", "business", "corporate"] as const;
type Tier = (typeof VALID_TIERS)[number];

const VALID_STATUSES = ["submitted", "under_review", "approved", "declined", "more_info_requested"] as const;
type Status = (typeof VALID_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  submitted: ["under_review", "declined"],
  under_review: ["approved", "declined", "more_info_requested"],
  more_info_requested: ["under_review", "declined"],
  approved: [],
  declined: [],
};

function generateReferenceNumber(tier: Tier): string {
  const prefix = tier === "personal" ? "PA" : tier === "business" ? "BA" : "CA";
  return `VNK-${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

function mapApplication(r: any) {
  return {
    id: r.id,
    referenceNumber: r.reference_number,
    tier: r.tier,
    accountTypeRequested: r.account_type_requested,
    currency: r.currency,
    applicantUserId: r.applicant_user_id,
    applicantName: r.applicant_name,
    applicantEmail: r.applicant_email,
    applicantPhone: r.applicant_phone,
    status: r.status,
    statusReason: r.status_reason,
    tierData: r.tier_data,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
  };
}

router.post("/", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const { tier, accountTypeRequested, currency, applicantName, applicantEmail, applicantPhone, tierData } = req.body as {
    tier?: string; accountTypeRequested?: string; currency?: string;
    applicantName?: string; applicantEmail?: string; applicantPhone?: string; tierData?: object;
  };

  if (!tier || !VALID_TIERS.includes(tier as Tier)) {
    res.status(400).json({ success: false, error: `tier must be one of: ${VALID_TIERS.join(", ")}` });
    return;
  }
  if (!applicantName?.trim()) {
    res.status(400).json({ success: false, error: "applicantName is required" });
    return;
  }

  const id = randomUUID();
  const referenceNumber = generateReferenceNumber(tier as Tier);
  const applicantUserId = req.user?.userId ?? null;

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO applications (id, reference_number, tier, account_type_requested, currency, applicant_user_id, applicant_name, applicant_email, applicant_phone, tier_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, referenceNumber, tier, accountTypeRequested ?? null, currency ?? "ZAR", applicantUserId, applicantName.trim(), applicantEmail ?? null, applicantPhone ?? null, JSON.stringify(tierData ?? {})]
    );
    await client.query(
      `INSERT INTO application_status_history (id, application_id, from_status, to_status, reason, changed_by)
       VALUES ($1,$2,NULL,'submitted','Application submitted',NULL)`,
      [randomUUID(), id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[applications] Submission failed:", err);
    res.status(500).json({ success: false, error: "Could not submit application, please try again." });
    return;
  } finally {
    client.release();
  }

  res.status(201).json({ success: true, data: { id, referenceNumber, status: "submitted" } });
});

router.get("/", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { status, tier } = req.query as { status?: string; tier?: string };
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (tier) { params.push(tier); conditions.push(`tier = $${params.length}`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await pool!.query(`SELECT COUNT(*)::int AS n FROM applications ${whereClause}`, params);
  params.push(limit, offset);
  const { rows } = await pool!.query(
    `SELECT * FROM applications ${whereClause} ORDER BY submitted_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const total = countRows[0].n;
  res.json({
    success: true,
    data: rows.map(mapApplication),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

// GET /api/applications/stats/summary -- real counts by tier and status,
// computed from the actual applications table, not a separate tracked
// counter that could drift from reality.
router.get("/stats/summary", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  const [{ rows: byTier }, { rows: byStatus }, { rows: totalRows }] = await Promise.all([
    pool!.query(`SELECT tier, COUNT(*)::int AS n FROM applications GROUP BY tier`),
    pool!.query(`SELECT status, COUNT(*)::int AS n FROM applications GROUP BY status`),
    pool!.query(`SELECT COUNT(*)::int AS n FROM applications`),
  ]);

  res.json({
    success: true,
    data: {
      totalApplications: totalRows[0].n,
      byTier: Object.fromEntries(byTier.map(r => [r.tier, r.n])),
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.n])),
      pendingReview: byStatus.find(r => r.status === "submitted")?.n ?? 0,
      lastUpdated: new Date().toISOString(),
    },
  });
});

router.get("/:ref", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM applications WHERE reference_number = $1`, [req.params.ref]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Application not found" }); return; }

  const { rows: history } = await pool!.query(
    `SELECT h.from_status, h.to_status, h.reason, h.changed_by, h.created_at, u.name AS changed_by_name
     FROM application_status_history h
     LEFT JOIN users u ON u.id::text = h.changed_by
     WHERE h.application_id = $1 ORDER BY h.created_at ASC`,
    [rows[0].id]
  );

  res.json({
    success: true,
    data: {
      ...mapApplication(rows[0]),
      statusHistory: history.map((h: any) => ({
        fromStatus: h.from_status,
        toStatus: h.to_status,
        reason: h.reason,
        changedBy: h.changed_by,
        changedByName: h.changed_by_name,
        createdAt: h.created_at,
      })),
    },
  });
});

router.patch("/:ref/status", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { status: newStatus, reason } = req.body as { status?: string; reason?: string };

  if (!newStatus || !VALID_STATUSES.includes(newStatus as Status)) {
    res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  if (!reason?.trim()) {
    res.status(400).json({ success: false, error: "reason is required for every status change" });
    return;
  }

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM applications WHERE reference_number = $1 FOR UPDATE`, [req.params.ref]);
    if (!rows.length) { await client.query("ROLLBACK"); res.status(404).json({ success: false, error: "Application not found" }); return; }

    const current = rows[0];
    const currentStatus = current.status as Status;
    const target = newStatus as Status;

    if (!ALLOWED_TRANSITIONS[currentStatus].includes(target)) {
      await client.query("ROLLBACK");
      res.status(409).json({
        success: false,
        error: `Cannot move from "${currentStatus}" to "${target}". Valid next steps from here: ${ALLOWED_TRANSITIONS[currentStatus].join(", ") || "none -- this application is in a terminal state"}.`,
      });
      return;
    }

    const { rows: updated } = await client.query(
      `UPDATE applications SET status = $1, status_reason = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [target, reason.trim(), current.id]
    );
    await client.query(
      `INSERT INTO application_status_history (id, application_id, from_status, to_status, reason, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), current.id, currentStatus, target, reason.trim(), req.user!.userId]
    );
    await client.query("COMMIT");
    res.json({ success: true, data: mapApplication(updated[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[applications] Status change failed:", err);
    res.status(500).json({ success: false, error: "Could not update application status, please try again." });
  } finally {
    client.release();
  }
});

// GET /api/applications/stats/summary — real counts by tier and status,
// computed from the actual applications table, not a separate tracked
// counter that could drift from reality.
router.get("/stats/summary", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  const [{ rows: byTier }, { rows: byStatus }, { rows: totalRows }] = await Promise.all([
    pool!.query(`SELECT tier, COUNT(*)::int AS n FROM applications GROUP BY tier`),
    pool!.query(`SELECT status, COUNT(*)::int AS n FROM applications GROUP BY status`),
    pool!.query(`SELECT COUNT(*)::int AS n FROM applications`),
  ]);

  res.json({
    success: true,
    data: {
      totalApplications: totalRows[0].n,
      byTier: Object.fromEntries(byTier.map(r => [r.tier, r.n])),
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.n])),
      pendingReview: byStatus.find(r => r.status === "submitted")?.n ?? 0,
      lastUpdated: new Date().toISOString(),
    },
  });
});

export default router;
