/**
 * Which website origins may call the API from a browser (CORS) and perform cookie-based actions (CSRF origin check).
 * An explicit allow-list only: the production sites, ALLOWED_ORIGINS, and FRONTEND_URL. The old rule that trusted EVERY
 * *.up.railway.app address in production is gone (anyone can host an app there); set ALLOW_RAILWAY_PREVIEW_ORIGINS=true
 * only if you deliberately want Railway preview URLs to work.
 */
export const PRODUCTION_DOMAINS = ["https://www.vink.co.za", "https://vink.co.za"];

export function createOriginPolicy(env: NodeJS.ProcessEnv = process.env): (origin: string | undefined) => boolean {
  const listed = new Set<string>([
    ...(env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:4173").split(",").map((o) => o.trim()).filter(Boolean),
    ...PRODUCTION_DOMAINS,
  ]);
  if (env.FRONTEND_URL) listed.add(env.FRONTEND_URL.replace(/\/+$/, ""));
  const previews = env.NODE_ENV === "production" && env.ALLOW_RAILWAY_PREVIEW_ORIGINS === "true";

  return (origin) => {
    if (!origin) return true;                       // not a browser cross-origin request (curl, server to server, same-origin)
    if (listed.has(origin)) return true;
    if (previews) { try { return new URL(origin).hostname.endsWith(".up.railway.app"); } catch { return false; } }
    return false;
  };
}
