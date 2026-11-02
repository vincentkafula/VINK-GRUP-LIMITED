import type { Mode } from "./nav";

/**
 * The three VINK products, each with its own dashboard, and who may use which service. This is the one place that says it: the menus, the "choose a product" screen and the page guard all read it,
 * and the server enforces the same business-only list (server/src/manshya/core/routes.js, BUSINESS_ONLY).
 *
 *   VINK Banking  everyone with a bank account, personal or business: accounts, payments, cards, bills, rewards, insurance
 *   VINK Pay      anyone who wants to take online payments on a website
 *   VINK Tap      tap-to-pay card machines, for drivers and the businesses that run them
 *
 * A personal account can use all three. Some SERVICES are for business accounts only: business credit and funding, a business's owners and team, and managing a shop's categories, products
 * and staff. Those are not shown to a personal account, and the server refuses them.
 */
export type Product = "bank" | "pay" | "tap";
export type AccountKind = "personal" | "business";

export interface ProductInfo {
  id: Product; mode: Mode; name: string; short: string; icon: string; path: string;
  /** One line: who it is for. */
  forWho: string;
  /** What you can do with it. */
  offers: string[];
  /** What is only for business accounts in this product (shown to a personal account so they know why it is missing). */
  businessOnly: string[];
}

export const PRODUCTS: Record<Product, ProductInfo> = {
  bank: {
    id: "bank", mode: "bank", name: "VINK Banking", short: "Banking", icon: "bank", path: "/dashboard/banking",
    forWho: "Everyone with a bank account: personal and business.",
    offers: ["Accounts, statements and savings goals", "Send, receive and request money, at home and abroad", "Cards, bills and prepaid, debit orders", "Rewards, insurance and vehicle licence renewals"],
    businessOnly: ["Business credit and funding"],
  },
  pay: {
    id: "pay", mode: "online", name: "VINK Pay", short: "Online payments", icon: "cart", path: "/dashboard/pay",
    forWho: "Anyone who wants to take online payments on their website.",
    offers: ["Take card payments with payment buttons or the integration", "Subscriptions, payment requests and customer saved cards", "Payouts to your bank account, fees and reports"],
    businessOnly: ["Business information, owners and team"],
  },
  tap: {
    id: "tap", mode: "pos", name: "VINK Tap", short: "In-person payments", icon: "dev", path: "/dashboard/tap",
    forWho: "Drivers and the businesses that run card machines: take payments by tap, chip or swipe.",
    offers: ["Register and manage card machines", "See every in-person transaction", "Sell prepaid airtime, data and electricity"],
    businessOnly: ["Managing categories, products and staff"],
  },
};
export const PRODUCT_ORDER: Product[] = ["bank", "pay", "tap"];
export const isProduct = (v: unknown): v is Product => v === "bank" || v === "pay" || v === "tap";
export const productForMode = (m: Mode | undefined): Product | undefined => (m === "bank" ? "bank" : m === "online" ? "pay" : m === "pos" ? "tap" : undefined);

/** A signed-in account is a personal account or a business. The login role says which; anything that is not "personal" is a business, as on the server. */
export const accountKind = (role: string | undefined): AccountKind => (role === "personal" ? "personal" : "business");

/** Pages (and their menu entries) that are for business accounts only. Keep in step with BUSINESS_ONLY on the server. */
export const BUSINESS_ONLY_PAGES: ReadonlySet<string> = new Set([
  "b/credit", "soon/funding",                      // business credit lines and loans, business funding
  "a/business", "a/ubo", "a/users",                // a business's details, beneficial owners and team
  "p/cat", "p/prod", "p/staff",                    // a shop's categories, products and staff
]);

/** Which product a page belongs to. Account and buyer pages are shared (null). */
export function pageProduct(id: string): Product | null {
  if (id.startsWith("b/")) return "bank";
  if (id.startsWith("o/") || id.startsWith("s/")) return "pay";
  if (id.startsWith("p/")) return "tap";
  return null;
}

/** May this kind of account open this page? */
export const pageAllowed = (id: string, kind: AccountKind): boolean => kind === "business" || !BUSINESS_ONLY_PAGES.has(id);
