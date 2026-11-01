import { useEffect, useRef, useState } from "react";
import { CircleAlert, ShieldCheck, Check, Clock, TriangleAlert, X } from "lucide-react";
import { API_BASE } from "../../services/config";
import { getToken } from "../../services/apiClient";
import "./contact.css";
import "./sponsorship-form.css";

/**
/**
 * One card, two checks: "person" (confirming that a real person is applying) and "company" (verifying the BUSINESS behind a business or corporate application: KYB). The company
 * check is the same widget with a company level, in which the applicant adds the business's documents and the details of its directors and owners.
 *
 * Confirming that a real person is applying, for any kind of application (an account, a card, a loan, a sponsorship...). The ID document and the selfie are taken by Sumsub's own widget and go from the applicant's device
 * straight to Sumsub: they never pass through VINK's server. VINK is told only where the check stands (the card shows it), and the page asks again
 * for a short while after the applicant finishes, because Sumsub's answer arrives a few moments later.
 */
export type IdentityStatus = "not_started" | "in_progress" | "pending" | "on_hold" | "approved" | "retry" | "rejected";
/** What the server says about one application's check. `required`: staff cannot approve the application until the identity is confirmed. */
export interface IdentityView { party?: "person" | "company"; enabled: boolean; status: IdentityStatus; canStart: boolean; consentRequired: boolean; required?: boolean; message: string; attempts: number }
export type IdentityKind = "application" | "sponsorship";

const SDK_URL = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
const CONTAINER_ID = "sumsub-websdk-container";
interface SnsBuilder { withConf(c: Record<string, unknown>): SnsBuilder; withOptions(o: Record<string, unknown>): SnsBuilder; on(event: string, cb: (payload?: unknown) => void): SnsBuilder; build(): { launch(selector: string): void } }
declare global { interface Window { snsWebSdk?: { init(token: string, refresh: () => Promise<string>): SnsBuilder } } }

let sdkLoading: Promise<void> | null = null;
/** Loads Sumsub's widget script once. A failed load can be tried again. */
export function loadSumsubSdk(): Promise<void> {
  if (window.snsWebSdk) return Promise.resolve();
  if (!sdkLoading) {
    sdkLoading = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script"); s.src = SDK_URL; s.async = true;
      s.onload = () => (window.snsWebSdk ? resolve() : (sdkLoading = null, reject(new Error("The checker did not start"))));
      s.onerror = () => { sdkLoading = null; s.remove(); reject(new Error("The checker could not be loaded")); };
      document.head.appendChild(s);
    });
  }
  return sdkLoading;
}

const LOOK: Record<IdentityStatus, { tone: "ok" | "bad" | "warn" | "plain"; label: string }> = {
  not_started: { tone: "plain", label: "Not done yet" }, in_progress: { tone: "plain", label: "Started" }, pending: { tone: "plain", label: "Being checked" }, on_hold: { tone: "warn", label: "Taking a little longer" },
  approved: { tone: "ok", label: "Confirmed" }, retry: { tone: "warn", label: "Please try again" }, rejected: { tone: "bad", label: "Could not be confirmed" },
};
/** The company check says "verified", not "confirmed". */
const LOOK_COMPANY: Partial<Record<IdentityStatus, { tone: "ok" | "bad" | "warn" | "plain"; label: string }>> = { approved: { tone: "ok", label: "Verified" }, rejected: { tone: "bad", label: "Could not be verified" } };
const ICON = { ok: Check, bad: X, warn: TriangleAlert, plain: Clock } as const;
const CHECK_AGAIN_MS = [4_000, 12_000, 30_000, 60_000];                  // after the applicant finishes: Sumsub's answer arrives a few moments later

/** `email` may be left out for a signed-in customer: their login proves the application is theirs. */
export function IdentityCard({ identity, kind, party = "person", refNo, email, supportEmail, onChanged }: { identity: IdentityView; kind: IdentityKind; party?: "person" | "company"; refNo: string; email?: string; supportEmail: string; onChanged: () => void }) {
  const company = party === "company", containerId = `${CONTAINER_ID}-${party}`, what = company ? "business verification" : "identity checker";      // each check has its own container, so both can be on one page
  const [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [token, setToken] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged;
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  /** Asks the server for a short-lived token for this applicant's check. */
  const requestToken = async (): Promise<{ token: string } | { error: string }> => {
    const login = getToken();                                              // a signed-in customer is recognised by their login, whether or not they typed the email address
    const res = await fetch(`${API_BASE}/api/identity/token`, { method: "POST", headers: { "Content-Type": "application/json", ...(login ? { Authorization: `Bearer ${login}` } : {}) }, body: JSON.stringify({ kind, ref: refNo, ...(company ? { party } : {}), ...(email ? { email } : {}), consent: true }) });
    const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string; data?: { token?: string } } | null;
    return res.ok && json?.success && json.data?.token ? { token: json.data.token } : { error: json?.error ?? `We could not start the check just now. Please try again, or email ${supportEmail}.` };
  };

  const start = async () => {
    setError("");
    if (identity.consentRequired && !agreed) { setError("Please tick the box to agree before you start."); return; }
    setBusy(true);
    try {
      const t = await requestToken(); if ("error" in t) { setError(t.error); return; }
      await loadSumsubSdk(); setToken(t.token);
    } catch { setError(`We could not load the ${what}. Please check your connection and try again, or email ${supportEmail}.`); }
    finally { setBusy(false); }
  };

  // the widget is launched once its container is on the page; it asks for a new token itself when the first one runs out
  useEffect(() => {
    if (!token || !window.snsWebSdk) return;
    const refresh = async () => { const t = await requestToken(); if ("error" in t) throw new Error(t.error); return t.token; };
    const finished = () => { timers.current.forEach(clearTimeout); timers.current = CHECK_AGAIN_MS.map((ms) => setTimeout(() => onChangedRef.current(), ms)); onChangedRef.current(); };
    try {
      window.snsWebSdk.init(token, refresh).withConf({ lang: "en" }).withOptions({ addViewportTag: false, adaptIframeHeight: true })
        .on("idCheck.onApplicantSubmitted", finished).on("idCheck.onApplicantStatusChanged", finished)
        .on("idCheck.onError", () => setError(`Something went wrong in the ${what}. Please try again, or email ${supportEmail}.`))
        .build().launch(`#${containerId}`);
    } catch { setError(`We could not open the ${what}. Please try again, or email ${supportEmail}.`); setToken(null); }
  }, [token]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!identity.enabled) return null;
  const settled = identity.status === "approved" || identity.status === "rejected";         // a final answer: the widget has nothing more to do
  // once the widget is open the check has started, even before the page has asked the server again
  const working = !!token && (identity.status === "not_started" || identity.status === "in_progress" || identity.status === "retry");
  const look = (company && LOOK_COMPANY[working ? "in_progress" : identity.status]) || LOOK[working ? "in_progress" : identity.status], Icon = ICON[look.tone];
  const verb = identity.status === "retry" ? "Try again" : identity.status === "in_progress" ? "Carry on" : company ? "Verify my business" : "Confirm my identity";
  return (
    <section className="vc-card" style={{ marginTop: 16 }} aria-label={company ? "Verify your business" : "Confirm your identity"}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h2 className="vc-card__title" style={{ marginBottom: 0 }}>{company ? "Verify your business" : "Confirm your identity"}</h2>
        <span className={`sf-status sf-status--${look.tone}`}><Icon className="vc-icon" aria-hidden="true" />{look.label}</span>
      </div>
      <p className="vc-card__lead" role="status">{working ? (company ? "Follow the steps below to add your business's documents and the details of its directors and owners." : "Follow the steps below to send your ID document and a photo of your face.") : identity.message}</p>
      {identity.required && !settled && <p className="vc-form-note" style={{ marginTop: -4, marginBottom: 12 }}><strong>{company ? "We cannot approve your application until your business is verified." : "We cannot approve your application until your identity is confirmed."}</strong></p>}
      {identity.canStart && !token && (
        <div className="vc-form-grid">
          {identity.consentRequired && (
            <fieldset className="sf-consent vc-field vc-field--full">
              <label htmlFor="id-consent"><input id="id-consent" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-describedby={error ? "id-err" : undefined} />
                <span>{company ? "I agree that VINK sends my business's registration documents and details of its directors and owners to Sumsub, our verification provider, so that it can verify the business. Sumsub holds these documents. VINK does not keep them." : "I agree that VINK sends my ID document and a photo of my face to Sumsub, our identity-verification provider, so that it can confirm who I am. Sumsub holds these documents. VINK does not keep them."}</span></label>
            </fieldset>)}
          {error && <p className="sf-err vc-field vc-field--full" id="id-err" role="alert"><CircleAlert className="vc-icon" aria-hidden="true" /><span>{error}</span></p>}
          <div className="vc-field vc-field--full"><div><button type="button" className="vc-btn vc-btn--primary" disabled={busy} onClick={() => void start()}><ShieldCheck className="vc-icon" aria-hidden="true" />{busy ? "Starting…" : verb}</button></div></div>
        </div>)}
      {token && !settled && <>
        {error && <p className="sf-err" id="id-err" role="alert"><CircleAlert className="vc-icon" aria-hidden="true" /><span>{error}</span></p>}
        <div id={containerId} style={{ marginTop: 12, minHeight: 320 }} aria-label={company ? "Business verification" : "Identity check"} />
        <p className="vc-form-note">{company ? "Trouble with your business documents? Email" : "Trouble with the camera or your document? Email"} <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we will help.</p>
      </>}
    </section>
  );
}
