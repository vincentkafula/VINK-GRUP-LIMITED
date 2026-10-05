import { checkTierLimit } from "./riskRules.js";
import type { CountryConfig, KycTier } from "./countryConfig.js";

/**
 * The hook the Banking module (VINK) calls before it sends money to another bank. It applies the ACTIVE South African profile's daily limit for the
 * customer's verification level, but only when the profile switches enforcement on (limits.enforce). Off, the Banking module's own flat limits are the
 * only limits, exactly as before. It answers with a sentence for the customer, or null when the payment may go ahead.
 *
 * Banking-module customers are "verified" or not; that maps to the standard and basic levels (there is no stronger identity check in that module yet).
 * The hook is synchronous (the Banking module runs it inside a database transaction), so it reads a cached copy of the profile.
 */
export interface GuardInput { merchantId: string; verified: boolean; channel: "transfer_out" | "atm" | "pos" | "online"; amount: number; usedToday: number }
export function createLimitGuard(getConfig: () => CountryConfig | null): (g: GuardInput) => string | null {
  return (g) => {
    const cfg = getConfig();
    if (!cfg || !cfg.limits.enforce) return null;
    const tier: KycTier = g.verified ? "standard" : "basic";
    const v = checkTierLimit(cfg, tier, { channel: g.channel, amountCents: g.amount, usedTodayCents: g.usedToday, balanceCents: 0 });
    return v.ok ? null : `${v.message} Your daily limit is R ${(v.limitCents / 100).toFixed(2)}.`;
  };
}
