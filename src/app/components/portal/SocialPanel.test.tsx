// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { SocialPanel } from "./SocialPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[], configured: Record<string, boolean>, posts: Record<string, unknown>[], refuse: string | null, productFeed: boolean;
const post = (o: Record<string, unknown> = {}) => ({ id: "p1", kind: "blog", text: "Our first post", link: "https://vink.co.za/blog", imageUrl: null, networks: ["facebook", "threads"], status: "posted", scheduledAt: "2026-10-10T09:00:00Z", results: { facebook: { ok: true, id: "1" }, threads: { ok: true, id: "2" } }, createdBy: "mia", auto: false, ...o });

beforeEach(() => {
  calls = []; configured = { facebook: true, instagram: false, threads: true }; posts = [post()]; refuse = null; productFeed = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url), method = init?.method ?? "GET"; calls.push({ url: u, init });
    const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (u.endsWith("/api/admin/social/status")) return ok({ success: true, configured, auto: { launch: { enabled: false, networks: [] }, products: { enabled: false, networks: [] } }, launchDate: "2027-06-01", daysToLaunch: 234, productFeed });
    if (u.endsWith("/api/admin/social/posts") && method === "GET") return ok({ success: true, posts });
    if (u.endsWith("/api/admin/social/posts") && method === "POST") { if (refuse) return ok({ success: false, error: refuse }, 400); const b = JSON.parse(String(init!.body)); return ok({ success: true, post: post({ text: b.text, status: b.scheduleAt ? "scheduled" : "posted" }) }, 201); }
    if (u.includes("/api/admin/social/posts/") && method === "POST") return ok({ success: true, post: post() });
    if (u.endsWith("/api/admin/social/auto") && method === "PUT") return ok({ success: true, auto: {} });
    return ok({ success: true });
  }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async (isSuper = false) => { await act(async () => { root.render(<SocialPanel isSuper={isSuper} />); }); await settle(); await settle(); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); await settle(); await settle(); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const type = async (el: Element | null, v: string) => { await act(async () => { const e = el as HTMLInputElement; const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); }); };
const btn = (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim().includes(t)) as HTMLButtonElement | undefined;
const sent = () => calls.filter((c) => c.init?.method === "POST" && c.url.endsWith("/posts"));

describe("the social media panel", () => {
  it("shows which networks are connected, and the days to launch", async () => {
    await render(); const t = q('[aria-label="Connected accounts"]')!.textContent!;
    expect(t).toContain("Facebook: connected"); expect(t).toContain("Instagram: not set up"); expect(t).toContain("Threads: connected"); expect(t).toContain("234 days to launch");
  });
  it("only lets a connected network be chosen, and posts the text to the chosen networks now", async () => {
    await render(); expect((q('input[aria-label="Instagram"]') as HTMLInputElement).disabled).toBe(true);
    expect(btn("Post now")!.disabled).toBe(true);
    await type(q('textarea[aria-label="Post text"]'), "Hello VINK fans"); await click(q('input[aria-label="Facebook"]')); await click(q('input[aria-label="Threads"]'));
    await type(q('input[aria-label="Link"]'), "https://vink.co.za"); await click(btn("Post now"));
    expect(JSON.parse(String(sent()[0].init!.body))).toEqual({ kind: "manual", text: "Hello VINK fans", link: "https://vink.co.za", imageUrl: null, networks: ["facebook", "threads"] });
    expect(q('[role="status"]')!.textContent).toBe("Posted."); expect((q('textarea[aria-label="Post text"]') as HTMLTextAreaElement).value).toBe("");
  });
  it("schedules a post for a chosen time", async () => {
    await render(); await type(q('textarea[aria-label="Post text"]'), "Coming soon"); await click(q('input[aria-label="Facebook"]')); await type(q('input[aria-label="Send at"]'), "2026-11-01T09:00");
    expect(btn("Schedule post")).toBeTruthy(); await click(btn("Schedule post"));
    expect(JSON.parse(String(sent()[0].init!.body)).scheduleAt).toBe(new Date("2026-11-01T09:00").toISOString()); expect(q('[role="status"]')!.textContent).toContain("Scheduled for");
  });
  it("shows the reason when a post is refused, and keeps what was typed", async () => {
    refuse = "Instagram needs a picture: add a picture address, or untick Instagram"; await render();
    await type(q('textarea[aria-label="Post text"]'), "Keep me"); await click(q('input[aria-label="Facebook"]')); await click(btn("Post now"));
    expect(q('[role="alert"]')!.textContent).toContain("needs a picture"); expect((q('textarea[aria-label="Post text"]') as HTMLTextAreaElement).value).toBe("Keep me");
  });
  it("lists recent posts with what each network answered, and offers a retry for a failed one and a cancel for a scheduled one", async () => {
    posts = [post({ id: "a", status: "partial", results: { facebook: { ok: true, id: "1" }, threads: { ok: false, error: "Rate limit" } } }), post({ id: "b", status: "scheduled", results: {} }), post({ id: "c", auto: true, kind: "launch", createdBy: "Automatic" })];
    await render(); const li = [...host.querySelectorAll('section[aria-label="Recent posts"] > ul > li')];
    expect(li).toHaveLength(3); expect(li[0].textContent).toContain("Some networks failed"); expect(li[0].textContent).toContain("Threads: failed. Rate limit"); expect(li[0].textContent).toContain("Facebook: posted");
    expect(li[2].textContent).toContain("automatic"); await click([...li[0].querySelectorAll("button")].find((b) => b.textContent!.includes("Try again")));
    expect(calls.some((c) => c.url.endsWith("/posts/a/retry") && c.init?.method === "POST")).toBe(true);
    await click([...li[1].querySelectorAll("button")].find((b) => b.textContent!.includes("Cancel"))); expect(calls.some((c) => c.url.endsWith("/posts/b/cancel"))).toBe(true);
  });
  it("shows the automatic posts to a Super Administrator only, and saves them", async () => {
    await render(false); expect(q('section[aria-label="Automatic posts"]')).toBeNull();
    act(() => root.unmount()); root = createRoot(host); productFeed = true; await render(true);
    const sec = q('section[aria-label="Automatic posts"]')!; expect(sec.textContent).toContain("Launch countdown"); expect(sec.textContent).toContain("New Ballylife products");
    await click(q('input[aria-label="Launch countdown on"]')); await click(q('input[aria-label="Launch countdown: Facebook"]')); await click([...sec.querySelectorAll("button")].find((b) => b.textContent === "Save"));
    const put = calls.find((c) => c.init?.method === "PUT")!; expect(JSON.parse(String(put.init!.body))).toEqual({ launch: { enabled: true, networks: ["facebook"] } });
  });
  it("says what the products post needs when the shop list is not set up", async () => {
    await render(true); expect(q('section[aria-label="Automatic posts"]')!.textContent).toContain("BALLYLIFE_FEED_URL"); expect((q('input[aria-label="New Ballylife products on"]') as HTMLInputElement).disabled).toBe(true);
  });
});
