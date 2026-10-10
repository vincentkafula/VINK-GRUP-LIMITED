import { useEffect, useState } from "react";
import { Mail, Send, Inbox, PenSquare, Star, FileText, ShieldAlert, Trash2, Search, Undo2 } from "lucide-react";
import { useLoad, Status, Empty, ActionButton, inputCls, when } from "./ui";
import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";
import { AttachPicker, AttachmentList, useAttachments, type MailFile } from "./MailAttachments";
import { EmailHtml } from "./MailHtmlBody";
import { SendButton, UndoSetting, useAutosave } from "./MailSend";

/**
 * Department mail for the management panel. An owner or superadmin sees every department; a department manager sees only the department(s) they have been
 * approved to manage. Boxes: Inbox, Starred, Drafts, Sent, Spam, Trash, and a search over all of it. A reply goes out from the department's own address.
 */
interface Dept { key: string; name: string; address: string; open: number; drafts?: number }
interface Item { kind: "web" | "email"; id: string; department: string; fromName: string; fromEmail: string; subject: string; preview: string; status: string; at: string; ref?: string; starred?: boolean; folder?: string }
interface Draft { id: string; department: string; to: string; subject: string; body: string; replyKind: "web" | "email" | null; replyId: string | null; attachments: MailFile[]; updatedAt: string }
interface Detail extends Item {
  text: string; html?: string | null; attachments?: MailFile[];
  thread?: { kind: "web" | "email"; id: string; subject: string; preview: string; at: string }[]; draft?: Draft | null;
  replies: { id: string; to: string; subject: string; body: string; status: string; by: string; at: string; attachments?: MailFile[] }[];
}
type Box = "inbox" | "starred" | "drafts" | "sent" | "spam" | "trash";
type Call = ReturnType<typeof mailClient>;

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
const BOXES: { key: Box; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox }, { key: "starred", label: "Starred", icon: Star }, { key: "drafts", label: "Drafts", icon: FileText },
  { key: "sent", label: "Sent", icon: Send }, { key: "spam", label: "Spam", icon: ShieldAlert }, { key: "trash", label: "Trash", icon: Trash2 },
];
const EMPTY: Record<Box, string> = { inbox: "No messages here.", starred: "No starred messages. Star a message to find it here.", drafts: "No drafts. An email you start writing is saved here as you type.", sent: "Nothing sent from this department yet.", spam: "Nothing in Spam.", trash: "Trash is empty." };
const SEARCH_HELP = 'Search all mail. Try: from:pam   subject:invoice   has:attachment   is:starred   after:2026-10-01   "exact words"   -leaveout';

export function MailPanel() {
  const call = mailClient();
  const [depts, reloadDepts] = useLoad<{ departments: Dept[] }>(() => call("/departments"));
  const [dept, setDept] = useState<string>("");
  const [box, setBox] = useState<Box>("inbox");
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState(""); const [applied, setApplied] = useState("");
  const [selected, setSelected] = useState<{ kind: string; id: string } | null>(null);
  const [composing, setComposing] = useState<{ key: number; draft?: Draft } | null>(null);
  const list = depts.state === "ready" ? depts.data.departments : [];
  useEffect(() => { if (!dept && list.length) setDept(list[0].key); }, [list.length]);          // eslint-disable-line react-hooks/exhaustive-deps

  const searching = applied.trim() !== "";
  const listBox = searching && (box === "inbox" || box === "starred") ? "all" : box === "drafts" ? "inbox" : box;
  const [msgs, reloadMsgs] = useLoad<{ messages: Item[] }>(() => (dept && box !== "drafts" ? call(`/messages?department=${encodeURIComponent(dept)}&box=${listBox}${box === "inbox" && !searching && status ? `&status=${status}` : ""}${searching ? `&q=${encodeURIComponent(applied)}` : ""}`) : Promise.resolve({ data: { messages: [] } })), [dept, box, status, applied]);
  const [drafts, reloadDrafts] = useLoad<{ drafts: Draft[] }>(() => (dept && box === "drafts" ? call(`/drafts?department=${encodeURIComponent(dept)}`) : Promise.resolve({ data: { drafts: [] } })), [dept, box]);
  const refresh = () => { reloadMsgs(); reloadDepts(); reloadDrafts(); };
  const goBox = (b: Box) => { setBox(b); setSelected(null); setComposing(null); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-fg">Department mail</h1>
          <p className="text-fg-muted text-sm">Messages sent to your department's address and from the website. Replies go out from the department's own address.</p>
        </div>
        <button onClick={() => { setComposing({ key: Date.now() }); setSelected(null); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLOR }}><PenSquare className="w-4 h-4" /> New email</button>
      </div>

      <Status load={depts}>{({ departments }) => departments.length === 0
        ? <Empty>You do not manage any department mailbox yet. Apply for a department under "Apply for a Section"; a Super Administrator will review it.</Empty>
        : (
          <>
            <div role="tablist" aria-label="Departments" className="flex gap-2 flex-wrap">
              {departments.map((d) => (
                <button key={d.key} role="tab" aria-selected={dept === d.key} onClick={() => { setDept(d.key); setSelected(null); setComposing(null); }}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border" style={dept === d.key ? { background: COLOR, color: "#fff", borderColor: COLOR } : { color: "var(--vk-fg)", borderColor: "var(--vk-line)" }}>
                  {d.name}{d.open > 0 && <span className="ml-1.5 px-1.5 rounded-full text-[10px]" style={{ background: dept === d.key ? "rgba(255,255,255,0.25)" : "#FDECE0", color: dept === d.key ? "#fff" : "#8B0000" }}>{d.open}</span>}
                </button>))}
            </div>
            {dept && dept !== "unrouted" && <p className="text-xs text-fg-muted flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {departments.find((d) => d.key === dept)?.address}</p>}

            <form role="search" onSubmit={(e) => { e.preventDefault(); setApplied(q); setSelected(null); setComposing(null); }} className="flex gap-2">
              <label className="relative flex-1"><span className="sr-only">Search mail</span>
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                <input aria-label="Search mail" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value === "") setApplied(""); }} placeholder="Search mail" title={SEARCH_HELP} className={inputCls + " !pl-9"} /></label>
              <button type="submit" className="px-3 py-2 rounded-lg text-xs font-bold border border-line text-fg hover:bg-surface-2">Search</button>
              {searching && <button type="button" onClick={() => { setQ(""); setApplied(""); }} className="px-3 py-2 rounded-lg text-xs font-bold border border-line text-fg-muted hover:bg-surface-2">Clear</button>}
            </form>
            {searching && <p className="text-[11px] text-fg-muted">Searching {box === "spam" || box === "trash" || box === "sent" ? BOXES.find((b) => b.key === box)!.label : "all mail"} for: {applied}</p>}

            <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
              <section aria-label="Messages" className="rounded-xl border border-line bg-surface overflow-hidden">
                <div role="tablist" aria-label="Boxes" className="flex items-center gap-1 p-2 border-b border-line text-xs flex-wrap">
                  {BOXES.map(({ key, label, icon: Icon }) => {
                    const n = key === "inbox" ? departments.find((d) => d.key === dept)?.open : key === "drafts" ? departments.find((d) => d.key === dept)?.drafts : 0;
                    return (
                      <button key={key} role="tab" aria-selected={box === key} onClick={() => goBox(key)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-bold" style={box === key ? { background: COLOR, color: "#fff" } : { color: "var(--vk-fg)" }}>
                        <Icon className="w-3.5 h-3.5" /> {label}{n ? <span className="text-[10px] opacity-80">({n})</span> : null}
                      </button>);
                  })}
                  {box === "inbox" && !searching && (
                    <select aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls + " !w-auto !py-1 ml-auto"}>
                      <option value="open">Open</option><option value="answered">Answered</option><option value="closed">Closed</option><option value="">All</option>
                    </select>)}
                </div>
                {box === "drafts"
                  ? <Status load={drafts}>{({ drafts: ds }) => ds.length === 0 ? <div className="p-4"><Empty>{EMPTY.drafts}</Empty></div> : (
                    <ul className="divide-y divide-line max-h-[60vh] overflow-y-auto">{ds.map((d) => (
                      <li key={d.id}>
                        <button onClick={() => { if (d.replyKind && d.replyId) { setBox("inbox"); setStatus(""); setSelected({ kind: d.replyKind, id: d.replyId }); setComposing(null); } else { setComposing({ key: Date.now(), draft: d }); setSelected(null); } }} className="w-full text-left p-3 hover:bg-surface-2">
                          <p className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold text-fg truncate">{d.replyId ? "Reply draft" : d.to || "(no recipient)"}</span><span className="text-[11px] text-fg-muted shrink-0">{when(d.updatedAt)}</span></p>
                          <p className="text-xs text-fg truncate">{d.subject || "(no subject)"}</p>
                          <p className="text-[11px] text-fg-muted truncate">{d.body.slice(0, 120)}</p>
                        </button>
                      </li>))}</ul>)}</Status>
                  : <Status load={msgs}>{({ messages }) => messages.length === 0 ? <div className="p-4"><Empty>{searching ? "Nothing matches that search." : EMPTY[box]}</Empty></div> : (
                    <ul className="divide-y divide-line max-h-[60vh] overflow-y-auto">{messages.map((m) => (
                      <li key={`${m.kind}-${m.id}`}>
                        <button onClick={() => { setSelected({ kind: m.kind, id: m.id }); setComposing(null); }} className="w-full text-left p-3 hover:bg-surface-2" style={selected?.id === m.id ? { background: "var(--vk-surface-2, #f5f5f5)" } : undefined}>
                          <p className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold text-fg truncate">{m.starred && <Star className="w-3 h-3 inline mr-1 -mt-0.5" fill="#C9A84C" stroke="#C9A84C" aria-label="Starred" />}{m.fromName}</span><span className="text-[11px] text-fg-muted shrink-0">{when(m.at)}</span></p>
                          <p className="text-xs text-fg truncate">{m.subject}</p>
                          <p className="text-[11px] text-fg-muted truncate">{m.preview}</p>
                          <p className="text-[10px] mt-1 font-bold" style={{ color: m.status === "open" ? "#B45309" : m.status === "failed" ? "#DC2626" : "#047857" }}>{STATUS_LABEL[m.status] ?? m.status}{m.kind === "web" && box !== "sent" ? " · from the website" : ""}</p>
                        </button>
                      </li>))}</ul>)}</Status>}
              </section>

              <section aria-label="Message" className="rounded-xl border border-line bg-surface p-4 min-h-[16rem]">
                {composing ? <Compose key={composing.key} call={call} departments={departments.filter((d) => d.key !== "unrouted")} initial={dept} draft={composing.draft} onSent={() => { setComposing(null); refresh(); }} onChanged={refresh} />
                  : selected && box !== "sent" ? <Message key={selected.id} call={call} kind={selected.kind} id={selected.id} onChanged={refresh} onMoved={() => { setSelected(null); refresh(); }} onOpen={(k, i) => setSelected({ kind: k, id: i })} />
                  : <Empty>{box === "sent" ? "Choose a message in the inbox to read it and answer it." : "Choose a message to read it, answer it, or write a new email."}</Empty>}
              </section>
            </div>
          </>)}</Status>
    </div>
  );
}

function Message({ call, kind, id, onChanged, onMoved, onOpen }: { call: Call; kind: string; id: string; onChanged: () => void; onMoved: () => void; onOpen: (kind: "web" | "email", id: string) => void }) {
  const [load, reload] = useLoad<{ message: Detail }>(() => call(`/messages/${kind}/${id}`), [kind, id]);
  return <Status load={load}>{({ message: m }) => <MessageView key={m.id} call={call} kind={kind} id={id} m={m} reload={reload} onChanged={onChanged} onMoved={onMoved} onOpen={onOpen} />}</Status>;
}

function MessageView({ call, kind, id, m, reload, onChanged, onMoved, onOpen }: { call: Call; kind: string; id: string; m: Detail; reload: () => void; onChanged: () => void; onMoved: () => void; onOpen: (kind: "web" | "email", id: string) => void }) {
  const [body, setBody] = useState(m.draft?.body ?? "");
  const att = useAttachments();
  const [view, setView] = useState<"formatted" | "text">("formatted");
  const [spamPanel, setSpamPanel] = useState(false); const [block, setBlock] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { if (m.draft?.attachments?.length) att.set(m.draft.attachments); }, []);          // eslint-disable-line react-hooks/exhaustive-deps

  const auto = useAutosave(`${body}|${att.ids.join(",")}`, async () => {
    const r = await call("/drafts", { method: "POST", body: { department: m.department, replyKind: kind, replyId: id, body, attachmentIds: att.ids } });
    return !("error" in r);
  });
  const move = async (folder: string, blockSender = false) => {
    const r = await call(`/messages/${kind}/${id}/folder`, { method: "POST", body: { folder, ...(blockSender ? { blockSender: true } : {}) } });
    if ("error" in r) { setNote(r.error); return; }
    onMoved();
  };
  const star = async () => { const r = await call(`/messages/${kind}/${id}/star`, { method: "POST", body: { starred: !m.starred } }); if ("error" in r) setNote(r.error); else { reload(); onChanged(); } };
  const small = "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border border-line text-fg hover:bg-surface-2";

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-black text-fg">{m.subject}</h2>
        <p className="text-xs text-fg-muted">From <b className="text-fg">{m.fromName}</b> &lt;{m.fromEmail}&gt; · {when(m.at)}{m.ref ? ` · ${m.ref}` : ""} · {STATUS_LABEL[m.status] ?? m.status}{m.folder && m.folder !== "inbox" ? ` · in ${m.folder === "spam" ? "Spam" : "Trash"}` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Message actions">
        <button type="button" onClick={star} aria-label={m.starred ? "Remove star" : "Star"} aria-pressed={!!m.starred} className={small}><Star className="w-3.5 h-3.5" fill={m.starred ? "#C9A84C" : "none"} stroke={m.starred ? "#C9A84C" : "currentColor"} /> {m.starred ? "Starred" : "Star"}</button>
        {m.folder === "inbox" || !m.folder ? (
          <>
            <button type="button" onClick={() => setSpamPanel((v) => !v)} className={small}><ShieldAlert className="w-3.5 h-3.5" /> Report spam</button>
            <button type="button" onClick={() => void move("trash")} className={small}><Trash2 className="w-3.5 h-3.5" /> Move to trash</button>
          </>) : <button type="button" onClick={() => void move("inbox")} className={small}><Undo2 className="w-3.5 h-3.5" /> {m.folder === "spam" ? "Not spam" : "Restore"}</button>}
        {m.folder === "spam" && <button type="button" onClick={() => void move("trash")} className={small}><Trash2 className="w-3.5 h-3.5" /> Move to trash</button>}
      </div>
      {spamPanel && (
        <div role="group" aria-label="Report spam" className="rounded-lg p-3 text-xs space-y-2" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#7C2D12" }}>
          <p>This moves the message to Spam.</p>
          <label className="flex items-start gap-2"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="mt-0.5" /> <span>Also block <b>{m.fromEmail}</b>, so their emails to this department go straight to Spam.</span></label>
          <div className="flex gap-2"><button type="button" onClick={() => void move("spam", block)} className="px-3 py-1 rounded-md font-bold text-white" style={{ background: COLOR }}>Move to Spam</button><button type="button" onClick={() => setSpamPanel(false)} className="px-3 py-1 rounded-md font-bold border border-line text-fg bg-surface">Cancel</button></div>
        </div>)}
      {note && <p role="alert" className="text-xs font-semibold" style={{ color: "#DC2626" }}>{note}</p>}

      {m.html && (
        <div role="tablist" aria-label="How to show the message" className="flex gap-1.5 text-[11px]">
          {([["formatted", "As sent"], ["text", "Plain text"]] as const).map(([k, label]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className="px-2.5 py-1 rounded-md font-bold border" style={view === k ? { background: COLOR, color: "#fff", borderColor: COLOR } : { color: "var(--vk-fg)", borderColor: "var(--vk-line)" }}>{label}</button>)}
        </div>)}
      {m.html && view === "formatted" ? <EmailHtml html={m.html} files={m.attachments} /> : <pre className="whitespace-pre-wrap break-words text-sm text-fg font-sans rounded-lg p-3" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>{m.text || "(no text)"}</pre>}
      <AttachmentList files={m.attachments} />

      {m.thread && m.thread.length > 0 && (
        <details className="rounded-lg border border-line text-xs">
          <summary className="cursor-pointer px-3 py-2 font-bold text-fg">Earlier in this conversation ({m.thread.length})</summary>
          <ul className="divide-y divide-line">{m.thread.map((t) => (
            <li key={t.id}><button type="button" onClick={() => onOpen(t.kind, t.id)} className="w-full text-left px-3 py-2 hover:bg-surface-2"><p className="flex justify-between gap-2"><span className="font-semibold text-fg truncate">{t.subject}</span><span className="text-fg-muted shrink-0">{when(t.at)}</span></p><p className="text-fg-muted truncate">{t.preview}</p></button></li>))}</ul>
        </details>)}

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
      <div className="flex flex-wrap items-center gap-2">
        <SendButton label="Send reply" color={COLOR} onBeforeSend={auto.stop} onSend={async () => { const r = await call(`/messages/${kind}/${id}/reply`, { method: "POST", body: { body, ...(att.ids.length ? { attachmentIds: att.ids } : {}) } }); if ("error" in r) return { error: r.error }; setBody(""); att.clear(); reload(); onChanged(); return { message: "Reply sent." }; }} />
        {m.status !== "closed" && <ActionButton label="Mark closed" color="#64748B" onRun={async () => { const r = await call(`/messages/${kind}/${id}/status`, { method: "POST", body: { status: "closed" } }); if ("error" in r) return { error: r.error }; reload(); onChanged(); return { message: "Closed." }; }} />}
        {m.status === "closed" && <ActionButton label="Reopen" color="#64748B" onRun={async () => { const r = await call(`/messages/${kind}/${id}/status`, { method: "POST", body: { status: "open" } }); if ("error" in r) return { error: r.error }; reload(); onChanged(); return { message: "Reopened." }; }} />}
        <span aria-live="polite" className="text-[11px] text-fg-muted">{auto.status === "saving" ? "Saving draft…" : auto.status === "saved" ? "Draft saved" : auto.status === "error" ? "Draft not saved" : ""}</span>
        <span className="ml-auto"><UndoSetting /></span>
      </div>
    </div>
  );
}

function Compose({ call, departments, initial, draft, onSent, onChanged }: { call: Call; departments: Dept[]; initial: string; draft?: Draft; onSent: () => void; onChanged: () => void }) {
  const [department, setDepartment] = useState(draft?.department ?? (departments.some((d) => d.key === initial) ? initial : departments[0]?.key ?? ""));
  const [to, setTo] = useState(draft?.to ?? ""); const [subject, setSubject] = useState(draft?.subject ?? ""); const [body, setBody] = useState(draft?.body ?? "");
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const att = useAttachments();
  const from = departments.find((d) => d.key === department);
  useEffect(() => { if (draft?.attachments?.length) att.set(draft.attachments); }, []);          // eslint-disable-line react-hooks/exhaustive-deps

  const auto = useAutosave(`${department}|${to}|${subject}|${body}|${att.ids.join(",")}`, async () => {
    const r = await call<{ id: string | null }>("/drafts", { method: "POST", body: { ...(draftId ? { id: draftId } : {}), department, to, subject, body, attachmentIds: att.ids } });
    if ("error" in r) return false;
    setDraftId(r.data.id); onChanged();
    return true;
  });
  return (
    <div className="space-y-3">
      <h2 className="text-base font-black text-fg">{draft ? "Draft" : "New email"}</h2>
      <label className="block"><span className="text-xs font-bold text-fg">From</span>
        <select aria-label="From" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls + " mt-1"}>{departments.map((d) => <option key={d.key} value={d.key}>{d.name} &lt;{d.address}&gt;</option>)}</select></label>
      <label className="block"><span className="text-xs font-bold text-fg">To</span><input aria-label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls + " mt-1"} placeholder="name@example.com" /></label>
      <label className="block"><span className="text-xs font-bold text-fg">Subject</span><input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls + " mt-1"} maxLength={200} /></label>
      <label className="block"><span className="text-xs font-bold text-fg">Message</span><textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={inputCls + " mt-1"} /></label>
      <AttachPicker att={att} />
      <div className="flex flex-wrap items-center gap-2">
        <SendButton label={`Send from ${from?.address ?? "department"}`} color={COLOR} onBeforeSend={auto.stop}
          onSend={async () => { const r = await call("/send", { method: "POST", body: { department, to, subject, body, ...(att.ids.length ? { attachmentIds: att.ids } : {}), ...(draftId ? { draftId } : {}) } }); if ("error" in r) return { error: r.error }; att.clear(); onSent(); return { message: "Email sent." }; }} />
        {draftId && <button type="button" onClick={async () => { auto.stop(); await call(`/drafts/${draftId}`, { method: "DELETE" }); onSent(); }} className="px-3 py-2 text-xs rounded-lg font-bold border border-line text-fg-muted hover:bg-surface-2">Discard draft</button>}
        <span aria-live="polite" className="text-[11px] text-fg-muted">{auto.status === "saving" ? "Saving draft…" : auto.status === "saved" ? "Draft saved" : auto.status === "error" ? "Draft not saved" : ""}</span>
        <span className="ml-auto"><UndoSetting /></span>
      </div>
    </div>
  );
}
