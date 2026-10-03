import { Router } from "express";
import { h, uid, num, iso, type Db } from "./common.js";
import { saPeriods } from "./driverRoutes.js";

/**
 * The Investor Dashboard API, mounted at /api/portal/investor (investors only). Read only: an investor sees the fare terminals that
 * have been assigned to them (terminals.investor_id, set by staff) and what each confirmed fare earned them.
 *
 * The per-fare figure is the stored investor_share of each tap (the existing revenue split: 10% of the platform's own per-tap fee).
 * The investor's separate monthly device rental is paid by the owner outside this system and is not recorded here, so it is not shown.
 *
 *   GET /terminals    my terminals (vehicle, status, last seen)
 *   GET /income       income today / this week / this month, per terminal this month, and the latest fares
 */
export function createInvestorRouter(db: Db, now: () => Date = () => new Date()): Router {
  const router = Router();

  router.get("/", (req, res) => { res.json({ success: true, role: "investor", user: { id: uid(req), username: req.user!.username } }); });

  router.get("/terminals", h(async (req, res) => {
    const r = (await db.query(
      `SELECT t.id, t.serial, t.status, t.last_seen_at, v.registration FROM terminals t LEFT JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.investor_id = $1 AND t.status <> 'revoked' ORDER BY t.serial`, [uid(req)])).rows;
    res.json({ success: true, terminals: r.map((x) => ({ id: x.id, serial: x.serial, status: x.status, lastSeenAt: iso(x.last_seen_at), vehicle: x.registration ?? null })) });
  }));

  router.get("/income", h(async (req, res) => {
    const p = saPeriods(now()), me = uid(req);
    const sum = async (from: Date) => {
      const x = (await db.query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(k.investor_share), 0) AS income FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id
          WHERE t.investor_id = $1 AND k.status = 'confirmed' AND k.received_at >= $2`, [me, from])).rows[0];
      return { fares: num(x?.n), income: num(x?.income) };
    };
    const perTerminal = (await db.query(
      `SELECT t.serial, COUNT(k.id) AS n, COALESCE(SUM(k.investor_share), 0) AS income
         FROM terminals t LEFT JOIN terminal_taps k ON k.terminal_id = t.id AND k.status = 'confirmed' AND k.received_at >= $2
        WHERE t.investor_id = $1 AND t.status <> 'revoked' GROUP BY t.serial ORDER BY t.serial`, [me, p.month])).rows;
    const recent = (await db.query(
      `SELECT k.id, k.received_at, k.amount, k.investor_share, t.serial FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id
        WHERE t.investor_id = $1 AND k.status = 'confirmed' ORDER BY k.received_at DESC LIMIT 30`, [me])).rows;
    res.json({
      success: true, currency: "ZAR",
      today: await sum(p.day), week: await sum(p.week), month: await sum(p.month),
      perTerminal: perTerminal.map((x) => ({ serial: x.serial, fares: num(x.n), income: num(x.income) })),
      recent: recent.map((x) => ({ id: x.id, at: iso(x.received_at), fare: num(x.amount), income: num(x.investor_share), terminal: x.serial })),
    });
  }));

  return router;
}
