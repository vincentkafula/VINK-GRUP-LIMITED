/**
 * Multi-party revenue split for AFC terminal taps -- confirmed directly
 * with the business (2026-08-18), corrected from an earlier, wrong
 * version of this same file that used percentage splits of the fare
 * for driver/owner/investor. That version is wrong and this replaces
 * it entirely, not just adjusts it:
 *
 * 1. VINK takes a flat R1.00 fee off every tap, tracked as two named
 *    halves because the business wants to report on them separately:
 *    R0.50 "device side" + R0.50 "card side".
 * 2. The driver's pay is NOT a percentage of anything in this system.
 *    It's a fixed amount privately agreed between the driver and the
 *    owner -- VINK's per-tap split calculation has nothing to do with
 *    it, and does not touch it at all. There is deliberately no
 *    driverShare in this calculation's output.
 * 3. The investor's per-tap income is 10% of VINK's own R1.00 fee
 *    specifically (R0.10/tap) -- not 10% of the fare, not 10% of what's
 *    left after VINK's fee. This matches
 *    InvestorFleetDashboardViewer.tsx's original figure, which was
 *    correct all along; the earlier version of this file's "10% of the
 *    remainder" was the error.
 * 4. The investor also receives a separate monthly fixed amount paid
 *    by the vehicle owner (device rental) -- this is NOT a per-tap
 *    amount and does not appear in this function's output at all; it's
 *    a recurring, separate billing relationship this file has nothing
 *    to do with.
 * 5. The owner receives everything left after VINK's fee and the
 *    investor's 10%-of-fee slice. The owner then privately pays the
 *    driver's fixed wage and the investor's monthly rental out of that
 *    -- both are the owner's own downstream obligations, not something
 *    VINK's per-tap split calculates or enforces.
 *
 * Association fees remain a separate flat monthly charge based on
 * vehicle count, unrelated to this per-tap calculation, unchanged from
 * before this correction.
 *
 * Deliberately a pure function with no I/O -- easy to verify in
 * isolation.
 */

const VINK_FEE_DEVICE = 0.5;
const VINK_FEE_CARD = 0.5;
const VINK_FEE_TOTAL = VINK_FEE_DEVICE + VINK_FEE_CARD; // 1.00

const INVESTOR_SHARE_OF_VINK_FEE_PCT = 0.10; // of VINK's R1.00 fee specifically -- R0.10/tap

export interface RevenueSplit {
  fareAmount: number;
  vinkFeeDevice: number;
  vinkFeeCard: number;
  vinkFeeTotal: number;
  /** 10% of vinkFeeTotal -- the investor's only per-tap income. Their
   *  monthly device rental from the owner is a separate concept this
   *  function does not calculate. */
  investorShare: number;
  /** Everything left after VINK's flat fee only -- the investor's
   *  R0.10 is carved out from within that fee, not an additional
   *  deduction, so the owner never loses more than VINK's R1.00. The
   *  owner's own arrangements with the driver (fixed wage) and the
   *  investor (monthly rental) come out of this afterward, outside
   *  this calculation. */
  ownerSettlement: number;
  /** True when the fare was too small to cover VINK's flat fee -- the
   *  caller should treat this as worth flagging, not silently accept a
   *  tap that pays out negative or zero amounts to anyone. */
  feeExceedsFare: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateRevenueSplit(fareAmount: number): RevenueSplit {
  if (typeof fareAmount !== "number" || !isFinite(fareAmount) || fareAmount < 0) {
    throw new Error(`calculateRevenueSplit: fareAmount must be a non-negative finite number, got ${fareAmount}`);
  }

  const feeExceedsFare = fareAmount < VINK_FEE_TOTAL;

  // When the fare can't even cover VINK's flat fee, don't produce a
  // negative owner settlement -- clamp VINK's own take to what's
  // actually available (split proportionally across the two named
  // halves), and there's nothing left for the investor's slice or the
  // owner. A genuine edge case (a fare below R1.00) the caller should
  // see clearly via feeExceedsFare, not one this function should
  // silently paper over with negative numbers.
  if (feeExceedsFare) {
    const vinkFeeDevice = round2(fareAmount * (VINK_FEE_DEVICE / VINK_FEE_TOTAL));
    const vinkFeeCard = round2(fareAmount - vinkFeeDevice);
    return {
      fareAmount: round2(fareAmount),
      vinkFeeDevice,
      vinkFeeCard,
      vinkFeeTotal: round2(vinkFeeDevice + vinkFeeCard),
      investorShare: 0,
      ownerSettlement: 0,
      feeExceedsFare: true,
    };
  }

  const investorShare = round2(VINK_FEE_TOTAL * INVESTOR_SHARE_OF_VINK_FEE_PCT);
  // Owner loses only VINK's flat fee -- never fee-plus-investor-share.
  // The investor's R0.10 is carved out from WITHIN VINK's own R1.00
  // fee (VINK nets R0.90 after paying it), not an additional deduction
  // on top of that fee. An earlier draft of this fix subtracted
  // investorShare a second time here, which would have made the owner
  // lose R1.10 instead of R1.00 -- caught and fixed before this
  // shipped, verified against Vincent's own wording ("10% of
  // transaction fee of vink system" -- of VINK's fee, not of the fare
  // on top of VINK's fee).
  const ownerSettlement = round2(fareAmount - VINK_FEE_TOTAL);

  return {
    fareAmount: round2(fareAmount),
    vinkFeeDevice: VINK_FEE_DEVICE,
    vinkFeeCard: VINK_FEE_CARD,
    vinkFeeTotal: VINK_FEE_TOTAL,
    investorShare,
    ownerSettlement,
    feeExceedsFare: false,
  };
}
