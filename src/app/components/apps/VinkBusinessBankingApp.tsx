import { useEffect, useState } from "react";
import { Home, CreditCard, FileText, Banknote, MoreHorizontal, Loader2, Copy, CheckCircle, ShieldCheck } from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";
import { CardsScreen, LoginScreen, Problem, Spinner, PURPLE, input, primary, msg, rand, when, useLoad } from "./VinkBankingApp";
import { api } from "../manshya/api";
import { getSession, clearSession, type ApiUser } from "../../services/apiClient";

/**
 * The business banking app. It runs on the signed-in business's own VINK account: what has been paid in, what is available and what is
 * held back, payment links to send customers, payouts to a bank account, and the business cards. Every figure comes from the server (cents).
 */

type Screen = "home" | "payments" | "requests" | "payouts" | "cards" | "more";

interface Balance { total: number; retained: number; available: number; payout_fee: number; available_for_payout: number }
interface Payment { id: string; amount: number; fee: number; refunded: number; status: string; method: string; reference: string | null; customer: { name: string | null; email: string | null }; created_at: string }
interface Request { id: string; amount: number; description: string | null; customer_email: string | null; status: string; token: string; created_at: string; expires_at: string }
interface Payout { id: string; gross: number; fee: number; net: number; status: string; created_at: string }
interface Account { id: string; name: string; number: string; kind: string; balance: number }

const payLink = (token: string) => `${window.location.origin}/pay?r=${token}`;
const cents = (s: string) => Math.round(parseFloat(s.replace(",", ".")) * 100);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-[10px] text-gray-500">{label}</p><p className="mt-0.5 text-base font-black text-gray-900">{value}</p>{sub && <p className="text-[10px] text-gray-500">{sub}</p>}</div>;
}

function HomeScreen({ user }: { user: ApiUser }) {
  const bal = useLoad(() => api<Balance>("/balance"));
  const pays = useLoad(async () => (await api<{ data: Payment[] }>("/payments?limit=5")).data);
  const accts = useLoad(async () => (await api<{ data: Account[] }>("/bank/accounts")).data);
  return (
    <div className="flex h-full flex-col overflow-y-auto pb-6" style={{ background: "#F7F9F8" }}>
      <div className="flex-shrink-0 px-4 py-3" style={{ background: PURPLE }}><p className="text-[10px] text-white/60">Business account</p><p className="text-sm font-bold text-white">{user.name}</p></div>
      {bal.error ? <Problem error={bal.error} retry={bal.reload} /> : bal.busy && !bal.data ? <Spinner /> : (<>
        <div className="px-4 pt-4"><p className="text-[10px] font-medium text-gray-500">Total received, after fees</p><p className="text-2xl font-black text-gray-900" data-total>{rand(bal.data!.total)}</p></div>
        <div className="mx-3 mt-2 grid grid-cols-2 gap-2">
          <Stat label="Available" value={rand(bal.data!.available)} sub={`Payout fee ${rand(bal.data!.payout_fee)}`} />
          <Stat label="Held back (reserve)" value={rand(bal.data!.retained)} sub="Released on schedule" />
        </div></>)}
      <p className="px-4 pb-1 pt-4 text-xs font-bold text-gray-900">Bank accounts</p>
      {accts.error ? <Problem error={accts.error} retry={accts.reload} /> : (accts.data ?? []).length === 0 ? <p className="px-4 text-xs text-gray-500">No bank account yet. Payouts go to a bank account you add in your VINK dashboard.</p> : (
        <div className="mx-3 divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">{accts.data!.map((a) => <div key={a.id} className="flex justify-between px-3 py-2.5 text-xs"><span className="font-semibold text-gray-900">{a.name} <span className="font-normal text-gray-500">· {a.number}</span></span><span className="font-bold">{rand(a.balance)}</span></div>)}</div>)}
      <p className="px-4 pb-1 pt-4 text-xs font-bold text-gray-900">Latest payments</p>
      {pays.error ? <Problem error={pays.error} retry={pays.reload} /> : <PaymentRows rows={pays.data ?? []} />}
    </div>
  );
}

function PaymentRows({ rows }: { rows: Payment[] }) {
  if (rows.length === 0) return <p className="px-4 text-xs text-gray-500">No payments yet.</p>;
  return (
    <div className="mx-3 divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
      {rows.map((p) => (
        <div key={p.id} className="flex items-center justify-between px-3 py-2.5">
          <div className="min-w-0"><p className="truncate text-xs font-semibold text-gray-900">{p.reference || p.customer.name || p.customer.email || p.id}</p><p className="text-[10px] text-gray-500">{when(p.created_at)} · {p.method} · {p.status.replace("_", " ")}</p></div>
          <p className={`text-xs font-bold ${p.status === "failed" ? "text-gray-400 line-through" : "text-green-700"}`}>+{rand(p.amount)}</p>
        </div>))}
    </div>
  );
}

function PaymentsScreen() {
  const [status, setStatus] = useState("");
  const pays = useLoad(async () => (await api<{ data: Payment[] }>(`/payments?limit=50${status ? `&status=${status}` : ""}`)).data, [status]);
  return (
    <div className="flex h-full flex-col overflow-y-auto pb-6" style={{ background: "#F7F9F8" }}>
      <h2 className="px-4 pb-2 pt-4 text-base font-black text-gray-900">Payments received</h2>
      <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={input + " mx-4 !w-[calc(100%-2rem)]"}>
        <option value="">All</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="partially_refunded">Partly refunded</option></select>
      {pays.error ? <Problem error={pays.error} retry={pays.reload} /> : pays.busy && !pays.data ? <Spinner /> : <PaymentRows rows={pays.data ?? []} />}
    </div>
  );
}

function RequestsScreen() {
  const reqs = useLoad(async () => (await api<{ data: Request[] }>("/payment-requests")).data);
  const [amount, setAmount] = useState(""); const [desc, setDesc] = useState(""); const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [copied, setCopied] = useState("");
  const create = async () => {
    setErr(null); const c = cents(amount);
    if (!Number.isFinite(c) || c < 100) { setErr("Enter an amount of at least R 1.00."); return; }
    setBusy(true);
    try { await api("/payment-requests", { method: "POST", body: { amount: c, description: desc.trim() || undefined, customerEmail: email.trim() || undefined } }); setAmount(""); setDesc(""); setEmail(""); await reqs.reload(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const copy = async (r: Request) => { try { await navigator.clipboard.writeText(payLink(r.token)); setCopied(r.id); } catch { setErr("Could not copy. Link: " + payLink(r.token)); } };
  const cancel = async (r: Request) => { try { await api(`/payment-requests/${r.id}/cancel`, { method: "POST", body: {} }); await reqs.reload(); } catch (e) { setErr(msg(e)); } };
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-6" style={{ background: "#F7F9F8" }}>
      <h2 className="pb-2 pt-4 text-base font-black text-gray-900">Payment links</h2>
      <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm">
        <input aria-label="Amount in rand" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (R)" inputMode="decimal" className={input} />
        <input aria-label="What it is for" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What it is for (optional)" maxLength={140} className={input} />
        <input aria-label="Customer email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Customer email (optional)" type="email" className={input} />
        {err && <p role="alert" className="mb-2 text-xs text-red-600">{err}</p>}
        <button onClick={create} disabled={busy} className={primary} style={{ background: PURPLE }}>{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Create payment link"}</button>
      </div>
      {reqs.error ? <Problem error={reqs.error} retry={reqs.reload} /> : reqs.busy && !reqs.data ? <Spinner /> : (reqs.data ?? []).length === 0 ? <p className="text-xs text-gray-500">No payment links yet.</p> : (
        <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
          {reqs.data!.map((r) => (
            <div key={r.id} className="px-3 py-2.5">
              <div className="flex justify-between"><p className="text-xs font-semibold text-gray-900">{r.description || "Payment request"}</p><p className="text-xs font-bold">{rand(r.amount)}</p></div>
              <p className="text-[10px] text-gray-500">{r.status} · expires {when(r.expires_at)}</p>
              {r.status === "open" && <div className="mt-1.5 flex gap-2">
                <button onClick={() => copy(r)} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold">{copied === r.id ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}{copied === r.id ? "Copied" : "Copy link"}</button>
                <button onClick={() => cancel(r)} className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold text-red-700">Cancel</button></div>}
            </div>))}
        </div>)}
    </div>
  );
}

function PayoutsScreen() {
  const bal = useLoad(() => api<Balance>("/balance"));
  const accts = useLoad(async () => (await api<{ data: Account[] }>("/bank/accounts")).data);
  const outs = useLoad(async () => (await api<{ data: Payout[] }>("/payouts")).data);
  const [dest, setDest] = useState(""); const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false); const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const to = dest || accts.data?.[0]?.id || "";
  const request = async () => {
    setNote(null);
    const body: Record<string, unknown> = { destination: { type: "bank_account", accountId: to } };
    if (amount.trim()) { const c = cents(amount); if (!Number.isFinite(c) || c < 1) { setNote({ ok: false, text: "Enter a valid amount, or leave it empty to pay out everything available." }); return; } body.amount = c; }
    setBusy(true);
    try { const p = await api<Payout>("/payouts", { method: "POST", body, idem: true }); setNote({ ok: true, text: p.status === "pending_approval" ? `${rand(p.net)} is waiting for an administrator to approve it.` : `${rand(p.net)} is on its way (fee ${rand(p.fee)}).` }); setAmount(""); await Promise.all([bal.reload(), outs.reload(), accts.reload()]); }
    catch (e) { setNote({ ok: false, text: msg(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-6" style={{ background: "#F7F9F8" }}>
      <h2 className="pb-2 pt-4 text-base font-black text-gray-900">Payouts</h2>
      {bal.error ? <Problem error={bal.error} retry={bal.reload} /> : bal.data && <div className="mb-3 grid grid-cols-2 gap-2"><Stat label="Available now" value={rand(bal.data.available)} /><Stat label="You would receive" value={rand(bal.data.available_for_payout)} sub={`after the ${rand(bal.data.payout_fee)} fee`} /></div>}
      {(accts.data ?? []).length === 0 ? <p className="mb-3 text-xs text-gray-600">Add a bank account in your VINK dashboard to receive payouts.</p> : (<>
        <select aria-label="Pay out to" value={to} onChange={(e) => setDest(e.target.value)} className={input}>{accts.data!.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.number}</option>)}</select>
        <input aria-label="Payout amount in rand" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (R) — empty pays out everything available" inputMode="decimal" className={input} />
        {note && <p role={note.ok ? "status" : "alert"} className={`mb-2 text-xs font-medium ${note.ok ? "text-green-700" : "text-red-600"}`}>{note.text}</p>}
        <button onClick={request} disabled={busy} className={primary} style={{ background: PURPLE }}>{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Request payout"}</button></>)}
      <p className="pb-1 pt-4 text-xs font-bold text-gray-900">History</p>
      {outs.error ? <Problem error={outs.error} retry={outs.reload} /> : (outs.data ?? []).length === 0 ? <p className="text-xs text-gray-500">No payouts yet.</p> : (
        <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">{outs.data!.map((p) => <div key={p.id} className="flex justify-between px-3 py-2.5"><div><p className="text-xs font-semibold text-gray-900">{rand(p.net)}</p><p className="text-[10px] text-gray-500">{when(p.created_at)} · {p.status.replace("_", " ")}</p></div><p className="text-[10px] text-gray-500">fee {rand(p.fee)}</p></div>)}</div>)}
    </div>
  );
}

function MoreScreen({ user, onSignOut }: { user: ApiUser; onSignOut: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-6" style={{ background: "#F7F9F8" }}>
      <h2 className="pb-2 pt-4 text-base font-black text-gray-900">Account</h2>
      <div className="rounded-2xl bg-white p-4 text-xs shadow-sm"><p className="font-bold text-gray-900">{user.name}</p><p className="text-gray-500">{user.email}</p>
        <p className="mt-2 flex items-center gap-1 text-gray-600"><ShieldCheck className="h-3.5 w-3.5" />Settings, team members, API keys and statements are in your VINK dashboard on the website.</p></div>
      <button onClick={onSignOut} className={primary + " mt-4"} style={{ background: PURPLE }}>Sign out</button>
    </div>
  );
}

export function VinkBusinessBankingApp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [authUser, setAuthUser] = useState<ApiUser | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const s = getSession();
    if (s && s.username !== "superadmin" && s.username !== "admin") setAuthUser(s); else if (s) clearSession();
    setChecked(true);
  }, []);
  if (!isOpen) return null;
  const isCustomer = authUser?.role === "customer";
  const TABS: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Home", icon: <Home className="h-5 w-5" /> }, { id: "payments", label: "Payments", icon: <Banknote className="h-5 w-5" /> },
    { id: "requests", label: "Links", icon: <FileText className="h-5 w-5" /> }, { id: "payouts", label: "Payouts", icon: <Banknote className="h-5 w-5" /> },
    { id: "cards", label: "Cards", icon: <CreditCard className="h-5 w-5" /> }, { id: "more", label: "More", icon: <MoreHorizontal className="h-5 w-5" /> },
  ];
  return (
    <MobileAppOverlay onClose={onClose} appName="VINK Business" bgColor="#F7F9F8" live>
      <PhoneFrame statusBarColor={PURPLE} statusBarTextLight>
        <div className="flex flex-1 flex-col overflow-hidden">
          {!checked ? <Spinner /> : !authUser ? <LoginScreen onAuthenticated={(u) => { setAuthUser(u); setScreen("home"); }} /> : !isCustomer ? (
            <div className="flex flex-1 items-center justify-center px-8 text-center text-xs text-gray-600">This app is for business customer accounts. Staff and portal accounts use their own dashboards.</div>
          ) : (<>
            {screen === "home" && <HomeScreen user={authUser} />}
            {screen === "payments" && <PaymentsScreen />}
            {screen === "requests" && <RequestsScreen />}
            {screen === "payouts" && <PayoutsScreen />}
            {screen === "cards" && <CardsScreen />}
            {screen === "more" && <MoreScreen user={authUser} onSignOut={() => { clearSession(); setAuthUser(null); }} />}
          </>)}
        </div>
        {authUser && isCustomer && (
          <div className="flex flex-shrink-0 items-center border-t bg-white" style={{ borderColor: `${PURPLE}22` }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setScreen(t.id)} className="relative flex flex-1 flex-col items-center gap-0.5 py-2" style={{ color: screen === t.id ? PURPLE : "#6B7280" }}>
                {t.icon}<span className="text-[9px] font-semibold">{t.label}</span>
              </button>))}
          </div>)}
      </PhoneFrame>
    </MobileAppOverlay>
  );
}
