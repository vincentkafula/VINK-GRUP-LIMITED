import { useState } from "react";
import { SectionPanel } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, rand, when, inputCls } from "./ui";
import { CsvButton } from "./widgets";

interface Totals { trips: number; passengers: number; collectedCents: number; feeCents: number; netCents: number }
interface Group extends Totals { key: string; name: string }
interface Line { id: string; pairedAt: string; inProgress: boolean; registration: string; driver: string | null; route: string | null; place: string; passengers: number; collectedCents: number; feeCents: number; netCents: number }
interface Report { by: "session" | "driver" | "vehicle" | "route"; from: string; to: string; truncated: boolean; totals: Totals; rows: (Group | Line)[] }

const money = (cents: number) => rand(cents / 100);

/**
 * What the loads on the shared rank devices (and on an owner's own devices) collected, for a period: one row per load, or grouped by driver, vehicle or route. "Collected" is what
 * passengers paid, "fee" is VINK's fee on it and "left" is what remains for the driver (or the owner under a salary agreement), the same figures the wallets are settled with.
 * Each role sees only its own: an owner their vehicles, an association its ranks and devices, a driver their own loads, a marshal the loads they started.
 */
export function LoadingReport({ segment, color = "#C8102E" }: { segment: "owner" | "association" | "driver" | "marshal"; color?: string }) {
  const call = portalClient(segment);
  const [by, setBy] = useState<Report["by"]>(segment === "driver" ? "session" : "driver");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const q = `by=${by}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;
  const [load] = useLoad<Report>(() => call(`/loading/report?${q}`), [q]);

  return (
    <SectionPanel title="What loads collected" action={<CsvButton segment={segment} path={`/loading/report.csv?${q}`} color={color} />}>
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-fg-muted">Group by
            <select className={inputCls + " mt-1 w-44"} value={by} onChange={(e) => setBy(e.target.value as Report["by"])}>
              <option value="session">Each load</option>{segment !== "driver" && <option value="driver">Driver</option>}<option value="vehicle">Vehicle</option><option value="route">Route</option>
            </select>
          </label>
          <label className="text-xs text-fg-muted">From<input type="date" className={inputCls + " mt-1 w-40"} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-fg-muted">To<input type="date" className={inputCls + " mt-1 w-40"} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <Status load={load}>{(r) => (
          <>
            <p className="text-sm text-fg" aria-live="polite">{r.from} to {r.to}: <b>{r.totals.trips}</b> load{r.totals.trips === 1 ? "" : "s"}, <b>{r.totals.passengers}</b> passenger{r.totals.passengers === 1 ? "" : "s"}, collected <b>{money(r.totals.collectedCents)}</b>, fee {money(r.totals.feeCents)}, <b>{money(r.totals.netCents)}</b> left.</p>
            {r.truncated && <p role="alert" className="text-xs text-bad">There are more than 5,000 loads in this period, so only the latest are shown. Choose a shorter period.</p>}
            {r.rows.length === 0 ? <Empty>No loads in this period.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-fg">
                  <thead><tr className="text-left text-xs text-fg-muted border-b border-line">
                    {r.by === "session" ? <><th className="py-2 pr-3">When</th><th className="pr-3">Vehicle</th><th className="pr-3">Driver</th><th className="pr-3">Route</th><th className="pr-3">Where</th><th className="pr-3 text-right">Passengers</th></> : <><th className="py-2 pr-3">{r.by === "driver" ? "Driver" : r.by === "vehicle" ? "Vehicle" : "Route"}</th><th className="pr-3 text-right">Loads</th><th className="pr-3 text-right">Passengers</th></>}
                    <th className="pr-3 text-right">Collected</th><th className="pr-3 text-right">Fee</th><th className="text-right">Left</th>
                  </tr></thead>
                  <tbody>{r.by === "session"
                    ? (r.rows as Line[]).map((x) => (
                      <tr key={x.id} className="border-b border-line/60">
                        <td className="py-2 pr-3">{when(x.pairedAt)}{x.inProgress && <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>Loading now</span>}</td>
                        <td className="pr-3">{x.registration}</td><td className="pr-3">{x.driver ?? "—"}</td><td className="pr-3">{x.route ?? "—"}</td><td className="pr-3">{x.place}</td><td className="pr-3 text-right">{x.passengers}</td>
                        <td className="pr-3 text-right">{money(x.collectedCents)}</td><td className="pr-3 text-right">{money(x.feeCents)}</td><td className="text-right font-bold">{money(x.netCents)}</td>
                      </tr>))
                    : (r.rows as Group[]).map((x) => (
                      <tr key={x.key} className="border-b border-line/60">
                        <td className="py-2 pr-3">{x.name}</td><td className="pr-3 text-right">{x.trips}</td><td className="pr-3 text-right">{x.passengers}</td>
                        <td className="pr-3 text-right">{money(x.collectedCents)}</td><td className="pr-3 text-right">{money(x.feeCents)}</td><td className="text-right font-bold">{money(x.netCents)}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}</Status>
      </div>
    </SectionPanel>
  );
}
