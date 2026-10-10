import { Router, json, type Request, type Response, type NextFunction } from "express";
import { h, fail, audit, isUuid, type Db } from "../portal/common.js";
import type { SocialService } from "../services/social/socialService.js";

/** The section a person is approved for to run the social accounts (a Super Administrator can always). */
export const SOCIAL_SECTION = "Social Media Management";

/**
 * Social media posting, at /api/admin/social (the caller mounts it behind requireAuth):
 *   GET   /status              which networks are set up, the automatic posts, days to launch
 *   GET   /posts               recent posts with what each network answered
 *   POST  /posts               { kind, text, link?, imageUrl?, networks[], scheduleAt? } post now, or later
 *   POST  /posts/:id/retry     try the networks that failed again (the ones that took it are skipped)
 *   POST  /posts/:id/cancel    a post that has not gone out yet
 *   PUT   /auto                { launch?: { enabled, networks }, products?: { enabled, networks } } (Super Administrators only)
 * Allowed: Super Administrators (owner, superadmin) and people approved for the section "Social Media Management".
 */
export function createSocialRouter(d: { db: Db; svc: SocialService }) {
  const router = Router();
  router.use(json({ limit: "32kb" }));
  const isSuper = (req: Request) => ["owner", "superadmin"].includes(req.user?.role ?? "");

  const guard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return fail(res, 401, "Sign in first");
      if (isSuper(req)) return next();
      const ok = (await d.db.query(`SELECT 1 AS x FROM section_permissions WHERE user_id = $1 AND section = $2`, [req.user.userId, SOCIAL_SECTION])).rows.length > 0;
      if (!ok) return fail(res, 403, "You are not approved to manage the social media accounts");
      next();
    } catch (e) { next(e); }
  };
  router.use(guard);
  const who = (req: Request) => ({ userId: req.user!.userId, username: req.user!.username ?? "staff" });

  router.get("/status", h(async (_req, res) => { res.json({ success: true, ...(await d.svc.status()) }); }));
  router.get("/posts", h(async (req, res) => { res.json({ success: true, posts: await d.svc.list(Number(req.query.limit) || 50) }); }));

  router.post("/posts", h(async (req, res) => {
    const r = await d.svc.create(who(req), (req.body ?? {}) as Record<string, unknown>);
    if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "social.post", r.value.id, { kind: r.value.kind, networks: r.value.networks, status: r.value.status });
    res.status(201).json({ success: true, post: r.value });
  }));
  router.post("/posts/:id/retry", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 404, "No such post");
    const r = await d.svc.retry(String(req.params.id)); if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "social.retry", r.value.id, { status: r.value.status });
    res.json({ success: true, post: r.value });
  }));
  router.post("/posts/:id/cancel", h(async (req, res) => {
    if (!isUuid(req.params.id)) return fail(res, 404, "No such post");
    const r = await d.svc.cancel(String(req.params.id)); if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "social.cancel", r.value.id, {});
    res.json({ success: true, post: r.value });
  }));
  router.put("/auto", h(async (req, res) => {
    if (!isSuper(req)) return fail(res, 403, "Only a Super Administrator can switch automatic posts on or off");
    const r = await d.svc.setAuto(who(req), (req.body ?? {}) as Record<string, unknown>); if (!r.ok) return fail(res, r.status, r.error);
    await audit(d.db, req, "social.auto", null, { auto: r.value });
    res.json({ success: true, auto: r.value });
  }));
  return router;
}
