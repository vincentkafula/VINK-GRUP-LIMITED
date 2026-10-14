"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Table, messageOf, useLoad } from "@/components/ui";
import { api, toCents, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface CardRow { uid: string; status: string; holderName: string | null; category: string; issuedAt: string; lastTapAt: string | null }

export default function CardsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useLoad(() => api<{ total: number; cards: CardRow[] }>(`/api/cards?take=100${search ? `&search=${encodeURIComponent(search)}` : ""}${status ? `&status=${status}` : ""}`), [search, status]);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader title="Cards" sub="Every card issued, with its holder and status" actions={can("AGENT", "OPERATOR") && <Button onClick={() => setAdding(true)}>Register a card</Button>} />
      <Card>
        <div className="mb-3 flex flex-wrap gap-3">
          <Input aria-label="Search cards" placeholder="Search by UID or holder" className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select aria-label="Filter by status" className="max-w-[10rem]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="BLOCKED">Blocked</option><option value="LOST">Lost</option><option value="EXPIRED">Expired</option>
          </Select>
        </div>
        {error && <ErrorNote error={error} retry={reload} />}
        {loading && !data ? <Loading /> : data && (
          <Table rowKey={(c) => c.uid} rows={data.cards} empty="No cards match." cols={[
            { h: "Card", f: (c) => <Link className="font-mono text-slate-900 underline" href={`/cards/${c.uid}`}>{c.uid}</Link> },
            { h: "Holder", f: (c) => c.holderName ?? "—" },
            { h: "Category", f: (c) => c.category },
            { h: "Status", f: (c) => <Badge>{c.status}</Badge> },
            { h: "Last tap", f: (c) => when(c.lastTapAt) },
          ]} />
        )}
        {data && data.total > data.cards.length && <p className="mt-2 text-xs text-slate-500">Showing the first {data.cards.length} of {data.total}. Narrow the search to see others.</p>}
      </Card>
      {adding && <RegisterCard onClose={() => setAdding(false)} onDone={() => { setAdding(false); void reload(); }} />}
    </>
  );
}

function RegisterCard({ onClose, onDone }: { onClose(): void; onDone(): void }) {
  const [uid, setUid] = useState(""); const [holder, setHolder] = useState(""); const [category, setCategory] = useState("adult"); const [balance, setBalance] = useState("0");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api("/api/cards", { method: "POST", body: { uid, holderName: holder || undefined, category, initialBalance: toCents(balance || "0") } }); onDone(); }
    catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Register a card" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <ErrorNote error={error} />}
        <Field label="Card UID" hint="14 hex characters, printed by the personalisation script (colons and spaces are fine)"><Input required value={uid} onChange={(e) => setUid(e.target.value)} placeholder="04a1b2c3d4e5f6" /></Field>
        <Field label="Holder name"><Input value={holder} onChange={(e) => setHolder(e.target.value)} /></Field>
        <Field label="Passenger category" hint="Students, seniors and children pay less; the discounts are set under Fares"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{["adult", "student", "senior", "child", "staff"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Balance already on the card (rand)" hint="Only if the card was personalised with a starting balance. Use Top-ups for money added later."><Input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Register"}</Button></div>
      </form>
    </Modal>
  );
}
