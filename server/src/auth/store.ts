import crypto from "crypto";

/* The data the auth flows need, behind an interface so the logic can be tested without a database. */

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  name: string;
  email: string;
  emailVerified: boolean;
  lastLogin: Date | null;
}

export interface RefreshRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
  createdAt: Date;
}

export type EmailPurpose = "verify" | "reset";

export interface AuthStore {
  /* users */
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  usernameOrEmailTaken(username: string, email: string): Promise<boolean>;
  createUser(u: { username: string; passwordHash: string; role: string; name: string; email: string; emailVerified: boolean }): Promise<UserRecord>;
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
  setEmailVerified(userId: string): Promise<void>;
  touchLastLogin(userId: string, at: Date): Promise<void>;

  /* refresh tokens (rotating, grouped in families so theft can revoke the whole chain) */
  insertRefresh(r: Omit<RefreshRecord, "revokedAt" | "replacedBy">, meta?: { userAgent?: string; ip?: string }): Promise<void>;
  findRefreshByHash(tokenHash: string): Promise<RefreshRecord | null>;
  /** Atomically revoke a token as rotated. Returns false if someone else already revoked it. */
  markRotated(id: string, replacedBy: string, at: Date): Promise<boolean>;
  /** Revoke exactly one token (used when a refresh lost a race). */
  revokeToken(id: string, at: Date): Promise<void>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;

  /* single-use emailed tokens */
  insertEmailToken(t: { id: string; userId: string; purpose: EmailPurpose; tokenHash: string; expiresAt: Date; createdAt: Date }): Promise<void>;
  /** Atomically use a token: returns the user id if it exists, matches the purpose, is unused and unexpired. */
  consumeEmailToken(tokenHash: string, purpose: EmailPurpose, at: Date): Promise<string | null>;
  invalidateEmailTokens(userId: string, purpose: EmailPurpose, at: Date): Promise<void>;
}

/* ───────────────────────── in-memory (tests, and the reference behaviour) ───────────────────────── */

export class MemoryAuthStore implements AuthStore {
  users = new Map<string, UserRecord>();
  refresh = new Map<string, RefreshRecord>();
  emailTokens = new Map<string, { id: string; userId: string; purpose: EmailPurpose; expiresAt: Date; usedAt: Date | null }>();   // key: token hash

  async findUserById(id: string) { return this.users.get(id) ?? null; }
  async findUserByUsername(username: string) { return [...this.users.values()].find((u) => u.username === username) ?? null; }
  async findUserByEmail(email: string) { return [...this.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null; }
  async usernameOrEmailTaken(username: string, email: string) {
    return [...this.users.values()].some((u) => u.username === username || u.email.toLowerCase() === email.toLowerCase());
  }
  async createUser(u: Parameters<AuthStore["createUser"]>[0]) {
    const rec: UserRecord = { id: crypto.randomUUID(), ...u, lastLogin: null };
    this.users.set(rec.id, rec);
    return rec;
  }
  async setPasswordHash(userId: string, passwordHash: string) { const u = this.users.get(userId); if (u) u.passwordHash = passwordHash; }
  async setEmailVerified(userId: string) { const u = this.users.get(userId); if (u) u.emailVerified = true; }
  async touchLastLogin(userId: string, at: Date) { const u = this.users.get(userId); if (u) u.lastLogin = at; }

  async insertRefresh(r: Omit<RefreshRecord, "revokedAt" | "replacedBy">) { this.refresh.set(r.id, { ...r, revokedAt: null, replacedBy: null }); }
  async findRefreshByHash(tokenHash: string) { return [...this.refresh.values()].find((r) => r.tokenHash === tokenHash) ?? null; }
  async markRotated(id: string, replacedBy: string, at: Date) {
    const r = this.refresh.get(id);
    if (!r || r.revokedAt) return false;
    r.revokedAt = at; r.replacedBy = replacedBy;
    return true;
  }
  async revokeToken(id: string, at: Date) { const r = this.refresh.get(id); if (r && !r.revokedAt) r.revokedAt = at; }
  async revokeFamily(familyId: string, at: Date) { for (const r of this.refresh.values()) if (r.familyId === familyId && !r.revokedAt) r.revokedAt = at; }
  async revokeAllForUser(userId: string, at: Date) { for (const r of this.refresh.values()) if (r.userId === userId && !r.revokedAt) r.revokedAt = at; }

  async insertEmailToken(t: { id: string; userId: string; purpose: EmailPurpose; tokenHash: string; expiresAt: Date }) {
    this.emailTokens.set(t.tokenHash, { id: t.id, userId: t.userId, purpose: t.purpose, expiresAt: t.expiresAt, usedAt: null });
  }
  async consumeEmailToken(tokenHash: string, purpose: EmailPurpose, at: Date) {
    const t = this.emailTokens.get(tokenHash);
    if (!t || t.purpose !== purpose || t.usedAt || t.expiresAt <= at) return null;
    t.usedAt = at;
    return t.userId;
  }
  async invalidateEmailTokens(userId: string, purpose: EmailPurpose, at: Date) {
    for (const t of this.emailTokens.values()) if (t.userId === userId && t.purpose === purpose && !t.usedAt) t.usedAt = at;
  }
}

/* ───────────────────────── Postgres ───────────────────────── */

interface Queryable { query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }> }   // eslint-disable-line @typescript-eslint/no-explicit-any

const toUser = (r: any): UserRecord => ({   // eslint-disable-line @typescript-eslint/no-explicit-any
  id: r.id, username: r.username, passwordHash: r.password_hash, role: r.role, name: r.name, email: r.email,
  emailVerified: r.email_verified !== false, lastLogin: r.last_login ? new Date(r.last_login) : null,
});
const toRefresh = (r: any): RefreshRecord => ({   // eslint-disable-line @typescript-eslint/no-explicit-any
  id: r.id, userId: r.user_id, familyId: r.family_id, tokenHash: r.token_hash, expiresAt: new Date(r.expires_at),
  revokedAt: r.revoked_at ? new Date(r.revoked_at) : null, replacedBy: r.replaced_by ?? null, createdAt: new Date(r.created_at),
});

export class PgAuthStore implements AuthStore {
  constructor(private readonly db: Queryable) {}

  async findUserById(id: string) { const { rows } = await this.db.query("SELECT * FROM users WHERE id = $1", [id]); return rows[0] ? toUser(rows[0]) : null; }
  async findUserByUsername(username: string) { const { rows } = await this.db.query("SELECT * FROM users WHERE username = $1", [username]); return rows[0] ? toUser(rows[0]) : null; }
  async findUserByEmail(email: string) { const { rows } = await this.db.query("SELECT * FROM users WHERE lower(email) = lower($1) ORDER BY created_at LIMIT 1", [email]); return rows[0] ? toUser(rows[0]) : null; }
  async usernameOrEmailTaken(username: string, email: string) {
    const { rows } = await this.db.query("SELECT 1 FROM users WHERE username = $1 OR lower(email) = lower($2) LIMIT 1", [username, email]);
    return rows.length > 0;
  }
  async createUser(u: Parameters<AuthStore["createUser"]>[0]) {
    const { rows } = await this.db.query(
      "INSERT INTO users (id, username, password_hash, role, name, email, email_verified) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [crypto.randomUUID(), u.username, u.passwordHash, u.role, u.name, u.email, u.emailVerified],
    );
    return toUser(rows[0]);
  }
  async setPasswordHash(userId: string, passwordHash: string) { await this.db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]); }
  async setEmailVerified(userId: string) { await this.db.query("UPDATE users SET email_verified = true WHERE id = $1", [userId]); }
  async touchLastLogin(userId: string, at: Date) { await this.db.query("UPDATE users SET last_login = $2 WHERE id = $1", [userId, at]); }

  async insertRefresh(r: Omit<RefreshRecord, "revokedAt" | "replacedBy">, meta: { userAgent?: string; ip?: string } = {}) {
    await this.db.query(
      "INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at, user_agent, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [r.id, r.userId, r.familyId, r.tokenHash, r.expiresAt, r.createdAt, meta.userAgent?.slice(0, 300) ?? null, meta.ip ?? null],
    );
  }
  async findRefreshByHash(tokenHash: string) { const { rows } = await this.db.query("SELECT * FROM refresh_tokens WHERE token_hash = $1", [tokenHash]); return rows[0] ? toRefresh(rows[0]) : null; }
  async markRotated(id: string, replacedBy: string, at: Date) {
    const r = await this.db.query("UPDATE refresh_tokens SET revoked_at = $3, replaced_by = $2 WHERE id = $1 AND revoked_at IS NULL", [id, replacedBy, at]);
    return r.rowCount === 1;
  }
  async revokeToken(id: string, at: Date) { await this.db.query("UPDATE refresh_tokens SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL", [id, at]); }
  async revokeFamily(familyId: string, at: Date) { await this.db.query("UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL", [familyId, at]); }
  async revokeAllForUser(userId: string, at: Date) { await this.db.query("UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL", [userId, at]); }

  async insertEmailToken(t: { id: string; userId: string; purpose: EmailPurpose; tokenHash: string; expiresAt: Date; createdAt: Date }) {
    await this.db.query("INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [t.id, t.userId, t.purpose, t.tokenHash, t.expiresAt, t.createdAt]);
  }
  async consumeEmailToken(tokenHash: string, purpose: EmailPurpose, at: Date) {
    const { rows } = await this.db.query(
      "UPDATE email_tokens SET used_at = $3 WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > $3 RETURNING user_id",
      [tokenHash, purpose, at],
    );
    return rows[0]?.user_id ?? null;
  }
  async invalidateEmailTokens(userId: string, purpose: EmailPurpose, at: Date) {
    await this.db.query("UPDATE email_tokens SET used_at = $3 WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL", [userId, purpose, at]);
  }
}
