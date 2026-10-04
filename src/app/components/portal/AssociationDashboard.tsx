import { useState } from "react";
import { Home, Users, CheckCircle2, MapPin, Route as RouteIcon, Coins, Car, Map as MapIcon, Landmark, FileText, UserCog, UserCheck, Building2 } from "lucide-react";
import { BankStrip, BankScreen } from "./BankAccount";
import { DashboardShell, SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, outcome, inputCls, rand, day, when } from "./ui";
import { MembersList, VehiclesList, RoutesManager, AssociationMap, DeparturesTrend, FinesLedger, AssociationStatements } from "./AssociationExtras";
import { ScreenBoundary } from "./widgets";

const COLOR = "#EF4444";
const call = portalClient("association");
const ROLE: Record<string, string> = { vehicle_owner: "Vehicle owner", driver: "Driver", marshal: "Marshal" };

interface Member { id: string; userId: string; name: string; email: string; role: string; status: string }
interface Per { departures: number; passengers: number }
interface Report { members: { owners: number; drivers: number; marshals: number; vehicles: number }; pendingRequests: number; ranks: { rank: string; today: Per; week: Per; month: Per }[]; levies: { outstanding: number; paid: number; open: number } }
interface Rank { id: string; name: string; location: string | null; active: boolean; waiting: number; marshals: { id: string; name: string }[] }
interface Levy { id: string; title: string; amount: number; dueDate: string | null; paidAt: string | null; member: string }

export function AssociationDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  const [reqs, reloadReqs] = useLoad<{ requests: { id: string; name: string; email: string; role: string; at: string }[] }>(() => call("/requests"));
  const pending = reqs.state === "ready" ? reqs.data.requests.length : 0;
  const items = [
    { icon: <Home className="w-4 h-4" />, label: "Overview" },
    { icon: <Users className="w-4 h-4" />, label: "Owners" }, { icon: <UserCog className="w-4 h-4" />, label: "Drivers" }, { icon: <UserCheck className="w-4 h-4" />, label: "Marshals" },
    { icon: <Car className="w-4 h-4" />, label: "Vehicles" },
    { icon: <CheckCircle2 className="w-4 h-4" />, label: "Approvals", badge: pending || undefined }, { icon: <MapPin className="w-4 h-4" />, label: "Ranks" },
    { icon: <RouteIcon className="w-4 h-4" />, label: "Routes" }, { icon: <MapIcon className="w-4 h-4" />, label: "Map" },
    { icon: <Coins className="w-4 h-4" />, label: "Levies" }, { icon: <Landmark className="w-4 h-4" />, label: "Fines ledger" }, { icon: <FileText className="w-4 h-4" />, label: "Statements" },
    { icon: <Building2 className="w-4 h-4" />, label: "Bank account" },
  ];
  return (
    <DashboardShell title="Association" subtitle="Members, ranks, routes and levies" accentColor={COLOR} gradient={`from-[${COLOR}]`} navItems={items} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName} alertCount={pending || undefined}>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <BankStrip segment="association" color={COLOR} onOpen={() => setNav("Bank account")} />
        <ScreenBoundary resetKey={nav}>
          {nav === "Overview" && <><Overview /><DeparturesTrend /></>}
          {nav === "Owners" && <><MembersList role="vehicle_owner" onChanged={reloadReqs} /><Invite onChanged={reloadReqs} /></>}
          {nav === "Drivers" && <><MembersList role="driver" onChanged={reloadReqs} /><Invite onChanged={reloadReqs} /></>}
          {nav === "Marshals" && <><MembersList role="marshal" onChanged={reloadReqs} /><Invite onChanged={reloadReqs} /></>}
          {nav === "Vehicles" && <VehiclesList />}
          {nav === "Approvals" && <Approvals reqs={reqs} reload={reloadReqs} />}
          {nav === "Ranks" && <Ranks />}
          {nav === "Routes" && <RoutesManager />}
          {nav === "Map" && <AssociationMap />}
          {nav === "Levies" && <Levies />}
          {nav === "Fines ledger" && <FinesLedger />}
          {nav === "Statements" && <AssociationStatements />}
          {nav === "Bank account" && <BankScreen segment="association" color={COLOR} />}
        </ScreenBoundary>
      </div>
    </DashboardShell>
  );
}

function Overview() {
  const [r] = useLoad<Report>(() => call("/reports"));
  return (
    <Status load={r}>{(x) => (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Vehicle owners" value={String(x.members.owners)} icon={<Users className="w-4 h-4" />} color={COLOR} />
          <StatCard label="Drivers" value={String(x.members.drivers)} icon={<Users className="w-4 h-4" />} color="#F59E0B" />
          <StatCard label="Marshals" value={String(x.members.marshals)} icon={<Users className="w-4 h-4" />} color="#3B82F6" />
          <StatCard label="Member vehicles" value={String(x.members.vehicles)} icon={<Users className="w-4 h-4" />} color="#8B5CF6" />
        </div>
        {x.pendingRequests > 0 && <p className="text-sm text-amber-300">{x.pendingRequests} request{x.pendingRequests === 1 ? "" : "s"} to join {x.pendingRequests === 1 ? "is" : "are"} waiting under Approvals.</p>}
        {x.ranks.length === 0 ? <SectionPanel title="Departures"><div className="p-4"><Empty>No ranks yet.</Empty></div></SectionPanel> : (
          <TableCard title="Departures by rank" color={COLOR} columns={["Rank", "Today", "This week", "This month"]}
            rows={x.ranks.map((k) => [k.rank, `${k.today.departures} (${k.today.passengers} pax)`, `${k.week.departures} (${k.week.passengers} pax)`, `${k.month.departures} (${k.month.passengers} pax)`])} />)}
        <SectionPanel title="Levies"><div className="p-4 text-sm text-white">Outstanding {rand(x.levies.outstanding)} across {x.levies.open} open levies · collected {rand(x.levies.paid)}.</div></SectionPanel>
      </>
    )}</Status>
  );
}

function Approvals({ reqs, reload }: { reqs: ReturnType<typeof useLoad<{ requests: { id: string; name: string; email: string; role: string; at: string }[] }>>[0]; reload: () => void }) {
  return (
    <Status load={reqs}>{({ requests }) => (
      <SectionPanel title="People asking to join">
        <div className="p-4">{requests.length === 0 ? <Empty>No requests are waiting.</Empty> : (
          <ul className="space-y-3">{requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-white">
              <span>{r.name} <span className="text-white/40">({ROLE[r.role] ?? r.role}) · {r.email} · {when(r.at)}</span></span>
              <span className="flex gap-2">
                <ActionButton small label="Approve" color={COLOR} onRun={async () => { const x = await call(`/members/${r.id}/respond`, { method: "POST", body: { accept: true } }); reload(); return "error" in x ? { error: x.error } : undefined; }} />
                <ActionButton small label="Decline" color="#6B7280" onRun={async () => { const x = await call(`/members/${r.id}/respond`, { method: "POST", body: { accept: false } }); reload(); return "error" in x ? { error: x.error } : undefined; }} />
              </span>
            </li>))}</ul>)}
        </div>
      </SectionPanel>
    )}</Status>
  );
}

function Ranks() {
  const [l, reload] = useLoad<{ ranks: Rank[] }>(() => call("/ranks"));
  const [members] = useLoad<{ members: Member[] }>(() => call("/members"));
  const [f, setF] = useState({ name: "", location: "" });
  const marshals = members.state === "ready" ? members.data.members.filter((m) => m.role === "marshal" && m.status === "active") : [];
  return (
    <>
      <Status load={l}>{({ ranks }) => ranks.length === 0 ? (
        <SectionPanel title="Ranks"><div className="p-4"><Empty>No ranks yet. Add one below, then assign your marshals to it.</Empty></div></SectionPanel>
      ) : (
        <>{ranks.map((r) => (
          <SectionPanel key={r.id} title={`${r.name}${r.location ? ` · ${r.location}` : ""}`}>
            <div className="p-4 space-y-3 text-sm text-white">
              <p>{r.waiting} vehicle{r.waiting === 1 ? "" : "s"} waiting {r.active ? "" : <Badge text="inactive" color="#6B7280" />}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-white/50">Marshals:</span>
                {r.marshals.length === 0 && <span className="text-white/40">none assigned</span>}
                {r.marshals.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background: "#2D2A50" }}>{m.name}
                    <button aria-label={`Remove ${m.name}`} className="text-white/60 hover:text-white" onClick={async () => { await call(`/ranks/${r.id}/marshals/${m.id}/remove`, { method: "POST", body: {} }); reload(); }}>×</button></span>))}
                <select aria-label={`Add a marshal to ${r.name}`} className={inputCls + " !w-auto !py-1"} value="" onChange={async (e) => { if (e.target.value) { await call(`/ranks/${r.id}/marshals`, { method: "POST", body: { marshalId: e.target.value } }); reload(); } }}>
                  <option value="">Add a marshal…</option>{marshals.filter((m) => !r.marshals.some((x) => x.id === m.userId)).map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select>
              </div>
              <button className="text-xs underline text-white/60" onClick={async () => { await call(`/ranks/${r.id}`, { method: "PUT", body: { name: r.name, location: r.location ?? "", active: !r.active } }); reload(); }}>{r.active ? "Mark inactive" : "Mark active"}</button>
            </div>
          </SectionPanel>))}</>
      )}</Status>
      <SectionPanel title="Add a rank">
        <div className="p-4 flex flex-wrap gap-2 items-center">
          <input className={inputCls + " max-w-[14rem]"} placeholder="Rank name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={inputCls + " max-w-xs"} placeholder="Location (optional)" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <ActionButton label="Add rank" color={COLOR} onRun={async () => { const r = await call("/ranks", { method: "POST", body: f }); if (!("error" in r)) { setF({ name: "", location: "" }); reload(); } return "error" in r ? { error: r.error } : { message: "Added." }; }} />
        </div>
      </SectionPanel>
    </>
  );
}

function Levies() {
  const [l, reload] = useLoad<{ levies: Levy[] }>(() => call("/levies"));
  const [members] = useLoad<{ members: Member[] }>(() => call("/members"));
  const [f, setF] = useState({ memberId: "", title: "", amount: "", dueDate: "" });
  const active = members.state === "ready" ? members.data.members.filter((m) => m.status === "active") : [];
  return (
    <>
      <Status load={l}>{({ levies }) => levies.length === 0 ? (
        <SectionPanel title="Levies"><div className="p-4"><Empty>No levies yet. Create one below; the title, amount and due date are yours to set.</Empty></div></SectionPanel>
      ) : (
        <TableCard title="Levies" color={COLOR} columns={["Member", "Levy", "Amount", "Due", "Status", ""]}
          rows={levies.map((x) => [x.member, x.title, rand(x.amount), day(x.dueDate), <Badge key="s" text={x.paidAt ? "paid" : "unpaid"} color={x.paidAt ? "#10B981" : "#F59E0B"} />,
            x.paidAt ? "" : <span key="a" className="flex gap-2">
              <ActionButton small label="Mark paid" color={COLOR} onRun={async () => { const r = await call(`/levies/${x.id}/paid`, { method: "POST", body: {} }); reload(); return "error" in r ? { error: r.error } : undefined; }} />
              <ActionButton small label="Delete" color="#6B7280" onRun={async () => { const r = await call(`/levies/${x.id}/delete`, { method: "POST", body: {} }); reload(); return "error" in r ? { error: r.error } : undefined; }} />
            </span>])} />
      )}</Status>
      <SectionPanel title="Create a levy">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select aria-label="Member" className={inputCls} value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })}><option value="">Choose a member…</option>{active.map((m) => <option key={m.userId} value={m.userId}>{m.name} ({ROLE[m.role]})</option>)}</select>
          <input className={inputCls} placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className={inputCls} placeholder="Amount (R)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <input className={inputCls} type="date" aria-label="Due date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          <div className="sm:col-span-4"><ActionButton label="Create levy" color={COLOR} onRun={async () => { const r = await call("/levies", { method: "POST", body: { ...f, amount: Number(f.amount) } }); if (!("error" in r)) { setF({ memberId: "", title: "", amount: "", dueDate: "" }); reload(); } return "error" in r ? { error: r.error } : { message: "Created." }; }} /></div>
          <p className="sm:col-span-4 text-[11px] text-white/40">This records what you are owed and whether it has been paid. Online collection of levies is not part of this screen.</p>
        </div>
      </SectionPanel>
    </>
  );
}

/** Invite a member by email. The person has to accept the invitation. Works for vehicle owner, driver and marshal accounts. */
function Invite({ onChanged }: { onChanged: () => void }) {
  const [email, setEmail] = useState("");
  return (
    <SectionPanel title="Invite a member">
      <div className="p-4 flex flex-wrap gap-2 items-center">
        <input className={inputCls + " max-w-xs"} placeholder="Their account email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <ActionButton label="Send invitation" color={COLOR} onRun={async () => { const r = await call<{ message?: string }>("/members", { method: "POST", body: { email } }); if (!("error" in r)) { setEmail(""); onChanged(); } return outcome(r); }} />
        <p className="basis-full text-[11px] text-white/40">The person has to accept the invitation. It works for vehicle owner, driver and marshal accounts.</p>
      </div>
    </SectionPanel>
  );
}
