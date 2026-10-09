// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Footer } from "./Footer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => { root.render(<Footer />); }); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

/** The five columns of the link grid, as the headings found in each one, in reading order. */
function columns(): string[][] {
  const grid = [...host.querySelectorAll("div")].find((d) => d.style.display === "grid")!;
  return [...grid.children].map((col) => [...col.querySelectorAll("p")].map((p) => p.textContent!).filter((t) => ["Useful Tools", "Who We Are", "Our Sites", "Support", "Legal"].includes(t)));
}

describe("Footer", () => {
  it("arranges the links in five columns: Useful Tools, Who We Are, Our Sites, Support, and the app badges with Legal underneath", () => {
    expect(columns()).toEqual([["Useful Tools"], ["Who We Are"], ["Our Sites"], ["Support"], ["Legal"]]);
    const last = [...host.querySelectorAll("div")].find((d) => d.style.display === "grid")!.lastElementChild!;
    expect(last.textContent).toContain("App Store"); expect(last.textContent).toContain("Google Play");
    expect(last.textContent!.indexOf("Coming Soon")).toBeLessThan(last.textContent!.indexOf("Legal"));      // badges first, Legal under them
  });

  it("keeps every link and the legal bar, and no longer lists the lost-card numbers", () => {
    for (const t of ["Latest Offers", "About VINK", "Personal Banking", "Contact Us", "Legal and Compliance", "Terms of use", "Banking regulations", "Privacy Statement"]) expect(host.textContent).toContain(t);
    expect(host.textContent).not.toContain("Lost or stolen"); expect(host.querySelector('a[href^="tel:"]')).toBeNull();
    expect(host.textContent).toContain("Security Centre"); expect(host.textContent).toContain("not yet operational");
  });

  it("passes a clicked link's label to the page", () => {
    const labels: string[] = [];
    const h = (e: Event) => labels.push((e as CustomEvent).detail.label);
    window.addEventListener("vink:footer-link", h);
    act(() => { ([...host.querySelectorAll("a")].find((a) => a.textContent === "Careers") as HTMLAnchorElement).click(); });
    window.removeEventListener("vink:footer-link", h);
    expect(labels).toEqual(["Careers"]);
  });
});
