import { Users } from "lucide-react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, rand } from "./ui";
import { useAutoRefresh } from "./widgets";

/**
 * A driver's own place in the queue at each rank, and the trip fees on their trips. Seeing your place in the line, from the same record the marshal works from, is what stops an accusation of favouritism
 * before it starts. A driver sees only their own vehicles and fees, never another driver's, and never what a marshal earns.
 */
const COLOR = "#C8102E";
const call = portalClient("driver");
const money = (cents: number) => rand(cents / 100);
interface Position { rankId: string; rank: string; registration: string; position: number; ahead: number; waiting: number; loading: boolean }
interface Fees { trips: number; feesDueCents: number; feesReceivedCents: number; feesOutstandingCents: number; tripsOwed: number; outstanding: { driver: string; vehicle: string; trips: number; cents: number }[] }

export function DriverQueuePosition() {
  const [load, reload] = useLoad<{ positions: Position[] }>(() => call("/queue-position"));
  useAutoRefresh(reload, 15_000);                                  // the line moves while the driver watches
  return (
    <SectionPanel title="My place in the queue" action={<Users className="w-4 h-4 text-fg-muted" aria-hidden />}>
      <div className="p-4"><Status load={load}>{({ positions }) => positions.length === 0 ? <Empty>Your vehicle is not in a queue right now.</Empty> : (
        <ul className="space-y-3">{positions.map((p) => (
          <li key={`${p.rankId}|${p.registration}`} className="text-sm text-fg" aria-live="polite">
            <p><span className="text-3xl font-black mr-2" style={{ color: COLOR }}>{p.position}</span>{p.registration} at {p.rank}</p>
            <p className="text-xs text-fg-muted">{p.loading ? "Loading now." : p.ahead === 0 ? "You are next." : `${p.ahead} vehicle${p.ahead === 1 ? "" : "s"} ahead of you`} · {p.waiting} waiting</p>
          </li>))}</ul>)}</Status></div>
    </SectionPanel>
  );
}

export function DriverFees() {
  const [load] = useLoad<Fees>(() => call("/fees"));
  return (
    <SectionPanel title="Trip fees (last 7 days)">
      <div className="p-4"><Status load={load}>{(f) => f.trips === 0 ? <Empty>No trip fees in this period.</Empty> : (
        <div className="space-y-2 text-sm text-fg">
          <p>{f.trips} trip{f.trips === 1 ? "" : "s"} · due <b>{money(f.feesDueCents)}</b>, paid <b>{money(f.feesReceivedCents)}</b>, still owed <b>{money(f.feesOutstandingCents)}</b>.</p>
          {f.tripsOwed > 0 && <p className="text-xs text-fg-muted">{f.tripsOwed} trip fee{f.tripsOwed === 1 ? " is" : "s are"} waiting to be collected from your VINK account.</p>}
        </div>)}</Status></div>
    </SectionPanel>
  );
}
