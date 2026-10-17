import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Check, CircleAlert, TriangleAlert, Info, Plus, Trash2, X, FileText, Upload, ArrowRight, ArrowLeft, Copy, Mail, CircleCheck, Paperclip, Pencil } from "lucide-react";
import { API_BASE } from "../../services/config";
import { Footer } from "../Footer";
import { departmentByKey } from "../../data/departments";
import { COUNTRIES } from "../../data/countries";
import {
  STEPS, ORG_TYPES, CATEGORIES, BENEFITS, CURRENCIES, LIMITS_ZAR, FILE_RULES, ACCEPT, initialState, validateStep, validateDocuments, validateAll, stepOfField, firstStepWithProblem,
  slotsFor, funding, provinceChoices, fileProblem, looksLikeItsType, extOf, sizeText, buildFormData, saveDraft, loadDraft, clearDraft, isBlank, labelOf, money, rand, saToday,
  type FormState, type Files, type Errors, type Draft,
} from "./sponsorshipForm";
import "./contact.css";
import "./page-kit.css";
import "./sponsorship-form.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called when a person asks to follow the application they just sent. */
  onTrack?: (ref: string, email: string) => void;
}

const EMAIL = departmentByKey("sponsorships")?.address ?? "sponsorships@vink.co.za";
const SEND_FAILED = `We could not send your application. Your answers are still here: check your connection and try again, or email ${EMAIL}.`;

/** The long answers: how short and how long each may be (the same limits the server holds). */
const AREAS: Record<string, { label: string; min: number; max: number; rows: number; hint?: string }> = {
  executiveSummary:   { label: "Executive summary", min: 50, max: 1500, rows: 5, hint: "In a few sentences: what the project is, who it helps and what you are asking VINK for." },
  background:         { label: "Background and objectives", min: 30, max: 3000, rows: 5 },
  problem:            { label: "Problem being addressed", min: 30, max: 2000, rows: 4 },
  targetAudience:     { label: "Target audience and beneficiaries", min: 10, max: 1000, rows: 3 },
  implementationPlan: { label: "Project implementation plan", min: 30, max: 3000, rows: 5, hint: "The main steps, who does them and when." },
  outcomes:           { label: "Expected outcomes and measurable impact", min: 30, max: 3000, rows: 4, hint: "How you will know it worked: numbers where you can." },
  whyVink:            { label: "Why you chose VINK", min: 20, max: 1500, rows: 3 },
  alignment:          { label: "How the sponsorship aligns with VINK's objectives", min: 20, max: 1500, rows: 3 },
  financialControls:  { label: "Financial controls and reporting arrangements", min: 20, max: 2000, rows: 4, hint: "Who approves payments and how you will report back to VINK." },
  benefitsValue:      { label: "The measurable value of the partnership", min: 30, max: 2000, rows: 4, hint: "For example: people reached, attendance, impressions, beneficiaries." },
};

const isBad = (e: Errors, k: string) => (e[k] ? true : undefined);

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p className="sf-err" id={id} role="alert"><CircleAlert className="vc-icon" aria-hidden="true" /><span>{msg}</span></p> : null;
}
function Field({ name, label, required, hint, error, full, children }: { name: string; label: string; required?: boolean; hint?: string; error?: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={`vc-field${full ? " vc-field--full" : ""}`}>
      <label htmlFor={`sf-${name}`}>{label}{required && <> <span className="vc-req" aria-hidden="true">*</span></>}</label>
      {children}
      {hint && !error && <p className="sf-hint" id={`sf-${name}-hint`}>{hint}</p>}
      <Err id={`sf-${name}-err`} msg={error} />
    </div>
  );
}

export function SponsorshipApplicationViewer({ isOpen, onClose, onTrack }: Props) {
  const [s, setS] = useState<FormState>(initialState);
  const [files, setFiles] = useState<Files>({});
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [offer, setOffer] = useState<Draft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ ref: string; email: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const reset = () => { setS(initialState()); setFiles({}); setStep(1); setMaxStep(1); setAttempted(false); setServerErrors({}); setSlotErrors({}); setDone(null); };

  // Opening the form: start fresh after a finished application, and offer a saved draft when nothing has been typed.
  useEffect(() => { if (!isOpen) return; if (done) reset(); setOffer(loadDraft()); }, [isOpen]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Answers are kept on this device as they are typed, so closing the tab does not lose them.
  useEffect(() => {
    if (!isOpen || done) return;
    if (offer && isBlank(s)) return;                       // a saved draft is on offer and nothing has been typed: saving the blank form would delete it
    const t = setTimeout(() => saveDraft(s, step), 500);
    return () => clearTimeout(t);
  }, [s, step, isOpen, done, offer]);
  // A new step: take the reader to its top and to its heading.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    document.getElementById("sf-bar")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, done]);
  // Documents that this applicant no longer needs (they changed the organisation type or the category) are dropped.
  const slots = useMemo(() => slotsFor(s), [s.orgType, s.category]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const allowed = new Set(slots.map((x) => x.id));
    setFiles((f) => (Object.keys(f).every((k) => allowed.has(k)) ? f : Object.fromEntries(Object.entries(f).filter(([k]) => allowed.has(k)))));
  }, [slots]);

  const local = useMemo(() => (step === 6 ? validateDocuments(s, files) : validateStep(step, s)), [step, s, files]);
  const errors: Errors = attempted ? { ...local, ...Object.fromEntries(Object.entries(serverErrors).filter(([k]) => stepOfField(k) === step)) } : {};
  const f = useMemo(() => funding(s), [s]);

  if (!isOpen) return null;

  const set = (patch: Partial<FormState>) => {
    setS((p) => ({ ...p, ...patch }));
    setServerErrors((e) => { const keys = Object.keys(patch); return keys.some((k) => k in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e; });
  };
  const text = (name: keyof FormState) => ({
    id: `sf-${name}`, value: String(s[name] ?? ""), onChange: (e: { target: { value: string } }) => set({ [name]: e.target.value } as Partial<FormState>),
    "aria-invalid": isBad(errors, name), "aria-describedby": errors[name] ? `sf-${name}-err` : `sf-${name}-hint`,
  });

  const focusFirst = (e: Errors) => {
    const targets = Object.keys(e).map((k) => document.getElementById(k === "documents" ? "sf-documents" : k === "expenditure" ? "sf-exp-0" : k.startsWith("consent.") ? `sf-${k.replace(".", "-")}` : `sf-${k}`)).filter(Boolean) as HTMLElement[];
    targets.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    targets[0]?.focus?.(); targets[0]?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };
  const goTo = (n: number) => { setStep(n); setAttempted(false); setMaxStep((m) => Math.max(m, n)); };

  const submit = async () => {
    const all = validateAll(s, files);
    if (Object.keys(all).length) { const n = firstStepWithProblem(all); setAttempted(true); if (n !== step) { goTo(n); setAttempted(true); } else focusFirst(all); toast.error("Some answers need your attention before you can send this."); return; }
    saveDraft(s, step);                                  // kept on this device before anything is sent, so a failed send, or a closed tab, loses nothing
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/sponsorship`, { method: "POST", body: buildFormData(s, files) });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string; fields?: Errors; data?: { ref: string } } | null;
      if (res.ok && json?.success && json.data) { clearDraft(); setDone({ ref: json.data.ref, email: s.email.trim().toLowerCase() }); }
      else if (json?.fields && Object.keys(json.fields).length) { const fields = json.fields; setServerErrors(fields); goTo(firstStepWithProblem(fields)); setAttempted(true); toast.error(json.error ?? "Please correct the highlighted answers."); setTimeout(() => focusFirst(fields), 450); }
      else toast.error(json?.error ?? SEND_FAILED);
    } catch { toast.error(SEND_FAILED); }
    finally { setSubmitting(false); }
  };
  const next = () => {
    if (Object.keys(local).length) { setAttempted(true); setTimeout(() => focusFirst({ ...local, ...Object.fromEntries(Object.entries(serverErrors).filter(([k]) => stepOfField(k) === step)) }), 30); return; }
    if (step === 7) { void submit(); return; }
    goTo(step + 1);
  };

  const addFiles = async (kind: string, list: FileList | File[] | null) => {
    if (!list) return;
    let problem = ""; const mine = [...(files[kind] ?? [])];
    for (const file of Array.from(list)) {
      const p = fileProblem(file) ?? ((await looksLikeItsType(file)) ? null : `"${file.name}" is not really a ${extOf(file.name).slice(1).toUpperCase()} file`);
      if (p) { problem = p; continue; }
      if (mine.some((x) => x.name === file.name && x.size === file.size)) continue;
      const all = Object.values({ ...files, [kind]: [...mine, file] }).flat();
      if (all.length > FILE_RULES.maxFiles) { problem = `Attach at most ${FILE_RULES.maxFiles} files`; continue; }
      if (all.reduce((t, x) => t + x.size, 0) > FILE_RULES.maxTotalBytes) { problem = `The files together are larger than ${FILE_RULES.maxTotalBytes / 1024 / 1024} MB`; continue; }
      mine.push(file);
    }
    setFiles((p) => ({ ...p, [kind]: mine })); setSlotErrors((p) => ({ ...p, [kind]: problem }));
  };
  const removeFile = (kind: string, i: number) => { setFiles((p) => ({ ...p, [kind]: (p[kind] ?? []).filter((_, j) => j !== i) })); setSlotErrors((p) => ({ ...p, [kind]: "" })); };

  const cur = STEPS[step - 1];
  const individual = s.orgType === "individual";
  const provinces = provinceChoices(s.country);
  const hasProblems = Object.keys(errors).length > 0;
  const requiredSlots = slots.filter((x) => x.required);
  const attachedRequired = requiredSlots.filter((x) => files[x.id]?.length).length;

  // ── the sections ─────────────────────────────────────────────────────────
  const area = (name: keyof typeof AREAS & keyof FormState, full = true) => {
    const a = AREAS[name], v = String(s[name] ?? "");
    return (
      <Field key={name} name={name} label={a.label} required={name !== "requestedItems"} full={full} hint={a.hint} error={errors[name]}>
        <textarea className="vc-textarea" rows={a.rows} maxLength={a.max} {...text(name)} />
        <div className="sf-meta"><span className="sf-hint">At least {a.min} characters</span><span className="sf-count" aria-hidden="true">{v.length} / {a.max}</span></div>
      </Field>
    );
  };

  const stepOne = (
    <div className="vc-form-grid">
      <Field name="orgType" label="Type of organisation" required error={errors.orgType}>
        <select className="vc-select" {...text("orgType")} onChange={(e) => set({ orgType: e.target.value })}>
          <option value="">Choose…</option>{ORG_TYPES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </Field>
      <Field name="applicantName" label="Applicant's full legal name" required error={errors.applicantName}><input className="vc-input" autoComplete="name" {...text("applicantName")} /></Field>
      <Field name="organisation" label={individual ? "Organisation (if any)" : "Organisation or registered company name"} required={!individual} error={errors.organisation}><input className="vc-input" autoComplete="organization" {...text("organisation")} /></Field>
      <Field name="registrationNumber" label={s.orgType === "company" ? "Company registration number" : "Registration number (if any)"} required={s.orgType === "company"} error={errors.registrationNumber} hint={s.orgType === "company" ? "For example 2020/123456/07" : "For example your NPO number"}><input className="vc-input" {...text("registrationNumber")} /></Field>
      <Field name="contactPerson" label="Contact person" required error={errors.contactPerson}><input className="vc-input" autoComplete="name" {...text("contactPerson")} /></Field>
      <Field name="email" label="Email address" required error={errors.email} hint="Your confirmation is sent here."><input className="vc-input" type="email" autoComplete="email" {...text("email")} /></Field>
      <Field name="phone" label="Telephone number" required error={errors.phone}><input className="vc-input" type="tel" autoComplete="tel" {...text("phone")} /></Field>
      <div className="vc-field vc-field--full"><h3 className="sf-sub">Where you are</h3></div>
      <Field name="physicalAddress" label="Physical address" required error={errors.physicalAddress} full><input className="vc-input" autoComplete="street-address" {...text("physicalAddress")} /></Field>
      <div className="vc-field vc-field--full">
        <div className="sf-radios"><label><input type="checkbox" checked={s.samePostal} onChange={(e) => set({ samePostal: e.target.checked })} />The postal address is the same as the physical address</label></div>
      </div>
      {!s.samePostal && <Field name="postalAddress" label="Postal address" error={errors.postalAddress} full><input className="vc-input" autoComplete="postal-code" {...text("postalAddress")} /></Field>}
      <Field name="country" label="Country" required error={errors.country}>
        <select className="vc-select" {...text("country")} onChange={(e) => set({ country: e.target.value, province: "" })}>{COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </Field>
      {provinces.length ? (
        <Field name="province" label="Province or region" required error={errors.province}>
          <select className="vc-select" {...text("province")} onChange={(e) => set({ province: e.target.value })}><option value="">Choose…</option>{provinces.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        </Field>
      ) : <Field name="province" label="Province or region" required error={errors.province}><input className="vc-input" {...text("province")} /></Field>}
      <Field name="city" label="City or town" required error={errors.city}><input className="vc-input" autoComplete="address-level2" {...text("city")} /></Field>
      <div className="vc-field vc-field--full"><h3 className="sf-sub">Online and tax status</h3></div>
      <Field name="website" label="Website" error={errors.website} hint="Optional. Start with https://"><input className="vc-input" type="url" inputMode="url" autoComplete="url" {...text("website")} /></Field>
      <Field name="socialLinks" label="Social media links" error={errors.socialLinks} hint="Optional. One link per line."><textarea className="vc-textarea" rows={2} maxLength={500} {...text("socialLinks")} /></Field>
      <fieldset className="vc-field vc-field--full" id="sf-taxStatus" tabIndex={-1} aria-describedby={errors.taxStatus ? "sf-taxStatus-err" : undefined}>
        <legend>Tax-exempt or non-profit status <span className="vc-req" aria-hidden="true">*</span></legend>
        <div className="sf-radios">
          {([["exempt", "Yes, we are tax-exempt or registered as a non-profit"], ["not_exempt", "No"], ["not_applicable", "Not applicable"]] as const).map(([v, l]) => (
            <label key={v}><input type="radio" name="taxStatus" checked={s.taxStatus === v} onChange={() => set({ taxStatus: v })} />{l}</label>))}
        </div>
        <Err id="sf-taxStatus-err" msg={errors.taxStatus} />
      </fieldset>
      {s.taxStatus === "exempt" && <Field name="taxNumber" label="Tax-exemption or non-profit registration number" required error={errors.taxNumber}><input className="vc-input" {...text("taxNumber")} /></Field>}
    </div>
  );

  const stepTwo = (
    <fieldset className="sf-options" id="sf-category" tabIndex={-1} aria-describedby={errors.category ? "sf-category-err" : undefined}>
      <legend className="sr-only">Sponsorship category</legend>
      {CATEGORIES.map((c) => (
        <label key={c.id} className="vc-fb-type"><input type="radio" name="category" checked={s.category === c.id} onChange={() => set({ category: c.id })} /><span>{c.label}</span></label>))}
      <div style={{ gridColumn: "1 / -1" }}><Err id="sf-category-err" msg={errors.category} /><p className="sf-hint" style={{ marginTop: 8 }}>The documents you are asked for in step 6 depend on the category you choose.</p></div>
    </fieldset>
  );

  const stepThree = (
    <div className="vc-form-grid">
      <Field name="projectTitle" label="Project or event title" required error={errors.projectTitle} full><input className="vc-input" maxLength={150} {...text("projectTitle")} /></Field>
      {area("executiveSummary")}{area("background")}{area("problem")}{area("targetAudience")}
      <Field name="geographicArea" label="Geographic area of impact" required error={errors.geographicArea}><input className="vc-input" maxLength={300} {...text("geographicArea")} /></Field>
      <Field name="beneficiaries" label="Expected number of participants or beneficiaries" required error={errors.beneficiaries}><input className="vc-input" inputMode="numeric" {...text("beneficiaries")} /></Field>
      <Field name="startDate" label="Project start date" required error={errors.startDate}><input className="vc-input" type="date" min={saToday()} {...text("startDate")} /></Field>
      <Field name="endDate" label="Project completion date" required error={errors.endDate}><input className="vc-input" type="date" min={s.startDate || saToday()} {...text("endDate")} /></Field>
      {area("implementationPlan")}{area("outcomes")}{area("whyVink")}{area("alignment")}
    </div>
  );

  const amountField = (name: "totalBudget" | "amountRequested" | "ownContribution" | "otherSponsorsAmount", label: string, required: boolean, hint?: string) => (
    <Field name={name} label={label} required={required} error={errors[name]} hint={hint}><div className="sf-money"><span aria-hidden="true">{s.currency}</span><input className="vc-input" inputMode="decimal" autoComplete="off" {...text(name)} /></div></Field>
  );
  const stepFour = (
    <div className="vc-form-grid">
      <div className="vc-field vc-field--full">
        <p className="sf-note"><Info className="vc-icon" aria-hidden="true" /><span>VINK sponsors between {rand(LIMITS_ZAR.min)} and {rand(LIMITS_ZAR.max)} per application. A request in another currency is converted to rand at VINK&apos;s current rate. This form does not ask for bank details.</span></p>
      </div>
      <Field name="currency" label="Currency" required error={errors.currency}>
        <select className="vc-select" {...text("currency")} onChange={(e) => set({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </Field>
      <div />
      {amountField("totalBudget", "Total project budget", true)}
      {amountField("amountRequested", "Sponsorship amount requested from VINK", true)}
      {amountField("ownContribution", "Your own financial contribution", false, "Enter 0 if there is none.")}
      {amountField("otherSponsorsAmount", "Contributions from other sponsors", false, "Enter 0 if there are none.")}
      {(Number(s.otherSponsorsAmount.replace(/[^\d.]/g, "")) > 0 || errors.otherSponsorsNotes) && <Field name="otherSponsorsNotes" label="Who are the other sponsors?" required error={errors.otherSponsorsNotes} full><textarea className="vc-textarea" rows={2} maxLength={500} {...text("otherSponsorsNotes")} /></Field>}

      <div className="vc-field vc-field--full">
        <h3 className="sf-sub" id="sf-exp-title">Detailed expenditure breakdown <span className="vc-req" aria-hidden="true">*</span></h3>
        <div className="sf-rows" role="group" aria-labelledby="sf-exp-title">
          {s.expenditure.map((r, i) => (
            <div className="sf-row" key={r.id}>
              <input className="vc-input" id={i === 0 ? "sf-exp-0" : undefined} aria-label={`Line ${i + 1} description`} placeholder="What the money is for" maxLength={120} value={r.description} aria-invalid={isBad(errors, "expenditure")} onChange={(e) => set({ expenditure: s.expenditure.map((x) => (x.id === r.id ? { ...x, description: e.target.value } : x)) })} />
              <div className="sf-money"><span aria-hidden="true">{s.currency}</span><input className="vc-input" inputMode="decimal" aria-label={`Line ${i + 1} amount`} placeholder="0" value={r.amount} aria-invalid={isBad(errors, "expenditure")} onChange={(e) => set({ expenditure: s.expenditure.map((x) => (x.id === r.id ? { ...x, amount: e.target.value } : x)) })} /></div>
              <button type="button" className="vc-btn vc-btn--outline" aria-label={`Remove line ${i + 1}`} disabled={s.expenditure.length === 1} onClick={() => set({ expenditure: s.expenditure.filter((x) => x.id !== r.id) })}><Trash2 className="vc-icon" aria-hidden="true" /></button>
            </div>))}
        </div>
        <Err id="sf-expenditure-err" msg={errors.expenditure} />
        <div style={{ marginTop: 12 }}><button type="button" className="vc-btn vc-btn--outline vc-btn--sm" onClick={() => set({ expenditure: [...s.expenditure, { id: Math.max(0, ...s.expenditure.map((x) => x.id)) + 1, description: "", amount: "" }] })}><Plus className="vc-icon" aria-hidden="true" />Add a line</button></div>
        <div className="sf-funding" aria-live="polite">
          <p className={Math.abs(f.breakdownDiff) < 0.01 && f.total > 0 ? "sf-ok" : "sf-warn"}>{Math.abs(f.breakdownDiff) < 0.01 && f.total > 0 ? <Check className="vc-icon" aria-hidden="true" /> : <TriangleAlert className="vc-icon" aria-hidden="true" />}<span>Breakdown: {money(f.breakdown, s.currency)} of {money(f.total, s.currency)} total budget{f.total > 0 && Math.abs(f.breakdownDiff) >= 0.01 ? ` (${money(Math.abs(f.breakdownDiff), s.currency)} ${f.breakdownDiff > 0 ? "still to allocate" : "over the budget"})` : f.total > 0 ? ": it matches" : ""}</span></p>
          <p className={f.funded > f.total + 0.009 ? "sf-warn" : f.gap > 0.009 ? "sf-warn" : "sf-ok"}>{f.funded > f.total + 0.009 || f.gap > 0.009 ? <TriangleAlert className="vc-icon" aria-hidden="true" /> : <Check className="vc-icon" aria-hidden="true" />}<span>Funding: {money(f.funded, s.currency)} from VINK, you and other sponsors{f.funded > f.total + 0.009 ? `, which is ${money(f.funded - f.total, s.currency)} more than the budget` : f.gap > 0.009 ? `. ${money(f.gap, s.currency)} of the budget is not yet covered` : f.total > 0 ? ": it covers the budget" : ""}</span></p>
        </div>
      </div>
      <Field name="requestedItems" label="Products, equipment or services you are asking for" error={errors.requestedItems} hint="Optional. List anything you want VINK to supply instead of money." full><textarea className="vc-textarea" rows={3} maxLength={1000} {...text("requestedItems")} /></Field>
      {area("financialControls")}
    </div>
  );

  const stepFive = (
    <div className="vc-form-grid">
      <fieldset className="sf-options sf-options--2 vc-field--full" id="sf-benefits" tabIndex={-1} aria-describedby={errors.benefits ? "sf-benefits-err" : undefined} style={{ gridColumn: "1 / -1" }}>
        <legend>What can you offer VINK in return? <span className="vc-req" aria-hidden="true">*</span> <span className="sf-hint">Choose all that apply.</span></legend>
        {BENEFITS.map((b) => (
          <label key={b.id} className="vc-fb-type"><input type="checkbox" checked={s.benefits.includes(b.id)} onChange={(e) => set({ benefits: e.target.checked ? [...s.benefits, b.id] : s.benefits.filter((x) => x !== b.id) })} /><span>{b.label}</span></label>))}
        <div style={{ gridColumn: "1 / -1" }}><Err id="sf-benefits-err" msg={errors.benefits} /></div>
      </fieldset>
      {area("benefitsValue")}
    </div>
  );

  const stepSix = (
    <div id="sf-documents" tabIndex={-1}>
      <p className="sf-meter" aria-live="polite">{attachedRequired} of {requiredSlots.length} required documents attached</p>
      <div className="sf-note"><Info className="vc-icon" aria-hidden="true" /><span>PDF, DOCX, XLSX, JPG or PNG, up to {FILE_RULES.maxBytes / 1024 / 1024} MB each. Your documents are not saved on this device: if you leave this page you will need to attach them again.</span></div>
      <div className="sf-docs">
        {slots.map((slot) => {
          const mine = files[slot.id] ?? [];
          return (
            <div key={slot.id} className="sf-doc" data-drag={drag === slot.id ? "true" : undefined} data-bad={attempted && slot.required && !mine.length ? "true" : undefined}
              onDragOver={(e) => { e.preventDefault(); setDrag(slot.id); }} onDragLeave={() => setDrag(null)} onDrop={(e) => { e.preventDefault(); setDrag(null); void addFiles(slot.id, e.dataTransfer.files); }}>
              <div className="sf-doc__head">
                <div className="sf-doc__title"><FileText className="vc-icon" aria-hidden="true" style={{ width: 18, height: 18 }} />{slot.label}<span className={`sf-tag${slot.required ? " sf-tag--req" : ""}`}>{slot.required ? "Required" : "Optional"}</span></div>
                <label className="vc-btn vc-btn--outline vc-btn--sm" style={{ cursor: "pointer" }}>
                  <Upload className="vc-icon" aria-hidden="true" />{mine.length ? "Add another" : "Choose files"}
                  <input type="file" className="sr-only" multiple accept={ACCEPT} aria-label={`Choose files for: ${slot.label}`} onChange={(e) => { void addFiles(slot.id, e.target.files); e.target.value = ""; }} />
                </label>
              </div>
              {slot.hint && <p className="sf-hint">{slot.hint}</p>}
              {mine.length > 0 && <ul className="sf-files">{mine.map((file, i) => (
                <li key={`${file.name}-${i}`} className="sf-file"><Paperclip className="vc-icon" aria-hidden="true" /><span>{file.name}</span><small>{sizeText(file.size)}</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(slot.id, i)}><X className="vc-icon" aria-hidden="true" style={{ width: 16, height: 16 }} /></button></li>))}</ul>}
              <Err id={`sf-slot-${slot.id}-err`} msg={slotErrors[slot.id]} />
            </div>);
        })}
      </div>
    </div>
  );

  const row = (label: string, value: ReactNode) => <><dt>{label}</dt><dd>{value || "—"}</dd></>;
  const section = (title: string, n: number, body: ReactNode) => (
    <section><header><h3>{title}</h3><button type="button" className="vc-btn vc-btn--outline vc-btn--sm" onClick={() => goTo(n)} aria-label={`Edit ${title.toLowerCase()}`}><Pencil className="vc-icon" aria-hidden="true" />Edit</button></header><dl>{body}</dl></section>
  );
  const consent = (k: keyof FormState["consent"], body: ReactNode) => (
    <div>
      <label><input type="checkbox" id={`sf-consent-${k}`} checked={s.consent[k]} aria-invalid={isBad(errors, `consent.${k}`)} aria-describedby={errors[`consent.${k}`] ? `sf-consent-${k}-err` : undefined} onChange={(e) => set({ consent: { ...s.consent, [k]: e.target.checked } })} /><span>{body}</span></label>
      <Err id={`sf-consent-${k}-err`} msg={errors[`consent.${k}`]} />
    </div>
  );
  const allDocs = Object.entries(files).flatMap(([kind, list]) => list.map((file) => `${labelOf(slots, kind)}: ${file.name}`));
  const stepSeven = (
    <>
      <div className="sf-review">
        {section("Applicant and organisation", 1, <>{row("Applicant", s.applicantName)}{row("Organisation", s.organisation || (individual ? s.applicantName : ""))}{row("Type", labelOf(ORG_TYPES, s.orgType))}{row("Contact", `${s.contactPerson} · ${s.email} · ${s.phone}`)}{row("Location", [s.city, s.province, s.country].filter(Boolean).join(", "))}</>)}
        {section("Category", 2, <>{row("Support requested", labelOf(CATEGORIES, s.category))}</>)}
        {section("Project", 3, <>{row("Title", s.projectTitle)}{row("Dates", s.startDate && s.endDate ? `${s.startDate} to ${s.endDate}` : "")}{row("Area", s.geographicArea)}{row("Beneficiaries", s.beneficiaries)}</>)}
        {section("Amount and budget", 4, <>{row("Amount requested", money(f.requested, s.currency))}{row("Total project budget", money(f.total, s.currency))}{row("Own and other contributions", money(f.own + f.others, s.currency))}{row("Breakdown lines", String(s.expenditure.length))}</>)}
        {section("What you offer VINK", 5, <>{row("Benefits", s.benefits.map((b) => labelOf(BENEFITS, b)).join(", "))}</>)}
        {section("Documents", 6, <>{row("Attached", allDocs.length ? <>{allDocs.map((d) => <div key={d}>{d}</div>)}</> : "")}</>)}
      </div>
      <fieldset className="sf-consent">
        <legend className="sf-sub">Declaration</legend>
        {consent("accuracy", "I confirm that the information I have given is accurate and complete.")}
        {consent("authorised", "I confirm that I am authorised to apply on behalf of the organisation named above, or that I am applying as an individual.")}
        {consent("terms", <>I accept VINK&apos;s sponsorship terms and have read the <a href="#privacy" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("vink:footer-link", { detail: { label: "Privacy Statement" } })); }}>Privacy Statement</a>.</>)}
        {consent("processing", "I consent to VINK processing the personal information in this application, and the documents I have attached, to assess my request.")}
      </fieldset>
      <p className="vc-form-note" style={{ marginTop: 14 }}>The Privacy Statement opens on its own page. Your answers and documents stay saved here, and you can carry on from the Sponsorship page.</p>
      <div className="sf-hp" aria-hidden="true"><label>Leave this empty<input tabIndex={-1} autoComplete="off" value={s.faxNumber} onChange={(e) => set({ faxNumber: e.target.value })} /></label></div>
    </>
  );

  // ── the page ─────────────────────────────────────────────────────────────
  const stepper = (
    <>
      <p className="sf-stepmeta" aria-live="polite">Step {step} of {STEPS.length}: {cur.short}</p>
      <div className="sf-progress" aria-hidden="true"><span style={{ width: `${(step / STEPS.length) * 100}%` }} /></div>
      <ol className="sf-steps" aria-label="Application steps">
        {STEPS.map((x) => {
          const state = x.n < step ? "done" : x.n === step ? "current" : "todo";
          const can = x.n <= maxStep && x.n !== step;
          return (
            <li key={x.n} className={`sf-step sf-step--${state}${x.n <= maxStep ? " sf-step--seen" : ""}`} aria-current={x.n === step ? "step" : undefined}>
              <button type="button" className="sf-step__btn" disabled={!can} onClick={() => goTo(x.n)} aria-label={`Step ${x.n}: ${x.short}${x.n < step ? " (completed)" : ""}`}>
                <span className="sf-step__n">{x.n < step ? <Check className="vc-icon" aria-hidden="true" /> : x.n}</span><span className="sf-step__label">{x.short}</span>
              </button>
            </li>);
        })}
      </ol>
    </>
  );

  return (
    <div data-theme-aware className="vc fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg">
      <section className="vc-hero sf-hero" aria-labelledby="sf-title">
        <div className="vc-container vc-hero__inner">
          <div className="vc-hero__copy">
            <p className="vc-eyebrow">Sponsorship application</p>
            <h1 id="sf-title">Apply for VINK sponsorship</h1>
            <p>{done ? "Your application has been sent." : cur.lead}</p>
          </div>
        </div>
      </section>

      <div className="vc-tabs-bar" id="sf-bar"><div className="vc-container">{done ? <p className="sf-stepmeta" style={{ display: "block" }}>Application sent</p> : stepper}</div></div>

      <div className="vc-container">
        <nav className="vc-crumbs" aria-label="Breadcrumb">
          <button type="button" onClick={onClose}>Home</button><span aria-hidden="true">/</span>
          <button type="button" onClick={onClose}>Sponsorship</button><span aria-hidden="true">/</span><span aria-current="page">Apply online</span>
        </nav>

        <div className="sf-wrap">
          {done ? (
            <div className="vc-card sf-card sf-done" role="status">
              <span className="sf-done__badge" aria-hidden="true"><CircleCheck className="vc-icon" /></span>
              <h2 ref={headingRef} tabIndex={-1}>Application received</h2>
              <p>Thank you. Keep your reference number: you need it, with your email address, to follow your application.</p>
              <div className="sf-ref" aria-label={`Your reference number is ${done.ref}`}>{done.ref}
                <button type="button" className="vc-btn vc-btn--outline vc-btn--sm" onClick={() => { void navigator.clipboard?.writeText(done.ref).then(() => toast.success("Reference copied"), () => undefined); }}><Copy className="vc-icon" aria-hidden="true" />Copy</button>
              </div>
              <ul className="sf-next">
                <li><Mail className="vc-icon" aria-hidden="true" /><span>A confirmation is on its way to <strong>{done.email}</strong>.</span></li>
                <li><Check className="vc-icon" aria-hidden="true" /><span>VINK reviews applications on a quarterly basis. Successful applicants will be contacted within 6 weeks of the review date.</span></li>
                <li><Check className="vc-icon" aria-hidden="true" /><span>You can follow your application on the Sponsorship page at any time.</span></li>
              </ul>
              <div className="sf-nav" style={{ justifyContent: "center", border: 0, marginTop: 6, paddingTop: 0 }}>
                <button type="button" className="vc-btn vc-btn--primary" onClick={() => onTrack?.(done.ref, done.email)}>Follow this application<ArrowRight className="vc-icon" aria-hidden="true" /></button>
                <button type="button" className="vc-btn vc-btn--outline" onClick={onClose}>Back to Sponsorship</button>
              </div>
            </div>
          ) : (
            <form className="vc-card sf-card" noValidate onSubmit={(e) => { e.preventDefault(); next(); }} key={step}>
              {offer && isBlank(s) && step === 1 && (
                <div className="sf-banner" role="region" aria-label="Saved draft">
                  <p>You have a saved draft from {new Date(offer.savedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })}. Documents are not saved, so you will attach them again.</p>
                  <div>
                    <button type="button" className="vc-btn vc-btn--primary vc-btn--sm" onClick={() => { setS(offer.state); setStep(offer.step); setMaxStep(offer.step); setOffer(null); }}>Continue my draft</button>
                    <button type="button" className="vc-btn vc-btn--outline vc-btn--sm" onClick={() => { clearDraft(); setOffer(null); }}>Start again</button>
                  </div>
                </div>)}
              <h2 className="vc-card__title" ref={headingRef} tabIndex={-1}>{cur.title}</h2>
              <p className="vc-card__lead">Step {step} of {STEPS.length}. Fields marked <span className="vc-req" aria-hidden="true">*</span><span className="sr-only">with an asterisk</span> are required.</p>
              {hasProblems && (
                <div className="sf-summary" role="alert">
                  <TriangleAlert className="vc-icon" aria-hidden="true" />
                  <div><strong>{Object.keys(errors).length === 1 ? "One answer needs your attention" : `${Object.keys(errors).length} answers need your attention`}</strong>
                    <ul>{Object.entries(errors).map(([k, m]) => <li key={k}><button type="button" onClick={() => focusFirst({ [k]: m })}>{m}</button></li>)}</ul>
                  </div>
                </div>)}
              {step === 1 && stepOne}{step === 2 && stepTwo}{step === 3 && stepThree}{step === 4 && stepFour}{step === 5 && stepFive}{step === 6 && stepSix}{step === 7 && stepSeven}
              <div className="sf-nav">
                {step > 1 ? <button type="button" className="vc-btn vc-btn--outline" onClick={() => goTo(step - 1)}><ArrowLeft className="vc-icon" aria-hidden="true" />Back</button> : <button type="button" className="vc-btn vc-btn--outline" onClick={onClose}>Cancel</button>}
                <p className="vc-form-note">Your answers are saved on this device as you go. Never include a password, PIN or card number.</p>
                <button type="submit" className="vc-btn vc-btn--primary" disabled={submitting}>{submitting ? "Sending…" : step === 7 ? "Submit application" : "Continue"}{!submitting && <ArrowRight className="vc-icon" aria-hidden="true" />}</button>
              </div>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
