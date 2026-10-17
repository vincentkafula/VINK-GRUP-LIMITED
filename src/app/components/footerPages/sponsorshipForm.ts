import {
  ORG_TYPES, CATEGORIES, BENEFITS, CURRENCIES, LIMITS_ZAR, DEFAULT_COUNTRY, PROVINCES_ZA, FILE_RULES, documentSlots, checkAnswers, type DocSlot, type Errors,
} from "../../data/sponsorship";
import { provincesForCountry } from "../../data/countries";

/**
 * The sponsorship application form, without any screen: what it holds, its seven steps, and the checks that run as a person moves through them.
 *
 * The server checks everything again (it never trusts the form); these checks exist so people find out about a problem before they press Submit, and they use
 * the same rules and the same words. The lists and the document rules come from data/sponsorship.ts, an exact copy of the server's.
 */
export type { Errors };
export interface ExpenditureRow { id: number; description: string; amount: string }
export interface FormState {
  orgType: string; applicantName: string; organisation: string; registrationNumber: string; contactPerson: string; email: string; phone: string;
  physicalAddress: string; postalAddress: string; samePostal: boolean; country: string; province: string; city: string; website: string; socialLinks: string; taxStatus: string; taxNumber: string;
  category: string;
  projectTitle: string; executiveSummary: string; background: string; problem: string; targetAudience: string; geographicArea: string; beneficiaries: string;
  startDate: string; endDate: string; implementationPlan: string; outcomes: string; whyVink: string; alignment: string;
  currency: string; totalBudget: string; amountRequested: string; ownContribution: string; otherSponsorsAmount: string; otherSponsorsNotes: string;
  expenditure: ExpenditureRow[]; requestedItems: string; financialControls: string;
  benefits: string[]; benefitsValue: string;
  consent: { accuracy: boolean; authorised: boolean; terms: boolean; processing: boolean };
  faxNumber: string;                       // the hidden trap field: a person never fills it
}
export type Files = Record<string, File[]>;

export const initialState = (): FormState => ({
  orgType: "", applicantName: "", organisation: "", registrationNumber: "", contactPerson: "", email: "", phone: "",
  physicalAddress: "", postalAddress: "", samePostal: true, country: DEFAULT_COUNTRY, province: "", city: "", website: "", socialLinks: "", taxStatus: "", taxNumber: "",
  category: "",
  projectTitle: "", executiveSummary: "", background: "", problem: "", targetAudience: "", geographicArea: "", beneficiaries: "",
  startDate: "", endDate: "", implementationPlan: "", outcomes: "", whyVink: "", alignment: "",
  currency: "ZAR", totalBudget: "", amountRequested: "", ownContribution: "", otherSponsorsAmount: "", otherSponsorsNotes: "",
  expenditure: [{ id: 1, description: "", amount: "" }], requestedItems: "", financialControls: "",
  benefits: [], benefitsValue: "",
  consent: { accuracy: false, authorised: false, terms: false, processing: false },
  faxNumber: "",
});

export const STEPS = [
  { n: 1, short: "Organisation", title: "Applicant and organisation details", lead: "Tell us about your organisation to begin your sponsorship request." },
  { n: 2, short: "Category",     title: "Sponsorship category",               lead: "Choose the type of support you need." },
  { n: 3, short: "Proposal",     title: "Project or sponsorship proposal",    lead: "Present the case for your project: what it is, who it helps and what it will achieve." },
  { n: 4, short: "Budget",       title: "Sponsorship amount and budget",      lead: "Say how much you are asking for and what it will be used for." },
  { n: 5, short: "Benefits",     title: "Sponsor benefits and return",        lead: "Explain what VINK will receive in return for its support." },
  { n: 6, short: "Documents",    title: "Supporting documents",               lead: "Upload the documents that support your application." },
  { n: 7, short: "Submit",       title: "Declaration and submission",         lead: "Check your answers, then confirm and submit your application." },
] as const;

/** Which step each answer belongs to, so a problem the server finds can take a person straight to it. */
export function stepOfField(key: string): number {
  const k = key.split(".")[0];
  if (["orgType", "applicantName", "organisation", "registrationNumber", "contactPerson", "email", "phone", "physicalAddress", "postalAddress", "country", "province", "city", "website", "socialLinks", "taxStatus", "taxNumber"].includes(k)) return 1;
  if (k === "category") return 2;
  if (["projectTitle", "executiveSummary", "background", "problem", "targetAudience", "geographicArea", "beneficiaries", "startDate", "endDate", "implementationPlan", "outcomes", "whyVink", "alignment"].includes(k)) return 3;
  if (["currency", "totalBudget", "amountRequested", "ownContribution", "otherSponsorsAmount", "otherSponsorsNotes", "expenditure", "requestedItems", "financialControls"].includes(k)) return 4;
  if (["benefits", "benefitsValue"].includes(k)) return 5;
  if (k === "documents") return 6;
  return 7;
}

// ── small helpers ───────────────────────────────────────────────────────────
const oneLine = (v: string) => v.replace(/[\r\n\t]+/g, " ").trim();
const round2 = (n: number) => Math.round(n * 100) / 100;
/** A typed amount as a number ("12 500,50" and "12,500.50" both work); null when it is not a number. */
export function numberOf(v: string): number | null {
  const t = v.replace(/[\s\u00a0]/g, "");
  if (t === "") return null;
  const n = Number(/,\d{1,2}$/.test(t) && !/\./.test(t) ? t.replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? round2(n) : null;
}
/** Today in South Africa (UTC+2 all year), the same day the server uses. */
export const saToday = (now = Date.now()) => new Date(now + 2 * 3600_000).toISOString().slice(0, 10);
export const rand = (n: number) => `R${n.toLocaleString("en-ZA")}`;
export const money = (n: number, cur: string) => `${cur} ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const labelOf = <T extends { id: string; label: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)?.label ?? id;

/**
 * The regions to choose from: a list for the countries we have one for, free text otherwise. South Africa uses the official names the server accepts
 * (the ISO data spells two of them differently, "Kwazulu-Natal" and "North-West", and the server would refuse those).
 */
export const provinceChoices = (country: string): string[] => (country === DEFAULT_COUNTRY ? [...PROVINCES_ZA] : provincesForCountry(country));

// ── funding ─────────────────────────────────────────────────────────────────
export function funding(s: FormState) {
  const total = numberOf(s.totalBudget) ?? 0, requested = numberOf(s.amountRequested) ?? 0, own = numberOf(s.ownContribution) ?? 0, others = numberOf(s.otherSponsorsAmount) ?? 0;
  const breakdown = round2(s.expenditure.reduce((t, r) => t + (numberOf(r.amount) ?? 0), 0));
  const funded = round2(requested + own + others);
  return { total, requested, own, others, breakdown, breakdownDiff: round2(total - breakdown), funded, gap: round2(total - funded) };
}

// ── what each step needs ────────────────────────────────────────────────────
/**
 * The answers as the server reads them: amounts as numbers, the postal address filled in. An amount that is not a number is passed on as the text typed,
 * so the checker complains about it instead of it quietly becoming 0.
 */
export function toPayload(s: FormState): Record<string, unknown> {
  const n = (v: string): number | string => numberOf(v) ?? v;
  return {
    orgType: s.orgType, applicantName: oneLine(s.applicantName), organisation: oneLine(s.organisation), registrationNumber: oneLine(s.registrationNumber), contactPerson: oneLine(s.contactPerson), email: oneLine(s.email), phone: oneLine(s.phone),
    physicalAddress: oneLine(s.physicalAddress), postalAddress: s.samePostal ? oneLine(s.physicalAddress) : oneLine(s.postalAddress), country: s.country, province: s.province, city: oneLine(s.city), website: s.website.trim(), socialLinks: s.socialLinks.trim(), taxStatus: s.taxStatus, taxNumber: oneLine(s.taxNumber),
    category: s.category,
    projectTitle: oneLine(s.projectTitle), executiveSummary: s.executiveSummary.trim(), background: s.background.trim(), problem: s.problem.trim(), targetAudience: s.targetAudience.trim(), geographicArea: oneLine(s.geographicArea), beneficiaries: n(s.beneficiaries),
    startDate: s.startDate, endDate: s.endDate, implementationPlan: s.implementationPlan.trim(), outcomes: s.outcomes.trim(), whyVink: s.whyVink.trim(), alignment: s.alignment.trim(),
    currency: s.currency, totalBudget: n(s.totalBudget), amountRequested: n(s.amountRequested), ownContribution: n(s.ownContribution), otherSponsorsAmount: n(s.otherSponsorsAmount), otherSponsorsNotes: s.otherSponsorsNotes.trim(),
    expenditure: s.expenditure.map((r) => ({ description: oneLine(r.description), amount: n(r.amount) })), requestedItems: s.requestedItems.trim(), financialControls: s.financialControls.trim(),
    benefits: s.benefits, benefitsValue: s.benefitsValue.trim(),
    consent: s.consent, faxNumber: s.faxNumber,
  };
}

/** What is wrong on one step. The checking itself is checkAnswers(), the very function the server runs; here it is only narrowed to the step being looked at. */
export function validateStep(step: number, s: FormState, today = saToday()): Errors {
  return Object.fromEntries(Object.entries(checkAnswers(toPayload(s), today).errors).filter(([k]) => stepOfField(k) === step));
}

// ── documents ───────────────────────────────────────────────────────────────
export const slotsFor = (s: FormState): DocSlot[] => documentSlots(s.orgType, s.category);
export const extOf = (name: string) => { const m = /\.[A-Za-z0-9]{1,5}$/.exec(name); return m ? m[0].toLowerCase() : ""; };
export const sizeText = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const ACCEPT = FILE_RULES.extensions.join(",");

/** Why a chosen file cannot be used, or null when it can (the server also looks inside the file). */
export function fileProblem(f: { name: string; size: number }): string | null {
  if (!(FILE_RULES.extensions as readonly string[]).includes(extOf(f.name))) return `"${f.name}" is not an accepted file type. Use PDF, DOCX, XLSX, JPG or PNG`;
  if (f.size === 0) return `"${f.name}" is empty`;
  if (f.size > FILE_RULES.maxBytes) return `"${f.name}" is larger than ${FILE_RULES.maxBytes / 1024 / 1024} MB`;
  return null;
}
/**
 * Whether a chosen file really is what its name says, judged by its first bytes (the server makes the same check). Answers true when the browser cannot
 * read the file's start, because the server will look at it anyway.
 */
export async function looksLikeItsType(f: File): Promise<boolean> {
  const ext = extOf(f.name);
  if (typeof f.slice !== "function" || typeof (f as { arrayBuffer?: unknown }).arrayBuffer !== "function") return true;
  const b = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  const at = (...v: number[]) => v.every((x, i) => b[i] === x);
  if (ext === ".pdf") return at(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (ext === ".docx" || ext === ".xlsx") return at(0x50, 0x4b, 0x03, 0x04);
  if (ext === ".jpg" || ext === ".jpeg") return at(0xff, 0xd8, 0xff);
  if (ext === ".png") return at(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  return false;
}
export function validateDocuments(s: FormState, files: Files): Errors {
  const all = Object.values(files).flat();
  if (all.length > FILE_RULES.maxFiles) return { documents: `Attach at most ${FILE_RULES.maxFiles} files` };
  if (all.reduce((t, f) => t + f.size, 0) > FILE_RULES.maxTotalBytes) return { documents: `The files together are larger than ${FILE_RULES.maxTotalBytes / 1024 / 1024} MB` };
  for (const f of all) { const p = fileProblem(f); if (p) return { documents: p }; }
  const missing = slotsFor(s).filter((x) => x.required && !(files[x.id]?.length)).map((x) => x.label);
  return missing.length ? { documents: `Attach the required documents: ${missing.join("; ")}` } : {};
}

/** Every step's problems at once, for the final check before sending. */
export function validateAll(s: FormState, files: Files, today = saToday()): Errors {
  const e: Errors = {};
  for (let n = 1; n <= 7; n++) Object.assign(e, n === 6 ? validateDocuments(s, files) : validateStep(n, s, today));
  return e;
}
export const firstStepWithProblem = (e: Errors): number => Math.min(...Object.keys(e).map(stepOfField), 8);

// ── what is sent ────────────────────────────────────────────────────────────
/** The answers as JSON in one field, and each document as its own file part, the way the server expects them. */
export function buildFormData(s: FormState, files: Files): FormData {
  const fd = new FormData();
  fd.append("data", JSON.stringify(toPayload(s)));
  for (const [kind, list] of Object.entries(files)) for (const f of list) fd.append(`doc_${kind}`, f, f.name);
  return fd;
}

// ── a draft kept on this device ─────────────────────────────────────────────
const DRAFT_KEY = "vink-sponsorship-draft-v1";
export interface Draft { savedAt: string; step: number; state: FormState }

/** True when nothing has been typed yet, so there is nothing worth saving. */
export function isBlank(s: FormState): boolean {
  const b = initialState();
  const keys: (keyof FormState)[] = ["orgType", "applicantName", "organisation", "contactPerson", "email", "phone", "physicalAddress", "city", "category", "projectTitle", "executiveSummary", "totalBudget", "amountRequested"];
  return keys.every((k) => s[k] === b[k]) && s.benefits.length === 0 && s.expenditure.every((r) => !r.description && !r.amount);
}
/** Answers only: documents are never kept, and neither are the confirmations (they are made at the end, on purpose). */
export function saveDraft(s: FormState, step: number): void {
  try { if (isBlank(s)) { localStorage.removeItem(DRAFT_KEY); return; } localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), step, state: { ...s, consent: initialState().consent, faxNumber: "" } } satisfies Draft)); } catch { /* storage may be full or switched off: the form still works */ }
}
export function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    if (!d || typeof d.savedAt !== "string" || typeof d.step !== "number" || !d.state || typeof d.state !== "object") return null;
    const base = initialState(), st = d.state as FormState;
    if (!Array.isArray(st.expenditure) || !Array.isArray(st.benefits)) return null;
    return { savedAt: d.savedAt, step: Math.min(Math.max(Math.round(d.step), 1), 6), state: { ...base, ...st, consent: base.consent, faxNumber: "" } };
  } catch { return null; }
}
export function clearDraft(): void { try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ } }

export { ORG_TYPES, CATEGORIES, BENEFITS, CURRENCIES, LIMITS_ZAR, DEFAULT_COUNTRY, FILE_RULES };
