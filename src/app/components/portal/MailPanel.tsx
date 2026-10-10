import { useEffect, useRef, useState } from "react";
import { Mail, Send, Inbox, PenSquare, Star, FileText, ShieldAlert, Trash2, Search, AlarmClock, CalendarClock, Settings, X } from "lucide-react";
import { useLoad, Status, Empty, inputCls, when } from "./ui";
import { Message } from "./MailMessage";
import { Compose } from "./MailCompose";
import { MailSettings } from "./MailSettings";
import { COLOR, STATUS_LABEL, mailClient, notifyIfMore, whenLong, type Box, type Dept, type Draft, type Item, type Label, type Scheduled } from "./mailShared";

/**
 * Department mail for the management panel. An owner or superadmin sees every department; a department manager sees only the department(s) they have been
 * approved to manage. Boxes: Inbox, Starred, Snoozed, Drafts, Scheduled, Sent, Spam, Trash, a search over all of it, and Settings (signature, templates, labels,
 * filters, out-of-office reply, notifications). A reply goes out from the department's own address.
 */
const BOXES: { key: Box; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox }, { key: "starred", label: "Starred", icon: Star }, { key: "snoozed", label: "Snoozed", icon: AlarmClock }, { key: "drafts", label: "Drafts", icon: FileText },
  { key: "scheduled", label: "Scheduled", icon: CalendarClock }, { key: "sent", label: "Sent", icon: Send }, { key: "spam", label: "Spam", icon: ShieldAlert }, { key: "trash", label: "Trash", icon: Trash2 },
];
const EMPTY: Record<Box, string> = { inbox: "No messages here.", starred: "No starred messages. Star a message to find it here.", snoozed: "Nothing is snoozed. Snooze a message to hide it until you want it back.", drafts: "No drafts. An email you start writing is saved here as you type.", scheduled: "Nothing is waiting to be sent. Use Schedule send to write now and send later.", sent: "Nothing sent from this department yet.", spam: "Nothing in Spam.", trash: "Trash is empty." };
const SEARCH_HELP = 'Search all mail. Try: from:pam   subject:invoice   label:urgent   has:attachment   is:starred   after:2026-10-01   "exact words"   -leaveout';

export function MailPanel() {
  const call = mailClient();
  const [depts, reloadDepts] = useLoad<{ departments: Dept[] }>(() => call("/departments"));
  const [dept, setDept] = useState<string>("");
  const [box, setBox] = useState<Box>("inbox");
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState(""); const [applied, setApplied] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<{ kind: string; id: string } | null>(null);
  const [composing, setComposing] = useState<{ key: number; draft?: Draft } | null>(null);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState("");
  const list = depts.state === "ready" ? depts.data.departments : [];
  useEffect(() => { if (!dept && list.length) setDept(list[0].key); }, [list.length]);          // eslint-disable-line react-hooks/exhaustive-deps

  // New mail: look again every minute, and tell the person (if they asked to be told) when more messages are waiting than before.
  const lastTotal = useRef<number | null>(null);
  useEffect(() => { const t = setInterval(() => reloadDepts(), 60_000); return () => clearInterval(t); }, []);          // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (depts.state !== "ready") return; const total = depts.data.departments.reduce((n, d) => n + d.open, 0); notifyIfMore(lastTotal.current, total); lastTotal.current = total; }, [depts]);

  const searching = applied.trim() !== "";
  const listBox = searching && (box === "inbox" || box === "starred") ? "all" : box === "drafts" || box === "scheduled" ? "inbox" : box;
  const own = box !== "drafts" && box !== "scheduled";
  const [msgs, reloadMsgs] = useLoad<{ messages: Item[] }>(() => (dept && own ? call(`/messages?department=${encodeURIComponent(dept)}&box=${listBox}${box === "inbox" && !searching && status ? `&status=${status}` : ""}${searching ? `&q=${encodeURIComponent(applied)}` : ""}${label ? `&label=${label}` : ""}`) : Promise.resolve({ data: { messages: [] } })), [dept, box, status, applied, label]);
  const [drafts, reloadDrafts] = useLoad<{ drafts: Draft[] }>(() => (dept && box === "drafts" ? call(`/drafts?department=${encodeURIComponent(dept)}`) : Promise.resolve({ data: { drafts: [] } })), [dept, box]);
  const [scheduled, reloadScheduled] = useLoad<{ scheduled: Scheduled[] }>(() => (dept && box === "scheduled" ? call(`/scheduled?department=${encodeURIComponent(dept)}`) : Promise.resolve({ data: { scheduled: [] } })), [dept, box]);
  const [labelsLoad, reloadLabels] = useLoad<{ labels: Label[] }>(() => (dept && dept !== "unrouted" ? call(`/labels?department=${encodeURIComponent(dept)}`) : Promise.resolve({ data: { labels: [] } })), [dept]);
  const labels = labelsLoad.state === "ready" ? labelsLoad.data.labels ?? [] : [];
  const refresh = () => { reloadMsgs(); reloadDepts(); reloadDrafts(); reloadScheduled(); };
  const goBox = (b: Box) => { setBox(b); setSelected(null); setComposing(null); setSettings(false); };
  const realDepts = list.filter((d) => d.key !== "unrouted");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-fg">Department mail</h1>
          <p className="text-fg-muted text-sm">Messages sent to your department's address and from the website. Replies go out from the department's own address.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setSettings((v) => !v); setSelected(null); setComposing(null); }} aria-pressed={settings} aria-label="Mail settings" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border border-line text-fg hover:bg-surface-2"><Settings className="w-4 h-4" /> Settings</button>
          <button onClick={() => { setComposing({ key: Date.now() }); setSelected(null); setSettings(false); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLOR }}><PenSquare className="w-4 h-4" /> New email</button>
        </div>
      </div>
      {notice && <p role="status" className="flex items-center gap-2 text-sm rounded-lg px-3 py-2" style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>{notice}<button type="button" aria-label="Dismiss" onClick={() => setNotice("")} className="ml-auto"><X className="w-4 h-4" /></button></p>}

      <Status load={depts}>{({ departments }) => departments.length === 0
        ? <Empty>You do not manage any department mailbox yet. Apply for a department under "Apply for a Section"; a Super Administrator will review it.</Empty>
        : settings ? <MailSettings call={call} departments={departments.filter((d) => d.key !== "unrouted")} initial={dept} onChanged={reloadLabels} />
        : (
          <>
            <div role="tablist" aria-label="Departments" className="flex gap-2 flex-wrap">
              {departments.map((d) => (
                <button key={d.key} role="tab" aria-selected={dept === d.key} onClick={() => { setDept(d.key); setSelected(null); setComposing(null); setLabel(""); }}
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
            {labels.length > 0 && own && (
              <div role="group" aria-label="Filter by label" className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-fg-muted">Labels:</span>
                {labels.map((l) => <button key={l.id} type="button" aria-pressed={label === l.id} onClick={() => setLabel(label === l.id ? "" : l.id)} className="rounded-full px-2 py-0.5 font-bold border" style={label === l.id ? { background: l.color, color: "#fff", borderColor: l.color } : { color: l.color, borderColor: l.color }}>{l.name}</button>)}
              </div>)}

            <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
              <section aria-label="Messages" className="rounded-xl border border-line bg-surface overflow-hidden">
                <div role="tablist" aria-label="Boxes" className="flex items-center gap-1 p-2 border-b border-line text-xs flex-wrap">
                  {BOXES.map(({ key, label: text, icon: Icon }) => {
                    const cur = departments.find((d) => d.key === dept);
                    const n = key === "inbox" ? cur?.open : key === "drafts" ? cur?.drafts : key === "scheduled" ? cur?.scheduled : 0;
                    return (
                      <button key={key} role="tab" aria-selected={box === key} onClick={() => goBox(key)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-bold" style={box === key ? { background: COLOR, color: "#fff" } : { color: "var(--vk-fg)" }}>
                        <Icon className="w-3.5 h-3.5" /> {text}{n ? <span className="text-[10px] opacity-80">({n})</span> : null}
                      </button>);
                  })}
                  {box === "inbox" && !searching && (
                    <select aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls + " !w-auto !py-1 ml-auto"}>
                      <option value="open">Open</option><option value="answered">Answered</option><option value="closed">Closed</option><option value="">All</option>
                    </select>)}
                </div>
                {box === "drafts"
                  ? <Status load={drafts}>{({ drafts: ds0 }) => { const ds = ds0 ?? []; return ds.length === 0 ? <div className="p-4"><Empty>{EMPTY.drafts}</Empty></div> : (
                    <ul className="divide-y divide-line max-h-[60vh] overflow-y-auto">{ds.map((d) => (
                      <li key={d.id}>
                        <button onClick={() => { if (d.replyKind && d.replyId) { setBox("inbox"); setStatus(""); setSelected({ kind: d.replyKind, id: d.replyId }); setComposing(null); } else { setComposing({ key: Date.now(), draft: d }); setSelected(null); } }} className="w-full text-left p-3 hover:bg-surface-2">
                          <p className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold text-fg truncate">{d.replyId ? "Reply draft" : d.to || "(no recipient)"}</span><span className="text-[11px] text-fg-muted shrink-0">{when(d.updatedAt)}</span></p>
                          <p className="text-xs text-fg truncate">{d.subject || "(no subject)"}</p>
                          <p className="text-[11px] text-fg-muted truncate">{d.body.slice(0, 120)}</p>
                        </button>
                      </li>))}</ul>); }}</Status>
                  : box === "scheduled"
                  ? <Status load={scheduled}>{({ scheduled: ss0 }) => { const ss = ss0 ?? []; return ss.length === 0 ? <div className="p-4"><Empty>{EMPTY.scheduled}</Empty></div> : (
                    <ul className="divide-y divide-line max-h-[60vh] overflow-y-auto">{ss.map((s) => (
                      <li key={s.id} className="p-3 text-sm">
                        <p className="flex items-center justify-between gap-2"><span className="font-semibold text-fg truncate">To {s.to}</span><span className="text-[11px] text-fg-muted shrink-0">{whenLong(new Date(s.sendAt))}</span></p>
                        <p className="text-xs text-fg truncate">{s.subject}</p>
                        <p className="text-[11px] text-fg-muted truncate">{s.preview}</p>
                        <p className="mt-1 flex items-center gap-2 text-[10px] font-bold" style={{ color: s.status === "failed" ? "#DC2626" : "#B45309" }}>{s.status === "failed" ? `Not sent: ${s.error ?? "it could not be sent"}` : s.status === "sending" ? "Sending now" : `Waiting to be sent · written by ${s.by}`}
                          {s.status !== "sending" && <button type="button" aria-label={`Cancel the email to ${s.to}`} onClick={async () => { await call(`/scheduled/${s.id}`, { method: "DELETE" }); refresh(); }} className="ml-auto underline text-fg">{s.status === "failed" ? "Remove" : "Cancel"}</button>}</p>
                      </li>))}</ul>); }}</Status>
                  : <Status load={msgs}>{({ messages: ms }) => { const messages = ms ?? []; return messages.length === 0 ? <div className="p-4"><Empty>{searching || label ? "Nothing matches." : EMPTY[box]}</Empty></div> : (
                    <ul className="divide-y divide-line max-h-[60vh] overflow-y-auto">{messages.map((m) => (
                      <li key={`${m.kind}-${m.id}`}>
                        <button onClick={() => { setSelected({ kind: m.kind, id: m.id }); setComposing(null); }} className="w-full text-left p-3 hover:bg-surface-2" style={selected?.id === m.id ? { background: "var(--vk-surface-2, #f5f5f5)" } : undefined}>
                          <p className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold text-fg truncate">{m.starred && <Star className="w-3 h-3 inline mr-1 -mt-0.5" fill="#C9A84C" stroke="#C9A84C" aria-label="Starred" />}{m.fromName}</span><span className="text-[11px] text-fg-muted shrink-0">{when(m.at)}</span></p>
                          <p className="text-xs text-fg truncate">{m.subject}</p>
                          <p className="text-[11px] text-fg-muted truncate">{m.preview}</p>
                          {m.labels && m.labels.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{m.labels.map((l) => <span key={l.id} className="rounded-full px-1.5 py-px text-[9px] font-bold text-white" style={{ background: l.color }}>{l.name}</span>)}</span>}
                          <p className="text-[10px] mt-1 font-bold" style={{ color: m.status === "open" ? "#B45309" : m.status === "failed" ? "#DC2626" : "#047857" }}>{STATUS_LABEL[m.status] ?? m.status}{m.kind === "web" && box !== "sent" ? " · from the website" : ""}{box === "snoozed" && m.snoozedUntil ? ` · back ${whenLong(new Date(m.snoozedUntil))}` : ""}{box === "spam" && m.spamReason ? ` · ${m.spamReason}` : ""}</p>
                        </button>
                      </li>))}</ul>); }}</Status>}
              </section>

              <section aria-label="Message" className="rounded-xl border border-line bg-surface p-4 min-h-[16rem]">
                {composing ? <Compose key={composing.key} call={call} departments={realDepts.length ? realDepts : departments.filter((d) => d.key !== "unrouted")} initial={dept} draft={composing.draft} onSent={(text) => { setComposing(null); if (text) setNotice(text); refresh(); }} onChanged={refresh} />
                  : selected && box !== "sent" ? <Message key={selected.id} call={call} kind={selected.kind} id={selected.id} labels={labels} onChanged={refresh} onMoved={() => { setSelected(null); refresh(); }} onOpen={(k, i) => setSelected({ kind: k, id: i })} onLabelsChanged={reloadLabels} onNotice={setNotice} />
                  : <Empty>{box === "sent" ? "Choose a message in the inbox to read it and answer it." : "Choose a message to read it, answer it, or write a new email."}</Empty>}
              </section>
            </div>
          </>)}</Status>
    </div>
  );
}
