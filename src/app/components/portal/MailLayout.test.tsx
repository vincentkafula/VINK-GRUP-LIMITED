// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MailPanel } from "./MailPanel";
import { listTime, avatarColor, initialOf } from "./mailShared";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("how a message line is written", () => {
  const now = new Date("2026-10-09T14:00:00Z");                                          // 16:00 on Friday 9 October in South Africa
  it("shows the clock time today, Yesterday, the weekday this week, and the date after that", () => {
    expect(listTime("2026-10-09T08:24:00Z", now)).toBe("10:24 AM"); expect(listTime("2026-10-09T13:05:00Z", now)).toBe("3:05 PM");
    expect(listTime("2026-10-08T15:00:00Z", now)).toBe("Yesterday"); expect(listTime("2026-10-06T09:00:00Z", now)).toBe("Tuesday");
    expect(listTime("2026-10-02T09:00:00Z", now)).toMatch(/^02 Oct$/); expect(listTime("2025-12-24T09:00:00Z", now)).toMatch(/24 Dec 2025/);
    expect(listTime("2026-10-08T22:30:00Z", now)).toBe("12:30 AM");                      // 00:30 on the 9th in South Africa is already today
  });
  it("gives the same round colour to the same person and an initial to everyone", () => {
    expect(avatarColor("Pam Mokoena")).toBe(avatarColor("Pam Mokoena")); expect(avatarColor("Pam Mokoena")).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(["Pam", "Sarah", "Mike", "Amazon", "Laura", "Team Nexus", "Google", "Priya"].map(avatarColor)).size).toBeGreaterThan(3);
    expect(initialOf("pam mokoena")).toBe("P"); expect(initialOf("  ñandi")).toBe("Ñ"); expect(initialOf("123 Taxis")).toBe("1"); expect(initialOf("")).toBe("?"); expect(initialOf("***")).toBe("?");
  });
});

let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[], msgs: Record<string, unknown>[];
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const mk = (n: number, o: Record<string, unknown> = {}) => ({ kind: "email", id: id(n), department: "sales", fromName: `Sender ${n}`, fromEmail: `s${n}@example.com`, subject: `Subject ${n}`, preview: `Preview ${n}`, status: n % 2 ? "open" : "answered", at: "2026-10-01T10:00:00Z", starred: false, folder: "inbox", snoozedUntil: null, labels: [], spamReason: null, ...o });
function mockApi(count = 3) {
  calls = []; msgs = Array.from({ length: count }, (_, i) => mk(i + 1));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url); calls.push({ url: u, init });
    const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (u.endsWith("/api/mail/departments")) return ok({ success: true, departments: [{ key: "sales", name: "Sales", address: "sales@vink.co.za", open: 2 }] });
    if (u.includes("/api/mail/messages?")) return ok({ success: true, messages: msgs });
    if (/\/api\/mail\/messages\/email\/[^/]+$/.test(u)) return ok({ success: true, message: { ...mk(1), text: "Body", html: null, attachments: [], thread: [], draft: null, replies: [] } });
    if (u.includes("/api/mail/signature")) return ok({ success: true, signature: { name: "Sam", title: "", phone: "", photoUrl: "", enabled: true, custom: false, department: "Sales", email: "sales@vink.co.za", html: "<p>sig</p>" } });
    if (u.includes("/api/mail/labels?")) return ok({ success: true, labels: [] });
    if (u.endsWith("/api/mail/labels") && init?.method === "POST") return ok({ success: true, label: { id: "l1", name: JSON.parse(String(init.body)).name, color: "#8B0000" } }, 201);
    if (u.includes("/folder") && String(init?.body).includes("trash") && u.includes(id(2))) return ok({ success: false, error: "You do not manage this department's mail" }, 403);
    return ok({ success: true, folder: "inbox", starred: true });
  }));
}
beforeEach(() => { localStorage.clear(); localStorage.setItem("vink.mail.undoSeconds", "0"); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async () => { await act(async () => { root.render(<MailPanel />); }); await settle(); await settle(); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); await settle(); await settle(); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const byLabel = (l: string) => q(`[aria-label="${l}"]`);
const posts = (suffix: string) => calls.filter((c) => c.url.endsWith(suffix) && c.init?.method === "POST");
const tick = (n: number) => q(`input[aria-label^="Select Sender ${n}"]`) as HTMLInputElement;

describe("the webmail layout", () => {
  it("has a sidebar with Compose, the boxes and the labels, a search bar, and a list with a round initial, sender, subject, snippet and time on each line", async () => {
    mockApi(); await render();
    expect(q("aside")!.textContent).toContain("Mail"); expect(byLabel("New email")!.textContent).toContain("Compose");
    expect([...host.querySelectorAll('[aria-label="Boxes"] [role="tab"]')].map((t) => t.textContent!.trim())).toEqual(["Inbox2", "Starred", "Snoozed", "Sent", "Drafts", "Scheduled", "Spam", "Trash"]);
    expect(q("aside")!.textContent).toContain("Labels"); expect(q("aside")!.textContent).toContain("No labels yet.");
    expect(q('input[aria-label="Search mail"]')!.getAttribute("placeholder")).toBe("Search in mail…");
    const row = q("section[aria-label='Messages'] ul li")!;
    expect(row.textContent).toContain("S"); expect(row.textContent).toContain("Sender 1"); expect(row.textContent).toContain("Subject 1"); expect(row.textContent).toContain("Preview 1"); expect(row.textContent).toContain("01 Oct");
    expect(q("section[aria-label='Messages']")!.textContent).toContain("1–3 of 3");
    expect(row.querySelector('[aria-label="Needs an answer"]')).toBeTruthy();                                   // an open message has the blue dot...
    expect(host.querySelectorAll("section[aria-label='Messages'] ul li")[1].querySelector('[aria-label="Needs an answer"]')).toBeNull();            // ...an answered one does not
    expect(byLabel("Your account")!.textContent).toBe("Y");
  });

  it("opens a message from anywhere on its line and goes back with the Back button", async () => {
    mockApi(); await render();
    await click(q("section[aria-label='Messages'] ul li > button")); expect(calls.some((c) => c.url.endsWith(`/api/mail/messages/email/${id(1)}`))).toBe(true);
    expect(q("section[aria-label='Messages']")).toBeNull(); await click(byLabel("Back to the list")); expect(q("section[aria-label='Messages']")).toBeTruthy();
  });

  it("stars a message from the list, and ticking lines shows what can be done to them all", async () => {
    mockApi(); await render();
    await click(q('section[aria-label="Messages"] button[aria-label="Add star"]')); expect(JSON.parse(String(posts(`/messages/email/${id(1)}/star`)[0].init!.body))).toEqual({ starred: true });
    await act(async () => { tick(1).click(); }); await act(async () => { tick(3).click(); });
    expect(q("section[aria-label='Messages']")!.textContent).toContain("2 selected");
    for (const t of ["Report spam", "Star", "Mark closed", "Delete"]) expect([...host.querySelectorAll("section[aria-label='Messages'] button")].some((b) => b.textContent!.trim() === t), t).toBe(true);
    expect(byLabel("Refresh")).toBeNull();
  });

  it("does the same thing to every ticked message, and says when one was refused", async () => {
    mockApi(); await render();
    await act(async () => { tick(1).click(); }); await act(async () => { tick(2).click(); }); await act(async () => { tick(3).click(); });
    await click([...host.querySelectorAll("section[aria-label='Messages'] button")].find((b) => b.textContent!.trim() === "Delete"));
    const sent = posts("/folder"); expect(sent.map((c) => c.url.split("/").slice(-3, -1).join("/"))).toEqual([`email/${id(1)}`, `email/${id(2)}`, `email/${id(3)}`]); expect(sent.every((c) => JSON.parse(String(c.init!.body)).folder === "trash")).toBe(true);
    expect(q('[role="status"]')!.textContent).toContain("do not manage this department");                         // the one that failed is reported
    expect(q("section[aria-label='Messages']")!.textContent).not.toContain("selected");                         // and the ticks are cleared
  });

  it("selects every line at once, and unselects them", async () => {
    mockApi(); await render();
    await click(q('input[aria-label="Select all"]')); expect(tick(1).checked && tick(2).checked && tick(3).checked).toBe(true); expect(q("section[aria-label='Messages']")!.textContent).toContain("3 selected");
    await click(q('input[aria-label="Select all"]')); expect(q("section[aria-label='Messages']")!.textContent).not.toContain("selected");
    await click(byLabel("More")); await click([...host.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Select all")); expect(q("section[aria-label='Messages']")!.textContent).toContain("3 selected");
  });

  it("offers Not spam in Spam and Restore in Trash for ticked lines", async () => {
    mockApi(); await render();
    await click([...host.querySelectorAll('[aria-label="Boxes"] [role="tab"]')].find((b) => b.textContent!.includes("Spam"))); await act(async () => { tick(1).click(); });
    const buttons = () => [...host.querySelectorAll("section[aria-label='Messages'] button")].map((b) => b.textContent!.trim());
    expect(buttons()).toContain("Not spam"); expect(buttons()).not.toContain("Report spam");
    await click([...host.querySelectorAll("section[aria-label='Messages'] button")].find((b) => b.textContent!.trim() === "Not spam")); expect(JSON.parse(String(posts("/folder")[0].init!.body))).toEqual({ folder: "inbox" });
    await click([...host.querySelectorAll('[aria-label="Boxes"] [role="tab"]')].find((b) => b.textContent!.includes("Trash"))); await act(async () => { tick(1).click(); });
    expect(buttons()).toContain("Restore"); expect(buttons()).not.toContain("Delete");
  });

  it("shows 25 messages a page, with Older and Newer", async () => {
    mockApi(60); await render();
    expect(host.querySelectorAll("section[aria-label='Messages'] ul li")).toHaveLength(25); expect(q("section[aria-label='Messages']")!.textContent).toContain("1–25 of 60");
    expect((byLabel("Newer") as HTMLButtonElement).disabled).toBe(true);
    await click(byLabel("Older")); expect(q("section[aria-label='Messages'] ul li")!.textContent).toContain("Sender 26"); expect(q("section[aria-label='Messages']")!.textContent).toContain("26–50 of 60");
    await click(byLabel("Older")); expect(host.querySelectorAll("section[aria-label='Messages'] ul li")).toHaveLength(10); expect((byLabel("Older") as HTMLButtonElement).disabled).toBe(true); expect(q("section[aria-label='Messages']")!.textContent).toContain("51–60 of 60");
    await click(byLabel("Newer")); await click(byLabel("Newer")); expect(q("section[aria-label='Messages']")!.textContent).toContain("1–25 of 60");
  });

  it("starts again at page one when the box or search changes, and says 0 of 0 for an empty box", async () => {
    mockApi(60); await render(); await click(byLabel("Older")); expect(q("section[aria-label='Messages']")!.textContent).toContain("26–50");
    await click([...host.querySelectorAll('[aria-label="Boxes"] [role="tab"]')].find((b) => b.textContent!.includes("Sent"))); expect(q("section[aria-label='Messages']")!.textContent).toContain("1–25 of 60");
    msgs = []; await click(byLabel("Refresh")); expect(q("section[aria-label='Messages']")!.textContent).toContain("0–0 of 0");
  });

  it("makes a label from the plus in the sidebar", async () => {
    mockApi(); await render();
    await click(byLabel("New label")); expect(q('input[aria-label="Label name"]')).toBeTruthy();
    await act(async () => { const e = q('input[aria-label="Label name"]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, "Refunds"); e.dispatchEvent(new Event("input", { bubbles: true })); });
    await click([...host.querySelectorAll("aside button")].find((b) => b.textContent === "Add"));
    expect(JSON.parse(String(posts("/api/mail/labels")[0].init!.body))).toEqual({ department: "sales", name: "Refunds" }); expect(q('input[aria-label="Label name"]')).toBeNull();
  });

  it("shows search tips from the help button, and the settings from the cog", async () => {
    mockApi(); await render();
    await click(byLabel("Search help")); expect(q('[role="note"]')!.textContent).toContain("from:pam"); expect(q('[role="note"]')!.textContent).toContain("has:attachment");
    await click(byLabel("Search help")); expect(q('[role="note"]')).toBeNull();
    await click(byLabel("Mail settings")); expect(q('[aria-label="Settings"]')).toBeTruthy(); expect(q("aside")).toBeTruthy();
  });

  it("goes to the next page after a search, and the sent box has lines you cannot tick", async () => {
    mockApi(); await render();
    await click([...host.querySelectorAll('[aria-label="Boxes"] [role="tab"]')].find((b) => b.textContent!.includes("Sent")));
    expect(q("section[aria-label='Messages'] ul li")!.textContent).toContain("To s1@example.com"); expect(q('input[aria-label^="Select Sender"]')).toBeNull(); expect(q("section[aria-label='Messages'] ul li > button")).toBeNull();
  });
});
