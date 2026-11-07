import { useState } from "react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, inputCls } from "./ui";
import { FileButton } from "./AssociationFinance";

/**
 * The member register (module 2) and owner formalisation (module 10). Membership is voluntary, so the association must be able to show exactly who is a member, and keep the operators on its routes who are not members apart. The formalisation screen tracks each
 * owner's business and employer registrations beside the drivers they employ. It records what members have told the association and reports it: filing tax and registering as an employer are each owner's own duty, and nothing here is tax or labour advice.
 * ID and tax numbers are shown masked. Disciplinary cases are shown as counts only.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const money = (cents: number) => rand(cents / 100);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;
const SEV: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" }, SEV_TEXT: Record<string, string> = { high: "Act now", medium: "Soon", low: "Keep an eye on" };
const today = () => new Date().toISOString().slice(0, 10);
const pct = (n: number | null) => (n === null ? "No data" : `${n}%`);
const LICENCE: Record<string, string> = { valid: "licensed", expired: "licence expired", application_lodged: "application only", not_yet_valid: "licence not valid yet", none: "no licence" };
const ENTITY: [string, string][] = [["individual", "Individual"], ["company", "Company"], ["cc", "Close corporation"], ["partnership", "Partnership"], ["trust", "Trust"], ["other", "Other"]];
interface Flag { id: string; severity: string; message: string }

/* ───────────────────────── the member register ───────────────────────── */
interface Member { memberId: string; name: string; email: string; joinedOn: string; legalName: string | null; entityType: string; idNumberMasked: string | null; phone: string | null; cardNumber: string | null; standing: string; standingReason: string | null; dualMemberOf: string | null; dualConsent: boolean; notes: string | null; vehicles: { id: string; registration: string; licence: string }[]; owedCents: number; overdueCents: number; daysOverdue: number; disciplinaryCases: { open: number; closed: number }; recentTrips: number }
interface NonMember { id: string; name: string; phone: string | null; vehicleRegistration: string; routeLabel: string | null; notedOn: string; endedOn: string | null }
interface Register { measures: { members: number; suspended: number; terminated: number; identityRecordedPercent: number | null; dualMembers: number; activeNonMembers: number }; members: Member[]; nonMembers: NonMember[]; unregisteredOperators: { registration: string; owner: string; route: string; trips: number }[]; flags: Flag[] }
function MemberPanel({ m, reload }: { m: Member; reload: () => void }) {
  const [f, setF] = useState({ legalName: m.legalName ?? "", entityType: m.entityType, idNumber: "", phone: m.phone ?? "", cardNumber: m.cardNumber ?? "", standing: m.standing, standingReason: m.standingReason ?? "", dualMemberOf: m.dualMemberOf ?? "", dualConsent: m.dualConsent, notes: m.notes ?? "" });
  return (
    <div className="space-y-3 rounded-lg border border-line p-4 text-sm text-fg">
      <p className="text-xs text-fg-muted">Joined {m.joinedOn} · {m.email} · {m.vehicles.length === 0 ? "no vehicles" : m.vehicles.map((v) => `${v.registration} (${LICENCE[v.licence]})`).join(", ")} · owes {money(m.owedCents)}{m.overdueCents > 0 ? `, ${money(m.overdueCents)} overdue ${m.daysOverdue} days` : ""} · disciplinary cases: {m.disciplinaryCases.open} open, {m.disciplinaryCases.closed} closed · {m.recentTrips} trips in the last 30 days</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Legal name or company"><input aria-label="Member legal name" className={inputCls + " mt-1 w-60"} value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} /></Field>
        <Field label="Type"><select aria-label="Member entity type" className={inputCls + " mt-1 w-44"} value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value })}>{ENTITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label={f.entityType === "individual" ? `ID number${m.idNumberMasked ? ` (on file: ${m.idNumberMasked})` : ""}` : `Company or registration number${m.idNumberMasked ? ` (on file: ${m.idNumberMasked})` : ""}`}><input aria-label="Member ID number" className={inputCls + " mt-1 w-52"} placeholder={m.idNumberMasked ? "Type to replace" : ""} value={f.idNumber} onChange={(e) => setF({ ...f, idNumber: e.target.value })} /></Field>
        <Field label="Phone"><input aria-label="Member phone" className={inputCls + " mt-1 w-40"} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Membership card number"><input aria-label="Member card number" className={inputCls + " mt-1 w-40"} value={f.cardNumber} onChange={(e) => setF({ ...f, cardNumber: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Standing"><select aria-label="Member standing" className={inputCls + " mt-1 w-40"} value={f.standing} onChange={(e) => setF({ ...f, standing: e.target.value })}><option value="active">Active</option><option value="suspended">Suspended</option><option value="terminated">Terminated</option></select></Field>
        {f.standing !== "active" && <Field label="Why"><input aria-label="Member standing reason" className={inputCls + " mt-1 w-72"} maxLength={200} value={f.standingReason} onChange={(e) => setF({ ...f, standingReason: e.target.value })} /></Field>}
        <Field label="Also a member of (another association)"><input aria-label="Member dual membership" className={inputCls + " mt-1 w-56"} value={f.dualMemberOf} onChange={(e) => setF({ ...f, dualMemberOf: e.target.value })} /></Field>
        {f.dualMemberOf.trim() !== "" && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.dualConsent} onChange={(e) => setF({ ...f, dualConsent: e.target.checked })} />Consent to this recorded</label>}
        <Field label="Notes"><input aria-label="Member notes" className={inputCls + " mt-1 w-64"} maxLength={300} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <ActionButton small label="Save member" color={COLOR} onRun={async () => {
          const { idNumber, ...rest } = f; const body: Record<string, unknown> = { ...rest, ...(idNumber.trim() ? { idNumber: idNumber.trim() } : {}) }; if (f.standing === "active") delete body.standingReason; if (!f.dualMemberOf.trim()) { body.dualMemberOf = null; delete body.dualConsent; }
          const r = await call(`/member-register/${m.memberId}`, { method: "PUT", body }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." };
        }} />
      </div>
    </div>
  );
}
function NonMembersCard({ reg, reload }: { reg: Register; reload: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", vehicleRegistration: "", routeLabel: "", notedOn: today() });
  return (
    <SectionPanel title="Operators who are not members">
      <div className="p-4 space-y-4">
        <p className="text-xs text-fg-subtle">Membership is voluntary, so you keep the operators on your routes who are not members apart from your members. A vehicle that belongs to a member cannot be entered here.</p>
        {reg.unregisteredOperators.length > 0 && (
          <div className="rounded-lg border border-line p-3 text-sm text-fg">
            <h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Seen on your routes in the last 30 days, not yet in this register</h4>
            <ul className="space-y-1">{reg.unregisteredOperators.map((o) => <li key={o.registration} className="flex flex-wrap items-center justify-between gap-2"><span>{o.registration} · owner {o.owner} · {o.route} · {o.trips} trip{o.trips === 1 ? "" : "s"}</span><ActionButton small label={`Add ${o.registration}`} color="#6B7280" onRun={async () => { const r = await call("/member-register/non-members", { method: "POST", body: { name: o.owner, vehicleRegistration: o.registration, routeLabel: o.route, notedOn: today() } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} /></li>)}</ul>
          </div>)}
        {reg.nonMembers.length === 0 ? <Empty>No non-member operators recorded.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{reg.nonMembers.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{n.name}</b> · {n.vehicleRegistration}{n.routeLabel ? ` · ${n.routeLabel}` : ""}{n.phone ? ` · ${n.phone}` : ""} · noted {n.notedOn}{n.endedOn ? ` · stopped ${n.endedOn}` : ""}</span>
              {!n.endedOn && <ActionButton small label={`Stopped operating: ${n.vehicleRegistration}`} color="#6B7280" onRun={async () => { const r = await call(`/member-register/non-members/${n.id}/end`, { method: "POST", body: { endedOn: today() } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />}</li>))}</ul>)}
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <Field label="Name"><input aria-label="Non-member name" className={inputCls + " mt-1 w-48"} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Vehicle registration"><input aria-label="Non-member vehicle" className={inputCls + " mt-1 w-36"} value={f.vehicleRegistration} onChange={(e) => setF({ ...f, vehicleRegistration: e.target.value })} /></Field>
          <Field label="Route"><input aria-label="Non-member route" className={inputCls + " mt-1 w-44"} value={f.routeLabel} onChange={(e) => setF({ ...f, routeLabel: e.target.value })} /></Field>
          <Field label="Phone"><input aria-label="Non-member phone" className={inputCls + " mt-1 w-36"} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Noted on"><input type="date" aria-label="Non-member noted" className={inputCls + " mt-1 w-40"} value={f.notedOn} onChange={(e) => setF({ ...f, notedOn: e.target.value })} /></Field>
          <ActionButton small label="Add operator" color={COLOR} onRun={async () => { const r = await call("/member-register/non-members", { method: "POST", body: { ...f, ...(f.phone.trim() ? {} : { phone: undefined }) } }); if ("error" in r) return { error: r.error }; setF({ ...f, name: "", vehicleRegistration: "", routeLabel: "", phone: "" }); reload(); return { message: "Added." }; }} />
          <FileButton path="/reports/csv/non_members.csv" filename="non-member-operators.csv" label="Download list" />
        </div>
      </div>
    </SectionPanel>
  );
}
export function MemberRegisterScreen() {
  const [load, reload] = useLoad<Register>(() => call("/member-register")), [open, setOpen] = useState<string | null>(null);
  return (
    <Status load={load}>{(r) => {
      const m = r.measures;
      return (
        <div className="space-y-4">
          <SectionPanel title="Member register">
            <div className="p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Members" value={String(m.members)} icon={<span aria-hidden>M</span>} color={COLOR} /><StatCard label="Suspended or terminated" value={`${m.suspended} and ${m.terminated}`} icon={<span aria-hidden>S</span>} color={COLOR} />
                <StatCard label="With an ID or company number" value={pct(m.identityRecordedPercent)} icon={<span aria-hidden>I</span>} color={COLOR} /><StatCard label="Also in another association" value={String(m.dualMembers)} icon={<span aria-hidden>D</span>} color={COLOR} />
              </div>
              {r.flags.length === 0 ? <Empty>Nothing needs attention.</Empty> : <ul className="space-y-2">{r.flags.map((x) => <li key={x.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[x.severity]}>{SEV_TEXT[x.severity]}</Chip><span className="flex-1 min-w-[12rem]">{x.message}</span></li>)}</ul>}
              {r.members.length === 0 ? <Empty>No members yet.</Empty> : (
                <ul className="space-y-3">{r.members.map((x) => (
                  <li key={x.memberId} className="text-sm text-fg">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{x.name}</b>{x.legalName && x.legalName !== x.name ? ` (${x.legalName})` : ""} · {ENTITY.find(([k]) => k === x.entityType)?.[1]}{x.cardNumber ? ` · card ${x.cardNumber}` : " · no card number"}{x.idNumberMasked ? ` · ${x.idNumberMasked}` : " · no ID on file"}{x.dualMemberOf ? ` · also ${x.dualMemberOf}${x.dualConsent ? "" : " (no consent)"}` : ""}</span>
                      <span className="flex items-center gap-2"><Chip color={x.standing === "active" ? "#15803d" : x.standing === "suspended" ? SEV.medium : SEV.high}>{x.standing === "active" ? "Active" : x.standing === "suspended" ? "Suspended" : "Terminated"}</Chip><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === x.memberId} onClick={() => setOpen(open === x.memberId ? null : x.memberId)}>{open === x.memberId ? "Close" : "Open"}</button></span>
                    </div>
                    {open === x.memberId && <div className="mt-3"><MemberPanel m={x} reload={reload} /></div>}
                  </li>))}</ul>)}
              <div><FileButton path="/reports/csv/members.csv" filename="members.csv" label="Download member list" /></div>
            </div>
          </SectionPanel>
          <NonMembersCard reg={r} reload={reload} />
        </div>);
    }}</Status>
  );
}

/* ───────────────────────── owner formalisation ───────────────────────── */
interface Owner { ownerId: string; name: string; businessType: string; registrationNo: string | null; taxNumberMasked: string | null; taxRegistered: boolean; filingStatus: string; uifEmployer: boolean; coidaEmployer: boolean; sdlRegistered: boolean; checkedOn: string | null; notes: string | null; drivers: number; driversFormal: number; driversPaidCashNoContract: number }
interface Formal { owners: Owner[]; measures: { owners: number; businessRecordedPercent: number | null; taxRegisteredPercent: number | null; employersRegisteredPercent: number | null; drivers: number; driversFormal: number; driversFormalPercent: number | null }; flags: Flag[] }
const BUSINESS: [string, string][] = [["unknown", "Not recorded"], ["sole_proprietor", "Sole proprietor"], ["company", "Company"], ["cc", "Close corporation"], ["partnership", "Partnership"], ["trust", "Trust"], ["other", "Other"]];
const FILING: [string, string][] = [["unknown", "Not known"], ["up_to_date", "Up to date"], ["overdue", "Overdue"], ["not_applicable", "Not applicable"]];
function OwnerPanel({ o, reload }: { o: Owner; reload: () => void }) {
  const [f, setF] = useState({ businessType: o.businessType, registrationNo: o.registrationNo ?? "", taxNumber: "", taxRegistered: o.taxRegistered, filingStatus: o.filingStatus, uifEmployer: o.uifEmployer, coidaEmployer: o.coidaEmployer, sdlRegistered: o.sdlRegistered, checkedOn: o.checkedOn ?? "", notes: o.notes ?? "" });
  return (
    <div className="space-y-3 rounded-lg border border-line p-4 text-sm text-fg">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Business"><select aria-label="Owner business type" className={inputCls + " mt-1 w-44"} value={f.businessType} onChange={(e) => setF({ ...f, businessType: e.target.value })}>{BUSINESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Registration number"><input aria-label="Owner registration number" className={inputCls + " mt-1 w-44"} value={f.registrationNo} onChange={(e) => setF({ ...f, registrationNo: e.target.value })} /></Field>
        <Field label={`SARS tax reference${o.taxNumberMasked ? ` (on file: ${o.taxNumberMasked})` : ""}`}><input aria-label="Owner tax number" className={inputCls + " mt-1 w-40"} inputMode="numeric" placeholder={o.taxNumberMasked ? "Type to replace" : "10 digits"} value={f.taxNumber} onChange={(e) => setF({ ...f, taxNumber: e.target.value })} /></Field>
        <Field label="Tax filing, as reported"><select aria-label="Owner tax filing" className={inputCls + " mt-1 w-40"} value={f.filingStatus} onChange={(e) => setF({ ...f, filingStatus: e.target.value })}>{FILING.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Last checked"><input type="date" aria-label="Owner checked on" className={inputCls + " mt-1 w-40"} value={f.checkedOn} onChange={(e) => setF({ ...f, checkedOn: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.taxRegistered} onChange={(e) => setF({ ...f, taxRegistered: e.target.checked })} />Registered for tax</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.uifEmployer} onChange={(e) => setF({ ...f, uifEmployer: e.target.checked })} />Registered with UIF as an employer</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.coidaEmployer} onChange={(e) => setF({ ...f, coidaEmployer: e.target.checked })} />Registered with COIDA as an employer</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.sdlRegistered} onChange={(e) => setF({ ...f, sdlRegistered: e.target.checked })} />Registered for the Skills Development Levy</label>
        <Field label="Notes"><input aria-label="Owner notes" className={inputCls + " mt-1 w-56"} maxLength={300} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <ActionButton small label="Save owner" color={COLOR} onRun={async () => { const { taxNumber, ...rest } = f; const r = await call(`/formalisation/${o.ownerId}`, { method: "PUT", body: { ...rest, checkedOn: f.checkedOn || null, ...(taxNumber.trim() ? { taxNumber: taxNumber.trim() } : {}) } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
      </div>
    </div>
  );
}
export function FormalisationScreen() {
  const [load, reload] = useLoad<Formal>(() => call("/formalisation")), [open, setOpen] = useState<string | null>(null);
  return (
    <Status load={load}>{(r) => {
      const m = r.measures;
      return (
        <SectionPanel title="Tax and labour formalisation">
          <div className="p-4 space-y-4">
            <p className="text-xs text-fg-subtle">SARS treats the taxi industry as a priority, and the industry is moving towards formal employment. This records what each owner has told the association about their business and their registrations as an employer, so you can show progress. You track and report only: filing tax and registering as an employer are each owner's own duty, and nothing here is tax or labour advice.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Owners with a business recorded" value={pct(m.businessRecordedPercent)} icon={<span aria-hidden>B</span>} color={COLOR} /><StatCard label="Owners registered for tax" value={pct(m.taxRegisteredPercent)} icon={<span aria-hidden>T</span>} color={COLOR} />
              <StatCard label="Employers with UIF and COIDA" value={pct(m.employersRegisteredPercent)} icon={<span aria-hidden>E</span>} color={COLOR} /><StatCard label="Drivers formally employed" value={m.drivers === 0 ? "No drivers" : `${m.driversFormal} of ${m.drivers} (${pct(m.driversFormalPercent)})`} icon={<span aria-hidden>D</span>} color={COLOR} />
            </div>
            <p className="text-xs text-fg-muted">A driver counts as formally employed when they are recorded as employed, with a contract on file, registered for UIF and registered for COIDA.</p>
            {r.flags.length === 0 ? <Empty>Nothing needs attention.</Empty> : <ul className="space-y-2">{r.flags.map((x) => <li key={x.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[x.severity]}>{SEV_TEXT[x.severity]}</Chip><span className="flex-1 min-w-[12rem]">{x.message}</span></li>)}</ul>}
            {r.owners.length === 0 ? <Empty>No owners yet.</Empty> : (
              <ul className="space-y-3">{r.owners.map((o) => (
                <li key={o.ownerId} className="text-sm text-fg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b>{o.name}</b> · {BUSINESS.find(([k]) => k === o.businessType)?.[1]}{o.taxNumberMasked ? ` · tax ${o.taxNumberMasked}` : ""} · {o.drivers === 0 ? "no drivers on record" : `${o.driversFormal} of ${o.drivers} drivers formally employed`}{o.driversPaidCashNoContract > 0 ? ` · ${o.driversPaidCashNoContract} paid in cash, no contract` : ""}</span>
                    <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === o.ownerId} onClick={() => setOpen(open === o.ownerId ? null : o.ownerId)}>{open === o.ownerId ? "Close" : "Open"}</button>
                  </div>
                  {open === o.ownerId && <div className="mt-3"><OwnerPanel o={o} reload={reload} /></div>}
                </li>))}</ul>)}
            <div><FileButton path="/reports/csv/formalisation.csv" filename="formalisation.csv" label="Download formalisation list" /></div>
          </div>
        </SectionPanel>);
    }}</Status>
  );
}
