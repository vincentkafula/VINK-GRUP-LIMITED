/**
 * VMS Bank — Admin Applications Dashboard
 * Connected to Supabase via applicationsApi
 */
import { useState, useEffect, useCallback } from "react";
import {
  X, RefreshCw, Search, Filter, CheckCircle, Clock, XCircle,
  AlertTriangle, TrendingUp, Users, FileText, Eye, ChevronDown,
  Download, MoreVertical, Building2, CreditCard, DollarSign,
  Smartphone, Shield, Star, Briefcase,
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import {
  applicationsApi,
  type Application,
  type AppStatus,
  type AppType,
} from "../services/applicationsApi";

interface Props { isOpen: boolean; onClose: () => void; }

const P = "#5B2D8E";
const GOLD = "#F5A623";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<AppStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:              { label: "Pending",          color: "#F59E0B", bg: "#FEF3C7", icon: <Clock className="w-3.5 h-3.5" /> },
  under_review:         { label: "Under Review",     color: "#3B82F6", bg: "#DBEAFE", icon: <Eye className="w-3.5 h-3.5" /> },
  approved:             { label: "Approved",         color: "#10B981", bg: "#D1FAE5", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  declined:             { label: "Declined",         color: "#EF4444", bg: "#FEE2E2", icon: <XCircle className="w-3.5 h-3.5" /> },
  more_info_required:   { label: "More Info Needed", color: "#8B5CF6", bg: "#EDE9FE", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

// ─── Type config ──────────────────────────────────────────────────────────────
const TYPE_CFG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  account:      { label: "Bank Account",    icon: <Building2 className="w-4 h-4" />,   color: "#3949AB" },
  creditCard:   { label: "Credit Card",     icon: <CreditCard className="w-4 h-4" />,  color: "#6B5ED7" },
  loan:         { label: "Personal Loan",   icon: <DollarSign className="w-4 h-4" />,  color: "#E53935" },
  invest:       { label: "Investment",      icon: <TrendingUp className="w-4 h-4" />,  color: "#1565C0" },
  insure:       { label: "Insurance",       icon: <Shield className="w-4 h-4" />,      color: "#2E7D32" },
  rewards:      { label: "Rewards",         icon: <Star className="w-4 h-4" />,        color: "#AB47BC" },
  sim:          { label: "SIM Card",        icon: <Smartphone className="w-4 h-4" />,  color: "#F57C00" },
  businessLoan: { label: "Business Loan",   icon: <Briefcase className="w-4 h-4" />,   color: "#C62828" },
  corporateLoan:{ label: "Corporate Loan",  icon: <Building2 className="w-4 h-4" />,   color: "#4A148C" },
};

const ALL_TYPES = Object.keys(TYPE_CFG);
const ALL_STATUSES: AppStatus[] = ["pending","under_review","approved","declined","more_info_required"];

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: color }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
        <p className="text-xs font-semibold text-gray-500 mt-1">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Application detail panel ─────────────────────────────────────────────────
function ApplicationDetail({ app, onClose, onStatusUpdate }: {
  app: Application; onClose: () => void; onStatusUpdate: (ref: string, status: AppStatus, notes?: string) => void;
}) {
  const [newStatus, setNewStatus] = useState<AppStatus>(app.status);
  const [notes, setNotes] = useState(app.reviewNotes ?? "");
  const [saving, setSaving] = useState(false);
  const sc = STATUS_CFG[app.status];
  const tc = TYPE_CFG[app.type] ?? TYPE_CFG.account;

  const save = async () => {
    setSaving(true);
    await onStatusUpdate(app.referenceNumber, newStatus, notes);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: tc.color }}>
              {tc.icon}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">{app.referenceNumber}</p>
              <p className="text-xs text-gray-500">{tc.label} · {app.subType}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: sc.bg, color: sc.color }}>
              {sc.icon}{sc.label}
            </span>
            <span className="text-xs text-gray-400">Submitted {fmtDate(app.submittedAt)}</span>
          </div>

          {/* Applicant */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Applicant</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-400">Full name</p><p className="font-semibold text-gray-800">{app.applicantName || "—"}</p></div>
              <div><p className="text-xs text-gray-400">Email</p><p className="font-semibold text-gray-800 truncate">{app.applicantEmail || "—"}</p></div>
              <div><p className="text-xs text-gray-400">Phone</p><p className="font-semibold text-gray-800">{app.applicantPhone || "—"}</p></div>
              <div><p className="text-xs text-gray-400">Product</p><p className="font-semibold text-gray-800">{app.subType || "—"}</p></div>
            </div>
          </div>

          {/* Form data */}
          {app.formData && Object.keys(app.formData).length > 0 && (
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Application data</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(app.formData).filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <span className="text-gray-400 capitalize">{k.replace(/([A-Z])/g, " $1").trim()}: </span>
                    <span className="font-medium text-gray-700">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status update */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Update status</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_STATUSES.map(s => {
                const sc2 = STATUS_CFG[s];
                return (
                  <button key={s} onClick={() => setNewStatus(s)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all"
                    style={{ borderColor: newStatus === s ? sc2.color : "#E5E7EB", background: newStatus === s ? sc2.bg : "#FAFAFA", color: newStatus === s ? sc2.color : "#6B7280" }}>
                    {sc2.icon}{sc2.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add review notes or reason for status change…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 resize-none"
            />
            <button onClick={save} disabled={saving || (newStatus === app.status && notes === app.reviewNotes)}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function AdminApplicationsViewer({ isOpen, onClose }: Props) {
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState<AppStatus | "all">("all");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState<"applications" | "stats">("applications");

  const load = useCallback(async () => {
    setLoading(true);
    const [appsRes, statsRes] = await Promise.allSettled([
      applicationsApi.list({
        type: filterType === "all" ? undefined : filterType,
        status: filterStatus === "all" ? undefined : filterStatus,
        page, limit: 20,
      }),
      applicationsApi.stats(),
    ]);
    if (appsRes.status === "fulfilled" && appsRes.value.success) {
      setApps((appsRes.value.data as Application[]) ?? []);
      setTotalPages(appsRes.value.meta?.pages ?? 1);
    }
    if (statsRes.status === "fulfilled" && statsRes.value.success) {
      setStats(statsRes.value.data as Record<string, unknown>);
    }
    setLoading(false);
  }, [filterType, filterStatus, page]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  const handleStatusUpdate = async (ref: string, status: AppStatus, notes?: string) => {
    const result = await applicationsApi.updateStatus(ref, status, notes);
    if (result.success) {
      setApps(prev => prev.map(a => a.referenceNumber === ref ? { ...a, status, reviewNotes: notes } : a));
      if (selectedApp?.referenceNumber === ref) setSelectedApp(a => a ? { ...a, status, reviewNotes: notes } : a);
      load(); // refresh
    }
  };

  const filtered = apps.filter(a =>
    !search ||
    a.applicantName.toLowerCase().includes(search.toLowerCase()) ||
    a.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
    a.applicantEmail.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  const statsByType = stats.byType as Record<string, number> ?? {};
  const statsByStatus = stats.byStatus as Record<string, number> ?? {};

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F8F7FF]">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
            <div className="border-l border-gray-200 pl-3 hidden sm:block">
              <p className="text-sm font-black text-gray-800">Applications Dashboard</p>
              <p className="text-[11px] text-gray-400">VMS Bank · Admin · Supabase Connected</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5">
          {[{ id: "applications", label: "Applications" }, { id: "stats", label: "Analytics" }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as typeof activeTab)}
              className="px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px"
              style={{ borderBottomColor: activeTab === t.id ? P : "transparent", color: activeTab === t.id ? P : "#6B7280" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5 max-w-7xl mx-auto w-full">

        {/* ── ANALYTICS TAB ── */}
        {activeTab === "stats" && (
          <div className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={<FileText className="w-5 h-5" />} label="Total Applications" value={String(stats.totalApplications ?? 0)} color={P} />
              <StatCard icon={<Clock className="w-5 h-5" />} label="Pending Review" value={String(stats.pendingReview ?? 0)} color="#F59E0B" sub="Requires action" />
              <StatCard icon={<Users className="w-5 h-5" />} label="Contact Messages" value={String(stats.totalContacts ?? 0)} color="#3B82F6" />
              <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Newsletter Subs" value={String(stats.newsletterSubscribers ?? 0)} color="#10B981" />
            </div>

            {/* By type */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">Applications by Type</h3>
              <div className="space-y-3">
                {ALL_TYPES.map(t => {
                  const tc = TYPE_CFG[t];
                  const count = statsByType[t] ?? 0;
                  const max = Math.max(...Object.values(statsByType), 1);
                  return (
                    <div key={t} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: tc.color }}>
                        {tc.icon}
                      </div>
                      <p className="text-sm font-medium text-gray-700 w-28 flex-shrink-0">{tc.label}</p>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${(count / max) * 100}%`, background: tc.color }} />
                      </div>
                      <span className="text-sm font-bold text-gray-800 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By status */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">Applications by Status</h3>
              <div className="grid sm:grid-cols-5 gap-3">
                {ALL_STATUSES.map(s => {
                  const sc = STATUS_CFG[s];
                  return (
                    <div key={s} className="rounded-xl p-4 text-center" style={{ background: sc.bg }}>
                      <div className="flex justify-center mb-1" style={{ color: sc.color }}>{sc.icon}</div>
                      <p className="text-xl font-black" style={{ color: sc.color }}>{statsByStatus[s] ?? 0}</p>
                      <p className="text-[10px] font-semibold mt-0.5" style={{ color: sc.color }}>{sc.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── APPLICATIONS TAB ── */}
        {activeTab === "applications" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-white border border-gray-200 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or reference…"
                  className="flex-1 text-sm outline-none bg-transparent text-gray-700" />
              </div>
              {/* Type filter */}
              <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none bg-white">
                <option value="all">All types</option>
                {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_CFG[t].label}</option>)}
              </select>
              {/* Status filter */}
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as AppStatus | "all"); setPage(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none bg-white">
                <option value="all">All statuses</option>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
              </select>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 animate-spin" style={{ color: P }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FileText className="w-12 h-12 text-gray-300 mb-3" />
                <p className="font-semibold text-gray-500">No applications found</p>
                <p className="text-sm text-gray-400 mt-1">
                  {apps.length === 0 ? "Applications submitted via the forms will appear here." : "Try adjusting your search or filters."}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100" style={{ background: "#F8F7FF" }}>
                        {["Reference", "Type", "Applicant", "Product", "Status", "Submitted", "Action"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map(app => {
                        const sc = STATUS_CFG[app.status];
                        const tc = TYPE_CFG[app.type] ?? TYPE_CFG.account;
                        return (
                          <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs font-bold text-gray-800">{app.referenceNumber}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0 text-[10px]"
                                  style={{ background: tc.color }}>{tc.icon}</div>
                                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">{tc.label}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-gray-800 text-xs">{app.applicantName || "—"}</p>
                              <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{app.applicantEmail}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-600 truncate max-w-[120px]">{app.subType || "—"}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap"
                                style={{ background: sc.bg, color: sc.color }}>
                                {sc.icon}{sc.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(app.submittedAt)}</p>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => setSelectedApp(app)}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-90 text-white"
                                style={{ background: P }}>
                                Review
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">← Previous</button>
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next →</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Detail panel ── */}
      {selectedApp && (
        <ApplicationDetail
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </div>
  );
}
