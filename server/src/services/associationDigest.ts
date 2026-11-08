import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import type { EmailSender } from "../auth/email.js";
import { EMAIL } from "./delegates.js";
import { createCompliance, flagSort, type Flag } from "./compliance.js";
import { createFinance } from "./finance.js";
import { createGovernance } from "./governance.js";
import { createSafety } from "./safety.js";

/**
 * THE ASSOCIATION'S EMAIL DIGEST (docs/ASSOCIATION_COMPLIANCE.md, module 13): a short email, weekly or monthly, of what needs attention, to the people the association chooses, so the executive does not have to open the dashboard to know.
 *   content     the same things the dashboard shows, from compliance, finance, governance and safety, most serious first: what needs action now, what needs action soon, and the expiries in the next 30 days. Nothing is worked out differently here
 *   who         the main login chooses up to five addresses and can change or stop it at any time. The digest names vehicles, drivers and members, so the screen says to add only people who may see that
 *   when        on the chosen weekday (weekly) or day of the month (monthly), once per period and never twice, between 07:00 and 19:00 South African time; if the server was off on the day it is sent when it is next on, within the same period
 *   quiet       if nothing needs attention it is not sent (a week of nothing is not an email), unless the association asks for it
 *   each person gets their own email, so addresses are not shown to each other. Every send, skip and failure is on a record the association can see
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
export const MAX_RECIPIENTS = 5, MAX_TESTS_PER_DAY = 3, MAX_FAILED_TRIES = 3, SEND_FROM_HOUR = 7, SEND_UNTIL_HOUR = 19;
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const isoWeekday = (day: string) => ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;                  // 1 Monday .. 7 Sunday
export const mondayOf = (day: string) => shift(day, -(isoWeekday(day) - 1));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const rand = (c: number) => `R${(c / 100).toFixed(2)}`;
const asList = (v: unknown): string[] => { let x = v; if (typeof x === "string") { try { x = JSON.parse(x); } catch { x = []; } } return Array.isArray(x) ? x.map(String) : []; };
export interface Settings { enabled: boolean; frequency: "weekly" | "monthly"; weekday: number; dayOfMonth: number; recipients: string[]; sendWhenQuiet: boolean; when: string }
export interface Digest { subject: string; text: string; html: string; needsAttention: number; urgent: number; soon: number }

/** `summaries` lets a test supply the four module summaries; the real server never does. */
export function createAssociationDigest(deps: { db: Db; mail: EmailSender; now?: () => Date; frontendUrl?: string; summaries?: (assoc: string, onDay: string) => Promise<unknown[]> }) {
  const db = deps.db, now = deps.now ?? (() => new Date()), site = (deps.frontendUrl ?? "https://www.vink.co.za").replace(/\/+$/, "");
  const comp = createCompliance(db, now), fin = createFinance(db, now), gov = createGovernance(db, now), saf = createSafety(db, now);
  const view = (r: Record<string, unknown> | undefined): Settings => { const frequency = r?.frequency === "monthly" ? "monthly" : "weekly", weekday = Number(r?.weekday ?? 1), dom = Number(r?.day_of_month ?? 1); return { enabled: !!r?.enabled, frequency, weekday, dayOfMonth: dom, recipients: asList(r?.recipients), sendWhenQuiet: !!r?.send_when_quiet, when: frequency === "weekly" ? `every ${WEEKDAYS[weekday - 1]}` : `on the ${dom}${dom % 10 === 1 && dom !== 11 ? "st" : dom % 10 === 2 && dom !== 12 ? "nd" : dom % 10 === 3 && dom !== 13 ? "rd" : "th"} of each month` }; };
  async function get(assoc: string): Promise<Settings> { return view((await db.query(`SELECT * FROM association_digests WHERE association_id = $1`, [assoc])).rows[0]); }
  async function save(assoc: string, by: string, b: Record<string, unknown>): Promise<Res<Settings>> {
    if (typeof b.enabled !== "boolean") return bad(400, "Say whether the digest is on or off"); if (b.frequency !== "weekly" && b.frequency !== "monthly") return bad(400, "Choose weekly or monthly");
    const weekday = b.weekday === undefined ? 1 : b.weekday, dom = b.dayOfMonth === undefined ? 1 : b.dayOfMonth; if (!Number.isInteger(weekday) || (weekday as number) < 1 || (weekday as number) > 7) return bad(400, "Choose a day of the week"); if (!Number.isInteger(dom) || (dom as number) < 1 || (dom as number) > 28) return bad(400, "Choose a day of the month from 1 to 28, so it falls in every month");
    if (!Array.isArray(b.recipients)) return bad(400, "Give the email addresses to send it to"); if (b.recipients.some((x) => typeof x !== "string")) return bad(400, "One of the email addresses is not a valid email address"); const list = [...new Set(b.recipients.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")))].filter(Boolean);
    if (list.length > MAX_RECIPIENTS) return bad(400, `Up to ${MAX_RECIPIENTS} email addresses`); const wrong = list.find((x) => !EMAIL.test(x) || x.length > 200); if (wrong !== undefined) return bad(400, `"${wrong.slice(0, 60)}" is not a valid email address`); if (b.enabled && list.length === 0) return bad(400, "Give at least one email address, or switch the digest off");
    if (b.sendWhenQuiet !== undefined && typeof b.sendWhenQuiet !== "boolean") return bad(400, "Say whether to send it when nothing needs attention");
    await db.query(`DELETE FROM association_digests WHERE association_id = $1`, [assoc]);
    await db.query(`INSERT INTO association_digests (association_id, enabled, frequency, weekday, day_of_month, recipients, send_when_quiet, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [assoc, b.enabled, b.frequency, weekday, dom, JSON.stringify(list), b.sendWhenQuiet === true, by, now().toISOString()]);
    return { ok: true, value: await get(assoc) };
  }
  /** What the digest would say today, exactly as it would be emailed. Nothing is sent. */
  async function compose(assoc: string, onDay = saDay(now())): Promise<Digest> {
    const name = String((await db.query(`SELECT name FROM users WHERE id = $1`, [assoc])).rows[0]?.name ?? "Your association");
    const [c, f, g, s] = (deps.summaries ? await deps.summaries(assoc, onDay) : [await comp.summary(assoc, onDay), await fin.summary(assoc, onDay), await gov.summary(assoc, onDay), await saf.summary(assoc, onDay)]) as any[];
    const flags: Flag[] = [...(c.flags ?? []), ...(f.flags ?? []), ...(g.flags ?? []), ...(s.flags ?? [])].sort(flagSort), urgent = flags.filter((x) => x.severity === "high"), soon = flags.filter((x) => x.severity === "medium"), low = flags.length - urgent.length - soon.length;
    const expiries = (c.expiries ?? []).filter((e: { days: number }) => e.days >= 0 && e.days <= 30).slice(0, 8) as { kind: string; subject: string; expiresOn: string; days: number }[];
    const m = c.measures ?? {}, lines: string[] = [];
    lines.push(`${name}: your digest for ${onDay}`, "");
    const n = urgent.length + soon.length; lines.push(n === 0 ? "Nothing needs your attention today." : `${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} your attention: ${urgent.length} need action now and ${soon.length} soon.`, "");
    if (typeof m.vehicles === "number") lines.push(`Vehicles: ${m.vehiclesLicensed} of ${m.vehicles} have a valid operating licence${m.licensedPercent === null || m.licensedPercent === undefined ? "" : ` (${m.licensedPercent}%)`}. Drivers: ${m.driversWithValidPermit} of ${m.drivers} have a valid driving permit.`);
    if (f.measures && typeof f.measures.membersOverdue === "number") lines.push(`Members overdue with their fees: ${f.measures.membersOverdue}${f.measures.overdueCents ? ` (${rand(f.measures.overdueCents)} in all)` : ""}.`);
    if (g.measures && typeof g.measures.overdueResolutions === "number") lines.push(`Resolutions past their action date: ${g.measures.overdueResolutions}.`);
    const block = (title: string, items: Flag[]) => { if (!items.length) return; lines.push("", title); for (const x of items.slice(0, 12)) lines.push(`- ${x.message}`); if (items.length > 12) lines.push(`- and ${items.length - 12} more on the dashboard`); };
    block("NEEDS ACTION NOW", urgent); block("NEEDS ACTION SOON", soon);
    if (expiries.length) { lines.push("", "RUNNING OUT IN THE NEXT 30 DAYS"); for (const e of expiries) lines.push(`- ${e.kind}, ${e.subject}: ${e.expiresOn} (${e.days === 0 ? "today" : e.days === 1 ? "tomorrow" : `in ${e.days} days`})`); }
    if (low > 0) lines.push("", `${low} smaller note${low === 1 ? "" : "s"} are on the dashboard.`);
    lines.push("", `Open the dashboard: ${site}`, "", "You are getting this because the association chose to email its digest to you. The association's main login can change or stop it at any time. It names vehicles, drivers and members: please do not forward it.");
    const text = lines.join("\n") + "\n", html = `<!doctype html><html><body style="font-family:system-ui,Segoe UI,sans-serif;color:#241416;line-height:1.55;max-width:560px;margin:0 auto;padding:16px"><div style="font-weight:800;font-size:20px;color:#8b0000">VINK</div>${lines.map((l) => (l === "" ? "<br>" : l.startsWith("- ") ? `<div style="margin-left:14px">• ${esc(l.slice(2))}</div>` : /^[A-Z][A-Z ,0-9-]+$/.test(l) ? `<div style="font-weight:700;margin-top:6px">${esc(l)}</div>` : `<div>${esc(l)}</div>`)).join("")}</body></html>`;
    return { subject: `${name.slice(0, 80)}: ${n === 0 ? "nothing needs attention" : `${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention`} (${onDay})`, text, html, needsAttention: n, urgent: urgent.length, soon: soon.length };
  }
  const log = async (assoc: string, period: string, status: string, recipients: number, note: string | null) => { await db.query(`INSERT INTO association_digest_log (association_id, period, status, recipients, note, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [assoc, period, status, recipients, note, now().toISOString()]); };
  /** Emails each recipient their own copy. Returns how many were sent. A failure for one never stops the others, and the provider's own message is never kept. */
  async function deliver(d: Digest, to: string[]): Promise<{ sent: number; failed: number }> { let sent = 0, failed = 0; for (const addr of to) { try { await deps.mail.send({ to: addr, subject: d.subject, text: d.text, html: d.html }); sent++; } catch (e) { failed++; console.error("[digest] not sent to one recipient:", e instanceof Error ? e.message.slice(0, 80) : "error"); } } return { sent, failed }; }
  const periodOf = (s: Settings, day: string) => (s.frequency === "weekly" ? mondayOf(day) : day.slice(0, 7));
  /** Sends the digest now to the chosen addresses as a test (at most three a day), not counting as the period's digest. */
  async function sendTest(assoc: string): Promise<Res<{ sent: number; failed: number }>> {
    const s = await get(assoc); if (s.recipients.length === 0) return bad(409, "Give at least one email address first");
    const day = saDay(now()), tests = (await db.query(`SELECT created_at FROM association_digest_log WHERE association_id = $1 AND status = 'test'`, [assoc])).rows.filter((r) => saDay(new Date(r.created_at as string)) === day).length; if (tests >= MAX_TESTS_PER_DAY) return bad(429, `You have sent ${MAX_TESTS_PER_DAY} test emails today: try again tomorrow`);
    if (deps.mail.name === "unconfigured") return bad(503, "Email is not set up yet, so nothing can be sent: the administrator needs to set up the email service");
    const r = await deliver(await compose(assoc, day), s.recipients); await log(assoc, periodOf(s, day), "test", r.sent, r.failed ? `${r.failed} could not be sent` : null); if (r.sent === 0) return bad(502, "The email could not be sent: check the addresses and try again"); return { ok: true, value: r };
  }
  /** Sends every digest that is due. Safe to run as often as you like: each association gets at most one per period. */
  async function runDue(at?: Date): Promise<{ checked: number; sent: number; skipped: number; failed: number }> {
    const t = at ?? now(), day = saDay(t), hour = new Date(t.getTime() + 2 * 3_600_000).getUTCHours(), out = { checked: 0, sent: 0, skipped: 0, failed: 0 };
    if (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR || deps.mail.name === "unconfigured") return out;
    for (const r of (await db.query(`SELECT * FROM association_digests WHERE enabled = true`)).rows) {
      const assoc = String(r.association_id), s = view(r); if (s.recipients.length === 0) continue; out.checked++;
      const due = s.frequency === "weekly" ? isoWeekday(day) >= s.weekday : Number(day.slice(8, 10)) >= s.dayOfMonth; if (!due) continue;
      const period = periodOf(s, day), rows = (await db.query(`SELECT status FROM association_digest_log WHERE association_id = $1 AND period = $2`, [assoc, period])).rows.map((x) => String(x.status));
      if (rows.includes("sent") || rows.includes("skipped") || rows.filter((x) => x === "failed").length >= MAX_FAILED_TRIES) continue;
      try {
        const d = await compose(assoc, day); if (d.needsAttention === 0 && !s.sendWhenQuiet) { await log(assoc, period, "skipped", 0, "nothing needed attention"); out.skipped++; continue; }
        const r2 = await deliver(d, s.recipients); if (r2.sent > 0) { await log(assoc, period, "sent", r2.sent, r2.failed ? `${r2.failed} could not be sent` : null); out.sent++; } else { await log(assoc, period, "failed", 0, "none could be sent"); out.failed++; }
      } catch (e) { console.error("[digest] could not be made:", e instanceof Error ? e.message.slice(0, 80) : "error"); await log(assoc, period, "failed", 0, "could not be made"); out.failed++; }
    }
    return out;
  }
  async function history(assoc: string) { return (await db.query(`SELECT period, status, recipients, note, created_at FROM association_digest_log WHERE association_id = $1 ORDER BY created_at DESC LIMIT 20`, [assoc])).rows.map((r) => ({ period: String(r.period), status: String(r.status), recipients: Number(r.recipients), note: (r.note as string | null) ?? null, at: new Date(r.created_at as string).toISOString() })); }
  return { get, save, compose, sendTest, runDue, history };
}
export type AssociationDigest = ReturnType<typeof createAssociationDigest>;
