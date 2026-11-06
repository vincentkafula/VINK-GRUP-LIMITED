import { useState } from "react";
import { Scale } from "lucide-react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, when, inputCls } from "./ui";
import { PdfButton } from "./MarshalPay";

/**
 * The association's side of marshal commission and payslips (docs/MARSHAL_COMMISSION.md): the settings and the rules (never edited: a later date supersedes), the audit trail with waivers, the money check,
 * the pay run (prepare, review, issue, record payment), adjustments, each marshal's payslip details, and the queries marshals and drivers raise.
 * Commission is OFF until the association switches it on, and "shadow" calculates without moving any money so it can be compared first.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const money = (cents: number) => rand(cents / 100);
const pct = (bp: number) => `${bp / 100}%`;
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const toBp = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;

interface Settings { mode: string; payableOn: string; payPeriod: string; tiersEnabled: boolean; deductionCapBp: number; uifApplies: boolean; uifRateBp: number }
interface SettingsData { settings: Settings; currentPeriod: { start: string; end: string }; lastFinishedPeriod: { start: string; end: string }; reasons: { code: string; kind: string; label: string }[] }
const MODE_HELP: Record<string, string> = {
  off: "Today's behaviour: the marshal fee goes to the marshal. Nothing here runs.",
  shadow: "Every departure is calculated and recorded, but no money moves, so you can compare it with today's payments first.",
  commission: "Live: the driver pays the trip fee to the association, and the marshal earns a share of it, paid through a payslip.",
};

/* ───────────────────────── settings ───────────────────────── */
function SettingsCard({ data, reload }: { data: SettingsData; reload: () => void }) {
  const s = data.settings;
  const [f, setF] = useState({ mode: s.mode, payableOn: s.payableOn, payPeriod: s.payPeriod, tiersEnabled: s.tiersEnabled, cap: String(s.deductionCapBp / 100), uifApplies: s.uifApplies, uif: String(s.uifRateBp / 100) });
  return (
    <SectionPanel title="Commission settings">
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Commission is"><select className={inputCls + " mt-1 w-40"} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="off">Off</option><option value="shadow">Shadow (calculate only)</option><option value="commission">Live</option></select></Field>
          <Field label="Commission becomes payable"><select className={inputCls + " mt-1 w-64"} value={f.payableOn} onChange={(e) => setF({ ...f, payableOn: e.target.value })}><option value="recorded">When the trip fee is recorded</option><option value="paid">Only when the driver has paid it</option></select></Field>
          <Field label="Pay period"><select className={inputCls + " mt-1 w-36"} value={f.payPeriod} onChange={(e) => setF({ ...f, payPeriod: e.target.value })}><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select></Field>
          <Field label="Most deductions may take (% of a payslip)"><input className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-fg-muted">{MODE_HELP[f.mode]}</p>
        <div className="flex flex-wrap items-center gap-4 text-sm text-fg">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.tiersEnabled} onChange={(e) => setF({ ...f, tiersEnabled: e.target.checked })} />Use tiers (a higher rate after a number of trips in the week)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.uifApplies} onChange={(e) => setF({ ...f, uifApplies: e.target.checked })} />Take UIF from employees</label>
          {f.uifApplies && <Field label="UIF rate (%)"><input className={inputCls + " mt-1 !w-20"} inputMode="decimal" value={f.uif} onChange={(e) => setF({ ...f, uif: e.target.value })} /></Field>}
        </div>
        <ActionButton label="Save settings" color={COLOR} onRun={async () => {
          const r = await call("/commission/settings", { method: "PUT", body: { mode: f.mode, payableOn: f.payableOn, payPeriod: f.payPeriod, tiersEnabled: f.tiersEnabled, deductionCapBp: toBp(f.cap), uifApplies: f.uifApplies, uifRateBp: toBp(f.uif) } });
          if ("error" in r) return { error: r.error }; reload(); return { message: "Saved." };
        }} />
        <p className="text-xs text-fg-subtle">Pay period now: {data.currentPeriod.start} to {data.currentPeriod.end}. Last finished: {data.lastFinishedPeriod.start} to {data.lastFinishedPeriod.end}. Not a tax document: no PAYE is calculated.</p>
      </div>
    </SectionPanel>
  );
}

/* ───────────────────────── rules ───────────────────────── */
interface Rules { feeRules: { id: string; scope: string; rank: string | null; amountCents: number; effectiveFrom: string }[]; rates: { id: string; scope: string; rank: string | null; marshal: string | null; rateBp: number; effectiveFrom: string }[]; tiers: { id: string; rank: string | null; afterTrips: number; rateBp: number; effectiveFrom: string }[] }
function RulesCard({ tiersOn }: { tiersOn: boolean }) {
  const [rules, reload] = useLoad<Rules>(() => call("/commission/rules"));
  const [ranks] = useLoad<{ ranks: { id: string; name: string }[] }>(() => call("/ranks"));
  const [marshals] = useLoad<{ marshals: { id: string; name: string }[] }>(() => call("/commission/marshals"));
  const rk = ranks.state === "ready" ? ranks.data.ranks ?? [] : [], ms = marshals.state === "ready" ? marshals.data.marshals ?? [] : [];
  const [fee, setFee] = useState({ scope: "association", rank: "", amount: "", from: "" }), [rate, setRate] = useState({ scope: "default", rank: "", marshal: "", percent: "", from: "" }), [tier, setTier] = useState({ rank: "", after: "", percent: "", from: "" });
  return (
    <SectionPanel title="Trip fee and commission rate">
      <div className="p-4 space-y-5">
        <Status load={rules}>{(r) => {
          const baseFee = r.feeRules.find((x) => x.scope === "association") ?? null, baseRate = r.rates.find((x) => x.scope === "default") ?? null;
          const fee20 = baseFee?.amountCents ?? 2000;
          return (
            <>
              <p className="text-sm text-fg" aria-live="polite">{baseRate ? <>A day of 20 trips at {money(fee20)} and {pct(baseRate.rateBp)} pays the marshal <b>{money(20 * Math.floor((fee20 * baseRate.rateBp + 5000) / 10000))}</b>.</> : "No commission rate is set yet. Set one below before switching commission on."}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Trip fee rules</h4>{r.feeRules.length === 0 ? <p className="text-xs text-fg-muted">None: the association's marshal fee, or R20.00, applies.</p> : <ul className="text-sm text-fg space-y-1">{r.feeRules.map((x) => <li key={x.id}>{money(x.amountCents)} · {x.scope === "rank" ? x.rank : x.scope} · from {x.effectiveFrom}</li>)}</ul>}</div>
                <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Commission rates</h4>{r.rates.length === 0 ? <p className="text-xs text-fg-muted">None yet.</p> : <ul className="text-sm text-fg space-y-1">{r.rates.map((x) => <li key={x.id}>{pct(x.rateBp)} · {x.scope === "marshal" ? x.marshal : x.scope === "rank" ? x.rank : "everyone"} · from {x.effectiveFrom}</li>)}</ul>}</div>
              </div>
              {r.tiers.length > 0 && <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Tiers</h4><ul className="text-sm text-fg space-y-1">{r.tiers.map((x) => <li key={x.id}>{pct(x.rateBp)} after {x.afterTrips} trips in the week · {x.rank ?? "all ranks"} · from {x.effectiveFrom}</li>)}</ul></div>}
            </>);
        }}</Status>
        <p className="text-xs text-fg-subtle">Rules are never edited: add a new one with a later date, and trips already calculated keep the rule they were calculated with.</p>
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <Field label="Trip fee applies to"><select className={inputCls + " mt-1 w-40"} value={fee.scope} onChange={(e) => setFee({ ...fee, scope: e.target.value })}><option value="association">The association</option><option value="rank">One rank</option></select></Field>
          {fee.scope === "rank" && <Field label="Rank"><select aria-label="Fee rank" className={inputCls + " mt-1 w-40"} value={fee.rank} onChange={(e) => setFee({ ...fee, rank: e.target.value })}><option value="">Choose</option>{rk.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
          <Field label="Trip fee (R)"><input className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={fee.amount} onChange={(e) => setFee({ ...fee, amount: e.target.value })} /></Field>
          <Field label="From"><input type="date" aria-label="Fee from" className={inputCls + " mt-1 w-40"} value={fee.from} onChange={(e) => setFee({ ...fee, from: e.target.value })} /></Field>
          <ActionButton small label="Add trip fee" color={COLOR} onRun={async () => { const r = await call("/commission/fee-rules", { method: "POST", body: { scope: fee.scope, rankId: fee.scope === "rank" ? fee.rank : undefined, amountCents: toCents(fee.amount), effectiveFrom: fee.from } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Added." }; }} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Commission rate applies to"><select className={inputCls + " mt-1 w-40"} value={rate.scope} onChange={(e) => setRate({ ...rate, scope: e.target.value })}><option value="default">Everyone</option><option value="rank">One rank</option><option value="marshal">One marshal</option></select></Field>
          {rate.scope === "rank" && <Field label="Rank"><select aria-label="Rate rank" className={inputCls + " mt-1 w-40"} value={rate.rank} onChange={(e) => setRate({ ...rate, rank: e.target.value })}><option value="">Choose</option>{rk.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
          {rate.scope === "marshal" && <Field label="Marshal"><select aria-label="Rate marshal" className={inputCls + " mt-1 w-40"} value={rate.marshal} onChange={(e) => setRate({ ...rate, marshal: e.target.value })}><option value="">Choose</option>{ms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
          <Field label="Rate (% of the trip fee)"><input className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={rate.percent} onChange={(e) => setRate({ ...rate, percent: e.target.value })} /></Field>
          <Field label="From"><input type="date" aria-label="Rate from" className={inputCls + " mt-1 w-40"} value={rate.from} onChange={(e) => setRate({ ...rate, from: e.target.value })} /></Field>
          <ActionButton small label="Add rate" color={COLOR} onRun={async () => { const r = await call("/commission/rates", { method: "POST", body: { scope: rate.scope, rankId: rate.scope === "rank" ? rate.rank : undefined, marshalId: rate.scope === "marshal" ? rate.marshal : undefined, rateBp: toBp(rate.percent), effectiveFrom: rate.from } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Added." }; }} />
        </div>
        {tiersOn && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="A higher rate after (trips in the week)"><input aria-label="Tier after" className={inputCls + " mt-1 !w-24"} inputMode="numeric" value={tier.after} onChange={(e) => setTier({ ...tier, after: e.target.value })} /></Field>
            <Field label="Tier rate (%)"><input aria-label="Tier rate" className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={tier.percent} onChange={(e) => setTier({ ...tier, percent: e.target.value })} /></Field>
            <Field label="From"><input type="date" aria-label="Tier from" className={inputCls + " mt-1 w-40"} value={tier.from} onChange={(e) => setTier({ ...tier, from: e.target.value })} /></Field>
            <ActionButton small label="Add tier" color={COLOR} onRun={async () => { const r = await call("/commission/tiers", { method: "POST", body: { afterTrips: Number(tier.after), rateBp: toBp(tier.percent), effectiveFrom: tier.from } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Added." }; }} />
          </div>)}
      </div>
    </SectionPanel>
  );
}

/* ───────────────────────── the audit trail and waivers ───────────────────────── */
interface AuditTrip { departureId: string; time: string; rank: string; marshal: string; registration: string; driver: string | null; mode: string; feeCents: number; rateBp: number; commissionCents: number; reversed: boolean; feeStatus: string }
function AuditCard({ reasons }: { reasons: { code: string; kind: string; label: string }[] }) {
  const [load, reload] = useLoad<{ trips: AuditTrip[] }>(() => call("/commission/trips"));
  const [waiving, setWaiving] = useState<string | null>(null), [why, setWhy] = useState({ code: "", text: "", absorb: false });
  const feeReasons = reasons.filter((r) => r.kind === "fee");
  return (
    <SectionPanel title="Trips and what they earned (last 7 days)">
      <div className="p-4"><Status load={load}>{({ trips }) => trips.length === 0 ? <Empty>No calculated trips yet.</Empty> : (
        <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-2 pr-3">When</th><th className="pr-3">Marshal</th><th className="pr-3">Vehicle</th><th className="pr-3 text-right">Fee</th><th className="pr-3 text-right">Rate</th><th className="pr-3 text-right">Commission</th><th className="pr-3">Fee</th><th /></tr></thead>
          <tbody>{trips.map((t) => (
            <tr key={t.departureId} className="border-b border-line/60 align-top"><td className="py-2 pr-3">{when(t.time)}</td><td className="pr-3">{t.marshal}</td><td className="pr-3">{t.registration}</td><td className="pr-3 text-right">{money(t.feeCents)}</td><td className="pr-3 text-right">{pct(t.rateBp)}</td><td className="pr-3 text-right font-bold">{money(t.commissionCents)}{t.reversed ? " (reversed)" : ""}</td><td className="pr-3">{t.mode === "shadow" ? "shadow" : t.feeStatus}</td>
              <td>{t.feeStatus === "owed" && !t.reversed && <button type="button" className="text-xs underline" onClick={() => setWaiving(waiving === t.departureId ? null : t.departureId)}>Waive</button>}
                {waiving === t.departureId && (
                  <div className="mt-2 space-y-2 min-w-[14rem]">
                    <select aria-label="Reason" className={inputCls} value={why.code} onChange={(e) => setWhy({ ...why, code: e.target.value })}><option value="">Reason</option>{feeReasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
                    <input aria-label="Say why" className={inputCls} placeholder="Say why" maxLength={200} value={why.text} onChange={(e) => setWhy({ ...why, text: e.target.value })} />
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={why.absorb} onChange={(e) => setWhy({ ...why, absorb: e.target.checked })} />The association absorbs it (the marshal keeps the commission)</label>
                    <ActionButton small label="Waive the fee" color={COLOR} onRun={async () => { const r = await call(`/commission/trips/${t.departureId}/waive`, { method: "POST", body: { reasonCode: why.code, reason: why.text, absorb: why.absorb } }); if ("error" in r) return { error: r.error }; reload(); setWaiving(null); return { message: "Waived." }; }} />
                  </div>)}</td></tr>))}</tbody></table></div>)}</Status></div>
    </SectionPanel>
  );
}

/* ───────────────────────── the money check and catch-up ───────────────────────── */
function MoneyCheckCard() {
  const [load] = useLoad<Record<string, number | string | { driver: string; vehicle: string; trips: number; cents: number }[]>>(() => call("/commission/reconciliation"));
  return (
    <SectionPanel title="Money check (last 7 days)">
      <div className="p-4"><Status load={load}>{(c) => (
        <div className="space-y-2 text-sm text-fg">
          <p>{c.trips as number} trips · trip fees due <b>{money(c.feesDueCents as number)}</b>, received <b>{money(c.feesReceivedCents as number)}</b>, outstanding <b>{money(c.feesOutstandingCents as number)}</b>.</p>
          <p>Commission earned <b>{money(c.commissionEarnedCents as number)}</b>; payable <b>{money(c.commissionPayableCents as number)}</b>.</p>
          {(c.outstanding as { driver: string; vehicle: string; trips: number; cents: number }[]).length > 0 && <ul className="text-xs text-fg-muted space-y-1">{(c.outstanding as { driver: string; vehicle: string; trips: number; cents: number }[]).map((o) => <li key={`${o.driver}|${o.vehicle}`}>{o.driver} · {o.vehicle}: {o.trips} trip{o.trips === 1 ? "" : "s"}, {money(o.cents)}</li>)}</ul>}
        </div>)}</Status></div>
    </SectionPanel>
  );
}
function CatchUpCard() {
  const [from, setFrom] = useState("");
  return (
    <SectionPanel title="Calculate past trips">
      <div className="p-4 flex flex-wrap items-end gap-3">
        <Field label="From"><input type="date" aria-label="Catch up from" className={inputCls + " mt-1 w-40"} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <ActionButton label="Calculate" color={COLOR} onRun={async () => { const r = await call("/commission/backfill", { method: "POST", body: { from } }); if ("error" in r) return { error: r.error }; const d = r.data as unknown as { recorded: number; skipped: number }; return { message: `${d.recorded} trip${d.recorded === 1 ? "" : "s"} calculated, ${d.skipped} already done.` }; }} />
        <p className="text-xs text-fg-subtle basis-full">Calculates departures that have no trip fee yet, oldest first, each once. Use it to run shadow mode over past weeks.</p>
      </div>
    </SectionPanel>
  );
}

export function CommissionScreen() {
  const [load, reload] = useLoad<SettingsData>(() => call("/commission/settings"));
  return (
    <div className="space-y-4">
      <Status load={load}>{(d) => <><SettingsCard key={JSON.stringify(d.settings)} data={d} reload={reload} /><RulesCard tiersOn={d.settings.tiersEnabled} /><AuditCard reasons={d.reasons} /><MoneyCheckCard /><CatchUpCard /></>}</Status>
    </div>
  );
}

/* ───────────────────────── the pay run ───────────────────────── */
interface Row { id: string; number: string; marshal: string; status: string; trips: number; grossCents: number; deductionsCents: number; netCents: number }
interface Line { id: string; side: string; kind: string; label: string; amountCents: number; reason: string | null; reference: string | null }
interface View { id: string; number: string; status: string; marshal: string; periodStart: string; periodEnd: string; trips: number; grossCommissionCents: number; otherEarningsCents: number; deductionsCents: number; netCents: number; withheldCents: number; feesOwedTrips: number; feesOwedCents: number; lines: Line[]; payment: { method: string | null; reference: string | null; paidAt: string | null; waiting: string | null } }

function PayslipAdmin({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [load, reload] = useLoad<{ payslip: View }>(() => call(`/payslips/${id}`), [id]);
  const [method, setMethod] = useState("wallet"), [pay, setPay] = useState({ method: "bank", reference: "", date: "" });
  return (
    <Status load={load}>{({ payslip: p }) => (
      <div className="space-y-3 text-sm text-fg">
        <p className="font-bold">{p.number} · {p.marshal} · {p.periodStart} to {p.periodEnd} · <span className="text-fg-muted">{p.status}</span></p>
        <ul className="space-y-1">{p.lines.map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.label}{l.reference ? ` (${l.reference})` : ""}<span className="block text-xs text-fg-muted">{l.reason}</span></span><span>{l.side === "deduction" || l.kind === "reversal" ? "-" : ""}{money(l.amountCents)}</span></li>)}</ul>
        <p>Earnings {money(p.grossCommissionCents + p.otherEarningsCents)} · Deductions {money(p.deductionsCents)} · <b>Net pay {money(p.netCents)}</b></p>
        {p.feesOwedTrips > 0 && <p className="text-xs text-fg-muted">Drivers still owe {money(p.feesOwedCents)} for {p.feesOwedTrips} trip{p.feesOwedTrips === 1 ? "" : "s"}.{p.withheldCents > 0 ? ` Commission held back: ${money(p.withheldCents)}.` : ""}</p>}
        <div className="flex flex-wrap items-end gap-3">
          {p.status === "draft" && <><Field label="Pay by"><select aria-label="Pay by" className={inputCls + " mt-1 w-40"} value={method} onChange={(e) => setMethod(e.target.value)}><option value="wallet">VINK account (automatic)</option><option value="bank">Bank (record it)</option><option value="cash">Cash (record it)</option></select></Field>
            <ActionButton label="Issue payslip" color={COLOR} onRun={async () => { const r = await call(`/payslips/${p.id}/issue`, { method: "POST", body: { method } }); if ("error" in r) return { error: r.error }; reload(); onChanged(); return { message: "Issued." }; }} /></>}
          {p.status === "issued" && p.payment.method !== "wallet" && (
            <><Field label="Paid by"><select aria-label="Paid by" className={inputCls + " mt-1 w-28"} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="bank">Bank</option><option value="cash">Cash</option></select></Field>
              <Field label="Reference"><input aria-label="Payment reference" className={inputCls + " mt-1 w-40"} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
              <Field label="Date paid"><input type="date" aria-label="Date paid" className={inputCls + " mt-1 w-40"} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
              <ActionButton label="Record payment" color={COLOR} onRun={async () => { const r = await call(`/payslips/${p.id}/payment`, { method: "POST", body: { method: pay.method, reference: pay.reference, paidAt: pay.date || undefined } }); if ("error" in r) return { error: r.error }; reload(); onChanged(); return { message: "Recorded." }; }} /></>)}
          {p.status === "issued" && p.payment.method === "wallet" && <p className="text-xs text-fg-muted">{p.payment.waiting ?? "Waiting to be paid"}: the money engine pays it from the association's VINK account and retries until it can.</p>}
          {p.status !== "draft" && p.payment.paidAt && <p className="text-xs text-fg-muted">Paid {p.payment.paidAt.slice(0, 10)} by {p.payment.method}{p.payment.reference ? `, ${p.payment.reference}` : ""}.</p>}
          <PdfButton id={p.id} number={p.number} segment="association" />
        </div>
      </div>)}</Status>
  );
}

const ADJ_KINDS: [string, string][] = [["bonus", "Bonus"], ["incentive", "Incentive"], ["allowance", "Allowance"], ["advance", "Advance or loan repayment"], ["penalty", "Shortfall or penalty"], ["association_fee", "Association fee"], ["stokvel", "Stokvel contribution"], ["other_deduction", "Other deduction"]];
function AdjustmentsCard() {
  const [marshals] = useLoad<{ marshals: { id: string; name: string }[] }>(() => call("/commission/marshals"));
  const [load, reload] = useLoad<{ adjustments: { id: string; marshal: string; kind: string; label: string; reason: string | null; reference: string; totalCents: number; remainingCents: number; active: boolean }[] }>(() => call("/adjustments"));
  const ms = marshals.state === "ready" ? marshals.data.marshals ?? [] : [];
  const [f, setF] = useState({ marshal: "", kind: "bonus", label: "", reason: "", amount: "", per: "" });
  return (
    <SectionPanel title="Bonuses, advances and deductions">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Marshal"><select aria-label="Adjustment marshal" className={inputCls + " mt-1 w-40"} value={f.marshal} onChange={(e) => setF({ ...f, marshal: e.target.value })}><option value="">Choose</option>{ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Kind"><select aria-label="Adjustment kind" className={inputCls + " mt-1 w-52"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{ADJ_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Reason (needed for a deduction)"><input aria-label="Adjustment reason" className={inputCls + " mt-1 w-56"} maxLength={200} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <Field label="Amount (R)"><input aria-label="Adjustment amount" className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Each payslip (R, optional)"><input aria-label="Adjustment per period" className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={f.per} onChange={(e) => setF({ ...f, per: e.target.value })} /></Field>
          <ActionButton small label="Add" color={COLOR} onRun={async () => { const r = await call("/adjustments", { method: "POST", body: { marshalId: f.marshal, kind: f.kind, label: f.label || undefined, reason: f.reason, totalCents: toCents(f.amount), perPeriodCents: f.per ? toCents(f.per) : undefined } }); if ("error" in r) return { error: r.error }; reload(); setF({ ...f, reason: "", amount: "", per: "" }); return { message: "Added." }; }} />
        </div>
        <Status load={load}>{({ adjustments }) => adjustments.length === 0 ? <Empty>None yet. A deduction needs a reason; it comes off the next payslip, never more than the cap allows.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{adjustments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2"><span>{a.marshal} · {a.label} ({a.reference}) · {money(a.totalCents)}{a.reason ? ` · ${a.reason}` : ""}<span className="text-fg-subtle"> · {a.active ? `${money(a.remainingCents)} still to apply` : "finished"}</span></span>
              {a.active && <ActionButton small label="Cancel" color="#6B7280" onRun={async () => { const r = await call(`/adjustments/${a.id}/cancel`, { method: "POST", body: {} }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />}</li>))}</ul>)}</Status>
      </div>
    </SectionPanel>
  );
}
function MarshalDetailsCard() {
  const [load, reload] = useLoad<{ marshals: { id: string; name: string; marshalNumber: string; class: string; uifApplies: boolean; startedOn: string | null }[] }>(() => call("/commission/marshals"));
  return (
    <SectionPanel title="Marshals' payslip details">
      <div className="p-4"><Status load={load}>{({ marshals }) => marshals.length === 0 ? <Empty>No marshals are assigned to your ranks yet.</Empty> : (
        <ul className="space-y-2 text-sm text-fg">{marshals.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{m.name}</b> · {m.marshalNumber}</span>
            <span className="flex items-center gap-2"><select aria-label={`Class of ${m.name}`} className={inputCls + " w-36"} value={m.class} onChange={async (e) => { await call(`/commission/marshals/${m.id}`, { method: "PUT", body: { class: e.target.value } }); reload(); }}><option value="independent">Independent</option><option value="employee">Employee</option></select>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" aria-label={`UIF for ${m.name}`} checked={m.uifApplies} onChange={async (e) => { await call(`/commission/marshals/${m.id}`, { method: "PUT", body: { uifApplies: e.target.checked } }); reload(); }} />UIF</label></span></li>))}</ul>)}</Status></div>
    </SectionPanel>
  );
}

export function PayRunScreen() {
  const [day, setDay] = useState("");
  const [load, reload] = useLoad<{ period: { start: string; end: string }; finished: boolean; payslips: Row[] }>(() => call(`/payruns${day ? `?start=${day}` : ""}`), [day]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <SectionPanel title="Pay run">
        <div className="p-4 space-y-4">
          <Field label="Any day in the pay period (leave empty for the last finished one)"><input type="date" aria-label="Pay period day" className={inputCls + " mt-1 w-44"} value={day} onChange={(e) => { setDay(e.target.value); setOpen(null); }} /></Field>
          <Status load={load}>{(r) => (
            <>
              <p className="text-sm text-fg">Pay period <b>{r.period.start} to {r.period.end}</b>{r.finished ? "" : " (not finished yet)"}.</p>
              {r.finished && <ActionButton label="Prepare payslips" color={COLOR} onRun={async () => { const x = await call("/payruns", { method: "POST", body: { start: r.period.start } }); if ("error" in x) return { error: x.error }; const d = x.data as unknown as { drafted: number; empty: number }; reload(); return { message: `${d.drafted} payslip${d.drafted === 1 ? "" : "s"} prepared, ${d.empty} marshal${d.empty === 1 ? "" : "s"} with nothing to show.` }; }} />}
              {r.payslips.length === 0 ? <Empty>No payslips for this period yet.</Empty> : (
                <ul className="space-y-2">{r.payslips.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg"><span><b>{p.marshal}</b><span className="text-fg-subtle"> · {p.number} · {p.trips} trips</span></span>
                    <span className="flex items-center gap-3"><span className="font-bold">{money(p.netCents)}</span><span className="text-xs text-fg-muted">{p.status}</span><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Close" : "Review"}</button></span></li>))}</ul>)}
              {open && <div className="rounded-lg border border-line p-4"><PayslipAdmin id={open} onChanged={reload} /></div>}
            </>)}</Status>
        </div>
      </SectionPanel>
      <AdjustmentsCard /><MarshalDetailsCard />
    </div>
  );
}

/* ───────────────────────── queries ───────────────────────── */
interface Dispute { id: string; raisedBy: string; role: string; targetType: string; message: string; status: string; response: string | null; creditCents: number | null; createdAt: string }
const EFFECT: Record<string, string> = { fee_waived_commission_reversed: "The fee was waived and that trip's commission reversed.", fee_already_paid_needs_refund: "The driver has already paid that fee: it needs a refund, which is done outside this screen.", credit_on_next_payslip: "The credit will appear on the marshal's next payslip.", already_waived: "That fee was already waived.", none: "" };
function DisputeRow({ d, onDone }: { d: Dispute; onDone: () => void }) {
  const [f, setF] = useState({ decision: "upheld", response: "", credit: "" });
  return (
    <li className="text-sm text-fg border-b border-line/60 pb-3">
      <div className="flex flex-wrap justify-between gap-2"><span><b>{d.raisedBy}</b> ({d.role}) about a {d.targetType === "trip" ? "trip" : "payslip line"}: {d.message}</span><span className="font-bold">{d.status.replace("_", " ")}</span></div>
      <div className="text-xs text-fg-muted">{when(d.createdAt)}{d.response ? ` · Answer: ${d.response}` : ""}{d.creditCents ? ` · Credit ${money(d.creditCents)}` : ""}</div>
      {(d.status === "open" || d.status === "under_review") && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select aria-label="Decision" className={inputCls + " w-36"} value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })}><option value="under_review">Under review</option><option value="upheld">Uphold</option><option value="rejected">Reject</option></select>
          <input aria-label="Reason for the answer" className={inputCls + " flex-1 min-w-[12rem]"} placeholder="The reason the person will see" maxLength={500} value={f.response} onChange={(e) => setF({ ...f, response: e.target.value })} />
          {f.decision === "upheld" && d.role === "marshal" && <input aria-label="Credit (R)" className={inputCls + " !w-24"} placeholder="Credit R" inputMode="decimal" value={f.credit} onChange={(e) => setF({ ...f, credit: e.target.value })} />}
          <ActionButton small label="Answer" color={COLOR} onRun={async () => { const r = await call(`/disputes/${d.id}/respond`, { method: "POST", body: { decision: f.decision, response: f.response, creditCents: f.credit ? toCents(f.credit) : undefined } }); if ("error" in r) return { error: r.error }; const eff = (r.data as { effect?: string })?.effect ?? "none"; onDone(); return { message: `Answered. ${EFFECT[eff] ?? ""}`.trim() }; }} />
        </div>)}
    </li>
  );
}
export function QueriesScreen() {
  const [status, setStatus] = useState("");
  const [load, reload] = useLoad<{ disputes: Dispute[] }>(() => call(`/disputes${status ? `?status=${status}` : ""}`), [status]);
  return (
    <SectionPanel title="Queries from marshals and drivers" action={<Scale className="w-4 h-4 text-fg-muted" aria-hidden />}>
      <div className="p-4 space-y-4">
        <Field label="Show"><select aria-label="Show queries" className={inputCls + " mt-1 w-40"} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="open">Open</option><option value="under_review">Under review</option><option value="upheld">Upheld</option><option value="rejected">Rejected</option></select></Field>
        <Status load={load}>{({ disputes }) => disputes.length === 0 ? <Empty>No queries.</Empty> : <ul className="space-y-3">{disputes.map((d) => <DisputeRow key={d.id} d={d} onDone={reload} />)}</ul>}</Status>
      </div>
    </SectionPanel>
  );
}
