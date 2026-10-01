/* Sidebar menus. Ids are page ids (see pages/index.ts); "home" is the dashboard of the current tab. */

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

export const SHARED: NavEntry[] = [
  G("Settings", "gear", [["s/methods", "Payment methods"], ["s/billing", "Payouts and billing"], ["s/integration", "Integration"], ["s/buttons", "Payment buttons"], ["s/dev", "Developer settings"], ["s/notif", "Notification settings"], ["s/display", "Display settings"]]),
  G("Account", "user", [["a/personal", "Personal information"], ["a/business", "Business information"], ["a/ubo", "Beneficial owners"], ["a/users", "User management"], ["a/activity", "User activity history"], ["a/security", "Security"], ["a/docs", "Verification documents"]]),
  I("soon/funding", "Business funding", "bank"),
  G("Buyer account", "user", [["buyer/me", "My buyer account"], ["buyer/subs", "My subscription"], ["buyer/cards", "My card agreement"]]),
  I("logout", "Log out", "out"),
];
