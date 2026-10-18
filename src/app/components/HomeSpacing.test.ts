import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
const padding = (f: string) => src(f).match(/<section[^>]*className="([^"]*)"/)![1];

/**
 * The home page's sections were tall and far apart: the hero was 670px, the violet "More Than a Card" section 1,402px, the cross-border section 1,195px, and
 * the protection, cross-border and choose-a-card sections each had up to 112px of padding top and bottom (so two neighbours left a 224px gap).
 * They are compact now; this keeps them that way.
 */
describe("the home page's sections stay compact", () => {
  it("keeps the vertical padding between sections small (24 to 48px on a desktop, not 112)", () => {
    expect(padding("FeaturesSection.tsx")).toContain("lg:py-6");
    expect(padding("ProtectionSection.tsx")).toContain("lg:py-12");
    expect(padding("CreditCardsSection.tsx")).toContain("sm:py-10");
    expect(padding("BusinessPowerSection.tsx")).toContain("lg:py-6");
    for (const f of ["FeaturesSection.tsx", "ProtectionSection.tsx", "CreditCardsSection.tsx", "BusinessPowerSection.tsx"]) expect(padding(f), f).not.toMatch(/py-(14|16|20|24|28)\b/);
  });
  it("keeps the hero shorter than the original (670px) but not cramped: less padding, a smaller heading, and an image capped at 400px", () => {
    const hero = src("HeroSection.tsx");
    expect(hero).toContain("lg:pt-10 lg:pb-14"); expect(hero).not.toContain("lg:pb-24"); expect(hero).not.toContain("max-h-[60vh]");
    expect(hero).toContain("max-h-[400px]"); expect(hero).toContain("lg:text-5xl");
  });
  it("keeps the violet section's heading to one line of 48px at most, with the cards in a three-across grid", () => {
    const f = src("FeaturesSection.tsx"); expect(f).toContain("lg:text-[2.5rem]"); expect(f).not.toContain("lg:text-7xl"); expect(f).toContain("md:grid-cols-3");
  });
  it("keeps the cross-border section's stat cards as slim rows and its map shorter", () => {
    const b = src("BusinessPowerSection.tsx"); expect(b).toContain('viewBox="0 38 400 226"'); expect(b).toContain("lg:w-3/5"); expect(b).not.toContain("size-16 shrink-0");
  });
});
