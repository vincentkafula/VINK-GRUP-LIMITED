import https from "https";
import { generateXPayToken } from "../../services/visaXPayToken.js";

/**
 * Shared plumbing for Visa developer-platform APIs (DPS Card and Account Services, Payment Account Validation, ...).
 *
 * Authentication is pluggable. The OpenAPI exports from the portal have an EMPTY security section, so the scheme is not
 * stated there. The portal lists several (Two-Way SSL, X-Pay Token, OAuth, JWT). Which one each product wants must be
 * confirmed on the product's Authentication page; X-Pay and Two-Way SSL are implemented here.
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

/**
 * Two-Way (mutual) SSL: the client certificate is presented in the TLS handshake (see VisaTls); the API key rides in the query
 * string and, if the project has an active "user", HTTP Basic credentials are added. Whether a given product also wants Basic
 * auth is something to confirm in the portal (the Users section of the project).
 */
export function twoWayAuthenticator(apiKey: string, basic?: { userId: string; password: string }): VisaAuthenticator {
  return (req) => ({
    headers: basic ? { Authorization: "Basic " + Buffer.from(`${basic.userId}:${basic.password}`).toString("base64") } : ({} as Record<string, string>),
    query: `apiKey=${apiKey}` + (req.query ? `&${req.query}` : ""),
  });
}

/** Client certificate material for two-way SSL (PEM). `ca` is only needed if Visa's server certificate is not signed by a public CA. */
export interface VisaTls { cert: string | Buffer; key: string | Buffer; ca?: string | Buffer }

/** Mask anything that looks like a card number (13 to 19 digits, spaces/dashes allowed) so it cannot leak into logs or responses. */
export const redactPan = (text: string): string =>
  text.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m) => "*".repeat(Math.max(0, m.replace(/\D/g, "").length - 4)) + m.replace(/\D/g, "").slice(-4));

export class VisaApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "VisaApiError"; }
}

export class VisaHttp {
  constructor(private readonly o: { baseUrl: string; authenticate: VisaAuthenticator; fetchImpl?: typeof fetch; timeoutMs?: number; label: string; tls?: VisaTls }) {
    if (!/^https:\/\//i.test(o.baseUrl)) throw new Error(`${o.label} base URL must be https`);
  }

  async call<T>(req: VisaRequest): Promise<T> {
    const auth = this.o.authenticate(req);
    const query = auth.query ?? req.query;
    const url = `${this.o.baseUrl}${req.path}${query ? `?${query}` : ""}`;
    const headers = { "Content-Type": "application/json", Accept: "application/json", ...auth.headers };

    let status: number, text: string;
    if (this.o.tls && !this.o.fetchImpl) {
      ({ status, text } = await this.mutualTls(url, req.method, headers, req.body));
    } else {
      const res = await (this.o.fetchImpl ?? fetch)(url, { method: req.method, headers, body: req.body, signal: AbortSignal.timeout(this.o.timeoutMs ?? 15000) });
      status = res.status;
      text = await res.text();
    }

    // Error text is masked, and long ids in the path are collapsed, before it can reach a log or a response.
    if (status < 200 || status >= 300) {
      const path = req.path.replace(/\/[a-zA-Z0-9-]{20,}/g, "/{id}");
      throw new VisaApiError(`${this.o.label} ${req.method} ${path} failed (${status}): ${redactPan(text).slice(0, 300)}`, status);
    }
    try { return (text ? JSON.parse(text) : {}) as T; } catch { throw new VisaApiError(`${this.o.label} returned a non-JSON response`, status); }
  }

  /** node:https request that presents the client certificate. The server certificate is always verified. */
  private mutualTls(url: string, method: string, headers: Record<string, string>, body?: string): Promise<{ status: number; text: string }> {
    const { cert, key, ca } = this.o.tls!;
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method, cert, key, ...(ca ? { ca } : {}), rejectUnauthorized: true, timeout: this.o.timeoutMs ?? 15000,
        headers: { ...headers, ...(body ? { "Content-Length": String(Buffer.byteLength(body)) } : {}) },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("timeout", () => req.destroy(new Error("request timed out")));
      req.on("error", (e) => reject(new VisaApiError(`${this.o.label} connection failed: ${e.message}`)));
      if (body) req.write(body);
      req.end();
    });
  }
}
