import { useState } from "react";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, inputCls } from "./ui";
import { sendOrQueue, useOutbox, newRef } from "./offlineQueue";
import { FileButton } from "./AssociationFinance";
import { toCents } from "./OwnerDriverPay";

/**
 * The owner's association (docs/OWNER_DASHBOARD.md, slice B): who they belong to, their membership and standing, the routes on their licences, what they owe, the association's receipts, and "I have paid".
 * "I have paid" is a RECORD that waits for the association to check its own bank and confirm it (which issues a numbered receipt). Nothing counts as paid until then, and the platform holds no money here.
 */
const COLOR = "#0F766E";
const call = portalClient("owner");
const cents = (c: number) => rand(c / 100);
const today = () => new Date().toISOString().slice(0, 10);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-xs text-fg-muted">{label}</span>{children}</label>;
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;
const DOC_KIND: Record<string, string> = { letter_of_recommendation: "Letter of recommendation", membership_certificate: "Membership certificate", membership_card: "Membership card" };
const METHODS: [string, string][] = [["eft", "EFT"], ["cash", "Cash"], ["other", "Other"]];
interface Ledger { chargedCents: number; paidCents: number; owedCents: number; overdueCents: number; daysOverdue: number; unallocatedCents: number }
interface Assoc { associationId: string; name: string; status: string; joinedOn: string | null; registrationNumber: string | null; province: string | null; membershipNumber: string | null; standing: string; standingReason: string | null; routes: string[]; ledger: Ledger | null; pendingClaims: number }
interface Doc { id: string; kind: string; reference: string | null; expiresOn: string | null }
interface Claim { id: string; associationId: string; association?: string; levyId: string | null; amountCents: number; paidOn: string; method: string; reference: string | null; status: string; decisionNote: string | null }
interface Statement { lines: { date: string; kind: string; ref: string; description: string; amountCents: number; balanceCents: number }[]; openLevies: { id: string; title: string; remainingCents: number; dueOn: string | null }[]; owedCents: number; claims: Claim[] }
interface Receipt { id: string; number: string; receivedOn: string; category: string; amountCents: number; method: string; voided: boolean; voidReason: string | null }

function PayForm({ assoc, st, onDone }: { assoc: Assoc; st: Statement; onDone: () => void }) {
  const [f, setF] = useState({ levyId: "", amount: "", paidOn: today(), method: "eft", reference: "" }), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  const pickLevy = (id: string) => { const l = st.openLevies.find((x) => x.id === id); setF({ ...f, levyId: id, amount: l ? String(l.remainingCents / 100) : f.amount }); };
  const submit = async () => {
    const c = toCents(f.amount); if (c === null) return setMsg({ ok: false, text: "Type the amount in rand, for example 600 or 600.50." }); setBusy(true); setMsg(null);
    const r = await sendOrQueue(call, { method: "POST", path: "/my-association/claims", label: `Payment of ${cents(c)} to ${assoc.name}`, body: { associationId: assoc.associationId, amountCents: c, paidOn: f.paidOn, method: f.method, ...(f.levyId ? { levyId: f.levyId } : {}), ...(f.reference.trim() ? { reference: f.reference.trim() } : {}), clientRef: newRef("dues") } }); setBusy(false);
    if (r.status === "error") return setMsg({ ok: false, text: r.error }); setMsg({ ok: true, text: r.status === "queued" ? "Saved on this phone. It will be sent when you are online." : `Sent. ${assoc.name} will check it and confirm.` }); setF({ ...f, levyId: "", amount: "", reference: "" }); onDone();
  };
  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <h4 className="text-sm font-bold text-fg">I have paid</h4>
      <p className="text-xs text-fg-subtle">Tell {assoc.name} what you paid. They check their bank and confirm it, and then you get a receipt. Until then it is not counted as paid.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="What it is for"><select aria-label="Payment for" className={inputCls + " mt-1 w-60 py-3"} value={f.levyId} onChange={(e) => pickLevy(e.target.value)}><option value="">Something else, or paying ahead</option>{st.openLevies.map((l) => <option key={l.id} value={l.id}>{l.title} (owing {cents(l.remainingCents)})</option>)}</select></Field>
        <Field label="Amount (rand)"><input aria-label="Dues amount" inputMode="decimal" className={inputCls + " mt-1 w-36 py-3 text-base"} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Paid on"><input type="date" aria-label="Dues date" className={inputCls + " mt-1 w-44 py-3"} max={today()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="How you paid">{METHODS.map(([k, l]) => <button key={k} type="button" aria-pressed={f.method === k} className="px-4 py-3 rounded-lg text-sm font-bold border" style={f.method === k ? { background: COLOR, color: "#fff", borderColor: COLOR } : {}} onClick={() => setF({ ...f, method: k })}>{l}</button>)}</div>
      <div className="flex flex-wrap items-end gap-3"><Field label="Your EFT reference (if you have one)"><input aria-label="Dues reference" maxLength={60} className={inputCls + " mt-1 w-64"} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <button type="button" disabled={busy} onClick={submit} className="px-6 py-3 rounded-lg text-base font-bold text-white disabled:opacity-60" style={{ background: COLOR }}>{busy ? "Sending…" : "Tell the association"}</button></div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
const CLAIM_TEXT: Record<string, (c: Claim) => string> = { claimed: () => "Waiting for the association to confirm", confirmed: () => "Confirmed: you have a receipt", rejected: (c) => `Not accepted${c.decisionNote ? `: ${c.decisionNote}` : ""}`, withdrawn: () => "Withdrawn" };
function AssociationPanel({ assoc, reloadList }: { assoc: Assoc; reloadList: () => void }) {
  const [st, reloadSt] = useLoad<Statement>(() => call(`/my-association/${assoc.associationId}/statement`), [assoc.associationId]), [rc, reloadRc] = useLoad<{ receipts: Receipt[] }>(() => call(`/my-association/${assoc.associationId}/receipts`), [assoc.associationId]);
  const reload = () => { reloadSt(); reloadRc(); reloadList(); };
  return (
    <div className="space-y-4">
      <Status load={st}>{(s) => (
        <>
          <PayForm assoc={assoc} st={s} onDone={reload} />
          <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-2">Your account</h4>
            {s.lines.length === 0 ? <Empty>Nothing has been charged to you yet.</Empty> : <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted"><th className="pr-3">Date</th><th className="pr-3">What</th><th className="pr-3">Amount</th><th>Balance</th></tr></thead>
              <tbody>{s.lines.map((l, i) => <tr key={i} className={`border-t border-line/60 ${l.kind === "void" ? "opacity-60" : ""}`}><td className="pr-3">{l.date}</td><td className="pr-3">{l.kind === "receipt" ? `Receipt ${l.ref}` : l.kind === "void" ? `Cancelled receipt ${l.ref}` : l.description}</td><td className="pr-3">{l.kind === "receipt" ? `-${cents(l.amountCents)}` : cents(l.amountCents)}</td><td>{cents(l.balanceCents)}</td></tr>)}</tbody></table></div>}</div>
          {s.claims.length > 0 && <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-2">Payments you told them about</h4>
            <ul className="space-y-2 text-sm text-fg">{s.claims.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2"><span>{c.paidOn} · {cents(c.amountCents)} · {METHODS.find(([k]) => k === c.method)?.[1]}{c.reference ? ` · ${c.reference}` : ""} · <b>{CLAIM_TEXT[c.status]?.(c) ?? c.status}</b></span>
              {c.status === "claimed" && <ActionButton small label="Withdraw" color="#6B7280" onRun={async () => { const r = await call(`/my-association/claims/${c.id}/withdraw`, { method: "POST" }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />}</li>)}</ul></div>}
        </>)}</Status>
      <Status load={rc}>{({ receipts }) => receipts.length === 0 ? <Empty>No receipts yet.</Empty> : (
        <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-2">Your receipts</h4>
          <ul className="space-y-2 text-sm text-fg">{receipts.map((r) => <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 ${r.voided ? "opacity-60" : ""}`}><span className={r.voided ? "line-through" : ""}>{r.number} · {r.receivedOn} · {cents(r.amountCents)}</span>{r.voided ? <span className="text-xs">Cancelled: {r.voidReason}</span> : <FileButton segment="owner" path={`/my-association/${assoc.associationId}/receipts/${r.id}.pdf`} filename={`receipt-${r.number}.pdf`} label={`Download ${r.number}`} />}</li>)}</ul></div>)}</Status>
    </div>
  );
}

export function MyAssociationScreen() {
  const [load, reload] = useLoad<{ associations: Assoc[]; documents: Doc[] }>(() => call("/my-association")), [open, setOpen] = useState<string | null>(null), o = useOutbox(call);
  return (
    <div className="space-y-4">
      {o.waiting.length > 0 && <div role="status" className="rounded-lg border border-line p-3 text-sm text-fg flex flex-wrap items-center justify-between gap-2"><span>{o.waiting.length} change{o.waiting.length === 1 ? " is" : "s are"} saved on this phone and waiting to be sent: {o.waiting.map((w) => w.label).join(", ")}.</span><button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} onClick={() => { void o.sendNow().then(reload); }}>Send now</button></div>}
      <Status load={load}>{({ associations, documents }) => (
        <>
          {associations.length === 0 ? <SectionPanel title="My association"><div className="p-4"><Empty>You are not a member of an association yet. Ask to join one under Requests and links.</Empty></div></SectionPanel> : associations.map((a) => (
            <SectionPanel key={a.associationId} title={a.name}>
              <div className="p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm text-fg"><Chip color={a.status === "active" ? "#15803d" : "#6B7280"}>{a.status === "active" ? "Member" : "Waiting for approval"}</Chip>{a.standing !== "active" && <Chip color="#C8102E">{a.standing === "suspended" ? "Suspended" : "Membership ended"}</Chip>}
                  <span>{a.joinedOn ? `Member since ${a.joinedOn}` : "Not a member yet"}{a.membershipNumber ? ` · membership number ${a.membershipNumber}` : a.status === "active" ? " · no membership number issued yet" : ""}{a.registrationNumber ? ` · association registration ${a.registrationNumber}` : ""}{a.province ? ` · ${a.province}` : ""}</span></div>
                {a.standing !== "active" && a.standingReason && <p className="text-sm text-fg">The association gave this reason: {a.standingReason}</p>}
                {a.status === "active" && <p className="text-sm text-fg">{a.routes.length ? `Your route${a.routes.length === 1 ? "" : "s"}: ${a.routes.join(", ")}.` : "No route is recorded on your operating licences."}</p>}
                {a.ledger && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Charged to you" value={cents(a.ledger.chargedCents)} icon={<span aria-hidden>C</span>} color={COLOR} /><StatCard label="You have paid" value={cents(a.ledger.paidCents)} icon={<span aria-hidden>P</span>} color={COLOR} />
                    <StatCard label="You owe" value={cents(a.ledger.owedCents)} icon={<span aria-hidden>O</span>} color={COLOR} /><StatCard label="Overdue" value={a.ledger.overdueCents > 0 ? `${cents(a.ledger.overdueCents)} (${a.ledger.daysOverdue} days)` : "Nothing"} icon={<span aria-hidden>D</span>} color={COLOR} />
                  </div>)}
                {a.pendingClaims > 0 && <p className="text-sm text-fg">{a.pendingClaims} payment{a.pendingClaims === 1 ? " is" : "s are"} waiting for the association to confirm.</p>}
                {a.status === "active" && <><button type="button" className="px-3 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLOR }} aria-expanded={open === a.associationId} onClick={() => setOpen(open === a.associationId ? null : a.associationId)}>{open === a.associationId ? "Close your account" : "Open your account and pay"}</button>{open === a.associationId && <AssociationPanel assoc={a} reloadList={reload} />}</>}
              </div>
            </SectionPanel>))}
          <SectionPanel title="Your membership papers">
            <div className="p-4 space-y-2 text-sm text-fg">
              {documents.length === 0 ? <Empty>No letter of recommendation or membership certificate is recorded.</Empty> : <ul className="space-y-1">{documents.map((d) => <li key={d.id}><b>{DOC_KIND[d.kind] ?? d.kind}</b>{d.reference ? ` · ${d.reference}` : ""}{d.expiresOn ? ` · valid until ${d.expiresOn}` : ""}</li>)}</ul>}
              <p className="text-xs text-fg-subtle">Add or change these under Documents. Keep your letter of recommendation and membership certificate current: they are what shows you may operate on a route.</p>
            </div>
          </SectionPanel>
        </>)}</Status>
    </div>
  );
}
