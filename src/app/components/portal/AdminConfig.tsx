import { useEffect, useMemo, useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { authFetch, getSession } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { Badge } from "../dashboards/DashboardShell";
import { useLoad, Status, Empty, ActionButton, inputCls, when } from "./ui";
import { usePageTitle } from "../ds";

const COLOR = "#38BDF8";
const STAFF = ["owner", "superadmin"];
const STATUS_COLOR: Record<string, string> = { active: "#10B981", draft: "#94A3B8", pending_approval: "#F59E0B", approved: "#38BDF8", rejected: "#EF4444", retired: "#64748B" };
const LIVE_PHRASE = "I_UNDERSTAND_THIS_MOVES_REAL_MONEY";

type Reply<T = Record<string, any>> = { data: T } | { error: string; problems?: string[] };   // eslint-disable-line @typescript-eslint/no-explicit-any

export async function configApi(path: string, init?: { method?: string; body?: unknown }): Promise<Reply> {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/config${path}`, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
    const body = await res.json().catch(() => ({}));
    return !res.ok || body.success === false ? { error: body.error ?? `Request failed (${res.status})`, problems: body.problems ?? body.errors } : { data: body };
  } catch { return { error: "We could not reach the server." }; }
}
const fail = (r: Reply) => ("error" in r ? { error: r.problems?.length ? `${r.error} ${r.problems.join(" ")}` : r.error } : undefined);
const cents = (n: number, cur = "ZAR") => `${cur} ${(n / 100).toFixed(2)}`;

/** Staff page for the country configuration: edit a draft, see exactly what changes, submit it for approval, approve (someone else), activate. */
export function AdminConfig({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  usePageTitle(isOpen ? "Country configuration" : null);
  const session = getSession();
  if (!isOpen) return null;
  const staff = !!session && STAFF.includes(session.role);
  return <ConfigPage onClose={onClose} staff={staff} meId={session?.id ?? ""} />;
}

function ConfigPage({ onClose, staff, meId }: { onClose: () => void; staff: boolean; meId: string }) {
  const [country, setCountry] = useState<"ZA" | "ZM">("ZA");
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  return (
    <div data-theme-aware className="fixed inset-0 z-[80] overflow-y-auto" style={{ background: "var(--vk-bg)" }} role="dialog" aria-modal="true" aria-label="Country configuration">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between"><h1 className="text-xl font-bold text-fg flex items-center gap-2"><SlidersHorizontal className="w-5 h-5" style={{ color: `color-mix(in srgb, ${COLOR} 62%, var(--vk-fg))` }} />Country configuration</h1>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 text-fg-muted"><X className="w-5 h-5" /></button></div>
        {!staff ? <p role="alert" className="text-sm text-bad">This page is for administrators. Please sign in with a staff account.</p> : (
          <Body country={country} setCountry={setCountry} tick={tick} refresh={refresh} meId={meId} />)}
      </div>
    </div>
  );
}

function Body({ country, setCountry, tick, refresh, meId }: { country: "ZA" | "ZM"; setCountry: (c: "ZA" | "ZM") => void; tick: number; refresh: () => void; meId: string }) {
  const [overview] = useLoad<{ approvalsRequired: number; countries: { country: string; active: { id: string; version: number; mode: string } | null; inProgress: { id: string; version: number; status: string } | null }[] }>(() => configApi("/") as never, [tick]);
  return (
          <>
            <div className="flex gap-2" role="tablist">{(["ZA", "ZM"] as const).map((c) => (
              <button key={c} role="tab" aria-selected={country === c} onClick={() => setCountry(c)} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: country === c ? COLOR : "var(--vk-surface)", color: country === c ? "#101010" : "#cbd5e1", border: "1px solid var(--vk-line)" }}>{c === "ZA" ? "South Africa" : "Zambia"}</button>))}</div>
            <Status load={overview}>{(o) => {
              const c = o.countries.find((x) => x.country === country);
              return <Country key={country + tick} country={country} active={c?.active ?? null} inProgress={c?.inProgress ?? null} approvalsRequired={o.approvalsRequired} meId={meId} onChange={refresh} />;
            }}</Status>
            <Reconciliation />
            <PoolPanel />
            <PooledAccountsPanel />
            <StatementImportPanel />
            <FxPanel />
            <TokensAdminPanel />
            <RulesTester country={country} />
            <Audit key={tick} />
          </>
  );
}

interface Brief { id: string; version: number; status?: string; mode?: string }

function Country({ country, active, inProgress, approvalsRequired, meId, onChange }: { country: string; active: Brief | null; inProgress: Brief | null; approvalsRequired: number; meId: string; onChange: () => void }) {
  const shown = inProgress ?? active;
  const [load] = useLoad<{ profile: { id: string; version: number; status: string; config: any; createdBy: string | null; note: string | null }; approvals: { approver: string; decision: string; note: string | null; at: string }[]; changesFromActive: { path: string; before: unknown; after: unknown }[] }>(
    () => (shown ? (configApi(`/profiles/${shown.id}`) as never) : Promise.resolve({ error: "No version yet" })), [shown?.id]);   // eslint-disable-line @typescript-eslint/no-explicit-any
  const versions = useLoad<{ versions: { id: string; version: number; status: string; note: string | null; activatedAt: string | null }[] }>(() => configApi(`/${country}/versions`) as never, [country, shown?.id, shown?.status])[0];

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4 min-w-0">
        {!shown ? (
          <Empty>No version exists yet. <ActionButton small label="Start a draft" color={COLOR} onRun={async () => { const r = await configApi(`/${country}/drafts`, { method: "POST", body: {} }); if (!("error" in r)) onChange(); return fail(r); }} /></Empty>
        ) : (
          <><Status load={load}>{(d) => <Editor key={d.profile.id + d.profile.status} d={d} hasActive={!!active} approvalsRequired={approvalsRequired} meId={meId} onChange={onChange} country={country} />}</Status><ReadinessPanel profileId={shown.id} /></>)}
        {shown && !inProgress && (
          <p className="text-sm text-fg">This is the live version. To change anything, start a new draft: <ActionButton small label="Start a draft from this version" color={COLOR} onRun={async () => { const r = await configApi(`/${country}/drafts`, { method: "POST", body: {} }); if (!("error" in r)) onChange(); return fail(r); }} /></p>)}
        <Simulator country={country} />
      </div>
      <aside className="space-y-2"><h2 className="text-sm font-bold text-fg">Versions</h2>
        <Status load={versions}>{({ versions: v }) => <ul className="space-y-1.5">{v.map((x) => (
          <li key={x.id} className="rounded-lg px-3 py-2 text-xs flex items-center justify-between" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
            <span className="text-fg">v{x.version}{x.note ? <span className="text-fg-muted"> · {x.note}</span> : null}</span><Badge text={x.status.replace("_", " ")} color={STATUS_COLOR[x.status]} /></li>))}</ul>}</Status></aside>
    </div>
  );
}

function Editor({ d, hasActive, approvalsRequired, meId, onChange, country }: { d: { profile: { id: string; version: number; status: string; config: any; createdBy: string | null }; approvals: { approver: string; decision: string; note: string | null; at: string }[]; changesFromActive: { path: string; before: unknown; after: unknown }[] }; hasActive: boolean; approvalsRequired: number; meId: string; onChange: () => void; country: string }) {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const { profile: p } = d;
  const editable = p.status === "draft" && (p.createdBy === null || p.createdBy === meId);
  const [text, setText] = useState(() => JSON.stringify(p.config, null, 2));
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState(""); const [phrase, setPhrase] = useState("");
  const parsed = useMemo(() => { try { return { ok: true as const, value: JSON.parse(text) }; } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Invalid JSON" }; } }, [text]);
  const dirty = text !== JSON.stringify(p.config, null, 2);

  useEffect(() => {          // live validation while typing (debounced); the server is the judge, this is only feedback
    if (!parsed.ok) { setProblems([`The text is not valid JSON: ${parsed.error}`]); return; }
    const t = setTimeout(async () => { const r = await configApi("/validate", { method: "POST", body: { config: parsed.value, country } }); setProblems("data" in r ? (r.data.errors ?? []) : [r.error]); }, 400);
    return () => clearTimeout(t);
  }, [parsed, country]);

  const myName = getSession()?.name;
  const myDecision = d.approvals.find((a) => a.approver === myName);
  const live = p.config.mode === "live";
  const money = p.config.currency?.code ?? "ZAR";
  return (
    <section className="rounded-xl p-4 space-y-4" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-fg font-bold">Version {p.version}</h2><Badge text={p.status.replace("_", " ")} color={STATUS_COLOR[p.status]} /><Badge text={live ? "LIVE MODE" : "sandbox"} color={live ? "#EF4444" : "#94A3B8"} />
        <span className="text-xs text-fg-muted">Marshal fee {cents(p.config.marshalFee?.amountCents ?? 0, money)} · {p.config.trip?.tapsPerTrip} taps per trip · no PIN below {cents(p.config.afc?.noPinBelowCents ?? 0, money)}</span></div>

      {editable ? <p className="text-xs text-fg-muted">Amounts are whole minor units (cents). Edit the JSON below; it is checked as you type.</p> : <p className="text-xs text-fg-muted">{p.status === "draft" ? "Only the person who created this draft can edit it." : "This version is frozen: what is approved is exactly what gets activated."}</p>}
      <textarea aria-label="Configuration JSON" spellCheck={false} readOnly={!editable} value={text} onChange={(e) => setText(e.target.value)} rows={18} className={inputCls + " font-mono text-xs leading-5"} />
      {problems.length > 0 ? <ul role="alert" className="text-xs text-bad list-disc pl-5 space-y-0.5">{problems.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul> : parsed.ok && <p className="text-xs text-ok" role="status">The configuration is valid.</p>}

      {p.status !== "active" && hasActive && (
        <div><h3 className="text-sm font-bold text-fg mb-1">What changes compared with the live version</h3>
          {d.changesFromActive.length === 0 ? <Empty>No differences.</Empty> : (
            <table className="w-full text-xs"><thead className="text-fg-subtle text-left"><tr><th className="py-1">Setting</th><th>Now</th><th>Proposed</th></tr></thead>
              <tbody>{d.changesFromActive.map((c) => <tr key={c.path} className="border-t border-line text-fg align-top"><td className="py-1 pr-2 font-mono">{c.path}</td><td className="pr-2 break-all">{JSON.stringify(c.before) ?? "–"}</td><td className="break-all">{JSON.stringify(c.after) ?? "–"}</td></tr>)}</tbody></table>)}
        </div>)}

      {d.approvals.length > 0 && <ul className="text-xs text-fg space-y-0.5">{d.approvals.map((a, i) => <li key={i}>{a.decision === "approve" ? "✔" : "✖"} {a.approver}{a.note ? ` — ${a.note}` : ""} <span className="text-fg-subtle">· {when(a.at)}</span></li>)}</ul>}

      <div className="flex flex-wrap items-center gap-3">
        {editable && <>
          <ActionButton label="Save draft" color={COLOR} onRun={async () => { if (!parsed.ok) return { error: "Fix the JSON first" }; const r = await configApi(`/profiles/${p.id}`, { method: "PUT", body: { config: parsed.value } }); if (!("error" in r)) onChange(); return "error" in r ? fail(r) : { message: "Saved" }; }} />
          <ActionButton label="Submit for approval" color="#F59E0B" onRun={async () => { if (dirty) return { error: "Save the draft first" }; const r = await configApi(`/profiles/${p.id}/submit`, { method: "POST" }); if (!("error" in r)) onChange(); return fail(r); }} />
        </>}
        {p.status === "pending_approval" && (p.createdBy === meId
          ? <p className="text-xs text-warn">Waiting for {approvalsRequired} approval{approvalsRequired === 1 ? "" : "s"} from other administrators. You created this change, so you cannot approve it.</p>
          : !myDecision && <>
            <ActionButton label="Approve" color="#10B981" onRun={async () => { const r = await configApi(`/profiles/${p.id}/decision`, { method: "POST", body: { approve: true } }); if (!("error" in r)) onChange(); return fail(r); }} />
            <input className={inputCls + " !w-56"} placeholder="Reason (needed to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
            <ActionButton label="Reject" color="#EF4444" onRun={async () => { const r = await configApi(`/profiles/${p.id}/decision`, { method: "POST", body: { approve: false, note } }); if (!("error" in r)) onChange(); return fail(r); }} /></>)}
        {p.status === "approved" && <>
          {live && <input className={inputCls + " !w-80"} placeholder={`Type ${LIVE_PHRASE} to go live`} value={phrase} onChange={(e) => setPhrase(e.target.value)} />}
          <ActionButton label={live ? "Activate (LIVE)" : "Activate"} color={live ? "#EF4444" : "#10B981"} onRun={async () => { const r = await configApi(`/profiles/${p.id}/activate`, { method: "POST", body: live ? { confirm: phrase } : {} }); if (!("error" in r)) onChange(); return fail(r); }} /></>}
      </div>
    </section>
  );
}

function Simulator({ country }: { country: string }) {
  const [txn, setTxn] = useState("card_online"); const [amount, setAmount] = useState("100.00");
  const [payerType, setPayerType] = useState(""); const [tier, setTier] = useState("");
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) return { error: "Enter an amount like 100.00" };
    const r = await configApi("/simulate", { method: "POST", body: { country, txn, amountCents, payerType: payerType || undefined, tier: tier || undefined } });
    if ("error" in r) { setOut(null); return fail(r); }
    const f = r.data.fee, s = r.data.afcSplit;
    setOut({ ok: true, text: `Fee ${(f.feeCents / 100).toFixed(2)} (${f.ruleId ?? "no rule"}: ${f.calculation})` + (s ? ` · platform ${(s.feeCents / 100).toFixed(2)}, investor ${(s.investorCents / 100).toFixed(2)}, owner side ${(s.remainderCents / 100).toFixed(2)}` : "") });
  };
  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <h2 className="text-sm font-bold text-fg">Fee simulator <span className="font-normal text-fg-muted">· uses the live version of this country</span></h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Transaction</span><select className={inputCls + " mt-1 !w-auto"} value={txn} onChange={(e) => setTxn(e.target.value)}>{["afc_tap", "card_pos", "card_online", "atm", "transfer_out", "payout", "deposit"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Amount</span><input className={inputCls + " mt-1 !w-32"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Payer type</span><select className={inputCls + " mt-1 !w-auto"} value={payerType} onChange={(e) => setPayerType(e.target.value)}><option value="">any</option>{["driver", "marshal", "association", "vehicle_owner", "investor", "personal"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="block"><span className="text-[11px] text-fg-muted">KYC tier</span><select className={inputCls + " mt-1 !w-auto"} value={tier} onChange={(e) => setTier(e.target.value)}><option value="">any</option>{["basic", "standard", "full", "business"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <ActionButton label="Calculate" color={COLOR} onRun={run} />
      </div>
      {out && <p role="status" className="text-sm text-ok">{out.text}</p>}
    </section>
  );
}

async function moneyApi(path: string, init?: { method?: string; body?: unknown }): Promise<Reply> {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/money${path}`, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
    const body = await res.json().catch(() => ({}));
    return !res.ok || body.success === false ? { error: body.error ?? `Request failed (${res.status})` } : { data: body };
  } catch { return { error: "We could not reach the server." }; }
}

/** Do the platform's records and the Banking ledger agree? Read-only. */
function Reconciliation() {
  const [load, reload] = useLoad<{ ok: boolean; checkedAt: string; figures: Record<string, number>; issues: { severity: string; code: string; message: string; count: number }[] }>(() => moneyApi("/reconciliation") as never);
  return (
    <section className="rounded-xl p-4 space-y-2" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-fg">Reconciliation</h2><ActionButton small label="Check again" color={COLOR} onRun={async () => { reload(); }} /></div>
      <Status load={load}>{(r) => (
        <>
          <p role="status" className={`text-sm ${r.ok ? "text-ok" : "text-bad"}`}>{r.ok ? "Records and ledger agree." : "Something does not agree and needs an engineer."} <span className="text-fg-subtle">Checked {when(r.checkedAt)}</span></p>
          {r.issues.length > 0 && <ul className="text-xs space-y-1">{r.issues.map((i) => <li key={i.code + i.message} className={i.severity === "problem" ? "text-red-300" : "text-amber-300"}>{i.count} · {i.message}</li>)}</ul>}
          <p className="text-[11px] text-fg-muted">{r.figures.settledTaps} taps settled · {r.figures.unsettledConfirmedTaps} waiting · {r.figures.trips} trips · {r.figures.paidItems} payments made · {(r.figures.waitingCents / 100).toFixed(2)} waiting for funds · {(r.figures.arrearsCents / 100).toFixed(2)} in arrears</p>
        </>)}</Status>
    </section>
  );
}

/** "What would the live version do?" for a KYC limit, an instant-credit deposit or a cross-border quote. Nothing is stored or moved. */
function RulesTester({ country }: { country: string }) {
  const [kind, setKind] = useState("limit"); const [tier, setTier] = useState("basic"); const [amount, setAmount] = useState("500.00");
  const [channel, setChannel] = useState("transfer_out"); const [corridorId, setCorridor] = useState(country === "ZA" ? "ZA-ZM" : "ZM-ZA"); const [rate, setRate] = useState("1.5");
  const [out, setOut] = useState<string | null>(null);
  const run = async () => {
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter an amount like 500.00" };
    const r = await moneyApi("/check", { method: "POST", body: { country, kind, tier, amountCents, channel, corridorId, midRate: Number(rate), reserveBalanceCents: 0, outstandingCents: 0 } });
    if ("error" in r) { setOut(null); return { error: r.error }; }
    const v = r.data.result;
    setOut(v.ok ? "Allowed" + (v.receiveCents !== undefined ? ` · they receive ${(v.receiveCents / 100).toFixed(2)} after a ${(v.feeCents / 100).toFixed(2)} fee, quote valid to ${when(v.expiresAt)}` : "") : `Refused (${v.code}): ${v.message}`);
  };
  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <h2 className="text-sm font-bold text-fg">Limits tester <span className="font-normal text-fg-muted">· uses the live version of this country</span></h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Rule</span><select className={inputCls + " mt-1 !w-auto"} value={kind} onChange={(e) => setKind(e.target.value)}><option value="limit">KYC limit</option><option value="instant_credit">Instant credit</option><option value="corridor">Cross-border quote</option></select></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Account level</span><select className={inputCls + " mt-1 !w-auto"} value={tier} onChange={(e) => setTier(e.target.value)}>{["basic", "standard", "full", "business"].map((t) => <option key={t}>{t}</option>)}</select></label>
        {kind === "limit" && <label className="block"><span className="text-[11px] text-fg-muted">Channel</span><select className={inputCls + " mt-1 !w-auto"} value={channel} onChange={(e) => setChannel(e.target.value)}>{["transfer_in", "transfer_out", "atm", "pos", "online"].map((t) => <option key={t}>{t}</option>)}</select></label>}
        {kind === "corridor" && <><label className="block"><span className="text-[11px] text-fg-muted">Route</span><input className={inputCls + " mt-1 !w-28"} value={corridorId} onChange={(e) => setCorridor(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-fg-muted">Mid rate</span><input className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label></>}
        <label className="block"><span className="text-[11px] text-fg-muted">Amount</span><input className={inputCls + " mt-1 !w-32"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <ActionButton label="Check" color={COLOR} onRun={run} />
      </div>
      {out && <p role="status" className="text-sm text-ok">{out}</p>}
    </section>
  );
}

function Audit() {
  const [load] = useLoad<{ entries: { actor: string; action: string; target: string | null; at: string }[] }>(() => configApi("/audit?limit=15") as never);
  return (
    <section className="space-y-2"><h2 className="text-sm font-bold text-fg">Recent configuration activity</h2>
      <Status load={load}>{({ entries }) => entries.length === 0 ? <Empty>Nothing yet.</Empty> : <ul className="text-xs text-fg space-y-1">{entries.map((e, i) => <li key={i}>{when(e.at)} · <b className="text-fg">{e.actor}</b> · {e.action.replace("config.", "").replace(".", " ")}</li>)}</ul>}</Status></section>
  );
}

/** The pooled bank accounts: what the bank has credited, and the lines nobody could be credited for. Staff record a bank line here (or match a held one). */
function PoolPanel() {
  const [load, reload] = useLoad<{ channels: Record<string, { accountNumber?: string; holder?: string; bank?: string } | undefined>; virtualAccounts: { pool: string; currency: string; count: number }[]; credits: { currency: string; status: string; count: number; totalCents: number }[]; unmatched: { id: string; bankRef: string; reference: string; amountCents: number; currency: string; reason: string | null }[]; pending: { id: string; bankRef: string; reference: string; amountCents: number; currency: string; status: string; instant: boolean }[]; reserve: { currency: string; balanceCents: number; outstandingCents: number }[] }>(() => moneyApi("/pool") as never);
  const [f, setF] = useState({ bankRef: "", reference: "", amount: "", currency: "ZAR", pending: false });
  const [res, setRes] = useState({ ref: "", amount: "", currency: "ZAR" });
  const [fix, setFix] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <h2 className="text-sm font-bold text-fg">Pooled bank accounts and virtual accounts</h2>
      <Status load={load}>{(d) => (
        <>
          <p className="text-[11px] text-fg-muted">{(["in_person", "online"] as const).map((p) => `${p === "in_person" ? "In-Person" : "Online"}: ${d.channels[p]?.accountNumber ? `${d.channels[p]!.holder ?? ""} ${d.channels[p]!.accountNumber}` : "not set up"}`).join(" · ")}</p>
          <p className="text-xs text-fg">{d.virtualAccounts.length === 0 ? "No virtual accounts yet." : d.virtualAccounts.map((v) => `${v.count} ${v.currency} ${v.pool === "in_person" ? "in-person" : "online"}`).join(" · ")}</p>
          <p className="text-xs text-fg">{d.credits.length === 0 ? "No bank credits recorded." : d.credits.map((c) => `${c.count} ${c.status} ${c.currency} (${(c.totalCents / 100).toFixed(2)})`).join(" · ")}</p>
          <p className="text-xs text-fg">Instant-credit reserve: {d.reserve.map((r) => `${r.currency} ${(r.balanceCents / 100).toFixed(2)} (${(r.outstandingCents / 100).toFixed(2)} fronted, not yet cleared)`).join(" · ")}</p>
          {d.pending.length > 0 && (
            <ul className="space-y-2">{d.pending.map((u) => (
              <li key={u.id} className="rounded-lg p-3 text-xs flex flex-wrap items-center gap-3" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
                <span className="text-fg">{u.currency} {(u.amountCents / 100).toFixed(2)} · {u.bankRef} · <span className="text-fg-muted">{u.instant ? "credited early from the reserve" : "waiting for the bank to clear it"}</span></span>
                <ActionButton small label="Bank cleared it" color="#10B981" onRun={async () => { const r = await moneyApi(`/pool/credits/${u.id}/clear`, { method: "POST" }); if ("error" in r) return { error: r.error }; reload(); }} />
                <ActionButton small label="Bank returned it" color="#EF4444" onRun={async () => { const r = await moneyApi(`/pool/credits/${u.id}/bounce`, { method: "POST" }); if ("error" in r) return { error: r.error }; reload(); return r.data.status === "needs_review" ? { error: r.data.reason } : { message: "Returned" }; }} /></li>))}</ul>)}
          {d.unmatched.length > 0 && (
            <ul className="space-y-2">{d.unmatched.map((u) => (
              <li key={u.id} className="rounded-lg p-3 text-xs space-y-1" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
                <p className="text-fg">{u.currency} {(u.amountCents / 100).toFixed(2)} · bank ref {u.bankRef} · typed reference <span className="font-mono">{u.reference || "(none)"}</span></p>
                <p className="text-warn">{u.reason}</p>
                <div className="flex flex-wrap items-center gap-2"><input className={inputCls + " !w-52"} placeholder="Correct reference, e.g. VKR123456789" value={fix[u.id] ?? ""} onChange={(e) => setFix((p) => ({ ...p, [u.id]: e.target.value }))} />
                  <ActionButton small label="Match" color={COLOR} onRun={async () => { const r = await moneyApi(`/pool/credits/${u.id}/match`, { method: "POST", body: { reference: fix[u.id] ?? "" } }); if ("error" in r) return { error: r.error }; reload(); return r.data.status === "credited" ? { message: "Credited" } : { error: r.data.reason ?? "Still not matched" }; }} /></div>
              </li>))}</ul>)}
        </>)}</Status>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Bank reference</span><input className={inputCls + " mt-1 !w-40"} value={f.bankRef} onChange={set("bankRef")} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Customer reference</span><input className={inputCls + " mt-1 !w-44"} placeholder="VKR…" value={f.reference} onChange={set("reference")} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Amount</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={f.amount} onChange={set("amount")} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Currency</span><select className={inputCls + " mt-1 !w-auto"} value={f.currency} onChange={set("currency")}><option>ZAR</option><option>ZMW</option></select></label>
        <label className="flex items-center gap-2 text-xs text-fg pb-2"><input type="checkbox" checked={f.pending} onChange={(e) => setF((p) => ({ ...p, pending: e.target.checked }))} />Not cleared yet</label>
        <ActionButton label="Record bank credit" color={COLOR} onRun={async () => {
          const amountCents = Math.round(Number(f.amount) * 100);
          if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter an amount like 250.00" };
          const r = await moneyApi("/pool/credits", { method: "POST", body: { bankRef: f.bankRef.trim(), reference: f.reference, amountCents, currency: f.currency, pending: f.pending } });
          if ("error" in r) return { error: r.error }; reload();
          return r.data.status === "credited" ? { message: r.data.instant ? "Credited early from the reserve" : "Credited" } : r.data.status === "duplicate" ? { message: "Already recorded; nothing changed" } : r.data.status === "awaiting_clearing" ? { message: `Waiting for the bank to clear it: ${r.data.reason}` } : { error: `Held for matching: ${r.data.reason}` };
        }} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Fund the reserve: bank reference</span><input className={inputCls + " mt-1 !w-40"} value={res.ref} onChange={(e) => setRes((p) => ({ ...p, ref: e.target.value }))} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Amount</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={res.amount} onChange={(e) => setRes((p) => ({ ...p, amount: e.target.value }))} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Currency</span><select className={inputCls + " mt-1 !w-auto"} value={res.currency} onChange={(e) => setRes((p) => ({ ...p, currency: e.target.value }))}><option>ZAR</option><option>ZMW</option></select></label>
        <ActionButton label="Add to reserve" color="#F59E0B" onRun={async () => { const cents = Math.round(Number(res.amount) * 100); if (!Number.isFinite(cents) || cents <= 0) return { error: "Enter an amount like 5000.00" }; const r = await moneyApi("/reserve/fund", { method: "POST", body: { ref: res.ref.trim(), currency: res.currency, amountCents: cents } }); if ("error" in r) return { error: r.error }; reload(); return { message: r.data.result === "funded" ? "Added" : "Already recorded; nothing changed" }; }} />
      </div>
    </section>
  );
}

/** Exchange rates for cross-border quotes. Fetched automatically every hour while a route is open (two free sources, cross-checked); a rate set by hand is kept for 24 hours. */
function FxPanel() {
  const [load, reload] = useLoad<{ rates: { pair: string; rate: number; setAt: string; source: string; sourceAt: string | null; auto: boolean }[] }>(() => moneyApi("/fx") as never);
  const [pair, setPair] = useState("ZAR-ZMW"); const [rate, setRate] = useState("");
  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <h2 className="text-sm font-bold text-fg">Exchange rates <span className="font-normal text-fg-muted">· fetched automatically; a rate you set by hand is kept for 24 hours</span></h2>
      <Status load={load}>{({ rates }) => rates.length === 0 ? <Empty>No rates set.</Empty> : <ul className="text-xs text-fg space-y-0.5">{rates.map((r) => <li key={r.pair}>{r.pair}: {r.rate} <span className="text-fg-subtle">· {r.auto ? `automatic from ${r.source}${r.sourceAt ? `, source data ${when(r.sourceAt)}` : ""}` : "set by hand"} · stored {when(r.setAt)}{Date.now() - new Date(r.setAt).getTime() > (r.auto ? 3 : 1) * 3600_000 ? " · TOO OLD FOR QUOTES" : ""}</span></li>)}</ul>}</Status>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Pair (how many of the second for one of the first)</span><select className={inputCls + " mt-1 !w-auto"} value={pair} onChange={(e) => setPair(e.target.value)}><option>ZAR-ZMW</option><option>ZMW-ZAR</option></select></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Rate</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <ActionButton label="Refresh automatically now" color={COLOR} onRun={async () => { const r = await moneyApi("/fx/refresh", { method: "POST" }); if ("error" in r) return { error: r.error }; reload(); const bad = (r.data.results as { pair: string; status: string; reason?: string }[]).filter((x) => x.status !== "updated"); return bad.length ? { error: bad.map((x) => `${x.pair}: ${x.reason ?? x.status}`).join(" ") } : { message: "Rates updated" }; }} />
        <ActionButton label="Set rate by hand" color="#F59E0B" onRun={async () => { const n = Number(rate); if (!(n > 0)) return { error: "Enter a rate above zero" }; const [from, to] = pair.split("-"); const r = await moneyApi("/fx", { method: "PUT", body: { from, to, rate: n } }); if ("error" in r) return { error: r.error }; setRate(""); reload(); return { message: "Saved" }; }} />
      </div>
    </section>
  );
}

async function tokenApi(path: string, init?: { method?: string; body?: unknown }): Promise<Reply> {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/tokens${path}`, { method: init?.method ?? "GET", headers: { "Content-Type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
    const body = await res.json().catch(() => ({}));
    return !res.ok || body.success === false ? { error: body.error ?? `Request failed (${res.status})` } : { data: body };
  } catch { return { error: "We could not reach the server." }; }
}

/** VINK tokens: how many are in circulation, the cash-outs and refunds waiting to be paid out of the pool, and the per-trip device fee paid to investors. */
function TokensAdminPanel() {
  const [sum, reloadSum] = useLoad<{ summary: { circulationCents: number; wallets: number; byRole: Record<string, { wallets: number; cents: number }>; pendingCashouts: { count: number; cents: number }; clearingCents: number }; settings: { deviceFeeCents: number } }>(() => tokenApi("/summary") as never);
  const [list, reloadList] = useLoad<{ cashOuts: { id: string; name: string; email: string; amountCents: number; currency: string; reason: string; status: string; note: string | null; card: string | null; lastError: string | null; attempts: number; requestedAt: string }[] }>(() => tokenApi("/cash-outs?status=open") as never);
  const [review, reloadReview] = useLoad<{ cards: { id: string; accountName: string; email: string; cardholderName: string; brand: string; last4: string }[] }>(() => tokenApi("/payout-cards") as never);
  const [fee, setFee] = useState(""); const [tierUid, setTierUid] = useState(""); const [tier, setTier] = useState("standard"); const [uid, setUid] = useState(""); const [amt, setAmt] = useState(""); const [why, setWhy] = useState("");
  const both = () => { reloadSum(); reloadList(); reloadReview(); };
  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <h2 className="text-sm font-bold text-fg">VINK tokens <span className="font-normal text-fg-muted">· the closed-loop points system. Tokens leave only as a payout the system makes to the holder's own debit card, or a transfer to their own VINK bank account. Staff cannot pay a payout by hand.</span></h2>
      <Status load={sum}>{({ summary: s, settings }) => !s ? <Empty>Token figures are not available.</Empty> : (
        <>
          <p className="text-xs text-fg">In circulation: <b>{cents(s.circulationCents)}</b> across {s.wallets} wallets · waiting to be paid out: <b>{cents(s.pendingCashouts?.cents ?? 0)}</b> ({s.pendingCashouts?.count ?? 0}) · device fee per trip: <b>{cents(settings?.deviceFeeCents ?? 0)}</b></p>
          <p className="text-[11px] text-fg-muted">{Object.entries(s.byRole ?? {}).map(([r, v]) => `${r}: ${cents(v.cents)} (${v.wallets})`).join(" · ") || "No wallets yet."}</p>
        </>)}</Status>
      <Status load={list}>{({ cashOuts }) => !cashOuts || cashOuts.length === 0 ? <Empty>No payouts waiting. The system pays each one to the holder's debit card as soon as it is asked for.</Empty> : (
        <ul className="space-y-2">{cashOuts.map((c) => (
          <li key={c.id} className="rounded-lg p-3 text-xs text-fg" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
            <p><b>{c.name}</b> ({c.email}) · {c.reason === "refund" ? "Refund" : "Cash-out"} · <b>{cents(c.amountCents, c.currency)}</b> to {c.card ?? "no card"} · {c.status === "processing" ? "with the card service" : `waiting (${c.attempts} tries)`} · {when(c.requestedAt)}{c.note ? ` · ${c.note}` : ""}</p>
            {c.lastError && <p className="text-warn mt-1">Last problem: {c.lastError}</p>}
            {c.status === "requested" && (
              <div className="flex gap-2 mt-2">
                <ActionButton small label="Try now" color="#10B981" onRun={async () => { const r = await tokenApi(`/cash-outs/${c.id}/retry`, { method: "POST", body: {} }); if ("error" in r) return { error: r.error }; both(); return { message: `Result: ${r.data.status}` }; }} />
                <ActionButton small label="Refuse (tokens go back)" color="#EF4444" onRun={async () => { const r = await tokenApi(`/cash-outs/${c.id}/reject`, { method: "POST", body: {} }); if ("error" in r) return { error: r.error }; both(); }} />
              </div>)}
          </li>))}</ul>)}</Status>
      <Status load={review}>{({ cards }) => !cards || cards.length === 0 ? null : (
        <div>
          <p className="text-xs font-semibold text-fg mb-1">Debit cards to check: the name on the card is not the account holder's</p>
          <ul className="space-y-2">{cards.map((c) => (
            <li key={c.id} className="rounded-lg p-3 text-xs text-fg" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
              <p>Account <b>{c.accountName}</b> ({c.email}) · card in the name of <b>{c.cardholderName}</b> · {c.brand} ****{c.last4}</p>
              <div className="flex gap-2 mt-2">
                <ActionButton small label="Approve" color="#10B981" onRun={async () => { const r = await tokenApi(`/payout-cards/${c.id}/approve`, { method: "POST", body: {} }); if ("error" in r) return { error: r.error }; both(); }} />
                <ActionButton small label="Reject" color="#EF4444" onRun={async () => { const r = await tokenApi(`/payout-cards/${c.id}/reject`, { method: "POST", body: {} }); if ("error" in r) return { error: r.error }; both(); }} />
              </div>
            </li>))}</ul>
        </div>)}</Status>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Device fee per trip (R)</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="1.00" /></label>
        <ActionButton label="Set device fee" color={COLOR} onRun={async () => { const c = Math.round(Number(fee.replace(",", ".")) * 100); if (!Number.isInteger(c) || c < 0) return { error: "Enter an amount, 0 or more" }; const r = await tokenApi("/settings", { method: "PUT", body: { deviceFeeCents: c } }); if ("error" in r) return { error: r.error }; reloadSum(); return { message: "Saved. It applies to trips completed from now on." }; }} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Verification level: holder's user id</span><input className={inputCls + " mt-1"} value={tierUid} onChange={(e) => setTierUid(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Level</span><select className={inputCls + " mt-1 !w-auto"} value={tier} onChange={(e) => setTier(e.target.value)}><option value="basic">Basic</option><option value="standard">Standard</option><option value="full">Full</option><option value="business">Business</option></select></label>
        <ActionButton label="Set level" color={COLOR} onRun={async () => { const r = await tokenApi("/wallets/tier", { method: "PUT", body: { userId: tierUid.trim(), currency: "ZAR", tier } }); if ("error" in r) return { error: r.error }; return { message: "Level saved. The country profile's limits for that level now apply." }; }} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Refund: holder's user id</span><input className={inputCls + " mt-1"} value={uid} onChange={(e) => setUid(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Amount (R)</span><input className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Reason</span><input className={inputCls + " mt-1"} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
        <ActionButton label="Refund to their debit card" color="#F59E0B" onRun={async () => { const c = Math.round(Number(amt.replace(",", ".")) * 100); if (!Number.isInteger(c) || c <= 0) return { error: "Enter the amount" }; const r = await tokenApi("/refund", { method: "POST", body: { userId: uid.trim(), currency: "ZAR", amountCents: c, note: why } }); if ("error" in r) return { error: r.error }; both(); setAmt(""); setWhy(""); return { message: "Refund made: the system pays it to the holder's own debit card." }; }} />
      </div>
    </section>
  );
}

/** The go-live checklist for the version being shown: what is filled in, and what still blocks going live. */
function ReadinessPanel({ profileId }: { profileId: string }) {
  const [load] = useLoad<{ readiness: { mode: string; ready: boolean; blockers: number; items: { id: string; label: string; ok: boolean; blocking: boolean; hint: string }[] } }>(() => configApi(`/profiles/${profileId}/readiness`) as never, [profileId]);
  return (
    <section className="rounded-xl p-4 space-y-2" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <h2 className="text-sm font-bold text-fg">Ready to go live?</h2>
      <Status load={load}>{({ readiness: r }) => (
        <>
          <p role="status" className={`text-sm ${r.ready ? "text-ok" : "text-warn"}`}>{r.ready ? "Everything needed for live is filled in." : `${r.blockers} thing${r.blockers === 1 ? "" : "s"} still to fill in before this can go live. Sandbox works without them.`}</p>
          <ul className="text-xs space-y-1">{r.items.map((i) => (
            <li key={i.id} className={i.ok ? "text-emerald-300" : i.blocking ? "text-amber-300" : "text-white/60"}>{i.ok ? "✔" : i.blocking ? "○" : "·"} {i.label}{!i.ok && <span className="text-fg-muted"> — {i.hint}</span>}</li>))}</ul>
        </>)}</Status>
    </section>
  );
}

/** The pooled bank accounts customers pay into. They already exist at the bank; this only records their details (set later, no redeploy). */
function PooledAccountsPanel() {
  const [load, reload] = useLoad<{ accounts: { pool: string; currency: string; accountNumber: string; holder: string; bank: string; type: string }[] }>(() => moneyApi("/pooled-accounts") as never);
  const [f, setF] = useState({ pool: "in_person", currency: "ZAR", accountNumber: "", holder: "", bank: "", type: "Business" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <h2 className="text-sm font-bold text-fg">Pooled bank accounts <span className="font-normal text-fg-muted">· where customers pay in; the accounts already exist at the bank</span></h2>
      <Status load={load}>{({ accounts }) => accounts.length === 0 ? <Empty>None set here yet. Rand can also come from the PAYMENT_CHANNEL_ACCOUNTS setting.</Empty> : (
        <ul className="space-y-1.5">{accounts.map((a) => (
          <li key={a.pool + a.currency} className="flex flex-wrap items-center gap-3 text-xs text-fg"><span className="text-fg">{a.pool === "in_person" ? "In-Person" : "Online"} · {a.currency}</span><span>{a.holder} · {a.bank} · {a.type} · account {a.accountNumber}</span>
            <ActionButton small label="Remove" color="#EF4444" onRun={async () => { const r = await moneyApi(`/pooled-accounts/${a.pool}/${a.currency}`, { method: "DELETE" }); if ("error" in r) return { error: r.error }; reload(); }} /></li>))}</ul>)}</Status>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-fg-muted">Pool</span><select className={inputCls + " mt-1 !w-auto"} value={f.pool} onChange={set("pool")}><option value="in_person">In-Person</option><option value="online">Online</option></select></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Currency</span><select className={inputCls + " mt-1 !w-auto"} value={f.currency} onChange={set("currency")}><option>ZAR</option><option>ZMW</option></select></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Account number</span><input className={inputCls + " mt-1 !w-44"} inputMode="numeric" value={f.accountNumber} onChange={set("accountNumber")} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Account holder</span><input className={inputCls + " mt-1 !w-44"} value={f.holder} onChange={set("holder")} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Bank</span><input className={inputCls + " mt-1 !w-40"} value={f.bank} onChange={set("bank")} /></label>
        <label className="block"><span className="text-[11px] text-fg-muted">Type</span><select className={inputCls + " mt-1 !w-auto"} value={f.type} onChange={set("type")}><option>Business</option><option>Personal</option></select></label>
        <ActionButton label="Save account" color={COLOR} onRun={async () => { const r = await moneyApi("/pooled-accounts", { method: "PUT", body: f }); if ("error" in r) return { error: r.error }; setF((p) => ({ ...p, accountNumber: "" })); reload(); return { message: "Saved" }; }} />
      </div>
    </section>
  );
}

const csvHeaders = (text: string): string[] => {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  return first.split(delim).map((h) => h.replace(/^"|"$/g, "").trim()).filter(Boolean);
};

/** Import a bank statement (CSV) from any bank. Say which column is which, check the file, then import. Importing the same file twice changes nothing. */
function StatementImportPanel() {
  const [csv, setCsv] = useState(""); const [name, setName] = useState("");
  const [map, setMap] = useState({ bankRef: "", reference: "", amount: "", currency: "", direction: "" });
  const [cur, setCur] = useState("ZAR");
  const [report, setReport] = useState<string | null>(null);
  const headers = csvHeaders(csv);
  const body = (dryRun: boolean) => ({ csv, dryRun, defaultCurrency: cur, mapping: { bankRef: map.bankRef, reference: map.reference, amount: map.amount, currency: map.currency || undefined, direction: map.direction || undefined } });
  const pick = (k: keyof typeof map, label: string, required: boolean) => (
    <label className="block"><span className="text-[11px] text-fg-muted">{label}{required ? "" : " (optional)"}</span>
      <select className={inputCls + " mt-1 !w-auto"} value={map[k]} onChange={(e) => setMap((p) => ({ ...p, [k]: e.target.value }))}><option value="">{required ? "Choose…" : "None"}</option>{headers.map((h) => <option key={h}>{h}</option>)}</select></label>);
  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
      <h2 className="text-sm font-bold text-fg">Import a bank statement <span className="font-normal text-fg-muted">· any bank, as a CSV file; only credits are used</span></h2>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".csv,text/csv,text/plain" aria-label="Statement file" className="text-xs text-fg" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 1_000_000) { setReport("The file is too large (limit 1 MB). Split it into smaller files."); return; } setName(f.name); setReport(null); setMap({ bankRef: "", reference: "", amount: "", currency: "", direction: "" }); setCsv(await f.text()); }} />
        {name && <span className="text-xs text-fg-muted">{name}</span>}
        <label className="block"><span className="text-[11px] text-fg-muted">Currency of the file</span><select className={inputCls + " mt-1 !w-auto"} value={cur} onChange={(e) => setCur(e.target.value)}><option>ZAR</option><option>ZMW</option></select></label>
      </div>
      {headers.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          {pick("bankRef", "Bank reference column", true)}{pick("reference", "Column with the customer reference", true)}{pick("amount", "Amount column", true)}{pick("direction", "Debit/credit column", false)}{pick("currency", "Currency column", false)}
        </div>)}
      {csv && (
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton label="Check the file" color={COLOR} onRun={async () => { setReport(null); const r = await moneyApi("/pool/import", { method: "POST", body: body(true) }); if ("error" in r) return { error: r.error }; const d = r.data; setReport(`${d.credits} credit${d.credits === 1 ? "" : "s"} found, ${d.skippedDebits} debit${d.skippedDebits === 1 ? "" : "s"} skipped${d.problems.length ? `. Problems: ${d.problems.map((p: { row: number; error: string }) => `row ${p.row}: ${p.error}`).join("; ")}` : ". No problems."}`); }} />
          <ActionButton label="Import credits" color="#10B981" onRun={async () => { setReport(null); const r = await moneyApi("/pool/import", { method: "POST", body: body(false) }); if ("error" in r) return { error: r.error }; const d = r.data; setReport(`${d.credited} credited, ${d.duplicate} already recorded, ${d.unmatched + d.awaiting_clearing} held for matching${d.failedCount ? `, ${d.failedCount} rows could not be read` : ""}.`); }} />
        </div>)}
      {report && <p role="status" className="text-sm text-ok">{report}</p>}
    </section>
  );
}
