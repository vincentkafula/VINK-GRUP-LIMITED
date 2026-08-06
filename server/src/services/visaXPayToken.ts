import crypto from "crypto";

/**
 * Visa X-Pay Token (API Key + Shared Secret authentication).
 *
 * Algorithm confirmed directly against developer.visa.com/pages/working-
 * with-visa-apis/x-pay-token, cross-checked against several independent
 * reference implementations in the Visa Developer Community (all
 * byte-for-byte identical), rather than assumed:
 *
 *   timestamp  = current Unix time in seconds, as a string
 *   beforeHash = timestamp + resourcePath + queryString + requestBody
 *   hash       = HMAC-SHA256(beforeHash, sharedSecret), lowercase hex
 *   token      = "xv2:" + timestamp + ":" + hash
 *
 * This is a *different* mechanism from the JWE/JWS Message Level
 * Encryption built earlier — X-Pay Token authenticates the API call
 * itself (sent as the x-pay-token header, with the API key also present
 * as a query parameter on the request URL). MLE, if a specific DPS
 * endpoint requires it, would additionally encrypt sensitive fields
 * *inside* the request body that this token then covers as part of
 * requestBody — the two are complementary, not alternatives.
 */

export interface XPayTokenParams {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path only, no leading slash, no host — e.g. "helloworld" or
   *  "dpscardandaccountservices/v1/cards/activate". */
  resourcePath: string;
  /** Additional query params beyond apiKey, without the leading "?".
   *  apiKey is added automatically — don't include it here. */
  extraQueryString?: string;
  /** Exact JSON string that will be sent as the request body. Use ""
   *  (not undefined) for requests with no body — the hash is sensitive
   *  to this being exactly right. */
  requestBody?: string;
}

function buildQueryString(apiKey: string, extra?: string): string {
  const base = `apiKey=${apiKey}`;
  return extra ? `${base}&${extra}` : base;
}

/** Generates the x-pay-token header value for a request. */
export function generateXPayToken(params: XPayTokenParams, apiKey: string, sharedSecret: string): string {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const queryString = buildQueryString(apiKey, params.extraQueryString);
  const body = params.requestBody ?? "";
  const beforeHash = timestamp + params.resourcePath + queryString + body;
  const hash = crypto.createHmac("sha256", sharedSecret).update(beforeHash, "utf8").digest("hex");
  return `xv2:${timestamp}:${hash}`;
}

/**
 * Makes an authenticated request to a Visa API using X-Pay Token auth.
 * Builds the full URL (host + path + query), signs it, and attaches both
 * the apiKey query param and x-pay-token header that Visa's servers
 * expect.
 */
export async function visaXPayRequest<T = unknown>(opts: {
  baseUrl: string; // e.g. "https://sandbox.api.visa.com"
  method: "GET" | "POST" | "PUT" | "DELETE";
  resourcePath: string;
  extraQueryString?: string;
  body?: object;
  apiKey: string;
  sharedSecret: string;
}): Promise<T> {
  const requestBody = opts.body ? JSON.stringify(opts.body) : "";
  const token = generateXPayToken(
    { method: opts.method, resourcePath: opts.resourcePath, extraQueryString: opts.extraQueryString, requestBody },
    opts.apiKey,
    opts.sharedSecret,
  );

  const queryString = buildQueryString(opts.apiKey, opts.extraQueryString);
  const url = `${opts.baseUrl}/${opts.resourcePath}?${queryString}`;

  const res = await fetch(url, {
    method: opts.method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-pay-token": token,
    },
    body: requestBody || undefined,
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    throw new Error(`Visa API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return json as T;
}
