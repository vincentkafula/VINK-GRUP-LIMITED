import { useState } from "react";
import { Shield, AlertTriangle, MapPin, Radio, Users, FileText, Bell, Settings, Home, Activity, Clock, CheckCircle } from "lucide-react";
import { DashboardShell, StatCard, Badge, SectionPanel, TableCard } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "Overview" },
  { icon: <Activity className="w-4 h-4" />, label: "Active Incidents", badge: 3 },
  { icon: <MapPin className="w-4 h-4" />, label: "Zone Map" },
  { icon: <Radio className="w-4 h-4" />, label: "Communications" },
  { icon: <Users className="w-4 h-4" />, label: "Team" },
  { icon: <FileText className="w-4 h-4" />, label: "Reports" },
  { icon: <Clock className="w-4 h-4" />, label: "Shift Log" },
  { icon: <Bell className="w-4 h-4" />, label: "Alerts", badge: 3 },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const INCIDENTS = [
  { id: "INC-0041", type: "Speeding Vehicle", zone: "Zone A — Sandton", priority: "high", status: "responding", time: "8m ago", assigned: "Marshall 04" },
  { id: "INC-0042", type: "Geofence Breach", zone: "Zone C — Roodepoort", priority: "medium", status: "open", time: "14m ago", assigned: "Unassigned" },
  { id: "INC-0043", type: "SOS Activated", zone: "Zone B — Midrand", priority: "critical", status: "responding", time: "22m ago", assigned: "Marshall 02" },
  { id: "INC-0038", type: "Unauthorized Access", zone: "Zone D — Centurion", priority: "medium", status: "resolved", time: "1h ago", assigned: "Marshall 07" },
  { id: "INC-0035", type: "Driver Fatigue Alert", zone: "Zone A — Sandton", priority: "high", status: "resolved", time: "2h ago", assigned: "Marshall 04" },
];

const TEAM = [
  { name: "Marshall 02 — Sipho", zone: "Zone B", status: "on-duty", incidents: 2 },
  { name: "Marshall 04 — James", zone: "Zone A", status: "responding", incidents: 3 },
  { name: "Marshall 07 — Grace", zone: "Zone D", status: "on-duty", incidents: 1 },
  { name: "Marshall 09 — Priya", zone: "Zone C", status: "off-duty", incidents: 0 },
  { name: "Marshall 12 — Johan", zone: "Zone E", status: "on-duty", incidents: 0 },
];

const ZONES = [
  { name: "Zone A — Sandton", active: 14, incidents: 3, coverage: 94 },
  { name: "Zone B — Midrand", active: 11, incidents: 1, coverage: 88 },
  { name: "Zone C — Roodepoort", active: 8, incidents: 2, coverage: 76 },
  { name: "Zone D — Centurion", active: 10, incidents: 1, coverage: 92 },
  { name: "Zone E — Boksburg", active: 6, incidents: 0, coverage: 84 },
];

const priorityColor: Record<string, string> = { critical: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#10B981" };
const statusColor: Record<string, string> = { open: "#EF4444", responding: "#F59E0B", resolved: "#10B981" };

export function MarshallDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  if (!isOpen) return null;
  const active = INCIDENTS.filter(i => i.status !== "resolved").length;

  return (
    <DashboardShell
      title="Marshall Dashboard" subtitle="Devices — Field Operations"
      accentColor="#10B981" gradient="from-emerald-700 to-emerald-500"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} liveConnected userName="Commander H. Ndlovu" alertCount={active}
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Active Incidents" value={String(active)} icon={<AlertTriangle className="w-5 h-5" />} color="#EF4444" trend="up" />
          <StatCard label="Team On-Duty" value="4/5" icon={<Users className="w-5 h-5" />} color="#10B981" />
          <StatCard label="Zones Covered" value="5/5" icon={<MapPin className="w-5 h-5" />} color="#3B82F6" />
          <StatCard label="Response Time" value="4m 12s" icon={<Clock className="w-5 h-5" />} color="#F59E0B" trend="up" sub="Avg today" />
          <StatCard label="Resolved Today" value="12" icon={<CheckCircle className="w-5 h-5" />} color="#10B981" trend="up" />
          <StatCard label="SOS Active" value="1" icon={<Radio className="w-5 h-5" />} color="#DC2626" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            {/* Incidents */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#2D2A50" }}>
                <h3 className="text-sm font-bold text-white">Incident Feed</h3>
                <Badge text={`${active} active`} color="#EF4444" />
              </div>
              <div className="divide-y" style={{ borderColor: "#2D2A5033" }}>
                {INCIDENTS.map((inc, i) => (
                  <div key={i} className={`px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors ${inc.priority === "critical" ? "border-l-2" : ""}`}
                    style={{ borderLeftColor: inc.priority === "critical" ? "#EF4444" : "transparent" }}>
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: priorityColor[inc.priority] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[11px] font-bold text-white">{inc.type}</p>
                        <Badge text={inc.priority} color={priorityColor[inc.priority]} />
                      </div>
                      <p className="text-[9px] mt-0.5" style={{ color: "#8884AA" }}>{inc.id} · {inc.zone} · {inc.time}</p>
                      <p className="text-[9px] mt-0.5" style={{ color: "#6B7280" }}>Assigned: {inc.assigned}</p>
                    </div>
                    <Badge text={inc.status} color={statusColor[inc.status]} />
                  </div>
                ))}
              </div>
            </div>

            {/* Zone status */}
            <TableCard
              title="Zone Coverage"
              color="#10B981"
              columns={["Zone", "Active Units", "Incidents", "Coverage"]}
              rows={ZONES.map(z => [
                z.name,
                <span style={{ color: "#10B981" }}>{z.active}</span>,
                <Badge text={String(z.incidents)} color={z.incidents > 0 ? "#EF4444" : "#10B981"} />,
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "#2D2A50", minWidth: 60 }}>
                    <div className="h-full rounded-full" style={{ width: `${z.coverage}%`, background: z.coverage > 85 ? "#10B981" : "#F59E0B" }} />
                  </div>
                  <span style={{ color: z.coverage > 85 ? "#10B981" : "#F59E0B" }}>{z.coverage}%</span>
                </div>,
              ])}
            />
          </div>

          <div className="space-y-4">
            <SectionPanel title="Team Status">
              <div className="space-y-2.5">
                {TEAM.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "#252245", border: "1px solid #3D3A6A" }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: m.status === "on-duty" ? "#10B98122" : m.status === "responding" ? "#F59E0B22" : "#2D2A50", color: m.status === "on-duty" ? "#10B981" : m.status === "responding" ? "#F59E0B" : "#6B7280" }}>
                      <Shield className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-white truncate">{m.name}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>{m.zone}</p>
                    </div>
                    <div className="text-right">
                      <Badge text={m.status} color={m.status === "on-duty" ? "#10B981" : m.status === "responding" ? "#F59E0B" : "#6B7280"} />
                      {m.incidents > 0 && <p className="text-[9px] mt-0.5" style={{ color: "#EF4444" }}>{m.incidents} incidents</p>}
                    </div>
                  </div>
                ))}
              </div>
            </SectionPanel>

            <SectionPanel title="Quick Actions">
              <div className="space-y-2">
                {[
                  { label: "Broadcast Alert", color: "#EF4444" },
                  { label: "Request Backup", color: "#F59E0B" },
                  { label: "Generate Report", color: "#3B82F6" },
                  { label: "Contact Control", color: "#10B981" },
                ].map((a, i) => (
                  <button key={i} className="w-full py-2.5 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: a.color + "22", border: `1px solid ${a.color}44`, color: a.color }}>
                    {a.label}
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
