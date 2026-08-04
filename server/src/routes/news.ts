import { Router, Request, Response } from "express";
import { pool, hasDb } from "../db/pool.js";
import { NEWS_ARTICLES } from "../data/newsData.js";

const router: ReturnType<typeof Router> = Router();

const mapArticle = (r: any) => ({
  id: r.id, slug: r.slug, title: r.title, subtitle: r.subtitle, category: r.category, author: r.author,
  summary: r.summary, body: r.body, tags: r.tags ?? [], heroGradient: r.hero_gradient, emoji: r.emoji,
  readMinutes: r.read_minutes, featured: r.featured, breaking: r.breaking, views: r.views, publishedAt: r.published_at,
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

  const where: string[] = []; const params: unknown[] = [];
  if (category && category !== "All") { params.push(category); where.push(`category = $${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`(title ILIKE $${params.length} OR summary ILIKE $${params.length})`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
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
  const { rows } = await pool.query(`SELECT category, COUNT(*)::int AS count FROM news_articles GROUP BY category ORDER BY category`);
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
     FROM news_articles ORDER BY views DESC LIMIT 5`
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

  const { rows } = await pool.query(`SELECT * FROM news_articles WHERE slug = $1`, [req.params.slug]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Article not found" }); return; }
  const article = rows[0];
  await pool.query(`UPDATE news_articles SET views = views + 1 WHERE id = $1`, [article.id]);
  const { rows: relatedRows } = await pool.query(
    `SELECT id, slug, title, subtitle, category, author, summary, tags, hero_gradient, emoji, read_minutes, featured, breaking, views, published_at
     FROM news_articles WHERE category = $1 AND slug != $2 ORDER BY published_at DESC LIMIT 3`,
    [article.category, article.slug]
  );
  res.json({ success: true, data: { article: mapArticle({ ...article, views: article.views + 1 }), related: relatedRows.map(mapArticle) } });
});

export default router;
