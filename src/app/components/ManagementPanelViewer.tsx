import { useState } from "react";
import {
  LayoutGrid, Landmark, CreditCard, ShoppingCart, Newspaper, Radio as RadioTower,
  Car, Tv, Calendar, Building2, ShieldCheck, HeartHandshake, Users, Settings,
  ClipboardList, Menu, Search, Bell, ChevronDown, Plus, ArrowRight, TrendingUp,
  AlertTriangle, Monitor, CheckCircle2, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; adminName?: string; adminRole?: string }

const GREEN = "#0B5C2E";
const ORANGE = "#FF9900";

const SIDEBAR_MODULES = [
  { label: "Bank Management", icon: <Landmark className="w-4 h-4" /> },
  { label: "Payment Management", icon: <CreditCard className="w-4 h-4" /> },
  { label: "Marketplace Management", icon: <ShoppingCart className="w-4 h-4" /> },
  { label: "News Management", icon: <Newspaper className="w-4 h-4" /> },
  { label: "Mobile Network Management", icon: <RadioTower className="w-4 h-4" /> },
  { label: "Vehicle Management", icon: <Car className="w-4 h-4" /> },
  { label: "Radio & TV Management", icon: <Tv className="w-4 h-4" /> },
  { label: "Event Management", icon: <Calendar className="w-4 h-4" /> },
  { label: "Company Registration", icon: <Building2 className="w-4 h-4" /> },
  { label: "Insurance Management", icon: <ShieldCheck className="w-4 h-4" /> },
  { label: "Social Responsibility", icon: <HeartHandshake className="w-4 h-4" /> },
];

const SYSTEM_ITEMS = [
  { label: "Users & Roles", icon: <Users className="w-4 h-4" /> },
  { label: "Settings", icon: <Settings className="w-4 h-4" /> },
  { label: "Audit Logs", icon: <ClipboardList className="w-4 h-4" /> },
];

const STATS = [
  { label: "Total Institutions", value: "128", trend: "+12%", icon: <Landmark className="w-5 h-5" />, iconBg: "#E8F7EE", iconColor: GREEN, trendColor: GREEN },
  { label: "Total Transactions", value: "24,560", trend: "+18%", icon: <CreditCard className="w-5 h-5" />, iconBg: "#FFF1E6", iconColor: ORANGE, trendColor: ORANGE },
  { label: "Active Users", value: "8,459", trend: "+9%", icon: <Users className="w-5 h-5" />, iconBg: "#E8F7EE", iconColor: GREEN, trendColor: GREEN },
  { label: "Total Revenue", value: "R 45.8M", trend: "+21%", icon: <TrendingUp className="w-5 h-5" />, iconBg: "#FFF1E6", iconColor: ORANGE, trendColor: ORANGE },
];

interface ModuleTile { title: string; desc: string; icon: React.ReactNode; iconBg: string; iconColor: string; }
const MODULE_TILES: ModuleTile[] = [
  { title: "Bank Management", desc: "Manage bank accounts, branches, services and banking operations.", icon: <Landmark className="w-7 h-7" />, iconBg: "#E8F7EE", iconColor: GREEN },
  { title: "Payment Management", desc: "Manage payments, settlements, refunds and transaction rules.", icon: <CreditCard className="w-7 h-7" />, iconBg: "#FFF1E6", iconColor: ORANGE },
  { title: "Marketplace Management", desc: "Manage vendors, products, orders and marketplace activities.", icon: <ShoppingCart className="w-7 h-7" />, iconBg: "#E8F7EE", iconColor: GREEN },
  { title: "News Management", desc: "Manage news articles, categories, authors and publishing.", icon: <Newspaper className="w-7 h-7" />, iconBg: "#FFF1E6", iconColor: ORANGE },
  { title: "Mobile Network Management", desc: "Manage mobile operators, packages, USSD, data and airtime services.", icon: <RadioTower className="w-7 h-7" />, iconBg: "#E8F7EE", iconColor: GREEN },
  { title: "Vehicle Management", desc: "Manage vehicles, fleets, tracking, inspections and documents.", icon: <Car className="w-7 h-7" />, iconBg: "#FFF1E6", iconColor: ORANGE },
  { title: "Radio & TV Station Management", desc: "Manage radio & TV stations, channels, programs and broadcasts.", icon: <Tv className="w-7 h-7" />, iconBg: "#FFF1E6", iconColor: ORANGE },
  { title: "Event Management", desc: "Manage events, schedules, registrations and venues.", icon: <Calendar className="w-7 h-7" />, iconBg: "#E8F7EE", iconColor: GREEN },
  { title: "Company Registration Management", desc: "Manage company registrations, verifications and compliance.", icon: <Building2 className="w-7 h-7" />, iconBg: "#FFF1E6", iconColor: ORANGE },
  { title: "Insurance Management", desc: "Manage insurance products, policies, claims and providers.", icon: <ShieldCheck className="w-7 h-7" />, iconBg: "#E8F7EE", iconColor: GREEN },
  { title: "Social Responsibility Management", desc: "Manage CSR initiatives, donations, projects and community impact.", icon: <HeartHandshake className="w-7 h-7" />, iconBg: "#FFF1E6", iconColor: ORANGE },
];

const BOTTOM_STATS = [
  { value: "342", label: "Total Admins", icon: <Users className="w-5 h-5" />, iconBg: "#E8F7EE", iconColor: GREEN },
  { value: "98%", label: "System Uptime", icon: <ShieldCheck className="w-5 h-5" />, iconBg: "#E8F7EE", iconColor: GREEN },
  { value: "1,245", label: "Active Sessions", icon: <Monitor className="w-5 h-5" />, iconBg: "#FFF1E6", iconColor: ORANGE },
  { value: "12", label: "Pending Approvals", icon: <ClipboardList className="w-5 h-5" />, iconBg: "#FFF1E6", iconColor: ORANGE },
  { value: "24", label: "System Alerts", icon: <AlertTriangle className="w-5 h-5" />, iconBg: "#FEF2F2", iconColor: "#DC2626" },
];

export function ManagementPanelViewer({ isOpen, onClose, adminName = "Admin User", adminRole = "Super Administrator" }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeItem, setActiveItem] = useState("Dashboard");

  if (!isOpen) return null;

  const openModule = (label: string) => toast.info(`${label} — opening this module's full workspace is coming soon.`);

  return (
    <div className="fixed inset-0 z-50 flex bg-gray-50 text-[14px]" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 overflow-hidden transition-all duration-200 flex flex-col`} style={{ background: "#0B1420" }}>
        <div className="w-64 flex flex-col h-full">
          <div className="px-5 pt-6 pb-5">
            <div className="flex items-baseline gap-0.5">
              <img src={vinkLogo} alt="" className="h-6 w-6 object-contain mr-1.5" />
              <span className="font-black text-xl" style={{ color: GREEN }}>VINK</span>
            </div>
            <p className="text-[10px] font-bold tracking-[0.16em] text-white/40 mt-1">MANAGEMENT PANEL</p>
          </div>
          <div className="h-px bg-white/10 mx-5 mb-4" />

          <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
            <button
              onClick={() => setActiveItem("Dashboard")}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold mb-4"
              style={activeItem === "Dashboard" ? { background: GREEN, color: "#fff" } : { color: "rgba(255,255,255,0.7)" }}
            >
              <LayoutGrid className="w-4 h-4" /> Dashboard
            </button>

            <p className="px-3 text-[10px] font-bold tracking-[0.12em] text-white/30 mb-2">MANAGEMENT MODULES</p>
            {SIDEBAR_MODULES.map(m => (
              <button
                key={m.label}
                onClick={() => { setActiveItem(m.label); openModule(m.label); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2.5">{m.icon} {m.label}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-40" />
              </button>
            ))}

            <p className="px-3 text-[10px] font-bold tracking-[0.12em] text-white/30 mt-5 mb-2">SYSTEM</p>
            {SYSTEM_ITEMS.map(m => (
              <button
                key={m.label}
                onClick={() => { setActiveItem(m.label); openModule(m.label); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2.5">{m.icon} {m.label}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-40" />
              </button>
            ))}
          </nav>

          <div className="p-3 mt-2">
            <button onClick={onClose} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: GREEN }}>
                {adminName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-semibold text-white truncate">{adminName}</p>
                <p className="text-[11px] truncate" style={{ color: ORANGE }}>{adminRole}</p>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-100 sticky top-0 z-10">
          <button onClick={() => setSidebarOpen(o => !o)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0">
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search anything..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-600" />
          </div>
          <div className="flex items-center gap-4 ml-auto shrink-0">
            <button className="relative p-2 rounded-lg hover:bg-gray-50">
              <Bell className="w-4.5 h-4.5 text-gray-500" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: ORANGE }}>6</span>
            </button>
            <button className="flex items-center gap-2.5 pl-2">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: GREEN }}>
                {adminName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <span className="text-left hidden sm:block">
                <p className="text-[13px] font-semibold text-gray-900 leading-tight">{adminName}</p>
                <p className="text-[11px] text-gray-400 leading-tight">{adminRole}</p>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={onClose} className="text-xs font-semibold text-gray-400 hover:text-gray-700 border-l border-gray-200 pl-4">Close</button>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {/* Welcome header */}
          <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Welcome back, Admin! 👋</h1>
              <p className="text-gray-500 text-sm mt-1">Here's what's happening across the platform today.</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white shrink-0">
              <CalendarDays className="w-4 h-4 text-gray-400" /> 02 May 2025 - 08 May 2025 <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            {STATS.map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
                <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">{s.label}</p>
                  <p className="text-xl font-black text-gray-900 mt-0.5">{s.value}</p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: s.trendColor }}>↑ {s.trend} from last month</p>
                </div>
              </div>
            ))}
          </div>

          {/* Management Modules */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black text-gray-900">Management Modules</h2>
            <button className="flex items-center gap-1 text-sm font-bold" style={{ color: GREEN }}>View all modules <ArrowRight className="w-4 h-4" /></button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5 mb-8">
            {MODULE_TILES.map(m => (
              <div key={m.title} className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
                <span className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: m.iconBg, color: m.iconColor }}>{m.icon}</span>
                <p className="text-[15px] font-bold text-gray-900 leading-snug">{m.title}</p>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed flex-1">{m.desc}</p>
                <button onClick={() => openModule(m.title)} className="mt-4 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50">
                  Manage <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Add New Module */}
            <button onClick={() => toast.info("Custom module builder is coming soon.")} className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 flex flex-col items-center justify-center text-center hover:border-gray-300 transition-colors">
              <span className="w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-gray-100 text-gray-400"><Plus className="w-7 h-7" /></span>
              <p className="text-[15px] font-bold text-gray-900">Add New Module</p>
              <p className="text-xs text-gray-500 mt-2">Create a new management module for your platform.</p>
              <span className="mt-4 flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-xs font-bold" style={{ background: "#EAF7EE", color: GREEN }}>
                Create Module <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          </div>

          {/* Bottom stats strip */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 items-center">
            {BOTTOM_STATS.map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-base font-black text-gray-900 leading-tight">{s.value}</p>
                  <p className="text-[11px] text-gray-400 leading-tight">{s.label}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 lg:justify-self-end">
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: GREEN }} />
              <div>
                <p className="text-[13px] font-bold text-gray-900 leading-tight">System Health</p>
                <p className="text-[11px] leading-tight" style={{ color: GREEN }}>All systems operational</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between px-6 sm:px-8 py-5 text-[11px] text-gray-400 border-t border-gray-100">
          <span>© 2026 VINK Management Panel. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <span className="hover:text-gray-600 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-gray-600 cursor-pointer">Terms of Use</span>
            <span className="hover:text-gray-600 cursor-pointer">Support</span>
          </div>
        </div>
      </div>
    </div>
  );
}
