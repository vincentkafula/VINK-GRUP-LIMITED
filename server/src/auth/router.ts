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
import { createFieldCrypto, CryptoUnavailable, type FieldCrypto } from "../portal/fieldCrypto.js";
import { newSecret, newRecoveryCodes, otpauthUri, verifyTotp } from "./totp.js";
import { LOCKOUT, hashRecovery, isLocked, isStaff, staffMfaRequired } from "./mfa.js";

export interface AuthRouterDeps {
  store: AuthStore;
  sessions: SessionService;
  flows: AuthFlows;
  cfg: AuthConfig;
  isAllowedOrigin: (origin: string | undefined) => boolean;
  /** Encrypts second-factor secrets. Defaults to the platform's field encryption (DATA_ENCRYPTION_KEY). */
  crypto?: FieldCrypto;
  /** Staff must have a second factor; defaults to AUTH_REQUIRE_STAFF_MFA=true. */
  requireStaffMfa?: boolean;
  now?: () => Date;
}

const publicUser = (u: UserRecord) => ({ id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, emailVerified: u.emailVerified, mfaEnabled: u.mfaEnabled === true });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const USERNAME = /^[A-Za-z0-9._-]{3,40}$/;
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

/** Express 4 does not catch errors thrown in async handlers; this hands them to the error middleware instead of crashing. */
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

let dummyHash: string | undefined;   // compared against when the user does not exist, so timing does not reveal valid usernames

export function createAuthRouter({ store, sessions, flows, cfg, isAllowedOrigin, crypto = createFieldCrypto(process.env, process.env.JWT_SECRET ?? "vink-dev-auth"), requireStaffMfa = staffMfaRequired(), now = () => new Date() }: AuthRouterDeps): Router {
  const router = Router();
  const csrf = requireCsrf(cfg, isAllowedOrigin);
  const meta = (req: Request) => ({ userAgent: req.headers["user-agent"], ip: req.ip });
  const fail = (res: Response, status: number, error: string, code?: string) => res.status(status).json({ success: false, error, ...(code ? { code } : {}) });

  /** Sends the session to the browser: the access token in the body, the refresh token only as an httpOnly cookie. */
  const respond = (res: Response, status: number, s: IssuedSession, user: UserRecord, extra: Record<string, unknown> = {}) => {
    if (s.refreshToken && s.refreshExpiresAt) setRefreshCookie(res, cfg, s.refreshToken, s.refreshExpiresAt);
    res.status(status).json({
      success: true, token: s.accessToken, expiresIn: s.expiresIn, mode: cfg.refreshCookies ? "cookie" : "legacy",
      ...(s.csrfToken ? { csrfToken: s.csrfToken } : {}), user: publicUser(user), ...extra,
    });
  };

  router.post("/login", h(async (req, res) => {
    const username = str(req.body?.username, 120), password = str(req.body?.password, 200);
    if (!username || !password) return fail(res, 400, "username and password required");
    const user = (await store.findUserByUsername(username)) ?? (username.includes("@") ? await store.findUserByEmail(username) : null);
    dummyHash ??= bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);
    const ok = await bcrypt.compare(password.trim(), user?.passwordHash ?? dummyHash);
    const at = now();
    if (user && isLocked(user, at)) {
      const mins = Math.max(1, Math.ceil((user.lockedUntil!.getTime() - at.getTime()) / 60_000));
      return fail(res, 423, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.`, "locked");
    }
    // a wrong password, or a wrong second-factor code, counts against the account
    const wrong = async (message: string, code?: string) => {
      if (user) {
        const r = await store.recordLoginFailure(user.id, at, LOCKOUT.maxFailures, LOCKOUT.lockMinutes * 60_000);
        if (r.lockedUntil) return fail(res, 423, `Too many failed attempts. The account is locked for ${LOCKOUT.lockMinutes} minutes.`, "locked");
      }
      return fail(res, 401, message, code);
    };
    if (!user || !ok) return wrong("Invalid credentials");

    if (user.mfaEnabled) {
      const code = str(req.body?.code, 32)?.replace(/\s/g, "");
      if (!code) return fail(res, 401, "Enter the 6-digit code from your authenticator app.", "mfa_required");
      let good = false;
      if (/^\d{6}$/.test(code) && user.mfaSecretEnc) {
        const step = verifyTotp(crypto.decrypt(user.mfaSecretEnc), code, at.getTime(), user.mfaLastStep ?? 0);
        good = step !== null && (await store.useMfaStep(user.id, step));
      } else {
        good = await store.consumeRecovery(user.id, hashRecovery(code));
      }
      if (!good) return wrong("That code is not correct.", "mfa_invalid");
    }

    await store.clearLoginFailures(user.id);
    await store.touchLastLogin(user.id, at);
    const mfaEnrollRequired = requireStaffMfa && isStaff(user.role) && !user.mfaEnabled;
    respond(res, 200, await sessions.start(user, meta(req)), user, mfaEnrollRequired ? { mfaEnrollRequired: true } : {});
  }));

  /* ── second factor: set up, confirm, turn off ── */
  const cryptoDown = (res: Response) => fail(res, 503, "Two-factor sign-in is not available until DATA_ENCRYPTION_KEY is configured.", "mfa_unavailable");

  /** Starts set-up: a fresh secret (not active until confirmed) to scan or type into an authenticator app. */
  router.post("/mfa/setup", requireAuth, h(async (req, res) => {
    const user = await store.findUserById(req.user!.userId);
    if (!user) return fail(res, 404, "User not found");
    if (user.mfaEnabled) return fail(res, 409, "Two-factor sign-in is already on. Turn it off first to set it up again.", "mfa_already_enabled");
    const secret = newSecret();
    try { await store.setMfaPending(user.id, crypto.encrypt(secret)); } catch (e) { if (e instanceof CryptoUnavailable) return cryptoDown(res); throw e; }
    res.json({ success: true, secret, otpauthUri: otpauthUri(secret, user.email || user.username) });
  }));

  /** Confirms set-up with a code from the app, turns the second factor on and returns the one-time recovery codes (shown once). */
  router.post("/mfa/enable", requireAuth, h(async (req, res) => {
    const code = str(req.body?.code, 12)?.replace(/\s/g, "");
    const user = await store.findUserById(req.user!.userId);
    if (!user || !user.mfaSecretEnc) return fail(res, 400, "Start set-up first.", "mfa_not_started");
    if (user.mfaEnabled) return fail(res, 409, "Two-factor sign-in is already on.", "mfa_already_enabled");
    const step = code ? verifyTotp(crypto.decrypt(user.mfaSecretEnc), code, now().getTime(), 0) : null;
    if (step === null) return fail(res, 400, "That code is not correct. Check the time on your phone and try again.", "mfa_invalid");
    const codes = newRecoveryCodes();
    await store.enableMfa(user.id, codes.map(hashRecovery), step);
    res.json({ success: true, recoveryCodes: codes });
  }));

  /** Turning it off needs the password and a current code (or a recovery code), so a stolen session cannot remove it. */
  router.post("/mfa/disable", requireAuth, h(async (req, res) => {
    const password = str(req.body?.password, 200), code = str(req.body?.code, 32)?.replace(/\s/g, "");
    const user = await store.findUserById(req.user!.userId);
    if (!user || !password || !code) return fail(res, 400, "password and code are required");
    if (!(await bcrypt.compare(password.trim(), user.passwordHash))) return fail(res, 401, "Current password is incorrect");
    if (isStaff(user.role) && requireStaffMfa) return fail(res, 403, "Staff accounts must keep two-factor sign-in on.", "mfa_required_for_staff");
    let good = false;
    if (user.mfaEnabled && user.mfaSecretEnc) {
      if (/^\d{6}$/.test(code)) { const step = verifyTotp(crypto.decrypt(user.mfaSecretEnc), code, now().getTime(), user.mfaLastStep ?? 0); good = step !== null && (await store.useMfaStep(user.id, step)); }
      else good = await store.consumeRecovery(user.id, hashRecovery(code));
    }
    if (!good) return fail(res, 400, "That code is not correct.", "mfa_invalid");
    await store.disableMfa(user.id);
    res.json({ success: true, message: "Two-factor sign-in is off." });
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
