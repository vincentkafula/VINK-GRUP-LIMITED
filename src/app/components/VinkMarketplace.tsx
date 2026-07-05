import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Search, ShoppingCart, Heart, Star, ChevronRight, ArrowLeft,
  SlidersHorizontal, Grid, List, Plus, Minus, Trash2,
  Package, Truck, CheckCircle, Tag, TrendingUp, BarChart3,
  Settings, Menu, Clock, Shield, Zap, RotateCcw, Loader2,
  Home, Filter,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  mktCategories, mktProducts, mktCart, mktOrders,
  mktWishlist, mktSellers, mktAdmin, mktAddresses,
} from "../services/marketplaceApi";
import { isDemoMode } from "../services/demoMode";

// ─── Types ────────────────────────────────────────────────────────────────────
type View = "home" | "catalog" | "product" | "cart" | "checkout" | "orders" | "wishlist" | "seller" | "admin";
type CheckoutStep = "address" | "shipping" | "payment" | "confirmation";
type R = Record<string, unknown>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtZAR = (n: number) =>
  `R${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const STATUS_COLOR: Record<string, string> = {
  delivered: "#10B981", shipped: "#3B82F6", processing: "#F59E0B",
  confirmed: "#8B5CF6", pending: "#9CA3AF", cancelled: "#EF4444",
};

// ─── Stars ────────────────────────────────────────────────────────────────────
function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24"
          fill={s <= Math.round(rating) ? "#FBBF24" : "#E5E7EB"}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ p, onView, onCart, wishlistIds, onWishlist }: {
  p: R; onView: () => void; onCart: () => void;
  wishlistIds: Set<string>; onWishlist: () => void;
}) {
  const inWishlist = wishlistIds.has(p.id as string);
  const discount = p.compareAtPrice
    ? Math.round((1 - Number(p.price) / Number(p.compareAtPrice)) * 100)
    : 0;
  const imgs = p.images as string[];

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg hover:border-purple-200 transition-all group">
      {/* Image */}
      <div className="relative cursor-pointer" style={{ height: 180 }} onClick={onView}>
        <div className="w-full h-full flex items-center justify-center text-7xl"
          style={{ background: `linear-gradient(135deg,${imgs?.[0] ?? "#F3F4F6"},${imgs?.[1] ?? "#E5E7EB"})` }}>
          {p.emoji as string}
        </div>
        {p.isFlashDeal && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" />FLASH
          </div>
        )}
        {discount > 0 && !p.isFlashDeal && (
          <div className="absolute top-2 left-2 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
            -{discount}%
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); onWishlist(); }}
          className="absolute top-2 right-2 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center hover:scale-110 transition-transform">
          <Heart className={`w-4 h-4 ${inWishlist ? "fill-red-500 text-red-500" : "text-gray-300"}`} />
        </button>
      </div>

      <div className="p-3 cursor-pointer" onClick={onView}>
        <p className="text-[10px] text-gray-400 mb-0.5">{p.brand as string}</p>
        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mb-1">{p.name as string}</p>
        <div className="flex items-center gap-1 mb-2">
          <Stars rating={Number(p.avgRating)} size={11} />
          <span className="text-[10px] text-gray-400">({Number(p.reviewCount).toLocaleString()})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-black text-gray-900">{fmtZAR(Number(p.price))}</span>
          {p.compareAtPrice && (
            <span className="text-xs text-gray-400 line-through">{fmtZAR(Number(p.compareAtPrice))}</span>
          )}
        </div>
        {Number(p.stock) > 0 && Number(p.stock) < 10 && (
          <p className="text-[10px] text-orange-500 font-semibold mt-0.5">Only {p.stock as number} left</p>
        )}
      </div>

      <div className="px-3 pb-3">
        <button onClick={e => { e.stopPropagation(); onCart(); }}
          className="w-full py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
          <ShoppingCart className="w-3.5 h-3.5" />Add to Cart
        </button>
      </div>
    </div>
  );
}

// ─── HOME ──────────────────────────────────────────────────────────────────────
// ─── Home: static product rows ────────────────────────────────────────────────
const DEPARTMENTS = [
  "Electronics & DJI", "Baby & Toddler", "Books & Comics", "Camping & Outdoor",
  "Cellphones & Smartphones", "DIY", "Fashion & Luggage", "Computers & Electronics",
  "Drinks", "Garden, Pool & Patio", "Groceries & Household", "Health & Personal Care",
  "Home & Appliances", "Liquor", "Office & Stationery", "Pet", "Sport & Training",
  "Toys", "TV Audio & Media",
];

const CAT_STRIP_LABELS = [
  "Fresh Fashion", "Appliances", "Drinks", "Best Sellers",
  "Brands by Marketplace", "Deals & Promotions", "Brands Store", "Clearance",
];

// Takealot-style compact product card for the homepage rows
function HomeProductCard({ p, onView, onCart }: { p: R; onView: () => void; onCart: () => void }) {
  const discount = p.compareAtPrice
    ? Math.round((1 - Number(p.price) / Number(p.compareAtPrice)) * 100) : 0;
  const imgs = p.images as string[];
  return (
    <div className="bg-white border border-gray-200 flex flex-col cursor-pointer hover:shadow-md transition-shadow min-w-[150px] max-w-[190px] flex-shrink-0">
      <div className="relative" onClick={onView}>
        <div className="w-full flex items-center justify-center text-5xl py-4"
          style={{ background: `linear-gradient(135deg,${imgs?.[0] ?? "#f5f5f5"},${imgs?.[1] ?? "#e8e8e8"})`, minHeight: 100 }}>
          {p.emoji as string}
        </div>
        {discount > 0 && (
          <div className="absolute top-1 left-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5">-{discount}%</div>
        )}
      </div>
      <div className="p-2 flex flex-col flex-1">
        <p className="text-xs text-gray-700 leading-snug mb-1 line-clamp-2">{p.name as string}</p>
        <div className="flex items-center gap-1 mb-1">
          {[1,2,3,4,5].map(s => (
            <svg key={s} width={9} height={9} viewBox="0 0 24 24"
              fill={s <= Math.round(Number(p.rating ?? 4)) ? "#FBBF24" : "#E5E7EB"}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ))}
          <span className="text-[9px] text-gray-400 ml-0.5">({p.reviewCount as number ?? 0})</span>
        </div>
        <div className="mt-auto">
          {p.compareAtPrice && (
            <p className="text-[10px] text-gray-400 line-through">{fmtZAR(Number(p.compareAtPrice))}</p>
          )}
          <p className="text-sm font-bold text-gray-900 mb-2">{fmtZAR(Number(p.price))}</p>
          <button onClick={e => { e.stopPropagation(); onCart(); }}
            className="w-full text-xs font-semibold py-1.5 border-2 transition-colors hover:bg-blue-600 hover:text-white hover:border-blue-600"
            style={{ borderColor: "#0066CC", color: "#0066CC" }}>
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ title, products, onProduct, onCart, slice = [0, 4] }: {
  title: string; products: R[]; onProduct: (p: R) => void;
  onCart: (p: R) => void; slice?: [number, number];
}) {
  const items = products.slice(...slice);
  if (!items.length) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200">
        <span className="text-sm font-bold text-gray-900">{title}</span>
        <button className="text-xs font-semibold" style={{ color: "#0066CC" }}>View more</button>
      </div>
      <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {items.map((p, i) => (
          <HomeProductCard key={i} p={p}
            onView={() => onProduct(p)}
            onCart={() => onCart(p)} />
        ))}
      </div>
    </div>
  );
}

function HomeView({ categories, products, onCategory, onProduct, onCart, wishlistIds, onWishlist }: {
  categories: R[]; products: R[];
  onCategory: () => void; onProduct: (p: R) => void;
  onCart: (p: R) => void; wishlistIds: Set<string>; onWishlist: (id: string) => void;
}) {
  const [activeCatStrip, setActiveCatStrip] = useState(0);
  const flashDeals = products.filter(p => p.isFlashDeal);
  const featured   = products.filter(p => p.isFeatured);
  // split product rows by index slices for visual variety
  const row1 = products.slice(0, 3);   // deals of the day
  const row2 = products.slice(3, 7);   // groceries & household
  const row3 = products.slice(7, 11);  // clearance men
  const row4 = products.slice(11, 15); // phones
  const rowHL = products.slice(1, 4);  // highlighted (red band)
  const row5 = products.slice(4, 7);   // branded microwaves

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-100">

      {/* ── Category tab strip ── */}
      <div className="bg-white border-b border-gray-200 flex items-center overflow-x-auto flex-shrink-0 px-2" style={{ scrollbarWidth: "none" }}>
        {CAT_STRIP_LABELS.map((label, i) => (
          <button key={i} onClick={() => { setActiveCatStrip(i); onCategory(); }}
            className="px-3 py-2.5 text-xs font-medium flex-shrink-0 transition-colors border-b-2"
            style={{
              borderBottomColor: activeCatStrip === i ? "#0066CC" : "transparent",
              color: activeCatStrip === i ? "#0066CC" : "#333",
            }}>
            {label}
          </button>
        ))}
        <button className="px-3 py-2.5 text-xs text-gray-400 flex-shrink-0">Clearance</button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Departments sidebar ── */}
        <aside className="hidden md:flex flex-col w-44 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wide border-b border-gray-100">Departments</div>
          {DEPARTMENTS.map((dept) => (
            <button key={dept} onClick={onCategory}
              className="w-full text-left px-3 py-2 text-[11px] text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border-b border-gray-50 leading-snug">
              {dept}
            </button>
          ))}
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>

          {/* Hero banner */}
          <div className="flex gap-1 m-2">
            {/* Left — MEGA BOOK SALE */}
            <div className="flex-1 relative overflow-hidden rounded-sm flex flex-col justify-between p-4 min-h-[140px]"
              style={{ background: "linear-gradient(135deg,#e8f4fd 0%,#cce8f8 100%)", border: "1px solid #b3d9f0" }}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">MEGA BOOK SALE</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-5xl font-black leading-none" style={{ color: "#0066CC" }}>35%</span>
                  <span className="text-sm font-bold text-gray-600 mb-1">OFF</span>
                </div>
                <div className="text-[10px] text-gray-500 mb-3">17th – 11th September</div>
              </div>
              <button onClick={onCategory}
                className="self-start bg-blue-600 text-white text-xs font-bold px-4 py-1.5 rounded hover:bg-blue-700 transition-colors">
                Shop Now
              </button>
            </div>
            {/* Right — 40% off + delivery check */}
            <div className="flex flex-col gap-1 w-48 flex-shrink-0">
              <div className="flex-1 rounded-sm p-3 flex flex-col justify-between"
                style={{ background: "linear-gradient(135deg,#fff7e6,#ffecc0)", border: "1px solid #fdd88a" }}>
                <div className="text-[10px] font-bold text-orange-600 uppercase">Selected items</div>
                <div className="text-4xl font-black leading-none" style={{ color: "#E65C00" }}>40%</div>
                <button onClick={onCategory} className="self-start bg-orange-500 text-white text-[10px] font-bold px-3 py-1 rounded hover:bg-orange-600 transition-colors mt-1">
                  Shop Now
                </button>
              </div>
              <div className="rounded-sm p-3 bg-white border border-gray-200">
                <div className="text-[10px] font-semibold text-gray-700 mb-1">Check your delivery or collection status</div>
                <div className="flex gap-1">
                  <input className="flex-1 text-[10px] border border-gray-300 rounded px-2 py-1 outline-none" placeholder="Order #" />
                  <button className="bg-blue-600 text-white text-[10px] px-2 py-1 rounded hover:bg-blue-700">Go</button>
                </div>
              </div>
            </div>
          </div>

          {/* Deals of the day */}
          <div className="mx-2 mb-2">
            <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200">
              <span className="text-sm font-bold text-gray-900">Deals of the day</span>
              <button onClick={onCategory} className="text-xs font-semibold" style={{ color: "#0066CC" }}>View more</button>
            </div>
            <div className="flex gap-0 bg-white">
              {row1.map((p, i) => (
                <HomeProductCard key={i} p={p} onView={() => onProduct(p)} onCart={() => onCart(p)} />
              ))}
              {row1.length === 0 && (
                <div className="flex gap-0">
                  {[
                    { name: "Samsung 1000 ssh 2048 SSD & USB Charging Power 150V", price: "R 509", was: "R 1,295", stars: 4, emoji: "📺" },
                    { name: "Melitta Q/100 Gas Grill Grey", price: "R 4,039", was: "R 4,099", stars: 4, emoji: "🔥" },
                    { name: "Energizer Vision Rechargeable 6V Torch 280lm", price: "R 879", was: null, stars: 3, emoji: "🔦" },
                  ].map((item, i) => (
                    <div key={i} className="bg-white border border-gray-200 flex flex-col cursor-pointer hover:shadow-md transition-shadow min-w-[150px] max-w-[190px] flex-shrink-0">
                      <div className="w-full flex items-center justify-center text-5xl py-4 bg-gray-50 min-h-[100px]">{item.emoji}</div>
                      <div className="p-2 flex flex-col flex-1">
                        <p className="text-[11px] text-gray-700 leading-snug mb-1">{item.name}</p>
                        <div className="flex items-center gap-0.5 mb-1">
                          {[1,2,3,4,5].map(s => <svg key={s} width={9} height={9} viewBox="0 0 24 24" fill={s<=item.stars?"#FBBF24":"#E5E7EB"}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>)}
                        </div>
                        <div className="mt-auto">
                          {item.was && <p className="text-[10px] text-gray-400 line-through">{item.was}</p>}
                          <p className="text-sm font-bold text-gray-900 mb-2">{item.price}</p>
                          <button onClick={onCategory} className="w-full text-xs font-semibold py-1.5 border-2 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors" style={{ borderColor: "#0066CC", color: "#0066CC" }}>Add to cart</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* No petrol strip */}
          <div className="mx-2 mb-2 bg-blue-700 text-white flex items-center justify-between px-4 py-3 rounded-sm">
            <div>
              <p className="text-sm font-bold">No petrol needed — get it delivered</p>
              <p className="text-xs opacity-80">Free delivery on orders over R500 · Same-day available in major cities</p>
            </div>
            <button onClick={onCategory} className="text-xs font-bold bg-white text-blue-700 px-4 py-1.5 rounded hover:bg-blue-50 transition-colors flex-shrink-0 ml-4">
              View more
            </button>
          </div>

          {/* Product row sections */}
          <div className="mx-2">
            <ProductRow title="Groceries & household" products={row2.length ? row2 : products.slice(0,4)} onProduct={onProduct} onCart={onCart} />
            <ProductRow title="Shop ClarisMen" products={row3.length ? row3 : products.slice(1,5)} onProduct={onProduct} onCart={onCart} />
          </div>

          {/* iPhone / phones section */}
          <div className="mx-2 mb-4">
            <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200">
              <span className="text-sm font-bold text-gray-900">iPhone 13 Pro — now reduced</span>
              <button onClick={onCategory} className="text-xs font-semibold" style={{ color: "#0066CC" }}>View more</button>
            </div>
            <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {(row4.length ? row4 : products.slice(2,6)).map((p, i) => (
                <HomeProductCard key={i} p={p} onView={() => onProduct(p)} onCart={() => onCart(p)} />
              ))}
            </div>
          </div>

          {/* Highlighted deals band */}
          <div className="mx-2 mb-4 rounded-sm overflow-hidden">
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              {/* Left red promo */}
              <div className="p-4 flex flex-col justify-between" style={{ background: "#CC0000" }}>
                <div>
                  <div className="text-white text-xs font-bold mb-1 opacity-80">FEATURED</div>
                  <div className="text-white text-base font-black leading-tight">Huawei nova 11s</div>
                  <div className="text-white/70 text-xs mt-1">R 3,449</div>
                </div>
                <button onClick={onCategory} className="self-start mt-3 bg-white text-red-700 text-xs font-bold px-3 py-1.5 rounded hover:bg-red-50 transition-colors">Shop Now</button>
              </div>
              {/* Middle black promo */}
              <div className="p-4 flex flex-col justify-between bg-gray-900">
                <div>
                  <div className="text-white text-xs font-bold mb-1 opacity-70">NEW</div>
                  <div className="text-white text-base font-black leading-tight">Huawei nova 11S Plus</div>
                  <div className="text-yellow-400 text-xs mt-1">R 5,000 <span className="line-through text-gray-400 text-[10px]">R 6,099</span></div>
                </div>
                <button onClick={onCategory} className="self-start mt-3 bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1.5 rounded hover:bg-yellow-300 transition-colors">Shop Now</button>
              </div>
              {/* Right product card */}
              <div className="bg-white border border-gray-200 flex flex-col">
                {(rowHL[0]) ? (
                  <HomeProductCard p={rowHL[0]} onView={() => onProduct(rowHL[0])} onCart={() => onCart(rowHL[0])} />
                ) : (
                  <div className="p-4 flex flex-col items-center justify-center h-full text-center">
                    <div className="text-4xl mb-2">📱</div>
                    <div className="text-xs font-bold text-gray-800">Huawei Y7S</div>
                    <div className="text-xs text-gray-500 mt-1">R 2,999</div>
                    <button onClick={onCategory} className="mt-2 text-xs font-bold px-3 py-1 border-2 hover:bg-blue-600 hover:text-white transition-colors" style={{ borderColor: "#0066CC", color: "#0066CC" }}>Add to cart</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top branded microwaves */}
          <div className="mx-2 mb-6">
            <ProductRow title="Top branded microwaves" products={row5.length ? row5 : products.slice(0,3)} onProduct={onProduct} onCart={onCart} />
          </div>

          {/* Flash deals if available */}
          {flashDeals.length > 0 && (
            <div className="mx-2 mb-4">
              <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-sm font-bold text-gray-900">Flash Deals</span>
                </div>
                <button onClick={onCategory} className="text-xs font-semibold" style={{ color: "#0066CC" }}>View more</button>
              </div>
              <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {flashDeals.map((p, i) => (
                  <HomeProductCard key={i} p={p} onView={() => onProduct(p)} onCart={() => onCart(p)} />
                ))}
              </div>
            </div>
          )}

          {/* Trust bar */}
          <div className="mx-2 mb-6 bg-gray-800 text-white flex flex-wrap justify-around items-center gap-4 px-4 py-3">
            {[
              { icon: "🚚", label: "Free Delivery", sub: "Orders over R500" },
              { icon: "🔒", label: "Buyer Protection", sub: "100% guaranteed" },
              { icon: "↩️", label: "Easy Returns", sub: "30-day policy" },
              { icon: "⚡", label: "Flash Deals", sub: "Daily offers" },
            ].map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xl">{b.icon}</span>
                <div>
                  <p className="text-xs font-bold">{b.label}</p>
                  <p className="text-[10px] text-gray-400">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── CATALOG ──────────────────────────────────────────────────────────────────
function CatalogView({ categories, onProduct, onCart, wishlistIds, onWishlist }: {
  categories: R[]; onProduct: (p: R) => void; onCart: (p: R) => void;
  wishlistIds: Set<string>; onWishlist: (id: string) => void;
}) {
  const [products, setProducts] = useState<R[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [activeCat, setActiveCat] = useState("");
  const [sort, setSort]         = useState("popular");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [suggests, setSuggests] = useState<R[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mktProducts.list({ category: activeCat, search, sort });
      setProducts(res.data as R[]);
    } finally { setLoading(false); }
  }, [activeCat, search, sort]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(timer.current);
    if (v.length > 1) {
      timer.current = setTimeout(async () => {
        const res = await mktProducts.suggest(v);
        setSuggests(res.data as R[]);
      }, 300);
    } else { setSuggests([]); }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Top filters bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search products, brands…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-purple-400" />
          {suggests.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
              {suggests.map((s, i) => (
                <button key={i} onClick={() => { setSearch(String(s.name)); setSuggests([]); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 border-b last:border-0 border-gray-50">
                  <span className="text-lg">{s.emoji as string}</span>
                  <p className="text-sm font-medium text-gray-900 flex-1 text-left truncate">{s.name as string}</p>
                  <p className="text-sm font-bold flex-shrink-0" style={{ color: "#6B5ED7" }}>{fmtZAR(Number(s.price))}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="text-xs border border-gray-200 rounded-xl px-3 py-2 outline-none bg-white focus:border-purple-400">
          <option value="popular">Most Popular</option>
          <option value="rating">Top Rated</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
          <option value="newest">Newest</option>
        </select>
        {/* View toggle */}
        <div className="flex border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={() => setViewMode("grid")}
            className={`p-2 transition-colors ${viewMode === "grid" ? "bg-purple-50 text-purple-700" : "text-gray-400"}`}>
            <Grid className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setViewMode("list")}
            className={`p-2 transition-colors ${viewMode === "list" ? "bg-purple-50 text-purple-700" : "text-gray-400"}`}>
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none border-b border-gray-50 bg-white flex-shrink-0">
        {[{ id: "", name: "All", icon: "🛍️" }, ...categories].map((c, i) => (
          <button key={i} onClick={() => setActiveCat(String(c.id ?? ""))}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: activeCat === String(c.id ?? "") ? "#6B5ED7" : "#F3F4F6",
              color: activeCat === String(c.id ?? "") ? "white" : "#374151",
            }}>
            {c.icon as string} {c.name as string}
          </button>
        ))}
      </div>

      {/* Products */}
      <div className="flex-1 overflow-y-auto p-4" style={{ background: "#F8F7FF" }}>
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6B5ED7" }} />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">No products found</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {products.map((p, i) => (
              <ProductCard key={i} p={p} onView={() => onProduct(p)} onCart={() => onCart(p)}
                wishlistIds={wishlistIds} onWishlist={() => onWishlist(String(p.id))} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((p, i) => {
              const imgs = p.images as string[];
              return (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4 hover:shadow-md cursor-pointer transition-all" onClick={() => onProduct(p)}>
                  <div className="w-20 h-20 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
                    style={{ background: `linear-gradient(135deg,${imgs?.[0]},${imgs?.[1]})` }}>{p.emoji as string}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">{p.brand as string}</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.name as string}</p>
                    <div className="flex items-center gap-1 mt-0.5"><Stars rating={Number(p.avgRating)} size={11} /></div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-gray-900">{fmtZAR(Number(p.price))}</p>
                    {p.compareAtPrice && <p className="text-xs text-gray-400 line-through">{fmtZAR(Number(p.compareAtPrice))}</p>}
                    <button onClick={e => { e.stopPropagation(); onCart(p); }}
                      className="mt-1 px-3 py-1 rounded-lg text-xs font-bold text-white" style={{ background: "#6B5ED7" }}>
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PRODUCT DETAIL ───────────────────────────────────────────────────────────
function ProductDetailView({ productId, onBack, onCart, wishlistIds, onWishlist }: {
  productId: string; onBack: () => void;
  onCart: (p: R, variantId?: string) => void;
  wishlistIds: Set<string>; onWishlist: (id: string) => void;
}) {
  const [data, setData]   = useState<{ product: R; seller: R; reviews: R[]; related: R[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty]     = useState(1);
  const [selVariant, setSelVariant] = useState("");
  const [tab, setTab]     = useState<"desc" | "reviews" | "seller">("desc");

  useEffect(() => {
    setLoading(true);
    mktProducts.get(productId)
      .then(res => { setData(res.data as typeof data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [productId]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6B5ED7" }} /></div>;
  if (!data) return null;

  const { product: p, seller, reviews, related } = data;
  const inWishlist = wishlistIds.has(p.id as string);
  const variants   = (p.variants as R[]) ?? [];
  const discount   = p.compareAtPrice ? Math.round((1 - Number(p.price) / Number(p.compareAtPrice)) * 100) : 0;
  const variantTypes = [...new Set(variants.map(v => v.type as string))];
  const imgs = p.images as string[];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F8F7FF" }}>
      {/* Back bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-4 h-4 text-gray-700" /></button>
        <p className="text-sm font-semibold text-gray-900 flex-1 truncate">{p.name as string}</p>
        <button onClick={() => onWishlist(p.id as string)}>
          <Heart className={`w-5 h-5 ${inWishlist ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
        </button>
      </div>

      <div className="grid xl:grid-cols-2">
        {/* Image */}
        <div>
          <div className="flex items-center justify-center p-16"
            style={{ background: `linear-gradient(135deg,${imgs?.[0]},${imgs?.[1]})`, minHeight: 300 }}>
            <span className="text-9xl select-none">{p.emoji as string}</span>
          </div>
          {p.isFlashDeal && (
            <div className="mx-4 my-3 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
              <Zap className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700 font-semibold">Flash Deal! Limited time offer.</p>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-6 bg-white border-l border-gray-50 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold">{p.categoryName as string}</span>
              <span className="text-xs text-gray-400">{p.brand as string}</span>
            </div>
            <h1 className="text-xl font-black text-gray-900 leading-snug">{p.name as string}</h1>
          </div>

          <div className="flex items-center gap-3">
            <Stars rating={Number(p.avgRating)} size={15} />
            <span className="text-sm font-bold text-gray-700">{Number(p.avgRating).toFixed(1)}</span>
            <span className="text-sm text-gray-400">({Number(p.reviewCount).toLocaleString()} reviews)</span>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black text-gray-900">{fmtZAR(Number(p.price))}</span>
            {p.compareAtPrice && (
              <>
                <span className="text-lg text-gray-400 line-through">{fmtZAR(Number(p.compareAtPrice))}</span>
                <span className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Save {discount}%</span>
              </>
            )}
          </div>

          {/* Variants */}
          {variantTypes.map(type => (
            <div key={type}>
              <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider">{type}</p>
              <div className="flex flex-wrap gap-2">
                {variants.filter(v => v.type === type).map((v, i) => (
                  <button key={i} onClick={() => setSelVariant(v.id as string)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                    style={{
                      background: selVariant === v.id ? "#6B5ED7" : "white",
                      color: selVariant === v.id ? "white" : "#374151",
                      borderColor: selVariant === v.id ? "#6B5ED7" : "#E5E7EB",
                    }}>
                    {v.value as string}
                    {Number(v.additionalPrice) > 0 && <span className="ml-1 opacity-70">+{fmtZAR(Number(v.additionalPrice))}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Qty */}
          <div>
            <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider">Quantity</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-2 hover:bg-gray-50"><Minus className="w-3.5 h-3.5 text-gray-600" /></button>
                <span className="px-4 text-sm font-bold">{qty}</span>
                <button onClick={() => setQty(q => Math.min(Number(p.stock), q + 1))} className="px-3 py-2 hover:bg-gray-50"><Plus className="w-3.5 h-3.5 text-gray-600" /></button>
              </div>
              <span className="text-xs text-gray-400">{Number(p.stock)} in stock</span>
            </div>
          </div>

          {/* Delivery */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-green-50 border border-green-100">
            <Truck className="w-4 h-4 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-green-700">{Number(p.price) > 500 ? "Free delivery" : "R99 delivery"}</p>
              <p className="text-[10px] text-green-600">Estimated 3–5 business days</p>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex gap-3">
            <button onClick={() => onCart(p, selVariant || undefined)}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
              <ShoppingCart className="w-4 h-4" />Add to Cart
            </button>
            <button onClick={() => onWishlist(p.id as string)}
              className={`px-4 rounded-2xl border transition-all ${inWishlist ? "bg-red-50 border-red-200" : "border-gray-200"}`}>
              <Heart className={`w-4 h-4 ${inWishlist ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-t border-gray-100 px-6">
        <div className="flex border-b border-gray-100">
          {(["desc","reviews","seller"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm font-semibold transition-all border-b-2 -mb-px capitalize ${tab === t ? "border-purple-600 text-purple-600" : "border-transparent text-gray-400"}`}>
              {t === "desc" ? "Description" : t === "reviews" ? `Reviews (${reviews.length})` : "Seller"}
            </button>
          ))}
        </div>
        <div className="py-5">
          {tab === "desc" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">{p.description as string}</p>
              {Object.keys(p.attributes as R ?? {}).length > 0 && (
                <div>
                  <p className="text-sm font-bold text-gray-800 mb-3">Specifications</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(p.attributes as R ?? {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm py-2 border-b border-gray-50">
                        <span className="text-gray-400">{k}</span>
                        <span className="font-medium text-gray-800">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {(p.tags as string[] ?? []).map((t, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">#{t}</span>
                ))}
              </div>
            </div>
          )}
          {tab === "reviews" && (
            <div className="space-y-4">
              {reviews.map((r, i) => (
                <div key={i} className="p-4 rounded-2xl bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.title as string}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Stars rating={Number(r.rating)} size={12} />
                        <span className="text-[11px] text-gray-400">by {r.reviewerName as string}</span>
                        {r.verifiedPurchase && <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">✓ Verified</span>}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">{ago(r.createdAt as string)}</span>
                  </div>
                  <p className="text-sm text-gray-600">{r.body as string}</p>
                </div>
              ))}
              {reviews.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No reviews yet</p>}
            </div>
          )}
          {tab === "seller" && seller && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: "#F3F0FF" }}>🏪</div>
                <div>
                  <p className="font-bold text-gray-900">{seller.storeName as string}</p>
                  <div className="flex items-center gap-1 mt-0.5"><Stars rating={Number(seller.avgRating ?? 4.5)} size={12} /></div>
                  <p className="text-xs text-gray-500 mt-0.5">{String(seller.description ?? "Trusted Vink seller")}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label:"Total Sales", value:Number(seller.totalSales ?? 0).toLocaleString() },
                  { label:"Rating", value:Number(seller.avgRating ?? 4.5).toFixed(1) },
                  { label:"KYC", value:seller.kycVerified ? "✓ Verified" : "Pending" },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 bg-gray-50 rounded-xl">
                    <p className="text-base font-black text-gray-900">{s.value}</p>
                    <p className="text-[11px] text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="px-4 pb-8 bg-white border-t border-gray-50">
          <h3 className="text-sm font-bold text-gray-900 my-4">Related Products</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {related.map((r, i) => (
              <ProductCard key={i} p={r} onView={() => onCart(r)} onCart={() => onCart(r)}
                wishlistIds={wishlistIds} onWishlist={() => onWishlist(String(r.id))} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CART ─────────────────────────────────────────────────────────────────────
function CartView({ cart, onUpdateQty, onRemove, onApplyCoupon, onCheckout }: {
  cart: R | null;
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onApplyCoupon: (code: string) => void;
  onCheckout: () => void;
}) {
  const [coupon, setCoupon] = useState("");
  const items = (cart?.items as R[]) ?? [];

  if (items.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: "#F8F7FF" }}>
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl" style={{ background: "#F3F0FF" }}>🛒</div>
      <h2 className="text-lg font-bold text-gray-900">Your cart is empty</h2>
      <p className="text-sm text-gray-400">Browse products and add items to get started</p>
    </div>
  );

  return (
    <div className="flex-1 flex overflow-hidden" style={{ background: "#F8F7FF" }}>
      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h2 className="text-base font-bold text-gray-900">Cart ({items.length})</h2>
        {items.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 flex items-center gap-4 border border-gray-100">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl flex-shrink-0 bg-gray-50">
              {item.emoji as string}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{item.name as string}</p>
              <p className="text-xs text-gray-400">{item.sellerName as string}</p>
              <p className="text-sm font-bold mt-1" style={{ color: "#6B5ED7" }}>{fmtZAR(Number(item.unitPrice))}</p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <button onClick={() => onRemove(item.productId as string)}>
                <Trash2 className="w-4 h-4 text-gray-300 hover:text-red-500 transition-colors" />
              </button>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => onUpdateQty(item.productId as string, Number(item.quantity) - 1)} className="px-2 py-1 hover:bg-gray-50"><Minus className="w-3 h-3 text-gray-600" /></button>
                <span className="px-2 text-xs font-bold">{item.quantity as number}</span>
                <button onClick={() => onUpdateQty(item.productId as string, Number(item.quantity) + 1)} className="px-2 py-1 hover:bg-gray-50"><Plus className="w-3 h-3 text-gray-600" /></button>
              </div>
            </div>
          </div>
        ))}

        {/* Coupon */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4" style={{ color: "#6B5ED7" }} />
            <p className="text-sm font-semibold text-gray-900">Have a coupon?</p>
          </div>
          <div className="flex gap-2">
            <input value={coupon} onChange={e => setCoupon(e.target.value.toUpperCase())}
              placeholder="e.g. WELCOME10"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400 uppercase" />
            <button onClick={() => onApplyCoupon(coupon)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#6B5ED7" }}>Apply</button>
          </div>
          {cart?.couponCode && (
            <p className="text-xs text-green-600 mt-2 font-semibold">
              ✓ {cart.couponCode as string} applied — saving {fmtZAR(Number(cart.couponDiscount))}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1.5">Try: WELCOME10 · SAVE200 · FREESHIP</p>
        </div>
      </div>

      {/* Summary */}
      <div className="w-72 flex-shrink-0 p-4 bg-white border-l border-gray-100 overflow-y-auto">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Order Summary</h3>
        <div className="space-y-2.5 mb-5">
          {[
            { label: "Subtotal",      value: fmtZAR(Number(cart?.subtotal ?? 0)) },
            { label: "Shipping",      value: Number(cart?.shipping) === 0 ? "Free" : fmtZAR(Number(cart?.shipping)) },
            { label: "Tax (15% VAT)", value: fmtZAR(Number(cart?.tax ?? 0)) },
            ...(Number(cart?.couponDiscount) > 0 ? [{ label: "Discount", value: `-${fmtZAR(Number(cart?.couponDiscount))}` }] : []),
          ].map((r, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-gray-500">{r.label}</span>
              <span className={`font-semibold ${r.label === "Discount" ? "text-green-600" : "text-gray-900"}`}>{r.value}</span>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3 flex justify-between">
            <span className="font-bold text-gray-900">Total</span>
            <span className="text-xl font-black" style={{ color: "#6B5ED7" }}>{fmtZAR(Number(cart?.total ?? 0))}</span>
          </div>
        </div>
        <button onClick={onCheckout}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
          Proceed to Checkout <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex items-center justify-center gap-3 mt-4 text-xl">
          {["💳","🏦","📱","💰"].map((e, i) => <span key={i}>{e}</span>)}
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-1">Secure checkout · PCI DSS</p>
      </div>
    </div>
  );
}

// ─── CHECKOUT ─────────────────────────────────────────────────────────────────
function CheckoutView({ cart, addresses, onBack, onComplete }: {
  cart: R | null; addresses: R[];
  onBack: () => void; onComplete: (order: R) => void;
}) {
  const [step, setStep]     = useState<CheckoutStep>("address");
  const [selAddr, setSelAddr] = useState(0);
  const [shipping, setShipping] = useState("standard");
  const [payment, setPayment] = useState("card");
  const [placing, setPlacing] = useState(false);
  const STEPS: CheckoutStep[] = ["address","shipping","payment","confirmation"];
  const si = STEPS.indexOf(step);

  const handlePlace = async () => {
    setPlacing(true);
    try {
      const { mktOrders: api } = await import("../services/marketplaceApi");
      const res = await api.place({ userId: "demo-customer-001", cartId: "cart-demo", addressId: (addresses[selAddr] as R)?.id, shippingMethod: shipping, paymentMethod: payment });
      setStep("confirmation");
      onComplete(res.data as R);
    } finally { setPlacing(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5" style={{ background: "#F8F7FF" }}>
      {/* Stepper */}
      <div className="flex items-start gap-0 mb-6 max-w-lg mx-auto">
        {(["Address","Shipping","Payment"] as const).map((label, i) => (
          <div key={label} className="flex-1 flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{ background: si >= i ? "#6B5ED7" : "#E5E7EB", color: si >= i ? "white" : "#9CA3AF" }}>
                {si > i ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className="text-[10px] text-gray-400">{label}</span>
            </div>
            {i < 2 && <div className="flex-1 h-px mx-2 mt-3.5" style={{ background: si > i ? "#6B5ED7" : "#E5E7EB" }} />}
          </div>
        ))}
      </div>

      {step === "address" && (
        <div className="max-w-lg mx-auto space-y-4">
          <h2 className="text-base font-bold text-gray-900">Delivery Address</h2>
          {addresses.map((a, i) => (
            <button key={i} onClick={() => setSelAddr(i)}
              className={`w-full p-4 rounded-2xl text-left border transition-all ${selAddr === i ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white"}`}>
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${selAddr === i ? "border-purple-600 bg-purple-600" : "border-gray-300"}`}>
                  {selAddr === i && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{a.label as string}</p>
                  <p className="text-xs text-gray-600">{a.firstName as string} {a.lastName as string}</p>
                  <p className="text-xs text-gray-500">{a.line1 as string}, {a.city as string} {a.postalCode as string}</p>
                </div>
              </div>
            </button>
          ))}
          <button onClick={() => setStep("shipping")}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
            Continue to Shipping
          </button>
        </div>
      )}

      {step === "shipping" && (
        <div className="max-w-lg mx-auto space-y-3">
          <h2 className="text-base font-bold text-gray-900">Shipping Method</h2>
          {[
            { id:"standard", label:"Standard Delivery", sub:"3–5 business days", price:"R99" },
            { id:"express",  label:"Express Delivery",  sub:"Next business day", price:"R199" },
            { id:"collect",  label:"Click & Collect",   sub:"At your nearest Vink Hub", price:"FREE" },
          ].map(opt => (
            <button key={opt.id} onClick={() => setShipping(opt.id)}
              className={`w-full p-4 rounded-2xl text-left border flex items-center gap-3 transition-all ${shipping === opt.id ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white"}`}>
              <Truck className="w-5 h-5 flex-shrink-0" style={{ color: "#6B5ED7" }} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-400">{opt.sub}</p>
              </div>
              <span className={`text-sm font-bold ${opt.price === "FREE" ? "text-green-600" : "text-gray-800"}`}>{opt.price}</span>
            </button>
          ))}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep("address")} className="flex-1 py-3.5 rounded-2xl text-sm font-semibold border border-gray-200">Back</button>
            <button onClick={() => setStep("payment")} className="flex-[2] py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>Continue to Payment</button>
          </div>
        </div>
      )}

      {step === "payment" && (
        <div className="max-w-lg mx-auto space-y-4">
          <h2 className="text-base font-bold text-gray-900">Payment Method</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id:"card",       label:"Card",              icon:"💳" },
              { id:"paypal",     label:"PayPal",            icon:"🔵" },
              { id:"apple_pay",  label:"Apple Pay",         icon:"🍎" },
              { id:"google_pay", label:"Google Pay",        icon:"🔴" },
              { id:"bnpl",       label:"Buy Now Pay Later", icon:"📅" },
              { id:"wallet",     label:"Vink Wallet",       icon:"👛" },
            ].map(opt => (
              <button key={opt.id} onClick={() => setPayment(opt.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${payment === opt.id ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white"}`}>
                <span className="text-xl">{opt.icon}</span>
                <span className="text-[10px] font-medium text-gray-700">{opt.label}</span>
              </button>
            ))}
          </div>
          {payment === "card" && (
            <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
              {[
                { label:"Card Number", placeholder:"1234 5678 9012 3456" },
                { label:"Expiry",      placeholder:"MM / YY" },
                { label:"CVV",         placeholder:"•••" },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{f.label}</label>
                  <input placeholder={f.placeholder}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                </div>
              ))}
            </div>
          )}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Order total</span>
              <span className="font-black" style={{ color: "#6B5ED7" }}>{fmtZAR(Number(cart?.total ?? 0))}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><Shield className="w-3 h-3" />256-bit SSL · PCI DSS compliant</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep("shipping")} className="flex-1 py-3.5 rounded-2xl text-sm font-semibold border border-gray-200">Back</button>
            <button onClick={handlePlace} disabled={placing}
              className="flex-[2] py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>
              {placing ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</> : <>Place Order · {fmtZAR(Number(cart?.total ?? 0))}</>}
            </button>
          </div>
        </div>
      )}

      {step === "confirmation" && (
        <div className="max-w-lg mx-auto text-center py-10">
          <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-5 text-5xl" style={{ background: "#F0FDF4" }}>✅</div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Order Placed!</h2>
          <p className="text-gray-500 mb-6">Thank you! A confirmation email is on its way.</p>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-6 space-y-2 text-left">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Total paid</span><span className="font-black" style={{ color: "#6B5ED7" }}>{fmtZAR(Number(cart?.total ?? 0))}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Estimated delivery</span><span className="font-semibold">3–5 business days</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Carrier</span><span className="font-semibold">DHL Express</span></div>
          </div>
          <button onClick={onBack} className="w-full py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#6B5ED7,#8B7EE7)" }}>Continue Shopping</button>
        </div>
      )}
    </div>
  );
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────
function OrdersView() {
  const [orders, setOrders] = useState<R[]>([]);
  const [selected, setSelected] = useState<R | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mktOrders.list().then(r => { setOrders(r.data as R[]); setLoading(false); });
  }, []);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6B5ED7" }} /></div>;

  if (selected) return (
    <div className="flex-1 overflow-y-auto p-4" style={{ background: "#F8F7FF" }}>
      <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: "#6B5ED7" }}>
        <ArrowLeft className="w-4 h-4" />Back to Orders
      </button>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{selected.orderNumber as string}</h2>
          <span className="text-xs px-3 py-1 rounded-full font-bold capitalize"
            style={{ background: (STATUS_COLOR[selected.status as string] ?? "#9CA3AF") + "20", color: STATUS_COLOR[selected.status as string] ?? "#9CA3AF" }}>
            {(selected.status as string).replace(/_/g, " ")}
          </span>
        </div>
        {(selected.items as R[]).map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
            <span className="text-2xl">{item.emoji as string}</span>
            <div className="flex-1"><p className="text-sm font-semibold text-gray-900">{item.productName as string}</p><p className="text-xs text-gray-400">Qty: {item.quantity as number}</p></div>
            <p className="text-sm font-bold text-gray-900">{fmtZAR(Number(item.totalPrice))}</p>
          </div>
        ))}
        <div className="space-y-1.5 border-t border-gray-100 pt-3">
          {[["Subtotal",selected.subtotal],["Shipping",selected.shippingCost],["Tax",selected.taxAmount],["Total",selected.totalAmount]].map(([l,v],i) => (
            <div key={i} className={`flex justify-between text-sm ${l==="Total"?"font-bold text-gray-900":"text-gray-500"}`}>
              <span>{l as string}</span><span>{fmtZAR(Number(v))}</span>
            </div>
          ))}
        </div>
        {selected.trackingNumber && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50">
            <Truck className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-blue-700">Tracking: {selected.trackingNumber as string}</p>
              <p className="text-xs text-blue-600">{selected.carrier as string}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4" style={{ background: "#F8F7FF" }}>
      <h2 className="text-base font-bold text-gray-900 mb-4">My Orders</h2>
      {orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><Package className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="font-semibold">No orders yet</p></div>
      ) : (
        <div className="space-y-3">
          {orders.map((o, i) => (
            <button key={i} onClick={() => setSelected(o)}
              className="w-full bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-purple-100 transition-all text-left">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900">{o.orderNumber as string}</p>
                <span className="text-xs px-2.5 py-1 rounded-full font-bold capitalize"
                  style={{ background: (STATUS_COLOR[o.status as string] ?? "#9CA3AF") + "20", color: STATUS_COLOR[o.status as string] ?? "#9CA3AF" }}>
                  {(o.status as string).replace(/_/g," ")}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                {(o.items as R[]).slice(0, 3).map((it, j) => <span key={j} className="text-xl">{it.emoji as string}</span>)}
                {(o.items as R[]).length > 3 && <span className="text-xs text-gray-400">+{(o.items as R[]).length - 3}</span>}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{new Date(o.placedAt as string).toLocaleDateString()}</span>
                <span className="font-bold text-gray-800">{fmtZAR(Number(o.totalAmount))}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WISHLIST ─────────────────────────────────────────────────────────────────
function WishlistView({ wishlistIds, onProduct, onCart, onWishlist }: {
  wishlistIds: Set<string>; onProduct: (p: R) => void;
  onCart: (p: R) => void; onWishlist: (id: string) => void;
}) {
  const [items, setItems]   = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { mktWishlist.get("demo-customer-001").then(r => { setItems(r.data as R[]); setLoading(false); }); }, []);
  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6B5ED7" }} /></div>;
  return (
    <div className="flex-1 overflow-y-auto p-4" style={{ background: "#F8F7FF" }}>
      <h2 className="text-base font-bold text-gray-900 mb-4">My Wishlist ({items.length})</h2>
      {items.length === 0
        ? <div className="text-center py-16 text-gray-400"><Heart className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="font-semibold">No saved items</p></div>
        : <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map((p, i) => (
              <ProductCard key={i} p={p} onView={() => onProduct(p)} onCart={() => onCart(p)}
                wishlistIds={wishlistIds} onWishlist={() => onWishlist(String(p.id))} />
            ))}
          </div>
      }
    </div>
  );
}

// ─── SELLER PORTAL ────────────────────────────────────────────────────────────
function SellerPortal() {
  const [data, setData] = useState<R | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { mktSellers.analytics("sel-01").then(r => { setData(r.data as R); setLoading(false); }); }, []);
  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6B5ED7" }} /></div>;

  const seller   = data?.seller as R;
  const revenue  = (data?.revenue as R[]) ?? [];
  const products = (data?.products as R[]) ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5" style={{ background: "#F8F7FF" }}>
      {/* Store header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: "#F3F0FF" }}>🏪</div>
        <div className="flex-1">
          <h2 className="text-lg font-black text-gray-900">{seller?.storeName as string}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <Stars rating={Number(seller?.avgRating ?? 4.7)} size={13} />
            <span className="text-xs text-gray-400">{Number(seller?.totalSales ?? 0).toLocaleString()} sales</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Revenue</p>
          <p className="text-xl font-black" style={{ color: "#6B5ED7" }}>{fmtZAR(Number(seller?.totalRevenue ?? 0))}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:"Products",    value:String(products.length),                   color:"#6B5ED7" },
          { label:"Total Sales", value:Number(seller?.totalSales ?? 0).toLocaleString(), color:"#10B981" },
          { label:"Avg Rating",  value:Number(seller?.avgRating ?? 4.7).toFixed(1), color:"#F59E0B" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Revenue — Last 7 Days</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={revenue}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
              tickFormatter={v => `R${(Number(v) / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v: number) => fmtZAR(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="revenue" fill="#6B5ED7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Products */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-900">My Products ({products.length})</h3>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: "#6B5ED7" }}>
            <Plus className="w-3.5 h-3.5" />Add Product
          </button>
        </div>
        <div className="space-y-2">
          {products.map((p, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-2xl">{p.emoji as string}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.name as string}</p>
                <p className="text-[11px] text-gray-400">{p.totalSold as number} sold · stock: {p.stock as number}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-gray-900">{fmtZAR(Number(p.price))}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.status === "active" ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"}`}>
                  {p.status as string}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminView() {
  const [stats, setStats]   = useState<R | null>(null);
  const [orders, setOrders] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([mktAdmin.stats(), mktAdmin.orders()]).then(([s, o]) => { setStats(s.data as R); setOrders(o.data as R[]); setLoading(false); });
  }, []);
  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6B5ED7" }} /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5" style={{ background: "#F8F7FF" }}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"Products",      value:String(stats?.totalProducts),  color:"#6B5ED7", icon:"📦" },
          { label:"Sellers",       value:String(stats?.totalSellers),   color:"#10B981", icon:"🏪" },
          { label:"Orders",        value:String(stats?.totalOrders),    color:"#3B82F6", icon:"🛒" },
          { label:"Pending Apps.", value:String(stats?.pendingSellerApprovals), color:"#F59E0B", icon:"⏳" },
          { label:"Revenue",       value:fmtZAR(Number(stats?.totalRevenue ?? 0)), color:"#6B5ED7", icon:"💰" },
          { label:"Customers",     value:Number(stats?.activeCustomers ?? 0).toLocaleString(), color:"#10B981", icon:"👥" },
          { label:"Reviews Pending",value:String(stats?.pendingReviews), color:"#8B5CF6", icon:"⭐" },
          { label:"Fraud Alerts",  value:"0",                           color:"#EF4444", icon:"🛡️" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <span className="text-xl">{s.icon}</span>
            <div>
              <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">All Orders</h3>
          <span className="text-xs text-gray-400">{orders.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                {["Order","Customer","Items","Total","Status","Date"].map(h => (
                  <th key={h} className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((o, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-xs font-semibold text-gray-900">{o.orderNumber as string}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{o.customerName as string}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-0.5">{(o.items as R[]).slice(0, 3).map((it, j) => <span key={j} className="text-base">{it.emoji as string}</span>)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-gray-900">{fmtZAR(Number(o.totalAmount))}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] px-2 py-1 rounded-full font-bold capitalize"
                      style={{ background: (STATUS_COLOR[o.status as string] ?? "#9CA3AF") + "20", color: STATUS_COLOR[o.status as string] ?? "#9CA3AF" }}>
                      {(o.status as string).replace(/_/g," ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{ago(o.placedAt as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top categories */}
      {(stats?.topCategories as R[])?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Top Categories</h3>
          <div className="space-y-2.5">
            {(stats?.topCategories as R[]).map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <p className="text-xs text-gray-600 w-32 truncate">{c.name as string}</p>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Number(c.count) * 25)}%`, background: "#6B5ED7" }} />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-6 text-right">{c.count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
interface VinkMarketplaceProps { isOpen: boolean; onClose: () => void }

export function VinkMarketplace({ isOpen, onClose }: VinkMarketplaceProps) {
  const [view, setView]           = useState<View>("home");
  const [categories, setCategories] = useState<R[]>([]);
  const [products, setProducts]   = useState<R[]>([]);
  const [cart, setCart]           = useState<R | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [addresses, setAddresses] = useState<R[]>([]);
  const [selProductId, setSelProductId] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [role, setRole]           = useState<"customer" | "seller" | "admin">("customer");

  const loadInitial = useCallback(async () => {
    const [catRes, prodRes, cartRes, wishRes, addrRes] = await Promise.allSettled([
      mktCategories(),
      mktProducts.list({ sort: "popular" }),
      mktCart.get("demo-customer-001"),
      mktWishlist.get("demo-customer-001"),
      mktAddresses("demo-customer-001"),
    ]);
    if (catRes.status  === "fulfilled") setCategories(catRes.value.data as R[]);
    if (prodRes.status === "fulfilled") setProducts(prodRes.value.data as R[]);
    if (cartRes.status === "fulfilled" && cartRes.value.data) setCart(cartRes.value.data as R);
    if (wishRes.status === "fulfilled") setWishlistIds(new Set((wishRes.value.data as R[]).map(p => String(p.id))));
    if (addrRes.status === "fulfilled") setAddresses(addrRes.value.data as R[]);
  }, []);

  useEffect(() => { if (isOpen) loadInitial(); }, [isOpen, loadInitial]);
  useEffect(() => { setCartCount(((cart?.items as R[]) ?? []).length); }, [cart]);

  if (!isOpen) return null;

  const handleAddToCart = async (p: R, variantId?: string) => {
    const res = await mktCart.add("demo-customer-001", { productId: p.id, variantId: variantId ?? null, quantity: 1 });
    setCart(res.data as R);
  };

  const handleUpdateQty = async (productId: string, qty: number) => {
    if (qty <= 0) { await mktCart.remove("demo-customer-001", productId); }
    else { await mktCart.update("demo-customer-001", productId, qty); }
    loadInitial();
  };

  const handleRemove = async (productId: string) => {
    await mktCart.remove("demo-customer-001", productId);
    loadInitial();
  };

  const handleCoupon = async (code: string) => {
    const res = await mktCart.coupon("demo-customer-001", code);
    if (res.data) setCart(res.data as R);
  };

  const handleWishlist = async (productId: string) => {
    if (wishlistIds.has(productId)) {
      await mktWishlist.remove("demo-customer-001", productId);
      setWishlistIds(prev => { const s = new Set(prev); s.delete(productId); return s; });
    } else {
      await mktWishlist.add("demo-customer-001", productId);
      setWishlistIds(prev => new Set([...prev, productId]));
    }
  };

  const navItems = [
    { id:"home" as View,     label:"Home",          icon:<Home className="w-4 h-4" />,          roles:["customer","seller","admin"] },
    { id:"catalog" as View,  label:"Shop",          icon:<Grid className="w-4 h-4" />,           roles:["customer","seller","admin"] },
    { id:"cart" as View,     label:"Cart",          icon:<ShoppingCart className="w-4 h-4" />,   roles:["customer"] },
    { id:"wishlist" as View, label:"Wishlist",      icon:<Heart className="w-4 h-4" />,          roles:["customer"] },
    { id:"orders" as View,   label:"My Orders",     icon:<Package className="w-4 h-4" />,        roles:["customer"] },
    { id:"seller" as View,   label:"Seller Portal", icon:<TrendingUp className="w-4 h-4" />,    roles:["seller","admin"] },
    { id:"admin" as View,    label:"Admin Panel",   icon:<Settings className="w-4 h-4" />,      roles:["admin"] },
  ].filter(n => n.roles.includes(role));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0 z-20">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <Menu className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">🛍️</span>
          <div>
            <p className="text-sm font-black text-gray-900 leading-none">Vink Marketplace</p>
            <p className="text-[10px] text-gray-400 leading-none mt-0.5">Multi-vendor platform</p>
          </div>
        </div>
        <div className="hidden md:flex flex-1 max-w-lg items-center border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input placeholder="Search products, brands, categories…"
            className="flex-1 bg-transparent text-sm outline-none text-gray-700"
            onFocus={() => setView("catalog")} />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <select value={role} onChange={e => { setRole(e.target.value as typeof role); setView("home"); }}
            className="text-xs border border-gray-200 rounded-xl px-2 py-1.5 outline-none bg-white text-gray-600 hidden md:block">
            <option value="customer">Customer</option>
            <option value="seller">Seller</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={() => setView("wishlist")} className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <Heart className={`w-5 h-5 ${wishlistIds.size > 0 ? "text-red-500" : "text-gray-500"}`} />
            {wishlistIds.size > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{wishlistIds.size}</span>}
          </button>
          <button onClick={() => setView("cart")} className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ShoppingCart className="w-5 h-5 text-gray-600" />
            {cartCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center" style={{ background: "#6B5ED7" }}>{cartCount}</span>}
          </button>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-52 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col py-3 px-2 overflow-y-auto">
            {navItems.map(item => (
              <button key={item.id} onClick={() => setView(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left text-sm font-medium mb-0.5"
                style={{ background: view === item.id ? "#F3F0FF" : "transparent", color: view === item.id ? "#6B5ED7" : "#6B7280" }}>
                {item.icon}
                <span>{item.label}</span>
                {item.id === "cart" && cartCount > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-white rounded-full w-4 h-4 flex items-center justify-center" style={{ background: "#6B5ED7" }}>{cartCount}</span>
                )}
              </button>
            ))}
            {isDemoMode() && (
              <div className="mt-auto mx-1 mb-1 p-2.5 rounded-xl text-[10px] text-amber-700 bg-amber-50 border border-amber-100">
                ⚡ Demo Mode — data is simulated
              </div>
            )}
          </aside>
        )}

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {view === "home" && (
            <HomeView
              categories={categories} products={products}
              onCategory={() => setView("catalog")}
              onProduct={p => { setSelProductId(String(p.id)); setView("product"); }}
              onCart={handleAddToCart}
              wishlistIds={wishlistIds} onWishlist={handleWishlist}
            />
          )}
          {view === "catalog" && (
            <CatalogView
              categories={categories}
              onProduct={p => { setSelProductId(String(p.id)); setView("product"); }}
              onCart={handleAddToCart}
              wishlistIds={wishlistIds} onWishlist={handleWishlist}
            />
          )}
          {view === "product" && (
            <ProductDetailView
              productId={selProductId}
              onBack={() => setView("catalog")}
              onCart={(p, v) => { handleAddToCart(p, v); setView("cart"); }}
              wishlistIds={wishlistIds} onWishlist={handleWishlist}
            />
          )}
          {view === "cart" && (
            <CartView
              cart={cart}
              onUpdateQty={handleUpdateQty}
              onRemove={handleRemove}
              onApplyCoupon={handleCoupon}
              onCheckout={() => setView("checkout")}
            />
          )}
          {view === "checkout" && (
            <CheckoutView
              cart={cart} addresses={addresses}
              onBack={() => setView("home")}
              onComplete={() => { loadInitial(); }}
            />
          )}
          {view === "orders"   && <OrdersView />}
          {view === "wishlist" && (
            <WishlistView
              wishlistIds={wishlistIds}
              onProduct={p => { setSelProductId(String(p.id)); setView("product"); }}
              onCart={handleAddToCart} onWishlist={handleWishlist}
            />
          )}
          {view === "seller" && <SellerPortal />}
          {view === "admin"   && <AdminView />}
        </div>
      </div>
    </div>
  );
}
