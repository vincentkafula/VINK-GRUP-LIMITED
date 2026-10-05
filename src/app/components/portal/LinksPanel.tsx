import { useState } from "react";
import { SectionPanel, Badge } from "../dashboards/DashboardShell";
import { useLoad, Status, Empty, ActionButton, outcome, inputCls, type Call } from "./ui";

interface Incoming { kind: string; id: string; from: string; fromEmail: string; role: string; at: string | null }
interface Link { kind: string; id: string; with: string; withEmail: string; role: string; status: string }

const ROLE_LABEL: Record<string, string> = { association: "Association", vehicle_owner: "Vehicle owner", driver: "Driver", marshal: "Marshal" };

/**
 * Requests and links shared by the owner, driver and marshal dashboards: answer invitations, see who I am linked to, leave, and ask
 * an association (or, for a driver, an owner) to take me in. Nothing is linked until the other side accepts.
 */
export function LinksPanel({ call, color, canAskOwner }: { call: Call; color: string; canAskOwner?: boolean }) {
  const [load, reload] = useLoad<{ incoming: Incoming[]; links: Link[] }>(() => call("/requests"));
  const [assoc, setAssoc] = useState("");
  const [owner, setOwner] = useState("");

  return (
    <>
      <Status load={load}>{({ incoming, links }) => (
        <>
          <SectionPanel title={`Requests waiting for you${incoming.length ? ` (${incoming.length})` : ""}`}>
            <div className="p-4">{incoming.length === 0 ? <Empty>No requests right now.</Empty> : (
              <ul className="space-y-3">{incoming.map((r) => (
                <li key={r.kind + r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg">
                  <span>{r.from} <span className="text-fg-subtle">({ROLE_LABEL[r.role] ?? r.role}) · {r.fromEmail}</span></span>
                  <span className="flex gap-2">
                    <ActionButton small label="Accept" color={color} onRun={async () => { const x = await call(`/requests/${r.kind}/${r.id}/respond`, { method: "POST", body: { accept: true } }); reload(); return "error" in x ? { error: x.error } : undefined; }} />
                    <ActionButton small label="Decline" color="#6B7280" onRun={async () => { const x = await call(`/requests/${r.kind}/${r.id}/respond`, { method: "POST", body: { accept: false } }); reload(); return "error" in x ? { error: x.error } : undefined; }} />
                  </span>
                </li>))}</ul>)}
            </div>
          </SectionPanel>
          <SectionPanel title="Your links">
            <div className="p-4">{links.length === 0 ? <Empty>You are not linked to anyone yet.</Empty> : (
              <ul className="space-y-2">{links.map((l) => (
                <li key={l.kind + l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg">
                  <span>{l.with} <span className="text-fg-subtle">({ROLE_LABEL[l.role] ?? l.role}) · {l.withEmail}</span> <Badge text={l.status === "pending" ? "waiting for them" : l.status} color={l.status === "active" ? "#10B981" : "#F59E0B"} /></span>
                  <ActionButton small label={l.status === "pending" ? "Cancel" : "Leave"} color="#6B7280" onRun={async () => { const x = await call(`/requests/${l.kind}/${l.id}/leave`, { method: "POST", body: {} }); reload(); return "error" in x ? { error: x.error } : undefined; }} />
                </li>))}</ul>)}
            </div>
          </SectionPanel>
        </>
      )}</Status>
      <SectionPanel title="Ask to join">
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input className={inputCls + " max-w-xs"} placeholder="Association's email" value={assoc} onChange={(e) => setAssoc(e.target.value)} />
            <ActionButton label="Ask the association" color={color} onRun={async () => { const x = await call<{ message?: string }>("/associations/request", { method: "POST", body: { email: assoc } }); if (!("error" in x)) { setAssoc(""); reload(); } return outcome(x); }} />
          </div>
          {canAskOwner && (
            <div className="flex flex-wrap gap-2 items-center">
              <input className={inputCls + " max-w-xs"} placeholder="Owner's email" value={owner} onChange={(e) => setOwner(e.target.value)} />
              <ActionButton label="Ask the owner" color={color} onRun={async () => { const x = await call<{ message?: string }>("/owners/request", { method: "POST", body: { email: owner } }); if (!("error" in x)) { setOwner(""); reload(); } return outcome(x); }} />
            </div>
          )}
          <p className="text-[11px] text-fg-subtle">They will see your request and have to accept it.</p>
        </div>
      </SectionPanel>
    </>
  );
}
