import { Router, json } from "express";
import { h, fail, audit, type Db } from "../portal/common.js";
import type { ConfigReader } from "../config/configService.js";
import { COUNTRIES, KYC_TIERS, type CountryCode, type KycTier } from "../config/countryConfig.js";
import { checkTierLimit, decideInstantCredit, quoteCorridor, type LimitChannel } from "../config/riskRules.js";
import { reconcile } from "../services/reconciliation.js";
import type { LedgerPort } from "../services/moneyEngine.js";

/**
 * Staff-only money tools, mounted at /api/admin/money (owner and superadmin).
 *   GET  /reconciliation   do the platform's records and the Banking ledger agree, and what needs a person
 *   POST /check            "what would the active profile do?" for a KYC limit, an instant-credit deposit or a cross-border quote (nothing is stored or moved)
 *   GET  /items            payments that are waiting, in arrears or need review
 */
const CHANNELS: LimitChannel[] = ["transfer_in", "transfer_out", "atm", "pos", "online"];
const wholeCents = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100_000_000_000 ? (v as number) : null);

export function createMoneyAdminRouter(d: { db: Db; ledger: LedgerPort; reader: ConfigReader }): Router {
  const router = Router();

  router.get("/reconciliation", h(async (_req, res) => { res.json({ success: true, ...(await reconcile(d.db, d.ledger)) }); }));

  router.get("/items", h(async (_req, res) => {
    const rows = (await d.db.query(
      `SELECT p.id, p.kind, p.amount_cents, p.remaining_cents, p.currency, p.status, p.last_error, p.due_at, pu.name AS payer, eu.name AS payee
         FROM payment_items p JOIN users pu ON pu.id = p.payer_id JOIN users eu ON eu.id = p.payee_id
        WHERE p.status IN ('waiting','arrears','needs_review','failed') ORDER BY p.due_at LIMIT 100`)).rows;
    res.json({ success: true, items: rows.map((r) => ({ id: r.id, kind: r.kind, payer: r.payer, payee: r.payee, amountCents: Number(r.amount_cents), remainingCents: Number(r.remaining_cents), currency: r.currency, status: r.status, problem: r.last_error ?? null, dueAt: r.due_at })) });
  }));

  router.post("/check", json({ limit: "10kb" }), h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const country = typeof b.country === "string" && (COUNTRIES as readonly string[]).includes(b.country) ? (b.country as CountryCode) : null;
    if (!country) return fail(res, 400, "Choose a country");
    const cfg = (await d.reader.active(country)).config;
    const tier = typeof b.tier === "string" && (KYC_TIERS as readonly string[]).includes(b.tier) ? (b.tier as KycTier) : "basic";
    const amount = wholeCents(b.amountCents);
    if (amount === null) return fail(res, 400, "amountCents must be a whole number of cents");
    let result: unknown;
    if (b.kind === "limit") {
      if (!CHANNELS.includes(b.channel as LimitChannel)) return fail(res, 400, `channel must be one of ${CHANNELS.join(", ")}`);
      result = checkTierLimit(cfg, tier, { channel: b.channel as LimitChannel, amountCents: amount, usedTodayCents: wholeCents(b.usedTodayCents) ?? 0, balanceCents: wholeCents(b.balanceCents) ?? 0 });
    } else if (b.kind === "instant_credit") {
      result = decideInstantCredit(cfg, { tier, depositCents: amount, reserveBalanceCents: wholeCents(b.reserveBalanceCents) ?? 0, outstandingCents: wholeCents(b.outstandingCents) ?? 0 });
    } else if (b.kind === "corridor") {
      result = quoteCorridor(cfg, { corridorId: String(b.corridorId ?? ""), amountCents: amount, midRate: Number(b.midRate), usedDayCents: wholeCents(b.usedDayCents) ?? 0, usedMonthCents: wholeCents(b.usedMonthCents) ?? 0, now: new Date() });
    } else return fail(res, 400, "kind must be limit, instant_credit or corridor");
    await audit(d.db, req, "money.check", null, { kind: b.kind, country });
    res.json({ success: true, result });
  }));

  return router;
}
