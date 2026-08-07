import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { pool, hasDb } from "../db/pool.js";
import { emit } from "./wsBroadcast.js";

/**
 * Seller KYC verification -- provider-agnostic, same disciplined pattern
 * as vinkPay.ts: an interface every call site talks to, one concrete
 * implementation per provider, webhook-driven confirmation with
 * idempotency, and a reconciliation job for the "webhook never arrives"
 * case.
 *
 * NO REAL PROVIDER IS CONFIGURED YET. You confirmed you don't have an
 * account with Smile Identity, Onfido, or anything else yet -- so rather
 * than guess at an API that might not match whichever one you eventually
 * sign up with (the same mistake already made twice with Visa/Mastercard
 * auth before checking properly), this ships with exactly one
 * implementation: NotConfiguredProvider, which cleanly rejects every
 * submission with a clear error instead of silently accepting documents
 * with nowhere real to send them.
 *
 * When you do pick a provider: add a new object implementing KycProvider
 * (real submitForVerification/checkStatus/verifyWebhookSignature calls
 * against their actual SDK or API), set it as the active provider below,
 * and nothing in kycRouter.ts or the reconciliation job needs to change --
 * same interface-boundary discipline as VinkPay.
 *
 * POPIA-relevant design decision, stated explicitly: document *bytes*
 * (ID front/back, selfie, proof of address, business certificates) are
 * never written to this database or disk anywhere in this file or
 * kycRouter.ts. They exist in memory only for the duration of the
 * request, on their way to whichever provider is configured. Only the
 * verification *result* -- status, provider reference, which document
 * types were submitted (not their content), timestamps -- is persisted.
 */

export type KycStatus = "not_submitted" | "submitted" | "verified" | "rejected";

export interface KycDocument {
  type: "id_front" | "id_back" | "selfie" | "address_proof" | "cert_incorporation" | "business_reg_cert" | "business_license" | "tax_certificate";
  buffer: Buffer;
  mimeType: string;
}

export interface KycApplicantInfo {
  firstName: string;
  lastName: string;
  dob?: string;
  idType?: string;
  idNumber?: string;
  idCountry?: string;
}

export interface KycSubmission {
  sellerId: string;
  applicant: KycApplicantInfo;
  documents: KycDocument[];
}

export interface KycSubmitResult {
  success: boolean;
  providerRef?: string;
  error?: string;
}

export interface KycCheckResult {
  status: KycStatus;
  reason?: string;
}

export interface KycProvider {
  name: string;
  isConfigured(): boolean;
  submitForVerification(sub: KycSubmission): Promise<KycSubmitResult>;
  checkStatus(providerRef: string): Promise<KycCheckResult>;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
}

// --- The only provider implemented so far ----------------------------------
const notConfiguredProvider: KycProvider = {
  name: "not_configured",
  isConfigured: () => false,
  async submitForVerification(): Promise<KycSubmitResult> {
    return { success: false, error: "No KYC provider is configured yet. Choose and configure a real provider (Smile Identity, Onfido, or another) before accepting real seller documents." };
  },
  async checkStatus(): Promise<KycCheckResult> {
    return { status: "submitted", reason: "No provider configured" };
  },
  verifyWebhookSignature(): boolean {
    return false;
  },
};

// Swap this for a real provider object once one is configured -- this is
// the one line that changes; nothing else in this file or kycRouter.ts does.
const ACTIVE_PROVIDER: KycProvider = notConfiguredProvider;

export function verifyHmacSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "").trim();
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// --- Submission --------------------------------------------------------

export interface SubmitKycResult {
  accepted: boolean;
  verificationId?: string;
  error?: string;
}

export async function submitKyc(sub: KycSubmission): Promise<SubmitKycResult> {
  if (!ACTIVE_PROVIDER.isConfigured()) {
    const id = await recordSubmission(sub, { success: false, error: "No provider configured" });
    return { accepted: false, verificationId: id, error: "KYC verification isn't available yet -- no licensed identity provider is configured. Your documents were not submitted or stored." };
  }

  const result = await ACTIVE_PROVIDER.submitForVerification(sub);
  const id = await recordSubmission(sub, result);

  if (!result.success) return { accepted: false, verificationId: id, error: result.error };
  return { accepted: true, verificationId: id };
}

async function recordSubmission(sub: KycSubmission, result: KycSubmitResult): Promise<string> {
  const id = randomUUID();
  if (hasDb && pool) {
    await pool.query(
      `INSERT INTO seller_kyc_verifications (id, seller_id, provider, provider_ref, status, document_types_submitted, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $5 = 'submitted' THEN now() ELSE NULL END)`,
      [id, sub.sellerId, ACTIVE_PROVIDER.name, result.providerRef ?? null, result.success ? "submitted" : "not_submitted", sub.documents.map(d => d.type)]
    );
  }
  return id;
}

// --- Webhook handling --------------------------------------------------

export interface KycWebhookPayload {
  providerRef: string;
  status: "verified" | "rejected";
  reason?: string;
}

export interface KycWebhookResult {
  handled: boolean;
  duplicate: boolean;
  sellerId?: string;
  error?: string;
}

export async function handleKycWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  payload: KycWebhookPayload,
): Promise<KycWebhookResult> {
  if (!ACTIVE_PROVIDER.verifyWebhookSignature(rawBody, signatureHeader)) {
    return { handled: false, duplicate: false, error: "Invalid webhook signature" };
  }
  if (!hasDb || !pool) return { handled: false, duplicate: false, error: "Database not configured" };

  const { rows } = await pool.query(
    `UPDATE seller_kyc_verifications
     SET status = $1, rejection_reason = $2, verified_at = CASE WHEN $1 = 'verified' THEN now() ELSE verified_at END,
         webhook_received_at = now(), updated_at = now()
     WHERE provider = $3 AND provider_ref = $4 AND webhook_received_at IS NULL
     RETURNING seller_id`,
    [payload.status, payload.reason ?? null, ACTIVE_PROVIDER.name, payload.providerRef]
  );

  if (!rows.length) {
    const { rows: existing } = await pool.query(
      `SELECT 1 FROM seller_kyc_verifications WHERE provider = $1 AND provider_ref = $2`,
      [ACTIVE_PROVIDER.name, payload.providerRef]
    );
    return { handled: true, duplicate: existing.length > 0 };
  }

  const sellerId = rows[0].seller_id;
  await pool.query(
    `UPDATE mkt_sellers SET kyc_verified = $1, status = CASE WHEN $1 THEN status ELSE 'kyc_rejected' END WHERE id = $2`,
    [payload.status === "verified", sellerId]
  );

  emit("kyc.verification_status_changed", { sellerId, status: payload.status });
  return { handled: true, duplicate: false, sellerId };
}

// --- Reconciliation job --------------------------------------------------

const RECONCILIATION_INTERVAL_MS = 5 * 60_000;
const STUCK_VERIFICATION_TIMEOUT_MS = 60 * 60_000;

export async function reconcilePendingKyc(): Promise<{ checked: number; resolved: number }> {
  if (!hasDb || !pool || !ACTIVE_PROVIDER.isConfigured()) return { checked: 0, resolved: 0 };

  const { rows: stuck } = await pool.query(
    `SELECT id, provider_ref FROM seller_kyc_verifications
     WHERE status = 'submitted' AND provider_ref IS NOT NULL AND webhook_received_at IS NULL
       AND submitted_at < now() - ($1 || ' milliseconds')::interval
     ORDER BY submitted_at ASC LIMIT 50`,
    [STUCK_VERIFICATION_TIMEOUT_MS]
  );

  let resolved = 0;
  for (const row of stuck) {
    const result = await ACTIVE_PROVIDER.checkStatus(row.provider_ref);
    if (result.status === "submitted") continue;

    const { rows: updated } = await pool.query(
      `UPDATE seller_kyc_verifications SET status = $1, rejection_reason = $2,
         verified_at = CASE WHEN $1 = 'verified' THEN now() ELSE verified_at END,
         webhook_received_at = now(), updated_at = now()
       WHERE id = $3 AND webhook_received_at IS NULL RETURNING seller_id`,
      [result.status, result.reason ?? null, row.id]
    );
    if (updated.length) {
      await pool.query(
        `UPDATE mkt_sellers SET kyc_verified = $1, status = CASE WHEN $1 THEN status ELSE 'kyc_rejected' END WHERE id = $2`,
        [result.status === "verified", updated[0].seller_id]
      );
      emit("kyc.verification_status_changed", { sellerId: updated[0].seller_id, status: result.status });
      resolved++;
    }
  }
  return { checked: stuck.length, resolved };
}

export function startKycReconciliationJob(): () => void {
  const interval = setInterval(() => {
    reconcilePendingKyc()
      .then(({ checked, resolved }) => {
        if (checked > 0) console.log(`[kyc] Reconciliation: checked ${checked} stuck verification(s), resolved ${resolved}`);
      })
      .catch(err => console.error("[kyc] Reconciliation job error:", err));
  }, RECONCILIATION_INTERVAL_MS);
  return () => clearInterval(interval);
}

// --- Queries -------------------------------------------------------------

export async function getSellerKycStatus(sellerId: string) {
  if (!hasDb || !pool) return null;
  const { rows } = await pool.query(
    `SELECT status, provider, document_types_submitted, rejection_reason, submitted_at, verified_at
     FROM seller_kyc_verifications WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [sellerId]
  );
  return rows[0] ?? null;
}
