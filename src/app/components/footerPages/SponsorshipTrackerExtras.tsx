import { useState } from "react";
import { toast } from "sonner";
import { CircleAlert, Paperclip, Send, Upload, X, Check, Clock } from "lucide-react";
import { API_BASE } from "../../services/config";
import { FILE_RULES, AWARD_STAGES } from "../../data/sponsorship";
import { ACCEPT, fileProblem, looksLikeItsType, extOf, sizeText, numberOf, money } from "./sponsorshipForm";
import "./contact.css";
import "./sponsorship-form.css";

/** What an applicant can do after applying: see their award, answer a question from the team, and send the final report. */
export interface AwardView { amount: number; currency: string; conditions: string | null; stage: keyof typeof AWARD_STAGES; stageLabel: string; signedOn: string | null; milestones: { title: string; dueDate: string | null; status: string }[]; paid: number; remaining: number }
const day = (iso: string | null) => (iso ? new Date(iso + (iso.length === 10 ? "T00:00:00Z" : "")).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "No date set");
const SEND_FAILED = (email: string) => `We could not send that. Your answers are still here: check your connection and try again, or email ${email}.`;

export function AwardCard({ award }: { award: AwardView }) {
  return (
    <div className="vc-card sf-track" style={{ marginTop: 16 }}>
      <p className="vc-section-eyebrow">Your sponsorship</p>
      <h2 className="vc-card__title">{money(award.amount, award.currency)} awarded</h2>
      <p className="vc-card__lead">{award.stageLabel}{award.signedOn ? ` on ${day(award.signedOn)}` : ". Please sign the agreement we emailed you and return it."}</p>
      {award.conditions && <p className="sf-timeline__msg">{award.conditions}</p>}
      <div className="sf-funding" style={{ marginTop: 14 }}>
        <p className="sf-ok"><Check className="vc-icon" aria-hidden="true" /><span>Paid so far: {money(award.paid, award.currency)}. Still to come: {money(award.remaining, award.currency)}.</span></p>
      </div>
      {award.milestones.length > 0 && (
        <>
          <h3 className="sf-sub" style={{ marginTop: 18 }}>Milestones</h3>
          <ul className="sf-files">{award.milestones.map((m, i) => (
            <li key={i} className="sf-file">{m.status === "done" ? <Check className="vc-icon" aria-hidden="true" /> : <Clock className="vc-icon" aria-hidden="true" />}<span>{m.title}</span><small>{m.status === "done" ? "Done" : m.dueDate ? `Due ${day(m.dueDate)}` : "No date set"}</small></li>))}</ul>
        </>)}
    </div>
  );
}

function Files({ files, setFiles, label, problem, setProblem }: { files: File[]; setFiles: (f: File[]) => void; label: string; problem: string; setProblem: (p: string) => void }) {
  const add = async (list: FileList | null) => {
    if (!list) return; let bad = ""; const next = [...files];
    for (const f of Array.from(list)) {
      const p = fileProblem(f) ?? ((await looksLikeItsType(f)) ? null : `"${f.name}" is not really a ${extOf(f.name).slice(1).toUpperCase()} file`);
      if (p) { bad = p; continue; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= FILE_RULES.maxFiles) { bad = `Attach at most ${FILE_RULES.maxFiles} files`; continue; }
      next.push(f);
    }
    setFiles(next); setProblem(bad);
  };
  return (
    <div className="sf-doc" data-bad={problem ? "true" : undefined}>
      <div className="sf-doc__head">
        <div className="sf-doc__title">{label}</div>
        <label className="vc-btn vc-btn--outline vc-btn--sm" style={{ cursor: "pointer" }}><Upload className="vc-icon" aria-hidden="true" />{files.length ? "Add more" : "Choose files"}
          <input type="file" className="sr-only" multiple accept={ACCEPT} aria-label={`Choose files: ${label}`} onChange={(e) => { void add(e.target.files); e.target.value = ""; }} /></label>
      </div>
      <p className="sf-hint">PDF, DOCX, XLSX, JPG or PNG, up to {FILE_RULES.maxBytes / 1024 / 1024} MB each.</p>
      {files.length > 0 && <ul className="sf-files">{files.map((f, i) => <li key={`${f.name}-${i}`} className="sf-file"><Paperclip className="vc-icon" aria-hidden="true" /><span>{f.name}</span><small>{sizeText(f.size)}</small><button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="vc-icon" aria-hidden="true" style={{ width: 16, height: 16 }} /></button></li>)}</ul>}
      {problem && <p className="sf-err" role="alert"><CircleAlert className="vc-icon" aria-hidden="true" /><span>{problem}</span></p>}
    </div>
  );
}
const Err = ({ id, msg }: { id: string; msg?: string }) => (msg ? <p className="sf-err" id={id} role="alert"><CircleAlert className="vc-icon" aria-hidden="true" /><span>{msg}</span></p> : null);

async function post(path: string, data: unknown, files: File[]): Promise<{ ok: true } | { ok: false; error: string; fields?: Record<string, string> }> {
  const fd = new FormData(); fd.append("data", JSON.stringify(data)); for (const f of files) fd.append("file", f, f.name);
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: fd });
  const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string; fields?: Record<string, string> } | null;
  return res.ok && json?.success ? { ok: true } : { ok: false, error: json?.error ?? "That did not work.", fields: json?.fields };
}

/** Answering "more information required". Nothing moves until the team reads it. */
export function ReplyForm({ refNo, email, supportEmail, onSent }: { refNo: string; email: string; supportEmail: string; onSent: () => void }) {
  const [message, setMessage] = useState(""), [files, setFiles] = useState<File[]>([]), [problem, setProblem] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const send = async () => {
    setError("");
    if (message.trim().length < 5) { setError("Write your reply (at least 5 characters)"); return; }
    setBusy(true);
    try {
      const r = await post("/api/sponsorship/reply", { ref: refNo, email, message }, files);
      if ("error" in r) setError(r.error); else { toast.success("We have your reply."); setMessage(""); setFiles([]); onSent(); }
    } catch { toast.error(SEND_FAILED(supportEmail)); } finally { setBusy(false); }
  };
  return (
    <form className="vc-card" style={{ marginTop: 16 }} noValidate onSubmit={(e) => { e.preventDefault(); void send(); }} aria-label="Reply to our question">
      <h2 className="vc-card__title">We need a little more from you</h2>
      <p className="vc-card__lead">Answer the question above, and attach anything that helps. We will read it and write to you.</p>
      <div className="vc-form-grid">
        <div className="vc-field vc-field--full">
          <label htmlFor="rep-msg">Your reply <span className="vc-req" aria-hidden="true">*</span></label>
          <textarea id="rep-msg" className="vc-textarea" rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "rep-err" : undefined} />
          <Err id="rep-err" msg={error} />
        </div>
        <div className="vc-field vc-field--full"><Files files={files} setFiles={setFiles} label="Files (optional)" problem={problem} setProblem={setProblem} /></div>
        <div className="vc-field vc-field--full"><div><button type="submit" className="vc-btn vc-btn--primary" disabled={busy}><Send className="vc-icon" aria-hidden="true" />{busy ? "Sending…" : "Send my reply"}</button></div></div>
      </div>
    </form>
  );
}

/** The final report: what was delivered of each thing promised, who was reached, what was achieved and spent, with evidence. */
export function ReportForm({ refNo, email, currency, benefits, supportEmail, onSent }: { refNo: string; email: string; currency: string; benefits: { id: string; label: string }[]; supportEmail: string; onSent: () => void }) {
  const [f, setF] = useState({ beneficiaries: "", summary: "", outcomes: "", expenditureNotes: "", spent: "", challenges: "" });
  const [delivered, setDelivered] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]), [problem, setProblem] = useState(""), [errors, setErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); if (errors[k]) setErrors({ ...errors, [k]: "" }); };
  const send = async () => {
    const errs: Record<string, string> = {};
    if (!Number.isInteger(numberOf(f.beneficiaries)) || (numberOf(f.beneficiaries) ?? -1) < 0) errs.beneficiaries = "Enter how many people took part or benefited (a whole number)";
    if (f.summary.trim().length < 30) errs.summary = "Write what was delivered (at least 30 characters)";
    if (f.outcomes.trim().length < 30) errs.outcomes = "Write what was achieved (at least 30 characters)";
    if (f.expenditureNotes.trim().length < 20) errs.expenditureNotes = "Write how the money was spent (at least 20 characters)";
    if (numberOf(f.spent) === null || (numberOf(f.spent) ?? -1) < 0) errs.spent = "Enter the total amount spent";
    for (const b of benefits) if ((delivered[b.id] ?? "").trim().length < 3) errs[`benefitsDelivered.${b.id}`] = `Say what you delivered for "${b.label}" (or why it was not delivered)`;
    if (files.length === 0) errs.documents = "Attach evidence of what was delivered and how the money was spent";
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await post("/api/sponsorship/report", { ref: refNo, email, beneficiaries: numberOf(f.beneficiaries), summary: f.summary, outcomes: f.outcomes, expenditureNotes: f.expenditureNotes, spent: numberOf(f.spent), benefitsDelivered: delivered, challenges: f.challenges }, files);
      if ("error" in r) { setErrors(r.fields ?? { form: r.error }); toast.error(r.error); } else { toast.success("We have your final report."); onSent(); }
    } catch { toast.error(SEND_FAILED(supportEmail)); } finally { setBusy(false); }
  };
  const area = (k: "summary" | "outcomes" | "expenditureNotes" | "challenges", label: string, required: boolean, rows = 4) => (
    <div className="vc-field vc-field--full"><label htmlFor={`rp-${k}`}>{label}{required && <> <span className="vc-req" aria-hidden="true">*</span></>}</label>
      <textarea id={`rp-${k}`} className="vc-textarea" rows={rows} maxLength={3000} value={f[k]} onChange={set(k)} aria-invalid={errors[k] ? true : undefined} aria-describedby={errors[k] ? `rp-${k}-err` : undefined} /><Err id={`rp-${k}-err`} msg={errors[k]} /></div>
  );
  return (
    <form className="vc-card" style={{ marginTop: 16 }} noValidate onSubmit={(e) => { e.preventDefault(); void send(); }} aria-label="Final report">
      <h2 className="vc-card__title">Send your final report</h2>
      <p className="vc-card__lead">Now that the project is finished, tell us what happened. We read every report, and an accepted report completes your sponsorship.</p>
      {errors.form && <Err id="rp-form-err" msg={errors.form} />}
      <div className="vc-form-grid">
        <div className="vc-field"><label htmlFor="rp-beneficiaries">People who took part or benefited <span className="vc-req" aria-hidden="true">*</span></label><input id="rp-beneficiaries" className="vc-input" inputMode="numeric" value={f.beneficiaries} onChange={set("beneficiaries")} aria-invalid={errors.beneficiaries ? true : undefined} /><Err id="rp-ben-err" msg={errors.beneficiaries} /></div>
        <div className="vc-field"><label htmlFor="rp-spent">Total spent ({currency}) <span className="vc-req" aria-hidden="true">*</span></label><input id="rp-spent" className="vc-input" inputMode="decimal" value={f.spent} onChange={set("spent")} aria-invalid={errors.spent ? true : undefined} /><Err id="rp-spent-err" msg={errors.spent} /></div>
        {area("summary", "What was delivered", true)}
        {area("outcomes", "What was achieved", true)}
        {area("expenditureNotes", "How the money was spent", true, 3)}
        {benefits.length > 0 && <div className="vc-field vc-field--full"><h3 className="sf-sub">What you promised VINK, and what you delivered</h3></div>}
        {benefits.map((b) => (
          <div key={b.id} className="vc-field vc-field--full"><label htmlFor={`rp-b-${b.id}`}>{b.label} <span className="vc-req" aria-hidden="true">*</span></label>
            <input id={`rp-b-${b.id}`} className="vc-input" maxLength={500} value={delivered[b.id] ?? ""} onChange={(e) => { setDelivered({ ...delivered, [b.id]: e.target.value }); if (errors[`benefitsDelivered.${b.id}`]) setErrors({ ...errors, [`benefitsDelivered.${b.id}`]: "" }); }} aria-invalid={errors[`benefitsDelivered.${b.id}`] ? true : undefined} />
            <Err id={`rp-b-${b.id}-err`} msg={errors[`benefitsDelivered.${b.id}`]} /></div>))}
        {area("challenges", "Challenges and what you learned (optional)", false, 3)}
        <div className="vc-field vc-field--full"><Files files={files} setFiles={setFiles} label="Evidence: photos, receipts, reports *" problem={problem || errors.documents || ""} setProblem={setProblem} /></div>
        <div className="vc-field vc-field--full"><div><button type="submit" className="vc-btn vc-btn--primary" disabled={busy}><Send className="vc-icon" aria-hidden="true" />{busy ? "Sending…" : "Send the final report"}</button></div></div>
      </div>
    </form>
  );
}
