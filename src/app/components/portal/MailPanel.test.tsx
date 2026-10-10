// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MailPanel } from "./MailPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
const DEPTS = [{ key: "sales", name: "Sales", address: "sales@vink.co.za", open: 2 }, { key: "support", name: "Customer Support", address: "support@vink.co.za", open: 0 }];
const MSG = { kind: "web", id: "11111111-1111-1111-1111-111111111111", department: "sales", fromName: "Thandi Nkosi", fromEmail: "thandi@example.com", subject: "Price list", preview: "Please send prices", status: "open", at: "2026-10-09T08:00:00Z", ref: "VK-ABC234" };
function mockApi(opts: { departments?: unknown[]; messages?: unknown[] } = {}) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url); let status = 200; let body: unknown = { success: true };
    if (u.endsWith("/api/mail/departments")) body = { success: true, departments: opts.departments ?? DEPTS };
    else if (u.includes("/api/mail/messages?")) body = { success: true, messages: opts.messages ?? [MSG] };
    else if (/\/api\/mail\/messages\/web\/[^/]+$/.test(u)) body = { success: true, message: { ...MSG, text: "Please send me your price list.\n<script>alert(1)</script>", replies: [{ id: "r1", to: "thandi@example.com", subject: "Re: Price list", body: "We will send it today.", status: "sent", by: "sam", at: "2026-10-09T09:00:00Z" }] } };
    else if (u.endsWith("/reply")) { status = 201; body = { success: true, id: "r2" }; }
    else if (u.endsWith("/send")) { status = 201; body = { success: true, id: "s1" }; }
    return new Response(JSON.stringify(body), { status });
  }));
}
beforeEach(() => { localStorage.clear(); localStorage.setItem("vink.mail.undoSeconds", "0"); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async (choose = true) => { await act(async () => { root.render(<MailPanel />); }); await settle(); await settle(); if (choose) { await act(async () => { (document.querySelector('[aria-label="Departments"] [role="tab"]') as HTMLButtonElement).click(); }); await settle(); await settle(); } };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t) || b.getAttribute("aria-label") === t) as HTMLButtonElement | undefined;
const type = async (el: HTMLElement | null, v: string) => { await act(async () => { if ((el as HTMLElement | null)?.getAttribute("contenteditable") === "true") { (el as HTMLElement).innerHTML = `<div>${v}</div>`; (el as HTMLElement).dispatchEvent(new Event("input", { bubbles: true })); return; } const e = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : e.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(e, v); e.dispatchEvent(new Event(e.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); };

describe("MailPanel", () => {
  it("shows only the departments the server returned, with the waiting count, and loads the first department's messages", async () => {
    mockApi(); await render(false);
    expect([...document.querySelectorAll('[aria-label="Departments"] [role="tab"]')].map((t) => t.textContent)).toEqual(["Sales2", "Customer Support"]);
    expect(document.querySelector('[aria-label="Boxes"]')).toBeNull(); expect(document.querySelector("section[aria-label='Messages']")).toBeNull();          // nothing of any department is shown until one is chosen
    expect(calls.some((c) => c.url.includes("/api/mail/messages?"))).toBe(false); expect(host.textContent).toContain("Choose a department");
    await act(async () => { (document.querySelector('[aria-label="Departments"] [role="tab"]') as HTMLButtonElement).click(); }); await settle(); await settle();
    expect(host.textContent).toContain("sales@vink.co.za");
    expect(calls.some((c) => c.url.includes("/api/mail/messages?department=sales&box=inbox&status=open"))).toBe(true);
    expect(host.textContent).toContain("Thandi Nkosi"); expect(host.textContent).toContain("from the website");
  });

  it("tells a person who manages no department how to get one", async () => {
    mockApi({ departments: [] }); await render(false);
    expect(host.textContent).toContain("do not manage any department mailbox"); expect(host.textContent).toContain("Apply for a Section");
    expect(document.querySelectorAll('[aria-label="Departments"] [role="tab"]')).toHaveLength(0);
  });

  it("opens a message as plain text with the replies already sent, and sends a reply to the right message", async () => {
    mockApi(); await render();
    await act(async () => { (document.querySelector("ul button") as HTMLButtonElement).click(); }); await settle(); await settle();
    expect(host.textContent).toContain("Please send me your price list."); expect(host.textContent).toContain("We will send it today.");
    expect(host.querySelector("script")).toBeNull();                                          // a script in a message is text, never markup
    await type(host.querySelector('[aria-label="Your reply"][contenteditable="true"]'), "Prices are attached.");
    await act(async () => { btn("Send reply")!.click(); }); await settle();
    const post = calls.find((c) => c.url.endsWith("/api/mail/messages/web/11111111-1111-1111-1111-111111111111/reply"))!;
    expect(post.init!.method).toBe("POST"); expect(JSON.parse(String(post.init!.body))).toEqual({ bodyHtml: "<div>Prices are attached.</div>" });
  });

  it("writes a new email from a chosen department", async () => {
    mockApi(); await render();
    await act(async () => { btn("New email")!.click(); }); await settle();
    await type(host.querySelector('select[aria-label="From"]'), "support");
    await type(host.querySelector('input[aria-label="To"]'), "buyer@example.com");
    await type(host.querySelector('input[aria-label="Subject"]'), "Your quote");
    await type(host.querySelector('[aria-label="Message"][contenteditable="true"]'), "Here is your quote.");
    expect(btn("Send from support@vink.co.za")).toBeTruthy();
    await act(async () => { btn("Send from support@vink.co.za")!.click(); }); await settle();
    const post = calls.find((c) => c.url.endsWith("/api/mail/send"))!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ department: "support", to: "buyer@example.com", subject: "Your quote", bodyHtml: "<div>Here is your quote.</div>" });
  });

  it("switching department or box asks for that department's messages", async () => {
    mockApi(); await render(false);
    await act(async () => { (document.querySelectorAll('[aria-label="Departments"] [role="tab"]')[1] as HTMLButtonElement).click(); }); await settle(); await settle();
    expect(calls.some((c) => c.url.includes("messages?department=support&box=inbox"))).toBe(true);
    await act(async () => { btn("Sent")!.click(); }); await settle();
    expect(calls.some((c) => c.url.includes("messages?department=support&box=sent"))).toBe(true);
  });
});
