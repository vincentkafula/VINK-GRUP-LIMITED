import { useState } from "react";
import { X, ChevronRight, Wifi, Car, Users, TrendingUp, Shield, Smartphone, ShoppingBag, Crown, Hash, Eye, User, Briefcase, MapPin } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDashboard?: (id: string) => void;
}

// ─── Dashboard Definitions ────────────────────────────────────────────────────

interface DashItem {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
}

const ALL_DASHBOARDS: DashItem[] = [
  // Connect group
  {
    id: "mobile",
    label: "Mobile Network",
    sublabel: "Connect",
    icon: <Wifi className="w-7 h-7" />,
    color: "#8B5CF6",
    gradient: "from-[#7C3AED] to-[#A78BFA]",
  },
  // Guard Me group
  {
    id: "vehicle",
    label: "Vehicle Tracking",
    sublabel: "Guard Me",
    icon: <Car className="w-7 h-7" />,
    color: "#EF4444",
    gradient: "from-[#DC2626] to-[#F87171]",
  },
  // Devices group
  {
    id: "driver",
    label: "Driver",
    sublabel: "Devices",
    icon: <User className="w-7 h-7" />,
    color: "#3B82F6",
    gradient: "from-[#2563EB] to-[#60A5FA]",
  },
  {
    id: "passenger",
    label: "Rider",
    sublabel: "Devices",
    icon: <Users className="w-7 h-7" />,
    color: "#06B6D4",
    gradient: "from-[#0891B2] to-[#67E8F9]",
  },
  {
    id: "investor",
    label: "Investors",
    sublabel: "Devices",
    icon: <TrendingUp className="w-7 h-7" />,
    color: "#F59E0B",
    gradient: "from-[#D97706] to-[#FCD34D]",
  },
  {
    id: "marshall",
    label: "Marshall",
    sublabel: "Devices",
    icon: <Shield className="w-7 h-7" />,
    color: "#10B981",
    gradient: "from-[#059669] to-[#6EE7B7]",
  },
  {
    id: "owner",
    label: "Owners",
    sublabel: "Devices",
    icon: <Briefcase className="w-7 h-7" />,
    color: "#8B5CF6",
    gradient: "from-[#7C3AED] to-[#C4B5FD]",
  },
  // Finance
  {
    id: "account",
    label: "Account",
    sublabel: "Finance",
    icon: <Hash className="w-7 h-7" />,
    color: "#10B981",
    gradient: "from-[#059669] to-[#34D399]",
  },
  // Business
  {
    id: "merchant",
    label: "Merchant",
    sublabel: "Business",
    icon: <ShoppingBag className="w-7 h-7" />,
    color: "#0EA5E9",
    gradient: "from-[#0284C7] to-[#38BDF8]",
  },
  // Admin
  {
    id: "authority",
    label: "Authority",
    sublabel: "Security",
    icon: <Eye className="w-7 h-7" />,
    color: "#059669",
    gradient: "from-[#047857] to-[#10B981]",
  },
  {
    id: "superadmin",
    label: "Super Admin",
    sublabel: "Admin",
    icon: <Crown className="w-7 h-7" />,
    color: "#DC2626",
    gradient: "from-[#B91C1C] to-[#F87171]",
  },
];

// ─── Sections ─────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: string;
  bg: string;
  border: string;
  items: DashItem[];
}

const SECTIONS: Section[] = [
  {
    id: "connect",
    title: "Connect",
    subtitle: "Network & Communications",
    icon: <Wifi className="w-4 h-4" />,
    accentColor: "#8B5CF6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.25)",
    items: ALL_DASHBOARDS.filter(d => d.sublabel === "Connect"),
  },
  {
    id: "guardme",
    title: "Guard Me",
    subtitle: "Safety & Tracking",
    icon: <Shield className="w-4 h-4" />,
    accentColor: "#EF4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.25)",
    items: ALL_DASHBOARDS.filter(d => d.sublabel === "Guard Me"),
  },
  {
    id: "devices",
    title: "Devices",
    subtitle: "User Accounts & Roles",
    icon: <Smartphone className="w-4 h-4" />,
    accentColor: "#3B82F6",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.25)",
    items: ALL_DASHBOARDS.filter(d => d.sublabel === "Devices"),
  },
  {
    id: "finance",
    title: "Finance",
    subtitle: "Banking & Payments",
    icon: <Hash className="w-4 h-4" />,
    accentColor: "#10B981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.25)",
    items: ALL_DASHBOARDS.filter(d => d.sublabel === "Finance"),
  },
  {
    id: "business",
    title: "Business",
    subtitle: "Commerce & Merchants",
    icon: <ShoppingBag className="w-4 h-4" />,
    accentColor: "#0EA5E9",
    bg: "rgba(14,165,233,0.08)",
    border: "rgba(14,165,233,0.25)",
    items: ALL_DASHBOARDS.filter(d => d.sublabel === "Business"),
  },
  {
    id: "admin",
    title: "Administration",
    subtitle: "Security & System Control",
    icon: <Crown className="w-4 h-4" />,
    accentColor: "#DC2626",
    bg: "rgba(220,38,38,0.08)",
    border: "rgba(220,38,38,0.25)",
    items: ALL_DASHBOARDS.filter(d => ["Security", "Admin"].includes(d.sublabel)),
  },
];

// ─── App Icon ─────────────────────────────────────────────────────────────────
function AppIcon({ item, onClick }: { item: DashItem; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      className="flex flex-col items-center gap-2 group"
      style={{ transform: pressed ? "scale(0.92)" : "scale(1)", transition: "transform 0.12s ease" }}
    >
      {/* Icon bubble */}
      <div
        className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white shadow-lg relative overflow-hidden`}
        style={{ boxShadow: `0 4px 20px ${item.color}55` }}
      >
        {/* Shine overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent rounded-2xl" />
        <div className="relative z-10">{item.icon}</div>
      </div>
      {/* Label */}
      <span className="text-[11px] font-semibold text-white/90 text-center leading-tight max-w-[70px]">
        {item.label}
      </span>
    </button>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ section, onSelect }: { section: Section; onSelect: (id: string) => void }) {
  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{
        background: section.bg,
        border: `1px solid ${section.border}`,
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: section.accentColor + "33", color: section.accentColor }}
          >
            {section.icon}
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-none">{section.title}</p>
            <p className="text-white/45 text-[10px] mt-0.5">{section.subtitle}</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4" style={{ color: section.accentColor }} />
      </div>

      {/* App icons grid */}
      <div className={`grid gap-4 ${section.items.length === 1 ? "grid-cols-1 justify-items-center" : section.items.length === 2 ? "grid-cols-2" : "grid-cols-4"}`}>
        {section.items.map(item => (
          <AppIcon key={item.id} item={item} onClick={() => onSelect(item.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function LoginModal({ isOpen, onClose, onSelectDashboard }: LoginModalProps) {
  const [activeTab, setActiveTab] = useState<"home" | "search" | "profile">("home");

  if (!isOpen) return null;

  const handleSelect = (id: string) => {
    onClose();
    if (onSelectDashboard) onSelectDashboard(id);
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(10,8,30,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      {/* Phone-frame container */}
      <div
        className="relative w-full overflow-hidden flex flex-col"
        style={{
          maxWidth: 420,
          maxHeight: "96vh",
          borderRadius: 36,
          background: "linear-gradient(175deg,#1A0A3C 0%,#0F0620 40%,#0D0B1E 100%)",
          border: "1px solid rgba(139,92,246,0.3)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Status bar ── */}
        <div className="flex items-center justify-between px-6 pt-4 pb-1 flex-shrink-0">
          <span className="text-white/70 text-xs font-semibold">{timeStr}</span>
          <div className="flex items-center gap-1.5">
            {/* Signal bars */}
            <div className="flex items-end gap-0.5 h-3">
              {[40, 60, 80, 100].map((h, i) => (
                <div key={i} className="w-0.5 rounded-sm bg-white/80" style={{ height: `${h}%` }} />
              ))}
            </div>
            {/* WiFi */}
            <svg viewBox="0 0 18 14" className="w-3.5 h-3.5 fill-white/80">
              <path d="M9 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0-3.5a5 5 0 013.54 1.46l-1.42 1.42A3 3 0 006 10.5l-1.42-1.42A5 5 0 019 7zm0-3.5a8.5 8.5 0 016.01 2.49l-1.42 1.42A6.5 6.5 0 009 5.5a6.5 6.5 0 00-4.59 1.91L3 5.99A8.5 8.5 0 019 3.5z" />
            </svg>
            {/* Battery */}
            <div className="flex items-center gap-0.5">
              <div className="w-5 h-2.5 rounded-sm border border-white/60 relative overflow-hidden">
                <div className="absolute inset-y-0.5 left-0.5 bg-white/80 rounded-sm" style={{ width: "72%" }} />
              </div>
              <div className="w-0.5 h-1.5 bg-white/60 rounded-sm" />
            </div>
          </div>
        </div>

        {/* ── Header / Hero ── */}
        <div
          className="mx-4 mt-2 mb-3 rounded-2xl p-4 flex-shrink-0 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg,#6B5ED7 0%,#9333EA 60%,#7C3AED 100%)",
            boxShadow: "0 8px 32px rgba(107,94,215,0.45)",
          }}
        >
          {/* Background decoration */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-6 -left-4 w-24 h-24 rounded-full bg-white/08" />

          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-white/70 text-xs">{greeting}</p>
              <p className="text-white font-bold text-lg leading-tight">Welcome to Vink</p>
              <p className="text-white/60 text-[10px] mt-0.5">{dateStr}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <img src={vinkLogo} alt="Vink" className="w-[160px] h-auto object-contain" />
              <button
                onClick={onClose}
                className="p-1 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>

          {/* Quick stats strip */}
          <div className="relative z-10 mt-3 flex gap-2">
            {[
              { label: "Accounts", value: "11" },
              { label: "Active", value: "9" },
              { label: "Alerts", value: "3" },
            ].map((s, i) => (
              <div key={i} className="flex-1 text-center py-1.5 rounded-xl bg-white/15">
                <p className="text-white text-sm font-bold leading-none">{s.value}</p>
                <p className="text-white/60 text-[9px] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section title ── */}
        <div className="px-4 mb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-white text-sm font-bold">Select Dashboard</p>
            <span className="text-white/40 text-[10px]">Tap to enter</span>
          </div>
        </div>

        {/* ── Scrollable sections ── */}
        <div className="flex-1 overflow-y-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
          {SECTIONS.map(section => (
            <SectionCard key={section.id} section={section} onSelect={handleSelect} />
          ))}

          {/* Bottom padding for nav */}
          <div className="h-4" />
        </div>

        {/* ── Bottom navigation ── */}
        <div
          className="flex-shrink-0 mx-4 mb-4 rounded-2xl px-2 py-2"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="flex items-center justify-around">
            {[
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, label: "Home", key: "home" },
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, label: "Search", key: "search" },
              { icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, label: "Profile", key: "profile" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className="flex flex-col items-center gap-1 px-6 py-1.5 rounded-xl transition-all"
                style={{
                  color: activeTab === tab.key ? "#9585EA" : "rgba(255,255,255,0.35)",
                  background: activeTab === tab.key ? "rgba(107,94,215,0.2)" : "transparent",
                }}
              >
                {tab.icon}
                <span className="text-[9px] font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Home indicator bar */}
        <div className="flex justify-center pb-2 flex-shrink-0">
          <div className="w-28 h-1 rounded-full bg-white/25" />
        </div>
      </div>
    </div>
  );
}
