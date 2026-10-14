"use client";
import { Bars } from "@/components/Bars";
import { LiveFeed } from "@/components/LiveFeed";
import { Card, ErrorNote, Kpi, Loading, PageHeader, useLoad } from "@/components/ui";
import { api, rand } from "@/lib/api";

interface Summary { last24h: { revenue: number; trips: number; failedTaps: number; topups: number; ticketSales: number; ticketsSold: number }; last7d: { day: string; revenue: number; trips: number }[]; openAnomalies: number; devices: { total: number; online: number }; blockedCards: number }

export default function Overview() {
  const { data, error, loading, reload } = useLoad(() => api<Summary>("/api/reports/summary"));
  return (
    <>
      <PageHeader title="Overview" sub="The last 24 hours across all routes you can see" />
      {error && <ErrorNote error={error} retry={reload} />}
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Revenue (24h)" value={rand(data.last24h.revenue)} />
            <Kpi label="Trips (24h)" value={data.last24h.trips.toLocaleString("en-ZA")} />
            <Kpi label="Refused taps (24h)" value={data.last24h.failedTaps.toLocaleString("en-ZA")} />
            <Kpi label="Top-ups loaded (24h)" value={rand(data.last24h.topups)} />
            <Kpi label="Tickets sold (24h)" value={data.last24h.ticketsSold} sub={rand(data.last24h.ticketSales)} />
            <Kpi label="Devices online" value={`${data.devices.online} / ${data.devices.total}`} sub="seen in the last 15 minutes" tone={data.devices.online < data.devices.total ? "warn" : "ok"} />
            <Kpi label="Open alerts" value={data.openAnomalies} sub="medium and high" tone={data.openAnomalies ? "warn" : "ok"} />
            <Kpi label="Blocked / lost cards" value={data.blockedCards} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Revenue, last 7 days"><Bars items={data.last7d.map((d) => ({ label: d.day.slice(5), value: d.revenue }))} format={rand} /></Card>
            <Card title="Live taps"><LiveFeed onEvent={(e) => { if (e.type === "tap") void reload(); }} /></Card>
          </div>
        </>
      )}
    </>
  );
}
