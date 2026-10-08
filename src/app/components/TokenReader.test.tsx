// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { TokenReader, cleanCardNumber } from "./TokenReader";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
const ROUTES = [{ id: "r1", name: "Langa – Cape Town", fareCents: 2000, currency: "ZAR" }, { id: "r2", name: "Langa – Khayelitsha", fareCents: 2000, currency: "ZAR" }];
function mockApi(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown } | "offline") {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = handler(String(url), init);
    if (r === "offline") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }));
}
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = async (el: React.ReactElement) => { await act(async () => { root.render(el); }); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;
const type = async (el: HTMLInputElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }); };
const paid = { status: 201, body: { success: true, data: { tapId: "t1", fareCents: 2000, balanceCents: 8000, route: "Langa – Cape Town", replayed: false } } };
const signedIn = () => localStorage.setItem("vink-reader-device", JSON.stringify({ serial: "SN1", apiKey: "good" }));
const chargeManual = async (card: string) => { await type(document.querySelector('input[placeholder^="Or type"]') as HTMLInputElement, card); await act(async () => { btn("Charge")!.click(); }); await settle(); };

describe("cleanCardNumber", () => { it("removes spaces, colons and dashes and upper-cases", () => { expect(cleanCardNumber("04:a1 b2-c3")).toBe("04A1B2C3"); }); });

describe("TokenReader", () => {
  it("asks for the device's serial number and key first, and keeps them on this device", async () => {
    mockApi(() => ({ body: { success: true, routes: ROUTES } }));
    await render(<TokenReader isOpen />);
    expect(host.textContent).toContain("Set up this card reader");
    const [serial, key] = [...document.querySelectorAll("input")] as HTMLInputElement[];
    await type(serial, "SN1"); await type(key, "good");
    await act(async () => { btn("Save and continue")!.click(); }); await settle();
    expect(JSON.parse(localStorage.getItem("vink-reader-device")!)).toEqual({ serial: "SN1", apiKey: "good" });
    expect(calls[0].url).toContain("/api/terminal/token/routes");
    expect((calls[0].init!.headers as Record<string, string>)["x-terminal-api-key"]).toBe("good");
    expect(host.textContent).toContain("Langa – Khayelitsha");
  });

  it("charges the chosen route, with a tap reference, and shows the fare and balance", async () => {
    signedIn();
    mockApi((url) => (url.endsWith("/tap") ? paid : { body: { success: true, routes: ROUTES } }));
    await render(<TokenReader isOpen />);
    await chargeManual("04 A1 B2 C3");
    const tap = calls.find((c) => c.url.endsWith("/tap"))!;
    expect(JSON.parse(String(tap.init!.body))).toEqual({ cardNumber: "04A1B2C3", routeId: "r1" });
    expect((tap.init!.headers as Record<string, string>)["idempotency-key"].length).toBeGreaterThanOrEqual(6);
    expect(host.textContent).toContain("R 20.00"); expect(host.textContent).toContain("Paid"); expect(host.textContent).toContain("balance R 80.00");
  });

  it("says plainly when there are not enough tokens", async () => {
    signedIn();
    mockApi((url) => (url.endsWith("/tap") ? { status: 402, body: { success: false, code: "insufficient_tokens", error: "Not enough tokens" } } : { body: { success: true, routes: ROUTES } }));
    await render(<TokenReader isOpen />);
    await chargeManual("04A1B2C3");
    expect(host.textContent).toContain("Not enough tokens"); expect(host.textContent).toContain("buy tokens");
  });

  it("never assumes a tap with no connection was paid or unpaid, and a retry uses the same tap reference", async () => {
    signedIn();
    let offline = true;
    mockApi((url) => (url.endsWith("/tap") ? (offline ? "offline" : paid) : { body: { success: true, routes: ROUTES } }));
    await render(<TokenReader isOpen />);
    await chargeManual("04A1B2C3");
    expect(host.textContent).toContain("No connection"); expect(host.textContent).toContain("at most once");
    const firstKey = (calls.filter((c) => c.url.endsWith("/tap"))[0].init!.headers as Record<string, string>)["idempotency-key"];
    offline = false;
    await act(async () => { btn("Try again")!.click(); }); await settle();
    const taps = calls.filter((c) => c.url.endsWith("/tap"));
    expect((taps[1].init!.headers as Record<string, string>)["idempotency-key"]).toBe(firstKey);
    expect(host.textContent).toContain("Paid");
  });

  it("a device the server does not accept shows why, and the key can be changed", async () => {
    signedIn();
    mockApi(() => ({ status: 401, body: { success: false, error: "Invalid API key" } }));
    await render(<TokenReader isOpen />);
    expect(host.textContent).toContain("Invalid API key");
    await act(async () => { btn("Change device")!.click(); });
    expect(host.textContent).toContain("Set up this card reader"); expect(localStorage.getItem("vink-reader-device")).toBeNull();
  });
});
