import { Router, type Request } from "express";
import { h, uid, num, iso, fail, audit, bucketDays, pageParams, rangeParams, saDay, sendCsv, type Db } from "./common.js";
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
    const out = [];
    for (const x of r) {
      const faults = num((await db.query(`SELECT COUNT(*) AS n FROM device_faults WHERE terminal_id = $1 AND resolved = false`, [x.id])).rows[0]?.n);
      out.push({ id: x.id, serial: x.serial, status: x.status, lastSeenAt: iso(x.last_seen_at), vehicle: x.registration ?? null, openFaults: faults });
    }
    res.json({ success: true, terminals: out });
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

  /** Fares on my terminals with my income on each. ?status=&from=&to=&limit=&offset= ; /taps.csv downloads the same selection. No card data. */
  async function tapQuery(req: Request, csv: boolean) {
    const range = rangeParams(req, now(), 30);
    if ("error" in range) return range;
    const status = typeof req.query.status === "string" && ["confirmed", "declined", "received", "processing"].includes(req.query.status) ? req.query.status : null;
    const args: unknown[] = [uid(req), range.from, range.toExclusive];
    let where = `FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id WHERE t.investor_id = $1 AND k.received_at >= $2 AND k.received_at < $3`;
    if (status) { args.push(status); where += ` AND k.status = $${args.length}`; }
    const total = num((await db.query(`SELECT COUNT(*) AS n ${where}`, args)).rows[0]?.n);
    const { limit, offset } = csv ? { limit: 5000, offset: 0 } : pageParams(req, 25, 100);
    const rows = (await db.query(`SELECT k.id, k.amount, k.investor_share, k.status, k.received_at, t.serial ${where} ORDER BY k.received_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset])).rows;
    return { rows, total, limit, offset };
  }
  router.get("/taps", h(async (req, res) => {
    const r = await tapQuery(req, false);
    if ("error" in r) { fail(res, 400, r.error); return; }
    res.json({ success: true, total: r.total, limit: r.limit, offset: r.offset, taps: r.rows.map((x) => ({ id: x.id, at: iso(x.received_at), terminal: x.serial, fare: num(x.amount), income: num(x.investor_share), status: x.status })) });
  }));
  router.get("/taps.csv", h(async (req, res) => {
    const r = await tapQuery(req, true);
    if ("error" in r) { fail(res, 400, r.error); return; }
    await audit(db, req, "investor.export.taps", null, { rows: r.rows.length });
    sendCsv(res, `taps-${saDay(now())}.csv`, ["When (UTC)", "Terminal", "Fare (ZAR)", "Your income (ZAR)", "Status"], r.rows.map((x) => [iso(x.received_at), x.serial, num(x.amount), num(x.investor_share), x.status]));
  }));

  /** My income per day (default last 14 days), zero-filled, for the trend chart. */
  router.get("/trend", h(async (req, res) => {
    const range = rangeParams(req, now(), 14);
    if ("error" in range) { fail(res, 400, range.error); return; }
    const rows = (await db.query(`SELECT k.investor_share, k.received_at FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id WHERE t.investor_id = $1 AND k.status = 'confirmed' AND k.received_at >= $2 AND k.received_at < $3 LIMIT 50000`, [uid(req), range.from, range.toExclusive])).rows;
    res.json({ success: true, currency: "ZAR", days: bucketDays(rows.map((x) => ({ at: x.received_at, value: num(x.investor_share) })), range.from, range.toExclusive) });
  }));

  /**
   * Income summary for a period (default: this month so far): per day and per terminal. It adds up the investor share stored on each
   * confirmed fare. It is a summary of recorded money, not an audited financial statement or tax advice. The monthly device rental
   * is paid by the owner outside this platform and is not recorded here.
   */
  async function statement(req: Request) {
    const range = rangeParams(req, now(), 31, saDay(now()).slice(0, 8) + "01");
    if ("error" in range) return range;
    const rows = (await db.query(`SELECT k.investor_share, k.received_at, t.serial FROM terminal_taps k JOIN terminals t ON t.id = k.terminal_id WHERE t.investor_id = $1 AND k.status = 'confirmed' AND k.received_at >= $2 AND k.received_at < $3 ORDER BY k.received_at LIMIT 50000`, [uid(req), range.from, range.toExclusive])).rows;
    const round = (n: number) => Math.round(n * 100) / 100;
    const days = bucketDays(rows.map((x) => ({ at: x.received_at, value: num(x.investor_share) })), range.from, range.toExclusive).filter((d) => d.count > 0);
    const per = new Map<string, { fares: number; income: number }>();
    for (const x of rows) { const e = per.get(String(x.serial)) ?? { fares: 0, income: 0 }; e.fares += 1; e.income = round(e.income + num(x.investor_share)); per.set(String(x.serial), e); }
    return { range, days, perTerminal: [...per.entries()].map(([serial, v]) => ({ serial, ...v })), totals: { fares: rows.length, income: round(rows.reduce((a, x) => a + num(x.investor_share), 0)) } };
  }
  router.get("/statements", h(async (req, res) => {
    const st = await statement(req);
    if ("error" in st) { fail(res, 400, st.error); return; }
    res.json({ success: true, currency: "ZAR", from: st.range.fromDay, to: st.range.toDay, days: st.days.map((d) => ({ day: d.day, fares: d.count, income: d.value })), perTerminal: st.perTerminal, totals: st.totals });
  }));
  router.get("/statements.csv", h(async (req, res) => {
    const st = await statement(req);
    if ("error" in st) { fail(res, 400, st.error); return; }
    await audit(db, req, "investor.export.statement", null, { from: st.range.fromDay, to: st.range.toDay });
    sendCsv(res, `investor-income-${st.range.fromDay}-to-${st.range.toDay}.csv`, ["Date / terminal", "Fares", "Your income (ZAR)"],
      [...st.days.map((d) => [d.day, d.count, d.value]), ...st.perTerminal.map((t) => [`Terminal ${t.serial}`, t.fares, t.income]), ["TOTAL", st.totals.fares, st.totals.income]]);
  }));

  return router;
}
