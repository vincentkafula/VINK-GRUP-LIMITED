import bcrypt from "bcryptjs";
import { BCRYPT_ROUNDS } from "../config/secrets.js";
import { ACCOUNT_ROLES } from "./roles.js";

/** The five transport account types plus the VINK banking customer (SEED_CUSTOMER_EMAIL / SEED_CUSTOMER_PASSWORD). */
const SEEDED_ROLES = [...ACCOUNT_ROLES, "customer"] as const;
type SeedRole = (typeof SEEDED_ROLES)[number];

/**
 * Test accounts, one per account type, read ONLY from environment variables (Railway: service -> Variables):
 *   SEED_PERSONAL_EMAIL / SEED_PERSONAL_PASSWORD, SEED_DRIVER_..., SEED_MARSHAL_..., SEED_OWNER_..., SEED_ASSOCIATION_...
 * (SEED_OWNER_* is the VEHICLE owner; the platform owner keeps SEED_PASSWORD_OWNER.)
 *
 * Switch: runs when NODE_ENV is not "production", or when SEED_ENABLED=true. Remove SEED_ENABLED (or set it to anything else)
 * before going live and the test accounts are no longer created or refreshed. Passwords are never logged or committed.
 * Idempotent: runs on every start, creates a missing account, and only re-hashes when the configured password changed.
 */
const ENV_PREFIX: Record<SeedRole, string> = {
  personal: "PERSONAL", driver: "DRIVER", marshal: "MARSHAL", vehicle_owner: "OWNER", association: "ASSOCIATION", investor: "INVESTOR", customer: "CUSTOMER",
};
const LABEL: Record<SeedRole, string> = {
  personal: "Test Passenger", driver: "Test Driver", marshal: "Test Marshal", vehicle_owner: "Test Vehicle Owner", association: "Test Association", investor: "Test Investor", customer: "Test Customer",
};

export interface SeedAccount { role: SeedRole; email: string; password: string }

export function seedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.SEED_ENABLED === "true";
}

/** Reads the configured accounts. A role is skipped when either variable is missing, or the password is too weak. */
export function readSeedAccounts(env: NodeJS.ProcessEnv = process.env, warn: (m: string) => void = console.warn): SeedAccount[] {
  if (!seedEnabled(env)) return [];
  const out: SeedAccount[] = [];
  for (const role of SEEDED_ROLES) {
    const p = ENV_PREFIX[role];
    const email = env[`SEED_${p}_EMAIL`]?.trim().toLowerCase(), password = env[`SEED_${p}_PASSWORD`];
    if (!email && !password) continue;
    if (!email || !password) { warn(`[seed] SEED_${p}_EMAIL and SEED_${p}_PASSWORD must both be set; skipping ${role}.`); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { warn(`[seed] SEED_${p}_EMAIL is not a valid email; skipping ${role}.`); continue; }
    if (password.length < 12) { warn(`[seed] SEED_${p}_PASSWORD must be at least 12 characters; skipping ${role}.`); continue; }
    out.push({ role, email, password });
  }
  return out;
}

/** The little the seed needs from the database (a pg Pool satisfies it). */
export interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }

export async function seedRoleAccounts(db: Queryable, env: NodeJS.ProcessEnv = process.env, log: (m: string) => void = console.log): Promise<void> {
  const accounts = readSeedAccounts(env);
  for (const a of accounts) {
    // The email is the sign-in name for these accounts (the login form takes a username or an email).
    const found = await db.query(`SELECT id, password_hash, role FROM users WHERE lower(email) = $1 OR username = $1 LIMIT 1`, [a.email]);
    const row = found.rows[0];
    if (!row) {
      await db.query(
        `INSERT INTO users (username, password_hash, role, name, email, email_verified) VALUES ($1,$2,$3,$4,$1,true)`,
        [a.email, await bcrypt.hash(a.password, BCRYPT_ROUNDS), a.role, LABEL[a.role]]);
      log(`[seed] created ${a.role} test account`);
      continue;
    }
    const sameRole = row.role === a.role;
    const samePassword = await bcrypt.compare(a.password, String(row.password_hash));
    // Never repurpose a real account: an existing user with this email but a different role is left alone.
    if (!sameRole) { log(`[seed] ${a.email} already exists with a different role; left unchanged`); continue; }
    if (!samePassword) {
      await db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [row.id, await bcrypt.hash(a.password, BCRYPT_ROUNDS)]);
      log(`[seed] updated the password of the ${a.role} test account`);
    }
  }
  if (accounts.length) log(`[seed] role test accounts ready: ${accounts.map((a) => a.role).join(", ")}`);
}
