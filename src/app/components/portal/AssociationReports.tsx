import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, when, inputCls } from "./ui";
import { FileButton } from "./AssociationFinance";

/**
 * Reports (docs/ASSOCIATION_COMPLIANCE.md, module 12): the documents an association hands to its executive, its regional body, its registrar or its auditor, downloaded or sent on a schedule.
 * Every PDF says which association it is for, the day it was generated, and that it was generated from the association's own records. A report states what is on record and flags what looks wrong; it never says an association is compliant.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;
interface Pack { id: string; title: string; description: string }
interface Schedule { id: string; pack: string; frequency: string; recipientLabel: string; recipientEmail: string; dayOfMonth: number; sendMonth: number; active: boolean; lastPeriod: string | null; lastSentAt: string | null; lastError: string | null }
const FREQ: Record<string, string> = { monthly: "Every month", quarterly: "Every quarter (January, April, July, October)", annually: "Every year" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CSVS: [string, string, string][] = [["members", "Members", "Name, email, when they joined and how many vehicles they own"], ["vehicles", "Vehicles", "Each vehicle with its licence, roadworthy and insurance"], ["drivers", "Drivers", "Each driver with their permit, employer and employment details (ID numbers are masked)"]];

function PacksCard({ packs }: { packs: Pack[] }) {
  const [period, setPeriod] = useState("");
  return (
    <SectionPanel title="Reports to download">
      <div className="p-4 space-y-4">
        <ul className="space-y-3">{packs.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg border-b border-line/60 pb-3">
            <span className="flex-1 min-w-[14rem]"><b>{p.title}</b><br /><span className="text-xs text-fg-muted">{p.description}</span></span>
            <span className="flex flex-wrap items-end gap-2">
              {p.id === "finance" && <Field label="Month (2026-10) or year (2026)"><input aria-label="Finance report period" className={inputCls + " mt-1 !w-36"} placeholder="This year" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>}
              <FileButton path={`/reports/pack/${p.id}.pdf${p.id === "finance" && period.trim() ? `?period=${encodeURIComponent(period.trim())}` : ""}`} filename={`${p.id}.pdf`} label={`Download ${p.title.toLowerCase()}`} />
            </span>
          </li>))}</ul>
        <div>
          <h4 className="text-xs font-bold uppercase text-fg-muted mb-2">Lists for members and auditors (CSV)</h4>
          <ul className="space-y-2">{CSVS.map(([k, label, desc]) => <li key={k} className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg"><span><b>{label}</b> <span className="text-xs text-fg-muted">{desc}</span></span><FileButton path={`/reports/csv/${k}.csv`} filename={`${k}.csv`} label={`Download ${label.toLowerCase()} list`} /></li>)}</ul>
        </div>
        <p className="text-xs text-fg-subtle">Each PDF is stamped with your association's name, the day it was generated and the page number. The disciplinary section of the governance report gives counts only: the people involved are not named.</p>
      </div>
    </SectionPanel>
  );
}

function SchedulesCard({ packs }: { packs: Pack[] }) {
  const [load, reload] = useLoad<{ schedules: Schedule[]; emailConfigured: boolean }>(() => call("/reports/schedules"));
  const [f, setF] = useState({ pack: "licences", frequency: "monthly", recipientLabel: "", recipientEmail: "", dayOfMonth: "1", sendMonth: "3" });
  const title = (id: string) => packs.find((p) => p.id === id)?.title ?? id;
  return (
    <SectionPanel title="Sent automatically">
      <div className="p-4 space-y-4">
        <p className="text-xs text-fg-subtle">For example: monthly to your executive, quarterly to your regional body, and once a year to your registrar. Each report is sent once for each period, as a PDF by email.</p>
        <Status load={load}>{({ schedules, emailConfigured }) => (
          <>
            {!emailConfigured && <p role="alert" className="text-sm text-bad">Email is not set up on this server yet, so reports cannot be sent. You can still download them above.</p>}
            {schedules.length === 0 ? <Empty>Nothing is sent automatically yet.</Empty> : (
              <ul className="space-y-3 text-sm text-fg">{schedules.map((s) => (
                <li key={s.id} className="border-b border-line/60 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b>{title(s.pack)}</b> · {FREQ[s.frequency]}{s.frequency === "annually" ? ` in ${MONTHS[s.sendMonth - 1]}` : ""}, from the {s.dayOfMonth}{s.dayOfMonth === 1 ? "st" : s.dayOfMonth === 2 ? "nd" : s.dayOfMonth === 3 ? "rd" : "th"} · to {s.recipientLabel} ({s.recipientEmail}) {!s.active && <Chip color="#6B7280">Switched off</Chip>}</span>
                    <span className="flex flex-wrap gap-2">
                      <ActionButton small label="Send now" color={COLOR} onRun={async () => { const r = await call(`/reports/schedules/${s.id}/send`, { method: "POST" }); reload(); return "error" in r ? { error: r.error } : { message: "Sent." }; }} />
                      <ActionButton small label={s.active ? "Switch off" : "Switch on"} color="#6B7280" onRun={async () => { const r = await call(`/reports/schedules/${s.id}/active`, { method: "POST", body: { active: !s.active } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />
                      <ActionButton small label="Remove" color="#6B7280" onRun={async () => { const r = await call(`/reports/schedules/${s.id}`, { method: "DELETE" }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{s.lastError ? <span className="text-bad">Last attempt failed: {s.lastError}. It will be tried again.</span> : s.lastSentAt ? `Last sent ${when(s.lastSentAt)}` : "Not sent yet"}</p>
                </li>))}</ul>)}
          </>)}</Status>
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <Field label="Report"><select aria-label="Schedule report" className={inputCls + " mt-1 w-56"} value={f.pack} onChange={(e) => setF({ ...f, pack: e.target.value })}>{packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <Field label="How often"><select aria-label="Schedule frequency" className={inputCls + " mt-1 w-40"} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option></select></Field>
          {f.frequency === "annually" && <Field label="In"><select aria-label="Schedule month" className={inputCls + " mt-1 w-36"} value={f.sendMonth} onChange={(e) => setF({ ...f, sendMonth: e.target.value })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>}
          <Field label="On day (1 to 28)"><input aria-label="Schedule day" className={inputCls + " mt-1 !w-16"} inputMode="numeric" value={f.dayOfMonth} onChange={(e) => setF({ ...f, dayOfMonth: e.target.value })} /></Field>
          <Field label="Goes to (for example the registrar)"><input aria-label="Schedule recipient" className={inputCls + " mt-1 w-44"} value={f.recipientLabel} onChange={(e) => setF({ ...f, recipientLabel: e.target.value })} /></Field>
          <Field label="Their email"><input type="email" aria-label="Schedule email" className={inputCls + " mt-1 w-56"} value={f.recipientEmail} onChange={(e) => setF({ ...f, recipientEmail: e.target.value })} /></Field>
          <ActionButton small label="Add" color={COLOR} onRun={async () => { const r = await call("/reports/schedules", { method: "POST", body: { pack: f.pack, frequency: f.frequency, recipientLabel: f.recipientLabel, recipientEmail: f.recipientEmail, dayOfMonth: Number(f.dayOfMonth), ...(f.frequency === "annually" ? { sendMonth: Number(f.sendMonth) } : {}) } }); if ("error" in r) return { error: r.error }; setF({ ...f, recipientLabel: "", recipientEmail: "" }); reload(); return { message: "Added." }; }} />
        </div>
      </div>
    </SectionPanel>
  );
}

function RunsCard({ packs }: { packs: Pack[] }) {
  const [load] = useLoad<{ runs: { pack: string; period: string; recipient: string; ok: boolean; error: string | null; at: string }[] }>(() => call("/reports/runs"));
  return (
    <SectionPanel title="What has been sent">
      <div className="p-4"><Status load={load}>{({ runs }) => runs.length === 0 ? <Empty>Nothing has been sent yet.</Empty> : (
        <ul className="space-y-1 text-sm text-fg">{runs.slice(0, 30).map((r, i) => <li key={i}><span className="text-fg-muted">{when(r.at)}</span> · {packs.find((p) => p.id === r.pack)?.title ?? r.pack} ({r.period}) to {r.recipient} · {r.ok ? <b>Sent</b> : <span className="text-bad"><b>Failed</b>: {r.error}</span>}</li>)}</ul>)}</Status></div>
    </SectionPanel>
  );
}

export function ReportsScreen() {
  const [load] = useLoad<{ packs: Pack[] }>(() => call("/reports/packs"));
  return <Status load={load}>{({ packs }) => <div className="space-y-4"><PacksCard packs={packs} /><SchedulesCard packs={packs} /><RunsCard packs={packs} /></div>}</Status>;
}
