import { Router, Request, Response } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();
const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer", "billing_admin"] as const;

const VALID_STATUSES = ["submitted", "under_review", "interview", "offered", "rejected", "withdrawn"] as const;
type Status = (typeof VALID_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  submitted: ["under_review", "rejected", "withdrawn"],
  under_review: ["interview", "rejected", "withdrawn"],
  interview: ["offered", "rejected", "withdrawn"],
  offered: ["rejected", "withdrawn"],
  // Rejected isn't fully terminal — a reviewer can undo a mistaken
  // rejection. Either send it back through proper review (under_review),
  // or approve it directly if the mistake is obvious and immediate.
  // Both paths are fully audited: the status history requires a reason
  // for every transition, so reversing a rejection is a visible,
  // accountable correction, not a silent bypass of the original decision.
  rejected: ["under_review", "offered"],
  withdrawn: [],
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } });

const DOCUMENT_FIELDS = ["cv", "id", "certs", "residence", "other"] as const;

function generateReferenceNumber(deptCode: string): string {
  const y = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `APP-${y}-${deptCode}-${rand}`;
}

function mapApplication(r: any) {
  return {
    id: r.id,
    referenceNumber: r.reference_number,
    department: r.department,
    position: r.position,
    applicantName: r.applicant_name,
    applicantEmail: r.applicant_email,
    applicantPhone: r.applicant_phone,
    details: r.details,
    documents: Array.isArray(r.documents) ? r.documents.map((d: any) => ({ type: d.type, filename: d.filename, mimeType: d.mimeType })) : [], // never include base64 content in list/detail responses
    status: r.status,
    statusReason: r.status_reason,
    roleGranted: Boolean(r.role_granted_at),
    roleGrantedAt: r.role_granted_at,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
  };
}

// POST /api/jobs/apply — real submission. Document bytes are held in
// memory only until the single INSERT below (this DB row is the actual
// intended destination, unlike the KYC flow which deliberately never
// persists documents at all).
router.post(
  "/apply",
  optionalAuth,
  (req: Request, res: Response, next) => {
    upload.fields(DOCUMENT_FIELDS.map(name => ({ name, maxCount: 1 })))(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_UNEXPECTED_FILE"
          ? `Unexpected field "${err.field}" — only these document fields are accepted: ${DOCUMENT_FIELDS.join(", ")}`
          : err.code === "LIMIT_FILE_SIZE" ? "One of the files exceeds the 10MB limit"
          : err.message;
        res.status(400).json({ success: false, error: message });
        return;
      }
      if (err) { next(err); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { department, position, deptCode, applicantName, applicantEmail, applicantPhone, details } = req.body as {
      department?: string; position?: string; deptCode?: string;
      applicantName?: string; applicantEmail?: string; applicantPhone?: string; details?: string;
    };

    if (!department?.trim()) { res.status(400).json({ success: false, error: "department is required" }); return; }
    if (!position?.trim()) { res.status(400).json({ success: false, error: "position is required" }); return; }
    if (!applicantName?.trim()) { res.status(400).json({ success: false, error: "applicantName is required" }); return; }
    if (!applicantEmail?.trim()) { res.status(400).json({ success: false, error: "applicantEmail is required" }); return; }

    let parsedDetails: object = {};
    if (details) {
      try { parsedDetails = JSON.parse(details); } catch { res.status(400).json({ success: false, error: "details must be valid JSON" }); return; }
    }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const documents = DOCUMENT_FIELDS
      .map(field => {
        const file = files?.[field]?.[0];
        return file ? { type: field, filename: file.originalname, mimeType: file.mimetype, data: file.buffer.toString("base64") } : null;
      })
      .filter(Boolean);

    const id = randomUUID();
    const referenceNumber = generateReferenceNumber(deptCode?.trim() || "GN");

    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO job_applications (id, reference_number, department, position, applicant_name, applicant_email, applicant_phone, details, documents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, referenceNumber, department.trim(), position.trim(), applicantName.trim(), applicantEmail.trim(), applicantPhone ?? null, JSON.stringify(parsedDetails), JSON.stringify(documents)]
      );
      await client.query(
        `INSERT INTO job_application_status_history (id, job_application_id, from_status, to_status, reason, changed_by)
         VALUES ($1,$2,NULL,'submitted','Application submitted',NULL)`,
        [randomUUID(), id]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[jobs] Submission failed:", err);
      res.status(500).json({ success: false, error: "Could not submit application, please try again." });
      return;
    } finally {
      client.release();
    }

    res.status(201).json({ success: true, data: { id, referenceNumber, status: "submitted" } });
  }
);

router.get("/applications", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { status, department } = req.query as { status?: string; department?: string };
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (department) { params.push(department); conditions.push(`department = $${params.length}`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await pool!.query(`SELECT COUNT(*)::int AS n FROM job_applications ${whereClause}`, params);
  params.push(limit, offset);
  const { rows } = await pool!.query(
    `SELECT * FROM job_applications ${whereClause} ORDER BY submitted_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ success: true, data: rows.map(mapApplication), meta: { total: countRows[0].n, page, limit, pages: Math.ceil(countRows[0].n / limit) } });
});

router.get("/applications/:ref", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM job_applications WHERE reference_number = $1`, [req.params.ref]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Application not found" }); return; }

  const { rows: history } = await pool!.query(
    `SELECT h.from_status, h.to_status, h.reason, h.changed_by, h.created_at, u.name AS changed_by_name
     FROM job_application_status_history h LEFT JOIN users u ON u.id::text = h.changed_by
     WHERE h.job_application_id = $1 ORDER BY h.created_at ASC`,
    [rows[0].id]
  );

  res.json({
    success: true,
    data: {
      ...mapApplication(rows[0]),
      statusHistory: history.map((h: any) => ({
        fromStatus: h.from_status, toStatus: h.to_status, reason: h.reason,
        changedBy: h.changed_by, changedByName: h.changed_by_name, createdAt: h.created_at,
      })),
    },
  });
});

// GET /api/jobs/applications/:ref/documents/:type — download a specific
// document (cv/id/certs/residence/other). Separate from the JSON detail
// endpoint so the base64 content isn't sent on every list/detail fetch.
router.get("/applications/:ref/documents/:type", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT documents FROM job_applications WHERE reference_number = $1`, [req.params.ref]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Application not found" }); return; }
  const doc = (rows[0].documents as any[]).find(d => d.type === req.params.type);
  if (!doc) { res.status(404).json({ success: false, error: "No document of that type on file for this application" }); return; }
  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.filename || req.params.type}"`);
  res.send(Buffer.from(doc.data, "base64"));
});

router.patch("/applications/:ref/status", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { status: newStatus, reason } = req.body as { status?: string; reason?: string };
  if (!newStatus || !VALID_STATUSES.includes(newStatus as Status)) {
    res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  if (!reason?.trim()) { res.status(400).json({ success: false, error: "reason is required for every status change" }); return; }

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM job_applications WHERE reference_number = $1 FOR UPDATE`, [req.params.ref]);
    if (!rows.length) { await client.query("ROLLBACK"); res.status(404).json({ success: false, error: "Application not found" }); return; }

    const current = rows[0];
    const currentStatus = current.status as Status;
    const target = newStatus as Status;

    if (!ALLOWED_TRANSITIONS[currentStatus].includes(target)) {
      await client.query("ROLLBACK");
      res.status(409).json({
        success: false,
        error: `Cannot move from "${currentStatus}" to "${target}". Valid next steps: ${ALLOWED_TRANSITIONS[currentStatus].join(", ") || "none -- this application is in a terminal state"}.`,
      });
      return;
    }

    const { rows: updated } = await client.query(
      `UPDATE job_applications SET status = $1, status_reason = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [target, reason.trim(), current.id]
    );
    await client.query(
      `INSERT INTO job_application_status_history (id, job_application_id, from_status, to_status, reason, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), current.id, currentStatus, target, reason.trim(), req.user!.userId]
    );
    await client.query("COMMIT");
    res.json({ success: true, data: mapApplication(updated[0]) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[jobs] Status change failed:", err);
    res.status(500).json({ success: false, error: "Could not update application status, please try again." });
  } finally {
    client.release();
  }
});

// POST /api/jobs/applications/:ref/approve — the actual "hire and grant
// access" action. Moves status to 'offered' (this workflow's terminal
// success state) and, critically, grants real section access via
// section_permissions — the exact same table and mechanism the RBAC
// "apply to manage a section" flow already uses. A job application
// approval and an RBAC section grant are now the same real permission,
// not two separate concepts that happen to look similar.
//
// The applicant may not have a VINK account yet at the time they submit
// a job application (submission doesn't require login). Approval looks
// up a user by the application's email at approval time — if no account
// exists yet, the application still moves to 'offered' (so the reviewer
// isn't blocked), but the role grant is deferred: role_granted_at stays
// NULL, and the response says so explicitly rather than silently
// pretending access was granted when it wasn't.
router.post("/applications/:ref/approve", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  const { reason, username, password } = req.body as { reason?: string; username?: string; password?: string };
  if (!reason?.trim()) { res.status(400).json({ success: false, error: "reason is required" }); return; }
  if (password && password.trim().length < 8) { res.status(400).json({ success: false, error: "password must be at least 8 characters" }); return; }

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM job_applications WHERE reference_number = $1 FOR UPDATE`, [req.params.ref]);
    if (!rows.length) { await client.query("ROLLBACK"); res.status(404).json({ success: false, error: "Application not found" }); return; }

    const app = rows[0];
    const currentStatus = app.status as Status;
    if (!ALLOWED_TRANSITIONS[currentStatus].includes("offered")) {
      await client.query("ROLLBACK");
      res.status(409).json({
        success: false,
        error: `Cannot approve from "${currentStatus}". Valid next steps: ${ALLOWED_TRANSITIONS[currentStatus].join(", ") || "none -- this application is in a terminal state"}.`,
      });
      return;
    }

    await client.query(`UPDATE job_applications SET status = 'offered', status_reason = $1, updated_at = now() WHERE id = $2`, [reason.trim(), app.id]);
    await client.query(
      `INSERT INTO job_application_status_history (id, job_application_id, from_status, to_status, reason, changed_by)
       VALUES ($1,$2,$3,'offered',$4,$5)`,
      [randomUUID(), app.id, currentStatus, reason.trim(), req.user!.userId]
    );

    // Look up a real account by the applicant's email to grant section
    // access to. Matches the RBAC section_permissions schema exactly.
    let { rows: userRows } = await client.query(`SELECT id FROM users WHERE email = $1`, [app.applicant_email]);
    let createdAccount = false;

    // No account yet -- if the reviewer supplied login credentials, create
    // one right here rather than just warning that access is deferred.
    // Same account-creation shape as the real /api/auth/register endpoint
    // (bcrypt hash, same users table), so this account works identically
    // to a self-registered one -- it's just HR/the hiring panel setting
    // the initial password instead of the new hire choosing their own.
    if (!userRows.length && username?.trim() && password) {
      const { rows: clash } = await client.query(`SELECT 1 FROM users WHERE username = $1 OR email = $2`, [username.trim(), app.applicant_email]);
      if (clash.length) {
        await client.query("ROLLBACK");
        res.status(409).json({ success: false, error: "An account with that username or this applicant's email already exists — check Users & Roles rather than creating a new one." });
        return;
      }
      const passwordHash = await bcrypt.hash(password.trim(), 10);
      const { rows: created } = await client.query(
        `INSERT INTO users (username, password_hash, role, name, email) VALUES ($1,$2,'customer',$3,$4) RETURNING id`,
        [username.trim(), passwordHash, app.applicant_name, app.applicant_email]
      );
      userRows = created;
      createdAccount = true;
    }

    let roleGranted = false;
    if (userRows.length) {
      const userId = userRows[0].id;
      await client.query(
        `INSERT INTO section_permissions (user_id, section, granted_by) VALUES ($1,$2,$3) ON CONFLICT (user_id, section) DO NOTHING`,
        [userId, app.department, req.user!.userId]
      );
      await client.query(`UPDATE job_applications SET role_granted_at = now(), role_granted_user_id = $1 WHERE id = $2`, [userId, app.id]);
      roleGranted = true;
    }

    await client.query("COMMIT");
    res.json({
      success: true,
      data: { referenceNumber: app.reference_number, status: "offered", roleGranted, accountCreated: createdAccount },
      ...(roleGranted ? {} : { warning: `No VINK account found for ${app.applicant_email} yet — approved, but ${app.department} access hasn't been granted. Provide a username and password to create their account now, or grant it manually via Users & Roles once they register with this email.` }),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[jobs] Approval failed:", err);
    res.status(500).json({ success: false, error: "Could not approve application, please try again." });
  } finally {
    client.release();
  }
});

export default router;
