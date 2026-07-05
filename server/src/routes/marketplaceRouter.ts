import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import {
  PRODUCTS, SELLERS, CATEGORIES, ORDERS, REVIEWS,
  COUPONS, WISHLISTS, CARTS, ADDRESSES, getMarketplaceStats,
} from "../data/marketplaceStore.js";
import type { Cart, CartItem, Order, Review, WishlistItem } from "../types/marketplace.js";

const router: ReturnType<typeof Router> = Router();

// ── CATEGORIES ────────────────────────────────────────────────────────────────
router.get("/categories", (_req: Request, res: Response): void => {
  res.json({ success: true, data: CATEGORIES });
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
router.get("/products", (req: Request, res: Response): void => {
  const { category, search, minPrice, maxPrice, brand, rating, sort, page: pg, limit: lim, featured, flashDeal } = req.query as Record<string, string>;
  const page  = Math.max(1, Number(pg)  || 1);
  const limit = Math.min(48, Number(lim) || 12);
  let data = PRODUCTS.filter(p => p.status === "active");

  if (category)  data = data.filter(p => p.categoryId === category || p.categoryName.toLowerCase() === category.toLowerCase());
  if (search)    data = data.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.brand.toLowerCase().includes(search.toLowerCase()) || p.tags.some(t => t.includes(search.toLowerCase())));
  if (minPrice)  data = data.filter(p => p.price >= Number(minPrice));
  if (maxPrice)  data = data.filter(p => p.price <= Number(maxPrice));
  if (brand)     data = data.filter(p => p.brand.toLowerCase() === brand.toLowerCase());
  if (rating)    data = data.filter(p => p.avgRating >= Number(rating));
  if (featured === "true")   data = data.filter(p => p.isFeatured);
  if (flashDeal === "true")  data = data.filter(p => p.isFlashDeal);

  if (sort === "price_asc")    data.sort((a,b) => a.price - b.price);
  else if (sort === "price_desc") data.sort((a,b) => b.price - a.price);
  else if (sort === "rating")  data.sort((a,b) => b.avgRating - a.avgRating);
  else if (sort === "popular") data.sort((a,b) => b.totalSold - a.totalSold);
  else if (sort === "newest")  data.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = data.length;
  const brands = [...new Set(PRODUCTS.map(p => p.brand))];
  res.json({ success: true, data: data.slice((page-1)*limit, page*limit), meta: { page, limit, total, pages: Math.ceil(total/limit), brands } });
});

router.get("/products/search-suggest", (req: Request, res: Response): void => {
  const q = String(req.query.q ?? "").toLowerCase();
  if (!q || q.length < 2) { res.json({ success: true, data: [] }); return; }
  const suggestions = PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)).slice(0, 6).map(p => ({ id: p.id, name: p.name, price: p.price, emoji: p.emoji, category: p.categoryName }));
  res.json({ success: true, data: suggestions });
});

router.get("/products/:id", (req: Request, res: Response): void => {
  const product = PRODUCTS.find(p => p.id === req.params.id || p.slug === req.params.id);
  if (!product) { res.status(404).json({ success: false, error: "Product not found" }); return; }
  const seller  = SELLERS.find(s => s.id === product.sellerId);
  const reviews = REVIEWS.filter(r => r.productId === product.id && r.status === "approved");
  const related = PRODUCTS.filter(p => p.categoryId === product.categoryId && p.id !== product.id && p.status === "active").slice(0, 4);
  res.json({ success: true, data: { product, seller, reviews, related } });
});

// ── CART ──────────────────────────────────────────────────────────────────────
router.get("/cart/:userId", requireAuth, (req: Request, res: Response): void => {
  const cart = CARTS.find(c => c.userId === req.params.userId);
  res.json({ success: true, data: cart ?? null });
});

router.post("/cart/:userId/add", requireAuth, (req: Request, res: Response): void => {
  const { productId, variantId, quantity } = req.body;
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) { res.status(404).json({ success: false, error: "Product not found" }); return; }

  let cart = CARTS.find(c => c.userId === req.params.userId);
  if (!cart) {
    cart = { id: uuid(), userId: req.params.userId, items: [], couponCode: null, couponDiscount: 0, subtotal: 0, shipping: 0, tax: 0, total: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    CARTS.push(cart);
  }

  const existing = cart.items.find(i => i.productId === productId && i.variantId === (variantId ?? null));
  if (existing) { existing.quantity += (quantity ?? 1); }
  else {
    cart.items.push({ productId, variantId: variantId ?? null, quantity: quantity ?? 1, unitPrice: product.price, name: product.name, emoji: product.emoji, sellerName: product.sellerName, maxStock: product.stock });
  }
  recalcCart(cart);
  res.json({ success: true, data: cart });
});

router.patch("/cart/:userId/item/:productId", requireAuth, (req: Request, res: Response): void => {
  const cart = CARTS.find(c => c.userId === req.params.userId);
  if (!cart) { res.status(404).json({ success: false, error: "Cart not found" }); return; }
  const item = cart.items.find(i => i.productId === req.params.productId);
  if (!item) { res.status(404).json({ success: false, error: "Item not in cart" }); return; }
  const { quantity } = req.body;
  if (quantity <= 0) { cart.items = cart.items.filter(i => i.productId !== req.params.productId); }
  else { item.quantity = quantity; }
  recalcCart(cart);
  res.json({ success: true, data: cart });
});

router.delete("/cart/:userId/item/:productId", requireAuth, (req: Request, res: Response): void => {
  const cart = CARTS.find(c => c.userId === req.params.userId);
  if (!cart) { res.status(404).json({ success: false, error: "Cart not found" }); return; }
  cart.items = cart.items.filter(i => i.productId !== req.params.productId);
  recalcCart(cart);
  res.json({ success: true, data: cart });
});

router.post("/cart/:userId/coupon", requireAuth, (req: Request, res: Response): void => {
  const cart = CARTS.find(c => c.userId === req.params.userId);
  if (!cart) { res.status(404).json({ success: false, error: "Cart not found" }); return; }
  const coupon = COUPONS.find(c => c.code === req.body.code?.toUpperCase() && c.active);
  if (!coupon) { res.status(400).json({ success: false, error: "Invalid or expired coupon code" }); return; }
  if (cart.subtotal < coupon.minOrderAmount) { res.status(400).json({ success: false, error: `Minimum order of R${coupon.minOrderAmount} required` }); return; }
  cart.couponCode = coupon.code;
  recalcCart(cart, coupon);
  res.json({ success: true, data: cart, message: `Coupon applied — you save R${cart.couponDiscount.toFixed(2)}!` });
});

function recalcCart(cart: Cart, coupon?: typeof COUPONS[0]) {
  const cp = coupon ?? COUPONS.find(c => c.code === cart.couponCode && c.active);
  cart.subtotal = +cart.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0).toFixed(2);
  if (cp) {
    if (cp.type === "percentage")   cart.couponDiscount = Math.min(+(cart.subtotal * cp.value / 100).toFixed(2), cp.maxDiscountAmount ?? Infinity);
    else if (cp.type === "fixed_amount") cart.couponDiscount = Math.min(cp.value, cart.subtotal);
    else cart.couponDiscount = 0;
  }
  cart.shipping = cart.subtotal > 500 || cp?.type === "free_shipping" ? 0 : 99;
  cart.tax      = +(cart.subtotal * 0.15).toFixed(2);
  cart.total    = +(cart.subtotal + cart.shipping + cart.tax - cart.couponDiscount).toFixed(2);
  cart.updatedAt = new Date().toISOString();
}

// ── ORDERS ────────────────────────────────────────────────────────────────────
router.get("/orders", requireAuth, (req: Request, res: Response): void => {
  const { userId, status, page: pg, limit: lim } = req.query as Record<string, string>;
  const page = Math.max(1, Number(pg) || 1);
  const limit = Math.min(20, Number(lim) || 10);
  let data = [...ORDERS];
  if (userId) data = data.filter(o => o.userId === userId);
  if (status) data = data.filter(o => o.status === status);
  data.sort((a,b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
  const total = data.length;
  res.json({ success: true, data: data.slice((page-1)*limit, page*limit), meta: { page, limit, total } });
});

router.get("/orders/:id", requireAuth, (req: Request, res: Response): void => {
  const order = ORDERS.find(o => o.id === req.params.id || o.orderNumber === req.params.id);
  if (!order) { res.status(404).json({ success: false, error: "Order not found" }); return; }
  res.json({ success: true, data: order });
});

router.post("/orders", requireAuth, (req: Request, res: Response): void => {
  const { userId, cartId, addressId, shippingMethod, paymentMethod } = req.body;
  const cart = CARTS.find(c => c.id === cartId || c.userId === userId);
  if (!cart || cart.items.length === 0) { res.status(400).json({ success: false, error: "Cart is empty" }); return; }
  const addr = ADDRESSES.find(a => a.id === addressId) ?? ADDRESSES[0];
  const order: Order = {
    id: uuid(), orderNumber: `VNK-ORD-${String(100000 + ORDERS.length).padStart(6,"0")}`,
    userId: userId ?? "demo-customer-001",
    customerName: `${addr?.firstName} ${addr?.lastName}`,
    customerEmail: "customer@example.com",
    items: cart.items.map(i => ({ productId:i.productId, productName:i.name, emoji:i.emoji, variantId:i.variantId, variantLabel:null, quantity:i.quantity, unitPrice:i.unitPrice, totalPrice:i.unitPrice*i.quantity, sellerId:"sel-01", sellerName:i.sellerName })),
    subtotal: cart.subtotal, shippingCost: cart.shipping, taxAmount: cart.tax, discountAmount: cart.couponDiscount,
    totalAmount: cart.total, currency: "ZAR", status: "pending", paymentStatus: "paid",
    paymentMethod: (paymentMethod ?? "card") as Order["paymentMethod"],
    shippingAddress: { label:"Home", firstName: addr?.firstName ?? "Customer", lastName: addr?.lastName ?? "", line1: addr?.line1 ?? "", line2: null, city: addr?.city ?? "", state: addr?.state ?? "", postalCode: addr?.postalCode ?? "", country: "ZA", phone: addr?.phone ?? "" },
    shippingStatus: "not_shipped", trackingNumber: null, carrier: null,
    estimatedDelivery: new Date(Date.now() + 5*86400000).toISOString(),
    couponCode: cart.couponCode, notes: null, placedAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(), shippedAt: null, deliveredAt: null, cancelledAt: null,
  };
  ORDERS.push(order);
  cart.items = []; recalcCart(cart);
  res.status(201).json({ success: true, data: order });
});

// ── REVIEWS ───────────────────────────────────────────────────────────────────
router.get("/products/:id/reviews", (req: Request, res: Response): void => {
  const reviews = REVIEWS.filter(r => r.productId === req.params.id && r.status === "approved");
  const avg = reviews.length ? +(reviews.reduce((s,r) => s+r.rating, 0) / reviews.length).toFixed(1) : 0;
  const dist = [5,4,3,2,1].map(s => ({ stars: s, count: reviews.filter(r => r.rating === s).length }));
  res.json({ success: true, data: reviews, meta: { total: reviews.length, avg, distribution: dist } });
});

router.post("/products/:id/reviews", requireAuth, (req: Request, res: Response): void => {
  const { userId, orderId, rating, title, body } = req.body;
  if (!rating || rating < 1 || rating > 5) { res.status(400).json({ success: false, error: "rating must be 1-5" }); return; }
  const review: Review = { id: uuid(), productId: req.params.id, userId, orderId, rating, title, body, verifiedPurchase: true, status: "approved", helpful: 0, images: [], createdAt: new Date().toISOString(), reviewerName: "Verified Buyer" };
  REVIEWS.push(review);
  res.status(201).json({ success: true, data: review });
});

// ── WISHLIST ──────────────────────────────────────────────────────────────────
router.get("/wishlist/:userId", requireAuth, (req: Request, res: Response): void => {
  const items = WISHLISTS.filter(w => w.userId === req.params.userId);
  const products = items.map(w => PRODUCTS.find(p => p.id === w.productId)).filter(Boolean);
  res.json({ success: true, data: products, meta: { total: products.length } });
});

router.post("/wishlist/:userId", requireAuth, (req: Request, res: Response): void => {
  const { productId } = req.body;
  const exists = WISHLISTS.find(w => w.userId === req.params.userId && w.productId === productId);
  if (!exists) WISHLISTS.push({ userId: req.params.userId, productId, addedAt: new Date().toISOString() });
  res.json({ success: true, message: exists ? "Already in wishlist" : "Added to wishlist" });
});

router.delete("/wishlist/:userId/:productId", requireAuth, (req: Request, res: Response): void => {
  const idx = WISHLISTS.findIndex(w => w.userId === req.params.userId && w.productId === req.params.productId);
  if (idx !== -1) WISHLISTS.splice(idx, 1);
  res.json({ success: true });
});

// ── SELLERS ───────────────────────────────────────────────────────────────────
router.get("/sellers", requireAuth, (req: Request, res: Response): void => {
  const { status } = req.query as Record<string, string>;
  let data = status ? SELLERS.filter(s => s.status === status) : SELLERS;
  res.json({ success: true, data, meta: { total: data.length } });
});

router.get("/sellers/:id", requireAuth, (req: Request, res: Response): void => {
  const seller = SELLERS.find(s => s.id === req.params.id);
  if (!seller) { res.status(404).json({ success: false, error: "Seller not found" }); return; }
  const products = PRODUCTS.filter(p => p.sellerId === seller.id);
  const orders   = ORDERS.filter(o => o.items.some(i => i.sellerId === seller.id));
  res.json({ success: true, data: { seller, products, orderCount: orders.length } });
});

router.get("/sellers/:id/analytics", requireAuth, (req: Request, res: Response): void => {
  const seller  = SELLERS.find(s => s.id === req.params.id);
  if (!seller) { res.status(404).json({ success: false, error: "Seller not found" }); return; }
  const products = PRODUCTS.filter(p => p.sellerId === seller.id);
  const revenue  = Array.from({ length: 7 }, (_, i) => ({
    day: new Date(Date.now() - (6-i)*86400000).toLocaleDateString("en",{weekday:"short"}),
    revenue: Math.floor(Math.random() * 20000 + 5000),
    orders: Math.floor(Math.random() * 20 + 5),
  }));
  res.json({ success: true, data: { seller, products, revenue, topProducts: products.slice(0,3).map(p => ({ id:p.id, name:p.name, emoji:p.emoji, sold:p.totalSold, revenue:p.totalSold*p.price })) } });
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
router.get("/admin/stats", requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, data: getMarketplaceStats() });
});

router.get("/admin/orders", requireAuth, (req: Request, res: Response): void => {
  const { status } = req.query as Record<string, string>;
  const data = status ? ORDERS.filter(o => o.status === status) : ORDERS;
  res.json({ success: true, data, meta: { total: data.length } });
});

router.patch("/admin/orders/:id/status", requireAuth, (req: Request, res: Response): void => {
  const order = ORDERS.find(o => o.id === req.params.id);
  if (!order) { res.status(404).json({ success: false, error: "Order not found" }); return; }
  order.status = req.body.status;
  if (req.body.trackingNumber) order.trackingNumber = req.body.trackingNumber;
  res.json({ success: true, data: order });
});

router.get("/admin/products/pending", requireAuth, (_req: Request, res: Response): void => {
  const data = PRODUCTS.filter(p => p.status === "pending_review");
  res.json({ success: true, data, meta: { total: data.length } });
});

router.patch("/admin/products/:id/approve", requireAuth, (req: Request, res: Response): void => {
  const p = PRODUCTS.find(p => p.id === req.params.id);
  if (!p) { res.status(404).json({ success: false, error: "Product not found" }); return; }
  p.status = "active";
  res.json({ success: true, data: p });
});

// ── ADDRESSES ─────────────────────────────────────────────────────────────────
router.get("/addresses/:userId", requireAuth, (req: Request, res: Response): void => {
  const data = ADDRESSES.filter(a => a.userId === req.params.userId);
  res.json({ success: true, data });
});

export default router;
