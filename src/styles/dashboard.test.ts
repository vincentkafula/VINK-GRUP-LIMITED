import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const css = readFileSync(join(__dirname, "dashboard.css"), "utf8");
const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const RED = [200, 16, 46];                                                                     // #C8102E, the dashboards' backdrop
const over = (a: number, bg: number[]) => bg.map((c) => a * 255 + (1 - a) * c);
const ratio = (a: number, bg: number[]) => { const [hi, lo] = [lum(over(a, bg)), lum(bg)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const alphaOf = (token: string) => [...css.matchAll(new RegExp(`${token}: rgba\\(255, 255, 255, ([0-9.]+)\\)`, "g"))].map((m) => Number(m[1]));

describe("the red dashboards' text on the brand red", () => {
  it("keeps white, muted and subtle text readable (4.5 to 1) on #C8102E, wherever the stylesheet sets them", () => {
    for (const token of ["--vk-fg-muted", "--vk-fg-subtle"]) {
      const alphas = alphaOf(token); expect(alphas.length, token).toBeGreaterThan(0);
      for (const a of alphas) expect(ratio(a, RED), `${token} at ${a}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps muted brighter than subtle, so the two still look different", () => { expect(Math.min(...alphaOf("--vk-fg-muted"))).toBeGreaterThan(Math.max(...alphaOf("--vk-fg-subtle"))); });
  it("gives the real theme colours back to a widget that paints its own surface inline, not only to one with the class", () => {
    expect(css).toContain('[style*="background: var(--vk-surface"]'); expect(css).toContain(".bg-surface");
  });
});
