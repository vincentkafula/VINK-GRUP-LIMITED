import type { ApplicationSubmission } from "../services/applicationsApi";

/**
 * The applications that have their own screen but are not a bank account or a card: INSURE (life, funeral, vehicle) and the PERSONAL LOAN. Each is described here as plain data (its
 * products, questions, validation, declarations, and what the confirmation may truthfully say), and one screen (ProductApplicationViewer) shows any of them.
 *
 * What these applications deliberately do NOT ask for: an ID number or selfie (the identity check by Sumsub takes those, and keeps them, not VINK), health details (insurers ask those
 * later, when they underwrite), bank details, or a password. Every application goes to POST /api/applications, where `type` decides the tier; see APPLICATION_TYPE_TIERS in the server.
 */
export type ProductKind = "insurance" | "personalLoan";
export type Form = Record<string, string>;

export interface FieldSpec {
  key: string; label: string; kind: "text" | "email" | "tel" | "date" | "money" | "number" | "select" | "textarea";
  required?: boolean; placeholder?: string; hint?: string; full?: boolean; options?: { value: string; label: string }[];
  min?: number; max?: number; maxLength?: number; show?: (f: Form) => boolean;
}
export interface ProductSpec { id: string; name: string; tagline?: string }
export interface Declaration { key: string; label: string }
export interface ApplicationSpec {
  kind: ProductKind; type: string; tag: string; title: string; subtitle: string; productHeading: string; notice: string;
  products: ProductSpec[]; aboutYou: FieldSpec[]; details: (productName: string) => FieldSpec[]; declarations: Declaration[];
  confirmationTitle: string; confirmationBody: (email: string) => string;
}

const opt = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const count = (max: number) => opt(...Array.from({ length: max + 1 }, (_, i): [string, string] => [String(i), String(i)]));
const yesNo = opt(["no", "No"], ["yes", "Yes"]);
const year = (now = new Date()) => now.getFullYear();

/** The questions every application starts with. */
const ABOUT_YOU: FieldSpec[] = [
  { key: "firstName", label: "First name", kind: "text", required: true, maxLength: 60 },
  { key: "lastName", label: "Surname", kind: "text", required: true, maxLength: 60 },
  { key: "email", label: "Email address", kind: "email", required: true, maxLength: 254, hint: "We write to you here, and the identity check is linked to it." },
  { key: "phone", label: "Mobile number", kind: "tel", required: true, placeholder: "+27 82 000 0000", maxLength: 20 },
  { key: "dateOfBirth", label: "Date of birth", kind: "date", required: true },
];

const INSURANCE: ApplicationSpec = {
  kind: "insurance", type: "insurance", tag: "VINK Personal Banking · Insurance", title: "Insurance application", productHeading: "What would you like cover for?",
  subtitle: "Tell us what you need and we will come back to you with a quote.",
  notice: "This is an application for a quote. It does not give you cover: nothing is covered until it is confirmed to you in writing. We do not ask about your health here; if the insurer needs that, it will ask you later.",
  products: [
    { id: "life", name: "Life Insurance", tagline: "A lump sum paid to the people who depend on you if you die." },
    { id: "funeral", name: "Funeral Cover", tagline: "Cover towards funeral costs for you and your family." },
    { id: "vehicle", name: "Vehicle Insurance", tagline: "Cover for your car against loss and damage." },
  ],
  aboutYou: ABOUT_YOU,
  details: (product) => {
    if (product === "Life Insurance") return [
      { key: "coverAmount", label: "How much cover would you like?", kind: "money", required: true, min: 10_000, max: 100_000_000, hint: "In rand. We will confirm what is available when we quote." },
      { key: "term", label: "For how long?", kind: "select", required: true, options: opt(["to65", "Until I am 65"], ["10", "10 years"], ["20", "20 years"], ["30", "30 years"], ["unsure", "I am not sure yet"]) },
      { key: "replacing", label: "Is this to replace cover you already have?", kind: "select", required: true, options: yesNo },
    ];
    if (product === "Funeral Cover") return [
      { key: "memberCover", label: "Cover for you, the main member", kind: "money", required: true, min: 5_000, max: 1_000_000, hint: "In rand." },
      { key: "spouse", label: "Cover for a spouse or partner?", kind: "select", required: true, options: yesNo },
      { key: "children", label: "Children to cover", kind: "select", required: true, options: count(8) },
      { key: "parents", label: "Parents or in-laws to cover", kind: "select", required: true, options: count(4) },
      { key: "extended", label: "Other family members to cover", kind: "select", required: true, options: count(6) },
    ];
    return [
      { key: "registration", label: "Registration number", kind: "text", required: true, maxLength: 12, placeholder: "e.g. CA 123-456" },
      { key: "make", label: "Make", kind: "text", required: true, maxLength: 40 }, { key: "model", label: "Model", kind: "text", required: true, maxLength: 40 },
      { key: "year", label: "Year of manufacture", kind: "number", required: true, min: 1980, max: year() + 1 },
      { key: "value", label: "What is it worth?", kind: "money", required: true, min: 5_000, max: 20_000_000, hint: "Your best estimate, in rand." },
      { key: "use", label: "Main use", kind: "select", required: true, options: opt(["private", "Private"], ["business", "Business"], ["both", "Private and business"]) },
      { key: "kept", label: "Where is it kept overnight?", kind: "select", required: true, options: opt(["garage", "In a locked garage"], ["complex", "In a secure complex or parking area"], ["driveway", "On a driveway"], ["street", "On the street"]) },
      { key: "coverType", label: "Type of cover", kind: "select", required: true, options: opt(["comprehensive", "Comprehensive"], ["tpft", "Third party, fire and theft"], ["third", "Third party only"], ["unsure", "I am not sure yet"]) },
    ];
  },
  declarations: [
    { key: "truthful", label: "The information I have given is true and complete." },
    { key: "notCover", label: "I understand this is an application for a quote, not cover: nothing is covered until it is confirmed to me in writing." },
    { key: "contact", label: "I agree that VINK may contact me about this application by email, phone and SMS." },
    { key: "personalInfo", label: "I agree that VINK may process my personal information to assess and manage this application." },
  ],
  confirmationTitle: "Application received",
  confirmationBody: (email) => `Thank you. We have your application. This is not cover yet: we will review it and contact you${email ? ` on ${email}` : ""} with a quote, and nothing is covered until it is confirmed to you in writing.`,
};

const LOAN_TERMS = [6, 12, 24, 36, 48, 60, 72, 84].map((m): [string, string] => [String(m), `${m} months`]);
const PERSONAL_LOAN: ApplicationSpec = {
  kind: "personalLoan", type: "personalLoan", tag: "VINK Personal Banking · Loans", title: "Personal loan application", productHeading: "Which loan are you applying for?",
  subtitle: "Tell us how much you need and your circumstances, and we will review your application.",
  notice: "This is an application, not an offer. No credit is granted until it is confirmed to you in writing, and you are not committed to anything by applying.",
  products: ["LifeAdvance", "FlexiLoan", "HorizonLoan", "SwiftCash", "DreamFund", "ElevateLoan"].map((name) => ({ id: name.toLowerCase(), name })),
  aboutYou: ABOUT_YOU,
  details: () => [
    { key: "amount", label: "How much do you need?", kind: "money", required: true, min: 1_000, max: 2_000_000, hint: "In rand." },
    { key: "termMonths", label: "Over how long would you like to repay it?", kind: "select", required: true, options: opt(...LOAN_TERMS) },
    { key: "purpose", label: "What is it for?", kind: "select", required: true, options: opt(["education", "Education or training"], ["home", "Home improvement"], ["vehicle", "A vehicle"], ["debt", "Consolidating debt"], ["medical", "Medical costs"], ["family", "A family event"], ["travel", "Travel"], ["other", "Something else"]) },
    { key: "employment", label: "Employment status", kind: "select", required: true, options: opt(["employed", "Employed"], ["selfEmployed", "Self-employed"], ["retired", "Retired"], ["student", "Student"], ["unemployed", "Not working at the moment"]) },
    { key: "employer", label: "Employer or business name", kind: "text", maxLength: 100, required: true, show: (f) => f.employment === "employed" || f.employment === "selfEmployed" },
    { key: "income", label: "Your monthly income before deductions", kind: "money", required: true, min: 0, max: 10_000_000, hint: "In rand. Include any regular income you receive." },
    { key: "expenses", label: "Your monthly living costs", kind: "money", required: true, min: 0, max: 10_000_000, hint: "Rent or bond, food, transport, school fees and the like, in rand." },
    { key: "debt", label: "What you already repay each month on loans and accounts", kind: "money", required: true, min: 0, max: 10_000_000, hint: "In rand. Enter 0 if none." },
  ],
  declarations: [
    { key: "truthful", label: "The information I have given is true and complete." },
    { key: "notOffer", label: "I understand this is an application, not an offer: no credit is granted until it is confirmed to me in writing." },
    { key: "creditCheck", label: "I agree that VINK may check my credit record to assess this application." },
    { key: "contact", label: "I agree that VINK may contact me about this application by email, phone and SMS." },
    { key: "personalInfo", label: "I agree that VINK may process my personal information to assess and manage this application." },
  ],
  confirmationTitle: "Application received",
  confirmationBody: (email) => `Thank you. We have your application and will review it. We will contact you${email ? ` on ${email}` : ""}. No credit is granted until it is confirmed to you in writing.`,
};

export const SPECS: Record<ProductKind, ApplicationSpec> = { insurance: INSURANCE, personalLoan: PERSONAL_LOAN };

// ── answers ────────────────────────────────────────────────────────────────
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** "R 10 000", "10,000" and "10000" are all 10000. */
export const toNumber = (s: string): number => Number(String(s).replace(/[^\d.]/g, ""));
export const visibleFields = (fields: FieldSpec[], form: Form): FieldSpec[] => fields.filter((f) => !f.show || f.show(form));

export function ageOn(dateOfBirth: string, now: Date): number | null {
  const d = new Date(`${dateOfBirth}T00:00:00Z`); if (Number.isNaN(d.getTime()) || dateOfBirth !== d.toISOString().slice(0, 10)) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear(); const m = now.getUTCMonth() - d.getUTCMonth(); if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--; return age;
}

/** The problem with one answer, or null when it is fine. */
export function validateField(f: FieldSpec, form: Form, now = new Date()): string | null {
  const v = (form[f.key] ?? "").trim();
  if (!v) return f.required ? "Please fill this in." : null;
  if (f.maxLength && v.length > f.maxLength) return `Please keep this to ${f.maxLength} characters.`;
  if (f.kind === "email") return EMAIL.test(v) ? null : "Enter a valid email address.";
  if (f.kind === "tel") { const digits = v.replace(/\D/g, ""); return /^\+?[\d\s()-]+$/.test(v) && digits.length >= 9 && digits.length <= 15 ? null : "Enter a valid mobile number."; }
  if (f.kind === "date") { const age = ageOn(v, now); return age === null ? "Enter a valid date." : age < 18 ? "You must be 18 or older to apply." : age > 110 ? "Please check this date." : null; }
  if (f.kind === "select") return f.options?.some((o) => o.value === v) ? null : "Please choose one.";
  if (f.kind === "money" || f.kind === "number") {
    if (f.kind === "number" ? !/^\d+$/.test(v) : !/^[R\s\d.,]+$/i.test(v)) return "Enter a number.";
    const n = toNumber(v); if (!Number.isFinite(n)) return "Enter a number.";
    if (f.min !== undefined && n < f.min) return `This must be at least ${f.kind === "money" ? "R" : ""}${f.min.toLocaleString("en-ZA")}.`;
    if (f.max !== undefined && n > f.max) return `This must be at most ${f.kind === "money" ? "R" : ""}${f.max.toLocaleString("en-ZA")}.`;
  }
  return null;
}
export function validateFields(fields: FieldSpec[], form: Form, now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of visibleFields(fields, form)) { const e = validateField(f, form, now); if (e) errors[f.key] = e; }
  return errors;
}

/** What goes to POST /api/applications: only the answers that are shown, trimmed, with amounts as numbers and the declarations the applicant accepted. */
export function buildSubmission(spec: ApplicationSpec, product: string, form: Form, accepted: string[], now = new Date()): ApplicationSubmission {
  const fields = [...spec.aboutYou, ...spec.details(product)]; const answers: Record<string, unknown> = {};
  for (const f of visibleFields(fields, form)) { const v = (form[f.key] ?? "").trim(); if (!v) continue; answers[f.key] = f.kind === "money" || f.kind === "number" ? toNumber(v) : v; }
  const { firstName, lastName, email, phone, ...rest } = answers as Record<string, string>;
  return { type: spec.type, subType: product, applicantName: `${firstName} ${lastName}`.trim(), applicantEmail: email, applicantPhone: phone, formData: { product, ...rest, declarationsAccepted: accepted, declaredAt: now.toISOString() } };
}
