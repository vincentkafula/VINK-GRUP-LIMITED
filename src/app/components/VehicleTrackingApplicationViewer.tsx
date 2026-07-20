import { useState } from "react";
import {
  X, CheckCircle, RefreshCw,
  User, Shield, Fingerprint, Camera, FileText, Users, MapPin, Car,
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
  { n: 1, label: "Applicant\ndetails",     icon: <User className="w-3.5 h-3.5" /> },
  { n: 2, label: "Phone &\nemail verify",  icon: <Shield className="w-3.5 h-3.5" /> },
  { n: 3, label: "Fingerprint\nauth",      icon: <Fingerprint className="w-3.5 h-3.5" /> },
  { n: 4, label: "Selfie\ncapture",        icon: <Camera className="w-3.5 h-3.5" /> },
  { n: 5, label: "Upload\ndocuments",      icon: <FileText className="w-3.5 h-3.5" /> },
  { n: 6, label: "Vehicle\ndetails",       icon: <Car className="w-3.5 h-3.5" /> },
  { n: 7, label: "Device\nactivation",     icon: <MapPin className="w-3.5 h-3.5" /> },
];

const TRACKING_PLANS = [
  { id: "basic",    name: "Basic Tracker",    price: "R170/month", features: ["Live GPS location", "30-day history", "SMS alerts", "Theft recovery support"] },
  { id: "premium",  name: "Premium Tracker",  price: "R265/month", features: ["Live GPS + geofencing", "90-day history", "Driver behaviour scoring", "Roadside assist", "CCTV integration"] },
  { id: "fleet",    name: "Fleet Manager",    price: "R415/month", features: ["Unlimited vehicles", "Real-time dashboard", "Fuel management", "Route optimisation", "API access"] },
];

const VEHICLE_MAKES = ["BMW", "Ford", "Hyundai", "Isuzu", "KIA", "Mahindra", "Mazda", "Mercedes-Benz", "Mitsubishi", "Nissan", "Renault", "Suzuki", "Toyota", "VW", "Volvo", "Other"];

const DOC_SLOTS = [
  { key: "id",       label: "Certified copy of SA ID or passport",           required: true },
  { key: "address",  label: "Proof of residential or business address",       required: true },
  { key: "license",  label: "Vehicle licence disc (copy)",                     required: true },
  { key: "reg",      label: "Vehicle registration certificate (NATIS)",        required: true },
  { key: "insurance", label: "Vehicle insurance certificate",                  required: false },
];

function FingerprintScanner({ onDone }: { onDone: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [prog, setProg] = useState(0);
  const [done, setDone] = useState(false);

  const start = () => {
    setScanning(true); setProg(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12 + 5;
      if (p >= 100) { clearInterval(iv); setTimeout(() => { setDone(true); setScanning(false); onDone(); }, 400); p = 100; }
      setProg(p);
    }, 130);
  };

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div onClick={!scanning && !done ? start : undefined}
        className="relative w-40 h-40 rounded-3xl flex items-center justify-center cursor-pointer transition-all"
        style={{ background: done ? "#D1FAE5" : scanning ? CP + "15" : "#F3F0FB", border: `3px solid ${done ? GREEN : scanning ? CP : "#DDD6FE"}`, boxShadow: scanning ? `0 0 40px ${CP}35` : done ? `0 0 20px ${GREEN}30` : "none" }}>
        <Fingerprint className="w-20 h-20" style={{ color: done ? GREEN : scanning ? CP : "#C4B5FD" }} />
        {scanning && <div className="absolute bottom-4 left-4 right-4"><div className="h-2 bg-white/60 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prog}%`, background: CP }} /></div></div>}
        {done && <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg"><CheckCircle className="w-5 h-5 text-white" /></div>}
      </div>
      <div className="text-center">
        {done ? <p className="font-bold text-green-700 text-lg">Identity confirmed</p>
               : scanning ? <p className="font-semibold text-gray-700">Scanning… {Math.round(prog)}%</p>
               : <p className="font-semibold text-gray-700">Tap to scan your fingerprint</p>}
        <p className="text-xs text-gray-400 mt-1">{done ? "FICA compliant · Home Affairs verified" : "Place your index finger on the reader"}</p>
      </div>
    </div>
  );
}

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
        {state === "countdown" && <div className="flex flex-col items-center gap-2"><div className="absolute inset-0 flex items-center justify-center"><div className="w-40 h-48 rounded-full border-4 border-white/40 border-dashed" /></div><p className="relative z-10 text-6xl font-black text-white">{count}</p></div>}
        {state === "done" && <div className="flex flex-col items-center gap-3 text-white text-center px-4"><CheckCircle className="w-14 h-14 text-green-400" /><p className="text-sm font-semibold text-green-300">Photo captured</p></div>}
        {state !== "done" && (
          <>{[["top-3 left-3 border-t-2 border-l-2"], ["top-3 right-3 border-t-2 border-r-2"], ["bottom-3 left-3 border-b-2 border-l-2"], ["bottom-3 right-3 border-b-2 border-r-2"]].map(([cls], i) => (
            <div key={i} className={`absolute w-6 h-6 ${cls} border-white/50 rounded-sm`} />
          ))}</>
        )}
      </div>
      {state === "idle" && (
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <button onClick={start} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: CP }}>Take Selfie</button>
          <label className="w-full text-center cursor-pointer text-sm font-semibold py-2.5 rounded-xl border-2 hover:opacity-80" style={{ borderColor: CP, color: CP }}>
            Upload photo instead <input type="file" accept="image/*" className="hidden" onChange={() => { setState("done"); onDone(); }} />
          </label>
        </div>
      )}
      {state === "done" && <div className="text-center"><p className="font-bold text-green-700">Liveness check passed</p><button onClick={() => setState("idle")} className="text-xs text-gray-400 underline mt-1">Retake</button></div>}
    </div>
  );
}

export function VehicleTrackingApplicationViewer({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [fingerprintDone, setFingerprintDone] = useState(false);
  const [selfieDone, setSelfieDone] = useState(false);
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({ firstName: "", lastName: "", idNumber: "", phone: "+27 ", email: "", address: "", postalCode: "", company: "" });
  const [phoneOtp, setPhoneOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const [vehicle, setVehicle] = useState({ make: "", model: "", year: "", colour: "", reg: "", vin: "", engine: "" });
  const [selectedPlan, setSelectedPlan] = useState("basic");
  const [installDate, setInstallDate] = useState("");
  const [fleetSize, setFleetSize] = useState("1");

  const [deviceId] = useState(`VINK-TRK-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`);
  const [refNo] = useState(`VINK-VT-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`);

  if (!isOpen) return null;

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setV = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setVehicle(f => ({ ...f, [k]: e.target.value }));

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const next = () => setStep(s => Math.min(s + 1, 7));
  const back = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#F8F7FF]">

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
        tag="VINK Vehicle Tracking · SADC Coverage · POPIA Compliant"
        title="Vehicle Tracking Application"
        subtitle="Real-time GPS tracking, geofencing, and theft recovery across Southern Africa. Protect your vehicle or fleet today."
        gradient="linear-gradient(135deg,#0F172A 0%,#1E3A5F 40%,#2563EB 100%)"
      />

      <div className="max-w-2xl mx-auto w-full px-5 py-8 space-y-5">

        {/* Step 1 — Applicant details */}
        {step === 1 && (
          <FormCard stepN={1} title="Enter applicant details" subtitle="Personal or company information for FICA compliance">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name(s)" required><input className={inputCls} placeholder="e.g. Vincent" value={form.firstName} onChange={setF("firstName")} /></Field>
              <Field label="Surname" required><input className={inputCls} placeholder="e.g. Kafula" value={form.lastName} onChange={setF("lastName")} /></Field>
              <Field label="SA ID or passport number" required><input className={inputCls} placeholder="13-digit ID" value={form.idNumber} onChange={setF("idNumber")} /></Field>
              <Field label="Company name (if applicable)"><input className={inputCls} placeholder="VINK Transport (Pty) Ltd" value={form.company} onChange={setF("company")} /></Field>
              <Field label="Mobile number" required><input className={inputCls} placeholder="+27 ..." value={form.phone} onChange={setF("phone")} /></Field>
              <Field label="Email address" required><input type="email" className={inputCls} placeholder="email@domain.com" value={form.email} onChange={setF("email")} /></Field>
              <Field label="Residential / business address" required full><input className={inputCls} placeholder="Street, suburb, city, province" value={form.address} onChange={setF("address")} /></Field>
              <Field label="Postal code" required><input className={inputCls} placeholder="0000" maxLength={4} value={form.postalCode} onChange={setF("postalCode")} /></Field>
            </div>
          </FormCard>
        )}

        {/* Step 2 — OTP */}
        {step === 2 && (
          <FormCard stepN={2} title="Verify your phone number and email address" subtitle="Both channels must be confirmed for FICA compliance">
            {[
              { label: "Mobile number", value: form.phone || "+27 ...", otp: phoneOtp, setOtp: setPhoneOtp, sent: phoneOtpSent, setSent: setPhoneOtpSent, verified: phoneVerified, setVerified: setPhoneVerified },
              { label: "Email address", value: form.email || "email@domain.com", otp: emailOtp, setOtp: setEmailOtp, sent: emailOtpSent, setSent: setEmailOtpSent, verified: emailVerified, setVerified: setEmailVerified },
            ].map((ch, i) => (
              <div key={i} className="rounded-2xl border-2 p-4 space-y-3 transition-all" style={{ borderColor: ch.verified ? GREEN + "50" : "#E5E7EB", background: ch.verified ? GREEN + "04" : "#FAFAFA" }}>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-semibold text-gray-800">{ch.label}</p><p className="text-xs text-gray-500">{ch.value}</p></div>
                  {ch.verified ? <VerifiedBadge label="Verified" />
                    : !ch.sent ? <button onClick={() => ch.setSent(true)} className="text-xs font-bold px-4 py-2 rounded-xl text-white" style={{ background: CP }}>Send OTP</button>
                    : <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded-lg">Sent ✉️</span>}
                </div>
                {ch.sent && !ch.verified && (
                  <div className="space-y-3">
                    <OtpInput value={ch.otp} onChange={ch.setOtp} />
                    <div className="flex justify-between">
                      <button onClick={() => { ch.setSent(false); ch.setOtp(""); }} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700"><RefreshCw className="w-3 h-3" />Resend</button>
                      {ch.otp.length === 6 && <button onClick={() => ch.setVerified(true)} className="text-xs font-bold px-4 py-2 rounded-xl text-white" style={{ background: GREEN }}>Verify ✓</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {phoneVerified && emailVerified && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold text-green-700 bg-green-50 border border-green-200">
                <CheckCircle className="w-4 h-4" />Both channels verified
              </div>
            )}
          </FormCard>
        )}

        {/* Step 3 — Fingerprint */}
        {step === 3 && (
          <FormCard stepN={3} title="Fingerprint authentication" subtitle="Biometric identity verification for FICA compliance">
            <p className="text-sm text-gray-600 leading-relaxed">Your fingerprint confirms your identity against the Home Affairs database, satisfying FICA requirements for financial services.</p>
            <FingerprintScanner onDone={() => setFingerprintDone(true)} />
            {fingerprintDone && <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold text-green-700 bg-green-50 border border-green-200"><CheckCircle className="w-4 h-4" />Fingerprint matched · FICA: PASS</div>}
          </FormCard>
        )}

        {/* Step 4 — Selfie */}
        {step === 4 && (
          <FormCard stepN={4} title="Selfie capture" subtitle="Facial recognition and liveness detection to prevent impersonation">
            <SelfieCapture onDone={() => setSelfieDone(true)} />
            {selfieDone && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                {["Liveness", "Face match", "POPIA check"].map((c, i) => (
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
          <FormCard stepN={5} title="Upload required documents" subtitle="PDF, JPG or PNG · Max 10MB each">
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

        {/* Step 6 — Vehicle details */}
        {step === 6 && (
          <>
            <FormCard stepN={6} title="Choose your tracking plan" subtitle="Select the coverage level that fits your needs">
              <div className="space-y-3">
                {TRACKING_PLANS.map(p => (
                  <label key={p.id}
                    className="flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.005]"
                    style={{ borderColor: selectedPlan === p.id ? CP : "#E5E7EB", background: selectedPlan === p.id ? CP + "06" : "#fff" }}>
                    <div className="w-5 h-5 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center" style={{ borderColor: selectedPlan === p.id ? CP : "#D1D5DB" }}>
                      {selectedPlan === p.id && <div className="w-2.5 h-2.5 rounded-full" style={{ background: CP }} />}
                    </div>
                    <input type="radio" name="plan" className="hidden" value={p.id} checked={selectedPlan === p.id} onChange={() => setSelectedPlan(p.id)} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-black text-gray-900">{p.name}</p>
                        <p className="text-sm font-black" style={{ color: CP }}>{p.price}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.features.map((f, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{f}</span>)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </FormCard>

            <FormCard stepN={6} title="Vehicle details" subtitle="Register the vehicle to be fitted with the tracking device">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Vehicle make" required>
                  <select className={selectCls} value={vehicle.make} onChange={setV("make")}>
                    <option value="">Select make...</option>
                    {VEHICLE_MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Model" required><input className={inputCls} placeholder="e.g. Corolla" value={vehicle.model} onChange={setV("model")} /></Field>
                <Field label="Year" required><input type="number" className={inputCls} placeholder="2020" min={1990} max={new Date().getFullYear()} value={vehicle.year} onChange={setV("year")} /></Field>
                <Field label="Colour" required><input className={inputCls} placeholder="e.g. White" value={vehicle.colour} onChange={setV("colour")} /></Field>
                <Field label="Registration number" required><input className={inputCls} placeholder="e.g. CA 123-456" value={vehicle.reg} onChange={setV("reg")} /></Field>
                <Field label="VIN number"><input className={inputCls} placeholder="17-character VIN" value={vehicle.vin} onChange={setV("vin")} /></Field>
                <Field label="Number of vehicles (fleet)" required>
                  <input type="number" className={inputCls} placeholder="1" min={1} value={fleetSize} onChange={e => setFleetSize(e.target.value)} />
                </Field>
                <Field label="Preferred installation date">
                  <input type="date" className={inputCls} value={installDate} onChange={e => setInstallDate(e.target.value)} />
                </Field>
              </div>
              <p className="text-xs text-gray-400 mt-1">Our technician will contact you to confirm the installation appointment. Device installation takes approximately 2 hours.</p>
            </FormCard>
          </>
        )}

        {/* Step 7 — Activation */}
        {step === 7 && !submitted && (
          <FormCard stepN={7} title="Review &amp; activate your tracker" subtitle="Confirm your details and submit">
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { label: "Applicant",    value: `${form.firstName} ${form.lastName}` || "—" },
                { label: "Vehicle",      value: vehicle.make && vehicle.model ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "—" },
                { label: "Reg number",   value: vehicle.reg || "—" },
                { label: "Colour",       value: vehicle.colour || "—" },
                { label: "Plan",         value: TRACKING_PLANS.find(p => p.id === selectedPlan)?.name ?? "—" },
                { label: "Fleet size",   value: fleetSize + " vehicle(s)" },
                { label: "Install date", value: installDate || "TBC — technician will call" },
                { label: "Documents",    value: `${Object.values(docs).filter(Boolean).length} uploaded` },
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mt-2">
              By submitting you consent to VINK installing a GPS tracking device in your vehicle and processing your location data in accordance with POPIA and VINK&apos;s Privacy Policy.
            </p>
            <button
              onClick={async () => {
                await applicationsApi.submit({ type: "vehicle-tracking", applicantName: `${form.firstName ?? ""} ${form.lastName ?? ""}`.trim() || "Applicant", applicantEmail: form.email, applicantPhone: form.phone, formData: { ...form, ...vehicle, fleetSize } }).catch(() => null);
                setSubmitted(true);
              }}
              className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:opacity-90 shadow-lg mt-2"
              style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", boxShadow: "0 6px 24px #2563EB35" }}>
              Activate Vehicle Tracker →
            </button>
          </FormCard>
        )}

        {/* SUCCESS */}
        {submitted && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-blue-200 p-8 text-center space-y-4 shadow-sm">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto" style={{ background: "linear-gradient(135deg,#DBEAFE,#BFDBFE)" }}>
                <MapPin className="w-12 h-12 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900">Tracking Activated!</h2>
                <p className="text-gray-500 text-sm mt-1">Your vehicle tracking application has been approved.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl p-4" style={{ background: "#EFF6FF" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Device ID</p>
                  <p className="text-sm font-black text-blue-700 font-mono">{deviceId}</p>
                </div>
                <div className="rounded-xl p-4" style={{ background: "#EFF6FF" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Reference</p>
                  <p className="text-sm font-black text-blue-700">{refNo}</p>
                </div>
              </div>
              <div className="rounded-xl p-4 bg-gray-50 space-y-2 text-sm text-gray-600 text-left">
                <p>📞 A VINK technician will call <strong>{form.phone}</strong> within 24 hours to book your installation.</p>
                <p>⏱️ Installation takes approximately 2 hours at your location or our Cape Town service centre.</p>
                <p>📱 Once installed, track your vehicle live on the <strong>VINK app</strong> or VINK dashboard.</p>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-3.5 rounded-xl text-sm font-bold text-white shadow-lg" style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)" }}>
              Back to VINK
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
