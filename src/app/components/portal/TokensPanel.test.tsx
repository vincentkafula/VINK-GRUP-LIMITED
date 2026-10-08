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
