import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, ActionButton, inputCls } from "./ui";

/**
 * Text alerts (docs/OWNER_DASHBOARD.md, slice F3), for the owner's own login only. Strictly opt-in: a number the owner confirms with a code, the kinds of alert they choose, at most one text a day.
 * Plain words about exactly what is sent, when, and how to stop it.
 */
const COLOR = "#0F766E";
const call = portalClient("owner");
interface SmsStatus { available: boolean; phone: string | null; verified: boolean; enabled: boolean; kinds: string[]; kindList: { key: string; label: string }[]; codePending: boolean }

export function TextAlertsScreen() {
  const [load, reload] = useLoad<SmsStatus>(() => call("/sms")), [phone, setPhone] = useState(""), [code, setCode] = useState(""), [picked, setPicked] = useState<string[] | null>(null), [changing, setChanging] = useState(false), [sure, setSure] = useState(false);
  return (
    <div className="space-y-4">
      <SectionPanel title="Text alerts">
        <div className="p-4 space-y-3 text-sm text-fg">
          <p>Get a text message when something needs you, so you do not have to open the dashboard to find out. It is completely optional and you choose what you are told.</p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-fg-muted">
            <li>We only text a number you have confirmed with a code.</li>
            <li>At most <b>one text a day</b>, between 7 in the morning and 7 in the evening, and only about things that need action.</li>
            <li>The same thing is not texted again within a week.</li>
            <li>The text can name a vehicle and an amount (for example a missed loan instalment). It never includes your bank details or a password.</li>
            <li>You can switch it off, or delete your number, at any time. Your phone company's normal message rates apply to you.</li>
          </ul>
        </div>
      </SectionPanel>
      <Status load={load}>{(s) => {
        const chosen = picked ?? s.kinds;
        return (
          <>
            {!s.available && <p role="alert" className="text-sm text-bad">Text messages are not switched on yet. The administrator needs to set up the text message service before this can be used.</p>}
            {(!s.phone || changing) && (
              <SectionPanel title={s.phone ? "Use a different number" : "Step 1: your mobile number"}>
                <div className="p-4 space-y-3">
                  <label className="block"><span className="text-xs text-fg-muted">Your mobile number</span><input aria-label="Mobile number" inputMode="tel" className={inputCls + " mt-1 w-64 py-3 text-base"} placeholder="082 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} /><span className="block text-[11px] text-fg-subtle">From another country? Start with the + and the country code.</span></label>
                  <ActionButton label="Send me a code" color={COLOR} onRun={async () => { const r = await call("/sms/phone", { method: "POST", body: { phone } }); if ("error" in r) return { error: r.error }; setPhone(""); setChanging(false); setPicked(null); reload(); return { message: "We have sent a code to that number." }; }} />
                  {changing && <button type="button" className="text-xs underline" onClick={() => setChanging(false)}>Keep the number I have</button>}
                </div>
              </SectionPanel>)}
            {s.phone && !s.verified && !changing && (
              <SectionPanel title="Step 2: confirm it is your number">
                <div className="p-4 space-y-3">
                  <p>We sent a code to <b>{s.phone}</b>. {s.codePending ? "It works for 10 minutes." : "That code has run out: ask for a new one."}</p>
                  <label className="block"><span className="text-xs text-fg-muted">The six-digit code</span><input aria-label="Confirmation code" inputMode="numeric" maxLength={6} className={inputCls + " mt-1 w-40 py-3 text-base tracking-widest"} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>
                  <div className="flex flex-wrap items-center gap-3"><ActionButton label="Confirm" color={COLOR} onRun={async () => { const r = await call("/sms/verify", { method: "POST", body: { code } }); if ("error" in r) return { error: r.error }; setCode(""); reload(); return { message: "Your number is confirmed." }; }} /><button type="button" className="text-xs underline" onClick={() => setChanging(true)}>Use a different number</button></div>
                </div>
              </SectionPanel>)}
            {s.phone && s.verified && !changing && (
              <SectionPanel title="Step 3: choose what to be told">
                <div className="p-4 space-y-3">
                  <p>Texts go to <b>{s.phone}</b>. <button type="button" className="text-xs underline" onClick={() => setChanging(true)}>Use a different number</button></p>
                  <fieldset className="space-y-2"><legend className="text-xs text-fg-muted">Tell me about</legend>
                    {s.kindList.map((k) => <label key={k.key} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={chosen.includes(k.key)} onChange={(e) => setPicked(e.target.checked ? [...chosen, k.key] : chosen.filter((x) => x !== k.key))} /><span>{k.label}</span></label>)}
                  </fieldset>
                  <p className="text-xs text-fg-muted">Right now text alerts are <b>{s.enabled ? "on" : "off"}</b>.</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <ActionButton label="Switch on with these choices" color={COLOR} onRun={async () => { const r = await call("/sms/settings", { method: "PUT", body: { enabled: true, kinds: chosen } }); if ("error" in r) return { error: r.error }; setPicked(null); reload(); return { message: "Text alerts are on." }; }} />
                    {s.enabled && <ActionButton label="Switch off" color="#6B7280" onRun={async () => { const r = await call("/sms/settings", { method: "PUT", body: { enabled: false, kinds: s.kinds } }); if ("error" in r) return { error: r.error }; setPicked(null); reload(); return { message: "Text alerts are off." }; }} />}
                    <ActionButton label="Send me a test text" color="#6B7280" onRun={async () => { const r = await call("/sms/test", { method: "POST" }); if ("error" in r) return { error: r.error }; return { message: "A test text is on its way." }; }} />
                  </div>
                </div>
              </SectionPanel>)}
            {s.phone && (
              <SectionPanel title="Delete my number">
                <div className="p-4 space-y-2 text-sm text-fg">
                  <p>This deletes your number and everything you chose. We will not text you again unless you set it up again.</p>
                  {sure ? <ActionButton label="Yes, delete my number" color="#C8102E" onRun={async () => { const r = await call("/sms", { method: "DELETE" }); if ("error" in r) return { error: r.error }; setSure(false); setPicked(null); setChanging(false); reload(); return { message: "Your number has been deleted." }; }} /> : <button type="button" className="px-4 py-2 rounded-lg text-sm font-bold border border-line" onClick={() => setSure(true)}>Delete my number</button>}
                </div>
              </SectionPanel>)}
          </>);
      }}</Status>
    </div>
  );
}
