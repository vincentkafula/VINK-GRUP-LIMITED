import { useEffect, useMemo, useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { authFetch, getSession } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { Badge } from "../dashboards/DashboardShell";
import { useLoad, Status, Empty, ActionButton, inputCls, when } from "./ui";

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
    <div className="fixed inset-0 z-[80] overflow-y-auto" style={{ background: "#0D0B1E" }} role="dialog" aria-modal="true" aria-label="Country configuration">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between"><h1 className="text-xl font-bold text-white flex items-center gap-2"><SlidersHorizontal className="w-5 h-5" style={{ color: COLOR }} />Country configuration</h1>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 text-white/60"><X className="w-5 h-5" /></button></div>
        {!staff ? <p role="alert" className="text-sm text-red-300">This page is for administrators. Please sign in with a staff account.</p> : (
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
              <button key={c} role="tab" aria-selected={country === c} onClick={() => setCountry(c)} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: country === c ? COLOR : "#1A1738", color: country === c ? "#101010" : "#cbd5e1", border: "1px solid #2D2A50" }}>{c === "ZA" ? "South Africa" : "Zambia"}</button>))}</div>
            <Status load={overview}>{(o) => {
              const c = o.countries.find((x) => x.country === country);
              return <Country key={country + tick} country={country} active={c?.active ?? null} inProgress={c?.inProgress ?? null} approvalsRequired={o.approvalsRequired} meId={meId} onChange={refresh} />;
            }}</Status>
            <Reconciliation />
            <PoolPanel />
            <FxPanel />
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
          <Status load={load}>{(d) => <Editor key={d.profile.id + d.profile.status} d={d} hasActive={!!active} approvalsRequired={approvalsRequired} meId={meId} onChange={onChange} country={country} />}</Status>)}
        {shown && !inProgress && (
          <p className="text-sm text-white/70">This is the live version. To change anything, start a new draft: <ActionButton small label="Start a draft from this version" color={COLOR} onRun={async () => { const r = await configApi(`/${country}/drafts`, { method: "POST", body: {} }); if (!("error" in r)) onChange(); return fail(r); }} /></p>)}
        <Simulator country={country} />
      </div>
      <aside className="space-y-2"><h2 className="text-sm font-bold text-white">Versions</h2>
        <Status load={versions}>{({ versions: v }) => <ul className="space-y-1.5">{v.map((x) => (
          <li key={x.id} className="rounded-lg px-3 py-2 text-xs flex items-center justify-between" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
            <span className="text-white">v{x.version}{x.note ? <span className="text-white/50"> · {x.note}</span> : null}</span><Badge text={x.status.replace("_", " ")} color={STATUS_COLOR[x.status]} /></li>))}</ul>}</Status></aside>
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
    <section className="rounded-xl p-4 space-y-4" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-white font-bold">Version {p.version}</h2><Badge text={p.status.replace("_", " ")} color={STATUS_COLOR[p.status]} /><Badge text={live ? "LIVE MODE" : "sandbox"} color={live ? "#EF4444" : "#94A3B8"} />
        <span className="text-xs text-white/50">Marshal fee {cents(p.config.marshalFee?.amountCents ?? 0, money)} · {p.config.trip?.tapsPerTrip} taps per trip · no PIN below {cents(p.config.afc?.noPinBelowCents ?? 0, money)}</span></div>

      {editable ? <p className="text-xs text-white/60">Amounts are whole minor units (cents). Edit the JSON below; it is checked as you type.</p> : <p className="text-xs text-white/60">{p.status === "draft" ? "Only the person who created this draft can edit it." : "This version is frozen: what is approved is exactly what gets activated."}</p>}
      <textarea aria-label="Configuration JSON" spellCheck={false} readOnly={!editable} value={text} onChange={(e) => setText(e.target.value)} rows={18} className={inputCls + " font-mono text-xs leading-5"} />
      {problems.length > 0 ? <ul role="alert" className="text-xs text-red-300 list-disc pl-5 space-y-0.5">{problems.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul> : parsed.ok && <p className="text-xs text-emerald-300" role="status">The configuration is valid.</p>}

      {p.status !== "active" && hasActive && (
        <div><h3 className="text-sm font-bold text-white mb-1">What changes compared with the live version</h3>
          {d.changesFromActive.length === 0 ? <Empty>No differences.</Empty> : (
            <table className="w-full text-xs"><thead className="text-white/40 text-left"><tr><th className="py-1">Setting</th><th>Now</th><th>Proposed</th></tr></thead>
              <tbody>{d.changesFromActive.map((c) => <tr key={c.path} className="border-t border-[#2D2A50] text-white/80 align-top"><td className="py-1 pr-2 font-mono">{c.path}</td><td className="pr-2 break-all">{JSON.stringify(c.before) ?? "–"}</td><td className="break-all">{JSON.stringify(c.after) ?? "–"}</td></tr>)}</tbody></table>)}
        </div>)}

      {d.approvals.length > 0 && <ul className="text-xs text-white/70 space-y-0.5">{d.approvals.map((a, i) => <li key={i}>{a.decision === "approve" ? "✔" : "✖"} {a.approver}{a.note ? ` — ${a.note}` : ""} <span className="text-white/40">· {when(a.at)}</span></li>)}</ul>}

      <div className="flex flex-wrap items-center gap-3">
        {editable && <>
          <ActionButton label="Save draft" color={COLOR} onRun={async () => { if (!parsed.ok) return { error: "Fix the JSON first" }; const r = await configApi(`/profiles/${p.id}`, { method: "PUT", body: { config: parsed.value } }); if (!("error" in r)) onChange(); return "error" in r ? fail(r) : { message: "Saved" }; }} />
          <ActionButton label="Submit for approval" color="#F59E0B" onRun={async () => { if (dirty) return { error: "Save the draft first" }; const r = await configApi(`/profiles/${p.id}/submit`, { method: "POST" }); if (!("error" in r)) onChange(); return fail(r); }} />
        </>}
        {p.status === "pending_approval" && (p.createdBy === meId
          ? <p className="text-xs text-amber-300">Waiting for {approvalsRequired} approval{approvalsRequired === 1 ? "" : "s"} from other administrators. You created this change, so you cannot approve it.</p>
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
    <section className="rounded-xl p-4 space-y-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <h2 className="text-sm font-bold text-white">Fee simulator <span className="font-normal text-white/50">· uses the live version of this country</span></h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-white/60">Transaction</span><select className={inputCls + " mt-1 !w-auto"} value={txn} onChange={(e) => setTxn(e.target.value)}>{["afc_tap", "card_pos", "card_online", "atm", "transfer_out", "payout", "deposit"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="block"><span className="text-[11px] text-white/60">Amount</span><input className={inputCls + " mt-1 !w-32"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block"><span className="text-[11px] text-white/60">Payer type</span><select className={inputCls + " mt-1 !w-auto"} value={payerType} onChange={(e) => setPayerType(e.target.value)}><option value="">any</option>{["driver", "marshal", "association", "vehicle_owner", "investor", "personal"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="block"><span className="text-[11px] text-white/60">KYC tier</span><select className={inputCls + " mt-1 !w-auto"} value={tier} onChange={(e) => setTier(e.target.value)}><option value="">any</option>{["basic", "standard", "full", "business"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <ActionButton label="Calculate" color={COLOR} onRun={run} />
      </div>
      {out && <p role="status" className="text-sm text-emerald-300">{out.text}</p>}
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
    <section className="rounded-xl p-4 space-y-2" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-white">Reconciliation</h2><ActionButton small label="Check again" color={COLOR} onRun={async () => { reload(); }} /></div>
      <Status load={load}>{(r) => (
        <>
          <p role="status" className={`text-sm ${r.ok ? "text-emerald-300" : "text-red-300"}`}>{r.ok ? "Records and ledger agree." : "Something does not agree and needs an engineer."} <span className="text-white/40">Checked {when(r.checkedAt)}</span></p>
          {r.issues.length > 0 && <ul className="text-xs space-y-1">{r.issues.map((i) => <li key={i.code + i.message} className={i.severity === "problem" ? "text-red-300" : "text-amber-300"}>{i.count} · {i.message}</li>)}</ul>}
          <p className="text-[11px] text-white/50">{r.figures.settledTaps} taps settled · {r.figures.unsettledConfirmedTaps} waiting · {r.figures.trips} trips · {r.figures.paidItems} payments made · {(r.figures.waitingCents / 100).toFixed(2)} waiting for funds · {(r.figures.arrearsCents / 100).toFixed(2)} in arrears</p>
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
    <section className="rounded-xl p-4 space-y-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <h2 className="text-sm font-bold text-white">Limits tester <span className="font-normal text-white/50">· uses the live version of this country</span></h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-white/60">Rule</span><select className={inputCls + " mt-1 !w-auto"} value={kind} onChange={(e) => setKind(e.target.value)}><option value="limit">KYC limit</option><option value="instant_credit">Instant credit</option><option value="corridor">Cross-border quote</option></select></label>
        <label className="block"><span className="text-[11px] text-white/60">Account level</span><select className={inputCls + " mt-1 !w-auto"} value={tier} onChange={(e) => setTier(e.target.value)}>{["basic", "standard", "full", "business"].map((t) => <option key={t}>{t}</option>)}</select></label>
        {kind === "limit" && <label className="block"><span className="text-[11px] text-white/60">Channel</span><select className={inputCls + " mt-1 !w-auto"} value={channel} onChange={(e) => setChannel(e.target.value)}>{["transfer_in", "transfer_out", "atm", "pos", "online"].map((t) => <option key={t}>{t}</option>)}</select></label>}
        {kind === "corridor" && <><label className="block"><span className="text-[11px] text-white/60">Route</span><input className={inputCls + " mt-1 !w-28"} value={corridorId} onChange={(e) => setCorridor(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-white/60">Mid rate</span><input className={inputCls + " mt-1 !w-24"} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label></>}
        <label className="block"><span className="text-[11px] text-white/60">Amount</span><input className={inputCls + " mt-1 !w-32"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <ActionButton label="Check" color={COLOR} onRun={run} />
      </div>
      {out && <p role="status" className="text-sm text-emerald-300">{out}</p>}
    </section>
  );
}

function Audit() {
  const [load] = useLoad<{ entries: { actor: string; action: string; target: string | null; at: string }[] }>(() => configApi("/audit?limit=15") as never);
  return (
    <section className="space-y-2"><h2 className="text-sm font-bold text-white">Recent configuration activity</h2>
      <Status load={load}>{({ entries }) => entries.length === 0 ? <Empty>Nothing yet.</Empty> : <ul className="text-xs text-white/70 space-y-1">{entries.map((e, i) => <li key={i}>{when(e.at)} · <b className="text-white">{e.actor}</b> · {e.action.replace("config.", "").replace(".", " ")}</li>)}</ul>}</Status></section>
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
    <section className="rounded-xl p-4 space-y-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <h2 className="text-sm font-bold text-white">Pooled bank accounts and virtual accounts</h2>
      <Status load={load}>{(d) => (
        <>
          <p className="text-[11px] text-white/50">{(["in_person", "online"] as const).map((p) => `${p === "in_person" ? "In-Person" : "Online"}: ${d.channels[p]?.accountNumber ? `${d.channels[p]!.holder ?? ""} ${d.channels[p]!.accountNumber}` : "not set up"}`).join(" · ")}</p>
          <p className="text-xs text-white/70">{d.virtualAccounts.length === 0 ? "No virtual accounts yet." : d.virtualAccounts.map((v) => `${v.count} ${v.currency} ${v.pool === "in_person" ? "in-person" : "online"}`).join(" · ")}</p>
          <p className="text-xs text-white/70">{d.credits.length === 0 ? "No bank credits recorded." : d.credits.map((c) => `${c.count} ${c.status} ${c.currency} (${(c.totalCents / 100).toFixed(2)})`).join(" · ")}</p>
          <p className="text-xs text-white/70">Instant-credit reserve: {d.reserve.map((r) => `${r.currency} ${(r.balanceCents / 100).toFixed(2)} (${(r.outstandingCents / 100).toFixed(2)} fronted, not yet cleared)`).join(" · ")}</p>
          {d.pending.length > 0 && (
            <ul className="space-y-2">{d.pending.map((u) => (
              <li key={u.id} className="rounded-lg p-3 text-xs flex flex-wrap items-center gap-3" style={{ background: "#0D0B1E", border: "1px solid #2D2A50" }}>
                <span className="text-white">{u.currency} {(u.amountCents / 100).toFixed(2)} · {u.bankRef} · <span className="text-white/60">{u.instant ? "credited early from the reserve" : "waiting for the bank to clear it"}</span></span>
                <ActionButton small label="Bank cleared it" color="#10B981" onRun={async () => { const r = await moneyApi(`/pool/credits/${u.id}/clear`, { method: "POST" }); if ("error" in r) return { error: r.error }; reload(); }} />
                <ActionButton small label="Bank returned it" color="#EF4444" onRun={async () => { const r = await moneyApi(`/pool/credits/${u.id}/bounce`, { method: "POST" }); if ("error" in r) return { error: r.error }; reload(); return r.data.status === "needs_review" ? { error: r.data.reason } : { message: "Returned" }; }} /></li>))}</ul>)}
          {d.unmatched.length > 0 && (
            <ul className="space-y-2">{d.unmatched.map((u) => (
              <li key={u.id} className="rounded-lg p-3 text-xs space-y-1" style={{ background: "#0D0B1E", border: "1px solid #2D2A50" }}>
                <p className="text-white">{u.currency} {(u.amountCents / 100).toFixed(2)} · bank ref {u.bankRef} · typed reference <span className="font-mono">{u.reference || "(none)"}</span></p>
                <p className="text-amber-300">{u.reason}</p>
                <div className="flex flex-wrap items-center gap-2"><input className={inputCls + " !w-52"} placeholder="Correct reference, e.g. VKR123456789" value={fix[u.id] ?? ""} onChange={(e) => setFix((p) => ({ ...p, [u.id]: e.target.value }))} />
                  <ActionButton small label="Match" color={COLOR} onRun={async () => { const r = await moneyApi(`/pool/credits/${u.id}/match`, { method: "POST", body: { reference: fix[u.id] ?? "" } }); if ("error" in r) return { error: r.error }; reload(); return r.data.status === "credited" ? { message: "Credited" } : { error: r.data.reason ?? "Still not matched" }; }} /></div>
              </li>))}</ul>)}
        </>)}</Status>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-white/60">Bank reference</span><input className={inputCls + " mt-1 !w-40"} value={f.bankRef} onChange={set("bankRef")} /></label>
        <label className="block"><span className="text-[11px] text-white/60">Customer reference</span><input className={inputCls + " mt-1 !w-44"} placeholder="VKR…" value={f.reference} onChange={set("reference")} /></label>
        <label className="block"><span className="text-[11px] text-white/60">Amount</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={f.amount} onChange={set("amount")} /></label>
        <label className="block"><span className="text-[11px] text-white/60">Currency</span><select className={inputCls + " mt-1 !w-auto"} value={f.currency} onChange={set("currency")}><option>ZAR</option><option>ZMW</option></select></label>
        <label className="flex items-center gap-2 text-xs text-white/70 pb-2"><input type="checkbox" checked={f.pending} onChange={(e) => setF((p) => ({ ...p, pending: e.target.checked }))} />Not cleared yet</label>
        <ActionButton label="Record bank credit" color={COLOR} onRun={async () => {
          const amountCents = Math.round(Number(f.amount) * 100);
          if (!Number.isFinite(amountCents) || amountCents <= 0) return { error: "Enter an amount like 250.00" };
          const r = await moneyApi("/pool/credits", { method: "POST", body: { bankRef: f.bankRef.trim(), reference: f.reference, amountCents, currency: f.currency, pending: f.pending } });
          if ("error" in r) return { error: r.error }; reload();
          return r.data.status === "credited" ? { message: r.data.instant ? "Credited early from the reserve" : "Credited" } : r.data.status === "duplicate" ? { message: "Already recorded; nothing changed" } : r.data.status === "awaiting_clearing" ? { message: `Waiting for the bank to clear it: ${r.data.reason}` } : { error: `Held for matching: ${r.data.reason}` };
        }} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-white/60">Fund the reserve: bank reference</span><input className={inputCls + " mt-1 !w-40"} value={res.ref} onChange={(e) => setRes((p) => ({ ...p, ref: e.target.value }))} /></label>
        <label className="block"><span className="text-[11px] text-white/60">Amount</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={res.amount} onChange={(e) => setRes((p) => ({ ...p, amount: e.target.value }))} /></label>
        <label className="block"><span className="text-[11px] text-white/60">Currency</span><select className={inputCls + " mt-1 !w-auto"} value={res.currency} onChange={(e) => setRes((p) => ({ ...p, currency: e.target.value }))}><option>ZAR</option><option>ZMW</option></select></label>
        <ActionButton label="Add to reserve" color="#F59E0B" onRun={async () => { const cents = Math.round(Number(res.amount) * 100); if (!Number.isFinite(cents) || cents <= 0) return { error: "Enter an amount like 5000.00" }; const r = await moneyApi("/reserve/fund", { method: "POST", body: { ref: res.ref.trim(), currency: res.currency, amountCents: cents } }); if ("error" in r) return { error: r.error }; reload(); return { message: r.data.result === "funded" ? "Added" : "Already recorded; nothing changed" }; }} />
      </div>
    </section>
  );
}

/** Exchange rates for cross-border quotes. There is no rate feed: staff set them, and a rate older than an hour is not used for quotes. */
function FxPanel() {
  const [load, reload] = useLoad<{ rates: { pair: string; rate: number; setAt: string }[] }>(() => moneyApi("/fx") as never);
  const [pair, setPair] = useState("ZAR-ZMW"); const [rate, setRate] = useState("");
  return (
    <section className="rounded-xl p-4 space-y-3" style={{ background: "#1A1738", border: "1px solid #2D2A50" }}>
      <h2 className="text-sm font-bold text-white">Exchange rates <span className="font-normal text-white/50">· cross-border quotes use these; set them at least hourly</span></h2>
      <Status load={load}>{({ rates }) => rates.length === 0 ? <Empty>No rates set.</Empty> : <ul className="text-xs text-white/70 space-y-0.5">{rates.map((r) => <li key={r.pair}>{r.pair}: {r.rate} <span className="text-white/40">· set {when(r.setAt)}{Date.now() - new Date(r.setAt).getTime() > 3600_000 ? " · STALE" : ""}</span></li>)}</ul>}</Status>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11px] text-white/60">Pair (how many of the second for one of the first)</span><select className={inputCls + " mt-1 !w-auto"} value={pair} onChange={(e) => setPair(e.target.value)}><option>ZAR-ZMW</option><option>ZMW-ZAR</option></select></label>
        <label className="block"><span className="text-[11px] text-white/60">Rate</span><input className={inputCls + " mt-1 !w-28"} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <ActionButton label="Set rate" color={COLOR} onRun={async () => { const n = Number(rate); if (!(n > 0)) return { error: "Enter a rate above zero" }; const [from, to] = pair.split("-"); const r = await moneyApi("/fx", { method: "PUT", body: { from, to, rate: n } }); if ("error" in r) return { error: r.error }; setRate(""); reload(); return { message: "Saved" }; }} />
      </div>
    </section>
  );
}
