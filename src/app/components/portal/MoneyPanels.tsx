import { useState } from "react";
import { Wallet, Route as RouteIcon } from "lucide-react";
import { SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, inputCls, when, day } from "./ui";
import { Pager } from "./widgets";

/** Minor units on the wire (`...Cents`); shown as money. ZMW is shown as K. */
export const money = (cents: number, currency = "ZAR") => `${currency === "ZMW" ? "K" : "R"} ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KIND: Record<string, string> = { marshal_fee: "Marshal fee", per_trip_pay: "Pay per trip", weekly_cash_payment: "Weekly cash-basis payment", monthly_salary: "Monthly salary" };
const STATUS_COLOR: Record<string, string> = { paid: "#10B981", pending: "#94A3B8", waiting: "#F59E0B", arrears: "#EF4444", failed: "#EF4444", waived: "#64748B", needs_review: "#F59E0B", active: "#10B981", proposed: "#F59E0B", declined: "#EF4444", ended: "#64748B", cancelled: "#64748B" };
const MODE: Record<string, string> = { cash_basis_weekly: "Cash basis (driver pays the owner weekly)", monthly_salary: "Monthly salary (owner pays the driver)", per_trip_amount: "Amount per trip (owner pays the driver)" };
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Role = "driver" | "owner" | "marshal" | "association";

/** Money the rules created for me: marshal fees, per-trip pay, weekly and monthly agreement payments. */
export function PaymentsPanel({ segment, color }: { segment: Role; color: string }) {
  const call = portalClient(segment);
  const [status, setStatus] = useState(""); const [offset, setOffset] = useState(0); const LIMIT = 15;
  const [load] = useLoad<{ owedByMeCents: number; owedToMeCents: number; payments: { id: string; kind: string; direction: "in" | "out"; counterparty: string; amountCents: number; remainingCents: number; currency: string; status: string; note: string | null; dueAt: string; paidAt: string | null; problem: string | null }[] }>(
    () => call(`/money/payments?limit=${LIMIT}&offset=${offset}${status ? `&status=${status}` : ""}`), [status, offset]);
  return (
    <SectionPanel title="Payments from the rules">
      <div className="p-4 space-y-4">
        <Status load={load}>{(d) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Waiting to be paid by me" value={money(d.owedByMeCents)} icon={<Wallet className="w-4 h-4" />} color="#F59E0B" />
              <StatCard label="Waiting to be paid to me" value={money(d.owedToMeCents)} icon={<Wallet className="w-4 h-4" />} color="#10B981" />
            </div>
            <label className="block"><span className="text-[11px] text-white/60">Show</span>
              <select className={inputCls + " mt-1 !w-auto"} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="">All</option><option value="pending">Pending</option><option value="waiting">Waiting for funds</option><option value="arrears">Arrears</option><option value="paid">Paid</option></select></label>
            {d.payments.length === 0 ? <Empty>No payments yet. They appear here when a trip completes or an agreement falls due.</Empty> : (
              <TableCard title="Payments" color={color} columns={["Due", "What", "With", "Amount", "Status"]} rows={d.payments.map((p) => [
                day(p.dueAt),
                <span key="k">{KIND[p.kind] ?? p.kind}{p.note ? <span className="block text-[11px] text-white/40">{p.note}</span> : null}</span>,
                `${p.direction === "out" ? "To" : "From"} ${p.counterparty}`,
                <span key="a">{p.direction === "out" ? "−" : "+"}{money(p.amountCents, p.currency)}{p.remainingCents > 0 && p.remainingCents < p.amountCents ? <span className="block text-[11px] text-amber-300">{money(p.remainingCents, p.currency)} still owed</span> : null}</span>,
                <span key="s"><Badge text={p.status.replace("_", " ")} color={STATUS_COLOR[p.status]} />{p.problem ? <span className="block text-[11px] text-white/40">{p.problem}</span> : null}</span>,
              ])} />)}
            <Pager total={offset + d.payments.length + (d.payments.length === LIMIT ? 1 : 0)} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}

/** Completed trips (16 taps each) and how many taps are in the trip being filled now. */
export function TripsPanel({ segment, color }: { segment: Role; color: string }) {
  const call = portalClient(segment);
  const [load] = useLoad<{ tapsInCurrentTrip: number | null; trips: { id: string; tripNo: number; taps: number; fareCents: number; currency: string; completedAt: string; vehicle: string | null; needsReview: string | null }[] }>(() => call("/money/trips"));
  return (
    <SectionPanel title="Completed trips">
      <div className="p-4 space-y-3">
        <Status load={load}>{(d) => (
          <>
            {d.tapsInCurrentTrip !== null && <StatCard label="Taps in the trip being filled" value={String(d.tapsInCurrentTrip)} sub="A trip completes at 16 confirmed taps" icon={<RouteIcon className="w-4 h-4" />} color={color} />}
            {d.trips.length === 0 ? <Empty>No completed trips yet.</Empty> : (
              <TableCard title="Trips" color={color} columns={["Completed", "Trip", "Vehicle", "Taps", "Fares", "Note"]} rows={d.trips.map((t) => [when(t.completedAt), `#${t.tripNo}`, t.vehicle ?? "–", t.taps, money(t.fareCents, t.currency), t.needsReview === "no_marshal_logged" ? "No marshal logged" : t.needsReview ?? ""])} />)}
          </>)}</Status>
      </div>
    </SectionPanel>
  );
}

interface Agreement { id: string; ownerName: string | null; driverName: string | null; mode: string; amountCents: number; currency: string; payDay: number | null; startDate: string | null; endDate: string | null; status: string; consentText: string | null }
const describe = (a: Agreement) => `${money(a.amountCents, a.currency)} ${a.mode === "cash_basis_weekly" ? `every ${WEEKDAYS[(a.payDay ?? 5) - 1]}` : a.mode === "monthly_salary" ? `on day ${a.payDay} of each month` : "per completed trip"}`;

/** The owner's side: propose how a driver is paid, and see or end the agreements. Nothing happens until the driver agrees. */
export function OwnerAgreements({ color }: { color: string }) {
  const call = portalClient("owner");
  const [load, reload] = useLoad<{ agreements: Agreement[] }>(() => call("/money/agreements"));
  const [drivers] = useLoad<{ drivers: { driverId: string; name: string; status: string }[] }>(() => call("/drivers"));
  const [f, setF] = useState({ driverId: "", mode: "monthly_salary", amount: "", payDay: "", startDate: new Date().toISOString().slice(0, 10), endDate: "", currency: "ZAR" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const active = drivers.state === "ready" ? drivers.data.drivers.filter((d) => d.status === "active") : [];
  const submit = async () => {
    const amountCents = Math.round(Number(f.amount) * 100);
    if (!f.driverId) return { error: "Choose a driver" };
    if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter the amount, for example 3500.00" };
    const r = await call("/money/agreements", { method: "POST", body: { driverId: f.driverId, mode: f.mode, amountCents, currency: f.currency, payDay: f.payDay ? Number(f.payDay) : undefined, startDate: f.startDate, endDate: f.endDate || undefined } });
    if ("error" in r) return { error: r.error };
    setF((p) => ({ ...p, amount: "" })); reload(); return { message: "Sent to the driver. It starts once they accept." };
  };
  return (
    <>
      <SectionPanel title="How your drivers are paid">
        <div className="p-4 space-y-3">
          <p className="text-xs text-white/60">Cash basis: the driver keeps the fares and pays you an agreed amount each week. Monthly: you pay the driver a salary. Per trip: you pay the driver an agreed amount for every completed trip (16 taps). The driver has to accept before anything moves.</p>
          <Status load={load}>{({ agreements }) => agreements.length === 0 ? <Empty>No agreements yet.</Empty> : (
            <ul className="space-y-2">{agreements.map((a) => (
              <li key={a.id} className="rounded-lg p-3 flex flex-wrap items-center justify-between gap-2" style={{ background: "#0D0B1E", border: "1px solid #2D2A50" }}>
                <div className="text-sm text-white"><b>{a.driverName}</b> · {MODE[a.mode]}<p className="text-xs text-white/60">{describe(a)} · from {day(a.startDate)}{a.endDate ? ` to ${day(a.endDate)}` : ""}</p></div>
                <div className="flex items-center gap-2"><Badge text={a.status} color={STATUS_COLOR[a.status]} />
                  {(a.status === "proposed" || a.status === "active") && <ActionButton small label={a.status === "proposed" ? "Withdraw" : "End"} color="#EF4444" onRun={async () => { const r = await call(`/money/agreements/${a.id}/cancel`, { method: "POST" }); reload(); return "error" in r ? { error: r.error } : undefined; }} />}</div>
              </li>))}</ul>)}</Status>
        </div>
      </SectionPanel>
      <SectionPanel title="Propose an agreement">
        <div className="p-4 grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-[11px] text-white/60">Driver</span><select className={inputCls + " mt-1"} value={f.driverId} onChange={set("driverId")}><option value="">Choose…</option>{active.map((d) => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}</select></label>
          <label className="block"><span className="text-[11px] text-white/60">How the driver is paid</span><select className={inputCls + " mt-1"} value={f.mode} onChange={set("mode")}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="text-[11px] text-white/60">Amount ({f.mode === "cash_basis_weekly" ? "per week" : f.mode === "monthly_salary" ? "per month" : "per trip"})</span><input className={inputCls + " mt-1"} inputMode="decimal" placeholder="0.00" value={f.amount} onChange={set("amount")} /></label>
          <label className="block"><span className="text-[11px] text-white/60">Currency</span><select className={inputCls + " mt-1"} value={f.currency} onChange={set("currency")}><option value="ZAR">Rand (R)</option><option value="ZMW">Kwacha (K)</option></select></label>
          {f.mode === "cash_basis_weekly" && <label className="block"><span className="text-[11px] text-white/60">Weekly pay day</span><select className={inputCls + " mt-1"} value={f.payDay || "5"} onChange={set("payDay")}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>}
          {f.mode === "monthly_salary" && <label className="block"><span className="text-[11px] text-white/60">Salary day of the month (1 to 28)</span><input className={inputCls + " mt-1"} inputMode="numeric" placeholder="25" value={f.payDay} onChange={set("payDay")} /></label>}
          <label className="block"><span className="text-[11px] text-white/60">Starts</span><input type="date" className={inputCls + " mt-1"} value={f.startDate} onChange={set("startDate")} /></label>
          <label className="block"><span className="text-[11px] text-white/60">Ends (optional)</span><input type="date" className={inputCls + " mt-1"} value={f.endDate} onChange={set("endDate")} /></label>
          <div className="sm:col-span-2"><ActionButton label="Send to the driver" color={color} onRun={submit} /></div>
        </div>
      </SectionPanel>
    </>
  );
}

/** The driver's side: read the terms, tick the box, accept (or decline). Accepting is the consent to the automatic transfers. */
export function DriverAgreements({ color }: { color: string }) {
  const call = portalClient("driver");
  const [load, reload] = useLoad<{ agreements: Agreement[] }>(() => call("/money/agreements"));
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  return (
    <SectionPanel title="Your pay agreement with the owner">
      <div className="p-4 space-y-3">
        <Status load={load}>{({ agreements }) => agreements.length === 0 ? <Empty>You have no pay agreement yet. Your owner can propose one from their dashboard.</Empty> : (
          <ul className="space-y-3">{agreements.map((a) => (
            <li key={a.id} className="rounded-lg p-3 space-y-2" style={{ background: "#0D0B1E", border: "1px solid #2D2A50" }}>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-white"><b>{a.ownerName}</b> · {MODE[a.mode]}</p><Badge text={a.status} color={STATUS_COLOR[a.status]} /></div>
              <p className="text-xs text-white/70">{describe(a)} · from {day(a.startDate)}{a.endDate ? ` to ${day(a.endDate)}` : ""}</p>
              {a.status === "proposed" && (
                <>
                  {a.consentText && <p className="text-xs text-white/60 italic">{a.consentText}</p>}
                  <label className="flex items-start gap-2 text-xs text-white/80"><input type="checkbox" className="mt-0.5" checked={!!ticked[a.id]} onChange={(e) => setTicked((p) => ({ ...p, [a.id]: e.target.checked }))} />I have read this and I agree to these automatic transfers.</label>
                  <div className="flex gap-2">
                    <ActionButton small label="Accept" color={color} onRun={async () => { const r = await call(`/money/agreements/${a.id}/accept`, { method: "POST", body: { consent: !!ticked[a.id] } }); if (!("error" in r)) reload(); return "error" in r ? { error: r.error } : undefined; }} />
                    <ActionButton small label="Decline" color="#EF4444" onRun={async () => { const r = await call(`/money/agreements/${a.id}/decline`, { method: "POST" }); if (!("error" in r)) reload(); return "error" in r ? { error: r.error } : undefined; }} /></div>
                </>)}
            </li>))}</ul>)}</Status>
        <p className="text-[11px] text-white/40">Money only moves from your account when it is there: if your balance is short, the rest stays owed and is paid when funds arrive.</p>
      </div>
    </SectionPanel>
  );
}

/** The association's own marshal fee per completed trip. Empty means the country default. */
export function MarshalFeeSetting({ color }: { color: string }) {
  const call = portalClient("association");
  const [load, reload] = useLoad<{ marshalFeeCents: number | null }>(() => call("/money/settings"));
  const [v, setV] = useState<string | null>(null);
  return (
    <SectionPanel title="Marshal fee">
      <div className="p-4 space-y-3">
        <p className="text-xs text-white/60">Paid by the driver to the marshal for each completed trip. If no marshal logged the departure, it comes to the association's account.</p>
        <Status load={load}>{(d) => {
          const shown = v ?? (d.marshalFeeCents === null ? "" : (d.marshalFeeCents / 100).toFixed(2));
          return (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block"><span className="text-[11px] text-white/60">Fee per trip (blank = default)</span><input className={inputCls + " mt-1 !w-40"} inputMode="decimal" value={shown} onChange={(e) => setV(e.target.value)} /></label>
              <ActionButton label="Save" color={color} onRun={async () => {
                const cents = shown.trim() === "" ? null : Math.round(Number(shown) * 100);
                if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return { error: "Enter an amount like 20.00" };
                const r = await call("/money/settings", { method: "PUT", body: { marshalFeeCents: cents } });
                if ("error" in r) return { error: r.error }; setV(null); reload(); return { message: "Saved" };
              }} />
            </div>);
        }}</Status>
      </div>
    </SectionPanel>
  );
}
