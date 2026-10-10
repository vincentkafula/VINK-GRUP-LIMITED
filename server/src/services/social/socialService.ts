import type { Db } from "../../portal/common.js";
import { saDay, saDayStart, isUniqueViolation } from "../../portal/common.js";
import { NETWORKS, type Network, type MetaClient, type MetaConfig, configured } from "./meta.js";
import { fetchProducts, productPost, type Product } from "./products.js";

/**
 * Social media posts, for the Management Panel and for the automatic posts.
 *
 * A post is written once and goes to the chosen networks (Facebook, Instagram, Threads) now or at a set time. What each network answered is kept, a failed network can
 * be tried again on its own, and a post is never sent twice: a network that already took it is skipped on a retry.
 *
 * Automatic posts (each is off until a Super Administrator switches it on, and posts only to the networks that are set up):
 *   launch    the days left before VINK launches: every day in the last 30 days, every week in the last 180, then monthly
 *   products  new products of Ballylife, a VINK Group company: up to two a day, from the shop's product list (BALLYLIFE_FEED_URL)
 * A post made by a person (kind blog, offer, career or manual) comes through create(); the other pages of the site are written by hand today, so announcing them is
 * one form in the panel.
 */
export const KINDS = ["manual", "blog", "offer", "career", "launch", "product"] as const;
export type Kind = (typeof KINDS)[number];
export type Status = "scheduled" | "posting" | "posted" | "partial" | "failed" | "cancelled";
export type NetOutcome = { ok: true; id: string } | { ok: false; error: string };
export interface SocialPost {
  id: string; kind: string; text: string; link: string | null; imageUrl: string | null; networks: Network[]; status: Status; scheduledAt: string;
  results: Partial<Record<Network, NetOutcome>>; createdBy: string; createdAt: string; postedAt: string | null; auto: boolean;
}
export interface AutoSetting { enabled: boolean; networks: Network[] }
export interface AutoSettings { launch: AutoSetting; products: AutoSetting }
export type SocialResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
export interface SocialUser { userId: string; username: string }

const bad = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
const https = (v: unknown, max = 500): string | null | undefined => { if (v === undefined || v === null || v === "") return null; return typeof v === "string" && v.length <= max && /^https:\/\/[^\s]+$/i.test(v.trim()) ? v.trim() : undefined; };
const DAY = 86_400_000;
export const LAUNCH_POST_HOUR = 8, PRODUCT_POST_HOUR = 10, MAX_PRODUCTS_PER_DAY = 2;

/** The lines the countdown posts take turns saying. They only say what the site already says: VINK is a preview until launch. */
const COUNTDOWN_LINES = [
  "Tap to pay on the taxi you already ride: AFC is getting ready for launch.",
  "One wallet and one card for your taxi fares, built for the people who ride, drive and own the taxis.",
  "Fleet tracking, payments and banking in one platform for passengers, drivers, owners and associations.",
  "Safer, cashless fares are coming to South African taxis.",
  "A bank built around transport. We are putting the finishing touches on it.",
];

export function launchPostFor(daysLeft: number, siteUrl: string, launchLabel = "June 2027"): { text: string; link: string; imageUrl: string } | null {
  if (daysLeft < 0) return null;
  const site = siteUrl.replace(/\/+$/, "");
  const head = daysLeft === 0 ? "Today is the day: VINK launches!" : daysLeft === 1 ? "1 day to go until VINK launches!" : `${daysLeft} days to go until VINK launches in ${launchLabel}.`;
  const body = daysLeft === 0 ? "Thank you for waiting with us." : COUNTDOWN_LINES[daysLeft % COUNTDOWN_LINES.length];
  const foot = daysLeft === 0 ? "" : " VINK is not yet in full operation; everything on our site is a preview.";
  return { text: `${head} ${body}${foot}`.trim(), link: site, imageUrl: `${site}/og-image.png` };
}
/** Whether a countdown post is due on a day with this many days left: daily in the last 30 days, weekly up to 180, monthly before that. */
export const launchDue = (daysLeft: number) => daysLeft >= 0 && (daysLeft <= 30 || (daysLeft <= 180 && daysLeft % 7 === 0) || daysLeft % 30 === 0);

export function createSocialService(deps: {
  db: Db; meta: MetaClient; config: MetaConfig; now?: () => Date; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv;
}) {
  const { db, meta, config } = deps, now = deps.now ?? (() => new Date()), env = deps.env ?? process.env;
  const siteUrl = () => (env.PUBLIC_SITE_URL ?? env.SITE_URL ?? "https://vink.co.za").replace(/\/+$/, "");
  const launchDate = () => (/^\d{4}-\d{2}-\d{2}$/.test(env.LAUNCH_DATE ?? "") ? String(env.LAUNCH_DATE) : "2027-06-01");
  const enabledNetworks = (): Network[] => NETWORKS.filter((n) => configured(config)[n]);

  const toPost = (r: Record<string, unknown>): SocialPost => ({
    id: String(r.id), kind: String(r.kind), text: String(r.text), link: r.link ? String(r.link) : null, imageUrl: r.image_url ? String(r.image_url) : null,
    networks: String(r.networks).split(",").filter((n): n is Network => (NETWORKS as readonly string[]).includes(n)), status: String(r.status) as Status,
    scheduledAt: new Date(String(r.scheduled_at)).toISOString(), results: safeJson(r.results), createdBy: String(r.created_by_name), createdAt: new Date(String(r.created_at)).toISOString(),
    postedAt: r.posted_at ? new Date(String(r.posted_at)).toISOString() : null, auto: !!r.auto_key,
  });
  function safeJson(v: unknown): SocialPost["results"] { try { const j = JSON.parse(String(v)); return j && typeof j === "object" ? j : {}; } catch { return {}; } }

  // ── Settings ───────────────────────────────────────────────────────────────

  async function getAuto(): Promise<AutoSettings> {
    const out: AutoSettings = { launch: { enabled: false, networks: [] }, products: { enabled: false, networks: [] } };
    for (const r of (await db.query(`SELECT key, value FROM social_settings WHERE key IN ('auto.launch','auto.products')`)).rows) {
      try { const j = JSON.parse(String(r.value)); const k = String(r.key).slice(5) as "launch" | "products"; out[k] = { enabled: j.enabled === true, networks: (Array.isArray(j.networks) ? j.networks : []).filter((n: unknown): n is Network => (NETWORKS as readonly string[]).includes(String(n))) }; } catch { /* keep the default */ }
    }
    return out;
  }
  async function setAuto(user: SocialUser, body: Record<string, unknown>): Promise<SocialResult<AutoSettings>> {
    const current = await getAuto();
    for (const key of ["launch", "products"] as const) {
      const v = body[key]; if (v === undefined) continue;
      if (!v || typeof v !== "object") return bad(400, "Send the settings as { enabled, networks }");
      const s = v as Record<string, unknown>;
      const nets = Array.isArray(s.networks) ? s.networks : current[key].networks;
      if (!nets.every((n) => (NETWORKS as readonly string[]).includes(String(n)))) return bad(400, "Choose Facebook, Instagram or Threads");
      const enabled = s.enabled === true;
      if (enabled && !nets.length) return bad(400, "Choose at least one network for this automatic post");
      const unset = (nets as Network[]).filter((n) => !configured(config)[n]);
      if (enabled && unset.length) return bad(409, `${unset.join(", ")} ${unset.length > 1 ? "are" : "is"} not set up yet`);
      if (enabled && key === "products" && !(env.BALLYLIFE_FEED_URL ?? "").trim()) return bad(409, "Add BALLYLIFE_FEED_URL (the address of the Ballylife product list) first");
      current[key] = { enabled, networks: nets as Network[] };
      await db.query(`INSERT INTO social_settings (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`, [`auto.${key}`, JSON.stringify(current[key]), now()]);
    }
    void user;
    return { ok: true, value: current };
  }

  async function status() {
    const days = Math.round((saDayStart(launchDate()).getTime() - saDayStart(saDay(now())).getTime()) / DAY);
    return { configured: configured(config), auto: await getAuto(), launchDate: launchDate(), daysToLaunch: days, productFeed: !!(env.BALLYLIFE_FEED_URL ?? "").trim(), site: siteUrl() };
  }

  // ── Posts ──────────────────────────────────────────────────────────────────

  async function list(limit = 50): Promise<SocialPost[]> {
    return (await db.query(`SELECT * FROM social_posts ORDER BY created_at DESC LIMIT $1`, [Math.min(Math.max(limit, 1), 200)])).rows.map(toPost);
  }
  async function get(id: string): Promise<SocialPost | null> {
    const r = (await db.query(`SELECT * FROM social_posts WHERE id = $1`, [id])).rows[0]; return r ? toPost(r) : null;
  }

  /** Sends a post to the networks that have not taken it yet, and records what each one answered. Safe to call twice at once: only one caller wins the post. */
  async function publish(id: string): Promise<SocialPost | null> {
    const claim = await db.query(`UPDATE social_posts SET status = 'posting' WHERE id = $1 AND status IN ('scheduled','failed','partial') RETURNING *`, [id]);
    if (!claim.rows.length) return get(id);
    const post = toPost(claim.rows[0]);
    const results = { ...post.results };
    for (const n of post.networks) {
      if (results[n]?.ok) continue;
      try { results[n] = await meta.post(n, { text: post.text, link: post.link, imageUrl: post.imageUrl }); }
      catch (e) { results[n] = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "failed" }; }
    }
    const okCount = post.networks.filter((n) => results[n]?.ok).length;
    const state: Status = okCount === post.networks.length ? "posted" : okCount > 0 ? "partial" : "failed";
    await db.query(`UPDATE social_posts SET status = $2, results = $3, posted_at = $4 WHERE id = $1`, [id, state, JSON.stringify(results), okCount > 0 ? now() : null]);
    return get(id);
  }

  async function create(user: SocialUser | null, a: Record<string, unknown>, auto?: { key: string }): Promise<SocialResult<SocialPost>> {
    const kind = String(a.kind ?? "manual"); if (!(KINDS as readonly string[]).includes(kind)) return bad(400, "Choose what kind of post this is");
    const text = typeof a.text === "string" ? a.text.replace(/\r\n/g, "\n").trim() : "";
    if (text.length < 3 || text.length > 2000) return bad(400, "Write the post, up to 2000 characters");
    const link = https(a.link), image = https(a.imageUrl);
    if (link === undefined) return bad(400, "The link must be a full https:// address");
    if (image === undefined) return bad(400, "The picture must be a full https:// address to a JPEG or PNG");
    const nets = Array.isArray(a.networks) ? [...new Set(a.networks.map(String))] : [];
    if (!nets.length || !nets.every((n) => (NETWORKS as readonly string[]).includes(n))) return bad(400, "Choose at least one network: Facebook, Instagram or Threads");
    const unset = (nets as Network[]).filter((n) => !configured(config)[n]);
    if (unset.length) return bad(409, `${unset.join(", ")} ${unset.length > 1 ? "are" : "is"} not set up yet. Ask the administrator to add the Meta keys.`);
    if (nets.includes("instagram") && !image) return bad(400, "Instagram needs a picture: add a picture address, or untick Instagram");
    let at = now();
    if (a.scheduleAt !== undefined && a.scheduleAt !== null && a.scheduleAt !== "") {
      const t = new Date(String(a.scheduleAt)); if (Number.isNaN(t.getTime())) return bad(400, "That date and time is not valid");
      if (t.getTime() > now().getTime() + 5000) { if (t.getTime() > now().getTime() + 90 * DAY) return bad(400, "Schedule within the next 90 days"); at = t; }
    }
    const id = crypto.randomUUID();
    // An automatic post happens once: the key is checked first, and the unique key backs that up if two workers race.
    if (auto && (await db.query(`SELECT 1 AS x FROM social_posts WHERE auto_key = $1`, [auto.key])).rows.length) return bad(409, "That post has already been made");
    try {
      await db.query(`INSERT INTO social_posts (id, kind, text, link, image_url, networks, status, scheduled_at, auto_key, created_by, created_by_name, created_at) VALUES ($1,$2,$3,$4,$5,$6,'scheduled',$7,$8,$9,$10,$11)`,
        [id, kind, text, link, image, nets.join(","), at, auto?.key ?? null, user?.userId ?? null, user?.username ?? "Automatic", now()]);
    } catch (e) { if (isUniqueViolation(e)) return bad(409, "That post has already been made"); throw e; }
    const due = at.getTime() <= now().getTime() + 5000;
    const post = due ? await publish(id) : await get(id);
    return { ok: true, value: post! };
  }

  async function retry(id: string): Promise<SocialResult<SocialPost>> {
    const p = await get(id); if (!p) return bad(404, "No such post");
    if (p.status !== "failed" && p.status !== "partial") return bad(409, "Only a post that failed on some network can be tried again");
    return { ok: true, value: (await publish(id))! };
  }
  async function cancel(id: string): Promise<SocialResult<SocialPost>> {
    const r = await db.query(`UPDATE social_posts SET status = 'cancelled' WHERE id = $1 AND status = 'scheduled' RETURNING id`, [id]);
    if (!r.rows.length) return bad(409, "Only a post that has not gone out yet can be cancelled");
    return { ok: true, value: (await get(id))! };
  }

  /** Sends the scheduled posts that are due. A post left "posting" by a restart is marked failed instead of being sent again, so nothing is posted twice. */
  async function publishDue(max = 10): Promise<number> {
    await db.query(`UPDATE social_posts SET status = 'failed', results = '{"interrupted":{"ok":false,"error":"The server restarted while posting; check the network before trying again"}}' WHERE status = 'posting' AND scheduled_at < $1`, [new Date(now().getTime() - 15 * 60_000)]);
    let n = 0;
    for (const r of (await db.query(`SELECT id FROM social_posts WHERE status = 'scheduled' AND scheduled_at <= $1 ORDER BY scheduled_at LIMIT $2`, [now(), max])).rows) { await publish(String(r.id)); n++; }
    return n;
  }

  // ── Automatic posts ────────────────────────────────────────────────────────

  async function runLaunch(auto: AutoSetting): Promise<number> {
    const today = saDay(now());
    if ((now().getTime() - saDayStart(today).getTime()) / 3_600_000 < LAUNCH_POST_HOUR) return 0;
    const daysLeft = Math.round((saDayStart(launchDate()).getTime() - saDayStart(today).getTime()) / DAY);
    if (!launchDue(daysLeft)) return 0;
    const p = launchPostFor(daysLeft, siteUrl()); if (!p) return 0;
    const nets = auto.networks.filter((n) => configured(config)[n]); if (!nets.length) return 0;
    const r = await create(null, { kind: "launch", ...p, networks: nets }, { key: `launch-${today}` });
    return r.ok ? 1 : 0;
  }
  async function runProducts(auto: AutoSetting): Promise<number> {
    const feed = (env.BALLYLIFE_FEED_URL ?? "").trim(); if (!feed) return 0;
    const today = saDay(now());
    if ((now().getTime() - saDayStart(today).getTime()) / 3_600_000 < PRODUCT_POST_HOUR) return 0;
    const nets = auto.networks.filter((n) => configured(config)[n]); if (!nets.length) return 0;
    const done = Number((await db.query(`SELECT COUNT(*) AS n FROM social_posts WHERE kind = 'product' AND created_at >= $1`, [saDayStart(today)])).rows[0].n);
    if (done >= MAX_PRODUCTS_PER_DAY) return 0;
    let products: Product[]; try { products = await fetchProducts(feed, env.BALLYLIFE_SITE_URL ?? "https://www.ballylife.com", deps.fetchImpl); } catch (e) { console.error("[social] Ballylife products:", e instanceof Error ? e.message : e); return 0; }
    let made = 0;
    for (const p of products) {
      if (done + made >= MAX_PRODUCTS_PER_DAY) break;
      if (nets.includes("instagram") && !p.imageUrl) continue;
      if ((await db.query(`SELECT 1 AS x FROM social_posts WHERE auto_key = $1`, [`product-${p.id}`])).rows.length) continue;
      const r = await create(null, { kind: "product", ...productPost(p), networks: nets }, { key: `product-${p.id}` });
      if (r.ok) made++;
    }
    return made;
  }
  /** Called every minute: scheduled posts that are due, then the automatic posts that are switched on. */
  async function tick(): Promise<{ scheduled: number; launch: number; products: number }> {
    const scheduled = await publishDue();
    const auto = await getAuto();
    const launch = auto.launch.enabled ? await runLaunch(auto.launch).catch((e) => { console.error("[social] launch post:", e instanceof Error ? e.message : e); return 0; }) : 0;
    const products = auto.products.enabled ? await runProducts(auto.products).catch((e) => { console.error("[social] product posts:", e instanceof Error ? e.message : e); return 0; }) : 0;
    return { scheduled, launch, products };
  }

  return { status, getAuto, setAuto, list, get, create, publish, retry, cancel, publishDue, tick, enabledNetworks, runLaunch, runProducts };
}
export type SocialService = ReturnType<typeof createSocialService>;
