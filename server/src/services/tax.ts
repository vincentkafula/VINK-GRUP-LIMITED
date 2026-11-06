import type { Db } from "../portal/common.js";

/**
 * South African income tax (PAYE) for a payslip, worked from a tax table held as DATA with its source (tax_tables), never from numbers in the code, because the tables change every March.
 * The method is the SARS periodic (annualisation) method for regular pay: the period's taxable pay is scaled to a year, taxed by the brackets, reduced by the primary rebate, and scaled back to the period.
 * What this deliberately does NOT do: age rebates (they need a date of birth we do not hold, so PAYE is never UNDER-stated for an older marshal), medical credits, retirement or other deductions, or year-end reconciliation.
 * It is an ESTIMATE for the marshal's information and the association's payroll; the association is responsible for its EMP201 and IRP5 returns, and should take advice.
 */
export interface Bracket { upToCents: number | null; rateBp: number }
export interface TaxTable { taxYear: string; effectiveFrom: string; effectiveTo: string; brackets: Bracket[]; primaryRebateCents: number; uifCeilingMonthlyCents: number; source: string | null }
export type PayPeriod = "weekly" | "fortnightly" | "monthly";
export const periodsPerYear = (p: PayPeriod): number => ({ weekly: 52, fortnightly: 26, monthly: 12 })[p];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Checks a table before it is stored or used: brackets rise, end open-ended, rates are sensible, and the dates make sense. Returns a reason it is not usable, or null. */
export function tableProblem(t: { effectiveFrom: unknown; effectiveTo: unknown; brackets: unknown; primaryRebateCents: unknown; uifCeilingMonthlyCents: unknown; taxYear?: unknown }): string | null {
  if (typeof t.taxYear !== "string" || !/^\d{4}\/\d{2}$/.test(t.taxYear)) return "Name the tax year like 2027/28";
  if (typeof t.effectiveFrom !== "string" || typeof t.effectiveTo !== "string" || !DAY.test(t.effectiveFrom) || !DAY.test(t.effectiveTo) || t.effectiveTo < t.effectiveFrom) return "Give the dates it applies from and to";
  if (!Array.isArray(t.brackets) || t.brackets.length < 2 || t.brackets.length > 12) return "A table needs between 2 and 12 brackets";
  let last = 0;
  for (const [i, b] of (t.brackets as Bracket[]).entries()) {
    const lastOne = i === t.brackets.length - 1;
    if (!b || !Number.isInteger(b.rateBp) || b.rateBp < 0 || b.rateBp > 10000) return "Every bracket needs a rate between 0% and 100%";
    if (lastOne) { if (b.upToCents !== null) return "The top bracket has no upper limit"; }
    else if (!Number.isInteger(b.upToCents) || (b.upToCents as number) <= last) return "Brackets must rise from the lowest";
    else last = b.upToCents as number;
  }
  if (!Number.isInteger(t.primaryRebateCents) || (t.primaryRebateCents as number) < 0) return "The primary rebate must be an amount of cents";
  if (!Number.isInteger(t.uifCeilingMonthlyCents) || (t.uifCeilingMonthlyCents as number) <= 0) return "The UIF monthly ceiling must be an amount of cents";
  return null;
}

/** Tax on an annual amount by the brackets, before any rebate, to the nearest cent. */
export function taxBeforeRebateCents(annualCents: number, brackets: Bracket[]): number {
  let tax = 0, from = 0;
  for (const b of brackets) {
    const top = b.upToCents ?? Number.POSITIVE_INFINITY;
    if (annualCents > from) tax += Math.round((Math.min(annualCents, top) - from) * b.rateBp / 10000);
    if (annualCents <= top) break; from = top;
  }
  return tax;
}
export function payeForPeriod(taxablePeriodCents: number, periods: number, t: TaxTable): { annualTaxableCents: number; taxBeforeRebateCents: number; annualPayeCents: number; periodPayeCents: number } {
  const annual = Math.max(0, taxablePeriodCents) * periods, before = taxBeforeRebateCents(annual, t.brackets), annualPaye = Math.max(0, before - t.primaryRebateCents);
  return { annualTaxableCents: annual, taxBeforeRebateCents: before, annualPayeCents: annualPaye, periodPayeCents: Math.round(annualPaye / periods) };
}
/** UIF for a period: the rate on earnings up to the ceiling (the monthly ceiling, scaled to the period). */
export function uifForPeriod(earningsCents: number, rateBp: number, periods: number, t: TaxTable | null): number {
  const ceiling = t ? Math.floor((t.uifCeilingMonthlyCents * 12) / periods) : Number.POSITIVE_INFINITY;
  return Math.floor((Math.min(earningsCents, ceiling) * rateBp + 5000) / 10000);
}

const parse = (r: Record<string, unknown>): TaxTable | null => {
  try {
    const t: TaxTable = { taxYear: String(r.tax_year), effectiveFrom: new Date(r.effective_from as string).toISOString().slice(0, 10), effectiveTo: new Date(r.effective_to as string).toISOString().slice(0, 10), brackets: JSON.parse(String(r.brackets)), primaryRebateCents: Number(r.primary_rebate_cents), uifCeilingMonthlyCents: Number(r.uif_ceiling_monthly_cents), source: (r.source as string | null) ?? null };
    return tableProblem(t) ? null : t;
  } catch { return null; }
};
export function createTaxTables(db: Db) {
  /** The table that covers a day, or null (in which case no PAYE is calculated, and the payslip says so). */
  async function forDay(day: string): Promise<TaxTable | null> {
    const rows = (await db.query(`SELECT * FROM tax_tables WHERE effective_from <= $1 AND effective_to >= $1 ORDER BY effective_from DESC LIMIT 1`, [day])).rows;
    return rows[0] ? parse(rows[0]) : null;
  }
  async function list(): Promise<TaxTable[]> { return (await db.query(`SELECT * FROM tax_tables ORDER BY effective_from DESC`)).rows.map(parse).filter((t): t is TaxTable => !!t); }
  async function add(t: { taxYear: unknown; effectiveFrom: unknown; effectiveTo: unknown; brackets: unknown; primaryRebateCents: unknown; uifCeilingMonthlyCents: unknown; source?: unknown }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const bad = tableProblem(t); if (bad) return { ok: false, status: 400, error: bad };
    const src = typeof t.source === "string" ? t.source.trim().slice(0, 300) : "";
    if (!src) return { ok: false, status: 400, error: "Say where the figures come from (the SARS page or notice)" };
    const clash = (await db.query(`SELECT tax_year FROM tax_tables WHERE tax_year = $1 OR (effective_from <= $3 AND effective_to >= $2)`, [t.taxYear, t.effectiveFrom, t.effectiveTo])).rows[0];
    if (clash) return { ok: false, status: 409, error: `That overlaps the table for ${String(clash.tax_year)}` };
    await db.query(`INSERT INTO tax_tables (tax_year, effective_from, effective_to, brackets, primary_rebate_cents, uif_ceiling_monthly_cents, source) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [t.taxYear, t.effectiveFrom, t.effectiveTo, JSON.stringify(t.brackets), t.primaryRebateCents, t.uifCeilingMonthlyCents, src]);
    return { ok: true };
  }
  return { forDay, list, add };
}
export type TaxTables = ReturnType<typeof createTaxTables>;
