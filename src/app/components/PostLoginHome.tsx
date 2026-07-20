import { useState } from "react";
import {
  LogIn, MessageSquare, Phone, Store, ShoppingCart, Wifi,
  CreditCard, ArrowLeftRight, Layers, Smartphone, Shield, ShieldCheck,
  Tv, Banknote, Vote, ScanLine, UtensilsCrossed, Plane,
  DollarSign, Settings, Bell, ChevronRight, Eye, EyeOff,
  X, Home, BarChart3, User, QrCode
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

interface PostLoginHomeProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (id: string) => void;
}

// ─── Menu rows exactly as specified ──────────────────────────────────────────

const MENU_ROWS = [
  [
    { id: "login",    label: "Login",       icon: <LogIn className="w-6 h-6" />,           gradient: "from-[#6B5ED7] to-[#9333EA]", glow: "#6B5ED7" },
    { id: "message",  label: "Message",     icon: <MessageSquare className="w-6 h-6" />,   gradient: "from-[#3B82F6] to-[#06B6D4]", glow: "#3B82F6" },
    { id: "contact",  label: "Contact Us",  icon: <Phone className="w-6 h-6" />,           gradient: "from-[#10B981] to-[#059669]", glow: "#10B981" },
  ],
  [
    { id: "marketplace", label: "Market Place", icon: <Store className="w-6 h-6" />,       gradient: "from-[#F59E0B] to-[#D97706]", glow: "#F59E0B" },
    { id: "buy",      label: "Buy",         icon: <ShoppingCart className="w-6 h-6" />,    gradient: "from-[#EF4444] to-[#DC2626]", glow: "#EF4444" },
    { id: "connect",  label: "Connect",     icon: <Wifi className="w-6 h-6" />,            gradient: "from-[#8B5CF6] to-[#7C3AED]", glow: "#8B5CF6" },
  ],
  [
    { id: "payments", label: "Payments",    icon: <CreditCard className="w-6 h-6" />,      gradient: "from-[#0EA5E9] to-[#0284C7]", glow: "#0EA5E9" },
    { id: "transfer", label: "Transfer",    icon: <ArrowLeftRight className="w-6 h-6" />,  gradient: "from-[#6B5ED7] to-[#4F46E5]", glow: "#6B5ED7" },
    { id: "cards",    label: "Cards",       icon: <Layers className="w-6 h-6" />,          gradient: "from-[#EC4899] to-[#BE185D]", glow: "#EC4899" },
  ],
  [
    { id: "device",   label: "Device",      icon: <Smartphone className="w-6 h-6" />,      gradient: "from-[#64748B] to-[#334155]", glow: "#64748B" },
    { id: "guardme",  label: "Guard Me",    icon: <Shield className="w-6 h-6" />,          gradient: "from-[#EF4444] to-[#991B1B]", glow: "#EF4444" },
    { id: "insurance",label: "Insurance",   icon: <ShieldCheck className="w-6 h-6" />,     gradient: "from-[#10B981] to-[#047857]", glow: "#10B981" },
  ],
  [
    { id: "vinktv",    label: "VINK TV",      icon: <Tv className="w-6 h-6" />,              gradient: "from-[#7C3AED] to-[#5B21B6]", glow: "#7C3AED" },
    { id: "cardless", label: "Cardless Cash",icon: <Banknote className="w-6 h-6" />,       gradient: "from-[#D97706] to-[#92400E]", glow: "#D97706" },
    { id: "elections",label: "Elections",   icon: <Vote className="w-6 h-6" />,            gradient: "from-[#0891B2] to-[#164E63]", glow: "#0891B2" },
  ],
  [
    { id: "scantopay",label: "Scan to Pay", icon: <ScanLine className="w-6 h-6" />,        gradient: "from-[#059669] to-[#064E3B]", glow: "#059669" },
    { id: "restaurant",label: "Restaurant", icon: <UtensilsCrossed className="w-6 h-6" />, gradient: "from-[#F43F5E] to-[#BE123C]", glow: "#F43F5E" },
    { id: "travel",   label: "Travel",      icon: <Plane className="w-6 h-6" />,           gradient: "from-[#2563EB] to-[#1E3A8A]", glow: "#2563EB" },
  ],
  [
    { id: "forex",    label: "Forex",       icon: <DollarSign className="w-6 h-6" />,      gradient: "from-[#CA8A04] to-[#78350F]", glow: "#CA8A04" },
    { id: "settings", label: "Setting",     icon: <Settings className="w-6 h-6" />,        gradient: "from-[#475569] to-[#1E293B]", glow: "#475569" },
    { id: "qr",       label: "QR Code",     icon: <QrCode className="w-6 h-6" />,          gradient: "from-[#6B5ED7] to-[#312E81]", glow: "#6B5ED7" },
  ],
];

// ─── Single icon button ───────────────────────────────────────────────────────
function MenuIcon({ item, onClick }: {
  item: { id: string; label: string; icon: React.ReactNode; gradient: string; glow: string };
  onClick: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className="flex flex-col items-center gap-2.5 w-full"
      style={{ transform: pressed ? "scale(0.88)" : "scale(1)", transition: "transform 0.1s cubic-bezier(.2,.8,.2,1)" }}
    >
      {/* Icon bubble */}
      <div
        className={`w-[58px] h-[58px] rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white relative overflow-hidden`}
        style={{
          boxShadow: `0 6px 20px ${item.glow}50, 0 2px 4px rgba(0,0,0,0.3)`,
        }}
      >
        {/* Top-left shine */}
        <div className="absolute top-0 left-0 w-2/3 h-2/3 bg-gradient-to-br from-white/30 to-transparent rounded-tl-2xl" />
        <div className="relative z-10">{item.icon}</div>
      </div>
      {/* Label */}
      <span className="text-[10.5px] font-semibold text-center leading-tight"
        style={{ color: "rgba(255,255,255,0.82)", maxWidth: 72 }}>
        {item.label}
      </span>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PostLoginHome({ isOpen, onClose, onNavigate }: PostLoginHomeProps) {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [activeTab, setActiveTab] = useState("home");

  if (!isOpen) return null;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning," : hour < 17 ? "Good Afternoon," : "Good Evening,";
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const handleMenuClick = (id: string) => {
    if (onNavigate) onNavigate(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(6,4,20,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      {/* Phone shell */}
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: "100%",
          maxWidth: 430,
          height: "100%",
          maxHeight: 896,
          borderRadius: 44,
          background: "linear-gradient(180deg, #12092B 0%, #0D0820 50%, #090616 100%)",
          border: "1px solid rgba(107,94,215,0.35)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.07)",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Status bar ── */}
        <div className="flex items-center justify-between px-7 pt-5 pb-1 flex-shrink-0">
          <span className="text-white/80 text-xs font-bold tracking-wide">{timeStr}</span>
          <div className="flex items-center gap-2">
            <div className="flex items-end gap-[2px] h-3.5">
              {[35, 55, 75, 100].map((h, i) => (
                <div key={i} className="w-[3px] rounded-sm" style={{ height: `${h}%`, background: i === 3 ? "white" : "rgba(255,255,255,0.5)" }} />
              ))}
            </div>
            <svg viewBox="0 0 20 14" className="w-4 h-3 fill-white/80">
              <path d="M10 11a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0-3.5a5 5 0 013.54 1.46l-1.41 1.41A3 3 0 007 10.5l-1.41-1.41A5 5 0 0110 7.5zm0-3.5a8.5 8.5 0 016 2.49l-1.41 1.42A6.5 6.5 0 0010 6a6.5 6.5 0 00-4.59 1.91L4 6.5A8.5 8.5 0 0110 4z" />
            </svg>
            <div className="flex items-center">
              <div className="w-6 h-3 rounded-[3px] border border-white/50 relative overflow-hidden p-[1.5px]">
                <div className="h-full rounded-[2px] bg-white/90" style={{ width: "78%" }} />
              </div>
              <div className="w-[2px] h-[5px] bg-white/50 rounded-r-sm" />
            </div>
          </div>
        </div>

        {/* Dynamic island */}
        <div className="flex justify-center mb-2 flex-shrink-0">
          <div className="w-28 h-6 rounded-full" style={{ background: "#000" }} />
        </div>

        {/* ── Header greeting ── */}
        <div className="px-5 flex items-center justify-between flex-shrink-0 mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#6B5ED7,#9333EA)", boxShadow: "0 0 0 2px rgba(107,94,215,0.4)" }}>
              AS
            </div>
            <div>
              <p className="text-white/55 text-xs">{greeting}</p>
              <p className="text-white font-bold text-base leading-tight">Alexa Smith</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Notification bell */}
            <button className="relative w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Bell className="w-4.5 h-4.5 text-white/80" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-[#12092B] text-[7px] text-white flex items-center justify-center font-bold">3</span>
            </button>
            {/* Close */}
            <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <X className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>

        {/* ── Balance / Banner card ── */}
        <div className="mx-5 mb-4 flex-shrink-0">
          <div className="rounded-3xl p-5 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #6B5ED7 0%, #7C3AED 45%, #9333EA 100%)",
              boxShadow: "0 12px 40px rgba(107,94,215,0.55)",
            }}>
            {/* BG orbs */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle, white, transparent)" }} />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10" style={{ background: "radial-gradient(circle, white, transparent)" }} />

            {/* Top row */}
            <div className="relative z-10 flex items-center justify-between mb-4">
              <div>
                <p className="text-white/65 text-xs font-medium mb-0.5">🔒 Secure Payments</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-black text-2xl tracking-tight">
                    {balanceVisible ? "R 24,850.00" : "R ••••••"}
                  </p>
                  <button onClick={() => setBalanceVisible(!balanceVisible)}
                    className="text-white/60 hover:text-white transition-colors">
                    {balanceVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-white/50 text-[10px] mt-0.5">Account ending ••4521</p>
              </div>
              <img src={vinkLogo} alt="Vink" className="w-[160px] h-auto object-contain opacity-90" />
            </div>

            {/* Make Payment button */}
            <div className="relative z-10 flex items-center justify-between">
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)", backdropFilter: "blur(10px)" }}
                onClick={() => handleMenuClick("payments")}>
                <CreditCard className="w-4 h-4" />
                Make Payment
              </button>
              <div className="flex gap-2">
                {/* Quick action dots */}
                {[
                  { icon: <ArrowLeftRight className="w-3.5 h-3.5" />, id: "transfer" },
                  { icon: <ScanLine className="w-3.5 h-3.5" />, id: "scantopay" },
                  { icon: <ChevronRight className="w-3.5 h-3.5" />, id: "more" },
                ].map((a, i) => (
                  <button key={i} onClick={() => handleMenuClick(a.id)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-all active:scale-90"
                    style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.25)" }}>
                    {a.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Section label ── */}
        <div className="px-5 mb-3 flex items-center justify-between flex-shrink-0">
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Services</p>
          <button className="text-[#9585EA] text-xs font-semibold">See All</button>
        </div>

        {/* ── Scrollable icon grid ── */}
        <div className="flex-1 overflow-y-auto px-5" style={{ scrollbarWidth: "none" }}>
          <div className="space-y-5 pb-6">
            {MENU_ROWS.map((row, rowIdx) => (
              <div
                key={rowIdx}
                className={`grid gap-3 ${row.length === 3 ? "grid-cols-3" : row.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {row.map(item => (
                  <MenuIcon key={item.id} item={item} onClick={() => handleMenuClick(item.id)} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom navigation bar ── */}
        <div className="flex-shrink-0 pb-4 pt-2 px-4">
          <div className="rounded-2xl px-3 py-2.5 flex items-center justify-around"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(20px)",
            }}>
            {[
              { key: "home",     icon: <Home className="w-5 h-5" />,     label: "Home" },
              { key: "payments", icon: <CreditCard className="w-5 h-5" />,label: "Payments" },
              { key: "scan",     icon: <QrCode className="w-5 h-5" />,   label: "Scan" },
              { key: "analytics",icon: <BarChart3 className="w-5 h-5" />,label: "Analytics" },
              { key: "profile",  icon: <User className="w-5 h-5" />,     label: "Profile" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all"
                style={{
                  color: activeTab === tab.key ? "#9585EA" : "rgba(255,255,255,0.32)",
                  background: activeTab === tab.key ? "rgba(107,94,215,0.22)" : "transparent",
                }}
              >
                {tab.icon}
                <span className="text-[9px] font-semibold">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Home indicator */}
        <div className="flex justify-center pb-3 flex-shrink-0">
          <div className="w-32 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.22)" }} />
        </div>
      </div>
    </div>
  );
}
