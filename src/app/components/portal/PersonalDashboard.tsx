import { lazy, Suspense, useState } from "react";
import { TokensPanel } from "./TokensPanel";
import { User, CreditCard, Landmark, LifeBuoy, Coins } from "lucide-react";
import { DashboardShell, SectionPanel } from "../dashboards/DashboardShell";
import { Pill } from "./sponsorshipUi";
import { portalClient, useLoad, Status, Empty, Field, ActionButton, inputCls, when } from "./ui";
import { ScreenBoundary } from "./widgets";
import { api as bankApi } from "../manshya/api";
import { R, when as whenCents } from "../manshya/format";
import { BRAND } from "../../brand";

// The payments and banking dashboard is the same one customers use (online payments, in-person payments, banking, receipts).
const ManshyaDashboard = lazy(() => import("../manshya/ManshyaDashboard").then((m) => ({ default: m.ManshyaDashboard })));

const COLOR = BRAND.crimson;
const call = portalClient("personal");
const NAV = [
  { icon: <Landmark className="w-4 h-4" />, label: "Accounts" },
  { icon: <CreditCard className="w-4 h-4" />, label: "Payments & banking" },
  { icon: <Coins className="w-4 h-4" />, label: "VINK Tokens" },
  { icon: <User className="w-4 h-4" />, label: "Profile" },
  { icon: <LifeBuoy className="w-4 h-4" />, label: "Support" },
];

interface Profile { phone: string | null; homeArea: string | null; favouriteRoute: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null }
interface Req { id: string; subject: string; message: string; status: string; at: string }

export function PersonalDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Accounts");
  return (
    <>
      <DashboardShell title="My Account" subtitle="Your money, profile and support" accentColor={COLOR} gradient={`from-[${COLOR}]`} navItems={NAV} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName}>
        <div className="p-4 md:p-6 space-y-4 max-w-4xl">
          <ScreenBoundary resetKey={nav}>
          {nav === "Accounts" && <AccountsScreen onOpenBanking={() => setNav("Payments & banking")} />}
          {nav === "Profile" && <ProfileScreen />}
          {nav === "VINK Tokens" && <TokensPanel segment="personal" color={COLOR} />}
          {nav === "Support" && <SupportScreen />}
          {nav === "Payments & banking" && <SectionPanel title="Payments & banking"><div className="p-4"><Empty>Opening your payments and banking dashboard…</Empty></div></SectionPanel>}
          </ScreenBoundary>
        </div>
      </DashboardShell>
      {nav === "Payments & banking" && (
        <Suspense fallback={null}><ManshyaDashboard isOpen initialMode="bank" onClose={() => setNav("Accounts")} onSignOut={onClose} /></Suspense>
      )}
    </>
  );
}

function ProfileScreen() {
  const [l, reload] = useLoad<{ user: { name: string; email: string; username: string }; profile: Profile }>(() => call("/profile"));
  return <Status load={l}>{({ user, profile }) => <ProfileForm user={user} profile={profile} onSaved={reload} />}</Status>;
}

function ProfileForm({ user, profile, onSaved }: { user: { name: string; email: string; username: string }; profile: Profile; onSaved: () => void }) {
  const [f, setF] = useState({ phone: profile.phone ?? "", home_area: profile.homeArea ?? "", favourite_route: profile.favouriteRoute ?? "", emergency_contact_name: profile.emergencyContactName ?? "", emergency_contact_phone: profile.emergencyContactPhone ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <>
      <SectionPanel title="Your details"><div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4"><Field label="Name" value={user.name} /><Field label="Email" value={user.email} /><Field label="Username" value={user.username} /></div></SectionPanel>
      <SectionPanel title="Saved details">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([["Phone number", "phone"], ["Home area", "home_area"], ["Favourite route", "favourite_route"], ["Emergency contact name", "emergency_contact_name"], ["Emergency contact phone", "emergency_contact_phone"]] as const).map(([label, k]) => (
            <label key={k} className="block"><span className="text-[11px] text-fg-muted">{label}</span><input className={inputCls + " mt-1"} value={f[k]} onChange={set(k)} /></label>))}
          <div className="sm:col-span-2"><ActionButton label="Save details" color={COLOR} onRun={async () => { const r = await call("/profile", { method: "PUT", body: f }); if (!("error" in r)) onSaved(); return "error" in r ? { error: r.error } : { message: "Saved." }; }} /></div>
        </div>
      </SectionPanel>
    </>
  );
}

function SupportScreen() {
  const [l, reload] = useLoad<{ requests: Req[] }>(() => call("/support"));
  const [f, setF] = useState({ subject: "", message: "" });
  return (
    <>
      <SectionPanel title="Contact support">
        <div className="p-4 space-y-3">
          <input className={inputCls} placeholder="Subject" maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          <textarea className={inputCls} rows={4} placeholder="How can we help?" maxLength={2000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          <ActionButton label="Send request" color={COLOR} onRun={async () => { const r = await call("/support", { method: "POST", body: f }); if (!("error" in r)) { setF({ subject: "", message: "" }); reload(); } return "error" in r ? { error: r.error } : { message: "Sent. We will get back to you." }; }} />
        </div>
      </SectionPanel>
      <Status load={l}>{({ requests }) => requests.length === 0 ? null : (
        <SectionPanel title="Your requests"><ul className="p-4 space-y-3">{requests.map((r) => (
          <li key={r.id} className="text-sm text-fg"><div className="flex items-center gap-2"><b>{r.subject}</b><Pill tone={r.status === "open" ? "warn" : "ok"}>{r.status}</Pill><span className="text-xs text-fg-subtle">{when(r.at)}</span></div><p className="text-xs text-fg-muted mt-1 whitespace-pre-wrap">{r.message}</p></li>))}</ul></SectionPanel>
      )}</Status>
    </>
  );
}

// ── accounts ────────────────────────────────────────────────────────────────
/** Your bank accounts at a glance, from the same banking data as the full payments and banking dashboard. Amounts are in cents. */
interface BankAccount { id: string; name: string; number: string; balance: number }
interface Movement { date: string; kind: string; memo: string | null; amount: number; account: string }
interface StatementLine { date: string; kind: string; memo: string | null; amount: number; balance: number }
interface BankCard { id: string; brand: string; last4: string; status: string; limit: number }
interface BankHomeData { total: number; accounts: BankAccount[]; activity: Movement[]; cards: BankCard[] }

/** The banking API throws on failure; the portal screens work with { data } or { error }. */
async function bank<T>(path: string, init?: { method?: string; body?: unknown }): Promise<{ data: T } | { error: string }> {
  try { return { data: await bankApi<T>(path, init) }; }
  catch (e) { return { error: (e as Error).message || "We could not reach your accounts. Please try again." }; }
}
/** The banking client turns an empty or unreadable answer into {}, so check what came back before the screen trusts it. */
async function loadHome(): Promise<{ data: BankHomeData } | { error: string }> {
  const r = await bank<Partial<BankHomeData>>("/dashboard/bank");
  if ("error" in r) return r;
  const d = r.data;
  if (!d || !Array.isArray(d.accounts)) return { error: "We could not read your accounts just now. Please try again." };
  return { data: { total: Number(d.total ?? 0), accounts: d.accounts, activity: Array.isArray(d.activity) ? d.activity : [], cards: Array.isArray(d.cards) ? d.cards : [] } };
}
const signed = (cents: number) => (cents > 0 ? "+ " : "") + R(cents);

function AccountsScreen({ onOpenBanking }: { onOpenBanking: () => void }) {
  const [l, reload] = useLoad<BankHomeData>(loadHome);
  return (
    <Status load={l}>{(d) => (
      <>
        <SectionPanel title="Total balance">
          <div className="p-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-3xl font-black text-fg">{R(d.total)}</p><p className="text-xs text-fg-muted">{d.accounts.length === 0 ? "No accounts yet" : `Across ${d.accounts.length} account${d.accounts.length === 1 ? "" : "s"}`}</p></div>
            <button type="button" onClick={onOpenBanking} className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: COLOR }}>Send money and more</button>
          </div>
        </SectionPanel>
        {d.accounts.length === 0 ? (
          <SectionPanel title="Your accounts"><div className="p-4"><Empty>You do not have a bank account yet. Once you open one it will appear here.</Empty></div></SectionPanel>
        ) : (
          <SectionPanel title="Your accounts"><ul className="divide-y divide-line">{d.accounts.map((a) => <AccountRow key={a.id} account={a} />)}</ul></SectionPanel>
        )}
        <SectionPanel title="Recent activity">
          {d.activity.length === 0 ? <div className="p-4"><Empty>Nothing has moved yet.</Empty></div> : (
            <ul className="divide-y divide-line" aria-label="Recent activity">{d.activity.map((m, i) => (
              <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span><span className="block font-medium text-fg">{m.memo || m.kind}</span><span className="block text-xs text-fg-muted">{whenCents(m.date)} · {m.account}</span></span>
                <b className="shrink-0" style={{ color: m.amount > 0 ? "var(--vk-ok)" : undefined }}>{signed(m.amount)}</b>
              </li>))}</ul>)}
        </SectionPanel>
        {d.cards.length > 0 && (
          <SectionPanel title="Your cards"><ul className="divide-y divide-line">{d.cards.map((c) => (
            <li key={c.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span><span className="font-medium text-fg">{c.brand} ·· {c.last4}</span> <Pill tone={c.status === "active" ? "ok" : "warn"}>{c.status}</Pill><span className="block text-xs text-fg-muted">Limit {R(c.limit)}</span></span>
              {["active", "frozen"].includes(c.status) && (
                <ActionButton small label={c.status === "active" ? "Freeze card" : "Unfreeze card"} color={c.status === "active" ? "#475467" : COLOR}
                  onRun={async () => { const r = await bank(`/bank/cards/${c.id}`, { method: "PATCH", body: { status: c.status === "active" ? "frozen" : "active" } }); if ("error" in r) return { error: r.error }; reload(); }} />)}
            </li>))}</ul></SectionPanel>)}
      </>)}</Status>
  );
}

function AccountRow({ account }: { account: BankAccount }) {
  const [shown, setShown] = useState(false);
  const [s] = useLoad<{ data: StatementLine[] }>(() => (shown ? bank<{ data: StatementLine[] }>(`/bank/accounts/${account.id}/statement?limit=25`) : Promise.resolve({ data: { data: [] } })), [shown]);
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span><span className="font-medium text-fg">{account.name}</span> <span className="text-fg-muted">·· {String(account.number).slice(-4)}</span></span>
        <span className="flex items-center gap-3"><b className="text-fg">{R(account.balance)}</b>
          <button type="button" className="text-xs font-bold underline text-fg-muted" aria-expanded={shown} onClick={() => setShown(!shown)}>{shown ? "Hide statement" : "View statement"}</button></span>
      </div>
      {shown && (
        <div className="mt-3 rounded-lg border border-line p-3" aria-label={`Statement for ${account.name}`}>
          <Status load={s}>{(st) => !Array.isArray(st.data) || st.data.length === 0 ? <Empty>No movements on this account yet.</Empty> : (
            <ul className="divide-y divide-line">{st.data.map((x, i) => (
              <li key={i} className="py-1.5 flex items-center justify-between gap-3 text-xs"><span><span className="block text-fg">{x.memo || x.kind}</span><span className="text-fg-muted">{whenCents(x.date)}</span></span>
                <span className="text-right"><b style={{ color: x.amount > 0 ? "var(--vk-ok)" : undefined }}>{signed(x.amount)}</b><span className="block text-fg-muted">{R(x.balance)}</span></span></li>))}</ul>)}</Status>
        </div>)}
    </li>
  );
}
