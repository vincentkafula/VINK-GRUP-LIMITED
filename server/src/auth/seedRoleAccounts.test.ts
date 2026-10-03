import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { readSeedAccounts, seedRoleAccounts, seedEnabled, type Queryable } from "./seedRoleAccounts.js";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const ALL = env({
  SEED_PERSONAL_EMAIL: "P@x.test", SEED_PERSONAL_PASSWORD: "personal-password-1",
  SEED_DRIVER_EMAIL: "d@x.test", SEED_DRIVER_PASSWORD: "driver-password-12",
  SEED_MARSHAL_EMAIL: "m@x.test", SEED_MARSHAL_PASSWORD: "marshal-password-1",
  SEED_OWNER_EMAIL: "o@x.test", SEED_OWNER_PASSWORD: "owner-password-123",
  SEED_ASSOCIATION_EMAIL: "a@x.test", SEED_ASSOCIATION_PASSWORD: "assoc-password-12",
});

/** A tiny in-memory stand-in for the users table. */
function fakeDb() {
  const users: { id: number; username: string; password_hash: string; role: string; email: string }[] = [];
  const db: Queryable = {
    async query(sql, p = []) {
      if (sql.startsWith("SELECT")) return { rows: users.filter((u) => u.email.toLowerCase() === p[0] || u.username === p[0]).map((u) => ({ ...u })) };
      if (sql.startsWith("INSERT")) { users.push({ id: users.length + 1, username: String(p[0]), password_hash: String(p[1]), role: String(p[2]), email: String(p[0]) }); return { rows: [] }; }
      if (sql.startsWith("UPDATE")) { users.find((u) => u.id === p[0])!.password_hash = String(p[1]); return { rows: [] }; }
      throw new Error("unexpected " + sql);
    },
  };
  return { db, users };
}
const quiet = () => {};

describe("role test accounts", () => {
  it("reads all five from the environment, lower-casing the email", () => {
    const a = readSeedAccounts(ALL, quiet);
    expect(a.map((x) => x.role)).toEqual(["personal", "driver", "marshal", "vehicle_owner", "association"]);
    expect(a[0].email).toBe("p@x.test");
  });

  it("is off in production unless SEED_ENABLED=true", () => {
    expect(seedEnabled(env({ NODE_ENV: "production" }))).toBe(false);
    expect(readSeedAccounts(env({ NODE_ENV: "production", ...ALL }), quiet)).toEqual([]);
    expect(seedEnabled(env({ NODE_ENV: "production", SEED_ENABLED: "true" }))).toBe(true);
    expect(readSeedAccounts(env({ NODE_ENV: "production", SEED_ENABLED: "true", ...ALL }), quiet)).toHaveLength(5);
  });

  it("skips and says so when a variable is missing, the email is invalid or the password is weak", () => {
    const warns: string[] = [];
    const a = readSeedAccounts(env({ SEED_DRIVER_EMAIL: "d@x.test", SEED_MARSHAL_EMAIL: "nope", SEED_MARSHAL_PASSWORD: "marshal-password-1", SEED_OWNER_EMAIL: "o@x.test", SEED_OWNER_PASSWORD: "short" }), (m) => warns.push(m));
    expect(a).toEqual([]);
    expect(warns).toHaveLength(3);
    expect(warns.join()).not.toContain("short");
  });

  it("creates the accounts with hashed passwords, and is idempotent", async () => {
    const { db, users } = fakeDb();
    await seedRoleAccounts(db, ALL, quiet); await seedRoleAccounts(db, ALL, quiet);
    expect(users).toHaveLength(5);
    expect(users.find((u) => u.role === "driver")!.password_hash).not.toContain("driver-password");
    expect(await bcrypt.compare("driver-password-12", users.find((u) => u.role === "driver")!.password_hash)).toBe(true);
  });

  it("updates the password when the variable changes, and never logs it", async () => {
    const { db, users } = fakeDb(); const logs: string[] = [];
    await seedRoleAccounts(db, ALL, (m) => logs.push(m));
    await seedRoleAccounts(db, env({ ...ALL, SEED_DRIVER_PASSWORD: "a-brand-new-driver-pw" }), (m) => logs.push(m));
    expect(await bcrypt.compare("a-brand-new-driver-pw", users.find((u) => u.role === "driver")!.password_hash)).toBe(true);
    expect(logs.join("\n")).not.toMatch(/password-1|brand-new/);
  });

  it("never repurposes an existing account that has a different role", async () => {
    const { db, users } = fakeDb();
    users.push({ id: 99, username: "d@x.test", password_hash: "keep", role: "customer", email: "d@x.test" });
    await seedRoleAccounts(db, ALL, quiet);
    expect(users.find((u) => u.id === 99)).toMatchObject({ role: "customer", password_hash: "keep" });
  });
});
