import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2, TriangleAlert } from "lucide-react";
import { authApi } from "../services/apiClient";

/**
 * Landing page for the two emailed links: /reset-password?token=... and /verify-email?token=...
 * The token is read once and immediately removed from the address bar, so it does not stay in browser history or leak through a
 * Referer header. Each token works once on the server.
 */
export function AuthLinkPage({ kind, isOpen, onClose }: { kind: "reset" | "verify"; isOpen: boolean; onClose: () => void }) {
  const [token] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? ""));
  const [state, setState] = useState<"working" | "ready" | "done" | "error">(kind === "verify" ? "working" : "ready");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    window.history.replaceState({}, "", window.location.pathname);       // drop ?token=... from the address bar
  }, [isOpen]);

  // Confirming an address happens on arrival. The ref stops React's development double-run from spending the single-use link twice.
  useEffect(() => {
    if (!isOpen || kind !== "verify" || started.current) return;
    started.current = true;
    if (!token) { setState("error"); setMessage("This link is incomplete. Open the link from your email again."); return; }
    authApi.verifyEmail(token).then((r) => {
      setState(r.success ? "done" : "error");
      setMessage(r.success ? "Your email address is confirmed." : r.error ?? "This link is invalid or has expired.");
    });
  }, [isOpen, kind, token]);

  if (!isOpen) return null;

  const problem = (() => {
    if (password.length < 8) return "Use at least 8 characters.";
    if (password !== confirm) return "The two passwords do not match.";
    return null;
  })();

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    if (problem || !token) { setMessage(problem ?? "This link is incomplete. Open the link from your email again."); return; }
    setBusy(true); setMessage("");
    const r = await authApi.resetPassword(token, password);
    setBusy(false);
    if (r.success) { setState("done"); setMessage("Your password has been changed. You have been signed out everywhere; sign in with the new password."); }
    else setMessage(r.error ?? "We could not reset the password. The link may have expired.");
  };

  const goSignIn = () => { onClose(); window.dispatchEvent(new Event("vink:open-login")); };
  const title = kind === "reset" ? "Choose a new password" : "Confirm your email";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(10,8,30,0.85)" }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[420px] rounded-2xl bg-surface p-8" style={{ boxShadow: "0 40px 100px rgba(0,0,0,0.6)" }}>
        <h1 className="text-[22px] font-bold text-[#5c1420] mb-4">{title}</h1>

        {state === "working" && <p className="flex items-center gap-2 text-[14px] text-[#6b5d5f]"><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</p>}

        {state === "ready" && (
          <form onSubmit={submitReset} noValidate>
            <label className="block text-[12.5px] font-semibold text-[#241416] mb-1.5" htmlFor="new-password">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[#e8e0d3] px-3 py-2.5 text-[14.5px] mb-4" />
            <label className="block text-[12.5px] font-semibold text-[#241416] mb-1.5" htmlFor="confirm-password">Repeat the new password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-[#e8e0d3] px-3 py-2.5 text-[14.5px] mb-4" />
            {message && <p role="alert" className="flex items-start gap-2 text-[13px] mb-4" style={{ color: "#b3261e" }}><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />{message}</p>}
            <button type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-[14.5px] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#2E0B10,#0C0E14)", color: "#fdf3e7" }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}

        {state === "done" && (
          <>
            <p className="flex items-start gap-2 text-[14px] text-[#2E0B10] mb-5"><CheckCircle2 className="w-5 h-5 shrink-0" />{message}</p>
            <button onClick={goSignIn} className="w-full py-3 rounded-lg font-bold text-[14.5px]" style={{ background: "linear-gradient(135deg,#2E0B10,#0C0E14)", color: "#fdf3e7" }}>Sign in</button>
          </>
        )}

        {state === "error" && (
          <>
            <p role="alert" className="flex items-start gap-2 text-[14px] mb-5" style={{ color: "#b3261e" }}><TriangleAlert className="w-5 h-5 shrink-0" />{message}</p>
            <button onClick={onClose} className="w-full py-3 rounded-lg font-bold text-[14.5px] border border-[#e8e0d3] text-[#241416]">Back to the site</button>
          </>
        )}

        {state !== "done" && state !== "error" && (
          <button onClick={onClose} className="block mx-auto mt-4 text-[13px] text-[#6b5d5f] hover:underline">Cancel</button>
        )}
      </div>
    </div>
  );
}
