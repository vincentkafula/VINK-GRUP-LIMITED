import express, { Router, type Request, type Response, type RequestHandler } from "express";
import { verifySvix, WebhookSignatureError } from "./svix.js";
import type { MailFiles } from "../services/mailFiles.js";
import type { InboundStore } from "./store.js";

/**
 * Incoming email (Resend "receiving").
 *  POST /api/inbound/webhook  — Resend calls this for every received email. The body is verified against RESEND_WEBHOOK_SECRET
 *                               (raw bytes, so this router is mounted BEFORE the JSON parser). The webhook only carries metadata, so the
 *                               body is fetched from Resend and stored. Repeats are harmless (idempotent on the Resend email id).
 *  GET  /api/inbound          — staff only: list stored messages (?department=support filters by the department it was addressed to);  GET /api/inbound/:id — one message.
 * Stored text/HTML is untrusted input from the open internet: the API returns it as JSON data and the UI must never render the
 * HTML unescaped.
 */
export interface InboundDeps {
  store: InboundStore;
  webhookSecret?: string;
  /** Where the attachments of incoming email are recorded and fetched (see services/mailFiles.ts). Without it attachments are ignored. */
  files?: MailFiles;
  /** Called once for each newly stored email (the mail service uses it to send mail from blocked senders to Spam). A failure here never loses the email. */
  onStored?: (emailId: string) => Promise<void>;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  guard: RequestHandler[];            // authentication + role check for the staff routes
}

interface ReceivedEmail { from?: string; to?: string[]; subject?: string; text?: string | null; html?: string | null; created_at?: string }

const h = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };

export function createInboundRouter(d: InboundDeps): Router {
  const router = Router();
  const doFetch = d.fetchImpl ?? fetch;

  router.post("/webhook", express.raw({ type: "*/*", limit: "256kb" }), h(async (req, res) => {
    if (!d.webhookSecret) { res.status(501).json({ success: false, error: "Inbound email is not configured" }); return; }
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try { verifySvix(raw, req.headers, d.webhookSecret, d.now?.()); }
    catch (e) { if (e instanceof WebhookSignatureError) { res.status(401).json({ success: false, error: "Bad signature" }); return; } throw e; }

    let evt: { type?: string; data?: { email_id?: string } };
    try { evt = JSON.parse(raw.toString("utf8")); } catch { res.status(400).json({ success: false, error: "Malformed body" }); return; }
    if (evt.type !== "email.received") { res.json({ success: true, ignored: evt.type ?? null }); return; }   // other event types: acknowledge, do nothing
    const emailId = evt.data?.email_id;
    if (!emailId || !d.apiKey) { res.status(d.apiKey ? 400 : 501).json({ success: false, error: d.apiKey ? "No email id" : "RESEND_API_KEY missing" }); return; }

    try {
      const r = await doFetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
        headers: { Authorization: `Bearer ${d.apiKey}` }, signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`Resend returned ${r.status}`);
      const m = await r.json() as ReceivedEmail;
      const saved = await d.store.save({
        resendId: emailId, from: String(m.from ?? "").slice(0, 320), to: (m.to ?? []).map(String).slice(0, 50),
        subject: String(m.subject ?? "").slice(0, 998), text: m.text ?? null, html: m.html ?? null, receivedAt: m.created_at,
      });
      // the attachments: recorded now, fetched in the background (a failure here never loses the email, which is already stored)
      if (saved && d.files) {
        try { const row = await d.store.find(emailId); if (row) await d.files.recordInbound(row.id, emailId, row.department); }
        catch (e) { console.error(`[inbound] attachments of ${emailId} were not recorded:`, e instanceof Error ? e.message : e); }
      }
      if (saved && d.onStored) {
        try { const row = await d.store.find(emailId); if (row) await d.onStored(row.id); }
        catch (e) { console.error(`[inbound] filing of ${emailId} failed:`, e instanceof Error ? e.message : e); }
      }
      res.json({ success: true, stored: saved });
    } catch (e) {
      console.error(`[inbound] could not store ${emailId}:`, e instanceof Error ? e.message : e);
      res.status(502).json({ success: false, error: "Could not fetch the message; will be retried" });   // non-2xx: Resend retries
    }
  }));

  router.get("/", ...d.guard, h(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200), offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await d.store.list(limit, offset, typeof req.query.department === "string" ? req.query.department : undefined);
    res.json({ success: true, messages: rows.map(({ html: _h, text, ...rest }) => ({ ...rest, preview: (text ?? "").slice(0, 200) })) });
  }));

  router.get("/:id", ...d.guard, h(async (req, res) => {
    const m = await d.store.get(String(req.params.id));
    if (!m) { res.status(404).json({ success: false, error: "Not found" }); return; }
    res.json({ success: true, message: m });
  }));

  return router;
}
