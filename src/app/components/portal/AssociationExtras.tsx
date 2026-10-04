import { useState } from "react";
import { Coins } from "lucide-react";
import { SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, inputCls, rand, day, when } from "./ui";
import { MapView } from "./MapView";
import { CsvButton, Pager, RangeBar, TrendChart, useAutoRefresh, rangeQuery, saToday, saShift, monthStart, type MapPosition, type MapRoute, type Range } from "./widgets";

const COLOR = "#EF4444";
const call = portalClient("association");
const ROLE: Record<string, string> = { vehicle_owner: "Vehicle owner", driver: "Driver", marshal: "Marshal" };

interface Member { id: string; userId: string; name: string; email: string; role: string; status: string }

/** Members with a role filter, name/email search and paging. `role` pins the list to one kind (Owners, Drivers, Marshals screens). */
export function MembersList({ role, onChanged }: { role?: string; onChanged: () => void }) {
  const [q, setQ] = useState(""); const [kind, setKind] = useState(role ?? ""); const [offset, setOffset] = useState(0);
  const LIMIT = 15;
  const query = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (kind) query.set("role", kind);
  if (q.trim()) query.set("q", q.trim());
  const [load, reload] = useLoad<{ total: number; members: Member[] }>(() => call(`/members?${query}`), [query.toString()]);
  return (
    <SectionPanel title={role ? `${ROLE[role]}s` : "Members"}>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="block"><span className="text-[11px] text-white/60">Search name or email</span><input className={inputCls + " mt-1 !w-64"} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search…" /></label>
          {!role && <label className="block"><span className="text-[11px] text-white/60">Role</span>
            <select className={inputCls + " mt-1 !w-auto"} value={kind} onChange={(e) => { setKind(e.target.value); setOffset(0); }}><option value="">All</option><option value="vehicle_owner">Vehicle owners</option><option value="driver">Drivers</option><option value="marshal">Marshals</option></select></label>}
        </div>
        <Status load={load}>{({ total, members }) => members.length === 0 ? <Empty>{q || kind ? "Nobody matches that search." : "No members yet. Invite people by email below."}</Empty> : (
          <>
            <TableCard title={`${total} ${total === 1 ? "person" : "people"}`} color={COLOR} columns={["Name", "Email", "Role", "Status", ""]}
              rows={members.map((m) => [m.name, m.email, ROLE[m.role] ?? m.role, <Badge key="s" text={m.status === "pending" ? "invited" : m.status} color={m.status === "active" ? "#10B981" : "#F59E0B"} />,
                <ActionButton key="r" small label="Remove" color="#6B7280" onRun={async () => { const r = await call(`/members/${m.id}/remove`, { method: "POST", body: {} }); reload(); onChanged(); return "error" in r ? { error: r.error } : undefined; }} />])} />
            <Pager total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}

/** Vehicles of the member owners, with owner and driver. */
export function VehiclesList() {
  const [q, setQ] = useState(""); const [offset, setOffset] = useState(0);
  const LIMIT = 15;
  const query = new URLSearchParams({ limit: String(LIMIT), offset: String(offset), ...(q.trim() ? { q: q.trim() } : {}) });
  const [load] = useLoad<{ total: number; vehicles: { id: string; registration: string; make: string | null; model: string | null; seats: number | null; discExpiry: string | null; owner: string; driver: string | null }[] }>(() => call(`/vehicles?${query}`), [query.toString()]);
  return (
    <SectionPanel title="Member vehicles">
      <div className="p-4 space-y-3">
        <label className="block"><span className="text-[11px] text-white/60">Search registration</span><input className={inputCls + " mt-1 !w-64"} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search…" /></label>
        <Status load={load}>{({ total, vehicles }) => vehicles.length === 0 ? <Empty>No member vehicles{q ? " match that search" : " yet"}.</Empty> : (
          <>
            <TableCard title={`${total} vehicle${total === 1 ? "" : "s"}`} color={COLOR} columns={["Registration", "Vehicle", "Seats", "Disc expires", "Owner", "Driver"]}
              rows={vehicles.map((v) => [v.registration, [v.make, v.model].filter(Boolean).join(" ") || "–", v.seats ?? "–", day(v.discExpiry), v.owner, v.driver ?? "not set"])} />
            <Pager total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}

interface Route { id: string; name: string; active: boolean; toleranceMeters: number; waypoints: number; terminalSerial: string; registration: string | null }
interface Violation { id: string; at: string; distanceMeters: number; fine: number; registration: string | null }

/** Parses "lat, lng" lines. Returns the points, or a message saying which line is wrong. */
export function parseWaypoints(input: string): { points: { lat: number; lng: number }[] } | { error: string } {
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const points: { lat: number; lng: number }[] = [];
  for (const [i, line] of lines.entries()) {
    const m = /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!m) return { error: `Line ${i + 1} ("${line.slice(0, 30)}") should look like -26.2678, 27.8585` };
    const lat = Number(m[1]), lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: `Line ${i + 1} is outside the valid latitude or longitude range` };
    points.push({ lat, lng });
  }
  if (points.length < 2) return { error: "Enter at least two points, one per line" };
  if (points.length > 200) return { error: "A route can have at most 200 points" };
  return { points };
}

/** The valid points typed so far (bad lines are skipped), so the map can preview a route while it is being drawn. */
export function draftPoints(input: string): { lat: number; lng: number }[] {
  return input.split(/\r?\n/).flatMap((l) => {
    const p = parseWaypoints(l + "\n" + l);              // reuse the strict single-line parser (a line repeated satisfies the 2-point minimum)
    return "points" in p ? [p.points[0]] : [];
  });
}

/** Routes: create against a member vehicle's fare terminal, switch on or off, adjust the allowed distance, and see violations. */
export function RoutesManager() {
  const [routes, reload] = useLoad<{ routes: Route[] }>(() => call("/routes"));
  const [terminals] = useLoad<{ terminals: { id: string; serial: string; registration: string }[] }>(() => call("/terminals"));
  const [mapData] = useLoad<{ routes: MapRoute[]; positions: MapPosition[] }>(() => call("/map"));
  const [f, setF] = useState({ terminalId: "", name: "", tolerance: "200", points: "" });
  const [open, setOpen] = useState<string | null>(null);
  const create = async () => {
    const p = parseWaypoints(f.points);
    if ("error" in p) return { error: p.error };
    const r = await call("/routes", { method: "POST", body: { terminalId: f.terminalId, name: f.name, toleranceMeters: Number(f.tolerance), waypoints: p.points } });
    if (!("error" in r)) { setF({ terminalId: "", name: "", tolerance: "200", points: "" }); reload(); }
    return "error" in r ? { error: r.error } : { message: "Route created." };
  };
  return (
    <>
      <Status load={routes}>{({ routes: rs }) => rs.length === 0 ? (
        <SectionPanel title="Routes"><div className="p-4"><Empty>No routes yet. Record one below against a member vehicle's fare terminal.</Empty></div></SectionPanel>
      ) : (
        <>{rs.map((r) => (
          <SectionPanel key={r.id} title={`${r.name} · ${r.registration ?? r.terminalSerial}`}>
            <div className="p-4 space-y-3 text-sm text-white">
              <p>{r.waypoints} points · {r.toleranceMeters} m allowed off the path <Badge text={r.active ? "active" : "inactive"} color={r.active ? "#10B981" : "#6B7280"} /></p>
              <div className="flex flex-wrap gap-2 items-center">
                <ActionButton small label={r.active ? "Switch off" : "Switch on"} color="#6B7280" onRun={async () => { const x = await call(`/routes/${r.id}`, { method: "PUT", body: { name: r.name, active: !r.active, toleranceMeters: r.toleranceMeters } }); reload(); return "error" in x ? { error: x.error } : undefined; }} />
                <button className="text-xs underline text-white/70" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide violations" : "Show violations"}</button>
              </div>
              {open === r.id && <ViolationList routeId={r.id} />}
            </div>
          </SectionPanel>))}</>
      )}</Status>
      <SectionPanel title="Record a route">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select aria-label="Vehicle terminal" className={inputCls} value={f.terminalId} onChange={(e) => setF({ ...f, terminalId: e.target.value })}>
            <option value="">Choose a member vehicle…</option>
            {terminals.state === "ready" && terminals.data.terminals.map((t) => <option key={t.id} value={t.id}>{t.registration} ({t.serial})</option>)}</select>
          <input className={inputCls} placeholder="Route name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={inputCls} placeholder="Allowed metres off the path" inputMode="numeric" value={f.tolerance} onChange={(e) => setF({ ...f, tolerance: e.target.value })} />
          <textarea className={inputCls + " sm:col-span-3 font-mono"} rows={5} placeholder={"One point per line, in order: latitude, longitude\n-26.2678, 27.8585\n-26.2041, 28.0473"} value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} />
          <div className="sm:col-span-3 space-y-2">
            <p className="text-xs text-white/60">Click on the map to add points in order, or type them above. Existing routes are shown for reference.</p>
            {mapData.state === "ready" && <MapView routes={mapData.data.routes} positions={mapData.data.positions} color={COLOR} draft={draftPoints(f.points)} height={380}
              onPick={(lat, lng) => setF((p) => ({ ...p, points: (p.points.trim() ? p.points.replace(/\s+$/, "") + "\n" : "") + lat + ", " + lng }))} />}
            <div className="flex gap-3 text-xs"><button type="button" className="underline text-white/70" onClick={() => setF((p) => ({ ...p, points: p.points.replace(/\s+$/, "").split("\n").slice(0, -1).join("\n") }))}>Undo last point</button>
              <button type="button" className="underline text-white/70" onClick={() => setF((p) => ({ ...p, points: "" }))}>Clear points</button></div>
          </div>
          <div className="sm:col-span-3"><ActionButton label="Create route" color={COLOR} onRun={create} /></div>
          <p className="sm:col-span-3 text-[11px] text-white/40">The path is checked against vehicle positions; going further than the allowed distance records a violation and a fine under the platform's existing rules.</p>
        </div>
      </SectionPanel>
    </>
  );
}

function ViolationList({ routeId }: { routeId: string }) {
  const [load] = useLoad<{ violations: Violation[] }>(() => call(`/routes/${routeId}/violations`));
  return <Status load={load}>{({ violations }) => violations.length === 0 ? <Empty>No violations on this route.</Empty> : (
    <ul className="space-y-1 text-xs text-white/70">{violations.map((v) => <li key={v.id}>{when(v.at)} · {v.registration ?? "vehicle"} · {v.distanceMeters} m off the path · fine {rand(v.fine)}</li>)}</ul>)}</Status>;
}

export function AssociationMap() {
  const [load, reload] = useLoad<{ routes: MapRoute[]; positions: MapPosition[] }>(() => call("/map"));
  useAutoRefresh(reload, 30_000);                       // vehicle positions stay current without touching the map view
  return <Status load={load}>{({ routes, positions }) => <MapView routes={routes} positions={positions} color={COLOR} />}</Status>;
}

export function DeparturesTrend() {
  const [load] = useLoad<{ days: { day: string; departures: number }[] }>(() => call("/trend?" + rangeQuery({ from: saShift(saToday(), -13), to: saToday() })));
  return <Status load={load}>{({ days }) => <TrendChart days={days.map((d) => ({ day: d.day, value: d.departures }))} color={COLOR} label="Departures, last 14 days" money={false} />}</Status>;
}

/** Fines credited to the association (where off-route fines go). */
export function FinesLedger() {
  const [offset, setOffset] = useState(0);
  const LIMIT = 15;
  const [load] = useLoad<{ total: number; balance?: number; entries: { id: string; amount: number; balanceAfter: number; description: string | null; at: string }[] }>(() => call(`/ledger?limit=${LIMIT}&offset=${offset}`), [offset]);
  return (
    <Status load={load}>{({ total, balance, entries }) => (
      <SectionPanel title={`Fines credited to the association${balance !== undefined ? ` · balance ${rand(balance)}` : ""}`}>
        <div className="p-4 space-y-3">{entries.length === 0 ? <Empty>No fines have been credited yet.</Empty> : (
          <>
            <TableCard title={`${total} entr${total === 1 ? "y" : "ies"}`} color={COLOR} columns={["When", "Detail", "Amount", "Balance"]} rows={entries.map((e) => [when(e.at), e.description ?? "Off-route fine", rand(e.amount), rand(e.balanceAfter)])} />
            <Pager total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>)}
        </div>
      </SectionPanel>
    )}</Status>
  );
}

interface Statement {
  totals: { leviesCharged: number; leviesCollected: number; finesCredited: number; departures: number; passengers: number };
  levies: { member: string; title: string; amount: number; dueDate: string | null; paid: boolean }[]; fines: { amount: number; description: string | null; at: string }[];
}
/** The original statements, as a real-data summary for a period with a CSV download. It is not an audited statement. */
export function AssociationStatements() {
  const [range, setRange] = useState<Range>({ from: monthStart(), to: saToday() });
  const q = rangeQuery(range);
  const [load] = useLoad<Statement>(() => call(`/statements?${q}`), [q]);
  return (
    <SectionPanel title="Summary of recorded money" action={<CsvButton segment="association" path={`/statements.csv?${q}`} color={COLOR} />}>
      <div className="p-4 space-y-4">
        <RangeBar value={range} onChange={setRange} color={COLOR} />
        <Status load={load}>{({ totals: t, levies, fines }) => (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Levies charged" value={rand(t.leviesCharged)} icon={<Coins className="w-4 h-4" />} color={COLOR} />
              <StatCard label="Levies collected" value={rand(t.leviesCollected)} icon={<Coins className="w-4 h-4" />} color="#10B981" />
              <StatCard label="Fines credited" value={rand(t.finesCredited)} icon={<Coins className="w-4 h-4" />} color="#F59E0B" />
              <StatCard label="Departures" value={String(t.departures)} sub={`${t.passengers} passengers recorded`} icon={<Coins className="w-4 h-4" />} color="#3B82F6" />
            </div>
            {levies.length > 0 && <TableCard title="Levies created in this period" color={COLOR} columns={["Member", "Levy", "Amount", "Due", "Status"]} rows={levies.map((l) => [l.member, l.title, rand(l.amount), day(l.dueDate), <Badge key="s" text={l.paid ? "paid" : "unpaid"} color={l.paid ? "#10B981" : "#F59E0B"} />])} />}
            {fines.length > 0 && <TableCard title="Fines credited in this period" color="#F59E0B" columns={["When", "Detail", "Amount"]} rows={fines.map((f) => [when(f.at), f.description ?? "Off-route fine", rand(f.amount)])} />}
            <p className="text-[11px] text-white/40">Figures are added up from recorded levies, fines and departures. This is a summary, not an audited financial statement, and not tax advice. Membership fees and tax filing are not calculated here.</p>
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}
