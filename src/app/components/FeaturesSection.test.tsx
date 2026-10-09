// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Gift } from "lucide-react";
import { FeaturesSection } from "./FeaturesSection";
import { PremiumIcon } from "./PremiumIcon";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const mount = (el: React.ReactElement) => act(() => { root.render(el); });

describe("PremiumIcon", () => {
  it("draws a medallion with a gradient-stroked vector icon, hidden from assistive technology", () => {
    mount(<PremiumIcon icon={Gift} accent="#4ADE80" size={72} />);
    const m = host.firstElementChild as HTMLElement;
    expect(m.getAttribute("aria-hidden")).toBe("true"); expect(m.style.width).toBe("72px"); expect(m.style.height).toBe("72px");
    const icon = m.querySelector("svg.lucide") as SVGElement;
    expect(icon).not.toBeNull(); expect(icon.getAttribute("stroke")).toMatch(/^url\(#vk-ico-[A-Za-z0-9_-]+\)$/);
    const gradientId = icon.getAttribute("stroke")!.slice(5, -1);
    expect(m.querySelector(`linearGradient#${gradientId}`)).not.toBeNull();                     // the gradient the icon points at exists
    expect(m.querySelector("img")).toBeNull();                                                  // no raster image
  });

  it("gives every medallion its own gradient, so two on a page cannot borrow each other's colours", () => {
    mount(<><PremiumIcon icon={Gift} accent="#4ADE80" /><PremiumIcon icon={Gift} accent="#F97316" /></>);
    const ids = [...host.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(2);
  });
});

describe("FeaturesSection benefits", () => {
  it("shows the six benefits, each with a vector medallion, and the Most Popular badge once without covering an icon", () => {
    mount(<FeaturesSection />);
    for (const t of ["Rewards", "Cash Back", "Balance Transfer", "Travel", "Zero Percent", "Low Interest"]) expect(host.textContent).toContain(t);
    expect(host.textContent).toContain("Earn points on every spend and redeem for exciting rewards and offers.");
    expect(host.textContent!.match(/Most Popular/g)).toHaveLength(1);
    const medallions = [...host.querySelectorAll('span[aria-hidden="true"]')].filter((s) => s.querySelector("svg.lucide") && (s as HTMLElement).style.width === "72px");
    expect(medallions).toHaveLength(6);
    const popular = [...host.querySelectorAll("span")].find((s) => s.textContent === "Most Popular")!;
    expect(popular.closest("[aria-hidden='true']")).toBeNull();                                  // the badge is its own element, not inside an icon
    expect(popular.className).not.toContain("absolute");                                         // in the card's footer row, so it never sits over the icon
    expect(host.querySelectorAll("img[src*='BenefitIcon']")).toHaveLength(0);                    // the old raster icons are gone
  });

  it("gives the four figures in the strip the same medallion treatment", () => {
    mount(<FeaturesSection />);
    for (const t of ["5X", "100+", "24/7"]) expect(host.textContent).toContain(t);
    const small = [...host.querySelectorAll('span[aria-hidden="true"]')].filter((s) => s.querySelector("svg.lucide") && (s as HTMLElement).style.width === "48px");
    expect(small).toHaveLength(4);
  });
});
