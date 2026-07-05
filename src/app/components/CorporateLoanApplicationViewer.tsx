import { useState } from "react";
import { X, CheckCircle, AlertTriangle, Building2, FileText, Users, ClipboardCheck, DollarSign, Phone } from "lucide-react";
import vinkLogo from "../../imports/LOGO_FINAL.png";
import { AppHero, StepTracker, ProgressBar, FormCard, Field, DocSlot, NavButtons, inputCls, selectCls, P as CP, GOLD, GREEN } from "./AppFormShell";
import { applicationsApi } from "../services/applicationsApi";

interface Props { isOpen: boolean; onClose: () => void; }

const STEPS = [
  { n: 1, label: "Eligibility",         icon: <CheckCircle className="w-3.5 h-3.5" /> },
  { n: 2, label: "Contact",             icon: <Phone className="w-3.5 h-3.5" /> },
  { n: 3, label: "Company",             icon: <Building2 className="w-3.5 h-3.5" /> },
  { n: 4, label: "Assets &\nCollateral", icon: <DollarSign className="w-3.5 h-3.5" /> },
  { n: 5, label: "Funding",             icon: <FileText className="w-3.5 h-3.5" /> },
  { n: 6, label: "Documents",           icon: <Users className="w-3.5 h-3.5" /> },
  { n: 7, label: "Declaration",         icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
];

const ELIGIBILITY_CRITERIA = [
  { key: "legalEntity",   label: "Registered legal entity in South Africa (CIPC)" },
  { key: "saOwned",       label: "Majority South African-owned business (≥51%)" },
  { key: "operational",   label: "In operation for at least 12 months" },
  { key: "sarsCompliant", label: "Tax compliant and registered with SARS" },
  { key: "smme",          label: "Registered on the National SMME Database (smmesa.gov.za)" },
  { key: "notInsolvent",  label: "No insolvent shareholders or directors" },
  { key: "bankAccount",   label: "Active South African business bank account" },
  { key: "turnover",      label: "Annual turnover below R500 million (corporate SMME threshold)" },
];

const EXCLUDED_TYPES = [
  "Labour brokers",
  "Tobacco / Liquor / Gambling / sex trade",
  "Political organisations",
  "Insolvent shareholders/directors",
  "Ammunition manufacturing",
  "Non-profit organisations",
  "Persons under debt review",
  "Speculative property development",
];

const LOAN_PRODUCTS = [
  { id: "working",      name: "Corporate Working Capital",     range: "R1M – R50M",   term: "1–5 years",   rate: "Prime + 2%" },
  { id: "structured",   name: "Corporate Structured Loan",     range: "R5M – R200M",  term: "3–10 years",  rate: "Prime + 1.5%" },
  { id: "project",      name: "Project Finance",               range: "R50M – R1B",   term: "5–20 years",  rate: "Prime + 1%" },
  { id: "revolving",    name: "Corporate Revolving Credit",    range: "R1M – R500M",  term: "3-yr facility", rate: "Prime + 1.75%" },
  { id: "infrastructure", name: "Infrastructure Loan",        range: "R100M – R5B",  term: "10–25 years", rate: "Prime + 0.75%" },
];

const COLLATERAL_TYPES = [
  "Commercial / industrial property",
  "Residential property",
  "Commercial vehicles / fleet",
  "Heavy equipment / machinery",
  "Listed shares / securities",
  "Inventory / stock",
  "Debtors book / receivables",
  "Directors' personal suretyship",
  "Government or DFI guarantee",
];

const SECTOR_OPTIONS = [
  "Agriculture & Agro-processing", "Construction & Infrastructure", "Energy & Mining",
  "Financial Services", "Healthcare & Pharmaceuticals", "Information & Communications Technology",
  "Manufacturing & Engineering", "Property & Real Estate", "Retail & Wholesale Trade",
  "Tourism & Hospitality", "Transport & Logistics", "Water & Utilities", "Other",
];

const DOC_SLOTS = [
  { key: "reg",       label: "CIPC company registration certificate",             required: true },
  { key: "tax",       label: "SARS tax clearance certificate (valid)",             required: true },
  { key: "financial", label: "Latest 3 years' audited financial statements",      required: true },
  { key: "management", label: "Latest 6 months' management accounts",             required: true },
  { key: "bank",      label: "Latest 6 months' business bank statements",         required: true },
  { key: "bizplan",   label: "Business plan with 5-year financial projections",   required: true },
  { key: "collateral", label: "Collateral valuation report (certified valuator)",  required: true },
  { key: "ids",       label: "Certified ID copies of all directors (≥25% share)", required: true },
  { key: "resolution", label: "Board resolution authorising loan application",     required: true },
  { key: "bbbee",     label: "Valid B-BBEE certificate",                           required: false },
  { key: "contracts", label: "Proof of contracts / purchase orders (if applicable)", required: false },
];

export function CorporateLoanApplicationViewer({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [eligibility, setEligibility] = useState<Record<string, boolean>>({});
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("working");
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [refNo, setRefNo] = useState(`VMS-CL-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`);

  const [contact, setContact] = useState({ firstName: "", lastName: "", designation: "", phone: "+27 ", email: "", altPhone: "" });
  const [company, setCompany] = useState({ name: "", cipc: "", tradingAs: "", sector: "", founded: "", employees: "", annualTurnover: "", address: "", postalCode: "", website: "" });
  const [assets, setAssets] = useState({ collateralType: "", collateralDesc: "", collateralValue: "", collateralOwner: "", additionalCollateral: "" });
  const [funding, setFunding] = useState({ product: "working", amount: "", purpose: "", drawdownDate: "", repaymentSource: "", existingDebt: "", interestRate: "" });

  if (!isOpen) return null;

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const eligibilityCount = Object.values(eligibility).filter(Boolean).length;
  const allEligible = eligibilityCount === ELIGIBILITY_CRITERIA.length;
  const reqDocsCount = DOC_SLOTS.filter(d => d.required && docs[d.key]).length;
  const totalReq = DOC_SLOTS.filter(d => d.required).length;

  const setC = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setContact(f => ({ ...f, [k]: e.target.value }));
  const setCo = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setCompany(f => ({ ...f, [k]: e.target.value }));
  const setA = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setAssets(f => ({ ...f, [k]: e.target.value }));
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFunding(f => ({ ...f, [k]: e.target.value }));

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
        tag="VMS Corporate Banking · Blended Finance Programme"
        title="Corporate Loan — Online Application"
        subtitle="Institutional-grade financing for growth, infrastructure, and working capital."
        gradient={`linear-gradient(135deg,#0F172A 0%,${CP} 55%,#7B4DB5 100%)`}
      />

      <div className="max-w-2xl mx-auto w-full px-5 py-8 space-y-5">

        {/* ── STEP 1: Eligibility ── */}
        {step === 1 && (
          <>
            <FormCard stepN={1} title="Eligibility check" subtitle="All criteria must be confirmed before proceeding">
              <div className="rounded-xl p-3 flex items-start gap-2 text-sm" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <AlertTriangle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-blue-700 text-xs">Please confirm all eligibility criteria below before proceeding. <strong>All conditions must be met.</strong></p>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {ELIGIBILITY_CRITERIA.map(c => (
                  <label key={c.key}
                    className="flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all hover:bg-gray-50 select-none"
                    style={{ borderColor: eligibility[c.key] ? GREEN + "60" : "#E5E7EB", background: eligibility[c.key] ? GREEN + "08" : "#fff" }}>
                    <div className={`w-4 h-4 rounded mt-0.5 flex-shrink-0 flex items-center justify-center border-2 transition-all ${eligibility[c.key] ? "border-green-500 bg-green-500" : "border-gray-300"}`}>
                      {eligibility[c.key] && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <input type="checkbox" className="hidden"
                      checked={!!eligibility[c.key]}
                      onChange={e => setEligibility(prev => ({ ...prev, [c.key]: e.target.checked }))} />
                    <p className="text-xs text-gray-700 leading-snug">{c.label}</p>
                  </label>
                ))}
              </div>
            </FormCard>

            <FormCard stepN={undefined} title="The following business types are excluded from this programme" subtitle="If your business falls into any category below, you are not eligible">
              <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <p className="text-orange-700 text-xs">If your business falls into any of the categories below, you are not eligible to apply.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {EXCLUDED_TYPES.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                    <div className="w-3.5 h-3.5 rounded-full bg-red-400 flex items-center justify-center flex-shrink-0">
                      <X className="w-2 h-2 text-white" />
                    </div>
                    <p className="text-xs text-red-700">{t}</p>
                  </div>
                ))}
              </div>
            </FormCard>

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {eligibilityCount}/{ELIGIBILITY_CRITERIA.length} criteria confirmed
                {eligibilityCount > 0 && !allEligible && <span className="text-amber-600 ml-2">— confirm all to continue</span>}
              </div>
              <button
                disabled={!allEligible}
                onClick={() => { setEligibilityConfirmed(true); setStep(2); }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{ background: allEligible ? `linear-gradient(135deg,${CP},#9585EA)` : "#9CA3AF" }}>
                Confirm eligibility &amp; continue →
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Contact ── */}
        {step === 2 && (
          <FormCard stepN={2} title="Contact person details" subtitle="Primary contact authorised to act on behalf of the applicant company">
            <p className="text-xs text-gray-500">Primary contact person authorised to act on behalf of the applicant company.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name(s)" required>
                <input className={inputCls} placeholder="e.g. Vincent" value={contact.firstName} onChange={setC("firstName")} />
              </Field>
              <Field label="Surname" required>
                <input className={inputCls} placeholder="e.g. Kafula" value={contact.lastName} onChange={setC("lastName")} />
              </Field>
              <Field label="Designation / title" required>
                <input className={inputCls} placeholder="e.g. Chief Financial Officer" value={contact.designation} onChange={setC("designation")} />
              </Field>
              <Field label="Mobile number" required>
                <input className={inputCls} placeholder="+27 ..." value={contact.phone} onChange={setC("phone")} />
              </Field>
              <Field label="Email address" required>
                <input type="email" className={inputCls} placeholder="cfo@company.co.za" value={contact.email} onChange={setC("email")} />
              </Field>
              <Field label="Alternate contact number">
                <input className={inputCls} placeholder="+27 ..." value={contact.altPhone} onChange={setC("altPhone")} />
              </Field>
            </div>
          </FormCard>
        )}

        {/* ── STEP 3: Company ── */}
        {step === 3 && (
          <FormCard stepN={3} title="Company information" subtitle="Registered company details as per CIPC">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Registered company name" required full>
                <input className={inputCls} placeholder="As per CIPC certificate" value={company.name} onChange={setCo("name")} />
              </Field>
              <Field label="CIPC registration number" required>
                <input className={inputCls} placeholder="e.g. 2018/079316/07" value={company.cipc} onChange={setCo("cipc")} />
              </Field>
              <Field label="Trading name (if different)">
                <input className={inputCls} placeholder="Trading as..." value={company.tradingAs} onChange={setCo("tradingAs")} />
              </Field>
              <Field label="Industry sector" required full>
                <select className={selectCls} value={company.sector} onChange={setCo("sector")}>
                  <option value="">Select sector...</option>
                  {SECTOR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Year established" required>
                <input type="number" className={inputCls} placeholder="e.g. 2010" min={1900} max={new Date().getFullYear()} value={company.founded} onChange={setCo("founded")} />
              </Field>
              <Field label="Number of employees" required>
                <input type="number" className={inputCls} placeholder="e.g. 120" value={company.employees} onChange={setCo("employees")} />
              </Field>
              <Field label="Annual turnover (ZAR)" required>
                <input type="number" className={inputCls} placeholder="e.g. 85000000" value={company.annualTurnover} onChange={setCo("annualTurnover")} />
              </Field>
              <Field label="Business postal code" required>
                <input className={inputCls} placeholder="0000" maxLength={4} value={company.postalCode} onChange={setCo("postalCode")} />
              </Field>
              <Field label="Registered business address" required full>
                <input className={inputCls} placeholder="Street, suburb, city, province" value={company.address} onChange={setCo("address")} />
              </Field>
              <Field label="Company website">
                <input className={inputCls} placeholder="https://www.company.co.za" value={company.website} onChange={setCo("website")} />
              </Field>
            </div>
          </FormCard>
        )}

        {/* ── STEP 4: Assets & Collateral ── */}
        {step === 4 && (
          <FormCard stepN={4} title="Assets &amp; collateral" subtitle="Provide details of assets offered as security">
            <p className="text-xs text-gray-500">Provide details of assets offered as security. Collateral strengthens your application and may improve your rate.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Primary collateral type" required full>
                <select className={selectCls} value={assets.collateralType} onChange={setA("collateralType")}>
                  <option value="">Select collateral type...</option>
                  {COLLATERAL_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Description of collateral asset" required full>
                <textarea className={inputCls + " resize-none"} rows={3}
                  placeholder="Describe the asset — e.g. 'Commercial warehouse, 4,500m², Cape Town Industrial Park, ERF 1234, Title Deed TDK123456'"
                  value={assets.collateralDesc} onChange={setA("collateralDesc")} />
              </Field>
              <Field label="Estimated market value (ZAR)" required>
                <input type="number" className={inputCls} placeholder="e.g. 25000000" value={assets.collateralValue} onChange={setA("collateralValue")} />
              </Field>
              <Field label="Asset registered owner" required>
                <input className={inputCls} placeholder="Company or individual name" value={assets.collateralOwner} onChange={setA("collateralOwner")} />
              </Field>
              <Field label="Additional collateral / security (optional)" full>
                <textarea className={inputCls + " resize-none"} rows={2}
                  placeholder="List any additional assets, suretyship, or guarantees offered"
                  value={assets.additionalCollateral} onChange={setA("additionalCollateral")} />
              </Field>
            </div>
          </FormCard>
        )}

        {/* ── STEP 5: Funding ── */}
        {step === 5 && (
          <>
            {/* Product selector */}
            <FormCard stepN={5} title="Select loan product" subtitle="Choose the financing structure that suits your needs">
              <div className="space-y-2">
                {LOAN_PRODUCTS.map(p => (
                  <label key={p.id}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all hover:border-purple-200 select-none"
                    style={{ borderColor: selectedProduct === p.id ? CP : "#E5E7EB", background: selectedProduct === p.id ? CP + "06" : "#fff" }}>
                    <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all"
                      style={{ borderColor: selectedProduct === p.id ? CP : "#D1D5DB" }}>
                      {selectedProduct === p.id && <div className="w-2 h-2 rounded-full" style={{ background: CP }} />}
                    </div>
                    <input type="radio" name="product" className="hidden" value={p.id}
                      checked={selectedProduct === p.id} onChange={() => setSelectedProduct(p.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.range} · {p.term}</p>
                    </div>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: CP }}>{p.rate}</span>
                  </label>
                ))}
              </div>
            </FormCard>

            <FormCard stepN={undefined} title="Funding details" subtitle="Specify the amount and purpose of the facility">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Loan amount required (ZAR)" required>
                  <input type="number" className={inputCls} placeholder="e.g. 50000000"
                    value={funding.amount} onChange={setF("amount")} />
                </Field>
                <Field label="Requested drawdown date" required>
                  <input type="date" className={inputCls} value={funding.drawdownDate} onChange={setF("drawdownDate")} />
                </Field>
                <Field label="Purpose of funding" required full>
                  <textarea className={inputCls + " resize-none"} rows={3}
                    placeholder="Describe in detail how the funds will be used and the expected business outcome"
                    value={funding.purpose} onChange={setF("purpose")} />
                </Field>
                <Field label="Primary repayment source" required>
                  <input className={inputCls} placeholder="e.g. Operating cash flow / contract revenue"
                    value={funding.repaymentSource} onChange={setF("repaymentSource")} />
                </Field>
                <Field label="Total existing debt (ZAR)">
                  <input type="number" className={inputCls} placeholder="Sum of all current debt obligations"
                    value={funding.existingDebt} onChange={setF("existingDebt")} />
                </Field>
              </div>

              {funding.amount && (
                <div className="rounded-xl p-4 mt-2 grid grid-cols-3 gap-3" style={{ background: "#F3F0FB" }}>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Loan amount</p>
                    <p className="text-lg font-black" style={{ color: CP }}>
                      R {Number(funding.amount).toLocaleString("en-ZA")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Indicative rate</p>
                    <p className="text-lg font-black" style={{ color: CP }}>
                      {LOAN_PRODUCTS.find(p => p.id === selectedProduct)?.rate}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Product</p>
                    <p className="text-sm font-bold" style={{ color: CP }}>
                      {LOAN_PRODUCTS.find(p => p.id === selectedProduct)?.name}
                    </p>
                  </div>
                  <p className="col-span-3 text-[10px] text-gray-400">Subject to credit assessment · Final terms set at offer stage</p>
                </div>
              )}
            </FormCard>
          </>
        )}

        {/* ── STEP 6: Documents ── */}
        {step === 6 && (
          <FormCard stepN={6} title="Upload supporting documents" subtitle="Upload certified, legible copies. PDF, JPG, PNG accepted. Max 20MB per document.">
            <p className="text-sm text-gray-500">Upload certified, legible copies. PDF, JPG, PNG accepted. Max 20MB per document.</p>
            <div className="space-y-2">
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
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(reqDocsCount / totalReq) * 100}%`, background: CP }} />
              </div>
              <span className="text-xs font-semibold text-gray-600 flex-shrink-0">{reqDocsCount}/{totalReq} required</span>
            </div>
          </FormCard>
        )}

        {/* ── STEP 7: Declaration ── */}
        {step === 7 && !submitted && (
          <>
            {/* Summary */}
            <FormCard stepN={7} title="Application summary" subtitle="Review before submitting">
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: "Contact person",    value: `${contact.firstName} ${contact.lastName}` || "—" },
                  { label: "Designation",       value: contact.designation || "—" },
                  { label: "Company",           value: company.name || "—" },
                  { label: "CIPC number",       value: company.cipc || "—" },
                  { label: "Sector",            value: company.sector || "—" },
                  { label: "Annual turnover",   value: company.annualTurnover ? `R ${Number(company.annualTurnover).toLocaleString("en-ZA")}` : "—" },
                  { label: "Loan product",      value: LOAN_PRODUCTS.find(p => p.id === selectedProduct)?.name || "—" },
                  { label: "Loan amount",       value: funding.amount ? `R ${Number(funding.amount).toLocaleString("en-ZA")}` : "—" },
                  { label: "Collateral",        value: assets.collateralType || "—" },
                  { label: "Documents",         value: `${Object.keys(docs).filter(k => docs[k]).length} uploaded` },
                ].map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </FormCard>

            <FormCard stepN={undefined} title="Declaration" subtitle="Please read and confirm before submitting">
              <p className="text-xs text-gray-600 leading-relaxed">
                I, the undersigned, declare that I am duly authorised by the applicant company to submit this application. I confirm that all information provided is true, complete, and accurate to the best of my knowledge and belief. I authorise Vink Group (Pty) Ltd to conduct credit bureau inquiries, verify all stated information with relevant institutions (including SARS, CIPC, and credit bureaux), and to share application information with co-lending partners where applicable.
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                I understand that submission of this form does not constitute an offer of credit, and that any credit facility is subject to VMS's full credit assessment process, internal credit committee approval, and applicable regulatory requirements.
              </p>
              <label className="flex items-start gap-3 cursor-pointer mt-2">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-purple-700 flex-shrink-0 rounded" />
                <span className="text-sm font-semibold text-gray-700">
                  I confirm the above declaration and consent to the processing of this application
                </span>
              </label>

              <button
                disabled={!agreed || reqDocsCount < totalReq || submitting}
                onClick={async () => {
                  setSubmitting(true);
                  setSubmitError("");
                  const result = await applicationsApi.submit({
                    type: "corporateLoan",
                    subType: LOAN_PRODUCTS.find(p => p.id === selectedProduct)?.name ?? selectedProduct,
                    applicantName: `${contact.firstName} ${contact.lastName}`.trim(),
                    applicantEmail: contact.email,
                    applicantPhone: contact.phone,
                    formData: { contact, company, assets, funding, selectedProduct },
                  });
                  setSubmitting(false);
                  if (result.success && result.data) {
                    setRefNo(result.data.referenceNumber);
                    setSubmitted(true);
                  } else {
                    setSubmitError(result.error ?? "Submission failed. Please try again.");
                  }
                }}
                className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg mt-2"
                style={{ background: agreed && reqDocsCount >= totalReq ? `linear-gradient(135deg,${CP},#7B4DB5)` : "#9CA3AF" }}>
                {submitting ? "Submitting..." : reqDocsCount < totalReq
                  ? `Upload all required documents first (${reqDocsCount}/${totalReq})`
                  : "Submit Corporate Loan Application"}
              </button>
              {submitError && <p className="text-red-600 text-sm text-center mt-2">{submitError}</p>}
            </FormCard>
          </>
        )}

        {/* ── SUCCESS ── */}
        {submitted && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-green-200 p-8 shadow-sm text-center space-y-4">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto" style={{ background: "linear-gradient(135deg,#D1FAE5,#A7F3D0)" }}>
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900">Application Submitted</h2>
                <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
                  Your corporate loan application has been received and is under review by VMS Credit.
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "#F3F0FB" }}>
                <p className="text-xs text-gray-500 mb-1">Application reference number</p>
                <p className="font-black text-xl" style={{ color: CP }}>{refNo}</p>
                <p className="text-xs text-gray-400 mt-1">Keep this reference for all future correspondence</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-gray-800">What happens next?</h3>
              {[
                { step: "1", title: "Initial screening",       desc: "VMS Credit reviews your eligibility and completeness of documents (1–2 business days)" },
                { step: "2", title: "Credit assessment",       desc: "Full credit bureau, CIPC, and SARS verification conducted (3–5 business days)" },
                { step: "3", title: "Credit committee",        desc: "Your application is presented to the VMS Credit Committee for approval (2–3 business days)" },
                { step: "4", title: "Offer letter issued",     desc: "If approved, an indicative term sheet and offer letter is emailed to " + (contact.email || "you") },
                { step: "5", title: "Legal & disbursement",    desc: "Loan agreement signed, collateral registered, funds disbursed (5–10 business days)" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0 mt-0.5"
                    style={{ background: CP }}>{item.step}</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={onClose}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg"
              style={{ background: `linear-gradient(135deg,${CP},#9585EA)` }}>
              Back to VMS Corporate Banking
            </button>
          </div>
        )}

        {/* ── Nav buttons ── */}
        {!submitted && step > 1 && step < 7 && (
          <NavButtons
            onBack={() => setStep(s => s - 1)}
            onNext={() => setStep(s => s + 1)}
          />
        )}
        {!submitted && step === 7 && (
          <NavButtons
            onBack={() => setStep(6)}
            onNext={undefined}
          />
        )}
      </div>
    </div>
  );
}
