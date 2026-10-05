import type { Db } from "../portal/driverRoutes.js";
import type { ConfigReader } from "../config/configService.js";
import { COUNTRIES, type CountryCode, type KycTier } from "../config/countryConfig.js";
import { checkTierLimit, quoteCorridor } from "../config/riskRules.js";
import type { Engine, LedgerPort } from "./moneyEngine.js";
import { systemAccounts } from "./moneyEngine.js";
import { AUTO_FETCHED_MAX_AGE_MS, AUTO_SOURCE_MAX_AGE_MS, MANUAL_MAX_AGE_MS } from "./fxRates.js";

/**
 * Sending money between South Africa and Zambia.
 *
 *   quote    prices the transfer from the corridor's settings and the exchange rate in use (fetched automatically, see fxRates.ts, or set by staff; a rate that is too old is refused),
 *            checks the corridor limits for this sender, and stores the quote. Nothing moves.
 *   confirm  within the quote's short life, posts the transfer as TWO journals, one per currency, each with a fixed reference:
 *              source currency:       sender  -send   |  platform fees  +fee   |  cross-border position  +(send - fee)
 *              destination currency:  cross-border position  -receive  |  recipient  +receive
 *            The cross-border position accounts hold the platform's exposure until it is settled with the partner bank. If anything fails between the two
 *            journals the transfer stays "posting"; confirming again finishes it (the references make every step happen once) and reconciliation flags it.
 *
 * A corridor is closed until a profile opens it. A sender can only confirm their own quote, and only once.
 */
const CURRENCY: Record<CountryCode, string> = { ZA: "ZAR", ZM: "ZMW" };
const xbAccount = (currency: string) => `sys:${currency.toLowerCase()}:cross_border`;
export const fxPairKey = (from: string, to: string) => `${from}-${to}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }> };
export type XbResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const bad = (status: number, error: string): XbResult<never> => ({ ok: false, status, error });

export interface QuoteView { rateSource: string | null; id: string; corridor: string; sendCents: number; sendCurrency: string; feeCents: number; rate: number; receiveCents: number; receiveCurrency: string; recipient: string; expiresAt: string; status: string }

export function createCrossBorder(deps: { db: Db; ledger: LedgerPort; engine: Pick<Engine, "partyOf">; reader: ConfigReader; now?: () => Date }) {
  const db = deps.db as unknown as Loose, { ledger, engine, reader } = deps;
  const clock = deps.now ?? (() => new Date());
  const view = (r: Record<string, any>, recipient: string): QuoteView => ({   // eslint-disable-line @typescript-eslint/no-explicit-any
    rateSource: r.rate_source ?? null, id: r.id, corridor: r.corridor, sendCents: Number(r.send_cents), sendCurrency: r.send_currency, feeCents: Number(r.fee_cents), rate: Number(r.rate), receiveCents: Number(r.receive_cents),
    receiveCurrency: r.receive_currency, recipient, expiresAt: new Date(r.quote_expires_at).toISOString(), status: r.status,
  });

  async function setRate(from: string, to: string, rate: number, by: string | null): Promise<XbResult<null>> {
    if (!(rate > 0) || !Number.isFinite(rate) || rate > 1e6) return bad(400, "The rate must be a number above zero");
    if (!["ZAR", "ZMW"].includes(from) || !["ZAR", "ZMW"].includes(to) || from === to) return bad(400, "Use ZAR and ZMW");
    const at = clock();
    await db.query(`INSERT INTO fx_rates (pair, rate, set_by, set_at, source, source_at, auto) VALUES ($1,$2,$3,$4,'manual',$4,false)
                    ON CONFLICT (pair) DO UPDATE SET rate = EXCLUDED.rate, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at, source = 'manual', source_at = EXCLUDED.set_at, auto = false`, [fxPairKey(from, to), rate, by, at]);
    return { ok: true, value: null };
  }

  /** Which corridors are open, for the screen: nothing is shown to users when none is. */
  async function openCorridors(): Promise<{ id: string; from: CountryCode; to: CountryCode; fromCurrency: string; toCurrency: string }[]> {
    const out = [];
    for (const c of COUNTRIES) for (const k of (await reader.active(c)).config.corridors) if (k.enabled) out.push({ id: k.id, from: k.from, to: k.to, fromCurrency: CURRENCY[k.from], toCurrency: CURRENCY[k.to] });
    return out;
  }

  async function usage(senderId: string, corridor: string, now: Date) {
    const sum = async (since: Date) => Number((await db.query(`SELECT COALESCE(SUM(send_cents),0) AS s FROM cross_border_transfers WHERE sender_id = $1 AND corridor = $2 AND status IN ('completed','posting') AND created_at >= $3`, [senderId, corridor, since])).rows[0].s);
    return { day: await sum(new Date(now.getTime() - 24 * 3600_000)), month: await sum(new Date(now.getTime() - 30 * 24 * 3600_000)) };
  }

  async function quote(senderId: string, q: { recipientEmail: string; amountCents: number; corridorId: string }): Promise<XbResult<QuoteView>> {
    const now = clock();
    const corridorOwner = COUNTRIES.find((c) => q.corridorId.startsWith(c + "-"));
    if (!corridorOwner) return bad(400, "Choose a route");
    const cfg = (await reader.active(corridorOwner)).config, k = cfg.corridors.find((x) => x.id === q.corridorId);
    if (!k || !k.enabled) return bad(409, "This route is not open.");
    const from = CURRENCY[k.from], to = CURRENCY[k.to];
    const recipient = (await db.query(`SELECT id, name FROM users WHERE lower(email) = $1 LIMIT 1`, [q.recipientEmail.trim().toLowerCase()])).rows[0];
    if (!recipient) return bad(404, "We could not find an account with that email.");
    if (recipient.id === senderId) return bad(400, "Choose someone else as the recipient.");
    if (!(await engine.partyOf(senderId, from))) return bad(409, "Link a bank account first. Transfers are paid from your verified account.");
    if (!(await engine.partyOf(recipient.id, to))) return bad(409, "The recipient has no verified account to receive money yet.");
    const rate = (await db.query(`SELECT rate, set_at, source, source_at, auto FROM fx_rates WHERE pair = $1`, [fxPairKey(from, to)])).rows[0];
    const fresh = rate && (rate.auto
      ? now.getTime() - new Date(rate.set_at).getTime() <= AUTO_FETCHED_MAX_AGE_MS && rate.source_at && now.getTime() - new Date(rate.source_at).getTime() <= AUTO_SOURCE_MAX_AGE_MS
      : now.getTime() - new Date(rate.set_at).getTime() <= MANUAL_MAX_AGE_MS);
    if (!fresh) return bad(503, "There is no current exchange rate. Please try again shortly.");
    const used = await usage(senderId, k.id, now);
    const v = quoteCorridor(cfg, { corridorId: k.id, amountCents: q.amountCents, midRate: Number(rate.rate), usedDayCents: used.day, usedMonthCents: used.month, now });
    if (!v.ok) return bad(v.code === "bad_amount" ? 400 : 409, v.message);
    const row = (await db.query(
      `INSERT INTO cross_border_transfers (sender_id, recipient_id, corridor, send_cents, send_currency, fee_cents, rate, receive_cents, receive_currency, rate_source, quote_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [senderId, recipient.id, k.id, v.sendCents, from, v.feeCents, v.offeredRate, v.receiveCents, to, rate.source, new Date(v.expiresAt)])).rows[0];
    return { ok: true, value: view(row, recipient.name) };
  }

  async function confirm(senderId: string, id: string): Promise<XbResult<QuoteView>> {
    const now = clock();
    const t = (await db.query(`SELECT * FROM cross_border_transfers WHERE id = $1 AND sender_id = $2`, [id, senderId])).rows[0];
    if (!t) return bad(404, "Quote not found");
    const recipient = (await db.query(`SELECT name FROM users WHERE id = $1`, [t.recipient_id])).rows[0];
    if (t.status === "completed") return { ok: true, value: view(t, recipient?.name ?? "") };           // confirming twice changes nothing
    if (t.status !== "quoted" && t.status !== "posting") return bad(409, "This quote can no longer be used.");
    if (t.status === "quoted" && new Date(t.quote_expires_at).getTime() < now.getTime()) {
      await db.query(`UPDATE cross_border_transfers SET status = 'expired' WHERE id = $1 AND status = 'quoted'`, [id]);
      return bad(409, "The quote has expired. Please get a new one.");
    }
    const corridorOwner = COUNTRIES.find((c) => String(t.corridor).startsWith(c + "-"))!;
    const cfg = (await reader.active(corridorOwner)).config, k = cfg.corridors.find((x) => x.id === t.corridor);
    if (t.status === "quoted" && (!k || !k.enabled)) return bad(409, "This route is not open.");
    const from = String(t.send_currency), to = String(t.receive_currency);
    const sender = await engine.partyOf(senderId, from), rcpt = await engine.partyOf(t.recipient_id, to);
    if (!sender) return bad(409, "Your linked account is not verified.");
    if (!rcpt) return bad(409, "The recipient has no verified account to receive money yet.");
    const send = Number(t.send_cents), fee = Number(t.fee_cents), receive = Number(t.receive_cents);

    if (t.status === "quoted") {
      if (cfg.limits.enforce) {
        const used = await usage(senderId, t.corridor, now);
        const lim = checkTierLimit(cfg, "standard" as KycTier, { channel: "transfer_out", amountCents: send, usedTodayCents: used.day, balanceCents: 0 });
        if (!lim.ok) return bad(409, lim.message);
      }
      // from here the transfer is committed to being posted; "posting" lets a retry finish it
      const claimed = await db.query(`UPDATE cross_border_transfers SET status = 'posting' WHERE id = $1 AND status = 'quoted' RETURNING id`, [id]);
      if (!claimed.rows.length) return bad(409, "This quote is already being processed.");
    }
    const out = ledger.post(`xb:${id}:out`, "cross_border", [
      { account: sender.account, merchant: sender.userId, kind: "bank", amount: -send, floor: 0 },
      { account: systemAccounts(from).fees, kind: "system", amount: fee },
      { account: xbAccount(from), kind: "system", amount: send - fee },
    ].filter((l) => l.amount !== 0), `Cross-border ${t.corridor} ${id}`);
    if (out === "insufficient") { await db.query(`UPDATE cross_border_transfers SET status = 'failed', reason = 'Not enough money in the sender''s account' WHERE id = $1`, [id]); return bad(409, "You do not have enough money for this transfer."); }
    ledger.post(`xb:${id}:in`, "cross_border", [
      { account: xbAccount(to), kind: "system", amount: -receive },
      { account: rcpt.account, merchant: rcpt.userId, kind: "bank", amount: receive },
    ].filter((l) => l.amount !== 0), `Cross-border ${t.corridor} ${id}`);
    const done = (await db.query(`UPDATE cross_border_transfers SET status = 'completed', completed_at = now() WHERE id = $1 RETURNING *`, [id])).rows[0];
    return { ok: true, value: view(done, recipient?.name ?? "") };
  }

  async function history(userId: string): Promise<(QuoteView & { direction: "sent" | "received" })[]> {
    const rows = (await db.query(
      `SELECT x.*, s.name AS sender_name, r.name AS recipient_name FROM cross_border_transfers x JOIN users s ON s.id = x.sender_id JOIN users r ON r.id = x.recipient_id
        WHERE (x.sender_id = $1 OR x.recipient_id = $1) AND x.status IN ('completed','posting') ORDER BY x.created_at DESC LIMIT 25`, [userId])).rows;
    return rows.map((r) => ({ ...view(r, r.sender_id === userId ? r.recipient_name : r.sender_name), direction: r.sender_id === userId ? "sent" as const : "received" as const }));
  }

  return { setRate, openCorridors, quote, confirm, history };
}
export type CrossBorder = ReturnType<typeof createCrossBorder>;
