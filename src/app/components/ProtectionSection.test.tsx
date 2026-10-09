// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ProtectionSection } from "./ProtectionSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => { root.render(<ProtectionSection />); }); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("ProtectionSection", () => {
  it("keeps every word of the copy, with the headline on two lines and its second line emphasised", () => {
    const h = host.querySelector("h2")!;
    expect(h.textContent).toBe("Your Money.Always Protected.");
    expect(h.querySelector("br")).not.toBeNull(); expect(h.querySelector("span")!.textContent).toBe("Always Protected.");
    expect(host.textContent).toContain("Zero Liability");
    expect(host.textContent).toContain("VINK monitors every transaction in real time, 24 hours a day, seven days a week.");
    expect(host.textContent).toContain("Your peace of mind is never more than a tap away.");
    expect(host.textContent).toContain("If something goes wrong, VINK makes it right — fast.");
  });

  it("shows the three guarantees as a list, each with an icon that screen readers skip, and the button", () => {
    const items = [...host.querySelectorAll("ul > li")];
    expect(items.map((i) => i.textContent?.trim())).toEqual(["256-bit AES Encryption", "Real-time fraud alerts", "Zero-liability guarantee"]);
    for (const i of items) expect(i.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    expect(host.querySelector("button")!.textContent).toContain("Learn How We Protect You");
  });

  it("sets the type larger than before: a big headline and body text of at least 16px", () => {
    const h = host.querySelector("h2")!.className;
    expect(h).toContain("text-[2.5rem]"); expect(h).toContain("lg:text-[3.5rem]"); expect(h).toContain("font-display");
    const paras = [...host.querySelectorAll("p")];
    expect(paras).toHaveLength(2);
    for (const p of paras) expect(p.className).toMatch(/text-(base|lg)/);
    expect(paras[0].className).toContain("sm:text-xl");
  });
});
