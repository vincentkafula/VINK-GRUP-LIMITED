import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ManshyaDashboard } from "./ManshyaDashboard";
import { setSession, setToken, clearSession } from "../../services/apiClient";
import type { Product } from "./products";

const asUser = (role: string) => { setToken("t"); setSession({ id: "u1", username: role + "1", name: "Thandi Nkosi", email: "t@x.co", role }); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; clearSession();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/me")) return json({ id: "u1", name: "Thandi Nkosi", verified: true });
    if (u.endsWith("/settings")) return json({ display: { theme: "system" }, payment_methods: {}, home: {} });
    if (u.endsWith("/notifications")) return json({ unread: 0, data: [] });
    if (u.includes("/dashboard/online")) return json({ month: "2026-10", previous_month: "2026-09", stats: { unique_shoppers: 0, total_transactions: 0, total_amount: 0, avg_value: 0 }, balance: { total: 0, retained: 0, available: 0, payout_fee: 0, available_for_payout: 0 }, series: { current: [], previous: [] }, recent: [] });
    if (u.includes("/dashboard/pos")) return json({ devices: [], recent: [], today: { count: 0, amount: 0 }, totals: {}, series: [] });
    if (u.includes("/dashboard/bank")) return json({ accounts: [], total: 0, recent: [], activity: [], cards: [], insights: {} });
    return json({ data: [] });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); clearSession(); });

const open = async (product: Product, role: string, extra: { onChooseProduct?: () => void } = {}) => { asUser(role); const r = render(<ManshyaDashboard isOpen product={product} onClose={() => {}} {...extra} />); await screen.findByRole("dialog"); return r; };
const has = (text: string) => screen.queryAllByText(text).length > 0;       // a label can appear twice (a menu group and the page of the same name)

describe("each product is its own dashboard", () => {
  it.each([["bank", "VINK Banking dashboard"], ["pay", "VINK Pay dashboard"], ["tap", "VINK Tap dashboard"]] as const)("%s opens as %s, with no tabs to switch to another product", async (product, label) => {
    await open(product, "customer"); expect(screen.getByRole("dialog", { name: label })).toBeInTheDocument();
    expect(screen.getAllByRole("group", { name: "Product" })).toHaveLength(1); expect(within(screen.getByRole("group", { name: "Product" })).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Payment type" })).toBeNull();
  });
  it("shows VINK Banking's pages, and not Pay's or Tap's", async () => {
    await open("bank", "customer"); for (const t of ["Statements", "Savings goals", "Bills and prepaid", "Debit orders", "Rewards", "Insurance", "Vehicle licence"]) expect(has(t), t).toBe(true);
    for (const t of ["Online transaction history", "Payout manager", "Payment buttons", "Card machines", "Developer settings"]) expect(has(t), t).toBe(false);
  });
  it("shows VINK Pay's pages and settings, and not Banking's or Tap's", async () => {
    await open("pay", "customer"); for (const t of ["Online transaction history", "Payout manager", "Payment buttons", "Integration", "Developer settings", "Payment methods"]) expect(has(t), t).toBe(true);
    for (const t of ["Statements", "Savings goals", "Card machines", "Bills and prepaid", "Insurance"]) expect(has(t), t).toBe(false);
  });
  it("shows VINK Tap's card machine pages, and not Banking's or Pay's", async () => {
    await open("tap", "customer"); for (const t of ["Card machines", "Transaction history", "Prepaid sales"]) expect(has(t), t).toBe(true);
    for (const t of ["Statements", "Online transaction history", "Payment buttons", "Developer settings"]) expect(has(t), t).toBe(false);
  });
  it("reads an older caller's initialMode as the product it belongs to", async () => {
    asUser("personal"); render(<ManshyaDashboard isOpen initialMode="bank" onClose={() => {}} />); expect(await screen.findByRole("dialog", { name: "VINK Banking dashboard" })).toBeInTheDocument();
  });
  it("starts at the product's own home again if it is switched to another product", async () => {
    const { rerender } = await open("pay", "customer"); expect(screen.getByRole("dialog", { name: "VINK Pay dashboard" })).toBeInTheDocument();
    rerender(<ManshyaDashboard isOpen product="tap" onClose={() => {}} />); expect(await screen.findByRole("dialog", { name: "VINK Tap dashboard" })).toBeInTheDocument(); expect(has("Card machines")).toBe(true); expect(has("Payout manager")).toBe(false);
  });
});

describe("the product badge", () => {
  it("takes you back to choose another product when there is somewhere to go, naming the product you are in", async () => {
    const choose = vi.fn(); await open("pay", "customer", { onChooseProduct: choose });
    const badge = screen.getByRole("button", { name: "VINK Pay. Choose another product" }); fireEvent.click(badge); expect(choose).toHaveBeenCalledTimes(1);
  });
  it("is only a label when there is nowhere to choose from", async () => { await open("tap", "customer"); expect(screen.getByRole("button", { name: "VINK Tap" })).toBeDisabled(); });
});

describe("a personal account and a business", () => {
  const BUSINESS_SERVICES: Record<Product, string[]> = { bank: ["Credit", "Business funding", "Business information", "Beneficial owners", "User management"], pay: ["Business information", "Beneficial owners", "User management"], tap: ["Categories", "Products", "Staff", "Business information", "Beneficial owners", "User management"] };
  it.each(["bank", "pay", "tap"] as const)("a business sees %s's business services, and says it is a business account", async (product) => {
    await open(product, "customer"); expect(has("Business account")).toBe(true); for (const t of BUSINESS_SERVICES[product]) expect(has(t), `${product}: ${t}`).toBe(true);
  });
  it.each(["bank", "pay", "tap"] as const)("a personal account does not see %s's business services, and says it is a personal account", async (product) => {
    await open(product, "personal"); expect(has("Personal account")).toBe(true); expect(has("Business account")).toBe(false); for (const t of BUSINESS_SERVICES[product]) expect(has(t), `${product}: ${t}`).toBe(false);
  });
  it("a personal account keeps banking, rewards, cards, online payments and a card machine", async () => {
    const bank = await open("bank", "personal"); for (const t of ["Accounts", "Cards", "Rewards", "Insurance", "Bills and prepaid", "Personal information", "Security", "Verification documents"]) expect(has(t), t).toBe(true); bank.unmount();
    const pay = await open("pay", "personal"); expect(has("Payment buttons")).toBe(true); expect(has("Integration")).toBe(true); pay.unmount();
    await open("tap", "personal"); expect(has("Card machines")).toBe(true); expect(has("Transaction history")).toBe(true);
  });
  it("still turns away an account that is not a customer or personal account", async () => {
    asUser("driver"); render(<ManshyaDashboard isOpen product="tap" onClose={() => {}} />); await waitFor(() => expect(screen.getByRole("dialog", { name: "VINK sign-in required" })).toBeInTheDocument());
  });
});
