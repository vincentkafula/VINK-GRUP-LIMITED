import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Resend webhook (they are signed with the Svix scheme).
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *   signature      = base64(HMAC-SHA256(key, signed content)), key = base64-decoded secret (after the "whsec_" prefix)
 *   header         = space-separated list of "v1,<signature>" (more than one while a secret is being rotated)
 * The timestamp must be recent, so a captured request cannot be replayed later.
 */
export class WebhookSignatureError extends Error {}

export function verifySvix(
  raw: Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  now: Date = new Date(),
  toleranceSeconds = 300,
): void {
  const one = (k: string) => { const v = headers[k]; return Array.isArray(v) ? v[0] : v; };
  const id = one("svix-id"), ts = one("svix-timestamp"), sigHeader = one("svix-signature");
  if (!id || !ts || !sigHeader) throw new WebhookSignatureError("missing signature headers");

  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now.getTime() / 1000 - t) > toleranceSeconds) throw new WebhookSignatureError("timestamp outside tolerance");

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.`).update(raw).digest();

  for (const part of sigHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return;
  }
  throw new WebhookSignatureError("signature mismatch");
}
