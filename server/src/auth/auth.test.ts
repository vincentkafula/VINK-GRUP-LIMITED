import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import bcrypt from "bcryptjs";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { resolveAuthConfig } from "./config.js";
import { MemoryAuthStore, type UserRecord } from "./store.js";
import { SessionService, RefreshError } from "./sessionService.js";
import { AuthFlows } from "./flows.js";
import { ConsoleEmail } from "./email.js";
import { createAuthRouter } from "./router.js";
import { createOriginPolicy } from "./origins.js";
import { hashToken, csrfFor } from "./tokens.js";

const env = (o: Record<string, string> = {}) => o as unknown as NodeJS.ProcessEnv;
const COOKIE_MODE = env({ AUTH_REFRESH_COOKIES: "true", FRONTEND_URL: "https://www.example.test" });
const PASSWORD = "correct-horse-battery";

async function seedUser(store: MemoryAuthStore, over: Partial<UserRecord> = {}) {
  return store.createUser({ username: "alice", passwordHash: await bcrypt.hash(PASSWORD, 4), role: "customer", name: "Alice A", email: "alice@example.test", emailVerified: true, ...over });
}

/* ───────────────────────── session service ───────────────────────── */

describe("SessionService", () => {
  let store: MemoryAuthStore, clock: Date, svc: SessionService, user: UserRecord;
  const cfg = resolveAuthConfig(COOKIE_MODE);
  beforeEach(async () => {
    store = new MemoryAuthStore(); clock = new Date("2026-10-02T10:00:00Z");
    svc = new SessionService(store, cfg, () => clock);
    user = await seedUser(store);
  });
  const tick = (s: number) => { clock = new Date(clock.getTime() + s * 1000); };

  it("legacy mode issues one long access token and no refresh token", async () => {
    const legacy = new SessionService(store, resolveAuthConfig(env()), () => clock);
    const s = await legacy.start(user);
    expect(s.expiresIn).toBe(8 * 3600);
    expect(s.refreshToken).toBeUndefined();
  });

  it("cookie mode issues a short access token, a refresh token and a CSRF token", async () => {
    const s = await svc.start(user);
    expect(s.expiresIn).toBe(900);
    expect(s.refreshToken).toBeTruthy();
    expect(s.csrfToken).toBe(csrfFor(s.refreshToken!));
    expect(s.refreshExpiresAt!.getTime() - clock.getTime()).toBe(30 * 86400 * 1000);
  });

  it("stores only a hash of the refresh token", async () => {
    const s = await svc.start(user);
    const stored = [...store.refresh.values()][0];
    expect(stored.tokenHash).toBe(hashToken(s.refreshToken!));
    expect(JSON.stringify([...store.refresh.values()])).not.toContain(s.refreshToken!);
  });

  it("rotates: each refresh returns a new token and retires the old one", async () => {
    const a = await svc.start(user);
    tick(60);
    const b = await svc.refresh(a.refreshToken!);
    expect(b.refreshToken).not.toBe(a.refreshToken);
    expect(b.user.id).toBe(user.id);
    expect((await svc.refresh(b.refreshToken!)).refreshToken).toBeTruthy();
  });

  it("an old token replayed after the grace window means theft: the whole chain is revoked", async () => {
    const a = await svc.start(user);
    const b = await svc.refresh(a.refreshToken!);
    tick(60);                                                       // well past the 10 second grace
    await expect(svc.refresh(a.refreshToken!)).rejects.toMatchObject({ reason: "reuse_detected" });
    await expect(svc.refresh(b.refreshToken!)).rejects.toBeInstanceOf(RefreshError);   // the legitimate holder is signed out too
  });

  it("an old token replayed inside the grace window is a tab race, not theft: nothing is revoked", async () => {
    const a = await svc.start(user);
    const b = await svc.refresh(a.refreshToken!);
    tick(3);
    await expect(svc.refresh(a.refreshToken!)).rejects.toMatchObject({ reason: "in_progress" });
    expect((await svc.refresh(b.refreshToken!)).refreshToken).toBeTruthy();            // the winner's chain still works
  });

  it("two simultaneous refreshes with the same token: exactly one wins, the winner's chain survives", async () => {
    const a = await svc.start(user);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => svc.refresh(a.refreshToken!)));
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<SessionService["refresh"]>>>[];
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.reason === "in_progress")).toBe(true);
    expect((await svc.refresh(ok[0].value.refreshToken!)).refreshToken).toBeTruthy();
  });

  it("rejects unknown and expired tokens", async () => {
    await expect(svc.refresh("nonsense")).rejects.toMatchObject({ reason: "invalid" });
    const a = await svc.start(user);
    tick(31 * 86400);
    await expect(svc.refresh(a.refreshToken!)).rejects.toMatchObject({ reason: "expired" });
  });

  it("logout revokes the chain; logoutEverywhere revokes every device", async () => {
    const a = await svc.start(user), other = await svc.start(user);
    await svc.logout(a.refreshToken);
    await expect(svc.refresh(a.refreshToken!)).rejects.toBeInstanceOf(RefreshError);
    expect((await svc.refresh(other.refreshToken!)).refreshToken).toBeTruthy();
    const c = await svc.start(user), d = await svc.start(user);
    await svc.logoutEverywhere(user.id);
    for (const t of [c, d]) await expect(svc.refresh(t.refreshToken!)).rejects.toBeInstanceOf(RefreshError);
  });

  it("a deleted user cannot refresh", async () => {
    const a = await svc.start(user);
    store.users.delete(user.id);
    await expect(svc.refresh(a.refreshToken!)).rejects.toMatchObject({ reason: "user_gone" });
  });
});

/* ───────────────────────── HTTP ───────────────────────── */

interface Booted { base: string; store: MemoryAuthStore; mail: ConsoleEmail; close: () => void }
async function boot(e: NodeJS.ProcessEnv): Promise<Booted> {
  const cfg = resolveAuthConfig(e), store = new MemoryAuthStore(), mail = new ConsoleEmail();
  const sessions = new SessionService(store, cfg);
  const flows = new AuthFlows(store, sessions, mail, cfg, undefined, () => {});
  const policy = createOriginPolicy(env({ ALLOWED_ORIGINS: "https://www.example.test", FRONTEND_URL: "https://www.example.test" }));
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({ store, sessions, flows, cfg, isAllowedOrigin: policy }));
  const server: Server = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  await seedUser(store);
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`, store, mail, close: () => server.close() };
}

/** A minimal cookie jar: remembers Set-Cookie values and sends them back. */
function client(base: string) {
  const jar = new Map<string, string>();
  let setCookies: string[] = [];
  async function call(path: string, init: { body?: unknown; headers?: Record<string, string>; token?: string; method?: string } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers ?? {}) };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    const res = await fetch(base + path, { method: init.method ?? "POST", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    setCookies = res.headers.getSetCookie();
    for (const sc of setCookies) {
      const [pair] = sc.split(";"), i = pair.indexOf("="), name = pair.slice(0, i), value = pair.slice(i + 1);
      if (/Max-Age=0/i.test(sc) || value === "") jar.delete(name); else jar.set(name, decodeURIComponent(value));
    }
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any>, setCookies };   // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  return { call, jar, get lastSetCookies() { return setCookies; } };
}

describe("auth HTTP: legacy mode (default)", () => {
  let b: Booted;
  beforeEach(async () => { b = await boot(env()); });
  afterEach(() => b.close());

  it("logs in with a long token and no cookie, and the token works", async () => {
    const c = client(b.base);
    const r = await c.call("/login", { body: { username: "alice", password: PASSWORD } });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ success: true, mode: "legacy", expiresIn: 8 * 3600, user: { username: "alice", role: "customer" } });
    expect(r.setCookies).toHaveLength(0);
    expect(r.json.csrfToken).toBeUndefined();
    const me = await c.call("/me", { method: "GET", token: r.json.token });
    expect(me.json.data).toMatchObject({ username: "alice", emailVerified: true });
  });

  it("refresh is not available", async () => {
    expect((await client(b.base).call("/refresh")).status).toBe(404);
  });

  it("wrong password and unknown user give the same answer", async () => {
    const c = client(b.base);
    const a = await c.call("/login", { body: { username: "alice", password: "nope-nope-nope" } });
    const u = await c.call("/login", { body: { username: "nobody", password: "nope-nope-nope" } });
    expect([a.status, u.status]).toEqual([401, 401]);
    expect(a.json).toEqual(u.json);
  });
});

describe("auth HTTP: cookie mode", () => {
  let b: Booted;
  beforeEach(async () => { b = await boot(COOKIE_MODE); });
  afterEach(() => b.close());
  const login = async (c: ReturnType<typeof client>) => (await c.call("/login", { body: { username: "alice", password: PASSWORD } }));

  it("login sets an httpOnly SameSite cookie, keeps the refresh token out of the body, and returns a CSRF token", async () => {
    const c = client(b.base), r = await login(c);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ mode: "cookie", expiresIn: 900 });
    expect(JSON.stringify(r.json)).not.toContain("refreshToken");
    const cookie = r.setCookies[0];
    expect(cookie).toMatch(/^vink_rt=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(r.json.csrfToken).toBe(csrfFor(c.jar.get("vink_rt")!));
  });

  it("refresh with the cookie and CSRF token rotates the cookie and returns a new access token", async () => {
    const c = client(b.base), l = await login(c), old = c.jar.get("vink_rt")!;
    const r = await c.call("/refresh", { headers: { "x-csrf-token": l.json.csrfToken, origin: "https://www.example.test" } });
    expect(r.status).toBe(200);
    expect(r.json.token).toBeTruthy();
    expect(c.jar.get("vink_rt")).not.toBe(old);
    expect(r.json.csrfToken).toBe(csrfFor(c.jar.get("vink_rt")!));
  });

  it("refresh needs the CSRF token and an allowed origin", async () => {
    const c = client(b.base), l = await login(c);
    expect((await c.call("/refresh")).status).toBe(403);                                                                   // no token
    expect((await c.call("/refresh", { headers: { "x-csrf-token": "wrong" } })).json.code).toBe("csrf_token");
    expect((await c.call("/refresh", { headers: { "x-csrf-token": l.json.csrfToken, origin: "https://evil.example" } })).json.code).toBe("csrf_origin");
    expect((await c.call("/refresh", { headers: { "x-csrf-token": l.json.csrfToken } })).status).toBe(200);                 // the real client still works
  });

  it("with no cookie, refresh is a quiet 401", async () => {
    const r = await client(b.base).call("/refresh");
    expect(r.status).toBe(401);
    expect(r.json.code).toBe("no_session");
  });

  it("a stolen, already-used cookie signs everyone out", async () => {
    const c = client(b.base), l = await login(c), stolen = c.jar.get("vink_rt")!;
    const r1 = await c.call("/refresh", { headers: { "x-csrf-token": l.json.csrfToken } });
    expect(r1.status).toBe(200);
    // wait out the race window by rewinding the stored rotation time
    for (const t of b.store.refresh.values()) if (t.revokedAt) t.revokedAt = new Date(Date.now() - 60_000);
    const thief = client(b.base);
    thief.jar.set("vink_rt", stolen);
    const r2 = await thief.call("/refresh", { headers: { "x-csrf-token": csrfFor(stolen) } });
    expect(r2.status).toBe(401);
    expect(r2.json.code).toBe("reuse_detected");
    const r3 = await c.call("/refresh", { headers: { "x-csrf-token": r1.json.csrfToken } });       // the real user's newest token is dead too
    expect(r3.status).toBe(401);
  });

  it("logout revokes server-side: the old cookie cannot refresh any more", async () => {
    const c = client(b.base), l = await login(c), cookie = c.jar.get("vink_rt")!;
    const out = await c.call("/logout", { headers: { "x-csrf-token": l.json.csrfToken } });
    expect(out.status).toBe(200);
    expect(out.setCookies[0]).toMatch(/Max-Age=0/);
    const replay = client(b.base);
    replay.jar.set("vink_rt", cookie);
    expect((await replay.call("/refresh", { headers: { "x-csrf-token": csrfFor(cookie) } })).status).toBe(401);
  });

  it("logout cannot be forced by another site (needs the CSRF token)", async () => {
    const c = client(b.base);
    await login(c);
    expect((await c.call("/logout")).status).toBe(403);
    expect([...b.store.refresh.values()].every((t) => !t.revokedAt)).toBe(true);
  });

  it("changing the password signs out other devices but keeps this one signed in", async () => {
    const phone = client(b.base), laptop = client(b.base);
    const pl = await login(phone), ll = await login(laptop);
    const r = await laptop.call("/change-password", { token: ll.json.token, body: { currentPassword: PASSWORD, newPassword: "a-brand-new-passphrase" } });
    expect(r.status).toBe(200);
    expect((await phone.call("/refresh", { headers: { "x-csrf-token": pl.json.csrfToken } })).status).toBe(401);
    expect((await laptop.call("/refresh", { headers: { "x-csrf-token": r.json.csrfToken } })).status).toBe(200);
    expect((await client(b.base).call("/login", { body: { username: "alice", password: "a-brand-new-passphrase" } })).status).toBe(200);
  });
});

describe("auth HTTP: registration, email verification, password reset", () => {
  let b: Booted;
  beforeEach(async () => { b = await boot(COOKIE_MODE); });
  afterEach(() => b.close());
  const link = (re: RegExp) => { const m = re.exec(b.mail.sent.at(-1)?.text ?? ""); return m ? decodeURIComponent(m[1]) : ""; };
  const wait = () => new Promise((r) => setTimeout(r, 20));   // email is sent in the background

  it("a new account starts unverified, gets a confirmation email, and the link works exactly once", async () => {
    const c = client(b.base);
    const r = await c.call("/register", { body: { username: "bob", password: "bobs-long-passphrase", name: "Bob", email: "bob@example.test" } });
    expect(r.status).toBe(201);
    expect(r.json.user).toMatchObject({ role: "customer", emailVerified: false });
    await wait();
    expect(b.mail.sent.at(-1)).toMatchObject({ to: "bob@example.test", subject: "Confirm your email address" });
    const token = link(/verify-email\?token=([^\s]+)/);
    expect(token.length).toBeGreaterThan(20);
    expect((await c.call("/verify-email", { body: { token } })).status).toBe(200);
    expect((await c.call("/verify-email", { body: { token } })).status).toBe(400);
    expect((await b.store.findUserByUsername("bob"))?.emailVerified).toBe(true);
  });

  it("rejects weak passwords, duplicate accounts, bad emails and bad usernames", async () => {
    const c = client(b.base), ok = { username: "carol", password: "carols-long-passphrase", name: "Carol", email: "carol@example.test" };
    expect((await c.call("/register", { body: { ...ok, password: "short" } })).json.code).toBe("weak_password");
    expect((await c.call("/register", { body: { ...ok, password: "password1" } })).status).toBe(400);
    expect((await c.call("/register", { body: { ...ok, email: "not-an-email" } })).status).toBe(400);
    expect((await c.call("/register", { body: { ...ok, username: "a b" } })).status).toBe(400);
    expect((await c.call("/register", { body: { ...ok, username: "alice" } })).status).toBe(409);
    expect((await c.call("/register", { body: { ...ok, email: "ALICE@example.test" } })).status).toBe(409);
    expect((await c.call("/register", { body: ok })).status).toBe(201);
  });

  it("registering cannot create a staff role", async () => {
    const r = await client(b.base).call("/register", { body: { username: "mallory", password: "mallorys-long-passphrase", name: "M", email: "m@example.test", role: "owner" } });
    expect(r.json.user.role).toBe("customer");
  });

  it("forgot-password answers identically for known and unknown addresses (no account enumeration)", async () => {
    const c = client(b.base);
    const known = await c.call("/forgot-password", { body: { email: "alice@example.test" } });
    const unknown = await c.call("/forgot-password", { body: { email: "nobody@example.test" } });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.json).toEqual(unknown.json);
    await wait();
    expect(b.mail.sent).toHaveLength(1);
    expect(b.mail.sent[0].to).toBe("alice@example.test");
  });

  it("reset: link sets a new password once, ends every session, and a weak password does not burn the link", async () => {
    const c = client(b.base), sess = client(b.base);
    const l = await sess.call("/login", { body: { username: "alice", password: PASSWORD } });
    await c.call("/forgot-password", { body: { email: "alice@example.test" } });
    await wait();
    const token = link(/reset-password\?token=([^\s]+)/);
    expect((await c.call("/reset-password", { body: { token, password: "short" } })).json.code).toBe("weak_password");   // link still valid
    expect((await c.call("/reset-password", { body: { token, password: "my-new-strong-passphrase" } })).status).toBe(200);
    expect((await c.call("/reset-password", { body: { token, password: "another-strong-passphrase" } })).status).toBe(400);   // single use
    expect((await sess.call("/refresh", { headers: { "x-csrf-token": l.json.csrfToken } })).status).toBe(401);                 // old session is dead
    expect((await c.call("/login", { body: { username: "alice", password: PASSWORD } })).status).toBe(401);
    expect((await c.call("/login", { body: { username: "alice", password: "my-new-strong-passphrase" } })).status).toBe(200);
  });

  it("a newer reset link replaces the older one; expired and made-up links fail", async () => {
    const c = client(b.base);
    await c.call("/forgot-password", { body: { email: "alice@example.test" } }); await wait();
    const first = link(/reset-password\?token=([^\s]+)/);
    await c.call("/forgot-password", { body: { email: "alice@example.test" } }); await wait();
    const second = link(/reset-password\?token=([^\s]+)/);
    expect((await c.call("/reset-password", { body: { token: first, password: "a-valid-new-passphrase" } })).status).toBe(400);
    expect((await c.call("/reset-password", { body: { token: "made-up", password: "a-valid-new-passphrase" } })).status).toBe(400);
    for (const t of b.store.emailTokens.values()) t.expiresAt = new Date(Date.now() - 1000);
    expect((await c.call("/reset-password", { body: { token: second, password: "a-valid-new-passphrase" } })).status).toBe(400);
  });

  it("an email provider failure never changes the response or leaks anything", async () => {
    const failing = { name: "x", send: async () => { throw new Error("provider down"); } };
    const cfg = resolveAuthConfig(COOKIE_MODE), store = new MemoryAuthStore(), sessions = new SessionService(store, cfg);
    await seedUser(store);
    const logged: string[] = [];
    const flows = new AuthFlows(store, sessions, failing, cfg, undefined, (m) => logged.push(m));
    await expect(flows.requestPasswordReset("alice@example.test")).resolves.toBeUndefined();
    await wait();
    expect(logged.join()).toContain("provider down");
  });
});

describe("origin policy", () => {
  it("allows only listed origins; the Railway wildcard is off unless explicitly enabled", () => {
    const base = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://app.example.test" };
    const strict = createOriginPolicy(env(base));
    expect(strict("https://www.vink.co.za")).toBe(true);
    expect(strict("https://app.example.test")).toBe(true);
    expect(strict("https://attacker.up.railway.app")).toBe(false);
    expect(strict("https://evil.example")).toBe(false);
    expect(strict(undefined)).toBe(true);
    expect(createOriginPolicy(env({ ...base, ALLOW_RAILWAY_PREVIEW_ORIGINS: "true" }))("https://attacker.up.railway.app")).toBe(true);
  });
});

describe("auth configuration", () => {
  it("defaults to legacy mode", () => expect(resolveAuthConfig(env()).refreshCookies).toBe(false));
  it("cookie mode in production needs an https FRONTEND_URL, and uses the __Secure- cookie name", () => {
    expect(() => resolveAuthConfig(env({ NODE_ENV: "production", AUTH_REFRESH_COOKIES: "true" }))).toThrow(/FRONTEND_URL/);
    const c = resolveAuthConfig(env({ NODE_ENV: "production", AUTH_REFRESH_COOKIES: "true", FRONTEND_URL: "https://www.vink.co.za/" }));
    expect(c).toMatchObject({ cookieName: "__Secure-vink_rt", cookieSecure: true, frontendUrl: "https://www.vink.co.za" });
  });
  it("rejects nonsense", () => {
    expect(() => resolveAuthConfig(env({ AUTH_COOKIE_SAMESITE: "maybe" }))).toThrow();
    expect(() => resolveAuthConfig(env({ AUTH_COOKIE_SAMESITE: "none" }))).toThrow(/production/);
    expect(() => resolveAuthConfig(env({ AUTH_REFRESH_COOKIES: "true", AUTH_ACCESS_TTL_SECONDS: "5" }))).toThrow();
  });
});
