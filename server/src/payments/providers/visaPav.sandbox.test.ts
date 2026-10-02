import { describe, it, expect } from "vitest";
import { resolvePaymentsConfig } from "../config.js";
import { getAccountValidationProvider } from "./registry.js";

/**
 * Hits the REAL Visa sandbox. Skipped unless set (never run in normal CI): the same authentication variables as visaDps.sandbox.test.ts, plus
 *   SANDBOX_VISA_ACQUIRING_BIN, SANDBOX_VISA_ACQUIRER_COUNTRY, SANDBOX_VISA_ACCEPTOR_ID_CODE, SANDBOX_VISA_TEST_PAN, SANDBOX_VISA_TEST_EXPIRY (YYYY-MM)
 * Use Visa's documented sandbox test values. Run: npx vitest run src/payments/providers/visaPav.sandbox.test.ts
 */
const e = process.env;
const authReady = e.SANDBOX_VISA_API_KEY && (e.SANDBOX_VISA_SHARED_SECRET || (e.SANDBOX_VISA_CLIENT_CERT && e.SANDBOX_VISA_CLIENT_KEY));
const ready = authReady && e.SANDBOX_VISA_ACQUIRING_BIN && e.SANDBOX_VISA_ACQUIRER_COUNTRY && e.SANDBOX_VISA_ACCEPTOR_ID_CODE && e.SANDBOX_VISA_TEST_PAN && e.SANDBOX_VISA_TEST_EXPIRY;

describe.skipIf(!ready)("Visa PAV sandbox (real network)", () => {
  it("returns an action code for a test card", async () => {
    const v = getAccountValidationProvider(resolvePaymentsConfig({ ...e, ACCOUNT_VALIDATION_PROVIDER: "visa_pav" }));
    const r = await v.validate({ primaryAccountNumber: e.SANDBOX_VISA_TEST_PAN!, expiry: e.SANDBOX_VISA_TEST_EXPIRY! });
    expect(r.actionCode).toMatch(/^[0-9A-Z]{2}$/);
    expect(JSON.stringify(r)).not.toContain(e.SANDBOX_VISA_TEST_PAN!);
  }, 60_000);
});
