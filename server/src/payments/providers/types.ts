/**
 * Provider-agnostic contracts. Application code talks to these, never to a specific vendor, so a provider can be
 * swapped (or a direct acquirer connection added later) by writing one new adapter.
 *
 * Card data rule: PAN, CVV and track data NEVER pass through these interfaces. Adapters only deal in provider
 * tokens plus last4/brand/expiry.
 */

export type Money = { amount: number; currency: string };   // amount in minor units (cents)

/* ───────── Issuing: cards we issue to our customers (e.g. Paymentology) ───────── */

export interface IssuedCard {
  providerCardId: string;       // the provider's token for the card
  last4: string;
  brand: "visa" | "mastercard";
  expiry: string;               // MM/YY
  status: "inactive" | "active" | "frozen" | "blocked";
}

export interface AuthorisationRequest {
  providerCardId: string;
  amount: Money;
  merchantName?: string;
  merchantCategory?: string;
  channel: "chip" | "tap" | "online" | "atm" | "international";
  /** Provider's own id for this authorisation, used for idempotency. */
  authorisationId: string;
}

export interface AuthorisationDecision {
  approved: boolean;
  /** ISO 8583-style reason when declined, e.g. "insufficient_funds", "card_frozen", "limit_exceeded". */
  reason?: string;
}

export interface IssuingProvider {
  readonly name: string;
  createCard(input: { customerRef: string; kind: "physical" | "virtual" }): Promise<IssuedCard>;
  setCardStatus(providerCardId: string, status: "active" | "frozen" | "blocked"): Promise<void>;
  /** Verify a webhook from the provider and return its parsed event. Throws on a bad signature or a replay. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent;
}

export interface ProviderEvent { id: string; type: string; createdAt: string; data: unknown }

/* ───────── Acquiring: taking card payments from customers (a PSP) ───────── */

export type PaymentState = "pending" | "authorized" | "captured" | "settled" | "failed" | "reversed" | "refunded";

export interface PaymentIntent {
  id: string;
  state: PaymentState;
  amount: Money;
  /** Needed to finish 3-D Secure / hosted fields in the browser. */
  clientSecret?: string;
  redirectUrl?: string;
}

export interface AcquiringProvider {
  readonly name: string;
  createIntent(input: { amount: Money; reference: string; idempotencyKey: string }): Promise<PaymentIntent>;
  capture(id: string, amount?: Money): Promise<PaymentIntent>;
  void(id: string): Promise<PaymentIntent>;
  refund(id: string, amount?: Money): Promise<PaymentIntent>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent;
}

export class NotConfiguredError extends Error {
  constructor(what: string) { super(what); this.name = "NotConfiguredError"; }
}
