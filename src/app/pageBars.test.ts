// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { markPageBars, PAGE_BAR_ATTR } from "./pageBars";

const html = (s: string) => { document.body.innerHTML = s; };
const bars = () => [...document.querySelectorAll(`[${PAGE_BAR_ATTR}]`)];

describe("the page's own logo bar, hidden under the site header", () => {
  beforeEach(() => html(""));

  it("marks the logo + X bar at the top of a page", () => {
    html(`<div class="fixed inset-0"><div class="sticky top-0 border-b"><img alt="VINK"><button aria-label="Close"></button></div><main>content</main></div>`);
    expect(markPageBars()).toBe(1);
    expect(bars()[0].className).toContain("sticky");
  });

  it("marks a top nav that holds the logo and the page's own menu", () => {
    html(`<div class="fixed inset-0"><div><nav><div><img alt="VINK"></div><ul><li>Personal</li></ul></nav><main>content</main></div></div>`);
    expect(markPageBars()).toBe(1);
    expect(bars()[0].tagName).toBe("NAV");
  });

  it("leaves a logo in the footer, in a dialog, or further down the page", () => {
    html(`<div class="fixed inset-0"><div class="sticky"><span>Title</span></div><section class="border-b"><img alt="VINK"></section><footer><div class="border-b"><img alt="VINK"></div></footer></div>
          <div class="fixed inset-0" role="dialog"><div class="border-b"><img alt="VINK"></div></div>`);
    expect(markPageBars()).toBe(0);
  });

  it("is safe to run again", () => {
    html(`<div class="fixed inset-0"><nav><img alt="VINK"></nav></div>`);
    expect(markPageBars()).toBe(1); expect(markPageBars()).toBe(0); expect(bars()).toHaveLength(1);
  });
});
