import { describe, it, expect } from "vitest";
import { resolvePaymentsConfig } from "../config.js";
import { getCardServicingProvider } from "./registry.js";

/**
 * Hits the REAL Visa sandbox. Skipped unless credentials are set (never run in normal CI). Put them in server/.env or your shell:
 *   SANDBOX_VISA_API_KEY plus EITHER SANDBOX_VISA_SHARED_SECRET (X-Pay)
 *   OR SANDBOX_VISA_AUTH=two_way_ssl with SANDBOX_VISA_CLIENT_CERT and SANDBOX_VISA_CLIENT_KEY (and SANDBOX_VISA_USER_ID/PASSWORD if the project has a user),
 *   and SANDBOX_VISA_TEST_PAN (a test card number from Visa's sandbox docs).
 * Run: npx vitest run src/payments/providers/visaDps.sandbox.test.ts
 * A 401/403 means the wrong authentication scheme for this product; try the other one.
 */
const e = process.env;
const authReady = e.SANDBOX_VISA_API_KEY && (e.SANDBOX_VISA_SHARED_SECRET || (e.SANDBOX_VISA_CLIENT_CERT && e.SANDBOX_VISA_CLIENT_KEY));

describe.skipIf(!authReady || !e.SANDBOX_VISA_TEST_PAN)("Visa DPS sandbox (real network)", () => {
  it("registers a test card and reads its details and status", async () => {
    const p = getCardServicingProvider(resolvePaymentsConfig({ ...e, CARD_SERVICING_PROVIDER: "visa_dps" }));
    const { cardId } = await p.registerCard({ primaryAccountNumber: e.SANDBOX_VISA_TEST_PAN! });
    expect(cardId).toMatch(/^[a-zA-Z0-9-]{1,40}$/);
    const details = await p.getCardDetails(cardId);
    expect(details.cardId).toBeTruthy();
    expect(JSON.stringify(details)).not.toContain(e.SANDBOX_VISA_TEST_PAN!);
    expect(await p.getCardStatus(cardId)).toBeTruthy();
  }, 60_000);
});
