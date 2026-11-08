import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import type { SmsSender } from "./alerts.js";
import { createOwnerFinance } from "./ownerFinance.js";
import { createOwnerCompliance } from "./ownerCompliance.js";
import { createDriverTargets } from "./driverTargets.js";

/**
 * TEXT (SMS) ALERTS FOR AN OWNER (docs/OWNER_DASHBOARD.md, slice F3). Strictly opt-in, and careful with a person's phone:
 *   the number     a message goes only to a number the owner has CONFIRMED with a code sent to it, so a mistyped number never gets someone else's business. A new number must be confirmed again, and switches everything off until the owner chooses again
 *   the choice     the owner picks which kinds of alert they want: money (loan instalments missed, unpaid fines, a vehicle losing money), servicing, compliance (licences and certificates), and what drivers owe. Nothing is chosen until they choose
 *   the limits     at most ONE summary a day, only between 07:00 and 19:00 South African time, only things that need action (high or medium), never the same thing twice within a week, and at most three tries in a day. The owner can switch it off, or delete their number, at any time
 *   what is kept   the number, what was chosen, and a log of what went when (never the message text). Deleting the number removes it
 * It sends through the platform's existing SMS service (Twilio). If that is not set up, nothing is sent and the owner is told so. WhatsApp is NOT used: it needs pre-approved message templates and each person's consent under WhatsApp's own rules.
 * Money amounts and registrations appear in the text, because that is what an owner wants to be told; it never includes a bank number or a password.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
export const SMS_KINDS = ["finance", "service", "compliance", "arrears"] as const;
export type SmsKind = (typeof SMS_KINDS)[number];
export const KIND_TEXT: Record<SmsKind, string> = { finance: "Money: a loan instalment missed, unpaid fines, a vehicle losing money", service: "Servicing: a service due or overdue", compliance: "Compliance: a licence, certificate or disc running out", arrears: "What drivers owe: a driver behind on payments" };
const PREFIX: Record<SmsKind, string[]> = { finance: ["fin:", "fines:", "pl:"], service: ["mnt:"], compliance: ["cc:"], arrears: ["pay:"] };
export const CODE_MINUTES = 10, MAX_ATTEMPTS = 5, MAX_CODES_PER_HOUR = 3, MAX_CODES_PER_DAY = 8, MAX_TESTS_PER_DAY = 3, MAX_FAILED_PER_DAY = 3, REPEAT_DAYS = 7, FROM_HOUR = 7, TO_HOUR = 19, MAX_LINES = 3, LINE_CHARS = 90;
const SEV = { high: 0, medium: 1, low: 2 } as const;
const hash = (owner: string, code: string) => createHash("sha256").update(`vink-owner-sms:${owner}:${code}`).digest("hex");
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
/** A phone number as +country digits. A South African number may be typed as 082 123 4567, 27821234567 or +27 82 123 4567; any other country needs its + code. Returns null if it is not a plausible mobile number. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null; let s = raw.trim().replace(/[\s\-().]/g, ""); if (!s || /[^+\d]/.test(s) || s.lastIndexOf("+") > 0) return null;
  if (s.startsWith("00")) s = `+${s.slice(2)}`; else if (s.startsWith("0") && !s.startsWith("+")) s = `+27${s.slice(1)}`; else if (!s.startsWith("+")) s = s.startsWith("27") ? `+${s}` : "";
  if (!/^\+\d{8,15}$/.test(s)) return null; if (s.startsWith("+27") && !/^\+27[678]\d{8}$/.test(s)) return null; return s;
}
export const maskPhone = (p: string) => `${p.slice(0, 3)} ${"•".repeat(Math.max(2, p.length - 7))} ${p.slice(-4)}`;
const hourSA = (d: Date) => (d.getUTCHours() + 2) % 24;
const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function createOwnerSms(deps: { db: Db; sms: SmsSender; now?: () => Date }) {
  const { db, sms } = deps, now = deps.now ?? (() => new Date()), configured = () => sms.name !== "unconfigured";
  const row = async (owner: string) => (await db.query(`SELECT * FROM owner_sms WHERE owner_id = $1`, [owner])).rows[0] ?? null;
  const log = (owner: string, kind: string, status: "sent" | "failed", keys: string[] = [], error: string | null = null) => db.query(`INSERT INTO owner_sms_log (owner_id, kind, sent_at, status, keys, error) VALUES ($1,$2,$3,$4,$5,$6)`, [owner, kind, now().toISOString(), status, JSON.stringify(keys), error ? error.slice(0, 200) : null]);
  const since = async (owner: string, kind: string, ms: number, status?: string) => (await db.query(`SELECT * FROM owner_sms_log WHERE owner_id = $1 AND kind = $2`, [owner, kind])).rows.filter((r) => new Date(r.sent_at as string).getTime() >= now().getTime() - ms && (!status || r.status === status));
  async function send(owner: string, kind: string, to: string, text: string, keys: string[] = []): Promise<boolean> { try { await sms.send(to, text); await log(owner, kind, "sent", keys); return true; } catch (e) { await log(owner, kind, "failed", keys, e instanceof Error ? e.message : String(e)); return false; } }

  /** What the owner sees: whether text alerts are possible, the number (hidden but for its end), whether it is confirmed, and what they chose. */
  async function status(owner: string) {
    const r = await row(owner); return { available: configured(), phone: r ? maskPhone(String(r.phone)) : null, verified: !!r?.verified_at, enabled: !!r?.enabled && !!r?.verified_at, kinds: ((r?.kinds as string[] | undefined) ?? []).filter((k) => SMS_KINDS.includes(k as never)), kindList: SMS_KINDS.map((k) => ({ key: k, label: KIND_TEXT[k] })), codePending: !!r?.code_hash && !r?.verified_at && !!r?.code_expires_at && new Date(r.code_expires_at as string) > now() };
  }
  /** Saves a number and sends it a code. A new number replaces the old one and starts again: unconfirmed, switched off, nothing chosen. */
  async function setPhone(owner: string, raw: unknown): Promise<Res<{ phone: string }>> {
    const phone = normalizePhone(raw); if (!phone) return bad(400, "Give a mobile number, for example 082 123 4567, or with the country code, for example +260 97 123 4567");
    if (!configured()) return bad(503, "Text messages are not switched on yet: the administrator needs to set up the SMS service");
    if ((await since(owner, "code", 3_600_000)).length >= MAX_CODES_PER_HOUR || (await since(owner, "code", 86_400_000)).length >= MAX_CODES_PER_DAY) return bad(429, "Too many codes have been asked for: please wait a while");
    const code = String(randomInt(100000, 1000000)), at = now().toISOString(); await db.query(`DELETE FROM owner_sms WHERE owner_id = $1`, [owner]);
    await db.query(`INSERT INTO owner_sms (owner_id, phone, code_hash, code_expires_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`, [owner, phone, hash(owner, code), new Date(now().getTime() + CODE_MINUTES * 60_000).toISOString(), at]);
    if (!(await send(owner, "code", phone, `VINK: your code is ${code}. It works for ${CODE_MINUTES} minutes. If you did not ask for it, ignore this message.`))) { await db.query(`DELETE FROM owner_sms WHERE owner_id = $1`, [owner]); return bad(502, "The code could not be sent to that number: check it and try again"); }
    return { ok: true, value: { phone: maskPhone(phone) } };
  }
  /** Confirms the number with the code sent to it. Five wrong tries and the code is dead: ask for a new one. */
  async function verify(owner: string, code: unknown): Promise<Res<{ verified: true }>> {
    const r = await row(owner); if (!r) return bad(404, "Give your number first"); if (r.verified_at) return { ok: true, value: { verified: true } };
    if (!r.code_hash || !r.code_expires_at || new Date(r.code_expires_at as string) <= now()) return bad(410, "That code has run out: ask for a new one");
    if (Number(r.code_attempts) >= MAX_ATTEMPTS) { await db.query(`UPDATE owner_sms SET code_hash = NULL WHERE owner_id = $1`, [owner]); return bad(429, "Too many wrong tries: ask for a new code"); }
    const c = typeof code === "string" ? code.trim() : ""; if (!/^\d{6}$/.test(c)) return bad(400, "The code is six digits");
    if (!safeEq(hash(owner, c), String(r.code_hash))) { await db.query(`UPDATE owner_sms SET code_attempts = code_attempts + 1 WHERE owner_id = $1`, [owner]); return bad(400, "That is not the code"); }
    await db.query(`UPDATE owner_sms SET verified_at = $2, code_hash = NULL, code_expires_at = NULL, code_attempts = 0, updated_at = $2 WHERE owner_id = $1`, [owner, now().toISOString()]); return { ok: true, value: { verified: true } };
  }
  /** Switches alerts on or off and chooses the kinds. Only a confirmed number; switching on needs at least one kind. */
  async function configure(owner: string, b: Record<string, unknown>): Promise<Res<{ enabled: boolean; kinds: string[] }>> {
    const r = await row(owner); if (!r || !r.verified_at) return bad(409, "Confirm your number first"); if (typeof b.enabled !== "boolean") return bad(400, "Say whether alerts are on or off");
    const kinds = Array.isArray(b.kinds) ? [...new Set(b.kinds)] : null; if (!kinds || kinds.some((k) => !SMS_KINDS.includes(k as never))) return bad(400, "Choose from money, servicing, compliance and what drivers owe");
    if (b.enabled && kinds.length === 0) return bad(400, "Choose at least one kind of alert to switch on"); await db.query(`UPDATE owner_sms SET enabled = $2, kinds = $3, updated_at = $4 WHERE owner_id = $1`, [owner, b.enabled, JSON.stringify(kinds), now().toISOString()]); return { ok: true, value: { enabled: b.enabled, kinds: kinds as string[] } };
  }
  /** Deletes the number and every choice. */
  async function remove(owner: string): Promise<Res<{ removed: boolean }>> { const had = !!(await row(owner)); await db.query(`DELETE FROM owner_sms WHERE owner_id = $1`, [owner]); return { ok: true, value: { removed: had } }; }
  /** Sends a test message to the confirmed number, to show it works. Three a day. */
  async function test(owner: string): Promise<Res<{ sent: true }>> {
    const r = await row(owner); if (!r || !r.verified_at) return bad(409, "Confirm your number first"); if (!configured()) return bad(503, "Text messages are not switched on yet: the administrator needs to set up the SMS service");
    if ((await since(owner, "test", 86_400_000)).length >= MAX_TESTS_PER_DAY) return bad(429, "That is enough test messages for today");
    return (await send(owner, "test", String(r.phone), "VINK: this is a test. Your text alerts are working.")) ? { ok: true, value: { sent: true } } : bad(502, "The test message could not be sent");
  }

  /** What needs the owner's action right now, for the kinds they chose: high and medium things only, most serious first. */
  async function candidates(owner: string, kinds: SmsKind[], onDay: string): Promise<{ id: string; severity: "high" | "medium" | "low"; message: string }[]> {
    const all: { id: string; severity: "high" | "medium" | "low"; message: string }[] = [];
    if (kinds.includes("finance")) all.push(...(await createOwnerFinance(db, now).finances(owner, onDay)).flags, ...((await createOwnerFinance(db, now).overview(owner, onDay)).flags));
    if (kinds.includes("service")) all.push(...(await createOwnerFinance(db, now).maintenanceStatus(owner, onDay)).flags);
    if (kinds.includes("compliance")) all.push(...((await createOwnerCompliance(db, now).centre(owner, onDay)) as { flags: { id: string; severity: "high" | "medium" | "low"; message: string }[] }).flags);
    if (kinds.includes("arrears")) all.push(...((await createDriverTargets(db, now).fleet(owner, onDay)) as { flags: { id: string; severity: "high" | "medium" | "low"; message: string }[] }).flags);
    const seen = new Set<string>(); return all.filter((f) => (f.severity === "high" || f.severity === "medium") && kinds.some((k) => PREFIX[k].some((p) => f.id.startsWith(p))) && !seen.has(f.id) && !!seen.add(f.id)).sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.message.localeCompare(b.message));
  }
  /** The daily run: for each owner who has confirmed a number, switched alerts on and chosen kinds, send ONE summary of what needs action, if anything new does. Safe to run as often as you like. */
  async function dispatch(): Promise<{ owners: number; sent: number; failed: number; quiet: number }> {
    const out = { owners: 0, sent: 0, failed: 0, quiet: 0 }; const h = hourSA(now()); if (!configured() || h < FROM_HOUR || h >= TO_HOUR) return out;
    const onDay = saDay(now()), owners = (await db.query(`SELECT * FROM owner_sms WHERE enabled = true AND verified_at IS NOT NULL`)).rows;
    for (const r of owners) {
      out.owners++; const owner = String(r.owner_id), kinds = ((r.kinds as string[]) ?? []).filter((k): k is SmsKind => SMS_KINDS.includes(k as never)); if (!kinds.length) { out.quiet++; continue; }
      const today = (await db.query(`SELECT * FROM owner_sms_log WHERE owner_id = $1 AND kind = 'daily'`, [owner])).rows.filter((l) => saDay(new Date(l.sent_at as string)) === onDay);
      if (today.some((l) => l.status === "sent") || today.filter((l) => l.status === "failed").length >= MAX_FAILED_PER_DAY) { out.quiet++; continue; }
      const recent = new Set((await since(owner, "daily", REPEAT_DAYS * 86_400_000, "sent")).flatMap((l) => (l.keys as string[]) ?? [])), fresh = (await candidates(owner, kinds, onDay)).filter((f) => !recent.has(f.id));
      if (!fresh.length) { out.quiet++; continue; }
      const shown = fresh.slice(0, MAX_LINES), more = fresh.length - shown.length, text = `VINK: ${fresh.length} thing${fresh.length === 1 ? " needs" : "s need"} you.\n${shown.map((f) => `- ${trim(f.message, LINE_CHARS)}`).join("\n")}${more > 0 ? `\n+${more} more on your dashboard.` : ""}\nSwitch off under Text alerts.`;
      if (await send(owner, "daily", String(r.phone), text, shown.map((f) => f.id))) out.sent++; else out.failed++;
    }
    return out;
  }
  return { status, setPhone, verify, configure, remove, test, dispatch, candidates };
}
export type OwnerSms = ReturnType<typeof createOwnerSms>;
