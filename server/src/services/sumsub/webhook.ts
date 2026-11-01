import express, { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { sumsubWebhookReady, type SumsubConfig } from "./config.js";

/**
 * Sumsub calls this when a check changes (submitted, put on hold, reviewed...). It signs the exact bytes it sends: X-Payload-Digest is the hex HMAC of the raw
 * body, made with the webhook secret and the algorithm named in X-Payload-Digest-Alg. So this route reads the body raw (it is mounted before the JSON parser).
 * Replies: 200 when handled or safely ignored; 401 when the signature does not match; 503 when no webhook secret is set; 500 when we could not save it
 * (Sumsub then tries again, which is why every event is applied once only).
 */
const ALGORITHMS: Record<string, string> = { HMAC_SHA1_HEX: "sha1", HMAC_SHA256_HEX: "sha256", HMAC_SHA512_HEX: "sha512" };

export function verifySumsubDigest(raw: Buffer, digest: unknown, alg: unknown, secret: string): boolean {
  if (!secret || !Buffer.isBuffer(raw) || typeof digest !== "string" || typeof alg !== "string") return false;
  const algorithm = ALGORITHMS[alg.trim().toUpperCase()]; if (!algorithm) return false;
  const want = createHmac(algorithm, secret).update(raw).digest();
  const got = Buffer.from(digest.trim().toLowerCase(), "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export interface EventSink { applyEvent(payload: unknown): Promise<{ ok: true; applied?: boolean; ignored?: string } | { ok: false; status: number; error: string }> }

export function createSumsubWebhookRouter(d: { identity: EventSink; config: SumsubConfig }): Router {
  const router = Router();
  router.post("/", express.raw({ type: () => true, limit: "256kb" }), async (req, res) => {
    if (!sumsubWebhookReady(d.config)) { res.status(503).json({ success: false, error: "The Sumsub webhook secret is not set" }); return; }
    const raw = req.body;
    if (!Buffer.isBuffer(raw) || raw.length === 0) { res.status(400).json({ success: false, error: "No body" }); return; }
    if (!verifySumsubDigest(raw, req.get("x-payload-digest"), req.get("x-payload-digest-alg"), d.config.webhookSecret)) { res.status(401).json({ success: false, error: "Bad signature" }); return; }
    let payload: unknown; try { payload = JSON.parse(raw.toString("utf8")); } catch { res.status(400).json({ success: false, error: "The body is not JSON" }); return; }
    try {
      const r = await d.identity.applyEvent(payload);
      if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
      res.json({ success: true, ...(r.ignored ? { ignored: r.ignored } : {}) });
    } catch (e) {
      console.error("[sumsub] could not apply an event:", e instanceof Error ? e.message : e);
      res.status(500).json({ success: false, error: "Could not save the event" });
    }
  });
  return router;
}
