import { useState } from "react";
import { Home, Car, Users, BarChart3, FileText, Bell, Link2, Wallet, MapPin, Scale, Landmark } from "lucide-react";
import { Banknote } from "lucide-react";
import { PaymentsPanel, TripsPanel, OwnerAgreements } from "./MoneyPanels";
import { BankStrip, BankScreen } from "./BankAccount";
import { DashboardShell, SectionPanel, StatCard, TableCard, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, ActionButton, outcome, inputCls, rand, day, type Load } from "./ui";
import { LinksPanel } from "./LinksPanel";
import { OwnerTrend, OwnerMap, OwnerFinancials } from "./OwnerExtras";
import { ScreenBoundary } from "./widgets";

const COLOR = "#8B5CF6";
const call = portalClient("owner");

interface Vehicle { id: string; registration: string; make: string | null; model: string | null; year: number | null; colour: string | null; seats: number | null; discExpiry: string | null; driverId: string | null; driverName: string | null }
interface DriverLink { linkId: string; driverId: string; name: string; email: string; status: string; requestedBy: string; vehicles: string[] }
interface Period { count: number; fares: number; ownerShare: number }
interface Doc { id: string; kind: string; reference: string | null; expiresOn: string | null; vehicle: string | null }
interface Note { key: string; title: string; body: string; read: boolean; at: string }

export function OwnerDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Overview");
  const [notes, reloadNotes] = useLoad<{ notifications: Note[]; unread: number }>(() => call("/notifications"));
  const unread = notes.state === "ready" ? notes.data.unread : 0;
  const items = [
    { icon: <Home className="w-4 h-4" />, label: "Overview" }, { icon: <Car className="w-4 h-4" />, label: "Vehicles" },
    { icon: <Users className="w-4 h-4" />, label: "Drivers" }, { icon: <MapPin className="w-4 h-4" />, label: "Routes & map" },
    { icon: <BarChart3 className="w-4 h-4" />, label: "Reports" }, { icon: <Scale className="w-4 h-4" />, label: "Financials" },
    { icon: <FileText className="w-4 h-4" />, label: "Documents" }, { icon: <Bell className="w-4 h-4" />, label: "Notifications", badge: unread || undefined },
    { icon: <Banknote className="w-4 h-4" />, label: "Driver pay" }, { icon: <Scale className="w-4 h-4" />, label: "Payments & trips" },
    { icon: <Link2 className="w-4 h-4" />, label: "Requests & links" }, { icon: <Landmark className="w-4 h-4" />, label: "Bank account" },
  ];
  return (
    <DashboardShell title="Owner Dashboard" subtitle="Vehicles, drivers and earnings" accentColor={COLOR} gradient={`from-[${COLOR}]`} navItems={items} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName} alertCount={unread || undefined}>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <BankStrip segment="owner" color={COLOR} onOpen={() => setNav("Bank account")} />
        <ScreenBoundary resetKey={nav}>
          {nav === "Overview" && <><Overview /><OwnerTrend /></>}
          {nav === "Vehicles" && <Vehicles />}
          {nav === "Drivers" && <Drivers />}
          {nav === "Routes & map" && <OwnerMap />}
          {nav === "Reports" && <Reports />}
          {nav === "Financials" && <OwnerFinancials />}
          {nav === "Driver pay" && <OwnerAgreements color={COLOR} />}
          {nav === "Payments & trips" && <><PaymentsPanel segment="owner" color={COLOR} /><TripsPanel segment="owner" color={COLOR} /></>}
          {nav === "Documents" && <Documents onChanged={reloadNotes} />}
          {nav === "Notifications" && <Notifications notes={notes} reload={reloadNotes} />}
          {nav === "Requests & links" && <LinksPanel call={call} color={COLOR} />}
          {nav === "Bank account" && <BankScreen segment="owner" color={COLOR} />}
        </ScreenBoundary>
      </div>
    </DashboardShell>
  );
}

function Overview() {
  const [e] = useLoad<{ today: Period; week: Period; month: Period }>(() => call("/earnings"));
  return (
    <Status load={e}>{(x) => (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([["Today", x.today], ["This week", x.week], ["This month", x.month]] as const).map(([label, p]) => (
            <StatCard key={label} label={`${label}: fares collected`} value={rand(p.fares)} sub={`${p.count} fares · your share ${rand(p.ownerShare)}`} icon={<Wallet className="w-4 h-4" />} color={COLOR} />))}
        </div>
        <p className="text-[11px] text-white/40">Fares are confirmed card taps on terminals fitted to your vehicles. "Your share" is what the platform's split leaves for the owner. What you pay your drivers is your own arrangement and is not recorded here.</p>
      </>
    )}</Status>
  );
}

const EMPTY_V = { registration: "", make: "", model: "", year: "", colour: "", seats: "", disc_expiry: "" };
function Vehicles() {
  const [list, reload] = useLoad<{ vehicles: Vehicle[] }>(() => call("/vehicles"));
  const [drivers] = useLoad<{ drivers: DriverLink[] }>(() => call("/drivers"));
  const [f, setF] = useState(EMPTY_V);
  const [editing, setEditing] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY_V) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const active = drivers.state === "ready" ? drivers.data.drivers.filter((d) => d.status === "active") : [];

  const save = async () => {
    const r = await call(editing ? `/vehicles/${editing}` : "/vehicles", { method: editing ? "PUT" : "POST", body: f });
    if (!("error" in r)) { setF(EMPTY_V); setEditing(null); reload(); }
    return outcome({ ...(("error" in r) ? r : { data: { message: editing ? "Saved." : "Vehicle added." } }) });
  };
  return (
    <>
      <Status load={list}>{({ vehicles }) => vehicles.length === 0 ? (
        <SectionPanel title="Your vehicles"><div className="p-4"><Empty>No vehicles yet. Add your first one below.</Empty></div></SectionPanel>
      ) : (
        <TableCard title="Your vehicles" color={COLOR} columns={["Registration", "Vehicle", "Seats", "Disc expires", "Driver", ""]}
          rows={vehicles.map((v) => [
            v.registration, [v.make, v.model, v.year].filter(Boolean).join(" ") || "–", v.seats ?? "–", day(v.discExpiry),
            <select key="d" aria-label={`Driver for ${v.registration}`} className={inputCls + " !py-1"} value={v.driverId ?? ""} onChange={async (e) => { await call(`/vehicles/${v.id}/driver`, { method: "PUT", body: { driverId: e.target.value || null } }); reload(); }}>
              <option value="">No driver</option>{active.map((d) => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
            </select>,
            <button key="e" className="text-xs underline text-white/70" onClick={() => { setEditing(v.id); setF({ registration: v.registration, make: v.make ?? "", model: v.model ?? "", year: v.year?.toString() ?? "", colour: v.colour ?? "", seats: v.seats?.toString() ?? "", disc_expiry: v.discExpiry ?? "" }); }}>Edit</button>,
          ])} />
      )}</Status>
      <SectionPanel title={editing ? "Edit vehicle" : "Add a vehicle"}>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([["Registration", "registration", "text"], ["Make", "make", "text"], ["Model", "model", "text"], ["Year", "year", "text"], ["Colour", "colour", "text"], ["Seats", "seats", "text"], ["Licence disc expiry", "disc_expiry", "date"]] as const).map(([label, k, type]) => (
            <label key={k} className="block"><span className="text-[11px] text-white/60">{label}</span><input className={inputCls + " mt-1"} type={type} value={f[k]} onChange={set(k)} /></label>))}
          <div className="col-span-2 sm:col-span-4 flex gap-3 items-center">
            <ActionButton label={editing ? "Save changes" : "Add vehicle"} color={COLOR} onRun={save} />
            {editing && <button className="text-sm text-white/60 underline" onClick={() => { setEditing(null); setF(EMPTY_V); }}>Cancel</button>}
          </div>
        </div>
      </SectionPanel>
    </>
  );
}

function Drivers() {
  const [l, reload] = useLoad<{ drivers: DriverLink[] }>(() => call("/drivers"));
  const [email, setEmail] = useState("");
  return (
    <>
      <Status load={l}>{({ drivers }) => drivers.length === 0 ? (
        <SectionPanel title="Your drivers"><div className="p-4"><Empty>No drivers yet. Invite one by email below; they have to accept.</Empty></div></SectionPanel>
      ) : (
        <TableCard title="Your drivers" color={COLOR} columns={["Name", "Email", "Status", "Vehicles", ""]}
          rows={drivers.map((d) => [d.name, d.email, <Badge key="s" text={d.status === "pending" ? (d.requestedBy === "owner" ? "waiting for them" : "asked to join") : d.status} color={d.status === "active" ? "#10B981" : "#F59E0B"} />, d.vehicles.join(", ") || "–",
            <ActionButton key="r" small label="Remove" color="#6B7280" onRun={async () => { const r = await call(`/drivers/${d.linkId}/remove`, { method: "POST", body: {} }); reload(); return "error" in r ? { error: r.error } : undefined; }} />])} />
      )}</Status>
      <SectionPanel title="Invite a driver">
        <div className="p-4 flex flex-wrap gap-2 items-center">
          <input className={inputCls + " max-w-xs"} placeholder="Driver's account email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <ActionButton label="Send invitation" color={COLOR} onRun={async () => { const r = await call<{ message?: string }>("/drivers", { method: "POST", body: { email } }); if (!("error" in r)) { setEmail(""); reload(); } return outcome(r); }} />
        </div>
      </SectionPanel>
    </>
  );
}

function Reports() {
  const [r] = useLoad<{ month: { vehicles: { registration: string; fares: number; ownerShare: number; count: number }[]; fines: { count: number; total: number } } }>(() => call("/reports"));
  return (
    <Status load={r}>{({ month }) => (
      <>
        {month.vehicles.length === 0 ? <SectionPanel title="This month"><div className="p-4"><Empty>No vehicles yet.</Empty></div></SectionPanel> : (
          <TableCard title="This month, per vehicle" color={COLOR} columns={["Vehicle", "Fares", "Fares collected", "Your share"]} rows={month.vehicles.map((v) => [v.registration, v.count, rand(v.fares), rand(v.ownerShare)])} />)}
        <SectionPanel title="Route fines this month"><div className="p-4 text-sm text-white">{month.fines.count} fine{month.fines.count === 1 ? "" : "s"}, {rand(month.fines.total)} in total across your vehicles.</div></SectionPanel>
      </>
    )}</Status>
  );
}

function Documents({ onChanged }: { onChanged: () => void }) {
  const [l, reload] = useLoad<{ documents: Doc[] }>(() => call("/documents"));
  const [f, setF] = useState({ kind: "", reference: "", expires_on: "" });
  return (
    <>
      <Status load={l}>{({ documents }) => documents.length === 0 ? (
        <SectionPanel title="Compliance documents"><div className="p-4"><Empty>No documents recorded. Add the details and expiry date of each one and you will get a reminder before it expires.</Empty></div></SectionPanel>
      ) : (
        <TableCard title="Compliance documents" color={COLOR} columns={["Document", "Reference", "Vehicle", "Expires", ""]}
          rows={documents.map((d) => [d.kind, d.reference ?? "–", d.vehicle ?? "–", day(d.expiresOn),
            <ActionButton key="x" small label="Delete" color="#6B7280" onRun={async () => { const r = await call(`/documents/${d.id}/delete`, { method: "POST", body: {} }); reload(); onChanged(); return "error" in r ? { error: r.error } : undefined; }} />])} />
      )}</Status>
      <SectionPanel title="Add a document">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block"><span className="text-[11px] text-white/60">Kind (for example Operating licence)</span><input className={inputCls + " mt-1"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} /></label>
          <label className="block"><span className="text-[11px] text-white/60">Reference number</span><input className={inputCls + " mt-1"} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></label>
          <label className="block"><span className="text-[11px] text-white/60">Expiry date</span><input type="date" className={inputCls + " mt-1"} value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} /></label>
          <div className="sm:col-span-3"><ActionButton label="Add document" color={COLOR} onRun={async () => { const r = await call("/documents", { method: "POST", body: f }); if (!("error" in r)) { setF({ kind: "", reference: "", expires_on: "" }); reload(); onChanged(); } return "error" in r ? { error: r.error } : { message: "Added." }; }} /></div>
          <p className="sm:col-span-3 text-[11px] text-white/40">Only the details and the expiry date are kept here. No file is uploaded.</p>
        </div>
      </SectionPanel>
    </>
  );
}

function Notifications({ notes, reload }: { notes: Load<{ notifications: Note[]; unread: number }>; reload: () => void }) {
  return (
    <Status load={notes}>{({ notifications, unread }) => (
      <SectionPanel title="Notifications" action={unread > 0 ? <button className="text-xs text-white/70 underline" onClick={async () => { await call("/notifications/read", { method: "POST", body: { keys: notifications.filter((n) => !n.read).map((n) => n.key) } }); reload(); }}>Mark all as read</button> : undefined}>
        <div className="p-4">{notifications.length === 0 ? <Empty>Nothing needs your attention. Reminders about expiring documents and licence discs appear here.</Empty> : (
          <ul className="space-y-3">{notifications.map((n) => (
            <li key={n.key} className="flex items-start gap-3"><span className="mt-1.5 w-2 h-2 rounded-full" style={{ background: n.read ? "#ffffff33" : COLOR }} />
              <div><p className={`text-sm ${n.read ? "text-white/60" : "text-white font-semibold"}`}>{n.title}</p><p className="text-xs text-white/50">{n.body}</p></div></li>))}</ul>)}
        </div>
      </SectionPanel>
    )}</Status>
  );
}
