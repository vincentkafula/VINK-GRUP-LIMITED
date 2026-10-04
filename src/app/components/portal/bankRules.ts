/**
 * The account-type rules, mirrored from the server (server/src/portal/bankRules.ts) so the form can explain them before anything is
 * sent. The SERVER is the authority: it enforces them again on every request. A test keeps this table identical to the server's.
 */
export type HolderType = "personal" | "business";
export type BankRole = "driver" | "marshal" | "association" | "investor" | "vehicle_owner";

export const ACCOUNT_RULES: Record<BankRole, { allowed: HolderType[]; message: string }> = {
  driver:        { allowed: ["personal"],             message: "Drivers must use a Personal account." },
  marshal:       { allowed: ["personal"],             message: "Marshals must use a Personal account." },
  association:   { allowed: ["business"],             message: "Associations must use a Business account." },
  investor:      { allowed: ["personal", "business"], message: "Investors may use a Personal or a Business account." },
  vehicle_owner: { allowed: ["personal", "business"], message: "Owners may use a Personal or a Business account." },
};

export const REGISTRATION_NUMBER = /^\d{4}\/\d{6}\/\d{2}$/;

/** The same checks the server makes, so mistakes are caught while typing. Returns a message, or null when fine. */
export function businessProblem(name: string, reg: string): { name?: string; reg?: string } {
  const out: { name?: string; reg?: string } = {};
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 120) out.name = "Enter the registered business name (2 to 120 characters).";
  else if (/[<>]/.test(n)) out.name = "The business name contains characters that are not allowed.";
  if (!REGISTRATION_NUMBER.test(reg.trim())) out.reg = "Enter the registration number in the format 2015/123456/07.";
  return out;
}
