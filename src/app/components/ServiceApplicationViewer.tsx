/**
 * Universal 7-step application form for:
 *   invest | insure | rewards | sim
 *
 * Steps 2–6 (OTP, fingerprint, selfie, documents, director) are shared.
 * Steps 1 and 7 adapt to each service type.
 */
import { useState, useCallback } from "react";
import {
  X, CheckCircle, Fingerprint, Camera, RefreshCw,
  User, Shield, FileText, Users, Star, Eye, EyeOff,
} from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import {
  AppHero, StepTracker, ProgressBar, FormCard,
  Field, DocSlot, OtpInput, NavButtons,
  inputCls, selectCls, VerifiedBadge,
  P as CP, GREEN,
} from "./AppFormShell";
import { applicationsApi, otpApi } from "../services/applicationsApi";
import { useFormValidation, validators } from "../hooks/useFormValidation";
import { InlineError } from "./ErrorBoundary";

// ─── Types ────────────────────────────────────────────────────────────────────
type ServiceType = "invest" | "insure" | "rewards" | "sim" | "account";

interface Props { isOpen: boolean; onClose: () => void; serviceType: ServiceType; }

// ─── Per-service config ───────────────────────────────────────────────────────
const SERVICE_CONFIG: Record<ServiceType, {
  tag: string; title: string; subtitle: string; gradient: string;
  successTitle: string; successBody: string; accountLabel: string;
  accountPrefix: string; accentColor: string;
}> = {
  invest: {
    tag:           "VINK Personal Banking · Investments",
    title:         "Investment Account Application",
    subtitle:      "Open a Tax-Free Savings Account, Fixed Deposit, Unit Trust, Retirement Annuity or Money Market — verified in minutes.",
    gradient:      "linear-gradient(135deg,#0F4C81 0%,#1565C0 50%,#42A5F5 100%)",
    successTitle:  "Investment Account Opened!",
    successBody:   "Your investment account is active. Access it via the VINK app or web portal.",
    accountLabel:  "Investment account number",
    accountPrefix: "VINK-INV",
    accentColor:   "#1565C0",
  },
  insure: {
    tag:           "VINK Personal Banking · Insurance",
    title:         "Insurance Policy Application",
    subtitle:      "Apply for Life Cover, Disability, Funeral Plan, Home Contents, Motor Insurance or Hospital Cash Plan.",
    gradient:      "linear-gradient(135deg,#1B5E20 0%,#2E7D32 50%,#66BB6A 100%)",
    successTitle:  "Policy Activated!",
    successBody:   "Your insurance policy is active. Your policy schedule will be emailed to you within 2 business hours.",
    accountLabel:  "Policy number",
    accountPrefix: "VINK-INS",
    accentColor:   "#2E7D32",
  },
  rewards: {
    tag:           "VINK Personal Banking · VinkPoints",
    title:         "VinkPoints Rewards Enrolment",
    subtitle:      "Enrol in VinkPoints to earn on every taxi ride, fuel purchase, grocery trip, and online spend.",
    gradient:      "linear-gradient(135deg,#7B1FA2 0%,#AB47BC 50%,#CE93D8 100%)",
    successTitle:  "VinkPoints Account Created!",
    successBody:   "You have been enrolled in VinkPoints. Your welcome bonus of 5,000 points (worth R50) has been credited.",
    accountLabel:  "VinkPoints member number",
    accountPrefix: "VINK-RWD",
    accentColor:   "#AB47BC",
  },
  sim: {
    tag:           "VINK MVNO · Cell C Network",
    title:         "Vink SIM Card Application",
    subtitle:      "Get your Vink SIM on the Cell C network — affordable data, calls, and SMS bundled with your Vink wallet.",
    gradient:      "linear-gradient(135deg,#E65100 0%,#F57C00 50%,#FFB74D 100%)",
    successTitle:  "SIM Card Issued!",
    successBody:   "Your Vink SIM card will be delivered to your address within 3–5 business days. Your number is active immediately.",
    accountLabel:  "MSISDN / mobile number",
    accountPrefix: "VINK-SIM",
    accentColor:   "#F57C00",
  },
  account: {
    tag:           "VINK Personal Banking · Accounts",
    title:         "Bank Account Application",
    subtitle:      "Open your selected Vink account in minutes — FICA-verified and ready to use.",
    gradient:      "linear-gradient(135deg,#1A237E 0%,#3949AB 55%,#5C6BC0 100%)",
    successTitle:  "Account Opened!",
    successBody:   "Your Vink bank account is active. Your Vink card will be delivered to your registered address within 5–7 business days.",
    accountLabel:  "Account number",
    accountPrefix: "VINK-ACC",
    accentColor:   "#3949AB",
  },
};

// ─── Per-service Step 1 form fields ──────────────────────────────────────────
type FormState = Record<string, string>;

const ACCOUNT_TYPES = [
  "Clear Access Account (R0/month)", "Everyday Checking Account (R0/month)",
  "Prime Checking Account (R85/month)", "Premier Checking Account (R170/month)",
  "Grain Account (R265/month)", "Animal Account (R415/month)",
];

const INVEST_PRODUCTS = [
  "Tax-Free Savings Account", "Fixed Deposit (3 months)", "Fixed Deposit (6 months)",
  "Fixed Deposit (12 months)", "Fixed Deposit (24 months)",
  "Unit Trust — Money Market", "Unit Trust — Balanced Fund", "Unit Trust — Equity Fund",
  "Retirement Annuity", "Endowment Policy", "Money Market Account",
];
const INSURE_PRODUCTS = [
  "Life Cover", "Disability Cover", "Funeral Plan", "Home Contents Insurance",
  "Motor Insurance (Comprehensive)", "Motor Insurance (Third Party)", "Hospital Cash Plan",
];
const SIM_PLANS = [
  "Pay-as-you-go (no monthly fee)", "Starter 1GB — R49/month",
  "Essential 3GB — R99/month", "Plus 10GB — R199/month",
  "Unlimited Calls & 5GB — R299/month",
];
const REWARD_CARDS = [
  "Balance Transfer Card", "Cash Back Card", "Fuel Rewards Card",
  "Retail Rewards Card", "Travel Rewards Card", "Automotive Rewards Card",
];

function Step1Form({
  type, form, set,
}: { type: ServiceType; form: FormState; set: (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="First name(s)" required><input className={inputCls} placeholder="e.g. Thabo" value={form.firstName} onChange={set("firstName")} /></Field>
      <Field label="Surname" required><input className={inputCls} placeholder="e.g. Nkosi" value={form.lastName} onChange={set("lastName")} /></Field>
      <Field label="SA ID or passport number" required><input className={inputCls} placeholder="13-digit ID number" value={form.idNumber} onChange={set("idNumber")} /></Field>
      <Field label="Date of birth" required><input type="date" className={inputCls} value={form.dob} onChange={set("dob")} /></Field>
      <Field label="Mobile number" required><input className={inputCls} placeholder="+27 ..." value={form.phone} onChange={set("phone")} /></Field>
      <Field label="Email address" required><input type="email" className={inputCls} placeholder="email@domain.com" value={form.email} onChange={set("email")} /></Field>
      <Field label="Residential address" required full><input className={inputCls} placeholder="Street, suburb, city, postal code" value={form.address} onChange={set("address")} /></Field>

      {/* Service-specific fields */}
      {type === "invest" && (
        <>
          <Field label="Select investment product" required full>
            <select className={selectCls} value={form.product} onChange={set("product")}>
              <option value="">Choose product…</option>
              {INVEST_PRODUCTS.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Initial investment amount (ZAR)" required>
            <input type="number" className={inputCls} placeholder="e.g. 5000" value={form.amount} onChange={set("amount")} />
          </Field>
          <Field label="Monthly contribution (ZAR)">
            <input type="number" className={inputCls} placeholder="Optional recurring amount" value={form.monthly} onChange={set("monthly")} />
          </Field>
        </>
      )}
      {type === "insure" && (
        <>
          <Field label="Select insurance product" required full>
            <select className={selectCls} value={form.product} onChange={set("product")}>
              <option value="">Choose product…</option>
              {INSURE_PRODUCTS.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Cover amount required (ZAR)" required>
            <input type="number" className={inputCls} placeholder="e.g. 1000000" value={form.coverAmount} onChange={set("coverAmount")} />
          </Field>
          <Field label="Any pre-existing conditions / vehicle details">
            <input className={inputCls} placeholder="Optional — declare if applicable" value={form.extras} onChange={set("extras")} />
          </Field>
        </>
      )}
      {type === "rewards" && (
        <>
          <Field label="Select rewards card to link" required full>
            <select className={selectCls} value={form.product} onChange={set("product")}>
              <option value="">Choose rewards card…</option>
              {REWARD_CARDS.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Linked Vink card number (if existing)">
            <input className={inputCls} placeholder="Leave blank to apply for new card" value={form.cardNumber} onChange={set("cardNumber")} />
          </Field>
          <Field label="Preferred redemption method">
            <select className={selectCls} value={form.redemption} onChange={set("redemption")}>
              <option value="">Select…</option>
              {["Taxi fare credit", "Airtime top-up", "Grocery voucher", "Cash to wallet", "Fuel rebate"].map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </>
      )}
      {type === "sim" && (
        <>
          <Field label="Select SIM plan" required full>
            <select className={selectCls} value={form.plan} onChange={set("plan")}>
              <option value="">Choose plan…</option>
              {SIM_PLANS.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Number preference" required>
            <select className={selectCls} value={form.numPref} onChange={set("numPref")}>
              <option value="any">Any available number</option>
              <option value="port">Port my existing number</option>
            </select>
          </Field>
          <Field label="Existing number to port (if applicable)">
            <input className={inputCls} placeholder="+27 ... (only if porting)" value={form.portNumber} onChange={set("portNumber")} />
          </Field>
        </>
      )}
      {type === "account" && (
        <>
          <Field label="Selected account type" required full>
            <select className={selectCls} value={form.product} onChange={set("product")}>
              <option value="">Choose account…</option>
              {ACCOUNT_TYPES.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Monthly gross income (ZAR)" required>
            <input type="number" className={inputCls} placeholder="e.g. 25000" value={form.income} onChange={set("income")} />
          </Field>
          <Field label="Employment status" required>
            <select className={selectCls} value={form.extras} onChange={set("extras")}>
              <option value="">Select…</option>
              {["Permanently employed", "Self-employed / Business owner", "Contract / Temp", "Student", "Retired", "Taxi driver / Operator", "Unemployed"].map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

// ─── Per-service documents ────────────────────────────────────────────────────
const SERVICE_DOCS: Record<ServiceType, { key: string; label: string; required: boolean }[]> = {
  invest: [
    { key: "id",      label: "Certified copy of SA ID or passport",          required: true },
    { key: "address", label: "Proof of residential address (≤3 months)",     required: true },
    { key: "tax",     label: "SARS income tax number confirmation",           required: true },
    { key: "bank",    label: "Latest 3 months' bank statements",              required: true },
    { key: "source",  label: "Proof of source of funds",                      required: false },
  ],
  insure: [
    { key: "id",      label: "Certified copy of SA ID or passport",          required: true },
    { key: "address", label: "Proof of residential address (≤3 months)",     required: true },
    { key: "income",  label: "Latest 3 months' payslips or bank statements", required: true },
    { key: "vehicle", label: "Vehicle registration / licence disc (if motor)", required: false },
    { key: "home",    label: "Municipal rates / lease agreement (if home contents)", required: false },
  ],
  rewards: [
    { key: "id",      label: "Certified copy of SA ID or passport",          required: true },
    { key: "address", label: "Proof of residential address (≤3 months)",     required: true },
    { key: "card",    label: "Photo of existing Vink card (if linking)",     required: false },
  ],
  sim: [
    { key: "id",      label: "Certified copy of SA ID or passport (RICA)",   required: true },
    { key: "address", label: "Proof of residential address (RICA required)", required: true },
    { key: "port",    label: "Port authorisation form (if porting number)",  required: false },
  ],
  account: [
    { key: "id",      label: "Certified copy of SA ID or Smart Card",        required: true },
    { key: "address", label: "Proof of residential address (≤3 months)",     required: true },
    { key: "income",  label: "Latest 3 months' payslips or bank statements", required: true },
    { key: "tax",     label: "SARS income tax number",                       required: false },
  ],
};

// ─── Fingerprint scanner (preserved from CreditCardApp) ──────────────────────
function FingerprintScanner({ onDone, accentColor }: { onDone: () => void; accentColor: string }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const startScan = () => {
    setScanning(true); setProgress(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12 + 4;
      if (p >= 100) { p = 100; clearInterval(iv); setTimeout(() => { setDone(true); setScanning(false); onDone(); }, 400); }
      setProgress(p);
    }, 150);
  };

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div
        className="relative w-36 h-36 rounded-3xl flex items-center justify-center cursor-pointer transition-all select-none"
        style={{ background: done ? "#D1FAE5" : scanning ? accentColor + "15" : "#F3F0FB", border: `3px solid ${done ? GREEN : scanning ? accentColor : "#DDD6FE"}`, boxShadow: scanning ? `0 0 30px ${accentColor}30` : "none" }}
        onClick={!scanning && !done ? () => { setAttempt(a => a + 1); startScan(); } : undefined}
      >
        <Fingerprint className="w-16 h-16 transition-colors" style={{ color: done ? GREEN : scanning ? accentColor : "#C4B5FD" }} />
        {scanning && (
          <div className="absolute bottom-3 left-3 right-3">
            <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-150" style={{ width: `${progress}%`, background: accentColor }} />
            </div>
          </div>
        )}
        {done && <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>}
      </div>
      {done ? (
        <div className="text-center">
          <p className="font-bold text-green-700">Fingerprint verified</p>
          <p className="text-xs text-gray-500 mt-0.5">Identity confirmed successfully</p>
        </div>
      ) : scanning ? (
        <div className="text-center"><p className="font-semibold text-gray-700">Scanning… {Math.round(progress)}%</p><p className="text-xs text-gray-400 mt-0.5">Hold your finger steady</p></div>
      ) : (
        <div className="text-center"><p className="font-semibold text-gray-700">{attempt === 0 ? "Tap to scan fingerprint" : "Tap again to retry"}</p><p className="text-xs text-gray-400 mt-0.5">Place your index finger on the reader</p></div>
      )}
    </div>
  );
}

// ─── Selfie capture ───────────────────────────────────────────────────────────
function SelfieCapture({ onDone, accentColor }: { onDone: () => void; accentColor: string }) {
  const [state, setState] = useState<"idle" | "countdown" | "captured">("idle");
  const [count, setCount] = useState(3);

  const startCapture = () => {
    setState("countdown"); let c = 3; setCount(c);
    const iv = setInterval(() => { c--; setCount(c); if (c === 0) { clearInterval(iv); setTimeout(() => { setState("captured"); onDone(); }, 300); } }, 900);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-64 h-64 rounded-3xl overflow-hidden bg-gray-900 flex items-center justify-center">
        {state === "idle" && <div className="flex flex-col items-center gap-3 text-white/60 text-center px-4"><Camera className="w-12 h-12" /><p className="text-sm">Position your face in the frame</p></div>}
        {state === "countdown" && <div className="flex flex-col items-center gap-2"><div className="absolute inset-0 flex items-center justify-center"><div className="w-40 h-48 rounded-full border-4 border-dashed" style={{ borderColor: accentColor + "80" }} /></div><p className="relative z-10 text-6xl font-black text-white" style={{ textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>{count}</p></div>}
        {state === "captured" && <div className="flex flex-col items-center gap-3 text-white text-center px-4"><CheckCircle className="w-14 h-14 text-green-400" /><p className="text-sm font-semibold text-green-300">Photo captured</p></div>}
        {state !== "captured" && (<><div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 rounded-tl" style={{ borderColor: accentColor }} /><div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 rounded-tr" style={{ borderColor: accentColor }} /><div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 rounded-bl" style={{ borderColor: accentColor }} /><div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 rounded-br" style={{ borderColor: accentColor }} /></>)}
      </div>
      {state === "idle" && (
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <button onClick={startCapture} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: accentColor }}>Take Selfie</button>
          <p className="text-xs text-gray-400 text-center">Good lighting · No glasses · Face forward</p>
          <div className="flex items-center gap-2 w-full"><div className="flex-1 h-px bg-gray-200" /><span className="text-xs text-gray-400">or</span><div className="flex-1 h-px bg-gray-200" /></div>
          <label className="w-full text-center cursor-pointer text-sm font-semibold py-2.5 rounded-xl border-2 hover:opacity-80 transition-all" style={{ borderColor: accentColor, color: accentColor }}>Upload a clear photo<input type="file" accept="image/*" className="hidden" onChange={() => { setState("captured"); onDone(); }} /></label>
        </div>
      )}
      {state === "captured" && <div className="text-center space-y-2"><p className="font-bold text-green-700">Selfie captured</p><p className="text-xs text-gray-500">Liveness check · Face match · Passed</p><button onClick={() => setState("idle")} className="text-xs text-gray-400 hover:text-gray-700 underline">Retake photo</button></div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ServiceApplicationViewer({ isOpen, onClose, serviceType }: Props) {
  const cfg = SERVICE_CONFIG[serviceType];
  const docs = SERVICE_DOCS[serviceType];

  const STEPS = [
    { n: 1, label: "Applicant\ndetails",       icon: <User className="w-3.5 h-3.5" /> },
    { n: 2, label: "Phone &\nemail verify",    icon: <Shield className="w-3.5 h-3.5" /> },
    { n: 3, label: "Fingerprint\nauth",        icon: <Fingerprint className="w-3.5 h-3.5" /> },
    { n: 4, label: "Selfie\ncapture",          icon: <Camera className="w-3.5 h-3.5" /> },
    { n: 5, label: "Upload\ndocuments",        icon: <FileText className="w-3.5 h-3.5" /> },
    { n: 6, label: "Director\nconfirm",        icon: <Users className="w-3.5 h-3.5" /> },
    { n: 7, label: "Account\ncreation",        icon: <Star className="w-3.5 h-3.5" /> },
  ];

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({ firstName: "", lastName: "", idNumber: "", dob: "", phone: "+27 ", email: "", address: "", product: "", amount: "", monthly: "", coverAmount: "", extras: "", cardNumber: "", redemption: "", plan: "", numPref: "any", portNumber: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Step 2
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  // Step 3 & 4
  const [fpDone, setFpDone] = useState(false);
  const [selfieDone, setSelfieDone] = useState(false);

  // Step 5
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, boolean>>({});

  // Step 6
  const [dirOtp, setDirOtp] = useState("");
  const [dirVerified, setDirVerified] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");

  // Step 7
  const [submitted, setSubmitted] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [accountNo, setAccountNo] = useState(`${cfg.accountPrefix}-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Step 1 validation
  const { errors: step1Errors, validate: validateStep1, clearError } = useFormValidation(form, {
    firstName:  validators.required("First name"),
    lastName:   validators.required("Surname"),
    idNumber:   validators.saId(),
    phone:      validators.saPhone(),
    email:      validators.email(),
    address:    validators.required("Residential address"),
  });
  const [step1Submitted, setStep1Submitted] = useState(false);

  // OTP send via real Supabase API
  const sendPhoneOtp = useCallback(async () => {
    const r = await otpApi.send(form.phone, "sms");
    setPhoneOtpSent(true);
    if (r.data && (r.data as { demoCode?: string }).demoCode) {
      console.info("Demo OTP (phone):", (r.data as { demoCode: string }).demoCode);
    }
  }, [form.phone]);

  const sendEmailOtp = useCallback(async () => {
    const r = await otpApi.send(form.email, "email");
    setEmailOtpSent(true);
    if (r.data && (r.data as { demoCode?: string }).demoCode) {
      console.info("Demo OTP (email):", (r.data as { demoCode: string }).demoCode);
    }
  }, [form.email]);

  const verifyPhoneOtp = useCallback(async () => {
    const r = await otpApi.verify(form.phone, phoneOtp);
    if (r.success) setPhoneVerified(true);
  }, [form.phone, phoneOtp]);

  const verifyEmailOtp = useCallback(async () => {
    const r = await otpApi.verify(form.email, emailOtp);
    if (r.success) setEmailVerified(true);
  }, [form.email, emailOtp]);

  if (!isOpen) return null;

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const next = () => setStep(s => Math.min(s + 1, 7));
  const back = () => setStep(s => Math.max(s - 1, 1));
  const reqDocs = docs.filter(d => d.required).length;
  const doneReqDocs = docs.filter(d => d.required && uploadedDocs[d.key]).length;

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
      <AppHero tag={cfg.tag} title={cfg.title} subtitle={cfg.subtitle} gradient={cfg.gradient} />

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto w-full px-5 py-8 space-y-5">

        {/* STEP 1 — Applicant details */}
        {step === 1 && (
          <FormCard stepN={1} stepColor={cfg.accentColor} title="Enter applicant details"
            subtitle="Fill in your personal information to get started.">
            <Step1Form type={serviceType} form={form} set={(k) => (e) => { clearError(k as keyof FormState); set(k)(e); }} />
            {/* Field-level error messages */}
            {step1Submitted && Object.entries(step1Errors).map(([field, msg]) => msg && (
              <div key={field} className="flex items-start gap-1.5 text-xs text-red-600">
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span><strong className="capitalize">{field.replace(/([A-Z])/g, " $1").trim()}</strong>: {msg}</span>
              </div>
            ))}
          </FormCard>
        )}

        {/* STEP 2 — Verify phone and email */}
        {step === 2 && (
          <FormCard stepN={2} stepColor={cfg.accentColor} title="Verify phone number and email address"
            subtitle="Each applicant receives an OTP to confirm their contact details for FICA compliance.">
            {/* Phone */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-semibold text-gray-800">Mobile number</p><p className="text-xs text-gray-500">{form.phone || "+27 ..."}</p></div>
                {phoneVerified
                  ? <VerifiedBadge label="Verified" />
                  : !phoneOtpSent
                    ? <button onClick={sendPhoneOtp} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: cfg.accentColor }}>Send OTP</button>
                    : <span className="text-xs text-amber-600 font-medium">OTP sent</span>
                }
              </div>
              {phoneOtpSent && !phoneVerified && (
                <div className="space-y-3">
                  <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
                  {phoneOtp.length === 6 && <button onClick={verifyPhoneOtp} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: GREEN }}>✓ Verify Phone OTP</button>}
                  <button onClick={() => { setPhoneOtpSent(false); setPhoneOtp(""); }} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700"><RefreshCw className="w-3 h-3" />Resend OTP</button>
                </div>
              )}
            </div>
            {/* Email */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-semibold text-gray-800">Email address</p><p className="text-xs text-gray-500">{form.email || "email@domain.com"}</p></div>
                {emailVerified
                  ? <VerifiedBadge label="Verified" />
                  : !emailOtpSent
                    ? <button onClick={() => setEmailOtpSent(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: cfg.accentColor }}>Send OTP</button>
                    : <span className="text-xs text-amber-600 font-medium">OTP sent</span>
                }
              </div>
              {emailOtpSent && !emailVerified && (
                <div className="space-y-3">
                  <OtpInput value={emailOtp} onChange={setEmailOtp} />
                  {emailOtp.length === 6 && <button onClick={verifyEmailOtp} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: GREEN }}>✓ Verify Email OTP</button>}
                  <button onClick={() => { setEmailOtpSent(false); setEmailOtp(""); }} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700"><RefreshCw className="w-3 h-3" />Resend OTP</button>
                </div>
              )}
            </div>
            {phoneVerified && emailVerified && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold" style={{ background: GREEN + "12", color: GREEN }}>
                <CheckCircle className="w-4 h-4" />Both contact channels verified successfully
              </div>
            )}
          </FormCard>
        )}

        {/* STEP 3 — Fingerprint */}
        {step === 3 && (
          <FormCard stepN={3} stepColor={cfg.accentColor} title="Fingerprint authentication"
            subtitle="Biometric fingerprint verification for FICA compliance — matched against the Home Affairs database.">
            <FingerprintScanner onDone={() => setFpDone(true)} accentColor={cfg.accentColor} />
            {fpDone && (
              <div className="rounded-xl p-3 text-sm font-semibold flex items-center gap-2"
                style={{ background: GREEN + "12", color: GREEN, border: `1px solid ${GREEN}30` }}>
                <CheckCircle className="w-4 h-4" />Fingerprint matched · Home Affairs verification: Passed
              </div>
            )}
          </FormCard>
        )}

        {/* STEP 4 — Selfie */}
        {step === 4 && (
          <FormCard stepN={4} stepColor={cfg.accentColor} title="Selfie capture"
            subtitle="Facial recognition and liveness detection to prevent impersonation — required under POCA.">
            <SelfieCapture onDone={() => setSelfieDone(true)} accentColor={cfg.accentColor} />
            {selfieDone && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                {["Liveness check", "Face match", "Document match"].map((c, i) => (
                  <div key={i} className="rounded-xl p-3 text-center border" style={{ borderColor: GREEN + "40", background: GREEN + "08" }}>
                    <CheckCircle className="w-5 h-5 mx-auto mb-1" style={{ color: GREEN }} />
                    <p className="text-[10px] font-semibold" style={{ color: GREEN }}>{c}</p>
                  </div>
                ))}
              </div>
            )}
          </FormCard>
        )}

        {/* STEP 5 — Documents */}
        {step === 5 && (
          <FormCard stepN={5} stepColor={cfg.accentColor} title="Upload required documents"
            subtitle="Upload certified, legible copies. PDF, JPG, PNG accepted.">
            <div className="space-y-2">
              {docs.map(d => (
                <DocSlot key={d.key} label={d.label} required={d.required}
                  uploaded={!!uploadedDocs[d.key]}
                  onUpload={() => setUploadedDocs(prev => ({ ...prev, [d.key]: true }))} />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(doneReqDocs / reqDocs) * 100}%`, background: cfg.accentColor }} />
              </div>
              <span className="text-xs font-semibold text-gray-600 flex-shrink-0">{doneReqDocs}/{reqDocs} required</span>
            </div>
          </FormCard>
        )}

        {/* STEP 6 — Director confirmations */}
        {step === 6 && (
          <FormCard stepN={6} stepColor={cfg.accentColor} title="Director confirmations"
            subtitle="The primary applicant must confirm their identity and set a secure PIN.">
            <div className="rounded-xl border border-gray-200 p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                  style={{ background: cfg.accentColor }}>
                  {(form.firstName[0] || "A").toUpperCase()}{(form.lastName[0] || "B").toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{form.firstName || "Applicant"} {form.lastName}</p>
                  <p className="text-xs text-gray-500">Primary account holder</p>
                </div>
                {dirVerified && <div className="ml-auto"><VerifiedBadge label="Confirmed" /></div>}
              </div>
              {!dirVerified && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">Enter confirmation OTP (any 6 digits in demo)</p>
                  <OtpInput value={dirOtp} onChange={setDirOtp} />
                  {dirOtp.length === 6 && (
                    <button onClick={() => setDirVerified(true)} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: GREEN }}>Confirm Identity</button>
                  )}
                </div>
              )}
            </div>
            {/* Set PIN */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Set your 4-digit account PIN</p>
              <div className="relative max-w-xs">
                <input type={showPin ? "text" : "password"} maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/, ""))}
                  className={inputCls + " pr-10 text-center text-2xl tracking-[0.5em] font-black"} placeholder="····" />
                <button type="button" onClick={() => setShowPin(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400">Used for app login and transactions</p>
            </div>
          </FormCard>
        )}

        {/* STEP 7 — Account creation */}
        {step === 7 && !submitted && (
          <FormCard stepN={7} stepColor={cfg.accentColor} title="Confirm &amp; submit application"
            subtitle="Review your application before final submission.">
            {/* Summary */}
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { label: "Full name",   value: `${form.firstName} ${form.lastName}` || "—" },
                { label: "ID number",   value: form.idNumber || "—" },
                { label: "Mobile",      value: form.phone || "—" },
                { label: "Email",       value: form.email || "—" },
                { label: "Product",     value: form.product || form.plan || "—" },
                { label: "Documents",   value: `${Object.keys(uploadedDocs).filter(k => uploadedDocs[k]).length} uploaded` },
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl p-4 text-xs text-gray-600 leading-relaxed" style={{ background: cfg.accentColor + "08", border: `1px solid ${cfg.accentColor}20` }}>
              By submitting I confirm all information is true and accurate. I authorise VINK to conduct credit bureau inquiries and verify my identity with SARS, CIPC, and Home Affairs.
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 rounded flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-700">I agree to the Terms and Conditions and consent to the processing of this application</span>
            </label>
            <button disabled={!agreed || submitting} onClick={async () => {
                setSubmitting(true);
                setSubmitError("");
                const result = await applicationsApi.submit({
                  type: serviceType,
                  subType: form.product || form.plan || serviceType,
                  applicantName: `${form.firstName} ${form.lastName}`.trim(),
                  applicantEmail: form.email,
                  applicantPhone: form.phone,
                  formData: form,
                });
                setSubmitting(false);
                if (result.success && result.data) {
                  setAccountNo(result.data.referenceNumber);
                  setSubmitted(true);
                } else {
                  setSubmitError(result.error ?? "Submission failed. Please try again.");
                }
              }}
              className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
              style={{ background: agreed ? `linear-gradient(135deg,${cfg.accentColor},${cfg.accentColor}CC)` : "#9CA3AF" }}>
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
            {submitError && <p className="text-red-600 text-sm text-center mt-2">{submitError}</p>}
          </FormCard>
        )}

        {/* ── SUCCESS ── */}
        {step === 7 && submitted && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border p-8 text-center space-y-4" style={{ borderColor: GREEN + "40" }}>
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto" style={{ background: `linear-gradient(135deg,${GREEN}30,${GREEN}15)` }}>
                <CheckCircle className="w-12 h-12" style={{ color: GREEN }} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900">{cfg.successTitle}</h2>
                <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">{cfg.successBody}</p>
              </div>
              {/* Account number card */}
              <div className="rounded-2xl p-5 mx-auto max-w-xs text-white relative overflow-hidden" style={{ background: cfg.gradient }}>
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
                <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{cfg.accountLabel}</p>
                <p className="font-black text-xl tracking-wide">{accountNo}</p>
                <p className="text-[10px] opacity-60 mt-2">{form.firstName} {form.lastName}</p>
              </div>
              <p className="text-xs text-gray-400">A confirmation email has been sent to <strong>{form.email || "your registered email"}</strong>.</p>
            </div>
            <button onClick={onClose}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg"
              style={{ background: `linear-gradient(135deg,${CP},#9585EA)` }}>
              Back to VINK
            </button>
          </div>
        )}

        {/* ── Nav buttons ── */}
        {!(step === 7 && submitted) && (
          <NavButtons
            onBack={step > 1 ? back : undefined}
            onNext={step < 7 ? () => {
              if (step === 1) {
                setStep1Submitted(true);
                if (!validateStep1()) return;
              }
              next();
            } : undefined}
            hideBack={step === 1}
          />
        )}
        {submitError && <InlineError message={submitError} onRetry={() => setSubmitError("")} />}
      </div>
    </div>
  );
}
