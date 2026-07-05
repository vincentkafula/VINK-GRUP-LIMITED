import { useState } from "react";
import { Hash, CreditCard, DollarSign, ArrowUpRight, ArrowDownRight, FileText, Bell, Settings, Home, TrendingUp, RefreshCw, Lock } from "lucide-react";
import { DashboardShell, StatCard, Badge, Sparkline, SectionPanel, TableCard } from "./DashboardShell";

const NAV = [
  { icon: <Home className="w-4 h-4" />, label: "Overview" },
  { icon: <DollarSign className="w-4 h-4" />, label: "Balances" },
  { icon: <ArrowUpRight className="w-4 h-4" />, label: "Transactions" },
  { icon: <CreditCard className="w-4 h-4" />, label: "Cards" },
  { icon: <FileText className="w-4 h-4" />, label: "Invoices" },
  { icon: <RefreshCw className="w-4 h-4" />, label: "Transfers" },
  { icon: <TrendingUp className="w-4 h-4" />, label: "Statements" },
  { icon: <Lock className="w-4 h-4" />, label: "Security" },
  { icon: <Bell className="w-4 h-4" />, label: "Notifications" },
  { icon: <Settings className="w-4 h-4" />, label: "Settings" },
];

const TRANSACTIONS = [
  { desc: "Driver Earnings Payout", amount: -8920, date: "Today 14:20", category: "Payout", status: "completed" },
  { desc: "Platform Commission", amount: +2480, date: "Today 09:00", category: "Income", status: "completed" },
  { desc: "Vehicle Insurance Premium", amount: -1840, date: "Yesterday", category: "Expense", status: "completed" },
  { desc: "Investor Dividend", amount: -12480, date: "Jan 15", category: "Dividend", status: "completed" },
  { desc: "Merchant Settlement", amount: +4200, date: "Jan 14", category: "Income", status: "completed" },
  { desc: "Software Subscription", amount: -480, date: "Jan 10", category: "Expense", status: "completed" },
  { desc: "Data Bundle (MVNO)", amount: -2100, date: "Jan 08", category: "Expense", status: "completed" },
  { desc: "Vehicle Sale Proceeds", amount: +84000, date: "Jan 05", category: "Income", status: "completed" },
];

const BALANCE_CHART = [28400, 32100, 29800, 34500, 31200, 38900, 36400, 42100, 39800, 45200, 48400, 52800];
const CARDS = [
  { type: "Vink Business Visa", last4: "4521", limit: 50000, used: 18240, expiry: "09/28", color: "from-[#3D6FD4] to-[#2952B8]" },
  { type: "Vink Platinum MC", last4: "8834", limit: 100000, used: 34820, expiry: "03/27", color: "from-[#7B5EA7] to-[#4A3080]" },
];

const fmt = (n: number) => `R${Math.abs(n).toLocaleString()}`;

export function AccountDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  if (!isOpen) return null;

  return (
    <DashboardShell
      title="Account Dashboard" subtitle="Finance — Account Management"
      accentColor="#10B981" gradient="from-emerald-600 to-teal-500"
      navItems={NAV} activeNav={nav} onNavChange={setNav}
      onClose={onClose} userName="Vink Finance Admin"
    >
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Main Balance" value="R52,840" icon={<DollarSign className="w-5 h-5" />} color="#10B981" trend="up" sub="ACC-001-284-VNK" />
          <StatCard label="Available Credit" value="R96,940" icon={<CreditCard className="w-5 h-5" />} color="#3B82F6" />
          <StatCard label="Monthly Income" value="R84,200" icon={<ArrowUpRight className="w-5 h-5" />} color="#10B981" trend="up" />
          <StatCard label="Monthly Expenses" value="R31,840" icon={<ArrowDownRight className="w-5 h-5" />} color="#EF4444" trend="down" />
          <StatCard label="Net Position" value="+R52,360" icon={<TrendingUp className="w-5 h-5" />} color="#F59E0B" trend="up" />
          <StatCard label="Pending Invoices" value="R14,200" icon={<FileText className="w-5 h-5" />} color="#8B5CF6" />
        </div>

        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            {/* Balance chart */}
            <div className="rounded-xl p-5" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Account Balance (12 months)</h3>
                <Badge text="+R24,400 YTD" color="#10B981" />
              </div>
              <Sparkline values={BALANCE_CHART} color="#10B981" />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "#8884AA" }}>
                <span>Jan 2024</span><span>Jun</span><span>Dec 2024</span>
              </div>
            </div>

            {/* Transactions */}
            <TableCard
              title="Recent Transactions"
              color="#10B981"
              columns={["Description", "Category", "Amount", "Date", "Status"]}
              rows={TRANSACTIONS.map(t => [
                t.desc,
                <Badge text={t.category} color={t.category === "Income" ? "#10B981" : t.category === "Expense" ? "#EF4444" : t.category === "Payout" ? "#3B82F6" : "#F59E0B"} />,
                <span style={{ color: t.amount > 0 ? "#10B981" : "#EF4444", fontWeight: "bold" }}>
                  {t.amount > 0 ? "+" : ""}{fmt(t.amount)}
                </span>,
                t.date,
                <Badge text={t.status} color="#10B981" />,
              ])}
            />
          </div>

          <div className="space-y-4">
            {/* Cards */}
            <SectionPanel title="My Cards">
              <div className="space-y-3">
                {CARDS.map((c, i) => (
                  <div key={i} className="rounded-xl p-4 text-white overflow-hidden relative"
                    style={{ background: `linear-gradient(135deg, ${c.color.replace("from-", "").replace(" to-", ", ")})` }}>
                    <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
                    <p className="text-[9px] opacity-70 uppercase tracking-wider">VINK</p>
                    <p className="text-xs font-semibold mt-0.5">{c.type}</p>
                    <p className="text-xs font-mono mt-3 opacity-80">•••• •••• •••• {c.last4}</p>
                    <div className="flex justify-between items-end mt-2">
                      <div>
                        <p className="text-[8px] opacity-60">Expires</p>
                        <p className="text-[10px] font-medium">{c.expiry}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] opacity-60">Used / Limit</p>
                        <p className="text-[10px] font-bold">{fmt(c.used)} / {fmt(c.limit)}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-white/80" style={{ width: `${(c.used/c.limit)*100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionPanel>

            <SectionPanel title="Spending by Category">
              {[
                { cat: "Driver Payouts", pct: 62, color: "#3B82F6", val: "R19,740" },
                { cat: "Insurance", pct: 16, color: "#EF4444", val: "R5,094" },
                { cat: "Software", pct: 8, color: "#8B5CF6", val: "R2,547" },
                { cat: "MVNO Data", pct: 14, color: "#F59E0B", val: "R4,458" },
              ].map((s, i) => (
                <div key={i} className="mb-3">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: "#9896B8" }}>{s.cat}</span>
                    <span className="font-bold text-white">{s.val}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "#2D2A50" }}>
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </SectionPanel>

            <SectionPanel title="Quick Actions">
              <div className="space-y-2">
                {["Transfer Funds", "Pay Invoice", "Download Statement", "Schedule Payment"].map((a, i) => (
                  <button key={i} className="w-full py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                    style={{ background: "#252245", border: "1px solid #3D3A6A", color: "#10B981" }}>
                    {a}
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
