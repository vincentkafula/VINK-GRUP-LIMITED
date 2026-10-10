// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { DepartmentsPanel } from "./DepartmentsPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[], depts: Record<string, unknown>[], failNext: string | null;
const built = (key: string, name: string, address: string, o: Record<string, unknown> = {}) => ({ key, name, address, purpose: `About ${name}`, respondWithin: "1–2 business days", builtIn: true, public: true, active: true, messages: 3, managers: 1, ...o });
const legal = { key: "legal-affairs", name: "Legal Affairs", address: "legal@vink.co.za", purpose: "Contracts and legal questions", respondWithin: "2 days", builtIn: false, public: false, active: true, messages: 0, managers: 0 };

beforeEach(() => {
  calls = []; failNext = null; depts = [built("sales", "Sales", "sales@vink.co.za"), built("support", "Customer Support", "support@vink.co.za", { messages: 1, managers: 2 }), legal];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url), method = init?.method ?? "GET"; calls.push({ url: u, init });
    const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (failNext && method !== "GET") { const f = failNext; failNext = null; return ok({ success: false, error: f }, 400); }
    if (u.endsWith("/api/admin/departments") && method === "GET") return ok({ success: true, departments: depts, domain: "vink.co.za" });
    if (u.endsWith("/api/admin/departments") && method === "POST") { const b = JSON.parse(String(init!.body)); const d = { ...legal, key: "hr-team", name: b.name, address: `${b.mailbox}@vink.co.za`, public: b.public }; depts = [...depts, d]; return ok({ success: true, department: d }, 201); }
    if (u.includes("/api/admin/departments/") && method === "PATCH") return ok({ success: true });
    return ok({ success: true });
  }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async () => { await act(async () => { root.render(<DepartmentsPanel />); }); await settle(); await settle(); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); await settle(); await settle(); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const type = async (el: Element | null, v: string) => { await act(async () => { const e = el as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); }); };
const check = async (el: Element | null) => { await act(async () => { (el as HTMLInputElement).click(); }); };
const btn = (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === t || b.getAttribute("aria-label") === t) as HTMLButtonElement | undefined;
const card = (name: string) => [...host.querySelectorAll('ul[aria-label="Departments"] > li')].find((l) => l.textContent!.includes(name)) as HTMLElement;
const sent = (method: string, suffix = "") => calls.filter((c) => c.init?.method === method && c.url.endsWith(`/api/admin/departments${suffix}`));

describe("the departments panel", () => {
  it("lists every department with its address, what it is for, whether it is built in, public and active, and its message and manager counts", async () => {
    await render();
    expect(host.querySelectorAll('ul[aria-label="Departments"] > li')).toHaveLength(3);
    const sales = card("Sales").textContent!; for (const t of ["Sales", "sales@vink.co.za", "About Sales", "Built in", "On the Contact page", "Active", "3 messages", "1 manager"]) expect(sales, t).toContain(t);
    expect(card("Customer Support").textContent).toContain("1 message"); expect(card("Customer Support").textContent).not.toContain("1 messages"); expect(card("Customer Support").textContent).toContain("2 managers");
    const l = card("Legal Affairs").textContent!; for (const t of ["Made here", "Internal only", "Active", "0 messages", "0 managers", "legal@vink.co.za"]) expect(l, t).toContain(t);
    expect(card("Sales").querySelector("a[href='mailto:sales@vink.co.za']")).toBeTruthy();
  });

  it("lets the ones made here be edited, and not the built-in ones", async () => {
    await render();
    expect(card("Sales").querySelector('button[aria-label^="Edit"]')).toBeNull(); expect(card("Legal Affairs").querySelector('button[aria-label="Edit Legal Affairs"]')).toBeTruthy();
  });

  it("switches a department off or on, makes it public, and saves what it is for", async () => {
    await render(); await click(btn("Edit Legal Affairs"));
    expect((q('input[aria-label="What it is for"]') as HTMLInputElement).value).toBe("Contracts and legal questions"); expect((q('input[aria-label="Reply time"]') as HTMLInputElement).value).toBe("2 days");
    expect((q('input[aria-label="Show on the Contact page"]') as HTMLInputElement).checked).toBe(false); expect((q('input[aria-label="Active"]') as HTMLInputElement).checked).toBe(true);
    await type(q('input[aria-label="What it is for"]'), "Contracts, leases and disputes"); await check(q('input[aria-label="Show on the Contact page"]')); await check(q('input[aria-label="Active"]'));
    await click(btn("Save changes"));
    expect(JSON.parse(String(sent("PATCH", "/legal-affairs")[0].init!.body))).toEqual({ purpose: "Contracts, leases and disputes", respondWithin: "2 days", public: true, active: false });
    expect(q('input[aria-label="What it is for"]')).toBeNull();                                      // the editor closes after saving
    await click(btn("Edit Legal Affairs")); await click(btn("Close")); expect(q('input[aria-label="What it is for"]')).toBeNull();
  });

  it("shows the reason when a change is refused", async () => {
    await render(); await click(btn("Edit Legal Affairs")); failNext = "Say what this department is for";
    await click(btn("Save changes")); expect(q('[role="alert"]')!.textContent).toContain("Say what this department is for"); expect(q('input[aria-label="What it is for"]')).toBeTruthy();
  });

  it("makes a department from a name and a mailbox, shows its address, clears the form, and says what to do next", async () => {
    await render();
    expect(host.textContent).toContain("@vink.co.za"); expect(q('input[aria-label="Mailbox name"]')!.parentElement!.textContent).toContain("@vink.co.za");
    await type(q('input[aria-label="Department name"]'), "HR Team"); await type(q('input[aria-label="Mailbox name"]'), "PEOPLE"); await type(q('input[aria-label="Purpose"]'), "Staff questions"); await check(q('input[aria-label="Show on the public Contact page"]'));
    await click(btn("Create department"));
    expect(JSON.parse(String(sent("POST")[0].init!.body))).toEqual({ name: "HR Team", mailbox: "people", purpose: "Staff questions", public: true });          // lower case, and no empty reply time
    expect(host.textContent).toContain("HR Team is ready"); expect(host.textContent).toContain("people@vink.co.za"); expect(host.textContent).toContain('approve them for the section "HR Team"');
    expect((q('input[aria-label="Department name"]') as HTMLInputElement).value).toBe(""); expect((q('input[aria-label="Mailbox name"]') as HTMLInputElement).value).toBe("");
    expect(card("HR Team")).toBeTruthy();
  });

  it("sends the reply time when one is typed, and shows the server's reason when a department is refused, keeping what was typed", async () => {
    await render(); await type(q('input[aria-label="Department name"]'), "Legal Affairs"); await type(q('input[aria-label="Mailbox name"]'), "admin"); await type(q('input[aria-label="Response time"]'), "3 days");
    failNext = "\"admin\" is kept for the system. Choose another mailbox name"; await click(btn("Create department"));
    expect(JSON.parse(String(sent("POST")[0].init!.body))).toMatchObject({ respondWithin: "3 days", public: false }); expect(q('[role="alert"]')!.textContent).toContain("kept for the system");
    expect((q('input[aria-label="Department name"]') as HTMLInputElement).value).toBe("Legal Affairs"); expect(host.querySelectorAll('ul[aria-label="Departments"] > li')).toHaveLength(3);
  });

  it("says so when the list cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, error: "Forbidden" }), { status: 403 }))); await render();
    expect(q('[role="alert"]')!.textContent).toContain("Forbidden");
  });
});
