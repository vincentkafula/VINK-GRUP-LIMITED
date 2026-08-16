import { pool, hasDb } from "../db/pool.js";

/**
 * Fraud & Risk Basics (M1, Section 5.1.4 of the milestone plan) --
 * rule-based, deliberately narrow in scope: velocity checks and
 * duplicate-account detection, nothing more sophisticated. Every check
 * here creates a flag for a human reviewer; nothing in this file ever
 * blocks a submission, cancels an order, or rejects an application on
 * its own. That's a deliberate design constraint from the milestone
 * plan, not an oversight -- legitimate cases (a shared family device
 * submitting two applications, for instance) would otherwise be caught
 * as false positives if this auto-blocked.
 *
 * Same interface-boundary discipline as vinkPay.ts and
 * kycVerification.ts: each check is a small, independent function
 * against the database, callable from wherever the relevant submission
 * happens (applicationsRouter.ts, the payment-submission path), so a
 * future move to a real scoring model doesn't require touching every
 * call site -- only what happens inside these functions.
 */

const APPLICATION_VELOCITY_WINDOW_HOURS = 24;
const APPLICATION_VELOCITY_THRESHOLD = 3; // 3+ applications sharing a phone or email within the window

const PAYMENT_VELOCITY_WINDOW_MINUTES = 60;
const PAYMENT_VELOCITY_THRESHOLD = 5; // 5+ payment submissions from the same user within the window

async function createFlagIfNotOpen(
  type: string,
  severity: "info" | "warning" | "critical",
  subjectType: "user" | "application" | "order",
  subjectId: string,
  relatedIds: string[],
  description: string,
): Promise<void> {
  if (!hasDb || !pool) return;
  // Don't create a second open flag of the same type for the same subject —
  // a reviewer already has one to act on; piling up duplicates makes the
  // review queue noisier, not more informative.
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM fraud_flags WHERE type = $1 AND subject_type = $2 AND subject_id = $3 AND status = 'open'`,
    [type, subjectType, subjectId]
  );
  if (existing.length) return;

  await pool.query(
    `INSERT INTO fraud_flags (type, severity, subject_type, subject_id, related_ids, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [type, severity, subjectType, subjectId, JSON.stringify(relatedIds), description]
  );
}

/**
 * Call after inserting a new application row. Checks two independent
 * things against the phone/email just submitted: (1) has this exact
 * phone or email submitted an unusual number of applications recently
 * (velocity), and (2) does this phone or email already appear on a
 * *different* applicant's application (possible duplicate account).
 * These are separate flag types because they mean different things to a
 * reviewer -- one person applying repeatedly vs. what looks like two
 * different identities sharing contact details.
 */
export async function checkApplicationRisk(applicationId: string, applicantUserId: string | null, phone: string | null, email: string | null): Promise<void> {
  if (!hasDb || !pool) return;
  if (!phone && !email) return; // nothing to check against

  // Velocity: count applications sharing this phone or email in the window,
  // regardless of who submitted them. IS NOT DISTINCT FROM handles the
  // NULL-safe comparison cleanly -- when phone is NULL, this clause simply
  // never matches (no application row has a NULL applicant_phone that
  // should count as "sharing" a NULL value here), same for email.
  const { rows: velocityRows } = await pool.query(
    `SELECT id FROM applications
     WHERE submitted_at > now() - ($1 || ' hours')::interval
       AND ((($2::text IS NOT NULL) AND applicant_phone = $2) OR (($3::text IS NOT NULL) AND applicant_email = $3))`,
    [APPLICATION_VELOCITY_WINDOW_HOURS, phone, email]
  );
  if (velocityRows.length >= APPLICATION_VELOCITY_THRESHOLD) {
    await createFlagIfNotOpen(
      "velocity_applications", "warning", "application", applicationId,
      velocityRows.map((r) => r.id),
      `${velocityRows.length} applications sharing the same phone or email number within ${APPLICATION_VELOCITY_WINDOW_HOURS}h.`
    );
  }

  // Duplicate account: same phone or email on a DIFFERENT applicant's
  // application (different applicant_user_id, or both NULL user id but a
  // different application id — an applicant without a VINK login yet is
  // still a distinct person from another applicant without one).
  if (phone) {
    const { rows } = await pool.query(
      `SELECT id, applicant_user_id FROM applications
       WHERE applicant_phone = $1 AND id != $2
         AND (applicant_user_id IS DISTINCT FROM $3 OR applicant_user_id IS NULL)`,
      [phone, applicationId, applicantUserId]
    );
    if (rows.length) {
      await createFlagIfNotOpen(
        "duplicate_phone", "warning", "application", applicationId,
        rows.map((r) => r.id),
        `Phone number also appears on ${rows.length} other application(s) under a different applicant.`
      );
    }
  }
  if (email) {
    const { rows } = await pool.query(
      `SELECT id, applicant_user_id FROM applications
       WHERE applicant_email = $1 AND id != $2
         AND (applicant_user_id IS DISTINCT FROM $3 OR applicant_user_id IS NULL)`,
      [email, applicationId, applicantUserId]
    );
    if (rows.length) {
      await createFlagIfNotOpen(
        "duplicate_email", "warning", "application", applicationId,
        rows.map((r) => r.id),
        `Email address also appears on ${rows.length} other application(s) under a different applicant.`
      );
    }
  }
}

/**
 * Call after a payment submission (order created, transaction row
 * inserted) — before webhook confirmation, since velocity is about
 * submission frequency, not confirmed-payment frequency.
 */
export async function checkPaymentVelocity(orderId: string, userId: string): Promise<void> {
  if (!hasDb || !pool) return;
  const { rows } = await pool.query(
    `SELECT o.id FROM mkt_orders o
     WHERE o.user_id = $1 AND o.placed_at > now() - ($2 || ' minutes')::interval`,
    [userId, PAYMENT_VELOCITY_WINDOW_MINUTES]
  );
  if (rows.length >= PAYMENT_VELOCITY_THRESHOLD) {
    await createFlagIfNotOpen(
      "velocity_payments", "warning", "order", orderId,
      rows.map((r) => r.id),
      `${rows.length} orders placed by the same account within ${PAYMENT_VELOCITY_WINDOW_MINUTES} minutes.`
    );
  }
}

/**
 * Call once a transaction has a card_fingerprint (from the processor's
 * own response — never the raw card number). Flags when the same card
 * has been used to pay for orders under more than one distinct user
 * account, which is a legitimate signal (shared family card is common
 * and not inherently fraudulent) but worth a reviewer's attention rather
 * than silent acceptance.
 */
export async function checkDuplicateCard(orderId: string, userId: string, cardFingerprint: string): Promise<void> {
  if (!hasDb || !pool) return;
  const { rows } = await pool.query(
    `SELECT DISTINCT o.user_id, o.id AS order_id
     FROM vinkpay_transactions t
     JOIN mkt_orders o ON o.id = t.order_id
     WHERE t.card_fingerprint = $1 AND o.user_id != $2`,
    [cardFingerprint, userId]
  );
  if (rows.length) {
    await createFlagIfNotOpen(
      "duplicate_card", "info", "order", orderId,
      rows.map((r) => r.order_id),
      `This card has also been used on ${rows.length} order(s) under ${new Set(rows.map((r) => r.user_id)).size} other account(s).`
    );
  }
}
