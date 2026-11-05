// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { OfflineFaresPanel } from "./AdminConfig";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[], settings: Record<string, unknown>, owed: Record<string, unknown>, post: { status: number; body: unknown };
const money = (c: number) => `ZAR ${(c / 100).toFixed(2)}`;                 // how the admin screen writes an amount
const DEBTS = [{ id: "d1", name: "Thandi Nkosi", email: "t@x.test", amountCents: 2500, terminal: "RK-1", createdAt: "2026-10-07T10:05:00Z" }, { id: "d2", name: "Sipho Dlamini", email: "s@x.test", amountCents: 2500, terminal: "RK-2", createdAt: "2026-10-07T11:00:00Z" }];
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("vink_session", JSON.stringify({ id: "me", name: "Maker", role: "superadmin" })); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  calls = []; settings = { success: true, deviceFeeCents: 100, offlineGuaranteeLimitCents: 0 }; owed = { success: true, openCents: 0, openCount: 0, debts: [] }; post = { status: 200, body: { success: true } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init }); const u = String(url), m = init?.method ?? "GET";
    if (m !== "GET") return new Response(JSON.stringify(post.body), { status: post.status });
    return new Response(JSON.stringify(u.includes("/offline-debts") ? owed : u.endsWith("/settings") ? settings : { success: true }), { status: 200 });
  }));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const render = async () => { await act(async () => { root.render(<OfflineFaresPanel />); }); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;
const input = (el: Element | null, v: string) => act(async () => { (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!).call(el, v); el!.dispatchEvent(new Event("input", { bubbles: true })); });
const writes = () => calls.filter((c) => c.init?.method && c.init.method !== "GET");

describe("the offline fares admin panel", () => {
  it("says VINK carries no offline risk when the limit is 0, and that nothing is owed", async () => {
    await render(); expect(host.textContent).toContain("VINK carries no offline risk"); expect(host.textContent).toContain("devices are told not to take VINK cards without a signal"); expect(host.textContent).toContain(`Owed by cards now: ${money(0)} (0 fares)`);
  });
  it("shows the limit VINK has set, what is owed, and each owed fare with who owes it", async () => {
    settings = { success: true, offlineGuaranteeLimitCents: 5000 }; owed = { success: true, openCents: 5000, openCount: 2, debts: DEBTS }; await render();
    expect(host.textContent).toContain(`up to ${money(5000)} of offline fares`); expect(host.textContent).toContain(`Owed by cards now: ${money(5000)} (2 fares)`);
    expect(host.textContent).toContain("Thandi Nkosi"); expect(host.textContent).toContain("t@x.test"); expect(host.textContent).toContain("RK-2"); expect(document.querySelectorAll("li")).toHaveLength(2);
  });
  it("sets the limit in cents from an amount in rand, refuses a bad amount without sending anything, and confirms 0 means no risk", async () => {
    await render(); const field = document.querySelector('input[placeholder="0.00"]');
    await input(field, "abc"); await act(async () => { btn("Set offline limit")!.click(); }); await settle(); expect(writes()).toEqual([]); expect(host.textContent).toContain("Enter an amount, 0 or more");
    await input(field, "-5"); await act(async () => { btn("Set offline limit")!.click(); }); await settle(); expect(writes()).toEqual([]);
    await input(field, "50,00"); await act(async () => { btn("Set offline limit")!.click(); }); await settle(); expect(writes()).toHaveLength(1); expect(writes()[0].url).toMatch(/\/api\/admin\/tokens\/settings$/); expect(JSON.parse(String(writes()[0].init!.body))).toEqual({ offlineGuaranteeLimitCents: 5000 });
    await input(field, "0"); await act(async () => { btn("Set offline limit")!.click(); }); await settle(); expect(host.textContent).toContain("VINK now carries no offline risk");
  });
  it("shows the server's reason when the limit is refused", async () => {
    post = { status: 400, body: { success: false, error: "The limit must be a whole number of cents" } }; await render(); await input(document.querySelector('input[placeholder="0.00"]'), "10"); await act(async () => { btn("Set offline limit")!.click(); }); await settle();
    expect(host.textContent).toContain("The limit must be a whole number of cents");
  });
  it("writes a fare off only with a reason, sends the reason, and shows the list again", async () => {
    owed = { success: true, openCents: 5000, openCount: 2, debts: DEBTS }; await render();
    await act(async () => { btn("Write off")!.click(); }); await settle(); expect(writes()).toEqual([]); expect(host.textContent).toContain("Say why");
    await input(document.querySelector('input[aria-label="Why write off Thandi Nkosi\'s fare"]'), "  Goodwill  "); owed = { success: true, openCents: 2500, openCount: 1, debts: [DEBTS[1]] };
    await act(async () => { btn("Write off")!.click(); }); await settle();
    expect(writes()).toHaveLength(1); expect(writes()[0].url).toMatch(/\/api\/admin\/tokens\/offline-debts\/d1\/write-off$/); expect(JSON.parse(String(writes()[0].init!.body))).toEqual({ reason: "Goodwill" });
    expect(host.textContent).toContain(`Owed by cards now: ${money(2500)} (1 fare)`); expect(host.textContent).not.toContain("Thandi Nkosi");
  });
  it("shows the server's reason when a write-off is refused, and keeps the fare listed", async () => {
    owed = { success: true, openCents: 2500, openCount: 1, debts: [DEBTS[0]] }; post = { status: 409, body: { success: false, error: "That debt is already settled" } }; await render();
    await input(document.querySelector("input[placeholder='Why (required)']"), "x"); await act(async () => { btn("Write off")!.click(); }); await settle(); expect(host.textContent).toContain("That debt is already settled"); expect(host.textContent).toContain("Thandi Nkosi");
  });
  it("copes with the server answering with nothing useful (no limit, no list)", async () => {
    settings = { success: true }; owed = { success: true }; await render(); expect(host.textContent).toContain("VINK carries no offline risk"); expect(host.textContent).toContain("(0 fares)");
  });
});
