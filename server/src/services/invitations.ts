import type { Db } from "../portal/common.js";
import type { AuthFlows } from "../auth/flows.js";
import { randomUUID } from "node:crypto";

/**
 * EMAILED INVITATIONS (docs/OWNER_DASHBOARD.md, docs/ASSOCIATION_COMPLIANCE.md): instead of handing a new login-holder a one-time password, email them a link so they choose THEIR OWN. The password never passes through the owner's or the association's hands, and nobody can sign in as them until they do.
 * It uses the platform's own password-reset flow, so it has the same protection: the link works once, only the newest link works, and using it signs the person out everywhere.
 *   needs        the platform's email service (RESEND_API_KEY and EMAIL_FROM). With none set up it says so and does nothing, and the caller falls back to a one-time password
 *   limits       at most five invitations to the same person in a day, so it cannot be used to flood someone's inbox
 *   records      that an invitation was sent and to whom (never the link), so the limit can be counted and the history is on the record
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
export const MAX_PER_DAY = 5;
let configured: { flows: AuthFlows; mailName: string } | null = null;
/** Called once at start-up with the real authentication flows. Null switches it off (tests do this). */
export const configureInvitations = (d: { flows: AuthFlows; mailName: string } | null) => { configured = d; };

export function createInvitations(db: Db, now: () => Date = () => new Date()) {
  /** Whether an invitation can be emailed right now, and if not, why. */
  function available(): Res<{ available: true }> {
    if (!configured) return { ok: false, status: 503, error: "Invitations are not set up on this server" };
    if (configured.mailName === "unconfigured") return { ok: false, status: 503, error: "Email is not set up yet, so an invitation cannot be sent: the administrator needs to set up the email service, or use a one-time password instead" };
    return { ok: true, value: { available: true } };
  }
  async function send(userId: string, o: { by: string; what: string }): Promise<Res<{ sent: true }>> {
    const a = available(); if (!a.ok) return a;
    const since = now().getTime() - 86_400_000, sent = (await db.query(`SELECT created_at FROM audit_log WHERE action = 'invite.sent' AND target = $1`, [userId])).rows.filter((r) => new Date(r.created_at as string).getTime() > since).length;
    if (sent >= MAX_PER_DAY) return { ok: false, status: 429, error: "That person has been sent enough invitations today: ask them to check their email, or try again tomorrow" };
    try { await configured!.flows.invite(userId, o); } catch (e) { console.error("[invite] not sent:", e instanceof Error ? e.message : e); return { ok: false, status: 502, error: "The invitation could not be emailed: check the address and try again" }; }
    await db.query(`INSERT INTO audit_log (id, actor_id, actor_name, action, target, details, created_at) VALUES ($1,NULL,'invitation','invite.sent',$2,'{}',$3)`, [randomUUID(), userId, now().toISOString()]);
    return { ok: true, value: { sent: true } };
  }
  return { available, send };
}
export type Invitations = ReturnType<typeof createInvitations>;
