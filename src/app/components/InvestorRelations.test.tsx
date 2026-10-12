// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { InvestorRelationsViewer } from "./InvestorRelationsViewer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, posted: Record<string, unknown>[], refuse: boolean;
beforeEach(() => {
  posted = []; refuse = false;
  vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => {
    if (String(u).endsWith("/api/contact") && init?.method === "POST") { posted.push(JSON.parse(String(init.body))); return refuse ? new Response(JSON.stringify({ success: false, error: "Too many messages" }), { status: 429 }) : new Response(JSON.stringify({ success: true, data: { ref: "VK-77" } }), { status: 201 }); }
    return new Response(JSON.stringify({ success: true }));
  }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const render = async () => { await act(async () => { root.render(<InvestorRelationsViewer isOpen onClose={() => {}} />); }); await wait(700); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); await wait(20); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const titles = () => [...host.querySelectorAll(".card h3")].map((h) => h.textContent);

describe("the Investor Relations page", () => {
  it("has the hero and the six resource cards of the design, in order, with their pictures", async () => {
    await render();
    expect(q(".hero h1")!.textContent).toBe("Information for our stakeholders"); expect(q(".eyebrow")!.textContent).toBe("Investor relations"); expect(q(".hero")!.textContent).toContain("2018/079316/07");
    expect(titles()).toEqual(["Annual reports", "Financial results", "Shareholder and dividend information", "Capital and risk management", "Debt investors", "Announcements and news"]);
    expect([...host.querySelectorAll(".card .idx")].map((i) => i.textContent)).toEqual(["01", "02", "03", "04", "05", "06"]);
    expect(host.querySelectorAll(".card .art2 svg")).toHaveLength(6); expect(host.querySelectorAll(".card.in")).toHaveLength(6);
    expect(q(".shead h2")!.textContent).toBe("Everything you need to make informed decisions");
  });
  it("no longer shows the share price, which was not VINK's", async () => {
    await render(); expect(host.textContent).not.toContain("Share Price"); expect(host.textContent).not.toContain("JSE"); expect(host.textContent).not.toContain("15 Sep 2022");
  });
  it("opens each card with VINK's real information, and goes back", async () => {
    await render();
    await click(host.querySelectorAll(".card")[1]); expect(q("h2.t")!.textContent).toBe("Financial results"); expect(q(".doc")!.textContent).toContain("R11B"); expect(q(".doc")!.textContent).toContain("3 reasons to consider investing in VINK"); expect(q(".doc")!.textContent).toContain("Per-Tap");
    await click(q(".back")); expect(titles()).toHaveLength(6);
    await click(host.querySelectorAll(".card")[2]); expect(q(".doc")!.textContent).toContain("120210020196"); expect(q(".doc")!.textContent).toContain("EIN 37-2148609");
    await click(q(".back")); await click(host.querySelectorAll(".card")[4]); expect(q(".doc")!.textContent).toContain("R4.5 Billion"); expect(q(".doc")!.textContent).toContain("60 months @ 7%");
    await click(q(".back")); await click(host.querySelectorAll(".card")[5]); expect(q(".doc")!.textContent).toContain("not yet in full operation");
    await click(q(".back")); await click(host.querySelectorAll(".card")[0]); expect(q(".doc")!.textContent).toContain("Memorandum of Incorporation"); expect(q(".doc a[href^='mailto:info@vink.co.za']")).toBeTruthy(); expect(q(".doc")!.textContent).not.toContain("Download");
  });
  it("links the capital and risk card to the governance pages", async () => {
    await render(); await click(host.querySelectorAll(".card")[3]); await click(q(".doc a[href='#governance']")); expect(q("h2.t")!.textContent).toBe("Our Board of Directors");
  });
  it("has the contact band with VINK's own address, number and mailbox, and the Facebook page", async () => {
    await render(); const c = q(".contact")!;
    expect(c.textContent).toContain("8 Rose Street, Cape Town"); expect(c.querySelector("a[href='tel:+27210095100']")).toBeTruthy(); expect(c.querySelector("a[href='mailto:info@vink.co.za']")).toBeTruthy();
    expect(c.querySelector("a[href='https://www.facebook.com/vinkwaste/']")).toBeTruthy(); expect(c.textContent).not.toContain("Sandton"); expect(c.textContent).not.toContain("123 4567");
  });
  it("sends an investor-alerts request to VINK, with a reference, and does not pretend when the address is wrong or the server refuses", async () => {
    await render();
    const input = q('.fl input') as HTMLInputElement, form = q(".sub form")!;
    const type = async (v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v); input.dispatchEvent(new Event("input", { bubbles: true })); }); };
    const submit = async () => { await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await wait(30); };
    await type("nope"); await submit(); expect(q(".sm")!.textContent).toBe("Please enter a valid email address."); expect(posted).toHaveLength(0);
    refuse = true; await type("ada@example.com"); await submit(); expect(q(".sm")!.textContent).toBe("Too many messages"); refuse = false;
    await submit(); expect(posted).toHaveLength(2); expect(posted[1]).toMatchObject({ department: "general", email: "ada@example.com", subject: "Investor alerts sign-up" });
    expect(q(".sm")!.textContent).toContain("VK-77"); expect(q(".sm")!.textContent).toContain("ada@example.com"); expect(input.value).toBe("");
  });
});
