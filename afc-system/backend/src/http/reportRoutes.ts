import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { failedTapsReport, parseRange, revenueReport, summary, ticketReport, toCsv, topupReport } from "../domain/reports";
import { operatorScope, requireRole, type Deps } from "./app";

export async function reportRoutes(app: FastifyInstance, { db }: Deps): Promise<void> {
  const read = requireRole("VIEWER", "OPERATOR");
  const range = z.object({ from: z.string().optional(), to: z.string().optional(), format: z.enum(["json", "csv"]).default("json") });

  const csv = (reply: FastifyReply, name: string, body: string) =>
    reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="${name}"`).send(body);

  app.get("/reports/summary", { preHandler: read }, async (req) => summary(db, operatorScope(req)));

  app.get("/reports/revenue", { preHandler: read }, async (req, reply) => {
    const q = range.extend({ groupBy: z.enum(["day", "route", "device", "operator"]).default("day") }).parse(req.query);
    const rep = await revenueReport(db, parseRange(q.from, q.to), q.groupBy, operatorScope(req));
    if (q.format === "csv") {
      return csv(reply, `revenue-by-${q.groupBy}.csv`, toCsv(rep.rows.map((r) => ({ [q.groupBy]: r.key, revenue_rand: (r.revenue / 100).toFixed(2), trips: r.trips, tap_ins: r.tapIns, penalties_rand: (r.penalties / 100).toFixed(2), offline_taps: r.offlineTaps })), [q.groupBy, "revenue_rand", "trips", "tap_ins", "penalties_rand", "offline_taps"]));
    }
    return rep;
  });

  app.get("/reports/failed-taps", { preHandler: read }, async (req, reply) => {
    const q = range.parse(req.query);
    const rep = await failedTapsReport(db, parseRange(q.from, q.to), operatorScope(req));
    if (q.format === "csv") return csv(reply, "failed-taps.csv", toCsv(rep.rows.map((r) => ({ ...r })), ["reason", "device", "count"]));
    return rep;
  });

  app.get("/reports/topups", { preHandler: read }, async (req, reply) => {
    const q = range.parse(req.query);
    const rep = await topupReport(db, parseRange(q.from, q.to));
    if (q.format === "csv") return csv(reply, "topups.csv", toCsv(rep.rows.map((r) => ({ method: r.method, count: r.count, total_rand: (r.total / 100).toFixed(2) })), ["method", "count", "total_rand"]));
    return rep;
  });

  app.get("/reports/tickets", { preHandler: read }, async (req, reply) => {
    const q = range.parse(req.query);
    const rep = await ticketReport(db, parseRange(q.from, q.to));
    if (q.format === "csv") return csv(reply, "tickets.csv", toCsv(rep.rows.map((r) => ({ day: r.day, sold: r.sold, used: r.used, amount_rand: (r.amount / 100).toFixed(2) })), ["day", "sold", "used", "amount_rand"]));
    return rep;
  });

  /** Every tap in a range as a CSV (for the operator's own accounting). */
  app.get("/reports/taps.csv", { preHandler: read }, async (req, reply) => {
    const q = range.parse(req.query);
    const r = parseRange(q.from, q.to);
    const scope = operatorScope(req);
    const rows = await db.txn.findMany({ where: { tappedAt: { gte: r.from, lt: r.to }, ...(scope === undefined ? {} : { routeId: { in: (await db.route.findMany({ where: { operatorId: scope }, select: { id: true } })).map((x) => x.id) } }) }, orderBy: { tappedAt: "asc" }, take: 50_000 });
    return csv(reply, "taps.csv", toCsv(rows.map((t) => ({ id: t.id, tapped_at: t.tappedAt.toISOString(), device: t.deviceId, card: t.cardUid, result: t.result, kind: t.kind, deny_reason: t.denyReason, route: t.routeId, stop: t.stopId, fare_rand: (t.fare / 100).toFixed(2), balance_after_rand: (t.balanceAfter / 100).toFixed(2), offline: t.offline ? "yes" : "no" })),
      ["id", "tapped_at", "device", "card", "result", "kind", "deny_reason", "route", "stop", "fare_rand", "balance_after_rand", "offline"]));
  });
}
