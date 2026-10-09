import { Router, json } from "express";
import { h, uid, fail, audit, isUuid, type Db } from "./common.js";
import { TOKEN_ROLE_FOR_ACCOUNT, type TokenService } from "../services/tokenService.js";
import type { ChannelAccount } from "./bankLinks.js";
import type { CrossBorder } from "../services/crossBorderService.js";
import type { Engine, LedgerPort } from "../services/moneyEngine.js";
import type { ConfigReader } from "../config/configService.js";
import { recordPoolCredit, referenceLooksValid, normaliseReference } from "../services/poolService.js";

/**
 * VINK tokens for every portal user (passengers, drivers, owners, marshals, associations, investors). Mounted at /api/portal/<role>/tokens.
 *
 *   GET  /                      my wallet(s): balance, account number to pay into, where to pay, my cards and the latest activity
 *   POST /wallet                open my wallet in a currency (once)
 *   POST /cards                 register a VINK card to my wallet; POST /cards/:id/block stops a lost card at once
 *   POST /transfer              send tokens to someone by email or account number
 *   POST /redeem                move tokens into my own verified VINK bank account
 *   POST /card                  { currency } issue my VINK debit card (virtual) that spends my tokens; POST /card/:id/status { status: frozen | active | blocked }
 *   POST /payout-cards/session, /payout-cards/from-session   secure card entry (the number never reaches this API)
 *   GET/POST /payout-cards     my debit cards that money can be paid to; DELETE /payout-cards/:id removes one
 *   POST /cash-out              { amountCents, cardId? } tokens are paid to my verified debit card by the system. Never to a bank account, never by hand.
 *   GET/PUT /routes             association only: the fare for each route its devices serve
 *   cross-border                tokens to a holder in the other country (the same quote-then-confirm flow as money)
 *
 * Every money-moving call carries a `key` made by the screen, so a double click or a retry happens once. Amounts are whole cents (`amountCents`).
 */
export interface TokenRouteDeps {
  /** The pooled bank accounts customers pay into (the in-person pool is where tokens are bought). */
  channels?: (currency: string) => Partial<Record<"in_person" | "online", ChannelAccount>>;
  crossBorder?: CrossBorder;
}
const CURRENCIES = ["ZAR", "ZMW"];

export function createTokenRouter(db: Db, tokens: TokenService, deps: TokenRouteDeps = {}): Router {
  const router = Router();
  router.use(json({ limit: "10kb" }));
  const currencyOf = (v: unknown) => (typeof v === "string" && CURRENCIES.includes(v) ? v : "ZAR");
  const roleOf = (req: { user?: { role?: string } }) => TOKEN_ROLE_FOR_ACCOUNT[req.user?.role ?? ""];

  router.get("/", h(async (req, res) => {
    const userId = uid(req), out = [];
    for (const currency of CURRENCIES) {
      const w = await tokens.wallet(userId, currency);
      if (!w) continue;
      const pool = deps.channels?.(currency)?.in_person ?? null;
      out.push({ ...w, payInto: pool ? { bank: pool.bank, holder: pool.holder, accountNumber: pool.accountNumber, type: pool.type } : null, cards: await tokens.cards(userId, currency), activity: await tokens.activity(userId, currency, 20) });
    }
    res.json({ success: true, wallets: out, payoutCards: await tokens.payoutCards(userId), cardEntry: tokens.cardEntry(), issuedCards: await tokens.issuedCards(userId), role: roleOf(req) ?? null, deviceFeeCents: roleOf(req) === "investor" ? (await tokens.settings()).deviceFeeCents : undefined });
  }));

  router.post("/wallet", h(async (req, res) => {
    const role = roleOf(req);
    if (!role) return fail(res, 403, "This account cannot hold tokens");
    const r = await tokens.openWallet(uid(req), role, currencyOf((req.body ?? {}).currency));
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.wallet.open", null, { currency: r.value.currency });
    res.status(201).json({ success: true, wallet: r.value });
  }));

  router.post("/cards", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await tokens.linkCard(uid(req), currencyOf(b.currency), b.cardNumber);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.card.link", null, { last4: r.value.last4 });
    res.status(201).json({ success: true, last4: r.value.last4 });
  }));
  router.post("/cards/:id/block", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid card");
    const r = await tokens.blockCard(uid(req), req.params.id as string, (req.body ?? {}).lost ? "lost" : "blocked");
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.card.block", req.params.id as string);
    res.json({ success: true });
  }));

  router.post("/transfer", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.recipient !== "string" || typeof b.key !== "string") return fail(res, 400, "Give the recipient and the request reference");
    const r = await tokens.transfer(uid(req), { recipient: b.recipient, currency: currencyOf(b.currency), amountCents: b.amountCents, key: b.key });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.transfer", null, { currency: currencyOf(b.currency), amountCents: b.amountCents });
    res.json({ success: true, ...r.value });
  }));
  router.post("/redeem", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.key !== "string") return fail(res, 400, "Give the request reference");
    const r = await tokens.redeemToBank(uid(req), { currency: currencyOf(b.currency), amountCents: b.amountCents, key: b.key });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.redeem", null, { amountCents: b.amountCents });
    res.json({ success: true, ...r.value });
  }));
  router.post("/cash-out", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await tokens.requestCashOut(uid(req), { currency: currencyOf(b.currency), amountCents: b.amountCents, by: uid(req), cardId: b.cardId });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.cashout.request", r.value.id, { amountCents: b.amountCents, status: r.value.status });
    res.status(201).json({ success: true, ...r.value });
  }));
  router.post("/card", h(async (req, res) => {
    const r = await tokens.issueCard(uid(req), currencyOf((req.body ?? {}).currency));
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.card.issue", r.value.id, { last4: r.value.last4, brand: r.value.brand });
    res.status(201).json({ success: true, card: r.value });
  }));
  router.post("/card/:id/status", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid card");
    const r = await tokens.setIssuedCardStatus(uid(req), req.params.id as string, (req.body ?? {}).status);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.card.status", req.params.id as string, { status: r.value.status });
    res.json({ success: true, card: r.value });
  }));
  router.get("/payout-cards", h(async (req, res) => { res.json({ success: true, cards: await tokens.payoutCards(uid(req)) }); }));
  /** Secure card entry: start a session (the card form is the processor's), then collect the finished card by its session id. The number never comes through these routes. */
  router.post("/payout-cards/session", h(async (req, res) => {
    const r = await tokens.startCardSession(uid(req));
    if (!r.ok) return fail(res, r.status, r.error);
    res.status(201).json({ success: true, ...r.value });
  }));
  router.post("/payout-cards/from-session", h(async (req, res) => {
    const r = await tokens.addPayoutCardFromSession(uid(req), (req.body ?? {}).sessionId);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.payout_card.add", r.value.id, { last4: r.value.last4, brand: r.value.brand, status: r.value.status, via: "hosted_fields" });
    res.status(201).json({ success: true, ...r.value, message: r.value.status === "verified" ? "Card added." : "Card added. The name on it is not the name on your account, so VINK will check it before you can be paid to it." });
  }));
  router.post("/payout-cards", h(async (req, res) => {
    const r = await tokens.addPayoutCard(uid(req), (req.body ?? {}) as Record<string, unknown>);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.payout_card.add", r.value.id, { last4: r.value.last4, brand: r.value.brand, status: r.value.status });       // never the card number
    res.status(201).json({ success: true, ...r.value, message: r.value.status === "verified" ? "Card added." : "Card added. The name on it is not the name on your account, so VINK will check it before you can be paid to it." });
  }));
  router.delete("/payout-cards/:id", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid card");
    const r = await tokens.removePayoutCard(uid(req), req.params.id as string);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.payout_card.remove", req.params.id as string);
    res.json({ success: true });
  }));
  router.get("/cash-outs", h(async (req, res) => {
    const rows = (await db.query(`SELECT c.id, c.currency, c.amount_cents, c.reason, c.status, c.last_error, c.requested_at, c.decided_at, p.brand, p.last4 FROM token_cashouts c LEFT JOIN token_payout_cards p ON p.id = c.card_id WHERE c.user_id = $1 ORDER BY c.requested_at DESC LIMIT 20`, [uid(req)])).rows;
    res.json({ success: true, cashOuts: rows.map((r) => ({ id: r.id, currency: r.currency, amountCents: Number(r.amount_cents), reason: r.reason, status: r.status, card: r.last4 ? `${r.brand} ****${r.last4}` : null, problem: r.status === "paid" ? null : r.last_error ?? null, requestedAt: new Date(r.requested_at as string).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at as string).toISOString() : null })) });
  }));

  /* the association's fares per route (the devices of its members use these) */
  router.get("/routes", h(async (req, res) => {
    if (req.user?.role !== "association") return fail(res, 403, "Only an association sets route fares");
    res.json({ success: true, routes: await tokens.routes(uid(req)) });
  }));
  router.put("/routes", h(async (req, res) => {
    if (req.user?.role !== "association") return fail(res, 403, "Only an association sets route fares");
    const r = await tokens.upsertRoute(uid(req), (req.body ?? {}) as { name?: unknown; fareCents?: unknown; currency?: unknown; effectiveFrom?: unknown; active?: unknown });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.route.set", r.value.id);
    res.json({ success: true, id: r.value.id });
  }));
  router.post("/routes/:id/active", h(async (req, res) => {
    if (req.user?.role !== "association") return fail(res, 403, "Only an association sets route fares");
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid route");
    const done = await db.query(`UPDATE token_routes SET active = $3 WHERE id = $1 AND association_id = $2 RETURNING id`, [req.params.id, uid(req), (req.body ?? {}).active !== false]);
    if (!done.rows.length) return fail(res, 404, "Route not found");
    res.json({ success: true });
  }));

  /* cross-border: tokens to a holder in the other country, quoted first and confirmed within the quote's short life */
  router.get("/cross-border", h(async (req, res) => {
    if (!deps.crossBorder) { res.json({ success: true, corridors: [], transfers: [] }); return; }
    res.json({ success: true, corridors: await deps.crossBorder.openCorridors(), transfers: await deps.crossBorder.history(uid(req)) });
  }));
  router.post("/cross-border/quote", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!deps.crossBorder) return fail(res, 503, "Cross-border transfers are not available");
    if (typeof b.recipientEmail !== "string" || typeof b.corridorId !== "string" || !Number.isInteger(b.amountCents)) return fail(res, 400, "Give the recipient's email, the route and the amount in whole cents");
    const r = await deps.crossBorder.quote(uid(req), { recipientEmail: b.recipientEmail, corridorId: b.corridorId, amountCents: b.amountCents as number });
    if (!r.ok) return fail(res, r.status, r.error);
    res.status(201).json({ success: true, quote: r.value });
  }));
  router.post("/cross-border/:id/confirm", h(async (req, res) => {
    if (!deps.crossBorder) return fail(res, 503, "Cross-border transfers are not available");
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid quote");
    const r = await deps.crossBorder.confirm(uid(req), req.params.id as string);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.cross_border", req.params.id as string);
    res.json({ success: true, transfer: r.value });
  }));

  return router;
}

/* ───────────────────────── the device ───────────────────────── */
export interface DeviceAuth { authenticated: boolean; terminalId?: string; error?: string }

/**
 * What a device (the card reader in the taxi) calls, mounted at /api/terminal/token. It proves who it is with its serial number and API key (headers
 * x-terminal-serial and x-terminal-api-key), not a user login.
 *   GET  /routes   the fares of its association's routes, for the driver to pick the route for the trip
 *   POST /tap      { cardNumber, routeId } with an Idempotency-Key header: takes the fare in tokens from the card's wallet. A retry with the same key answers as before.
 */
export function createTokenTerminalRouter(d: { db: Db; tokens: TokenService; authenticate: (serial: string, apiKey: string) => Promise<DeviceAuth> }): Router {
  const router = Router();
  router.use(json({ limit: "4kb" }));
  const authed = async (req: { header(n: string): string | undefined }) => d.authenticate(req.header("x-terminal-serial") ?? "", req.header("x-terminal-api-key") ?? "");

  router.get("/routes", h(async (req, res) => {
    const a = await authed(req);
    if (!a.authenticated || !a.terminalId) return fail(res, 401, a.error ?? "Terminal authentication failed");
    const term = (await d.db.query(`SELECT association_id FROM terminals WHERE id = $1`, [a.terminalId])).rows[0];
    const all = await d.tokens.routes(null);
    res.json({ success: true, routes: all.filter((r) => !r.associationId || !term?.association_id || r.associationId === term.association_id).map((r) => ({ id: r.id, name: r.name, fareCents: r.fareCents, currency: r.currency })) });
  }));

  router.post("/tap", h(async (req, res) => {
    const a = await authed(req);
    if (!a.authenticated || !a.terminalId) return fail(res, 401, a.error ?? "Terminal authentication failed");
    const b = (req.body ?? {}) as Record<string, unknown>;
    const key = req.header("idempotency-key") ?? "";
    if (typeof b.routeId !== "string" || !isUuid(b.routeId)) return fail(res, 400, "Choose the route first");
    const r = await d.tokens.tapToken({ terminalId: a.terminalId, cardUid: b.cardNumber, routeId: b.routeId, key });
    if (!r.ok) { res.status(r.status).json({ success: false, error: r.message, code: r.code, data: r.tapId ? { tapId: r.tapId } : undefined }); return; }
    res.status(r.replayed ? 200 : 201).json({ success: true, data: { tapId: r.tapId, fareCents: r.fareCents, balanceCents: r.balanceCents, route: r.route, replayed: r.replayed } });
  }));
  return router;
}

/* ───────────────────────── staff ───────────────────────── */
/**
 * Staff tools, mounted at /api/admin/tokens (owner and superadmin).
 *   GET  /summary?currency=ZAR   tokens in circulation by role, what is waiting to be paid out, and the programme settings
 *   GET  /cash-outs?status=      payouts to holders' debit cards and where each one stands. Staff cannot pay one: the system pushes it to the card.
 *                                POST /cash-outs/:id/retry asks the system to try now; POST /cash-outs/:id/reject refuses a waiting payout and the tokens go back
 *   GET  /payout-cards           debit cards whose name does not match the account holder's, waiting for a person; POST /payout-cards/:id/approve | /reject
 *   POST /refund                 { userId, currency, amountCents, note } a refund: paid by the system to the holder's own verified debit card, for any reason
 *   PUT  /wallets/tier           { userId, currency, tier } sets a holder's verification level (basic, standard, full, business) once their identity is checked
 *   PUT  /settings               { deviceFeeCents } the per-trip fee paid to the investor who sponsored a device
 */
export function createTokenAdminRouter(d: { db: Db; tokens: TokenService; sandbox?: boolean }): Router {
  const router = Router();
  router.use(json({ limit: "10kb" }));
  router.get("/summary", h(async (req, res) => {
    const currency = typeof req.query.currency === "string" && CURRENCIES.includes(req.query.currency) ? req.query.currency : "ZAR";
    res.json({ success: true, summary: await d.tokens.summary(currency), settings: await d.tokens.settings() });
  }));
  router.get("/cash-outs", h(async (req, res) => {
    const q = typeof req.query.status === "string" ? req.query.status : "";
    const where = q === "open" ? "WHERE c.status IN ('requested','processing')" : ["requested", "processing", "paid", "rejected"].includes(q) ? "WHERE c.status = $1" : "";
    const cols = "c.id, c.user_id, u.name, u.email, c.currency, c.amount_cents, c.reason, c.status, c.note, c.last_error, c.attempts, c.requested_at, c.decided_at, p.brand, p.last4";
    const rows = (await d.db.query(`SELECT ${cols} FROM token_cashouts c JOIN users u ON u.id = c.user_id LEFT JOIN token_payout_cards p ON p.id = c.card_id ${where} ORDER BY c.requested_at DESC LIMIT 100`, where.includes("$1") ? [q] : [])).rows;
    res.json({ success: true, cashOuts: rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.name, email: r.email, currency: r.currency, amountCents: Number(r.amount_cents), reason: r.reason, status: r.status, note: r.note ?? null, card: r.last4 ? `${r.brand} ****${r.last4}` : null, lastError: r.last_error ?? null, attempts: Number(r.attempts ?? 0), requestedAt: new Date(r.requested_at as string).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at as string).toISOString() : null })) });
  }));
  const decide = (decision: "rejected") => h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid request");
    const note = typeof (req.body ?? {}).note === "string" ? String((req.body ?? {}).note).slice(0, 300) : undefined;
    const r = await d.tokens.decideCashOut(req.params.id as string, uid(req), decision, note);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, `token.cashout.${decision}`, req.params.id as string, { note: note ?? null });
    res.json({ success: true, status: r.value.status });
  });
  router.post("/cash-outs/:id/reject", decide("rejected"));
  router.post("/cash-outs/:id/retry", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid request");
    const r = await d.tokens.retryCashOut(req.params.id as string);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "token.cashout.retry", req.params.id as string, { status: r.value.status });
    res.json({ success: true, status: r.value.status });
  }));
  router.get("/payout-cards", h(async (_req, res) => { res.json({ success: true, cards: await d.tokens.cardsToReview() }); }));
  const reviewCard = (decision: "approve" | "reject") => h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid card");
    const note = typeof (req.body ?? {}).note === "string" ? String((req.body ?? {}).note).slice(0, 300) : undefined;
    const r = await d.tokens.reviewPayoutCard(req.params.id as string, uid(req), decision, note);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, `token.payout_card.${decision}`, req.params.id as string, { note: note ?? null });
    res.json({ success: true, status: r.value.status });
  });
  router.post("/payout-cards/:id/approve", reviewCard("approve"));
  router.post("/payout-cards/:id/reject", reviewCard("reject"));
  router.post("/refund", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isUuid(b.userId)) return fail(res, 400, "Choose the holder");
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";
    if (note.length < 3) return fail(res, 400, "Write why the refund is made");
    const r = await d.tokens.requestCashOut(b.userId, { currency: CURRENCIES.includes(String(b.currency)) ? String(b.currency) : "ZAR", amountCents: b.amountCents, reason: "refund", by: uid(req), note });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "token.refund", r.value.id, { userId: b.userId, amountCents: b.amountCents, note });
    res.status(201).json({ success: true, id: r.value.id, status: r.value.status, message: r.value.message });
  }));
  /** Sandbox only: act as the card processor, so a purchase, an ATM withdrawal or a refund can be tried end to end. 404 outside the sandbox. */
  router.post("/sandbox/card-purchase", h(async (req, res) => {
    if (!d.sandbox) return fail(res, 404, "Endpoint not found");
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isUuid(b.cardId)) return fail(res, 400, "Choose the card");
    const c = (await d.db.query(`SELECT provider, provider_card_id, currency FROM token_issued_cards WHERE id = $1`, [b.cardId])).rows[0];
    if (!c) return fail(res, 404, "No such card");
    const authorisationId = typeof b.authorisationId === "string" && /^[A-Za-z0-9._-]{4,60}$/.test(b.authorisationId) ? b.authorisationId : `sbx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const r = await d.tokens.authoriseCardSpend({ provider: String(c.provider), providerCardId: String(c.provider_card_id), authorisationId, amountCents: b.amountCents as number, currency: String(c.currency), channel: typeof b.channel === "string" ? b.channel : "chip", merchant: typeof b.merchant === "string" ? b.merchant.slice(0, 40) : "Sandbox shop" });
    res.json({ success: true, authorisationId, decision: r });
  }));
  router.post("/sandbox/card-refund", h(async (req, res) => {
    if (!d.sandbox) return fail(res, 404, "Endpoint not found");
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.authorisationId !== "string" || typeof b.provider !== "string") return fail(res, 400, "Give the provider and the authorisation id");
    const r = await d.tokens.reverseCardSpend({ provider: b.provider, authorisationId: b.authorisationId });
    if (!r) return fail(res, 404, "No such purchase");
    res.json({ success: true, ...r });
  }));
  router.put("/wallets/tier", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isUuid(b.userId)) return fail(res, 400, "Choose the holder");
    const r = await d.tokens.setTier(b.userId, CURRENCIES.includes(String(b.currency)) ? String(b.currency) : "ZAR", b.tier);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "token.wallet.tier", b.userId, { tier: r.value.kycTier });
    res.json({ success: true, ...r.value });
  }));
  router.put("/settings", h(async (req, res) => {
    const r = await d.tokens.setDeviceFee((req.body ?? {}).deviceFeeCents, uid(req));
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "token.settings", null, { deviceFeeCents: r.value.deviceFeeCents });
    res.json({ success: true, ...r.value });
  }));
  return router;
}

/* ───────────────────────── retail agents ───────────────────────── */
export const RETAIL_MIN_CENTS = 1000;                 // R10
export const RETAIL_MAX_CENTS = 500_000;              // R5 000 in one cash top-up

/**
 * Buying tokens with cash at a retailer (a supermarket till or a spaza shop with a VINK point of sale), mounted at /api/retail/token. The POS proves who it is
 * with its serial number and API key (x-retail-serial, x-retail-api-key).
 *   POST /lookup   { reference }                     the holder's first name and surname initial, so the cashier can confirm it is the right customer
 *   POST /topup    { reference, amountCents, receipt } the customer has paid the cashier. The receipt number makes it happen once.
 *
 * The retailer pays the money into the pooled account afterwards, so the credit is recorded as NOT YET CLEARED. The customer's tokens are issued at once when the
 * instant-credit reserve covers it (the limits of the country profile apply), otherwise when staff mark the retailer's settlement as cleared, exactly like any
 * other bank credit that has not arrived yet. Nothing here moves real money by itself.
 */
export interface RetailAuth { authenticated: boolean; terminalId?: string; error?: string }
export function createTokenRetailRouter(d: { db: Db; ledger: LedgerPort; engine: Pick<Engine, "partyOf">; reader: ConfigReader; authenticate: (serial: string, apiKey: string) => Promise<RetailAuth> }): Router {
  const router = Router();
  router.use(json({ limit: "2kb" }));
  const authed = (req: { header(n: string): string | undefined }) => d.authenticate(req.header("x-retail-serial") ?? "", req.header("x-retail-api-key") ?? "");
  const currencyOf = (ref: string) => (ref.startsWith("VKK") ? "ZMW" : "ZAR");
  /** The customer's token wallet for a payment reference, or null (a reference that belongs to no token wallet is not served here). */
  const holder = async (reference: unknown) => {
    const ref = typeof reference === "string" ? normaliseReference(reference) : "";
    if (!referenceLooksValid(ref)) return null;
    const r = (await d.db.query(`SELECT u.name, v.currency FROM virtual_accounts v JOIN users u ON u.id = v.user_id JOIN token_wallets w ON w.user_id = v.user_id AND w.currency = v.currency AND w.status = 'active' WHERE v.reference = $1 AND v.status = 'active'`, [ref])).rows[0];
    return r ? { ref, name: String(r.name), currency: String(r.currency) } : null;
  };
  const masked = (name: string) => { const p = name.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };

  router.post("/lookup", h(async (req, res) => {
    const a = await authed(req);
    if (!a.authenticated) return fail(res, 401, a.error ?? "Terminal authentication failed");
    const hld = await holder((req.body ?? {}).reference);
    if (!hld) return fail(res, 404, "That account number does not belong to a VINK token wallet. Check it and try again.");
    res.json({ success: true, holder: masked(hld.name), currency: hld.currency });
  }));

  router.post("/topup", h(async (req, res) => {
    const a = await authed(req);
    if (!a.authenticated || !a.terminalId) return fail(res, 401, a.error ?? "Terminal authentication failed");
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.receipt !== "string" || !/^[A-Za-z0-9._-]{4,40}$/.test(b.receipt)) return fail(res, 400, "A receipt number of 4 to 40 letters or numbers is required");
    if (!Number.isInteger(b.amountCents) || (b.amountCents as number) < RETAIL_MIN_CENTS || (b.amountCents as number) > RETAIL_MAX_CENTS) return fail(res, 400, `A cash top-up is between ${RETAIL_MIN_CENTS / 100} and ${RETAIL_MAX_CENTS / 100}`);
    const hld = await holder(b.reference);
    if (!hld) return fail(res, 404, "That account number does not belong to a VINK token wallet. Check it and try again.");
    const r = await recordPoolCredit({ db: d.db, ledger: d.ledger, engine: d.engine, reader: d.reader }, { bankRef: `R-${a.terminalId.slice(0, 8)}-${b.receipt}`, reference: hld.ref, amountCents: b.amountCents as number, currency: hld.currency, by: null, pending: true });
    if (r.status === "credited") { res.status(201).json({ success: true, status: "credited", message: "Tokens added to the customer's wallet.", holder: masked(hld.name) }); return; }
    if (r.status === "duplicate") { res.json({ success: true, status: "credited", replayed: true, message: "This top-up was already recorded.", holder: masked(hld.name) }); return; }
    if (r.status === "awaiting_clearing") { res.status(202).json({ success: true, status: "awaiting_clearing", message: "Recorded. The tokens are added when the retailer's payment reaches the bank.", holder: masked(hld.name) }); return; }
    fail(res, 409, r.reason ?? "This top-up could not be recorded. Keep the receipt and ask the customer to contact VINK.");
  }));
  return router;
}
