import { describe, it, expect, vi } from "vitest";
import { resolveJwtSecret, seedPassword, KNOWN_DEV_JWT_SECRET } from "./secrets.js";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("resolveJwtSecret", () => {
  it("refuses to start in production without a secret", () => {
    expect(() => resolveJwtSecret(env({ NODE_ENV: "production" }))).toThrow(/not set/);
    expect(() => resolveJwtSecret(env({ NODE_ENV: "production", JWT_SECRET: "  " }))).toThrow(/not set/);
  });
  it("refuses the old public default in production", () => {
    expect(() => resolveJwtSecret(env({ NODE_ENV: "production", JWT_SECRET: KNOWN_DEV_JWT_SECRET }))).toThrow(/public default/);
  });
  it("accepts a real secret, warning if it is short", () => {
    const warn = vi.fn();
    expect(resolveJwtSecret(env({ NODE_ENV: "production", JWT_SECRET: "x".repeat(64) }), warn)).toBe("x".repeat(64));
    expect(warn).not.toHaveBeenCalled();
    resolveJwtSecret(env({ NODE_ENV: "production", JWT_SECRET: "short-secret" }), warn);
    expect(warn).toHaveBeenCalled();
  });
  it("outside production uses the env value or a fresh random key, never the public default", () => {
    const warn = vi.fn();
    expect(resolveJwtSecret(env({ JWT_SECRET: "from-env" }), warn)).toBe("from-env");
    const a = resolveJwtSecret(env({}), warn), b = resolveJwtSecret(env({}), warn);
    expect(a).not.toBe(KNOWN_DEV_JWT_SECRET);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(64);
  });
});

describe("seedPassword", () => {
  it("uses SEED_PASSWORD_<NAME> when given", () => {
    expect(seedPassword("admin", env({ SEED_PASSWORD_ADMIN: "a-long-enough-pass" }))).toBe("a-long-enough-pass");
  });
  it("rejects short passwords", () => {
    expect(() => seedPassword("admin", env({ SEED_PASSWORD_ADMIN: "short" }))).toThrow(/12 characters/);
  });
  it("creates no account with a guessable password in production", () => {
    expect(seedPassword("CUSTOMER1", env({ NODE_ENV: "production" }))).toBeNull();
  });
  it("outside production makes a random password once and prints it", () => {
    const log = vi.fn();
    const p = seedPassword("NOC1", env({}), log);
    expect(p).toBeTruthy();
    expect(seedPassword("NOC1", env({}), log)).toBe(p);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
