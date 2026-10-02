import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { AuthConfig } from "./config.js";
import type { AuthStore, UserRecord, EmailPurpose } from "./store.js";
import type { EmailSender } from "./email.js";
import { resetPasswordMessage, verifyEmailMessage } from "./emailTemplates.js";
import { newOpaqueToken, hashToken } from "./tokens.js";
import { passwordProblem } from "./password.js";
import { BCRYPT_ROUNDS } from "../config/secrets.js";
import type { SessionService } from "./sessionService.js";

const TTL_MS: Record<EmailPurpose, number> = { verify: 24 * 3600_000, reset: 3600_000 };

export class FlowError extends Error {
  constructor(readonly code: "invalid_token" | "weak_password", message: string) { super(message); this.name = "FlowError"; }
}

/** Email verification and password reset. Tokens are single-use, expire, and only their hashes are stored. */
export class AuthFlows {
  constructor(
    private readonly store: AuthStore,
    private readonly sessions: SessionService,
    private readonly mail: EmailSender,
    private readonly cfg: AuthConfig,
    private readonly now: () => Date = () => new Date(),
    private readonly log: (m: string) => void = (m) => console.error(m),
  ) {}

  private async issue(user: UserRecord, purpose: EmailPurpose): Promise<string> {
    const at = this.now();
    await this.store.invalidateEmailTokens(user.id, purpose, at);     // only the newest link works
    const token = newOpaqueToken();
    await this.store.insertEmailToken({ id: crypto.randomUUID(), userId: user.id, purpose, tokenHash: hashToken(token), expiresAt: new Date(at.getTime() + TTL_MS[purpose]), createdAt: at });
    return token;
  }

  /** Fire-and-forget: a slow or failing mail provider must not change how long the request takes (or reveal anything). */
  private deliver(p: Promise<void>) { p.catch((e) => this.log(`[auth] email not sent: ${(e as Error).message}`)); }

  async sendVerification(user: UserRecord): Promise<void> {
    if (user.emailVerified) return;
    const token = await this.issue(user, "verify");
    this.deliver(this.mail.send(verifyEmailMessage(user.email, user.name, `${this.cfg.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`)));
  }

  /** Returns the verified user, or throws FlowError("invalid_token"). */
  async verifyEmail(rawToken: string): Promise<void> {
    const userId = await this.store.consumeEmailToken(hashToken(rawToken), "verify", this.now());
    if (!userId) throw new FlowError("invalid_token", "This link is invalid or has expired.");
    await this.store.setEmailVerified(userId);
  }

  /** Always resolves the same way whether or not the address has an account (no account enumeration). */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.store.findUserByEmail(email);
    if (!user) return;
    const token = await this.issue(user, "reset");
    this.deliver(this.mail.send(resetPasswordMessage(user.email, user.name, `${this.cfg.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`)));
  }

  /** Sets the new password, retires the reset link, and signs the user out of every device. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    // Check the password BEFORE spending the single-use token, so a typo does not burn the link.
    const problem = passwordProblem(newPassword);
    if (problem) throw new FlowError("weak_password", problem);
    const userId = await this.store.consumeEmailToken(hashToken(rawToken), "reset", this.now());
    if (!userId) throw new FlowError("invalid_token", "This link is invalid or has expired.");
    const user = await this.store.findUserById(userId);
    if (!user) throw new FlowError("invalid_token", "This link is invalid or has expired.");
    await this.store.setPasswordHash(user.id, await bcrypt.hash(newPassword.trim(), BCRYPT_ROUNDS));
    await this.store.invalidateEmailTokens(user.id, "reset", this.now());
    await this.sessions.logoutEverywhere(user.id);
  }
}
