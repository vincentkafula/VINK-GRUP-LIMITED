import type { Router } from "express";
import { pool } from "../db/pool.js";
import { resolveAuthConfig, type AuthConfig } from "./config.js";
import { PgAuthStore, MemoryAuthStore } from "./store.js";
import { adminUsers } from "../data/adminUsers.js";
import { SessionService } from "./sessionService.js";
import { AuthFlows } from "./flows.js";
import { createEmailSender } from "./email.js";
import { createAuthRouter } from "./router.js";
import { createOriginPolicy } from "./origins.js";

/** The real, Postgres-backed auth router, built from the environment. Throws at start-up if the auth settings are invalid. */
export function createDbAuthRouter(): { router: Router; cfg: AuthConfig } {
  if (!pool) throw new Error("createDbAuthRouter needs DATABASE_URL");
  const cfg = resolveAuthConfig();
  const store = new PgAuthStore(pool);
  const sessions = new SessionService(store, cfg);
  const mail = createEmailSender();
  const flows = new AuthFlows(store, sessions, mail, cfg);
  console.log(`[auth] mode=${cfg.refreshCookies ? "cookie (rotating refresh tokens)" : "legacy (single access token)"} email=${mail.name}`);
  return { router: createAuthRouter({ store, sessions, flows, cfg, isAllowedOrigin: createOriginPolicy() }), cfg };
}

/**
 * Auth without a database (local development only): same router and rules, backed by memory and seeded with the dev accounts
 * (see data/adminUsers.ts). Everything resets when the server restarts.
 */
export function createMemoryAuthRouter(): { router: Router; cfg: AuthConfig } {
  const cfg = resolveAuthConfig();
  const store = new MemoryAuthStore();
  for (const u of adminUsers) store.users.set(u.id, { id: u.id, username: u.username, passwordHash: u.passwordHash, role: u.role, name: u.name, email: u.email, emailVerified: true, lastLogin: null });
  const sessions = new SessionService(store, cfg);
  const mail = createEmailSender();
  console.log(`[auth] in-memory accounts. mode=${cfg.refreshCookies ? "cookie" : "legacy"} email=${mail.name}`);
  return { router: createAuthRouter({ store, sessions, flows: new AuthFlows(store, sessions, mail, cfg), cfg, isAllowedOrigin: createOriginPolicy() }), cfg };
}
