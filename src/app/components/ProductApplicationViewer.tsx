import { useEffect, useRef, useState } from "react";
import { X, User, Shield, FileText, CheckCircle } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { applicationsApi } from "../services/applicationsApi";
import { SPECS, validateFields, visibleFields, buildSubmission, type FieldSpec, type Form, type ProductKind } from "../data/productApplications";
import { AppHero, FormCard, NavButtons, ProgressBar, StepTracker, inputCls, selectCls, P, GREEN } from "./AppFormShell";
import { ApplicationIdentityStep } from "./ApplicationIdentityStep";

/**
 * Insurance and the personal loan: a four-step application (the product, about you, the details, review and declarations) described by data/productApplications.ts. It sends the
 * application to POST /api/applications and then says, truthfully, that it has been RECEIVED: nothing here claims that anything was approved, issued or activated, because nothing has been.
 * The applicant can then confirm their identity on the same screen (ApplicationIdentityStep), which is required before staff can approve a personal application.
 */
const STEPS = [
  { n: 1, label: "Product", icon: <FileText className="w-3.5 h-3.5" /> }, { n: 2, label: "About you", icon: <User className="w-3.5 h-3.5" /> },
  { n: 3, label: "Details", icon: <Shield className="w-3.5 h-3.5" /> }, { n: 4, label: "Review", icon: <CheckCircle className="w-3.5 h-3.5" /> },
];
const label = (f: FieldSpec, v: string) => (f.kind === "select" ? f.options?.find((o) => o.value === v)?.label ?? v : f.kind === "money" ? `R ${Number(v.replace(/[^\d.]/g, "")).toLocaleString("en-ZA")}` : v);

export function ProductApplicationViewer({ isOpen, onClose, kind, initialProduct }: { isOpen: boolean; onClose: () => void; kind: ProductKind; initialProduct?: string }) {
  const spec = SPECS[kind];
  const start = spec.products.some((p) => p.name === initialProduct) ? (initialProduct as string) : "";
  const [product, setProduct] = useState(start), [step, setStep] = useState(start ? 2 : 1), [form, setForm] = useState<Form>({}), [errors, setErrors] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({}), [submitting, setSubmitting] = useState(false), [submitError, setSubmitError] = useState(""), [refNo, setRefNo] = useState("");
  const top = useRef<HTMLDivElement>(null);

  // every time it is opened it starts fresh, at the step after the product when the visitor already chose one
  useEffect(() => { if (isOpen) { setProduct(start); setStep(start ? 2 : 1); setForm({}); setErrors({}); setAccepted({}); setSubmitError(""); setRefNo(""); } }, [isOpen, start, kind]);
  useEffect(() => { top.current?.scrollIntoView?.({ block: "start" }); }, [step]);
  if (!isOpen) return null;

  const details = product ? spec.details(product) : [];
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setForm((f) => ({ ...f, [key]: e.target.value })); if (errors[key]) setErrors((x) => { const { [key]: _gone, ...rest } = x; return rest; }); };
  const go = (n: number) => setStep(n);
  const next = () => {
    const fields = step === 2 ? spec.aboutYou : step === 3 ? details : [];
    const found = validateFields(fields, form); setErrors(found);
    const first = Object.keys(found)[0]; if (first) { document.getElementById(`pa-${first}`)?.focus(); return; }
    go(step + 1);
  };
  const allAccepted = spec.declarations.every((d) => accepted[d.key]);
  const submit = async () => {
    if (!allAccepted || submitting) return;
    setSubmitting(true); setSubmitError("");
    const r = await applicationsApi.submit(buildSubmission(spec, product, form, spec.declarations.map((d) => d.key))).catch(() => null);
    setSubmitting(false);
    if (r?.success && r.data?.referenceNumber) { setRefNo(r.data.referenceNumber); go(5); }
    else setSubmitError(r?.error ?? "We could not send your application. Please check your connection and try again.");
  };

  const input = (f: FieldSpec) => {
    const id = `pa-${f.key}`, err = errors[f.key], common = { id, value: form[f.key] ?? "", onChange: set(f.key), "aria-invalid": !!err || undefined, "aria-describedby": err ? `${id}-err` : f.hint ? `${id}-hint` : undefined, "aria-required": f.required || undefined };
    return (
      <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
        <label htmlFor={id} className="block text-xs font-bold text-fg-muted uppercase tracking-wide mb-1.5">{f.label}{f.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}</label>
        {f.kind === "select" ? <select {...common} className={selectCls}><option value="">Choose…</option>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : f.kind === "textarea" ? <textarea {...common} rows={3} maxLength={f.maxLength} className={inputCls} />
          : <input {...common} type={f.kind === "money" || f.kind === "number" ? "text" : f.kind} inputMode={f.kind === "money" || f.kind === "number" ? "decimal" : f.kind === "tel" ? "tel" : undefined} autoComplete={f.kind === "email" ? "email" : f.kind === "tel" ? "tel" : undefined} maxLength={f.maxLength} placeholder={f.placeholder ?? (f.kind === "money" ? "e.g. 25 000" : undefined)} className={inputCls} />}
        {f.hint && !err && <p id={`${id}-hint`} className="text-[11px] text-fg-muted mt-1">{f.hint}</p>}
        {err && <p id={`${id}-err`} role="alert" className="text-xs font-semibold mt-1" style={{ color: "var(--vk-bad)" }}>{err}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-2" role="dialog" aria-modal="true" aria-label={spec.title}>
      <div ref={top} />
      <div className="sticky top-0 z-20 bg-surface border-b border-line shadow-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <img loading="lazy" decoding="async" src={vinkLogo} alt="VINK" className="h-9 w-auto object-contain" />
          <div className="flex items-center gap-3">
            {step <= 4 && <span className="hidden sm:block text-xs text-fg-subtle font-medium">Step {step} of {STEPS.length}</span>}
            <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-surface-2 transition-colors text-fg-muted hover:text-fg"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {step <= 4 && <div className="px-5 pb-4 space-y-3"><StepTracker steps={STEPS} current={step} /><ProgressBar value={((step - 1) / (STEPS.length - 1)) * 100} /></div>}
      </div>
      <AppHero tag={spec.tag} title={spec.title} subtitle={spec.subtitle} gradient="#C8102E" />

      <div className="max-w-2xl w-full mx-auto px-4 py-8 space-y-5">
        {step === 1 && (
          <FormCard stepN={1} title={spec.productHeading} subtitle="You can change this later.">
            <div role="radiogroup" aria-label={spec.productHeading} className="grid gap-2.5">
              {spec.products.map((p) => (
                <label key={p.id} className="flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all" style={{ borderColor: product === p.name ? P : "var(--vk-line)", background: product === p.name ? "var(--vk-brand-soft)" : "var(--vk-surface)" }}>
                  <input type="radio" name="product" value={p.name} checked={product === p.name} onChange={() => { setProduct(p.name); setForm((f) => ({ ...f })); }} className="mt-1 accent-[#C8102E]" />
                  <span><span className="block text-sm font-bold text-fg">{p.name}</span>{p.tagline && <span className="block text-xs text-fg-muted mt-0.5">{p.tagline}</span>}</span>
                </label>))}
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">{spec.notice}</p>
            <NavButtons hideBack onNext={() => go(2)} disabled={!product} />
          </FormCard>)}

        {step === 2 && (
          <FormCard stepN={2} title="About you" subtitle={product}>
            <div className="grid sm:grid-cols-2 gap-4">{visibleFields(spec.aboutYou, form).map(input)}</div>
            <NavButtons onBack={() => go(1)} onNext={next} />
          </FormCard>)}

        {step === 3 && (
          <FormCard stepN={3} title={`${product}: the details`} subtitle="Your best estimates are fine. We will confirm anything we need.">
            <div className="grid sm:grid-cols-2 gap-4">{visibleFields(details, form).map(input)}</div>
            <NavButtons onBack={() => go(2)} onNext={next} />
          </FormCard>)}

        {step === 4 && (
          <FormCard stepN={4} title="Check and send" subtitle="Please check your answers, then confirm the declarations.">
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm" aria-label="Your answers">
              <div className="sm:col-span-2"><dt className="text-xs text-fg-subtle">Application</dt><dd className="font-semibold text-fg">{product}</dd></div>
              {visibleFields([...spec.aboutYou, ...details], form).filter((f) => (form[f.key] ?? "").trim()).map((f) => <div key={f.key}><dt className="text-xs text-fg-subtle">{f.label}</dt><dd className="font-semibold text-fg break-words">{label(f, form[f.key].trim())}</dd></div>)}
            </dl>
            <p className="rounded-xl bg-surface-2 p-3 text-xs text-fg-muted leading-relaxed">{spec.notice}</p>
            <fieldset className="space-y-2.5"><legend className="sr-only">Declarations</legend>
              {spec.declarations.map((d) => (
                <label key={d.key} className="flex items-start gap-3 text-sm text-fg cursor-pointer"><input type="checkbox" checked={!!accepted[d.key]} onChange={(e) => setAccepted((a) => ({ ...a, [d.key]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-[#C8102E]" /><span>{d.label}</span></label>))}
            </fieldset>
            {submitError && <p role="alert" className="text-sm font-semibold" style={{ color: "var(--vk-bad)" }}>{submitError}</p>}
            <NavButtons onBack={() => go(3)} onNext={() => void submit()} nextLabel={submitting ? "Sending…" : "Send application"} disabled={!allAccepted || submitting} />
          </FormCard>)}

        {step === 5 && (
          <div className="space-y-5">
            <div className="bg-surface rounded-2xl border border-line p-8 shadow-sm text-center space-y-4">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: "var(--vk-ok-bg)" }}><CheckCircle className="w-10 h-10" style={{ color: GREEN }} /></div>
              <div><h2 className="text-2xl font-black text-fg">{spec.confirmationTitle}</h2><p className="text-fg-muted text-sm mt-1 max-w-md mx-auto">{spec.confirmationBody(form.email?.trim() ?? "")}</p></div>
              <div className="rounded-xl p-4" style={{ background: "var(--vk-surface-2)" }}><p className="text-xs text-fg-muted mb-1">Your reference number</p><p className="font-black text-xl tracking-wide" style={{ color: P }}>{refNo}</p><p className="text-xs text-fg-muted mt-1">Keep this for any message to us about your application.</p></div>
            </div>
            <ApplicationIdentityStep refNo={refNo} email={form.email} />
            <button onClick={onClose} className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg" style={{ background: `linear-gradient(135deg,${P},#A50F27)` }}>Back to VINK</button>
          </div>)}
      </div>
    </div>
  );
}
