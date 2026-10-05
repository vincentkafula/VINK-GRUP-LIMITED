/**
 * Retail POS revenue split -- confirmed model (2026-08-18): VINK takes
 * 2.5% of every transaction, the merchant gets the rest. Genuinely
 * different calculation from revenueSplitService.ts's flat-R1.00 taxi
 * model, not a copy of it -- a percentage fee can never exceed the
 * transaction amount, so there's no "fee exceeds fare" edge case to
 * handle here the way the flat-fee model needs.
 *
 * Deliberately a pure function with no I/O, same discipline as
 * revenueSplitService.ts, easy to verify in isolation.
 */

const VINK_FEE_PCT = 0.025; // 2.5%

export interface RetailRevenueSplit {
  amount: number;
  vinkFeePct: number;
  vinkFeeAmount: number;
  merchantSettlement: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateRetailSplit(amount: number): RetailRevenueSplit {
  if (typeof amount !== "number" || !isFinite(amount) || amount < 0) {
    throw new Error(`calculateRetailSplit: amount must be a non-negative finite number, got ${amount}`);
  }

  const vinkFeeAmount = round2(amount * VINK_FEE_PCT);
  // Merchant gets amount minus the already-rounded fee (not an
  // independently-rounded percentage of amount), so the two numbers
  // always reconcile exactly to the original amount with no rounding
  // gap -- same discipline revenueSplitService.ts uses for its own
  // investor/owner split.
  const merchantSettlement = round2(amount - vinkFeeAmount);

  return {
    amount: round2(amount),
    vinkFeePct: VINK_FEE_PCT * 100, // stored/returned as 2.5, not 0.025, for readability in the DB and API responses
    vinkFeeAmount,
    merchantSettlement,
  };
}
