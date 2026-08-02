import { Pool } from "pg";

/**
 * Shared Postgres pool for the whole backend.
 *
 * Railway auto-injects DATABASE_URL when a Postgres plugin is attached to
 * this service. When it's absent (local dev without a DB, or a service
 * that hasn't had Postgres attached yet), `pool` is null and the modules
 * that support it (auth, marketplace) fall back to their original
 * in-memory stores so nothing breaks.
 */
const connectionString = process.env.DATABASE_URL;

export const hasDb = Boolean(connectionString);

export const pool = connectionString
  ? new Pool({
      connectionString,
      // Railway's internal/public Postgres endpoints require SSL in
      // production but the cert isn't in the default trust store.
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 10,
    })
  : null;

if (pool) {
  pool.on("error", (err) => {
    console.error("[db] Unexpected error on idle client", err);
  });
}

export async function query<T extends Record<string, any> = any>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
  if (!pool) throw new Error("Database not configured — DATABASE_URL is not set");
  const result = await pool.query(text, params as any[]);
  return { rows: result.rows as T[] };
}
