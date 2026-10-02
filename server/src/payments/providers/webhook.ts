import crypto from "crypto";

/**
 * Verifies an HMAC-signed webhook: signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`), hex.
 * - constant-time comparison
 * - the timestamp must be within `toleranceSeconds` (stops old captured requests being replayed later)
 * - an event id is accepted once (stops replays inside the window)
 * Throws on any failure. The raw body (a Buffer) must be what was signed: do not re-serialise parsed JSON.
 *
 * This is OUR scheme, used by the sandbox mocks and the simulator. A real provider defines its own signature
 * format; its adapter must implement that, and may reuse ReplayGuard.
 */
export class ReplayGuard {
  private seen = new Map<string, number>();
  constructor(private ttlMs = 10 * 60_000) {}
  /** Returns false if this id was already seen. */
  remember(id: string, now = Date.now()): boolean {
    for (const [k, t] of this.seen) if (now - t > this.ttlMs) this.seen.delete(k);
    if (this.seen.has(id)) return false;
    this.seen.set(id, now);
    return true;
  }
}

export function signWebhook(secret: string, rawBody: Buffer | string, timestamp = Math.floor(Date.now() / 1000)): { timestamp: number; signature: string } {
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return { timestamp, signature: crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex") };
}

export function verifySignedWebhook(opts: {
  secret: string; rawBody: Buffer; signature: string | undefined; timestamp: string | undefined;
  toleranceSeconds?: number; now?: number; guard?: ReplayGuard;
}): { id: string; type: string; createdAt: string; data: unknown } {
  const { secret, rawBody, signature, timestamp, toleranceSeconds = 300, now = Date.now(), guard } = opts;
  if (!signature || !timestamp) throw new Error("missing signature");
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSeconds) throw new Error("timestamp outside tolerance");
  const want = signWebhook(secret, rawBody, ts).signature;
  const a = Buffer.from(signature), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("bad signature");
  const evt = JSON.parse(rawBody.toString("utf8"));
  if (!evt || typeof evt.id !== "string" || typeof evt.type !== "string") throw new Error("malformed event");
  if (guard && !guard.remember(evt.id, now)) throw new Error("replayed event");
  return { id: evt.id, type: evt.type, createdAt: evt.createdAt ?? new Date(ts * 1000).toISOString(), data: evt.data };
}
