import { useCallback, useEffect, useState } from "react";
import { Home, Send, CreditCard, Clock, Star, Loader2, Eye, EyeOff, ShieldCheck, CheckCircle, AlertTriangle, ArrowUpRight, ArrowDownLeft, Plus, Lock, RefreshCw } from "lucide-react";
import { MobileAppOverlay, PhoneFrame } from "./PhoneFrame";
import { authApi, getSession, clearSession, type ApiUser } from "../../services/apiClient";
import { api, ManshyaError } from "../manshya/api";
import { BRAND } from "../../brand";

/**
 * The personal banking app. Everything on every screen comes from the signed-in customer's own VINK accounts: balances, transfers,
 * saved recipients, statement lines, cards and cashback. Nothing here is sample data, and a transfer is only reported as done when the
 * server has posted it to the ledger. Amounts travel as cents.
 */

export const PURPLE = BRAND.crimson;
type Screen = "home" | "send" | "cards" | "history" | "rewards";

interface Account { id: string; name: string; number: string; kind: string; balance: number }
interface Beneficiary { id: string; name: string; bank: string; account_number: string; branch_code: string | null }
interface Transfer { id: string; from_account: string; kind: string; to_ref: string; amount: number; reference: string | null; status: string; category: string | null; created_at: string }
interface Card { id: string; account_id: string; brand: string; last4: string; limit: number; status: string; kind?: string }
interface Line { date: string; kind: string; memo: string | null; amount: number; balance: number }

export const rand = (cents: number) => (cents < 0 ? "-R " : "R ") + (Math.abs(cents) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toCents = (s: string) => Math.round(parseFloat(s.replace(",", ".")) * 100);
export const when = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
export const msg = (e: unknown) => (e instanceof ManshyaError || e instanceof Error ? e.message : "Something went wrong. Please try again.");

export const input = "w-full mb-2.5 px-3.5 py-3 rounded-xl border border-gray-200 text-sm outline-none bg-white";
export const primary = "w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-50";

/** Loads one thing and lets the screen retry it; the screen shows the error instead of stale or invented numbers. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => { setBusy(true); setError(null); try { setData(await load()); } catch (e) { setError(msg(e)); } finally { setBusy(false); } }, deps);
  useEffect(() => { void run(); }, [run]);
  return { data, error, busy, reload: run };
}

export function Problem({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="alert" className="m-4 rounded-xl bg-red-50 p-4 text-center text-xs text-red-700">
      <AlertTriangle className="mx-auto mb-2 h-5 w-5" aria-hidden="true" />
      <p>{error}</p>
      <button onClick={retry} className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-bold text-red-700"><RefreshCw className="h-3 w-3" />Try again</button>
    </div>
  );
}
export const Spinner = () => <div className="flex flex-1 items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: PURPLE }} /></div>;

/* ───────────── sign in ───────────── */
export function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: ApiUser) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [code, setCode] = useState(""); const [needCode, setNeedCode] = useState(false);
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!username || !password || (mode === "register" && (!name || !email))) { setError("Fill in all fields."); return; }
    setLoading(true);
    const r = mode === "signin" ? await authApi.login(username, password, needCode ? code.trim() : undefined) : await authApi.register({ username, password, name, email });
    setLoading(false);
    if (r.success && r.data) { onAuthenticated((r.data as { user: ApiUser }).user); return; }
    if ((r as { code?: string }).code === "mfa_required") { setNeedCode(true); return; }
    setError((r as { error?: string }).error ?? "Something went wrong. Please try again.");
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto" style={{ background: "#F9FAFB" }}>
      <div className="flex flex-1 flex-col justify-center px-6">
        <div className="mb-8 text-center">
          <p className="text-2xl font-black"><span style={{ color: PURPLE }}>VINK</span> <span style={{ color: BRAND.navy }}>Bank</span></p>
          <p className="mt-1 text-xs text-gray-400">Banking that moves with you.</p>
        </div>
        {error && <div role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}
        {mode === "register" && (<>
          <input aria-label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={input} />
          <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className={input} />
        </>)}
        <input aria-label="Username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={input} />
        <input aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className={input} />
        {needCode && <input aria-label="Authenticator code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit authenticator code" inputMode="numeric" className={input} />}
        <button onClick={submit} disabled={loading} className={primary + " mt-1.5"} style={{ background: PURPLE }}>
          {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign In" : "Create Account"}
        </button>
        <button onClick={() => { setMode((m) => (m === "signin" ? "register" : "signin")); setError(null); }} className="mt-4 text-center text-xs font-semibold" style={{ color: PURPLE }}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
      <p className="pb-6 text-center text-[10px] text-gray-400">Same account works on vink.co.za and the VINK app.</p>
    </div>
  );
}

/* ───────────── home ───────────── */
function OpenAccount({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("Everyday account"); const [kind, setKind] = useState<"current" | "savings">("current");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const open = async () => { setBusy(true); setErr(null); try { await api("/bank/accounts", { method: "POST", body: { name, kind } }); onDone(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  return (
    <div className="mx-3 mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-bold text-gray-900">Open an account</p>
      <input aria-label="Account name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
      <select aria-label="Account type" value={kind} onChange={(e) => setKind(e.target.value as "current" | "savings")} className={input}><option value="current">Current</option><option value="savings">Savings</option></select>
      {err && <p role="alert" className="mb-2 text-xs text-red-600">{err}</p>}
      <button onClick={open} disabled={busy || !name.trim()} className={primary} style={{ background: PURPLE }}><Plus className="mr-1 inline h-4 w-4" />Open account</button>
    </div>
  );
}

function HomeScreen({ user, go }: { user: ApiUser; go: (s: Screen) => void }) {
  const accounts = useLoad(async () => (await api<{ data: Account[] }>("/bank/accounts")).data);
  const transfers = useLoad(async () => (await api<{ data: Transfer[] }>("/bank/transfers")).data);
  const [hide, setHide] = useState(false);
  const list = accounts.data ?? [];
  const total = list.reduce((s, a) => s + a.balance, 0);
  return (
    <div className="flex h-full flex-col overflow-y-auto" style={{ background: "#F9FAFB" }}>
      <div className="flex flex-shrink-0 items-center justify-between px-4 py-3" style={{ background: PURPLE }}>
        <div><p className="text-[10px] text-white/60">Hello,</p><p className="text-sm font-bold text-white">{user.name}</p></div>
        <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[9px] font-semibold text-white/80"><ShieldCheck className="h-3 w-3" />Secure</span>
      </div>
      {accounts.busy && !accounts.data ? <Spinner /> : accounts.error ? <Problem error={accounts.error} retry={accounts.reload} /> : (<>
        <div className="px-4 pb-1 pt-4">
          <div className="flex items-center gap-1.5"><p className="text-[10px] font-medium text-gray-500">Total balance</p>
            <button aria-label={hide ? "Show balance" : "Hide balance"} onClick={() => setHide((h) => !h)}>{hide ? <EyeOff className="h-3 w-3 text-gray-500" /> : <Eye className="h-3 w-3 text-gray-500" />}</button></div>
          <p className="mt-0.5 text-2xl font-black text-gray-900" data-total>{hide ? "••••••" : rand(total)}</p>
        </div>
        {list.length === 0 ? <OpenAccount onDone={accounts.reload} /> : (
          <div className="mx-3 mt-2 space-y-2">
            {list.map((a) => (
              <div key={a.id} className="rounded-2xl p-4 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${PURPLE}, #5b0a18)` }}>
                <p className="text-[11px] capitalize text-white/70">{a.name} · {a.kind}</p>
                <p className="mt-1 text-xl font-black">{hide ? "••••••" : rand(a.balance)}</p>
                <p className="mt-1 font-mono text-[11px] text-white/70">Account {a.number}</p>
              </div>))}
          </div>)}
        <div className="mx-3 mt-3 grid grid-cols-4 gap-2">
          {([["send", "Send", Send], ["cards", "Cards", CreditCard], ["history", "History", Clock], ["rewards", "Rewards", Star]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => go(id)} className="flex flex-col items-center gap-1 rounded-xl bg-white py-3 text-[10px] font-semibold text-gray-700 shadow-sm"><Icon className="h-5 w-5" style={{ color: PURPLE }} />{label}</button>))}
        </div>
        <p className="px-4 pb-1 pt-4 text-xs font-bold text-gray-900">Recent activity</p>
        {transfers.error ? <Problem error={transfers.error} retry={transfers.reload} /> : (transfers.data ?? []).length === 0
          ? <p className="px-4 text-xs text-gray-500">No transfers yet.</p>
          : <TransferList items={(transfers.data ?? []).slice(0, 5)} />}
      </>)}
    </div>
  );
}

function TransferList({ items }: { items: Transfer[] }) {
  return (
    <div className="mx-3 mb-4 divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
      {items.map((t) => (
        <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100"><ArrowUpRight className="h-4 w-4 text-gray-600" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-gray-900">{t.reference || t.category || "Transfer"}</p><p className="text-[10px] text-gray-500">{when(t.created_at)} · {t.status}</p></div>
          <p className="text-xs font-bold text-gray-900">-{rand(t.amount)}</p>
        </div>))}
    </div>
  );
}

/* ───────────── send ───────────── */
function SendScreen({ initialAccountId }: { initialAccountId?: string }) {
  const accounts = useLoad(async () => (await api<{ data: Account[] }>("/bank/accounts")).data);
  const bens = useLoad(async () => (await api<{ data: Beneficiary[] }>("/bank/beneficiaries")).data);
  const [to, setTo] = useState<"own" | "internal" | "beneficiary">("beneficiary");
  const [from, setFrom] = useState(initialAccountId ?? ""); const [toAcc, setToAcc] = useState(""); const [number, setNumber] = useState(""); const [ben, setBen] = useState("");
  const [amount, setAmount] = useState(""); const [reference, setReference] = useState("");
  const [addOpen, setAddOpen] = useState(false); const [nb, setNb] = useState({ name: "", bank: "", accountNumber: "", branchCode: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState<Transfer | null>(null);
  const list = accounts.data ?? [];
  const source = from || list[0]?.id || "";

  const addBen = async () => {
    setError(null); setBusy(true);
    try { const b = await api<Beneficiary>("/bank/beneficiaries", { method: "POST", body: { ...nb, branchCode: nb.branchCode || undefined } }); await bens.reload(); setBen(b.id); setAddOpen(false); setNb({ name: "", bank: "", accountNumber: "", branchCode: "" }); }
    catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  const send = async () => {
    setError(null);
    const cents = toCents(amount);
    if (!source) { setError("Open an account first."); return; }
    if (!Number.isFinite(cents) || cents < 100) { setError("Enter an amount of at least R 1.00."); return; }
    const body: Record<string, unknown> = { type: to, fromAccountId: source, amount: cents, reference: reference.trim() || undefined };
    if (to === "own") { if (!toAcc) { setError("Choose the account to send to."); return; } body.toAccountId = toAcc; }
    if (to === "internal") { if (!number.trim()) { setError("Enter the account number."); return; } body.accountNumber = number.trim(); }
    if (to === "beneficiary") { if (!ben) { setError("Choose or add a recipient."); return; } body.beneficiaryId = ben; }
    setBusy(true);
    try { setDone(await api<Transfer>("/bank/transfers", { method: "POST", body, idem: true })); await accounts.reload(); }
    catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  if (done) return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: "#F9FAFB" }}>
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100"><CheckCircle className="h-10 w-10 text-green-600" /></div>
      <p className="text-2xl font-black" style={{ color: PURPLE }}>{rand(done.amount)}</p>
      <p className="text-sm font-semibold text-gray-700">{done.status === "completed" ? "Sent" : "On its way"}</p>
      <p className="text-[11px] text-gray-500">Reference {done.id}</p>
      <button onClick={() => { setDone(null); setAmount(""); setReference(""); }} className={primary} style={{ background: PURPLE }}>Send another</button>
    </div>);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-6" style={{ background: "#F9FAFB" }}>
      <h2 className="pb-2 pt-4 text-base font-black text-gray-900">Send money</h2>
      {accounts.error && <Problem error={accounts.error} retry={accounts.reload} />}
      {accounts.busy && !accounts.data ? <Spinner /> : list.length === 0 ? <p className="text-xs text-gray-600">Open an account on the Home tab before sending money.</p> : (<>
        <label className="mb-1 text-[11px] font-semibold text-gray-600" htmlFor="from-acc">From</label>
        <select id="from-acc" value={source} onChange={(e) => setFrom(e.target.value)} className={input}>{list.map((a) => <option key={a.id} value={a.id}>{a.name} · {rand(a.balance)}</option>)}</select>
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 text-[11px] font-semibold" role="tablist">
          {([["beneficiary", "Saved recipient"], ["internal", "VINK account"], ["own", "My accounts"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={to === k} onClick={() => setTo(k)} className={`rounded-lg py-2 ${to === k ? "bg-white shadow-sm" : "text-gray-600"}`}>{l}</button>))}
        </div>
        {to === "own" && <select aria-label="To account" value={toAcc} onChange={(e) => setToAcc(e.target.value)} className={input}><option value="">Choose account</option>{list.filter((a) => a.id !== source).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.number}</option>)}</select>}
        {to === "internal" && <input aria-label="Account number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="VINK account number" inputMode="numeric" className={input} />}
        {to === "beneficiary" && (<>
          <select aria-label="Recipient" value={ben} onChange={(e) => setBen(e.target.value)} className={input}><option value="">Choose recipient</option>{(bens.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name} · {b.bank} {b.account_number}</option>)}</select>
          <button onClick={() => setAddOpen((o) => !o)} className="mb-2.5 text-[11px] font-bold" style={{ color: PURPLE }}>{addOpen ? "Cancel" : "+ Add a recipient"}</button>
          {addOpen && (<div className="mb-3 rounded-xl bg-white p-3 shadow-sm">
            <input aria-label="Recipient name" value={nb.name} onChange={(e) => setNb({ ...nb, name: e.target.value })} placeholder="Name" className={input} />
            <input aria-label="Recipient bank" value={nb.bank} onChange={(e) => setNb({ ...nb, bank: e.target.value })} placeholder="Bank" className={input} />
            <input aria-label="Recipient account number" value={nb.accountNumber} onChange={(e) => setNb({ ...nb, accountNumber: e.target.value })} placeholder="Account number" inputMode="numeric" className={input} />
            <input aria-label="Branch code" value={nb.branchCode} onChange={(e) => setNb({ ...nb, branchCode: e.target.value })} placeholder="Branch code (6 digits, optional)" inputMode="numeric" className={input} />
            <button onClick={addBen} disabled={busy} className={primary} style={{ background: PURPLE }}>Save recipient</button></div>)}
        </>)}
        <input aria-label="Amount in rand" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (R)" inputMode="decimal" className={input} />
        <input aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" maxLength={35} className={input} />
        {error && <p role="alert" className="mb-2 text-xs font-medium text-red-600">{error}</p>}
        <button onClick={send} disabled={busy} className={primary} style={{ background: PURPLE }}>{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Send now"}</button>
        <p className="mt-3 text-center text-[10px] text-gray-500">Payments to other banks show as "processing" until the bank confirms them.</p>
      </>)}
    </div>
  );
}

/* ───────────── cards ───────────── */
export function CardsScreen() {
  const cards = useLoad(async () => (await api<{ data: Card[] }>("/bank/cards")).data);
  const accounts = useLoad(async () => (await api<{ data: Account[] }>("/bank/accounts")).data);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setErr(null); try { await fn(); await cards.reload(); } catch (e) { setErr(msg(e)); } finally { setBusy(""); } };
  const first = accounts.data?.[0];
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-6" style={{ background: "#F9FAFB" }}>
      <h2 className="pb-2 pt-4 text-base font-black text-gray-900">Cards</h2>
      {cards.error && <Problem error={cards.error} retry={cards.reload} />}
      {cards.busy && !cards.data ? <Spinner /> : (<>
        {(cards.data ?? []).length === 0 && <p className="mb-3 text-xs text-gray-600">You have no cards yet.</p>}
        {(cards.data ?? []).map((c) => (
          <div key={c.id} className="mb-3 rounded-2xl p-4 text-white shadow-lg" style={{ background: c.status === "blocked" ? "#6b7280" : `linear-gradient(135deg, ${PURPLE}, #5b0a18)` }}>
            <p className="text-[11px] capitalize text-white/70">{c.brand} · {c.kind ?? "debit"}</p>
            <p className="mt-2 font-mono text-lg tracking-widest">•••• •••• •••• {c.last4}</p>
            <p className="mt-2 text-[11px] capitalize text-white/80">{c.status === "inactive" ? "Not activated yet" : c.status} · limit {rand(c.limit)}</p>
            <div className="mt-3 flex gap-2">
              {c.status === "inactive" && <button disabled={!!busy} onClick={() => act(c.id, () => api(`/bank/cards/${c.id}/activate`, { method: "POST", body: {} }))} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-black">Activate</button>}
              {c.status !== "blocked" && <button disabled={!!busy} onClick={() => act(c.id, () => api(`/bank/cards/${c.id}/block`, { method: "POST", body: { reason: "lost" } }))} className="rounded-full bg-white/20 px-3 py-1.5 text-[11px] font-bold"><Lock className="mr-1 inline h-3 w-3" />Block (lost)</button>}
            </div>
          </div>))}
        {err && <p role="alert" className="mb-2 text-xs text-red-600">{err}</p>}
        {first ? <button disabled={!!busy} onClick={() => act("new", () => api("/bank/cards", { method: "POST", body: { accountId: first.id, kind: "debit" } }))} className={primary} style={{ background: PURPLE }}>Order a debit card</button>
          : <p className="text-xs text-gray-600">Open an account on the Home tab to order a card.</p>}
        <p className="mt-3 text-center text-[10px] text-gray-500">A blocked card is replaced automatically with a new one to activate.</p>
      </>)}
    </div>
  );
}

/* ───────────── history ───────────── */
function HistoryScreen() {
  const accounts = useLoad(async () => (await api<{ data: Account[] }>("/bank/accounts")).data);
  const [sel, setSel] = useState("");
  const id = sel || accounts.data?.[0]?.id || "";
  const lines = useLoad(async () => (id ? (await api<{ data: Line[] }>(`/bank/accounts/${id}/statement?limit=50`)).data : []), [id]);
  return (
    <div className="flex h-full flex-col overflow-y-auto pb-6" style={{ background: "#F9FAFB" }}>
      <h2 className="px-4 pb-2 pt-4 text-base font-black text-gray-900">History</h2>
      {accounts.error && <Problem error={accounts.error} retry={accounts.reload} />}
      {(accounts.data ?? []).length > 1 && <select aria-label="Account" value={id} onChange={(e) => setSel(e.target.value)} className={input + " mx-4 !w-[calc(100%-2rem)]"}>{accounts.data!.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.number}</option>)}</select>}
      {lines.error ? <Problem error={lines.error} retry={lines.reload} /> : (lines.busy && !lines.data) || accounts.busy ? <Spinner /> : (lines.data ?? []).length === 0
        ? <p className="px-4 text-xs text-gray-600">{id ? "No activity on this account yet." : "Open an account on the Home tab to see its history."}</p>
        : (<div className="mx-3 divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
          {(lines.data ?? []).map((l, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">{l.amount < 0 ? <ArrowUpRight className="h-4 w-4 text-gray-600" /> : <ArrowDownLeft className="h-4 w-4 text-green-600" />}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-gray-900">{l.memo || l.kind}</p><p className="text-[10px] text-gray-500">{when(l.date)} · balance {rand(l.balance)}</p></div>
              <p className={`text-xs font-bold ${l.amount < 0 ? "text-gray-900" : "text-green-700"}`}>{l.amount > 0 ? "+" : ""}{rand(l.amount)}</p>
            </div>))}
        </div>)}
    </div>
  );
}

/* ───────────── rewards ───────────── */
function RewardsScreen() {
  const rewards = useLoad(async () => api<{ balance: number; history: { memo: string; amount: number; created_at: string }[] }>("/rewards"));
  const accounts = useLoad(async () => (await api<{ data: Account[] }>("/bank/accounts")).data);
  const [busy, setBusy] = useState(false); const [note, setNote] = useState<string | null>(null);
  const first = accounts.data?.[0];
  const redeem = async () => {
    if (!first) return; setBusy(true); setNote(null);
    try { const r = await api<{ redeemed: number }>("/rewards/redeem", { method: "POST", body: { accountId: first.id } }); setNote(`${rand(r.redeemed)} was added to ${first.name}.`); await rewards.reload(); }
    catch (e) { setNote(msg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="flex h-full flex-col overflow-y-auto pb-6" style={{ background: "#F9FAFB" }}>
      <h2 className="px-4 pb-2 pt-4 text-base font-black text-gray-900">Cashback</h2>
      {rewards.error ? <Problem error={rewards.error} retry={rewards.reload} /> : rewards.busy && !rewards.data ? <Spinner /> : (<>
        <div className="mx-3 rounded-2xl p-5 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${PURPLE}, #5b0a18)` }}>
          <p className="text-[11px] text-white/70">Cashback balance</p><p className="mt-1 text-2xl font-black">{rand(rewards.data?.balance ?? 0)}</p>
        </div>
        <div className="px-3 pt-3"><button onClick={redeem} disabled={busy || !first || (rewards.data?.balance ?? 0) <= 0} className={primary} style={{ background: PURPLE }}>Add to my account</button>
          {note && <p role="status" className="mt-2 text-center text-xs text-gray-700">{note}</p>}</div>
        <p className="px-4 pb-1 pt-4 text-xs font-bold text-gray-900">History</p>
        {(rewards.data?.history ?? []).length === 0 ? <p className="px-4 text-xs text-gray-600">Cashback you earn will show here.</p> : (
          <div className="mx-3 divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
            {rewards.data!.history.map((h, i) => (<div key={i} className="flex items-center justify-between px-3 py-2.5"><div><p className="text-xs font-semibold text-gray-900">{h.memo}</p><p className="text-[10px] text-gray-500">{when(h.created_at)}</p></div><p className={`text-xs font-bold ${h.amount < 0 ? "text-gray-900" : "text-green-700"}`}>{h.amount > 0 ? "+" : ""}{rand(h.amount)}</p></div>))}
          </div>)}
      </>)}
    </div>
  );
}

/* ───────────── the app ───────────── */
export function VinkBankingApp({ isOpen, onClose, onOpenManagementPanel, onOpenAdminPanel, initialScreen }: { isOpen: boolean; onClose: () => void; onOpenManagementPanel?: () => void; onOpenAdminPanel?: () => void; initialScreen?: Screen }) {
  const [screen, setScreen] = useState<Screen>(initialScreen ?? "home");
  const [authUser, setAuthUser] = useState<ApiUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s && s.username !== "superadmin" && s.username !== "admin") { setAuthUser(s); setScreen(initialScreen ?? "home"); }
    else if (s) clearSession();        // a staff session is never carried into the customer app
    setChecked(true);
  }, [initialScreen]);

  if (!isOpen) return null;

  const handleAuthenticated = (user: ApiUser) => {
    if (user.username === "superadmin" && onOpenManagementPanel) { onClose(); onOpenManagementPanel(); return; }
    if (user.username === "admin" && onOpenAdminPanel) { onClose(); onOpenAdminPanel(); return; }
    setAuthUser(user); setScreen("home");
  };
  const isCustomer = authUser?.role === "customer";

  const TABS: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Home", icon: <Home className="h-5 w-5" /> }, { id: "send", label: "Send", icon: <Send className="h-5 w-5" /> },
    { id: "cards", label: "Cards", icon: <CreditCard className="h-5 w-5" /> }, { id: "history", label: "History", icon: <Clock className="h-5 w-5" /> },
    { id: "rewards", label: "Rewards", icon: <Star className="h-5 w-5" /> },
  ];

  return (
    <MobileAppOverlay onClose={onClose} appName="VINK Bank" bgColor="#F9FAFB" live>
      <PhoneFrame statusBarColor={PURPLE} statusBarTextLight>
        <div className="flex flex-1 flex-col overflow-hidden">
          {!checked ? <Spinner /> : !authUser ? <LoginScreen onAuthenticated={handleAuthenticated} /> : !isCustomer ? (
            <div className="flex flex-1 items-center justify-center px-8 text-center text-xs text-gray-600">This app is for personal customer accounts. Staff and portal accounts use their own dashboards.</div>
          ) : (<>
            {screen === "home" && <HomeScreen user={authUser} go={setScreen} />}
            {screen === "send" && <SendScreen />}
            {screen === "cards" && <CardsScreen />}
            {screen === "history" && <HistoryScreen />}
            {screen === "rewards" && <RewardsScreen />}
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
