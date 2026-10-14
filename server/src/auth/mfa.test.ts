import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { resolveAuthConfig } from "./config.js";
import { MemoryAuthStore } from "./store.js";
import { SessionService } from "./sessionService.js";
import { AuthFlows } from "./flows.js";
import { ConsoleEmail } from "./email.js";
import { createAuthRouter } from "./router.js";
import { createOriginPolicy } from "./origins.js";
import { createFieldCrypto } from "../portal/fieldCrypto.js";
import { base32Decode, base32Encode, codeAt, newSecret, verifyTotp } from "./totp.js";
import { LOCKOUT } from "./mfa.js";

const env = (o: Record<string, string> = {}) => o as unknown as NodeJS.ProcessEnv;
const PASSWORD = "correct-horse-battery";

describe("TOTP (RFC 6238)", () => {
  // the RFC's own test vector: secret "12345678901234567890", time 59 s -> 94287082, so 6 digits is 287082
  const rfc = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC 6238 test vectors", () => {
    expect(codeAt(rfc, Math.floor(59 / 30))).toBe("287082");
    expect(codeAt(rfc, Math.floor(1111111109 / 30))).toBe("081804");
    expect(codeAt(rfc, Math.floor(20000000000 / 30))).toBe("353130");
  });
  it("round-trips base32", () => { const b = Buffer.from("hello vink"); expect(base32Decode(base32Encode(b)).equals(b)).toBe(true); });
  it("accepts one step of clock drift, rejects further, and never a step already used", () => {
    const s = newSecret(), now = 1_700_000_000_000, step = Math.floor(now / 30000);
    expect(verifyTotp(s, codeAt(s, step), now)).toBe(step);
    expect(verifyTotp(s, codeAt(s, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(s, codeAt(s, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(s, codeAt(s, step - 2), now)).toBeNull();
    expect(verifyTotp(s, codeAt(s, step), now, step)).toBeNull();
    expect(verifyTotp(s, "12345", now)).toBeNull();
    expect(verifyTotp(s, "abcdef", now)).toBeNull();
  });
});

describe("sign-in lockout and the second factor", () => {
  let server: Server, base: string, store: MemoryAuthStore, clock: Date, userId: string;
  const crypto = createFieldCrypto(env(), "test-secret");

  async function boot(requireStaffMfa: boolean, role = "customer") {
    const cfg = resolveAuthConfig(env({})), sessions = new SessionService(store, cfg);
    const flows = new AuthFlows(store, sessions, new ConsoleEmail(), cfg, undefined, () => {});
    const app = express(); app.use(express.json());
    app.use("/api/auth", createAuthRouter({ store, sessions, flows, cfg, isAllowedOrigin: createOriginPolicy(env({})), crypto, requireStaffMfa, now: () => clock }));
    server = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
    userId = (await store.createUser({ username: "sam", passwordHash: await bcrypt.hash(PASSWORD, 4), role, name: "Sam", email: "sam@example.test", emailVerified: true })).id;
  }
  const post = async (path: string, body: unknown, token?: string) => {
    const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };   // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const login = (password = PASSWORD, code?: string) => post("/login", { username: "sam", password, ...(code ? { code } : {}) });
  const stepNow = () => Math.floor(clock.getTime() / 30000);

  beforeEach(() => { store = new MemoryAuthStore(); clock = new Date("2026-10-14T10:00:00Z"); });
  afterEach(() => server.close());

  it("locks the account after repeated wrong passwords, tells the user, and unlocks later", async () => {
    await boot(false);
    for (let i = 1; i < LOCKOUT.maxFailures; i++) expect((await login("wrong-password")).status).toBe(401);
    const last = await login("wrong-password");
    expect(last.status).toBe(423); expect(last.body.code).toBe("locked");
    const withRight = await login();                       // even the right password is refused while locked
    expect(withRight.status).toBe(423); expect(withRight.body.error).toMatch(/minute/);
    clock = new Date(clock.getTime() + (LOCKOUT.lockMinutes + 1) * 60_000);
    expect((await login()).status).toBe(200);
  });

  it("a good sign-in resets the count, so scattered mistakes do not lock", async () => {
    await boot(false);
    for (let round = 0; round < 3; round++) { for (let i = 0; i < LOCKOUT.maxFailures - 1; i++) await login("nope-nope-nope"); expect((await login()).status).toBe(200); }
  });

  it("an unknown username is just refused (nothing to lock)", async () => {
    await boot(false);
    for (let i = 0; i < 8; i++) expect((await post("/login", { username: "ghost", password: "whatever-whatever" })).status).toBe(401);
  });

  async function enrol(): Promise<{ token: string; secret: string; recovery: string[] }> {
    const token = (await login()).body.token as string;
    const setup = await post("/mfa/setup", {}, token);
    expect(setup.status).toBe(200); expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/VINK:/);
    const secret = setup.body.secret as string;
    expect((await post("/mfa/enable", { code: "000000" }, token)).status).toBe(400);
    const on = await post("/mfa/enable", { code: codeAt(secret, stepNow()) }, token);
    expect(on.status).toBe(200); expect(on.body.recoveryCodes).toHaveLength(10);
    return { token, secret, recovery: on.body.recoveryCodes };
  }

  it("with the second factor on, a password alone is not enough", async () => {
    await boot(false);
    const { secret } = await enrol();
    clock = new Date(clock.getTime() + 60_000);                       // move on, as the enrolment code is spent
    const noCode = await login();
    expect(noCode.status).toBe(401); expect(noCode.body.code).toBe("mfa_required");
    expect((await login(PASSWORD, "123456")).body.code).toBe("mfa_invalid");
    const good = await login(PASSWORD, codeAt(secret, stepNow()));
    expect(good.status).toBe(200); expect(good.body.user.mfaEnabled).toBe(true);
    expect((await login(PASSWORD, codeAt(secret, stepNow()))).body.code).toBe("mfa_invalid");   // the same code cannot be used twice
  });

  it("wrong codes count toward the lock too", async () => {
    await boot(false);
    await enrol();
    clock = new Date(clock.getTime() + 60_000);
    let last = 0; for (let i = 0; i < LOCKOUT.maxFailures; i++) last = (await login(PASSWORD, "111111")).status;
    expect(last).toBe(423);
  });

  it("a recovery code signs in once and then is spent", async () => {
    await boot(false);
    const { recovery } = await enrol();
    expect((await login(PASSWORD, recovery[0])).status).toBe(200);
    expect((await login(PASSWORD, recovery[0])).status).toBe(401);
    expect((await login(PASSWORD, recovery[1])).status).toBe(200);
  });

  it("stores the secret encrypted and the recovery codes only as hashes", async () => {
    await boot(false);
    const { secret, recovery } = await enrol();
    const u = (await store.findUserById(userId))!;
    expect(u.mfaSecretEnc).toMatch(/^v1\./); expect(u.mfaSecretEnc).not.toContain(secret);
    expect(JSON.stringify(u.mfaRecovery)).not.toContain(recovery[0]);
  });

  it("turning it off needs the password and a code", async () => {
    await boot(false);
    const { token, secret } = await enrol();
    clock = new Date(clock.getTime() + 60_000);
    expect((await post("/mfa/disable", { password: "wrong-password", code: codeAt(secret, stepNow()) }, token)).status).toBe(401);
    expect((await post("/mfa/disable", { password: PASSWORD, code: "000000" }, token)).status).toBe(400);
    expect((await post("/mfa/disable", { password: PASSWORD, code: codeAt(secret, stepNow()) }, token)).status).toBe(200);
    expect((await login()).status).toBe(200);
  });

  it("flags staff without a second factor when it is required, and does not let them turn it off", async () => {
    await boot(true, "superadmin");
    const first = await login();
    expect(first.status).toBe(200); expect(first.body.mfaEnrollRequired).toBe(true);
    const setup = await post("/mfa/setup", {}, first.body.token);
    await post("/mfa/enable", { code: codeAt(setup.body.secret, stepNow()) }, first.body.token);
    clock = new Date(clock.getTime() + 60_000);
    const second = await login(PASSWORD, codeAt(setup.body.secret, stepNow()));
    expect(second.body.mfaEnrollRequired).toBeUndefined();
    clock = new Date(clock.getTime() + 60_000);
    const off = await post("/mfa/disable", { password: PASSWORD, code: codeAt(setup.body.secret, stepNow()) }, second.body.token);
    expect(off.status).toBe(403); expect(off.body.code).toBe("mfa_required_for_staff");
  });
});
