// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MailPanel } from "./MailPanel";
import { AttachmentList, type MailFile } from "./MailAttachments";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
const MID = "11111111-1111-1111-1111-111111111111";
const WEB = { kind: "email", id: MID, department: "sales", fromName: "Pam Mokoena", fromEmail: "pam@example.com", subject: "Quote", preview: "see attached", status: "open", at: "2026-10-09T10:00:00Z" };
const FILES: MailFile[] = [
  { id: "f1", filename: "Quote 2026.pdf", contentType: "application/pdf", size: 2_411_724, status: "stored", risky: false, scan: "clean", scanDetail: "No virus found", contentId: null },
  { id: "f2", filename: "setup.exe", contentType: "application/octet-stream", size: 1024, status: "stored", risky: true, scan: "unscanned", scanDetail: null, contentId: null },
  { id: "f3", filename: "film.mp4", contentType: "video/mp4", size: 80 * 1024 * 1024, status: "toolarge", risky: false, scan: "unscanned", scanDetail: null, contentId: null },
];
let uploadReply: (u: string) => { status: number; body: unknown };

function mockApi() {
  calls = [];
  uploadReply = (u) => ({ status: 201, body: { success: true, file: { id: `up-${calls.length}`, filename: new URL(u).searchParams.get("name"), contentType: "x", size: 1000, status: "stored", risky: /\.exe$/.test(new URL(u).searchParams.get("name") ?? "") } } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url); let status = 200; let body: unknown = { success: true };
    if (u.endsWith("/api/mail/departments")) body = { success: true, departments: [{ key: "sales", name: "Sales", address: "sales@vink.co.za", open: 1 }] };
    else if (u.includes("/api/mail/messages?")) body = { success: true, messages: [WEB] };
    else if (new RegExp(`/api/mail/messages/email/${MID}$`).test(u)) body = { success: true, message: { ...WEB, text: "Please see the attached quote.", attachments: FILES, replies: [{ id: "r1", to: "pam@example.com", subject: "Re: Quote", body: "Thanks", status: "sent", by: "sam", at: "2026-10-09T11:00:00Z", attachments: [FILES[0]] }] } };
    else if (u.includes("/api/mail/uploads?")) { const r = uploadReply(u); status = r.status; body = r.body; }
    else if (u.includes("/api/mail/uploads/")) body = { success: true, removed: true };
    else if (u.endsWith("/reply")) { status = 201; body = { success: true, id: "r2" }; }
    else if (u.includes("/api/mail/files/f1")) return new Response("PDFDATA", { status: 200 });
    else if (u.includes("/api/mail/files/f2")) return new Response(JSON.stringify({ success: false, error: "You do not manage this department's mail" }), { status: 403 });
    return new Response(JSON.stringify(body), { status });
  }));
}
beforeEach(() => { localStorage.clear(); localStorage.setItem("vink.mail.undoSeconds", "0"); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t) || b.getAttribute("aria-label")?.includes(t)) as HTMLButtonElement | undefined;
const openMessage = async () => {
  await act(async () => { root.render(<MailPanel />); }); await settle(); await settle();
  await act(async () => { (document.querySelector("ul button") as HTMLButtonElement).click(); }); await settle(); await settle();
};
const pick = async (files: File[]) => {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); }); await settle(); await settle();
};
const file = (name: string, size = 1000, type = "application/pdf") => { const f = new File(["x"], name, { type }); Object.defineProperty(f, "size", { value: size }); return f; };

describe("attachments on a message", () => {
  it("lists each attachment with its size, a warning on the ones that can run, and no button on one that was too large to keep", async () => {
    mockApi(); await openMessage();
    expect(host.textContent).toContain("Attachments (3)");
    expect(host.textContent).toContain("Quote 2026.pdf"); expect(host.textContent).toContain("2.3 MB"); expect(host.textContent).toContain("setup.exe");
    expect(host.textContent).toContain("can run on a computer"); expect(host.textContent).toContain("too large to keep");
    expect(btn("Download Quote 2026.pdf")).toBeTruthy(); expect(btn("Download film.mp4")).toBeUndefined();
    expect(host.textContent).toContain("Sent with this reply (1)");                                    // the files that went out with an earlier reply
  });

  it("downloads through the signed-in session and hands the browser a file with the right name", async () => {
    mockApi(); const click = vi.fn(); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
    const create = vi.fn(() => "blob:x"), revoke = vi.fn(); Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    await openMessage();
    await act(async () => { btn("Download Quote 2026.pdf")!.click(); }); await settle(); await settle();
    expect(calls.some((c) => c.url.endsWith("/api/mail/files/f1"))).toBe(true);
    expect(create).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1);
  });

  it("asks before downloading a file that can run, and shows the server's reason when it is refused", async () => {
    mockApi(); await openMessage();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    await act(async () => { btn("Download setup.exe")!.click(); }); await settle();
    expect(confirm).toHaveBeenCalledTimes(1); expect(calls.some((c) => c.url.endsWith("/files/f2"))).toBe(false);                 // said no: nothing fetched
    await act(async () => { btn("Download setup.exe")!.click(); }); await settle(); await settle();
    expect(calls.some((c) => c.url.endsWith("/files/f2"))).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("do not manage this department");
  });

  it("shows nothing for a message that has no attachments", async () => {
    await act(async () => { root.render(<AttachmentList files={[]} />); }); expect(host.textContent).toBe("");
    await act(async () => { root.render(<AttachmentList files={undefined} />); }); expect(host.textContent).toBe("");
  });
});

describe("attaching files to a reply", () => {
  it("uploads each file as raw bytes, lists it, and sends the reply with the files' ids", async () => {
    mockApi(); await openMessage();
    await pick([file("Price list.pdf"), file("terms.docx", 2000, "application/msword")]);
    const ups = calls.filter((c) => c.url.includes("/api/mail/uploads?"));
    expect(ups).toHaveLength(2);
    expect(ups[0].init!.method).toBe("PUT"); expect((ups[0].init!.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");   // never the file's own type, which could be JSON
    expect(ups[0].url).toContain("name=Price%20list.pdf&type=application%2Fpdf");
    expect(host.textContent).toContain("Price list.pdf"); expect(host.textContent).toContain("terms.docx");
    const ta = host.querySelector('[aria-label="Your reply"][contenteditable="true"]') as HTMLElement;
    await act(async () => { ta.innerHTML = "<div>Prices attached.</div>"; ta.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { btn("Send reply")!.click(); }); await settle();
    const post = calls.find((c) => c.url.endsWith("/reply"))!;
    const sent = JSON.parse(String(post.init!.body)) as { bodyHtml: string; attachmentIds: string[] };
    expect(sent.bodyHtml).toBe("<div>Prices attached.</div>"); expect(sent.attachmentIds).toHaveLength(2); expect(new Set(sent.attachmentIds).size).toBe(2); expect(sent.attachmentIds.every((x) => x.startsWith("up-"))).toBe(true);
    expect(host.textContent).not.toContain("Price list.pdf");                                        // sent: the list of files to attach is empty again
    expect(host.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("lets a person remove a file before sending, and tells the server to throw it away", async () => {
    mockApi(); await openMessage(); await pick([file("oops.pdf")]);
    expect(host.textContent).toContain("oops.pdf");
    await act(async () => { btn("Remove oops.pdf")!.click(); }); await settle();
    expect(host.textContent).not.toContain("oops.pdf");
    expect(calls.some((c) => c.init?.method === "DELETE" && c.url.includes("/api/mail/uploads/"))).toBe(true);
  });

  it("refuses too many files, a file over 50 MB and an empty file without uploading them, and explains a server refusal", async () => {
    mockApi(); await openMessage();
    await pick([file("big.mp4", 51 * 1024 * 1024)]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("larger than 50.0 MB");
    await pick([file("empty.txt", 0)]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("empty");
    await pick([1, 2, 3, 4, 5, 6].map((n) => file(`f${n}.txt`)));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("up to 5 files");
    expect(calls.filter((c) => c.url.includes("/api/mail/uploads?"))).toHaveLength(0);
    uploadReply = () => ({ status: 413, body: { success: false, error: "Files can be up to 50.0 MB" } });
    await pick([file("ok.pdf")]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Files can be up to 50.0 MB");
  });

  it("warns that files over 15 MB together will go as download links", async () => {
    mockApi(); await openMessage();
    uploadReply = (u) => ({ status: 201, body: { success: true, file: { id: "big1", filename: new URL(u).searchParams.get("name"), contentType: "x", size: 20 * 1024 * 1024, status: "stored", risky: false } } });
    await pick([file("report.pdf", 20 * 1024 * 1024)]);
    expect(host.textContent).toContain("sent as download links"); expect(host.textContent).toContain("7 days");
  });

  it("flags a risky file the person is about to send", async () => {
    mockApi(); await openMessage(); await pick([file("run.exe")]);
    expect(host.textContent).toContain("can run on a computer");
  });
});
