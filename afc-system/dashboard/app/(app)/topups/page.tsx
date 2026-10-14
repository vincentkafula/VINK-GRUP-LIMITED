"use client";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Select, Table, messageOf, useLoad } from "@/components/ui";
import { api, rand, toCents, when } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface CardView { uid: string; status: string; holderName: string | null; balance: number; pendingLoad: number }
interface Topup { id: string; cardUid: string; amount: number; method: string; status: string; reference: string; createdAt: string }

export default function Topups() {
  const { can } = useAuth();
  const [uid, setUid] = useState(""); const [card, setCard] = useState<CardView | null>(null);
  const [amount, setAmount] = useState(""); const [method, setMethod] = useState("CASH"); const [reference, setReference] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);
  const list = useLoad(() => api<{ topups: Topup[] }>("/api/topups?take=50"));

  const find = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null); setCard(null);
    try { setCard((await api<{ card: CardView }>(`/api/cards/${encodeURIComponent(uid.trim())}`)).card); } catch (err) { setMsg({ ok: false, text: messageOf(err) }); }
  };
  const order = async (e: FormEvent) => {
    e.preventDefault(); if (!card) return; setBusy(true); setMsg(null);
    try {
      const r = await api<{ topup: Topup; replay: boolean }>("/api/topups", { method: "POST", body: { cardUid: card.uid, amount: toCents(amount), method, reference: reference.trim() } });
      setMsg({ ok: true, text: r.replay ? "That reference was already recorded: nothing was added twice." : `${rand(r.topup.amount)} recorded. Tap the card on a top-up terminal to load it onto the card.` });
      setAmount(""); setReference(""); setCard((await api<{ card: CardView }>(`/api/cards/${card.uid}`)).card); await list.reload();
    } catch (err) { setMsg({ ok: false, text: messageOf(err) }); } finally { setBusy(false); }
  };
  const cancel = async (id: string) => { try { await api(`/api/topups/${id}/cancel`, { method: "POST" }); await list.reload(); } catch (err) { setMsg({ ok: false, text: messageOf(err) }); } };

  return (
    <>
      <PageHeader title="Top-ups" sub="Record money received. It reaches the card when the card is tapped on a top-up terminal." />
      {msg && <div role={msg.ok ? "status" : "alert"} className={`mb-4 rounded-md p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="1. Find the card">
          <form onSubmit={find} className="flex items-end gap-2"><div className="flex-1"><Field label="Card UID"><Input required value={uid} onChange={(e) => setUid(e.target.value)} placeholder="04a1b2c3d4e5f6" /></Field></div><Button type="submit" variant="ghost">Look up</Button></form>
          {card && <dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><dt className="text-slate-500">Holder</dt><dd>{card.holderName ?? "—"}</dd><dt className="text-slate-500">Status</dt><dd><Badge>{card.status}</Badge></dd><dt className="text-slate-500">Balance</dt><dd>{rand(card.balance)}</dd><dt className="text-slate-500">Waiting to be loaded</dt><dd>{rand(card.pendingLoad)}</dd></dl>}
        </Card>
        <Card title="2. Record the payment">
          <form onSubmit={order} className="space-y-3">
            <Field label="Amount (rand)" hint="R5 to R2 000 at a time; a card holds at most R5 000"><Input required inputMode="decimal" disabled={!card} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="How was it paid?"><Select disabled={!card} value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option>{can("OPERATOR") && <option value="ADMIN">Manual adjustment</option>}</Select></Field>
            <Field label="Receipt or transaction number" hint="Used once only: entering the same number again does not add money twice"><Input required disabled={!card} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
            <Button type="submit" disabled={!card || busy}>{busy ? "Saving…" : "Record top-up"}</Button>
          </form>
        </Card>
      </div>
      <Card title="Recent top-ups" className="mt-5">
        {list.error && <ErrorNote error={list.error} retry={list.reload} />}
        <Table rowKey={(t) => t.id} rows={list.data?.topups ?? []} empty="No top-ups yet." cols={[
          { h: "When", f: (t) => when(t.createdAt) }, { h: "Card", f: (t) => <span className="font-mono">{t.cardUid}</span> }, { h: "Method", f: (t) => t.method.replace("_", " ").toLowerCase() },
          { h: "Reference", f: (t) => t.reference }, { h: "Amount", right: true, f: (t) => rand(t.amount) }, { h: "Status", f: (t) => <Badge>{t.status}</Badge> },
          { h: "", f: (t) => (t.status === "PENDING_LOAD" && can("OPERATOR") ? <button className="text-red-700 underline" onClick={() => cancel(t.id)}>Cancel</button> : null) },
        ]} />
      </Card>
    </>
  );
}
