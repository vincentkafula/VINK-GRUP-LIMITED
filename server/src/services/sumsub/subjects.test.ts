import { describe, it, expect } from "vitest";
import { companyOf } from "./subjects.js";

/** The screens that take a business application keep the business in different places; each shape is pinned here. */
describe("reading the business out of an application", () => {
  it("finds it in each of the four places the screens put it", () => {
    expect(companyOf({ business: { name: "Zuri Transport (Pty) Ltd", registrationNumber: "2019/123456/07", directors: [] } })).toEqual({ name: "Zuri Transport (Pty) Ltd", registrationNumber: "2019/123456/07" });   // the account flow
    expect(companyOf({ bizName: "Mokoena Traders", regNo: "2015/000111/07", accountType: "current" })).toEqual({ name: "Mokoena Traders", registrationNumber: "2015/000111/07" });                          // the business account
    expect(companyOf({ businessName: "Cape Fleet CC", cipcNumber: "CK2010/055555/23", loanAmount: "500000" })).toEqual({ name: "Cape Fleet CC", registrationNumber: "CK2010/055555/23" });                  // the business loan
    expect(companyOf({ contact: { firstName: "A" }, company: { name: "Province Works Ltd", cipc: "2001/009999/06", sector: "x" }, funding: {} })).toEqual({ name: "Province Works Ltd", registrationNumber: "2001/009999/06" });  // the corporate loan
  });
  it("tolerates what real applications contain: blanks (the business account never required them), spaces, nothing at all, and JSON kept as text", () => {
    expect(companyOf({ bizName: "", regNo: "   " })).toEqual({ name: undefined, registrationNumber: undefined });
    expect(companyOf({ bizName: "  Padded Name  ", regNo: " 123 " })).toEqual({ name: "Padded Name", registrationNumber: "123" });
    for (const nothing of [null, undefined, "", "not json", "[]", 42, [], {}]) expect(companyOf(nothing), JSON.stringify(nothing)).toEqual({ name: undefined, registrationNumber: undefined });
    expect(companyOf(JSON.stringify({ bizName: "From Text" }))).toEqual({ name: "From Text", registrationNumber: undefined });
  });
  it("prefers the most specific place when an application has several, ignores values that are not text, and caps what it passes on", () => {
    expect(companyOf({ business: { name: "Specific" }, bizName: "Generic" }).name).toBe("Specific");
    expect(companyOf({ bizName: 12345, businessName: { nested: true }, companyName: "Third Choice" }).name).toBe("Third Choice");
    expect(companyOf({ bizName: "x".repeat(500), regNo: "9".repeat(500) })).toEqual({ name: "x".repeat(200), registrationNumber: "9".repeat(60) });
  });
});
