import { describe, it, expect } from "vitest";
import { computeFee, splitAfcFare, checkNoPin } from "./feeEngine.js";
import { DEFAULT_ZA, DEFAULT_ZM, type FeeRule } from "./countryConfig.js";
import { calculateRevenueSplit } from "../services/revenueSplitService.js";

const R = DEFAULT_ZA.fees.rules;

describe("computeFee", () => {
  it("flat, percentage-plus-flat (half-up rounding) and tiered fees", () => {
    expect(computeFee(R, { txn: "afc_tap", amountCents: 1500 })).toMatchObject({ feeCents: 100, ruleId: "afc_tap" });
    expect(computeFee(R, { txn: "card_pos", amountCents: 10000 })).toMatchObject({ feeCents: 250 });             // 2.5%
    expect(computeFee(R, { txn: "card_pos", amountCents: 1010 }).feeCents).toBe(25);                              // 25.25 -> 25
    expect(computeFee(R, { txn: "card_pos", amountCents: 1020 }).feeCents).toBe(26);                              // 25.5 -> 26 (half up)
    expect(computeFee(R, { txn: "card_online", amountCents: 10000 }).feeCents).toBe(390);                         // 2.9% + R1.00
    expect(computeFee(R, { txn: "transfer_out", amountCents: 30000 }).feeCents).toBe(500);                        // first band
    expect(computeFee(R, { txn: "transfer_out", amountCents: 50000 }).feeCents).toBe(500);                        // the band limit is inclusive
    expect(computeFee(R, { txn: "transfer_out", amountCents: 50001 }).feeCents).toBe(850);                        // next band
  });

  it("no matching rule means no fee, and says so", () => {
    expect(computeFee(R, { txn: "unknown_thing", amountCents: 1000 })).toMatchObject({ feeCents: 0, ruleId: null });
  });

  it("the most specific rule wins, so a tier or user type can have its own fee or a waiver", () => {
    const rules: FeeRule[] = [
      { id: "payout", appliesTo: { txn: "payout" }, calc: { type: "flat", amountCents: 850 } },
      { id: "payout_assoc", appliesTo: { txn: "payout", payerType: "association" }, calc: { type: "flat", amountCents: 0 }, waive: true },
      { id: "payout_basic", appliesTo: { txn: "payout", tier: "basic" }, calc: { type: "flat", amountCents: 500 } },
      { id: "payout_assoc_basic", appliesTo: { txn: "payout", payerType: "association", tier: "basic" }, calc: { type: "flat", amountCents: 100 } },
    ];
    expect(computeFee(rules, { txn: "payout", amountCents: 9999 }).ruleId).toBe("payout");
    expect(computeFee(rules, { txn: "payout", amountCents: 9999, tier: "basic" }).feeCents).toBe(500);
    expect(computeFee(rules, { txn: "payout", amountCents: 9999, payerType: "association" })).toMatchObject({ feeCents: 0, waived: true });
    expect(computeFee(rules, { txn: "payout", amountCents: 9999, payerType: "association", tier: "basic" }).ruleId).toBe("payout_assoc_basic");   // two keys beat one
    expect(computeFee(rules, { txn: "payout", amountCents: 9999, payerType: "driver" }).ruleId).toBe("payout");
  });

  it("minimum and maximum are applied, and a fee never exceeds the amount it is charged on", () => {
    const rules: FeeRule[] = [{ id: "pct", appliesTo: { txn: "t" }, calc: { type: "percent_plus_flat", pct: 0.1, flatCents: 0 }, minCents: 100, maxCents: 1000 }];
    expect(computeFee(rules, { txn: "t", amountCents: 100 }).feeCents).toBe(100);                    // min 100 (but see below)
    expect(computeFee(rules, { txn: "t", amountCents: 50 }).feeCents).toBe(50);                      // limited to the amount
    expect(computeFee(rules, { txn: "t", amountCents: 1_000_000 })).toMatchObject({ feeCents: 1000 });
    expect(computeFee(rules, { txn: "t", amountCents: 1_000_000 }).calculation).toMatch(/capped at maximum/);
  });

  it("rejects bad amounts", () => { expect(() => computeFee(R, { txn: "afc_tap", amountCents: -1 })).toThrow(); expect(() => computeFee(R, { txn: "afc_tap", amountCents: 1.5 })).toThrow(); });
  it("Zambia uses the same engine with its own rules", () => { expect(computeFee(DEFAULT_ZM.fees.rules, { txn: "afc_tap", amountCents: 1500 }).feeCents).toBe(100); });
});

describe("splitAfcFare", () => {
  it("takes the flat fee first; the investor gets a share of the FEE, not the fare; the owner side gets the rest", () => {
    expect(splitAfcFare(DEFAULT_ZA.afc, 1500)).toEqual({ fareCents: 1500, feeDeviceCents: 50, feeCardCents: 50, feeCents: 100, investorCents: 10, remainderCents: 1400, feeExceedsFare: false });
  });
  it("a fare below the fee only pays a reduced fee, and nobody else gets anything", () => {
    expect(splitAfcFare(DEFAULT_ZA.afc, 60)).toEqual({ fareCents: 60, feeDeviceCents: 30, feeCardCents: 30, feeCents: 60, investorCents: 0, remainderCents: 0, feeExceedsFare: true });
  });
  it("always adds up exactly (no cent lost or invented)", () => {
    for (const fare of [0, 1, 99, 100, 101, 1234, 99999]) { const s = splitAfcFare(DEFAULT_ZA.afc, fare); expect(s.feeCents + s.remainderCents).toBe(fare); expect(s.feeDeviceCents + s.feeCardCents).toBe(s.feeCents); }
  });
  it("matches the platform's long-standing calculation (the numbers terminals already record), and follows a different profile when configured", () => {
    for (const rands of [0.5, 1, 15, 20.5, 123.45]) {
      const old = calculateRevenueSplit(rands), s = splitAfcFare(DEFAULT_ZA.afc, Math.round(rands * 100));
      expect(s.remainderCents / 100).toBe(old.ownerSettlement); expect(s.investorCents / 100).toBe(old.investorShare); expect(s.feeCents / 100).toBe(old.vinkFeeTotal);
    }
    const custom = { ...DEFAULT_ZA.afc, platformFee: { flatCents: 200, deviceShareCents: 120, cardShareCents: 80 }, investorPctOfFee: 0.25 };
    expect(splitAfcFare(custom, 1500)).toMatchObject({ feeCents: 200, investorCents: 50, remainderCents: 1300 });
    const viaOld = calculateRevenueSplit(15, custom);
    expect(viaOld).toMatchObject({ vinkFeeTotal: 2, investorShare: 0.5, ownerSettlement: 13 });
  });
});

describe("no-PIN limits", () => {
  const afc = DEFAULT_ZA.afc;     // below R40 per tap, R120 a day, 5 in a row
  const idle = { todayNoPinCents: 0, consecutiveNoPin: 0 };
  it("allows a small tap, and refuses R40 or more (the limit is 'below R40')", () => {
    expect(checkNoPin(afc, 3999, idle)).toEqual({ ok: true });
    expect(checkNoPin(afc, 4000, idle)).toMatchObject({ ok: false, code: "pin_required" });
  });
  it("refuses once the day's total or the run of taps would be exceeded", () => {
    expect(checkNoPin(afc, 3000, { todayNoPinCents: 9000, consecutiveNoPin: 0 })).toEqual({ ok: true });         // exactly R120
    expect(checkNoPin(afc, 3001, { todayNoPinCents: 9000, consecutiveNoPin: 0 })).toMatchObject({ ok: false, code: "no_pin_daily_limit" });
    expect(checkNoPin(afc, 1000, { todayNoPinCents: 0, consecutiveNoPin: 5 })).toMatchObject({ ok: false, code: "no_pin_consecutive_limit" });
  });
  it("Zambia's own limit applies", () => { expect(checkNoPin(DEFAULT_ZM.afc, 4999, idle)).toEqual({ ok: true }); expect(checkNoPin(DEFAULT_ZM.afc, 5000, idle)).toMatchObject({ ok: false }); });
});
