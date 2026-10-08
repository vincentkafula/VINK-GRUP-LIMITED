// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { TokensPanel } from "./TokensPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
function mockApi(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), init }); const r = handler(String(url), init); return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } }); }));
}
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = async (el: React.ReactElement) => { await act(async () => { root.render(el); }); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;

const WALLET = {
  id: "w1", currency: "ZAR", role: "passenger", status: "active", accountNumber: "VKR123456789", balanceCents: 8000,
  payInto: { bank: "Test Bank", holder: "Vink Pool", accountNumber: "1234567890", type: "Business" },
  cards: [{ id: "c1", last4: "B2C3", status: "active" }],
  activity: [{ at: "2026-10-05T08:00:00Z", kind: "fare", amountCents: -2000, label: "Langa – Cape Town" }, { at: "2026-10-05T07:00:00Z", kind: "top_up", amountCents: 10000, label: "Tokens bought" }],
};

describe("TokensPanel", () => {
  it("offers to open a wallet when there is none, and opens it", async () => {
    mockApi((url, init) => (init?.method === "POST" ? { body: { success: true, wallet: WALLET } } : { body: { success: true, wallets: [], role: "passenger" } }));
    await render(<TokensPanel segment="personal" color="#f00" />);
    expect(host.textContent).toContain("Open your wallet");
    await act(async () => { btn("Open my token wallet")!.click(); });
    expect(calls.some((c) => c.url.endsWith("/api/portal/personal/tokens/wallet") && c.init?.method === "POST")).toBe(true);
  });

  it("shows the balance, the account number to pay into, the card and the activity", async () => {
    mockApi(() => ({ body: { success: true, wallets: [WALLET], role: "passenger" } }));
    await render(<TokensPanel segment="personal" color="#f00" />);
    expect(host.textContent).toMatch(/R 80[.,]00/);
    expect(host.textContent).toContain("VKR123456789");
    expect(host.textContent).toContain("Pay into Vink Pool");
    expect(host.textContent).toContain("Card ending B2C3");
    expect(host.textContent).toContain("Fare"); expect(host.textContent).toContain("Tokens bought");
    expect(host.textContent).toMatch(/−R 20[.,]00/);
  });

  it("sends an amount in whole cents with a request reference, and refuses a blank amount", async () => {
    mockApi((url, init) => (init?.method === "POST" ? { body: { success: true, balanceCents: 7000 } } : { body: { success: true, wallets: [WALLET], role: "passenger" } }));
    await render(<TokensPanel segment="driver" color="#f00" />);
    const inputs = [...document.querySelectorAll("input")] as HTMLInputElement[];
    const set = async (el: HTMLInputElement, v: string) => { await act(async () => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!; d.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }); };
    const to = inputs.find((i) => i.closest("label")?.textContent?.includes("Email or account number"))!;
    const amt = inputs.find((i) => i.closest("section")?.getAttribute("aria-label") === "Send tokens" && i.placeholder === "0.00")!;
    await set(to, "pam@x.test");
    await act(async () => { btn("Send")!.click(); });
    expect(calls.some((c) => c.url.endsWith("/tokens/transfer"))).toBe(false);                 // no amount yet
    await set(amt, "10.50");
    await act(async () => { btn("Send")!.click(); });
    const sent = calls.find((c) => c.url.endsWith("/api/portal/driver/tokens/transfer"))!;
    expect(JSON.parse(String(sent.init!.body))).toMatchObject({ recipient: "pam@x.test", currency: "ZAR", amountCents: 1050 });
    expect(JSON.parse(String(sent.init!.body)).key.length).toBeGreaterThanOrEqual(6);
  });

  it("an association can set a route fare; other roles do not see the route editor", async () => {
    mockApi((url, init) => init?.method === "PUT" ? { body: { success: true, id: "r1" } } : url.includes("/tokens/routes") ? { body: { success: true, routes: [{ id: "r0", name: "Langa – Cape Town", fareCents: 2000, currency: "ZAR", effectiveFrom: "2025-10-01", active: true }] } } : { body: { success: true, wallets: [WALLET], role: "association" } });
    await render(<TokensPanel segment="association" color="#f00" />);
    expect(host.textContent).toContain("Route fares"); expect(host.textContent).toContain("Langa – Cape Town"); expect(host.textContent).toMatch(/R 20[.,]00/);
    act(() => root.unmount()); root = createRoot(host);
    mockApi(() => ({ body: { success: true, wallets: [WALLET], role: "passenger" } }));
    await render(<TokensPanel segment="personal" color="#f00" />);
    expect(host.textContent).not.toContain("Route fares");
  });
});

describe("TokensPanel: payouts go only to the holder's own debit card", () => {
  const CARD = { id: "k1", brand: "visa", last4: "1111", expiry: "12/34", status: "verified" };
  const setup = (cards: unknown[], onPost?: (url: string, body: Record<string, unknown>) => { status?: number; body: unknown }) =>
    mockApi((url, init) => {
      if (init?.method === "POST" && onPost) return onPost(url, JSON.parse(String(init.body)));
      if (url.endsWith("/tokens/cash-outs")) return { body: { success: true, cashOuts: [{ id: "c1", amountCents: 3000, currency: "ZAR", reason: "cash_out", status: "paid", card: "visa ****1111", problem: null, requestedAt: "2026-10-05T08:00:00Z" }] } };
      return { body: { success: true, wallets: [WALLET], payoutCards: cards, role: "passenger" } };
    });

  it("lists the cards with their status and the payouts made to them", async () => {
    setup([CARD, { id: "k2", brand: "mastercard", last4: "4444", expiry: "11/33", status: "needs_review" }]);
    await render(<TokensPanel segment="personal" color="#f00" />);
    expect(host.textContent).toContain("Visa debit ****1111"); expect(host.textContent).toContain("Ready for payouts");
    expect(host.textContent).toContain("Mastercard debit ****4444"); expect(host.textContent).toContain("Being checked by VINK");
    expect(host.textContent).toContain("Payouts to my card"); expect(host.textContent).toContain("visa ****1111"); expect(host.textContent).toContain("Paid");
    expect(host.textContent).toContain("never to a bank account, and never by hand");
  });

  it("says a verified debit card is needed first when there is none", async () => {
    setup([]);
    await render(<TokensPanel segment="personal" color="#f00" />);
    expect(host.textContent).toContain("You need a verified debit card of your own");
  });

  it("adds a card with the number, expiry and name, and warns that only test cards work for now", async () => {
    setup([], () => ({ status: 201, body: { success: true, id: "k9", last4: "1111", brand: "visa", status: "verified", message: "Card added." } }));
    await render(<TokensPanel segment="personal" color="#f00" />);
    expect(host.textContent).toContain("Never enter a real card number");
    const set = async (el: HTMLInputElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }); };
    const input = (ph: string) => [...document.querySelectorAll("input")].find((i) => (i as HTMLInputElement).placeholder === ph) as HTMLInputElement;
    await set(input("4111 1111 1111 1111"), "4111 1111 1111 1111"); await set(input("12/34"), "12/34");
    await set([...document.querySelectorAll("input")].find((i) => i.closest("label")?.textContent?.includes("Name on the card")) as HTMLInputElement, "Pax Pax");
    await act(async () => { btn("Add debit card")!.click(); }); await settle();
    const post = calls.find((c) => c.url.endsWith("/tokens/payout-cards") && c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ primaryAccountNumber: "4111 1111 1111 1111", expiry: "12/34", cardholderName: "Pax Pax" });
  });

  it("asks the system to pay an amount to the card, and shows what it answered", async () => {
    setup([CARD], () => ({ status: 201, body: { success: true, id: "c2", status: "paid", balanceCents: 5000, message: "Paid to your debit card." } }));
    await render(<TokensPanel segment="personal" color="#f00" />);
    const amt = [...document.querySelectorAll("input")].find((i) => i.closest("section")?.getAttribute("aria-label") === "Turn tokens into money" && (i as HTMLInputElement).placeholder === "0.00") as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(amt, "30.00"); amt.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { btn("Pay to my debit card")!.click(); }); await settle();
    const post = calls.find((c) => c.url.endsWith("/tokens/cash-out"))!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ currency: "ZAR", amountCents: 3000 });
    expect(host.textContent).toContain("Paid to your debit card.");
  });
});

describe("TokensPanel: the VINK debit card", () => {
  it("offers a card when there is none, and asks the server to issue it", async () => {
    mockApi((url, init) => (init?.method === "POST" ? { status: 201, body: { success: true, card: { id: "ic1" } } } : url.endsWith("/tokens/cash-outs") ? { body: { success: true, cashOuts: [] } } : { body: { success: true, wallets: [WALLET], issuedCards: [], role: "passenger" } }));
    await render(<TokensPanel segment="personal" color="#f00" />);
    expect(host.textContent).toContain("My VINK debit card"); expect(host.textContent).toContain("spends your tokens");
    await act(async () => { btn("Get my VINK card")!.click(); }); await settle();
    const post = calls.find((c) => c.url.endsWith("/api/portal/personal/tokens/card") && c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ currency: "ZAR" });
  });

  it("shows the card with only brand, last four and expiry, and lets the holder freeze it", async () => {
    mockApi((url, init) => (init?.method === "POST" ? { body: { success: true, card: {} } } : url.endsWith("/tokens/cash-outs") ? { body: { success: true, cashOuts: [] } } : { body: { success: true, wallets: [WALLET], issuedCards: [{ id: "ic1", brand: "mastercard", last4: "7788", expiry: "10/30", status: "active", currency: "ZAR" }], role: "passenger" } }));
    await render(<TokensPanel segment="personal" color="#f00" />);
    expect(host.textContent).toContain("Mastercard debit ****7788 · 10/30"); expect(host.textContent).toContain("Active");
    expect(btn("Get my VINK card")).toBeUndefined();
    await act(async () => { btn("Freeze")!.click(); }); await settle();
    const post = calls.find((c) => c.url.endsWith("/tokens/card/ic1/status"))!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ status: "frozen" });
  });
});
