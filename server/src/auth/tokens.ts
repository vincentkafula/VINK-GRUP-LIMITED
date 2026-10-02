import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../middleware/auth.js";
import type { AuthPayload } from "../types/auth.js";

/** Short-lived signed access token (what the Authorization header carries). */
export function signAccessToken(payload: AuthPayload, ttlSeconds: number): string {
  return jwt.sign({ userId: payload.userId, username: payload.username, role: payload.role }, JWT_SECRET, { expiresIn: ttlSeconds });
}

/** Unguessable opaque value (refresh and email tokens). 256 bits. */
export const newOpaqueToken = (): string => crypto.randomBytes(32).toString("base64url");

/** Only a hash of a token is stored, so a database leak does not hand out working tokens. */
export const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Double-submit CSRF token bound to the refresh token: HMAC(secret, refreshToken). The page keeps it in memory and sends it as a
 * header; an attacker's page cannot compute it because it cannot read the httpOnly cookie.
 */
export const csrfFor = (refreshToken: string): string => crypto.createHmac("sha256", JWT_SECRET).update("csrf:" + refreshToken).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
