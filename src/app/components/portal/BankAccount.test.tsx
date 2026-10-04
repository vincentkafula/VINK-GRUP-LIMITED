// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { BankStrip, BankScreen, spaced, copyText, type BankInfo, type BankLink } from "./BankAccount";
import { ACCOUNT_RULES as CLIENT_RULES, businessProblem, type BankRole } from "./bankRules";
import { ACCOUNT_RULES as SERVER_RULES } from "../../../../server/src/portal/bankRules";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINK: BankLink = {
  id: "l1", status: "verified", reviewNote: null, updatedAt: "2026-10-03T10:00:00Z", holderName: "Oz Owner", accountType: "Personal", holderType: "personal", businessName: null, registrationNumber: null,
  bankName: "Manshya Finance", branchCode: "000001", currency: "ZAR", accountMissing: false, accountNumber: "1234567890", accountName: "Personal current", accountKind: "current", accountId: "acc1", balance: 1500.5,
};
const info = (role: BankRole, over: Partial<BankInfo> = {}): BankInfo => ({ role, rules: { allowed: SERVER_RULES[role].allowed, message: SERVER_RULES[role].message }, channels: [], link: null, accounts: [], ...over });

let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
function mockApi(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), init }); const r = handler(String(url), init); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 }); }));
}
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = async (el: React.ReactElement) => { await act(async () => { root.render(el); }); await settle(); };
const btn = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
const setInput = (el: HTMLInputElement, v: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });

describe("rules table", () => {
  it("is identical to the server's, so the form never promises something the server refuses", () => {
    expect(CLIENT_RULES).toEqual(Object.fromEntries(Object.entries(SERVER_RULES).map(([r, v]) => [r, { allowed: v.allowed, message: v.message }])));
  });
  it("businessProblem mirrors the server checks", () => {
    expect(businessProblem("Acme (Pty) Ltd", "2015/123456/07")).toEqual({});
    expect(businessProblem("A", "123")).toEqual({ name: expect.any(String), reg: expect.any(String) });
    expect(businessProblem("<b>x</b>", "2015/123456/07").name).toMatch(/not allowed/);
  });
  it("spaced() groups the number for reading", () => { expect(spaced("1234567890")).toBe("1234 5678 90"); expect(spaced("123456")).toBe("1234 56"); });
});

describe("BankStrip", () => {
  it("empty state: says no account is linked, explains the rule, and has a Link account button", async () => {
    mockApi(() => ({ body: { success: true, ...info("association") } }));
    await render(<BankStrip segment="association" color="#f00" onOpen={() => {}} />);
    expect(host.textContent).toContain("No bank account linked yet"); expect(host.textContent).toContain("Associations must use a Business account.");
    expect(btn("Link account")).toBeTruthy();
  });

  it("linked: shows the account number prominently with holder, bank, type and status, and a working copy button", async () => {
    const writeText = vi.fn(async () => {}); Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mockApi(() => ({ body: { success: true, ...info("vehicle_owner", { link: LINK }) } }));
    await render(<BankStrip segment="owner" color="#f00" onOpen={() => {}} />);
    expect(host.querySelector("[data-testid=account-number]")!.textContent).toBe("1234 5678 90");
    for (const t of ["Oz Owner", "Manshya Finance", "Personal", "Verified"]) expect(host.textContent).toContain(t);
    await act(async () => { btn("Copy")!.click(); });
    expect(writeText).toHaveBeenCalledWith("1234567890");                       // the plain number, not the spaced one
    expect(host.textContent).toContain("Copied");
  });

  it("copy falls back gracefully and reports a failure instead of pretending", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
    document.execCommand = vi.fn(() => false);
    expect(await copyText("1234567890")).toBe(false);
  });

  it("a Business account shows the business as the holder, and a pending review is visible", async () => {
    mockApi(() => ({ body: { success: true, ...info("association", { link: { ...LINK, holderName: "Acme Taxis (Pty) Ltd", accountType: "Business", holderType: "business", status: "pending_review", registrationNumber: "2015/123456/07" } }) } }));
    await render(<BankStrip segment="association" color="#f00" onOpen={() => {}} />);
    expect(host.textContent).toContain("Acme Taxis (Pty) Ltd"); expect(host.textContent).toContain("Business"); expect(host.textContent).toContain("Pending review");
  });
});

describe("Link account dialog", () => {
  const open = async (role: BankRole, segment: string, extra: Partial<BankInfo> = {}) => {
    mockApi((url, init) => (init?.method === "POST" ? { status: 201, body: { success: true } } : { body: { success: true, ...info(role, extra) } }));
    await render(<BankStrip segment={segment} color="#f00" onOpen={() => {}} />);
    await act(async () => { btn("Link account")!.click(); });
  };
  const radio = (v: string) => [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((r) => r.parentElement?.textContent === v)!;

  it("an association can only pick Business; Personal is disabled and the reason is shown", async () => {
    await open("association", "association");
    expect(radio("Personal").disabled).toBe(true); expect(radio("Business").disabled).toBe(false); expect(radio("Business").checked).toBe(true);
    expect(document.querySelector("[role=dialog]")!.textContent).toContain("Associations must use a Business account.");
    expect(document.querySelector("input[placeholder='2015/123456/07']")).toBeTruthy();                        // business fields are already showing
  });

  it("a driver can only pick Personal, and no business fields appear", async () => {
    await open("driver", "driver");
    expect(radio("Business").disabled).toBe(true); expect(radio("Personal").checked).toBe(true);
    expect(document.querySelector("[role=dialog]")!.textContent).toContain("Drivers must use a Personal account.");
    expect(document.querySelector("input[placeholder='2015/123456/07']")).toBeNull();
  });

  it("an owner or investor can pick either, and choosing Business reveals the business fields", async () => {
    await open("vehicle_owner", "owner");
    expect(radio("Personal").disabled).toBe(false); expect(radio("Business").disabled).toBe(false);
    await act(async () => { radio("Business").click(); });
    expect(document.querySelector("input[placeholder='2015/123456/07']")).toBeTruthy();
  });

  it("an invalid business name or registration number is caught before anything is sent", async () => {
    await open("association", "association");
    const posts = () => calls.filter((c) => c.init?.method === "POST").length;
    await act(async () => { btn("Link account")!.parentElement!.querySelector("button")!.click(); });
    const dialogBtn = [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent === "Link account") as HTMLButtonElement;
    await act(async () => { dialogBtn.click(); }); await settle();
    expect(document.querySelector("[role=dialog]")!.textContent).toMatch(/registered business name|registration number/);
    expect(posts()).toBe(0);
    await setInput(document.querySelector("[role=dialog] input[autocomplete=organization]")!, "Acme Taxis (Pty) Ltd");
    await setInput(document.querySelector("input[placeholder='2015/123456/07']")!, "12345");
    await act(async () => { dialogBtn.click(); }); await settle();
    expect(document.querySelector("[role=dialog]")!.textContent).toContain("format 2015/123456/07"); expect(posts()).toBe(0);
  });

  it("a valid form posts the details; a server refusal is shown in the server's own words", async () => {
    mockApi((url, init) => init?.method === "POST" ? { status: 422, body: { success: false, error: "Associations must use a Business account." } } : { body: { success: true, ...info("association") } });
    await render(<BankStrip segment="association" color="#f00" onOpen={() => {}} />);
    await act(async () => { btn("Link account")!.click(); });
    await setInput(document.querySelector("[role=dialog] input[autocomplete=organization]")!, "Acme Taxis (Pty) Ltd");
    await setInput(document.querySelector("input[placeholder='2015/123456/07']")!, "2015/123456/07");
    const dialogBtn = [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent === "Link account") as HTMLButtonElement;
    await act(async () => { dialogBtn.click(); }); await settle();
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(post.url).toMatch(/\/api\/portal\/association\/bank\/link$/);
    expect(JSON.parse(String(post.init!.body))).toMatchObject({ holderType: "business", businessName: "Acme Taxis (Pty) Ltd", registrationNumber: "2015/123456/07" });
    expect(document.querySelector("[role=dialog]")!.textContent).toContain("Associations must use a Business account.");
  });

  it("Escape closes the dialog", async () => {
    await open("driver", "driver");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });
});

describe("BankScreen", () => {
  it("shows the full details, recent transactions, and the payment channel accounts (or a clear note when one isn't set up)", async () => {
    mockApi((url) => url.includes("/transactions")
      ? { body: { success: true, transactions: [{ at: "2026-10-03T10:00:00Z", type: "transfer", description: "Salary", amount: 1500, balance: 1500 }] } }
      : { body: { success: true, ...info("vehicle_owner", { link: LINK, channels: [{ channel: "in_person", label: "In-Person Payment", configured: true, accountNumber: "9000000002", holder: "Manshya In-Person", bank: "Manshya Finance", type: "Business" }, { channel: "online", label: "Online Payment", configured: false }] }) } });
    await render(<BankScreen segment="owner" color="#f00" />);
    for (const t of ["1234 5678 90", "Personal current", "000001", "Salary", "In-Person Payment", "9000 0000 02", "Online Payment", "has not been set up for display yet"]) expect(host.textContent).toContain(t);
    expect(btn("Edit details")).toBeTruthy(); expect(btn("Remove link")).toBeTruthy();
  });

  it("empty state offers to link an account", async () => {
    mockApi(() => ({ body: { success: true, ...info("marshal") } }));
    await render(<BankScreen segment="marshal" color="#f00" />);
    expect(host.textContent).toContain("No bank account linked yet"); expect(host.textContent).toContain("Marshals must use a Personal account."); expect(btn("Link account")).toBeTruthy();
  });

  it("a rejected business account explains why and how to fix it", async () => {
    mockApi((url) => url.includes("/transactions") ? { body: { success: true, transactions: [] } } : { body: { success: true, ...info("association", { link: { ...LINK, accountType: "Business", holderType: "business", status: "rejected", reviewNote: "Registration number not found" } }) } });
    await render(<BankScreen segment="association" color="#f00" />);
    expect(host.textContent).toContain("Registration number not found"); expect(host.textContent).toContain("send them for review again");
  });
});
