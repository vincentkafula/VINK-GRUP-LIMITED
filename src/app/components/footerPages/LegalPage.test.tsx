// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { LegalComplianceViewer } from "./LegalComplianceViewer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, onClose: ReturnType<typeof vi.fn>;
beforeEach(() => { onClose = vi.fn(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = async (initialTab?: string) => { await act(async () => { root.render(<LegalComplianceViewer isOpen onClose={onClose} initialTab={initialTab} />); }); await act(async () => { await new Promise((r) => setTimeout(r, 30)); }); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const cards = () => [...host.querySelectorAll(".card")].map((c) => c.textContent);

describe("the Legal and compliance page", () => {
  it("has the hero, the three tabs, the breadcrumb and the thirteen documents of the design", async () => {
    await render();
    expect(q(".hero h1")!.textContent).toBe("Building trust through responsible banking"); expect(q(".eyebrow")!.textContent).toBe("Legal and compliance");
    expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Legal and compliance", "Banking Code of Conduct", "FAIS Disclosure"]);
    expect(cards()).toEqual(["Banking Code of Conduct", "FAIS Disclosure", "Terms of use", "Privacy statement", "Conflict of Interest", "Email disclaimer", "Browser requirements", "Cookies policy", "Regulatory declaration", "Personal client agreement", "Business client agreement", "FICA information", "Your right to access personal information"]);
    expect(q(".count")!.textContent).toBe("13 documents"); expect(q(".crumb")!.textContent).toContain("Home/Legal and compliance");
    expect(q(".hero")!.querySelector("svg")).toBeTruthy();
  });
  it("fades the cards in one after another", async () => {
    await render(); await act(async () => { await new Promise((r) => setTimeout(r, 600)); }); expect(host.querySelectorAll(".card.in").length).toBe(13);
  });
  it("searches the documents, counts them, and says when none match", async () => {
    await render();
    const input = q('input[type="search"]') as HTMLInputElement;
    const type = async (v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v); input.dispatchEvent(new Event("input", { bubbles: true })); }); };
    await type("agreement"); expect(cards()).toEqual(["Personal client agreement", "Business client agreement"]); expect(q(".count")!.textContent).toBe("2 documents");
    await type("cookies"); expect(q(".count")!.textContent).toBe("1 document");
    await type("zzz"); expect(cards()).toEqual([]); expect(q(".empty")!.textContent).toBe("No documents match your search."); expect(q(".count")!.textContent).toBe("0 documents");
  });
  it("opens the documents VINK has published, with their text, and goes back", async () => {
    await render();
    await click([...host.querySelectorAll(".card")].find((c) => c.textContent === "Terms of use")); expect(q("h2.h")!.textContent).toBe("Terms of use"); expect(q(".doc")!.textContent).toContain("lawful personal and business use only");
    expect(q(".crumb")!.textContent).toContain("Legal and compliance/Terms of use");
    await click(q(".back")); expect(q("h2.h")!.textContent).toBe("Legal and compliance"); expect(cards()).toHaveLength(13);
    await click([...host.querySelectorAll(".card")].find((c) => c.textContent === "Regulatory declaration")); expect(q(".doc")!.textContent).toContain("Financial Sector Regulation Act"); expect(q(".doc")!.textContent).toContain("2018/079316/07");
    await click(q(".crumb button:nth-of-type(2)")); expect(q("h2.h")!.textContent).toBe("Legal and compliance");
  });
  it("says plainly that a document that is not published yet is not published, and does not make one up", async () => {
    await render();
    await click([...host.querySelectorAll(".card")].find((c) => c.textContent === "Banking Code of Conduct"));
    expect(q(".doc")!.textContent).toContain("will be published here before VINK launches"); expect(q(".doc a[href='mailto:compliance@vink.co.za']")).toBeTruthy();
    expect(q('[role="tab"][aria-selected="true"]')!.textContent).toBe("Banking Code of Conduct");
  });
  it("still opens the document the footer asks for", async () => {
    await render("privacy"); expect(q("h2.h")!.textContent).toBe("Privacy statement"); expect(q(".doc")!.textContent).toContain("POPIA");
    act(() => root.unmount()); root = createRoot(host); await render("regulatory"); expect(q("h2.h")!.textContent).toBe("Regulatory declaration");
    act(() => root.unmount()); root = createRoot(host); await render("compliance"); expect(q("h2.h")!.textContent).toBe("Legal and compliance");
  });
  it("has the help panel with the real contact details, and the note", async () => {
    await render();
    const a = q("aside.help")!; expect(a.textContent).toContain("Need more help?"); expect(a.querySelector("a[href='tel:+27210095100']")).toBeTruthy(); expect(a.querySelector("a[href='mailto:compliance@vink.co.za']")).toBeTruthy();
    const heard: string[] = []; const h = (e: Event) => heard.push((e as CustomEvent).detail.label); window.addEventListener("vink:footer-link", h);
    await click([...a.querySelectorAll("button")].find((b) => b.textContent!.includes("Visit a branch"))); await click([...a.querySelectorAll("button")].find((b) => b.textContent!.includes("Get in touch")));
    window.removeEventListener("vink:footer-link", h); expect(heard).toEqual(["Find the Branch", "Contact Us"]);
    expect(q(".note")!.textContent).toContain("Please note:"); expect(q(".note")!.textContent).toContain("not legal advice");
  });
  it("sends Home back to the home page", async () => { await render(); await click(q(".crumb button")); expect(onClose).toHaveBeenCalledTimes(1); });
});
