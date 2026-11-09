import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, ActionButton } from "./ui";

/**
 * WhatsApp alerts (docs/OWNER_DASHBOARD.md), for the owner's own login only. Strictly opt-in: the owner ticks that they agree, uses the number they already confirmed under Text alerts, and chooses the kinds of alert. The same rules as text alerts: at most one message a day, between 07:00 and 19:00, only about things that need action.
 * It says plainly when it is not available yet (WhatsApp needs an approved message template), and nothing can be switched on until it is.
 */
const COLOR = "#128C7E";
const call = portalClient("owner");
interface WaStatus { available: boolean; reason: string | null; numberConfirmed: boolean; number: string | null; enabled: boolean; consentOn: string | null; kinds: string[]; kindList: { key: string; label: string }[] }

export function WhatsAppAlertsScreen() {
  const [load, reload] = useLoad<WaStatus>(() => call("/whatsapp")), [picked, setPicked] = useState<string[] | null>(null), [agree, setAgree] = useState(false), [sure, setSure] = useState(false);
  return (
    <div className="space-y-4">
      <SectionPanel title="WhatsApp alerts">
        <div className="p-4 space-y-3 text-sm text-fg">
          <p>Get a WhatsApp message when something needs you, so you do not have to open the dashboard to find out. It is completely optional and you choose what you are told.</p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-fg-muted">
            <li>We only message the mobile number you confirmed under <b>Text alerts</b>, and only after you tick that you agree.</li>
            <li>At most <b>one message a day</b>, between 7 in the morning and 7 in the evening, and only about things that need action.</li>
            <li>The message can name a vehicle and an amount (for example a missed loan instalment). It never includes your bank details or a password.</li>
            <li>Reply <b>STOP</b> to any of the messages and it is switched off at once. You can also switch it off, or withdraw your agreement, here.</li>
          </ul>
        </div>
      </SectionPanel>
      <Status load={load}>{(s) => {
        const chosen = picked ?? s.kinds;
        return (
          <>
            {!s.available && <p className="text-sm text-bad" role="status">{s.reason}. Nothing can be switched on until it is set up.</p>}
            {!s.numberConfirmed
              ? <SectionPanel title="First, confirm your mobile number"><div className="p-4 text-sm text-fg">WhatsApp alerts use the number you confirm under <b>Text alerts</b>. Open Text alerts, save your number and confirm it with the code we text you, then come back here.</div></SectionPanel>
              : (
                <SectionPanel title="Choose what to be told">
                  <div className="p-4 space-y-3">
                    <p className="text-sm text-fg">Messages go to <b>{s.number}</b>.{s.consentOn ? ` You agreed on ${s.consentOn}.` : ""}</p>
                    <fieldset className="space-y-2"><legend className="text-xs text-fg-muted">Tell me about</legend>
                      {s.kindList.map((k) => <label key={k.key} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={chosen.includes(k.key)} onChange={(e) => setPicked(e.target.checked ? [...chosen, k.key] : chosen.filter((x) => x !== k.key))} /><span className="text-sm text-fg">{k.label}</span></label>)}
                    </fieldset>
                    {!s.consentOn && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span className="text-sm text-fg"><b>I agree</b> to be sent alerts on WhatsApp at this number. I can switch them off at any time by replying STOP or here.</span></label>}
                    <p className="text-xs text-fg-muted">Right now WhatsApp alerts are <b>{s.enabled ? "on" : "off"}</b>.</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <ActionButton label="Switch on with these choices" color={COLOR} onRun={async () => { const r = await call("/whatsapp/settings", { method: "PUT", body: { enabled: true, kinds: chosen, ...(s.consentOn ? {} : { consent: agree }) } }); if ("error" in r) return { error: r.error }; setPicked(null); reload(); return { message: "WhatsApp alerts are on." }; }} />
                      {s.enabled && <ActionButton label="Switch off" color="#6B7280" onRun={async () => { const r = await call("/whatsapp/settings", { method: "PUT", body: { enabled: false, kinds: s.kinds } }); if ("error" in r) return { error: r.error }; reload(); return { message: "WhatsApp alerts are off." }; }} />}
                      <ActionButton label="Send me a test message" color="#6B7280" onRun={async () => { const r = await call("/whatsapp/test", { method: "POST" }); if ("error" in r) return { error: r.error }; return { message: "A test message is on its way. If it does not arrive, check that this number is on WhatsApp." }; }} />
                    </div>
                  </div>
                </SectionPanel>)}
            {s.consentOn && (
              <SectionPanel title="Withdraw my agreement">
                <div className="p-4 space-y-2 text-sm text-fg">
                  <p>This switches WhatsApp alerts off, forgets what you chose and removes your agreement. We will not message you on WhatsApp again unless you agree again.</p>
                  {sure ? <ActionButton label="Yes, withdraw my agreement" color="#C8102E" onRun={async () => { const r = await call("/whatsapp", { method: "DELETE" }); if ("error" in r) return { error: r.error }; setSure(false); setAgree(false); setPicked(null); reload(); return undefined; }} /> : <button type="button" className="px-4 py-2 rounded-lg text-sm font-bold border border-line" onClick={() => setSure(true)}>Withdraw my agreement</button>}
                </div>
              </SectionPanel>)}
          </>);
      }}</Status>
    </div>
  );
}
