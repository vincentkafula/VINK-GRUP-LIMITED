import { useEffect, useRef, useState } from "react";
import { Trash2, Bell } from "lucide-react";
import { useLoad, Status, Empty, ActionButton, inputCls } from "./ui";
import { MailEditor, isEmptyHtml, type EditorHandle } from "./MailEditor";
import { COLOR, NOTIFY_KEY, notificationsOn, textToHtml, type Call, type Dept, type Label, type Template } from "./mailShared";
import { BRAND } from "../../brand";

/** Settings of Department mail, for one department at a time: signature, templates, labels, filters, out-of-office reply, and desktop notifications. */
type Tab = "signature" | "templates" | "labels" | "filters" | "autoreply" | "notifications";
const TABS: { key: Tab; label: string }[] = [{ key: "signature", label: "Signature" }, { key: "templates", label: "Templates" }, { key: "labels", label: "Labels" }, { key: "filters", label: "Filters" }, { key: "autoreply", label: "Out of office" }, { key: "notifications", label: "Notifications" }];
const SWATCHES = [BRAND.crimson, "#DC2626", "#D97706", "#047857", "#0369A1", "#6D28D9", "#64748B"];
const field = "block";
const lbl = "text-xs font-bold text-fg";

export function MailSettings({ call, departments, initial, onChanged }: { call: Call; departments: Dept[]; initial: string; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("signature");
  const [department, setDepartment] = useState(departments.some((d) => d.key === initial) ? initial : departments[0]?.key ?? "");
  const dept = departments.find((d) => d.key === department);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-lg font-black text-fg">Mail settings</h2><p className="text-xs text-fg-muted">For the department you choose. Everyone who manages it shares templates, labels, filters and the out-of-office reply; the signature is your own.</p></div>
        <label className="text-xs font-bold text-fg">Department
          <select aria-label="Settings for department" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls + " mt-1 !w-auto"}>{departments.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</select></label>
      </div>
      <div role="tablist" aria-label="Settings" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className="px-3 py-1.5 rounded-full text-xs font-bold border" style={tab === t.key ? { background: COLOR, color: "#fff", borderColor: COLOR } : { color: "var(--vk-fg)", borderColor: "var(--vk-line)" }}>{t.label}</button>)}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        {!dept ? <Empty>Choose a department.</Empty>
          : tab === "signature" ? <SignatureTab key={department} call={call} department={department} />
          : tab === "templates" ? <TemplatesTab key={department} call={call} department={department} />
          : tab === "labels" ? <LabelsTab key={department} call={call} department={department} onChanged={onChanged} />
          : tab === "filters" ? <FiltersTab key={department} call={call} department={department} />
          : tab === "autoreply" ? <AutoreplyTab key={department} call={call} department={department} />
          : <NotificationsTab />}
      </div>
    </div>
  );
}

// ── Signature ────────────────────────────────────────────────────────────────

interface Sig { name: string; title: string; phone: string; photoUrl: string; enabled: boolean; custom: boolean; department: string; email: string; html: string }
function SignatureTab({ call, department }: { call: Call; department: string }) {
  const [load] = useLoad<{ signature: Sig }>(() => call(`/signature?department=${encodeURIComponent(department)}`), [department]);
  return <Status load={load}>{({ signature }) => <SignatureForm call={call} department={department} initial={signature} />}</Status>;
}
function SignatureForm({ call, department, initial }: { call: Call; department: string; initial: Sig }) {
  const [f, setF] = useState({ name: initial.name, title: initial.title, phone: initial.phone, photoUrl: initial.photoUrl, enabled: initial.enabled });
  const [html, setHtml] = useState(initial.html); const [err, setErr] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => { const r = await call<{ html: string }>("/signature/preview", { method: "POST", body: { department, ...f } }); if ("error" in r) setErr(r.error); else { setErr(""); setHtml(r.data.html); } }, 500);
    return () => clearTimeout(t);
  }, [f.name, f.title, f.phone, f.photoUrl]);          // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5">
      <div className="space-y-3">
        <p className="text-xs text-fg-muted">Added to the end of every email you send from this department, in the VINK design. The department name and address are filled in for you ({initial.department}, {initial.email}).</p>
        <label className={field}><span className={lbl}>Your name</span><input aria-label="Your name" value={f.name} onChange={set("name")} maxLength={80} className={inputCls + " mt-1"} /></label>
        <label className={field}><span className={lbl}>Job title</span><input aria-label="Job title" value={f.title} onChange={set("title")} maxLength={80} placeholder="Sales Executive" className={inputCls + " mt-1"} /></label>
        <label className={field}><span className={lbl}>Phone</span><input aria-label="Phone" value={f.phone} onChange={set("phone")} maxLength={30} placeholder="+27 (0)21 007 0772" className={inputCls + " mt-1"} /></label>
        <label className={field}><span className={lbl}>Photo address (optional)</span><input aria-label="Photo address" value={f.photoUrl} onChange={set("photoUrl")} maxLength={300} placeholder="https://www.vink.co.za/staff/you.jpg" className={inputCls + " mt-1"} />
          <span className="text-[11px] text-fg-muted">A square picture on a web address that starts with https://. Without one, your initials are shown in a gold ring.</span></label>
        <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" aria-label="Add my signature to emails" checked={f.enabled} onChange={(e) => setF((x) => ({ ...x, enabled: e.target.checked }))} /> Add my signature to emails I send</label>
        <ActionButton label="Save signature" color={COLOR} onRun={async () => { const r = await call("/signature", { method: "PUT", body: { department, ...f } }); return "error" in r ? { error: r.error } : { message: "Signature saved." }; }} />
        {err && <p role="alert" className="text-xs font-semibold" style={{ color: "#DC2626" }}>{err}</p>}
      </div>
      <div>
        <p className={lbl + " mb-1"}>How it looks</p>
        <iframe title="Signature preview" sandbox="" referrerPolicy="no-referrer" srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:12px;background:#fff;font:14px Segoe UI,Arial,sans-serif;color:#222"><p>Dear customer,</p><p>Thank you for contacting us.</p>${html}</body>`} className="w-full rounded-lg" style={{ height: 330, background: "#fff", border: "1px solid var(--vk-line)" }} />
      </div>
    </div>
  );
}

// ── Templates ────────────────────────────────────────────────────────────────

function TemplatesTab({ call, department }: { call: Call; department: string }) {
  const [load, reload] = useLoad<{ templates: Template[] }>(() => call(`/templates?department=${encodeURIComponent(department)}`), [department]);
  const [editing, setEditing] = useState<{ id?: string; name: string; subject: string; html: string } | null>(null);
  const editor = useRef<EditorHandle>(null);
  const [err, setErr] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">Ready-made replies. In a reply or a new email, choose <b>Insert template</b> above the message.</p>
      <Status load={load}>{({ templates }) => templates.length === 0 && !editing ? <Empty>No templates yet.</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line">{templates.map((t) => (
          <li key={t.id} className="flex items-center gap-2 p-2.5 text-sm"><span className="font-semibold text-fg">{t.name}</span><span className="text-xs text-fg-muted truncate">{t.subject}</span>
            <button type="button" onClick={() => setEditing({ id: t.id, name: t.name, subject: t.subject, html: t.bodyHtml })} className="ml-auto text-xs font-bold underline">Edit</button>
            <button type="button" aria-label={`Delete template ${t.name}`} onClick={async () => { await call(`/templates/${t.id}`, { method: "DELETE" }); reload(); }} className="p-1 rounded hover:bg-surface-2"><Trash2 className="w-4 h-4 text-fg-muted" /></button></li>))}</ul>)}</Status>
      {editing ? (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <label className={field}><span className={lbl}>Template name</span><input aria-label="Template name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={60} className={inputCls + " mt-1"} /></label>
          <label className={field}><span className={lbl}>Subject (optional)</span><input aria-label="Template subject" value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} maxLength={200} className={inputCls + " mt-1"} /></label>
          <div><span className={lbl}>Text</span><MailEditor ref={editor} value={editing.html} onChange={(h) => setEditing((x) => (x ? { ...x, html: h } : x))} ariaLabel="Template text" minHeight={120} /></div>
          <div className="flex items-center gap-2">
            <ActionButton label="Save template" color={COLOR} onRun={async () => { const r = await call("/templates", { method: "POST", body: { id: editing.id, department, name: editing.name, subject: editing.subject, bodyHtml: isEmptyHtml(editing.html) ? "" : editing.html } }); if ("error" in r) return { error: r.error }; setEditing(null); setErr(""); reload(); return { message: "Saved." }; }} />
            <button type="button" onClick={() => { setEditing(null); setErr(""); }} className="px-3 py-2 text-xs rounded-lg font-bold border border-line text-fg-muted">Cancel</button>
          </div>
          {err && <p role="alert" className="text-xs" style={{ color: "#DC2626" }}>{err}</p>}
        </div>) : <button type="button" onClick={() => setEditing({ name: "", subject: "", html: textToHtml("") })} className="px-3 py-2 text-xs rounded-lg font-bold text-white" style={{ background: COLOR }}>New template</button>}
    </div>
  );
}

// ── Labels ───────────────────────────────────────────────────────────────────

function LabelsTab({ call, department, onChanged }: { call: Call; department: string; onChanged: () => void }) {
  const [load, reload] = useLoad<{ labels: Label[] }>(() => call(`/labels?department=${encodeURIComponent(department)}`), [department]);
  const [name, setName] = useState(""); const [color, setColor] = useState(SWATCHES[0]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">Coloured tags for sorting messages. Put one on a message with <b>Labels</b>, or let a filter do it. Search with <code>label:name</code>.</p>
      <Status load={load}>{({ labels }) => labels.length === 0 ? <Empty>No labels yet.</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line">{labels.map((l) => (
          <li key={l.id} className="flex items-center gap-2 p-2.5 text-sm"><span className="h-3 w-3 rounded-full" style={{ background: l.color }} /><span className="font-semibold text-fg">{l.name}</span>
            <button type="button" aria-label={`Delete label ${l.name}`} onClick={async () => { await call(`/labels/${l.id}`, { method: "DELETE" }); reload(); onChanged(); }} className="ml-auto p-1 rounded hover:bg-surface-2"><Trash2 className="w-4 h-4 text-fg-muted" /></button></li>))}</ul>)}</Status>
      <div className="flex flex-wrap items-end gap-2">
        <label className={field}><span className={lbl}>New label</span><input aria-label="Label name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={inputCls + " mt-1"} /></label>
        <div role="radiogroup" aria-label="Label colour" className="flex gap-1 pb-1">{SWATCHES.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className="h-6 w-6 rounded-full border-2" style={{ background: c, borderColor: color === c ? "var(--vk-fg)" : "transparent" }} />)}</div>
        <ActionButton label="Add label" color={COLOR} onRun={async () => { const r = await call("/labels", { method: "POST", body: { department, name, color } }); if ("error" in r) return { error: r.error }; setName(""); reload(); onChanged(); return { message: "Added." }; }} />
      </div>
    </div>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────

interface FilterItem { id: string; name: string; from: string; subject: string; words: string; hasAttachment: boolean; label: Label | null; star: boolean; folder: "spam" | "trash" | null; close: boolean; active: boolean }
const describe = (f: FilterItem) => {
  const when = [f.from && `from "${f.from}"`, f.subject && `subject has "${f.subject}"`, f.words && `message has "${f.words}"`, f.hasAttachment && "has an attachment"].filter(Boolean).join(", ");
  const then = [f.label && `label ${f.label.name}`, f.star && "star it", f.close && "mark closed", f.folder && `move to ${f.folder === "spam" ? "Spam" : "Trash"}`].filter(Boolean).join(", ");
  return `If ${when}: ${then}.`;
};
function FiltersTab({ call, department }: { call: Call; department: string }) {
  const [load, reload] = useLoad<{ filters: FilterItem[] }>(() => call(`/filters?department=${encodeURIComponent(department)}`), [department]);
  const [labels] = useLoad<{ labels: Label[] }>(() => call(`/labels?department=${encodeURIComponent(department)}`), [department]);
  const blank = { name: "", from: "", subject: "", words: "", hasAttachment: false, labelId: "", star: false, folder: "", close: false };
  const [f, setF] = useState(blank);
  const labelList = labels.state === "ready" ? labels.data.labels : [];
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">A filter looks at each new email to this department. When <b>everything you fill in</b> matches, it does what you choose. (Emails from a blocked sender go to Spam before filters run.)</p>
      <Status load={load}>{({ filters }) => filters.length === 0 ? <Empty>No filters yet.</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line">{filters.map((x) => (
          <li key={x.id} className="flex items-center gap-2 p-2.5 text-sm"><div className="min-w-0"><p className="font-semibold text-fg">{x.name}{!x.active && <span className="ml-2 text-[10px] font-bold text-fg-muted">OFF</span>}</p><p className="text-xs text-fg-muted">{describe(x)}</p></div>
            <button type="button" onClick={async () => { await call("/filters", { method: "POST", body: { id: x.id, department, name: x.name, from: x.from, subject: x.subject, words: x.words, hasAttachment: x.hasAttachment, labelId: x.label?.id, star: x.star, folder: x.folder, close: x.close, active: !x.active } }); reload(); }} className="ml-auto text-xs font-bold underline shrink-0">{x.active ? "Turn off" : "Turn on"}</button>
            <button type="button" aria-label={`Delete filter ${x.name}`} onClick={async () => { await call(`/filters/${x.id}`, { method: "DELETE" }); reload(); }} className="p-1 rounded hover:bg-surface-2"><Trash2 className="w-4 h-4 text-fg-muted" /></button></li>))}</ul>)}</Status>
      <div className="rounded-lg border border-line p-3 space-y-2">
        <p className={lbl}>New filter</p>
        <label className={field}><span className="text-[11px] text-fg-muted">Name</span><input aria-label="Filter name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} className={inputCls + " mt-0.5"} /></label>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className={field}><span className="text-[11px] text-fg-muted">From contains</span><input aria-label="From contains" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={inputCls + " mt-0.5"} /></label>
          <label className={field}><span className="text-[11px] text-fg-muted">Subject contains</span><input aria-label="Subject contains" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className={inputCls + " mt-0.5"} /></label>
          <label className={field}><span className="text-[11px] text-fg-muted">Message contains</span><input aria-label="Message contains" value={f.words} onChange={(e) => setF({ ...f, words: e.target.value })} className={inputCls + " mt-0.5"} /></label>
        </div>
        <label className="flex items-center gap-2 text-xs text-fg"><input type="checkbox" aria-label="Has an attachment" checked={f.hasAttachment} onChange={(e) => setF({ ...f, hasAttachment: e.target.checked })} /> Only if it has an attachment</label>
        <p className="text-[11px] text-fg-muted pt-1">Then:</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-fg">
          <label className="flex items-center gap-1.5">Add label <select aria-label="Add label" value={f.labelId} onChange={(e) => setF({ ...f, labelId: e.target.value })} className={inputCls + " !w-auto !py-1"}><option value="">none</option>{labelList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="flex items-center gap-1.5"><input type="checkbox" aria-label="Star it" checked={f.star} onChange={(e) => setF({ ...f, star: e.target.checked })} /> Star it</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" aria-label="Mark closed" checked={f.close} onChange={(e) => setF({ ...f, close: e.target.checked })} /> Mark closed</label>
          <label className="flex items-center gap-1.5">Move to <select aria-label="Move to" value={f.folder} onChange={(e) => setF({ ...f, folder: e.target.value })} className={inputCls + " !w-auto !py-1"}><option value="">stay in the inbox</option><option value="spam">Spam</option><option value="trash">Trash</option></select></label>
        </div>
        <ActionButton label="Add filter" color={COLOR} onRun={async () => { const r = await call("/filters", { method: "POST", body: { department, ...f, labelId: f.labelId || undefined, folder: f.folder || undefined } }); if ("error" in r) return { error: r.error }; setF(blank); reload(); return { message: "Filter added." }; }} />
      </div>
    </div>
  );
}

// ── Out of office ────────────────────────────────────────────────────────────

interface Auto { department: string; enabled: boolean; subject: string; body: string; startOn: string | null; endOn: string | null }
function AutoreplyTab({ call, department }: { call: Call; department: string }) {
  const [load] = useLoad<{ autoreply: Auto }>(() => call(`/autoreply?department=${encodeURIComponent(department)}`), [department]);
  return <Status load={load}>{({ autoreply }) => <AutoreplyForm call={call} department={department} initial={autoreply} />}</Status>;
}
function AutoreplyForm({ call, department, initial }: { call: Call; department: string; initial: Auto }) {
  const [f, setF] = useState({ enabled: initial.enabled, subject: initial.subject, body: initial.body, startOn: initial.startOn ?? "", endOn: initial.endOn ?? "" });
  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-xs text-fg-muted">When on, everyone who emails this department gets this reply once every four days. It is never sent to robots, mailing lists, VINK addresses or mail that went to Spam.</p>
      <label className="flex items-center gap-2 text-sm font-semibold text-fg"><input type="checkbox" aria-label="Out-of-office reply is on" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Out-of-office reply is on</label>
      <label className={field}><span className={lbl}>Subject</span><input aria-label="Reply subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={120} className={inputCls + " mt-1"} /></label>
      <label className={field}><span className={lbl}>Message</span><textarea aria-label="Reply message" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={5} maxLength={5000} className={inputCls + " mt-1"} placeholder="Thank you for your email. We are away until Monday 13 October and will reply when we are back." /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className={field}><span className={lbl}>First day (optional)</span><input aria-label="First day" type="date" value={f.startOn} onChange={(e) => setF({ ...f, startOn: e.target.value })} className={inputCls + " mt-1"} /></label>
        <label className={field}><span className={lbl}>Last day (optional)</span><input aria-label="Last day" type="date" value={f.endOn} onChange={(e) => setF({ ...f, endOn: e.target.value })} className={inputCls + " mt-1"} /></label>
      </div>
      <ActionButton label="Save" color={COLOR} onRun={async () => { const r = await call("/autoreply", { method: "PUT", body: { department, ...f, startOn: f.startOn || null, endOn: f.endOn || null } }); return "error" in r ? { error: r.error } : { message: f.enabled ? "Saved. The out-of-office reply is on." : "Saved. It is off." }; }} />
    </div>
  );
}

// ── Notifications ────────────────────────────────────────────────────────────

function NotificationsTab() {
  const [on, setOn] = useState(notificationsOn());
  const [msg, setMsg] = useState("");
  const supported = typeof Notification !== "undefined";
  const toggle = async (want: boolean) => {
    setMsg("");
    if (!want) { try { localStorage.setItem(NOTIFY_KEY, "0"); } catch { /* not remembered */ } setOn(false); return; }
    if (!supported) { setMsg("This browser cannot show desktop notifications."); return; }
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (p !== "granted") { setMsg("Notifications are blocked for this site. Allow them in your browser's site settings, then try again."); return; }
    try { localStorage.setItem(NOTIFY_KEY, "1"); } catch { /* not remembered */ }
    setOn(true);
  };
  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-xs text-fg-muted">A message on your screen when new mail arrives for a department you manage. It works while this page is open in a browser tab (the page checks for new mail every minute). It is a setting for this computer and browser only.</p>
      <label className="flex items-center gap-2 text-sm font-semibold text-fg"><input type="checkbox" aria-label="Notify me of new mail" checked={on} onChange={(e) => void toggle(e.target.checked)} disabled={!supported} /> <Bell className="w-4 h-4" /> Notify me of new mail</label>
      {!supported && <p className="text-xs text-fg-muted">This browser cannot show desktop notifications.</p>}
      {msg && <p role="alert" className="text-xs font-semibold" style={{ color: "#DC2626" }}>{msg}</p>}
    </div>
  );
}
