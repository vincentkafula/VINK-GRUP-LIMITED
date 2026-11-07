import { useState } from "react";
import { Download } from "lucide-react";
import { authFetch } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { SectionPanel, StatCard } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, rand, inputCls } from "./ui";
import { useAccess } from "./AssociationAccess";

/**
 * The association's own books (docs/ASSOCIATION_COMPLIANCE.md, module 7): what members are charged, numbered receipts that are never deleted, expenses that named office bearers approve, banking, budgets and statements.
 * These screens record what the association says happened; they move no money. The VINK wallet ledger and fines (the "Money" menu) are separate.
 */
const COLOR = "#C8102E";
const call = portalClient("association");
const money = (cents: number) => rand(cents / 100);
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-[11px] text-fg-muted">{label}</span>{children}</label>;
const Chip = ({ color, children }: { color: string; children: React.ReactNode }) => <span className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;
const SEV: Record<string, string> = { high: "#C8102E", medium: "#D97706", low: "#6B7280" }, SEV_TEXT: Record<string, string> = { high: "Act now", medium: "Soon", low: "Keep an eye on" };
const KINDS: [string, string][] = [["joining", "Joining fee"], ["membership", "Membership fee"], ["levy", "Levy"], ["fine", "Fine"], ["other", "Other"]];
const METHODS: [string, string][] = [["cash", "Cash"], ["eft", "EFT"], ["card", "Card"], ["other", "Other"]];
const receiptNo = (n: number) => `R-${String(n).padStart(6, "0")}`;
const today = () => new Date().toISOString().slice(0, 10);

/** Downloads a file with the signed-in session. */
export function FileButton({ path, filename, label }: { path: string; filename: string; label: string }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-line text-fg disabled:opacity-60" onClick={async () => {
        setBusy(true); setErr(null);
        try { const res = await authFetch(`${API_BASE}/api/portal/association${path}`); if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? `Download failed (${res.status})`); return; } const url = URL.createObjectURL(await res.blob()), a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
        catch { setErr("We could not reach the server."); } finally { setBusy(false); }
      }}><Download className="w-3.5 h-3.5" />{busy ? "Preparing…" : label}</button>
      {err && <span role="alert" className="text-xs text-bad">{err}</span>}
    </span>
  );
}

/* ───────────────────────── overview ───────────────────────── */
interface Summary { today: string; settings: { approvalThresholdCents: number; requireSignedInApprovals?: boolean }; cash: { cashReceivedCents: number; bankedCents: number; onHandCents: number; unbankedCents: number; oldestUnbankedOn: string | null; oldestUnbankedDays: number | null }; measures: { collectedThisMonthCents: number; expensesThisMonthCents: number; netThisMonthCents: number; owedByMembersCents: number; overdueCents: number; membersOverdue: number; pendingExpenses: number }; flags: { id: string; severity: string; message: string }[] }
export function FinanceOverview({ onOpen }: { onOpen?: (screen: string) => void }) {
  const [load, reload] = useLoad<Summary>(() => call("/finance/summary"));
  const [thr, setThr] = useState<string | null>(null);
  return (
    <Status load={load}>{(s) => {
      const m = s.measures, shown = thr ?? String(s.settings.approvalThresholdCents / 100);
      return (
        <div className="space-y-4">
          <SectionPanel title="Finance this month">
            <div className="p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Collected" value={money(m.collectedThisMonthCents)} icon={<span aria-hidden>+</span>} color={COLOR} /><StatCard label="Spent (approved)" value={money(m.expensesThisMonthCents)} icon={<span aria-hidden>−</span>} color={COLOR} />
                <StatCard label="Owed by members" value={money(m.owedByMembersCents)} icon={<span aria-hidden>?</span>} color={COLOR} /><StatCard label="Cash not yet banked" value={money(s.cash.unbankedCents)} icon={<span aria-hidden>$</span>} color={COLOR} />
              </div>
              <p className="text-sm text-fg" aria-live="polite">Net this month <b>{money(m.netThisMonthCents)}</b>. {m.membersOverdue > 0 ? <><b>{m.membersOverdue}</b> member{m.membersOverdue === 1 ? " is" : "s are"} overdue ({money(m.overdueCents)}). </> : "Nobody is overdue. "}{m.pendingExpenses > 0 ? <><b>{m.pendingExpenses}</b> expense{m.pendingExpenses === 1 ? " is" : "s are"} waiting for approval.</> : ""}</p>
              {onOpen && <div className="flex flex-wrap gap-3 text-sm"><button type="button" className="underline font-bold" onClick={() => onOpen("Fees & receipts")}>Fees and receipts</button><button type="button" className="underline font-bold" onClick={() => onOpen("Expenses & banking")}>Expenses and banking</button><button type="button" className="underline font-bold" onClick={() => onOpen("Income statement")}>Income statement</button></div>}
            </div>
          </SectionPanel>
          <SectionPanel title={`Needs attention (${s.flags.length})`}>
            <div className="p-4">{s.flags.length === 0 ? <Empty>Nothing needs attention.</Empty> : <ul className="space-y-2">{s.flags.map((f) => <li key={f.id} className="flex flex-wrap items-start gap-2 text-sm text-fg border-b border-line/60 pb-2"><Chip color={SEV[f.severity]}>{SEV_TEXT[f.severity]}</Chip><span className="flex-1 min-w-[12rem]">{f.message}</span></li>)}</ul>}</div>
          </SectionPanel>
          <SectionPanel title="Approval rule">
            <div className="p-4 flex flex-wrap items-end gap-3 text-sm text-fg">
              <Field label="Payments of this amount or more need two different office bearers (R)"><input aria-label="Approval threshold" className={inputCls + " mt-1 !w-32"} inputMode="decimal" value={shown} onChange={(e) => setThr(e.target.value)} /></Field>
              <ActionButton small label="Save" color={COLOR} onRun={async () => { const r = await call("/finance/settings", { method: "PUT", body: { approvalThresholdCents: toCents(shown) } }); if ("error" in r) return { error: r.error }; setThr(null); reload(); return { message: "Saved." }; }} />
              <p className="basis-full text-xs text-fg-subtle">Below it, one office bearer approves. Nobody can approve something they asked for themselves.</p>
              <label className="basis-full flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!s.settings.requireSignedInApprovals} onChange={async (e) => { await call("/finance/settings", { method: "PUT", body: { requireSignedInApprovals: e.target.checked } }); reload(); }} /><span>Approvals must be made by the office bearer signed in to their own account. Without this, the association's shared login can record an approval for a named office bearer, which is an attestation, not proof.</span></label>
            </div>
          </SectionPanel>
        </div>);
    }}</Status>
  );
}

/* ───────────────────────── fees, charges, receipts and member accounts ───────────────────────── */
interface Fee { id: string; kind: string; name: string; amountCents: number; effectiveFrom: string; active: boolean; approvedBy: string | null; overCap: boolean }
function FeesCard() {
  const [load, reload] = useLoad<{ fees: Fee[] }>(() => call("/finance/fees"));
  const [f, setF] = useState({ kind: "membership", name: "", amount: "", from: today(), approvedBy: "" }), [dueOn, setDueOn] = useState("");
  return (
    <SectionPanel title="Approved fees">
      <div className="p-4 space-y-4">
        <p className="text-xs text-fg-subtle">Members can only be charged a fee that is on this list. A joining or membership fee above your province's limit (set under Registration) is flagged and cannot be charged.</p>
        <Status load={load}>{({ fees }) => fees.length === 0 ? <Empty>No fees yet.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{fees.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{x.name}</b> ({KINDS.find(([k]) => k === x.kind)?.[1]}) · {money(x.amountCents)} · from {x.effectiveFrom}{x.approvedBy ? ` · ${x.approvedBy}` : ""}{!x.active ? " · switched off" : ""} {x.overCap && <Chip color={SEV.high}>Above the limit</Chip>}</span>
              <span className="flex gap-2"><ActionButton small label="Charge all members" color={COLOR} onRun={async () => { const r = await call<{ created: number; skipped: number }>("/finance/charges", { method: "POST", body: { feeId: x.id, all: true, dueOn: dueOn || undefined } }); if ("error" in r) return { error: r.error }; const d = r.data as unknown as { created: number; skipped: number }; return { message: `${d.created} charged${d.skipped ? `, ${d.skipped} already had it` : ""}.` }; }} /><ActionButton small label={x.active ? "Switch off" : "Switch on"} color="#6B7280" onRun={async () => { const r = await call(`/finance/fees/${x.id}/active`, { method: "POST", body: { active: !x.active } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} /></span></li>))}</ul>)}</Status>
        <Field label="Due date for charges (leave empty for 30 days)"><input type="date" aria-label="Charge due date" className={inputCls + " mt-1 w-40"} value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></Field>
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <Field label="Kind"><select aria-label="Fee kind" className={inputCls + " mt-1 w-40"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Name"><input aria-label="Fee name" className={inputCls + " mt-1 w-48"} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Amount (R)"><input aria-label="Fee amount" className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Applies from"><input type="date" aria-label="Fee from" className={inputCls + " mt-1 w-40"} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Approved by (resolution)"><input aria-label="Fee approved by" className={inputCls + " mt-1 w-44"} value={f.approvedBy} onChange={(e) => setF({ ...f, approvedBy: e.target.value })} /></Field>
          <ActionButton small label="Add fee" color={COLOR} onRun={async () => { const r = await call<{ overCap: boolean }>("/finance/fees", { method: "POST", body: { kind: f.kind, name: f.name, amountCents: toCents(f.amount), effectiveFrom: f.from, approvedBy: f.approvedBy } }); if ("error" in r) return { error: r.error }; const over = (r.data as unknown as { overCap: boolean }).overCap; setF({ ...f, name: "", amount: "", approvedBy: "" }); reload(); return { message: over ? "Added, but it is above the limit for your province, so it cannot be charged." : "Added." }; }} />
        </div>
      </div>
    </SectionPanel>
  );
}
interface Receipt { id: string; number: number; member: string | null; memberId: string | null; category: string; amountCents: number; method: string; receivedOn: string; note: string | null; voided: boolean; voidReason: string | null }
interface MemberAccount { memberId: string; name: string; chargedCents: number; paidCents: number; paidWithoutReceiptCents: number; unallocatedCents: number; owedCents: number; balanceCents: number; overdueCents: number; daysOverdue: number }
interface Statement { member: string; lines: { date: string; kind: string; ref: string; description: string; amountCents: number; balanceCents: number }[]; openLevies: { id: string; title: string; remainingCents: number; dueOn: string | null }[]; owedCents: number; note: string | null }
function ReceiptForm({ members, onDone }: { members: MemberAccount[]; onDone: () => void }) {
  const [f, setF] = useState({ memberId: "", payerName: "", levyId: "", amount: "", method: "cash", receivedOn: today(), category: "levy", note: "" });
  const [st] = useLoad<Statement | null>(() => (f.memberId ? call<Statement>(`/finance/members/${f.memberId}/statement`) : Promise.resolve({ data: null })), [f.memberId]);
  const open = st.state === "ready" && st.data ? st.data.openLevies : [];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Received from"><select aria-label="Receipt member" className={inputCls + " mt-1 w-48"} value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value, levyId: "" })}><option value="">Someone who is not a member</option>{members.map((m) => <option key={m.memberId} value={m.memberId}>{m.name}</option>)}</select></Field>
      {!f.memberId && <Field label="Their name"><input aria-label="Payer name" className={inputCls + " mt-1 w-44"} value={f.payerName} onChange={(e) => setF({ ...f, payerName: e.target.value })} /></Field>}
      {f.memberId && <Field label="Paying for"><select aria-label="Receipt levy" className={inputCls + " mt-1 w-60"} value={f.levyId} onChange={(e) => setF({ ...f, levyId: e.target.value })}><option value="">Not against a charge</option>{open.map((l) => <option key={l.id} value={l.id}>{l.title}: {money(l.remainingCents)} owed{l.dueOn ? `, due ${l.dueOn}` : ""}</option>)}</select></Field>}
      {!f.levyId && <Field label="For"><select aria-label="Receipt for" className={inputCls + " mt-1 w-40"} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
      <Field label="Amount (R)"><input aria-label="Receipt amount" className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      <Field label="Paid by"><select aria-label="Receipt method" className={inputCls + " mt-1 w-28"} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Date received"><input type="date" aria-label="Receipt date" className={inputCls + " mt-1 w-40"} value={f.receivedOn} onChange={(e) => setF({ ...f, receivedOn: e.target.value })} /></Field>
      <ActionButton label="Issue receipt" color={COLOR} onRun={async () => {
        const r = await call<{ number: number }>("/finance/receipts", { method: "POST", body: { memberId: f.memberId || null, payerName: f.payerName || undefined, levyId: f.levyId || undefined, category: f.levyId ? undefined : f.category, amountCents: toCents(f.amount), method: f.method, receivedOn: f.receivedOn, note: f.note || undefined } });
        if ("error" in r) return { error: r.error }; const n = (r.data as unknown as { number: number }).number; setF({ ...f, amount: "", levyId: "", payerName: "" }); onDone(); return { message: `Receipt ${receiptNo(n)} issued.` };
      }} />
    </div>
  );
}
function ReceiptsCard({ members }: { members: MemberAccount[] }) {
  const [load, reload] = useLoad<{ receipts: Receipt[] }>(() => call("/finance/receipts"));
  const [voiding, setVoiding] = useState<string | null>(null), [why, setWhy] = useState("");
  return (
    <SectionPanel title="Receipts">
      <div className="p-4 space-y-4">
        <ReceiptForm members={members} onDone={reload} />
        <p className="text-xs text-fg-subtle">Receipts are numbered in sequence and are never deleted. A mistake is voided, with a reason, and keeps its number.</p>
        <Status load={load}>{({ receipts }) => receipts.length === 0 ? <Empty>No receipts yet.</Empty> : (
          <ul className="space-y-2 text-sm text-fg">{receipts.slice(0, 50).map((r) => (
            <li key={r.id} className={`border-b border-line/60 pb-2 ${r.voided ? "text-fg-muted" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span><b>{receiptNo(r.number)}</b> · {r.receivedOn} · {r.member ?? "Unknown"} · {r.category} · {r.method} · <b className={r.voided ? "line-through" : ""}>{money(r.amountCents)}</b>{r.voided && <> <Chip color={SEV.high}>Void</Chip> {r.voidReason}</>}</span>
                <span className="flex items-center gap-2"><FileButton path={`/finance/receipts/${r.id}.pdf`} filename={`receipt-${receiptNo(r.number)}.pdf`} label="PDF" />{!r.voided && <button type="button" className="text-xs underline" aria-expanded={voiding === r.id} onClick={() => setVoiding(voiding === r.id ? null : r.id)}>Void</button>}</span></div>
              {voiding === r.id && <div className="mt-2 flex flex-wrap items-end gap-2"><input aria-label="Why void" className={inputCls + " w-64"} placeholder="Why is it being voided?" maxLength={200} value={why} onChange={(e) => setWhy(e.target.value)} /><ActionButton small label="Void this receipt" color={COLOR} onRun={async () => { const x = await call(`/finance/receipts/${r.id}/void`, { method: "POST", body: { reason: why } }); if ("error" in x) return { error: x.error }; setVoiding(null); setWhy(""); reload(); return undefined; }} /></div>}
            </li>))}</ul>)}</Status>
      </div>
    </SectionPanel>
  );
}
function MemberAccounts({ members }: { members: MemberAccount[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <SectionPanel title="Member accounts">
      <div className="p-4">{members.length === 0 ? <Empty>No members yet.</Empty> : (
        <ul className="space-y-3 text-sm text-fg">{members.map((m) => (
          <li key={m.memberId}>
            <div className="flex flex-wrap items-center justify-between gap-2"><span><b>{m.name}</b> · charged {money(m.chargedCents)} · paid {money(m.paidCents)} · <b>owes {money(m.owedCents)}</b>{m.overdueCents > 0 && <> <Chip color={m.daysOverdue > 90 ? SEV.high : SEV.medium}>{money(m.overdueCents)} overdue {m.daysOverdue} days</Chip></>}{m.unallocatedCents > 0 && ` · ${money(m.unallocatedCents)} paid on account`}{m.paidWithoutReceiptCents > 0 && ` · ${money(m.paidWithoutReceiptCents)} paid with no receipt`}</span>
              <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: COLOR }} aria-expanded={open === m.memberId} onClick={() => setOpen(open === m.memberId ? null : m.memberId)}>{open === m.memberId ? "Close" : "Statement"}</button></div>
            {open === m.memberId && <StatementView memberId={m.memberId} />}
          </li>))}</ul>)}</div>
    </SectionPanel>
  );
}
function StatementView({ memberId }: { memberId: string }) {
  const [load] = useLoad<Statement>(() => call(`/finance/members/${memberId}/statement`), [memberId]);
  return (
    <div className="mt-2 rounded-lg border border-line p-3"><Status load={load}>{(s) => s.lines.length === 0 ? <Empty>Nothing charged or paid yet.</Empty> : (
      <><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-1 pr-3">Date</th><th className="pr-3">What</th><th className="pr-3 text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
        <tbody>{s.lines.map((l, i) => <tr key={i} className="border-b border-line/60"><td className="py-1 pr-3">{l.date}</td><td className="pr-3">{l.ref ? `${l.ref} · ` : ""}{l.kind === "charge" ? "Charged: " : ""}{l.description}</td><td className={`pr-3 text-right ${l.kind === "void" ? "line-through text-fg-muted" : ""}`}>{l.kind === "receipt" || l.kind === "void" ? "-" : ""}{money(l.amountCents)}</td><td className="text-right">{money(l.balanceCents)}</td></tr>)}</tbody></table>
        {s.note && <p className="mt-2 text-xs text-fg-muted">{s.note}</p>}</>)}</Status></div>
  );
}
export function FeesAndReceiptsScreen() {
  const [led] = useLoad<{ members: MemberAccount[] }>(() => call("/finance/members"));
  const members = led.state === "ready" ? led.data.members : [];
  return <div className="space-y-4"><FeesCard /><ReceiptsCard members={members} /><MemberAccounts members={members} /></div>;
}

/* ───────────────────────── expenses, banking and budgets ───────────────────────── */
interface Expense { id: string; incurredOn: string; category: string; payee: string; amountCents: number; description: string | null; requestedBy: string; status: string; requiredApprovals: number; rejectedReason: string | null; approvals: { officeBearerId: string; name: string; signedIn?: boolean }[] }
function ExpensesCard() {
  const [load, reload] = useLoad<{ expenses: Expense[] }>(() => call("/finance/expenses"));
  const [bearers] = useLoad<{ officeBearers: { id: string; name: string; office: string }[] }>(() => call("/compliance/office-bearers"));
  const [f, setF] = useState({ incurredOn: today(), category: "", payee: "", amount: "", requestedBy: "", description: "" }), [who, setWho] = useState<Record<string, string>>({}), [rej, setRej] = useState<string | null>(null), [why, setWhy] = useState("");
  const ob = bearers.state === "ready" ? bearers.data.officeBearers : [], access = useAccess(), asSelf = access?.kind === "delegate";
  return (
    <SectionPanel title="Expenses">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Date"><input type="date" aria-label="Expense date" className={inputCls + " mt-1 w-40"} value={f.incurredOn} onChange={(e) => setF({ ...f, incurredOn: e.target.value })} /></Field>
          <Field label="Category"><input aria-label="Expense category" className={inputCls + " mt-1 w-40"} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <Field label="Paid to"><input aria-label="Expense payee" className={inputCls + " mt-1 w-44"} value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} /></Field>
          <Field label="Amount (R)"><input aria-label="Expense amount" className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Asked for by"><input aria-label="Expense requested by" className={inputCls + " mt-1 w-44"} value={f.requestedBy} onChange={(e) => setF({ ...f, requestedBy: e.target.value })} /></Field>
          <Field label="What for"><input aria-label="Expense description" className={inputCls + " mt-1 w-56"} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <ActionButton small label="Record expense" color={COLOR} onRun={async () => { const r = await call<{ requiredApprovals: number }>("/finance/expenses", { method: "POST", body: { incurredOn: f.incurredOn, category: f.category, payee: f.payee, amountCents: toCents(f.amount), requestedBy: f.requestedBy, description: f.description } }); if ("error" in r) return { error: r.error }; const n = (r.data as unknown as { requiredApprovals: number }).requiredApprovals; setF({ ...f, category: "", payee: "", amount: "", description: "" }); reload(); return { message: `Recorded. It needs ${n} approval${n === 1 ? "" : "s"} from ${n === 1 ? "an office bearer" : "different office bearers"}.` }; }} />
        </div>
        <Status load={load}>{({ expenses }) => expenses.length === 0 ? <Empty>No expenses yet.</Empty> : (
          <ul className="space-y-3 text-sm text-fg">{expenses.slice(0, 50).map((e) => (
            <li key={e.id} className="border-b border-line/60 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span><b>{money(e.amountCents)}</b> to {e.payee} · {e.category} · {e.incurredOn} · asked for by {e.requestedBy}{e.description ? ` · ${e.description}` : ""}</span><Chip color={e.status === "approved" ? "#15803d" : e.status === "rejected" ? "#6B7280" : SEV.medium}>{e.status === "pending" ? `${e.approvals.length} of ${e.requiredApprovals} approvals` : e.status}</Chip></div>
              {e.approvals.length > 0 && <p className="text-xs text-fg-muted">Approved by {e.approvals.map((a) => `${a.name}${a.signedIn ? " (signed in)" : ""}`).join(" and ")}</p>}{e.rejectedReason && <p className="text-xs text-fg-muted">Rejected: {e.rejectedReason}</p>}
              {e.status === "pending" && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  {asSelf ? <p className="text-xs text-fg-muted basis-full">{access?.officeBearerId ? `You approve as ${access.name}.` : "Your login is not linked to an office bearer, so you cannot approve: ask the association to link it."}</p> : <Field label="Approved by"><select aria-label={`Approver for ${e.payee}`} className={inputCls + " mt-1 w-52"} value={who[e.id] ?? ""} onChange={(x) => setWho({ ...who, [e.id]: x.target.value })}><option value="">Choose an office bearer</option>{ob.filter((o) => !e.approvals.some((a) => a.officeBearerId === o.id)).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.office})</option>)}</select></Field>}
                  {(!asSelf || access?.officeBearerId) && <ActionButton small label="Approve" color={COLOR} onRun={async () => { const r = await call(`/finance/expenses/${e.id}/approve`, { method: "POST", body: asSelf ? {} : { officeBearerId: who[e.id] } }); if ("error" in r) return { error: r.error }; reload(); return undefined; }} />}
                  <button type="button" className="text-xs underline" aria-expanded={rej === e.id} onClick={() => setRej(rej === e.id ? null : e.id)}>Reject</button>
                  {rej === e.id && <><input aria-label="Why reject" className={inputCls + " w-56"} placeholder="Why is it rejected?" value={why} onChange={(x) => setWhy(x.target.value)} /><ActionButton small label="Reject it" color="#6B7280" onRun={async () => { const r = await call(`/finance/expenses/${e.id}/reject`, { method: "POST", body: { reason: why } }); if ("error" in r) return { error: r.error }; setRej(null); setWhy(""); reload(); return undefined; }} /></>}
                </div>)}
            </li>))}</ul>)}</Status>
        {ob.length === 0 && <p className="text-xs text-fg-muted">Record your office bearers under Registration first: approvals are made by named office bearers.</p>}
      </div>
    </SectionPanel>
  );
}
function BankingCard() {
  const [cash, reloadCash] = useLoad<{ cashReceivedCents: number; bankedCents: number; onHandCents: number; unbankedCents: number; oldestUnbankedOn: string | null; oldestUnbankedDays: number | null; overBankedCents: number }>(() => call("/finance/cash"));
  const [load, reload] = useLoad<{ deposits: { id: string; depositedOn: string; amountCents: number; reference: string | null }[] }>(() => call("/finance/deposits"));
  const [f, setF] = useState({ on: today(), amount: "", reference: "" });
  return (
    <SectionPanel title="Cash and banking">
      <div className="p-4 space-y-3">
        <Status load={cash}>{(c) => <p className="text-sm text-fg" aria-live="polite">Cash received <b>{money(c.cashReceivedCents)}</b>, banked <b>{money(c.bankedCents)}</b>. {c.unbankedCents > 0 ? <>Not yet banked: <b>{money(c.unbankedCents)}</b>, the oldest from {c.oldestUnbankedOn} ({c.oldestUnbankedDays} days).</> : c.overBankedCents > 0 ? <>More has been banked than cash receipts recorded ({money(c.overBankedCents)}).</> : "All cash received has been banked."}</p>}</Status>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Banked on"><input type="date" aria-label="Deposit date" className={inputCls + " mt-1 w-40"} value={f.on} onChange={(e) => setF({ ...f, on: e.target.value })} /></Field>
          <Field label="Amount (R)"><input aria-label="Deposit amount" className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Bank reference"><input aria-label="Deposit reference" className={inputCls + " mt-1 w-40"} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
          <ActionButton small label="Record deposit" color={COLOR} onRun={async () => { const r = await call("/finance/deposits", { method: "POST", body: { depositedOn: f.on, amountCents: toCents(f.amount), reference: f.reference } }); if ("error" in r) return { error: r.error }; setF({ ...f, amount: "", reference: "" }); reload(); reloadCash(); return { message: "Recorded." }; }} />
        </div>
        <Status load={load}>{({ deposits }) => deposits.length === 0 ? null : <ul className="text-sm text-fg space-y-1">{deposits.slice(0, 10).map((d) => <li key={d.id}>{d.depositedOn} · {money(d.amountCents)}{d.reference ? ` · ${d.reference}` : ""}</li>)}</ul>}</Status>
      </div>
    </SectionPanel>
  );
}
export function ExpensesScreen() { return <div className="space-y-4"><ExpensesCard /><BankingCard /></div>; }

/* ───────────────────────── the income statement and budget ───────────────────────── */
interface StatementData { period: string; income: { category: string; amountCents: number }[]; expenses: { category: string; amountCents: number }[]; incomeCents: number; expensesCents: number; netCents: number; months?: { month: string; incomeCents: number; expensesCents: number; netCents: number }[]; budget?: { category: string; budgetCents: number | null; actualCents: number; varianceCents: number | null }[] }
export function IncomeStatementScreen() {
  const y = new Date().getFullYear(), [mode, setMode] = useState<"month" | "year">("month"), [month, setMonth] = useState(today().slice(0, 7)), [year, setYear] = useState(String(y));
  const q = mode === "month" ? `month=${month}` : `year=${year}`, [load] = useLoad<StatementData>(() => call(`/finance/statement?${q}`), [q]);
  const [bud, setBud] = useState({ category: "", amount: "" }), [budLoad, reloadBud] = useLoad<StatementData>(() => call(`/finance/statement?year=${mode === "year" ? year : month.slice(0, 4)}`), [mode, year, month.slice(0, 4)]);
  void budLoad;
  return (
    <div className="space-y-4">
      <SectionPanel title="Income statement">
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Period"><select aria-label="Statement period" className={inputCls + " mt-1 w-32"} value={mode} onChange={(e) => setMode(e.target.value as "month" | "year")}><option value="month">A month</option><option value="year">A year</option></select></Field>
            {mode === "month" ? <Field label="Month"><input type="month" aria-label="Statement month" className={inputCls + " mt-1 w-40"} value={month} onChange={(e) => setMonth(e.target.value)} /></Field> : <Field label="Year"><input aria-label="Statement year" className={inputCls + " mt-1 !w-24"} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></Field>}
            <FileButton path={`/finance/statement.csv?${q}`} filename={`income-statement-${mode === "month" ? month : year}.csv`} label="Download CSV" />
          </div>
          <p className="text-xs text-fg-subtle">Income is what was received (receipts that are not void). Expenses are those approved by your office bearers.</p>
          <Status load={load}>{(s) => (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Income</h4>{s.income.length === 0 ? <p className="text-sm text-fg-muted">None.</p> : <ul className="text-sm text-fg">{s.income.map((x) => <li key={x.category} className="flex justify-between"><span>{x.category}</span><span>{money(x.amountCents)}</span></li>)}</ul>}<p className="mt-1 text-sm font-bold text-fg flex justify-between"><span>Total income</span><span>{money(s.incomeCents)}</span></p></div>
                <div><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Expenses</h4>{s.expenses.length === 0 ? <p className="text-sm text-fg-muted">None.</p> : <ul className="text-sm text-fg">{s.expenses.map((x) => <li key={x.category} className="flex justify-between"><span>{x.category}</span><span>{money(x.amountCents)}</span></li>)}</ul>}<p className="mt-1 text-sm font-bold text-fg flex justify-between"><span>Total expenses</span><span>{money(s.expensesCents)}</span></p></div>
              </div>
              <p className="text-lg font-black text-fg" aria-live="polite">Net {money(s.netCents)}</p>
              {s.months && <div className="overflow-x-auto"><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-1 pr-3">Month</th><th className="pr-3 text-right">Income</th><th className="pr-3 text-right">Expenses</th><th className="text-right">Net</th></tr></thead><tbody>{s.months.map((m) => <tr key={m.month} className="border-b border-line/60"><td className="py-1 pr-3">{m.month}</td><td className="pr-3 text-right">{money(m.incomeCents)}</td><td className="pr-3 text-right">{money(m.expensesCents)}</td><td className="text-right">{money(m.netCents)}</td></tr>)}</tbody></table></div>}
              {s.budget && s.budget.length > 0 && <div className="overflow-x-auto"><h4 className="text-xs font-bold uppercase text-fg-muted mb-1">Against the budget</h4><table className="w-full text-sm text-fg"><thead><tr className="text-left text-xs text-fg-muted border-b border-line"><th className="py-1 pr-3">Category</th><th className="pr-3 text-right">Budget</th><th className="pr-3 text-right">Actual</th><th className="text-right">Difference</th></tr></thead><tbody>{s.budget.map((b) => <tr key={b.category} className="border-b border-line/60"><td className="py-1 pr-3">{b.category}</td><td className="pr-3 text-right">{b.budgetCents === null ? "No budget" : money(b.budgetCents)}</td><td className="pr-3 text-right">{money(b.actualCents)}</td><td className="text-right">{b.varianceCents === null ? "" : money(b.varianceCents)}</td></tr>)}</tbody></table></div>}
            </>)}</Status>
        </div>
      </SectionPanel>
      <SectionPanel title={`Budget for ${mode === "year" ? year : month.slice(0, 4)}`}>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <Field label="Category (the same name as in the statement)"><input aria-label="Budget category" className={inputCls + " mt-1 w-56"} value={bud.category} onChange={(e) => setBud({ ...bud, category: e.target.value })} /></Field>
          <Field label="Budget for the year (R)"><input aria-label="Budget amount" className={inputCls + " mt-1 !w-32"} inputMode="decimal" value={bud.amount} onChange={(e) => setBud({ ...bud, amount: e.target.value })} /></Field>
          <ActionButton small label="Set budget" color={COLOR} onRun={async () => { const r = await call("/finance/budgets", { method: "PUT", body: { year: Number(mode === "year" ? year : month.slice(0, 4)), category: bud.category, amountCents: toCents(bud.amount) } }); if ("error" in r) return { error: r.error }; setBud({ category: "", amount: "" }); reloadBud(); return { message: "Saved. Open the year view to see it against the actual figures." }; }} />
        </div>
      </SectionPanel>
    </div>
  );
}
