"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorNote, Kpi, Loading, PageHeader, Select, Table, messageOf, useLoad } from "@/components/ui";
import { api, rand, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface History {
  card: { uid: string; status: string; holderName: string | null; category: string; balance: number; pendingLoad: number; blockedReason: string | null; lastCounter: number; lastTapAt: string | null; issuedAt: string };
  txns: { id: string; tappedAt: string; deviceId: string; result: string; kind: string | null; denyReason: string | null; fare: number; balanceAfter: number; offline: boolean }[];
  topups: { id: string; createdAt: string; amount: number; method: string; status: string; reference: string }[];
  ledger: { id: string; at: string; amount: number; balanceAfter: number | null; kind: string; memo: string | null }[];
  anomalies: { id: string; createdAt: string; kind: string; severity: string; detail: string; resolvedAt: string | null }[];
}

export default function CardDetail() {
  const { uid } = useParams<{ uid: string }>();
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<History>(`/api/cards/${uid}/history`), [uid]);
  const [note, setNote] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, ok: string) => { setNote(null); try { await fn(); setNote(ok); await reload(); } catch (e) { setNote(messageOf(e)); } };
  const setStatus = (status: string) => {
    const reason = status === "ACTIVE" ? undefined : window.prompt(`Reason for marking this card ${status.toLowerCase()} (shown to staff):`) ?? undefined;
    if (status !== "ACTIVE" && reason === undefined) return;
    void act(() => api(`/api/cards/${uid}/status`, { method: "PATCH", body: { status, reason } }), `Card is now ${status.toLowerCase()}. Validators get the new hotlist on their next sync.`);
  };

  return (
    <>
      <PageHeader title={`Card ${uid}`} sub={data?.card.holderName ?? undefined} />
      {error && <ErrorNote error={error} retry={reload} />}
      {note && <div role="status" className="mb-4 rounded-md bg-slate-100 p-3 text-sm">{note}</div>}
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Balance (books)" value={rand(data.card.balance)} sub={data.card.pendingLoad ? `${rand(data.card.pendingLoad)} paid, waiting to be loaded` : undefined} />
            <Kpi label="Status" value={<Badge>{data.card.status}</Badge>} sub={data.card.blockedReason ?? undefined} />
            <Kpi label="Category" value={data.card.category} />
            <Kpi label="Last tap" value={when(data.card.lastTapAt)} sub={`tap counter ${data.card.lastCounter}`} />
          </div>
          {can("OPERATOR") && (
            <Card title="Manage" className="mb-5">
              <div className="flex flex-wrap items-end gap-3">
                {data.card.status === "ACTIVE" ? (<><Button variant="danger" onClick={() => setStatus("BLOCKED")}>Block</Button><Button variant="danger" onClick={() => setStatus("LOST")}>Mark lost</Button></>) : <Button onClick={() => setStatus("ACTIVE")}>Reactivate</Button>}
                <div className="flex items-end gap-2">
                  <label className="text-sm"><span className="mb-1 block font-medium">Category</span><Select value={category ?? data.card.category} onChange={(e) => setCategory(e.target.value)}>{["adult", "student", "senior", "child", "staff"].map((c) => <option key={c}>{c}</option>)}</Select></label>
                  <Button variant="ghost" disabled={!category || category === data.card.category} onClick={() => act(() => api(`/api/cards/${uid}/category`, { method: "PATCH", body: { category } }), "Category updated.")}>Save category</Button>
                </div>
              </div>
            </Card>
          )}
          {data.anomalies.length > 0 && (
            <Card title="Alerts on this card" className="mb-5">
              <Table rowKey={(a) => a.id} rows={data.anomalies} cols={[{ h: "When", f: (a) => when(a.createdAt) }, { h: "Severity", f: (a) => <Badge>{a.severity}</Badge> }, { h: "What", f: (a) => a.detail }, { h: "Resolved", f: (a) => (a.resolvedAt ? when(a.resolvedAt) : "open") }]} />
            </Card>
          )}
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Taps">
              <Table rowKey={(t) => t.id} rows={data.txns} empty="No taps yet." cols={[
                { h: "When", f: (t) => when(t.tappedAt) }, { h: "Device", f: (t) => t.deviceId },
                { h: "What", f: (t) => (t.result === "ok" ? (t.kind ?? "").replace("_", " ") : `refused: ${(t.denyReason ?? "").replace(/_/g, " ").toLowerCase()}`) + (t.offline ? " (offline)" : "") },
                { h: "Fare", right: true, f: (t) => (t.result === "ok" ? rand(t.fare) : "—") }, { h: "Balance", right: true, f: (t) => rand(t.balanceAfter) },
              ]} />
            </Card>
            <Card title="Top-ups">
              <Table rowKey={(t) => t.id} rows={data.topups} empty="No top-ups yet." cols={[{ h: "When", f: (t) => when(t.createdAt) }, { h: "Method", f: (t) => t.method.replace("_", " ").toLowerCase() }, { h: "Reference", f: (t) => t.reference }, { h: "Amount", right: true, f: (t) => rand(t.amount) }, { h: "Status", f: (t) => <Badge>{t.status}</Badge> }]} />
            </Card>
          </div>
          <Card title="Ledger" className="mt-5">
            <Table rowKey={(l) => l.id} rows={data.ledger} empty="Nothing posted yet." cols={[{ h: "When", f: (l) => when(l.at) }, { h: "Entry", f: (l) => l.kind.replace(/_/g, " ").toLowerCase() }, { h: "Note", f: (l) => l.memo ?? "" }, { h: "Amount", right: true, f: (l) => rand(l.amount) }, { h: "Balance", right: true, f: (l) => (l.balanceAfter === null ? "" : rand(l.balanceAfter)) }]} />
          </Card>
        </>
      )}
    </>
  );
}
