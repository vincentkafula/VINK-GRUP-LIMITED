import { useState } from "react";
import { TrendingUp, DollarSign, BarChart3, PieChart, FileText, Bell, Settings, Home, Users, Briefcase, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { DashboardShell, StatCard, Badge, Sparkline, SectionPanel, ProgressBar } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "Overview" },
  { icon: <TrendingUp className="w-4 h-4" />, label: "Portfolio" },
  { icon: <DollarSign className="w-4 h-4" />, label: "Returns" },
  { icon: <BarChart3 className="w-4 h-4" />, label: "Analytics" },
  { icon: <FileText className="w-4 h-4" />, label: "Reports" },
  { icon: <Users className="w-4 h-4" />, label: "Shareholders" },
  { icon: <Briefcase className="w-4 h-4" />, label: "Dividends" },
  { icon: <Bell className="w-4 h-4" />, label: "Alerts" },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const PORTFOLIO = [
  { name: "Mobile Network (MVNO)", value: 4200000, change: 12.4, alloc: 38, color: "#8B5CF6" },
  { name: "Vehicle Tracking Fleet", value: 2800000, change: 8.2, alloc: 25, color: "#EF4444" },
  { name: "Merchant Platform", value: 1900000, change: 5.6, alloc: 17, color: "#0EA5E9" },
  { name: "Financial Services", value: 1400000, change: 9.8, alloc: 13, color: "#10B981" },
  { name: "Authority Systems", value: 780000, change: -2.1, alloc: 7, color: "#F59E0B" },
];

const REVENUE_CHART = [820000, 940000, 870000, 1100000, 980000, 1240000, 1380000, 1290000, 1450000, 1600000, 1520000, 1740000];
const RETURN_CHART = [8.1, 9.4, 7.8, 11.2, 10.4, 12.8, 13.4, 11.9, 14.2, 15.6, 14.8, 16.2];

const DIVIDENDS = [
  { period: "Q4 2024", amount: "R124,800", yield: "4.2%", paid: "2025-01-15", status: "paid" },
  { period: "Q3 2024", amount: "R118,400", yield: "3.9%", paid: "2024-10-15", status: "paid" },
  { period: "Q2 2024", amount: "R108,200", yield: "3.6%", paid: "2024-07-15", status: "paid" },
  { period: "Q1 2025", amount: "R134,600", yield: "4.5%", paid: "2025-04-15", status: "upcoming" },
];

const fmt = (n: number) => n >= 1000000 ? `R${(n/1000000).toFixed(2)}M` : `R${(n/1000).toFixed(0)}K`;

export function InvestorsDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  if (!isOpen) return null;

  const totalValue = PORTFOLIO.reduce((s, p) => s + p.value, 0);

  return (
    <DashboardShell
      title="Investors Dashboard" subtitle="Devices — Investment Account"
      accentColor="#F59E0B" gradient="from-amber-600 to-amber-400"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} userName="Reginald Botha"
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Total Portfolio" value={fmt(totalValue)} icon={<Briefcase className="w-5 h-5" />} color="#F59E0B" trend="up" />
          <StatCard label="YTD Return" value="+16.2%" icon={<TrendingUp className="w-5 h-5" />} color="#10B981" trend="up" sub="vs 8.4% benchmark" />
          <StatCard label="Annual Dividend" value="R486,000" icon={<DollarSign className="w-5 h-5" />} color="#8B5CF6" trend="up" />
          <StatCard label="Dividend Yield" value="4.5%" icon={<BarChart3 className="w-5 h-5" />} color="#0EA5E9" />
          <StatCard label="Investment Count" value="5 assets" icon={<PieChart className="w-5 h-5" />} color="#EF4444" />
          <StatCard label="Shareholders" value="142" icon={<Users className="w-5 h-5" />} color="#F59E0B" trend="up" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            {/* Portfolio breakdown */}
            <div className="rounded-xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <h3 className="text-sm font-bold text-white mb-4">Portfolio Breakdown — {fmt(totalValue)}</h3>
              {PORTFOLIO.map((p, i) => (
                <div key={i} className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                      <span className="text-[11px] text-white font-medium">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-white">{fmt(p.value)}</span>
                      <div className={`flex items-center gap-0.5 text-[10px] font-bold ${p.change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {p.change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(p.change)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 h-2 rounded-full overflow-hidden" style={{ background: "#2D2A50" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${p.alloc}%`, background: p.color }} />
                  </div>
                  <div className="flex justify-between text-[9px] mt-0.5" style={{ color: "#8884AA" }}>
                    <span>{p.alloc}% of portfolio</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue chart */}
            <div className="rounded-xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Monthly Revenue</h3>
                <Badge text="+16.2% YTD" color="#10B981" />
              </div>
              <Sparkline values={REVENUE_CHART.map(v => v / 10000)} color="#F59E0B" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                <span>Jan 2024</span><span>Jun</span><span>Dec 2024</span>
              </div>
            </div>

            {/* Dividends table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "#2D2A50" }}>
                <h3 className="text-sm font-bold text-white">Dividend History</h3>
              </div>
              <div className="divide-y" style={{ borderColor: "#2D2A5033" }}>
                {DIVIDENDS.map((d, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div>
                      <p className="text-[11px] font-semibold text-white">{d.period}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>Paid {d.paid}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold" style={{ color: "#F59E0B" }}>{d.amount}</p>
                      <p className="text-[9px]" style={{ color: "#8884AA" }}>Yield {d.yield}</p>
                    </div>
                    <Badge text={d.status} color={d.status === "paid" ? "#10B981" : "#F59E0B"} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionPanel title="Return vs Benchmark">
              <Sparkline values={RETURN_CHART} color="#10B981" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                <span>Jan</span><span>Jun</span><span>Dec</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="text-center p-2 rounded-lg" style={{ background: "#252245" }}>
                  <p className="text-base font-black" style={{ color: "#10B981" }}>16.2%</p>
                  <p className="text-[9px]" style={{ color: "#8884AA" }}>Your Return</p>
                </div>
                <div className="text-center p-2 rounded-lg" style={{ background: "#252245" }}>
                  <p className="text-base font-black" style={{ color: "#6B7280" }}>8.4%</p>
                  <p className="text-[9px]" style={{ color: "#8884AA" }}>Benchmark</p>
                </div>
              </div>
            </SectionPanel>

            <SectionPanel title="Allocation by Sector">
              {PORTFOLIO.map(p => (
                <ProgressBar key={p.name} label={p.name.split(" ")[0]} value={p.alloc} max={100} color={p.color} />
              ))}
            </SectionPanel>

            <SectionPanel title="Key Metrics">
              {[
                { label: "Sharpe Ratio", value: "1.84" },
                { label: "Volatility", value: "6.2%" },
                { label: "Max Drawdown", value: "-3.1%" },
                { label: "Beta", value: "0.72" },
                { label: "P/E Ratio", value: "14.8x" },
              ].map((m, i) => (
                <div key={i} className="flex justify-between py-2 border-b last:border-0 text-[11px]" style={{ borderColor: "#2D2A5033" }}>
                  <span style={{ color: "#8884AA" }}>{m.label}</span>
                  <span className="font-bold text-white">{m.value}</span>
                </div>
              ))}
            </SectionPanel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
