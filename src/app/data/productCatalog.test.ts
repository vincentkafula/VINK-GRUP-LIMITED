import { describe, it, expect } from "vitest";
import { CATALOG, SEGMENTS, allProducts, productValue, splitProduct } from "./productCatalog";
import { PRODUCTS as PERSONAL } from "../components/ProductSelectorViewer";
import { PRODUCTS as BIZ } from "../components/BusinessProductLedgerViewer";
import { ACCOUNTS as BIZ_ACCOUNTS } from "../components/BusinessAccountSelectorViewer";
import { ROW1 as MANAGE1, ROW2 as MANAGE2 } from "../components/ManageMyBusinessViewer";
import { ROW1 as START1, ROW2 as START2 } from "../components/StartMyBusinessViewer";
import { SECTIONS as CORP } from "../components/corporateProducts";

const names = (xs: { name: string }[]) => xs.map((x) => x.name);
const group = (seg: keyof typeof CATALOG, g: string) => CATALOG[seg].find((x) => x.group === g)!.products;

describe("the product list of the application form", () => {
  it("has the three sections, each with products", () => {
    expect([...SEGMENTS]).toEqual(["Personal", "Business", "Corporate"]);
    for (const s of SEGMENTS) { expect(CATALOG[s].length).toBeGreaterThan(2); expect(allProducts(s).length).toBeGreaterThan(15); }
  });
  it("matches every product on the Personal pages", () => {
    expect(group("Personal", "Accounts")).toEqual(names(PERSONAL.account)); expect(group("Personal", "Credit cards")).toEqual(names(PERSONAL.creditCard));
    expect(group("Personal", "Loans")).toEqual(names(PERSONAL.loan)); expect(group("Personal", "Investments")).toEqual(names(PERSONAL.invest)); expect(group("Personal", "Rewards")).toEqual(names(PERSONAL.rewards));
  });
  it("matches every product on the Business pages", () => {
    expect(group("Business", "Accounts")).toEqual(names(BIZ_ACCOUNTS)); expect(group("Business", "Credit cards")).toEqual(names(BIZ.creditCard));
    expect(group("Business", "Loans")).toEqual(names(BIZ.loan)); expect(group("Business", "Investments")).toEqual(names(BIZ.invest));
    expect(group("Business", "Manage My Business")).toEqual(names([...MANAGE1, ...MANAGE2]));
    expect(group("Business", "Start My Business")).toEqual(names([...START1, ...START2]).map((c) => `Register your business in ${c}`));
  });
  it("matches every product on the Corporate pages", () => {
    const flat = (k: "account" | "solutions" | "loan") => CORP[k].flatMap((s) => s.cards.map((c) => c.name));
    expect(group("Corporate", "Accounts")).toEqual(flat("account")); expect(group("Corporate", "Solutions and credit")).toEqual(flat("solutions")); expect(group("Corporate", "Loans")).toEqual(flat("loan"));
  });
  it("names a group and a product in one select value, and reads it back", () => {
    expect(splitProduct(productValue("Loans", "Road Development"))).toEqual({ group: "Loans", product: "Road Development" }); expect(splitProduct("nothing")).toBeNull();
  });
});
