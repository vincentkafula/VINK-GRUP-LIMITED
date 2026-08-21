import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validateSaId } from "../services/saIdValidator.js";

const router: ReturnType<typeof Router> = Router();
const REVIEWER_ROLES = ["owner", "superadmin", "noc_engineer"] as const;

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

router.post("/register", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }

  const { subscriberRef, idType, idNumber, fullName, dateOfBirth, proofOfAddressType, proofOfAddressDate, documentRefs } = req.body as {
    subscriberRef?: string; idType?: string; idNumber?: string; fullName?: string; dateOfBirth?: string;
    proofOfAddressType?: string; proofOfAddressDate?: string; documentRefs?: Record<string, string>;
  };

  if (!subscriberRef || !idType || !idNumber || !fullName || !proofOfAddressType || !proofOfAddressDate) {
    res.status(400).json({ success: false, error: "subscriberRef, idType, idNumber, fullName, proofOfAddressType, and proofOfAddressDate are required" });
    return;
  }
  if (!["smart_id", "green_id_book", "passport", "refugee_document"].includes(idType)) {
    res.status(400).json({ success: false, error: "idType must be one of smart_id, green_id_book, passport, refugee_document" });
    return;
  }
  if (!["utility_bill", "bank_statement", "lease_agreement", "affidavit"].includes(proofOfAddressType)) {
    res.status(400).json({ success: false, error: "proofOfAddressType must be one of utility_bill, bank_statement, lease_agreement, affidavit" });
    return;
  }

  let resolvedDob = dateOfBirth ?? null;

  if (idType === "smart_id" || idType === "green_id_book") {
    const decoded = validateSaId(idNumber);
    if (!decoded.valid) {
      res.status(400).json({ success: false, error: `Invalid South African ID number: ${decoded.error}` });
      return;
    }
    resolvedDob = decoded.dateOfBirth;
  } else if (!dateOfBirth) {
    res.status(400).json({ success: false, error: "dateOfBirth is required for passport/refugee_document, since there's no checksum to derive it from" });
    return;
  }

  if (proofOfAddressType !== "affidavit") {
    const poaDate = new Date(proofOfAddressDate);
    if (isNaN(poaDate.getTime())) {
      res.status(400).json({ success: false, error: "proofOfAddressDate is not a valid date" });
      return;
    }
    const ageMs = Date.now() - poaDate.getTime();
    if (ageMs > THREE_MONTHS_MS) {
      res.status(400).json({ success: false, error: "Proof of address must be dated within the last 3 months to satisfy RICA requirements" });
      return;
    }
    if (ageMs < 0) {
      res.status(400).json({ success: false, error: "Proof of address date is in the future" });
      return;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO rica_registrations (subscriber_ref, id_type, id_number, full_name, date_of_birth, proof_of_address_type, proof_of_address_date, document_refs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [subscriberRef, idType, idNumber, fullName, resolvedDob, proofOfAddressType, proofOfAddressDate, documentRefs ? JSON.stringify(documentRefs) : null]
  );

  res.status(201).json({ success: true, data: rows[0] });
});

router.get("/registrations", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.json({ success: true, data: [] }); return; }
  const { status, subscriberRef } = req.query as { status?: string; subscriberRef?: string };

  const conditions: string[] = [];
  const params: string[] = [];
  if (status) { params.push(status); conditions.push(`verification_status = $${params.length}`); }
  if (subscriberRef) { params.push(subscriberRef); conditions.push(`subscriber_ref = $${params.length}`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(`SELECT * FROM rica_registrations ${whereClause} ORDER BY created_at DESC LIMIT 200`, params);
  res.json({ success: true, data: rows });
});

router.patch("/registrations/:id/verify", requireAuth, requireRole(...REVIEWER_ROLES), async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(503).json({ success: false, error: "Database not configured" }); return; }
  const { status, notes } = req.body as { status?: string; notes?: string };
  if (status !== "verified" && status !== "rejected") {
    res.status(400).json({ success: false, error: "status must be 'verified' or 'rejected'" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE rica_registrations SET verification_status = $1, verification_notes = $2, verified_at = now(), verified_by = $3 WHERE id = $4 RETURNING *`,
    [status, notes ?? null, req.user?.username ?? "admin", req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Registration not found" }); return; }
  res.json({ success: true, data: rows[0] });
});

export default router;
