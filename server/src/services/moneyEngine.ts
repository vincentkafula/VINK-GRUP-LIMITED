import type { Db } from "../portal/driverRoutes.js";
import { saDay } from "../portal/common.js";
import { isUniqueViolation } from "../portal/common.js";
import type { ConfigReader } from "../config/configService.js";
import { countryForCurrency, type CountryConfig } from "../config/countryConfig.js";

/**
 * The money engine: turns confirmed taps into balances, taps into trips, trips into the marshal fee, and driver-owner agreements into
 * transfers. Every movement is an integer number of minor units, posted to the Banking module (VINK) ledger under a reference that makes it
 * happen EXACTLY ONCE, however many times a cycle is re-run or a request is retried.
 *
 *   tap (confirmed)  ->  settlement   fare leaves the clearing account: the platform keeps its fee, the investor gets a share of that fee,
 *                                      and the rest goes to the owner side, or to the driver when they pay the owner by cash basis.
 *   16 confirmed taps -> one trip      (carry over: a partial trip waits for its remaining taps)
 *   trip             ->  marshal fee   the DRIVER pays the marshal who logged the departure (or the association when none was logged).
 *                                      per-trip agreements also create the owner's per-trip pay to the driver.
 *   agreement        ->  schedule      weekly (cash basis, driver pays owner) or monthly (salary, owner pays driver), pro-rata for a part period.
 *
 * A payer's account never goes below zero: an item that cannot be paid waits (marshal fee, per-trip pay) or is paid as far as the balance
 * allows and the rest stays as arrears (weekly and monthly amounts). A later cycle pays it.
 */

/* ───────────────────────── the ledger, as the engine sees it ───────────────────────── */
export interface Line { account: string; merchant?: string; amount: number; floor?: number; kind?: string }
export type PostResult = "posted" | "duplicate" | "insufficient";
export interface LedgerPort {
  /** Posts a balanced journal once. A second call with the same ref does nothing and answers "duplicate". */
  post(ref: string, kind: string, lines: Line[], memo: string): PostResult;
  /** The amount a previously posted journal moved on one account (positive = credited), or null if there is no such journal. */
  moved(ref: string, account: string): number | null;
  balance(account: string): number;
}
export const SYS_CLEARING = "sys:clearing", SYS_FEES = "sys:fees";
export const bankLedgerAccount = (manshyaAccountId: string) => `bank:${manshyaAccountId}`;
/**
 * Currencies never mix. Rand lives in the users' Banking accounts and the normal system accounts. Any other currency (kwacha) has its OWN ledger accounts:
 * a wallet per user and its own clearing and fee accounts. Every journal touches one currency only, so each currency balances on its own.
 */
export const walletLedgerAccount = (currency: string, userId: string) => `wallet:${currency}:${userId}`;
export const systemAccounts = (currency: string) => (currency === "ZAR" ? { clearing: SYS_CLEARING, fees: SYS_FEES, externalIn: "sys:external_in" } : { clearing: `sys:${currency.toLowerCase()}:clearing`, fees: `sys:${currency.toLowerCase()}:fees`, externalIn: `sys:${currency.toLowerCase()}:external_in` });

interface ManshyaLedgerHandle {
  db: { transaction<T>(fn: () => T): { immediate(): T }; prepare(sql: string): { get(...a: unknown[]): unknown } };
  ledger: { post(kind: string, lines: Line[], o: { ref?: string; memo?: string }): string; balance(account: string): number };
}
export const MONEY_KIND = "vink_money";

/** Adapter over the real VINK core. Idempotency is the journal reference, checked in the same transaction as the posting. */
export function manshyaLedgerPort(mn: ManshyaLedgerHandle): LedgerPort {
  const exists = mn.db.prepare("SELECT 1 AS x FROM journals WHERE kind = ? AND ref = ?");
  const movedStmt = mn.db.prepare("SELECT COALESCE(SUM(e.amount), 0) AS s FROM entries e JOIN journals j ON j.id = e.journal_id WHERE j.kind = ? AND j.ref = ? AND e.account_id = ?");
  return {
    post(ref, kind, lines, memo) {
      return mn.db.transaction((): PostResult => {
        if (exists.get(MONEY_KIND, ref)) return "duplicate";
        try { mn.ledger.post(MONEY_KIND, lines, { ref, memo: `${kind}: ${memo}` }); return "posted"; }
        catch (e) { if ((e as { code?: string }).code === "insufficient_funds") return "insufficient"; throw e; }
      }).immediate();
    },
    moved(ref, account) { return exists.get(MONEY_KIND, ref) ? Number((movedStmt.get(MONEY_KIND, ref, account) as { s: number }).s) : null; },
    balance(account) { return mn.ledger.balance(account); },
  };
}

/* ───────────────────────── helpers ───────────────────────── */
/** Query results are loosely typed here: every column used below is read through an explicit conversion. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }> };
const dayOf = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
interface Party { userId: string; account: string }
export type ItemKind = "marshal_fee" | "per_trip_pay" | "weekly_cash_payment" | "monthly_salary";
export interface Agreement { id: string; owner_id: string; driver_id: string; mode: "cash_basis_weekly" | "monthly_salary" | "per_trip_amount"; amount_cents: number; currency: string; pay_day: number | null; start_date: string; end_date: string | null }

export interface Engine {
  settleTaps(limit?: number): Promise<{ settled: number; blocked: number }>;
  closeTrips(): Promise<{ trips: number }>;
  runSchedules(now?: Date): Promise<{ created: number }>;
  processItems(now?: Date, limit?: number): Promise<{ paid: number; waiting: number; arrears: number }>;
  runCycle(now?: Date): Promise<Record<string, number>>;
  /** The linked, verified account of a user, or null. */
  partyOf(userId: string | null | undefined, currency?: string): Promise<Party | null>;
}

export function createMoneyEngine(deps: { db: Db; ledger: LedgerPort; reader: ConfigReader; now?: () => Date }): Engine {
  const { ledger, reader } = deps;
  const db = deps.db as unknown as Loose;
  const clock = deps.now ?? (() => new Date());

  async function partyOf(userId: string | null | undefined, currency = "ZAR"): Promise<Party | null> {
    if (!userId) return null;
    const r = (await db.query(`SELECT manshya_account_id FROM bank_account_links WHERE user_id = $1 AND status = 'verified'`, [userId])).rows[0];
    if (!r) return null;                                                          // a verified linked account is the proof of identity for every currency
    return { userId, account: currency === "ZAR" ? bankLedgerAccount(r.manshya_account_id) : walletLedgerAccount(currency, userId) };
  }
  const cfgFor = async (currency: string): Promise<CountryConfig> => (await reader.active(countryForCurrency(currency))).config;

  async function activeAgreement(ownerId: string | null, driverId: string | null, on: string): Promise<Agreement | null> {
    if (!ownerId || !driverId) return null;
    const r = (await db.query(`SELECT * FROM driver_agreements WHERE owner_id = $1 AND driver_id = $2 AND status = 'active' AND start_date <= $3 AND (end_date IS NULL OR end_date >= $3)`, [ownerId, driverId, on])).rows[0];
    return r ? { ...r, id: r.id, owner_id: r.owner_id, driver_id: r.driver_id, mode: r.mode, currency: r.currency, pay_day: r.pay_day, amount_cents: Number(r.amount_cents), start_date: dayOf(r.start_date), end_date: r.end_date ? dayOf(r.end_date) : null } : null;
  }

  /* ── 1. settle confirmed taps ── */
  async function settleTaps(limit = 200) {
    const taps = (await db.query(
      `SELECT t.id, t.amount, t.currency, t.vink_fee_device, t.vink_fee_card, t.investor_share, t.owner_settlement, t.received_at,
              m.owner_id, m.driver_id, m.investor_id
         FROM terminal_taps t JOIN terminals m ON m.id = t.terminal_id
        WHERE t.status = 'confirmed' AND t.settled_at IS NULL ORDER BY t.received_at, t.id LIMIT $1`, [limit])).rows;
    let settled = 0, blocked = 0;
    for (const t of taps) {
      const fare = cents(t.amount), fee = cents(t.vink_fee_device) + cents(t.vink_fee_card), remainder = fare - fee;
      let investorCut = Math.min(cents(t.investor_share), fee);
      const on = saDay(new Date(t.received_at));
      const agr = await activeAgreement(t.owner_id, t.driver_id, on);
      // who keeps the remainder: the driver on cash basis (they pay the owner weekly); otherwise the owner (salary and per-trip agreements, or none); the driver when there is no owner
      const destUser = agr?.mode === "cash_basis_weekly" ? t.driver_id : (t.owner_id ?? t.driver_id);
      const cur = String(t.currency ?? "ZAR"), sys = systemAccounts(cur);
      const dest = await partyOf(destUser, cur);
      const investor = investorCut > 0 ? await partyOf(t.investor_id, cur) : null;
      const why = !destUser ? "the terminal has no owner or driver" : !dest ? "the recipient has no verified linked account" : (investorCut > 0 && t.investor_id && !investor) ? "the investor has no verified linked account" : null;
      if (why) {
        await db.query(`INSERT INTO tap_settlements (tap_id, status, reason, destination) VALUES ($1,'blocked',$2,$3)
                        ON CONFLICT (tap_id) DO UPDATE SET status = 'blocked', reason = EXCLUDED.reason, destination = EXCLUDED.destination, updated_at = now()`, [t.id, why, destUser ?? null]);
        blocked++; continue;
      }
      if (!investor) investorCut = 0;                                    // no investor on the terminal: the platform keeps that part of its fee
      const lines: Line[] = [{ account: sys.clearing, kind: "system", amount: -fare }, { account: sys.fees, kind: "system", amount: fee - investorCut }];
      if (investor) lines.push({ account: investor.account, merchant: investor.userId, kind: "bank", amount: investorCut });
      if (remainder > 0) lines.push({ account: dest!.account, merchant: dest!.userId, kind: "bank", amount: remainder });
      const live = lines.filter((l) => l.amount !== 0);
      const res = ledger.post(`tap:${t.id}`, "tap_settlement", live, `Fare ${t.id}`);
      if (res === "insufficient") { blocked++; continue; }
      await db.query(`INSERT INTO tap_settlements (tap_id, status, destination, settled_at) VALUES ($1,'settled',$2,now())
                      ON CONFLICT (tap_id) DO UPDATE SET status = 'settled', reason = NULL, destination = EXCLUDED.destination, updated_at = now(), settled_at = now()`, [t.id, destUser]);
      await db.query(`UPDATE terminal_taps SET settled_at = now() WHERE id = $1`, [t.id]);
      settled++;
    }
    return { settled, blocked };
  }

  /* ── 2. taps -> trips -> marshal fee / per-trip pay ── */
  async function closeTrips() {
    const terms = (await db.query(
      `SELECT DISTINCT t.terminal_id FROM terminal_taps t WHERE t.status = 'confirmed' AND t.trip_id IS NULL`)).rows;
    let made = 0;
    for (const { terminal_id } of terms) {
      const term = (await db.query(`SELECT id, vehicle_id, driver_id, owner_id, association_id FROM terminals WHERE id = $1`, [terminal_id])).rows[0];
      if (!term) continue;
      const taps = (await db.query(`SELECT id, amount, currency, received_at FROM terminal_taps WHERE terminal_id = $1 AND status = 'confirmed' AND trip_id IS NULL ORDER BY received_at, id`, [terminal_id])).rows;
      if (!taps.length) continue;
      const cfg = await cfgFor(taps[0].currency);
      const per = cfg.trip.tapsPerTrip;
      for (let i = 0; i + per <= taps.length; i += per) {
        const group = taps.slice(i, i + per);
        const next = Number((await db.query(`SELECT COALESCE(MAX(trip_no), 0) + 1 AS n FROM trips WHERE terminal_id = $1`, [terminal_id])).rows[0].n);
        const first = new Date(group[0].received_at), last = new Date(group[per - 1].received_at);
        const fare = group.reduce((s, g) => s + cents(g.amount), 0);
        // the departure the marshal logged for this vehicle around this trip, not yet used by another trip
        const used = new Set((await db.query(`SELECT departure_id FROM trips WHERE vehicle_id = $1 AND departure_id IS NOT NULL`, [term.vehicle_id])).rows.map((r) => String(r.departure_id)));
        const dep = term.vehicle_id ? (await db.query(
          `SELECT id, marshal_id FROM departures WHERE vehicle_id = $1 AND departed_at >= $2 AND departed_at <= $3 ORDER BY departed_at`,
          [term.vehicle_id, new Date(first.getTime() - 3600_000), new Date(last.getTime() + 3600_000)])).rows.find((d) => !used.has(String(d.id))) ?? null : null;
        let tripId: string;
        try {
          const ins = await db.query(
            `INSERT INTO trips (terminal_id, trip_no, vehicle_id, driver_id, owner_id, marshal_id, departure_id, taps, fare_cents, currency, first_tap_at, completed_at, needs_review)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            [terminal_id, next, term.vehicle_id, term.driver_id, term.owner_id, dep?.marshal_id ?? null, dep?.id ?? null, per, fare, group[0].currency, first, last, dep ? null : "no_marshal_logged"]);
          tripId = ins.rows[0].id;
        } catch (e) { if (isUniqueViolation(e)) break; throw e; }          // another run took this trip number: the next cycle carries on
        for (const g of group) await db.query(`UPDATE terminal_taps SET trip_id = $1 WHERE id = $2 AND trip_id IS NULL`, [tripId, g.id]);
        made++;
        await createTripItems(tripId, { ...term, marshal_id: dep?.marshal_id ?? null }, group[0].currency, last, cfg);
      }
    }
    return { trips: made };
  }

  async function createTripItems(tripId: string, t: { driver_id: string | null; owner_id: string | null; association_id: string | null; marshal_id: string | null }, currency: string, at: Date, cfg: CountryConfig) {
    const fee = cfg.marshalFee;
    const set = t.association_id ? (await db.query(`SELECT marshal_fee_cents FROM association_settings WHERE association_id = $1`, [t.association_id])).rows[0] : null;
    const amount = set?.marshal_fee_cents != null ? Number(set.marshal_fee_cents) : fee.amountCents;
    const payer = t.driver_id ?? t.owner_id;                           // the driver pays; with no driver on the terminal the owner does
    const payee = t.marshal_id ?? (fee.noMarshalLogged === "accrue_to_association" ? t.association_id : null);
    if (amount > 0 && payer && payee) {
      await db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, currency, ref, trip_id, note, status)
                      VALUES ('marshal_fee',$1,$2,$3,$3,$4,$5,$6,$7,'pending') ON CONFLICT (ref) DO NOTHING`,
        [payer, payee, amount, currency, `marshal:${tripId}`, tripId, t.marshal_id ? "Marshal fee for a completed trip" : "Marshal fee (no marshal logged): held for the association"]);
    } else if (amount > 0) {
      await db.query(`UPDATE trips SET needs_review = COALESCE(needs_review, 'marshal_fee_not_assigned') WHERE id = $1`, [tripId]);
    }
    const agr = await activeAgreement(t.owner_id, t.driver_id, saDay(at));
    if (agr?.mode === "per_trip_amount") {
      await db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, currency, ref, trip_id, agreement_id, note, status)
                      VALUES ('per_trip_pay',$1,$2,$3,$3,$4,$5,$6,$7,'Per-trip pay for a completed trip','pending') ON CONFLICT (ref) DO NOTHING`,
        [agr.owner_id, agr.driver_id, agr.amount_cents, agr.currency, `trippay:${tripId}`, tripId, agr.id]);
    }
  }

  /* ── 3. weekly / monthly agreement schedules ── */
  const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
  const dow = (day: string) => ((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;           // Monday = 1 ... Sunday = 7
  const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  async function runSchedules(now: Date = clock()) {
    const today = saDay(now);
    const agrs = (await db.query(`SELECT * FROM driver_agreements WHERE status = 'active' AND mode IN ('cash_basis_weekly','monthly_salary') AND start_date <= $1`, [today])).rows;
    let created = 0;
    for (const a of agrs) {
      const accepted = a.accepted_at ? saDay(new Date(a.accepted_at)) : null;
      const start = accepted && accepted > dayOf(a.start_date) ? accepted : dayOf(a.start_date), end = a.end_date ? dayOf(a.end_date) : null, amount = Number(a.amount_cents);
      const due: { day: string; cents: number }[] = [];
      if (a.mode === "cash_basis_weekly") {
        const payDay = a.pay_day ?? 5;
        for (let d = addDays(today, -35); d <= today; d = addDays(d, 1)) {            // up to five weeks back, so a missed cycle is caught up
          if (dow(d) !== payDay || d < start || (end && d > end)) continue;
          const periodStart = addDays(d, -6);
          const activeDays = periodStart >= start ? 7 : Math.max(1, Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86_400_000) + 1);
          due.push({ day: d, cents: activeDays >= 7 ? amount : Math.round(amount * activeDays / 7) });
        }
      } else {
        const payDay = Math.min(a.pay_day ?? 25, 28);
        for (let k = 0; k < 3; k++) {                                                    // this month and the two before
          const base = new Date(Date.parse(today + "T00:00:00Z")); base.setUTCDate(1); base.setUTCMonth(base.getUTCMonth() - k);
          const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), payDay)).toISOString().slice(0, 10);
          if (d > today || d < start || (end && d > end)) continue;
          const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, dim = daysInMonth(y, m);
          const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
          const activeDays = monthStart >= start ? dim : Math.max(1, dim - Number(start.slice(8, 10)) + 1);
          due.push({ day: d, cents: activeDays >= dim || start.slice(0, 7) !== monthStart.slice(0, 7) ? amount : Math.round(amount * activeDays / dim) });
        }
      }
      for (const p of due) {
        if (p.cents <= 0) continue;
        const weekly = a.mode === "cash_basis_weekly";
        if ((await db.query(`SELECT 1 AS x FROM payment_items WHERE ref = $1`, [`${weekly ? "weekly" : "salary"}:${a.id}:${p.day}`])).rows.length) continue;
        const r = await db.query(`INSERT INTO payment_items (kind, payer_id, payee_id, amount_cents, remaining_cents, currency, ref, agreement_id, due_at, note, status)
                                  VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,'pending') ON CONFLICT (ref) DO NOTHING RETURNING id`,
          [weekly ? "weekly_cash_payment" : "monthly_salary", weekly ? a.driver_id : a.owner_id, weekly ? a.owner_id : a.driver_id, p.cents, a.currency,
           `${weekly ? "weekly" : "salary"}:${a.id}:${p.day}`, a.id, new Date(Date.parse(p.day + "T00:00:00Z") - 2 * 3600_000), weekly ? `Weekly cash-basis payment for the week ending ${p.day}` : `Monthly salary for ${p.day.slice(0, 7)}`]);
        created += r.rows.length;
      }
    }
    return { created };
  }

  /* ── 4. pay what is due ── */
  async function processItems(now: Date = clock(), limit = 200) {
    const items = (await db.query(
      `SELECT * FROM payment_items WHERE status IN ('pending','waiting','arrears') AND next_attempt_at <= $1 AND due_at <= $1 ORDER BY due_at, created_at LIMIT $2`, [now, limit])).rows;
    let paid = 0, waiting = 0, arrears = 0;
    for (const it of items) {
      const cfg = await cfgFor(it.currency);
      const steps = cfg.payouts.retryMinutes, retry = new Date(now.getTime() + steps[Math.min(Number(it.attempts), steps.length - 1)] * 60_000);      // back-off: 1, 5, 30, 120 minutes, then every 120
      const payer = await partyOf(it.payer_id, it.currency), payee = await partyOf(it.payee_id, it.currency);
      const wait = async (status: "waiting" | "arrears", msg: string) => {
        await db.query(`UPDATE payment_items SET status = $2, last_error = $3, attempts = attempts + 1, next_attempt_at = $4 WHERE id = $1 AND status IN ('pending','waiting','arrears')`, [it.id, status, msg, retry]);
        status === "waiting" ? waiting++ : arrears++;
      };
      if (!payer || !payee) { await wait("waiting", !payer ? "The payer has no verified linked account" : "The recipient has no verified linked account"); continue; }
      const remaining = Number(it.remaining_cents), balance = ledger.balance(payer.account);
      const partial = it.kind === "weekly_cash_payment" || it.kind === "monthly_salary";
      const pay = partial ? Math.min(remaining, Math.max(balance, 0)) : remaining;
      if (pay <= 0 || (!partial && balance < pay)) { await wait(partial ? "arrears" : "waiting", "Not enough money in the payer's account yet"); continue; }
      const ref = `item:${it.id}:${remaining}`;                                          // unique per remaining amount, so a retried partial payment cannot post twice
      const res = ledger.post(ref, it.kind, [
        { account: payer.account, merchant: payer.userId, kind: "bank", amount: -pay, floor: 0 },
        { account: payee.account, merchant: payee.userId, kind: "bank", amount: pay },
      ], String(it.note ?? it.kind));
      let moved = pay;
      if (res === "duplicate") moved = ledger.moved(ref, payee.account) ?? pay;          // posted earlier, then the database update was lost: take what was really moved
      if (res === "insufficient") { await wait(partial ? "arrears" : "waiting", "Not enough money in the payer's account yet"); continue; }
      const left = remaining - moved;
      if (left <= 0) { await db.query(`UPDATE payment_items SET status = 'paid', remaining_cents = 0, paid_at = now(), last_error = NULL, attempts = attempts + 1 WHERE id = $1`, [it.id]); paid++; }
      else { await db.query(`UPDATE payment_items SET status = 'arrears', remaining_cents = $2, last_error = 'Part paid; the rest is owed', attempts = attempts + 1, next_attempt_at = $3 WHERE id = $1`, [it.id, left, retry]); arrears++; }
    }
    return { paid, waiting, arrears };
  }

  async function runCycle(at?: Date) {
    const now = at ?? clock();
    const s = await settleTaps(), t = await closeTrips(), sc = await runSchedules(now), p = await processItems(at ?? clock());      // items created a moment ago by this very cycle are due too
    return { settled: s.settled, blocked: s.blocked, trips: t.trips, scheduled: sc.created, paid: p.paid, waiting: p.waiting, arrears: p.arrears };
  }
  return { settleTaps, closeTrips, runSchedules, processItems, runCycle, partyOf };
}
