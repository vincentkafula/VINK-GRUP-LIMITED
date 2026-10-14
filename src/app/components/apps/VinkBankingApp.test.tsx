// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { VinkBankingApp, rand } from "./VinkBankingApp";
import { setSession } from "../../services/apiClient";
import { setAuth } from "../../services/authSession";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;

/** A tiny stand-in for the VINK API: a ledger of accounts and the transfers made. */
function bank(opts: { accounts?: unknown[]; failTransfer?: string } = {}) {
  const accounts = opts.accounts ?? [{ id: "acc_1", name: "Everyday", number: "1234567890", kind: "current", balance: 150_000 }, { id: "acc_2", name: "Savings", number: "1234567891", kind: "savings", balance: 50_000 }];
  const calls: { method: string; path: string; body: Record<string, unknown>; idem: string | null }[] = [];
  const transfers: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/api\/vink/, ""), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path, body, idem: new Headers(init?.headers).get("Idempotency-Key") });
    const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (path === "/bank/accounts" && method === "GET") return ok({ data: accounts });
    if (path === "/bank/beneficiaries" && method === "GET") return ok({ data: [{ id: "ben_1", name: "Thandi", bank: "Capitec", account_number: "1122334455", branch_code: null }] });
    if (path === "/bank/transfers" && method === "GET") return ok({ data: transfers });
    if (path === "/bank/transfers" && method === "POST") {
      if (opts.failTransfer) return ok({ error: { code: "insufficient_funds", message: opts.failTransfer } }, 409);
      const t = { id: "trf_1", from_account: body.fromAccountId, kind: body.type, to_ref: "x", amount: body.amount, reference: body.reference ?? null, status: "completed", category: "Payments", created_at: new Date().toISOString() };
      transfers.unshift(t); return ok(t, 201);
    }
    if (path.startsWith("/bank/accounts/") && path.includes("/statement")) return ok({ data: [{ date: new Date().toISOString(), kind: "transfer", memo: "To Thandi", amount: -25_000, balance: 125_000 }] });
    if (path === "/bank/cards" && method === "GET") return ok({ data: [{ id: "card_1", account_id: "acc_1", brand: "Visa", last4: "4242", limit: 1_200_000, status: "inactive" }] });
    if (path === "/rewards" && method === "GET") return ok({ balance: 1_250, history: [{ memo: "Cashback", amount: 1_250, created_at: new Date().toISOString() }] });
    return ok({ error: { message: "not mocked: " + path } }, 404);
  }));
  return { calls };
}

/** Rand amounts group thousands with a non-breaking space; compare with plain spaces. */
const norm = (s: string) => s.replace(/\s/g, " ");
const signIn = (role = "customer") => { setSession({ id: "u1", username: "sam", name: "Sam Dube", email: "s@x.test", role }); setAuth({ token: "t", mode: "legacy" }); };
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };
const type = (label: string, value: string) => {
  const el = host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLSelectElement;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
};
const click = async (text: string | RegExp) => {
  const b = [...host.querySelectorAll("button")].find((x) => (typeof text === "string" ? x.textContent?.trim() === text : text.test(x.textContent ?? ""))) as HTMLElement | undefined;
  if (!b) throw new Error("no button " + text);
  await act(async () => { b.click(); }); await settle();
};
const mount = async (props: Partial<Parameters<typeof VinkBankingApp>[0]> = {}) => { await act(async () => { root.render(<VinkBankingApp isOpen onClose={() => {}} {...props} />); }); await settle(); };

beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("the personal banking app runs on the customer's real accounts", () => {
  it("formats cents as rand", () => { expect(norm(rand(150_000))).toBe("R 1 500,00"); expect(norm(rand(-25_000))).toBe("-R 250,00"); });

  it("home shows the real balances from the API, with the total, and no sample figures", async () => {
    bank(); signIn(); await mount();
    expect(norm(host.querySelector("[data-total]")!.textContent!)).toBe("R 2 000,00");        // 1 500,00 + 500,00
    expect(host.textContent).toContain("Account 1234567890");
    for (const fake of ["R20,700.00", "4,218,600", "Shoprite", "Salary — VINK Corp", "Netflix"]) expect(host.textContent).not.toContain(fake);
    expect(host.querySelector("[data-preview-notice]")).toBeNull();
  });

  it("a transfer is posted to the API with an idempotency key and only then reported as sent", async () => {
    const { calls } = bank(); signIn(); await mount({ initialScreen: "send" });
    type("Recipient", "ben_1"); type("Amount in rand", "250,50"); type("Reference", "Rent");
    await click("Send now");
    const post = calls.find((c) => c.method === "POST" && c.path === "/bank/transfers")!;
    expect(post.body).toMatchObject({ type: "beneficiary", fromAccountId: "acc_1", beneficiaryId: "ben_1", amount: 25_050, reference: "Rent" });
    expect(post.idem).toBeTruthy();
    expect(host.textContent).toMatch(/Sent/); expect(host.textContent).toContain("trf_1");
  });

  it("a refused transfer shows the server's reason and never claims success", async () => {
    bank({ failTransfer: "Not enough money in this account" }); signIn(); await mount({ initialScreen: "send" });
    type("Recipient", "ben_1"); type("Amount in rand", "9999"); await click("Send now");
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("Not enough money");
    expect(host.textContent).not.toMatch(/Sent|On its way/);
  });

  it("checks the amount before calling the server", async () => {
    const { calls } = bank(); signIn(); await mount({ initialScreen: "send" });
    type("Recipient", "ben_1"); type("Amount in rand", "0.50"); await click("Send now");
    expect(host.textContent).toContain("at least R 1.00");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("history lists the account's statement lines", async () => {
    bank(); signIn(); await mount({ initialScreen: "history" });
    expect(host.textContent).toContain("To Thandi"); expect(host.textContent).toContain("-R 250,00".replace(/ /g, " "));
  });

  it("cards come from the API and a new card can be activated", async () => {
    const { calls } = bank(); signIn(); await mount({ initialScreen: "cards" });
    expect(host.textContent).toContain("4242"); await click("Activate");
    expect(calls.some((c) => c.method === "POST" && c.path === "/bank/cards/card_1/activate")).toBe(true);
  });

  it("rewards show the cashback balance from the API", async () => {
    bank(); signIn(); await mount({ initialScreen: "rewards" });
    expect(host.textContent).toContain("12,50".replace(",", ",")); expect(host.textContent).toContain("Cashback");
  });

  it("a new customer with no account is offered one, not a pretend balance", async () => {
    bank({ accounts: [] }); signIn(); await mount();
    expect(host.textContent).toContain("Open an account"); expect(host.querySelector("[data-total]")!.textContent).toContain("0,00");
  });

  it("if the API cannot be reached the app says so instead of showing numbers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); })); signIn(); await mount();
    expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.querySelector("[data-total]")).toBeNull();
  });

  it("non-customer accounts are told this app is for customers and see no banking data", async () => {
    const { calls } = bank(); signIn("driver"); await mount();
    expect(host.textContent).toContain("personal customer accounts"); expect(calls).toHaveLength(0);
  });

  it("the file holds no sample data or fixed balances", () => {
    const src = readFileSync("src/app/components/apps/VinkBankingApp.tsx", "utf8");
    for (const s of ["12,847", "20,700", "Shoprite", "REWARDS_HISTORY", "TRANSACTIONS = ["]) expect(src).not.toContain(s);
  });
});
