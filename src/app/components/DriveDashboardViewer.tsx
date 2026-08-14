import { useState } from "react";
import {
  X, Menu, Search, Bell, Moon, Settings, ChevronDown, ChevronRight, Power,
  Eye, FileText, Wallet, Users, Percent, Calculator, FileSignature, ShieldCheck,
  Headphones, Calendar, Activity, Server, CloudUpload, UserCheck, Clock,
} from "lucide-react";

const NAVY = "#0B1330";
const BLUE = "#2563EB";
const GREEN = "#059669";
const PURPLE = "#7C3AED";
const ORANGE = "#EA580C";
const TEAL = "#0D9488";
const AMBER = "#D97706";
const PINK = "#DB2777";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  driverName?: string;
}

/** Same small trend-line sparkline used in ManagementPanelViewer -- pure
 *  SVG, kept consistent with that dashboard's visual language rather than
 *  building a second, slightly different version of the same thing. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - ((v - min) / range) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-7 mt-2">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
    </svg>
  );
}

/** A circular progress ring for the System Health readout -- plain SVG
 *  stroke-dasharray trick, no charting library needed for one ring. */
function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const r = 52, c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg viewBox="0 0 128 128" className="w-32 h-32 -rotate-90">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#E5E7EB" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="12" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
}

const SIDEBAR_MODULES = [
  { label: "Turn on or off", icon: <Power className="w-4 h-4" /> },
  { label: "Preview", icon: <Eye className="w-4 h-4" /> },
  { label: "Statements", icon: <FileText className="w-4 h-4" /> },
  { label: "Payslip", icon: <Wallet className="w-4 h-4" /> },
  { label: "Uif", icon: <Users className="w-4 h-4" /> },
  { label: "Tax", icon: <Percent className="w-4 h-4" /> },
  { label: "Tax association fee", icon: <Calculator className="w-4 h-4" /> },
  { label: "Contract", icon: <FileSignature className="w-4 h-4" /> },
];

const STATS = [
  { label: "Turned On", value: "1,248", trend: "+12.5%", icon: <Power className="w-5 h-5" />, iconBg: "#DBEAFE", color: BLUE, spark: [4, 7, 5, 9, 6, 10, 8, 12, 9, 14] },
  { label: "Previews", value: "3,456", trend: "+8.3%", icon: <Eye className="w-5 h-5" />, iconBg: "#D1FAE5", color: GREEN, spark: [6, 5, 8, 7, 11, 9, 13, 10, 15, 13] },
  { label: "Statements", value: "2,345", trend: "+15.7%", icon: <FileText className="w-5 h-5" />, iconBg: "#EDE9FE", color: PURPLE, spark: [5, 8, 6, 11, 8, 14, 10, 16, 12, 18] },
  { label: "Payslips", value: "1,987", trend: "+10.2%", icon: <Wallet className="w-5 h-5" />, iconBg: "#FFEDD5", color: ORANGE, spark: [7, 6, 9, 8, 12, 10, 14, 11, 16, 13] },
  { label: "UIF", value: "1,102", trend: "+6.8%", icon: <Users className="w-5 h-5" />, iconBg: "#CCFBF1", color: TEAL, spark: [8, 9, 7, 10, 9, 12, 10, 13, 11, 14] },
  { label: "Tax", value: "2,765", trend: "+9.1%", icon: <Percent className="w-5 h-5" />, iconBg: "#FEF3C7", color: AMBER, spark: [6, 8, 7, 9, 8, 11, 9, 12, 10, 13] },
  { label: "Tax Association Fee", value: "456", trend: "+5.4%", icon: <Calculator className="w-5 h-5" />, iconBg: "#FCE7F3", color: PINK, spark: [5, 6, 5, 7, 6, 8, 7, 9, 8, 10] },
  { label: "Contracts", value: "1,876", trend: "+7.2%", icon: <FileSignature className="w-5 h-5" />, iconBg: "#DBEAFE", color: BLUE, spark: [7, 8, 6, 9, 7, 10, 8, 11, 9, 12] },
];

const RECENT_ACTIVITY = [
  { icon: <FileText className="w-4 h-4" />, color: TEAL, title: "New statement generated", sub: "Statement #INV-2456", time: "2 min ago" },
  { icon: <Wallet className="w-4 h-4" />, color: ORANGE, title: "Payslip for May 2025", sub: "Employee ID: EMP-10024", time: "15 min ago" },
  { icon: <Percent className="w-4 h-4" />, color: AMBER, title: "Tax submission successful", sub: "Tax Period: Apr 2025", time: "1 hour ago" },
];

const DEADLINES = [
  { icon: <Calendar className="w-4 h-4" />, color: BLUE, title: "Tax Submission", date: "May 25, 2025", dateColor: "#DC2626" },
  { icon: <Users className="w-4 h-4" />, color: TEAL, title: "UIF Declaration", date: "May 31, 2025", dateColor: AMBER },
  { icon: <Calculator className="w-4 h-4" />, color: PINK, title: "Tax Association Fee", date: "Jun 07, 2025", dateColor: BLUE },
];

const SYSTEM_OVERVIEW = [
  { icon: <ShieldCheck className="w-4 h-4" />, label: "System Status", value: "Operational", color: GREEN },
  { icon: <Server className="w-4 h-4" />, label: "Server Uptime", value: "98.7%", color: NAVY },
  { icon: <CloudUpload className="w-4 h-4" />, label: "Last Backup", value: "2 hours ago", color: NAVY },
  { icon: <UserCheck className="w-4 h-4" />, label: "Active Users", value: "124", color: NAVY },
];

/**
 * Built from the uploaded "DRIVE" reference -- a dedicated dashboard for
 * the driver role, distinct from BankingDashboard's own generic per-role
 * view. Opened when an admin selects "driver" from BankingDashboard's
 * Account Type selector (see App.tsx's onOpenDriveDashboard wiring),
 * rather than just switching BankingDashboard's internal role state like
 * every other role there still does -- this role specifically gets its
 * own full dashboard, matching the reference.
 */
export function DriveDashboardViewer({ isOpen, onClose, driverName = "Admin" }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-0 overflow-hidden"} shrink-0 flex flex-col transition-all duration-200`} style={{ background: NAVY }}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-lg" style={{ background: BLUE }}>D</span>
          <span className="text-white font-black text-lg tracking-wide">DRIVE</span>
        </div>

        <button className="mx-3 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-white mb-4" style={{ background: BLUE }}>
          <span className="w-6 h-6 rounded-md flex items-center justify-center bg-white/15"><Activity className="w-3.5 h-3.5" /></span>
          Dashboard
        </button>

        <p className="px-5 text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Drive Modules</p>
        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
          {SIDEBAR_MODULES.map(m => (
            <button key={m.label} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors">
              <span className="text-white/50">{m.icon}</span>
              <span className="flex-1 text-left">{m.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-white/30" />
            </button>
          ))}
        </nav>

        <div className="p-3 space-y-2">
          <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: "rgba(255,255,255,.05)" }}>
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#60A5FA" }} />
            <div>
              <p className="text-[12.5px] font-bold text-white">Secure &amp; Trusted</p>
              <p className="text-[11px] text-white/50 leading-snug mt-0.5">Your data is safe and protected with us.</p>
            </div>
          </div>
          <div className="rounded-xl p-3.5 flex items-center gap-2.5" style={{ background: "rgba(255,255,255,.05)" }}>
            <Headphones className="w-5 h-5 shrink-0" style={{ color: "#60A5FA" }} />
            <div>
              <p className="text-[12.5px] font-bold text-white">Need Help?</p>
              <p className="text-[11px] text-white/50">Contact support</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-gray-100">
          <button onClick={() => setSidebarOpen(s => !s)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"><Menu className="w-4 h-4" /></button>
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search anything..." className="w-full pl-9 pr-14 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-600" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">⌘K</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button className="relative p-2 rounded-lg hover:bg-gray-50">
              <Bell className="w-4.5 h-4.5 text-gray-500" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: ORANGE }}>8</span>
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Toggle dark mode"><Moon className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Settings"><Settings className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="flex items-center gap-2 pl-2 ml-1 border-l border-gray-100">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: BLUE }}>
                {driverName.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-left hidden sm:block">
                <span className="block text-[13px] font-bold text-gray-900 leading-tight">{driverName}</span>
                <span className="block text-[11px] text-gray-400 leading-tight">Super Admin</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={onClose} className="ml-1 p-2 rounded-lg hover:bg-gray-50 text-gray-500" aria-label="Close"><X className="w-4.5 h-4.5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-7">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Welcome back, {driverName}! 👋</h1>
              <p className="text-gray-500 text-sm mt-1">Here's what's happening with your drive platform today.</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white">
              <Calendar className="w-4 h-4 text-gray-400" /> 02 May 2025 - 08 May 2025 <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {STATS.map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-3.5">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.iconBg, color: s.color }}>{s.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400">{s.label}</p>
                    <p className="text-xl font-black text-gray-900 mt-0.5">{s.value}</p>
                  </div>
                </div>
                <p className="text-[11px] font-semibold mt-2" style={{ color: GREEN }}>↑ {s.trend} from last month</p>
                <Sparkline data={s.spark} color={s.color} />
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-8">
            <p className="text-[15px] font-black text-gray-900 mb-4">Quick Actions</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {STATS.map(s => (
                <button key={s.label} className="flex flex-col items-center gap-2 p-3.5 rounded-xl border border-gray-100 hover:border-transparent hover:shadow-md transition-all" style={{ background: s.iconBg + "55" }}>
                  <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: s.iconBg, color: s.color }}>{s.icon}</span>
                  <span className="text-[11.5px] font-semibold text-gray-700 text-center leading-snug">{s.label === "Tax Association Fee" ? "Tax association fee" : s.label === "Turned On" ? "Turn on or off" : s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recent Activity / Deadlines / System Overview */}
          <div className="grid lg:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-[15px] font-black text-gray-900 mb-4">Recent Activity</p>
              <div className="space-y-4">
                {RECENT_ACTIVITY.map(a => (
                  <div key={a.title} className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: a.color + "1A", color: a.color }}>{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-gray-900 leading-tight">{a.title}</p>
                      <p className="text-[11.5px] text-gray-400 mt-0.5">{a.sub}</p>
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0 flex items-center gap-1"><Clock className="w-3 h-3" />{a.time}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[15px] font-black text-gray-900">Upcoming Deadlines</p>
                <button className="text-xs font-bold" style={{ color: BLUE }}>View all</button>
              </div>
              <div className="space-y-4">
                {DEADLINES.map(d => (
                  <div key={d.title} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: d.color + "1A", color: d.color }}>{d.icon}</span>
                    <p className="flex-1 text-[13px] font-bold text-gray-900">{d.title}</p>
                    <span className="text-[12px] font-bold shrink-0" style={{ color: d.dateColor }}>{d.date}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-[15px] font-black text-gray-900 mb-4">System Overview</p>
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  <ProgressRing percent={98} color={GREEN} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-gray-900">98%</span>
                    <span className="text-[10px] text-gray-400">System Health</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2.5 min-w-0">
                  {SYSTEM_OVERVIEW.map(item => (
                    <div key={item.label} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11.5px] text-gray-500 truncate"><span style={{ color: item.color }}>{item.icon}</span>{item.label}</span>
                      <span className="text-[11.5px] font-bold shrink-0" style={{ color: item.color }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
