import { useEffect, useRef, useState } from "react";
import { Landmark, Copy, Check, ShieldCheck, Clock, TriangleAlert, Plus, X } from "lucide-react";
import { SectionPanel, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, Field, inputCls, rand, when } from "./ui";
import { businessProblem, type BankRole, type HolderType } from "./bankRules";
import { BRAND } from "../../brand";

/* ───────────── what the server returns ───────────── */
export interface BankLink {
  id: string; status: "verified" | "pending_review" | "rejected"; reviewNote: string | null; updatedAt: string | null;
  holderName: string; accountType: "Personal" | "Business"; holderType: HolderType; businessName: string | null; registrationNumber: string | null;
  bankName: string; branchCode: string; currency: string;
  accountMissing: boolean; accountNumber: string | null; accountName: string | null; accountKind: string | null; accountId: string; balance: number | null;
}
export interface ChannelCard { channel: "online" | "in_person"; label: string; configured: boolean; accountNumber?: string; holder?: string; bank?: string; type?: string }
export interface BankInfo { role: BankRole; rules: { allowed: HolderType[]; message: string }; channels: ChannelCard[]; link: BankLink | null; accounts: { id: string; name: string; kind: string; number: string }[] }
interface Tx { at: string; type: string; description: string; amount: number; balance: number }

const CHANGED = "vink:bank-changed";
const announceChange = () => window.dispatchEvent(new Event(CHANGED));
const STATUS: Record<BankLink["status"], { text: string; color: string; icon: typeof Check }> = {
  verified: { text: "Verified", color: BRAND.ok, icon: ShieldCheck },
  pending_review: { text: "Pending review", color: BRAND.warn, icon: Clock },
  rejected: { text: "Rejected", color: BRAND.bad, icon: TriangleAlert },
};

/** Loads this dashboard's bank info, and reloads whenever any bank component announces a change. */
function useBank(segment: string) {
  const call = portalClient(segment);
  const [load, reload] = useLoad<BankInfo>(() => call("/bank"));
  useEffect(() => { window.addEventListener(CHANGED, reload); return () => window.removeEventListener(CHANGED, reload); }, [reload]);
  return { call, load };
}

/* ───────────── copy to clipboard ───────────── */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the older method */ }
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}
export function CopyButton({ value, label, color }: { value: string; label: string; color: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async () => { setState((await copyText(value)) ? "done" : "failed"); clearTimeout(timer.current); timer.current = setTimeout(() => setState("idle"), 2000); };
  return (
    <button type="button" onClick={run} aria-label={`Copy ${label}`} className="inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] px-3 rounded-lg text-xs font-bold"
      style={{ background: state === "failed" ? "#7f1d1d" : color, color: state === "failed" ? "#fff" : "#101010" }}>
      {state === "done" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      <span aria-live="polite">{state === "done" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
    </button>
  );
}

export const spaced = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ").trim();     // 1234567890 -> 1234 5678 90

function StatusBadge({ s }: { s: BankLink["status"] }) { const x = STATUS[s]; return <Badge text={x.text} color={x.color} />; }

/* ───────────── the compact strip shown at the top of every dashboard ───────────── */
export function BankStrip({ segment, color, onOpen }: { segment: string; color: string; onOpen: () => void }) {
  const { call, load } = useBank(segment);
  const [dialog, setDialog] = useState(false);
  return (
    <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }} aria-label="Bank account">
      <Status load={load}>{(b) => !b.link ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Landmark className="w-5 h-5 text-fg-muted" /><div><p className="text-sm font-semibold text-fg">No bank account linked yet</p><p className="text-xs text-fg-muted">{b.rules.message}</p></div></div>
          <button type="button" onClick={() => setDialog(true)} className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-lg text-sm font-bold" style={{ background: color, color: "#101010" }}><Plus className="w-4 h-4" />Link account</button>
        </div>
      ) : b.link.accountMissing ? (
        <p className="text-sm text-amber-200">Your linked account could not be found in the Banking module. Open Bank account to fix it.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-fg-subtle">Account number</p>
            <div className="flex items-center gap-3">
              <p className="font-mono text-xl sm:text-2xl font-bold tracking-wider text-fg" data-testid="account-number">{spaced(b.link.accountNumber!)}</p>
              <CopyButton value={b.link.accountNumber!} label="account number" color={color} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 gap-y-2 text-sm text-fg min-w-0">
            <div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-fg-subtle">Account holder</p><p className="truncate">{b.link.holderName}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-fg-subtle">Bank</p><p>{b.link.bankName}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-fg-subtle">Type</p><p className="flex items-center gap-2">{b.link.accountType}<StatusBadge s={b.link.status} /></p></div>
          </div>
          <button type="button" onClick={onOpen} className="ml-auto text-xs underline text-fg-muted min-h-[40px]">Details</button>
        </div>
      )}</Status>
      {dialog && load.state === "ready" && <LinkDialog info={load.data} call={call} color={color} onClose={() => setDialog(false)} />}
    </div>
  );
}

/* ───────────── link / edit dialog ───────────── */
export function LinkDialog({ info, call, color, onClose }: { info: BankInfo; call: ReturnType<typeof portalClient>; color: string; onClose: () => void }) {
  const editing = !!info.link;
  const allowed = info.rules.allowed;
  const [type, setType] = useState<HolderType>(info.link?.holderType ?? allowed[0]);
  const [name, setName] = useState(info.link?.businessName ?? "");
  const [reg, setReg] = useState(info.link?.registrationNumber ?? "");
  const [accountId, setAccountId] = useState(info.accounts.find((a) => a.kind === "current")?.id ?? info.accounts[0]?.id ?? "");
  const [touched, setTouched] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onClose]);

  const problems = type === "business" ? businessProblem(name, reg) : {};
  const submit = async () => {
    setTouched(true);
    if (problems.name || problems.reg) return { error: problems.name ?? problems.reg };
    const body = { holderType: type, businessName: type === "business" ? name : undefined, registrationNumber: type === "business" ? reg : undefined, accountId: !editing && accountId ? accountId : undefined };
    const r = await call<{ message?: string }>("/bank/link", { method: editing ? "PUT" : "POST", body });
    if ("error" in r) return { error: r.error };                       // the server's message, for example "Associations must use a Business account."
    announceChange(); onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(5,4,15,0.8)" }} role="dialog" aria-modal="true" aria-label={editing ? "Edit bank account details" : "Link a bank account"}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-6" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-fg">{editing ? "Edit account details" : "Link your bank account"}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 -mr-2 text-fg-muted"><X className="w-5 h-5" /></button></div>
        <p className="text-xs text-fg-muted mb-4">Your account is held in our Banking module. {info.rules.message}</p>

        <fieldset className="mb-4"><legend className="text-[11px] text-fg-muted mb-2">Account type</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["personal", "business"] as const).map((t) => {
              const ok = allowed.includes(t);
              return (
                <label key={t} className={`rounded-lg px-3 py-3 text-sm border ${type === t ? "border-white" : "border-line"} ${ok ? "cursor-pointer text-fg" : "opacity-40 cursor-not-allowed text-fg"}`}>
                  <input ref={t === allowed[0] ? first : undefined} type="radio" name="holderType" className="mr-2" checked={type === t} disabled={!ok} onChange={() => setType(t)} />{t === "personal" ? "Personal" : "Business"}
                </label>);
            })}
          </div>
          {allowed.length === 1 && <p className="mt-2 text-xs text-amber-200/90" role="note">{info.rules.message}</p>}
        </fieldset>

        {type === "business" && (
          <div className="space-y-3 mb-4">
            <label className="block"><span className="text-[11px] text-fg-muted">Registered business name</span>
              <input className={inputCls + " mt-1"} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="organization" aria-invalid={touched && !!problems.name} />
              {touched && problems.name && <span role="alert" className="text-xs text-bad">{problems.name}</span>}</label>
            <label className="block"><span className="text-[11px] text-fg-muted">Registration number</span>
              <input className={inputCls + " mt-1 font-mono"} value={reg} placeholder="2015/123456/07" inputMode="text" onChange={(e) => setReg(e.target.value)} aria-invalid={touched && !!problems.reg} />
              {touched && problems.reg && <span role="alert" className="text-xs text-bad">{problems.reg}</span>}</label>
            <p className="text-[11px] text-fg-subtle">An administrator checks Business details before the account shows as verified.</p>
          </div>
        )}

        {!editing && info.accounts.length > 1 && (
          <label className="block mb-4"><span className="text-[11px] text-fg-muted">Which of your accounts?</span>
            <select className={inputCls + " mt-1"} value={accountId} onChange={(e) => setAccountId(e.target.value)}>{info.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.number}</option>)}</select></label>
        )}
        {!editing && info.accounts.length === 0 && <p className="text-xs text-fg-muted mb-4">You don't have an account in the Banking module yet. Linking opens your first one.</p>}

        <div className="flex flex-wrap items-center gap-3"><ActionButton label={editing ? "Save changes" : "Link account"} busyLabel="Saving…" color={color} onRun={submit} />
          <button type="button" onClick={onClose} className="text-sm text-fg-muted underline min-h-[40px]">Cancel</button></div>
      </div>
    </div>
  );
}

/* ───────────── payment channels ───────────── */
export function ChannelCards({ channels, color }: { channels: ChannelCard[]; color: string }) {
  if (channels.length === 0) return null;
  return (
    <SectionPanel title="Payment channel accounts">
      <div className="p-4 grid gap-3 sm:grid-cols-2">
        {channels.map((c) => (
          <div key={c.channel} className="rounded-lg p-3" style={{ background: "var(--vk-bg)", border: "1px solid var(--vk-line)" }}>
            <p className="text-sm font-semibold text-fg">{c.label}</p>
            {c.configured ? (
              <>
                <div className="mt-1 flex items-center gap-3 flex-wrap"><p className="font-mono text-lg font-bold tracking-wider text-fg">{spaced(c.accountNumber!)}</p><CopyButton value={c.accountNumber!} label={`${c.label} account number`} color={color} /></div>
                <p className="text-xs text-fg-muted mt-1">{c.holder} · {c.bank} · {c.type} account</p>
              </>
            ) : <p className="text-xs text-fg-muted mt-1">The account number for this channel has not been set up for display yet. Ask an administrator.</p>}
          </div>))}
      </div>
    </SectionPanel>
  );
}

/* ───────────── the full "Bank account" screen ───────────── */
export function BankScreen({ segment, color }: { segment: string; color: string }) {
  const { call, load } = useBank(segment);
  const [dialog, setDialog] = useState(false);
  return (
    <>
      <Status load={load}>{(b) => (
        <>
          {!b.link ? (
            <SectionPanel title="Bank account">
              <div className="p-6 text-center space-y-3">
                <Landmark className="w-10 h-10 mx-auto text-fg-subtle" />
                <p className="text-fg font-semibold">No bank account linked yet</p>
                <p className="text-sm text-fg-muted max-w-md mx-auto">Link an account from our Banking module so your balance, account details and transactions show here. {b.rules.message}</p>
                <button type="button" onClick={() => setDialog(true)} className="inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-lg text-sm font-bold" style={{ background: color, color: "#101010" }}><Plus className="w-4 h-4" />Link account</button>
              </div>
            </SectionPanel>
          ) : <LinkedAccount link={b.link} call={call} color={color} onEdit={() => setDialog(true)} />}
          <ChannelCards channels={b.channels} color={color} />
          {dialog && <LinkDialog info={b} call={call} color={color} onClose={() => setDialog(false)} />}
        </>
      )}</Status>
    </>
  );
}

function LinkedAccount({ link, call, color, onEdit }: { link: BankLink; call: ReturnType<typeof portalClient>; color: string; onEdit: () => void }) {
  const [tx] = useLoad<{ transactions: Tx[] }>(() => call("/bank/transactions"));
  const s = STATUS[link.status];
  return (
    <>
      <SectionPanel title="Bank account">
        <div className="p-4 sm:p-5 space-y-5">
          {link.status !== "verified" && (
            <p role="status" className="flex items-start gap-2 text-sm rounded-lg p-3" style={{ background: link.status === "rejected" ? "#2a1220" : "#2a2412", color: link.status === "rejected" ? "#fecaca" : "#fde68a" }}>
              <s.icon className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{link.status === "pending_review" ? "An administrator is checking your business details. Your account number works as normal while you wait." : `Your business details were rejected${link.reviewNote ? `: ${link.reviewNote}` : "."} Edit them and save to send them for review again.`}</span>
            </p>
          )}
          {link.accountMissing ? <p className="text-sm text-amber-200">This account could not be found in the Banking module. Remove the link and link it again.</p> : (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-fg-subtle">Account number</p>
              <div className="flex flex-wrap items-center gap-3"><p className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-fg" data-testid="account-number-large">{spaced(link.accountNumber!)}</p><CopyButton value={link.accountNumber!} label="account number" color={color} /></div>
            </div>)}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Account holder" value={link.holderName} /><Field label="Bank" value={link.bankName} />
            <Field label="Account type" value={<span className="flex items-center gap-2">{link.accountType}<Badge text={s.text} color={s.color} /></span>} />
            <Field label="Account name" value={link.accountName} /><Field label="Product" value={link.accountKind ? link.accountKind[0].toUpperCase() + link.accountKind.slice(1) : null} /><Field label="Branch code" value={link.branchCode} />
            {link.holderType === "business" && <Field label="Registration number" value={<span className="font-mono">{link.registrationNumber}</span>} />}
            <Field label="Balance" value={link.balance === null ? null : <b className="text-lg">{rand(link.balance)}</b>} />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onEdit} className="min-h-[40px] px-4 rounded-lg text-sm font-bold border border-line text-fg">Edit details</button>
            <ActionButton label="Remove link" busyLabel="Removing…" color="#6B7280" onRun={async () => { if (!window.confirm("Remove the link to this bank account? The account itself is not closed.")) return; const r = await call("/bank/link", { method: "DELETE" }); if ("error" in r) return { error: r.error }; announceChange(); }} />
          </div>
        </div>
      </SectionPanel>
      <Status load={tx}>{({ transactions }) => transactions.length === 0 ? (
        <SectionPanel title="Recent transactions"><div className="p-4"><Empty>No transactions yet. They appear here as soon as money moves on this account.</Empty></div></SectionPanel>
      ) : (
        <TableCard title="Recent transactions" color={color} columns={["When", "Description", "Amount", "Balance"]}
          rows={transactions.map((t) => [when(t.at), t.description, <span key="a" style={{ color: t.amount < 0 ? "#fca5a5" : "#86efac" }}>{rand(t.amount)}</span>, rand(t.balance)])} />
      )}</Status>
    </>
  );
}

