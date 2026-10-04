import { useState } from "react";
import { TrendingUp, RadioTower, ListOrdered, FileText, Landmark } from "lucide-react";
import { BankStrip, BankScreen } from "./BankAccount";
import { DashboardShell, SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, rand, when } from "./ui";
import { CsvButton, Pager, RangeBar, ScreenBoundary, TrendChart, rangeQuery, saToday, saShift, monthStart, type Range } from "./widgets";

const COLOR = "#14B8A6";
const call = portalClient("investor");
const NAV = [
  { icon: <TrendingUp className="w-4 h-4" />, label: "Income" }, { icon: <RadioTower className="w-4 h-4" />, label: "Devices" },
  { icon: <ListOrdered className="w-4 h-4" />, label: "Trips & taps" }, { icon: <FileText className="w-4 h-4" />, label: "Statements" }, { icon: <Landmark className="w-4 h-4" />, label: "Bank account" },
];

interface Period { fares: number; income: number }
interface Income { today: Period; week: Period; month: Period; perTerminal: { serial: string; fares: number; income: number }[]; recent: { id: string; at: string; fare: number; income: number; terminal: string }[] }
interface Terminal { id: string; serial: string; status: string; lastSeenAt: string | null; vehicle: string | null; openFaults: number }
const NOTE = "Your per-fare income is the investor share stored on each confirmed fare. Your monthly device rental is paid by the vehicle owner outside this platform and is not shown here.";

export function InvestorDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Income");
  return (
    <DashboardShell title="Investor Dashboard" subtitle="Devices and per-fare income" accentColor={COLOR} gradient={`from-[${COLOR}]`} navItems={NAV} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName}>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <BankStrip segment="investor" color={COLOR} onOpen={() => setNav("Bank account")} />
        <ScreenBoundary resetKey={nav}>
          {nav === "Income" && <IncomeScreen />}
          {nav === "Devices" && <DevicesScreen />}
          {nav === "Trips & taps" && <TapsScreen />}
          {nav === "Statements" && <StatementsScreen />}
          {nav === "Bank account" && <BankScreen segment="investor" color={COLOR} />}
        </ScreenBoundary>
      </div>
    </DashboardShell>
  );
}

function IncomeScreen() {
  const [l] = useLoad<Income>(() => call("/income"));
  const [trend] = useLoad<{ days: { day: string; value: number }[] }>(() => call("/trend?" + rangeQuery({ from: saShift(saToday(), -13), to: saToday() })));
  return (
    <>
      <Status load={l}>{(x) => (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([["Today", x.today], ["This week", x.week], ["This month", x.month]] as const).map(([label, p]) => (
              <StatCard key={label} label={`${label}: your income`} value={rand(p.income)} sub={`${p.fares} confirmed fares`} icon={<TrendingUp className="w-4 h-4" />} color={COLOR} />))}
          </div>
          <Status load={trend}>{({ days }) => <TrendChart days={days} color={COLOR} label="Your income, last 14 days" />}</Status>
          <p className="text-[11px] text-white/40">{NOTE}</p>
          {x.perTerminal.length > 0 && <TableCard title="This month, per device" color={COLOR} columns={["Device", "Fares", "Your income"]} rows={x.perTerminal.map((t) => [t.serial, t.fares, rand(t.income)])} />}
          {x.recent.length === 0 ? <SectionPanel title="Latest fares"><div className="p-4"><Empty>No confirmed fares on your devices yet.</Empty></div></SectionPanel> : (
            <TableCard title="Latest fares" color={COLOR} columns={["When", "Device", "Fare", "Your income"]} rows={x.recent.map((t) => [when(t.at), t.terminal, rand(t.fare), rand(t.income)])} />)}
        </>
      )}</Status>
    </>
  );
}

function DevicesScreen() {
  const [l] = useLoad<{ terminals: Terminal[] }>(() => call("/terminals"));
  return (
    <Status load={l}>{({ terminals }) => terminals.length === 0 ? (
      <SectionPanel title="My devices"><div className="p-4"><Empty>No devices are assigned to you yet. Devices are assigned to investors by the platform's staff.</Empty></div></SectionPanel>
    ) : (
      <TableCard title="My devices" color={COLOR} columns={["Device", "Vehicle", "Status", "Open faults", "Last seen"]}
        rows={terminals.map((t) => [t.serial, t.vehicle ?? "not fitted", <Badge key="s" text={t.status} color={t.status === "active" ? "#10B981" : "#F59E0B"} />,
          t.openFaults > 0 ? <Badge key="f" text={`${t.openFaults} open`} color="#EF4444" /> : "none", t.lastSeenAt ? when(t.lastSeenAt) : "never"])} />
    )}</Status>
  );
}

interface Tap { id: string; at: string; terminal: string; fare: number; income: number; status: string }
function TapsScreen() {
  const today = saToday();
  const [range, setRange] = useState<Range>({ from: saShift(today, -6), to: today });
  const [status, setStatus] = useState(""); const [offset, setOffset] = useState(0);
  const LIMIT = 15;
  const q = rangeQuery(range, { status });
  const [l] = useLoad<{ total: number; taps: Tap[] }>(() => call(`/taps?${q}&limit=${LIMIT}&offset=${offset}`), [q, offset]);
  return (
    <SectionPanel title="Trips & taps on your devices" action={<CsvButton segment="investor" path={`/taps.csv?${q}`} color={COLOR} />}>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <RangeBar value={range} onChange={(r) => { setRange(r); setOffset(0); }} color={COLOR} />
          <label className="block"><span className="text-[11px] text-white/60">Status</span>
            <select className="mt-1 block rounded-lg px-3 py-2 text-sm bg-[#0D0B1E] border border-[#2D2A50] text-white" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
              <option value="">All</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option></select></label>
        </div>
        <Status load={l}>{({ total, taps }) => taps.length === 0 ? <Empty>No taps in this period.</Empty> : (
          <>
            <TableCard title={`${total} tap${total === 1 ? "" : "s"}`} color={COLOR} columns={["When", "Device", "Fare", "Your income", "Status"]}
              rows={taps.map((t) => [when(t.at), t.terminal, rand(t.fare), rand(t.income), <Badge key={t.id} text={t.status} color={t.status === "confirmed" ? "#10B981" : "#EF4444"} />])} />
            <Pager total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}

interface Statement { totals: { fares: number; income: number }; days: { day: string; fares: number; income: number }[]; perTerminal: { serial: string; fares: number; income: number }[] }
function StatementsScreen() {
  const [range, setRange] = useState<Range>({ from: monthStart(), to: saToday() });
  const q = rangeQuery(range);
  const [l] = useLoad<Statement>(() => call(`/statements?${q}`), [q]);
  return (
    <SectionPanel title="Income summary" action={<CsvButton segment="investor" path={`/statements.csv?${q}`} color={COLOR} />}>
      <div className="p-4 space-y-4">
        <RangeBar value={range} onChange={setRange} color={COLOR} />
        <Status load={l}>{({ totals, days, perTerminal }) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Your income in this period" value={rand(totals.income)} icon={<TrendingUp className="w-4 h-4" />} color={COLOR} />
              <StatCard label="Confirmed fares" value={String(totals.fares)} icon={<ListOrdered className="w-4 h-4" />} color="#3B82F6" />
            </div>
            {days.length === 0 ? <Empty>No income was recorded in this period.</Empty> : <TableCard title="Per day" color={COLOR} columns={["Date", "Fares", "Your income"]} rows={days.map((d) => [d.day, d.fares, rand(d.income)])} />}
            {perTerminal.length > 0 && <TableCard title="Per device" color={COLOR} columns={["Device", "Fares", "Your income"]} rows={perTerminal.map((t) => [t.serial, t.fares, rand(t.income)])} />}
            <p className="text-[11px] text-white/40">{NOTE} This is a summary of recorded fares, not an audited financial statement, and not tax advice.</p>
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}
