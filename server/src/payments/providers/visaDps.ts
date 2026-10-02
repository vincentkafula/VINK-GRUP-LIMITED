import type { CardServicingProvider, ServicedCardDetails, ServicedCardStatus } from "./types.js";
import { NotConfiguredError } from "./types.js";
import { generateXPayToken } from "../../services/visaXPayToken.js";

/**
 * Visa "DPS Card and Account Services" (sandbox) client.
 *
 * Paths, methods and bodies come from the OpenAPI file exported from the Visa Developer portal (api_reference.json,
 * server https://sandbox.api.visa.com). What the spec does NOT say:
 *   - the authentication scheme (its `security` section is empty). Visa's X-Pay token is the default here because the
 *     rest of this repo already uses it, but it is UNVERIFIED for this product: confirm in the portal's Authentication
 *     page and, if it differs (for example mutual TLS), pass a different `authenticate` function.
 *   - Message Level Encryption details. The spec says PIN set/change require MLE; those calls are not implemented
 *     (and PINs should not pass through our servers anyway).
 *
 * Card numbers: registerCard() sends a PAN. It is never logged, never stored, and any error text has card-number-like
 * digit runs masked before it can reach a log or a response.
 */

export interface DpsRequest { method: "GET" | "POST" | "PUT"; path: string; query?: string; body?: string }
export interface DpsAuth { headers: Record<string, string>; query?: string }
export type DpsAuthenticator = (req: DpsRequest) => DpsAuth;

export interface VisaDpsOptions {
  baseUrl: string;
  /** "debit" cards use status codes like LK-LOCKED_BY_CARDHOLDER; "prepaid" use ACTIVE / SUSPENDED / LOST_CARD / STOLEN_CARD. */
  programType: "debit" | "prepaid";
  authenticate: DpsAuthenticator;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Default authenticator: X-Pay token (API key + shared secret). See the caveat above. */
export function xPayAuthenticator(apiKey: string, sharedSecret: string): DpsAuthenticator {
  return (req) => {
    const resourcePath = req.path.replace(/^\//, "");
    const token = generateXPayToken({ method: req.method, resourcePath, extraQueryString: req.query, requestBody: req.body ?? "" }, apiKey, sharedSecret);
    return { headers: { "x-pay-token": token }, query: `apiKey=${apiKey}` + (req.query ? `&${req.query}` : "") };
  };
}

/** Status values from the spec's UpdateCardStatusRequest enumeration. */
export const DPS_STATUS: Record<"debit" | "prepaid", Record<ServicedCardStatus, string>> = {
  debit: { active: "__-UNLOCK_BY_CARDHOLDER", frozen: "LK-LOCKED_BY_CARDHOLDER", blocked: "ND-LOST/STOLEN_CARD_(NO_CARD_PICK_UP)" },
  prepaid: { active: "ACTIVE", frozen: "SUSPENDED", blocked: "STOLEN_CARD" },
};

/** Mask anything that looks like a card number (13 to 19 digits, spaces/dashes allowed) so it cannot leak into logs. */
export const redactPan = (text: string): string => text.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m) => "*".repeat(Math.max(0, m.replace(/\D/g, "").length - 4)) + m.replace(/\D/g, "").slice(-4));

const CARD_ID = /^[a-zA-Z0-9-]{1,40}$/;
const PAN = /^[0-9]{16,19}$/;

export class VisaDpsError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "VisaDpsError"; }
}

export class VisaDpsServicing implements CardServicingProvider {
  readonly name = "visa_dps";
  constructor(private readonly o: VisaDpsOptions) {
    if (!/^https:\/\//i.test(o.baseUrl)) throw new Error("Visa DPS base URL must be https");
  }

  private async call<T>(req: DpsRequest): Promise<T> {
    const auth = this.o.authenticate(req);
    const query = auth.query ?? req.query;
    const url = `${this.o.baseUrl}${req.path}${query ? `?${query}` : ""}`;
    const res = await (this.o.fetchImpl ?? fetch)(url, {
      method: req.method,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...auth.headers },
      body: req.body,
      signal: AbortSignal.timeout(this.o.timeoutMs ?? 15000),
    });
    const text = await res.text();
    if (!res.ok) throw new VisaDpsError(`Visa DPS ${req.method} ${req.path.replace(/\/[a-zA-Z0-9-]{20,}/g, "/{id}")} failed (${res.status}): ${redactPan(text).slice(0, 300)}`, res.status);
    try { return (text ? JSON.parse(text) : {}) as T; } catch { throw new VisaDpsError("Visa DPS returned a non-JSON response", res.status); }
  }

  private cardId(id: string): string {
    if (!CARD_ID.test(id)) throw new VisaDpsError("invalid card id");
    return id;
  }

  async registerCard({ primaryAccountNumber }: { primaryAccountNumber: string }): Promise<{ cardId: string }> {
    if (!PAN.test(primaryAccountNumber)) throw new VisaDpsError("primaryAccountNumber must be 16 to 19 digits");
    const r = await this.call<{ resource?: { cardId?: string } }>({ method: "POST", path: "/dcas/cardservices/v2/cards", body: JSON.stringify({ primaryAccountNumber }) });
    const cardId = r.resource?.cardId;
    if (!cardId) throw new VisaDpsError("Visa DPS did not return a card id");
    return { cardId };
  }

  async getCardStatus(cardId: string): Promise<{ status: string; activationStatus?: string }> {
    if (this.o.programType === "prepaid") {
      const r = await this.call<{ resource?: { status?: string } }>({ method: "GET", path: `/dcas/cardservices/v1/cards/prepaid/${this.cardId(cardId)}/cardstatus` });
      return { status: r.resource?.status ?? "" };
    }
    const r = await this.call<{ resource?: { status?: string; activationStatus?: string } }>({ method: "GET", path: `/dcas/cardservices/v2/cards/${this.cardId(cardId)}/cardstatus` });
    return { status: r.resource?.status ?? "", activationStatus: r.resource?.activationStatus };
  }

  async setCardStatus(cardId: string, status: ServicedCardStatus): Promise<void> {
    const value = DPS_STATUS[this.o.programType][status];
    await this.call({ method: "PUT", path: `/dcas/cardservices/v2/cards/${this.cardId(cardId)}/cardstatus`, body: JSON.stringify({ status: value }) });
  }

  async getCardDetails(cardId: string): Promise<ServicedCardDetails> {
    const r = await this.call<{ resource?: { cardId?: string; last4PrimaryAccountNumber?: string; accounts?: { accountId?: string; accountNumber?: string; accountTypeDescription?: string }[] } }>({
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
