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
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

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
