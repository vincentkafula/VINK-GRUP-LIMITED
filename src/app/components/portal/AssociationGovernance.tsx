import { useState } from "react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, inputCls } from "./ui";

/**
 * Governance and discipline (docs/ASSOCIATION_COMPLIANCE.md, module 8): how an association shows it meets, decides, holds its elections on time, declares interests and disciplines fairly.
 * These screens record what the association says happened and flag what looks wrong. A case's outcome is what the association's own hearing decided: nothing here says anyone is guilty.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;
const SEV: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" }, SEV_TEXT: Record<string, string> = { high: "Act now", medium: "Soon", low: "Keep an eye on" };
const KINDS: [string, string][] = [["agm", "Annual general meeting"], ["executive", "Executive committee"], ["general", "General meeting"], ["special", "Special meeting"], ["other", "Other"]];
const today = () => new Date().toISOString().slice(0, 10);

/* ───────────────────────── governance ───────────────────────── */
interface Summary { today: string; settings: { electionIntervalMonths: number | null; disciplineLimitDays: number }; measures: { meetingsThisYear: number; upcomingMeetings: number; averageAttendancePercent: number | null; openResolutions: number; overdueResolutions: number; lastElectionOn: string | null; nextElectionDue: string | null; openCases: number }; flags: { id: string; category: string; severity: string; message: string }[] }
interface Meeting { id: string; heldOn: string; kind: string; title: string; venue: string | null; agenda: string | null; minutes: string | null; minutesAdoptedOn: string | null; upcoming: boolean; attendance: { name: string; memberId: string | null; status: string }[] }
function MeetingPanel({ m, members, reload }: { m: Meeting; members: { memberId: string; name: string }[]; reload: () => void }) {
  const [minutes, setMinutes] = useState(m.minutes ?? ""), [adopted, setAdopted] = useState(m.minutesAdoptedOn ?? "");
  const [att, setAtt] = useState(m.attendance), [guest, setGuest] = useState(""), [mem, setMem] = useState("");
  const setStatus = (i: number, status: string) => setAtt(att.map((a, j) => (j === i ? { ...a, status } : a)));
  return (
    <div className="space-y-4 rounded-lg border border-line p-4">
      <div>
        <h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Minutes</h4>
        <textarea aria-label={`Minutes of ${m.title}`} className={inputCls + " min-h-[6rem]"} maxLength={20000} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <Field label="Adopted on (at a following meeting)"><input type="date" aria-label={`Minutes adopted for ${m.title}`} className={inputCls + " mt-1 w-40"} value={adopted} onChange={(e) => setAdopted(e.target.value)} /></Field>
          <ActionButton small label="Save minutes" color={COLOR} onRun={async () => { const r = await call(`/governance/meetings/${m.id}/minutes`, { method: "PUT", body: { minutes, adoptedOn: adopted || null } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
        </div>
      </div>
      <div>
        <h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Attendance</h4>
        {att.length === 0 ? <p className="text-sm text-fg-muted">Nobody recorded yet.</p> : (
          <ul className="space-y-1 text-sm text-fg">{att.map((a, i) => (
            <li key={a.name} className="flex flex-wrap items-center gap-2"><span className="w-48">{a.name}</span>
              <select aria-label={`Attendance of ${a.name}`} className={inputCls + " w-32"} value={a.status} onChange={(e) => setStatus(i, e.target.value)}><option value="present">Present</option><option value="apology">Apology</option><option value="absent">Absent</option></select>
              <button type="button" className="text-xs underline" onClick={() => setAtt(att.filter((_, j) => j !== i))}>Remove {a.name}</button></li>))}</ul>)}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Add a member"><select aria-label="Add attendee member" className={inputCls + " mt-1 w-48"} value={mem} onChange={(e) => { const x = members.find((y) => y.memberId === e.target.value); if (x && !att.some((a) => a.name.toLowerCase() === x.name.toLowerCase())) setAtt([...att, { name: x.name, memberId: x.memberId, status: "present" }]); setMem(""); }}><option value="">Choose</option>{members.filter((x) => !att.some((a) => a.memberId === x.memberId)).map((x) => <option key={x.memberId} value={x.memberId}>{x.name}</option>)}</select></Field>
          <Field label="Or a guest, by name"><input aria-label="Add attendee guest" className={inputCls + " mt-1 w-44"} value={guest} onChange={(e) => setGuest(e.target.value)} /></Field>
          <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold border border-line text-fg" onClick={() => { const n = guest.trim(); if (n && !att.some((a) => a.name.toLowerCase() === n.toLowerCase())) setAtt([...att, { name: n, memberId: null, status: "present" }]); setGuest(""); }}>Add guest</button>
          <ActionButton small label="Save attendance" color={COLOR} onRun={async () => { const r = await call(`/governance/meetings/${m.id}/attendance`, { method: "PUT", body: { attendance: att } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
        </div>
      </div>
    </div>
  );
}
function MeetingsCard() {
  const [load, reload] = useLoad<{ meetings: Meeting[] }>(() => call("/governance/meetings"));
  const [acc] = useLoad<{ members: { memberId: string; name: string }[] }>(() => call("/compliance/acceptances"));
  const [open, setOpen] = useState<string | null>(null), [f, setF] = useState({ kind: "executive", heldOn: today(), title: "", venue: "", agenda: "" });
  const members = acc.state === "ready" ? acc.data.members : [];
  return (
    <SectionPanel title="Meetings">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Kind"><select aria-label="Meeting kind" className={inputCls + " mt-1 w-52"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Date"><input type="date" aria-label="Meeting date" className={inputCls + " mt-1 w-40"} value={f.heldOn} onChange={(e) => setF({ ...f, heldOn: e.target.value })} /></Field>
          <Field label="Title"><input aria-label="Meeting title" className={inputCls + " mt-1 w-52"} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Venue"><input aria-label="Meeting venue" className={inputCls + " mt-1 w-40"} value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
          <ActionButton small label="Add meeting" color={COLOR} onRun={async () => { const r = await call("/governance/meetings", { method: "POST", body: f }); if ("error" in r) return { error: r.error }; setF({ ...f, title: "", venue: "", agenda: "" }); reload(); return { message: "Added." }; }} />
        </div>
        <Status load={load}>{({ meetings }) => meetings.length === 0 ? <Empty>No meetings recorded yet.</Empty> : (
          <ul className="space-y-3">{meetings.slice(0, 30).map((m) => {
            const present = m.attendance.filter((a) => a.status === "present").length;
            return (
              <li key={m.id} className="text-sm text-fg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{m.title}</b> · {KINDS.find(([k]) => k === m.kind)?.[1]} · {m.heldOn}{m.venue ? ` · ${m.venue}` : ""}{m.attendance.length ? ` · ${present} of ${m.attendance.length} present` : ""}</span>
                  <span className="flex items-center gap-2">{m.upcoming ? <Chip color="#6B7280">Upcoming</Chip> : m.minutesAdoptedOn ? <Chip color="#15803d">Minutes adopted {m.minutesAdoptedOn}</Chip> : m.minutes ? <Chip color={SEV.medium}>Minutes not adopted</Chip> : <Chip color={SEV.medium}>No minutes</Chip>}
                    <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? "Close" : "Open"}</button></span>
                </div>
                {open === m.id && <div className="mt-3"><MeetingPanel m={m} members={members} reload={reload} /></div>}
              </li>);
          })}</ul>)}</Status>
      </div>
    </SectionPanel>
  );
}
interface Resolution { id: string; number: string; text: string; meeting: string | null; actionOwner: string | null; dueOn: string | null; status: string; overdue: boolean }
function ResolutionsCard() {
  const [load, reload] = useLoad<{ resolutions: Resolution[] }>(() => call("/governance/resolutions"));
  const [ms] = useLoad<{ meetings: Meeting[] }>(() => call("/governance/meetings"));
  const [f, setF] = useState({ text: "", meetingId: "", actionOwner: "", dueOn: "" });
  return (
    <SectionPanel title="Resolutions">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Resolution"><input aria-label="Resolution text" className={inputCls + " mt-1 w-72"} maxLength={1000} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
          <Field label="Passed at"><select aria-label="Resolution meeting" className={inputCls + " mt-1 w-52"} value={f.meetingId} onChange={(e) => setF({ ...f, meetingId: e.target.value })}><option value="">No meeting chosen</option>{ms.state === "ready" && ms.data.meetings.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.heldOn})</option>)}</select></Field>
          <Field label="Who acts"><input aria-label="Resolution owner" className={inputCls + " mt-1 w-36"} value={f.actionOwner} onChange={(e) => setF({ ...f, actionOwner: e.target.value })} /></Field>
          <Field label="Due"><input type="date" aria-label="Resolution due" className={inputCls + " mt-1 w-40"} value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></Field>
          <ActionButton small label="Record resolution" color={COLOR} onRun={async () => { const r = await call<{ number: string }>("/governance/resolutions", { method: "POST", body: { text: f.text, meetingId: f.meetingId || undefined, actionOwner: f.actionOwner, dueOn: f.dueOn } }); if ("error" in r) return { error: r.error }; const n = (r.data as unknown as { number: string }).number; setF({ text: "", meetingId: "", actionOwner: "", dueOn: "" }); reload(); return { message: `Recorded as resolution ${n}.` }; }} />
        </div>
        <Status load={load}>{({ resolutions }) => resolutions.length === 0 ? <Empty>No resolutions recorded yet.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{resolutions.slice(0, 40).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
              <span><b>{r.number}</b> · {r.text}{r.meeting ? ` · ${r.meeting}` : ""}{r.actionOwner ? ` · ${r.actionOwner}` : ""}{r.dueOn ? ` · due ${r.dueOn}` : ""} {r.overdue ? <Chip color={SEV.medium}>Overdue</Chip> : r.status !== "open" ? <Chip color="#6B7280">{r.status === "done" ? "Done" : "Cancelled"}</Chip> : null}</span>
              {r.status === "open" && <span className="flex gap-2"><ActionButton small label="Mark done" color={COLOR} onRun={async () => { const x = await call(`/governance/resolutions/${r.id}/status`, { method: "POST", body: { status: "done" } }); if ("error" in x) return { error: x.error }; reload(); return undefined; }} /><ActionButton small label="Cancel" color="#6B7280" onRun={async () => { const x = await call(`/governance/resolutions/${r.id}/status`, { method: "POST", body: { status: "cancelled" } }); if ("error" in x) return { error: x.error }; reload(); return undefined; }} /></span>}
            </li>))}</ul>)}</Status>
      </div>
    </SectionPanel>
  );
}
function ElectionsCard() {
  const [load, reload] = useLoad<{ elections: { id: string; heldOn: string; results: string | null; notes: string | null; nextDueOn: string | null }[] }>(() => call("/governance/elections"));
  const [f, setF] = useState({ heldOn: "", results: "", nextDueOn: "" });
  return (
    <SectionPanel title="Elections">
      <div className="p-4 space-y-3">
        <p className="text-xs text-fg-subtle">How often your constitution requires elections is set under Registration. An election is flagged as overdue the day after it was due.</p>
        <Status load={load}>{({ elections }) => elections.length === 0 ? <Empty>No election recorded yet.</Empty> : <ul className="space-y-1 text-sm text-fg">{elections.map((e) => <li key={e.id}><b>{e.heldOn}</b>{e.results ? ` · ${e.results}` : ""}{e.nextDueOn ? ` · next due ${e.nextDueOn}` : ""}</li>)}</ul>}</Status>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Held on"><input type="date" aria-label="Election held" className={inputCls + " mt-1 w-40"} value={f.heldOn} onChange={(e) => setF({ ...f, heldOn: e.target.value })} /></Field>
          <Field label="Who was elected"><input aria-label="Election results" className={inputCls + " mt-1 w-64"} value={f.results} onChange={(e) => setF({ ...f, results: e.target.value })} /></Field>
          <Field label="Next election due"><input type="date" aria-label="Election next due" className={inputCls + " mt-1 w-40"} value={f.nextDueOn} onChange={(e) => setF({ ...f, nextDueOn: e.target.value })} /></Field>
          <ActionButton small label="Record election" color={COLOR} onRun={async () => { const r = await call("/governance/elections", { method: "POST", body: f }); if ("error" in r) return { error: r.error }; setF({ heldOn: "", results: "", nextDueOn: "" }); reload(); return { message: "Recorded." }; }} />
        </div>
      </div>
    </SectionPanel>
  );
}
function DeclarationsCard() {
  const [load, reload] = useLoad<{ declarations: { id: string; name: string; office: string; declaredOn: string; none: boolean; interest: string | null }[] }>(() => call("/governance/declarations"));
  const [ob] = useLoad<{ officeBearers: { id: string; name: string; office: string }[] }>(() => call("/compliance/office-bearers"));
  const [f, setF] = useState({ officeBearerId: "", declaredOn: today(), none: true, interest: "" });
  return (
    <SectionPanel title="Declarations of interest">
      <div className="p-4 space-y-3">
        <p className="text-xs text-fg-subtle">Each office bearer declares any interest that could conflict with their duties, once a year. Declaring no interest is a declaration too.</p>
        <Status load={load}>{({ declarations }) => declarations.length === 0 ? <Empty>No declarations yet.</Empty> : <ul className="space-y-1 text-sm text-fg">{declarations.slice(0, 20).map((d) => <li key={d.id}><b>{d.name}</b> ({d.office}) · {d.declaredOn} · {d.none ? "No interest to declare" : d.interest}</li>)}</ul>}</Status>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Office bearer"><select aria-label="Declaring office bearer" className={inputCls + " mt-1 w-52"} value={f.officeBearerId} onChange={(e) => setF({ ...f, officeBearerId: e.target.value })}><option value="">Choose</option>{ob.state === "ready" && ob.data.officeBearers.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.office})</option>)}</select></Field>
          <Field label="Date"><input type="date" aria-label="Declaration date" className={inputCls + " mt-1 w-40"} value={f.declaredOn} onChange={(e) => setF({ ...f, declaredOn: e.target.value })} /></Field>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.none} onChange={(e) => setF({ ...f, none: e.target.checked })} />No interest to declare</label>
          {!f.none && <Field label="The interest"><input aria-label="Declared interest" className={inputCls + " mt-1 w-72"} maxLength={500} value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })} /></Field>}
          <ActionButton small label="Record declaration" color={COLOR} onRun={async () => { const r = await call("/governance/declarations", { method: "POST", body: { officeBearerId: f.officeBearerId, declaredOn: f.declaredOn, none: f.none, ...(f.none ? {} : { interest: f.interest }) } }); if ("error" in r) return { error: r.error }; setF({ ...f, interest: "" }); reload(); return { message: "Recorded." }; }} />
        </div>
      </div>
    </SectionPanel>
  );
}
export function GovernanceScreen() {
  const [load] = useLoad<Summary>(() => call("/governance/summary"));
  return (
    <div className="space-y-4">
      <Status load={load}>{(s) => {
        const m = s.measures;
        return (
          <SectionPanel title="Governance">
            <div className="p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Meetings held this year" value={String(m.meetingsThisYear)} icon={<span aria-hidden>M</span>} color={COLOR} />
                <StatCard label="Average attendance" value={m.averageAttendancePercent === null ? "No data" : `${m.averageAttendancePercent}%`} icon={<span aria-hidden>A</span>} color={COLOR} />
                <StatCard label="Open resolutions" value={m.overdueResolutions > 0 ? `${m.openResolutions} (${m.overdueResolutions} overdue)` : String(m.openResolutions)} icon={<span aria-hidden>R</span>} color={COLOR} />
                <StatCard label="Next election due" value={m.nextElectionDue ?? "Not set"} icon={<span aria-hidden>E</span>} color={COLOR} />
              </div>
              {s.flags.length === 0 ? <Empty>Nothing needs attention.</Empty> : <ul className="space-y-2">{s.flags.map((f) => <li key={f.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[f.severity]}>{SEV_TEXT[f.severity]}</Chip><span className="flex-1 min-w-[12rem]">{f.message}</span></li>)}</ul>}
            </div>
          </SectionPanel>);
      }}</Status>
      <MeetingsCard /><ResolutionsCard /><ElectionsCard /><DeclarationsCard />
    </div>
  );
}

/* ───────────────────────── discipline ───────────────────────── */
interface Case { id: string; subjectKind: string; subjectName: string; complaint: string; charge: string | null; openedOn: string; hearingOn: string | null; outcome: string | null; sanction: string | null; decidedOn: string | null; appealLodgedOn: string | null; appealOutcome: string | null; closedOn: string | null; status: string; daysOpen: number }
const STATUS_TEXT: Record<string, string> = { open: "Open", hearing_set: "Hearing set", decided: "Decided", appealed: "On appeal", closed: "Closed" };
const OUTCOME_TEXT: Record<string, string> = { upheld: "Upheld", not_upheld: "Not upheld", withdrawn: "Withdrawn" };
function CasePanel({ c, reload }: { c: Case; reload: () => void }) {
  const [charge, setCharge] = useState(c.charge ?? ""), [hearing, setHearing] = useState(c.hearingOn ?? ""), [o, setO] = useState({ outcome: "upheld", decidedOn: today(), sanction: "" }), [appeal, setAppeal] = useState(today()), [ao, setAo] = useState("upheld");
  const send = async (body: Record<string, unknown>, msg: string) => { const r = await call(`/governance/cases/${c.id}`, { method: "PUT", body }); if ("error" in r) return { error: r.error }; reload(); return { message: msg }; };
  if (c.status === "closed") return <div className="rounded-lg border border-line p-4 text-sm text-fg-muted">This case is closed{c.closedOn ? ` (${c.closedOn})` : ""} and can no longer be changed.</div>;
  return (
    <div className="space-y-4 rounded-lg border border-line p-4 text-sm text-fg">
      <p><b>Complaint:</b> {c.complaint}</p>
      {!c.outcome && <div className="flex flex-wrap items-end gap-3">
        <Field label="Charge under the code of conduct"><input aria-label="Case charge" className={inputCls + " mt-1 w-72"} value={charge} onChange={(e) => setCharge(e.target.value)} /></Field>
        <Field label="Hearing date"><input type="date" aria-label="Case hearing" className={inputCls + " mt-1 w-40"} value={hearing} onChange={(e) => setHearing(e.target.value)} /></Field>
        <ActionButton small label="Save charge and hearing" color={COLOR} onRun={() => send({ charge, hearingOn: hearing || null }, "Saved.")} />
      </div>}
      {!c.outcome && <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <Field label="Outcome of the hearing"><select aria-label="Case outcome" className={inputCls + " mt-1 w-40"} value={o.outcome} onChange={(e) => setO({ ...o, outcome: e.target.value })}><option value="upheld">Upheld</option><option value="not_upheld">Not upheld</option><option value="withdrawn">Withdrawn</option></select></Field>
        <Field label="Decided on"><input type="date" aria-label="Case decided" className={inputCls + " mt-1 w-40"} value={o.decidedOn} onChange={(e) => setO({ ...o, decidedOn: e.target.value })} /></Field>
        {o.outcome === "upheld" && <Field label="Sanction imposed"><input aria-label="Case sanction" className={inputCls + " mt-1 w-72"} maxLength={500} value={o.sanction} onChange={(e) => setO({ ...o, sanction: e.target.value })} /></Field>}
        <ActionButton small label="Record outcome" color={COLOR} onRun={() => send({ outcome: o.outcome, decidedOn: o.decidedOn, ...(o.outcome === "upheld" ? { sanction: o.sanction } : {}) }, "Recorded.")} />
      </div>}
      {c.outcome && <p><b>Outcome:</b> {OUTCOME_TEXT[c.outcome]} on {c.decidedOn}{c.sanction ? ` · sanction: ${c.sanction}` : ""}</p>}
      {c.outcome && c.outcome !== "withdrawn" && !c.appealLodgedOn && <div className="flex flex-wrap items-end gap-3"><Field label="Appeal lodged on"><input type="date" aria-label="Appeal lodged" className={inputCls + " mt-1 w-40"} value={appeal} onChange={(e) => setAppeal(e.target.value)} /></Field><ActionButton small label="Record appeal" color="#6B7280" onRun={() => send({ appealLodgedOn: appeal }, "Recorded.")} /></div>}
      {c.appealLodgedOn && <p><b>Appeal</b> lodged on {c.appealLodgedOn}{c.appealOutcome ? ` · ${c.appealOutcome}` : " · no outcome yet"}</p>}
      {c.appealLodgedOn && !c.appealOutcome && <div className="flex flex-wrap items-end gap-3"><Field label="Outcome of the appeal"><select aria-label="Appeal outcome" className={inputCls + " mt-1 w-40"} value={ao} onChange={(e) => setAo(e.target.value)}><option value="upheld">Decision stands</option><option value="overturned">Overturned</option><option value="varied">Varied</option></select></Field><ActionButton small label="Record appeal outcome" color={COLOR} onRun={() => send({ appealOutcome: ao }, "Recorded.")} /></div>}
      {c.outcome && (!c.appealLodgedOn || c.appealOutcome) && <ActionButton small label="Close the case" color="#6B7280" onRun={() => send({ close: true }, "Closed.")} />}
    </div>
  );
}
export function DisciplineScreen() {
  const [load, reload] = useLoad<{ cases: Case[] }>(() => call("/governance/cases"));
  const [acc] = useLoad<{ members: { memberId: string; name: string }[] }>(() => call("/compliance/acceptances"));
  const [open, setOpen] = useState<string | null>(null), [f, setF] = useState({ subjectKind: "member", subjectId: "", subjectName: "", complaint: "", charge: "", openedOn: today() });
  return (
    <div className="space-y-4">
      <SectionPanel title="Disciplinary cases">
        <div className="p-4 space-y-4">
          <p className="text-xs text-fg-subtle">These hold allegations about identifiable people. Today they are visible to whoever holds your association's login, so keep it to your office bearers. A case's outcome is what your own hearing decided; this system does not judge anyone.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="About a"><select aria-label="Case subject kind" className={inputCls + " mt-1 w-32"} value={f.subjectKind} onChange={(e) => setF({ ...f, subjectKind: e.target.value, subjectId: "" })}><option value="member">Member</option><option value="driver">Driver</option><option value="marshal">Marshal</option><option value="other">Someone else</option></select></Field>
            {f.subjectKind === "member" && <Field label="Member"><select aria-label="Case member" className={inputCls + " mt-1 w-48"} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">Not one of the list</option>{acc.state === "ready" && acc.data.members.map((m) => <option key={m.memberId} value={m.memberId}>{m.name}</option>)}</select></Field>}
            {!(f.subjectKind === "member" && f.subjectId) && <Field label="Name"><input aria-label="Case subject name" className={inputCls + " mt-1 w-44"} value={f.subjectName} onChange={(e) => setF({ ...f, subjectName: e.target.value })} /></Field>}
            <Field label="Complaint"><input aria-label="Case complaint" className={inputCls + " mt-1 w-72"} maxLength={2000} value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} /></Field>
            <Field label="Opened on"><input type="date" aria-label="Case opened" className={inputCls + " mt-1 w-40"} value={f.openedOn} onChange={(e) => setF({ ...f, openedOn: e.target.value })} /></Field>
            <ActionButton small label="Open case" color={COLOR} onRun={async () => { const r = await call("/governance/cases", { method: "POST", body: { subjectKind: f.subjectKind, ...(f.subjectId ? { subjectId: f.subjectId } : {}), subjectName: f.subjectName, complaint: f.complaint, openedOn: f.openedOn } }); if ("error" in r) return { error: r.error }; setF({ ...f, subjectId: "", subjectName: "", complaint: "" }); reload(); return { message: "Case opened." }; }} />
          </div>
          <Status load={load}>{({ cases }) => cases.length === 0 ? <Empty>No cases recorded.</Empty> : (
            <ul className="space-y-3">{cases.map((c) => (
              <li key={c.id} className="text-sm text-fg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{c.subjectName}</b> ({c.subjectKind}) · opened {c.openedOn} · {c.status === "closed" ? `closed after ${c.daysOpen} days` : `${c.daysOpen} days open`}{c.charge ? ` · ${c.charge}` : ""}</span>
                  <span className="flex items-center gap-2"><Chip color={c.status === "closed" ? "#6B7280" : c.status === "open" ? SEV.medium : "#15803d"}>{STATUS_TEXT[c.status]}{c.outcome ? `: ${OUTCOME_TEXT[c.outcome].toLowerCase()}` : ""}</Chip><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Close" : "Open"}</button></span>
                </div>
                {open === c.id && <div className="mt-3"><CasePanel c={c} reload={reload} /></div>}
              </li>))}</ul>)}</Status>
        </div>
      </SectionPanel>
    </div>
  );
}
