import { useCallback, useEffect, useState } from "react";
import { Copy, Download, KeyRound, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "../../services/config";
import { authFetch } from "../../services/apiClient";
import { ActionButton, inputCls } from "./ui";
import { setMfaEnrolRequired } from "../../services/mfaFlag";

/**
 * Two-factor sign-in, for the person signed in: switch it on with an authenticator app, keep the one-time recovery codes, and switch it off again.
 *
 * It uses the server's own endpoints (/api/auth/mfa/setup, /enable, /disable). It calls them through authFetch rather than authApi, because the API client treats
 * any 401 on a signed-in call as "your session has expired" and signs the person out, and /mfa/disable answers 401 for a wrong password: a typing mistake would log them out.
 * There is no QR code (that needs a library the site does not have): every authenticator app also takes the key typed in, and phones can open the link.
 */
const COLOR = "#C8102E";
type Res<T> = { ok: true; body: T } | { ok: false; error: string; code?: string };
async function call<T = Record<string, unknown>>(method: "GET" | "POST", path: string, body?: unknown): Promise<Res<T>> {
  try {
    const r = await authFetch(`${API_BASE}/api/auth${path}`, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.success === false) return { ok: false, error: String(j.error ?? `Request failed (${r.status})`), code: typeof j.code === "string" ? j.code : undefined };
    return { ok: true, body: j as T };
  } catch { return { ok: false, error: "We could not reach the server. Please try again." }; }
}

type Step = { kind: "loading" } | { kind: "error"; message: string } | { kind: "off" } | { kind: "setup"; secret: string; uri: string } | { kind: "codes"; codes: string[] } | { kind: "on" };
const grouped = (s: string) => s.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();

export function TwoFactorPanel({ required = false, onChange }: { required?: boolean; onChange?: (enabled: boolean) => void }) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState(""), [pw, setPw] = useState(""), [saved, setSaved] = useState(false), [error, setError] = useState(""), [turningOff, setTurningOff] = useState(false);

  const load = useCallback(async () => {
    const r = await call<{ data?: { mfaEnabled?: boolean } }>("GET", "/me");
    if ("error" in r) setStep({ kind: "error", message: r.error });
    else setStep({ kind: r.body.data?.mfaEnabled ? "on" : "off" });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const start = async () => {
    setError("");
    const r = await call<{ secret: string; otpauthUri: string }>("POST", "/mfa/setup", {});
    if ("error" in r) return { error: r.code === "mfa_unavailable" ? "Two-factor sign-in cannot be switched on yet: the server has no encryption key set (DATA_ENCRYPTION_KEY). Ask whoever looks after the server." : r.error };
    setCode(""); setStep({ kind: "setup", secret: r.body.secret, uri: r.body.otpauthUri });
  };
  const confirm = async () => {
    setError("");
    const r = await call<{ recoveryCodes: string[] }>("POST", "/mfa/enable", { code });
    if ("error" in r) return { error: r.error };
    setMfaEnrolRequired(false); setSaved(false); setCode(""); setStep({ kind: "codes", codes: r.body.recoveryCodes }); onChange?.(true);
  };
  const turnOff = async () => {
    const r = await call("POST", "/mfa/disable", { password: pw, code });
    if ("error" in r) return { error: r.code === "mfa_required_for_staff" ? "Staff accounts must keep two-factor sign-in on. This is a rule set for the whole platform." : r.error };
    setPw(""); setCode(""); setTurningOff(false); setStep({ kind: "off" }); onChange?.(false); toast.success("Two-factor sign-in is off.");
  };

  const copy = (text: string, what: string) => { void navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => undefined); };
  const download = (codes: string[]) => {
    const url = URL.createObjectURL(new Blob([`VINK recovery codes\nEach works once, if you lose your phone. Keep them somewhere safe and private.\n\n${codes.join("\n")}\n`], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = "vink-recovery-codes.txt"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-fg">Two-factor sign-in</h1>
        <p className="text-fg-muted text-sm">Signing in needs your password <em>and</em> a six-digit code from an app on your phone, so a stolen password alone is not enough.</p>
      </div>

      {required && step.kind !== "on" && step.kind !== "codes" && step.kind !== "loading" && (
        <p role="alert" className="bg-surface flex items-start gap-2 rounded-xl border p-3 text-sm text-fg" style={{ borderColor: "var(--vk-warn)", background: "var(--vk-warn-bg)" }}>
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--vk-warn)" }} aria-hidden="true" /><span><strong>Your account must use two-factor sign-in.</strong> Set it up below. It takes about two minutes.</span>
        </p>)}

      {step.kind === "loading" && <p className="text-sm text-fg-muted">Checking…</p>}
      {step.kind === "error" && <p role="alert" className="flex items-center gap-2 text-sm text-bad"><TriangleAlert className="h-4 w-4" aria-hidden="true" />{step.message}</p>}

      {step.kind === "off" && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <p className="flex items-center gap-2 font-bold text-fg"><ShieldAlert className="h-5 w-5" style={{ color: "var(--vk-warn)" }} aria-hidden="true" />Two-factor sign-in is off</p>
          <p className="text-sm text-fg-muted">You will need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or Authy.</p>
          <ActionButton label="Set up two-factor sign-in" color={COLOR} onRun={start} />
        </section>)}

      {step.kind === "setup" && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-4" aria-label="Set up two-factor sign-in">
          <ol className="space-y-4 text-sm text-fg">
            <li><strong>1. Add VINK to your authenticator app.</strong> Choose &ldquo;add an account&rdquo; (or &ldquo;enter a setup key&rdquo;) and type this key. On a phone you can also <a className="underline" href={step.uri}>open it in your authenticator app</a>.
              <span className="mt-2 flex flex-wrap items-center gap-2"><code className="rounded-lg border border-line bg-bg px-3 py-2 font-mono text-base tracking-wider text-fg" aria-label="Setup key">{grouped(step.secret)}</code>
                <button type="button" onClick={() => copy(step.secret, "Key")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-fg"><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy key</button></span>
              <span className="mt-1 block text-xs text-fg-muted">Keep this key private. Anyone who has it can make your codes.</span></li>
            <li><strong>2. Type the six-digit code the app now shows.</strong>
              <label className="mt-2 block max-w-xs"><span className="sr-only">Code from your authenticator app</span>
                <input aria-label="Code from your authenticator app" className={`${inputCls} font-mono text-lg tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} /></label></li>
          </ol>
          <span className="flex flex-wrap items-center gap-3"><ActionButton label="Turn it on" color={COLOR} onRun={confirm} />
            <button type="button" className="text-sm text-fg-muted underline" onClick={() => { setStep({ kind: "off" }); setCode(""); }}>Cancel</button></span>
        </section>)}

      {step.kind === "codes" && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-4" aria-label="Recovery codes">
          <p className="flex items-center gap-2 font-bold text-fg"><ShieldCheck className="h-5 w-5" style={{ color: "var(--vk-ok)" }} aria-hidden="true" />Two-factor sign-in is on</p>
          <div>
            <p className="text-sm font-bold text-fg">Save your recovery codes now.</p>
            <p className="text-sm text-fg-muted">If you lose your phone, each of these signs you in once. <strong>They are shown only this once</strong> and cannot be shown again.</p>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Your recovery codes">{step.codes.map((c) => <li key={c}><code className="block rounded-lg border border-line bg-bg px-2 py-1.5 text-center font-mono text-sm text-fg">{c}</code></li>)}</ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(step.codes.join("\n"), "Codes")} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-fg"><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy all</button>
            <button type="button" onClick={() => download(step.codes)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-fg"><Download className="h-3.5 w-3.5" aria-hidden="true" />Download as a file</button>
          </div>
          <label className="flex items-start gap-2 text-sm text-fg"><input type="checkbox" className="mt-0.5" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have saved these codes somewhere safe and private.</label>
          <button type="button" disabled={!saved} onClick={() => setStep({ kind: "on" })} className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ background: COLOR, color: "#fff" }}>Done</button>
        </section>)}

      {step.kind === "on" && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <p className="flex items-center gap-2 font-bold text-fg"><ShieldCheck className="h-5 w-5" style={{ color: "var(--vk-ok)" }} aria-hidden="true" />Two-factor sign-in is on</p>
          <p className="text-sm text-fg-muted">When you sign in you will be asked for the code from your authenticator app, or for one of your recovery codes.</p>
          {!turningOff ? <button type="button" className="text-sm text-fg-muted underline" onClick={() => { setTurningOff(true); setCode(""); setPw(""); }}>Turn it off…</button> : (
            <form className="space-y-3 rounded-lg border border-line p-3" onSubmit={(e) => e.preventDefault()} aria-label="Turn off two-factor sign-in">
              <p className="flex items-start gap-2 text-sm text-fg"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />To turn it off, enter your password and a current code (or a recovery code). This stops someone who has taken over a signed-in session from removing it.</p>
              <label className="block max-w-sm"><span className="text-xs font-bold text-fg">Your password</span><input aria-label="Current password" type="password" autoComplete="current-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
              <label className="block max-w-sm"><span className="text-xs font-bold text-fg">Code from your app, or a recovery code</span><input aria-label="Code to turn it off" className={`${inputCls} font-mono`} autoComplete="one-time-code" maxLength={16} value={code} onChange={(e) => setCode(e.target.value)} /></label>
              <span className="flex flex-wrap items-center gap-3"><ActionButton label="Turn off two-factor sign-in" color={COLOR} onRun={turnOff} /><button type="button" className="text-sm text-fg-muted underline" onClick={() => setTurningOff(false)}>Keep it on</button></span>
            </form>)}
        </section>)}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}
