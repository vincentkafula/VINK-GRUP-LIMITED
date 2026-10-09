import crypto from "crypto";
import { VisaHttp, VisaApiError, redactPan, type VisaAuthenticator, type VisaTls } from "./visaHttp.js";

/**
 * Visa Direct Account and Wallet (SANDBOX): payouts to a bank account or a mobile-money wallet, written against Visa's OpenAPI reference for that product
 * (server https://sandbox.api.visa.com, paths under /visapayouts/v3).
 *
 *   Send:    POST /visapayouts/v3/payouts            200 PAYMENT_RECEIVED (Visa has the instruction) or 202 PENDING
 *   Query:   GET  /visapayouts/v3/payouts?id=&idType=&initiatingPartyId=
 *   Verify:  POST /visapayouts/v1/extensions/verifyRecipient   (does the account / wallet exist and who owns it)
 *
 * READ BEFORE USING:
 *  - NOT WIRED IN. Nothing in the token system calls this class. VINK's payout rule is "only to the holder's own verified debit card, by the system", and a bank or
 *    wallet destination is a different rule. It must be agreed and recorded before this is connected to cash-outs or refunds.
 *  - Accepted is not delivered. PAYMENT_RECEIVED only means Visa received the instruction; the money reaches the recipient later (bank payouts can take days) and
 *    can still be RETURNED or REJECTED. The final result arrives by Visa's status and return notifications (webhooks) or by Query. A caller must keep the tokens held
 *    until a delivered state, and return them on a failed one: see PayoutOutcome.state.
 *  - Not confirmed by the reference: how the project authenticates (its security section is empty; the plumbing supports X-Pay and two-way SSL), the funding model
 *    (the reference only offers PREFUNDED, so Visa debits a funding account VINK keeps topped up), the country-specific required fields (Visa's Endpoint Guide), and
 *    the wallet operator names for Zambia.
 *  - Nothing here has been run against Visa's sandbox (no credentials).
 */
export type BankTarget = { kind: "bank"; accountName: string; accountNumber: string; accountNumberType: "IBAN" | "DEFAULT"; countryCode: string; currencyCode: string; bankName?: string; bankCode?: string; bankCodeType?: "ABA" | "SORT_CODE" | "DEFAULT"; branchCode?: string; BIC?: string };
export type WalletTarget = { kind: "wallet"; operatorName: string; accountIdentifier: string; accountIdentifierType: "PHONENUMBER" | "EMAIL" | "USERNAME"; countryCode: string; currencyCode: string };
export type AccountWalletTarget = BankTarget | WalletTarget;

/** received = Visa has the instruction; in_flight = on its way; delivered = final success; failed = final failure (the money is not coming); unknown = ask again. */
export type PayoutState = "received" | "in_flight" | "delivered" | "failed" | "unknown";
export interface PayoutOutcome { state: PayoutState; payoutId?: string; status?: string; reason?: string }

export interface VisaPayoutsOptions {
  baseUrl: string; authenticate: VisaAuthenticator; tls?: VisaTls; fetchImpl?: typeof fetch;
  /** Assigned by Visa when the originator is onboarded. */
  initiatingPartyId: number;
  sender: { name: string; country: string; city: string; addressLine1: string; accountNumber?: string };
  businessApplicationId?: string;       // FD = funds disbursement (default)
}

export interface SendInput {
  /** VINK's own unique reference for this payout. The same reference always maps to the same Visa clientReferenceId. */
  reference: string;
  target: AccountWalletTarget;
  amount: { amount: number; currency: string };      // minor units (cents)
  recipient: { firstName: string; lastName: string; country: string; city?: string; addressLine1?: string };
  narrative?: string;
}

const FINAL_OK = new Set(["PAYMENT_DELIVERED", "DELIVERED_TO_RECIPIENT_BANK"]);
const FINAL_BAD = new Set(["RETURNED", "REJECTED", "DECLINED", "FAILED", "CANCELLED", "ERROR", "VALIDATION_FAILED"]);
const MID = new Set(["PAYMENT_SENT", "IN_PROGRESS", "DELIVERED_TO_SCHEME", "AWAITING_INFORMATION", "PENDING_CANCELLATION"]);

/** Visa status -> what the caller should do. Unrecognised statuses are "unknown": never assumed delivered. */
export function stateOfStatus(status: string | undefined): PayoutState {
  if (!status) return "unknown";
  if (FINAL_OK.has(status)) return "delivered";
  if (FINAL_BAD.has(status)) return "failed";
  if (status === "PAYMENT_RECEIVED" || status === "PENDING") return "received";
  return MID.has(status) ? "in_flight" : "unknown";
}

/** clientReferenceId: 1-35 alphanumeric characters, stable for one reference. */
export const clientReferenceOf = (reference: string): string => "VK" + crypto.createHash("sha256").update("vink-payout:" + reference).digest("hex").slice(0, 30);

export class VisaPayouts {
  private readonly http: VisaHttp;
  constructor(private readonly o: VisaPayoutsOptions) {
    if (!Number.isInteger(o.initiatingPartyId) || o.initiatingPartyId <= 0) throw new Error("initiatingPartyId must be the integer Visa assigned");
    if (!o.sender.name || !o.sender.country) throw new Error("the sender name and country are required");
    this.http = new VisaHttp({ baseUrl: o.baseUrl, authenticate: o.authenticate, fetchImpl: o.fetchImpl, label: "Visa Direct Account and Wallet", tls: o.tls });
  }

  private recipientBody(i: SendInput) {
    const r = i.recipient, t = i.target;
    const address = { country: r.country, ...(r.city ? { city: r.city.slice(0, 35) } : {}), ...(r.addressLine1 ? { addressLine1: r.addressLine1.slice(0, 35) } : {}) };
    const base = { type: "I", firstName: r.firstName.slice(0, 35), lastName: r.lastName.slice(0, 35) };
    if (t.kind === "bank") {
      const { kind: _k, ...bank } = t;
      return { ...base, address, bank };
    }
    const { kind: _k, ...wallet } = t;
    return { ...base, wallet };
  }

  async send(i: SendInput): Promise<PayoutOutcome> {
    if (!Number.isInteger(i.amount.amount) || i.amount.amount <= 0) return { state: "failed", reason: "The amount must be above zero" };
    const s = this.o.sender, wallet = i.target.kind === "wallet";
    const clientReferenceId = clientReferenceOf(i.reference);
    const body = {
      payoutMethod: wallet ? "W" : "B",
      transactionDetail: {
        initiatingPartyId: this.o.initiatingPartyId, businessApplicationId: this.o.businessApplicationId ?? "FD", clientReferenceId,
        transactionAmount: Number((i.amount.amount / 100).toFixed(2)), transactionCurrencyCode: i.amount.currency,
        ...(wallet ? { endToEndId: clientReferenceId.slice(0, 35) } : { ...(i.narrative ? { statementNarrative: i.narrative.slice(0, 35) } : {}), senderSourceOfFunds: "01" }),
      },
      senderDetail: { type: "C", name: s.name.slice(0, 70), address: { country: s.country, city: s.city, addressLine1: s.addressLine1 }, ...(!wallet && s.accountNumber ? { senderAccountNumber: s.accountNumber } : {}) },
      recipientDetail: this.recipientBody(i),
    };
    try {
      const r = await this.http.call<{ transactionDetail?: { status?: string; payoutId?: string } }>({ method: "POST", path: "/visapayouts/v3/payouts", body: JSON.stringify(body) });
      const status = r.transactionDetail?.status, payoutId = r.transactionDetail?.payoutId;
      const state = stateOfStatus(status);
      return state === "unknown" ? { state: "unknown", payoutId, status, reason: "Visa gave a result that is not recognised. Ask for its status." } : { state, payoutId, status };
    } catch (e) {
      const err = e as VisaApiError;
      // A rejected request (400 and the like) is about what we sent; another try will not fix it. No answer or a Visa-side failure means the outcome is unknown:
      // ask by clientReferenceId before sending again, never just send again.
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) return { state: "failed", reason: redactPan(err.message).slice(0, 220) };
      return { state: "unknown", reason: "Visa did not answer. Ask for its status before sending again." };
    }
  }

  /** What became of a payout. Pass VINK's reference (the clientReferenceId is derived from it). */
  async query(reference: string): Promise<PayoutOutcome> {
    try {
      const r = await this.http.call<{ transactionDetail?: { status?: string; payoutId?: string } }>({
        method: "GET", path: "/visapayouts/v3/payouts",
        query: `id=${encodeURIComponent(clientReferenceOf(reference))}&idType=CLIENT_REFERENCE_ID&initiatingPartyId=${this.o.initiatingPartyId}`,
      });
      const status = r.transactionDetail?.status;
      return { state: stateOfStatus(status), payoutId: r.transactionDetail?.payoutId, status };
    } catch (e) {
      const err = e as VisaApiError;
      if (err.status === 404) return { state: "unknown", reason: "Visa has no payout with this reference" };
      return { state: "unknown", reason: "Visa did not answer" };
    }
  }

  /** Asks Visa whether the destination exists and, where the operator supports it, who owns it. The raw answer is returned for the caller to judge. */
  async verifyRecipient(a: { reference: string; target: AccountWalletTarget; firstName: string; lastName: string }): Promise<{ completed: boolean; detail: unknown }> {
    const t = a.target, wallet = t.kind === "wallet";
    const { kind: _k, ...dest } = t;
    const body = {
      payoutMethod: wallet ? "W" : "B", initiatingPartyId: this.o.initiatingPartyId, clientVerificationReference: clientReferenceOf("verify:" + a.reference),
      recipientDetail: { type: "I", firstName: a.firstName.slice(0, 35), lastName: a.lastName.slice(0, 35), ...(wallet ? { wallet: dest } : { bank: dest }) },
    };
    const r = await this.http.call<{ verificationStatus?: string; walletVerificationDetail?: unknown; accountVerificationDetail?: unknown }>({ method: "POST", path: "/visapayouts/v1/extensions/verifyRecipient", body: JSON.stringify(body) });
    return { completed: r.verificationStatus === "COMPLETED", detail: r.walletVerificationDetail ?? r.accountVerificationDetail ?? null };
  }
}
