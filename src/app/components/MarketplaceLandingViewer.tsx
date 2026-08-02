import { ShoppingBag, Store, ShieldCheck, Truck, Tag, ArrowRight, X, Star } from "lucide-react";
import heroBg from "../../imports/assets/marketplace-hero-bg.png";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onShop: () => void;
  onSell: () => void;
}

const FEATURES = [
  { icon: <ShieldCheck className="w-5 h-5" />, title: "Buyer Protection", desc: "Every order is covered — get a refund if something isn't right." },
  { icon: <Truck className="w-5 h-5" />, title: "Nationwide Delivery", desc: "Courier, pickup, and freight options from sellers across the country." },
  { icon: <Tag className="w-5 h-5" />, title: "Real Daily Deals", desc: "Flash deals and featured products, refreshed across the catalogue." },
  { icon: <Store className="w-5 h-5" />, title: "Built for Sellers", desc: "List products, manage orders, and track revenue from one dashboard." },
];

export function MarketplaceLandingViewer({ isOpen, onClose, onShop, onSell }: Props) {
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
              onClick={onShop}
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
