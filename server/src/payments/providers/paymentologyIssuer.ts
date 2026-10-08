import crypto from "crypto";
import type { IssuingProvider, IssuedCard, ProviderEvent } from "./types.js";
import { NotConfiguredError } from "./types.js";
import type { ProviderCredentials } from "../config.js";

/**
 * Paymentology (Banking.Live) issuing adapter: creates virtual cards and changes their status, against the endpoints in Paymentology's public API reference
 * (developer.paymentology.com/bankinglive). Real-time authorisation arrives through the FAST interface (paymentologyFast.ts), not through this class.
 *
 * What is documented and implemented:
 *  - Authentication: a static `X-API-Key` header (the value comes from onboarding).
 *  - Create a customer: POST /pws/v2/pws_create_customer (cu_fname, cu_sname, cu_mobile are required), answer body.customer_id.
 *  - Create a card: POST /pws/v2/pws_create_card/ (card_type 2 = virtual, cu_id, ac_parent_id + ac_name to create the card's own account, image_delivery 3 = JSON with
 *    no image and image_fields / xml_fields "00000", so the card number, the security code and any image are NEVER returned to us). Answer body.token (the card's public
 *    token), body.last_four_digit and body.expiry (MM/YY).
 *  - Set the card status: POST /pws/v2/pws_set_card_status/ (status_nwk 1000 operational, 1005 decline all, 1009 void), answer header.error_id (0 is success).
 *  - Every call carries api_call_unique_identifier (1 to 40 characters). Paymentology returns the original result when the same one is sent again, so a retry never makes
 *    a second card. Error 1066 means the first request is still processing: retry the same call unchanged.
 *
 * What is NOT settled by the documentation, and must be confirmed with Paymentology / in UAT before relying on it:
 *  - The exact paths: the OpenAPI export says /api/v1/pws_create_card and /api/v1/pws_create_customer, the code samples say /pws/v2/... This class follows the samples
 *    (the set-card-status page has the same style) and takes the base URL from SANDBOX_PAYMENTOLOGY_BASE_URL, for example https://uat.banking.live:55555/ppws/api.
 *  - Which card brand a card product issues: the response does not say, so it is configured (SANDBOX_PAYMENTOLOGY_CARD_BRAND).
 *  - Whether the api key is the only authentication in UAT.
 *  - Nothing here has been run against UAT (no credentials). Run it there first.
 */
export interface PaymentologyProgramme {
  clientId: number;
  cardProductId: number;
  /** The card art template name, which the API requires even though no image is returned. */
  imageName: string;
  /** The programme's parent account: a card's own account is created under it. */
  parentAccountId: number;
  /** ISO 4217 numeric code of the account currency. 710 is the South African rand. */
  currencyNumeric: string;
  cardBrand: "visa" | "mastercard";
}

export interface PaymentologyDeps { fetchImpl?: typeof fetch; timeoutMs?: number }

/** What the card's holder is called, and how to reach them, for the customer record Paymentology keeps. */
export interface CardHolder { firstName: string; lastName: string; mobile: string; email?: string }

const STATUS_NWK = { active: "1000", frozen: "1005", blocked: "1009" } as const;

interface Reply { header?: { error_id?: number; error_desc?: string }; body?: Record<string, unknown> }

export class PaymentologyApiError extends Error {
  constructor(message: string, readonly errorId?: number, readonly retry = false) { super(message); this.name = "PaymentologyApiError"; }
}

export class PaymentologyIssuer implements IssuingProvider {
  readonly name = "paymentology";
  constructor(private readonly creds: ProviderCredentials, private readonly programme: PaymentologyProgramme | null = null, private readonly deps: PaymentologyDeps = {}) {}

  private need(): PaymentologyProgramme {
    if (!this.programme) throw new NotConfiguredError("Paymentology card settings are missing: set SANDBOX_PAYMENTOLOGY_CLIENT_ID, _CARD_PRODUCT_ID, _IMAGE_NAME, _PARENT_ACCOUNT_ID and _CARD_BRAND.");
    return this.programme;
  }

  /** One API call. Paymentology answers HTTP 200 even for most failures, so success is header.error_id === 0. */
  private async call(path: string, body: Record<string, unknown>): Promise<Reply> {
    if (!/^https:\/\//i.test(this.creds.baseUrl)) throw new NotConfiguredError("The Paymentology base URL must be https");
    let res: Response;
    try {
      res = await (this.deps.fetchImpl ?? fetch)(`${this.creds.baseUrl.replace(/\/+$/, "")}${path}`, {
        method: "POST", headers: { "content-type": "application/json", "X-API-Key": this.creds.apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(this.deps.timeoutMs ?? 15000),
      });
    } catch (e) { throw new PaymentologyApiError(`Paymentology did not answer: ${e instanceof Error ? e.message.slice(0, 120) : "network error"}`, undefined, true); }
    if (res.status === 404) throw new PaymentologyApiError("Paymentology says this web service does not exist (check the path and the base URL)");
    if (res.status >= 500) throw new PaymentologyApiError(`Paymentology failed (HTTP ${res.status})`, undefined, true);
    let reply: Reply;
    try { reply = (await res.json()) as Reply; } catch { throw new PaymentologyApiError(`Paymentology returned an unreadable answer (HTTP ${res.status})`); }
    const id = reply.header?.error_id;
    if (id !== 0) {
      const desc = String(reply.header?.error_desc ?? "no description").slice(0, 160);
      throw new PaymentologyApiError(`Paymentology refused the request (error ${id ?? "none"}: ${desc})`, id, id === 1066);
    }
    return reply;
  }

  /** The holder is needed to open the customer record; without a mobile number Paymentology cannot create it. */
  async createCard(input: { customerRef: string; kind: "physical" | "virtual"; requestId?: string; holder?: CardHolder }): Promise<IssuedCard> {
    const p = this.need();
    if (input.kind !== "virtual") throw new NotConfiguredError("Only virtual cards are issued through Paymentology so far");
    if (!input.holder?.mobile) throw new PaymentologyApiError("A mobile number is needed to issue a card");
    const rid = (input.requestId ?? crypto.randomUUID()).replace(/[^A-Za-z0-9]/g, "").slice(0, 34);
    const customer = await this.call("/pws/v2/pws_create_customer", {
      api_call_unique_identifier: `vkc${rid}`.slice(0, 40), client_id: p.clientId, cu_fname: input.holder.firstName.slice(0, 500), cu_sname: input.holder.lastName.slice(0, 500),
      cu_mobile: input.holder.mobile, ...(input.holder.email ? { cu_email: input.holder.email.slice(0, 60) } : {}), cu_ref: input.customerRef.slice(0, 50), remarks: "VINK customer",
    });
    const cuId = Number(customer.body?.customer_id);
    if (!Number.isInteger(cuId) || cuId <= 0) throw new PaymentologyApiError("Paymentology did not return the customer id");
    const card = await this.call("/pws/v2/pws_create_card/", {
      api_call_unique_identifier: `vkk${rid}`.slice(0, 40), client_id: p.clientId, card_type: 2, crd_prdct_id: p.cardProductId, cu_id: cuId,
      status_nwk: Number(STATUS_NWK.active), image_name: p.imageName, image_delivery: 3, image_fields: "00000", xml_fields: "00000",
      ac_parent_id: p.parentAccountId, ac_name: `VINK ${input.customerRef}`.slice(0, 50), ac_set_ccy: p.currencyNumeric, ac_bill_ccy: p.currencyNumeric,
      client_card_ref: input.customerRef.slice(0, 100), remarks: "VINK virtual debit card",
    });
    const token = card.body?.token, last4 = String(card.body?.last_four_digit ?? ""), expiry = String(card.body?.expiry ?? "");
    if (token === undefined || token === null || !/^\d{1,19}$/.test(String(token))) throw new PaymentologyApiError("Paymentology did not return the card token");
    if (!/^\d{4}$/.test(last4) || !/^\d\d\/\d\d$/.test(expiry)) throw new PaymentologyApiError("Paymentology did not return the last four digits and the expiry");
    return { providerCardId: String(token), last4, brand: p.cardBrand, expiry, status: "active" };
  }

  async setCardStatus(providerCardId: string, status: "active" | "frozen" | "blocked"): Promise<void> {
    const p = this.need();
    if (!/^\d{1,19}$/.test(providerCardId)) throw new PaymentologyApiError("This is not a Paymentology card token");
    await this.call("/pws/v2/pws_set_card_status/", {
      api_call_unique_identifier: `vks${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 40), client_id: p.clientId, status_nwk: STATUS_NWK[status], token: Number(providerCardId), action: 1, note: `VINK ${status}`.slice(0, 200),
    });
  }

  /** Paymentology does not send signed webhooks to this endpoint: real-time decisions come through FAST (paymentologyFast.ts). */
  verifyWebhook(): ProviderEvent {
    throw new NotConfiguredError("Paymentology sends real-time authorisations to the FAST endpoint (/api/payments/issuer/fast), not to this one.");
  }
}
