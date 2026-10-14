import { createHash } from "node:crypto";
import type { UserRecord } from "./store.js";

/** Roles that run the platform. They must use a second factor when AUTH_REQUIRE_STAFF_MFA=true. Customers and portal roles may opt in. */
export const STAFF_ROLES = new Set(["superadmin", "owner", "admin", "noc_engineer", "finance", "compliance", "support", "operations", "back_office"]);
export const isStaff = (role: string) => STAFF_ROLES.has(role);
export const staffMfaRequired = (env: NodeJS.ProcessEnv = process.env) => env.AUTH_REQUIRE_STAFF_MFA === "true";

export const hashRecovery = (code: string) => createHash("sha256").update(code.trim().toLowerCase()).digest("hex");

/** Failed sign-ins in a row that lock the account, and for how long. A correct password plus code resets the count. */
export const LOCKOUT = { maxFailures: 5, lockMinutes: 15 } as const;
export const isLocked = (u: Pick<UserRecord, "lockedUntil">, now = new Date()) => !!u.lockedUntil && u.lockedUntil > now;
