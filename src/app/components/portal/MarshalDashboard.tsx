import { useState } from "react";
import { ListOrdered, History, BarChart3, Link2 } from "lucide-react";
import { DashboardShell, SectionPanel, StatCard, TableCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, Field, ActionButton, inputCls, when, type Load } from "./ui";
import { LinksPanel } from "./LinksPanel";
import { CsvButton, Pager, RangeBar, ScreenBoundary, TrendChart, rangeQuery, saToday, saShift, monthStart, useAutoRefresh, type Range } from "./widgets";

const COLOR = "#3B82F6";
const call = portalClient("marshal");
const NAV = [
  { icon: <ListOrdered className="w-4 h-4" />, label: "Ranks & queue" },
  { icon: <History className="w-4 h-4" />, label: "Departures" },
  { icon: <BarChart3 className="w-4 h-4" />, label: "Reports" },
  { icon: <Link2 className="w-4 h-4" />, label: "Requests & links" },
];

interface Rank { id: string; name: string; location: string | null; association: string; waiting: number }
interface QItem { id: string; position: number; joinedAt: string; registration: string; make: string | null; model: string | null; seats: number | null; driver: string | null; vehicleId: string }
interface RankVehicle { id: string; registration: string; make: string | null; model: string | null; seats: number | null; driver: string | null; owner: string; inQueue: boolean }
interface Departure { id: string; at: string; registration: string; driver: string | null; passengers: number | null; note: string | null }
interface Per { departures: number; passengers: number }

export function MarshalDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Ranks & queue");
  const [ranks, reloadRanks] = useLoad<{ ranks: Rank[] }>(() => call("/ranks"));
  const [rankId, setRankId] = useState<string | null>(null);
  const picked = ranks.state === "ready" ? ranks.data.ranks.find((r) => r.id === rankId) ?? ranks.data.ranks[0] : undefined;

  return (
    <DashboardShell title="Marshal Dashboard" subtitle="Rank queue and departures" accentColor={COLOR} gradient={`from-[${COLOR}]`} navItems={NAV} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName}>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <ScreenBoundary resetKey={nav}>
          {(nav === "Ranks & queue" || nav === "Departures") && <RankPicker ranks={ranks} picked={picked?.id} onPick={setRankId} />}
          {nav === "Ranks & queue" && picked && <QueueScreen key={picked.id} rank={picked} onChanged={reloadRanks} />}
          {nav === "Departures" && picked && <DeparturesScreen key={picked.id} rank={picked} />}
          {nav === "Reports" && <ReportsScreen />}
          {nav === "Requests & links" && <LinksPanel call={call} color={COLOR} />}
        </ScreenBoundary>
      </div>
    </DashboardShell>
  );
}

function RankPicker({ ranks, picked, onPick }: { ranks: Load<{ ranks: Rank[] }>; picked?: string; onPick: (id: string) => void }) {
  return (
    <Status load={ranks}>{({ ranks: rs }) => rs.length === 0 ? (
      <SectionPanel title="Your ranks"><div className="p-4"><Empty>You are not assigned to a rank yet. Your association assigns you to one (see Requests & links to join an association).</Empty></div></SectionPanel>
    ) : (
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Your ranks">{rs.map((r) => (
        <button key={r.id} role="tab" aria-selected={r.id === picked} onClick={() => onPick(r.id)}
          className="px-3 py-1.5 rounded-lg text-sm" style={{ background: r.id === picked ? COLOR : "#1A1738", color: r.id === picked ? "#06122b" : "#cbd5e1", border: "1px solid #2D2A50" }}>
          {r.name} <span className="opacity-70">· {r.waiting} waiting</span>
        </button>))}</div>
    )}</Status>
  );
}

function QueueScreen({ rank, onChanged }: { rank: Rank; onChanged: () => void }) {
  const [q, reloadQ] = useLoad<{ queue: QItem[] }>(() => call(`/ranks/${rank.id}/queue`));
  const [veh, reloadV] = useLoad<{ vehicles: RankVehicle[] }>(() => call(`/ranks/${rank.id}/vehicles`));
  const [pax, setPax] = useState(""); const [note, setNote] = useState("");
  const refresh = () => { reloadQ(); reloadV(); onChanged(); };
  useAutoRefresh(() => { reloadQ(); reloadV(); }, 15_000);          // another marshal may have changed the line

  return (
    <>
      <SectionPanel title={`${rank.name}${rank.location ? ` · ${rank.location}` : ""} · ${rank.association}`}>
        <div className="p-4 space-y-4">
          <Status load={q}>{({ queue }) => queue.length === 0 ? <Empty>Nobody is waiting. Add a vehicle below.</Empty> : (
            <>
              <ol className="space-y-2">{queue.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-white">
                  <span><b className="mr-2" style={{ color: COLOR }}>{x.position}</b>{x.registration}<span className="text-white/40"> · {[x.make, x.model].filter(Boolean).join(" ") || "vehicle"}{x.seats ? ` · ${x.seats} seats` : ""} · {x.driver ?? "no driver set"} · since {when(x.joinedAt)}</span></span>
                  <span className="flex gap-2">
                    <ActionButton small label="Depart" busyLabel="Logging…" color={COLOR} onRun={async () => { const r = await call(`/ranks/${rank.id}/depart`, { method: "POST", body: { queueId: x.id, passengers: pax === "" ? undefined : Number(pax), note: note || undefined } }); refresh(); return "error" in r ? { error: r.error } : undefined; }} />
                    <ActionButton small label="Remove" color="#6B7280" onRun={async () => { const r = await call(`/ranks/${rank.id}/queue/${x.id}/remove`, { method: "POST", body: {} }); refresh(); return "error" in r ? { error: r.error } : undefined; }} />
                  </span>
                </li>))}</ol>
              <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-[#2D2A50]">
                <label className="block"><span className="text-[11px] text-white/60">Passengers on departure (optional)</span><input className={inputCls + " mt-1 w-40"} inputMode="numeric" value={pax} onChange={(e) => setPax(e.target.value)} /></label>
                <label className="block flex-1 min-w-[12rem]"><span className="text-[11px] text-white/60">Note (optional)</span><input className={inputCls + " mt-1"} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></label>
                <p className="text-[11px] text-white/40 basis-full">The passengers and note are saved with the departure you press Depart on.</p>
              </div>
            </>
          )}</Status>
        </div>
      </SectionPanel>
      <Status load={veh}>{({ vehicles }) => (
        <SectionPanel title="Vehicles and drivers of the association's members">
          <div className="p-4">{vehicles.length === 0 ? <Empty>The association has no member vehicles yet.</Empty> : (
            <ul className="space-y-2">{vehicles.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-white">
                <span>{v.registration}<span className="text-white/40"> · {[v.make, v.model].filter(Boolean).join(" ") || "vehicle"} · owner {v.owner} · driver {v.driver ?? "not set"}</span></span>
                {v.inQueue ? <span className="text-xs text-white/50">in a queue</span> :
                  <ActionButton small label="Add to queue" color={COLOR} onRun={async () => { const r = await call(`/ranks/${rank.id}/queue`, { method: "POST", body: { vehicleId: v.id } }); refresh(); return "error" in r ? { error: r.error } : undefined; }} />}
              </li>))}</ul>)}
          </div>
        </SectionPanel>
      )}</Status>
    </>
  );
}

function DeparturesScreen({ rank }: { rank: Rank }) {
  const today = saToday();
  const [range, setRange] = useState<Range>({ from: saShift(today, -6), to: today });
  const [offset, setOffset] = useState(0);
  const LIMIT = 15;
  const q = rangeQuery(range);
  const [d] = useLoad<{ total: number; departures: Departure[] }>(() => call(`/ranks/${rank.id}/departures?${q}&limit=${LIMIT}&offset=${offset}`), [q, offset]);
  const [t] = useLoad<{ days: { day: string; departures: number }[] }>(() => call(`/ranks/${rank.id}/trend?` + rangeQuery({ from: saShift(saToday(), -13), to: saToday() })));
  return (
    <>
      <Status load={t}>{({ days }) => <TrendChart days={days.map((x) => ({ day: x.day, value: x.departures }))} color={COLOR} label={`Departures from ${rank.name}, last 14 days`} money={false} />}</Status>
      <SectionPanel title={`Departures from ${rank.name}`} action={<CsvButton segment="marshal" path={`/ranks/${rank.id}/departures.csv?${q}`} color={COLOR} />}>
        <div className="p-4 space-y-3">
          <RangeBar value={range} onChange={(r) => { setRange(r); setOffset(0); }} color={COLOR} />
          <Status load={d}>{({ total, departures }) => departures.length === 0 ? <Empty>No departures in this period.</Empty> : (
            <>
              <TableCard title={`${total} departure${total === 1 ? "" : "s"}`} color={COLOR} columns={["When", "Vehicle", "Driver", "Passengers", "Note"]}
                rows={departures.map((x) => [when(x.at), x.registration, x.driver ?? "–", x.passengers ?? "–", x.note ?? ""])} />
              <Pager total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
            </>)}</Status>
        </div>
      </SectionPanel>
    </>
  );
}

function ReportsScreen() {
  const [range, setRange] = useState<Range>({ from: monthStart(), to: saToday() });
  const q = rangeQuery(range);
  const [r] = useLoad<{ ranks: { rankId: string; rank: string; today: Per; week: Per; month: Per; period?: Per }[] }>(() => call(`/reports?${q}`), [q]);
  return (
    <SectionPanel title="Reports" action={<CsvButton segment="marshal" path={`/reports.csv?${q}`} color={COLOR} />}>
      <div className="p-4 space-y-4">
        <RangeBar value={range} onChange={setRange} color={COLOR} />
        <Status load={r}>{({ ranks }) => ranks.length === 0 ? <Empty>No ranks yet.</Empty> : (
          <>{ranks.map((x) => (
            <div key={x.rankId} className="space-y-2">
              <h3 className="text-sm font-bold text-white">{x.rank}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([["Today", x.today], ["This week", x.week], ["This month", x.month], [`${range.from} to ${range.to}`, x.period]] as const).filter(([, p]) => p).map(([label, p]) => (
                  <StatCard key={label} label={label} value={`${p!.departures} departures`} sub={`${p!.passengers} passengers recorded`} icon={<ListOrdered className="w-4 h-4" />} color={COLOR} />))}
              </div>
            </div>))}
            <Field label="Note" value="Passenger numbers are only what was entered when each departure was logged." />
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}
