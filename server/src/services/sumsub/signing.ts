import { createHmac } from "crypto";

/**
 * Every request to Sumsub is signed (their "App Token" scheme): the signature is the hex HMAC-SHA256, keyed with the secret key, of
 *   timestamp (unix seconds) + METHOD (upper case) + path including the query string + the body exactly as sent (empty for a GET)
 * and travels in X-App-Access-Sig, with the timestamp in X-App-Access-Ts and the token in X-App-Token. Sumsub rejects a timestamp that is too old,
 * so a captured request cannot be replayed later.
 */
export function sumsubSignature(secretKey: string, ts: number, method: string, pathAndQuery: string, body: string | Buffer = ""): string {
  return createHmac("sha256", secretKey).update(String(ts)).update(method.toUpperCase()).update(pathAndQuery).update(body).digest("hex");
}

export function sumsubHeaders(c: { appToken: string; secretKey: string }, ts: number, method: string, pathAndQuery: string, body: string | Buffer = ""): Record<string, string> {
  return { "X-App-Token": c.appToken, "X-App-Access-Ts": String(ts), "X-App-Access-Sig": sumsubSignature(c.secretKey, ts, method, pathAndQuery, body), Accept: "application/json" };
}
