import { useState } from "react";
import { Briefcase, Car, Users, DollarSign, Wrench, BarChart3, FileText, Bell, Settings, Home, TrendingUp, AlertTriangle } from "lucide-react";
import { DashboardShell, StatCard, Badge, Sparkline, SectionPanel, ProgressBar, TableCard } from "./DashboardShell";
import { BRAND } from "../../brand";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "Overview" },
  { icon: <Car className="w-4 h-4" />, label: "My Fleet" },
  { icon: <Users className="w-4 h-4" />, label: "My Drivers" },
  { icon: <DollarSign className="w-4 h-4" />, label: "Revenue" },
  { icon: <Wrench className="w-4 h-4" />, label: "Maintenance" },
  { icon: <BarChart3 className="w-4 h-4" />, label: "Analytics" },
  { icon: <FileText className="w-4 h-4" />, label: "Documents" },
  { icon: <Bell className="w-4 h-4" />, label: "Notifications", badge: 4 },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const MY_FLEET = [
  { plate: "GP 12-34 AB", make: "Toyota Hilux 2022", driver: "James Mokoena", trips: 284, revenue: "R24,800", status: "active", maintenance: "2025-08-14" },
  { plate: "WC 56-78 CD", make: "Ford Ranger 2021", driver: "Unassigned", trips: 0, revenue: "R0", status: "idle", maintenance: "2025-06-30" },
  { plate: "KZN 90-12 EF", make: "VW Transporter 2023", driver: "Themba Dube", trips: 198, revenue: "R18,200", status: "active", maintenance: "2025-09-01" },
  { plate: "LP 11-22 KL", make: "Nissan NP300 2020", driver: "Mpho Sithole", trips: 142, revenue: "R12,400", status: "maintenance", maintenance: "IN PROGRESS" },
];

const REVENUE = [12400, 14800, 11200, 16400, 15200, 18400, 17800, 19200, 18600, 21200, 20400, 24800];
const DRIVER_PERF = [
  { name: "James Mokoena", rating: 4.92, trips: 284, earn: "R24,800" },
  { name: "Themba Dube", rating: 4.78, trips: 198, earn: "R18,200" },
  { name: "Mpho Sithole", rating: 4.65, trips: 142, earn: "R12,400" },
];

export function OwnersDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  if (!isOpen) return null;

  return (
    <DashboardShell
      title="Owner Dashboard" subtitle="Devices — Fleet Owner Account"
      accentColor={BRAND.gold} gradient="from-emerald-700 to-emerald-500"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} userName="Victor Nkosi" alertCount={4}
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Total Vehicles" value="4" icon={<Car className="w-5 h-5" />} color="#34A853" />
          <StatCard label="Active Drivers" value="3/4" icon={<Users className="w-5 h-5" />} color={BRAND.ok} />
          <StatCard label="Monthly Revenue" value="R55,400" icon={<DollarSign className="w-5 h-5" />} color={BRAND.warn} trend="up" sub="+12% vs last month" />
          <StatCard label="Total Trips" value="624" icon={<Briefcase className="w-5 h-5" />} color={BRAND.info} trend="up" />
          <StatCard label="Due Maintenance" value="2" icon={<Wrench className="w-5 h-5" />} color={BRAND.bad} />
          <StatCard label="Avg Fleet Rating" value="4.78 ★" icon={<TrendingUp className="w-5 h-5" />} color={BRAND.warn} trend="up" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            <div className="rounded-xl p-5" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-fg">Monthly Revenue Trend</h3>
                <Badge text="+12% MoM" color={BRAND.ok} />
              </div>
              <Sparkline values={REVENUE} color="#34A853" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "var(--vk-fg-muted)" }}>
                <span>Jan</span><span>Jun</span><span>Dec</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[{ label: "This Month", val: "R55,400", color: "#34A853" }, { label: "Last Month", val: "R49,400", color: "#6B7280" }, { label: "Annual", val: "R494,000", color: BRAND.warn }].map((s, i) => (
                  <div key={i} className="text-center p-2.5 rounded-xl" style={{ background: "#252245" }}>
                    <p className="text-sm font-black" style={{ color: s.color }}>{s.val}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "var(--vk-fg-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <TableCard
              title="Fleet Overview"
              color="#34A853"
              columns={["Plate", "Vehicle", "Driver", "Trips", "Revenue", "Status"]}
              rows={MY_FLEET.map(v => [
                <span className="font-mono text-[10px]">{v.plate}</span>,
                v.make,
                v.driver,
                String(v.trips),
                <span style={{ color: BRAND.ok }}>{v.revenue}</span>,
                <Badge text={v.status} color={v.status === "active" ? BRAND.ok : v.status === "idle" ? BRAND.warn : BRAND.bad} />,
              ])}
            />

            <TableCard
              title="Driver Performance"
              color="#34A853"
              columns={["Driver", "Rating", "Trips", "Earnings"]}
              rows={DRIVER_PERF.map(d => [
                d.name,
                <span style={{ color: BRAND.warn }}>{d.rating} ★</span>,
                String(d.trips),
                <span style={{ color: BRAND.ok }}>{d.earn}</span>,
              ])}
            />
          </div>

          <div className="space-y-4">
            <SectionPanel title="Maintenance Schedule">
              {MY_FLEET.map((v, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0" style={{ borderColor: "var(--vk-line)33" }}>
                  <div>
                    <p className="text-[11px] font-semibold text-fg">{v.plate}</p>
                    <p className="text-[9px]" style={{ color: "var(--vk-fg-muted)" }}>{v.make.split(" ")[0]} {v.make.split(" ")[1]}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold" style={{ color: v.status === "maintenance" ? BRAND.bad : BRAND.warn }}>{v.maintenance}</p>
                    <Badge text={v.status === "maintenance" ? "In Workshop" : "Upcoming"} color={v.status === "maintenance" ? BRAND.bad : BRAND.warn} />
                  </div>
                </div>
              ))}
            </SectionPanel>

            <SectionPanel title="Fleet Health">
              <ProgressBar label="Active Rate" value={75} max={100} color={BRAND.ok} />
              <ProgressBar label="Utilisation" value={68} max={100} color={BRAND.info} />
              <ProgressBar label="Maintenance Due" value={50} max={100} color={BRAND.bad} />
              <ProgressBar label="Driver Coverage" value={75} max={100} color="#34A853" />
            </SectionPanel>

            <SectionPanel title="Recent Alerts" action={<Badge text="4" color={BRAND.bad} />}>
              {[
                { msg: "Nissan NP300 in workshop", color: BRAND.bad },
                { msg: "Ford Ranger driver unassigned", color: BRAND.warn },
                { msg: "WC 56-78 CD fuel below 20%", color: BRAND.warn },
                { msg: "Insurance renewal due Jun 30", color: BRAND.info },
              ].map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b last:border-0" style={{ borderColor: "var(--vk-line)33" }}>
                  <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0" style={{ background: a.color }} />
                  <p className="text-[10px] text-fg">{a.msg}</p>
                </div>
              ))}
            </SectionPanel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
