// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MailPanel } from "./MailPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: string[];
const DEPTS = [
  { key: "support", name: "Customer Support", address: "support@vink.co.za", open: 0 }, { key: "sales", name: "Sales", address: "sales@vink.co.za", open: 1 }, { key: "general", name: "General Enquiries", address: "info@vink.co.za", open: 0 },
  { key: "compliance", name: "Compliance", address: "compliance@vink.co.za", open: 0 }, { key: "unrouted", name: "Other mail (not addressed to a department)", address: "", open: 0 },
];
let departments = DEPTS;
const msg = (dept: string) => ({ kind: "email", id: "11111111-1111-1111-1111-111111111111", department: dept, fromName: `Person of ${dept}`, fromEmail: "p@example.com", subject: `Subject for ${dept}`, preview: "Hello", status: "open", at: "2026-10-09T10:00:00Z", starred: false, folder: "inbox", snoozedUntil: null, labels: [], spamReason: null });

beforeEach(() => {
  calls = []; departments = DEPTS; localStorage.clear(); localStorage.setItem("vink.mail.undoSeconds", "0");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url); calls.push(u);
    const ok = (b: unknown) => new Response(JSON.stringify(b));
    if (u.endsWith("/api/mail/departments")) return ok({ success: true, departments });
    const m = /messages\?department=([^&]+)/.exec(u); if (m) return ok({ success: true, messages: [msg(m[1])] });
    if (u.includes("/api/mail/labels?")) return ok({ success: true, labels: [] });
    return ok({ success: true });
  }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async () => { await act(async () => { root.render(<MailPanel />); }); await settle(); await settle(); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); await settle(); await settle(); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const tabs = () => [...host.querySelectorAll('[aria-label="Departments"] [role="tab"]')];
const tab = (name: string) => tabs().find((t) => t.textContent!.includes(name));
const sidebar = () => q("aside")!.textContent!;

describe("choosing a department first", () => {
  it("shows only the departments, with what is waiting, until one is chosen: no boxes, no search, no messages", async () => {
    await render();
    expect(tabs().map((t) => t.textContent)).toEqual(["Customer Support", "Sales1", "General Enquiries", "Compliance", "Other mail (not addressed to a department)"]);
    expect(q('[aria-label="Boxes"]')).toBeNull(); expect(q('input[aria-label="Search mail"]')).toBeNull(); expect(q("section[aria-label='Messages']")).toBeNull();
    expect(calls.some((c) => c.includes("/api/mail/messages?"))).toBe(false);          // nothing of any department is even asked for
    expect(q("section[aria-label='Choose a department']")!.textContent).toContain("Pick a department to open its mail");
    expect([...host.querySelectorAll("section[aria-label='Choose a department'] button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Open Customer Support", "Open Sales", "Open General Enquiries", "Open Compliance", "Open Other mail (not addressed to a department)"]);
    expect(q("section[aria-label='Choose a department']")!.textContent).toContain("1 waiting");
    expect(q('[aria-label="New email"]')).toBeTruthy(); expect(q('[aria-label="Mail settings"]')).toBeTruthy();                // Compose and Settings are always there
  });

  it("opens just that department when its name is clicked, and hides every other department", async () => {
    await render(); await click(tab("Sales"));
    expect(q('[aria-label="Boxes"]')).toBeTruthy(); expect(q("section[aria-label='Messages']")!.textContent).toContain("Subject for sales");
    expect(q('[aria-label="Departments"]')).toBeNull();
    expect(sidebar()).toContain("sales@vink.co.za");
    for (const other of ["Customer Support", "General Enquiries", "Compliance", "Other mail"]) expect(host.textContent, other).not.toContain(other);
    expect(calls.filter((c) => c.includes("/api/mail/messages?")).every((c) => c.includes("department=sales"))).toBe(true);
    expect(q('input[aria-label="Search mail"]')).toBeTruthy(); expect(q('[aria-label="Department"]')!.textContent).toBe("Sales");
  });

  it("opens from a department card in the middle of the page too", async () => {
    await render(); await click(q('button[aria-label="Open Compliance"]'));
    expect(q('[aria-label="Department"]')!.textContent).toBe("Compliance"); expect(calls.some((c) => c.includes("messages?department=compliance&box=inbox"))).toBe(true);
  });

  it("goes back to the list of departments, closing the one that was open, and can open another", async () => {
    await render(); await click(tab("Sales"));
    await click(q('button[aria-label="All departments"]'));
    expect(tabs()).toHaveLength(5); expect(q('[aria-label="Boxes"]')).toBeNull(); expect(q('input[aria-label="Search mail"]')).toBeNull(); expect(host.textContent).not.toContain("Subject for sales");
    calls.length = 0; await click(tab("Compliance"));
    expect(calls.filter((c) => c.includes("/api/mail/messages?")).every((c) => c.includes("department=compliance"))).toBe(true); expect(host.textContent).toContain("Subject for compliance"); expect(host.textContent).not.toContain("Subject for sales");
  });

  it("opens by itself when a person manages only one department", async () => {
    departments = [DEPTS[1]]; await render();
    expect(q('[aria-label="Department"]')!.textContent).toBe("Sales"); expect(q('[aria-label="Boxes"]')).toBeTruthy(); expect(q("section[aria-label='Messages']")!.textContent).toContain("Subject for sales");
  });

  it("tells the person to choose a department, in the bar where the search would be", async () => {
    await render(); expect(q("main")!.textContent).toContain("Choose a department to read its mail.");
  });
});
