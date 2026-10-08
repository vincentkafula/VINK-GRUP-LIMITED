import crypto from "crypto";
import type { CardVaultProvider, CardPayoutProvider, PayoutCard, PayoutResult } from "./types.js";
import { VisaHttp, VisaApiError, redactPan, type VisaAuthenticator, type VisaTls } from "./visaHttp.js";
import { MOCK_CARD_SCENARIOS, luhnValid, brandOf, expiryOf } from "./mockCardRail.js";

/**
 * Visa Direct "Funds Transfer: push funds to a card" (SANDBOX): POST /visadirect/fundstransfer/v1/pushfundstransactions.
 * This is the "original credit transaction" that puts money on a Visa debit card, which is how a cash-out or refund reaches the holder's own card.
 *
 * Read before relying on it:
 *  - The request follows Visa's published Funds Transfer push API. It has NOT yet been run against the sandbox (no credentials here), so the field names and the
 *    action-code table are the things to confirm first. providers/visaDirect.sandbox.test.ts runs it against the real sandbox when the credentials are set.
 *  - It is an ORIGINATOR API: acquiringBin, acquirerCountryCode and the sender's account come from configuration and are never invented. VINK's planned BIN is an
 *    ISSUING BIN sponsored by Paymentology, so production use needs an originating partner. Live mode refuses to start with this provider.
 *  - Visa Direct takes the recipient's card NUMBER. The sandbox vault below therefore keeps the number inside an encrypted token, and ONLY for the published test cards.
 *    Real cards cannot be used: the token step refuses anything that is not a known test number. Production needs the processor's tokenised push instead.
 *  - The reference makes the transaction unique: retrievalReferenceNumber and systemsTraceAuditNumber are derived from it, so a retry after an unknown outcome
 *    sends the SAME transaction and the scheme de-duplicates it, rather than paying twice.
 *  - Authentication is the same pluggable Visa auth as the other adapters (X-Pay or two-way SSL), see visaHttp.ts.
 */

/** Sandbox-only vault: the card number is sealed (AES-256-GCM) inside the token it returns. Only published test numbers are accepted. */
export class SandboxPanVault implements CardVaultProvider {
  readonly name = "sandbox_vault";
  private readonly key: Buffer;
  private readonly allowed: Set<string>;
  constructor(secret: string, extraTestPans: string[] = []) {
    if (secret.length < 16) throw new Error("SANDBOX_CARD_VAULT_KEY must be at least 16 characters");
    this.key = crypto.createHash("sha256").update("vink-sandbox-vault:" + secret).digest();
    this.allowed = new Set([...MOCK_CARD_SCENARIOS.map((c) => c.pan), ...extraTestPans]);
  }
  async tokenise(input: { primaryAccountNumber: string; expiry: string; cardholderName: string }): Promise<PayoutCard> {
    const pan = input.primaryAccountNumber, brand = brandOf(pan);
    if (!luhnValid(pan) || !brand) throw new Error("That is not a valid Visa or Mastercard number");
    if (!this.allowed.has(pan)) throw new Error("Only sandbox test cards can be used here");
    const expiry = expiryOf(input.expiry);
    if (!expiry) throw new Error("The card has expired or the expiry date is not valid");
    const scenario = MOCK_CARD_SCENARIOS.find((c) => c.pan === pan)?.scenario;
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const sealed = Buffer.concat([c.update(pan, "utf8"), c.final()]);
    return { token: `vault1:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${sealed.toString("base64url")}`, last4: pan.slice(-4), brand, expiry, funding: scenario === "credit" ? "credit" : scenario === "prepaid" ? "prepaid" : "debit" };
  }
  /** The card number behind a token. Used only to build the Visa request, in memory, and never logged. */
  reveal(token: string): string {
    const [tag, iv, auth, sealed] = token.split(":");
    if (tag !== "vault1" || !iv || !auth || !sealed) throw new Error("This card token is not from the sandbox vault");
    const d = crypto.createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(auth, "base64url"));
    return Buffer.concat([d.update(Buffer.from(sealed, "base64url")), d.final()]).toString("utf8");
  }
}

export interface VisaDirectOptions {
  baseUrl: string;
  authenticate: VisaAuthenticator;
  tls?: VisaTls;
  fetchImpl?: typeof fetch;
  vault: SandboxPanVault;
  acquiringBin: string;                       // 6 to 11 characters
  acquirerCountryCode: string;                // 3-digit ISO numeric
  sender: { accountNumber: string; name: string; countryCode: string; city?: string; address?: string };
  cardAcceptor: { name: string; idCode: string; terminalId: string; city: string; country: string };
  merchantCategoryCode?: string;              // 6012 financial institutions (default)
  businessApplicationId?: string;             // FD = funds disbursement (default)
  sourceOfFundsCode?: string;                 // 05 = debit account (default)
  now?: () => Date;
}

interface PushResponse { transactionIdentifier?: number | string; actionCode?: string; responseCode?: string; approvalCode?: string }

/** Visa action codes that mean the card or issuer said no: retrying will not help. Anything else that is not "00" is treated as "outcome unknown", and retried. */
const DECLINE_ACTION_CODES = new Set(["05", "13", "14", "15", "41", "43", "51", "54", "57", "61", "62", "63", "65", "78", "93"]);

const digitsFrom = (reference: string, length: number, salt: string) => {
  const n = BigInt("0x" + crypto.createHash("sha256").update(salt + reference).digest("hex").slice(0, 16)) % (10n ** BigInt(length));
  return n.toString().padStart(length, "0");
};
const localDateTime = (d: Date) => d.toISOString().slice(0, 19);

export class VisaDirectPayout implements CardPayoutProvider {
  readonly name = "visa_direct";
  private readonly http: VisaHttp;
  constructor(private readonly o: VisaDirectOptions) {
    if (o.acquiringBin.length < 6 || o.acquiringBin.length > 11) throw new Error("acquiringBin must be 6 to 11 characters");
    if (!/^[0-9]{3}$/.test(o.acquirerCountryCode)) throw new Error("acquirerCountryCode must be a 3-digit ISO numeric code");
    if (!o.sender.accountNumber || !o.sender.name) throw new Error("the sender account and name are required");
    this.http = new VisaHttp({ baseUrl: o.baseUrl, authenticate: o.authenticate, fetchImpl: o.fetchImpl, label: "Visa Direct", tls: o.tls });
  }

  async push(i: { reference: string; card: { token: string; brand: "visa" | "mastercard" }; amount: { amount: number; currency: string }; recipientName: string; narrative: string }): Promise<PayoutResult> {
    if (i.card.brand !== "visa") return { status: "declined", reason: "Visa Direct pays Visa cards. Mastercard cards are paid through Mastercard Send." };
    if (!Number.isInteger(i.amount.amount) || i.amount.amount <= 0) return { status: "declined", reason: "The amount must be above zero" };
    let pan: string;
    try { pan = this.o.vault.reveal(i.card.token); } catch { return { status: "declined", reason: "This card is not registered with the sandbox vault" }; }
    const a = this.o.cardAcceptor, s = this.o.sender;
    const body = {
      amount: (i.amount.amount / 100).toFixed(2),
      localTransactionDateTime: localDateTime((this.o.now ?? (() => new Date()))()),
      retrievalReferenceNumber: digitsFrom(i.reference, 12, "rrn"),
      systemsTraceAuditNumber: String(Math.max(1, Number(digitsFrom(i.reference, 6, "stan")))).padStart(6, "0"),
      acquirerCountryCode: this.o.acquirerCountryCode,
      acquiringBin: this.o.acquiringBin,
      businessApplicationId: this.o.businessApplicationId ?? "FD",
      cardAcceptor: { name: a.name.slice(0, 25), idCode: a.idCode.slice(0, 15), terminalId: a.terminalId.slice(0, 8), address: { city: a.city.slice(0, 13), country: a.country } },
      merchantCategoryCode: this.o.merchantCategoryCode ?? "6012",
      recipientName: i.recipientName.slice(0, 30),
      recipientPrimaryAccountNumber: pan,
      senderAccountNumber: s.accountNumber,
      senderName: s.name.slice(0, 30),
      senderCountryCode: s.countryCode,
      ...(s.city ? { senderCity: s.city.slice(0, 25) } : {}),
      ...(s.address ? { senderAddress: s.address.slice(0, 35) } : {}),
      sourceOfFundsCode: this.o.sourceOfFundsCode ?? "05",
      transactionCurrencyCode: i.amount.currency,
      transactionIdentifier: digitsFrom(i.reference, 15, "txid"),
    };
    let r: PushResponse;
    try {
      r = await this.http.call<PushResponse>({ method: "POST", path: "/visadirect/fundstransfer/v1/pushfundstransactions", body: JSON.stringify(body) });
    } catch (e) {
      const err = e as VisaApiError;
      // A rejected request (4xx) is a problem with what we sent, which another try will not fix. No answer, or a Visa-side failure, is an unknown outcome.
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) return { status: "declined", reason: redactPan(err.message).slice(0, 200) };
      return { status: "error", reason: "Visa Direct did not answer. It will be tried again." };
    }
    const ref = r.transactionIdentifier !== undefined ? String(r.transactionIdentifier) : undefined;
    if (r.actionCode === "00") return { status: "sent", providerRef: ref };
    if (r.actionCode && DECLINE_ACTION_CODES.has(r.actionCode)) return { status: "declined", providerRef: ref, reason: `The card issuer declined the payment (code ${r.actionCode})` };
    return { status: "error", providerRef: ref, reason: `The result was not final (code ${r.actionCode ?? "none"}). It will be tried again.` };
  }
}
