import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { newDb } from "pg-mem";
import { PgAuthStore, type UserRecord } from "./store.js";
import { SessionService } from "./sessionService.js";
import { resolveAuthConfig } from "./config.js";

/**
 * Runs the Postgres store against pg-mem (an in-memory Postgres engine) using the REAL auth section of db/schema.sql, so the SQL
 * is exercised here and not only in CI. pg-mem is not Postgres: the integration tests in CI (with a real database) remain the
 * final word, but this catches wrong column names, bad parameters and broken atomic updates immediately.
 */
const schema = fs.readFileSync(path.join(__dirname, "../db/schema.sql"), "utf8");
const authStart = schema.indexOf("-- ─── Authentication: refresh tokens");
const authSql = schema.slice(authStart, schema.indexOf("-- ─── Transport accounts", authStart));   // the auth section only

function freshPool() {
  const db = newDb();
  db.public.none(`CREATE TABLE users (
    id UUID PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL,
    email TEXT NOT NULL, last_login TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  // pg-mem has no ADD COLUMN IF NOT EXISTS; the migration's effect on a fresh table is the column itself.
  db.public.none("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT true");
  db.public.none(authSql.replace(/ALTER TABLE users ADD COLUMN IF NOT EXISTS[^;]*;/, ""));
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

describe("PgAuthStore (pg-mem, real schema)", () => {
  let store: PgAuthStore, user: UserRecord;
  beforeEach(async () => {
    store = new PgAuthStore(freshPool());
    user = await store.createUser({ username: "alice", passwordHash: "h", role: "customer", name: "Alice", email: "Alice@Example.test", emailVerified: false });
  });

  it("creates and finds users (case-insensitive email), tracks verification and last login", async () => {
    expect(user.emailVerified).toBe(false);
    expect((await store.findUserByUsername("alice"))?.id).toBe(user.id);
    expect((await store.findUserByEmail("alice@example.TEST"))?.id).toBe(user.id);
    expect(await store.usernameOrEmailTaken("zed", "ALICE@example.test")).toBe(true);
    expect(await store.usernameOrEmailTaken("zed", "zed@example.test")).toBe(false);
    await store.setEmailVerified(user.id);
    await store.touchLastLogin(user.id, new Date("2026-10-02T10:00:00Z"));
    const u = await store.findUserById(user.id);
    expect(u?.emailVerified).toBe(true);
    expect(u?.lastLogin?.toISOString()).toBe("2026-10-02T10:00:00.000Z");
  });

  it("runs the full session lifecycle on Postgres: rotate, theft revokes the chain, logout", async () => {
    let clock = new Date("2026-10-02T10:00:00Z");
    const svc = new SessionService(store, resolveAuthConfig({ AUTH_REFRESH_COOKIES: "true" } as unknown as NodeJS.ProcessEnv), () => clock);
    const a = await svc.start(user);
    const b = await svc.refresh(a.refreshToken!);
    clock = new Date(clock.getTime() + 60_000);
    await expect(svc.refresh(a.refreshToken!)).rejects.toMatchObject({ reason: "reuse_detected" });
    await expect(svc.refresh(b.refreshToken!)).rejects.toBeDefined();   // the legitimate holder of the newest token is signed out too
    const c = await svc.start(user);
    await svc.logout(c.refreshToken);
    await expect(svc.refresh(c.refreshToken!)).rejects.toBeDefined();
  });

  it("markRotated is atomic: only one of two simultaneous rotations wins", async () => {
    const svc = new SessionService(store, resolveAuthConfig({ AUTH_REFRESH_COOKIES: "true" } as unknown as NodeJS.ProcessEnv));
    const a = await svc.start(user);
    const results = await Promise.allSettled([svc.refresh(a.refreshToken!), svc.refresh(a.refreshToken!), svc.refresh(a.refreshToken!)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("emailed tokens are single-use, purpose-bound and expire", async () => {
    const at = new Date("2026-10-02T10:00:00Z"), later = new Date(at.getTime() + 2 * 3600_000);
    await store.insertEmailToken({ id: crypto.randomUUID(), userId: user.id, purpose: "reset", tokenHash: "h1", expiresAt: new Date(at.getTime() + 3600_000), createdAt: at });
    expect(await store.consumeEmailToken("h1", "verify", at)).toBeNull();            // wrong purpose
    expect(await store.consumeEmailToken("h1", "reset", later)).toBeNull();          // expired
    expect(await store.consumeEmailToken("h1", "reset", at)).toBe(user.id);
    expect(await store.consumeEmailToken("h1", "reset", at)).toBeNull();             // already used
    await store.insertEmailToken({ id: crypto.randomUUID(), userId: user.id, purpose: "reset", tokenHash: "h2", expiresAt: later, createdAt: at });
    await store.invalidateEmailTokens(user.id, "reset", at);
    expect(await store.consumeEmailToken("h2", "reset", at)).toBeNull();
  });

  it("password change and the cascade on user delete", async () => {
    await store.setPasswordHash(user.id, "new-hash");
    expect((await store.findUserById(user.id))?.passwordHash).toBe("new-hash");
  });
});
