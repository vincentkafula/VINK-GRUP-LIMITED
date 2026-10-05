import type { Db } from "./common.js";
import type { ChannelAccount } from "./bankLinks.js";
import { readChannelAccounts } from "./bankLinks.js";

/**
 * The pooled bank accounts customers pay into: one per pool (in-person, online) and currency. Staff set them on the admin page (no redeploy), and the
 * platform never creates a bank account: these are details of accounts that already exist. For rand, the PAYMENT_CHANNEL_ACCOUNTS variable is still read
 * as a fallback, and an account set here replaces it.
 *
 * Reads are synchronous from a small cache (the dashboards ask on every load); the cache is filled at start and after every change.
 */
export type Pool = "in_person" | "online";
export type PoolCurrency = "ZAR" | "ZMW";
export const POOL_LIST: Pool[] = ["in_person", "online"];
export const POOL_CURRENCIES: PoolCurrency[] = ["ZAR", "ZMW"];
export interface PooledRow extends ChannelAccount { pool: Pool; currency: PoolCurrency; updatedAt?: string | null }

export function validatePooled(b: Record<string, unknown>): { ok: true; value: PooledRow } | { ok: false; error: string } {
  if (!POOL_LIST.includes(b.pool as Pool)) return { ok: false, error: "Choose In-Person or Online" };
  if (!POOL_CURRENCIES.includes(b.currency as PoolCurrency)) return { ok: false, error: "Choose rand (ZAR) or kwacha (ZMW)" };
  const accountNumber = typeof b.accountNumber === "string" ? b.accountNumber.replace(/\s/g, "") : "";
  if (!/^\d{6,20}$/.test(accountNumber)) return { ok: false, error: "The account number must be 6 to 20 digits" };
  const holder = typeof b.holder === "string" ? b.holder.trim() : "", bank = typeof b.bank === "string" ? b.bank.trim() : "";
  if (holder.length < 2 || holder.length > 80 || /[<>]/.test(holder)) return { ok: false, error: "Enter the account holder's name (2 to 80 characters)" };
  if (bank.length < 2 || bank.length > 60 || /[<>]/.test(bank)) return { ok: false, error: "Enter the bank's name (2 to 60 characters)" };
  if (b.type !== "Personal" && b.type !== "Business") return { ok: false, error: "The account type is Personal or Business" };
  return { ok: true, value: { pool: b.pool as Pool, currency: b.currency as PoolCurrency, accountNumber, holder, bank, type: b.type } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> };

export function createPooledStore(database: Db | null, env: NodeJS.ProcessEnv = process.env) {
  const db = database as unknown as Loose | null;
  let rows: PooledRow[] = [];
  const envRand = () => readChannelAccounts(env, () => {});
  const store = {
    async refresh(): Promise<void> {
      if (!db) return;
      try {
        const r = (await db.query(`SELECT pool, currency, account_number, holder, bank, account_type, updated_at FROM pooled_accounts`)).rows;
        rows = r.map((x) => ({ pool: x.pool, currency: x.currency, accountNumber: x.account_number, holder: x.holder, bank: x.bank, type: x.account_type, updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : null }));
      } catch (e) { console.error("[pooled] could not read the pooled accounts:", e instanceof Error ? e.message : e); }
    },
    /** What customers see for a currency: the account set on the admin page, else (rand only) the environment variable. */
    forCurrency(currency: string): Partial<Record<Pool, ChannelAccount>> {
      const out: Partial<Record<Pool, ChannelAccount>> = currency === "ZAR" ? { ...envRand() } : {};
      for (const r of rows) if (r.currency === currency) out[r.pool] = { accountNumber: r.accountNumber, holder: r.holder, bank: r.bank, type: r.type };
      return out;
    },
    list(): PooledRow[] { return rows.map((r) => ({ ...r })); },
    async set(row: PooledRow, by: string | null): Promise<void> {
      if (!db) throw new Error("The database is not configured");
      await db.query(`INSERT INTO pooled_accounts (pool, currency, account_number, holder, bank, account_type, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
                      ON CONFLICT (pool, currency) DO UPDATE SET account_number = EXCLUDED.account_number, holder = EXCLUDED.holder, bank = EXCLUDED.bank, account_type = EXCLUDED.account_type, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [row.pool, row.currency, row.accountNumber, row.holder, row.bank, row.type, by]);
      await store.refresh();
    },
    async remove(pool: Pool, currency: PoolCurrency): Promise<boolean> {
      if (!db) throw new Error("The database is not configured");
      const r = await db.query(`DELETE FROM pooled_accounts WHERE pool = $1 AND currency = $2 RETURNING pool`, [pool, currency]);
      await store.refresh();
      return r.rows.length > 0;
    },
  };
  return store;
}
export type PooledStore = ReturnType<typeof createPooledStore>;
