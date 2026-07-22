import { useState, useRef, useEffect } from "react";
import { X, CheckCircle, Clock, Upload, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";

interface Props { isOpen: boolean; onClose: () => void; initialAccountType?: string; }

const PURPLE = "#5B2D8E";
const GREEN  = "#10B981";

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: "Details" },
  { n: 2, label: "Verify" },
  { n: 3, label: "Biometrics" },
  { n: 4, label: "Selfie" },
  { n: 5, label: "Documents" },
  { n: 6, label: "Directors" },
  { n: 7, label: "Account" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Director {
  id: number;
  fullName: string;
  idPassport: string;
  cellNumber: string;
  email: string;
  otpPending: boolean;
  fingerprintPending: boolean;
  selfiePending: boolean;
  docsUploaded: boolean;
  verified: boolean;
}

const blankDirector = (id: number): Director => ({
  id, fullName: "", idPassport: "", cellNumber: "+27 ", email: "",
  otpPending: true, fingerprintPending: true, selfiePending: true, docsUploaded: false, verified: false,
});

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-stretch bg-white border-b border-gray-200 overflow-x-auto">
      {STEPS.map((s) => {
        const done    = s.n < current;
        const active  = s.n === current;
        return (
          <div key={s.n} className="flex-1 min-w-[64px] flex flex-col items-center justify-center py-2.5 px-1 relative border-r border-gray-100 last:border-r-0"
            style={{ background: active ? PURPLE : done ? "#F0FDF4" : "#fff" }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mb-0.5"
              style={{ background: active ? "#fff" : done ? GREEN : "#E5E7EB", color: active ? PURPLE : done ? "#fff" : "#9CA3AF" }}>
              {done ? "✓" : s.n}
            </div>
            <p className="text-[9px] font-semibold leading-tight text-center"
              style={{ color: active ? "#fff" : done ? GREEN : "#9CA3AF" }}>
              {s.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Business Details ────────────────────────────────────────────────
function Step1({ onNext }: { onNext: () => void }) {
  const [form, setForm] = useState({ bizName: "", regNo: "", bizType: "Private Company", taxNo: "", addressLine1: "", addressLine2: "", city: "", province: "", postalCode: "", phone: "", website: "" });
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-0.5">Business Details</h2>
        <p className="text-xs text-gray-500">Section 1 — Tell us about your business</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Registered business name *" value={form.bizName} onChange={f("bizName")} placeholder="ABC Trading (Pty) Ltd" />
        <Field label="Company registration number *" value={form.regNo} onChange={f("regNo")} placeholder="2021/123456/07" />
        <div>
          <label className="field-label">Business type *</label>
          <select value={form.bizType} onChange={f("bizType")} className="field-input">
            {["Private Company", "Public Company", "Close Corporation", "Sole Proprietor", "Partnership", "Trust", "NPO / NGO"].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <Field label="Tax reference number" value={form.taxNo} onChange={f("taxNo")} placeholder="9234567890" />
        <Field label="Business address line 1 *" value={form.addressLine1} onChange={f("addressLine1")} placeholder="123 Main Street" />
        <Field label="Address line 2" value={form.addressLine2} onChange={f("addressLine2")} placeholder="Unit / Building (optional)" />
        <Field label="City *" value={form.city} onChange={f("city")} placeholder="Cape Town" />
        <div>
          <label className="field-label">Province *</label>
          <select value={form.province} onChange={f("province")} className="field-input">
            <option value="">Select province</option>
            {["Western Cape","Gauteng","KwaZulu-Natal","Eastern Cape","Limpopo","Mpumalanga","North West","Free State","Northern Cape"].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <Field label="Postal code *" value={form.postalCode} onChange={f("postalCode")} placeholder="8001" />
        <Field label="Business phone *" value={form.phone} onChange={f("phone")} placeholder="+27 21 000 0000" />
        <Field label="Website" value={form.website} onChange={f("website")} placeholder="https://example.co.za" />
      </div>
      <NavButtons onNext={onNext} nextLabel="Next: Verify" />
    </div>
  );
}

// ─── Step 2 — Verify ──────────────────────────────────────────────────────────
function Step2({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [phone, setPhone] = useState("+27 ");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [verified, setVerified] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-0.5">Verify Your Identity</h2>
        <p className="text-xs text-gray-500">Section 2 — We will send a one-time password to confirm your identity</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Cell number *" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+27 82 000 0000" />
        <Field label="Email address *" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="director@company.co.za" />
      </div>
      {!otpSent ? (
        <button onClick={() => setOtpSent(true)}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
          style={{ background: PURPLE }}>
          Send OTP
        </button>
      ) : !verified ? (
        <div className="flex items-center gap-3 max-w-xs">
          <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter 6-digit OTP"
            className="field-input flex-1" maxLength={6} />
          <button onClick={() => { if (otp.length >= 4) setVerified(true); }}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white flex-shrink-0"
            style={{ background: PURPLE }}>Verify</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
          <CheckCircle className="w-5 h-5" />
          Identity verified successfully
        </div>
      )}
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Biometrics" nextDisabled={!verified} />
    </div>
  );
}

// ─── Step 3 — Biometrics ──────────────────────────────────────────────────────
function Step3({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [captured, setCaptured] = useState(false);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-0.5">Biometric Verification</h2>
        <p className="text-xs text-gray-500">Section 3 — Fingerprint scan required for all directors</p>
      </div>
      <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center">
        {!captured ? (
          <>
            <div className="text-5xl mb-4">👆</div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Place your finger on the scanner</p>
            <p className="text-xs text-gray-400 mb-5">Use a fingerprint reader or mobile biometric sensor</p>
            <button onClick={() => setCaptured(true)}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: PURPLE }}>
              Capture Fingerprint
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-sm font-bold text-green-700">Fingerprint matched successfully</p>
            <p className="text-xs text-gray-400">Identity confirmed via biometric scan</p>
          </div>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Selfie" nextDisabled={!captured} />
    </div>
  );
}

// ─── Step 4 — Selfie ──────────────────────────────────────────────────────────
function Step4({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [captured, setCaptured] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-0.5">Selfie Confirmation</h2>
        <p className="text-xs text-gray-500">Section 4 — Upload a clear selfie to confirm your identity</p>
      </div>
      <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors"
        onClick={() => fileRef.current?.click()}>
        {!captured ? (
          <>
            <div className="text-5xl mb-4">🤳</div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Upload a selfie or take a photo</p>
            <p className="text-xs text-gray-400 mb-4">Must clearly show your face · JPG or PNG · Max 5MB</p>
            <span className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: PURPLE }}>
              Choose Photo
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-sm font-bold text-green-700">Selfie confirmed</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={() => setCaptured(true)} />
      </div>
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Documents" nextDisabled={!captured} />
    </div>
  );
}

// ─── Step 5 — Documents ───────────────────────────────────────────────────────
function Step5({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});
  const docs = [
    { key: "cipc",     label: "CIPC Registration Certificate" },
    { key: "taxClear", label: "SARS Tax Clearance Certificate" },
    { key: "bankStat", label: "6 Months Bank Statements" },
    { key: "idProof",  label: "Director ID / Passport" },
    { key: "proofAddr", label: "Proof of Business Address" },
    { key: "fica",     label: "FICA Compliance Documents" },
  ];
  const allDone = docs.every(d => uploaded[d.key]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-0.5">Upload Documents</h2>
        <p className="text-xs text-gray-500">Section 5 — All documents must be certified copies · PDF, JPG, PNG · Max 10MB each</p>
      </div>
      <div className="space-y-3">
        {docs.map(d => (
          <label key={d.key} className="flex items-center justify-between p-4 bg-white border rounded-xl cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors"
            style={{ borderColor: uploaded[d.key] ? GREEN : "#E5E7EB" }}>
            <div className="flex items-center gap-3">
              {uploaded[d.key]
                ? <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: GREEN }} />
                : <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />
              }
              <span className="text-sm font-medium text-gray-800">{d.label}</span>
            </div>
            <span className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: uploaded[d.key] ? "#DCFCE7" : "#F3F0FB", color: uploaded[d.key] ? GREEN : PURPLE }}>
              {uploaded[d.key] ? "Uploaded" : "Upload"}
            </span>
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
              onChange={() => setUploaded(p => ({ ...p, [d.key]: true }))} />
          </label>
        ))}
      </div>
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Directors" nextDisabled={!allDone} />
    </div>
  );
}

// ─── Step 6 — Directors ───────────────────────────────────────────────────────
function Step6({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [directors, setDirectors] = useState<Director[]>([
    { id: 1, fullName: "", idPassport: "", cellNumber: "", email: "", otpPending: false, fingerprintPending: false, selfiePending: false, docsUploaded: true, verified: true },
    blankDirector(2),
  ]);
  const [advisor, setAdvisor] = useState({ fspName: "", firstName: "", surname: "", code: "", discretionary: "non" });
  const [investment, setInvestment] = useState({ securityName: "", amount: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const updateDir = (id: number, patch: Partial<Director>) =>
    setDirectors(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d));
  const addDir = () => setDirectors(ds => [...ds, blankDirector(ds.length + 1)]);
  const removeDir = (id: number) => setDirectors(ds => ds.filter(d => d.id !== id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-0.5">Director Confirmations</h2>
        <p className="text-xs text-gray-500">Section 6 — All directors must verify their identity and upload documents</p>
      </div>

      {/* Directors */}
      {directors.map((dir, idx) => (
        <div key={dir.id} className="border rounded-2xl overflow-hidden" style={{ borderColor: dir.verified ? GREEN : "#E5E7EB" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={dir.verified} readOnly className="w-4 h-4 accent-purple-600" />
              <span className="text-sm font-semibold text-gray-900">
                Director {idx + 1}{idx === 0 ? " (Primary applicant)" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {dir.verified
                ? <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#DCFCE7", color: GREEN }}>Verified</span>
                : <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700">Pending</span>
              }
              {idx > 0 && (
                <button onClick={() => removeDir(dir.id)} className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {dir.verified ? (
              /* Verified director — show check list */
              <div className="space-y-1.5">
                {[
                  "Phone OTP verified",
                  "Email OTP verified",
                  "Fingerprint matched",
                  "Selfie confirmed",
                  "Documents uploaded",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs" style={{ color: GREEN }}>
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              /* Unverified director — show input fields */
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Full name" value={dir.fullName} onChange={e => updateDir(dir.id, { fullName: e.target.value })} placeholder="Full name" />
                  <Field label="ID / passport" value={dir.idPassport} onChange={e => updateDir(dir.id, { idPassport: e.target.value })} placeholder="ID number" />
                  <Field label="Cell number" value={dir.cellNumber} onChange={e => updateDir(dir.id, { cellNumber: e.target.value })} placeholder="+27 ..." />
                  <Field label="Email" type="email" value={dir.email} onChange={e => updateDir(dir.id, { email: e.target.value })} placeholder="email@..." />
                </div>

                {/* Pending items */}
                <div className="space-y-1.5">
                  {[
                    { key: "otpPending",         label: "OTP verification pending" },
                    { key: "fingerprintPending", label: "Fingerprint pending" },
                    { key: "selfiePending",      label: "Selfie pending" },
                  ].map(item => (
                    <div key={item.key} className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0 text-yellow-500" />
                      {item.label}
                    </div>
                  ))}
                </div>

                {/* Document upload */}
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors text-sm text-gray-500"
                  onClick={() => setUploadingId(dir.id)}>
                  <Upload className="w-4 h-4" />
                  Upload director documents — click to upload
                  <input ref={uploadingId === dir.id ? fileRef : undefined}
                    type="file" className="hidden" accept=".pdf,.jpg,.png"
                    onChange={() => updateDir(dir.id, { docsUploaded: true })} />
                </label>
                {dir.docsUploaded && (
                  <p className="text-xs font-semibold" style={{ color: GREEN }}>✓ Documents uploaded</p>
                )}
              </>
            )}
          </div>
        </div>
      ))}

      {/* Add director */}
      <button onClick={addDir}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:bg-purple-50"
        style={{ borderColor: PURPLE, color: PURPLE }}>
        <Plus className="w-4 h-4" />
        Add another director
      </button>

      {/* Financial Advisor Details */}
      <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Financial Advisor Details</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="FSP name" value={advisor.fspName} onChange={e => setAdvisor(a => ({ ...a, fspName: e.target.value }))} placeholder="FSP Company Name" />
          <Field label="Advisor first name" value={advisor.firstName} onChange={e => setAdvisor(a => ({ ...a, firstName: e.target.value }))} placeholder="Jane" />
          <Field label="Advisor surname" value={advisor.surname} onChange={e => setAdvisor(a => ({ ...a, surname: e.target.value }))} placeholder="Smith" />
          <Field label="Financial advisor code" value={advisor.code} onChange={e => setAdvisor(a => ({ ...a, code: e.target.value }))} placeholder="FA12345" />
        </div>
        <div className="flex gap-2">
          {[{ key: "non", label: "Non-discretionary" }, { key: "full", label: "Full discretionary" }].map(opt => (
            <button key={opt.key} onClick={() => setAdvisor(a => ({ ...a, discretionary: opt.key }))}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: advisor.discretionary === opt.key ? PURPLE : "#F3F4F6",
                color: advisor.discretionary === opt.key ? "#fff" : "#6B7280",
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Investment Details */}
      <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Investment Details (Section 5)</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Field label="Security name" value={investment.securityName} onChange={e => setInvestment(i => ({ ...i, securityName: e.target.value }))} placeholder="e.g. Absa Capital Securities Plan" />
          </div>
          <div>
            <Field label="Investment amount (GBP)" type="number" value={investment.amount} onChange={e => setInvestment(i => ({ ...i, amount: e.target.value }))} placeholder="100000" />
            <p className="text-[11px] text-gray-400 mt-1">Minimum lump sum: GBP 100,000</p>
          </div>
        </div>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Account" />
    </div>
  );
}

// ─── Step 7 — Account ─────────────────────────────────────────────────────────
function Step7({ onBack, onClose, initialAccountType }: { onBack: () => void; onClose: () => void; initialAccountType?: string }) {
  const [accountType, setAccountType] = useState(initialAccountType ?? "Business Current Account");
  const [currency, setCurrency] = useState("ZAR");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <CheckCircle className="w-16 h-16" style={{ color: GREEN }} />
        <h2 className="text-2xl font-black text-gray-900">Application Submitted!</h2>
        <p className="text-gray-500 text-sm max-w-md">
          Your business account application has been received. Our team will review it within 2–5 business days and contact you at the email address provided.
        </p>
        <p className="text-xs text-gray-400">Reference: VINK-{Date.now().toString(36).toUpperCase()}</p>
        <button onClick={onClose}
          className="mt-4 px-8 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
          style={{ background: PURPLE }}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-0.5">Account Setup</h2>
        <p className="text-xs text-gray-500">Section 7 — Review and submit your business account application</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Account type *</label>
          <select value={accountType} onChange={e => setAccountType(e.target.value)} className="field-input">
            {["Business Current Account","Business Savings Account","Business Premium Account","Business Platinum Account","Foreign Currency Account","Corporate Treasury Account"].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Primary currency *</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} className="field-input">
            {["ZAR","USD","EUR","GBP","ZMW"].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Application Summary</p>
        <div className="space-y-2 text-sm">
          {[
            { label: "Selected account", value: accountType },
            { label: "Currency", value: currency },
            { label: "Directors confirmed", value: "1 of 2" },
            { label: "Documents", value: "All uploaded" },
            { label: "Identity verification", value: "Complete" },
          ].map(row => (
            <div key={row.label} className="flex justify-between">
              <span className="text-gray-500">{row.label}</span>
              <span className="font-semibold text-gray-800">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Terms */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-purple-600 flex-shrink-0" />
        <p className="text-xs text-gray-600 leading-relaxed">
          I confirm that all information provided is accurate and complete. I authorise VINK to perform FICA verification, credit checks, and to open the selected business account on behalf of the registered entity. I have read and agree to the <span className="font-semibold" style={{ color: PURPLE }}>Terms and Conditions</span> and <span className="font-semibold" style={{ color: PURPLE }}>Privacy Policy</span>.
        </p>
      </label>

      <div className="flex gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          style={{ borderColor: "#D1D5DB" }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={() => { if (agreeTerms) setSubmitted(true); }}
          disabled={!agreeTerms}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
          style={{ background: PURPLE }}>
          Submit &amp; Generate Account
        </button>
      </div>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="field-input" />
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = "Next", nextDisabled = false }: {
  onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-2">
      {onBack && (
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          style={{ borderColor: "#D1D5DB" }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      )}
      {onNext && (
        <button onClick={onNext} disabled={nextDisabled}
          className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40 ml-auto"
          style={{ background: PURPLE }}>
          {nextLabel} <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BusinessAccountApplicationViewer({ isOpen, onClose, initialAccountType }: Props) {
  const [step, setStep] = useState(1);
  const next = () => setStep(s => Math.min(s + 1, 7));
  const back = () => setStep(s => Math.max(s - 1, 1));

  useEffect(() => { if (isOpen) setStep(1); }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Inject field styles once */}
      <style>{`
        .field-label { display: block; font-size: 11px; font-weight: 600; color: #6B7280; margin-bottom: 4px; }
        .field-input { width: 100%; border: 1px solid #E5E7EB; border-radius: 10px; padding: 9px 14px; font-size: 13px; outline: none; background: #fff; color: #111827; }
        .field-input:focus { border-color: #5B2D8E; }
      `}</style>

      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        {/* Top bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
            <span className="text-sm font-semibold text-gray-700 hidden sm:block">Business Account Application</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step bar */}
        <div className="flex-shrink-0">
          <StepBar current={step} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-8">
            {step === 1 && <Step1 onNext={next} />}
            {step === 2 && <Step2 onNext={next} onBack={back} />}
            {step === 3 && <Step3 onNext={next} onBack={back} />}
            {step === 4 && <Step4 onNext={next} onBack={back} />}
            {step === 5 && <Step5 onNext={next} onBack={back} />}
            {step === 6 && <Step6 onNext={next} onBack={back} />}
            {step === 7 && <Step7 onBack={back} onClose={onClose} initialAccountType={initialAccountType} />}
          </div>
        </div>
      </div>
    </>
  );
}
