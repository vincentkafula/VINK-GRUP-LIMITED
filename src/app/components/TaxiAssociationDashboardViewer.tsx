import { useState } from "react";
import {
  X, Menu, Search, Bell, Moon, Settings, ChevronDown, Car, Users, Route as RouteIcon,
  Star, Phone, MapPin, AlertTriangle, CheckCircle2, Info, Eye, Home,
  Scale, BarChart3, FileText, Percent, ShieldCheck, Headphones, Calendar,
} from "lucide-react";
import {
  association, period, stats, owners, vehicles, drivers, routes, liveVehicles,
  notifications, balanceSheet, incomeStatement, cashFlow, taxSubmissions,
  taxAssociationFees, computed, type AssocStat,
} from "../data/taxiAssociationDashboardData";

const NAVY = "#0B1330";
const COLOR_MAP: Record<string, string> = {
  blue: "#2563EB", green: "#059669", purple: "#7C3AED", orange: "#EA580C", teal: "#0D9488",
};
const STATUS_COLOR: Record<string, string> = {
  Active: "#059669", Maintenance: "#D97706", Inactive: "#9CA3AF", "On Trip": "#2563EB",
  Suspended: "#DC2626", Paid: "#059669", Pending: "#D97706", Overdue: "#DC2626", Submitted: "#059669",
};
const CONDITION_COLOR: Record<string, string> = { fast: "#059669", moderate: "#D97706", slow: "#DC2626" };
const NOTIF_COLOR: Record<string, string> = { warning: "#D97706", success: "#059669", info: "#2563EB" };
const NOTIF_ICON: Record<string, React.ReactNode> = {
  warning: <AlertTriangle className="w-4 h-4" />, success: <CheckCircle2 className="w-4 h-4" />, info: <Info className="w-4 h-4" />,
};

type View = "dashboard" | "preview" | "vehicles" | "owners" | "drivers" | "routes" | "map" | "balance" | "income" | "cashflow" | "tax" | "taxfee";

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

function fmtZAR(n: number) { return `R${n.toLocaleString()}`; }

const SIDEBAR_GROUPS: { id: View; label: string; icon: React.ReactNode }[][] = [
  [
    { id: "dashboard", label: "Dashboard", icon: <Home className="w-4 h-4" /> },
    { id: "preview", label: "Preview", icon: <Eye className="w-4 h-4" /> },
    { id: "vehicles", label: "Vehicles", icon: <Car className="w-4 h-4" /> },
    { id: "owners", label: "Owners", icon: <Users className="w-4 h-4" /> },
    { id: "drivers", label: "Drivers", icon: <Users className="w-4 h-4" /> },
    { id: "routes", label: "Routes", icon: <RouteIcon className="w-4 h-4" /> },
    { id: "map", label: "Map", icon: <MapPin className="w-4 h-4" /> },
  ],
  [
    { id: "balance", label: "Balance Sheet", icon: <Scale className="w-4 h-4" /> },
    { id: "income", label: "Income Statement", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "cashflow", label: "Cash Flow Statement", icon: <FileText className="w-4 h-4" /> },
  ],
  [
    { id: "tax", label: "Tax", icon: <Percent className="w-4 h-4" /> },
    { id: "taxfee", label: "Tax association fee", icon: <FileText className="w-4 h-4" /> },
  ],
];

/**
 * Taxi Association Dashboard -- built from the uploaded reference. That
 * upload was only the index.html shell (sidebar nav, top bar, script
 * tags pointing at js/data.js, js/pages.js etc.) -- none of those actual
 * data/page files were included, so the section list and layout come
 * directly from the reference, but the numbers are realistic, internally
 * consistent placeholder data (see taxiAssociationDashboardData.ts --
 * its own balance sheet verified to actually balance before this was
 * built) rather than a real association's real figures.
 *
 * Reuses the same building blocks as OwnerFleetDashboardViewer
 * (Sparkline, table/card patterns, stat card layout) since this sits at
 * the same visual tier -- an association managing many owners is one
 * level up from a single owner managing their own fleet -- rather than
 * inventing a third, inconsistent visual language for what's
 * structurally the same kind of dashboard.
 *
 * Opened via a dedicated button in BankingDashboard's sidebar
 * (separate from the Account Type role grid, since "Taxi Association"
 * isn't a BankRole -- it's an organizational entity, not one of the
 * existing individual-account roles that grid switches between).
 */
export function TaxiAssociationDashboardViewer({ isOpen, onClose }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState<View>("dashboard");

  if (!isOpen) return null;

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
          <span className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white" style={{ background: "#EA580C" }}><Car className="w-4 h-4" /></span>
          <span className="text-white font-black text-[13px] leading-tight tracking-wide">TAXI ASSOCIATION</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-3">
          {SIDEBAR_GROUPS.map((group, gi) => (
            <div key={gi} className="space-y-0.5 pb-3" style={{ borderBottom: gi < SIDEBAR_GROUPS.length - 1 ? "1px solid rgba(255,255,255,.06)" : undefined }}>
              {group.map(item => (
                <button key={item.id} onClick={() => setView(item.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
                  style={view === item.id ? { background: "#EA580C", color: "#fff" } : { color: "rgba(255,255,255,0.65)" }}>
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 space-y-2">
          <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: "rgba(255,255,255,.05)" }}>
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#FB923C" }} />
            <div>
              <p className="text-[12.5px] font-bold text-white">Secure &amp; Trusted</p>
              <p className="text-[11px] text-white/50 leading-snug mt-0.5">Your data is safe and protected with us.</p>
            </div>
          </div>
          <div className="rounded-xl p-3.5 flex items-center gap-2.5" style={{ background: "rgba(255,255,255,.05)" }}>
            <Headphones className="w-5 h-5 shrink-0" style={{ color: "#FB923C" }} />
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
            <input placeholder="Search anything..." className="w-full pl-9 pr-14 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-orange-600" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">⌘K</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button className="relative p-2 rounded-lg hover:bg-gray-50">
              <Bell className="w-4.5 h-4.5 text-gray-500" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: "#EA580C" }}>8</span>
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Toggle dark mode"><Moon className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Settings"><Settings className="w-4.5 h-4.5 text-gray-500" /></button>
            <button className="flex items-center gap-2 pl-2 ml-1 border-l border-gray-100">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "#EA580C" }}>AD</span>
              <span className="text-left hidden sm:block">
                <span className="block text-[13px] font-bold text-gray-900 leading-tight">Admin</span>
                <span className="block text-[11px] text-gray-400 leading-tight">Super Admin</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={onClose} className="ml-1 p-2 rounded-lg hover:bg-gray-50 text-gray-500" aria-label="Close"><X className="w-4.5 h-4.5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Dashboard ── */}
          {view === "dashboard" && (
            <>
              <div className="flex items-start justify-between flex-wrap gap-4 mb-7">
                <div>
                  <h1 className="text-2xl font-black text-gray-900">{association.name}</h1>
                  <p className="text-gray-500 text-sm mt-1">{association.region} · Association-wide overview for this week.</p>
                </div>
                <span className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 bg-white"><Calendar className="w-4 h-4 text-gray-400" />{period.label}</span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                {stats.map((s: AssocStat) => (
                  <div key={s.key} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-xs text-gray-400">{s.label}</p>
                    <p className="text-xl font-black text-gray-900 mt-1">{s.value}</p>
                    <p className="text-[11px] font-semibold mt-1" style={{ color: "#059669" }}>{s.up ? "↑" : "↓"} {s.delta} from last week</p>
                    <Sparkline data={s.series} color={COLOR_MAP[s.color] ?? "#EA580C"} />
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

          {/* ── Preview ── */}
          {view === "preview" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Association Preview</h1>
              <p className="text-gray-500 text-sm mb-5">A quick summary of {association.name}.</p>
              <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-xl">
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#FFEDD5", color: "#EA580C" }}><Car className="w-6 h-6" /></span>
                  <div>
                    <p className="text-lg font-black text-gray-900">{association.name}</p>
                    <p className="text-[12.5px] text-gray-500">{association.region}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {stats.map(s => (
                    <div key={s.key} className="p-3 rounded-xl" style={{ background: "#F9FAFB" }}>
                      <p className="text-[11px] text-gray-400">{s.label}</p>
                      <p className="text-base font-black text-gray-900 mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Vehicles ── */}
          {view === "vehicles" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Vehicles</h1>
              <p className="text-gray-500 text-sm mb-5">{vehicles.length} member vehicles shown (of {stats.find(s => s.key === "vehicles")?.value} total).</p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-semibold">Reg</th><th className="px-5 py-3 font-semibold">Model</th>
                    <th className="px-5 py-3 font-semibold">Owner</th><th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Driver</th><th className="px-5 py-3 font-semibold">Mileage</th>
                    <th className="px-5 py-3 font-semibold">Last Service</th>
                  </tr></thead>
                  <tbody>
                    {vehicles.map(v => (
                      <tr key={v.reg} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-bold text-gray-900" style={{ fontFamily: "'JetBrains Mono',monospace" }}>{v.reg}</td>
                        <td className="px-5 py-3 text-gray-700">{v.model}</td>
                        <td className="px-5 py-3 text-gray-700">{v.owner}</td>
                        <td className="px-5 py-3"><span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: STATUS_COLOR[v.status] + "1A", color: STATUS_COLOR[v.status] }}>{v.status}</span></td>
                        <td className="px-5 py-3 text-gray-700">{v.driver}</td>
                        <td className="px-5 py-3 text-gray-500">{v.mileage.toLocaleString()} km</td>
                        <td className="px-5 py-3 text-gray-500">{v.lastService}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Owners ── */}
          {view === "owners" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Owners</h1>
              <p className="text-gray-500 text-sm mb-5">{owners.length} member owners shown (of {stats.find(s => s.key === "owners")?.value} total).</p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-semibold">Owner</th><th className="px-5 py-3 font-semibold">Phone</th>
                    <th className="px-5 py-3 font-semibold">Vehicles</th><th className="px-5 py-3 font-semibold">Drivers</th>
                    <th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Joined</th>
                  </tr></thead>
                  <tbody>
                    {owners.map(o => (
                      <tr key={o.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-bold text-gray-900">{o.name}</td>
                        <td className="px-5 py-3 text-gray-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{o.phone}</td>
                        <td className="px-5 py-3 text-gray-700">{o.vehicles}</td>
                        <td className="px-5 py-3 text-gray-700">{o.drivers}</td>
                        <td className="px-5 py-3"><span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: STATUS_COLOR[o.status] + "1A", color: STATUS_COLOR[o.status] }}>{o.status}</span></td>
                        <td className="px-5 py-3 text-gray-500">{o.joined}</td>
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
              <p className="text-gray-500 text-sm mb-5">{drivers.length} member drivers shown (of {stats.find(s => s.key === "drivers")?.value} total).</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {drivers.map(d => (
                  <div key={d.name} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between mb-2.5">
                      <span className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: "#EA580C" }}>{d.name.split(" ").map(n => n[0]).join("")}</span>
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

          {/* ── Routes ── */}
          {view === "routes" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Routes</h1>
              <p className="text-gray-500 text-sm mb-5">{routes.length} active routes across the association.</p>
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
                        <td className="px-5 py-3 font-bold text-gray-900">{fmtZAR(r.revenue)}</td>
                        <td className="px-5 py-3"><span className="px-2 py-1 rounded-full text-[11px] font-bold capitalize" style={{ background: CONDITION_COLOR[r.condition] + "1A", color: CONDITION_COLOR[r.condition] }}>{r.condition}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Map ── */}
          {view === "map" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Live Map</h1>
              <p className="text-gray-500 text-sm mb-5">{liveVehicles.length} vehicles reporting live position across {association.region}.</p>
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <svg viewBox="0 0 100 100" className="w-full rounded-xl" style={{ background: "#F1F5F9", aspectRatio: "16/9" }}>
                  <defs><pattern id="tad-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#E2E8F0" strokeWidth="0.3" /></pattern></defs>
                  <rect width="100" height="100" fill="url(#tad-grid)" />
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
                  <span className="text-[11px] text-gray-400 ml-auto">Live GPS pings, {association.region}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Balance Sheet ── */}
          {view === "balance" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Balance Sheet</h1>
              <p className="text-gray-500 text-sm mb-5">As of {balanceSheet.asOf}.</p>
              <div className="grid lg:grid-cols-3 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[13px] font-black text-gray-900 mb-3">Assets</p>
                  <div className="space-y-2">
                    {balanceSheet.assets.map(a => (
                      <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtZAR(a.value)}</span></div>
                    ))}
                    <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Assets</span><span style={{ color: "#059669" }}>{fmtZAR(computed.totalAssets)}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[13px] font-black text-gray-900 mb-3">Liabilities</p>
                  <div className="space-y-2">
                    {balanceSheet.liabilities.map(a => (
                      <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtZAR(a.value)}</span></div>
                    ))}
                    <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Liabilities</span><span style={{ color: "#DC2626" }}>{fmtZAR(computed.totalLiabilities)}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[13px] font-black text-gray-900 mb-3">Equity</p>
                  <div className="space-y-2">
                    {balanceSheet.equity.map(a => (
                      <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtZAR(a.value)}</span></div>
                    ))}
                    <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Equity</span><span style={{ color: "#2563EB" }}>{fmtZAR(computed.totalEquity)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Income Statement ── */}
          {view === "income" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Income Statement</h1>
              <p className="text-gray-500 text-sm mb-5">{incomeStatement.period}</p>
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[13px] font-black text-gray-900 mb-3">Income</p>
                  <div className="space-y-2">
                    {incomeStatement.income.map(a => (
                      <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtZAR(a.value)}</span></div>
                    ))}
                    <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Income</span><span style={{ color: "#059669" }}>{fmtZAR(computed.totalIncome)}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[13px] font-black text-gray-900 mb-3">Expenses</p>
                  <div className="space-y-2">
                    {incomeStatement.expenses.map(a => (
                      <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtZAR(a.value)}</span></div>
                    ))}
                    <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Expenses</span><span style={{ color: "#DC2626" }}>{fmtZAR(computed.totalExpenses)}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 flex items-center justify-between">
                  <div><p className="text-[13px] font-black text-gray-900">Net Surplus</p><p className="text-[11.5px] text-gray-500">{incomeStatement.period}</p></div>
                  <div className="text-right"><p className="text-xl font-black" style={{ color: "#059669" }}>{fmtZAR(computed.netProfit)}</p><p className="text-[11.5px] text-gray-500">{computed.profitMargin}% margin</p></div>
                </div>
              </div>
            </div>
          )}

          {/* ── Cash Flow ── */}
          {view === "cashflow" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Cash Flow Statement</h1>
              <p className="text-gray-500 text-sm mb-5">{cashFlow.period}</p>
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[13px] font-black text-gray-900 mb-3">Inflow</p>
                  <div className="space-y-2">
                    {cashFlow.inflow.map(a => (
                      <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtZAR(a.value)}</span></div>
                    ))}
                    <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Inflow</span><span style={{ color: "#059669" }}>{fmtZAR(computed.totalInflow)}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <p className="text-[13px] font-black text-gray-900 mb-3">Outflow</p>
                  <div className="space-y-2">
                    {cashFlow.outflow.map(a => (
                      <div key={a.label} className="flex items-center justify-between text-[12.5px]"><span className="text-gray-500">{a.label}</span><span className="font-semibold text-gray-900">{fmtZAR(a.value)}</span></div>
                    ))}
                    <div className="flex items-center justify-between text-[13px] font-black pt-2 mt-2 border-t border-gray-100"><span>Total Outflow</span><span style={{ color: "#DC2626" }}>{fmtZAR(computed.totalOutflow)}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-[11px] text-gray-400">Opening Balance</p><p className="text-base font-black text-gray-900 mt-1">{fmtZAR(cashFlow.openingBalance)}</p></div>
                  <div><p className="text-[11px] text-gray-400">Net Cash Flow</p><p className="text-base font-black mt-1" style={{ color: computed.netCashFlow >= 0 ? "#059669" : "#DC2626" }}>{computed.netCashFlow >= 0 ? "+" : ""}{fmtZAR(computed.netCashFlow)}</p></div>
                  <div><p className="text-[11px] text-gray-400">Closing Balance</p><p className="text-base font-black mt-1" style={{ color: "#2563EB" }}>{fmtZAR(computed.closingBalance)}</p></div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tax ── */}
          {view === "tax" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Tax</h1>
              <p className="text-gray-500 text-sm mb-5">PAYE and VAT submission history.</p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-semibold">Period</th><th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Amount</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Due Date</th>
                  </tr></thead>
                  <tbody>
                    {taxSubmissions.map((t, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-bold text-gray-900">{t.period}</td>
                        <td className="px-5 py-3 text-gray-700">{t.type}</td>
                        <td className="px-5 py-3 text-gray-700">{t.amount > 0 ? fmtZAR(t.amount) : "—"}</td>
                        <td className="px-5 py-3"><span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: STATUS_COLOR[t.status] + "1A", color: STATUS_COLOR[t.status] }}>{t.status}</span></td>
                        <td className="px-5 py-3 text-gray-500">{t.dueDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tax association fee ── */}
          {view === "taxfee" && (
            <div>
              <h1 className="text-xl font-black text-gray-900 mb-1">Tax Association Fee</h1>
              <p className="text-gray-500 text-sm mb-5">Monthly per-owner association fees, based on registered vehicle count.</p>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-gray-400 text-xs uppercase tracking-wide">
                    <th className="px-5 py-3 font-semibold">Owner</th><th className="px-5 py-3 font-semibold">Vehicles</th>
                    <th className="px-5 py-3 font-semibold">Monthly Fee</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Due Date</th>
                  </tr></thead>
                  <tbody>
                    {taxAssociationFees.map(f => (
                      <tr key={f.owner} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-bold text-gray-900">{f.owner}</td>
                        <td className="px-5 py-3 text-gray-700">{f.vehicles}</td>
                        <td className="px-5 py-3 text-gray-700">{fmtZAR(f.monthlyFee)}</td>
                        <td className="px-5 py-3"><span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: STATUS_COLOR[f.status] + "1A", color: STATUS_COLOR[f.status] }}>{f.status}</span></td>
                        <td className="px-5 py-3 text-gray-500">{f.dueDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
