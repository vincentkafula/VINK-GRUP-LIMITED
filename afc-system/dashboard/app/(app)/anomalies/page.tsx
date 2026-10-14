"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card, ErrorNote, Loading, PageHeader, Select, Table, messageOf, useLoad } from "@/components/ui";
import { api, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Anomaly { id: string; createdAt: string; kind: string; severity: string; cardUid: string | null; deviceId: string | null; detail: string; resolvedAt: string | null }

export default function Alerts() {
  const { can } = useAuth();
  const [open, setOpen] = useState("1");
  const { data, error, loading, reload } = useLoad(() => api<{ anomalies: Anomaly[] }>(`/api/anomalies?open=${open}`), [open]);
  const [err, setErr] = useState<string | null>(null);
  const resolve = async (id: string) => { try { await api(`/api/anomalies/${id}/resolve`, { method: "POST" }); await reload(); } catch (e) { setErr(messageOf(e)); } };

  return (
    <>
      <PageHeader title="Alerts" sub="Things that should not happen: a balance that does not add up, a card counter used twice, a device that skipped a number" actions={<Select aria-label="Show" value={open} onChange={(e) => setOpen(e.target.value)}><option value="1">Open only</option><option value="0">All</option></Select>} />
      {(error || err) && <ErrorNote error={(error ?? err)!} retry={reload} />}
      <Card>
        {loading && !data ? <Loading /> : data && (
          <Table rowKey={(a) => a.id} rows={data.anomalies} empty="No alerts. The books and the devices agree." cols={[
            { h: "When", f: (a) => when(a.createdAt) }, { h: "Severity", f: (a) => <Badge>{a.severity}</Badge> }, { h: "Kind", f: (a) => a.kind.replace(/_/g, " ").toLowerCase() },
            { h: "Card", f: (a) => (a.cardUid ? <Link className="font-mono underline" href={`/cards/${a.cardUid}`}>{a.cardUid.slice(-8)}</Link> : "—") }, { h: "Device", f: (a) => a.deviceId ?? "—" },
            { h: "What happened", f: (a) => a.detail },
            { h: "", f: (a) => (a.resolvedAt ? <span className="text-slate-500">resolved</span> : can("OPERATOR") ? <button className="underline" onClick={() => resolve(a.id)}>Mark resolved</button> : null) },
          ]} />
        )}
      </Card>
    </>
  );
}
