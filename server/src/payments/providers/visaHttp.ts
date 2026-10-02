import { generateXPayToken } from "../../services/visaXPayToken.js";

/**
 * Shared plumbing for Visa developer-platform APIs (DPS Card and Account Services, Payment Account Validation, ...).
 *
 * Authentication is pluggable. The OpenAPI exports from the portal have an EMPTY security section, so the scheme is not
 * stated there. The portal lists several (Two-Way SSL, X-Pay Token, OAuth, JWT); X-Pay is the default here because the repo
 * already implements it, but it is UNVERIFIED for each product. Confirm on the product's Authentication page in the portal.
 */

export interface VisaRequest { method: "GET" | "POST" | "PUT"; path: string; query?: string; body?: string }
export interface VisaAuth { headers: Record<string, string>; query?: string }
export type VisaAuthenticator = (req: VisaRequest) => VisaAuth;

/** X-Pay token (API key + shared secret). */
export function xPayAuthenticator(apiKey: string, sharedSecret: string): VisaAuthenticator {
  return (req) => {
    const resourcePath = req.path.replace(/^\//, "");
    const token = generateXPayToken({ method: req.method, resourcePath, extraQueryString: req.query, requestBody: req.body ?? "" }, apiKey, sharedSecret);
    return { headers: { "x-pay-token": token }, query: `apiKey=${apiKey}` + (req.query ? `&${req.query}` : "") };
  };
}

/** Mask anything that looks like a card number (13 to 19 digits, spaces/dashes allowed) so it cannot leak into logs or responses. */
export const redactPan = (text: string): string =>
  text.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m) => "*".repeat(Math.max(0, m.replace(/\D/g, "").length - 4)) + m.replace(/\D/g, "").slice(-4));

export class VisaApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "VisaApiError"; }
}

export class VisaHttp {
  constructor(private readonly o: { baseUrl: string; authenticate: VisaAuthenticator; fetchImpl?: typeof fetch; timeoutMs?: number; label: string }) {
    if (!/^https:\/\//i.test(o.baseUrl)) throw new Error(`${o.label} base URL must be https`);
  }

  async call<T>(req: VisaRequest): Promise<T> {
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
    // Error text is masked, and long ids in the path are collapsed, before it can reach a log or a response.
    if (!res.ok) throw new VisaApiError(`${this.o.label} ${req.method} ${req.path.replace(/\/[a-zA-Z0-9-]{20,}/g, "/{id}")} failed (${res.status}): ${redactPan(text).slice(0, 300)}`, res.status);
    try { return (text ? JSON.parse(text) : {}) as T; } catch { throw new VisaApiError(`${this.o.label} returned a non-JSON response`, res.status); }
  }
}
