import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import type { WaClient, WaConfig } from "./whatsapp/cloud.js";
import { waReady } from "./whatsapp/cloud.js";
import { gatherAttention } from "./ownerAttention.js";
import { SMS_KINDS, KIND_TEXT, maskPhone, normalizePhone, MAX_TESTS_PER_DAY, MAX_FAILED_PER_DAY, REPEAT_DAYS, FROM_HOUR, TO_HOUR, type SmsKind } from "./ownerSms.js";

/**
 * WHATSAPP ALERTS FOR THE OWNER (docs/OWNER_DASHBOARD.md): the same alerts as the text messages, by WhatsApp, for an owner who asks for them.
 *   opt-in       strictly the owner's own choice, with a recorded consent: the owner must tick that they agree before it can be switched on. Nothing is sent to anyone who has not
 *   number       the mobile number the owner already confirmed under Text alerts (so no second code): WhatsApp alerts cannot be switched on until a number is confirmed there
 *   template     a business-initiated WhatsApp message must be an approved TEMPLATE (Meta decides). It needs WHATSAPP_ALERT_TEMPLATE (and WHATSAPP_ALERT_LANGUAGE, default "en") and the WhatsApp number's own settings. Until they are set the screen says "not available yet" and nothing can be switched on or sent
 *   limits       the same as text messages: at most one a day, between 07:00 and 19:00 South African time, never the same alert twice in a week, three tests a day, three failed tries a day
 *   stop         a WhatsApp reply of STOP switches it off at once (the platform's WhatsApp inbox calls handleStop)
 * The template has two variables: {{1}} "3 things need you" and {{2}} one line of up to three alerts. A variable may not hold a line break, so the alerts are joined with " | ".
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
export const MAX_ITEMS = 3, ITEM_CHARS = 90;
/** The wording to give Meta when applying for the template (category: Utility). */
export const TEMPLATE_BODY = "VINK alert: {{1}}. {{2}} Reply STOP to switch these off, or open WhatsApp alerts on your dashboard to change them.";
const asList = (v: unknown): string[] => { if (Array.isArray(v)) return v.map(String); if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } } return []; };
const hourSA = (d: Date) => (d.getUTCHours() + 2) % 24;
/** A template variable: no line breaks, tabs or runs of spaces, which WhatsApp refuses, and not too long. */
export const cleanParam = (s: string, max: number) => { const t = s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t; };
export interface WhatsappDeps { wa: WaClient; config: WaConfig; env?: NodeJS.ProcessEnv }
let configured: WhatsappDeps | null = null;
/** Called once at start-up with the platform's real WhatsApp client. Null switches it off (tests do this). */
export const configureOwnerWhatsapp = (d: WhatsappDeps | null) => { configured = d; };

export function createOwnerWhatsapp(db: Db, now: () => Date = () => new Date()) {
  const tpl = () => { const e = configured?.env ?? process.env; return { name: (e.WHATSAPP_ALERT_TEMPLATE ?? "").trim(), language: (e.WHATSAPP_ALERT_LANGUAGE ?? "").trim() || "en" }; };
  /** Why alerts cannot be sent right now, or null when they can. */
  function unavailable(): string | null {
    if (!configured || !waReady(configured.config)) return "WhatsApp is not set up on this server yet";
    if (!/^[a-z0-9_]{1,512}$/.test(tpl().name)) return "WhatsApp alerts are not available yet: the message template has not been approved and set up";
    return null;
  }
  const row = async (owner: string) => (await db.query(`SELECT * FROM owner_whatsapp WHERE owner_id = $1`, [owner])).rows[0];
  const number = async (owner: string): Promise<string | null> => { const r = (await db.query(`SELECT phone FROM owner_sms WHERE owner_id = $1 AND verified_at IS NOT NULL`, [owner])).rows[0]; return r ? String(r.phone) : null; };
  const log = async (owner: string, kind: string, status: "sent" | "failed", keys: string[] = [], error: string | null = null) => { await db.query(`INSERT INTO owner_whatsapp_log (owner_id, kind, sent_at, status, keys, error) VALUES ($1,$2,$3,$4,$5,$6)`, [owner, kind, now().toISOString(), status, JSON.stringify(keys), error ? error.slice(0, 200) : null]); };
  const since = async (owner: string, kind: string, ms: number, status?: string) => (await db.query(`SELECT * FROM owner_whatsapp_log WHERE owner_id = $1 AND kind = $2`, [owner, kind])).rows.filter((l) => new Date(l.sent_at as string).getTime() > now().getTime() - ms && (!status || l.status === status));

  async function status(owner: string) {
    const r = await row(owner), n = await number(owner), why = unavailable();
    return { available: why === null, reason: why, numberConfirmed: !!n, number: n ? maskPhone(n) : null, enabled: !!r?.enabled && !!n, consentOn: r?.consent_at ? saDay(new Date(r.consent_at as string)) : null, kinds: asList(r?.kinds).filter((k) => SMS_KINDS.includes(k as never)), kindList: SMS_KINDS.map((k) => ({ key: k, label: KIND_TEXT[k] })) };
  }
  /** Switches it on or off and sets what to be told about. Switching ON needs a confirmed number, the owner's explicit agreement, at least one kind, and the template to be set up. Switching off always works. */
  async function configure(owner: string, b: Record<string, unknown>): Promise<Res<Awaited<ReturnType<typeof status>>>> {
    if (typeof b.enabled !== "boolean") return bad(400, "Say whether alerts are on or off");
    const kinds = Array.isArray(b.kinds) ? [...new Set(b.kinds.map(String))] : null; if (kinds === null) return bad(400, "Choose what to be told about"); if (kinds.some((k) => !SMS_KINDS.includes(k as never))) return bad(400, "One of those kinds of alert is not one we send");
    const before = await row(owner);
    if (b.enabled) {
      if (!(await number(owner))) return bad(409, "Confirm your mobile number under Text alerts first: WhatsApp alerts use that number");
      if (b.consent !== true && !before?.consent_at) return bad(400, "Tick the box to say you agree to be sent alerts on WhatsApp");
      if (kinds.length === 0) return bad(400, "Choose at least one kind of alert, or switch it off");
      const why = unavailable(); if (why) return bad(503, why);
    }
    const consentAt = b.enabled && b.consent === true ? now().toISOString() : (before?.consent_at ? new Date(before.consent_at as string).toISOString() : null);
    await db.query(`DELETE FROM owner_whatsapp WHERE owner_id = $1`, [owner]);
    await db.query(`INSERT INTO owner_whatsapp (owner_id, enabled, kinds, consent_at, updated_at) VALUES ($1,$2,$3,$4,$5)`, [owner, b.enabled, JSON.stringify(kinds as SmsKind[]), consentAt, now().toISOString()]);
    return { ok: true, value: await status(owner) };
  }
  /** Withdraws consent and forgets the choices. */
  async function remove(owner: string): Promise<Res<{ removed: boolean }>> { const had = !!(await row(owner)); await db.query(`DELETE FROM owner_whatsapp WHERE owner_id = $1`, [owner]); return { ok: true, value: { removed: had } }; }

  async function sendTemplate(owner: string, kind: "daily" | "test", params: [string, string], keys: string[]): Promise<boolean> {
    const n = await number(owner), why = unavailable(); if (!n || why || !configured) { await log(owner, kind, "failed", keys, why ?? "no confirmed number"); return false; }
    const r = await configured.wa.sendTemplate(n.replace(/\D+/g, ""), tpl().name, tpl().language, [cleanParam(params[0], 60), cleanParam(params[1], 600)]);
    await log(owner, kind, r.ok ? "sent" : "failed", keys, r.ok ? null : "could not be sent"); return r.ok;                  // the provider's own message is never kept
  }
  /** A test message to the confirmed number, using the real template, three a day at most. */
  async function test(owner: string): Promise<Res<{ sent: true }>> {
    const r = await row(owner); if (!r?.consent_at) return bad(409, "Tick the box to say you agree, and save, before sending a test");
    if (!(await number(owner))) return bad(409, "Confirm your mobile number under Text alerts first");
    const why = unavailable(); if (why) return bad(503, why);
    if ((await since(owner, "test", 86_400_000)).filter((l) => saDay(new Date(l.sent_at as string)) === saDay(now())).length >= MAX_TESTS_PER_DAY) return bad(429, `You have sent ${MAX_TESTS_PER_DAY} test messages today: try again tomorrow`);
    return (await sendTemplate(owner, "test", ["this is only a test", "Nothing needs you. This is a test of your VINK WhatsApp alerts."], [])) ? { ok: true, value: { sent: true } } : bad(502, "The test could not be sent: check that this number is on WhatsApp");
  }
  /** The daily run: one message to each owner who has agreed, switched it on and chosen kinds, if anything NEW needs action. Safe to run as often as you like. */
  async function dispatch(): Promise<{ owners: number; sent: number; failed: number; quiet: number }> {
    const out = { owners: 0, sent: 0, failed: 0, quiet: 0 }, h = hourSA(now()); if (unavailable() || h < FROM_HOUR || h >= TO_HOUR) return out;
    const onDay = saDay(now());
    for (const r of (await db.query(`SELECT * FROM owner_whatsapp WHERE enabled = true AND consent_at IS NOT NULL`)).rows) {
      const owner = String(r.owner_id), kinds = asList(r.kinds).filter((k): k is SmsKind => SMS_KINDS.includes(k as never)); if (!(await number(owner))) continue; out.owners++; if (!kinds.length) { out.quiet++; continue; }
      const today = (await since(owner, "daily", 86_400_000)).filter((l) => saDay(new Date(l.sent_at as string)) === onDay);
      if (today.some((l) => l.status === "sent") || today.filter((l) => l.status === "failed").length >= MAX_FAILED_PER_DAY) { out.quiet++; continue; }
      const recent = new Set((await since(owner, "daily", REPEAT_DAYS * 86_400_000, "sent")).flatMap((l) => asList(l.keys))), fresh = (await gatherAttention(db, now, owner, kinds, onDay)).filter((f) => !recent.has(f.id));
      if (!fresh.length) { out.quiet++; continue; }
      const shown = fresh.slice(0, MAX_ITEMS), more = fresh.length - shown.length, count = `${fresh.length} thing${fresh.length === 1 ? " needs" : "s need"} you`, line = [...shown.map((f) => cleanParam(f.message, ITEM_CHARS)), ...(more > 0 ? [`+${more} more on your dashboard`] : [])].join(" | ");
      if (await sendTemplate(owner, "daily", [count, line], shown.map((f) => f.id))) out.sent++; else out.failed++;
    }
    return out;
  }
  /** A STOP on WhatsApp, from a number: switches off the alerts of every owner who confirmed that number, keeping their choices. Returns how many were switched off. */
  async function handleStop(waId: unknown): Promise<number> {
    const phone = typeof waId === "string" && /^\d{8,15}$/.test(waId.replace(/\D+/g, "")) ? normalizePhone(`+${waId.replace(/\D+/g, "")}`) : null; if (!phone) return 0;
    const rows = (await db.query(`SELECT w.owner_id, w.enabled FROM owner_whatsapp w JOIN owner_sms s ON s.owner_id = w.owner_id WHERE s.phone = $1 AND s.verified_at IS NOT NULL`, [phone])).rows; let n = 0;
    for (const r of rows) { await db.query(`UPDATE owner_whatsapp SET enabled = false, updated_at = $2 WHERE owner_id = $1`, [r.owner_id, now().toISOString()]); await log(String(r.owner_id), "stop", "sent"); if (r.enabled) n++; }
    return n;
  }
  return { status, configure, remove, test, dispatch, handleStop };
}
export type OwnerWhatsapp = ReturnType<typeof createOwnerWhatsapp>;
