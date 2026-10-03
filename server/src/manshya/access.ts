import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../middleware/auth.js";
import type { AuthPayload } from "../types/auth.js";

/**
 * Who may use the Manshya payments and banking module.
 *
 * - The merchant/banking dashboard is for CUSTOMER accounts only. Staff
 *   roles (owner, superadmin, ...) have their own panels and are refused
 *   here even with a perfectly valid token.
 * - The back office (/api/manshya/admin) is the opposite: staff only
 *   (owner or superadmin), never customers.
 */
export const CUSTOMER_ROLE = "customer";
/** Passenger ("personal") accounts use the same payments and banking dashboard as customers. */
export const CUSTOMER_ROLES: string[] = [CUSTOMER_ROLE, "personal"];
export const BACK_OFFICE_ROLES = ["owner", "superadmin"];

export type Access =
  | { ok: true; user: AuthPayload }
  | { ok: false; reason: "no_token" | "bad_token" | "wrong_role"; user?: AuthPayload };

function readToken(authorization: string | undefined): AuthPayload | "no_token" | "bad_token" {
  if (!authorization?.startsWith("Bearer ")) return "no_token";
  const token = authorization.slice(7);
  // Manshya API keys (mk_..., mka_...) are not JWTs; let the caller fall back to them.
  if (/^mk[a-z]?_/.test(token)) return "no_token";
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    return payload && payload.userId && payload.role ? payload : "bad_token";
  } catch {
    return "bad_token";
  }
}

export function customerAccess(authorization: string | undefined): Access {
  const p = readToken(authorization);
  if (typeof p === "string") return { ok: false, reason: p };
  return CUSTOMER_ROLES.includes(p.role) ? { ok: true, user: p } : { ok: false, reason: "wrong_role", user: p };
}

export function backOfficeAccess(authorization: string | undefined): Access {
  const p = readToken(authorization);
  if (typeof p === "string") return { ok: false, reason: p };
  return BACK_OFFICE_ROLES.includes(p.role) ? { ok: true, user: p } : { ok: false, reason: "wrong_role", user: p };
}
