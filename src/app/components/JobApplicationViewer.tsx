import { useState, useEffect } from "react";
import { X, Check, ChevronRight, ChevronLeft, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Props { isOpen: boolean; onClose: () => void; }

const NAVY = "#0B2545";
const NAVY_2 = "#13315C";
const NAVY_3 = "#1E4172";
const GOLD = "#B8902E";
const GOLD_LIGHT = "#E4C878";
const MONO = "'IBM Plex Mono', monospace";
const PAPER = "#EEF1F6";
const INK = "#1B1F27";
const INK_SOFT = "#5B6472";
const LINE = "#D7DCE3";
const SUCCESS = "#2E7D5B";
const SUCCESS_BG = "#E8F3ED";
const ERROR = "#B3261E";

const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const BASE = import.meta.env.VITE_API_URL ?? (isLocalhost ? "http://localhost:3001" : "https://vink-grup-limited-production.up.railway.app");

interface Department {
  id: string; code: string; name: string; positions: string[]; desc: string; reqs: string[];
}

const DEPARTMENTS: Department[] = [
  { id: "bank", code: "BM", name: "Bank Management", positions: ["Head of Bank Management", "Bank Operations Manager", "Compliance Officer"],
    desc: "Manage bank accounts, branches, services and banking operations.",
    reqs: ["Bachelor's degree in Banking, Finance or Economics", "Minimum 5 years experience in retail or commercial banking operations", "Working knowledge of banking regulations and compliance frameworks", "Risk management certification (preferred, not mandatory)"] },
  { id: "payment", code: "PM", name: "Payment Management", positions: ["Head of Payment Management", "Payments Operations Manager", "Settlements Analyst"],
    desc: "Manage payments, settlements, refunds and transaction rules.",
    reqs: ["Bachelor's degree in Finance, IT or a related field", "Experience with payment gateways, settlement cycles and reconciliation", "Familiarity with PCI-DSS and payment security standards", "Experience designing transaction and refund rule sets"] },
  { id: "marketplace", code: "MM", name: "Marketplace Management", positions: ["Head of Marketplace Management", "Vendor Relations Manager", "Marketplace Operations Analyst"],
    desc: "Manage vendors, products, orders and marketplace activities.",
    reqs: ["Bachelor's degree in Business, Commerce or E-commerce", "Experience managing vendor onboarding and marketplace operations", "Understanding of order fulfilment and dispute resolution", "Data-driven approach to catalogue and pricing oversight"] },
  { id: "news", code: "NM", name: "News Management", positions: ["Head of News Management", "Managing Editor", "Content Operations Manager"],
    desc: "Manage news articles, categories, authors and publishing.",
    reqs: ["Bachelor's degree in Journalism, Media Studies or Communications", "Editorial experience with newsroom or publishing workflows", "Sound judgement on editorial standards and fact-checking", "Experience managing authors and content categorisation"] },
  { id: "mobile", code: "MN", name: "Mobile Network Management", positions: ["Head of Mobile Network Management", "Network Operations Manager", "MVNO Provisioning Specialist"],
    desc: "Manage mobile operators, packages, USSD, data and airtime services.",
    reqs: ["Bachelor's degree in Telecommunications or Electronic Engineering", "Experience in mobile network or MVNO operations", "Knowledge of USSD, data bundle and airtime service platforms", "Familiarity with telecom regulatory requirements"] },
  { id: "vehicle", code: "VM", name: "Vehicle Management", positions: ["Head of Vehicle Management", "Fleet Operations Manager", "Vehicle Compliance Officer"],
    desc: "Manage vehicles, fleets, tracking, inspections and documents.",
    reqs: ["Bachelor's degree in Logistics, Supply Chain or Fleet Management", "Experience managing vehicle fleets and inspection schedules", "Working knowledge of GPS tracking and telematics systems", "Understanding of vehicle licensing and documentation compliance"] },
  { id: "radio", code: "RT", name: "Radio & TV Station Management", positions: ["Head of Broadcast Management", "Programme Scheduling Manager", "Station Operations Manager"],
    desc: "Manage radio & TV stations, channels, programs and broadcasts.",
    reqs: ["Bachelor's degree in Broadcasting, Media or Communications", "Experience in programme scheduling and station operations", "Understanding of broadcast licensing and content regulation", "Experience managing on-air and production teams"] },
  { id: "event", code: "EM", name: "Event Management", positions: ["Head of Event Management", "Event Operations Manager", "Venue & Logistics Coordinator"],
    desc: "Manage events, schedules, registrations and venues.",
    reqs: ["Bachelor's degree in Events, Hospitality or Business Management", "Experience coordinating venues, schedules and registrations", "Vendor and logistics management experience", "Strong stakeholder and on-site coordination skills"] },
  { id: "company", code: "CR", name: "Company Registration Management", positions: ["Head of Company Registration", "Registration Compliance Officer", "Verification Specialist"],
    desc: "Manage company registrations, verifications and compliance.",
    reqs: ["Bachelor's degree in Law, Business or Corporate Governance", "Experience with company registration and verification processes", "Working knowledge of corporate compliance requirements", "Attention to detail in regulatory documentation"] },
  { id: "insurance", code: "IM", name: "Insurance Management", positions: ["Head of Insurance Management", "Underwriting Manager", "Claims Operations Manager"],
    desc: "Manage insurance products, policies, claims and providers.",
    reqs: ["Bachelor's degree in Insurance, Actuarial Science or Finance", "Experience in underwriting, claims or policy administration", "Knowledge of insurance regulatory frameworks", "Relationship management experience with providers"] },
  { id: "csr", code: "SR", name: "Social Responsibility Management", positions: ["Head of Social Responsibility", "CSR Programme Manager", "Community Impact Officer"],
    desc: "Manage CSR initiatives, donations, projects and community impact.",
    reqs: ["Bachelor's degree in Social Sciences, Development Studies or related field", "Experience managing CSR or community development projects", "Grant and donation management experience", "Strong impact measurement and reporting skills"] },
];

const STEP_LABELS = [
  { t: "Personal Details", d: "Identity & origin" },
  { t: "Education", d: "Academic history" },
  { t: "Work Experience", d: "Professional record" },
  { t: "Role Requirements", d: "Fit for the position" },
  { t: "CV & Documents", d: "Upload evidence" },
  { t: "Declarations", d: "Consent & accuracy" },
  { t: "Review & Submit", d: "Final check" },
];

interface Education { institution: string; qualification: string; field: string; year: string; country: string; }
interface Experience { employer: string; title: string; start: string; end: string; current: boolean; responsibilities: string; }
interface Personal {
  firstName: string; middleName: string; lastName: string; dob: string;
  cityBirth: string; countryBirth: string; cityResidence: string; countryResidence: string;
  nationality: string; otherNats: string[]; email: string; phone: string;
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12.5px] font-semibold mb-1.5" style={{ color: NAVY }}>
        {label}{required && " *"}
      </label>
      {children}
      {error && <p className="text-xs mt-1" style={{ color: ERROR }}>{error}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 rounded border text-sm outline-none transition-colors";
function inputStyle(invalid?: boolean): React.CSSProperties {
  return { borderColor: invalid ? ERROR : LINE, color: INK };
}

export function JobApplicationViewer({ isOpen, onClose }: Props) {
  const [phase, setPhase] = useState<"select" | "form" | "done">("select");
  const [step, setStep] = useState(1);
  const [deptId, setDeptId] = useState<string | null>(null);
  const [position, setPosition] = useState<string>("");
  const [refNum, setRefNum] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Set<string>>(new Set());

  const [personal, setPersonal] = useState<Personal>({
    firstName: "", middleName: "", lastName: "", dob: "", cityBirth: "", countryBirth: "",
    cityResidence: "", countryResidence: "", nationality: "", otherNats: [], email: "", phone: "",
  });
  const [natInput, setNatInput] = useState("");
  const [education, setEducation] = useState<Education[]>([{ institution: "", qualification: "", field: "", year: "", country: "" }]);
  const [experience, setExperience] = useState<Experience[]>([{ employer: "", title: "", start: "", end: "", current: false, responsibilities: "" }]);
  const [reqAnswers, setReqAnswers] = useState<Record<number, { met: boolean; note: string }>>({});
  const [docs, setDocs] = useState<Record<string, File | null>>({ cv: null, id: null, certs: null, residence: null, other: null });
  const [decl, setDecl] = useState({ accurate: false, consent: false, terms: false, signature: "" });

  const dept = DEPARTMENTS.find(d => d.id === deptId) ?? null;

  // The reference design specifies Source Serif 4, Inter, and IBM Plex
  // Mono via a Google Fonts @import — referencing these font names in
  // inline styles alone does nothing if the font files were never
  // actually loaded; the browser silently substitutes a generic serif/
  // monospace instead, which would look visually different from the
  // reference despite every color/spacing value matching. Injected only
  // while this modal is open, removed on close, so it doesn't affect the
  // rest of the site's font loading.
  useEffect(() => {
    if (!isOpen) return;
    const linkId = "job-application-fonts";
    if (document.getElementById(linkId)) return;
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
    return () => { document.getElementById(linkId)?.remove(); };
  }, [isOpen]);

  const resetAll = () => {
    setPhase("select"); setStep(1); setDeptId(null); setPosition(""); setRefNum(""); setErrors(new Set());
    setPersonal({ firstName: "", middleName: "", lastName: "", dob: "", cityBirth: "", countryBirth: "", cityResidence: "", countryResidence: "", nationality: "", otherNats: [], email: "", phone: "" });
    setEducation([{ institution: "", qualification: "", field: "", year: "", country: "" }]);
    setExperience([{ employer: "", title: "", start: "", end: "", current: false, responsibilities: "" }]);
    setReqAnswers({}); setDocs({ cv: null, id: null, certs: null, residence: null, other: null });
    setDecl({ accurate: false, consent: false, terms: false, signature: "" });
  };

  if (!isOpen) return null;

  const validateStep = (): boolean => {
    const bad = new Set<string>();
    if (step === 1) {
      const req: Record<string, string> = {
        firstName: personal.firstName, lastName: personal.lastName, dob: personal.dob, nationality: personal.nationality,
        cityBirth: personal.cityBirth, countryBirth: personal.countryBirth, cityResidence: personal.cityResidence,
        countryResidence: personal.countryResidence, email: personal.email, phone: personal.phone,
      };
      Object.entries(req).forEach(([k, v]) => { if (!v.trim()) bad.add(k); });
      if (personal.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personal.email)) bad.add("email");
    }
    if (step === 2) {
      education.forEach((e, i) => {
        if (!e.institution.trim()) bad.add(`edu_institution_${i}`);
        if (!e.qualification.trim()) bad.add(`edu_qualification_${i}`);
        if (!e.year.trim()) bad.add(`edu_year_${i}`);
      });
    }
    if (step === 3) {
      experience.forEach((e, i) => {
        if (!e.employer.trim()) bad.add(`exp_employer_${i}`);
        if (!e.title.trim()) bad.add(`exp_title_${i}`);
      });
    }
    if (step === 4 && dept) {
      dept.reqs.forEach((_, i) => { if (!reqAnswers[i]?.met) bad.add(`req_${i}`); });
    }
    if (step === 5) {
      if (!docs.cv) bad.add("doc_cv");
      if (!docs.id) bad.add("doc_id");
      if (!docs.certs) bad.add("doc_certs");
    }
    if (step === 6) {
      if (!decl.accurate) bad.add("accurate");
      if (!decl.consent) bad.add("consent");
      if (!decl.terms) bad.add("terms");
      if (!decl.signature.trim()) bad.add("signature");
    }
    setErrors(bad);
    return bad.size === 0;
  };

  const handleSubmit = async () => {
    if (!dept) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("department", dept.name);
      fd.append("position", position);
      fd.append("deptCode", dept.code);
      fd.append("applicantName", `${personal.firstName} ${personal.lastName}`.trim());
      fd.append("applicantEmail", personal.email);
      fd.append("applicantPhone", personal.phone);
      fd.append("details", JSON.stringify({ personal, education, experience, reqAnswers, decl }));
      for (const [key, file] of Object.entries(docs)) if (file) fd.append(key, file);

      const res = await fetch(`${BASE}/api/jobs/apply`, { method: "POST", body: fd });
      const json = await res.json();
      if (json.success) {
        setRefNum(json.data.referenceNumber);
        setPhase("done");
      } else {
        toast.error(json.error ?? "Couldn't submit your application — please try again.");
      }
    } catch {
      toast.error("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (!validateStep()) return;
    if (step === 7) { handleSubmit(); return; }
    setStep(s => s + 1);
    setErrors(new Set());
  };
  const goBack = () => {
    if (step === 1) { setPhase("select"); return; }
    setStep(s => s - 1);
    setErrors(new Set());
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: PAPER, fontFamily: "'Inter', sans-serif" }}>
      {phase === "select" && (
        <SelectPhase
          deptId={deptId} setDeptId={setDeptId}
          position={position} setPosition={setPosition}
          onClose={onClose}
          onContinue={() => { if (deptId && position) { setPhase("form"); setStep(1); } }}
        />
      )}

      {phase === "form" && dept && (
        <div className="flex min-h-screen">
          <Rail dept={dept} position={position} step={step} onClose={onClose} />
          <div className="flex-1 flex justify-center px-6 py-11 pb-20">
            <div className="w-full max-w-[760px]">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[11.5px] tracking-wide uppercase" style={{ color: INK_SOFT, fontFamily: MONO }}>Step {step} of 7 — {STEP_LABELS[step - 1].t}</span>
                <span className="text-[11.5px]" style={{ color: INK_SOFT, fontFamily: MONO }}>{dept.code}-APPLICATION</span>
              </div>
              <div className="h-0.5 rounded-full mb-7" style={{ background: LINE }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(step / 7) * 100}%`, background: GOLD }} />
              </div>
              <StepHeader step={step} dept={dept} position={position} />
              {errors.size > 0 && (
                <div className="px-4 py-3 rounded text-sm mb-5" style={{ background: "#FBEAE8", border: `1px solid ${ERROR}`, color: ERROR }}>
                  Please complete the required fields before continuing.
                </div>
              )}
              <div className="bg-white border rounded p-8" style={{ borderColor: LINE }}>
                {step === 1 && <StepPersonal personal={personal} setPersonal={setPersonal} natInput={natInput} setNatInput={setNatInput} errors={errors} />}
                {step === 2 && <StepEducation education={education} setEducation={setEducation} errors={errors} />}
                {step === 3 && <StepExperience experience={experience} setExperience={setExperience} errors={errors} />}
                {step === 4 && <StepRequirements dept={dept} reqAnswers={reqAnswers} setReqAnswers={setReqAnswers} />}
                {step === 5 && <StepDocs docs={docs} setDocs={setDocs} errors={errors} />}
                {step === 6 && <StepDeclarations decl={decl} setDecl={setDecl} errors={errors} />}
                {step === 7 && <StepReview dept={dept} position={position} personal={personal} education={education} experience={experience} reqAnswers={reqAnswers} docs={docs} decl={decl} onJump={(n) => { if (n === 0) setPhase("select"); else setStep(n); }} />}
              </div>
              <div className="flex justify-between items-center mt-7">
                <button onClick={goBack} className="flex items-center gap-1.5 px-6 py-2.5 rounded text-sm font-semibold border transition-colors hover:border-opacity-70" style={{ color: NAVY, borderColor: LINE }}>
                  <ChevronLeft className="w-4 h-4" /> {step === 1 ? "Change department" : "Back"}
                </button>
                <button onClick={goNext} disabled={submitting}
                  className="px-7 py-2.5 rounded text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: NAVY }}>
                  {submitting ? "Submitting…" : step === 7 ? "Submit application" : "Continue →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "done" && dept && (
        <div className="flex justify-center px-6 py-16 min-h-screen">
          <div className="w-full max-w-[640px]">
            <div className="bg-white border rounded p-14 text-center" style={{ borderColor: LINE }}>
              <div className="inline-flex flex-col items-center justify-center w-[160px] h-[160px] rounded-full border-[3px] mb-6" style={{ borderColor: GOLD, color: GOLD, transform: "rotate(-8deg)" }}>
                <span className="text-[10px] tracking-widest uppercase" style={{ fontFamily: MONO }}>Application</span>
                <span className="font-bold text-xl my-1" style={{ fontFamily: "'Source Serif 4', serif" }}>Received</span>
                <span className="text-[11px]" style={{ fontFamily: MONO }}>{refNum}</span>
              </div>
              <h1 className="text-2xl font-semibold mb-3" style={{ color: NAVY, fontFamily: "'Source Serif 4', serif" }}>
                Thank you, {personal.firstName}.
              </h1>
              <p className="text-sm max-w-md mx-auto mb-7 leading-relaxed" style={{ color: INK_SOFT }}>
                Your application for <strong>{position}</strong> has been submitted. Your reference number is <span style={{ fontFamily: MONO }}>{refNum}</span> — keep this for your records. The hiring panel will contact you at <strong>{personal.email}</strong> regarding next steps.
              </p>
              <button onClick={() => { resetAll(); }} className="px-7 py-2.5 rounded text-sm font-semibold text-white hover:opacity-90 transition-opacity" style={{ background: NAVY }}>
                Start a new application
              </button>
              <button onClick={onClose} className="block mx-auto mt-4 text-xs font-semibold" style={{ color: INK_SOFT }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectPhase({ deptId, setDeptId, position, setPosition, onClose, onContinue }: {
  deptId: string | null; setDeptId: (id: string) => void;
  position: string; setPosition: (p: string) => void;
  onClose: () => void; onContinue: () => void;
}) {
  const dept = DEPARTMENTS.find(d => d.id === deptId) ?? null;
  const selectCls = "w-full px-3.5 py-3 rounded border text-sm outline-none bg-white appearance-none cursor-pointer";
  return (
    <div className="flex justify-center px-6 py-11 pb-20">
      <div className="w-full max-w-[620px] relative">
        <button onClick={onClose} className="absolute right-0 top-0 p-2 rounded-full hover:bg-black/5" style={{ color: INK_SOFT }}><X className="w-5 h-5" /></button>
        <span className="text-[11.5px] tracking-wide uppercase" style={{ color: INK_SOFT, fontFamily: MONO }}>Careers · Management Roles</span>
        <h1 className="text-[26px] font-semibold mt-1.5 mb-1.5" style={{ color: NAVY, fontFamily: "'Source Serif 4', serif" }}>
          Select the department you are applying to
        </h1>
        <p className="text-sm mb-8 max-w-2xl leading-relaxed" style={{ color: INK_SOFT }}>
          Choose a department, then the specific position within it. Your application form — including role-specific requirements — will be tailored to your selection.
        </p>

        <div className="space-y-5">
          <Field label="Department" required>
            <div className="relative">
              <select
                className={selectCls} style={{ borderColor: LINE, color: deptId ? INK : INK_SOFT }}
                value={deptId ?? ""}
                onChange={e => { setDeptId(e.target.value); setPosition(""); }}
              >
                <option value="" disabled>Select a department…</option>
                {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: INK_SOFT }} />
            </div>
            {dept && <p className="text-xs mt-2 leading-relaxed" style={{ color: INK_SOFT }}>{dept.desc}</p>}
          </Field>

          <Field label="Position" required>
            <div className="relative">
              <select
                className={selectCls} style={{ borderColor: LINE, color: position ? INK : INK_SOFT, opacity: dept ? 1 : 0.5 }}
                value={position}
                onChange={e => setPosition(e.target.value)}
                disabled={!dept}
              >
                <option value="" disabled>{dept ? "Select a position…" : "Select a department first"}</option>
                {dept?.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: INK_SOFT }} />
            </div>
          </Field>
        </div>

        <div className="flex justify-end mt-8">
          <button onClick={onContinue} disabled={!deptId || !position}
            className="px-7 py-3 rounded text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: NAVY }}>
            Continue to application →
          </button>
        </div>
      </div>
    </div>
  );
}

function Rail({ dept, position, step, onClose }: { dept: Department; position: string; step: number; onClose: () => void }) {
  return (
    <div className="hidden min-[840px]:flex flex-col w-[280px] flex-shrink-0 sticky top-0 h-screen overflow-y-auto px-7 pt-9 pb-7 text-white"
      style={{ background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_2} 100%)` }}>
      <div className="flex items-center gap-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.14)", paddingBottom: "22px", marginBottom: "26px" }}>
        <span className="w-[34px] h-[34px] rounded-full border flex items-center justify-center font-bold text-[15px]" style={{ borderColor: GOLD_LIGHT, color: GOLD_LIGHT, fontFamily: "'Source Serif 4', serif" }}>M</span>
        <span>
          <span className="block text-[11px] tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.55)" }}>Careers Portal</span>
          <span className="block text-[15px]" style={{ fontFamily: "'Source Serif 4', serif" }}>Management Roles</span>
        </span>
        <button onClick={onClose} className="ml-auto p-1.5 rounded-full hover:bg-white/10" style={{ color: "rgba(255,255,255,0.5)" }}><X className="w-4 h-4" /></button>
      </div>
      <div className="rounded p-3.5 mb-7" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
        <p className="text-[10px] tracking-wide uppercase mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Applying for</p>
        <p className="text-[13.5px] font-semibold leading-snug" style={{ color: GOLD_LIGHT }}>{position}</p>
      </div>
      <ul className="space-y-0">
        {STEP_LABELS.map((s, i) => {
          const n = i + 1;
          const isActive = n === step, isDone = n < step;
          return (
            <li key={s.t} className="flex gap-3 items-start py-2.5 relative">
              <span className="flex-shrink-0 w-[30px] h-[30px] rounded-full border flex items-center justify-center text-xs z-10"
                style={{
                  background: isActive ? GOLD : "transparent",
                  borderColor: isActive ? GOLD : isDone ? SUCCESS : "rgba(255,255,255,0.3)",
                  color: isActive ? NAVY : isDone ? SUCCESS : "rgba(255,255,255,0.55)",
                  fontWeight: isActive ? 700 : 400,
                  fontFamily: MONO,
                }}>
                {isDone ? <Check className="w-3.5 h-3.5" /> : n}
              </span>
              <span className="pt-1">
                <span className="block text-[13px] font-semibold" style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.9)" }}>{s.t}</span>
                <span className="block text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{s.d}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StepHeader({ step, dept, position }: { step: number; dept: Department; position: string }) {
  const map: Record<number, [string, string]> = {
    1: ["Personal details", "Provide your full identity information exactly as it appears on your official documents."],
    2: ["Education", "List every qualification relevant to this role, starting with the most recent."],
    3: ["Work experience", "Detail your professional history, most recent role first."],
    4: [`Requirements for ${position}`, "Confirm how you meet each requirement listed for this management position."],
    5: ["CV & supporting documents", "Upload your CV and the supporting documents listed below."],
    6: ["Declarations & consent", "Please read and confirm each declaration before proceeding."],
    7: ["Review & submit", "Check every section carefully. You can jump back to make changes before submitting."],
  };
  const [t, s] = map[step];
  return (
    <>
      <h1 className="text-2xl font-semibold mb-1.5" style={{ color: NAVY, fontFamily: "'Source Serif 4', serif" }}>{t}</h1>
      <p className="text-sm mb-7 max-w-xl leading-relaxed" style={{ color: INK_SOFT }}>{s}</p>
    </>
  );
}

function StepPersonal({ personal, setPersonal, natInput, setNatInput, errors }: {
  personal: Personal; setPersonal: React.Dispatch<React.SetStateAction<Personal>>;
  natInput: string; setNatInput: (v: string) => void; errors: Set<string>;
}) {
  const set = (k: keyof Personal) => (e: React.ChangeEvent<HTMLInputElement>) => setPersonal(p => ({ ...p, [k]: e.target.value }));
  const addNat = () => { if (natInput.trim()) { setPersonal(p => ({ ...p, otherNats: [...p.otherNats, natInput.trim()] })); setNatInput(""); } };
  return (
    <div className="grid min-[840px]:grid-cols-2 gap-5">
      <Field label="First name" required error={errors.has("firstName") ? "First name is required." : undefined}>
        <input className={inputCls} style={inputStyle(errors.has("firstName"))} value={personal.firstName} onChange={set("firstName")} />
      </Field>
      <Field label="Last name" required error={errors.has("lastName") ? "Last name is required." : undefined}>
        <input className={inputCls} style={inputStyle(errors.has("lastName"))} value={personal.lastName} onChange={set("lastName")} />
      </Field>
      <div className="min-[840px]:col-span-2">
        <Field label="Middle name(s) (optional)">
          <input className={inputCls} style={inputStyle()} value={personal.middleName} onChange={set("middleName")} />
        </Field>
      </div>
      <Field label="Date of birth" required error={errors.has("dob") ? "Date of birth is required." : undefined}>
        <input type="date" className={inputCls} style={inputStyle(errors.has("dob"))} value={personal.dob} onChange={set("dob")} />
      </Field>
      <Field label="Primary nationality" required error={errors.has("nationality") ? "Nationality is required." : undefined}>
        <input className={inputCls} style={inputStyle(errors.has("nationality"))} value={personal.nationality} onChange={set("nationality")} placeholder="e.g. South African" />
      </Field>
      <Field label="City of birth" required error={errors.has("cityBirth") ? "City of birth is required." : undefined}>
        <input className={inputCls} style={inputStyle(errors.has("cityBirth"))} value={personal.cityBirth} onChange={set("cityBirth")} />
      </Field>
      <Field label="Country of birth" required error={errors.has("countryBirth") ? "Country of birth is required." : undefined}>
        <input className={inputCls} style={inputStyle(errors.has("countryBirth"))} value={personal.countryBirth} onChange={set("countryBirth")} />
      </Field>
      <Field label="City of residence" required error={errors.has("cityResidence") ? "City of residence is required." : undefined}>
        <input className={inputCls} style={inputStyle(errors.has("cityResidence"))} value={personal.cityResidence} onChange={set("cityResidence")} />
      </Field>
      <Field label="Country of residence" required error={errors.has("countryResidence") ? "Country of residence is required." : undefined}>
        <input className={inputCls} style={inputStyle(errors.has("countryResidence"))} value={personal.countryResidence} onChange={set("countryResidence")} />
      </Field>
      <div className="min-[840px]:col-span-2">
        <Field label="Other nationalities (if you hold more than one, add each below)">
          <div className="flex flex-wrap gap-1.5 p-2 rounded border items-center" style={{ borderColor: LINE }}>
            {personal.otherNats.map((n, i) => (
              <span key={i} className="flex items-center gap-1.5 text-white text-xs pl-3 pr-2 py-1.5 rounded-full" style={{ background: NAVY }}>
                {n}
                <button type="button" onClick={() => setPersonal(p => ({ ...p, otherNats: p.otherNats.filter((_, j) => j !== i) }))} className="text-white/75 hover:text-white">×</button>
              </span>
            ))}
            <input value={natInput} onChange={e => setNatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNat(); } }}
              placeholder="Type a nationality and press Enter" className="flex-1 min-w-[120px] text-sm outline-none py-1 px-1" />
          </div>
        </Field>
      </div>
      <Field label="Email address" required error={errors.has("email") ? "A valid email is required." : undefined}>
        <input type="email" className={inputCls} style={inputStyle(errors.has("email"))} value={personal.email} onChange={set("email")} />
      </Field>
      <Field label="Phone number" required error={errors.has("phone") ? "Phone number is required." : undefined}>
        <input type="tel" className={inputCls} style={inputStyle(errors.has("phone"))} value={personal.phone} onChange={set("phone")} />
      </Field>
    </div>
  );
}

function StepEducation({ education, setEducation, errors }: { education: Education[]; setEducation: React.Dispatch<React.SetStateAction<Education[]>>; errors: Set<string> }) {
  const upd = (i: number, patch: Partial<Education>) => setEducation(es => es.map((e, j) => j === i ? { ...e, ...patch } : e));
  return (
    <div className="space-y-4">
      {education.map((e, i) => (
        <div key={i} className="border rounded p-5" style={{ borderColor: LINE, background: "#FBFCFD" }}>
          <div className="flex justify-between items-center mb-3.5">
            <span className="text-[11px] uppercase tracking-wide" style={{ color: INK_SOFT, fontFamily: MONO }}>Qualification {i + 1}</span>
            {education.length > 1 && <button onClick={() => setEducation(es => es.filter((_, j) => j !== i))} className="text-xs font-semibold" style={{ color: ERROR }}>Remove</button>}
          </div>
          <div className="grid min-[840px]:grid-cols-2 gap-4">
            <div className="min-[840px]:col-span-2">
              <Field label="Institution" required error={errors.has(`edu_institution_${i}`) ? "Institution is required." : undefined}>
                <input className={inputCls} style={inputStyle(errors.has(`edu_institution_${i}`))} value={e.institution} onChange={ev => upd(i, { institution: ev.target.value })} />
              </Field>
            </div>
            <Field label="Qualification" required error={errors.has(`edu_qualification_${i}`) ? "Qualification is required." : undefined}>
              <input className={inputCls} style={inputStyle(errors.has(`edu_qualification_${i}`))} value={e.qualification} onChange={ev => upd(i, { qualification: ev.target.value })} placeholder="e.g. BCom Honours" />
            </Field>
            <Field label="Field of study">
              <input className={inputCls} style={inputStyle()} value={e.field} onChange={ev => upd(i, { field: ev.target.value })} />
            </Field>
            <Field label="Year completed" required error={errors.has(`edu_year_${i}`) ? "Year is required." : undefined}>
              <input className={inputCls} style={inputStyle(errors.has(`edu_year_${i}`))} value={e.year} onChange={ev => upd(i, { year: ev.target.value })} placeholder="YYYY" />
            </Field>
            <Field label="Country">
              <input className={inputCls} style={inputStyle()} value={e.country} onChange={ev => upd(i, { country: ev.target.value })} />
            </Field>
          </div>
        </div>
      ))}
      <button onClick={() => setEducation(es => [...es, { institution: "", qualification: "", field: "", year: "", country: "" }])}
        className="w-full py-3 rounded text-sm font-semibold border border-dashed transition-colors hover:bg-black/5" style={{ borderColor: NAVY_3, color: NAVY_3 }}>
        + Add another qualification
      </button>
    </div>
  );
}

function StepExperience({ experience, setExperience, errors }: { experience: Experience[]; setExperience: React.Dispatch<React.SetStateAction<Experience[]>>; errors: Set<string> }) {
  const upd = (i: number, patch: Partial<Experience>) => setExperience(es => es.map((e, j) => j === i ? { ...e, ...patch } : e));
  return (
    <div className="space-y-4">
      {experience.map((e, i) => (
        <div key={i} className="border rounded p-5" style={{ borderColor: LINE, background: "#FBFCFD" }}>
          <div className="flex justify-between items-center mb-3.5">
            <span className="text-[11px] uppercase tracking-wide" style={{ color: INK_SOFT, fontFamily: MONO }}>Role {i + 1}</span>
            {experience.length > 1 && <button onClick={() => setExperience(es => es.filter((_, j) => j !== i))} className="text-xs font-semibold" style={{ color: ERROR }}>Remove</button>}
          </div>
          <div className="grid min-[840px]:grid-cols-2 gap-4">
            <Field label="Employer" required error={errors.has(`exp_employer_${i}`) ? "Employer is required." : undefined}>
              <input className={inputCls} style={inputStyle(errors.has(`exp_employer_${i}`))} value={e.employer} onChange={ev => upd(i, { employer: ev.target.value })} />
            </Field>
            <Field label="Job title" required error={errors.has(`exp_title_${i}`) ? "Job title is required." : undefined}>
              <input className={inputCls} style={inputStyle(errors.has(`exp_title_${i}`))} value={e.title} onChange={ev => upd(i, { title: ev.target.value })} />
            </Field>
            <Field label="Start date">
              <input type="date" className={inputCls} style={inputStyle()} value={e.start} onChange={ev => upd(i, { start: ev.target.value })} />
            </Field>
            <Field label="End date (leave blank if current)">
              <input type="date" className={inputCls} style={inputStyle()} value={e.end} onChange={ev => upd(i, { end: ev.target.value })} disabled={e.current} />
            </Field>
            <div className="min-[840px]:col-span-2">
              <label className="flex items-center gap-2 text-sm" style={{ color: INK }}>
                <input type="checkbox" checked={e.current} onChange={ev => upd(i, { current: ev.target.checked })} className="w-4 h-4" style={{ accentColor: NAVY_3 }} />
                This is my current role
              </label>
            </div>
            <div className="min-[840px]:col-span-2">
              <Field label="Key responsibilities">
                <textarea className={inputCls + " min-h-[78px] resize-y"} style={inputStyle()} value={e.responsibilities} onChange={ev => upd(i, { responsibilities: ev.target.value })} />
              </Field>
            </div>
          </div>
        </div>
      ))}
      <button onClick={() => setExperience(es => [...es, { employer: "", title: "", start: "", end: "", current: false, responsibilities: "" }])}
        className="w-full py-3 rounded text-sm font-semibold border border-dashed transition-colors hover:bg-black/5" style={{ borderColor: NAVY_3, color: NAVY_3 }}>
        + Add another role
      </button>
    </div>
  );
}

function StepRequirements({ dept, reqAnswers, setReqAnswers }: {
  dept: Department; reqAnswers: Record<number, { met: boolean; note: string }>;
  setReqAnswers: React.Dispatch<React.SetStateAction<Record<number, { met: boolean; note: string }>>>;
}) {
  return (
    <div>
      {dept.reqs.map((r, i) => {
        const ans = reqAnswers[i] ?? { met: false, note: "" };
        return (
          <div key={i} className="flex gap-3.5 py-4 border-b last:border-b-0" style={{ borderColor: LINE }}>
            <input type="checkbox" checked={ans.met} onChange={e => setReqAnswers(a => ({ ...a, [i]: { ...ans, met: e.target.checked } }))}
              className="w-[17px] h-[17px] mt-0.5 flex-shrink-0" style={{ accentColor: NAVY_3 }} />
            <div className="flex-1">
              <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{r}</p>
              <textarea value={ans.note} onChange={e => setReqAnswers(a => ({ ...a, [i]: { ...ans, note: e.target.value } }))}
                placeholder="Briefly explain how you meet this requirement (optional)"
                className="w-full mt-2 text-[13px] px-2.5 py-2 rounded border min-h-[50px] outline-none" style={{ borderColor: LINE }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepDocs({ docs, setDocs, errors }: { docs: Record<string, File | null>; setDocs: React.Dispatch<React.SetStateAction<Record<string, File | null>>>; errors: Set<string> }) {
  const items = [
    { key: "cv", label: "Curriculum Vitae (CV)", required: true },
    { key: "id", label: "ID document or passport copy", required: true },
    { key: "certs", label: "Qualification certificates", required: true },
    { key: "residence", label: "Proof of residence", required: false },
    { key: "other", label: "Other supporting documents", required: false },
  ];
  return (
    <div>
      {items.map(it => {
        const file = docs[it.key];
        const invalid = errors.has(`doc_${it.key}`);
        return (
          <div key={it.key} className="flex items-center gap-4 rounded border mb-3.5"
            style={{ padding: "18px", borderColor: file ? SUCCESS : invalid ? ERROR : LINE, background: file ? SUCCESS_BG : "#FBFCFD" }}>
            <span className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-base" style={{ background: file ? SUCCESS : NAVY }}>
              {file ? <Check className="w-5 h-5" /> : "↑"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{it.label} {it.required && <span style={{ color: ERROR }}>*</span>}</p>
              <p className="text-xs mt-0.5 truncate" style={{ color: INK_SOFT }}>{file ? file.name : "No file selected"}</p>
            </div>
            <label className="flex-shrink-0 text-white text-xs font-semibold px-4 py-2.5 rounded cursor-pointer hover:opacity-90" style={{ background: NAVY }}>
              Choose file
              <input type="file" className="hidden" onChange={e => setDocs(d => ({ ...d, [it.key]: e.target.files?.[0] ?? null }))} />
            </label>
          </div>
        );
      })}
      <p className="text-[11.5px] mt-1" style={{ color: INK_SOFT }}>Files are attached to your application record for review by the hiring panel.</p>
    </div>
  );
}

function StepDeclarations({ decl, setDecl, errors }: { decl: { accurate: boolean; consent: boolean; terms: boolean; signature: string }; setDecl: React.Dispatch<React.SetStateAction<{ accurate: boolean; consent: boolean; terms: boolean; signature: string }>>; errors: Set<string> }) {
  return (
    <div>
      <label className="flex gap-3.5 py-4 border-b items-start cursor-pointer" style={{ borderColor: LINE }}>
        <input type="checkbox" checked={decl.accurate} onChange={e => setDecl(d => ({ ...d, accurate: e.target.checked }))} className="mt-0.5 w-[17px] h-[17px] flex-shrink-0" style={{ accentColor: NAVY_3 }} />
        <p className="text-[13.5px] leading-relaxed" style={{ color: INK }}>I declare that the information provided in this application is true, complete and accurate to the best of my knowledge.</p>
      </label>
      <label className="flex gap-3.5 py-4 border-b items-start cursor-pointer" style={{ borderColor: LINE }}>
        <input type="checkbox" checked={decl.consent} onChange={e => setDecl(d => ({ ...d, consent: e.target.checked }))} className="mt-0.5 w-[17px] h-[17px] flex-shrink-0" style={{ accentColor: NAVY_3 }} />
        <p className="text-[13.5px] leading-relaxed" style={{ color: INK }}>I consent to background, reference and qualification verification checks being carried out as part of this application.</p>
      </label>
      <label className="flex gap-3.5 py-4 items-start cursor-pointer">
        <input type="checkbox" checked={decl.terms} onChange={e => setDecl(d => ({ ...d, terms: e.target.checked }))} className="mt-0.5 w-[17px] h-[17px] flex-shrink-0" style={{ accentColor: NAVY_3 }} />
        <p className="text-[13.5px] leading-relaxed" style={{ color: INK }}>I have read and agree to the terms and conditions governing this recruitment process.</p>
      </label>
      <div className="mt-2.5">
        <Field label="Type your full name as your electronic signature" required error={errors.has("signature") ? "A signature is required." : undefined}>
          <input className={inputCls} style={inputStyle(errors.has("signature"))} value={decl.signature} onChange={e => setDecl(d => ({ ...d, signature: e.target.value }))} placeholder="Full legal name" />
        </Field>
      </div>
    </div>
  );
}

function StepReview({ dept, position, personal, education, experience, reqAnswers, docs, decl, onJump }: {
  dept: Department; position: string; personal: Personal; education: Education[]; experience: Experience[];
  reqAnswers: Record<number, { met: boolean; note: string }>; docs: Record<string, File | null>;
  decl: { accurate: boolean; consent: boolean; terms: boolean; signature: string }; onJump: (step: number) => void;
}) {
  const Item = ({ k, v }: { k: string; v: string }) => (
    <div>
      <p className="text-[11px] uppercase tracking-wide mb-0.5" style={{ color: INK_SOFT }}>{k}</p>
      <p className="text-[13.5px]" style={{ color: v ? INK : INK_SOFT, fontStyle: v ? "normal" : "italic" }}>{v || "Not provided"}</p>
    </div>
  );
  const Section = ({ title, jump, children }: { title: string; jump: number; children: React.ReactNode }) => (
    <div className="mb-6.5" style={{ marginBottom: "26px" }}>
      <div className="flex justify-between items-center border-b pb-2 mb-3" style={{ borderColor: LINE }}>
        <h3 className="text-[14.5px] font-semibold" style={{ color: NAVY, fontFamily: "'Source Serif 4', serif" }}>{title}</h3>
        <button onClick={() => onJump(jump)} className="text-[11.5px] font-semibold" style={{ color: NAVY_3, fontFamily: MONO }}>{jump === 0 ? "Change" : "Edit"}</button>
      </div>
      <div className="grid min-[840px]:grid-cols-2 gap-x-5 gap-y-3">{children}</div>
    </div>
  );
  return (
    <div>
      <Section title="Department" jump={0}>
        <Item k="Applying for" v={position} /><Item k="Department" v={dept.name} />
      </Section>
      <Section title="Personal details" jump={1}>
        <Item k="Full name" v={[personal.firstName, personal.middleName, personal.lastName].filter(Boolean).join(" ")} />
        <Item k="Date of birth" v={personal.dob} />
        <Item k="Primary nationality" v={personal.nationality} />
        <Item k="Other nationalities" v={personal.otherNats.join(", ")} />
        <Item k="City / country of birth" v={[personal.cityBirth, personal.countryBirth].filter(Boolean).join(", ")} />
        <Item k="City / country of residence" v={[personal.cityResidence, personal.countryResidence].filter(Boolean).join(", ")} />
        <Item k="Email" v={personal.email} /><Item k="Phone" v={personal.phone} />
      </Section>
      <Section title="Education" jump={2}>
        {education.map((e, i) => <Item key={i} k={e.qualification || "Qualification"} v={[e.institution, e.year].filter(Boolean).join(" · ")} />)}
      </Section>
      <Section title="Work experience" jump={3}>
        {experience.map((e, i) => <Item key={i} k={e.title || "Role"} v={[e.employer, e.current ? "Current" : e.end].filter(Boolean).join(" · ")} />)}
      </Section>
      <Section title="Role requirements" jump={4}>
        {dept.reqs.map((r, i) => <Item key={i} k={r} v={reqAnswers[i]?.met ? "Confirmed" : "Not confirmed"} />)}
      </Section>
      <Section title="Documents" jump={5}>
        <Item k="CV" v={docs.cv?.name ?? ""} /><Item k="ID / passport" v={docs.id?.name ?? ""} />
        <Item k="Certificates" v={docs.certs?.name ?? ""} /><Item k="Proof of residence" v={docs.residence?.name ?? ""} />
        <Item k="Other" v={docs.other?.name ?? ""} />
      </Section>
      <Section title="Declarations" jump={6}>
        <Item k="Accuracy confirmed" v={decl.accurate ? "Yes" : "No"} /><Item k="Consent to checks" v={decl.consent ? "Yes" : "No"} />
        <Item k="Terms agreed" v={decl.terms ? "Yes" : "No"} /><Item k="Signature" v={decl.signature} />
      </Section>
    </div>
  );
}
