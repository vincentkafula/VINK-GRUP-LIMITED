import { describe, it, expect } from "vitest";
import { VisaPavValidation } from "./visaPav.js";
import { xPayAuthenticator } from "./visaHttp.js";

/**
 * Hits the REAL Visa sandbox. Skipped unless all of these are set (never run in normal CI):
 *   SANDBOX_VISA_API_KEY, SANDBOX_VISA_SHARED_SECRET, SANDBOX_VISA_ACQUIRING_BIN, SANDBOX_VISA_ACQUIRER_COUNTRY,
 *   SANDBOX_VISA_ACCEPTOR_ID_CODE, SANDBOX_VISA_TEST_PAN, SANDBOX_VISA_TEST_EXPIRY (YYYY-MM)
 * Use Visa's documented sandbox test values. Run: npx vitest run src/payments/providers/visaPav.sandbox.test.ts
 * A 401/403 points at the authentication scheme (unverified X-Pay default).
 */
const e = process.env;
const ready = e.SANDBOX_VISA_API_KEY && e.SANDBOX_VISA_SHARED_SECRET && e.SANDBOX_VISA_ACQUIRING_BIN && e.SANDBOX_VISA_ACQUIRER_COUNTRY
  && e.SANDBOX_VISA_ACCEPTOR_ID_CODE && e.SANDBOX_VISA_TEST_PAN && e.SANDBOX_VISA_TEST_EXPIRY;

describe.skipIf(!ready)("Visa PAV sandbox (real network)", () => {
  it("returns an action code for a test card", async () => {
    const v = new VisaPavValidation({
      baseUrl: e.SANDBOX_VISA_BASE_URL ?? "https://sandbox.api.visa.com", authenticate: xPayAuthenticator(e.SANDBOX_VISA_API_KEY!, e.SANDBOX_VISA_SHARED_SECRET!),
      acquiringBin: e.SANDBOX_VISA_ACQUIRING_BIN!, acquirerCountryCode: e.SANDBOX_VISA_ACQUIRER_COUNTRY!,
      cardAcceptor: { name: "MANSHYA", idCode: e.SANDBOX_VISA_ACCEPTOR_ID_CODE!, terminalId: "00000001" },
    });
    const r = await v.validate({ primaryAccountNumber: e.SANDBOX_VISA_TEST_PAN!, expiry: e.SANDBOX_VISA_TEST_EXPIRY! });
    expect(r.actionCode).toMatch(/^[0-9A-Z]{2}$/);
    expect(JSON.stringify(r)).not.toContain(e.SANDBOX_VISA_TEST_PAN!);
  }, 60_000);
});
