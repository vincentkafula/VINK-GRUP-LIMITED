import { Router, Request, Response } from "express";
import { handleWebhook, type WebhookPayload } from "../services/vinkPay.js";

const router: ReturnType<typeof Router> = Router();

/**
 * POST /api/vinkpay/webhook/:processor
 *
 * Receives payment-status callbacks from Visa or Mastercard. Deliberately
 * has NO requireAuth — the caller is the processor's server, not a logged-
 * in VINK user, so the only thing that can authenticate this request is
 * the signature check inside handleWebhook(). Do not add requireAuth here;
 * it would reject every legitimate webhook delivery.
 *
 * Payload shape below is a reasonable normalized guess (processorRef,
 * status, errorMessage) — NOT YET CONFIRMED against either processor's
 * actual webhook payload format, since neither has webhook delivery
 * configured yet in this environment. Confirm the real field names against
 * whichever processor's webhook documentation once delivery is set up in
 * their Developer Portal, and adjust the mapping below — the signature
 * verification and idempotency logic in vinkPay.ts don't need to change,
 * only how this route extracts processorRef/status from the real payload.
 */
router.post("/:processor", async (req: Request, res: Response): Promise<void> => {
  const processor = req.params.processor;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    // Should never happen given how this route is mounted in index.ts, but
    // fail loudly rather than silently trusting an unverifiable payload.
    res.status(500).json({ success: false, error: "Raw body not captured — signature cannot be verified" });
    return;
  }

  const signatureHeader = req.header("x-vinkpay-signature") ?? req.header("x-webhook-signature");

  // Field names here are the normalized guess mentioned above.
  const payload: WebhookPayload = {
    processorRef: req.body.transactionId ?? req.body.paymentId ?? req.body.processorRef,
    status: req.body.status === "confirmed" || req.body.status === "approved" || req.body.status === "completed" ? "confirmed" : "failed",
    errorMessage: req.body.errorMessage ?? req.body.declineReason,
  };

  if (!payload.processorRef) {
    res.status(400).json({ success: false, error: "Missing transaction reference in webhook payload" });
    return;
  }

  const result = await handleWebhook(processor, rawBody, signatureHeader, payload);

  if (!result.handled) {
    // Signature failures and unknown processors get a 401/400, not 500 —
    // distinguishes "this request is malformed or unauthenticated" from
    // "we understood it but something broke on our end," which matters
    // for how the processor's retry logic behaves.
    const status = result.error === "Invalid webhook signature" ? 401 : 400;
    res.status(status).json({ success: false, error: result.error });
    return;
  }

  // Always 200 once handled, including duplicates — a webhook that's
  // already been processed is not an error from the processor's point of
  // view, and returning anything else would make it keep retrying
  // something that already succeeded.
  res.status(200).json({ success: true, duplicate: result.duplicate });
});

export default router;
