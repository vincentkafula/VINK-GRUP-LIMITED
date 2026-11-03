import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, inputCls } from "./ui";
import { useAutoRefresh } from "./widgets";
import { useRankLive } from "./rankLive";

const COLOR = "#C8102E";
const call = portalClient("marshal");

interface QItem { id: string; vehicleId: string; registration: string; seats: number | null; status: "waiting" | "pairing" | "loading"; sessionId: string | null; driverName: string | null; passengers: number; totalCents: number }
interface Device { id: string; serial: string; model: string; status: string; online: boolean; sessionId: string | null }

/**
 * Loading at a rank, on the rank's shared card device. The marshal starts loading the vehicle at the front of the queue on a free device; the device then waits for the DRIVER to tap their own driver
 * card (no card tap, no pairing); passengers pay on it; when the vehicle is full the marshal (or the driver) departs it and the next vehicle can load. Updates live for this marshal.
 */
export function MarshalLoading({ rank }: { rank: { id: string; name: string } }) {
  const [board, reload] = useLoad<{ queue: QItem[]; devices: Device[] }>(() => call(`/ranks/${rank.id}/loading`));
  const live = useRankLive(() => reload());
  useAutoRefresh(reload, live ? 60_000 : 8_000);
  const [picked, setPicked] = useState("");

  return (
    <Status load={board}>{({ queue, devices }) => {
      const free = devices.filter((d) => d.status === "active" && !d.sessionId);
      const device = free.find((d) => d.id === picked) ?? free.find((d) => d.online) ?? free[0];
      return (
        <>
          <SectionPanel title={`Card devices at ${rank.name}`} action={<span className="text-xs text-fg-muted" role="status">{live ? "Live" : "Updating every few seconds"}</span>}>
            <div className="p-4">{devices.length === 0 ? <Empty>This rank has no shared card device yet. An administrator sets one up by marking a terminal as a rank device for this rank.</Empty> : (
              <ul className="space-y-2">{devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg">
                  <span>{d.serial}<span className="text-fg-subtle"> · {d.model}</span></span>
                  <span className="flex gap-2 text-xs">
                    <span className={d.online ? "text-ok" : "text-fg-muted"}>{d.online ? "Online" : "Offline"}</span>
                    <span className="text-fg-muted">{d.status !== "active" ? d.status : d.sessionId ? "In use" : "Free"}</span>
                  </span>
                </li>))}</ul>
            )}</div>
          </SectionPanel>
          <SectionPanel title="The queue">
            <div className="p-4 space-y-3">
              {queue.length === 0 ? <Empty>Nobody is waiting. Add a vehicle on the Ranks &amp; queue screen.</Empty> : (
                <>
                  {free.length > 1 && (
                    <label className="block text-xs text-fg-muted">Device to load on
                      <select className={inputCls + " mt-1 w-56"} value={device?.id ?? ""} onChange={(e) => setPicked(e.target.value)}>{free.map((d) => <option key={d.id} value={d.id}>{d.serial}{d.online ? "" : " (offline)"}</option>)}</select>
                    </label>
                  )}
                  <ol className="space-y-3">{queue.map((x, i) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg">
                      <span><b className="mr-2" style={{ color: COLOR }}>{i + 1}</b>{x.registration}{x.seats ? <span className="text-fg-subtle"> · {x.seats} seats</span> : null}
                        <span className="block text-xs text-fg-muted">
                          {x.status === "waiting" && "Waiting"}
                          {x.status === "pairing" && "Waiting for the driver to tap their driver card"}
                          {x.status === "loading" && `Loading · ${x.driverName ?? "driver"} · ${x.passengers} passenger${x.passengers === 1 ? "" : "s"} · ${rand(x.totalCents / 100)}`}
                        </span>
                      </span>
                      <span className="flex gap-2">
                        {x.status === "waiting" && device && <ActionButton small label="Start loading" busyLabel="Starting…" color={COLOR} onRun={async () => { const r = await call(`/ranks/${rank.id}/sessions`, { method: "POST", body: { terminalId: device.id, queueId: x.id } }); reload(); return "error" in r ? { error: r.error } : { message: "Loading started. Waiting for the driver's card." }; }} />}
                        {x.status === "waiting" && !device && <span className="text-xs text-fg-muted">No free device</span>}
                        {x.status === "loading" && x.sessionId && <ActionButton small label="Depart" busyLabel="Departing…" color={COLOR} onRun={async () => { const r = await call(`/ranks/${rank.id}/sessions/${x.sessionId}/close`, { method: "POST", body: {} }); reload(); return "error" in r ? { error: r.error } : { message: "Departed." }; }} />}
                        {(x.status === "pairing" || (x.status === "loading" && x.passengers === 0)) && x.sessionId && <ActionButton small label="Cancel" color="#6B7280" onRun={async () => { const r = await call(`/ranks/${rank.id}/sessions/${x.sessionId}/cancel`, { method: "POST", body: {} }); reload(); return "error" in r ? { error: r.error } : { message: "Cancelled." }; }} />}
                      </span>
                    </li>))}</ol>
                </>
              )}
            </div>
          </SectionPanel>
        </>
      );
    }}</Status>
  );
}
