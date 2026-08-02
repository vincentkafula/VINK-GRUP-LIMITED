import { Router, Request, Response } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: ReturnType<typeof Router> = Router();

// ─── Row → API shape mappers (snake_case columns → camelCase JSON) ──────────
const mapCategory = (r: any) => ({
  id: r.id, name: r.name, slug: r.slug, icon: r.icon, parentId: r.parent_id,
  productCount: Number(r.product_count ?? 0), featured: r.featured,
});

const mapSeller = (r: any) => ({
  id: r.id, userId: r.user_id, storeName: r.store_name, storeSlug: r.store_slug,
  description: r.description, logoUrl: r.logo_url, bannerUrl: r.banner_url, email: r.email,
  phone: r.phone, country: r.country, status: r.status, kycVerified: r.kyc_verified, taxId: r.tax_id,
  totalProducts: Number(r.total_products ?? 0), totalSales: r.total_sales, totalRevenue: Number(r.total_revenue),
  avgRating: Number(r.avg_rating), reviewCount: r.review_count, joinedAt: r.joined_at, commissionPct: Number(r.commission_pct),
});

const mapProduct = (r: any, sellerName?: string, categoryName?: string) => ({
  id: r.id, sellerId: r.seller_id, sellerName: sellerName ?? r.seller_name,
  categoryId: r.category_id, categoryName: categoryName ?? r.category_name,
  name: r.name, slug: r.slug, description: r.description, shortDescription: r.short_description,
  price: Number(r.price), compareAtPrice: r.compare_at_price !== null ? Number(r.compare_at_price) : null,
  currency: r.currency, images: r.images, emoji: r.emoji, status: r.status, stock: r.stock, sku: r.sku,
  brand: r.brand, tags: r.tags, attributes: r.attributes, variants: r.variants,
  avgRating: Number(r.avg_rating), reviewCount: r.review_count, totalSold: r.total_sold,
  isFeatured: r.is_featured, isFlashDeal: r.is_flash_deal, flashDealEndsAt: r.flash_deal_ends_at,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapOrder = (r: any) => ({
  id: r.id, orderNumber: r.order_number, userId: r.user_id, customerName: r.customer_name,
  customerEmail: r.customer_email, items: r.items, subtotal: Number(r.subtotal),
  shippingCost: Number(r.shipping_cost), taxAmount: Number(r.tax_amount), discountAmount: Number(r.discount_amount),
  totalAmount: Number(r.total_amount), currency: r.currency, status: r.status, paymentStatus: r.payment_status,
  paymentMethod: r.payment_method, shippingAddress: r.shipping_address, shippingStatus: r.shipping_status,
  trackingNumber: r.tracking_number, carrier: r.carrier, estimatedDelivery: r.estimated_delivery,
  couponCode: r.coupon_code, notes: r.notes, placedAt: r.placed_at, confirmedAt: r.confirmed_at,
  shippedAt: r.shipped_at, deliveredAt: r.delivered_at, cancelledAt: r.cancelled_at,
});

const mapReview = (r: any) => ({
  id: r.id, productId: r.product_id, userId: r.user_id, orderId: r.order_id, rating: r.rating,
  title: r.title, body: r.body, verifiedPurchase: r.verified_purchase, status: r.status,
  helpful: r.helpful, images: r.images, createdAt: r.created_at, reviewerName: r.reviewer_name,
});

const mapAddress = (r: any) => ({
  id: r.id, userId: r.user_id, label: r.label, firstName: r.first_name, lastName: r.last_name,
  line1: r.line1, line2: r.line2, city: r.city, state: r.state, postalCode: r.postal_code,
  country: r.country, phone: r.phone, isDefault: r.is_default,
});

const cartRowToApi = (r: any) => ({
  id: r.id, userId: r.user_id, items: r.items, couponCode: r.coupon_code, couponDiscount: Number(r.coupon_discount),
  subtotal: Number(r.subtotal), shipping: Number(r.shipping), tax: Number(r.tax), total: Number(r.total),
  createdAt: r.created_at, updatedAt: r.updated_at,
});

function recalcCartTotals(items: any[], coupon: any | null) {
  const subtotal = +items.reduce((s, i) => s + i.unitPrice * i.quantity, 0).toFixed(2);
  let couponDiscount = 0;
  if (coupon) {
    if (coupon.type === "percentage") couponDiscount = Math.min(+(subtotal * Number(coupon.value) / 100).toFixed(2), coupon.max_discount_amount ? Number(coupon.max_discount_amount) : Infinity);
    else if (coupon.type === "fixed_amount") couponDiscount = Math.min(Number(coupon.value), subtotal);
  }
  const shipping = subtotal > 500 || coupon?.type === "free_shipping" ? 0 : (items.length ? 99 : 0);
  const tax = +(subtotal * 0.15).toFixed(2);
  const total = +(subtotal + shipping + tax - couponDiscount).toFixed(2);
  return { subtotal, shipping, tax, total, couponDiscount };
}

// ── CATEGORIES ────────────────────────────────────────────────────────────────
router.get("/categories", async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`
    SELECT c.*, COUNT(p.id)::int AS product_count
    FROM mkt_categories c
    LEFT JOIN mkt_products p ON p.category_id = c.id AND p.status = 'active'
    GROUP BY c.id ORDER BY c.name`);
  res.json({ success: true, data: rows.map(mapCategory) });
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
router.get("/products", async (req: Request, res: Response): Promise<void> => {
  const { category, search, minPrice, maxPrice, brand, rating, sort, page: pg, limit: lim, featured, flashDeal } = req.query as Record<string, string>;
  const page = Math.max(1, Number(pg) || 1);
  const limit = Math.min(48, Number(lim) || 12);

  const where: string[] = [`p.status = 'active'`];
  const params: unknown[] = [];
  const p = (val: unknown) => { params.push(val); return `$${params.length}`; };

  if (category)  where.push(`(p.category_id = ${p(category)} OR LOWER(c.name) = LOWER(${p(category)}))`);
  if (search)    where.push(`(LOWER(p.name) LIKE ${p(`%${search.toLowerCase()}%`)} OR LOWER(p.brand) LIKE ${p(`%${search.toLowerCase()}%`)} OR p.tags::text ILIKE ${p(`%${search.toLowerCase()}%`)})`);
  if (minPrice)  where.push(`p.price >= ${p(Number(minPrice))}`);
  if (maxPrice)  where.push(`p.price <= ${p(Number(maxPrice))}`);
  if (brand)     where.push(`LOWER(p.brand) = LOWER(${p(brand)})`);
  if (rating)    where.push(`p.avg_rating >= ${p(Number(rating))}`);
  if (featured === "true")  where.push(`p.is_featured = ${p(true)}`);
  if (flashDeal === "true") where.push(`p.is_flash_deal = ${p(true)}`);

  let orderBy = "p.created_at DESC";
  if (sort === "price_asc") orderBy = "p.price ASC";
  else if (sort === "price_desc") orderBy = "p.price DESC";
  else if (sort === "rating") orderBy = "p.avg_rating DESC";
  else if (sort === "popular") orderBy = "p.total_sold DESC";
  else if (sort === "newest") orderBy = "p.created_at DESC";

  const baseQuery = `FROM mkt_products p JOIN mkt_sellers s ON s.id = p.seller_id JOIN mkt_categories c ON c.id = p.category_id WHERE ${where.join(" AND ")}`;
  const { rows: countRows } = await pool!.query(`SELECT COUNT(*)::int AS total ${baseQuery}`, params);
  const total = countRows[0].total;

  const { rows } = await pool!.query(
    `SELECT p.*, s.store_name AS seller_name, c.name AS category_name ${baseQuery} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  const { rows: brandRows } = await pool!.query(`SELECT DISTINCT brand FROM mkt_products WHERE status = 'active' ORDER BY brand`);

  res.json({
    success: true,
    data: rows.map(r => mapProduct(r)),
    meta: { page, limit, total, pages: Math.ceil(total / limit), brands: brandRows.map(b => b.brand) },
  });
});

router.get("/products/search-suggest", async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q ?? "").toLowerCase();
  if (!q || q.length < 2) { res.json({ success: true, data: [] }); return; }
  const { rows } = await pool!.query(
    `SELECT id, name, price, emoji, (SELECT name FROM mkt_categories WHERE id = category_id) AS category
     FROM mkt_products WHERE LOWER(name) LIKE $1 OR LOWER(brand) LIKE $1 LIMIT 6`,
    [`%${q}%`]
  );
  res.json({ success: true, data: rows.map(r => ({ id: r.id, name: r.name, price: Number(r.price), emoji: r.emoji, category: r.category })) });
});

router.get("/products/:id", async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(
    `SELECT p.*, s.store_name AS seller_name, c.name AS category_name
     FROM mkt_products p JOIN mkt_sellers s ON s.id = p.seller_id JOIN mkt_categories c ON c.id = p.category_id
     WHERE p.id::text = $1 OR p.slug = $1`, [req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Product not found" }); return; }
  const product = mapProduct(rows[0]);
  const [{ rows: sellerRows }, { rows: reviewRows }, { rows: relatedRows }] = await Promise.all([
    pool!.query(`SELECT * FROM mkt_sellers WHERE id = $1`, [product.sellerId]),
    pool!.query(`SELECT * FROM mkt_reviews WHERE product_id = $1 AND status = 'approved' ORDER BY created_at DESC`, [product.id]),
    pool!.query(`SELECT p.*, s.store_name AS seller_name, c.name AS category_name FROM mkt_products p
       JOIN mkt_sellers s ON s.id = p.seller_id JOIN mkt_categories c ON c.id = p.category_id
       WHERE p.category_id = $1 AND p.id != $2 AND p.status = 'active' LIMIT 4`, [product.categoryId, product.id]),
  ]);
  res.json({
    success: true,
    data: {
      product, seller: sellerRows[0] ? mapSeller(sellerRows[0]) : null,
      reviews: reviewRows.map(mapReview), related: relatedRows.map(r => mapProduct(r)),
    },
  });
});

// ── CART ──────────────────────────────────────────────────────────────────────
router.get("/cart/:userId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_carts WHERE user_id = $1`, [req.params.userId]);
  res.json({ success: true, data: rows[0] ? cartRowToApi(rows[0]) : null });
});

async function getOrCreateCart(userId: string) {
  const { rows } = await pool!.query(`SELECT * FROM mkt_carts WHERE user_id = $1`, [userId]);
  if (rows.length) return rows[0];
  const { rows: inserted } = await pool!.query(
    `INSERT INTO mkt_carts (user_id, items) VALUES ($1, '[]') RETURNING *`, [userId]
  );
  return inserted[0];
}

async function saveCart(cartId: string, items: any[], couponCode: string | null) {
  let coupon = null;
  if (couponCode) {
    const { rows } = await pool!.query(`SELECT * FROM mkt_coupons WHERE code = $1 AND active = true`, [couponCode]);
    coupon = rows[0] ?? null;
  }
  const totals = recalcCartTotals(items, coupon);
  const { rows } = await pool!.query(
    `UPDATE mkt_carts SET items = $1, coupon_code = $2, coupon_discount = $3, subtotal = $4,
       shipping = $5, tax = $6, total = $7, updated_at = now() WHERE id = $8 RETURNING *`,
    [JSON.stringify(items), couponCode, totals.couponDiscount, totals.subtotal, totals.shipping, totals.tax, totals.total, cartId]
  );
  return rows[0];
}

router.post("/cart/:userId/add", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { productId, variantId, quantity } = req.body;
  const { rows: productRows } = await pool!.query(
    `SELECT p.*, s.store_name AS seller_name FROM mkt_products p JOIN mkt_sellers s ON s.id = p.seller_id WHERE p.id::text = $1`, [productId]
  );
  if (!productRows.length) { res.status(404).json({ success: false, error: "Product not found" }); return; }
  const product = mapProduct(productRows[0]);

  const cartRow = await getOrCreateCart(req.params.userId);
  const items: any[] = cartRow.items;
  const existing = items.find(i => i.productId === productId && i.variantId === (variantId ?? null));
  if (existing) existing.quantity += (quantity ?? 1);
  else items.push({ productId, variantId: variantId ?? null, quantity: quantity ?? 1, unitPrice: product.price, name: product.name, emoji: product.emoji, sellerName: product.sellerName, maxStock: product.stock });

  const updated = await saveCart(cartRow.id, items, cartRow.coupon_code);
  res.json({ success: true, data: cartRowToApi(updated) });
});

router.patch("/cart/:userId/item/:productId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_carts WHERE user_id = $1`, [req.params.userId]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Cart not found" }); return; }
  let items: any[] = rows[0].items;
  const { quantity } = req.body;
  if (quantity <= 0) items = items.filter(i => i.productId !== req.params.productId);
  else { const item = items.find(i => i.productId === req.params.productId); if (item) item.quantity = quantity; }
  const updated = await saveCart(rows[0].id, items, rows[0].coupon_code);
  res.json({ success: true, data: cartRowToApi(updated) });
});

router.delete("/cart/:userId/item/:productId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_carts WHERE user_id = $1`, [req.params.userId]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Cart not found" }); return; }
  const items = (rows[0].items as any[]).filter(i => i.productId !== req.params.productId);
  const updated = await saveCart(rows[0].id, items, rows[0].coupon_code);
  res.json({ success: true, data: cartRowToApi(updated) });
});

router.post("/cart/:userId/coupon", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_carts WHERE user_id = $1`, [req.params.userId]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Cart not found" }); return; }
  const { rows: couponRows } = await pool!.query(`SELECT * FROM mkt_coupons WHERE code = $1 AND active = true`, [String(req.body.code ?? "").toUpperCase()]);
  if (!couponRows.length) { res.status(400).json({ success: false, error: "Invalid or expired coupon code" }); return; }
  const coupon = couponRows[0];
  const currentSubtotal = Number(rows[0].subtotal);
  if (currentSubtotal < Number(coupon.min_order_amount)) { res.status(400).json({ success: false, error: `Minimum order of R${coupon.min_order_amount} required` }); return; }
  const updated = await saveCart(rows[0].id, rows[0].items, coupon.code);
  res.json({ success: true, data: cartRowToApi(updated), message: `Coupon applied — you save R${Number(updated.coupon_discount).toFixed(2)}!` });
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
router.get("/orders", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId, status, page: pg, limit: lim } = req.query as Record<string, string>;
  const page = Math.max(1, Number(pg) || 1);
  const limit = Math.min(48, Number(lim) || 12);
  const where: string[] = []; const params: unknown[] = [];
  if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows: countRows } = await pool!.query(`SELECT COUNT(*)::int AS total FROM mkt_orders ${whereSql}`, params);
  const { rows } = await pool!.query(
    `SELECT * FROM mkt_orders ${whereSql} ORDER BY placed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );
  res.json({ success: true, data: rows.map(mapOrder), meta: { page, limit, total: countRows[0].total, pages: Math.ceil(countRows[0].total / limit) } });
});

router.get("/orders/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_orders WHERE id::text = $1 OR order_number = $1`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Order not found" }); return; }
  res.json({ success: true, data: mapOrder(rows[0]) });
});

router.post("/orders", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId, addressId, paymentMethod } = req.body;
  const { rows: cartRows } = await pool!.query(`SELECT * FROM mkt_carts WHERE user_id = $1`, [userId]);
  const cart = cartRows[0];
  if (!cart || !cart.items.length) { res.status(400).json({ success: false, error: "Cart is empty" }); return; }

  const { rows: addrRows } = await pool!.query(
    addressId ? `SELECT * FROM mkt_addresses WHERE id::text = $1` : `SELECT * FROM mkt_addresses LIMIT 1`,
    addressId ? [addressId] : []
  );
  const addr = addrRows[0] ?? {};

  const { rows: countRows } = await pool!.query(`SELECT COUNT(*)::int AS n FROM mkt_orders`);
  const orderNumber = `VNK-ORD-${String(100000 + countRows[0].n).padStart(6, "0")}`;
  const items = cart.items.map((i: any) => ({
    productId: i.productId, productName: i.name, emoji: i.emoji, variantId: i.variantId, variantLabel: null,
    quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.unitPrice * i.quantity, sellerId: "sel-01", sellerName: i.sellerName,
  }));
  const shippingAddress = {
    label: "Home", firstName: addr.first_name ?? "Customer", lastName: addr.last_name ?? "", line1: addr.line1 ?? "",
    line2: null, city: addr.city ?? "", state: addr.state ?? "", postalCode: addr.postal_code ?? "", country: "ZA", phone: addr.phone ?? "",
  };

  const { rows } = await pool!.query(
    `INSERT INTO mkt_orders (order_number, user_id, customer_name, customer_email, items, subtotal, shipping_cost,
       tax_amount, discount_amount, total_amount, currency, status, payment_status, payment_method, shipping_address,
       shipping_status, estimated_delivery, coupon_code, confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ZAR','pending','paid',$11,$12,'not_shipped', now() + interval '5 days', $13, now())
     RETURNING *`,
    [orderNumber, userId ?? "demo-customer-001", `${shippingAddress.firstName} ${shippingAddress.lastName}`, "customer@example.com",
     JSON.stringify(items), cart.subtotal, cart.shipping, cart.tax, cart.coupon_discount, cart.total,
     paymentMethod ?? "card", JSON.stringify(shippingAddress), cart.coupon_code]
  );

  await saveCart(cart.id, [], null);
  res.status(201).json({ success: true, data: mapOrder(rows[0]) });
});

// ── REVIEWS ───────────────────────────────────────────────────────────────────
router.get("/products/:id/reviews", async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_reviews WHERE product_id = $1 AND status = 'approved' ORDER BY created_at DESC`, [req.params.id]);
  const avg = rows.length ? +(rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : 0;
  const dist = [5, 4, 3, 2, 1].map(stars => ({ stars, count: rows.filter(r => r.rating === stars).length }));
  res.json({ success: true, data: rows.map(mapReview), meta: { total: rows.length, avg, distribution: dist } });
});

router.post("/products/:id/reviews", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId, orderId, rating, title, body } = req.body;
  if (!rating || rating < 1 || rating > 5) { res.status(400).json({ success: false, error: "rating must be 1-5" }); return; }
  const { rows } = await pool!.query(
    `INSERT INTO mkt_reviews (product_id, user_id, order_id, rating, title, body, verified_purchase, status)
     VALUES ($1,$2,$3,$4,$5,$6,true,'approved') RETURNING *`,
    [req.params.id, userId, orderId, rating, title, body]
  );
  res.status(201).json({ success: true, data: mapReview(rows[0]) });
});

// ── WISHLIST ──────────────────────────────────────────────────────────────────
router.get("/wishlist/:userId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(
    `SELECT p.*, s.store_name AS seller_name, c.name AS category_name FROM mkt_wishlist_items w
     JOIN mkt_products p ON p.id = w.product_id JOIN mkt_sellers s ON s.id = p.seller_id
     JOIN mkt_categories c ON c.id = p.category_id WHERE w.user_id = $1`, [req.params.userId]
  );
  res.json({ success: true, data: rows.map(r => mapProduct(r)), meta: { total: rows.length } });
});

router.post("/wishlist/:userId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT 1 FROM mkt_wishlist_items WHERE user_id = $1 AND product_id = $2`, [req.params.userId, req.body.productId]);
  const exists = rows.length > 0;
  if (!exists) await pool!.query(`INSERT INTO mkt_wishlist_items (user_id, product_id) VALUES ($1,$2)`, [req.params.userId, req.body.productId]);
  res.json({ success: true, message: exists ? "Already in wishlist" : "Added to wishlist" });
});

router.delete("/wishlist/:userId/:productId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  await pool!.query(`DELETE FROM mkt_wishlist_items WHERE user_id = $1 AND product_id = $2`, [req.params.userId, req.params.productId]);
  res.json({ success: true });
});

// ── SELLERS ───────────────────────────────────────────────────────────────────
router.get("/sellers", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { status } = req.query as Record<string, string>;
  const { rows } = await pool!.query(status ? `SELECT * FROM mkt_sellers WHERE status = $1` : `SELECT * FROM mkt_sellers`, status ? [status] : []);
  res.json({ success: true, data: rows.map(mapSeller), meta: { total: rows.length } });
});

router.get("/sellers/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_sellers WHERE id = $1`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Seller not found" }); return; }
  const { rows: productRows } = await pool!.query(`SELECT p.*, s.store_name AS seller_name, c.name AS category_name FROM mkt_products p JOIN mkt_sellers s ON s.id=p.seller_id JOIN mkt_categories c ON c.id=p.category_id WHERE p.seller_id = $1`, [req.params.id]);
  const { rows: orderCountRows } = await pool!.query(`SELECT COUNT(*)::int AS n FROM mkt_orders WHERE items::text LIKE $1`, [`%"sellerId":"${req.params.id}"%`]);
  res.json({ success: true, data: { seller: mapSeller(rows[0]), products: productRows.map(r => mapProduct(r)), orderCount: orderCountRows[0].n } });
});

router.get("/sellers/:id/analytics", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_sellers WHERE id = $1`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Seller not found" }); return; }
  const { rows: productRows } = await pool!.query(`SELECT p.*, s.store_name AS seller_name, c.name AS category_name FROM mkt_products p JOIN mkt_sellers s ON s.id=p.seller_id JOIN mkt_categories c ON c.id=p.category_id WHERE p.seller_id = $1`, [req.params.id]);
  const revenue = Array.from({ length: 7 }, (_, i) => ({
    day: new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString("en", { weekday: "short" }),
    revenue: Math.floor(Math.random() * 20000 + 5000), orders: Math.floor(Math.random() * 20 + 5),
  }));
  const products = productRows.map(r => mapProduct(r));
  res.json({ success: true, data: { seller: mapSeller(rows[0]), products, revenue, topProducts: products.slice(0, 3).map(p => ({ id: p.id, name: p.name, emoji: p.emoji, sold: p.totalSold, revenue: p.totalSold * p.price })) } });
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
router.get("/admin/stats", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const [{ rows: p }, { rows: s }, { rows: o }, { rows: rev }, { rows: pr }, { rows: ps }] = await Promise.all([
    pool!.query(`SELECT COUNT(*)::int AS n FROM mkt_products`),
    pool!.query(`SELECT COUNT(*)::int AS n FROM mkt_sellers`),
    pool!.query(`SELECT COUNT(*)::int AS n FROM mkt_orders`),
    pool!.query(`SELECT COALESCE(SUM(total_amount),0)::float AS n FROM mkt_orders`),
    pool!.query(`SELECT COUNT(*)::int AS n FROM mkt_reviews WHERE status = 'pending'`),
    pool!.query(`SELECT COUNT(*)::int AS n FROM mkt_sellers WHERE status = 'pending_kyc'`),
  ]);
  const { rows: cats } = await pool!.query(`SELECT c.name, COUNT(p.id)::int AS count FROM mkt_categories c LEFT JOIN mkt_products p ON p.category_id = c.id GROUP BY c.name ORDER BY count DESC LIMIT 5`);
  res.json({ success: true, data: {
    totalProducts: p[0].n, totalSellers: s[0].n, totalOrders: o[0].n, totalRevenue: rev[0].n,
    activeCustomers: 0, pendingReviews: pr[0].n, pendingSellerApprovals: ps[0].n, topCategories: cats,
  }});
});

router.get("/admin/orders", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { status } = req.query as Record<string, string>;
  const { rows } = await pool!.query(status ? `SELECT * FROM mkt_orders WHERE status = $1 ORDER BY placed_at DESC` : `SELECT * FROM mkt_orders ORDER BY placed_at DESC`, status ? [status] : []);
  res.json({ success: true, data: rows.map(mapOrder), meta: { total: rows.length } });
});

router.patch("/admin/orders/:id/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(
    `UPDATE mkt_orders SET status = $1, tracking_number = COALESCE($2, tracking_number) WHERE id::text = $3 RETURNING *`,
    [req.body.status, req.body.trackingNumber ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: "Order not found" }); return; }
  res.json({ success: true, data: mapOrder(rows[0]) });
});

router.get("/admin/products/pending", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT p.*, s.store_name AS seller_name, c.name AS category_name FROM mkt_products p JOIN mkt_sellers s ON s.id=p.seller_id JOIN mkt_categories c ON c.id=p.category_id WHERE p.status = 'pending_review'`);
  res.json({ success: true, data: rows.map(r => mapProduct(r)), meta: { total: rows.length } });
});

router.patch("/admin/products/:id/approve", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`UPDATE mkt_products SET status = 'active', updated_at = now() WHERE id::text = $1 RETURNING *`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ success: false, error: "Product not found" }); return; }
  res.json({ success: true, data: mapProduct(rows[0]) });
});

// ── ADDRESSES ─────────────────────────────────────────────────────────────────
router.get("/addresses/:userId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool!.query(`SELECT * FROM mkt_addresses WHERE user_id = $1`, [req.params.userId]);
  res.json({ success: true, data: rows.map(mapAddress) });
});

export default router;
