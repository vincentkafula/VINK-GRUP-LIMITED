import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { BRAND } from "./brand";

const css = readFileSync("src/styles/tokens.css", "utf8");
const light = css.slice(css.indexOf("\n:root"), css.indexOf("\n.dark {"));
const darkStart = css.indexOf("\n.dark {");
const dark = css.slice(darkStart, css.indexOf("\n}", darkStart));
const token = (block: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1].toUpperCase();

// WCAG 2.x relative luminance and contrast ratio
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe("brand colours", () => {
  it("agree with the design tokens, so the website and the code use one palette", () => {
    expect(token(light, "vk-brand")).toBe(BRAND.crimson);
    expect(token(light, "vk-brand-hover")).toBe(BRAND.crimsonHover);
    expect(token(light, "vk-brand-active")).toBe(BRAND.crimsonDeep);
    expect(token(light, "vk-brand-soft")).toBe(BRAND.crimsonSoft);
    expect(token(light, "vk-navy")).toBe(BRAND.navy);
    expect(token(light, "vk-navy-2")).toBe(BRAND.navy2);
    expect(token(dark, "vk-crimson-text")).toBe(BRAND.crimsonOnDark);
  });
  it("use exactly the brief's palette: red #C8102E (hover #A50F27, pressed #8F1027), white page, #F7F7F8 and #FAF8F7 alternate sections, #E8E8EC lines, #202124 and #6B7280 text", () => {
    expect([BRAND.crimson, BRAND.crimsonHover, BRAND.crimsonDeep, BRAND.navy]).toEqual(["#C8102E", "#A50F27", "#8F1027", "#101828"]);
    expect(token(light, "vk-bg")).toBe("#FFFFFF"); expect(token(light, "vk-surface")).toBe("#FFFFFF");
    expect(token(light, "vk-surface-2")).toBe("#F7F7F8"); expect(token(light, "vk-warm")).toBe("#FAF8F7");
    expect(token(light, "vk-line")).toBe("#E8E8EC");
    expect(token(light, "vk-fg")).toBe("#202124"); expect(token(light, "vk-fg-muted")).toBe("#6B7280");
  });
  it("keep the legacy 'gold' tokens aliased to the brand red, so nothing still using bg-gold / text-gold is off-brand", () => {
    expect(token(light, "vk-gold")).toBe(BRAND.crimson);
    expect(token(dark, "vk-gold")).toBe(BRAND.crimson);
    expect(token(light, "vk-gold-fg")).toBe("#FFFFFF");
    expect(token(dark, "vk-gold-fg")).toBe("#FFFFFF");
  });
  it("are all valid hex colours", () => { for (const v of Object.values(BRAND)) expect(v).toMatch(/^#[0-9A-F]{6}$/); });
});

describe("accessible contrast (WCAG AA, 4.5:1 for text)", () => {
  const surfaces = ["vk-bg", "vk-surface", "vk-surface-2"];
  for (const [theme, block] of [["light", light], ["dark", dark]] as const) {
    describe(theme, () => {
      for (const text of ["vk-fg", "vk-fg-muted", "vk-fg-subtle", "vk-crimson-text", "vk-gold-text"]) {
        for (const surface of surfaces) {
          it(`${text} on ${surface}`, () => {
            const fg = token(block, text), bg = token(block, surface);
            expect(fg && bg, `missing token (${text} or ${surface})`).toBeTruthy();
            expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
          });
        }
      }
      for (const fill of ["vk-brand", "vk-brand-hover", "vk-brand-active"]) {
        it(`white text on ${fill}`, () => {
          const f = token(block, fill);
          expect(f, `missing ${fill}`).toBeTruthy();
          expect(contrast(token(block, "vk-brand-fg")!, f!)).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }
  it("red as a FILL on navy is a visible shape (3:1), even though red as small TEXT there is not (which is why the dark text tint exists)", () => {
    expect(contrast(BRAND.crimson, BRAND.navy)).toBeGreaterThanOrEqual(3);
    expect(contrast(BRAND.crimson, BRAND.navy)).toBeLessThan(4.5);
    expect(contrast(BRAND.crimsonOnDark, BRAND.navy)).toBeGreaterThanOrEqual(4.5);
  });
});

it("text keeps AA contrast on the soft warm section background too", () => { for (const t of ["vk-fg", "vk-fg-muted", "vk-crimson-text"]) expect(contrast(token(light, t)!, token(light, "vk-warm")!), t).toBeGreaterThanOrEqual(4.5); });

describe("app manifests", () => {
  it("use the site's page colour, not a separate brand colour", () => {
    for (const f of ["public/manifest.json", "public/manifest-admin.json"]) {
      const m = JSON.parse(readFileSync(f, "utf8"));
      expect(m.theme_color.toLowerCase()).toBe("#ffffff"); expect(m.background_color.toLowerCase()).toBe("#ffffff");
    }
  });
});
