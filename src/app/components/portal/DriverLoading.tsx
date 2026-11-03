import { useState } from "react";
import { Bus, Users, Banknote, Coins } from "lucide-react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, when } from "./ui";
import { useAutoRefresh } from "./widgets";
import { useRankLive } from "./rankLive";

const COLOR = "#C8102E";
const call = portalClient("driver");

interface Tap { id: string; at: string; amountCents: number; card: string; status: string }
interface Current { id: string; registration: string | null; passengers: number; totalCents: number; pairedAt: string | null; taps: Tap[] }
interface LoadingData { current: Current | null; period: { sessions: number; passengers: number; totalCents: number } }

/**
 * The Driver Loading Dashboard: the vehicle this driver is loading now on a shared rank device, with the running total and passenger count and the latest taps, live. The driver is whoever
 * tapped their own driver card to start the session (drivers change), and the fares collected are theirs, in their VINK tokens wallet, to withdraw at any time. "Vehicle full" ends the
 * session: the vehicle departs, the session is saved and the next vehicle loads.
 */
export function DriverLoading({ onWithdraw }: { onWithdraw?: () => void }) {
  const [load, reload] = useLoad<LoadingData>(() => call("/loading"));
  const live = useRankLive(() => reload());                              // my session changed: fetch the real state now
  useAutoRefresh(reload, live ? 60_000 : 5_000);                         // and keep checking, quickly when the live connection is down
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4">
      <Status load={load}>{({ current, period }) => (
        <>
          {current ? (
            <SectionPanel title={`Loading now${current.registration ? ` · ${current.registration}` : ""}`} action={<span className="text-xs text-fg-muted" role="status">{live ? "Live" : "Updating every few seconds"}</span>}>
              <div className="p-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><p className="text-[11px] uppercase tracking-wide text-fg-muted">Collected this load</p><p aria-live="polite" className="text-4xl font-black text-fg">{rand(current.totalCents / 100)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-fg-muted">Passengers</p><p aria-live="polite" className="text-4xl font-black text-fg">{current.passengers}</p></div>
                </div>
                <div>
                  <p className="text-xs font-bold text-fg mb-1">Latest taps</p>
                  {current.taps.length === 0 ? <Empty>No passenger has tapped yet.</Empty> : (
                    <ul className="space-y-1">{current.taps.map((t) => (
                      <li key={t.id} className="flex flex-wrap justify-between gap-2 text-sm text-fg"><span>{when(t.at)} · <span className="text-fg-subtle">{t.card}</span></span><span className={t.status === "confirmed" ? "font-bold" : "text-bad"}>{t.status === "confirmed" ? rand(t.amountCents / 100) : "Declined"}</span></li>
                    ))}</ul>
                  )}
                </div>
                <div className="pt-2 border-t border-line">
                  {!confirming ? (
                    <button type="button" onClick={() => setConfirming(true)} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLOR }}>Vehicle full: depart</button>
                  ) : (
                    <div role="group" aria-label="Confirm departure" className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-fg">Depart with {current.passengers} passenger{current.passengers === 1 ? "" : "s"} and {rand(current.totalCents / 100)}?</span>
                      <ActionButton label="Yes, depart" busyLabel="Departing…" color={COLOR} onRun={async () => { const r = await call("/loading/depart", { method: "POST", body: {} }); reload(); if (!("error" in r)) setConfirming(false); return "error" in r ? { error: r.error } : { message: "Departed. The next vehicle can load." }; }} />
                      <button type="button" onClick={() => setConfirming(false)} className="px-3 py-2 rounded-lg text-sm border border-line text-fg">Not yet</button>
                    </div>
                  )}
                </div>
              </div>
            </SectionPanel>
          ) : (
            <SectionPanel title="Loading" action={<span className="text-xs text-fg-muted" role="status">{live ? "Live" : "Updating every few seconds"}</span>}>
              <div className="p-4"><Empty>No vehicle is loading for you. When the marshal starts loading your vehicle, tap your driver card on the rank device to begin.</Empty></div>
            </SectionPanel>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Trips today" value={String(period.sessions)} icon={<Bus className="w-5 h-5" />} color={COLOR} />
            <StatCard label="Passengers today" value={String(period.passengers)} icon={<Users className="w-5 h-5" />} color={COLOR} />
            <StatCard label="Collected today" value={rand(period.totalCents / 100)} icon={<Banknote className="w-5 h-5" />} color={COLOR} />
          </div>
        </>
      )}</Status>
      <SectionPanel title="Your money">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted max-w-xl">The fares you collect go straight into your VINK tokens wallet, less VINK&apos;s fee. You can withdraw them at any time, for example to cover fuel and other costs.</p>
          {onWithdraw && <button type="button" onClick={onWithdraw} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLOR }}><Coins className="w-4 h-4" />Withdraw your money</button>}
        </div>
      </SectionPanel>
    </div>
  );
}
