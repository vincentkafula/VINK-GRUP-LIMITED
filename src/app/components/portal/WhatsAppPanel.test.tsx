// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { WhatsAppPanel } from "./WhatsAppPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[], depts: { key: string; name: string; waiting: number }[], windowOpen: boolean, replyError: string | null;
const conv = (o: Record<string, unknown> = {}) => ({ id: "c1", waId: "27821112222", name: "Thandi", department: "support", status: "open", optedIn: true, lastAt: "2026-10-10T09:00:00Z", lastPreview: "Where is my card?", windowOpen, ...o });
const msgs = () => [{ id: "m1", direction: "in", body: "Where is my card?", status: "received", error: null, by: "", at: "2026-10-10T09:00:00Z" }, { id: "m2", direction: "out", body: "Let me check.", status: "delivered", error: null, by: "mandy", at: "2026-10-10T09:05:00Z" }];

beforeEach(() => {
  calls = []; windowOpen = true; replyError = null;
  depts = [{ key: "support", name: "Customer Support", waiting: 2 }, { key: "sales", name: "Sales", waiting: 0 }];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url), method = init?.method ?? "GET"; calls.push({ url: u, init });
    const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (u.endsWith("/api/admin/whatsapp/summary")) return ok({ success: true, departments: depts });
    if (u.includes("/api/admin/whatsapp/conversations?")) return ok({ success: true, conversations: [conv()] });
    if (u.endsWith("/api/admin/whatsapp/conversations/c1")) return ok({ success: true, conversation: conv(), messages: msgs() });
    if (u.endsWith("/conversations/c1/reply") && method === "POST") return replyError ? ok({ success: false, error: replyError }, 409) : ok({ success: true, status: "answered" });
    return ok({ success: true });
  }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async () => { await act(async () => { root.render(<WhatsAppPanel />); }); await settle(); await settle(); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); await settle(); await settle(); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const type = async (el: Element | null, v: string) => { await act(async () => { const e = el as HTMLTextAreaElement; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); }); };

describe("the WhatsApp panel", () => {
  it("shows the departments first, with what is waiting, and no chats until one is chosen", async () => {
    await render();
    expect(q('section[aria-label="Choose a department"]')!.textContent).toContain("2 waiting"); expect(q('section[aria-label="Choose a department"]')!.textContent).toContain("None waiting");
    expect(q('section[aria-label="Chats"]')).toBeNull(); expect(calls.some((c) => c.url.includes("/conversations?"))).toBe(false);
  });
  it("opens a department's chats, then a chat with its messages, who answered and whether they were delivered", async () => {
    await render(); await click(q('button[aria-label="Open Customer Support"]'));
    expect(q('[aria-label="Department"]')!.textContent).toBe("Customer Support"); expect(calls.some((c) => c.url.includes("conversations?department=support&status=open"))).toBe(true);
    expect(q('section[aria-label="Chats"]')!.textContent).toContain("Thandi"); expect(q('[aria-label="Waiting for a reply"]')).toBeTruthy();
    await click(q('section[aria-label="Chats"] ul li button'));
    const t = q('ol[aria-label="Messages"]')!.textContent!; expect(t).toContain("Where is my card?"); expect(t).toContain("mandy"); expect(q('[aria-label="Delivered"]')).toBeTruthy();
    expect(q('section[aria-label="Chat"]')!.textContent).toContain("+27821112222");
  });
  it("sends a reply and clears the box; the server's reason shows when it cannot be sent", async () => {
    await render(); await click(q('button[aria-label="Open Customer Support"]')); await click(q('section[aria-label="Chats"] ul li button'));
    await type(q('textarea[aria-label="Reply"]'), "Your card is ready"); await click(q('button[aria-label="Send reply"]'));
    const r = calls.find((c) => c.url.endsWith("/conversations/c1/reply"))!; expect(JSON.parse(String(r.init!.body))).toEqual({ body: "Your card is ready" }); expect((q('textarea[aria-label="Reply"]') as HTMLTextAreaElement).value).toBe("");
    replyError = "This customer last wrote more than 24 hours ago"; await type(q('textarea[aria-label="Reply"]'), "Hello again"); await click(q('button[aria-label="Send reply"]'));
    expect(q('[role="alert"]')!.textContent).toContain("24 hours"); expect((q('textarea[aria-label="Reply"]') as HTMLTextAreaElement).value).toBe("Hello again");
  });
  it("warns when the 24-hour window has closed", async () => {
    windowOpen = false; await render(); await click(q('button[aria-label="Open Customer Support"]')); await click(q('section[aria-label="Chats"] ul li button'));
    expect(q('[role="note"]')!.textContent).toContain("more than 24 hours ago");
  });
  it("closes a chat, moves it to another department, and goes back to the departments", async () => {
    await render(); await click(q('button[aria-label="Open Customer Support"]')); await click(q('section[aria-label="Chats"] ul li button'));
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Close chat")); expect(JSON.parse(String(calls.find((c) => c.url.endsWith("/conversations/c1/status"))!.init!.body))).toEqual({ status: "closed" });
    const sel = q('select[aria-label="Move to department"]') as HTMLSelectElement; expect([...sel.options].map((o) => o.textContent)).toEqual(["Move to…", "Sales"]);
    await act(async () => { sel.value = "sales"; sel.dispatchEvent(new Event("change", { bubbles: true })); }); await settle(); await settle();
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith("/conversations/c1/department"))!.init!.body))).toEqual({ department: "sales" });
    await click(q('button[aria-label="All departments"]')); expect(q('section[aria-label="Choose a department"]')).toBeTruthy();
  });
  it("opens the department by itself when a person manages only one, and tells a person with none", async () => {
    depts = [depts[0]]; await render(); expect(q('[aria-label="Department"]')!.textContent).toBe("Customer Support"); expect(q('button[aria-label="All departments"]')).toBeNull();
    act(() => root.unmount()); root = createRoot(host); depts = []; await render(); expect(host.textContent).toContain("do not manage a department");
  });
});
