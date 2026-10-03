import type { Request, Response, NextFunction } from "express";
import type { AuthConfig } from "./config.js";
import { csrfFor, safeEqual } from "./tokens.js";

/** Tiny cookie reader (no extra dependency). Returns the first cookie with this name. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

const attrs = (cfg: AuthConfig) => `Path=${cfg.cookiePath}; HttpOnly; SameSite=${cfg.sameSite[0].toUpperCase()}${cfg.sameSite.slice(1)}${cfg.cookieSecure ? "; Secure" : ""}`;

/** The refresh token cookie: httpOnly (JavaScript cannot read it), Secure in production, scoped to the auth endpoints only. */
export function setRefreshCookie(res: Response, cfg: AuthConfig, token: string, expires: Date): void {
  res.append("Set-Cookie", `${cfg.cookieName}=${encodeURIComponent(token)}; ${attrs(cfg)}; Expires=${expires.toUTCString()}`);
}

export function clearRefreshCookie(res: Response, cfg: AuthConfig): void {
  res.append("Set-Cookie", `${cfg.cookieName}=; ${attrs(cfg)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`);
}

/**
 * Guards the two endpoints that act on the refresh cookie (refresh, logout) against cross-site request forgery:
 *  1. if the browser sent an Origin, it must be an allowed site
 *  2. the X-CSRF-Token header must equal the token derived from the cookie's own refresh token (see csrfFor)
 */
export function requireCsrf(cfg: AuthConfig, isAllowedOrigin: (origin: string | undefined) => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) { res.status(403).json({ success: false, error: "Origin not allowed", code: "csrf_origin" }); return; }
    const cookie = readCookie(req, cfg.cookieName);
    const header = req.headers["x-csrf-token"];
    if (!cookie || typeof header !== "string" || !safeEqual(header, csrfFor(cookie))) {
      res.status(403).json({ success: false, error: "Missing or invalid CSRF token", code: "csrf_token" });
      return;
    }
    next();
  };
}
