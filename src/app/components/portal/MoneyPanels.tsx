import { useState } from "react";
import { Wallet, Route as RouteIcon } from "lucide-react";
import { SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, inputCls, when, day } from "./ui";
import { Pager } from "./widgets";
import { CopyButton } from "./BankAccount";

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
            <label className="block"><span className="text-[11px] text-fg-muted">Show</span>
              <select className={inputCls + " mt-1 !w-auto"} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="">All</option><option value="pending">Pending</option><option value="waiting">Waiting for funds</option><option value="arrears">Arrears</option><option value="paid">Paid</option></select></label>
            {d.payments.length === 0 ? <Empty>No payments yet. They appear here when a trip completes or an agreement falls due.</Empty> : (
              <TableCard title="Payments" color={color} columns={["Due", "What", "With", "Amount", "Status"]} rows={d.payments.map((p) => [
                day(p.dueAt),
                <span key="k">{KIND[p.kind] ?? p.kind}{p.note ? <span className="block text-[11px] text-fg-subtle">{p.note}</span> : null}</span>,
                `${p.direction === "out" ? "To" : "From"} ${p.counterparty}`,
                <span key="a">{p.direction === "out" ? "−" : "+"}{money(p.amountCents, p.currency)}{p.remainingCents > 0 && p.remainingCents < p.amountCents ? <span className="block text-[11px] text-warn">{money(p.remainingCents, p.currency)} still owed</span> : null}</span>,
                <span key="s"><Badge text={p.status.replace("_", " ")} color={STATUS_COLOR[p.status]} />{p.problem ? <span className="block text-[11px] text-fg-subtle">{p.problem}</span> : null}</span>,
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
          <p className="text-xs text-fg-muted">Cash basis: the driver keeps the fares and pays you an agreed amount each week. Monthly: you pay the driver a salary. Per trip: you pay the driver an agreed amount for every completed trip (16 taps). The driver has to accept before anything moves.</p>
          <Status load={load}>{({ agreements }) => agreements.length === 0 ? <Empty>No agreements yet.</Empty> : (
            <ul className="space-y-2">{agreements.map((a) => (
              <li key={a.id} className="rounded-lg p-3 flex flex-wrap items-center justify-between gap-2" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
                <div className="text-sm text-fg"><b>{a.driverName}</b> · {MODE[a.mode]}<p className="text-xs text-fg-muted">{describe(a)} · from {day(a.startDate)}{a.endDate ? ` to ${day(a.endDate)}` : ""}</p></div>
                <div className="flex items-center gap-2"><Badge text={a.status} color={STATUS_COLOR[a.status]} />
                  {(a.status === "proposed" || a.status === "active") && <ActionButton small label={a.status === "proposed" ? "Withdraw" : "End"} color="#EF4444" onRun={async () => { const r = await call(`/money/agreements/${a.id}/cancel`, { method: "POST" }); reload(); return "error" in r ? { error: r.error } : undefined; }} />}</div>
              </li>))}</ul>)}</Status>
        </div>
      </SectionPanel>
      <SectionPanel title="Propose an agreement">
        <div className="p-4 grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-[11px] text-fg-muted">Driver</span><select className={inputCls + " mt-1"} value={f.driverId} onChange={set("driverId")}><option value="">Choose…</option>{active.map((d) => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}</select></label>
          <label className="block"><span className="text-[11px] text-fg-muted">How the driver is paid</span><select className={inputCls + " mt-1"} value={f.mode} onChange={set("mode")}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="text-[11px] text-fg-muted">Amount ({f.mode === "cash_basis_weekly" ? "per week" : f.mode === "monthly_salary" ? "per month" : "per trip"})</span><input className={inputCls + " mt-1"} inputMode="decimal" placeholder="0.00" value={f.amount} onChange={set("amount")} /></label>
          <label className="block"><span className="text-[11px] text-fg-muted">Currency</span><select className={inputCls + " mt-1"} value={f.currency} onChange={set("currency")}><option value="ZAR">Rand (R)</option><option value="ZMW">Kwacha (K)</option></select></label>
          {f.mode === "cash_basis_weekly" && <label className="block"><span className="text-[11px] text-fg-muted">Weekly pay day</span><select className={inputCls + " mt-1"} value={f.payDay || "5"} onChange={set("payDay")}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>}
          {f.mode === "monthly_salary" && <label className="block"><span className="text-[11px] text-fg-muted">Salary day of the month (1 to 28)</span><input className={inputCls + " mt-1"} inputMode="numeric" placeholder="25" value={f.payDay} onChange={set("payDay")} /></label>}
          <label className="block"><span className="text-[11px] text-fg-muted">Starts</span><input type="date" className={inputCls + " mt-1"} value={f.startDate} onChange={set("startDate")} /></label>
          <label className="block"><span className="text-[11px] text-fg-muted">Ends (optional)</span><input type="date" className={inputCls + " mt-1"} value={f.endDate} onChange={set("endDate")} /></label>
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
            <li key={a.id} className="rounded-lg p-3 space-y-2" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-fg"><b>{a.ownerName}</b> · {MODE[a.mode]}</p><Badge text={a.status} color={STATUS_COLOR[a.status]} /></div>
              <p className="text-xs text-fg">{describe(a)} · from {day(a.startDate)}{a.endDate ? ` to ${day(a.endDate)}` : ""}</p>
              {a.status === "proposed" && (
                <>
                  {a.consentText && <p className="text-xs text-fg-muted italic">{a.consentText}</p>}
                  <label className="flex items-start gap-2 text-xs text-fg"><input type="checkbox" className="mt-0.5" checked={!!ticked[a.id]} onChange={(e) => setTicked((p) => ({ ...p, [a.id]: e.target.checked }))} />I have read this and I agree to these automatic transfers.</label>
                  <div className="flex gap-2">
                    <ActionButton small label="Accept" color={color} onRun={async () => { const r = await call(`/money/agreements/${a.id}/accept`, { method: "POST", body: { consent: !!ticked[a.id] } }); if (!("error" in r)) reload(); return "error" in r ? { error: r.error } : undefined; }} />
                    <ActionButton small label="Decline" color="#EF4444" onRun={async () => { const r = await call(`/money/agreements/${a.id}/decline`, { method: "POST" }); if (!("error" in r)) reload(); return "error" in r ? { error: r.error } : undefined; }} /></div>
                </>)}
            </li>))}</ul>)}</Status>
        <p className="text-[11px] text-fg-subtle">Money only moves from your account when it is there: if your balance is short, the rest stays owed and is paid when funds arrive.</p>
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
        <p className="text-xs text-fg-muted">Paid by the driver to the marshal for each completed trip. If no marshal logged the departure, it comes to the association's account.</p>
        <Status load={load}>{(d) => {
          const shown = v ?? (d.marshalFeeCents === null ? "" : (d.marshalFeeCents / 100).toFixed(2));
          return (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block"><span className="text-[11px] text-fg-muted">Fee per trip (blank = default)</span><input className={inputCls + " mt-1 !w-40"} inputMode="decimal" value={shown} onChange={(e) => setV(e.target.value)} /></label>
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

interface VirtualAccountRow { currency: string; pool: "in_person" | "online"; poolLabel: string; reference: string; status: string; payInto: { accountNumber: string; holder: string; bank: string; type: string } | null }

/**
 * How money gets into my account: one payment reference for each currency and pool. Pay into the pooled bank account and quote the reference;
 * the credit is matched to me when the bank reports it. Also shows my kwacha wallet balance, if I have one.
 */
export function VirtualAccountsPanel({ segment, color }: { segment: Role; color: string }) {
  const call = portalClient(segment);
  const [load, reload] = useLoad<{ accounts: VirtualAccountRow[] }>(() => call("/money/virtual-accounts"));
  const [wallet] = useLoad<{ wallets: { currency: string; balanceCents: number }[] }>(() => call("/money/wallet"));
  const [currency, setCurrency] = useState("ZAR"); const [pool, setPool] = useState("in_person");
  return (
    <SectionPanel title="Paying money in">
      <div className="p-4 space-y-3">
        <p className="text-xs text-fg-muted">Pay into the bank account shown and write your reference as the payment reference. We match it to your account when the bank reports the payment. Each reference is only yours.</p>
        <Status load={wallet}>{({ wallets }) => wallets.length > 0 ? <div className="grid grid-cols-2 gap-3">{wallets.map((w) => <StatCard key={w.currency} label={`${w.currency} wallet`} value={money(w.balanceCents, w.currency)} icon={<Wallet className="w-4 h-4" />} color={color} />)}</div> : null}</Status>
        <Status load={load}>{({ accounts }) => accounts.length === 0 ? <Empty>You have no payment reference yet. Create one below.</Empty> : (
          <ul className="space-y-2">{accounts.map((a) => (
            <li key={a.currency + a.pool} className="rounded-lg p-3" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
              <p className="text-[11px] text-fg-muted">{a.poolLabel} · {a.currency === "ZMW" ? "Kwacha" : "Rand"}</p>
              <div className="flex flex-wrap items-center gap-3"><p className="font-mono text-lg font-bold tracking-wider text-fg">{a.reference}</p>
                <CopyButton value={a.reference} label="reference" color={color} /></div>
              {a.payInto ? <p className="text-xs text-fg-muted mt-1">Pay into {a.payInto.holder} · {a.payInto.bank} · account {a.payInto.accountNumber}</p> : <p className="text-xs text-warn mt-1">The bank account to pay into has not been set up yet.</p>}
            </li>))}</ul>)}</Status>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="text-[11px] text-fg-muted">Currency</span><select className={inputCls + " mt-1 !w-auto"} value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="ZAR">Rand (R)</option><option value="ZMW">Kwacha (K)</option></select></label>
          <label className="block"><span className="text-[11px] text-fg-muted">Pool</span><select className={inputCls + " mt-1 !w-auto"} value={pool} onChange={(e) => setPool(e.target.value)}><option value="in_person">In-Person Payment</option><option value="online">Online Payment</option></select></label>
          <ActionButton label="Get my reference" color={color} onRun={async () => { const r = await call("/money/virtual-accounts", { method: "POST", body: { currency, pool } }); if ("error" in r) return { error: r.error }; reload(); return { message: "Ready" }; }} />
        </div>
      </div>
    </SectionPanel>
  );
}

interface XbQuote { rateSource?: string | null; id: string; corridor: string; sendCents: number; sendCurrency: string; feeCents: number; rate: number; receiveCents: number; receiveCurrency: string; recipient: string; expiresAt: string; status: string }

/** Send money between South Africa and Zambia: get a quote (nothing moves), then confirm it before it expires. Hidden when no route is open and there is no history. */
export function CrossBorderPanel({ segment, color }: { segment: Role; color: string }) {
  const call = portalClient(segment);
  const [load, reload] = useLoad<{ corridors: { id: string; from: string; to: string; fromCurrency: string; toCurrency: string }[]; transfers: (XbQuote & { direction: "sent" | "received" })[] }>(() => call("/money/cross-border"));
  const [email, setEmail] = useState(""); const [amount, setAmount] = useState(""); const [corridor, setCorridor] = useState("");
  const [quote, setQuote] = useState<XbQuote | null>(null);
  if (load.state !== "ready") return null;
  const { corridors, transfers } = load.data;
  if (corridors.length === 0 && transfers.length === 0) return null;
  const chosen = corridor || corridors[0]?.id || "";
  const route = corridors.find((c) => c.id === chosen);
  return (
    <SectionPanel title="Send money across the border">
      <div className="p-4 space-y-3">
        {corridors.length > 0 && !quote && (
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block"><span className="text-[11px] text-fg-muted">Route</span><select className={inputCls + " mt-1"} value={chosen} onChange={(e) => setCorridor(e.target.value)}>{corridors.map((c) => <option key={c.id} value={c.id}>{c.fromCurrency} to {c.toCurrency}</option>)}</select></label>
            <label className="block"><span className="text-[11px] text-fg-muted">Recipient's email</span><input className={inputCls + " mt-1"} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="block"><span className="text-[11px] text-fg-muted">You send ({route?.fromCurrency})</span><input className={inputCls + " mt-1"} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <div className="sm:col-span-3"><ActionButton label="Get a quote" color={color} onRun={async () => {
              const amountCents = Math.round(Number(amount) * 100);
              if (!email.includes("@")) return { error: "Enter the recipient's email" };
              if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter an amount like 500.00" };
              const r = await call<{ quote: XbQuote }>("/money/cross-border/quote", { method: "POST", body: { recipientEmail: email.trim(), amountCents, corridorId: chosen } });
              if ("error" in r) return { error: r.error }; setQuote(r.data.quote);
            }} /></div>
          </div>)}
        {quote && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
            <p className="text-sm text-fg">{quote.recipient} receives <b>{money(quote.receiveCents, quote.receiveCurrency)}</b></p>
            <p className="text-xs text-fg-muted">You pay {money(quote.sendCents, quote.sendCurrency)} including a fee of {money(quote.feeCents, quote.sendCurrency)} · rate {quote.rate.toFixed(4)} · this quote is valid until {when(quote.expiresAt)}{quote.rateSource && quote.rateSource !== "manual" ? ` · exchange rate by ${quote.rateSource}` : ""}</p>
            <div className="flex gap-2">
              <ActionButton label="Confirm and send" color={color} onRun={async () => { const r = await call(`/money/cross-border/${quote.id}/confirm`, { method: "POST" }); if ("error" in r) return { error: r.error }; setQuote(null); setAmount(""); reload(); return { message: "Sent" }; }} />
              <button type="button" className="text-xs underline text-fg" onClick={() => setQuote(null)}>Cancel</button></div>
          </div>)}
        {transfers.length > 0 && <TableCard title="Cross-border transfers" color={color} columns={["When", "", "With", "Amount"]} rows={transfers.map((t) => [when(t.expiresAt), t.direction === "sent" ? "Sent" : "Received", t.recipient, t.direction === "sent" ? `−${money(t.sendCents, t.sendCurrency)}` : `+${money(t.receiveCents, t.receiveCurrency)}`])} />}
      </div>
    </SectionPanel>
  );
}
