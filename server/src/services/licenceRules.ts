import type { Db } from "../portal/common.js";

/**
 * HOW LONG AN OPERATING LICENCE MAY LAST, BY PROVINCE (docs/OWNER_DASHBOARD.md, slice C1).
 * This is CONFIGURATION, not law. The rows in `licence_rules` start as the figures the product brief gave (5 years in Gauteng and the Western Cape, 7 elsewhere), every one marked NOT VERIFIED, and the screens say so until someone has checked it with the Provincial Regulatory Entity and recorded that.
 * A licence with no province recorded follows the default rule ('*').
 */
export const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"] as const;
export type Province = (typeof PROVINCES)[number];
export interface LicenceRule { province: string; maxYears: number; verified: boolean; note: string | null }
const WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" };
export const yearsText = (n: number) => `${WORDS[n] ?? n} year${n === 1 ? "" : "s"}`;
export const isProvince = (v: unknown): v is Province => typeof v === "string" && (PROVINCES as readonly string[]).includes(v);

export function createLicenceRules(db: Db, now: () => Date = () => new Date()) {
  const ruleOf = (r: Record<string, unknown>): LicenceRule => ({ province: String(r.province), maxYears: Number(r.max_years), verified: !!r.verified, note: (r.note as string | null) ?? null });
  async function list(): Promise<LicenceRule[]> { return (await db.query(`SELECT * FROM licence_rules ORDER BY (province = '*') DESC, province`)).rows.map(ruleOf); }
  /** The rule that applies to a province: its own row, else the default. If even the default row is missing, seven years (and not verified). */
  async function forProvince(province: string | null | undefined): Promise<LicenceRule> {
    const rows = await list(), own = province ? rows.find((r) => r.province === province) : undefined; return own ?? rows.find((r) => r.province === "*") ?? { province: "*", maxYears: 7, verified: false, note: null };
  }
  /** Changes a rule. Only an administrator does this (there is a command for it); an owner or an association never changes what the law says. */
  async function set(province: string, maxYears: number, o: { verified?: boolean; note?: string | null } = {}): Promise<{ ok: true; rule: LicenceRule } | { ok: false; error: string }> {
    if (province !== "*" && !isProvince(province)) return { ok: false, error: `${province} is not a South African province` }; if (!Number.isInteger(maxYears) || maxYears < 1 || maxYears > 20) return { ok: false, error: "A licence lasts a whole number of years, from 1 to 20" };
    const note = o.note === undefined ? null : o.note === null ? null : String(o.note).slice(0, 300);
    await db.query(`INSERT INTO licence_rules (province, max_years, verified, note, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (province) DO UPDATE SET max_years = EXCLUDED.max_years, verified = EXCLUDED.verified, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at`, [province, maxYears, !!o.verified, note, now().toISOString()]);
    return { ok: true, rule: await forProvince(province) };
  }
  return { list, forProvince, set };
}
export type LicenceRules = ReturnType<typeof createLicenceRules>;
