import { Users } from "lucide-react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { useState } from "react";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, when, inputCls } from "./ui";
import { useAutoRefresh } from "./widgets";

/**
 * A driver's own place in the queue at each rank, and the trip fees on their trips. Seeing your place in the line, from the same record the marshal works from, is what stops an accusation of favouritism
 * before it starts. A driver sees only their own vehicles and fees, never another driver's, and never what a marshal earns.
 */
const COLOR = "#C8102E";
const call = portalClient("driver");
const money = (cents: number) => rand(cents / 100);
interface Position { rankId: string; rank: string; registration: string; position: number; ahead: number; waiting: number; loading: boolean }
interface Fees { trips: number; feesDueCents: number; feesReceivedCents: number; feesOutstandingCents: number; tripsOwed: number; outstanding: { driver: string; vehicle: string; trips: number; cents: number }[] }

export function DriverQueuePosition() {
  const [load, reload] = useLoad<{ positions: Position[] }>(() => call("/queue-position"));
  useAutoRefresh(reload, 15_000);                                  // the line moves while the driver watches
  return (
    <SectionPanel title="My place in the queue" action={<Users className="w-4 h-4 text-fg-muted" aria-hidden />}>
      <div className="p-4"><Status load={load}>{({ positions }) => positions.length === 0 ? <Empty>Your vehicle is not in a queue right now.</Empty> : (
        <ul className="space-y-3">{positions.map((p) => (
          <li key={`${p.rankId}|${p.registration}`} className="text-sm text-fg" aria-live="polite">
            <p><span className="text-3xl font-black mr-2" style={{ color: COLOR }}>{p.position}</span>{p.registration} at {p.rank}</p>
            <p className="text-xs text-fg-muted">{p.loading ? "Loading now." : p.ahead === 0 ? "You are next." : `${p.ahead} vehicle${p.ahead === 1 ? "" : "s"} ahead of you`} · {p.waiting} waiting</p>
          </li>))}</ul>)}</Status></div>
    </SectionPanel>
  );
}

export function DriverFees() {
  const [load] = useLoad<Fees>(() => call("/fees"));
  return (
    <SectionPanel title="Trip fees (last 7 days)">
      <div className="p-4"><Status load={load}>{(f) => f.trips === 0 ? <Empty>No trip fees in this period.</Empty> : (
        <div className="space-y-2 text-sm text-fg">
          <p>{f.trips} trip{f.trips === 1 ? "" : "s"} · due <b>{money(f.feesDueCents)}</b>, paid <b>{money(f.feesReceivedCents)}</b>, still owed <b>{money(f.feesOutstandingCents)}</b>.</p>
          {f.tripsOwed > 0 && <p className="text-xs text-fg-muted">{f.tripsOwed} trip fee{f.tripsOwed === 1 ? " is" : "s are"} waiting to be collected from your VINK account.</p>}
        </div>)}</Status></div>
    </SectionPanel>
  );
}

interface DriverTrip { departureId: string; time: string; rank: string; registration: string; feeCents: number | null; feeStatus: string }
const FEE_TEXT: Record<string, string> = { paid: "Paid", owed: "Owed", waived: "Waived", refunded: "Refunded", none: "No fee" };
/** The driver's own recent trips, each with what its fee is and a way to query it (a trip they did not make, or a fee they should not have paid). */
export function DriverTripFees() {
  const [load] = useLoad<{ trips: DriverTrip[] }>(() => call("/trip-fees"));
  const [asking, setAsking] = useState<string | null>(null), [text, setText] = useState(""), [sent, setSent] = useState<string | null>(null);
  return (
    <SectionPanel title="My trips (last 14 days)">
      <div className="p-4 space-y-3">
        {sent && <p role="status" className="text-sm font-bold text-ok">{sent}</p>}
        <Status load={load}>{({ trips }) => trips.length === 0 ? <Empty>No trips in the last 14 days.</Empty> : (
          <ul className="space-y-3">{trips.map((t) => (
            <li key={t.departureId} className="text-sm text-fg border-b border-line/60 pb-2">
              <div className="flex flex-wrap justify-between gap-2"><span>{when(t.time)} · {t.registration} · {t.rank}</span><span className="font-bold">{t.feeCents === null ? FEE_TEXT.none : `${money(t.feeCents)} ${FEE_TEXT[t.feeStatus] ?? t.feeStatus}`}</span></div>
              <button type="button" className="text-xs underline text-fg-muted" aria-expanded={asking === t.departureId} onClick={() => { setAsking(asking === t.departureId ? null : t.departureId); setSent(null); }}>Query this trip</button>
              {asking === t.departureId && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="block flex-1 min-w-[12rem]"><span className="text-[11px] text-fg-muted">What is wrong? (5 to 500 characters)</span><input aria-label="What is wrong" className={inputCls + " mt-1"} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} /></label>
                  <ActionButton small label="Send query" color={COLOR} onRun={async () => { const r = await call("/disputes", { method: "POST", body: { targetId: t.departureId, message: text } }); if ("error" in r) return { error: r.error }; setText(""); setAsking(null); setSent("Sent. Your association will answer."); return undefined; }} />
                </div>)}
            </li>))}</ul>)}</Status>
      </div>
    </SectionPanel>
  );
}
