import { useEffect, useRef, useState } from "react";
import { CalendarClock, FileText } from "lucide-react";
import { useLoad, inputCls } from "./ui";
import { AttachPicker, useAttachments } from "./MailAttachments";
import { MailEditor, isEmptyHtml, type EditorHandle } from "./MailEditor";
import { SendButton, UndoSetting, useAutosave } from "./MailSend";
import { TimeMenu } from "./MailMenus";
import { COLOR, textToHtml, whenLong, type Call, type Dept, type Draft, type Template } from "./mailShared";

/** "Insert template": the department's ready-made replies. Choosing one puts its text into the box. */
export function TemplatePicker({ call, department, onInsert }: { call: Call; department: string; onInsert: (t: Template) => void }) {
  const [load] = useLoad<{ templates: Template[] }>(() => (department ? call(`/templates?department=${encodeURIComponent(department)}`) : Promise.resolve({ data: { templates: [] } })), [department]);
  const templates = load.state === "ready" ? load.data.templates ?? [] : [];
  if (templates.length === 0) return null;
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted"><FileText className="w-3.5 h-3.5" /> Template
      <select aria-label="Insert template" value="" onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) onInsert(t); }} className="rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-fg">
        <option value="">Insert…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}

export function Compose({ call, departments, initial, draft, onSent, onChanged }: { call: Call; departments: Dept[]; initial: string; draft?: Draft; onSent: (notice?: string) => void; onChanged: () => void }) {
  const [department, setDepartment] = useState(draft?.department ?? (departments.some((d) => d.key === initial) ? initial : departments[0]?.key ?? ""));
  const [to, setTo] = useState(draft?.to ?? ""); const [subject, setSubject] = useState(draft?.subject ?? "");
  const [html, setHtml] = useState(draft ? (draft.bodyHtml ?? textToHtml(draft.body)) : "");
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [scheduleError, setScheduleError] = useState("");
  const editor = useRef<EditorHandle>(null);
  const att = useAttachments();
  const from = departments.find((d) => d.key === department);
  useEffect(() => { if (draft?.attachments?.length) att.set(draft.attachments); }, []);          // eslint-disable-line react-hooks/exhaustive-deps

  const auto = useAutosave(`${department}|${to}|${subject}|${html}|${att.ids.join(",")}`, async () => {
    const r = await call<{ id: string | null }>("/drafts", { method: "POST", body: { ...(draftId ? { id: draftId } : {}), department, to, subject, bodyHtml: html, attachmentIds: att.ids } });
    if ("error" in r) return false;
    setDraftId(r.data.id); onChanged();
    return true;
  });
  const payload = () => ({ department, to, subject, bodyHtml: html, ...(att.ids.length ? { attachmentIds: att.ids } : {}), ...(draftId ? { draftId } : {}) });

  return (
    <div className="space-y-3">
      <h2 className="text-base font-black text-fg">{draft ? "Draft" : "New email"}</h2>
      <label className="block"><span className="text-xs font-bold text-fg">From</span>
        <select aria-label="From" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls + " mt-1"}>{departments.map((d) => <option key={d.key} value={d.key}>{d.name} &lt;{d.address}&gt;</option>)}</select></label>
      <label className="block"><span className="text-xs font-bold text-fg">To</span><input aria-label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls + " mt-1"} placeholder="name@example.com" /></label>
      <label className="block"><span className="text-xs font-bold text-fg">Subject</span><input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls + " mt-1"} maxLength={200} /></label>
      <div>
        <div className="flex items-center justify-between gap-2 mb-1"><span className="text-xs font-bold text-fg">Message</span>
          <TemplatePicker call={call} department={department} onInsert={(t) => { if (!subject.trim() && t.subject) setSubject(t.subject); if (isEmptyHtml(html)) editor.current?.setHtml(t.bodyHtml); else editor.current?.insertHtml(t.bodyHtml); }} /></div>
        <MailEditor ref={editor} value={html} onChange={setHtml} ariaLabel="Message" minHeight={180} />
      </div>
      <AttachPicker att={att} />
      <p className="text-[11px] text-fg-muted">Your signature is added when it is sent. Change it under Settings.</p>
      <div className="flex flex-wrap items-center gap-2">
        <SendButton label={`Send from ${from?.address ?? "department"}`} color={COLOR} onBeforeSend={auto.stop}
          onSend={async () => { const r = await call("/send", { method: "POST", body: payload() }); if ("error" in r) return { error: r.error }; att.clear(); onSent(); return { message: "Email sent." }; }} />
        <TimeMenu label="Schedule send" title="Send later" maxDays={6} icon={<CalendarClock className="w-3.5 h-3.5" />} buttonClass="inline-flex items-center gap-1 px-3 py-2 text-xs rounded-lg font-bold border border-line text-fg hover:bg-surface-2"
          onPick={async (at) => { const r = await call("/schedule", { method: "POST", body: { ...payload(), sendAt: at.toISOString() } }); if ("error" in r) { setScheduleError(r.error); return; } auto.stop(); att.clear(); onSent(`Scheduled to send ${whenLong(at)}.`); }} />
        {draftId && <button type="button" onClick={async () => { auto.stop(); await call(`/drafts/${draftId}`, { method: "DELETE" }); onSent(); }} className="px-3 py-2 text-xs rounded-lg font-bold border border-line text-fg-muted hover:bg-surface-2">Discard draft</button>}
        <span aria-live="polite" className="text-[11px] text-fg-muted">{auto.status === "saving" ? "Saving draft…" : auto.status === "saved" ? "Draft saved" : auto.status === "error" ? "Draft not saved" : ""}</span>
        <span className="ml-auto"><UndoSetting /></span>
      </div>
      {scheduleError && <p role="alert" className="text-xs font-semibold" style={{ color: "#DC2626" }}>{scheduleError}</p>}
    </div>
  );
}
