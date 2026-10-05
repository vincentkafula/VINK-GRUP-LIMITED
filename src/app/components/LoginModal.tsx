import { portalPathForRole } from "./portal/portalDefs";
import { useState, useRef, useEffect } from "react";
import {
  X, Lock, Hash, TriangleAlert, HelpCircle, Loader2, ShieldAlert,
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { authApi } from "../services/apiClient";
import { rbacApi } from "../services/apiClient";
import { demoLogin } from "../services/demoMode";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDashboard?: (id: string) => void;
}

const REMEMBER_KEY = "vink_remember_username";

// Local development convenience only: set VITE_DEV_LOGIN_USER / VITE_DEV_LOGIN_PASSWORD in a git-ignored
// .env.local to open the form pre-filled. Never baked into production builds (guarded by import.meta.env.DEV)
// and no credentials live in source.
const DEFAULT_CUSTOMER = import.meta.env.DEV
  ? { username: import.meta.env.VITE_DEV_LOGIN_USER ?? "", password: import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? "" }
  : { username: "", password: "" };

// ─── Stat strip (mirrors the reference design's promo-stats row) ──────────
const STATS: { value: string; label: string }[] = [
  { value: "256-bit", label: "Encryption" },
  { value: "OTP", label: "Login verification" },
  { value: "Full", label: "Activity audit trail" },
];

// ─── Field: label above icon+input, matching the reference's input-shell ──
function FormField({
  icon, label, value, onChange, type = "text", masked, onToggleMask, autoFocus, id,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  masked?: boolean;
  onToggleMask?: () => void;
  autoFocus?: boolean;
  id: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="mb-[18px]">
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-[#241416] mb-[7px]">
        {label}
      </label>
      <div
        className="flex items-center rounded-lg px-3 transition-colors"
        style={{
          border: `1.5px solid ${focused ? "#2E0B10" : "#e8e0d3"}`,
          boxShadow: focused ? "0 0 0 3px rgba(15,61,36,0.10)" : "none",
          background: "var(--vk-surface)",
        }}
      >
        <span className="shrink-0 text-[#6b5d5f]">{icon}</span>
        <input
          id={id}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          type={masked === undefined ? type : masked ? "password" : "text"}
          autoComplete={type === "password" ? "current-password" : "username"}
          className="w-full bg-transparent outline-none py-3 px-2.5 text-[14.5px] text-[#241416]"
        />
        {onToggleMask && (
          <button
            type="button"
            tabIndex={-1}
            onClick={onToggleMask}
            className="shrink-0 text-[11px] font-bold tracking-wide text-[#6b5d5f] hover:text-[#2E0B10] px-1"
          >
            {masked ? "SHOW" : "HIDE"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
// Visual layer only, redesigned to match a reference split-panel login
// (promo panel + card, labeled icon inputs, remember-username, banner-style
// error) with VINK's own brand colors and staff-portal copy in place of the
// reference's generic bank-template branding. handleSubmit below is
// UNCHANGED from the previous version -- same authApi.login call, same
// demo-mode retry/fallback, same role-based dashboard routing (including
// the admin-vs-superadmin distinction and the section-permission check for
// customer-role Section Managers) -- none of that logic was touched.
export function LoginModal({ isOpen, onClose, onSelectDashboard }: LoginModalProps) {
  // Pre-filled only in local development (see DEFAULT_CUSTOMER). A remembered username still wins.
  const [userNumber, setUserNumber] = useState(DEFAULT_CUSTOMER.username);
  const [password, setPassword] = useState(DEFAULT_CUSTOMER.password);
  const [pwHidden, setPwHidden] = useState(true);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "forgot": asking for a reset link; "sent": told (always, whether or not the address has an account) that an email is on its way.
  const [view, setView] = useState<"login" | "forgot" | "sent">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setLoading(false);
      return;
    }
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setUserNumber(saved);
      setRemember(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotEmail.trim();
    if (!/^[^s@]+@[^s@]+.[^s@]{2,}$/.test(email)) { setError("Enter the email address on your account."); return; }
    setLoading(true); setError(null);
    const r = await authApi.forgotPassword(email);
    setLoading(false);
    if (r.success) setView("sent");
    else setError(r.error ?? "We could not send the email. Please try again.");
  };

  const canSubmit = userNumber.trim().length > 0 && password.trim().length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setError("Enter your username and password to continue.");
      return;
    }
    setLoading(true);
    setError(null);

    let result = await authApi.login(userNumber.trim(), password);

    // A network blip shouldn't be treated as proof this is a customer
    // account — retry before giving up, the same way the health check does.
    if (!result.success && result.error?.toLowerCase().includes("demo mode")) {
      await new Promise(r => setTimeout(r, 1200));
      result = await authApi.login(userNumber.trim(), password);
    }

    if (result.success) {
      setLoading(false);
      if (remember) localStorage.setItem(REMEMBER_KEY, userNumber.trim());
      else localStorage.removeItem(REMEMBER_KEY);
      onClose();
      const user = (result.data as { user?: { username?: string; role?: string } } | undefined)?.user;
      const role = user?.role ?? "";
      const username = user?.username ?? "";
      // "admin" is a distinct account (role "superadmin", confusingly) from
      // "superadmin" (role "owner") -- both are management accounts, but
      // they go to two different dashboards, so username decides which one
      // specifically, not role alone.
      // The five transport account types each have their own dashboard (the server enforces who may open it).
      const portalPath = portalPathForRole(role);
      if (portalPath) { onSelectDashboard?.("portal:" + portalPath.split("/")[2]); return; }
      if (username === "admin") {
        onSelectDashboard?.("adminBankingPanel");
        return;
      }
      let isManagement = ["superadmin", "owner", "noc_engineer", "billing_admin", "admin"].includes(role);
      // A customer-role account can still be an approved Section Manager —
      // that's granted via section_permissions, not a role change, so check
      // it explicitly rather than assuming role alone tells us everything.
      if (!isManagement) {
        const sections = await rbacApi.mySections();
        if (sections.success && (sections.data?.length ?? 0) > 0) isManagement = true;
      }
      // Customer accounts go to their VINK payments & banking dashboard; management
      // accounts go to the Management Panel. The VINK API only accepts customer
      // accounts, so this routing is a convenience, not the access control.
      onSelectDashboard?.(isManagement ? "managementPanel" : role === "customer" ? "manshya" : "account");
      return;
    }

    // Still unreachable after a retry — genuinely fall back to demo mode.
    // Deliberately does NOT guess a dashboard here: we don't know this
    // account's real role when the backend can't be reached, and silently
    // assuming "customer" would send a management account to the wrong
    // dashboard. Demo mode lets the person browse with simulated data
    // instead, without pretending we know who they are.
    if (result.error?.toLowerCase().includes("demo mode")) {
      demoLogin(userNumber.trim());
      setLoading(false);
      onClose();
      onSelectDashboard?.("account");
      return;
    }

    setLoading(false);
    setError(result.error ?? "We couldn't sign you in. Please check your details and try again.");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6"
      style={{ background: "rgba(10,8,30,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="relative w-full overflow-hidden flex flex-col"
        style={{
          maxWidth: 1040,
          maxHeight: "96vh",
          borderRadius: 16,
          background: "#f3ece0",
          border: "1px solid rgba(15,61,36,0.15)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #e8e0d3" }}>
          <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-3">
            <button className="hidden sm:flex items-center gap-1.5 text-[13px] rounded-full px-3.5 py-2 border border-[#e8e0d3] text-[#6b5d5f] hover:border-[#2E0B10] hover:text-[#2E0B10] transition-colors">
              <HelpCircle className="w-3.5 h-3.5" /> Need help signing in?
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/5 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-[#241416]" />
            </button>
          </div>
        </div>

        {/* ── Body: promo panel + login card ── */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden grid lg:grid-cols-[1.05fr_0.95fr]">
          {/* ── Left: promo panel ── */}
          <div
            className="relative overflow-hidden px-8 sm:px-12 py-10 flex flex-col justify-center"
            style={{ background: "linear-gradient(160deg,#2E0B10 0%,#0C0E14 55%,#081A10 100%)" }}
          >
            <div className="absolute -right-24 -bottom-24 w-[340px] h-[340px] rounded-full" style={{ border: "1px solid rgba(255,153,0,0.22)" }} />
            <div className="absolute -right-10 -top-28 w-[260px] h-[260px] rounded-full" style={{ border: "1px solid rgba(255,153,0,0.15)" }} />

            <div className="relative z-10 max-w-[420px]">
              <p className="text-[#FFB84D] text-[12px] font-semibold tracking-[2.5px] uppercase mb-4">Sign in</p>
              <h1 className="text-white text-[32px] sm:text-[38px] leading-[1.15] font-bold mb-5">
                Welcome back to the tools that keep <span className="text-[#FFB84D]">VINK running</span>
              </h1>
              <p className="text-[#e7d9cd] text-[15px] leading-[1.7] mb-8">
                Customers get their VINK payments and banking dashboard.
                Staff get the Management Panel and every section their role covers.
              </p>
              <div className="flex gap-8 flex-wrap">
                {STATS.map((s) => (
                  <div key={s.label} className="pl-3.5" style={{ borderLeft: "2px solid #C9A84C" }}>
                    <strong className="block text-white text-[20px] font-bold">{s.value}</strong>
                    <span className="text-[#d8c6b8] text-[11.5px]">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: login card ── */}
          <div className="flex items-center justify-center p-6 sm:p-10" style={{ background: "var(--vk-surface)" }}>
            <div className="w-full max-w-[380px]">
              <h2 className="text-[#5c1420] text-[24px] font-bold mb-1.5">{view === "login" ? "Sign in" : "Reset your password"}</h2>
              <p className="text-[13.5px] text-[#6b5d5f] mb-6">
                {view === "login"
                  ? "Enter your username and password. Customers go to their VINK dashboard, staff go to the Management Panel."
                  : "Enter the email address on your account and we will send you a link to choose a new password."}
              </p>

              {error && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 mb-4 text-[13px]" style={{ background: "#fdecea", border: "1px solid #f3c6c2", color: "#b3261e" }}>
                  <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {view === "sent" ? (
                <div role="status" className="rounded-lg px-4 py-4 text-[13.5px]" style={{ background: "#eef6f0", border: "1px solid #cfe3d5", color: "#2E0B10" }}>
                  If that address has an account, we have emailed a link to reset the password. It works for one hour. Check your spam folder too.
                  <button type="button" onClick={() => { setView("login"); setError(null); }} className="block mt-3 font-semibold underline">Back to sign in</button>
                </div>
              ) : view === "forgot" ? (
                <form onSubmit={handleForgot} noValidate>
                  <FormField id="vink-forgot-email" icon={<Hash className="w-4 h-4" />} label="Email address" value={forgotEmail} onChange={setForgotEmail} type="email" autoFocus />
                  <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-[14.5px] disabled:opacity-60" style={{ background: "linear-gradient(135deg,#2E0B10,#0C0E14)", color: "#fdf3e7" }}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loading ? "Sending…" : "Email me a reset link"}
                  </button>
                  <button type="button" onClick={() => { setView("login"); setError(null); }} className="block mx-auto mt-4 text-[13px] text-[#2E0B10] font-semibold hover:underline">Back to sign in</button>
                </form>
              ) : (
              <form onSubmit={handleSubmit} noValidate>
                <FormField id="vink-username" icon={<Hash className="w-4 h-4" />} label="Username" value={userNumber} onChange={setUserNumber} autoFocus />
                <FormField
                  id="vink-password"
                  icon={<Lock className="w-4 h-4" />}
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  masked={pwHidden}
                  onToggleMask={() => setPwHidden((v) => !v)}
                />

                <div className="flex items-center justify-between mb-6 text-[13px]">
                  <label className="flex items-center gap-1.5 text-[#6b5d5f] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="w-3.5 h-3.5"
                      style={{ accentColor: "#2E0B10" }}
                    />
                    Remember username
                  </label>
                  <button type="button" onClick={() => { setView("forgot"); setError(null); }} className="text-[#2E0B10] font-semibold hover:underline">
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-[14.5px] transition-opacity disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg,#2E0B10,#0C0E14)",
                    color: "#fdf3e7",
                    boxShadow: "0 10px 22px -10px rgba(15,61,36,0.6)",
                  }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
              )}

              <div className="flex items-center gap-3 my-5 text-[11px] uppercase tracking-wide text-[#6b5d5f]">
                <span className="flex-1 h-px" style={{ background: "#e8e0d3" }} />
                <span>Customers and staff</span>
                <span className="flex-1 h-px" style={{ background: "#e8e0d3" }} />
              </div>

              <p className="text-center text-[13px] text-[#6b5d5f] mb-5">
                Staff accounts are created by an administrator from the Management
                Panel's Staff section.
              </p>

              <div className="flex items-start gap-2 text-[11.5px] text-[#6b5d5f] leading-[1.5]">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#C9A84C]" />
                Never share your login details. VINK will never ask for your password by phone or email.
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2"
          style={{ background: "#2E0B10", borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="text-white/40 text-[11px] text-center sm:text-left">
            © Vink Group. Registered financial services provider.
          </p>
          <div className="flex items-center gap-4 text-white/40 text-[11px]">
            <button className="hover:text-white/70 transition-colors">Terms of use</button>
            <button className="hover:text-white/70 transition-colors">Privacy statement</button>
            <button className="hover:text-white/70 transition-colors">Security centre</button>
          </div>
        </div>
      </div>
    </div>
  );
}
