import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const tsx = readFileSync(join(__dirname, "FeaturesSection.tsx"), "utf8");
const css = readFileSync(join(__dirname, "../../styles/premium.css"), "utf8");
const violetBlock = css.slice(css.indexOf('.vkp-violet {'));

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const over = (fg: number[], a: number, bg: number[]) => fg.map((v, i) => a * v + (1 - a) * bg[i]);
const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const WHITE = [255, 255, 255];
// The section's background runs #1C0D6F (top) to #111855 to #09124E; the lightest of them is the hardest for light text.
const BG = ["#1c0d6f", "#111855", "#09124e"].map(rgb);

describe("More Than a Card: the violet palette", () => {
  it("is switched on by one class on the section, and no crimson is left in its markup", () => {
    expect(tsx).toContain('className="vkp-ink vkp-violet');
    for (const crimson of ["#c8102e", "#ff8fa3", "200,16,46", "232,64,91"]) expect(tsx, crimson).not.toContain(crimson);
  });
  it("is scoped: every rule in the palette block starts with .vkp-violet (so the other premium sections keep the brand red)", () => {
    const rules = violetBlock.split("}").map((r) => r.trim()).filter((r) => r && !r.startsWith("/*")).map((r) => r.split("{")[0].trim());
    expect(rules.length).toBeGreaterThan(6);
    for (const sel of rules) expect(sel.startsWith(".vkp-violet") || sel.startsWith(".vkp-ink.vkp-violet"), sel).toBe(true);
  });
  it("uses the colours measured from the VINK card design: indigo-navy background, #5D1EFB violet, orchid accent", () => {
    for (const hex of ["#1c0d6f", "#111855", "#09124e", "#5d1efb", "#b77cff"]) expect(violetBlock.toLowerCase(), hex).toContain(hex);
  });
  it("keeps the Visa card exactly as it was: the same image, still magnified on roll-over and opened in 3D on click", () => {
    expect(tsx).toContain('import vinkGoldFeatureCard from "../../imports/VinkGoldFeatureCard.webp"'); expect(tsx).toContain('alt="VINK Visa Signature card"'); expect(tsx).toContain("setShowCardViewer(true)");
  });
});

describe("More Than a Card: text stays readable on the violet palette (WCAG AA)", () => {
  it("white headings, and white text at 70% for the body, on every stop of the background", () => {
    for (const bg of BG) { expect(ratio(WHITE, bg)).toBeGreaterThanOrEqual(7); expect(ratio(over(WHITE, 0.7, bg), bg)).toBeGreaterThanOrEqual(4.5); }
  });
  it("the pale orchid accent text on the background (the eyebrow and the link)", () => { for (const bg of BG) expect(ratio(rgb("#d6b8ff"), bg)).toBeGreaterThanOrEqual(7); });
  it("the gradient word 'you' is large text (72px), so 3 to 1 is the bar: its darkest end clears it", () => { for (const bg of BG) expect(ratio(rgb("#a35bff"), bg)).toBeGreaterThanOrEqual(3); });
  it("white text on the featured card, even at 90% and at its lightest stop", () => {
    const stop = over(rgb("#6a3bff"), 0.97, BG[0]); expect(ratio(WHITE, stop)).toBeGreaterThanOrEqual(4.5); expect(ratio(over(WHITE, 0.9, stop), stop)).toBeGreaterThanOrEqual(4.5);
  });
  it("violet text on the white badge and the white arrow chips", () => { expect(ratio(rgb("#5d1efb"), WHITE)).toBeGreaterThanOrEqual(4.5); });
  it("white icons on the violet tiles, at their lightest stop", () => { expect(ratio(WHITE, rgb("#7a4dff"))).toBeGreaterThanOrEqual(3); });   // an icon needs 3 to 1
});
