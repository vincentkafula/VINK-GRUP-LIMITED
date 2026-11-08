import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, when, inputCls } from "./ui";

/**
 * An owner's team (docs/OWNER_DASHBOARD.md, slice E). The owner can give the people who help run the business their own login with a role, so each sees only what they need and what each does is recorded in their own name.
 * The owner's own login keeps everything and is the only one that manages the team. The bank, VINK tokens, payments and the team itself stay with the owner's login whatever role is given.
 */
const COLOR = "#0F766E";
const call = portalClient("owner");

export interface OwnerAccess { kind: "owner" | "team"; name: string | null; role: string | null; roleText: string; modules: Record<string, "r" | "rw" | null> }
/** What the signed-in person may do. null while it loads, or if it cannot be told (screens then behave as they always did, and the server still refuses anything not allowed). */
export function useOwnerAccess(): OwnerAccess | null { const [load] = useLoad<OwnerAccess>(() => call("/access")); return load.state === "ready" ? load.data : null; }
/** The module each menu item belongs to. "Profit and costs" is open to anyone who can see either costs or profit. An item not listed belongs to the owner's own login alone, as does anything on the server that is not mapped to a module. */
const NAV_MODULE: Record<string, string | string[]> = {
  Overview: "overview", "Routes & map": "overview", Notifications: "notifications", Reports: "earnings", Financials: "earnings", Vehicles: "fleet", Drivers: "fleet", Documents: "compliance", "Compliance centre": "compliance",
  "Driver targets": "driverpay", "My association": "association", "Profit and costs": ["costs", "finance"], "Activity log": "audit",
};
export function ownerNavAllowed(label: string, access: OwnerAccess | null): boolean {
  if (access === null) return label === "Overview";                                                      // until we know who is signed in, show only the way in
  if (access.kind === "owner") return true;
  const m = NAV_MODULE[label]; if (!m) return false; return (Array.isArray(m) ? m : [m]).some((x) => !!access.modules[x]);
}

interface Member { id: string; name: string; username: string; email: string; role: string; roleText: string; disabled: boolean; lastLogin: string | null; modules: { module: string; level: string }[] }
const ROLES: [string, string, string][] = [
  ["co_owner", "Co-owner", "A partner: everything about the business, except the bank, VINK tokens, payments and the team."],
  ["fleet_manager", "Fleet manager", "Runs the vehicles day to day: vehicles, drivers, what drivers pay, compliance, documents, costs and servicing. Not profit, loans, takings or the association."],
  ["accountant", "Accountant (looks only)", "Looks but never changes: takings, profit and loss, loans, costs, what drivers pay, and the association's statements, with the downloads."],
];
const MODULE_TEXT: Record<string, string> = { overview: "overview", notifications: "notifications", fleet: "vehicles and drivers", driverpay: "what drivers pay", compliance: "compliance and documents", files: "stored files", association: "the association", costs: "costs and servicing", finance: "profit, loans and exports", earnings: "takings and reports", audit: "the activity log" };

export function TeamScreen() {
  const [load, reload] = useLoad<{ team: Member[] }>(() => call("/team")), [f, setF] = useState({ name: "", email: "", username: "", role: "fleet_manager" }), [secret, setSecret] = useState<{ name: string; username: string; password: string } | null>(null);
  return (
    <div className="space-y-4">
      <SectionPanel title="My team">
        <div className="p-4 space-y-4">
          <p className="text-sm text-fg">Give each person who helps you run the business their own login, so they see only what they need, and what each of them does is recorded in their own name. Your own login keeps everything, and only it manages the team.</p>
          <ul className="space-y-1 text-xs text-fg-muted">{ROLES.map(([k, l, d]) => <li key={k}><b className="text-fg">{l}:</b> {d}</li>)}</ul>
          <p className="text-xs text-fg-subtle">The bank, VINK tokens, payments, requests and the team stay with your own login alone, whatever role you give.</p>
        </div>
      </SectionPanel>
      {secret && (
        <div role="alert" className="rounded-xl border-2 p-4 text-sm text-fg" style={{ borderColor: "#C8102E" }}>
          <p className="font-bold">A password for {secret.name}: it is shown only now.</p>
          <p className="mt-1">Username <b>{secret.username}</b> · password <b className="font-mono select-all">{secret.password}</b></p>
          <p className="mt-1 text-xs text-fg-muted">Give it to them privately, with their username exactly as shown (it is lower case), and ask them to change the password the first time they sign in. It is not kept anywhere you can look it up again: if it is lost, reset it.</p>
          <button type="button" className="mt-2 text-xs underline" onClick={() => setSecret(null)}>I have passed it on</button>
        </div>)}
      <SectionPanel title="Logins">
        <div className="p-4 space-y-4">
          <Status load={load}>{({ team }) => team.length === 0 ? <Empty>Nobody has their own login yet.</Empty> : (
            <ul className="space-y-3 text-sm text-fg">{team.map((m) => (
              <li key={m.id} className="border-b border-line/60 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{m.name}</b> · {m.username} · {m.email} · {m.lastLogin ? `last signed in ${when(m.lastLogin)}` : "has not signed in yet"} {m.disabled && <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white bg-[#6B7280]">Switched off</span>}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Role of ${m.name}`} className={inputCls + " w-52"} value={m.role} onChange={async (e) => { await call(`/team/${m.id}/role`, { method: "PUT", body: { role: e.target.value } }); reload(); }}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <ActionButton small label={`${m.disabled ? "Switch on" : "Switch off"} ${m.name}`} color="#6B7280" onRun={async () => { const r = await call(`/team/${m.id}/active`, { method: "POST", body: { active: m.disabled } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />
                    <ActionButton small label={`Reset password for ${m.name}`} color="#6B7280" onRun={async () => { const r = await call<{ username: string; temporaryPassword: string }>(`/team/${m.id}/reset-password`, { method: "POST" }); if ("error" in r) return { error: r.error }; const x = r.data as unknown as { username: string; temporaryPassword: string }; setSecret({ name: m.name, username: x.username, password: x.temporaryPassword }); return undefined; }} />
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg-muted">Can see: {m.modules.map((x) => `${MODULE_TEXT[x.module] ?? x.module}${x.level === "r" ? " (look only)" : ""}`).join(", ")}</p>
              </li>))}</ul>)}</Status>
          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <label className="block"><span className="text-[11px] text-fg-muted">Name</span><input aria-label="Team name" className={inputCls + " mt-1 w-44"} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Email</span><input type="email" aria-label="Team email" className={inputCls + " mt-1 w-52"} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Username (saved in lower case)</span><input aria-label="Team username" className={inputCls + " mt-1 w-40"} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Role</span><select aria-label="Team role" className={inputCls + " mt-1 w-52"} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <ActionButton label="Create login" color={COLOR} onRun={async () => { const r = await call<{ username: string; temporaryPassword: string }>("/team", { method: "POST", body: { name: f.name, email: f.email, username: f.username, role: f.role } }); if ("error" in r) return { error: r.error }; const x = r.data as unknown as { username: string; temporaryPassword: string }; setSecret({ name: f.name, username: x.username, password: x.temporaryPassword }); setF({ name: "", email: "", username: "", role: f.role }); reload(); return undefined; }} />
          </div>
        </div>
      </SectionPanel>
    </div>
  );
}
