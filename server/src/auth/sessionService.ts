import crypto from "crypto";
import type { AuthConfig } from "./config.js";
import type { AuthStore, UserRecord } from "./store.js";
import { signAccessToken, newOpaqueToken, hashToken, csrfFor } from "./tokens.js";

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;                 // seconds
  /** Present only in cookie mode: set it as an httpOnly cookie, never return it in the body. */
  refreshToken?: string;
  refreshExpiresAt?: Date;
  /** Present only in cookie mode: the page keeps this in memory and sends it as X-CSRF-Token. */
  csrfToken?: string;
}

export type RefreshFailure = "invalid" | "expired" | "reuse_detected" | "in_progress" | "user_gone";
export class RefreshError extends Error {
  constructor(readonly reason: RefreshFailure) { super(reason); this.name = "RefreshError"; }
}

export interface SessionMeta { userAgent?: string; ip?: string }

/**
 * Access + refresh token lifecycle.
 *
 * Refresh tokens ROTATE: every use returns a new one and retires the old one. If an already-retired token shows up again, either
 * it was stolen or two tabs raced. A retired token seen more than `rotationGraceSeconds` after it was rotated is treated as theft
 * and the whole family is revoked (the thief and the real user are both signed out); inside the grace window it is reported as
 * "in_progress" so the client simply retries with the cookie the winning tab already received.
 */
export class SessionService {
  constructor(
    private readonly store: AuthStore,
    private readonly cfg: AuthConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private access(user: Pick<UserRecord, "id" | "username" | "role">): string {
    return signAccessToken({ userId: user.id, username: user.username, role: user.role }, this.cfg.accessTtlSeconds);
  }

  /** Called after a successful password check (or registration). */
  async start(user: UserRecord, meta: SessionMeta = {}): Promise<IssuedSession> {
    const accessToken = this.access(user);
    if (!this.cfg.refreshCookies) return { accessToken, expiresIn: this.cfg.accessTtlSeconds };
    return { accessToken, expiresIn: this.cfg.accessTtlSeconds, ...(await this.issueRefresh(user.id, crypto.randomUUID(), meta)) };
  }

  private async issueRefresh(userId: string, familyId: string, meta: SessionMeta, id = crypto.randomUUID()) {
    const refreshToken = newOpaqueToken();
    const createdAt = this.now();
    const refreshExpiresAt = new Date(createdAt.getTime() + this.cfg.refreshTtlSeconds * 1000);
    await this.store.insertRefresh({ id, userId, familyId, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt, createdAt }, meta);
    return { refreshToken, refreshExpiresAt, csrfToken: csrfFor(refreshToken), refreshId: id };
  }

  /** Exchange a refresh token for a new access token and a new refresh token. */
  async refresh(rawToken: string, meta: SessionMeta = {}): Promise<IssuedSession & { user: UserRecord }> {
    const rec = await this.store.findRefreshByHash(hashToken(rawToken));
    if (!rec) throw new RefreshError("invalid");
    const now = this.now();

    if (rec.revokedAt) {
      // Already used. A just-rotated token is almost certainly a second tab; anything older is a replay.
      const age = (now.getTime() - rec.revokedAt.getTime()) / 1000;
      if (rec.replacedBy && age <= this.cfg.rotationGraceSeconds) throw new RefreshError("in_progress");
      await this.store.revokeFamily(rec.familyId, now);
      throw new RefreshError("reuse_detected");
    }
    if (rec.expiresAt <= now) throw new RefreshError("expired");

    const user = await this.store.findUserById(rec.userId);
    if (!user) { await this.store.revokeFamily(rec.familyId, now); throw new RefreshError("user_gone"); }

    const next = await this.issueRefresh(user.id, rec.familyId, meta);
    // Atomic: only one concurrent request can win the right to rotate this token.
    if (!(await this.store.markRotated(rec.id, next.refreshId, now))) {
      await this.store.revokeToken(next.refreshId, now);     // only OUR just-issued token dies; the winner's chain stays valid
      throw new RefreshError("in_progress");
    }
    return { accessToken: this.access(user), expiresIn: this.cfg.accessTtlSeconds, refreshToken: next.refreshToken, refreshExpiresAt: next.refreshExpiresAt, csrfToken: next.csrfToken, user };
  }

  /** Sign out this browser: revoke the whole chain this token belongs to. Unknown tokens are ignored. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const rec = await this.store.findRefreshByHash(hashToken(rawToken));
    if (rec) await this.store.revokeFamily(rec.familyId, this.now());
  }

  /** Sign out everywhere (password change or reset). */
  async logoutEverywhere(userId: string): Promise<void> {
    await this.store.revokeAllForUser(userId, this.now());
  }
}
