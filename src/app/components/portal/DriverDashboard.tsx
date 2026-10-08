import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TokensPanel } from "./TokensPanel";
import { User, Car, Route as RouteIcon, Wallet, Bell, Loader2, TriangleAlert, Link2, FileText, Landmark, Coins } from "lucide-react";
import { Banknote } from "lucide-react";
import { PaymentsPanel, TripsPanel, CrossBorderPanel, VirtualAccountsPanel, DriverAgreements } from "./MoneyPanels";
import { BankStrip, BankScreen } from "./BankAccount";
import { portalClient } from "./ui";
import { LinksPanel } from "./LinksPanel";
import { PowerPanel, DriverTrips, DriverTrend, DriverStatements } from "./DriverExtras";
import { ScreenBoundary } from "./widgets";
import { DashboardShell, StatCard, SectionPanel, TableCard, Badge } from "../dashboards/DashboardShell";
import {
  driverApi, rand, when,
  type DriverProfile, type DriverVehicle, type DriverRoute, type DriverTrip, type DriverEarnings, type DriverNotification,
} from "./driverApi";

const COLOR = "#F59E0B";
const NAV_BASE = [
  { icon: <User className="w-4 h-4" />, label: "Profile" },
  { icon: <Car className="w-4 h-4" />, label: "Vehicle & licence" },
  { icon: <RouteIcon className="w-4 h-4" />, label: "Route & trips" },
  { icon: <Wallet className="w-4 h-4" />, label: "Earnings" },
  { icon: <FileText className="w-4 h-4" />, label: "Statements" }, { icon: <Coins className="w-4 h-4" />, label: "VINK Tokens" }, { icon: <Landmark className="w-4 h-4" />, label: "Bank account" },
  { icon: <Banknote className="w-4 h-4" />, label: "Pay agreement" }, { icon: <Wallet className="w-4 h-4" />, label: "Payments & trips" },
  { icon: <Bell className="w-4 h-4" />, label: "Notifications" },
  { icon: <Link2 className="w-4 h-4" />, label: "Requests & links" },
];
const linkCall = portalClient("driver");

type Load<T> = { state: "loading" } | { state: "error"; error: string } | { state: "ready"; data: T };

/** Loads one endpoint and exposes a reload. Each screen owns its data, so a failure in one never blanks the others. */
function useLoad<T>(fetcher: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, active: boolean): [Load<T>, () => void] {
  const [v, setV] = useState<Load<T>>({ state: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let live = true;
    setV((p) => (p.state === "ready" ? p : { state: "loading" }));
    fetcher().then((r) => { if (live) setV("data" in r ? { state: "ready", data: r.data } : { state: "error", error: r.error }); });
    return () => { live = false; };
  }, [active, n]);          // eslint-disable-line react-hooks/exhaustive-deps
  return [v, () => setN((x) => x + 1)];
}

function Status<T>({ load, children }: { load: Load<T>; children: (d: T) => React.ReactNode }) {
  if (load.state === "loading") return <p className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>;
  if (load.state === "error") return <p role="alert" className="flex items-center gap-2 text-sm text-bad"><TriangleAlert className="w-4 h-4" />{load.error}</p>;
  return <>{children(load.data)}</>;
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-fg-muted">{children}</p>;
const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><p className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</p><p className="text-sm text-fg">{value || <span className="text-fg-subtle">Not set</span>}</p></div>
);

export function DriverDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Profile");
  const [notes, reloadNotes] = useLoad(driverApi.notifications, true);
  const unread = notes.state === "ready" ? notes.data.unread : 0;
  const navItems = NAV_BASE.map((n) => (n.label === "Notifications" && unread ? { ...n, badge: unread } : n));

  return (
    <DashboardShell title="Driver's Dashboard" subtitle="Trips, earnings and vehicle" accentColor={COLOR} gradient={`from-[${COLOR}]`}
      navItems={navItems} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName} alertCount={unread || undefined}>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <BankStrip segment="driver" color={COLOR} onOpen={() => setNav("Bank account")} />
        <ScreenBoundary resetKey={nav}>
          {nav === "Profile" && <ProfileScreen onChanged={reloadNotes} />}
          {nav === "Vehicle & licence" && <VehicleScreen />}
          {nav === "Route & trips" && <TripsScreen />}
          {nav === "Earnings" && <EarningsScreen />}
          {nav === "Statements" && <DriverStatements />}
          {nav === "Pay agreement" && <DriverAgreements color={COLOR} />}
          {nav === "Payments & trips" && <><VirtualAccountsPanel segment="driver" color={COLOR} /><CrossBorderPanel segment="driver" color={COLOR} /><PaymentsPanel segment="driver" color={COLOR} /><TripsPanel segment="driver" color={COLOR} /></>}
          {nav === "Notifications" && <NotificationsScreen notes={notes} reload={reloadNotes} />}
          {nav === "Requests & links" && <LinksPanel call={linkCall} color={COLOR} canAskOwner />}
          {nav === "VINK Tokens" && <TokensPanel segment="driver" color={COLOR} />}
          {nav === "Bank account" && <BankScreen segment="driver" color={COLOR} />}
        </ScreenBoundary>
      </div>
    </DashboardShell>
  );
}

/* ───────── Profile (with licence details the driver enters) ───────── */
function ProfileScreen({ onChanged }: { onChanged: () => void }) {
  const [load, reload] = useLoad(driverApi.profile, true);
  // Saving a licence or permit date can create or clear an expiry reminder, so the notifications are refreshed as well.
  return (
    <Status load={load}>{({ user, profile }) => <ProfileForm user={user} profile={profile} onSaved={() => { reload(); onChanged(); }} />}</Status>
  );
}
function ProfileForm({ user, profile, onSaved }: { user: { name: string; email: string; username: string }; profile: DriverProfile; onSaved: () => void }) {
  const [f, setF] = useState({
    phone: profile.phone ?? "", licence_number: profile.licenceNumber ?? "", licence_code: profile.licenceCode ?? "",
    licence_expiry: profile.licenceExpiry ?? "", pdp_number: profile.pdpNumber ?? "", pdp_expiry: profile.pdpExpiry ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await driverApi.saveProfile(f);
    setBusy(false);
    setMsg("data" in r ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if ("data" in r) onSaved();
  };
  const input = "w-full rounded-lg px-3 py-2 text-sm bg-[var(--vk-bg)] border border-[var(--vk-line)] text-white placeholder-white/30";
  return (
    <>
      <SectionPanel title="Your details">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
          <Field label="Name" value={user.name} /><Field label="Email" value={user.email} /><Field label="Username" value={user.username} />
        </div>
      </SectionPanel>
      <SectionPanel title="Licence and permit">
        <form onSubmit={submit} noValidate className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            ["Phone number", "phone", "text", "082 123 4567"], ["Driving licence number", "licence_number", "text", ""], ["Licence code", "licence_code", "text", "e.g. EC"],
            ["Licence expiry", "licence_expiry", "date", ""], ["Professional driving permit (PDP) number", "pdp_number", "text", ""], ["PDP expiry", "pdp_expiry", "date", ""],
          ] as const).map(([label, key, type, ph]) => (
            <label key={key} className="block"><span className="text-[11px] text-fg-muted">{label}</span>
              <input className={input + " mt-1"} type={type} placeholder={ph} value={f[key]} onChange={set(key)} /></label>
          ))}
          <div className="sm:col-span-2 flex items-center gap-3">
            <button disabled={busy} className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60" style={{ background: COLOR, color: "#1a1200" }}>{busy ? "Saving…" : "Save details"}</button>
            {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</span>}
          </div>
          <p className="sm:col-span-2 text-[11px] text-fg-subtle">These details are entered by you. They are used for expiry reminders and are not checked against any licensing authority.</p>
        </form>
      </SectionPanel>
    </>
  );
}

/* ───────── Vehicle & licence ───────── */
function VehicleScreen() {
  const [load, reload] = useLoad(driverApi.vehicles, true);
  return (
    <Status load={load}>{({ vehicles }) => vehicles.length === 0 ? (
      <SectionPanel title="Your vehicle"><div className="p-4"><Empty>No vehicle is linked to your account yet. Your owner or association links it to you.</Empty></div></SectionPanel>
    ) : <>{vehicles.map((v: DriverVehicle) => (
      <SectionPanel key={v.terminalId} title={v.registration ?? "Vehicle"}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
          <Field label="Registration" value={v.registration} /><Field label="Make & model" value={[v.make, v.model].filter(Boolean).join(" ")} />
          <Field label="Year" value={v.year} /><Field label="Colour" value={v.colour} />
          <Field label="Seats" value={v.seats} /><Field label="Licence disc expires" value={v.discExpiry} />
          <Field label="Fare terminal" value={v.terminalSerial} /><Field label="Terminal status" value={v.terminalStatus ? <Badge text={v.terminalStatus} color={v.terminalStatus === "active" ? "#10B981" : "#F59E0B"} /> : null} />
        </div>
        {v.terminalId && <PowerPanel terminalId={v.terminalId} status={v.terminalStatus} onChanged={reload} />}
      </SectionPanel>
    ))}</>}</Status>
  );
}

/* ───────── Route & trips ───────── */
function TripsScreen() {
  const [routes] = useLoad(driverApi.routes, true);
  return (
    <>
      <Status load={routes}>{({ routes: rs }) => (
        <SectionPanel title="Your routes">
          <div className="p-4">{rs.length === 0 ? <Empty>No route is assigned to your vehicle yet.</Empty> : (
            <ul className="space-y-2">{rs.map((r: DriverRoute) => (
              <li key={r.id} className="flex items-center justify-between text-sm text-fg">
                <span>{r.name} <span className="text-fg-subtle">· {r.waypoints} points · {r.toleranceMeters} m allowed off the path</span></span>
                <Badge text={r.active ? "active" : "inactive"} color={r.active ? "#10B981" : "#6B7280"} />
              </li>))}</ul>)}
          </div>
        </SectionPanel>
      )}</Status>
      <DriverTrips />
    </>
  );
}

/* ───────── Earnings: fares collected and fines. Never pay: that is private between driver and owner. ───────── */
function EarningsScreen() {
  const [load] = useLoad(driverApi.earnings, true);
  return (
    <Status load={load}>{(e: DriverEarnings) => (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Fares collected today" value={rand(e.faresCollected.today.total)} sub={`${e.faresCollected.today.count} fares`} icon={<Wallet className="w-4 h-4" />} color={COLOR} />
          <StatCard label="This week" value={rand(e.faresCollected.week.total)} sub={`${e.faresCollected.week.count} fares`} icon={<Wallet className="w-4 h-4" />} color="#3B82F6" />
          <StatCard label="This month" value={rand(e.faresCollected.month.total)} sub={`${e.faresCollected.month.count} fares`} icon={<Wallet className="w-4 h-4" />} color="#10B981" />
        </div>
        <DriverTrend />
        <p className="text-[11px] text-fg-subtle">These are the fares collected on your vehicle. Your own pay is agreed privately with your owner and is not shown here.</p>
        <SectionPanel title={`Fines · balance ${rand(e.fineBalance)}`}>
          <div className="p-4">{e.fines.length === 0 ? <Empty>No fines. Keep to your route.</Empty> : (
            <ul className="space-y-2">{e.fines.map((f) => (
              <li key={f.id} className="flex items-center justify-between text-sm text-fg">
                <span>{f.description ?? "Off-route fine"}{f.route ? ` · ${f.route}` : ""}{f.distanceFromRouteMeters != null ? ` · ${f.distanceFromRouteMeters} m off the path` : ""}<span className="text-fg-subtle"> · {when(f.at)}</span></span>
                <span className="font-bold text-bad">{rand(f.amount)}</span>
              </li>))}</ul>)}
          </div>
        </SectionPanel>
      </>
    )}</Status>
  );
}

/* ───────── Notifications ───────── */
function NotificationsScreen({ notes, reload }: { notes: Load<{ notifications: DriverNotification[]; unread: number }>; reload: () => void }) {
  const markAll = useCallback(async (keys: string[]) => { if (keys.length) { await driverApi.markRead(keys); reload(); } }, [reload]);
  return (
    <Status load={notes}>{({ notifications, unread }) => (
      <SectionPanel title="Notifications" action={unread > 0 ? <button className="text-xs text-fg underline" onClick={() => markAll(notifications.filter((n) => !n.read).map((n) => n.key))}>Mark all as read</button> : undefined}>
        <div className="p-4">{notifications.length === 0 ? <Empty>Nothing new. Reminders about expiring documents and new fines appear here.</Empty> : (
          <ul className="space-y-3">{notifications.map((n) => (
            <li key={n.key} className="flex items-start gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full ${n.read ? "bg-white/20" : ""}`} style={n.read ? undefined : { background: COLOR }} />
              <div className="flex-1"><p className={`text-sm ${n.read ? "text-fg-muted" : "text-fg font-semibold"}`}>{n.title}</p><p className="text-xs text-fg-muted">{n.body}</p></div>
              {!n.read && <button className="text-[11px] text-fg-muted underline" onClick={() => markAll([n.key])}>Mark read</button>}
            </li>))}</ul>)}
        </div>
      </SectionPanel>
    )}</Status>
  );
}
