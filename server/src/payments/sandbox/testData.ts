/**
 * Sandbox test data. Only ever used when PAYMENTS_MODE=sandbox.
 *
 * Two kinds of data live here:
 *  1. Scenario tokens/amounts that the BUNDLED MOCKS understand.
 *  2. Widely published generic scheme test numbers, useful for form testing. They are not real cards. When a real
 *     provider's sandbox is connected, use THAT provider's official test cards instead (each provider publishes
 *     its own list and behaviour); add them here with the provider name and a link to its docs.
 */

export interface TestCard { label: string; pan: string; brand: "visa" | "mastercard"; expiry: string; cvv: string; scenario: string }

export const GENERIC_TEST_CARDS: TestCard[] = [
  { label: "Visa", pan: "4111111111111111", brand: "visa", expiry: "12/34", cvv: "123", scenario: "generic scheme test number" },
  { label: "Mastercard", pan: "5555555555554444", brand: "mastercard", expiry: "12/34", cvv: "123", scenario: "generic scheme test number" },
];

/** Behaviour of the bundled mock gateway and issuer. */
export const MOCK_SCENARIOS = {
  gateway: {
    success: { paymentToken: "tok_visa", outcome: "paid" },
    decline: { paymentToken: "tok_decline", outcome: "failed (card_declined)" },
    eftRedirect: { method: "eft", outcome: "pending, redirect to bank" },
  },
  issuer: {
    approve: { amountCents: 10000, outcome: "approved" },
    insufficientFunds: { amountCents: 55500, outcome: "declined (insufficient_funds)" },
    fraud: { amountCents: 66600, outcome: "declined (suspected_fraud)" },
    frozenCard: { setup: "freeze the card first", outcome: "declined (card_frozen)" },
  },
  /** Not simulated: needs a real provider's sandbox. Listed so nothing is assumed to be covered. */
  notSimulated: ["3-D Secure challenge", "3-D Secure failure", "network timeout", "AVS / CVV mismatch"],
} as const;

export const TEST_BANK_ACCOUNTS = [
  { bank: "Sandbox Bank", accountNumber: "1234567890", branchCode: "000001", note: "any 10-digit number is accepted by the mock rail" },
];
