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
  /**
   * Verify a webhook from the provider and return its parsed event. Throws on a bad signature.
   * By default a repeated event id also throws (replay). Pass { allowReplay: true } for requests the provider legitimately retries
   * and that the caller makes idempotent itself (real-time authorisations).
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, opts?: { allowReplay?: boolean }): ProviderEvent;
}

export interface ProviderEvent { id: string; type: string; createdAt: string; data: unknown }

/* ───────── Card servicing: looking after cards that already exist (e.g. Visa DPS Card and Account Services) ───────── */

export type ServicedCardStatus = "active" | "frozen" | "blocked";

export interface ServicedCardDetails {
  cardId: string;
  last4: string | null;
  accounts: { accountId: string; accountNumberMasked: string | null; type: string | null }[];
}

/**
 * Servicing is not issuing: the card already exists (made by the programme) and we register it to get a provider card id.
 * registerCard takes a PAN. That is a PCI-scoped value, so it must only be called server-to-server, never stored, never logged,
 * and never from a customer-facing form. Everything after registration uses the card id only.
 */
export interface CardServicingProvider {
  readonly name: string;
  registerCard(input: { primaryAccountNumber: string }): Promise<{ cardId: string }>;
  getCardStatus(cardId: string): Promise<{ status: string; activationStatus?: string }>;
  setCardStatus(cardId: string, status: ServicedCardStatus): Promise<void>;
  getCardDetails(cardId: string): Promise<ServicedCardDetails>;
}

/* ───────── Account validation: is this card real and in good standing? (e.g. Visa Payment Account Validation) ───────── */

export interface AccountValidationRequest {
  /** PCI-scoped. Server-to-server only, never stored or logged. Prefer a provider token reference where the provider supports one. */
  primaryAccountNumber: string;
  /** YYYY-MM */
  expiry: string;
  /** Security code. Never stored or logged; sending it through our servers puts them in PCI scope (see docs/payments/PROVIDERS.md). */
  cvv2?: string;
  postalCode?: string;
  street?: string;
}

export interface AccountValidationResult {
  valid: boolean;
  /** The provider's own result code (Visa: actionCode). */
  actionCode: string;
  /** Provider reference for the check. */
  reference?: string;
  /** Per-check outcomes, as the provider's raw codes. Present only if that check was requested. */
  cvv2Result?: string;
  addressResult?: string;
}

export interface AccountValidationProvider {
  readonly name: string;
  validate(input: AccountValidationRequest): Promise<AccountValidationResult>;
}

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

/* ───────── Card payouts: sending money TO a holder's own debit card (Visa Direct, Mastercard Send) ───────── */

/**
 * A card the holder has registered to receive money. We keep only the provider's token and what is safe to show: brand, last4, expiry and the card's funding type.
 * A cash-out or refund is only ever paid to a verified DEBIT card that belongs to the holder, never to a bank account and never by hand.
 */
export interface PayoutCard {
  token: string;
  last4: string;
  brand: "visa" | "mastercard";
  /** MM/YY */
  expiry: string;
  funding: "debit" | "credit" | "prepaid" | "unknown";
}

/**
 * Turns a card number into a token. The card number is PCI-scoped: it is passed once, server-to-server, never stored, never logged. (Live use needs the processor's
 * hosted card fields so the number never reaches our servers at all; until that exists the endpoint that calls this accepts sandbox test cards only.)
 */
export interface CardVaultProvider {
  readonly name: string;
  tokenise(input: { primaryAccountNumber: string; expiry: string; cardholderName: string }): Promise<PayoutCard>;
}

export type PayoutStatus = "sent" | "declined" | "error";
export interface PayoutResult {
  status: PayoutStatus;
  /** The provider's reference for the transaction, when it gave one. */
  providerRef?: string;
  /** Why it was declined or failed, in words that are safe to show. */
  reason?: string;
}

/**
 * Pushes money to a card. The reference makes the transaction unique: sending the same reference again must not pay twice (the scheme de-duplicates on it),
 * so a retry after an unknown outcome is safe. "error" means the outcome is not known or the provider was unavailable: it is retried, never treated as paid.
 */
export interface CardPayoutProvider {
  readonly name: string;
  push(input: { reference: string; card: { token: string; brand: "visa" | "mastercard" }; amount: Money; recipientName: string; narrative: string }): Promise<PayoutResult>;
}
