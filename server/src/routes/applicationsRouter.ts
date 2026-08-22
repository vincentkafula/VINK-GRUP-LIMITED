import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";
import { checkApplicationRisk } from "../services/fraudRiskChecks.js";

const router: ReturnType<typeof Router> = Router();

const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;

const VALID_TIERS = ["personal", "business", "corporate"] as const;
type Tier = (typeof VALID_TIERS)[number];

// Several older application forms (credit card, business loan, corporate
// loan, SIM, vehicle tracking, generic services) predate the tier-based
// system below and send a product `type` instead of a `tier`. Rather than
// require every one of those frontend forms to know about `tier`, map the
// type to the correct tier here in one place. Unrecognised/future type
// values default to "personal" rather than being rejected outright, so a
// new application type added later doesn't silently break again.
const TYPE_TO_TIER: Record<string, Tier> = {
  creditCard: "personal",
  businessLoan: "business",
  corporateLoan: "corporate",
  "sim-application": "personal",
  "vehicle-tracking": "personal",
};

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

/**
 * Real South African bank account numbers are typically 9-11 digits,
 * bank-specific, with no standardised checksum (unlike IBAN) --
 * generates a plausible 10-digit numeric account number. Unlike
 * generateReferenceNumber() above (timestamp+random, probabilistically
 * unique -- fine for a reference number), this actually checks the
 * database for a genuine collision and retries, since an account
 * number is a more financially consequential identifier where a
 * collision would be a real integrity problem, not just an
 * inconvenience.
 */
async function generateUniqueAccountNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const { rows } = await pool!.query(`SELECT 1 FROM applications WHERE account_number = $1`, [candidate]);
    if (!rows.length) return candidate;
  }
  throw new Error("Could not generate a unique account number after 10 attempts");
}

const ACCOUNT_NUMBER_EXPIRY_DAYS = 14;

/**
 * Confirmed requirement: a rejected application's account number
 * disappears 14 days after rejection. Computed here on every read
 * (called from mapApplication() below) rather than relying solely on
 * a scheduled job actually running -- this environment has no verified
 * way to guarantee a cron job executes, so the honest, always-correct
 * guarantee is computing this live: if the 14 days have passed, the
 * account number reads as null regardless of whether the physical
 * database row has been swept yet. sweepExpiredAccountNumbers() below
 * is the real, physical cleanup -- genuinely clearing the column, not
 * just hiding it -- for actual data hygiene, callable by an admin or a
 * real scheduled job if one exists on the deployment platform, but the
 * computed-on-read check here is what actually guarantees correctness
 * regardless of whether that job ever runs.
 */
function isAccountNumberExpired(status: string, rejectedAt: string | Date | null): boolean {
  if (status !== "declined" || !rejectedAt) return false;
  const rejectedTime = new Date(rejectedAt).getTime();
  const expiryTime = rejectedTime + ACCOUNT_NUMBER_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() > expiryTime;
}

function mapApplication(r: any) {
  const expired = isAccountNumberExpired(r.status, r.rejected_at);
  const accountNumberStatus = r.status === "approved" ? "confirmed"
    : r.status === "declined" ? (expired ? "expired" : "expiring")
    : "provisional";
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
    // Honest even if a physical sweep hasn't run yet: null once the
    // computed 14-day expiry has passed, regardless of what's still
    // actually stored in the account_number column.
    accountNumber: expired ? null : r.account_number,
    accountNumberStatus,
    rejectedAt: r.rejected_at,
    tierData: r.tier_data,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
  };
}

router.post("/", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  if (!pool) {
    res.status(503).json({ success: false, error: "Database not configured" });
    return;
  }
  const { tier: rawTier, accountTypeRequested: rawAccountType, currency, applicantName, applicantEmail, applicantPhone, tierData, type, subType, formData } = req.body as {
    tier?: string; accountTypeRequested?: string; currency?: string;
    applicantName?: string; applicantEmail?: string; applicantPhone?: string; tierData?: object;
    // Legacy fields from the credit card, business loan, corporate loan,
    // SIM, vehicle tracking, and generic service application forms.
    type?: string; subType?: string; formData?: object;
  };

  // Prefer an explicit tier; fall back to deriving one from `type` for the
  // older forms that don't send `tier` directly.
  const tier = rawTier ?? (type ? TYPE_TO_TIER[type] ?? "personal" : undefined);
  // If the caller didn't set accountTypeRequested directly, use whichever of
  // subType/type is more specific, so the actual product applied for isn't
  // lost just because this endpoint's primary shape is tier-based.
  const accountTypeRequested = rawAccountType ?? subType ?? type;
  // Legacy callers send `formData` instead of `tierData` -- store whichever
  // was actually provided rather than silently dropping the real one.
  const storedData = tierData ?? formData ?? {};

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
  // Confirmed requirement: generated immediately on submission, not
  // held back until approval -- becomes the real, permanent account
  // number if this application is later approved, no regeneration.
  let accountNumber: string;
  try {
    accountNumber = await generateUniqueAccountNumber();
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    // Postgres error code 42703 = "column does not exist" -- if this is
    // the actual cause, it means the account_number column hasn't been
    // added to this database yet (schema.sql's own ALTER TABLE ADD
    // COLUMN IF NOT EXISTS runs automatically on every server boot via
    // migrateAndSeed(), so this points at a server that hasn't restarted
    // since that migration was added, not a bug in this endpoint's own
    // logic). Logged with the real Postgres error code/message so this
    // is actually diagnosable from server logs, rather than only ever
    // seeing the same generic message regardless of cause.
    console.error(`[applications] Failed to generate a unique account number (code: ${pgErr.code ?? "unknown"}):`, pgErr.message ?? err);
    res.status(500).json({ success: false, error: "Could not generate an account number, please try again." });
    return;
  }

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO applications (id, reference_number, account_number, tier, account_type_requested, currency, applicant_user_id, applicant_name, applicant_email, applicant_phone, tier_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, referenceNumber, accountNumber, tier, accountTypeRequested ?? null, currency ?? "ZAR", applicantUserId, applicantName.trim(), applicantEmail ?? null, applicantPhone ?? null, JSON.stringify(storedData)]
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

  // Deliberately after commit and outside the transaction above -- a risk
  // check is advisory (Section 5.1.4: flags only, never blocks), so a
  // failure here must never roll back or delay a legitimate submission.
  // Errors are logged, not surfaced to the applicant.
  checkApplicationRisk(id, applicantUserId, applicantPhone ?? null, applicantEmail ?? null)
    .catch(err => console.error("[fraud-risk] Application risk check failed:", err));

  res.status(201).json({ success: true, data: { id, referenceNumber, accountNumber, status: "submitted" } });
});

/**
 * GET /api/applications/mine
 * Real, customer-facing endpoint -- lets a logged-in customer see
 * their own application(s), specifically the real account number
 * generated for them. No role restriction (any authenticated user can
 * see their own applications), unlike every other GET endpoint in
 * this router, which is admin-only.
 *
 * Matches by applicant_email against req.user.username (the JWT's own
 * field, not a separate email claim -- confirmed this token shape has
 * no email field, but customer accounts always use their email as
 * their username, set that way by mktAuth.registerCustomer()) rather
 * than applicant_user_id. That column is genuinely null for these
 * applications in the real, common flow: PersonalAccountApplicationViewer
 * submits the application via optionalAuth before the login account
 * even exists (the whole point being to generate the account number
 * up front, then create the login afterward), so there was no
 * authenticated user yet to attach to applicant_user_id at submission
 * time. Email is the only reliable link between the two.
 */
router.get("/mine", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!pool) { res.json({ success: true, data: [] }); return; }
  const email = req.user!.username;
  const { rows } = await pool.query(
    `SELECT * FROM applications WHERE applicant_email = $1 OR applicant_user_id = $2 ORDER BY submitted_at DESC LIMIT 10`,
    [email, req.user!.userId]
  );
  res.json({ success: true, data: rows.map(mapApplication) });
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
      `UPDATE applications SET status = $1, status_reason = $2, updated_at = now(), rejected_at = CASE WHEN $1 = 'declined' THEN now() ELSE rejected_at END WHERE id = $3 RETURNING *`,
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

/**
 * POST /api/applications/sweep-expired-accounts
 * The real, physical cleanup: genuinely clears account_number (sets it
 * NULL) for declined applications where more than 14 days have passed
 * since rejected_at. This is a real database write, not just the
 * computed-on-read hiding mapApplication() already does on every GET
 * -- that computed check is what guarantees correctness even if this
 * sweep is never triggered, but running this periodically is still the
 * right thing for actual data hygiene (an account number sitting
 * unused in the database indefinitely is worth genuinely removing, not
 * just permanently masking).
 *
 * Admin-triggerable rather than assuming a scheduled job exists on the
 * deployment platform -- this environment has no verified way to
 * confirm a real cron actually runs, so exposing this as a callable
 * endpoint (which a real Railway cron job, or an admin, can hit) is
 * the honest choice over silently assuming background scheduling
 * works.
 */
router.post("/sweep-expired-accounts", requireAuth, requireRole(...REVIEWER_ROLES), async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(
    `UPDATE applications
     SET account_number = NULL
     WHERE status = 'declined'
       AND account_number IS NOT NULL
       AND rejected_at IS NOT NULL
       AND rejected_at < now() - interval '${ACCOUNT_NUMBER_EXPIRY_DAYS} days'
     RETURNING reference_number`
  );
  res.json({ success: true, data: { swept: rows.length, references: rows.map(r => r.reference_number) } });
});

export default router;
