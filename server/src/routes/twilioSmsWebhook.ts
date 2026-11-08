import { Router, urlencoded } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "../portal/common.js";
import { createOwnerSms } from "../services/ownerSms.js";
import type { SmsSender } from "../services/alerts.js";

/**
 * THE SMS PROVIDER CALLS THIS when someone texts the platform's number back (docs/OWNER_DASHBOARD.md, slice F3). It is how a STOP reply reaches us.
 *   it is checked    every request carries a signature made with the account's secret token over the exact address Twilio called and the parameters it sent; a request without a valid signature is refused, so nobody else can switch an owner's alerts off by posting here
 *   it needs         TWILIO_AUTH_TOKEN, and TWILIO_SMS_WEBHOOK_URL: the full address you gave Twilio for incoming messages (it is part of what is signed). Without them it answers "not set up" and does nothing
 *   it answers       with TwiML (what Twilio expects): nothing for a STOP (Twilio sends its own standard reply), a short message for HELP and START
 * Mounted before the JSON parser: the body is a form, and the signature is over its exact fields.
 */
/** What Twilio signs: the address, then each parameter's name and value, in alphabetical order of name, joined with no separators; HMAC-SHA1 with the account's auth token; base64. */
export function twilioSignature(token: string, url: string, params: Record<string, string>): string {
  return createHmac("sha1", token).update(url + Object.keys(params).sort().map((k) => k + params[k]).join("")).digest("base64");
}
export function verifyTwilioSignature(token: string, url: string, params: Record<string, string>, header: unknown): boolean {
  if (typeof header !== "string" || !header) return false; const a = Buffer.from(twilioSignature(token, url, params)), b = Buffer.from(header); return a.length === b.length && timingSafeEqual(a, b);
}
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function createTwilioSmsWebhook(deps: { db: Db; sms: SmsSender; env?: NodeJS.ProcessEnv; now?: () => Date }): Router {
  const env = deps.env ?? process.env, svc = createOwnerSms({ db: deps.db, sms: deps.sms, ...(deps.now ? { now: deps.now } : {}) }), router = Router();
  router.post("/", urlencoded({ extended: false, limit: "20kb" }), async (req, res) => {
    const token = env.TWILIO_AUTH_TOKEN, url = env.TWILIO_SMS_WEBHOOK_URL;
    if (!token || !url) { res.status(503).type("text/plain").send("Incoming text messages are not set up"); return; }
    const params: Record<string, string> = {}; for (const [k, v] of Object.entries(req.body ?? {})) if (typeof v === "string") params[k] = v;
    if (!verifyTwilioSignature(token, url, params, req.headers["x-twilio-signature"])) { res.status(403).type("text/plain").send("Forbidden"); return; }
    try { const r = await svc.handleInbound(params.From, params.Body); res.status(200).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response>${r.reply ? `<Message>${xml(r.reply)}</Message>` : ""}</Response>`); }
    catch (e) { console.error("[twilio-sms] could not handle a reply:", e instanceof Error ? e.message : e); res.status(200).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`); }
  });
  return router;
}
