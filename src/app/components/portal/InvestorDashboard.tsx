import { useState } from "react";
import { TrendingUp, RadioTower } from "lucide-react";
import { DashboardShell, SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, rand, when } from "./ui";

const COLOR = "#14B8A6";
const call = portalClient("investor");
const NAV = [{ icon: <TrendingUp className="w-4 h-4" />, label: "Income" }, { icon: <RadioTower className="w-4 h-4" />, label: "My terminals" }];

interface Period { fares: number; income: number }
interface Income { today: Period; week: Period; month: Period; perTerminal: { serial: string; fares: number; income: number }[]; recent: { id: string; at: string; fare: number; income: number; terminal: string }[] }
interface Terminal { id: string; serial: string; status: string; lastSeenAt: string | null; vehicle: string | null }

export function InvestorDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Income");
  return (
    <DashboardShell title="Investor Dashboard" subtitle="Terminals and per-fare income" accentColor={COLOR} gradient={`from-[${COLOR}]`} navItems={NAV} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName}>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        {nav === "Income" && <IncomeScreen />}
        {nav === "My terminals" && <TerminalsScreen />}
      </div>
    </DashboardShell>
  );
}

function IncomeScreen() {
  const [l] = useLoad<Income>(() => call("/income"));
  return (
    <Status load={l}>{(x) => (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([["Today", x.today], ["This week", x.week], ["This month", x.month]] as const).map(([label, p]) => (
            <StatCard key={label} label={`${label}: your income`} value={rand(p.income)} sub={`${p.fares} confirmed fares`} icon={<TrendingUp className="w-4 h-4" />} color={COLOR} />))}
        </div>
        <p className="text-[11px] text-white/40">Your per-fare income is the investor share stored on each confirmed fare. Your monthly device rental is paid by the vehicle owner outside this platform and is not shown here.</p>
        {x.perTerminal.length > 0 && <TableCard title="This month, per terminal" color={COLOR} columns={["Terminal", "Fares", "Your income"]} rows={x.perTerminal.map((t) => [t.serial, t.fares, rand(t.income)])} />}
        {x.recent.length === 0 ? <SectionPanel title="Latest fares"><div className="p-4"><Empty>No confirmed fares on your terminals yet.</Empty></div></SectionPanel> : (
          <TableCard title="Latest fares" color={COLOR} columns={["When", "Terminal", "Fare", "Your income"]} rows={x.recent.map((t) => [when(t.at), t.terminal, rand(t.fare), rand(t.income)])} />)}
      </>
    )}</Status>
  );
}

function TerminalsScreen() {
  const [l] = useLoad<{ terminals: Terminal[] }>(() => call("/terminals"));
  return (
    <Status load={l}>{({ terminals }) => terminals.length === 0 ? (
      <SectionPanel title="My terminals"><div className="p-4"><Empty>No terminals are assigned to you yet. Terminals are assigned to investors by the platform's staff.</Empty></div></SectionPanel>
    ) : (
      <TableCard title="My terminals" color={COLOR} columns={["Terminal", "Vehicle", "Status", "Last seen"]}
        rows={terminals.map((t) => [t.serial, t.vehicle ?? "not fitted", <Badge key="s" text={t.status} color={t.status === "active" ? "#10B981" : "#F59E0B"} />, t.lastSeenAt ? when(t.lastSeenAt) : "never"])} />
    )}</Status>
  );
}
