import { Router, json } from "express";
import { h, uid, num, iso, dateOnly, isUuid, validDate, fail, isUniqueViolation, audit, pageParams, type Db } from "./common.js";
import { ensureVirtualAccount, POOLS, POOL_LABEL, type Pool } from "../services/poolService.js";
import type { ChannelAccount } from "./bankLinks.js";
import type { CrossBorder } from "../services/crossBorderService.js";

/**
 * Driver-owner agreements, the marshal fee and the payments the rules create. Mounted at /api/portal/<role>/money for the four roles that use it.
 *
 *   owner        GET/POST /agreements, POST /agreements/:id/cancel      the owner proposes; nothing moves until the driver accepts
 *   driver       GET /agreements, POST /agreements/:id/accept|decline   accepting is the driver's consent to the automatic transfers
 *   all four     GET /payments, GET /trips                              only the caller's own items (as payer or payee)
 *   association  GET/PUT /settings                                      the marshal fee per completed trip (blank = the country default)
 *
 * Amounts are whole minor units (cents) on the wire as `...Cents`. Nobody can read another user's agreement, payment or trip: every query is keyed on the caller.
 */
export type MoneyRole = "vehicle_owner" | "driver" | "marshal" | "association";
export const AGREEMENT_CONSENT_VERSION = "2026-10-v1";
const MODES = ["cash_basis_weekly", "monthly_salary", "per_trip_amount"] as const;
type Mode = typeof MODES[number];
const MAX_CENTS = 100_000_000;                                                   // 1 000 000.00: a typing slip should not become a real obligation

const consentText = (a: { mode: Mode; amount_cents: number; currency: string; pay_day: number | null; start_date: string }) => {
  const money = `${a.currency} ${(a.amount_cents / 100).toFixed(2)}`;
  if (a.mode === "cash_basis_weekly") return `I agree to pay the owner ${money} each week (on day ${a.pay_day} of the week) from my in-person payments account, from ${a.start_date}. If my balance is short, the rest stays owed and is paid when funds are available.`;
  if (a.mode === "monthly_salary") return `I agree that the owner pays me a salary of ${money} each month (on day ${a.pay_day}), from ${a.start_date}.`;
  return `I agree that the owner pays me ${money} for every completed trip (16 taps), from ${a.start_date}.`;
};

const present = (r: Record<string, unknown>) => ({
  id: r.id, ownerId: r.owner_id, driverId: r.driver_id, ownerName: r.owner_name ?? null, driverName: r.driver_name ?? null, mode: r.mode,
  amountCents: num(r.amount_cents), currency: r.currency, payDay: r.pay_day ?? null, startDate: dateOnly(r.start_date), endDate: dateOnly(r.end_date),
  status: r.status, proposedBy: r.proposed_by, acceptedAt: iso(r.accepted_at), createdAt: iso(r.created_at), consentText: r.consent_text ?? null,
});

export interface MoneyDeps {
  /** The pooled bank accounts customers pay into (from PAYMENT_CHANNEL_ACCOUNTS). */
  channels?: () => Partial<Record<Pool, ChannelAccount>>;
  /** Balances in currencies other than rand (kwacha wallets). Rand is shown with the bank account. */
  wallets?: (userId: string) => { currency: string; balanceCents: number }[];
  /** Sending money between South Africa and Zambia. */
  crossBorder?: CrossBorder;
}

export function createMoneyRouter(db: Db, role: MoneyRole, deps: MoneyDeps = {}): Router {
  const router = Router();
  router.use(json({ limit: "20kb" }));

  /* virtual accounts: my payment reference for each currency and pool, and where to pay */
  router.get("/virtual-accounts", h(async (req, res) => {
    const rows = (await db.query(`SELECT currency, pool, reference, status FROM virtual_accounts WHERE user_id = $1 ORDER BY currency, pool`, [uid(req)])).rows;
    const channels = deps.channels?.() ?? {};
    res.json({ success: true, accounts: rows.map((r) => ({ currency: r.currency, pool: r.pool, poolLabel: POOL_LABEL[r.pool as Pool], reference: r.reference, status: r.status, payInto: channels[r.pool as Pool] ?? null })) });
  }));
  router.post("/virtual-accounts", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.currency !== "ZAR" && b.currency !== "ZMW") return fail(res, 400, "Choose rand (ZAR) or kwacha (ZMW)");
    if (!POOLS.includes(b.pool as Pool)) return fail(res, 400, "Choose In-Person or Online");
    const linked = (await db.query(`SELECT 1 AS x FROM bank_account_links WHERE user_id = $1 AND status = 'verified'`, [uid(req)])).rows.length;
    if (!linked) return fail(res, 409, "Link a bank account first. Payments are credited to your verified account.");
    const va = await ensureVirtualAccount(db, uid(req), b.currency as string, b.pool as Pool);
    await audit(db, req, "virtual_account.ensure", null, { currency: va.currency, pool: va.pool });
    res.status(201).json({ success: true, reference: va.reference });
  }));
  /* cross-border: quote, then confirm within the quote's short life */
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
    await audit(db, req, "cross_border.confirm", req.params.id as string, { corridor: r.value.corridor, sendCents: r.value.sendCents, sendCurrency: r.value.sendCurrency });
    res.json({ success: true, transfer: r.value });
  }));
  router.get("/wallet", h(async (req, res) => { res.json({ success: true, wallets: deps.wallets?.(uid(req)) ?? [] }); }));

  /* agreements */
  if (role === "vehicle_owner" || role === "driver") {
    const mine = role === "vehicle_owner" ? "a.owner_id" : "a.driver_id";
    router.get("/agreements", h(async (req, res) => {
      const rows = (await db.query(`SELECT a.*, o.name AS owner_name, d.name AS driver_name FROM driver_agreements a JOIN users o ON o.id = a.owner_id JOIN users d ON d.id = a.driver_id WHERE ${mine} = $1 ORDER BY a.created_at DESC LIMIT 100`, [uid(req)])).rows;
      res.json({ success: true, agreements: rows.map(present) });
    }));
  }

  if (role === "vehicle_owner") {
    router.post("/agreements", h(async (req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>, me = uid(req);
      if (!isUuid(b.driverId)) return fail(res, 400, "Choose one of your drivers");
      if (!MODES.includes(b.mode as Mode)) return fail(res, 400, "Choose how the driver is paid: cash basis (weekly), monthly salary or an amount per trip");
      const mode = b.mode as Mode;
      const amountCents = Number(b.amountCents);
      if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) return fail(res, 400, "The amount must be a whole number of cents above zero");
      const currency = b.currency === "ZMW" ? "ZMW" : "ZAR";
      let payDay: number | null = null;
      if (mode === "cash_basis_weekly") { payDay = b.payDay === undefined || b.payDay === null ? 5 : Number(b.payDay); if (!Number.isInteger(payDay) || payDay < 1 || payDay > 7) return fail(res, 400, "The weekly payment day is 1 (Monday) to 7 (Sunday)"); }
      if (mode === "monthly_salary") { payDay = b.payDay === undefined || b.payDay === null ? 25 : Number(b.payDay); if (!Number.isInteger(payDay) || payDay < 1 || payDay > 28) return fail(res, 400, "The salary day is 1 to 28 of the month"); }
      if (!validDate(b.startDate)) return fail(res, 400, "Give the start date like 2026-11-01");
      if (b.endDate !== undefined && b.endDate !== null && b.endDate !== "" && (!validDate(b.endDate) || (b.endDate as string) < (b.startDate as string))) return fail(res, 400, "The end date must be a date on or after the start date");
      const linked = (await db.query(`SELECT 1 AS x FROM owner_drivers WHERE owner_id = $1 AND driver_id = $2 AND status = 'active'`, [me, b.driverId])).rows.length;
      if (!linked) return fail(res, 404, "That driver is not one of your drivers (the driver has to accept your request first)");
      const draft = { mode, amount_cents: amountCents, currency, pay_day: payDay, start_date: b.startDate as string };
      try {
        const r = await db.query(
          `INSERT INTO driver_agreements (owner_id, driver_id, mode, amount_cents, currency, pay_day, start_date, end_date, proposed_by, consent_text, consent_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$1,$9,$10) RETURNING id`,
          [me, b.driverId, mode, amountCents, currency, payDay, b.startDate, b.endDate || null, consentText(draft), AGREEMENT_CONSENT_VERSION]);
        await audit(db, req, "agreement.propose", String(r.rows[0].id), { driverId: b.driverId, mode, amountCents, currency });
        res.status(201).json({ success: true, id: r.rows[0].id });
      } catch (e) {
        if (isUniqueViolation(e)) return fail(res, 409, "There is already an open agreement with this driver. Cancel it first to propose a new one.");
        throw e;
      }
    }));
    router.post("/agreements/:id/cancel", h(async (req, res) => {
      const r = await db.query(`UPDATE driver_agreements SET status = CASE WHEN status = 'proposed' THEN 'cancelled' ELSE 'ended' END, end_date = CASE WHEN status = 'active' THEN CURRENT_DATE ELSE end_date END
                                WHERE id = $1 AND owner_id = $2 AND status IN ('proposed','active') RETURNING id`, [req.params.id, uid(req)]);
      if (!r.rows.length) return fail(res, 404, "That agreement is not open");
      await audit(db, req, "agreement.cancel", req.params.id as string, {});
      res.json({ success: true });
    }));
  }

  if (role === "driver") {
    router.post("/agreements/:id/accept", h(async (req, res) => {
      if ((req.body ?? {}).consent !== true) return fail(res, 400, "Tick the box to confirm you agree to the automatic transfers");
      const r = await db.query(`UPDATE driver_agreements SET status = 'active', accepted_at = now() WHERE id = $1 AND driver_id = $2 AND status = 'proposed' RETURNING id`, [req.params.id, uid(req)]);
      if (!r.rows.length) return fail(res, 404, "There is no proposed agreement to accept");
      await audit(db, req, "agreement.accept", req.params.id as string, { consentVersion: AGREEMENT_CONSENT_VERSION });
      res.json({ success: true });
    }));
    router.post("/agreements/:id/decline", h(async (req, res) => {
      const r = await db.query(`UPDATE driver_agreements SET status = 'declined' WHERE id = $1 AND driver_id = $2 AND status = 'proposed' RETURNING id`, [req.params.id, uid(req)]);
      if (!r.rows.length) return fail(res, 404, "There is no proposed agreement to decline");
      await audit(db, req, "agreement.decline", req.params.id as string, {});
      res.json({ success: true });
    }));
  }

  /* payments the rules created (as payer or payee) */
  router.get("/payments", h(async (req, res) => {
    const me = uid(req), { limit, offset } = pageParams(req, 25, 100);
    const status: string | null = typeof req.query.status === "string" ? req.query.status : null;
    const rows = (await db.query(
      `SELECT p.id, p.kind, p.payer_id, p.payee_id, p.amount_cents, p.remaining_cents, p.currency, p.status, p.note, p.due_at, p.paid_at, p.last_error, pu.name AS payer_name, eu.name AS payee_name
         FROM payment_items p JOIN users pu ON pu.id = p.payer_id JOIN users eu ON eu.id = p.payee_id
        WHERE (p.payer_id = $1 OR p.payee_id = $1) AND ($2::text IS NULL OR p.status = $2) ORDER BY p.due_at DESC, p.created_at DESC LIMIT $3 OFFSET $4`, [me, status, limit, offset])).rows;
    const owed = (await db.query(`SELECT COALESCE(SUM(remaining_cents),0) AS s FROM payment_items WHERE payer_id = $1 AND status IN ('pending','waiting','arrears')`, [me])).rows[0];
    const due = (await db.query(`SELECT COALESCE(SUM(remaining_cents),0) AS s FROM payment_items WHERE payee_id = $1 AND status IN ('pending','waiting','arrears')`, [me])).rows[0];
    res.json({ success: true, owedByMeCents: num(owed.s), owedToMeCents: num(due.s), payments: rows.map((r) => ({
      id: r.id, kind: r.kind, direction: r.payer_id === me ? "out" : "in", counterparty: r.payer_id === me ? r.payee_name : r.payer_name,
      amountCents: num(r.amount_cents), remainingCents: num(r.remaining_cents), currency: r.currency, status: r.status, note: r.note, dueAt: iso(r.due_at), paidAt: iso(r.paid_at),
      problem: r.payer_id === me ? r.last_error ?? null : null,
    })) });
  }));

  router.get("/trips", h(async (req, res) => {
    const me = uid(req), { limit, offset } = pageParams(req, 25, 100);
    const col = role === "driver" ? "t.driver_id" : role === "marshal" ? "t.marshal_id" : role === "vehicle_owner" ? "t.owner_id" : "te.association_id";
    const rows = (await db.query(
      `SELECT t.id, t.trip_no, t.taps, t.fare_cents, t.currency, t.completed_at, t.needs_review, v.registration
         FROM trips t JOIN terminals te ON te.id = t.terminal_id LEFT JOIN vehicles v ON v.id = t.vehicle_id WHERE ${col} = $1 ORDER BY t.completed_at DESC LIMIT $2 OFFSET $3`, [me, limit, offset])).rows;
    const open = role === "driver" || role === "vehicle_owner"
      ? (await db.query(`SELECT COUNT(*) AS n FROM terminal_taps t JOIN terminals te ON te.id = t.terminal_id WHERE ${role === "driver" ? "te.driver_id" : "te.owner_id"} = $1 AND t.status = 'confirmed' AND t.trip_id IS NULL`, [me])).rows[0] : null;
    res.json({ success: true, tapsInCurrentTrip: open ? num(open.n) : null, trips: rows.map((r) => ({ id: r.id, tripNo: num(r.trip_no), taps: num(r.taps), fareCents: num(r.fare_cents), currency: r.currency, completedAt: iso(r.completed_at), vehicle: r.registration ?? null, needsReview: r.needs_review ?? null })) });
  }));

  /* the association's marshal fee */
  if (role === "association") {
    router.get("/settings", h(async (req, res) => {
      const r = (await db.query(`SELECT marshal_fee_cents FROM association_settings WHERE association_id = $1`, [uid(req)])).rows[0];
      res.json({ success: true, marshalFeeCents: r?.marshal_fee_cents == null ? null : num(r.marshal_fee_cents) });
    }));
    router.put("/settings", h(async (req, res) => {
      const v = (req.body ?? {}).marshalFeeCents;
      if (v !== null && (!Number.isInteger(v) || v < 0 || v > 1_000_000)) return fail(res, 400, "The marshal fee must be a whole number of cents (or empty to use the default)");
      await db.query(`INSERT INTO association_settings (association_id, marshal_fee_cents) VALUES ($1,$2) ON CONFLICT (association_id) DO UPDATE SET marshal_fee_cents = EXCLUDED.marshal_fee_cents, updated_at = now()`, [uid(req), v]);
      await audit(db, req, "association.marshal_fee", null, { marshalFeeCents: v });
      res.json({ success: true, marshalFeeCents: v });
    }));
  }
  return router;
}
