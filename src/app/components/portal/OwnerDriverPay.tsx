import { useState } from "react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, inputCls } from "./ui";
import { sendOrQueue, useOutbox, newRef, clearRejected } from "./offlineQueue";

/**
 * What each driver owes the owner, what was paid, and where it is earmarked (docs/OWNER_DASHBOARD.md, slice A). It records and earmarks: it moves no money. A payment captured with no signal is kept on the phone and sent when it returns, safely (the server remembers each reference).
 * Plain words and large buttons; a traffic light always comes with words, never colour alone. All amounts are rand on screen and whole cents on the wire.
 */
const COLOR = "#0F766E";
const call = portalClient("owner");
const cents = (c: number) => rand(c / 100);
/** "1 200", "1200,50" or "1,200.50" as cents; null when it is not an amount. */
export function toCents(s: string): number | null { const t = s.replace(/\s/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, ""); if (!/^\d+(\.\d{1,2})?$/.test(t)) return null; const c = Math.round(Number(t) * 100); return c > 0 ? c : null; }
const today = () => new Date().toISOString().slice(0, 10);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-xs text-fg-muted">{label}</span>{children}</label>;
const LIGHT: Record<string, [string, string]> = { green: ["Paying on time", "#15803d"], amber: ["Behind", "#D97706"], red: ["Far behind", "#C8102E"], none: ["No target set", "#6B7280"] };
const Light = ({ s }: { s: string }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: LIGHT[s][1] }}>{LIGHT[s][0]}</span>;
const SEV: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" }, SEV_TEXT: Record<string, string> = { high: "Act now", medium: "Soon", low: "Keep an eye on" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const METHODS: [string, string][] = [["cash", "Cash"], ["eft", "EFT"], ["vink", "VINK"], ["other", "Other"]];
interface Flag { id: string; severity: string; message: string }
interface FleetRow { vehicleId: string; registration: string; driver: string | null; hasTarget: boolean; status: string; target: { period: string; amountCents: number } | null; arrearsCents: number; surplusCents: number; lastPaymentOn: string | null }
interface Fleet { measures: { vehicles: number; withTarget: number; arrearsCents: number; receivedThisWeekCents: number; receivedThisMonthCents: number; red: number; amber: number; green: number }; vehicles: FleetRow[]; flags: Flag[] }
interface DriverRow { driverId: string; name: string; status: string }

/** The big, simple form for the most common job: the driver handed over money. */
function RecordPayment({ vehicles, drivers, onDone }: { vehicles: FleetRow[]; drivers: DriverRow[]; onDone: () => void }) {
  const [f, setF] = useState({ vehicleId: "", amount: "", paidOn: today(), method: "cash", driverId: "", note: "" }), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  const submit = async () => {
    const c = toCents(f.amount); if (!f.vehicleId) return setMsg({ ok: false, text: "Choose the vehicle." }); if (c === null) return setMsg({ ok: false, text: "Type the amount in rand, for example 300 or 300.50." });
    setBusy(true); setMsg(null); const reg = vehicles.find((v) => v.vehicleId === f.vehicleId)?.registration ?? "";
    const r = await sendOrQueue(call, { method: "POST", path: "/driver-pay/payments", label: `Payment of ${cents(c)} for ${reg}`, body: { vehicleId: f.vehicleId, amountCents: c, paidOn: f.paidOn, method: f.method, ...(f.driverId ? { driverId: f.driverId } : {}), ...(f.note.trim() ? { note: f.note.trim() } : {}), clientRef: newRef("pay") } });
    setBusy(false);
    if (r.status === "error") return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.status === "queued" ? "Saved on this phone. It will be sent when you are online." : "Saved." }); setF({ ...f, amount: "", note: "" }); onDone();
  };
  return (
    <SectionPanel title="Record a payment">
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Vehicle"><select aria-label="Payment vehicle" className={inputCls + " mt-1 w-48 py-3"} value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">Choose</option>{vehicles.map((v) => <option key={v.vehicleId} value={v.vehicleId}>{v.registration}</option>)}</select></Field>
          <Field label="Amount (rand)"><input aria-label="Payment amount" inputMode="decimal" className={inputCls + " mt-1 w-36 py-3 text-base"} placeholder="300" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Paid on"><input type="date" aria-label="Payment date" className={inputCls + " mt-1 w-44 py-3"} max={today()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="How it was paid">{METHODS.map(([k, l]) => <button key={k} type="button" aria-pressed={f.method === k} className="px-4 py-3 rounded-lg text-sm font-bold border" style={f.method === k ? { background: COLOR, color: "#fff", borderColor: COLOR } : {}} onClick={() => setF({ ...f, method: k })}>{l}</button>)}</div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Which driver (if not the usual one)"><select aria-label="Payment driver" className={inputCls + " mt-1 w-52"} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}><option value="">The usual driver</option>{drivers.map((d) => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}</select></Field>
          <Field label="Note"><input aria-label="Payment note" maxLength={200} className={inputCls + " mt-1 w-60"} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <button type="button" disabled={busy} onClick={submit} className="px-6 py-3 rounded-lg text-base font-bold text-white disabled:opacity-60" style={{ background: COLOR }}>{busy ? "Saving…" : "Save payment"}</button>
        </div>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      </div>
    </SectionPanel>
  );
}

/* ───────────────────────── one vehicle ───────────────────────── */
interface Week { weekStart: string; expectedCents: number; receivedCents: number; waivedCents: number; balanceCents: number; shortfallCents: number; carriedForwardCents: number }
interface Target { id: string; period: string; amountCents: number; workingDays: number; dueWeekday: number; startDate: string; endDate: string | null; terms: string | null; driverId: string | null }
interface Rec { vehicle: { id: string; registration: string }; hasTarget: boolean; status: string; target: Target | null; targets: Target[]; split: { ownerBp: number; associationBp: number; financeBp: number; maintenanceBp: number }; earmarks: { owner: number; association: number; finance: number; maintenance: number; totalCents: number }; totals: { expectedCents: number; receivedCents: number; waivedCents: number; balanceCents: number; arrearsCents: number; surplusCents: number }; daysBehind: number; weeks: Week[]; lastPaymentOn: string | null; platform?: { countedCents: number; payments: { id: string; ref: string; paidOn: string; amountCents: number }[]; unmatched: { ref: string; paidOn: string; amountCents: number }[]; partlyPaid: { ref: string; dueOn: string; paidCents: number; owedCents: number }[] }; flags: Flag[]; pauses: { id: string; fromDate: string; toDate: string; reason: string }[] }
interface Payment { id: string; vehicleId: string; amountCents: number; paidOn: string; method: string; driver: string | null; note: string | null; voided: boolean; voidReason: string | null; allocations: Record<string, number> }

function TargetForm({ vehicleId, drivers, current, reload }: { vehicleId: string; drivers: DriverRow[]; current: Target | null; reload: () => void }) {
  const [f, setF] = useState({ period: current?.period ?? "daily", amount: current ? String(current.amountCents / 100) : "", days: current?.workingDays ?? 63, due: current?.dueWeekday ?? 7, start: today(), driverId: current?.driverId ?? "", terms: current?.terms ?? "" });
  return (
    <div className="space-y-3 text-sm text-fg">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="How often"><select aria-label="Target period" className={inputCls + " mt-1 w-36"} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}><option value="daily">Every day</option><option value="weekly">Every week</option></select></Field>
        <Field label="Amount (rand)"><input aria-label="Target amount" inputMode="decimal" className={inputCls + " mt-1 w-32"} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        {f.period === "weekly" && <Field label="Due on"><select aria-label="Target due day" className={inputCls + " mt-1 w-32"} value={f.due} onChange={(e) => setF({ ...f, due: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Field>}
        <Field label="Starts"><input type="date" aria-label="Target start" className={inputCls + " mt-1 w-40"} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Driver"><select aria-label="Target driver" className={inputCls + " mt-1 w-48"} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}><option value="">The vehicle's usual driver</option>{drivers.map((d) => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}</select></Field>
      </div>
      {f.period === "daily" && <div role="group" aria-label="Working days" className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = ((f.days >> i) & 1) === 1; return <button key={d} type="button" aria-pressed={on} className="px-3 py-2 rounded-lg text-xs font-bold border" style={on ? { background: COLOR, color: "#fff", borderColor: COLOR } : {}} onClick={() => setF({ ...f, days: f.days ^ (1 << i) })}>{d}</button>; })}</div>}
      <Field label="Terms agreed (optional)"><input aria-label="Target terms" maxLength={1000} className={inputCls + " mt-1"} placeholder="For example: pays before 20:00; the driver pays for his own fuel" value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
      <ActionButton label={current ? "Change the target" : "Set the target"} color={COLOR} onRun={async () => {
        const c = toCents(f.amount); if (c === null) return { error: "Type the amount in rand, for example 200." }; if (f.period === "daily" && f.days === 0) return { error: "Choose at least one working day." };
        const r = await call("/driver-pay/targets", { method: "POST", body: { vehicleId, period: f.period, amountCents: c, startDate: f.start, ...(f.period === "daily" ? { workingDays: f.days } : { dueWeekday: f.due }), ...(f.driverId ? { driverId: f.driverId } : {}), ...(f.terms.trim() ? { terms: f.terms.trim() } : {}) } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." };
      }} />
    </div>
  );
}
function SplitForm({ vehicleId, split, reload }: { vehicleId: string; split: Rec["split"]; reload: () => void }) {
  const [p, setP] = useState({ owner: String(split.ownerBp / 100), association: String(split.associationBp / 100), finance: String(split.financeBp / 100), maintenance: String(split.maintenanceBp / 100) }), n = (s: string) => Number(s.replace(",", ".")), total = n(p.owner) + n(p.association) + n(p.finance) + n(p.maintenance);
  const F = (k: keyof typeof p, label: string) => <Field label={label}><input aria-label={`Split ${label}`} inputMode="decimal" className={inputCls + " mt-1 w-24"} value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></Field>;
  return (
    <div className="space-y-3 text-sm text-fg">
      <p className="text-xs text-fg-subtle">Decide how each payment from this vehicle is set aside. It is a way of keeping track, not a movement of money, and it applies to payments from today. Payments already recorded keep the way they were set aside.</p>
      <div className="flex flex-wrap items-end gap-3">{F("owner", "Yours (%)")}{F("association", "Association (%)")}{F("finance", "Finance instalment (%)")}{F("maintenance", "Maintenance (%)")}<span className={`text-sm font-bold ${Math.abs(total - 100) < 0.005 ? "text-ok" : "text-bad"}`} role="status">Total {Number.isFinite(total) ? Math.round(total * 100) / 100 : "?"}%</span></div>
      <ActionButton small label="Save the split" color={COLOR} onRun={async () => { const bp = (s: string) => Math.round(n(s) * 100); if (!Number.isFinite(total) || Math.abs(total - 100) >= 0.005) return { error: "The four shares must add up to 100%." }; const r = await call(`/driver-pay/vehicles/${vehicleId}/split`, { method: "PUT", body: { ownerBp: bp(p.owner), associationBp: bp(p.association), financeBp: bp(p.finance), maintenanceBp: bp(p.maintenance) } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
    </div>
  );
}
function VehiclePanel({ vehicleId, drivers, reloadFleet }: { vehicleId: string; drivers: DriverRow[]; reloadFleet: () => void }) {
  const [rec, reloadRec] = useLoad<Rec>(() => call(`/driver-pay/vehicles/${vehicleId}`), [vehicleId]), [pays, reloadPays] = useLoad<{ payments: Payment[] }>(() => call(`/driver-pay/payments?vehicleId=${vehicleId}`), [vehicleId]);
  const [pause, setPause] = useState({ from: today(), to: today(), reason: "" }), [waive, setWaive] = useState({ amount: "", reason: "" }), [voiding, setVoiding] = useState<string | null>(null), [why, setWhy] = useState("");
  const reload = () => { reloadRec(); reloadPays(); reloadFleet(); };
  return (
    <div className="space-y-4 rounded-lg border border-line p-4">
      <Status load={rec}>{(r) => (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-fg"><Light s={r.status} />{r.hasTarget ? <span>Should pay {cents(r.target?.amountCents ?? 0)} {r.target?.period === "weekly" ? `every ${DAYS[(r.target.dueWeekday ?? 7) - 1]}` : "a day"} from {r.target?.startDate}.</span> : <span>No target is set for this vehicle.</span>}</div>
          {r.hasTarget && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Expected so far" value={cents(r.totals.expectedCents)} icon={<span aria-hidden>E</span>} color={COLOR} /><StatCard label="Received" value={cents(r.totals.receivedCents)} icon={<span aria-hidden>R</span>} color={COLOR} />
              <StatCard label={r.totals.arrearsCents > 0 ? "Owed to you" : "Paid ahead"} value={cents(r.totals.arrearsCents > 0 ? r.totals.arrearsCents : r.totals.surplusCents)} icon={<span aria-hidden>O</span>} color={COLOR} /><StatCard label="Waived" value={cents(r.totals.waivedCents)} icon={<span aria-hidden>W</span>} color={COLOR} />
            </div>)}
          {r.totals.arrearsCents > 0 && <p className="text-sm text-fg">That is about {r.daysBehind} day{r.daysBehind === 1 ? "" : "s"} of the target. {r.lastPaymentOn ? `The last payment was on ${r.lastPaymentOn}.` : "No payment has been recorded yet."}</p>}
          {r.platform && (r.platform.countedCents > 0 || r.platform.partlyPaid.length > 0) && (
            <div className="text-sm text-fg space-y-1">
              {r.platform.countedCents > 0 && <p><b>{cents(r.platform.countedCents)}</b> of what was received was collected for you by the platform. It is already counted above, so you do not need to write it down.</p>}
              {r.platform.payments.length > 0 && <ul className="text-xs text-fg-muted">{r.platform.payments.slice(-6).map((p) => <li key={p.id}>{p.paidOn} · {cents(p.amountCents)} (collected by the platform)</li>)}</ul>}
              {r.platform.partlyPaid.map((p) => <p key={p.ref} className="text-xs text-fg-muted">A payment due on {p.dueOn} has been part paid: {cents(p.paidCents)} has been paid and {cents(p.owedCents)} is still owed. The part that was paid is not counted until the whole payment is settled.</p>)}
            </div>)}
          {r.flags.map((x) => <p key={x.id} className="text-sm text-fg"><span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white mr-2" style={{ background: SEV[x.severity] }}>{SEV_TEXT[x.severity]}</span>{x.message}</p>)}
          {r.weeks.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><caption className="text-left text-xs font-bold uppercase text-fg-muted mb-1">Week by week (what is not paid carries forward)</caption><thead><tr className="text-left text-xs text-fg-muted"><th className="pr-3">Week of</th><th className="pr-3">Expected</th><th className="pr-3">Received</th><th className="pr-3">Waived</th><th>Owed at the end of the week</th></tr></thead>
              <tbody>{r.weeks.slice().reverse().map((w) => <tr key={w.weekStart} className="border-t border-line/60"><td className="pr-3">{w.weekStart}</td><td className="pr-3">{cents(w.expectedCents)}</td><td className="pr-3">{cents(w.receivedCents)}</td><td className="pr-3">{cents(w.waivedCents)}</td><td>{w.carriedForwardCents > 0 ? cents(w.carriedForwardCents) : w.balanceCents > 0 ? `${cents(w.balanceCents)} paid ahead` : "Nothing"}</td></tr>)}</tbody></table></div>)}
          <details className="text-sm text-fg"><summary className="font-bold cursor-pointer">{r.hasTarget ? "Change the target" : "Set the target"}</summary><div className="mt-3"><TargetForm vehicleId={vehicleId} drivers={drivers} current={r.target} reload={reload} /></div></details>
          {r.target && <ActionButton small label="End this target" color="#6B7280" onRun={async () => { const x = await call(`/driver-pay/targets/${r.target!.id}/end`, { method: "POST", body: { endDate: today() } }); if ("error" in x) return { error: x.error }; reload(); return undefined; }} />}
          <details className="text-sm text-fg"><summary className="font-bold cursor-pointer">How payments are set aside</summary><div className="mt-3 space-y-2"><SplitForm vehicleId={vehicleId} split={r.split} reload={reload} /><p className="text-xs text-fg-muted">So far: yours {cents(r.earmarks.owner)}, association {cents(r.earmarks.association)}, finance instalment {cents(r.earmarks.finance)}, maintenance {cents(r.earmarks.maintenance)}.</p></div></details>
          <details className="text-sm text-fg"><summary className="font-bold cursor-pointer">Days off the road</summary><div className="mt-3 space-y-2">
            <p className="text-xs text-fg-subtle">The target does not build up on days the vehicle is off the road.</p>
            {r.pauses.length === 0 ? <Empty>None recorded.</Empty> : <ul className="space-y-1">{r.pauses.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2">{p.fromDate} to {p.toDate}: {p.reason}{p.fromDate > today() && <ActionButton small label="Cancel" color="#6B7280" onRun={async () => { const x = await call(`/driver-pay/pauses/${p.id}`, { method: "DELETE" }); if ("error" in x) return { error: x.error }; reload(); return undefined; }} />}</li>)}</ul>}
            <div className="flex flex-wrap items-end gap-3"><Field label="From"><input type="date" aria-label="Pause from" className={inputCls + " mt-1 w-40"} value={pause.from} onChange={(e) => setPause({ ...pause, from: e.target.value })} /></Field><Field label="To"><input type="date" aria-label="Pause to" className={inputCls + " mt-1 w-40"} value={pause.to} onChange={(e) => setPause({ ...pause, to: e.target.value })} /></Field><Field label="Why"><input aria-label="Pause reason" maxLength={120} className={inputCls + " mt-1 w-56"} value={pause.reason} onChange={(e) => setPause({ ...pause, reason: e.target.value })} /></Field>
              <ActionButton small label="Add days off the road" color={COLOR} onRun={async () => { const x = await call("/driver-pay/pauses", { method: "POST", body: { vehicleId, fromDate: pause.from, toDate: pause.to, reason: pause.reason } }); if ("error" in x) return { error: x.error }; setPause({ ...pause, reason: "" }); reload(); return { message: "Added." }; }} /></div></div></details>
          {r.totals.arrearsCents > 0 && <details className="text-sm text-fg"><summary className="font-bold cursor-pointer">Do not chase part of what is owed</summary><div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Amount (rand)"><input aria-label="Waive amount" inputMode="decimal" className={inputCls + " mt-1 w-32"} value={waive.amount} onChange={(e) => setWaive({ ...waive, amount: e.target.value })} /></Field><Field label="Why"><input aria-label="Waive reason" maxLength={200} className={inputCls + " mt-1 w-64"} value={waive.reason} onChange={(e) => setWaive({ ...waive, reason: e.target.value })} /></Field>
            <ActionButton small label="Waive it" color={COLOR} onRun={async () => { const c = toCents(waive.amount); if (c === null) return { error: "Type the amount in rand." }; const x = await call("/driver-pay/waivers", { method: "POST", body: { vehicleId, amountCents: c, waivedOn: today(), reason: waive.reason } }); if ("error" in x) return { error: x.error }; setWaive({ amount: "", reason: "" }); reload(); return { message: "Recorded." }; }} /></div></details>}
        </>)}</Status>
      <Status load={pays}>{({ payments }) => (
        <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-2">Payments received</h4>
          {payments.length === 0 ? <Empty>No payments recorded for this vehicle.</Empty> : (
            <ul className="space-y-2 text-sm text-fg">{payments.map((p) => (
              <li key={p.id} className={`border-b border-line/60 pb-2 ${p.voided ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><span className={p.voided ? "line-through" : ""}>{p.paidOn} · {cents(p.amountCents)} · {METHODS.find(([k]) => k === p.method)?.[1]}{p.driver ? ` · ${p.driver}` : ""}{p.note ? ` · ${p.note}` : ""}</span>
                  {p.voided ? <span className="text-xs">Cancelled: {p.voidReason}</span> : voiding === p.id ? <span className="flex flex-wrap items-center gap-2"><input aria-label="Reason for cancelling" maxLength={200} className={inputCls + " w-56"} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why is this wrong?" /><ActionButton small label="Cancel this payment" color="#C8102E" onRun={async () => { const x = await call(`/driver-pay/payments/${p.id}/void`, { method: "POST", body: { reason: why } }); if ("error" in x) return { error: x.error }; setVoiding(null); setWhy(""); reload(); return undefined; }} /></span> : <button type="button" className="text-xs underline" onClick={() => setVoiding(p.id)}>Entered by mistake?</button>}</div>
                {!p.voided && p.allocations.association + p.allocations.finance + p.allocations.maintenance > 0 && <p className="text-xs text-fg-muted">Set aside: yours {cents(p.allocations.owner)}, association {cents(p.allocations.association)}, finance {cents(p.allocations.finance)}, maintenance {cents(p.allocations.maintenance)}</p>}
              </li>))}</ul>)}</div>)}</Status>
    </div>
  );
}

/* ───────────────────────── the screen ───────────────────────── */
export function DriverTargetsScreen() {
  const [fleet, reload] = useLoad<Fleet>(() => call("/driver-pay/fleet")), [dr] = useLoad<{ drivers: DriverRow[] }>(() => call("/drivers")), [open, setOpen] = useState<string | null>(null), o = useOutbox(call);
  const drivers = dr.state === "ready" ? dr.data.drivers.filter((d) => d.status === "active") : [];
  return (
    <div className="space-y-4">
      {o.waiting.length > 0 && <div role="status" className="rounded-lg border border-line p-3 text-sm text-fg flex flex-wrap items-center justify-between gap-2"><span>{o.waiting.length} change{o.waiting.length === 1 ? " is" : "s are"} saved on this phone and waiting to be sent: {o.waiting.map((w) => w.label).join(", ")}.</span><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} onClick={() => { void o.sendNow().then(reload); }}>Send now</button></div>}
      {o.refused.length > 0 && <div role="alert" className="rounded-lg border border-line p-3 text-sm text-fg"><p className="font-bold">These could not be saved:</p><ul className="list-disc ml-5">{o.refused.map((x, i) => <li key={i}>{x.label}: {x.error}</li>)}</ul><button type="button" className="mt-1 text-xs underline" onClick={() => clearRejected()}>I have seen this</button></div>}
      <Status load={fleet}>{(f) => (
        <>
          <RecordPayment vehicles={f.vehicles} drivers={drivers} onDone={reload} />
          <SectionPanel title="What your drivers pay">
            <div className="p-4 space-y-4">
              <p className="text-xs text-fg-subtle">Set what each driver should pay, write down what they pay, and see who is behind. This is your own record: it does not move any money, and it does not change your agreement with the driver.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Owed to you" value={cents(f.measures.arrearsCents)} icon={<span aria-hidden>O</span>} color={COLOR} /><StatCard label="Received this week" value={cents(f.measures.receivedThisWeekCents)} icon={<span aria-hidden>W</span>} color={COLOR} />
                <StatCard label="Received this month" value={cents(f.measures.receivedThisMonthCents)} icon={<span aria-hidden>M</span>} color={COLOR} /><StatCard label="Behind" value={`${f.measures.amber + f.measures.red} of ${f.measures.withTarget}`} icon={<span aria-hidden>B</span>} color={COLOR} />
              </div>
              {f.flags.length > 0 && <ul className="space-y-2">{f.flags.map((x) => <li key={x.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: SEV[x.severity] }}>{SEV_TEXT[x.severity]}</span><span className="flex-1 min-w-[12rem]">{x.message}</span></li>)}</ul>}
              {f.vehicles.length === 0 ? <Empty>Add a vehicle first.</Empty> : (
                <ul className="space-y-3">{f.vehicles.map((v) => (
                  <li key={v.vehicleId} className="text-sm text-fg">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><b>{v.registration}</b>{v.driver ? ` · ${v.driver}` : ""} · {v.target ? `${cents(v.target.amountCents)} ${v.target.period === "weekly" ? "a week" : "a day"}` : "no target"}{v.arrearsCents > 0 ? ` · owes ${cents(v.arrearsCents)}` : v.surplusCents > 0 ? ` · ${cents(v.surplusCents)} ahead` : ""}{v.lastPaymentOn ? ` · last paid ${v.lastPaymentOn}` : ""}</span>
                      <span className="flex items-center gap-2"><Light s={v.status} /><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === v.vehicleId} onClick={() => setOpen(open === v.vehicleId ? null : v.vehicleId)}>{open === v.vehicleId ? "Close" : "Open"}</button></span>
                    </div>
                    {open === v.vehicleId && <div className="mt-3"><VehiclePanel vehicleId={v.vehicleId} drivers={drivers} reloadFleet={reload} /></div>}
                  </li>))}</ul>)}
            </div>
          </SectionPanel>
        </>)}</Status>
    </div>
  );
}
