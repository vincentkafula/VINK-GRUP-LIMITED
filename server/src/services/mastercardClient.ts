/**
 * Mastercard Open Banking (MOBS) sandbox integration client.
 *
 * CORRECTION: an earlier version of this file implemented Mastercard's
 * classic OAuth 1.0a RSA-signing scheme (Consumer Key + private key file).
 * That's wrong for this specific product. Confirmed directly against
 * Mastercard's own open-banking-reference-application (github.com/
 * Mastercard/open-banking-reference-application): Open Banking is built on
 * Finicity's API underneath (their reference app proxies straight to
 * api.finicity.com), and uses Partner ID + Partner Secret + App Key —
 * exchanged for a short-lived bearer token — not RSA request signing.
 * No private key file is needed for this product at all.
 *
 * IMPORTANT — read before using:
 * All credentials here come from environment variables, never hardcoded.
 * Set them directly in Railway's environment variables (or a local .env
 * file that's gitignored), never in a file that gets committed. See
 * DEV_CREDENTIALS.md and .env.example for the exact variable names.
 */

interface MastercardConfig {
  partnerId: string;     // MASTERCARD_PARTNER_ID
  partnerSecret: string; // MASTERCARD_PARTNER_SECRET
  appKey: string;        // MASTERCARD_APP_KEY
  baseUrl: string;       // MASTERCARD_API_BASE_URL — defaults to Finicity's sandbox host
}

function loadConfig(): MastercardConfig {
  return {
    partnerId: process.env.MASTERCARD_PARTNER_ID ?? "",
    partnerSecret: process.env.MASTERCARD_PARTNER_SECRET ?? "",
    appKey: process.env.MASTERCARD_APP_KEY ?? "",
    baseUrl: process.env.MASTERCARD_API_BASE_URL ?? "https://api.finicity.com",
  };
}

export function isConfigured(): boolean {
  const c = loadConfig();
  return Boolean(c.partnerId && c.partnerSecret && c.appKey);
}

export function configStatus(): { configured: boolean; missing: string[] } {
  const c = loadConfig();
  const missing: string[] = [];
  if (!c.partnerId) missing.push("MASTERCARD_PARTNER_ID");
  if (!c.partnerSecret) missing.push("MASTERCARD_PARTNER_SECRET");
  if (!c.appKey) missing.push("MASTERCARD_APP_KEY");
  return { configured: missing.length === 0, missing };
}

// ─── Bearer token exchange ───────────────────────────────────────────────
// Partner ID + Partner Secret + App Key are exchanged for a short-lived
// token (documented lifetime: ~2 hours). Cached in memory and refreshed
// automatically when it's missing or close to expiry — every other call
// just needs the token + App Key as headers, no signing involved.

let cachedToken: { token: string; fetchedAt: number } | null = null;
const TOKEN_LIFETIME_MS = 110 * 60 * 1000; // refresh a bit before the real ~2h expiry

async function getBearerToken(config: MastercardConfig): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_LIFETIME_MS) {
    return cachedToken.token;
  }

  const res = await fetch(`${config.baseUrl}/aggregation/v2/partners/authentication`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Finicity-App-Key": config.appKey,
    },
    body: JSON.stringify({ partnerId: config.partnerId, partnerSecret: config.partnerSecret }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mastercard authentication failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { token?: string };
  if (!data.token) throw new Error("Mastercard authentication response had no token");

  cachedToken = { token: data.token, fetchedAt: Date.now() };
  return data.token;
}

export interface MastercardRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string; // e.g. "/aggregation/v1/customers/{customerId}/accounts"
  body?: object;
}

/** Makes an authenticated request against the Mastercard Open Banking API.
 *  Throws a clear error if credentials aren't configured, rather than
 *  failing silently. */
export async function mastercardRequest<T = unknown>(opts: MastercardRequestOptions): Promise<T> {
  const config = loadConfig();
  if (!isConfigured()) {
    const { missing } = configStatus();
    throw new Error(`Mastercard integration not configured — missing: ${missing.join(", ")}. Set these in Railway's environment variables.`);
  }

  const token = await getBearerToken(config);
  const url = `${config.baseUrl}${opts.path}`;

  const res = await fetch(url, {
    method: opts.method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Finicity-App-Key": config.appKey,
      "Finicity-App-Token": token,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
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
