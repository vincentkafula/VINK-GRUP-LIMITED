import { useState } from "react";
import {
  X, CheckCircle, RefreshCw,
  User, Shield, Fingerprint, Camera, FileText, Users, Smartphone,
} from "lucide-react";
import { applicationsApi } from "../services/applicationsApi";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import {
  AppHero, StepTracker, ProgressBar, FormCard, Field,
  DocSlot, OtpInput, NavButtons, inputCls, selectCls,
  VerifiedBadge, P as CP, GREEN,
} from "./AppFormShell";

interface Props { isOpen: boolean; onClose: () => void; }

const STEPS = [
  { n: 1, label: "Applicant\ndetails",      icon: <User className="w-3.5 h-3.5" /> },
  { n: 2, label: "Phone &\nemail verify",   icon: <Shield className="w-3.5 h-3.5" /> },
  { n: 3, label: "Fingerprint\nauth",       icon: <Fingerprint className="w-3.5 h-3.5" /> },
  { n: 4, label: "Selfie\ncapture",         icon: <Camera className="w-3.5 h-3.5" /> },
  { n: 5, label: "Upload\ndocuments",       icon: <FileText className="w-3.5 h-3.5" /> },
  { n: 6, label: "SIM\npreferences",        icon: <Smartphone className="w-3.5 h-3.5" /> },
  { n: 7, label: "SIM\nactivation",         icon: <CheckCircle className="w-3.5 h-3.5" /> },
];

const SIM_PLANS = [
  { id: "prepaid5",  name: "Prepaid 5GB",    data: "5GB",   sms: "100 SMS",  calls: "60 min",  price: "R99/month",   color: "#6B5ED7" },
  { id: "prepaid10", name: "Prepaid 10GB",   data: "10GB",  sms: "Unlimited", calls: "120 min", price: "R149/month",  color: "#3B82F6" },
  { id: "postpaid",  name: "Postpaid 20GB",  data: "20GB",  sms: "Unlimited", calls: "Unlimited", price: "R249/month", color: "#10B981" },
  { id: "data",      name: "Data Only 30GB", data: "30GB",  sms: "—",        calls: "—",        price: "R199/month",  color: "#F59E0B" },
];

const DOC_SLOTS = [
  { key: "id",      label: "Certified copy of SA ID or passport",          required: true },
  { key: "address", label: "Proof of residential address (≤3 months)",     required: true },
  { key: "selfie",  label: "Clear photo of yourself holding your ID",       required: true },
  { key: "proof",   label: "Proof of payment / bank statement (if porting)", required: false },
];

// ── Fingerprint scanner ────────────────────────────────────────────────────────
function FingerprintScanner({ onDone }: { onDone: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [prog, setProg] = useState(0);
  const [done, setDone] = useState(false);

  const start = () => {
    setScanning(true); setProg(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12 + 5;
      if (p >= 100) { p = 100; clearInterval(iv); setTimeout(() => { setDone(true); setScanning(false); onDone(); }, 400); }
      setProg(p);
    }, 130);
  };

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div onClick={!scanning && !done ? start : undefined}
        className="relative w-40 h-40 rounded-3xl flex items-center justify-center cursor-pointer transition-all select-none"
        style={{
          background: done ? "#D1FAE5" : scanning ? CP + "15" : "#F3F0FB",
          border: `3px solid ${done ? GREEN : scanning ? CP : "#DDD6FE"}`,
          boxShadow: scanning ? `0 0 40px ${CP}35` : done ? `0 0 20px ${GREEN}30` : "none",
        }}>
        <Fingerprint className="w-20 h-20 transition-colors"
          style={{ color: done ? GREEN : scanning ? CP : "#C4B5FD" }} />
        {scanning && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="h-2 bg-white/60 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-150" style={{ width: `${prog}%`, background: CP }} />
            </div>
          </div>
        )}
        {done && (
          <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      <div className="text-center">
        {done ? <><p className="font-bold text-green-700 text-lg">Identity confirmed</p><p className="text-xs text-gray-500 mt-1">Fingerprint matched · FICA compliant</p></>
               : scanning ? <><p className="font-semibold text-gray-700">Scanning… {Math.round(prog)}%</p><p className="text-xs text-gray-400 mt-1">Hold your finger steady on the sensor</p></>
               : <><p className="font-semibold text-gray-700">Tap to scan your fingerprint</p><p className="text-xs text-gray-400 mt-1">Place your index finger on the reader below</p></>
        }
      </div>
    </div>
  );
}

// ── Selfie capture ─────────────────────────────────────────────────────────────
function SelfieCapture({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<"idle" | "countdown" | "done">("idle");
  const [count, setCount] = useState(3);

  const start = () => {
    setState("countdown"); let c = 3; setCount(c);
    const iv = setInterval(() => { c--; setCount(c); if (c === 0) { clearInterval(iv); setTimeout(() => { setState("done"); onDone(); }, 300); } }, 900);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-64 h-64 rounded-3xl overflow-hidden bg-gray-900 flex items-center justify-center">
        {state === "idle" && <div className="flex flex-col items-center gap-3 text-white/60 text-center px-4"><Camera className="w-12 h-12" /><p className="text-sm">Position your face in the frame</p></div>}
        {state === "countdown" && (
          <div className="flex flex-col items-center gap-2">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 h-48 rounded-full border-4 border-white/40 border-dashed" />
            </div>
            <p className="relative z-10 text-6xl font-black text-white">{count}</p>
          </div>
        )}
        {state === "done" && <div className="flex flex-col items-center gap-3 text-white text-center px-4"><CheckCircle className="w-14 h-14 text-green-400" /><p className="text-sm font-semibold text-green-300">Photo captured</p></div>}
        {state !== "done" && (
          <>{["top-3 left-3 border-t-2 border-l-2", "top-3 right-3 border-t-2 border-r-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"].map((c, i) => (
            <div key={i} className={`absolute w-6 h-6 ${c} border-white/50 rounded-sm`} />
          ))}</>
        )}
      </div>
      {state === "idle" && (
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <button onClick={start} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: CP }}>Take Selfie</button>
          <p className="text-xs text-gray-400 text-center">Good lighting · No glasses · Face forward</p>
          <label className="w-full text-center cursor-pointer text-sm font-semibold py-2.5 rounded-xl border-2 hover:opacity-80 transition-all" style={{ borderColor: CP, color: CP }}>
            Upload a photo instead
            <input type="file" accept="image/*" className="hidden" onChange={() => { setState("done"); onDone(); }} />
          </label>
        </div>
      )}
      {state === "done" && (
        <div className="text-center space-y-1">
          <p className="font-bold text-green-700">Liveness check passed</p>
          <button onClick={() => setState("idle")} className="text-xs text-gray-400 underline hover:text-gray-700">Retake</button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function VMSSIMApplicationViewer({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [fingerprintDone, setFingerprintDone] = useState(false);
  const [selfieDone, setSelfieDone] = useState(false);
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({ firstName: "", lastName: "", idNumber: "", dob: "", phone: "+27 ", email: "", address: "", postalCode: "" });
  const [phoneOtp, setPhoneOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("prepaid5");
  const [simType, setSimType] = useState<"physical" | "esim">("physical");
  const [portNumber, setPortNumber] = useState("");
  const [wantToPort, setWantToPort] = useState(false);
  const [dirOtp, setDirOtp] = useState("");
  const [dirConfirmed, setDirConfirmed] = useState(false);

  const [iccid] = useState(`8927${Math.floor(Math.random() * 1e15).toString().slice(0, 15)}`);
  const [msisdn] = useState(`+2782${Math.floor(Math.random() * 9000000 + 1000000)}`);

  if (!isOpen) return null;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const next = () => setStep(s => Math.min(s + 1, 7));
  const back = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#F8F7FF]">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-gray-400 font-medium">Step {step} of {STEPS.length}</span>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 pb-4 space-y-3">
          <StepTracker steps={STEPS} current={step} />
          <ProgressBar value={progress} />
        </div>
      </div>

      <AppHero
        tag="VMS MVNO · Cell C Network · ICASA Licensed"
        title="Get Your Vink SIM Card"
        subtitle="Stay connected on South Africa's fastest network. Choose your plan, verify your identity, and get your SIM activated in minutes."
        gradient="linear-gradient(135deg,#1a0533 0%,#3B2D9E 45%,#6B5ED7 100%)"
      />

      <div className="max-w-2xl mx-auto w-full px-5 py-8 space-y-5">

        {/* Step 1 — Applicant details */}
        {step === 1 && (
          <FormCard stepN={1} title="Enter applicant details" subtitle="Fill in your personal information for FICA compliance">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name(s)" required>
                <input className={inputCls} placeholder="e.g. Thabo" value={form.firstName} onChange={set("firstName")} />
              </Field>
              <Field label="Surname" required>
                <input className={inputCls} placeholder="e.g. Nkosi" value={form.lastName} onChange={set("lastName")} />
              </Field>
              <Field label="SA ID or passport number" required>
                <input className={inputCls} placeholder="13-digit ID number" value={form.idNumber} onChange={set("idNumber")} />
              </Field>
              <Field label="Date of birth" required>
                <input type="date" className={inputCls} value={form.dob} onChange={set("dob")} />
              </Field>
              <Field label="Mobile number" required>
                <input className={inputCls} placeholder="+27 ..." value={form.phone} onChange={set("phone")} />
              </Field>
              <Field label="Email address" required>
                <input type="email" className={inputCls} placeholder="email@domain.com" value={form.email} onChange={set("email")} />
              </Field>
              <Field label="Residential address" required full>
                <input className={inputCls} placeholder="Street, suburb, city" value={form.address} onChange={set("address")} />
              </Field>
              <Field label="Postal code" required>
                <input className={inputCls} placeholder="0000" maxLength={4} value={form.postalCode} onChange={set("postalCode")} />
              </Field>
            </div>
          </FormCard>
        )}

        {/* Step 2 — Verify phone & email */}
        {step === 2 && (
          <FormCard stepN={2} title="Verify your phone number and email address" subtitle="Each channel receives a one-time PIN for confirmation">
            <p className="text-xs text-gray-500">RICA and FICA require verification of both contact channels before SIM activation.</p>
            {/* Phone OTP */}
            <div className="rounded-2xl border-2 p-4 space-y-3 transition-all" style={{ borderColor: phoneVerified ? GREEN + "50" : "#E5E7EB", background: phoneVerified ? GREEN + "04" : "#FAFAFA" }}>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-semibold text-gray-800">Mobile number</p><p className="text-xs text-gray-500">{form.phone || "+27 ..."}</p></div>
                {phoneVerified ? <VerifiedBadge label="Verified" />
                  : !phoneOtpSent ? <button onClick={() => setPhoneOtpSent(true)} className="text-xs font-bold px-4 py-2 rounded-xl text-white shadow-sm" style={{ background: CP }}>Send OTP</button>
                  : <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded-lg">Sent ✉️</span>}
              </div>
              {phoneOtpSent && !phoneVerified && (
                <div className="space-y-3">
                  <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
                  <div className="flex justify-between items-center">
                    <button onClick={() => { setPhoneOtpSent(false); setPhoneOtp(""); }} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700"><RefreshCw className="w-3 h-3" />Resend</button>
                    {phoneOtp.length === 6 && <button onClick={() => setPhoneVerified(true)} className="text-xs font-bold px-4 py-2 rounded-xl text-white" style={{ background: GREEN }}>Verify ✓</button>}
                  </div>
                </div>
              )}
            </div>
            {/* Email OTP */}
            <div className="rounded-2xl border-2 p-4 space-y-3 transition-all" style={{ borderColor: emailVerified ? GREEN + "50" : "#E5E7EB", background: emailVerified ? GREEN + "04" : "#FAFAFA" }}>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-semibold text-gray-800">Email address</p><p className="text-xs text-gray-500">{form.email || "email@domain.com"}</p></div>
                {emailVerified ? <VerifiedBadge label="Verified" />
                  : !emailOtpSent ? <button onClick={() => setEmailOtpSent(true)} className="text-xs font-bold px-4 py-2 rounded-xl text-white shadow-sm" style={{ background: CP }}>Send OTP</button>
                  : <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded-lg">Sent ✉️</span>}
              </div>
              {emailOtpSent && !emailVerified && (
                <div className="space-y-3">
                  <OtpInput value={emailOtp} onChange={setEmailOtp} />
                  <div className="flex justify-between items-center">
                    <button onClick={() => { setEmailOtpSent(false); setEmailOtp(""); }} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700"><RefreshCw className="w-3 h-3" />Resend</button>
                    {emailOtp.length === 6 && <button onClick={() => setEmailVerified(true)} className="text-xs font-bold px-4 py-2 rounded-xl text-white" style={{ background: GREEN }}>Verify ✓</button>}
                  </div>
                </div>
              )}
            </div>
            {phoneVerified && emailVerified && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold text-green-700 bg-green-50 border border-green-200">
                <CheckCircle className="w-4 h-4" />Both contact channels verified — RICA compliant
              </div>
            )}
          </FormCard>
        )}

        {/* Step 3 — Fingerprint */}
        {step === 3 && (
          <FormCard stepN={3} title="Fingerprint authentication" subtitle="Biometric verification required by RICA for SIM registration">
            <p className="text-sm text-gray-600 leading-relaxed">Your fingerprint is matched against the Home Affairs database to confirm your identity and comply with the Regulation of Interception of Communications Act (RICA).</p>
            <FingerprintScanner onDone={() => setFingerprintDone(true)} />
            {fingerprintDone && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold text-green-700 bg-green-50 border border-green-200">
                <CheckCircle className="w-4 h-4" />Fingerprint matched · Home Affairs: PASS · RICA compliant
              </div>
            )}
          </FormCard>
        )}

        {/* Step 4 — Selfie */}
        {step === 4 && (
          <FormCard stepN={4} title="Selfie capture" subtitle="Live photo for facial recognition and liveness detection">
            <p className="text-sm text-gray-600 leading-relaxed">A live selfie prevents impersonation and meets SIM registration requirements under the Electronic Communications Act.</p>
            <SelfieCapture onDone={() => setSelfieDone(true)} />
            {selfieDone && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                {["Liveness check", "Face match", "RICA check"].map((c, i) => (
                  <div key={i} className="rounded-xl p-3 text-center border border-green-200 bg-green-50">
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
                    <p className="text-[10px] font-bold text-green-700">{c}</p>
                  </div>
                ))}
              </div>
            )}
          </FormCard>
        )}

        {/* Step 5 — Documents */}
        {step === 5 && (
          <FormCard stepN={5} title="Upload required documents" subtitle="Clear scans or photos · PDF, JPG, PNG · Max 10MB each">
            <div className="space-y-2">
              {DOC_SLOTS.map(d => (
                <DocSlot key={d.key} label={d.label} required={d.required}
                  uploaded={!!docs[d.key]} onUpload={() => setDocs(p => ({ ...p, [d.key]: true }))} />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${(Object.values(docs).filter(Boolean).length / DOC_SLOTS.filter(d => d.required).length) * 100}%`, background: CP }} />
              </div>
              <span className="text-xs text-gray-600 font-medium">{Object.values(docs).filter(Boolean).length}/{DOC_SLOTS.filter(d => d.required).length} required</span>
            </div>
          </FormCard>
        )}

        {/* Step 6 — SIM preferences */}
        {step === 6 && (
          <>
            <FormCard stepN={6} title="Choose your SIM plan" subtitle="Select the data and call bundle that suits your lifestyle">
              <div className="grid sm:grid-cols-2 gap-3">
                {SIM_PLANS.map(p => (
                  <button key={p.id} onClick={() => setSelectedPlan(p.id)}
                    className="rounded-2xl p-4 text-left border-2 transition-all hover:scale-[1.01]"
                    style={{ borderColor: selectedPlan === p.id ? p.color : "#E5E7EB", background: selectedPlan === p.id ? p.color + "08" : "#fff" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wide" style={{ color: p.color }}>{p.name}</span>
                      <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all" style={{ borderColor: selectedPlan === p.id ? p.color : "#D1D5DB" }}>
                        {selectedPlan === p.id && <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />}
                      </div>
                    </div>
                    <p className="text-2xl font-black text-gray-900 mb-1">{p.data}</p>
                    <p className="text-xs text-gray-500">{p.sms} · {p.calls}</p>
                    <p className="text-sm font-bold mt-2" style={{ color: p.color }}>{p.price}</p>
                  </button>
                ))}
              </div>
            </FormCard>

            <FormCard stepN={6} title="SIM type &amp; number" subtitle="Choose physical SIM or eSIM, and keep your number if porting">
              <div className="grid grid-cols-2 gap-3 mb-4">
                {([["physical", "📦 Physical SIM"], ["esim", "📲 eSIM"]] as const).map(([type, label]) => (
                  <button key={type} onClick={() => setSimType(type)}
                    className="py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all"
                    style={{ borderColor: simType === type ? CP : "#E5E7EB", background: simType === type ? CP + "08" : "#fff", color: simType === type ? CP : "#6B7280" }}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={wantToPort} onChange={e => setWantToPort(e.target.checked)} className="w-4 h-4 rounded accent-purple-700" />
                <span className="text-sm text-gray-700 font-medium">I want to port my existing number to Vink</span>
              </label>
              {wantToPort && (
                <div className="mt-3">
                  <Field label="Current mobile number to port">
                    <input className={inputCls} placeholder="+27 ..." value={portNumber} onChange={e => setPortNumber(e.target.value)} />
                  </Field>
                  <p className="text-xs text-gray-400 mt-1.5">Number porting takes 24–48 hours. Your current SIM remains active until porting is complete.</p>
                </div>
              )}
            </FormCard>
          </>
        )}

        {/* Step 7 — Activation / success */}
        {step === 7 && !submitted && (
          <FormCard stepN={7} title="Review &amp; confirm your SIM application" subtitle="Double-check your details before activation">
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { label: "Full name",   value: `${form.firstName} ${form.lastName}` || "—" },
                { label: "ID number",   value: form.idNumber || "—" },
                { label: "Mobile",      value: form.phone || "—" },
                { label: "Email",       value: form.email || "—" },
                { label: "Plan",        value: SIM_PLANS.find(p => p.id === selectedPlan)?.name ?? "—" },
                { label: "SIM type",    value: simType === "physical" ? "Physical SIM" : "eSIM" },
                { label: "Porting",     value: wantToPort && portNumber ? portNumber : "New number" },
                { label: "Documents",   value: `${Object.values(docs).filter(Boolean).length} uploaded` },
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mt-2">
              By activating your Vink SIM you confirm that all information provided is accurate and that you consent to RICA registration, VMS&apos;s Privacy Policy, and the Cell C network Terms of Service.
            </p>
            <button
              onClick={async () => {
                await applicationsApi.submit({ type: "sim-application", applicantName: `${form.firstName} ${form.lastName}`.trim() || "Applicant", applicantEmail: form.email, applicantPhone: form.phone, formData: form as unknown as Record<string,unknown> }).catch(() => null);
                setSubmitted(true);
              }}
              className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:opacity-90 shadow-lg mt-2"
              style={{ background: `linear-gradient(135deg,${CP},#9585EA)`, boxShadow: `0 6px 24px ${CP}35` }}>
              Activate My Vink SIM →
            </button>
          </FormCard>
        )}

        {/* SUCCESS */}
        {submitted && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-green-200 p-8 text-center space-y-4 shadow-sm">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto" style={{ background: "linear-gradient(135deg,#D1FAE5,#A7F3D0)" }}>
                <Smartphone className="w-12 h-12 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900">SIM Activated!</h2>
                <p className="text-gray-500 text-sm mt-1">Your Vink SIM has been registered and activated on the Cell C network.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl p-4" style={{ background: "#F3F0FB" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Your mobile number</p>
                  <p className="text-lg font-black" style={{ color: CP }}>{wantToPort && portNumber ? portNumber : msisdn}</p>
                </div>
                <div className="rounded-xl p-4" style={{ background: "#F3F0FB" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">ICCID / SIM serial</p>
                  <p className="text-sm font-black text-gray-700 font-mono">{iccid.slice(0, 10)}…</p>
                </div>
              </div>
              <div className="rounded-xl p-4 bg-gray-50">
                <p className="text-xs text-gray-500"><strong>Active plan:</strong> {SIM_PLANS.find(p => p.id === selectedPlan)?.name} · {SIM_PLANS.find(p => p.id === selectedPlan)?.price}</p>
                <p className="text-xs text-gray-500 mt-1"><strong>SIM type:</strong> {simType === "physical" ? "Physical SIM card will be delivered in 3–5 business days" : "eSIM QR code sent to " + form.email}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-3.5 rounded-xl text-sm font-bold text-white shadow-lg" style={{ background: `linear-gradient(135deg,${CP},#9585EA)` }}>
              Back to VMS
            </button>
          </div>
        )}

        {/* Nav */}
        {!submitted && (
          <NavButtons onBack={step > 1 ? back : undefined} onNext={step < 7 ? next : undefined} hideBack={step === 1} />
        )}
      </div>
    </div>
  );
}
