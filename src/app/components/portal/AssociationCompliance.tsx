import { useState } from "react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, when, inputCls } from "./ui";

/**
 * The association's compliance screens (docs/ASSOCIATION_COMPLIANCE.md): the overview of what is legal today and what needs attention, the association's own registration and its evidence, the vehicle register with each
 * vehicle's operating licence, and the driver register. The licence follows the vehicle and its owner, not membership, so it is shown per vehicle; and an application lodged is shown as unlicensed until the licence is recorded.
 * Everything shown is what has been entered: the screens say plainly when nothing has, and never imply a vehicle is licensed because it has an application.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;
const SEV: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" };
const SEV_TEXT: Record<string, string> = { high: "Act now", medium: "Soon", low: "Keep an eye on" };
const BAND_TEXT: Record<string, string> = { expired: "Expired", "30": "Within 30 days", "90": "Within 90 days", "180": "Within 180 days" };
const LICENCE_TEXT: Record<string, string> = { valid: "Valid", expired: "Expired", application_lodged: "Application lodged: counts as unlicensed", not_yet_valid: "Not valid yet", none: "No licence on file" };
const LICENCE_TONE: Record<string, string> = { valid: "#15803d", expired: "#C8102E", application_lodged: "#D97706", not_yet_valid: "#D97706", none: "#C8102E" };
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;

/* ───────────────────────── the overview ───────────────────────── */
interface Flag { id: string; category: string; severity: string; message: string; subject: string; dueOn: string | null }
interface Summary { today: string; measures: { vehicles: number; vehiclesLicensed: number; licensedPercent: number | null; applicationOnly: number; expired: number; noLicence: number; drivers: number; driversWithValidPermit: number; validPermitPercent: number | null; driversWithoutEmployer: number; members: number; minMembersRequired: number | null; registrationStatus: string }; flags: Flag[]; flagCounts: { high: number; medium: number; low: number }; expiries: { kind: string; subject: string; expiresOn: string; days: number; band: string }[] }
const pct = (n: number | null) => (n === null ? "No data" : `${n}%`);
export function ComplianceOverview({ onOpen }: { onOpen?: (screen: string) => void }) {
  const [load] = useLoad<Summary>(() => call("/compliance/summary"));
  const [trend] = useLoad<{ trend: { month: string; vehicles: number; licensed: number; licensedPercent: number | null; drivers: number; driversValid: number; validPermitPercent: number | null }[] }>(() => call("/compliance/trend"));
  const [sev, setSev] = useState(""), [cat, setCat] = useState(""), [showChanges, setShowChanges] = useState(false);
  return (
    <div className="space-y-4">
      <Status load={load}>{(s) => {
        const m = s.measures, flags = s.flags.filter((f) => (!sev || f.severity === sev) && (!cat || f.category === cat)), cats = [...new Set(s.flags.map((f) => f.category))];
        return (
          <>
            <SectionPanel title="Compliance today">
              <div className="p-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Vehicles with a valid licence" value={pct(m.licensedPercent)} icon={<span aria-hidden>✓</span>} color={COLOR} />
                  <StatCard label="Drivers with a valid permit (PrDP)" value={pct(m.validPermitPercent)} icon={<span aria-hidden>P</span>} color={COLOR} />
                  <StatCard label="Members" value={m.minMembersRequired === null ? String(m.members) : `${m.members} of ${m.minMembersRequired} needed`} icon={<span aria-hidden>M</span>} color={COLOR} />
                  <StatCard label="Registration" value={m.registrationStatus.charAt(0).toUpperCase() + m.registrationStatus.slice(1)} icon={<span aria-hidden>R</span>} color={COLOR} />
                </div>
                <p className="text-sm text-fg" aria-live="polite">{m.vehiclesLicensed} of {m.vehicles} vehicles hold a licence that covers today. {m.applicationOnly > 0 && <><b>{m.applicationOnly}</b> {m.applicationOnly === 1 ? "has" : "have"} only an application lodged, which counts as unlicensed. </>}{m.expired > 0 && <><b>{m.expired}</b> {m.expired === 1 ? "has" : "have"} an expired licence. </>}{m.noLicence > 0 && <><b>{m.noLicence}</b> {m.noLicence === 1 ? "has" : "have"} none on file. </>}{m.driversWithoutEmployer > 0 && <><b>{m.driversWithoutEmployer}</b> driver{m.driversWithoutEmployer === 1 ? " has" : "s have"} no employing owner on record.</>}</p>
                <p className="text-xs text-fg-subtle">This is what has been entered in the registers as of {s.today}. A vehicle counts as licensed only when a licence on file covers today.</p>
                {onOpen && <div className="flex flex-wrap gap-3 text-sm"><button type="button" className="underline font-bold" onClick={() => onOpen("Vehicle register")}>Open the vehicle register</button><button type="button" className="underline font-bold" onClick={() => onOpen("Driver register")}>Open the driver register</button><button type="button" className="underline font-bold" onClick={() => onOpen("Registration")}>Open the registration</button></div>}
              </div>
            </SectionPanel>
            <SectionPanel title={`Needs attention (${s.flags.length})`}>
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Show"><select aria-label="Filter by seriousness" className={inputCls + " mt-1 w-44"} value={sev} onChange={(e) => setSev(e.target.value)}><option value="">All ({s.flags.length})</option><option value="high">Act now ({s.flagCounts.high})</option><option value="medium">Soon ({s.flagCounts.medium})</option><option value="low">Keep an eye on ({s.flagCounts.low})</option></select></Field>
                  <Field label="About"><select aria-label="Filter by subject" className={inputCls + " mt-1 w-44"} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Everything</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
                </div>
                {flags.length === 0 ? <Empty>{s.flags.length === 0 ? "Nothing needs attention." : "Nothing matches that filter."}</Empty> : (
                  <ul className="space-y-2">{flags.map((f) => <li key={f.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[f.severity]}>{SEV_TEXT[f.severity]}</Chip><span className="flex-1 min-w-[12rem]">{f.message}</span>{f.dueOn && <span className="text-xs text-fg-muted">{f.dueOn}</span>}</li>)}</ul>)}
              </div>
            </SectionPanel>
            <SectionPanel title="Expiring in the next 180 days, and already expired">
              <div className="p-4">{s.expiries.length === 0 ? <Empty>Nothing is expiring in the next 180 days.</Empty> : (
                <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-2 pr-3">What</th><th className="pr-3">For</th><th className="pr-3">Expires</th><th className="pr-3 text-right">Days</th><th>When</th></tr></thead>
                  <tbody>{s.expiries.map((e, i) => <tr key={`${e.kind}|${e.subject}|${i}`} className="border-b border-line/60"><td className="py-2 pr-3">{e.kind}</td><td className="pr-3 font-bold">{e.subject}</td><td className="pr-3">{e.expiresOn}</td><td className="pr-3 text-right">{e.days}</td><td><Chip color={e.band === "expired" || e.band === "30" ? SEV.high : SEV.medium}>{BAND_TEXT[e.band] ?? e.band}</Chip></td></tr>)}</tbody></table></div>)}</div>
            </SectionPanel>
          </>);
      }}</Status>
      <SectionPanel title="Month by month">
        <div className="p-4"><Status load={trend}>{({ trend: t }) => t.length === 0 ? <Empty>The monthly picture builds up as months pass. The first month appears within hours of the first snapshot.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{t.map((x) => <li key={x.month} className="flex flex-wrap items-center gap-3"><span className="w-20 font-bold">{x.month}</span><span className="flex-1 min-w-[10rem]"><span className="block h-2 rounded bg-line"><span className="block h-2 rounded" style={{ width: `${x.licensedPercent ?? 0}%`, background: COLOR }} /></span></span><span className="w-72 text-xs text-fg-muted">Vehicles licensed {x.licensed} of {x.vehicles} ({pct(x.licensedPercent)}) · drivers with a permit {x.driversValid} of {x.drivers} ({pct(x.validPermitPercent)})</span></li>)}</ul>)}</Status></div>
      </SectionPanel>
      <SectionPanel title="Who changed what" action={<button type="button" className="text-xs underline" aria-expanded={showChanges} onClick={() => setShowChanges(!showChanges)}>{showChanges ? "Hide" : "Show"}</button>}>
        {showChanges && <div className="p-4"><ChangeHistory /></div>}
      </SectionPanel>
    </div>
  );
}
function ChangeHistory() {
  const [load] = useLoad<{ changes: { entity: string; summary: string; at: string; by: string | null }[] }>(() => call("/compliance/changes?limit=100"));
  return <Status load={load}>{({ changes }) => changes.length === 0 ? <Empty>No changes have been recorded.</Empty> : <ul className="space-y-1 text-sm text-fg">{changes.map((c, i) => <li key={i}><span className="text-fg-muted">{when(c.at)}</span> · {c.by ?? "System"} · <b>{c.entity.replace("_", " ")}</b>: {c.summary}</li>)}</ul>}</Status>;
}

/* ───────────────────────── registration ───────────────────────── */
interface Registration { electionIntervalMonths?: number | null; disciplineLimitDays?: number; recorded: boolean; status: string; registrationNumber: string | null; registrar: string | null; province: string | null; conditionalSince: string | null; conditionalLimitMonths: number; registeredOn: string | null; certificateIssuedOn: string | null; renewalDueOn: string | null; minMembersRequired: number | null; constitutionVersion: string | null; constitutionDated: string | null; constitutionLodgedVersion: string | null; constitutionLodgedOn: string | null; codeVersion: string | null; codeDated: string | null; feeCapCents: number | null; notes: string | null; memberCount: number }
function RegistrationForm({ r, reload }: { r: Registration; reload: () => void }) {
  const s = (v: string | null) => v ?? "";
  const [f, setF] = useState({ status: r.status, registrationNumber: s(r.registrationNumber), registrar: s(r.registrar), province: s(r.province), conditionalSince: s(r.conditionalSince), conditionalLimitMonths: String(r.conditionalLimitMonths), registeredOn: s(r.registeredOn), certificateIssuedOn: s(r.certificateIssuedOn), renewalDueOn: s(r.renewalDueOn), minMembersRequired: r.minMembersRequired === null ? "" : String(r.minMembersRequired), constitutionVersion: s(r.constitutionVersion), constitutionDated: s(r.constitutionDated), constitutionLodgedVersion: s(r.constitutionLodgedVersion), constitutionLodgedOn: s(r.constitutionLodgedOn), codeVersion: s(r.codeVersion), codeDated: s(r.codeDated), feeCap: r.feeCapCents === null ? "" : String(r.feeCapCents / 100), notes: s(r.notes), electionInterval: r.electionIntervalMonths == null ? "" : String(r.electionIntervalMonths), disciplineLimit: String(r.disciplineLimitDays ?? 90) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const txt = (label: string, k: keyof typeof f, w = "w-44") => <Field label={label}><input aria-label={label} className={inputCls + ` mt-1 ${w}`} value={f[k]} onChange={set(k)} /></Field>;
  const day = (label: string, k: keyof typeof f) => <Field label={label}><input type="date" aria-label={label} className={inputCls + " mt-1 w-40"} value={f[k]} onChange={set(k)} /></Field>;
  return (
    <SectionPanel title="Registration">
      <div className="p-4 space-y-4">
        <p className="text-sm text-fg">{r.recorded ? "" : "Nothing has been recorded yet. Enter what your registrar has told you. "}You have <b>{r.memberCount}</b> active owner member{r.memberCount === 1 ? "" : "s"}.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Status"><select aria-label="Registration status" className={inputCls + " mt-1 w-40"} value={f.status} onChange={set("status")}><option value="conditional">Conditional</option><option value="provisional">Provisional</option><option value="full">Full</option><option value="suspended">Suspended</option></select></Field>
          {txt("Registration number", "registrationNumber")}{txt("Registrar or regulatory entity", "registrar", "w-64")}{txt("Province", "province", "w-36")}
          {day("Conditional since", "conditionalSince")}<Field label="Conditional for at most (months)"><input aria-label="Conditional limit" className={inputCls + " mt-1 !w-20"} inputMode="numeric" value={f.conditionalLimitMonths} onChange={set("conditionalLimitMonths")} /></Field>
          {day("Registered on", "registeredOn")}{day("Certificate issued", "certificateIssuedOn")}{day("Renewal due", "renewalDueOn")}
          <Field label="Minimum members required"><input aria-label="Minimum members" className={inputCls + " mt-1 !w-24"} inputMode="numeric" value={f.minMembersRequired} onChange={set("minMembersRequired")} /></Field>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          {txt("Constitution version", "constitutionVersion", "w-28")}{day("Constitution dated", "constitutionDated")}{txt("Version last lodged", "constitutionLodgedVersion", "w-28")}{day("Lodged on", "constitutionLodgedOn")}
          {txt("Code of conduct version", "codeVersion", "w-28")}{day("Code dated", "codeDated")}
          <Field label="Highest joining or membership fee allowed (R, if your province has a limit)"><input aria-label="Fee cap" className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={f.feeCap} onChange={set("feeCap")} /></Field>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <Field label="Your constitution requires an election every (months)"><input aria-label="Election interval" className={inputCls + " mt-1 !w-24"} inputMode="numeric" value={f.electionInterval} onChange={set("electionInterval")} /></Field>
          <Field label="A disciplinary case may stay open for at most (days)"><input aria-label="Discipline limit" className={inputCls + " mt-1 !w-24"} inputMode="numeric" value={f.disciplineLimit} onChange={set("disciplineLimit")} /></Field>
        </div>
        <Field label="Notes"><textarea aria-label="Registration notes" className={inputCls + " mt-1 min-h-[4rem]"} maxLength={500} value={f.notes} onChange={set("notes")} /></Field>
        <ActionButton label="Save registration" color={COLOR} onRun={async () => {
          const n = (v: string) => (v.trim() === "" ? null : Number(v));
          const body = { status: f.status, registrationNumber: f.registrationNumber, registrar: f.registrar, province: f.province, conditionalSince: f.conditionalSince, conditionalLimitMonths: Number(f.conditionalLimitMonths), registeredOn: f.registeredOn, certificateIssuedOn: f.certificateIssuedOn, renewalDueOn: f.renewalDueOn, minMembersRequired: n(f.minMembersRequired), constitutionVersion: f.constitutionVersion, constitutionDated: f.constitutionDated, constitutionLodgedVersion: f.constitutionLodgedVersion, constitutionLodgedOn: f.constitutionLodgedOn, codeVersion: f.codeVersion, codeDated: f.codeDated, feeCapCents: f.feeCap.trim() === "" ? null : toCents(f.feeCap), notes: f.notes, electionIntervalMonths: n(f.electionInterval), disciplineLimitDays: Number(f.disciplineLimit) };
          const x = await call("/compliance/registration", { method: "PUT", body }); if ("error" in x) return { error: x.error }; reload(); return { message: "Saved." };
        }} />
        <p className="text-xs text-fg-subtle">These are your records of what your registrar has told you. The system flags what looks wrong (for example membership under the minimum, or registration conditional for too long); it never decides your status.</p>
      </div>
    </SectionPanel>
  );
}
function OfficeBearersCard() {
  const [load, reload] = useLoad<{ officeBearers: { id: string; name: string; office: string; termStart: string | null; termEnd: string | null }[] }>(() => call("/compliance/office-bearers"));
  const [f, setF] = useState({ name: "", office: "", termStart: "", termEnd: "" });
  return (
    <SectionPanel title="Office bearers">
      <div className="p-4 space-y-3">
        <Status load={load}>{({ officeBearers }) => officeBearers.length === 0 ? <Empty>No office bearers recorded.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{officeBearers.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{o.name}</b> · {o.office} · term {o.termStart ?? "?"} to {o.termEnd ?? "?"}</span><ActionButton small label="Remove" color="#6B7280" onRun={async () => { const r = await call(`/compliance/office-bearers/${o.id}`, { method: "DELETE" }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} /></li>)}</ul>)}</Status>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name"><input aria-label="Office bearer name" className={inputCls + " mt-1 w-48"} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Office"><input aria-label="Office held" className={inputCls + " mt-1 w-40"} value={f.office} onChange={(e) => setF({ ...f, office: e.target.value })} /></Field>
          <Field label="Term starts"><input type="date" aria-label="Term starts" className={inputCls + " mt-1 w-40"} value={f.termStart} onChange={(e) => setF({ ...f, termStart: e.target.value })} /></Field>
          <Field label="Term ends"><input type="date" aria-label="Term ends" className={inputCls + " mt-1 w-40"} value={f.termEnd} onChange={(e) => setF({ ...f, termEnd: e.target.value })} /></Field>
          <ActionButton small label="Add" color={COLOR} onRun={async () => { const r = await call("/compliance/office-bearers", { method: "POST", body: f }); if ("error" in r) return { error: r.error }; setF({ name: "", office: "", termStart: "", termEnd: "" }); reload(); return { message: "Added." }; }} />
        </div>
      </div>
    </SectionPanel>
  );
}
const DOC_KINDS: [string, string][] = [["registration_certificate", "Registration certificate"], ["constitution", "Signed constitution"], ["code_of_conduct", "Code of conduct"], ["other", "Other"]];
function DocumentsCard() {
  const [load, reload] = useLoad<{ documents: { id: string; kind: string; title: string; reference: string | null; version: string | null; datedOn: string | null; expiresOn: string | null; heldAt: string | null }[] }>(() => call("/compliance/documents"));
  const [f, setF] = useState({ kind: "registration_certificate", title: "", reference: "", version: "", datedOn: "", expiresOn: "", heldAt: "" });
  return (
    <SectionPanel title="Evidence you hold">
      <div className="p-4 space-y-3">
        <p className="text-xs text-fg-subtle">Record each document, where it is kept and its dates. The files themselves are not stored here.</p>
        <Status load={load}>{({ documents }) => documents.length === 0 ? <Empty>No evidence recorded yet.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{documents.map((d) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{d.title}</b> ({DOC_KINDS.find(([k]) => k === d.kind)?.[1]}){d.version ? ` · version ${d.version}` : ""}{d.datedOn ? ` · dated ${d.datedOn}` : ""}{d.expiresOn ? ` · expires ${d.expiresOn}` : ""}{d.heldAt ? ` · kept at ${d.heldAt}` : ""}</span><ActionButton small label="Remove" color="#6B7280" onRun={async () => { const r = await call(`/compliance/documents/${d.id}`, { method: "DELETE" }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} /></li>)}</ul>)}</Status>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Kind"><select aria-label="Document kind" className={inputCls + " mt-1 w-52"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Title"><input aria-label="Document title" className={inputCls + " mt-1 w-52"} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Version"><input aria-label="Document version" className={inputCls + " mt-1 !w-20"} value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} /></Field>
          <Field label="Dated"><input type="date" aria-label="Document dated" className={inputCls + " mt-1 w-40"} value={f.datedOn} onChange={(e) => setF({ ...f, datedOn: e.target.value })} /></Field>
          <Field label="Expires"><input type="date" aria-label="Document expires" className={inputCls + " mt-1 w-40"} value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} /></Field>
          <Field label="Kept at"><input aria-label="Document kept at" className={inputCls + " mt-1 w-40"} value={f.heldAt} onChange={(e) => setF({ ...f, heldAt: e.target.value })} /></Field>
          <ActionButton small label="Record" color={COLOR} onRun={async () => { const r = await call("/compliance/documents", { method: "POST", body: f }); if ("error" in r) return { error: r.error }; setF({ ...f, title: "", reference: "", version: "" }); reload(); return { message: "Recorded." }; }} />
        </div>
      </div>
    </SectionPanel>
  );
}
function AcceptancesCard() {
  const [load, reload] = useLoad<{ constitutionVersion: string | null; members: { memberId: string; name: string; acceptedCurrent: boolean; acceptedOn: string | null }[] }>(() => call("/compliance/acceptances"));
  const [pick, setPick] = useState({ memberId: "", acceptedOn: "" });
  return (
    <SectionPanel title="Members' signed acceptance of the constitution">
      <div className="p-4 space-y-3">
        <Status load={load}>{({ constitutionVersion, members }) => !constitutionVersion ? <Empty>Record the constitution version above to track who has signed it.</Empty> : (
          <>
            <p className="text-sm text-fg">Current version: <b>{constitutionVersion}</b>. {members.filter((m) => m.acceptedCurrent).length} of {members.length} members have signed it.</p>
            <ul className="space-y-1 text-sm text-fg">{members.map((m) => <li key={m.memberId}>{m.name}: {m.acceptedCurrent ? `signed ${m.acceptedOn}` : <b>not signed</b>}</li>)}</ul>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Member"><select aria-label="Acceptance member" className={inputCls + " mt-1 w-48"} value={pick.memberId} onChange={(e) => setPick({ ...pick, memberId: e.target.value })}><option value="">Choose</option>{members.filter((m) => !m.acceptedCurrent).map((m) => <option key={m.memberId} value={m.memberId}>{m.name}</option>)}</select></Field>
              <Field label="Signed on"><input type="date" aria-label="Signed on" className={inputCls + " mt-1 w-40"} value={pick.acceptedOn} onChange={(e) => setPick({ ...pick, acceptedOn: e.target.value })} /></Field>
              <ActionButton small label="Record signature" color={COLOR} onRun={async () => { const r = await call("/compliance/acceptances", { method: "POST", body: { memberId: pick.memberId, version: constitutionVersion, acceptedOn: pick.acceptedOn } }); if ("error" in r) return { error: r.error }; setPick({ memberId: "", acceptedOn: "" }); reload(); return { message: "Recorded." }; }} />
            </div>
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}
export function RegistrationScreen() {
  const [load, reload] = useLoad<{ registration: Registration }>(() => call("/compliance/registration"));
  return <div className="space-y-4"><Status load={load}>{({ registration }) => <RegistrationForm key={JSON.stringify(registration)} r={registration} reload={reload} />}</Status><OfficeBearersCard /><DocumentsCard /><AcceptancesCard /></div>;
}

/* ───────────────────────── the vehicle register ───────────────────────── */
interface Licence { id: string; licenceNumber: string; authority: string | null; holder: string | null; validFrom: string; validUntil: string; route: string | null; area: string | null; times: string | null }
interface Vehicle { id: string; registration: string; make: string | null; model: string | null; seats: number | null; owner: string; driver: string | null; compliance: { vin: string | null; roadworthyExpiry: string | null; roadworthyRef: string | null; insurer: string | null; policyNumber: string | null; insuranceExpiry: string | null; tracker: string; camera: string; signageNote: string | null; recapStatus: string; state: string; replacedBy: string | null; replacedByRegistration: string | null; replacementNote: string | null }; licence: { status: string; validUntil: string | null; all: Licence[] }; applications: { id: string; kind: string; reference: string | null; authority: string | null; lodgedOn: string; outcome: string; outcomeOn: string | null }[]; roadworthy: { band: string; days: number | null }; insurance: { band: string; days: number | null }; flags: Flag[] }
const expiryChip = (e: { band: string; days: number | null }, date: string | null) => e.band === "missing" ? <span className="text-fg-subtle">Not on record</span> : <span>{date} {e.band === "ok" ? "" : <Chip color={e.band === "expired" || e.band === "30" ? SEV.high : SEV.medium}>{BAND_TEXT[e.band]}</Chip>}</span>;

function VehiclePanel({ v, reload, others }: { v: Vehicle; reload: () => void; others: Vehicle[] }) {
  const c = v.compliance, s = (x: string | null) => x ?? "";
  const [d, setD] = useState({ vin: s(c.vin), roadworthyExpiry: s(c.roadworthyExpiry), roadworthyRef: s(c.roadworthyRef), insurer: s(c.insurer), policyNumber: s(c.policyNumber), insuranceExpiry: s(c.insuranceExpiry), tracker: c.tracker, camera: c.camera, signageNote: s(c.signageNote), recapStatus: c.recapStatus, state: c.state, replacedBy: c.replacedBy ?? "", replacementNote: s(c.replacementNote) });
  const [lic, setLic] = useState({ licenceNumber: "", authority: "", validFrom: "", validUntil: "", route: "", area: "", times: "" }), [app, setApp] = useState({ kind: "new", reference: "", authority: "", lodgedOn: "" });
  return (
    <div className="space-y-4 rounded-lg border border-line p-4">
      {v.flags.length > 0 && <ul className="space-y-1 text-sm text-fg">{v.flags.map((f) => <li key={f.id}><Chip color={SEV[f.severity]}>{SEV_TEXT[f.severity]}</Chip> {f.message}</li>)}</ul>}
      <div>
        <h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Operating licences</h4>
        <p className="text-xs text-fg-subtle mb-2">The licence belongs to the vehicle and its owner, not to your association. A licence lasts at most seven years.</p>
        {v.licence.all.length === 0 ? <p className="text-sm text-fg-muted">None recorded.</p> : <ul className="space-y-1 text-sm text-fg">{v.licence.all.map((l) => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{l.licenceNumber}</b> · {l.validFrom} to {l.validUntil}{l.authority ? ` · ${l.authority}` : ""}{l.route ? ` · route: ${l.route}` : ""}{l.area ? ` · area: ${l.area}` : ""}{l.times ? ` · times: ${l.times}` : ""}</span><ActionButton small label="Remove" color="#6B7280" onRun={async () => { const r = await call(`/compliance/licences/${l.id}`, { method: "DELETE" }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} /></li>)}</ul>}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Licence number"><input aria-label="Licence number" className={inputCls + " mt-1 w-36"} value={lic.licenceNumber} onChange={(e) => setLic({ ...lic, licenceNumber: e.target.value })} /></Field>
          <Field label="Valid from"><input type="date" aria-label="Licence valid from" className={inputCls + " mt-1 w-40"} value={lic.validFrom} onChange={(e) => setLic({ ...lic, validFrom: e.target.value })} /></Field>
          <Field label="Valid until"><input type="date" aria-label="Licence valid until" className={inputCls + " mt-1 w-40"} value={lic.validUntil} onChange={(e) => setLic({ ...lic, validUntil: e.target.value })} /></Field>
          <Field label="Issued by"><input aria-label="Licence authority" className={inputCls + " mt-1 w-44"} value={lic.authority} onChange={(e) => setLic({ ...lic, authority: e.target.value })} /></Field>
          <Field label="Route condition"><input aria-label="Licence route" className={inputCls + " mt-1 w-44"} value={lic.route} onChange={(e) => setLic({ ...lic, route: e.target.value })} /></Field>
          <Field label="Area"><input aria-label="Licence area" className={inputCls + " mt-1 w-32"} value={lic.area} onChange={(e) => setLic({ ...lic, area: e.target.value })} /></Field>
          <Field label="Times"><input aria-label="Licence times" className={inputCls + " mt-1 w-32"} value={lic.times} onChange={(e) => setLic({ ...lic, times: e.target.value })} /></Field>
          <ActionButton small label="Add licence" color={COLOR} onRun={async () => { const r = await call(`/compliance/vehicles/${v.id}/licences`, { method: "POST", body: lic }); if ("error" in r) return { error: r.error }; setLic({ licenceNumber: "", authority: "", validFrom: "", validUntil: "", route: "", area: "", times: "" }); reload(); return { message: "Added." }; }} />
        </div>
      </div>
      <div>
        <h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Applications</h4>
        <p className="text-xs text-fg-subtle mb-2">An application is not a licence. A vehicle with only an application lodged is counted as unlicensed until the licence itself is recorded above.</p>
        {v.applications.length === 0 ? <p className="text-sm text-fg-muted">None recorded.</p> : <ul className="space-y-1 text-sm text-fg">{v.applications.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2"><span>{a.kind} · lodged {a.lodgedOn}{a.reference ? ` · ${a.reference}` : ""} · <b>{a.outcome}</b>{a.outcomeOn ? ` on ${a.outcomeOn}` : ""}</span>
          {a.outcome === "pending" && <span className="flex gap-2">{(["granted", "refused", "withdrawn"] as const).map((o) => <ActionButton key={o} small label={o.charAt(0).toUpperCase() + o.slice(1)} color={o === "granted" ? COLOR : "#6B7280"} onRun={async () => { const r = await call(`/compliance/applications/${a.id}`, { method: "PUT", body: { outcome: o, outcomeOn: new Date().toISOString().slice(0, 10) } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />)}</span>}</li>)}</ul>}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Kind"><select aria-label="Application kind" className={inputCls + " mt-1 w-36"} value={app.kind} onChange={(e) => setApp({ ...app, kind: e.target.value })}><option value="new">New</option><option value="renewal">Renewal</option><option value="transfer">Transfer</option><option value="amendment">Amendment</option></select></Field>
          <Field label="Reference"><input aria-label="Application reference" className={inputCls + " mt-1 w-36"} value={app.reference} onChange={(e) => setApp({ ...app, reference: e.target.value })} /></Field>
          <Field label="Lodged on"><input type="date" aria-label="Application lodged" className={inputCls + " mt-1 w-40"} value={app.lodgedOn} onChange={(e) => setApp({ ...app, lodgedOn: e.target.value })} /></Field>
          <ActionButton small label="Record application" color={COLOR} onRun={async () => { const r = await call(`/compliance/vehicles/${v.id}/applications`, { method: "POST", body: app }); if ("error" in r) return { error: r.error }; setApp({ ...app, reference: "", lodgedOn: "" }); reload(); return { message: "Recorded." }; }} />
        </div>
      </div>
      <div>
        <h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Details</h4>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="VIN"><input aria-label="VIN" className={inputCls + " mt-1 w-44"} value={d.vin} onChange={(e) => setD({ ...d, vin: e.target.value })} /></Field>
          <Field label="Roadworthy expires"><input type="date" aria-label="Roadworthy expires" className={inputCls + " mt-1 w-40"} value={d.roadworthyExpiry} onChange={(e) => setD({ ...d, roadworthyExpiry: e.target.value })} /></Field>
          <Field label="Insurer"><input aria-label="Insurer" className={inputCls + " mt-1 w-36"} value={d.insurer} onChange={(e) => setD({ ...d, insurer: e.target.value })} /></Field>
          <Field label="Policy number"><input aria-label="Policy number" className={inputCls + " mt-1 w-36"} value={d.policyNumber} onChange={(e) => setD({ ...d, policyNumber: e.target.value })} /></Field>
          <Field label="Insurance expires"><input type="date" aria-label="Insurance expires" className={inputCls + " mt-1 w-40"} value={d.insuranceExpiry} onChange={(e) => setD({ ...d, insuranceExpiry: e.target.value })} /></Field>
          <Field label="Tracker"><select aria-label="Tracker" className={inputCls + " mt-1 w-32"} value={d.tracker} onChange={(e) => setD({ ...d, tracker: e.target.value })}><option value="unknown">Unknown</option><option value="none">None</option><option value="installed">Installed</option></select></Field>
          <Field label="Camera"><select aria-label="Camera" className={inputCls + " mt-1 w-32"} value={d.camera} onChange={(e) => setD({ ...d, camera: e.target.value })}><option value="unknown">Unknown</option><option value="none">None</option><option value="installed">Installed</option></select></Field>
          <Field label="Recapitalisation"><select aria-label="Recapitalisation" className={inputCls + " mt-1 w-40"} value={d.recapStatus} onChange={(e) => setD({ ...d, recapStatus: e.target.value })}><option value="unknown">Unknown</option><option value="not_applicable">Not applicable</option><option value="applied">Applied</option><option value="completed">Completed</option><option value="scrapped">Scrapped</option></select></Field>
          <Field label="Signage or marks"><input aria-label="Signage" className={inputCls + " mt-1 w-48"} value={d.signageNote} onChange={(e) => setD({ ...d, signageNote: e.target.value })} /></Field>
          <Field label="State"><select aria-label="Vehicle state" className={inputCls + " mt-1 w-36"} value={d.state} onChange={(e) => setD({ ...d, state: e.target.value })}><option value="active">Active</option><option value="off_road">Off the road</option><option value="replaced">Replaced</option></select></Field>
          {d.state === "replaced" && <><Field label="Replaced by"><select aria-label="Replaced by" className={inputCls + " mt-1 w-40"} value={d.replacedBy} onChange={(e) => setD({ ...d, replacedBy: e.target.value })}><option value="">Not yet chosen</option>{others.filter((o) => o.id !== v.id).map((o) => <option key={o.id} value={o.id}>{o.registration}</option>)}</select></Field><Field label="Replacement note"><input aria-label="Replacement note" className={inputCls + " mt-1 w-48"} value={d.replacementNote} onChange={(e) => setD({ ...d, replacementNote: e.target.value })} /></Field></>}
          <ActionButton small label="Save details" color={COLOR} onRun={async () => { const r = await call(`/compliance/vehicles/${v.id}`, { method: "PUT", body: { ...d, replacedBy: d.replacedBy || null } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
        </div>
      </div>
    </div>
  );
}
export function VehicleRegisterScreen() {
  const [load, reload] = useLoad<{ vehicles: Vehicle[] }>(() => call("/compliance/vehicles"));
  const [open, setOpen] = useState<string | null>(null), [filter, setFilter] = useState("");
  return (
    <SectionPanel title="Vehicle register">
      <div className="p-4 space-y-3">
        <Field label="Show"><select aria-label="Filter vehicles" className={inputCls + " mt-1 w-56"} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All vehicles</option><option value="unlicensed">Not licensed today</option><option value="attention">With something to attend to</option></select></Field>
        <Status load={load}>{({ vehicles }) => {
          const shown = vehicles.filter((v) => filter === "unlicensed" ? v.licence.status !== "valid" && v.compliance.state === "active" : filter === "attention" ? v.flags.length > 0 : true);
          return vehicles.length === 0 ? <Empty>No vehicles yet. They appear when your owner members add them.</Empty> : shown.length === 0 ? <Empty>No vehicles match.</Empty> : (
            <ul className="space-y-3">{shown.map((v) => (
              <li key={v.id} className="text-sm text-fg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{v.registration}</b> · {[v.make, v.model].filter(Boolean).join(" ")} · {v.owner}{v.driver ? ` · driver ${v.driver}` : ""}{v.compliance.state !== "active" ? ` · ${v.compliance.state === "off_road" ? "off the road" : "replaced"}` : ""}</span>
                  <span className="flex items-center gap-2"><Chip color={LICENCE_TONE[v.licence.status]}>{LICENCE_TEXT[v.licence.status]}</Chip>{v.flags.length > 0 && <span className="text-xs text-fg-muted">{v.flags.length} to attend to</span>}<button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>{open === v.id ? "Close" : "Open"}</button></span>
                </div>
                <div className="mt-1 grid gap-x-4 text-xs text-fg-muted sm:grid-cols-3"><span>Licence until: {v.licence.validUntil ?? "none"}</span><span>Roadworthy: {expiryChip(v.roadworthy, v.compliance.roadworthyExpiry)}</span><span>Insurance: {expiryChip(v.insurance, v.compliance.insuranceExpiry)}</span></div>
                {open === v.id && <div className="mt-3"><VehiclePanel v={v} reload={reload} others={vehicles} /></div>}
              </li>))}</ul>);
        }}</Status>
      </div>
    </SectionPanel>
  );
}

/* ───────────────────────── the driver register ───────────────────────── */
interface Driver { id: string; name: string; email: string; idNumberMasked: string | null; vehicle: string | null; employers: string[]; member: boolean; permit: { number: string | null; expiresOn: string | null; band: string; days: number | null }; licence: { code: string | null; expiresOn: string | null; band: string; days: number | null }; register: { employmentStatus: string; contractOnFile: boolean; payBasis: string; uifRegistered: boolean; coidaRegistered: boolean; cleanRecordConfirmed: boolean; trainingNote: string | null; state: string; stateReason: string | null }; flags: Flag[] }
function DriverPanel({ d, reload }: { d: Driver; reload: () => void }) {
  const r = d.register, [f, setF] = useState({ idNumber: "", employmentStatus: r.employmentStatus, contractOnFile: r.contractOnFile, payBasis: r.payBasis, uifRegistered: r.uifRegistered, coidaRegistered: r.coidaRegistered, cleanRecordConfirmed: r.cleanRecordConfirmed, trainingNote: r.trainingNote ?? "", state: r.state, stateReason: r.stateReason ?? "" });
  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      {d.flags.length > 0 && <ul className="space-y-1 text-sm text-fg">{d.flags.map((x) => <li key={x.id}><Chip color={SEV[x.severity]}>{SEV_TEXT[x.severity]}</Chip> {x.message}</li>)}</ul>}
      <div className="flex flex-wrap items-end gap-2">
        <Field label={`ID number${d.idNumberMasked ? ` (on file: ${d.idNumberMasked})` : ""}`}><input aria-label="ID number" className={inputCls + " mt-1 w-44"} inputMode="numeric" placeholder={d.idNumberMasked ? "Type to replace" : ""} value={f.idNumber} onChange={(e) => setF({ ...f, idNumber: e.target.value })} /></Field>
        <Field label="Employment"><select aria-label="Employment status" className={inputCls + " mt-1 w-40"} value={f.employmentStatus} onChange={(e) => setF({ ...f, employmentStatus: e.target.value })}><option value="unknown">Not recorded</option><option value="employed">Employed</option><option value="contractor">Contractor</option><option value="owner_driver">Owner-driver</option></select></Field>
        <Field label="Paid"><select aria-label="Pay basis" className={inputCls + " mt-1 w-36"} value={f.payBasis} onChange={(e) => setF({ ...f, payBasis: e.target.value })}><option value="unknown">Not recorded</option><option value="salary">Salary</option><option value="daily_rate">Daily rate</option><option value="commission">Commission</option><option value="cash">Cash</option><option value="other">Other</option></select></Field>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.contractOnFile} onChange={(e) => setF({ ...f, contractOnFile: e.target.checked })} />Contract on file</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.uifRegistered} onChange={(e) => setF({ ...f, uifRegistered: e.target.checked })} />Registered for UIF</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.coidaRegistered} onChange={(e) => setF({ ...f, coidaRegistered: e.target.checked })} />Registered for COIDA</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.cleanRecordConfirmed} onChange={(e) => setF({ ...f, cleanRecordConfirmed: e.target.checked })} />Clean record confirmed</label>
        <Field label="Training"><input aria-label="Training" className={inputCls + " mt-1 w-56"} value={f.trainingNote} onChange={(e) => setF({ ...f, trainingNote: e.target.value })} /></Field>
        <Field label="Status"><select aria-label="Driver status" className={inputCls + " mt-1 w-36"} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="active">Active</option><option value="suspended">Suspended</option></select></Field>
        {f.state === "suspended" && <Field label="Why suspended"><input aria-label="Why suspended" className={inputCls + " mt-1 w-56"} value={f.stateReason} onChange={(e) => setF({ ...f, stateReason: e.target.value })} /></Field>}
        <ActionButton small label="Save driver" color={COLOR} onRun={async () => { const { idNumber, ...rest } = f; const r2 = await call(`/compliance/drivers/${d.id}`, { method: "PUT", body: { ...rest, ...(idNumber.trim() ? { idNumber: idNumber.trim() } : {}) } }); if ("error" in r2) return { error: r2.error }; reload(); return { message: "Saved." }; }} />
      </div>
    </div>
  );
}
export function DriverRegisterScreen() {
  const [load, reload] = useLoad<{ drivers: Driver[] }>(() => call("/compliance/drivers"));
  const [enf, reloadEnf] = useLoad<{ enforcePrdp: boolean }>(() => call("/compliance/settings"));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <SectionPanel title="Permit rule">
        <div className="p-4 text-sm text-fg">{enf.state === "ready" && (
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={enf.data.enforcePrdp} onChange={async (e) => { await call("/compliance/settings", { method: "PUT", body: { enforcePrdp: e.target.checked } }); reloadEnf(); }} /><span>Do not let owners put a driver on a vehicle without a valid professional driving permit (PrDP), or while the driver is suspended. A PrDP is needed to carry passengers for income.</span></label>)}</div>
      </SectionPanel>
      <SectionPanel title="Driver register">
        <div className="p-4"><Status load={load}>{({ drivers }) => drivers.length === 0 ? <Empty>No drivers yet. They appear when your members employ them.</Empty> : (
          <ul className="space-y-3">{drivers.map((d) => (
            <li key={d.id} className="text-sm text-fg">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b>{d.name}</b>{d.vehicle ? ` · ${d.vehicle}` : " · no vehicle"} · {d.employers.length ? `employed by ${d.employers.join(", ")}` : "no employer on record"}{d.register.state === "suspended" ? " · suspended" : ""}</span>
                <span className="flex items-center gap-2">{d.permit.band === "missing" ? <Chip color={SEV.high}>No PrDP</Chip> : d.permit.band === "expired" ? <Chip color={SEV.high}>PrDP expired</Chip> : <Chip color={d.permit.band === "ok" ? "#15803d" : SEV.medium}>PrDP {d.permit.band === "ok" ? "valid" : BAND_TEXT[d.permit.band].toLowerCase()}</Chip>}{d.flags.length > 0 && <span className="text-xs text-fg-muted">{d.flags.length} to attend to</span>}<button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? "Close" : "Open"}</button></span>
              </div>
              <div className="mt-1 grid gap-x-4 text-xs text-fg-muted sm:grid-cols-3"><span>PrDP {d.permit.number ?? "(none)"} until {d.permit.expiresOn ?? "?"}</span><span>Licence {d.licence.code ?? ""} until {d.licence.expiresOn ?? "?"}</span><span>{d.idNumberMasked ? `ID ${d.idNumberMasked}` : "No ID on file"}</span></div>
              {open === d.id && <div className="mt-3"><DriverPanel d={d} reload={reload} /></div>}
            </li>))}</ul>)}</Status></div>
      </SectionPanel>
    </div>
  );
}
export const money = (cents: number) => rand(cents / 100);
