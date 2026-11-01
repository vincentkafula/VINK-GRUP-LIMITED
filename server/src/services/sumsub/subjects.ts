import type { Db } from "../../portal/driverRoutes.js";
import type { Profile } from "./config.js";
import type { IdentitySubject, SubjectApp } from "./identity.js";

/** The kinds of application that can be identity-checked. A new kind (insurance, say) is one more adapter here and one line where the engine is built. */
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => { try { const o = typeof v === "string" ? JSON.parse(v) : v; return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {}; } catch { return {}; } };
const firstOf = (max: number, ...vs: unknown[]) => { for (const v of vs) { const t = clean(v, max); if (t) return t; } return undefined; };

/**
 * What an application says about the business behind it, for the business verification. The screens that take a business application keep it in different places: the account flow
 * ("business": name, registrationNumber), the business account (bizName, regNo), the business loan (businessName, cipcNumber) and the corporate loan ("company": name, cipc). Any of it may be
 * blank (the business account's own comment says its fields were never actually required), so everything is optional: Sumsub's widget asks the applicant for what is missing.
 */
export function companyOf(tierData: unknown): { name?: string; registrationNumber?: string } {
  const t = obj(tierData), biz = obj(t.business), co = obj(t.company);
  return { name: firstOf(200, biz.name, co.name, t.businessName, t.bizName, t.companyName), registrationNumber: firstOf(60, biz.registrationNumber, co.cipc, t.cipcNumber, t.regNo, t.registrationNumber, t.cipc) };
}

/**
 * Everything in the applications table: account applications (personal, business, corporate), credit cards, business and corporate loans, SIM, vehicle tracking and the invest and
 * rewards forms all arrive there. The tier says which Sumsub level and whether an identity is required. The applicant proves it is theirs by the reference with the email
 * address on it, or by being signed in as its owner (some applications were sent before the customer had a login, so the email is how the two are linked).
 */
export function applicationSubject(db: Db): IdentitySubject {
  const COLS = `id, status, tier, applicant_email, applicant_phone, tier_data`;
  const toApp = (r: Record<string, unknown>): SubjectApp => ({ id: String(r.id), status: String(r.status), email: r.applicant_email ? String(r.applicant_email) : null, phone: r.applicant_phone ? String(r.applicant_phone) : null, profile: String(r.tier) as Profile, company: companyOf(r.tier_data) });
  return {
    kind: "application",
    closed: new Set(["approved", "declined"]),
    async forApplicant(ref, email, userId) {
      const r = clean(ref, 40).toUpperCase(), e = clean(email, 254).toLowerCase();
      if (!/^VNK-(PA|BA|CA)-[A-Z0-9]{6,24}$/.test(r)) return null;
      const params: unknown[] = [r], proofs: string[] = [];
      if (e) { params.push(e); proofs.push(`LOWER(applicant_email) = $${params.length}`); }
      if (userId) { params.push(userId); proofs.push(`applicant_user_id = $${params.length}`); }
      if (!proofs.length) return null;                                           // neither the email on it nor an account: nothing proves it is theirs
      const row = (await db.query(`SELECT ${COLS} FROM applications WHERE reference_number = $1 AND (${proofs.join(" OR ")})`, params)).rows[0];
      return row ? toApp(row) : null;
    },
    async byRef(ref) { const row = (await db.query(`SELECT ${COLS} FROM applications WHERE reference_number = $1`, [clean(ref, 40).toUpperCase()])).rows[0]; return row ? toApp(row) : null; },
  };
}

/** Sponsorship applications: anonymous applicants who prove it is theirs by the reference (SP-XXXXXX) with the email address they applied with. */
export function sponsorshipSubject(db: Db): IdentitySubject {
  const COLS = `id, status, email, phone`;
  const toApp = (r: Record<string, unknown>): SubjectApp => ({ id: String(r.id), status: String(r.status), email: r.email ? String(r.email) : null, phone: r.phone ? String(r.phone) : null, profile: "sponsorship" });
  return {
    kind: "sponsorship",
    closed: new Set(["declined"]),
    async forApplicant(ref, email) {
      const r = clean(ref, 20).toUpperCase(), e = clean(email, 254).toLowerCase();
      if (!/^SP-[A-Z2-9]{6}$/.test(r) || !e) return null;
      const row = (await db.query(`SELECT ${COLS} FROM sponsorship_applications WHERE ref = $1 AND email = $2`, [r, e])).rows[0];
      return row ? toApp(row) : null;
    },
    async byRef(ref) { const row = (await db.query(`SELECT ${COLS} FROM sponsorship_applications WHERE ref = $1`, [clean(ref, 20).toUpperCase()])).rows[0]; return row ? toApp(row) : null; },
  };
}
