import type { Db } from "../portal/common.js";
import { createEmailSender, type EmailSender } from "../auth/email.js";

/**
 * Telling the association about a safety report the moment it is made (docs/MARSHAL_COMMISSION.md). Every report is emailed. A PANIC report is also sent by SMS when the association has given an alert phone number,
 * with the marshal's location as a map link. Delivery is tracked per channel, so a failure is retried without re-sending what already went, and a report that cannot be delivered is visible (notify_error) rather than lost.
 * Email goes through the existing sender (Resend). SMS goes through Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are set; otherwise it fails loudly in the log and the report stays on screen.
 * The Twilio adapter follows Twilio's published REST API and has been tested here against a stand-in, not against a live account.
 */
export interface SmsSender { readonly name: string; send(to: string, text: string): Promise<void> }
export class TwilioSms implements SmsSender {
  readonly name = "twilio";
  constructor(private readonly sid: string, private readonly token: string, private readonly from: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async send(to: string, text: string): Promise<void> {
    const res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.sid)}/Messages.json`, {
      method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: this.from, Body: text }).toString(), signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Twilio rejected the message (${res.status})`);                      // never the body (it holds the number and text) or the credentials
  }
}
export class ConsoleSms implements SmsSender { readonly name = "console"; sent: { to: string; text: string }[] = []; async send(to: string, text: string): Promise<void> { this.sent.push({ to, text }); console.log(`[sms:dev] to=${to} ${text}`); } }
export class UnconfiguredSms implements SmsSender { readonly name = "unconfigured"; async send(): Promise<void> { throw new Error("SMS is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM)."); } }
export function createSmsSender(env: NodeJS.ProcessEnv = process.env): SmsSender {
  const sid = env.TWILIO_ACCOUNT_SID?.trim(), token = env.TWILIO_AUTH_TOKEN?.trim(), from = env.TWILIO_FROM?.trim();
  if (sid && token && from) return new TwilioSms(sid, token, from);
  return env.NODE_ENV === "production" ? new UnconfiguredSms() : new ConsoleSms();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const TYPE: Record<string, string> = { panic: "PANIC", threat: "Threat", fight: "Fight", robbery: "Robbery", overcrowding: "Overcrowding", injury: "Injury", other: "Other" };
export const mapUrl = (lat: number, lng: number) => `https://maps.google.com/?q=${lat},${lng}`;
const sast = (d: Date) => new Date(d.getTime() + 2 * 3600_000).toISOString().replace("T", " ").slice(0, 16);

export type ChannelResult = "sent" | "failed" | "already" | "not_needed";
export function createAlerts(deps: { db: Db; email: EmailSender; sms: SmsSender; now?: () => Date; maxAttempts?: number }) {
  const { db, email, sms } = deps, now = deps.now ?? (() => new Date()), maxAttempts = deps.maxAttempts ?? 6;
  /** Sends what has not yet been sent for one report. Safe to call again: a channel that went is never sent twice. */
  async function notifyIncident(id: string): Promise<{ email: ChannelResult; sms: ChannelResult } | null> {
    const i = (await db.query(`SELECT i.*, rk.name AS rank_name, u.name AS reporter, a.email AS assoc_email, a.name AS assoc_name, s.alert_email, s.alert_phone
                               FROM incidents i JOIN ranks rk ON rk.id = i.rank_id JOIN users u ON u.id = i.reported_by JOIN users a ON a.id = i.association_id LEFT JOIN association_settings s ON s.association_id = i.association_id WHERE i.id = $1`, [id])).rows[0];
    if (!i) return null;
    if (i.notified_at) return { email: "already", sms: i.notified_sms_at || !(i.type === "panic" && i.alert_phone) ? "already" : "not_needed" };
    const panic = i.type === "panic", when = sast(new Date(i.occurred_at as string)), lat = i.latitude === null ? null : Number(i.latitude), lng = i.longitude === null ? null : Number(i.longitude);
    const where = lat !== null && lng !== null ? `Location: ${mapUrl(lat, lng)}${i.accuracy_m ? ` (within about ${Number(i.accuracy_m)} m)` : ""}` : panic ? "Location: not available" : "";
    const head = panic ? `PANIC from ${i.reporter} at ${i.rank_name}, ${when}` : `Safety report: ${TYPE[String(i.type)] ?? i.type} at ${i.rank_name}, reported by ${i.reporter}, ${when}`;
    const note = i.note ? `Note: ${i.note}` : "";
    const text = [head, where, note, i.photo ? "A photo was sent with this report: open it on the Safety screen." : "", "Open the Safety screen to acknowledge it."].filter(Boolean).join("\n");
    const html = `<p><b>${esc(head)}</b></p>${where ? `<p>${esc(where.replace(/^Location: https?:\/\/\S+/, "Location:"))} ${lat !== null && lng !== null ? `<a href="${esc(mapUrl(lat, lng))}">Open the map</a>` : ""}</p>` : ""}${note ? `<p>${esc(note)}</p>` : ""}<p>Open the Safety screen to acknowledge it.</p>`;
    const res: { email: ChannelResult; sms: ChannelResult } = { email: i.notified_email_at ? "already" : "sent", sms: !panic || !i.alert_phone ? "not_needed" : i.notified_sms_at ? "already" : "sent" };
    const errors: string[] = [];
    if (res.email === "sent") {
      try { await email.send({ to: String(i.alert_email || i.assoc_email), subject: panic ? `PANIC: ${i.reporter} at ${i.rank_name}` : `Safety report: ${TYPE[String(i.type)] ?? i.type} at ${i.rank_name}`, text, html }); await db.query(`UPDATE incidents SET notified_email_at = now() WHERE id = $1`, [id]); }
      catch (e) { res.email = "failed"; errors.push(`email: ${e instanceof Error ? e.message : "failed"}`); }
    }
    if (res.sms === "sent") {
      try { await sms.send(String(i.alert_phone), text.slice(0, 600)); await db.query(`UPDATE incidents SET notified_sms_at = now() WHERE id = $1`, [id]); }
      catch (e) { res.sms = "failed"; errors.push(`sms: ${e instanceof Error ? e.message : "failed"}`); }
    }
    if (errors.length) await db.query(`UPDATE incidents SET notify_attempts = notify_attempts + 1, notify_error = $2 WHERE id = $1`, [id, errors.join("; ").slice(0, 300)]);
    else await db.query(`UPDATE incidents SET notified_at = now(), notify_error = NULL WHERE id = $1`, [id]);
    return res;
  }
  /** Tries again, oldest first, for reports not fully delivered: a limited number of times, and only for a day, so a dead address cannot loop forever. */
  async function retryUnsent(): Promise<number> {
    const since = new Date(now().getTime() - 24 * 3600_000), rows = (await db.query(`SELECT id FROM incidents WHERE notified_at IS NULL AND notify_attempts < $1 AND created_at > $2 ORDER BY created_at LIMIT 50`, [maxAttempts, since])).rows;
    let n = 0; for (const r of rows) { const x = await notifyIncident(String(r.id)); if (x && x.email !== "failed" && x.sms !== "failed") n++; }
    return n;
  }
  return { notifyIncident, retryUnsent };
}
export type Alerts = ReturnType<typeof createAlerts>;

let override: { email?: EmailSender; sms?: SmsSender } | null = null;
/** Lets tests (and nothing else) replace the senders. Call with null to restore the real ones. */
export const configureAlerts = (d: { email?: EmailSender; sms?: SmsSender } | null) => { override = d; };
export const alertsFor = (db: Db, now?: () => Date): Alerts => createAlerts({ db, email: override?.email ?? createEmailSender(), sms: override?.sms ?? createSmsSender(), ...(now ? { now } : {}) });
