/**
 * VMS Banking Management Hub
 * Role-Based Access Control — 7 management levels
 * Global Director → Continental → Regional → Country → State → Branch Manager → Branch Representative
 */
import { useState, useMemo } from "react";
import {
  X, LogIn, Eye, EyeOff, Shield, Users, CreditCard, BarChart3, Settings,
  Globe, MapPin, Building2, FileText, Bell, AlertTriangle, TrendingUp,
  Search, Download, ChevronRight, CheckCircle, Clock, Lock, Activity,
  Layers, Database, Code2, UserCheck, Smartphone, Car, Navigation,
  DollarSign, RefreshCw, Menu, ChevronDown,
} from "lucide-react";

interface Props { isOpen: boolean; onClose: () => void; }

// ─── RBAC types ───────────────────────────────────────────────────────────────
type RoleId = "global_director" | "continental_director" | "regional_director" |
  "country_director" | "state_director" | "branch_manager" | "branch_rep";

interface MgmtUser {
  id: string; name: string; role: RoleId; roleLabel: string;
  scope: string; email: string; password: string; avatar: string;
  level: number; // 1=highest
}

const DEMO_USERS: MgmtUser[] = [
  { id: "u1",  name: "Vincent Kafula",      role: "global_director",       roleLabel: "Global Director",         scope: "Worldwide",       email: "vk@vink.com",         password: "VMS@2025",   avatar: "VK", level: 1 },
  { id: "u2",  name: "Adaeze Okonkwo",      role: "continental_director",  roleLabel: "Continental Director",    scope: "Africa",          email: "adaeze@vink.com",      password: "Africa@123", avatar: "AO", level: 2 },
  { id: "u3",  name: "Sipho Ndlovu",        role: "regional_director",     roleLabel: "Regional Director",       scope: "Southern Africa", email: "sipho@vink.com",       password: "Region@123", avatar: "SN", level: 3 },
  { id: "u4",  name: "Thabo Dlamini",       role: "country_director",      roleLabel: "Country Director",        scope: "South Africa",    email: "thabo@vink.com",       password: "Country@1",  avatar: "TD", level: 4 },
  { id: "u5",  name: "Priya Naidoo",        role: "state_director",        roleLabel: "State / Provincial Dir.", scope: "Western Cape",    email: "priya@vink.com",       password: "State@123",  avatar: "PN", level: 5 },
  { id: "u6",  name: "James van Berg",      role: "branch_manager",        roleLabel: "Branch Manager",          scope: "Cape Town CBD",   email: "james@vink.com",       password: "Branch@1",   avatar: "JV", level: 6 },
  { id: "u7",  name: "Nomsa Zulu",          role: "branch_rep",            roleLabel: "Branch Representative",   scope: "Cape Town CBD",   email: "nomsa@vink.com",       password: "Rep@2025",   avatar: "NZ", level: 7 },
];

// ─── Role permissions ─────────────────────────────────────────────────────────
const ROLE_MODULES: Record<RoleId, string[]> = {
  global_director:      ["overview","users","customers","drivers","passengers","mobile","banking","financial","security","content","notifications","reports","settings","developer","approvals"],
  continental_director: ["overview","customers","banking","financial","security","reports","approvals","notifications"],
  regional_director:    ["overview","customers","banking","financial","reports","approvals","notifications"],
  country_director:     ["overview","customers","banking","financial","reports","approvals","notifications"],
  state_director:       ["overview","customers","banking","reports","approvals","notifications"],
  branch_manager:       ["overview","customers","banking","reports","notifications","approvals"],
  branch_rep:           ["overview","customers","notifications"],
};

// ─── Nav items ────────────────────────────────────────────────────────────────
const ALL_NAV = [
  { id: "overview",      label: "Overview",           icon: <BarChart3 className="w-4 h-4" /> },
  { id: "users",         label: "User Management",    icon: <Users className="w-4 h-4" /> },
  { id: "customers",     label: "Customers",          icon: <UserCheck className="w-4 h-4" /> },
  { id: "drivers",       label: "Drivers",            icon: <Car className="w-4 h-4" /> },
  { id: "passengers",    label: "Passengers",         icon: <Navigation className="w-4 h-4" /> },
  { id: "mobile",        label: "Mobile Subscribers", icon: <Smartphone className="w-4 h-4" /> },
  { id: "banking",       label: "Banking Services",   icon: <CreditCard className="w-4 h-4" /> },
  { id: "financial",     label: "Financial Dashboard",icon: <TrendingUp className="w-4 h-4" /> },
  { id: "security",      label: "Security Center",    icon: <Shield className="w-4 h-4" /> },
  { id: "approvals",     label: "Approvals",          icon: <CheckCircle className="w-4 h-4" /> },
  { id: "content",       label: "Content Management", icon: <FileText className="w-4 h-4" /> },
  { id: "notifications", label: "Notifications",      icon: <Bell className="w-4 h-4" /> },
  { id: "reports",       label: "Reports & Analytics",icon: <Download className="w-4 h-4" /> },
  { id: "settings",      label: "System Settings",    icon: <Settings className="w-4 h-4" /> },
  { id: "developer",     label: "Developer Tools",    icon: <Code2 className="w-4 h-4" /> },
];

const NAVY   = "#0A0F1E";
const DEEP   = "#111827";
const SURF   = "#1E293B";
const P      = "#5B2D8E";
const GOLD   = "#F5A623";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const TEAL   = "#14B8A6";

const ROLE_COLORS: Record<RoleId, string> = {
  global_director:      "#6366F1",
  continental_director: "#8B5CF6",
  regional_director:    "#3B82F6",
  country_director:     "#0891B2",
  state_director:       "#059669",
  branch_manager:       "#D97706",
  branch_rep:           "#6B7280",
};

const SCOPE_ICONS: Record<RoleId, React.ReactNode> = {
  global_director:      <Globe className="w-3.5 h-3.5" />,
  continental_director: <Globe className="w-3.5 h-3.5" />,
  regional_director:    <MapPin className="w-3.5 h-3.5" />,
  country_director:     <MapPin className="w-3.5 h-3.5" />,
  state_director:       <Building2 className="w-3.5 h-3.5" />,
  branch_manager:       <Building2 className="w-3.5 h-3.5" />,
  branch_rep:           <UserCheck className="w-3.5 h-3.5" />,
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="p-4 rounded-2xl" style={{ background: SURF }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + "25", color }}>{icon}</div>
        {sub && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: GREEN + "20", color: GREEN }}>{sub}</span>}
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: SURF }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "#1E2A45" }}>
        <p className="text-sm font-bold text-white">{title}</p>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Row item ─────────────────────────────────────────────────────────────────
function Row({ cols }: { cols: React.ReactNode[] }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      {cols.map((c, i) => <div key={i} className={i === 0 ? "flex-1 min-w-0" : "flex-shrink-0"}>{c}</div>)}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: color + "20", color }}>{text}</span>;
}

// ──────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ──────────────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (user: MgmtUser) => void }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [show,     setShow]     = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    const user = DEMO_USERS.find(u => u.email === email.trim() && u.password === password);
    if (user) { onLogin(user); }
    else { setError("Invalid credentials. Check your email and password."); }
    setLoading(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6" style={{ background: `linear-gradient(135deg, ${NAVY}, #1E0A3E)` }}>
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl"
            style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">Management Hub</h1>
          <p className="text-white/50 text-sm mt-1">VMS Banking · Authorised Access Only</p>
        </div>

        {/* Form */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: SURF, border: "1px solid #1E2A45" }}>
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none"
              style={{ background: DEEP, border: "1px solid #2D2A50" }} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide block mb-1.5">Password</label>
            <div className="relative">
              <input type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="••••••••"
                className="w-full pl-4 pr-11 py-3 rounded-xl text-sm text-white outline-none"
                style={{ background: DEEP, border: "1px solid #2D2A50" }} />
              <button onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: RED + "20", border: `1px solid ${RED}40` }}>
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <button onClick={submit} disabled={loading || !email || !password}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <LogIn className="w-4 h-4" />}
            {loading ? "Authenticating…" : "Sign In to Management Hub"}
          </button>

          {/* Demo credentials */}
          <button onClick={() => setShowDemo(s => !s)}
            className="w-full text-xs text-white/40 hover:text-white/70 transition-colors py-1">
            {showDemo ? "Hide demo credentials ▲" : "Show demo credentials ▼"}
          </button>
          {showDemo && (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "#2D2A50" }}>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide px-3 py-2" style={{ background: DEEP }}>Demo Accounts</p>
              {DEMO_USERS.map(u => (
                <button key={u.id} onClick={() => { setEmail(u.email); setPassword(u.password); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left border-t"
                  style={{ borderColor: "#1E2A45" }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                    style={{ background: ROLE_COLORS[u.role] }}>
                    {u.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[11px] font-semibold truncate">{u.name}</p>
                    <p className="text-gray-500 text-[10px]">{u.roleLabel} · {u.scope}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          🔒 All sessions are encrypted · Activity is monitored and logged
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN: Overview
// ──────────────────────────────────────────────────────────────────────────────
function OverviewScreen({ user }: { user: MgmtUser }) {
  const kpis = [
    { label: "Total Accounts",    value: user.level <= 2 ? "2,841,204" : user.level <= 4 ? "184,420" : "12,840", sub: "+3.2%", color: P,     icon: <Users className="w-5 h-5" /> },
    { label: "Monthly Revenue",   value: user.level <= 2 ? "R266.4B"   : user.level <= 4 ? "R2.8B"   : "R48M",   sub: "+8.1%", color: GREEN, icon: <TrendingUp className="w-5 h-5" /> },
    { label: "Active Sessions",   value: user.level <= 3 ? "48,204"    : user.level <= 5 ? "4,820"   : "284",    sub: "Live",  color: TEAL,  icon: <Activity className="w-5 h-5" /> },
    { label: "Pending Approvals", value: user.level <= 3 ? "1,204"     : user.level <= 5 ? "48"      : "12",     color: GOLD,  icon: <CheckCircle className="w-5 h-5" /> },
  ];

  const recentActivity = [
    { action: "New account opened",    who: "Nomsa Z.",    time: "2m ago",  status: "success" },
    { action: "KYC document submitted",who: "Thabo D.",    time: "8m ago",  status: "pending" },
    { action: "Loan application",       who: "Sipho M.",   time: "14m ago", status: "pending" },
    { action: "Failed login attempt",   who: "Unknown IP", time: "22m ago", status: "warning" },
    { action: "Card blocked",           who: "Priya N.",   time: "1h ago",  status: "warning" },
    { action: "Branch report submitted",who: "James V.",   time: "2h ago",  status: "success" },
  ];

  const approvalQueue = [
    { id: "APR-0041", type: "Loan Application",  amount: "R85,000",  from: "Cape Town CBD", priority: "high" },
    { id: "APR-0042", type: "Account Upgrade",   amount: "Business", from: "Bellville",     priority: "normal" },
    { id: "APR-0043", type: "Large Transfer",    amount: "R250,000", from: "Khayelitsha",   priority: "high" },
    { id: "APR-0044", type: "KYC Verification",  amount: "—",        from: "Observatory",   priority: "normal" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => <Stat key={i} {...k} />)}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent activity */}
        <Section title="Recent Activity" action={<Badge text="Live" color={GREEN} />}>
          <div className="space-y-1">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: a.status === "success" ? GREEN : a.status === "warning" ? GOLD : TEAL }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium">{a.action}</p>
                  <p className="text-gray-500 text-[10px]">{a.who}</p>
                </div>
                <span className="text-gray-500 text-[10px] flex-shrink-0">{a.time}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Approval queue */}
        {ROLE_MODULES[user.role].includes("approvals") && (
          <Section title="Pending Approvals"
            action={<Badge text={approvalQueue.length.toString()} color={GOLD} />}>
            <div className="space-y-2">
              {approvalQueue.map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: DEEP }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-xs font-semibold">{a.type}</p>
                      {a.priority === "high" && <Badge text="High" color={RED} />}
                    </div>
                    <p className="text-gray-500 text-[10px] mt-0.5">{a.id} · {a.from} · {a.amount}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{ background: GREEN }}>✓</button>
                    <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: "#2D2A50", color: "#9CA3AF" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Hierarchy scope indicator */}
      <Section title="Your Access Scope">
        <div className="flex flex-wrap gap-2">
          {DEMO_USERS.map(u => (
            <div key={u.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${u.level >= user.level ? "opacity-100" : "opacity-25"}`}
              style={{ background: u.id === user.id ? ROLE_COLORS[u.role] + "20" : DEEP, borderColor: u.id === user.id ? ROLE_COLORS[u.role] : "#1E2A45" }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                style={{ background: ROLE_COLORS[u.role] }}>
                {u.avatar}
              </div>
              <div>
                <p className="text-white text-[10px] font-semibold">{u.roleLabel}</p>
                <p className="text-gray-500 text-[9px]">{u.scope}</p>
              </div>
              {u.id === user.id && <span className="text-[9px] font-bold text-white ml-1">← You</span>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN: User Management
// ──────────────────────────────────────────────────────────────────────────────
function UsersScreen() {
  const [search, setSearch] = useState("");
  const users = [
    { name: "Vincent Kafula",   email: "vk@vink.com",      role: "Global Director",       status: "active",    last: "Just now" },
    { name: "Adaeze Okonkwo",   email: "adaeze@vink.com",  role: "Continental Director",  status: "active",    last: "5m ago" },
    { name: "Sipho Ndlovu",     email: "sipho@vink.com",   role: "Regional Director",     status: "active",    last: "12m ago" },
    { name: "Thabo Dlamini",    email: "thabo@vink.com",   role: "Country Director",      status: "active",    last: "1h ago" },
    { name: "Priya Naidoo",     email: "priya@vink.com",   role: "State Director",        status: "active",    last: "2h ago" },
    { name: "James van Berg",   email: "james@vink.com",   role: "Branch Manager",        status: "active",    last: "3h ago" },
    { name: "Nomsa Zulu",       email: "nomsa@vink.com",   role: "Branch Representative", status: "suspended", last: "1d ago" },
    { name: "Kwame Mensah",     email: "kwame@vink.com",   role: "Branch Representative", status: "active",    last: "30m ago" },
    { name: "Grace Mwangi",     email: "grace@vink.com",   role: "Branch Manager",        status: "disabled",  last: "7d ago" },
  ];
  const filtered = users.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
  const statusColor = (s: string) => s === "active" ? GREEN : s === "suspended" ? GOLD : RED;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white outline-none"
            style={{ background: SURF, border: "1px solid #1E2A45" }} />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: P }}>
          <Users className="w-4 h-4" />Create User
        </button>
      </div>
      <Section title={`All Users (${filtered.length})`}>
        <div className="space-y-1">
          {filtered.map((u, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                {u.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">{u.name}</p>
                <p className="text-gray-500 text-xs">{u.email}</p>
              </div>
              <Badge text={u.role} color="#6B5ED7" />
              <Badge text={u.status} color={statusColor(u.status)} />
              <p className="text-gray-600 text-[10px] w-16 text-right flex-shrink-0">{u.last}</p>
              <div className="flex gap-1">
                {["Edit","Reset","Suspend"].map(a => (
                  <button key={a} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white/70 hover:text-white transition-colors" style={{ background: "#2D2A50" }}>{a}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN: Customers
// ──────────────────────────────────────────────────────────────────────────────
function CustomersScreen({ user }: { user: MgmtUser }) {
  const customers = [
    { name: "Aisha Patel",     type: "Individual", kyc: "verified",  accounts: 2, balance: "R24,840",  since: "Jan 2023" },
    { name: "Thomas Khumalo",  type: "Individual", kyc: "verified",  accounts: 1, balance: "R8,200",   since: "Mar 2023" },
    { name: "Vink Corp Ltd",   type: "Business",   kyc: "verified",  accounts: 3, balance: "R1.2M",    since: "Jun 2022" },
    { name: "Mpho Sithole",    type: "Individual", kyc: "pending",   accounts: 1, balance: "R4,100",   since: "May 2024" },
    { name: "Green Tech (Pty)",type: "Business",   kyc: "pending",   accounts: 1, balance: "R280,000", since: "Apr 2024" },
    { name: "Johan van Wyk",   type: "Individual", kyc: "rejected",  accounts: 0, balance: "—",        since: "Jun 2024" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[{ label:"Total Customers",value:"184,420",color:P,icon:<Users className="w-5 h-5"/>},
          { label:"KYC Pending",    value:"1,204",  color:GOLD,icon:<Clock className="w-5 h-5"/>},
          { label:"Business Accts", value:"2,840",  color:TEAL,icon:<Building2 className="w-5 h-5"/>}
        ].map((k,i) => <Stat key={i} {...k} />)}
      </div>
      <Section title="Customer Directory" action={<Badge text="184,420 total" color={TEAL} />}>
        <div className="space-y-1">
          {customers.map((c, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                style={{ background: c.type === "Business" ? TEAL : P }}>
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">{c.name}</p>
                <p className="text-gray-500 text-xs">Since {c.since} · {c.accounts} account{c.accounts !== 1 ? "s" : ""}</p>
              </div>
              <Badge text={c.type} color={c.type === "Business" ? TEAL : "#6B7280"} />
              <Badge text={c.kyc} color={c.kyc === "verified" ? GREEN : c.kyc === "pending" ? GOLD : RED} />
              <p className="text-green-400 text-sm font-bold w-20 text-right flex-shrink-0">{c.balance}</p>
              {user.level <= 6 && (
                <div className="flex gap-1">
                  {["View","Edit"].map(a => (
                    <button key={a} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white/70 hover:text-white transition-colors" style={{ background: "#2D2A50" }}>{a}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN: Financial Dashboard
// ──────────────────────────────────────────────────────────────────────────────
function FinancialScreen({ user }: { user: MgmtUser }) {
  const multiplier = user.level <= 2 ? 1000 : user.level <= 4 ? 10 : 1;
  const fmt = (n: number) => n >= 1000000000 ? `R${(n/1000000000).toFixed(1)}B` : n >= 1000000 ? `R${(n/1000000).toFixed(1)}M` : `R${n.toLocaleString()}`;
  const rev = 266400000000 / multiplier;
  const exp = 180000000000 / multiplier;
  const profit = rev - exp;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const chartVals = [42,38,51,47,62,58,74,69,82,78,91,88].map(v => v * multiplier);
  const maxV = Math.max(...chartVals);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:"Total Revenue",  value:fmt(rev),    sub:"+12%", color:GREEN, icon:<TrendingUp className="w-5 h-5"/>},
          { label:"Total Expenses", value:fmt(exp),    sub:"+4%",  color:RED,   icon:<DollarSign className="w-5 h-5"/>},
          { label:"Net Profit",     value:fmt(profit), sub:"+18%", color:TEAL,  icon:<BarChart3 className="w-5 h-5"/>},
          { label:"Txn Volume",     value:user.level<=2?"5.5B":"48M", sub:"Daily",color:GOLD,icon:<Activity className="w-5 h-5"/>},
        ].map((k,i) => <Stat key={i} {...k} />)}
      </div>

      {/* Revenue chart */}
      <Section title="Monthly Revenue Trend">
        <div className="flex items-end gap-1 h-36">
          {chartVals.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-sm transition-all"
                style={{ height: `${(v / maxV) * 120}px`, background: `linear-gradient(180deg,${P},${P}80)` }} />
              <p className="text-[8px] text-gray-500">{months[i]}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Transaction breakdown */}
      <Section title="Transaction Breakdown">
        <div className="space-y-3">
          {[
            { cat: "Card Payments",    vol: "R48.2B", pct: 42, color: P },
            { cat: "EFT Transfers",    vol: "R38.4B", pct: 34, color: TEAL },
            { cat: "AFC Fare Taps",    vol: "R11.0B", pct: 10, color: GREEN },
            { cat: "Loan Disbursements",vol:"R8.2B",  pct: 7,  color: GOLD },
            { cat: "FX Conversions",   vol: "R4.1B",  pct: 4,  color: "#3B82F6" },
            { cat: "Other",            vol: "R3.0B",  pct: 3,  color: "#6B7280" },
          ].map(r => (
            <div key={r.cat}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">{r.cat}</span>
                <span className="font-bold" style={{ color: r.color }}>{r.vol}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1E2A45" }}>
                <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN: Security Center
// ──────────────────────────────────────────────────────────────────────────────
function SecurityScreen() {
  const logs = [
    { event: "Successful login",          user: "VK",  ip: "41.13.42.8",   time: "09:14:22", status: "success" },
    { event: "Failed login (3×)",         user: "?",   ip: "196.14.0.200", time: "09:12:01", status: "danger" },
    { event: "Permission change",         user: "AO",  ip: "41.13.42.9",   time: "08:58:14", status: "warn" },
    { event: "Bulk export (>5k records)", user: "TD",  ip: "102.67.4.22",  time: "08:40:00", status: "warn" },
    { event: "Successful login",          user: "PN",  ip: "41.13.44.1",   time: "08:30:44", status: "success" },
    { event: "Password reset",            user: "NZ",  ip: "41.13.42.8",   time: "08:14:00", status: "info" },
    { event: "Account suspended",         user: "JV",  ip: "41.13.42.8",   time: "07:58:21", status: "warn" },
    { event: "MFA disabled (user req.)",  user: "KM",  ip: "196.14.1.8",   time: "07:30:00", status: "warn" },
  ];
  const c = (s: string) => s==="success"?GREEN:s==="danger"?RED:s==="warn"?GOLD:TEAL;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:"Active Sessions",   value:"4,820",  color:GREEN, icon:<Activity className="w-5 h-5"/>},
          { label:"Failed Logins (24h)",value:"48",    color:RED,   icon:<Lock className="w-5 h-5"/>},
          { label:"Security Alerts",   value:"3",      color:GOLD,  icon:<AlertTriangle className="w-5 h-5"/>},
          { label:"Audit Events Today",value:"1,204",  color:TEAL,  icon:<FileText className="w-5 h-5"/>},
        ].map((k,i) => <Stat key={i} {...k} />)}
      </div>
      <Section title="Audit Log — Last 24 Hours" action={<button className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: P }}>Export</button>}>
        <div className="space-y-1">
          {logs.map((l,i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c(l.status) }} />
              <p className="text-white text-xs flex-1">{l.event}</p>
              <span className="text-gray-500 text-[10px] font-mono w-8">{l.user}</span>
              <span className="text-gray-500 text-[10px] font-mono w-28">{l.ip}</span>
              <span className="text-gray-500 text-[10px] font-mono w-16">{l.time}</span>
              <Badge text={l.status} color={c(l.status)} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN: Reports
// ──────────────────────────────────────────────────────────────────────────────
function ReportsScreen({ user }: { user: MgmtUser }) {
  const reports = [
    { name: "Daily Transaction Summary",    period: "Today",     size: "2.4 MB",  status: "ready" },
    { name: "Weekly Revenue Report",         period: "This week", size: "8.1 MB",  status: "ready" },
    { name: "Monthly Branch Performance",    period: "Jun 2025",  size: "14.2 MB", status: "ready" },
    { name: `${user.scope} KPI Report`,      period: "Jun 2025",  size: "6.8 MB",  status: "ready" },
    { name: "Annual Financial Statement",    period: "2024",      size: "48.0 MB", status: "ready" },
    { name: "Compliance Audit Report",       period: "Q2 2025",   size: "11.4 MB", status: "generating" },
    { name: "Customer Growth Analytics",     period: "Jun 2025",  size: "9.2 MB",  status: "ready" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white font-bold">Reports & Analytics</p>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: P }}>
          <Download className="w-4 h-4" />Generate New
        </button>
      </div>
      <Section title="Available Reports">
        <div className="space-y-2">
          {reports.map((r,i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl" style={{ background: DEEP }}>
              <FileText className="w-5 h-5 flex-shrink-0" style={{ color: P }} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">{r.name}</p>
                <p className="text-gray-500 text-xs">{r.period} · {r.size}</p>
              </div>
              {r.status === "generating"
                ? <span className="text-yellow-400 text-xs font-bold flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" />Generating…</span>
                : <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white" style={{ background: P }}>PDF</button>
                    <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-green-400" style={{ background: GREEN + "20" }}>Excel</button>
                  </div>
              }
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN: Settings
// ──────────────────────────────────────────────────────────────────────────────
function SettingsScreen() {
  const groups = [
    { label:"Branding",         items:["Logo","Colours","Fonts","App Name"] },
    { label:"Languages",        items:["English","Zulu","Xhosa","Sotho","Afrikaans","French","Portuguese"] },
    { label:"Currencies",       items:["ZAR","ZMW","EUR","USD","CNY","MWK","TZS"] },
    { label:"Payment Gateways", items:["Visa","Mastercard","EFT","PayShap","M-Pesa","Nedbank API"] },
    { label:"Security",         items:["MFA Policy","Session Timeout","IP Whitelist","Password Policy"] },
    { label:"Maintenance",      items:["Schedule Maintenance","Backup Now","Restore","Clear Cache"] },
  ];
  return (
    <div className="space-y-4">
      {groups.map(g => (
        <Section key={g.label} title={g.label}>
          <div className="flex flex-wrap gap-2">
            {g.items.map(item => (
              <button key={item} className="px-4 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-all border" style={{ borderColor: "#2D2A50" }}>{item}</button>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// GENERIC SCREEN (for modules without a dedicated view yet)
// ──────────────────────────────────────────────────────────────────────────────
function GenericScreen({ id, user }: { id: string; user: MgmtUser }) {
  const nav = ALL_NAV.find(n => n.id === id);
  const items: Record<string, string[]> = {
    drivers:       ["Driver Registration","Driver Verification","Driver Approval","Vehicle Management","Driver Status","Driver Performance"],
    passengers:    ["Passenger Registration","Verification","Travel History","Booking Records","Complaints"],
    mobile:        ["SIM Registrations","Mobile Wallet Users","Subscription Plans","Device Registrations","Notifications"],
    banking:       ["Accounts","Deposits","Withdrawals","Loans","Credit Services","Insurance","Investments","FX","Cards","Digital Wallets"],
    approvals:     ["Branch Rep → Manager","Manager → State Dir","State → Country Dir","Country → Regional","Regional → Continental","Continental → Global"],
    content:       ["Website Pages","News","Promotions","Documents","FAQs","Policies","Terms & Conditions","Media Library"],
    notifications: ["SMS","Email","Push Notifications","In-App","Broadcast Messaging","Emergency Alerts"],
    developer:     ["API Management","Webhooks","Error Logs","Performance Monitoring","Database (Restricted)","Queue Monitoring","Cache Management"],
  };
  const list = items[id] ?? [];
  return (
    <div className="space-y-4">
      <Section title={nav?.label ?? id}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {list.map((item, i) => (
            <button key={i} className="flex items-center gap-3 p-4 rounded-xl text-left hover:bg-white/5 transition-all border group"
              style={{ background: DEEP, borderColor: "#2D2A50" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
                style={{ background: P + "25", color: P }}>
                {nav?.icon}
              </div>
              <p className="text-white text-xs font-semibold leading-snug">{item}</p>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD SHELL
// ──────────────────────────────────────────────────────────────────────────────
function DashboardShell({ user, onLogout }: { user: MgmtUser; onLogout: () => void }) {
  const [activeScreen, setActiveScreen] = useState("overview");
  const [sidebarOpen, setSidebarOpen]   = useState(true);

  const allowedNav = useMemo(() =>
    ALL_NAV.filter(n => ROLE_MODULES[user.role].includes(n.id)),
    [user.role]
  );

  const roleColor = ROLE_COLORS[user.role];

  const renderScreen = () => {
    switch (activeScreen) {
      case "overview":      return <OverviewScreen user={user} />;
      case "users":         return <UsersScreen />;
      case "customers":     return <CustomersScreen user={user} />;
      case "financial":     return <FinancialScreen user={user} />;
      case "security":      return <SecurityScreen />;
      case "reports":       return <ReportsScreen user={user} />;
      case "settings":      return <SettingsScreen />;
      default:              return <GenericScreen id={activeScreen} user={user} />;
    }
  };

  const currentNav = ALL_NAV.find(n => n.id === activeScreen);

  return (
    <div className="flex-1 flex overflow-hidden" style={{ background: NAVY }}>
      {/* Sidebar */}
      <div className={`flex-shrink-0 flex flex-col transition-all duration-200 border-r ${sidebarOpen ? "w-56" : "w-14"}`}
        style={{ background: DEEP, borderColor: "#1E2A45" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: "#1E2A45" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-black text-xs"
            style={{ background: `linear-gradient(135deg,${P},#9585EA)` }}>V</div>
          {sidebarOpen && <p className="text-white font-black text-sm leading-tight">VMS<br /><span className="font-normal text-[10px] text-gray-400">Management Hub</span></p>}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: "none" }}>
          {allowedNav.map(n => (
            <button key={n.id} onClick={() => setActiveScreen(n.id)}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-all group ${activeScreen === n.id ? "text-white" : "text-gray-500 hover:text-white"}`}
              style={{
                background: activeScreen === n.id ? P + "25" : "transparent",
                borderLeft: activeScreen === n.id ? `3px solid ${P}` : "3px solid transparent",
              }}>
              <span className="flex-shrink-0 w-4 h-4" style={{ color: activeScreen === n.id ? P : undefined }}>{n.icon}</span>
              {sidebarOpen && <span className="text-xs font-medium truncate">{n.label}</span>}
            </button>
          ))}
        </nav>

        {/* User profile */}
        <div className="border-t p-3" style={{ borderColor: "#1E2A45" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
              style={{ background: roleColor }}>{user.avatar}</div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-[11px] font-bold truncate">{user.name}</p>
                <p className="text-[10px] truncate" style={{ color: roleColor }}>{user.roleLabel}</p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button onClick={onLogout} className="w-full mt-2 py-1.5 rounded-lg text-[11px] font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all">
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-5 py-3 border-b flex-shrink-0" style={{ background: DEEP, borderColor: "#1E2A45" }}>
          <button onClick={() => setSidebarOpen(s => !s)} className="text-gray-400 hover:text-white transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-white/40">{currentNav?.icon}</span>
            <p className="text-white font-bold text-sm">{currentNav?.label}</p>
          </div>
          {/* Scope chip */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: roleColor + "20", color: roleColor }}>
            {SCOPE_ICONS[user.role]}
            <span className="text-[11px] font-bold">{user.scope}</span>
          </div>
          {/* Role chip */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: roleColor + "20", color: roleColor }}>
            <Shield className="w-3 h-3" />
            <span className="text-[10px] font-bold">L{user.level} — {user.roleLabel}</span>
          </div>
          <Bell className="w-5 h-5 text-gray-400 cursor-pointer hover:text-white transition-colors" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {renderScreen()}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ROOT EXPORT
// ──────────────────────────────────────────────────────────────────────────────
export function ManagementHub({ isOpen, onClose }: Props) {
  const [user, setUser] = useState<MgmtUser | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: NAVY }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
        style={{ background: DEEP, borderColor: "#1E2A45" }}>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" style={{ color: P }} />
          <p className="text-white font-black text-sm">VMS Management Hub</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1" style={{ background: RED + "25", color: RED }}>
            🔒 SECURE
          </span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!user
        ? <LoginScreen onLogin={u => setUser(u)} />
        : <DashboardShell user={user} onLogout={() => setUser(null)} />
      }
    </div>
  );
}
