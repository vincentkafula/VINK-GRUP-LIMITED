/* Sidebar menus. Ids are page ids (see pages/index.ts); "home" is the dashboard of the current tab. */

import { BUSINESS_ONLY_PAGES, PRODUCTS, type AccountKind, type Product } from "./products";

export type Mode = "online" | "pos" | "bank";
export interface NavItem { id: string; label: string; icon: string }
export interface NavGroup { label: string; icon: string; kids: [id: string, label: string][] }
export type NavEntry = NavItem | NavGroup;
export const isGroup = (e: NavEntry): e is NavGroup => "kids" in e;

const I = (id: string, label: string, icon: string): NavItem => ({ id, label, icon });
const G = (label: string, icon: string, kids: [string, string][]): NavGroup => ({ label, icon, kids });

export const NAV: Record<Mode, NavEntry[]> = {
  online: [
    I("home", "Dashboard", "grid"),
    G("Transactions", "cart", [["o/tx", "Online transaction history"], ["o/unified", "Unified transaction history"], ["o/subs", "Customer subscriptions"], ["o/disputes", "Disputes"]]),
    G("Payout", "cash", [["o/payouts", "Payout manager"], ["o/payacc", "Payout accounts"], ["o/sched", "Payout schedule"], ["o/payhist", "Payout history"]]),
    G("Reports", "chart", [["o/fees", "Fees"], ["o/recon", "Reconciliation"], ["o/cards", "Customer saved cards"]]),
    G("Payment request", "send", [["o/req", "Search payment requests"], ["o/reqhist", "Payment request history"]]),
  ],
  pos: [
    G("Card machine", "card", [["home", "Dashboard"], ["p/devices", "Card machines"], ["p/tx", "Transaction history"]]),
    G("Manage", "cart", [["p/cat", "Categories"], ["p/prod", "Products"], ["p/staff", "Staff"]]),
    G("Prepaid", "tag", [["p/prepaid", "Prepaid sales"], ["o/payouts", "Payout"]]),
  ],
  bank: [
    I("home", "Dashboard", "grid"),
    G("Accounts", "bank", [["b/accounts", "Accounts"], ["b/statements", "Statements"], ["b/receive", "Receive money"], ["b/savings", "Savings goals"]]),
    G("Payments", "send", [["b/pay", "Pay and request money"], ["b/intl", "International payments"], ["b/ben", "Beneficiaries"], ["b/sched", "Scheduled and recurring"], ["b/transfers", "Transfer history"]]),
    I("b/cards", "Cards", "card"), I("b/bills", "Bills and prepaid", "rec"), I("b/debit", "Debit orders", "swap"), I("b/insights", "Money insights", "chart"),
    I("b/credit", "Credit", "cash"), I("b/insurance", "Insurance", "lock"), I("b/rewards", "Rewards", "tag"), I("b/vehicle", "Vehicle licence", "rec"), I("b/support", "Support", "user"),
  ],
};

// What each product shows besides its own pages. Each dashboard takes only the ones that suit it (see menuFor).
const PAY_SETTINGS = G("Settings", "gear", [["s/methods", "Payment methods"], ["s/billing", "Payouts and billing"], ["s/integration", "Integration"], ["s/buttons", "Payment buttons"], ["s/dev", "Developer settings"], ["s/notif", "Notification settings"], ["s/display", "Display settings"]]);
const LIGHT_SETTINGS = G("Settings", "gear", [["s/notif", "Notification settings"], ["s/display", "Display settings"]]);
const ACCOUNT = G("Account", "user", [["a/personal", "Personal information"], ["a/business", "Business information"], ["a/ubo", "Beneficial owners"], ["a/users", "User management"], ["a/activity", "User activity history"], ["a/security", "Security"], ["a/docs", "Verification documents"]]);
const FUNDING = I("soon/funding", "Business funding", "bank");
const BUYER = G("Buyer account", "user", [["buyer/me", "My buyer account"], ["buyer/subs", "My subscription"], ["buyer/cards", "My card agreement"]]);
const LOGOUT = I("logout", "Log out", "out");

/** Takes out the entries (and then any group left empty) that this kind of account may not use. */
function visibleTo(entries: NavEntry[], kind: AccountKind): NavEntry[] {
  const hide = (id: string) => kind === "personal" && BUSINESS_ONLY_PAGES.has(id);
  return entries
    .map((e) => (isGroup(e) ? { ...e, kids: e.kids.filter(([id]) => !hide(id)) } : e))
    .filter((e) => (isGroup(e) ? e.kids.length > 0 : !hide(e.id)));
}

/**
 * The menu of ONE product's dashboard for one kind of account: the product's own pages, then its settings and account pages and Log out. There is no switching between products inside a dashboard:
 * the product badge in the header takes you back to choose another.
 */
export function menuFor(product: Product, kind: AccountKind): { main: NavEntry[]; more: NavEntry[] } {
  const more = product === "pay" ? [PAY_SETTINGS, ACCOUNT] : product === "tap" ? [LIGHT_SETTINGS, ACCOUNT] : [FUNDING, BUYER, LIGHT_SETTINGS, ACCOUNT];
  return { main: visibleTo(NAV[PRODUCTS[product].mode], kind), more: [...visibleTo(more, kind), LOGOUT] };
}
