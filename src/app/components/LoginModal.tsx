import { useState, useRef, useEffect } from "react";
import {
  X, Eye, EyeOff, Lock, Hash, ChevronRight, ShieldCheck,
  TriangleAlert, ShoppingBag, Info, Landmark, HelpCircle, Sparkles,
  Gift, Loader2,
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import siteHeroBg from "../../imports/assets/site-hero-bg.png";
import { authApi } from "../services/apiClient";
import { demoLogin } from "../services/demoMode";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDashboard?: (id: string) => void;
}

// ─── Right-rail info links ──────────────────────────────────────────────────
const INFO_LINKS = [
  { icon: <ShieldCheck className="w-5 h-5" />, title: "Security centre", subtitle: "Security measures and enhancements" },
  { icon: <TriangleAlert className="w-5 h-5" />, title: "Latest scams and schemes", subtitle: "Know what to watch out for" },
  { icon: <ShoppingBag className="w-5 h-5" />, title: "Shop online with ease", subtitle: "Safe, simple online payments" },
  { icon: <Info className="w-5 h-5" />, title: "Useful information", subtitle: "Guides, rates and FAQs" },
  { icon: <Landmark className="w-5 h-5" />, title: "VINK Group", subtitle: "About the group and its services" },
];

// ─── Field wrapper ───────────────────────────────────────────────────────────
function FormField({
  icon, label, hint, value, onChange, type = "text", masked, onToggleMask, inputMode, autoFocus,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  masked?: boolean;
  onToggleMask?: () => void;
  inputMode?: "text" | "numeric";
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <label
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors cursor-text"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: `1px solid ${focused ? "rgba(196,181,253,0.6)" : "rgba(255,255,255,0.14)"}`,
      }}
    >
      <span className="shrink-0" style={{ color: focused ? "#A7E8BD" : "rgba(255,255,255,0.55)" }}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-white text-[15px] font-medium leading-tight">{label}</span>
        {!value && hint && (
          <span className="block text-white/40 text-[11px] leading-tight mt-0.5">{hint}</span>
        )}
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          type={masked === undefined ? type : masked ? "password" : "text"}
          inputMode={inputMode}
          className="w-full bg-transparent outline-none text-white/90 text-sm mt-1 placeholder:text-white/25"
        />
      </span>
      {onToggleMask && (
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggleMask}
          className="shrink-0 text-white/45 hover:text-white/80 transition-colors"
        >
          {masked ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
        </button>
      )}
    </label>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function LoginModal({ isOpen, onClose, onSelectDashboard }: LoginModalProps) {
  const [userNumber, setUserNumber] = useState("");
  const [password, setPassword] = useState("");
  const [pwHidden, setPwHidden] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = userNumber.trim().length > 0 && password.trim().length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setError("Enter your user number and password to continue.");
      return;
    }
    setLoading(true);
    setError(null);

    const result = await authApi.login(userNumber.trim(), password);

    if (result.success) {
      setLoading(false);
      onClose();
      const role = (result.data as { user?: { role?: string } } | undefined)?.user?.role ?? "";
      const isManagement = ["superadmin", "owner", "noc_engineer", "billing_admin", "marketplace_admin", "admin"].includes(role);
      onSelectDashboard?.(isManagement ? "managementPanel" : "account");
      return;
    }

    // Fall back to demo mode if the backend is unreachable
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
          maxWidth: 1180,
          maxHeight: "96vh",
          borderRadius: 20,
          background: "#0B2E1C",
          border: "1px solid rgba(52,168,83,0.25)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.75)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Top bar ── */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span className="text-white/80 text-sm font-semibold tracking-wide">VINK Online Banking</span>
          <div className="flex items-center gap-4">
            <button className="hidden sm:flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-medium transition-colors">
              <HelpCircle className="w-4 h-4" /> Help
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* ── Body: two columns ── */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row" style={{ scrollbarWidth: "thin" }}>
          {/* ── Left: auth panel ── */}
          <div
            className="w-full lg:w-[420px] shrink-0 p-6 sm:p-8 relative overflow-hidden"
            style={{ background: "linear-gradient(160deg,#0F3D24 0%,#0B2E1C 55%,#081A10 100%)" }}
          >
            <img src={siteHeroBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.16] mix-blend-luminosity" />
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full" style={{ background: "radial-gradient(circle,rgba(52,168,83,0.25),transparent 70%)" }} />

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-8">
                <img src={vinkLogo} alt="VINK" className="h-10 w-auto object-contain" />
                <div className="hidden sm:flex items-center gap-2 max-w-[170px] text-right">
                  <Lock className="w-4 h-4 text-white/50 shrink-0" />
                  <span className="text-white/50 text-[11px] leading-tight">Never share your login details with anyone</span>
                </div>
              </div>

              <h2 className="text-white text-[26px] font-bold leading-tight">Welcome back</h2>
              <p className="text-[#A7E8BD] text-sm font-medium mb-6">Log in to your account</p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <FormField
                  icon={<Hash className="w-5 h-5" />}
                  label="Username"
                  value={userNumber}
                  onChange={setUserNumber}
                  autoFocus
                />
                <FormField
                  icon={<Lock className="w-5 h-5" />}
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  masked={pwHidden}
                  onToggleMask={() => setPwHidden(v => !v)}
                />

                {error && (
                  <p className="text-[#F87171] text-xs font-medium pt-1">{error}</p>
                )}

                <div className="flex items-center justify-between pt-3">
                  <button type="button" className="text-[#A7E8BD] text-sm font-semibold hover:underline">
                    Forgot password?
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg,#FF9900,#FFB84D)",
                      color: "white",
                      boxShadow: "0 6px 20px rgba(255,153,0,0.4)",
                    }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Next <ChevronRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Right: info panel ── */}
          <div className="flex-1 bg-[#FAF9FC] p-5 sm:p-8 overflow-y-auto">
            {/* Link list */}
            <div className="rounded-2xl bg-white border border-black/5 shadow-sm overflow-hidden mb-5">
              {INFO_LINKS.map((item, i) => (
                <button
                  key={item.title}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-black/[0.02] transition-colors"
                  style={{ borderBottom: i < INFO_LINKS.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none" }}
                >
                  <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,153,0,0.1)", color: "#FF9900" }}>
                    {item.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[#0F3D24] text-sm font-semibold">{item.title}</span>
                    <span className="block text-black/40 text-xs mt-0.5">{item.subtitle}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-black/30 shrink-0" />
                </button>
              ))}
            </div>

            {/* Promo card */}
            <div className="rounded-2xl p-6 mb-5 relative overflow-hidden" style={{ background: "linear-gradient(135deg,#F3EEFF,#FCEFE9)" }}>
              <div className="relative z-10 max-w-[70%]">
                <p className="text-[#0F3D24] text-lg font-bold leading-snug">VINK Online login has a new look!</p>
                <p className="text-black/50 text-sm mt-1.5 mb-4">But don't worry, it still works the same way.</p>
                <button className="px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: "#0F3D24" }}>
                  Explore more ways
                </button>
              </div>
              <Sparkles className="absolute top-5 right-6 w-8 h-8 text-[#A7E8BD]" />
              <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-2xl rotate-6" style={{ background: "linear-gradient(135deg,#FF9900,#145C34)" }} />
            </div>

            {/* Bottom two-up strip */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white border border-black/5 p-5 flex flex-col gap-3">
                <ShieldCheck className="w-8 h-8 text-[#FF9900]" />
                <p className="text-[#0F3D24] text-sm font-semibold leading-snug">
                  Keep your PINs, passwords and transaction verifications safe.
                </p>
                <button className="self-start px-4 py-2 rounded-lg border border-[#0F3D24] text-[#0F3D24] text-xs font-semibold hover:bg-[#0F3D24] hover:text-white transition-colors">
                  Learn more
                </button>
              </div>
              <div className="rounded-2xl bg-white border border-black/5 p-5 flex flex-col gap-3">
                <Gift className="w-8 h-8 text-[#FF9900]" />
                <p className="text-[#0F3D24] text-sm font-semibold leading-snug">
                  Free rewards, better banking and more value.
                </p>
                <button className="self-start px-4 py-2 rounded-lg border border-[#0F3D24] text-[#0F3D24] text-xs font-semibold hover:bg-[#0F3D24] hover:text-white transition-colors">
                  Learn more
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-2"
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
