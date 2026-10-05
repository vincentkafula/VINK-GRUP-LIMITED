import { useEffect, useState } from "react";
import { Home, Loader2, ShieldAlert } from "lucide-react";
import { DashboardShell, SectionPanel } from "../dashboards/DashboardShell";
import { getSession, authFetch } from "../../services/apiClient";
import { API_BASE } from "../../services/config";
import { lazy, Suspense } from "react";
import { DriverDashboard } from "./DriverDashboard";
import { OwnerDashboard } from "./OwnerDashboard";
import { MarshalDashboard } from "./MarshalDashboard";
import { AssociationDashboard } from "./AssociationDashboard";
import { InvestorDashboard } from "./InvestorDashboard";
const PersonalDashboard = lazy(() => import("./PersonalDashboard").then((m) => ({ default: m.PersonalDashboard })));   // pulls in the payments dashboard only when needed
import { PORTALS, portalPathForRole, type PortalKey } from "./portalDefs";

/**
 * Shell for the role dashboards. The page itself is only a convenience: the real protection is on the server
 * (/api/portal/<segment> answers 403 to every other role). Anyone else who opens this URL is told so and offered their own dashboard.
 */
export function RolePortal({ portal, isOpen, onClose }: { portal: PortalKey; isOpen: boolean; onClose: () => void }) {
  const def = PORTALS[portal];
  const session = getSession();
  const [state, setState] = useState<"checking" | "ok" | "denied" | "signedOut" | "error">("checking");
  const [nav, setNav] = useState("Overview");

  useEffect(() => {
    if (!isOpen) return;
    if (!session) { setState("signedOut"); return; }
    let live = true;
    setState("checking");
    authFetch(`${API_BASE}/api/portal/${def.segment}`)
      .then((r) => { if (live) setState(r.ok ? "ok" : r.status === 403 ? "denied" : r.status === 401 ? "signedOut" : "error"); })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [isOpen, def.segment, session?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  if (state !== "ok") {
    const own = portalPathForRole(session?.role);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--vk-bg)" }} role="dialog" aria-label={def.title}>
        <div className="max-w-sm w-full rounded-2xl p-8 text-center" style={{ background: "var(--vk-surface)", border: "1px solid var(--vk-line)" }}>
          {state === "checking" ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-fg" /> : <ShieldAlert className="w-8 h-8 mx-auto text-warn" />}
          <p className="mt-4 text-fg font-semibold">
            {state === "checking" && "Checking your access…"}
            {state === "signedOut" && "Please sign in to continue."}
            {state === "denied" && "This dashboard is for a different type of account."}
            {state === "error" && "We could not reach the server. Please try again."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {state === "signedOut" && <button className="py-2.5 rounded-lg font-bold text-sm bg-white text-black" onClick={() => { onClose(); window.dispatchEvent(new Event("vink:open-login")); }}>Sign in</button>}
            {state === "denied" && own && <button className="py-2.5 rounded-lg font-bold text-sm bg-white text-black" onClick={() => { window.location.assign(own); }}>Go to my dashboard</button>}
            <button className="py-2.5 rounded-lg text-sm text-fg" onClick={onClose}>Back to the site</button>
          </div>
        </div>
      </div>
    );
  }

  const name = session?.name;
  if (portal === "driver") return <DriverDashboard userName={name} onClose={onClose} />;
  if (portal === "owner") return <OwnerDashboard userName={name} onClose={onClose} />;
  if (portal === "marshal") return <MarshalDashboard userName={name} onClose={onClose} />;
  if (portal === "association") return <AssociationDashboard userName={name} onClose={onClose} />;
  if (portal === "investor") return <InvestorDashboard userName={name} onClose={onClose} />;
  if (portal === "personal") return <Suspense fallback={null}><PersonalDashboard userName={name} onClose={onClose} /></Suspense>;

  return (
    <DashboardShell
      title={def.title} subtitle={def.subtitle} accentColor={def.color} gradient={`from-[${def.color}]`}
      navItems={[{ icon: <Home className="w-4 h-4" />, label: "Overview" }]} activeNav={nav} onNavChange={setNav}
      onClose={onClose} userName={session?.name}
    >
      <SectionPanel title={`Welcome, ${session?.name ?? ""}`}>
        <p className="text-sm text-fg">You are signed in with a <b>{def.role.replace("_", " ")}</b> account. The features of this dashboard are being built step by step.</p>
      </SectionPanel>
    </DashboardShell>
  );
}
