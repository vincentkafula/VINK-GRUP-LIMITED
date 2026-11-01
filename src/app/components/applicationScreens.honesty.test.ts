import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * An application that has only been RECEIVED must say so. These screens used to tell applicants that an account was "opened" and "active", that a card was "approved and issued" and would
 * be delivered in 5–7 days, that a bonus was "credited", that their identity was "verified via fingerprint and selfie", and that "a confirmation email has been sent": none of it had happened
 * (the server records the application as "submitted" and sends no email). This scans every screen that submits an application for those claims, so they cannot come back.
 */
const dir = __dirname;
const screens = readdirSync(dir).filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f) && readFileSync(join(dir, f), "utf8").includes("applicationsApi.submit("));
const FALSE_CLAIMS: [RegExp, string][] = [
  [/Account Opened!|Account Created!|Account Opened\b|Points Account Created|Investment Account Opened/, "says an account was opened or created"],
  [/approved and issued/i, "says a card was approved and issued"],
  [/(confirmation|welcome) email has been sent|Confirmation sent to your phone/i, "says an email was sent (the server sends none)"],
  [/welcome bonus of/i, "says a bonus was credited"],
  [/Active — card being printed|account is active|Account and selected services activated|services activated/i, "says an account is active"],
  [/will be delivered to|delivered to <strong>|within <strong>5–7 business days|available immediately in the/i, "promises card delivery or instant use"],
  [/Identity verified via|KYC documents received and processed/i, "says identity was verified or documents processed when it was not"],
  [/VINK-(BL|CC)-\$?\{new Date/, "shows a reference number made up in the browser"],       // (a placeholder that the server's real reference replaces on success is fine)
];
describe("the application screens only claim what has happened", () => {
  it("scans every screen that submits an application", () => { expect(screens.length).toBeGreaterThanOrEqual(8); });
  it.each(screens)("%s makes none of the false claims", (f) => {
    const s = readFileSync(join(dir, f), "utf8");
    for (const [re, why] of FALSE_CLAIMS) expect(s, `${f} ${why}`).not.toMatch(re);
  });
});
