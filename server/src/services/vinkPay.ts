import { randomUUID } from "crypto";
import { pool, hasDb } from "../db/pool.js";
import { visaXPayRequest } from "./visaXPayToken.js";
import { mastercardRequest, isConfigured as mastercardConfigured } from "./mastercardClient.js";

/**
 * VinkPay -- VINK's own payment processing engine.
 *
 * This is the single interface the rest of the platform calls to charge an
 * order. It does not know or care which licensed processor is actually
 * doing the work underneath -- that's the point. Swap Visa for a different
 * card processor, or Mastercard Open Banking for a different bank-linking
 * provider, and nothing outside this file needs to change.
 *
 * Routing: 'card' payment method -> Visa (DPS card processing, via the
 * X-Pay Token integration). 'bank_transfer' -> Mastercard (Open Banking
 * account-linked payment initiation).
 *
 * IMPORTANT -- honest about what's real and what isn't yet:
 * The Visa and Mastercard client libraries underneath this (auth, request
 * signing, encryption) were built and verified earlier this session,
 * including real end-to-end tests with actual credentials. What has NOT
 * been verified is the exact endpoint path and payload shape for actually
 * *charging a card* via Visa DPS, or *initiating a payment* via Mastercard
 * Open Banking -- those require the specific API Reference documentation
 * for your onboarded DPS product and Mastercard Open Banking's Pay use
 * case, which weren't provided. The paths used below are structured
 * correctly (method, auth, general shape) but are marked clearly in code
 * comments as needing confirmation against your actual API Reference
 * before this handles real money.
 */

export interface ChargeRequest {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  paymentMethod: "card" | "bank_transfer";
  customerEmail: string;
  /** Card details or bank-link token -- shape depends on paymentMethod.
   *  Never logged, never persisted beyond what the processor itself needs. */
  paymentDetails?: Record<string, unknown>;
}

export interface ChargeResult {
  success: boolean;
  status: "confirmed" | "pending" | "failed";
  processor: "visa" | "mastercard";
  processorRef?: string;
  error?: string;
}

interface PaymentProcessor {
  name: "visa" | "mastercard";
  isConfigured(): boolean;
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

// --- Visa processor (card payments via DPS) ---------------------------------
const visaProcessor: PaymentProcessor = {
  name: "visa",
  isConfigured: () => Boolean(process.env.VISA_API_KEY && process.env.VISA_SHARED_SECRET),
  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const apiKey = process.env.VISA_API_KEY ?? "";
    const sharedSecret = process.env.VISA_SHARED_SECRET ?? "";
    try {
      // NOT YET CONFIRMED against your actual DPS Card Transactions API
      // Reference -- this path and payload shape are structured to match
      // the general pattern of Visa's other X-Pay Token endpoints, but
      // your specific onboarded product's real resourcePath and required
      // fields need verifying against developer.visa.com's API Reference
      // for "Card Transactions" before this is trusted with real charges.
      const data = await visaXPayRequest<{ transactionId?: string; responseCode?: string }>({
        baseUrl: process.env.VISA_API_BASE_URL ?? "https://sandbox.api.visa.com",
        method: "POST",
        resourcePath: "dpscardandaccountservices/v1/transactions",
        apiKey,
        sharedSecret,
        body: {
          amount: req.amount,
          currency: req.currency,
          orderReference: req.orderNumber,
          ...req.paymentDetails,
        },
      });

      const approved = data.responseCode === "00" || data.responseCode === undefined;
      return {
        success: approved,
        status: approved ? "confirmed" : "failed",
        processor: "visa",
        processorRef: data.transactionId,
        error: approved ? undefined : `Visa declined (response code: ${data.responseCode})`,
      };
    } catch (err) {
      return { success: false, status: "failed", processor: "visa", error: err instanceof Error ? err.message : "Visa charge failed" };
    }
  },
};

// --- Mastercard processor (bank-linked payments via Open Banking) ----------
const mastercardProcessor: PaymentProcessor = {
  name: "mastercard",
  isConfigured: () => mastercardConfigured(),
  async charge(req: ChargeRequest): Promise<ChargeResult> {
    try {
      // NOT YET CONFIRMED against Mastercard Open Banking's actual "Pay"
      // API Reference -- same caveat as the Visa path above. This needs
      // a linked account/customer ID (from the account-link flow built
      // earlier) as part of paymentDetails before it can work for real.
      const data = await mastercardRequest<{ paymentId?: string; status?: string }>({
        method: "POST",
        path: "/payments/v1/transfers",
        body: {
          amount: req.amount,
          currency: req.currency,
          reference: req.orderNumber,
          ...req.paymentDetails,
        },
      });

      const confirmed = data.status === "completed";
      return {
        success: confirmed,
        status: confirmed ? "confirmed" : "pending",
        processor: "mastercard",
        processorRef: data.paymentId,
      };
    } catch (err) {
      return { success: false, status: "failed", processor: "mastercard", error: err instanceof Error ? err.message : "Mastercard charge failed" };
    }
  },
};

const PROCESSORS: Record<ChargeRequest["paymentMethod"], PaymentProcessor> = {
  card: visaProcessor,
  bank_transfer: mastercardProcessor,
};

/** Records every charge attempt in the ledger, regardless of outcome. */
async function recordTransaction(req: ChargeRequest, result: ChargeResult): Promise<void> {
  if (!hasDb || !pool) return;
  await pool.query(
    `INSERT INTO vinkpay_transactions (id, order_id, order_number, processor, payment_method, amount, currency, status, processor_ref, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [randomUUID(), req.orderId, req.orderNumber, result.processor, req.paymentMethod, req.amount, req.currency, result.status, result.processorRef ?? null, result.error ?? null]
  );
}

/**
 * The single entry point the rest of the platform should call to charge an
 * order. Picks the right processor based on payment method, calls it,
 * records the attempt in the ledger regardless of outcome, and returns a
 * result the caller can act on (update order status, trigger a retry, etc).
 */
export async function chargeOrder(req: ChargeRequest): Promise<ChargeResult> {
  const processor = PROCESSORS[req.paymentMethod];
  if (!processor) {
    return { success: false, status: "failed", processor: "visa", error: `No processor configured for payment method: ${req.paymentMethod}` };
  }
  if (!processor.isConfigured()) {
    const result: ChargeResult = { success: false, status: "failed", processor: processor.name, error: `${processor.name} is not configured -- set its credentials in Railway's environment variables.` };
    await recordTransaction(req, result);
    return result;
  }

  const result = await processor.charge(req);
  await recordTransaction(req, result);
  return result;
}

/** Fetches the VinkPay transaction history for a specific order. */
export async function getOrderTransactions(orderId: string) {
  if (!hasDb || !pool) return [];
  const { rows } = await pool.query(
    `SELECT id, processor, payment_method, amount, currency, status, processor_ref, error_message, created_at
     FROM vinkpay_transactions WHERE order_id = $1 ORDER BY created_at DESC`,
    [orderId]
  );
  return rows;
}
