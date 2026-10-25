import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const tsx = readFileSync(join(__dirname, "FeaturesSection.tsx"), "utf8");
const css = readFileSync(join(__dirname, "../../styles/premium.css"), "utf8");
const tokens = readFileSync(join(__dirname, "../../styles/tokens.css"), "utf8");
const palette = css.slice(css.indexOf(".vkp-ivory {"), css.indexOf("/* ── Polish"));   // the ivory scope, up to the general polish styles

// the value of a token in the light theme (:root) or the dark theme (.dark)
const block = (open: string) => { const i = tokens.indexOf(open); return tokens.slice(i, tokens.indexOf("\n}", i)); };
const light = block(":root {"), dark = block(".dark {");
const tok = (scope: string, name: string) => scope.match(new RegExp(`--vk-${name}:\\s*([^;]+);`))![1].trim();

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const over = (fg: number[], a: number, bg: number[]) => fg.map((v, i) => a * v + (1 - a) * bg[i]);
const WHITE = [255, 255, 255];

describe("More Than a Card: the ivory and crimson palette", () => {
  it("is one class on the section, with no violet and no hardcoded old colours left in its markup", () => {
    expect(tsx).toContain('className="vkp-ivory relative');
    for (const old of ["vkv-", "violet", "#5d1efb", "#3b4cca", "93,30,251", "183,124,255"]) expect(tsx, old).not.toContain(old);
  });
  it("is scoped: every rule in the palette block starts with .vkp-ivory or .dark .vkp-ivory, so other sections are untouched", () => {
    const rules = palette.split("}").map((r) => r.replace(/\/\*[\s\S]*?\*\//g, "").trim()).filter(Boolean).map((r) => r.split("{")[0].trim());
    expect(rules.length).toBeGreaterThan(10);
    for (const sel of rules) expect(/^(\.vkp-ivory|\.dark \.vkp-ivory)/.test(sel), sel).toBe(true);
  });
  it("defines the palette once, as tokens: ivory, ink and rose, with the dark theme flipping ivory and ink", () => {
    expect([tok(light, "ivory"), tok(light, "ivory-2"), tok(light, "ink"), tok(light, "rose")]).toEqual(["#f6f3ee", "#fbf9f5", "#0b1020", "#fbe3e7"]);
    expect([tok(dark, "ivory"), tok(dark, "ink")]).toEqual(["#0b1020", "#f6f3ee"]);
  });
  it("keeps the Visa card exactly as it was: the same image, still magnified on roll-over and opened in 3D on click", () => {
    expect(tsx).toContain('import vinkGoldFeatureCard from "../../imports/VinkGoldFeatureCard.webp"'); expect(tsx).toContain('alt="VINK Visa Signature card"'); expect(tsx).toContain("setShowCardViewer(true)");
  });
});

describe("the ivory palette stays readable (WCAG AA)", () => {
  const ivory = rgb(tok(light, "ivory")), ivory2 = rgb(tok(light, "ivory-2"));
  it("ink headings on ivory, and ink-2 body text and ink-3 captions on every light surface", () => {
    expect(ratio(rgb(tok(light, "ink")), ivory)).toBeGreaterThanOrEqual(15);
    for (const bg of [ivory, ivory2, WHITE]) { expect(ratio(rgb(tok(light, "ink-2")), bg)).toBeGreaterThanOrEqual(7); expect(ratio(rgb(tok(light, "ink-3")), bg)).toBeGreaterThanOrEqual(4.5); }
  });
  it("crimson text on ivory, white and on the rose tint (the small label and the link)", () => {
    const crimson = rgb(tok(light, "crimson-text")); for (const bg of [ivory, WHITE, rgb(tok(light, "rose"))]) expect(ratio(crimson, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("white text on the featured card, at its lightest gradient stop", () => {
    const stops = [...css.slice(css.indexOf(".vkp-ivory .vkp-spot-hot {")).split("\n")[0].matchAll(/#[0-9a-f]{6}/g)].map((m) => rgb(m[0])); expect(stops.length).toBe(3);
    for (const s of stops) expect(ratio(WHITE, s), s.join(",")).toBeGreaterThanOrEqual(4.5);
  });
  it("in the dark theme: ink-2 and ink-3 on the deep ink surfaces, and crimson text on the crimson wash", () => {
    for (const bg of [rgb(tok(dark, "ivory")), rgb(tok(dark, "ivory-2"))]) { expect(ratio(rgb(tok(dark, "ink-2")), bg)).toBeGreaterThanOrEqual(7); expect(ratio(rgb(tok(dark, "ink-3")), bg)).toBeGreaterThanOrEqual(4.5); }
    const wash = over(rgb("#c8102e"), 0.16, rgb(tok(dark, "ivory-2"))); expect(ratio(rgb("#ff6b81"), wash)).toBeGreaterThanOrEqual(4.5);
  });
});
