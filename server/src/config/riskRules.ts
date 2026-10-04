import type { CountryConfig, KycTier } from "./countryConfig.js";

/**
 * Rules from the country profile that decide whether money may move. All pure (no I/O) and in whole minor units, so the same function serves the
 * checks inside the platform and the "what would happen" tester on the admin page. Each answer says WHY, so a refusal can be explained to the customer.
 */
const channelTier = (t: KycTier): "basic" | "standard" | "full" => (t === "business" ? "full" : t);

export type LimitChannel = "transfer_in" | "transfer_out" | "atm" | "pos" | "online";
export type Verdict = { ok: true } | { ok: false; code: string; message: string; limitCents: number };

/** KYC-tier limits: balance and daily in/out per tier, and the daily cash-machine, card-present and online limits. Business accounts use the highest consumer tier for the card channels. */
export function checkTierLimit(cfg: CountryConfig, tier: KycTier, t: { channel: LimitChannel; amountCents: number; usedTodayCents: number; balanceCents: number }): Verdict {
  if (!Number.isInteger(t.amountCents) || t.amountCents <= 0) return { ok: false, code: "bad_amount", message: "The amount must be above zero.", limitCents: 0 };
  const l = cfg.limits, tl = l.tiers[tier];
  if (t.channel === "transfer_in") {
    if (t.usedTodayCents + t.amountCents > tl.dailyInCents) return { ok: false, code: "daily_in_limit", message: "This would go over the daily limit for money coming in.", limitCents: tl.dailyInCents };
    if (t.balanceCents + t.amountCents > tl.balanceCents) return { ok: false, code: "balance_limit", message: "This would take the account over the balance limit for its verification level.", limitCents: tl.balanceCents };
    return { ok: true };
  }
  const limit = t.channel === "transfer_out" ? tl.dailyOutCents : t.channel === "atm" ? l.atmDailyCents[channelTier(tier)] : t.channel === "pos" ? l.posDailyCents[channelTier(tier)] : l.onlineDailyCents[channelTier(tier)];
  if (t.usedTodayCents + t.amountCents > limit) return { ok: false, code: `daily_${t.channel}_limit`, message: "This would go over the daily limit for this kind of payment.", limitCents: limit };
  return { ok: true };
}

/**
 * Instant credit: a deposit is made available before it has cleared, only while the platform's reserve covers the risk.
 * Off by default. When on: the deposit must be within the per-deposit limit of the customer's tier, the reserve must be at least the configured
 * minimum, and all instant credit outstanding (including this one) may not exceed reserve x reserveRatioMax.
 */
export type InstantCreditVerdict = { ok: true; approvedCents: number } | { ok: false; code: "instant_credit_disabled" | "above_deposit_limit" | "reserve_below_minimum" | "reserve_ratio_exceeded"; message: string };
export function decideInstantCredit(cfg: CountryConfig, t: { tier: KycTier; depositCents: number; reserveBalanceCents: number; outstandingCents: number }): InstantCreditVerdict {
  const ic = cfg.instantCredit;
  if (!ic.enabled) return { ok: false, code: "instant_credit_disabled", message: "Instant credit is switched off. The deposit is available when it has cleared." };
  if (t.depositCents > ic.perDepositCents[channelTier(t.tier)]) return { ok: false, code: "above_deposit_limit", message: "This deposit is above the instant-credit limit for this account." };
  if (t.reserveBalanceCents < ic.reserveCents) return { ok: false, code: "reserve_below_minimum", message: "The instant-credit reserve is below its minimum, so deposits wait to clear." };
  if (t.outstandingCents + t.depositCents > t.reserveBalanceCents * ic.reserveRatioMax) return { ok: false, code: "reserve_ratio_exceeded", message: "Too much instant credit is outstanding for the reserve, so this deposit waits to clear." };
  return { ok: true, approvedCents: t.depositCents };
}

/**
 * Cross-border quote (ZA <-> ZM). The rate comes from the caller (there is no FX feed yet); the platform's margin is taken off it, a flat fee is
 * charged in the sending currency, and the quote is only good for a short time. Nothing is sent from here: this prices and checks the limits.
 */
export type Quote = { ok: true; sendCents: number; feeCents: number; offeredRate: number; receiveCents: number; expiresAt: string; corridor: string }
  | { ok: false; code: "corridor_closed" | "above_transaction_limit" | "above_daily_limit" | "above_monthly_limit" | "bad_rate" | "bad_amount"; message: string };
export function quoteCorridor(cfg: CountryConfig, t: { corridorId: string; amountCents: number; midRate: number; usedDayCents: number; usedMonthCents: number; now: Date }): Quote {
  const c = cfg.corridors.find((x) => x.id === t.corridorId);
  if (!c || !c.enabled) return { ok: false, code: "corridor_closed", message: "This route is not open." };
  if (!Number.isInteger(t.amountCents) || t.amountCents <= 0) return { ok: false, code: "bad_amount", message: "The amount must be above zero." };
  if (!(t.midRate > 0) || !Number.isFinite(t.midRate)) return { ok: false, code: "bad_rate", message: "There is no valid exchange rate." };
  if (t.amountCents > c.perTransactionCents) return { ok: false, code: "above_transaction_limit", message: "This is above the limit for one transfer." };
  if (t.usedDayCents + t.amountCents > c.perDayCents) return { ok: false, code: "above_daily_limit", message: "This would go over the daily limit for this route." };
  if (t.usedMonthCents + t.amountCents > c.perMonthCents) return { ok: false, code: "above_monthly_limit", message: "This would go over the monthly limit for this route." };
  const offeredRate = t.midRate * (1 - c.fxMarginPct);
  const net = Math.max(t.amountCents - c.feeFlatCents, 0);
  return { ok: true, sendCents: t.amountCents, feeCents: c.feeFlatCents, offeredRate, receiveCents: Math.floor(net * offeredRate), expiresAt: new Date(t.now.getTime() + c.quoteTtlSeconds * 1000).toISOString(), corridor: c.id };
}
