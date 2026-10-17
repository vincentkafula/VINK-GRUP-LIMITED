import { useEffect, useRef, useState } from "react";
import { Search, CircleAlert, Clock, Check, TriangleAlert, X } from "lucide-react";
import { API_BASE } from "../../services/config";
import { STATUS_LABELS } from "../../data/sponsorship";
import { AwardCard, ReplyForm, ReportForm, type AwardView } from "./SponsorshipTrackerExtras";
import "./contact.css";
import "./sponsorship-form.css";

export interface Tracked {
  ref: string; status: string; statusLabel: string; project: string; organisation: string; submittedAt: string; updatedAt: string;
  timeline: { kind?: "status" | "reply" | "report"; status: string; label: string; at: string; message: string | null }[];
  /** What this person may do now, and their award once the agreement has been sent. */
  canReply?: boolean; canReport?: boolean; benefits?: { id: string; label: string }[]; award?: AwardView | null;
}
interface Props {
  /** Fills the form in and looks the application up straight away (after sending one). */
  prefill?: { ref: string; email: string } | null;
  /** Where a person can write if the lookup does not work. */
  email: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const tone = (status: string) => (status === "approved" || status === "agreement_pending" || status === "report_accepted" ? "ok" : status === "declined" ? "bad" : status === "more_information_required" || status === "report_returned" ? "warn" : "plain");
const ICON = { ok: Check, bad: X, warn: TriangleAlert, plain: Clock } as const;
const NOT_FOUND = "We could not find an application with that reference and email address. Check both and try again.";

/** Where an application stands, for the person who made it: the reference they were given, and the email address they used. */
export function SponsorshipTracker({ prefill, email }: Props) {
  const [ref, setRef] = useState(prefill?.ref ?? "");
  const [mail, setMail] = useState(prefill?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Tracked | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const lookup = async (r: string, e: string) => {
    setError(""); setResult(null);
    if (!/^sp-[a-z2-9]{6}$/i.test(r.trim())) { setError("Enter your reference number. It starts with SP- and has six more letters or numbers."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e.trim())) { setError("Enter the email address you used on the application."); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/sponsorship/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: r.trim().toUpperCase(), email: e.trim() }) });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string; data?: Tracked } | null;
      if (res.ok && json?.success && json.data) setResult(json.data);
      else setError(res.status === 404 ? NOT_FOUND : json?.error ?? `We could not look that up just now. Please try again, or email ${email}.`);
    } catch { setError(`We could not look that up just now. Please check your connection and try again, or email ${email}.`); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (prefill) { setRef(prefill.ref); setMail(prefill.email); void lookup(prefill.ref, prefill.email); } }, [prefill?.ref, prefill?.email]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (result) { resultRef.current?.closest(".sf-track")?.scrollIntoView?.({ behavior: "smooth", block: "start" }); resultRef.current?.focus({ preventScroll: true }); } }, [result]);   // the result is below the form: bring it into view, not just into focus

  const Icon = result ? ICON[tone(result.status)] : Clock;
  return (
    <div className="vc-panel">
      <div className="vc-panel-grid">
        <div className="vc-side-card">
          <div>
            <p className="vc-section-eyebrow">Track an application</p>
            <h2 className="vc-section-title">Where is my application?</h2>
            <p className="vc-section-lead">Enter the reference number we gave you and the email address you used on the application.</p>
          </div>
        </div>
        <div className="vc-card">
          <h2 className="vc-card__title">Find your application</h2>
          <p className="vc-card__lead">Your reference starts with SP-. It is in the confirmation email we sent.</p>
          <form className="vc-form-grid" noValidate onSubmit={(ev) => { ev.preventDefault(); void lookup(ref, mail); }}>
            <div className="vc-field">
              <label htmlFor="trk-ref">Reference number <span className="vc-req" aria-hidden="true">*</span></label>
              <input className="vc-input" id="trk-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="SP-ABC234" autoComplete="off" spellCheck={false} aria-invalid={error ? true : undefined} aria-describedby={error ? "trk-err" : undefined} />
            </div>
            <div className="vc-field">
              <label htmlFor="trk-email">Email address <span className="vc-req" aria-hidden="true">*</span></label>
              <input className="vc-input" id="trk-email" type="email" value={mail} onChange={(e) => setMail(e.target.value)} autoComplete="email" aria-invalid={error ? true : undefined} aria-describedby={error ? "trk-err" : undefined} />
            </div>
            {error && <div className="vc-field vc-field--full"><p className="sf-err" id="trk-err" role="alert"><CircleAlert className="vc-icon" aria-hidden="true" /><span>{error}</span></p></div>}
            <div className="vc-field vc-field--full"><div><button type="submit" className="vc-btn vc-btn--primary" disabled={busy}><Search className="vc-icon" aria-hidden="true" />{busy ? "Looking…" : "Find my application"}</button></div></div>
          </form>
        </div>
      </div>

      {result && (
        <div className="vc-card sf-track" aria-live="polite">
          <div className="sf-track__head">
            <div>
              <p className="vc-section-eyebrow">{result.ref}</p>
              <h2 className="vc-card__title" ref={resultRef} tabIndex={-1}>{result.project}</h2>
              <p className="vc-card__lead" style={{ marginBottom: 0 }}>{result.organisation} · sent {day(result.submittedAt)}</p>
            </div>
            <span className={`sf-status sf-status--${tone(result.status)}`}><Icon className="vc-icon" aria-hidden="true" />{STATUS_LABELS[result.status as keyof typeof STATUS_LABELS] ?? result.statusLabel}</span>
          </div>
          <ol className="sf-timeline" aria-label="What has happened to your application">
            {[...result.timeline].reverse().map((t, i) => (
              <li key={`${t.status}-${t.at}-${i}`} className={`sf-timeline__item sf-timeline__item--${tone(t.status)}`}>
                <p className="sf-timeline__title"><strong>{t.kind && t.kind !== "status" ? t.label : STATUS_LABELS[t.status as keyof typeof STATUS_LABELS] ?? t.label}</strong><span>{day(t.at)}</span></p>
                {t.message && <p className="sf-timeline__msg">{t.message}</p>}
              </li>))}
          </ol>
          <p className="vc-form-note" style={{ marginTop: 18 }}>VINK reviews applications on a quarterly basis. Successful applicants will be contacted within 6 weeks of the review date. Questions? Email <a href={`mailto:${email}`} style={{ color: "var(--vk-crimson-text)", fontWeight: 600 }}>{email}</a>.</p>
        </div>
      )}
      {result?.award && <AwardCard award={result.award} />}
      {result?.canReply && <ReplyForm refNo={result.ref} email={mail.trim()} supportEmail={email} onSent={() => void lookup(result.ref, mail)} />}
      {result?.canReport && <ReportForm refNo={result.ref} email={mail.trim()} currency={result.award?.currency ?? "ZAR"} benefits={result.benefits ?? []} supportEmail={email} onSent={() => void lookup(result.ref, mail)} />}
    </div>
  );
}
