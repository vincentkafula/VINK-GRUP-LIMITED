import { useState } from "react";
import { TokensPanel } from "./TokensPanel";
import { ShieldCheck, ClipboardList, IdCard, Clock, Siren, HeartHandshake, BarChart3 as OverviewIcon, Home, Users, CheckCircle2, MapPin, Route as RouteIcon, Coins, Car, Map as MapIcon, Landmark, FileText, UserCog, UserCheck, Building2 } from "lucide-react";
import { Banknote } from "lucide-react";
import { PaymentsPanel, TripsPanel, CrossBorderPanel, VirtualAccountsPanel, MarshalFeeSetting } from "./MoneyPanels";
import { BankStrip, BankScreen } from "./BankAccount";
import { DashboardShell, SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, outcome, inputCls, rand, day, when } from "./ui";
import { MembersList, VehiclesList, RoutesManager, AssociationMap, DeparturesTrend, FinesLedger, AssociationStatements } from "./AssociationExtras";
import { ScreenBoundary } from "./widgets";
import { LoadingReport } from "./LoadingReport";
import { ShiftsPanel, SafetyPanel, WelfarePanel, OverviewPanel } from "./AssociationCare";
import { ComplianceOverview, RegistrationScreen, VehicleRegisterScreen, DriverRegisterScreen } from "./AssociationCompliance";
import { FinanceOverview, FeesAndReceiptsScreen, ExpensesScreen, IncomeStatementScreen } from "./AssociationFinance";
import { GovernanceScreen, DisciplineScreen } from "./AssociationGovernance";
import { ReportsScreen } from "./AssociationReports";
import { SafetyScreen, RouteControlScreen } from "./AssociationSafety";
import { CommissionScreen, PayRunScreen, QueriesScreen } from "./AssociationCommission";

const COLOR = "#C8102E";
const call = portalClient("association");
const ROLE: Record<string, string> = { vehicle_owner: "Vehicle owner", driver: "Driver", marshal: "Marshal" };

interface Member { id: string; userId: string; name: string; email: string; role: string; status: string }
interface Per { departures: number; passengers: number }
interface Report { members: { owners: number; drivers: number; marshals: number; vehicles: number }; pendingRequests: number; ranks: { rank: string; today: Per; week: Per; month: Per }[]; levies: { outstanding: number; paid: number; open: number } }
interface Rank { id: string; name: string; location: string | null; active: boolean; waiting: number; marshals: { id: string; name: string }[] }
interface Levy { id: string; title: string; amount: number; dueDate: string | null; paidAt: string | null; member: string }

export function AssociationDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Compliance");
  const [reqs, reloadReqs] = useLoad<{ requests: { id: string; name: string; email: string; role: string; at: string }[] }>(() => call("/requests"));
  const pending = reqs.state === "ready" ? reqs.data.requests.length : 0;
  const G = { home: "Compliance", reg: "Registers", routes: "Routes and ranks", fin: "Association finance", gov: "Governance", money: "VINK money", care: "Marshals", vink: "VINK" };
  const items = [
    { icon: <ShieldCheck className="w-4 h-4" />, label: "Compliance", group: G.home }, { icon: <FileText className="w-4 h-4" />, label: "Reports", group: G.home }, { icon: <Home className="w-4 h-4" />, label: "Overview", group: G.home },
    { icon: <ClipboardList className="w-4 h-4" />, label: "Registration", group: G.reg }, { icon: <Users className="w-4 h-4" />, label: "Owners", group: G.reg }, { icon: <UserCog className="w-4 h-4" />, label: "Drivers", group: G.reg }, { icon: <UserCheck className="w-4 h-4" />, label: "Marshals", group: G.reg },
    { icon: <Car className="w-4 h-4" />, label: "Vehicles", group: G.reg }, { icon: <Car className="w-4 h-4" />, label: "Vehicle register", group: G.reg }, { icon: <IdCard className="w-4 h-4" />, label: "Driver register", group: G.reg },
    { icon: <CheckCircle2 className="w-4 h-4" />, label: "Approvals", badge: pending || undefined, group: G.reg },
    { icon: <MapPin className="w-4 h-4" />, label: "Ranks", group: G.routes }, { icon: <RouteIcon className="w-4 h-4" />, label: "Routes", group: G.routes }, { icon: <MapIcon className="w-4 h-4" />, label: "Map", group: G.routes }, { icon: <ShieldCheck className="w-4 h-4" />, label: "Route control", group: G.routes },
    { icon: <Banknote className="w-4 h-4" />, label: "Finance", group: G.fin }, { icon: <FileText className="w-4 h-4" />, label: "Fees & receipts", group: G.fin }, { icon: <Landmark className="w-4 h-4" />, label: "Expenses & banking", group: G.fin }, { icon: <FileText className="w-4 h-4" />, label: "Income statement", group: G.fin },
    { icon: <ClipboardList className="w-4 h-4" />, label: "Governance", group: G.gov }, { icon: <Siren className="w-4 h-4" />, label: "Discipline", group: G.gov }, { icon: <Siren className="w-4 h-4" />, label: "Safety", group: G.gov },
    { icon: <Coins className="w-4 h-4" />, label: "Levies", group: G.money }, { icon: <Landmark className="w-4 h-4" />, label: "Fines ledger", group: G.money }, { icon: <FileText className="w-4 h-4" />, label: "Statements", group: G.money },
    { icon: <Banknote className="w-4 h-4" />, label: "Marshal fee & payments", group: G.money }, { icon: <Coins className="w-4 h-4" />, label: "Commission", group: G.money }, { icon: <FileText className="w-4 h-4" />, label: "Pay runs", group: G.money }, { icon: <Landmark className="w-4 h-4" />, label: "Queries", group: G.money },
    { icon: <Clock className="w-4 h-4" />, label: "Shifts", group: G.care }, { icon: <Siren className="w-4 h-4" />, label: "Safety", group: G.care }, { icon: <HeartHandshake className="w-4 h-4" />, label: "Marshal welfare", group: G.care }, { icon: <OverviewIcon className="w-4 h-4" />, label: "Marshal overview", group: G.care },
    { icon: <Coins className="w-4 h-4" />, label: "VINK Tokens", group: G.vink }, { icon: <Building2 className="w-4 h-4" />, label: "Bank account", group: G.vink },
  ];
  return (
    <DashboardShell title="Association" subtitle="Members, ranks, routes and levies" accentColor={COLOR} gradient={`from-[${COLOR}]`} navItems={items} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName} alertCount={pending || undefined}>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <BankStrip segment="association" color={COLOR} onOpen={() => setNav("Bank account")} />
        <ScreenBoundary resetKey={nav}>
          {nav === "Compliance" && <ComplianceOverview onOpen={setNav} />}
          {nav === "Reports" && <ReportsScreen />}
          {nav === "Finance" && <FinanceOverview onOpen={setNav} />}
          {nav === "Governance" && <GovernanceScreen />}
          {nav === "Discipline" && <DisciplineScreen />}
          {nav === "Safety" && <SafetyScreen />}
          {nav === "Route control" && <RouteControlScreen />}
          {nav === "Fees & receipts" && <FeesAndReceiptsScreen />}
          {nav === "Expenses & banking" && <ExpensesScreen />}
          {nav === "Income statement" && <IncomeStatementScreen />}
          {nav === "Registration" && <RegistrationScreen />}
          {nav === "Vehicle register" && <VehicleRegisterScreen />}
          {nav === "Driver register" && <DriverRegisterScreen />}
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
          {nav === "Commission" && <CommissionScreen />}
          {nav === "Pay runs" && <PayRunScreen />}
          {nav === "Queries" && <QueriesScreen />}
          {nav === "Shifts" && <ShiftsPanel />}
          {nav === "Safety" && <SafetyPanel />}
          {nav === "Marshal welfare" && <WelfarePanel />}
          {nav === "Marshal overview" && <OverviewPanel />}
          {nav === "Statements" && <><AssociationStatements /><LoadingReport segment="association" /></>}
          {nav === "Marshal fee & payments" && <><MarshalFeeSetting color={COLOR} /><VirtualAccountsPanel segment="association" color={COLOR} /><CrossBorderPanel segment="association" color={COLOR} /><PaymentsPanel segment="association" color={COLOR} /><TripsPanel segment="association" color={COLOR} /></>}
          {nav === "VINK Tokens" && <TokensPanel segment="association" color={COLOR} />}
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
          <StatCard label="Member vehicles" value={String(x.members.vehicles)} icon={<Users className="w-4 h-4" />} color="#B04040" />
        </div>
        {x.pendingRequests > 0 && <p className="text-sm text-warn">{x.pendingRequests} request{x.pendingRequests === 1 ? "" : "s"} to join {x.pendingRequests === 1 ? "is" : "are"} waiting under Approvals.</p>}
        {x.ranks.length === 0 ? <SectionPanel title="Departures"><div className="p-4"><Empty>No ranks yet.</Empty></div></SectionPanel> : (
          <TableCard title="Departures by rank" color={COLOR} columns={["Rank", "Today", "This week", "This month"]}
            rows={x.ranks.map((k) => [k.rank, `${k.today.departures} (${k.today.passengers} pax)`, `${k.week.departures} (${k.week.passengers} pax)`, `${k.month.departures} (${k.month.passengers} pax)`])} />)}
        <SectionPanel title="Levies"><div className="p-4 text-sm text-fg">Outstanding {rand(x.levies.outstanding)} across {x.levies.open} open levies · collected {rand(x.levies.paid)}.</div></SectionPanel>
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
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg">
              <span>{r.name} <span className="text-fg-subtle">({ROLE[r.role] ?? r.role}) · {r.email} · {when(r.at)}</span></span>
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
            <div className="p-4 space-y-3 text-sm text-fg">
              <p>{r.waiting} vehicle{r.waiting === 1 ? "" : "s"} waiting {r.active ? "" : <Badge text="inactive" color="#6B7280" />}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-fg-muted">Marshals:</span>
                {r.marshals.length === 0 && <span className="text-fg-subtle">none assigned</span>}
                {r.marshals.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background: "var(--vk-line)" }}>{m.name}
                    <button aria-label={`Remove ${m.name}`} className="text-fg-muted hover:text-fg" onClick={async () => { await call(`/ranks/${r.id}/marshals/${m.id}/remove`, { method: "POST", body: {} }); reload(); }}>×</button></span>))}
                <select aria-label={`Add a marshal to ${r.name}`} className={inputCls + " !w-auto !py-1"} value="" onChange={async (e) => { if (e.target.value) { await call(`/ranks/${r.id}/marshals`, { method: "POST", body: { marshalId: e.target.value } }); reload(); } }}>
                  <option value="">Add a marshal…</option>{marshals.filter((m) => !r.marshals.some((x) => x.id === m.userId)).map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select>
              </div>
              <button className="text-xs underline text-fg-muted" onClick={async () => { await call(`/ranks/${r.id}`, { method: "PUT", body: { name: r.name, location: r.location ?? "", active: !r.active } }); reload(); }}>{r.active ? "Mark inactive" : "Mark active"}</button>
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
          <p className="sm:col-span-4 text-[11px] text-fg-subtle">This records what you are owed and whether it has been paid. Online collection of levies is not part of this screen.</p>
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
        <p className="basis-full text-[11px] text-fg-subtle">The person has to accept the invitation. It works for vehicle owner, driver and marshal accounts.</p>
      </div>
    </SectionPanel>
  );
}
