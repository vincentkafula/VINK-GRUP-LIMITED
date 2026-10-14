// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { VinkBusinessBankingApp } from "./VinkBusinessBankingApp";
import { setSession } from "../../services/apiClient";
import { setAuth } from "../../services/authSession";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;

function api(opts: { accounts?: unknown[]; failPayout?: string; payoutStatus?: string } = {}) {
  const accounts = opts.accounts ?? [{ id: "acc_1", name: "Settlement", number: "9988776655", kind: "current", balance: 40_000 }];
  const calls: { method: string; path: string; body: Record<string, unknown>; idem: string | null }[] = [];
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/api\/vink/, ""), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, path, body, idem: new Headers(init?.headers).get("Idempotency-Key") });
    const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (path === "/balance") return ok({ total: 961_000, retained: 96_100, available: 864_900, payout_fee: 500, available_for_payout: 864_400 });
    if (path.startsWith("/payments")) return ok({ data: [{ id: "pay_1", amount: 10_000, fee: 390, refunded: 0, status: "paid", method: "card", reference: "Order 42", customer: { name: "Thandi", email: null }, created_at: new Date().toISOString() }] });
    if (path === "/bank/accounts") return ok({ data: accounts });
    if (path === "/payment-requests" && method === "GET") return ok({ data: requests });
    if (path === "/payment-requests" && method === "POST") { const r = { id: "prq_1", amount: body.amount, description: body.description ?? null, customer_email: null, status: "open", token: "tok123", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString() }; requests.unshift(r); return ok(r, 201); }
    if (path === "/payouts" && method === "GET") return ok({ data: [] });
    if (path === "/payouts" && method === "POST") {
      if (opts.failPayout) return ok({ error: { code: "below_minimum", message: opts.failPayout } }, 409);
      return ok({ id: "po_1", gross: body.amount ?? 864_900, fee: 500, net: (body.amount ?? 864_900) - 500, status: opts.payoutStatus ?? "paid", created_at: new Date().toISOString() }, 201);
    }
    if (path === "/bank/cards") return ok({ data: [] });
    return ok({ error: { message: "not mocked: " + path } }, 404);
  }));
  return { calls };
}

const norm = (s: string) => s.replace(/\s/g, " ");
const signIn = (role = "customer") => { setSession({ id: "u1", username: "biz", name: "Dube Traders", email: "d@x.test", role }); setAuth({ token: "t", mode: "legacy" }); };
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };
const type = (label: string, value: string) => {
  const el = host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLSelectElement;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
};
const click = async (text: string) => {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent?.trim() === text) as HTMLElement | undefined;
  if (!b) throw new Error("no button " + text);
  await act(async () => { b.click(); }); await settle();
};
const mount = async () => { await act(async () => { root.render(<VinkBusinessBankingApp isOpen onClose={() => {}} />); }); await settle(); };

beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("the business banking app runs on the business's real account", () => {
  it("home shows the real total, available and held-back amounts, bank account and latest payments", async () => {
    api(); signIn(); await mount();
    expect(norm(host.querySelector("[data-total]")!.textContent!)).toBe("R 9 610,00");
    const t = norm(host.textContent!);
    expect(t).toContain("R 8 649,00"); expect(t).toContain("R 961,00"); expect(t).toContain("Settlement"); expect(t).toContain("Order 42");
    for (const fake of ["Metro Foods", "Payroll — 12", "Invoice #1042", "Sovereign", "Launch"]) expect(t).not.toContain(fake);
  });

  it("creates a payment link with the amount in cents and offers the link", async () => {
    const { calls } = api(); signIn(); await mount();
    await click("Links");
    type("Amount in rand", "150"); type("What it is for", "Deposit"); await click("Create payment link");
    expect(calls.find((c) => c.method === "POST" && c.path === "/payment-requests")!.body).toMatchObject({ amount: 15_000, description: "Deposit" });
    expect(host.textContent).toContain("Deposit"); expect(host.textContent).toContain("Copy link");
  });

  it("rejects a payment link below R 1.00 without calling the server", async () => {
    const { calls } = api(); signIn(); await mount(); await click("Links");
    type("Amount in rand", "0.5"); await click("Create payment link");
    expect(host.textContent).toContain("at least R 1.00"); expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("requests a payout to the bank account with an idempotency key and reports the net amount", async () => {
    const { calls } = api(); signIn(); await mount(); await click("Payouts");
    type("Payout amount in rand", "1000"); await click("Request payout");
    const p = calls.find((c) => c.method === "POST" && c.path === "/payouts")!;
    expect(p.body).toEqual({ destination: { type: "bank_account", accountId: "acc_1" }, amount: 100_000 }); expect(p.idem).toBeTruthy();
    expect(norm(host.querySelector('[role="status"]')!.textContent!)).toContain("R 995,00");
  });

  it("a large payout that needs approval says so instead of claiming it was sent", async () => {
    api({ payoutStatus: "pending_approval" }); signIn(); await mount(); await click("Payouts"); await click("Request payout");
    expect(host.querySelector('[role="status"]')!.textContent).toContain("waiting for an administrator");
  });

  it("a refused payout shows the server's reason", async () => {
    api({ failPayout: "The balance is too low to cover the payout fee" }); signIn(); await mount(); await click("Payouts"); await click("Request payout");
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("too low");
  });

  it("with no bank account it explains how to add one instead of offering a payout", async () => {
    api({ accounts: [] }); signIn(); await mount(); await click("Payouts");
    expect(host.textContent).toContain("Add a bank account"); expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Request payout")).toBe(false);
  });

  it("signs out, and non-customer accounts see no business data", async () => {
    const a = api(); signIn("driver"); await mount();
    expect(host.textContent).toContain("business customer accounts"); expect(a.calls).toHaveLength(0);
  });

  it("holds no sample data or tier marketing", () => {
    const src = readFileSync("src/app/components/apps/VinkBusinessBankingApp.tsx", "utf8");
    for (const s of ["Metro Foods", "Sovereign", "TIER_INFO", "INVOICES = [", "TRANSACTIONS = ["]) expect(src).not.toContain(s);
  });
});
