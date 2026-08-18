/**
 * Multi-party revenue split for AFC terminal taps -- confirmed directly
 * with the business (2026-08-18), not assumed or invented:
 *
 * 1. VINK takes a flat R1.00 fee off every tap, tracked as two named
 *    halves rather than one number, because the business wants to
 *    report on them separately: R0.50 attributed to the "device side"
 *    and R0.50 to the "card side".
 * 2. Whatever remains after that fee splits three ways: 75% to the
 *    driver, 15% to the owner, 10% to the investor. This is a
 *    deliberate reconciliation of two numbers that existed separately
 *    elsewhere in the codebase before this was confirmed --
 *    InvestorFleetDashboardViewer.tsx's own "R0.10/tap" investor
 *    figure and bankingStore.ts's mock "75/15/10 of the fare" split
 *    were NOT the same model until this was confirmed; this file is
 *    the one real, backend implementation going forward.
 *
 * Deliberately a pure function with no I/O -- easy to test in
 * isolation, and the caller (terminalRouter.ts) decides what to do
 * with a fare too small to cover VINK's fee, rather than this function
 * making that judgment call silently.
 */

const VINK_FEE_DEVICE = 0.5;
const VINK_FEE_CARD = 0.5;
const VINK_FEE_TOTAL = VINK_FEE_DEVICE + VINK_FEE_CARD; // 1.00

const DRIVER_SHARE_PCT = 0.75;
const OWNER_SHARE_PCT = 0.15;
const INVESTOR_SHARE_PCT = 0.10;

export interface RevenueSplit {
  fareAmount: number;
  vinkFeeDevice: number;
  vinkFeeCard: number;
  vinkFeeTotal: number;
  remainder: number;
  driverShare: number;
  ownerShare: number;
  investorShare: number;
  /** True when the fare was too small to cover VINK's flat fee -- the
   *  caller should treat this as worth flagging, not silently accept a
   *  tap that pays out negative or zero shares to every party. */
  feeExceedsFare: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateRevenueSplit(fareAmount: number): RevenueSplit {
  if (typeof fareAmount !== "number" || !isFinite(fareAmount) || fareAmount < 0) {
    throw new Error(`calculateRevenueSplit: fareAmount must be a non-negative finite number, got ${fareAmount}`);
  }

  const feeExceedsFare = fareAmount < VINK_FEE_TOTAL;

  // When the fare can't even cover VINK's flat fee, don't produce
  // negative shares for anyone -- clamp VINK's own take to what's
  // actually available (split proportionally across the two named
  // halves) and leave nothing for driver/owner/investor. This is a
  // genuine edge case (a fare below R1.00) that the caller should
  // still see clearly via feeExceedsFare, not one this function should
  // silently paper over with negative numbers.
  if (feeExceedsFare) {
    const vinkFeeDevice = round2(fareAmount * (VINK_FEE_DEVICE / VINK_FEE_TOTAL));
    const vinkFeeCard = round2(fareAmount - vinkFeeDevice);
    return {
      fareAmount: round2(fareAmount),
      vinkFeeDevice,
      vinkFeeCard,
      vinkFeeTotal: round2(vinkFeeDevice + vinkFeeCard),
      remainder: 0,
      driverShare: 0,
      ownerShare: 0,
      investorShare: 0,
      feeExceedsFare: true,
    };
  }

  const remainder = round2(fareAmount - VINK_FEE_TOTAL);
  const driverShare = round2(remainder * DRIVER_SHARE_PCT);
  const ownerShare = round2(remainder * OWNER_SHARE_PCT);
  // Investor's share gets whatever rounding leaves over, so the three
  // shares always sum exactly to `remainder` -- rounding each
  // independently (0.75/0.15/0.10 of an arbitrary cent amount) can
  // otherwise leave the total a cent off in either direction.
  const investorShare = round2(remainder - driverShare - ownerShare);

  return {
    fareAmount: round2(fareAmount),
    vinkFeeDevice: VINK_FEE_DEVICE,
    vinkFeeCard: VINK_FEE_CARD,
    vinkFeeTotal: VINK_FEE_TOTAL,
    remainder,
    driverShare,
    ownerShare,
    investorShare,
    feeExceedsFare: false,
  };
}
