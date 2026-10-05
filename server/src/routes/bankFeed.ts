import { Router, raw } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { h } from "../portal/common.js";
import { recordPoolCredit, markCleared, markBounced, type PoolDeps } from "../services/poolService.js";

/**
 * The bank's automatic feed of what lands in the pooled accounts. The bank (or its integration partner) calls
 *
 *   POST /api/webhooks/bank-credits
 *     x-timestamp: <unix seconds>
 *     x-signature: sha256=<hex HMAC-SHA256 of "<x-timestamp>.<raw body>" using BANK_WEBHOOK_SECRET>
 *     { "bankRef": "...", "event": "received" | "cleared" | "returned", "reference": "VKR...", "amountCents": 12500, "currency": "ZAR" }
 *
 *   received  the payment has arrived and is final (the default)         -> credited to the account that owns the reference
 *   pending   the payment has arrived but has not cleared                -> instant credit if the profile allows it, else it waits
 *   cleared   a pending payment cleared                                  -> repays the reserve, or credits a waiting deposit
 *   returned  the bank sent a pending payment back                       -> taken back from the customer if still there
 *
 * Anything unsigned, stale (more than 5 minutes old), or with a bad signature is refused. Everything is idempotent on bankRef, so the bank may retry
 * freely. Without BANK_WEBHOOK_SECRET the endpoint is switched off (503). The exact message format of a real bank will differ: this is the one place to adapt it.
 */
export const FEED_MAX_AGE_SECONDS = 300;

export function signFeed(secret: string, timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function createBankFeedRouter(d: { deps: PoolDeps; secret: string | undefined; now?: () => number }): Router {
  const router = Router();
  router.post("/", raw({ type: "*/*", limit: "20kb" }), h(async (req, res) => {
    if (!d.secret) { res.status(503).json({ success: false, error: "The bank feed is not switched on" }); return; }
    const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const ts = String(req.headers["x-timestamp"] ?? ""), sig = String(req.headers["x-signature"] ?? "");
    const nowS = Math.floor((d.now ?? Date.now)() / 1000);
    if (!/^\d{9,12}$/.test(ts) || Math.abs(nowS - Number(ts)) > FEED_MAX_AGE_SECONDS) { res.status(401).json({ success: false, error: "Stale or missing timestamp" }); return; }
    const want = Buffer.from(signFeed(d.secret, ts, body)), got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) { res.status(401).json({ success: false, error: "Bad signature" }); return; }
    let m: Record<string, unknown>;
    try { m = JSON.parse(body); } catch { res.status(400).json({ success: false, error: "Not valid JSON" }); return; }
    const event = m.event === undefined ? "received" : m.event;
    try {
      if (event === "received" || event === "pending") {
        const r = await recordPoolCredit(d.deps, { bankRef: String(m.bankRef), reference: String(m.reference ?? ""), amountCents: m.amountCents as number, currency: String(m.currency), by: null, pending: event === "pending" });
        res.status(200).json({ success: true, status: r.status }); return;
      }
      if (event === "cleared" || event === "returned") {
        const row = (await (d.deps.db as unknown as { query(s: string, p: unknown[]): Promise<{ rows: { id: string }[] }> }).query(`SELECT id FROM pool_credits WHERE bank_ref = $1`, [String(m.bankRef)])).rows[0];
        if (!row) { res.status(404).json({ success: false, error: "Unknown bankRef" }); return; }
        const r = event === "cleared" ? await markCleared(d.deps, row.id, null) : await markBounced(d.deps, row.id);
        res.status(200).json({ success: true, status: r.status }); return;
      }
      res.status(400).json({ success: false, error: "event must be received, pending, cleared or returned" });
    } catch (e) {
      // a malformed line is the sender's problem (400); the bank retries nothing it was told is final
      res.status(400).json({ success: false, error: e instanceof Error ? e.message : "Could not process the line" });
    }
  }));
  return router;
}
