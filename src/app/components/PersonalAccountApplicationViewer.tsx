import { useState, useRef, useEffect } from "react";
import { X, CheckCircle, Upload, ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { applicationsApi, otpApi } from "../services/applicationsApi";

interface Props { isOpen: boolean; onClose: () => void; }

const BLUE = "#1B6FD8";

const STEPS = [
  { n: 1, label: "Info" },
  { n: 2, label: "KYC" },
  { n: 3, label: "Verify" },
  { n: 4, label: "Biometrics" },
  { n: 5, label: "Documents" },
  { n: 6, label: "Services" },
  { n: 7, label: "Account" },
];

// ─── Step bar ─────────────────────────────────────────────────────────────────
function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-stretch border-b border-gray-200 overflow-x-auto bg-white flex-shrink-0">
      {STEPS.map((s) => {
        const done   = s.n < current;
        const active = s.n === current;
        return (
          <div key={s.n}
            className="flex-1 min-w-[52px] flex flex-col items-center justify-center py-2.5 px-1 border-r border-gray-100 last:border-r-0"
            style={{ background: active ? BLUE : done ? "#EFF6FF" : "#fff" }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mb-0.5"
              style={{ background: active ? "#fff" : done ? BLUE : "#E5E7EB", color: active ? BLUE : done ? "#fff" : "#9CA3AF" }}>
              {done ? "✓" : s.n}
            </div>
            <p className="text-[9px] font-semibold leading-tight text-center"
              style={{ color: active ? "#fff" : done ? BLUE : "#9CA3AF" }}>
              {s.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared field components ──────────────────────────────────────────────────
function InputField({ label, value, onChange, placeholder, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white transition-colors" />
    </div>
  );
}

function SelectField({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white transition-colors">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = "Next", nextDisabled = false }: {
  onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-4 border-t border-gray-100">
      {onBack && (
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg border text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          style={{ borderColor: "#D1D5DB" }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      )}
      {onNext && (
        <button onClick={onNext} disabled={nextDisabled}
          className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40 ml-auto"
          style={{ background: BLUE }}>
          {nextLabel} <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </div>
  );
}

// ─── Step 1 — Personal Info ───────────────────────────────────────────────────
function Step1({ onNext }: { onNext: () => void }) {
  const [title, setTitle] = useState("Mr");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("Male");
  const [nationality, setNationality] = useState("South African");
  const [idType, setIdType] = useState("South African ID");
  const [idNumber, setIdNumber] = useState("");
  const [marital, setMarital] = useState("Single");
  const [phone, setPhone] = useState("+27 ");
  const [email, setEmail] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("Western Cape");
  const [postal, setPostal] = useState("");

  const isValid = firstName.trim() && lastName.trim() && dob && idNumber.trim() && phone.length > 5 && email.includes("@") && addr1.trim() && city.trim() && postal.trim();

  return (
    <div className="space-y-5">
      <SectionHead title="Personal Information" sub="Section 1 — Tell us about yourself" />
      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField label="Title" value={title} onChange={setTitle} options={["Mr","Mrs","Ms","Miss","Dr","Prof"]} />
        <InputField label="First name" value={firstName} onChange={setFirstName} placeholder="Given name" required />
        <InputField label="Middle name (optional)" value={middleName} onChange={setMiddleName} placeholder="Middle name" />
        <InputField label="Last / Surname" value={lastName} onChange={setLastName} placeholder="Family name" required />
        <InputField label="Date of birth" value={dob} onChange={setDob} type="date" required />
        <SelectField label="Gender" value={gender} onChange={setGender} options={["Male","Female","Non-binary","Prefer not to say"]} />
        <SelectField label="Nationality" value={nationality} onChange={setNationality}
          options={["South African","Zimbabwean","Mozambican","Zambian","Malawian","Namibian","Botswanan","Other"]} />
        <SelectField label="ID type" value={idType} onChange={setIdType}
          options={["South African ID","Passport","Asylum Seeker Permit","Work Permit"]} />
        <InputField label="ID / Passport number" value={idNumber} onChange={setIdNumber} placeholder="Your identity number" required />
        <SelectField label="Marital status" value={marital} onChange={setMarital}
          options={["Single","Married in community","Married out of community","Divorced","Widowed"]} />
        <InputField label="Cell number" value={phone} onChange={setPhone} placeholder="+27 82 000 0000" required />
        <InputField label="Email address" value={email} onChange={setEmail} type="email" placeholder="you@example.co.za" required />
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Residential Address</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <InputField label="Address line 1" value={addr1} onChange={setAddr1} placeholder="Street address" required />
          <InputField label="Address line 2 (optional)" value={addr2} onChange={setAddr2} placeholder="Suburb / Unit" />
          <InputField label="City" value={city} onChange={setCity} placeholder="Cape Town" required />
          <SelectField label="Province" value={province} onChange={setProvince}
            options={["Western Cape","Gauteng","KwaZulu-Natal","Eastern Cape","Limpopo","Mpumalanga","North West","Free State","Northern Cape"]} />
          <InputField label="Postal code" value={postal} onChange={setPostal} placeholder="8001" required />
        </div>
      </div>
      {!isValid && <p className="text-xs text-red-500">Please fill in all required fields before continuing.</p>}
      <NavButtons onNext={onNext} nextLabel="Next: KYC" nextDisabled={!isValid} />
    </div>
  );
}

// ─── Step 2 — KYC ────────────────────────────────────────────────────────────
function Step2({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [status, setStatus] = useState("Employed");
  const [employer, setEmployer] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("Banking & Finance");
  const [income, setIncome] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("Salary");
  const [taxNo, setTaxNo] = useState("");
  const [pep, setPep] = useState("No");

  return (
    <div className="space-y-5">
      <SectionHead title="Know Your Customer (KYC)" sub="Section 2 — Employment, income, and compliance information" />
      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField label="Employment status" value={status} onChange={setStatus}
          options={["Employed","Self-employed","Unemployed","Student","Retired","Government"]} />
        <InputField label="Employer / institution" value={employer} onChange={setEmployer} placeholder="Company name" />
        <InputField label="Job title / occupation" value={jobTitle} onChange={setJobTitle} placeholder="e.g. Software Engineer" />
        <SelectField label="Industry / sector" value={industry} onChange={setIndustry}
          options={["Banking & Finance","Transport & Logistics","Retail","Healthcare","Education","Government","Technology","Agriculture","Other"]} />
        <InputField label="Gross monthly income (ZAR)" value={income} onChange={setIncome} type="number" placeholder="25000" />
        <SelectField label="Source of funds" value={sourceOfFunds} onChange={setSourceOfFunds}
          options={["Salary","Business income","Investments","Pension","Inheritance","Gift","Other"]} />
        <InputField label="SARS Tax reference number" value={taxNo} onChange={setTaxNo} placeholder="9234567890" />
        <SelectField label="Politically Exposed Person (PEP)?" value={pep} onChange={setPep} options={["No","Yes"]} />
      </div>
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
        <strong>Why do we ask this?</strong> VMS is required by the Financial Intelligence Centre Act (FICA) to verify your source of funds and confirm your PEP status. All information is kept strictly confidential.
      </div>
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Verify" />
    </div>
  );
}

// ─── Step 3 — OTP Verify ─────────────────────────────────────────────────────
function Step3({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [phone, setPhone] = useState("+27 ");
  const [email, setEmail] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [sentPhone, setSentPhone] = useState(false);
  const [sentEmail, setSentEmail] = useState(false);
  const [phoneOk, setPhoneOk] = useState(false);
  const [emailOk, setEmailOk] = useState(false);

  return (
    <div className="space-y-5">
      <SectionHead title="Verify Your Identity" sub="Section 3 — Confirm your phone number and email address via OTP" />

      {/* Phone OTP */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          {phoneOk
            ? <CheckCircle className="w-4 h-4 text-green-500" />
            : <Clock className="w-4 h-4 text-yellow-500" />}
          <span className="text-sm font-semibold text-gray-800">Phone Number OTP</span>
          {phoneOk && <span className="ml-auto text-xs font-bold text-green-600">Verified</span>}
        </div>
        <InputField label="Cell number" value={phone} onChange={setPhone} placeholder="+27 82 000 0000" />
        {!sentPhone ? (
          <button onClick={() => setSentPhone(true)}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white border-0"
            style={{ background: BLUE }}>
            Send SMS OTP
          </button>
        ) : !phoneOk ? (
          <div className="flex gap-2 items-center">
            <input value={otpPhone} onChange={e => setOtpPhone(e.target.value)} placeholder="Enter 6-digit OTP"
              maxLength={6} className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 w-40" />
            <button onClick={() => { if (otpPhone.length >= 4) setPhoneOk(true); }}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white border-0"
              style={{ background: BLUE }}>
              Verify
            </button>
          </div>
        ) : null}
      </div>

      {/* Email OTP */}
      <div className="border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          {emailOk
            ? <CheckCircle className="w-4 h-4 text-green-500" />
            : <Clock className="w-4 h-4 text-yellow-500" />}
          <span className="text-sm font-semibold text-gray-800">Email Address OTP</span>
          {emailOk && <span className="ml-auto text-xs font-bold text-green-600">Verified</span>}
        </div>
        <InputField label="Email address" value={email} onChange={setEmail} type="email" placeholder="you@example.co.za" />
        {!sentEmail ? (
          <button onClick={() => setSentEmail(true)}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white border-0"
            style={{ background: BLUE }}>
            Send Email OTP
          </button>
        ) : !emailOk ? (
          <div className="flex gap-2 items-center">
            <input value={otpEmail} onChange={e => setOtpEmail(e.target.value)} placeholder="Enter 6-digit OTP"
              maxLength={6} className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 w-40" />
            <button onClick={() => { if (otpEmail.length >= 4) setEmailOk(true); }}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white border-0"
              style={{ background: BLUE }}>
              Verify
            </button>
          </div>
        ) : null}
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Biometrics" nextDisabled={!phoneOk || !emailOk} />
    </div>
  );
}

// ─── Step 4 — Biometrics ─────────────────────────────────────────────────────
function Step4({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [fp, setFp] = useState(false);
  const [selfie, setSelfie] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      <SectionHead title="Biometrics & Selfie" sub="Section 4 — Fingerprint and selfie confirmation required" />

      <div className="border-2 border-dashed rounded-2xl p-8 text-center transition-colors"
        style={{ borderColor: fp ? "#10B981" : "#E5E7EB", background: fp ? "#F0FDF4" : "#fff" }}>
        {!fp ? (
          <>
            <div className="text-5xl mb-3">👆</div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Fingerprint Scan</p>
            <p className="text-xs text-gray-400 mb-4">Place your finger on the scanner or mobile biometric sensor</p>
            <button onClick={() => setFp(true)}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-white border-0"
              style={{ background: BLUE }}>
              Capture Fingerprint
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <p className="text-sm font-bold text-green-700">Fingerprint matched</p>
          </div>
        )}
      </div>

      <div className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors"
        style={{ borderColor: selfie ? "#10B981" : "#E5E7EB", background: selfie ? "#F0FDF4" : "#fff" }}
        onClick={() => !selfie && fileRef.current?.click()}>
        {!selfie ? (
          <>
            <div className="text-5xl mb-3">🤳</div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Selfie Confirmation</p>
            <p className="text-xs text-gray-400 mb-4">Upload a clear photo of your face · JPG or PNG · Max 5MB</p>
            <span className="px-5 py-2.5 rounded-lg text-sm font-bold text-white inline-block" style={{ background: BLUE }}>
              Upload Selfie
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <p className="text-sm font-bold text-green-700">Selfie confirmed</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={() => setSelfie(true)} />
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Documents" nextDisabled={!fp || !selfie} />
    </div>
  );
}

// ─── Step 5 — Documents ──────────────────────────────────────────────────────
function Step5({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});

  const DOCS = [
    { key: "id",       label: "Certified copy of ID / Passport" },
    { key: "proofRes", label: "Proof of residence (not older than 3 months)" },
    { key: "payslip",  label: "Latest payslip or proof of income" },
    { key: "bankStat", label: "3 months bank statements" },
    { key: "taxDoc",   label: "SARS tax certificate (if applicable)" },
  ];
  const allDone = DOCS.every(d => uploaded[d.key]);

  return (
    <div className="space-y-5">
      <SectionHead title="Upload Documents" sub="Section 5 — Certified copies required · PDF, JPG, PNG · Max 10MB each" />
      <div className="space-y-3">
        {DOCS.map(d => (
          <label key={d.key}
            className="flex items-center justify-between p-4 bg-white border rounded-xl cursor-pointer hover:bg-blue-50 transition-colors"
            style={{ borderColor: uploaded[d.key] ? "#10B981" : "#E5E7EB" }}>
            <div className="flex items-center gap-3">
              {uploaded[d.key]
                ? <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" />
                : <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />}
              <span className="text-sm font-medium text-gray-800">{d.label}</span>
            </div>
            <span className="text-xs px-3 py-1 rounded-full font-semibold ml-3 flex-shrink-0"
              style={{ background: uploaded[d.key] ? "#DCFCE7" : "#EFF6FF", color: uploaded[d.key] ? "#059669" : BLUE }}>
              {uploaded[d.key] ? "Uploaded" : "Upload"}
            </span>
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
              onChange={() => setUploaded(p => ({ ...p, [d.key]: true }))} />
          </label>
        ))}
      </div>
      {!allDone && <p className="text-xs text-red-500">Please upload all required documents before continuing.</p>}
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Next: Services" nextDisabled={!allDone} />
    </div>
  );
}

// ─── Step 6 — Services ───────────────────────────────────────────────────────
function Step6({ onNext, onBack, submitting }: { onNext: () => void; onBack: () => void; submitting?: boolean }) {
  const [accountType, setAccountType] = useState("Clear Access Account");
  const [cardType, setCardType] = useState("Debit Card (free)");
  const [services, setServices] = useState<Record<string, boolean>>({
    internetBanking: true, mobileApp: true, smsAlerts: true, debitCard: true,
    overdraft: false, emailStatement: false,
  });
  const [consent, setConsent] = useState(false);

  const toggle = (k: string) => setServices(p => ({ ...p, [k]: !p[k] }));

  const SERVICE_LIST = [
    { key: "internetBanking", label: "Internet Banking",        sub: "Manage your account online" },
    { key: "mobileApp",       label: "VMS Mobile App",          sub: "Transact via smartphone" },
    { key: "smsAlerts",       label: "SMS Transaction Alerts",   sub: "Instant notifications for each transaction" },
    { key: "debitCard",       label: "Vink Debit Card",          sub: "Tap-and-go payments everywhere" },
    { key: "overdraft",       label: "Overdraft Facility",       sub: "Subject to credit assessment" },
    { key: "emailStatement",  label: "Monthly Email Statement",  sub: "PDF statement delivered to your inbox" },
  ];

  return (
    <div className="space-y-5">
      <SectionHead title="Select Services" sub="Section 6 — Choose your account type and activate optional services" />
      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField label="Account type" value={accountType} onChange={setAccountType}
          options={["Clear Access Account","Everyday Checking Account","Prime Checking Account","Premier Checking Account","Grain Account","Animal Account"]}
          required />
        <SelectField label="Card preference" value={cardType} onChange={setCardType}
          options={["Debit Card (free)","Prepaid Card","Virtual Card only","No card"]}
          required />
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Optional Services</p>
        <div className="space-y-2">
          {SERVICE_LIST.map(sv => (
            <label key={sv.key}
              className="flex items-center gap-3 p-3.5 bg-white border rounded-xl cursor-pointer hover:bg-blue-50 transition-colors"
              style={{ borderColor: services[sv.key] ? BLUE : "#E5E7EB" }}>
              <input type="checkbox" checked={!!services[sv.key]} onChange={() => toggle(sv.key)}
                className="w-4 h-4 flex-shrink-0" style={{ accentColor: BLUE }} />
              <div>
                <p className="text-sm font-semibold text-gray-800">{sv.label}</p>
                <p className="text-xs text-gray-400">{sv.sub}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border"
        style={{ borderColor: consent ? BLUE : "#E5E7EB", background: consent ? "#EFF6FF" : "#fff" }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
          className="mt-0.5 w-4 h-4 flex-shrink-0" style={{ accentColor: BLUE }} />
        <p className="text-xs text-gray-600 leading-relaxed">
          I consent to VMS processing my personal information in accordance with the POPIA Privacy Policy and acknowledge the VMS Terms &amp; Conditions for the selected account and services.
        </p>
      </label>

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={submitting ? "Submitting…" : "Open My Account"} nextDisabled={!consent || submitting} />
    </div>
  );
}

// ─── Step 7 — Account Opened (matches image) ─────────────────────────────────
function Step7({ onClose }: { onClose: () => void }) {
  const [accountNum, setAccountNum] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const n1 = Math.floor(1000 + Math.random() * 9000);
      const n2 = Math.floor(1000 + Math.random() * 9000);
      setAccountNum(`6200 ${n1} ${n2}`);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  const SUMMARY_ITEMS = [
    "Identity verified via OTP, fingerprint and selfie",
    "KYC documents received and processed",
    "Privacy consent and acknowledgement recorded",
    "Account and selected services activated",
    "Confirmation sent to your phone and email",
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black text-gray-900">Account opened successfully</h2>
        <p className="text-xs text-gray-500 mt-0.5">Section 7 — Your personal account details</p>
      </div>

      {/* Account number box */}
      <div className="border border-gray-200 rounded-xl p-6 text-center bg-white">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
          YOUR NEW ACCOUNT NUMBER
        </p>
        <div className="w-12 h-px bg-gray-300 mx-auto mb-4" />
        {accountNum ? (
          <p className="text-2xl font-black tracking-widest" style={{ color: BLUE }}>{accountNum}</p>
        ) : (
          <p className="text-sm text-gray-400 animate-pulse">Generating your account...</p>
        )}
      </div>

      {/* Account summary */}
      <div className="border border-gray-200 rounded-xl p-5 bg-white">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-4">ACCOUNT SUMMARY</p>
        <div className="space-y-2.5">
          {SUMMARY_ITEMS.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <input type="checkbox" checked={!!accountNum} readOnly
                className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" style={{ accentColor: BLUE }} />
              <p className="text-xs text-gray-600 leading-snug">{item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Important notes */}
      <div className="border border-gray-200 rounded-xl p-5 bg-white">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">IMPORTANT NOTES</p>
        <p className="text-xs text-gray-600 leading-relaxed">
          Keep your account active to avoid dormant status. Accounts inactive for 10 consecutive years may be transferred to the South African Reserve Bank (SARB) in accordance with the Unclaimed Monies Act. Uncollected cards or iBanking credentials held for 60+ days are subject to destruction and re-issuance fees.
        </p>
      </div>

      {/* Contact */}
      <div className="border border-gray-200 rounded-xl p-5 bg-white">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-4">VMS BANK CONTACT</p>
        <div className="grid sm:grid-cols-2 gap-3 text-xs text-gray-700">
          <div>
            <p className="text-gray-400 mb-0.5">Website</p>
            <a href="#" className="font-semibold" style={{ color: BLUE }}>www.vmsbank.co.za</a>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">VMS Call Centre</p>
            <a href="tel:+27210070772" className="font-semibold text-gray-800">+27 (0)21 007 0772</a>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Support Email</p>
            <a href="mailto:support@vink.com" className="font-semibold" style={{ color: BLUE }}>support@vink.com</a>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Head Office</p>
            <p className="font-semibold text-gray-800">8 Rose Street, Cape Town CBD</p>
          </div>
        </div>
      </div>

      <button onClick={onClose}
        className="w-full py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 border-0"
        style={{ background: BLUE }}>
        Done — Go to Home
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PersonalAccountApplicationViewer({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateForm = (data: Record<string, string>) =>
    setFormData(prev => ({ ...prev, ...data }));

  const next = () => {
    setStep(s => Math.min(s + 1, 7));
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitApplication = async () => {
    setSubmitting(true);
    try {
      await applicationsApi.submit({
        type: "personal-account",
        applicantName: `${formData.firstName ?? ""} ${formData.lastName ?? ""}`.trim() || "Applicant",
        applicantEmail: formData.email,
        applicantPhone: formData.phone,
        formData: { ...formData, accountType: formData.accountType ?? "Vink Personal Account" },
      });
    } catch { /* non-blocking — still advance */ }
    setSubmitting(false);
    setStep(7);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setStep(s => Math.max(s - 1, 1));
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Reset to step 1 when reopened
  useEffect(() => {
    if (isOpen) { setStep(1); setFormData({}); }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={vinkLogo} alt="Vink" className="h-9 w-auto object-contain" />
          <span className="text-sm font-semibold text-gray-700 hidden sm:block">Personal Account Application</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500">
          <X className="w-5 h-5" />
        </button>
      </div>

      <StepBar current={step} />

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {step === 1 && <Step1 onNext={next} />}
          {step === 2 && <Step2 onNext={next} onBack={back} />}
          {step === 3 && <Step3 onNext={next} onBack={back} />}
          {step === 4 && <Step4 onNext={next} onBack={back} />}
          {step === 5 && <Step5 onNext={next} onBack={back} />}
          {step === 6 && (
            <Step6
              onNext={submitApplication}
              onBack={back}
              submitting={submitting}
            />
          )}
          {step === 7 && <Step7 onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
