import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import type { AdminUser } from "../types/auth.js";
import { seedPassword, BCRYPT_ROUNDS } from "../config/secrets.js";

// Staff/admin login accounts for the Management Panel — used by both
// the in-memory auth fallback (routes/auth.ts, when no DATABASE_URL is
// set) and to seed the real `users` table on first boot (db/migrate.ts).
//
// Passwords are NOT in this file. Each account's password comes from the
// SEED_PASSWORD_<NAME> environment variable (ADMIN, OWNER, NOC1, BILLING1,
// CUSTOMER1). When unset: in production the account is simply not created,
// elsewhere it gets a random password printed to the console once. See
// config/secrets.ts and DEV_CREDENTIALS.md. (Earlier versions of this file
// committed fixed passwords; anyone who could read the repo knew them, so
// every account that ever used them must have its password changed --
// `npm run set-password` in server/.)
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const account = (
  seed: string,
  username: string,
  role: AdminUser["role"],
  name: string,
  email: string,
  lastLoginMinutesAgo: number | null,
  createdMinutesAgo: number,
): AdminUser | null => {
  const password = seedPassword(seed);
  if (!password) return null;
  return {
    id: uuid(),
    username,
    passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
    role,
    name,
    email,
    lastLogin: lastLoginMinutesAgo === null ? null : ago(lastLoginMinutesAgo),
    createdAt: ago(createdMinutesAgo),
  };
};

export const adminUsers: AdminUser[] = [
  account("ADMIN", "admin", "superadmin", "Super Administrator", "admin@vink.co.za", 30, 43800),
  account("OWNER", "superadmin", "owner", "System Owner", "owner@vink.co.za", 2, 43800),
  account("NOC1", "noc1", "noc_engineer", "NOC Engineer 1", "noc1@vink.co.za", 10, 8760),
  account("BILLING1", "billing1", "billing_admin", "Billing Admin", "billing@vink.co.za", 120, 4380),
  // Same dev customer account that db/migrate.ts seeds into Postgres (seedDefaultCustomer) --
  // present here too so the customer experience (including the VINK dashboard) can be
  // signed into when running without DATABASE_URL.
  account("CUSTOMER1", "customer1", "customer", "Demo Customer", "customer@vink.co.za", null, 4380),
].filter((u): u is AdminUser => u !== null);
