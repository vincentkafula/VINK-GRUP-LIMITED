import { useState } from "react";
import { MapPin, Clock, CreditCard, Star, Home, Navigation, History, Bell, Settings, Users, Heart, Shield } from "lucide-react";
import { DashboardShell, StatCard, Badge, SectionPanel } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "Home" },
  { icon: <Navigation className="w-4 h-4" />, label: "Book a Ride" },
  { icon: <History className="w-4 h-4" />, label: "Trip History" },
  { icon: <Heart className="w-4 h-4" />, label: "Saved Places" },
  { icon: <CreditCard className="w-4 h-4" />, label: "Payments" },
  { icon: <Shield className="w-4 h-4" />, label: "Safety" },
  { icon: <Users className="w-4 h-4" />, label: "Referrals" },
  { icon: <Bell className="w-4 h-4" />, label: "Notifications", badge: 1 },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const TRIPS = [
  { date: "Today, 14:20", from: "Sandton City Mall", to: "OR Tambo Airport", driver: "Thomas K.", rating: 5, fare: "R148", status: "completed" },
  { date: "Yesterday, 09:10", from: "Home", to: "Rosebank Office Park", driver: "Grace M.", rating: 5, fare: "R62", status: "completed" },
  { date: "Mon, 18:45", from: "Menlyn Shopping Centre", to: "Hatfield", driver: "Sipho N.", rating: 4, fare: "R44", status: "completed" },
  { date: "Mon, 08:30", from: "Home", to: "Menlyn Shopping Centre", driver: "Amara D.", rating: 5, fare: "R39", status: "completed" },
  { date: "Sun, 20:15", from: "Melrose Arch", to: "Bryanston", driver: "Peter V.", rating: 4, fare: "R87", status: "completed" },
];

const SAVED_PLACES = [
  { name: "Home", address: "14 Acacia Ave, Bryanston", icon: "🏠" },
  { name: "Work", address: "Sandton CBD, 3rd Floor", icon: "🏢" },
  { name: "Gym", address: "Virgin Active, Rosebank", icon: "💪" },
  { name: "Parents", address: "Midrand, Gauteng", icon: "❤️" },
];

export function PassengerDashboard({ isOpen, onClose, onBookRide }: { isOpen: boolean; onClose: () => void; onBookRide?: () => void }) {
  const [nav, setNav] = useState("Home");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  if (!isOpen) return null;

  return (
    <DashboardShell
      title="Passenger Dashboard" subtitle="Devices — Passenger Account"
      accentColor="#06B6D4" gradient="from-cyan-600 to-cyan-400"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} userName="Aisha Patel"
    >
      <div className="p-5 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Trips This Month" value="24" icon={<Navigation className="w-5 h-5" />} color="#06B6D4" trend="up" />
          <StatCard label="Total Spent" value="R1,840" icon={<CreditCard className="w-5 h-5" />} color="#8B5CF6" sub="This month" />
          <StatCard label="Avg Rating Given" value="4.8 ★" icon={<Star className="w-5 h-5" />} color="#F59E0B" />
          <StatCard label="Loyalty Points" value="2,480 pts" icon={<Heart className="w-5 h-5" />} color="#EF4444" trend="up" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            {/* Book a ride */}
            <div className="rounded-xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <h3 className="text-sm font-bold text-white mb-4">Book a Ride</h3>
              <div className="space-y-3">
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4" style={{ color: "#06B6D4" }} />
                  <input value={pickup} onChange={e => setPickup(e.target.value)}
                    placeholder="Pickup location..."
                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/30 outline-none focus:ring-2"
                    style={{ background: "#252245", border: "1px solid #3D3A6A", focusRingColor: "#06B6D4" }} />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4" style={{ color: "#EF4444" }} />
                  <input value={dropoff} onChange={e => setDropoff(e.target.value)}
                    placeholder="Drop-off destination..."
                    className="w-full pl-9 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/30 outline-none"
                    style={{ background: "#252245", border: "1px solid #3D3A6A" }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["Standard", "Premium", "XL Van"].map((type, i) => (
                    <button key={i} className="py-3 rounded-xl text-xs font-semibold transition-all"
                      style={{ background: i === 0 ? "#06B6D422" : "#252245", border: `1px solid ${i === 0 ? "#06B6D4" : "#3D3A6A"}`, color: i === 0 ? "#06B6D4" : "#8884AA" }}>
                      <p>{type}</p>
                      <p className="text-[10px] mt-0.5">{["R45–80", "R90–140", "R110–160"][i]}</p>
                    </button>
                  ))}
                </div>
                <button onClick={onBookRide}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg,#0891B2,#06B6D4)" }}>
                  🚕 Book via Vink Ride
                </button>
              </div>
            </div>

            {/* Trip history */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "#2D2A50" }}>
                <h3 className="text-sm font-bold text-white">Recent Trips</h3>
              </div>
              <div className="divide-y" style={{ borderColor: "#2D2A5033" }}>
                {TRIPS.map((t, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "#06B6D422", color: "#06B6D4" }}>
                      <Navigation className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-white truncate">{t.from} → {t.to}</p>
                      <p className="text-[9px] mt-0.5" style={{ color: "#8884AA" }}>{t.date} · {t.driver}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold" style={{ color: "#06B6D4" }}>{t.fare}</p>
                      <div className="flex items-center gap-0.5 justify-end mt-0.5">
                        {Array.from({ length: t.rating }).map((_, j) => <span key={j} className="text-[8px]">⭐</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            <SectionPanel title="Saved Places">
              <div className="space-y-3">
                {SAVED_PLACES.map((p, i) => (
                  <button key={i} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left"
                    style={{ background: "#252245", border: "1px solid #3D3A6A" }}>
                    <span className="text-xl">{p.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-white">{p.name}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>{p.address}</p>
                    </div>
                  </button>
                ))}
              </div>
            </SectionPanel>

            <SectionPanel title="Payment Methods">
              <div className="space-y-2.5">
                {[
                  { type: "Visa", last4: "4521", default: true },
                  { type: "Mastercard", last4: "8834", default: false },
                  { type: "Vink Wallet", last4: "R480 bal", default: false },
                ].map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: "#252245", border: `1px solid ${c.default ? "#06B6D455" : "#3D3A6A"}` }}>
                    <div className="w-8 h-6 rounded flex items-center justify-center text-[9px] font-bold"
                      style={{ background: c.type === "Vink Wallet" ? "#6B5ED7" : c.type === "Visa" ? "#1A1F71" : "#EB001B", color: "white" }}>
                      {c.type === "Vink Wallet" ? "V" : c.type[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-white">{c.type}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>•••• {c.last4}</p>
                    </div>
                    {c.default && <Badge text="Default" color="#06B6D4" />}
                  </div>
                ))}
              </div>
            </SectionPanel>

            <SectionPanel title="Safety Features">
              <div className="space-y-2.5">
                {[
                  { label: "Share Trip", desc: "With trusted contacts", active: true },
                  { label: "Emergency SOS", desc: "One-tap alert", active: true },
                  { label: "Driver Verified", desc: "Identity confirmed", active: true },
                ].map((f, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold text-white">{f.label}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>{f.desc}</p>
                    </div>
                    <div className="w-8 h-4 rounded-full flex items-center px-0.5"
                      style={{ background: f.active ? "#06B6D4" : "#2D2A50" }}>
                      <div className="w-3 h-3 rounded-full bg-white transition-all"
                        style={{ transform: f.active ? "translateX(16px)" : "translateX(0)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionPanel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
