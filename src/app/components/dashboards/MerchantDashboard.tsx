import { useState } from "react";
import { ShoppingBag, DollarSign, Package, Users, TrendingUp, BarChart3, Star, Bell, Settings, Home, RefreshCw, Tag } from "lucide-react";
import { DashboardShell, StatCard, Badge, Sparkline, SectionPanel, TableCard, ProgressBar } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "Overview" },
  { icon: <ShoppingBag className="w-4 h-4" />, label: "Orders", badge: 8 },
  { icon: <Package className="w-4 h-4" />, label: "Products" },
  { icon: <Users className="w-4 h-4" />, label: "Customers" },
  { icon: <DollarSign className="w-4 h-4" />, label: "Payments" },
  { icon: <BarChart3 className="w-4 h-4" />, label: "Analytics" },
  { icon: <Tag className="w-4 h-4" />, label: "Promotions" },
  { icon: <Star className="w-4 h-4" />, label: "Reviews" },
  { icon: <Bell className="w-4 h-4" />, label: "Notifications", badge: 8 },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const ORDERS = [
  { id: "#ORD-4821", customer: "Aisha Patel", items: 3, total: "R1,248", status: "processing", time: "12m ago" },
  { id: "#ORD-4820", customer: "Thomas Khumalo", items: 1, total: "R480", status: "shipped", time: "45m ago" },
  { id: "#ORD-4819", customer: "Sarah Williams", items: 5, total: "R2,840", status: "delivered", time: "2h ago" },
  { id: "#ORD-4818", customer: "Mpho Sithole", items: 2, total: "R920", status: "delivered", time: "3h ago" },
  { id: "#ORD-4817", customer: "Johan van Wyk", items: 4, total: "R1,680", status: "delivered", time: "5h ago" },
  { id: "#ORD-4816", customer: "Priya Naidoo", items: 1, total: "R340", status: "cancelled", time: "6h ago" },
];

const TOP_PRODUCTS = [
  { name: "Vink SIM Card Bundle", sold: 482, revenue: "R96,400", stock: 1840, rating: 4.8 },
  { name: "Vehicle Tracker Device", sold: 124, revenue: "R186,000", stock: 280, rating: 4.9 },
  { name: "Driver App Premium Plan", sold: 310, revenue: "R62,000", stock: null, rating: 4.7 },
  { name: "Fleet Management Suite", sold: 48, revenue: "R144,000", stock: null, rating: 4.9 },
  { name: "Vink Data SIM (20GB)", sold: 284, revenue: "R56,800", stock: 920, rating: 4.6 },
];

const SALES = [124000, 148000, 138000, 164000, 152000, 188000, 174000, 196000, 184000, 212000, 204000, 248000];
const orderColor: Record<string, string> = { processing: "#F59E0B", shipped: "#3B82F6", delivered: "#10B981", cancelled: "#EF4444" };

export function MerchantDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  if (!isOpen) return null;

  return (
    <DashboardShell
      title="Merchant Dashboard" subtitle="Business — Commerce & Sales"
      accentColor="#0EA5E9" gradient="from-sky-600 to-cyan-500"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} liveConnected userName="Vink Commerce Ltd" alertCount={8}
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Today's Revenue" value="R24,840" icon={<DollarSign className="w-5 h-5" />} color="#0EA5E9" trend="up" sub="+14% vs yesterday" />
          <StatCard label="Orders Today" value="48" icon={<ShoppingBag className="w-5 h-5" />} color="#10B981" trend="up" />
          <StatCard label="Pending Orders" value="8" icon={<RefreshCw className="w-5 h-5" />} color="#F59E0B" />
          <StatCard label="Active Products" value="124" icon={<Package className="w-5 h-5" />} color="#8B5CF6" />
          <StatCard label="Total Customers" value="4,820" icon={<Users className="w-5 h-5" />} color="#EF4444" trend="up" />
          <StatCard label="Store Rating" value="4.82 ★" icon={<Star className="w-5 h-5" />} color="#F59E0B" trend="up" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            <div className="rounded-xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Monthly Sales Revenue</h3>
                <Badge text="R248K best month" color="#0EA5E9" />
              </div>
              <Sparkline values={SALES} color="#0EA5E9" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                <span>Jan</span><span>Jun</span><span>Dec</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[{ l: "Annual Revenue", v: "R2.05M", c: "#0EA5E9" }, { l: "Avg Order Value", v: "R518", c: "#10B981" }, { l: "Conversion Rate", v: "4.8%", c: "#F59E0B" }, { l: "Return Rate", v: "2.1%", c: "#EF4444" }].map((s, i) => (
                  <div key={i} className="text-center p-2 rounded-xl" style={{ background: "#252245" }}>
                    <p className="text-sm font-black" style={{ color: s.c }}>{s.v}</p>
                    <p className="text-[8px] mt-0.5" style={{ color: "#8884AA" }}>{s.l}</p>
                  </div>
                ))}
              </div>
            </div>

            <TableCard
              title="Live Orders"
              color="#0EA5E9"
              columns={["Order", "Customer", "Items", "Total", "Status", "Time"]}
              rows={ORDERS.map(o => [
                <span className="font-mono text-[10px]" style={{ color: "#0EA5E9" }}>{o.id}</span>,
                o.customer,
                String(o.items),
                <span style={{ color: "#10B981", fontWeight: "bold" }}>{o.total}</span>,
                <Badge text={o.status} color={orderColor[o.status]} />,
                o.time,
              ])}
            />

            <TableCard
              title="Top Products"
              color="#0EA5E9"
              columns={["Product", "Sold", "Revenue", "Rating"]}
              rows={TOP_PRODUCTS.map(p => [
                p.name,
                <span style={{ color: "#0EA5E9" }}>{p.sold}</span>,
                <span style={{ color: "#10B981", fontWeight: "bold" }}>{p.revenue}</span>,
                <span style={{ color: "#F59E0B" }}>{p.rating} ★</span>,
              ])}
            />
          </div>

          <div className="space-y-4">
            <SectionPanel title="Sales by Category">
              {[
                { cat: "SIM & Connectivity", pct: 38, val: "R779K", color: "#8B5CF6" },
                { cat: "Hardware Devices", pct: 28, val: "R574K", color: "#EF4444" },
                { cat: "Software Plans", pct: 22, val: "R451K", color: "#0EA5E9" },
                { cat: "Fleet Services", pct: 12, val: "R246K", color: "#10B981" },
              ].map(s => (
                <ProgressBar key={s.cat} label={s.cat} value={s.pct} max={100} color={s.color} />
              ))}
            </SectionPanel>

            <SectionPanel title="Customer Insights">
              <div className="space-y-2.5">
                {[
                  { label: "New Customers (month)", value: "284" },
                  { label: "Returning Customers", value: "68%" },
                  { label: "Avg Session Duration", value: "4m 28s" },
                  { label: "Cart Abandonment", value: "31%" },
                  { label: "Net Promoter Score", value: "72 / 100" },
                ].map((m, i) => (
                  <div key={i} className="flex justify-between text-[11px] py-1.5 border-b last:border-0" style={{ borderColor: "#2D2A5033" }}>
                    <span style={{ color: "#8884AA" }}>{m.label}</span>
                    <span className="font-bold text-white">{m.value}</span>
                  </div>
                ))}
              </div>
            </SectionPanel>

            <SectionPanel title="Recent Reviews">
              {[
                { name: "Aisha P.", stars: 5, text: "Fast delivery, excellent product quality!", product: "Vehicle Tracker" },
                { name: "Thomas K.", stars: 5, text: "SIM activated instantly, great service.", product: "SIM Bundle" },
                { name: "Sarah W.", stars: 4, text: "Good product, packaging could improve.", product: "Data SIM 20GB" },
              ].map((r, i) => (
                <div key={i} className="py-2.5 border-b last:border-0" style={{ borderColor: "#2D2A5033" }}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[11px] font-semibold text-white">{r.name}</span>
                    <span className="text-[9px]" style={{ color: "#F59E0B" }}>{"★".repeat(r.stars)}</span>
                  </div>
                  <p className="text-[10px]" style={{ color: "#8884AA" }}>{r.text}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: "#5A5880" }}>{r.product}</p>
                </div>
              ))}
            </SectionPanel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
