import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, CloudUpload, Plus, RefreshCw, ShieldCheck, X, Lock, Clock } from "lucide-react";
import { Footer } from "./Footer";
import { usePageTitle } from "./ds";
import { applicationsApi, otpApi, type AppTier } from "../services/applicationsApi";
import { openSignIn } from "../services/signIn";
import { CATALOG, SEGMENTS, type Segment } from "../data/productCatalog";

/**
 * The application form that opens from "Start Now": register, take a photo (optional), confirm details, business and driver details, a phone code, done.
 * It is a card on a soft rose backdrop, one step at a time. The phone code and the submission use the site's own services (otpApi, applicationsApi), so the
 * reference and account number shown at the end are real ones from the server. Photos stay in the browser; documents are recorded by name with the application.
 */

type Step = "start" | "choose" | "saved" | "reg" | "cam" | "face" | "info" | "biz" | "drv" | "otp" | "lock" | "done" | "soon";

interface Personal { type: string; acct: string; clear: string; country: string; idn: string; pass: string; fn: string; ln: string; em: string; cell: string; addr: string }
interface Director { key: number; fn: string; ln: string; idn: string; em: string }
interface Draft extends Personal { ref: string }

const COUNTRIES = ["South Africa", "Zambia", "Zimbabwe", "Botswana", "Namibia", "Mozambique", "Malawi", "Kenya", "Nigeria", "United Kingdom", "United States", "Other"];
const EMPTY: Personal = { type: "Personal", acct: "", clear: "", country: "", idn: "", pass: "", fn: "", ln: "", em: "", cell: "", addr: "" };
const DRAFT_KEY = "reg-draft";
const LOCK_KEY = "vink-apply-lock";
const OTP_SECONDS = 300;           // the server keeps a code for five minutes
const OTP_LENGTH = 6;
const MAX_TRIES = 3;
const RED = "#c8102e";

const emailOk = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 9;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const storeGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const storeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage can be blocked: the form still works without a saved draft */ } };

// ─── Pieces ─────────────────────────────────────────────────────────────────

const fieldCls = (bad: boolean) =>
  `h-14 w-full appearance-none rounded-full border bg-surface-2 px-6 text-[16px] text-fg outline-none transition-all placeholder:text-fg-subtle focus:bg-surface focus:ring-4 ${bad ? "border-bad focus:border-bad focus:ring-[rgba(217,45,32,0.15)]" : "border-line focus:border-brand focus:ring-[rgba(229,72,79,0.16)]"}`;

function Field({ id, label, value, onChange, error, type = "text", placeholder, mode, auto, optional }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; placeholder?: string;
  mode?: "numeric" | "tel" | "email" | "text"; auto?: string; optional?: boolean;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 ml-5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}{optional && <span className="font-normal normal-case tracking-normal text-fg-subtle">optional</span>}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? label} inputMode={mode} autoComplete={auto ?? "off"}
        aria-invalid={!!error} aria-describedby={error ? id + "-err" : undefined} className={fieldCls(!!error)} />
      {error && <p id={id + "-err"} role="alert" className="mt-1.5 ml-5 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}

function SelectField({ id, label, value, onChange, options, groups, placeholder, error, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; options?: string[]; groups?: { label: string; options: { value: string; label: string }[] }[]; placeholder?: string; error?: string; hint?: string }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 ml-5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</label>
      <div className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className={fieldCls(!!error) + (value ? "" : " text-fg-subtle")}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options?.map((o) => <option key={o} value={o}>{o}</option>)}
          {groups?.map((g) => <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-6 top-1/2 size-2 -translate-y-[70%] rotate-45 border-b-2 border-r-2 border-fg-muted" />
      </div>
      {hint && !error && <p className="mt-1.5 ml-5 text-[12.5px] text-fg-muted">{hint}</p>}
      {error && <p role="alert" className="mt-1.5 ml-5 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}

function Btn({ children, onClick, kind = "solid", disabled, className = "", type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "solid" | "tint" | "ghost"; disabled?: boolean; className?: string; type?: "button" | "submit" }) {
  const base = "mt-3.5 flex h-14 w-full items-center justify-center gap-2 rounded-full text-[16.5px] font-semibold tracking-[0.005em] transition-all duration-200 hover:-translate-y-px active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";
  const look = kind === "solid"
    ? "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_14px_28px_-10px_rgba(176,18,42,0.55)] hover:brightness-105"
    : kind === "tint" ? "bg-brand-soft text-crimson-text ring-1 ring-inset ring-[rgba(176,18,42,0.16)] hover:brightness-95" : "text-crimson-text hover:bg-brand-soft";
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${look} ${className}`} style={kind === "solid" ? { background: "linear-gradient(180deg,#e5484f 0%,#b0122a 100%)" } : undefined}>{children}</button>;
}

const Back = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-crimson-text hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Back</button>
);

const Heading = ({ children, sub }: { children: ReactNode; sub?: string }) => (
  <div className="mb-6 mt-7 text-center">
    <h2 className="font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-fg">{children}</h2>
    {sub && <p className="mt-3 text-[16px] leading-relaxed text-fg-muted">{sub}</p>}
  </div>
);

const Section = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-4 mt-8 flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.14em] text-crimson-text">{children}<span aria-hidden="true" className="h-px flex-1 bg-line" /></h3>
);

const LoginLine = ({ onLogin }: { onLogin: () => void }) => (
  <p className="mt-5 text-center text-[15px] text-fg-muted">Already have an account?<button type="button" onClick={onLogin} className="ml-1.5 font-bold text-crimson-text hover:underline">Login</button></p>
);

function Upload({ label, files, onPick, error, hint }: { label: string; files: File[]; onPick: (f: File[]) => void; error?: string; hint: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="mb-4">
      <p className="mb-1.5 ml-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</p>
      <button type="button" onClick={() => ref.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-[rgba(176,18,42,0.28)] bg-brand-soft px-6 py-7 text-[16px] font-semibold text-crimson-text transition-all hover:border-[rgba(176,18,42,0.55)] hover:bg-[rgba(176,18,42,0.08)]">
        <CloudUpload className="size-7" aria-hidden="true" />Upload documents
      </button>
      <input ref={ref} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => onPick([...(e.target.files ?? [])])} aria-label={label} />
      <p className="mt-2 text-center text-[13px] leading-snug text-fg-muted">{files.length ? files.map((f) => f.name).join(", ") : hint}</p>
      {error && <p role="alert" className="mt-1.5 text-center text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}

function Steps({ total, at }: { total: number; at: number }) {
  return (
    <div className="mb-7 flex justify-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={Math.max(at + 1, 0)} aria-label="Application progress">
      {Array.from({ length: total }).map((_, k) => <i key={k} className="h-1 max-w-[42px] flex-1 rounded-full transition-colors duration-300" style={{ background: k <= at ? "linear-gradient(90deg,#b0122a,#e5484f)" : "var(--vk-line)" }} />)}
    </div>
  );
}

// ─── The form ───────────────────────────────────────────────────────────────

interface Props { isOpen: boolean; onClose: () => void }

export function ApplicationFlowViewer({ isOpen, onClose }: Props) {
  usePageTitle(isOpen ? "Apply" : "");
  const scroller = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("start");
  const [form, setForm] = useState<Personal>(EMPTY);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lookup, setLookup] = useState({ ref: "", id: "" });
  const [lookupBad, setLookupBad] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [camNote, setCamNote] = useState("");
  const [usedFace, setUsedFace] = useState(false);
  const [biz, setBiz] = useState({ name: "", reg: "" });
  const [bizFiles, setBizFiles] = useState<File[]>([]);
  const [dirs, setDirs] = useState<Director[]>([]);
  const [drv, setDrv] = useState({ phone: "", lic: "" });
  const [vehFiles, setVehFiles] = useState<File[]>([]);
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [tries, setTries] = useState(MAX_TRIES);
  const [left, setLeft] = useState(OTP_SECONDS);
  const [otpMsg, setOtpMsg] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ref: string; account: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const dirKey = useRef(0);

  const isBiz = form.type === "Business" || form.type === "Corporate";
  const order = useMemo<Step[]>(() => ["reg", "cam", "face", "info", ...(isBiz ? (["biz"] as Step[]) : []), "drv", "otp"], [isBiz]);
  const at = order.indexOf(step);
  const name = cap((form.fn || "").trim()) || "there";

  const go = useCallback((s: Step) => { setErrs({}); setStep(s); scroller.current?.scrollTo?.({ top: 0 }); }, []);
  const set = (k: keyof Personal) => (v: string) => { setForm((f) => { const n = { ...f, [k]: v }; if (k === "type") { n.acct = ""; n.clear = ""; } if (k === "acct") n.clear = ""; return n; }); setErrs((e) => ({ ...e, [k]: "" })); };

  // a saved draft on this device, for "Saved application"
  useEffect(() => {
    if (!isOpen) return;
    setStep("start"); setForm(EMPTY); setErrs({}); setResult(null); setShot(null); setOtp(Array(OTP_LENGTH).fill("")); setBizFiles([]); setVehFiles([]); setDirs([]);
    try { const d = JSON.parse(storeGet(DRAFT_KEY) || "null") as Draft | null; setDraft(d && d.ref ? d : null); } catch { setDraft(null); }
  }, [isOpen]);

  // ── validation ──
  const checkPersonal = () => {
    const e: Record<string, string> = {};
    if (!form.acct) e.acct = "Select a category";
    if (!form.clear) e.clear = "Select a product";
    if (!form.country) e.country = "Select your country of birth";
    if (!form.idn.trim()) e.idn = "Enter your identity number";
    if (!form.fn.trim()) e.fn = "Enter your first name";
    if (!form.ln.trim()) e.ln = "Enter your last name";
    if (!emailOk(form.em.trim())) e.em = "Enter a valid email address";
    if (!phoneOk(form.cell)) e.cell = "Enter a valid cell number";
    if (!form.addr.trim()) e.addr = "Enter your residential address";
    setErrs(e); return Object.keys(e).length === 0;
  };

  const doReg = () => {
    if (!checkPersonal()) return;
    const d: Draft = { ...form, ref: draft?.ref ?? "REF-" + Math.floor(100000 + Math.random() * 900000) };
    setDraft(d); storeSet(DRAFT_KEY, JSON.stringify(d)); go("cam");
  };
  const doSaved = () => {
    const r = lookup.ref.trim().toUpperCase(), i = lookup.id.trim();
    if (draft && r && i && draft.ref === r && (draft.idn === i || draft.pass === i)) { const { ref: _ref, ...rest } = draft; void _ref; setForm(rest); go("reg"); setLookupBad(false); }
    else setLookupBad(true);
  };
  const doBiz = () => {
    const e: Record<string, string> = {};
    if (!biz.name.trim()) e.bn = "Enter the registered business name";
    if (!biz.reg.trim()) e.br = "Enter the registration number";
    if (!bizFiles.length) e.bf = "Upload at least one business document";
    dirs.forEach((d) => {
      if (!d.fn.trim()) e["d" + d.key + "fn"] = "Enter first name";
      if (!d.ln.trim()) e["d" + d.key + "ln"] = "Enter last name";
      if (!d.idn.trim()) e["d" + d.key + "id"] = "Enter ID or passport number";
      if (!emailOk(d.em.trim())) e["d" + d.key + "em"] = "Enter a valid email address";
    });
    setErrs(e); if (!Object.keys(e).length) go("drv");
  };
  const doDrv = () => {
    const e: Record<string, string> = {};
    if (!phoneOk(drv.phone)) e.ph = "Enter a valid phone number";
    if (!drv.lic.trim()) e.lic = "Enter your drivers license number";
    if (!vehFiles.length) e.vf = "Upload at least one vehicle registration document";
    setErrs(e); if (!Object.keys(e).length) go("otp");
  };

  // ── camera ──
  const stopCam = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);
  const startCam = useCallback(async () => {
    stopCam(); setShot(null); setCamNote("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      stream.current = s; if (video.current) video.current.srcObject = s;
    } catch { setCamNote("Your camera isn't available here, so a sample frame is shown. You can continue without a photo."); }
  }, [stopCam]);
  useEffect(() => { if (step === "face" && isOpen) void startCam(); else stopCam(); return stopCam; }, [step, isOpen, startCam, stopCam]);
  const takePicture = () => {
    const v = video.current;
    if (stream.current && v && v.videoWidth) {
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
      const x = c.getContext("2d"); if (x) { x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(v, 0, 0); setShot(c.toDataURL("image/jpeg", 0.85)); }
    } else setShot("sample");
    stopCam(); setUsedFace(true);
  };

  // ── phone code ──
  const sendCode = useCallback(async (again = false) => {
    setOtp(Array(OTP_LENGTH).fill("")); setOtpMsg(again ? "Sending a new code…" : ""); setDemoCode("");
    const r = await otpApi.send(drv.phone.trim(), "sms");
    if (!r.success) { setOtpMsg(r.error || "We couldn't send the code. Please try again."); return; }
    setLeft(OTP_SECONDS); setOtpMsg(again ? "A new code has been sent" : "");
    const dc = r.demoCode ?? (r.data as { demoCode?: string } | undefined)?.demoCode; if (dc) setDemoCode(dc);
    boxes.current[0]?.focus();
  }, [drv.phone]);
  useEffect(() => {
    if (step !== "otp") return;
    const until = Number(storeGet(LOCK_KEY) || 0);
    if (until > Date.now()) { go("lock"); return; }
    setTries(MAX_TRIES); void sendCode(false);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step !== "otp") return;
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  const verify = async () => {
    const code = otp.join("");
    if (code.length < OTP_LENGTH) { setOtpMsg(`Enter the ${OTP_LENGTH}-digit code`); return; }
    if (left <= 0) { setOtpMsg("The code expired. Tap Resend code."); return; }
    setBusy(true); setOtpMsg("");
    const v = await otpApi.verify(drv.phone.trim(), code);
    if (!v.success) {
      setBusy(false);
      const n = tries - 1; setTries(n);
      if (n <= 0) { storeSet(LOCK_KEY, String(Date.now() + 24 * 3600_000)); go("lock"); return; }
      setOtpMsg(v.error || "Incorrect code"); setOtp(Array(OTP_LENGTH).fill("")); boxes.current[0]?.focus(); return;
    }
    const tier = form.type.toLowerCase() as AppTier;
    const r = await applicationsApi.submit({
      tier, accountTypeRequested: `${form.acct}: ${form.clear}`, applicantName: `${form.fn.trim()} ${form.ln.trim()}`, applicantEmail: form.em.trim(), applicantPhone: drv.phone.trim(),
      tierData: {
        source: "start-now-form", draftReference: draft?.ref, countryOfBirth: form.country, identityNumber: form.idn.trim(), passportNumber: form.pass.trim() || undefined, cell: form.cell.trim(), address: form.addr.trim(),
        facialVerification: usedFace, phoneVerified: true, driversLicense: drv.lic.trim(), vehicleDocuments: vehFiles.map((f) => f.name),
        ...(isBiz ? { business: { name: biz.name.trim(), registrationNumber: biz.reg.trim(), documents: bizFiles.map((f) => f.name), directors: dirs.map((d) => ({ firstName: d.fn.trim(), lastName: d.ln.trim(), idNumber: d.idn.trim(), email: d.em.trim() })) } } : {}),
      },
    });
    setBusy(false);
    if (!r.success || !r.data) { setOtpMsg(r.error || "Your phone is verified, but we couldn't submit the application. Please try again."); return; }
    setResult({ ref: r.data.referenceNumber, account: r.data.accountNumber });
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
    go("done");
  };

  const onBox = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "").slice(-1); setOtp((o) => o.map((x, k) => (k === i ? d : x))); setOtpMsg("");
    if (d && boxes.current[i + 1]) boxes.current[i + 1]!.focus();
  };
  const onBoxKey = (i: number, e: React.KeyboardEvent) => { if (e.key === "Backspace" && !otp[i] && i > 0) { setOtp((o) => o.map((x, k) => (k === i - 1 ? "" : x))); boxes.current[i - 1]?.focus(); } };
  const onPaste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH); if (!t) return; e.preventDefault();
    setOtp(Array.from({ length: OTP_LENGTH }, (_, k) => t[k] ?? "")); boxes.current[Math.min(t.length, OTP_LENGTH - 1)]?.focus();
  };

  if (!isOpen) return null;
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const title = step === "start" ? "" : step === "otp" || step === "lock" ? "Phone verification" : step === "done" || step === "soon" ? "" : "Register";
  const login = () => openSignIn(onClose);

  const personalFields = (
    <>
      <Section>Product selection</Section>
      <SelectField id="a-type" label="I am applying as" value={form.type} onChange={set("type")} options={[...SEGMENTS]} />
      <SelectField id="a-acct" label="Category" value={form.acct} onChange={set("acct")} options={CATALOG[form.type as Segment].map((g) => g.group)} placeholder="Account, investment, loan…" error={errs.acct} />
      <SelectField id="a-clear" label="Product" value={form.clear} onChange={set("clear")} options={CATALOG[form.type as Segment].find((g) => g.group === form.acct)?.products ?? []} placeholder={form.acct ? "Choose a product" : "Choose a category first"} error={errs.clear} />
      <Section>Personal information</Section>
      <SelectField id="a-country" label="Country of birth" value={form.country} onChange={set("country")} options={COUNTRIES} placeholder="Country of birth" error={errs.country} />
      <Field id="a-idn" label="Identity number" value={form.idn} onChange={set("idn")} error={errs.idn} mode="numeric" placeholder="Your identity number" />
      <Field id="a-pass" label="Passport number" value={form.pass} onChange={set("pass")} optional placeholder="Your passport number" />
      <Field id="a-fn" label="First name" value={form.fn} onChange={set("fn")} error={errs.fn} auto="given-name" />
      <Field id="a-ln" label="Last name" value={form.ln} onChange={set("ln")} error={errs.ln} auto="family-name" />
      <Field id="a-em" label="Email" value={form.em} onChange={set("em")} error={errs.em} type="email" mode="email" auto="email" />
      <Field id="a-cell" label="Cell number" value={form.cell} onChange={set("cell")} error={errs.cell} type="tel" mode="tel" auto="tel" />
      <Field id="a-addr" label="Residential address" value={form.addr} onChange={set("addr")} error={errs.addr} auto="street-address" placeholder="Your current residential address" />
    </>
  );

  return (
    <div ref={scroller} data-theme-aware role="dialog" aria-modal="true" aria-label="VINK application" className="fixed inset-0 z-[56] flex flex-col overflow-y-auto bg-bg text-fg [&>*]:shrink-0">
      <div className="relative flex min-h-[80vh] flex-none justify-center overflow-hidden px-4 pb-20 pt-10 sm:pt-14"
        style={{ background: "radial-gradient(900px 460px at 90% -10%,var(--vk-brand-soft) 0%,transparent 62%),radial-gradient(760px 420px at 0% 0%,color-mix(in srgb,var(--vk-brand-soft) 70%,transparent) 0%,transparent 66%)" }}>
        <div aria-hidden="true" className="vkp-dots opacity-50" />
        <main className="vkp-rise relative w-full max-w-[480px] self-start overflow-hidden rounded-[32px] border border-line bg-surface px-6 pb-10 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_30px_70px_-20px_rgba(120,10,30,0.28),0_8px_20px_rgba(120,10,30,0.06)] sm:px-8">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px]" style={{ background: "linear-gradient(90deg,#7e0b1f,#c8182e 45%,#e5484f)" }} />
          <button type="button" onClick={onClose} aria-label="Close the application" className="absolute right-4 top-5 inline-flex size-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden="true" /></button>

          <div className="pt-12" />
          {title && <h1 className="font-display mb-5 text-center text-[28px] font-semibold leading-[1.15] tracking-[-0.01em]">{title}</h1>}
          {at >= 0 && <Steps total={order.length} at={at} />}

          <div key={step} className="vkp-rise">
            {step === "start" && (
              <section className="flex min-h-[56vh] flex-col justify-center text-center">
                <span className="mx-auto mb-5 inline-flex size-16 items-center justify-center rounded-3xl text-white" style={{ background: "linear-gradient(145deg,#e8405b,#c8102e 55%,#970f27)", boxShadow: "0 18px 30px -14px rgba(200,16,46,0.8)" }}><ShieldCheck className="size-8" aria-hidden="true" /></span>
                <p className="mb-2 text-[18px] text-fg-muted">Apply in a few simple steps.</p>
                <ul className="mx-auto mt-4 grid gap-2 text-left text-[14px] text-fg-muted">
                  {["Takes about five minutes", "Your details stay private", "A one-time code confirms your phone"].map((t) => <li key={t} className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0 text-crimson-text" aria-hidden="true" />{t}</li>)}
                </ul>
                <Btn onClick={() => go("choose")} className="mt-8">Start <ArrowRight className="size-5" aria-hidden="true" /></Btn>
              </section>
            )}

            {step === "choose" && (
              <section className="mt-2">
                <Btn kind="tint" onClick={() => { setDraft(null); setForm(EMPTY); go("reg"); }}>New application</Btn>
                <Btn onClick={() => { setLookup({ ref: "", id: "" }); setLookupBad(false); go("saved"); }}>Saved application</Btn>
                <LoginLine onLogin={login} />
              </section>
            )}

            {step === "saved" && (
              <section>
                <Back onClick={() => go("choose")} />
                <Heading sub="Enter your saved application number and ID number.">Saved application</Heading>
                <Field id="s-ref" label="Application number" value={lookup.ref} onChange={(v) => setLookup((l) => ({ ...l, ref: v }))} placeholder="Application number (REF-…)" />
                <Field id="s-id" label="ID number" value={lookup.id} onChange={(v) => { setLookup((l) => ({ ...l, id: v })); setLookupBad(false); }} error={lookupBad ? "No saved application matches those details" : undefined} />
                {!draft && <p className="text-center text-[13px] text-fg-muted">There is no saved application on this device yet.</p>}
                <Btn onClick={doSaved}>Let's continue</Btn>
                <LoginLine onLogin={login} />
              </section>
            )}

            {step === "reg" && (
              <section>
                <Back onClick={() => go("choose")} />
                {personalFields}
                <Btn onClick={doReg} className="mt-6">Let's continue</Btn>
                <LoginLine onLogin={login} />
              </section>
            )}

            {step === "cam" && (
              <section>
                <Heading sub="You can complete your application quickly and easily using your device's camera for facial verification.">Permission to access your camera needed</Heading>
                {draft && <p className="-mt-2 mb-3 text-center text-[13.5px] text-fg-muted">Your saved application number: <b className="text-crimson-text">{draft.ref}</b></p>}
                <div className="relative mx-auto my-6 flex aspect-[4/3] max-w-[300px] items-center justify-center rounded-[28px] bg-brand-soft" aria-hidden="true">
                  <Camera className="size-16 text-crimson-text" strokeWidth={1.3} />
                  <span className="absolute inset-3 rounded-[22px] border border-dashed border-[rgba(176,18,42,0.3)]" />
                </div>
                <Btn onClick={() => go("face")}>Continue with facial verification</Btn>
                <Btn kind="tint" onClick={() => { setUsedFace(false); go("info"); }}>Without facial verification</Btn>
                <LoginLine onLogin={login} />
              </section>
            )}

            {step === "face" && (
              <section>
                <Heading sub="Centre your face in the frame, in good light.">Take a clear photo</Heading>
                <div className="relative mb-4 aspect-square overflow-hidden rounded-3xl bg-surface-2 shadow-[0_18px_40px_-18px_rgba(120,10,30,0.35)]">
                  {shot && shot !== "sample"
                    ? <img src={shot} alt="Your photo" className="absolute inset-0 size-full object-cover" />
                    : stream.current
                      ? <video ref={video} autoPlay muted playsInline className="absolute inset-0 size-full -scale-x-100 object-cover" />
                      : <div className="absolute inset-0 flex items-center justify-center bg-brand-soft"><Camera className="size-20 text-crimson-text/60" strokeWidth={1.2} aria-hidden="true" /></div>}
                  <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth=".7"><path d="M27 22h12M27 22v13M73 22H61M73 22v13M27 80h12M27 80V67M73 80H61M73 80V67" /></svg>
                </div>
                {camNote && <p className="mb-2 text-center text-[13px] text-fg-muted">{camNote}</p>}
                {!shot ? (<><Btn onClick={takePicture} className="mt-0">Take picture</Btn><Btn kind="tint" onClick={() => go("cam")}>Back</Btn></>) : (<><Btn kind="tint" onClick={() => void startCam()} className="mt-0"><RefreshCw className="size-4" aria-hidden="true" />Retake</Btn><Btn onClick={() => go("info")}>Let's continue</Btn></>)}
              </section>
            )}

            {step === "info" && (
              <section>
                <Heading>Help us to securely find out about you</Heading>
                {personalFields}
                <Btn onClick={() => { if (checkPersonal()) go(isBiz ? "biz" : "drv"); }} className="mt-6">Let's continue</Btn>
                <LoginLine onLogin={login} />
              </section>
            )}

            {step === "biz" && (
              <section>
                <Heading>Business details</Heading>
                <Field id="b-name" label="Registered business name" value={biz.name} onChange={(v) => { setBiz((b) => ({ ...b, name: v })); setErrs((e) => ({ ...e, bn: "" })); }} error={errs.bn} auto="organization" />
                <Field id="b-reg" label="Business registration number" value={biz.reg} onChange={(v) => { setBiz((b) => ({ ...b, reg: v })); setErrs((e) => ({ ...e, br: "" })); }} error={errs.br} />
                <Upload label="Business documents" files={bizFiles} onPick={(f) => { setBizFiles(f); setErrs((e) => ({ ...e, bf: "" })); }} error={errs.bf} hint="Registration certificate, proof of address, director resolution" />
                <Section>Directors</Section>
                {dirs.map((d, i) => {
                  const upd = (k: keyof Director) => (v: string) => setDirs((all) => all.map((x) => (x.key === d.key ? { ...x, [k]: v } : x)));
                  return (
                    <div key={d.key} className="mb-4 rounded-3xl border border-line bg-surface-2 px-4 pb-2 pt-4">
                      <div className="mx-2 mb-3 flex items-center justify-between"><b className="text-[15px]">Director {i + 1}</b><button type="button" onClick={() => setDirs((all) => all.filter((x) => x.key !== d.key))} className="text-[14px] font-semibold text-bad hover:underline">Remove</button></div>
                      <Field id={`d${d.key}-fn`} label="First name" value={d.fn} onChange={upd("fn")} error={errs["d" + d.key + "fn"]} />
                      <Field id={`d${d.key}-ln`} label="Last name" value={d.ln} onChange={upd("ln")} error={errs["d" + d.key + "ln"]} />
                      <Field id={`d${d.key}-id`} label="ID / passport number" value={d.idn} onChange={upd("idn")} error={errs["d" + d.key + "id"]} />
                      <Field id={`d${d.key}-em`} label="Email" value={d.em} onChange={upd("em")} error={errs["d" + d.key + "em"]} type="email" mode="email" />
                    </div>
                  );
                })}
                <Btn kind="tint" onClick={() => setDirs((all) => [...all, { key: ++dirKey.current, fn: "", ln: "", idn: "", em: "" }])}><Plus className="size-5" aria-hidden="true" />Add director</Btn>
                <Btn onClick={doBiz} className="mt-6">Let's continue</Btn>
                <LoginLine onLogin={login} />
              </section>
            )}

            {step === "drv" && (
              <section>
                <Heading>Driver and vehicle details</Heading>
                <Field id="v-phone" label="Phone number" value={drv.phone} onChange={(v) => { setDrv((d) => ({ ...d, phone: v })); setErrs((e) => ({ ...e, ph: "" })); }} error={errs.ph} type="tel" mode="tel" auto="tel" />
                <Field id="v-lic" label="Drivers license" value={drv.lic} onChange={(v) => { setDrv((d) => ({ ...d, lic: v })); setErrs((e) => ({ ...e, lic: "" })); }} error={errs.lic} />
                <Upload label="Vehicle registration documents" files={vehFiles} onPick={(f) => { setVehFiles(f); setErrs((e) => ({ ...e, vf: "" })); }} error={errs.vf} hint="A photo or PDF of the vehicle registration" />
                <Btn onClick={doDrv} className="mt-6">Let's continue</Btn>
                <LoginLine onLogin={login} />
              </section>
            )}

            {step === "otp" && (
              <section className="text-center">
                <p className="mt-2 text-[16px] leading-relaxed text-fg-muted">An authentication code has been sent to<br /><b className="text-[18px] text-fg">{drv.phone}</b></p>
                <div className="my-6 flex justify-center gap-2.5" onPaste={onPaste}>
                  {otp.map((v, i) => (
                    <input key={i} ref={(el) => { boxes.current[i] = el; }} value={v} onChange={(e) => onBox(i, e.target.value)} onKeyDown={(e) => onBoxKey(i, e)} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={1} aria-label={`Digit ${i + 1}`}
                      className={`size-12 rounded-2xl border-2 bg-surface-2 text-center text-[22px] font-bold outline-none transition-all focus:border-brand focus:bg-surface focus:ring-4 focus:ring-[rgba(229,72,79,0.16)] sm:size-[52px] ${v ? "border-brand" : "border-line"}`} />
                  ))}
                </div>
                {demoCode && <p className="mx-auto mb-4 max-w-xs rounded-2xl bg-brand-soft px-4 py-2.5 text-[13px] leading-snug text-crimson-text">No SMS service is connected yet, so your code is shown here: <b className="tracking-widest">{demoCode}</b></p>}
                <p className="text-[15px] text-fg-muted">I didn't receive the code. <button type="button" onClick={() => void sendCode(true)} className="font-bold text-crimson-text hover:underline">Resend code</button></p>
                <p className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-fg-muted"><Clock className="size-4" aria-hidden="true" />{tries} / {MAX_TRIES} attempts · <span className="font-bold text-crimson-text">{left > 0 ? `${mm} left` : "Code expired"}</span></p>
                {otpMsg && <p role="alert" className="mt-3 text-[13.5px] text-bad">{otpMsg}</p>}
                {tries < MAX_TRIES && <p className="mx-auto mt-4 max-w-xs rounded-2xl bg-brand-soft px-4 py-3 text-[13px] leading-snug text-fg"><b>Warning:</b> after <b>{MAX_TRIES} unsuccessful</b> attempts, your application is locked for 24 hours.</p>}
                <Btn onClick={() => void verify()} disabled={busy} className="mt-6">{busy ? "Please wait…" : "Verify now"}</Btn>
                <LoginLine onLogin={login} />
              </section>
            )}

            {step === "lock" && (
              <section className="text-center">
                <span className="mx-auto mt-4 inline-flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-crimson-text"><Lock className="size-8" aria-hidden="true" /></span>
                <p className="mx-auto mt-5 max-w-xs rounded-2xl bg-brand-soft px-4 py-4 text-[15px] leading-snug text-fg">Your application has been locked after {MAX_TRIES} failed attempts.<br />It will be unlocked after 24 hours.</p>
                <Btn onClick={onClose} className="mt-6">Go home</Btn>
              </section>
            )}

            {step === "done" && (
              <section className="text-center">
                <span className="relative mx-auto mt-6 flex size-28 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(145deg,#e8405b,#c8102e 55%,#970f27)", boxShadow: "0 24px 44px -16px rgba(200,16,46,0.8)" }}>
                  <span aria-hidden="true" className="vkp-ping absolute inset-0 rounded-full border-2 border-[#e8405b]" />
                  <Check className="size-14" strokeWidth={2.4} aria-hidden="true" />
                </span>
                <h2 className="font-display mt-7 text-[30px] font-semibold tracking-[-0.01em]">Congratulations</h2>
                <p className="mt-2 text-[18px] text-fg-muted">Welcome to VINK, <b className="text-crimson-text">{name}</b></p>
                {result && (
                  <dl className="mx-auto mt-6 grid max-w-xs gap-3 rounded-3xl border border-line bg-surface-2 p-5 text-left">
                    <div><dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">Reference number</dt><dd className="mt-0.5 text-[18px] font-bold tracking-wide text-fg">{result.ref}</dd></div>
                    <div><dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">Account number</dt><dd className="mt-0.5 text-[18px] font-bold tracking-wide text-fg">{result.account}</dd></div>
                  </dl>
                )}
                <p className="mx-auto mt-5 max-w-xs text-[14px] leading-relaxed text-fg-muted">We'll review your application and contact you on {form.em || "your email"}. Keep your reference number safe.</p>
                <Btn onClick={() => go("soon")} className="mt-6">Ok</Btn>
              </section>
            )}

            {step === "soon" && (
              <section className="py-10 text-center">
                <h2 className="font-display text-[30px] font-semibold tracking-[-0.01em]">Coming soon</h2>
                <p className="mx-auto mt-4 max-w-xs text-[17px] leading-relaxed text-fg-muted">Hi {name}, welcome to the VINK digital platform. We're coming soon.</p>
                <Btn onClick={onClose} className="mt-8">Back to home</Btn>
              </section>
            )}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
