/**
 * VMS Admin Dashboard
 * Full application review centre — approve, decline, request info, assign reviewers.
 * Powered by Supabase Edge Function.
 */
import { useState, useEffect, useCallback } from "react";
import {
  X, CheckCircle, XCircle, AlertCircle, Clock, Search, Filter,
  ChevronRight, RefreshCw, Users, FileText, Mail, Bell,
  TrendingUp, BarChart3, Eye, MessageSquare, UserCheck, Download,
  Shield, ChevronDown, Activity,
} from "lucide-react";
import { adminApi, type Application, type AppStatus } from "../services/applicationsApi";
import vinkLogo from "../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; }

const P = "#5B2D8E";
const GOLD = "#F5A623";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:              { label: "Pending",           color: "#F59E0B", bg: "#FEF3C7", icon: <Clock className="w-3.5 h-3.5" /> },
  under_review:         { label: "Under Review",      color: "#3B82F6", bg: "#DBEAFE", icon: <Eye className="w-3.5 h-3.5" /> },
  approved:             { label: "Approved",          color: "#10B981", bg: "#D1FAE5", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  declined:             { label: "Declined",          color: "#EF4444", bg: "#FEE2E2", icon: <XCircle className="w-3.5 h-3.5" /> },
  more_info_required:   { label: "More Info Needed",  color: "#8B5CF6", bg: "#EDE9FE", icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

const TYPE_LABELS: Record<string, string> = {
  account: "Bank Account", creditCard: "Credit Card", loan: "Personal Loan",
  invest: "Investment", insure: "Insurance", rewards: "Rewards",
  sim: "SIM Card", businessLoan: "Business Loan", corporateLoan: "Corporate Loan",
};

const TYPE_COLORS: Record<string, string> = {
  account: "#3949AB", creditCard: "#6B5ED7", loan: "#E53935",
  invest: "#1565C0", insure: "#2E7D32", rewards: "#AB47BC",
  sim: "#F57C00", businessLoan: "#5B2D8E", corporateLoan: "#1A237E",
};

const REVIEWERS = ["Sarah Mokoena", "Thabo Dlamini", "Priya Naidoo", "James van Berg", "Lindiwe Khumalo"];

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AppStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Application detail drawer ────────────────────────────────────────────────

function AppDetailDrawer({ app, onClose, onAction }: {
  app: Application;
  onClose: () => void;
  onAction: (action: "approve" | "decline" | "request_info" | "assign", data?: Record<string, string>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"details" | "events" | "formData">("details");
  const [events, setEvents] = useState<Record<string,unknown>[]>([]);
  const [actionNote, setActionNote] = useState("");
  const [selectedReviewer, setSelectedReviewer] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [infoNote, setInfoNote] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [showInfoForm, setShowInfoForm] = useState(false);

  useEffect(() => {
    if (tab === "events") {
      adminApi.events(app.referenceNumber).then(r => {
        if (r.success) setEvents(r.data as Record<string,unknown>[]);
      });
    }
  }, [tab, app.referenceNumber]);

  const doAction = async (action: "approve" | "decline" | "request_info" | "assign") => {
    setActing(action);
    const data: Record<string, string> = {};
    if (action === "decline") data.reason = declineReason;
    if (action === "request_info") data.note = infoNote;
    if (action === "assign") data.assignedTo = selectedReviewer;
    if (action === "approve") data.reviewNotes = actionNote || "Application approved.";
    await onAction(action, data);
    setActing(null);
    setShowDeclineForm(false);
    setShowInfoForm(false);
  };

  const formEntries = Object.entries(app.formData ?? {}).filter(([, v]) => v !== "" && v !== null && v !== false);

  return (
    <div className="fixed inset-y-0 right-0 z-60 w-full max-w-xl bg-white shadow-2xl flex flex-col border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
        <div>
          <p className="text-sm font-black text-gray-900">{app.referenceNumber}</p>
          <p className="text-xs text-gray-500 mt-0.5">{app.applicantName} · {TYPE_LABELS[app.type] ?? app.type}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={app.status} />
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {(["details", "formData", "events"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2.5 text-xs font-semibold transition-colors border-b-2"
            style={{ borderBottomColor: tab === t ? P : "transparent", color: tab === t ? P : "#6B7280" }}>
            {t === "details" ? "Applicant" : t === "formData" ? "Form Data" : "Audit Trail"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {tab === "details" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Full Name",       value: app.applicantName },
                { label: "Email",           value: app.applicantEmail || "—" },
                { label: "Phone",           value: app.applicantPhone || "—" },
                { label: "Product",         value: app.subType || TYPE_LABELS[app.type] || app.type },
                { label: "Submitted",       value: new Date(app.submittedAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
                { label: "Last Updated",    value: new Date(app.updatedAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) },
                { label: "Assigned To",     value: app.assignedTo || "Unassigned" },
                { label: "Review Notes",    value: app.reviewNotes || "None" },
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-xl bg-gray-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5 break-words">{item.value}</p>
                </div>
              ))}
            </div>

            {/* Assign reviewer */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Assign to Reviewer</p>
              <div className="flex gap-2">
                <select className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400"
                  value={selectedReviewer} onChange={e => setSelectedReviewer(e.target.value)}>
                  <option value="">Select reviewer…</option>
                  {REVIEWERS.map(r => <option key={r}>{r}</option>)}
                </select>
                <button onClick={() => selectedReviewer && doAction("assign")}
                  disabled={!selectedReviewer || acting === "assign"}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 flex-shrink-0"
                  style={{ background: P }}>
                  {acting === "assign" ? "…" : "Assign"}
                </button>
              </div>
            </div>
          </>
        )}

        {tab === "formData" && (
          <div className="space-y-2">
            {formEntries.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No form data captured.</p>
            ) : formEntries.map(([key, val], i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-gray-50">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 w-28 flex-shrink-0 mt-0.5">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </span>
                <span className="text-sm text-gray-800 font-medium break-words flex-1">
                  {typeof val === "boolean" ? (val ? "Yes" : "No") : String(val ?? "—")}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "events" && (
          <div className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No events recorded yet.</p>
            ) : [...events].reverse().map((ev: Record<string,unknown>, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                  style={{ background: ev.action === "approved" ? "#10B981" : ev.action === "declined" ? "#EF4444" : P }}>
                  {String(ev.action ?? "?")[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800 capitalize">{String(ev.action ?? "").replace(/_/g, " ")}</p>
                  {ev.note && <p className="text-xs text-gray-600 mt-0.5">{String(ev.note)}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">by {String(ev.by ?? "Admin")} · {new Date(String(ev.at ?? "")).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action bar — only for actionable statuses */}
      {(app.status === "pending" || app.status === "under_review" || app.status === "more_info_required") && (
        <div className="border-t border-gray-200 p-4 space-y-3 flex-shrink-0 bg-gray-50">

          {showDeclineForm && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-red-600">Decline reason (required)</p>
              <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-400 resize-none" rows={3}
                placeholder="Explain why this application is being declined…"
                value={declineReason} onChange={e => setDeclineReason(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => { setShowDeclineForm(false); setDeclineReason(""); }} className="flex-1 py-2 rounded-xl text-xs font-bold text-gray-500 bg-white border border-gray-200">Cancel</button>
                <button onClick={() => declineReason && doAction("decline")} disabled={!declineReason || acting === "decline"}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: "#EF4444" }}>
                  {acting === "decline" ? "Declining…" : "Confirm Decline"}
                </button>
              </div>
            </div>
          )}

          {showInfoForm && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-purple-600">Describe the information required</p>
              <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 resize-none" rows={3}
                placeholder="e.g. Please provide latest 3 months' bank statements…"
                value={infoNote} onChange={e => setInfoNote(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => { setShowInfoForm(false); setInfoNote(""); }} className="flex-1 py-2 rounded-xl text-xs font-bold text-gray-500 bg-white border border-gray-200">Cancel</button>
                <button onClick={() => infoNote && doAction("request_info")} disabled={!infoNote || acting === "request_info"}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: "#8B5CF6" }}>
                  {acting === "request_info" ? "Sending…" : "Send Request"}
                </button>
              </div>
            </div>
          )}

          {!showDeclineForm && !showInfoForm && (
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => doAction("approve")} disabled={acting === "approve"}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-black text-white transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}>
                {acting === "approve" ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                Approve
              </button>
              <button onClick={() => setShowDeclineForm(true)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-black text-white transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg,#EF4444,#DC2626)" }}>
                <XCircle className="w-5 h-5" />
                Decline
              </button>
              <button onClick={() => setShowInfoForm(true)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-black text-white transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg,#8B5CF6,#7C3AED)" }}>
                <MessageSquare className="w-5 h-5" />
                More Info
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────

type AdminView = "dashboard" | "applications" | "contacts" | "newsletter";

export function AdminDashboard({ isOpen, onClose }: Props) {
  const [view, setView] = useState<AdminView>("dashboard");
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [contacts, setContacts] = useState<Record<string,unknown>[]>([]);
  const [newsletters, setNewsletters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.dashboard();
      if (r.success) { setStats(r.data as Record<string,unknown>); setConnected(true); }
    } catch { setConnected(false); }
    setLoading(false);
  }, []);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    const r = await adminApi.list({ type: filterType || undefined, status: filterStatus || undefined, search: search || undefined, page, limit: 15 });
    if (r.success) {
      setApps(r.data as Application[]);
      setTotalPages((r.meta as { pages?: number })?.pages ?? 1);
    }
    setLoading(false);
  }, [filterType, filterStatus, search, page]);

  const loadContacts = useCallback(async () => {
    const r = await adminApi.contacts();
    if (r.success) setContacts(r.data as Record<string,unknown>[]);
  }, []);

  const loadNewsletter = useCallback(async () => {
    const r = await adminApi.newsletter();
    if (r.success) setNewsletters(r.data as string[]);
  }, []);

  useEffect(() => { if (!isOpen) return; loadDashboard(); }, [isOpen, loadDashboard]);
  useEffect(() => { if (view === "applications") loadApplications(); }, [view, loadApplications]);
  useEffect(() => { if (view === "contacts") loadContacts(); }, [view, loadContacts]);
  useEffect(() => { if (view === "newsletter") loadNewsletter(); }, [view, loadNewsletter]);

  const handleAction = async (action: "approve" | "decline" | "request_info" | "assign", data: Record<string, string> = {}) => {
    if (!selectedApp) return;
    const ref = selectedApp.referenceNumber;
    let r;
    if (action === "approve")       r = await adminApi.approve(ref, data.reviewNotes);
    else if (action === "decline")  r = await adminApi.decline(ref, data.reason);
    else if (action === "request_info") r = await adminApi.requestInfo(ref, data.note);
    else                            r = await adminApi.assign(ref, data.assignedTo);

    if (r?.success) {
      showToast(`Application ${ref} ${action === "approve" ? "approved" : action === "decline" ? "declined" : action === "request_info" ? "— more info requested" : "assigned"} ✓`);
      setSelectedApp(r.data as Application);
      await loadApplications();
      await loadDashboard();
    } else {
      showToast(r?.error ?? "Action failed", "error");
    }
  };

  if (!isOpen) return null;

  const s = stats as Record<string, number> | null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl text-sm font-bold text-white shadow-xl transition-all ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <img src={vinkLogo} alt="Vink" className="h-8 w-auto object-contain" />
          <div className="border-l border-gray-200 pl-3">
            <p className="text-sm font-black text-gray-900 leading-none">Admin Dashboard</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Application Review & Approval Centre</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${connected ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-amber-500"}`} />
            {connected ? "Supabase Live" : "Connecting…"}
          </div>
          <button onClick={() => { loadDashboard(); if (view === "applications") loadApplications(); }}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-52 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col py-4 px-2 overflow-y-auto">
          {[
            { id: "dashboard",     label: "Dashboard",      icon: <BarChart3 className="w-4 h-4" />,  badge: null },
            { id: "applications",  label: "Applications",   icon: <FileText className="w-4 h-4" />,   badge: s?.pendingCount ? String(s.pendingCount) : null },
            { id: "contacts",      label: "Contact Forms",  icon: <Mail className="w-4 h-4" />,       badge: null },
            { id: "newsletter",    label: "Newsletter",     icon: <Bell className="w-4 h-4" />,       badge: null },
          ].map(item => (
            <button key={item.id} onClick={() => setView(item.id as AdminView)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left text-sm font-medium mb-0.5 relative"
              style={{ background: view === item.id ? P + "15" : "transparent", color: view === item.id ? P : "#6B7280", fontWeight: view === item.id ? 700 : 400 }}>
              {item.icon}
              <span>{item.label}</span>
              {item.badge && (
                <span className="ml-auto text-[10px] font-black text-white rounded-full w-5 h-5 flex items-center justify-center"
                  style={{ background: "#EF4444" }}>{item.badge}</span>
              )}
            </button>
          ))}

          {/* Quick stats in sidebar */}
          {s && (
            <div className="mt-auto mx-1 mb-1 p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Quick Stats</p>
              {[
                { label: "Pending",     value: s.pendingCount,     color: "#F59E0B" },
                { label: "Approved",    value: s.approvedCount,    color: "#10B981" },
                { label: "Declined",    value: s.declinedCount,    color: "#EF4444" },
                { label: "Total",       value: s.totalApplications, color: P },
              ].map(stat => (
                <div key={stat.label} className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-600">{stat.label}</span>
                  <span className="text-[11px] font-black" style={{ color: stat.color }}>{String(stat.value ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto px-5 py-5 relative">

          {/* ══ DASHBOARD ══ */}
          {view === "dashboard" && (
            <div className="space-y-6 max-w-5xl">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-black text-gray-900">Overview</h1>
                {s?.lastUpdated && <p className="text-xs text-gray-400">Updated {new Date(String(s.lastUpdated)).toLocaleTimeString("en-ZA")}</p>}
              </div>

              {loading && !s ? (
                <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading from Supabase…</span>
                </div>
              ) : (
                <>
                  {/* KPI cards */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      { label: "Total",       value: s?.totalApplications ?? 0,    color: P },
                      { label: "Pending",     value: s?.pendingCount ?? 0,         color: "#F59E0B" },
                      { label: "Under Review",value: s?.underReviewCount ?? 0,     color: "#3B82F6" },
                      { label: "Approved",    value: s?.approvedCount ?? 0,        color: "#10B981" },
                      { label: "Declined",    value: s?.declinedCount ?? 0,        color: "#EF4444" },
                    ].map((kpi, i) => (
                      <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => { setFilterStatus(i === 0 ? "" : ["","pending","under_review","approved","declined"][i]); setView("applications"); }}>
                        <p className="text-3xl font-black" style={{ color: kpi.color }}>{String(kpi.value)}</p>
                        <p className="text-xs font-medium text-gray-500 mt-1">{kpi.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* By type */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h2 className="text-sm font-black text-gray-800 mb-4">Applications by Type</h2>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                      {Object.entries((s?.byType as Record<string,number>) ?? {}).map(([type, count]) => (
                        <button key={type} onClick={() => { setFilterType(type); setFilterStatus(""); setView("applications"); }}
                          className="rounded-xl p-3 text-center hover:shadow-md transition-all cursor-pointer border border-gray-100 hover:border-purple-200">
                          <p className="text-2xl font-black" style={{ color: TYPE_COLORS[type] ?? P }}>{count}</p>
                          <p className="text-[10px] font-semibold text-gray-500 mt-0.5">{TYPE_LABELS[type] ?? type}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pending queue */}
                  {((s?.pendingQueue as Application[]) ?? []).length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-black text-gray-800 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-amber-500" />
                          Pending Queue — Needs Action
                        </h2>
                        <button onClick={() => { setFilterStatus("pending"); setView("applications"); }}
                          className="text-xs font-bold text-purple-600 hover:underline">View all →</button>
                      </div>
                      <div className="space-y-2">
                        {((s?.pendingQueue as Application[]) ?? []).map((app, i) => (
                          <div key={i} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer border border-transparent hover:border-gray-200"
                            onClick={() => { setSelectedApp(app); setView("applications"); }}>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                              style={{ background: TYPE_COLORS[app.type] ?? P }}>
                              {(TYPE_LABELS[app.type] ?? app.type)[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-800 truncate">{app.applicantName}</p>
                              <p className="text-[10px] text-gray-500">{app.referenceNumber} · {TYPE_LABELS[app.type] ?? app.type}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <StatusBadge status={app.status} />
                              <p className="text-[10px] text-gray-400 mt-0.5">{new Date(app.submittedAt).toLocaleDateString("en-ZA")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extra stats */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <p className="text-sm font-black text-gray-800 mb-1">Contact Form Submissions</p>
                      <p className="text-3xl font-black" style={{ color: P }}>{String(s?.totalContacts ?? 0)}</p>
                      <button onClick={() => setView("contacts")} className="text-xs text-purple-600 font-semibold mt-2 hover:underline">View all →</button>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <p className="text-sm font-black text-gray-800 mb-1">Newsletter Subscribers</p>
                      <p className="text-3xl font-black" style={{ color: "#10B981" }}>{String(s?.newsletterSubscribers ?? 0)}</p>
                      <button onClick={() => setView("newsletter")} className="text-xs text-green-600 font-semibold mt-2 hover:underline">View all →</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ APPLICATIONS ══ */}
          {view === "applications" && (
            <div className="space-y-4 max-w-5xl">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-xl font-black text-gray-900">Applications</h1>
                <div className="text-xs text-gray-500">{apps.length} results · Page {page}/{totalPages}</div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2 flex-1 min-w-[200px] border border-gray-200 rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Search name, reference, email…"
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400 bg-white"
                  value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
                  <option value="">All statuses</option>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400 bg-white"
                  value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
                  <option value="">All types</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button onClick={loadApplications} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Applications table */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : apps.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">No applications match your filters.</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {apps.map((app, i) => (
                      <div key={i}
                        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer ${selectedApp?.referenceNumber === app.referenceNumber ? "bg-purple-50" : ""}`}
                        onClick={() => setSelectedApp(selectedApp?.referenceNumber === app.referenceNumber ? null : app)}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                          style={{ background: TYPE_COLORS[app.type] ?? P }}>
                          {(TYPE_LABELS[app.type] ?? app.type)[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{app.applicantName}</p>
                          <p className="text-[11px] text-gray-500">{app.referenceNumber} · {app.applicantEmail || app.applicantPhone}</p>
                        </div>
                        <div className="hidden md:block flex-shrink-0">
                          <p className="text-xs font-semibold text-gray-600">{TYPE_LABELS[app.type] ?? app.type}</p>
                          {app.subType && <p className="text-[10px] text-gray-400">{app.subType}</p>}
                        </div>
                        <div className="flex-shrink-0"><StatusBadge status={app.status} /></div>
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          <p className="text-[10px] text-gray-400">{new Date(app.submittedAt).toLocaleDateString("en-ZA")}</p>
                          {app.assignedTo && <p className="text-[10px] text-gray-500 mt-0.5">→ {app.assignedTo}</p>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-all">← Prev</button>
                  <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-all">Next →</button>
                </div>
              )}
            </div>
          )}

          {/* ══ CONTACTS ══ */}
          {view === "contacts" && (
            <div className="space-y-4 max-w-4xl">
              <h1 className="text-xl font-black text-gray-900">Contact Form Submissions ({contacts.length})</h1>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {contacts.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">No contact submissions yet.</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {contacts.map((c, i) => (
                      <div key={i} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-gray-800">{String(c.name ?? "Unknown")}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{String(c.email ?? "")} · {String(c.phone ?? "")}</p>
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{new Date(String(c.createdAt ?? "")).toLocaleDateString("en-ZA")}</span>
                        </div>
                        <p className="text-xs font-semibold text-gray-700 mt-2">{String(c.subject ?? "(no subject)")}</p>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{String(c.message ?? "")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ NEWSLETTER ══ */}
          {view === "newsletter" && (
            <div className="space-y-4 max-w-4xl">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-black text-gray-900">Newsletter Subscribers ({newsletters.length})</h1>
                <button onClick={() => {
                  const csv = "Email\n" + newsletters.join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "vms-newsletter.csv"; a.click();
                }}
                  className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl text-white transition-all hover:opacity-90"
                  style={{ background: P }}>
                  <Download className="w-3.5 h-3.5" />Export CSV
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {newsletters.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">No subscribers yet.</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {newsletters.map((email, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                          style={{ background: P }}>{email[0].toUpperCase()}</div>
                        <p className="text-sm font-medium text-gray-800">{email}</p>
                        <span className="ml-auto text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-bold">Subscribed</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Detail drawer */}
      {selectedApp && view === "applications" && (
        <AppDetailDrawer
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
