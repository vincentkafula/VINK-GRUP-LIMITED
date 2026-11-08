import type { Db } from "../portal/common.js";
import { normalizePhone } from "./ownerSms.js";
import { EMAIL } from "./delegates.js";

/**
 * THE OWNER'S BUSINESS RECORD (docs/OWNER_DASHBOARD.md): who the owner trades as, so the statements an accountant, a lender or SARS reads say whose they are.
 *   what is kept   how they trade (an individual, a company, a partnership), the trading name, the registered name and number if there is one, a VAT number if they are registered for VAT, a phone, an email and an address
 *   what is NOT   no income tax reference, no ID number, no bank detail: nothing here is needed to work out the figures, and the less that is kept the less can be lost
 *   what it does   it is printed at the top of the profit and loss PDF. It is not checked against any register: the owner is responsible for it being right
 * A VAT number is checked only for its SHAPE (ten digits, starting with 4, the form SARS issues), never against SARS. Every field is optional but the trading name.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
export const KINDS = ["individual", "company", "partnership", "other"] as const;
export const KIND_TEXT: Record<(typeof KINDS)[number], string> = { individual: "An individual (sole proprietor)", company: "A company", partnership: "A partnership", other: "Something else" };
const opt = (v: unknown, max: number): string | null | false => (v === undefined || v === null || v === "" ? null : typeof v === "string" && v.trim().length <= max ? v.trim() : false);
export interface Business { kind: string; kindText: string; tradingName: string; registeredName: string | null; registrationNumber: string | null; vatNumber: string | null; phone: string | null; email: string | null; address: string | null; updatedOn: string }

export function createOwnerBusiness(db: Db, now: () => Date = () => new Date()) {
  const view = (r: Record<string, unknown>): Business => ({ kind: String(r.kind), kindText: KIND_TEXT[String(r.kind) as (typeof KINDS)[number]] ?? String(r.kind), tradingName: String(r.trading_name), registeredName: (r.registered_name as string | null) ?? null, registrationNumber: (r.registration_number as string | null) ?? null, vatNumber: (r.vat_number as string | null) ?? null, phone: (r.phone as string | null) ?? null, email: (r.email as string | null) ?? null, address: (r.address as string | null) ?? null, updatedOn: new Date(r.updated_at as string).toISOString().slice(0, 10) });
  async function get(owner: string): Promise<Business | null> { const r = (await db.query(`SELECT * FROM owner_business_profile WHERE owner_id = $1`, [owner])).rows[0]; return r ? view(r) : null; }
  /** Saves the whole record (a save replaces it). Returns the names of the fields that changed, never their values. */
  async function save(owner: string, by: string, b: Record<string, unknown>): Promise<Res<{ business: Business; changed: string[] }>> {
    if (!KINDS.includes(b.kind as never)) return bad(400, "Say how you trade: as an individual, a company, a partnership or something else");
    const trading = typeof b.tradingName === "string" ? b.tradingName.trim() : ""; if (!trading || trading.length > 100) return bad(400, "Give the name you trade under (up to 100 characters)");
    const reg = opt(b.registeredName, 100), regNo = opt(b.registrationNumber, 30), vat = opt(b.vatNumber, 20), email = opt(b.email, 200), address = opt(b.address, 300), phoneRaw = opt(b.phone, 30);
    if ([reg, regNo, vat, email, address, phoneRaw].some((x) => x === false)) return bad(400, "One of the boxes is too long");
    if (regNo && !/^[A-Za-z0-9/ .-]+$/.test(regNo as string)) return bad(400, "A registration number is letters, digits, slashes, dots and dashes");
    const vatClean = vat ? (vat as string).replace(/\s/g, "") : null; if (vatClean && !/^4\d{9}$/.test(vatClean)) return bad(400, "A VAT number is ten digits and starts with 4");
    if (email && !EMAIL.test(email as string)) return bad(400, "Give a valid email address"); const phone = phoneRaw ? normalizePhone(phoneRaw) : null; if (phoneRaw && !phone) return bad(400, "Give a phone number, for example 082 123 4567, or with the country code");
    const before = await get(owner), next = { kind: b.kind as string, tradingName: trading, registeredName: reg as string | null, registrationNumber: regNo as string | null, vatNumber: vatClean, phone, email: email ? (email as string).toLowerCase() : null, address: address as string | null };
    await db.query(`DELETE FROM owner_business_profile WHERE owner_id = $1`, [owner]);
    await db.query(`INSERT INTO owner_business_profile (owner_id, kind, trading_name, registered_name, registration_number, vat_number, phone, email, address, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [owner, next.kind, next.tradingName, next.registeredName, next.registrationNumber, next.vatNumber, next.phone, next.email, next.address, by, now().toISOString()]);
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => !before || (before as unknown as Record<string, unknown>)[k] !== next[k]); return { ok: true, value: { business: (await get(owner))!, changed } };
  }
  async function remove(owner: string): Promise<Res<{ removed: boolean }>> { const had = !!(await get(owner)); await db.query(`DELETE FROM owner_business_profile WHERE owner_id = $1`, [owner]); return { ok: true, value: { removed: had } }; }
  return { get, save, remove };
}
export type OwnerBusiness = ReturnType<typeof createOwnerBusiness>;
