import { createHash, randomUUID } from "node:crypto";
import type { Db } from "../portal/driverRoutes.js";
import { isUniqueViolation } from "../portal/common.js";
import { systemAccounts, walletLedgerAccount, bankLedgerAccount, type Engine, type LedgerPort } from "./moneyEngine.js";
import { ensureVirtualAccount } from "./poolService.js";
import { calculateRevenueSplit } from "./revenueSplitService.js";
import type { ConfigReader } from "../config/configService.js";
import { countryForCurrency, KYC_TIERS, type KycTier } from "../config/countryConfig.js";
import { checkTierLimit } from "../config/riskRules.js";
import type { CardVaultProvider, CardPayoutProvider, AccountValidationProvider, IssuingProvider, HostedCardFields, HostedCardResult, HostedCardSession } from "../payments/providers/types.js";
import { computeFee } from "../config/feeEngine.js";
import { MOCK_CARD_SCENARIOS, expiryOf } from "../payments/providers/mockCardRail.js";

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
export const MIN_CASHOUT_CENTS = 1000;                         // R10: a payout is a real card transaction, so tiny ones are not worth making
export const MAX_PAYOUT_CENTS = 2_500_000;                     // R25 000 in one payout
export const MAX_PAYOUT_ATTEMPTS = 6;
const PAYOUT_BACKOFF_MIN = [1, 5, 30, 120, 360, 720];
const PROCESSING_STALE_MS = 5 * 60_000;                        // a payout sent but never answered is asked again after this (the reference stops it paying twice)

const nameWords = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
/** The name on the card must be the account holder's: their surname and the initial of their first name both appear on the card. Otherwise a person decides. */
export function namesMatch(accountName: string, cardName: string): boolean {
  const a = nameWords(accountName), c = nameWords(cardName);
  if (!a.length || !c.length) return false;
  return c.includes(a[a.length - 1]) && c.some((w) => w[0] === a[0][0]);
}
const MAX_CENTS = 100_000_000;                                  // 1 000 000.00: a typing slip must not become a real movement
const CURRENCIES = ["ZAR", "ZMW"];

/** Amounts approved on a VINK card wait here until the sponsor bank settles them with the card scheme. */
export const cardSettlement = (currency: string) => (currency === "ZAR" ? "sys:card_settlement" : `sys:${currency.toLowerCase()}:card_settlement`);
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

export interface PayoutCardView { id: string; brand: string; last4: string; expiry: string; status: string }
export interface IssuedCardView { id: string; brand: string; last4: string; expiry: string; status: string; currency: string; form: "virtual" | "physical"; /** A physical card works only once activated. */ activated: boolean; /** Physical cards: ordered, shipped or activated. */ delivery?: string }
export interface CardOrderView { id: string; cardId: string; userId: string; holder: string; brand: string; last4: string; nameOnCard: string; address: string; phone: string; status: string; orderedAt: string; shippedAt: string | null; attempts: number }
const MAX_ACTIVATION_TRIES = 5;
export interface CardDecision { approved: boolean; reason?: string; replayed: boolean }
export interface PayoutAttempt { status: "paid" | "rejected" | "requested" | "processing" | "none"; reason?: string }

export function createTokenService(deps: {
  /** The processor's hosted card fields. With these, a card is added without its number ever reaching this server. */
  hosted?: HostedCardFields;
  /** false: tokens cannot be paid out to an outside debit card (cash-outs, refunds and adding payout cards are refused). Default true. See PaymentsConfig.externalPayouts. */
  externalPayouts?: boolean;
  /** false in live mode: card numbers are then refused here and can only come through the hosted fields. Default true (sandbox test cards). */
  acceptRawCardNumbers?: boolean;
  db: Db; ledger: LedgerPort; reader: ConfigReader; now?: () => Date;
  /** Turns a card into a token, and pushes money to a token. Without it nobody can cash out or be refunded. */
  rail?: { name: string; vault: CardVaultProvider; payout: CardPayoutProvider };
  /** Checks a card is real before it is added. */
  validator?: AccountValidationProvider;
  /** Further sandbox test card numbers (from the settings) that may be added. */
  extraTestPans?: string[];
  /** Issues the VINK debit card (virtual) and freezes or blocks it. Without it nobody can be issued a card. */
  issuer?: IssuingProvider;
}) {
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

  /* ── the holder's own debit cards, the only place money is ever paid to ── */
  const TEST_PANS = new Set([...MOCK_CARD_SCENARIOS.map((c) => c.pan), ...(deps.extraTestPans ?? [])]);

  /**
   * Adds a debit card to receive payouts. The card number is passed on once to be tokenised and is never stored or logged. Until the processor's hosted card fields
   * exist (so the number never reaches this server), only the published SANDBOX TEST cards are accepted: a real card number is refused before anything is done with it.
   */
  async function addPayoutCard(userId: string, b: { primaryAccountNumber?: unknown; expiry?: unknown; cardholderName?: unknown }): Promise<TokenResult<{ id: string; last4: string; brand: string; status: string }>> {
    if (deps.externalPayouts === false) return bad(403, "Payouts to other cards are not used. Withdraw with your VINK card.", "withdraw_with_card");
    if (!deps.rail) return bad(503, "Card payouts are not set up yet");
    if (deps.acceptRawCardNumbers === false) return bad(403, "Card numbers are entered in the secure card form only.", "card_fields_required");
    const pan = typeof b.primaryAccountNumber === "string" ? b.primaryAccountNumber.replace(/[\s-]/g, "") : "";
    if (!/^[0-9]{13,19}$/.test(pan)) return bad(400, "Enter the card number");
    if (!TEST_PANS.has(pan)) return bad(403, "Only sandbox test cards can be added until live card tokenisation is in place. Do not enter a real card number.", "sandbox_only");
    const name = typeof b.cardholderName === "string" ? b.cardholderName.trim() : "";
    if (name.length < 2 || name.length > 40 || /[<>]/.test(name)) return bad(400, "Enter the name on the card");
    const raw = typeof b.expiry === "string" ? b.expiry.trim() : "";
    const mmyy = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/.exec(raw);
    const expiry = mmyy ? `20${mmyy[2]}-${mmyy[1]}` : raw;
    if (!expiryOf(expiry, clock())) return bad(400, "The card has expired, or the expiry date is not valid");
    const user = (await db.query(`SELECT name FROM users WHERE id = $1`, [userId])).rows[0];
    if (!user) return bad(404, "No such user");
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM token_payout_cards WHERE user_id = $1 AND status IN ('verified','needs_review')`, [userId])).rows[0].n) >= 3) return bad(409, "You can have up to 3 cards. Remove one first.");
    if (deps.validator) {
      try {
        const v = await deps.validator.validate({ primaryAccountNumber: pan, expiry });
        if (!v.valid) return bad(409, `The card could not be verified (code ${v.actionCode}). Check the details.`, "card_invalid");
      } catch { return bad(502, "The card could not be checked right now. Please try again."); }
    }
    let card;
    try { card = await deps.rail.vault.tokenise({ primaryAccountNumber: pan, expiry, cardholderName: name }); }
    catch (e) { return bad(400, e instanceof Error ? e.message : "The card could not be added"); }
    return finishAdd(userId, String(user.name), card, name);
  }

  /** What every way of adding a card ends with: debit only, name checked against the account, stored as a token. */
  async function finishAdd(userId: string, accountName: string, card: { token: string; last4: string; brand: string; expiry: string; funding: string }, name: string): Promise<TokenResult<{ id: string; last4: string; brand: string; status: string }>> {
    if (card.funding !== "debit") return bad(409, `A payout can only be made to a debit card. This looks like a ${card.funding} card.`, "not_debit");
    const status = namesMatch(accountName, name) ? "verified" : "needs_review";
    try {
      const r = await db.query(`INSERT INTO token_payout_cards (user_id, brand, last4, expiry, funding, cardholder_name, provider, token, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [userId, card.brand, card.last4, card.expiry, card.funding, name, deps.rail!.name, card.token, status]);
      return { ok: true, value: { id: String(r.rows[0].id), last4: card.last4, brand: card.brand, status } };
    } catch (e) { if (isUniqueViolation(e)) return bad(409, "This card is already added"); throw e; }
  }

  /** Starts a secure card-entry session. The card form is the processor's, so the number is never sent to this server. */
  async function startCardSession(userId: string): Promise<TokenResult<HostedCardSession>> {
    if (deps.externalPayouts === false) return bad(403, "Payouts to other cards are not used. Withdraw with your VINK card.", "withdraw_with_card");
    if (!deps.hosted || !deps.rail) return bad(501, "Secure card entry is not available here.", "hosted_unavailable");
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM token_payout_cards WHERE user_id = $1 AND status IN ('verified','needs_review')`, [userId])).rows[0].n) >= 3) return bad(409, "You can have up to 3 cards. Remove one first.");
    try { return { ok: true, value: await deps.hosted.createSession({ userId }) }; }
    catch (e) { return bad(503, e instanceof Error ? e.message.slice(0, 160) : "Card entry is not available right now."); }
  }
  /** The card form reported "done". Collect the tokenised card for this user and add it. */
  async function addPayoutCardFromSession(userId: string, sessionId: unknown): Promise<TokenResult<{ id: string; last4: string; brand: string; status: string }>> {
    if (!deps.hosted || !deps.rail) return bad(501, "Secure card entry is not available here.", "hosted_unavailable");
    if (typeof sessionId !== "string" || sessionId.length < 10 || sessionId.length > 200) return bad(400, "That card form is not valid.");
    let card: HostedCardResult | null;
    try { card = await deps.hosted.complete({ sessionId, userId }); } catch { return bad(502, "The card could not be collected right now. Please try again."); }
    if (!card) return bad(409, "That card form has expired or was already used. Start again.");
    const mmyy = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(card.expiry);
    if (!mmyy || !expiryOf(`20${mmyy[2]}-${mmyy[1]}`, clock())) return bad(400, "The card has expired, or the expiry date is not valid");
    const user = (await db.query(`SELECT name FROM users WHERE id = $1`, [userId])).rows[0];
    if (!user) return bad(404, "No such user");
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM token_payout_cards WHERE user_id = $1 AND status IN ('verified','needs_review')`, [userId])).rows[0].n) >= 3) return bad(409, "You can have up to 3 cards. Remove one first.");
    return finishAdd(userId, String(user.name), card, card.cardholderName);
  }
  async function payoutCards(userId: string): Promise<PayoutCardView[]> {
    return (await db.query(`SELECT id, brand, last4, expiry, status FROM token_payout_cards WHERE user_id = $1 AND status <> 'removed' ORDER BY created_at`, [userId])).rows
      .map((r) => ({ id: String(r.id), brand: String(r.brand), last4: String(r.last4), expiry: String(r.expiry), status: String(r.status) }));
  }
  async function removePayoutCard(userId: string, cardId: string): Promise<TokenResult<null>> {
    if ((await db.query(`SELECT 1 AS x FROM token_cashouts WHERE card_id = $1 AND status IN ('requested','processing')`, [cardId])).rows.length) return bad(409, "A payout to this card is still in progress. Remove it when it has finished.");
    const r = await db.query(`UPDATE token_payout_cards SET status = 'removed' WHERE id = $1 AND user_id = $2 AND status <> 'removed' RETURNING id`, [cardId, userId]);
    return r.rows.length ? { ok: true, value: null } : bad(404, "No such card");
  }
  /** Staff look at a card whose name does not match the account holder's and either approve it or refuse it. */
  async function reviewPayoutCard(cardId: string, by: string, decision: "approve" | "reject", note?: string): Promise<TokenResult<{ status: string }>> {
    const status = decision === "approve" ? "verified" : "rejected";
    const r = await db.query(`UPDATE token_payout_cards SET status = $2, reviewed_by = $3, review_note = $4 WHERE id = $1 AND status = 'needs_review' RETURNING id`, [cardId, status, by, note ?? null]);
    return r.rows.length ? { ok: true, value: { status } } : bad(404, "No card is waiting for review with that id");
  }
  async function cardsToReview() {
    return (await db.query(`SELECT c.id, c.user_id, u.name AS account_name, u.email, c.cardholder_name, c.brand, c.last4, c.created_at FROM token_payout_cards c JOIN users u ON u.id = c.user_id WHERE c.status = 'needs_review' ORDER BY c.created_at`)).rows
      .map((r) => ({ id: String(r.id), userId: String(r.user_id), accountName: String(r.account_name), email: String(r.email), cardholderName: String(r.cardholder_name), brand: String(r.brand), last4: String(r.last4), createdAt: new Date(r.created_at).toISOString() }));
  }
  const pickCard = async (userId: string, cardId: unknown) => {
    if (cardId !== undefined && cardId !== null && cardId !== "") return (await db.query(`SELECT id FROM token_payout_cards WHERE id = $1 AND user_id = $2 AND status = 'verified'`, [cardId, userId])).rows[0] ?? null;
    return (await db.query(`SELECT id FROM token_payout_cards WHERE user_id = $1 AND status = 'verified' ORDER BY created_at DESC LIMIT 1`, [userId])).rows[0] ?? null;
  };

  /**
   * A cash-out (the holder) or a refund (staff, for any reason). The tokens move to a holding account and the money is pushed to the holder's OWN verified debit card
   * by the system, at once and again later if the card service is not available. It is never paid to a bank account and never by hand.
   */
  async function requestCashOut(userId: string, a: { currency: string; amountCents: unknown; reason?: "cash_out" | "refund"; by: string; note?: string; cardId?: unknown }): Promise<TokenResult<{ id: string; balanceCents: number; status: string; message: string }>> {
    if (deps.externalPayouts === false) return bad(403, "Money is withdrawn with your VINK card, at a cash machine or in a shop. Tokens are not paid out to other cards.", "withdraw_with_card");
    if (!deps.rail) return bad(503, "Card payouts are not set up yet");
    if (!amountOk(a.amountCents)) return bad(400, "Enter an amount above zero");
    if (a.amountCents < MIN_CASHOUT_CENTS) return bad(400, `The smallest cash-out is ${(MIN_CASHOUT_CENTS / 100).toFixed(2)}`);
    if (a.amountCents > MAX_PAYOUT_CENTS) return bad(400, `The most that can be paid to a card at once is ${(MAX_PAYOUT_CENTS / 100).toFixed(2)}`);
    if (a.currency !== "ZAR") return bad(409, "Cash-outs are paid to a rand debit card. Kwacha cash-outs are not available yet.");
    if (!(await partyOf(userId, a.currency))) return bad(409, "This holder has no active VINK token wallet");
    const card = await pickCard(userId, a.cardId);
    if (!card) return bad(409, "Add and verify your own debit card first. Money is only ever paid out to your own debit card, never to a bank account.", "no_payout_card");
    const reason = a.reason ?? "cash_out";
    if (reason === "cash_out") { const lim = await withinLimit(userId, a.currency, a.amountCents); if (!lim.ok) return lim; }          // a refund by staff is not limited
    const id = randomUUID(), ref = `cashout:${id}`;
    await db.query(`INSERT INTO token_cashouts (id, user_id, currency, amount_cents, reason, ref, note, requested_by, card_id, provider) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, userId, a.currency, a.amountCents, reason, ref, a.note ?? null, a.by, card.id, deps.rail.name]);
    const r = ledger.post(ref, "token_cashout", [line(a.currency, userId, -a.amountCents, true), { account: cashoutHold(a.currency), kind: "system", amount: a.amountCents }], `${reason} request ${id}`);
    if (r === "insufficient") {
      await db.query(`DELETE FROM token_cashouts WHERE id = $1`, [id]);
      return bad(409, "There are not enough tokens in the wallet", "insufficient_tokens");
    }
    await event(userId, a.currency, reason, -a.amountCents, "Payout to your debit card", ref);
    const out = await attemptPayout(id);
    const message = out.status === "paid" ? "Paid to your debit card." : out.status === "rejected" ? `The card was not paid: ${out.reason ?? "it was declined"}. Your tokens are back in your wallet.` : "On its way to your debit card. We keep trying if the card service is busy.";
    return { ok: true, value: { id, balanceCents: ledger.balance(account(a.currency, userId)), status: out.status === "none" ? "requested" : out.status, message } };
  }

  /**
   * Pushes one payout to the card. Safe to call again at any time: the payout reference is the cash-out's own, so the card service pays it once however often it is asked,
   * and a payout that was sent but never answered is asked again after a few minutes. A definite refusal returns the tokens; an unknown outcome is retried, never returned.
   */
  async function attemptPayout(id: string, now: Date = clock()): Promise<PayoutAttempt> {
    if (!deps.rail) return { status: "none" };
    const claimed = (await db.query(
      `UPDATE token_cashouts SET status = 'processing', attempts = attempts + 1, attempted_at = $2
        WHERE id = $1 AND ((status = 'requested' AND next_attempt_at <= $2 AND attempts < $3) OR (status = 'processing' AND attempted_at < $4)) RETURNING *`,
      [id, now, MAX_PAYOUT_ATTEMPTS, new Date(now.getTime() - PROCESSING_STALE_MS)])).rows[0];
    if (!claimed) return { status: ((await db.query(`SELECT status FROM token_cashouts WHERE id = $1`, [id])).rows[0]?.status ?? "none") as PayoutAttempt["status"] };
    const cur = String(claimed.currency), amount = Number(claimed.amount_cents), user = String(claimed.user_id), ref = String(claimed.ref);
    const card = (await db.query(`SELECT token, brand, cardholder_name, last4 FROM token_payout_cards WHERE id = $1`, [claimed.card_id])).rows[0];
    let res;
    try {
      res = card ? await deps.rail.payout.push({ reference: ref, card: { token: String(card.token), brand: card.brand }, amount: { amount, currency: cur }, recipientName: String(card.cardholder_name), narrative: claimed.reason === "refund" ? "VINK refund" : "VINK cash-out" })
                 : { status: "declined" as const, reason: "The card is no longer available" };
    } catch (e) { res = { status: "error" as const, reason: e instanceof Error ? e.message.slice(0, 200) : "The card service failed" }; }
    if (res.status === "sent") {
      ledger.post(`${ref}:paid`, "token_cashout_paid", [{ account: cashoutHold(cur), kind: "system", amount: -amount }, { account: systemAccounts(cur).externalIn, kind: "system", amount }], `Payout ${claimed.id} sent to the debit card`);
      await db.query(`UPDATE token_cashouts SET status = 'paid', provider_ref = $2, decided_at = now(), last_error = NULL WHERE id = $1`, [id, res.providerRef ?? null]);
      await event(user, cur, "payout_sent", 0, `Debit card ****${card?.last4 ?? ""}`, `${ref}:paid`);
      return { status: "paid" };
    }
    if (res.status === "declined") {
      ledger.post(`${ref}:back`, "token_cashout_back", [{ account: cashoutHold(cur), kind: "system", amount: -amount }, line(cur, user, amount)], `Payout ${claimed.id} declined`);
      await db.query(`UPDATE token_cashouts SET status = 'rejected', last_error = $2, decided_at = now() WHERE id = $1`, [id, res.reason ?? "declined"]);
      await event(user, cur, "payout_declined", amount, res.reason ?? null, `${ref}:rejected`);
      return { status: "rejected", reason: res.reason };
    }
    const wait = PAYOUT_BACKOFF_MIN[Math.min(Number(claimed.attempts) - 1, PAYOUT_BACKOFF_MIN.length - 1)];
    await db.query(`UPDATE token_cashouts SET status = 'requested', last_error = $2, next_attempt_at = $3 WHERE id = $1`, [id, res.reason ?? "The card service did not answer", new Date(now.getTime() + wait * 60_000)]);
    return { status: "requested", reason: res.reason };
  }

  /** Every payout that is due: waiting for a retry, or sent and not answered for a few minutes. Run by the money cycle; safe to repeat. */
  async function processPayouts(now: Date = clock(), limit = 50): Promise<{ paid: number; rejected: number; waiting: number }> {
    const ids = (await db.query(
      `SELECT id FROM token_cashouts WHERE (status = 'requested' AND next_attempt_at <= $1 AND attempts < $2) OR (status = 'processing' AND attempted_at < $3) ORDER BY requested_at LIMIT $4`,
      [now, MAX_PAYOUT_ATTEMPTS, new Date(now.getTime() - PROCESSING_STALE_MS), limit])).rows.map((r) => String(r.id));
    const out = { paid: 0, rejected: 0, waiting: 0 };
    for (const id of ids) { const r = await attemptPayout(id, now); if (r.status === "paid") out.paid++; else if (r.status === "rejected") out.rejected++; else out.waiting++; }
    return out;
  }

  /** Staff cannot pay a payout. They can ask the system to try again now, which is the way out of a payout whose retries ran out. */
  async function retryCashOut(id: string): Promise<TokenResult<{ status: string }>> {
    const r = await db.query(`UPDATE token_cashouts SET attempts = 0, next_attempt_at = now() WHERE id = $1 AND status = 'requested' RETURNING id`, [id]);
    if (!r.rows.length) return bad(409, "Only a payout that is waiting can be retried");
    const out = await attemptPayout(id);
    return { ok: true, value: { status: out.status } };
  }

  /** Staff refuse a payout that is waiting (for example the holder asks to stop it, or the retries ran out and the card service confirms nothing was sent): the tokens go back to the wallet. */
  async function decideCashOut(id: string, by: string, decision: "rejected", note?: string): Promise<TokenResult<{ status: string }>> {
    if (decision !== "rejected") return bad(400, "A payout can only be refused. It is paid to the card by the system.");
    const c = (await db.query(`SELECT * FROM token_cashouts WHERE id = $1`, [id])).rows[0];
    if (!c) return bad(404, "No such request");
    if (c.status === "processing") return bad(409, "This payout is with the card service now. Try again in a few minutes.");
    if (c.status !== "requested") return bad(409, `This request is already ${c.status}`);
    const cur = String(c.currency), amount = Number(c.amount_cents), user = String(c.user_id);
    const done = await db.query(`UPDATE token_cashouts SET status = 'rejected', decided_by = $2, decided_at = now(), note = COALESCE($3, note) WHERE id = $1 AND status = 'requested' RETURNING id`, [id, by, note ?? null]);
    if (!done.rows.length) return bad(409, "This payout just moved on. Look at it again.");
    ledger.post(`${c.ref}:back`, "token_cashout_back", [{ account: cashoutHold(cur), kind: "system", amount: -amount }, line(cur, user, amount)], `Cash-out ${id} refused by staff`);
    await event(user, cur, "cashout_rejected", amount, null, `${c.ref}:rejected`);
    return { ok: true, value: { status: "rejected" } };
  }

  /* ── the VINK debit card: a Visa or Mastercard that spends the holder's tokens ── */
  const cardView = (r: Record<string, unknown>, delivery?: string): IssuedCardView => {
    const physical = r.form === "physical";
    return { id: String(r.id), brand: String(r.brand), last4: String(r.last4), expiry: String(r.expiry), status: String(r.status), currency: String(r.currency), form: physical ? "physical" : "virtual", activated: !physical || !!r.activated_at, ...(physical ? { delivery: delivery ?? (r.activated_at ? "activated" : "ordered") } : {}) };
  };

  /** What the holder may choose when getting a card. */
  const cardOptions = () => ({ brands: deps.issuer?.brands?.() ?? [], forms: ["virtual", "physical"], countries: ["ZA", "ZM"] });

  /** The delivery details of a physical card, checked. The name is what is printed on the card, so it is limited to what a card can carry. */
  function cleanDelivery(d: unknown): TokenResult<{ nameOnCard: string; addressLine1: string; addressLine2: string | null; city: string; province: string | null; postalCode: string; country: string; phone: string }> {
    const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    const t = (k: string) => (typeof o[k] === "string" ? String(o[k]).trim() : "");
    const nameOnCard = t("nameOnCard").toUpperCase();
    if (!/^[A-Z][A-Z .'-]{1,25}$/.test(nameOnCard)) return bad(400, "Enter the name to print on the card (letters only, up to 26 characters)");
    if (t("addressLine1").length < 3 || t("addressLine1").length > 60) return bad(400, "Enter the street address");
    if (t("addressLine2").length > 60) return bad(400, "The second address line is too long");
    if (t("city").length < 2 || t("city").length > 40) return bad(400, "Enter the town or city");
    if (t("province").length > 40) return bad(400, "The province is too long");
    if (!/^[A-Za-z0-9 -]{3,10}$/.test(t("postalCode"))) return bad(400, "Enter the postal code");
    const country = t("country").toUpperCase();
    if (country !== "ZA" && country !== "ZM") return bad(400, "Cards are delivered in South Africa or Zambia");
    const phone = t("phone").replace(/[\s()-]/g, "");
    if (!/^\+?[0-9]{9,15}$/.test(phone)) return bad(400, "Enter a phone number for the courier");
    return { ok: true, value: { nameOnCard, addressLine1: t("addressLine1"), addressLine2: t("addressLine2") || null, city: t("city"), province: t("province") || null, postalCode: t("postalCode"), country, phone } };
  }

  /**
   * Issues a Visa or Mastercard debit card against the holder's token wallet. It needs a wallet that is active and a verification level above basic. The holder
   * chooses the brand, and a virtual card, a physical card or both (one live card of each kind). A physical card needs a delivery address, is delivered to the
   * holder, and works only after the holder activates it.
   */
  async function issueCard(userId: string, currency: string, opts: { brand?: unknown; form?: unknown; delivery?: unknown } = {}): Promise<TokenResult<IssuedCardView>> {
    if (!deps.issuer) return bad(503, "Card issuing is not set up yet");
    const form = opts.form === undefined || opts.form === "virtual" ? "virtual" : opts.form === "physical" ? "physical" : null;
    if (!form) return bad(400, "Choose a virtual or a physical card");
    const available = deps.issuer.brands?.();
    let brand: "visa" | "mastercard" | undefined;
    if (opts.brand !== undefined && opts.brand !== "visa" && opts.brand !== "mastercard") return bad(400, "Choose Visa or Mastercard");
    brand = opts.brand as typeof brand;
    if (brand && available && !available.includes(brand)) return bad(409, `${brand === "visa" ? "Visa" : "Mastercard"} cards are not available yet`);
    if (!brand && available && available.length > 1) return bad(400, "Choose Visa or Mastercard");
    if (!brand && available?.length === 1) brand = available[0];
    const w = (await db.query(`SELECT status, kyc_tier FROM token_wallets WHERE user_id = $1 AND currency = $2`, [userId, currency])).rows[0];
    if (!w) return bad(409, "Open your VINK token wallet first");
    if (w.status !== "active") return bad(409, "This wallet is not active");
    if (w.kyc_tier === "basic") return bad(409, "A VINK card needs your identity to be checked first. Ask VINK to verify you.", "needs_verification");
    let delivery: ReturnType<typeof cleanDelivery> | null = null;
    if (form === "physical") { delivery = cleanDelivery(opts.delivery); if (!delivery.ok) return delivery; }
    if ((await db.query(`SELECT 1 AS x FROM token_issued_cards WHERE user_id = $1 AND currency = $2 AND form = $3 AND status <> 'blocked'`, [userId, currency, form])).rows.length) return bad(409, `You already have a ${form} VINK card. Block it first if you need a new one.`);
    const u = (await db.query(`SELECT u.name, u.email, COALESCE(p.phone, d.phone) AS phone FROM users u LEFT JOIN personal_profiles p ON p.user_id = u.id LEFT JOIN driver_profiles d ON d.user_id = u.id WHERE u.id = $1`, [userId])).rows[0];
    const parts = String(u?.name ?? "").trim().split(/\s+/).filter(Boolean);
    const digits = String((delivery?.ok ? delivery.value.phone : u?.phone) ?? "").replace(/[^0-9]/g, "");
    const mobile = digits.startsWith("0") ? `27${digits.slice(1)}` : digits;                                         // 082... -> 2782...
    const holder = { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") || parts[0] || "", mobile, email: u?.email ? String(u.email) : undefined };
    let card;
    try { card = await deps.issuer.createCard({ customerRef: userId, kind: form, requestId: `${userId}-${currency}-${form}-${Date.now()}`, holder, brand, ...(delivery?.ok ? { embossName: delivery.value.nameOnCard } : {}) }); }
    catch (e) { return bad(502, e instanceof Error ? e.message.slice(0, 160) : "The card could not be issued"); }
    const physical = form === "physical";
    const r = await db.query(`INSERT INTO token_issued_cards (user_id, currency, provider, provider_card_id, brand, last4, expiry, status, form, activated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [userId, currency, deps.issuer.name, card.providerCardId, card.brand, card.last4, card.expiry, physical || card.status === "active" ? "active" : "frozen", form, physical ? null : clock()]);
    if (physical && delivery?.ok) {
      const d = delivery.value;
      try {
        await db.query(`INSERT INTO token_card_orders (card_id, user_id, name_on_card, address_line1, address_line2, city, province, postal_code, country, phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [r.rows[0].id, userId, d.nameOnCard, d.addressLine1, d.addressLine2, d.city, d.province, d.postalCode, d.country, d.phone]);
      } catch (e) {
        await db.query(`UPDATE token_issued_cards SET status = 'blocked' WHERE id = $1`, [r.rows[0].id]);                      // no order, no card: never leave a card nobody is sending
        try { await deps.issuer.setCardStatus(card.providerCardId, "blocked"); } catch { /* the processor is told again when staff look */ }
        throw e;
      }
    }
    return { ok: true, value: cardView(r.rows[0], physical ? "ordered" : undefined) };
  }
  async function issuedCards(userId: string, currency?: string): Promise<IssuedCardView[]> {
    const rows = (await db.query(`SELECT c.*, o.status AS order_status FROM token_issued_cards c LEFT JOIN token_card_orders o ON o.card_id = c.id WHERE c.user_id = $1 ${currency ? "AND c.currency = $2" : ""} ORDER BY c.created_at DESC`, currency ? [userId, currency] : [userId])).rows;
    return rows.map((r) => cardView(r, r.order_status ? String(r.order_status) : undefined));
  }

  /** The holder has the physical card and confirms the last four digits printed on it. Wrong digits are counted; too many wrong tries lock it until staff reset it. */
  async function activateCard(userId: string, cardId: string, last4: unknown): Promise<TokenResult<IssuedCardView>> {
    const c = (await db.query(`SELECT * FROM token_issued_cards WHERE id = $1 AND user_id = $2`, [cardId, userId])).rows[0];
    if (!c) return bad(404, "No such card");
    if (c.form !== "physical") return bad(409, "A virtual card needs no activation");
    if (c.activated_at) return bad(409, "This card is already active");
    if (c.status === "blocked") return bad(409, "This card has been blocked");
    const o = (await db.query(`SELECT * FROM token_card_orders WHERE card_id = $1`, [cardId])).rows[0];
    if (!o) return bad(409, "This card has no delivery order");
    if (o.status === "ordered") return bad(409, "Your card has not been sent yet. You can activate it once it is on its way.");
    if (Number(o.attempts) >= MAX_ACTIVATION_TRIES) return bad(429, "Too many wrong tries. Contact VINK to unlock activation.", "activation_locked");
    if (typeof last4 !== "string" || !/^[0-9]{4}$/.test(last4.trim()) || last4.trim() !== String(c.last4)) {
      const n = Number((await db.query(`UPDATE token_card_orders SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`, [o.id])).rows[0].attempts);
      return bad(400, n >= MAX_ACTIVATION_TRIES ? "Too many wrong tries. Contact VINK to unlock activation." : `Those are not the last four digits on your card. ${MAX_ACTIVATION_TRIES - n} tries left.`, n >= MAX_ACTIVATION_TRIES ? "activation_locked" : undefined);
    }
    if (deps.issuer) { try { await deps.issuer.setCardStatus(String(c.provider_card_id), "active"); } catch (e) { return bad(502, "The card could not be switched on right now. Please try again."); } }
    const r = await db.query(`UPDATE token_issued_cards SET activated_at = $2 WHERE id = $1 RETURNING *`, [cardId, clock()]);
    await db.query(`UPDATE token_card_orders SET status = 'activated', activated_at = $2 WHERE id = $1`, [o.id, clock()]);
    return { ok: true, value: cardView(r.rows[0], "activated") };
  }

  /** Staff: the physical cards that are waiting to be dispatched or are on their way, with the delivery details. */
  async function cardOrders(status?: string): Promise<CardOrderView[]> {
    const want = status === "ordered" || status === "shipped" ? [status] : ["ordered", "shipped"];
    const rows = (await db.query(`SELECT o.*, c.brand, c.last4, u.name AS holder FROM token_card_orders o JOIN token_issued_cards c ON c.id = o.card_id JOIN users u ON u.id = o.user_id WHERE o.status = ANY($1) AND c.status <> 'blocked' ORDER BY o.created_at`, [want])).rows;
    return rows.map((r) => ({ id: String(r.id), cardId: String(r.card_id), userId: String(r.user_id), holder: String(r.holder), brand: String(r.brand), last4: String(r.last4), nameOnCard: String(r.name_on_card),
      address: [r.address_line1, r.address_line2, r.city, r.province, r.postal_code, r.country].filter(Boolean).join(", "), phone: String(r.phone), status: String(r.status), orderedAt: new Date(r.created_at).toISOString(), shippedAt: r.shipped_at ? new Date(r.shipped_at).toISOString() : null, attempts: Number(r.attempts) }));
  }
  async function shipCardOrder(orderId: string, by: string, note?: string): Promise<TokenResult<{ status: string }>> {
    const r = await db.query(`UPDATE token_card_orders SET status = 'shipped', shipped_by = $2, shipped_at = $3, ship_note = $4 WHERE id = $1 AND status = 'ordered' RETURNING id`, [orderId, by, clock(), note ? note.slice(0, 300) : null]);
    return r.rows.length ? { ok: true, value: { status: "shipped" } } : bad(409, "Only a card that is waiting to be sent can be marked as sent");
  }
  /** Staff unlock activation after the holder was locked out by wrong tries (they should first check who is asking). */
  async function resetActivation(orderId: string): Promise<TokenResult<{ status: string }>> {
    const r = await db.query(`UPDATE token_card_orders SET attempts = 0 WHERE id = $1 AND status = 'shipped' RETURNING id`, [orderId]);
    return r.rows.length ? { ok: true, value: { status: "unlocked" } } : bad(409, "Only a card that has been sent and not yet activated can be unlocked");
  }

  /** Freeze, unfreeze or permanently block the holder's own card. Our own record decides purchases (the processor asks us), so it takes effect at once. */
  async function setIssuedCardStatus(userId: string, cardId: string, status: unknown): Promise<TokenResult<IssuedCardView>> {
    if (status !== "frozen" && status !== "active" && status !== "blocked") return bad(400, "Choose freeze, unfreeze or block");
    const c = (await db.query(`SELECT * FROM token_issued_cards WHERE id = $1 AND user_id = $2`, [cardId, userId])).rows[0];
    if (!c) return bad(404, "No such card");
    if (c.status === "blocked") return bad(409, "A blocked card cannot be changed");
    if (deps.issuer) { try { await deps.issuer.setCardStatus(String(c.provider_card_id), status); } catch (e) { console.warn("[token] the card provider did not take the status change:", e instanceof Error ? e.message : e); } }
    const r = await db.query(`UPDATE token_issued_cards SET status = $2 WHERE id = $1 RETURNING *`, [cardId, status]);
    return { ok: true, value: cardView(r.rows[0]) };
  }

  const CHANNEL_LIMIT: Record<string, "pos" | "online" | "atm"> = { chip: "pos", tap: "pos", online: "online", international: "online", atm: "atm" };
  /**
   * The processor asks: may this card pay this amount? Returns null when the card is not one of ours (the caller then asks the older card engine). Otherwise the answer is
   * recorded under the processor's own authorisation id, so a retry gets the same answer and never spends twice. Approved: the tokens (and any ATM fee) leave the wallet at once
   * and wait in the card settlement account for the sponsor bank. Declined: nothing moves.
   */
  async function authoriseCardSpend(a: { provider: string; providerCardId: string; authorisationId: string; amountCents: number; currency?: string; channel?: string; merchant?: string }): Promise<CardDecision | null> {
    const card = (await db.query(`SELECT * FROM token_issued_cards WHERE provider = $1 AND provider_card_id = $2`, [a.provider, a.providerCardId])).rows[0];
    if (!card) return null;
    const prior = (await db.query(`SELECT status, reason FROM token_card_spend WHERE provider = $1 AND authorisation_id = $2`, [a.provider, a.authorisationId])).rows[0];
    if (prior) return { approved: prior.status !== "declined", reason: prior.reason ?? undefined, replayed: true };
    const cur = String(card.currency), user = String(card.user_id), channel = a.channel ?? "chip";
    const record = async (status: "approved" | "declined", reason: string | null, amount: number, fee: number) => {
      try { await db.query(`INSERT INTO token_card_spend (card_id, user_id, currency, provider, authorisation_id, amount_cents, fee_cents, channel, merchant, status, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [card.id, user, cur, a.provider, a.authorisationId, amount, fee, channel, a.merchant ?? null, status, reason]); }
      catch (e) { if (!isUniqueViolation(e)) throw e; }
    };
    const decline = async (reason: string): Promise<CardDecision> => { await record("declined", reason, Number.isInteger(a.amountCents) ? a.amountCents : 0, 0); return { approved: false, reason, replayed: false }; };
    if (!Number.isInteger(a.amountCents) || a.amountCents <= 0) return decline("bad_amount");
    if (card.status !== "active") return decline(card.status === "frozen" ? "card_frozen" : "card_not_active");
    if (card.form === "physical" && !card.activated_at) return decline("card_not_activated");
    const w = (await db.query(`SELECT status, kyc_tier FROM token_wallets WHERE user_id = $1 AND currency = $2`, [user, cur])).rows[0];
    if (!w || w.status !== "active") return decline("wallet_inactive");
    if ((a.currency ?? cur) !== cur) return decline("currency_not_supported");
    const cfg = (await reader.active(countryForCurrency(cur))).config;
    const limitChannel = CHANNEL_LIMIT[channel] ?? "pos";
    if (cfg.limits.enforce) {
      const used = Number((await db.query(`SELECT COALESCE(SUM(amount_cents),0) AS s FROM token_card_spend WHERE user_id = $1 AND currency = $2 AND status = 'approved' AND channel = ANY($3) AND created_at >= $4`,
        [user, cur, Object.keys(CHANNEL_LIMIT).filter((k) => CHANNEL_LIMIT[k] === limitChannel), new Date(clock().getTime() - 24 * 3600_000)])).rows[0].s);
      const v = checkTierLimit(cfg, w.kyc_tier as KycTier, { channel: limitChannel, amountCents: a.amountCents, usedTodayCents: used, balanceCents: 0 });
      if (!v.ok) return decline("limit_exceeded");
    }
    // a cash-machine withdrawal carries the bank's charge; shop purchases carry none for the cardholder (the 2.5% and 2.9% rules in the fee schedule are the merchant's)
    const fee = channel === "atm" ? computeFee(cfg.fees.rules, { txn: "atm", amountCents: a.amountCents, tier: w.kyc_tier as KycTier }).feeCents : 0;
    const lines = [line(cur, user, -(a.amountCents + fee), true), { account: cardSettlement(cur), kind: "system", amount: a.amountCents }, ...(fee > 0 ? [{ account: systemAccounts(cur).fees, kind: "system", amount: fee }] : [])];
    const r = ledger.post(`cardauth:${a.provider}:${a.authorisationId}`, "token_card_spend", lines, `Card purchase ${a.merchant ?? ""}`.trim());
    if (r === "insufficient") return decline("insufficient_funds");
    await record("approved", null, a.amountCents, fee);
    await event(user, cur, "card_spend", -(a.amountCents + fee), a.merchant ?? "Card purchase", `cardauth:${a.authorisationId}`);
    return { approved: true, replayed: false };
  }

  /**
   * The merchant refunded a purchase, or the processor reversed an authorisation. The purchase is found by the processor's authorisation id, or (when it only knows the
   * transaction thread) by the thread id the authorisation id starts with. A partial reversal returns just that amount and leaves the rest approved; a reversal for the
   * whole of what is left returns the ATM fee too. `reversalId` makes each reversal message count once, so a redelivered message returns nothing twice.
   */
  async function reverseCardSpend(a: { provider: string; authorisationId?: string; threadId?: string; amountCents?: number; reversalId?: string }): Promise<{ reversed: boolean; refundedCents: number } | null> {
    const sp = a.authorisationId
      ? (await db.query(`SELECT * FROM token_card_spend WHERE provider = $1 AND authorisation_id = $2`, [a.provider, a.authorisationId])).rows[0]
      : a.threadId ? (await db.query(`SELECT * FROM token_card_spend WHERE provider = $1 AND authorisation_id LIKE $2 AND status <> 'declined' ORDER BY created_at DESC LIMIT 1`, [a.provider, `${a.threadId.replace(/[%_]/g, "")}:%`])).rows[0] : null;
    if (!sp) return null;
    if (sp.status === "declined") return { reversed: false, refundedCents: 0 };
    const cur = String(sp.currency), amount = Number(sp.amount_cents), fee = Number(sp.fee_cents), done = Number(sp.reversed_cents);
    const left = amount - done;
    if (left <= 0) return { reversed: true, refundedCents: 0 };                                       // already fully returned: a repeat changes nothing
    const rid = a.reversalId ?? "full", ref = `cardrev:${a.provider}:${sp.authorisation_id}:${rid}`;
    const wanted = a.amountCents === undefined ? left : Math.min(Math.max(0, Math.floor(a.amountCents)), left);
    if (wanted <= 0) return { reversed: false, refundedCents: 0 };
    const completes = wanted === left, feeBack = completes ? fee : 0;
    const r = ledger.post(ref, "token_card_reversal", [{ account: cardSettlement(cur), kind: "system", amount: -wanted }, ...(feeBack > 0 ? [{ account: systemAccounts(cur).fees, kind: "system", amount: -feeBack }] : []), line(cur, String(sp.user_id), wanted + feeBack)], "Card purchase reversed");
    if (r === "duplicate") return { reversed: true, refundedCents: 0 };                              // this reversal message was already applied
    await db.query(`UPDATE token_card_spend SET reversed_cents = reversed_cents + $2, status = CASE WHEN reversed_cents + $2 >= amount_cents THEN 'reversed' ELSE status END WHERE id = $1`, [sp.id, wanted]);
    await event(String(sp.user_id), cur, "card_refund", wanted + feeBack, sp.merchant ?? "Card refund", `cardrev:${sp.authorisation_id}:${rid}`);
    return { reversed: true, refundedCents: wanted + feeBack };
  }

  /** Is this one of our token cards, and is it live? Used for zero-amount checks. null = not our card. */
  async function cardIsActive(provider: string, providerCardId: string): Promise<boolean | null> {
    const c = (await db.query(`SELECT c.status AS card_status, c.form, c.activated_at, w.status AS wallet_status FROM token_issued_cards c JOIN token_wallets w ON w.user_id = c.user_id AND w.currency = c.currency WHERE c.provider = $1 AND c.provider_card_id = $2`, [provider, providerCardId])).rows[0];
    return c ? c.card_status === "active" && c.wallet_status === "active" && (c.form !== "physical" || !!c.activated_at) : null;
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
    const open = (await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS s FROM token_cashouts WHERE currency = $1 AND status IN ('requested','processing')`, [currency])).rows[0];
    return { currency, wallets: rows.length, circulationCents: circulation, byRole, clearingCents: ledger.balance(systemAccounts(currency).clearing), pendingCashouts: { count: Number(open.n), cents: Number(open.s) }, holdingCents: ledger.balance(cashoutHold(currency)), cardSettlementCents: ledger.balance(cardSettlement(currency)) };
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

  return { bindEngine(e: Pick<Engine, "settleTaps">) { engine = e; }, partyOf, setTier, wallet, openWallet, linkCard, cards, blockCard, tapToken, transfer, redeemToBank, requestCashOut, decideCashOut, retryCashOut, processPayouts, attemptPayout, issueCard, issuedCards, activateCard, cardOrders, shipCardOrder, resetActivation, cardOptions, setIssuedCardStatus, authoriseCardSpend, reverseCardSpend, cardIsActive, addPayoutCard, startCardSession, addPayoutCardFromSession, cardEntry: () => ({ hosted: !!deps.hosted, raw: deps.acceptRawCardNumbers !== false }), payoutsEnabled: () => deps.externalPayouts !== false, payoutCards, removePayoutCard, reviewPayoutCard, cardsToReview, activity, summary, settings, setDeviceFee, routes, upsertRoute };
}
export type TokenService = ReturnType<typeof createTokenService>;
