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
          border: `1.5px solid ${focused ? "#0F3D24" : "#e8e0d3"}`,
          boxShadow: focused ? "0 0 0 3px rgba(15,61,36,0.10)" : "none",
          background: "#fff",
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
            className="shrink-0 text-[11px] font-bold tracking-wide text-[#6b5d5f] hover:text-[#0F3D24] px-1"
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
  const [userNumber, setUserNumber] = useState("");
  const [password, setPassword] = useState("");
  const [pwHidden, setPwHidden] = useState(true);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      if (username === "admin") {
        onSelectDashboard?.("adminBankingPanel");
        return;
      }
      let isManagement = ["superadmin", "owner", "noc_engineer", "billing_admin", "marketplace_admin", "admin"].includes(role);
      // A customer-role account can still be an approved Section Manager —
      // that's granted via section_permissions, not a role change, so check
      // it explicitly rather than assuming role alone tells us everything.
      if (!isManagement) {
        const sections = await rbacApi.mySections();
        if (sections.success && (sections.data?.length ?? 0) > 0) isManagement = true;
      }
      onSelectDashboard?.(isManagement ? "managementPanel" : "account");
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
          <img src={vinkLogo} alt="VINK" className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-3">
            <button className="hidden sm:flex items-center gap-1.5 text-[13px] rounded-full px-3.5 py-2 border border-[#e8e0d3] text-[#6b5d5f] hover:border-[#0F3D24] hover:text-[#0F3D24] transition-colors">
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
            style={{ background: "linear-gradient(160deg,#0F3D24 0%,#0B2E1C 55%,#081A10 100%)" }}
          >
            <div className="absolute -right-24 -bottom-24 w-[340px] h-[340px] rounded-full" style={{ border: "1px solid rgba(255,153,0,0.22)" }} />
            <div className="absolute -right-10 -top-28 w-[260px] h-[260px] rounded-full" style={{ border: "1px solid rgba(255,153,0,0.15)" }} />

            <div className="relative z-10 max-w-[420px]">
              <p className="text-[#FFB84D] text-[12px] font-semibold tracking-[2.5px] uppercase mb-4">Staff portal</p>
              <h1 className="text-white text-[32px] sm:text-[38px] leading-[1.15] font-bold mb-5">
                Welcome back to the tools that keep <span className="text-[#FFB84D]">VINK running</span>
              </h1>
              <p className="text-[#e7d9cd] text-[15px] leading-[1.7] mb-8">
                Staff-only access to Banking, Payments, Marketplace, Mobile Network,
                Vehicle Management and every other section your role covers.
              </p>
              <div className="flex gap-8 flex-wrap">
                {STATS.map((s) => (
                  <div key={s.label} className="pl-3.5" style={{ borderLeft: "2px solid #FF9900" }}>
                    <strong className="block text-white text-[20px] font-bold">{s.value}</strong>
                    <span className="text-[#d8c6b8] text-[11.5px]">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: login card ── */}
          <div className="flex items-center justify-center p-6 sm:p-10" style={{ background: "#fff" }}>
            <div className="w-full max-w-[380px]">
              <h2 className="text-[#5c1420] text-[24px] font-bold mb-1.5">Sign in</h2>
              <p className="text-[13.5px] text-[#6b5d5f] mb-6">
                Enter your staff credentials to access the Management Panel.
              </p>

              {error && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 mb-4 text-[13px]" style={{ background: "#fdecea", border: "1px solid #f3c6c2", color: "#b3261e" }}>
                  <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

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
                      style={{ accentColor: "#0F3D24" }}
                    />
                    Remember username
                  </label>
                  <button type="button" className="text-[#0F3D24] font-semibold hover:underline">
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-[14.5px] transition-opacity disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg,#0F3D24,#0B2E1C)",
                    color: "#fdf3e7",
                    boxShadow: "0 10px 22px -10px rgba(15,61,36,0.6)",
                  }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? "Signing in…" : "Sign in to Management Panel"}
                </button>
              </form>

              <div className="flex items-center gap-3 my-5 text-[11px] uppercase tracking-wide text-[#6b5d5f]">
                <span className="flex-1 h-px" style={{ background: "#e8e0d3" }} />
                <span>Staff access only</span>
                <span className="flex-1 h-px" style={{ background: "#e8e0d3" }} />
              </div>

              <p className="text-center text-[13px] text-[#6b5d5f] mb-5">
                Don't have an account yet? Ask your administrator to create one from
                the Management Panel's Staff section.
              </p>

              <div className="flex items-start gap-2 text-[11.5px] text-[#6b5d5f] leading-[1.5]">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#FF9900]" />
                Never share your login details. VINK will never ask for your password by phone or email.
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2"
          style={{ background: "#0F3D24", borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="text-white/40 text-[11px] text-center sm:text-left">
            © VINK Group. Registered financial services provider.
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
