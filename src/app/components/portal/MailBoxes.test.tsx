// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MailPanel } from "./MailPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "33333333-3333-3333-3333-333333333333";
const item = (o: Record<string, unknown>) => ({ kind: "email", id: A, department: "sales", fromName: "Pam Mokoena", fromEmail: "pam@example.com", subject: "Taxi rank levy", preview: "Please advise", status: "open", at: "2026-10-09T10:00:00Z", starred: false, folder: "inbox", ...o });
const DRAFT_STANDALONE = { id: "d1", department: "sales", to: "buyer@example.com", subject: "Your quote", body: "Hello buyer", replyKind: null, replyId: null, attachments: [], updatedAt: "2026-10-09T11:00:00Z" };
const DRAFT_REPLY = { id: "d2", department: "sales", to: "", subject: "", body: "Dear Pam, ", replyKind: "email", replyId: A, attachments: [], updatedAt: "2026-10-09T12:00:00Z" };
let detail: Record<string, unknown>, draftsList: unknown[], failSend = false;

function mockApi() {
  calls = []; failSend = false;
  detail = { ...item({}), text: "Please advise on the levy.", html: null, attachments: [], thread: [], draft: null, replies: [] };
  draftsList = [DRAFT_STANDALONE, DRAFT_REPLY];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url); calls.push({ url: u, init });
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.endsWith("/api/mail/departments")) return ok({ success: true, departments: [{ key: "sales", name: "Sales", address: "sales@vink.co.za", open: 3, drafts: 2 }] });
    if (u.includes("/api/mail/messages?")) return ok({ success: true, messages: [item({}), item({ id: B, subject: "Second", starred: true })] });
    if (u.includes("/api/mail/drafts?")) return ok({ success: true, drafts: draftsList });
    if (u.endsWith("/api/mail/drafts") && init?.method === "POST") return ok({ success: true, id: "new-draft-id" });
    if (u.includes("/api/mail/drafts/") && init?.method === "DELETE") return ok({ success: true, removed: true });
    if (/\/api\/mail\/messages\/email\/[^/]+$/.test(u)) { const id = u.split("/").pop(); return ok({ success: true, message: { ...detail, id } }); }
    if (u.endsWith("/star")) return ok({ success: true, folder: "inbox", starred: true });
    if (u.endsWith("/folder")) return ok({ success: true, folder: "spam", starred: false });
    if (u.endsWith("/send") && failSend) return ok({ success: false, error: "The email could not be sent right now." }, 502);
    if (u.endsWith("/send")) return ok({ success: true, id: "s1" }, 201);
    if (u.endsWith("/reply")) return ok({ success: true, id: "r2" }, 201);
    return ok({ success: true });
  }));
}
beforeEach(() => { localStorage.clear(); localStorage.setItem("vink.mail.undoSeconds", "0"); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async () => { await act(async () => { root.render(<MailPanel />); }); await settle(); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t) || b.getAttribute("aria-label") === t) as HTMLButtonElement | undefined;
const box = (name: string) => [...document.querySelectorAll('[aria-label="Boxes"] [role="tab"]')].find((b) => b.textContent?.includes(name)) as HTMLButtonElement;
const click = async (el: HTMLElement | undefined) => { await act(async () => { el!.click(); }); await settle(); await settle(); };
const type = async (el: Element | null, v: string) => { await act(async () => { const e = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : e.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(e, v); e.dispatchEvent(new Event(e.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); };
const openFirst = async () => { await click(document.querySelector("section[aria-label='Messages'] ul button") as HTMLElement); await settle(); };
const posts = (suffix: string) => calls.filter((c) => c.url.endsWith(suffix) && c.init?.method === "POST");
const body = (c: { init?: RequestInit }) => JSON.parse(String(c.init!.body));

describe("boxes", () => {
  it("has Inbox, Starred, Drafts, Sent, Spam and Trash, with the waiting and draft counts, and asks for the right box", async () => {
    mockApi(); await render();
    expect([...document.querySelectorAll('[aria-label="Boxes"] [role="tab"]')].map((t) => t.textContent!.replace(/\s+/g, " ").trim())).toEqual(["Inbox(3)", "Starred", "Drafts(2)", "Sent", "Spam", "Trash"]);
    for (const [name, param] of [["Starred", "starred"], ["Spam", "spam"], ["Trash", "trash"], ["Sent", "sent"]] as const) {
      await click(box(name)); expect(calls.some((c) => c.url.includes(`messages?department=sales&box=${param}`)), name).toBe(true);
    }
    await click(box("Inbox")); expect(calls.filter((c) => c.url.includes("box=inbox&status=open")).length).toBeGreaterThan(0);
    expect(box("Inbox").getAttribute("aria-selected")).toBe("true");
  });

  it("says what an empty box is for, and marks starred messages", async () => {
    mockApi(); await render();
    expect(document.querySelector('[aria-label="Starred"]')).toBeTruthy();                      // the star on the second message
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response(JSON.stringify(String(u).endsWith("/departments") ? { success: true, departments: [{ key: "sales", name: "Sales", address: "sales@vink.co.za", open: 0 }] } : { success: true, messages: [] }))));
    await click(box("Spam")); expect(host.textContent).toContain("Nothing in Spam."); await click(box("Trash")); expect(host.textContent).toContain("Trash is empty.");
    await click(box("Starred")); expect(host.textContent).toContain("No starred messages");
  });
});

describe("drafts box", () => {
  it("lists the person's drafts; a new email opens in the editor, a reply draft opens its message", async () => {
    mockApi(); await render(); await click(box("Drafts"));
    expect(calls.some((c) => c.url.includes("/api/mail/drafts?department=sales"))).toBe(true);
    expect(host.textContent).toContain("buyer@example.com"); expect(host.textContent).toContain("Your quote"); expect(host.textContent).toContain("Reply draft");
    const items = [...document.querySelectorAll("section[aria-label='Messages'] ul button")] as HTMLElement[];
    await click(items[0]);
    expect((host.querySelector('input[aria-label="To"]') as HTMLInputElement).value).toBe("buyer@example.com");
    expect((host.querySelector('input[aria-label="Subject"]') as HTMLInputElement).value).toBe("Your quote");
    expect((host.querySelector('textarea[aria-label="Message"]') as HTMLTextAreaElement).value).toBe("Hello buyer");
    expect(host.textContent).toContain("Discard draft");
    await click((document.querySelectorAll("section[aria-label='Messages'] ul button")[1]) as HTMLElement);
    expect(calls.some((c) => c.url.endsWith(`/api/mail/messages/email/${A}`))).toBe(true);        // the message the reply belongs to
    expect(box("Inbox").getAttribute("aria-selected")).toBe("true");
  });

  it("says so when there are no drafts", async () => {
    mockApi(); draftsList = []; await render(); await click(box("Drafts")); expect(host.textContent).toContain("No drafts.");
  });

  it("discards a draft", async () => {
    mockApi(); await render(); await click(box("Drafts")); await click(document.querySelector("section[aria-label='Messages'] ul button") as HTMLElement);
    await click(btn("Discard draft"));
    expect(calls.some((c) => c.init?.method === "DELETE" && c.url.endsWith("/api/mail/drafts/d1"))).toBe(true);
    expect(host.querySelector('input[aria-label="To"]')).toBeNull();
  });
});

describe("search", () => {
  it("searches all mail from the inbox with the operators the person typed, and clears", async () => {
    mockApi(); await render();
    await type(host.querySelector('input[aria-label="Search mail"]'), "from:pam has:attachment");
    await click(btn("Search"));
    expect(calls.some((c) => c.url.includes("box=all") && c.url.includes("q=from%3Apam%20has%3Aattachment"))).toBe(true);
    expect(host.textContent).toContain("Searching all mail for: from:pam has:attachment");
    expect(host.querySelector('select[aria-label="Show"]')).toBeNull();                         // the Open/Answered filter does not apply to a search
    await click(btn("Clear"));
    expect((host.querySelector('input[aria-label="Search mail"]') as HTMLInputElement).value).toBe("");
    expect(host.textContent).not.toContain("Searching all mail");
  });

  it("searches inside Spam, Trash or Sent when the person is in that box", async () => {
    mockApi(); await render(); await click(box("Spam"));
    await type(host.querySelector('input[aria-label="Search mail"]'), "price");
    await click(btn("Search"));
    expect(calls.some((c) => c.url.includes("box=spam") && c.url.includes("q=price"))).toBe(true); expect(host.textContent).toContain("Searching Spam for: price");
  });
});

describe("message actions", () => {
  it("stars a message", async () => {
    mockApi(); await render(); await openFirst();
    await click(document.querySelector('[aria-label="Message actions"] button[aria-label="Star"]') as HTMLElement);
    expect(body(posts(`/messages/email/${A}/star`)[0])).toEqual({ starred: true });
  });

  it("reports spam, optionally blocking the sender, and moves to trash", async () => {
    mockApi(); await render(); await openFirst();
    await click(btn("Report spam"));
    expect(host.textContent).toContain("Also block"); expect(host.textContent).toContain("pam@example.com");
    await click(btn("Cancel")); expect(host.textContent).not.toContain("Also block");
    await click(btn("Report spam")); await click(host.querySelector('[aria-label="Report spam"] input[type="checkbox"]') as HTMLElement);
    await click(btn("Move to Spam"));
    expect(body(posts(`/messages/email/${A}/folder`)[0])).toEqual({ folder: "spam", blockSender: true });
    expect(host.textContent).toContain("Choose a message to read it");                          // the message left the inbox, so the pane is cleared
    await openFirst(); await click(btn("Report spam")); await click(btn("Move to Spam"));
    expect(body(posts(`/messages/email/${A}/folder`)[1])).toEqual({ folder: "spam" });         // not blocked unless asked
    await openFirst(); await click(btn("Move to trash"));
    expect(body(posts(`/messages/email/${A}/folder`)[2])).toEqual({ folder: "trash" });
  });

  it("offers Not spam in Spam and Restore in Trash", async () => {
    mockApi(); detail = { ...detail, folder: "spam" }; await render(); await click(box("Spam")); await openFirst();
    expect(host.textContent).toContain("in Spam"); expect(btn("Report spam")).toBeUndefined();
    await click(btn("Not spam")); expect(body(posts(`/messages/email/${A}/folder`)[0])).toEqual({ folder: "inbox" });
    detail = { ...detail, folder: "trash" }; await openFirst(); expect(btn("Restore")).toBeTruthy(); expect(btn("Not spam")).toBeUndefined();
  });

  it("shows a refusal from the server", async () => {
    mockApi(); await render(); await openFirst();
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response(JSON.stringify(String(u).endsWith("/folder") ? { success: false, error: "You do not manage this department's mail" } : { success: true }), { status: String(u).endsWith("/folder") ? 403 : 200 })));
    await click(btn("Move to trash"));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("do not manage");
  });

  it("shows the earlier messages of the conversation and opens one", async () => {
    mockApi(); detail = { ...detail, thread: [{ kind: "email", id: C, subject: "Re: Taxi rank levy", preview: "First message", at: "2026-10-01T10:00:00Z" }] };
    await render(); await openFirst();
    expect(host.textContent).toContain("Earlier in this conversation (1)");
    await click(document.querySelector("details li button") as HTMLElement);
    expect(calls.some((c) => c.url.endsWith(`/api/mail/messages/email/${C}`))).toBe(true);
  });
});

describe("autosaving drafts", () => {
  it("saves a new email as it is typed, then sends it with the draft id so the draft goes away", async () => {
    mockApi(); await render(); await click(btn("New email"));
    expect(calls.filter((c) => c.url.endsWith("/api/mail/drafts"))).toHaveLength(0);              // nothing typed, nothing saved
    await type(host.querySelector('input[aria-label="To"]'), "buyer@example.com"); await type(host.querySelector('textarea[aria-label="Message"]'), "Hello");
    expect(calls.filter((c) => c.url.endsWith("/api/mail/drafts"))).toHaveLength(0);              // not on every key
    await act(async () => { await new Promise((r) => setTimeout(r, 1700)); }); await settle();
    const saves = calls.filter((c) => c.url.endsWith("/api/mail/drafts"));
    expect(saves).toHaveLength(1); expect(body(saves[0])).toMatchObject({ department: "sales", to: "buyer@example.com", body: "Hello" }); expect(body(saves[0])).not.toHaveProperty("id");
    expect(host.textContent).toContain("Draft saved");
    await type(host.querySelector('input[aria-label="Subject"]'), "Quote");
    await act(async () => { await new Promise((r) => setTimeout(r, 1700)); }); await settle();
    const second = calls.filter((c) => c.url.endsWith("/api/mail/drafts"))[1];
    expect(body(second)).toMatchObject({ id: "new-draft-id", subject: "Quote" });                 // the same draft, updated
    await click(btn("Send from sales@vink.co.za"));
    expect(body(posts("/send")[0])).toMatchObject({ department: "sales", to: "buyer@example.com", subject: "Quote", body: "Hello", draftId: "new-draft-id" });
  }, 15000);

  it("does not save the draft again after it was sent, even if the person typed just before sending", async () => {
    mockApi(); await render(); await click(btn("New email"));
    await type(host.querySelector('input[aria-label="To"]'), "a@b.co"); await type(host.querySelector('input[aria-label="Subject"]'), "Hi"); await type(host.querySelector('textarea[aria-label="Message"]'), "Hello there");
    await click(btn("Send from sales@vink.co.za"));                                               // sent within the autosave delay
    await act(async () => { await new Promise((r) => setTimeout(r, 1800)); }); await settle();
    expect(posts("/send")).toHaveLength(1); expect(calls.filter((c) => c.url.endsWith("/api/mail/drafts"))).toHaveLength(0);
  }, 10000);

  it("saves a reply as it is typed, and brings it back the next time the message is opened", async () => {
    mockApi(); await render(); await openFirst();
    await type(host.querySelector('textarea[aria-label="Your reply"]'), "Dear Pam, here you go");
    await act(async () => { await new Promise((r) => setTimeout(r, 1700)); }); await settle();
    const save = calls.filter((c) => c.url.endsWith("/api/mail/drafts"))[0];
    expect(body(save)).toMatchObject({ department: "sales", replyKind: "email", replyId: A, body: "Dear Pam, here you go" });
    detail = { ...detail, draft: DRAFT_REPLY };
    await click(document.querySelectorAll("section[aria-label='Messages'] ul button")[1] as HTMLElement); await openFirst();
    expect((host.querySelector('textarea[aria-label="Your reply"]') as HTMLTextAreaElement).value).toBe("Dear Pam, ");
  }, 10000);

  it("saves what was typed when the person leaves before the delay ends", async () => {
    mockApi(); await render(); await click(btn("New email"));
    await type(host.querySelector('textarea[aria-label="Message"]'), "Do not lose me");
    await click(box("Sent"));                                                                      // leaves the editor
    expect(body(calls.filter((c) => c.url.endsWith("/api/mail/drafts"))[0])).toMatchObject({ body: "Do not lose me" });
  });

  it("says so when the draft could not be saved", async () => {
    mockApi(); await render(); await click(btn("New email"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, error: "no" }), { status: 500 })));
    await type(host.querySelector('textarea[aria-label="Message"]'), "x");
    await act(async () => { await new Promise((r) => setTimeout(r, 1700)); }); await settle();
    expect(host.textContent).toContain("Draft not saved");
  }, 10000);
});

describe("undo send", () => {
  it("counts down, lets the person undo, and sends when the time is up", async () => {
    mockApi(); localStorage.setItem("vink.mail.undoSeconds", "5");
    await render(); await click(btn("New email"));
    await type(host.querySelector('input[aria-label="To"]'), "a@b.co"); await type(host.querySelector('input[aria-label="Subject"]'), "Hi"); await type(host.querySelector('textarea[aria-label="Message"]'), "Hello there");
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await act(async () => { btn("Send from sales@vink.co.za")!.click(); });
    expect(host.textContent).toContain("Sending in 5…"); expect(posts("/send")).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); expect(host.textContent).toContain("Sending in 3…");
    await act(async () => { btn("Undo")!.click(); });
    expect(host.textContent).toContain("Not sent. Your message is still here."); await act(async () => { await vi.advanceTimersByTimeAsync(10_000); }); expect(posts("/send")).toHaveLength(0);
    expect((host.querySelector('textarea[aria-label="Message"]') as HTMLTextAreaElement).value).toBe("Hello there");
    await act(async () => { btn("Send from sales@vink.co.za")!.click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(posts("/send")).toHaveLength(1);
  });

  it("sends at once, instead of losing the message, if the person leaves during the countdown", async () => {
    mockApi(); localStorage.setItem("vink.mail.undoSeconds", "10");
    await render(); await openFirst();
    await type(host.querySelector('textarea[aria-label="Your reply"]'), "Thanks, done.");
    await act(async () => { btn("Send reply")!.click(); });
    expect(posts("/reply")).toHaveLength(0);
    await click(box("Sent"));
    expect(posts("/reply")).toHaveLength(1); expect(body(posts("/reply")[0])).toEqual({ body: "Thanks, done." });
  });

  it("can be switched off or changed, and the choice is remembered", async () => {
    mockApi(); await render(); await click(btn("New email"));
    const sel = host.querySelector('select[aria-label="Undo send"]') as HTMLSelectElement;
    expect(sel.value).toBe("0");
    await type(sel, "30"); expect(localStorage.getItem("vink.mail.undoSeconds")).toBe("30");
    localStorage.clear(); await click(box("Sent")); await click(btn("New email"));
    expect((host.querySelector('select[aria-label="Undo send"]') as HTMLSelectElement).value).toBe("5");            // the default is 5 seconds
  });

  it("shows the server's error and keeps the message when sending fails", async () => {
    mockApi(); failSend = true; await render(); await click(btn("New email"));
    await type(host.querySelector('input[aria-label="To"]'), "a@b.co"); await type(host.querySelector('input[aria-label="Subject"]'), "Hi"); await type(host.querySelector('textarea[aria-label="Message"]'), "Hello there");
    await click(btn("Send from sales@vink.co.za"));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not be sent");
    expect((host.querySelector('textarea[aria-label="Message"]') as HTMLTextAreaElement).value).toBe("Hello there");
  });
});
