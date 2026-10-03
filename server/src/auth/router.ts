import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import type { AuthConfig } from "./config.js";
import type { AuthStore, UserRecord } from "./store.js";
import { SessionService, RefreshError, type IssuedSession } from "./sessionService.js";
import { AuthFlows, FlowError } from "./flows.js";
import { clearRefreshCookie, readCookie, requireCsrf, setRefreshCookie } from "./cookies.js";
import { passwordProblem } from "./password.js";
import { requireAuth } from "../middleware/auth.js";
import { BCRYPT_ROUNDS } from "../config/secrets.js";

export interface AuthRouterDeps {
  store: AuthStore;
  sessions: SessionService;
  flows: AuthFlows;
  cfg: AuthConfig;
  isAllowedOrigin: (origin: string | undefined) => boolean;
}

const publicUser = (u: UserRecord) => ({ id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, emailVerified: u.emailVerified });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const USERNAME = /^[A-Za-z0-9._-]{3,40}$/;
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

/** Express 4 does not catch errors thrown in async handlers; this hands them to the error middleware instead of crashing. */
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

let dummyHash: string | undefined;   // compared against when the user does not exist, so timing does not reveal valid usernames

export function createAuthRouter({ store, sessions, flows, cfg, isAllowedOrigin }: AuthRouterDeps): Router {
  const router = Router();
  const csrf = requireCsrf(cfg, isAllowedOrigin);
  const meta = (req: Request) => ({ userAgent: req.headers["user-agent"], ip: req.ip });
  const fail = (res: Response, status: number, error: string, code?: string) => res.status(status).json({ success: false, error, ...(code ? { code } : {}) });

  /** Sends the session to the browser: the access token in the body, the refresh token only as an httpOnly cookie. */
  const respond = (res: Response, status: number, s: IssuedSession, user: UserRecord) => {
    if (s.refreshToken && s.refreshExpiresAt) setRefreshCookie(res, cfg, s.refreshToken, s.refreshExpiresAt);
    res.status(status).json({
      success: true, token: s.accessToken, expiresIn: s.expiresIn, mode: cfg.refreshCookies ? "cookie" : "legacy",
      ...(s.csrfToken ? { csrfToken: s.csrfToken } : {}), user: publicUser(user),
    });
  };

  router.post("/login", h(async (req, res) => {
    const username = str(req.body?.username, 120), password = str(req.body?.password, 200);
    if (!username || !password) return fail(res, 400, "username and password required");
    const user = (await store.findUserByUsername(username)) ?? (username.includes("@") ? await store.findUserByEmail(username) : null);
    dummyHash ??= bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);
    const ok = await bcrypt.compare(password.trim(), user?.passwordHash ?? dummyHash);
    if (!user || !ok) return fail(res, 401, "Invalid credentials");
    await store.touchLastLogin(user.id, new Date());
    respond(res, 200, await sessions.start(user, meta(req)), user);
  }));

  router.post("/register", h(async (req, res) => {
    const { username, password, name, email } = req.body ?? {};
    if (!str(username, 40) || !str(password, 200) || !str(name, 120) || !str(email, 320)) return fail(res, 400, "username, password, name and email are required");
    if (!USERNAME.test(username)) return fail(res, 400, "username must be 3 to 40 letters, numbers, dots, dashes or underscores");
    if (!EMAIL.test(email)) return fail(res, 400, "email address is not valid");
    const problem = passwordProblem(password, { username, email });
    if (problem) return fail(res, 400, problem, "weak_password");
    if (await store.usernameOrEmailTaken(username, email)) return fail(res, 409, "An account with that username or email already exists");
    // Self-service accounts are customers or personal (passenger) accounts, or "seller". Driver, marshal, vehicle owner and association
    // accounts are never self-service: they are granted by an association or by staff.
    const role = req.body.role === "seller" ? "seller" : req.body.role === "personal" ? "personal" : "customer";
    const user = await store.createUser({ username, passwordHash: await bcrypt.hash(password.trim(), BCRYPT_ROUNDS), role, name: name.trim(), email: email.trim(), emailVerified: false });
    await flows.sendVerification(user);
    respond(res, 201, await sessions.start(user, meta(req)), user);
  }));

  /** Quietly restores a session on page load: a plain 401 (not an error page) when there is no cookie. */
  router.post("/refresh",
    (req, res, next) => {
      if (!cfg.refreshCookies) return fail(res, 404, "Refresh tokens are not enabled", "not_enabled");
      if (!readCookie(req, cfg.cookieName)) return fail(res, 401, "No session", "no_session");
      next();
    },
    csrf,
    h(async (req, res) => {
      try {
        const s = await sessions.refresh(readCookie(req, cfg.cookieName)!, meta(req));
        respond(res, 200, s, s.user);
      } catch (e) {
        if (!(e instanceof RefreshError)) throw e;
        if (e.reason === "in_progress") return fail(res, 409, "Another request is refreshing this session; retry", "in_progress");
        clearRefreshCookie(res, cfg);
        fail(res, 401, "Session expired", e.reason);
      }
    }),
  );

  /** Signs this browser out for real: the refresh chain is revoked server-side, not just forgotten by the page. */
  router.post("/logout",
    (req, res, next) => {
      if (readCookie(req, cfg.cookieName)) return next();
      res.json({ success: true, message: "Logged out" });      // nothing to revoke (legacy mode, or already signed out)
    },
    csrf,
    h(async (req, res) => {
      await sessions.logout(readCookie(req, cfg.cookieName));
      clearRefreshCookie(res, cfg);
      res.json({ success: true, message: "Logged out" });
    }),
  );

  router.get("/me", requireAuth, h(async (req, res) => {
    const u = await store.findUserById(req.user!.userId);
    if (!u) return fail(res, 404, "User not found");
    res.json({ success: true, data: { ...publicUser(u), lastLogin: u.lastLogin } });
  }));

  router.post("/change-password", requireAuth, h(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!str(currentPassword, 200) || !str(newPassword, 200)) return fail(res, 400, "currentPassword and newPassword are required");
    const user = await store.findUserById(req.user!.userId);
    if (!user || !(await bcrypt.compare(currentPassword.trim(), user.passwordHash))) return fail(res, 401, "Current password is incorrect");
    const problem = passwordProblem(newPassword, { username: user.username, email: user.email });
    if (problem) return fail(res, 400, problem, "weak_password");
    await store.setPasswordHash(user.id, await bcrypt.hash(newPassword.trim(), BCRYPT_ROUNDS));
    await sessions.logoutEverywhere(user.id);                       // every other device must sign in again with the new password
    respond(res, 200, await sessions.start(user, meta(req)), user);  // this device stays signed in
  }));

  /** Always the same answer, whether or not the address has an account. */
  router.post("/forgot-password", h(async (req, res) => {
    const email = str(req.body?.email, 320);
    if (!email || !EMAIL.test(email)) return fail(res, 400, "A valid email address is required");
    try { await flows.requestPasswordReset(email.trim()); } catch (e) { console.error("[auth] forgot-password failed:", (e as Error).message); }
    res.status(202).json({ success: true, message: "If that address has an account, we have emailed a link to reset the password." });
  }));

  router.post("/reset-password", h(async (req, res) => {
    const token = str(req.body?.token, 200), password = str(req.body?.password, 200);
    if (!token || !password) return fail(res, 400, "token and password are required");
    try {
      await flows.resetPassword(token, password);
      res.json({ success: true, message: "Password updated. Sign in with your new password." });
    } catch (e) {
      if (e instanceof FlowError) return fail(res, 400, e.message, e.code);
      throw e;
    }
  }));

  router.post("/verify-email", h(async (req, res) => {
    const token = str(req.body?.token, 200);
    if (!token) return fail(res, 400, "token is required");
    try { await flows.verifyEmail(token); res.json({ success: true, message: "Email confirmed." }); }
    catch (e) { if (e instanceof FlowError) return fail(res, 400, e.message, e.code); throw e; }
  }));

  router.post("/resend-verification", requireAuth, h(async (req, res) => {
    const user = await store.findUserById(req.user!.userId);
    if (user) await flows.sendVerification(user);
    res.status(202).json({ success: true, message: user?.emailVerified ? "Already confirmed." : "Confirmation email sent." });
  }));

  return router;
}
