"use client";
import { useState } from "react";
import { Bars } from "@/components/Bars";
import { Button, Card, ErrorNote, Field, Input, Kpi, Loading, PageHeader, Select, Table, messageOf, useLoad } from "@/components/ui";
import { api, download, rand } from "@/lib/api";

interface Revenue { totals: { revenue: number; trips: number; penalties: number }; rows: { key: string; revenue: number; trips: number; tapIns: number; penalties: number; offlineTaps: number }[] }
interface Failed { rows: { reason: string; device: string; count: number }[] }
interface Topups { rows: { method: string; count: number; total: number }[] }

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default function Reports() {
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 6 * 86400_000))); const [to, setTo] = useState(isoDay(today));
  const [groupBy, setGroupBy] = useState("day");
  const [err, setErr] = useState<string | null>(null);
  // the range is inclusive of the last day: send the start of the next day as the end
  const range = `from=${from}T00:00:00%2B02:00&to=${isoDay(new Date(new Date(to).getTime() + 86400_000))}T00:00:00%2B02:00`;
  const rev = useLoad(() => api<Revenue>(`/api/reports/revenue?groupBy=${groupBy}&${range}`), [from, to, groupBy]);
  const failed = useLoad(() => api<Failed>(`/api/reports/failed-taps?${range}`), [from, to]);
  const topups = useLoad(() => api<Topups>(`/api/reports/topups?${range}`), [from, to]);
  const csv = async (path: string, name: string) => { setErr(null); try { await download(path, name); } catch (e) { setErr(messageOf(e)); } };

  return (
    <>
      <PageHeader title="Reports" sub="Revenue, trips and refused taps. Times are South African time." />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Group revenue by"><Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}><option value="day">Day</option><option value="route">Route</option><option value="device">Device</option><option value="operator">Operator</option></Select></Field>
          <Button variant="ghost" onClick={() => csv(`/api/reports/revenue?groupBy=${groupBy}&format=csv&${range}`, `revenue-by-${groupBy}.csv`)}>Download revenue CSV</Button>
          <Button variant="ghost" onClick={() => csv(`/api/reports/taps.csv?${range}`, "taps.csv")}>Download every tap (CSV)</Button>
        </div>
      </Card>
      {(err || rev.error) && <ErrorNote error={(err ?? rev.error)!} retry={rev.reload} />}
      {rev.loading && !rev.data ? <Loading /> : rev.data && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-3"><Kpi label="Revenue" value={rand(rev.data.totals.revenue)} /><Kpi label="Trips" value={rev.data.totals.trips.toLocaleString("en-ZA")} /><Kpi label="Penalty fares" value={rand(rev.data.totals.penalties)} sub="trips never tapped out" /></div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title={`Revenue by ${groupBy}`}><Bars items={rev.data.rows.map((r) => ({ label: r.key, value: r.revenue }))} format={rand} /></Card>
            <Card title="Detail">
              <Table rowKey={(r) => r.key} rows={rev.data.rows} empty="No taps in this period." cols={[
                { h: groupBy[0].toUpperCase() + groupBy.slice(1), f: (r) => r.key }, { h: "Revenue", right: true, f: (r) => rand(r.revenue) }, { h: "Trips", right: true, f: (r) => r.trips },
                { h: "Tap-ins", right: true, f: (r) => r.tapIns }, { h: "Offline", right: true, f: (r) => r.offlineTaps },
              ]} />
            </Card>
          </div>
        </>
      )}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Refused taps" actions={<Button variant="ghost" onClick={() => csv(`/api/reports/failed-taps?format=csv&${range}`, "failed-taps.csv")}>CSV</Button>}>
          {failed.error ? <ErrorNote error={failed.error} retry={failed.reload} /> : <Table rowKey={(r) => r.reason + r.device} rows={failed.data?.rows ?? []} empty="No refused taps." cols={[{ h: "Reason", f: (r) => r.reason.replace(/_/g, " ").toLowerCase() }, { h: "Device", f: (r) => r.device }, { h: "Count", right: true, f: (r) => r.count }]} />}
        </Card>
        <Card title="Top-ups loaded" actions={<Button variant="ghost" onClick={() => csv(`/api/reports/topups?format=csv&${range}`, "topups.csv")}>CSV</Button>}>
          {topups.error ? <ErrorNote error={topups.error} retry={topups.reload} /> : <Table rowKey={(r) => r.method} rows={topups.data?.rows ?? []} empty="No top-ups loaded." cols={[{ h: "Method", f: (r) => r.method.replace("_", " ").toLowerCase() }, { h: "Count", right: true, f: (r) => r.count }, { h: "Total", right: true, f: (r) => rand(r.total) }]} />}
        </Card>
      </div>
    </>
  );
}
