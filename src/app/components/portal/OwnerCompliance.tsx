import { useState } from "react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, inputCls } from "./ui";
import { DocumentFiles } from "./OwnerDocuments";

/**
 * The owner's licence and compliance centre (docs/OWNER_DASHBOARD.md, slice C1): each vehicle's operating licence, roadworthy certificate, licence disc, insurance, and its driver's licence and PrDP, with how long is left and what needs doing.
 * A light always comes with words (never colour alone). A document that has not been recorded counts against the score, because one you have not recorded is one you cannot show. Licence lengths follow the province's rule, which the screen says has not been verified until an administrator has confirmed it.
 */
const COLOR = "#0F766E";
const call = portalClient("owner");
const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];
const LIGHT: Record<string, [string, string]> = { green: ["All in order", "#15803d"], amber: ["Needs attention", "#D97706"], red: ["Expired", "#C8102E"] };
const ITEM: Record<string, [string, string]> = { valid: ["Valid", "#15803d"], due: ["Due soon", "#D97706"], expired: ["Expired", "#C8102E"], missing: ["Not recorded", "#6B7280"] };
const SEV: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" }, SEV_TEXT: Record<string, string> = { high: "Act now", medium: "Soon", low: "Keep an eye on" };
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-xs text-fg-muted">{label}</span>{children}</label>;
const left = (n: number | null) => (n === null ? "" : n < 0 ? `expired ${-n} day${n === -1 ? "" : "s"} ago` : n === 0 ? "expires today" : `${n} day${n === 1 ? "" : "s"} left`);
interface Item { key: string; kind: string; label: string; expiresOn: string | null; daysLeft: number | null; status: string; detail: string | null }
interface Lic { id: string; licenceNumber: string; province: string | null; authority: string | null; route: string | null; validFrom: string; validUntil: string; maxYears: number; ruleVerified: boolean }
interface Veh { vehicleId: string; registration: string; make: string | null; driver: string | null; status: string; scorePercent: number; vin: string | null; items: Item[]; licences: Lic[]; details: { roadworthyRef: string | null; insurer: string | null; policyNumber: string | null } }
interface Rule { province: string; maxYears: number; verified: boolean; note: string | null }
interface Centre { reminderDays: number[]; rules: Rule[]; vehicles: Veh[]; fleet: { vehicles: number; green: number; amber: number; red: number; scorePercent: number | null; expired: number; dueSoon: number; missing: number }; flags: { id: string; severity: string; message: string }[] }

function DetailsForm({ v, expiry, reload }: { v: Veh; expiry: (k: string) => string; reload: () => void }) {
  const [f, setF] = useState({ roadworthyExpiry: expiry("roadworthy"), roadworthyRef: v.details.roadworthyRef ?? "", discExpiry: expiry("disc"), insurer: v.details.insurer ?? "", policyNumber: v.details.policyNumber ?? "", insuranceExpiry: expiry("insurance") });
  return (
    <div className="space-y-3 text-sm text-fg">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Roadworthy expires"><input type="date" aria-label={`Roadworthy expiry ${v.registration}`} className={inputCls + " mt-1 w-44"} value={f.roadworthyExpiry} onChange={(e) => setF({ ...f, roadworthyExpiry: e.target.value })} /></Field>
        <Field label="Roadworthy reference"><input aria-label={`Roadworthy reference ${v.registration}`} maxLength={40} className={inputCls + " mt-1 w-44"} value={f.roadworthyRef} onChange={(e) => setF({ ...f, roadworthyRef: e.target.value })} /></Field>
        <Field label="Licence disc expires"><input type="date" aria-label={`Disc expiry ${v.registration}`} className={inputCls + " mt-1 w-44"} value={f.discExpiry} onChange={(e) => setF({ ...f, discExpiry: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Insurer"><input aria-label={`Insurer ${v.registration}`} maxLength={80} className={inputCls + " mt-1 w-48"} value={f.insurer} onChange={(e) => setF({ ...f, insurer: e.target.value })} /></Field>
        <Field label="Policy number"><input aria-label={`Policy number ${v.registration}`} maxLength={40} className={inputCls + " mt-1 w-44"} value={f.policyNumber} onChange={(e) => setF({ ...f, policyNumber: e.target.value })} /></Field>
        <Field label="Insurance expires"><input type="date" aria-label={`Insurance expiry ${v.registration}`} className={inputCls + " mt-1 w-44"} value={f.insuranceExpiry} onChange={(e) => setF({ ...f, insuranceExpiry: e.target.value })} /></Field>
        <ActionButton small label={`Save details for ${v.registration}`} color={COLOR} onRun={async () => { const r = await call(`/compliance-centre/vehicles/${v.vehicleId}`, { method: "PUT", body: { ...f } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
      </div>
    </div>
  );
}
function LicenceForm({ v, rules, reload }: { v: Veh; rules: Rule[]; reload: () => void }) {
  const [f, setF] = useState({ licenceNumber: "", province: "", validFrom: "", validUntil: "", route: "", authority: "" }), rule = f.province ? rules.find((r) => r.province === f.province) ?? rules.find((r) => r.province === "*") : undefined;
  return (
    <div className="space-y-3 text-sm text-fg">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Licence number"><input aria-label={`Licence number ${v.registration}`} maxLength={60} className={inputCls + " mt-1 w-44"} value={f.licenceNumber} onChange={(e) => setF({ ...f, licenceNumber: e.target.value })} /></Field>
        <Field label="Province that issued it"><select aria-label={`Licence province ${v.registration}`} className={inputCls + " mt-1 w-44"} value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}><option value="">Choose</option>{PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Valid from"><input type="date" aria-label={`Licence from ${v.registration}`} className={inputCls + " mt-1 w-40"} value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field>
        <Field label="Valid until"><input type="date" aria-label={`Licence until ${v.registration}`} className={inputCls + " mt-1 w-40"} value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Route"><input aria-label={`Licence route ${v.registration}`} maxLength={200} className={inputCls + " mt-1 w-64"} value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })} /></Field>
        <Field label="Issued by (optional)"><input aria-label={`Licence authority ${v.registration}`} maxLength={120} className={inputCls + " mt-1 w-52"} value={f.authority} onChange={(e) => setF({ ...f, authority: e.target.value })} /></Field>
        <ActionButton small label={`Add licence for ${v.registration}`} color={COLOR} onRun={async () => { if (!f.province) return { error: "Choose the province that issued the licence." }; const body: Record<string, unknown> = { licenceNumber: f.licenceNumber, province: f.province, validFrom: f.validFrom, validUntil: f.validUntil }; if (f.route.trim()) body.route = f.route.trim(); if (f.authority.trim()) body.authority = f.authority.trim(); const r = await call(`/compliance-centre/vehicles/${v.vehicleId}/licences`, { method: "POST", body }); if ("error" in r) return { error: r.error }; setF({ licenceNumber: "", province: "", validFrom: "", validUntil: "", route: "", authority: "" }); reload(); return { message: "Added." }; }} />
      </div>
      {rule && <p className="text-xs text-fg-subtle" role="note">{f.province} licences last at most {rule.maxYears} years in this system.{rule.verified ? "" : " This limit has not been verified with the Provincial Regulatory Entity: check it yourself before relying on it."}</p>}
    </div>
  );
}
function ReminderForm({ days, reload }: { days: number[]; reload: () => void }) {
  const [t, setT] = useState(days.join(", "));
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm text-fg">
      <Field label="Remind me this many days before (up to six, separated by commas)"><input aria-label="Reminder days" className={inputCls + " mt-1 w-56"} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <ActionButton small label="Save reminder days" color={COLOR} onRun={async () => { const d = t.split(/[,\s]+/).filter(Boolean).map(Number); if (!d.length || d.some((n) => !Number.isInteger(n))) return { error: "Type whole numbers of days, for example 90, 60, 30, 7." }; const r = await call("/compliance-centre/reminders", { method: "PUT", body: { days: d } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
    </div>
  );
}

export function ComplianceCentreScreen() {
  const [load, reload] = useLoad<Centre>(() => call("/compliance-centre")), [open, setOpen] = useState<string | null>(null);
  return (
    <Status load={load}>{(c) => (
      <div className="space-y-4">
        <SectionPanel title="Licences and compliance">
          <div className="p-4 space-y-4">
            <p className="text-xs text-fg-subtle">Every document a vehicle needs, with how long is left. A document you have not recorded counts against the score, because you cannot show what you have not recorded. Your association sees the same records for its members' vehicles.</p>
            {c.fleet.vehicles === 0 ? <Empty>Add a vehicle first.</Empty> : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Compliance score" value={c.fleet.scorePercent === null ? "No data" : `${c.fleet.scorePercent}%`} icon={<span aria-hidden>S</span>} color={COLOR} /><StatCard label="Expired" value={String(c.fleet.expired)} icon={<span aria-hidden>E</span>} color={COLOR} />
                  <StatCard label="Due soon" value={String(c.fleet.dueSoon)} icon={<span aria-hidden>D</span>} color={COLOR} /><StatCard label="Not recorded" value={String(c.fleet.missing)} icon={<span aria-hidden>N</span>} color={COLOR} />
                </div>
                <p className="text-sm text-fg">{c.fleet.green} of {c.fleet.vehicles} vehicle{c.fleet.vehicles === 1 ? " is" : "s are"} all in order, {c.fleet.amber} need{c.fleet.amber === 1 ? "s" : ""} attention and {c.fleet.red} {c.fleet.red === 1 ? "has" : "have"} something expired.</p>
                {c.flags.length > 0 && <ul className="space-y-2">{c.flags.map((x) => <li key={x.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[x.severity]}>{SEV_TEXT[x.severity]}</Chip><span className="flex-1 min-w-[12rem]">{x.message}</span></li>)}</ul>}
              </>)}
          </div>
        </SectionPanel>
        {c.vehicles.map((v) => (
          <SectionPanel key={v.vehicleId} title={`${v.registration}${v.make ? ` · ${v.make}` : ""}`}>
            <div className="p-4 space-y-3 text-sm text-fg">
              <div className="flex flex-wrap items-center gap-3"><Chip color={LIGHT[v.status][1]}>{LIGHT[v.status][0]}</Chip><span>{v.scorePercent}% in order{v.driver ? ` · driver ${v.driver}` : " · no driver assigned"}</span></div>
              <ul className="space-y-1">{v.items.map((i) => <li key={i.key} className="flex flex-wrap items-center gap-2"><Chip color={ITEM[i.status][1]}>{ITEM[i.status][0]}</Chip><span><b>{i.label}</b>{i.expiresOn ? ` · ${i.expiresOn} (${left(i.daysLeft)})` : ""}{i.detail ? ` · ${i.detail}` : ""}</span></li>)}</ul>
              <button type="button" className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === v.vehicleId} onClick={() => setOpen(open === v.vehicleId ? null : v.vehicleId)}>{open === v.vehicleId ? "Close" : `Update ${v.registration}`}</button>
              {open === v.vehicleId && (
                <div className="space-y-4 rounded-lg border border-line p-4">
                  <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-2">Roadworthy, disc and insurance</h4><DetailsForm v={v} expiry={(k) => v.items.find((i) => i.kind === k)?.expiresOn ?? ""} reload={reload} /></div>
                  <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-2">Operating licences</h4>
                    {v.licences.length === 0 ? <Empty>No operating licence is recorded.</Empty> : <ul className="space-y-1 mb-3">{v.licences.map((l) => <li key={l.id} className="flex flex-wrap items-center gap-2">{l.licenceNumber} · {l.province ?? "province not stated"} · {l.validFrom} to {l.validUntil}{l.route ? ` · ${l.route}` : ""}<ActionButton small label={`Remove ${l.licenceNumber}`} color="#6B7280" onRun={async () => { const r = await call(`/compliance-centre/licences/${l.id}`, { method: "DELETE" }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} /></li>)}</ul>}
                    <LicenceForm v={v} rules={c.rules} reload={reload} /></div>
                  <DocumentFiles title={`Photos and PDFs for ${v.registration}`} kinds={["roadworthy", "insurance", "operating_licence", "licence_disc", "driver_agreement", "other"]} vehicleId={v.vehicleId} hint="Keep a copy of each certificate here, so you can show it when you are asked." />
                </div>)}
            </div>
          </SectionPanel>))}
        <SectionPanel title="Reminders">
          <div className="p-4 space-y-3 text-sm text-fg">
            <p>You are reminded {c.reminderDays.join(", ")} days before a document expires, and again once it has. The reminders appear under Notifications.</p>
            <ReminderForm days={c.reminderDays} reload={reload} />
          </div>
        </SectionPanel>
      </div>)}</Status>
  );
}
