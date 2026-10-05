import { useState } from "react";
import { Power } from "lucide-react";
import { SectionPanel, TableCard, Badge, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, when } from "./ui";
import { CsvButton, Pager, RangeBar, TrendChart, rangeQuery, saToday, saShift, monthStart, type Range } from "./widgets";

const COLOR = "#F59E0B";
const call = portalClient("driver");

/** The original dashboard's "Turn on or off": switches this terminal. While it is off the terminal refuses fares. */
export function PowerPanel({ terminalId, status, onChanged }: { terminalId: string; status: string | null; onChanged: () => void }) {
  if (status === "revoked") return <p className="text-xs text-bad">This terminal was disabled by the platform. Please contact support.</p>;
  const on = status === "active";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
      <Power className="w-4 h-4" style={{ color: on ? "#10B981" : "#9CA3AF" }} />
      <span className="text-sm text-fg">Fare terminal is <b>{on ? "ON" : "OFF"}</b></span>
      <ActionButton small label={on ? "Turn off" : "Turn on"} busyLabel="Switching…" color={on ? "#6B7280" : COLOR}
        onRun={async () => { const r = await call(`/terminal/power`, { method: "POST", body: { terminalId, on: !on } }); onChanged(); return "error" in r ? { error: r.error } : undefined; }} />
      <span className="text-[11px] text-fg-subtle">{on ? "It is taking fares." : "While it is off, it will not take fares."}</span>
    </div>
  );
}

interface Trip { id: string; at: string; amount: number; scheme: string | null; status: string; terminalSerial: string }
const STATUS_COLOR: Record<string, string> = { confirmed: "#10B981", declined: "#EF4444" };
const LIMIT = 15;

/** The Preview / Trips screen: every fare on my vehicle with date and status filters, paging and a CSV download. */
export function DriverTrips() {
  const today = saToday();
  const [range, setRange] = useState<Range>({ from: saShift(today, -6), to: today });
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const q = rangeQuery(range, { status });
  const [load] = useLoad<{ total: number; trips: Trip[] }>(() => call(`/trips?${q}&limit=${LIMIT}&offset=${offset}`), [q, offset]);
  return (
    <SectionPanel title="Fares on your vehicle" action={<CsvButton segment="driver" path={`/trips.csv?${q}`} color={COLOR} />}>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <RangeBar value={range} onChange={(r) => { setRange(r); setOffset(0); }} color={COLOR} />
          <label className="block"><span className="text-[11px] text-fg-muted">Status</span>
            <select className="mt-1 block rounded-lg px-3 py-2 text-sm bg-bg border border-line text-fg" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
              <option value="">All</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option></select></label>
        </div>
        <Status load={load}>{({ total, trips }) => trips.length === 0 ? <Empty>No fares in this period.</Empty> : (
          <>
            <TableCard title={`${total} fare${total === 1 ? "" : "s"}`} color={COLOR} columns={["When", "Amount", "Card", "Status"]}
              rows={trips.map((t) => [when(t.at), rand(t.amount), t.scheme ?? "–", <Badge key={t.id} text={t.status} color={STATUS_COLOR[t.status] ?? "#F59E0B"} />])} />
            <Pager total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}

/** Fares collected per day for the last two weeks. */
export function DriverTrend() {
  const [load] = useLoad<{ days: { day: string; value: number; count: number }[] }>(() => call("/trend?" + rangeQuery({ from: saShift(saToday(), -13), to: saToday() })));
  return <Status load={load}>{({ days }) => <TrendChart days={days} color={COLOR} label="Fares collected, last 14 days" />}</Status>;
}

interface Statement { from: string; to: string; days: { day: string; value: number; count: number }[]; fares: { count: number; total: number }; fines: { id: string; amount: number; description: string | null; at: string }[]; finesTotal: number }

/** A statement of what was recorded for a period. It is a summary, not a payslip: your pay is agreed privately with your owner. */
export function DriverStatements() {
  const [range, setRange] = useState<Range>({ from: monthStart(), to: saToday() });
  const q = rangeQuery(range);
  const [load] = useLoad<Statement>(() => call(`/statements?${q}`), [q]);
  return (
    <SectionPanel title="Statement" action={<CsvButton segment="driver" path={`/statements.csv?${q}`} color={COLOR} />}>
      <div className="p-4 space-y-4">
        <RangeBar value={range} onChange={setRange} color={COLOR} />
        <Status load={load}>{(s) => (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Fares collected on your vehicle" value={rand(s.fares.total)} sub={`${s.fares.count} fares`} icon={<Power className="w-4 h-4" />} color={COLOR} />
              <StatCard label="Fines in this period" value={rand(s.finesTotal)} sub={`${s.fines.length} fine${s.fines.length === 1 ? "" : "s"}`} icon={<Power className="w-4 h-4" />} color="#EF4444" />
            </div>
            {s.days.length === 0 ? <Empty>No fares were collected in this period.</Empty> : (
              <TableCard title="Fares per day" color={COLOR} columns={["Date", "Fares", "Collected"]} rows={s.days.map((d) => [d.day, d.count, rand(d.value)])} />)}
            {s.fines.length > 0 && <TableCard title="Fines" color="#EF4444" columns={["Date", "Detail", "Amount"]} rows={s.fines.map((f) => [when(f.at), f.description ?? "Off-route fine", rand(f.amount)])} />}
            <p className="text-[11px] text-fg-subtle">This is a summary of what was recorded for your vehicle. Your own pay is agreed privately with your owner and is not calculated or shown here.</p>
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}
