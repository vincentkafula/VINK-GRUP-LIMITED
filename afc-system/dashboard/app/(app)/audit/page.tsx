"use client";
import { Card, ErrorNote, Loading, PageHeader, Table, useLoad } from "@/components/ui";
import { api, when } from "@/lib/api";

interface Entry { id: string; at: string; actorEmail: string; action: string; target: string | null; detail: Record<string, unknown> | null; ip: string | null }

export default function Audit() {
  const { data, error, loading, reload } = useLoad(() => api<{ entries: Entry[] }>("/api/audit?take=200"));
  return (
    <>
      <PageHeader title="Audit log" sub="Who did what, newest first. Entries cannot be edited from this system." />
      {error && <ErrorNote error={error} retry={reload} />}
      <Card>
        {loading && !data ? <Loading /> : data && (
          <Table rowKey={(e) => e.id} rows={data.entries} empty="Nothing recorded yet." cols={[
            { h: "When", f: (e) => when(e.at) }, { h: "Who", f: (e) => e.actorEmail }, { h: "Action", f: (e) => e.action }, { h: "On", f: (e) => e.target ?? "—" },
            { h: "Details", f: (e) => <code className="text-xs text-slate-600">{e.detail ? JSON.stringify(e.detail) : ""}</code> }, { h: "From", f: (e) => e.ip ?? "" },
          ]} />
        )}
      </Card>
    </>
  );
}
