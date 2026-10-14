import type { Db } from "../db";
import { Prisma } from "../db";
import { badRequest } from "./errors";

const TZ = "Africa/Johannesburg";

export interface Range { from: Date; to: Date }
export function parseRange(from?: string, to?: string): Range {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * 86400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw badRequest("bad_range", "from/to must be ISO dates");
  if (end < start) throw badRequest("bad_range", "to must be after from");
  if (end.getTime() - start.getTime() > 366 * 86400_000) throw badRequest("bad_range", "Choose a range of at most one year");
  return { from: start, to: end };
}

const num = (v: unknown) => (typeof v === "bigint" ? Number(v) : Number(v ?? 0));

export type GroupBy = "day" | "route" | "device" | "operator";

/** Money taken from cards, trips completed and unfinished-trip penalties, grouped by day, route, device or operator. `operatorId` limits an operator's staff to their own routes. */
export async function revenueReport(db: Db, r: Range, groupBy: GroupBy, operatorId?: number) {
  const key = {
    day: Prisma.sql`to_char(date_trunc('day', t."tappedAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD')`,
    route: Prisma.sql`COALESCE(rt.code, t."routeId"::text)`,
    device: Prisma.sql`t."deviceId"`,
    operator: Prisma.sql`COALESCE(op.name, 'Unknown')`,
  }[groupBy];
  if (!key) throw badRequest("bad_group", "groupBy must be day, route, device or operator");
  const scope = operatorId === undefined ? Prisma.empty : Prisma.sql`AND rt."operatorId" = ${operatorId}`;
  const rows = await db.$queryRaw<{ k: string; revenue: bigint; trips: bigint; tap_ins: bigint; penalties: bigint; offline_taps: bigint }[]>`
    SELECT ${key} AS k,
           COALESCE(SUM(t.fare), 0) AS revenue,
           COUNT(*) FILTER (WHERE t.kind IN ('flat', 'tap_out')) AS trips,
           COUNT(*) FILTER (WHERE t.kind IN ('tap_in', 'penalty_tap_in')) AS tap_ins,
           COALESCE(SUM(t.penalty), 0) AS penalties,
           COUNT(*) FILTER (WHERE t.offline) AS offline_taps
    FROM "Txn" t
    LEFT JOIN "Route" rt ON rt.id = t."routeId"
    LEFT JOIN "Operator" op ON op.id = rt."operatorId"
    WHERE t.result = 'ok' AND t."tappedAt" >= ${r.from} AND t."tappedAt" < ${r.to} ${scope}
    GROUP BY 1 ORDER BY 1`;
  const out = rows.map((x) => ({ key: x.k, revenue: num(x.revenue), trips: num(x.trips), tapIns: num(x.tap_ins), penalties: num(x.penalties), offlineTaps: num(x.offline_taps) }));
  return { groupBy, from: r.from.toISOString(), to: r.to.toISOString(), totals: { revenue: out.reduce((s, x) => s + x.revenue, 0), trips: out.reduce((s, x) => s + x.trips, 0), penalties: out.reduce((s, x) => s + x.penalties, 0) }, rows: out };
}

/** Taps that were refused, by reason and device: shows blocked cards still being used, empty cards, faulty readers. */
export async function failedTapsReport(db: Db, r: Range, operatorId?: number) {
  const scope = operatorId === undefined ? Prisma.empty : Prisma.sql`AND rt."operatorId" = ${operatorId}`;
  const rows = await db.$queryRaw<{ reason: string; device: string; n: bigint }[]>`
    SELECT COALESCE(t."denyReason", 'UNKNOWN') AS reason, t."deviceId" AS device, COUNT(*) AS n
    FROM "Txn" t LEFT JOIN "Route" rt ON rt.id = t."routeId"
    WHERE t.result = 'denied' AND t."tappedAt" >= ${r.from} AND t."tappedAt" < ${r.to} ${scope}
    GROUP BY 1, 2 ORDER BY n DESC`;
  return { from: r.from.toISOString(), to: r.to.toISOString(), rows: rows.map((x) => ({ reason: x.reason, device: x.device, count: num(x.n) })) };
}

export async function topupReport(db: Db, r: Range) {
  const rows = await db.$queryRaw<{ method: string; n: bigint; total: bigint }[]>`
    SELECT method::text AS method, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total
    FROM "Topup" WHERE status = 'LOADED' AND "loadedAt" >= ${r.from} AND "loadedAt" < ${r.to} GROUP BY 1 ORDER BY 1`;
  return { rows: rows.map((x) => ({ method: x.method, count: num(x.n), total: num(x.total) })) };
}

/** Tickets sold (money in) and used, by day. */
export async function ticketReport(db: Db, r: Range) {
  const rows = await db.$queryRaw<{ day: string; sold: bigint; amount: bigint; used: bigint }[]>`
    SELECT to_char(date_trunc('day', t."issuedAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day, COUNT(*) AS sold, COALESCE(SUM(t.price), 0) AS amount,
           COUNT(*) FILTER (WHERE t.status = 'USED') AS used
    FROM "Ticket" t WHERE t.status <> 'VOID' AND t."issuedAt" >= ${r.from} AND t."issuedAt" < ${r.to} GROUP BY 1 ORDER BY 1`;
  const out = rows.map((x) => ({ day: x.day, sold: num(x.sold), amount: num(x.amount), used: num(x.used) }));
  return { from: r.from.toISOString(), to: r.to.toISOString(), totals: { sold: out.reduce((s, x) => s + x.sold, 0), amount: out.reduce((s, x) => s + x.amount, 0), used: out.reduce((s, x) => s + x.used, 0) }, rows: out };
}

/** The numbers on the dashboard's front page. */
export async function summary(db: Db, operatorId?: number) {
  const now = new Date(), dayAgo = new Date(now.getTime() - 86400_000);
  const [today, week, topups, failed, anomalies, devices, blocked, tickets] = await Promise.all([
    revenueReport(db, { from: dayAgo, to: now }, "day", operatorId),
    revenueReport(db, parseRange(undefined, undefined), "day", operatorId),
    topupReport(db, { from: dayAgo, to: now }),
    failedTapsReport(db, { from: dayAgo, to: now }, operatorId),
    db.anomaly.count({ where: { resolvedAt: null, severity: { in: ["MEDIUM", "HIGH"] } } }),
    db.device.findMany({ select: { id: true, status: true, lastSeenAt: true } }),
    db.card.count({ where: { status: { in: ["BLOCKED", "LOST"] } } }),
    ticketReport(db, { from: dayAgo, to: now }),
  ]);
  const online = devices.filter((d) => d.status === "ACTIVE" && d.lastSeenAt && now.getTime() - d.lastSeenAt.getTime() < 15 * 60_000).length;
  return {
    last24h: { revenue: today.totals.revenue, trips: today.totals.trips, failedTaps: failed.rows.reduce((s, x) => s + x.count, 0), topups: topups.rows.reduce((s, x) => s + x.total, 0), ticketSales: tickets.totals.amount, ticketsSold: tickets.totals.sold },
    last7d: week.rows.map((x) => ({ day: x.key, revenue: x.revenue, trips: x.trips })),
    openAnomalies: anomalies, devices: { total: devices.length, online }, blockedCards: blocked,
  };
}

/** RFC 4180 CSV. Cells that start with = + - @ are prefixed so a spreadsheet never runs them as formulas. */
export function toCsv(rows: Record<string, string | number | null | undefined>[], columns: string[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}
