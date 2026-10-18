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
  it("shows the six benefits, each with a gradient icon tile, and the Most Popular badge once without covering an icon", () => {
    mount(<FeaturesSection />);
    for (const t of ["Rewards", "Cash Back", "Balance Transfer", "Travel", "Zero Percent", "Low Interest"]) expect(host.textContent).toContain(t);
    expect(host.textContent).toContain("Earn points on every spend and redeem for exciting rewards and offers.");
    expect(host.textContent!.match(/Most Popular/g)).toHaveLength(1);
    const medallions = [...host.querySelectorAll('div.vkp-spot span[aria-hidden="true"].size-9')].filter((s) => s.querySelector("svg.lucide"));
    expect(medallions).toHaveLength(6);
    const popular = [...host.querySelectorAll("span")].find((s) => s.textContent === "Most Popular")!;
    expect(popular.closest("[aria-hidden='true']")).toBeNull();                                  // the badge is its own element, not inside an icon
    expect(popular.className).not.toContain("absolute");                                         // in the card's footer row, so it never sits over the icon
    expect(host.querySelectorAll("img[src*='BenefitIcon']")).toHaveLength(0);                    // the old raster icons are gone
  });

  it("puts the Visa card on the left and the six benefits, small and grouped, on the right", () => {
    mount(<FeaturesSection />);
    const card = host.querySelector('button[aria-label="View the VINK Visa Signature card in 3D"]')!;
    const benefits = [...host.querySelectorAll("div.vkp-spot")];
    expect(benefits).toHaveLength(6);
    // the card comes first in the page, and in the layout's first column
    for (const b of benefits) expect(card.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING, b.textContent!.slice(0, 12)).toBeTruthy();
    const layout = card.closest("div.grid")!; expect(layout.className).toContain("lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]");
    expect(layout.children[0].contains(card)).toBe(true);                                         // left column: the card
    const group = benefits[0].parentElement!; expect(group.className).toContain("md:grid-cols-3");   // right column: one compact group, two across
    expect(layout.children[1]).toBe(group); for (const b of benefits) expect(b.parentElement).toBe(group);
    expect(benefits.map((b) => b.querySelector("p")!.textContent)).toEqual(["Rewards", "Cash Back", "Balance Transfer", "Travel", "Zero Percent", "Low Interest"]);   // order and numbering unchanged
  });

  it("makes the benefit cards smaller and the section tighter than before", () => {
    mount(<FeaturesSection />);
    for (const b of host.querySelectorAll("div.vkp-spot")) { expect(b.className).toContain("p-3.5"); expect(b.className).not.toContain("p-5"); expect(b.querySelector("p")!.className).toContain("text-[15px]"); }
    const section = host.querySelector("section")!; expect(section.className).toContain("lg:py-10"); expect(section.className).not.toContain("lg:py-28");
  });

  it("gives the four figures in the dark strip each a glass icon tile", () => {
    mount(<FeaturesSection />);
    for (const t of ["5X", "100+", "24/7"]) expect(host.textContent).toContain(t);
    const small = [...host.querySelectorAll('span[aria-hidden="true"].size-9')].filter((s) => !s.closest("div.vkp-spot") && s.querySelector("svg.lucide"));
    expect(small).toHaveLength(4);
  });
});

describe("the gold card in 'Designed for the way you live'", () => {
  it("magnifies where the mouse rolls over it, says so, and still opens the card when clicked", () => {
    mount(<FeaturesSection />);
    const btn = host.querySelector('button[aria-label="View the VINK Visa Signature card in 3D"]')!;
    const zoom = btn.querySelector("[data-zoom]") as HTMLElement; expect(zoom).toBeTruthy(); expect(zoom.getAttribute("data-zoom")).toBe("off");
    expect(btn.querySelector("img")!.getAttribute("alt")).toBe("VINK Visa Signature card");
    expect(host.textContent).toContain("Roll over image to zoom in · click the card to open it"); expect(host.textContent).toContain("Tap the card to see it in 3D");
  });
});
