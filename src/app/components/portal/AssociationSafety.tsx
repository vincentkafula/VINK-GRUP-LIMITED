import { useState } from "react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, inputCls } from "./ui";

/**
 * Safety and conflict (module 9) and route control (module 6): what has happened on the association's routes and between associations, and whether its routes are overloaded, run by vehicles whose licences do not cover them, or run out of turn.
 * These screens record what the association says happened and show what its records indicate; they do not say anyone is at fault. Events name identifiable people: today they are visible to whoever holds the association's login.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;
const SEV: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" }, SEV_TEXT: Record<string, string> = { high: "Act now", medium: "Soon", low: "Keep an eye on" };
const KINDS: [string, string][] = [["accident", "Accident"], ["passenger_complaint", "Passenger complaint"], ["inter_association_dispute", "Dispute with another association"], ["police_matter", "Police matter"], ["regulator_notice", "Regulator notice"]];
const BODIES: [string, string][] = [["santaco", "SANTACO"], ["national_taxi_alliance", "National Taxi Alliance"], ["other", "Another body"]];
const today = () => new Date().toISOString().slice(0, 10);

/* ───────────────────────── safety and conflict ───────────────────────── */
interface Ev { id: string; kind: string; occurredOn: string; title: string; description: string | null; vehicle: string | null; driver: string | null; routeLabel: string | null; injuries: number; fatalities: number; policeCaseNumber: string | null; otherAssociation: string | null; mediator: string | null; escalatedTo: string; escalatedOn: string | null; noticeUntil: string | null; status: string; resolvedOn: string | null; resolution: string | null; daysOpen: number }
interface Summary { measures: { accidents: number; injuries: number; fatalities: number; passengerComplaints: number; disputes: number; policeMatters: number; regulatorNotices: number; open: number; escalated: number; averageDaysToResolve: number | null; noticesInForce: number }; flags: { id: string; severity: string; message: string }[] }
function EventPanel({ e, reload }: { e: Ev; reload: () => void }) {
  const [f, setF] = useState({ policeCaseNumber: e.policeCaseNumber ?? "", mediator: e.mediator ?? "", description: e.description ?? "" }), [esc, setEsc] = useState({ to: "santaco", on: today() }), [res, setRes] = useState({ resolvedOn: today(), resolution: "" });
  if (e.status === "resolved") return <div className="rounded-lg border border-line p-4 text-sm text-fg">Resolved on {e.resolvedOn}: {e.resolution}. A resolved event can no longer be changed.</div>;
  return (
    <div className="space-y-4 rounded-lg border border-line p-4 text-sm text-fg">
      {e.description && <p>{e.description}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Police case number"><input aria-label="Event police case" className={inputCls + " mt-1 w-44"} value={f.policeCaseNumber} onChange={(x) => setF({ ...f, policeCaseNumber: x.target.value })} /></Field>
        <Field label="Mediator"><input aria-label="Event mediator" className={inputCls + " mt-1 w-44"} value={f.mediator} onChange={(x) => setF({ ...f, mediator: x.target.value })} /></Field>
        <Field label="More detail"><input aria-label="Event description" className={inputCls + " mt-1 w-72"} maxLength={2000} value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} /></Field>
        <ActionButton small label="Save detail" color={COLOR} onRun={async () => { const r = await call(`/safety/events/${e.id}`, { method: "PUT", body: f }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
      </div>
      {e.kind === "inter_association_dispute" && (
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <p className="basis-full text-xs text-fg-subtle">{e.escalatedTo === "none" ? "Not yet taken to SANTACO or another body for mediation." : `Escalated to ${BODIES.find(([k]) => k === e.escalatedTo)?.[1]} on ${e.escalatedOn}.`}</p>
          <Field label="Take it to"><select aria-label="Escalate to" className={inputCls + " mt-1 w-52"} value={esc.to} onChange={(x) => setEsc({ ...esc, to: x.target.value })}>{BODIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="On"><input type="date" aria-label="Escalated on" className={inputCls + " mt-1 w-40"} value={esc.on} onChange={(x) => setEsc({ ...esc, on: x.target.value })} /></Field>
          <ActionButton small label="Record escalation" color="#6B7280" onRun={async () => { const r = await call(`/safety/events/${e.id}/escalate`, { method: "POST", body: { to: esc.to, on: esc.on, ...(f.mediator ? { mediator: f.mediator } : {}) } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Recorded." }; }} />
        </div>)}
      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <Field label="Resolved on"><input type="date" aria-label="Resolved on" className={inputCls + " mt-1 w-40"} value={res.resolvedOn} onChange={(x) => setRes({ ...res, resolvedOn: x.target.value })} /></Field>
        <Field label="How it was resolved"><input aria-label="How resolved" className={inputCls + " mt-1 w-72"} maxLength={500} value={res.resolution} onChange={(x) => setRes({ ...res, resolution: x.target.value })} /></Field>
        <ActionButton small label="Mark resolved" color={COLOR} onRun={async () => { const r = await call(`/safety/events/${e.id}/resolve`, { method: "POST", body: res }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />
      </div>
    </div>
  );
}
export function SafetyScreen() {
  const [sum] = useLoad<Summary>(() => call("/safety/summary")), [load, reload] = useLoad<{ events: Ev[] }>(() => call("/safety/events"));
  const [veh] = useLoad<{ vehicles: { id: string; registration: string }[] }>(() => call("/compliance/vehicles")), [drv] = useLoad<{ drivers: { id: string; name: string }[] }>(() => call("/compliance/drivers"));
  const [kind, setKind] = useState(""), [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ kind: "accident", occurredOn: today(), title: "", description: "", vehicleId: "", driverId: "", routeLabel: "", injuries: "0", fatalities: "0", policeCaseNumber: "", otherAssociation: "", noticeUntil: "" });
  return (
    <div className="space-y-4">
      <Status load={sum}>{(s) => {
        const m = s.measures;
        return (
          <SectionPanel title="Safety and conflict, last 12 months">
            <div className="p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Accidents" value={m.injuries || m.fatalities ? `${m.accidents} (${m.injuries} injured, ${m.fatalities} died)` : String(m.accidents)} icon={<span aria-hidden>A</span>} color={COLOR} /><StatCard label="Passenger complaints" value={String(m.passengerComplaints)} icon={<span aria-hidden>C</span>} color={COLOR} />
                <StatCard label="Disputes with other associations" value={String(m.disputes)} icon={<span aria-hidden>D</span>} color={COLOR} /><StatCard label="Open now" value={m.noticesInForce ? `${m.open} (${m.noticesInForce} notice in force)` : String(m.open)} icon={<span aria-hidden>O</span>} color={COLOR} />
              </div>
              <p className="text-sm text-fg">{m.averageDaysToResolve === null ? "Nothing has been resolved yet." : `Resolved events took ${m.averageDaysToResolve} days on average.`}</p>
              {s.flags.length === 0 ? <Empty>Nothing needs attention.</Empty> : <ul className="space-y-2">{s.flags.map((x) => <li key={x.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[x.severity]}>{SEV_TEXT[x.severity]}</Chip><span className="flex-1 min-w-[12rem]">{x.message}</span></li>)}</ul>}
            </div>
          </SectionPanel>);
      }}</Status>
      <SectionPanel title="Record an event">
        <div className="p-4 space-y-3">
          <p className="text-xs text-fg-subtle">These records name identifiable people. Today they are visible to whoever holds your association's login, so keep it to your office bearers. They record what happened; they do not say who is at fault.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="What happened"><select aria-label="Event kind" className={inputCls + " mt-1 w-64"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Date"><input type="date" aria-label="Event date" className={inputCls + " mt-1 w-40"} value={f.occurredOn} onChange={(e) => setF({ ...f, occurredOn: e.target.value })} /></Field>
            <Field label="Short title"><input aria-label="Event title" className={inputCls + " mt-1 w-64"} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Route"><input aria-label="Event route" className={inputCls + " mt-1 w-48"} value={f.routeLabel} onChange={(e) => setF({ ...f, routeLabel: e.target.value })} /></Field>
            {(f.kind === "accident" || f.kind === "passenger_complaint" || f.kind === "police_matter") && <>
              <Field label="Vehicle"><select aria-label="Event vehicle" className={inputCls + " mt-1 w-40"} value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">None</option>{veh.state === "ready" && veh.data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration}</option>)}</select></Field>
              <Field label="Driver"><select aria-label="Event driver" className={inputCls + " mt-1 w-44"} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}><option value="">None</option>{drv.state === "ready" && drv.data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></>}
            {f.kind === "accident" && <>
              <Field label="People injured"><input aria-label="Event injuries" className={inputCls + " mt-1 !w-20"} inputMode="numeric" value={f.injuries} onChange={(e) => setF({ ...f, injuries: e.target.value })} /></Field>
              <Field label="People who died"><input aria-label="Event fatalities" className={inputCls + " mt-1 !w-20"} inputMode="numeric" value={f.fatalities} onChange={(e) => setF({ ...f, fatalities: e.target.value })} /></Field></>}
            {f.kind === "inter_association_dispute" && <Field label="The other association"><input aria-label="Event other association" className={inputCls + " mt-1 w-56"} value={f.otherAssociation} onChange={(e) => setF({ ...f, otherAssociation: e.target.value })} /></Field>}
            {f.kind === "regulator_notice" && <Field label="Applies until (if stated)"><input type="date" aria-label="Event notice until" className={inputCls + " mt-1 w-40"} value={f.noticeUntil} onChange={(e) => setF({ ...f, noticeUntil: e.target.value })} /></Field>}
            <Field label="Police case number"><input aria-label="Event police case number" className={inputCls + " mt-1 w-40"} value={f.policeCaseNumber} onChange={(e) => setF({ ...f, policeCaseNumber: e.target.value })} /></Field>
            <ActionButton label="Record event" color={COLOR} onRun={async () => {
              const body: Record<string, unknown> = { kind: f.kind, occurredOn: f.occurredOn, title: f.title, description: f.description, routeLabel: f.routeLabel, policeCaseNumber: f.policeCaseNumber };
              if (f.vehicleId && f.kind !== "inter_association_dispute" && f.kind !== "regulator_notice") body.vehicleId = f.vehicleId; if (f.driverId && f.kind !== "inter_association_dispute" && f.kind !== "regulator_notice") body.driverId = f.driverId; if (f.kind === "accident") { body.injuries = Number(f.injuries); body.fatalities = Number(f.fatalities); } if (f.kind === "inter_association_dispute") body.otherAssociation = f.otherAssociation; if (f.kind === "regulator_notice" && f.noticeUntil) body.noticeUntil = f.noticeUntil;
              const r = await call("/safety/events", { method: "POST", body }); if ("error" in r) return { error: r.error }; setF({ ...f, title: "", description: "", vehicleId: "", driverId: "", routeLabel: "", injuries: "0", fatalities: "0", policeCaseNumber: "", otherAssociation: "", noticeUntil: "" }); reload(); return { message: "Recorded." };
            }} />
          </div>
        </div>
      </SectionPanel>
      <SectionPanel title="Events">
        <div className="p-4 space-y-3">
          <Field label="Show"><select aria-label="Filter events" className={inputCls + " mt-1 w-64"} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Everything</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Status load={load}>{({ events }) => {
            const shown = events.filter((e) => !kind || e.kind === kind);
            return events.length === 0 ? <Empty>Nothing has been recorded yet.</Empty> : shown.length === 0 ? <Empty>Nothing of that kind.</Empty> : (
              <ul className="space-y-3">{shown.slice(0, 50).map((e) => (
                <li key={e.id} className="text-sm text-fg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b>{e.title}</b> · {KINDS.find(([k]) => k === e.kind)?.[1]} · {e.occurredOn}{e.vehicle ? ` · ${e.vehicle}` : ""}{e.driver ? ` · ${e.driver}` : ""}{e.routeLabel ? ` · ${e.routeLabel}` : ""}{e.kind === "accident" && (e.injuries || e.fatalities) ? ` · ${e.injuries} injured, ${e.fatalities} died` : ""}{e.otherAssociation ? ` · with ${e.otherAssociation}` : ""}{e.noticeUntil ? ` · until ${e.noticeUntil}` : ""}</span>
                    <span className="flex items-center gap-2"><Chip color={e.status === "resolved" ? "#15803d" : SEV.medium}>{e.status === "resolved" ? `Resolved in ${e.daysOpen} days` : `Open ${e.daysOpen} days`}</Chip>{e.escalatedTo !== "none" && <Chip color="#6B7280">Escalated to {BODIES.find(([k]) => k === e.escalatedTo)?.[1]}</Chip>}<button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Close" : "Open"}</button></span>
                  </div>
                  {open === e.id && <div className="mt-3"><EventPanel e={e} reload={reload} /></div>}
                </li>))}</ul>);
          }}</Status>
        </div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── route control ───────────────────────── */
interface RouteRow { id: string; name: string; licensedVehicles: number; operatingVehicles: number; saturationRatio: number | null; band: string; unlicensedOperating: { registration: string; trips: number }[]; offRoute: { registration: string; licenceRoute: string; trips: number }[]; nonMemberOperators: { registration: string; owner: string; trips: number }[] }
interface RankRow { id: string; name: string; departures: number; approvedExceptions: number; checked: number; skips: number; skipPercent: number | null; band: string; skippers: { registration: string; skips: number }[] }
interface Control { windowDays: number; routes: RouteRow[]; ranks: RankRow[]; unmatchedLicences: { registration: string; licenceRoute: string }[]; licencesWithoutRoute: { registration: string }[]; flags: { id: string; severity: string; message: string }[] }
const BAND: Record<string, [string, string]> = { over: ["Over-supplied", SEV.high], warning: ["Nearly full", SEV.medium], ok: ["Within what is licensed", "#15803d"], idle: ["No vehicles operated", "#6B7280"], no_licensed: ["No vehicle licensed for it on record", SEV.high] };
const QBAND: Record<string, [string, string]> = { high: ["Many left out of turn", SEV.high], medium: ["Some left out of turn", SEV.medium], ok: ["Queue respected", "#15803d"], too_few: ["Too few departures to judge", "#6B7280"] };
export function RouteControlScreen() {
  const [load] = useLoad<Control>(() => call("/route-control")), [open, setOpen] = useState<string | null>(null);
  return (
    <Status load={load}>{(c) => (
      <div className="space-y-4">
        <SectionPanel title={`Routes, last ${c.windowDays} days`}>
          <div className="p-4 space-y-4">
            <p className="text-xs text-fg-subtle">A route's saturation is the number of vehicles that actually operated on it, divided by the number your members hold a valid licence for on that route. The licence, not your route list, is the legal authority to operate: your route list is internal. A licence's route is matched to a route by its words, so check the lists at the bottom.</p>
            {c.flags.length > 0 && <ul className="space-y-2">{c.flags.map((x) => <li key={x.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[x.severity]}>{SEV_TEXT[x.severity]}</Chip><span className="flex-1 min-w-[12rem]">{x.message}</span></li>)}</ul>}
            {c.routes.length === 0 ? <Empty>You have no routes recorded yet.</Empty> : (
              <ul className="space-y-3">{c.routes.map((r) => (
                <li key={r.id} className="text-sm text-fg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b>{r.name}</b> · {r.operatingVehicles} operated · {r.licensedVehicles} licensed{r.saturationRatio !== null ? ` · ratio ${r.saturationRatio}` : ""}</span>
                    <span className="flex items-center gap-2"><Chip color={BAND[r.band][1]}>{BAND[r.band][0]}</Chip><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Close" : "Details"}</button></span>
                  </div>
                  {open === r.id && (
                    <div className="mt-2 space-y-3 rounded-lg border border-line p-3">
                      <div><h4 className="text-xs font-bold uppercase text-fg-muted">Members' vehicles with no valid licence</h4>{r.unlicensedOperating.length === 0 ? <p className="text-fg-muted">None.</p> : <ul>{r.unlicensedOperating.map((v) => <li key={v.registration}>{v.registration}: {v.trips} trip{v.trips === 1 ? "" : "s"}</li>)}</ul>}</div>
                      <div><h4 className="text-xs font-bold uppercase text-fg-muted">Members' vehicles whose licence names a different route</h4>{r.offRoute.length === 0 ? <p className="text-fg-muted">None.</p> : <ul>{r.offRoute.map((v) => <li key={v.registration}>{v.registration}: licence names "{v.licenceRoute}", {v.trips} trip{v.trips === 1 ? "" : "s"} here</li>)}</ul>}</div>
                      <div><h4 className="text-xs font-bold uppercase text-fg-muted">Operators who are not your members</h4>{r.nonMemberOperators.length === 0 ? <p className="text-fg-muted">None.</p> : <ul>{r.nonMemberOperators.map((v) => <li key={v.registration}>{v.registration} (owner {v.owner}): {v.trips} trip{v.trips === 1 ? "" : "s"}</li>)}</ul>}</div>
                    </div>)}
                </li>))}</ul>)}
          </div>
        </SectionPanel>
        <SectionPanel title="Queue fairness at your ranks">
          <div className="p-4 space-y-3">
            <p className="text-xs text-fg-subtle">Each departure is checked against the queue: was a vehicle that joined earlier still waiting? A departure out of order that was formally approved, with a reason, is counted as an exception, not a skip. A judgement needs at least ten departures.</p>
            {c.ranks.length === 0 ? <Empty>You have no ranks recorded yet.</Empty> : (
              <ul className="space-y-3 text-sm text-fg">{c.ranks.map((k) => (
                <li key={k.id}><div className="flex flex-wrap items-center justify-between gap-2"><span><b>{k.name}</b> · {k.departures} departures · {k.approvedExceptions} approved exceptions · {k.skips} out of turn{k.skipPercent !== null ? ` (${k.skipPercent}%)` : ""}</span><Chip color={QBAND[k.band][1]}>{QBAND[k.band][0]}</Chip></div>
                  {k.skippers.length > 0 && <p className="text-xs text-fg-muted">Left out of turn: {k.skippers.map((s) => `${s.registration} (${s.skips})`).join(", ")}</p>}</li>))}</ul>)}
          </div>
        </SectionPanel>
        <SectionPanel title="Licences to check">
          <div className="p-4 grid gap-4 md:grid-cols-2 text-sm text-fg">
            <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Name a route you do not have</h4>{c.unmatchedLicences.length === 0 ? <p className="text-fg-muted">None.</p> : <ul>{c.unmatchedLicences.map((l) => <li key={l.registration}>{l.registration}: "{l.licenceRoute}"</li>)}</ul>}</div>
            <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Have no route recorded</h4>{c.licencesWithoutRoute.length === 0 ? <p className="text-fg-muted">None.</p> : <ul>{c.licencesWithoutRoute.map((l) => <li key={l.registration}>{l.registration}</li>)}</ul>}</div>
          </div>
        </SectionPanel>
      </div>)}</Status>
  );
}
