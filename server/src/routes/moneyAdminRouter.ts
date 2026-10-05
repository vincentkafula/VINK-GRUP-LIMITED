import { Router, json } from "express";
import { h, fail, audit, type Db } from "../portal/common.js";
import type { ConfigReader } from "../config/configService.js";
import { COUNTRIES, KYC_TIERS, type CountryCode, type KycTier } from "../config/countryConfig.js";
import { checkTierLimit, decideInstantCredit, quoteCorridor, type LimitChannel } from "../config/riskRules.js";
import { reconcile } from "../services/reconciliation.js";
import type { Engine, LedgerPort } from "../services/moneyEngine.js";
import type { CrossBorder } from "../services/crossBorderService.js";
import { readStatement, type Mapping } from "../services/statementImport.js";
import { validatePooled, type PooledStore, type Pool as PooledPool, type PoolCurrency } from "../portal/pooledAccounts.js";
import { refreshRates, type FetchFn, type Provider } from "../services/fxRates.js";
import { recordPoolCredit, settleCredit, markCleared, markBounced, fundReserve, reserveAccount, referenceLooksValid, normaliseReference } from "../services/poolService.js";
import { uid, isUuid } from "../portal/common.js";

/**
 * Staff-only money tools, mounted at /api/admin/money (owner and superadmin).
 *   GET  /reconciliation   do the platform's records and the Banking ledger agree, and what needs a person
 *   POST /check            "what would the active profile do?" for a KYC limit, an instant-credit deposit or a cross-border quote (nothing is stored or moved)
 *   GET  /items            payments that are waiting, in arrears or need review
 */
const CHANNELS: LimitChannel[] = ["transfer_in", "transfer_out", "atm", "pos", "online"];
const wholeCents = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100_000_000_000 ? (v as number) : null);

export function createMoneyAdminRouter(d: { db: Db; ledger: LedgerPort; reader: ConfigReader; engine?: Pick<Engine, "partyOf">; channels?: () => Record<string, unknown>; pooled?: PooledStore; crossBorder?: CrossBorder; fx?: { fetchFn?: FetchFn; providers?: Provider[] } }): Router {
  const router = Router();
  const poolDeps = () => { if (!d.engine) throw new Error("The money engine is not available"); return { db: d.db, ledger: d.ledger, engine: d.engine, reader: d.reader }; };

  /** Exchange rates for cross-border quotes (there is no feed: staff set them, and a rate older than an hour is not used). */
  router.get("/fx", h(async (_req, res) => {
    const rows = (await d.db.query(`SELECT pair, rate, set_at, source, source_at, auto FROM fx_rates ORDER BY pair`)).rows;
    res.json({ success: true, rates: rows.map((r) => ({ pair: r.pair, rate: Number(r.rate), setAt: r.set_at, source: r.source, sourceAt: r.source_at ?? null, auto: !!r.auto })) });
  }));
  /** Fetch the rates now (they are also fetched every hour while a route is open). A rate set by hand in the last 24 hours is kept. */
  router.post("/fx/refresh", h(async (req, res) => {
    const results = await refreshRates(d.db, { pairs: ["ZAR-ZMW", "ZMW-ZAR"], fetchFn: d.fx?.fetchFn, providers: d.fx?.providers });
    await audit(d.db, req, "money.fx.refresh", null, { results: results.map((r) => `${r.pair}:${r.status}`) });
    res.json({ success: true, results });
  }));
  router.put("/fx", json({ limit: "2kb" }), h(async (req, res) => {
    if (!d.crossBorder) return fail(res, 503, "Cross-border transfers are not available");
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await d.crossBorder.setRate(String(b.from), String(b.to), Number(b.rate), uid(req));
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "money.fx", `${b.from}-${b.to}`, { rate: Number(b.rate) });
    res.json({ success: true });
  }));

  /** The pooled bank accounts customers pay into (details of accounts that already exist). Staff set them here; no redeploy needed. */
  router.get("/pooled-accounts", h(async (_req, res) => { res.json({ success: true, accounts: d.pooled?.list() ?? [] }); }));
  router.put("/pooled-accounts", json({ limit: "5kb" }), h(async (req, res) => {
    if (!d.pooled) return fail(res, 503, "Not available");
    const v = validatePooled((req.body ?? {}) as Record<string, unknown>);
    if (!v.ok) return fail(res, 400, v.error);
    await d.pooled.set(v.value, uid(req));
    await audit(d.db, req, "pooled.set", `${v.value.pool}/${v.value.currency}`, { bank: v.value.bank, account: "…" + v.value.accountNumber.slice(-4) });
    res.json({ success: true });
  }));
  router.delete("/pooled-accounts/:pool/:currency", h(async (req, res) => {
    if (!d.pooled) return fail(res, 503, "Not available");
    const removed = await d.pooled.remove(req.params.pool as PooledPool, req.params.currency as PoolCurrency);
    if (!removed) return fail(res, 404, "No such account");
    await audit(d.db, req, "pooled.remove", `${req.params.pool}/${req.params.currency}`, {});
    res.json({ success: true });
  }));

  /**
   * Import a bank statement (CSV) from any bank: staff say which column is which. Only credits are used. Every line is recorded exactly once on the bank's
   * own reference, so importing the same file again (or an overlapping one) changes nothing. With dryRun the file is only checked.
   */
  router.post("/pool/import", json({ limit: "1500kb" }), h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.csv !== "string") return fail(res, 400, "Send the statement as text in csv");
    const cur = b.defaultCurrency === "ZMW" ? "ZMW" : "ZAR";
    const m = (b.mapping ?? {}) as Partial<Mapping>;
    const parsed = readStatement(b.csv, { bankRef: String(m.bankRef ?? ""), reference: String(m.reference ?? ""), amount: String(m.amount ?? ""), currency: m.currency ? String(m.currency) : undefined, direction: m.direction ? String(m.direction) : undefined }, cur);
    if ("error" in parsed) return fail(res, 400, parsed.error);
    if (b.dryRun === true) { res.json({ success: true, dryRun: true, headers: parsed.headers, credits: parsed.lines.length, skippedDebits: parsed.skipped, problems: parsed.problems.slice(0, 20), preview: parsed.lines.slice(0, 5) }); return; }
    const tally = { credited: 0, duplicate: 0, unmatched: 0, awaiting_clearing: 0, other: 0 }; const failed: { row: number; error: string }[] = [...parsed.problems];
    for (const l of parsed.lines) {
      try {
        const r = await recordPoolCredit(poolDeps(), { bankRef: l.bankRef, reference: l.reference, amountCents: l.amountCents, currency: l.currency, by: uid(req) });
        if (r.status in tally) tally[r.status as keyof typeof tally]++; else tally.other++;
      } catch (e) { failed.push({ row: l.row, error: e instanceof Error ? e.message : "failed" }); }
    }
    await audit(d.db, req, "pool.import", null, { lines: parsed.lines.length, ...tally, failed: failed.length });
    res.json({ success: true, dryRun: false, lines: parsed.lines.length, skippedDebits: parsed.skipped, ...tally, failed: failed.slice(0, 20), failedCount: failed.length });
  }));

  /** The pooled bank accounts: virtual-account counts, credits, and the bank lines nobody could be credited for. */
  router.get("/pool", h(async (_req, res) => {
    const va = (await d.db.query(`SELECT pool, currency, COUNT(*) AS n FROM virtual_accounts WHERE status = 'active' GROUP BY pool, currency ORDER BY pool, currency`)).rows;
    const cr = (await d.db.query(`SELECT currency, status, COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS s FROM pool_credits GROUP BY currency, status`)).rows;
    const un = (await d.db.query(`SELECT id, bank_ref, reference, amount_cents, currency, reason, received_at FROM pool_credits WHERE status = 'unmatched' ORDER BY received_at DESC LIMIT 50`)).rows;
    const reserve = (await d.db.query(`SELECT currency, COALESCE(SUM(amount_cents),0) AS s FROM pool_credits WHERE instant = true AND clearing = 'pending' AND status = 'credited' GROUP BY currency`)).rows;
    const pend = (await d.db.query(`SELECT id, bank_ref, reference, amount_cents, currency, status, instant FROM pool_credits WHERE clearing = 'pending' AND status IN ('credited','awaiting_clearing') ORDER BY received_at DESC LIMIT 50`)).rows;
    res.json({ success: true, pending: pend.map((r) => ({ id: r.id, bankRef: r.bank_ref, reference: r.reference, amountCents: Number(r.amount_cents), currency: r.currency, status: r.status, instant: !!r.instant })), reserve: ["ZAR", "ZMW"].map((cur) => ({ currency: cur, balanceCents: d.ledger.balance(reserveAccount(cur)), outstandingCents: Number(reserve.find((r) => r.currency === cur)?.s ?? 0) })), channels: d.channels?.() ?? {}, virtualAccounts: va.map((r) => ({ pool: r.pool, currency: r.currency, count: Number(r.n) })), credits: cr.map((r) => ({ currency: r.currency, status: r.status, count: Number(r.n), totalCents: Number(r.s) })),
      unmatched: un.map((r) => ({ id: r.id, bankRef: r.bank_ref, reference: r.reference, amountCents: Number(r.amount_cents), currency: r.currency, reason: r.reason, receivedAt: r.received_at })) });
  }));
  /** Record a credit the bank reported on a pooled account. Repeating the same bankRef changes nothing. */
  router.post("/pool/credits", json({ limit: "5kb" }), h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.bankRef !== "string" || typeof b.reference !== "string") return fail(res, 400, "bankRef and reference are required");
    try {
      const r = await recordPoolCredit(poolDeps(), { bankRef: b.bankRef, reference: b.reference, amountCents: b.amountCents as number, currency: String(b.currency), by: uid(req), pending: b.pending === true });
      await audit(d.db, req, "pool.credit", r.creditId, { status: r.status, bankRef: b.bankRef, currency: b.currency });
      res.status(r.status === "credited" ? 201 : 200).json({ success: true, ...r });
    } catch (e) { fail(res, 400, e instanceof Error ? e.message : "Could not record the credit"); }
  }));
  /** The bank cleared a payment it had reported as pending, or returned it. */
  router.post("/pool/credits/:id/clear", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid id");
    try { const r = await markCleared(poolDeps(), req.params.id as string, uid(req)); await audit(d.db, req, "pool.clear", req.params.id as string, { status: r.status }); res.json({ success: true, ...r }); }
    catch (e) { fail(res, 404, e instanceof Error ? e.message : "Could not clear"); }
  }));
  router.post("/pool/credits/:id/bounce", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid id");
    try { const r = await markBounced(poolDeps(), req.params.id as string); await audit(d.db, req, "pool.bounce", req.params.id as string, { status: r.status }); res.json({ success: true, ...r }); }
    catch (e) { fail(res, 409, e instanceof Error ? e.message : "Could not return"); }
  }));
  /** Put the platform's own money into the instant-credit reserve. */
  router.post("/reserve/fund", json({ limit: "2kb" }), h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    try { const r = await fundReserve({ ledger: d.ledger }, { ref: String(b.ref), currency: String(b.currency), amountCents: b.amountCents as number }); await audit(d.db, req, "reserve.fund", String(b.ref), { currency: b.currency, amountCents: b.amountCents, result: r }); res.status(r === "funded" ? 201 : 200).json({ success: true, result: r }); }
    catch (e) { fail(res, 400, e instanceof Error ? e.message : "Could not fund the reserve"); }
  }));
  /** A person points an unmatched credit at the right reference. */
  router.post("/pool/credits/:id/match", json({ limit: "2kb" }), h(async (req, res) => {
    const ref = typeof req.body?.reference === "string" ? normaliseReference(req.body.reference) : "";
    if (!isUuid(req.params.id) || !referenceLooksValid(ref)) return fail(res, 400, "Give a valid platform reference");
    const found = (await d.db.query(`UPDATE pool_credits SET reference = $2 WHERE id = $1 AND status = 'unmatched' RETURNING id`, [req.params.id, ref])).rows.length;
    if (!found) return fail(res, 404, "That credit is not waiting to be matched");
    const r = await settleCredit(poolDeps(), req.params.id as string, uid(req));
    await audit(d.db, req, "pool.match", req.params.id as string, { status: r.status });
    res.json({ success: true, ...r });
  }));

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
