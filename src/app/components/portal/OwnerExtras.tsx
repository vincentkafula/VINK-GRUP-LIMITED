import { useState } from "react";
import { Wallet } from "lucide-react";
import { SectionPanel, StatCard, TableCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, rand, day } from "./ui";
import { MapView } from "./MapView";
import { CsvButton, RangeBar, TrendChart, useAutoRefresh, rangeQuery, saToday, saShift, monthStart, type MapPosition, type MapRoute, type Range } from "./widgets";

const COLOR = "#B04040";
const call = portalClient("owner");

/** Fares collected per day over the last two weeks. */
export function OwnerTrend() {
  const [load] = useLoad<{ days: { day: string; value: number }[] }>(() => call("/trend?" + rangeQuery({ from: saShift(saToday(), -13), to: saToday() })));
  return <Status load={load}>{({ days }) => <TrendChart days={days} color={COLOR} label="Fares collected, last 14 days" />}</Status>;
}

/** The original "Routes & Map": the routes recorded for my vehicles and where each vehicle last reported from. */
export function OwnerMap() {
  const [load, reload] = useLoad<{ routes: MapRoute[]; positions: MapPosition[] }>(() => call("/map"));
  useAutoRefresh(reload, 30_000);                       // vehicle positions stay current without touching the map view
  return <Status load={load}>{({ routes, positions }) => <MapView routes={routes} positions={positions} color={COLOR} />}</Status>;
}

interface Statement {
  from: string; to: string;
  days: { day: string; fares: number; collected: number; ownerShare: number }[];
  totals: { fares: number; collected: number; ownerShare: number; platformFees: number; investorShare: number; fines: { count: number; total: number }; levies: { charged: number; paid: number } };
}

/** The original "Financials": a summary of recorded money for a period, with a CSV download. It is not an audited statement. */
export function OwnerFinancials() {
  const [range, setRange] = useState<Range>({ from: monthStart(), to: saToday() });
  const q = rangeQuery(range);
  const [load] = useLoad<Statement>(() => call(`/statements?${q}`), [q]);
  return (
    <SectionPanel title="Financial summary" action={<CsvButton segment="owner" path={`/statements.csv?${q}`} color={COLOR} />}>
      <div className="p-4 space-y-4">
        <RangeBar value={range} onChange={setRange} color={COLOR} />
        <Status load={load}>{({ days, totals: t }) => (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Fares collected" value={rand(t.collected)} sub={`${t.fares} fares`} icon={<Wallet className="w-4 h-4" />} color={COLOR} />
              <StatCard label="Your share after the platform split" value={rand(t.ownerShare)} icon={<Wallet className="w-4 h-4" />} color="#10B981" />
              <StatCard label="Platform fees" value={rand(t.platformFees)} icon={<Wallet className="w-4 h-4" />} color="#3B82F6" />
              <StatCard label="Investor share" value={rand(t.investorShare)} icon={<Wallet className="w-4 h-4" />} color="#14B8A6" />
              <StatCard label="Route fines" value={rand(t.fines.total)} sub={`${t.fines.count} fine${t.fines.count === 1 ? "" : "s"}`} icon={<Wallet className="w-4 h-4" />} color="#EF4444" />
              <StatCard label="Levies charged to you" value={rand(t.levies.charged)} sub={`${rand(t.levies.paid)} paid`} icon={<Wallet className="w-4 h-4" />} color="#F59E0B" />
            </div>
            {days.length === 0 ? <Empty>No fares were collected in this period.</Empty> : (
              <TableCard title="Per day" color={COLOR} columns={["Date", "Fares", "Collected", "Your share"]} rows={days.map((d) => [day(d.day), d.fares, rand(d.collected), rand(d.ownerShare)])} />)}
            <p className="text-[11px] text-fg-subtle">Every figure is added up from recorded fares, fines and levies. This is a summary, not an audited financial statement, and not tax advice. What you pay your drivers is your own arrangement and is not recorded here.</p>
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}
