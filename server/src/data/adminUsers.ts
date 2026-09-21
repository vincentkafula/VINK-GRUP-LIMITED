import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import type { AdminUser } from "../types/auth.js";

// Staff/admin login accounts for the Management Panel — used by both
// the in-memory auth fallback (routes/auth.ts, when no DATABASE_URL is
// set) and to seed the real `users` table on first boot (db/migrate.ts).
//
// Extracted from the old data/store.ts (deleted as part of removing
// everything MVNO-specific) since this part of that file was never
// MVNO data at all — it's the actual staff accounts for the whole
// platform, banking admin included.
//
// SECURITY NOTE: these passwords are also committed in plaintext in
// DEV_CREDENTIALS.md at the repo root — a known, flagged issue (see
// plans/architecture/05-threat-model.md's Information Disclosure
// section) still pending explicit go-ahead to rotate. Not touched here
// — this file preserves the exact same seed behavior as before, moving
// it, not changing it.
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const adminUsers: AdminUser[] = [
  {
    id: uuid(),
    username: "admin",
    passwordHash: bcrypt.hashSync("Wakuca97950@", 10),
    role: "superadmin" as const,
    name: "Super Administrator",
    email: "admin@vink.co.za",
    lastLogin: ago(30),
    createdAt: ago(43800),
  },
  {
    id: uuid(),
    username: "superadmin",
    passwordHash: bcrypt.hashSync("Wakuca97950@", 10),
    role: "owner" as const,
    name: "System Owner",
    email: "owner@vink.co.za",
    lastLogin: ago(2),
    createdAt: ago(43800),
  },
  {
    id: uuid(),
    username: "noc1",
    passwordHash: bcrypt.hashSync("Noc@5678", 10),
    role: "noc_engineer" as const,
    name: "NOC Engineer 1",
    email: "noc1@vink.co.za",
    lastLogin: ago(10),
    createdAt: ago(8760),
  },
  {
    id: uuid(),
    username: "billing1",
    passwordHash: bcrypt.hashSync("Bill@9012", 10),
    role: "billing_admin" as const,
    name: "Billing Admin",
    email: "billing@vink.co.za",
    lastLogin: ago(120),
    createdAt: ago(4380),
  },
];
