import type { Db } from "../portal/driverRoutes.js";
import type { LedgerPort } from "./moneyEngine.js";
import { reconcile, type Issue } from "./reconciliation.js";
import type { EmailSender } from "../auth/email.js";

/**
 * Watches the money system and tells a person when something needs them, without nagging.
 *
 * Every check runs the reconciliation plus a few health checks. An issue is sent once when it first appears, again as a reminder
 * (every hour for a problem, every day for something that only needs attention) while it stays, and once more when it clears.
 * What was already sent is remembered in ops_alert_state, so a restart never repeats the same alert.
 * A sink that is down never loses an alert: the issue stays unsent and is tried again at the next check.
 */
export type AlertSeverity = "problem" | "attention" | "resolved";
export interface AlertMessage { severity: AlertSeverity; code: string; title: string; text: string }
export interface AlertSink { readonly name: string; send(m: AlertMessage): Promise<void> }

/** Slack-compatible incoming webhook (also accepted by Mattermost and Discord's /slack route): POST {"text": "..."}. */
export class WebhookSink implements AlertSink {
  readonly name = "webhook";
  constructor(private readonly url: string, private readonly fetchImpl: typeof fetch = fetch) {
    if (!/^https:\/\//i.test(url)) throw new Error("The alert webhook URL must be https");
  }
  async send(m: AlertMessage): Promise<void> {
    const icon = m.severity === "problem" ? ":red_circle:" : m.severity === "attention" ? ":large_yellow_circle:" : ":white_check_mark:";
    const res = await this.fetchImpl(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `${icon} *${m.title}*\n${m.text}` }), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`The alert webhook answered ${res.status}`);
  }
}

export class EmailSink implements AlertSink {
  readonly name = "email";
  constructor(private readonly sender: EmailSender, private readonly to: string) {}
  async send(m: AlertMessage): Promise<void> {
    const subject = `[VINK ${m.severity}] ${m.title}`.slice(0, 150);
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    await this.sender.send({ to: this.to, subject, text: m.text, html: `<p>${esc(m.text)}</p>` });
  }
}

export interface MonitorDeps {
  db: Db; ledger: LedgerPort; sinks: AlertSink[];
  now?: () => Date;
  /** Minutes before a still-open issue is sent again. */
  repeatMinutes?: { problem: number; attention: number };
}
export interface MonitorState { code: string; severity: string; message: string; count: number; firstSeen: string; lastSent: string | null; resolvedAt: string | null }

export function createOpsMonitor(deps: MonitorDeps) {
  const { db, ledger, sinks } = deps;
  const now = deps.now ?? (() => new Date());
  const repeat = deps.repeatMinutes ?? { problem: 60, attention: 24 * 60 };

  /** Health checks beyond the reconciliation. */
  async function extraIssues(at: Date): Promise<Issue[]> {
    const out: Issue[] = [];
    const hourAgo = new Date(at.getTime() - 3600_000);
    const r = (await db.query(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END),0) AS declined FROM token_card_spend WHERE created_at >= $1`, [hourAgo])).rows[0] as Record<string, unknown>;
    const total = Number(r?.total ?? 0), declined = Number(r?.declined ?? 0);
    if (total >= 20 && declined / total >= 0.5) out.push({ severity: "attention", code: "card_declines_high", message: `Over half of the card purchases in the last hour were declined (${declined} of ${total}). Check the decline reasons: this is either a real problem with the card service or a run of fraud attempts.`, count: declined });
    return out;
  }

  async function saveState(i: Issue, at: Date, sent: boolean, existing: Record<string, unknown> | undefined) {
    if (!existing) {
      await db.query(`INSERT INTO ops_alert_state (code, severity, message, count, first_seen, last_sent, resolved_at) VALUES ($1,$2,$3,$4,$5,$6,NULL)`, [i.code, i.severity, i.message, i.count, at, sent ? at : null]);
    } else if (existing.resolved_at) {
      await db.query(`UPDATE ops_alert_state SET severity = $2, message = $3, count = $4, first_seen = $5, last_sent = $6, resolved_at = NULL WHERE code = $1`, [i.code, i.severity, i.message, i.count, at, sent ? at : null]);
    } else {
      await db.query(`UPDATE ops_alert_state SET severity = $2, message = $3, count = $4, last_sent = $5 WHERE code = $1`, [i.code, i.severity, i.message, i.count, sent ? at : (existing.last_sent ?? null)]);
    }
  }

  /** Sends to every sink. true when at least one took it (or there are none, so the alert is only logged). */
  async function deliver(m: AlertMessage): Promise<boolean> {
    if (!sinks.length) { console.warn(`[ops] ${m.severity}: ${m.title} — ${m.text}`); return true; }
    let any = false;
    for (const s of sinks) {
      try { await s.send(m); any = true; } catch (e) { console.error(`[ops] ${s.name} could not send "${m.code}":`, e instanceof Error ? e.message : e); }
    }
    return any;
  }

  async function check(): Promise<{ checkedAt: string; issues: Issue[]; sent: number }> {
    const at = now();
    const issues = [...(await reconcile(db, ledger, at)).issues, ...(await extraIssues(at))];
    const rows = (await db.query(`SELECT * FROM ops_alert_state`)).rows as Record<string, unknown>[];
    const byCode = new Map(rows.map((r) => [String(r.code), r]));
    let sent = 0;
    for (const i of issues) {
      const ex = byCode.get(i.code);
      const open = ex && !ex.resolved_at;
      const lastSent = ex?.last_sent ? new Date(String(ex.last_sent)).getTime() : null;
      const dueAgain = lastSent === null || at.getTime() - lastSent >= (i.severity === "problem" ? repeat.problem : repeat.attention) * 60_000;
      if (open && !dueAgain) { await saveState(i, at, false, ex); continue; }                   // still open and already told: just keep the figures fresh
      const reminder = !!open && lastSent !== null;
      const ok = await deliver({ severity: i.severity, code: i.code, title: `${reminder ? "Still open: " : ""}${i.code.replace(/_/g, " ")}`, text: `${i.message} (${i.count})` });
      if (ok) sent++;
      await saveState(i, at, ok, ex);
    }
    const current = new Set(issues.map((i) => i.code));
    for (const ex of rows) {
      if (ex.resolved_at || current.has(String(ex.code))) continue;
      const ok = await deliver({ severity: "resolved", code: String(ex.code), title: `Cleared: ${String(ex.code).replace(/_/g, " ")}`, text: "This is no longer reported." });
      if (ok) { sent++; await db.query(`UPDATE ops_alert_state SET resolved_at = $2 WHERE code = $1`, [String(ex.code), at]); }
    }
    return { checkedAt: at.toISOString(), issues, sent };
  }

  async function state(): Promise<MonitorState[]> {
    const rows = (await db.query(`SELECT * FROM ops_alert_state ORDER BY first_seen DESC`)).rows as Record<string, unknown>[];
    const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
    return rows.map((r) => ({ code: String(r.code), severity: String(r.severity), message: String(r.message), count: Number(r.count), firstSeen: iso(r.first_seen)!, lastSent: iso(r.last_sent), resolvedAt: iso(r.resolved_at) }));
  }

  return { check, state, sinkNames: () => sinks.map((s) => s.name) };
}
export type OpsMonitor = ReturnType<typeof createOpsMonitor>;

/** Sinks from the environment: ALERT_WEBHOOK_URL (Slack-style) and/or ALERT_EMAIL_TO (sent through the platform's email sender). */
export function sinksFromEnv(env: NodeJS.ProcessEnv, email: EmailSender): AlertSink[] {
  const out: AlertSink[] = [];
  const url = env.ALERT_WEBHOOK_URL?.trim(), to = env.ALERT_EMAIL_TO?.trim();
  if (url) { try { out.push(new WebhookSink(url)); } catch (e) { console.error("[ops]", e instanceof Error ? e.message : e); } }
  if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) out.push(new EmailSink(email, to));
  return out;
}
