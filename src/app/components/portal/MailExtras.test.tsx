// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MailPanel } from "./MailPanel";
import { quickTimes, localInput, textToHtml, whenLong, notifyIfMore, NOTIFY_KEY } from "./mailShared";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("times and notifications", () => {
  it("offers ready-made times: in an hour, this afternoon (only if it is not nearly then), tomorrow morning, Monday morning", () => {
    const tue = new Date(2026, 9, 6, 10, 0);                                                      // Tuesday 6 October 2026, 10:00 local time
    expect(quickTimes(tue).map((t) => t.label)).toEqual(["In 1 hour", "This afternoon (16:00)", "Tomorrow morning (08:00)", "Monday morning (08:00)"]);
    const [hour, afternoon, tomorrow, monday] = quickTimes(tue).map((t) => t.at);
    expect(hour.getTime()).toBe(tue.getTime() + 3600_000); expect([afternoon.getDate(), afternoon.getHours()]).toEqual([6, 16]); expect([tomorrow.getDate(), tomorrow.getHours()]).toEqual([7, 8]); expect([monday.getDay(), monday.getDate(), monday.getHours()]).toEqual([1, 12, 8]);
    expect(quickTimes(new Date(2026, 9, 6, 15, 0)).map((t) => t.label)).not.toContain("This afternoon (16:00)");
    expect(quickTimes(new Date(2026, 9, 11, 9, 0)).at(-1)!.at.getDate()).toBe(12);                // on a Sunday, Monday is tomorrow
    expect(quickTimes(new Date(2026, 9, 12, 9, 0)).at(-1)!.at.getDate()).toBe(19);                // on a Monday, it is next Monday
  });
  it("formats times for people and for the date box, and turns text into paragraphs safely", () => {
    expect(localInput(new Date(2026, 9, 6, 9, 5))).toBe("2026-10-06T09:05"); expect(whenLong(new Date("2026-10-06T08:00:00Z"))).toMatch(/Tue.*06.*Oct.*10:00/);
    expect(textToHtml("a <b> & c\n\nd")).toBe("<div>a &lt;b&gt; &amp; c</div><div><br></div><div>d</div>");
  });
  it("notifies only when more messages are waiting than before, and only if the person asked and the browser allows it", () => {
    const made: string[] = [];
    class FakeNotification { static permission = "granted"; constructor(title: string, o: { body: string }) { made.push(`${title}: ${o.body}`); } }
    vi.stubGlobal("Notification", FakeNotification); localStorage.setItem(NOTIFY_KEY, "1");
    expect(notifyIfMore(null, 5)).toBe(false); expect(notifyIfMore(5, 5)).toBe(false); expect(notifyIfMore(5, 3)).toBe(false); expect(made).toEqual([]);
    expect(notifyIfMore(3, 4)).toBe(true); expect(notifyIfMore(3, 7)).toBe(true); expect(made).toEqual(["VINK department mail: 1 new message is waiting.", "VINK department mail: 4 new messages are waiting."]);
    localStorage.setItem(NOTIFY_KEY, "0"); expect(notifyIfMore(1, 9)).toBe(false);
    localStorage.setItem(NOTIFY_KEY, "1"); FakeNotification.permission = "denied"; expect(notifyIfMore(1, 9)).toBe(false);
    vi.unstubAllGlobals(); expect(notifyIfMore(1, 9)).toBe(false);                                 // a browser with no Notification at all
  });
});

// ── The panel ────────────────────────────────────────────────────────────────
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
const A = "11111111-1111-1111-1111-111111111111";
const URGENT = { id: "l1", name: "Urgent", color: "#DC2626" }, BILLING = { id: "l2", name: "Billing", color: "#0369A1" };
const item = (o: Record<string, unknown> = {}) => ({ kind: "email", id: A, department: "sales", fromName: "Pam Mokoena", fromEmail: "pam@example.com", subject: "Taxi rank levy", preview: "Please advise", status: "open", at: "2026-10-09T10:00:00Z", starred: false, folder: "inbox", snoozedUntil: null, labels: [], spamReason: null, ...o });
let detail: Record<string, unknown>, labels: unknown[], templates: unknown[], filters: unknown[], scheduled: unknown[], autoreply: Record<string, unknown>, signature: Record<string, unknown>, listItems: unknown[], failNext: string | null;

function mockApi() {
  calls = []; failNext = null;
  labels = [URGENT, BILLING]; templates = [{ id: "t1", department: "sales", name: "Price list", subject: "Our prices", bodyHtml: "<p>Prices are <b>attached</b>.</p>" }]; filters = []; scheduled = []; listItems = [item()];
  autoreply = { department: "sales", enabled: false, subject: "Out of office", body: "", startOn: null, endOn: null };
  signature = { name: "Sarah Mitchell", title: "", phone: "", photoUrl: "", enabled: true, custom: false, department: "Sales", email: "sales@vink.co.za", html: "<table><tr><td>SIGNATURE HTML Sarah</td></tr></table>" };
  detail = { ...item(), text: "Please advise on the levy.", html: null, attachments: [], thread: [], draft: null, replies: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url), method = init?.method ?? "GET"; calls.push({ url: u, init });
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (failNext && u.includes(failNext)) { const f = failNext; failNext = null; return ok({ success: false, error: `Refused: ${f}` }, 400); }
    if (u.endsWith("/api/mail/departments")) return ok({ success: true, departments: [{ key: "sales", name: "Sales", address: "sales@vink.co.za", open: 3, drafts: 1, scheduled: 2 }, { key: "support", name: "Customer Support", address: "support@vink.co.za", open: 0 }] });
    if (u.includes("/api/mail/messages?")) return ok({ success: true, messages: listItems });
    if (/\/api\/mail\/messages\/email\/[^/]+$/.test(u)) return ok({ success: true, message: detail });
    if (u.includes("/api/mail/drafts")) return ok({ success: true, drafts: [], id: "draft-1" });
    if (u.includes("/api/mail/labels?")) return ok({ success: true, labels });
    if (u.endsWith("/api/mail/labels") && method === "POST") { const b = JSON.parse(String(init!.body)); const l = { id: "l-new", name: b.name, color: b.color ?? "#8B0000" }; labels = [...labels, l]; return ok({ success: true, label: l }, 201); }
    if (u.includes("/api/mail/labels/") && method === "DELETE") { labels = labels.filter((l) => (l as { id: string }).id !== u.split("/").pop()); return ok({ success: true }); }
    if (u.endsWith("/labels") && method === "POST") { const b = JSON.parse(String(init!.body)); return ok({ success: true, labels: b.on ? [URGENT] : [] }); }
    if (u.includes("/api/mail/templates?")) return ok({ success: true, templates });
    if (u.endsWith("/api/mail/templates") && method === "POST") return ok({ success: true, template: { id: "t-new" } }, 201);
    if (u.includes("/api/mail/templates/") && method === "DELETE") { templates = []; return ok({ success: true }); }
    if (u.includes("/api/mail/filters?")) return ok({ success: true, filters });
    if (u.endsWith("/api/mail/filters") && method === "POST") return ok({ success: true, id: "f-new" }, 201);
    if (u.includes("/api/mail/filters/") && method === "DELETE") { filters = []; return ok({ success: true }); }
    if (u.includes("/api/mail/autoreply")) return method === "PUT" ? ok({ success: true, autoreply }) : ok({ success: true, autoreply });
    if (u.includes("/api/mail/signature/preview")) return ok({ success: true, html: `<table><tr><td>PREVIEW ${JSON.parse(String(init!.body)).name}</td></tr></table>` });
    if (u.includes("/api/mail/signature")) return ok({ success: true, signature });
    if (u.includes("/api/mail/scheduled?")) return ok({ success: true, scheduled });
    if (u.includes("/api/mail/scheduled/") && method === "DELETE") { scheduled = []; return ok({ success: true }); }
    if (u.endsWith("/api/mail/schedule")) return ok({ success: true, id: "s1", sendAt: JSON.parse(String(init!.body)).sendAt }, 201);
    if (u.endsWith("/snooze")) return ok({ success: true, snoozedUntil: null });
    if (u.endsWith("/send") || u.endsWith("/reply")) return ok({ success: true, id: "x" }, 201);
    return ok({ success: true });
  }));
}
beforeEach(() => { localStorage.clear(); localStorage.setItem("vink.mail.undoSeconds", "0"); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async () => { await act(async () => { root.render(<MailPanel />); }); await settle(); await settle(); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); await settle(); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t || b.textContent?.includes(t) || b.getAttribute("aria-label") === t) as HTMLButtonElement | undefined;
const exact = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t || b.getAttribute("aria-label") === t) as HTMLButtonElement | undefined;
const box = (name: string) => [...document.querySelectorAll('[aria-label="Boxes"] [role="tab"]')].find((b) => b.textContent?.includes(name)) as HTMLButtonElement;
const tab = (name: string) => [...document.querySelectorAll('[aria-label="Settings"] [role="tab"]')].find((b) => b.textContent === name) as HTMLButtonElement;
const type = async (el: Element | null, v: string) => { await act(async () => { const e = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; if (e.getAttribute("contenteditable") === "true") { e.innerHTML = `<div>${v}</div>`; e.dispatchEvent(new Event("input", { bubbles: true })); return; } const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : e.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(e, v); e.dispatchEvent(new Event(e.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); };
const check = async (el: Element | null) => { await act(async () => { (el as HTMLInputElement).click(); }); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const openFirst = async () => { await click(document.querySelector("section[aria-label='Messages'] ul button")); await settle(); };
const sent = (suffix: string, method = "POST") => calls.filter((c) => c.url.endsWith(suffix) && c.init?.method === method);
const body = (c: { init?: RequestInit }) => JSON.parse(String(c.init!.body));

describe("settings", () => {
  it("opens from the Settings button for the chosen department, with the six tabs, and closes again", async () => {
    mockApi(); await render();
    await click(btn("Mail settings"));
    expect([...document.querySelectorAll('[aria-label="Settings"] [role="tab"]')].map((t) => t.textContent)).toEqual(["Signature", "Templates", "Labels", "Filters", "Out of office", "Notifications"]);
    expect((q('select[aria-label="Settings for department"]') as HTMLSelectElement).value).toBe("sales");
    expect(q("section[aria-label='Messages']")).toBeNull(); expect(q('[aria-label="Boxes"]')).toBeTruthy();                 // the sidebar stays; the list gives way to the settings
    await click(btn("Mail settings")); expect(q("section[aria-label='Messages']")).toBeTruthy();
  });

  it("edits the signature with a live preview, and saves it", async () => {
    mockApi(); await render(); await click(btn("Mail settings"));
    expect((q('input[aria-label="Your name"]') as HTMLInputElement).value).toBe("Sarah Mitchell");
    expect(q('iframe[title="Signature preview"]')!.getAttribute("srcdoc")).toContain("SIGNATURE HTML Sarah"); expect(q('iframe[title="Signature preview"]')!.getAttribute("sandbox")).toBe("");
    expect(host.textContent).toContain("sales@vink.co.za");
    await type(q('input[aria-label="Your name"]'), "Sarah M. Mitchell"); await type(q('input[aria-label="Job title"]'), "Sales Executive"); await type(q('input[aria-label="Phone"]'), "+27 21 007 0772");
    expect(sent("/api/mail/signature/preview")).toHaveLength(0);                                    // not on every key
    await act(async () => { await new Promise((r) => setTimeout(r, 650)); }); await settle();
    expect(sent("/api/mail/signature/preview")).toHaveLength(1); expect(body(sent("/api/mail/signature/preview")[0])).toMatchObject({ department: "sales", name: "Sarah M. Mitchell", title: "Sales Executive", phone: "+27 21 007 0772" });
    expect(q('iframe[title="Signature preview"]')!.getAttribute("srcdoc")).toContain("PREVIEW Sarah M. Mitchell");
    await click(exact("Save signature"));
    expect(body(sent("/api/mail/signature", "PUT")[0])).toEqual({ department: "sales", name: "Sarah M. Mitchell", title: "Sales Executive", phone: "+27 21 007 0772", photoUrl: "", enabled: true });
    expect(host.textContent).toContain("Signature saved.");
    await check(q('input[aria-label="Add my signature to emails"]')); await click(exact("Save signature")); expect(body(sent("/api/mail/signature", "PUT")[1]).enabled).toBe(false);
  }, 15000);

  it("shows why a signature was refused", async () => {
    mockApi(); await render(); await click(btn("Mail settings"));
    failNext = "/api/mail/signature"; await click(exact("Save signature")); expect(host.textContent).toContain("Refused: /api/mail/signature");
  });

  it("lists, writes, edits and deletes templates", async () => {
    mockApi(); await render(); await click(btn("Mail settings")); await click(tab("Templates"));
    expect(host.textContent).toContain("Price list"); expect(host.textContent).toContain("Our prices");
    await click(btn("Edit")); expect((q('input[aria-label="Template name"]') as HTMLInputElement).value).toBe("Price list"); expect(q('[aria-label="Template text"][contenteditable]')!.innerHTML).toContain("<b>attached</b>");
    await type(q('input[aria-label="Template name"]'), "Price list 2"); await type(q('[aria-label="Template text"][contenteditable]'), "New wording");
    await click(exact("Save template"));
    expect(body(sent("/api/mail/templates")[0])).toEqual({ id: "t1", department: "sales", name: "Price list 2", subject: "Our prices", bodyHtml: "<div>New wording</div>" });
    await click(exact("New template")); await type(q('input[aria-label="Template name"]'), "Thanks"); await type(q('[aria-label="Template text"][contenteditable]'), "Thank you.");
    await click(exact("Save template")); expect(body(sent("/api/mail/templates")[1])).toMatchObject({ name: "Thanks", bodyHtml: "<div>Thank you.</div>" }); expect(body(sent("/api/mail/templates")[1]).id).toBeUndefined();
    await click(exact("Delete template Price list")); expect(calls.some((c) => c.init?.method === "DELETE" && c.url.endsWith("/api/mail/templates/t1"))).toBe(true);
  });

  it("adds a label with a colour and deletes one", async () => {
    mockApi(); await render(); await click(btn("Mail settings")); await click(tab("Labels"));
    expect(host.textContent).toContain("Urgent"); expect(host.textContent).toContain("Billing");
    await type(q('input[aria-label="Label name"]'), "Refunds"); await click(q('[aria-label="Colour #047857"]')); await click(exact("Add label"));
    expect(body(sent("/api/mail/labels")[0])).toEqual({ department: "sales", name: "Refunds", color: "#047857" }); expect(host.textContent).toContain("Refunds");
    await click(exact("Delete label Urgent")); expect(calls.some((c) => c.init?.method === "DELETE" && c.url.endsWith("/api/mail/labels/l1"))).toBe(true); expect(host.textContent).not.toContain("Urgent");
  });

  it("makes a filter from what is filled in, shows it in words, turns it off, and deletes it", async () => {
    mockApi(); await render(); await click(btn("Mail settings")); await click(tab("Filters"));
    expect(host.textContent).toContain("No filters yet.");
    await type(q('input[aria-label="Filter name"]'), "Urgent levy"); await type(q('input[aria-label="Subject contains"]'), "levy"); await type(q('input[aria-label="From contains"]'), "pam");
    await type(q('select[aria-label="Add label"]'), "l1"); await check(q('input[aria-label="Star it"]')); await check(q('input[aria-label="Has an attachment"]'));
    await click(exact("Add filter"));
    expect(body(sent("/api/mail/filters")[0])).toEqual({ department: "sales", name: "Urgent levy", from: "pam", subject: "levy", words: "", hasAttachment: true, labelId: "l1", star: true, close: false });
    expect((q('input[aria-label="Filter name"]') as HTMLInputElement).value).toBe("");                 // the form is cleared
    filters = [{ id: "f1", name: "Urgent levy", from: "pam", subject: "levy", words: "", hasAttachment: true, label: URGENT, star: true, folder: null, close: false, active: true }, { id: "f2", name: "Bin newsletters", from: "news@", subject: "", words: "", hasAttachment: false, label: null, star: false, folder: "trash", close: true, active: false }];
    await click(tab("Labels")); await click(tab("Filters"));
    expect(host.textContent).toContain('If from "pam", subject has "levy", has an attachment: label Urgent, star it.'); expect(host.textContent).toContain("If from \"news@\": mark closed, move to Trash."); expect(host.textContent).toContain("OFF");
    await click(exact("Turn off")); expect(body(sent("/api/mail/filters").at(-1)!)).toMatchObject({ id: "f1", active: false, labelId: "l1", star: true });
    await click(exact("Delete filter Urgent levy")); expect(calls.some((c) => c.init?.method === "DELETE" && c.url.endsWith("/api/mail/filters/f1"))).toBe(true);
  });

  it("switches the out-of-office reply on with a message and dates, and says what happens", async () => {
    mockApi(); await render(); await click(btn("Mail settings")); await click(tab("Out of office"));
    expect((q('input[aria-label="Out-of-office reply is on"]') as HTMLInputElement).checked).toBe(false);
    await check(q('input[aria-label="Out-of-office reply is on"]')); await type(q('textarea[aria-label="Reply message"]'), "We are away until Monday."); await type(q('input[aria-label="First day"]'), "2026-10-12"); await type(q('input[aria-label="Last day"]'), "2026-10-16");
    await click(exact("Save"));
    expect(body(sent("/api/mail/autoreply", "PUT")[0])).toEqual({ department: "sales", enabled: true, subject: "Out of office", body: "We are away until Monday.", startOn: "2026-10-12", endOn: "2026-10-16" });
    expect(host.textContent).toContain("Saved. The out-of-office reply is on.");
    autoreply = { ...autoreply, enabled: true, body: "Away", startOn: "2026-10-12", endOn: null }; await click(tab("Labels")); await click(tab("Out of office"));
    expect((q('input[aria-label="Out-of-office reply is on"]') as HTMLInputElement).checked).toBe(true); expect((q('input[aria-label="First day"]') as HTMLInputElement).value).toBe("2026-10-12");
  });

  it("turns desktop notifications on only once the browser allows them, and explains a refusal", async () => {
    mockApi();
    let permission = "default"; const request = vi.fn(async () => permission);
    class FakeNotification { static get permission() { return permission; } static requestPermission = request; }
    vi.stubGlobal("Notification", FakeNotification);
    await render(); await click(btn("Mail settings")); await click(tab("Notifications"));
    const box = () => q('input[aria-label="Notify me of new mail"]') as HTMLInputElement;
    expect(box().checked).toBe(false);
    permission = "denied"; await check(box()); await settle(); expect(host.textContent).toContain("blocked for this site"); expect(localStorage.getItem(NOTIFY_KEY)).toBeNull(); expect(box().checked).toBe(false);
    permission = "granted"; await check(box()); await settle(); expect(localStorage.getItem(NOTIFY_KEY)).toBe("1"); expect(box().checked).toBe(true);
    await check(box()); await settle(); expect(localStorage.getItem(NOTIFY_KEY)).toBe("0"); expect(box().checked).toBe(false);
  });
});

describe("labels in the mailbox", () => {
  it("shows labels on messages, filters the list by a label, and clears the filter", async () => {
    mockApi(); listItems = [item({ labels: [URGENT] })]; await render();
    expect(q("section[aria-label='Messages'] ul")!.textContent).toContain("Urgent");
    const chip = q('[aria-label="Filter by label"] button[aria-pressed="false"]')!; expect(chip.textContent!.trim()).toBe("Urgent");
    await click(chip); expect(calls.some((c) => c.url.includes("messages?department=sales&box=inbox") && c.url.includes("&label=l1"))).toBe(true);
    expect(q('[aria-label="Filter by label"] button[aria-pressed="true"]')!.textContent!.trim()).toBe("Urgent");
    await click(q('[aria-label="Filter by label"] button[aria-pressed="true"]')); expect(calls.at(-1)!.url).not.toContain("label=l1");
  });
  it("puts a label on the open message and takes it off, saving each choice", async () => {
    mockApi(); await render(); await openFirst();
    await click(exact("Labels")); expect([...document.querySelectorAll('[role="menuitemcheckbox"]')].map((b) => `${b.textContent}:${b.getAttribute("aria-checked")}`)).toEqual(["Urgent:false", "Billing:false"]);
    await click([...document.querySelectorAll('[role="menuitemcheckbox"]')].find((b) => b.textContent === "Urgent"));
    expect(body(sent(`/api/mail/messages/email/${A}/labels`)[0])).toEqual({ labelId: "l1", on: true });
    expect(q('[aria-label="Labels on this message"]')!.textContent).toBe("Urgent");
    await click([...document.querySelectorAll('[role="menuitemcheckbox"]')].find((b) => b.textContent === "Urgent")); expect(body(sent(`/api/mail/messages/email/${A}/labels`)[1])).toEqual({ labelId: "l1", on: false });
  });
  it("makes a new label from the menu and puts it on the message", async () => {
    mockApi(); await render(); await openFirst(); await click(exact("Labels"));
    await type(q('input[aria-label="New label"]'), "Refunds"); await click(exact("Add label"));
    expect(body(sent("/api/mail/labels")[0])).toEqual({ department: "sales", name: "Refunds" }); expect(body(sent(`/api/mail/messages/email/${A}/labels`)[0])).toEqual({ labelId: "l-new", on: true });
  });
});

describe("snooze and spam notes", () => {
  it("snoozes a message until a chosen time and clears the pane", async () => {
    mockApi(); await render(); await openFirst();
    await click(exact("Snooze")); expect(q('[aria-label="Snooze until"]')).toBeTruthy();
    await click([...document.querySelectorAll('[aria-label="Snooze until"] button')].find((b) => b.textContent?.startsWith("Tomorrow morning")));
    const until = body(sent(`/api/mail/messages/email/${A}/snooze`)[0]).until as string; const t = new Date(until);
    expect([t.getHours(), t.getMinutes()]).toEqual([8, 0]); expect(t.getTime()).toBeGreaterThan(Date.now());
    expect(q("section[aria-label='Message']")).toBeNull(); expect(q("section[aria-label='Messages']")).toBeTruthy();
  });
  it("snoozes until a date and time typed in, but not before one is chosen", async () => {
    mockApi(); await render(); await openFirst(); await click(exact("Snooze"));
    const go = [...document.querySelectorAll('[aria-label="Snooze until"] button')].find((b) => b.textContent?.includes("for that time")) as HTMLButtonElement; expect(go.disabled).toBe(true);
    const when = new Date(Date.now() + 3 * 86400_000); await type(q('input[aria-label="Pick a date and time"]'), localInput(when)); expect(go.disabled).toBe(false); await click(go);
    expect(Math.abs(new Date(body(sent(`/api/mail/messages/email/${A}/snooze`)[0]).until).getTime() - when.getTime())).toBeLessThan(61_000);
  });
  it("tells the person a message is snoozed and brings it back on request", async () => {
    mockApi(); detail = { ...detail, snoozedUntil: new Date(Date.now() + 5 * 3600_000).toISOString() }; await render(); await openFirst();
    expect(host.textContent).toContain("Snoozed until"); await click(exact("Bring it back now")); expect(body(sent(`/api/mail/messages/email/${A}/snooze`)[0])).toEqual({ until: null });
  });
  it("shows why a message is in Spam", async () => {
    mockApi(); detail = { ...detail, folder: "spam", spamReason: "Claims to be VINK but was sent from gmail.com" }; listItems = [item({ folder: "spam", spamReason: "Claims to be VINK but was sent from gmail.com" })];
    await render(); await click(box("Spam"));
    expect(q("section[aria-label='Messages'] ul")!.textContent).toContain("Claims to be VINK but was sent from gmail.com"); await openFirst();
    expect(host.textContent).toContain("Why this is in Spam:"); expect(host.textContent).toContain("press Not spam"); expect(exact("Snooze")).toBeUndefined();
  });
});

describe("writing: templates, schedule send, scheduled box", () => {
  it("inserts a template into a reply (and a new email), filling the subject if it is empty", async () => {
    mockApi(); await render(); await openFirst();
    await type(q('select[aria-label="Insert template"]'), "t1"); expect(q('[aria-label="Your reply"][contenteditable]')!.innerHTML).toContain("<b>attached</b>");
    await click(exact("New email")); expect((q('select[aria-label="Insert template"]') as HTMLSelectElement)).toBeTruthy();
    await type(q('select[aria-label="Insert template"]'), "t1"); expect((q('input[aria-label="Subject"]') as HTMLInputElement).value).toBe("Our prices"); expect(q('[aria-label="Message"][contenteditable]')!.innerHTML).toContain("<b>attached</b>");
  });
  it("does not offer templates when the department has none", async () => {
    mockApi(); templates = []; await render(); await click(exact("New email")); expect(q('select[aria-label="Insert template"]')).toBeNull();
  });
  it("schedules a new email for a chosen time, closes the editor and says when it will go", async () => {
    mockApi(); await render(); await click(exact("New email"));
    await type(q('input[aria-label="To"]'), "buyer@example.com"); await type(q('input[aria-label="Subject"]'), "Your quote"); await type(q('[aria-label="Message"][contenteditable]'), "Quote attached.");
    await click(exact("Schedule send")); await click([...document.querySelectorAll('[aria-label="Send later"] button')].find((b) => b.textContent?.startsWith("In 1 hour")));
    const b = body(sent("/api/mail/schedule")[0]); expect(b).toMatchObject({ department: "sales", to: "buyer@example.com", subject: "Your quote", bodyHtml: "<div>Quote attached.</div>" });
    expect(Math.abs(new Date(b.sendAt).getTime() - (Date.now() + 3600_000))).toBeLessThan(5000);
    expect(sent("/api/mail/send")).toHaveLength(0); expect(q('[aria-label="Message"][contenteditable]')).toBeNull(); expect(q('[role="status"]')!.textContent).toContain("Scheduled to send");
    await click(q('button[aria-label="Dismiss"]')); expect(host.textContent).not.toContain("Scheduled to send");
  });
  it("schedules a reply to the message that is open", async () => {
    mockApi(); await render(); await openFirst(); await type(q('[aria-label="Your reply"][contenteditable]'), "Will do.");
    await click(exact("Schedule send")); await click([...document.querySelectorAll('[aria-label="Send later"] button')].find((x) => x.textContent?.startsWith("In 1 hour")));
    expect(body(sent("/api/mail/schedule")[0])).toMatchObject({ replyKind: "email", replyId: A, bodyHtml: "<div>Will do.</div>" }); expect(sent("/api/mail/schedule")).toHaveLength(1);
    expect(host.textContent).toContain("Reply scheduled to send"); expect(q("section[aria-label='Message']")).toBeNull();
  });
  it("shows what the server says when a time is refused, and keeps the email", async () => {
    mockApi(); await render(); await click(exact("New email")); await type(q('input[aria-label="To"]'), "a@b.co"); await type(q('[aria-label="Message"][contenteditable]'), "Hello there");
    failNext = "/api/mail/schedule"; await click(exact("Schedule send")); await click([...document.querySelectorAll('[aria-label="Send later"] button')].find((x) => x.textContent?.startsWith("In 1 hour")));
    expect(q('[role="alert"]')!.textContent).toContain("Refused: /api/mail/schedule"); expect(q('[aria-label="Message"][contenteditable]')).toBeTruthy();
  });
  it("lists emails waiting to be sent, with their time, and cancels one", async () => {
    mockApi(); scheduled = [{ id: "s1", department: "sales", to: "buyer@example.com", subject: "Your quote", preview: "Quote attached.", sendAt: "2026-10-12T06:00:00Z", status: "pending", error: null, by: "sam", replyKind: null, replyId: null, attachments: 0 }, { id: "s2", department: "sales", to: "x@example.com", subject: "Late", preview: "p", sendAt: "2026-10-09T10:00:00Z", status: "failed", error: "The email could not be sent right now.", by: "olga", replyKind: null, replyId: null, attachments: 1 }];
    await render(); expect(box("Scheduled").textContent!.trim()).toBe("Scheduled2"); await click(box("Scheduled"));
    expect(calls.some((c) => c.url.includes("/api/mail/scheduled?department=sales"))).toBe(true);
    const t = q("section[aria-label='Messages'] ul")!.textContent!; expect(t).toContain("To buyer@example.com"); expect(t).toContain("Waiting to be sent · written by sam"); expect(t).toContain("Not sent: The email could not be sent right now.");
    await click(exact("Cancel the email to buyer@example.com")); expect(calls.some((c) => c.init?.method === "DELETE" && c.url.endsWith("/api/mail/scheduled/s1"))).toBe(true);
    await click(box("Scheduled")); expect(host.textContent).toContain("Nothing is waiting to be sent");
  });
});

describe("what a reply looks like afterwards", () => {
  it("shows a reply written in the rich-text editor as formatted text, with anything dangerous removed", async () => {
    mockApi(); detail = { ...detail, replies: [{ id: "r1", to: "pam@example.com", subject: "Re: x", body: "Dear Pam", bodyHtml: "<p>Dear <b>Pam</b></p><ul><li>one</li></ul><script>alert(1)</script><img src=x onerror=alert(1)>", status: "sent", by: "sam", at: "2026-10-09T11:00:00Z", attachments: [] }, { id: "r2", to: "pam@example.com", subject: "Re: x", body: "Old plain reply", status: "sent", by: "olga", at: "2026-10-09T12:00:00Z", attachments: [] }] };
    await render(); await openFirst();
    expect(host.innerHTML).toContain("<b>Pam</b>"); expect(host.innerHTML).toContain("<li>one</li>"); expect(host.innerHTML).not.toContain("<script"); expect(host.innerHTML).not.toContain("onerror"); expect(host.textContent).toContain("Old plain reply");
  });
  it("brings back a reply draft that was written with formatting", async () => {
    mockApi(); detail = { ...detail, draft: { id: "d1", department: "sales", to: "", subject: "", body: "Dear Pam", bodyHtml: "<p>Dear <b>Pam</b></p>", replyKind: "email", replyId: A, attachments: [], updatedAt: "2026-10-09T12:00:00Z" } };
    await render(); await openFirst(); expect(q('[aria-label="Your reply"][contenteditable]')!.innerHTML).toBe("<p>Dear <b>Pam</b></p>");
  });
});
