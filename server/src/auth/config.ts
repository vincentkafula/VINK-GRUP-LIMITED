/**
 * Authentication settings, all from the environment and validated once at start-up.
 *
 * Two modes, chosen with AUTH_REFRESH_COOKIES:
 *  - "legacy" (default): exactly what the app did before: one 8-hour access token, no refresh token. Used until the API is served
 *    from the same site as the website (for example api.vink.co.za next to www.vink.co.za).
 *  - "cookie" (AUTH_REFRESH_COOKIES=true): a short-lived access token (kept in browser memory, not localStorage) plus a rotating
 *    refresh token in an httpOnly, Secure, SameSite cookie that JavaScript can never read. This ONLY works if the browser treats the
 *    API as same-site with the website; on a different site the cookie is not sent, so users would be signed out after 15 minutes.
 */

export type SameSite = "lax" | "strict" | "none";

export interface AuthConfig {
  refreshCookies: boolean;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  cookieName: string;
  cookieSecure: boolean;
  sameSite: SameSite;
  cookiePath: string;
  /** Where links in emails point (the website), no trailing slash. */
  frontendUrl: string;
  /** A refresh token rotated less than this long ago is treated as a multi-tab race, not theft. */
  rotationGraceSeconds: number;
}

const LEGACY_ACCESS_TTL = 8 * 3600;

export function resolveAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env.NODE_ENV === "production";
  const refreshCookies = env.AUTH_REFRESH_COOKIES === "true";
  const sameSite = (env.AUTH_COOKIE_SAMESITE ?? "lax").toLowerCase() as SameSite;
  if (!["lax", "strict", "none"].includes(sameSite)) throw new Error(`AUTH_COOKIE_SAMESITE must be lax, strict or none, got "${env.AUTH_COOKIE_SAMESITE}".`);
  const cookieSecure = production;
  if (sameSite === "none" && !cookieSecure) throw new Error("AUTH_COOKIE_SAMESITE=none requires production (Secure cookies).");

  const frontendUrl = (env.FRONTEND_URL ?? (production ? "" : "http://localhost:5173")).replace(/\/+$/, "");
  if (production && refreshCookies && !/^https:\/\//.test(frontendUrl)) {
    throw new Error("AUTH_REFRESH_COOKIES=true in production needs FRONTEND_URL set to the site's https address.");
  }

  const num = (v: string | undefined, d: number, min: number, max: number) => {
    const n = v === undefined || v === "" ? d : Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid auth setting "${v}" (allowed ${min} to ${max}).`);
    return n;
  };

  return {
    refreshCookies,
    accessTtlSeconds: refreshCookies ? num(env.AUTH_ACCESS_TTL_SECONDS, 900, 60, 3600) : LEGACY_ACCESS_TTL,
    refreshTtlSeconds: num(env.AUTH_REFRESH_TTL_DAYS, 30, 1, 90) * 86400,
    cookieName: cookieSecure ? "__Secure-vink_rt" : "vink_rt",
    cookieSecure,
    sameSite,
    cookiePath: "/api/auth",
    frontendUrl,
    rotationGraceSeconds: 10,
  };
}
