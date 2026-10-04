/**
 * Which kind of bank account each dashboard role may hold, and how a holder's details are validated. Pure functions: no I/O, so the
 * same rules are enforced identically when an account is linked, edited, or seeded, and are easy to test.
 *
 *   Driver       Personal only            Marshal      Personal only
 *   Association  Business only            Investor     Personal or Business
 *   Owner        Personal or Business
 *
 * A Business holder must give a business name and a registration number. The registration number is checked against the South African
 * company format YYYY/NNNNNN/NN (for example 2015/123456/07). Other entity formats (co-operatives, NPO numbers, sole proprietors) are not
 * accepted yet: they need the business to tell us which formats it will accept.
 */
export type HolderType = "personal" | "business";
export type BankRole = "driver" | "marshal" | "association" | "investor" | "vehicle_owner";

export const BANK_ROLES: readonly BankRole[] = ["driver", "marshal", "association", "investor", "vehicle_owner"];
export const isBankRole = (r: unknown): r is BankRole => typeof r === "string" && (BANK_ROLES as readonly string[]).includes(r);

interface Rule { allowed: HolderType[]; /** Shown when a type outside `allowed` is chosen. */ message: string; label: string }
export const ACCOUNT_RULES: Record<BankRole, Rule> = {
  driver:        { allowed: ["personal"],             label: "Drivers",      message: "Drivers must use a Personal account." },
  marshal:       { allowed: ["personal"],             label: "Marshals",     message: "Marshals must use a Personal account." },
  association:   { allowed: ["business"],             label: "Associations", message: "Associations must use a Business account." },
  investor:      { allowed: ["personal", "business"], label: "Investors",    message: "Investors may use a Personal or a Business account." },
  vehicle_owner: { allowed: ["personal", "business"], label: "Owners",       message: "Owners may use a Personal or a Business account." },
};

export const REGISTRATION_NUMBER = /^\d{4}\/\d{6}\/\d{2}$/;

export interface HolderInput { holderType?: unknown; businessName?: unknown; registrationNumber?: unknown }
export interface Holder { holderType: HolderType; businessName: string | null; registrationNumber: string | null }
export type Checked = { ok: true; value: Holder } | { ok: false; status: number; code: string; message: string };

const bad = (code: string, message: string): Checked => ({ ok: false, status: 400, code, message });

/** Validates a holder type and, for a Business account, the business details. */
export function checkHolder(role: BankRole, input: HolderInput): Checked {
  const rule = ACCOUNT_RULES[role];
  const t = typeof input.holderType === "string" ? input.holderType.trim().toLowerCase() : "";
  if (t !== "personal" && t !== "business") return bad("invalid_holder_type", "Choose Personal or Business as the account type.");
  if (!rule.allowed.includes(t)) return { ok: false, status: 422, code: "account_type_not_allowed", message: rule.message };

  if (t === "personal") return { ok: true, value: { holderType: "personal", businessName: null, registrationNumber: null } };

  const name = typeof input.businessName === "string" ? input.businessName.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) return bad("invalid_business_name", "Enter the registered business name (2 to 120 characters).");
  if (/[<>]/.test(name)) return bad("invalid_business_name", "The business name contains characters that are not allowed.");
  const reg = typeof input.registrationNumber === "string" ? input.registrationNumber.trim() : "";
  if (!REGISTRATION_NUMBER.test(reg)) return bad("invalid_registration_number", "Enter the registration number in the format 2015/123456/07.");
  return { ok: true, value: { holderType: "business", businessName: name, registrationNumber: reg } };
}

/** What the "Link account" form may offer this role. */
export function rulesFor(role: BankRole) { const r = ACCOUNT_RULES[role]; return { allowed: r.allowed, message: r.message }; }

/** Account numbers are shown in full to their owner and to admins; everywhere else (logs, audit) only the last four digits. */
export const maskNumber = (n: string) => (n.length > 4 ? "•".repeat(n.length - 4) + n.slice(-4) : n);
export const maskRegistration = (r: string | null) => (r ? r.slice(0, 4) + "/••••••/" + r.slice(-2) : null);
