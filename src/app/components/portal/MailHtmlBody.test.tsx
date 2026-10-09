// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MailPanel } from "./MailPanel";
import { buildEmailDocument } from "./MailHtmlBody";
import type { MailFile } from "./MailAttachments";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const body = (doc: string) => new DOMParser().parseFromString(doc, "text/html");

describe("cleaning an incoming email's HTML", () => {
  it("removes scripts, event handlers, forms, frames, objects, SVG and meta/base/link tags", () => {
    const { doc } = buildEmailDocument(`<p onclick="steal()">Hi</p><script>alert(1)</script><img src="x" onerror="alert(2)"><form action="https://evil.test"><input name="pw"><button>Go</button></form><iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"><svg onload="alert(3)"><circle/></svg><meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test/"><link rel="stylesheet" href="https://evil.test/a.css">`);
    const d = body(doc);
    expect(d.body.textContent).toContain("Hi");
    for (const tag of ["script", "form", "input", "button", "iframe", "object", "embed", "svg"]) expect(d.body.querySelector(tag), tag).toBeNull();
    expect(d.querySelector("[onclick],[onerror],[onload]")).toBeNull();
    expect(d.querySelectorAll("meta[http-equiv=refresh]")).toHaveLength(0);
    expect(d.querySelectorAll("base")).toHaveLength(1); expect(d.querySelector("base")!.getAttribute("target")).toBe("_blank");      // only our own
    expect(d.querySelector("link")).toBeNull();
  });

  it("puts a Content-Security-Policy in the page that allows no scripts, frames or internet pictures", () => {
    const { doc } = buildEmailDocument("<p>x</p>");
    const csp = body(doc).querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")!;
    expect(csp).toContain("default-src 'none'"); expect(csp).toContain("img-src blob: data:"); expect(csp).not.toContain("https:"); expect(csp).not.toContain("script-src");
    expect(body(buildEmailDocument("<p>x</p>", { allowRemotePictures: true }).doc).querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")).toContain("img-src blob: data: https:");
  });

  it("blocks pictures from the internet (and counts them) unless allowed, and always strips tracking sizes and srcset", () => {
    const html = `<img src="https://track.example/pixel.gif" width="1" height="1"><img src="http://x.test/a.png" srcset="https://x.test/big.png 2x"><img src="//cdn.test/b.png" alt="Logo">`;
    const blocked = buildEmailDocument(html);
    expect(blocked.blockedPictures).toBe(3);
    expect([...body(blocked.doc).querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual([null, null, null]);
    expect(body(blocked.doc).querySelectorAll("img")[2].getAttribute("alt")).toBe("Logo");
    const shown = buildEmailDocument(html, { allowRemotePictures: true });
    const imgs = [...body(shown.doc).querySelectorAll("img")];
    expect(imgs[0].getAttribute("src")).toBe("https://track.example/pixel.gif"); expect(imgs[0].getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(imgs[1].getAttribute("src")).toBeNull();                                          // plain http is never loaded
    expect(imgs[1].hasAttribute("srcset")).toBe(false);
  });

  it("shows the pictures that came with the email (cid:), keeps small data pictures, and drops anything else", () => {
    const { doc } = buildEmailDocument(`<img src="cid:logo@mail"><img src="cid:%3Cother%3E"><img src="cid:missing"><img src="data:image/png;base64,iVBORw0KGgo="><img src="data:text/html;base64,PHNjcmlwdD4="><img src="javascript:alert(1)">`, { cid: { "logo@mail": "blob:abc", other: "blob:def" } });
    expect([...body(doc).querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual(["blob:abc", "blob:def", null, "data:image/png;base64,iVBORw0KGgo=", null, null]);
  });

  it("opens links in a new tab without handing over the page, and removes links that are not web, mail or phone addresses", () => {
    const { doc } = buildEmailDocument(`<a href="https://example.com/x">a</a><a href="javascript:alert(1)">b</a><a href="mailto:a@b.com">c</a><a href="data:text/html,x">d</a><a href="tel:+27123">e</a><a href="file:///etc/passwd">f</a>`);
    const as = [...body(doc).querySelectorAll("a")];
    expect(as.map((a) => a.getAttribute("href"))).toEqual(["https://example.com/x", null, "mailto:a@b.com", null, "tel:+27123", null]);
    for (const a of as) { expect(a.getAttribute("target")).toBe("_blank"); expect(a.getAttribute("rel")).toBe("noopener noreferrer nofollow"); }
  });

  it("removes url(), @import and expression() from styles, so a style cannot load anything", () => {
    const { doc } = buildEmailDocument(`<style>@import url(https://evil.test/a.css); p{background:url(https://evil.test/p.png);color:red}</style><p style="background:url('https://evil.test/x.png');width:expression(alert(1));color:blue">t</p><div style="behavior:url(x.htc);margin:0">u</div>`);
    const d = body(doc);
    const css = [...d.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    expect(css).not.toMatch(/@import/i); expect(css).not.toMatch(/evil\.test/); expect(css).toContain("color:red");
    for (const el of d.querySelectorAll("[style]")) { expect(el.getAttribute("style")).not.toMatch(/url\s*\(|expression|behavio/i); }
    expect(d.querySelector("p")!.getAttribute("style")).toContain("color:blue");
  });

  it("copes with empty and broken HTML", () => {
    expect(buildEmailDocument("").doc).toContain("<body></body>");
    expect(body(buildEmailDocument("<div><p>unclosed <b>bold").doc).body.textContent).toContain("unclosed bold");
  });
});

// ── In the panel ─────────────────────────────────────────────────────────────
let root: Root, host: HTMLElement, calls: string[];
const MID = "22222222-2222-2222-2222-222222222222";
const ITEM = { kind: "email", id: MID, department: "sales", fromName: "Pam", fromEmail: "pam@example.com", subject: "Newsletter", preview: "", status: "open", at: "2026-10-09T10:00:00Z" };
const f = (o: Partial<MailFile>): MailFile => ({ id: "x", filename: "x", contentType: "application/octet-stream", size: 10, status: "stored", risky: false, scan: "unscanned", scanDetail: null, contentId: null, ...o });
const FILES = [f({ id: "logo", filename: "logo.png", contentType: "image/png", contentId: "logo@mail", scan: "clean", scanDetail: "No virus found" }), f({ id: "evil", filename: "photo.png", contentType: "image/png", scan: "infected", scanDetail: "Trojan.Test" }), f({ id: "pic", filename: "holiday.jpg", contentType: "image/jpeg", size: 2000, scan: "suspicious", scanDetail: "2 engines think it is suspicious" }), f({ id: "doc", filename: "terms.pdf", contentType: "application/pdf" })];

function mockApi(html: string | null) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url); calls.push(u);
    if (u.endsWith("/api/mail/departments")) return new Response(JSON.stringify({ success: true, departments: [{ key: "sales", name: "Sales", address: "sales@vink.co.za", open: 1 }] }));
    if (u.includes("/api/mail/messages?")) return new Response(JSON.stringify({ success: true, messages: [ITEM] }));
    if (u.endsWith(`/api/mail/messages/email/${MID}`)) return new Response(JSON.stringify({ success: true, message: { ...ITEM, text: "Plain version", html, attachments: FILES, replies: [] } }));
    if (u.includes("/api/mail/files/")) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    return new Response(JSON.stringify({ success: true }));
  }));
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
}
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const open = async () => { await act(async () => { root.render(<MailPanel />); }); await settle(); await settle(); await act(async () => { (document.querySelector("ul button") as HTMLButtonElement).click(); }); await settle(); await settle(); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t) || b.getAttribute("aria-label")?.includes(t)) as HTMLButtonElement | undefined;

describe("an email with HTML in the panel", () => {
  it("shows it as sent in a sandboxed frame with the email's own picture, and can switch to plain text", async () => {
    mockApi(`<p>Hello <b>there</b></p><img src="cid:logo@mail"><img src="https://track.example/p.gif"><script>alert(1)</script>`); await open();
    const frame = host.querySelector("iframe")!;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");          // no scripts, no same-origin
    expect(frame.getAttribute("sandbox")).not.toMatch(/allow-scripts|allow-same-origin/);
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    const doc = frame.getAttribute("srcdoc")!;
    expect(doc).toContain("Hello <b>there</b>"); expect(doc).not.toContain("<script"); expect(doc).toContain('src="blob:test"'); expect(doc).not.toContain("track.example/p.gif");
    expect(host.textContent).toContain("Pictures from the internet are blocked");
    await act(async () => { btn("Plain text")!.click(); }); await settle();
    expect(host.querySelector("iframe")).toBeNull(); expect(host.querySelector("pre")!.textContent).toBe("Plain version");
    await act(async () => { btn("As sent")!.click(); }); await settle();
    expect(host.querySelector("iframe")).toBeTruthy();
  });

  it("loads internet pictures only after the person asks", async () => {
    mockApi(`<img src="https://news.example/hero.png">`); await open();
    expect(host.querySelector("iframe")!.getAttribute("srcdoc")).not.toContain("news.example");
    await act(async () => { btn("Show pictures")!.click(); }); await settle();
    expect(host.querySelector("iframe")!.getAttribute("srcdoc")).toContain('src="https://news.example/hero.png"');
    expect(host.textContent).not.toContain("Pictures from the internet are blocked");
  });

  it("shows plain text, and no tabs, when the email has no HTML", async () => {
    mockApi(null); await open();
    expect(host.querySelector("iframe")).toBeNull(); expect(host.querySelector("pre")!.textContent).toBe("Plain version"); expect(btn("Plain text")).toBeUndefined();
  });
});

describe("virus check results and picture previews", () => {
  it("shows what the check found, offers no download for an infected file, and warns about a suspicious one", async () => {
    mockApi(null); await open();
    expect(host.textContent).toContain("Blocked: Trojan.Test"); expect(btn("Download photo.png")).toBeUndefined();
    expect(host.textContent).toContain("Suspicious: 2 engines think it is suspicious"); expect(btn("Download holiday.jpg")).toBeTruthy();
    expect(host.textContent).toContain("Checked, no virus found"); expect(host.textContent).toContain("not checked by an antivirus");
  });

  it("previews a picture on request, and not an infected one or a document", async () => {
    mockApi(null); await open();
    expect(btn("Preview logo.png")).toBeTruthy(); expect(btn("Preview holiday.jpg")).toBeTruthy();
    expect(btn("Preview photo.png")).toBeUndefined(); expect(btn("Preview terms.pdf")).toBeUndefined();
    expect(host.querySelectorAll("img")).toHaveLength(0);                                       // nothing is fetched until asked
    await act(async () => { btn("Preview holiday.jpg")!.click(); }); await settle(); await settle();
    expect(calls.some((c) => c.endsWith("/api/mail/files/pic"))).toBe(true);
    expect(host.querySelector('img[alt="holiday.jpg"]')?.getAttribute("src")).toBe("blob:test");
    expect(btn("Preview holiday.jpg")).toBeUndefined();
  });
});
