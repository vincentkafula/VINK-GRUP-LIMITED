import { useState } from "react";
import { Crown, Users, Activity, Shield, Database, Settings, Bell, Home, BarChart3, Server, Lock, AlertTriangle, CheckCircle, Zap } from "lucide-react";
import { DashboardShell, StatCard, Badge, Sparkline, SectionPanel, TableCard, ProgressBar } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "System Overview" },
  { icon: <Users className="w-4 h-4" />, label: "All Users" },
  { icon: <Server className="w-4 h-4" />, label: "Services Health" },
  { icon: <Database className="w-4 h-4" />, label: "Data Store" },
  { icon: <Shield className="w-4 h-4" />, label: "Security" },
  { icon: <BarChart3 className="w-4 h-4" />, label: "Analytics" },
  { icon: <Lock className="w-4 h-4" />, label: "Permissions" },
  { icon: <Activity className="w-4 h-4" />, label: "Audit Log" },
  { icon: <Bell className="w-4 h-4" />, label: "Alerts", badge: 6 },
  { icon: <Settings className="w-4 h-4" />, label: "Configuration" },
];

const SERVICES = [
  { name: "MVNO Core Network", status: "healthy", uptime: 99.97, latency: "4ms", requests: "12.4K/min", color: "#10B981" },
  { name: "Vehicle Tracking API", status: "healthy", uptime: 99.94, latency: "8ms", requests: "4.2K/min", color: "#10B981" },
  { name: "Billing & OSS-BSS", status: "healthy", uptime: 99.89, latency: "12ms", requests: "2.8K/min", color: "#10B981" },
  { name: "Merchant Platform", status: "degraded", uptime: 98.40, latency: "84ms", requests: "1.4K/min", color: "#F59E0B" },
  { name: "Auth Service (JWT)", status: "healthy", uptime: 99.99, latency: "2ms", requests: "8.4K/min", color: "#10B981" },
  { name: "WebSocket Live Feed", status: "healthy", uptime: 99.95, latency: "6ms", requests: "840 conns", color: "#10B981" },
  { name: "Fraud Detection Engine", status: "healthy", uptime: 99.92, latency: "18ms", requests: "5.1K/min", color: "#10B981" },
  { name: "Customer Support", status: "healthy", uptime: 99.88, latency: "22ms", requests: "640/min", color: "#10B981" },
];

const ALL_USERS = [
  { name: "James Mokoena", role: "Driver", dashboard: "Driver", lastLogin: "2m ago", status: "active" },
  { name: "Aisha Patel", role: "Passenger", dashboard: "Passenger", lastLogin: "8m ago", status: "active" },
  { name: "Reginald Botha", role: "Investor", dashboard: "Investor", lastLogin: "15m ago", status: "active" },
  { name: "Victor Nkosi", role: "Fleet Owner", dashboard: "Owner", lastLogin: "32m ago", status: "active" },
  { name: "Commander Ndlovu", role: "Marshall", dashboard: "Marshall", lastLogin: "5m ago", status: "active" },
  { name: "NOC Engineer 1", role: "NOC", dashboard: "Mobile Network", lastLogin: "10m ago", status: "active" },
  { name: "Compliance Officer", role: "Authority", dashboard: "Authority", lastLogin: "1h ago", status: "idle" },
  { name: "Vink Finance Admin", role: "Finance", dashboard: "Account", lastLogin: "3h ago", status: "idle" },
];

const AUDIT = [
  { action: "User login", user: "noc1", target: "MVNO Dashboard", time: "2m ago", risk: "low" },
  { action: "Invoice marked paid", user: "billing1", target: "INV-2024-0482", time: "8m ago", risk: "low" },
  { action: "Fraud alert resolved", user: "noc1", target: "FRAUD-ALT-0184", time: "22m ago", risk: "medium" },
  { action: "Tower status change", user: "system", target: "TOWER-0031 → offline", time: "35m ago", risk: "high" },
  { action: "JWT secret rotation", user: "superadmin", target: "Auth Service", time: "2h ago", risk: "low" },
  { action: "New SIM batch created", user: "noc1", target: "BATCH-2025-014 (200 SIMs)", time: "3h ago", risk: "low" },
];

const SYSTEM_CHART = Array.from({ length: 24 }, (_, i) => 55 + Math.sin(i / 3) * 20 + Math.random() * 10);
const riskColor: Record<string, string> = { low: "#10B981", medium: "#F59E0B", high: "#EF4444" };

export function SuperAdminDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("System Overview");
  if (!isOpen) return null;

  const healthy = SERVICES.filter(s => s.status === "healthy").length;
  const degraded = SERVICES.filter(s => s.status === "degraded").length;

  return (
    <DashboardShell
      title="Super Administrator" subtitle="Admin — Full System Control"
      accentColor="#DC2626" gradient="from-red-700 to-rose-600"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} liveConnected userName="superadmin" alertCount={6}
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Total Users" value="2,401,840" icon={<Users className="w-5 h-5" />} color="#DC2626" trend="up" />
          <StatCard label="Services Healthy" value={`${healthy}/${SERVICES.length}`} icon={<CheckCircle className="w-5 h-5" />} color="#10B981" />
          <StatCard label="Degraded Services" value={String(degraded)} icon={<AlertTriangle className="w-5 h-5" />} color="#F59E0B" />
          <StatCard label="System Load" value="68%" icon={<Activity className="w-5 h-5" />} color="#8B5CF6" />
          <StatCard label="Active Sessions" value="48,290" icon={<Zap className="w-5 h-5" />} color="#3B82F6" trend="up" />
          <StatCard label="Open Alerts" value="6" icon={<Bell className="w-5 h-5" />} color="#EF4444" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            {/* System load chart */}
            <div className="rounded-xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  System Load (24h)
                </h3>
                <div className="flex gap-2">
                  <Badge text="API" color="#DC2626" />
                  <Badge text="avg 68%" color="#8B5CF6" />
                </div>
              </div>
              <Sparkline values={SYSTEM_CHART} color="#DC2626" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Now</span>
              </div>
            </div>

            {/* Services health */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#2D2A50" }}>
                <h3 className="text-sm font-bold text-white">All Services Health</h3>
                <div className="flex gap-2">
                  <Badge text={`${healthy} healthy`} color="#10B981" />
                  {degraded > 0 && <Badge text={`${degraded} degraded`} color="#F59E0B" />}
                </div>
              </div>
              <div className="divide-y" style={{ borderColor: "#2D2A5033" }}>
                {SERVICES.map((s, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"}`}
                      style={{ boxShadow: `0 0 6px ${s.color}` }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-white">{s.name}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>Latency: {s.latency} · {s.requests}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold" style={{ color: s.color }}>{s.uptime}% uptime</p>
                      <Badge text={s.status} color={s.color} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active users table */}
            <TableCard
              title="Active Dashboard Users"
              color="#DC2626"
              columns={["Name", "Role", "Dashboard", "Last Login", "Status"]}
              rows={ALL_USERS.map(u => [
                u.name,
                u.role,
                <Badge text={u.dashboard} color="#DC2626" />,
                u.lastLogin,
                <Badge text={u.status} color={u.status === "active" ? "#10B981" : "#F59E0B"} />,
              ])}
            />
          </div>

          <div className="space-y-4">
            <SectionPanel title="Resource Usage">
              <ProgressBar label="CPU Usage" value={68} max={100} color="#DC2626" />
              <ProgressBar label="Memory" value={74} max={100} color="#F59E0B" />
              <ProgressBar label="Disk I/O" value={42} max={100} color="#3B82F6" />
              <ProgressBar label="Network" value={58} max={100} color="#10B981" />
              <ProgressBar label="DB Connections" value={81} max={100} color="#8B5CF6" />
            </SectionPanel>

            <SectionPanel title="Recent Audit Log">
              <div className="space-y-2">
                {AUDIT.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2 border-b last:border-0" style={{ borderColor: "#2D2A5033" }}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: riskColor[a.risk] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-white truncate">{a.action}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>{a.user} · {a.time}</p>
                      <p className="text-[9px]" style={{ color: "#5A5880" }}>{a.target}</p>
                    </div>
                    <Badge text={a.risk} color={riskColor[a.risk]} />
                  </div>
                ))}
              </div>
            </SectionPanel>

            <SectionPanel title="Quick Controls">
              <div className="space-y-2">
                {[
                  { label: "Broadcast System Alert", color: "#EF4444" },
                  { label: "Force Session Logout All", color: "#DC2626" },
                  { label: "Rotate JWT Secrets", color: "#F59E0B" },
                  { label: "Clear Cache (All Services)", color: "#3B82F6" },
                  { label: "Export Full Audit Log", color: "#10B981" },
                  { label: "System Health Report", color: "#8B5CF6" },
                ].map((c, i) => (
                  <button key={i} className="w-full py-2 px-3 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90 text-left"
                    style={{ background: c.color + "15", border: `1px solid ${c.color}30`, color: c.color }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </SectionPanel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
