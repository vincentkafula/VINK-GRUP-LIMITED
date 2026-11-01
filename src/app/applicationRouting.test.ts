import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { CATEGORY_CONFIG, PRODUCTS, type ProductCategory } from "./components/ProductSelectorViewer";

/**
 * Choosing a product in the selector and pressing "Apply Now" used to close the selector and open NOTHING: the selector reports the product it was given, but the shell compared that with
 * the names of the categories. This reads the shell and fails if the choice is not routed by category again, or if any category is left without an application to open.
 */
const app = readFileSync(join(__dirname, "App.tsx"), "utf8");
const categories = Object.keys(CATEGORY_CONFIG) as ProductCategory[];

describe("choosing a product opens its application", () => {
  it("has a category for each kind of personal product, including insurance", () => { expect(categories.sort()).toEqual(["account", "creditCard", "insurance", "invest", "loan", "rewards"]); for (const c of categories) expect(PRODUCTS[c].length, c).toBeGreaterThan(0); });
  it("routes the selector's choice by the CATEGORY being browsed, with the product name chosen", () => {
    expect(app).toMatch(/onSelect=\{\(_productId, productName\) => selectorCategory && handleSelectorSelect\(selectorCategory, productName\)\}/);
    expect(app).toMatch(/const handleSelectorSelect = \(category: NonNullable<typeof selectorCategory>, productName: string\)/);
  });
  it("opens an application for every category the selector offers", () => {
    const body = app.slice(app.indexOf("const handleSelectorSelect"), app.indexOf("const handleSelectorSelect") + 700) + app.slice(app.indexOf("const applyForProductCategory"), app.indexOf("const applyForProductCategory") + 1500);
    for (const c of categories) expect(body, c).toContain(`"${c}"`);
  });
  it("opens the PERSONAL loan application for the personal loans, not the business one", () => {
    const fn = app.slice(app.indexOf("const applyForProductCategory"), app.indexOf("const applyForProductCategory") + 1500);
    expect(fn).toContain('category === "loan"'); expect(fn).toMatch(/category === "loan"[^\n]*personalLoanApp/); expect(fn).not.toMatch(/category === "loan"[^\n]*bizLoanApp/);
  });
  it("mounts a screen for each of the new applications, with the product the visitor chose, and lists them with the other open screens", () => {
    expect(app).toContain('kind="insurance"'); expect(app).toContain('kind="personalLoan"'); expect(app.match(/initialProduct=\{chosenProduct\}/g)?.length).toBe(2);
    for (const flag of ["showInsureApp", "showPersonalLoanApp"]) expect(app.match(new RegExp(flag, "g"))!.length, flag).toBeGreaterThanOrEqual(4);
  });
  it("opens the insurance products from the Insurance tile, which used to land on the dashboard", () => { expect(app).toMatch(/case "insurance":\s+openSelector\("insurance"\)/); expect(app).not.toMatch(/insurance was removed/); });
});
