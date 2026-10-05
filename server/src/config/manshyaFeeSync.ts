import type { CountryConfig } from "./countryConfig.js";

/**
 * Keeps the Banking module's (VINK) fee settings in line with the ACTIVE South African profile, so the fees a customer is charged are the
 * ones the profile says. Only what VINK can express is copied: card-online and card-POS as "percentage + fixed", and the payout fee.
 * A rule that is missing, waived, or of another shape leaves VINK's own value alone. Returns what was changed (for the log and the tests).
 */
export interface ManshyaConfigHandle { fees: { online: { pct: number; fixed: number }; pos: { pct: number; fixed: number } }; payoutFee: number }

export function syncManshyaFees(target: ManshyaConfigHandle, cfg: CountryConfig): string[] {
  const changed: string[] = [];
  const rule = (txn: string) => cfg.fees.rules.find((r) => r.appliesTo.txn === txn && !r.appliesTo.payerType && !r.appliesTo.payeeType && !r.appliesTo.rail && (!r.appliesTo.tier || r.appliesTo.tier === "*"));
  for (const [key, txn] of [["online", "card_online"], ["pos", "card_pos"]] as const) {
    const r = rule(txn);
    if (!r || r.waive || r.calc.type !== "percent_plus_flat") continue;
    if (target.fees[key].pct !== r.calc.pct || target.fees[key].fixed !== r.calc.flatCents) { target.fees[key] = { pct: r.calc.pct, fixed: r.calc.flatCents }; changed.push(`fees.${key}`); }
  }
  const p = rule("payout");
  if (p && !p.waive && p.calc.type === "flat" && target.payoutFee !== p.calc.amountCents) { target.payoutFee = p.calc.amountCents; changed.push("payoutFee"); }
  return changed;
}
