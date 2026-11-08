import { useState } from "react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, inputCls } from "./ui";
import { sendOrQueue, useOutbox, newRef } from "./offlineQueue";
import { FileButton } from "./AssociationFinance";
import { toCents } from "./OwnerDriverPay";
import { useOwnerAccess } from "./OwnerTeam";

/**
 * The owner's finances (docs/OWNER_DASHBOARD.md, slice D): what each vehicle earned and cost, loans, running costs and fines, and servicing. It is the owner's own bookkeeping: it records and reports, it moves no money, and it is not tax advice.
 * Income is what the owner recorded receiving from drivers. Profit is shown before AND after loan instalments, because an instalment includes repayment of capital and an accountant treats only the interest as an expense.
 * Plain words, large buttons; a cost captured with no signal is kept on the phone and sent once when it returns.
 */
const COLOR = "#0F766E";
const call = portalClient("owner");
const R = (c: number) => (c < 0 ? "-" : "") + rand(Math.abs(c) / 100);
const today = () => new Date().toISOString().slice(0, 10);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-xs text-fg-muted">{label}</span>{children}</label>;
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;
const SEV: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" }, SEV_TEXT: Record<string, string> = { high: "Act now", medium: "Soon", low: "Keep an eye on" };
export const CATEGORIES: [string, string][] = [["fuel", "Fuel"], ["maintenance", "Maintenance and repairs"], ["insurance", "Insurance"], ["tracker", "Tracker fees"], ["fine", "Fine"], ["association", "Association costs"], ["licensing", "Licence fees"], ["tyres", "Tyres"], ["wages", "Wages"], ["other", "Other"]];
const KINDS: [string, string][] = [["service", "Service"], ["repair", "Repair"], ["tyres", "Tyres"], ["brakes", "Brakes"], ["reading", "Odometer reading only"], ["other", "Other"]];
const PERIODS: [string, string][] = [["month", "A month"], ["quarter", "A quarter"], ["year", "A calendar year"], ["tax_year", "Tax year (1 March to end of February)"], ["custom", "Choose the dates"]];
const MAINT_TEXT: Record<string, [string, string]> = { none: ["Nothing recorded", "#6B7280"], ok: ["Up to date", "#15803d"], due_soon: ["Service due soon", "#D97706"], overdue: ["Service overdue", "#C8102E"], no_next: ["No next service set", "#6B7280"] };
const num = (s: string): number | null => { const t = s.replace(/\s/g, ""); return /^\d+$/.test(t) ? Number(t) : null; };
interface Flag { id: string; severity: string; message: string }
interface Veh { vehicleId: string; registration: string }
interface Drv { driverId: string; name: string; status: string }

/** The vehicles and drivers the forms choose from. */
function useChoices() { const [f] = useLoad<{ vehicles: Veh[] }>(() => call("/driver-pay/fleet")), [d] = useLoad<{ drivers: Drv[] }>(() => call("/drivers")); return { vehicles: f.state === "ready" ? f.data.vehicles : [], drivers: d.state === "ready" ? d.data.drivers.filter((x) => x.status === "active") : [] }; }

/* ───────────────────────── overview ───────────────────────── */
function Overview() {
  const [load] = useLoad<{ month: { incomeCents: number; costCents: number; cashProfitCents: number } | null; finance: { activeAgreements: number; owedCents: number; monthlyInstalmentsCents: number }; unpaidFines: { count: number; cents: number }; flags: Flag[] }>(() => call("/finance/overview"));
  return (
    <Status load={load}>{(o) => (
      <SectionPanel title="This month">
        <div className="p-4 space-y-4">
          <p className="text-xs text-fg-subtle">This is your own record of what your vehicles earned and cost. It is not audited and it is not tax advice. Income is what you recorded receiving from drivers.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Received from drivers" value={R(o.month?.incomeCents ?? 0)} icon={<span aria-hidden>I</span>} color={COLOR} /><StatCard label="Running costs" value={R(o.month?.costCents ?? 0)} icon={<span aria-hidden>C</span>} color={COLOR} />
            <StatCard label="Left over after instalments" value={R(o.month?.cashProfitCents ?? 0)} icon={<span aria-hidden>P</span>} color={COLOR} /><StatCard label="Owed to lenders" value={R(o.finance.owedCents)} icon={<span aria-hidden>L</span>} color={COLOR} />
          </div>
          {o.flags.length === 0 ? <Empty>Nothing needs attention.</Empty> : <ul className="space-y-2">{o.flags.map((x) => <li key={x.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[x.severity]}>{SEV_TEXT[x.severity]}</Chip><span className="flex-1 min-w-[12rem]">{x.message}</span></li>)}</ul>}
        </div>
      </SectionPanel>)}</Status>
  );
}

/* ───────────────────────── profit and loss ───────────────────────── */
interface Line { registration: string | null; incomeCents: number; costCents: number; profitBeforeFinanceCents: number; instalmentCents: number; cashProfitCents: number; costs: { label: string; cents: number }[] }
interface Profit { period: { label: string; from: string; to: string }; vehicles: Line[]; unallocated: Line; fleet: Line & { marginPercent: number | null }; changeCents: number; previous: { fleet: { cashProfitCents: number } }; months: { month: string; incomeCents: number; costCents: number; cashProfitCents: number }[] }
function ProfitPanel() {
  const [p, setP] = useState({ period: "month", on: today(), from: "", to: "" }), qs = new URLSearchParams({ period: p.period, ...(p.on ? { on: p.on } : {}), ...(p.period === "custom" ? { from: p.from, to: p.to } : {}) }).toString();
  const [load] = useLoad<Profit>(() => (p.period === "custom" && (!p.from || !p.to) ? Promise.resolve({ error: "Choose the first and last day." } as never) : call(`/finance/profit?${qs}`)), [qs]);
  return (
    <SectionPanel title="Profit and loss">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period"><select aria-label="Profit period" className={inputCls + " mt-1 w-64 py-3"} value={p.period} onChange={(e) => setP({ ...p, period: e.target.value })}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {p.period !== "custom" ? <Field label="Which one (any day in it)"><input type="date" aria-label="Profit on" className={inputCls + " mt-1 w-44 py-3"} value={p.on} onChange={(e) => setP({ ...p, on: e.target.value })} /></Field> : <><Field label="From"><input type="date" aria-label="Profit from" className={inputCls + " mt-1 w-44 py-3"} value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></Field><Field label="To"><input type="date" aria-label="Profit to" className={inputCls + " mt-1 w-44 py-3"} value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></Field></>}
        </div>
        <Status load={load}>{(r) => (
          <>
            <h4 className="text-sm font-bold text-fg">{r.period.label}</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Received from drivers" value={R(r.fleet.incomeCents)} icon={<span aria-hidden>I</span>} color={COLOR} /><StatCard label="Running costs" value={R(r.fleet.costCents)} icon={<span aria-hidden>C</span>} color={COLOR} />
              <StatCard label="Profit before loan instalments" value={R(r.fleet.profitBeforeFinanceCents)} icon={<span aria-hidden>B</span>} color={COLOR} /><StatCard label="Left over after instalments" value={R(r.fleet.cashProfitCents)} icon={<span aria-hidden>P</span>} color={COLOR} />
            </div>
            <p className="text-sm text-fg">{r.fleet.marginPercent === null ? "No income was recorded in this period." : `You kept ${r.fleet.marginPercent}% of what you received.`} {r.changeCents >= 0 ? "Up" : "Down"} {R(Math.abs(r.changeCents))} on the period before ({R(r.previous.fleet.cashProfitCents)}).</p>
            <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><caption className="text-left text-xs font-bold uppercase text-fg-muted mb-1">Each vehicle</caption><thead><tr className="text-left text-xs text-fg-muted"><th className="pr-3">Vehicle</th><th className="pr-3">Received</th><th className="pr-3">Costs</th><th className="pr-3">Instalments</th><th>Left over</th></tr></thead>
              <tbody>{[...r.vehicles, ...(r.unallocated.costCents > 0 ? [{ ...r.unallocated, registration: "Not tied to a vehicle" }] : [])].map((v) => <tr key={v.registration} className="border-t border-line/60"><td className="pr-3">{v.registration}</td><td className="pr-3">{R(v.incomeCents)}</td><td className="pr-3">{R(v.costCents)}</td><td className="pr-3">{R(v.instalmentCents)}</td><td>{R(v.cashProfitCents)}</td></tr>)}</tbody></table></div>
            {r.fleet.costs.length > 0 && <ul className="text-sm text-fg space-y-1"><li className="text-xs font-bold uppercase text-fg-muted">Costs by kind</li>{r.fleet.costs.map((c) => <li key={c.label}>{c.label}: {R(c.cents)}</li>)}</ul>}
            <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><caption className="text-left text-xs font-bold uppercase text-fg-muted mb-1">The last twelve months</caption><thead><tr className="text-left text-xs text-fg-muted"><th className="pr-3">Month</th><th className="pr-3">Received</th><th className="pr-3">Costs</th><th>Left over</th></tr></thead><tbody>{r.months.map((m) => <tr key={m.month} className="border-t border-line/60"><td className="pr-3">{m.month}</td><td className="pr-3">{R(m.incomeCents)}</td><td className="pr-3">{R(m.costCents)}</td><td>{R(m.cashProfitCents)}</td></tr>)}</tbody></table></div>
            <div className="flex flex-wrap gap-2">
              <FileButton segment="owner" path={`/finance/export/profit.pdf?${qs}`} filename="profit-and-loss.pdf" label="Download as PDF" /><FileButton segment="owner" path={`/finance/export/profit.csv?${qs}`} filename="profit-and-loss.csv" label="Download as a spreadsheet" /><FileButton segment="owner" path={`/finance/export/costs.csv?${qs}`} filename="costs.csv" label="Download the costs" /><FileButton segment="owner" path="/finance/export/loans.csv" filename="vehicle-finance.csv" label="Download the loans" />
            </div>
            <p className="text-xs text-fg-subtle">A loan instalment includes repayment of capital. For tax, an accountant treats only the interest as an expense, so profit is shown before and after instalments. Give these to your accountant: they are your records, not audited accounts.</p>
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}

/* ───────────────────────── costs and fines ───────────────────────── */
interface Cost { id: string; vehicle: string | null; driver: string | null; category: string; amountCents: number; incurredOn: string; payee: string | null; reference: string | null; fineStatus: string | null; fromMaintenance: boolean }
function CostsPanel() {
  const { vehicles, drivers } = useChoices(), [filter, setFilter] = useState(""), [load, reload] = useLoad<{ costs: Cost[] }>(() => call(`/finance/costs${filter ? `?vehicleId=${filter}` : ""}`), [filter]), o = useOutbox(call);
  const [f, setF] = useState({ vehicleId: "", category: "fuel", amount: "", incurredOn: today(), payee: "", reference: "", driverId: "", note: "" }), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false), [voiding, setVoiding] = useState<string | null>(null), [why, setWhy] = useState("");
  const add = async () => {
    const c = toCents(f.amount); if (c === null) return setMsg({ ok: false, text: "Type the amount in rand, for example 600 or 600.50." }); setBusy(true); setMsg(null);
    const r = await sendOrQueue(call, { method: "POST", path: "/finance/costs", label: `Cost of ${R(c)}`, body: { category: f.category, amountCents: c, incurredOn: f.incurredOn, ...(f.vehicleId ? { vehicleId: f.vehicleId } : {}), ...(f.payee.trim() ? { payee: f.payee.trim() } : {}), ...(f.reference.trim() ? { reference: f.reference.trim() } : {}), ...(f.note.trim() ? { note: f.note.trim() } : {}), ...(f.category === "fine" && f.driverId ? { driverId: f.driverId } : {}), clientRef: newRef("cost") } }); setBusy(false);
    if (r.status === "error") return setMsg({ ok: false, text: r.error }); setMsg({ ok: true, text: r.status === "queued" ? "Saved on this phone. It will be sent when you are online." : "Saved." }); setF({ ...f, amount: "", payee: "", reference: "", note: "" }); reload();
  };
  return (
    <div className="space-y-4">
      {o.waiting.length > 0 && <div role="status" className="rounded-lg border border-line p-3 text-sm text-fg flex flex-wrap items-center justify-between gap-2"><span>{o.waiting.length} cost{o.waiting.length === 1 ? " is" : "s are"} saved on this phone and waiting to be sent.</span><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} onClick={() => { void o.sendNow().then(reload); }}>Send now</button></div>}
      <SectionPanel title="Write down a cost">
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Which vehicle"><select aria-label="Cost vehicle" className={inputCls + " mt-1 w-52 py-3"} value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">The whole business</option>{vehicles.map((v) => <option key={v.vehicleId} value={v.vehicleId}>{v.registration}</option>)}</select></Field>
            <Field label="What for"><select aria-label="Cost kind" className={inputCls + " mt-1 w-56 py-3"} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Amount (rand)"><input aria-label="Cost amount" inputMode="decimal" className={inputCls + " mt-1 w-36 py-3 text-base"} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Paid on"><input type="date" aria-label="Cost date" max={today()} className={inputCls + " mt-1 w-44 py-3"} value={f.incurredOn} onChange={(e) => setF({ ...f, incurredOn: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Paid to"><input aria-label="Cost payee" maxLength={120} className={inputCls + " mt-1 w-52"} value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} /></Field>
            <Field label="Reference or notice number"><input aria-label="Cost reference" maxLength={60} className={inputCls + " mt-1 w-48"} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
            {f.category === "fine" && <Field label="Which driver"><select aria-label="Fine driver" className={inputCls + " mt-1 w-48"} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}><option value="">Not known</option>{drivers.map((d) => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}</select></Field>}
            <button type="button" disabled={busy} onClick={add} className="px-6 py-3 rounded-lg text-base font-bold text-white disabled:opacity-60" style={{ background: COLOR }}>{busy ? "Saving…" : "Save the cost"}</button>
          </div>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
        </div>
      </SectionPanel>
      <SectionPanel title="Costs and fines">
        <div className="p-4 space-y-3">
          <Field label="Show"><select aria-label="Costs filter" className={inputCls + " mt-1 w-52"} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Every vehicle</option>{vehicles.map((v) => <option key={v.vehicleId} value={v.vehicleId}>{v.registration}</option>)}</select></Field>
          <Status load={load}>{({ costs }) => costs.length === 0 ? <Empty>No costs recorded.</Empty> : (
            <ul className="space-y-2 text-sm text-fg">{costs.map((c) => (
              <li key={c.id} className="border-b border-line/60 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{R(c.amountCents)}</b> · {CATEGORIES.find(([k]) => k === c.category)?.[1]} · {c.vehicle ?? "Whole business"} · {c.incurredOn}{c.payee ? ` · ${c.payee}` : ""}{c.reference ? ` · ${c.reference}` : ""}{c.driver ? ` · driver ${c.driver}` : ""}{c.fineStatus ? ` · ${c.fineStatus === "unpaid" ? "Not paid yet" : c.fineStatus === "paid" ? "Paid" : "Disputed (not counted yet)"}` : ""}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {c.fineStatus && (["unpaid", "paid", "disputed"] as const).filter((s) => s !== c.fineStatus).map((s) => <ActionButton key={s} small label={`Mark ${s === "unpaid" ? "not paid" : s} (${c.reference ?? c.incurredOn})`} color="#6B7280" onRun={async () => { const r = await call(`/finance/costs/${c.id}/fine-status`, { method: "PUT", body: { status: s } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />)}
                    {c.fromMaintenance ? <span className="text-xs text-fg-muted">From the maintenance log</span> : voiding === c.id ? <span className="flex flex-wrap items-center gap-2"><input aria-label="Reason for cancelling the cost" maxLength={200} className={inputCls + " w-56"} placeholder="Why is this wrong?" value={why} onChange={(e) => setWhy(e.target.value)} /><ActionButton small label="Cancel this cost" color="#C8102E" onRun={async () => { const r = await call(`/finance/costs/${c.id}/void`, { method: "POST", body: { reason: why } }); if ("error" in r) return { error: r.error }; setVoiding(null); setWhy(""); reload(); return undefined; }} /></span> : <button type="button" className="text-xs underline" onClick={() => setVoiding(c.id)}>Entered by mistake?</button>}
                  </span>
                </div>
              </li>))}</ul>)}</Status>
        </div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── loans ───────────────────────── */
interface Loan { id: string; registration: string; lender: string; reference: string | null; originalCents: number; balanceCents: number; balanceOn: string; instalmentCents: number; dueDay: number; status: string; nextDueOn: string | null; lastPaidOn: string | null; instalmentsLeft: number; missingInstalment: boolean; payments: { id: string; amountCents: number; paidOn: string; voided: boolean }[] }
function LoanRow({ l, reload }: { l: Loan; reload: () => void }) {
  const [inst, setInst] = useState({ amount: String(l.instalmentCents / 100), paidOn: today() }), [bal, setBal] = useState({ amount: "", on: today() });
  return (
    <div className="space-y-3 rounded-lg border border-line p-4 text-sm text-fg">
      <p><b>{l.registration}</b> · {l.lender}{l.reference ? ` · ${l.reference}` : ""} · {l.status === "active" ? <>owes <b>{R(l.balanceCents)}</b> (as the lender said on {l.balanceOn}) · {R(l.instalmentCents)} on day {l.dueDay} of the month · next {l.nextDueOn}{l.instalmentsLeft > 0 ? ` · about ${l.instalmentsLeft} instalments left (a rough guess: it ignores interest)` : ""}</> : "Settled"}</p>
      {l.missingInstalment && <p className="text-bad">The last instalment has not been written down.</p>}
      {l.status === "active" && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Instalment paid (rand)"><input aria-label={`Instalment amount ${l.registration}`} inputMode="decimal" className={inputCls + " mt-1 w-32"} value={inst.amount} onChange={(e) => setInst({ ...inst, amount: e.target.value })} /></Field>
            <Field label="Paid on"><input type="date" aria-label={`Instalment date ${l.registration}`} max={today()} className={inputCls + " mt-1 w-44"} value={inst.paidOn} onChange={(e) => setInst({ ...inst, paidOn: e.target.value })} /></Field>
            <ActionButton small label={`Write down the instalment for ${l.registration}`} color={COLOR} onRun={async () => { const c = toCents(inst.amount); if (c === null) return { error: "Type the amount in rand." }; const r = await call(`/finance/loans/${l.id}/instalments`, { method: "POST", body: { amountCents: c, paidOn: inst.paidOn, clientRef: newRef("inst") } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="What the lender says you owe now (rand)"><input aria-label={`New balance ${l.registration}`} inputMode="decimal" className={inputCls + " mt-1 w-40"} value={bal.amount} onChange={(e) => setBal({ ...bal, amount: e.target.value })} /></Field>
            <Field label="As at"><input type="date" aria-label={`Balance date ${l.registration}`} max={today()} className={inputCls + " mt-1 w-44"} value={bal.on} onChange={(e) => setBal({ ...bal, on: e.target.value })} /></Field>
            <ActionButton small label={`Update what is owed for ${l.registration}`} color="#6B7280" onRun={async () => { const t = bal.amount.trim() === "0" ? 0 : toCents(bal.amount); if (t === null) return { error: "Type the amount in rand (0 if nothing is owed)." }; const r = await call(`/finance/loans/${l.id}/balance`, { method: "PUT", body: { balanceCents: t, balanceOn: bal.on } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." }; }} />
            <ActionButton small label={`It is paid off: ${l.registration}`} color="#6B7280" onRun={async () => { const r = await call(`/finance/loans/${l.id}/settle`, { method: "POST", body: { settledOn: today() } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />
          </div>
        </>)}
      {l.payments.length > 0 && <ul className="text-xs text-fg-muted space-y-1">{l.payments.slice(0, 6).map((p) => <li key={p.id} className={p.voided ? "line-through" : ""}>{p.paidOn} · {R(p.amountCents)}{p.voided ? " (cancelled)" : ""}</li>)}</ul>}
    </div>
  );
}
function LoansPanel() {
  const { vehicles } = useChoices(), [load, reload] = useLoad<{ finances: Loan[]; measures: { owedCents: number; monthlyInstalmentsCents: number } }>(() => call("/finance/loans"));
  const [f, setF] = useState({ vehicleId: "", lender: "", reference: "", original: "", balance: "", balanceOn: today(), instalment: "", dueDay: "", startDate: "" });
  return (
    <div className="space-y-4">
      <SectionPanel title="Loans on your vehicles">
        <div className="p-4 space-y-3">
          <p className="text-xs text-fg-subtle">What you owe is what the lender last told you, as at a date. It is not worked out from your instalments, because an instalment includes interest.</p>
          <Status load={load}>{({ finances, measures }) => finances.length === 0 ? <Empty>No loan is recorded.</Empty> : <><p className="text-sm text-fg">Owed in all: <b>{R(measures.owedCents)}</b> · instalments each month: <b>{R(measures.monthlyInstalmentsCents)}</b></p>{finances.map((l) => <LoanRow key={l.id} l={l} reload={reload} />)}</>}</Status>
        </div>
      </SectionPanel>
      <SectionPanel title="Add a loan">
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Which vehicle"><select aria-label="Loan vehicle" className={inputCls + " mt-1 w-52 py-3"} value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">Choose</option>{vehicles.map((v) => <option key={v.vehicleId} value={v.vehicleId}>{v.registration}</option>)}</select></Field>
            <Field label="Lender"><input aria-label="Loan lender" maxLength={100} className={inputCls + " mt-1 w-48"} value={f.lender} onChange={(e) => setF({ ...f, lender: e.target.value })} /></Field>
            <Field label="Agreement number"><input aria-label="Loan reference" maxLength={60} className={inputCls + " mt-1 w-44"} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Amount borrowed (rand)"><input aria-label="Loan original" inputMode="decimal" className={inputCls + " mt-1 w-40"} value={f.original} onChange={(e) => setF({ ...f, original: e.target.value })} /></Field>
            <Field label="Owed now (rand)"><input aria-label="Loan balance" inputMode="decimal" className={inputCls + " mt-1 w-40"} value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} /></Field>
            <Field label="As at"><input type="date" aria-label="Loan balance date" max={today()} className={inputCls + " mt-1 w-44"} value={f.balanceOn} onChange={(e) => setF({ ...f, balanceOn: e.target.value })} /></Field>
            <Field label="Monthly instalment (rand)"><input aria-label="Loan instalment" inputMode="decimal" className={inputCls + " mt-1 w-40"} value={f.instalment} onChange={(e) => setF({ ...f, instalment: e.target.value })} /></Field>
            <Field label="Due on day of the month"><input aria-label="Loan due day" inputMode="numeric" className={inputCls + " mt-1 w-28"} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} /></Field>
            <Field label="Started on"><input type="date" aria-label="Loan start" className={inputCls + " mt-1 w-44"} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          </div>
          <ActionButton label="Add the loan" color={COLOR} onRun={async () => {
            const orig = toCents(f.original), inst = toCents(f.instalment), bal = f.balance.trim() === "0" ? 0 : toCents(f.balance), day = num(f.dueDay); if (!f.vehicleId) return { error: "Choose the vehicle." }; if (orig === null || inst === null || bal === null) return { error: "Type the amounts in rand, for example 450000. If nothing is owed now, type 0." }; if (day === null) return { error: "Type the day of the month it is due, from 1 to 31." };
            const r = await call("/finance/loans", { method: "POST", body: { vehicleId: f.vehicleId, lender: f.lender, originalCents: orig, balanceCents: bal, balanceOn: f.balanceOn, instalmentCents: inst, dueDay: day, startDate: f.startDate, ...(f.reference.trim() ? { reference: f.reference.trim() } : {}) } }); if ("error" in r) return { error: r.error }; setF({ ...f, lender: "", reference: "", original: "", balance: "", instalment: "", dueDay: "" }); reload(); return { message: "Added." };
          }} />
        </div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── maintenance ───────────────────────── */
interface Mnt { id: string; vehicle: string; servicedOn: string; kind: string; description: string | null; odometerKm: number | null; nextDueOn: string | null; nextDueKm: number | null; costCents: number }
function MaintenancePanel() {
  const { vehicles } = useChoices(), [st] = useLoad<{ vehicles: { vehicleId: string; registration: string; status: string; lastServiceOn: string | null; odometerKm: number | null; nextDueOn: string | null; nextDueKm: number | null }[] }>(() => call("/finance/maintenance/status")), [log, reload] = useLoad<{ entries: Mnt[] }>(() => call("/finance/maintenance"));
  const [f, setF] = useState({ vehicleId: "", kind: "service", servicedOn: today(), odometer: "", cost: "", nextDueOn: "", nextDueKm: "", description: "" }), [voiding, setVoiding] = useState<string | null>(null), [why, setWhy] = useState("");
  return (
    <div className="space-y-4">
      <SectionPanel title="Servicing">
        <div className="p-4 space-y-3">
          <Status load={st}>{({ vehicles: vs }) => vs.length === 0 ? <Empty>Add a vehicle first.</Empty> : <ul className="space-y-1 text-sm text-fg">{vs.map((v) => <li key={v.vehicleId} className="flex flex-wrap items-center gap-2"><Chip color={MAINT_TEXT[v.status][1]}>{MAINT_TEXT[v.status][0]}</Chip><span><b>{v.registration}</b>{v.lastServiceOn ? ` · last done ${v.lastServiceOn}` : ""}{v.odometerKm !== null ? ` · ${v.odometerKm.toLocaleString("en-ZA")} km` : ""}{v.nextDueOn ? ` · next by ${v.nextDueOn}` : ""}{v.nextDueKm !== null ? ` · or at ${v.nextDueKm.toLocaleString("en-ZA")} km` : ""}</span></li>)}</ul>}</Status>
        </div>
      </SectionPanel>
      <SectionPanel title="Write down a service or repair">
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Which vehicle"><select aria-label="Service vehicle" className={inputCls + " mt-1 w-52 py-3"} value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">Choose</option>{vehicles.map((v) => <option key={v.vehicleId} value={v.vehicleId}>{v.registration}</option>)}</select></Field>
            <Field label="What was done"><select aria-label="Service kind" className={inputCls + " mt-1 w-56 py-3"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="On"><input type="date" aria-label="Service date" max={today()} className={inputCls + " mt-1 w-44 py-3"} value={f.servicedOn} onChange={(e) => setF({ ...f, servicedOn: e.target.value })} /></Field>
            <Field label="Odometer now (km)"><input aria-label="Service odometer" inputMode="numeric" className={inputCls + " mt-1 w-36 py-3"} value={f.odometer} onChange={(e) => setF({ ...f, odometer: e.target.value })} /></Field>
          </div>
          {f.kind !== "reading" && <div className="flex flex-wrap items-end gap-3">
            <Field label="What it cost (rand)"><input aria-label="Service cost" inputMode="decimal" className={inputCls + " mt-1 w-36"} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
            <Field label="Next service by (date)"><input type="date" aria-label="Service next date" className={inputCls + " mt-1 w-44"} value={f.nextDueOn} onChange={(e) => setF({ ...f, nextDueOn: e.target.value })} /></Field>
            <Field label="Or at (km)"><input aria-label="Service next km" inputMode="numeric" className={inputCls + " mt-1 w-36"} value={f.nextDueKm} onChange={(e) => setF({ ...f, nextDueKm: e.target.value })} /></Field>
            <Field label="What was done (notes)"><input aria-label="Service notes" maxLength={200} className={inputCls + " mt-1 w-60"} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          </div>}
          <ActionButton label="Save it" color={COLOR} onRun={async () => {
            if (!f.vehicleId) return { error: "Choose the vehicle." }; const km = f.odometer.trim() ? num(f.odometer) : null, nk = f.nextDueKm.trim() ? num(f.nextDueKm) : null, cost = f.cost.trim() ? toCents(f.cost) : null; if (f.odometer.trim() && km === null) return { error: "Type the odometer as a whole number of kilometres." }; if (f.nextDueKm.trim() && nk === null) return { error: "Type the next service as a whole number of kilometres." }; if (f.cost.trim() && cost === null) return { error: "Type the cost in rand." };
            const r = await call("/finance/maintenance", { method: "POST", body: { vehicleId: f.vehicleId, kind: f.kind, servicedOn: f.servicedOn, ...(km !== null ? { odometerKm: km } : {}), ...(f.kind !== "reading" && cost !== null ? { costCents: cost } : {}), ...(f.kind !== "reading" && f.nextDueOn ? { nextDueOn: f.nextDueOn } : {}), ...(f.kind !== "reading" && nk !== null ? { nextDueKm: nk } : {}), ...(f.kind !== "reading" && f.description.trim() ? { description: f.description.trim() } : {}) } }); if ("error" in r) return { error: r.error }; setF({ ...f, odometer: "", cost: "", nextDueOn: "", nextDueKm: "", description: "" }); reload(); return { message: "Saved." };
          }} />
        </div>
      </SectionPanel>
      <SectionPanel title="What has been done">
        <div className="p-4"><Status load={log}>{({ entries }) => entries.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
              <span>{e.servicedOn} · <b>{e.vehicle}</b> · {KINDS.find(([k]) => k === e.kind)?.[1]}{e.description ? ` · ${e.description}` : ""}{e.odometerKm !== null ? ` · ${e.odometerKm.toLocaleString("en-ZA")} km` : ""}{e.costCents > 0 ? ` · ${R(e.costCents)}` : ""}</span>
              {voiding === e.id ? <span className="flex flex-wrap items-center gap-2"><input aria-label="Reason for cancelling the entry" maxLength={200} className={inputCls + " w-56"} placeholder="Why is this wrong?" value={why} onChange={(x) => setWhy(x.target.value)} /><ActionButton small label="Cancel this entry" color="#C8102E" onRun={async () => { const r = await call(`/finance/maintenance/${e.id}/void`, { method: "POST", body: { reason: why } }); if ("error" in r) return { error: r.error }; setVoiding(null); setWhy(""); reload(); return undefined; }} /></span> : <button type="button" className="text-xs underline" onClick={() => setVoiding(e.id)}>{`Entered by mistake? (${e.servicedOn} ${e.vehicle})`}</button>}
            </li>))}</ul>)}</Status></div>
      </SectionPanel>
    </div>
  );
}

/* ───────────────────────── planner ───────────────────────── */
interface PlanResult { verdict: { colour: string; text: string }; loan: { amountCents: number; instalmentCents: number; totalRepayableCents: number; totalInterestCents: number }; monthly: { incomeCents: number; incomeFrom: string; costsCents: number; costsFrom: string; beforeFinanceCents: number; instalmentCents: number; netCents: number; coverage: number | null }; cashNeededNowCents: number; paybackMonths: number | null; breakEvenIncomeCents: number; breakEvenWeeklyCents: number; stress: { percent: number; incomeCents: number; netCents: number }[]; businessAfter: { monthlyCashProfitNowCents: number; monthlyCashProfitWithItCents: number }; history: { months: number; from: string | null; to: string | null; vehicles: number }; notes: string[] }
const COLOUR: Record<string, [string, string]> = { green: ["#15803d", "Comfortable"], amber: ["#D97706", "Tight"], red: ["#C8102E", "Does not pay for itself"] };
function PlannerPanel() {
  const [f, setF] = useState({ price: "", deposit: "", upfront: "", rate: "", term: "", income: "", costs: "", lookback: "6" }), [res, setRes] = useState<PlanResult | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const run = async () => {
    setErr(null); setRes(null); const price = toCents(f.price), deposit = f.deposit.trim() ? (f.deposit.trim() === "0" ? 0 : toCents(f.deposit)) : 0, upfront = f.upfront.trim() ? (f.upfront.trim() === "0" ? 0 : toCents(f.upfront)) : 0, income = f.income.trim() ? toCents(f.income) : undefined, costs = f.costs.trim() ? (f.costs.trim() === "0" ? 0 : toCents(f.costs)) : undefined;
    if (price === null) return setErr("Type the price of the vehicle in rand, for example 300000."); if (deposit === null || upfront === null || income === null || costs === null) return setErr("Type each amount in rand, for example 50000. Leave a box empty if you do not know."); if (deposit > price) return setErr("The deposit cannot be more than the price.");
    const loan = price - deposit > 0, rate = f.rate.trim().replace(",", "."), term = num(f.term); if (loan && !/^\d+(\.\d{1,2})?$/.test(rate)) return setErr("Type the yearly interest rate from your quote, for example 12 or 13.75. This planner never guesses a rate."); if (loan && (term === null || term < 1)) return setErr("Type the number of months of the loan, for example 60.");
    const q = new URLSearchParams({ priceCents: String(price), depositCents: String(deposit), upfrontCostsCents: String(upfront), lookbackMonths: f.lookback, ...(loan ? { ratePercent: rate, termMonths: String(term) } : {}), ...(income !== undefined ? { expectedIncomeCents: String(income) } : {}), ...(costs !== undefined ? { expectedCostsCents: String(costs) } : {}) });
    setBusy(true); const r = await call<PlanResult>(`/finance/planner?${q}`); setBusy(false); if ("error" in r) return setErr(r.error); setRes(r.data as unknown as PlanResult);
  };
  const field = (k: keyof typeof f, label: string, aria: string, w = "w-40", hint?: string) => <label className="block"><span className="text-xs text-fg-muted">{label}</span><input aria-label={aria} inputMode="decimal" className={inputCls + ` mt-1 ${w} py-3`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />{hint && <span className="block text-[11px] text-fg-subtle">{hint}</span>}</label>;
  return (
    <div className="space-y-4">
      <SectionPanel title="Can I afford another vehicle?">
        <div className="p-4 space-y-4">
          <p className="text-sm text-fg">Work out what one more vehicle would do to your profit before you buy it. It uses your own recorded figures, and the interest rate and loan term you type in from a real quote. It is a plan, not advice and not what a lender would approve, and it records nothing.</p>
          <div className="flex flex-wrap items-end gap-3">{field("price", "Price of the vehicle (rand)", "Planner price")}{field("deposit", "Deposit you will pay (rand)", "Planner deposit", "w-40", "Leave empty if none")}{field("upfront", "Costs to get it on the road (rand)", "Planner upfront", "w-44", "Licence, registration, first insurance")}</div>
          <div className="flex flex-wrap items-end gap-3">{field("rate", "Yearly interest rate (%)", "Planner rate", "w-32", "From your quote")}{field("term", "Months to pay", "Planner term", "w-28")}</div>
          <div className="flex flex-wrap items-end gap-3">{field("income", "What a driver would pay each month (rand)", "Planner income", "w-48", "Empty: use your average per vehicle")}{field("costs", "What it would cost to run each month (rand)", "Planner costs", "w-48", "Empty: use your average per vehicle")}
            <label className="block"><span className="text-xs text-fg-muted">Average over the last</span><select aria-label="Planner lookback" className={inputCls + " mt-1 w-40 py-3"} value={f.lookback} onChange={(e) => setF({ ...f, lookback: e.target.value })}><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option></select></label></div>
          <button type="button" disabled={busy} onClick={run} className="px-6 py-3 rounded-lg text-base font-bold text-white disabled:opacity-60" style={{ background: COLOR }}>{busy ? "Working it out…" : "Work it out"}</button>
          {err && <p role="alert" className="text-sm text-bad">{err}</p>}
        </div>
      </SectionPanel>
      {res && (
        <SectionPanel title="What it would do">
          <div className="p-4 space-y-4 text-sm text-fg">
            <p className="flex flex-wrap items-center gap-2"><Chip color={COLOUR[res.verdict.colour][0]}>{COLOUR[res.verdict.colour][1]}</Chip><b>{res.verdict.text}</b></p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Instalment each month" value={R(res.loan.instalmentCents)} icon={<span aria-hidden>I</span>} color={COLOR} /><StatCard label="Left over each month" value={R(res.monthly.netCents)} icon={<span aria-hidden>L</span>} color={COLOR} />
              <StatCard label="Cash needed now" value={R(res.cashNeededNowCents)} icon={<span aria-hidden>C</span>} color={COLOR} /><StatCard label="Needed each month to break even" value={R(res.breakEvenIncomeCents)} icon={<span aria-hidden>B</span>} color={COLOR} />
            </div>
            <ul className="space-y-1">
              <li>It would bring in {R(res.monthly.incomeCents)} a month ({res.monthly.incomeFrom === "you" ? "what you typed" : `your average per vehicle over the last ${res.history.months} months`}) and cost {R(res.monthly.costsCents)} to run ({res.monthly.costsFrom === "you" ? "what you typed" : "your average per vehicle"}).</li>
              {res.loan.amountCents > 0 ? <li>You would borrow {R(res.loan.amountCents)} and pay back {R(res.loan.totalRepayableCents)} in all, which is {R(res.loan.totalInterestCents)} in interest.{res.monthly.coverage !== null ? ` After running costs it earns ${res.monthly.coverage} times its instalment.` : ""}</li> : <li>You would pay for it in cash.</li>}
              <li>{res.paybackMonths === null ? "It would not earn back the cash you put in at these figures." : `It would take about ${res.paybackMonths} months to earn back the ${R(res.cashNeededNowCents)} you put in.`}</li>
              <li>To break even it must bring in {R(res.breakEvenIncomeCents)} a month, which is about {R(res.breakEvenWeeklyCents)} a week from a driver.</li>
              <li>Your business makes {R(res.businessAfter.monthlyCashProfitNowCents)} a month now (after instalments) and would make {R(res.businessAfter.monthlyCashProfitWithItCents)} with it.</li>
            </ul>
            <table className="w-full"><caption className="text-left text-xs font-bold uppercase text-fg-muted mb-1">If it brings in less</caption><thead><tr className="text-left text-xs text-fg-muted"><th className="pr-3">If income is</th><th className="pr-3">It brings in</th><th>It leaves</th></tr></thead><tbody>{res.stress.map((s) => <tr key={s.percent} className="border-t border-line/60"><td className="pr-3">{s.percent}% lower</td><td className="pr-3">{R(s.incomeCents)}</td><td>{R(s.netCents)}</td></tr>)}</tbody></table>
            <ul className="space-y-1 text-xs text-fg-subtle">{res.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </SectionPanel>)}
    </div>
  );
}

const TABS: [string, string, string][] = [["overview", "Overview", "finance"], ["profit", "Profit and loss", "finance"], ["costs", "Costs and fines", "costs"], ["loans", "Loans", "finance"], ["maintenance", "Servicing", "costs"], ["planner", "Planner", "finance"]];
export function OwnerFinanceScreen() {
  const access = useOwnerAccess(), tabs = TABS.filter(([, , m]) => access === null || access.kind === "owner" || !!access.modules[m]), [picked, setTab] = useState("overview"), tab = tabs.some(([k]) => k === picked) ? picked : (tabs[0]?.[0] ?? "overview");                  // a role sees only the tabs it can use
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Finances" className="flex flex-wrap gap-2">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className="px-4 py-3 rounded-lg text-sm font-bold border" style={tab === k ? { background: COLOR, color: "#fff", borderColor: COLOR } : {}} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "overview" && <Overview />}{tab === "profit" && <ProfitPanel />}{tab === "costs" && <CostsPanel />}{tab === "loans" && <LoansPanel />}{tab === "maintenance" && <MaintenancePanel />}{tab === "planner" && <PlannerPanel />}
    </div>
  );
}
