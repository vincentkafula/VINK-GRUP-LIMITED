import type { CountryConfig, FeeRule, KycTier } from "./countryConfig.js";

/**
 * The fee engine: given a country's fee rules and a transaction, say what the fee is. Pure (no I/O), integers only (minor units), and every
 * decision is explainable (which rule matched, why).
 *
 * Matching: a rule applies when its `txn` equals the transaction's and every other key it names (payerType, payeeType, rail, tier) equals the
 * transaction's or is "*". If several rules match, the MOST SPECIFIC wins (the one naming the most keys); a tie goes to the earlier rule.
 * Calculation: flat | percent_plus_flat (half-up rounding) | tiered (the first band whose upper limit covers the amount). Then min and max
 * are applied, and a waived rule is zero. A fee can never exceed the amount it is charged on.
 */
export interface FeeContext { txn: string; amountCents: number; payerType?: string; payeeType?: string; rail?: string; tier?: KycTier }
export interface FeeResult { feeCents: number; ruleId: string | null; waived: boolean; bearer: "payer" | "payee" | "platform"; calculation: string }

const KEYS = ["payerType", "payeeType", "rail", "tier"] as const;
const named = (a: FeeRule["appliesTo"]) => KEYS.filter((k) => a[k] !== undefined && a[k] !== "*");

function matches(rule: FeeRule, ctx: FeeContext): boolean {
  if (rule.appliesTo.txn !== ctx.txn) return false;
  return named(rule.appliesTo).every((k) => rule.appliesTo[k] === ctx[k]);
}

export function computeFee(rules: FeeRule[], ctx: FeeContext): FeeResult {
  if (!Number.isInteger(ctx.amountCents) || ctx.amountCents < 0) throw new Error("amountCents must be a non-negative whole number");
  let best: FeeRule | null = null, bestScore = -1;
  for (const r of rules) { if (!matches(r, ctx)) continue; const score = named(r.appliesTo).length; if (score > bestScore) { best = r; bestScore = score; } }
  if (!best) return { feeCents: 0, ruleId: null, waived: false, bearer: "payer", calculation: `no fee rule for ${ctx.txn}` };
  if (best.waive) return { feeCents: 0, ruleId: best.id, waived: true, bearer: best.payer ?? "payer", calculation: "waived" };

  const k = best.calc;
  let fee: number, how: string;
  if (k.type === "flat") { fee = k.amountCents; how = `flat ${k.amountCents}`; }
  else if (k.type === "percent_plus_flat") { fee = Math.floor(ctx.amountCents * k.pct + 0.5) + k.flatCents; how = `${(k.pct * 100).toFixed(2)}% of ${ctx.amountCents} + ${k.flatCents}`; }
  else { const band = k.tiers.find((t) => t.upToCents === null || ctx.amountCents <= t.upToCents)!; fee = band.flatCents; how = `band up to ${band.upToCents ?? "no limit"}: flat ${band.flatCents}`; }
  if (best.minCents != null && fee < best.minCents) { fee = best.minCents; how += `, raised to minimum ${best.minCents}`; }
  if (best.maxCents != null && fee > best.maxCents) { fee = best.maxCents; how += `, capped at maximum ${best.maxCents}`; }
  if (fee > ctx.amountCents && ctx.amountCents >= 0 && best.payer !== "platform") { fee = ctx.amountCents; how += `, limited to the amount (${ctx.amountCents})`; }
  return { feeCents: fee, ruleId: best.id, waived: false, bearer: best.payer ?? "payer", calculation: how };
}

/** The AFC tap split in minor units, from a country's AFC settings. The platform's flat fee comes off the fare first; the investor's share is a
 *  percentage of that fee (never of the fare); the owner side gets the rest. A fare smaller than the fee yields only a reduced fee. */
export interface AfcSplit { fareCents: number; feeDeviceCents: number; feeCardCents: number; feeCents: number; investorCents: number; remainderCents: number; feeExceedsFare: boolean }
export function splitAfcFare(afc: CountryConfig["afc"], fareCents: number): AfcSplit {
  if (!Number.isInteger(fareCents) || fareCents < 0) throw new Error("fareCents must be a non-negative whole number");
  const { flatCents, deviceShareCents } = afc.platformFee;
  if (fareCents < flatCents) {
    const device = Math.round(fareCents * (deviceShareCents / flatCents));
    return { fareCents, feeDeviceCents: device, feeCardCents: fareCents - device, feeCents: fareCents, investorCents: 0, remainderCents: 0, feeExceedsFare: true };
  }
  return {
    fareCents, feeDeviceCents: deviceShareCents, feeCardCents: afc.platformFee.cardShareCents, feeCents: flatCents,
    investorCents: Math.round(flatCents * afc.investorPctOfFee), remainderCents: fareCents - flatCents, feeExceedsFare: false,
  };
}

/** Whether a contactless tap without a PIN is allowed: under the per-tap limit, under the daily total, and not too many in a row. */
export interface NoPinState { todayNoPinCents: number; consecutiveNoPin: number }
export function checkNoPin(afc: CountryConfig["afc"], amountCents: number, state: NoPinState): { ok: true } | { ok: false; code: "pin_required" | "no_pin_daily_limit" | "no_pin_consecutive_limit"; message: string } {
  if (amountCents >= afc.noPinBelowCents) return { ok: false, code: "pin_required", message: "A PIN is required for this amount." };
  if (state.todayNoPinCents + amountCents > afc.noPinDailyCumulativeCents) return { ok: false, code: "no_pin_daily_limit", message: "The daily limit for taps without a PIN is reached. A PIN is required." };
  if (state.consecutiveNoPin >= afc.noPinConsecutiveTaps) return { ok: false, code: "no_pin_consecutive_limit", message: "Too many taps in a row without a PIN. A PIN is required." };
  return { ok: true };
}
