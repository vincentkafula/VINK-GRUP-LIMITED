import { useState } from "react";
import {
  X, Menu, Search, Bell, Moon, Settings, ChevronDown, Car, Users, Route as RouteIcon,
  Star, Phone, MapPin, AlertTriangle, CheckCircle2, Info,
  LayoutDashboard, ScrollText, Wrench,
} from "lucide-react";
import {
  company, period, stats, vehicles, drivers, routes, liveVehicles, notifications,
  balanceSheet, incomeStatement, cashFlow, computed, type FleetStat,
} from "../data/ownerFleetData";
import { DeviceTerminalModal } from "./DeviceTerminalModal";

const NAVY = "#0B1330";
const COLOR_MAP: Record<string, string> = {
  blue: "#2563EB", green: "#059669", purple: "#7C3AED", orange: "#EA580C", teal: "#0D9488",
};
const STATUS_COLOR: Record<string, string> = {
  Active: "#059669", Maintenance: "#D97706", Inactive: "#9CA3AF", "On Trip": "#2563EB",
};
const CONDITION_COLOR: Record<string, string> = { fast: "#059669", moderate: "#D97706", slow: "#DC2626" };
const NOTIF_COLOR: Record<string, string> = { warning: "#D97706", success: "#059669", info: "#2563EB" };
const NOTIF_ICON: Record<string, React.ReactNode> = {
  warning: <AlertTriangle className="w-4 h-4" />, success: <CheckCircle2 className="w-4 h-4" />, info: <Info className="w-4 h-4" />,
};

type View = "overview" | "vehicles" | "drivers" | "routes" | "notifications" | "financials";
type FinTab = "balance" | "income" | "cashflow";

interface Props { isOpen: boolean; onClose: () => void }

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - ((v - min) / range) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-7 mt-2">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
    </svg>
  );
}

function fmtKES(n: number) { return `KES ${n.toLocaleString()}`; }

const SIDEBAR_ITEMS: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "vehicles", label: "Vehicles", icon: <Car className="w-4 h-4" /> },
  { id: "drivers", label: "Drivers", icon: <Users className="w-4 h-4" /> },
  { id: "routes", label: "Routes & Map", icon: <MapPin className="w-4 h-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
  { id: "financials", label: "Financials", icon: <ScrollText className="w-4 h-4" /> },
];

/**
 * Owner Fleet Dashboard -- built from the provided OFD_DATA reference,
 * transcribed into src/app/data/ownerFleetData.ts (verified: the balance
 * sheet actually balances -- assets = liabilities + equity -- confirmed
 * with real arithmetic before building any UI on top of it, not assumed).
 *
 * Opened from BankingDashboard's Account Type selector when "owner" is
 * selected, same pattern as "driver" opening DriveDashboardViewer: a
 * dedicated full dashboard for this role rather than the generic
 * per-role view every other role there still uses.
 */
export function OwnerFleetDashboardViewer({ isOpen, onClose }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState<View>("overview");
  const [finTab, setFinTab] = useState<FinTab>("balance");
  const [terminalVehicle, setTerminalVehicle] = useState<typeof vehicles[number] | null>(null);

  if (!isOpen) return null;

  // Normalize lat/lng into a simple 0-100 SVG viewport for the map --
  // no real map API is configured here, so this is a stylized position
  // plot rather than an actual tiled map, using the live fleet's own
  // coordinate bounds so markers spread across the available space
  // instead of a hardcoded projection that wouldn't fit this specific data.
  const lats = liveVehicles.map(v => v.lat), lngs = liveVehicles.map(v => v.lng);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const toXY = (lat: number, lng: number) => ({
    x: 8 + ((lng - lngMin) / (lngMax - lngMin || 1)) * 84,
    y: 8 + ((latMax - lat) / (latMax - latMin || 1)) * 84,
  });

  return (
    <div className="fixed inset-0 z-[110] flex bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-0 overflow-hidden"} shrink-0 flex flex-col transition-all duration-200`} style={{ background: NAVY }}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white" style={{ background: "#2563EB" }}><Car className="w-4 h-4" /></span>
          <div>
            <p className="text-white font-black text-base leading-tight">Fleet Owner</p>
            <p className="text-[10px] text-white/40">{company.name}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          {SIDEBAR_ITEMS.map(item => (
            <button key={item.id} onClick={() => setView(item.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
              style={view === item.id ? { background: "#2563EB", color: "#fff" } : { color: "rgba(255,255,255,0.65)" }}>
              {item.icon} {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3">
          <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: "rgba(255,255,255,.05)" }}>
            <Wrench className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#60A5FA" }} />
            <div>
              <p className="text-[12.5px] font-bold text-white">2 vehicles in maintenance</p>
              <p className="text-[11px] text-white/50 leading-snug mt-0.5">KCC 789C and KII 666I need attention</p>
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
            <input placeholder="Search vehicles, drivers, routes..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-600" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button className="relative p-2 rounded-lg hover:bg-gray-50">
              <Bell className="w-4.5 h-4.5 text-gray-500" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: "#EA580C" }}>{notifications.length}</span>
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Toggle dark mode"><Moon className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Settings"><Settings className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="flex items-center gap-2 pl-2 ml-1 border-l border-gray-100">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "#2563EB" }}>
                {company.name.split(" ").map(n => n[0]).join("")}
              </span>
              <span className="text-left hidden sm:block">
                <span className="block text-[13px] font-bold text-gray-900 leading-tight">{company.name}</span>
                <span className="block text-[11px] text-gray-400 leading-tight">{company.role}</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={onClose} className="ml-1 p-2 rounded-lg hover:bg-gray-50 text-gray-500" aria-label="Close"><X className="w-4.5 h-4.5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Overview ── */}
          {view === "overview" && (
            <>
              <div className="flex items-start justify-between flex-wrap gap-4 mb-7">
                <div>
                  <h1 className="text-2xl font-black text-gray-900">Welcome back, {company.name.split(" ")[0]}! 👋</h1>
                  <p className="text-gray-500 text-sm mt-1">Here's how your fleet is performing this week.</p>
                </div>
                <span className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white">{period.label}</span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
                {stats.map((s: FleetStat) => (
                  <div key={s.key} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-xs text-gray-400">{s.label}</p>
                    <p className="text-xl font-black text-gray-900 mt-1">{s.value}</p>
                    <p className="text-[11px] font-semibold mt-1" style={{ color: "#059669" }}>{s.up ? "↑" : "↓"} {s.delta} from last week</p>
                    <Sparkline data={s.series} color={COLOR_MAP[s.color] ?? "#2563EB"} />
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-black text-gray-900 mb-4">Fleet Status</p>
                  <div className="space-y-3">
                    {(["Active", "Maintenance", "Inactive"] as const).map(st => {
                      const count = vehicles.filter(v => v.status === st).length;
                      return (
                        <div key={st} className="flex items-center gap-3">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[st] }} />
                          <span className="flex-1 text-sm text-gray-600">{st}</span>
                          <span className="text-sm font-bold text-gray-900">{count} vehicle{count !== 1 ? "s" : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[15px] font-black text-gray-900 mb-4">Recent Notifications</p>
                  <div className="space-y-3">
                    {notifications.slice(0, 3).map(n => (
                      <div key={n.title} className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: NOTIF_COLOR[n.type] + "1A", color: NOTIF_COLOR[n.type] }}>{NOTIF_ICON[n.type]}</span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{n.title}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Vehicles ── */}
          {view === "vehicles" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Vehicles</h1>
              <p className="text-gray-500 text-sm mb-5">{vehicles.length} vehicles in the fleet.</p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-semibold">Reg</th><th className="px-5 py-3 font-semibold">Model</th>
                    <th className="px-5 py-3 font-semibold">Year</th><th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Driver</th><th className="px-5 py-3 font-semibold">Mileage</th>
                    <th className="px-5 py-3 font-semibold">Last Service</th><th className="px-5 py-3 font-semibold">Device</th>
                  </tr></thead>
                  <tbody>
                    {vehicles.map(v => (
                      <tr key={v.reg} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-bold text-gray-900" style={{ fontFamily: "'JetBrains Mono',monospace" }}>{v.reg}</td>
                        <td className="px-5 py-3 text-gray-700">{v.model}</td>
                        <td className="px-5 py-3 text-gray-500">{v.year}</td>
                        <td className="px-5 py-3"><span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: STATUS_COLOR[v.status] + "1A", color: STATUS_COLOR[v.status] }}>{v.status}</span></td>
                        <td className="px-5 py-3 text-gray-700">{v.driver}</td>
                        <td className="px-5 py-3 text-gray-500">{v.mileage.toLocaleString()} km</td>
                        <td className="px-5 py-3 text-gray-500">{v.lastService}</td>
                        <td className="px-5 py-3">
                          {v.status !== "Inactive" && (
                            <button onClick={() => setTerminalVehicle(v)} className="text-xs font-bold text-blue-600 whitespace-nowrap">View terminal →</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Drivers ── */}
          {view === "drivers" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Drivers</h1>
              <p className="text-gray-500 text-sm mb-5">{drivers.length} drivers on the roster.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {drivers.map(d => (
                  <div key={d.name} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between mb-2.5">
                      <span className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: "#2563EB" }}>{d.name.split(" ").map(n => n[0]).join("")}</span>
                      <span className="px-2 py-1 rounded-full text-[10.5px] font-bold" style={{ background: STATUS_COLOR[d.status] + "1A", color: STATUS_COLOR[d.status] }}>{d.status}</span>
                    </div>
                    <p className="text-[14px] font-bold text-gray-900">{d.name}</p>
                    <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {d.phone}</p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50 text-[12px]">
                      <span className="text-gray-500">{d.trips} trips</span>
                      <span className="flex items-center gap-1 font-bold text-gray-700"><Star className="w-3.5 h-3.5 fill-current" style={{ color: "#D97706" }} /> {d.rating}</span>
                      <span className="font-mono text-gray-500">{d.vehicle}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Routes & Map ── */}
          {view === "routes" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Routes &amp; Live Map</h1>
              <p className="text-gray-500 text-sm mb-5">{routes.length} active routes, {liveVehicles.length} vehicles reporting live position.</p>

              <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
                <svg viewBox="0 0 100 100" className="w-full rounded-xl" style={{ background: "#F1F5F9", aspectRatio: "16/9" }}>
                  <defs><pattern id="ofd-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#E2E8F0" strokeWidth="0.3" /></pattern></defs>
                  <rect width="100" height="100" fill="url(#ofd-grid)" />
                  {liveVehicles.map(v => {
                    const { x, y } = toXY(v.lat, v.lng);
                    return (
                      <g key={v.reg}>
                        <circle cx={x} cy={y} r="2.6" fill={CONDITION_COLOR[v.condition]} opacity="0.25" />
                        <circle cx={x} cy={y} r="1.3" fill={CONDITION_COLOR[v.condition]} />
                      </g>
                    );
                  })}
                </svg>
                <div className="flex items-center gap-5 mt-3 px-1">
                  {(["fast", "moderate", "slow"] as const).map(c => (
                    <span key={c} className="flex items-center gap-1.5 text-[11.5px] text-gray-500 capitalize">
                      <span className="w-2 h-2 rounded-full" style={{ background: CONDITION_COLOR[c] }} /> {c}
                    </span>
                  ))}
                  <span className="text-[11px] text-gray-400 ml-auto">Live GPS pings, Nairobi</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-semibold">Route</th><th className="px-5 py-3 font-semibold">Distance</th>
                    <th className="px-5 py-3 font-semibold">Trips</th><th className="px-5 py-3 font-semibold">Revenue</th><th className="px-5 py-3 font-semibold">Traffic</th>
                  </tr></thead>
                  <tbody>
                    {routes.map(r => (
                      <tr key={r.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-bold text-gray-900 flex items-center gap-2"><RouteIcon className="w-3.5 h-3.5 text-gray-400" />{r.name}</td>
                        <td className="px-5 py-3 text-gray-500">{r.distance}</td>
                        <td className="px-5 py-3 text-gray-700">{r.trips}</td>
                        <td className="px-5 py-3 font-bold text-gray-900">{fmtKES(r.revenue)}</td>
                        <td className="px-5 py-3"><span className="px-2 py-1 rounded-full text-[11px] font-bold capitalize" style={{ background: CONDITION_COLOR[r.condition] + "1A", color: CONDITION_COLOR[r.condition] }}>{r.condition}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {view === "notifications" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Notifications</h1>
              <p className="text-gray-500 text-sm mb-5">{notifications.length} updates from across your fleet.</p>
              <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                {notifications.map(n => (
                  <div key={n.title} className="flex items-start gap-3.5 p-4">
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: NOTIF_COLOR[n.type] + "1A", color: NOTIF_COLOR[n.type] }}>{NOTIF_ICON[n.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-gray-900">{n.title}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5">{n.body}</p>
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0">{n.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Financials ── */}
          {view === "financials" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Financials</h1>
              <p className="text-gray-500 text-sm mb-5">Balance sheet, income statement and cash flow for this week.</p>

              <div className="flex gap-1.5 mb-5 p-1 rounded-full w-fit bg-gray-100">
                {([["balance", "Balance Sheet"], ["income", "Income Statement"], ["cashflow", "Cash Flow"]] as [FinTab, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => setFinTab(id)}
                    className="px-4 py-2 rounded-full text-xs font-bold transition-colors"
                    style={finTab === id ? { background: "#fff", color: "#2563EB", boxShadow: "0 1px 3px rgba(0,0,0,.1)" } : { color: "#6B7280" }}>
                    {label}
                  </button>
                ))}
              </div>

              {finTab === "balance" && (
                <div className="grid lg:grid-cols-3 gap-5">
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[13px] font-black text-gray-900 mb-3">Assets</p>
                    <div className="space-y-2">
                      {balanceSheet.assets.map(a => (
                        <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtKES(a.value)}</span></div>
                      ))}
                      <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Assets</span><span style={{ color: "#059669" }}>{fmtKES(computed.totalAssets)}</span></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[13px] font-black text-gray-900 mb-3">Liabilities</p>
                    <div className="space-y-2">
                      {balanceSheet.liabilities.map(a => (
                        <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtKES(a.value)}</span></div>
                      ))}
                      <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Liabilities</span><span style={{ color: "#DC2626" }}>{fmtKES(computed.totalLiabilities)}</span></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[13px] font-black text-gray-900 mb-3">Equity</p>
                    <div className="space-y-2">
                      {balanceSheet.equity.map(a => (
                        <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtKES(a.value)}</span></div>
                      ))}
                      <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Equity</span><span style={{ color: "#2563EB" }}>{fmtKES(computed.totalEquity)}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {finTab === "income" && (
                <div className="grid lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[13px] font-black text-gray-900 mb-3">Income</p>
                    <div className="space-y-2">
                      {incomeStatement.income.map(a => (
                        <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtKES(a.value)}</span></div>
                      ))}
                      <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Income</span><span style={{ color: "#059669" }}>{fmtKES(computed.totalIncome)}</span></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[13px] font-black text-gray-900 mb-3">Expenses</p>
                    <div className="space-y-2">
                      {incomeStatement.expenses.map(a => (
                        <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtKES(a.value)}</span></div>
                      ))}
                      <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Expenses</span><span style={{ color: "#DC2626" }}>{fmtKES(computed.totalExpenses)}</span></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 flex items-center justify-between">
                    <div><p className="text-[13px] font-black text-gray-900">Net Profit</p><p className="text-[11.5px] text-gray-500">{incomeStatement.period}</p></div>
                    <div className="text-right"><p className="text-xl font-black" style={{ color: "#059669" }}>{fmtKES(computed.netProfit)}</p><p className="text-[11.5px] text-gray-500">{computed.profitMargin}% margin</p></div>
                  </div>
                </div>
              )}

              {finTab === "cashflow" && (
                <div className="grid lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[13px] font-black text-gray-900 mb-3">Inflow</p>
                    <div className="space-y-2">
                      {cashFlow.inflow.map(a => (
                        <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtKES(a.value)}</span></div>
                      ))}
                      <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Inflow</span><span style={{ color: "#059669" }}>{fmtKES(computed.totalInflow)}</span></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[13px] font-black text-gray-900 mb-3">Outflow</p>
                    <div className="space-y-2">
                      {cashFlow.outflow.map(a => (
                        <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtKES(a.value)}</span></div>
                      ))}
                      <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Outflow</span><span style={{ color: "#DC2626" }}>{fmtKES(computed.totalOutflow)}</span></div>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-[11px] text-gray-400">Opening Balance</p><p className="text-base font-black text-gray-900 mt-1">{fmtKES(cashFlow.openingBalance)}</p></div>
                    <div><p className="text-[11px] text-gray-400">Net Cash Flow</p><p className="text-base font-black mt-1" style={{ color: computed.netCashFlow >= 0 ? "#059669" : "#DC2626" }}>{computed.netCashFlow >= 0 ? "+" : ""}{fmtKES(computed.netCashFlow)}</p></div>
                    <div><p className="text-[11px] text-gray-400">Closing Balance</p><p className="text-base font-black mt-1" style={{ color: "#2563EB" }}>{fmtKES(computed.closingBalance)}</p></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {terminalVehicle && (
        <DeviceTerminalModal
          device={{ serial: `VEH-${terminalVehicle.reg.replace(/\s/g, "")}`, status: terminalVehicle.status === "Active" ? "online" : "offline", battery: 78, signal: "Strong", lastSync: "5 min ago", vehicle: `${terminalVehicle.model} · ${terminalVehicle.reg}`, driver: terminalVehicle.driver }}
          onClose={() => setTerminalVehicle(null)}
        />
      )}
    </div>
  );
}
