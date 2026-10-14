"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, ErrorNote, Kpi, Loading, PageHeader, Select, Table, messageOf, useLoad } from "@/components/ui";
import { api, download, rand, when } from "@/lib/api";

interface Ticket { id: number; cardUid: string; routeId: number; price: number; status: string; method: string; reference: string; validFrom: string; validUntil: string; issuedAt: string; usedAt: string | null; usedDevice: string | null }
interface Report { totals: { sold: number; amount: number; used: number } }

export default function Tickets() {
  const [status, setStatus] = useState("");
  const list = useLoad(() => api<{ tickets: Ticket[] }>(`/api/tickets?take=100${status ? `&status=${status}` : ""}`), [status]);
  const rep = useLoad(() => api<Report>("/api/reports/tickets"));
  const [err, setErr] = useState<string | null>(null);
  const csv = async () => { setErr(null); try { await download("/api/reports/tickets?format=csv", "tickets.csv"); } catch (e) { setErr(messageOf(e)); } };
  const expired = (t: Ticket) => t.status === "ISSUED" && new Date(t.validUntil) < new Date();

  return (
    <>
      <PageHeader title="Single-trip tickets" sub="Paper-thin Ultralight tickets sold at the counter. Each can be used once." actions={<Button variant="ghost" onClick={csv}>Download CSV</Button>} />
      {(list.error || rep.error || err) && <ErrorNote error={(list.error ?? rep.error ?? err)!} retry={list.reload} />}
      {rep.data && <div className="mb-5 grid grid-cols-3 gap-3"><Kpi label="Sold (7 days)" value={rep.data.totals.sold} /><Kpi label="Takings (7 days)" value={rand(rep.data.totals.amount)} /><Kpi label="Used (7 days)" value={rep.data.totals.used} /></div>}
      <Card className="mb-5"><p className="text-sm text-slate-700">Tickets are sold and written at the counter with <code>npm run tickets -- issue</code> (see the README). A ticket is checked on the vehicle with the server&apos;s public key, so validators can check tickets but never make them. If the same ticket number is used twice, an alert appears under <Link className="underline" href="/anomalies">Alerts</Link>.</p></Card>
      <Card title="Tickets" actions={<Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="ISSUED">Unused</option><option value="USED">Used</option></Select>}>
        {list.loading && !list.data ? <Loading /> : list.data && (
          <Table rowKey={(t) => String(t.id)} rows={list.data.tickets} empty="No tickets yet." cols={[
            { h: "No.", f: (t) => t.id }, { h: "Card", f: (t) => <Link className="font-mono underline" href={`/cards/${t.cardUid}`}>{t.cardUid.slice(-8)}</Link> },
            { h: "Route", f: (t) => (t.routeId ? t.routeId : "any") }, { h: "Price", right: true, f: (t) => rand(t.price) },
            { h: "Sold", f: (t) => when(t.issuedAt) }, { h: "Valid until", f: (t) => when(t.validUntil) },
            { h: "Status", f: (t) => (expired(t) ? <Badge>EXPIRED</Badge> : <Badge>{t.status === "ISSUED" ? "ACTIVE" : "USED"}</Badge>) },
            { h: "Used", f: (t) => (t.usedAt ? `${when(t.usedAt)} on ${t.usedDevice}` : "—") },
          ]} />
        )}
      </Card>
    </>
  );
}
