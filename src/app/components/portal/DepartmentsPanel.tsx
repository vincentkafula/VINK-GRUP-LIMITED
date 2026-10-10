import { useState } from "react";
import { Building2, Mail, Users, Inbox } from "lucide-react";
import { useLoad, Status, ActionButton, inputCls } from "./ui";
import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";

/**
 * Departments, for Super Administrators: every department with its mailbox, how much mail it has had and how many managers it has, and a form to make a new one.
 * A new department gets its mailbox address at once (all mail to the company domain is received), appears in Department mail for Super Administrators, and becomes
 * a section that people can be approved to manage. Its name cannot be changed afterwards, because managers are approved for it by name.
 */
interface Dept { key: string; name: string; address: string; purpose: string; respondWithin: string; builtIn: boolean; public: boolean; active: boolean; messages: number; managers: number }

function client() {
  const base = `${API_BASE}/api/admin/departments`;
  return async function call<T = Record<string, never>>(path: string, init?: { method?: string; body?: unknown }): Promise<{ data: T } | { error: string }> {
    try {
      const res = await authFetch(base + path, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) return { error: body.error ?? `Request failed (${res.status})` };
      return { data: body as T };
    } catch { return { error: "We could not reach the server. Please try again." }; }
  };
}

const COLOR = "#7C3AED";
const pill = (on: boolean, yes: string, no: string, good = true) => <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={on ? { background: good ? "#DCFCE7" : "#FEF3C7", color: good ? "#166534" : "#92400E" } : { background: "#F1F5F9", color: "#475569" }}>{on ? yes : no}</span>;

export function DepartmentsPanel() {
  const call = client();
  const [load, reload] = useLoad<{ departments: Dept[]; domain: string }>(() => call(""));
  const [f, setF] = useState({ name: "", mailbox: "", purpose: "", respondWithin: "", public: false });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ purpose: "", respondWithin: "", public: false, active: true });
  const domain = load.state === "ready" ? load.data.domain : "vink.co.za";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-fg">Departments</h1>
        <p className="text-fg-muted text-sm max-w-3xl">Each department has its own mailbox in Department mail, and its own section that people can be approved to manage. Make a new one below. Its address works straight away: all mail sent to @{domain} is received.</p>
      </div>

      <Status load={load}>{({ departments }) => (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Departments">{departments.map((d) => (
          <li key={d.key} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "#EEEBFF", color: COLOR }}><Building2 className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-fg">{d.name}</p>
                <a href={`mailto:${d.address}`} className="flex items-center gap-1 text-xs text-fg-muted hover:underline"><Mail className="h-3 w-3" /> {d.address}</a>
                <p className="mt-1 text-xs text-fg-muted">{d.purpose}</p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5">
                  {pill(d.builtIn, "Built in", "Made here", false)}{pill(d.public, "On the Contact page", "Internal only")}{pill(d.active, "Active", "Switched off", d.active)}
                  <span className="flex items-center gap-1 text-[11px] text-fg-muted"><Inbox className="h-3 w-3" /> {d.messages} message{d.messages === 1 ? "" : "s"}</span>
                  <span className="flex items-center gap-1 text-[11px] text-fg-muted"><Users className="h-3 w-3" /> {d.managers} manager{d.managers === 1 ? "" : "s"}</span>
                </p>
              </div>
              {!d.builtIn && <button type="button" onClick={() => { setEditing(editing === d.key ? null : d.key); setDraft({ purpose: d.purpose, respondWithin: d.respondWithin, public: d.public, active: d.active }); }} className="text-xs font-bold underline" aria-label={`Edit ${d.name}`}>{editing === d.key ? "Close" : "Edit"}</button>}
            </div>
            {editing === d.key && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <label className="block"><span className="text-xs font-bold text-fg">What it is for</span><input aria-label="What it is for" value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} maxLength={140} className={inputCls + " mt-1"} /></label>
                <label className="block"><span className="text-xs font-bold text-fg">Reply time shown to the public</span><input aria-label="Reply time" value={draft.respondWithin} onChange={(e) => setDraft({ ...draft, respondWithin: e.target.value })} maxLength={60} className={inputCls + " mt-1"} /></label>
                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" aria-label="Show on the Contact page" checked={draft.public} onChange={(e) => setDraft({ ...draft, public: e.target.checked })} /> Show on the public Contact page</label>
                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" aria-label="Active" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active (switched off: hidden from the Contact page and from the choice of who to write from; mail stays readable)</label>
                <ActionButton label="Save changes" color={COLOR} onRun={async () => { const r = await call(`/${d.key}`, { method: "PATCH", body: draft }); if ("error" in r) return { error: r.error }; setEditing(null); reload(); return { message: "Saved." }; }} />
              </div>)}
          </li>))}</ul>)}</Status>

      <form className="rounded-xl border border-line bg-surface p-4 space-y-3 max-w-2xl" onSubmit={(e) => e.preventDefault()} aria-label="New department">
        <h2 className="text-base font-black text-fg">New department</h2>
        <label className="block"><span className="text-xs font-bold text-fg">Department name</span><input aria-label="Department name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} placeholder="Legal Affairs" className={inputCls + " mt-1"} /></label>
        <label className="block"><span className="text-xs font-bold text-fg">Mailbox name</span>
          <span className="mt-1 flex items-center gap-2"><input aria-label="Mailbox name" value={f.mailbox} onChange={(e) => setF({ ...f, mailbox: e.target.value.toLowerCase() })} maxLength={32} placeholder="legal" className={inputCls} /><span className="shrink-0 text-sm text-fg-muted">@{domain}</span></span></label>
        <label className="block"><span className="text-xs font-bold text-fg">What it is for</span><input aria-label="Purpose" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} maxLength={140} placeholder="Contracts and legal questions" className={inputCls + " mt-1"} /></label>
        <label className="block"><span className="text-xs font-bold text-fg">Reply time shown to the public (optional)</span><input aria-label="Response time" value={f.respondWithin} onChange={(e) => setF({ ...f, respondWithin: e.target.value })} maxLength={60} placeholder="1–2 business days" className={inputCls + " mt-1"} /></label>
        <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" aria-label="Show on the public Contact page" checked={f.public} onChange={(e) => setF({ ...f, public: e.target.checked })} /> Show on the public Contact page</label>
        <ActionButton label="Create department" color={COLOR} onRun={async () => {
          const r = await call<{ department: Dept }>("", { method: "POST", body: { ...f, respondWithin: f.respondWithin || undefined } });
          if ("error" in r) return { error: r.error };
          setF({ name: "", mailbox: "", purpose: "", respondWithin: "", public: false }); reload();
          return { message: `${r.data.department.name} is ready: mail to ${r.data.department.address} arrives in Department mail. To let a manager in, approve them for the section "${r.data.department.name}" under Applications or Managers.` };
        }} />
      </form>
    </div>
  );
}
