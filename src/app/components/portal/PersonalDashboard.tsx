import { lazy, Suspense, useState } from "react";
import { User, CreditCard, MapPin, LifeBuoy } from "lucide-react";
import { DashboardShell, SectionPanel, Badge } from "../dashboards/DashboardShell";
import { portalClient, useLoad, Status, Empty, Field, ActionButton, inputCls, when } from "./ui";

// The payments and banking dashboard is the same one customers use (online payments, in-person payments, banking, receipts).
const ManshyaDashboard = lazy(() => import("../manshya/ManshyaDashboard").then((m) => ({ default: m.ManshyaDashboard })));

const COLOR = "#128A43";
const call = portalClient("personal");
const NAV = [
  { icon: <User className="w-4 h-4" />, label: "Profile" },
  { icon: <CreditCard className="w-4 h-4" />, label: "Payments & banking" },
  { icon: <MapPin className="w-4 h-4" />, label: "Trips" },
  { icon: <LifeBuoy className="w-4 h-4" />, label: "Support" },
];

interface Profile { phone: string | null; homeArea: string | null; favouriteRoute: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null }
interface Req { id: string; subject: string; message: string; status: string; at: string }

export function PersonalDashboard({ userName, onClose }: { userName?: string; onClose: () => void }) {
  const [nav, setNav] = useState("Profile");
  return (
    <>
      <DashboardShell title="My Account" subtitle="Profile, payments and support" accentColor={COLOR} gradient={`from-[${COLOR}]`} navItems={NAV} activeNav={nav} onNavChange={setNav} onClose={onClose} userName={userName}>
        <div className="p-4 md:p-6 space-y-4 max-w-4xl">
          {nav === "Profile" && <ProfileScreen />}
          {nav === "Trips" && <SectionPanel title="Trip and booking history"><div className="p-4"><Empty>Your trips will appear here once they can be linked to your account. Nothing is recorded yet. Your payments are under Payments &amp; banking.</Empty></div></SectionPanel>}
          {nav === "Support" && <SupportScreen />}
          {nav === "Payments & banking" && <SectionPanel title="Payments & banking"><div className="p-4"><Empty>Opening your payments and banking dashboard…</Empty></div></SectionPanel>}
        </div>
      </DashboardShell>
      {nav === "Payments & banking" && (
        <Suspense fallback={null}><ManshyaDashboard isOpen onClose={() => setNav("Profile")} onSignOut={onClose} /></Suspense>
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
            <label key={k} className="block"><span className="text-[11px] text-white/60">{label}</span><input className={inputCls + " mt-1"} value={f[k]} onChange={set(k)} /></label>))}
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
          <li key={r.id} className="text-sm text-white"><div className="flex items-center gap-2"><b>{r.subject}</b><Badge text={r.status} color={r.status === "open" ? "#F59E0B" : "#10B981"} /><span className="text-xs text-white/40">{when(r.at)}</span></div><p className="text-xs text-white/60 mt-1 whitespace-pre-wrap">{r.message}</p></li>))}</ul></SectionPanel>
      )}</Status>
    </>
  );
}
