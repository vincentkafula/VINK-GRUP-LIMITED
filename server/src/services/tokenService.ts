import { createHash, randomUUID } from "node:crypto";
import type { Db } from "../portal/driverRoutes.js";
import { isUniqueViolation } from "../portal/common.js";
import { systemAccounts, walletLedgerAccount, bankLedgerAccount, type Engine, type LedgerPort } from "./moneyEngine.js";
import { ensureVirtualAccount } from "./poolService.js";
import { calculateRevenueSplit } from "./revenueSplitService.js";
import type { ConfigReader } from "../config/configService.js";
import { countryForCurrency, KYC_TIERS, type KycTier } from "../config/countryConfig.js";
import { checkTierLimit } from "../config/riskRules.js";

/**
 * VINK tokens: a closed-loop points system on top of the pooled bank account, like a city bus card.
 *
 *   top up     a customer pays money into the pooled bank account quoting their payment reference (their "account number"). When the bank's credit is
 *              recorded, the same amount is issued as tokens to their wallet (poolService, through the engine's token wallet lookup). 1 token = 1 unit
 *              of the currency, kept in cents.
 *   tap        a passenger taps a VINK card on the driver's device. Tokens move from the passenger's wallet to the clearing account and the money engine
 *              settles them to the driver (and the owner, marshal fee and device fee follow per trip). NOTHING moves in the bank.
 *   cash out   the only ways tokens become money: to the holder's own VINK bank account (instant), or as a cash-out / refund that staff pay out of the pool.
 *              There is no other withdrawal: no one, staff included, can take tokens out of a wallet except through these paths.
 *
 * Every movement is a balanced journal under a reference that makes it happen once. A wallet never goes below zero.
 */
export type TokenRole = "passenger" | "driver" | "owner" | "marshal" | "association" | "investor";
/** The portal account type -> the wallet role. */
export const TOKEN_ROLE_FOR_ACCOUNT: Record<string, TokenRole> = { personal: "passenger", driver: "driver", vehicle_owner: "owner", marshal: "marshal", association: "association", investor: "investor" };
export const MIN_CASHOUT_CENTS = 1000;                         // R10: a payout is a real bank transfer, so tiny ones are not worth making
const MAX_CENTS = 100_000_000;                                  // 1 000 000.00: a typing slip must not become a real movement
const CURRENCIES = ["ZAR", "ZMW"];

export const cashoutHold = (currency: string) => (currency === "ZAR" ? "sys:token_cashout" : `sys:${currency.toLowerCase()}:token_cashout`);
export const cardHash = (uid: string) => createHash("sha256").update(uid.trim().toUpperCase()).digest("hex");
export const normaliseCardUid = (uid: unknown): string | null => { const s = typeof uid === "string" ? uid.replace(/[\s:-]/g, "").toUpperCase() : ""; return /^[0-9A-Z]{4,32}$/.test(s) ? s : null; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }> };
export interface TokenWallet { id: string; userId: string; currency: string; role: TokenRole; status: string; kycTier: KycTier; accountNumber: string | null; balanceCents: number }
export type TokenResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; code?: string };
const bad = (status: number, error: string, code?: string): TokenResult<never> => ({ ok: false, status, error, code });
export type TapOutcome =
  | { ok: true; tapId: string; fareCents: number; balanceCents: number; route: string; replayed: boolean }
  | { ok: false; status: number; code: string; message: string; tapId?: string };
export interface ActivityLine { at: string; kind: string; amountCents: number; label: string }

export function createTokenService(deps: { db: Db; ledger: LedgerPort; reader: ConfigReader; now?: () => Date }) {
  const db = deps.db as unknown as Loose, { ledger, reader } = deps;
  let engine: Pick<Engine, "settleTaps"> | null = null;
  const clock = deps.now ?? (() => new Date());

  const account = (currency: string, userId: string) => walletLedgerAccount(currency, userId);
  const line = (currency: string, userId: string, amount: number, floor = false) => ({ account: account(currency, userId), merchant: userId, kind: "bank", amount, ...(floor ? { floor: 0 } : {}) });
  const event = async (userId: string, currency: string, kind: string, amountCents: number, counterparty: string | null, ref: string) => {
    await db.query(`INSERT INTO token_events (user_id, currency, kind, amount_cents, counterparty, ref) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, ref, kind) DO NOTHING`, [userId, currency, kind, amountCents, counterparty, ref]);
  };

  /** What the money engine asks for: the holder's active wallet in this currency, or null (then it falls back to their bank account). */
  async function partyOf(userId: string, currency: string) {
    const w = (await db.query(`SELECT status FROM token_wallets WHERE user_id = $1 AND currency = $2`, [userId, currency])).rows[0];
    return w && w.status === "active" ? { userId, account: account(currency, userId) } : null;
  }

  const view = async (r: Record<string, unknown>): Promise<TokenWallet> => {
    const va = (await db.query(`SELECT reference FROM virtual_accounts WHERE user_id = $1 AND currency = $2 AND pool = 'in_person'`, [r.user_id, r.currency])).rows[0];
    return { id: String(r.id), userId: String(r.user_id), currency: String(r.currency), role: r.role as TokenRole, status: String(r.status), kycTier: (r.kyc_tier as KycTier) ?? "basic", accountNumber: va?.reference ?? null, balanceCents: ledger.balance(account(String(r.currency), String(r.user_id))) };
  };

  async function wallet(userId: string, currency: string): Promise<TokenWallet | null> {
    const r = (await db.query(`SELECT * FROM token_wallets WHERE user_id = $1 AND currency = $2`, [userId, currency])).rows[0];
    return r ? view(r) : null;
  }

  /** Opens the holder's wallet (once) and gives it its account number: the payment reference customers quote when they pay into the pooled account. */
  async function openWallet(userId: string, role: TokenRole, currency: string): Promise<TokenResult<TokenWallet>> {
    if (!CURRENCIES.includes(currency)) return bad(400, "The currency must be ZAR or ZMW");
    if (!(await db.query(`SELECT 1 AS x FROM users WHERE id = $1`, [userId])).rows.length) return bad(404, "No such user");
    const have = (await db.query(`SELECT * FROM token_wallets WHERE user_id = $1 AND currency = $2`, [userId, currency])).rows[0];
    if (!have) {
      try { await db.query(`INSERT INTO token_wallets (user_id, currency, role) VALUES ($1,$2,$3)`, [userId, currency, role]); }
      catch (e) { if (!isUniqueViolation(e)) throw e; }                                      // the same holder raced us: the wallet is there
    }
    await ensureVirtualAccount(deps.db, userId, currency, "in_person");
    return { ok: true, value: (await wallet(userId, currency))! };
  }

  /** Staff set a holder's verification level after checking their identity. The level decides the balance and daily limits of the country profile. */
  async function setTier(userId: string, currency: string, tier: unknown): Promise<TokenResult<{ kycTier: KycTier }>> {
    if (typeof tier !== "string" || !(KYC_TIERS as readonly string[]).includes(tier)) return bad(400, "Choose basic, standard, full or business");
    const r = await db.query(`UPDATE token_wallets SET kyc_tier = $3 WHERE user_id = $1 AND currency = $2 RETURNING id`, [userId, currency, tier]);
    return r.rows.length ? { ok: true, value: { kycTier: tier as KycTier } } : bad(404, "This holder has no token wallet in that currency");
  }

  /* ── cards ── */
  async function linkCard(userId: string, currency: string, rawUid: unknown): Promise<TokenResult<{ last4: string }>> {
    const uid = normaliseCardUid(rawUid);
    if (!uid) return bad(400, "Enter the card number printed on the card (4 to 32 letters or numbers)");
    const w = (await db.query(`SELECT id, status FROM token_wallets WHERE user_id = $1 AND currency = $2`, [userId, currency])).rows[0];
    if (!w) return bad(409, "Open your VINK token wallet first");
    if (w.status !== "active") return bad(409, "This wallet is not active");
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM token_cards WHERE wallet_id = $1 AND status = 'active'`, [w.id])).rows[0].n) >= 3) return bad(409, "You can have up to 3 active cards. Block one first.");
    try { await db.query(`INSERT INTO token_cards (wallet_id, card_hash, last4) VALUES ($1,$2,$3)`, [w.id, cardHash(uid), uid.slice(-4)]); }
    catch (e) { if (isUniqueViolation(e)) return bad(409, "This card is already registered"); throw e; }
    return { ok: true, value: { last4: uid.slice(-4) } };
  }
  async function cards(userId: string, currency: string) {
    return (await db.query(`SELECT c.id, c.last4, c.status, c.created_at FROM token_cards c JOIN token_wallets w ON w.id = c.wallet_id WHERE w.user_id = $1 AND w.currency = $2 ORDER BY c.created_at`, [userId, currency])).rows
      .map((r) => ({ id: String(r.id), last4: String(r.last4), status: String(r.status), createdAt: new Date(r.created_at).toISOString() }));
  }
  /** A holder blocks their own card (a lost card must stop working at once). */
  async function blockCard(userId: string, cardId: string, status: "blocked" | "lost" = "blocked"): Promise<TokenResult<null>> {
    const r = await db.query(`UPDATE token_cards SET status = $3 WHERE id = $1 AND wallet_id IN (SELECT id FROM token_wallets WHERE user_id = $2) AND status = 'active' RETURNING id`, [cardId, userId, status]);
    return r.rows.length ? { ok: true, value: null } : bad(404, "No active card found");
  }

  /* ── the tap ── */
  /** A passenger taps a VINK card on a device. The server decides the fare from the route; the device only names the route and the card. */
  async function tapToken(t: { terminalId: string; cardUid: unknown; routeId: string; key: string }): Promise<TapOutcome> {
    const uid = normaliseCardUid(t.cardUid);
    if (!uid) return { ok: false, status: 400, code: "bad_card", message: "Card not recognised" };
    if (!/^[A-Za-z0-9._-]{6,80}$/.test(t.key)) return { ok: false, status: 400, code: "bad_key", message: "A unique tap reference is required" };
    const ref = `toktap:${t.terminalId}:${t.key}`;
    const dup = (await db.query(`SELECT id, status, amount, error_message FROM terminal_taps WHERE terminal_id = $1 AND idempotency_key = $2`, [t.terminalId, ref])).rows[0];
    const term = (await db.query(`SELECT id, association_id, status FROM terminals WHERE id = $1`, [t.terminalId])).rows[0];
    if (!term || term.status !== "active") return { ok: false, status: 403, code: "terminal", message: "This device is not active" };
    const route = (await db.query(`SELECT id, name, fare_cents, currency, association_id FROM token_routes WHERE id = $1 AND active = true AND (effective_from IS NULL OR effective_from <= $2)`, [t.routeId, clock()])).rows[0];
    if (!route || (route.association_id && term.association_id && route.association_id !== term.association_id)) return { ok: false, status: 404, code: "route", message: "Route not found for this device" };
    const c = (await db.query(`SELECT c.status AS card_status, w.id AS wallet_id, w.user_id, w.currency, w.status AS wallet_status FROM token_cards c JOIN token_wallets w ON w.id = c.wallet_id WHERE c.card_hash = $1`, [cardHash(uid)])).rows[0];
    if (!c || c.card_status !== "active") return { ok: false, status: 402, code: "card", message: "This card cannot be used" };
    if (c.wallet_status !== "active") return { ok: false, status: 402, code: "wallet", message: "This wallet is not active" };
    if (c.currency !== route.currency) return { ok: false, status: 402, code: "currency", message: `This card holds ${c.currency}; the route is priced in ${route.currency}` };
    const fare = Number(route.fare_cents), cur = String(c.currency), holder = String(c.user_id);
    const balance = () => ledger.balance(account(cur, holder));
    if (dup) {                                                                                 // a retried tap answers as before and never charges twice
      return dup.status === "confirmed"
        ? { ok: true, tapId: String(dup.id), fareCents: fare, balanceCents: balance(), route: String(route.name), replayed: true }
        : { ok: false, status: 402, code: "insufficient_tokens", message: "Not enough tokens", tapId: String(dup.id) };
    }
    const masked = `VINK ****${uid.slice(-4)}`;
    const posted = ledger.post(ref, "token_tap", [line(cur, holder, -fare, true), { account: systemAccounts(cur).clearing, kind: "system", amount: fare }], `Fare ${route.name}`);
    if (posted === "insufficient") {
      const d = await db.query(`INSERT INTO terminal_taps (terminal_id, masked_pan, scheme, amount, currency, cardholder_verification, status, error_message, idempotency_key)
                                VALUES ($1,$2,'vink_token',$3,$4,'token_card','declined','insufficient_tokens',$5) RETURNING id`, [t.terminalId, masked, fare / 100, cur, ref]);
      return { ok: false, status: 402, code: "insufficient_tokens", message: "Not enough tokens", tapId: String(d.rows[0].id) };
    }
    const cfg = (await reader.active(countryForCurrency(cur))).config;
    const split = calculateRevenueSplit(fare / 100, cfg.afc);
    const fee = split.vinkFeeDevice + split.vinkFeeCard;
    // the investor is paid the device fee per trip, not a share of each tap, so the per-tap investor share is zero for token taps
    const ins = await db.query(`INSERT INTO terminal_taps (terminal_id, masked_pan, scheme, amount, currency, cardholder_verification, vink_fee_device, vink_fee_card, owner_settlement, investor_share, idempotency_key, status)
                                VALUES ($1,$2,'vink_token',$3,$4,'token_card',$5,$6,$7,0,$8,'confirmed') RETURNING id`,
      [t.terminalId, masked, fare / 100, cur, split.vinkFeeDevice, split.vinkFeeCard, Math.max(0, fare / 100 - fee), ref]);
    await event(holder, cur, "fare", -fare, String(route.name), ref);
    if (engine) { try { await engine.settleTaps(25); } catch (e) { console.error("[token] settle after tap failed:", e instanceof Error ? e.message : e); } }   // the driver is credited at once; a failure here is retried by the next cycle
    return { ok: true, tapId: String(ins.rows[0].id), fareCents: fare, balanceCents: balance(), route: String(route.name), replayed: false };
  }

  /* ── moving tokens between holders, and out of the system ── */
  const LEAVING = ["transfer_out", "to_bank", "cash_out"];
  /** The holder's daily limit for tokens leaving their wallet, by their verification level. Only enforced when the country profile enforces limits. */
  async function withinLimit(userId: string, currency: string, amountCents: number): Promise<TokenResult<null>> {
    const cfg = (await reader.active(countryForCurrency(currency))).config;
    if (!cfg.limits.enforce) return { ok: true, value: null };
    const w = (await db.query(`SELECT kyc_tier FROM token_wallets WHERE user_id = $1 AND currency = $2`, [userId, currency])).rows[0];
    const used = Number((await db.query(`SELECT COALESCE(-SUM(amount_cents),0) AS s FROM token_events WHERE user_id = $1 AND currency = $2 AND kind = ANY($3) AND created_at >= $4`, [userId, currency, LEAVING, new Date(clock().getTime() - 24 * 3600_000)])).rows[0].s);
    const v = checkTierLimit(cfg, (w?.kyc_tier as KycTier) ?? "basic", { channel: "transfer_out", amountCents, usedTodayCents: used, balanceCents: 0 });
    return v.ok ? { ok: true, value: null } : bad(409, v.message, v.code);
  }
  const amountOk = (cents: unknown): cents is number => Number.isInteger(cents) && (cents as number) > 0 && (cents as number) <= MAX_CENTS;

  /** Tokens from one holder to another in the same currency (for example a passenger sending tokens to family). Exactly once per key. */
  async function transfer(from: string, a: { recipient: string; currency: string; amountCents: unknown; key: string }): Promise<TokenResult<{ balanceCents: number; recipientName: string }>> {
    if (!amountOk(a.amountCents)) return bad(400, "Enter an amount above zero");
    if (!/^[A-Za-z0-9._-]{6,80}$/.test(a.key)) return bad(400, "A unique request reference is required");
    const ident = a.recipient.trim();
    const to = ident.includes("@")
      ? (await db.query(`SELECT u.id, u.name FROM users u WHERE lower(u.email) = $1 LIMIT 1`, [ident.toLowerCase()])).rows[0]
      : (await db.query(`SELECT u.id, u.name FROM virtual_accounts v JOIN users u ON u.id = v.user_id WHERE v.reference = $1 AND v.currency = $2 LIMIT 1`, [ident.toUpperCase().replace(/[^A-Z0-9]/g, ""), a.currency])).rows[0];
    if (!to) return bad(404, "We could not find that person. Use their email or their account number.");
    if (to.id === from) return bad(400, "Choose someone else as the recipient");
    const mine = await partyOf(from, a.currency), theirs = await partyOf(String(to.id), a.currency);
    if (!mine) return bad(409, "Open your VINK token wallet first");
    const lim = await withinLimit(from, a.currency, a.amountCents); if (!lim.ok) return lim;
    if (!theirs) return bad(409, "The recipient has no active VINK token wallet in this currency");
    const ref = `xfer:${from}:${a.key}`;
    const r = ledger.post(ref, "token_transfer", [line(a.currency, from, -a.amountCents, true), line(a.currency, String(to.id), a.amountCents)], `Token transfer to ${to.name}`);
    if (r === "insufficient") return bad(409, "You do not have enough tokens", "insufficient_tokens");
    const me = (await db.query(`SELECT name FROM users WHERE id = $1`, [from])).rows[0];
    await event(from, a.currency, "transfer_out", -a.amountCents, String(to.name), ref);
    await event(String(to.id), a.currency, "transfer_in", a.amountCents, String(me?.name ?? ""), ref);
    return { ok: true, value: { balanceCents: ledger.balance(account(a.currency, from)), recipientName: String(to.name) } };
  }

  /** Tokens into the holder's own VINK bank account (a real account that can be given a bank card). Instant, and exactly once per key. */
  async function redeemToBank(userId: string, a: { currency: string; amountCents: unknown; key: string }): Promise<TokenResult<{ balanceCents: number }>> {
    if (!amountOk(a.amountCents)) return bad(400, "Enter an amount above zero");
    if (!/^[A-Za-z0-9._-]{6,80}$/.test(a.key)) return bad(400, "A unique request reference is required");
    if (a.currency !== "ZAR") return bad(409, "Only rand tokens can be moved to a VINK bank account at the moment");
    if (!(await partyOf(userId, a.currency))) return bad(409, "Open your VINK token wallet first");
    const lim = await withinLimit(userId, a.currency, a.amountCents); if (!lim.ok) return lim;
    const link = (await db.query(`SELECT manshya_account_id FROM bank_account_links WHERE user_id = $1 AND status = 'verified'`, [userId])).rows[0];
    if (!link) return bad(409, "Link and verify a VINK bank account first");
    const ref = `redeem:${userId}:${a.key}`;
    const r = ledger.post(ref, "token_redeem", [line(a.currency, userId, -a.amountCents, true), { account: bankLedgerAccount(link.manshya_account_id), merchant: userId, kind: "bank", amount: a.amountCents }], "Tokens to bank account");
    if (r === "insufficient") return bad(409, "You do not have enough tokens", "insufficient_tokens");
    await event(userId, a.currency, "to_bank", -a.amountCents, "Your VINK bank account", ref);
    return { ok: true, value: { balanceCents: ledger.balance(account(a.currency, userId)) } };
  }

  /** A cash-out (the holder) or a refund (staff, for any reason): the tokens move to a holding account and staff pay the money out of the pool. */
  async function requestCashOut(userId: string, a: { currency: string; amountCents: unknown; reason?: "cash_out" | "refund"; by: string; note?: string }): Promise<TokenResult<{ id: string; balanceCents: number }>> {
    if (!amountOk(a.amountCents)) return bad(400, "Enter an amount above zero");
    if (a.amountCents < MIN_CASHOUT_CENTS) return bad(400, `The smallest cash-out is ${(MIN_CASHOUT_CENTS / 100).toFixed(2)}`);
    if (!(await partyOf(userId, a.currency))) return bad(409, "This holder has no active VINK token wallet");
    if ((a.reason ?? "cash_out") === "cash_out") { const lim = await withinLimit(userId, a.currency, a.amountCents); if (!lim.ok) return lim; }          // a refund by staff is not limited
    const id = randomUUID(), ref = `cashout:${id}`, reason = a.reason ?? "cash_out";
    await db.query(`INSERT INTO token_cashouts (id, user_id, currency, amount_cents, reason, ref, note, requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, userId, a.currency, a.amountCents, reason, ref, a.note ?? null, a.by]);
    const r = ledger.post(ref, "token_cashout", [line(a.currency, userId, -a.amountCents, true), { account: cashoutHold(a.currency), kind: "system", amount: a.amountCents }], `${reason} request ${id}`);
    if (r === "insufficient") {
      await db.query(`DELETE FROM token_cashouts WHERE id = $1`, [id]);
      return bad(409, "There are not enough tokens in the wallet", "insufficient_tokens");
    }
    await event(userId, a.currency, reason, -a.amountCents, "Pending payout", ref);
    return { ok: true, value: { id, balanceCents: ledger.balance(account(a.currency, userId)) } };
  }

  /** Staff have paid the money out of the pool (paid), or refuse the request and the tokens return to the wallet (rejected). Each happens once. */
  async function decideCashOut(id: string, by: string, decision: "paid" | "rejected", note?: string): Promise<TokenResult<{ status: string }>> {
    const c = (await db.query(`SELECT * FROM token_cashouts WHERE id = $1`, [id])).rows[0];
    if (!c) return bad(404, "No such request");
    if (c.status !== "requested") return bad(409, `This request is already ${c.status}`);
    const cur = String(c.currency), amount = Number(c.amount_cents), user = String(c.user_id);
    if (decision === "paid") ledger.post(`${c.ref}:paid`, "token_cashout_paid", [{ account: cashoutHold(cur), kind: "system", amount: -amount }, { account: systemAccounts(cur).externalIn, kind: "system", amount }], `Cash-out ${id} paid from the pool`);
    else ledger.post(`${c.ref}:back`, "token_cashout_back", [{ account: cashoutHold(cur), kind: "system", amount: -amount }, line(cur, user, amount)], `Cash-out ${id} rejected`);
    const done = await db.query(`UPDATE token_cashouts SET status = $2, decided_by = $3, decided_at = now(), note = COALESCE($4, note) WHERE id = $1 AND status = 'requested' RETURNING id`, [id, decision, by, note ?? null]);
    if (!done.rows.length) return bad(409, "This request was just decided by someone else");
    await event(user, cur, decision === "paid" ? "cashout_paid" : "cashout_rejected", decision === "paid" ? 0 : amount, null, `${c.ref}:${decision}`);
    return { ok: true, value: { status: decision } };
  }

  /* ── what the holder and staff see ── */
  async function activity(userId: string, currency: string, limit = 30): Promise<ActivityLine[]> {
    const lines: ActivityLine[] = [];
    for (const r of (await db.query(`SELECT kind, amount_cents, counterparty, created_at FROM token_events WHERE user_id = $1 AND currency = $2 ORDER BY created_at DESC LIMIT $3`, [userId, currency, limit])).rows)
      lines.push({ at: new Date(r.created_at).toISOString(), kind: String(r.kind), amountCents: Number(r.amount_cents), label: r.counterparty ? String(r.counterparty) : String(r.kind).replace(/_/g, " ") });
    for (const r of (await db.query(`SELECT amount_cents, credited_at FROM pool_credits WHERE user_id = $1 AND currency = $2 AND status = 'credited' ORDER BY credited_at DESC LIMIT $3`, [userId, currency, limit])).rows)
      lines.push({ at: new Date(r.credited_at).toISOString(), kind: "top_up", amountCents: Number(r.amount_cents), label: "Tokens bought" });
    for (const r of (await db.query(`SELECT kind, payer_id, payee_id, amount_cents, note, paid_at FROM payment_items WHERE status = 'paid' AND currency = $2 AND (payer_id = $1 OR payee_id = $1) ORDER BY paid_at DESC LIMIT $3`, [userId, currency, limit])).rows)
      lines.push({ at: new Date(r.paid_at).toISOString(), kind: String(r.kind), amountCents: String(r.payee_id) === userId ? Number(r.amount_cents) : -Number(r.amount_cents), label: String(r.note ?? r.kind) });
    return lines.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  /** Tokens in circulation, by role, and what is waiting to be paid out. The bank side is checked in reconciliation. */
  async function summary(currency: string) {
    const rows = (await db.query(`SELECT user_id, role, status FROM token_wallets WHERE currency = $1`, [currency])).rows;
    const byRole: Record<string, { wallets: number; cents: number }> = {};
    let circulation = 0;
    for (const r of rows) {
      const b = ledger.balance(account(currency, String(r.user_id)));
      circulation += b;
      const k = (byRole[String(r.role)] ??= { wallets: 0, cents: 0 }); k.wallets++; k.cents += b;
    }
    const open = (await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS s FROM token_cashouts WHERE currency = $1 AND status = 'requested'`, [currency])).rows[0];
    return { currency, wallets: rows.length, circulationCents: circulation, byRole, clearingCents: ledger.balance(systemAccounts(currency).clearing), pendingCashouts: { count: Number(open.n), cents: Number(open.s) }, holdingCents: ledger.balance(cashoutHold(currency)) };
  }

  async function settings() {
    const r = (await db.query(`SELECT device_fee_cents FROM token_settings WHERE scope = 'default'`)).rows[0];
    return { deviceFeeCents: r ? Number(r.device_fee_cents) : 100 };
  }
  async function setDeviceFee(cents: unknown, by: string): Promise<TokenResult<{ deviceFeeCents: number }>> {
    if (!Number.isInteger(cents) || (cents as number) < 0 || (cents as number) > 100_000) return bad(400, "The device fee must be between 0 and 1 000.00");
    await db.query(`INSERT INTO token_settings (scope, device_fee_cents, updated_by, updated_at) VALUES ('default',$1,$2, now())
                    ON CONFLICT (scope) DO UPDATE SET device_fee_cents = EXCLUDED.device_fee_cents, updated_by = EXCLUDED.updated_by, updated_at = now()`, [cents, by]);
    return { ok: true, value: { deviceFeeCents: cents as number } };
  }

  /* ── fares per route ── */
  async function routes(associationId: string | null) {
    const rows = associationId
      ? (await db.query(`SELECT * FROM token_routes WHERE association_id = $1 ORDER BY name`, [associationId])).rows
      : (await db.query(`SELECT * FROM token_routes WHERE active = true ORDER BY name`)).rows;
    return rows.map((r) => ({ id: String(r.id), associationId: r.association_id ?? null, name: String(r.name), fareCents: Number(r.fare_cents), currency: String(r.currency), effectiveFrom: r.effective_from ? new Date(r.effective_from).toISOString().slice(0, 10) : null, active: !!r.active }));
  }
  async function upsertRoute(associationId: string, r: { name?: unknown; fareCents?: unknown; currency?: unknown; effectiveFrom?: unknown; active?: unknown }): Promise<TokenResult<{ id: string }>> {
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (name.length < 2 || name.length > 80 || /[<>]/.test(name)) return bad(400, "Enter the route name (2 to 80 characters)");
    if (!Number.isInteger(r.fareCents) || (r.fareCents as number) <= 0 || (r.fareCents as number) > 100_000) return bad(400, "The fare must be above zero and at most 1 000.00");
    const cur = r.currency === "ZMW" ? "ZMW" : "ZAR";
    const from = typeof r.effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom) ? r.effectiveFrom : null;
    const row = (await db.query(`INSERT INTO token_routes (association_id, name, fare_cents, currency, effective_from, active) VALUES ($1,$2,$3,$4,$5,$6)
                                 ON CONFLICT (association_id, name) DO UPDATE SET fare_cents = EXCLUDED.fare_cents, currency = EXCLUDED.currency, effective_from = EXCLUDED.effective_from, active = EXCLUDED.active
                                 RETURNING id`, [associationId, name, r.fareCents, cur, from, r.active === false ? false : true])).rows[0];
    return { ok: true, value: { id: String(row.id) } };
  }

  return { bindEngine(e: Pick<Engine, "settleTaps">) { engine = e; }, partyOf, setTier, wallet, openWallet, linkCard, cards, blockCard, tapToken, transfer, redeemToBank, requestCashOut, decideCashOut, activity, summary, settings, setDeviceFee, routes, upsertRoute };
}
export type TokenService = ReturnType<typeof createTokenService>;
