import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PRODUCTS, PRODUCT_ORDER, BUSINESS_ONLY_PAGES, accountKind, isProduct, pageAllowed, pageProduct, productForMode } from "./products";
import { menuFor, isGroup, type NavEntry } from "./nav";
import { PAGES } from "./pages";

const ids = (es: NavEntry[]) => es.flatMap((e) => (isGroup(e) ? e.kids.map((k) => k[0]) : [e.id]));
const menu = (p: "bank" | "pay" | "tap", k: "personal" | "business") => { const m = menuFor(p, k); return { main: ids(m.main), more: ids(m.more), all: ids([...m.main, ...m.more]), raw: [...m.main, ...m.more] }; };

describe("the three products", () => {
  it("are VINK Banking, VINK Pay and VINK Tap, each with its own address and a plain statement of who it is for", () => {
    expect(PRODUCT_ORDER).toEqual(["bank", "pay", "tap"]); expect(PRODUCT_ORDER.map((p) => PRODUCTS[p].name)).toEqual(["VINK Banking", "VINK Pay", "VINK Tap"]);
    expect(PRODUCT_ORDER.map((p) => PRODUCTS[p].path)).toEqual(["/dashboard/banking", "/dashboard/pay", "/dashboard/tap"]);
    expect(PRODUCTS.bank.forWho).toMatch(/Everyone with a bank account/); expect(PRODUCTS.pay.forWho).toMatch(/online payments on their website/); expect(PRODUCTS.tap.forWho).toMatch(/Drivers/);
    for (const p of PRODUCT_ORDER) { expect(PRODUCTS[p].offers.length, p).toBeGreaterThan(1); expect(isProduct(p)).toBe(true); }
    expect(isProduct("nonsense")).toBe(false); expect(isProduct(undefined)).toBe(false);
  });
  it("map to the engine's modes both ways", () => { expect(productForMode("bank")).toBe("bank"); expect(productForMode("online")).toBe("pay"); expect(productForMode("pos")).toBe("tap"); expect(productForMode(undefined)).toBeUndefined(); });
  it("treat an account as personal only when the login role says so, and anything else as a business, as the server does", () => {
    expect(accountKind("personal")).toBe("personal"); for (const r of ["customer", "owner", "driver", undefined, ""]) expect(accountKind(r as string | undefined), String(r)).toBe("business");
  });
});

describe("business-only services", () => {
  it("are the ones that are for businesses: credit and funding, a business's details, owners and team, and a shop's categories, products and staff", () => {
    expect([...BUSINESS_ONLY_PAGES].sort()).toEqual(["a/business", "a/ubo", "a/users", "b/credit", "p/cat", "p/prod", "p/staff", "soon/funding"]);
  });
  it("are open to a business and closed to a personal account, and everything else is open to both", () => {
    for (const id of BUSINESS_ONLY_PAGES) { expect(pageAllowed(id, "business"), id).toBe(true); expect(pageAllowed(id, "personal"), id).toBe(false); }
    for (const id of ["b/rewards", "b/cards", "b/accounts", "o/tx", "p/devices", "a/personal", "a/security", "home"]) expect(pageAllowed(id, "personal"), id).toBe(true);
  });
  it("stay in step with what the server refuses: every service the server guards has its page hidden here", () => {
    const server = readFileSync(join(__dirname, "../../../../server/src/manshya/core/routes.js"), "utf8");
    const guarded = JSON.parse(/const BUSINESS_ONLY = (\[[^\]]*\])/.exec(server)![1].replace(/'/g, '"')) as string[];
    const PAGE_OF: Record<string, string> = { "/credit": "b/credit", "/account/ubos": "a/ubo", "/account/users": "a/users", "/pos/categories": "p/cat", "/pos/products": "p/prod", "/pos/staff": "p/staff" };
    expect(guarded.sort()).toEqual(Object.keys(PAGE_OF).sort()); for (const g of guarded) expect(BUSINESS_ONLY_PAGES.has(PAGE_OF[g]), g).toBe(true);
  });
  it("name the product a page belongs to by its prefix, and leave account and buyer pages shared", () => {
    expect(pageProduct("b/cards")).toBe("bank"); expect(pageProduct("o/tx")).toBe("pay"); expect(pageProduct("s/integration")).toBe("pay"); expect(pageProduct("p/devices")).toBe("tap");
    for (const id of ["a/personal", "buyer/me", "soon/funding", "home", "logout"]) expect(pageProduct(id), id).toBeNull();
  });
});

describe("each product's menu", () => {
  it("holds only that product's own pages, with Log out last, and no empty group", () => {
    for (const k of ["personal", "business"] as const) for (const p of PRODUCT_ORDER) {
      const m = menu(p, k); expect(m.more.at(-1), `${p}/${k}`).toBe("logout"); for (const e of menuFor(p, k).main.concat(menuFor(p, k).more)) if (isGroup(e)) expect(e.kids.length, `${p}/${k}: ${e.label}`).toBeGreaterThan(0);
      for (const id of m.all) { const owner = pageProduct(id); if (owner && owner !== p) expect(["o/payouts", "s/notif", "s/display"], `${p} shows ${id}`).toContain(id); }     // shared on purpose: card machine takings are paid out through Pay's payouts, and notification and display settings suit every product
    }
  });
  it("gives VINK Banking the banking pages, VINK Pay the payment pages and settings, and VINK Tap the card machine pages, and none of one in another", () => {
    const bank = menu("bank", "business").all, pay = menu("pay", "business").all, tap = menu("tap", "business").all;
    for (const id of ["b/accounts", "b/pay", "b/cards", "b/rewards", "b/insurance", "b/credit"]) expect(bank, id).toContain(id); for (const id of ["o/tx", "o/payouts", "s/integration", "s/buttons", "s/dev"]) expect(pay, id).toContain(id); for (const id of ["p/devices", "p/tx", "p/staff", "p/prepaid"]) expect(tap, id).toContain(id);
    expect(bank.filter((i) => /^(o|p|s)\//.test(i) && i !== "s/notif" && i !== "s/display")).toEqual([]); expect(pay.filter((i) => /^(b|p)\//.test(i))).toEqual([]); expect(tap.filter((i) => /^(b|s)\//.test(i) && i !== "s/notif" && i !== "s/display")).toEqual([]);
  });
  it("takes the business-only services out for a personal account, and leaves banking, rewards, cards, online payments and card machines in", () => {
    const bank = menu("bank", "personal").all, pay = menu("pay", "personal").all, tap = menu("tap", "personal").all;
    for (const id of BUSINESS_ONLY_PAGES) for (const m of [bank, pay, tap]) expect(m, id).not.toContain(id);
    for (const id of ["b/accounts", "b/cards", "b/rewards", "b/insurance", "b/vehicle", "b/bills", "a/personal", "a/security", "a/docs", "buyer/me"]) expect(bank, id).toContain(id);
    for (const id of ["o/tx", "s/integration", "s/buttons", "o/payouts", "a/personal"]) expect(pay, id).toContain(id); for (const id of ["p/devices", "p/tx", "p/prepaid"]) expect(tap, id).toContain(id);
  });
  it("gives a business the same menu plus its business services", () => {
    for (const p of PRODUCT_ORDER) { const biz = menu(p, "business").all, per = menu(p, "personal").all; expect(biz.length, p).toBeGreaterThanOrEqual(per.length); for (const id of per) expect(biz, `${p}: ${id}`).toContain(id); }
    expect(menu("bank", "business").all).toEqual(expect.arrayContaining(["b/credit", "soon/funding", "a/business", "a/ubo", "a/users"])); expect(menu("tap", "business").all).toEqual(expect.arrayContaining(["p/cat", "p/prod", "p/staff"]));
  });
  it("never offers a page that does not exist, apart from the one marked coming soon", () => {
    for (const k of ["personal", "business"] as const) for (const p of PRODUCT_ORDER) for (const id of menu(p, k).all) if (id !== "home" && id !== "logout" && !id.startsWith("soon/")) expect(PAGES[id], `${p}/${k}: ${id}`).toBeTypeOf("function");
  });
});
