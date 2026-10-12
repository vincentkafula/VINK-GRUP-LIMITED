// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ContactUsViewer } from "./ContactUsViewer";
import { resetWhatsAppInfo } from "../WhatsAppChat";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, posted: Record<string, unknown>[], onClose: ReturnType<typeof vi.fn>;
beforeEach(() => {
  posted = []; onClose = vi.fn(); resetWhatsAppInfo();
  vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => {
    const url = String(u);
    if (url.endsWith("/api/whatsapp/info")) return new Response(JSON.stringify({ success: true, enabled: false, number: null, link: null }));
    if (url.endsWith("/api/contact") && init?.method === "POST") { posted.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ success: true, data: { ref: "VK-1234" } }), { status: 201 }); }
    return new Response(JSON.stringify({ success: true, departments: [] }));
  }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 15)); });
const render = async (tab?: "connect" | "locate" | "feedback") => { await act(async () => { root.render(<ContactUsViewer isOpen onClose={onClose} initialTab={tab} />); }); await settle(); await settle(); };
const click = async (el: Element | null | undefined) => { if (!el) throw new Error("nothing to click"); await act(async () => { (el as HTMLElement).click(); }); await settle(); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const tab = (name: string) => [...host.querySelectorAll('[role="tab"]')].find((t) => t.textContent === name) as HTMLElement;

describe("the Contact page hero and tabs", () => {
  it("opens with the red hero: the headline, the three quick links, and the support details", async () => {
    await render();
    const hero = q("section[aria-labelledby='contact-hero-title']")!;
    expect(hero.style.background).toMatch(/200, 16, 46|#c8102e/i); expect(hero.querySelector("h1")!.textContent).toBe("Get the contact information you need");
    expect([...hero.querySelectorAll("a, button")].map((e) => e.textContent).filter((t) => ["Call us", "Locate us", "Send us your feedback"].includes(t!))).toEqual(["Call us", "Locate us", "Send us your feedback"]);
    expect(hero.querySelector('a[href="tel:+27210095100"]')).toBeTruthy(); expect(hero.textContent).toContain("Lost cards and fraud: 24/7");
  });
  it("has three tabs that switch the panel, with the right roles, and the hero links go to their tabs", async () => {
    await render();
    expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(["Connect With Us", "Locate Us", "Send Us Your Feedback"]);
    expect(tab("Connect With Us").getAttribute("aria-selected")).toBe("true"); expect(q('[role="tabpanel"]')!.getAttribute("aria-labelledby")).toBe("tab-connect");
    await click(tab("Locate Us")); expect(tab("Locate Us").getAttribute("aria-selected")).toBe("true"); expect(q('[role="tabpanel"]')!.textContent).toContain("Locate a branch or agent");
    await click([...host.querySelectorAll("section[aria-labelledby='contact-hero-title'] button")].find((b) => b.textContent === "Send us your feedback"));
    expect(tab("Send Us Your Feedback").getAttribute("aria-selected")).toBe("true");
  });
  it("has a breadcrumb whose Home goes back to the home page", async () => {
    await render(); await click([...host.querySelectorAll('nav[aria-label="Breadcrumb"] button')].find((b) => b.textContent === "Home")); expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("the Connect tab", () => {
  it("lists the services as items that open one by one, with the real numbers inside", async () => {
    await render();
    const btn = q("#acc-btn-cards")!; expect(btn.getAttribute("aria-expanded")).toBe("false"); expect(q("#acc-panel-cards")!.hasAttribute("hidden")).toBe(true);
    await click(btn); expect(btn.getAttribute("aria-expanded")).toBe("true"); expect(q("#acc-panel-cards")!.hidden).toBe(false);
    expect(q("#acc-panel-cards a[href='tel:+27210070772']")!.textContent).toBe("+27 (0)21 007 0772");
    expect(q("#acc-panel-fraud")!.hidden).toBe(true);                                            // the others stay closed
    await click(btn); expect(q("#acc-panel-cards")!.hidden).toBe(true);
  });
  it("offers each department's mailbox, and the banking areas", async () => {
    await render();
    expect(q("#acc-btn-dept-support")!.textContent).toContain("Customer Support"); expect(q("#acc-panel-dept-support a[href='mailto:support@vink.co.za']")).toBeTruthy();
    expect(["Personal Banking", "Business Banking", "Loans & Credit"].every((t) => host.textContent!.includes(t))).toBe(true);
  });
  it("has the immediate-assistance card with the support number, and falls back to the message form when WhatsApp is off", async () => {
    await render();
    const card = q('aside[aria-label="Immediate assistance"]')!; expect(card.textContent).toContain("Need immediate assistance?"); expect(card.querySelector("a[href='tel:+27210095100']")).toBeTruthy();
    expect(card.textContent).toContain("Fraud Hotline"); await click([...card.querySelectorAll("button")].find((b) => b.textContent === "Message us")); expect(tab("Send Us Your Feedback").getAttribute("aria-selected")).toBe("true");
  });
});

describe("the Locate tab", () => {
  it("filters the locations, shows the Head Office on a map with directions, and says agents are announced later", async () => {
    await render("locate");
    expect(q("iframe[title='Map of the VINK Head Office']")!.getAttribute("src")).toContain("8%20Rose%20Street"); expect(q("a[href*='/maps/dir/']")).toBeTruthy();
    await click([...host.querySelectorAll('[role="group"] button')].find((b) => b.textContent === "Agents"));
    expect(q("iframe")).toBeNull(); expect(host.textContent).toContain("Agent locations are announced before launch");
  });
});

describe("the Feedback tab", () => {
  it("sends the type, rating, topic and place with the message, and shows the reference", async () => {
    await render("feedback");
    const type = async (el: HTMLElement, v: string) => { await act(async () => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }); };
    await click(q('input[name="kind"][value="Complaint"]')); await click(q('button[aria-label="4 stars"]'));
    await type(q("#contact-message")!, "My card was declined twice"); await type(q("#contact-name")!, "Thandi"); await type(q("#contact-surname")!, "Nkosi"); await type(q("#contact-email")!, "thandi@example.com");
    const code = [...host.querySelectorAll("canvas")].length; expect(code).toBe(1);                       // the code box is there; it is checked before anything is sent
    await act(async () => { q("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await settle();
    expect(posted).toHaveLength(0);                                                                    // a wrong or empty code sends nothing
    expect(host.querySelector('[role="radio"][aria-checked="true"]')!.getAttribute("aria-label")).toBe("4 stars");
  });
});
