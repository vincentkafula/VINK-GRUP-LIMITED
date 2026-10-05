import { X, Bell, RefreshCw, Clock, Menu, LogOut, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet, ThemeToggle } from "../ds";

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

/**
 * A role colour is a lively data colour; as TEXT it must still be readable on both themes. This mixes it with the theme's text colour
 * (darker in light mode, lighter in dark mode), which keeps the hue and passes contrast on every surface.
 */
export const accentText = (color: string) => `color-mix(in srgb, ${color} 62%, var(--vk-fg))`;

function NavList({ items, active, accent, onPick, collapsed }: { items: NavItem[]; active: string; accent: string; onPick: (label: string) => void; collapsed?: boolean }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const on = active === item.label;
        return (
          <li key={item.label}>
            <button type="button" onClick={() => onPick(item.label)} aria-current={on ? "page" : undefined} title={collapsed ? item.label : undefined}
              className={`relative flex min-h-11 w-full items-center gap-3 rounded-vk-md px-3 text-left text-sm transition-colors ${on ? "font-semibold text-fg" : "font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"}`}
              style={on ? { background: `color-mix(in srgb, ${accent} 16%, transparent)` } : undefined}>
              {on && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-full" style={{ background: accent }} />}
              <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-[18px]" style={on ? { color: accentText(accent) } : undefined}>{item.icon}</span>
              {!collapsed && (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{item.label}</span>
                  {item.badge && item.badge > 0 ? <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-bad text-[11px] font-bold text-white" aria-label={`${item.badge} new`}>{item.badge > 9 ? "9+" : item.badge}</span> : null}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardShell({
  title, subtitle, accentColor, navItems, activeNav, onNavChange,
  onClose, onRefresh, loading, liveConnected, alertCount, userName, children,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);          // the clock stops when the dashboard closes
  }, []);

  const mark = (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-vk-md" style={{ backgroundImage: `linear-gradient(135deg, ${accentColor}, color-mix(in srgb, ${accentColor} 55%, #000))` }}>
      <div className="size-3.5 rounded-sm bg-white/90" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-bg text-fg">
      {/* Side navigation: always on large screens, a drawer on small ones */}
      <aside className={`hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex ${collapsed ? "w-[72px]" : "w-60"}`}>
        <div className="flex items-center gap-3 border-b border-line px-3.5 py-3.5">
          {mark}
          {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-bold leading-tight">{title}</p><p className="truncate text-xs text-fg-muted">{subtitle}</p></div>}
        </div>
        <nav aria-label={`${title} sections`} className="flex-1 overflow-y-auto px-2 py-3">
          <NavList items={navItems} active={activeNav} accent={accentColor} onPick={onNavChange} collapsed={collapsed} />
        </nav>
        <div className="space-y-1 border-t border-line px-2 py-2">
          <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand the menu" : "Collapse the menu"} aria-pressed={collapsed}
            className="flex min-h-11 w-full items-center gap-3 rounded-vk-md px-3 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
            {collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden="true" /> : <PanelLeftClose className="size-[18px]" aria-hidden="true" />}{!collapsed && "Collapse"}
          </button>
          <button type="button" onClick={onClose} className="flex min-h-11 w-full items-center gap-3 rounded-vk-md px-3 text-sm font-medium text-bad transition-colors hover:bg-bad-bg">
            <LogOut className="size-[18px] shrink-0" aria-hidden="true" />{!collapsed && "Exit dashboard"}
          </button>
        </div>
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title={title} side="left">
        <nav aria-label={`${title} sections`} className="p-3">
          <NavList items={navItems} active={activeNav} accent={accentColor} onPick={(l) => { setMenuOpen(false); onNavChange(l); }} />
          <button type="button" onClick={onClose} className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-vk-md px-3 text-sm font-medium text-bad hover:bg-bad-bg"><LogOut className="size-[18px]" aria-hidden="true" />Exit dashboard</button>
        </nav>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open the dashboard menu" aria-expanded={menuOpen}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg hover:bg-surface-2 lg:hidden"><Menu className="size-5" aria-hidden="true" /></button>
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-fg-muted">
                <span className="hidden truncate sm:inline">{title}</span><ChevronRight className="hidden size-3 sm:inline" aria-hidden="true" />
                <span aria-current="page" className="truncate text-sm font-semibold text-fg sm:text-xs">{activeNav}</span>
              </nav>
              {userName && <p className="hidden truncate text-xs text-fg-muted sm:block">Logged in as {userName}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {liveConnected !== undefined && (
              <span role="status" className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${liveConnected ? "bg-ok-bg text-ok" : "bg-surface-2 text-fg-muted"}`}>
                <span className={`size-1.5 rounded-full ${liveConnected ? "animate-pulse bg-ok" : "bg-fg-subtle"}`} aria-hidden="true" />{liveConnected ? "LIVE" : "OFFLINE"}
              </span>
            )}
            {alertCount !== undefined && alertCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-bad-bg px-2.5 py-1 text-xs font-semibold text-bad" aria-label={`${alertCount} alerts`}><Bell className="size-3" aria-hidden="true" />{alertCount}</span>
            )}
            {onRefresh && (
              <button type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh" className="inline-flex size-10 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40">
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              </button>
            )}
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-fg-muted tabular md:inline-flex"><Clock className="size-3" aria-hidden="true" />{time}</span>
            <ThemeToggle />
            <button type="button" onClick={onClose} aria-label="Exit dashboard" className="inline-flex size-10 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="size-[18px]" aria-hidden="true" /></button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto" id="dashboard-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── Shared UI primitives used by all dashboards ─────────────────────────────

export function StatCard({ label, value, sub, icon, color, trend }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; color: string; trend?: "up"|"down"|"flat";
}) {
  return (
    <div className="rounded-vk-lg border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="rounded-vk-sm p-2" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color: accentText(color) }}>{icon}</div>
        {trend && (
          <span className={`text-xs font-bold ${trend === "up" ? "text-ok" : trend === "down" ? "text-bad" : "text-fg-muted"}`} aria-label={trend === "up" ? "rising" : trend === "down" ? "falling" : "flat"}>
            {trend === "up" ? "▲" : trend === "down" ? "▼" : "─"}
          </span>
        )}
      </div>
      <p className="text-xl font-bold tabular text-fg">{value}</p>
      <p className="mt-0.5 text-xs text-fg-muted">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

export function TableCard({ title, columns, rows, color }: {
  title: string; columns: string[]; rows: (string | React.ReactNode)[][]; color: string;
}) {
  return (
    <div className="overflow-hidden rounded-vk-lg border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-bold text-fg">{title}</h3>
        <div className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-line">
              {columns.map((c, i) => (
                <th key={i} scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-fg-muted">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-fg">{cell}</td>
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
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color: accentText(color), border: `1px solid color-mix(in srgb, ${color} 32%, transparent)` }}>
      {text}
    </span>
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-12 items-end gap-0.5" role="img" aria-label={`Trend, latest value ${values[values.length - 1] ?? 0}`}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: i === values.length - 1 ? color : `color-mix(in srgb, ${color} 35%, transparent)` }} />
      ))}
    </div>
  );
}

export function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="font-bold" style={{ color: accentText(color) }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function SectionPanel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-vk-lg border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-bold text-fg">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
