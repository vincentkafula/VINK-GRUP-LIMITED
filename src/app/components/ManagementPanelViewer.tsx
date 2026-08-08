import { useState, useEffect } from "react";
import {
  LayoutGrid, Landmark, CreditCard, ShoppingCart, Newspaper, Radio as RadioTower,
  Car, Tv, Calendar, Building2, ShieldCheck, HeartHandshake, Users, Settings,
  ClipboardList, Menu, Search, Bell, ChevronDown, Plus, ArrowRight, TrendingUp,
  AlertTriangle, Monitor, CheckCircle2, CalendarDays, FileCheck2, UserCog, Loader2,
  Check, X as XIcon, Lock,
} from "lucide-react";
import { toast } from "sonner";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { rbacApi, jobsApi, newsAdminApi, getSession, getToken, type SectionApplication, type ManagerRecord, type AuditEntry, type JobApplication } from "../services/apiClient";

interface Props { isOpen: boolean; onClose: () => void; adminName?: string; adminRole?: string; role?: string; onOpenNewsManagement?: () => void }

const GREEN = "#1FAE58";
const ORANGE = "#F4802F";

const SECTION_ICON: Record<string, React.ReactNode> = {
  "Bank Management": <Landmark className="w-4 h-4" />,
  "Payment Management": <CreditCard className="w-4 h-4" />,
  "Marketplace Management": <ShoppingCart className="w-4 h-4" />,
  "News Management": <Newspaper className="w-4 h-4" />,
  "Mobile Network Management": <RadioTower className="w-4 h-4" />,
  "Vehicle Management": <Car className="w-4 h-4" />,
  "Radio & TV Station Management": <Tv className="w-4 h-4" />,
  "Event Management": <Calendar className="w-4 h-4" />,
  "Company Registration Management": <Building2 className="w-4 h-4" />,
  "Insurance Management": <ShieldCheck className="w-4 h-4" />,
  "Social Responsibility Management": <HeartHandshake className="w-4 h-4" />,
};

const SIDEBAR_MODULES = [
  { label: "Bank Management", icon: <Landmark className="w-4 h-4" /> },
  { label: "Payment Management", icon: <CreditCard className="w-4 h-4" /> },
  { label: "Marketplace Management", icon: <ShoppingCart className="w-4 h-4" /> },
  { label: "News Management", icon: <Newspaper className="w-4 h-4" /> },
  { label: "Mobile Network Management", icon: <RadioTower className="w-4 h-4" /> },
  { label: "Vehicle Management", icon: <Car className="w-4 h-4" /> },
  { label: "Radio & TV Management", icon: <Tv className="w-4 h-4" /> },
  { label: "Event Management", icon: <Calendar className="w-4 h-4" /> },
  { label: "Company Registration", icon: <Building2 className="w-4 h-4" /> },
  { label: "Insurance Management", icon: <ShieldCheck className="w-4 h-4" /> },
  { label: "Social Responsibility", icon: <HeartHandshake className="w-4 h-4" /> },
];

// The sidebar intentionally shows shortened labels (matching the reference
// design), but the backend's permission system uses full canonical section
// names — this maps each sidebar label to the name actually stored in
// section_permissions, so filtering by what a manager is approved for works
// correctly without changing what's displayed.
const SIDEBAR_TO_SECTION: Record<string, string> = {
  "Bank Management": "Bank Management",
  "Payment Management": "Payment Management",
  "Marketplace Management": "Marketplace Management",
  "News Management": "News Management",
  "Mobile Network Management": "Mobile Network Management",
  "Vehicle Management": "Vehicle Management",
  "Radio & TV Management": "Radio & TV Station Management",
  "Event Management": "Event Management",
  "Company Registration": "Company Registration Management",
  "Insurance Management": "Insurance Management",
  "Social Responsibility": "Social Responsibility Management",
};

const SYSTEM_ITEMS = [
  { label: "Users & Roles", icon: <Users className="w-4 h-4" /> },
  { label: "Settings", icon: <Settings className="w-4 h-4" /> },
  { label: "Audit Logs", icon: <ClipboardList className="w-4 h-4" /> },
];

const STATS = [
  { label: "Total Institutions", value: "128", trend: "+12%", icon: <Landmark className="w-5 h-5" />, iconBg: "#E9F7EF", iconColor: GREEN, trendColor: GREEN },
  { label: "Total Transactions", value: "24,560", trend: "+18%", icon: <CreditCard className="w-5 h-5" />, iconBg: "#FDECE0", iconColor: ORANGE, trendColor: ORANGE },
  { label: "Active Users", value: "8,459", trend: "+9%", icon: <Users className="w-5 h-5" />, iconBg: "#E9F7EF", iconColor: GREEN, trendColor: GREEN },
  { label: "Total Revenue", value: "R 45.8M", trend: "+21%", icon: <TrendingUp className="w-5 h-5" />, iconBg: "#FDECE0", iconColor: ORANGE, trendColor: ORANGE },
];

interface ModuleTile { title: string; desc: string; icon: React.ReactNode; iconBg: string; iconColor: string; }
const MODULE_TILES: ModuleTile[] = [
  { title: "Bank Management", desc: "Manage bank accounts, branches, services and banking operations.", icon: <Landmark className="w-7 h-7" />, iconBg: "#E9F7EF", iconColor: GREEN },
  { title: "Payment Management", desc: "Manage payments, settlements, refunds and transaction rules.", icon: <CreditCard className="w-7 h-7" />, iconBg: "#FDECE0", iconColor: ORANGE },
  { title: "Marketplace Management", desc: "Manage vendors, products, orders and marketplace activities.", icon: <ShoppingCart className="w-7 h-7" />, iconBg: "#E9F7EF", iconColor: GREEN },
  { title: "News Management", desc: "Manage news articles, categories, authors and publishing.", icon: <Newspaper className="w-7 h-7" />, iconBg: "#FDECE0", iconColor: ORANGE },
  { title: "Mobile Network Management", desc: "Manage mobile operators, packages, USSD, data and airtime services.", icon: <RadioTower className="w-7 h-7" />, iconBg: "#E9F7EF", iconColor: GREEN },
  { title: "Vehicle Management", desc: "Manage vehicles, fleets, tracking, inspections and documents.", icon: <Car className="w-7 h-7" />, iconBg: "#FDECE0", iconColor: ORANGE },
  { title: "Radio & TV Station Management", desc: "Manage radio & TV stations, channels, programs and broadcasts.", icon: <Tv className="w-7 h-7" />, iconBg: "#FDECE0", iconColor: ORANGE },
  { title: "Event Management", desc: "Manage events, schedules, registrations and venues.", icon: <Calendar className="w-7 h-7" />, iconBg: "#E9F7EF", iconColor: GREEN },
  { title: "Company Registration Management", desc: "Manage company registrations, verifications and compliance.", icon: <Building2 className="w-7 h-7" />, iconBg: "#FDECE0", iconColor: ORANGE },
  { title: "Insurance Management", desc: "Manage insurance products, policies, claims and providers.", icon: <ShieldCheck className="w-7 h-7" />, iconBg: "#E9F7EF", iconColor: GREEN },
  { title: "Social Responsibility Management", desc: "Manage CSR initiatives, donations, projects and community impact.", icon: <HeartHandshake className="w-7 h-7" />, iconBg: "#FDECE0", iconColor: ORANGE },
];

const BOTTOM_STATS = [
  { value: "342", label: "Total Admins", icon: <Users className="w-5 h-5" />, iconBg: "#E9F7EF", iconColor: GREEN },
  { value: "98%", label: "System Uptime", icon: <ShieldCheck className="w-5 h-5" />, iconBg: "#E9F7EF", iconColor: GREEN },
  { value: "1,245", label: "Active Sessions", icon: <Monitor className="w-5 h-5" />, iconBg: "#FDECE0", iconColor: ORANGE },
  { value: "12", label: "Pending Approvals", icon: <ClipboardList className="w-5 h-5" />, iconBg: "#FDECE0", iconColor: ORANGE },
  { value: "24", label: "System Alerts", icon: <AlertTriangle className="w-5 h-5" />, iconBg: "#FEF2F2", iconColor: "#DC2626" },
];

type View = "dashboard" | "applications" | "managers" | "audit" | "apply" | "jobApplications";

export function ManagementPanelViewer({ isOpen, onClose, adminName = "Admin User", adminRole = "Super Administrator", role = "superadmin", onOpenNewsManagement }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeItem, setActiveItem] = useState("Dashboard");
  const [view, setView] = useState<View>("dashboard");
  // Both 'owner' (the new top-authority role) and 'superadmin' (the
  // original full-access role, kept for the renamed 'admin' account) get
  // full Super Admin access. Everyone else is a Section Manager, scoped to
  // whatever they've been explicitly approved for.
  const isOwner = role === "owner" || role === "superadmin";

  const [mySections, setMySections] = useState<string[] | null>(null); // null = loading
  const [pendingApps, setPendingApps] = useState<SectionApplication[]>([]);
  const [allApps, setAllApps] = useState<SectionApplication[]>([]);
  const [managers, setManagers] = useState<ManagerRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [applySection, setApplySection] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [jobDept, setJobDept] = useState<string | null>(null);
  const [jobApps, setJobApps] = useState<JobApplication[]>([]);
  const [selectedJobApp, setSelectedJobApp] = useState<JobApplication | null>(null);
  const [jobActionReason, setJobActionReason] = useState("");
  const [jobActionBusy, setJobActionBusy] = useState(false);
  const [newAccountUsername, setNewAccountUsername] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (isOwner) {
      rbacApi.applications("pending").then(r => { if (r.success) setPendingApps(r.data ?? []); });
    } else {
      rbacApi.mySections().then(r => { if (r.success) setMySections(r.data ?? []); else setMySections([]); });
    }
  }, [isOpen, isOwner]);

  if (!isOpen) return null;

  const openModule = (label: string) => {
    const section = SIDEBAR_TO_SECTION[label] ?? label; // sidebar labels are shortened, grid tile titles are already canonical

    if (section === "News Management" && onOpenNewsManagement) {
      // Someone hired into a specific newsroom role (Reporter, Editor,
      // etc. via the job application flow) gets their own dashboard for
      // doing that actual work. Someone with only generic News
      // Management access (an owner reviewing candidates, or an older
      // RBAC grant with no attached position) gets the reviewer workspace
      // below instead -- checked live rather than assumed, since section
      // access alone doesn't say which case this is.
      newsAdminApi.me().then(r => {
        if (r.success && r.data?.position) { onOpenNewsManagement(); return; }
        setJobDept(section);
        goView("jobApplications");
        loadJobApps(section);
      });
      return;
    }

    setJobDept(section);
    goView("jobApplications");
    loadJobApps(section);
  };

  const [jobLoadError, setJobLoadError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionExpiredDetail, setSessionExpiredDetail] = useState<{ path: string; hadToken: boolean; backendError: string | null } | null>(null);

  // Listen for the global session-expired signal (dispatched by
  // apiClient.ts when any authenticated request comes back 401) rather
  // than relying on each individual load function's own error banner --
  // this can happen mid-use, from any of the several data calls this
  // panel makes, and the person deserves one clear, unmissable message
  // instead of a small red banner buried in whichever tab happened to be
  // the first to fail.
  useEffect(() => {
    const handler = (e: Event) => {
      setSessionExpired(true);
      setSessionExpiredDetail((e as CustomEvent).detail ?? null);
    };
    window.addEventListener("vink:session-expired", handler);
    return () => window.removeEventListener("vink:session-expired", handler);
  }, []);

  const loadJobApps = (department: string, status?: string) => {
    setLoadingPanel(true);
    setJobLoadError(null);
    jobsApi.applications(department, status)
      .then(r => {
        if (r.success) { setJobApps(r.data ?? []); return; }
        // Was silently swallowed before — a 403 (wrong role) or network
        // failure looked identical to "no applications submitted yet."
        // This is very likely the actual bug behind "submitted but not
        // showing up": the submitter and the reviewer don't necessarily
        // have the same session, and if the account viewing this isn't
        // one of the reviewer roles, every fetch here has been failing
        // silently.
        setJobApps([]);
        setJobLoadError(r.error ?? "Could not load applications — you may not have reviewer access, or the connection failed.");
        toast.error(r.error ?? "Could not load applications for this department.");
      })
      .finally(() => setLoadingPanel(false));
  };

  const openJobApp = (ref: string) => {
    jobsApi.get(ref).then(r => {
      if (r.success && r.data) { setSelectedJobApp(r.data); return; }
      toast.error(r.error ?? "Could not load this application.");
    });
  };

  const [openingDoc, setOpeningDoc] = useState<string | null>(null);

  const openDocument = async (ref: string, type: string) => {
    // The previous plain <a href> pointed directly at an auth-protected
    // endpoint -- a browser navigating a link doesn't attach the
    // Authorization header the way fetch() does, so every click was
    // rejected with "Missing or invalid Authorization header" regardless
    // of who was signed in. Fetch it properly, with the real token, then
    // hand the browser a local blob URL to open instead.
    setOpeningDoc(type);
    try {
      const token = getToken();
      const res = await fetch(jobsApi.documentUrl(ref, type), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Could not load this document.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Revoke after a delay rather than immediately — the new tab needs
      // the URL to still be valid by the time it actually loads it.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      toast.error("Network error while loading the document.");
    } finally {
      setOpeningDoc(null);
    }
  };

  const handleJobStatusChange = async (ref: string, status: string) => {
    if (!jobActionReason.trim()) { toast.error("A reason is required for this action."); return; }
    if (status === "offered" && (newAccountUsername.trim() || newAccountPassword.trim()) && (!newAccountUsername.trim() || newAccountPassword.trim().length < 8)) {
      toast.error("Provide both a username and a password of at least 8 characters, or leave both blank.");
      return;
    }
    setJobActionBusy(true);
    const r = status === "offered"
      ? await jobsApi.approve(ref, jobActionReason.trim(), newAccountUsername.trim() || undefined, newAccountPassword || undefined)
      : await jobsApi.updateStatus(ref, status, jobActionReason.trim());
    setJobActionBusy(false);
    if (!r.success) { toast.error(r.error ?? "Action failed"); return; }
    if (status === "offered") {
      const data = r.data as { roleGranted?: boolean; accountCreated?: boolean } | undefined;
      if (data?.accountCreated) toast.success(`Approved — account created and ${jobDept} access granted.`);
      else if (data?.roleGranted) toast.success(`Approved — ${jobDept} access granted.`);
      else toast.warning((r as unknown as { warning?: string }).warning ?? "Approved, but the applicant doesn't have a VINK account yet — access will need to be granted once they register.");
    } else {
      toast.success(status === "rejected" ? "Application rejected." : status === "interview" ? "Moved to interview." : "Status updated.");
    }
    setSelectedJobApp(null);
    setJobActionReason("");
    setNewAccountUsername("");
    setNewAccountPassword("");
    if (jobDept) loadJobApps(jobDept);
  };

  const loadApplications = () => { setLoadingPanel(true); rbacApi.applications().then(r => { if (r.success) setAllApps(r.data ?? []); }).finally(() => setLoadingPanel(false)); };
  const loadManagers = () => { setLoadingPanel(true); rbacApi.managers().then(r => { if (r.success) setManagers(r.data ?? []); }).finally(() => setLoadingPanel(false)); };
  const loadAudit = () => { setLoadingPanel(true); rbacApi.audit().then(r => { if (r.success) setAuditLog(r.data ?? []); }).finally(() => setLoadingPanel(false)); };

  const goView = (v: View) => {
    setView(v); setActiveItem(v === "dashboard" ? "Dashboard" : v[0].toUpperCase() + v.slice(1));
    if (v === "applications") loadApplications();
    if (v === "managers") loadManagers();
    if (v === "audit") loadAudit();
  };

  const handleApprove = async (id: string) => {
    const r = await rbacApi.approve(id);
    if (r.success) { toast.success("Application approved — access granted."); loadApplications(); rbacApi.applications("pending").then(x => x.success && setPendingApps(x.data ?? [])); }
    else toast.error(r.error ?? "Failed to approve");
  };
  const handleReject = async (id: string) => {
    const reason = window.prompt("Reason for rejecting this application (optional):") ?? undefined;
    const r = await rbacApi.reject(id, reason);
    if (r.success) { toast.success("Application rejected."); loadApplications(); rbacApi.applications("pending").then(x => x.success && setPendingApps(x.data ?? [])); }
    else toast.error(r.error ?? "Failed to reject");
  };
  const handleRevoke = async (userId: string, section: string) => {
    if (!window.confirm(`Revoke access to ${section} for this manager?`)) return;
    const r = await rbacApi.revoke(userId, section);
    if (r.success) { toast.success("Access revoked."); loadManagers(); }
    else toast.error(r.error ?? "Failed to revoke");
  };
  const handleApply = async () => {
    if (!applySection) { toast.error("Choose a section to apply for."); return; }
    setApplying(true);
    const r = await rbacApi.apply(applySection, applyMessage || undefined);
    setApplying(false);
    if (r.success) { toast.success("Application submitted — a Super Administrator will review it."); setApplySection(""); setApplyMessage(""); rbacApi.mySections().then(x => x.success && setMySections(x.data ?? [])); }
    else toast.error(r.error ?? "Failed to submit application");
  };

  // Which sidebar/grid sections this account can actually see
  const visibleSidebarModules = isOwner ? SIDEBAR_MODULES : SIDEBAR_MODULES.filter(m => (mySections ?? []).includes(SIDEBAR_TO_SECTION[m.label]));
  const visibleTiles = isOwner ? MODULE_TILES : MODULE_TILES.filter(t => (mySections ?? []).includes(t.title));

  return (
    <div className="fixed inset-0 z-50 flex text-[14px]" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: "#F6F7FB" }}>

      {sessionExpired && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(14,20,32,0.75)" }}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-7 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#FEF2F2" }}>
              <Lock className="w-7 h-7" style={{ color: "#DC2626" }} />
            </div>
            <p className="text-base font-bold text-gray-900 mb-1.5">Your session has expired</p>
            <p className="text-sm text-gray-500 mb-4">Please sign in again from the main menu to continue.</p>
            {sessionExpiredDetail && (
              <div className="text-left text-[11px] font-mono bg-gray-50 rounded-lg p-3 mb-4 text-gray-500 break-words">
                <p><strong>Endpoint:</strong> {sessionExpiredDetail.path}</p>
                <p><strong>Token was sent:</strong> {sessionExpiredDetail.hadToken ? "Yes" : "No"}</p>
                <p><strong>Server said:</strong> {sessionExpiredDetail.backendError ?? "—"}</p>
              </div>
            )}
            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90" style={{ background: GREEN }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 overflow-hidden transition-all duration-200 flex flex-col`} style={{ background: "#0E1420" }}>
        <div className="w-64 flex flex-col h-full">
          <div className="px-5 pt-6 pb-5">
            <div className="flex items-baseline gap-0.5">
              <img src={vinkLogo} alt="" className="h-6 w-6 object-contain mr-1.5" />
              <span className="font-black text-xl" style={{ color: GREEN }}>VINK</span>
            </div>
            <p className="text-[10px] font-bold tracking-[0.16em] text-white/40 mt-1">MANAGEMENT PANEL</p>
          </div>
          <div className="h-px bg-white/10 mx-5 mb-4" />

          <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
            <button
              onClick={() => goView("dashboard")}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold mb-4"
              style={view === "dashboard" ? { background: GREEN, color: "#fff" } : { color: "rgba(255,255,255,0.7)" }}
            >
              <LayoutGrid className="w-4 h-4" /> Dashboard
            </button>

            {isOwner && (
              <>
                <p className="px-3 text-[10px] font-bold tracking-[0.12em] text-white/30 mb-2">SUPER ADMIN</p>
                <button
                  onClick={() => goView("applications")}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                  style={view === "applications" ? { background: GREEN, color: "#fff" } : { color: "rgba(255,255,255,0.7)" }}
                >
                  <span className="flex items-center gap-2.5"><FileCheck2 className="w-4 h-4" /> Applications</span>
                  {pendingApps.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: ORANGE }}>{pendingApps.length}</span>}
                </button>
                <button
                  onClick={() => goView("managers")}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                  style={view === "managers" ? { background: GREEN, color: "#fff" } : { color: "rgba(255,255,255,0.7)" }}
                >
                  <span className="flex items-center gap-2.5"><UserCog className="w-4 h-4" /> Managers</span>
                </button>
              </>
            )}

            <p className="px-3 text-[10px] font-bold tracking-[0.12em] text-white/30 mt-5 mb-2">
              {isOwner ? "MANAGEMENT MODULES (ALL)" : "YOUR SECTIONS"}
            </p>
            {mySections !== null && !isOwner && visibleSidebarModules.length === 0 && (
              <p className="px-3 text-[12px] text-white/40 leading-relaxed">You haven't been approved for any sections yet.</p>
            )}
            {visibleSidebarModules.map(m => (
              <button
                key={m.label}
                onClick={() => { setActiveItem(m.label); openModule(m.label); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2.5">{m.icon} {m.label}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-40" />
              </button>
            ))}
            {!isOwner && (
              <button
                onClick={() => goView("apply")}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold mt-1 border border-dashed"
                style={view === "apply" ? { background: GREEN, color: "#fff", borderColor: GREEN } : { color: GREEN, borderColor: "rgba(31,174,88,0.4)" }}
              >
                <Plus className="w-4 h-4" /> Apply for a Section
              </button>
            )}

            <p className="px-3 text-[10px] font-bold tracking-[0.12em] text-white/30 mt-5 mb-2">SYSTEM</p>
            {SYSTEM_ITEMS.map(m => (
              <button
                key={m.label}
                onClick={() => m.label === "Audit Logs" && isOwner ? goView("audit") : (() => { setActiveItem(m.label); openModule(m.label); })()}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                style={view === "audit" && m.label === "Audit Logs" ? { background: GREEN, color: "#fff" } : { color: "rgba(255,255,255,0.7)" }}
              >
                <span className="flex items-center gap-2.5">{m.icon} {m.label}</span>
                {!(m.label === "Audit Logs" && isOwner) && <Lock className="w-3.5 h-3.5 opacity-30" />}
              </button>
            ))}
          </nav>

          <div className="p-3 mt-2">
            <button onClick={onClose} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: GREEN }}>
                {adminName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-semibold text-white truncate">{adminName}</p>
                <p className="text-[11px] truncate" style={{ color: ORANGE }}>{adminRole}</p>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-100 sticky top-0 z-10">
          <button onClick={() => setSidebarOpen(o => !o)} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0">
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input placeholder="Search anything..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-600" />
          </div>
          <div className="flex items-center gap-4 ml-auto shrink-0">
            <button className="relative p-2 rounded-lg hover:bg-gray-50">
              <Bell className="w-4.5 h-4.5 text-gray-500" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: ORANGE }}>6</span>
            </button>
            <button className="flex items-center gap-2.5 pl-2">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: GREEN }}>
                {adminName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <span className="text-left hidden sm:block">
                <p className="text-[13px] font-semibold text-gray-900 leading-tight">{adminName}</p>
                <p className="text-[11px] text-gray-400 leading-tight">{adminRole}</p>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={onClose} className="text-xs font-semibold text-gray-400 hover:text-gray-700 border-l border-gray-200 pl-4">Close</button>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {view === "dashboard" && (
          <>
          {/* Welcome header */}
          <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Welcome back, Admin! 👋</h1>
              <p className="text-gray-500 text-sm mt-1">Here's what's happening across the platform today.</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white shrink-0">
              <CalendarDays className="w-4 h-4 text-gray-400" /> 02 May 2025 - 08 May 2025 <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            {STATS.map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
                <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">{s.label}</p>
                  <p className="text-xl font-black text-gray-900 mt-0.5">{s.value}</p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: s.trendColor }}>↑ {s.trend} from last month</p>
                </div>
              </div>
            ))}
          </div>

          {/* Management Modules */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black text-gray-900">Management Modules</h2>
            <button className="flex items-center gap-1 text-sm font-bold" style={{ color: GREEN }}>View all modules <ArrowRight className="w-4 h-4" /></button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5 mb-8">
            {!isOwner && mySections !== null && visibleTiles.length === 0 && (
              <div className="col-span-full bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <Lock className="w-8 h-8 mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-bold text-gray-900">No sections assigned yet</p>
                <p className="text-xs text-gray-500 mt-1 mb-4">Apply to manage a section — a Super Administrator will review your request.</p>
                <button onClick={() => goView("apply")} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: GREEN }}>Apply for a Section</button>
              </div>
            )}
            {visibleTiles.map(m => (
              <div key={m.title} className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
                <span className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: m.iconBg, color: m.iconColor }}>{m.icon}</span>
                <p className="text-[15px] font-bold text-gray-900 leading-snug">{m.title}</p>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed flex-1">{m.desc}</p>
                <button onClick={() => openModule(m.title)} className="mt-4 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50">
                  Manage <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Add New Module */}
            {isOwner && (
            <button onClick={() => toast.info("Custom module builder is coming soon.")} className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 flex flex-col items-center justify-center text-center hover:border-gray-300 transition-colors">
              <span className="w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-gray-100 text-gray-400"><Plus className="w-7 h-7" /></span>
              <p className="text-[15px] font-bold text-gray-900">Add New Module</p>
              <p className="text-xs text-gray-500 mt-2">Create a new management module for your platform.</p>
              <span className="mt-4 flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-xs font-bold" style={{ background: "#EAF7EE", color: GREEN }}>
                Create Module <ArrowRight className="w-3 h-3" />
              </span>
            </button>
            )}
          </div>

          {/* Bottom stats strip */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 items-center">
            {BOTTOM_STATS.map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: s.iconBg, color: s.iconColor }}>{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-base font-black text-gray-900 leading-tight">{s.value}</p>
                  <p className="text-[11px] text-gray-400 leading-tight">{s.label}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 lg:justify-self-end">
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: GREEN }} />
              <div>
                <p className="text-[13px] font-bold text-gray-900 leading-tight">System Health</p>
                <p className="text-[11px] leading-tight" style={{ color: GREEN }}>All systems operational</p>
              </div>
            </div>
          </div>
          </>
          )}

          {/* ── Applications (owner only) ── */}
          {view === "applications" && (
            <div>
              <h1 className="text-2xl font-black text-gray-900 mb-1">Section Manager Applications</h1>
              <p className="text-gray-500 text-sm mb-6">Review, approve, or reject requests to manage a section.</p>
              {loadingPanel ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : allApps.length === 0 ? (
                <p className="text-sm text-gray-400">No applications yet.</p>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
                  {allApps.map(a => (
                    <div key={a.id} className="p-5 flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">{a.name} <span className="text-gray-400 font-normal">@{a.username}</span></p>
                        <p className="text-xs mt-1"><span className="font-semibold" style={{ color: GREEN }}>{a.section}</span> · {new Date(a.created_at).toLocaleDateString()}</p>
                        {a.message && <p className="text-xs text-gray-500 mt-2 italic">"{a.message}"</p>}
                        {a.status === "rejected" && a.rejection_reason && <p className="text-xs text-red-500 mt-2">Rejected: {a.rejection_reason}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.status === "pending" ? (
                          <>
                            <button onClick={() => handleApprove(a.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: GREEN }}><Check className="w-3.5 h-3.5" /> Approve</button>
                            <button onClick={() => handleReject(a.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 border border-red-200"><XIcon className="w-3.5 h-3.5" /> Reject</button>
                          </>
                        ) : (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={a.status === "approved" ? { background: "#E9F7EF", color: GREEN } : { background: "#FEF2F2", color: "#DC2626" }}>
                            {a.status === "approved" ? "Approved" : "Rejected"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Managers (owner only) ── */}
          {view === "managers" && (
            <div>
              <h1 className="text-2xl font-black text-gray-900 mb-1">Section Managers</h1>
              <p className="text-gray-500 text-sm mb-6">Everyone currently granted access to at least one section.</p>
              {loadingPanel ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : managers.length === 0 ? (
                <p className="text-sm text-gray-400">No managers yet — approve an application to grant section access.</p>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
                  {managers.map(m => (
                    <div key={m.id} className="p-5">
                      <p className="text-sm font-bold text-gray-900">{m.name} <span className="text-gray-400 font-normal">@{m.username}</span></p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {m.sections.map(s => (
                          <span key={s.section} className="flex items-center gap-1.5 text-[11px] font-semibold pl-2.5 pr-1.5 py-1 rounded-full" style={{ background: "#E9F7EF", color: GREEN }}>
                            {s.section}{s.position ? ` — ${s.position}` : ""}
                            <button onClick={() => handleRevoke(m.id, s.section)} className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-black/10" title="Revoke"><XIcon className="w-2.5 h-2.5" /></button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Audit Log (owner only) ── */}
          {view === "audit" && (
            <div>
              <h1 className="text-2xl font-black text-gray-900 mb-1">Audit Log</h1>
              <p className="text-gray-500 text-sm mb-6">Every approval, rejection, and permission change made by a Super Administrator.</p>
              {loadingPanel ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : auditLog.length === 0 ? (
                <p className="text-sm text-gray-400">No activity logged yet.</p>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
                  {auditLog.map(a => (
                    <div key={a.id} className="p-4 flex items-center justify-between gap-4 text-sm">
                      <div>
                        <span className="font-bold text-gray-900">{a.actor_name}</span>{" "}
                        <span className="text-gray-500">{a.action.replace(".", " ")}</span>{" "}
                        {a.target && <span className="font-semibold" style={{ color: GREEN }}>{a.target}</span>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Job Applications for a specific department ── */}
          {view === "jobApplications" && jobDept && (
            <div>
              <h1 className="text-2xl font-black text-gray-900 mb-1">{jobDept} — Job Applications</h1>
              <p className="text-gray-500 text-sm mb-6">Applications for positions in this department. Approving one grants real {jobDept} section access, the same as the RBAC "apply to manage a section" flow.</p>

              <div className="flex gap-2 mb-5">
                {[
                  { key: undefined, label: "All" },
                  { key: "submitted", label: "New" },
                  { key: "under_review", label: "Under Review" },
                  { key: "interview", label: "Interview" },
                  { key: "offered", label: "Approved" },
                  { key: "rejected", label: "Rejected" },
                ].map(f => (
                  <button key={f.label} onClick={() => loadJobApps(jobDept, f.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50">
                    {f.label}
                  </button>
                ))}
              </div>

              {jobLoadError && (
                <div className="px-4 py-3 rounded-xl mb-4 text-sm font-semibold" style={{ background: "#FEF2F2", color: "#DC2626" }}>
                  {jobLoadError}
                </div>
              )}

              {loadingPanel ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : jobLoadError ? null : jobApps.length === 0 ? (
                <p className="text-sm text-gray-400">No applications for {jobDept} yet.</p>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
                  {jobApps.map(a => (
                    <button key={a.id} onClick={() => openJobApp(a.referenceNumber)}
                      className="w-full text-left p-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">{a.applicantName} <span className="text-gray-400 font-normal">· {a.position}</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">{a.referenceNumber} · Submitted {new Date(a.submittedAt).toLocaleDateString()}</p>
                      </div>
                      <JobStatusBadge status={a.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Apply for a section (non-owner) ── */}
          {view === "apply" && (
            <div className="max-w-lg">
              <h1 className="text-2xl font-black text-gray-900 mb-1">Apply to Manage a Section</h1>
              <p className="text-gray-500 text-sm mb-6">Your application is reviewed by a Super Administrator before you're granted access.</p>
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <label className="text-xs font-bold text-gray-700">Section</label>
                <select value={applySection} onChange={e => setApplySection(e.target.value)} className="w-full mt-1.5 mb-4 px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none">
                  <option value="">Choose a section…</option>
                  {Object.values(SIDEBAR_TO_SECTION).filter(s => !(mySections ?? []).includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <label className="text-xs font-bold text-gray-700">Why should you manage this section? (optional)</label>
                <textarea value={applyMessage} onChange={e => setApplyMessage(e.target.value)} rows={3} className="w-full mt-1.5 mb-4 px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none resize-none" placeholder="Relevant experience, role, or context for the Super Administrator..." />
                <button onClick={handleApply} disabled={applying} className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>
                  {applying ? "Submitting…" : "Submit Application"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between px-6 sm:px-8 py-5 text-[11px] text-gray-400 border-t border-gray-100">
          <span>© 2026 VINK Management Panel. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <span className="hover:text-gray-600 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-gray-600 cursor-pointer">Terms of Use</span>
            <span className="hover:text-gray-600 cursor-pointer">Support</span>
          </div>
        </div>
      </div>

      {/* ── Job application review modal ── */}
      {selectedJobApp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedJobApp(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <p className="font-bold text-gray-900 text-sm">{selectedJobApp.applicantName}</p>
                <p className="text-xs text-gray-500">{selectedJobApp.position} · {selectedJobApp.referenceNumber}</p>
              </div>
              <button onClick={() => setSelectedJobApp(null)} className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><XIcon className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <JobStatusBadge status={selectedJobApp.status} />
                {selectedJobApp.roleGranted && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: "#E9F7EF", color: GREEN }}>
                    {jobDept} access granted
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Email</p><p className="font-semibold text-gray-800">{selectedJobApp.applicantEmail}</p></div>
                <div><p className="text-xs text-gray-400">Phone</p><p className="font-semibold text-gray-800">{selectedJobApp.applicantPhone || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Submitted</p><p className="font-semibold text-gray-800">{new Date(selectedJobApp.submittedAt).toLocaleString()}</p></div>
                <div><p className="text-xs text-gray-400">Department</p><p className="font-semibold text-gray-800">{selectedJobApp.department}</p></div>
              </div>

              {selectedJobApp.documents.length > 0 && (
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Documents</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedJobApp.documents.map(d => (
                      <button key={d.type} onClick={() => openDocument(selectedJobApp.referenceNumber, d.type)} disabled={openingDoc === d.type}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        {openingDoc === d.type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5" />} {d.filename}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedJobApp.statusHistory && selectedJobApp.statusHistory.length > 0 && (
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">History</p>
                  <div className="space-y-2">
                    {selectedJobApp.statusHistory.map((h, i) => (
                      <div key={i} className="text-xs flex items-start gap-2">
                        <span className="font-semibold text-gray-700 shrink-0">{new Date(h.createdAt).toLocaleDateString()}</span>
                        <span className="text-gray-500">{h.fromStatus ? `${h.fromStatus} → ` : ""}<strong>{h.toStatus}</strong>{h.changedByName ? ` by ${h.changedByName}` : ""} — {h.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                // Mirrors server/src/routes/jobsRouter.ts's ALLOWED_TRANSITIONS —
                // kept in sync manually since the frontend needs to know which
                // buttons are even worth showing, not just rely on the backend
                // rejecting an invalid one after the fact. Update both together.
                const ALLOWED: Record<string, string[]> = {
                  submitted: ["under_review", "rejected", "withdrawn"],
                  under_review: ["interview", "rejected", "withdrawn"],
                  interview: ["offered", "rejected", "withdrawn"],
                  offered: ["rejected", "withdrawn"],
                  rejected: ["under_review", "offered"],
                  withdrawn: [],
                };
                const LABELS: Record<string, { label: string; cls: string }> = {
                  under_review: { label: selectedJobApp.status === "rejected" ? "Reconsider" : "Start Review", cls: "border border-blue-200 text-blue-700 hover:bg-blue-50" },
                  interview: { label: "Interview", cls: "border border-blue-200 text-blue-700 hover:bg-blue-50" },
                  rejected: { label: "Reject", cls: "border border-red-200 text-red-600 hover:bg-red-50" },
                  offered: { label: "Approve", cls: "text-white" },
                  withdrawn: { label: "Mark Withdrawn", cls: "border border-gray-200 text-gray-600 hover:bg-gray-50" },
                };
                const nextSteps = (ALLOWED[selectedJobApp.status] ?? []).filter(s => s !== "withdrawn");
                if (!nextSteps.length) return null;

                return (
                  <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Review decision{selectedJobApp.status === "rejected" ? " — this application was rejected; correct it below if that was a mistake" : ""}
                    </p>
                    <textarea value={jobActionReason} onChange={e => setJobActionReason(e.target.value)} rows={2}
                      placeholder="Reason for this decision (required)…"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />

                    {nextSteps.includes("offered") && !selectedJobApp.roleGranted && (
                      <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                        <p className="text-xs font-bold text-gray-700">If approving: set their VINK login (only needed if they don't have an account yet)</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={newAccountUsername} onChange={e => setNewAccountUsername(e.target.value)}
                            placeholder="Username" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
                          <input value={newAccountPassword} onChange={e => setNewAccountPassword(e.target.value)} type="text"
                            placeholder="Password (min 8 characters)" className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none" />
                        </div>
                        <p className="text-[11px] text-gray-500">Leave both blank if they already have a VINK account under this email — access is granted automatically either way.</p>
                      </div>
                    )}

                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${nextSteps.length}, 1fr)` }}>
                      {nextSteps.map(step => (
                        <button key={step} disabled={jobActionBusy} onClick={() => handleJobStatusChange(selectedJobApp.referenceNumber, step)}
                          className={`py-2.5 rounded-lg text-xs font-bold disabled:opacity-50 ${LABELS[step]?.cls ?? "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                          style={step === "offered" ? { background: GREEN } : undefined}>
                          {jobActionBusy ? "…" : (LABELS[step]?.label ?? step)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    submitted: { label: "New", bg: "#FEF3C7", color: "#F59E0B" },
    under_review: { label: "Under Review", bg: "#DBEAFE", color: "#3B82F6" },
    interview: { label: "Interview", bg: "#DBEAFE", color: "#3B82F6" },
    offered: { label: "Approved", bg: "#E9F7EF", color: GREEN },
    rejected: { label: "Rejected", bg: "#FEE2E2", color: "#EF4444" },
    withdrawn: { label: "Withdrawn", bg: "#F3F4F6", color: "#6B7280" },
  };
  const c = cfg[status] ?? cfg.submitted;
  return <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: c.bg, color: c.color }}>{c.label}</span>;
}
