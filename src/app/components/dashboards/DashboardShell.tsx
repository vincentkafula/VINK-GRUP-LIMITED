import { X, Bell, RefreshCw, Clock, Menu, LogOut, ChevronRight } from "lucide-react";
import { useState } from "react";

export interface NavItem {
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

interface DashboardShellProps {
  title: string;
  subtitle: string;
  accentColor: string;
  gradient: string;
  navItems: NavItem[];
  activeNav: string;
  onNavChange: (label: string) => void;
  onClose: () => void;
  onRefresh?: () => void;
  loading?: boolean;
  liveConnected?: boolean;
  alertCount?: number;
  userName?: string;
  children: React.ReactNode;
}

export function DashboardShell({
  title, subtitle, accentColor, gradient, navItems, activeNav, onNavChange,
  onClose, onRefresh, loading, liveConnected, alertCount, userName, children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  // Update clock
  useState(() => { setInterval(() => setTime(new Date().toLocaleTimeString()), 1000); });

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: "#0D0B1E" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden"
        style={{ width: sidebarOpen ? 220 : 60, background: "#13103A", borderRight: "1px solid #2D2A50" }}
      >
        {/* Logo row */}
        <div className="flex items-center gap-3 px-4 py-4 border-b flex-shrink-0" style={{ borderColor: "#2D2A50" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: gradient.includes("from") ? undefined : accentColor, backgroundImage: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}>
            <div className="w-4 h-4 rounded-sm bg-white/80" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-white text-xs font-bold leading-none truncate">{title}</p>
              <p className="text-[10px] mt-0.5 truncate" style={{ color: "#8884AA" }}>{subtitle}</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto p-1 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white flex-shrink-0">
            <Menu className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.label} onClick={() => onNavChange(item.label)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
              style={{
                background: activeNav === item.label ? accentColor + "22" : "transparent",
                color: activeNav === item.label ? accentColor : "#8884AA",
              }}>
              <span className="flex-shrink-0 w-4 h-4">{item.icon}</span>
              {sidebarOpen && (
                <span className="text-xs font-medium flex-1 truncate flex items-center justify-between">
                  {item.label}
                  {item.badge && item.badge > 0 && (
                    <span className="text-[9px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold flex-shrink-0">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-2 pb-3 pt-2 border-t" style={{ borderColor: "#2D2A50" }}>
          <button onClick={onClose}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span className="text-xs font-medium">Exit Dashboard</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ background: "#13103A", borderBottom: "1px solid #2D2A50" }}>
          <div>
            <div className="flex items-center gap-2 text-xs" style={{ color: "#8884AA" }}>
              <span>{title}</span><ChevronRight className="w-3 h-3" />
              <span className="text-white font-medium">{activeNav}</span>
            </div>
            {userName && <p className="text-[10px] mt-0.5" style={{ color: "#8884AA" }}>Logged in as {userName}</p>}
          </div>
          <div className="flex items-center gap-2">
            {liveConnected !== undefined && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold`}
                style={{ background: liveConnected ? "#10B98115" : "#6B728015", color: liveConnected ? "#10B981" : "#9CA3AF", border: `1px solid ${liveConnected ? "#10B98130" : "#4B556330"}` }}>
                <span className={`w-1.5 h-1.5 rounded-full ${liveConnected ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
                {liveConnected ? "LIVE" : "OFFLINE"}
              </div>
            )}
            {alertCount !== undefined && alertCount > 0 && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: "#EF444415", color: "#EF4444", border: "1px solid #EF444430" }}>
                <Bell className="w-3 h-3" />{alertCount}
              </div>
            )}
            {onRefresh && (
              <button onClick={onRefresh} disabled={loading}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white disabled:opacity-40">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px]"
              style={{ background: "#1E1B3A", color: "#8884AA", border: "1px solid #2D2A50" }}>
              <Clock className="w-3 h-3" />{time}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Shared UI primitives used by all dashboards ─────────────────────────────

export function StatCard({ label, value, sub, icon, color, trend }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; color: string; trend?: "up"|"down"|"flat";
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-lg" style={{ background: color + "20", color }}>{icon}</div>
        {trend && (
          <span className={`text-[10px] font-bold ${trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-gray-400"}`}>
            {trend === "up" ? "▲" : trend === "down" ? "▼" : "─"}
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: "#8884AA" }}>{label}</p>
      {sub && <p className="text-[9px] mt-0.5" style={{ color: "#5A5880" }}>{sub}</p>}
    </div>
  );
}

export function TableCard({ title, columns, rows, color }: {
  title: string; columns: string[]; rows: (string | React.ReactNode)[][]; color: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#2D2A50" }}>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid #2D2A50" }}>
              {columns.map((c, i) => (
                <th key={i} className="px-4 py-2.5 text-left font-semibold" style={{ color: "#8884AA" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors" style={{ borderBottom: "1px solid #2D2A5020" }}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-white/80">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
      style={{ background: color + "22", color, border: `1px solid ${color}44` }}>
      {text}
    </span>
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: i === values.length - 1 ? color : color + "55" }} />
      ))}
    </div>
  );
}

export function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[11px] mb-1">
        <span style={{ color: "#9896B8" }}>{label}</span>
        <span className="font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "#2D2A50" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function SectionPanel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#2D2A50" }}>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
