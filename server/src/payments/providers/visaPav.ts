import crypto from "crypto";
import type { AccountValidationProvider, AccountValidationRequest, AccountValidationResult } from "./types.js";
import { VisaHttp, VisaApiError, type VisaAuthenticator } from "./visaHttp.js";

/**
 * Visa "Payment Account Validation" (sandbox): POST /pav/v1/cardvalidation (JSON), from the OpenAPI export.
 *
 * Things to know before relying on it:
 *  - It is an ACQUIRER API: acquiringBin and acquirerCountryCode are required by the spec, so they come from configuration
 *    and are never invented. We do not have an acquiring BIN of our own (the planned BIN is an ISSUING BIN sponsored by
 *    Paymentology), so production use needs an acquirer partner.
 *  - It takes a PAN, and optionally a CVV2. Sending those through our servers puts them in PCI scope. The spec also supports
 *    paymentCredentialReference (a token reference) instead of a PAN: prefer that for any customer-facing use.
 *  - A result is read as approved when actionCode === "00" (VisaNet "approved"). The code table is on a Visa page that was not
 *    in the exported file, so this is an assumption to confirm.
 *  - cardExpiryDate: the spec text says yymm but its examples and length (7) are "YYYY-MM"; we send YYYY-MM.
 *  - Authentication is the unverified X-Pay default (see visaHttp.ts).
 */

export interface VisaPavOptions {
  baseUrl: string;
  authenticate: VisaAuthenticator;
  acquiringBin: string;                 // 6 to 11 characters
  acquirerCountryCode: string;          // 3-digit ISO numeric, e.g. "710" South Africa, "840" USA
  cardAcceptor: { name: string; idCode: string; terminalId: string };
  fetchImpl?: typeof fetch;
}

const PAN = /^[0-9]{13,19}$/;
const EXPIRY = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** Recommended retrievalReferenceNumber format ydddhhnnnnnn: last digit of year, day of year, hour, 6 digits. */
export function retrievalReference(now = new Date(), nnnnnn = crypto.randomInt(0, 1_000_000)): string {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start) / 86_400_000);
  return `${now.getUTCFullYear() % 10}${String(day).padStart(3, "0")}${String(now.getUTCHours()).padStart(2, "0")}${String(nnnnnn).padStart(6, "0")}`;
}

interface PavResponse { actionCode?: string; responseCode?: string; transactionIdentifier?: string; cvv2ResultCode?: string; addressVerificationResults?: string }

export class VisaPavValidation implements AccountValidationProvider {
  readonly name = "visa_pav";
  private readonly http: VisaHttp;
  constructor(private readonly o: VisaPavOptions) {
    if (o.acquiringBin.length < 6 || o.acquiringBin.length > 11) throw new Error("acquiringBin must be 6 to 11 characters");
    if (!/^[0-9]{3}$/.test(o.acquirerCountryCode)) throw new Error("acquirerCountryCode must be a 3-digit ISO numeric code");
    this.http = new VisaHttp({ baseUrl: o.baseUrl, authenticate: o.authenticate, fetchImpl: o.fetchImpl, label: "Visa PAV" });
  }

  async validate(input: AccountValidationRequest): Promise<AccountValidationResult> {
    if (!PAN.test(input.primaryAccountNumber)) throw new VisaApiError("primaryAccountNumber must be 13 to 19 digits");
    if (!EXPIRY.test(input.expiry)) throw new VisaApiError("expiry must be YYYY-MM");
    if (input.cvv2 !== undefined && !/^[0-9]{3,4}$/.test(input.cvv2)) throw new VisaApiError("cvv2 must be 3 or 4 digits");
    const now = new Date();
    const body: Record<string, unknown> = {
      systemsTraceAuditNumber: crypto.randomInt(100000, 1_000_000),
      retrievalReferenceNumber: retrievalReference(now),
      primaryAccountNumber: input.primaryAccountNumber,
      cardExpiryDate: input.expiry,
      acquiringBin: this.o.acquiringBin,
      acquirerCountryCode: this.o.acquirerCountryCode,
      cardAcceptor: { name: this.o.cardAcceptor.name.slice(0, 25), idCode: this.o.cardAcceptor.idCode.slice(0, 15), terminalId: this.o.cardAcceptor.terminalId.slice(0, 8) },
    };
    if (input.cvv2) body.cardCvv2Value = input.cvv2;
    if (input.postalCode) body.addressVerificationResults = { postalCode: input.postalCode, ...(input.street ? { street: input.street.slice(0, 40) } : {}) };

    const r = await this.http.call<PavResponse>({ method: "POST", path: "/pav/v1/cardvalidation", body: JSON.stringify(body) });
    if (!r.actionCode) throw new VisaApiError("Visa PAV returned no actionCode");
    return { valid: r.actionCode === "00", actionCode: r.actionCode, reference: r.transactionIdentifier, cvv2Result: r.cvv2ResultCode, addressResult: r.addressVerificationResults };
  }
}
