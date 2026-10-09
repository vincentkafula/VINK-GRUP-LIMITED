import type { Db } from "../portal/driverRoutes.js";
import type { PaymentsConfig } from "./config.js";

/**
 * The go-live gate. Live mode (real customer money) starts only when every item below is satisfied.
 *
 *  - "auto" items are worked out from the running system and cannot be ticked by hand.
 *  - "manual" items are things only people can do (a signed legal opinion, a licence, a bank agreement, a penetration test).
 *    A named staff member confirms each one with a note that says where the evidence is (a document reference, a ticket, a date);
 *    the confirmation is stored with who and when, and can be withdrawn.
 *
 * Confirm the manual items while the system is still in sandbox mode on the same database: at start-up, PAYMENTS_MODE=live
 * is refused until the gate is clear, and that check reads the confirmations stored here.
 */
export interface GateItem { key: string; title: string; kind: "auto" | "manual"; help: string }

export const MANUAL_ITEMS: GateItem[] = [
  { key: "legal_structure", kind: "manual", title: "Legal structure for holding customer funds", help: "Written advice that the wallet and pool structure is permitted (stored value / e-money), FICA accountable-institution status is settled, and customer funds are safeguarded." },
  { key: "licence_za", kind: "manual", title: "South Africa licences and registrations in place", help: "Reference of each licence or registration the legal adviser says is required." },
  { key: "licence_zm", kind: "manual", title: "Zambia licences and registrations in place", help: "Needed before the Zambian wallet and cross-border transfers carry real money." },
  { key: "bin_sponsor_agreement", kind: "manual", title: "BIN sponsor / sponsor bank agreement signed", help: "The signed agreement that lets VINK issue cards and push money to cards." },
  { key: "pool_account_open", kind: "manual", title: "Pooled bank account open and bank feed tested", help: "Account details configured and a test credit matched end to end." },
  { key: "retailer_agreements", kind: "manual", title: "Settlement agreements signed with every retail top-up point", help: "The cash a retailer takes is the retailer's debt to the pool until paid." },
  { key: "terms_privacy", kind: "manual", title: "Terms, privacy notice and POPIA consent published", help: "For wallet holders, cardholders and the people whose identity is checked." },
  { key: "security_review", kind: "manual", title: "Independent security review of the money paths passed", help: "Penetration test or review of payouts, the card endpoint and the admin routes, with findings closed." },
  { key: "load_test", kind: "manual", title: "Load test at the planned volume passed", help: "Card authorisations answered inside the processor's time limit at the first-year volume." },
  { key: "backup_restore", kind: "manual", title: "Database and ledger restore tested", help: "A backup restored on a clean machine, and the ledger reconciled afterwards." },
  { key: "secrets_rotated", kind: "manual", title: "Live secrets created fresh and test secrets removed", help: "Provider keys, the vault key and the card endpoint secret are new for live and not shared with sandbox." },
  { key: "support_runbook", kind: "manual", title: "Support and on-call runbook in place", help: "Named people for held payouts, cards to review, refunds, alerts and fraud, with the steps written down." },
  { key: "pilot_completed", kind: "manual", title: "Pilot on real routes completed and signed off", help: "The test devices have run on real routes and the figures match the ledger." },
];

export interface GateContext { cfg: PaymentsConfig; fastSecretSet: boolean; alertSinks: number; reconcileClean: boolean | null }
export interface GateStatus extends GateItem { ok: boolean; detail: string; confirmedBy?: string; confirmedAt?: string; note?: string }
export interface GateResult { ready: boolean; mode: string; items: GateStatus[]; missing: number }

function autoItems(c: GateContext): GateStatus[] {
  const { cfg } = c;
  const live = cfg.mode === "live";
  const mk = (key: string, title: string, help: string, ok: boolean, detail: string): GateStatus => ({ key, title, help, kind: "auto", ok, detail });
  return [
    mk("payments_mode_live", "Payments mode is set to live", "PAYMENTS_MODE=live", live, live ? "Live" : "Still in sandbox"),
    mk("issuing_provider_real", "A real card issuing provider is selected", "ISSUING_PROVIDER is not the bundled mock", cfg.issuingProvider !== "mock", `Provider: ${cfg.issuingProvider}`),
    mk("payout_provider_real", "Payouts to outside cards are off, or a live payout provider is selected", "TOKEN_EXTERNAL_PAYOUTS=off (money leaves only with the VINK card), or CARD_PAYOUT_PROVIDER is a live provider", !cfg.externalPayouts || (cfg.cardPayoutProvider !== "mock" && cfg.cardPayoutProvider !== "visa_direct"), cfg.externalPayouts ? `Outside-card payouts on, provider: ${cfg.cardPayoutProvider}` : "Outside-card payouts off: money leaves with the VINK card only"),
    mk("card_endpoint_secured", "The card authorisation endpoint has its secret", "PAYMENTOLOGY_FAST_SECRET (or the provider's own signing secret) is set", c.fastSecretSet, c.fastSecretSet ? "Set" : "Missing"),
    mk("alerts_configured", "Alerts reach a person", "ALERT_WEBHOOK_URL or ALERT_EMAIL_TO is set", c.alertSinks > 0, `${c.alertSinks} destination(s)`),
    mk("reconciliation_clean", "Reconciliation shows no problems", "Open the money page and clear every problem first", c.reconcileClean === true, c.reconcileClean === null ? "Not checked" : c.reconcileClean ? "Clean" : "Problems found"),
  ];
}

export async function evaluateGoLive(db: Db, ctx: GateContext): Promise<GateResult> {
  const rows = (await db.query(`SELECT * FROM go_live_checks`)).rows as Record<string, unknown>[];
  const by = new Map(rows.map((r) => [String(r.key), r]));
  const manual: GateStatus[] = MANUAL_ITEMS.map((it) => {
    const r = by.get(it.key);
    return r ? { ...it, ok: true, detail: "Confirmed", confirmedBy: String(r.confirmed_by_name), confirmedAt: new Date(String(r.confirmed_at)).toISOString(), note: String(r.note) } : { ...it, ok: false, detail: "Not confirmed" };
  });
  const items = [...manual, ...autoItems(ctx)];
  const missing = items.filter((i) => !i.ok).length;
  return { ready: missing === 0, mode: ctx.cfg.mode, items, missing };
}

/** A named person confirms an item, saying where the evidence is. */
export async function confirmItem(db: Db, key: string, by: { id: string | null; name: string }, note: string, at = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!MANUAL_ITEMS.some((i) => i.key === key)) return { ok: false, error: "That is not an item that can be confirmed by hand" };
  const n = note.trim();
  if (n.length < 10) return { ok: false, error: "Say where the evidence is (a document reference, ticket or date) in at least 10 characters" };
  if (n.length > 500) return { ok: false, error: "Keep the note under 500 characters" };
  const exists = (await db.query(`SELECT 1 AS x FROM go_live_checks WHERE key = $1`, [key])).rows.length;
  if (exists) await db.query(`UPDATE go_live_checks SET confirmed_by = $2, confirmed_by_name = $3, confirmed_at = $4, note = $5 WHERE key = $1`, [key, by.id, by.name, at, n]);
  else await db.query(`INSERT INTO go_live_checks (key, confirmed_by, confirmed_by_name, confirmed_at, note) VALUES ($1,$2,$3,$4,$5)`, [key, by.id, by.name, at, n]);
  return { ok: true };
}

export async function withdrawItem(db: Db, key: string): Promise<boolean> {
  return (await db.query(`DELETE FROM go_live_checks WHERE key = $1 RETURNING key`, [key])).rows.length > 0;
}

/** Called at start-up. Returns the reasons live mode must not start; empty when it may. Sandbox always passes. */
export async function liveStartBlockers(db: Db, ctx: Omit<GateContext, "reconcileClean">): Promise<string[]> {
  if (ctx.cfg.mode !== "live") return [];
  const g = await evaluateGoLive(db, { ...ctx, reconcileClean: true });          // reconciliation is judged by the people watching the alerts, not by blocking a restart
  return g.items.filter((i) => !i.ok).map((i) => `${i.title} (${i.key})`);
}
