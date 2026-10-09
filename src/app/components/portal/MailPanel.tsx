import { useEffect, useState } from "react";
import { Mail, Send, Inbox, PenSquare } from "lucide-react";
import { useLoad, Status, Empty, ActionButton, inputCls, when } from "./ui";
import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";
import { AttachPicker, AttachmentList, useAttachments, type MailFile } from "./MailAttachments";

/**
 * Department mail for the management panel. An owner or superadmin sees every department; a department manager sees only the department(s) they have been
 * approved to manage. Messages (website messages and incoming email) are shown as plain text; a reply goes out from the department's own address.
 */
interface Dept { key: string; name: string; address: string; open: number }
interface Item { kind: "web" | "email"; id: string; department: string; fromName: string; fromEmail: string; subject: string; preview: string; status: string; at: string; ref?: string }
interface Detail extends Item { text: string; attachments?: MailFile[]; replies: { id: string; to: string; subject: string; body: string; status: string; by: string; at: string; attachments?: MailFile[] }[] }

/** The same small client the portals use (see portal/ui.tsx), pointed at /api/mail. */
function mailClient() {
  const base = `${API_BASE}/api/mail`;
  return async function call<T = Record<string, never>>(path: string, init?: { method?: string; body?: unknown }): Promise<{ data: T } | { error: string }> {
    try {
      const res = await authFetch(base + path, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) return { error: body.error ?? `Request failed (${res.status})` };
      return { data: body as T };
    } catch { return { error: "We could not reach the server. Please try again." }; }
  };
}

const COLOR = "#8B0000";
const STATUS_LABEL: Record<string, string> = { open: "Open", answered: "Answered", closed: "Closed", sent: "Sent", failed: "Not sent" };

export function MailPanel() {
  const call = mailClient();
  const [depts, reloadDepts] = useLoad<{ departments: Dept[] }>(() => call("/departments"));
  const [dept, setDept] = useState<string>("");
  const [box, setBox] = useState<"inbox" | "sent">("inbox");
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState<{ kind: string; id: string } | null>(null);
  const [composing, setComposing] = useState(false);
  const list = depts.state === "ready" ? depts.data.departments : [];
  useEffect(() => { if (!dept && list.length) setDept(list[0].key); }, [list.length]);          // eslint-disable-line react-hooks/exhaustive-deps

  const [msgs, reloadMsgs] = useLoad<{ messages: Item[] }>(() => (dept ? call(`/messages?department=${encodeURIComponent(dept)}&box=${box}${box === "inbox" && status ? `&status=${status}` : ""}`) : Promise.resolve({ data: { messages: [] } })), [dept, box, status]);
  const refresh = () => { reloadMsgs(); reloadDepts(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-fg">Department mail</h1>
          <p className="text-fg-muted text-sm">Messages sent to your department's address and from the website. Replies go out from the department's own address.</p>
        </div>
        <button onClick={() => { setComposing(true); setSelected(null); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLOR }}><PenSquare className="w-4 h-4" /> New email</button>
      </div>

      <Status load={depts}>{({ departments }) => departments.length === 0
        ? <Empty>You do not manage any department mailbox yet. Apply for a department under "Apply for a Section"; a Super Administrator will review it.</Empty>
        : (
          <>
            <div role="tablist" aria-label="Departments" className="flex gap-2 flex-wrap">
              {departments.map((d) => (
                <button key={d.key} role="tab" aria-selected={dept === d.key} onClick={() => { setDept(d.key); setSelected(null); setComposing(false); }}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border" style={dept === d.key ? { background: COLOR, color: "#fff", borderColor: COLOR } : { color: "var(--vk-fg)", borderColor: "var(--vk-line)" }}>
                  {d.name}{d.open > 0 && <span className="ml-1.5 px-1.5 rounded-full text-[10px]" style={{ background: dept === d.key ? "rgba(255,255,255,0.25)" : "#FDECE0", color: dept === d.key ? "#fff" : "#8B0000" }}>{d.open}</span>}
                </button>))}
            </div>
            {dept && dept !== "unrouted" && <p className="text-xs text-fg-muted flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {departments.find((d) => d.key === dept)?.address}</p>}

            <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
              <section aria-label="Messages" className="rounded-xl border border-line bg-surface overflow-hidden">
                <div className="flex items-center gap-2 p-2 border-b border-line text-xs">
                  <button onClick={() => { setBox("inbox"); setSelected(null); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold" style={box === "inbox" ? { background: COLOR, color: "#fff" } : { color: "var(--vk-fg-muted)" }}><Inbox className="w-3.5 h-3.5" /> Inbox</button>
                  <button onClick={() => { setBox("sent"); setSelected(null); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold" style={box === "sent" ? { background: COLOR, color: "#fff" } : { color: "var(--vk-fg-muted)" }}><Send className="w-3.5 h-3.5" /> Sent</button>
                  {box === "inbox" && (
                    <select aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls + " !w-auto !py-1 ml-auto"}>
                      <option value="open">Open</option><option value="answered">Answered</option><option value="closed">Closed</option><option value="">All</option>
                    </select>)}
                </div>
                <Status load={msgs}>{({ messages }) => messages.length === 0 ? <div className="p-4"><Empty>{box === "sent" ? "Nothing sent from this department yet." : "No messages here."}</Empty></div> : (
                  <ul className="divide-y divide-line max-h-[60vh] overflow-y-auto">{messages.map((m) => (
                    <li key={`${m.kind}-${m.id}`}>
                      <button onClick={() => { setSelected({ kind: m.kind, id: m.id }); setComposing(false); }} className="w-full text-left p-3 hover:bg-surface-2" style={selected?.id === m.id ? { background: "var(--vk-surface-2, #f5f5f5)" } : undefined}>
                        <p className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold text-fg truncate">{m.fromName}</span><span className="text-[11px] text-fg-muted shrink-0">{when(m.at)}</span></p>
                        <p className="text-xs text-fg truncate">{m.subject}</p>
                        <p className="text-[11px] text-fg-muted truncate">{m.preview}</p>
                        <p className="text-[10px] mt-1 font-bold" style={{ color: m.status === "open" ? "#B45309" : m.status === "failed" ? "#DC2626" : "#047857" }}>{STATUS_LABEL[m.status] ?? m.status}{m.kind === "web" && box === "inbox" ? " · from the website" : ""}</p>
                      </button>
                    </li>))}</ul>)}</Status>
              </section>

              <section aria-label="Message" className="rounded-xl border border-line bg-surface p-4 min-h-[16rem]">
                {composing ? <Compose call={call} departments={departments.filter((d) => d.key !== "unrouted")} initial={dept} onSent={() => { setComposing(false); refresh(); }} />
                  : selected && box === "inbox" ? <Message key={selected.id} call={call} kind={selected.kind} id={selected.id} onChanged={refresh} />
                  : <Empty>{box === "sent" ? "Choose a message in the inbox to read it and answer it." : "Choose a message to read it, answer it, or write a new email."}</Empty>}
              </section>
            </div>
          </>)}</Status>
    </div>
  );
}

function Message({ call, kind, id, onChanged }: { call: ReturnType<typeof mailClient>; kind: string; id: string; onChanged: () => void }) {
  const [load, reload] = useLoad<{ message: Detail }>(() => call(`/messages/${kind}/${id}`), [kind, id]);
  const [body, setBody] = useState("");
  const att = useAttachments();
  return (
    <Status load={load}>{({ message: m }) => (
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-black text-fg">{m.subject}</h2>
          <p className="text-xs text-fg-muted">From <b className="text-fg">{m.fromName}</b> &lt;{m.fromEmail}&gt; · {when(m.at)}{m.ref ? ` · ${m.ref}` : ""} · {STATUS_LABEL[m.status] ?? m.status}</p>
        </div>
        <pre className="whitespace-pre-wrap break-words text-sm text-fg font-sans rounded-lg p-3" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>{m.text || "(no text)"}</pre>
        <AttachmentList files={m.attachments} />
        {m.replies.length > 0 && (
          <div className="space-y-2">{m.replies.map((r) => (
            <div key={r.id} className="rounded-lg p-3 text-sm" style={{ background: "var(--vk-bg)", borderLeft: `3px solid ${r.status === "sent" ? "#047857" : "#DC2626"}` }}>
              <p className="text-[11px] text-fg-muted">{r.by} · {when(r.at)} · {r.status === "sent" ? "Sent" : "Not sent"}</p>
              <p className="whitespace-pre-wrap break-words text-fg">{r.body}</p>
              <div className="mt-2"><AttachmentList files={r.attachments} label="Sent with this reply" /></div>
            </div>))}</div>)}
        <label className="block"><span className="text-xs font-bold text-fg">Your reply</span>
          <textarea aria-label="Your reply" value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={inputCls + " mt-1"} placeholder="Write your answer. It is sent from the department's address." /></label>
        <AttachPicker att={att} />
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Send reply" color={COLOR} onRun={async () => { const r = await call(`/messages/${kind}/${id}/reply`, { method: "POST", body: { body, ...(att.ids.length ? { attachmentIds: att.ids } : {}) } }); if ("error" in r) return { error: r.error }; setBody(""); att.clear(); reload(); onChanged(); return { message: "Reply sent." }; }} />
          {m.status !== "closed" && <ActionButton label="Mark closed" color="#64748B" onRun={async () => { const r = await call(`/messages/${kind}/${id}/status`, { method: "POST", body: { status: "closed" } }); if ("error" in r) return { error: r.error }; reload(); onChanged(); }} />}
          {m.status === "closed" && <ActionButton label="Reopen" color="#64748B" onRun={async () => { const r = await call(`/messages/${kind}/${id}/status`, { method: "POST", body: { status: "open" } }); if ("error" in r) return { error: r.error }; reload(); onChanged(); }} />}
        </div>
      </div>)}</Status>
  );
}

function Compose({ call, departments, initial, onSent }: { call: ReturnType<typeof mailClient>; departments: Dept[]; initial: string; onSent: () => void }) {
  const [department, setDepartment] = useState(departments.some((d) => d.key === initial) ? initial : departments[0]?.key ?? "");
  const [to, setTo] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const att = useAttachments();
  const from = departments.find((d) => d.key === department);
  return (
    <div className="space-y-3">
      <h2 className="text-base font-black text-fg">New email</h2>
      <label className="block"><span className="text-xs font-bold text-fg">From</span>
        <select aria-label="From" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls + " mt-1"}>{departments.map((d) => <option key={d.key} value={d.key}>{d.name} &lt;{d.address}&gt;</option>)}</select></label>
      <label className="block"><span className="text-xs font-bold text-fg">To</span><input aria-label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls + " mt-1"} placeholder="name@example.com" /></label>
      <label className="block"><span className="text-xs font-bold text-fg">Subject</span><input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls + " mt-1"} maxLength={200} /></label>
      <label className="block"><span className="text-xs font-bold text-fg">Message</span><textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={inputCls + " mt-1"} /></label>
      <AttachPicker att={att} />
      <ActionButton label={`Send from ${from?.address ?? "department"}`} color={COLOR} onRun={async () => { const r = await call("/send", { method: "POST", body: { department, to, subject, body, ...(att.ids.length ? { attachmentIds: att.ids } : {}) } }); if ("error" in r) return { error: r.error }; att.clear(); onSent(); return { message: "Email sent." }; }} />
    </div>
  );
}
