import { useEffect, useRef, useState } from "react";
import { Star, ShieldAlert, Trash2, Undo2, AlarmClock, CalendarClock } from "lucide-react";
import { useLoad, Status, ActionButton } from "./ui";
import { when } from "./ui";
import { AttachPicker, AttachmentList, useAttachments } from "./MailAttachments";
import { EmailHtml } from "./MailHtmlBody";
import { MailEditor, cleanHtml, isEmptyHtml, type EditorHandle } from "./MailEditor";
import { SendButton, UndoSetting, useAutosave } from "./MailSend";
import { LabelMenu, TimeMenu } from "./MailMenus";
import { TemplatePicker } from "./MailCompose";
import { COLOR, STATUS_LABEL, textToHtml, whenLong, type Call, type Detail, type Label } from "./mailShared";

const SMALL = "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border border-line text-fg hover:bg-surface-2";

export function Message({ call, kind, id, labels, onChanged, onMoved, onOpen, onLabelsChanged, onNotice }: {
  call: Call; kind: string; id: string; labels: Label[]; onChanged: () => void; onMoved: () => void; onOpen: (kind: "web" | "email", id: string) => void; onLabelsChanged: () => void; onNotice: (text: string) => void;
}) {
  const [load, reload] = useLoad<{ message: Detail }>(() => call(`/messages/${kind}/${id}`), [kind, id]);
  return <Status load={load}>{({ message: m }) => <MessageView key={m.id} call={call} kind={kind} id={id} m={m} labels={labels} reload={reload} onChanged={onChanged} onMoved={onMoved} onOpen={onOpen} onLabelsChanged={onLabelsChanged} onNotice={onNotice} />}</Status>;
}

function MessageView({ call, kind, id, m, labels, reload, onChanged, onMoved, onOpen, onLabelsChanged, onNotice }: {
  call: Call; kind: string; id: string; m: Detail; labels: Label[]; reload: () => void; onChanged: () => void; onMoved: () => void; onOpen: (kind: "web" | "email", id: string) => void; onLabelsChanged: () => void; onNotice: (text: string) => void;
}) {
  const [html, setHtml] = useState(m.draft ? (m.draft.bodyHtml ?? textToHtml(m.draft.body)) : "");
  const editor = useRef<EditorHandle>(null);
  const att = useAttachments();
  const [view, setView] = useState<"formatted" | "text">("formatted");
  const [spamPanel, setSpamPanel] = useState(false); const [block, setBlock] = useState(false);
  const [note, setNote] = useState("");
  const [applied, setApplied] = useState<Label[]>(m.labels ?? []);
  useEffect(() => { if (m.draft?.attachments?.length) att.set(m.draft.attachments); }, []);          // eslint-disable-line react-hooks/exhaustive-deps

  const auto = useAutosave(`${html}|${att.ids.join(",")}`, async () => {
    const r = await call("/drafts", { method: "POST", body: { department: m.department, replyKind: kind, replyId: id, bodyHtml: html, attachmentIds: att.ids } });
    return !("error" in r);
  });
  const act = async (path: string, body: unknown, after: () => void) => { setNote(""); const r = await call(`/messages/${kind}/${id}/${path}`, { method: "POST", body }); if ("error" in r) setNote(r.error); else after(); };
  const move = (folder: string, blockSender = false) => act("folder", { folder, ...(blockSender ? { blockSender: true } : {}) }, onMoved);
  const star = () => act("star", { starred: !m.starred }, () => { reload(); onChanged(); });
  const snooze = (at: Date | null) => act("snooze", { until: at ? at.toISOString() : null }, () => { if (at) onMoved(); else { reload(); onChanged(); } });
  const snoozed = m.snoozedUntil ? new Date(m.snoozedUntil) : null;
  const replyBody = () => ({ bodyHtml: html, ...(att.ids.length ? { attachmentIds: att.ids } : {}) });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-black text-fg">{m.subject}</h2>
        <p className="text-xs text-fg-muted">From <b className="text-fg">{m.fromName}</b> &lt;{m.fromEmail}&gt; · {when(m.at)}{m.ref ? ` · ${m.ref}` : ""} · {STATUS_LABEL[m.status] ?? m.status}{m.folder && m.folder !== "inbox" ? ` · in ${m.folder === "spam" ? "Spam" : "Trash"}` : ""}</p>
        {applied.length > 0 && <p className="mt-1.5 flex flex-wrap gap-1" aria-label="Labels on this message">{applied.map((l) => <span key={l.id} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: l.color }}>{l.name}</span>)}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Message actions">
        <button type="button" onClick={star} aria-label={m.starred ? "Remove star" : "Star"} aria-pressed={!!m.starred} className={SMALL}><Star className="w-3.5 h-3.5" fill={m.starred ? "#C9A84C" : "none"} stroke={m.starred ? "#C9A84C" : "currentColor"} /> {m.starred ? "Starred" : "Star"}</button>
        <LabelMenu call={call} department={m.department} kind={kind} id={id} labels={labels} applied={applied} onChange={(l) => { setApplied(l); onChanged(); }} onLabelsChanged={onLabelsChanged} buttonClass={SMALL} />
        {(m.folder === "inbox" || !m.folder) ? (
          <>
            <TimeMenu label="Snooze" title="Snooze until" maxDays={365} icon={<AlarmClock className="w-3.5 h-3.5" />} buttonClass={SMALL} onPick={(at) => snooze(at)} />
            <button type="button" onClick={() => setSpamPanel((v) => !v)} className={SMALL}><ShieldAlert className="w-3.5 h-3.5" /> Report spam</button>
            <button type="button" onClick={() => void move("trash")} className={SMALL}><Trash2 className="w-3.5 h-3.5" /> Move to trash</button>
          </>) : <button type="button" onClick={() => void move("inbox")} className={SMALL}><Undo2 className="w-3.5 h-3.5" /> {m.folder === "spam" ? "Not spam" : "Restore"}</button>}
        {m.folder === "spam" && <button type="button" onClick={() => void move("trash")} className={SMALL}><Trash2 className="w-3.5 h-3.5" /> Move to trash</button>}
      </div>
      {snoozed && snoozed.getTime() > Date.now() && (
        <p className="flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5" style={{ background: "#EFF6FF", color: "#1E3A8A", border: "1px solid #BFDBFE" }}>
          <AlarmClock className="w-3.5 h-3.5 shrink-0" /> Snoozed until {whenLong(snoozed)}. It comes back to the inbox then.
          <button type="button" onClick={() => void snooze(null)} className="ml-auto font-bold underline shrink-0">Bring it back now</button>
        </p>)}
      {m.folder === "spam" && m.spamReason && (
        <p className="flex items-start gap-2 text-xs rounded-md px-2.5 py-1.5" style={{ background: "#FFF7ED", color: "#7C2D12", border: "1px solid #FED7AA" }}><ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span><b>Why this is in Spam:</b> {m.spamReason}. If it is a real message, press Not spam.</span></p>)}
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
            {r.bodyHtml ? <div className="break-words text-fg [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline" dangerouslySetInnerHTML={{ __html: cleanHtml(r.bodyHtml) }} /> : <p className="whitespace-pre-wrap break-words text-fg">{r.body}</p>}
            <div className="mt-2"><AttachmentList files={r.attachments} label="Sent with this reply" /></div>
          </div>))}</div>)}

      <div>
        <div className="flex items-center justify-between gap-2 mb-1"><span className="text-xs font-bold text-fg">Your reply</span>
          <TemplatePicker call={call} department={m.department} onInsert={(t) => { if (isEmptyHtml(html)) editor.current?.setHtml(t.bodyHtml); else editor.current?.insertHtml(t.bodyHtml); }} /></div>
        <MailEditor ref={editor} value={html} onChange={setHtml} ariaLabel="Your reply" placeholder="Write your answer. It is sent from the department's address." minHeight={120} />
      </div>
      <AttachPicker att={att} />
      <p className="text-[11px] text-fg-muted">Your signature is added when it is sent. Change it under Settings.</p>
      <div className="flex flex-wrap items-center gap-2">
        <SendButton label="Send reply" color={COLOR} onBeforeSend={auto.stop} onSend={async () => { const r = await call(`/messages/${kind}/${id}/reply`, { method: "POST", body: replyBody() }); if ("error" in r) return { error: r.error }; setHtml(""); editor.current?.setHtml(""); att.clear(); reload(); onChanged(); return { message: "Reply sent." }; }} />
        <TimeMenu label="Schedule send" title="Send later" maxDays={6} icon={<CalendarClock className="w-3.5 h-3.5" />} buttonClass="inline-flex items-center gap-1 px-3 py-2 text-xs rounded-lg font-bold border border-line text-fg hover:bg-surface-2"
          onPick={async (at) => { const r = await call("/schedule", { method: "POST", body: { ...replyBody(), replyKind: kind, replyId: id, sendAt: at.toISOString() } }); if ("error" in r) { setNote(r.error); return; } auto.stop(); att.clear(); onNotice(`Reply scheduled to send ${whenLong(at)}.`); onMoved(); }} />
        {m.status !== "closed" && <ActionButton label="Mark closed" color="#64748B" onRun={async () => { const r = await call(`/messages/${kind}/${id}/status`, { method: "POST", body: { status: "closed" } }); if ("error" in r) return { error: r.error }; reload(); onChanged(); return { message: "Closed." }; }} />}
        {m.status === "closed" && <ActionButton label="Reopen" color="#64748B" onRun={async () => { const r = await call(`/messages/${kind}/${id}/status`, { method: "POST", body: { status: "open" } }); if ("error" in r) return { error: r.error }; reload(); onChanged(); return { message: "Reopened." }; }} />}
        <span aria-live="polite" className="text-[11px] text-fg-muted">{auto.status === "saving" ? "Saving draft…" : auto.status === "saved" ? "Draft saved" : auto.status === "error" ? "Draft not saved" : ""}</span>
        <span className="ml-auto"><UndoSetting /></span>
      </div>
    </div>
  );
}
