import { describe, it, expect } from "vitest";
import { VisaDpsServicing, xPayAuthenticator } from "./visaDps.js";

/**
 * Hits the REAL Visa sandbox. Skipped unless these are set (never run in normal CI):
 *   SANDBOX_VISA_API_KEY, SANDBOX_VISA_SHARED_SECRET, SANDBOX_VISA_TEST_PAN (a test card number from Visa's sandbox docs)
 * Run with:  npx vitest run src/payments/providers/visaDps.sandbox.test.ts
 *
 * If this fails with 401/403 the authentication scheme is the first thing to check: the exported API spec does not
 * state it, and X-Pay is assumed (see visaDps.ts).
 */
const key = process.env.SANDBOX_VISA_API_KEY, secret = process.env.SANDBOX_VISA_SHARED_SECRET, pan = process.env.SANDBOX_VISA_TEST_PAN;

describe.skipIf(!key || !secret || !pan)("Visa DPS sandbox (real network)", () => {
  const dps = () => new VisaDpsServicing({
    baseUrl: process.env.SANDBOX_VISA_BASE_URL ?? "https://sandbox.api.visa.com",
    programType: (process.env.SANDBOX_VISA_PROGRAM_TYPE as "debit" | "prepaid") ?? "debit",
    authenticate: xPayAuthenticator(key!, secret!),
  });

  it("registers a test card and reads its details and status", async () => {
    const p = dps();
    const { cardId } = await p.registerCard({ primaryAccountNumber: pan! });
    expect(cardId).toMatch(/^[a-zA-Z0-9-]{1,40}$/);
    const details = await p.getCardDetails(cardId);
    expect(details.cardId).toBeTruthy();
    expect(JSON.stringify(details)).not.toContain(pan!);
    const status = await p.getCardStatus(cardId);
    expect(status).toBeTruthy();
  }, 60_000);
});
