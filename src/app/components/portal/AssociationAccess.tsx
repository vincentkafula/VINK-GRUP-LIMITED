import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, when, inputCls } from "./ui";

/**
 * Named office-bearer logins (module 13). An association has one login; anyone who holds it can see disciplinary cases, safety events, member identities and finance approvals. Here the association gives each office bearer their own login with a role, so the sensitive screens
 * are open only to the people who need them, and what each person changes is recorded in their own name. The association's own login keeps everything, and is the only one that manages these logins.
 */
const COLOR = "#C8102E";
const call = portalClient("association");

export interface Access { kind: "owner" | "delegate"; name: string | null; role: string | null; roleText: string; officeBearerId: string | null; modules: Record<string, "r" | "rw" | null> }
/** What the signed-in person may do. null while it loads, or if it cannot be told (screens then behave as they always did, and the server still refuses anything not allowed). */
export function useAccess(): Access | null { const [load] = useLoad<Access>(() => call("/access")); return load.state === "ready" ? load.data : null; }
/** The module each menu item belongs to. An item not listed belongs to the main login alone, as does anything on the server that is not mapped to a module. */
const NAV_MODULE: Record<string, string> = {
  Compliance: "overview", Overview: "overview", Reports: "reports", Registration: "registers", "Vehicle register": "registers", "Driver register": "registers", "Member register": "members", Formalisation: "members",
  Owners: "operations", Drivers: "operations", Marshals: "operations", Vehicles: "operations", Approvals: "operations", Ranks: "operations", Routes: "operations", Map: "operations", "Route control": "routes",
  Finance: "finance", "Fees & receipts": "finance", "Expenses & banking": "finance", "Income statement": "finance", Levies: "finance", "Fines ledger": "finance", Statements: "finance",
  Governance: "governance", Discipline: "discipline", Safety: "safety",
};
export function navAllowed(label: string, access: Access | null): boolean {
  if (access === null) return label === "Compliance";                                                      // until we know who is signed in, show only the way in
  if (access.kind === "owner") return true;
  const m = NAV_MODULE[label]; return !!m && !!access.modules[m];
}

interface Delegate { id: string; name: string; username: string; email: string; role: string; roleText: string; officeBearerId: string | null; officeBearer: string | null; disabled: boolean; lastLogin: string | null; modules: { module: string; level: string }[] }
const ROLES: [string, string, string][] = [
  ["chairperson", "Chairperson", "Everything about the association except its bank and payroll."],
  ["secretary", "Secretary", "The registers, members, governance, discipline, safety, routes and reports. Not finance."],
  ["treasurer", "Treasurer", "Finance, and the registers and reports to read. Not discipline, safety or member identities."],
  ["viewer", "Viewer", "The overview, registers, routes and reports, to read only."],
];
export function AccessScreen() {
  const [load, reload] = useLoad<{ delegates: Delegate[] }>(() => call("/delegates")), [bearers] = useLoad<{ officeBearers: { id: string; name: string; office: string }[] }>(() => call("/compliance/office-bearers"));
  const [f, setF] = useState({ name: "", email: "", username: "", role: "secretary", officeBearerId: "" }), [secret, setSecret] = useState<{ name: string; username: string; password: string } | null>(null);
  const ob = bearers.state === "ready" ? bearers.data.officeBearers : [];
  return (
    <div className="space-y-4">
      <SectionPanel title="Office bearers' logins">
        <div className="p-4 space-y-4">
          <p className="text-sm text-fg">Give each office bearer their own login, so the sensitive screens are open only to the people who need them, and what each person changes is recorded in their own name. Your own login keeps everything, and only it manages these logins.</p>
          <ul className="space-y-1 text-xs text-fg-muted">{ROLES.map(([k, l, d]) => <li key={k}><b className="text-fg">{l}:</b> {d}</li>)}</ul>
          <p className="text-xs text-fg-subtle">The bank, payments to marshals and these logins stay with your own login alone, whatever role you give.</p>
        </div>
      </SectionPanel>
      {secret && (
        <div role="alert" className="rounded-xl border-2 p-4 text-sm text-fg" style={{ borderColor: COLOR }}>
          <p className="font-bold">A password for {secret.name}: it is shown only now.</p>
          <p className="mt-1">Username <b>{secret.username}</b> · password <b className="font-mono select-all">{secret.password}</b></p>
          <p className="mt-1 text-xs text-fg-muted">Give it to them privately, with their username exactly as shown (it is lower case), and ask them to change the password the first time they sign in. It is not kept anywhere you can look it up again: if it is lost, reset it.</p>
          <button type="button" className="mt-2 text-xs underline" onClick={() => setSecret(null)}>I have passed it on</button>
        </div>)}
      <SectionPanel title="Logins">
        <div className="p-4 space-y-4">
          <Status load={load}>{({ delegates }) => delegates.length === 0 ? <Empty>No office bearer has their own login yet.</Empty> : (
            <ul className="space-y-3 text-sm text-fg">{delegates.map((d) => (
              <li key={d.id} className="border-b border-line/60 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{d.name}</b> · {d.username} · {d.email}{d.officeBearer ? ` · ${d.officeBearer}` : " · not linked to an office bearer"} · {d.lastLogin ? `last signed in ${when(d.lastLogin)}` : "has not signed in yet"} {d.disabled && <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white bg-[#6B7280]">Switched off</span>}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Role of ${d.name}`} className={inputCls + " w-36"} value={d.role} onChange={async (e) => { await call(`/delegates/${d.id}/role`, { method: "PUT", body: { role: e.target.value } }); reload(); }}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <ActionButton small label={d.disabled ? "Switch on" : "Switch off"} color="#6B7280" onRun={async () => { const r = await call(`/delegates/${d.id}/active`, { method: "POST", body: { active: d.disabled } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />
                    <ActionButton small label="Reset password" color="#6B7280" onRun={async () => { const r = await call<{ username: string; temporaryPassword: string }>(`/delegates/${d.id}/reset-password`, { method: "POST" }); if ("error" in r) return { error: r.error }; const x = r.data as unknown as { username: string; temporaryPassword: string }; setSecret({ name: d.name, username: x.username, password: x.temporaryPassword }); return undefined; }} />
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-muted">Can see: {d.modules.map((m) => `${m.module}${m.level === "r" ? " (read)" : ""}`).join(", ")}</p>
              </li>))}</ul>)}</Status>
          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <label className="block"><span className="text-[11px] text-fg-muted">Name</span><input aria-label="Login name" className={inputCls + " mt-1 w-44"} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Email</span><input type="email" aria-label="Login email" className={inputCls + " mt-1 w-52"} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Username (saved in lower case)</span><input aria-label="Login username" className={inputCls + " mt-1 w-36"} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Role</span><select aria-label="Login role" className={inputCls + " mt-1 w-36"} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Their office bearer record</span><select aria-label="Login office bearer" className={inputCls + " mt-1 w-56"} value={f.officeBearerId} onChange={(e) => setF({ ...f, officeBearerId: e.target.value })}><option value="">Not linked</option>{ob.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.office})</option>)}</select></label>
            <ActionButton label="Create login" color={COLOR} onRun={async () => { const r = await call<{ username: string; temporaryPassword: string }>("/delegates", { method: "POST", body: { name: f.name, email: f.email, username: f.username, role: f.role, ...(f.officeBearerId ? { officeBearerId: f.officeBearerId } : {}) } }); if ("error" in r) return { error: r.error }; const x = r.data as unknown as { username: string; temporaryPassword: string }; setSecret({ name: f.name, username: x.username, password: x.temporaryPassword }); setF({ name: "", email: "", username: "", role: f.role, officeBearerId: "" }); reload(); return undefined; }} />
          </div>
          <p className="text-xs text-fg-subtle">Link a login to the person's office bearer record (under Registration) if they should approve expenses: an approval made by the office bearer signed in to their own account is recorded as theirs, and cannot be made on their behalf.</p>
        </div>
      </SectionPanel>
    </div>
  );
}
