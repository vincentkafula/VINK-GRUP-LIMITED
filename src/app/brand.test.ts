import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { BRAND } from "./brand";

const css = readFileSync("src/styles/tokens.css", "utf8");
const light = css.slice(css.indexOf("\n:root"), css.indexOf("\n.dark {"));
const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(light)?.[1].toUpperCase();

describe("brand colours", () => {
  it("agree with the design tokens, so the website and the code use one palette", () => {
    expect(token("vk-brand")).toBe(BRAND.crimson);
    expect(token("vk-gold")).toBe(BRAND.gold);
  });
  it("are all valid hex colours", () => { for (const v of Object.values(BRAND)) expect(v).toMatch(/^#[0-9A-F]{6}$/); });
});

describe("app manifests", () => {
  it("use the site's page colour, not a separate green", () => {
    for (const f of ["public/manifest.json", "public/manifest-admin.json"]) {
      const m = JSON.parse(readFileSync(f, "utf8"));
      expect(m.theme_color.toLowerCase()).toBe("#faf8f4"); expect(m.background_color.toLowerCase()).toBe("#faf8f4");
    }
  });
});
