import { useState } from "react";
import { X, CheckCircle, RefreshCw, User, Building2, FileText, Shield, Camera, Users, ClipboardCheck } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { AppHero, StepTracker, ProgressBar, FormCard, Field, DocSlot, OtpInput, NavButtons, inputCls, selectCls, VerifiedBadge, P as CP, GOLD, GREEN } from "./AppFormShell";
import { applicationsApi, otpApi } from "../services/applicationsApi";

interface Props { isOpen: boolean; onClose: () => void; }

const STEPS = [
  { n: 1, label: "Applicant\ninfo",      icon: <User className="w-4 h-4" /> },
  { n: 2, label: "Loan &\ncollateral",   icon: <Building2 className="w-4 h-4" /> },
  { n: 3, label: "OTP\nverify",          icon: <Shield className="w-4 h-4" /> },
  { n: 4, label: "Biometrics",           icon: <Camera className="w-4 h-4" /> },
  { n: 5, label: "Documents",            icon: <FileText className="w-4 h-4" /> },
  { n: 6, label: "Directors",            icon: <Users className="w-4 h-4" /> },
  { n: 7, label: "Confirmation",         icon: <ClipboardCheck className="w-4 h-4" /> },
];

const LOAN_PURPOSES = [
  "Working capital / cash flow",
  "Equipment purchase",
  "Vehicle finance",
  "Property purchase / renovation",
  "Stock / inventory",
  "Business expansion",
  "Debt consolidation",
  "Other",
];

const COLLATERAL_TYPES = ["Residential property", "Commercial property", "Vehicle(s)", "Equipment / machinery", "Stock / inventory", "Personal suretyship", "No collateral"];

const DOC_SLOTS = [
  { key: "bank",     label: "Latest 3 months' bank statements", required: true },
  { key: "cipc",     label: "CIPC company registration certificate", required: true },
  { key: "financials", label: "Latest annual financial statements", required: true },
  { key: "address",  label: "Business proof of address (≤3 months)", required: true },
  { key: "id",       label: "Director(s) certified ID copy", required: true },
  { key: "tax",      label: "SARS tax clearance certificate", required: false },
];

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

export function BusinessLoanApplicationViewer({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [bioDone, setBioDone] = useState(false);
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState({
    fullName: "", idNumber: "", contactNumber: "+27 ", email: "", businessName: "",
    cipcNumber: "", directors: "", physicalAddress: "", postalAddress: "",
    loanAmount: "", loanPurpose: "", loanTerm: "24", collateralType: "",
    collateralDesc: "", collateralValue: "", otp: "",
    selfieCapture: false,
    director2Name: "", director2Id: "", director2Share: "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  if (!isOpen) return null;

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  const next = () => setStep(s => Math.min(s + 1, 7));
  const back = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#F8F7FF]">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-gray-400 font-medium">Step {step} of {STEPS.length}</span>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 pb-4 space-y-3">
          <StepTracker steps={STEPS} current={step} />
          <ProgressBar value={progress} />
        </div>
      </div>

      {/* ── Hero ── */}
      <AppHero
        tag="VMS Business Banking · NCRCP Licensed"
        title="Small Business Loan Application"
        subtitle="Fast, transparent funding for South African businesses. Complete all 7 steps to receive your decision."
        gradient={`linear-gradient(135deg,${CP} 0%,#3d1d63 50%,#7B4DB5 100%)`}
      />

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto w-full px-5 py-8">

        {/* ── Step 1: Applicant Information ── */}
        {step === 1 && (
          <FormCard stepN={1} title="Applicant information" subtitle="Tell us about yourself and your business">
            <Field label="Applicant full name" full>
              <input className={inputCls} placeholder="e.g. Thabo Nkosi" value={form.fullName} onChange={set("fullName")} />
            </Field>

            <FieldRow>
              <Field label="Identity number">
                <input className={inputCls} placeholder="SA ID or passport number" value={form.idNumber} onChange={set("idNumber")} />
              </Field>
              <Field label="Contact number">
                <input className={inputCls} placeholder="+27 ..." value={form.contactNumber} onChange={set("contactNumber")} />
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Email address">
                <input type="email" className={inputCls} placeholder="email@domain.com" value={form.email} onChange={set("email")} />
              </Field>
              <Field label="Business name">
                <input className={inputCls} placeholder="Registered business name" value={form.businessName} onChange={set("businessName")} />
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Company registration number">
                <input className={inputCls} placeholder="CIPC reg. number" value={form.cipcNumber} onChange={set("cipcNumber")} />
              </Field>
              <Field label="Director(s) name(s)">
                <input className={inputCls} placeholder="Separate with commas" value={form.directors} onChange={set("directors")} />
              </Field>
            </FieldRow>

            <Field label="Business physical address" full>
              <input className={inputCls} placeholder="Street, suburb, city, code" value={form.physicalAddress} onChange={set("physicalAddress")} />
            </Field>

            <Field label="Postal address (if different)" full>
              <input className={inputCls} placeholder="Leave blank if same as above" value={form.postalAddress} onChange={set("postalAddress")} />
            </Field>
          </FormCard>
        )}

        {/* ── Step 2: Loan & Collateral ── */}
        {step === 2 && (
          <FormCard stepN={2} title="Loan & collateral details" subtitle="How much do you need and what security can you offer?">
            <FieldRow>
              <Field label="Loan amount required (ZAR)">
                <input type="number" className={inputCls} placeholder="e.g. 500000" value={form.loanAmount} onChange={set("loanAmount")} />
              </Field>
              <Field label="Repayment term (months)">
                <select className={selectCls} value={form.loanTerm} onChange={set("loanTerm")}>
                  {[6,12,18,24,36,48,60,72].map(m => <option key={m} value={m}>{m} months</option>)}
                </select>
              </Field>
            </FieldRow>

            <Field label="Purpose of loan" full>
              <select className={selectCls} value={form.loanPurpose} onChange={set("loanPurpose")}>
                <option value="">Select purpose...</option>
                {LOAN_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>

            <Field label="Collateral type" full>
              <select className={selectCls} value={form.collateralType} onChange={set("collateralType")}>
                <option value="">Select collateral...</option>
                {COLLATERAL_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            {form.collateralType && form.collateralType !== "No collateral" && (
              <FieldRow>
                <Field label="Collateral description">
                  <input className={inputCls} placeholder="Describe the collateral asset" value={form.collateralDesc} onChange={set("collateralDesc")} />
                </Field>
                <Field label="Estimated value (ZAR)">
                  <input type="number" className={inputCls} placeholder="Market value" value={form.collateralValue} onChange={set("collateralValue")} />
                </Field>
              </FieldRow>
            )}

            {/* Indicative repayment */}
            {form.loanAmount && (
              <div className="rounded-xl p-4 mt-2" style={{ background: "#F3F0FB" }}>
                <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: CP }}>Indicative monthly repayment</p>
                <p className="text-2xl font-black" style={{ color: CP }}>
                  R {Math.round(Number(form.loanAmount) * 0.025 * Math.pow(1.025, Number(form.loanTerm)) / (Math.pow(1.025, Number(form.loanTerm)) - 1)).toLocaleString("en-ZA")}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Based on indicative 2.5%/month · Subject to credit assessment</p>
              </div>
            )}
          </FormCard>
        )}

        {/* ── Step 3: OTP Verify ── */}
        {step === 3 && (
          <FormCard stepN={3} title="OTP verification" subtitle="We'll send a one-time PIN to verify your identity">
            <p className="text-sm text-gray-600">
              We will send a one-time PIN to <strong>{form.contactNumber || "+27 ..."}</strong> to verify your identity.
            </p>

            {!otpSent ? (
              <button
                onClick={async () => {
                  const r = await otpApi.send(form.contactNumber, "sms");
                  setOtpSent(true);
                  if (r.data && (r.data as { demoCode?: string }).demoCode) {
                    console.info("Demo OTP:", (r.data as { demoCode: string }).demoCode);
                  }
                }}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: CP }}>
                Send OTP to {form.contactNumber || "my number"}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-xl text-sm text-green-700 bg-green-50 border border-green-200">
                  ✓ OTP sent to {form.contactNumber}. Valid for 5 minutes.
                </div>
                <Field label="Enter 6-digit OTP" full>
                  <OtpInput value={form.otp} onChange={v => setForm(f => ({ ...f, otp: v }))} />
                </Field>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      const r = await otpApi.send(form.contactNumber, "sms");
                      setForm(f => ({ ...f, otp: "" }));
                      if (r.data && (r.data as { demoCode?: string }).demoCode) {
                        console.info("Demo OTP:", (r.data as { demoCode: string }).demoCode);
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />Resend OTP
                  </button>
                </div>
                {form.otp.length === 6 && (
                  <button
                    onClick={async () => {
                      const r = await otpApi.verify(form.contactNumber, form.otp);
                      if (r.success) setOtpVerified(true);
                    }}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ background: GREEN }}>
                    ✓ Verify OTP
                  </button>
                )}
                {otpVerified && (
                  <VerifiedBadge label="Identity verified successfully" />
                )}
              </div>
            )}
          </FormCard>
        )}

        {/* ── Step 4: Biometrics ── */}
        {step === 4 && (
          <FormCard stepN={4} title="Biometric verification" subtitle="Take a selfie to complete your FICA biometric check">
            <p className="text-sm text-gray-600 leading-relaxed">
              Take a selfie to complete your FICA biometric check. Your face will be matched against your provided ID document.
            </p>
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
              {!bioDone ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                    <Camera className="w-8 h-8 text-gray-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm mb-1">Take a selfie</p>
                    <p className="text-xs text-gray-500">Ensure you are in good lighting with your full face visible</p>
                  </div>
                  <button
                    onClick={() => setBioDone(true)}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ background: CP }}>
                    Open Camera
                  </button>
                  <p className="text-xs text-gray-400">or</p>
                  <label className="cursor-pointer text-sm font-semibold" style={{ color: CP }}>
                    Upload a clear photo
                    <input type="file" accept="image/*" className="hidden" onChange={() => setBioDone(true)} />
                  </label>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-white"
                    style={{ background: GREEN }}>
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <p className="font-bold text-green-700">Biometric check complete</p>
                  <p className="text-xs text-gray-500">Face matched successfully</p>
                </div>
              )}
            </div>
          </FormCard>
        )}

        {/* ── Step 5: Documents ── */}
        {step === 5 && (
          <FormCard stepN={5} title="Supporting documents" subtitle="Upload clear, legible scans or photos. PDF, JPG, and PNG accepted.">
            <div className="space-y-3">
              {DOC_SLOTS.map(d => (
                <DocSlot
                  key={d.key}
                  label={d.label}
                  required={d.required}
                  uploaded={!!docs[d.key]}
                  onUpload={() => setDocs(prev => ({ ...prev, [d.key]: true }))}
                />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {Object.keys(docs).filter(k => docs[k]).length} of {DOC_SLOTS.filter(d => d.required).length} required documents uploaded
            </p>
          </FormCard>
        )}

        {/* ── Step 6: Directors ── */}
        {step === 6 && (
          <FormCard stepN={6} title="Director information" subtitle="All directors with ≥25% shareholding must be declared">
            <p className="text-sm text-gray-500">All directors with ≥25% shareholding must be declared.</p>

            {/* Director 1 (from applicant info) */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Director 1 (Applicant)</p>
              <FieldRow>
                <Field label="Full name">
                  <input className={inputCls} value={form.fullName} onChange={set("fullName")} />
                </Field>
                <Field label="ID number">
                  <input className={inputCls} value={form.idNumber} onChange={set("idNumber")} />
                </Field>
              </FieldRow>
              <Field label="Shareholding %" full>
                <input type="number" className={inputCls} placeholder="e.g. 51" min={1} max={100} />
              </Field>
            </div>

            {/* Director 2 */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Director 2 (if applicable)</p>
              <FieldRow>
                <Field label="Full name">
                  <input className={inputCls} placeholder="Director full name" value={form.director2Name} onChange={set("director2Name")} />
                </Field>
                <Field label="ID number">
                  <input className={inputCls} placeholder="SA ID or passport" value={form.director2Id} onChange={set("director2Id")} />
                </Field>
              </FieldRow>
              <Field label="Shareholding %" full>
                <input type="number" className={inputCls} placeholder="e.g. 49" min={1} max={100} value={form.director2Share} onChange={set("director2Share")} />
              </Field>
            </div>

            <p className="text-xs text-gray-400">Add more directors by contacting your VMS relationship manager after submission.</p>
          </FormCard>
        )}

        {/* ── Step 7: Confirmation ── */}
        {step === 7 && (
          <div className="space-y-5">
            {!submitted ? (
              <>
                <FormCard stepN={7} title="Application summary" subtitle="Review your details before submitting">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { label: "Applicant", value: form.fullName || "—" },
                      { label: "Business", value: form.businessName || "—" },
                      { label: "CIPC Number", value: form.cipcNumber || "—" },
                      { label: "Loan Amount", value: form.loanAmount ? `R ${Number(form.loanAmount).toLocaleString("en-ZA")}` : "—" },
                      { label: "Loan Purpose", value: form.loanPurpose || "—" },
                      { label: "Term", value: form.loanTerm ? `${form.loanTerm} months` : "—" },
                      { label: "Collateral", value: form.collateralType || "—" },
                      { label: "Contact", value: form.contactNumber || "—" },
                    ].map((item, i) => (
                      <div key={i} className="p-3 rounded-xl bg-gray-50">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </FormCard>

                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    By submitting this application I confirm that all information provided is true and accurate. I authorise Vink Group (Pty) Ltd to conduct a credit bureau inquiry and verify my information. I have read and agree to the <span className="font-semibold" style={{ color: CP }}>Loan Terms and Conditions</span> and <span className="font-semibold" style={{ color: CP }}>Privacy Policy</span>.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-purple-700 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-700">
                      I agree to the terms and conditions and consent to a credit check
                    </span>
                  </label>
                </div>

                <button
                  disabled={!agreed || submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    setSubmitError("");
                    const result = await applicationsApi.submit({
                      type: "businessLoan",
                      subType: form.loanPurpose || "Business Loan",
                      applicantName: form.fullName,
                      applicantEmail: form.email,
                      applicantPhone: form.contactNumber,
                      formData: form,
                    });
                    setSubmitting(false);
                    if (result.success && result.data) {
                      setSubmitted(true);
                    } else {
                      setSubmitError(result.error ?? "Submission failed. Please try again.");
                    }
                  }}
                  className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                  style={{ background: agreed ? `linear-gradient(135deg,${CP},#7B4DB5)` : "#9CA3AF" }}>
                  {submitting ? "Submitting..." : "Submit Loan Application"}
                </button>
                {submitError && <p className="text-red-600 text-sm text-center mt-2">{submitError}</p>}
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-green-200 p-8 shadow-sm text-center space-y-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                  style={{ background: "#D1FAE5" }}>
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-900">Application Submitted!</h2>
                <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto">
                  Your business loan application has been received. A VMS credit officer will review your application and contact you at <strong>{form.contactNumber}</strong> within <strong>2 business days</strong>.
                </p>
                <div className="rounded-xl p-4 mt-2" style={{ background: "#F3F0FB" }}>
                  <p className="text-xs text-gray-500 mb-1">Application reference number</p>
                  <p className="font-black text-lg" style={{ color: CP }}>
                    VMS-BL-{new Date().getFullYear()}-{Math.floor(Math.random() * 90000 + 10000)}
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  A confirmation email has been sent to {form.email || "your registered email address"}.
                </p>
                <button onClick={onClose}
                  className="mt-4 px-8 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: CP }}>
                  Back to VMS
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Navigation buttons ── */}
        {!submitted && (
          <NavButtons
            onBack={step > 1 ? back : undefined}
            onNext={step < STEPS.length ? next : undefined}
            hideBack={step === 1}
          />
        )}
      </div>
    </div>
  );
}
