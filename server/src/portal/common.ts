import { randomUUID } from "node:crypto";
import type { Request, Response, RequestHandler } from "express";
import type { Db } from "./driverRoutes.js";

export type { Db };

/** Wraps an async route so a thrown error reaches Express' error handler instead of crashing the process or hanging the request. */
export const h = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };

export const num = (v: unknown) => Number(v ?? 0);
export const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export const dateOnly = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
export const uid = (req: Request) => req.user!.userId;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export const validDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

/** A trimmed string of 1..max characters, or null. */
export const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
};
/** Like text(), but empty is allowed (returns "" as null) and too long / wrong type is an error (undefined). */
export const optText = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null || v === "") return null;
  return text(v, max) ?? undefined;
};

export const fail = (res: Response, status: number, error: string) => { res.status(status).json({ success: false, error }); };

/** Postgres unique-violation (also what pg-mem raises). */
export const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && ((e as { code?: string }).code === "23505" || /duplicate key|unique constraint/i.test(String((e as { message?: string }).message)));

/** Notification read-state shared by every dashboard (notifications themselves are derived from real events). */
export async function readKeys(db: Db, userId: string): Promise<Set<string>> {
  return new Set((await db.query(`SELECT key FROM notification_reads WHERE user_id = $1`, [userId])).rows.map((x) => String(x.key)));
}
export async function markKeys(db: Db, userId: string, keys: unknown): Promise<number> {
  const list = Array.isArray(keys) ? (keys as unknown[]).filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 200).slice(0, 100) : [];
  for (const key of list) await db.query(`INSERT INTO notification_reads (user_id, key) VALUES ($1,$2) ON CONFLICT (user_id, key) DO NOTHING`, [userId, key]);
  return list.length;
}

export interface UserLite { id: string; name: string; email: string; role: string }
export async function findUserByEmail(db: Db, email: unknown): Promise<UserLite | null> {
  const e = text(email, 320);
  if (!e) return null;
  const r = (await db.query(`SELECT id, name, email, role FROM users WHERE lower(email) = $1 LIMIT 1`, [e.toLowerCase()])).rows[0];
  return r ? { id: String(r.id), name: String(r.name), email: String(r.email), role: String(r.role) } : null;
}

/* ───────────────────────── shared helpers for lists, ranges, exports and audit ───────────────────────── */

const SA_OFFSET_MS = 2 * 3600_000;                // South Africa is UTC+2 all year (no daylight saving)
export const saDay = (d: Date) => new Date(d.getTime() + SA_OFFSET_MS).toISOString().slice(0, 10);
/** The instant a South African calendar day (YYYY-MM-DD) begins. */
export const saDayStart = (day: string) => new Date(Date.parse(day + "T00:00:00Z") - SA_OFFSET_MS);

/** ?limit=&offset= with sane bounds. */
export function pageParams(req: Request, defaultLimit = 25, maxLimit = 100): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || defaultLimit, 1), maxLimit);
  const offset = Math.max(Math.trunc(Number(req.query.offset)) || 0, 0);
  return { limit, offset };
}

export interface DateRange { from: Date; toExclusive: Date; fromDay: string; toDay: string }
/**
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (South African days, both inclusive). Defaults to the last `defaultDays` days up to today.
 * Returns an error string when the dates are invalid, reversed, or span more than a year.
 */
export function rangeParams(req: Request, now: Date, defaultDays = 30, defaultFromDay?: string): DateRange | { error: string } {
  const today = saDay(now);
  const toDay = req.query.to === undefined || req.query.to === "" ? today : String(req.query.to);
  const fromDay = req.query.from === undefined || req.query.from === "" ? (defaultFromDay ?? saDay(new Date(saDayStart(toDay).getTime() - (defaultDays - 1) * 86400_000))) : String(req.query.from);
  if (!validDate(fromDay) || !validDate(toDay)) return { error: "Dates must look like 2026-10-31" };
  if (fromDay > toDay) return { error: "The start date is after the end date" };
  const from = saDayStart(fromDay), toExclusive = new Date(saDayStart(toDay).getTime() + 86400_000);
  if (toExclusive.getTime() - from.getTime() > 366 * 86400_000) return { error: "Choose a range of one year or less" };
  return { from, toExclusive, fromDay, toDay };
}

/** Sums amounts into South African calendar days (zero-filled), oldest first. For trend charts. */
export function bucketDays(rows: { at: unknown; value: number }[], from: Date, toExclusive: Date): { day: string; value: number; count: number }[] {
  const days: { day: string; value: number; count: number }[] = [];
  for (let t = from.getTime(); t < toExclusive.getTime(); t += 86400_000) days.push({ day: saDay(new Date(t)), value: 0, count: 0 });
  const index = new Map(days.map((d, i) => [d.day, i]));
  for (const r of rows) {
    const i = index.get(saDay(new Date(r.at as string)));
    if (i !== undefined) { days[i].value = Math.round((days[i].value + r.value) * 100) / 100; days[i].count += 1; }
  }
  return days;
}

/** Cell text safe to open in a spreadsheet: a leading = + - @ (or tab / CR) in TEXT would be run as a formula, so it is neutralised. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "string" ? v : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function sendCsv(res: Response, filename: string, columns: string[], rows: unknown[][]): void {
  const body = "﻿" + [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");        // lets the dashboard (on another origin) read the file name
  res.send(body);
}

/** Records a sensitive action in the existing audit_log table. Never throws: a logging failure must not undo the action. */
export async function audit(db: Db, req: Request, action: string, target: string | null, details: Record<string, unknown> = {}): Promise<void> {
  try {
    await db.query(`INSERT INTO audit_log (id, actor_id, actor_name, action, target, details) VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), uid(req), req.user?.username ?? "unknown", action, target, JSON.stringify(details)]);
  } catch (e) { console.error("[audit] could not record", action, e instanceof Error ? e.message : e); }
}
