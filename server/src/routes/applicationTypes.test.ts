import { describe, it, expect } from "vitest";
import { APPLICATION_TYPE_TIERS } from "./applicationsRouter.js";

/** The tier of an application decides its identity-check level and whether approval needs a confirmed identity, so every kind of application must be given one on purpose. */
describe("the tier of each kind of application", () => {
  it("puts insurance and the personal loans in the personal tier, with the other kinds as before", () => {
    expect(APPLICATION_TYPE_TIERS).toEqual({ creditCard: "personal", personalLoan: "personal", insurance: "personal", businessLoan: "business", corporateLoan: "corporate", "sim-application": "personal", "vehicle-tracking": "personal" });
  });
});
