import { useState } from "react";
import {
  X, CheckCircle, RefreshCw,
  User, Shield, Fingerprint, Camera, FileText, Users, CreditCard,
  Eye, EyeOff,
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { AppHero, StepTracker, ProgressBar, FormCard, Field, DocSlot, OtpInput, NavButtons, inputCls, selectCls, VerifiedBadge, P as CP, GOLD, GREEN } from "./AppFormShell";
import { applicationsApi } from "../services/applicationsApi";

interface Props { isOpen: boolean; onClose: () => void; }

const STEPS = [
  { n: 1, label: "Applicant\ndetails",       icon: <User className="w-3.5 h-3.5" /> },
  { n: 2, label: "Phone &\nemail verify",    icon: <Shield className="w-3.5 h-3.5" /> },
  { n: 3, label: "Fingerprint\nauth",        icon: <Fingerprint className="w-3.5 h-3.5" /> },
  { n: 4, label: "Selfie\ncapture",          icon: <Camera className="w-3.5 h-3.5" /> },
  { n: 5, label: "Upload\ndocuments",        icon: <FileText className="w-3.5 h-3.5" /> },
  { n: 6, label: "Director\nconfirmations",  icon: <Users className="w-3.5 h-3.5" /> },
  { n: 7, label: "Account\ncreation",        icon: <CreditCard className="w-3.5 h-3.5" /> },
];

const CARD_TYPES = [
  { id: "standard", name: "Vink Standard Card", limit: "R5,000 – R25,000", fee: "R0/month", color: "linear-gradient(135deg,#6B5ED7,#9585EA)" },
  { id: "gold",     name: "Vink Gold Card",     limit: "R25,000 – R150,000", fee: "R85/month", color: "linear-gradient(135deg,#B8860B,#DAA520)" },
  { id: "platinum", name: "Vink Platinum Card", limit: "R150,000 – R500,000", fee: "R265/month", color: "linear-gradient(135deg,#374151,#6B7280)" },
];

const DOC_SLOTS = [
  { key: "id",      label: "Certified copy of SA ID or passport",     required: true },
  { key: "address", label: "Proof of address (≤3 months)",            required: true },
  { key: "income",  label: "Latest 3 months' payslips or bank statements", required: true },
  { key: "tax",     label: "SARS income tax number / tax clearance",  required: true },
  { key: "cipc",    label: "Company registration (if business card)", required: false },
];

// ── Simulated fingerprint scanner ──────────────────────────────────────────────
function FingerprintScanner({ onDone }: { onDone: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const startScan = () => {
    setScanning(true);
    setProgress(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12 + 4;
      if (p >= 100) {
        p = 100;
        clearInterval(iv);
        setTimeout(() => { setDone(true); setScanning(false); onDone(); }, 400);
      }
      setProgress(p);
    }, 150);
  };

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div
        className="relative w-36 h-36 rounded-3xl flex items-center justify-center cursor-pointer transition-all select-none"
        style={{
          background: done ? "#D1FAE5" : scanning ? CP + "15" : "#F3F0FB",
          border: `3px solid ${done ? GREEN : scanning ? CP : "#DDD6FE"}`,
          boxShadow: scanning ? `0 0 30px ${CP}30` : "none",
        }}
        onClick={!scanning && !done ? () => { setAttempt(a => a + 1); startScan(); } : undefined}
      >
        <Fingerprint
          className="w-16 h-16 transition-colors"
          style={{ color: done ? GREEN : scanning ? CP : "#C4B5FD" }}
        />
        {scanning && (
          <div className="absolute bottom-3 left-3 right-3">
            <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-150"
                style={{ width: `${progress}%`, background: CP }} />
            </div>
          </div>
        )}
        {done && (
          <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {done ? (
        <div className="text-center">
          <p className="font-bold text-green-700">Fingerprint verified</p>
          <p className="text-xs text-gray-500 mt-0.5">Identity confirmed successfully</p>
        </div>
      ) : scanning ? (
        <div className="text-center">
          <p className="font-semibold text-gray-700">Scanning… {Math.round(progress)}%</p>
          <p className="text-xs text-gray-400 mt-0.5">Hold your finger steady</p>
        </div>
      ) : (
        <div className="text-center">
          <p className="font-semibold text-gray-700">
            {attempt === 0 ? "Tap to scan fingerprint" : "Tap again to retry"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Place your index finger on the reader</p>
        </div>
      )}
    </div>
  );
}

// ── Selfie capture UI ──────────────────────────────────────────────────────────
function SelfieCapture({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<"idle" | "countdown" | "captured">("idle");
  const [count, setCount] = useState(3);

  const startCapture = () => {
    setState("countdown");
    let c = 3;
    setCount(c);
    const iv = setInterval(() => {
      c--;
      setCount(c);
      if (c === 0) {
        clearInterval(iv);
        setTimeout(() => { setState("captured"); onDone(); }, 300);
      }
    }, 900);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Camera viewfinder */}
      <div className="relative w-64 h-64 rounded-3xl overflow-hidden bg-gray-900 flex items-center justify-center">
        {state === "idle" && (
          <div className="flex flex-col items-center gap-3 text-white/60 text-center px-4">
            <Camera className="w-12 h-12" />
            <p className="text-sm">Position your face in the frame</p>
          </div>
        )}
        {state === "countdown" && (
          <div className="flex flex-col items-center gap-2">
            {/* Face oval guide */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 h-48 rounded-full border-4 border-white/40 border-dashed" />
            </div>
            <p className="relative z-10 text-6xl font-black text-white" style={{ textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
              {count}
            </p>
          </div>
        )}
        {state === "captured" && (
          <div className="flex flex-col items-center gap-3 text-white text-center px-4">
            <CheckCircle className="w-14 h-14 text-green-400" />
            <p className="text-sm font-semibold text-green-300">Photo captured</p>
          </div>
        )}
        {/* Corner guides */}
        {state !== "captured" && (
          <>
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-white/50 rounded-tl" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-white/50 rounded-tr" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-white/50 rounded-bl" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-white/50 rounded-br" />
          </>
        )}
      </div>

      {state === "idle" && (
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <button onClick={startCapture}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: CP }}>
            Take Selfie
          </button>
          <p className="text-xs text-gray-400 text-center">
            Ensure you are in good lighting · No glasses or hats · Face forward
          </p>
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <label className="w-full text-center cursor-pointer text-sm font-semibold py-2.5 rounded-xl border-2 transition-all hover:bg-purple-50"
            style={{ borderColor: CP, color: CP }}>
            Upload a clear photo
            <input type="file" accept="image/*" className="hidden" onChange={() => { setState("captured"); onDone(); }} />
          </label>
        </div>
      )}

      {state === "captured" && (
        <div className="text-center space-y-2">
          <p className="font-bold text-green-700">Selfie captured successfully</p>
          <p className="text-xs text-gray-500">Face liveness check passed · Match score: 97%</p>
          <button onClick={() => setState("idle")} className="text-xs text-gray-400 hover:text-gray-700 underline">
            Retake photo
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function CreditCardApplicationViewer({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [selectedCard, setSelectedCard] = useState("standard");
  const [showPin, setShowPin] = useState(false);

  // Step 1
  const [form, setForm] = useState({
    firstName: "", lastName: "", idNumber: "", dob: "", phone: "+27 ", email: "",
    income: "", employer: "", address: "", postalCode: "", pin: "", confirmPin: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Step 2 — OTP
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  // Step 3 & 4
  const [fingerprintDone, setFingerprintDone] = useState(false);
  const [selfieDone, setSelfieDone] = useState(false);

  // Step 5
  const [docs, setDocs] = useState<Record<string, boolean>>({});

  // Step 6 — director
  const [dirVerified, setDirVerified] = useState(false);
  const [dirOtp, setDirOtp] = useState("");

  // Step 7
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [accountNumber, setAccountNumber] = useState(`4${Math.floor(Math.random() * 900000000 + 100000000)} ${Math.floor(Math.random() * 9000 + 1000)}`);

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
        tag="VMS Personal Banking · FICA · POCA Compliant"
        title="New Credit Card Application"
        subtitle="Choose your card, verify your identity, and get approved in minutes."
        gradient="linear-gradient(135deg,#1a0533 0%,#5B2D8E 50%,#9585EA 100%)"
      />

      {/* ── Step content ── */}
      <div className="max-w-2xl mx-auto w-full px-5 py-8 space-y-5">

        {/* STEP 1 — Applicant Details */}
        {step === 1 && (
          <>
            {/* Card selection */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-800 mb-4">Select your card type</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {CARD_TYPES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCard(c.id)}
                    className="rounded-xl p-3 text-left transition-all border-2"
                    style={{ borderColor: selectedCard === c.id ? CP : "#E5E7EB", background: selectedCard === c.id ? CP + "08" : "#fff" }}
                  >
                    <div className="h-8 rounded-lg mb-2" style={{ background: c.color }} />
                    <p className="text-xs font-bold text-gray-800 leading-tight">{c.name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{c.limit}</p>
                    <p className="text-[10px] font-semibold mt-1" style={{ color: CP }}>{c.fee}</p>
                  </button>
                ))}
              </div>
            </div>

            <FormCard stepN={1} title="Enter applicant details" subtitle="Personal and financial information">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First name(s)">
                  <input className={inputCls} placeholder="e.g. Thabo" value={form.firstName} onChange={set("firstName")} />
                </Field>
                <Field label="Last name / surname">
                  <input className={inputCls} placeholder="e.g. Nkosi" value={form.lastName} onChange={set("lastName")} />
                </Field>
                <Field label="SA ID or passport number">
                  <input className={inputCls} placeholder="13-digit ID number" value={form.idNumber} onChange={set("idNumber")} />
                </Field>
                <Field label="Date of birth">
                  <input type="date" className={inputCls} value={form.dob} onChange={set("dob")} />
                </Field>
                <Field label="Mobile number">
                  <input className={inputCls} placeholder="+27 ..." value={form.phone} onChange={set("phone")} />
                </Field>
                <Field label="Email address">
                  <input type="email" className={inputCls} placeholder="email@domain.com" value={form.email} onChange={set("email")} />
                </Field>
                <Field label="Monthly gross income (ZAR)">
                  <input type="number" className={inputCls} placeholder="e.g. 25000" value={form.income} onChange={set("income")} />
                </Field>
                <Field label="Employer / business name">
                  <input className={inputCls} placeholder="Current employer" value={form.employer} onChange={set("employer")} />
                </Field>
                <Field label="Residential address" full>
                  <input className={inputCls} placeholder="Street, suburb, city" value={form.address} onChange={set("address")} />
                </Field>
                <Field label="Postal code">
                  <input className={inputCls} placeholder="0000" maxLength={4} value={form.postalCode} onChange={set("postalCode")} />
                </Field>
                <Field label="Set card PIN">
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      className={inputCls + " pr-10"}
                      placeholder="4-digit PIN"
                      maxLength={4}
                      value={form.pin}
                      onChange={set("pin")}
                    />
                    <button type="button" onClick={() => setShowPin(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Confirm PIN">
                  <input
                    type="password"
                    className={inputCls + (form.confirmPin && form.confirmPin !== form.pin ? " border-red-300 focus:border-red-400" : "")}
                    placeholder="Repeat PIN"
                    maxLength={4}
                    value={form.confirmPin}
                    onChange={set("confirmPin")}
                  />
                  {form.confirmPin && form.confirmPin !== form.pin && (
                    <p className="text-xs text-red-500 mt-1">PINs do not match</p>
                  )}
                </Field>
              </div>
            </FormCard>
          </>
        )}

        {/* STEP 2 — Phone & Email OTP */}
        {step === 2 && (
          <FormCard stepN={2} title="Verify phone number and email address" subtitle="Each contact channel must be verified for FICA compliance">
            <p className="text-sm text-gray-600">Each contact channel must be verified with a one-time PIN for FICA compliance.</p>

            {/* Phone OTP */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Mobile number</p>
                  <p className="text-xs text-gray-500">{form.phone || "+27 ..."}</p>
                </div>
                {phoneVerified
                  ? <VerifiedBadge label="Verified" />
                  : !phoneOtpSent
                    ? <button onClick={() => setPhoneOtpSent(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: CP }}>Send OTP</button>
                    : <span className="text-xs text-amber-600 font-medium">OTP sent</span>
                }
              </div>
              {phoneOtpSent && !phoneVerified && (
                <div className="space-y-3">
                  <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
                  {phoneOtp.length === 6 && (
                    <button onClick={() => setPhoneVerified(true)}
                      className="w-full py-2.5 rounded-lg text-sm font-bold text-white"
                      style={{ background: GREEN }}>Verify</button>
                  )}
                </div>
              )}
              {phoneOtpSent && !phoneVerified && (
                <button onClick={() => { setPhoneOtpSent(false); setPhoneOtp(""); }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
                  <RefreshCw className="w-3 h-3" />Resend OTP
                </button>
              )}
            </div>

            {/* Email OTP */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Email address</p>
                  <p className="text-xs text-gray-500">{form.email || "email@domain.com"}</p>
                </div>
                {emailVerified
                  ? <VerifiedBadge label="Verified" />
                  : !emailOtpSent
                    ? <button onClick={() => setEmailOtpSent(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: CP }}>Send OTP</button>
                    : <span className="text-xs text-amber-600 font-medium">OTP sent</span>
                }
              </div>
              {emailOtpSent && !emailVerified && (
                <div className="space-y-3">
                  <OtpInput value={emailOtp} onChange={setEmailOtp} />
                  {emailOtp.length === 6 && (
                    <button onClick={() => setEmailVerified(true)}
                      className="w-full py-2.5 rounded-lg text-sm font-bold text-white"
                      style={{ background: GREEN }}>Verify</button>
                  )}
                </div>
              )}
              {emailOtpSent && !emailVerified && (
                <button onClick={() => { setEmailOtpSent(false); setEmailOtp(""); }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
                  <RefreshCw className="w-3 h-3" />Resend OTP
                </button>
              )}
            </div>

            {phoneVerified && emailVerified && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold text-green-700 bg-green-50 border border-green-200">
                <CheckCircle className="w-4 h-4" />Both contact channels verified
              </div>
            )}
          </FormCard>
        )}

        {/* STEP 3 — Fingerprint */}
        {step === 3 && (
          <FormCard stepN={3} title="Fingerprint authentication" subtitle="Biometric verification required for FICA compliance">
            <p className="text-sm text-gray-600 leading-relaxed">
              Biometric fingerprint verification is required for FICA compliance. This confirms your identity against the Home Affairs database.
            </p>
            <FingerprintScanner onDone={() => setFingerprintDone(true)} />
            {fingerprintDone && (
              <div className="rounded-xl p-3 text-sm text-green-700 bg-green-50 border border-green-200 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>Fingerprint matched · Home Affairs verification: <strong>Passed</strong></span>
              </div>
            )}
          </FormCard>
        )}

        {/* STEP 4 — Selfie */}
        {step === 4 && (
          <FormCard stepN={4} title="Selfie capture" subtitle="Live selfie for facial recognition and liveness detection">
            <p className="text-sm text-gray-600 leading-relaxed">
              Take a live selfie for facial recognition and liveness detection. This prevents identity theft and meets POCA requirements.
            </p>
            <SelfieCapture onDone={() => setSelfieDone(true)} />
            {selfieDone && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                {[
                  { label: "Liveness check",    pass: true },
                  { label: "Face match",         pass: true },
                  { label: "Document match",     pass: true },
                ].map((c, i) => (
                  <div key={i} className="rounded-xl p-3 text-center border"
                    style={{ borderColor: "#D1FAE5", background: "#F0FDF4" }}>
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
                    <p className="text-[10px] font-semibold text-green-700">{c.label}</p>
                  </div>
                ))}
              </div>
            )}
          </FormCard>
        )}

        {/* STEP 5 — Documents */}
        {step === 5 && (
          <FormCard stepN={5} title="Upload required documents" subtitle="Upload clear, legible scans or photos. PDF, JPG, PNG accepted. Max 10MB per file.">
            <p className="text-sm text-gray-600">Upload clear, legible scans or photos. PDF, JPG, PNG accepted. Max 10MB per file.</p>
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
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(Object.keys(docs).filter(k => docs[k]).length / DOC_SLOTS.filter(d => d.required).length) * 100}%`, background: CP }} />
              </div>
              <span>{Object.keys(docs).filter(k => docs[k]).length}/{DOC_SLOTS.filter(d => d.required).length} required docs</span>
            </div>
          </FormCard>
        )}

        {/* STEP 6 — Director confirmations */}
        {step === 6 && (
          <FormCard stepN={6} title="Director confirmations" subtitle="All directors with ≥25% shareholding must verify">
            <p className="text-sm text-gray-600 leading-relaxed">
              For business credit cards, all directors with ≥25% shareholding must complete OTP, fingerprint, and document verification. For personal cards, the applicant completes this as the sole cardholder.
            </p>
            <div className="rounded-xl border border-gray-200 p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                  style={{ background: CP }}>
                  {(form.firstName[0] || "A").toUpperCase()}{(form.lastName[0] || "B").toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{form.firstName || "Applicant"} {form.lastName}</p>
                  <p className="text-xs text-gray-500">Primary cardholder / Director 1</p>
                </div>
                {dirVerified && <div className="ml-auto"><VerifiedBadge label="Confirmed" /></div>}
              </div>

              {!dirVerified ? (
                <div className="space-y-3 pt-1 border-t border-gray-100">
                  <p className="text-xs text-gray-500">Send confirmation OTP to director</p>
                  <OtpInput value={dirOtp} onChange={setDirOtp} />
                  <button
                    onClick={() => dirOtp.length === 6 && setDirVerified(true)}
                    className="w-full py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: CP }} disabled={dirOtp.length < 6}>
                    Confirm
                  </button>
                  <p className="text-[11px] text-gray-400">
                    Demo: type any 6 digits to simulate director OTP confirmation
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                  {["OTP verified", "Fingerprint", "Documents"].map((label, i) => (
                    <div key={i} className="rounded-lg p-2 text-center border border-green-200 bg-green-50">
                      <CheckCircle className="w-4 h-4 text-green-500 mx-auto mb-0.5" />
                      <p className="text-[10px] font-semibold text-green-700">{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Additional directors can be verified by contacting your VMS relationship manager after card activation.
            </p>
          </FormCard>
        )}

        {/* STEP 7 — Account creation */}
        {step === 7 && !submitted && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                By submitting I confirm all information is true and accurate. I authorise VMS to conduct credit bureau inquiries and verify my identity with SARS, CIPC, and Home Affairs.
              </p>
              <button
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true);
                  setSubmitError("");
                  const result = await applicationsApi.submit({
                    type: "creditCard",
                    subType: CARD_TYPES.find(c => c.id === selectedCard)?.name ?? selectedCard,
                    applicantName: `${form.firstName} ${form.lastName}`.trim(),
                    applicantEmail: form.email,
                    applicantPhone: form.phone,
                    formData: form,
                  });
                  setSubmitting(false);
                  if (result.success && result.data) {
                    setAccountNumber(result.data.referenceNumber);
                    setSubmitted(true);
                  } else {
                    setSubmitError(result.error ?? "Submission failed. Please try again.");
                  }
                }}
                className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                style={{ background: `linear-gradient(135deg,${CP},#9585EA)` }}>
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
              {submitError && <p className="text-red-600 text-sm text-center mt-2">{submitError}</p>}
            </div>
          </div>
        )}
        {step === 7 && submitted && (
          <div className="space-y-5">
            {/* Animated success */}
            <div className="bg-white rounded-2xl border border-green-200 p-8 shadow-sm text-center space-y-4">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "linear-gradient(135deg,#D1FAE5,#A7F3D0)" }}>
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900">Account Created!</h2>
                <p className="text-gray-500 text-sm mt-1">Your Vink credit card has been approved and issued.</p>
              </div>

              {/* Virtual card preview */}
              <div className="rounded-2xl p-5 text-white mx-auto max-w-xs relative overflow-hidden"
                style={{ background: CARD_TYPES.find(c => c.id === selectedCard)?.color ?? "" }}>
                <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/10" />
                <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-white/10" />
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <p className="text-[9px] tracking-widest opacity-60 uppercase">VINK</p>
                      <p className="text-sm font-bold">{CARD_TYPES.find(c => c.id === selectedCard)?.name}</p>
                    </div>
                    <div className="w-9 h-6 rounded bg-yellow-400/70" />
                  </div>
                  <p className="font-mono text-sm tracking-widest mb-3">{accountNumber.slice(0, 4)} •••• •••• {accountNumber.slice(-4)}</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[8px] opacity-55 uppercase">Card Holder</p>
                      <p className="text-xs font-medium">{form.firstName || "Vink"} {form.lastName || "Cardholder"}</p>
                    </div>
                    <p className="text-base font-black italic">VISA</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Account details */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-gray-800 text-sm">Your card details</h3>
              {[
                { label: "Card number",       value: accountNumber },
                { label: "Card type",         value: CARD_TYPES.find(c => c.id === selectedCard)?.name ?? "" },
                { label: "Credit limit",      value: CARD_TYPES.find(c => c.id === selectedCard)?.limit ?? "" },
                { label: "Card expiry",       value: `${new Date().getMonth() + 1 < 10 ? "0" : ""}${new Date().getMonth() + 1}/${new Date().getFullYear() + 3 - 2000}` },
                { label: "Account status",    value: "Active — card being printed" },
                { label: "Reference number",  value: `VMS-CC-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}` },
              ].map((item, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-xs text-gray-500 font-medium">{item.label}</span>
                  <span className="text-xs font-bold text-gray-800">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm text-sm text-gray-600 leading-relaxed">
              <p>📦 Your physical card will be delivered to <strong>{form.address || "your registered address"}</strong> within <strong>5–7 business days</strong>.</p>
              <p className="mt-2">📱 Your virtual card is available immediately in the <strong>VMS app</strong> for online and tap-to-pay transactions.</p>
              <p className="mt-2 text-xs text-gray-400">A welcome email has been sent to {form.email || "your registered email"}.</p>
            </div>

            <button onClick={onClose}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg"
              style={{ background: `linear-gradient(135deg,${CP},#9585EA)` }}>
              Back to VMS Banking
            </button>
          </div>
        )}

        {/* ── Navigation ── */}
        {step < 7 && (
          <NavButtons
            onBack={step > 1 ? back : undefined}
            onNext={next}
            hideBack={step === 1}
          />
        )}
        {step === 7 && !submitted && (
          <NavButtons
            onBack={back}
            onNext={undefined}
          />
        )}
      </div>
    </div>
  );
}
