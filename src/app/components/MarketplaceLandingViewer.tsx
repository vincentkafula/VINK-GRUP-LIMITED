import { useState, useEffect } from "react";
import { ShoppingBag, Store, ShieldCheck, Truck, Tag, ArrowRight, X, Star, Loader2 } from "lucide-react";
import heroBg from "../../imports/assets/marketplace-hero-wide-bg.png";
import { mktProducts } from "../services/marketplaceApi";

type R = Record<string, unknown>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onShop: (productId?: string) => void;
  onSell: () => void;
}

const FEATURES = [
  { icon: <ShieldCheck className="w-5 h-5" />, title: "Buyer Protection", desc: "Every order is covered — get a refund if something isn't right." },
  { icon: <Truck className="w-5 h-5" />, title: "Nationwide Delivery", desc: "Courier, pickup, and freight options from sellers across the country." },
  { icon: <Tag className="w-5 h-5" />, title: "Real Daily Deals", desc: "Flash deals and featured products, refreshed across the catalogue." },
  { icon: <Store className="w-5 h-5" />, title: "Built for Sellers", desc: "List products, manage orders, and track revenue from one dashboard." },
];

const fmtZAR = (n: number) => `R${Number(n ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ProductCard({ p, onClick }: { p: R; onClick: () => void }) {
  const imgs = p.images as string[];
  const discount = p.compareAtPrice ? Math.round((1 - Number(p.price) / Number(p.compareAtPrice)) * 100) : 0;
  return (
    <button onClick={onClick} className="text-left bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className="relative flex items-center justify-center h-32" style={{ background: `linear-gradient(135deg,${imgs?.[0] ?? "#eee"},${imgs?.[1] ?? "#ddd"})` }}>
        <span className="text-5xl">{p.emoji as string}</span>
        {discount > 0 && <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">-{discount}%</span>}
        {Boolean(p.isFlashDeal) && <span className="absolute top-2 right-2 bg-amber-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" /> Deal</span>}
      </div>
      <div className="p-3">
        <p className="text-xs text-gray-400 mb-0.5">{p.brand as string}</p>
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug mb-1.5" style={{ minHeight: 34 }}>{p.name as string}</p>
        <div className="flex items-center gap-1 mb-1.5">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="text-[11px] text-gray-500">{Number(p.avgRating).toFixed(1)} ({String(p.reviewCount)})</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          {Boolean(p.compareAtPrice) && <span className="text-[11px] text-gray-400 line-through">{fmtZAR(Number(p.compareAtPrice))}</span>}
          <span className="text-sm font-black" style={{ color: "#128A43" }}>{fmtZAR(Number(p.price))}</span>
        </div>
      </div>
    </button>
  );
}

export function MarketplaceLandingViewer({ isOpen, onClose, onShop, onSell }: Props) {
  const [products, setProducts] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    mktProducts.list({ sort: "popular", limit: "48" })
      .then(r => setProducts((r.data as R[]) ?? []))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-white/10" />

        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-10 p-2 rounded-full bg-white/80 hover:bg-white shadow-sm transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-gray-700" />
        </button>

        <div className="relative max-w-3xl mx-auto px-6 sm:px-10 py-24 sm:py-32 text-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase px-3 py-1.5 rounded-full mb-5" style={{ background: "rgba(21,163,80,0.12)", color: "#128A43" }}>
            <ShoppingBag className="w-3.5 h-3.5" /> Vink Marketplace
          </span>
          <h1 className="text-4xl sm:text-5xl font-black leading-[1.05] tracking-tight" style={{ color: "#0F3D24" }}>
            Everything you need,<br />from sellers you trust
          </h1>
          <p className="text-base sm:text-lg text-gray-600 mt-5 max-w-xl mx-auto">
            Thousands of real products across electronics, fashion, home, and more — with buyer protection on every order.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
            <button
              onClick={() => onShop()}
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-white text-sm font-bold shadow-lg hover:brightness-105 transition-all"
              style={{ background: "linear-gradient(135deg,#FF9900,#E67E00)" }}
            >
              <ShoppingBag className="w-4 h-4" /> Start Shopping
            </button>
            <button
              onClick={onSell}
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-bold border-2 hover:bg-white/60 transition-colors"
              style={{ borderColor: "#128A43", color: "#0F3D24", background: "rgba(255,255,255,0.7)" }}
            >
              <Store className="w-4 h-4" /> Become a Seller <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Feature strip */}
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: "#FFF4E5", color: "#B75C00" }}>{f.icon}</span>
              <p className="text-sm font-bold text-gray-900">{f.title}</p>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-gray-400">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          <span>Rated by real customers across every category on the platform</span>
        </div>
      </div>

      {/* Full product catalogue */}
      <div className="max-w-6xl mx-auto px-6 sm:px-10 pb-14">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xl sm:text-2xl font-black" style={{ color: "#0F3D24" }}>Shop the full catalogue</p>
            <p className="text-sm text-gray-500 mt-1">{products.length} products, live from the marketplace right now.</p>
          </div>
          <button onClick={() => onShop()} className="hidden sm:flex items-center gap-1.5 text-sm font-bold" style={{ color: "#128A43" }}>
            Open full store <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {products.map((p, i) => (
              <ProductCard key={i} p={p} onClick={() => onShop(String(p.id))} />
            ))}
          </div>
        )}

        <div className="flex sm:hidden justify-center mt-6">
          <button onClick={() => onShop()} className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "#128A43" }}>
            Open full store <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom CTA banner */}
      <div className="relative overflow-hidden mx-4 sm:mx-8 mb-10 rounded-2xl">
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ transform: "scaleY(-1)" }} />
        <div className="absolute inset-0 bg-white/15" />
        <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 px-6 sm:px-9 py-8">
          <div className="text-center sm:text-left">
            <p className="text-lg font-black" style={{ color: "#0F3D24" }}>Ready to list your first product?</p>
            <p className="text-sm text-gray-600 mt-1">Free to apply — approval usually within a business day.</p>
          </div>
          <button
            onClick={onSell}
            className="flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-bold shadow-lg shrink-0"
            style={{ background: "linear-gradient(135deg,#128A43,#0F3D24)" }}
          >
            <Store className="w-4 h-4" /> Start Your Store <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
