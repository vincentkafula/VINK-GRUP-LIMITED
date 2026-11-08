import { Router, json, type Response } from "express";
import { h, uid, actor, audit, type Db } from "./common.js";
import { createAssociationDigest } from "../services/associationDigest.js";
import type { EmailSender } from "../auth/email.js";

/**
 * The association's email digest (docs/ASSOCIATION_COMPLIANCE.md, module 13), mounted on the association router.
 *   GET  /digest            the settings, the last sends, and whether email is set up
 *   PUT  /digest            change the settings (on or off, weekly or monthly, the day, up to five addresses, whether to send when quiet)
 *   GET  /digest/preview    what it would say today, exactly as it would be emailed (nothing is sent)
 *   POST /digest/test       send it now to the chosen addresses (at most three a day)
 * For the association's MAIN login only: the gate refuses a named office bearer, because the digest gathers every module in one email, including ones their role may not see.
 * The record of a change holds only whether it is on, how often, and how many addresses: never the addresses themselves.
 */
const reply = <T,>(res: Response, r: { ok: true; value: T } | { ok: false; status: number; error: string }, okStatus = 200) => {
  if (!r.ok) { res.status(r.status).json({ success: false, error: r.error }); return; }
  res.status(okStatus).json({ success: true, ...(r.value && typeof r.value === "object" ? r.value : { value: r.value }) });
};
const NONE: EmailSender = { name: "unconfigured", async send() { throw new Error("email is not set up"); } };
export function mountAssociationDigest(router: Router, db: Db, now: () => Date = () => new Date(), mail: EmailSender | null = null): void {
  const mailer = mail ?? NONE, dg = createAssociationDigest({ db, mail: mailer, now, frontendUrl: process.env.FRONTEND_URL }), body = json({ limit: "10kb" });
  router.get("/digest", h(async (req, res) => { res.json({ success: true, settings: await dg.get(uid(req)), history: await dg.history(uid(req)), emailAvailable: mailer.name !== "unconfigured" }); }));
  router.put("/digest", body, h(async (req, res) => { const r = await dg.save(uid(req), actor(req), req.body ?? {}); if (r.ok) await audit(db, req, "digest.save", null, { enabled: r.value.enabled, frequency: r.value.frequency, recipients: r.value.recipients.length }); reply(res, r.ok ? { ok: true as const, value: { settings: r.value } } : r); }));
  router.get("/digest/preview", h(async (req, res) => { const d = await dg.compose(uid(req)); res.json({ success: true, subject: d.subject, text: d.text, needsAttention: d.needsAttention, urgent: d.urgent, soon: d.soon }); }));
  router.post("/digest/test", h(async (req, res) => { const r = await dg.sendTest(uid(req)); if (r.ok) await audit(db, req, "digest.test", null, { sent: r.value.sent }); reply(res, r); }));
}
