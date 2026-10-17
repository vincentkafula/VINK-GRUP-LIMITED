/**
 * What a sponsorship application asks for, and what it requires.
 *
 * This file is the server's authority: the service validates every application against it. src/app/data/sponsorship.ts is an identical copy that the
 * application form uses, and a test fails if the two ever differ. It is plain data and pure functions (no imports), so both sides run the very same rules:
 * checkAnswers() below is the one place the answers are checked, by the form as a person goes and by the server when they submit.
 */

export const ORG_TYPES = [
  { id: "company",         label: "Registered company" },
  { id: "ngo",             label: "NGO or non-profit organisation" },
  { id: "school",          label: "School" },
  { id: "sports_club",     label: "Sports club or team" },
  { id: "community_group", label: "Community group" },
  { id: "individual",      label: "Individual" },
] as const;
export type OrgTypeId = (typeof ORG_TYPES)[number]["id"];

export const CATEGORIES = [
  { id: "financial",   label: "Financial sponsorship" },
  { id: "sports",      label: "Sports sponsorship" },
  { id: "education",   label: "Education and scholarships" },
  { id: "community",   label: "Community development" },
  { id: "environment", label: "Environmental and sustainability projects" },
  { id: "arts",        label: "Arts, music and entertainment" },
  { id: "events",      label: "Events, conferences and exhibitions" },
  { id: "equipment",   label: "Equipment, vehicles and products" },
  { id: "technology",  label: "Technology and digital infrastructure" },
  { id: "youth",       label: "Youth empowerment and entrepreneurship" },
  { id: "charity",     label: "Charity and social responsibility" },
  { id: "media",       label: "Media, advertising and promotional partnerships" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** What the applicant can offer the sponsor in return (section 5). */
export const BENEFITS = [
  { id: "logo",           label: "Brand logo placement" },
  { id: "advertising",    label: "Advertising and promotional opportunities" },
  { id: "social",         label: "Social media exposure" },
  { id: "website",        label: "Website visibility" },
  { id: "signage",        label: "Event branding and signage" },
  { id: "demonstrations", label: "Product demonstrations" },
  { id: "audience",       label: "Access to agreed audience segments" },
  { id: "media",          label: "Media coverage and public relations" },
  { id: "csr",            label: "Corporate social responsibility outcomes" },
  { id: "reports",        label: "Post-project performance and impact reports" },
] as const;
export type BenefitId = (typeof BENEFITS)[number]["id"];

/** Requests can be made in these currencies. The published limits are in rand; other currencies are converted at VINK's stored rate. */
export const CURRENCIES = ["ZAR", "USD", "EUR", "GBP", "ZMW", "CNY", "BWP", "NAD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/** VINK's published limits per application, in rand. */
export const LIMITS_ZAR = { min: 5000, max: 500000 } as const;

export const DEFAULT_COUNTRY = "South Africa";
export const PROVINCES_ZA = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape"] as const;

/** What an uploaded document may be. The type is checked by the file's name AND by its first bytes, never by the browser's word for it. */
export const FILE_RULES = {
  maxBytes: 10 * 1024 * 1024,
  maxFiles: 15,
  maxTotalBytes: 30 * 1024 * 1024,
  extensions: [".pdf", ".docx", ".xlsx", ".jpg", ".jpeg", ".png"],
} as const;

/** The words an applicant sees for where their application stands. */
export const STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under review",
  more_information_required: "More information required",
  approved: "Approved",
  declined: "Declined",
  agreement_pending: "Agreement pending",
} as const;
export type StatusId = keyof typeof STATUS_LABELS;
export const STATUSES = Object.keys(STATUS_LABELS) as StatusId[];

export interface DocSlot { id: string; label: string; required: boolean; hint?: string }

const REGISTRATION_LABEL: Record<string, string> = {
  company: "Company registration documents",
  ngo: "NGO or charity registration certificate",
  school: "Proof of NPO or community organisation registration",
  sports_club: "Proof of NPO or community organisation registration",
  community_group: "Proof of NPO or community organisation registration",
};

/**
 * The documents an application needs, which depends on who is applying (organisation type) and what for (category). Required documents must have a file
 * before the application can be submitted; the rest are optional. The same function runs in the form and on the server.
 */
export function documentSlots(orgType: string, category: string): DocSlot[] {
  const slots: DocSlot[] = [{ id: "proposal", label: "Detailed sponsorship proposal", required: true }];
  if (REGISTRATION_LABEL[orgType]) slots.push({ id: "registration", label: REGISTRATION_LABEL[orgType], required: true });
  slots.push({ id: "budget", label: "Project budget and financial statements", required: true });
  slots.push({ id: "programme", label: "Event programme or project plan", required: category === "events" });
  slots.push({ id: "proof_of_address", label: "Proof of address", required: orgType === "individual" });
  slots.push({ id: "tax", label: "Tax compliance documents", required: false, hint: "Include these if they apply to your organisation type." });
  slots.push({ id: "support_letters", label: "Letters of support or partnership agreements", required: false });
  slots.push({ id: "previous_reports", label: "Previous project reports and photographs", required: false });
  slots.push({ id: "media_kit", label: "Brand profile, audience statistics or media kit", required: category === "media" });
  slots.push({ id: "quotations", label: "Quotations for equipment or products requested", required: category === "equipment" || category === "technology" });
  return slots;
}

/** Every document id there can ever be: the form field names a file may arrive under. */
export const ALL_DOCUMENT_IDS = ["proposal", "registration", "budget", "programme", "proof_of_address", "tax", "support_letters", "previous_reports", "media_kit", "quotations"] as const;

// ── checking the answers ─────────────────────────────────────────────────────

export type Errors = Record<string, string>;

/** The answers once cleaned: text trimmed, amounts as numbers, lists reduced to what is known. */
export interface Answers {
  orgType: string; applicantName: string; organisation: string; registrationNumber: string; contactPerson: string; email: string; phone: string;
  physicalAddress: string; postalAddress: string; country: string; province: string; city: string; website: string; socialLinks: string; taxStatus: string; taxNumber: string;
  category: string;
  projectTitle: string; executiveSummary: string; background: string; problem: string; targetAudience: string; geographicArea: string; beneficiaries: number;
  startDate: string; endDate: string; implementationPlan: string; outcomes: string; whyVink: string; alignment: string;
  currency: string; totalBudget: number; amountRequested: number; ownContribution: number; otherSponsorsAmount: number; otherSponsorsNotes: string;
  expenditure: { description: string; amount: number }[]; requestedItems: string; financialControls: string;
  benefits: string[]; benefitsValue: string;
}

/** Text with its control characters taken out (tabs and line breaks stay) and its ends trimmed. */
const strip = (v: unknown) => {
  if (typeof v !== "string") return "";
  let out = "";
  for (const ch of v) { const c = ch.charCodeAt(0); if (!(c <= 8 || c === 11 || c === 12 || (c >= 14 && c <= 31) || c === 127)) out += ch; }
  return out.trim();
};
const flat = (v: string) => v.replace(/[\r\n\t]+/g, " ").trim();
const round2 = (n: number) => Math.round(n * 100) / 100;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const asNumber = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[\s,]/g, "")) : NaN;
  return Number.isFinite(n) ? round2(n) : null;
};
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const isHttpUrl = (s: string) => { try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };
const rand = (n: number) => `R${n.toLocaleString("en-ZA")}`;

/**
 * Checks the answers of an application, whole, and says which ones are wrong (keyed by the answer's name, e.g. "email" or "consent.terms").
 * "today" is the day in South Africa as YYYY-MM-DD: a project cannot start before it. Documents, and the conversion of other currencies to rand,
 * are not here: they need the files and the exchange rates, which only the server has.
 */
export function checkAnswers(raw: Record<string, unknown>, today: string): { data: Answers; errors: Errors } {
  const e: Errors = {};
  const text = (key: string, label: string, min: number, max: number, one = false): string => {
    const v = one ? flat(strip(raw[key])) : strip(raw[key]);
    if (v.length < min) e[key] = min <= 1 ? `Enter ${label}` : `${cap(label)} needs at least ${min} characters`;
    else if (v.length > max) e[key] = `${cap(label)} is too long (at most ${max} characters)`;
    return v.slice(0, max);
  };
  const opt = (key: string, label: string, max: number, one = true): string => {
    const v = one ? flat(strip(raw[key])) : strip(raw[key]);
    if (v.length > max) e[key] = `${cap(label)} is too long (at most ${max} characters)`;
    return v.slice(0, max);
  };

  const orgType = flat(strip(raw.orgType));
  if (!ORG_TYPES.some((o) => o.id === orgType)) e.orgType = "Choose the type of organisation";
  const category = flat(strip(raw.category));
  if (!CATEGORIES.some((c) => c.id === category)) e.category = "Choose the type of support you need";

  const applicantName = text("applicantName", "the applicant's full legal name", 2, 120, true);
  const organisation = orgType === "individual" ? opt("organisation", "the organisation name", 150) || applicantName : text("organisation", "the organisation or company name", 2, 150, true);
  const registrationNumber = opt("registrationNumber", "the registration number", 40);
  if (orgType === "company" && registrationNumber.length < 2) e.registrationNumber = "Enter the company registration number";
  const contactPerson = text("contactPerson", "the contact person's name", 2, 120, true);
  const email = flat(strip(raw.email)).toLowerCase();
  if (email.length > 254 || !/^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]{2,}$/.test(email)) e.email = "Enter a valid email address";
  const phone = flat(strip(raw.phone));
  if (!/^[0-9+() -]{6,30}$/.test(phone)) e.phone = "Enter a valid telephone number";
  const physicalAddress = text("physicalAddress", "the physical address", 5, 250, true);
  const postalAddress = opt("postalAddress", "the postal address", 250);
  const country = text("country", "the country", 2, 60, true);
  const province = opt("province", "the province", 60);
  if (country === DEFAULT_COUNTRY) { if (!(PROVINCES_ZA as readonly string[]).includes(province)) e.province = "Choose the province"; }
  else if (province.length < 2) e.province = "Enter the province or region";
  const city = text("city", "the city or town", 2, 80, true);
  const website = opt("website", "the website address", 200);
  if (website && !isHttpUrl(website)) e.website = "Enter a full web address starting with https://";
  const socialLinks = opt("socialLinks", "the social media links", 500, false);
  const taxStatus = flat(strip(raw.taxStatus));
  if (!["exempt", "not_exempt", "not_applicable"].includes(taxStatus)) e.taxStatus = "Choose a tax-exempt or non-profit status";
  const taxNumber = opt("taxNumber", "the registration number", 40);
  if (taxStatus === "exempt" && taxNumber.length < 2) e.taxNumber = "Enter the tax-exemption or non-profit registration number";

  const projectTitle = text("projectTitle", "the project or event title", 3, 150, true);
  const executiveSummary = text("executiveSummary", "the executive summary", 50, 1500);
  const background = text("background", "the background and objectives", 30, 3000);
  const problem = text("problem", "the problem being addressed", 30, 2000);
  const targetAudience = text("targetAudience", "the target audience and beneficiaries", 10, 1000);
  const geographicArea = text("geographicArea", "the geographic area of impact", 3, 300, true);
  const bn = asNumber(raw.beneficiaries);
  if (bn === null || !Number.isInteger(bn) || bn < 1 || bn > 10_000_000) e.beneficiaries = "Enter the expected number of participants or beneficiaries (a whole number, at least 1)";
  const startDate = flat(strip(raw.startDate)), endDate = flat(strip(raw.endDate));
  if (!isDate(startDate)) e.startDate = "Enter the project start date";
  else if (startDate < today) e.startDate = "Choose a start date that is today or later";
  if (!isDate(endDate)) e.endDate = "Enter the project completion date";
  else if (isDate(startDate) && endDate < startDate) e.endDate = "The completion date cannot be before the start date";
  const implementationPlan = text("implementationPlan", "the implementation plan", 30, 3000);
  const outcomes = text("outcomes", "the expected outcomes and measurable impact", 30, 3000);
  const whyVink = text("whyVink", "why you chose VINK", 20, 1500);
  const alignment = text("alignment", "how the sponsorship aligns with VINK's objectives", 20, 1500);

  const currency = flat(strip(raw.currency)).toUpperCase();
  if (!(CURRENCIES as readonly string[]).includes(currency)) e.currency = "Choose a currency";
  const amount = (key: string, label: string, optional: boolean): number => {
    const empty = raw[key] === undefined || raw[key] === null || raw[key] === "";
    if (optional && empty) return 0;
    const n = asNumber(raw[key]);
    if (n === null || n < 0 || (!optional && n <= 0) || n > 1e12) { e[key] = `Enter ${label}`; return 0; }
    return n;
  };
  const totalBudget = amount("totalBudget", "the total project budget", false);
  const amountRequested = amount("amountRequested", "the amount you are asking for", false);
  const ownContribution = amount("ownContribution", "your own contribution (or 0)", true);
  const otherSponsorsAmount = amount("otherSponsorsAmount", "the other sponsors' contributions (or 0)", true);
  const otherSponsorsNotes = opt("otherSponsorsNotes", "the other sponsors", 500, false);
  if (otherSponsorsAmount > 0 && otherSponsorsNotes.length < 2) e.otherSponsorsNotes = "Say who the other sponsors are";
  const rows = Array.isArray(raw.expenditure) ? raw.expenditure.slice(0, 30) : [];
  const expenditure: { description: string; amount: number }[] = [];
  for (const [i, r] of rows.entries()) {
    const row = (r ?? {}) as Record<string, unknown>; const description = flat(strip(row.description)).slice(0, 120), a = asNumber(row.amount);
    if (description.length < 2 || a === null || a <= 0) { e.expenditure = `Line ${i + 1} of the expenditure breakdown needs a description and an amount above 0`; break; }
    expenditure.push({ description, amount: a });
  }
  if (!e.expenditure) {
    const sum = round2(expenditure.reduce((t, r) => t + r.amount, 0));
    if (expenditure.length === 0) e.expenditure = "Add at least one line to the expenditure breakdown";
    else if (totalBudget > 0 && Math.abs(sum - totalBudget) > 0.009) e.expenditure = `The breakdown adds up to ${sum.toLocaleString("en-ZA")} but the total project budget is ${totalBudget.toLocaleString("en-ZA")}. They must match.`;
  }
  if (!e.amountRequested && !e.totalBudget && round2(amountRequested + ownContribution + otherSponsorsAmount) > totalBudget + 0.009) e.amountRequested = "The amount you are asking for plus the other contributions is more than the total project budget";
  if (!e.amountRequested && currency === "ZAR" && (amountRequested < LIMITS_ZAR.min || amountRequested > LIMITS_ZAR.max)) e.amountRequested = `Requests must be between ${rand(LIMITS_ZAR.min)} and ${rand(LIMITS_ZAR.max)} per application`;
  const requestedItems = opt("requestedItems", "the requested items", 1000, false);
  const financialControls = text("financialControls", "the financial controls and reporting arrangements", 20, 2000);

  const benefitsRaw = Array.isArray(raw.benefits) ? raw.benefits.map((b) => flat(strip(b))) : [];
  const benefits = [...new Set(benefitsRaw)].filter((b) => BENEFITS.some((x) => x.id === b));
  if (benefits.length === 0) e.benefits = "Choose at least one thing you can offer VINK in return";
  const benefitsValue = text("benefitsValue", "the measurable value of the partnership", 30, 2000);

  const c = (raw.consent ?? {}) as Record<string, unknown>;
  for (const k of ["accuracy", "authorised", "terms", "processing"] as const) if (c[k] !== true) e[`consent.${k}`] = "This confirmation is required";

  return { errors: e, data: { orgType, applicantName, organisation, registrationNumber, contactPerson, email, phone, physicalAddress, postalAddress, country, province, city, website, socialLinks, taxStatus, taxNumber, category, projectTitle, executiveSummary, background, problem, targetAudience, geographicArea, beneficiaries: bn ?? 0, startDate, endDate, implementationPlan, outcomes, whyVink, alignment, currency, totalBudget, amountRequested, ownContribution, otherSponsorsAmount, otherSponsorsNotes, expenditure, requestedItems, financialControls, benefits, benefitsValue } };
}

// ── review, awards and reports ───────────────────────────────────────────────

/** What a reviewer scores an application on (0 to SCORE_MAX each). A sponsor weights them; the scores support a decision and never replace the people who make it. */
export const REVIEW_CRITERIA = [
  { id: "strategic",  label: "Strategic alignment" },
  { id: "impact",     label: "Community impact" },
  { id: "feasibility", label: "Feasibility" },
  { id: "budget",     label: "Budget quality" },
  { id: "reach",      label: "Reach" },
  { id: "measurable", label: "Measurable benefits" },
] as const;
export type CriterionId = (typeof REVIEW_CRITERIA)[number]["id"];
export const SCORE_MAX = 5;
/** Until a sponsor sets its own weights, every criterion counts the same. */
export const DEFAULT_WEIGHTS: Record<CriterionId, number> = { strategic: 1, impact: 1, feasibility: 1, budget: 1, reach: 1, measurable: 1 };
export const MAX_WEIGHT = 10;

/** One reviewer's scores as a percentage of the best possible, using the weights; null until every criterion has a score. */
export function weightedScore(scores: Record<string, unknown>, weights: Record<string, number>): number | null {
  let got = 0, best = 0;
  for (const c of REVIEW_CRITERIA) {
    const w = Number(weights[c.id] ?? 0), v = scores[c.id];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    got += w * v; best += w * SCORE_MAX;
  }
  return best > 0 ? Math.round((got / best) * 1000) / 10 : null;
}

/** Where an award stands. The agreement is sent by VINK, signed outside the system and marked signed by staff; the final report completes it. */
export const AWARD_STAGES = { agreement_pending: "Agreement pending", active: "Agreement signed", completed: "Completed" } as const;
export type AwardStage = keyof typeof AWARD_STAGES;
export const PAYMENT_KINDS = [{ id: "cash", label: "Payment" }, { id: "in_kind", label: "Products, equipment or services" }] as const;
export const REPORT_STATUS_LABELS = { submitted: "Submitted", accepted: "Accepted", returned: "Returned for changes" } as const;
export type ReportStatus = keyof typeof REPORT_STATUS_LABELS;
