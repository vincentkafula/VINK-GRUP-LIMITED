// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { CrossBorderPanel, VirtualAccountsPanel, PaymentsPanel, DriverAgreements, OwnerAgreements, MarshalFeeSetting, money } from "./MoneyPanels";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
function mockApi(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), init }); const r = handler(String(url), init); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 }); }));
}
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = async (el: React.ReactElement) => { await act(async () => { root.render(el); }); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;

describe("money()", () => { it("shows minor units as rand or kwacha", () => { expect(money(2000)).toMatch(/^R 20[.,]00$/); expect(money(150050, "ZMW").replace(/\s/g, " ")).toMatch(/^K 1 500[.,]50$/); }); });

describe("PaymentsPanel", () => {
  it("lists what I owe and am owed, with the reason a payment is waiting", async () => {
    mockApi(() => ({ body: { success: true, owedByMeCents: 2000, owedToMeCents: 0, payments: [{ id: "1", kind: "marshal_fee", direction: "out", counterparty: "Mo Marshal", amountCents: 2000, remainingCents: 2000, currency: "ZAR", status: "waiting", note: "Marshal fee for a completed trip", dueAt: "2026-10-05T10:00:00Z", paidAt: null, problem: "Not enough money in the payer's account yet" }] } }));
    await render(<PaymentsPanel segment="driver" color="#f00" />);
    expect(host.textContent).toContain("To Mo Marshal"); expect(host.textContent).toContain("Marshal fee"); expect(host.textContent).toMatch(/R 20[.,]00/); expect(host.textContent).toContain("waiting"); expect(host.textContent).toContain("Not enough money");
    expect(calls[0].url).toContain("/api/portal/driver/money/payments");
  });
  it("says so when there are none", async () => {
    mockApi(() => ({ body: { success: true, owedByMeCents: 0, owedToMeCents: 0, payments: [] } }));
    await render(<PaymentsPanel segment="marshal" color="#f00" />);
    expect(host.textContent).toContain("No payments yet");
  });
});

describe("DriverAgreements", () => {
  const A = { id: "a1", ownerName: "Oz Owner", driverName: "Dee", mode: "monthly_salary", amountCents: 500000, currency: "ZAR", payDay: 25, startDate: "2026-11-01", endDate: null, status: "proposed", consentText: "I agree that the owner pays me R 5000.00 each month" };
  it("shows the terms and only sends consent once the box is ticked", async () => {
    mockApi((_url, init) => (init?.method === "POST" ? { body: { success: true } } : { body: { success: true, agreements: [A] } }));
    await render(<DriverAgreements color="#f00" />);
    expect(host.textContent).toMatch(/R 5\s?000[.,]00 on day 25/); expect(host.textContent).toContain("I agree that the owner pays me");
    await act(async () => { btn("Accept")!.click(); }); await settle();
    expect(JSON.parse(String(calls.find((c) => c.url.includes("/accept"))!.init!.body))).toEqual({ consent: false });       // the server refuses this
    await act(async () => { (document.querySelector("input[type=checkbox]") as HTMLInputElement).click(); }); await settle();
    await act(async () => { btn("Accept")!.click(); }); await settle();
    expect(JSON.parse(String(calls.filter((c) => c.url.includes("/accept")).pop()!.init!.body))).toEqual({ consent: true });
  });
  it("empty state", async () => { mockApi(() => ({ body: { success: true, agreements: [] } })); await render(<DriverAgreements color="#f00" />); expect(host.textContent).toContain("no pay agreement yet"); });
});

describe("OwnerAgreements", () => {
  it("asks for a driver and an amount first, lists only accepted drivers, and sends whole cents", async () => {
    mockApi((url, init) => {
      if (url.includes("/drivers")) return { body: { success: true, drivers: [{ driverId: "d1", name: "Dee Driver", status: "active" }, { driverId: "d2", name: "Pending Pat", status: "pending" }] } };
      if (init?.method === "POST") return { body: { success: true, id: "x" } };
      return { body: { success: true, agreements: [] } };
    });
    await render(<OwnerAgreements color="#f00" />);
    expect(host.textContent).toContain("Dee Driver"); expect(host.textContent).not.toContain("Pending Pat");
    await act(async () => { btn("Send to the driver")!.click(); }); await settle();
    expect(host.textContent).toContain("Choose a driver"); expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
    await act(async () => { const s = document.querySelector("select") as HTMLSelectElement; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(s, "d1"); s.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { const i = document.querySelector("input[inputmode=decimal]") as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(i, "3500.50"); i.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { btn("Send to the driver")!.click(); }); await settle();
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toMatchObject({ driverId: "d1", mode: "monthly_salary", amountCents: 350050, currency: "ZAR" });
  });
});

describe("MarshalFeeSetting", () => {
  it("shows the current fee and saves it in cents", async () => {
    mockApi((_url, init) => (init?.method === "PUT" ? { body: { success: true } } : { body: { success: true, marshalFeeCents: 2500 } }));
    await render(<MarshalFeeSetting color="#f00" />);
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("25.00");
    await act(async () => { btn("Save")!.click(); }); await settle();
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "PUT")!.init!.body))).toEqual({ marshalFeeCents: 2500 });
  });
});

describe("VirtualAccountsPanel", () => {
  it("shows my reference with where to pay, my kwacha wallet, and creates a reference on request", async () => {
    mockApi((url, init) => {
      if (url.includes("/wallet")) return { body: { success: true, wallets: [{ currency: "ZMW", balanceCents: 150000 }] } };
      if (init?.method === "POST") return { body: { success: true, reference: "VKR123456789" } };
      return { body: { success: true, accounts: [{ currency: "ZAR", pool: "in_person", poolLabel: "In-Person Payment", reference: "VKR123456785", status: "active", payInto: { accountNumber: "1234567890", holder: "Vink Pool", bank: "Test Bank", type: "Business" } }] } };
    });
    await render(<VirtualAccountsPanel segment="driver" color="#f00" />);
    expect(host.textContent).toContain("VKR123456785"); expect(host.textContent).toContain("account 1234567890"); expect(host.textContent).toContain("ZMW wallet");
    await act(async () => { btn("Get my reference")!.click(); }); await settle();
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "POST")!.init!.body))).toEqual({ currency: "ZAR", pool: "in_person" });
  });
});

describe("CrossBorderPanel", () => {
  const Q = { id: "x1", corridor: "ZA-ZM", sendCents: 100000, sendCurrency: "ZAR", feeCents: 5000, rate: 1.485, receiveCents: 141075, receiveCurrency: "ZMW", recipient: "Zee", expiresAt: "2026-10-05T10:01:00Z", status: "quoted" };
  it("is hidden when no route is open", async () => {
    mockApi(() => ({ body: { success: true, corridors: [], transfers: [] } }));
    await render(<CrossBorderPanel segment="driver" color="#f00" />);
    expect(host.textContent).toBe("");
  });
  it("quotes first, shows what the recipient gets, and only sends after confirm", async () => {
    mockApi((url, init) => {
      if (url.endsWith("/quote")) return { body: { success: true, quote: Q } };
      if (url.endsWith("/confirm")) return { body: { success: true, transfer: { ...Q, status: "completed" } } };
      return { body: { success: true, corridors: [{ id: "ZA-ZM", from: "ZA", to: "ZM", fromCurrency: "ZAR", toCurrency: "ZMW" }], transfers: [] } };
    });
    await render(<CrossBorderPanel segment="driver" color="#f00" />);
    await act(async () => { const i = document.querySelector("input[type=email]") as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(i, "zee@x.test"); i.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { const i = document.querySelector("input[inputmode=decimal]") as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(i, "1000"); i.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { btn("Get a quote")!.click(); }); await settle();
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith("/quote"))!.init!.body))).toEqual({ recipientEmail: "zee@x.test", amountCents: 100000, corridorId: "ZA-ZM" });
    expect(host.textContent).toContain("Zee receives"); expect(calls.some((c) => c.url.endsWith("/confirm"))).toBe(false);
    await act(async () => { btn("Confirm and send")!.click(); }); await settle();
    expect(calls.some((c) => c.url.endsWith("/x1/confirm"))).toBe(true);
  });
});
