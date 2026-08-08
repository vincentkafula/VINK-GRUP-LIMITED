import { Router, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { pool, hasDb } from "../db/pool.js";
import { NEWS_ARTICLES } from "../data/newsData.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

const mapArticle = (r: any) => ({
  id: r.id, slug: r.slug, title: r.title, subtitle: r.subtitle, category: r.category, author: r.author,
  summary: r.summary, body: r.body, tags: r.tags ?? [], heroGradient: r.hero_gradient, emoji: r.emoji,
  readMinutes: r.read_minutes, featured: r.featured, breaking: r.breaking, views: r.views, publishedAt: r.published_at,
  hasHeroImage: Boolean(r.hero_image_data), metaDescription: r.meta_description,
});

// In-memory fallback for environments without DATABASE_URL configured, so
// the news section still works even if the DB isn't wired up yet.
let memoryViews: Record<string, number> = Object.fromEntries(NEWS_ARTICLES.map(a => [a.id, a.views]));
const memoryArticle = (a: (typeof NEWS_ARTICLES)[number]) => ({ ...a, views: memoryViews[a.id] ?? a.views });

// GET /api/news/articles?category=&search=&page=&limit=
router.get("/articles", async (req: Request, res: Response): Promise<void> => {
  const { category, search, page: pg, limit: lim } = req.query as Record<string, string>;
  const page = Math.max(1, Number(pg) || 1);
  const limit = Math.min(48, Number(lim) || 12);

  if (!hasDb || !pool) {
    let list = NEWS_ARTICLES.map(memoryArticle);
    if (category && category !== "All") list = list.filter(a => a.category === category);
    if (search) { const q = search.toLowerCase(); list = list.filter(a => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)); }
    list.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const total = list.length;
    const paged = list.slice((page - 1) * limit, page * limit).map(({ body, ...rest }) => rest);
    res.json({ success: true, data: paged, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
    return;
  }

  const where: string[] = ["status = 'published'"]; const params: unknown[] = [];
  if (category && category !== "All") { params.push(category); where.push(`category = $${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`(title ILIKE $${params.length} OR summary ILIKE $${params.length})`); }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM news_articles ${whereSql}`, params);
  const { rows } = await pool.query(
    `SELECT id, slug, title, subtitle, category, author, summary, tags, hero_gradient, emoji, read_minutes, featured, breaking, views, published_at
     FROM news_articles ${whereSql} ORDER BY published_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  res.json({ success: true, data: rows.map(mapArticle), meta: { page, limit, total: countRows[0].total, pages: Math.ceil(countRows[0].total / limit) } });
});

// GET /api/news/categories
router.get("/categories", async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) {
    const counts: Record<string, number> = {};
    for (const a of NEWS_ARTICLES) counts[a.category] = (counts[a.category] ?? 0) + 1;
    res.json({ success: true, data: Object.entries(counts).map(([category, count]) => ({ category, count })) });
    return;
  }
  const { rows } = await pool.query(`SELECT category, COUNT(*)::int AS count FROM news_articles WHERE status = 'published' GROUP BY category ORDER BY category`);
  res.json({ success: true, data: rows });
});

// GET /api/news/trending — most-viewed articles, for a "Most Read" rail
router.get("/trending", async (_req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) {
    const list = NEWS_ARTICLES.map(memoryArticle).sort((a, b) => b.views - a.views).slice(0, 5).map(({ body, ...rest }) => rest);
    res.json({ success: true, data: list });
    return;
  }
  const { rows } = await pool.query(
    `SELECT id, slug, title, subtitle, category, author, summary, tags, hero_gradient, emoji, read_minutes, featured, breaking, views, published_at
     FROM news_articles WHERE status = 'published' ORDER BY views DESC LIMIT 5`
  );
  res.json({ success: true, data: rows.map(mapArticle) });
});

// GET /api/news/articles/:slug — full article + related stories from the same category
router.get("/articles/:slug", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) {
    const found = NEWS_ARTICLES.find(a => a.slug === req.params.slug);
    if (!found) { res.status(404).json({ success: false, error: "Article not found" }); return; }
    memoryViews[found.id] = (memoryViews[found.id] ?? found.views) + 1;
    const related = NEWS_ARTICLES.filter(a => a.category === found.category && a.slug !== found.slug).map(memoryArticle).slice(0, 3).map(({ body, ...rest }) => rest);
    res.json({ success: true, data: { article: memoryArticle(found), related } });
    return;
  }

  const { rows } = await pool.query(`SELECT * FROM news_articles WHERE slug = $1 AND status = 'published'`, [req.params.slug]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Article not found" }); return; }
  const article = rows[0];
  await pool.query(`UPDATE news_articles SET views = views + 1 WHERE id = $1`, [article.id]);
  const { rows: relatedRows } = await pool.query(
    `SELECT id, slug, title, subtitle, category, author, summary, tags, hero_gradient, emoji, read_minutes, featured, breaking, views, published_at
     FROM news_articles WHERE category = $1 AND slug != $2 AND status = 'published' ORDER BY published_at DESC LIMIT 3`,
    [article.category, article.slug]
  );
  res.json({ success: true, data: { article: mapArticle({ ...article, views: article.views + 1 }), related: relatedRows.map(mapArticle) } });
});

// GET /api/news/articles/:slug/image — public hero image. Only serves
// published articles' images, same rule as the article text itself, so a
// draft's image can't be discovered by guessing its slug.
router.get("/articles/:slug/image", async (req: Request, res: Response): Promise<void> => {
  if (!hasDb || !pool) { res.status(404).json({ success: false, error: "No image available" }); return; }
  const { rows } = await pool.query(
    `SELECT hero_image_data, hero_image_mime_type FROM news_articles WHERE slug = $1 AND status = 'published'`,
    [req.params.slug]
  );
  if (!rows.length || !rows[0].hero_image_data) { res.status(404).json({ success: false, error: "No image on this article" }); return; }
  res.setHeader("Content-Type", rows[0].hero_image_mime_type || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(Buffer.from(rows[0].hero_image_data, "base64"));
});

// ─── News Management admin dashboard (real content-management backend) ────
//
// Role tiers, matching the newsroom positions listed in JobApplicationViewer:
//   EDITORIAL_LEADERSHIP -- General Manager, Editor-in-Chief, Managing Editor:
//     full control, including publish.
//   CONTENT_CREATORS -- Section Editor, Copy Editor/Sub-editor, Reporter/
//     Journalist, Photojournalist/Photo Editor, Layout/Design Editor,
//     Digital Editor: can create/edit their own articles and submit for
//     review, but cannot publish directly -- matches how a real newsroom
//     actually works, where a reporter doesn't have final say over what
//     goes live.
//   Everyone else who holds News Management access (business/admin/
//     production/support roles, or a grant made through the older RBAC
//     "apply to manage a section" flow with no specific position) gets
//     view-only access to this dashboard -- oversight without edit rights.
const EDITORIAL_LEADERSHIP = ["General Manager", "Editor-in-Chief", "Managing Editor"];
const CONTENT_CREATORS = ["Section Editor", "Copy Editor / Sub-editor", "Reporter / Journalist", "Photojournalist / Photo Editor", "Layout / Design Editor", "Digital Editor"];

async function getNewsRole(userId: string): Promise<{ hasAccess: boolean; position: string | null; tier: "leadership" | "creator" | "viewer" }> {
  if (!hasDb || !pool) return { hasAccess: false, position: null, tier: "viewer" };
  const { rows } = await pool.query(`SELECT position FROM section_permissions WHERE user_id = $1 AND section = 'News Management'`, [userId]);
  if (!rows.length) return { hasAccess: false, position: null, tier: "viewer" };
  const position: string | null = rows[0].position;
  // NULL position means access was granted through the older RBAC flow
  // (no newsroom sub-role attached) -- treated as leadership-equivalent
  // for backward compatibility, matching how section access worked before
  // this feature existed.
  if (!position || EDITORIAL_LEADERSHIP.includes(position)) return { hasAccess: true, position, tier: "leadership" };
  if (CONTENT_CREATORS.includes(position)) return { hasAccess: true, position, tier: "creator" };
  return { hasAccess: true, position, tier: "viewer" };
}

function requireNewsAccess(req: Request, res: Response, next: () => void) {
  getNewsRole(req.user!.userId).then(role => {
    if (!role.hasAccess) { res.status(403).json({ success: false, error: "You don't have News Management access." }); return; }
    (req as Request & { newsRole?: typeof role }).newsRole = role;
    next();
  });
}

const adminMapArticle = (r: any) => ({
  id: r.id, slug: r.slug, title: r.title, subtitle: r.subtitle, category: r.category, author: r.author,
  summary: r.summary, body: r.body, tags: r.tags ?? [], heroGradient: r.hero_gradient, emoji: r.emoji,
  readMinutes: r.read_minutes, featured: r.featured, breaking: r.breaking, views: r.views,
  status: r.status, createdByName: r.created_by_name, publishedAt: r.published_at, updatedAt: r.updated_at,
  hasHeroImage: Boolean(r.hero_image_data), scheduledAt: r.scheduled_at, metaDescription: r.meta_description,
});

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36).slice(-5);
}

// GET /api/news/admin/me — the dashboard's own entry point: what can this person actually do
router.get("/admin/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const role = await getNewsRole(req.user!.userId);
  if (!role.hasAccess) { res.status(403).json({ success: false, error: "You don't have News Management access." }); return; }
  res.json({ success: true, data: role });
});

// GET /api/news/admin/articles — every status, not just published, for the dashboard's own list
router.get("/admin/articles", requireAuth, requireNewsAccess, async (req: Request, res: Response): Promise<void> => {
  const { status } = req.query as { status?: string };
  const role = (req as Request & { newsRole?: Awaited<ReturnType<typeof getNewsRole>> }).newsRole!;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  // Content creators only see their own drafts/pending work, plus
  // everything published -- they shouldn't see other reporters' unfinished
  // drafts. Leadership and viewers see everything.
  if (role.tier === "creator") {
    params.push(req.user!.userId);
    conditions.push(`(status = 'published' OR created_by_user_id = $${params.length})`);
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool!.query(`SELECT * FROM news_articles ${whereSql} ORDER BY updated_at DESC LIMIT 100`, params);
  res.json({ success: true, data: rows.map(adminMapArticle) });
});

// POST /api/news/admin/articles — create. Leadership publishes immediately
// if requested; content creators always land in draft/pending_review,
// never published directly, regardless of what the request asks for --
// enforced server-side, not just hidden in the UI.
router.post("/admin/articles", requireAuth, requireNewsAccess, async (req: Request, res: Response): Promise<void> => {
  const role = (req as Request & { newsRole?: Awaited<ReturnType<typeof getNewsRole>> }).newsRole!;
  if (role.tier === "viewer") { res.status(403).json({ success: false, error: "Your News Management role doesn't include creating articles." }); return; }

  const { title, subtitle, category, summary, body, tags, emoji, readMinutes, featured, breaking, submitForReview, metaDescription, scheduledAt } = req.body as Record<string, any>;
  if (!title?.trim() || !category?.trim() || !summary?.trim() || !body?.trim()) {
    res.status(400).json({ success: false, error: "title, category, summary, and body are required" });
    return;
  }

  const id = randomUUID();
  const slug = slugify(title);
  // Only leadership can schedule or publish directly -- a content creator
  // requesting either still lands in pending_review, enforced here, not
  // just hidden in the UI.
  const wantsSchedule = role.tier === "leadership" && scheduledAt && new Date(scheduledAt).getTime() > Date.now();
  const canPublishDirectly = role.tier === "leadership" && !submitForReview && !wantsSchedule;
  const status = wantsSchedule ? "scheduled" : canPublishDirectly ? "published" : "pending_review";

  const { rows: userRows } = await pool!.query(`SELECT name FROM users WHERE id = $1`, [req.user!.userId]);
  const authorName = userRows[0]?.name ?? "VINK Newsroom";

  const { rows } = await pool!.query(
    `INSERT INTO news_articles (id, slug, title, subtitle, category, author, summary, body, tags, emoji, read_minutes, featured, breaking, status, created_by_user_id, created_by_name, meta_description, scheduled_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [id, slug, title.trim(), subtitle ?? null, category.trim(), authorName, summary.trim(), body.trim(),
     JSON.stringify(tags ?? []), emoji ?? "📰", readMinutes ?? 4, Boolean(featured) && role.tier === "leadership", Boolean(breaking) && role.tier === "leadership",
     status, req.user!.userId, authorName, metaDescription ?? null, wantsSchedule ? scheduledAt : null]
  );
  res.status(201).json({ success: true, data: adminMapArticle(rows[0]) });
});

// PATCH /api/news/admin/articles/:id — edit. Content creators can only edit
// their own, and only while not yet published (once live, only leadership
// can touch it, since a published correction is an editorial decision).
router.patch("/admin/articles/:id", requireAuth, requireNewsAccess, async (req: Request, res: Response): Promise<void> => {
  const role = (req as Request & { newsRole?: Awaited<ReturnType<typeof getNewsRole>> }).newsRole!;
  if (role.tier === "viewer") { res.status(403).json({ success: false, error: "Your News Management role doesn't include editing articles." }); return; }

  const { rows: existing } = await pool!.query(`SELECT * FROM news_articles WHERE id = $1`, [req.params.id]);
  if (!existing.length) { res.status(404).json({ success: false, error: "Article not found" }); return; }
  const article = existing[0];

  if (role.tier === "creator" && (article.created_by_user_id !== req.user!.userId || article.status === "published")) {
    res.status(403).json({ success: false, error: "You can only edit your own unpublished articles." });
    return;
  }

  const { title, subtitle, category, summary, body, tags, emoji, readMinutes, featured, breaking, metaDescription, scheduledAt } = req.body as Record<string, any>;
  const { rows } = await pool!.query(
    `UPDATE news_articles SET
       title = COALESCE($1, title), subtitle = COALESCE($2, subtitle), category = COALESCE($3, category),
       summary = COALESCE($4, summary), body = COALESCE($5, body), tags = COALESCE($6, tags),
       emoji = COALESCE($7, emoji), read_minutes = COALESCE($8, read_minutes),
       featured = CASE WHEN $9::boolean IS NOT NULL AND $10 THEN $9 ELSE featured END,
       breaking = CASE WHEN $11::boolean IS NOT NULL AND $10 THEN $11 ELSE breaking END,
       meta_description = COALESCE($13, meta_description),
       scheduled_at = CASE WHEN $14::boolean THEN $15 ELSE scheduled_at END,
       updated_at = now()
     WHERE id = $12 RETURNING *`,
    [title?.trim() ?? null, subtitle ?? null, category?.trim() ?? null, summary?.trim() ?? null, body?.trim() ?? null,
     tags ? JSON.stringify(tags) : null, emoji ?? null, readMinutes ?? null,
     featured ?? null, role.tier === "leadership", breaking ?? null, req.params.id,
     metaDescription ?? null, scheduledAt !== undefined && role.tier === "leadership", scheduledAt ?? null]
  );
  res.json({ success: true, data: adminMapArticle(rows[0]) });
});

// PATCH /api/news/admin/articles/:id/status — submit for review, or (leadership
// only) publish/send back to draft/reject.
router.patch("/admin/articles/:id/status", requireAuth, requireNewsAccess, async (req: Request, res: Response): Promise<void> => {
  const role = (req as Request & { newsRole?: Awaited<ReturnType<typeof getNewsRole>> }).newsRole!;
  const { status } = req.body as { status?: string };
  const VALID = ["draft", "pending_review", "published", "rejected", "scheduled"];
  if (!status || !VALID.includes(status)) { res.status(400).json({ success: false, error: `status must be one of: ${VALID.join(", ")}` }); return; }

  const { rows: existing } = await pool!.query(`SELECT * FROM news_articles WHERE id = $1`, [req.params.id]);
  if (!existing.length) { res.status(404).json({ success: false, error: "Article not found" }); return; }
  const article = existing[0];

  if (status === "published" || status === "rejected" || status === "scheduled") {
    if (role.tier !== "leadership") { res.status(403).json({ success: false, error: "Only editorial leadership can publish, schedule, or reject an article." }); return; }
  } else if (role.tier === "creator" && article.created_by_user_id !== req.user!.userId) {
    res.status(403).json({ success: false, error: "You can only change the status of your own articles." });
    return;
  } else if (role.tier === "viewer") {
    res.status(403).json({ success: false, error: "Your News Management role is view-only." });
    return;
  }

  const { scheduledAt } = req.body as { scheduledAt?: string };
  if (status === "scheduled") {
    if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
      res.status(400).json({ success: false, error: "scheduledAt must be a real date/time in the future to schedule an article." });
      return;
    }
  }

  const { rows } = await pool!.query(
    `UPDATE news_articles SET status = $1, published_at = CASE WHEN $1 = 'published' THEN now() ELSE published_at END,
       scheduled_at = CASE WHEN $1 = 'scheduled' THEN $3 ELSE scheduled_at END, updated_at = now() WHERE id = $2 RETURNING *`,
    [status, req.params.id, scheduledAt ?? null]
  );
  res.json({ success: true, data: adminMapArticle(rows[0]) });
});

// DELETE /api/news/admin/articles/:id — leadership only, or a creator deleting their own unpublished draft.
router.delete("/admin/articles/:id", requireAuth, requireNewsAccess, async (req: Request, res: Response): Promise<void> => {
  const role = (req as Request & { newsRole?: Awaited<ReturnType<typeof getNewsRole>> }).newsRole!;
  const { rows: existing } = await pool!.query(`SELECT * FROM news_articles WHERE id = $1`, [req.params.id]);
  if (!existing.length) { res.status(404).json({ success: false, error: "Article not found" }); return; }
  const article = existing[0];

  if (role.tier === "viewer" || (role.tier === "creator" && (article.created_by_user_id !== req.user!.userId || article.status === "published"))) {
    res.status(403).json({ success: false, error: "You don't have permission to delete this article." });
    return;
  }
  await pool!.query(`DELETE FROM news_articles WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

// POST /api/news/admin/articles/:id/image — upload/replace the hero image.
// Same permission rule as editing the article itself.
router.post(
  "/admin/articles/:id/image",
  requireAuth,
  requireNewsAccess,
  (req: Request, res: Response, next) => {
    imageUpload.single("image")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE" ? "Image exceeds the 8MB limit" : err.message;
        res.status(400).json({ success: false, error: message });
        return;
      }
      if (err) { next(err); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
  const role = (req as Request & { newsRole?: Awaited<ReturnType<typeof getNewsRole>> }).newsRole!;
  if (role.tier === "viewer") { res.status(403).json({ success: false, error: "Your News Management role doesn't include editing articles." }); return; }
  if (!req.file) { res.status(400).json({ success: false, error: "No image file provided" }); return; }
  if (!req.file.mimetype.startsWith("image/")) { res.status(400).json({ success: false, error: "File must be an image" }); return; }

  const { rows: existing } = await pool!.query(`SELECT * FROM news_articles WHERE id = $1`, [req.params.id]);
  if (!existing.length) { res.status(404).json({ success: false, error: "Article not found" }); return; }
  const article = existing[0];
  if (role.tier === "creator" && (article.created_by_user_id !== req.user!.userId || article.status === "published")) {
    res.status(403).json({ success: false, error: "You can only edit your own unpublished articles." });
    return;
  }

  await pool!.query(
    `UPDATE news_articles SET hero_image_data = $1, hero_image_mime_type = $2, updated_at = now() WHERE id = $3`,
    [req.file.buffer.toString("base64"), req.file.mimetype, req.params.id]
  );
  res.json({ success: true, data: { hasHeroImage: true } });
  }
);

// GET /api/news/admin/articles/:id/image — preview in the editor regardless
// of publish status (unlike the public endpoint, which only serves
// published articles' images).
router.get("/admin/articles/:id/image", requireAuth, requireNewsAccess, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT hero_image_data, hero_image_mime_type FROM news_articles WHERE id = $1`, [req.params.id]);
  if (!rows.length || !rows[0].hero_image_data) { res.status(404).json({ success: false, error: "No image on this article" }); return; }
  res.setHeader("Content-Type", rows[0].hero_image_mime_type || "image/jpeg");
  res.send(Buffer.from(rows[0].hero_image_data, "base64"));
});

// ─── Scheduled publishing ───────────────────────────────────────────────────
// Mirrors the reconciliation-job pattern used for VinkPay and KYC earlier
// this session: check periodically for anything whose scheduled time has
// arrived, and flip it live. Idempotent by construction -- the WHERE
// clause only ever matches rows still sitting in 'scheduled', so a
// duplicate tick of the interval can't double-publish anything.
export async function publishScheduledArticles(): Promise<{ published: number }> {
  if (!hasDb || !pool) return { published: 0 };
  const { rows } = await pool.query(
    `UPDATE news_articles SET status = 'published', published_at = now(), updated_at = now()
     WHERE status = 'scheduled' AND scheduled_at <= now() RETURNING id, title`
  );
  return { published: rows.length };
}

export function startScheduledPublishJob(): () => void {
  const interval = setInterval(() => {
    publishScheduledArticles()
      .then(({ published }) => { if (published > 0) console.log(`[news] Published ${published} scheduled article(s).`); })
      .catch(err => console.error("[news] Scheduled publish job error:", err));
  }, 60_000); // checked every minute -- scheduling is typically set to the hour/day, not the second, so this granularity is plenty
  return () => clearInterval(interval);
}

export default router;
