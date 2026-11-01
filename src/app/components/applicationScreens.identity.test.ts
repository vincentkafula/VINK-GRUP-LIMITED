import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Every screen that sends an application to /api/applications must offer the identity step on its confirmation, so no kind of application can slip through without the chance to
 * confirm that a real person is applying. This scans the source: a new application screen added without the step fails here.
 */
const dir = __dirname;
const src = (f: string) => readFileSync(join(dir, f), "utf8");
const submitters = readdirSync(dir).filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f) && src(f).includes("applicationsApi.submit("));

describe("every application screen offers the identity step", () => {
  it("finds the seven screens that submit applications (so the scan below can never pass by finding none)", () => {
    expect(submitters.sort()).toEqual(["ApplicationFlowViewer.tsx", "BusinessAccountApplicationViewer.tsx", "BusinessLoanApplicationViewer.tsx", "CorporateLoanApplicationViewer.tsx", "CreditCardApplicationViewer.tsx", "PersonalAccountApplicationViewer.tsx", "ServiceApplicationViewer.tsx"]);
  });
  it.each(submitters)("%s imports and shows it, with the reference the server gave and the applicant's email", (f) => {
    const s = src(f);
    expect(s).toContain('import { ApplicationIdentityStep } from "./ApplicationIdentityStep";');
    expect(s).toMatch(/<ApplicationIdentityStep refNo=\{[A-Za-z.]*\} (email=\{[A-Za-z.()]*\}|email=\{[A-Za-z.]*\}) \/>/);
  });
  it("shows the real reference number on the business loan screen, not one made up in the browser", () => {
    const s = src("BusinessLoanApplicationViewer.tsx");
    expect(s).not.toContain("Math.random()"); expect(s).not.toMatch(/VINK-BL-/); expect(s).toContain("setRefNo(result.data.referenceNumber)");
  });
  it("offers it to a signed-in customer on their home, while their application is still undecided", () => {
    const s = src("PostLoginHome.tsx");
    expect(s).toMatch(/myApplication && myApplication\.status !== "approved" && myApplication\.status !== "declined" && <ApplicationIdentityStep refNo=\{myApplication\.referenceNumber\} \/>/);
  });
});
