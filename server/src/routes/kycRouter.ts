import { Router, Request, Response } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { submitKyc, getSellerKycStatus, handleKycWebhook, type KycDocument, type KycWebhookPayload } from "../services/kycVerification.js";

const router: ReturnType<typeof Router> = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 8 },
});

const DOCUMENT_FIELDS = [
  "idFront", "idBack", "selfie", "addressProof",
  "certIncorporation", "businessRegCert", "businessLicense", "taxCertificate",
] as const;

const FIELD_TO_TYPE: Record<string, KycDocument["type"]> = {
  idFront: "id_front", idBack: "id_back", selfie: "selfie", addressProof: "address_proof",
  certIncorporation: "cert_incorporation", businessRegCert: "business_reg_cert",
  businessLicense: "business_license", taxCertificate: "tax_certificate",
};

router.post(
  "/sellers/:sellerId/documents",
  requireAuth,
  (req: Request, res: Response, next) => {
    upload.fields(DOCUMENT_FIELDS.map(name => ({ name, maxCount: 1 })))(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        // A wrong/unexpected field name, oversized file, or too many files
        // is a malformed request from the client, not a server failure —
        // respond with a clean 400 instead of falling through to the
        // generic error handler's unhelpful 500.
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
    const { sellerId } = req.params;

    const { rows: sellerRows } = await pool!.query(`SELECT user_id FROM mkt_sellers WHERE id = $1`, [sellerId]);
    if (!sellerRows.length) { res.status(404).json({ success: false, error: "Seller not found" }); return; }
    if (sellerRows[0].user_id !== req.user!.userId) { res.status(403).json({ success: false, error: "You can only submit documents for your own seller account" }); return; }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const documents: KycDocument[] = [];
    for (const field of DOCUMENT_FIELDS) {
      const file = files?.[field]?.[0];
      if (file) documents.push({ type: FIELD_TO_TYPE[field], buffer: file.buffer, mimeType: file.mimetype });
    }

    if (!documents.length) {
      res.status(400).json({ success: false, error: "No documents were included in this submission" });
      return;
    }

    const { firstName, lastName, dob, idType, idNumber, idCountry } = req.body;

    const result = await submitKyc({
      sellerId,
      applicant: { firstName, lastName, dob, idType, idNumber, idCountry },
      documents,
    });

    if (!result.accepted) {
      res.status(result.error?.includes("not configured") || result.error?.includes("isn't available") ? 503 : 400)
        .json({ success: false, error: result.error });
      return;
    }
    res.status(202).json({ success: true, data: { verificationId: result.verificationId, status: "submitted" } });
  }
);

router.get("/sellers/:sellerId/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { sellerId } = req.params;
  const { rows: sellerRows } = await pool!.query(`SELECT user_id FROM mkt_sellers WHERE id = $1`, [sellerId]);
  if (!sellerRows.length) { res.status(404).json({ success: false, error: "Seller not found" }); return; }
  if (sellerRows[0].user_id !== req.user!.userId) { res.status(403).json({ success: false, error: "You can only view your own seller account's status" }); return; }

  const status = await getSellerKycStatus(sellerId);
  res.json({ success: true, data: status ?? { status: "not_submitted" } });
});

router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(500).json({ success: false, error: "Raw body not captured -- signature cannot be verified" });
    return;
  }
  const signatureHeader = req.header("x-kyc-signature") ?? req.header("x-webhook-signature");
  const payload: KycWebhookPayload = {
    providerRef: req.body.providerRef ?? req.body.job_id ?? req.body.check_id,
    status: req.body.status === "verified" || req.body.result === "clear" ? "verified" : "rejected",
    reason: req.body.reason ?? req.body.rejection_reason,
  };
  if (!payload.providerRef) {
    res.status(400).json({ success: false, error: "Missing provider reference in webhook payload" });
    return;
  }

  const result = await handleKycWebhook(rawBody, signatureHeader, payload);
  if (!result.handled) {
    res.status(result.error === "Invalid webhook signature" ? 401 : 400).json({ success: false, error: result.error });
    return;
  }
  res.status(200).json({ success: true, duplicate: result.duplicate });
});

export default router;
