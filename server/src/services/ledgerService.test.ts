import { describe, it, expect } from "vitest";
import { validateEntries, LedgerError, type LedgerEntryInput } from "./ledgerService.js";

// These test the double-entry invariant in isolation, with no database
// involved -- the fastest, cheapest place to catch a bug in this logic,
// since a broken invariant here would mean every downstream postTransaction()
// call is untrustworthy regardless of how correct the SQL is.

describe("validateEntries", () => {
  it("accepts a balanced two-entry transfer", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: "acc-1", amountCents: -5000, currency: "ZAR" },
      { accountId: "acc-2", amountCents: 5000, currency: "ZAR" },
    ];
    expect(() => validateEntries(entries)).not.toThrow();
  });

  it("accepts a balanced multi-party split (e.g. a fee taken from a transfer)", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: "sender", amountCents: -10000, currency: "ZAR" },
      { accountId: "recipient", amountCents: 9950, currency: "ZAR" },
      { accountId: "fee-account", amountCents: 50, currency: "ZAR" },
    ];
    expect(() => validateEntries(entries)).not.toThrow();
  });

  it("accepts independently-balanced entries across two currencies in one transaction", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: "acc-1", amountCents: -1000, currency: "ZAR" },
      { accountId: "acc-2", amountCents: 1000, currency: "ZAR" },
      { accountId: "acc-3", amountCents: -500, currency: "USD" },
      { accountId: "acc-4", amountCents: 500, currency: "USD" },
    ];
    expect(() => validateEntries(entries)).not.toThrow();
  });

  it("rejects a single-entry transaction — double-entry requires at least 2", () => {
    const entries: LedgerEntryInput[] = [{ accountId: "acc-1", amountCents: 100, currency: "ZAR" }];
    expect(() => validateEntries(entries)).toThrow(LedgerError);
    expect(() => validateEntries(entries)).toThrow(/at least 2 entries/);
  });

  it("rejects an empty entry list", () => {
    expect(() => validateEntries([])).toThrow(LedgerError);
  });

  it("rejects entries that don't sum to zero — the core invariant", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: "acc-1", amountCents: -5000, currency: "ZAR" },
      { accountId: "acc-2", amountCents: 4900, currency: "ZAR" }, // 100 cents short
    ];
    expect(() => validateEntries(entries)).toThrow(/sum to -100, must sum to exactly 0/);
  });

  it("rejects mismatched currencies that individually don't balance, even if the grand total looks balanced", () => {
    // ZAR side is short by 100, USD side is over by 100 -- naively summing
    // everything together would look like zero, which is exactly the bug
    // this test guards against: currencies must each independently balance.
    const entries: LedgerEntryInput[] = [
      { accountId: "acc-1", amountCents: -5000, currency: "ZAR" },
      { accountId: "acc-2", amountCents: 4900, currency: "ZAR" },
      { accountId: "acc-3", amountCents: -100, currency: "USD" },
      { accountId: "acc-4", amountCents: 200, currency: "USD" },
    ];
    expect(() => validateEntries(entries)).toThrow(LedgerError);
  });

  it("rejects a zero-amount entry — a no-op entry is a bug, not a valid ledger line", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: "acc-1", amountCents: 0, currency: "ZAR" },
      { accountId: "acc-2", amountCents: 0, currency: "ZAR" },
    ];
    expect(() => validateEntries(entries)).toThrow(/non-zero integer/);
  });

  it("rejects a non-integer amount — floats are exactly the Phase 0 bug this design fixes", () => {
    const entries: LedgerEntryInput[] = [
      { accountId: "acc-1", amountCents: -50.5, currency: "ZAR" },
      { accountId: "acc-2", amountCents: 50.5, currency: "ZAR" },
    ];
    expect(() => validateEntries(entries)).toThrow(/non-zero integer/);
  });

  it("LedgerError carries a machine-checkable code, not just a message", () => {
    try {
      validateEntries([{ accountId: "acc-1", amountCents: 100, currency: "ZAR" }]);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(LedgerError);
      expect((e as LedgerError).code).toBe("VALIDATION");
    }
  });
});
