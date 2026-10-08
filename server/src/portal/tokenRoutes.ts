import { Router, json } from "express";
import { h, uid, fail, audit, isUuid, type Db } from "./common.js";
import { TOKEN_ROLE_FOR_ACCOUNT, type TokenService } from "../services/tokenService.js";
import type { ChannelAccount } from "./bankLinks.js";
import type { CrossBorder } from "../services/crossBorderService.js";

/**
 * VINK tokens for every portal user (passengers, drivers, owners, marshals, associations, investors). Mounted at /api/portal/<role>/tokens.
 *
 *   GET  /                      my wallet(s): balance, account number to pay into, where to pay, my cards and the latest activity
 *   POST /wallet                open my wallet in a currency (once)
 *   POST /cards                 register a VINK card to my wallet; POST /cards/:id/block stops a lost card at once
 *   POST /transfer              send tokens to someone by email or account number
 *   POST /redeem                move tokens into my own verified VINK bank account
 *   POST /cash-out              ask for tokens to be paid out of the pool as money (staff pay it)
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
    res.json({ success: true, wallets: out, role: roleOf(req) ?? null, deviceFeeCents: roleOf(req) === "investor" ? (await tokens.settings()).deviceFeeCents : undefined });
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
    const r = await tokens.requestCashOut(uid(req), { currency: currencyOf(b.currency), amountCents: b.amountCents, by: uid(req) });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(db, req, "token.cashout.request", r.value.id, { amountCents: b.amountCents });
    res.status(201).json({ success: true, ...r.value });
  }));
  router.get("/cash-outs", h(async (req, res) => {
    const rows = (await db.query(`SELECT id, currency, amount_cents, reason, status, requested_at, decided_at FROM token_cashouts WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 20`, [uid(req)])).rows;
    res.json({ success: true, cashOuts: rows.map((r) => ({ id: r.id, currency: r.currency, amountCents: Number(r.amount_cents), reason: r.reason, status: r.status, requestedAt: new Date(r.requested_at as string).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at as string).toISOString() : null })) });
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
 *   GET  /cash-outs?status=      requests to pay out; POST /cash-outs/:id/paid | /reject
 *   POST /refund                 { userId, currency, amountCents, note } takes tokens from a holder into a payout (any reason)
 *   PUT  /settings               { deviceFeeCents } the per-trip fee paid to the investor who sponsored a device
 */
export function createTokenAdminRouter(d: { db: Db; tokens: TokenService }): Router {
  const router = Router();
  router.use(json({ limit: "10kb" }));
  router.get("/summary", h(async (req, res) => {
    const currency = typeof req.query.currency === "string" && CURRENCIES.includes(req.query.currency) ? req.query.currency : "ZAR";
    res.json({ success: true, summary: await d.tokens.summary(currency), settings: await d.tokens.settings() });
  }));
  router.get("/cash-outs", h(async (req, res) => {
    const status = typeof req.query.status === "string" && ["requested", "paid", "rejected"].includes(req.query.status) ? req.query.status : null;
    const cols = "c.id, c.user_id, u.name, u.email, c.currency, c.amount_cents, c.reason, c.status, c.note, c.requested_at, c.decided_at";
    const rows = (await d.db.query(`SELECT ${cols} FROM token_cashouts c JOIN users u ON u.id = c.user_id ${status ? "WHERE c.status = $1" : ""} ORDER BY c.requested_at DESC LIMIT 100`, status ? [status] : [])).rows;
    res.json({ success: true, cashOuts: rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.name, email: r.email, currency: r.currency, amountCents: Number(r.amount_cents), reason: r.reason, status: r.status, note: r.note ?? null, requestedAt: new Date(r.requested_at as string).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at as string).toISOString() : null })) });
  }));
  const decide = (decision: "paid" | "rejected") => h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid request");
    const note = typeof (req.body ?? {}).note === "string" ? String((req.body ?? {}).note).slice(0, 300) : undefined;
    const r = await d.tokens.decideCashOut(req.params.id as string, uid(req), decision, note);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, `token.cashout.${decision}`, req.params.id as string, { note: note ?? null });
    res.json({ success: true, status: r.value.status });
  });
  router.post("/cash-outs/:id/paid", decide("paid"));
  router.post("/cash-outs/:id/reject", decide("rejected"));
  router.post("/refund", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isUuid(b.userId)) return fail(res, 400, "Choose the holder");
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";
    if (note.length < 3) return fail(res, 400, "Write why the refund is made");
    const r = await d.tokens.requestCashOut(b.userId, { currency: CURRENCIES.includes(String(b.currency)) ? String(b.currency) : "ZAR", amountCents: b.amountCents, reason: "refund", by: uid(req), note });
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "token.refund", r.value.id, { userId: b.userId, amountCents: b.amountCents, note });
    res.status(201).json({ success: true, id: r.value.id });
  }));
  router.put("/settings", h(async (req, res) => {
    const r = await d.tokens.setDeviceFee((req.body ?? {}).deviceFeeCents, uid(req));
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "token.settings", null, { deviceFeeCents: r.value.deviceFeeCents });
    res.json({ success: true, ...r.value });
  }));
  return router;
}
