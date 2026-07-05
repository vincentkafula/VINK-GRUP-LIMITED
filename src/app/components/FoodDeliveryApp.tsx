/**
 * VMS Food Delivery System
 * Full-stack food ordering platform integrated with VMS Banking.
 * Roles: Customer | Restaurant | Driver | Admin
 * Order lifecycle: Pending → Accepted → Preparing → Ready → Picked Up → Delivered
 */
import { useState, useEffect, useCallback } from "react";
import {
  X, ShoppingCart, Star, Search, MapPin, Clock, ChevronRight,
  Plus, Minus, CheckCircle, Truck, Package, UtensilsCrossed,
  BarChart3, Users, Settings, Bell, TrendingUp, Navigation,
  DollarSign, AlertCircle, RefreshCw, Heart, Filter,
} from "lucide-react";
import { projectId } from "../../../utils/supabase/info";

interface Props { isOpen: boolean; onClose: () => void; }

const SB = `https://${projectId}.supabase.co/functions/v1/make-server-3f39932e/food`;
const LOCAL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001") + "/api/food";

async function api(path: string, opts?: RequestInit) {
  try {
    const r = await fetch(`${SB}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers } });
    if (r.ok || r.status < 500) return r.json();
  } catch {}
  return { success: true, data: null };
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const ORANGE = "#FF5722";
const DARK   = "#1A1A1A";
const CARD   = "#FFFFFF";

// ─── Demo data ────────────────────────────────────────────────────────────────
const RESTAURANTS = [
  { id: "r1", name: "Nando's Cape Town CBD",      cuisine: "Portuguese · Chicken",  rating: 4.7, reviews: 2847, deliveryTime: "25–35 min", deliveryFee: 25, minOrder: 80,  image: "🍗", promo: "20% off", open: true,  category: "chicken" },
  { id: "r2", name: "Kauai Health Bar",            cuisine: "Healthy · Wraps",       rating: 4.5, reviews: 1203, deliveryTime: "20–30 min", deliveryFee: 20, minOrder: 60,  image: "🥗", promo: null,     open: true,  category: "healthy" },
  { id: "r3", name: "Ocean Basket Waterfront",    cuisine: "Seafood · Fish",        rating: 4.8, reviews: 3421, deliveryTime: "35–45 min", deliveryFee: 30, minOrder: 120, image: "🐟", promo: "Free delivery", open: true,  category: "seafood" },
  { id: "r4", name: "Panarottis V&A",             cuisine: "Italian · Pizza · Pasta",rating: 4.3, reviews: 987,  deliveryTime: "30–40 min", deliveryFee: 25, minOrder: 90,  image: "🍕", promo: null,     open: true,  category: "italian" },
  { id: "r5", name: "Steers Cape Quarter",        cuisine: "Burgers · Fries",       rating: 4.2, reviews: 1854, deliveryTime: "15–25 min", deliveryFee: 15, minOrder: 50,  image: "🍔", promo: "Buy 2 get 1",  open: true, category: "burgers" },
  { id: "r6", name: "Col'Cacchio Pizzeria",       cuisine: "Pizza · Italian",       rating: 4.6, reviews: 2109, deliveryTime: "30–45 min", deliveryFee: 28, minOrder: 100, image: "🫓", promo: null,     open: false, category: "pizza" },
];

type MenuItem = { id: string; name: string; description: string; price: number; calories?: number; image: string; popular?: boolean; category: string; };

const MENUS: Record<string, MenuItem[]> = {
  r1: [
    { id: "m1", name: "¼ Chicken PERi-PERi",     description: "Flame-grilled quarter chicken with your choice of PERi-PERi sauce", price: 89,  calories: 420, image: "🍗", popular: true, category: "Chicken" },
    { id: "m2", name: "Espetada",                  description: "Succulent chicken skewer marinated in lemon & herb",              price: 109, calories: 380, image: "🍢", popular: false, category: "Chicken" },
    { id: "m3", name: "Pita Pocket",               description: "Grilled chicken strips, lettuce, tomato in pita bread",          price: 79,  calories: 340, image: "🫓", popular: true, category: "Wraps" },
    { id: "m4", name: "Fino Chicken Burger",       description: "Crispy chicken fillet, coleslaw, PERi-PERi mayo",                price: 99,  calories: 560, image: "🍔", popular: false, category: "Burgers" },
    { id: "m5", name: "Peri Chips",                description: "Thick cut chips tossed in PERi-PERi spice",                     price: 45,  calories: 380, image: "🍟", popular: true, category: "Sides" },
    { id: "m6", name: "Coleslaw",                  description: "Creamy house coleslaw",                                         price: 29,  calories: 120, image: "🥗", popular: false, category: "Sides" },
    { id: "m7", name: "Bottomless Drink",          description: "Pepsi, Cream Soda, Lemonade or Sprite",                        price: 35,  calories: 140, image: "🥤", popular: false, category: "Drinks" },
  ],
  r2: [
    { id: "k1", name: "Rainbow Wrap",             description: "Grilled chicken, roasted peppers, hummus, feta",                price: 89,  calories: 380, image: "🌯", popular: true, category: "Wraps" },
    { id: "k2", name: "Green Goodness Smoothie",  description: "Spinach, banana, mango, coconut water",                        price: 65,  calories: 180, image: "🥤", popular: true, category: "Smoothies" },
    { id: "k3", name: "Acai Bowl",                description: "Acai blend, granola, fresh fruit, honey",                      price: 79,  calories: 340, image: "🫙", popular: false, category: "Bowls" },
    { id: "k4", name: "Protein Bowl",             description: "Brown rice, grilled chicken, edamame, avocado, sesame",        price: 109, calories: 520, image: "🍱", popular: true, category: "Bowls" },
  ],
  r3: [
    { id: "o1", name: "Calamari",                 description: "Crispy battered calamari with tartare sauce",                  price: 89,  calories: 420, image: "🦑", popular: true, category: "Starters" },
    { id: "o2", name: "Linefish & Chips",         description: "Fresh catch of the day, chips and salad",                     price: 159, calories: 680, image: "🐟", popular: true, category: "Mains" },
    { id: "o3", name: "Seafood Platter (2 pax)",  description: "Prawns, calamari, mussels, linefish for two",                 price: 389, calories: 1200, image: "🦞", popular: false, category: "Platters" },
    { id: "o4", name: "Prawn Cocktail",           description: "Chilled prawns, Marie Rose sauce, lettuce",                  price: 129, calories: 280, image: "🍤", popular: false, category: "Starters" },
  ],
  r5: [
    { id: "b1", name: "Steers Burger",            description: "100% pure beef patty, lettuce, tomato, cheese, sauce",       price: 79,  calories: 620, image: "🍔", popular: true, category: "Burgers" },
    { id: "b2", name: "Buster",                   description: "Double beef patty, bacon, egg, cheese",                     price: 109, calories: 820, image: "🍔", popular: true, category: "Burgers" },
    { id: "b3", name: "Mega Meal Deal",           description: "Burger + regular chips + 500ml drink",                      price: 129, calories: 980, image: "🍟", popular: true, category: "Deals" },
    { id: "b4", name: "Wacky Wednesday 2-pack",   description: "2 Steers Burgers (Wed special)",                            price: 99,  calories: 1240, image: "🎉", popular: false, category: "Specials" },
  ],
};

const ORDER_STATUSES = ["pending","accepted","preparing","ready","picked_up","delivered"] as const;
type OrderStatus = typeof ORDER_STATUSES[number];

const STATUS_INFO: Record<OrderStatus, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  pending:   { label: "Order Placed",       color: "#F59E0B", icon: <Clock className="w-5 h-5" />,         desc: "Waiting for restaurant to confirm" },
  accepted:  { label: "Order Confirmed",    color: "#3B82F6", icon: <CheckCircle className="w-5 h-5" />,   desc: "Restaurant has accepted your order" },
  preparing: { label: "Being Prepared",     color: ORANGE,    icon: <UtensilsCrossed className="w-5 h-5" />,desc: "Chef is preparing your food" },
  ready:     { label: "Ready for Pickup",   color: "#8B5CF6", icon: <Package className="w-5 h-5" />,       desc: "Food is ready, driver on the way" },
  picked_up: { label: "Out for Delivery",   color: "#10B981", icon: <Truck className="w-5 h-5" />,         desc: "Driver is heading to you" },
  delivered: { label: "Delivered!",          color: "#10B981", icon: <CheckCircle className="w-5 h-5" />,  desc: "Enjoy your meal! 🎉" },
};

type CartItem = MenuItem & { qty: number; restaurantId: string; restaurantName: string; };
type AppRole = "customer" | "restaurant" | "driver" | "admin";
type CustomerScreen = "home" | "restaurant" | "cart" | "tracking" | "history" | "profile";
type RestScreen = "orders" | "menu" | "analytics";
type DriverScreen = "available" | "active" | "earnings";
type AdminScreen = "dashboard" | "orders" | "restaurants" | "drivers";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => `R ${n.toFixed(2)}`;
const StarRow = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-0.5">
    {[1,2,3,4,5].map(s => <span key={s} className="text-[10px]" style={{ color: s <= Math.round(rating) ? "#F5A623" : "#E5E7EB" }}>★</span>)}
  </div>
);

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: OrderStatus }) {
  const info = STATUS_INFO[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: info.color + "20", color: info.color }}>
      <span className="scale-75">{info.icon}</span>{info.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function CustomerApp({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<CustomerScreen>("home");
  const [selectedRestaurant, setSelectedRestaurant] = useState<typeof RESTAURANTS[0] | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("preparing");
  const [orderRef, setOrderRef] = useState("");
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [orderHistory] = useState([
    { id: "ORD-001", restaurant: "Nando's Cape Town CBD", items: ["¼ Chicken PERi-PERi", "Peri Chips"], total: 134, status: "delivered" as OrderStatus, date: "2 days ago" },
    { id: "ORD-002", restaurant: "Kauai Health Bar", items: ["Rainbow Wrap", "Green Goodness Smoothie"], total: 154, status: "delivered" as OrderStatus, date: "5 days ago" },
  ]);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const addToCart = (item: MenuItem, rest: typeof RESTAURANTS[0]) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...item, qty: 1, restaurantId: rest.id, restaurantName: rest.name }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));
  };

  const placeOrder = () => {
    const ref = `ORD-${Math.floor(Math.random() * 900000 + 100000)}`;
    setOrderRef(ref);
    setOrderStatus("pending");
    setCart([]);
    setScreen("tracking");
    // Simulate order progression
    const progression: OrderStatus[] = ["accepted", "preparing", "ready", "picked_up", "delivered"];
    let i = 0;
    const advance = () => {
      if (i < progression.length) { setOrderStatus(progression[i++]); setTimeout(advance, 8000); }
    };
    setTimeout(advance, 3000);
  };

  const filtered = RESTAURANTS.filter(r =>
    (activeCategory === "all" || r.category === activeCategory) &&
    (r.name.toLowerCase().includes(search.toLowerCase()) || r.cuisine.toLowerCase().includes(search.toLowerCase()))
  );

  const menu = selectedRestaurant ? (MENUS[selectedRestaurant.id] ?? []) : [];
  const categories = ["all", "chicken", "healthy", "seafood", "italian", "burgers", "pizza"];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <div>
          <p className="text-xs text-gray-500">Delivering to</p>
          <button className="flex items-center gap-1 text-sm font-bold text-gray-900">
            <MapPin className="w-3.5 h-3.5" style={{ color: ORANGE }} />Cape Town CBD <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="relative p-2 rounded-full bg-gray-100" onClick={() => setScreen("cart")}>
            <ShoppingCart className="w-5 h-5 text-gray-700" />
            {cartCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center" style={{ background: ORANGE }}>{cartCount}</span>}
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* HOME */}
        {screen === "home" && (
          <div className="space-y-0">
            {/* Hero */}
            <div className="px-4 py-5" style={{ background: `linear-gradient(135deg,${ORANGE},#FF8A50)` }}>
              <p className="text-white font-black text-xl mb-1">Hungry? 🍽️</p>
              <p className="text-white/80 text-sm mb-4">Order from 50+ restaurants near you</p>
              <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-sm">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input className="flex-1 text-sm outline-none text-gray-700" placeholder="Search restaurants or cuisines..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Promo banner */}
            <div className="px-4 py-3">
              <div className="rounded-2xl p-4 text-white flex items-center justify-between"
                style={{ background: "linear-gradient(135deg,#1a1a1a,#333)" }}>
                <div>
                  <p className="font-black text-base">Pay with Vink</p>
                  <p className="text-white/70 text-xs mt-0.5">Get R20 off your first order when you pay with your Vink card</p>
                </div>
                <span className="text-3xl">💳</span>
              </div>
            </div>

            {/* Category filter */}
            <div className="px-4 pb-2">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold capitalize transition-all"
                    style={{ background: activeCategory === cat ? ORANGE : "#F3F4F6", color: activeCategory === cat ? "#fff" : "#374151" }}>
                    {cat === "all" ? "🍽️ All" : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Restaurants */}
            <div className="px-4 pb-4 space-y-3">
              {filtered.map(rest => (
                <button key={rest.id} onClick={() => { setSelectedRestaurant(rest); setScreen("restaurant"); }}
                  className="w-full bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all text-left">
                  <div className="h-28 flex items-center justify-center text-5xl relative" style={{ background: "linear-gradient(135deg,#FFF3E0,#FFE0B2)" }}>
                    {rest.image}
                    {rest.promo && <span className="absolute top-2 left-2 text-[10px] font-black text-white px-2 py-0.5 rounded-full" style={{ background: ORANGE }}>{rest.promo}</span>}
                    {!rest.open && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="text-white font-black text-sm">Closed</span></div>}
                    <button onClick={e => { e.stopPropagation(); setWishlist(w => { const n=new Set(w); n.has(rest.id)?n.delete(rest.id):n.add(rest.id); return n; }); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white flex items-center justify-center">
                      <Heart className="w-3.5 h-3.5" style={{ color: wishlist.has(rest.id) ? "#EF4444" : "#9CA3AF", fill: wishlist.has(rest.id) ? "#EF4444" : "none" }} />
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{rest.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{rest.cuisine}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span style={{ color: "#F5A623" }}>★</span><span className="font-semibold text-gray-700">{rest.rating}</span> ({rest.reviews.toLocaleString()})</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{rest.deliveryTime}</span>
                      <span className="flex items-center gap-1"><Truck className="w-3 h-3" />R{rest.deliveryFee}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* RESTAURANT */}
        {screen === "restaurant" && selectedRestaurant && (
          <div>
            <div className="h-40 flex items-center justify-center text-7xl relative" style={{ background: "linear-gradient(135deg,#FFF3E0,#FFE0B2)" }}>
              {selectedRestaurant.image}
              <button onClick={() => setScreen("home")} className="absolute top-3 left-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow">
                <ChevronRight className="w-4 h-4 rotate-180 text-gray-700" />
              </button>
            </div>
            <div className="bg-white px-4 py-4 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-900">{selectedRestaurant.name}</h2>
              <p className="text-sm text-gray-500">{selectedRestaurant.cuisine}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span><span style={{ color: "#F5A623" }}>★</span> <strong>{selectedRestaurant.rating}</strong></span>
                <span><Clock className="w-3 h-3 inline" /> {selectedRestaurant.deliveryTime}</span>
                <span>Min. R{selectedRestaurant.minOrder}</span>
                <span>Delivery R{selectedRestaurant.deliveryFee}</span>
              </div>
            </div>
            <div className="px-4 py-4 space-y-3">
              {Object.entries(
                menu.reduce((acc, item) => { (acc[item.category] = acc[item.category] || []).push(item); return acc; }, {} as Record<string, MenuItem[]>)
              ).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-sm font-black text-gray-900 mb-2">{cat}</p>
                  <div className="space-y-2">
                    {items.map(item => {
                      const inCart = cart.find(c => c.id === item.id);
                      return (
                        <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 shadow-sm">
                          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background: "#FFF3E0" }}>{item.image}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                              {item.popular && <span className="text-[9px] font-black text-white px-1.5 py-0.5 rounded-full" style={{ background: ORANGE }}>Popular</span>}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>
                            <p className="text-sm font-black mt-1" style={{ color: ORANGE }}>{fmt(item.price)}</p>
                          </div>
                          {inCart ? (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button onClick={() => updateQty(item.id, -1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: ORANGE + "20" }}><Minus className="w-3 h-3" style={{ color: ORANGE }} /></button>
                              <span className="text-sm font-black w-5 text-center">{inCart.qty}</span>
                              <button onClick={() => addToCart(item, selectedRestaurant)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: ORANGE }}><Plus className="w-3 h-3 text-white" /></button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item, selectedRestaurant)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: ORANGE }}>
                              <Plus className="w-4 h-4 text-white" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CART */}
        {screen === "cart" && (
          <div className="px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900">Your Cart</h2>
              <button onClick={() => setScreen("home")} className="text-xs font-semibold" style={{ color: ORANGE }}>+ Add more</button>
            </div>
            {cart.length === 0 ? (
              <div className="text-center py-20">
                <span className="text-5xl">🛒</span>
                <p className="font-bold text-gray-700 mt-3">Your cart is empty</p>
                <button onClick={() => setScreen("home")} className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: ORANGE }}>Browse Restaurants</button>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3">
                      <span className="text-2xl">{item.image}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.restaurantName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-100"><Minus className="w-3 h-3 text-gray-600" /></button>
                        <span className="text-sm font-black w-4 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: ORANGE }}><Plus className="w-3 h-3 text-white" /></button>
                      </div>
                      <p className="text-sm font-black w-14 text-right" style={{ color: ORANGE }}>{fmt(item.price * item.qty)}</p>
                    </div>
                  ))}
                </div>
                {/* Order summary */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                  <p className="text-sm font-bold text-gray-900 mb-3">Order Summary</p>
                  {[{ label: "Subtotal", value: fmt(cartTotal) }, { label: "Delivery fee", value: "R25.00" }, { label: "Service fee", value: "R5.00" }].map((r, i) => (
                    <div key={i} className="flex justify-between text-sm"><span className="text-gray-500">{r.label}</span><span className="font-semibold">{r.value}</span></div>
                  ))}
                  <div className="flex justify-between text-base font-black pt-2 border-t border-gray-100">
                    <span>Total</span><span style={{ color: ORANGE }}>{fmt(cartTotal + 30)}</span>
                  </div>
                </div>
                {/* Payment */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-sm font-bold text-gray-900 mb-2">Payment method</p>
                  {[{ icon: "💳", label: "Vink Card •••• 4291", sub: "Earn VinkPoints on this order" }, { icon: "💵", label: "Cash on Delivery", sub: "" }].map((p, i) => (
                    <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl mb-1.5 ${i === 0 ? "border-2" : "border border-gray-100"}`}
                      style={{ borderColor: i === 0 ? ORANGE : undefined, background: i === 0 ? ORANGE + "05" : undefined }}>
                      <span className="text-xl">{p.icon}</span>
                      <div><p className="text-xs font-semibold text-gray-800">{p.label}</p>{p.sub && <p className="text-[10px] text-green-600">{p.sub}</p>}</div>
                      {i === 0 && <div className="ml-auto w-4 h-4 rounded-full border-2 border-orange-500 flex items-center justify-center"><div className="w-2 h-2 rounded-full" style={{ background: ORANGE }} /></div>}
                    </div>
                  ))}
                </div>
                <button onClick={placeOrder} className="w-full py-4 rounded-2xl text-base font-black text-white shadow-lg transition-all hover:opacity-90"
                  style={{ background: `linear-gradient(135deg,${ORANGE},#FF8A50)` }}>
                  Place Order · {fmt(cartTotal + 30)}
                </button>
              </>
            )}
          </div>
        )}

        {/* TRACKING */}
        {screen === "tracking" && (
          <div className="px-4 py-5 space-y-5">
            <div className="text-center">
              <p className="text-xs text-gray-500">Order {orderRef}</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{STATUS_INFO[orderStatus].label}</p>
              <p className="text-sm text-gray-500 mt-1">{STATUS_INFO[orderStatus].desc}</p>
            </div>
            {/* Progress */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              {ORDER_STATUSES.map((s, i) => {
                const current = ORDER_STATUSES.indexOf(orderStatus);
                const isDone = i <= current;
                const isActive = i === current;
                return (
                  <div key={s} className="flex items-center gap-3 mb-3 last:mb-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: isDone ? ORANGE : "#F3F4F6" }}>
                      {isDone ? <CheckCircle className="w-4 h-4 text-white" /> : <span className="w-2 h-2 rounded-full bg-gray-300" />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${isDone ? "text-gray-900" : "text-gray-400"}`}>{STATUS_INFO[s].label}</p>
                    </div>
                    {isActive && <span className="text-[10px] font-black text-white px-2 py-0.5 rounded-full" style={{ background: ORANGE }}>Now</span>}
                  </div>
                );
              })}
            </div>
            {/* Map placeholder */}
            <div className="rounded-2xl overflow-hidden h-40 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#E8F5E9,#C8E6C9)" }}>
              <div className="text-center">
                <Navigation className="w-8 h-8 mx-auto mb-2" style={{ color: "#2E7D32" }} />
                <p className="text-sm font-semibold text-green-800">Live tracking active</p>
                <p className="text-xs text-green-600">Driver is 1.2 km away</p>
              </div>
            </div>
            {orderStatus === "delivered" && (
              <button onClick={() => setScreen("home")} className="w-full py-3 rounded-xl text-sm font-black text-white" style={{ background: ORANGE }}>
                Rate your order ⭐
              </button>
            )}
          </div>
        )}

        {/* HISTORY */}
        {screen === "history" && (
          <div className="px-4 py-4 space-y-3">
            <h2 className="text-lg font-black text-gray-900">Order History</h2>
            {orderHistory.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{order.restaurant}</p>
                    <p className="text-xs text-gray-500">{order.date}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-xs text-gray-500 mb-2">{order.items.join(", ")}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black" style={{ color: ORANGE }}>{fmt(order.total)}</span>
                  <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: ORANGE, color: ORANGE }}>Reorder</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex-shrink-0 flex border-t border-gray-100 bg-white">
        {[
          { id: "home" as CustomerScreen, icon: "🏠", label: "Home" },
          { id: "history" as CustomerScreen, icon: "📋", label: "Orders" },
          { id: "cart" as CustomerScreen, icon: "🛒", label: "Cart", badge: cartCount },
          { id: "profile" as CustomerScreen, icon: "👤", label: "Profile" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setScreen(tab.id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2.5 relative">
            <span className="text-lg">{tab.icon}</span>
            {tab.badge ? <span className="absolute top-1.5 right-1/4 w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center" style={{ background: ORANGE }}>{tab.badge}</span> : null}
            <span className="text-[10px] font-medium" style={{ color: screen === tab.id ? ORANGE : "#9CA3AF" }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESTAURANT VIEW
// ═══════════════════════════════════════════════════════════════════════════════

const DEMO_ORDERS = [
  { id: "ORD-847219", customer: "Nomsa Zulu", items: ["¼ Chicken PERi-PERi x2", "Peri Chips"], total: 223, status: "preparing" as OrderStatus, time: "5 min ago", address: "14 Long St, Cape Town CBD" },
  { id: "ORD-338821", customer: "Sipho Dlamini", items: ["Fino Chicken Burger", "Bottomless Drink"], total: 134, status: "accepted" as OrderStatus, time: "12 min ago", address: "2 Buitenkant St" },
  { id: "ORD-992147", customer: "Priya Naidoo", items: ["Pita Pocket x3", "Coleslaw"], total: 266, status: "pending" as OrderStatus, time: "2 min ago", address: "Greenmarket Square" },
];

function RestaurantApp({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<RestScreen>("orders");
  const [orders, setOrders] = useState(DEMO_ORDERS);

  const updateStatus = (id: string, newStatus: OrderStatus) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = { pending: "accepted", accepted: "preparing", preparing: "ready", ready: "picked_up" };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100 flex-shrink-0">
        <div><p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Restaurant Portal</p><p className="text-base font-black text-gray-900">Nando's Cape Town CBD</p></div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Open</span>
          <button onClick={onClose} className="p-1.5 rounded-full bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {screen === "orders" && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[{ label: "New Orders", value: orders.filter(o=>o.status==="pending").length, color: "#F59E0B" },
                { label: "Preparing", value: orders.filter(o=>o.status==="preparing").length, color: ORANGE },
                { label: "Completed Today", value: 28, color: "#10B981" }].map((s,i) => (
                <div key={i} className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
                  <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {orders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div><p className="text-sm font-bold text-gray-900">{order.id}</p><p className="text-xs text-gray-500">{order.customer} · {order.time}</p></div>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-xs text-gray-600 mb-1">{order.items.join(", ")}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mb-3"><MapPin className="w-3 h-3" />{order.address}</p>
                <div className="flex items-center justify-between">
                  <span className="text-base font-black" style={{ color: ORANGE }}>{fmt(order.total)}</span>
                  <div className="flex gap-2">
                    {order.status === "pending" && <button onClick={() => updateStatus(order.id, "accepted")} className="px-4 py-2 rounded-xl text-xs font-black text-white" style={{ background: "#10B981" }}>Accept ✓</button>}
                    {order.status === "pending" && <button onClick={() => updateStatus(order.id, "delivered")} className="px-3 py-2 rounded-xl text-xs font-bold text-gray-600 border border-gray-200">Reject</button>}
                    {order.status !== "pending" && nextStatus[order.status] && (
                      <button onClick={() => updateStatus(order.id, nextStatus[order.status]!)} className="px-4 py-2 rounded-xl text-xs font-black text-white" style={{ background: ORANGE }}>
                        Mark {STATUS_INFO[nextStatus[order.status]!].label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {screen === "menu" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-black text-gray-900">Menu Items</h2>
              <button className="text-xs font-bold text-white px-3 py-1.5 rounded-lg" style={{ background: ORANGE }}>+ Add Item</button>
            </div>
            {(MENUS.r1 ?? []).map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 shadow-sm">
                <span className="text-3xl">{item.image}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                  <p className="text-[11px] text-gray-500 line-clamp-1">{item.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-black" style={{ color: ORANGE }}>{fmt(item.price)}</p>
                  <button className="text-[10px] text-blue-600 font-semibold mt-0.5">Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {screen === "analytics" && (
          <div className="p-4 space-y-4">
            <h2 className="text-base font-black text-gray-900">Sales Analytics</h2>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: "Today's Revenue", value: "R4,284", icon: "💰", color: "#10B981" },
                { label: "Orders Today", value: "28", icon: "📦", color: ORANGE },
                { label: "Avg. Order Value", value: "R153", icon: "📊", color: "#3B82F6" },
                { label: "Rating", value: "4.7 ★", icon: "⭐", color: "#F5A623" }].map((s, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                  <span className="text-2xl">{s.icon}</span>
                  <p className="text-xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900 mb-3">Top Items Today</p>
              {[{ name: "¼ Chicken PERi-PERi", orders: 34, revenue: 3026 }, { name: "Peri Chips", orders: 28, revenue: 1260 }, { name: "Pita Pocket", orders: 21, revenue: 1659 }].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div><p className="text-xs font-semibold text-gray-800">{item.name}</p><p className="text-[10px] text-gray-500">{item.orders} orders</p></div>
                  <span className="text-xs font-black" style={{ color: ORANGE }}>{fmt(item.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex border-t border-gray-100 bg-white">
        {[{ id: "orders" as RestScreen, icon: "📦", label: "Orders" }, { id: "menu" as RestScreen, icon: "🍽️", label: "Menu" }, { id: "analytics" as RestScreen, icon: "📊", label: "Analytics" }].map(tab => (
          <button key={tab.id} onClick={() => setScreen(tab.id)} className="flex-1 flex flex-col items-center gap-0.5 py-2.5">
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px] font-medium" style={{ color: screen === tab.id ? ORANGE : "#9CA3AF" }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function DriverApp({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<DriverScreen>("available");
  const [activeDelivery, setActiveDelivery] = useState<null | typeof DEMO_ORDERS[0]>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<"picked_up" | "delivered">("picked_up");

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/10 flex-shrink-0">
        <div><p className="text-[10px] text-white/50 font-semibold uppercase">Driver Portal</p><p className="text-base font-black text-white">Sipho Dlamini</p></div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/15 px-2 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Online</span>
          <button onClick={onClose} className="p-1.5 rounded-full bg-white/10 text-white/50"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {screen === "available" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[{ label: "Deliveries Today", value: "12", color: ORANGE }, { label: "Earnings Today", value: "R284", color: "#10B981" }, { label: "Avg. Rating", value: "4.8★", color: "#F5A623" }].map((s,i) => (
                <div key={i} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,.08)" }}>
                  <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] text-white/50 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-sm font-bold text-white/70">Available Deliveries</p>
            {DEMO_ORDERS.filter(o => o.status === "ready" || o.status === "preparing").slice(0,2).concat([
              { id: "ORD-112233", customer: "Lindiwe Mokoena", items: ["Seafood Platter (2 pax)"], total: 389, status: "ready" as OrderStatus, time: "Now", address: "V&A Waterfront, Cape Town" }
            ]).map(order => (
              <div key={order.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.08)" }}>
                <div className="flex items-start justify-between mb-2">
                  <div><p className="text-sm font-bold text-white">{order.id}</p><p className="text-xs text-white/50">{order.customer}</p></div>
                  <span className="text-xs font-bold text-white bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">R{Math.round(order.total * 0.10)} earn</span>
                </div>
                <p className="text-xs text-white/60 flex items-center gap-1 mb-1"><MapPin className="w-3 h-3" style={{ color: ORANGE }} />{order.address}</p>
                <p className="text-xs text-white/60 mb-3">{order.items.join(", ")}</p>
                <div className="flex gap-2">
                  <button onClick={() => { setActiveDelivery(order); setScreen("active"); }} className="flex-1 py-2 rounded-xl text-xs font-black text-white" style={{ background: ORANGE }}>Accept Delivery</button>
                  <button className="px-4 py-2 rounded-xl text-xs font-bold text-white/60 border border-white/20">Skip</button>
                </div>
              </div>
            ))}
          </>
        )}

        {screen === "active" && activeDelivery && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden h-48 flex items-center justify-center relative"
              style={{ background: "linear-gradient(135deg,#1B4332,#2D6A4F)" }}>
              <div className="text-center">
                <Navigation className="w-10 h-10 mx-auto mb-2 text-green-300" />
                <p className="text-white font-bold">Route Active</p>
                <p className="text-green-300 text-sm">1.4 km to destination</p>
                <p className="text-white/60 text-xs mt-1">Estimated: 8 minutes</p>
              </div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.08)" }}>
              <p className="text-sm font-bold text-white mb-3">Delivery Details</p>
              <div className="space-y-2 text-xs text-white/70">
                <p><span className="text-white/50">Customer:</span> {activeDelivery.customer}</p>
                <p><span className="text-white/50">Address:</span> {activeDelivery.address}</p>
                <p><span className="text-white/50">Order:</span> {activeDelivery.items.join(", ")}</p>
                <p><span className="text-white/50">Total:</span> <span className="font-black" style={{ color: ORANGE }}>{fmt(activeDelivery.total)}</span></p>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 flex-1 py-3 rounded-xl text-sm font-bold text-white/70 border border-white/20 justify-center"><Navigation className="w-4 h-4" />Navigate</button>
              <button onClick={() => { setDeliveryStatus("delivered"); setTimeout(() => { setActiveDelivery(null); setScreen("available"); }, 2000); }}
                className="flex-1 py-3 rounded-xl text-sm font-black text-white justify-center" style={{ background: "#10B981" }}>
                {deliveryStatus === "delivered" ? "✓ Delivered!" : "Mark Delivered"}
              </button>
            </div>
          </div>
        )}

        {screen === "earnings" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 text-center" style={{ background: `linear-gradient(135deg,${ORANGE},#FF8A50)` }}>
              <p className="text-white/80 text-xs font-semibold uppercase tracking-wide">Total This Week</p>
              <p className="text-4xl font-black text-white mt-1">R1,842</p>
              <p className="text-white/70 text-sm mt-1">47 deliveries · Avg R39.19/delivery</p>
            </div>
            <div className="space-y-2">
              {[{ day: "Today", deliveries: 12, earned: 284 }, { day: "Yesterday", deliveries: 15, earned: 356 }, { day: "Tuesday", deliveries: 10, earned: 248 }, { day: "Monday", deliveries: 10, earned: 234 }].map((d, i) => (
                <div key={i} className="rounded-xl p-3 flex items-center justify-between" style={{ background: "rgba(255,255,255,.08)" }}>
                  <div><p className="text-sm font-semibold text-white">{d.day}</p><p className="text-xs text-white/50">{d.deliveries} deliveries</p></div>
                  <span className="text-base font-black" style={{ color: ORANGE }}>R{d.earned}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex border-t border-white/10">
        {[{ id: "available" as DriverScreen, icon: "📍", label: "Available" }, { id: "active" as DriverScreen, icon: "🚗", label: "Active" }, { id: "earnings" as DriverScreen, icon: "💰", label: "Earnings" }].map(tab => (
          <button key={tab.id} onClick={() => setScreen(tab.id)} className="flex-1 flex flex-col items-center gap-0.5 py-2.5">
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px] font-medium" style={{ color: screen === tab.id ? ORANGE : "rgba(255,255,255,0.4)" }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function AdminApp({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<AdminScreen>("dashboard");

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100 flex-shrink-0">
        <div><p className="text-[10px] text-gray-500 font-semibold uppercase">Admin Dashboard</p><p className="text-base font-black text-gray-900">VMS Food Operations</p></div>
        <button onClick={onClose} className="p-1.5 rounded-full bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {screen === "dashboard" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: "Active Orders", value: "47", icon: "📦", color: ORANGE }, { label: "Online Drivers", value: "23", icon: "🚗", color: "#10B981" }, { label: "Restaurants", value: "6", icon: "🍽️", color: "#3B82F6" }, { label: "Today Revenue", value: "R18,420", icon: "💰", color: "#8B5CF6" }].map((s,i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 mb-2"><span className="text-2xl">{s.icon}</span></div>
                  <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[11px] text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-500" />Issues requiring attention</p>
              {[{ msg: "Order ORD-992147 pending for 15 min", severity: "warn" }, { msg: "Driver #drv-003 offline during shift", severity: "info" }, { msg: "Restaurant 'Col'Cacchio' closed early", severity: "info" }].map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.severity==="warn"?"bg-amber-500":"bg-blue-400"}`} />
                  <p className="text-xs text-gray-700">{a.msg}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900 mb-3">Commission Summary</p>
              {[{ label: "Gross order value", value: "R18,420" }, { label: "Platform commission (12%)", value: "R2,210" }, { label: "Driver earnings", value: "R2,763" }, { label: "Restaurant payout", value: "R13,447" }].map((r, i) => (
                <div key={i} className="flex justify-between py-1.5 text-xs border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{r.label}</span><span className="font-bold text-gray-900">{r.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {screen === "orders" && (
          <div className="space-y-3">
            <h2 className="text-base font-black text-gray-900">All Orders</h2>
            {DEMO_ORDERS.map(order => (
              <div key={order.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-gray-800">{order.id}</p>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-xs text-gray-600">{order.customer} · {order.items[0]}</p>
                <p className="text-xs text-gray-400">{order.time}</p>
              </div>
            ))}
          </div>
        )}

        {screen === "restaurants" && (
          <div className="space-y-3">
            <h2 className="text-base font-black text-gray-900">Restaurants</h2>
            {RESTAURANTS.map(rest => (
              <div key={rest.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm flex items-center gap-3">
                <span className="text-3xl">{rest.image}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{rest.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StarRow rating={rest.rating} />
                    <span className="text-[10px] text-gray-500">{rest.rating}</span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rest.open?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>{rest.open?"Open":"Closed"}</span>
              </div>
            ))}
          </div>
        )}

        {screen === "drivers" && (
          <div className="space-y-3">
            <h2 className="text-base font-black text-gray-900">Active Drivers</h2>
            {[{ name: "Sipho Dlamini", rating: 4.8, deliveries: 12, status: "delivering", lat: "-33.92" }, { name: "Thabo Nkosi", rating: 4.6, deliveries: 8, status: "available", lat: "-33.93" }, { name: "Nomsa Khumalo", rating: 4.9, deliveries: 15, status: "delivering", lat: "-33.91" }].map((d, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-sm font-black" style={{ color: ORANGE }}>{d.name[0]}</div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800">{d.name}</p>
                    <p className="text-[10px] text-gray-500">{d.deliveries} deliveries today · ★{d.rating}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.status==="delivering"?"bg-orange-100 text-orange-700":"bg-green-100 text-green-700"}`}>{d.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex border-t border-gray-100 bg-white">
        {[{ id: "dashboard" as AdminScreen, icon: "📊", label: "Dashboard" }, { id: "orders" as AdminScreen, icon: "📦", label: "Orders" }, { id: "restaurants" as AdminScreen, icon: "🍽️", label: "Restaurants" }, { id: "drivers" as AdminScreen, icon: "🚗", label: "Drivers" }].map(tab => (
          <button key={tab.id} onClick={() => setScreen(tab.id)} className="flex-1 flex flex-col items-center gap-0.5 py-2.5">
            <span className="text-base">{tab.icon}</span>
            <span className="text-[10px] font-medium" style={{ color: screen === tab.id ? ORANGE : "#9CA3AF" }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — Role Selector
// ═══════════════════════════════════════════════════════════════════════════════

export function FoodDeliveryApp({ isOpen, onClose }: Props) {
  const [role, setRole] = useState<AppRole | null>(null);

  if (!isOpen) return null;

  if (!role) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs text-white/50 uppercase tracking-widest font-bold">VMS Food Delivery</p>
            <p className="text-xl font-black text-white mt-0.5">🍽️ Select your role</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white/50"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 flex flex-col justify-center px-5 space-y-4 pb-10">
          {[
            { role: "customer" as AppRole, emoji: "👤", title: "Customer", desc: "Browse restaurants, order food, track delivery", color: ORANGE, gradient: `linear-gradient(135deg,${ORANGE},#FF8A50)` },
            { role: "restaurant" as AppRole, emoji: "🍽️", title: "Restaurant Owner", desc: "Manage orders, menus, and analytics", color: "#10B981", gradient: "linear-gradient(135deg,#065F46,#10B981)" },
            { role: "driver" as AppRole, emoji: "🚗", title: "Delivery Driver", desc: "Accept deliveries, navigate, track earnings", color: "#3B82F6", gradient: "linear-gradient(135deg,#1E40AF,#3B82F6)" },
            { role: "admin" as AppRole, emoji: "⚙️", title: "Administrator", desc: "Manage users, orders, restaurants & drivers", color: "#8B5CF6", gradient: "linear-gradient(135deg,#4C1D95,#8B5CF6)" },
          ].map(opt => (
            <button key={opt.role} onClick={() => setRole(opt.role)}
              className="flex items-center gap-4 p-5 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "rgba(255,255,255,.07)", border: `1px solid rgba(255,255,255,.12)` }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background: opt.gradient }}>{opt.emoji}</div>
              <div>
                <p className="font-black text-white">{opt.title}</p>
                <p className="text-white/50 text-xs mt-0.5">{opt.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/30 ml-auto flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {role === "customer"    && <CustomerApp   onClose={() => setRole(null)} />}
      {role === "restaurant"  && <RestaurantApp  onClose={() => setRole(null)} />}
      {role === "driver"      && <DriverApp      onClose={() => setRole(null)} />}
      {role === "admin"       && <AdminApp       onClose={() => setRole(null)} />}
    </div>
  );
}
