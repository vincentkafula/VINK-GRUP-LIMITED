// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ExchangeRatesViewer } from "./ExchangeRatesViewer";
import { convertAt, formatRate } from "../../services/liveRates";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: string[];

/** 1 ZAR = ... : the real-world shape, with a few round numbers so the sums are easy to check. */
const RATES = { ZAR: 1, USD: 0.05, EUR: 0.045, GBP: 0.04, CNY: 0.4, ZMW: 1.25, BWP: 0.8, NAD: 1, MZN: 3.9, SZL: 1, LSL: 1, JPY: 7.5 };
const DATA = { base: "ZAR", rates: RATES, source: "ExchangeRate-API", attributionUrl: "https://www.exchangerate-api.com", sourceUpdatedAt: "2026-10-09T00:02:31.000Z", fetchedAt: "2026-10-09T10:00:00.000Z" };

function mockApi(handler: () => { status?: number; body: unknown } | "network") {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    const r = handler();
    if (r === "network") throw new TypeError("network");
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
}
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async () => { await act(async () => { root.render(<ExchangeRatesViewer isOpen onClose={() => {}} />); }); await settle(); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;
const choose = async (el: Element | null, v: string) => { await act(async () => { const e = el as HTMLSelectElement | HTMLInputElement; Object.getOwnPropertyDescriptor(e.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(e, v); e.dispatchEvent(new Event(e.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); };
const result = () => host.querySelector('[aria-live="polite"]')!.textContent!.replace(/\s/g, " ");

describe("conversion helpers", () => {
  it("convert through the rand and format rates with sensible precision", () => {
    expect(convertAt(RATES, "USD", "ZMW", 100)).toEqual({ rate: 25, result: 2500 });
    expect(convertAt(RATES, "ZAR", "USD", 200)).toEqual({ rate: 0.05, result: 10 });
    expect(convertAt(RATES, "USD", "XXX", 1)).toBeNull(); expect(convertAt(RATES, "USD", "ZMW", NaN)).toBeNull();
    expect(formatRate(18.123456)).toMatch(/18[.,]1235/); expect(formatRate(0.060185)).toMatch(/0[.,]060185/); expect(formatRate(0)).toBe("n/a");
  });
});

describe("ExchangeRatesViewer", () => {
  it("asks the server for the live rates and shows a converter that starts at 100 USD to ZMW, with the source credited", async () => {
    mockApi(() => ({ body: { success: true, data: DATA, cached: true } }));
    await render();
    expect(calls.some((u) => u.endsWith("/api/currency/rates"))).toBe(true);
    expect(host.textContent).toContain("Exchange Rates"); expect(host.textContent).toContain("Currency converter");
    expect(result()).toMatch(/USD\s*100/); expect(result()).toMatch(/ZMW\s*2[ ,.  ]?500/);
    const credit = host.querySelector('a[href="https://www.exchangerate-api.com"]')!;
    expect(credit.textContent).toBe("ExchangeRate-API"); expect(credit.getAttribute("rel")).toContain("noopener");
    expect(host.textContent).toContain("not a quote or an offer"); expect(host.textContent).toContain("June 2027");
    expect(host.textContent).toContain("Convert between any two of 12 currencies");
  });

  it("updates as the amount and the currencies change, and swaps them", async () => {
    mockApi(() => ({ body: { success: true, data: DATA } }));
    await render();
    await choose(host.querySelector('input[aria-label="Amount"]'), "40");
    expect(result()).toMatch(/ZMW\s*1[ ,.  ]?000/);
    await choose(host.querySelector('select[aria-label="To currency"]'), "EUR");
    expect(result()).toMatch(/EUR\s*36/);
    await act(async () => { btn("")!; (host.querySelector('button[aria-label="Swap the two currencies"]') as HTMLButtonElement).click(); });
    expect((host.querySelector('select[aria-label="From currency"]') as HTMLSelectElement).value).toBe("EUR");
    expect((host.querySelector('select[aria-label="To currency"]') as HTMLSelectElement).value).toBe("USD");
    expect(result()).toMatch(/EUR\s*40/); expect(result()).toMatch(/USD\s*44[.,]44/);
    await choose(host.querySelector('input[aria-label="Amount"]'), "abc");
    expect(result()).toContain("Enter an amount");
    await choose(host.querySelector('input[aria-label="Amount"]'), "1,5");
    expect(result()).toMatch(/EUR\s*1[.,]50/);                                                  // a comma works as the decimal mark
  });

  it("lists the popular currencies first, then every other one by name", async () => {
    mockApi(() => ({ body: { success: true, data: DATA } }));
    await render();
    const groups = [...host.querySelectorAll('select[aria-label="From currency"] optgroup')];
    expect(groups.map((g) => g.getAttribute("label"))).toEqual(["Popular", "All currencies"]);
    const popular = [...groups[0].querySelectorAll("option")].map((o) => o.value);
    expect(popular.slice(0, 4)).toEqual(["ZAR", "USD", "ZMW", "CNY"]); expect([...groups[1].querySelectorAll("option")].map((o) => o.value)).toEqual(["JPY"]);
  });

  it("shows the rates against the rand for the regional currencies it has, in a proper table", async () => {
    mockApi(() => ({ body: { success: true, data: DATA } }));
    await render();
    const table = host.querySelector("table")!;
    expect(table.querySelector("caption")!.textContent).toContain("rand");
    const rows = [...table.querySelectorAll("tbody tr")].map((r) => r.querySelector("th")!.textContent!.match(/[A-Z]{3}$/)![0]);
    expect(rows).toEqual(["USD", "EUR", "GBP", "CNY", "ZMW", "BWP", "NAD", "MZN", "SZL", "LSL"]);   // only the currencies the source had; ZWG, MWK, AOA, TZS are left out
    const zmw = [...table.querySelectorAll("tbody tr")].find((r) => r.textContent!.includes("ZMW"))!;
    expect(zmw.textContent).toMatch(/1[.,]25\d*\s*ZMW/); expect(zmw.textContent).toMatch(/0[.,]80\d*\s*ZAR/);
  });

  it("says plainly when the last known rates are being shown because the source is down", async () => {
    mockApi(() => ({ body: { success: true, data: DATA, cached: true, stale: true } }));
    await render();
    expect(host.textContent).toContain("last rates we received");
  });

  it("shows a clear message and a working Try again when the server cannot be reached or has no rates", async () => {
    let fail = true;
    mockApi(() => (fail ? "network" : { body: { success: true, data: DATA } }));
    await render();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("could not reach the server");
    expect(host.querySelector("table")).toBeNull();
    fail = false;
    await act(async () => { btn("Try again")!.click(); }); await settle(); await settle();
    expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.querySelector("table")).not.toBeNull();
    act(() => root.unmount()); host.remove(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    mockApi(() => ({ status: 503, body: { success: false, error: "Exchange rates are temporarily unavailable" } }));
    await render();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("temporarily unavailable");
  });

  it("renders nothing when it is closed, and still works with an older server that does not send the source fields", async () => {
    mockApi(() => ({ body: { success: true, data: { base: "ZAR", rates: RATES, fetchedAt: "2026-10-09T10:00:00Z" } } }));
    await act(async () => { root.render(<ExchangeRatesViewer isOpen={false} onClose={() => {}} />); });
    expect(host.textContent).toBe("");
    await render();
    expect(host.textContent).toContain("ExchangeRate-API"); expect(host.textContent).not.toContain("undefined");
  });
});
