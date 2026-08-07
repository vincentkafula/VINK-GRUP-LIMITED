import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { pool, hasDb } from "../db/pool.js";
import { visaXPayRequest } from "./visaXPayToken.js";
import { mastercardRequest, isConfigured as mastercardConfigured } from "./mastercardClient.js";
import { emit } from "./wsBroadcast.js";

/**
 * VinkPay -- VINK's own payment processing engine.
 *
 * Every call site in the app talks to this interface, never to a
 * processor's SDK directly. Swapping the underlying processor later means
 * writing one new object that implements VinkPayProcessor and adding it to
 * PROCESSORS below -- nothing in the order flow, the webhook handler, or
 * the reconciliation job needs to change.
 *
 * This is webhook-confirmed, not optimistic: submitPayment() only means
 * "the processor accepted this for processing," never "the money arrived."
 * payment_confirmed is only ever reached through handleWebhook() (a
 * verified callback from the processor) or the reconciliation job actively
 * calling verifyTransaction() -- never from the order-submission endpoint.
 */

export type PaymentStatus = "submitted" | "confirmed" | "failed";

export interface ChargeRequest {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  paymentMethod: "card" | "bank_transfer";
  customerEmail: string;
  paymentDetails?: Record<string, unknown>;
}

export interface SubmitResult {
  success: boolean;
  processorRef?: string;
  error?: string;
}

export interface VerifyResult {
  status: PaymentStatus;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  refundRef?: string;
  error?: string;
}

export interface VinkPayProcessor {
  name: "visa" | "mastercard";
  isConfigured(): boolean;
  submitPayment(req: ChargeRequest): Promise<SubmitResult>;
  verifyTransaction(processorRef: string): Promise<VerifyResult>;
  refund(processorRef: string, amount?: number): Promise<RefundResult>;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
}

// --- Visa processor (card payments via DPS) ---------------------------------
const visaProcessor: VinkPayProcessor = {
  name: "visa",
  isConfigured: () => Boolean(process.env.VISA_API_KEY && process.env.VISA_SHARED_SECRET),

  async submitPayment(req: ChargeRequest): Promise<SubmitResult> {
    const apiKey = process.env.VISA_API_KEY ?? "";
    const sharedSecret = process.env.VISA_SHARED_SECRET ?? "";
    try {
      const data = await visaXPayRequest<{ transactionId?: string }>({
        baseUrl: process.env.VISA_API_BASE_URL ?? "https://sandbox.api.visa.com",
        method: "POST",
        resourcePath: "dpscardandaccountservices/v1/transactions",
        apiKey,
        sharedSecret,
        body: { amount: req.amount, currency: req.currency, orderReference: req.orderNumber, ...req.paymentDetails },
      });
      if (!data.transactionId) return { success: false, error: "Visa did not return a transaction reference" };
      return { success: true, processorRef: data.transactionId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Visa submission failed" };
    }
  },

  async verifyTransaction(processorRef: string): Promise<VerifyResult> {
    const apiKey = process.env.VISA_API_KEY ?? "";
    const sharedSecret = process.env.VISA_SHARED_SECRET ?? "";
    try {
      const data = await visaXPayRequest<{ responseCode?: string; status?: string }>({
        baseUrl: process.env.VISA_API_BASE_URL ?? "https://sandbox.api.visa.com",
        method: "GET",
        resourcePath: `dpscardandaccountservices/v1/transactions/${processorRef}`,
        apiKey,
        sharedSecret,
      });
      if (data.status === "approved" || data.responseCode === "00") return { status: "confirmed" };
      if (data.status === "declined" || data.status === "failed") return { status: "failed", error: `Visa: ${data.status ?? data.responseCode}` };
      return { status: "submitted" };
    } catch (err) {
      return { status: "submitted", error: err instanceof Error ? err.message : "Visa verification failed" };
    }
  },

  async refund(processorRef: string, amount?: number): Promise<RefundResult> {
    const apiKey = process.env.VISA_API_KEY ?? "";
    const sharedSecret = process.env.VISA_SHARED_SECRET ?? "";
    try {
      const data = await visaXPayRequest<{ refundId?: string }>({
        baseUrl: process.env.VISA_API_BASE_URL ?? "https://sandbox.api.visa.com",
        method: "POST",
        resourcePath: `dpscardandaccountservices/v1/transactions/${processorRef}/refund`,
        apiKey,
        sharedSecret,
        body: amount !== undefined ? { amount } : {},
      });
      return { success: Boolean(data.refundId), refundRef: data.refundId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Visa refund failed" };
    }
  },

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const secret = process.env.VISA_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;
    return verifyHmacSignature(rawBody, signatureHeader, secret);
  },
};

// --- Mastercard processor (bank-linked payments via Open Banking) ----------
const mastercardProcessor: VinkPayProcessor = {
  name: "mastercard",
  isConfigured: () => mastercardConfigured(),

  async submitPayment(req: ChargeRequest): Promise<SubmitResult> {
    try {
      const data = await mastercardRequest<{ paymentId?: string }>({
        method: "POST",
        path: "/payments/v1/transfers",
        body: { amount: req.amount, currency: req.currency, reference: req.orderNumber, ...req.paymentDetails },
      });
      if (!data.paymentId) return { success: false, error: "Mastercard did not return a payment reference" };
      return { success: true, processorRef: data.paymentId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Mastercard submission failed" };
    }
  },

  async verifyTransaction(processorRef: string): Promise<VerifyResult> {
    try {
      const data = await mastercardRequest<{ status?: string }>({ method: "GET", path: `/payments/v1/transfers/${processorRef}` });
      if (data.status === "completed") return { status: "confirmed" };
      if (data.status === "failed" || data.status === "rejected") return { status: "failed", error: `Mastercard: ${data.status}` };
      return { status: "submitted" };
    } catch (err) {
      return { status: "submitted", error: err instanceof Error ? err.message : "Mastercard verification failed" };
    }
  },

  async refund(processorRef: string, amount?: number): Promise<RefundResult> {
    try {
      const data = await mastercardRequest<{ refundId?: string }>({
        method: "POST",
        path: `/payments/v1/transfers/${processorRef}/reversal`,
        body: amount !== undefined ? { amount } : {},
      });
      return { success: Boolean(data.refundId), refundRef: data.refundId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Mastercard refund failed" };
    }
  },

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const secret = process.env.MASTERCARD_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;
    return verifyHmacSignature(rawBody, signatureHeader, secret);
  },
};

const PROCESSORS: Record<ChargeRequest["paymentMethod"], VinkPayProcessor> = {
  card: visaProcessor,
  bank_transfer: mastercardProcessor,
};

function processorFor(name: string): VinkPayProcessor | undefined {
  if (name === "visa") return visaProcessor;
  if (name === "mastercard") return mastercardProcessor;
  return undefined;
}

function verifyHmacSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "").trim();
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// --- Ledger -------------------------------------------------------------

async function recordSubmission(req: ChargeRequest, processor: VinkPayProcessor["name"], result: SubmitResult): Promise<string> {
  const id = randomUUID();
  if (hasDb && pool) {
    await pool.query(
      `INSERT INTO vinkpay_transactions (id, order_id, order_number, processor, payment_method, amount, currency, status, processor_ref, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.orderId, req.orderNumber, processor, req.paymentMethod, req.amount, req.currency,
       result.success ? "submitted" : "failed", result.processorRef ?? null, result.error ?? null]
    );
  }
  return id;
}

// --- Order submission -----------------------------------------------------

export interface SubmitOrderPaymentResult {
  accepted: boolean;
  vinkPayTransactionId?: string;
  error?: string;
}

export async function submitOrderPayment(req: ChargeRequest): Promise<SubmitOrderPaymentResult> {
  const processor = PROCESSORS[req.paymentMethod];
  if (!processor) return { accepted: false, error: `No processor configured for payment method: ${req.paymentMethod}` };
  if (!processor.isConfigured()) {
    const txId = await recordSubmission(req, processor.name, { success: false, error: `${processor.name} is not configured` });
    return { accepted: false, vinkPayTransactionId: txId, error: `${processor.name} is not configured -- set its credentials in Railway's environment variables.` };
  }

  const result = await processor.submitPayment(req);
  const txId = await recordSubmission(req, processor.name, result);

  if (!result.success) return { accepted: false, vinkPayTransactionId: txId, error: result.error };
  return { accepted: true, vinkPayTransactionId: txId };
}

// --- Webhook handling (the real confirmation path) -------------------------

export interface WebhookPayload {
  processorRef: string;
  status: "confirmed" | "failed";
  errorMessage?: string;
}

export interface WebhookHandleResult {
  handled: boolean;
  duplicate: boolean;
  orderId?: string;
  error?: string;
}

export async function handleWebhook(
  processorName: string,
  rawBody: Buffer,
  signatureHeader: string | undefined,
  payload: WebhookPayload,
): Promise<WebhookHandleResult> {
  const processor = processorFor(processorName);
  if (!processor) return { handled: false, duplicate: false, error: `Unknown processor: ${processorName}` };

  if (!processor.verifyWebhookSignature(rawBody, signatureHeader)) {
    return { handled: false, duplicate: false, error: "Invalid webhook signature" };
  }

  if (!hasDb || !pool) return { handled: false, duplicate: false, error: "Database not configured" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE vinkpay_transactions
       SET status = $1, error_message = $2, webhook_received_at = now(), updated_at = now()
       WHERE processor = $3 AND processor_ref = $4 AND webhook_received_at IS NULL
       RETURNING order_id, order_number`,
      [payload.status, payload.errorMessage ?? null, processorName, payload.processorRef]
    );

    if (!rows.length) {
      await client.query("ROLLBACK");
      const { rows: existing } = await pool.query(
        `SELECT 1 FROM vinkpay_transactions WHERE processor = $1 AND processor_ref = $2`,
        [processorName, payload.processorRef]
      );
      return { handled: true, duplicate: existing.length > 0 };
    }

    const { order_id: orderId, order_number: orderNumber } = rows[0];

    if (payload.status === "confirmed") {
      await client.query(`UPDATE mkt_orders SET payment_status = 'payment_confirmed', confirmed_at = now() WHERE id = $1`, [orderId]);
    } else {
      const { rows: orderRows } = await client.query(`SELECT items FROM mkt_orders WHERE id = $1`, [orderId]);
      for (const item of (orderRows[0]?.items ?? []) as { productId: string; quantity: number }[]) {
        await client.query(`UPDATE mkt_products SET stock = stock + $1, total_sold = GREATEST(0, total_sold - $1) WHERE id::text = $2`, [item.quantity, item.productId]);
      }
      await client.query(`UPDATE mkt_orders SET payment_status = 'payment_failed', status = 'payment_failed' WHERE id = $1`, [orderId]);
    }

    await client.query("COMMIT");
    emit("vinkpay.payment_status_changed", { orderId, orderNumber, status: payload.status });
    return { handled: true, duplicate: false, orderId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[vinkpay] Webhook handling failed:", err);
    return { handled: false, duplicate: false, error: "Internal error processing webhook" };
  } finally {
    client.release();
  }
}

// --- Reconciliation job -----------------------------------------------------

const RECONCILIATION_INTERVAL_MS = 60_000;
const STUCK_PAYMENT_TIMEOUT_MS = 10 * 60_000;

export async function reconcilePendingPayments(): Promise<{ checked: number; resolved: number }> {
  if (!hasDb || !pool) return { checked: 0, resolved: 0 };

  const { rows: stuck } = await pool.query(
    `SELECT o.id AS order_id, t.id AS tx_id, t.processor, t.processor_ref
     FROM mkt_orders o
     JOIN vinkpay_transactions t ON t.order_id = o.id
     WHERE o.payment_status = 'pending_payment'
       AND t.status = 'submitted'
       AND t.processor_ref IS NOT NULL
       AND t.webhook_received_at IS NULL
       AND t.created_at < now() - ($1 || ' milliseconds')::interval
     ORDER BY t.created_at ASC
     LIMIT 50`,
    [STUCK_PAYMENT_TIMEOUT_MS]
  );

  let resolved = 0;
  for (const row of stuck) {
    const processor = processorFor(row.processor);
    if (!processor) continue;

    const result = await processor.verifyTransaction(row.processor_ref);
    if (result.status === "submitted") continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: updated } = await client.query(
        `UPDATE vinkpay_transactions SET status = $1, webhook_received_at = now(), updated_at = now()
         WHERE id = $2 AND webhook_received_at IS NULL RETURNING order_id`,
        [result.status, row.tx_id]
      );
      if (updated.length) {
        if (result.status === "confirmed") {
          await client.query(`UPDATE mkt_orders SET payment_status = 'payment_confirmed', confirmed_at = now() WHERE id = $1`, [row.order_id]);
        } else {
          const { rows: orderRows } = await client.query(`SELECT items FROM mkt_orders WHERE id = $1`, [row.order_id]);
          for (const item of (orderRows[0]?.items ?? []) as { productId: string; quantity: number }[]) {
            await client.query(`UPDATE mkt_products SET stock = stock + $1, total_sold = GREATEST(0, total_sold - $1) WHERE id::text = $2`, [item.quantity, item.productId]);
          }
          await client.query(`UPDATE mkt_orders SET payment_status = 'payment_failed', status = 'payment_failed' WHERE id = $1`, [row.order_id]);
        }
        await client.query("COMMIT");
        emit("vinkpay.payment_status_changed", { orderId: row.order_id, status: result.status });
        resolved++;
      } else {
        await client.query("ROLLBACK");
      }
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[vinkpay] Reconciliation update failed for order", row.order_id, err);
    } finally {
      client.release();
    }
  }

  return { checked: stuck.length, resolved };
}

export function startReconciliationJob(): () => void {
  const interval = setInterval(() => {
    reconcilePendingPayments()
      .then(({ checked, resolved }) => {
        if (checked > 0) console.log(`[vinkpay] Reconciliation: checked ${checked} stuck payment(s), resolved ${resolved}`);
      })
      .catch(err => console.error("[vinkpay] Reconciliation job error:", err));
  }, RECONCILIATION_INTERVAL_MS);
  return () => clearInterval(interval);
}

// --- Queries ----------------------------------------------------------------

export async function getOrderTransactions(orderId: string) {
  if (!hasDb || !pool) return [];
  const { rows } = await pool.query(
    `SELECT id, processor, payment_method, amount, currency, status, processor_ref, error_message, webhook_received_at, created_at
     FROM vinkpay_transactions WHERE order_id = $1 ORDER BY created_at DESC`,
    [orderId]
  );
  return rows;
}

export async function refundOrder(processorName: string, processorRef: string, amount?: number): Promise<RefundResult> {
  const processor = processorFor(processorName);
  if (!processor) return { success: false, error: `Unknown processor: ${processorName}` };
  return processor.refund(processorRef, amount);
}
