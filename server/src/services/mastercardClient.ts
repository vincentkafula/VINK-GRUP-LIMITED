import crypto from "crypto";

/**
 * Mastercard sandbox integration client.
 *
 * IMPORTANT — read before using:
 * All credentials here come from environment variables, never hardcoded.
 * The Partner ID / App Key / Secret you get from the Mastercard Developer
 * Portal are set directly in Railway's environment variables (or a local
 * .env file that's gitignored), not in this file or anywhere committed to
 * the repository. See DEV_CREDENTIALS.md and .env.example for the exact
 * variable names this expects.
 *
 * Mastercard's APIs use OAuth 1.0a request signing with an RSA private
 * key (the "Signature Verification Key" you generate in the Developer
 * Portal — the fingerprint you get there is the *public* half; the actual
 * private key file (.p12/.pem) is what needs to be set as
 * MASTERCARD_SIGNING_KEY below). That private key was not provided in
 * this conversation — pasting a private key into chat is itself a bad
 * practice, the same way pasting the App Key/Secret directly would be.
 * You'll need to download it from the Developer Portal and set it as a
 * Railway environment variable (base64-encoded, since it's a multi-line
 * PEM/PKCS12 file) before any signed request will actually succeed.
 *
 * Until that's set, isConfigured() returns false and every call fails
 * fast with a clear error instead of silently doing nothing.
 */

interface MastercardConfig {
  consumerKey: string;   // MASTERCARD_CONSUMER_KEY — includes your Partner ID, from the Developer Portal
  signingKeyBase64: string; // MASTERCARD_SIGNING_KEY — your private key file, base64-encoded
  keyPassword: string;   // MASTERCARD_KEY_PASSWORD — password for the .p12 file, if applicable
  environment: "sandbox" | "production";
  baseUrl: string;       // MASTERCARD_API_BASE_URL — differs per Mastercard API product; set per what you've onboarded to
}

function loadConfig(): MastercardConfig {
  return {
    consumerKey: process.env.MASTERCARD_CONSUMER_KEY ?? "",
    signingKeyBase64: process.env.MASTERCARD_SIGNING_KEY ?? "",
    keyPassword: process.env.MASTERCARD_KEY_PASSWORD ?? "",
    environment: (process.env.MASTERCARD_ENV as "sandbox" | "production") ?? "sandbox",
    baseUrl: process.env.MASTERCARD_API_BASE_URL ?? "https://sandbox.api.mastercard.com",
  };
}

export function isConfigured(): boolean {
  const c = loadConfig();
  return Boolean(c.consumerKey && c.signingKeyBase64);
}

export function configStatus(): { configured: boolean; missing: string[] } {
  const c = loadConfig();
  const missing: string[] = [];
  if (!c.consumerKey) missing.push("MASTERCARD_CONSUMER_KEY");
  if (!c.signingKeyBase64) missing.push("MASTERCARD_SIGNING_KEY");
  return { configured: missing.length === 0, missing };
}

// ─── OAuth 1.0a request signing (Mastercard's scheme) ───────────────────────
// Mastercard extends standard OAuth1 with an oauth_body_hash parameter —
// a base64-encoded SHA256 hash of the request body — added to the signature
// base string alongside the usual OAuth1 parameters.

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!*'()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function bodyHash(body: string): string {
  return crypto.createHash("sha256").update(body, "utf8").digest("base64");
}

function buildSignatureBaseString(method: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const urlObj = new URL(url);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  return [method.toUpperCase(), percentEncode(baseUrl), percentEncode(paramString)].join("&");
}

function signWithPrivateKey(baseString: string, privateKeyPem: string): string {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(baseString, "utf8");
  return signer.sign(privateKeyPem, "base64");
}

/** Builds the OAuth1 Authorization header for a signed Mastercard API request. */
function buildAuthHeader(method: string, url: string, body: string, config: MastercardConfig): string {
  const privateKeyPem = Buffer.from(config.signingKeyBase64, "base64").toString("utf8");

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "RSA-SHA256",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    oauth_body_hash: bodyHash(body),
  };

  const urlObj = new URL(url);
  const queryParams: Record<string, string> = {};
  urlObj.searchParams.forEach((v, k) => { queryParams[k] = v; });

  const allParams = { ...oauthParams, ...queryParams };
  const baseString = buildSignatureBaseString(method, url, allParams);
  const signature = signWithPrivateKey(baseString, privateKeyPem);

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  const headerString = Object.keys(headerParams)
    .map(k => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(", ");
  return `OAuth ${headerString}`;
}

export interface MastercardRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string; // e.g. "/openfinance/accounts/v1/accounts"
  body?: object;
}

/** Makes a signed request against the Mastercard API. Throws a clear error
 *  if credentials aren't configured, rather than failing silently. */
export async function mastercardRequest<T = unknown>(opts: MastercardRequestOptions): Promise<T> {
  const config = loadConfig();
  if (!isConfigured()) {
    const { missing } = configStatus();
    throw new Error(`Mastercard integration not configured — missing: ${missing.join(", ")}. Set these in Railway's environment variables.`);
  }

  const url = `${config.baseUrl}${opts.path}`;
  const bodyStr = opts.body ? JSON.stringify(opts.body) : "";
  const authHeader = buildAuthHeader(opts.method, url, bodyStr, config);

  const res = await fetch(url, {
    method: opts.method,
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: opts.body ? bodyStr : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    throw new Error(`Mastercard API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return json as T;
}
