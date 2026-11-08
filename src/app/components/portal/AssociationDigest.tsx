import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, ActionButton, when, inputCls } from "./ui";

/**
 * The association's email digest (docs/ASSOCIATION_COMPLIANCE.md, module 13): a short email, weekly or monthly, of what needs attention, to the people the association chooses.
 * The main login only. It names vehicles, drivers and members, so the screen says to add only people who may see that.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
interface Settings { enabled: boolean; frequency: "weekly" | "monthly"; weekday: number; dayOfMonth: number; recipients: string[]; sendWhenQuiet: boolean; when: string }
interface Hist { period: string; status: string; recipients: number; note: string | null; at: string }
const STATUS_TEXT: Record<string, string> = { sent: "Sent", failed: "Could not be sent", skipped: "Not sent: nothing needed attention", test: "Test email" };

export function DigestScreen() {
  const [load, reload] = useLoad<{ settings: Settings; history: Hist[]; emailAvailable: boolean }>(() => call("/digest")), [f, setF] = useState<{ enabled: boolean; frequency: "weekly" | "monthly"; weekday: number; dayOfMonth: number; recipients: string; sendWhenQuiet: boolean }>({ enabled: false, frequency: "weekly", weekday: 1, dayOfMonth: 1, recipients: "", sendWhenQuiet: false }), [loaded, setLoaded] = useState(false), [preview, setPreview] = useState<string | null>(null);
  if (load.state === "ready" && !loaded) { const s = load.data.settings; setLoaded(true); setF({ enabled: s.enabled, frequency: s.frequency, weekday: s.weekday, dayOfMonth: s.dayOfMonth, recipients: s.recipients.join(", "), sendWhenQuiet: s.sendWhenQuiet }); }
  const list = f.recipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  return (
    <SectionPanel title="Email digest">
      <div className="p-4 space-y-4">
        <p className="text-sm text-fg">A short email, weekly or monthly, of what needs attention: licences and permits running out, fees overdue, resolutions past their date, safety matters. It is the same list you see on the dashboard, so nobody has to open it to know. <b>It names vehicles, drivers and members, so add only people who are allowed to see that.</b> Each person gets their own copy.</p>
        <Status load={load}>{({ settings, history, emailAvailable }) => (
          <>
            {!emailAvailable && <p className="text-sm text-bad" role="status">Email is not set up on this server yet, so nothing can be sent. The administrator needs to set up the email service.</p>}
            {settings.enabled && <p className="text-sm text-fg">The digest is <b>on</b>: it is sent {settings.when} to {settings.recipients.length} {settings.recipients.length === 1 ? "address" : "addresses"}.</p>}
            <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /><b>Send the digest</b></label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block"><span className="text-xs text-fg-muted">How often</span><select aria-label="Digest how often" className={inputCls + " mt-1 w-40 py-3"} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as "weekly" | "monthly" })}><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label>
              {f.frequency === "weekly"
                ? <label className="block"><span className="text-xs text-fg-muted">On</span><select aria-label="Digest weekday" className={inputCls + " mt-1 w-40 py-3"} value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
                : <label className="block"><span className="text-xs text-fg-muted">On the day of the month (1 to 28)</span><input aria-label="Digest day of the month" type="number" min={1} max={28} className={inputCls + " mt-1 w-28 py-3"} value={f.dayOfMonth} onChange={(e) => setF({ ...f, dayOfMonth: Number(e.target.value) })} /></label>}
            </div>
            <label className="block"><span className="text-xs text-fg-muted">Email addresses (up to 5, separated by commas)</span><input aria-label="Digest email addresses" className={inputCls + " mt-1 w-full max-w-xl py-3"} value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} placeholder="chair@example.org, secretary@example.org" /></label>
            <label className="flex items-start gap-2 text-sm text-fg"><input type="checkbox" className="mt-1" checked={f.sendWhenQuiet} onChange={(e) => setF({ ...f, sendWhenQuiet: e.target.checked })} /><span>Send it even when nothing needs attention. (Otherwise a quiet week sends nothing.)</span></label>
            <p className="text-xs text-fg-subtle">It is sent between 07:00 and 19:00 South African time, once for each week or month.</p>
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton label="Save the digest settings" color={COLOR} onRun={async () => { const r = await call("/digest", { method: "PUT", body: { enabled: f.enabled, frequency: f.frequency, weekday: f.weekday, dayOfMonth: f.dayOfMonth, recipients: list, sendWhenQuiet: f.sendWhenQuiet } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
              <ActionButton label="Show me today's digest" color="#6B7280" onRun={async () => { const r = await call<{ text: string }>("/digest/preview"); if ("error" in r) return { error: r.error }; setPreview((r.data as unknown as { text: string }).text); return undefined; }} />
              <ActionButton label="Send a test email now" color="#6B7280" onRun={async () => { const r = await call<{ sent: number; failed: number }>("/digest/test", { method: "POST" }); if ("error" in r) return { error: r.error }; const x = r.data as unknown as { sent: number; failed: number }; reload(); return { message: `Sent to ${x.sent} ${x.sent === 1 ? "address" : "addresses"}${x.failed ? `; ${x.failed} could not be sent` : ""}.` }; }} />
            </div>
            <p className="text-xs text-fg-subtle">Save first: a test goes to the addresses that were last saved. You can send up to 3 tests a day.</p>
            {preview !== null && <div><p className="text-xs font-bold text-fg mb-1">What it would say today</p><pre className="whitespace-pre-wrap text-xs text-fg bg-surface-2 border border-line rounded-lg p-3 max-h-96 overflow-auto" aria-label="Digest preview">{preview}</pre><button type="button" className="mt-1 text-xs underline" onClick={() => setPreview(null)}>Hide it</button></div>}
            <div>
              <p className="text-xs font-bold text-fg mb-1">What was sent</p>
              {history.length === 0 ? <p className="text-sm text-fg-muted">Nothing has been sent yet.</p> : <ul className="text-sm text-fg space-y-1">{history.map((h, i) => <li key={`${h.at}-${i}`}>{when(h.at)} · {STATUS_TEXT[h.status] ?? h.status}{h.recipients ? ` · to ${h.recipients}` : ""}{h.note ? ` · ${h.note}` : ""}</li>)}</ul>}
            </div>
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}
