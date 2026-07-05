import { useState } from "react";
import { Car, MapPin, AlertTriangle, Users, Zap, Activity, Navigation, Fuel, Settings, BarChart3, Shield, Home } from "lucide-react";
import { DashboardShell, StatCard, Badge, Sparkline, TableCard, SectionPanel, ProgressBar } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "Overview" },
  { icon: <MapPin className="w-4 h-4" />, label: "Live Map" },
  { icon: <Car className="w-4 h-4" />, label: "Fleet" },
  { icon: <Users className="w-4 h-4" />, label: "Drivers" },
  { icon: <AlertTriangle className="w-4 h-4" />, label: "Alerts", badge: 7 },
  { icon: <Navigation className="w-4 h-4" />, label: "Trips" },
  { icon: <Shield className="w-4 h-4" />, label: "Geofences" },
  { icon: <BarChart3 className="w-4 h-4" />, label: "Analytics" },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const VEHICLES = [
  { plate: "GP 12-34 AB", make: "Toyota Hilux", driver: "James Mokoena", fleet: "Delivery", status: "moving", speed: 82, fuel: 74, lat: -26.12, lng: 28.04 },
  { plate: "WC 56-78 CD", make: "Ford Ranger", driver: "Sarah Williams", fleet: "Executive", status: "idle", speed: 0, fuel: 92, lat: -33.92, lng: 18.41 },
  { plate: "KZN 90-12 EF", make: "VW Transporter", driver: "Themba Dube", fleet: "Field Ops", status: "moving", speed: 64, fuel: 41, lat: -29.86, lng: 31.02 },
  { plate: "EC 34-56 GH", make: "Isuzu D-Max", driver: "Priya Naidoo", fleet: "Maintenance", status: "stopped", speed: 0, fuel: 88, lat: -33.01, lng: 27.91 },
  { plate: "FS 78-90 IJ", make: "Mercedes Sprinter", driver: "Johan van Wyk", fleet: "Security", status: "moving", speed: 71, fuel: 55, lat: -29.12, lng: 26.21 },
  { plate: "LP 11-22 KL", make: "Nissan NP300", driver: "Mpho Sithole", fleet: "Delivery", status: "offline", speed: 0, fuel: 18, lat: -23.88, lng: 29.45 },
];

const ALERTS = [
  { id: 1, plate: "KZN 90-12 EF", type: "Low Fuel", severity: "warning", time: "4m ago" },
  { id: 2, plate: "GP 12-34 AB", type: "Speeding", severity: "critical", time: "11m ago" },
  { id: 3, plate: "LP 11-22 KL", type: "Offline", severity: "critical", time: "23m ago" },
  { id: 4, plate: "WC 56-78 CD", type: "Geofence Exit", severity: "warning", time: "35m ago" },
  { id: 5, plate: "FS 78-90 IJ", type: "Harsh Braking", severity: "info", time: "1h ago" },
];

const FLEET_GROUPS = [
  { name: "Delivery", total: 18, moving: 12, idle: 4, offline: 2, color: "#3B82F6" },
  { name: "Executive", total: 8, moving: 3, idle: 5, offline: 0, color: "#F59E0B" },
  { name: "Field Ops", total: 14, moving: 9, idle: 3, offline: 2, color: "#10B981" },
  { name: "Security", total: 10, moving: 8, idle: 2, offline: 0, color: "#EF4444" },
  { name: "Maintenance", total: 6, moving: 2, idle: 2, offline: 2, color: "#8B5CF6" },
];

const TRIPS_HISTORY = Array.from({ length: 24 }, (_, i) => 20 + Math.sin(i / 3) * 12 + Math.random() * 8);

const statusColor: Record<string, string> = { moving: "#10B981", idle: "#F59E0B", stopped: "#6B7280", offline: "#EF4444", maintenance: "#8B5CF6" };

export function VehicleTrackingDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  if (!isOpen) return null;

  const moving = VEHICLES.filter(v => v.status === "moving").length;
  const alerts = ALERTS.filter(a => a.severity === "critical").length;

  return (
    <DashboardShell
      title="Vehicle Tracking" subtitle="Guard Me — Fleet Management"
      accentColor="#EF4444" gradient="from-red-600 to-red-400"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} liveConnected alertCount={ALERTS.length}
    >
      <div className="p-5 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Total Vehicles" value="56" icon={<Car className="w-5 h-5" />} color="#EF4444" trend="up" />
          <StatCard label="Moving Now" value={String(moving)} icon={<Navigation className="w-5 h-5" />} color="#10B981" trend="up" />
          <StatCard label="Idle" value="16" icon={<Activity className="w-5 h-5" />} color="#F59E0B" />
          <StatCard label="Offline" value="4" icon={<Zap className="w-5 h-5" />} color="#6B7280" trend="down" />
          <StatCard label="Active Alerts" value={String(alerts)} icon={<AlertTriangle className="w-5 h-5" />} color="#DC2626" trend="up" />
          <StatCard label="Total Drivers" value="48" icon={<Users className="w-5 h-5" />} color="#8B5CF6" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          {/* Fleet map placeholder */}
          <div className="xl:col-span-2 space-y-4">
            {/* Map area */}
            <div className="rounded-xl overflow-hidden relative" style={{ background: "#1A1738", border: "1px solid #2D2A50", height: 280 }}>
              {/* SVG world map South Africa approximation */}
              <svg viewBox="0 0 600 280" className="w-full h-full" style={{ background: "linear-gradient(180deg,#1A2535 0%,#0F1A28 100%)" }}>
                {/* Grid lines */}
                {[0,1,2,3,4,5].map(i => <line key={i} x1="0" y1={i*56} x2="600" y2={i*56} stroke="#ffffff08" strokeWidth="1" />)}
                {[0,1,2,3,4,5,6,7,8,9].map(i => <line key={i} x1={i*67} y1="0" x2={i*67} y2="280" stroke="#ffffff08" strokeWidth="1" />)}
                {/* SA rough outline */}
                <path d="M 180 80 Q 200 60 280 55 Q 360 50 430 70 Q 480 85 500 110 Q 530 145 520 180 Q 500 220 460 245 Q 400 265 340 270 Q 280 272 230 255 Q 185 240 165 210 Q 140 175 150 145 Q 155 110 180 80Z"
                  fill="#1E3A2F" stroke="#2D5A45" strokeWidth="1.5" opacity="0.7" />
                {/* Vehicle dots */}
                {VEHICLES.map((v, i) => {
                  const x = ((v.lng - 16) / 24) * 540 + 30;
                  const y = ((v.lat + 35) / 15) * 220 + 20;
                  return (
                    <g key={i}>
                      <circle cx={x} cy={y} r="8" fill={statusColor[v.status] + "33"} className="animate-ping" style={{ animationDuration: "2s" }} />
                      <circle cx={x} cy={y} r="5" fill={statusColor[v.status]} stroke="white" strokeWidth="1.5" />
                      <text x={x + 8} y={y + 4} fontSize="8" fill="white" opacity="0.8">{v.plate.split(" ")[0]}</text>
                    </g>
                  );
                })}
                <text x="10" y="20" fontSize="11" fill="white" opacity="0.5" fontWeight="bold">South Africa</text>
                <text x="10" y="270" fontSize="9" fill="white" opacity="0.35">● Moving  ● Idle  ● Stopped  ● Offline</text>
              </svg>
              <div className="absolute top-3 right-3 flex gap-2">
                {["moving","idle","stopped","offline"].map(s => (
                  <div key={s} className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-semibold"
                    style={{ background: statusColor[s] + "22", color: statusColor[s], border: `1px solid ${statusColor[s]}44` }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor[s] }} />{s}
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicle table */}
            <TableCard
              title="Fleet — Live Status"
              color="#EF4444"
              columns={["Plate", "Vehicle", "Driver", "Fleet", "Speed", "Fuel", "Status"]}
              rows={VEHICLES.map(v => [
                <span className="font-mono text-[10px] text-white/90">{v.plate}</span>,
                v.make,
                v.driver,
                v.fleet,
                <span style={{ color: v.speed > 0 ? "#10B981" : "#8884AA" }}>{v.speed} km/h</span>,
                <div className="flex items-center gap-1">
                  <Fuel className="w-3 h-3" style={{ color: v.fuel < 25 ? "#EF4444" : "#8884AA" }} />
                  <span style={{ color: v.fuel < 25 ? "#EF4444" : "#10B981" }}>{v.fuel}%</span>
                </div>,
                <Badge text={v.status} color={statusColor[v.status]} />,
              ])}
            />
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Fleet breakdown */}
            <SectionPanel title="Fleet Groups">
              {FLEET_GROUPS.map(g => (
                <div key={g.name} className="mb-3">
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span className="text-white/80 font-medium">{g.name}</span>
                    <span style={{ color: "#8884AA" }}>{g.moving}/{g.total} moving</span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div className="rounded-l" style={{ flex: g.moving, background: g.color }} />
                    <div className="rounded-none" style={{ flex: g.idle, background: g.color + "66" }} />
                    <div className="rounded-r" style={{ flex: g.offline + 0.01, background: "#2D2A50" }} />
                  </div>
                </div>
              ))}
            </SectionPanel>

            {/* Active alerts */}
            <SectionPanel title="Active Alerts" action={<Badge text={`${ALERTS.length} active`} color="#EF4444" />}>
              <div className="space-y-2.5">
                {ALERTS.map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: "#2D2A5033" }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: a.severity === "critical" ? "#EF4444" : a.severity === "warning" ? "#F59E0B" : "#3B82F6" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-white">{a.type}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>{a.plate} · {a.time}</p>
                    </div>
                    <Badge text={a.severity} color={a.severity === "critical" ? "#EF4444" : a.severity === "warning" ? "#F59E0B" : "#3B82F6"} />
                  </div>
                ))}
              </div>
            </SectionPanel>

            {/* Trip history chart */}
            <SectionPanel title="Trips (24h)">
              <Sparkline values={TRIPS_HISTORY} color="#EF4444" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                <span>00:00</span><span>12:00</span><span>Now</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="text-center p-2 rounded-lg" style={{ background: "#252245" }}>
                  <p className="text-base font-black text-white">284</p>
                  <p className="text-[9px]" style={{ color: "#8884AA" }}>Trips Today</p>
                </div>
                <div className="text-center p-2 rounded-lg" style={{ background: "#252245" }}>
                  <p className="text-base font-black" style={{ color: "#10B981" }}>14,820 km</p>
                  <p className="text-[9px]" style={{ color: "#8884AA" }}>Total Distance</p>
                </div>
              </div>
            </SectionPanel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
