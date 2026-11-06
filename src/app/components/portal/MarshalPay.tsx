import { useState } from "react";
import { Download, Bus, Coins, Clock } from "lucide-react";
import { authFetch } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, when, inputCls } from "./ui";
import { sendOrQueue } from "./offlineQueue";
import { useT } from "./i18n";
import { CashOutCard } from "./MarshalCare";

/**
 * What a marshal sees of their own pay (docs/MARSHAL_COMMISSION.md): their commission by day and the trips behind each day; their payslips, readable on a phone, with a Query button on every line,
 * a PDF, and sharing by WhatsApp or email; the money check (trip fees due, received, outstanding, and commission earned against payable); and their language and consent.
 * Everything here is the marshal's own: the server sends nothing about anyone else.
 */
const COLOR = "#C8102E";
const call = portalClient("marshal");
const money = (cents: number) => rand(cents / 100);
const bp = (n: number) => `${n / 100}%`;

/** A short form that sends a query to the association about one line or one trip. */
function QueryForm({ targetType, targetId, onDone }: { targetType: "payslip_line" | "trip"; targetId: string; onDone?: () => void }) {
  const [text, setText] = useState(""), [sent, setSent] = useState(false);
  // The confirmation lives here, not in the button: the marshal must see that the query went, and it stays until they close the form.
  if (sent) return <p role="status" className="mt-2 text-xs text-ok">Sent (or saved on your phone to send when you have signal). The association will answer under My queries. <button type="button" className="underline" onClick={() => { setSent(false); onDone?.(); }}>Close</button></p>;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="block flex-1 min-w-[12rem]"><span className="text-[11px] text-fg-muted">What is wrong? (5 to 500 characters)</span><input className={inputCls + " mt-1"} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <ActionButton small label="Send query" busyLabel="Sending…" color={COLOR} onRun={async () => {
        const r = await sendOrQueue(call, { method: "POST", path: "/disputes", body: { targetType, targetId, message: text }, label: "Query" });
        if (r.status === "error") return { error: r.error };
        setText(""); setSent(true); return r.status === "queued" ? { message: "Saved on your phone. It will send when you have signal." } : undefined;
      }} />
    </div>
  );
}

/* ───────────────────────── earnings ───────────────────────── */
interface Day { date: string; rank: string; trips: number; feesCents: number; commissionCents: number }
interface Earnings { from: string; to: string; days: Day[]; totals: { trips: number; feesCents: number; commissionCents: number; onPayslipCents: number; accruingCents: number } }
interface DayTrip { departureId: string; time: string; rank: string; registration: string; driver: string | null; feeCents: number; feeStatus: string; rateBp: number; commissionCents: number; payslip: string | null }
const STATUS: Record<string, string> = { paid: "Paid", owed: "Owed", waived: "Waived", recorded: "Recorded" };

function DayTrips({ date }: { date: string }) {
  const [load] = useLoad<{ trips: DayTrip[] }>(() => call(`/earnings/day/${date}`), [date]);
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <Status load={load}>{({ trips }) => trips.length === 0 ? <Empty>No trips on this day.</Empty> : (
      <ul className="space-y-2">{trips.map((t) => (
        <li key={t.departureId} className="text-sm text-fg border-b border-line/60 pb-2">
          <div className="flex flex-wrap justify-between gap-2">
            <span>{when(t.time)} · {t.registration}{t.driver ? ` · ${t.driver}` : ""}<span className="text-fg-subtle"> · fee {money(t.feeCents)} ({STATUS[t.feeStatus] ?? t.feeStatus})</span></span>
            <span className="font-bold">{money(t.commissionCents)}<span className="font-normal text-fg-subtle"> at {bp(t.rateBp)}</span></span>
          </div>
          <div className="text-xs text-fg-muted">{t.payslip ? `On payslip ${t.payslip}` : "Not on a payslip yet"} · <button type="button" className="underline" onClick={() => setAsking(asking === t.departureId ? null : t.departureId)}>Query this trip</button></div>
          {asking === t.departureId && <QueryForm targetType="trip" targetId={t.departureId} onDone={() => setAsking(null)} />}
        </li>))}</ul>
    )}</Status>
  );
}

export function EarningsScreen() {
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [day, setDay] = useState<string | null>(null);
  const q = `${from ? `?from=${from}${to ? `&to=${to}` : ""}` : ""}`;
  const [load] = useLoad<Earnings>(() => call(`/earnings${q}`), [q]);
  return (
    <SectionPanel title="My earnings">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-fg-muted">From<input type="date" className={inputCls + " mt-1 w-40"} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-fg-muted">To<input type="date" className={inputCls + " mt-1 w-40"} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <span className="text-xs text-fg-subtle">The last 7 days if you leave these empty.</span>
        </div>
        <Status load={load}>{(e) => (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Trips" value={String(e.totals.trips)} icon={<Bus className="w-5 h-5" />} color={COLOR} />
              <StatCard label="Commission earned" value={money(e.totals.commissionCents)} icon={<Coins className="w-5 h-5" />} color={COLOR} />
              <StatCard label="Building up (not on a payslip yet)" value={money(e.totals.accruingCents)} icon={<Clock className="w-5 h-5" />} color={COLOR} />
            </div>
            {e.days.length === 0 ? <Empty>No trips in this period.</Empty> : (
              <div className="overflow-x-auto"><table className="w-full text-sm text-fg">
                <thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-2 pr-3">Day</th><th className="pr-3">Rank</th><th className="pr-3 text-right">Trips</th><th className="pr-3 text-right">Trip fees</th><th className="text-right">Commission</th></tr></thead>
                <tbody>{e.days.map((d) => (
                  <tr key={`${d.date}|${d.rank}`} className="border-b border-line/60"><td className="py-2 pr-3"><button type="button" className="underline font-bold" aria-expanded={day === d.date} onClick={() => setDay(day === d.date ? null : d.date)}>{d.date}</button></td><td className="pr-3">{d.rank}</td><td className="pr-3 text-right">{d.trips}</td><td className="pr-3 text-right">{money(d.feesCents)}</td><td className="text-right font-bold">{money(d.commissionCents)}</td></tr>))}</tbody>
              </table></div>
            )}
            {day && <div className="rounded-lg border border-line p-3"><p className="text-xs font-bold text-fg mb-2">Trips on {day}</p><DayTrips date={day} /></div>}
          </>
        )}</Status>
      </div>
    </SectionPanel>
  );
}

/* ───────────────────────── payslips ───────────────────────── */
interface PayslipRow { id: string; number: string; association: string; periodStart: string; periodEnd: string; status: string; trips: number; grossCents: number; deductionsCents: number; netCents: number }
interface Line { id: string; side: "earning" | "deduction"; kind: string; label: string; amountCents: number; reason: string | null; reference: string | null }
interface Payslip {
  id: string; number: string; status: string; association: string; marshal: string; marshalNumber: string; ranks: string; periodStart: string; periodEnd: string; issuedAt: string | null; trips: number; tripFeeTotalCents: number;
  grossCommissionCents: number; otherEarningsCents: number; deductionsCents: number; netCents: number; withheldCents: number; feesOwedTrips: number; feesOwedCents: number; commissionPayableOn: string; lines: Line[];
  payment: { method: string | null; reference: string | null; paidAt: string | null; waiting: string | null }; daily: { date: string; rank: string; trips: number; feesCents: number; commissionCents: number; late: boolean }[];
  ytd: { from: string; grossCents: number; deductionsCents: number; netCents: number }; note: string;
}

/** Downloads the payslip as a PDF (fetched with the signed-in session, so it never needs a public link). */
export function PdfButton({ id, number, segment = "marshal", kind = "payslips" }: { id: string; number: string; segment?: "marshal" | "association"; kind?: "payslips" | "income-letters" }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await authFetch(`${API_BASE}/api/portal/${segment}/${kind}/${id}.pdf`);
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? `Download failed (${res.status})`); return; }
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = `${kind === "payslips" ? "payslip" : "income-letter"}-${number}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { setErr("We could not reach the server."); } finally { setBusy(false); }
  };
  return <span className="inline-flex items-center gap-2"><button type="button" disabled={busy} onClick={run} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60" style={{ background: COLOR }}><Download className="w-4 h-4" />{busy ? "Preparing…" : "Download PDF"}</button>{err && <span role="alert" className="text-xs text-bad">{err}</span>}</span>;
}
const summaryText = (p: Payslip) => `Payslip ${p.number}, ${p.association}. Period ${p.periodStart} to ${p.periodEnd}. Trips ${p.trips}. Gross ${money(p.grossCommissionCents + p.otherEarningsCents)}, deductions ${money(p.deductionsCents)}, net pay ${money(p.netCents)}. Generated from system trip records.`;

function PayslipView({ id }: { id: string }) {
  const [load] = useLoad<{ payslip: Payslip }>(() => call(`/payslips/${id}`), [id]);
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <Status load={load}>{({ payslip: p }) => {
      const earn = p.lines.filter((l) => l.side === "earning"), ded = p.lines.filter((l) => l.side === "deduction");
      const text = summaryText(p);
      const lineRow = (l: Line, neg = false) => (
        <li key={l.id} className="text-sm text-fg border-b border-line/60 pb-2">
          <div className="flex flex-wrap justify-between gap-2"><span>{l.label}{l.reference ? <span className="text-fg-subtle"> ({l.reference})</span> : null}</span><span className="font-bold">{neg || l.kind === "reversal" ? "-" : ""}{money(l.amountCents)}</span></div>
          {l.reason && <div className="text-xs text-fg-muted">{l.reason}</div>}
          <button type="button" className="text-xs underline text-fg-muted" onClick={() => setAsking(asking === l.id ? null : l.id)}>Query this line</button>
          {asking === l.id && <QueryForm targetType="payslip_line" targetId={l.id} onDone={() => setAsking(null)} />}
        </li>);
      return (
        <div className="space-y-4">
          <div><p className="text-xs text-fg-muted">{p.association}</p><p className="text-lg font-black text-fg">Payslip {p.number}</p><p className="text-sm text-fg">{p.marshal} · Marshal no. {p.marshalNumber}{p.ranks ? ` · ${p.ranks}` : ""}</p><p className="text-sm text-fg">{p.periodStart} to {p.periodEnd}{p.issuedAt ? ` · issued ${p.issuedAt.slice(0, 10)}` : ""}</p></div>
          <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Earnings</h4>
            <p className="text-sm text-fg">Trips completed: <b>{p.trips}</b> · Trip fees generated: <b>{money(p.tripFeeTotalCents)}</b></p>
            <ul className="space-y-2 mt-2">{earn.map((l) => lineRow(l))}</ul><p className="text-sm font-bold text-fg mt-2">Total earnings {money(p.grossCommissionCents + p.otherEarningsCents)}</p></div>
          <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Deductions</h4>{ded.length === 0 ? <p className="text-sm text-fg-muted">None.</p> : <ul className="space-y-2">{ded.map((l) => lineRow(l))}</ul>}<p className="text-sm font-bold text-fg mt-2">Total deductions {money(p.deductionsCents)}</p></div>
          <p className="text-2xl font-black text-fg" aria-live="polite">Net pay {money(p.netCents)}</p>
          <div className="text-sm text-fg"><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Payment</h4>
            {p.payment.paidAt ? <p>Paid {p.payment.paidAt.slice(0, 10)} by {p.payment.method}{p.payment.reference ? `, reference ${p.payment.reference}` : ""}.</p> : <p>{p.payment.waiting ? `Not paid yet: ${p.payment.waiting}.` : "Not paid yet."}</p>}</div>
          <div className="text-sm text-fg"><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Year to date (from {p.ytd.from})</h4><p>Earned {money(p.ytd.grossCents)} · Deductions {money(p.ytd.deductionsCents)} · Net {money(p.ytd.netCents)}</p></div>
          {p.feesOwedTrips > 0 && <p className="text-xs text-fg-muted">Drivers still owe trip fees for {p.feesOwedTrips} trip{p.feesOwedTrips === 1 ? "" : "s"} ({money(p.feesOwedCents)}). {p.commissionPayableOn === "paid" ? `Commission on these (${money(p.withheldCents)}) is held until the fee is paid.` : "Your commission is counted when the fee is recorded, so this does not change your pay."}</p>}
          <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Day by day</h4><div className="overflow-x-auto"><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-1 pr-3">Date</th><th className="pr-3">Rank</th><th className="pr-3 text-right">Trips</th><th className="pr-3 text-right">Trip fees</th><th className="text-right">Commission</th></tr></thead>
            <tbody>{p.daily.map((d) => <tr key={`${d.date}|${d.rank}`} className="border-b border-line/60"><td className="py-1 pr-3">{d.date}{d.late ? " (late)" : ""}</td><td className="pr-3">{d.rank}</td><td className="pr-3 text-right">{d.trips}</td><td className="pr-3 text-right">{money(d.feesCents)}</td><td className="text-right">{money(d.commissionCents)}</td></tr>)}</tbody></table></div></div>
          <div className="flex flex-wrap items-center gap-3">
            <PdfButton id={p.id} number={p.number} />
            <a className="px-3 py-2 rounded-lg text-sm font-bold border border-line text-fg" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
            <a className="px-3 py-2 rounded-lg text-sm font-bold border border-line text-fg" href={`mailto:?subject=${encodeURIComponent(`Payslip ${p.number}`)}&body=${encodeURIComponent(text)}`}>Email</a>
          </div>
          <p className="text-[11px] text-fg-subtle">{p.note}</p>
        </div>);
    }}</Status>
  );
}

export function MyQueries() {
  const [load, reload] = useLoad<{ disputes: { id: string; targetType: string; message: string; status: string; response: string | null; creditCents: number | null; createdAt: string }[] }>(() => call("/disputes"));
  void reload;
  return (
    <SectionPanel title="My queries">
      <div className="p-4"><Status load={load}>{({ disputes }) => disputes.length === 0 ? <Empty>You have not queried anything.</Empty> : (
        <ul className="space-y-3">{disputes.map((d) => (
          <li key={d.id} className="text-sm text-fg border-b border-line/60 pb-2"><div className="flex flex-wrap justify-between gap-2"><span>{d.message}</span><span className="font-bold">{d.status === "open" ? "Waiting for an answer" : d.status === "under_review" ? "Being looked at" : d.status === "upheld" ? "Upheld" : "Not upheld"}</span></div>
            <div className="text-xs text-fg-muted">{when(d.createdAt)}{d.response ? ` · Answer: ${d.response}` : ""}{d.creditCents ? ` · Credit ${money(d.creditCents)} on your next payslip` : ""}</div></li>))}</ul>)}</Status></div>
    </SectionPanel>
  );
}

export function PayslipsScreen() {
  const [load] = useLoad<{ payslips: PayslipRow[] }>(() => call("/payslips"));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <SectionPanel title="My payslips">
        <div className="p-4 space-y-4">
          <Status load={load}>{({ payslips }) => payslips.length === 0 ? <Empty>No payslips yet. Your association issues one for each pay period.</Empty> : (
            <ul className="space-y-2">{payslips.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg">
                <span><b>{p.number}</b><span className="text-fg-subtle"> · {p.periodStart} to {p.periodEnd} · {p.association}</span></span>
                <span className="flex items-center gap-3"><span className="font-bold">{money(p.netCents)}</span><span className="text-xs text-fg-muted">{p.status === "paid" ? "Paid" : "Issued"}</span>
                  <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Close" : "Open"}</button></span>
              </li>))}</ul>)}</Status>
          {open && <div className="rounded-lg border border-line p-4"><PayslipView id={open} /></div>}
        </div>
      </SectionPanel>
      <CashOutCard />
      <MyQueries />
      <MyDetails />
    </div>
  );
}

/* ───────────────────────── the money check ───────────────────────── */
interface Check { from: string; to: string; trips: number; feesDueCents: number; feesReceivedCents: number; feesOutstandingCents: number; feesWaivedCents: number; tripsOwed: number; outstanding: { driver: string; vehicle: string; trips: number; cents: number }[]; commissionEarnedCents: number; commissionPayableCents: number; commissionWithheldCents: number; commissionRule: string }
export function MoneyCheckScreen() {
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const q = from ? `?from=${from}${to ? `&to=${to}` : ""}` : "";
  const [load] = useLoad<Check>(() => call(`/money-check${q}`), [q]);
  return (
    <SectionPanel title="Money check">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-fg-muted">From<input type="date" className={inputCls + " mt-1 w-40"} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-fg-muted">To<input type="date" className={inputCls + " mt-1 w-40"} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <Status load={load}>{(c) => (
          <>
            <p className="text-sm text-fg" aria-live="polite">{c.from} to {c.to}: <b>{c.trips}</b> trip{c.trips === 1 ? "" : "s"}. Trip fees due <b>{money(c.feesDueCents)}</b>, received <b>{money(c.feesReceivedCents)}</b>, still owed by drivers <b>{money(c.feesOutstandingCents)}</b>.</p>
            <p className="text-sm text-fg">Your commission earned <b>{money(c.commissionEarnedCents)}</b>; payable <b>{money(c.commissionPayableCents)}</b>{c.commissionWithheldCents > 0 ? `; ${money(c.commissionWithheldCents)} is held until drivers pay their fees` : ""}.</p>
            <p className="text-xs text-fg-muted">{c.commissionRule === "paid" ? "Your association pays commission once the driver has paid the trip fee." : "Your commission is counted when the trip fee is recorded, so a driver paying late does not change your pay."}</p>
            {c.outstanding.length > 0 && <ul className="space-y-1 text-sm text-fg">{c.outstanding.map((o) => <li key={`${o.driver}|${o.vehicle}`}>{o.driver} · {o.vehicle}: {o.trips} trip{o.trips === 1 ? "" : "s"}, {money(o.cents)}</li>)}</ul>}
          </>
        )}</Status>
      </div>
    </SectionPanel>
  );
}

/* ───────────────────────── language and consent ───────────────────────── */
export function MyDetails() {
  const [load, reload] = useLoad<{ profile: { marshalNumber: string; language: string; class: string }; consents: { purpose: string; granted: boolean }[] }>(() => call("/profile"));
  return (
    <SectionPanel title="My details and privacy">
      <div className="p-4"><Status load={load}>{({ profile, consents }) => {
        const granted = consents.find((c) => c.purpose === "payroll_records")?.granted ?? false;
        return (
          <div className="space-y-3 text-sm text-fg">
            <p>Marshal number <b>{profile.marshalNumber}</b></p>
            <label className="block text-xs text-fg-muted">Language
              <select className={inputCls + " mt-1 w-48"} value={profile.language} onChange={async (e) => { await call("/profile", { method: "PUT", body: { language: e.target.value } }); reload(); window.dispatchEvent(new Event("vink-language-changed")); }}>
                <option value="en">English</option><option value="xh">isiXhosa</option><option value="zu">isiZulu</option><option value="af">Afrikaans</option>
              </select></label>
            <p className="text-xs text-fg-subtle">Afrikaans is available for the marshal screens. isiZulu and isiXhosa are a first draft of the most-used words only (everything else stays in English) and are still being checked by first-language speakers: please tell your association what to correct.</p>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={granted} onChange={async (e) => { await call("/consents/payroll_records", { method: "PUT", body: { granted: e.target.checked } }); reload(); }} />
              <span>I agree that my trip, commission and payslip records are kept and used to work out and show my pay. I can withdraw this at any time.</span></label>
          </div>);
      }}</Status></div>
    </SectionPanel>
  );
}
