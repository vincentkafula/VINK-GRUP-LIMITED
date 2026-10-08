import crypto from "crypto";
import type { CardVaultProvider, CardPayoutProvider, PayoutCard, PayoutResult } from "./types.js";

/**
 * The bundled sandbox card rail: tokenises a test card and "pays" it, with no network. It behaves the way a real push-to-card service looks from our side
 * (a reference that cannot pay twice, a decline, a provider that is down for a moment) so every path of the payout code can be exercised.
 *
 * It only ever sees sandbox TEST card numbers (the caller refuses anything else). The token it returns is a one-way hash, so the number cannot be recovered
 * from it, and it names the scenario the test card stands for.
 */
export type MockScenario = "ok" | "declined" | "error" | "credit" | "prepaid";

/** Widely published scheme/test numbers and what the mock does with each. Not real cards. */
export const MOCK_CARD_SCENARIOS: { pan: string; brand: "visa" | "mastercard"; scenario: MockScenario; label: string }[] = [
  { pan: "4111111111111111", brand: "visa", scenario: "ok", label: "Visa debit: payout succeeds" },
  { pan: "4000056655665556", brand: "visa", scenario: "ok", label: "Visa debit: payout succeeds" },
  { pan: "5555555555554444", brand: "mastercard", scenario: "ok", label: "Mastercard debit: payout succeeds" },
  { pan: "5200828282828210", brand: "mastercard", scenario: "ok", label: "Mastercard debit: payout succeeds" },
  { pan: "4000000000000002", brand: "visa", scenario: "declined", label: "Visa debit: the payout is declined" },
  { pan: "4000000000000119", brand: "visa", scenario: "error", label: "Visa debit: the provider fails twice, then the payout succeeds" },
  { pan: "4242424242424242", brand: "visa", scenario: "credit", label: "Visa CREDIT card: refused, a payout needs a debit card" },
  { pan: "5105105105105100", brand: "mastercard", scenario: "prepaid", label: "Mastercard PREPAID card: refused, a payout needs a debit card" },
];

export const luhnValid = (pan: string): boolean => {
  if (!/^[0-9]{13,19}$/.test(pan)) return false;
  let sum = 0;
  for (let i = pan.length - 1, dbl = false; i >= 0; i--, dbl = !dbl) { let d = Number(pan[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
};
export const brandOf = (pan: string): "visa" | "mastercard" | null =>
  pan.startsWith("4") ? "visa" : /^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(pan) ? "mastercard" : null;

/** YYYY-MM -> MM/YY, or null when it is not a valid month or the card has expired. */
export function expiryOf(yyyymm: string, now = new Date()): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yyyymm);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  if (y < now.getUTCFullYear() || (y === now.getUTCFullYear() && mo < now.getUTCMonth() + 1) || y > now.getUTCFullYear() + 20) return null;
  return `${m[2]}/${String(y % 100).padStart(2, "0")}`;
}

const hash = (s: string) => crypto.createHash("sha256").update("vink-sandbox-card:" + s).digest("hex").slice(0, 24);

export class MockCardRail implements CardVaultProvider, CardPayoutProvider {
  readonly name = "mock";
  private sent = new Map<string, string>();
  private failures = new Map<string, number>();

  async tokenise(input: { primaryAccountNumber: string; expiry: string; cardholderName: string }): Promise<PayoutCard> {
    const pan = input.primaryAccountNumber;
    const brand = brandOf(pan);
    if (!luhnValid(pan) || !brand) throw new Error("That is not a valid Visa or Mastercard number");
    const expiry = expiryOf(input.expiry);
    if (!expiry) throw new Error("The card has expired or the expiry date is not valid");
    const scenario: MockScenario = MOCK_CARD_SCENARIOS.find((c) => c.pan === pan)?.scenario ?? "ok";
    return { token: `mock:${scenario}:${hash(pan)}`, last4: pan.slice(-4), brand, expiry, funding: scenario === "credit" ? "credit" : scenario === "prepaid" ? "prepaid" : "debit" };
  }

  async push(i: { reference: string; card: { token: string; brand: "visa" | "mastercard" }; amount: { amount: number; currency: string }; recipientName: string; narrative: string }): Promise<PayoutResult> {
    const [, scenario] = i.card.token.split(":");
    if (!i.card.token.startsWith("mock:")) return { status: "declined", reason: "This card was not registered with the sandbox card rail" };
    if (this.sent.has(i.reference)) return { status: "sent", providerRef: this.sent.get(i.reference) };                  // the same reference never pays twice
    if (scenario === "declined") return { status: "declined", reason: "The card issuer declined the payment (sandbox)" };
    if (scenario === "error") {
      const n = (this.failures.get(i.reference) ?? 0) + 1;
      this.failures.set(i.reference, n);
      if (n <= 2) return { status: "error", reason: "The card service is not available right now (sandbox)" };
    }
    const providerRef = "mock_po_" + hash(i.reference).slice(0, 12);
    this.sent.set(i.reference, providerRef);
    return { status: "sent", providerRef };
  }
}
