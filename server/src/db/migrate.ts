import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { pool, hasDb } from "./pool.js";
import { CATEGORIES, SELLERS, PRODUCTS, COUPONS, ADDRESSES } from "../data/marketplaceStore.js";
import { NEWS_ARTICLES } from "../data/newsData.js";
import { db as mvnoDb } from "../data/store.js";

/**
 * Creates the schema (if missing) and seeds it with the same demo data the
 * in-memory store ships with, so the DB-backed and in-memory code paths
 * show identical data. Safe to run on every boot — everything here is
 * idempotent (CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING).
 */
export async function migrateAndSeed(): Promise<void> {
  if (!hasDb || !pool) return;

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);

  const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM mkt_products");
  if (Number(rows[0].count) > 0) {
    console.log("[db] Schema up to date, tables already seeded — skipping seed.");
    await seedNews();
    await seedDefaultCustomer();
    await seedAccountRestructure();
    return;
  }

  console.log("[db] Seeding database with demo data...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const c of CATEGORIES) {
      await client.query(
        `INSERT INTO mkt_categories (id, name, slug, icon, parent_id, featured)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [c.id, c.name, c.slug, c.icon, c.parentId, c.featured]
      );
    }

    for (const s of SELLERS) {
      await client.query(
        `INSERT INTO mkt_sellers (id, user_id, store_name, store_slug, description, logo_url, banner_url,
           email, phone, country, status, kyc_verified, tax_id, total_sales, total_revenue,
           avg_rating, review_count, commission_pct, joined_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.userId, s.storeName, s.storeSlug, s.description, s.logoUrl, s.bannerUrl, s.email, s.phone,
         s.country, s.status, s.kycVerified, s.taxId, s.totalSales, s.totalRevenue, s.avgRating, s.reviewCount,
         s.commissionPct, s.joinedAt]
      );
    }

    for (const c of COUPONS) {
      await client.query(
        `INSERT INTO mkt_coupons (code, type, value, min_order_amount, max_discount_amount, active)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
        [c.code, c.type, c.value, c.minOrderAmount, c.maxDiscountAmount ?? null, c.active]
      );
    }

    for (const p of PRODUCTS) {
      await client.query(
        `INSERT INTO mkt_products (id, seller_id, category_id, name, slug, short_description, description,
           price, compare_at_price, currency, images, emoji, status, stock, sku, brand, tags, attributes,
           variants, avg_rating, review_count, total_sold, is_featured, is_flash_deal, flash_deal_ends_at,
           created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.sellerId, p.categoryId, p.name, p.slug, p.shortDescription, p.description, p.price,
         p.compareAtPrice, p.currency, JSON.stringify(p.images), p.emoji, p.status, p.stock, p.sku, p.brand,
         JSON.stringify(p.tags), JSON.stringify(p.attributes), JSON.stringify(p.variants), p.avgRating,
         p.reviewCount, p.totalSold, p.isFeatured, p.isFlashDeal, p.flashDealEndsAt, p.createdAt, p.updatedAt]
      );
    }

    for (const a of ADDRESSES) {
      await client.query(
        `INSERT INTO mkt_addresses (id, user_id, label, first_name, last_name, line1, line2, city, state,
           postal_code, country, phone, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
        [a.id, a.userId, a.label, a.firstName, a.lastName, a.line1, a.line2, a.city, a.state, a.postalCode,
         a.country, a.phone, a.isDefault ?? false]
      );
    }

    for (const u of mvnoDb.users) {
      await client.query(
        `INSERT INTO users (id, username, password_hash, role, name, email, last_login, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (username) DO NOTHING`,
        [u.id, u.username, u.passwordHash, u.role, u.name, u.email, u.lastLogin, u.createdAt]
      );
    }

    await seedDefaultCustomer(client);

    await client.query("COMMIT");
    console.log("[db] Seed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[db] Seed failed, rolled back:", err);
    throw err;
  } finally {
    client.release();
  }

  await seedNews();
}

// Default customer-role account, mirroring the default management account
// (superadmin) — see DEV_CREDENTIALS.md at the repo root for both. Exists
// so developers/QA always have one known account per role type to sign in
// with, without needing to register a fresh one every time. Change or
// remove before any real production launch.
//
// Called from BOTH the fresh-seed path (with the transaction's own client,
// so it commits atomically with everything else) and the already-seeded
// early-return path above (with its own connection) — a database that was
// already seeded with products before this account existed would otherwise
// never reach this insert at all, exactly like the news sync bug fixed
// earlier. Learn from that: anything added after the early-return gate
// needs to be called from both branches, not just written once and assumed
// to run.
async function seedDefaultCustomer(existingClient?: import("pg").PoolClient): Promise<void> {
  if (!hasDb || !pool) return;
  const client = existingClient ?? pool;
  await client.query(
    `INSERT INTO users (username, password_hash, role, name, email)
     VALUES ('customer1', $1, 'customer', 'Demo Customer', 'customer@vink.co.za')
     ON CONFLICT (username) DO NOTHING`,
    [bcrypt.hashSync("Customer@2026", 10)]
  );
}

// One-time account restructure: the original seeded account was
// username 'superadmin' / role 'superadmin'. That username is now reserved
// for a new, separate account (role 'owner') with a different dashboard
// destination once built — so the original account is renamed to 'admin'
// (same password, same role, just a different username) to free up
// 'superadmin' for the new one.
//
// Matches by email rather than the old username, since by the time this
// runs the username may already have been renamed on a previous boot —
// email is the stable identifier across the rename. Safe to run
// repeatedly: the UPDATE only matches a row still sitting at the old
// username, and the INSERT no-ops via ON CONFLICT once the new account
// exists.
//
// Called from the early-return path too, for the same reason
// seedDefaultCustomer is — this codebase's database has been seeded with
// products since early in this project, so anything added after that
// gate needs to run from both branches or it silently never executes
// against the real, already-seeded database.
async function seedAccountRestructure(): Promise<void> {
  if (!hasDb || !pool) return;
  await pool.query(
    `UPDATE users SET username = 'admin' WHERE username = 'superadmin' AND email = 'admin@vink.co.za'`
  );
  // The admin account's password was previously "Admin@1234" (see
  // DEV_CREDENTIALS.md's git history) -- now explicitly set to match
  // "superadmin"'s password, per the requirement that both management
  // accounts share one password and only the username determines which
  // dashboard a login routes to (admin -> BankingDashboard, superadmin ->
  // Management Panel; see LoginModal.tsx). Set unconditionally (not
  // ON CONFLICT DO NOTHING) since this needs to actually change the
  // password on a database that already seeded this row with the old one,
  // not just skip if the account already exists.
  await pool.query(
    `UPDATE users SET password_hash = $1 WHERE username = 'admin' AND email = 'admin@vink.co.za'`,
    [bcrypt.hashSync("Wakuca97950@", 10)]
  );
  await pool.query(
    `INSERT INTO users (username, password_hash, role, name, email)
     VALUES ('superadmin', $1, 'owner', 'System Owner', 'owner@vink.co.za')
     ON CONFLICT (username) DO NOTHING`,
    [bcrypt.hashSync("Wakuca97950@", 10)]
  );
}

// Synced independently of the main product/user seed above (own transaction)
// so news articles land even on a database that was already seeded with
// everything else before this table existed. Runs an upsert-and-prune sync
// on every boot rather than a one-time "only if empty" seed — editorial
// content changes over time, and a one-time seed would leave old/replaced
// articles stuck in the database forever with no way to update them short
// of a manual migration. Preserves view counts on articles that still exist
// (real reader engagement shouldn't reset just because copy was edited).
async function seedNews(): Promise<void> {
  if (!hasDb || !pool) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const a of NEWS_ARTICLES) {
      await client.query(
        `INSERT INTO news_articles (id, slug, title, subtitle, category, author, summary, body, tags,
           hero_gradient, emoji, read_minutes, featured, breaking, views, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
           category = EXCLUDED.category, author = EXCLUDED.author, summary = EXCLUDED.summary,
           body = EXCLUDED.body, tags = EXCLUDED.tags, hero_gradient = EXCLUDED.hero_gradient,
           emoji = EXCLUDED.emoji, read_minutes = EXCLUDED.read_minutes, featured = EXCLUDED.featured,
           breaking = EXCLUDED.breaking, published_at = EXCLUDED.published_at`,
        // Note: views intentionally excluded from the UPDATE SET above — real
        // engagement on an existing article is preserved across content edits.
        [a.id, a.slug, a.title, a.subtitle ?? null, a.category, a.author, a.summary, a.body, JSON.stringify(a.tags),
         a.heroGradient, a.emoji, a.readMinutes, a.featured ?? false, a.breaking ?? false, a.views, a.publishedAt]
      );
    }
    const currentIds = NEWS_ARTICLES.map(a => a.id);
    await client.query(`DELETE FROM news_articles WHERE id != ALL($1::text[])`, [currentIds]);
    await client.query("COMMIT");
    console.log(`[db] News sync complete (${NEWS_ARTICLES.length} articles).`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[db] News sync failed, rolled back:", err);
  } finally {
    client.release();
  }
}
