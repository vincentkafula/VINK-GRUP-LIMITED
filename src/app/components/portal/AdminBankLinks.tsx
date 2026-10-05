import { useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { authFetch, getSession } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { Badge } from "../dashboards/DashboardShell";
import { useLoad, Status, Empty, ActionButton, inputCls, rand, when } from "./ui";
import { CopyButton, spaced, type BankLink } from "./BankAccount";
import { Pager } from "./widgets";

const COLOR = "#38BDF8";
const STAFF = ["owner", "superadmin"];
const ROLES: [string, string][] = [["", "All roles"], ["driver", "Drivers"], ["marshal", "Marshals"], ["association", "Associations"], ["investor", "Investors"], ["vehicle_owner", "Owners"]];
const STATUS_COLOR: Record<string, string> = { verified: "#10B981", pending_review: "#F59E0B", rejected: "#EF4444" };

interface Row extends BankLink { user: { id: string; name: string; email: string; role: string } }
type Reply = { data: Record<string, unknown> } | { error: string };

async function api(path: string, init?: { method?: string; body?: unknown }): Promise<Reply> {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/bank-links${path}`, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
    const body = await res.json().catch(() => ({}));
    return !res.ok || body.success === false ? { error: body.error ?? `Request failed (${res.status})` } : { data: body };
  } catch { return { error: "We could not reach the server." }; }
}

/** Staff view of every dashboard user's bank account, with review of Business accounts. The server only answers to owner and superadmin accounts. */
export function AdminBankLinks({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [status, setStatus] = useState(""); const [role, setRole] = useState(""); const [q, setQ] = useState(""); const [offset, setOffset] = useState(0);
  const LIMIT = 20;
  const qs = new URLSearchParams({ limit: String(LIMIT), offset: String(offset), ...(status ? { status } : {}), ...(role ? { role } : {}), ...(q.trim() ? { q: q.trim() } : {}) }).toString();
  const [load, reload] = useLoad<{ total: number; links: Row[] }>(() => api(`?${qs}`) as never, [qs]);
  const [rejecting, setRejecting] = useState<string | null>(null); const [note, setNote] = useState("");
  const session = getSession();
  if (!isOpen) return null;
  const staff = !!session && STAFF.includes(session.role);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto" style={{ background: "var(--vk-bg)" }} role="dialog" aria-modal="true" aria-label="Bank accounts of all users">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between"><h1 className="text-xl font-bold text-fg flex items-center gap-2"><ShieldCheck className="w-5 h-5" style={{ color: `color-mix(in srgb, ${COLOR} 62%, var(--vk-fg))` }} />Bank accounts of all users</h1>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 text-fg-muted"><X className="w-5 h-5" /></button></div>
        {!staff ? <p role="alert" className="text-sm text-bad">This page is for administrators. Please sign in with a staff account.</p> : (
          <>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="block"><span className="text-[11px] text-fg-muted">Search name or email</span><input className={inputCls + " mt-1 !w-60"} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} /></label>
              <label className="block"><span className="text-[11px] text-fg-muted">Role</span><select className={inputCls + " mt-1 !w-auto"} value={role} onChange={(e) => { setRole(e.target.value); setOffset(0); }}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="block"><span className="text-[11px] text-fg-muted">Status</span><select className={inputCls + " mt-1 !w-auto"} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="">All</option><option value="pending_review">Pending review</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label>
            </div>
            <Status load={load}>{({ total, links }) => links.length === 0 ? <Empty>No bank accounts match.</Empty> : (
              <>
                <ul className="space-y-3">{links.map((l) => (
                  <li key={l.id} className="rounded-xl p-4 space-y-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-fg"><b>{l.user.name}</b> <span className="text-fg-muted">· {l.user.email} · {ROLES.find(([v]) => v === l.user.role)?.[1].replace(/s$/, "") ?? l.user.role}</span></p>
                      <Badge text={l.status.replace("_", " ")} color={STATUS_COLOR[l.status]} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3"><p className="font-mono text-xl font-bold tracking-wider text-fg">{l.accountNumber ? spaced(l.accountNumber) : "account missing"}</p>{l.accountNumber && <CopyButton value={l.accountNumber} label="account number" color={COLOR} />}</div>
                    <p className="text-xs text-fg-muted">{l.holderName} · {l.bankName} · {l.accountType} account{l.balance !== null ? ` · balance ${rand(l.balance)}` : ""}{l.registrationNumber ? ` · reg. ${l.registrationNumber}` : ""} · updated {l.updatedAt ? when(l.updatedAt) : "–"}</p>
                    {l.reviewNote && <p className="text-xs text-fg-muted">Review note: {l.reviewNote}</p>}
                    {l.holderType === "business" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton small label="Approve" color="#10B981" onRun={async () => { const r = await api(`/${l.id}/review`, { method: "POST", body: { approve: true } }); reload(); return "error" in r ? { error: r.error } : undefined; }} />
                        {rejecting === l.id ? (
                          <span className="flex flex-wrap items-center gap-2"><input className={inputCls + " !w-64"} placeholder="Reason (the user will see this)" value={note} onChange={(e) => setNote(e.target.value)} />
                            <ActionButton small label="Confirm reject" color="#EF4444" onRun={async () => { const r = await api(`/${l.id}/review`, { method: "POST", body: { approve: false, note } }); if (!("error" in r)) { setRejecting(null); setNote(""); reload(); } return "error" in r ? { error: r.error } : undefined; }} /></span>
                        ) : <button type="button" className="text-xs underline text-fg min-h-[32px]" onClick={() => { setRejecting(l.id); setNote(""); }}>Reject…</button>}
                      </div>)}
                  </li>))}</ul>
                <Pager total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
              </>)}</Status>
          </>)}
      </div>
    </div>
  );
}
