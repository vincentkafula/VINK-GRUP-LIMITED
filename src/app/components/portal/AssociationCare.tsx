import { useState } from "react";
import { Download } from "lucide-react";
import { authFetch } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, when, inputCls } from "./ui";

/**
 * The association's side of marshal care (docs/MARSHAL_COMMISSION.md): approve shifts and see who is working long hours, take safety reports and see where the risk is, answer marshals' complaints and keep their
 * cover on record, and read the overview (with exports and a check on a proof-of-income letter someone presents). A change is described, never a person: patterns name a rank, not a marshal.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const money = (cents: number) => rand(cents / 100);
const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60)} min`;
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;
const dayOffset = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); return d.toISOString().slice(0, 10); };
const TYPE_TEXT: Record<string, string> = { threat: "Threat", fight: "Fight", robbery: "Robbery", overcrowding: "Overcrowding", injury: "Injury", other: "Other" };

/** Downloads a file from the association's API with the signed-in session (so it never needs a public link). */
function DownloadButton({ path, filename, label }: { path: string; filename: string; label: string }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-line text-fg disabled:opacity-60" onClick={async () => {
        setBusy(true); setErr(null);
        try {
          const res = await authFetch(`${API_BASE}/api/portal/association${path}`);
          if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? `Download failed (${res.status})`); return; }
          const url = URL.createObjectURL(await res.blob()), a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        } catch { setErr("We could not reach the server."); } finally { setBusy(false); }
      }}><Download className="w-4 h-4" />{busy ? "Preparing…" : label}</button>
      {err && <span role="alert" className="text-xs text-bad">{err}</span>}
    </span>
  );
}

/* ───────────────────────── shifts ───────────────────────── */
interface Shift { id: string; marshal: string; rank: string; startedAt: string; endedAt: string | null; inProgress: boolean; workedMinutes: number; breakMinutes: number; source: string; status: string; corrected: boolean; note: string | null; flags: string[] }
const FLAG_TEXT: Record<string, string> = { over_shift_limit: "Over the agreed shift", no_break_noted: "No break noted" };
export function ShiftsPanel() {
  const [from, setFrom] = useState(dayOffset(-13)), [to, setTo] = useState(dayOffset(0));
  const [load, reload] = useLoad<{ shifts: Shift[]; weeks: { marshal: string; week: string; minutes: number; limit: number; over: boolean }[] }>(() => call(`/shifts?from=${from}&to=${to}`), [from, to]);
  return (
    <SectionPanel title="Shifts and hours">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><input type="date" aria-label="Shifts from" className={inputCls + " mt-1 w-40"} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" aria-label="Shifts to" className={inputCls + " mt-1 w-40"} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <ActionButton label="Find shifts from activity" color={COLOR} onRun={async () => { const r = await call<{ found: number }>("/shifts/detect", { method: "POST", body: { from, to } }); if ("error" in r) return { error: r.error }; reload(); return { message: `${r.data.found} new shift${r.data.found === 1 ? "" : "s"} found.` }; }} />
        </div>
        <p className="text-xs text-fg-subtle">Shifts are found from each marshal's own queue and departure records, then corrected by the marshal and approved here. The limits are set under Commission.</p>
        <Status load={load}>{({ shifts, weeks }) => (
          <>
            {weeks.filter((w) => w.over).length > 0 && <div className="text-sm text-fg"><p className="font-bold">Weeks over the agreed hours</p><ul>{weeks.filter((w) => w.over).map((w) => <li key={`${w.marshal}|${w.week}`}>{w.marshal}: {hm(w.minutes)} in the week of {w.week} (agreed {hm(w.limit)})</li>)}</ul></div>}
            {shifts.length === 0 ? <Empty>No shifts in this period.</Empty> : (
              <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-2 pr-3">Marshal</th><th className="pr-3">Rank</th><th className="pr-3">Started</th><th className="pr-3 text-right">Worked</th><th className="pr-3">Notes</th><th className="pr-3">Status</th><th /></tr></thead>
                <tbody>{shifts.map((s) => (
                  <tr key={s.id} className="border-b border-line/60 align-top"><td className="py-2 pr-3 font-bold">{s.marshal}</td><td className="pr-3">{s.rank}</td><td className="pr-3">{when(s.startedAt)}</td><td className="pr-3 text-right">{hm(s.workedMinutes)}</td>
                    <td className="pr-3 text-xs text-fg-muted">{[s.source === "manual" ? "added by the marshal" : null, s.corrected ? "corrected" : null, s.breakMinutes ? `break ${s.breakMinutes} min` : null, ...s.flags.map((f) => FLAG_TEXT[f] ?? f), s.note].filter(Boolean).join(" · ")}</td><td className="pr-3">{s.status}</td>
                    <td>{s.status === "proposed" && !s.inProgress && <span className="flex gap-2"><ActionButton small label="Approve" color={COLOR} onRun={async () => { const r = await call(`/shifts/${s.id}/decide`, { method: "POST", body: { decision: "approved" } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} /><ActionButton small label="Reject" color="#6B7280" onRun={async () => { const r = await call(`/shifts/${s.id}/decide`, { method: "POST", body: { decision: "rejected" } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} /></span>}</td></tr>))}</tbody></table></div>)}
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}

/* ───────────────────────── safety ───────────────────────── */
interface Incident { id: string; rank: string; type: string; occurredAt: string; note: string | null; hasPhoto: boolean; status: string; reporter: string | null }
function Photo({ id }: { id: string }) { const [load] = useLoad<{ photo: string }>(() => call(`/incidents/${id}/photo`), [id]); return <Status load={load}>{({ photo }) => <img src={photo} alt="Photo sent with the report" className="mt-2 max-h-56 rounded-lg border border-line" />}</Status>; }
const LEVEL_STYLE: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" };
export function SafetyPanel() {
  const [from, setFrom] = useState(dayOffset(-29)), [to, setTo] = useState(dayOffset(0)), [showPhoto, setShowPhoto] = useState<string | null>(null);
  const [inc, reloadInc] = useLoad<{ incidents: Incident[]; newCount: number }>(() => call(`/incidents?from=${from}&to=${to}`), [from, to]);
  const [risk] = useLoad<{ ranks: { rank: string; total: number; score: number; level: string; byType: Record<string, number>; byPeriod: Record<string, number> }[] }>(() => call(`/risk-map?from=${from}&to=${to}`), [from, to]);
  const [pat] = useLoad<{ patterns: { rank: string; message: string; nowPercent: number; basePercent: number; passengers: number }[] }>(() => call("/patterns"));
  const act = (id: string, status: string, label: string, color: string) => <ActionButton small label={label} color={color} onRun={async () => { const r = await call(`/incidents/${id}/ack`, { method: "POST", body: { status } }); if ("error" in r) return { error: r.error }; reloadInc(); return undefined; }} />;
  return (
    <div className="space-y-4">
      <SectionPanel title="Safety reports">
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From"><input type="date" aria-label="Safety from" className={inputCls + " mt-1 w-40"} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" aria-label="Safety to" className={inputCls + " mt-1 w-40"} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <Status load={inc}>{({ incidents, newCount }) => (
            <>
              <p className="text-sm font-bold text-fg" role="status">{newCount === 0 ? "No new reports." : `${newCount} new report${newCount === 1 ? "" : "s"} waiting.`}</p>
              {incidents.length === 0 ? <Empty>No reports in this period.</Empty> : (
                <ul className="space-y-3">{incidents.map((i) => (
                  <li key={i.id} className="text-sm text-fg border-b border-line/60 pb-3">
                    <div className="flex flex-wrap justify-between gap-2"><span><b>{TYPE_TEXT[i.type] ?? i.type}</b> at {i.rank} · {when(i.occurredAt)} · reported by {i.reporter}</span><span className="font-bold">{i.status === "new" ? "New" : i.status === "acknowledged" ? "Acknowledged" : "Closed"}</span></div>
                    {i.note && <p className="text-xs text-fg-muted">{i.note}</p>}
                    <div className="mt-1 flex flex-wrap gap-2">{i.hasPhoto && <button type="button" className="text-xs underline" aria-expanded={showPhoto === i.id} onClick={() => setShowPhoto(showPhoto === i.id ? null : i.id)}>{showPhoto === i.id ? "Hide photo" : "View photo"}</button>}{i.status === "new" && act(i.id, "acknowledged", "Acknowledge", COLOR)}{i.status !== "closed" && act(i.id, "closed", "Close", "#6B7280")}</div>
                    {showPhoto === i.id && <Photo id={i.id} />}
                  </li>))}</ul>)}
            </>)}</Status>
        </div>
      </SectionPanel>
      <SectionPanel title="Risk by rank">
        <div className="p-4 space-y-3">
          <Status load={risk}>{({ ranks }) => ranks.length === 0 ? <Empty>No ranks yet.</Empty> : (
            <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-2 pr-3">Rank</th><th className="pr-3">Risk</th><th className="pr-3 text-right">Reports</th><th className="pr-3 text-right">Score</th><th className="pr-3">What happened</th><th className="pr-2 text-right">Night</th><th className="pr-2 text-right">Morning</th><th className="pr-2 text-right">Afternoon</th><th className="text-right">Evening</th></tr></thead>
              <tbody>{ranks.map((r) => (
                <tr key={r.rank} className="border-b border-line/60"><td className="py-2 pr-3 font-bold">{r.rank}</td><td className="pr-3"><span className="px-2 py-0.5 rounded text-xs font-bold text-white" style={{ background: LEVEL_STYLE[r.level] }}>{r.level}</span></td><td className="pr-3 text-right">{r.total}</td><td className="pr-3 text-right">{r.score}</td>
                  <td className="pr-3 text-xs text-fg-muted">{Object.entries(r.byType).map(([k, n]) => `${TYPE_TEXT[k] ?? k} ${n}`).join(", ") || "none"}</td>
                  {["night", "morning", "afternoon", "evening"].map((p) => <td key={p} className="pr-2 text-right" style={{ background: r.byPeriod[p] ? `rgba(200,16,46,${Math.min(0.55, 0.12 + r.byPeriod[p] * 0.12)})` : undefined }}>{r.byPeriod[p] ?? 0}</td>)}</tr>))}</tbody></table></div>)}</Status>
          <p className="text-xs text-fg-subtle">The score weighs how serious each kind is (robbery 5; threat, fight and injury 3; overcrowding and other 1). Night is 21:00 to 05:00 South African time.</p>
        </div>
      </SectionPanel>
      <SectionPanel title="Changes worth a look">
        <div className="p-4"><Status load={pat}>{({ patterns }) => patterns.length === 0 ? <Empty>Nothing has changed enough to flag this week.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{patterns.map((p) => <li key={p.rank}><b>{p.message}</b> ({p.nowPercent}% this week against {p.basePercent}%, over {p.passengers} passengers). This is a change at the rank to look into, not a finding about anyone.</li>)}</ul>)}</Status></div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── welfare: complaints and cover ───────────────────────── */
interface Grievance { id: string; category: string; message: string; status: string; response: string | null; marshal: string | null; createdAt: string }
function GrievanceRow({ g, onDone }: { g: Grievance; onDone: () => void }) {
  const [f, setF] = useState({ status: "resolved", response: "" });
  return (
    <li className="text-sm text-fg border-b border-line/60 pb-3">
      <div className="flex flex-wrap justify-between gap-2"><span><b>{g.marshal}</b> · {g.category}: {g.message}</span><span className="font-bold">{g.status.replace("_", " ")}</span></div>
      <div className="text-xs text-fg-muted">{when(g.createdAt)}{g.response ? ` · Answer: ${g.response}` : ""}</div>
      {(g.status === "open" || g.status === "under_review") && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select aria-label="Answer status" className={inputCls + " w-36"} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="under_review">Under review</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
          <input aria-label="Answer to the marshal" className={inputCls + " flex-1 min-w-[12rem]"} placeholder="The answer the marshal will see" maxLength={500} value={f.response} onChange={(e) => setF({ ...f, response: e.target.value })} />
          <ActionButton small label="Answer" color={COLOR} onRun={async () => { const r = await call(`/grievances/${g.id}/respond`, { method: "POST", body: f }); if ("error" in r) return { error: r.error }; onDone(); return { message: "Answered." }; }} />
        </div>)}
    </li>
  );
}
const BENEFIT_NAMES: [string, string][] = [["uif", "UIF"], ["injury_cover", "Injury cover"], ["savings", "Savings scheme"], ["funeral", "Funeral cover"]];
function BenefitsCard() {
  const [load, reload] = useLoad<{ marshals: { id: string; name: string; contributions: { uifCents: number; stokvelCents: number }; benefits: { kind: string; status: string; reference: string | null; contributedCents: number | null }[] }[] }>(() => call("/benefits"));
  const [refs, setRefs] = useState<Record<string, string>>({});
  return (
    <SectionPanel title="Cover and benefits">
      <div className="p-4"><Status load={load}>{({ marshals }) => marshals.length === 0 ? <Empty>No marshals are assigned to your ranks yet.</Empty> : (
        <ul className="space-y-4">{marshals.map((m) => (
          <li key={m.id} className="text-sm text-fg"><p className="font-bold">{m.name} <span className="font-normal text-fg-subtle">· UIF paid in {money(m.contributions.uifCents)} · savings and funeral paid in {money(m.contributions.stokvelCents)}</span></p>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">{BENEFIT_NAMES.map(([k, label]) => { const b = m.benefits.find((x) => x.kind === k)!; return (
              <div key={k} className="flex flex-wrap items-center gap-2"><span className="w-28">{label}</span>
                <select aria-label={`${label} for ${m.name}`} className={inputCls + " w-36"} value={b.status} onChange={async (e) => { await call("/benefits", { method: "PUT", body: { marshalId: m.id, kind: k, status: e.target.value, reference: refs[`${m.id}|${k}`] ?? b.reference ?? undefined } }); reload(); }}><option value="registered">Registered</option><option value="pending">Pending</option><option value="not_registered">Not registered</option></select>
                <input aria-label={`${label} reference for ${m.name}`} className={inputCls + " !w-28"} placeholder="Reference" value={refs[`${m.id}|${k}`] ?? b.reference ?? ""} onChange={(e) => setRefs({ ...refs, [`${m.id}|${k}`]: e.target.value })} /></div>); })}</div></li>))}</ul>)}</Status>
        <p className="text-[11px] text-fg-subtle mt-2">What each marshal has paid in is read from their issued payslips. A reference is typed after the status is chosen, then the status is set again to keep it.</p></div>
    </SectionPanel>
  );
}
export function WelfarePanel() {
  const [status, setStatus] = useState("");
  const [load, reload] = useLoad<{ grievances: Grievance[] }>(() => call(`/grievances${status ? `?status=${status}` : ""}`), [status]);
  const [ins] = useLoad<{ total: number; open: number; byCategory: Record<string, number>; averageHoursToAnswer: number | null }>(() => call(`/welfare-insights?from=${dayOffset(-89)}&to=${dayOffset(0)}`));
  return (
    <div className="space-y-4">
      <SectionPanel title="What marshals are raising (last 90 days)">
        <div className="p-4"><Status load={ins}>{(i) => i.total === 0 ? <Empty>Nothing has been raised.</Empty> : (
          <div className="text-sm text-fg space-y-1" aria-live="polite"><p><b>{i.total}</b> raised, <b>{i.open}</b> still open{i.averageHoursToAnswer !== null ? `, answered in ${i.averageHoursToAnswer} hours on average` : ""}.</p><p className="text-fg-muted">{Object.entries(i.byCategory).map(([k, n]) => `${k} ${n}`).join(" · ")}</p></div>)}</Status></div>
      </SectionPanel>
      <SectionPanel title="Complaints and requests">
        <div className="p-4 space-y-4">
          <Field label="Show"><select aria-label="Show complaints" className={inputCls + " mt-1 w-44"} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="open">Open</option><option value="under_review">Under review</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></Field>
          <Status load={load}>{({ grievances }) => grievances.length === 0 ? <Empty>No complaints.</Empty> : <ul className="space-y-3">{grievances.map((g) => <GrievanceRow key={g.id} g={g} onDone={reload} />)}</ul>}</Status>
        </div>
      </SectionPanel>
      <BenefitsCard />
    </div>
  );
}

/* ───────────────────────── the overview ───────────────────────── */
interface Kpis { from: string; to: string; totalFaresCents: number; trips: number; tapPassengers: number; cashPassengersEstimate: number; tapSharePercent: number | null; commissionPaidCents: number; commissionIssuedCents: number; payslipsIssued: number; disputesOpen: number; disputesResolved: number; incidents: number; averageShiftMinutes: number | null; marshals: number; verifiedProfiles: number }
function VerifyLetter() {
  const [f, setF] = useState({ number: "", code: "" }), [res, setRes] = useState<{ valid: boolean; marshal?: string; from?: string; to?: string; issuedAt?: string; intact?: boolean } | null>(null);
  return (
    <SectionPanel title="Check a proof-of-income letter">
      <div className="p-4 space-y-3 text-sm text-fg">
        <p>A bank or landlord may ask you to confirm a letter one of your marshals gives them. Enter its number and code. This confirms the letter is genuine and from one of your marshals; it does not show the figures.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Letter number"><input aria-label="Letter number" className={inputCls + " mt-1 w-56"} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
          <Field label="Code"><input aria-label="Letter code" className={inputCls + " mt-1 w-40"} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <ActionButton label="Check" color={COLOR} onRun={async () => { const r = await call<{ valid: boolean; marshal?: string; from?: string; to?: string; issuedAt?: string; intact?: boolean }>("/income-letters/verify", { method: "POST", body: f }); if ("error" in r) { setRes(null); return { error: r.error }; } setRes(r.data); return undefined; }} />
        </div>
        {res && (res.valid ? <p role="status"><b>Genuine.</b> Issued to {res.marshal} on {String(res.issuedAt).slice(0, 10)}, covering {res.from} to {res.to}.{res.intact === false ? " The payslips behind it have changed since it was made, so it should not be relied on." : ""}</p> : <p role="status"><b>Not recognised.</b> No letter of one of your marshals has that number and code.</p>)}
      </div>
    </SectionPanel>
  );
}
export function OverviewPanel() {
  const [from, setFrom] = useState(dayOffset(-29)), [to, setTo] = useState(dayOffset(0)), [rankId, setRankId] = useState(""), [marshalId, setMarshalId] = useState(""), [rec, setRec] = useState("");
  const q = `from=${from}&to=${to}${rankId ? `&rankId=${rankId}` : ""}${marshalId ? `&marshalId=${marshalId}` : ""}`;
  const [kpis] = useLoad<{ kpis: Kpis }>(() => call(`/kpis?${q}`), [q]);
  const [ranks] = useLoad<{ ranks: { id: string; name: string }[] }>(() => call("/ranks"));
  const [marshals] = useLoad<{ marshals: { id: string; name: string }[] }>(() => call("/commission/marshals"));
  const [record] = useLoad<{ record: { startDate: string | null; tenureDays: number; totalTrips: number; verified: boolean; missing: string[]; ranks: { rank: string; trips: number }[] } } | null>(() => (rec ? call(`/work-record/${rec}`) : Promise.resolve({ data: null })), [rec]);
  const rk = ranks.state === "ready" ? ranks.data.ranks ?? [] : [], ms = marshals.state === "ready" ? marshals.data.marshals ?? [] : [];
  return (
    <div className="space-y-4">
      <SectionPanel title="Marshal overview">
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From"><input type="date" aria-label="Overview from" className={inputCls + " mt-1 w-40"} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" aria-label="Overview to" className={inputCls + " mt-1 w-40"} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Rank"><select aria-label="Overview rank" className={inputCls + " mt-1 w-40"} value={rankId} onChange={(e) => setRankId(e.target.value)}><option value="">All ranks</option>{rk.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            <Field label="Marshal"><select aria-label="Overview marshal" className={inputCls + " mt-1 w-40"} value={marshalId} onChange={(e) => setMarshalId(e.target.value)}><option value="">All marshals</option>{ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          </div>
          <Status load={kpis}>{({ kpis: k }) => (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Fares on rank devices" value={money(k.totalFaresCents)} icon={<span aria-hidden>R</span>} color={COLOR} /><StatCard label="Trips" value={String(k.trips)} icon={<span aria-hidden>#</span>} color={COLOR} /><StatCard label="Paid by tap" value={k.tapSharePercent === null ? "No counts yet" : `${k.tapSharePercent}%`} icon={<span aria-hidden>%</span>} color={COLOR} />
              </div>
              <ul className="text-sm text-fg grid gap-1 sm:grid-cols-2">
                <li>Commission issued: <b>{money(k.commissionIssuedCents)}</b> (paid {money(k.commissionPaidCents)})</li><li>Payslips issued: <b>{k.payslipsIssued}</b></li>
                <li>Queries: <b>{k.disputesOpen}</b> open, <b>{k.disputesResolved}</b> resolved</li><li>Incidents reported: <b>{k.incidents}</b></li>
                <li>Average shift: <b>{k.averageShiftMinutes === null ? "no shifts" : hm(k.averageShiftMinutes)}</b></li><li>Verified profiles: <b>{k.verifiedProfiles}</b> of {k.marshals}</li>
              </ul>
              <p className="text-[11px] text-fg-subtle">Tap share is worked out from the passengers a marshal counted at departure against the fares tapped; the rest is an estimate of cash, not a count.</p>
              <div className="flex flex-wrap gap-3"><DownloadButton path={`/kpis.csv?${q}`} filename={`marshal-overview-${from}-to-${to}.csv`} label="Download CSV" /><DownloadButton path={`/kpis.pdf?${q}`} filename={`marshal-overview-${from}-to-${to}.pdf`} label="Download PDF" /></div>
            </>)}</Status>
        </div>
      </SectionPanel>
      <SectionPanel title="A marshal's work record">
        <div className="p-4 space-y-3 text-sm text-fg">
          <Field label="Marshal"><select aria-label="Record marshal" className={inputCls + " mt-1 w-48"} value={rec} onChange={(e) => setRec(e.target.value)}><option value="">Choose</option>{ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          {rec && <Status load={record}>{(d) => d ? <div><p>Started {d.record.startDate ?? "(not recorded)"} · {d.record.tenureDays} days · {d.record.totalTrips} trips{d.record.ranks.length ? ` · ${d.record.ranks.map((r) => `${r.rank} ${r.trips}`).join(", ")}` : ""}</p><p className="font-bold">{d.record.verified ? "Verified" : `Not yet verified: needs ${d.record.missing.join(", ")}`}</p></div> : null}</Status>}
        </div>
      </SectionPanel>
      <VerifyLetter />
    </div>
  );
}
