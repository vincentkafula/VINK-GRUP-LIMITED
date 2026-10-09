// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { BusinessPowerSection } from "./BusinessPowerSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
const clicks = vi.fn();
beforeEach(() => { clicks.mockReset(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => { root.render(<BusinessPowerSection onSubNavClick={clicks} />); }); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("BusinessPowerSection (Global Payments)", () => {
  it("keeps every word of the copy", () => {
    const t = host.textContent!;
    for (const s of [
      "Global Payments", "Cross-border payments shouldn't cost a fortune.",
      "People around the world pay a fortune to send money across borders — often 10% or more in fees just to support a loved one. Businesses fare no better, losing significant money every time they purchase or import goods from abroad.",
      "Once you qualify for a VINK card, every transaction — even cross-border transfers — is charged at local rates.",
      "No international fees. No hidden markups. Just local pricing, wherever you send or spend.",
      "VINK has eliminated these fees in its initial markets, with more countries coming soon:",
      "We're not a traditional bank — VINK is a cloud-based banking platform issuing Visa and Mastercard-powered cards, built for how people and businesses actually move money today.",
    ]) expect(t).toContain(s);
    expect([...host.querySelectorAll("ul > li")].map((l) => l.textContent)).toEqual(["🇿🇦 South Africa", "🇺🇸 United States", "🇿🇲 Zambia", "🇨🇳 China"]);
  });

  it("sets the type large: a big headline with its second half emphasised, and body text of at least 16px", () => {
    const h = host.querySelector("h2")!;
    expect(h.className).toContain("text-[2.5rem]"); expect(h.className).toContain("xl:text-[3.5rem]");
    expect(h.querySelector("span")!.textContent).toBe("shouldn't cost a fortune.");
    const body = [...host.querySelectorAll("p")].filter((p) => p.textContent!.length > 60);
    expect(body.length).toBeGreaterThanOrEqual(4);
    for (const p of body) expect(p.className).toMatch(/text-(base|lg|xl|\[1[5-9]px\]|\[1\.|\[2)/);
    expect(body.some((p) => /text-\[1\.65rem\]/.test(p.className))).toBe(true);                       // the pull-quote line
  });

  it("shows the three figures with premium medallions, and the two buttons call the page", () => {
    const cards = ["4", "Local", "256-bit"].map((v) => [...host.querySelectorAll("p")].find((p) => p.textContent === v)!);
    for (const c of cards) expect(c.closest("div.group")!.querySelector('[aria-hidden="true"] svg.lucide')).not.toBeNull();
    expect(host.textContent).toContain("South Africa, the US, Zambia, and China"); expect(host.textContent).toContain("Bank-grade security on every payment");
    const buttons = [...host.querySelectorAll("button")];
    act(() => { buttons[0].click(); buttons[1].click(); });
    expect(clicks.mock.calls).toEqual([["Start My Business"], ["BusinessHome"]]);
  });
});
