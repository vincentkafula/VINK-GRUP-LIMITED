import type { CardServicingProvider, ServicedCardDetails, ServicedCardStatus } from "./types.js";
import { NotConfiguredError } from "./types.js";
import { VisaHttp, VisaApiError, xPayAuthenticator, redactPan, type VisaAuthenticator, type VisaTls } from "./visaHttp.js";

/**
 * Visa "DPS Card and Account Services" (sandbox) client.
 *
 * Paths, methods and bodies come from the OpenAPI file exported from the Visa Developer portal (server
 * https://sandbox.api.visa.com). What the spec does NOT say: the authentication scheme (see visaHttp.ts: X-Pay is the
 * UNVERIFIED default) and Message Level Encryption details. The spec says PIN set/change require MLE; those calls are not
 * implemented (and PINs should not pass through our servers anyway).
 *
 * Card numbers: registerCard() sends a PAN. It is never logged or stored, and error text has card-number-like digit runs
 * masked before it can reach a log or a response.
 */

export { xPayAuthenticator, redactPan };
export { VisaApiError as VisaDpsError };

export interface VisaDpsOptions {
  baseUrl: string;
  /** "debit" cards use status codes like LK-LOCKED_BY_CARDHOLDER; "prepaid" use ACTIVE / SUSPENDED / LOST_CARD / STOLEN_CARD. */
  programType: "debit" | "prepaid";
  authenticate: VisaAuthenticator;
  /** Client certificate, for two-way SSL. */
  tls?: VisaTls;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Status values from the spec's UpdateCardStatusRequest enumeration. */
export const DPS_STATUS: Record<"debit" | "prepaid", Record<ServicedCardStatus, string>> = {
  debit: { active: "__-UNLOCK_BY_CARDHOLDER", frozen: "LK-LOCKED_BY_CARDHOLDER", blocked: "ND-LOST/STOLEN_CARD_(NO_CARD_PICK_UP)" },
  prepaid: { active: "ACTIVE", frozen: "SUSPENDED", blocked: "STOLEN_CARD" },
};

const CARD_ID = /^[a-zA-Z0-9-]{1,40}$/;
const PAN = /^[0-9]{16,19}$/;

export class VisaDpsServicing implements CardServicingProvider {
  readonly name = "visa_dps";
  private readonly http: VisaHttp;
  constructor(private readonly o: VisaDpsOptions) {
    this.http = new VisaHttp({ baseUrl: o.baseUrl, authenticate: o.authenticate, fetchImpl: o.fetchImpl, timeoutMs: o.timeoutMs, label: "Visa DPS", tls: o.tls });
  }

  private cardId(id: string): string {
    if (!CARD_ID.test(id)) throw new VisaApiError("invalid card id");
    return id;
  }

  async registerCard({ primaryAccountNumber }: { primaryAccountNumber: string }): Promise<{ cardId: string }> {
    if (!PAN.test(primaryAccountNumber)) throw new VisaApiError("primaryAccountNumber must be 16 to 19 digits");
    const r = await this.http.call<{ resource?: { cardId?: string } }>({ method: "POST", path: "/dcas/cardservices/v2/cards", body: JSON.stringify({ primaryAccountNumber }) });
    const cardId = r.resource?.cardId;
    if (!cardId) throw new VisaApiError("Visa DPS did not return a card id");
    return { cardId };
  }

  async getCardStatus(cardId: string): Promise<{ status: string; activationStatus?: string }> {
    if (this.o.programType === "prepaid") {
      const r = await this.http.call<{ resource?: { status?: string } }>({ method: "GET", path: `/dcas/cardservices/v1/cards/prepaid/${this.cardId(cardId)}/cardstatus` });
      return { status: r.resource?.status ?? "" };
    }
    const r = await this.http.call<{ resource?: { status?: string; activationStatus?: string } }>({ method: "GET", path: `/dcas/cardservices/v2/cards/${this.cardId(cardId)}/cardstatus` });
    return { status: r.resource?.status ?? "", activationStatus: r.resource?.activationStatus };
  }

  async setCardStatus(cardId: string, status: ServicedCardStatus): Promise<void> {
    const value = DPS_STATUS[this.o.programType][status];
    await this.http.call({ method: "PUT", path: `/dcas/cardservices/v2/cards/${this.cardId(cardId)}/cardstatus`, body: JSON.stringify({ status: value }) });
  }

  async getCardDetails(cardId: string): Promise<ServicedCardDetails> {
    const r = await this.http.call<{ resource?: { cardId?: string; last4PrimaryAccountNumber?: string; accounts?: { accountId?: string; accountNumber?: string; accountTypeDescription?: string }[] } }>({
      method: "GET", path: `/dcas/cardservices/v2/cards/${this.cardId(cardId)}`,
    });
    const x = r.resource ?? {};
    return {
      cardId: x.cardId ?? cardId,
      last4: x.last4PrimaryAccountNumber ?? null,
      accounts: (x.accounts ?? []).map((a) => ({ accountId: a.accountId ?? "", accountNumberMasked: a.accountNumber ? `••••${a.accountNumber.slice(-4)}` : null, type: a.accountTypeDescription ?? null })),
    };
  }

  /** Not implemented on purpose: the spec requires Message Level Encryption for PIN calls, and PINs must not pass through our servers. */
  async setPin(): Promise<never> { throw new NotConfiguredError("PIN management needs Message Level Encryption and is deliberately not implemented here."); }
}
