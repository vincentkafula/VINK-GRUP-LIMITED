import { useState } from "react";
import { AlertTriangle, MapPin, Car, Bell, User, Settings, ChevronRight, Zap, Clock, CheckCircle } from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";

type Screen = "map" | "fleet" | "alerts" | "driver" | "settings";

const VEHICLES = [
  { reg: "CA 847-891", driver: "Sipho Dlamini",   status: "Online", speed: 68, location: "De Waal Dr, Gardens",       ping: "1m ago" },
  { reg: "CA 312-554", driver: "Thabo Nkosi",     status: "Idle",   speed: 0,  location: "Claremont Station",         ping: "3m ago" },
  { reg: "CA 991-223", driver: "Priya Naidoo",    status: "Online", speed: 45, location: "Main Rd, Observatory",      ping: "1m ago" },
  { reg: "CA 445-881", driver: "James van Berg",  status: "Alert",  speed: 0,  location: "Milnerton Industrial",      ping: "2m ago" },
  { reg: "CA 772-339", driver: "Lindiwe Mokoena", status: "Online", speed: 72, location: "N2 Freeway, Muizenberg",    ping: "0m ago" },
  { reg: "CA 118-667", driver: "Sipho Khumalo",   status: "Online", speed: 31, location: "Long St, Cape Town CBD",    ping: "2m ago" },
  { reg: "CA 893-445", driver: "Amahle Zulu",     status: "Idle",   speed: 0,  location: "Sea Point Beachfront",      ping: "5m ago" },
  { reg: "CA 221-998", driver: "Bongani Mthembu", status: "Online", speed: 58, location: "Bellville Taxi Rank",       ping: "1m ago" },
];

const ALERTS = [
  { reg: "CA 445-881", msg: "left geofence boundary",    severity: "Critical", time: "2min ago" },
  { reg: "CA 312-554", msg: "engine idle >30min",         severity: "Warning",  time: "8min ago" },
  { reg: "CA 772-339", msg: "speeding 92km/h in zone 60", severity: "Critical", time: "5min ago" },
  { reg: "CA 893-445", msg: "low battery 8%",             severity: "Warning",  time: "15min ago" },
  { reg: "CA 118-667", msg: "harsh braking event",        severity: "Warning",  time: "22min ago" },
];

const MAP_DOTS = [
  { x: 30, y: 40, status: "Online", reg: "CA 847-891" },
  { x: 60, y: 25, status: "Online", reg: "CA 772-339" },
  { x: 75, y: 60, status: "Alert",  reg: "CA 445-881" },
  { x: 20, y: 70, status: "Idle",   reg: "CA 312-554" },
  { x: 50, y: 80, status: "Online", reg: "CA 991-223" },
];

const statusColor = (s: string) =>
  s === "Online" ? "#10B981" : s === "Idle" ? "#F59E0B" : "#EF4444";

function MapScreen() {
  return (
    <div className="flex flex-col h-full" style={{ background: "#0B1426" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: "#0F1E3A" }}>
        <div>
          <p className="text-xs text-gray-400">Fleet Management</p>
          <p className="text-white font-bold text-base">Live Fleet — 47 vehicles</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 text-xs font-semibold">LIVE</span>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative overflow-hidden mx-3 mt-2 rounded-2xl" style={{ background: "#111C2F" }}>
        {/* SVG grid */}
        <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#10B981" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
          {/* Road lines */}
          <line x1="0" y1="45%" x2="100%" y2="55%" stroke="#1E3A5F" strokeWidth="4"/>
          <line x1="35%" y1="0" x2="45%" y2="100%" stroke="#1E3A5F" strokeWidth="4"/>
          <line x1="0" y1="75%" x2="100%" y2="70%" stroke="#1E3A5F" strokeWidth="3"/>
        </svg>

        {/* Vehicle dots */}
        {MAP_DOTS.map((dot) => (
          <div
            key={dot.reg}
            className="absolute flex flex-col items-center"
            style={{ left: `${dot.x}%`, top: `${dot.y}%`, transform: "translate(-50%,-50%)" }}
          >
            <div
              className="w-4 h-4 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
              style={{ background: statusColor(dot.status) }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
            <span
              className="text-white text-[8px] font-bold mt-0.5 px-1 py-0.5 rounded"
              style={{ background: "rgba(0,0,0,0.7)" }}
            >
              {dot.reg.replace("CA ", "")}
            </span>
          </div>
        ))}

        {/* Legend */}
        <div
          className="absolute top-3 right-3 rounded-xl p-2 flex flex-col gap-1"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
        >
          {[["Online","#10B981"],["Idle","#F59E0B"],["Alert","#EF4444"]].map(([l,c]) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-white text-[9px]">{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Overlay cards */}
      <div className="flex gap-2 px-3 mt-2 mb-2">
        <div className="flex-1 rounded-xl p-3" style={{ background: "#0F1E3A" }}>
          <p className="text-gray-400 text-[10px] mb-0.5">Fleet Status</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-green-400 font-bold text-xs">28 Online</span>
            <span className="text-gray-500 text-xs">·</span>
            <span className="text-amber-400 font-bold text-xs">12 Idle</span>
            <span className="text-gray-500 text-xs">·</span>
            <span className="text-red-400 font-bold text-xs">7 Alert</span>
          </div>
        </div>
        <div className="flex-1 rounded-xl p-3" style={{ background: "#0F1E3A" }}>
          <p className="text-gray-400 text-[10px] mb-0.5">Average Speed</p>
          <p className="text-white font-bold text-base">42 <span className="text-gray-400 text-xs font-normal">km/h</span></p>
        </div>
      </div>
    </div>
  );
}

function FleetScreen() {
  return (
    <div className="flex flex-col h-full" style={{ background: "#0B1426" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: "#0F1E3A" }}>
        <p className="text-white font-bold text-base">Fleet Overview</p>
        <p className="text-gray-400 text-xs">8 of 47 shown · updated now</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {VEHICLES.map((v) => (
          <div key={v.reg} className="rounded-xl p-3 flex items-center gap-3" style={{ background: "#0F1E3A" }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: statusColor(v.status) + "22", border: `2px solid ${statusColor(v.status)}` }}
            >
              <Car className="w-4 h-4" style={{ color: statusColor(v.status) }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-white font-bold text-xs">{v.reg}</span>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: statusColor(v.status) + "22", color: statusColor(v.status) }}
                >
                  {v.status}
                </span>
              </div>
              <p className="text-gray-400 text-[10px] truncate">{v.driver}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-gray-300 text-[10px]">{v.speed} km/h</span>
                <span className="text-gray-600 text-[10px]">·</span>
                <span className="text-gray-400 text-[10px] truncate">{v.location}</span>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-gray-500 text-[9px]">{v.ping}</p>
              <ChevronRight className="w-3 h-3 text-gray-600 mt-1 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsScreen({ resolved, setResolved }: { resolved: number[]; setResolved: (ids: number[]) => void }) {
  return (
    <div className="flex flex-col h-full" style={{ background: "#0B1426" }}>
      <div className="px-4 py-3 flex-shrink-0 flex items-center justify-between" style={{ background: "#0F1E3A" }}>
        <div>
          <p className="text-white font-bold text-base">Active Alerts</p>
          <p className="text-gray-400 text-xs">{ALERTS.length - resolved.length} unresolved</p>
        </div>
        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">{ALERTS.length - resolved.length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {ALERTS.map((a, i) => (
          <div
            key={i}
            className="rounded-xl p-3"
            style={{
              background: resolved.includes(i) ? "#0F1E3A" : a.severity === "Critical" ? "#2A0F0F" : "#1F1A0A",
              border: `1px solid ${resolved.includes(i) ? "#1E3A5F" : a.severity === "Critical" ? "#7F1D1D" : "#78350F"}`,
              opacity: resolved.includes(i) ? 0.5 : 1,
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: a.severity === "Critical" ? "#EF444433" : "#F59E0B33" }}
              >
                <AlertTriangle
                  className="w-4 h-4"
                  style={{ color: a.severity === "Critical" ? "#EF4444" : "#F59E0B" }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: a.severity === "Critical" ? "#EF444422" : "#F59E0B22",
                      color: a.severity === "Critical" ? "#EF4444" : "#F59E0B",
                    }}
                  >
                    {a.severity}
                  </span>
                  <span className="text-gray-500 text-[9px]">{a.time}</span>
                </div>
                <p className="text-white font-semibold text-xs mt-1">{a.reg}</p>
                <p className="text-gray-300 text-[11px]">{a.msg}</p>
              </div>
            </div>
            {!resolved.includes(i) && (
              <button
                onClick={() => setResolved([...resolved, i])}
                className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: "#10B98122", color: "#10B981", border: "1px solid #10B98144" }}
              >
                ✓ Resolve
              </button>
            )}
            {resolved.includes(i) && (
              <div className="mt-2 flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span className="text-green-500 text-[10px]">Resolved</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DriverScreen() {
  const pickups = [
    { time: "07:12", from: "Salt River", to: "CBD", fare: "R48.00" },
    { time: "08:34", from: "Woodstock", to: "Green Point", fare: "R62.00" },
    { time: "09:55", from: "Observatory", to: "Groote Schuur", fare: "R34.00" },
    { time: "11:20", from: "Mowbray", to: "Rondebosch", fare: "R41.00" },
    { time: "12:48", from: "Claremont", to: "Newlands", fare: "R29.00" },
  ];
  return (
    <div className="flex flex-col h-full" style={{ background: "#0B1426" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: "#0F1E3A" }}>
        <p className="text-white font-bold text-base">Driver Profile</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Profile card */}
        <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,#0F3460,#10B981)" }}>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/40">
              <span className="text-white text-lg font-bold">SD</span>
            </div>
            <div>
              <p className="text-white font-bold text-base">Sipho Dlamini</p>
              <p className="text-white/70 text-xs">License: WC-4821-B · Class C</p>
              <div className="flex items-center gap-1 mt-1">
                {[1,2,3,4,5].map(s => (
                  <svg key={s} viewBox="0 0 12 12" className="w-3 h-3 fill-amber-400"><polygon points="6,1 7.5,4.5 11,5 8.5,7.5 9.2,11 6,9 2.8,11 3.5,7.5 1,5 4.5,4.5"/></svg>
                ))}
                <span className="text-white/80 text-xs ml-1">4.8</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="text-center">
              <p className="text-white font-bold text-base">94%</p>
              <p className="text-white/60 text-[10px]">Acceptance</p>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-base">12</p>
              <p className="text-white/60 text-[10px]">Trips Today</p>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-base">6.5h</p>
              <p className="text-white/60 text-[10px]">Online</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[["R847","Earnings","#10B981"],["184km","Distance","#3B82F6"],["6.5h","Hours","#F59E0B"]].map(([v,l,c]) => (
            <div key={l} className="rounded-xl p-3 text-center" style={{ background: "#0F1E3A" }}>
              <p className="font-bold text-sm" style={{ color: c }}>{v}</p>
              <p className="text-gray-400 text-[10px]">{l}</p>
            </div>
          ))}
        </div>

        {/* Activity log */}
        <div className="rounded-2xl p-3" style={{ background: "#0F1E3A" }}>
          <p className="text-gray-400 text-xs font-semibold mb-2">Today's Pickups</p>
          <div className="space-y-2">
            {pickups.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-10 flex-shrink-0">
                  <p className="text-gray-500 text-[10px]">{p.time}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 text-[11px] truncate">{p.from} → {p.to}</p>
                </div>
                <span className="text-green-400 text-[11px] font-bold flex-shrink-0">{p.fare}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsScreen() {
  const [geo, setGeo] = useState(true);
  const [speedAlert, setSpeedAlert] = useState(true);
  const [battAlert, setBattAlert] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [speedLimit, setSpeedLimit] = useState(80);
  const [battThreshold, setBattThreshold] = useState(15);

  return (
    <div className="flex flex-col h-full" style={{ background: "#0B1426" }}>
      <div className="px-4 py-3 flex-shrink-0" style={{ background: "#0F1E3A" }}>
        <p className="text-white font-bold text-base">Settings</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Toggles */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0F1E3A" }}>
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider px-4 pt-3 pb-1">Alerts</p>
          {[
            ["Geofence Alerts", geo, setGeo],
            ["Speed Limit Alerts", speedAlert, setSpeedAlert],
            ["Battery Alerts", battAlert, setBattAlert],
            ["Push Notifications", pushNotif, setPushNotif],
          ].map(([label, val, setter]) => (
            <div key={label as string} className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="text-gray-200 text-sm">{label as string}</span>
              <button
                onClick={() => (setter as (v: boolean) => void)(!(val as boolean))}
                className="w-11 h-6 rounded-full transition-colors relative"
                style={{ background: val ? "#10B981" : "#374151" }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 transition-all"
                  style={{ left: val ? "calc(100% - 22px)" : "2px" }}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Sliders */}
        <div className="rounded-2xl p-4 space-y-4" style={{ background: "#0F1E3A" }}>
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Thresholds</p>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-200 text-xs">Speed Limit</span>
              <span className="text-green-400 text-xs font-bold">{speedLimit} km/h</span>
            </div>
            <input
              type="range" min="40" max="140" value={speedLimit}
              onChange={e => setSpeedLimit(Number(e.target.value))}
              className="w-full accent-green-500"
            />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-200 text-xs">Battery Alert At</span>
              <span className="text-green-400 text-xs font-bold">{battThreshold}%</span>
            </div>
            <input
              type="range" min="5" max="50" value={battThreshold}
              onChange={e => setBattThreshold(Number(e.target.value))}
              className="w-full accent-green-500"
            />
          </div>
        </div>

        {/* Device info */}
        <div className="rounded-2xl p-4 space-y-2" style={{ background: "#0F1E3A" }}>
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-2">Device Info</p>
          {[["Fleet Unit ID","VMS-FCT-0047"],["Firmware","v3.2.1"],["Last Sync","2 min ago"],["SIM","MTN Fleet 087-234-5678"]].map(([k,v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-gray-400 text-xs">{k}</span>
              <span className="text-gray-200 text-xs font-medium">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VehicleTrackingApp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>("map");
  const [resolvedAlerts, setResolvedAlerts] = useState<number[]>([]);

  if (!isOpen) return null;

  const TABS: { id: Screen; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "map",      label: "Map",     icon: <MapPin className="w-5 h-5" /> },
    { id: "fleet",    label: "Fleet",   icon: <Car className="w-5 h-5" /> },
    { id: "alerts",   label: "Alerts",  icon: <Bell className="w-5 h-5" />, badge: ALERTS.length - resolvedAlerts.length },
    { id: "driver",   label: "Driver",  icon: <User className="w-5 h-5" /> },
    { id: "settings", label: "Settings",icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <MobileAppOverlay onClose={onClose} appName="Fleet Tracker" bgColor="#0B1426">
      <PhoneFrame statusBarColor="#0F1E3A" statusBarTextLight>
        {/* Screen content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {screen === "map"      && <MapScreen />}
          {screen === "fleet"    && <FleetScreen />}
          {screen === "alerts"   && <AlertsScreen resolved={resolvedAlerts} setResolved={setResolvedAlerts} />}
          {screen === "driver"   && <DriverScreen />}
          {screen === "settings" && <SettingsScreen />}
        </div>

        {/* Bottom tab bar */}
        <div
          className="flex-shrink-0 flex items-center border-t"
          style={{ background: "#0F1E3A", borderColor: "#1E3A5F" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScreen(tab.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 relative transition-colors"
              style={{ color: screen === tab.id ? "#10B981" : "#4B5563" }}
            >
              {tab.icon}
              <span className="text-[9px] font-semibold">{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <div className="absolute top-1.5 right-1/2 translate-x-2.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold">{tab.badge}</span>
                </div>
              ) : null}
              {screen === tab.id && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ background: "#10B981" }} />
              )}
            </button>
          ))}
        </div>
      </PhoneFrame>
    </MobileAppOverlay>
  );
}
