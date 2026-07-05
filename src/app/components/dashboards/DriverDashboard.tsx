import { useState } from "react";
import { User, Car, MapPin, Clock, TrendingUp, Star, FileText, Home, Bell, Settings, Navigation, DollarSign, Shield } from "lucide-react";
import { DashboardShell, StatCard, Badge, Sparkline, SectionPanel, ProgressBar } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "My Dashboard" },
  { icon: <Car className="w-4 h-4" />, label: "My Vehicle" },
  { icon: <Navigation className="w-4 h-4" />, label: "Current Trip" },
  { icon: <Clock className="w-4 h-4" />, label: "Trip History" },
  { icon: <DollarSign className="w-4 h-4" />, label: "Earnings" },
  { icon: <Star className="w-4 h-4" />, label: "Performance" },
  { icon: <FileText className="w-4 h-4" />, label: "Documents" },
  { icon: <Bell className="w-4 h-4" />, label: "Notifications", badge: 2 },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const RECENT_TRIPS = [
  { date: "Today 09:14", from: "Sandton City", to: "O.R. Tambo Airport", km: 28.4, duration: "42 min", status: "completed", earn: "R148" },
  { date: "Today 07:30", from: "Midrand Depot", to: "Sandton City", km: 18.2, duration: "28 min", status: "completed", earn: "R96" },
  { date: "Yesterday", from: "Cape Town CBD", to: "Bellville", km: 32.1, duration: "55 min", status: "completed", earn: "R174" },
  { date: "Yesterday", from: "V&A Waterfront", to: "Cape Town CBD", km: 6.4, duration: "18 min", status: "completed", earn: "R48" },
  { date: "2 days ago", from: "Paarl", to: "Stellenbosch", km: 22.0, duration: "34 min", status: "completed", earn: "R118" },
];

const EARNINGS_CHART = [820, 940, 710, 1100, 980, 1240, 1380, 920, 1050, 1190, 1320, 1480];
const PERF_METRICS = [
  { label: "Safety Score", value: 94, max: 100, color: "#10B981" },
  { label: "On-Time Rate", value: 91, max: 100, color: "#3B82F6" },
  { label: "Fuel Efficiency", value: 78, max: 100, color: "#F59E0B" },
  { label: "Customer Rating", value: 96, max: 100, color: "#8B5CF6" },
];

export function DriverDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("My Dashboard");
  if (!isOpen) return null;

  return (
    <DashboardShell
      title="Driver Dashboard" subtitle="Devices — Driver Account"
      accentColor="#3B82F6" gradient="from-blue-600 to-blue-400"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} liveConnected userName="James Mokoena"
    >
      <div className="p-5 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Trips Today" value="6" icon={<Navigation className="w-5 h-5" />} color="#3B82F6" trend="up" />
          <StatCard label="Earnings Today" value="R892" icon={<DollarSign className="w-5 h-5" />} color="#10B981" trend="up" sub="This month: R14,820" />
          <StatCard label="Distance Today" value="148 km" icon={<MapPin className="w-5 h-5" />} color="#F59E0B" />
          <StatCard label="Hours Active" value="6.4 hrs" icon={<Clock className="w-5 h-5" />} color="#8B5CF6" />
          <StatCard label="Driver Rating" value="4.92 ★" icon={<Star className="w-5 h-5" />} color="#F59E0B" trend="up" />
          <StatCard label="Safety Score" value="94/100" icon={<Shield className="w-5 h-5" />} color="#10B981" trend="up" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            {/* Current vehicle status */}
            <div className="rounded-xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Assigned Vehicle</h3>
                <Badge text="Active" color="#10B981" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Plate", value: "GP 12-34 AB", icon: <Car className="w-4 h-4" /> },
                  { label: "Vehicle", value: "Toyota Hilux", icon: <Car className="w-4 h-4" /> },
                  { label: "Fuel", value: "74%", icon: <TrendingUp className="w-4 h-4" /> },
                  { label: "Odometer", value: "84,210 km", icon: <Navigation className="w-4 h-4" /> },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl p-3 text-center" style={{ background: "#252245", border: "1px solid #3D3A6A" }}>
                    <div className="flex justify-center mb-1.5" style={{ color: "#3B82F6" }}>{item.icon}</div>
                    <p className="text-xs font-bold text-white">{item.value}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "#8884AA" }}>{item.label}</p>
                  </div>
                ))}
              </div>
              {/* Fuel bar */}
              <div className="mt-4">
                <div className="flex justify-between text-[11px] mb-1">
                  <span style={{ color: "#8884AA" }}>Fuel Level</span>
                  <span style={{ color: "#10B981" }}>74% — Adequate</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: "#2D2A50" }}>
                  <div className="h-full rounded-full" style={{ width: "74%", background: "linear-gradient(90deg,#10B981,#34D399)" }} />
                </div>
              </div>
            </div>

            {/* Recent trips */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "#2D2A50" }}>
                <h3 className="text-sm font-bold text-white">Recent Trips</h3>
              </div>
              <div className="divide-y" style={{ borderColor: "#2D2A5033" }}>
                {RECENT_TRIPS.map((t, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "#3B82F622", color: "#3B82F6" }}>
                      <Navigation className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-white truncate">{t.from} → {t.to}</p>
                      <p className="text-[9px] mt-0.5" style={{ color: "#8884AA" }}>{t.date} · {t.km} km · {t.duration}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold" style={{ color: "#10B981" }}>{t.earn}</p>
                      <Badge text={t.status} color="#10B981" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Performance */}
            <SectionPanel title="Performance Scores">
              {PERF_METRICS.map(m => (
                <ProgressBar key={m.label} label={m.label} value={m.value} max={m.max} color={m.color} />
              ))}
            </SectionPanel>

            {/* Earnings chart */}
            <SectionPanel title="Earnings (12 months)">
              <Sparkline values={EARNINGS_CHART} color="#3B82F6" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                <span>Jan</span><span>Jun</span><span>Dec</span>
              </div>
              <div className="mt-3 text-center p-3 rounded-xl" style={{ background: "#252245" }}>
                <p className="text-xl font-black text-white">R178,640</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#8884AA" }}>Total earnings this year</p>
              </div>
            </SectionPanel>

            {/* Documents */}
            <SectionPanel title="My Documents">
              {[
                { name: "Driver's License", expiry: "2026-08-14", ok: true },
                { name: "PDP Certificate", expiry: "2025-12-01", ok: true },
                { name: "Vehicle Licence", expiry: "2025-09-30", ok: false },
                { name: "Insurance", expiry: "2026-03-15", ok: true },
              ].map((doc, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "#2D2A5033" }}>
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" style={{ color: "#8884AA" }} />
                    <p className="text-[11px] text-white">{doc.name}</p>
                  </div>
                  <div className="text-right">
                    <Badge text={doc.ok ? "Valid" : "Expiring"} color={doc.ok ? "#10B981" : "#F59E0B"} />
                    <p className="text-[9px] mt-0.5" style={{ color: "#8884AA" }}>{doc.expiry}</p>
                  </div>
                </div>
              ))}
            </SectionPanel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
