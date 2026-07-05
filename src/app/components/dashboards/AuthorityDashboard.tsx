import { useState } from "react";
import { Eye, Shield, AlertTriangle, Activity, FileText, Users, Lock, Bell, Settings, Home, Radio, CheckCircle, BarChart3 } from "lucide-react";
import { DashboardShell, StatCard, Badge, Sparkline, SectionPanel, TableCard, ProgressBar } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "Overview" },
  { icon: <Activity className="w-4 h-4" />, label: "Live Feed", badge: 4 },
  { icon: <AlertTriangle className="w-4 h-4" />, label: "Incidents" },
  { icon: <Eye className="w-4 h-4" />, label: "Surveillance" },
  { icon: <Shield className="w-4 h-4" />, label: "Compliance" },
  { icon: <Users className="w-4 h-4" />, label: "Entities" },
  { icon: <FileText className="w-4 h-4" />, label: "Reports" },
  { icon: <Lock className="w-4 h-4" />, label: "Intercepts" },
  { icon: <BarChart3 className="w-4 h-4" />, label: "Analytics" },
  { icon: <Bell className="w-4 h-4" />, label: "Alerts", badge: 4 },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const INCIDENTS = [
  { id: "INC-2041", type: "Unauthorized Data Access", entity: "MVNO Subscriber 65501000042", severity: "critical", status: "investigating", time: "6m ago" },
  { id: "INC-2040", type: "Fraud Pattern Detected", entity: "MSISDN +27821234567", severity: "critical", status: "flagged", time: "22m ago" },
  { id: "INC-2039", type: "Geofence Breach — Restricted Zone", entity: "Vehicle GP 12-34 AB", severity: "warning", status: "monitoring", time: "41m ago" },
  { id: "INC-2038", type: "Excessive API Calls", entity: "Merchant Portal API Key", severity: "warning", status: "resolved", time: "1h ago" },
  { id: "INC-2036", type: "Lawful Intercept Activated", entity: "WARRANT-2024002", severity: "info", status: "active", time: "3h ago" },
];

const COMPLIANCE = [
  { module: "MVNO Network", score: 98, auditor: "Telco Regulator", date: "2024-12-01", status: "passed" },
  { module: "Vehicle Tracking", score: 95, auditor: "RTIA", date: "2024-11-15", status: "passed" },
  { module: "Financial Services", score: 92, auditor: "FSCA", date: "2024-10-01", status: "passed" },
  { module: "Data Protection (POPIA)", score: 96, auditor: "Information Regulator", date: "2024-12-10", status: "passed" },
  { module: "Merchant Platform", score: 88, auditor: "NCR", date: "2024-09-20", status: "conditional" },
];

const EVENT_CHART = Array.from({ length: 24 }, (_, i) => 20 + Math.sin(i / 2) * 15 + Math.random() * 10);

const sevColor: Record<string, string> = { critical: "#EF4444", warning: "#F59E0B", info: "#3B82F6" };
const statColor: Record<string, string> = { investigating: "#EF4444", flagged: "#DC2626", monitoring: "#F59E0B", resolved: "#10B981", active: "#3B82F6" };

export function AuthorityDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  if (!isOpen) return null;

  return (
    <DashboardShell
      title="Authority Monitoring" subtitle="Security — Compliance & Surveillance"
      accentColor="#059669" gradient="from-emerald-800 to-teal-600"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} liveConnected userName="Compliance Officer" alertCount={4}
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Active Incidents" value="4" icon={<AlertTriangle className="w-5 h-5" />} color="#EF4444" trend="up" />
          <StatCard label="Entities Monitored" value="2,401" icon={<Eye className="w-5 h-5" />} color="#059669" />
          <StatCard label="Compliance Score" value="94%" icon={<Shield className="w-5 h-5" />} color="#10B981" trend="up" />
          <StatCard label="Active Intercepts" value="4" icon={<Lock className="w-5 h-5" />} color="#8B5CF6" />
          <StatCard label="Reports Pending" value="3" icon={<FileText className="w-5 h-5" />} color="#F59E0B" />
          <StatCard label="System Events (24h)" value="12,840" icon={<Activity className="w-5 h-5" />} color="#3B82F6" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            {/* Live event feed */}
            <div className="rounded-xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  System Event Stream (24h)
                </h3>
                <Badge text="LIVE" color="#059669" />
              </div>
              <Sparkline values={EVENT_CHART} color="#059669" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Now</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[{ l: "Auth Events", v: "4,820", c: "#059669" }, { l: "Data Access", v: "3,214", c: "#3B82F6" }, { l: "Fraud Checks", v: "2,840", c: "#F59E0B" }, { l: "Anomalies", v: "12", c: "#EF4444" }].map((s, i) => (
                  <div key={i} className="text-center p-2 rounded-xl" style={{ background: "#252245" }}>
                    <p className="text-sm font-black" style={{ color: s.c }}>{s.v}</p>
                    <p className="text-[8px] mt-0.5" style={{ color: "#8884AA" }}>{s.l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Incidents */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#2D2A50" }}>
                <h3 className="text-sm font-bold text-white">Security Incidents</h3>
                <Badge text="4 active" color="#EF4444" />
              </div>
              <div className="divide-y" style={{ borderColor: "#2D2A5033" }}>
                {INCIDENTS.map((inc, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors">
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: sevColor[inc.severity] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[11px] font-bold text-white">{inc.type}</p>
                        <Badge text={inc.severity} color={sevColor[inc.severity]} />
                      </div>
                      <p className="text-[9px] mt-0.5" style={{ color: "#8884AA" }}>{inc.id} · {inc.entity} · {inc.time}</p>
                    </div>
                    <Badge text={inc.status} color={statColor[inc.status]} />
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance audit table */}
            <TableCard
              title="Compliance Audits"
              color="#059669"
              columns={["Module", "Score", "Auditor", "Last Audit", "Status"]}
              rows={COMPLIANCE.map(c => [
                c.module,
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 rounded-full" style={{ background: "#2D2A50" }}>
                    <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: c.score >= 95 ? "#10B981" : c.score >= 85 ? "#F59E0B" : "#EF4444" }} />
                  </div>
                  <span style={{ color: c.score >= 95 ? "#10B981" : "#F59E0B" }}>{c.score}%</span>
                </div>,
                c.auditor,
                c.date,
                <Badge text={c.status} color={c.status === "passed" ? "#10B981" : "#F59E0B"} />,
              ])}
            />
          </div>

          <div className="space-y-4">
            <SectionPanel title="Compliance Overview">
              {COMPLIANCE.map(c => (
                <ProgressBar key={c.module} label={c.module.split(" ")[0]} value={c.score} max={100}
                  color={c.score >= 95 ? "#10B981" : c.score >= 85 ? "#F59E0B" : "#EF4444"} />
              ))}
            </SectionPanel>

            <SectionPanel title="Active Intercepts">
              <div className="space-y-2.5">
                {[
                  { warrant: "WARRANT-2024001", auth: "SAPS", type: "Voice + SMS", expires: "2025-03-15" },
                  { warrant: "WARRANT-2024002", auth: "NPA", type: "All Data", expires: "2025-04-01" },
                  { warrant: "WARRANT-2024003", auth: "SSA", type: "Data", expires: "2025-02-28" },
                  { warrant: "WARRANT-2024004", auth: "HAWKS", type: "Voice", expires: "2025-03-30" },
                ].map((li, i) => (
                  <div key={i} className="p-2.5 rounded-xl" style={{ background: "#252245", border: "1px solid #3D3A6A" }}>
                    <div className="flex justify-between items-start">
                      <p className="text-[10px] font-bold" style={{ color: "#059669" }}>{li.warrant}</p>
                      <Badge text="Active" color="#059669" />
                    </div>
                    <p className="text-[9px] mt-0.5" style={{ color: "#8884AA" }}>{li.auth} · {li.type}</p>
                    <p className="text-[9px]" style={{ color: "#5A5880" }}>Expires {li.expires}</p>
                  </div>
                ))}
              </div>
            </SectionPanel>

            <SectionPanel title="Quick Reports">
              <div className="space-y-2">
                {["Daily Incident Report", "Weekly Compliance Summary", "Fraud Analytics Report", "Data Access Audit Log", "Intercept Status Report"].map((r, i) => (
                  <button key={i} className="w-full flex items-center gap-2 py-2 px-3 rounded-xl text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors text-left"
                    style={{ border: "1px solid #2D2A50" }}>
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#059669" }} />
                    {r}
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
