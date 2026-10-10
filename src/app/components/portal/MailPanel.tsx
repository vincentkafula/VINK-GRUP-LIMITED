import { useEffect, useRef, useState } from "react";
import { Mail, Send, Inbox, PenSquare, Star, FileText, ShieldAlert, Trash2, Search, AlarmClock, CalendarClock, Settings, X, RefreshCw, MoreVertical, HelpCircle, ChevronLeft, ChevronRight, ArrowLeft, Plus, Undo2, CircleCheck } from "lucide-react";
import { useLoad, Status, Empty, inputCls } from "./ui";
import { getSession } from "../../services/apiClient";
import { Message } from "./MailMessage";
import { Compose } from "./MailCompose";
import { MailSettings } from "./MailSettings";
import { MailRow } from "./MailList";
import { COLOR, NAVY, NAVY_ACTIVE, STATUS_LABEL, avatarColor, initialOf, mailClient, notifyIfMore, whenLong, type Box, type Dept, type Draft, type Item, type Label, type Scheduled } from "./mailShared";

/**
 * Department mail, laid out like a webmail: a dark sidebar (Compose, the boxes with their counts, the labels), a search bar across the top, and a list of messages
 * with tick boxes, stars and round sender initials. An owner or superadmin sees every department; a department manager sees only the department(s) they have been
 * approved to manage. Boxes: Inbox, Starred, Snoozed, Sent, Drafts, Scheduled, Spam, Trash. A reply goes out from the department's own address.
 */
const BOXES: { key: Box; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox }, { key: "starred", label: "Starred", icon: Star }, { key: "snoozed", label: "Snoozed", icon: AlarmClock }, { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: FileText }, { key: "scheduled", label: "Scheduled", icon: CalendarClock }, { key: "spam", label: "Spam", icon: ShieldAlert }, { key: "trash", label: "Trash", icon: Trash2 },
];
const EMPTY: Record<Box, string> = { inbox: "No messages here.", starred: "No starred messages. Star a message to find it here.", snoozed: "Nothing is snoozed. Snooze a message to hide it until you want it back.", drafts: "No drafts. An email you start writing is saved here as you type.", scheduled: "Nothing is waiting to be sent. Use Schedule send to write now and send later.", sent: "Nothing sent from this department yet.", spam: "Nothing in Spam.", trash: "Trash is empty." };
const SEARCH_TIPS = ["from:pam", "to:sales", "subject:invoice", "label:urgent", "has:attachment", "is:starred", "is:open", "after:2026-10-01", "before:2026-10-31", "\"exact words\"", "-leaveout"];
const PAGE = 25;

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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
  const [help, setHelp] = useState(false); const [more, setMore] = useState(false);
  const [addingLabel, setAddingLabel] = useState(false); const [labelName, setLabelName] = useState("");
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
  const goBox = (b: Box) => { setBox(b); setSelected(null); setComposing(null); setSettings(false); setChecked({}); setPage(0); };
  useEffect(() => { setPage(0); setChecked({}); }, [dept, applied, label, status]);
  const back = () => { setSelected(null); setComposing(null); refresh(); };
  const me = getSession();

  const tickedKeys = Object.keys(checked).filter((k) => checked[k]);
  const bulk = async (path: string, body: unknown) => {
    let failed = "";
    for (const k of tickedKeys) { const [kind, id] = k.split(":"); const r = await call(`/messages/${kind}/${id}/${path}`, { method: "POST", body }); if ("error" in r) failed = r.error; }
    setChecked({}); if (failed) setNotice(failed); refresh();
  };
  const star = async (m: Item) => { const r = await call(`/messages/${m.kind}/${m.id}/star`, { method: "POST", body: { starred: !m.starred } }); if ("error" in r) setNotice(r.error); reloadMsgs(); };
  const makeLabel = async () => { if (!labelName.trim()) return; const r = await call("/labels", { method: "POST", body: { department: dept, name: labelName } }); if ("error" in r) { setNotice(r.error); return; } setLabelName(""); setAddingLabel(false); reloadLabels(); };

  const tool = "inline-flex items-center justify-center rounded-full p-2 text-[#4A5A78] hover:bg-[#E8EEF9]";
  const bulkBtn = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[#1B2A44] hover:bg-[#E8EEF9]";

  return (
    <Status load={depts}>{({ departments }) => departments.length === 0
      ? <Empty>You do not manage any department mailbox yet. Apply for a department under "Apply for a Section"; a Super Administrator will review it.</Empty>
      : (() => {
        const cur = departments.find((d) => d.key === dept);
        const realDepts = departments.filter((d) => d.key !== "unrouted");
        const messages = msgs.state === "ready" ? msgs.data.messages ?? [] : [];
        const shown = messages.slice(page * PAGE, page * PAGE + PAGE);
        const total = box === "drafts" ? (drafts.state === "ready" ? (drafts.data.drafts ?? []).length : 0) : box === "scheduled" ? (scheduled.state === "ready" ? (scheduled.data.scheduled ?? []).length : 0) : messages.length;
        const first = total === 0 ? 0 : page * PAGE + 1, last = Math.min(total, page * PAGE + PAGE);
        const inList = !settings && !composing && !(selected && box !== "sent");
        return (
          <div className="overflow-hidden rounded-3xl border border-[#DCE3F0] bg-white shadow-[0_10px_40px_-18px_rgba(15,42,82,0.35)] lg:flex lg:min-h-[680px]">
            {/* ── Sidebar ─────────────────────────────────────────────────── */}
            <aside aria-label="Mailbox" className="flex shrink-0 flex-col gap-4 p-4 text-white lg:w-72" style={{ background: NAVY }}>
              <div className="flex items-center gap-3 px-1"><Mail className="h-9 w-9" strokeWidth={1.6} /><span className="text-2xl font-semibold tracking-tight">Mail</span></div>
              <button type="button" aria-label="New email" onClick={() => { setComposing({ key: Date.now() }); setSelected(null); setSettings(false); }} className="inline-flex w-fit items-center gap-3 rounded-full px-7 py-3 text-base font-semibold text-white shadow-lg hover:brightness-110" style={{ background: COLOR }}><PenSquare className="h-5 w-5" /> Compose</button>

              <div role="tablist" aria-label="Departments" className="flex flex-wrap gap-1.5">
                {departments.map((d) => (
                  <button key={d.key} role="tab" aria-selected={dept === d.key} onClick={() => { setDept(d.key); setSelected(null); setComposing(null); setLabel(""); }} className="rounded-full px-3 py-1 text-xs font-semibold" style={dept === d.key ? { background: "#fff", color: NAVY } : { background: "rgba(255,255,255,0.12)", color: "#fff" }}>
                    {d.name}{d.open > 0 && <span className="ml-1.5 rounded-full px-1.5 text-[10px]" style={{ background: dept === d.key ? "#E3ECFF" : "rgba(255,255,255,0.22)", color: dept === d.key ? NAVY : "#fff" }}>{d.open}</span>}
                  </button>))}
              </div>
              {dept && dept !== "unrouted" && cur && <p className="flex items-center gap-1.5 px-1 text-[11px] text-white/70"><Mail className="h-3.5 w-3.5" /> {cur.address}</p>}

              <nav role="tablist" aria-label="Boxes" aria-orientation="vertical" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
                {BOXES.map(({ key, label: text, icon: Icon }) => {
                  const n = key === "inbox" ? cur?.open : key === "drafts" ? cur?.drafts : key === "scheduled" ? cur?.scheduled : 0;
                  const on = box === key && !settings;
                  return (
                    <button key={key} role="tab" aria-selected={on} onClick={() => goBox(key)} className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-white/10 lg:gap-4 lg:rounded-l-xl lg:rounded-r-full lg:px-4 lg:py-2.5 lg:text-[15px]" style={on ? { background: NAVY_ACTIVE } : undefined}>
                      <Icon className="h-5 w-5 shrink-0 opacity-90" fill={key === "starred" ? "currentColor" : "none"} /> <span className="flex-1">{text}</span>
                      {n ? <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: key === "inbox" ? COLOR : "transparent", color: "#fff" }}>{n}</span> : null}
                    </button>);
                })}
              </nav>

              <div className="mt-1 border-t border-white/15 pt-3">
                <div className="flex items-center justify-between px-1"><span className="text-lg font-medium">Labels</span>
                  <button type="button" aria-label="New label" aria-expanded={addingLabel} onClick={() => setAddingLabel((v) => !v)} className="rounded-full p-1 hover:bg-white/10"><Plus className="h-5 w-5" /></button></div>
                {addingLabel && (
                  <form onSubmit={(e) => { e.preventDefault(); void makeLabel(); }} className="mt-2 flex gap-1.5">
                    <input aria-label="Label name" value={labelName} onChange={(e) => setLabelName(e.target.value)} maxLength={40} placeholder="Label name" className="min-w-0 flex-1 rounded-lg border-0 bg-white/15 px-3 py-1.5 text-sm text-white placeholder-white/50 outline-none focus:bg-white/25" />
                    <button type="submit" className="rounded-lg px-3 text-sm font-semibold text-white" style={{ background: COLOR }}>Add</button>
                  </form>)}
                <div role="group" aria-label="Filter by label" className="mt-2 flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
                  {labels.length === 0 && !addingLabel && <p className="px-3 py-1 text-xs text-white/60">No labels yet.</p>}
                  {labels.map((l) => (
                    <button key={l.id} type="button" aria-pressed={label === l.id} onClick={() => { setLabel(label === l.id ? "" : l.id); setSelected(null); setComposing(null); setSettings(false); if (!own) setBox("inbox"); }} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-left text-sm hover:bg-white/10 lg:gap-4 lg:rounded-l-xl lg:rounded-r-full lg:py-2 lg:text-[15px]" style={label === l.id ? { background: NAVY_ACTIVE } : undefined}>
                      <span className="h-5 w-5 shrink-0 rounded-md" style={{ background: l.color }} /> {l.name}
                    </button>))}
                </div>
              </div>
            </aside>

            {/* ── Main ────────────────────────────────────────────────────── */}
            <main className="min-w-0 flex-1 bg-white">
              <div className="flex items-center gap-3 border-b border-[#EEF1F6] px-4 py-3">
                <form role="search" onSubmit={(e) => { e.preventDefault(); setApplied(q); setSelected(null); setComposing(null); setSettings(false); }} className="flex flex-1 items-center gap-2">
                  <label className="relative flex-1"><span className="sr-only">Search mail</span>
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#5B6B88]" />
                    <input aria-label="Search mail" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value === "") setApplied(""); }} placeholder="Search in mail…" className="w-full rounded-full border-0 bg-[#EAF0FB] py-3 pl-12 pr-4 text-[15px] text-[#1B2A44] placeholder-[#5B6B88] outline-none focus:bg-white focus:ring-2 focus:ring-[#2F6BFF]/40" /></label>
                  <button type="submit" className="rounded-full px-4 py-2.5 text-sm font-semibold text-white" style={{ background: COLOR }}>Search</button>
                  {searching && <button type="button" onClick={() => { setQ(""); setApplied(""); }} className="rounded-full px-3 py-2.5 text-sm font-semibold text-[#4A5A78] hover:bg-[#E8EEF9]">Clear</button>}
                </form>
                <button type="button" aria-label="Search help" aria-expanded={help} onClick={() => setHelp((v) => !v)} className={tool}><HelpCircle className="h-6 w-6" /></button>
                <button type="button" aria-label="Mail settings" aria-pressed={settings} onClick={() => { setSettings((v) => !v); setSelected(null); setComposing(null); }} className={tool}><Settings className="h-6 w-6" /></button>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: avatarColor(me?.name ?? me?.username ?? "You") }} title={me?.name ?? me?.username ?? "You"} aria-label="Your account">{initialOf(me?.name ?? me?.username ?? "You")}</span>
              </div>
              {help && <div role="note" className="border-b border-[#EEF1F6] bg-[#F6F8FC] px-5 py-3 text-xs text-[#4A5A78]"><p className="font-semibold text-[#1B2A44]">Search all mail with:</p><p className="mt-1 flex flex-wrap gap-1.5">{SEARCH_TIPS.map((t) => <code key={t} className="rounded bg-white px-1.5 py-0.5 text-[#1B2A44] ring-1 ring-[#DCE3F0]">{t}</code>)}</p></div>}
              {notice && <p role="status" className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}><CircleCheck className="h-4 w-4 shrink-0" />{notice}<button type="button" aria-label="Dismiss" onClick={() => setNotice("")} className="ml-auto"><X className="h-4 w-4" /></button></p>}
              {searching && inList && <p className="px-5 pt-3 text-xs text-[#5B6B88]">Searching {box === "spam" || box === "trash" || box === "sent" ? BOXES.find((b) => b.key === box)!.label : "all mail"} for: {applied}</p>}

              {settings ? <div className="p-5"><MailSettings call={call} departments={realDepts} initial={dept} onChanged={reloadLabels} /></div>
                : composing ? (
                  <section aria-label="Message" className="p-5">
                    <button type="button" onClick={back} aria-label="Back to the list" className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-[#4A5A78] hover:bg-[#E8EEF9]"><ArrowLeft className="h-4 w-4" /> Back</button>
                    <Compose key={composing.key} call={call} departments={realDepts.length ? realDepts : departments} initial={dept} draft={composing.draft} onSent={(text) => { setComposing(null); if (text) setNotice(text); refresh(); }} onChanged={refresh} />
                  </section>)
                : selected && box !== "sent" ? (
                  <section aria-label="Message" className="p-5">
                    <button type="button" onClick={back} aria-label="Back to the list" className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-[#4A5A78] hover:bg-[#E8EEF9]"><ArrowLeft className="h-4 w-4" /> Back</button>
                    <Message key={selected.id} call={call} kind={selected.kind} id={selected.id} labels={labels} onChanged={refresh} onMoved={() => { setSelected(null); refresh(); }} onOpen={(k, i) => setSelected({ kind: k, id: i })} onLabelsChanged={reloadLabels} onNotice={setNotice} />
                  </section>)
                : (
                  <section aria-label="Messages">
                    {/* toolbar: tick box, refresh, more … and the page counter */}
                    <div className="flex items-center gap-1 border-b border-[#EEF1F6] px-4 py-2">
                      {own && <input type="checkbox" aria-label="Select all" checked={shown.length > 0 && shown.every((m) => checked[`${m.kind}:${m.id}`])} onChange={(e) => setChecked(e.target.checked ? Object.fromEntries(shown.map((m) => [`${m.kind}:${m.id}`, true])) : {})} className="mr-2 h-4 w-4 rounded accent-[#2F6BFF]" />}
                      {tickedKeys.length > 0 ? (
                        <>
                          <span className="mr-2 text-sm font-semibold text-[#1B2A44]">{tickedKeys.length} selected</span>
                          {(box === "spam" || box === "trash") ? <button type="button" onClick={() => void bulk("folder", { folder: "inbox" })} className={bulkBtn}><Undo2 className="h-4 w-4" /> {box === "spam" ? "Not spam" : "Restore"}</button>
                            : <><button type="button" onClick={() => void bulk("folder", { folder: "spam" })} className={bulkBtn}><ShieldAlert className="h-4 w-4" /> Report spam</button>
                              <button type="button" onClick={() => void bulk("star", { starred: true })} className={bulkBtn}><Star className="h-4 w-4" /> Star</button>
                              <button type="button" onClick={() => void bulk("status", { status: "closed" })} className={bulkBtn}><CircleCheck className="h-4 w-4" /> Mark closed</button></>}
                          {box !== "trash" && <button type="button" onClick={() => void bulk("folder", { folder: "trash" })} className={bulkBtn}><Trash2 className="h-4 w-4" /> Delete</button>}
                        </>
                      ) : (
                        <>
                          <button type="button" aria-label="Refresh" onClick={refresh} className={tool}><RefreshCw className="h-[18px] w-[18px]" /></button>
                          <span className="relative">
                            <button type="button" aria-label="More" aria-expanded={more} onClick={() => setMore((v) => !v)} className={tool}><MoreVertical className="h-[18px] w-[18px]" /></button>
                            {more && <div role="menu" className="absolute left-0 z-20 mt-1 w-44 rounded-xl border border-[#DCE3F0] bg-white py-1 text-sm shadow-lg">
                              <button role="menuitem" type="button" onClick={() => { setMore(false); setChecked(Object.fromEntries(shown.map((m) => [`${m.kind}:${m.id}`, true]))); }} className="block w-full px-4 py-2 text-left hover:bg-[#F1F5FD]">Select all</button>
                              <button role="menuitem" type="button" onClick={() => { setMore(false); setSettings(true); }} className="block w-full px-4 py-2 text-left hover:bg-[#F1F5FD]">Mail settings</button>
                            </div>}
                          </span>
                        </>)}
                      <span className="ml-auto flex items-center gap-1">
                        {box === "inbox" && !searching && (
                          <select aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls + " !w-auto !rounded-full !py-1 !text-xs"}>
                            <option value="open">Open</option><option value="answered">Answered</option><option value="closed">Closed</option><option value="">All</option>
                          </select>)}
                        <span className="px-2 text-sm text-[#4A5A78] tabular-nums">{first}–{last} of {total}</span>
                        <button type="button" aria-label="Newer" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={tool + " disabled:opacity-30"}><ChevronLeft className="h-5 w-5" /></button>
                        <button type="button" aria-label="Older" disabled={last >= total} onClick={() => setPage((p) => p + 1)} className={tool + " disabled:opacity-30"}><ChevronRight className="h-5 w-5" /></button>
                      </span>
                    </div>

                    {box === "drafts"
                      ? <Status load={drafts}>{({ drafts: ds0 }) => { const ds = ds0 ?? []; return ds.length === 0 ? <div className="p-6"><Empty>{EMPTY.drafts}</Empty></div> : (
                        <ul className="max-h-[68vh] overflow-y-auto">{ds.slice(page * PAGE, page * PAGE + PAGE).map((d) => (
                          <MailRow key={d.id} name={d.replyId ? "Reply draft" : d.to || "(no recipient)"} subject={d.subject || "(no subject)"} preview={d.body.slice(0, 140)} at={d.updatedAt} openLabel={`Open draft: ${d.subject || "(no subject)"}`}
                            onOpen={() => { if (d.replyKind && d.replyId) { setBox("inbox"); setStatus(""); setSelected({ kind: d.replyKind, id: d.replyId }); setComposing(null); } else { setComposing({ key: Date.now(), draft: d }); setSelected(null); } }} />))}</ul>); }}</Status>
                      : box === "scheduled"
                      ? <Status load={scheduled}>{({ scheduled: ss0 }) => { const ss = ss0 ?? []; return ss.length === 0 ? <div className="p-6"><Empty>{EMPTY.scheduled}</Empty></div> : (
                        <ul className="max-h-[68vh] overflow-y-auto">{ss.slice(page * PAGE, page * PAGE + PAGE).map((s) => (
                          <MailRow key={s.id} name={`To ${s.to}`} subject={s.subject} preview={s.status === "failed" ? `Not sent: ${s.error ?? "it could not be sent"}` : s.status === "sending" ? "Sending now" : `Waiting to be sent · written by ${s.by}`} at={s.sendAt}
                            note={<span>{whenLong(new Date(s.sendAt))}</span>}
                            actions={s.status !== "sending" ? <button type="button" aria-label={`Cancel the email to ${s.to}`} onClick={async () => { await call(`/scheduled/${s.id}`, { method: "DELETE" }); refresh(); }} className="rounded-full px-3 py-1 text-xs font-semibold text-[#1B2A44] ring-1 ring-[#DCE3F0] hover:bg-[#E8EEF9]">{s.status === "failed" ? "Remove" : "Cancel"}</button> : undefined} />))}</ul>); }}</Status>
                      : <Status load={msgs}>{({ messages: ms }) => { const all = ms ?? []; const rows = all.slice(page * PAGE, page * PAGE + PAGE); return all.length === 0 ? <div className="p-6"><Empty>{searching || label ? "Nothing matches." : EMPTY[box]}</Empty></div> : (
                        <ul className="max-h-[68vh] overflow-y-auto">{rows.map((m) => (
                          <MailRow key={`${m.kind}-${m.id}`} name={box === "sent" ? `To ${m.fromEmail}` : m.fromName} subject={m.subject} preview={m.preview} at={m.at} unread={m.status === "open" && box !== "sent"} starred={!!m.starred} labels={m.labels}
                            checked={!!checked[`${m.kind}:${m.id}`]} onCheck={box === "sent" ? undefined : (on) => setChecked((c) => ({ ...c, [`${m.kind}:${m.id}`]: on }))} onStar={box === "sent" ? undefined : () => void star(m)}
                            onOpen={box === "sent" ? undefined : () => { setSelected({ kind: m.kind, id: m.id }); setComposing(null); }}
                            note={[STATUS_LABEL[m.status] && m.status !== "open" ? STATUS_LABEL[m.status] : "", m.kind === "web" && box !== "sent" ? "from the website" : "", box === "snoozed" && m.snoozedUntil ? `back ${whenLong(new Date(m.snoozedUntil))}` : "", box === "spam" && m.spamReason ? m.spamReason : ""].filter(Boolean).join(" · ") || undefined} />))}</ul>); }}</Status>}
                  </section>)}
            </main>
          </div>);
      })()}</Status>
  );
}
